import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EtlPipeline } from '@/database/entities/etl-pipeline.entity';
import { EtlPipelineLog } from '@/database/entities/etl-pipeline-log.entity';
import { User } from '@/database/entities/user.entity';
import { ListPipelineDto } from './dto/list-pipeline.dto';

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
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

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
