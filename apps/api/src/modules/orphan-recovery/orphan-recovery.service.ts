import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ExtractionTask } from '@/database/entities/extraction-task.entity';
import { ExtractionLog } from '@/database/entities/extraction-log.entity';
import { EtlPipeline } from '@/database/entities/etl-pipeline.entity';
import { EtlPipelineLog } from '@/database/entities/etl-pipeline-log.entity';

interface RecoveryResult {
  scanned: number;
  recovered: number;
  skipped: boolean;
}

const EXTRACTION_TASK_ERROR = '系統重啟，任務執行中斷，請重新觸發執行';
const EXTRACTION_LOG_ERROR = '系統重啟，執行進程被中斷';
const PIPELINE_LOG_ERROR = '系統重啟，Pipeline 執行進程被中斷';

@Injectable()
export class OrphanRecoveryService implements OnApplicationBootstrap {
  private readonly logger = new Logger(OrphanRecoveryService.name);

  constructor(
    @InjectRepository(ExtractionTask)
    private readonly taskRepository: Repository<ExtractionTask>,
    @InjectRepository(ExtractionLog)
    private readonly logRepository: Repository<ExtractionLog>,
    @InjectRepository(EtlPipeline)
    private readonly pipelineRepository: Repository<EtlPipeline>,
    @InjectRepository(EtlPipelineLog)
    private readonly pipelineLogRepository: Repository<EtlPipelineLog>,
    private readonly dataSource: DataSource,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const startTime = Date.now();
    this.logger.log('孤兒任務回收開始...');

    let extractionResult: RecoveryResult = { scanned: 0, recovered: 0, skipped: false };
    let pipelineResult: RecoveryResult = { scanned: 0, recovered: 0, skipped: false };

    try {
      extractionResult = await this.recoverExtractionTasks();
    } catch (err: any) {
      this.logger.error(
        `擷取任務回收失敗，孤兒任務未修復。原因：${err.message}`,
        err.stack,
      );
      extractionResult = { scanned: 0, recovered: 0, skipped: true };
    }

    try {
      pipelineResult = await this.recoverEtlPipelines();
    } catch (err: any) {
      this.logger.error(
        `ETL Pipeline 回收失敗，孤兒 Pipeline 未修復。原因：${err.message}`,
        err.stack,
      );
      pipelineResult = { scanned: 0, recovered: 0, skipped: true };
    }

    const elapsed = Date.now() - startTime;
    this.logger.log(
      `孤兒任務回收完成。擷取任務：修復 ${extractionResult.recovered}/${extractionResult.scanned}；` +
      `ETL Pipeline：修復 ${pipelineResult.recovered}/${pipelineResult.scanned}；` +
      `總耗時：${elapsed}ms`,
    );
  }

  private get nowExpr(): string {
    return this.dataSource.options.type === 'postgres' ? 'NOW()' : "datetime('now')";
  }

  private get durationExpr(): string {
    return this.dataSource.options.type === 'postgres'
      ? 'EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000'
      : "CAST((julianday('now') - julianday(started_at)) * 86400000 AS INTEGER)";
  }

  private async recoverExtractionTasks(): Promise<RecoveryResult> {
    const orphanTasks = await this.taskRepository
      .createQueryBuilder('task')
      .select(['task.id'])
      .where('task.status = :status', { status: 'running' })
      .andWhere('task.deleted_at IS NULL')
      .getMany();

    if (orphanTasks.length === 0) {
      this.logger.log('擷取任務：無需修復（0 筆孤兒）');
      return { scanned: 0, recovered: 0, skipped: false };
    }

    const orphanTaskIds = orphanTasks.map((t) => t.id);
    const now = this.nowExpr;

    await this.dataSource.transaction(async (manager) => {
      await manager
        .createQueryBuilder()
        .update(ExtractionTask)
        .set({
          status: 'failed',
          error_message: EXTRACTION_TASK_ERROR,
          updated_at: () => now,
        })
        .whereInIds(orphanTaskIds)
        .execute();

      await manager
        .createQueryBuilder()
        .update(ExtractionLog)
        .set({
          status: 'failed',
          finished_at: () => now,
          error_message: EXTRACTION_LOG_ERROR,
        })
        .where('task_id IN (:...taskIds)', { taskIds: orphanTaskIds })
        .andWhere('status = :status', { status: 'running' })
        .andWhere('finished_at IS NULL')
        .execute();
    });

    this.logger.log(`擷取任務回收完成：修復 ${orphanTaskIds.length} 筆孤兒任務及其日誌`);
    return { scanned: orphanTaskIds.length, recovered: orphanTaskIds.length, skipped: false };
  }

  private async recoverEtlPipelines(): Promise<RecoveryResult> {
    const orphanPipelines = await this.pipelineRepository
      .createQueryBuilder('p')
      .select(['p.id'])
      .where('p.status = :status', { status: 'running' })
      .andWhere('p.deleted_at IS NULL')
      .getMany();

    if (orphanPipelines.length === 0) {
      this.logger.log('ETL Pipeline：無需修復（0 筆孤兒）');
      return { scanned: 0, recovered: 0, skipped: false };
    }

    const orphanPipelineIds = orphanPipelines.map((p) => p.id);
    const now = this.nowExpr;
    const duration = this.durationExpr;

    await this.dataSource.transaction(async (manager) => {
      await manager
        .createQueryBuilder()
        .update(EtlPipeline)
        .set({
          status: 'failed',
          updated_at: () => now,
        })
        .whereInIds(orphanPipelineIds)
        .execute();

      await manager
        .createQueryBuilder()
        .update(EtlPipelineLog)
        .set({
          status: 'failed',
          finished_at: () => now,
          duration_ms: () => duration,
          error_message: PIPELINE_LOG_ERROR,
        })
        .where('pipeline_id IN (:...pipelineIds)', { pipelineIds: orphanPipelineIds })
        .andWhere('status = :status', { status: 'running' })
        .andWhere('finished_at IS NULL')
        .execute();
    });

    this.logger.log(`ETL Pipeline 回收完成：修復 ${orphanPipelineIds.length} 筆孤兒 Pipeline 及其日誌`);
    return { scanned: orphanPipelineIds.length, recovered: orphanPipelineIds.length, skipped: false };
  }
}
