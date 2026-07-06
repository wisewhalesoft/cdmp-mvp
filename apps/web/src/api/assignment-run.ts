import { apiClient } from './client';

/**
 * F049 / F061 / F062 / F063 / F067 — Assignment Run API client
 *
 * Spec:
 *   F049 (Stage 0 estimate), F061 (trigger run), F062 (run progress),
 *   F063 (run summary), F064 (export), F065 (list runs), F067 (compare)
 *
 * 路由前綴：
 *   - /api/v1/assignment/stage0/daily-estimate
 *   - /api/v1/assignment/list-definitions/:listNo/estimate
 *   - /api/v1/assignment/runs
 */

// =====================================================================
// F049 — Stage 0 試算
// =====================================================================

/** F049 v1.3：工作日來源（對齊後端 calendarSource） */
export type CalendarSource = 'weekday' | 'weekday-only' | 'all';

/** F049 v1.3 跳過原因 */
export type SkipReason = '週末' | '國定假日';

/**
 * F049 v1.3 Design A：daily-estimate 每筆日期（含跳過日）
 *   - 後端 total-agnostic，不回每日件數；件數由前端以 round(ratioPerMille/1000 × total) 計算
 */
export interface DailyEstimateRow {
  date: string;
  weekday: string;
  isWorkday: boolean;
  skipReason: SkipReason | null;
  /** 千分位 ratio（工作日=baseRatio 或 baseRatio+1；非工作日=0）。SUM(工作日)=1000 */
  ratioPerMille: number;
}

export interface DailyEstimateResponse {
  ym: string;
  calendarSource: CalendarSource;
  startDate: string;
  endDate: string;
  workingDays: number;
  /** FLOOR(1000 / workingDays)（千分位 ‰） */
  baseRatio: number;
  /** 1000 mod workingDays */
  remainder: number;
  dailyEstimates: DailyEstimateRow[];
  /** ob_pool_data 共享池實際筆數（僅供 Pool 偏低警示，與 total 無關） */
  poolCount?: number;
  /** poolCount < threshold 時為 'POOL_COUNT_LOW' */
  warning?: 'POOL_COUNT_LOW' | null;
}

export interface DailyEstimateParams {
  calendarSource?: CalendarSource;
  startDate?: string;
  endDate?: string;
}

export async function getDailyEstimate(
  ym?: string,
  opts: DailyEstimateParams = {},
): Promise<DailyEstimateResponse> {
  const params: Record<string, string> = {};
  if (ym) params.ym = ym;
  if (opts.calendarSource) params.calendarSource = opts.calendarSource;
  if (opts.startDate) params.startDate = opts.startDate;
  if (opts.endDate) params.endDate = opts.endDate;
  const response = await apiClient.get<DailyEstimateResponse>(
    '/assignment/stage0/daily-estimate',
    { params },
  );
  return response.data;
}

export interface ListEstimateResponse {
  listNo: string;
  /** 後端 stage0-estimate service 實際回傳欄位 */
  count?: number;
  /** legacy alias — 兼容既有頁面使用 */
  estimatedCount?: number;
  details?: Record<string, unknown>;
}

export async function getListEstimate(listNo: string): Promise<ListEstimateResponse> {
  const response = await apiClient.get<ListEstimateResponse>(
    `/assignment/list-definitions/${listNo}/estimate`,
  );
  return response.data;
}

// =====================================================================
// F049 v2.0 Part B — Stage 0 部門維度每日分派可行性矩陣
// （對齊後端 Stage0DeptEstimateResult / AD-E07-v3.6 §4.1）
// =====================================================================

export interface DeptEstimateWarning {
  code:
    | 'DEPT_HEADCOUNT_ZERO'
    | 'SCOPE_UNRESOLVED'
    | 'STAGE0_LIST_ESTIMATE_PARTIAL';
  deptCode?: string;
  listNo?: string;
  message?: string;
}

export interface DeptEstimateCell {
  deptCode: string;
  cases: number;
  perPerson: number | null;
  overThreshold: boolean;
}

