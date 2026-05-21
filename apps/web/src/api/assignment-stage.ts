import { apiClient } from './client';

/**
 * M03 — 部門比例 / 個別比例 / Stage transition API client
 *
 * Spec:
 *   F079 (dept ratio CRUD), F080 (advance to personnel ratio), F081 (rollback to draft)
 *   F082~F083 (personnel ratio CRUD), F084 (advance to approval), F085 (rollback to dept_ratio)
 *   F086 (approve), F087 (reject), F088 (advance to ready), F089 (rollback to approval)
 *
 * 路由前綴：
 *   - /api/v1/assignment/ratios/dept
 *   - /api/v1/assignment/ratios/personnel
 *   - /api/v1/assignment/lists/:listNo/stage/...
 *
 * 與後端 contract 對齊：
 *   - dept-ratio.service.ts:54-114（GET）/ 127-196（PUT）
 *   - personnel-ratio.service.ts:68-197（GET）/ 240-382（PUT）
 *   - 對齊 spec F079 §5.1/5.2、F082 §5.1/5.2
 */

// =====================================================================
// M03a — 部門比例（F079）
// =====================================================================

/**
 * GET response 中的部門列。
 * `isActive = false` 表示該部門已不在 ob_emphire 在職清單中（spec F079 §5.1）。
 * `directorName` 為該部門目前處長姓名（spec F079 BR-14；無對應則 null）。
 */
export interface DeptRatioItem {
  obdeptId: string;
  obdeptNm: string;
  ration: number;
  isActive: boolean;
  directorName: string | null;
}

/**
 * PUT body 中的部門列（不需 isActive；後端 DTO 忽略）。
 */
export interface SetDeptRatioItem {
  obdeptId: string;
  obdeptNm: string;
  ration: number;
}

export interface GetDeptRatiosResponse {
  listNo: string;
  listNm: string;
  projectWorkym: string;
  stage: string;
  deptRatios: DeptRatioItem[];
  total: number;
  isReadOnly: boolean;
}

export interface SetDeptRatiosRequest {
  deptRatios: SetDeptRatioItem[];
}

export interface SetDeptRatiosResponse {
  listNo: string;
  savedCount: number;
  total: number;
  savedAt: string;
  savedBy: string;
}

export async function getDeptRatios(listNo: string): Promise<GetDeptRatiosResponse> {
  const response = await apiClient.get<GetDeptRatiosResponse>(
    `/assignment/ratios/dept/${listNo}`,
  );
  return response.data;
}

export async function setDeptRatios(
  listNo: string,
  data: SetDeptRatiosRequest,
): Promise<SetDeptRatiosResponse> {
  const response = await apiClient.put<SetDeptRatiosResponse>(
    `/assignment/ratios/dept/${listNo}`,
    data,
  );
  return response.data;
}

// =====================================================================
// M03b — 個別業務比例（F082 / F083）
// =====================================================================

/**
 * GET response 中的單一員工列。
 * `isResigned = true` 時，`ration` 為 null（離職員工不參與分配；spec F082-A 決議）。
 * `createdBy` 用於處長視角的 scopeByCreator filter（v1.3 BR-14）。
 */
export interface PersonnelRatioEmployee {
  empId: string;
  empName: string;
  ration: number | null;
  isResigned: boolean;
  createdBy: string | null;
}

/**
 * PUT body 中的員工列（不需 isResigned / createdBy）。
 */
export interface SetPersonnelRatioEmployee {
  empId: string;
  empName: string;
  ration: number;
}

/**
 * GET response 中的部門容器。
 * 後端 personnel-ratio.service.ts:138-177 之輸出單元。
 */
export interface PersonnelRatioDepartment {
  deptCode: string;
  deptName: string;
  deptRatio: number | null;
  isInScope: boolean;
  activeCount: number;
  sumValidated: boolean;
  allResigned: boolean;
  employees: PersonnelRatioEmployee[];
  deptSum: number;
}

/**
 * F087 v1.1 BR-11 — 最新一筆拒絕紀錄；若最近一筆為 approve / 無紀錄 → null。
 */
export interface LatestRejection {
  rejectReason: string;
  rejectorId: string;
  rejectorName: string | null;
  rejectorRole: string | null;
  rejectedAt: string;
}

export interface AppliedTemplate {
  template: '+10%' | '+20%' | '-10%' | '-20%';
  targetEmpId: string;
}

