import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * m295 / M-B1 / US-144（AD-E07-18 §18.12.9 / F075 v1.7 AC-18）：
 *   AddIsSystemFixedToPooldataFieldWhitelist
 *
 * 目的：
 *   ① 新增 `is_system_fixed` column（BOOLEAN NOT NULL DEFAULT false）至 pooldata_field_whitelist
 *   ② backfill 既有列為 false（防 migration 中間態，通常 0 affected）
 *   ③ UPSERT-safe 將 best_case 的 is_system_fixed 設為 true（m286 已確保 best_case 存在 → 直接 UPDATE）
 *
 * PG / SQLite 雙模式（對齊 m286 isSqlite dual-SQL pattern）：
 *   - PG：`ADD COLUMN IF NOT EXISTS ... BOOLEAN NOT NULL DEFAULT false`
 *   - SQLite：不支援 `IF NOT EXISTS` 於 ADD COLUMN → 先 `PRAGMA table_info` 偵測欄位是否存在，
 *     不存在才 `ADD COLUMN ... INTEGER NOT NULL DEFAULT 0`（idempotent guard，參照 m281 pattern）
 *
 * Idempotency：
 *   - PG `ADD COLUMN IF NOT EXISTS`；SQLite PRAGMA guard；`UPDATE WHERE` 冪等
 *
 * 依賴：pooldata_field_whitelist 表須存在（m200）；best_case 條目須存在（m286）；必須在 m296 之前執行。
 *
 * 對應 test spec：
 *   - F050-test.md §十六 O 群組：TS-F050-O01 ~ O06
 *   - F075-test.md §十：TS-F075-v17-001（cross-ref）
 */
export class AddIsSystemFixedToPooldataFieldWhitelist1711360000295
  implements MigrationInterface
{
  name = 'AddIsSystemFixedToPooldataFieldWhitelist1711360000295';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isSqlite = process.env.DB_TYPE === 'sqlite';

    // Step 1：ADD COLUMN（PG IF NOT EXISTS / SQLite PRAGMA guard）
    if (isSqlite) {
      const columns = (await queryRunner.query(
        `PRAGMA table_info(pooldata_field_whitelist)`,
      )) as Array<{ name: string }>;
      const hasColumn = Array.isArray(columns)
        ? columns.some((c) => c.name === 'is_system_fixed')
        : false;
      if (!hasColumn) {
        await queryRunner.query(
          `ALTER TABLE pooldata_field_whitelist ADD COLUMN is_system_fixed INTEGER NOT NULL DEFAULT 0`,
        );
      }
    } else {
      await queryRunner.query(
        `ALTER TABLE pooldata_field_whitelist ADD COLUMN IF NOT EXISTS is_system_fixed BOOLEAN NOT NULL DEFAULT false`,
      );
    }

    // Step 2：backfill false（防 migration 中間態 NULL；DEFAULT 已使新列為 false/0，通常 0 affected）
    await queryRunner.query(
      `UPDATE pooldata_field_whitelist SET is_system_fixed = ${
        isSqlite ? '0' : 'false'
      } WHERE is_system_fixed IS NULL`,
    );

    // Step 3：best_case → is_system_fixed = true（冪等：重複執行仍正確）
    await queryRunner.query(
      `UPDATE pooldata_field_whitelist
          SET is_system_fixed = ${isSqlite ? '1' : 'true'},
              updated_at = CURRENT_TIMESTAMP
        WHERE column_name = 'best_case'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const isSqlite = process.env.DB_TYPE === 'sqlite';

    // 先還原資料（best_case → false），再移除欄位
    await queryRunner.query(
      `UPDATE pooldata_field_whitelist SET is_system_fixed = ${
        isSqlite ? '0' : 'false'
      } WHERE column_name = 'best_case'`,
    );

    if (isSqlite) {
      // SQLite 3.35+ 支援 DROP COLUMN；以 PRAGMA guard 確保欄位存在才 drop（冪等）
      const columns = (await queryRunner.query(
        `PRAGMA table_info(pooldata_field_whitelist)`,
      )) as Array<{ name: string }>;
      const hasColumn = Array.isArray(columns)
        ? columns.some((c) => c.name === 'is_system_fixed')
        : false;
      if (hasColumn) {
        await queryRunner.query(
          `ALTER TABLE pooldata_field_whitelist DROP COLUMN is_system_fixed`,
        );
      }
    } else {
      await queryRunner.query(
        `ALTER TABLE pooldata_field_whitelist DROP COLUMN IF EXISTS is_system_fixed`,
      );
    }
  }
}
