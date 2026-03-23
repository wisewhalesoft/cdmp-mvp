import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { EtlPipelineExecutionService } from '../etl-pipeline-execution.service';
import { EtlPipeline } from '@/database/entities/etl-pipeline.entity';
import { EtlPipelineLog } from '@/database/entities/etl-pipeline-log.entity';
import { EtlPipelineVersion } from '@/database/entities/etl-pipeline-version.entity';

function makePipeline(overrides: Partial<EtlPipeline> = {}): EtlPipeline {
  return {
    id: 'pipeline-1',
    name: 'Test Pipeline',
    description: null,
    version: 1,
    step_count: 1,
    status: 'active',
    schedule: null,
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
    ...overrides,
  } as EtlPipeline;
}

function makeVersion(overrides: Partial<EtlPipelineVersion> = {}): EtlPipelineVersion {
  return {
    id: 'version-1',
    pipeline_id: 'pipeline-1',
    version: 1,
    definition: {
      nodes: [{ id: 'node-1', type: 'extract', position: { x: 0, y: 0 }, data: { taskId: 'task-1' } }],
      edges: [],
    },
    status: 'draft',
    change_summary: null,
    created_by: 'admin-user',
    created_at: new Date(),
    ...overrides,
  } as EtlPipelineVersion;
}

