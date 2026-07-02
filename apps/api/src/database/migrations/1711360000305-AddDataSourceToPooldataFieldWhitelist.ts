import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * m305 / F109 / US-172 / AD-E07-37 §4.1 + §4.2：
 *   AddDataSourceToPooldataFieldWhitelist —— pooldata_field_whitelist 新增 data_source 欄位（schema-only）
 *
 * 目的：
 *   - 為白名單引入第二個資料來源概念（'ob_pool_data' 案件資料 / 'customer_core' 客戶資料）。
 *   - 既有 7 筆（prod_kind / spec_tp / caseyear / settle_src / case_status / list_type / best_case）
 *     於 ADD COLUMN 時由 DEFAULT 自動 backfill 為 'ob_pool_data'（無需額外 UPDATE，AD §4.1）。
 *
 * schema（AD §4.1 定案）：
 *   - PG   ：VARCHAR(20) NOT NULL DEFAULT 'ob_pool_data'
 *            + CHECK (data_source IN ('ob_pool_data','customer_core'))
 *   - SQLite：VARCHAR(20) NOT NULL DEFAULT 'ob_pool_data'（無 CHECK，沿用 field_type 之
 *            「PG CHECK / SQLite 應用層保證」慣例；entity TS 型別 + service 只寫合法值）
 *
 * 冪等：
 *   - PG   ：ADD COLUMN IF NOT EXISTS + CHECK 以 DO $$ 包裹判斷（重跑不報錯）。
 *   - SQLite：無 ADD COLUMN IF NOT EXISTS，以 PRAGMA table_info 檢查欄位存在後才 ADD
 *            （RISK-F109-001；migration runner 之「已執行記錄」為主要防重跑機制）。
 *
 * dev DB 因 migration runner 未啟用（project_dev_db_synchronize_no_migration_runner），
 *   須直接套等價 ALTER。分離 schema（m305）與 seed（m306）以利個別審查 / revert（比照 m286）。
 */
export class AddDataSourceToPooldataFieldWhitelist1711360000305
  implements MigrationInterface
{
  name = 'AddDataSourceToPooldataFieldWhitelist1711360000305';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isSqlite = process.env.DB_TYPE === 'sqlite';

    if (isSqlite) {
      // SQLite：無 ADD COLUMN IF NOT EXISTS → 先查欄位是否已存在（冪等）
      const columns: Array<{ name: string }> = await queryRunner.query(
        `PRAGMA table_info('pooldata_field_whitelist')`,
      );
      const exists = columns.some((c) => c.name === 'data_source');
      if (!exists) {
        await queryRunner.query(
          `ALTER TABLE pooldata_field_whitelist
             ADD COLUMN data_source VARCHAR(20) NOT NULL DEFAULT 'ob_pool_data'`,
        );
      }
      return;
    }

    // PG：ADD COLUMN IF NOT EXISTS（既有列自動套 DEFAULT，backfill 達成）+ CHECK constraint
    await queryRunner.query(
      `ALTER TABLE pooldata_field_whitelist
         ADD COLUMN IF NOT EXISTS data_source VARCHAR(20) NOT NULL DEFAULT 'ob_pool_data'`,
    );
    await queryRunner.query(
      `DO $$
       BEGIN
         IF NOT EXISTS (
           SELECT 1 FROM pg_constraint WHERE conname = 'chk_pooldata_whitelist_data_source'
         ) THEN
           ALTER TABLE pooldata_field_whitelist
             ADD CONSTRAINT chk_pooldata_whitelist_data_source
             CHECK (data_source IN ('ob_pool_data','customer_core'));
         END IF;
       END $$;`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const isSqlite = process.env.DB_TYPE === 'sqlite';

    if (isSqlite) {
      // SQLite ALTER TABLE DROP COLUMN 支援視版本而定；測試庫重建為主，故 no-op（不阻斷 revert）
      return;
    }

    await queryRunner.query(
      `ALTER TABLE pooldata_field_whitelist
         DROP CONSTRAINT IF EXISTS chk_pooldata_whitelist_data_source`,
    );
    await queryRunner.query(
      `ALTER TABLE pooldata_field_whitelist DROP COLUMN IF EXISTS data_source`,
    );
  }
}
