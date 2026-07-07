import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * AD-E07-40 P2a — MSSQL 自建 T-SQL 佇列表 queue_job 之手寫 baseline migration。
 *
 * 角色：queue_job 之 prod 部署 schema 事實來源（prod NODE_ENV=production 關 synchronize，靠本 migration 建表）。
 *       與 P1b baseline（1751884800000 schema / 1751884800001 reference-data）並存於 migrations/mssql/*，
 *       檔名 timestamp 1751884800002 > 兩者 → migration:run 於既有 36 表 baseline 之後才建 queue_job。
 *
 * Filtered index 兩軌策略（AD §1，沿用 AD-E07-39 §6 schema 兩軌精神）：
 *   - queue-job.entity.ts 之 @Index 為「一般索引」（synchronize 可攜，dev 用）；
 *   - 真正 `WHERE state='created'` / `WHERE state='active'` 的 filtered index 只存在於本 migration，
 *     對應五操作之 claim（掃 state='created' 熱路徑）與 expire sweep（掃 state='active' 熱路徑）。
 *   - 命名與 entity 之 @Index 同名（idx_queue_job_pending / idx_queue_job_active_expiry）但欄位組成/filter 刻意不同：
 *     Path A 為 dev-only synchronize 產物、prod 部署僅套用本 migration（Path B），兩者不會同時存在於同一實際資料庫。
 *     故不可對兩路徑索引套用 schema-parity 之 diffIndexSets「parity 應為空」判定（見 AD-E07-40-P2a-test SCHEMA-010），
 *     queue_job 索引改由 P2a SCHEMA-011/012 各自獨立斷言。
 *
 * Schema 感知：raw DDL 不受 TypeORM schema 選項自動前綴，故本 migration 讀取 DataSource 之 schema 選項
 *   （P2a Path B 測試設 'p2a_baseline'；prod data-source.ts mssql 分支未設 schema → 預設 'dbo'）動態前綴表名，
 *   使同一 migration 檔於「隔離結構驗證（p2a_baseline）」與「prod 部署（dbo）」兩情境皆落在正確 schema。
 *   （非 driver-conditional：僅解析 schema 名稱字面，不依資料庫方言旗標分支判斷。）
 *
 * 欄位/預設值與 synchronize 路徑逐欄結構化 parity 為空（I-MSSQL-BASELINE-PARITY-01 延伸至 queue_job，
 *   見 P2a SCHEMA-008）：id NEWSEQUENTIALID() / state 'created' / retry_limit 0 / created_at getdate()。
 */
export class MssqlQueueJobSchema1751884800002 implements MigrationInterface {
  name = 'MssqlQueueJobSchema1751884800002';

  private tableRef(queryRunner: QueryRunner): string {
    const schema = (queryRunner.connection.options as { schema?: string }).schema ?? 'dbo';
    return `[${schema}].[queue_job]`;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    const t = this.tableRef(queryRunner);

    await queryRunner.query(
      `CREATE TABLE ${t} (` +
        `"id" uniqueidentifier NOT NULL CONSTRAINT "DF_queue_job_id" DEFAULT NEWSEQUENTIALID(), ` +
        `"queue_name" varchar(100) NOT NULL, ` +
        `"payload" nvarchar(MAX) NOT NULL, ` +
        `"state" varchar(20) NOT NULL CONSTRAINT "DF_queue_job_state" DEFAULT 'created', ` +
        `"retry_limit" int NOT NULL CONSTRAINT "DF_queue_job_retry_limit" DEFAULT 0, ` +
        `"created_at" datetime2 NOT NULL CONSTRAINT "DF_queue_job_created_at" DEFAULT getdate(), ` +
        `"started_at" datetime2, ` +
        `"expire_at" datetime2, ` +
        `"completed_at" datetime2, ` +
        `CONSTRAINT "PK_queue_job" PRIMARY KEY ("id"))`,
    );

    // Filtered index（僅本 baseline migration；entity @Index 為一般索引，見檔頭兩軌說明）。
    await queryRunner.query(
      `CREATE INDEX "idx_queue_job_pending" ON ${t} ("queue_name", "created_at") WHERE "state" = 'created'`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_queue_job_active_expiry" ON ${t} ("expire_at") WHERE "state" = 'active'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE ${this.tableRef(queryRunner)}`);
  }
}
