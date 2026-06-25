import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PassThrough, Readable } from 'stream';
import { DataSource, Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { AssignmentRunSnapshot } from '@/database/entities/assignment-run-snapshot.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';
import { ERROR_CODES, ERROR_MESSAGES } from '@/common/errors/error-codes';
import {
  SectionChiefScopeService,
  ActorUser,
} from './section-chief-scope.service';

export interface SummaryDeptRow {
  deptId: string;
  configRatio: number;
  actualCount: number;
  actualRatio: number;
  deviation: number;
  alert: boolean;
}

export interface SummaryLevelRow {
  cardLevel: string;
  count: number;
  ratio: number;
}

export interface SummaryTierRow {
  tierLevel: string;
  count: number;
  ratio: number;
}

export interface SummaryResponse {
  runId: string;
  projectWorkym: string;
  finishedAt: Date | null;
  durationMs: number | null;
  totalCases: number | null;
  stage1Count: number;
  stage4Count: number;
  coverageRate: number;
  // F063 gap fix：分派業務員數（distinct emplid）— 對齊 prototype「分派業務員數 / 平均每人 X 案」stat card
  emplCount: number;
  deptSummary: SummaryDeptRow[];
  levelDistribution: SummaryLevelRow[];
  // F063 gap fix：TIER_LEVEL 分佈（對齊 prototype 33-run-summary.html「TIER_LEVEL 分佈」chart）
  tierDistribution: SummaryTierRow[];
  // F063 AC-5：warnings 段含 skipped_cases 與 warning_summary 碼
  warnings: {
    summaryCode: string | null;
    skippedCases: Record<string, unknown> | null;
  };
}

export interface ExportResult {
  filename: string;
  contentType: string;
  /** CSV 為 string，xlsx 為 Buffer（streaming written 後集合） */
  body: string | Buffer;
  rowCount: number;
}

export interface ExportOptions {
  /** xlsx streaming timeout (ms)，超過回 EXPORT_FILE_EXPIRED；預設 5 分鐘 */
  timeoutMs?: number;
}

/** F064 BR-3：xlsx 串流匯出 timeout 上限（5 分鐘） */
const EXPORT_TIMEOUT_MS_DEFAULT = 5 * 60 * 1000;

/**
 * F064 v2.0 AC-2 / BR-F064-03 / AD-E07-31 §3.3：xlsx + csv 共用欄位（**23 欄**，
 * 對齊 legacy `reference/202606 分派名單.xlsx` 工作表 1 欄序）。
 *
 * 不變式 I-EXP-COLSRC-01：不含 custo_no / cust_name / card_level / score（GAP-1 修正）。
 */
export const EXPORT_HEADER_V2 = [
  '分處', // 1  pool.dept_name
  '案號', // 2  r.appl_no
  '指派日', // 3  r.assignday → YYYYMMDD
  '名單代號', // 4  r.list_no
  '名單名稱', // 5  list_def.list_nm（LEFT JOIN）
  '進件日', // 6  pool.appl_date → YYYY/MM/DD（GAP-3：取 pool 端）
  'CR_ID', // 7  r.cr_id
  'CR_NM', // 8  r.cr_nm
  '是否分配CR', // 9  r.is_cr
  'TIER', // 10 r.tier_level
  '部門代號', // 11 r.dept_id
  '部門名稱', // 12 emphire.dept_name（LEFT JOIN，join-miss→空）
  '員編', // 13 r.emplid
  '姓名', // 14 emphire.emp_nm（LEFT JOIN，join-miss→空）
  '職級', // 15 emphire.title_name（LEFT JOIN，join-miss→空）
  '專案類別', // 16 pool.project_tp
  '專案名稱', // 17 pool.spec_name
  '逾期天數', // 18 pool.overdue_day（legacy 恆 NULL，保留欄）
  '客戶利率', // 19 pool.pro_rate
  'STA_CODE', // 20 pool.sta_code
  '案件狀態', // 21 pool.sta_code_na
  '廠牌名稱', // 22 pool.brand_name
  '名單週期月數', // 23 pool.month_cnt
] as const;

/**
 * F064 v2.0 匯出 join SQL 之 raw row 型別（AD-E07-31 §2.1 SELECT 別名對應）。
 * 所有欄位皆由單一 join SQL 提供（I-EXP-COLSRC-01）；型別為 DB 驅動回傳之原始值。
 */
export interface RawExportRow {
  // pool
  dept_name?: string | null; // 欄 1 分處（pool.dept_name）
  appl_no?: string | null; // 欄 2 案號
  list_no?: string | null; // 欄 4 名單代號
  appl_date?: Date | string | null; // 欄 6 進件日（pool.appl_date，GAP-3）
  project_tp?: string | null; // 欄 16
  spec_name?: string | null; // 欄 17
  overdue_day?: number | string | null; // 欄 18（恆 NULL）
  pro_rate?: number | string | null; // 欄 19
  sta_code?: string | null; // 欄 20
  sta_code_na?: string | null; // 欄 21
  brand_name?: string | null; // 欄 22
  month_cnt?: number | string | null; // 欄 23
  // run_result
  assignday?: string | null; // 欄 3 指派日
  cr_id?: string | null; // 欄 7
  cr_nm?: string | null; // 欄 8
  is_cr?: string | null; // 欄 9
  tier_level?: string | null; // 欄 10
  dept_id?: string | null; // 欄 11
  emplid?: string | null; // 欄 13
  // list_def（LEFT JOIN）
  list_nm?: string | null; // 欄 5 名單名稱
  // emphire（LEFT JOIN，別名 emphire_*）
  emphire_dept_name?: string | null; // 欄 12 部門名稱
  emp_nm?: string | null; // 欄 14 姓名
  title_name?: string | null; // 欄 15 職級
}

/** formatRow() 回傳：23 欄字串陣列 + emphire join-miss 偵測（I-EXP-JOINMISS-01）。 */
export interface FormattedExportRow {
  row: string[];
  empJoinMiss: boolean;
  emplid: string | null;
}

/**
 * F064 v2.0 匯出 join SQL spec（buildExportQuery 產出）。
 * sql / params 由 streaming producer 餵 TypeORM queryRunner.stream()（I-EXP-NOOFFSET-01）。
 */
export interface ExportQuerySpec {
  sql: string;
  params: unknown[];
  scopedByCreator: boolean;
}

export interface CompareResponse {
  base: { runId: string; projectWorkym: string; totalCases: number };
  compare: { runId: string; projectWorkym: string; totalCases: number };
  summary: {
    totalDiff: number;
    deptDiff: Array<{
      deptId: string;
      baseCount: number;
      compareCount: number;
      diff: number;
    }>;
    levelDiff: Array<{
      cardLevel: string;
      baseCount: number;
      compareCount: number;
      diff: number;
    }>;
  };
  configDiff: {
    cardVersionChanged: { from: number | null; to: number | null } | null;
    deptRatioChanges: Array<{
      listNo: string;
      deptId: string;
      from: number | null;
      to: number | null;
    }>;
    crRuleChanged: { from: boolean | null; to: boolean | null } | null;
  };
  personnelMismatch: {
    list: Array<{
      applNo: string;
      baseEmplId: string | null;
      compareEmplId: string | null;
    }>;
    mismatchCount: number;
    totalCount: number;
    rate: number;
    alert: boolean;
  };
  customerDiff: {
    added: Array<{ applNo: string }>;
    removed: Array<{ applNo: string }>;
  };
}

interface ResultAssignment {
  listNo?: string;
  applNo?: string;
  deptId?: string | null;
  emplid?: string | null;
  score?: number | null;
  cardLevel?: string | null;
  tierLevel?: string | null;
  isCr?: string | null;
}

/**
 * AssignmentRunReportService — F063 摘要 / F064 匯出 / F067 比對
 *
 * - getSummary(runId)：F063 結果摘要（總量 / 部門偏差 / 等級分佈 / warnings）
 * - exportResult(runId, format)：F064 匯出 CSV（xlsx 未實作 → 422）
 * - compareRuns(runA, runB)：F067 差異比對 + 人員配對不一致率（NFR-005）
 *
 * 來源：assignment_run + assignment_run_snapshot.payload（type='result' / 'config'）
 *
 * 注意：未完成（pending / running / failed）的 run → 422 ASSIGNMENT_RUN_NOT_COMPLETED。
 */
@Injectable()
export class AssignmentRunReportService {
  private readonly logger = new Logger(AssignmentRunReportService.name);

  static readonly DEVIATION_ALERT_THRESHOLD = 3; // 百分比
  static readonly MISMATCH_ALERT_THRESHOLD = 0.03; // NFR-005

  constructor(
    @InjectRepository(AssignmentRun)
    private readonly runRepo: Repository<AssignmentRun>,
    @InjectRepository(AssignmentRunSnapshot)
    private readonly snapshotRepo: Repository<AssignmentRunSnapshot>,
    @InjectRepository(AssignmentAuditLog)
    private readonly auditRepo: Repository<AssignmentAuditLog>,
    private readonly scope: SectionChiefScopeService,
    // F064 v2.0 / AD-E07-31：匯出多表 join 下推 + server-side cursor streaming（I-EXP-STREAM-01）
    private readonly dataSource: DataSource,
  ) {}

  // -------------------------------------------------------------------------
  // F063 結果摘要
  // -------------------------------------------------------------------------

  async getSummary(runId: string, actor?: ActorUser | null): Promise<SummaryResponse> {
    const run = await this.requireCompletedRun(runId);
    const { configPayload, resultPayload, inputListPayload } =
      await this.loadAllPayloads(runId);

    const allAssignments: ResultAssignment[] = Array.isArray(
      (resultPayload as any)?.assignments,
    )
      ? ((resultPayload as any).assignments as ResultAssignment[])
      : [];
    // F063 v1.1 BR-6 / BR-7：section_chief scopeByCreator filter；director / admin bypass
    const assignments = await this.scope.filterByEmplId<ResultAssignment>(
      allAssignments,
      actor,
    );
    const stage4Count = assignments.length;
    const allStage1Cases = Array.isArray((inputListPayload as any)?.cases)
      ? ((inputListPayload as any).cases as Array<{ emplid?: string | null }>)
      : [];
    const stage1Cases = await this.scope.filterByEmplId(allStage1Cases, actor);
    const stage1Count = stage1Cases.length;
    const coverageRate = stage1Count === 0 ? 0 : stage4Count / stage1Count;

    // 分派業務員數：distinct 非空 emplid（對齊 prototype「分派業務員數」stat card）。
    // 已套 section_chief scope filter（assignments 為轄區子集），emplid 全 NULL（F101 未跑）→ 0。
    const emplSet = new Set<string>();
    for (const a of assignments) {
      const e = a.emplid ?? null;
      if (!e) continue;
      emplSet.add(e);
    }
    const emplCount = emplSet.size;

    // 部門統計：聚合 result 中 deptId
    const deptActual = new Map<string, number>();
    for (const a of assignments) {
      const d = a.deptId ?? null;
      if (!d) continue;
      deptActual.set(d, (deptActual.get(d) ?? 0) + 1);
    }

    // 部門設定比例：聚合 config.deptPct 中各 deptId 的 ration 平均（spec L62 「設定比例」）
    const deptConfigRatio = new Map<string, number>();
    const deptConfigSum = new Map<string, { sum: number; cnt: number }>();
    const cfgDeptPct: Array<{ deptId: string; ration: string | number }> =
      Array.isArray((configPayload as any)?.deptPct)
        ? (configPayload as any).deptPct
        : [];
    for (const d of cfgDeptPct) {
      if (!d.deptId) continue;
      const v = Number(d.ration);
      if (!Number.isFinite(v)) continue;
      const prev = deptConfigSum.get(d.deptId) ?? { sum: 0, cnt: 0 };
      prev.sum += v;
      prev.cnt += 1;
      deptConfigSum.set(d.deptId, prev);
    }
    for (const [k, { sum, cnt }] of deptConfigSum.entries()) {
      deptConfigRatio.set(k, cnt === 0 ? 0 : sum / cnt);
    }

    // F063 AC-5：section_chief 視角下，deptSummary 只列出 assignments 中出現的 dept
    //            （不洩漏轄區外 deptId 的存在性）。director / admin bypass 顯示 union。
    const allDeptIds = this.scope.shouldFilter(actor)
      ? new Set<string>(deptActual.keys())
      : new Set<string>([...deptActual.keys(), ...deptConfigRatio.keys()]);
    const deptSummary: SummaryDeptRow[] = [];
    for (const deptId of allDeptIds) {
      const actualCount = deptActual.get(deptId) ?? 0;
      const actualRatio =
        stage4Count === 0
          ? 0
          : Math.round(((actualCount / stage4Count) * 100) * 10) / 10;
      const configRatio =
        Math.round((deptConfigRatio.get(deptId) ?? 0) * 10) / 10;
      const deviation =
        Math.round((actualRatio - configRatio) * 10) / 10;
      const alert =
        Math.abs(deviation) >
        AssignmentRunReportService.DEVIATION_ALERT_THRESHOLD;
      deptSummary.push({
        deptId,
        configRatio,
        actualCount,
        actualRatio,
        deviation,
        alert,
      });
    }
    deptSummary.sort((a, b) => a.deptId.localeCompare(b.deptId));

    // 等級分佈
    const levelCounts = new Map<string, number>();
    for (const a of assignments) {
      const l = a.cardLevel ?? null;
      if (!l) continue;
      levelCounts.set(l, (levelCounts.get(l) ?? 0) + 1);
    }
    const levelDistribution: SummaryLevelRow[] = Array.from(
      levelCounts.entries(),
    )
      .map(([cardLevel, count]) => ({
        cardLevel,
        count,
        ratio:
          stage4Count === 0
            ? 0
            : Math.round(((count / stage4Count) * 100) * 10) / 10,
      }))
      .sort((a, b) => a.cardLevel.localeCompare(b.cardLevel));

    // TIER_LEVEL 分佈（F063 gap fix；對齊 prototype「fn_calc_tier_level 計算結果」chart）。
    // tier_level 由 F100/F101 月跑計分寫入（score→card_level→tier）；NULL 不計入。
    const tierCounts = new Map<string, number>();
    for (const a of assignments) {
      const t = a.tierLevel ?? null;
      if (!t) continue;
      tierCounts.set(t, (tierCounts.get(t) ?? 0) + 1);
    }
    const tierDistribution: SummaryTierRow[] = Array.from(tierCounts.entries())
      .map(([tierLevel, count]) => ({
        tierLevel,
        count,
        ratio:
          stage4Count === 0
            ? 0
            : Math.round((count / stage4Count) * 100 * 10) / 10,
      }))
      .sort((a, b) => a.tierLevel.localeCompare(b.tierLevel));

    // F063 AC-5：section_chief 視角下 totalCases 為轄區內子集（= stage4Count）；
    //            director / admin bypass，回原值（run.total_cases）。
    const totalCases = this.scope.shouldFilter(actor)
      ? stage4Count
      : run.total_cases;

    return {
      runId: run.run_id,
      projectWorkym: run.project_workym,
      finishedAt: run.finished_at,
      durationMs: run.duration_ms,
      totalCases,
      stage1Count,
      stage4Count,
      coverageRate: Math.round(coverageRate * 10000) / 10000,
      emplCount,
      deptSummary,
      levelDistribution,
      tierDistribution,
      warnings: {
        summaryCode: run.warning_summary,
        skippedCases: run.skipped_cases,
      },
    };
  }

  // -------------------------------------------------------------------------
  // F064 匯出（CSV）
  // -------------------------------------------------------------------------

  /**
   * F064 v2.0 匯出分派結果（23 欄對齊 legacy；AD-E07-31）。
   *
   * 重構要點（取代 v1.1）：
   *   - **不再讀 assignment_run_snapshot.payload**（移除 loadAllPayloads，GAP-2 / I-EXP-COLSRC-01）；
   *     改由 ob_monthly_run_result 多表 join 取 23 欄（buildExportQuery）。
   *   - xlsx 與 CSV **共用同一 row-producer**（server-side cursor stream；I-EXP-STREAM-01 / I-EXP-NOOFFSET-01）。
   *   - 處長 scope filter 以 **SQL WHERE 注入**（非 streaming 後 in-memory 過濾；I-EXP-SCOPE-01）。
   *   - 日期格式於 formatRow() 集中轉換（I-EXP-FMT-01）；emphire join-miss fallback + WARNING 彙總（I-EXP-JOINMISS-01）。
   */
  async exportResult(
    runId: string,
    format: 'csv' | 'xlsx' = 'csv',
    actorId?: string,
    actor?: ActorUser | null,
    options?: ExportOptions,
  ): Promise<ExportResult> {
    const run = await this.requireCompletedRun(runId);
    // F064 v2.0：建構 23 欄多表 join SQL（含處長 scope WHERE，BR-F064-13 / I-EXP-SCOPE-01）
    const query = await this.buildExportQuery(runId, actor);
    const timeoutMs = options?.timeoutMs ?? EXPORT_TIMEOUT_MS_DEFAULT;

    const shortId = run.run_id.replace(/-/g, '').slice(0, 8);
    const joinMissEmplids: string[] = [];
    let joinMissCount = 0;
    let rowCount = 0;

    // emphire join-miss 偵測 callback（彙總計數，避免 per-row log；AD-E07-31 §2.7）
    const onRow = (formatted: FormattedExportRow): void => {
      rowCount += 1;
      if (formatted.empJoinMiss) {
        joinMissCount += 1;
        if (joinMissEmplids.length < 100 && formatted.emplid) {
          joinMissEmplids.push(formatted.emplid);
        }
      }
    };

    let body: string | Buffer;
    let contentType: string;
    let ext: string;

    if (format === 'xlsx') {
      body = await this.buildExportXlsxStreaming(query, timeoutMs, onRow);
      contentType =
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      ext = 'xlsx';
    } else {
      body = await this.buildExportCsvStreaming(query, timeoutMs, onRow);
      contentType = 'text/csv; charset=utf-8';
      ext = 'csv';
    }

    // I-EXP-JOINMISS-01：匯出完成後記一筆 WARNING log 彙總（含 emplid 與 run_id）
    if (joinMissCount > 0) {
      const shown = joinMissEmplids.join(', ');
      const truncatedNote =
        joinMissCount > 100 ? ` (truncated to 100 of ${joinMissCount} misses)` : '';
      this.logger.warn(
        `F064 export ob_emphire join-miss: run=${runId} count=${joinMissCount} emplids=[${shown}]${truncatedNote}`,
      );
    }

    const filename = `assignment_result_${run.project_workym}_${shortId}.${ext}`;

    // BR-F064-15 / AC-9：稽核（含 actorBusinessRole / scopedByCreator / exportedRowCount）
    await this.writeAudit(runId, actorId, {
      format,
      actorBusinessRole: actor?.businessRole ?? 'unknown',
      scopedByCreator: query.scopedByCreator,
      exportedRowCount: rowCount,
    });

    return { filename, contentType, body, rowCount };
  }

  /**
   * F064 v2.1 / AD-E07-31：建構 23 欄多表 join SQL（INNER JOIN ob_pool_data / LEFT JOIN emphire / list_def）
   * + 處長 scope WHERE 注入（BR-F064-13）。
   *
   * I-EXP-LINEAGE-01：pool 屬性取自 ob_pool_data o（共享池，orgno+appl_no）——result 母體血緣源頭；
   *   不取 ob_pool_data_list（per-list 去重表，連 list_no+orgno+appl_no 會掉列）。
   * I-EXP-DET-01：ORDER BY r.list_no, r.orgno, r.appl_no（確定性輸出）。
   * I-EXP-APLDATE-01：欄 6 進件日取 o.appl_date（pool 端，非 r.appl_date）。
   * I-EXP-SCOPE-01：section_chief 以 emplid IN (...) WHERE 注入；director / admin bypass。
   */
  private async buildExportQuery(
    runId: string,
    actor?: ActorUser | null,
  ): Promise<ExportQuerySpec> {
    const params: unknown[] = [runId];
    let scopeClause = '';
    let scopedByCreator = false;

    if (this.scope.shouldFilter(actor)) {
      scopedByCreator = true;
      const scope = await this.scope.getScopeEmplIds(actor!.userId);
      const emplids = [...scope];
      if (emplids.length === 0) {
        // 無轄區 → 永不匹配（BR-F064-14：仍回 200 + 僅表頭）。1=0 確保 0 列。
        scopeClause = ' AND 1 = 0';
      } else {
        const placeholders = emplids
          .map((_, i) => `$${params.length + i + 1}`)
          .join(', ');
        scopeClause = ` AND r.emplid IN (${placeholders})`;
        params.push(...emplids);
      }
    }

    // I-EXP-LINEAGE-01（F064 v2.1 修正）：pool 屬性取自 **ob_pool_data o**（共享池，PK=orgno+appl_no），
    // **非** ob_pool_data_list（per-list 去重表）。月跑 Stage 1 為
    //   INSERT INTO ob_monthly_run_result SELECT … FROM ob_pool_data o
    // → result 母體血緣源頭即 ob_pool_data（by orgno+appl_no）。改用 list_no+orgno+appl_no 連 pool_data_list
    // 會掉列（202606 實測掉 6,438 列／11.5%，因部分 result 案件不在該名單之 per-list 去重表）。
    // INNER JOIN 維持（血緣保證每筆 result 必有對應 ob_pool_data 列；INNER 更安全、可暴露完整性異常）。
    const sql = `
      SELECT
        o.dept_name                          AS dept_name,
        r.appl_no                            AS appl_no,
        r.assignday                          AS assignday,
        r.list_no                            AS list_no,
        d.list_nm                            AS list_nm,
        o.appl_date                          AS appl_date,
        r.cr_id                              AS cr_id,
        r.cr_nm                              AS cr_nm,
        r.is_cr                              AS is_cr,
        r.tier_level                         AS tier_level,
        r.dept_id                            AS dept_id,
        e.dept_name                          AS emphire_dept_name,
        r.emplid                             AS emplid,
        e.emp_nm                             AS emp_nm,
        e.title_name                         AS title_name,
        o.project_tp                         AS project_tp,
        o.spec_name                          AS spec_name,
        o.overdue_day                        AS overdue_day,
        o.pro_rate                           AS pro_rate,
        o.sta_code                           AS sta_code,
        o.sta_code_na                        AS sta_code_na,
        o.brand_name                         AS brand_name,
        o.month_cnt                          AS month_cnt
      FROM ob_monthly_run_result r
      INNER JOIN ob_pool_data o
              ON o.orgno   = r.orgno
             AND o.appl_no = r.appl_no
      LEFT JOIN ob_emphire e
             ON e.emp_id = r.emplid
      LEFT JOIN ob_list_definition d
             ON d.list_no = r.list_no
      WHERE r.run_id = $1${scopeClause}
      ORDER BY r.list_no, r.orgno, r.appl_no
    `;

    return { sql, params, scopedByCreator };
  }

  /** F064 v2.0：server-side cursor 每批 FETCH 列數（記憶體與往返次數權衡）。 */
  private static readonly EXPORT_FETCH_BATCH = 500;

  /**
   * F064 v2.0 共用 row-producer（I-EXP-STREAM-01）：PostgreSQL **native server-side cursor**
   * （DECLARE … CURSOR + FETCH n）逐批 yield raw row，**不使用 OFFSET 分頁**（I-EXP-NOOFFSET-01）。
   *
   * 採 native cursor（非 TypeORM stream()）以避免引入 `pg-query-stream` 新依賴；
   * cursor 須在 transaction 內宣告，逐批 FETCH 直至 0 列後 CLOSE + COMMIT + release。
   *
   * 回傳 objectMode Readable（push raw row 物件）；xlsx / CSV producer 以 `for await` 共用消費。
   * SQLite（單元 / Integration 測試）無 native cursor → 由測試 mock 本方法（cursorRows）。
   */
  protected async cursorRows(query: ExportQuerySpec): Promise<Readable> {
    const batch = AssignmentRunReportService.EXPORT_FETCH_BATCH;
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    // 以位置參數 ($1..$n) 宣告 cursor；FETCH 不帶參數。
    await queryRunner.query(
      `DECLARE export_cursor NO SCROLL CURSOR FOR ${query.sql}`,
      query.params,
    );

    let finished = false;
    const cleanup = async (): Promise<void> => {
      if (finished) return;
      finished = true;
      try {
        await queryRunner.query('CLOSE export_cursor');
        await queryRunner.commitTransaction();
      } catch {
        try {
          await queryRunner.rollbackTransaction();
        } catch {
          /* ignore */
        }
      } finally {
        await queryRunner.release();
      }
    };

    const readable = new Readable({
      objectMode: true,
      read() {
        void (async () => {
          try {
            const rows: RawExportRow[] = await queryRunner.query(
              `FETCH ${batch} FROM export_cursor`,
            );
            if (!rows || rows.length === 0) {
              await cleanup();
              this.push(null);
              return;
            }
            for (const row of rows) {
              this.push(row);
            }
          } catch (err) {
            await cleanup();
            this.destroy(err as Error);
          }
        })();
      },
    });
    // 消費端提前中止（error / destroy）→ 確保 cursor / tx / queryRunner 釋放
    readable.once('close', () => {
      void cleanup();
    });
    return readable;
  }

  /**
   * F064 v2.0 / AD-E07-31 §2.6 / BR-F064-03：將 join SQL raw row 轉為 23 欄字串陣列。
   *
   * - 日期格式（I-EXP-FMT-01）：指派日→YYYYMMDD；進件日→YYYY/MM/DD；兩欄輸出字串防 Excel 轉型。
   * - NULL / undefined → 空字串（含 CR_ID/CR_NM 非 CR 案、overdue_day 恆空、list_nm join-miss）。
   * - emphire join-miss（I-EXP-JOINMISS-01）：欄 12/14/15 空、欄 13 員編仍輸出原值。
   */
  formatRow(raw: RawExportRow): FormattedExportRow {
    const s = (v: unknown): string =>
      v === null || v === undefined ? '' : String(v);

    const emplid = raw.emplid ?? null;
    // emphire join-miss：emp_nm / title_name / emphire_dept_name 皆 null（LEFT JOIN 未命中）
    const empJoinMiss =
      (raw.emp_nm === null || raw.emp_nm === undefined) &&
      (raw.title_name === null || raw.title_name === undefined) &&
      (raw.emphire_dept_name === null || raw.emphire_dept_name === undefined);

    const row: string[] = [
      s(raw.dept_name), // 1  分處
      s(raw.appl_no), // 2  案號
      this.formatAssignday(raw.assignday), // 3  指派日 YYYYMMDD
      s(raw.list_no), // 4  名單代號
      s(raw.list_nm), // 5  名單名稱
      this.formatApplDate(raw.appl_date), // 6  進件日 YYYY/MM/DD
      s(raw.cr_id), // 7  CR_ID
      s(raw.cr_nm), // 8  CR_NM
      s(raw.is_cr), // 9  是否分配CR
      s(raw.tier_level), // 10 TIER
      s(raw.dept_id), // 11 部門代號
      s(raw.emphire_dept_name), // 12 部門名稱（emphire，join-miss→空）
      s(raw.emplid), // 13 員編（join-miss 仍輸出原值）
      s(raw.emp_nm), // 14 姓名（emphire，join-miss→空）
      s(raw.title_name), // 15 職級（emphire，join-miss→空）
      s(raw.project_tp), // 16 專案類別
      s(raw.spec_name), // 17 專案名稱
      s(raw.overdue_day), // 18 逾期天數（恆空保留欄）
      s(raw.pro_rate), // 19 客戶利率
      s(raw.sta_code), // 20 STA_CODE
      s(raw.sta_code_na), // 21 案件狀態
      s(raw.brand_name), // 22 廠牌名稱
      s(raw.month_cnt), // 23 名單週期月數
    ];

    return { row, empJoinMiss, emplid: emplid != null ? String(emplid) : null };
  }

  /**
   * 指派日 → YYYYMMDD（8 位數字字串）。原始可能為 '20260601'（已正確）或 '2026-06-01'（ISO）。
   * 移除所有非數字字元；輸出字串以防 Excel 解析為整數序號（I-EXP-FMT-01）。
   */
  private formatAssignday(v: Date | string | null | undefined): string {
    if (v === null || v === undefined) return '';
    let str: string;
    if (v instanceof Date) {
      // 防禦路徑：assignday 實際為 varchar，此分支罕至。用本地 getter 與進件日一致。
      str =
        `${v.getFullYear()}` +
        `${String(v.getMonth() + 1).padStart(2, '0')}` +
        `${String(v.getDate()).padStart(2, '0')}`;
    } else {
      str = String(v).replace(/[^0-9]/g, '');
    }
    return str;
  }

  /**
   * 進件日 → YYYY/MM/DD（斜線分隔字串）。原始為 Date 物件或 'YYYY-MM-DD' 字串（I-EXP-FMT-01）。
   *
   * ⚠️ PostgreSQL `date` 欄位經 node-postgres 解析為**本地時區午夜** Date 物件
   *    （非 UTC）。故 Date 分支須用本地 getter（getFullYear/getMonth/getDate），
   *    否則 UTC+8 環境 `'2025-03-01'` 讀回 `2025-03-01T00:00+08:00` → getUTCDate() 漂移為 02-28
   *    （feedback_typeorm_between_timezone 同源教訓）。字串分支取前 10 碼。
   */
  private formatApplDate(v: Date | string | null | undefined): string {
    if (v === null || v === undefined) return '';
    let ymd: string;
    if (v instanceof Date) {
      ymd =
        `${v.getFullYear()}-` +
        `${String(v.getMonth() + 1).padStart(2, '0')}-` +
        `${String(v.getDate()).padStart(2, '0')}`;
    } else {
      // 'YYYY-MM-DD' 或 'YYYY-MM-DD HH:mm:ss'：取日期部分
      ymd = String(v).slice(0, 10);
    }
    return ymd.replace(/-/g, '/');
  }

  /**
   * F064 v2.0 / AD-E07-31 §2.2：xlsx streaming（exceljs WorkbookWriter）。
   * 共用 row-producer（cursorRows）逐列餵入；timeout 監看（BR-F064-10）。
   */
  private async buildExportXlsxStreaming(
    query: ExportQuerySpec,
    timeoutMs: number,
    onRow: (formatted: FormattedExportRow) => void,
  ): Promise<Buffer> {
    const sink = new PassThrough();
    const chunks: Buffer[] = [];
    sink.on('data', (chunk: Buffer) => chunks.push(chunk));
    const sinkEnd = new Promise<void>((resolve, reject) => {
      sink.once('end', () => resolve());
      sink.once('error', reject);
    });

    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
      stream: sink,
      useStyles: true,
      useSharedStrings: false,
    });
    const sheet = workbook.addWorksheet('assignment_result');
    sheet.columns = EXPORT_HEADER_V2.map((header) => ({ header }));
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.commit();

    const writeAndFinish = (async () => {
      const source = await this.cursorRows(query);
      for await (const raw of source as AsyncIterable<RawExportRow>) {
        const formatted = this.formatRow(raw);
        onRow(formatted);
        // 以字串型別逐欄寫入（防 Excel 將指派日 / 進件日誤判為數字序號，I-EXP-FMT-01）
        sheet.addRow(formatted.row).commit();
      }
      sheet.commit();
      await workbook.commit();
      await sinkEnd;
    })();

    await this.raceTimeout(writeAndFinish, timeoutMs);
    return Buffer.concat(chunks);
  }

  /**
   * F064 v2.0 / AD-E07-31 §2.2.1：CSV streaming（PassThrough 逐列 push）。
   * **取代 v1.1 in-memory `lines.join()` 全量拼接**（I-EXP-STREAM-01）。
   * 共用 row-producer（cursorRows）；timeout 監看（BR-F064-10）。
   */
  private async buildExportCsvStreaming(
    query: ExportQuerySpec,
    timeoutMs: number,
    onRow: (formatted: FormattedExportRow) => void,
  ): Promise<string> {
    const csvSink = new PassThrough();
    const chunks: Buffer[] = [];
    csvSink.on('data', (chunk: Buffer) => chunks.push(chunk));
    const sinkEnd = new Promise<void>((resolve, reject) => {
      csvSink.once('finish', () => resolve());
      csvSink.once('error', reject);
    });

    // F064：寫入 UTF-8 BOM（U+FEFF）— 使 Excel 開啟 CSV 時正確判定 UTF-8 編碼；
    //   否則 Excel 以系統 locale（中文 Windows = Big5）解 UTF-8 中文 → 亂碼。
    //   （HTTP `charset=utf-8` 對 Excel 開啟下載的 .csv 無效，須靠檔案 BOM。）
    csvSink.push('\uFEFF', 'utf8');

    // header row
    csvSink.push(
      EXPORT_HEADER_V2.map((h) => this.csvEscape(h)).join(',') + '\n',
      'utf8',
    );

    const writeAndFinish = (async () => {
      const source = await this.cursorRows(query);
      for await (const raw of source as AsyncIterable<RawExportRow>) {
        const formatted = this.formatRow(raw);
        onRow(formatted);
        csvSink.push(
          formatted.row.map((v) => this.csvEscape(v)).join(',') + '\n',
          'utf8',
        );
      }
      csvSink.end();
      await sinkEnd;
    })();

    await this.raceTimeout(writeAndFinish, timeoutMs);
    return Buffer.concat(chunks).toString('utf8');
  }

  /**
   * BR-F064-10：匯出 timeout race；超過上限 → 500 EXPORT_FILE_EXPIRED。
   */
  private async raceTimeout(work: Promise<void>, timeoutMs: number): Promise<void> {
    let timeoutHandle: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(
          new InternalServerErrorException({
            error: ERROR_CODES.EXPORT_FILE_EXPIRED,
            message: ERROR_MESSAGES.EXPORT_FILE_EXPIRED,
          }),
        );
      }, timeoutMs);
      if (typeof timeoutHandle.unref === 'function') timeoutHandle.unref();
    });
    try {
      await Promise.race([work, timeoutPromise]);
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  }

  // -------------------------------------------------------------------------
  // F067 比對
  // -------------------------------------------------------------------------

  async compareRuns(
    runA: string,
    runB: string,
    actor?: ActorUser | null,
  ): Promise<CompareResponse> {
    const base = await this.requireRun(runA);
    const compare = await this.requireRun(runB);

    for (const r of [base, compare]) {
      if (r.status !== 'completed') {
        throw new UnprocessableEntityException({
          error: ERROR_CODES.ASSIGNMENT_RUN_NOT_COMPARABLE,
          message: ERROR_MESSAGES.ASSIGNMENT_RUN_NOT_COMPARABLE,
        });
      }
    }

    const baseSnap = await this.loadAllPayloads(runA);
    const cmpSnap = await this.loadAllPayloads(runB);

    const baseListRaw: ResultAssignment[] = Array.isArray(
      (baseSnap.resultPayload as any)?.assignments,
    )
      ? (baseSnap.resultPayload as any).assignments
      : [];
    const cmpListRaw: ResultAssignment[] = Array.isArray(
      (cmpSnap.resultPayload as any)?.assignments,
    )
      ? (cmpSnap.resultPayload as any).assignments
      : [];
    // F067 v1.1 scope filter — 兩邊都套
    const baseList = await this.scope.filterByEmplId<ResultAssignment>(
      baseListRaw,
      actor,
    );
    const cmpList = await this.scope.filterByEmplId<ResultAssignment>(
      cmpListRaw,
      actor,
    );

    // 摘要 dept / level diff
    const sumDept = this.aggregateBy(baseList, cmpList, (x) => x.deptId);
    const sumLevel = this.aggregateBy(baseList, cmpList, (x) => x.cardLevel);

    // 設定 diff
    const configDiff = this.diffConfig(
      baseSnap.configPayload,
      cmpSnap.configPayload,
    );

    // 人員配對 diff（NFR-005）
    const personnelMismatch = this.calcPersonnelMismatch(baseList, cmpList);

    // 客戶層級 diff（spec BR-4：依 applNo 集合運算）
    const baseSet = new Set(baseList.map((x) => x.applNo).filter(Boolean) as string[]);
    const cmpSet = new Set(cmpList.map((x) => x.applNo).filter(Boolean) as string[]);
    const added = [...cmpSet].filter((a) => !baseSet.has(a));
    const removed = [...baseSet].filter((a) => !cmpSet.has(a));

    // F067 v1.1：section_chief 視角 totalCases 為轄區內子集
    const filtered = this.scope.shouldFilter(actor);
    return {
      base: {
        runId: base.run_id,
        projectWorkym: base.project_workym,
        totalCases: filtered ? baseList.length : (base.total_cases ?? baseList.length),
      },
      compare: {
        runId: compare.run_id,
        projectWorkym: compare.project_workym,
        totalCases: filtered ? cmpList.length : (compare.total_cases ?? cmpList.length),
      },
      summary: {
        totalDiff: cmpList.length - baseList.length,
        deptDiff: sumDept,
        levelDiff: sumLevel.map((r) => ({
          cardLevel: r.deptId,
          baseCount: r.baseCount,
          compareCount: r.compareCount,
          diff: r.diff,
        })),
      },
      configDiff,
      personnelMismatch,
      customerDiff: {
        added: added.map((applNo) => ({ applNo })),
        removed: removed.map((applNo) => ({ applNo })),
      },
    };
  }

  // -------------------------------------------------------------------------
  // F067 比對匯出（xlsx）
  // -------------------------------------------------------------------------

  /**
   * F067 AC-3 + v1.1：比對差異匯出 xlsx（streaming）。
   * 3 個 sheet：summary / personnelMismatch / customerDiff。
   *
   * 重用 compareRuns() 已計算之 CompareResponse，避免重複 query payload。
   */
  async compareRunsExport(
    runA: string,
    runB: string,
    actorId?: string,
    actor?: ActorUser | null,
    options?: ExportOptions,
  ): Promise<ExportResult> {
    const cmp = await this.compareRuns(runA, runB, actor);
    const body = await this.buildCompareXlsxStreaming(
      cmp,
      options?.timeoutMs ?? EXPORT_TIMEOUT_MS_DEFAULT,
    );
    const shortA = cmp.base.runId.replace(/-/g, '').slice(0, 8);
    const shortB = cmp.compare.runId.replace(/-/g, '').slice(0, 8);
    const filename = `assignment_compare_${shortA}_${shortB}.xlsx`;
    const compareRowCount =
      cmp.personnelMismatch.list.length +
      cmp.customerDiff.added.length +
      cmp.customerDiff.removed.length;
    // F067 audit log：沿用 EXPORT action，entity_id 採 base run，after_value 加入兩端 run_id
    await this.writeAudit(cmp.base.runId, actorId, {
      format: 'xlsx',
      rowCount: compareRowCount,
      compareRunId: cmp.compare.runId,
    });
    return {
      filename,
      contentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      body,
      rowCount:
        cmp.personnelMismatch.list.length +
        cmp.customerDiff.added.length +
        cmp.customerDiff.removed.length,
    };
  }

  private async buildCompareXlsxStreaming(
    cmp: CompareResponse,
    timeoutMs: number,
  ): Promise<Buffer> {
    const sink = new PassThrough();
    const chunks: Buffer[] = [];
    sink.on('data', (chunk: Buffer) => chunks.push(chunk));
    const sinkEnd = new Promise<void>((resolve, reject) => {
      sink.once('end', () => resolve());
      sink.once('error', reject);
    });

    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
      stream: sink,
      useStyles: true,
      useSharedStrings: false,
    });

    // sheet 1：summary
    const summarySheet = workbook.addWorksheet('summary');
    summarySheet.columns = [
      { header: 'metric', key: 'metric' },
      { header: 'base', key: 'base' },
      { header: 'compare', key: 'compare' },
      { header: 'diff', key: 'diff' },
    ];
    summarySheet.getRow(1).font = { bold: true };
    summarySheet.getRow(1).commit();
    summarySheet
      .addRow({
        metric: 'totalCases',
        base: cmp.base.totalCases,
        compare: cmp.compare.totalCases,
        diff: cmp.summary.totalDiff,
      })
      .commit();
    for (const d of cmp.summary.deptDiff) {
      summarySheet
        .addRow({
          metric: `dept_${d.deptId}`,
          base: d.baseCount,
          compare: d.compareCount,
          diff: d.diff,
        })
        .commit();
    }
    for (const l of cmp.summary.levelDiff) {
      summarySheet
        .addRow({
          metric: `level_${l.cardLevel}`,
          base: l.baseCount,
          compare: l.compareCount,
          diff: l.diff,
        })
        .commit();
    }
    summarySheet
      .addRow({
        metric: 'personnelMismatchRate',
        base: '',
        compare: cmp.personnelMismatch.rate,
        diff: cmp.personnelMismatch.alert ? 'ALERT' : '',
      })
      .commit();
    summarySheet.commit();

    // sheet 2：personnelMismatch（NFR-005 主驗收清單）
    const pmSheet = workbook.addWorksheet('personnelMismatch');
    pmSheet.columns = [
      { header: 'appl_no', key: 'appl_no' },
      { header: 'base_emplid', key: 'base_emplid' },
      { header: 'compare_emplid', key: 'compare_emplid' },
    ];
    pmSheet.getRow(1).font = { bold: true };
    pmSheet.getRow(1).commit();
    for (const m of cmp.personnelMismatch.list) {
      pmSheet
        .addRow({
          appl_no: m.applNo,
          base_emplid: m.baseEmplId ?? '',
          compare_emplid: m.compareEmplId ?? '',
        })
        .commit();
    }
    pmSheet.commit();

    // sheet 3：customerDiff
    const cdSheet = workbook.addWorksheet('customerDiff');
    cdSheet.columns = [
      { header: 'change', key: 'change' },
      { header: 'appl_no', key: 'appl_no' },
    ];
    cdSheet.getRow(1).font = { bold: true };
    cdSheet.getRow(1).commit();
    for (const a of cmp.customerDiff.added) {
      cdSheet.addRow({ change: 'added', appl_no: a.applNo }).commit();
    }
    for (const r of cmp.customerDiff.removed) {
      cdSheet.addRow({ change: 'removed', appl_no: r.applNo }).commit();
    }
    cdSheet.commit();

    const writeAndFinish = (async () => {
      await workbook.commit();
      await sinkEnd;
    })();

    let timeoutHandle: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(
          new InternalServerErrorException({
            error: ERROR_CODES.EXPORT_FILE_EXPIRED,
            message: ERROR_MESSAGES.EXPORT_FILE_EXPIRED,
          }),
        );
      }, timeoutMs);
      if (typeof timeoutHandle.unref === 'function') timeoutHandle.unref();
    });

    try {
      await Promise.race([writeAndFinish, timeoutPromise]);
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
    return Buffer.concat(chunks);
  }

  // -------------------------------------------------------------------------
  // 內部 helpers
  // -------------------------------------------------------------------------

  private async requireRun(runId: string): Promise<AssignmentRun> {
    const run = await this.runRepo.findOne({ where: { run_id: runId } });
    if (!run) {
      throw new NotFoundException({
        error: ERROR_CODES.ASSIGNMENT_RUN_NOT_FOUND,
        message: ERROR_MESSAGES.ASSIGNMENT_RUN_NOT_FOUND,
      });
    }
    return run;
  }

  private async requireCompletedRun(runId: string): Promise<AssignmentRun> {
    const run = await this.requireRun(runId);
    if (run.status !== 'completed') {
      throw new UnprocessableEntityException({
        error: ERROR_CODES.ASSIGNMENT_RUN_NOT_COMPLETED,
        message: ERROR_MESSAGES.ASSIGNMENT_RUN_NOT_COMPLETED,
      });
    }
    return run;
  }

  private async loadAllPayloads(runId: string): Promise<{
    configPayload: Record<string, unknown> | null;
    inputListPayload: Record<string, unknown> | null;
    resultPayload: Record<string, unknown> | null;
  }> {
    const snaps = await this.snapshotRepo.find({ where: { run_id: runId } });
    const byType = new Map<string, Record<string, unknown>>();
    for (const s of snaps) byType.set(s.snapshot_type, s.payload);
    return {
      configPayload: byType.get('config') ?? null,
      inputListPayload: byType.get('input_list') ?? null,
      resultPayload: byType.get('result') ?? null,
    };
  }

  private csvEscape(v: unknown): string {
    if (v === null || v === undefined) return '';
    const s = String(v);
    if (/[,"\n\r]/.test(s)) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }

  private aggregateBy(
    base: ResultAssignment[],
    cmp: ResultAssignment[],
    key: (x: ResultAssignment) => string | null | undefined,
  ): Array<{
    deptId: string;
    baseCount: number;
    compareCount: number;
    diff: number;
  }> {
    const baseMap = new Map<string, number>();
    for (const x of base) {
      const k = key(x);
      if (!k) continue;
      baseMap.set(k, (baseMap.get(k) ?? 0) + 1);
    }
    const cmpMap = new Map<string, number>();
    for (const x of cmp) {
      const k = key(x);
      if (!k) continue;
      cmpMap.set(k, (cmpMap.get(k) ?? 0) + 1);
    }
    const keys = new Set([...baseMap.keys(), ...cmpMap.keys()]);
    return [...keys]
      .map((k) => {
        const b = baseMap.get(k) ?? 0;
        const c = cmpMap.get(k) ?? 0;
        return { deptId: k, baseCount: b, compareCount: c, diff: c - b };
      })
      .sort((a, b) => a.deptId.localeCompare(b.deptId));
  }

  private diffConfig(
    base: Record<string, unknown> | null,
    cmp: Record<string, unknown> | null,
  ): CompareResponse['configDiff'] {
    // card_version：取 levelcardLevels 最大 cardVersion
    const baseVer = this.extractMaxCardVersion(base);
    const cmpVer = this.extractMaxCardVersion(cmp);
    const cardVersionChanged =
      baseVer !== cmpVer ? { from: baseVer, to: cmpVer } : null;

    // 部門比例變更：依 (listNo, deptId) 比對 ration
    const baseDept = new Map<string, number>();
    for (const d of this.deptPctArray(base)) {
      baseDept.set(`${d.listNo}__${d.deptId}`, Number(d.ration));
    }
    const cmpDept = new Map<string, number>();
    for (const d of this.deptPctArray(cmp)) {
      cmpDept.set(`${d.listNo}__${d.deptId}`, Number(d.ration));
    }
    const allKeys = new Set([...baseDept.keys(), ...cmpDept.keys()]);
    const deptRatioChanges: Array<{
      listNo: string;
      deptId: string;
      from: number | null;
      to: number | null;
    }> = [];
    for (const k of allKeys) {
      const [listNo, deptId] = k.split('__');
      const fromV = baseDept.has(k) ? baseDept.get(k)! : null;
      const toV = cmpDept.has(k) ? cmpDept.get(k)! : null;
      if (fromV !== toV) {
        deptRatioChanges.push({ listNo, deptId, from: fromV, to: toV });
      }
    }

    // CR 規則：聚合所有 listDefinitions 中 crEnabled，任一不同則記
    const baseCr = this.aggregateCrEnabled(base);
    const cmpCr = this.aggregateCrEnabled(cmp);
    const crRuleChanged =
      baseCr !== cmpCr ? { from: baseCr, to: cmpCr } : null;

    return { cardVersionChanged, deptRatioChanges, crRuleChanged };
  }

  private extractMaxCardVersion(
    cfg: Record<string, unknown> | null,
  ): number | null {
    if (!cfg) return null;
    const arr = (cfg as any)?.levelcardLevels;
    if (!Array.isArray(arr) || arr.length === 0) return null;
    let max = -Infinity;
    for (const x of arr) {
      const v = Number(x?.cardVersion);
      if (Number.isFinite(v) && v > max) max = v;
    }
    return max === -Infinity ? null : max;
  }

  private deptPctArray(cfg: Record<string, unknown> | null): Array<{
    listNo: string;
    deptId: string;
    ration: string | number;
  }> {
    if (!cfg) return [];
    const arr = (cfg as any)?.deptPct;
    return Array.isArray(arr) ? arr : [];
  }

  private aggregateCrEnabled(
    cfg: Record<string, unknown> | null,
  ): boolean | null {
    if (!cfg) return null;
    const arr = (cfg as any)?.listDefinitions;
    if (!Array.isArray(arr) || arr.length === 0) return null;
    // 任一 list cr_enabled 為 true 即視為 true
    return arr.some((x: any) => x?.crEnabled === true);
  }

  private calcPersonnelMismatch(
    base: ResultAssignment[],
    cmp: ResultAssignment[],
  ): CompareResponse['personnelMismatch'] {
    const baseMap = new Map<string, string | null>();
    for (const x of base) {
      if (!x.applNo) continue;
      baseMap.set(x.applNo, x.emplid ?? null);
    }
    const cmpMap = new Map<string, string | null>();
    for (const x of cmp) {
      if (!x.applNo) continue;
      cmpMap.set(x.applNo, x.emplid ?? null);
    }
    // 共同案件
    const common = [...baseMap.keys()].filter((k) => cmpMap.has(k));
    const list: Array<{
      applNo: string;
      baseEmplId: string | null;
      compareEmplId: string | null;
    }> = [];
    for (const applNo of common) {
      const b = baseMap.get(applNo) ?? null;
      const c = cmpMap.get(applNo) ?? null;
      if (b !== c) list.push({ applNo, baseEmplId: b, compareEmplId: c });
    }
    const totalCount = common.length;
    const mismatchCount = list.length;
    const rate = totalCount === 0 ? 0 : mismatchCount / totalCount;
    return {
      list,
      mismatchCount,
      totalCount,
      rate: Math.round(rate * 10000) / 10000,
      alert: rate > AssignmentRunReportService.MISMATCH_ALERT_THRESHOLD,
    };
  }

  /**
   * 寫入匯出稽核 log（action='EXPORT'）。
   *
   * @param afterValue 完整 after_value 物件。
   *   - F064 v2.0（BR-F064-15）：`{ format, actorBusinessRole, scopedByCreator, exportedRowCount }`
   *   - F067 compareRunsExport：`{ format, rowCount, compareRunId }`（沿用 v1.1 shape）
   */
  private async writeAudit(
    runId: string,
    actorId: string | undefined,
    afterValue: Record<string, unknown>,
  ): Promise<void> {
    if (!actorId) return;
    try {
      await this.auditRepo.save(
        this.auditRepo.create({
          entity_type: 'assignment_run',
          entity_id: runId,
          action: 'EXPORT',
          actor_id: actorId,
          actor_name: actorId,
          before_value: null,
          after_value: afterValue,
          ip_address: null,
          created_at: new Date(),
        } as Partial<AssignmentAuditLog>),
      );
    } catch (err: any) {
      this.logger.error(
        `audit EXPORT write failed: run=${runId} err=${err?.message ?? err}`,
      );
    }
  }
}
