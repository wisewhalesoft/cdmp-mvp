import { Injectable, ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { CronExpressionParser } from 'cron-parser';
import { EtlPipeline } from '@/database/entities/etl-pipeline.entity';
import { EtlPipelineLog } from '@/database/entities/etl-pipeline-log.entity';
import { EtlPipelineVersion } from '@/database/entities/etl-pipeline-version.entity';
import { User } from '@/database/entities/user.entity';
import { ERROR_CODES, ERROR_MESSAGES } from '@/common/errors/error-codes';
import { ListPipelineDto } from './dto/list-pipeline.dto';
import { CreatePipelineDto } from './dto/create-pipeline.dto';

function getTodayRangeUTC() {
  const now = new Date();
  const taipeiOffset = 8 * 60 * 60 * 1000;
  const taipeiNow = new Date(now.getTime() + taipeiOffset);
  const taipeiTodayStart = new Date(
    Date.UTC(taipeiNow.getUTCFullYear(), taipeiNow.getUTCMonth(), taipeiNow.getUTCDate()),
  );
  const todayStartUTC = new Date(taipeiTodayStart.getTime() - taipeiOffset);
  const tomorrowStartUTC = new Date(todayStartUTC.getTime() + 24 * 60 * 60 * 1000);
  return { todayStartUTC, tomorrowStartUTC };
}

@Injectable()
export class EtlPipelineService {
  constructor(
    @InjectRepository(EtlPipeline)
    private readonly pipelineRepository: Repository<EtlPipeline>,
    @InjectRepository(EtlPipelineLog)
    private readonly logRepository: Repository<EtlPipelineLog>,
    @InjectRepository(EtlPipelineVersion)
    private readonly versionRepository: Repository<EtlPipelineVersion>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreatePipelineDto, userId: string) {
    // Validate cron expression if provided (BR-4: must be 5 or 6 fields)
    if (dto.schedule) {
      const fields = dto.schedule.trim().split(/\s+/).length;
      if (fields < 5 || fields > 6) {
        throw new UnprocessableEntityException({
          error: ERROR_CODES.VALIDATION_INVALID_CRON,
          message: ERROR_MESSAGES.VALIDATION_INVALID_CRON,
        });
      }
      try {
        CronExpressionParser.parse(dto.schedule, { tz: 'UTC' });
      } catch {
        throw new UnprocessableEntityException({
          error: ERROR_CODES.VALIDATION_INVALID_CRON,
          message: ERROR_MESSAGES.VALIDATION_INVALID_CRON,
        });
      }
    }

    // Check name uniqueness (only among non-deleted)
    const existingPipeline = await this.pipelineRepository
      .createQueryBuilder('p')
      .where('p.name = :name', { name: dto.name })
      .andWhere('p.deleted_at IS NULL')
      .getOne();

    if (existingPipeline) {
      throw new ConflictException({
        error: ERROR_CODES.PIPELINE_NAME_EXISTS,
        message: ERROR_MESSAGES.PIPELINE_NAME_EXISTS,
      });
    }

    // Use transaction to create pipeline + initial version atomically
    return this.dataSource.transaction(async (manager) => {
      const pipelineRepo = manager.getRepository(EtlPipeline);
      const versionRepo = manager.getRepository(EtlPipelineVersion);

      const pipeline = pipelineRepo.create({
        name: dto.name,
        description: dto.description ?? null,
        schedule: dto.schedule ?? null,
        status: 'draft',
        version: 1,
        step_count: 0,
        enabled: false,
        processed_count: 0,
        avg_duration_ms: 0,
        execution_count: 0,
        created_by: userId,
      });
      const savedPipeline = await pipelineRepo.save(pipeline);

      // Create initial EtlPipelineVersion (v1, draft)
      const version = versionRepo.create({
        pipeline_id: savedPipeline.id,
        version: 1,
        status: 'draft',
        definition: { nodes: [], edges: [] },
        created_by: userId,
      });
      await versionRepo.save(version);

      return {
        id: savedPipeline.id,
        name: savedPipeline.name,
        description: savedPipeline.description,
        version: savedPipeline.version,
        stepCount: savedPipeline.step_count,
        status: savedPipeline.status,
        schedule: savedPipeline.schedule,
        enabled: savedPipeline.enabled,
        createdBy: savedPipeline.created_by,
        createdAt: savedPipeline.created_at.toISOString(),
        updatedAt: savedPipeline.updated_at.toISOString(),
      };
    });
  }

  async getStats() {
    const baseQb = () =>
      this.pipelineRepository
        .createQueryBuilder('p')
        .where('p.deleted_at IS NULL');

    const total = await baseQb().getCount();

    const active = await baseQb()
      .andWhere('p.status = :s', { s: 'active' })
      .getCount();

    const running = await baseQb()
      .andWhere('p.status = :s', { s: 'running' })
      .getCount();

    const draft = await baseQb()
      .andWhere('p.status = :s', { s: 'draft' })
      .getCount();

    // todayProcessed: SUM of processed_count from pipeline logs for today (UTC+8)
    const { todayStartUTC, tomorrowStartUTC } = getTodayRangeUTC();

    const result = await this.logRepository
      .createQueryBuilder('log')
      .select('COALESCE(SUM(log.processed_count), 0)', 'total')
      .where('log.started_at >= :start', { start: todayStartUTC })
      .andWhere('log.started_at < :end', { end: tomorrowStartUTC })
      .andWhere('log.is_test_run = :isTest', { isTest: false })
      .getRawOne();

    const todayProcessed = Number(result?.total ?? 0);

    return { total, active, running, draft, todayProcessed };
  }

  async findAll(query: ListPipelineDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;

    const qb = this.pipelineRepository
      .createQueryBuilder('p')
      .leftJoin('p.creator', 'user')
      .addSelect(['user.name'])
      .where('p.deleted_at IS NULL');

    if (query.status) {
      qb.andWhere('p.status = :status', { status: query.status });
    }

    if (query.keyword) {
      qb.andWhere('LOWER(p.name) LIKE :keyword', {
        keyword: `%${query.keyword.toLowerCase()}%`,
      });
    }

    qb.orderBy('p.created_at', 'DESC');
    qb.skip((page - 1) * pageSize).take(pageSize);

    const [pipelines, total] = await qb.getManyAndCount();
    const totalPages = total > 0 ? Math.ceil(total / pageSize) : 0;

    const data = pipelines.map((p) => ({
      id: p.id,
      name: p.name,
      version: p.version,
      stepCount: p.step_count,
      status: p.status,
      schedule: p.schedule,
      lastExecutionAt: p.last_execution_at?.toISOString() ?? null,
      nextExecutionAt: p.next_execution_at?.toISOString() ?? null,
      processedCount: p.processed_count,
      createdBy: p.creator?.name ?? '',
      createdAt: p.created_at.toISOString(),
    }));

    return {
      data,
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
      },
    };
  }
}
