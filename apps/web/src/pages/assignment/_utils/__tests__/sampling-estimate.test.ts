/**
 * F055 / F056 前端抽樣估算重新分桶純函式測試（AD-E07-45 v1.2）
 *
 * cross-ref F055-test.md：
 *   TS-F055-058：前端重新分桶邏輯正確性（first-match-wins，client 與後端一致）
 *   TS-F055-035/036/037：scaleEstimate 旗艦值 / 除以零防禦 / 四捨五入
 *   TS-F056-050/051/053/054：TIER 多對一合計 / 一對一 / 數值序 / Fallback
 *   I-SAMPLE-BUCKET-PARITY-01 / I-SAMPLE-SCALE-DENOM-01
 */

import { describe, it, expect } from 'vitest';
import {
  scaleEstimate,
  bucketHistogramByLevels,
  deriveLevelDistribution,
  deriveTierDistribution,
  tierNum,
  type ScoreHistogramBin,
  type LevelBand,
} from '../sampling-estimate';

const H_LEVELS: LevelBand[] = [
  { cardLevel: 'A', scoreS: 250, scoreE: 999 },
  { cardLevel: 'B', scoreS: 150, scoreE: 249 },
  { cardLevel: 'C', scoreS: 0, scoreE: 149 },
];

const HISTO_58: ScoreHistogramBin[] = [
  { score: 100, count: 10 },
  { score: 200, count: 20 },
  { score: 300, count: 5 },
];

describe('scaleEstimate', () => {
  it('TS-F055-035：已知數值旗艦案例', () => {
    expect(scaleEstimate(2000, 50000, 1679489)).toBe(67180);
  });

  it('TS-F055-036：effectiveSampleSize <= 0 回 0（不拋除以零）', () => {
    expect(scaleEstimate(0, 0, 1679489)).toBe(0);
    expect(scaleEstimate(5, -1, 1000)).toBe(0);
  });

  it('TS-F055-037：.5 邊界標準四捨五入（非無條件捨去）', () => {
    expect(scaleEstimate(1, 4, 2)).toBe(1); // 0.5 → 1
  });

  it('小母體 fallback：sampleSize === totalCount 時等同精確全量', () => {
    expect(scaleEstimate(20, 100, 100)).toBe(20);
  });
});

describe('bucketHistogramByLevels（first-match-wins）', () => {
  it('TS-F055-058：依 band 分桶，邊界含端點', () => {
    const buckets = bucketHistogramByLevels(HISTO_58, H_LEVELS);
    expect(buckets).toEqual({ A: 5, B: 20, C: 10 });
  });

  it('邊界端點含入（score === scoreS / scoreE）', () => {
    const histo: ScoreHistogramBin[] = [
      { score: 250, count: 1 }, // A 下界
      { score: 249, count: 1 }, // B 上界
      { score: 0, count: 1 }, // C 下界
    ];
    expect(bucketHistogramByLevels(histo, H_LEVELS)).toEqual({ A: 1, B: 1, C: 1 });
  });

  it('未落入任何 band 之分數不計入（各桶維持 0 鍵存在）', () => {
    const histo: ScoreHistogramBin[] = [{ score: 1000, count: 3 }];
    const twoBands: LevelBand[] = [
      { cardLevel: 'A', scoreS: 0, scoreE: 100 },
      { cardLevel: 'B', scoreS: 101, scoreE: 200 },
    ];
    expect(bucketHistogramByLevels(histo, twoBands)).toEqual({ A: 0, B: 0 });
  });
});

describe('deriveLevelDistribution', () => {
  it('TS-F055-058：分桶後放大推算（小母體 sampleSize===totalCount 精確）', () => {
    const dist = deriveLevelDistribution(HISTO_58, H_LEVELS, 35, 35);
    // sampleSize=totalCount=35（sum=35）→ 精確
    expect(dist).toEqual({ A: 5, B: 20, C: 10 });
  });

  it('放大推算：sample 35 → 母體 3500（×100）', () => {
    const dist = deriveLevelDistribution(HISTO_58, H_LEVELS, 35, 3500);
    expect(dist).toEqual({ A: 500, B: 2000, C: 1000 });
  });

  it('動態等級數（S5 僅 A/B，不硬編碼 4 級）', () => {
    const s5Levels: LevelBand[] = [
      { cardLevel: 'A', scoreS: 200, scoreE: 999 },
      { cardLevel: 'B', scoreS: 0, scoreE: 199 },
    ];
    const histo: ScoreHistogramBin[] = [
      { score: 300, count: 4 },
      { score: 50, count: 6 },
    ];
    const dist = deriveLevelDistribution(histo, s5Levels, 10, 10);
    expect(Object.keys(dist)).toEqual(['A', 'B']);
    expect(dist).toEqual({ A: 4, B: 6 });
  });
});

