// F111: Assignment Overview Dashboard（分派總覽儀表板；GET /api/v1/assignment/overview）
//
// 本檔為 @cdmp/shared `AssignmentOverviewResponse` 之 API 端本地副本。
// 理由：apps/api 依既有慣例**不 import `@cdmp/shared`**（container 之隔離 node_modules 無
// workspace symlink，跨端 dashboard 型別一律各端自持——如 web 之 DashboardResponse 於
// @cdmp/shared、api 端則以 service 推斷/本地宣告）。故此處逐字鏡射 @cdmp/shared 之 F111 區塊。
// **兩份定義必須保持一致**，皆以 F111 spec §5.2（凍結 DTO）為唯一真實來源，欄位名不可更動。
// 四個區塊皆為 discriminated union（{error:false,...} | {error:true,errorCode,message}）；
// 區塊獨立失敗 HTTP 整體恆 200（BR-9 / AC-15）。

// ---- 區塊錯誤包裝（AC-15 / BR-9）----
export interface OverviewBlockError {
  error: true;
  errorCode:
    | 'STAGE_TODO_UNAVAILABLE'
    | 'RUN_READINESS_UNAVAILABLE'
    | 'DIALING_VOLUME_UNAVAILABLE'
    | 'RECENT_RUN_UNAVAILABLE';
  message: string; // 使用者可讀（zh-TW），非技術堆疊
}
export type OverviewBlock<T> = ({ error: false } & T) | OverviewBlockError;

// ---- 頂層 ----
export interface OverviewScope {
  role: 'director' | 'section_chief' | 'admin';
  deptCode: string | null; // section_chief 之轄區代號；director/admin = null
  scoped: boolean; // section_chief = true；director/admin = false
}

// 區塊一 StageTodoBlock（名單階段待辦）
export interface NotReadyListItem {
  listNo: string;
  listNm: string;
  stage: string; // 'draft' | 'dept_ratio' | 'personnel_ratio' | 'approval'
}

export interface StageTodoBlock {
  stageCounts: {
    draft: number;
    dept_ratio: number;
    personnel_ratio: number;
    approval: number;
    ready: number;
    disabled: number;
  };
  notReadyLists: NotReadyListItem[]; // status='active' AND stage != 'ready'（全數，不分頁）
  notReadyCount: number; // = notReadyLists.length
  hasAnyList: boolean; // 選定月份是否存在任何 ob_list_definition（含 disabled）
}

// 區塊二 RunReadinessBlock（就緒狀態 + ETL 前置）
export interface EtlSourceStatus {
  status: 'completed' | 'failed' | 'running' | 'missing';
  lastRunAt: string | null; // ISO 8601
  rowCount: number; // 目標表真實筆數；0 = 空表（即使 log completed）
}

export interface RunReadinessBlock {
  totalActiveLists: number; // status='active' 且 stage != 'draft'
  readyCount: number; // 其中 stage='ready'
  allReady: boolean;
  notReadyLists: Array<{ listNo: string; listNm: string; stage: string }>;
  monthlyRunStatus: 'none' | 'pending' | 'running' | 'completed' | 'failed';
  scoringActive: boolean; // 是否有 ob_levelcard_version.status='active'
  etlStatus: {
    pooldata: EtlSourceStatus;
    emphire: EtlSourceStatus;
    calendar: EtlSourceStatus;
    arreturndf: EtlSourceStatus;
  };
  sourcesAllHaveData: boolean;
  emptySourceTables: string[]; // rowCount=0 之來源表名（如 'ob_calendar'）
  canNavigateToTrigger: boolean; // AC-8：director/admin=true；section_chief=false
}

// 區塊三 DialingVolumeBlock（預計撥打量）
export interface MonthTotal {
  ym: string;
  total: number | null; // Σ over workdays Σ deptCells[].cases；hasActiveLists=false → null（empty≠zero，BR-4）
  hasActiveLists: boolean; // 該月（依 actor scope）是否 ≥1 active 名單
  scopedToDept: boolean; // section_chief=true（total 僅本部門）；director/admin=false
}

