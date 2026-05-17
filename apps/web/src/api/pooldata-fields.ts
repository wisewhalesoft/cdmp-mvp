import { apiClient } from './client';

/**
 * F075 / F076 — POOLDATA 篩選欄位白名單 + 類別型欄位可選值 API client
 *
 * Spec:
 *   - F075 v1.3: pooldata-fields CRUD（含 F076-C 級聯停用）
 *   - F076 v1.3: pooldata-fields/:columnName/options CRUD
 *
 * 注意：backend controller path 為 'api/v1/pooldata-fields'（雙重前綴 bug）
 *       FE baseURL='/api/v1' + path='/api/v1/...' → 實際 URL '/api/v1/api/v1/...'
 */

const BASE = '/api/v1/pooldata-fields';

// =====================================================================
// F075 — pooldata-fields (whitelist)
// =====================================================================

export type FieldType = 'numeric' | 'categorical' | 'date';

export interface PooldataField {
  columnName: string;
  displayName: string;
  fieldType: FieldType;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

export interface ListFieldsQuery {
  active?: 'true' | 'false';
}

export interface ListFieldsResponse {
  fields: PooldataField[];
}

export async function listFields(
  query: ListFieldsQuery = {},
): Promise<ListFieldsResponse> {
  const params: Record<string, string> = {};
  if (query.active) params.active = query.active;
  const response = await apiClient.get<ListFieldsResponse>(BASE, { params });
  return response.data;
}

export interface ActiveOptionsCountResponse {
  columnName: string;
  activeCount: number;
}

/**
 * F076-C 預查：UI confirm Modal「將自動停用 N 個可選值」用。
 */
export async function getActiveOptionsCount(
  columnName: string,
): Promise<ActiveOptionsCountResponse> {
  const response = await apiClient.get<ActiveOptionsCountResponse>(
    `${BASE}/${columnName}/active-options-count`,
  );
  return response.data;
}

export interface CreateFieldRequest {
  columnName: string;
  displayName: string;
  fieldType: FieldType;
}

export async function createField(data: CreateFieldRequest): Promise<PooldataField> {
  const response = await apiClient.post<PooldataField>(BASE, data);
  return response.data;
}

export interface UpdateFieldRequest {
  displayName?: string;
  fieldType?: FieldType;
  isActive?: boolean;
}

export async function updateField(
  columnName: string,
  data: UpdateFieldRequest,
): Promise<PooldataField> {
  const response = await apiClient.patch<PooldataField>(
    `${BASE}/${columnName}`,
    data,
  );
  return response.data;
}

export async function disableField(columnName: string): Promise<{ message: string }> {
  const response = await apiClient.delete<{ message: string }>(
    `${BASE}/${columnName}`,
  );
  return response.data;
}

// =====================================================================
// F076 — pooldata-fields/:columnName/options
// =====================================================================

export interface PooldataOption {
  columnName: string;
  optionValue: string;
  optionLabel: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  deactivatedReason?: string | null;
}

export interface ListOptionsQuery {
  active?: 'true' | 'false';
  includeInactive?: 'true' | 'false';
}

export interface ListOptionsResponse {
  options: PooldataOption[];
}

export async function listOptions(
  columnName: string,
  query: ListOptionsQuery = {},
): Promise<ListOptionsResponse> {
  const params: Record<string, string> = {};
  if (query.active) params.active = query.active;
  if (query.includeInactive) params.includeInactive = query.includeInactive;
  const response = await apiClient.get<ListOptionsResponse>(
    `${BASE}/${columnName}/options`,
    { params },
  );
  return response.data;
}

export interface CreateOptionRequest {
  optionValue: string;
  optionLabel: string;
}

export async function createOption(
  columnName: string,
  data: CreateOptionRequest,
): Promise<PooldataOption> {
  const response = await apiClient.post<PooldataOption>(
    `${BASE}/${columnName}/options`,
    data,
  );
  return response.data;
}

export interface DeactivateOptionRequest {
  isActive: false;
  reason: string;
}

export async function deactivateOption(
  columnName: string,
  optionValue: string,
  data: DeactivateOptionRequest,
): Promise<PooldataOption> {
  const response = await apiClient.patch<PooldataOption>(
    `${BASE}/${columnName}/options/${optionValue}/deactivate`,
    data,
  );
  return response.data;
}

export interface ReactivateOptionRequest {
  optionLabel?: string;
}

export async function reactivateOption(
  columnName: string,
  optionValue: string,
  data: ReactivateOptionRequest = {},
): Promise<PooldataOption> {
  const response = await apiClient.patch<PooldataOption>(
    `${BASE}/${columnName}/options/${optionValue}`,
    data,
  );
  return response.data;
}
