import { apiClient } from './client';

/**
 * F069 / F070 / F071 / F072：CARD_TYPE 計分卡類型 API client
 * 對應 /api/v1/assignment/scoring/card-types/* 端點。
 *
 * 設計：
 *   - 業務主管可透過 F070 動態新增 cardType，故型別採 `string` 而非 union type；
 *     既有 `api/assignment-scoring.ts` 的 union `CardType` ('H'|'S'|...) 保留供
 *     Iter 5b 之前的 v1.4 既有元件使用（向後相容）。
 *   - 本檔 export `CardTypeCode = string` 供新元件（Tab 1 + 3 Modal）共用。
 */

// =========================
// 型別
// =========================

/** 動態 CARD_TYPE 代碼（業務主管可透過 F070 新增） */
export type CardTypeCode = string;

export interface CardTypeListItem {
  cardType: string;
  cardName: string;
  prodKind: string;
  prodKindName: string | null;
  status: 'active' | 'inactive';
  // Iter 9：banner metadata（後端從 active version + users JOIN 帶回）
  cardVersion: number | null;
  sdate: string | null;
  edate: string | null;
  createdBy: string | null;
  createdAt: string | null;
}

export interface ListCardTypesResponse {
  cardTypes: CardTypeListItem[];
}

/**
 * Iter 9：GET /:cardType/stats response
 * 對應 banner KPI 5 欄（dim/score/level/tier/listDefsAffected）。
 */
export interface CardTypeStatsResponse {
  cardType: string;
  dimCount: number;
  scoreCount: number;
  levelCount: number;
  tierCount: number;
  listDefsAffected: number;
}

export interface CreateCardTypePayload {
  cardType: string;
  cardName: string;
  prodKind: string;
}

export interface CreateCardTypeResponse {
  cardType: string;
  cardName: string;
  prodKind: string;
  prodKindName: string | null;
  status: 'active';
  cardVersion: number;
  createdAt: string;
}

export interface UpdateCardTypePayload {
  cardName: string;
  prodKind: string;
}

export interface UpdateCardTypeResponse {
  cardType: string;
  cardName: string;
  prodKind: string;
  prodKindName: string | null;
  status: 'active' | 'inactive';
  updatedAt: string;
}

export interface CascadeCountSummary {
  versions: number;
  columns: number;
  scores: number;
  levels: number;
  tierMappings: number;
}

export interface DeletePreviewResponse {
  cardType: string;
  cardName: string;
  cascade: CascadeCountSummary;
  listDefinitionsAffected: number;
}

export interface DeleteCardTypeResponse {
  cardType: string;
  deletedCascade: CascadeCountSummary;
  listDefinitionsAffected: number;
  deletedAt: string;
}

// =========================
// API functions
// =========================

/** F069：取得 CARD_TYPE 清單 */
export async function listCardTypes(
  status: 'active' | 'all' = 'active',
): Promise<ListCardTypesResponse> {
  const res = await apiClient.get<ListCardTypesResponse>(
    '/assignment/scoring/card-types',
    { params: status === 'all' ? { status: 'all' } : {} },
  );
  return res.data;
}

/** F070：新增 CARD_TYPE（同 tx 建立 v1 版本） */
export async function createCardType(
  payload: CreateCardTypePayload,
): Promise<CreateCardTypeResponse> {
  const res = await apiClient.post<CreateCardTypeResponse>(
    '/assignment/scoring/card-types',
    payload,
  );
  return res.data;
}

/** F071：編輯 CARD_TYPE（card_name / prod_kind；cardType 為 join key 不可改） */
export async function updateCardType(
  cardType: string,
  payload: UpdateCardTypePayload,
): Promise<UpdateCardTypeResponse> {
  const res = await apiClient.put<UpdateCardTypeResponse>(
    `/assignment/scoring/card-types/${encodeURIComponent(cardType)}`,
    payload,
  );
  return res.data;
}

/** F072：取得停用預覽（cascade count + listDefinitionsAffected） */
export async function getDeletePreview(
  cardType: string,
): Promise<DeletePreviewResponse> {
  const res = await apiClient.get<DeletePreviewResponse>(
    `/assignment/scoring/card-types/${encodeURIComponent(cardType)}/delete-preview`,
  );
  return res.data;
}

/** F072：執行級聯刪除（需 confirmCascade=true） */
export async function deleteCardType(
  cardType: string,
): Promise<DeleteCardTypeResponse> {
  const res = await apiClient.delete<DeleteCardTypeResponse>(
    `/assignment/scoring/card-types/${encodeURIComponent(cardType)}`,
    { params: { confirmCascade: 'true' } },
  );
  return res.data;
}

/** Iter 9：取得 CARD_TYPE 的 5 個 KPI 統計 */
export async function getCardTypeStats(
  cardType: string,
): Promise<CardTypeStatsResponse> {
  const res = await apiClient.get<CardTypeStatsResponse>(
    `/assignment/scoring/card-types/${encodeURIComponent(cardType)}/stats`,
  );
  return res.data;
}

// =========================
// PROD_KIND 視覺對照（與 prototype 28 line 898-902 一致）
// =========================

export interface ProdKindStyle {
  /** Tailwind background class */
  bg: string;
  /** Tailwind text class */
  text: string;
  /** Lucide icon name（已對齊 lucide-react 命名） */
  icon: 'car' | 'bike' | 'package' | 'alert-circle';
  /** 中文名稱 */
  name: string;
}

export const PROD_KIND_STYLES: Record<string, ProdKindStyle> = {
  '01': { bg: 'bg-blue-100', text: 'text-blue-700', icon: 'car', name: '汽車' },
  '02': { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: 'bike', name: '機車' },
  '03': { bg: 'bg-violet-100', text: 'text-violet-700', icon: 'package', name: '一般商品' },
};

/** Fallback 樣式（PROD_KIND 已停用或對照不存在） */
export const PROD_KIND_FALLBACK_STYLE: ProdKindStyle = {
  bg: 'bg-gray-100',
  text: 'text-gray-400',
  icon: 'alert-circle',
  name: '— PROD_KIND 已停用',
};

/**
 * PROD_KIND 下拉選項（依 prototype 28 line 516-520 一致）。
 * Iter 5a 採 hardcoded；後續若 spec 要求動態載入 ob_code_df，再改為 useQuery。
 */
export const PROD_KIND_OPTIONS: ReadonlyArray<{
  value: string;
  label: string;
}> = [
  { value: '01', label: '01 汽車' },
  { value: '02', label: '02 機車' },
  { value: '03', label: '03 一般商品' },
];
