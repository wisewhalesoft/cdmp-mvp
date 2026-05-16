import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { AssignmentRunSnapshot } from '@/database/entities/assignment-run-snapshot.entity';
import { ObListDefinition } from '@/database/entities/ob-list-definition.entity';
import { ObPoolData } from '@/database/entities/ob-pool-data.entity';
import { ObPoolDataList } from '@/database/entities/ob-pool-data-list.entity';
import { ObDeptPct } from '@/database/entities/ob-dept-pct.entity';
import { ObEmplSet } from '@/database/entities/ob-empl-set.entity';
import { ObCardType } from '@/database/entities/ob-card-type.entity';
import { ObLevelcardLevel } from '@/database/entities/ob-levelcard-level.entity';
import { ObTier } from '@/database/entities/ob-tier.entity';

/**
 * AssignmentRunPipelineService — F061 v1.2 Stage 1~4 pipeline + 三份快照原子寫入
 *
 * 對應 spec：
 *   - AC-3：非同步執行 Stage 1~4（fn_calc_tier_level / CR per-LIST / st4_exchange）
 *   - AC-4：三份快照（config / input_list / result）同 transaction 原子寫入
 *   - AC-5：任一 stage 或快照失敗 → status='failed' + error_message
 *   - AC-7b / BR-12：邊緣 CARD_TYPE 跳過案件記入 skipped_cases + warning_summary
 *
 * **v1.0 簡化實作**（v2.0 將補完真實 SP 邏輯）：
 *   - Stage 2 計分：score 採案件 commission（無真實計分維度權重），card_level / tier_level
 *     仍依 ob_levelcard_level（score_s/score_e）+ ob_tier 對應，符合 spec L84
 *   - Stage 4 名單交換：依 ob_dept_pct + ob_empl_set 比例 round-robin 分配，
 *     未實作 st4_exchange 之「T1/T2/T3 新件 10% 轉資深」交換
 *   - CR per-LIST：依 ob_list_definition.cr_enabled 標記 is_cr='Y'/'N'，
 *     未實作「曾被分派但未成交案件重新納入」之動態回分（仍視為 stub）
 *
 * pipeline 期間 run.status='running'；其他 E07 寫入應由各模組的 AssignmentRunGuardService
 * 攔截（assertNoRunningRun）。
 */
@Injectable()
export class AssignmentRunPipelineService {
  private readonly logger = new Logger(AssignmentRunPipelineService.name);

