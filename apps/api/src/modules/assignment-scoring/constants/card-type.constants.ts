/**
 * F069~F072 / F056 v1.5 / architecture-spec §E07-G:
 *   CARD_TYPE 與 TIER_LEVEL 共用常數
 *
 * Iter 1 預先建立，供：
 *   - Migration D-CT-02 seed（6 個正規 CARD_TYPE）
 *   - Migration D-CT-03 D11 驗證（T1~T10）
 *   - Iter 2~4 Service 端列舉檢查（assertTierLevelValid / CARD_TYPE seed 對照）
 *
 * SSOT 原則：所有引用 T1~T10 列舉與 6 個正規 CARD_TYPE 的程式碼，均從本檔 import。
 */

/**
 * 6 個正規 CARD_TYPE（與 architecture-spec §E07-G D-CT-02 對照表一致；
 * 來源驗證：OBMLISTDF dump 第 2/3/4/5/6/7/8/53/54 行）。
 */
export const CARD_TYPE_NORMATIVE = [
  { card_type: 'H', card_name: '期中', prod_kind: '01' },
  { card_type: 'S', card_name: '中結', prod_kind: '01' },
  { card_type: 'E', card_name: '滿期', prod_kind: '01' },
  { card_type: 'S5', card_name: '中結5年', prod_kind: '01' },
  { card_type: 'E5', card_name: '滿期5年', prod_kind: '01' },
  { card_type: 'M', card_name: '機車', prod_kind: '02' },
] as const;

export const CARD_TYPE_NORMATIVE_SET: ReadonlySet<string> = new Set(
  CARD_TYPE_NORMATIVE.map((c) => c.card_type),
);

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

export const TIER_LEVEL_ENUM_SET: ReadonlySet<string> = new Set(TIER_LEVEL_ENUM);

/**
 * 舊後綴值 → T1~T10 對照表（架構決策 architecture-spec §E07-G）：
 *   - 一般正則 `^T(\d+)` 取數字前綴
 *   - THC 為特例，無數字前綴，遷移至 T1
 *
 * 用於：
 *   - Migration 1711360000162-MigrateObTierTierLevelSuffix（舊後綴遷移）
 *   - 文件 / Audit 追溯
 */
export const TIER_LEVEL_SUFFIX_MIGRATION_MAP: ReadonlyArray<{
  from: string;
  to: TierLevelEnum;
}> = [
  // 一般正則：^T(\d+).*
  { from: 'T1M', to: 'T1' },
  { from: 'T1HM', to: 'T1' },
  { from: 'T2HM', to: 'T2' },
  { from: 'T3M', to: 'T3' },
  { from: 'T3HM', to: 'T3' },
  { from: 'T32', to: 'T3' },
  { from: 'T3C', to: 'T3' },
  { from: 'T4M', to: 'T4' },
  { from: 'T51', to: 'T5' },
  { from: 'T52', to: 'T5' },
  { from: 'T5M', to: 'T5' },
  // 特例：無數字前綴
  { from: 'THC', to: 'T1' },
];
