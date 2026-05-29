import { Injectable, Inject, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExtractionTask } from '@/database/entities/extraction-task.entity';
import { ExtractionLog } from '@/database/entities/extraction-log.entity';
import { ERROR_CODES, ERROR_MESSAGES } from '@/common/errors/error-codes';
import { EXTRACTION_EXECUTOR, IExtractionExecutor } from './extraction-executor.provider';
import { RawDataService } from './raw-data.service';

const BATCH_SIZE = 1000;

@Injectable()
export class ExtractionExecutionService {
  constructor(
    @InjectRepository(ExtractionTask)
    private readonly taskRepository: Repository<ExtractionTask>,
    @InjectRepository(ExtractionLog)
    private readonly logRepository: Repository<ExtractionLog>,
    @Inject(EXTRACTION_EXECUTOR)
    private readonly executor: IExtractionExecutor,
    private readonly rawDataService: RawDataService,
  ) {}

  /**
   * Trigger a run: synchronous transaction (INSERT log + UPDATE status=running) then
   * fire-and-forget the async extraction. Returns the log ID immediately.
   */
  async triggerRun(
    taskId: string,
    triggeredBy: 'manual' | 'retry' | 'schedule',
    userId: string,
  ): Promise<{ logId: string }> {
    // Find task
    const task = await this.taskRepository
      .createQueryBuilder('task')
      .where('task.id = :id', { id: taskId })
      .andWhere('task.deleted_at IS NULL')
      .getOne();

    if (!task) {
      throw new NotFoundException({
        error: ERROR_CODES.EXTRACTION_NOT_FOUND,
        message: ERROR_MESSAGES.EXTRACTION_NOT_FOUND,
      });
    }

    // Cannot trigger if already running
    if (task.status === 'running') {
      throw new ConflictException({
        error: ERROR_CODES.EXTRACTION_RUNNING,
        message: ERROR_MESSAGES.EXTRACTION_RUNNING,
      });
    }

    const now = new Date();

    // Create log entry
    const log = this.logRepository.create({
      task_id: taskId,
      status: 'running',
      started_at: now,
      triggered_by: triggeredBy,
      created_by: userId,
      extracted_count: 0,
      total_count: 0,
    });
    const savedLog = await this.logRepository.save(log);

    // Update task status to running
    task.status = 'running';
    task.error_message = null;
    await this.taskRepository.save(task);

    // Fire-and-forget async execution
    this.executeExtraction(task, savedLog).catch(() => {
      // Errors are handled inside executeExtraction
    });

    return { logId: savedLog.id };
  }

