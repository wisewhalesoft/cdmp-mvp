/**
 * F054 v1.3 落差 6：分數區間重疊偵測（純前端 UX 提示）
 *
 * 規範來源：docs/specs/handoffs/F054-v1.3-prototype-alignment.md §6.6
 *                prototypes/28-scoring-config.html L823-833（UX 提示，不鎖儲存）
 *
 * 對應商業規則：BR-3「數值區間不可重疊」
 *
 * 規則：
 *   - 僅 RANGE / COMPOSITE 模式需偵測（CATEGORY 不偵測）
 *   - RANGE：對所有 rows 兩兩比較 [level2_s, level2_e] 是否重疊
 *   - COMPOSITE：先按 level1 分群，群內再做 RANGE 偵測
 *
 * 重疊定義：rowA.level2_e >= rowB.level2_s AND rowA.level2_s <= rowB.level2_e
 *
 * 回傳：null（無重疊）或 string（人類可讀描述，供 UI 顯示）
 *
 * 注意：最終仲裁仍由後端 422 SCORING_RANGE_OVERLAP；本函式為 UX 提示，不阻擋儲存。
 */
import type { MatchType } from '@/api/assignment-scoring';

export interface OverlapRow {
  level1: string | null;
  level2S: string | null;
  level2E: string | null;
  score: number;
}

export function detectOverlap(
  rows: OverlapRow[],
  matchType: MatchType,
): string | null {
  if (matchType !== 'RANGE' && matchType !== 'COMPOSITE') return null;
  if (!rows || rows.length < 2) return null;

  // 依 matchType 分群：RANGE 全部視為單一群；COMPOSITE 按 level1 分群
  const groups: Record<string, Array<{ row: OverlapRow; idx: number }>> = {};
  rows.forEach((r, idx) => {
    const key =
      matchType === 'RANGE' ? '__all__' : (r.level1 ?? '__null__');
    if (!groups[key]) groups[key] = [];
    groups[key].push({ row: r, idx });
  });

  for (const [groupKey, groupEntries] of Object.entries(groups)) {
    // 僅比較同時具備 level2S / level2E 的列
    const valid = groupEntries.filter(
      ({ row }) =>
        row.level2S !== null &&
        row.level2S !== '' &&
        row.level2E !== null &&
        row.level2E !== '',
    );
    for (let i = 0; i < valid.length; i++) {
      for (let j = i + 1; j < valid.length; j++) {
        const a = valid[i].row;
        const b = valid[j].row;
        const aS = Number(a.level2S);
        const aE = Number(a.level2E);
        const bS = Number(b.level2S);
        const bE = Number(b.level2E);
        if (
          Number.isNaN(aS) ||
          Number.isNaN(aE) ||
          Number.isNaN(bS) ||
          Number.isNaN(bE)
        ) {
          continue;
        }
        if (aE >= bS && aS <= bE) {
          const groupHint =
            matchType === 'COMPOSITE' ? `（分群 ${groupKey}）` : '';
          // 顯示用 1-based 列號（在原 rows 陣列中的位置）
          const aPos = valid[i].idx + 1;
          const bPos = valid[j].idx + 1;
          return `第 ${aPos} 列 [${aS}, ${aE}] 與第 ${bPos} 列 [${bS}, ${bE}] 重疊${groupHint}`;
        }
      }
    }
  }
  return null;
}