export interface DeptDistributionItem {
  deptCode: string;
  deptName: string;
  totalCases: number; // Σ over workdays 該部門 deptCells.cases
  ratio: number | null; // totalCases ÷ Σ_all_dept totalCases（%，一位小數）；section_chief=null
}

export interface DialingDay {
  date: string; // YYYY-MM-DD
  weekday: string; // 中文星期
  isWorkday: boolean; // 非工作日 → deptCells=[]、orgTotal=0
  orgTotal: number | null; // 全名單總量；休息日=0；section_chief=null
  deptAssignedTotal: number | null; // Σ 已設定比例部門件數；section_chief=null
  gap: number | null; // org_total − deptAssignedTotal（≥0）；section_chief=null
  deptCells: Array<{
    deptCode: string;
    cases: number;
    perPerson: number | null;
    overThreshold: boolean;
  }>;
}

export interface DeptEstimateProjection {
  ym: string;
  mode: 'aggregated' | 'single-list'; // 本頁固定 'aggregated'
  calendarSource: 'weekday' | 'weekday-only' | 'all'; // 本頁固定預設 'weekday'
  startDate: string; // YYYY-MM-DD
  endDate: string;
  departments: Array<{
    deptCode: string;
    deptName: string;
    activeHeadcount: number;
  }>;
  days: DialingDay[];
  threshold: number | null; // 每人每日上限；未設定=null
  deptDistribution: DeptDistributionItem[]; // 衍生彙總（避免前端逐日加總）
  warnings: Array<{
    code: string;
    deptCode?: string;
    listNo?: string;
    message?: string;
  }>;
  poolCount: number;
  poolWarning: 'POOL_COUNT_LOW' | null;
}

export interface DialingVolumeBlock {
  headline: {
    // AC-9 固定本月/次月對比（不受 AC-3 選擇器影響，BR-6）
    currentMonth: MonthTotal; // computeDeptEstimate(current_work_ym, actor)
    nextMonth: MonthTotal; // computeDeptEstimate(target_work_ym, actor)
  };
  selected: DeptEstimateProjection; // computeDeptEstimate(selectedYm, actor)
}

// 區塊四 RecentRunBlock（最近一次月跑結果）
export interface RecentRunPresent {
  hasCompletedRun: true;
  runId: string;
  projectWorkym: string;
  finishedAt: string | null; // ISO 8601
  totalCases: number | null;
  coverageRate: number; // getSummary().coverageRate
  emplCount: number; // 分派業務員數（context）
  deptSummary: Array<{
    deptId: string;
    deptName: string | null;
    configRatio: number;
    actualCount: number;
    actualRatio: number;
    deviation: number;
    alert: boolean; // |deviation| > NFR-005 門檻
  }>;
  levelDistribution: Array<{ cardLevel: string; count: number; ratio: number }>;
  tierDistribution: Array<{ tierLevel: string; count: number; ratio: number }>;
}

export interface RecentRunEmpty {
  hasCompletedRun: false;
  emptyReason: 'noRun' | 'noCompletedRun'; // BR-8
  latestRunStatus: 'failed' | 'running' | 'pending' | null; // noRun → null
  latestRunId: string | null; // noCompletedRun 時之最新 run id；noRun → null
}

export type RecentRunBlock = RecentRunPresent | RecentRunEmpty;

export interface AssignmentOverviewResponse {
  selectedYm: string; // 本次查詢月份（YYYYMM）；= query.ym 或 current_work_ym
  currentWorkYm: string; // SystemService.getCurrentWorkYm()
  targetWorkYm: string; // SystemService.getDefaultTargetWorkYm()（= current+1）
  scope: OverviewScope;
  stageTodo: OverviewBlock<StageTodoBlock>; // 區塊一
  runReadiness: OverviewBlock<RunReadinessBlock>; // 區塊二
  dialingVolume: OverviewBlock<DialingVolumeBlock>; // 區塊三
  recentRun: OverviewBlock<RecentRunBlock>; // 區塊四
}
