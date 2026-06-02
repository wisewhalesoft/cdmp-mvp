import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type PgBoss from 'pg-boss';
import { PG_BOSS, RUN_QUEUE_TUNING, RunQueueTuning, DEFAULT_RUN_QUEUE_TUNING } from './pg-boss.provider';
import {
  RUN_QUEUE_NAME,
  RUN_QUEUE_RETRY_LIMIT,
  RunJobPayload,
} from './run-queue.constants';

/**
 * F098 / AD-E07-28 P1：月跑入列 producer（cdmp-api 側）。
 *
 * `AssignmentRunService.triggerRun` 在 INSERT pending run + 寫 audit 後呼叫 `send`，
 * 將 `{ runId, ym }` 入列至 pg-boss `assignment-run` queue，立即回 202（不在 API 程序跑 pipeline）。
 *
 * contract（feedback_mock_real_system_contract）：
 *  - `send` 回傳 pg-boss jobId（string）或 null；本層回傳該 jobId 供 producer 端 log / pending 取消快路徑。
 *  - retryLimit=0（OQ-AD28-04）：queue policy 已設，per-send 再帶一次以雙重保險。
 *  - jobId **不**回傳給前端（TS-F098-TRIG-006）：triggerRun 之 TriggerRunResult 僅含 runId + status。
 */
@Injectable()
export class RunQueueProducer {
  private readonly logger = new Logger(RunQueueProducer.name);

  constructor(
    @Optional() @Inject(PG_BOSS) private readonly boss: PgBoss | null,
    @Optional()
    @Inject(RUN_QUEUE_TUNING)
    private readonly tuning: RunQueueTuning = DEFAULT_RUN_QUEUE_TUNING,
  ) {}

  /**
   * 將月跑 job 入列。回傳 pg-boss jobId（null 表示 pg-boss 去重 / 未建立）。
   *
   * @throws 入列失敗（DB 不可用等）會向上拋；triggerRun 須據此回錯誤、不留孤兒 pending
   *         （TS-F098-OQ-001 / OQ-F098-01）。
   */
  async send(payload: RunJobPayload): Promise<string | null> {
    if (!this.boss) {
      // 非 PG 環境（測試 SQLite）未注入真實 boss：視為入列不可用。
      // 正常情境應由 module override 注入 fake boss；此分支僅防呆。
      throw new Error(
        'RunQueueProducer: pg-boss 實例未提供（非 PG 環境須以 fake boss override）',
      );
    }
    const jobId = await this.boss.send(RUN_QUEUE_NAME, payload, {
      retryLimit: RUN_QUEUE_RETRY_LIMIT,
      expireInSeconds: this.tuning.jobExpireInSeconds,
    });
    this.logger.log(
      `enqueued run job: queue=${RUN_QUEUE_NAME} runId=${payload.runId} ym=${payload.ym} jobId=${jobId}`,
    );
    return jobId;
  }

  /**
   * 取消尚未被消費之 pending job（快路徑，AC-5）。worker 永不執行該 run。
   * pg-boss v10 `cancel(name, id)`：queue name 為第一參數。
   */
  async cancel(jobId: string): Promise<void> {
    if (!this.boss) return;
    try {
      await this.boss.cancel(RUN_QUEUE_NAME, jobId);
      this.logger.log(`cancelled pending job: jobId=${jobId}`);
    } catch (err: any) {
      // job 可能已被消費 / 不存在 → 取消失敗不阻擋 cancelRun（API 側已標 failed）
      this.logger.warn(
        `cancel pending job failed (可能已被消費): jobId=${jobId}: ${err?.message ?? err}`,
      );
    }
  }
}
