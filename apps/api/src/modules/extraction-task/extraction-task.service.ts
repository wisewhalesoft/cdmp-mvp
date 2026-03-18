import { Injectable, ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CronExpressionParser } from 'cron-parser';
import { ExtractionTask } from '@/database/entities/extraction-task.entity';
import { ExtractionLog } from '@/database/entities/extraction-log.entity';
import { Datasource } from '@/database/entities/datasource.entity';
import { ERROR_CODES, ERROR_MESSAGES } from '@/common/errors/error-codes';
import { CreateExtractionTaskDto } from './dto/create-extraction-task.dto';
import { ListExtractionTaskDto } from './dto/list-extraction-task.dto';

export interface ExtractionTaskResult {
  id: string;
  name: string;
  datasourceId: string;
  datasourceName: string;
  mode: string;
  status: string;
  targetTable: string;
  incrementalColumn: string | null;
  lastIncrementalValue: string | null;
  schedule: string;
  enabled: boolean;
  lastExecutionAt: Date | null;
  extractedCount: number;
  totalCount: number;
  progressPercent: number;
  avgDurationMs: number;
  executionCount: number;
  errorMessage: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

function toExtractionTaskResponse(task: ExtractionTask, datasourceName: string): ExtractionTaskResult {
  return {
    id: task.id,
    name: task.name,
    datasourceId: task.datasource_id,
    datasourceName,
    mode: task.mode,
    status: task.status,
    targetTable: task.target_table,
    incrementalColumn: task.incremental_column,
    lastIncrementalValue: task.last_incremental_value,
    schedule: task.schedule,
    enabled: task.enabled,
    lastExecutionAt: task.last_execution_at,
    extractedCount: task.extracted_count,
    totalCount: task.total_count,
    progressPercent: task.progress_percent,
    avgDurationMs: task.avg_duration_ms,
    executionCount: task.execution_count,
    errorMessage: task.error_message,
    createdBy: task.created_by,
    createdAt: task.created_at,
    updatedAt: task.updated_at,
  };
}

@Injectable()
export class ExtractionTaskService {
  constructor(
    @InjectRepository(ExtractionTask)
    private readonly taskRepository: Repository<ExtractionTask>,
    @InjectRepository(Datasource)
    private readonly datasourceRepository: Repository<Datasource>,
    @InjectRepository(ExtractionLog)
    private readonly logRepository: Repository<ExtractionLog>,
  ) {}

  async createTask(
    dto: CreateExtractionTaskDto,
    userId: string,
  ): Promise<ExtractionTaskResult> {
    // BR-5: Validate cron expression
    try {
      CronExpressionParser.parse(dto.schedule, { tz: 'UTC' });
    } catch {
      throw new UnprocessableEntityException({
        error: ERROR_CODES.EXTRACTION_INVALID_CRON,
        message: ERROR_MESSAGES.EXTRACTION_INVALID_CRON,
      });
    }

    // BR-3: Incremental mode requires incrementalColumn
    if (dto.mode === 'incremental' && !dto.incrementalColumn) {
      throw new UnprocessableEntityException({
        error: ERROR_CODES.EXTRACTION_INCREMENTAL_COLUMN_REQUIRED,
        message: ERROR_MESSAGES.EXTRACTION_INCREMENTAL_COLUMN_REQUIRED,
      });
    }

    // BR-6: Validate datasource exists and not soft-deleted
    const datasource = await this.datasourceRepository
      .createQueryBuilder('ds')
      .where('ds.id = :id', { id: dto.datasourceId })
      .andWhere('ds.deleted_at IS NULL')
      .getOne();

    if (!datasource) {
      throw new UnprocessableEntityException({
        error: ERROR_CODES.EXTRACTION_DATASOURCE_NOT_FOUND,
        message: ERROR_MESSAGES.EXTRACTION_DATASOURCE_NOT_FOUND,
      });
    }

    // BR-2: Name uniqueness check (exclude soft-deleted)
    const existing = await this.taskRepository
      .createQueryBuilder('task')
      .where('LOWER(task.name) = LOWER(:name)', { name: dto.name })
      .andWhere('task.deleted_at IS NULL')
      .getOne();

    if (existing) {
      throw new ConflictException({
        error: ERROR_CODES.EXTRACTION_NAME_EXISTS,
        message: ERROR_MESSAGES.EXTRACTION_NAME_EXISTS,
      });
    }

    // Create and save the task
    const task = this.taskRepository.create({
      name: dto.name,
      datasource_id: dto.datasourceId,
      mode: dto.mode,
      target_table: dto.targetTable,
      schedule: dto.schedule,
      incremental_column: dto.incrementalColumn ?? null,
      last_incremental_value: dto.lastIncrementalValue ?? null,
      status: 'scheduled',
      enabled: true,
      created_by: userId,
    });

    const saved = await this.taskRepository.save(task);

    return toExtractionTaskResponse(saved, datasource.name);
  }

