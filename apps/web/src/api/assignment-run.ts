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
  ym: string;
  status: RunStatus;
  triggeredBy: string;
  triggeredAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  durationMs?: number | null;
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
  ym: string;
  status: RunStatus;
  triggeredBy: string;
  triggeredAt: string;
  finishedAt: string | null;
  totalCount?: number;
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

export interface CompareRunsResponse {
  runA: string;
  runB: string;
  summary: {
    totalA: number;
    totalB: number;
    deltaTotal: number;
    customersAddedCount: number;
    customersRemovedCount: number;
    customersChangedAssigneeCount: number;
  };
  personnelMismatch?: Array<{
    empId: string;
    empName?: string;
    countA: number;
    countB: number;
    delta: number;
  }>;
  customerDiff?: Array<{
    customerId: string;
    assigneeA?: string | null;
    assigneeB?: string | null;
    diffType: 'added' | 'removed' | 'reassigned';
  }>;
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