export interface DeptEstimateDay {
  date: string;
  weekday: string;
  isWorkday: boolean;
  /** 全名單總量；休息日 = 0；處長模式 = null */
  orgTotal: number | null;
  deptAssignedTotal: number | null;
  /** 未分派到部門的件數；休息日 = 0；處長模式 = null */
  gap: number | null;
  deptCells: DeptEstimateCell[];
}

export interface DeptEstimateDepartment {
  deptCode: string;
  deptName: string;
  activeHeadcount: number;
}

export interface DeptEstimateScope {
  role: 'director' | 'section_chief' | 'admin';
  deptCode: string | null;
  scoped: boolean;
}

export interface DeptEstimateResponse {
  ym: string;
  mode: 'aggregated' | 'single-list';
  listNo: string | null;
  calendarSource: CalendarSource;
  startDate: string;
  endDate: string;
  scope: DeptEstimateScope;
  departments: DeptEstimateDepartment[];
  days: DeptEstimateDay[];
  /** 每人每日上限；未設定為 null */
  threshold: number | null;
  warnings: DeptEstimateWarning[];
  poolCount: number;
  poolWarning: 'POOL_COUNT_LOW' | null;
}

export interface DeptEstimateParams {
  calendarSource?: CalendarSource;
  listNo?: string;
  startDate?: string;
  endDate?: string;
}

export async function getDeptEstimate(
  ym?: string,
  opts: DeptEstimateParams = {},
): Promise<DeptEstimateResponse> {
  const params: Record<string, string> = {};
  if (ym) params.ym = ym;
  if (opts.calendarSource) params.calendarSource = opts.calendarSource;
  if (opts.listNo) params.listNo = opts.listNo;
  if (opts.startDate) params.startDate = opts.startDate;
  if (opts.endDate) params.endDate = opts.endDate;
  const response = await apiClient.get<DeptEstimateResponse>(
    '/assignment/stage0/dept-estimate',
    { params },
  );
  return response.data;
}

// =====================================================================
// F061 — POST 觸發月跑
// =====================================================================

export interface TriggerRunResponse {
  runId: string;
  ym: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  triggeredAt: string;
}

/**
 * F097 / AC-6（breaking change）：以使用者選定之分派作業月份（target_work_ym，YYYYMM）觸發月跑。
 *   - request body 必帶 `{ workYm }`；後端寫入 AssignmentRun.project_workym = workYm（不再自算 new Date()）。
 */
export async function triggerRun(workYm: string): Promise<TriggerRunResponse> {
  const response = await apiClient.post<TriggerRunResponse>('/assignment/runs', {
    workYm,
  });
  return response.data;
}

// =====================================================================
// F061 Phase 2 — GET 月跑前置條件就緒度
// =====================================================================

export type EtlStatusValue = 'completed' | 'failed' | 'running' | 'missing';

export interface EtlSourceStatus {
  status: EtlStatusValue;
  lastRunAt: string | null;
}

export interface EtlStatusMap {
  pooldata: EtlSourceStatus;
  emphire: EtlSourceStatus;
  calendar: EtlSourceStatus;
  arreturndf: EtlSourceStatus;
}

export interface ReadinessResponse {
  workYm: string;
  totalActiveLists: number;
  readyCount: number;
  notReadyLists: Array<{ listNo: string; listNm: string; stage: string }>;
  allReady: boolean;
  monthlyRunStatus: 'none' | 'pending' | 'running' | 'completed' | 'failed';
  scoringActive: boolean;
  etlStatus: EtlStatusMap;
}

export async function getReadiness(ym?: string): Promise<ReadinessResponse> {
  const params: Record<string, string> = {};
  if (ym) params.ym = ym;
  const response = await apiClient.get<ReadinessResponse>(
    '/assignment/runs/readiness',
    { params },
  );
  return response.data;
}

// =====================================================================
// F062 Phase 2 — POST 取消月跑（director only）
// =====================================================================

export interface CancelRunResponse {
  runId: string;
  projectWorkym: string;
  status: 'failed';
  errorMessage: string;
}

