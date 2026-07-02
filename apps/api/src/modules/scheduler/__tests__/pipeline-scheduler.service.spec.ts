import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Logger } from '@nestjs/common';
import { PipelineSchedulerService } from '../pipeline-scheduler.service';
import { EtlPipelineExecutionService } from '@/modules/etl/etl-pipeline-execution.service';
import { EtlPipeline } from '@/database/entities/etl-pipeline.entity';

function makePipeline(overrides: Partial<EtlPipeline> = {}): EtlPipeline {
  return {
    id: 'pipeline-1',
    name: 'Test Pipeline',
    description: null,
    version: 1,
    step_count: 1,
    status: 'active',
    schedule: '0 2 * * *',
    last_execution_at: null,
    next_execution_at: null,
    processed_count: 0,
    avg_duration_ms: 0,
    execution_count: 0,
    enabled: true,
    created_by: 'admin-user',
    deleted_at: null,
    created_at: new Date(),
    updated_at: new Date(),
  } as EtlPipeline;
}

describe('PipelineSchedulerService', () => {
  let service: PipelineSchedulerService;
  let mockExecutionService: { triggerSchedule: ReturnType<typeof vi.fn> };

  const mockQueryBuilder = {
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    getMany: vi.fn(),
  };

  const mockPipelineRepository = {
    createQueryBuilder: vi.fn().mockReturnValue(mockQueryBuilder),
  };

  beforeEach(async () => {
    vi.restoreAllMocks();

    mockExecutionService = {
      triggerSchedule: vi.fn().mockResolvedValue({ logId: 'log-1', message: 'ok' }),
    };

    mockQueryBuilder.where.mockReturnThis();
    mockQueryBuilder.andWhere.mockReturnThis();
    mockQueryBuilder.getMany.mockResolvedValue([]);
    mockPipelineRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PipelineSchedulerService,
        {
          provide: EtlPipelineExecutionService,
          useValue: mockExecutionService,
        },
        {
          provide: getRepositoryToken(EtlPipeline),
          useValue: mockPipelineRepository,
        },
      ],
    }).compile();

    service = module.get(PipelineSchedulerService);
  });

  // TS-F030-009: 排程時間到達自動觸發執行
  it('should trigger execution for pipeline matching cron schedule', async () => {
    const pipeline = makePipeline({ schedule: '0 2 * * *' });
    mockQueryBuilder.getMany.mockResolvedValue([pipeline]);

    await service.scanAndExecute(new Date('2026-01-01T02:00:00+08:00'));

    expect(mockExecutionService.triggerSchedule).toHaveBeenCalledWith(
      'pipeline-1',
      'admin-user',
    );
  });

  // TS-F030-010: 排程觸發使用 pipeline.created_by 作為 userId
  it('should call triggerSchedule with pipeline id and created_by', async () => {
    const pipeline = makePipeline({ schedule: '0 2 * * *' });
    mockQueryBuilder.getMany.mockResolvedValue([pipeline]);

    await service.scanAndExecute(new Date('2026-01-01T02:00:00+08:00'));

    expect(mockExecutionService.triggerSchedule).toHaveBeenCalledWith(
      pipeline.id,
      pipeline.created_by,
    );
  });

  // TS-F030-011: 排程跳過執行中的 Pipeline (status=running filtered by query)
  it('should only query active pipelines (running excluded by DB filter)', async () => {
    mockQueryBuilder.getMany.mockResolvedValue([]);

    await service.scanAndExecute(new Date('2026-01-01T02:00:00+08:00'));

    expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
      'p.status = :status',
      { status: 'active' },
    );
    expect(mockExecutionService.triggerSchedule).not.toHaveBeenCalled();
  });

  // TS-F030-012: draft Pipeline 不被排程觸發 (only active pipelines queried)
  it('should not trigger draft pipelines (filtered by status=active query)', async () => {
    // Draft pipelines are not returned by the query since we filter status='active'
    mockQueryBuilder.getMany.mockResolvedValue([]);

    await service.scanAndExecute(new Date('2026-01-01T02:00:00+08:00'));

    expect(mockExecutionService.triggerSchedule).not.toHaveBeenCalled();
  });

  it('should not trigger when cron does not match current time', async () => {
    const pipeline = makePipeline({ schedule: '0 2 * * *' });
    mockQueryBuilder.getMany.mockResolvedValue([pipeline]);

    await service.scanAndExecute(new Date('2026-01-01T03:00:00+08:00'));

    expect(mockExecutionService.triggerSchedule).not.toHaveBeenCalled();
  });

  it('should log error and not throw when DB query fails', async () => {
    const errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    mockQueryBuilder.getMany.mockRejectedValue(new Error('DB error'));

    await expect(service.scanAndExecute(new Date())).resolves.not.toThrow();

    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('should continue processing when one pipeline triggerSchedule fails', async () => {
    const pA = makePipeline({ id: 'p-a', schedule: '0 2 * * *', created_by: 'user-a' });
    const pB = makePipeline({ id: 'p-b', schedule: '0 2 * * *', created_by: 'user-b' });
    mockQueryBuilder.getMany.mockResolvedValue([pA, pB]);

    const errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    mockExecutionService.triggerSchedule
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce({ logId: 'log-2', message: 'ok' });

    await service.scanAndExecute(new Date('2026-01-01T02:00:00+08:00'));

    expect(mockExecutionService.triggerSchedule).toHaveBeenCalledTimes(2);
    errorSpy.mockRestore();
  });
});
