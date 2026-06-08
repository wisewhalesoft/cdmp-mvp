import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { AssignmentRunSnapshot } from '@/database/entities/assignment-run-snapshot.entity';
import { ObListDefinition } from '@/database/entities/ob-list-definition.entity';
import { ObPoolData } from '@/database/entities/ob-pool-data.entity';
import { ObPoolDataList } from '@/database/entities/ob-pool-data-list.entity';
import { ObMonthlyRunResult } from '@/database/entities/ob-monthly-run-result.entity';
import { executeStage1Chain } from '@/modules/assignment/stage1/stage1-filter-chain';
import { runStage1SqlInsert } from '@/modules/assignment/stage1/stage1-sql-executor';
import {
  runStage2and3Sql,
  type Stage2to4ListContext,
} from '@/modules/assignment/stage1/stage2to4-sql-executor';
import { ObDeptPct } from '@/database/entities/ob-dept-pct.entity';
import { ObEmplSet } from '@/database/entities/ob-empl-set.entity';
import { ObCalendar } from '@/database/entities/ob-calendar.entity';
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
import { CancellationPoller } from '../queue/cancellation-poller';
import { RunCancelledException } from '../queue/run-cancelled.exception';
import {
  distributeStage3to4,
  buildWarningSummary,
  type RationCase,
  type DeptRation,
  type EmplRation,
  type RationWarning,
} from '@/modules/assignment/stage1/stage3to4-ration';
import { computeWorkingDayRatios } from '@/modules/assignment-list/stage0-estimate.service';
import { runStage3to4RationSql } from '@/modules/assignment/stage1/stage3to4-ration-sql';

/**
 * Stage 2~4 執行策略決策（Bug A 修復 / AD-E07-28）。
 *
 * - `pushdown`    ：PG SQL 下推（P3，Stage 1 INSERT + Stage 2~4 UPDATE，I-NOLOAD-01）。
 * - `v2Inmemory`  ：非 PG（SQLite 測試 / in-memory）真實計分 golden oracle（executeV2）。
 * - `v1Inmemory`  ：非 PG v1 簡化計分（executeV1，向後相容）。
 */
export type Stage2to4Strategy = 'pushdown' | 'v2Inmemory' | 'v1Inmemory';

/**
 * 依環境決定 Stage 2~4 執行策略（純函式，無副作用，供 unit 測試免真 PG）。
 *
 * **Bug A 修復（2026-06-04）**：PG **一律**走 SQL 下推（gate = `DB_TYPE==='postgres'`），
 * 與 `ASSIGNMENT_PIPELINE_V2` 無關。原 gate `useV2 && DB_TYPE==='postgres'` 在
 * 「PG + v2 未設」時落入壞掉的 v1-PG fallback（`executeV1(stage1Cases)`，但 PG 下 Stage 1 為
 * SQL INSERT 寫表、pool 為空 → 計分 0 筆、total_cases=0、score/tier/emplid 全 NULL）。
 * PG 模式並無「v1 簡化計分的 SQL 版」（P3 僅建 v2 真實版），故 PG 一律走 P3 真實計分下推。
 *
 * `ASSIGNMENT_PIPELINE_V2` 在 PG **已無意義**（@deprecated for PG）；僅非 PG in-memory 路徑用於
 * 選 v1 / v2（executeV1 / executeV2）。
 *
 * **Rollout 含意**：PG 一律 v2 真實計分 → F067 計分差異報告 + 業務簽核為「本重構 deploy 上 prod 的
 * GO/NO-GO 閘」（非每跑 flag）。
 */
