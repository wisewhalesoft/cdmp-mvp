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
