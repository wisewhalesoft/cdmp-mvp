import { apiClient } from './client';

/**
 * F075 / F076 — POOLDATA 篩選欄位管理 + 類別型欄位可選值 API client
 *
 * Spec:
 *   - F075 v1.4: pooldata-fields CRUD + available-columns（含 F076-C 級聯停用）
 *   - F076 v1.3: pooldata-fields/:columnName/options CRUD
 *
 * 註：雙重前綴歷史 bug 已修——backend controller 改為 @Controller('pooldata-fields')（去掉 'api/v1'），
 *     FE BASE 同步改為 '/pooldata-fields'；apiClient baseURL='/api/v1' → 實際 URL '/api/v1/pooldata-fields'。
 */

const BASE = '/pooldata-fields';

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
  /**
   * F109 / US-172 AC-2：資料來源（'ob_pool_data' 案件資料 / 'customer_core' 客戶資料）。
   * 驅動 M06 列表「資料來源」欄 badge + 工具列來源篩選 + F050/F051「新增條件」選單分組
   * （依 dataSource 旗標渲染，不 hardcode 欄位字串）。後端舊回應未含此欄位時前端應視為 'ob_pool_data'。
   */
  dataSource?: 'ob_pool_data' | 'customer_core';
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
  /**
   * 可選值排序序位（越小越前）。驅動 F050/F051 名單定義多選元件之顯示順序。
   * 後端依 (display_order, option_value) 排序回傳；後端舊回應未含此欄位時前端視為 0。
   */
  displayOrder?: number;
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

/**
 * F076：調整可選值顯示順序。
 * PATCH /api/v1/pooldata-fields/:columnName/options/reorder
 * body `{ orderedValues }` 為欲套用的完整 option_value 排序陣列（display_order = 索引）。
 * 回傳套用後之完整可選值清單（含停用值，依新順序）。
 */
export async function reorderOptions(
  columnName: string,
  orderedValues: string[],
): Promise<ListOptionsResponse> {
  const response = await apiClient.patch<ListOptionsResponse>(
    `${BASE}/${columnName}/options/reorder`,
    { orderedValues },
  );
  return response.data;
}

// =====================================================================
// F112 / US-178 — 類別型可選值自動建議（distinct 偵測 + 批次帶入）
//
// AD-E07-47 §6：回應型別 LOCAL 定義於本檔（比照 PooldataField / ListFieldsResponse
// 之 LOCAL 慣例），此 feature family 無 @cdmp/shared 型別，不新增共享型別。
// 契約凍結（AD §3.4 / §3.7 / §5）：
//   - GET  /pooldata-fields/:columnName/distinct-values → DistinctValuesResponse
//   - POST /pooldata-fields/:columnName/options/bulk     → BulkCreateOptionsResponse
// =====================================================================

/**
 * distinct 偵測之單一值項目。`alreadyOption` 標註該值是否已為此欄位既有可選值
 * （含已停用；供進入點 2 去重，AC-7 / BR-2）。
 */
export interface DistinctValueItem {
  value: string;
  alreadyOption: boolean;
}

export interface DistinctValuesResponse {
  columnName: string;
  dataSource: 'ob_pool_data' | 'customer_core';
  values: DistinctValueItem[];
  totalReturned: number;
  truncated: boolean;
  cap: number;
}

/**
 * 批次新增可選值回應（AD §3.7）。`options[]` 僅含本次「實際新增」之可選值（依 display_order 遞增）；
 * 對已存在值冪等略過（不計入 `options`，計入 `skippedCount`）。
 */
export interface BulkCreateOptionsResponse {
  columnName: string;
  createdCount: number;
  skippedCount: number;
  options: Array<{ optionValue: string; optionLabel: string; isActive: true }>;
}

/**
 * F112 §5.1：查詢某欄位來源表之實際 distinct 值（供兩進入點核取清單）。
 * GET /api/v1/pooldata-fields/:columnName/distinct-values
 *
 * 錯誤（前端依 body `error` 代碼字串分流呈現，非依 HTTP status 數值）：
 *   400 SOURCE_COLUMN_NAME_INVALID / 404 SOURCE_COLUMN_NOT_FOUND /
 *   503 OBPOOLDATA_NOT_READY | CUSTOMER_CORE_NOT_READY | FEATURE_NOT_ENABLED /
 *   500 DISTINCT_VALUES_QUERY_TIMEOUT（逾時或非預期例外，禁止靜默空清單，BR-11）
 */
export async function getDistinctValues(
  columnName: string,
): Promise<DistinctValuesResponse> {
  const response = await apiClient.get<DistinctValuesResponse>(
    `${BASE}/${columnName}/distinct-values`,
  );
  return response.data;
}

/**
 * F112 §5.2：單一 transaction 批次新增可選值（兩進入點共用；對已存在值冪等略過，不回 409）。
 * POST /api/v1/pooldata-fields/:columnName/options/bulk
 *
 * `options[].optionValue` / `optionLabel` 預設皆為 distinct 值本身（AC-10 / BR-4）。
 */
export async function createOptionsBulk(
  columnName: string,
  options: Array<{ optionValue: string; optionLabel: string }>,
): Promise<BulkCreateOptionsResponse> {
  const response = await apiClient.post<BulkCreateOptionsResponse>(
    `${BASE}/${columnName}/options/bulk`,
    { options },
  );
  return response.data;
}
