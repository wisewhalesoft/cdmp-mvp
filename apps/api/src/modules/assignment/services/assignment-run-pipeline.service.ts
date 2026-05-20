import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { AssignmentRunSnapshot } from '@/database/entities/assignment-run-snapshot.entity';
import { ObListDefinition } from '@/database/entities/ob-list-definition.entity';
import { ObPoolData } from '@/database/entities/ob-pool-data.entity';
import { ObPoolDataList } from '@/database/entities/ob-pool-data-list.entity';
import { buildStage1WhereConditions } from '@/modules/assignment/stage1/stage1-query-composer';
import { ObDeptPct } from '@/database/entities/ob-dept-pct.entity';
import { ObEmplSet } from '@/database/entities/ob-empl-set.entity';
import { ObCardType } from '@/database/entities/ob-card-type.entity';
import { ObLevelcardVersion } from '@/database/entities/ob-levelcard-version.entity';
import { ObLevelcardColumn } from '@/database/entities/ob-levelcard-column.entity';
import { ObLevelcardScore } from '@/database/entities/ob-levelcard-score.entity';
import { ObLevelcardLevel } from '@/database/entities/ob-levelcard-level.entity';
import { ObTier } from '@/database/entities/ob-tier.entity';
import {
  IntegrityIssue,
  ScoringIntegrityCheckService,
} from '@/modules/assignment-scoring/services/scoring-integrity-check.service';

