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
 * F050：建立名單草稿。
 * dto 結構詳見 backend create-list.dto.ts；FE 表單在 list-create-draft-page 組裝。
 */
export async function createList(dto: Record<string, unknown>) {
  const response = await apiClient.post('/assignment/lists', dto);
  return response.data;
}

/**
 * F051：更新名單草稿（覆寫式）。stage='draft' 才允許。
 */
export async function updateList(listNo: string, dto: Record<string, unknown>) {
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
