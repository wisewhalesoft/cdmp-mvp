import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * m14: E07 合併重構（AD-E07 v3.0 / 2026-05-16）
 *
 * 廢除 v1.x `is_sales_manager BOOLEAN + e07_role VARCHAR` 正交雙欄位設計，
 * 改採單一欄位 `business_role VARCHAR(20) NULL`（允許 NULL / 'director' / 'section_chief'）。
 *
 * Per PO 決議：**不向下相容、不保留歷史值**。本 migration 不執行 UPDATE / backfill；
 * 所有既有帳號 `business_role` 預設 NULL，需 Admin 透過 F006a 重新逐筆指派。
 *
 * 對應 spec：
 *   - data-model.md §User 實體補充 §m14 Migration 規範（v2.0）
 *   - architecture-spec.md §E07 後端 Guard 元件清單（v2.11）
 *   - F002 v2.0 §4.6 / F006a / F073 v2.0 / F074 v2.0
 */
export class AddBusinessRoleDropLegacyFlags1711360000170 implements MigrationInterface {
  name = 'AddBusinessRoleDropLegacyFlags1711360000170';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isSqlite = process.env.DB_TYPE === 'sqlite';

    // Step 1: ADD COLUMN business_role VARCHAR(20) NULL
    await queryRunner.query(
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS business_role VARCHAR(20) NULL`,
    );

    // Step 2: ADD CHECK constraint（PostgreSQL only；SQLite 不支援 ALTER TABLE ADD CONSTRAINT）
    if (!isSqlite) {
      await queryRunner.query(
        `ALTER TABLE users ADD CONSTRAINT chk_users_business_role ` +
          `CHECK (business_role IS NULL OR business_role IN ('director', 'section_chief'))`,
      );
    }

    // Step 3: CREATE INDEX（PostgreSQL partial；SQLite 退化為 plain index）
    if (isSqlite) {
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS idx_users_business_role ON users (business_role) WHERE business_role IS NOT NULL`,
      );
    } else {
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS idx_users_business_role ON users (business_role) WHERE business_role IS NOT NULL`,
      );
    }

    // Step 4: DROP COLUMN is_sales_manager（v1.x 欄位）
    await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS is_sales_manager`);

    // Step 5: DROP COLUMN e07_role（v1.x 短期過渡欄位，若曾建立）
    await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS e07_role`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 反序：重建 v1.x 欄位 + DROP v2.0 (index / constraint / column)
    await queryRunner.query(
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_sales_manager BOOLEAN NOT NULL DEFAULT FALSE`,
    );
    // 不重建 e07_role（屬短期過渡欄位，原本可能不存在）
    await queryRunner.query(`DROP INDEX IF EXISTS idx_users_business_role`);
    await queryRunner.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_business_role`);
    await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS business_role`);
  }
}
