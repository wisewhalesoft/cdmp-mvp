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
    scores: ScoringScoreItem[];
  }>;
}

export interface UpdateDimensionsResponse {
  cardType: string;
  cardVersion: number;
  updatedDimensions: number;
  updatedScores: number;
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

// ---- F056 ----

export interface TierMappingItem {
  cardType: string;
  cardLevel: string | null;
  tierLevel: string;
  listNm: string | null;
}

export interface GetTierMappingResponse {
  mappings: TierMappingItem[];
}

export async function getTierMapping(): Promise<GetTierMappingResponse> {
  const res = await apiClient.get<GetTierMappingResponse>(
    '/assignment/scoring/tier-mapping',
  );
  return res.data;
}

export async function updateTierMapping(payload: {
  mappings: Array<{
    cardType: string;
    cardLevel: string | null;
    tierLevel: string;
    listNm?: string | null;
  }>;
}): Promise<{ updatedCount: number; insertedCount: number }> {
  const res = await apiClient.put('/assignment/scoring/tier-mapping', payload);
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
