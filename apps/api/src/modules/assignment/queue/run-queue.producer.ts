import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type PgBoss from 'pg-boss';
import { PG_BOSS, RUN_QUEUE_TUNING, RunQueueTuning, DEFAULT_RUN_QUEUE_TUNING } from './pg-boss.provider';
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
    // AD-E07-40 P2b：driver 判定（DB_TYPE，比照 createPgBoss 既有寫法）+ mssql 佇列封裝。
    // 兩者 @Optional：pg-boss（postgres）與 sqlite 測試路徑不需要，維持既有行為不變。
    // 🔴 必須明確 @Inject：union 型別（`X | null`）使 emitDecoratorMetadata 只 emit `Object`，
    //    NestJS 型別解析失敗 → @Optional 注入 null；mssql 入列時 mssqlQueue 為 null 會使 send 崩潰。
    @Optional() @Inject(ConfigService) private readonly config: ConfigService | null = null,
    @Optional()
    @Inject(MssqlQueueService)
    private readonly mssqlQueue: MssqlQueueService | null = null,
  ) {}

  /**
   * AD-E07-40 P2b（§5 / §0.3）：目前是否為 mssql 自建佇列路徑。
   *
   * 🔴 三分支之首要判斷（MUST-FIX，DISPATCH-001~003）：mssql 環境下 `this.boss` **必為 null**
   *    （createPgBoss 對非 postgres 一律回傳 null），與 sqlite 測試環境訊號相同。若僅以 `!this.boss`
   *    二元判斷，mssql 分支會被既有防呆吞掉。故 driver 一律以 DB_TYPE 顯式判定，先於 boss null 檢查。
   */
  private get driverIsMssql(): boolean {
    const dbType = this.config?.get<string>('DB_TYPE') ?? process.env.DB_TYPE;
    return dbType === 'mssql';
  }

  /**
   * 將月跑 job 入列。回傳 jobId（pg-boss 路徑：null 表示去重 / 未建立；mssql 路徑：DB NEWID()）。
   *
   * @throws 入列失敗（DB 不可用等）會向上拋；triggerRun 須據此回錯誤、不留孤兒 pending
   *         （TS-F098-OQ-001 / OQ-F098-01）。
   */
  async send(payload: RunJobPayload): Promise<string | null> {
    // 🔴 mssql 分支先判斷（DISPATCH-001）：不可落入下方 `!this.boss` 防呆。
    if (this.driverIsMssql) {
      const jobId = await this.mssqlQueue!.send(
        RUN_QUEUE_NAME,
        payload,
        RUN_QUEUE_RETRY_LIMIT,
      );
      this.logger.log(
        `enqueued run job (mssql): queue=${RUN_QUEUE_NAME} runId=${payload.runId} ym=${payload.ym} jobId=${jobId}`,
      );
      return jobId;
    }
    if (!this.boss) {
      // 非 PG 且非 mssql（測試 SQLite）未注入真實 boss：視為入列不可用。
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
    // 🔴 mssql 分支先判斷（DISPATCH-002）：不可落入下方 `!this.boss` 靜默 return。
    // MssqlQueueService.cancel 本身已吞錯（影響列數 0 = 已被消費 / 不存在，P2a CANCEL-003/004），
    // 故此層不再額外包 try/catch（PROD-004：避免誤判底層 resolve 為錯誤之過度設計）。
    if (this.driverIsMssql) {
      await this.mssqlQueue!.cancel(jobId);
      this.logger.log(`cancelled pending job (mssql): jobId=${jobId}`);
      return;
    }
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
