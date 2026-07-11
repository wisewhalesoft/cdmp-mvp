import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { AssignmentRunPipelineService } from '../services/assignment-run-pipeline.service';
import {
  RUN_QUEUE_TUNING,
  RunQueueTuning,
  DEFAULT_RUN_QUEUE_TUNING,
} from './run-queue-tuning.provider';
import { MssqlQueueService } from './mssql-queue.service';
import {
  RUN_QUEUE_NAME,
  RunJobPayload,
} from './run-queue.constants';

/**
 * F098 / AD-E07-28 P1 / AC-2：月跑 worker 消費者（cdmp-worker 程序）。
 *
 * 自建 T-SQL 佇列 pull 模型（AD-E07-40 §4；PG 全面遷移後 pg-boss 已移除）：
 *  `startMssqlPolling` → `setInterval` → `pollOnce` → `claimNext`。每 tick `TOP(1)` 領一筆
 *  + `polling` reentrancy guard（同程序不重疊）+ 單 worker = 序列化（I-MSSQL-QUEUE-SERIAL-01）。
 *
 * 領到 job 後從 `claimed.payload`（JSON 字串）解出 `{runId, ym}` → 呼叫 `processPayload`
 * （查 run→取消檢查→pipeline→try/catch）。retry=0（OQ-AD28-04）：拋錯不重派；無論成功/失敗一律 `complete`（finally）。
 */
@Injectable()
export class RunQueueConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RunQueueConsumer.name);

  // AD-E07-40 §4.1：mssql 輪詢 loop 之計時器 + reentrancy guard。
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private polling = false; // 避免上一輪 tick 未完成、下一輪計時器又觸發（重疊消費）。

  constructor(
    private readonly pipeline: AssignmentRunPipelineService,
    @InjectRepository(AssignmentRun)
    private readonly runRepo: Repository<AssignmentRun>,
    @Optional()
    @Inject(RUN_QUEUE_TUNING)
    private readonly tuning: RunQueueTuning = DEFAULT_RUN_QUEUE_TUNING,
    // @Optional：sqlite 測試路徑不啟動輪詢，故 config / mssqlQueue 可缺（測試直呼 pollOnce）。
    @Optional() @Inject(ConfigService) private readonly config: ConfigService | null = null,
    @Optional()
    @Inject(MssqlQueueService)
    private readonly mssqlQueue: MssqlQueueService | null = null,
  ) {}

  /**
   * 目前是否為 mssql 自建佇列路徑（worker 生產環境一律 mssql；sqlite 測試為 false → 不啟輪詢）。
   */
  private get driverIsMssql(): boolean {
    const dbType = this.config?.get<string>('DB_TYPE') ?? process.env.DB_TYPE;
    return dbType === 'mssql';
  }

  /**
   * worker 程序啟動時啟動輪詢 loop。API 程序不註冊（API module 不註冊本 provider）。
   * sqlite 測試（driverIsMssql=false）跳過真實輪詢，測試直呼 pollOnce / processPayload。
   */
  async onModuleInit(): Promise<void> {
    if (this.driverIsMssql) {
      this.startMssqlPolling();
      return;
    }
    this.logger.warn(
      'DB_TYPE 非 mssql，RunQueueConsumer 不啟動輪詢（測試 / 非 worker 程序）',
    );
  }

  /**
   * AD-E07-40 §4.2 / P2b DoD #4：worker 優雅關閉時清除輪詢計時器，不留孤兒 interval。
   * worker-main.ts 之 SIGTERM/SIGINT → appContext.close() → NestJS 自動觸發本 hook（POLL-009/010）。
   */
  onModuleDestroy(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /**
   * AD-E07-40 §4.1：啟動 mssql 輪詢 loop。每 `pollIntervalMs` 觸發一次；
   * `polling` guard 確保上一輪未完成前不重疊進入（同程序序列化）。
   */
  private startMssqlPolling(): void {
    const intervalMs = this.tuning.pollIntervalMs ?? 2000;
    this.pollTimer = setInterval(() => {
      if (this.polling) return; // reentrancy guard：上一輪 tick 仍在處理 → 本輪直接略過。
      this.polling = true;
      this.pollOnce()
        .catch((err: any) =>
          this.logger.error(`poll tick 例外：${err?.message ?? err}`),
        )
        .finally(() => {
          this.polling = false;
        });
    }, intervalMs);
    // 不阻擋程序退出（比照 OrphanReaper 既有慣例）。
    if (typeof this.pollTimer.unref === 'function') this.pollTimer.unref();
    this.logger.log(
      `RunQueueConsumer 已啟動 mssql 輪詢：queue=${RUN_QUEUE_NAME} intervalMs=${intervalMs}`,
    );
  }

  /**
   * AD-E07-40 §4.1：單輪輪詢。領一筆 → 解 payload → processPayload → 無論成功/失敗一律 complete。
   * `finally` 保證 complete（retry=0：佇列層不因業務失敗卡在 active）。
   */
  private async pollOnce(): Promise<void> {
    const claimed = await this.mssqlQueue!.claimNext(
      RUN_QUEUE_NAME,
      this.tuning.jobExpireInSeconds,
    );
    if (!claimed) return; // 本輪無待處理 job。
    try {
      // 🔴 PAYLOAD-008：mssql claimed.payload 為 JSON 字串（pg-boss 之 job.data 已解析）→ 須 JSON.parse。
      const payload = JSON.parse(claimed.payload) as RunJobPayload;
      await this.processPayload(claimed.jobId, payload);
    } finally {
      await this.mssqlQueue!.complete(claimed.jobId);
    }
  }

  /**
   * 業務邏輯（I-MSSQL-QUEUE-PAYLOAD-UNITY-01）：解 payload → 防禦性檢查 → 查 run → 取消快路徑
   * → runPipeline；try/catch 確保不使 worker 退出。（pollOnce 領到 job 後呼叫；測試亦直呼此方法。）
   */
  private async processPayload(
    jobId: string,
    payload: RunJobPayload,
  ): Promise<void> {
    const { runId, ym } = payload ?? ({} as RunJobPayload);
    if (!runId || !ym) {
      this.logger.error(
        `job payload 不完整（缺 runId/ym）：jobId=${jobId} data=${JSON.stringify(payload)}；視為已處理`,
      );
      return;
    }

    try {
      const run = await this.runRepo.findOne({
        where: { run_id: runId },
        select: ['run_id', 'status'],
      });

      // TS-F098-CONS-005：對應 run 不存在（極端 race / 手動刪除）→ 記 log、不 crash、視為已處理
      if (!run) {
        this.logger.warn(
          `job 對應 run 不存在：runId=${runId} jobId=${jobId}；略過（不重派，retry=0）`,
        );
        return;
      }

      // 取消快路徑：pending 階段已被 cancelRun 標 failed（worker 尚未消費前取消）→ 不執行 pipeline
      if (run.status === 'failed') {
        this.logger.log(
          `job 對應 run 已被取消（status=failed）：runId=${runId}；略過 pipeline`,
        );
        return;
      }

      // 正常路徑：pending → running → completed/failed（pipeline 內部自行推進狀態）
      await this.pipeline.runPipeline(runId, ym);
    } catch (err: any) {
      // pipeline 已自行 try/catch 標 failed；此處僅防其外意外，確保 worker 不退出
      this.logger.error(
        `consumer handler 例外（已防止 worker 退出）：runId=${runId} jobId=${jobId}: ${err?.message ?? err}`,
        err?.stack,
      );
    }
  }
}