/**
 * AssignmentRunPipelineService — F061 Stage 1~4 pipeline + 三份快照原子寫入
 *
 * 對應 spec：
 *   - AC-3：非同步執行 Stage 1~4（fn_calc_tier_level / CR per-LIST / st4_exchange）
 *   - AC-4：三份快照（config / input_list / result）同 transaction 原子寫入
 *   - AC-5：任一 stage 或快照失敗 → status='failed' + error_message
 *   - AC-7b / BR-12：邊緣 CARD_TYPE 跳過案件記入 skipped_cases + warning_summary
 *
 * **v1.0 簡化實作（預設）**：
 *   - Stage 2 計分：score 採案件 commission 簡化
 *   - Stage 4 名單交換：依 dept_pct + empl_set round-robin 第一筆
 *   - CR per-LIST：僅依 cr_enabled 標 is_cr Y/N（無歷史動態回分）
 *
 * **v2.0 真實邏輯（feature flag `ASSIGNMENT_PIPELINE_V2=true`）**：
 *   - Stage 2 真實計分：讀 ob_levelcard_version（active）+ ob_levelcard_column（active）
 *     + ob_levelcard_score（區間 / 類別權重）累加 score；score → ob_levelcard_level
 *     → card_level → ob_tier → tier_level
 *   - Stage 4 真實 st4_exchange：T1/T2 案件 10%（向上取整，保底 1）轉給該部門 T3 員工
 *     （員工 tier 標記透過 ob_empl_set.prod_type='TIER:T1|T2|T3' 暫存，待 v2.1 升至 user metadata）
 *   - Stage 3 真實 CR 動態回分：cr_enabled=true 時，讀歷史 result snapshot 找曾被分派
 *     但未成交（status='PENDING' / 無 status）案件，本月重新納入（is_cr='Y'）；新件 is_cr='N'
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
    @InjectRepository(ObLevelcardVersion)
    private readonly versionRepo: Repository<ObLevelcardVersion>,
    @InjectRepository(ObLevelcardColumn)
    private readonly columnRepo: Repository<ObLevelcardColumn>,
    @InjectRepository(ObLevelcardScore)
    private readonly scoreRepo: Repository<ObLevelcardScore>,
    @InjectRepository(ObLevelcardLevel)
    private readonly levelRepo: Repository<ObLevelcardLevel>,
    @InjectRepository(ObTier)
    private readonly tierRepo: Repository<ObTier>,
    private readonly dataSource: DataSource,
    /**
     * F061 v1.3 BR-13：Stage 2 前 soft check（解耦自 fn_calc_tier_level）。
     * Optional 標記：少數 unit test 之 TestingModule 未提供本 service，落入 skip 路徑。
     */
    @Optional()
    private readonly integrityCheckService?: ScoringIntegrityCheckService,
  ) {}

  /**
   * 執行 Stage 1~4 pipeline + 快照原子寫入。
   * 失敗時 swallow 不重拋（背景非同步 hook 由 AssignmentRunService.kickoffPipeline 啟動）。
   */
  async runPipeline(runId: string, ym: string): Promise<void> {
    const startedAt = new Date();
    const useV2 = process.env.ASSIGNMENT_PIPELINE_V2 === 'true';

    try {
      await this.runRepo.update(
        { run_id: runId },
        { status: 'running', started_at: startedAt },
      );

      const readyLists = await this.listRepo.find({
        where: { project_workym: ym, status: 'active', stage: 'ready' },
      });

      if (readyLists.length === 0) {
        await this.completeRun(runId, startedAt, 0, 0, null, null);
        return;
      }

      // BR-12：分離邊緣 CARD_TYPE
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

      // Stage 1：案件挑選（Phase 5b / AD-E07-18 §18.5 — 動態 SQL）
      //   - 對每個 validList 個別呼叫 runStage1ForList
      //   - skipReason='EMPTY_CONDITIONS' → 不撈 pool + Logger.warn（§18.5.2）
      //   - 否則 createQueryBuilder().where(fragment, params).getMany()
      const stage1Cases: Array<{ list: ObListDefinition; pool: ObPoolData[] }> = [];
      const stage1SkippedLists: Array<{
        listNo: string;
        listName: string;
        reason: 'EMPTY_CONDITIONS';
      }> = [];

      for (const list of validLists) {
        const result = await this.runStage1ForList(list);
        if (result.skipped) {
          stage1SkippedLists.push({
            listNo: list.list_no,
            listName: list.list_nm,
            reason: 'EMPTY_CONDITIONS',
          });
          continue;
        }
        stage1Cases.push({ list, pool: result.pool });
      }

      const skippedCases: Array<{
        cardType: string;
        applNoCount: number;
        reason: string;
      }> = [];
      for (const list of edgeLists) {
        const cnt = await this.poolRepo.count();
        skippedCases.push({
          cardType: list.card_type ?? '',
          applNoCount: cnt,
          reason: 'CARD_TYPE_INACTIVE_OR_MISSING',
        });
      }

      // F061 v1.3 BR-13 / AC-7c：Stage 2 前 ScoringIntegrityCheckService soft check
      // 不嵌入 fn_calc_tier_level；不阻擋月跑；逐個 valid CARD_TYPE 掃描
      const integrityIssues: IntegrityIssue[] = [];
      const integrityWarningTypes = new Set<string>();
      if (this.integrityCheckService) {
        const checkedKey = new Set<string>();
        for (const l of validLists) {
          if (!l.card_type) continue;
          // 取該 CARD_TYPE 的 active 計分版本
          const ver = await this.versionRepo.findOne({
            where: { card_type: l.card_type as any, status: 'active' as any },
          });
          if (!ver) continue;
          const key = `${l.card_type}|${ver.card_version}`;
          if (checkedKey.has(key)) continue;
          checkedKey.add(key);
          const result = await this.integrityCheckService.checkIntegrity(
            l.card_type,
            ver.card_version ?? 1,
            { runId, affectedRowCount: 0 },
          );
          for (const i of result.issues) {
            integrityIssues.push(i);
            integrityWarningTypes.add(i.type);
          }
        }
      }

      // Stage 2 / 3 / 4 — 依 v1 / v2 分支執行
      type ResultRow = Partial<ObPoolDataList>;
      const stage4Results: ResultRow[] = useV2
        ? await this.executeV2(stage1Cases, ym)
        : await this.executeV1(stage1Cases, ym);

      const totalCases = stage4Results.length;

      // 三份快照 + ob_pool_data_list 原子寫入
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
          orgno: r.orgno,
          deptId: r.dept_id,
          emplid: r.emplid,
          score: r.score,
          cardLevel: r.card_level,
          tierLevel: r.tier_level,
          isCr: r.is_cr,
          status: 'PENDING', // v2.0 預設待回收（業務回填後改 SUCCESS / FAILED）
        })),
      };

      const now = new Date();
      await this.dataSource.transaction(async (txm) => {
        if (stage4Results.length > 0) {
          await txm
            .getRepository(ObPoolDataList)
            .save(stage4Results as ObPoolDataList[]);
        }
        await txm.getRepository(AssignmentRunSnapshot).save([
          { run_id: runId, snapshot_type: 'config', payload: configPayload, created_at: now },
          { run_id: runId, snapshot_type: 'input_list', payload: inputListPayload, created_at: now },
          { run_id: runId, snapshot_type: 'result', payload: resultPayload, created_at: now },
        ] as AssignmentRunSnapshot[]);
      });

      // 組合 warning_summary（多警告碼以逗號分隔 — F061 v1.3 BR-13）
      const warningCodes: string[] = [];
      if (skippedCases.length > 0) warningCodes.push('BR-12_EDGE_CARD_TYPE_SKIPPED');
      if (integrityWarningTypes.has('ALL_SCORES_EMPTY')) {
        warningCodes.push('ALL_SCORES_EMPTY');
      }
      // Phase 5b / §18.5.2：empty conditions skip
      if (stage1SkippedLists.length > 0) {
        warningCodes.push('EMPTY_CONDITIONS_SKIPPED');
      }
      const warningSummary = warningCodes.length > 0 ? warningCodes.join(',') : null;

      // skipped_cases 合併 edge CARD_TYPE / ALL_SCORES_EMPTY / EMPTY_CONDITIONS 三類
      const integritySkipped = integrityIssues
        .filter((i) => i.type === 'ALL_SCORES_EMPTY')
        .map((i) => ({
          cardType: i.cardType,
          columnName: i.columnName,
          affectedApplNoCount: i.violatedRowCount ?? 0,
          reason: i.type,
        }));
      // Phase 5b：§18.5.2 skip 名單 → lists 陣列（status='skipped'）
      const skippedListsPayload = stage1SkippedLists.map((l) => ({
        listNo: l.listNo,
        listName: l.listName,
        status: 'skipped' as const,
        reason: l.reason,
      }));
      const skippedJson =
        skippedCases.length > 0 ||
        integritySkipped.length > 0 ||
        skippedListsPayload.length > 0
          ? {
              cases: skippedCases,
              integrityIssues: integritySkipped,
              lists: skippedListsPayload,
            }
          : null;

      // R-5B-08：total_lists 維持 validLists.length 不扣 skip（以 skipped_cases.lists 表達）
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

  // =========================================================================
  // v1.0 簡化邏輯（向後相容）
  // =========================================================================
  private async executeV1(
    stage1Cases: Array<{ list: ObListDefinition; pool: ObPoolData[] }>,
    ym: string,
  ): Promise<Partial<ObPoolDataList>[]> {
    const allLevels = await this.levelRepo.find();
    const allTiers = await this.tierRepo.find();
    const now = new Date();
    const out: Partial<ObPoolDataList>[] = [];

    for (const { list, pool } of stage1Cases) {
      const depts = await this.deptPctRepo.find({
        where: { project_workym: ym, list_no: list.list_no },
      });
      const empls = await this.emplSetRepo.find({ where: { list_no: list.list_no } });
      const dept = depts[0] ?? null;
      const empl = empls.find((e) => !dept || e.deptid_m === dept.obdeptid) ?? empls[0] ?? null;

      for (const p of pool) {
        const score = parseInt(p.commission ?? '0', 10) || 0;
        const lvl = allLevels.find(
          (l) => l.card_type === list.card_type && score >= l.score_s && score <= l.score_e,
        );
        const cardLevel = lvl?.card_level ?? null;
        const tier = allTiers.find(
          (t) => t.card_type === list.card_type && t.card_level === cardLevel,
        );
        const tierLevel = tier?.tier_level ?? null;
        const isCr = list.cr_enabled ? 'Y' : 'N';

        out.push({
          list_no: list.list_no,
          orgno: p.orgno,
          appl_no: p.appl_no,
          custo_no: p.custo_no ?? null,
          settle_src: p.settle_src,
          score,
          card_level: cardLevel,
          tier_level: tierLevel,
          is_cr: isCr,
          dept_id: dept?.obdeptid ?? null,
          emplid: empl?.emplid ?? null,
          created_at: now,
          updated_at: now,
        });
      }
    }
    return out;
  }

  // =========================================================================
  // v2.0 真實邏輯：Stage 2 計分 + Stage 3 CR 動態回分 + Stage 4 st4_exchange
  // =========================================================================
  private async executeV2(
    stage1Cases: Array<{ list: ObListDefinition; pool: ObPoolData[] }>,
    ym: string,
  ): Promise<Partial<ObPoolDataList>[]> {
    const allTiers = await this.tierRepo.find();
    const allEmpl = await this.emplSetRepo.find();
    const allColumns = await this.columnRepo.find();
    const allScores = await this.scoreRepo.find();
    const allLevels = await this.levelRepo.find();
    const allVersions = await this.versionRepo.find({ where: { status: 'active' } });

    // 員工 tier 標記表：透過 ob_empl_set.prod_type='TIER:T1|T2|T3' 暫存
    // v2.1 升級後改讀 user.metadata（OQ-E07-26）
    const emplTier = new Map<string, string>();
    for (const e of allEmpl) {
      if (e.prod_type?.startsWith('TIER:')) {
        emplTier.set(e.emplid, e.prod_type.slice(5));
      }
    }

    const now = new Date();
    const out: Partial<ObPoolDataList>[] = [];

    // ----- 預先收集 CR 候選（cr_enabled list 才查歷史 snapshot）-----
    const crEnabledListNos = stage1Cases
      .filter(({ list }) => list.cr_enabled)
      .map(({ list }) => list.list_no);

    const crApplPerList = crEnabledListNos.length
      ? await this.collectCrCandidates(ym)
      : new Set<string>();

    for (const { list, pool } of stage1Cases) {
      // ===== Stage 2 v2.0：真實計分 =====
      const activeVer = allVersions.find((v) => v.card_type === list.card_type);
      const activeColumns = activeVer
        ? allColumns.filter(
            (c) =>
              c.card_type === list.card_type &&
              c.card_version === activeVer.card_version &&
              c.status === 'active',
          )
        : [];

      const scoredPool = pool.map((p) => {
        const score = activeVer && activeVer.card_version !== null
          ? this.computeScore(p, list.card_type ?? '', activeVer.card_version, activeColumns, allScores)
          : null;
        const lvl = activeVer && score !== null
          ? allLevels.find(
              (l) =>
                l.card_type === list.card_type &&
                l.card_version === activeVer.card_version &&
                score >= l.score_s &&
                score <= l.score_e,
            )
          : null;
        const cardLevel = lvl?.card_level ?? null;
        const tier = allTiers.find(
          (t) => t.card_type === list.card_type && t.card_level === cardLevel,
        ) ?? (cardLevel === null
          ? allTiers.find((t) => t.card_type === list.card_type && t.card_level === null)
          : undefined);
        const tierLevel = tier?.tier_level ?? null;
        return { pool: p, score, cardLevel, tierLevel };
      });

      // ===== Stage 4 v2.0：st4_exchange（T1/T2 → T3 10% 轉資深）=====
      const dept = (
        await this.deptPctRepo.find({
          where: { project_workym: ym, list_no: list.list_no },
        })
      )[0] ?? null;
      const listEmpls = allEmpl.filter(
        (e) => e.list_no === list.list_no && (!dept || e.deptid_m === dept.obdeptid),
      );
      const newEmpls = listEmpls.filter((e) => emplTier.get(e.emplid) !== 'T3');
      const seniorEmpls = listEmpls.filter((e) => emplTier.get(e.emplid) === 'T3');
      const defaultEmpl = newEmpls[0] ?? listEmpls[0] ?? null;

      // 分組：T1/T2 案件可被交換；T3 案件不交換
      const exchangeableIdx = scoredPool
        .map((s, i) => ({ s, i }))
        .filter(({ s }) => s.tierLevel === 'T1' || s.tierLevel === 'T2')
        .map(({ i }) => i);

      // 10% 向上取整（保底 1）
      const exchangeCount =
        exchangeableIdx.length > 0 && seniorEmpls.length > 0
          ? Math.max(1, Math.ceil(exchangeableIdx.length * 0.1))
          : 0;
      const exchangeSet = new Set(exchangeableIdx.slice(0, exchangeCount));

      for (let i = 0; i < scoredPool.length; i++) {
        const { pool: p, score, cardLevel, tierLevel } = scoredPool[i];

        // CR 標記：cr_enabled + 該案件在歷史快照中
        const isCr =
          list.cr_enabled && crApplPerList.has(`${p.orgno}:${p.appl_no}`) ? 'Y' : 'N';

        // 員工分配：交換池 → senior；其餘 → defaultEmpl
        const empl = exchangeSet.has(i) ? seniorEmpls[0] : defaultEmpl;

        out.push({
          list_no: list.list_no,
          orgno: p.orgno,
          appl_no: p.appl_no,
          custo_no: p.custo_no ?? null,
          settle_src: p.settle_src,
          score,
          card_level: cardLevel,
          tier_level: tierLevel,
          is_cr: isCr,
          dept_id: dept?.obdeptid ?? null,
          emplid: empl?.emplid ?? null,
          created_at: now,
          updated_at: now,
        });
      }
    }
    return out;
  }

  /**
   * v2.0 Stage 2 純 JS 等價計分：依 column_name 從 pool row 取值，對應 score row 累加。
   *
   * 此處為簡化版（B4 留項），僅實作架構 spec L3542 表中可直接從 ob_pool_data 取的欄位：
   *   - LIST_MONTH → pool.month_cnt（缺值 25）
   *   - PROJECT_TP → pool.spec_tp（缺值 '01'）
   *   - CAR_YEAR   → CURRENT_YEAR - pool.year_produ（缺值 0）
   *   - 其餘客戶屬性（CUS_SEX / CAREA / AGE 等）需 join customer_core，留待 v2.1 補完
   *
   * 對應規則：
   *   - 區間型 score（level2_s / level2_e 有值）：value 落在區間內 → 取分
   *   - 類別型 score（level1 有值）：value 字串相等 → 取分
   */
  private computeScore(
    pool: ObPoolData,
    cardType: string,
    cardVersion: number,
    activeColumns: ObLevelcardColumn[],
    allScores: ObLevelcardScore[],
  ): number {
    let total = 0;
    for (const col of activeColumns) {
      if (!col.column_name) continue;
      const value = this.resolveColumnValue(pool, col.column_name);
      const scoreRows = allScores.filter(
        (s) =>
          s.card_type === cardType &&
          s.card_version === cardVersion &&
          s.column_name === col.column_name,
      );
      for (const sr of scoreRows) {
        if (sr.level1 !== null && sr.level1 !== undefined) {
          // 類別型
          if (String(value) === String(sr.level1).trim()) {
            total += sr.score;
            break;
          }
        } else if (sr.level2_s !== null && sr.level2_e !== null) {
          // 區間型
          const v = Number(value);
          const lo = Number(sr.level2_s);
          const hi = Number(sr.level2_e);
          if (!Number.isNaN(v) && v >= lo && v <= hi) {
            total += sr.score;
            break;
          }
        }
      }
    }
    return total;
  }

  /**
   * 依 column_name 從 ob_pool_data row 取值（含 default）。
   * 對應 AD-E07-10-L 規則表（可從 pool 直接取的欄位子集）。
   */
  private resolveColumnValue(pool: ObPoolData, columnName: string): string | number {
    switch (columnName) {
      case 'LIST_MONTH':
        return pool.month_cnt ?? 25;
      case 'PROJECT_TP':
        return pool.spec_tp ?? '01';
      case 'CAR_YEAR': {
        const yp = pool.year_produ ? parseInt(pool.year_produ, 10) : null;
        return yp ? new Date().getFullYear() - yp : 0;
      }
      case 'COMMISSION':
        return pool.commission ? parseInt(pool.commission, 10) : 0;
      default:
        // 其他客戶屬性需 join customer_core，v2.1 補完；此處回傳空字串 → 不匹配
        return '';
    }
  }

  /**
   * v2.0 Stage 3：CR 動態回分 — 蒐集歷史 result snapshot 中曾被分派但未成交（PENDING / 無 status）
   * 的案件 key（`{orgno}:{appl_no}`）。
   *
   * 簡化版：掃描所有 status=completed 的歷史 run（早於本月 ym）的 result snapshot；
   * 未成交判斷：assignments[i].status === 'PENDING' 或 undefined。
   */
  private async collectCrCandidates(ym: string): Promise<Set<string>> {
    const result = new Set<string>();
    // 取所有歷史 completed run（project_workym < ym 字串比較即可：YYYYMM 字串遞增等價時序）
    const olderRuns = await this.runRepo
      .createQueryBuilder('r')
      .where('r.status = :status', { status: 'completed' })
      .andWhere('r.project_workym < :ym', { ym })
      .getMany();

    if (olderRuns.length === 0) return result;

    const runIds = olderRuns.map((r) => r.run_id);
    const snaps = await this.snapshotRepo
      .createQueryBuilder('s')
      .where('s.run_id IN (:...ids)', { ids: runIds })
      .andWhere('s.snapshot_type = :t', { t: 'result' })
      .getMany();

    for (const s of snaps) {
      const payload = s.payload as { assignments?: Array<{
        orgno?: string; applNo?: string; status?: string;
      }> } | null;
      if (!payload?.assignments) continue;
      for (const a of payload.assignments) {
        const status = a.status;
        const unsettled = status === undefined || status === null || status === 'PENDING';
        if (unsettled && a.orgno && a.applNo) {
          result.add(`${a.orgno}:${a.applNo}`);
        }
      }
    }
    return result;
  }

  // =========================================================================
  // 內部
  // =========================================================================

  /**
   * Phase 5b / AD-E07-18 §18.5：對單一 list 執行 Stage 1 動態 SQL 案件挑選。
   *
   * @returns
   *   - `{ skipped: true }`：composer 回 skipReason → 不撈 pool（已 logger.warn）
   *   - `{ skipped: false, pool }`：SQL 過濾後的 ob_pool_data 案件清單
   */
  private async runStage1ForList(
    list: ObListDefinition,
  ): Promise<{ skipped: true } | { skipped: false; pool: ObPoolData[] }> {
    const fragment = buildStage1WhereConditions(list);

    // 非阻擋型 warning 紀錄
    for (const w of fragment.warnings) {
      this.logger.warn(
        `[Stage1] composer warning list_no=${list.list_no} code=${w.code} column=${w.columnName ?? '-'} reason=${w.reason}`,
      );
    }

    // §18.5.2：空 conditions / wildcard 後零有效 fragment → skip
    if (fragment.skipReason === 'EMPTY_CONDITIONS') {
      this.logger.warn(
        `[Stage1] Skipping list ${list.list_no} (${list.list_nm}): empty conditions (backfilled empty or invalid state)`,
      );
      return { skipped: true };
    }

    // fragment.where 已保證非 null（skipReason=null 時必有 where）
    const pool = await this.poolRepo
      .createQueryBuilder('ob_pool_data')
      .where(fragment.where!, fragment.params)
      .getMany();
    return { skipped: false, pool };
  }

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
