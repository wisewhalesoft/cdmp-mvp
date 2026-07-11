import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { MssqlQueueService } from './mssql-queue.service';
import {
  RUN_QUEUE_NAME,
  RUN_QUEUE_RETRY_LIMIT,
  RunJobPayload,
} from './run-queue.constants';

/**
 * F098 / AD-E07-28 P1：月跑入列 producer（cdmp-api 側）。
 *
 * `AssignmentRunService.triggerRun` 在 INSERT pending run + 寫 audit 後呼叫 `send`，
 * 將 `{ runId, ym }` 入列至自建 T-SQL `queue_job` 佇列，立即回 202（不在 API 程序跑 pipeline）。
 *
 * contract（feedback_mock_real_system_contract）：
 *  - `send` 回傳 jobId（DB `NEWID()`）；本層回傳供 producer 端 log / pending 取消快路徑。
 *  - retryLimit=0（OQ-AD28-04）：失敗一律標 failed、不自動重派。
 *  - jobId **不**回傳給前端（TS-F098-TRIG-006）：triggerRun 之 TriggerRunResult 僅含 runId + status。
 *
 * PG 全面遷移後僅走 MssqlQueueService（pg-boss 已移除）；sqlite 單元測試以 mock MssqlQueueService 注入。
 */
@Injectable()
export class RunQueueProducer {
  private readonly logger = new Logger(RunQueueProducer.name);

  constructor(
    // @Optional：sqlite 測試路徑不需要真實佇列；測試以 mock 注入。缺此 provider 時 send/cancel 明確拋錯/no-op。
    @Optional()
    @Inject(MssqlQueueService)
    private readonly mssqlQueue: MssqlQueueService | null = null,
  ) {}

  /**
   * 將月跑 job 入列。回傳 jobId（DB `NEWID()`）。
   *
   * @throws 入列失敗（DB 不可用等）會向上拋；triggerRun 須據此回錯誤、不留孤兒 pending
   *         （TS-F098-OQ-001 / OQ-F098-01）。
   */
  async send(payload: RunJobPayload): Promise<string | null> {
    if (!this.mssqlQueue) {
      // 正常情境由 module 提供；此分支僅防呆（未注入佇列服務 → 入列不可用）。
      throw new Error(
        'RunQueueProducer: MssqlQueueService 未提供（佇列不可用）',
      );
    }
    const jobId = await this.mssqlQueue.send(
      RUN_QUEUE_NAME,
      payload,
      RUN_QUEUE_RETRY_LIMIT,
    );
    this.logger.log(
      `enqueued run job: queue=${RUN_QUEUE_NAME} runId=${payload.runId} ym=${payload.ym} jobId=${jobId}`,
    );
    return jobId;
  }

  /**
   * 取消尚未被消費之 pending job（快路徑，AC-5）。worker 永不執行該 run。
   * MssqlQueueService.cancel 本身已吞錯（影響列數 0 = 已被消費 / 不存在，P2a CANCEL-003/004）。
   */
  async cancel(jobId: string): Promise<void> {
    if (!this.mssqlQueue) return;
    await this.mssqlQueue.cancel(jobId);
    this.logger.log(`cancelled pending job: jobId=${jobId}`);
  }
}