export async function cancelRun(runId: string): Promise<CancelRunResponse> {
  const response = await apiClient.post<CancelRunResponse>(
    `/assignment/runs/${runId}/cancel`,
  );
  return response.data;
}

// =====================================================================
// F062 — GET 月跑進度（polling 3 秒一次 per F062 BR-1）
// =====================================================================

export type RunStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface RunProgressResponse {
  runId: string;
  /** 後端 getRunById 回傳欄位（作業年月）；ym 為 legacy alias，實際後端未回傳。 */
  projectWorkym?: string;
  ym?: string;
  status: RunStatus;
  triggeredBy: string;
  /** F062：triggered_by(UUID) → users.name 解析結果；查無對應 user 為 null。 */
  triggeredByName?: string | null;
  triggeredAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  durationMs?: number | null;
  /** 最終分派總筆數（後端 total_cases）；running 中可能為 null。 */
  totalCases?: number | null;
  errorMessage?: string | null;
  // Stage 進度（backend 可能擴充）
  stages?: Array<{
    name: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    progressPercent?: number;
    processedCount?: number;
    totalCount?: number;
  }>;
  totals?: {
    processedCount?: number;
    totalCount?: number;
    progressPercent?: number;
  };
}

export async function getRun(runId: string): Promise<RunProgressResponse> {
  const response = await apiClient.get<RunProgressResponse>(
    `/assignment/runs/${runId}`,
  );
  return response.data;
}

// =====================================================================
// F065 — GET 月跑歷史
// =====================================================================

export interface RunListItem {
  runId: string;
  /** 作業年月（YYYYMM）— 對齊後端 RunSummary.projectWorkym */
  projectWorkym: string;
  status: RunStatus;
  /** 觸發者 UUID（assignment_run.triggered_by） */
  triggeredBy: string;
  /** F065 BR-5：後端 join users.name 解析之觸發者名稱；查無對應 user 時為 null */
  triggeredByName?: string | null;
  triggeredAt: string;
  finishedAt: string | null;
  /** 分派筆數 — 對齊後端 RunSummary.totalCases */
  totalCases?: number | null;
}

export interface ListRunsResponse {
  runs: RunListItem[];
}

export async function listRuns(ym?: string): Promise<ListRunsResponse> {
  const params: Record<string, string> = {};
  if (ym) params.ym = ym;
  const response = await apiClient.get<ListRunsResponse>('/assignment/runs', { params });
  return response.data;
}

// =====================================================================
// F063 — GET 結果摘要
// =====================================================================

/**
 * F063 Phase 3：對齊後端 SummaryResponse（assignment-run-report.service.ts）
 */
export interface SummaryDeptRow {
  deptId: string;
  /** 部門名稱（後端 ob_dept_pct.obdeptnm 即時解析）；查無對應 → null，前端 fallback 顯示代號。 */
  deptName?: string | null;
  configRatio: number;
  actualCount: number;
  actualRatio: number;
  /** 與 configRatio 的差異 (actual - config) */
  deviation: number;
  /** abs(deviation) > NFR-005 閾值（3%）→ true */
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

export interface RunSummaryResponse {
  runId: string;
  /** 後端欄位：projectWorkym（保留 ym 為 legacy alias） */
  projectWorkym?: string;
  ym?: string;
  finishedAt?: string | null;
  durationMs?: number | null;
  totalCases?: number | null;
  stage1Count?: number;
  stage4Count?: number;
  coverageRate?: number;
  /** F063 gap fix：分派業務員數（distinct emplid）— prototype「分派業務員數 / 平均每人 X 案」stat card */
  emplCount?: number;
  deptSummary?: SummaryDeptRow[];
  levelDistribution?: SummaryLevelRow[];
  /** F063 gap fix：TIER_LEVEL 分佈（對齊 prototype「fn_calc_tier_level 計算結果」chart） */
  tierDistribution?: SummaryTierRow[];
  warnings?: {
    summaryCode: string | null;
    skippedCases: Record<string, unknown> | null;
  };

