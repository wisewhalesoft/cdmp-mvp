import { apiClient } from './client';

/**
 * F053 / F054 / F055 / F056：計分卡設定 API client
 * 對應 /api/v1/assignment/scoring/* 端點。
 */

// =========================
// 型別
// =========================

export type CardType = 'H' | 'S' | 'E' | 'S5' | 'E5' | 'M';

export const CARD_TYPE_OPTIONS: ReadonlyArray<{ value: CardType; label: string }> = [
  { value: 'H', label: 'H — 期中' },
  { value: 'S', label: 'S — 中結' },
  { value: 'E', label: 'E — 滿期' },
  { value: 'S5', label: 'S5 — 中結5年' },
  { value: 'E5', label: 'E5 — 滿期5年' },
  { value: 'M', label: 'M — 機車' },
];

// ---- F053 ----

/**
 * F054 v1.3 BR-8：match_type 三正式列舉值（CATEGORY / RANGE / COMPOSITE）。
 * 禁止其他變體（EXACT / NUMERIC / LITERAL 等）。
 *
 * 對應後端：apps/api/src/modules/assignment-scoring/dto/match-type.enum.ts
 */
export const MATCH_TYPE_VALUES = ['CATEGORY', 'RANGE', 'COMPOSITE'] as const;
export type MatchType = (typeof MATCH_TYPE_VALUES)[number];

/**
 * F054 v1.3：matchType chip 中文標籤與配色（與 prototype 28 一致）。
 */
export const MATCH_TYPE_LABELS: Record<MatchType, string> = {
  CATEGORY: '類別比對',
  RANGE: '數值區間',
  COMPOSITE: '複合比對',
};

export interface ScoringScoreItem {
  level1: string | null;
  level2S: string | null;
  level2E: string | null;
  score: number;
}

export interface ScoringDimensionItem {
  columnName: string;
  columnLabel: string;
  scoreSummary: string;
  /** F054 v1.3：後端必回此欄位（CATEGORY / RANGE / COMPOSITE） */
  matchType?: MatchType;
  scores: ScoringScoreItem[];
}

export interface ScoringVersionInfo {
  cardType: string;
  cardName: string | null;
  cardVersion: number;
  sdate: string;
  edate: string;
  createdBy: string | null;
  createdAt: string | null;
}

export interface GetScoringResponse {
  version: ScoringVersionInfo;
  dimensions: ScoringDimensionItem[];
}

export async function getScoring(cardType: CardType): Promise<GetScoringResponse> {
  const res = await apiClient.get<GetScoringResponse>('/assignment/scoring', {
    params: { cardType },
  });
  return res.data;
}

// ---- F054 ----

export interface DimensionUpdatePayload {
  cardType: CardType;
  cardVersion: number;
  dimensions: Array<{
    columnName: string;
    columnLabel: string;
    /** F054 v1.3 BR-8：matchType 為必填欄位 */
    matchType: MatchType;
    scores: ScoringScoreItem[];
  }>;
}

export interface UpdateDimensionsResponse {
  cardType: string;
  cardVersion: number;
  updatedDimensions: number;
  updatedScores: number;
  /** F054 v1.3 AC-2b：本次因 matchType 切換而被自動清空 scores 的 column_name */
  matchTypeChanged?: string[];
}

export async function updateDimensions(
  payload: DimensionUpdatePayload,
): Promise<UpdateDimensionsResponse> {
  const res = await apiClient.put<UpdateDimensionsResponse>(
    '/assignment/scoring/dimensions',
    payload,
  );
  return res.data;
}

export interface CreateDimensionPayload {
  cardType: CardType;
  cardVersion: number;
  columnName: string;
  columnLabel: string;
  /** F054 v1.3 BR-8：matchType 為必填欄位 */
  matchType: MatchType;
  scores: ScoringScoreItem[];
}

export async function createDimension(payload: CreateDimensionPayload) {
  const res = await apiClient.post('/assignment/scoring/dimensions', payload);
  return res.data;
}

export async function disableDimension(cardType: CardType, columnName: string) {
  const res = await apiClient.put(
    `/assignment/scoring/dimensions/${encodeURIComponent(columnName)}/disable`,
    undefined,
    { params: { cardType } },
  );
  return res.data;
}

// ---- F055 ----

export interface CardLevelItem {
  cardLevel: string;
  scoreS: number;
  scoreE: number;
}

export interface GetCardLevelsResponse {
  cardType: string;
  cardVersion: number;
  levels: CardLevelItem[];
}

export async function getCardLevels(
  cardType: CardType,
  cardVersion?: number,
): Promise<GetCardLevelsResponse> {
  const res = await apiClient.get<GetCardLevelsResponse>(
    '/assignment/scoring/card-levels',
    { params: { cardType, cardVersion } },
  );
  return res.data;
}

export interface UpdateCardLevelsResponse {
  cardType: string;
  cardVersion: number;
  updatedLevels: number;
}

export async function updateCardLevels(payload: {
  cardType: CardType;
  cardVersion: number;
  levels: CardLevelItem[];
}): Promise<UpdateCardLevelsResponse> {
  const res = await apiClient.put<UpdateCardLevelsResponse>(
    '/assignment/scoring/card-levels',
    payload,
  );
  return res.data;
}

export interface PreviewCardLevelsResponse {
  distribution: Record<string, number>;
}

