/**
 * F054 v1.3 — match_type 列舉
 *
 * 對應 spec：
 *   - architecture-spec.md §AD-E07-2 補充（fn_calc_tier_level 三分支計分）
 *   - data-model.md §ob_levelcard_column match_type 欄位設計
 *
 * 三正式列舉值（不可變更為 EXACT / NUMERIC / LITERAL 等變體）：
 *   - CATEGORY：類別精確比對（level1 必填）
 *   - RANGE：數值區間比對（level2_s 必填，level2_e 可選）
 *   - COMPOSITE：複合比對（先 level1 再 level2 區間）
 */
export enum MatchType {
  CATEGORY = 'CATEGORY',
  RANGE = 'RANGE',
  COMPOSITE = 'COMPOSITE',
}

/**
 * 列舉值清單常數（供 DB CHECK constraint 與 DTO 驗證共用）
 */
export const MATCH_TYPE_VALUES = ['CATEGORY', 'RANGE', 'COMPOSITE'] as const;

export type MatchTypeValue = (typeof MATCH_TYPE_VALUES)[number];
