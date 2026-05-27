import { apiClient } from './client';

/**
 * F048 / F050 / F051 / F052 / F077 — Assignment List API client
 *
 * Spec: docs/specs/features/F048-list-lists.md / F050-create-list.md /
 *       F051-update-list.md / F052-disable-list.md / F077-list-month-filter.md
 *
 * 路由前綴：/api/v1/assignment/lists
 * 4-角色 RBAC（F002 §4.6.2 / AD-E07 v3.0）：
 *   - GET → DirectorOrSectionChiefGuard（部長 + 處長）
 *   - POST / PUT / DELETE → DirectorGuard（僅部長）
 */

export type ListStage =
  | 'draft'
  | 'dept_ratio'
  | 'personnel_ratio'
  | 'approval'
  | 'ready';

export type ListStatus = 'active' | 'inactive';

// ============================================================================
// F050 v2.1（Phase 5d 波 7）：condition_payload schema
// 對應 backend ConditionItemDto / ConditionPayloadDto（5a 落地）
// ============================================================================

/**
 * 單一篩選條件項（依 fieldType 分支）
 * - categorical：values: string[] 必填
 * - numeric：min / max 必填
 * - date：dateStart / dateEnd 必填（YYYY-MM-DD）
 */
export interface ConditionItem {
  columnName: string;
  fieldType: 'categorical' | 'numeric' | 'date';
  values?: string[];
  min?: number;
  max?: number;
  dateStart?: string;
  dateEnd?: string;
}

export interface ConditionPayload {
  conditions: ConditionItem[];
  logic: 'AND';
}

export interface AssignmentListItem {
  listNo: string;
  listNm: string;
  prodKind: string | null;
  caseYear: string | null;
  specTp: string | null;
  /** Phase 3 P2-5：case_status（'$$' 分隔多值，例 '01$$02'） */
  caseStatus?: string | null;
  /** Phase 3 P2-5：CR 回分啟用 */
  crEnabled?: boolean;
  listPeriodStart: number | null;
  listPeriodEnd: number | null;
  listInterval: number | null;
  settleSrc: string | null;
  cardType: string | null;
  prodBest: string | null;
  status: ListStatus;
  stage: ListStage;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  /** F088 v1.3 §5.0.1：清單卡片聚合欄位（後端 listLists 回傳） */
  /** 部門數（ob_dept_pct count） */
  deptCount?: number;
  /** 業務員數（ob_empl_set count） */
  empCount?: number;
  /** 最新一筆 approve 時間（ISO；未核准為 null） */
  approvedAt?: string | null;
  /** 最新一筆 approve 之核准者姓名（未核准為 null） */
  approverName?: string | null;
  /** 物化 Stage 0 估算件數（approve→ready 寫入；未計算 / 舊名單為 null） */
  estimateCases?: number | null;
  /**
   * F050 v2.1：condition_payload read-through
   * - 新名單為 ConditionPayload object（v2.1 寫入或 M2 backfill 後）
   * - 舊名單為 null（LEGACY，conditionPayload IS NULL）
   * 前端列表 / 編輯頁據此判斷 LEGACY 場景（27b 場景③）
   */
  conditionPayload?: ConditionPayload | null;
}

/**
 * F050 v2.1（Phase 5d 波 7）：CreateListRequest 嚴格型別
 *
 * 對應 backend CreateListDto（5a 落地）。
 * 5a 已從 DTO 移除 prodKind / caseYear / specTp / caseStatus / settleSrc 5 個一級欄位；
 * 改以 conditionPayload 為 source of truth（衍生規則 §18.6 由後端執行）。
 */
export interface CreateListRequest {
  /** 名單名稱（1~50 字） */
  listNm: string;
  /** 撈案期間起（一級保留欄位 J8） */
  listPeriodStart: number;
  /** 撈案期間迄 */
  listPeriodEnd: number;
  /** 間隔期數 */
  listInterval: number;
  /** CR 回分開關（per-LIST） */
  crEnabled?: boolean;
  /** 卡別（選填 max 5） */
  cardType?: string;
  /** 最佳產品（選填 max 5） */
  prodBest?: string;
  /** 從上月複製來源 LIST_NO（選填；UI 帶入欄位用） */
  copyFromListNo?: string;
  /** 篩選條件（必填，conditions.length >= 1） */
  conditionPayload: ConditionPayload;
}

/**
 * F051 v2.1：UpdateListRequest 所有欄位 optional
 * stage='draft' 時才可寫入 conditionPayload（後端 K1 約束）
 */
export interface UpdateListRequest {
  listNm?: string;
  listPeriodStart?: number;
  listPeriodEnd?: number;
  listInterval?: number;
  crEnabled?: boolean;
  cardType?: string;
  prodBest?: string;
  conditionPayload?: ConditionPayload;
}

export interface LockState {
  locked: boolean;
  reason: string | null;
}

export interface ListListsResponse {
  selectedYm: string;
  currentWorkYm: string;
  isHistorical: boolean;
  isFuture: boolean;
  lockState: LockState;
  lists: AssignmentListItem[];
  stageCounts: Record<ListStage | 'disabled', number>;
}

export interface ListListsQuery {
  /** YYYYMM 格式，例 '202605'。預設 currentWorkYm。 */
  ym?: string;
  /** 逗號分隔多階段，例 'draft,dept_ratio'。 */
  stage?: string;
  /** 是否包含 inactive。 */
  includeDisabled?: boolean;
}

