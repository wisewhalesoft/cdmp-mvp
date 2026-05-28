import { apiClient } from './client';

/**
 * F075 / F076 — POOLDATA 篩選欄位管理 + 類別型欄位可選值 API client
 *
 * Spec:
 *   - F075 v1.4: pooldata-fields CRUD + available-columns（含 F076-C 級聯停用）
 *   - F076 v1.3: pooldata-fields/:columnName/options CRUD
 *
 * 注意：backend controller path 為 'api/v1/pooldata-fields'（雙重前綴歷史 bug）
 *       FE baseURL='/api/v1' + path='/api/v1/...' → 實際 URL '/api/v1/api/v1/...'
 *       此 bug 不在 F075 v1.4 PR 範圍內（會影響既有所有端點），予以保留。
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
  /**
   * F075 v1.7 / US-144 AC-19：系統固定篩選欄位旗標（best_case=true）。
   * 驅動前端鎖定列、「新增條件」dropdown 排除、M06 停用按鈕 disabled（不 hardcode 'best_case'）。
   * 後端舊回應未含此欄位時前端應視為 false。
   */
  isSystemFixed?: boolean;
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
// F075 v1.4 — pooldata-fields/available-columns（新增 Modal dropdown 來源）
// =====================================================================

export interface AvailableColumn {
  columnName: string;
  dataType: string;
  suggestedFieldType: FieldType;
  /**
   * F075 v1.4.7 / AC-16：SQL Server `sys.extended_properties` 之 `MS_Description`。
   * 若欄位無 MS_Description / SQL Server 連線失敗 / ExtractionTask 查無，則 backend omit 此欄位
   * （非 null / 非空字串）。前端應以 `meta.columnDescription` truthy 判斷後再使用。
   */
  columnDescription?: string;
}

export interface ListAvailableColumnsResponse {
  availableColumns: AvailableColumn[];
}

/**
 * F075 v1.4 §5.5：取得 OBPOOLDATA 既有但尚未列入篩選欄位清單之欄位（含已停用過濾，BR-13）。
 *
 * 供新增 Modal dropdown 使用；空陣列為合法回傳（OBPOOLDATA 所有欄位皆已列入清單）。
 *
 * 權限（與寫入端點一致）：admin / director，受 FeatureFlagGuard 保護。
 */
export async function listAvailableColumns(): Promise<ListAvailableColumnsResponse> {
  const response = await apiClient.get<ListAvailableColumnsResponse>(
    `${BASE}/available-columns`,
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

/**
 * F076 §5.3：PATCH /api/v1/pooldata-fields/:columnName/options/:optionValue
 * Backend DTO（update-pooldata-option.dto.ts）強制 body 必含 `isActive: true`；
 * 預設僅傳 `{}` 會被 422 攔截「此端點僅支援重新啟用（isActive=true）」。
 */
export async function reactivateOption(
  columnName: string,
  optionValue: string,
  data: ReactivateOptionRequest = {},
): Promise<PooldataOption> {
  const response = await apiClient.patch<PooldataOption>(
    `${BASE}/${columnName}/options/${optionValue}`,
    { isActive: true, ...data },
  );
  return response.data;
}
