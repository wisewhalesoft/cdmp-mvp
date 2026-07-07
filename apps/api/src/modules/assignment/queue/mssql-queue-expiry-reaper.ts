import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  RUN_QUEUE_TUNING,
  RunQueueTuning,
  DEFAULT_RUN_QUEUE_TUNING,
} from './pg-boss.provider';
import { MssqlQueueService } from './mssql-queue.service';

/**
 * AD-E07-40 P2c（§4.3）— mssql 自建佇列之逾時回收 sweep 定時掛載器（cdmp-worker 程序）。
 *
 * 🔴 掛載機制選型（MOUNT-001 / impl log AD-5）：AD §4.3 未強制掛載方式，交 tdd-implementation
 *    依現行風格擇一。本輪選擇「**新建獨立 provider**」而非「擴充 OrphanReaper 既有 reaperIntervalMs 定時器」，
 *    理由：本切片硬約束「OrphanReaper 零改動」（P2b ZERO-003 靜態守門已鎖 orphan-reaper.ts 不得含
 *    DB_TYPE / mssqlQueue / MssqlQueueService / 佇列表名）——擴充 OrphanReaper 會立即違反該守門且破壞其
 *    純業務層語意（AD §3「OrphanReaper 純粹查 AssignmentRun repo，從未觸碰佇列內部狀態」）。
 *    故以本獨立 provider 仿 OrphanReaper 之生命週期模式（OnApplicationBootstrap 立即掃一次 +
 *    setInterval 定期掃 + unref 不阻擋退出 + OnModuleDestroy 清 timer），維持兩層回收各自獨立（§9.2）。
 *
 * 週期來源（STATIC-004）：**重用**既有 `RunQueueTuning.reaperIntervalMs`（env `RUN_QUEUE_REAPER_INTERVAL_MS`
 *    可覆蓋），不引入新的寫死常數——sweep 屬佇列層衛生性清理，與 OrphanReaper 業務層回收同一節奏概念上相稱，
 *    且天然滿足「可由 env 注入、不需真實等待」之測試原則。
 *
 * driver 分支（§5）：僅 mssql 路徑啟用（`DB_TYPE==='mssql'`，先於 mssqlQueue 是否注入判定，比照
 *    RunQueueConsumer.driverIsMssql）。postgres（cutover 前 pg-boss）/ sqlite 路徑一律 no-op，
 *    不啟動任何 timer（REG-003 postgres 分支零副作用）。
 *
 * 單一 SQL 來源（STATIC-002/003）：本 provider 不自寫任何佇列狀態轉移 SQL（不繞過 service 直下 UPDATE），
 *    一律委派 `MssqlQueueService.expireSweep()`（唯一佇列 SQL 來源，I-MSSQL-QUEUE-PAYLOAD-UNITY-01 精神延伸）。
 */
@Injectable()
export class MssqlQueueExpiryReaper
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(MssqlQueueExpiryReaper.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @Optional()
    @Inject(RUN_QUEUE_TUNING)
    private readonly tuning: RunQueueTuning = DEFAULT_RUN_QUEUE_TUNING,
    // @Optional：postgres / sqlite 路徑不需要（且 MOUNT 單元測試直接建構、注入 fake）。
    @Optional() private readonly config: ConfigService | null = null,
    @Optional() private readonly mssqlQueue: MssqlQueueService | null = null,
  ) {}

  /**
   * 目前是否為 mssql 自建佇列路徑（比照 RunQueueConsumer.driverIsMssql，§0.3 二元 gate 陷阱）：
   * mssql 環境下 pg-boss 相關訊號與 sqlite 相同，故一律以 DB_TYPE 顯式判定。
   */
  private get driverIsMssql(): boolean {
    const dbType = this.config?.get<string>('DB_TYPE') ?? process.env.DB_TYPE;
    return dbType === 'mssql';
  }

  /** worker 啟動時掃一次 + 啟動定期掃描（比照 OrphanReaper 既有模式）。非 mssql 一律 no-op。 */
  async onApplicationBootstrap(): Promise<void> {
    if (!this.driverIsMssql || !this.mssqlQueue) return;
    await this.sweepOnce();
    this.startPeriodicSweep();
  }

  /** worker 優雅關閉時清除計時器，不留孤兒 interval（MOUNT-005，比照 OrphanReaper.onModuleDestroy）。 */
  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private startPeriodicSweep(): void {
    // 週期重用 reaperIntervalMs（STATIC-004；env RUN_QUEUE_REAPER_INTERVAL_MS 覆蓋）。
    const interval = this.tuning.reaperIntervalMs;
    // 防呆：週期 <= 0（或未設）→ 不啟動定時器（MOUNT-004，比照 orphan-reaper.ts 既有防呆）。
    if (!interval || interval <= 0) return;
    this.timer = setInterval(() => {
      this.sweepOnce().catch((err: any) =>
        this.logger.error(`定期 expire sweep 失敗：${err?.message ?? err}`),
      );
    }, interval);
    // 不阻擋程序退出（MOUNT-006，比照 orphan-reaper.ts / run-queue.consumer.ts 既有慣例）。
    if (typeof this.timer.unref === 'function') this.timer.unref();
  }

  /** 委派唯一佇列 SQL 來源 MssqlQueueService.expireSweep()（不自寫 state='expired' 邏輯）。 */
  private async sweepOnce(): Promise<void> {
    if (!this.mssqlQueue) return;
    await this.mssqlQueue.expireSweep();
  }
}
