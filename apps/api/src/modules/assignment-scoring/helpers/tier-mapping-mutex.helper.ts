/**
 * F056 v1.5 / AC-3 / AC-4a / BR-13：Fallback / Standard 互斥檢查
 *
 * 規則：同一 CARD_TYPE 之 ob_tier 紀錄不可同時存在：
 *   - card_level IS NULL（Fallback 規則）
 *   - card_level IS NOT NULL（Standard 規則）
 *
 * 實作策略：應用層 Mutex 檢查（system-architect 決議，2026-05-14 — 不加 DB
 *   partial unique index / trigger，純應用層保證）。
 *
 * 抽 pure function 便於單元測試與重用（POST / PUT 寫入端點共用）。
 */

export interface TierRow {
  cardType: string;
  cardLevel: string | null;
}

/**
 * 判定給定一組 tier rows 對 targetCardType 是否違反 Fallback/Standard 互斥。
 *
 * @param rows            待檢查的 tier rows（DB 既有 + 預定寫入的最終態組合）
 * @param targetCardType  欲檢查的 CARD_TYPE
 * @returns true=違反互斥；false=不違反
 */
export function detectFallbackStandardMutexViolation(
  rows: ReadonlyArray<TierRow>,
  targetCardType: string,
): boolean {
  const sameCardType = rows.filter((r) => r.cardType === targetCardType);
  const hasFallback = sameCardType.some((r) => r.cardLevel == null);
  const hasStandard = sameCardType.some((r) => r.cardLevel != null);
  return hasFallback && hasStandard;
}