  // ----- legacy 欄位（既有 run-summary-page 沿用，Phase 3 改造後將清掉） -----
  /** @deprecated 改用 totalCases / stage4Count */
  totalAssigned?: number;
  /** @deprecated 改用 deptSummary */
  deptBreakdown?: Array<{
    deptCode: string;
    deptName?: string;
    assignedCount: number;
    ratio: number;
  }>;
  /** @deprecated 後端未回此欄位 */
  personnelBreakdown?: Array<{
    empId: string;
    empName?: string;
    assignedCount: number;
    ratio: number;
  }>;
}

export async function getRunSummary(runId: string): Promise<RunSummaryResponse> {
  const response = await apiClient.get<RunSummaryResponse>(
    `/assignment/runs/${runId}/summary`,
  );
  return response.data;
}

// =====================================================================
// F064 — GET 匯出（csv / xlsx）— blob download
// =====================================================================

export async function downloadRunExport(
  runId: string,
  format: 'csv' | 'xlsx' = 'csv',
): Promise<void> {
  const response = await apiClient.get(`/assignment/runs/${runId}/export`, {
    params: { format },
    responseType: 'blob',
  });
  const cd = response.headers['content-disposition'] as string | undefined;
  let filename = `run-${runId}.${format}`;
  if (cd) {
    const match = /filename="?([^";]+)"?/i.exec(cd);
    if (match) filename = match[1];
  }
  const url = window.URL.createObjectURL(response.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

// =====================================================================
// F066 — GET 快照詳情
// =====================================================================

export type SnapshotType = 'config' | 'input_list' | 'result';

export interface SnapshotData {
  /** Backend 結構由 spec 決定；FE 視為 unknown 防止 type drift。 */
  [key: string]: unknown;
}

export interface FullSnapshotResponse {
  runId: string;
  snapshots: {
    config: SnapshotData;
    inputList: SnapshotData;
    result: SnapshotData;
  };
}

export interface SingleSnapshotResponse {
  runId: string;
  type: SnapshotType;
  data: SnapshotData;
}

export async function getFullSnapshot(runId: string): Promise<FullSnapshotResponse> {
  const response = await apiClient.get<FullSnapshotResponse>(
    `/assignment/runs/${runId}/snapshot`,
  );
  return response.data;
}

export async function getSnapshotByType(
  runId: string,
  type: SnapshotType,
): Promise<SingleSnapshotResponse> {
  const response = await apiClient.get<SingleSnapshotResponse>(
    `/assignment/runs/${runId}/snapshot/${type}`,
  );
  return response.data;
}

// =====================================================================
// F067 — GET 比對兩個月跑
// =====================================================================

/**
 * F067 比對回應 — 對齊後端 `AssignmentRunReportService.CompareResponse`（authoritative）。
 *
 * ⚠️ 2026-06-26：原前端型別（runA/runB/summary.totalA…/personnelMismatch[]）與後端實際
 * 回傳完全不符，導致比對頁 `data.summary.totalA.toLocaleString()` 讀 undefined → 整頁白屏。
 * 已重寫為後端真實 shape（base/compare/summary.deptDiff…/personnelMismatch.list…）。
 */
export interface CompareRunsResponse {
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
  /** NFR-005 人員配對不一致：rate 為「比例」(0–1)，alert = rate > 0.03（後端裁定） */
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

export async function compareRuns(
  runA: string,
  runB: string,
): Promise<CompareRunsResponse> {
  const response = await apiClient.get<CompareRunsResponse>(
    '/assignment/runs/compare',
    { params: { runA, runB } },
  );
  return response.data;
}

/**
 * F067 AC-3 — xlsx 匯出比對結果（3 sheet：summary / personnelMismatch / customerDiff）。
 */
export async function downloadCompareExport(
  runA: string,
  runB: string,
): Promise<void> {
  const response = await apiClient.get('/assignment/runs/compare', {
    params: { runA, runB, export: 'xlsx' },
    responseType: 'blob',
  });
  const cd = response.headers['content-disposition'] as string | undefined;
  let filename = `compare-${runA}-${runB}.xlsx`;
  if (cd) {
    const match = /filename="?([^";]+)"?/i.exec(cd);
    if (match) filename = match[1];
  }
  const url = window.URL.createObjectURL(response.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}