export async function listLists(
  query: ListListsQuery = {},
): Promise<ListListsResponse> {
  const params: Record<string, string> = {};
  if (query.ym) params.ym = query.ym;
  if (query.stage) params.stage = query.stage;
  if (query.includeDisabled) params.includeDisabled = 'true';
  const response = await apiClient.get<ListListsResponse>('/assignment/lists', {
    params,
  });
  return response.data;
}

export interface CurrentWorkYmResponse {
  currentWorkYm: string;
}

export async function getCurrentWorkYm(): Promise<CurrentWorkYmResponse> {
  const response = await apiClient.get<CurrentWorkYmResponse>(
    '/system/current-work-ym',
  );
  return response.data;
}

/**
 * F050 v2.1：建立名單草稿。
 * dto 結構：CreateListRequest（必填 listNm + conditionPayload）
 * 對應 backend create-list.dto.ts（Phase 5a 落地）。
 *
 * 過渡相容：保留 Record<string, unknown> 之 union，避免既有 page (list-create-draft-page v2.0)
 * 編譯破壞；波 8 重寫該頁時改用嚴格 CreateListRequest。
 */
export async function createList(dto: CreateListRequest | Record<string, unknown>) {
  const response = await apiClient.post('/assignment/lists', dto);
  return response.data;
}

/**
 * F051 v2.1：更新名單草稿（覆寫式）。stage='draft' 才允許 conditionPayload 寫入（K1）。
 * 過渡相容同 createList；波 9 重寫 list-edit-draft-page 時改用嚴格 UpdateListRequest。
 */
export async function updateList(
  listNo: string,
  dto: UpdateListRequest | Record<string, unknown>,
) {
  const response = await apiClient.put(`/assignment/lists/${listNo}`, dto);
  return response.data;
}

/**
 * F052：停用名單（軟刪除）。
 */
export async function disableList(listNo: string) {
  const response = await apiClient.put(`/assignment/lists/${listNo}/disable`);
  return response.data;
}

/**
 * 同 disableList — DELETE alias（B2 雙軌支援）。
 */
export async function deleteList(listNo: string) {
  const response = await apiClient.delete(`/assignment/lists/${listNo}`);
  return response.data;
}

// ============================================================================
// F050 v2.2 §6.2 / US-131 — Detail Snapshot API
// ============================================================================

/** LEGACY 名單 fallback（conditionPayload IS NULL 時非 null） */
export interface LegacyEntityFallback {
  prodKind: string | null;
  caseyear: string | null;
  specTp: string | null;
  caseStatus: string | null;
  settleSrc: string | null;
}

export interface SnapshotListSection {
  listNo: string;
  listNm: string;
  stage: ListStage;
  status: ListStatus;
  projectWorkym: string | null;
  cardType: string | null;
  crEnabled: boolean;
  listPeriodStart: string | null;
  listPeriodEnd: string | null;
  listInterval: string | null;
  conditionPayload: ConditionPayload | null;
  legacyEntityFallback: LegacyEntityFallback | null;
  createdBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface SnapshotDeptRatio {
  deptCode: string;
  deptName: string | null;
  ration: number;
}

export interface SnapshotPersonnelRatioMember {
  emplid: string;
  empNm: string | null;
  ration: number;
}

export interface SnapshotPersonnelRatio {
  deptCode: string;
  deptName: string | null;
  members: SnapshotPersonnelRatioMember[];
}

export interface SnapshotAuditTrailItem {
  action: string;
  operatorId: string;
  operatorEmpNm: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  at: string;
}

/**
 * F095 / AD-E07-26 §26.5：名單套用之系統特例排除規則（唯讀，後端依 list_nm 讀時推導）。
 */
export interface AppliedSpecialRule {
  ruleId:
    | 'R-FRAUD-WHITEBOARD'
    | 'R-PERIOD-MOTORCYCLE'
    | 'R-PERIOD-XIAOZI'
    | 'R-YEAR-ABOVE';
  /** 規則中文名稱，供前端直接顯示 */
  ruleName: string;
  /** true → 全名單強制套用（前端顯示為灰色不可關閉的系統規則） */
  isSystemMandatory: boolean;
  /** 人類可讀排除說明（描述「排除什麼樣的案件」） */
  exclusionDescription: string;
}

export interface FullSnapshotResponse {
  list: SnapshotListSection;
  deptRatios: SnapshotDeptRatio[];
  personnelRatios: SnapshotPersonnelRatio[];
  auditTrail: SnapshotAuditTrailItem[];
  /**
   * F095：本名單套用之系統特例排除規則（唯讀）。至少含 R-FRAUD-WHITEBOARD（無條件）。
   * 舊版 API 未回此欄時前端容錯隱藏整個區塊（漸進增強）。
   */
  appliedSpecialRules?: AppliedSpecialRule[];
}

/**
 * F050 v2.2 §6.2：取得指定名單之完整快照（Detail Drawer 4-tab 資料來源）。
 *
 * - 唯讀端點：DirectorOrSectionChiefGuard 攔截 user role（403）
 * - 處長轄區隔離：personnelRatios 僅含本轄區 deptCode
 * - 歷史月份 / 月跑執行中均可呼叫（後端不攔截）
 *
 * 對應 React Drawer：apps/web/src/pages/assignment/_components/ListDetailDrawer.tsx
 */
export async function getFullSnapshot(listNo: string): Promise<FullSnapshotResponse> {
  const response = await apiClient.get<FullSnapshotResponse>(
    `/assignment/lists/${listNo}/full-snapshot`,
  );
  return response.data;
}
