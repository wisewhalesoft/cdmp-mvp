import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * F056 / OQ-E07-28 / data-model.md #ob-tier-entity：
 *   補 M3 / HC / C3 三筆 ob_tier fallback 對應（CARD_LEVEL = NULL）。
 *
 * 背景：OBMLISTDF dump 確認 M3 (31 筆) / HC (25 筆) / C3 (23 筆) 仍為業務現役 CARD_TYPE，
 * 但 OBTIER dump 中三者均無對應紀錄——舊系統以 SP `Stage2_依照CardType分類TierLevel.sql`
 * L93–123 硬編碼覆寫 TIER_LEVEL，未入 OBTIER 表。
 *
 * 遷移腳本（D3：OBTIER → ob_tier）執行後，本 migration 補入移植舊 SP 硬編碼語意的
 * fallback 對應（card_level IS NULL，與 M5 fallback 同形）。`fn_calc_tier_level` 計分後
 * 若無 CARD_LEVEL 對應，自動走 `card_level IS NULL` 分支取得 TIER_LEVEL。
 *
 *   - M3 → T5M（機車中結滿期名單，3 年以上）
 *   - HC → THC（汽車 HC 名單）
 *   - C3 → T3C（汽車 3 年以下）
 *
 * Idempotent：採 `ON CONFLICT DO NOTHING` 設計使 migration 可重跑（適配 PostgreSQL；
 * better-sqlite3 unit test 以 mock queryRunner 驗 SQL 字串，不真正執行）。
 *
 * down() 對應地僅刪除這 3 筆 fallback（限定 card_level IS NULL），不會誤刪標準對應。
 *
 * 配套 UNIQUE INDEX 策略（data-model.md A54）：
 *   - 真機 PostgreSQL：依賴 ob_tier 上 UNIQUE (card_type, COALESCE(card_level, ''))
 *     索引存在；若未建立，`ON CONFLICT` 子句需 fallback 至 WHERE NOT EXISTS（見下方）。
 *   - 開發階段為避免 UNIQUE INDEX 設定差異阻擋 seed，採 WHERE NOT EXISTS 寫法。
 */
export class SeedObTierFallback1711360000150 implements MigrationInterface {
  name = 'SeedObTierFallback1711360000150';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // M3 → T5M（card_level NULL fallback）
    await queryRunner.query(`
      INSERT INTO ob_tier (card_type, card_level, tier_level, list_nm)
      SELECT 'M3', NULL, 'T5M', '機車中結滿期名單（3年以上）'
      WHERE NOT EXISTS (
        SELECT 1 FROM ob_tier
        WHERE card_type = 'M3' AND card_level IS NULL
      )
    `);

    // HC → THC（card_level NULL fallback）
    await queryRunner.query(`
      INSERT INTO ob_tier (card_type, card_level, tier_level, list_nm)
      SELECT 'HC', NULL, 'THC', '汽車HC名單'
      WHERE NOT EXISTS (
        SELECT 1 FROM ob_tier
        WHERE card_type = 'HC' AND card_level IS NULL
      )
    `);

    // C3 → T3C（card_level NULL fallback）
    await queryRunner.query(`
      INSERT INTO ob_tier (card_type, card_level, tier_level, list_nm)
      SELECT 'C3', NULL, 'T3C', '汽車C3名單'
      WHERE NOT EXISTS (
        SELECT 1 FROM ob_tier
        WHERE card_type = 'C3' AND card_level IS NULL
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 限定 card_level IS NULL，避免誤刪標準對應紀錄
    await queryRunner.query(
      `DELETE FROM ob_tier WHERE card_type = 'M3' AND card_level IS NULL`,
    );
    await queryRunner.query(
      `DELETE FROM ob_tier WHERE card_type = 'HC' AND card_level IS NULL`,
    );
    await queryRunner.query(
      `DELETE FROM ob_tier WHERE card_type = 'C3' AND card_level IS NULL`,
    );
  }
}
