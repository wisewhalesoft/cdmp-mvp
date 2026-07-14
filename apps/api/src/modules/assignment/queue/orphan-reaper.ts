import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In, IsNull, LessThanOrEqual } from 'typeorm';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import {
  RUN_QUEUE_TUNING,
  RunQueueTuning,
  DEFAULT_RUN_QUEUE_TUNING,
} from './run-queue-tuning.provider';

/** orphan 回收後寫入之 error_message（F098 spec AC-6 指定文案，前端 F062 直接顯示，勿改字） */
export const ORPHAN_ERROR_MESSAGE = 'worker 中斷，請重新觸發';

/**
 * F098 / AD-E07-28 §9.2 / AC-6：殭屍 running run 回收（worker 崩潰遺留）。
 *
 * worker 崩潰（OOM 等）後遺留 `status='running'` 但對應 pg-boss job 已不存在 / 已 expire。
 * OrphanReaper 於 worker 啟動時（onApplicationBootstrap，類比 F038 OrphanRecoveryService）
 * + 定期掃描，將逾時殭屍 run 標為 'failed' + error_message='worker 中斷，請重新觸發'。
 *
 * 偵測**不新增** schema 欄位（OQ-AD28-02）：靠「running/pending 持續時間 > 閾值」+ pg-boss job
 * expiration。閾值 `orphanThresholdMs` 可注入（OQ-F098-02），預設明顯大於最長月名單分派時間以免誤殺
 * 執行中 run（TS-F098-ORPHAN-003/004 守此邊界）。
 *
 * OQ-F098-01（採納 = 涵蓋）：一併掃 `pending` 且超過閾值仍無對應 job 者（入列失敗孤兒）。
 */
@Injectable()
export class OrphanReaper implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(OrphanReaper.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @InjectRepository(AssignmentRun)
    private readonly runRepo: Repository<AssignmentRun>,
    private readonly dataSource: DataSource,
    @Optional()
    @Inject(RUN_QUEUE_TUNING)
    private readonly tuning: RunQueueTuning = DEFAULT_RUN_QUEUE_TUNING,
  ) {}

  /** worker 啟動時掃一次 + 啟動定期掃描（可注入週期）。 */
  async onApplicationBootstrap(): Promise<void> {
    await this.reap();
    this.startPeriodicScan();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private startPeriodicScan(): void {
    const interval = this.tuning.reaperIntervalMs;
    if (!interval || interval <= 0) return;
    this.timer = setInterval(() => {
      this.reap().catch((err: any) =>
        this.logger.error(`定期 orphan 掃描失敗：${err?.message ?? err}`),
      );
    }, interval);
    // 不阻擋程序退出
    if (typeof this.timer.unref === 'function') this.timer.unref();
  }

  /**
   * 執行一次回收掃描。回傳回收筆數（測試斷言用）。
   *
   * @param now 注入時鐘（測試以固定時間 + 短閾值觸發 / 守不誤殺邊界）；預設 new Date()
   */
  async reap(now: Date = new Date()): Promise<number> {
    // 閾值前的時間點：started_at / created_at <= cutoff 才算逾時
    const cutoff = new Date(now.getTime() - this.tuning.orphanThresholdMs);

    // 1) running 殭屍：status='running' 且 started_at <= cutoff（執行中 run started_at 較新 → 不誤殺）
    const runningOrphans = await this.runRepo.find({
      where: {
        status: 'running',
        started_at: LessThanOrEqual(cutoff),
      },
      select: ['run_id'],
    });

    // 1b) 半轉換殭屍：status='running' 但 started_at IS NULL（例如 .mssql 測試 seed 直插 running、
    //     或 stamp started_at 前 worker 就死）。SQL 中 `NULL <= cutoff` 恆為 UNKNOWN → 永遠逃過 1)，
    //     故獨立以 created_at 逾時判定回收（否則此類殭屍會永久卡 'running' 全域擋 E07）。
    const runningNullStartedOrphans = await this.runRepo.find({
      where: {
        status: 'running',
        started_at: IsNull(),
        created_at: LessThanOrEqual(cutoff),
      },
      select: ['run_id'],
    });

    // 2) pending 孤兒（OQ-F098-01）：status='pending' 且 created_at <= cutoff（入列失敗 / 遺留）
    const pendingOrphans = await this.runRepo.find({
      where: {
        status: 'pending',
        created_at: LessThanOrEqual(cutoff),
      },
      select: ['run_id'],
    });

    const orphanIds = [
      ...runningOrphans.map((r) => r.run_id),
      ...runningNullStartedOrphans.map((r) => r.run_id),
      ...pendingOrphans.map((r) => r.run_id),
    ];

    if (orphanIds.length === 0) {
      return 0;
    }

    // 原子標記 failed + 文案。只更新仍為 running/pending 者（避免覆寫期間被其他流程改動的列）。
    await this.dataSource.transaction(async (manager) => {
      await manager
        .createQueryBuilder()
        .update(AssignmentRun)
        .set({
          status: 'failed',
          error_message: ORPHAN_ERROR_MESSAGE,
          finished_at: now,
        })
        .where({ run_id: In(orphanIds) })
        .andWhere('status IN (:...statuses)', {
          statuses: ['running', 'pending'],
        })
        .execute();
    });

    this.logger.warn(
      `orphan 回收：標記 ${orphanIds.length} 筆殭屍 run 為 failed（running=${runningOrphans.length}, running(null started_at)=${runningNullStartedOrphans.length}, pending=${pendingOrphans.length}）`,
    );
    return orphanIds.length;
  }
}