export function resolveStage2to4Strategy(env: {
  DB_TYPE?: string;
  ASSIGNMENT_PIPELINE_V2?: string;
}): Stage2to4Strategy {
  if (env.DB_TYPE === 'postgres') return 'pushdown';
  return env.ASSIGNMENT_PIPELINE_V2 === 'true' ? 'v2Inmemory' : 'v1Inmemory';
}

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
 * **PG 一律 SQL 下推（Bug A 修復 / AD-E07-28，gate = `DB_TYPE='postgres'`）**：
 *   PG 模式不論 `ASSIGNMENT_PIPELINE_V2` 是否設定，一律走 P3 Stage 2~4 SQL 下推真實計分
 *   （Stage 1 INSERT + Stage 2~4 UPDATE，不 re-hydrate pool，I-NOLOAD-01）。
 *   `ASSIGNMENT_PIPELINE_V2` 在 PG **已 deprecated / 無意義**——僅非 PG（SQLite 測試 / in-memory）
 *   路徑用於選 v1（executeV1）/ v2（executeV2）。
 *   策略決策見 {@link resolveStage2to4Strategy}。
 *
 * **v2.0 真實邏輯（非 PG，feature flag `ASSIGNMENT_PIPELINE_V2=true`）**：
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

  /**
   * F101 / AD-E07-29 §4 OQ-F101-05：Stage 3/4/ASSIGNDAY 比例分派警告（per-run 暫存）。
   * 每次 runPipeline 開始清空；executeV2 / executeStage2to4Pushdown 收集；runPipeline 尾段
   * 寫入 assignment_run.skipped_cases.warnings[] + warning_summary。worker batchSize=1 + 單 worker
   * 序列化執行 → 同實例不會並行兩 run，instance 暫存安全。
   */
  private rationWarnings: RationWarning[] = [];

  constructor(
    @InjectRepository(AssignmentRun)
    private readonly runRepo: Repository<AssignmentRun>,
    @InjectRepository(AssignmentRunSnapshot)
    private readonly snapshotRepo: Repository<AssignmentRunSnapshot>,
    @InjectRepository(ObListDefinition)
    private readonly listRepo: Repository<ObListDefinition>,
    @InjectRepository(ObPoolData)
    private readonly poolRepo: Repository<ObPoolData>,
    /**
     * F091 近 3 個月去重來源（ETL 單一來源；F094 切換後仍只讀本表，不寫入）。
     * 月跑提案改寫入 ob_monthly_run_result（resultRepo），不再寫 ob_pool_data_list。
     */
    @InjectRepository(ObPoolDataList)
    private readonly poolDataListRepo: Repository<ObPoolDataList>,
    /**
     * F094 / AD-E07-25：月跑 Stage 1~4 分派提案結果寫入目標（取代 ob_pool_data_list）。
     */
    @InjectRepository(ObMonthlyRunResult)
    private readonly resultRepo: Repository<ObMonthlyRunResult>,
    @InjectRepository(ObDeptPct)
    private readonly deptPctRepo: Repository<ObDeptPct>,
    @InjectRepository(ObEmplSet)
    private readonly emplSetRepo: Repository<ObEmplSet>,
    /**
     * F101 / AD-E07-29 §3.4：Stage 4 ASSIGNDAY 工作日來源（複用 computeWorkingDayRatios，
     * 與 Stage 0 試算 calculateDailyEstimate 同算法，I-RUN-EST-01）。
     */
    @InjectRepository(ObCalendar)
    private readonly calendarRepo: Repository<ObCalendar>,
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
    /**
     * F098 / AD-E07-28 §9.3 / AC-5：worker 內取消輪詢器。於可中斷邊界（list 之間 /
     * Stage 之間）查 status，被取消（標 failed）則拋 RunCancelledException 提早結束。
     * @Optional：API 程序 / 舊 pipeline unit test 未提供時，pipeline 行為與 P1 前一致（不檢查取消）。
     */
    @Optional()
    private readonly cancellationPoller?: CancellationPoller,
  ) {}

  /**
   * 執行 Stage 1~4 pipeline + 快照原子寫入。
   * 失敗時 swallow 不重拋（F098 P1 起由 cdmp-worker 之 RunQueueConsumer 呼叫；
   * 配合 retryLimit=0，pipeline 內部已標 status='failed'，handler 視為已處理不重派）。
   */
  async runPipeline(runId: string, ym: string): Promise<void> {
    const startedAt = new Date();
    // F101：清空上一 run 之比例分派警告暫存。
    this.rationWarnings = [];
    // Bug A 修復（AD-E07-28）：PG 一律 Stage 2~4 SQL 下推（gate = DB_TYPE='postgres'，與
    //   P2 Stage 1 下推同 gate）；非 PG（SQLite 測試 / in-memory）依 ASSIGNMENT_PIPELINE_V2 選
    //   v1（executeV1）/ v2（executeV2）。視窗函式 / SUM(CASE…) / customer_core LEFT JOIN /
    //   EXISTS 在 SQLite 不具代表性（I-PORT-01）。
    const strategy = resolveStage2to4Strategy({
      DB_TYPE: process.env.DB_TYPE,
      ASSIGNMENT_PIPELINE_V2: process.env.ASSIGNMENT_PIPELINE_V2,
    });
    const useStage2to4Pushdown = strategy === 'pushdown';

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

      // F091 / AD-E07-22：workdt = PROJECT_WORKYM + '01'（去重視窗 + 年資特殊 DELETE 取當年）
      const workdt = parseWorkdt(ym);

      // F100 P3 pushdown：Stage 1 已寫入 ob_monthly_run_result 之 list（inserted>0），
      //   供 Stage 2~4 SQL 逐 list UPDATE（不 re-hydrate pool 回 heap，I-NOLOAD-01）。
      const stage1WrittenLists: Array<{ list: ObListDefinition; inserted: number }> = [];

      for (const list of validLists) {
        // F098 AC-5 / A-2：list 邊界為可中斷點 — 處理下一份 list 前查是否已被取消
        await this.checkCancelled(runId);
        const result = await this.runStage1ForList(
          list,
          workdt,
          runId,
          useStage2to4Pushdown,
        );
        if (result.skipped) {
          stage1SkippedLists.push({
            listNo: list.list_no,
            listName: list.list_nm,
            reason: 'EMPTY_CONDITIONS',
          });
          continue;
        }
        if (useStage2to4Pushdown) {
          // 下推路徑：Stage 1 已 INSERT 列，不 re-hydrate pool（pool 為空陣列佔位）。
          stage1WrittenLists.push({ list, inserted: result.inserted });
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

      // F098 AC-5 / A-2：Stage 之間為可中斷點 — 進入 Stage 2~4 計分前查是否已被取消
      await this.checkCancelled(runId);

      // Stage 2 / 3 / 4 — 依 v1 / v2 / P3 SQL 下推分支執行
      // F094：回傳型別由 Partial<ObPoolDataList>[] 改為 Partial<ObMonthlyRunResult>[]，每列帶 run_id
      type ResultRow = Partial<ObMonthlyRunResult>;
      let stage4Results: ResultRow[];
      // F100 P3：下推路徑之 Stage 2~4 已直接 UPDATE ob_monthly_run_result（無 heap 物化）；
      //   stage4ResultsPersisted=true → 後段不再 save()（避免雙寫 / 覆寫已下推之計分）。
      let stage4ResultsPersisted = false;
      if (strategy === 'pushdown') {
        stage4Results = await this.executeStage2to4Pushdown(
          stage1WrittenLists,
          ym,
          runId,
        );
        stage4ResultsPersisted = true;
      } else if (strategy === 'v2Inmemory') {
        stage4Results = await this.executeV2(stage1Cases, ym, runId);
      } else {
        stage4Results = await this.executeV1(stage1Cases, ym, runId);
      }

      // Bug A 修復：下推路徑 total_cases 改取 SQL COUNT（resultRepo.count by run_id），
      //   不靠 stage4Results.length（下推路徑該陣列現為快照用之有界讀回，且全載違反 I-NOLOAD）。
      //   非 PG（in-memory）路徑 stage4Results 即記憶體內全列 → .length 即真實筆數。
      const totalCases =
        strategy === 'pushdown'
          ? await this.resultRepo.count({ where: { run_id: runId } })
          : stage4Results.length;

      // 三份快照 + ob_monthly_run_result 原子寫入
      const configPayload = await this.buildConfigPayload(ym, validLists);
      // input_list 快照：JS 路徑由 re-hydrate 之 pool 組；P3 下推路徑 pool 為空，改由
      //   已下推之 stage4Results（讀回 ob_monthly_run_result 之有界子集）組（cardType 由 list 對照）。
      const cardTypeByListNo = new Map<string, string | null>(
        validLists.map((l) => [l.list_no, l.card_type ?? null]),
      );
      const inputListPayload = {
        cases: useStage2to4Pushdown
          ? stage4Results.map((r) => ({
              listNo: r.list_no,
              applNo: r.appl_no,
              orgno: r.orgno,
              cardType: cardTypeByListNo.get(r.list_no ?? '') ?? null,
            }))
          : stage1Cases.flatMap(({ list, pool }) =>
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
          emplidDeptid: r.emplid_deptid,
          assignday: r.assignday,
          score: r.score,
          cardLevel: r.card_level,
          tierLevel: r.tier_level,
          isCr: r.is_cr,
          status: 'PENDING', // v2.0 預設待回收（業務回填後改 SUCCESS / FAILED）
        })),
      };

      // F098 AC-5 / TS-F098-CANCEL-002：寫入快照 / result 前最後一道可中斷點。
      //   若此刻已被取消，拋 RunCancelledException → 不寫三份快照、不寫 ob_monthly_run_result、
      //   不呼叫 completeRun（run 維持 cancelRun 標記之 'failed'，不被覆寫回 'completed'）。
      await this.checkCancelled(runId);

      const now = new Date();
      // F094 / AD-E07-25 Phase A：月跑 Stage 1~4 提案結果寫入 ob_monthly_run_result（帶 run_id），
      // **不再寫入 ob_pool_data_list**（後者回歸 ETL 單一來源；去重仍只讀 ob_pool_data_list）。
      // snapshot type=result 短期雙軌保留（DP-AD25-3），作為稽核快照與本表並存。
      await this.dataSource.transaction(async (txm) => {
        // P3 下推路徑：列已由 Stage 1 INSERT + Stage 2~4 UPDATE 寫入 ob_monthly_run_result，
        //   不再 save()（避免雙寫 / 以 Partial 覆寫掉已下推之計分欄位）。
        if (!stage4ResultsPersisted && stage4Results.length > 0) {
          await txm
            .getRepository(ObMonthlyRunResult)
            .save(stage4Results as ObMonthlyRunResult[]);
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
      // F101 / AD-E07-29 §4 OQ-F101-05：Stage 3/4/ASSIGNDAY 比例分派警告事件碼，以 '|' 連接為單一
      //   summary token（去重、固定順序），與 AD-E07-29 §4 寫入格式
      //   'STAGE3_NO_DEPT_RATION|STAGE4_NO_EMPL_WARN|ASSIGNDAY_NO_CALENDAR_WARN' 對齊。
      const rationWarningSummary = buildWarningSummary(this.rationWarnings);
      if (rationWarningSummary) warningCodes.push(rationWarningSummary);
      // VARCHAR(100) 上限：截斷以保安全（警告為摘要表面化用途，不影響 skipped_cases.warnings 完整資料）。
      const warningSummary =
        warningCodes.length > 0 ? warningCodes.join(',').slice(0, 100) : null;

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
      // F101 / AD-E07-29 §4 OQ-F101-05：Stage 3/4/ASSIGNDAY 警告 → skipped_cases.warnings[]
      //   （JSONB 合併子鍵，與既有 cases / integrityIssues / lists 共存，不覆蓋；FALL-005）。
      //   不寫 assignment_audit_log（I-WARNING-CHANNEL，FALL-006）。
      const skippedJson =
        skippedCases.length > 0 ||
        integritySkipped.length > 0 ||
        skippedListsPayload.length > 0 ||
        this.rationWarnings.length > 0
          ? {
              cases: skippedCases,
              integrityIssues: integritySkipped,
              lists: skippedListsPayload,
              warnings: this.rationWarnings,
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
      // F098 AC-5：取消屬正常提早結束 — run 已被 cancelRun 標 'failed'（error_message='使用者取消'），
      //   不覆寫狀態 / 文案、不寫任何結果（已在 checkCancelled 邊界提前 return 前拋出）。
      if (err instanceof RunCancelledException) {
        this.logger.log(
          `Pipeline cancelled: run=${runId} ym=${ym}（使用者取消，保留 failed 狀態，不寫結果）`,
        );
        return;
      }
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

  /**
   * F098 AC-5：可中斷邊界取消檢查。poller 未注入（API 程序 / 舊 unit test）時 no-op，
   * pipeline 行為與 P1 前一致。
   */
  private async checkCancelled(runId: string): Promise<void> {
    if (this.cancellationPoller) {
      await this.cancellationPoller.throwIfCancelled(runId);
    }
  }

  // =========================================================================
  // v1.0 簡化邏輯（向後相容）
  // =========================================================================
  private async executeV1(
    stage1Cases: Array<{ list: ObListDefinition; pool: ObPoolData[] }>,
    ym: string,
    runId: string,
  ): Promise<Partial<ObMonthlyRunResult>[]> {
    const allLevels = await this.levelRepo.find();
    const allTiers = await this.tierRepo.find();
    const now = new Date();
    const out: Partial<ObMonthlyRunResult>[] = [];

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
          run_id: runId,
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
          emplid_deptid: empl?.deptid_m ?? null,
          result_status: 'PENDING',
          created_at: now,
          updated_at: now,
        });
      }
    }
    return out;
  }

  // =========================================================================
  // v2.0 / F101：Stage 2 計分 + Stage 3 CR 標記 + Stage 3/4 真實比例分派
  //
  // F101（AD-E07-29）：Stage 4 由 placeholder（dept[0] + 單一 defaultEmpl + st4_exchange 10%
  // senior swap）改為 distributeStage3to4 真實比例分派——dept ration（ob_dept_pct）+ empl ration
  // （ob_empl_set）+ ASSIGNDAY 千分比（computeWorkingDayRatios）。st4_exchange 移除
  // （I-NO-ST4-EXCHANGE）。此 JS 路徑為 golden oracle，與 PG SQL 下推逐列確定性等價（AC-15 DoD）。
  // =========================================================================
  private async executeV2(
    stage1Cases: Array<{ list: ObListDefinition; pool: ObPoolData[] }>,
    ym: string,
    runId: string,
  ): Promise<Partial<ObMonthlyRunResult>[]> {
    const allTiers = await this.tierRepo.find();
    const allColumns = await this.columnRepo.find();
    const allScores = await this.scoreRepo.find();
    const allLevels = await this.levelRepo.find();
    const allVersions = await this.versionRepo.find({ where: { status: 'active' } });

    // F101：ASSIGNDAY 工作日千分比（複用 computeWorkingDayRatios，與 Stage 0 試算同算法，
    //   I-RUN-EST-01）。每 run 一次查 ob_calendar（依 ym 整月）。
    const workingDays = await this.loadWorkingDayRatios(ym);

    const now = new Date();
    const out: Partial<ObMonthlyRunResult>[] = [];

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

      // ===== Stage 3/4 F101：真實比例分派（dept ration + empl ration + ASSIGNDAY）=====
      const deptRations: DeptRation[] = (
        await this.deptPctRepo.find({
          where: { project_workym: ym, list_no: list.list_no },
        })
      )
        .map((d) => ({ obdeptid: d.obdeptid, ration: Number(d.ration) }))
        .filter((d) => d.ration > 0);

      const emplRations: EmplRation[] = (
        await this.emplSetRepo.find({ where: { list_no: list.list_no } })
      )
        .map((e) => ({
          emplid: e.emplid,
          deptid_m: e.deptid_m,
          ration: Number(e.ration),
        }))
        .filter((e) => e.ration > 0);

      const rationCases: RationCase[] = scoredPool.map(({ pool: p, tierLevel }) => ({
        orgno: p.orgno,
        appl_no: p.appl_no,
        tier_level: tierLevel,
        pool_dept_id: p.dept_id,
      }));

      const { assignments, warnings } = distributeStage3to4(
        list.list_no,
        ym,
        rationCases,
        deptRations,
        emplRations,
        workingDays,
      );
      this.rationWarnings.push(...warnings);

      const assignByKey = new Map(
        assignments.map((a) => [`${a.orgno} ${a.appl_no}`, a]),
      );

      for (const { pool: p, score, cardLevel, tierLevel } of scoredPool) {
        // CR 標記：cr_enabled + 該案件在歷史快照中（simplified is_cr，被動標記，BR-F101-12）。
        const isCr =
          list.cr_enabled && crApplPerList.has(`${p.orgno}:${p.appl_no}`) ? 'Y' : 'N';
        const a = assignByKey.get(`${p.orgno} ${p.appl_no}`);

        out.push({
          run_id: runId,
          list_no: list.list_no,
          orgno: p.orgno,
          appl_no: p.appl_no,
          custo_no: p.custo_no ?? null,
          settle_src: p.settle_src,
          score,
          card_level: cardLevel,
          tier_level: tierLevel,
          is_cr: isCr,
          dept_id: a?.dept_id ?? null,
          emplid: a?.emplid ?? null,
          emplid_deptid: a?.emplid_deptid ?? null,
          assignday: a?.assignday ?? null,
          result_status: 'PENDING',
          created_at: now,
          updated_at: now,
        });
      }
    }
    return out;
  }

  /**
   * F101 / AD-E07-29 §3.4：載入 ym 整月之工作日千分比（複用 computeWorkingDayRatios）。
   * 與 Stage 0 試算 calculateDailyEstimate 同算法 + 同 ob_calendar（I-RUN-EST-01）。
   * 無工作日 → 回空陣列（distributeStage3to4 寫 ASSIGNDAY_NO_CALENDAR_WARN，月跑不中斷）。
   */
  private async loadWorkingDayRatios(
    ym: string,
  ): Promise<Array<{ casedt: string; ratioPerMille: number }>> {
    const y = parseInt(ym.slice(0, 4), 10);
    const m = parseInt(ym.slice(4, 6), 10);
    const startYmd = `${ym.slice(0, 4)}-${ym.slice(4, 6)}-01`;
    const endDate = new Date(Date.UTC(y, m, 0));
    const endYmd = `${endDate.getUTCFullYear()}-${String(endDate.getUTCMonth() + 1).padStart(2, '0')}-${String(endDate.getUTCDate()).padStart(2, '0')}`;
    const rows = await this.calendarRepo
      .createQueryBuilder('c')
      .select(['c.calendar_date AS calendar_date', 'c.rest_flg AS rest_flg'])
      .where('c.calendar_date BETWEEN :s AND :e', { s: startYmd, e: endYmd })
      .getRawMany<{ calendar_date: Date | string; rest_flg: string }>();
    return computeWorkingDayRatios(rows);
  }

  // =========================================================================
  // F100 / F101：Stage 2~4 SQL 下推（PG 真庫）
  //
  // F101（AD-E07-29）：Stage 4 由 placeholder st4_exchange 改為真實比例分派 SQL 下推
  // （runStage3to4RationSql）——dept ration + empl ration + ASSIGNDAY 千分比。與 JS executeV2
  // golden oracle 逐列確定性等價（AC-15 DoD）。
  // =========================================================================
  /**
   * 對每份「Stage 1 已 INSERT 列」之 list，以 SQL UPDATE 補 score / card_level / tier_level /
   * is_cr（runStage2and3Sql）+ dept_id / emplid / emplid_deptid / assignday（runStage3to4RationSql，
   * F101 真實比例分派），消除 re-hydrate heap（I-NOLOAD-01）。最後讀回 ob_monthly_run_result
   * 有界子集供快照 payload（input_list / result）；列已在表內，呼叫端不再 save()。
   */
  private async executeStage2to4Pushdown(
    stage1WrittenLists: Array<{ list: ObListDefinition; inserted: number }>,
    ym: string,
    runId: string,
  ): Promise<Partial<ObMonthlyRunResult>[]> {
    const allColumns = await this.columnRepo.find();
    const allScores = await this.scoreRepo.find();
    const allVersions = await this.versionRepo.find({ where: { status: 'active' } });

    // F101：ASSIGNDAY 工作日千分比（與 executeV2 / Stage 0 試算同源，I-RUN-EST-01）。
    const workingDays = await this.loadWorkingDayRatios(ym);

    const manager = this.dataSource.manager;

    for (const { list } of stage1WrittenLists) {
      const cardType = list.card_type ?? '';
      const activeVer = allVersions.find((v) => v.card_type === cardType);
      const cardVersion =
        activeVer && activeVer.card_version !== null ? activeVer.card_version : null;
      const activeColumns =
        activeVer && cardVersion !== null
          ? allColumns.filter(
              (c) =>
                c.card_type === cardType &&
                c.card_version === cardVersion &&
                c.status === 'active',
            )
          : [];

      // Stage 2 計分 + Stage 3 CR（runStage2and3Sql 不變）。
      const ctx: Stage2to4ListContext = {
        runId,
        listNo: list.list_no,
        cardType,
        cardVersion,
        activeColumns,
        scoreRows: allScores,
        crEnabled: !!list.cr_enabled,
        ym,
      };
      await runStage2and3Sql(manager, ctx);

      // F101 Stage 3/4/ASSIGNDAY 真實比例分派（取代 st4_exchange placeholder）。
      const deptRations: DeptRation[] = (
        await this.deptPctRepo.find({
          where: { project_workym: ym, list_no: list.list_no },
        })
      )
        .map((d) => ({ obdeptid: d.obdeptid, ration: Number(d.ration) }))
        .filter((d) => d.ration > 0);
      const emplRations: EmplRation[] = (
        await this.emplSetRepo.find({ where: { list_no: list.list_no } })
      )
        .map((e) => ({
          emplid: e.emplid,
          deptid_m: e.deptid_m,
          ration: Number(e.ration),
        }))
        .filter((e) => e.ration > 0);

      const warnings = await runStage3to4RationSql(manager, {
        runId,
        listNo: list.list_no,
        ym,
        deptRations,
        emplRations,
        workingDays,
      });
      this.rationWarnings.push(...warnings);
    }

    // 讀回本 run 已下推之列供快照 payload；列已在表內，呼叫端不再 save()。
    // Bug A 修復：改以 getRawMany 只取快照所需欄位（不做 TypeORM entity hydration —— 後者每列帶
    //   change-tracking metadata，55k 列放大 heap）。snapshot payload 語意不變（仍為完整 per-case
    //   記錄，下游 F063/F064/F066/F067 + CR 偵測依賴完整 assignments）；僅讀回機制改輕量化。
    const writtenListNos = stage1WrittenLists.map(({ list }) => list.list_no);
    if (writtenListNos.length === 0) return [];
    return this.readResultRowsForSnapshot(runId);
  }

  /**
   * Bug A 修復：以輕量 raw select 讀回本 run 之下推結果列供快照 payload（input_list / result）。
   *
   * 對比 `resultRepo.find()`：getRawMany 不做 entity hydration（無 change-tracking metadata），
   * 只取快照所需欄位（list_no / appl_no / orgno / dept_id / emplid / score / card_level /
   * tier_level / is_cr）→ 每列 heap 佔用顯著縮小。回傳形狀仍為 `Partial<ObMonthlyRunResult>[]`，
   * 與既有快照組裝路徑相容。
   *
   * 語意：snapshot payload 仍為**完整** per-case 記錄（非 sample）—— 此為其契約（下游 F063 摘要 /
   * F064 匯出 / F066 快照詳情 / F067 比對 / Stage 3 CR 偵測皆讀完整 assignments）。bound 僅作用於
   * 讀回機制（raw vs hydrated），不裁切資料集。
   */
  private async readResultRowsForSnapshot(
    runId: string,
  ): Promise<Partial<ObMonthlyRunResult>[]> {
    const raw = await this.resultRepo
      .createQueryBuilder('r')
      .select([
        'r.list_no AS list_no',
        'r.appl_no AS appl_no',
        'r.orgno AS orgno',
        'r.dept_id AS dept_id',
        'r.emplid AS emplid',
        'r.emplid_deptid AS emplid_deptid',
        'r.assignday AS assignday',
        'r.score AS score',
        'r.card_level AS card_level',
        'r.tier_level AS tier_level',
        'r.is_cr AS is_cr',
      ])
      .where('r.run_id = :runId', { runId })
      .getRawMany<{
        list_no: string;
        appl_no: string;
        orgno: string;
        dept_id: string | null;
        emplid: string | null;
        emplid_deptid: string | null;
        assignday: string | null;
        score: number | string | null;
        card_level: string | null;
        tier_level: string | null;
        is_cr: string | null;
      }>();

    return raw.map((r) => ({
      run_id: runId,
      list_no: r.list_no,
      appl_no: r.appl_no,
      orgno: r.orgno,
      dept_id: r.dept_id,
      emplid: r.emplid,
      emplid_deptid: r.emplid_deptid,
      assignday: r.assignday,
      // PG numeric 經 raw 可能回字串 → 正規化為 number | null（snapshot 數值一致）。
      score: r.score === null || r.score === undefined ? null : Number(r.score),
      card_level: r.card_level,
      tier_level: r.tier_level,
      is_cr: r.is_cr,
    }));
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
   * Phase 5b / AD-E07-18 §18.5 + F091 / AD-E07-22~23 + F099 / AD-E07-28 P2：
   * 對單一 list 執行 Stage 1 案件挑選。
   *
   * F099（P2 Stage 1 SQL 下推）：當 DB_TYPE='postgres' 時改走 set-based SQL 下推
   * （`buildStage1Sql` → `INSERT INTO ob_monthly_run_result SELECT … FROM ob_pool_data o WHERE <core>`），
   * Stage 1 案件挑選於 PG 內完成、不全載 ob_pool_data 進 heap（解 F2/OOM，I-NOLOAD-01）。
   * 之後僅 re-hydrate「Stage 1 已挑選之有界子集」（依寫入 ob_monthly_run_result 的 PK）回 heap，
   * 供 Stage 2~4 計分（演算法不改，C-3）。re-hydrate 為有界子集（非全 pool）→ 非全載。
   *
   * 非 PG（better-sqlite3 測試 / 非 PG 環境）：沿用 `executeStage1Chain`（JS golden oracle，
   * 與 SQL 路徑逐 list 結果集等價由 PG 真庫 EQ 群組驗收，F099 AC-7 / DoD）。下推 SQL 之
   * `::int` / `SUBSTRING(... FROM …)` / `CAST(... AS numeric)` 為 PG 專屬，SQLite 不具代表性
   * 且不支援（I-PORT-01）；故以 DB_TYPE gate 分流，與 pg-boss / advisory-lock 既有 PG-only gate 一致。
   *
   * @param list   名單定義
   * @param workdt 月跑工作日 PROJECT_WORKYM+'01'（去重視窗 + 年資規則）
   * @param runId  月跑 ID（PG 下推 INSERT…SELECT 之 run_id 常數；非 PG 路徑不使用）
   * @returns
   *   - `{ skipped: true }`：composer 回 skipReason='EMPTY_CONDITIONS' → 不撈 pool（已 logger.warn）
   *   - `{ skipped: false, pool }`：Stage 1 過濾後的 ob_pool_data 案件清單（供 Stage 2~4）
   */
  private async runStage1ForList(
    list: ObListDefinition,
    workdt: Date,
    runId: string,
    skipHydration = false,
  ): Promise<
    { skipped: true } | { skipped: false; pool: ObPoolData[]; inserted: number }
  > {
    const dbType = process.env.DB_TYPE;
    if (dbType === 'postgres') {
      return this.runStage1SqlPushdown(list, workdt, runId, skipHydration);
    }
    const jsResult = await this.runStage1JsChain(list, workdt);
    if (jsResult.skipped) return jsResult;
    return { skipped: false, pool: jsResult.pool, inserted: jsResult.pool.length };
  }

  /**
   * F099 P2 PG 下推路徑：set-based SQL 取案寫入 ob_monthly_run_result。
   *
   * - skipHydration=false（P2 / Stage 2~4 走 JS）：re-hydrate Stage 1 已挑選有界子集供 JS 計分。
   * - skipHydration=true（F100 P3 / Stage 2~4 走 SQL 下推）：**不** re-hydrate pool（pool 為空），
   *   Stage 2~4 直接對 ob_monthly_run_result 已寫入列 SQL UPDATE（I-NOLOAD-01 全程不全載 heap）。
   */
  private async runStage1SqlPushdown(
    list: ObListDefinition,
    workdt: Date,
    runId: string,
    skipHydration = false,
  ): Promise<
    { skipped: true } | { skipped: false; pool: ObPoolData[]; inserted: number }
  > {
    // run（INSERT…SELECT）與 estimate（SELECT COUNT(*)）共用同一 buildStage1Sql core（I-RUN-EST-01）。
    const { inserted, core } = await runStage1SqlInsert(
      this.dataSource.manager,
      list,
      workdt,
      this.poolDataListRepo,
      { runId, listNo: list.list_no },
    );

    for (const w of core.warnings) {
      this.logger.warn(
        `[Stage1] sql warning list_no=${list.list_no} code=${w.code} column=${(w as { columnName?: string }).columnName ?? '-'} reason=${w.reason}`,
      );
    }

    if (core.skip) {
      this.logger.warn(
        `[Stage1] Skipping list ${list.list_no} (${list.list_nm}): empty conditions (backfilled empty or invalid state)`,
      );
      return { skipped: true };
    }

    if (inserted === 0) {
      return { skipped: false, pool: [], inserted: 0 };
    }

    // F100 P3：Stage 2~4 走 SQL 下推 → 不 re-hydrate pool（pool 為空），消除 read-back heap（I-NOLOAD-01）。
    if (skipHydration) {
      return { skipped: false, pool: [], inserted };
    }

    // re-hydrate Stage 1 已挑選之有界子集（依寫入 ob_monthly_run_result 之 PK），供 Stage 2~4 計分。
    // 非全載 ob_pool_data（I-NOLOAD-01）：僅取本 run/list 已挑選案件（Stage 1 大幅收斂後之子集）。
    const selected: Array<{ orgno: string; appl_no: string }> = await this.resultRepo
      .createQueryBuilder('r')
      .select(['r.orgno AS orgno', 'r.appl_no AS appl_no'])
      .where('r.run_id = :runId AND r.list_no = :listNo', {
        runId,
        listNo: list.list_no,
      })
      .getRawMany();

    const pool = await this.hydratePoolByPk(selected);
    return { skipped: false, pool, inserted };
  }

  /**
   * 依 (orgno, appl_no) PK 子集 re-hydrate ob_pool_data 業務列（供 Stage 2~4 計分讀回 heap）。
   * 以 IN ((orgno, appl_no), …) 一次撈有界子集（Stage 1 收斂後之案件數，非全 pool）。
   */
  private async hydratePoolByPk(
    keys: Array<{ orgno: string; appl_no: string }>,
  ): Promise<ObPoolData[]> {
    if (keys.length === 0) return [];
    const qb = this.poolRepo.createQueryBuilder('o');
    const orClauses: string[] = [];
    const params: Record<string, unknown> = {};
    keys.forEach((k, i) => {
      orClauses.push(`(o.orgno = :org${i} AND o.appl_no = :appl${i})`);
      params[`org${i}`] = k.orgno;
      params[`appl${i}`] = k.appl_no;
    });
    return qb.where(orClauses.join(' OR '), params).getMany();
  }

  /**
   * 非 PG 路徑：沿用 executeStage1Chain（JS golden oracle，SQLite 相容）。
   */
  private async runStage1JsChain(
    list: ObListDefinition,
    workdt: Date,
  ): Promise<{ skipped: true } | { skipped: false; pool: ObPoolData[] }> {
    const result = await executeStage1Chain(
      list,
      workdt,
      this.poolRepo,
      // F094：去重來源仍為 ob_pool_data_list（poolDataListRepo），非月跑結果表（AC-7）
      this.poolDataListRepo,
      { dryRun: false },
    );

    // 非阻擋型 warning 紀錄（含 composer 欄位篩選 + F091 month_cnt skip 等）
    for (const w of result.warnings) {
      this.logger.warn(
        `[Stage1] chain warning list_no=${list.list_no} code=${w.code} column=${(w as { columnName?: string }).columnName ?? '-'} reason=${w.reason}`,
      );
    }

    // §18.5.2：空 conditions / wildcard 後零有效 fragment → skip
    if (result.skipped) {
      this.logger.warn(
        `[Stage1] Skipping list ${list.list_no} (${list.list_nm}): empty conditions (backfilled empty or invalid state)`,
      );
      return { skipped: true };
    }

    // dryRun:false → cases 必為陣列（executeStage1Chain 契約保證）
    return { skipped: false, pool: result.cases ?? [] };
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

/**
 * F091 / AD-E07-22：將 PROJECT_WORKYM（'YYYYMM' 字串）轉為 workdt Date（當月 1 日）。
 * 對應 SP `@WORKDT = PROJECT_WORKYM + '01'`，供 Stage 1 去重視窗計算與年資特殊 DELETE 取當年。
 * 以本地時間 new Date(year, monthIndex, 1) 建構，與 Stage1FilterChain 內 getFullYear/getMonth/getDate 一致。
 */
function parseWorkdt(ym: string): Date {
  const year = parseInt(ym.slice(0, 4), 10);
  const month = parseInt(ym.slice(4, 6), 10); // 1-based
  return new Date(year, month - 1, 1);
}