export async function previewCardLevels(
  cardType: CardType,
  levels: CardLevelItem[],
): Promise<PreviewCardLevelsResponse> {
  const res = await apiClient.get<PreviewCardLevelsResponse>(
    '/assignment/scoring/card-levels/preview',
    { params: { cardType, levels: JSON.stringify(levels) } },
  );
  return res.data;
}

// ---- F056 v1.5 ----

/**
 * TIER_LEVEL 列舉（F056 v1.5 AC-8 / architecture-spec §E07-G D-CT-03）。
 * 寫入端點之 tierLevel 必須屬於此列舉，違反回 422 TIER_LEVEL_INVALID_ENUM。
 */
export const TIER_LEVEL_ENUM = [
  'T1',
  'T2',
  'T3',
  'T4',
  'T5',
  'T6',
  'T7',
  'T8',
  'T9',
  'T10',
] as const;
export type TierLevelEnum = (typeof TIER_LEVEL_ENUM)[number];

/**
 * F056 v1.5 已知舊後綴值（待遷移 badge 用）。
 * 殘留於 ob_tier 的舊值在前端以「待遷移」琥珀 badge 標示。
 */
export const LEGACY_TIER_VALUES = new Set([
  'T1M', 'T1HM', 'T2HM', 'T3M', 'T3HM', 'T32', 'T3C',
  'T4M', 'T51', 'T52', 'T5M', 'THC',
]);

export interface TierMappingItem {
  cardType: string;
  cardLevel: string | null;
  tierLevel: string;
  listNm: string | null;
}

export interface GetTierMappingResponse {
  mappings: TierMappingItem[];
}

/**
 * F056 v1.5：cardType 參數現為必填（後端 query 必填 + 範圍鎖）。
 *
 * Iter 5b 補強：
 *   - GET / PUT 加 cardType query
 *   - tierLevel 型別宣告為 TierLevelEnum（T1~T10）
 *   - 新錯誤碼處理由呼叫端負責（service 已 422 / 404 / 409；client 透傳）
 */
export async function getTierMapping(
  cardType: string,
): Promise<GetTierMappingResponse> {
  const res = await apiClient.get<GetTierMappingResponse>(
    '/assignment/scoring/tier-mapping',
    { params: { cardType } },
  );
  return res.data;
}

export async function updateTierMapping(
  cardType: string,
  payload: {
    mappings: Array<{
      cardType: string;
      cardLevel: string | null;
      tierLevel: string;
      listNm?: string | null;
    }>;
  },
): Promise<{ updatedCount: number; insertedCount: number }> {
  const res = await apiClient.put(
    '/assignment/scoring/tier-mapping',
    payload,
    { params: { cardType } },
  );
  return res.data;
}

export async function createTierMapping(payload: {
  cardType: string;
  cardLevel: string | null;
  tierLevel: string;
  listNm?: string | null;
}): Promise<TierMappingItem> {
  const res = await apiClient.post('/assignment/scoring/tier-mapping', payload);
  return res.data;
}

// ---- F055 v1.5 §5.4 POST ----

export interface CreateCardLevelPayload {
  cardType: CardType;
  cardLevel: string;
  scoreS: number;
  scoreE: number;
}

export interface CreateCardLevelResponse {
  cardType: string;
  cardVersion: number;
  cardLevel: string;
  scoreS: number;
  scoreE: number;
  createdAt: string;
}

/**
 * F055 v1.5 §5.4：新增單筆 CARD_LEVEL 等級至選中 CARD_TYPE 之 active 計分版本。
 *
 * Request body 不含 `cardVersion`（後端依 active 版本自動帶入）。
 * 對應 AC-8 ~ AC-8f / BR-1 / BR-7 / BR-8 / BR-9。
 */
export async function createCardLevel(
  payload: CreateCardLevelPayload,
): Promise<CreateCardLevelResponse> {
  const res = await apiClient.post<CreateCardLevelResponse>(
    '/assignment/scoring/card-levels',
    payload,
  );
  return res.data;
}

// ---- F055 §5.3 DELETE ----

export interface DeleteCardLevelResponse {
  cardType: string;
  cardVersion: number;
  cardLevel: string;
  deletedAt: string;
}

export async function deleteCardLevel(
  cardType: CardType,
  cardVersion: number,
  cardLevel: string,
): Promise<DeleteCardLevelResponse> {
  const res = await apiClient.delete<DeleteCardLevelResponse>(
    '/assignment/scoring/card-levels',
    { params: { cardType, cardVersion, cardLevel } },
  );
  return res.data;
}

// ---- F056 §5.4 DELETE ----

export interface DeleteTierMappingResponse {
  cardType: string;
  cardLevel: string | null;
  deletedAt: string;
}

/**
 * cardLevel === null 時，省略 query 參數（service 解讀為 fallback NULL）。
 * 不可傳空字串（F056 BR-9）。
 */
export async function deleteTierMapping(
  cardType: string,
  cardLevel: string | null,
): Promise<DeleteTierMappingResponse> {
  const params: Record<string, string> = { cardType };
  if (cardLevel !== null) {
    params.cardLevel = cardLevel;
  }
  const res = await apiClient.delete<DeleteTierMappingResponse>(
    '/assignment/scoring/tier-mapping',
    { params },
  );
  return res.data;
}
