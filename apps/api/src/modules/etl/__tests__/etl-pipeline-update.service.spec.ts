import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  UnprocessableEntityException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { EtlPipelineService } from '../etl-pipeline.service';
import { EtlPipeline } from '@/database/entities/etl-pipeline.entity';
import { EtlPipelineLog } from '@/database/entities/etl-pipeline-log.entity';
import { EtlPipelineVersion } from '@/database/entities/etl-pipeline-version.entity';
import { User } from '@/database/entities/user.entity';
import { DataSource } from 'typeorm';
import { ERROR_CODES } from '@/common/errors/error-codes';

function makePipeline(overrides: Partial<EtlPipeline> = {}): EtlPipeline {
  return {
    id: 'p-001',
    name: '既有名稱',
    description: '既有描述',
    version: 1,
    step_count: 3,
    status: 'draft',
    schedule: null,
    last_execution_at: null,
    next_execution_at: null,
    processed_count: 0,
    avg_duration_ms: 0,
    execution_count: 0,
    enabled: false,
    created_by: 'admin-user',
    deleted_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  } as EtlPipeline;
}

describe('EtlPipelineService - updatePipeline (F093)', () => {
  let service: EtlPipelineService;

  // QueryBuilder used both for finding the pipeline (getOne) and the uniqueness check (getOne)
  const mockPipelineQb = {
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    getOne: vi.fn(),
    getCount: vi.fn(),
    select: vi.fn().mockReturnThis(),
    addSelect: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    take: vi.fn().mockReturnThis(),
    getManyAndCount: vi.fn(),
  };

  const mockPipelineRepository = {
    createQueryBuilder: vi.fn().mockReturnValue(mockPipelineQb),
    save: vi
      .fn()
      .mockImplementation((entity) => Promise.resolve({ ...entity, updated_at: new Date() })),
  };

  const mockLogRepository = {
    createQueryBuilder: vi.fn(),
  };

  const mockVersionRepository = {
    findOne: vi.fn(),
    save: vi.fn(),
    create: vi.fn(),
  };

  const mockUserRepository = {};

  const mockDataSource = {
    transaction: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    // clearAllMocks does NOT drain mockResolvedValueOnce queues — reset explicitly
    mockPipelineQb.getOne.mockReset();
    mockPipelineRepository.save.mockImplementation((entity) =>
      Promise.resolve({ ...entity, updated_at: new Date() }),
    );
    mockPipelineRepository.createQueryBuilder.mockReturnValue(mockPipelineQb);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EtlPipelineService,
        { provide: getRepositoryToken(EtlPipeline), useValue: mockPipelineRepository },
        { provide: getRepositoryToken(EtlPipelineLog), useValue: mockLogRepository },
        { provide: getRepositoryToken(EtlPipelineVersion), useValue: mockVersionRepository },
        { provide: getRepositoryToken(User), useValue: mockUserRepository },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get(EtlPipelineService);
  });

  /**
   * Helper: configure the pipeline query builder to first return the loaded pipeline,
   * then (for the uniqueness check) return `uniqueResult`.
   */
  function setupQueries(pipeline: EtlPipeline | null, uniqueResult: EtlPipeline | null = null) {
    mockPipelineQb.getOne
      .mockResolvedValueOnce(pipeline) // load pipeline
      .mockResolvedValueOnce(uniqueResult); // uniqueness check
  }

  // TS-F093-SVC-001: 僅更新名稱 — Happy Path
  it('TS-F093-SVC-001: should update only the name (PATCH semantics)', async () => {
    const pipeline = makePipeline({ status: 'draft', description: '既有描述', schedule: null });
    setupQueries(pipeline, null);

    const result = await service.updatePipeline('p-001', { name: '新名稱' });

    expect(result.name).toBe('新名稱');
    expect(mockPipelineRepository.save).toHaveBeenCalledTimes(1);
    const saved = mockPipelineRepository.save.mock.calls[0][0];
    expect(saved.name).toBe('新名稱');
    // description / schedule untouched
    expect(saved.description).toBe('既有描述');
    expect(saved.schedule).toBeNull();
    // version definition not touched
    expect(mockVersionRepository.save).not.toHaveBeenCalled();
    expect(mockVersionRepository.create).not.toHaveBeenCalled();
  });

  // TS-F093-SVC-002: 僅更新 schedule（5 欄位 cron）— Happy Path
  it('TS-F093-SVC-002: should update schedule with valid 5-field cron', async () => {
    const pipeline = makePipeline({ status: 'draft' });
    setupQueries(pipeline, null);

    const result = await service.updatePipeline('p-001', { schedule: '0 2 * * *' });

    expect(result.schedule).toBe('0 2 * * *');
    const saved = mockPipelineRepository.save.mock.calls[0][0];
    expect(saved.schedule).toBe('0 2 * * *');
  });

  // TS-F093-SVC-003: 更新 schedule（6 欄位 cron）— Happy Path
  it('TS-F093-SVC-003: should accept a 6-field cron', async () => {
    const pipeline = makePipeline({ status: 'draft' });
    setupQueries(pipeline, null);

    const result = await service.updatePipeline('p-001', { schedule: '0 0 2 * * *' });

    expect(result.schedule).toBe('0 0 2 * * *');
  });

  // TS-F093-SVC-004: 清除 schedule（傳 null）— Happy Path
  it('TS-F093-SVC-004: should clear schedule when null is passed', async () => {
    const pipeline = makePipeline({ status: 'draft', schedule: '0 2 * * *' });
    setupQueries(pipeline, null);

    const result = await service.updatePipeline('p-001', { schedule: null });

    expect(result.schedule).toBeNull();
    const saved = mockPipelineRepository.save.mock.calls[0][0];
    expect(saved.schedule).toBeNull();
  });

  // TS-F093-SVC-005: 清除 schedule（傳空字串）— Happy Path
  it('TS-F093-SVC-005: should normalize empty string schedule to null', async () => {
    const pipeline = makePipeline({ status: 'draft', schedule: '0 2 * * *' });
    setupQueries(pipeline, null);

    const result = await service.updatePipeline('p-001', { schedule: '' });

    expect(result.schedule).toBeNull();
    const saved = mockPipelineRepository.save.mock.calls[0][0];
    expect(saved.schedule).toBeNull();
  });

  // TS-F093-SVC-006: 同時更新名稱 + 描述 + schedule — Happy Path
  it('TS-F093-SVC-006: should update name + description + schedule together', async () => {
    const pipeline = makePipeline({ status: 'draft' });
    setupQueries(pipeline, null);

    const result = await service.updatePipeline('p-001', {
      name: 'A',
      description: 'B',
      schedule: '0 8 * * 1',
    });

    expect(result.name).toBe('A');
    expect(result.description).toBe('B');
    expect(result.schedule).toBe('0 8 * * 1');
    expect(result.id).toBe('p-001');
    expect(result.status).toBeDefined();
    expect(result.updatedAt).toBeDefined();
  });

  // TS-F093-SVC-007: Pipeline 不存在 → 404
  it('TS-F093-SVC-007: should throw 404 when pipeline does not exist', async () => {
    mockPipelineQb.getOne.mockResolvedValueOnce(null);

    await expect(service.updatePipeline('non-existent', { name: 'X' })).rejects.toThrow(
      NotFoundException,
    );

    try {
      mockPipelineQb.getOne.mockResolvedValueOnce(null);
      await service.updatePipeline('non-existent', { name: 'X' });
    } catch (e: any) {
      expect(e.response.error).toBe(ERROR_CODES.PIPELINE_NOT_FOUND);
    }
    expect(mockPipelineRepository.save).not.toHaveBeenCalled();
  });

  // TS-F093-SVC-008: Pipeline 已軟刪除 → 404 (query filters deleted_at IS NULL)
  it('TS-F093-SVC-008: should throw 404 when pipeline is soft-deleted', async () => {
    // soft-deleted → query returns null
    mockPipelineQb.getOne.mockResolvedValueOnce(null);

    await expect(service.updatePipeline('deleted-id', { name: 'X' })).rejects.toThrow(
      NotFoundException,
    );

    // verify the load query filters out soft-deleted rows
    expect(mockPipelineQb.andWhere).toHaveBeenCalledWith('p.deleted_at IS NULL');
  });

  // TS-F093-SVC-009: 名稱與另一個 Pipeline 衝突 → 409
  it('TS-F093-SVC-009: should throw 409 when name conflicts with another pipeline', async () => {
    const pipeline = makePipeline({ id: 'p-001', status: 'draft', name: '既有名稱' });
    const conflicting = makePipeline({ id: 'p-999', name: '衝突名稱' });
    setupQueries(pipeline, conflicting);

    await expect(service.updatePipeline('p-001', { name: '衝突名稱' })).rejects.toThrow(
      ConflictException,
    );

    try {
      setupQueries(pipeline, conflicting);
      await service.updatePipeline('p-001', { name: '衝突名稱' });
    } catch (e: any) {
      expect(e.response.error).toBe(ERROR_CODES.PIPELINE_NAME_EXISTS);
    }
    expect(mockPipelineRepository.save).not.toHaveBeenCalled();
  });

  // TS-F093-SVC-010: [OD-F093-03] 名稱改為自身目前名稱 → 允許（self-exclusion）
  it('TS-F093-SVC-010: should allow renaming to the pipeline\'s own current name (self-exclusion)', async () => {
    const pipeline = makePipeline({ id: 'p-001', status: 'draft', name: '既有名稱' });
    // uniqueness query must exclude self → returns null
    setupQueries(pipeline, null);

    const result = await service.updatePipeline('p-001', { name: '既有名稱' });

    expect(result.name).toBe('既有名稱');
    expect(mockPipelineRepository.save).toHaveBeenCalledTimes(1);

    // The uniqueness query must include a self-exclusion condition (id != :selfId)
    const selfExclusionApplied = mockPipelineQb.andWhere.mock.calls.some(
      (call) =>
        typeof call[0] === 'string' &&
        call[0].includes('id') &&
        call[0].includes('!='),
    );
    expect(selfExclusionApplied).toBe(true);

    // and the parameter must carry the pipeline's own id
    const selfIdParamPassed = mockPipelineQb.andWhere.mock.calls.some(
      (call) =>
        call[1] && Object.values(call[1]).includes('p-001'),
    );
    expect(selfIdParamPassed).toBe(true);
  });

  // TS-F093-SVC-011: Cron 欄位數不足（4 欄位）→ 422
  it('TS-F093-SVC-011: should throw 422 for 4-field cron', async () => {
    const pipeline = makePipeline({ status: 'draft' });
    // cron validation fails before any uniqueness query → load is the only getOne call
    mockPipelineQb.getOne.mockResolvedValue(pipeline);

    await expect(service.updatePipeline('p-001', { schedule: '0 2 * *' })).rejects.toThrow(
      UnprocessableEntityException,
    );

    try {
      await service.updatePipeline('p-001', { schedule: '0 2 * *' });
    } catch (e: any) {
      expect(e.response.error).toBe(ERROR_CODES.VALIDATION_INVALID_CRON);
    }
  });

  // TS-F093-SVC-012: Cron 欄位數過多（7 欄位）→ 422
  it('TS-F093-SVC-012: should throw 422 for 7-field cron', async () => {
    const pipeline = makePipeline({ status: 'draft' });
    setupQueries(pipeline, null);

    await expect(
      service.updatePipeline('p-001', { schedule: '0 2 * * * * *' }),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  // TS-F093-SVC-013: Cron 格式可解析欄位數但語意無效 → 422
  it('TS-F093-SVC-013: should throw 422 for cron with out-of-range values', async () => {
    const pipeline = makePipeline({ status: 'draft' });
    mockPipelineQb.getOne.mockResolvedValue(pipeline);

    await expect(
      service.updatePipeline('p-001', { schedule: '99 99 * * *' }),
    ).rejects.toThrow(UnprocessableEntityException);

    try {
      await service.updatePipeline('p-001', { schedule: '99 99 * * *' });
    } catch (e: any) {
      expect(e.response.error).toBe(ERROR_CODES.VALIDATION_INVALID_CRON);
    }
  });

  // TS-F093-SVC-014: 空白名稱（純空白字串）→ 驗證錯誤
  it('TS-F093-SVC-014: should reject a whitespace-only name', async () => {
    const pipeline = makePipeline({ status: 'draft' });
    setupQueries(pipeline, null);

    await expect(service.updatePipeline('p-001', { name: '   ' })).rejects.toThrow(
      UnprocessableEntityException,
    );
    expect(mockPipelineRepository.save).not.toHaveBeenCalled();
  });

  // TS-F093-SVC-017: 名稱 255 字元（邊界值）→ 允許
  it('TS-F093-SVC-017: should accept a 255-character name', async () => {
    const pipeline = makePipeline({ status: 'draft' });
    setupQueries(pipeline, null);

    const name = 'A'.repeat(255);
    const result = await service.updatePipeline('p-001', { name });

    expect(result.name).toBe(name);
  });

  // TS-F093-SVC-018: [OD-F093-01] status=running 時呼叫 → 409 PIPELINE_RUNNING
  it('TS-F093-SVC-018: should throw 409 PIPELINE_RUNNING when pipeline is running', async () => {
    const pipeline = makePipeline({ id: 'running-pipeline', status: 'running' });
    mockPipelineQb.getOne.mockResolvedValueOnce(pipeline);

    await expect(
      service.updatePipeline('running-pipeline', { name: '新名稱' }),
    ).rejects.toThrow(ConflictException);

    try {
      mockPipelineQb.getOne.mockResolvedValueOnce(pipeline);
      await service.updatePipeline('running-pipeline', { name: '新名稱' });
    } catch (e: any) {
      expect(e.response.error).toBe(ERROR_CODES.PIPELINE_RUNNING);
    }
    expect(mockPipelineRepository.save).not.toHaveBeenCalled();
  });

  // TS-F093-SVC-019: [OD-F093-02 = 選項 B] 更新 schedule 不觸碰 next_execution_at
  it('TS-F093-SVC-019: should NOT modify next_execution_at when updating schedule (OD-F093-02 resolved=B)', async () => {
    const existingNext = new Date('2026-06-01T02:00:00.000Z');
    const pipeline = makePipeline({
      status: 'draft',
      schedule: null,
      next_execution_at: existingNext,
    });
    setupQueries(pipeline, null);

    await service.updatePipeline('p-001', { schedule: '0 2 * * *' });

    const saved = mockPipelineRepository.save.mock.calls[0][0];
    // next_execution_at must be unchanged (scheduler computes triggering on-the-fly)
    expect(saved.next_execution_at).toBe(existingNext);
  });

  // TS-F093-SVC-020: 清除 schedule 不觸碰 next_execution_at (OD-F093-02 resolved=B, out of scope)
  it('TS-F093-SVC-020: should NOT modify next_execution_at when clearing schedule (out of scope)', async () => {
    const existingNext = new Date('2026-06-01T02:00:00.000Z');
    const pipeline = makePipeline({
      status: 'draft',
      schedule: '0 2 * * *',
      next_execution_at: existingNext,
    });
    setupQueries(pipeline, null);

    await service.updatePipeline('p-001', { schedule: null });

    const saved = mockPipelineRepository.save.mock.calls[0][0];
    expect(saved.next_execution_at).toBe(existingNext);
  });
});
