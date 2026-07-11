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
  /** F088 v1.3 BR-11：該部門比例設定者姓名（無既有設定為 null） */
  setByName?: string | null;
  /** F088 v1.3 BR-11：設定者為部長（director/admin）→「部長代設定」 */
  proxyByDirector?: boolean;
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

export async function getDeptRatios(
  listNo: string,
  opts?: { excludeZeroRatio?: boolean },
): Promise<GetDeptRatiosResponse> {
  const params: Record<string, string> = {};
  // 準備完成摘要等唯讀檢視傳 true：後端隱藏比例 = 0% 之部門（設定頁不傳，維持全部顯示）。
  if (opts?.excludeZeroRatio) params.excludeZeroRatio = 'true';
  const response = await apiClient.get<GetDeptRatiosResponse>(
    `/assignment/ratios/dept/${listNo}`,
    { params },
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
  /** 該部門目前處長姓名（沿用 F079 BR-14 定義；無對應人員回 null）。 */
  directorName: string | null;
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
  /**
   * F084 v2.0 auto-advance 結果（對齊後端 personnel-ratio.service.ts setPersonnelRatios return）。
   * - autoAdvanced: 本次 PUT 是否觸發自動推進成功（true → stage 已自動推進至 approval）
   * - newStage: autoAdvanced=true 時為 'approval'，否則 null
   * - autoAdvanceFailReason: 僅「auto-advance 因月名單分派 guard 阻擋而跳過」時為
   *   'ASSIGNMENT_RUN_ALREADY_RUNNING'；其餘 autoAdvanced=false 情境一律 null（不帶 failReason）
   */
  autoAdvanced: boolean;
  newStage: string | null;
  autoAdvanceFailReason?: string | null;
}

export async function getPersonnelRatios(
  listNo: string,
  deptCode?: string,
  opts?: { excludeResigned?: boolean },
): Promise<GetPersonnelRatiosResponse> {
  const params: Record<string, string> = {};
  if (deptCode) params.deptCode = deptCode;
  // 個別比例設定頁傳 true：後端只回在職員工（離職無法設比例、顯示無意義）。
  // 完成彙總頁不傳，維持「顯示離職 + X 位離職不計」既有行為。
  if (opts?.excludeResigned) params.excludeResigned = 'true';
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

// ---------------------------------------------------------------------------
// 「從本月其他名單複製」個別業務比例來源（設定頁 UX 優化）
// ---------------------------------------------------------------------------

export interface PersonnelRatioCopySourceEmployee {
  empId: string;
  empName: string;
  ration: number;
}

export interface PersonnelRatioCopySource {
  /** 來源名單編號 */
  listNo: string;
  /** 來源名單名稱 */
  listNm: string;
  /** 該部門已設定比例之在職業務員數 */
  memberCount: number;
  /** 該部門比例加總（供預覽是否 = 100%） */
  deptSum: number;
  employees: PersonnelRatioCopySourceEmployee[];
}

export interface GetPersonnelRatioCopySourcesResponse {
  listNo: string;
  deptCode: string;
  sources: PersonnelRatioCopySource[];
}

/**
 * 取得可供複製的「本月其他名單」個別業務比例來源（依部門）。
 * 後端僅回本月在職員工之比例，且排除本名單自身；處長視角受轄區把關。
 */
export async function getPersonnelRatioCopySources(
  listNo: string,
  deptCode: string,
): Promise<GetPersonnelRatioCopySourcesResponse> {
  const response = await apiClient.get<GetPersonnelRatioCopySourcesResponse>(
    `/assignment/ratios/personnel/${listNo}/copy-sources`,
    { params: { deptCode } },
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
