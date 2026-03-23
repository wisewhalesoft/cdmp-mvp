import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UnprocessableEntityException, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { EtlPipelineService } from '../etl-pipeline.service';
import { EtlPipeline } from '@/database/entities/etl-pipeline.entity';
import { EtlPipelineLog } from '@/database/entities/etl-pipeline-log.entity';
import { EtlPipelineVersion } from '@/database/entities/etl-pipeline-version.entity';
import { User } from '@/database/entities/user.entity';
import { DataSource } from 'typeorm';
import { ERROR_CODES } from '@/common/errors/error-codes';

function makePipeline(overrides: Partial<EtlPipeline> = {}): EtlPipeline {
  return {
    id: 'pipeline-a',
    name: 'Test Pipeline',
    description: null,
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

function makeVersion(overrides: Partial<EtlPipelineVersion> = {}): EtlPipelineVersion {
  return {
    id: 'version-testing',
    pipeline_id: 'pipeline-a',
    version: 2,
    definition: { nodes: [], edges: [] },
    status: 'testing',
    change_summary: '新功能',
    created_by: 'admin-user',
    published_at: null,
    created_at: new Date(),
    ...overrides,
  } as EtlPipelineVersion;
}

describe('EtlPipelineService - publishVersion (F037)', () => {
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
    save: vi.fn().mockImplementation((entity) => Promise.resolve({ ...entity })),
  };

  const mockUserRepository = {};

  // Track saves within transaction
  let transactionPipelineSave: ReturnType<typeof vi.fn>;
  let transactionVersionSave: ReturnType<typeof vi.fn>;

  const mockDataSource = {
    transaction: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockPipelineRepository.createQueryBuilder.mockReturnValue(mockPipelineQb);

    transactionPipelineSave = vi.fn().mockImplementation((entity) => Promise.resolve({ ...entity, updated_at: new Date() }));
    transactionVersionSave = vi.fn().mockImplementation((entity) => Promise.resolve({ ...entity }));

    // Default: transaction executes callback with a mock manager
    mockDataSource.transaction.mockImplementation(async (cb: any) => {
      const manager = {
        getRepository: (entity: any) => {
          if (entity === EtlPipeline) return { save: transactionPipelineSave };
          if (entity === EtlPipelineVersion) return { save: transactionVersionSave };
          return {};
        },
      };
      return cb(manager);
    });

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

  // TS-F037-001: 發布 testing 版本 → status=published
  it('should publish a testing version: status=published, published_at set, pipeline version updated', async () => {
    const pipeline = makePipeline({ id: 'pipeline-a', version: 1 });
    const version = makeVersion({ id: 'v-uuid', pipeline_id: 'pipeline-a', version: 2, status: 'testing' });

    mockPipelineQb.getOne.mockResolvedValue(pipeline);
    mockVersionRepository.findOne.mockResolvedValue(version);

    await service.publishVersion('pipeline-a', 'v-uuid');

    // Version save called with status=published and published_at set
    expect(transactionVersionSave).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'published' }),
    );
    const savedVersion = transactionVersionSave.mock.calls[0][0];
    expect(savedVersion.published_at).toBeInstanceOf(Date);

    // Pipeline save called with version=2
    expect(transactionPipelineSave).toHaveBeenCalledWith(
      expect.objectContaining({ version: 2 }),
    );
  });

  // TS-F037-002: 發布後 EtlPipeline.version 更新為正確版本號
  it('should update EtlPipeline.version from 2 to 3 when publishing version 3', async () => {
    const pipeline = makePipeline({ id: 'pipeline-a', version: 2 });
    const version = makeVersion({ pipeline_id: 'pipeline-a', version: 3, status: 'testing' });

    mockPipelineQb.getOne.mockResolvedValue(pipeline);
    mockVersionRepository.findOne.mockResolvedValue(version);

    await service.publishVersion('pipeline-a', version.id);

    const savedPipeline = transactionPipelineSave.mock.calls[0][0];
    expect(savedPipeline.version).toBe(3);
  });

  // TS-F037-003: 發布操作在同一 Transaction 中執行
  it('should execute version save and pipeline save within the same transaction', async () => {
    const pipeline = makePipeline();
    const version = makeVersion({ status: 'testing' });

    mockPipelineQb.getOne.mockResolvedValue(pipeline);
    mockVersionRepository.findOne.mockResolvedValue(version);

    await service.publishVersion('pipeline-a', version.id);

    // transaction was called exactly once
    expect(mockDataSource.transaction).toHaveBeenCalledTimes(1);
    // Both saves happened inside the transaction callback
    expect(transactionVersionSave).toHaveBeenCalledTimes(1);
    expect(transactionPipelineSave).toHaveBeenCalledTimes(1);
  });

  // TS-F037-004: 發布成功回傳正確 response 欄位
  it('should return correct response fields after successful publish', async () => {
    const pipeline = makePipeline({ id: 'pipeline-a', version: 1 });
    const version = makeVersion({
      id: 'v-uuid',
      pipeline_id: 'pipeline-a',
      version: 2,
      status: 'testing',
      change_summary: '新功能',
    });

    mockPipelineQb.getOne.mockResolvedValue(pipeline);
    mockVersionRepository.findOne.mockResolvedValue(version);

    const result = await service.publishVersion('pipeline-a', 'v-uuid');

    expect(result.id).toBe('v-uuid');
    expect(result.pipelineId).toBe('pipeline-a');
    expect(result.version).toBe(2);
    expect(result.status).toBe('published');
    expect(result.changeSummary).toBe('新功能');
    expect(result.publishedAt).toBeDefined();
    // publishedAt should be an ISO string
    expect(() => new Date(result.publishedAt)).not.toThrow();
  });

  // TS-F037-012: 發布 draft 版本 → 422 PIPELINE_PUBLISH_REQUIRES_TEST
  it('should throw 422 PIPELINE_PUBLISH_REQUIRES_TEST when version is draft', async () => {
    const pipeline = makePipeline();
    const version = makeVersion({ status: 'draft' });

    mockPipelineQb.getOne.mockResolvedValue(pipeline);
    mockVersionRepository.findOne.mockResolvedValue(version);

    await expect(service.publishVersion('pipeline-a', version.id)).rejects.toThrow(
      UnprocessableEntityException,
    );

    try {
      await service.publishVersion('pipeline-a', version.id);
    } catch (e: any) {
      expect(e.response.error).toBe(ERROR_CODES.PIPELINE_PUBLISH_REQUIRES_TEST);
      expect(e.response.message).toContain('請先完成測試執行');
    }

    // DB not modified
    expect(transactionVersionSave).not.toHaveBeenCalled();
    expect(transactionPipelineSave).not.toHaveBeenCalled();
  });

  // TS-F037-013: 發布 published 版本 → 422 PIPELINE_VERSION_ALREADY_PUBLISHED
  it('should throw 422 PIPELINE_VERSION_ALREADY_PUBLISHED when version is already published', async () => {
    const pipeline = makePipeline();
    const version = makeVersion({ status: 'published' });

    mockPipelineQb.getOne.mockResolvedValue(pipeline);
    mockVersionRepository.findOne.mockResolvedValue(version);

    await expect(service.publishVersion('pipeline-a', version.id)).rejects.toThrow(
      UnprocessableEntityException,
    );

    try {
      await service.publishVersion('pipeline-a', version.id);
    } catch (e: any) {
      expect(e.response.error).toBe(ERROR_CODES.PIPELINE_VERSION_ALREADY_PUBLISHED);
      expect(e.response.message).toContain('此版本已發布');
    }
  });

  // TS-F037-020: DB Transaction 失敗 → 500 SYSTEM_INTERNAL_ERROR
  it('should throw InternalServerErrorException when transaction fails', async () => {
    const pipeline = makePipeline();
    const version = makeVersion({ status: 'testing' });

    mockPipelineQb.getOne.mockResolvedValue(pipeline);
    mockVersionRepository.findOne.mockResolvedValue(version);
    mockDataSource.transaction.mockRejectedValue(new Error('DB connection lost'));

    await expect(service.publishVersion('pipeline-a', version.id)).rejects.toThrow(
      InternalServerErrorException,
    );

    try {
      await service.publishVersion('pipeline-a', version.id);
    } catch (e: any) {
      expect(e.response.error).toBe(ERROR_CODES.SYSTEM_INTERNAL_ERROR);
    }
  });

  // TS-F037-005 (as unit test): 舊的 published 版本保留不被修改
  it('should not modify existing published versions when publishing a new one', async () => {
    const pipeline = makePipeline({ id: 'pipeline-b', version: 1 });
    const versionV2 = makeVersion({
      id: 'version-v2',
      pipeline_id: 'pipeline-b',
      version: 2,
      status: 'testing',
    });

    mockPipelineQb.getOne.mockResolvedValue(pipeline);
    mockVersionRepository.findOne.mockResolvedValue(versionV2);

    await service.publishVersion('pipeline-b', 'version-v2');

    // Only the new version is saved — old published versions are NOT touched
    expect(transactionVersionSave).toHaveBeenCalledTimes(1);
    const savedVersion = transactionVersionSave.mock.calls[0][0];
    expect(savedVersion.id).toBe('version-v2');
  });

  // Pipeline not found → 404
  it('should throw NotFoundException when pipeline does not exist', async () => {
    mockPipelineQb.getOne.mockResolvedValue(null);

    await expect(service.publishVersion('nonexistent', 'some-version')).rejects.toThrow(
      NotFoundException,
    );
  });

  // Version not found → 404
  it('should throw NotFoundException when version does not exist', async () => {
    const pipeline = makePipeline();
    mockPipelineQb.getOne.mockResolvedValue(pipeline);
    mockVersionRepository.findOne.mockResolvedValue(null);

    await expect(service.publishVersion('pipeline-a', 'nonexistent')).rejects.toThrow(
      NotFoundException,
    );

    try {
      await service.publishVersion('pipeline-a', 'nonexistent');
    } catch (e: any) {
      expect(e.response.error).toBe(ERROR_CODES.PIPELINE_VERSION_NOT_FOUND);
    }
  });

  // Version pipeline_id mismatch → 404
  it('should throw NotFoundException when version belongs to a different pipeline', async () => {
    const pipeline = makePipeline({ id: 'pipeline-a' });
    const version = makeVersion({ pipeline_id: 'pipeline-b' });

    mockPipelineQb.getOne.mockResolvedValue(pipeline);
    mockVersionRepository.findOne.mockResolvedValue(version);

    await expect(service.publishVersion('pipeline-a', version.id)).rejects.toThrow(
      NotFoundException,
    );
  });
});
