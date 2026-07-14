import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PassThrough, Readable } from 'stream';
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { AssignmentRunSnapshot } from '@/database/entities/assignment-run-snapshot.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';
import { ObDeptPct } from '@/database/entities/ob-dept-pct.entity';
import { ObMonthlyRunResult } from '@/database/entities/ob-monthly-run-result.entity';
import { ERROR_CODES, ERROR_MESSAGES } from '@/common/errors/error-codes';
import {
  SectionChiefScopeService,
  ActorUser,
} from './section-chief-scope.service';

export interface SummaryDeptRow {
  deptId: string;
  /** 部門名稱（ob_dept_pct.obdeptnm 即時解析）；查無對應 → null（前端 fallback 顯示代號）。 */
  deptName: string | null;
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
 * F066 v1.3 §5.3：分派結果分頁端點欄位 key（camelCase），順序**嚴格對齊** `EXPORT_HEADER_V2`
 * （23 欄）。前端據此渲染友善表格；rows 以本 key 建物件。與 `EXPORT_HEADER_V2` 一一對應，
 * 任一邊改動另一邊同步（長度相等由 getResultPage 單元測試 TC-RESULTPAGE-001 守住）。
 */
export const RESULT_COLUMN_KEYS = [
  'branchName', // 1  分處（pool.dept_name）
  'applNo', // 2  案號
  'assignday', // 3  指派日
  'listNo', // 4  名單代號
  'listNm', // 5  名單名稱
  'applDate', // 6  進件日
  'crId', // 7  CR_ID
  'crNm', // 8  CR_NM
  'isCr', // 9  是否分配CR
  'tierLevel', // 10 TIER
  'deptId', // 11 部門代號
  'deptName', // 12 部門名稱（emphire）
  'emplid', // 13 員編
  'empNm', // 14 姓名
  'titleName', // 15 職級
  'projectTp', // 16 專案類別
  'specName', // 17 專案名稱
  'overdueDay', // 18 逾期天數
  'proRate', // 19 客戶利率
  'staCode', // 20 STA_CODE
  'staCodeNa', // 21 案件狀態
  'brandName', // 22 廠牌名稱
  'monthCnt', // 23 名單週期月數
] as const;

/** getResultPage 查詢參數（F066 §5.3）。 */
export interface ResultPageParams {
  page?: number;
  pageSize?: number;
  /** 搜尋字串：比對 r.custo_no / r.emplid / r.appl_no（皆位於 ob_monthly_run_result）。 */
  q?: string;
}

/** getResultPage 回應（F066 §5.3）。rows 以 RESULT_COLUMN_KEYS 為 key。 */
export interface ResultPageResponse {
  runId: string;
  columns: Array<{ key: string; label: string }>;
  rows: Array<Record<string, string>>;
  page: number;
  pageSize: number;
  total: number;
}

/** F066 §5.3：pageSize 預設與上限。 */
const RESULT_PAGE_DEFAULT_SIZE = 50;
const RESULT_PAGE_MAX_SIZE = 200;

/** F116 §5.1：樞紐分析回應（部門名稱 × 員編 × 名單代號 計數；只回計數，佔比由前端換算）。 */
export interface PivotEmplidNode {
  emplid: string;
  empNm: string | null;
  total: number;
  byList: Record<string, number>;
}
export interface PivotDeptNode {
  deptName: string;
  total: number;
  byList: Record<string, number>;
  emplids: PivotEmplidNode[];
}
export interface PivotResponse {
  runId: string;
  listNos: string[];
  depts: PivotDeptNode[];
  grandByList: Record<string, number>;
  grandTotal: number;
}

/**
 * F108 / AD-E07-v3.7 §2：樞紐分析聚合結構（部門名稱 × 員編 × 名單代號 計數）。
 *
 * I-PIV-MEM-01：記憶體中**只保留小型聚合計數**（部門 × 員編 × 名單代號量級），
 *   不全載 7.7 萬筆明細列。各 Map 由 `accumulatePivot` 於既有匯出串流迴圈內 in-place 累加。
 */
export interface PivotAggregation {
  /** 原子計數：cell[deptName][emplid][listNo] = count */
  cell: Map<string, Map<string, Map<string, number>>>;
  /** 部門 × 名單 小計：deptByList[deptName][listNo] */
  deptByList: Map<string, Map<string, number>>;
  /** 全體 × 名單 欄總計：grandByList[listNo] */
  grandByList: Map<string, number>;
  /** 部門跨名單總計（「總計欄」部門列分母）：deptTotal[deptName] */
  deptTotal: Map<string, number>;
  /** 員編跨名單總計（「總計欄」員編列分子）：cellTotal[deptName][emplid] */
  cellTotal: Map<string, Map<string, number>>;
  /** 全體跨名單總計（grand total）*/
  grandTotal: number;
  /** 出現過的名單代號集合（確定性排序後為欄軸）*/
  listNos: Set<string>;
  /** 出現過的部門名稱集合（確定性排序後為外層列軸）*/
  deptNames: Set<string>;
  /** 各部門出現過的員編集合（確定性排序後為內層列軸）*/
  emplidsPerDept: Map<string, Set<string>>;
}

/** F108：emphire join-miss / emplid 空值之歸組標籤（對齊 Excel 樞紐空白項，BR-F108-03）。 */
const PIVOT_BLANK_LABEL = '(空白)';

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
    // F063：部門名稱即時解析來源（obdeptid → obdeptnm，by project_workym）
    @InjectRepository(ObDeptPct)
    private readonly deptPctRepo: Repository<ObDeptPct>,
    private readonly scope: SectionChiefScopeService,
    // F064 v2.0 / AD-E07-31：匯出多表 join 下推 + server-side cursor streaming（I-EXP-STREAM-01）
    private readonly dataSource: DataSource,
  ) {}

  // -------------------------------------------------------------------------
  // F066 v1.3 §5.3 — 分派結果友善分頁（對齊 F064 匯出 23 欄）
  // -------------------------------------------------------------------------

  /**
   * getResultPage — 分派結果分頁讀取（F066 §5.3 / AC-8）。
   *
   * 重用 F064 匯出之 join 血緣（ob_monthly_run_result r INNER JOIN ob_pool_data o
   * + LEFT JOIN ob_emphire e / ob_list_definition d）、`EXPORT_HEADER_V2`（欄標籤）與
   * `formatRow()`（欄值格式），使畫面與匯出 Excel 逐欄一致。
   *
   * - 排序固定 (list_no, orgno, appl_no)，與匯出 I-EXP-DET-01 一致。
   * - 分頁採 QueryBuilder limit/offset（dialect 自動：mssql OFFSET/FETCH、sqlite LIMIT/OFFSET）。
   * - `total` 以 `COUNT(*)` over r（+ scope + 搜尋）計；搜尋欄位皆在 r 上，免 join 巨量 pool 表。
   * - 搜尋 q 精確比對 r.custo_no / r.emplid / r.appl_no。
   * - 處長走 scopeByCreator（r.emplid IN (...)；無轄區 → total=0 + 空 rows，回 200 不 403，同 BR-6）。
   * - run 不存在 → 404 ASSIGNMENT_RUN_NOT_FOUND（AC-5）。
   */
  async getResultPage(
    runId: string,
    params: ResultPageParams,
    actor?: ActorUser | null,
  ): Promise<ResultPageResponse> {
    const run = await this.runRepo.findOne({ where: { run_id: runId } });
    if (!run) {
      throw new NotFoundException({
        error: ERROR_CODES.ASSIGNMENT_RUN_NOT_FOUND,
        message: ERROR_MESSAGES.ASSIGNMENT_RUN_NOT_FOUND,
      });
    }

    const page = Math.max(1, Math.floor(params.page ?? 1));
    const pageSize = Math.min(
      RESULT_PAGE_MAX_SIZE,
      Math.max(1, Math.floor(params.pageSize ?? RESULT_PAGE_DEFAULT_SIZE)),
    );
    const q = params.q?.trim();

    // 處長轄區 emplid（一次取得，count / page 共用）；null = 不過濾（部長 / admin）。
    let scopeEmplIds: string[] | null = null;
    if (this.scope.shouldFilter(actor)) {
      scopeEmplIds = [...(await this.scope.getScopeEmplIds(actor!.userId))];
    }

    const repo = this.dataSource.getRepository(ObMonthlyRunResult);
    const applyFilters = (qb: SelectQueryBuilder<ObMonthlyRunResult>) => {
      qb.where('r.run_id = :runId', { runId });
      if (scopeEmplIds !== null) {
        if (scopeEmplIds.length === 0) {
          qb.andWhere('1 = 0'); // 無轄區 → 永不匹配（回 total=0，不 403；BR-6）
        } else {
          qb.andWhere('r.emplid IN (:...emplIds)', { emplIds: scopeEmplIds });
        }
      }
      if (q) {
        qb.andWhere('(r.custo_no = :q OR r.emplid = :q OR r.appl_no = :q)', { q });
      }
      return qb;
    };

    // total：僅數 r（血緣保證每列必有對應 ob_pool_data，INNER JOIN 不減列），免 join 巨量 pool。
    const total = await applyFilters(repo.createQueryBuilder('r')).getCount();

    // I-EXP-APLDATE-FMT-01：進件日於 SQL 端字串化（mssql），繞開時區 getter 歧義；sqlite 走裸欄。
    const applDateExpr =
      this.dataSource.options.type === 'mssql'
        ? 'CONVERT(varchar(10), o.appl_date, 120)'
        : 'o.appl_date';

    const pageQb = applyFilters(
      repo
        .createQueryBuilder('r')
        .innerJoin('ob_pool_data', 'o', 'o.orgno = r.orgno AND o.appl_no = r.appl_no')
        .leftJoin('ob_emphire', 'e', 'e.emp_id = r.emplid')
        .leftJoin('ob_list_definition', 'd', 'd.list_no = r.list_no'),
    )
      .select('o.dept_name', 'dept_name')
      .addSelect('r.appl_no', 'appl_no')
      .addSelect('r.assignday', 'assignday')
      .addSelect('r.list_no', 'list_no')
      .addSelect('d.list_nm', 'list_nm')
      .addSelect(applDateExpr, 'appl_date')
      .addSelect('r.cr_id', 'cr_id')
      .addSelect('r.cr_nm', 'cr_nm')
      .addSelect('r.is_cr', 'is_cr')
      .addSelect('r.tier_level', 'tier_level')
      .addSelect('r.dept_id', 'dept_id')
      .addSelect('e.dept_name', 'emphire_dept_name')
      .addSelect('r.emplid', 'emplid')
      .addSelect('e.emp_nm', 'emp_nm')
      .addSelect('e.title_name', 'title_name')
      .addSelect('o.project_tp', 'project_tp')
      .addSelect('o.spec_name', 'spec_name')
      .addSelect('o.overdue_day', 'overdue_day')
      .addSelect('o.pro_rate', 'pro_rate')
      .addSelect('o.sta_code', 'sta_code')
      .addSelect('o.sta_code_na', 'sta_code_na')
      .addSelect('o.brand_name', 'brand_name')
      .addSelect('o.month_cnt', 'month_cnt')
      .orderBy('r.list_no', 'ASC')
      .addOrderBy('r.orgno', 'ASC')
      .addOrderBy('r.appl_no', 'ASC')
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const raw = await pageQb.getRawMany<RawExportRow>();

    const columns = RESULT_COLUMN_KEYS.map((key, i) => ({
      key,
      label: EXPORT_HEADER_V2[i],
    }));
    const rows = raw.map((rr) => {
      const formatted = this.formatRow(rr).row;
      const obj: Record<string, string> = {};
      RESULT_COLUMN_KEYS.forEach((key, i) => {
        obj[key] = formatted[i];
      });
      return obj;
    });

    return { runId, columns, rows, page, pageSize, total };
  }

  // -------------------------------------------------------------------------
  // F116 §5.1 — 樞紐分析（部門名稱 × 員編 × 名單代號 案號計數）
  // -------------------------------------------------------------------------

  /**
   * getPivot — 樞紐分析聚合（F116）。
   *
   * 來源 `ob_monthly_run_result r` LEFT JOIN `ob_emphire e ON e.emp_id = r.emplid`，
   * `GROUP BY e.dept_name, r.emplid, e.emp_nm, r.list_no` 計數。**不 join ob_pool_data**
   * （樞紐不需 pool 業務欄，且省去巨量表 join）。dept/emplid 空 → 歸組 '(空白)'。
   * 語意對齊 F108 匯出樞紐頁（accumulatePivot：部門＝承辦人員所屬 emphire.dept_name）。
   *
   * 只回計數；佔比（% of parent row）由前端換算。處長走 scopeByCreator；run 不存在 → 404。
   */
  async getPivot(runId: string, actor?: ActorUser | null): Promise<PivotResponse> {
    const run = await this.runRepo.findOne({ where: { run_id: runId } });
    if (!run) {
      throw new NotFoundException({
        error: ERROR_CODES.ASSIGNMENT_RUN_NOT_FOUND,
        message: ERROR_MESSAGES.ASSIGNMENT_RUN_NOT_FOUND,
      });
    }

    const repo = this.dataSource.getRepository(ObMonthlyRunResult);
    const qb = repo
      .createQueryBuilder('r')
      .leftJoin('ob_emphire', 'e', 'e.emp_id = r.emplid')
      .select('e.dept_name', 'deptName')
      .addSelect('r.emplid', 'emplid')
      .addSelect('e.emp_nm', 'empNm')
      .addSelect('r.list_no', 'listNo')
      .addSelect('COUNT(*)', 'cnt')
      .where('r.run_id = :runId', { runId })
      .groupBy('e.dept_name')
      .addGroupBy('r.emplid')
      .addGroupBy('e.emp_nm')
      .addGroupBy('r.list_no');

    if (this.scope.shouldFilter(actor)) {
      const emplids = [...(await this.scope.getScopeEmplIds(actor!.userId))];
      if (emplids.length === 0) {
        qb.andWhere('1 = 0');
      } else {
        qb.andWhere('r.emplid IN (:...emplIds)', { emplIds: emplids });
      }
    }

    const rows = await qb.getRawMany<{
      deptName: string | null;
      emplid: string | null;
      empNm: string | null;
      listNo: string;
      cnt: number | string;
    }>();

    // ---- in-memory 聚合為巢狀結構 ----
    interface DeptAgg {
      total: number;
      byList: Map<string, number>;
      emplids: Map<string, { empNm: string | null; total: number; byList: Map<string, number> }>;
    }
    const deptMap = new Map<string, DeptAgg>();
    const listSet = new Set<string>();
    const grandByList = new Map<string, number>();
    let grandTotal = 0;

    for (const row of rows) {
      const listNo = String(row.listNo);
      const cnt = Number(row.cnt) || 0;
      const deptName = row.deptName ? String(row.deptName) : PIVOT_BLANK_LABEL;
      const emplid = row.emplid ? String(row.emplid) : PIVOT_BLANK_LABEL;

      listSet.add(listNo);
      grandByList.set(listNo, (grandByList.get(listNo) ?? 0) + cnt);
      grandTotal += cnt;

      let dept = deptMap.get(deptName);
      if (!dept) {
        dept = { total: 0, byList: new Map(), emplids: new Map() };
        deptMap.set(deptName, dept);
      }
      dept.total += cnt;
      dept.byList.set(listNo, (dept.byList.get(listNo) ?? 0) + cnt);

      let emp = dept.emplids.get(emplid);
      if (!emp) {
        emp = { empNm: row.empNm ?? null, total: 0, byList: new Map() };
        dept.emplids.set(emplid, emp);
      }
      if (emp.empNm == null && row.empNm != null) emp.empNm = row.empNm;
      emp.total += cnt;
      emp.byList.set(listNo, (emp.byList.get(listNo) ?? 0) + cnt);
    }

    const byBlankLast = (a: string, b: string) => {
      if (a === PIVOT_BLANK_LABEL) return 1;
      if (b === PIVOT_BLANK_LABEL) return -1;
      return a.localeCompare(b);
    };
    const mapToObj = (m: Map<string, number>) => Object.fromEntries(m);

    const listNos = [...listSet].sort();
    const depts: PivotDeptNode[] = [...deptMap.entries()]
      .sort((a, b) => byBlankLast(a[0], b[0]))
      .map(([deptName, d]) => ({
        deptName,
        total: d.total,
        byList: mapToObj(d.byList),
        emplids: [...d.emplids.entries()]
          .sort((a, b) => byBlankLast(a[0], b[0]))
          .map(([emplid, e]) => ({
            emplid,
            empNm: e.empNm,
            total: e.total,
            byList: mapToObj(e.byList),
          })),
      }));

    return {
      runId,
      listNos,
      depts,
      grandByList: mapToObj(grandByList),
      grandTotal,
    };
  }

  // -------------------------------------------------------------------------
  // F063 結果摘要
  // -------------------------------------------------------------------------

  async getSummary(runId: string, actor?: ActorUser | null): Promise<SummaryResponse> {
    const run = await this.requireCompletedRun(runId);

    // ⚡ 效能（I-SUMMARY-SQL-01）：改以 SQL 聚合 ob_monthly_run_result（run_id 有索引），取代
    //   loadAllPayloads 載入巨大 result / input_list 快照 payload（115K 筆 JSON；MSSQL ntext 讀取
    //   + JSON.parse 約 45s → 前端 axios 逾時「資料無法載入」）。SQL GROUP BY 於同資料上 <1s。
    //   下推路徑（PG/MSSQL 皆是）input_list == result == COUNT(*)（同一批 result 列，見
    //   assignment-run-pipeline.service Bug A / 「有界子集供快照 payload」）→ stage1Count == stage4Count。
    // F063 v1.1 BR-6 / BR-7：section_chief scope → emplid IN 轄區；director / admin bypass。
    const shouldFilter = this.scope.shouldFilter(actor);
    const scopeIds = shouldFilter
      ? Array.from(await this.scope.getScopeEmplIds(actor!.userId))
      : null;

    const resultRepo = this.dataSource.getRepository(ObMonthlyRunResult);
    const scoped = (
      qb: SelectQueryBuilder<ObMonthlyRunResult>,
    ): SelectQueryBuilder<ObMonthlyRunResult> => {
      qb.where('r.run_id = :runId', { runId });
      if (scopeIds) {
        // 轄區為空 → 無可見列（1=0）；否則 emplid IN 轄區（NULL emplid 自然被排除，對齊 filterByEmplId）。
        if (scopeIds.length === 0) qb.andWhere('1 = 0');
        else qb.andWhere('r.emplid IN (:...scopeIds)', { scopeIds });
      }
      return qb;
    };

    // 總數 + distinct emplid（COUNT(DISTINCT) 自動略過 NULL，對齊原 emplSet 略過 null）。
    const totals = await scoped(
      resultRepo
        .createQueryBuilder('r')
        .select('COUNT(*)', 'cnt')
        .addSelect('COUNT(DISTINCT r.emplid)', 'emps'),
    ).getRawOne<{ cnt: string; emps: string }>();
    const stage4Count = Number(totals?.cnt ?? 0);
    const emplCount = Number(totals?.emps ?? 0);
    const stage1Count = stage4Count; // 下推 invariant：input_list == result（同批列）
    const coverageRate = stage1Count === 0 ? 0 : stage4Count / stage1Count;

    // 部門實際分派數（GROUP BY dept_id，略過 NULL；對齊原 deptActual）。
    const deptQb = scoped(
      resultRepo
        .createQueryBuilder('r')
        .select('r.dept_id', 'deptId')
        .addSelect('COUNT(*)', 'cnt'),
    );
    deptQb.andWhere('r.dept_id IS NOT NULL').groupBy('r.dept_id');
    const deptRows = await deptQb.getRawMany<{ deptId: string; cnt: string }>();
    const deptActual = new Map<string, number>();
    for (const row of deptRows) deptActual.set(row.deptId, Number(row.cnt));

    // 部門實際「數量」與「比例」一律以全 run（未 scope）為基準：部門的實際比例＝該部門占「整批
    // 月名單分派」的份額，與 configRatio（部門設定占全公司比例）同基準、與部長視角一致。
    // 若以 scoped 分母（stage4Count＝處長轄區子集）計，處長會看到自己部門 actualRatio≈100%、
    // deviation 假警示，且與部長檢視同一部門的數字不符（F063/F111 Block 4 bug）。可視部門（列出
    // 哪些 dept）仍依 scope 限縮（見下方 allDeptIds），但每列的 actualCount / actualRatio 取全 run。
    // director / admin 之 scoped 即全 run，直接重用 stage4Count / deptActual，不重複查詢。
    let wholeRunTotal = stage4Count;
    let wholeDeptActual = deptActual;
    if (shouldFilter) {
      const wholeTotalsRow = await resultRepo
        .createQueryBuilder('r')
        .select('COUNT(*)', 'cnt')
        .where('r.run_id = :runId', { runId })
        .getRawOne<{ cnt: string }>();
      wholeRunTotal = Number(wholeTotalsRow?.cnt ?? 0);
      const wholeDeptRows = await resultRepo
        .createQueryBuilder('r')
        .select('r.dept_id', 'deptId')
        .addSelect('COUNT(*)', 'cnt')
        .where('r.run_id = :runId', { runId })
        .andWhere('r.dept_id IS NOT NULL')
        .groupBy('r.dept_id')
        .getRawMany<{ deptId: string; cnt: string }>();
      wholeDeptActual = new Map<string, number>();
      for (const row of wholeDeptRows) {
        wholeDeptActual.set(row.deptId, Number(row.cnt));
      }
    }

    // 部門設定比例：聚合 config 快照 deptPct 各 deptId 的 ration 平均（spec L62「設定比例」；
    //   只載 config 快照——體積小、非 result/input_list 巨大 payload）。
    const configSnap = await this.snapshotRepo.findOne({
      where: { run_id: runId, snapshot_type: 'config' },
    });
    const deptConfigRatio = new Map<string, number>();
    const deptConfigSum = new Map<string, { sum: number; cnt: number }>();
    const cfgDeptPct: Array<{ deptId: string; ration: string | number }> =
      Array.isArray((configSnap?.payload as any)?.deptPct)
        ? ((configSnap!.payload as any).deptPct as Array<{
            deptId: string;
            ration: string | number;
          }>)
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

    // 部門名稱即時解析（by run 的 project_workym）：部門代號（如 XVE1）對 user 無意義，
    // 改以 ob_dept_pct.obdeptnm 顯示。名稱為顯示用、不影響分析值；同代號多名單取第一個非空名稱；
    // 查無對應 → null（前端 fallback 顯示代號）。即時查表故對既有 run 亦立即生效（不依賴快照）。
    const deptNameMap = new Map<string, string>();
    const deptPctRows = await this.deptPctRepo.find({
      where: { project_workym: run.project_workym },
    });
    for (const d of deptPctRows) {
      const name = (d.obdeptnm ?? '').trim();
      if (!name) continue;
      if (!deptNameMap.has(d.obdeptid)) deptNameMap.set(d.obdeptid, name);
    }

    const deptSummary: SummaryDeptRow[] = [];
    for (const deptId of allDeptIds) {
      const actualCount = wholeDeptActual.get(deptId) ?? 0;
      // 排除「未分派部門」（actualCount=0）：部門於 ob_dept_pct 有設定比例但本次月名單分派無任何實際
      // 分派時，其 deviation 恆為 -configRatio（假警示）、實際比例 0%，對使用者無意義 → 不列入
      // deptSummary（連動上方「分派部門數」stat card、部門偏差 chart 與 NFR-005 footer 一次收斂）。
      if (actualCount === 0) continue;
      const actualRatio =
        wholeRunTotal === 0
          ? 0
          : Math.round(((actualCount / wholeRunTotal) * 100) * 10) / 10;
      const configRatio =
        Math.round((deptConfigRatio.get(deptId) ?? 0) * 10) / 10;
      const deviation =
        Math.round((actualRatio - configRatio) * 10) / 10;
      const alert =
        Math.abs(deviation) >
        AssignmentRunReportService.DEVIATION_ALERT_THRESHOLD;
      deptSummary.push({
        deptId,
        deptName: deptNameMap.get(deptId) ?? null,
        configRatio,
        actualCount,
        actualRatio,
        deviation,
        alert,
      });
    }
    deptSummary.sort((a, b) => a.deptId.localeCompare(b.deptId));

    // 等級分佈（GROUP BY card_level，略過 NULL）。
    const levelQb = scoped(
      resultRepo
        .createQueryBuilder('r')
        .select('r.card_level', 'cardLevel')
        .addSelect('COUNT(*)', 'cnt'),
    );
    levelQb.andWhere('r.card_level IS NOT NULL').groupBy('r.card_level');
    const levelRows = await levelQb.getRawMany<{
      cardLevel: string;
      cnt: string;
    }>();
    const levelDistribution: SummaryLevelRow[] = levelRows
      .map((row) => {
        const count = Number(row.cnt);
        return {
          cardLevel: row.cardLevel,
          count,
          ratio:
            stage4Count === 0
              ? 0
              : Math.round(((count / stage4Count) * 100) * 10) / 10,
        };
      })
      .sort((a, b) => a.cardLevel.localeCompare(b.cardLevel));

    // TIER_LEVEL 分佈（F063 gap fix；對齊 prototype「fn_calc_tier_level 計算結果」chart）。
    // tier_level 由 F100/F101 月名單分派計分寫入（score→card_level→tier）；NULL 不計入。
    const tierQb = scoped(
      resultRepo
        .createQueryBuilder('r')
        .select('r.tier_level', 'tierLevel')
        .addSelect('COUNT(*)', 'cnt'),
    );
    tierQb.andWhere('r.tier_level IS NOT NULL').groupBy('r.tier_level');
    const tierRows = await tierQb.getRawMany<{
      tierLevel: string;
      cnt: string;
    }>();
    const tierDistribution: SummaryTierRow[] = tierRows
      .map((row) => {
        const count = Number(row.cnt);
        return {
          tierLevel: row.tierLevel,
          count,
          ratio:
            stage4Count === 0
              ? 0
              : Math.round((count / stage4Count) * 100 * 10) / 10,
        };
      })
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
    // AD-E07-38 P1c / Pattern B（I-MSSQL-PARAM-01 / PARAM-012）：
    //   主參數 `$1` → `:runId`；scope 巢狀 `$2..$N` → `:...emplIds`；兩者組成**單一**具名參數
    //   SQL 字串，交由**同一次** driver.escapeQueryWithParameters 展開（PG $n / SQLite ? / MSSQL @n）。
    //   不可拆兩段個別編號（否則 positional 基準不同步 → 錯誤 SQL）。
    const namedParams: Record<string, unknown> = { runId };
    let scopeClause = '';
    let scopedByCreator = false;

    if (this.scope.shouldFilter(actor)) {
      scopedByCreator = true;
      const scope = await this.scope.getScopeEmplIds(actor!.userId);
      const emplids = [...scope];
      if (emplids.length === 0) {
        // 無轄區 → 永不匹配（BR-F064-14：仍回 200 + 僅表頭）。1=0 確保 0 列。
        // ⚠️ 空陣列不可走 IN (:...emplIds)（展開為 IN () 於多數 dialect 為語法錯誤，見 ESCAPE-004）。
        scopeClause = ' AND 1 = 0';
      } else {
        scopeClause = ' AND r.emplid IN (:...emplIds)';
        namedParams.emplIds = emplids;
      }
    }

    // AD-E07-43 P5-followup（I-EXP-APLDATE-FMT-01 / GATE-001）：進件日於 **SQL 端**格式化為
    //   'YYYY-MM-DD' 字串，繞開 formatApplDate 之 JS Date getter 時區歧義（P5h §7 AD-3）：
    //   MSSQL（useUTC:true）之 datetime2 wall-clock ≥16:00 經本地 getter 會 +1 日——CONVERT 對 DB 儲存值於
    //   SQL 端直接運算，不經 tedious 之 JS Date 轉換 → 得正確 wall-clock 日期；產出字串走 formatApplDate
    //   之字串分支（slice(0,10)），與時區無關。
    // ⚠️ GATE-001：dialect 運算式必須 **inline 於本方法體**（含字面 `o.appl_date`），使既有 sliceFn
    //   靜態測試仍能切片到 `o.appl_date`；勿抽外部 helper。
    // ⚠️ GATE-003：sqlite（非 mssql 預設分支）維持裸 `o.appl_date`——匯出功能之生產 runtime 僅 mssql；
    //   sqlite 單元測試 mock cursorRows，此 SQL 從不對 sqlite 執行。
    const dbType = this.dataSource.options.type;
    const applDateExpr =
      dbType === 'mssql'
        ? 'CONVERT(varchar(10), o.appl_date, 120)'
        : 'o.appl_date'; // sqlite（測試）；PG 已移除

    // I-EXP-LINEAGE-01（F064 v2.1 修正）：pool 屬性取自 **ob_pool_data o**（共享池，PK=orgno+appl_no），
    // **非** ob_pool_data_list（per-list 去重表）。月名單分派 Stage 1 為
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
        ${applDateExpr}                      AS appl_date,
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
      WHERE r.run_id = :runId${scopeClause}
      ORDER BY r.list_no, r.orgno, r.appl_no
    `;

    // 單一次 escapeQueryWithParameters 展開 :runId 與 :...emplIds（PARAM-012）；
    // cursorRows 於 PG 端沿用展開後之 $1..$N + positional params（行為不變）。
    const [expandedSql, params] =
      this.dataSource.manager.connection.driver.escapeQueryWithParameters(
        sql,
        namedParams,
        {},
      );

    return { sql: expandedSql, params, scopedByCreator };
  }

  /** F064 v2.0：server-side cursor 每批 FETCH 列數（記憶體與往返次數權衡）。 */
  private static readonly EXPORT_FETCH_BATCH = 500;

  /**
   * F064 MSSQL keyset 分頁每批列數。取 2000（> PG 之 500）以攤薄對 dev CDMP 遠端連線之往返延遲：
   * keyset 每頁為固定成本索引 seek（與深度無關），加大 batch 只減往返數、不增每列成本。
   * 實測 202607（115,197 列）58 頁、7.4s、逐列不漏不重（distinct==total）。
   */
  private static readonly EXPORT_FETCH_BATCH_MSSQL = 2000;

  /**
   * F064 v2.0 共用 row-producer（I-EXP-STREAM-01）：PostgreSQL **native server-side cursor**
   * （DECLARE … CURSOR + FETCH n）逐批 yield raw row，**不使用 OFFSET 分頁**（I-EXP-NOOFFSET-01）。
   *
   * 採 native cursor（非 TypeORM stream()）以避免引入 `pg-query-stream` 新依賴；
   * cursor 須在 transaction 內宣告，逐批 FETCH 直至 0 列後 CLOSE + COMMIT + release。
   *
   * 回傳 objectMode Readable（push raw row 物件）；xlsx / CSV producer 以 `for await` 共用消費。
   * SQLite（單元 / Integration 測試）無 native cursor → 由測試 mock 本方法（cursorRows）。
   *
   * GAP 2（MSSQL 遷移）：MSSQL 無 PG 之 `DECLARE … NO SCROLL CURSOR … FETCH n` 語法（第一句
   *   DECLARE 即拋語法錯誤 500）→ dbType==='mssql' 改走 `cursorRowsMssql`（OFFSET/FETCH 分頁）。
   *   PG 路徑（以下本體）保持位元組不變。
   */
  protected async cursorRows(query: ExportQuerySpec): Promise<Readable> {
    if (this.dataSource.options.type === 'mssql') {
      return this.cursorRowsMssql(query);
    }
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
   * F064 GAP 2（MSSQL 遷移）：MSSQL cursorRows 分支 — **keyset（seek）分頁**，複刻 PG server-side
   *   cursor 之 streaming 語義（每往返取 n 列、逐列 yield、不全載記憶體），且 O(n) 不隨深度退化。
   *
   * 🔴 為何不用 OFFSET/FETCH（前版）：`OFFSET @k ROWS FETCH NEXT n` 每頁自頭重跑 join+sort 再丟棄前
   *   k 列（O(n²)）。dev CDMP 202607（115,197 列）實測 offset 50k 單頁 5.5s、全跑外推 >20min → 逾
   *   `EXPORT_TIMEOUT_MS_DEFAULT`(5min) → 匯出逾時失敗（本次修復起因）。keyset 每頁為固定成本索引 seek
   *   （實測深頁 ~0.3s，與深度無關）；改後 58 頁、7.4s、逐列不漏不重。
   *
   * 作法：以 ORDER BY 之唯一鍵 (list_no, orgno, appl_no) 為游標，逐頁 `WHERE …前綴… AND (key > 上一頁末列)`。
   *   正確性依賴該鍵於**單一 run 唯一**（DoD 實測 distinct==total==115197）→ 嚴格 `>` 展開之三段式
   *   tuple 比較不漏不重。列集合／順序與 PG 路徑逐列相同（同一 SELECT／ORDER BY）。
   *
   * ⚠️ orgno 未在 23 欄輸出投影內 → 注入隱藏欄 `_ks_orgno` 供游標追蹤（formatRow 依欄名取值，忽略此欄，
   *   xlsx/CSV 輸出不變）。注入點以 buildExportQuery 之固定字面（`FROM ob_monthly_run_result r` /
   *   `ORDER BY r.list_no, r.orgno, r.appl_no`）定位。
   *
   * 參數：query.sql 已由 escapeQueryWithParameters 展開為 @0..@{N-1}（positional）；游標三值佔下一批位置
   *   @N(list)/@{N+1}(orgno)/@{N+2}(appl)，於述詞中重複引用（tedious 允許同一具名 input 多處引用）。
   *   第一頁無游標述詞，僅帶既有 @0..@{N-1}。索引依 TypeORM SqlServerQueryRunner array-index 綁定：@k ↔ params[k]。
   *
   * 一致性：匯出對象為**已完成**月名單分派之 result 快照（run 完成後 ob_monthly_run_result 不再異動）→ 各頁
   *   間免快照隔離即穩定，故不需 transaction（PG 之 tx 僅為 cursor 生命週期所需）。
   */
  private async cursorRowsMssql(query: ExportQuerySpec): Promise<Readable> {
    const batch = AssignmentRunReportService.EXPORT_FETCH_BATCH_MSSQL;
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    // 注入隱藏游標欄 _ks_orgno（供 keyset 追蹤；formatRow 依名取值故忽略之）。
    const ORDER_BY = 'ORDER BY r.list_no, r.orgno, r.appl_no';
    const withKeyCol = query.sql.replace(
      '\n      FROM ob_monthly_run_result r',
      ',\n        r.orgno AS _ks_orgno\n      FROM ob_monthly_run_result r',
    );
    const orderByIdx = withKeyCol.lastIndexOf(ORDER_BY);
    // head = SELECT … FROM … WHERE …（游標述詞插入於 head 尾、ORDER BY 之前）。
    const head = withKeyCol.slice(0, orderByIdx).trimEnd();
    const base = query.params.length; // 既有 @0..@{base-1}；游標三值取 @base/@{base+1}/@{base+2}

    // 游標值（上一頁最後一列之鍵）；null = 尚在第一頁（無 keyset 述詞）。
    let curList: unknown = null;
    let curOrgno: unknown = null;
    let curAppl: unknown = null;
    let ended = false;
    const cleanup = async (): Promise<void> => {
      if (ended) return;
      ended = true;
      await queryRunner.release();
    };

    const readable = new Readable({
      objectMode: true,
      read() {
        void (async () => {
          try {
            const seek =
              curList === null
                ? ''
                : ` AND (r.list_no > @${base}` +
                  ` OR (r.list_no = @${base} AND r.orgno > @${base + 1})` +
                  ` OR (r.list_no = @${base} AND r.orgno = @${base + 1} AND r.appl_no > @${base + 2}))`;
            const pageSql = `${head}${seek}\n      ${ORDER_BY}\n      OFFSET 0 ROWS FETCH NEXT ${batch} ROWS ONLY`;
            const params =
              curList === null
                ? query.params
                : [...query.params, curList, curOrgno, curAppl];
            const rows: RawExportRow[] = await queryRunner.query(pageSql, params);
            if (!rows || rows.length === 0) {
              await cleanup();
              this.push(null);
              return;
            }
            // 先推進游標（同步），再逐列 push；下一次 read() 以新游標 seek。
            const last = rows[rows.length - 1] as RawExportRow & {
              _ks_orgno?: unknown;
            };
            curList = last.list_no;
            curOrgno = last._ks_orgno;
            curAppl = last.appl_no;
            for (const row of rows) {
              this.push(row);
            }
            // 短批（< batch）＝最後一頁：本批推畢即結束，省一次空往返。
            if (rows.length < batch) {
              await cleanup();
              this.push(null);
            }
          } catch (err) {
            await cleanup();
            this.destroy(err as Error);
          }
        })();
      },
    });
    // 消費端提前中止（error / destroy）→ 釋放 queryRunner
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
   * ⚠️ AD-E07-43 P5h 更正（原註解誤述 PG 行為）：appl_date 於 PG 為 `timestamp`、MSSQL 為
   *    `datetime2`（dateColumnType），非 `date`；且 appl_date 恆帶非午夜時分（P5c §5）。
   *    - PG：node-postgres 將 `timestamp without time zone` 解析為 Date 時，其**本地時區分量**
   *      即為 DB 儲存之 wall-clock（'2015-05-18 15:24' → 本地 15:24），故 Date 分支用本地
   *      getter（getFullYear/getMonth/getDate）取得正確 wall-clock 日期。
   *    - MSSQL（P5h：連線層 useUTC:true）：tedious 以 **UTC 分量**建構 Date（UTC 分量＝wall-clock），
   *      此時應以 UTC getter 取 wall-clock 日期。兩引擎之 wall-clock 落在不同分量，**無單一 getter
   *      對兩者皆正確**（改任一側 getter 會使另一引擎於邊界時分〔PG <08:00 / MSSQL ≥16:00〕漂移），
   *      故本連線層切片刻意不改此匯出 Date 分支之 getter；根治方向＝於 SQL 端格式化為字串走字串分支
   *      （P5h impl log 列為 follow-up，非阻擋）。字串分支取前 10 碼，不受此影響。
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

    // F108 / I-PIV-MEM-01：樞紐聚合狀態（只存計數，不全載明細列）。
    const pivotAgg = this.createPivotAggregation();

    const writeAndFinish = (async () => {
      const source = await this.cursorRows(query);
      for await (const raw of source as AsyncIterable<RawExportRow>) {
        const formatted = this.formatRow(raw);
        onRow(formatted);
        // 以字串型別逐欄寫入（防 Excel 將指派日 / 進件日誤判為數字序號，I-EXP-FMT-01）
        sheet.addRow(formatted.row).commit();
        // F108 / I-PIV-SOURCE-01：同步累加樞紐計數（同一 scoped cursor，無第 2 次查詢）。
        this.accumulatePivot(raw, pivotAgg);
      }
      sheet.commit();

      // F108 / I-PIV-SHEET-01：第 2 頁「樞紐分析」必須在 sheet 1 commit 後再 add/write/commit
      //   （WorkbookWriter streaming：每個 worksheet 於 commit 時即壓入 ZIP；AD-E07-v3.7 §5）。
      const pivotSheet = workbook.addWorksheet('樞紐分析');
      this.writePivotSheet(pivotSheet, pivotAgg);
      pivotSheet.commit();

      await workbook.commit();
      await sinkEnd;
    })();

    await this.raceTimeout(writeAndFinish, timeoutMs);
    return Buffer.concat(chunks);
  }

  // -------------------------------------------------------------------------
  // F108 樞紐分析（% of parent row 靜態交叉表）
  // -------------------------------------------------------------------------

  /** F108 / AD-E07-v3.7 §8.1：初始化空的 PivotAggregation 結構。 */
  private createPivotAggregation(): PivotAggregation {
    return {
      cell: new Map(),
      deptByList: new Map(),
      grandByList: new Map(),
      deptTotal: new Map(),
      cellTotal: new Map(),
      grandTotal: 0,
      listNos: new Set(),
      deptNames: new Set(),
      emplidsPerDept: new Map(),
    };
  }

  /**
   * F108 / AD-E07-v3.7 §3.1 / §8.2：讀取 RawExportRow 三欄（emphire_dept_name / emplid / list_no），
   * 正規化分組鍵（null / 空字串 → '(空白)'；list_no 空 → 跳過），in-place 累加各計數器。
   *
   * I-PIV-MEM-01：只更新 Map 計數，**不保留明細列**（不 push raw、不 Buffer.concat）。
   */
  private accumulatePivot(raw: RawExportRow, agg: PivotAggregation): void {
    const listKey = raw.list_no ? String(raw.list_no) : '';
    if (!listKey) return; // list_no 空 → 不計入聚合（AD-E07-v3.7 §3.1）
    const deptKey = raw.emphire_dept_name
      ? String(raw.emphire_dept_name)
      : PIVOT_BLANK_LABEL;
    const emplidKey = raw.emplid ? String(raw.emplid) : PIVOT_BLANK_LABEL;

    // cell[dept][emplid][list]++
    let byEmplid = agg.cell.get(deptKey);
    if (!byEmplid) {
      byEmplid = new Map();
      agg.cell.set(deptKey, byEmplid);
    }
    let byList = byEmplid.get(emplidKey);
    if (!byList) {
      byList = new Map();
      byEmplid.set(emplidKey, byList);
    }
    byList.set(listKey, (byList.get(listKey) ?? 0) + 1);

    // deptByList[dept][list]++
    let dbl = agg.deptByList.get(deptKey);
    if (!dbl) {
      dbl = new Map();
      agg.deptByList.set(deptKey, dbl);
    }
    dbl.set(listKey, (dbl.get(listKey) ?? 0) + 1);

    // grandByList[list]++
    agg.grandByList.set(listKey, (agg.grandByList.get(listKey) ?? 0) + 1);

    // deptTotal[dept]++
    agg.deptTotal.set(deptKey, (agg.deptTotal.get(deptKey) ?? 0) + 1);

    // cellTotal[dept][emplid]++
    let ct = agg.cellTotal.get(deptKey);
    if (!ct) {
      ct = new Map();
      agg.cellTotal.set(deptKey, ct);
    }
    ct.set(emplidKey, (ct.get(emplidKey) ?? 0) + 1);

    // grandTotal++
    agg.grandTotal += 1;

    // 確定性排序用集合
    agg.listNos.add(listKey);
    agg.deptNames.add(deptKey);
    let eset = agg.emplidsPerDept.get(deptKey);
    if (!eset) {
      eset = new Set();
      agg.emplidsPerDept.set(deptKey, eset);
    }
    eset.add(emplidKey);
  }

  /**
   * F108 / AD-E07-v3.7 §3.3：除零保護。
   *   - 分母 = 0（0/0）→ 回 null（空白儲存格，不輸出 0.0%）
   *   - 分母 > 0 → 回 numerator / denominator（分子 0 → 0 → Excel numFmt 顯示 0.0%）
   */
  private pctOrBlank(numerator: number, denominator: number): number | null {
    if (denominator === 0) return null;
    return numerator / denominator;
  }

  /**
   * F108 / AD-E07-v3.7 §8.3：將已完成的 PivotAggregation 寫入 WorkbookWriter 第 2 頁。
   * 必須在 sheet 1 commit() 後、workbook.commit() 前呼叫。
   *
   * 確定性排序（I-PIV-DET-01）：listNo 字串升冪 / 部門 localeCompare（'(空白)' 最後）/ 員編字串升冪。
   * 數值 = % of parent row（部門列 ÷ 欄總計、員編列 ÷ 所屬部門同欄、總計列 = 1）；numFmt='0.0%'。
   */
  private writePivotSheet(
    pivotSheet: ExcelJS.Worksheet,
    agg: PivotAggregation,
  ): void {
    const sortedListNos = [...agg.listNos].sort();
    const sortedDepts = [...agg.deptNames].sort((a, b) => {
      if (a === PIVOT_BLANK_LABEL) return 1; // '(空白)' 固定排最後（OQ-F108-01）
      if (b === PIVOT_BLANK_LABEL) return -1;
      return a.localeCompare(b);
    });
    // 數值欄數 = 名單代號欄 + 1（總計欄）
    const numericCells = sortedListNos.length + 1;

    const writeRow = (
      label: string,
      values: Array<number | null>,
    ): void => {
      const row = pivotSheet.addRow([label, ...values]);
      for (let c = 2; c <= 1 + numericCells; c++) {
        row.getCell(c).numFmt = '0.0%';
      }
      row.commit();
    };

    // R1：部門代號 / (全部)（對齊 legacy 頁篩選 axisPage）
    pivotSheet.addRow(['部門代號', '(全部)']).commit();
    // R2：空列
    pivotSheet.addRow([]).commit();
    // R3：計數 - 案號 / 欄標籤
    pivotSheet.addRow(['計數 - 案號', '欄標籤']).commit();
    // R4：列標籤 / <listNo 升冪> / 總計
    pivotSheet.addRow(['列標籤', ...sortedListNos, '總計']).commit();

    // 資料列：部門列（÷ 欄總計）→ 其全部員編列（÷ 所屬部門同欄）
    for (const dept of sortedDepts) {
      const deptByList = agg.deptByList.get(dept);
      const deptValues: Array<number | null> = sortedListNos.map((l) =>
        this.pctOrBlank(deptByList?.get(l) ?? 0, agg.grandByList.get(l) ?? 0),
      );
      const deptGrand = this.pctOrBlank(
        agg.deptTotal.get(dept) ?? 0,
        agg.grandTotal,
      );
      writeRow(dept, [...deptValues, deptGrand]);

      const cellByEmplid = agg.cell.get(dept);
      const cellTotal = agg.cellTotal.get(dept);
      const sortedEmplids = [...(agg.emplidsPerDept.get(dept) ?? [])].sort();
      for (const emplid of sortedEmplids) {
        const byList = cellByEmplid?.get(emplid);
        const empValues: Array<number | null> = sortedListNos.map((l) =>
          this.pctOrBlank(byList?.get(l) ?? 0, deptByList?.get(l) ?? 0),
        );
        const empGrand = this.pctOrBlank(
          cellTotal?.get(emplid) ?? 0,
          agg.deptTotal.get(dept) ?? 0,
        );
        writeRow(emplid, [...empValues, empGrand]);
      }
    }

    // 總計列：每欄 grandByList[L] / grandByList[L] = 1（0/0 → 空白，BR-F108-11）
    const grandValues: Array<number | null> = sortedListNos.map((l) => {
      const g = agg.grandByList.get(l) ?? 0;
      return this.pctOrBlank(g, g);
    });
    const grandGrand = this.pctOrBlank(agg.grandTotal, agg.grandTotal);
    writeRow('總計', [...grandValues, grandGrand]);
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

    // ⚡ 效能（I-COMPARE-SQL-01）：以輕量 SQL 讀 result 列（僅比對所需 4 欄）取代 loadAllPayloads
    //   載入「兩個」run 的巨大 result 快照 JSON blob（各 115K 筆；MSSQL ntext 讀取 + JSON.parse
    //   約 45s/run → 比對頁逾時）。實測讀 115K×4 欄 0.77s/run。config 仍需比對 → 只另載小型 config
    //   快照（非 result/input_list）。下游 aggregateBy / calcPersonnelMismatch / customerDiff /
    //   scope filter 全沿用（JS 端邏輯不變）。同 getSummary 重構（見 I-SUMMARY-SQL-01）。
    const baseListRaw = await this.loadResultAssignments(runA);
    const cmpListRaw = await this.loadResultAssignments(runB);
    const baseConfigSnap = await this.snapshotRepo.findOne({
      where: { run_id: runA, snapshot_type: 'config' },
    });
    const cmpConfigSnap = await this.snapshotRepo.findOne({
      where: { run_id: runB, snapshot_type: 'config' },
    });
    // F067 v1.1 scope filter — 兩邊都套（JS 端，行為不變）
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

    // 設定 diff（只載小型 config 快照）
    const configDiff = this.diffConfig(
      (baseConfigSnap?.payload as Record<string, unknown> | undefined) ?? null,
      (cmpConfigSnap?.payload as Record<string, unknown> | undefined) ?? null,
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

  /**
   * 輕量讀取某 run 之 result 列（僅比對所需欄位）供 compareRuns 使用，取代載入巨大 result 快照
   * JSON blob（I-COMPARE-SQL-01）。回傳 shape 對齊 ResultAssignment（下游 JS 聚合不變）。
   */
  private async loadResultAssignments(
    runId: string,
  ): Promise<ResultAssignment[]> {
    const rows = await this.dataSource
      .getRepository(ObMonthlyRunResult)
      .createQueryBuilder('r')
      .select('r.appl_no', 'applNo')
      .addSelect('r.dept_id', 'deptId')
      .addSelect('r.card_level', 'cardLevel')
      .addSelect('r.emplid', 'emplid')
      .where('r.run_id = :runId', { runId })
      .getRawMany<{
        applNo: string | null;
        deptId: string | null;
        cardLevel: string | null;
        emplid: string | null;
      }>();
    return rows.map((r) => ({
      applNo: r.applNo ?? undefined,
      deptId: r.deptId,
      cardLevel: r.cardLevel,
      emplid: r.emplid,
    }));
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