describe('EtlPipelineExecutionService', () => {
  let service: EtlPipelineExecutionService;

  const mockPipelineQb = {
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    getOne: vi.fn(),
  };

  const mockPipelineRepository = {
    createQueryBuilder: vi.fn().mockReturnValue(mockPipelineQb),
    save: vi.fn().mockImplementation((entity) => Promise.resolve(entity)),
  };

  const mockLogRepository = {
    create: vi.fn().mockImplementation((data) => ({ id: 'log-1', ...data })),
    save: vi.fn().mockImplementation((entity) => Promise.resolve(entity)),
    findOne: vi.fn(),
  };

  const mockVersionRepository = {
    findOne: vi.fn(),
    save: vi.fn().mockImplementation((entity) => Promise.resolve(entity)),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockPipelineRepository.createQueryBuilder.mockReturnValue(mockPipelineQb);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EtlPipelineExecutionService,
        { provide: getRepositoryToken(EtlPipeline), useValue: mockPipelineRepository },
        { provide: getRepositoryToken(EtlPipelineLog), useValue: mockLogRepository },
        { provide: getRepositoryToken(EtlPipelineVersion), useValue: mockVersionRepository },
      ],
    }).compile();

    service = module.get(EtlPipelineExecutionService);
  });

  // ===== Phase 2: Manual Execute + Negative Scenarios =====

  // TS-F030-001: 手動執行 active Pipeline → 202 + logId
  it('should return logId when executing active pipeline', async () => {
    mockPipelineQb.getOne.mockResolvedValue(makePipeline({ status: 'active' }));
    mockVersionRepository.findOne.mockResolvedValue(makeVersion());

    const result = await service.triggerExecute('pipeline-1', 'admin-user');

    expect(result.logId).toBe('log-1');
    expect(result.message).toBeTruthy();
  });

  // TS-F030-002: 手動執行建立 EtlPipelineLog（triggered_by=manual）
  it('should create log with triggered_by=manual for active pipeline', async () => {
    mockPipelineQb.getOne.mockResolvedValue(makePipeline({ status: 'active' }));
    mockVersionRepository.findOne.mockResolvedValue(makeVersion());

    await service.triggerExecute('pipeline-1', 'admin-user');

    expect(mockLogRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        pipeline_id: 'pipeline-1',
        triggered_by: 'manual',
        is_test_run: false,
        status: 'running',
        created_by: 'admin-user',
      }),
    );
  });

  // TS-F030-003: 手動執行後 Pipeline.status 更新為 running
  it('should update pipeline status to running after execute', async () => {
    const pipeline = makePipeline({ status: 'active' });
    mockPipelineQb.getOne.mockResolvedValue(pipeline);
    mockVersionRepository.findOne.mockResolvedValue(makeVersion());

    await service.triggerExecute('pipeline-1', 'admin-user');

    expect(mockPipelineRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'running' }),
    );
  });

  // TS-F030-016: 執行中 Pipeline 重複觸發 → 409
  it('should throw 409 when pipeline is already running', async () => {
    mockPipelineQb.getOne.mockResolvedValue(makePipeline({ status: 'running' }));

    await expect(service.triggerExecute('pipeline-1', 'admin-user'))
      .rejects
      .toThrow(ConflictException);
  });

  // TS-F030-017: 無 definition 的 Pipeline 執行 → 422
  it('should throw 422 when pipeline has no definition nodes', async () => {
    mockPipelineQb.getOne.mockResolvedValue(makePipeline({ status: 'active' }));
    mockVersionRepository.findOne.mockResolvedValue(
      makeVersion({ definition: { nodes: [], edges: [] } }),
    );

    await expect(service.triggerExecute('pipeline-1', 'admin-user'))
      .rejects
      .toThrow(UnprocessableEntityException);
  });

  // TS-F030-017b: definition 為 null
  it('should throw 422 when version has null definition', async () => {
    mockPipelineQb.getOne.mockResolvedValue(makePipeline({ status: 'active' }));
    mockVersionRepository.findOne.mockResolvedValue(null);

    await expect(service.triggerExecute('pipeline-1', 'admin-user'))
      .rejects
      .toThrow(UnprocessableEntityException);
  });

  // TS-F030-018: Pipeline 不存在 → 404
  it('should throw 404 when pipeline not found', async () => {
    mockPipelineQb.getOne.mockResolvedValue(null);

    await expect(service.triggerExecute('nonexistent', 'admin-user'))
      .rejects
      .toThrow(NotFoundException);
  });

  // ===== Phase 3: Test Execute + Retry =====

  // TS-F030-004: 重新執行 failed Pipeline → triggered_by=retry
  it('should set triggered_by=retry when executing failed pipeline', async () => {
    mockPipelineQb.getOne.mockResolvedValue(makePipeline({ status: 'failed' }));
    mockVersionRepository.findOne.mockResolvedValue(makeVersion());

    await service.triggerExecute('pipeline-1', 'admin-user');

    expect(mockLogRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ triggered_by: 'retry' }),
    );
  });

  // TS-F030-005: 測試執行 draft Pipeline → 202
  it('should return logId when test executing draft pipeline', async () => {
    mockPipelineQb.getOne.mockResolvedValue(makePipeline({ status: 'draft' }));
    mockVersionRepository.findOne.mockResolvedValue(makeVersion());

    const result = await service.triggerTest('pipeline-1', 'admin-user');

    expect(result.logId).toBe('log-1');
    expect(result.message).toBeTruthy();
  });

  // TS-F030-006: 測試執行建立 log（is_test_run=true）
  it('should create log with is_test_run=true and triggered_by=test', async () => {
    mockPipelineQb.getOne.mockResolvedValue(makePipeline({ status: 'draft' }));
    mockVersionRepository.findOne.mockResolvedValue(makeVersion());

    await service.triggerTest('pipeline-1', 'admin-user');

    expect(mockLogRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        triggered_by: 'test',
        is_test_run: true,
      }),
    );
  });

  // ===== Phase 4: Progress Query =====

  // TS-F030-013: 執行中查詢進度回傳完整欄位
  it('should return progress with all fields when pipeline is running', async () => {
    mockPipelineQb.getOne.mockResolvedValue(makePipeline({ status: 'running' }));
    mockLogRepository.findOne.mockResolvedValue({
      id: 'log-1',
      status: 'running',
      processed_count: 2,
      node_logs: JSON.stringify([
        { nodeId: 'node-1', nodeName: 'Extract', status: 'completed' },
        { nodeId: 'node-2', nodeName: 'NULL 處理', status: 'running' },
        { nodeId: 'node-3', nodeName: 'Load', status: 'pending' },
      ]),
    });

    const result = await service.getProgress('pipeline-1');

    expect(result.logId).toBe('log-1');
    expect(result.status).toBe('running');
    expect(result.processedCount).toBe(2);
    expect(result.totalCount).toBe(3);
    expect(result.currentNode).toBe('node-2');
    expect(result.currentNodeName).toBe('NULL 處理');
  });

  // TS-F030-013b: No log exists
  it('should return empty progress when no log exists', async () => {
    mockPipelineQb.getOne.mockResolvedValue(makePipeline({ status: 'active' }));
    mockLogRepository.findOne.mockResolvedValue(null);

    const result = await service.getProgress('pipeline-1');

    expect(result.logId).toBeNull();
    expect(result.status).toBeNull();
    expect(result.processedCount).toBe(0);
  });
});
