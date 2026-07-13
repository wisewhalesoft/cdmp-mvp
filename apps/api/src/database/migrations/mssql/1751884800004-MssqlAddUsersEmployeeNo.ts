import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * AD-E02-5 — F113/US-179：users 新增選填 employee_no（員工編號，登入識別碼二選一）。
 *
 * 角色：employee_no「有值時唯一」雙軌唯一性設計之軌道 B（DB 防線）——手寫 filtered
 *   unique index，比照 AD-E07-40 queue_job 兩軌策略（entity 維持 plain @Column，
 *   不宣告 unique；真正的 filtered unique index 只存在於本 migration）。
 *
 * 與 queue_job 的關鍵差異：queue_job 是全新表，兩軌索引形狀本就注定不同（不同欄位
 *   組成），對 mssql-p1b2 parity 測試套件而言用整表排除即可處理。employee_no 是對
 *   「既有 36 表 baseline 之一」（users）的追加欄位＋索引：Path A（synchronize）與
 *   Path B（本 migration）之「欄位定義」完全一致（皆為 plain nullable varchar(32)），
 *   僅「是否具備 filtered unique index」不同——此為刻意的、僅限索引層級的兩軌分歧，
 *   不應／不需要整表排除（會誤傷 users 既有 PK / email unique index 的 parity 覆蓋）。
 *   對既有 mssql-p1b2.mssql.spec.ts 之精確衝擊分析見 AD-E02-5 §3.2.4 / §10。
 *
 * Backfill：新增當下所有既有 users 列 employee_no 恆為 NULL（全新欄位，不存在任何
 *   舊列可能已有值的情境），filtered unique index 建立時比對母體（WHERE employee_no
 *   IS NOT NULL）為空集合，無重複風險，無需前置去重掃描（OQ-F113-01 裁定）。
 *
 * 定序（Collation）：不宣告任何欄位層級定序覆寫子句（比照 baseline 慣例，由 P1b2
 *   靜態守門把關），新欄位繼承資料庫層級 Chinese_Taiwan_Stroke_BIN（二進位定序、大小寫
 *   敏感）——與登入分支之 JS 精確比對（不轉小寫）、filtered unique index 之大小寫
 *   敏感唯一性語意完全一致（OQ-F113-01 裁定；見 AD-E02-5 §3.2.3 之定序不變式）。
 *
 * 索引命名：`uq_users_employee_no`（小寫 `uq_` 前綴 + snake_case），比照本專案唯一
 *   既有 UNIQUE INDEX 範例 `uq_assignment_run_stage_log_run_stage`
 *   （1751884800000-MssqlBaselineSchema.ts），非 queue_job 的 `idx_`（一般索引）前綴。
 */
export class MssqlAddUsersEmployeeNo1751884800004 implements MigrationInterface {
  name = 'MssqlAddUsersEmployeeNo1751884800004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "employee_no" varchar(32) NULL`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_users_employee_no" ON "users" ("employee_no") WHERE "employee_no" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // MSSQL 不允許在欄位仍持有索引時直接 DROP COLUMN，須先 DROP INDEX。
    await queryRunner.query(`DROP INDEX "uq_users_employee_no" ON "users"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "employee_no"`);
  }
}
