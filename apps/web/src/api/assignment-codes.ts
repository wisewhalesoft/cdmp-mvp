import { apiClient } from './client';

/**
 * F068：E07 代碼維護 API client
 * 對應 /api/v1/assignment/codes 4 個端點。
 */

export type AssignmentTblId = 'PROD_KIND' | 'SPEC_TP' | 'CASE_STATUS';

export const ASSIGNMENT_TBL_IDS: ReadonlyArray<AssignmentTblId> = [
  'PROD_KIND',
  'SPEC_TP',
  'CASE_STATUS',
] as const;

export const TBL_ID_LABELS: Record<AssignmentTblId, string> = {
  PROD_KIND: '產品類別',
  SPEC_TP: '專案類別',
  CASE_STATUS: '案件結清期別',
};

export interface AssignmentCodeItem {
  tblCd: string;
  tblDesc1: string | null;
  tblDesc2: string | null;
  stadt: string | null;
  enddt: string | null;
  active: boolean;
}

export interface ListCodesResponse {
  tblId: AssignmentTblId;
  data: AssignmentCodeItem[];
}

export interface CreateCodeBody {
  tblId: AssignmentTblId;
  tblCd: string;
  tblDesc1: string;
  tblDesc2?: string;
  stadt?: string;
  enddt?: string;
}

export interface UpdateCodeBody {
  tblDesc1: string;
  tblDesc2?: string;
}

export async function listAssignmentCodes(
  tblId: AssignmentTblId,
  includeInactive = false,
): Promise<ListCodesResponse> {
  const res = await apiClient.get<ListCodesResponse>('/assignment/codes', {
    params: { tblId, includeInactive },
  });
  return res.data;
}

export async function createAssignmentCode(
  body: CreateCodeBody,
): Promise<AssignmentCodeItem> {
  const res = await apiClient.post<AssignmentCodeItem>('/assignment/codes', body);
  return res.data;
}

export async function updateAssignmentCode(
  tblId: AssignmentTblId,
  tblCd: string,
  body: UpdateCodeBody,
): Promise<AssignmentCodeItem> {
  const res = await apiClient.put<AssignmentCodeItem>(
    `/assignment/codes/${encodeURIComponent(tblId)}/${encodeURIComponent(tblCd)}`,
    body,
  );
  return res.data;
}

export async function disableAssignmentCode(
  tblId: AssignmentTblId,
  tblCd: string,
): Promise<AssignmentCodeItem> {
  const res = await apiClient.put<AssignmentCodeItem>(
    `/assignment/codes/${encodeURIComponent(tblId)}/${encodeURIComponent(tblCd)}/disable`,
  );
  return res.data;
}