describe('tierNum', () => {
  it('數值序（T2 < T10）', () => {
    expect(tierNum('T2')).toBe(2);
    expect(tierNum('T10')).toBe(10);
    expect(tierNum('T2') < tierNum('T10')).toBe(true);
  });
  it('無法解析回 99', () => {
    expect(tierNum('X')).toBe(99);
  });
});

describe('deriveTierDistribution', () => {
  const A_LEVELS: LevelBand[] = [
    { cardLevel: 'A', scoreS: 250, scoreE: 999 },
    { cardLevel: 'B', scoreS: 200, scoreE: 249 },
    { cardLevel: 'C', scoreS: 100, scoreE: 199 },
    { cardLevel: 'D', scoreS: 0, scoreE: 99 },
  ];
  // A=10, B=20, C=30, D=40（sample=100）
  const HISTO: ScoreHistogramBin[] = [
    { score: 300, count: 10 },
    { score: 220, count: 20 },
    { score: 150, count: 30 },
    { score: 50, count: 40 },
  ];

  it('TS-F056-050：Standard 多對一合計（A/B→T1、C→T2、D→T3）', () => {
    const mappings = [
      { cardLevel: 'A', tierLevel: 'T1' },
      { cardLevel: 'B', tierLevel: 'T1' },
      { cardLevel: 'C', tierLevel: 'T2' },
      { cardLevel: 'D', tierLevel: 'T3' },
    ];
    const res = deriveTierDistribution(HISTO, A_LEVELS, mappings, 100, 100);
    expect(res.mode).toBe('standard');
    expect(res.rows).toEqual([
      { tierLevel: 'T1', count: 30, ratio: 0.3 }, // A+B = 10+20
      { tierLevel: 'T2', count: 30, ratio: 0.3 }, // C
      { tierLevel: 'T3', count: 40, ratio: 0.4 }, // D
    ]);
  });

  it('TS-F056-051：一對一（無合計），4 筆彼此不合併', () => {
    const mappings = [
      { cardLevel: 'A', tierLevel: 'T1' },
      { cardLevel: 'B', tierLevel: 'T2' },
      { cardLevel: 'C', tierLevel: 'T3' },
      { cardLevel: 'D', tierLevel: 'T4' },
    ];
    const res = deriveTierDistribution(HISTO, A_LEVELS, mappings, 100, 100);
    expect(res.rows.map((r) => r.tierLevel)).toEqual(['T1', 'T2', 'T3', 'T4']);
    expect(res.rows.map((r) => r.count)).toEqual([10, 20, 30, 40]);
  });

  it('TS-F056-053：依 TIER 數值序排序（T10 不排在 T2 之前）', () => {
    const mappings = [
      { cardLevel: 'A', tierLevel: 'T10' },
      { cardLevel: 'B', tierLevel: 'T2' },
      { cardLevel: 'C', tierLevel: 'T1' },
    ];
    const levels3 = A_LEVELS.slice(0, 3);
    const res = deriveTierDistribution(HISTO, levels3, mappings, 100, 100);
    expect(res.rows.map((r) => r.tierLevel)).toEqual(['T1', 'T2', 'T10']);
  });

  it('TS-F056-054：Fallback 全樣本可計分 → 單一 TIER，ratio≈1', () => {
    const mappings = [{ cardLevel: null, tierLevel: 'T5' }];
    const res = deriveTierDistribution(HISTO, A_LEVELS, mappings, 100, 100);
    expect(res.mode).toBe('fallback');
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].tierLevel).toBe('T5');
    expect(res.rows[0].ratio).toBe(1);
    expect(res.rows[0].count).toBe(100);
  });

  it('TS-F056-055：Fallback 含 NULL-score 列（histogram sum < sampleSize）→ ratio < 1', () => {
    const mappings = [{ cardLevel: null, tierLevel: 'T5' }];
    // histogram sum=100，但 effectiveSampleSize=120（20 列不可計分）
    const res = deriveTierDistribution(HISTO, A_LEVELS, mappings, 120, 120);
    expect(res.mode).toBe('fallback');
    expect(res.rows[0].count).toBe(100);
    expect(res.rows[0].ratio).toBeLessThan(1);
  });

  it('AC-12：無任何對應規則 → mode none，rows 空', () => {
    const res = deriveTierDistribution(HISTO, A_LEVELS, [], 100, 100);
    expect(res).toEqual({ mode: 'none', rows: [] });
  });
});
