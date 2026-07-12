/**
 * F055 / F056 前端抽樣估算 client-side 重新分桶（AD-E07-45 v1.2）
 *
 * 背景：`GET .../card-levels/preview` 回應新增 `histogram: [{score,count}]`（原始、未分桶之
 * 樣本 score 分布）。前端對同一 cardType 僅呼叫一次該端點並快取 histogram，之後：
 *   - Tab 4 門檻編輯 → 對快取 histogram 依「草稿門檻」first-match-wins 重新分桶（零後端呼叫）
 *   - Tab 5 TIER 分布 → 對同一份快取 histogram 依「active 門檻」分桶 → 依 ob_tier 映射彙總至 TIER
 *
 * 本模組移植後端 `previewCardLevels` / `previewTierMapping` 之分桶 / 彙總演算法（first-match-wins、
 * 邊界含端點、多對一加總、放大推算），保持 I-SAMPLE-BUCKET-PARITY-01 邏輯等價。
 */

export interface ScoreHistogramBin {
  score: number;
  count: number;
}

export interface LevelBand {
  cardLevel: string;
  scoreS: number;
  scoreE: number;
}

export interface TierDistRow {
  tierLevel: string;
  /** 放大推算後之母體命中數 */
  count: number;
  /** count / totalCount（四捨五入至小數點後 4 位） */
  ratio: number;
}

export type TierDistMode = 'none' | 'fallback' | 'standard';

export interface TierDistResult {
  mode: TierDistMode;
  rows: TierDistRow[];
}

/**
 * 樣本 → 母體放大推算（AD-E07-45 §4.4 / §3.5，I-SAMPLE-SCALE-DENOM-01）。
 * 分母恆為 effectiveSampleSize（實際樣本列數），四捨五入至整數。
 */
export function scaleEstimate(
  sampleMatchCount: number,
  effectiveSampleSize: number,
  totalCount: number,
): number {
  if (effectiveSampleSize <= 0) return 0;
  return Math.round((sampleMatchCount / effectiveSampleSize) * totalCount);
}

/**
 * 依門檻 band 對 histogram 進行 first-match-wins 分桶（邊界含端點）。
 * 與後端 `previewCardLevels` 分桶迴圈採相同演算法（AD-E07-45 §5.1 point 5）。
 *
 * @returns Record<cardLevel, 樣本命中列數>（未放大）；每個傳入之 level 皆有鍵（未命中為 0）。
 */
export function bucketHistogramByLevels(
  histogram: ScoreHistogramBin[],
  levels: LevelBand[],
): Record<string, number> {
  const buckets: Record<string, number> = {};
  for (const lvl of levels) buckets[lvl.cardLevel] = 0;
  for (const bin of histogram) {
    for (const lvl of levels) {
      if (bin.score >= lvl.scoreS && bin.score <= lvl.scoreE) {
        buckets[lvl.cardLevel] += bin.count;
        break; // first-match-wins
      }
    }
  }
  return buckets;
}

/**
 * 由 histogram + 門檻 band 推算「各 CARD_LEVEL 分布」（放大推算至母體）。
 * @returns Record<cardLevel, 放大推算後母體命中數>
 */
export function deriveLevelDistribution(
  histogram: ScoreHistogramBin[],
  levels: LevelBand[],
  effectiveSampleSize: number,
  totalCount: number,
): Record<string, number> {
  const buckets = bucketHistogramByLevels(histogram, levels);
  const out: Record<string, number> = {};
  for (const lvl of levels) {
    out[lvl.cardLevel] = scaleEstimate(
      buckets[lvl.cardLevel] ?? 0,
      effectiveSampleSize,
      totalCount,
    );
  }
  return out;
}

/** T{n} → n（數值序）；無法解析回 99（排末尾）。避免 T10 排在 T2 之前之字典序陷阱。 */
export function tierNum(tierLevel: string): number {
  const m = /^T(\d+)/.exec(tierLevel);
  return m ? parseInt(m[1], 10) : 99;
}

function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}

export interface TierMappingLike {
  cardType?: string;
  cardLevel: string | null;
  tierLevel: string;
}

/**
 * 由 histogram + active 門檻 band + ob_tier 對應規則推算「各 TIER 分布」。
 * 移植後端 `previewTierMapping`（AD-E07-45 §5.2）之 histogram→card_level→tier 彙總演算法。
 *
 *   - 無任何對應規則 → mode 'none'（rows 空）
 *   - 存在 card_level === null 之 fallback 列 → mode 'fallback'：所有可計分樣本歸單一 TIER
 *     （分母仍為 effectiveSampleSize，故 ratio 不必為精確 1.0）
 *   - 否則 → mode 'standard'：逐 card_level 分桶 → 依對應累加至 TIER（多對一加總）→ 放大推算
 *
 * rows 依 TIER 數值序排序（T2 先於 T10）。
 */
export function deriveTierDistribution(
  histogram: ScoreHistogramBin[],
  activeLevels: LevelBand[],
  mappings: TierMappingLike[],
  effectiveSampleSize: number,
  totalCount: number,
): TierDistResult {
  if (!mappings || mappings.length === 0) {
    return { mode: 'none', rows: [] };
  }

  const fallback = mappings.find((m) => m.cardLevel == null);
  if (fallback) {
    const scoredSample = histogram.reduce((sum, b) => sum + b.count, 0);
    const count = scaleEstimate(scoredSample, effectiveSampleSize, totalCount);
    const ratio = totalCount > 0 ? round4(count / totalCount) : 0;
    return {
      mode: 'fallback',
      rows: [{ tierLevel: fallback.tierLevel, count, ratio }],
    };
  }

  // standard：逐 card_level 分桶樣本 → 累加至對應 TIER（多對一於此自然合併）
  const buckets = bucketHistogramByLevels(histogram, activeLevels);
  const perTierSample: Record<string, number> = {};
  for (const m of mappings) {
    if (m.cardLevel == null) continue;
    const sample = buckets[m.cardLevel] ?? 0;
    perTierSample[m.tierLevel] = (perTierSample[m.tierLevel] ?? 0) + sample;
  }

  const rows: TierDistRow[] = Object.entries(perTierSample)
    .map(([tierLevel, sample]) => {
      const count = scaleEstimate(sample, effectiveSampleSize, totalCount);
      const ratio = totalCount > 0 ? round4(count / totalCount) : 0;
      return { tierLevel, count, ratio };
    })
    .sort((a, b) => tierNum(a.tierLevel) - tierNum(b.tierLevel));

  return { mode: 'standard', rows };
}
