import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * F054 v1.3 — AddMatchTypeToObLevelcardColumn（AD-E07-2 補充 / 2026-05-18）
 *
 * 為 ob_levelcard_column 新增 match_type 欄位，供 fn_calc_tier_level 依
 * CATEGORY / RANGE / COMPOSITE 三分支計分使用。
 *
 * 對應 spec：
 *   - architecture-spec.md §AD-E07-2 補充（match_type 切換 atomic transaction）
 *   - architecture-spec.md §AD-E07-3 / E07-B（schema 補建表）
 *   - data-model.md §ob_levelcard_column match_type Migration 設計（v1.3）
 *
 * up() 執行順序：
 *   1) ADD COLUMN match_type VARCHAR(20) NULL（先允許 NULL 以利 backfill）
 *   2) Backfill：依 ob_levelcard_score.level1 / level2_s 推導
 *      - level1 非 NULL 且 level2_s 全 NULL → CATEGORY
 *      - level1 全 NULL 且 level2_s 非 NULL → RANGE
 *      - 其他（含無 score 紀錄）→ 預設 RANGE（保守值，由 AC-1b ALL_SCORES_EMPTY 警告覆蓋）
 *      注意：data-model.md spec 的 CASE 末端 ELSE 'COMPOSITE'，但本任務說明指定
 *      「否則 → 預設 RANGE（最保守）」；採任務說明值，保證 backfill 後皆通過 CHECK。
 *   3) ALTER COLUMN match_type SET NOT NULL
 *   4) ADD CONSTRAINT chk_ob_levelcard_column_match_type
 *      CHECK (match_type IN ('CATEGORY', 'RANGE', 'COMPOSITE'))
 *
 * down()：DROP CONSTRAINT + DROP COLUMN
 *
 * SQLite 環境（E2E）：
 *   - 不支援 ALTER COLUMN SET NOT NULL / CHECK constraint 改動，故略過 step 3/4
 *   - ADD COLUMN + backfill 仍執行，使資料可用
 *   - Entity 端以 nullable: false 重建 schema（synchronize 模式）
 */
export class AddMatchTypeToObLevelcardColumn1711360000250
  implements MigrationInterface
{
  name = 'AddMatchTypeToObLevelcardColumn1711360000250';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isSqlite = process.env.DB_TYPE === 'sqlite';

    // Step 1：ADD COLUMN（允許 NULL 以利 backfill）
    await queryRunner.query(
      `ALTER TABLE "ob_levelcard_column" ADD COLUMN "match_type" VARCHAR(20) NULL`,
    );

    // Step 2：Backfill — 依 ob_levelcard_score 推導
    // CATEGORY：存在 level1 非 NULL 且 level2_s 全 NULL 的 score
    // RANGE：存在 level1 全 NULL 且 level2_s 非 NULL 的 score
    // 其他（含 COMPOSITE 與無 score 紀錄）→ 預設 RANGE
    await queryRunner.query(`
      UPDATE "ob_levelcard_column" AS c
      SET "match_type" = CASE
        WHEN EXISTS (
          SELECT 1 FROM "ob_levelcard_score" s
          WHERE s."card_type" = c."card_type"
            AND s."card_version" = c."card_version"
            AND s."column_name" = c."column_name"
            AND s."level1" IS NOT NULL
            AND s."level2_s" IS NULL
            AND s."level2_e" IS NULL
        ) THEN 'CATEGORY'
        WHEN EXISTS (
          SELECT 1 FROM "ob_levelcard_score" s
          WHERE s."card_type" = c."card_type"
            AND s."card_version" = c."card_version"
            AND s."column_name" = c."column_name"
            AND s."level1" IS NULL
            AND s."level2_s" IS NOT NULL
        ) THEN 'RANGE'
        ELSE 'RANGE'
      END
    `);

    // Step 3：SET NOT NULL（SQLite 不支援，略過）
    if (!isSqlite) {
      await queryRunner.query(
        `ALTER TABLE "ob_levelcard_column" ALTER COLUMN "match_type" SET NOT NULL`,
      );

      // Step 4：CHECK constraint（SQLite 也略過，由 entity 端與業務層保證）
      await queryRunner.query(
        `ALTER TABLE "ob_levelcard_column" ADD CONSTRAINT "chk_ob_levelcard_column_match_type" CHECK ("match_type" IN ('CATEGORY', 'RANGE', 'COMPOSITE'))`,
      );
    }

    // Step 5：assertion（防呆，預期 0 列）
    // 僅 PostgreSQL 執行；SQLite 走 synchronize 不需要
    if (!isSqlite) {
      const result = (await queryRunner.query(
        `SELECT COUNT(*)::int AS cnt FROM "ob_levelcard_column" WHERE "match_type" IS NULL`,
      )) as Array<{ cnt: number }>;
      const nullCount = result?.[0]?.cnt ?? 0;
      if (nullCount > 0) {
        throw new Error(
          `[Migration 1711360000250] backfill 後仍有 ${nullCount} 列 match_type IS NULL，請檢查 ob_levelcard_score 資料完整性`,
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const isSqlite = process.env.DB_TYPE === 'sqlite';

    if (!isSqlite) {
      await queryRunner.query(
        `ALTER TABLE "ob_levelcard_column" DROP CONSTRAINT IF EXISTS "chk_ob_levelcard_column_match_type"`,
      );
    }
    await queryRunner.query(
      `ALTER TABLE "ob_levelcard_column" DROP COLUMN IF EXISTS "match_type"`,
    );
  }
}