  async findAll(query: ListExtractionTaskDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    const qb = this.taskRepository
      .createQueryBuilder('task')
      .leftJoinAndSelect('task.datasource', 'ds')
      .where('task.deleted_at IS NULL');

    if (query.search) {
      qb.andWhere('LOWER(task.name) LIKE :search', {
        search: `%${query.search.toLowerCase()}%`,
      });
    }

    if (query.status) {
      qb.andWhere('task.status = :status', { status: query.status });
    }

    if (query.mode) {
      qb.andWhere('task.mode = :mode', { mode: query.mode });
    }

    if (query.datasourceId) {
      qb.andWhere('task.datasource_id = :datasourceId', {
        datasourceId: query.datasourceId,
      });
    }

    qb.orderBy('task.updated_at', 'DESC');
    qb.skip((page - 1) * limit).take(limit);

    const [tasks, total] = await qb.getManyAndCount();

    // Summary: global stats (not affected by filters/pagination)
    const totalTasks = await this.taskRepository
      .createQueryBuilder('task')
      .where('task.deleted_at IS NULL')
      .getCount();

    const running = await this.taskRepository
      .createQueryBuilder('task')
      .where('task.deleted_at IS NULL')
      .andWhere('task.status = :status', { status: 'running' })
      .getCount();

    // Today in UTC+8 (Asia/Taipei)
    const now = new Date();
    const taipeiOffset = 8 * 60 * 60 * 1000; // UTC+8 in ms
    const taipeiNow = new Date(now.getTime() + taipeiOffset);
    const taipeiTodayStart = new Date(
      Date.UTC(taipeiNow.getUTCFullYear(), taipeiNow.getUTCMonth(), taipeiNow.getUTCDate()),
    );
    // Convert back to UTC for query
    const todayStartUTC = new Date(taipeiTodayStart.getTime() - taipeiOffset);
    const tomorrowStartUTC = new Date(todayStartUTC.getTime() + 24 * 60 * 60 * 1000);

    const todayLogs = await this.logRepository
      .createQueryBuilder('log')
      .select('log.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('log.started_at >= :start', { start: todayStartUTC })
      .andWhere('log.started_at < :end', { end: tomorrowStartUTC })
      .andWhere('log.status IN (:...statuses)', { statuses: ['completed', 'failed'] })
      .groupBy('log.status')
      .getRawMany();

    let todaySuccess = 0;
    let todayFailed = 0;
    for (const row of todayLogs) {
      if (row.status === 'completed') todaySuccess = Number(row.count);
      if (row.status === 'failed') todayFailed = Number(row.count);
    }

    const successRate =
      todaySuccess + todayFailed > 0
        ? Math.round((todaySuccess / (todaySuccess + todayFailed)) * 1000) / 10
        : 0;

    const data = tasks.map((task) => ({
      id: task.id,
      name: task.name,
      datasourceId: task.datasource_id,
      datasourceName: task.datasource?.name ?? '',
      mode: task.mode,
      status: task.status,
      schedule: task.schedule,
      lastExecutionAt: task.last_execution_at,
      extractedCount: task.extracted_count,
      totalCount: task.total_count,
      progressPercent: task.progress_percent,
      enabled: task.enabled,
      createdAt: task.created_at,
      updatedAt: task.updated_at,
    }));

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      summary: {
        totalTasks,
        running,
        todaySuccess,
        todayFailed,
        successRate,
      },
    };
  }
}
