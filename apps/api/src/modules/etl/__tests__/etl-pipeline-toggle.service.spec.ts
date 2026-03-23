import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EtlPipelineService } from '../etl-pipeline.service';
import { EtlPipeline } from '@/database/entities/etl-pipeline.entity';
import { EtlPipelineLog } from '@/database/entities/etl-pipeline-log.entity';
import { EtlPipelineVersion } from '@/database/entities/etl-pipeline-version.entity';
import { User } from '@/database/entities/user.entity';
import { DataSource } from 'typeorm';
import { ERROR_CODES } from '@/common/errors/error-codes';

function makePipeline(overrides: Partial<EtlPipeline> = {}): EtlPipeline {
  return {
    id: 'pipeline-1',
    name: 'Test Pipeline',
    description: null,
    version: 1,
    step_count: 3,
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
    ...overrides,
  } as EtlPipeline;
}

describe('EtlPipelineService - togglePipeline (F031)', () => {
  let service: EtlPipelineService;

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
    save: vi.fn().mockImplementation((entity) => Promise.resolve({ ...entity, updated_at: new Date() })),
  };

  const mockLogQb = {
    select: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    getRawOne: vi.fn(),
  };

  const mockLogRepository = {
    createQueryBuilder: vi.fn().mockReturnValue(mockLogQb),
  };

  const mockVersionRepository = {
    findOne: vi.fn(),
  };

  const mockUserRepository = {};

  const mockDataSource = {
    transaction: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
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

  // TS-F031-001: 停用 active Pipeline → status=disabled, enabled=false
  it('should disable an active pipeline and set status=disabled, enabled=false', async () => {
    const pipeline = makePipeline({ status: 'active', enabled: true });
    mockPipelineQb.getOne.mockResolvedValue(pipeline);

    const result = await service.togglePipeline('pipeline-1', false);

    expect(result.status).toBe('disabled');
    expect(result.enabled).toBe(false);
    expect(mockPipelineRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'disabled', enabled: false }),
    );
  });

  // TS-F031-002: 停用 active Pipeline 後 DB 狀態正確（排程引擎自然排除）
  it('should persist disabled state in DB so scheduler excludes it', async () => {
    const pipeline = makePipeline({ status: 'active', enabled: true, schedule: '0 2 * * *' });
    mockPipelineQb.getOne.mockResolvedValue(pipeline);

    await service.togglePipeline('pipeline-1', false);

    const savedEntity = mockPipelineRepository.save.mock.calls[0][0];
    expect(savedEntity.enabled).toBe(false);
    expect(savedEntity.status).toBe('disabled');
  });

  // TS-F031-003: 啟用 disabled Pipeline（有 published 版本）→ status=active, enabled=true
  it('should enable a disabled pipeline with published version', async () => {
    const pipeline = makePipeline({ status: 'disabled', enabled: false });
    mockPipelineQb.getOne.mockResolvedValue(pipeline);
    mockVersionRepository.findOne.mockResolvedValue({ id: 'v-1', status: 'published' });

    const result = await service.togglePipeline('pipeline-1', true);

    expect(result.status).toBe('active');
    expect(result.enabled).toBe(true);
  });

  // TS-F031-004: 啟用 disabled Pipeline 後 DB 狀態正確（排程引擎自然包含）
  it('should persist active state in DB so scheduler includes it', async () => {
    const pipeline = makePipeline({ status: 'disabled', enabled: false, schedule: '0 2 * * *' });
    mockPipelineQb.getOne.mockResolvedValue(pipeline);
    mockVersionRepository.findOne.mockResolvedValue({ id: 'v-1', status: 'published' });

    await service.togglePipeline('pipeline-1', true);

    const savedEntity = mockPipelineRepository.save.mock.calls[0][0];
    expect(savedEntity.enabled).toBe(true);
    expect(savedEntity.status).toBe('active');
  });

  // TS-F031-005: 停用 failed Pipeline → status=disabled, enabled=false
  it('should disable a failed pipeline', async () => {
    const pipeline = makePipeline({ status: 'failed', enabled: true });
    mockPipelineQb.getOne.mockResolvedValue(pipeline);

    const result = await service.togglePipeline('pipeline-1', false);

    expect(result.status).toBe('disabled');
    expect(result.enabled).toBe(false);
  });

  // TS-F031-006: 停用無排程 Pipeline → status=disabled, 無副作用
  it('should disable a pipeline without schedule', async () => {
    const pipeline = makePipeline({ status: 'active', enabled: true, schedule: null });
    mockPipelineQb.getOne.mockResolvedValue(pipeline);

    const result = await service.togglePipeline('pipeline-1', false);

    expect(result.status).toBe('disabled');
    expect(result.enabled).toBe(false);
  });

  // TS-F031-007: 草稿 Pipeline 啟用 → 400 PIPELINE_DRAFT_CANNOT_ENABLE
  it('should throw BadRequestException when enabling a draft pipeline', async () => {
    const pipeline = makePipeline({ status: 'draft', enabled: false });
    mockPipelineQb.getOne.mockResolvedValue(pipeline);
    mockVersionRepository.findOne.mockResolvedValue(null);

    await expect(service.togglePipeline('pipeline-1', true)).rejects.toThrow(BadRequestException);

    try {
      await service.togglePipeline('pipeline-1', true);
    } catch (e: any) {
      expect(e.response.error).toBe(ERROR_CODES.PIPELINE_DRAFT_CANNOT_ENABLE);
    }
  });

  // TS-F031-008: Pipeline 不存在 → 404 PIPELINE_NOT_FOUND
  it('should throw NotFoundException when pipeline does not exist', async () => {
    mockPipelineQb.getOne.mockResolvedValue(null);

    await expect(service.togglePipeline('nonexistent', true)).rejects.toThrow(NotFoundException);
  });

  // TS-F031-009: 已軟刪除 Pipeline → 404 PIPELINE_NOT_FOUND
  it('should throw NotFoundException for soft-deleted pipeline', async () => {
    // The query already filters deleted_at IS NULL, so getOne returns null
    mockPipelineQb.getOne.mockResolvedValue(null);

    await expect(service.togglePipeline('deleted-pipeline', false)).rejects.toThrow(NotFoundException);
  });

  // TS-F031-010: 冪等性 — 已 disabled 再送 enabled=false → 200
  it('should be idempotent when disabling an already disabled pipeline', async () => {
    const pipeline = makePipeline({ status: 'disabled', enabled: false });
    mockPipelineQb.getOne.mockResolvedValue(pipeline);

    const result = await service.togglePipeline('pipeline-1', false);

    expect(result.status).toBe('disabled');
    expect(result.enabled).toBe(false);
  });

  // TS-F031-011: 回傳格式包含必要欄位
  it('should return id, name, status, enabled, schedule, updatedAt', async () => {
    const pipeline = makePipeline({ status: 'active', enabled: true, schedule: '0 2 * * *' });
    mockPipelineQb.getOne.mockResolvedValue(pipeline);

    const result = await service.togglePipeline('pipeline-1', false);

    expect(result).toHaveProperty('id');
    expect(result).toHaveProperty('name');
    expect(result).toHaveProperty('status');
    expect(result).toHaveProperty('enabled');
    expect(result).toHaveProperty('schedule');
    expect(result).toHaveProperty('updatedAt');
  });
});
