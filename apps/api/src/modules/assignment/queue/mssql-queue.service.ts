import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RUN_QUEUE_RETRY_LIMIT, type RunJobPayload } from './run-queue.constants';

/**
 * AD-E07-40 P2a — 自建 T-SQL 佇列操作封裝（取代 pg-boss，MSSQL 全面遷移 P2）。
 *
 * 完全獨立驗證層（P2a DoD #4）：本 service 只依賴 TypeORM `DataSource`，
 * **不** import / 依賴 Producer / Consumer（P2b 才接線）。
 *
 * 五個原子操作（AD §2）：send / cancel / claimNext / complete / expireSweep。
 *
 * 🔴 claimNext 為「單一陳述式」CTE + `WITH (READPAST, ROWLOCK, UPDLOCK)` + `OUTPUT`
 *    （I-MSSQL-QUEUE-CLAIM-01）：不得以「先 SELECT 再另一句 UPDATE」的兩段式模擬（TOCTOU 競態）。
 *    單一陳述式即其自身交易，配合列鎖 hint 於高併發下由 SQL Server 保證「恰一個 session 領到一筆」。
 *    因此一律走 `dataSource.query()`（自連線池取用獨立連線），而非共用單一 queryRunner——
 *    連線池的多個並發連線才能產生真實 SQL Server 並發 session（見 P2a CONC harness）。
 *
 * Schema 感知：raw SQL 不受 TypeORM schema 選項自動前綴，故依 DataSource 之 schema 選項動態前綴表名
 *   （P2a 測試設 'p2a_sync'；prod app.module / worker-app.module mssql 分支未設 schema → dbo）。
 *   （非 driver-conditional：僅解析 schema 名稱字面，不依 DB_TYPE 分支。）
 */
@Injectable()
export class MssqlQueueService {
  /** `[schema].[queue_job]`（有 schema）或 `queue_job`（無 schema，落使用者預設 dbo）。 */
  private readonly table: string;

  constructor(private readonly dataSource: DataSource) {
    const schema = (this.dataSource.options as { schema?: string }).schema;
    this.table = schema ? `[${schema}].[queue_job]` : 'queue_job';
  }

  /**
   * 入列（AD §2.5）：新增一筆 state='created'，回傳 DB 端 NEWID() 產生之 job id。
   * payload 以 JSON.stringify 序列化後綁定為參數（不字串內插 → SQL injection 防線）。
   */
  async send(
    queueName: string,
    payload: RunJobPayload,
    retryLimit: number = RUN_QUEUE_RETRY_LIMIT,
  ): Promise<string> {
    const rows: Array<{ id: string }> = await this.dataSource.query(
      `INSERT INTO ${this.table} (id, queue_name, payload, state, retry_limit, created_at) ` +
        `OUTPUT inserted.id ` +
        `VALUES (NEWID(), @0, @1, 'created', @2, SYSUTCDATETIME())`,
      [queueName, JSON.stringify(payload), retryLimit],
    );
    return rows[0].id;
  }

  /**
   * 取消（AD §2.4，pending 快路徑）：僅對仍為 'created' 的 job 生效。
   * 已被 claim（active）或不存在 → 影響列數 0、不拋例外（吞錯語意，對齊現行 producer.cancel）。
   */
  async cancel(jobId: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE ${this.table} SET state = 'cancelled' WHERE id = @0 AND state = 'created'`,
      [jobId],
    );
  }

  /**
   * 🔴 原子領取（AD §2.1，I-MSSQL-QUEUE-CLAIM-01）：單一陳述式 CTE + READPAST/ROWLOCK/UPDLOCK + OUTPUT。
   * 選 FIFO（created_at ASC）最舊一筆 created job，原子轉為 active 並回填 started_at/expire_at。
   * 無可領取 job → 回傳 null。
   */
  async claimNext(
    queueName: string,
    expireSeconds: number,
  ): Promise<{ jobId: string; payload: string; retryLimit: number } | null> {
    const rows: Array<{ id: string; payload: string; retry_limit: number }> =
      await this.dataSource.query(
        // ⚠️ CTE 之 SELECT 投影必須含所有將被 SET 的欄位（state/started_at/expire_at），
        //    否則 SQL Server 於 UPDATE candidate SET 這些欄位時報 "Invalid column name"
        //    （AD §2.1 pseudocode 僅投影 id/payload/retry_limit，實測於真實 MSSQL 會失敗——
        //     P0 smoke 只 SET state 且 state 已在投影中故未暴露此問題；此為必要之忠實修正）。
        `;WITH candidate AS (` +
          `SELECT TOP (1) id, payload, retry_limit, state, started_at, expire_at ` +
          `FROM ${this.table} WITH (READPAST, ROWLOCK, UPDLOCK) ` +
          `WHERE queue_name = @0 AND state = 'created' ` +
          `ORDER BY created_at ASC` +
          `) ` +
          `UPDATE candidate ` +
          `SET state = 'active', ` +
          `started_at = SYSUTCDATETIME(), ` +
          `expire_at = DATEADD(SECOND, @1, SYSUTCDATETIME()) ` +
          `OUTPUT inserted.id, inserted.payload, inserted.retry_limit`,
        [queueName, expireSeconds],
      );
    if (!rows || rows.length === 0) return null;
    return {
      jobId: rows[0].id,
      payload: rows[0].payload,
      retryLimit: rows[0].retry_limit,
    };
  }

  /**
   * 完成（AD §2.2）：純狀態轉移 → 'completed'（retry=0，無論業務成功/失敗一律 completed）。
   * 對已 completed 或不存在 jobId → 影響列數 0、不拋例外（冪等防呆）。
   */
  async complete(jobId: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE ${this.table} SET state = 'completed', completed_at = SYSUTCDATETIME() WHERE id = @0`,
      [jobId],
    );
  }

  /**
   * 逾時回收 sweep（AD §2.3）：集合式 UPDATE（非逐筆迴圈），將所有已逾時的 active job 標為 expired。
   * 佇列層衛生性清理，與業務層 OrphanReaper 各自獨立。
   */
  async expireSweep(): Promise<void> {
    await this.dataSource.query(
      `UPDATE ${this.table} WITH (ROWLOCK) ` +
        `SET state = 'expired' ` +
        `WHERE state = 'active' AND expire_at <= SYSUTCDATETIME()`,
    );
  }
}
