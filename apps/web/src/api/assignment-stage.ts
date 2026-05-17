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
 */

// =====================================================================
// M03a — 部門比例（F079）
// =====================================================================

export interface DeptRatioItem {
  obdeptId: string;
  obdeptNm: string;
  ration: number;
}

export interface GetDeptRatiosResponse {
  listNo: string;
  deptRatios: DeptRatioItem[];
  total: number;
}

export interface SetDeptRatiosRequest {
  deptRatios: DeptRatioItem[];
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

export interface PersonnelRatioEmployee {
  empId: string;
  empName: string;
  ration: number;
}

export interface AppliedTemplate {
  template: '+10%' | '+20%' | '-10%' | '-20%';
  targetEmpId: string;
}

export interface GetPersonnelRatiosResponse {
  listNo: string;
  deptCode?: string | null;
  employees: PersonnelRatioEmployee[];
  total: number;
}

export interface SetPersonnelRatiosRequest {
  deptCode: string;
  deptName?: string;
  employees: PersonnelRatioEmployee[];
  appliedTemplate?: AppliedTemplate;
}

export interface SetPersonnelRatiosResponse {
  listNo: string;
  deptCode: string;
  savedCount: number;
  total: number;
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
