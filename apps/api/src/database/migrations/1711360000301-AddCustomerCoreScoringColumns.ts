import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * m301 / F104 ── customer_core 新增 7 個計分用欄位（對齊 AD-E07-10-L legacy 語意 + US-161 cc contract）
 *
 * 新增：
 *   - cus_sex      VARCHAR(2)   — 個人(1/2)/法人(3) 別；計分 CUS_SEX(range, 引擎內 cast) + CUS_SEX 分流判斷
 *                                （來源 raw 為文字 '1'/'2'/'3'，不可用 smallint：pipeline field_mapping 不做
 *                                 cast → text→smallint UPSERT 失敗。故存 varchar，range 計分時引擎再 cast）
 *   - carea_no1    VARCHAR(10)  — 戶籍電話區碼（CAREA_NO1 有無 0/1）
 *   - carea_no2    VARCHAR(10)  — 聯絡電話區碼（CAREA_NO2 有無 0/1）
 *   - cellular     VARCHAR(20)  — 行動電話（CELLULAR 有無 0/1）
 *   - hpost_city   VARCHAR(20)  — 戶籍縣市（HPOST_NUM 經 raw_b4a48f10 POSTAL_NO→POSTAL_ADD lookup）
 *   - cpost_city   VARCHAR(20)  — 通訊縣市（CPOST_NUM 同上）
 *   - co_city      VARCHAR(20)  — 公司縣市（CO_NUM 同上）
 *
 * 來源：「ETL for Customer Core」pipeline 新增 3 個 city lookup（lk_hcity/lk_ccity/lk_cocity，
 *       lookupSource=raw_b4a48f10、POSTAL_NO 比對 → POSTAL_ADD）+ fm1 新增 7 個映射。
 *
 * 註：POSTAL_ADD 為「縣市+區」（如「臺北市中正區」），故 city 欄採 VARCHAR(20) 防截斷
 *     （偏離 US-161 contract 之 varchar(10)；legacy LEVEL1 是否僅到縣市由 spec-writer 對 score config 確認）。
 *
 * customer_core 無 entity（AD-E06-1）→ schema 由 migration 維護；dev 因 migration runner 未啟用，
 * 須直接套等價 ALTER（見 project_dev_db_synchronize_no_migration_runner）。
 *
 * 可逆：down() DROP 7 欄。SQLite no-op（customer_core 非 SQLite 測試表）。
 */
export class AddCustomerCoreScoringColumns1711360000301
  implements MigrationInterface
{
  name = 'AddCustomerCoreScoringColumns1711360000301';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (process.env.DB_TYPE === 'sqlite') return;
    await queryRunner.query(
      `ALTER TABLE customer_core
        ADD COLUMN IF NOT EXISTS cus_sex VARCHAR(2) NULL,
        ADD COLUMN IF NOT EXISTS carea_no1 VARCHAR(10) NULL,
        ADD COLUMN IF NOT EXISTS carea_no2 VARCHAR(10) NULL,
        ADD COLUMN IF NOT EXISTS cellular VARCHAR(20) NULL,
        ADD COLUMN IF NOT EXISTS hpost_city VARCHAR(20) NULL,
        ADD COLUMN IF NOT EXISTS cpost_city VARCHAR(20) NULL,
        ADD COLUMN IF NOT EXISTS co_city VARCHAR(20) NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (process.env.DB_TYPE === 'sqlite') return;
    await queryRunner.query(
      `ALTER TABLE customer_core
        DROP COLUMN IF EXISTS cus_sex,
        DROP COLUMN IF EXISTS carea_no1,
        DROP COLUMN IF EXISTS carea_no2,
        DROP COLUMN IF EXISTS cellular,
        DROP COLUMN IF EXISTS hpost_city,
        DROP COLUMN IF EXISTS cpost_city,
        DROP COLUMN IF EXISTS co_city`,
    );
  }
}