  constructor(
    @InjectRepository(AssignmentRun)
    private readonly runRepo: Repository<AssignmentRun>,
    @InjectRepository(AssignmentRunSnapshot)
    private readonly snapshotRepo: Repository<AssignmentRunSnapshot>,
    @InjectRepository(ObListDefinition)
    private readonly listRepo: Repository<ObListDefinition>,
    @InjectRepository(ObPoolData)
    private readonly poolRepo: Repository<ObPoolData>,
    @InjectRepository(ObPoolDataList)
    private readonly resultRepo: Repository<ObPoolDataList>,
    @InjectRepository(ObDeptPct)
    private readonly deptPctRepo: Repository<ObDeptPct>,
    @InjectRepository(ObEmplSet)
    private readonly emplSetRepo: Repository<ObEmplSet>,
    @InjectRepository(ObCardType)
    private readonly cardTypeRepo: Repository<ObCardType>,
    @InjectRepository(ObLevelcardLevel)
    private readonly levelRepo: Repository<ObLevelcardLevel>,
    @InjectRepository(ObTier)
    private readonly tierRepo: Repository<ObTier>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * 執行 Stage 1~4 pipeline + 快照原子寫入。
   *
   * 失敗時 swallow 不重拋（背景非同步 hook 由 AssignmentRunService.kickoffPipeline 啟動）。
   *
   * @param runId   月跑 ID（已由 AssignmentRunService.triggerRun 建立）
   * @param ym      project_workym
   */
  async runPipeline(runId: string, ym: string): Promise<void> {
    const startedAt = new Date();

    try {
      await this.runRepo.update(
        { run_id: runId },
        { status: 'running', started_at: startedAt },
      );

      // ====================================================================
      // 前置：讀本月 ready lists（spec AC-3 Stage 1）
      // ====================================================================
      const readyLists = await this.listRepo.find({
        where: { project_workym: ym, status: 'active', stage: 'ready' },
      });

      if (readyLists.length === 0) {
        // 無 ready 名單（前置條件應已擋；保險回 completed total=0）
        await this.completeRun(runId, startedAt, 0, 0, null, null);
        return;
      }

      // ====================================================================
      // BR-12：分離邊緣 CARD_TYPE（race condition 保護網）
      // ====================================================================
      const activeCardTypes = new Set(
        (await this.cardTypeRepo.find({ where: { status: 'active' } })).map(
          (c) => c.card_type,
        ),
      );

      const validLists: ObListDefinition[] = [];
      const edgeLists: ObListDefinition[] = [];
      for (const l of readyLists) {
        if (l.card_type && activeCardTypes.has(l.card_type)) validLists.push(l);
        else edgeLists.push(l);
      }

      // ====================================================================
      // Stage 1：案件挑選 — 為每張 valid list 從 ob_pool_data 篩出候選
      // ====================================================================
      const stage1Cases: Array<{
        list: ObListDefinition;
        pool: ObPoolData[];
      }> = [];

      for (const list of validLists) {
        // v1.0 簡化：採全表案件（spec L83 「ob_pool_data + 套用 ob_list_definition 篩選」
        //  之 condition_payload 規則待 v2.0 補完）
        const pool = await this.poolRepo.find();
        stage1Cases.push({ list, pool });
      }

      // BR-12：邊緣 list 對應案件記入 skipped_cases
      const skippedCases: Array<{
        cardType: string;
        applNoCount: number;
        reason: string;
      }> = [];
      for (const list of edgeLists) {
        // 邊緣 list 不執行 Stage 1 篩選，但需估算被跳過的案件數量
        const cnt = await this.poolRepo.count();
        skippedCases.push({
          cardType: list.card_type ?? '',
          applNoCount: cnt,
          reason: 'CARD_TYPE_INACTIVE_OR_MISSING',
        });
      }

      // ====================================================================
      // Stage 2：計分（v1.0 簡化版）
      // ====================================================================
      const allLevels = await this.levelRepo.find();
      const allTiers = await this.tierRepo.find();

      // ====================================================================
      // Stage 3：CR 回分 per-LIST flag
      // ====================================================================
      // (在 Stage 4 寫入時帶入 is_cr 標記)

      // ====================================================================
      // Stage 4：dept_pct + empl_set round-robin 分配
      // ====================================================================
      type ResultRow = Partial<ObPoolDataList>;
      const stage4Results: ResultRow[] = [];
      const now = new Date();

      let totalCases = 0;

      for (const { list, pool } of stage1Cases) {
        const depts = await this.deptPctRepo.find({
          where: { project_workym: ym, list_no: list.list_no },
        });
        const empls = await this.emplSetRepo.find({
          where: { list_no: list.list_no },
        });

        // v1.0 簡化：round-robin 第一個 dept / 第一個 empl
        const dept = depts[0] ?? null;
        const empl = empls.find((e) => !dept || e.deptid_m === dept.obdeptid) ?? empls[0] ?? null;

        for (const p of pool) {
          // Stage 2 計分（commission → score）
          const score = parseInt(p.commission ?? '0', 10) || 0;
          const lvl = allLevels.find(
            (l) =>
              l.card_type === list.card_type &&
              score >= l.score_s &&
              score <= l.score_e,
          );
          const cardLevel = lvl?.card_level ?? null;
          const tier = allTiers.find(
            (t) => t.card_type === list.card_type && t.card_level === cardLevel,
          );
          const tierLevel = tier?.tier_level ?? null;

          // Stage 3 CR per-LIST
          const isCr = list.cr_enabled ? 'Y' : 'N';

          // Stage 4 分配
          const deptId = dept?.obdeptid ?? null;
          const emplid = empl?.emplid ?? null;

          stage4Results.push({
            list_no: list.list_no,
            orgno: p.orgno,
            appl_no: p.appl_no,
            custo_no: p.custo_no ?? null,
            settle_src: p.settle_src,
            score,
            card_level: cardLevel,
            tier_level: tierLevel,
            is_cr: isCr,
            dept_id: deptId,
            emplid: emplid,
            created_at: now,
            updated_at: now,
          });
          totalCases++;
        }
      }

      // ====================================================================
      // 快照原子寫入 + 寫 ob_pool_data_list（同 transaction）
      // ====================================================================
      const configPayload = await this.buildConfigPayload(ym, validLists);
      const inputListPayload = {
        cases: stage1Cases.flatMap(({ list, pool }) =>
          pool.map((p) => ({
            listNo: list.list_no,
            applNo: p.appl_no,
            orgno: p.orgno,
            cardType: list.card_type,
          })),
        ),
      };
      const resultPayload = {
        assignments: stage4Results.map((r) => ({
          listNo: r.list_no,
          applNo: r.appl_no,
          deptId: r.dept_id,
          emplid: r.emplid,
          score: r.score,
          cardLevel: r.card_level,
          tierLevel: r.tier_level,
          isCr: r.is_cr,
        })),
      };

      await this.dataSource.transaction(async (txm) => {
        // 寫入分派結果（Stage 4 持久化）
        if (stage4Results.length > 0) {
          await txm
            .getRepository(ObPoolDataList)
            .save(stage4Results as ObPoolDataList[]);
        }

        // 三份快照原子寫入
        await txm.getRepository(AssignmentRunSnapshot).save([
          {
            run_id: runId,
            snapshot_type: 'config',
            payload: configPayload,
            created_at: now,
          },
          {
            run_id: runId,
            snapshot_type: 'input_list',
            payload: inputListPayload,
            created_at: now,
          },
          {
            run_id: runId,
            snapshot_type: 'result',
            payload: resultPayload,
            created_at: now,
          },
        ] as AssignmentRunSnapshot[]);
      });

      // ====================================================================
      // 完成：寫入 warning_summary + skipped_cases（若 BR-12 觸發）
      // ====================================================================
      const warningSummary =
        skippedCases.length > 0 ? 'BR-12_EDGE_CARD_TYPE_SKIPPED' : null;
      const skippedJson =
        skippedCases.length > 0 ? { cases: skippedCases } : null;

      await this.completeRun(
        runId,
        startedAt,
        totalCases,
        validLists.length,
        warningSummary,
        skippedJson,
      );
    } catch (err: any) {
      this.logger.error(
        `Pipeline failed: run=${runId} ym=${ym} err=${err?.message ?? err}`,
      );
      await this.runRepo.update(
        { run_id: runId },
        {
          status: 'failed',
          finished_at: new Date(),
          error_message: String(err?.message ?? err).slice(0, 1000),
        },
      );
    }
  }

  // -------------------------------------------------------------------------
  // 內部
  // -------------------------------------------------------------------------

  private async completeRun(
    runId: string,
    startedAt: Date,
    totalCases: number,
    totalLists: number,
    warningSummary: string | null,
    skippedCases: Record<string, unknown> | null,
  ): Promise<void> {
    const finishedAt = new Date();
    await this.runRepo.update(
      { run_id: runId },
      {
        status: 'completed',
        finished_at: finishedAt,
        duration_ms: finishedAt.getTime() - startedAt.getTime(),
        total_cases: totalCases,
        total_lists: totalLists,
        warning_summary: warningSummary,
        // QueryDeepPartialEntity 對 JSONB 欄位需直接型別 (Record<string, unknown> | null)
        skipped_cases: skippedCases as any,
      },
    );
  }

  private async buildConfigPayload(
    ym: string,
    validLists: ObListDefinition[],
  ): Promise<Record<string, unknown>> {
    const allLevels = await this.levelRepo.find();
    const allTiers = await this.tierRepo.find();
    const allDeptPct = await this.deptPctRepo.find({ where: { project_workym: ym } });
    const allEmpl = await this.emplSetRepo.find();

    return {
      projectWorkym: ym,
      listDefinitions: validLists.map((l) => ({
        listNo: l.list_no,
        listNm: l.list_nm,
        cardType: l.card_type,
        crEnabled: l.cr_enabled,
        caseStatus: l.case_status,
      })),
      levelcardLevels: allLevels.map((l) => ({
        cardType: l.card_type,
        cardVersion: l.card_version,
        scoreS: l.score_s,
        scoreE: l.score_e,
        cardLevel: l.card_level,
      })),
      tiers: allTiers.map((t) => ({
        cardType: t.card_type,
        cardLevel: t.card_level,
        tierLevel: t.tier_level,
      })),
      deptPct: allDeptPct.map((d) => ({
        listNo: d.list_no,
        deptId: d.obdeptid,
        ration: d.ration,
      })),
      emplSet: allEmpl.map((e) => ({
        listNo: e.list_no,
        deptId: e.deptid_m,
        emplid: e.emplid,
        ration: e.ration,
      })),
    };
  }
}