export interface GetPersonnelRatiosResponse {
  listNo: string;
  listNm: string;
  projectWorkym: string;
  stage: string;
  isReadOnly: boolean;
  viewerRole: 'admin' | 'director' | 'section_chief';
  departments: PersonnelRatioDepartment[];
  latestRejection: LatestRejection | null;
}

export interface SetPersonnelRatiosRequest {
  deptCode: string;
  deptName?: string;
  employees: SetPersonnelRatioEmployee[];
  appliedTemplate?: AppliedTemplate;
}

export interface SetPersonnelRatiosResponse {
  listNo: string;
  deptCode: string;
  savedCount: number;
  deptSum: number;
  savedAt: string;
  savedBy: string;
}

export async function getPersonnelRatios(
  listNo: string,
  deptCode?: string,
): Promise<GetPersonnelRatiosResponse> {
  const params: Record<string, string> = {};
  if (deptCode) params.deptCode = deptCode;
  const response = await apiClient.get<GetPersonnelRatiosResponse>(
    `/assignment/ratios/personnel/${listNo}`,
    { params },
  );
  return response.data;
}

export async function setPersonnelRatios(
  listNo: string,
  data: SetPersonnelRatiosRequest,
): Promise<SetPersonnelRatiosResponse> {
  const response = await apiClient.put<SetPersonnelRatiosResponse>(
    `/assignment/ratios/personnel/${listNo}`,
    data,
  );
  return response.data;
}

// =====================================================================
// Stage transitions（F078 / F080 / F081 / F084 / F085 / F086 / F087 / F089）
// =====================================================================

export type StageTransitionEndpoint =
  | 'advance-to-dept-ratio'
  | 'advance-to-personnel-ratio'
  | 'advance-to-approval'
  | 'approve'
  | 'rollback-to-draft'
  | 'rollback-to-dept-ratio'
  | 'rollback-to-approval';

export interface StageTransitionResponse {
  listNo: string;
  stage: string;
  message?: string;
}

async function postStageAction(
  listNo: string,
  endpoint: StageTransitionEndpoint,
): Promise<StageTransitionResponse> {
  const response = await apiClient.post<StageTransitionResponse>(
    `/assignment/lists/${listNo}/stage/${endpoint}`,
  );
  return response.data;
}

export function advanceToDeptRatio(listNo: string) {
  return postStageAction(listNo, 'advance-to-dept-ratio');
}

export function advanceToPersonnelRatio(listNo: string) {
  return postStageAction(listNo, 'advance-to-personnel-ratio');
}

export function advanceToApproval(listNo: string) {
  return postStageAction(listNo, 'advance-to-approval');
}

export function approveList(listNo: string) {
  return postStageAction(listNo, 'approve');
}

export function rollbackToDraft(listNo: string) {
  return postStageAction(listNo, 'rollback-to-draft');
}

export function rollbackToDeptRatio(listNo: string) {
  return postStageAction(listNo, 'rollback-to-dept-ratio');
}

export function rollbackToApproval(listNo: string) {
  return postStageAction(listNo, 'rollback-to-approval');
}

/**
 * F087 — reject from approval → personnel_ratio with reason.
 * 端點是 POST /assignment/lists/:listNo/reject（非 /stage/reject）
 */
export interface RejectListRequest {
  rejectReason: string;
}

export async function rejectList(
  listNo: string,
  data: RejectListRequest,
): Promise<StageTransitionResponse> {
  const response = await apiClient.post<StageTransitionResponse>(
    `/assignment/lists/${listNo}/reject`,
    data,
  );
  return response.data;
}

// =====================================================================
// F087 v1.2 P1 — 簽核歷史完整時間軸（GET）
// =====================================================================

export interface ApprovalHistoryItem {
  approvalId: string;
  action: 'approve' | 'reject';
  rejectReason: string | null;
  approverId: string;
  approverName: string | null;
  approverRole: string | null;
  approvedAt: string;
}

export interface ApprovalHistoryResponse {
  listNo: string;
  history: ApprovalHistoryItem[];
}

export async function getApprovalHistory(
  listNo: string,
): Promise<ApprovalHistoryResponse> {
  const response = await apiClient.get<ApprovalHistoryResponse>(
    `/assignment/lists/${listNo}/approval-history`,
  );
  return response.data;
}
