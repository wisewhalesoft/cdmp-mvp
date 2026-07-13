import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * F114 — customer_financial（客戶交易/催收彙總目標表）。
 *
 * 比照 customer_core（AD-E07-41 P4-0）：為 PG-only / migration-managed 目標表、**無 TypeORM
 *   entity**（synchronize 路徑不建），故由本 migration 手動建表，使 target_load / stage1 客戶
 *   財務篩選不因「表不存在」硬錯誤（target-load-handler 會先檢查目標表存在）。
 *
 * 來源：APYHFC16.ZZIPPROD 之 view V_OB_CUST_CASE_SUMMARY（一客戶一列），每月全量 target_load
 *   （fullMode=TRUNCATE+INSERT），故 source_customer_no 直接作 PK（客戶粒度唯一）。
 *
 * 型別對齊 customer_core baseline 慣例：uuid→uniqueidentifier、裸 timestamp→datetime2、
 *   PG 當下時戳預設值→getdate()、character varying(N)→varchar(N)。無 FK。
 *
 * Parity：本表刻意只存在於 migration 路徑，mssql-p1b2/p1b3 之 EXCLUDED_TABLES 白名單追加
 *   'customer_financial' 排除（比照 customer_core 之精神）。
 */
export class MssqlAddCustomerFinancial1751884800005 implements MigrationInterface {
  name = 'MssqlAddCustomerFinancial1751884800005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "customer_financial" (` +
        `"source_customer_no" varchar(20) NOT NULL, ` +
        `"has_guarantor" varchar(1), ` +
        `"guarantor_count" int, ` +
        `"phone_coll_case_cnt" int, ` +
        `"phone_coll_times" int, ` +
        `"legal_coll_case_cnt" int, ` +
        `"legal_coll_times" int, ` +
        `"midterm_case_cnt" int, ` +
        `"matured_case_cnt" int, ` +
        `"settled_case_cnt" int, ` +
        `"void_case_cnt" int, ` +
        `"data_source" varchar(50) NOT NULL, ` +
        `"_etl_loaded_at" datetime2 NOT NULL CONSTRAINT "DF_customer_financial_etl_loaded_at" DEFAULT getdate(), ` +
        `"_etl_pipeline_id" uniqueidentifier NOT NULL, ` +
        `CONSTRAINT "PK_customer_financial" PRIMARY KEY ("source_customer_no")` +
        `)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "customer_financial"`);
  }
}
