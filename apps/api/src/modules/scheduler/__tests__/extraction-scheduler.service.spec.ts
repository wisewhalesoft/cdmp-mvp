import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Logger } from '@nestjs/common';
import { ExtractionSchedulerService } from '../extraction-scheduler.service';
import { ExtractionExecutionService } from '@/modules/extraction-task/extraction-execution.service';
import { ExtractionTask } from '@/database/entities/extraction-task.entity';

function makeTask(overrides: Partial<ExtractionTask> = {}): ExtractionTask {
  return {
    id: 'task-1',
    name: 'Test Task',
    datasource_id: 'ds-1',
    mode: 'full',
    status: 'scheduled',
    source_table: 'users',
    source_schema: null,
    raw_table_name: null,
    incremental_column: null,
    last_incremental_value: null,
    schedule: '0 2 * * *',
    last_execution_at: null,
    extracted_count: 0,
    total_count: 0,
    progress_percent: 0,
    avg_duration_ms: 0,
    execution_count: 0,
    error_message: null,
    enabled: true,
    created_by: 'user-abc',
    created_at: new Date(),
    updated_at: new Date(),
    deleted_at: null,
    ...overrides,
  } as ExtractionTask;
}

describe('ExtractionSchedulerService', () => {
  let service: ExtractionSchedulerService;
  let mockExecutionService: { triggerRun: ReturnType<typeof vi.fn> };

  const mockQueryBuilder = {
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    getMany: vi.fn(),
  };

  const mockTaskRepository = {
    createQueryBuilder: vi.fn().mockReturnValue(mockQueryBuilder),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    mockExecutionService = {
      triggerRun: vi.fn().mockResolvedValue({ logId: 'log-1' }),
    };

    mockTaskRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExtractionSchedulerService,
        {
          provide: ExtractionExecutionService,
          useValue: mockExecutionService,
        },
        {
          provide: getRepositoryToken(ExtractionTask),
          useValue: mockTaskRepository,
        },
      ],
    }).compile();

    service = module.get<ExtractionSchedulerService>(ExtractionSchedulerService);
  });

  // TS-F023-001: 排程觸發執行
  it('should trigger execution for task matching cron schedule', async () => {
    const task = makeTask({ schedule: '0 2 * * *' });
    mockQueryBuilder.getMany.mockResolvedValue([task]);

    // fakeNow = 2026-03-18T02:00:00Z matches "0 2 * * *"
    await service.scanAndExecute(new Date('2026-03-18T02:00:00Z'));

    expect(mockExecutionService.triggerRun).toHaveBeenCalledWith(
      'task-1',
      'schedule',
      'user-abc',
    );
  });

  // TS-F023-002: ExtractionLog.createdBy 為任務建立者
  it('should use task.created_by as userId in triggerRun', async () => {
    const task = makeTask({ created_by: 'owner-xyz', schedule: '0 2 * * *' });
    mockQueryBuilder.getMany.mockResolvedValue([task]);

    await service.scanAndExecute(new Date('2026-03-18T02:00:00Z'));

    expect(mockExecutionService.triggerRun).toHaveBeenCalledWith(
      expect.any(String),
      'schedule',
      'owner-xyz',
    );
  });

  // TS-F023-003: 多任務同時到達排程時間
  it('should trigger multiple tasks when all match the schedule', async () => {
    const taskA = makeTask({ id: 'task-a', schedule: '0 2 * * *', created_by: 'user-a' });
    const taskB = makeTask({ id: 'task-b', schedule: '0 2 * * *', created_by: 'user-b' });
    mockQueryBuilder.getMany.mockResolvedValue([taskA, taskB]);

    await service.scanAndExecute(new Date('2026-03-18T02:00:00Z'));

    expect(mockExecutionService.triggerRun).toHaveBeenCalledTimes(2);
    expect(mockExecutionService.triggerRun).toHaveBeenCalledWith('task-a', 'schedule', 'user-a');
    expect(mockExecutionService.triggerRun).toHaveBeenCalledWith('task-b', 'schedule', 'user-b');
  });

  // TS-F023-004: 跳過停用任務 (enabled=false filtered by query)
  it('should not trigger disabled tasks (filtered by DB query)', async () => {
    // The query filters enabled=false, so repository returns empty
    mockQueryBuilder.getMany.mockResolvedValue([]);

    await service.scanAndExecute(new Date('2026-03-18T02:00:00Z'));

    expect(mockExecutionService.triggerRun).not.toHaveBeenCalled();
  });

  // TS-F023-005: 跳過執行中任務 (status='running' filtered by query)
  it('should not trigger running tasks (filtered by DB query)', async () => {
    mockQueryBuilder.getMany.mockResolvedValue([]);

    await service.scanAndExecute(new Date('2026-03-18T02:00:00Z'));

    expect(mockExecutionService.triggerRun).not.toHaveBeenCalled();
  });

  // TS-F023-006: 排除軟刪除任務
  it('should query with correct filter conditions (enabled, not deleted, not running)', async () => {
    mockQueryBuilder.getMany.mockResolvedValue([]);

    await service.scanAndExecute(new Date('2026-03-18T02:00:00Z'));

    expect(mockTaskRepository.createQueryBuilder).toHaveBeenCalledWith('task');
    expect(mockQueryBuilder.where).toHaveBeenCalledWith('task.enabled = :enabled', { enabled: true });
    expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('task.deleted_at IS NULL');
    expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('task.status != :status', { status: 'running' });
  });

  // TS-F023-007: DB 不可用時記錄錯誤，不拋出例外
  it('should log error and not throw when DB query fails', async () => {
    const errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    mockQueryBuilder.getMany.mockRejectedValue(new Error('DB connection lost'));

    await expect(service.scanAndExecute(new Date('2026-03-18T02:00:00Z'))).resolves.not.toThrow();

    expect(errorSpy).toHaveBeenCalled();
    expect(mockExecutionService.triggerRun).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  // TS-F023-008: cron 不符合觸發時間則跳過
  it('should not trigger task when cron does not match current time', async () => {
    const task = makeTask({ schedule: '0 2 * * *' });
    mockQueryBuilder.getMany.mockResolvedValue([task]);

    // fakeNow = 03:00 does NOT match "0 2 * * *"
    await service.scanAndExecute(new Date('2026-03-18T03:00:00Z'));

    expect(mockExecutionService.triggerRun).not.toHaveBeenCalled();
  });

  // Additional: single task failure should not affect others
  it('should continue processing remaining tasks when one triggerRun fails', async () => {
    const taskA = makeTask({ id: 'task-a', schedule: '0 2 * * *', created_by: 'user-a' });
    const taskB = makeTask({ id: 'task-b', schedule: '0 2 * * *', created_by: 'user-b' });
    mockQueryBuilder.getMany.mockResolvedValue([taskA, taskB]);

    const errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    mockExecutionService.triggerRun
      .mockRejectedValueOnce(new Error('task-a failed'))
      .mockResolvedValueOnce({ logId: 'log-2' });

    await service.scanAndExecute(new Date('2026-03-18T02:00:00Z'));

    expect(mockExecutionService.triggerRun).toHaveBeenCalledTimes(2);
    expect(mockExecutionService.triggerRun).toHaveBeenCalledWith('task-b', 'schedule', 'user-b');
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
