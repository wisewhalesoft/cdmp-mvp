import {
  Injectable,
  Logger,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { EtlPipeline } from '@/database/entities/etl-pipeline.entity';
import { EtlPipelineLog } from '@/database/entities/etl-pipeline-log.entity';
import { EtlPipelineVersion } from '@/database/entities/etl-pipeline-version.entity';
import { ERROR_CODES, ERROR_MESSAGES } from '@/common/errors/error-codes';
import {
  PipelineRunner,
  NodeDispatcher,
  NodeOutputStore,
  NodeLogEntry,
  ExtractHandler,
  MergeHandler,
  DedupHandler,
  TypeCastHandler,
  DerivedFieldHandler,
  FieldMappingHandler,
  ConditionalHandler,
  TargetLoadHandler,
  LookupHandler,
} from './engine';

@Injectable()
export class EtlPipelineExecutionService {
  private readonly logger = new Logger(EtlPipelineExecutionService.name);

  constructor(
    @InjectRepository(EtlPipeline)
    private readonly pipelineRepository: Repository<EtlPipeline>,
    @InjectRepository(EtlPipelineLog)
    private readonly logRepository: Repository<EtlPipelineLog>,
    @InjectRepository(EtlPipelineVersion)
    private readonly versionRepository: Repository<EtlPipelineVersion>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Create a NodeDispatcher with all registered handlers
   */
  private createDispatcher(): NodeDispatcher {
    const dispatcher = new NodeDispatcher();
    dispatcher.register(new ExtractHandler());
    dispatcher.register(new MergeHandler());
    dispatcher.register(new DedupHandler());
    dispatcher.register(new TypeCastHandler());
    dispatcher.register(new DerivedFieldHandler());
    dispatcher.register(new FieldMappingHandler());
    dispatcher.register(new ConditionalHandler());
    dispatcher.register(new TargetLoadHandler());
    dispatcher.register(new LookupHandler());
    return dispatcher;
  }

  async triggerExecute(
    pipelineId: string,
    userId: string,
  ): Promise<{ logId: string; message: string }> {
    const pipeline = await this.findPipelineOrFail(pipelineId);

    if (pipeline.status === 'running') {
      throw new ConflictException({
        error: ERROR_CODES.PIPELINE_RUNNING,
        message: ERROR_MESSAGES.PIPELINE_RUNNING,
      });
    }

    await this.validateDefinition(pipelineId);

    const triggeredBy = pipeline.status === 'failed' ? 'retry' : 'manual';

    const log = await this.createLogAndSetRunning(pipeline, triggeredBy, false, userId);

    this.executePipeline(pipeline, log).catch(() => {});

    return { logId: log.id, message: 'Pipeline 已開始執行' };
  }

  async triggerTest(
    pipelineId: string,
    userId: string,
  ): Promise<{ logId: string; message: string }> {
    const pipeline = await this.findPipelineOrFail(pipelineId);

    if (pipeline.status === 'running') {
      throw new ConflictException({
        error: ERROR_CODES.PIPELINE_RUNNING,
        message: ERROR_MESSAGES.PIPELINE_RUNNING,
      });
    }

    await this.validateDefinition(pipelineId);

    const log = await this.createLogAndSetRunning(pipeline, 'test', true, userId);

    this.executePipeline(pipeline, log).catch(() => {});

    return { logId: log.id, message: 'Pipeline 測試執行已開始' };
  }

  async triggerSchedule(
    pipelineId: string,
    userId: string,
  ): Promise<{ logId: string; message: string }> {
    const pipeline = await this.findPipelineOrFail(pipelineId);

    if (pipeline.status === 'running') {
      throw new ConflictException({
        error: ERROR_CODES.PIPELINE_RUNNING,
        message: ERROR_MESSAGES.PIPELINE_RUNNING,
      });
    }

    await this.validateDefinition(pipelineId);

    const log = await this.createLogAndSetRunning(pipeline, 'schedule', false, userId);

    this.executePipeline(pipeline, log).catch(() => {});

    return { logId: log.id, message: 'Pipeline 已開始執行' };
  }

  async getProgress(pipelineId: string) {
    await this.findPipelineOrFail(pipelineId);

    const log = await this.logRepository.findOne({
      where: { pipeline_id: pipelineId },
      order: { created_at: 'DESC' },
    });

    if (!log) {
      return {
        logId: null,
        status: null,
        processedCount: 0,
        totalCount: 0,
        progressPercent: 0,
        currentNode: null,
        currentNodeName: null,
      };
    }

    let currentNode: string | null = null;
    let currentNodeName: string | null = null;
    let totalCount = 0;

    if (log.node_logs) {
      try {
        const nodeLogs = typeof log.node_logs === 'string'
          ? JSON.parse(log.node_logs)
          : log.node_logs;
        if (Array.isArray(nodeLogs)) {
          totalCount = nodeLogs.length;
          const runningNode = nodeLogs.find((n: any) => n.status === 'running');
          if (runningNode) {
            currentNode = runningNode.nodeId ?? null;
            currentNodeName = runningNode.nodeName ?? null;
          }
        }
      } catch {
        // ignore parse error
      }
    }

    const processedCount = log.processed_count;
    const progressPercent = totalCount > 0
      ? Math.round((processedCount / totalCount) * 1000) / 10
      : (log.status === 'completed' ? 100 : 0);

    return {
      logId: log.id,
      status: log.status,
      processedCount,
      totalCount,
      progressPercent,
      currentNode,
      currentNodeName,
    };
  }

  private async findPipelineOrFail(pipelineId: string): Promise<EtlPipeline> {
    const pipeline = await this.pipelineRepository
      .createQueryBuilder('p')
      .where('p.id = :id', { id: pipelineId })
      .andWhere('p.deleted_at IS NULL')
      .getOne();

    if (!pipeline) {
      throw new NotFoundException({
        error: ERROR_CODES.PIPELINE_NOT_FOUND,
        message: ERROR_MESSAGES.PIPELINE_NOT_FOUND,
      });
    }

    return pipeline;
  }

  private async validateDefinition(pipelineId: string): Promise<EtlPipelineVersion> {
    const version = await this.versionRepository.findOne({
      where: { pipeline_id: pipelineId },
      order: { version: 'DESC' },
    });

    if (
      !version ||
      !version.definition ||
      !version.definition.nodes ||
      version.definition.nodes.length === 0
    ) {
      throw new UnprocessableEntityException({
        error: ERROR_CODES.PIPELINE_NO_DEFINITION,
        message: ERROR_MESSAGES.PIPELINE_NO_DEFINITION,
      });
    }

    return version;
  }

  private async createLogAndSetRunning(
    pipeline: EtlPipeline,
    triggeredBy: 'manual' | 'test' | 'schedule' | 'retry',
    isTestRun: boolean,
    userId: string,
  ): Promise<EtlPipelineLog> {
    const now = new Date();

    // Use latest version number (not pipeline.version which is the last published version)
    const latestVersion = await this.versionRepository.findOne({
      where: { pipeline_id: pipeline.id },
      order: { version: 'DESC' },
    });
    const versionNumber = latestVersion ? latestVersion.version : pipeline.version;

    const log = this.logRepository.create({
      pipeline_id: pipeline.id,
      version: versionNumber,
      status: 'running' as const,
      started_at: now,
      triggered_by: triggeredBy,
      is_test_run: isTestRun,
      created_by: userId,
      processed_count: 0,
    });
    const savedLog = await this.logRepository.save(log);

    const previousStatus = pipeline.status;
    pipeline.status = 'running';
    // Store previousStatus in node_logs metadata temporarily
    savedLog.node_logs = JSON.stringify({ previousStatus });
    await this.logRepository.save(savedLog);
    await this.pipelineRepository.save(pipeline);

    return savedLog;
  }

  private async executePipeline(
    pipeline: EtlPipeline,
    log: EtlPipelineLog,
  ): Promise<void> {
    const startTime = Date.now();

    try {
      const version = await this.versionRepository.findOne({
        where: { pipeline_id: pipeline.id },
        order: { version: 'DESC' },
      });

      const definition = version?.definition ?? { nodes: [], edges: [] };
      let previousStatus = 'active';

      // Extract previousStatus from log metadata
      if (log.node_logs) {
        try {
          const meta = JSON.parse(log.node_logs);
          if (meta.previousStatus) {
            previousStatus = meta.previousStatus;
          }
        } catch { /* ignore */ }
      }

      // Create engine components
      const dispatcher = this.createDispatcher();
      const outputStore = new NodeOutputStore();
      const runner = new PipelineRunner(dispatcher, outputStore);

      // Create a QueryRunner for DB operations
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();

      try {
        // Run the real ETL pipeline
        const nodeLogs = await runner.run(
          definition,
          {
            batchSize: 10000,
            upsertBatchSize: 5000,
            isTestRun: log.is_test_run,
            pipelineId: pipeline.id,
            logId: log.id,
          },
          queryRunner,
          async (nodeLogEntries: NodeLogEntry[], status: 'running' | 'completed' | 'failed', errorMessage?: string) => {
            // Update node_logs in DB
            log.node_logs = JSON.stringify(nodeLogEntries);

            // Count completed nodes for processed_count
            const completedCount = nodeLogEntries.filter((n) => n.status === 'completed').length;
            log.processed_count = completedCount;

            if (status === 'failed' && errorMessage) {
              log.error_message = errorMessage;
            }

            await this.logRepository.save(log);
          },
        );

        const finishedAt = new Date();
        const durationMs = Date.now() - startTime;

        // Determine final status from nodeLogs
        const hasFailed = nodeLogs.some((n) => n.status === 'failed');

        if (hasFailed) {
          log.status = 'failed';
          log.finished_at = finishedAt;
          log.duration_ms = durationMs;
          await this.logRepository.save(log);

          pipeline.status = 'failed';
          pipeline.last_execution_at = finishedAt;
          await this.pipelineRepository.save(pipeline);
        } else {
          // Success
          log.status = 'completed';
          log.finished_at = finishedAt;
          log.duration_ms = durationMs;
          await this.logRepository.save(log);

          if (log.is_test_run) {
            pipeline.status = previousStatus as any;

            // BR-6: Test run success → version status draft → testing
            if (version && version.status === 'draft') {
              version.status = 'testing';
              await this.versionRepository.save(version);
            }
          } else {
            pipeline.status = 'active';

            // Update pipeline stats (BR-7: test run doesn't count)
            const newExecutionCount = pipeline.execution_count + 1;
            const newAvgDurationMs = Math.round(
              ((pipeline.avg_duration_ms * (newExecutionCount - 1)) + durationMs) / newExecutionCount,
            );
            pipeline.processed_count += log.processed_count;
            pipeline.execution_count = newExecutionCount;
            pipeline.avg_duration_ms = newAvgDurationMs;
          }

          pipeline.last_execution_at = finishedAt;
          await this.pipelineRepository.save(pipeline);
        }
      } finally {
        await queryRunner.release();
      }
    } catch (err: any) {
      const finishedAt = new Date();
      const durationMs = Date.now() - startTime;
      const errorMessage = err?.message || String(err);

      log.status = 'failed';
      log.finished_at = finishedAt;
      log.duration_ms = durationMs;
      log.error_message = errorMessage;
      await this.logRepository.save(log);

      pipeline.status = 'failed';
      pipeline.last_execution_at = finishedAt;
      await this.pipelineRepository.save(pipeline);

      this.logger.error(`Pipeline ${pipeline.id} execution failed: ${errorMessage}`);
    }
  }
}
