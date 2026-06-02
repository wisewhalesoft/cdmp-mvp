import {
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type PgBoss from 'pg-boss';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { AssignmentRunPipelineService } from '../services/assignment-run-pipeline.service';
import { PG_BOSS } from './pg-boss.provider';
import {
  RUN_QUEUE_BATCH_SIZE,
  RUN_QUEUE_NAME,
  RunJobPayload,
} from './run-queue.constants';

/**
 * F098 / AD-E07-28 P1 / AC-2：月跑 worker 消費者（cdmp-worker 程序）。
 *
 * `boss.work(RUN_QUEUE_NAME, { batchSize: 1 }, handler)`：
 *  - pg-boss v10 之 handler 收到的是 job **陣列**（`Job[]`），payload 在 `job.data`（非 job 物件本身）。
 *  - batchSize=1 + 單 worker 程序 = 單一 job 序列化消費（OQ-AD28-05；v10 已無 teamConcurrency）。
 *  - retryLimit=0（queue policy + per-send，OQ-AD28-04）：handler 拋錯不重派；pipeline 內部 try/catch
 *    已標 status='failed'，故 handler 對 pg-boss 回 resolve（job 視為已處理，不觸發重試）。
 *
 * 取 job → `runPipeline(runId, ym)`（status pending→running→completed/failed，沿用既有 pipeline）。
 */
@Injectable()
export class RunQueueConsumer implements OnModuleInit {
  private readonly logger = new Logger(RunQueueConsumer.name);

  constructor(
    @Optional() @Inject(PG_BOSS) private readonly boss: PgBoss | null,
    private readonly pipeline: AssignmentRunPipelineService,
    @InjectRepository(AssignmentRun)
    private readonly runRepo: Repository<AssignmentRun>,
  ) {}

  /**
   * worker 程序啟動時註冊 work handler。API 程序不註冊（API module 不註冊本 provider）。
   * boss 為 null（非 PG）時跳過（測試直呼 handleJobs，不依賴真實 work 註冊）。
   */
  async onModuleInit(): Promise<void> {
    if (!this.boss) {
      this.logger.warn(
        'pg-boss 實例未提供，RunQueueConsumer 不註冊 work handler（測試 / 非 worker 程序）',
      );
      return;
    }
    await this.boss.work<RunJobPayload>(
      RUN_QUEUE_NAME,
      { batchSize: RUN_QUEUE_BATCH_SIZE },
      (jobs) => this.handleJobs(jobs),
    );
    this.logger.log(
      `RunQueueConsumer 已註冊：queue=${RUN_QUEUE_NAME} batchSize=${RUN_QUEUE_BATCH_SIZE}`,
    );
  }

  /**
   * pg-boss v10 work handler：收 job 陣列。batchSize=1 下通常單筆，仍逐筆穩健處理。
   */
  async handleJobs(jobs: PgBoss.Job<RunJobPayload>[]): Promise<void> {
    for (const job of jobs) {
      await this.handleOne(job);
    }
  }

  /**
   * 處理單一 job：解 job.data → 防禦性檢查 → runPipeline。
   * handler 不拋未捕捉例外使 worker 程序退出（TS-F098-CONS-005）；pipeline 內部已 swallow，
   * 此處再包一層 try/catch 防 runPipeline 之外的意外（如 run 查詢失敗）。
   */
  private async handleOne(job: PgBoss.Job<RunJobPayload>): Promise<void> {
    const { runId, ym } = job.data ?? ({} as RunJobPayload);
    if (!runId || !ym) {
      this.logger.error(
        `job payload 不完整（缺 runId/ym）：jobId=${job.id} data=${JSON.stringify(job.data)}；視為已處理`,
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
          `job 對應 run 不存在：runId=${runId} jobId=${job.id}；略過（不重派，retry=0）`,
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
        `consumer handler 例外（已防止 worker 退出）：runId=${runId} jobId=${job.id}: ${err?.message ?? err}`,
        err?.stack,
      );
    }
  }
}
