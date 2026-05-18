/**
 * F054 v1.3 落差 6 — detectOverlap 單元測試
 *
 * 規範來源：docs/specs/handoffs/F054-v1.3-prototype-alignment.md §6.6
 *
 * 涵蓋 4 個建議 case + 額外邊界 case：
 *   1. RANGE 無重疊 → null
 *   2. RANGE 邊界重疊（端點相同） → 字串
 *   3. RANGE 跨區間重疊 → 字串
 *   4. COMPOSITE 不同 level1 群內無重疊 → null
 *   5. CATEGORY 模式不偵測 → null
 *   6. 空陣列 / 單列 → null
 */
import { describe, it, expect } from 'vitest';
import { detectOverlap, type OverlapRow } from '../detect-overlap';

function range(level2S: string, level2E: string, score = 10): OverlapRow {
  return { level1: null, level2S, level2E, score };
}

function composite(
  level1: string,
  level2S: string,
  level2E: string,
  score = 10,
): OverlapRow {
  return { level1, level2S, level2E, score };
}

describe('detectOverlap — F054 v1.3 落差 6', () => {
  it('RANGE：[0-100], [101-200] 無重疊 → null', () => {
    const result = detectOverlap(
      [range('0', '100'), range('101', '200')],
      'RANGE',
    );
    expect(result).toBeNull();
  });

  it('RANGE：[0-100], [100-200] 邊界端點重疊 → 回字串', () => {
    const result = detectOverlap(
      [range('0', '100'), range('100', '200')],
      'RANGE',
    );
    expect(result).not.toBeNull();
    expect(result).toContain('重疊');
    expect(result).toContain('100');
  });

  it('RANGE：[0-100], [50-150] 跨區間重疊 → 回字串', () => {
    const result = detectOverlap(
      [range('0', '100'), range('50', '150')],
      'RANGE',
    );
    expect(result).not.toBeNull();
    expect(result).toContain('重疊');
  });

  it('COMPOSITE：A=[0-100] + A=[101-200] + B=[0-100] 群內無重疊 → null', () => {
    const result = detectOverlap(
      [
        composite('A', '0', '100'),
        composite('A', '101', '200'),
        composite('B', '0', '100'),
      ],
      'COMPOSITE',
    );
    expect(result).toBeNull();
  });

  it('COMPOSITE：A 群內 [0-100] 與 [50-150] 重疊 → 回字串並標註分群', () => {
    const result = detectOverlap(
      [composite('A', '0', '100'), composite('A', '50', '150')],
      'COMPOSITE',
    );
    expect(result).not.toBeNull();
    expect(result).toContain('分群 A');
  });

  it('CATEGORY 模式不偵測 → null', () => {
    const result = detectOverlap(
      [range('0', '100'), range('50', '150')],
      'CATEGORY',
    );
    expect(result).toBeNull();
  });

  it('空陣列 → null', () => {
    expect(detectOverlap([], 'RANGE')).toBeNull();
  });

  it('單列 → null', () => {
    expect(detectOverlap([range('0', '100')], 'RANGE')).toBeNull();
  });

  it('含 null/空字串欄位的列被略過 → null', () => {
    const result = detectOverlap(
      [
        { level1: null, level2S: null, level2E: null, score: 10 },
        range('0', '100'),
      ],
      'RANGE',
    );
    expect(result).toBeNull();
  });
});