  /**
   * Async background extraction logic.
   * Batch-reads from source via executor, batch-writes to raw data table in AppDB.
   */
  private async executeExtraction(
    task: ExtractionTask,
    log: ExtractionLog,
  ): Promise<void> {
    const startTime = Date.now();

    try {
      // 1. Get source table metadata
      const metadata = await this.executor.getSourceTableMetadata({
        datasourceId: task.datasource_id,
        sourceTable: task.source_table,
        sourceSchema: task.source_schema,
      });

      // 2. Ensure raw data table exists, rebuild if schema changed
      if (task.raw_table_name) {
        const exists = await this.rawDataService.tableExists(task.raw_table_name);
        if (exists) {
          // Compare source metadata columns with existing table columns
          const existingCols = await this.rawDataService.getTableColumns(task.raw_table_name);
          const sourceColNames = metadata.map((c) => this.rawDataService.sanitizeColumnName(c.name));
          // Filter out system columns for comparison
          const existingUserCols = existingCols.filter(
            (c) => c !== '_cdmp_id' && c !== '_cdmp_extracted_at',
          );
          const schemaChanged =
            sourceColNames.length !== existingUserCols.length ||
            sourceColNames.some((col) => !existingUserCols.includes(col));
          if (schemaChanged) {
            await this.rawDataService.dropTable(task.raw_table_name);
            await this.rawDataService.createRawTable(task.raw_table_name, metadata);
          }
        } else {
          await this.rawDataService.createRawTable(task.raw_table_name, metadata);
        }
      }

      // 3. Full mode: TRUNCATE existing data
      if (task.mode === 'full' && task.raw_table_name) {
        const exists = await this.rawDataService.tableExists(task.raw_table_name);
        if (exists) {
          await this.rawDataService.truncateTable(task.raw_table_name);
        }
      }

      // 4. Get total count
      const totalCount = await this.executor.getSourceCount({
        datasourceId: task.datasource_id,
        sourceTable: task.source_table,
        sourceSchema: task.source_schema,
        mode: task.mode,
        incrementalColumn: task.incremental_column,
        lastIncrementalValue: task.last_incremental_value,
      });

      log.total_count = totalCount;
      task.total_count = totalCount;
      await this.logRepository.save(log);
      await this.taskRepository.save(task);

      // 5. Empty table handling
      if (totalCount === 0) {
        const finishedAt = new Date();
        const durationMs = Date.now() - startTime;

        log.status = 'completed';
        log.finished_at = finishedAt;
        log.duration_ms = durationMs;
        log.extracted_count = 0;
        await this.logRepository.save(log);

        const newExecutionCount = task.execution_count + 1;
        const newAvgDurationMs = Math.round(
          ((task.avg_duration_ms * (newExecutionCount - 1)) + durationMs) / newExecutionCount,
        );

        task.status = 'completed';
        task.last_execution_at = finishedAt;
        task.extracted_count = 0;
        task.progress_percent = 100;
        task.execution_count = newExecutionCount;
        task.avg_duration_ms = newAvgDurationMs;
        task.error_message = null;
        await this.taskRepository.save(task);
        return;
      }

      // 6. Batch read + write loop
      let extractedCount = 0;
      let lastKeyValue: any = undefined;
      let offset = 0;
      const columnNames = metadata.map((c) => this.rawDataService.sanitizeColumnName(c.name));
      const allColumns = [...columnNames, '_cdmp_extracted_at'];
      const primaryKeyCol = metadata.find((c) => c.isPrimary)?.name || null;

      // Fast path: full mode + streaming-capable source (MSSQL) + COPY-capable
      // target (PostgreSQL). A single forward cursor (O(n)) replaces OFFSET
      // pagination (O(n²)), and COPY FROM STDIN replaces per-batch INSERT.
      // Any other combination keeps the original readBatch + insertBatch loop.
      const canStream =
        task.mode === 'full' &&
        !!task.raw_table_name &&
        this.rawDataService.supportsCopy() &&
        typeof this.executor.supportsStreaming === 'function' &&
        typeof this.executor.streamBatches === 'function' &&
        (await this.executor.supportsStreaming(task.datasource_id));

      if (canStream) {
        extractedCount = await this.streamExtractWithCopy(task, totalCount, allColumns);
      } else {
        while (true) {
          const batch = await this.executor.readBatch({
            datasourceId: task.datasource_id,
            sourceTable: task.source_table,
            sourceSchema: task.source_schema,
            mode: task.mode,
            incrementalColumn: task.incremental_column,
            lastIncrementalValue: task.last_incremental_value,
            batchSize: BATCH_SIZE,
            lastKeyValue,
            primaryKeyColumn: primaryKeyCol,
            offset,
          });

          if (batch.rows.length === 0) break;

          // Append _cdmp_extracted_at to each row
          const now = new Date().toISOString();
          for (const row of batch.rows) {
            row._cdmp_extracted_at = now;
          }

          // Write to AppDB
          if (task.raw_table_name) {
            await this.rawDataService.insertBatch(
              task.raw_table_name,
              allColumns,
              batch.rows,
            );
          }

          extractedCount += batch.rows.length;
          lastKeyValue = batch.lastKeyValue;
          offset += batch.rows.length;

          // Update progress
          task.extracted_count = extractedCount;
          task.progress_percent = Math.round((extractedCount / totalCount) * 100);
          await this.taskRepository.save(task);

          if (!batch.hasMore) break;
        }
      }

      // 7. Completion
      const finishedAt = new Date();
      const durationMs = Date.now() - startTime;

      log.extracted_count = extractedCount;
      log.status = 'completed';
      log.finished_at = finishedAt;
      log.duration_ms = durationMs;
      await this.logRepository.save(log);

      const newExecutionCount = task.execution_count + 1;
      const newAvgDurationMs = Math.round(
        ((task.avg_duration_ms * (newExecutionCount - 1)) + durationMs) / newExecutionCount,
      );

      task.status = 'completed';
      task.extracted_count = extractedCount;
      task.progress_percent = 100;
      task.last_execution_at = finishedAt;
      task.execution_count = newExecutionCount;
      task.avg_duration_ms = newAvgDurationMs;
      task.error_message = null;

      // Incremental mode: update lastIncrementalValue
      if (task.mode === 'incremental' && lastKeyValue !== undefined) {
        task.last_incremental_value = String(lastKeyValue);
      }

      await this.taskRepository.save(task);
    } catch (err: any) {
      const finishedAt = new Date();
      const durationMs = Date.now() - startTime;
      const errorMessage = err?.message || String(err);

      // Update log as failed
      log.status = 'failed';
      log.finished_at = finishedAt;
      log.duration_ms = durationMs;
      log.error_message = errorMessage;
      await this.logRepository.save(log);

      // Update task as failed
      const newExecutionCount = task.execution_count + 1;
      const newAvgDurationMs = Math.round(
        ((task.avg_duration_ms * (newExecutionCount - 1)) + durationMs) / newExecutionCount,
      );

      task.status = 'failed';
      task.last_execution_at = finishedAt;
      task.execution_count = newExecutionCount;
      task.avg_duration_ms = newAvgDurationMs;
      task.error_message = errorMessage;
      await this.taskRepository.save(task);
    }
  }

  /**
   * Full-mode fast path: stream the whole source table over one forward cursor
   * and pipe each batch into a single long-lived COPY FROM STDIN writer.
   * Progress is persisted at most ~once per second (vs once per batch) to avoid
   * thousands of AppDB UPDATEs. Returns the number of rows extracted.
   */
  private async streamExtractWithCopy(
    task: ExtractionTask,
    totalCount: number,
    allColumns: string[],
  ): Promise<number> {
    const writer = await this.rawDataService.openCopyWriter(
      task.raw_table_name!,
      allColumns,
    );
    let extractedCount = 0;
    let lastProgressAt = 0;
    try {
      await this.executor.streamBatches!(
        {
          datasourceId: task.datasource_id,
          sourceTable: task.source_table,
          sourceSchema: task.source_schema,
          batchSize: BATCH_SIZE,
        },
        async (rows) => {
          const now = new Date().toISOString();
          for (const row of rows) {
            row._cdmp_extracted_at = now;
          }
          await writer.writeRows(rows);
          extractedCount += rows.length;

          // Throttle progress persistence to ~1/sec to avoid per-batch UPDATEs.
          const nowMs = Date.now();
          if (nowMs - lastProgressAt >= 1000) {
            task.extracted_count = extractedCount;
            task.progress_percent =
              totalCount > 0 ? Math.round((extractedCount / totalCount) * 100) : 0;
            await this.taskRepository.save(task);
            lastProgressAt = nowMs;
          }
        },
      );
      await writer.finish();
    } catch (err) {
      await writer.abort(err);
      throw err;
    }
    return extractedCount;
  }
}
