import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { EtlPipelineService } from '../etl-pipeline.service';
import { EtlPipeline } from '@/database/entities/etl-pipeline.entity';
import { EtlPipelineLog } from '@/database/entities/etl-pipeline-log.entity';
import { EtlPipelineVersion } from '@/database/entities/etl-pipeline-version.entity';
import { User } from '@/database/entities/user.entity';
import { DataSource } from 'typeorm';
import { ERROR_CODES } from '@/common/errors/error-codes';

// ---- Test Data Helpers ----

function makePipeline(overrides: Partial<EtlPipeline> = {}): EtlPipeline {
  return {
    id: 'pipeline-a',
    name: 'Test Pipeline',
    description: null,
    version: 1,
    step_count: 3,
    status: 'active',
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
    id: 'version-1',
    pipeline_id: 'pipeline-a',
    version: 1,
    definition: { nodes: [], edges: [] },
    status: 'published',
    change_summary: '初始版本',
    created_by: 'admin-user',
    published_at: null,
    created_at: new Date('2026-01-01T00:00:00Z'),
    creator: { name: 'Admin User' } as User,
    ...overrides,
  } as EtlPipelineVersion;
}

const SEED_DEFINITION_V1 = {
  nodes: [
    { id: 'node-1', type: 'extract', position: { x: 0, y: 0 }, data: { rawTableId: 'raw-uuid-001' } },
    { id: 'node-2', type: 'transform-null-handler', position: { x: 200, y: 0 }, data: { strategy: 'default_value' } },
  ],
  edges: [
    { id: 'edge-1', source: 'node-1', target: 'node-2' },
  ],
};

const SEED_DEFINITION_V2 = {
  nodes: [
    { id: 'node-1', type: 'extract', position: { x: 0, y: 0 }, data: { rawTableId: 'raw-uuid-001' } },
    { id: 'node-2', type: 'transform-null-handler', position: { x: 200, y: 0 }, data: { strategy: 'remove_row' } },
    { id: 'node-3', type: 'load', position: { x: 400, y: 0 }, data: { targetTable: 'target_customers' } },
  ],
  edges: [
    { id: 'edge-1', source: 'node-1', target: 'node-2' },
    { id: 'edge-2', source: 'node-2', target: 'node-3' },
  ],
};

// ---- Mock Setup ----

function createMocks() {
  const mockPipelineQb = {
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    getOne: vi.fn(),
    getCount: vi.fn(),
    select: vi.fn().mockReturnThis(),
    addSelect: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    leftJoinAndSelect: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    take: vi.fn().mockReturnThis(),
    getManyAndCount: vi.fn(),
  };

  const mockPipelineRepository = {
    createQueryBuilder: vi.fn().mockReturnValue(mockPipelineQb),
    save: vi.fn().mockImplementation((entity) => Promise.resolve({ ...entity, updated_at: new Date() })),
  };

  const mockVersionQb = {
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    leftJoinAndSelect: vi.fn().mockReturnThis(),
    addSelect: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    getMany: vi.fn(),
    getOne: vi.fn(),
  };

  const mockVersionRepository = {
    createQueryBuilder: vi.fn().mockReturnValue(mockVersionQb),
    findOne: vi.fn(),
    save: vi.fn().mockImplementation((entity) => Promise.resolve({ ...entity })),
    create: vi.fn().mockImplementation((entity) => ({ ...entity })),
  };

  const mockLogQb = {
    select: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    getRawOne: vi.fn(),
    getCount: vi.fn(),
    orderBy: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    take: vi.fn().mockReturnThis(),
    getManyAndCount: vi.fn(),
  };

  const mockLogRepository = {
    createQueryBuilder: vi.fn().mockReturnValue(mockLogQb),
  };

  const mockUserRepository = {};

  const transactionVersionSave = vi.fn().mockImplementation((entity) => Promise.resolve({ ...entity }));
  const transactionPipelineSave = vi.fn().mockImplementation((entity) => Promise.resolve({ ...entity, updated_at: new Date() }));

  const mockDataSource = {
    transaction: vi.fn().mockImplementation(async (cb: any) => {
      const manager = {
        getRepository: (entity: any) => {
          if (entity === EtlPipeline) return { save: transactionPipelineSave };
          if (entity === EtlPipelineVersion) return {
            save: transactionVersionSave,
            create: vi.fn().mockImplementation((e: any) => ({ ...e })),
          };
          return {};
        },
      };
      return cb(manager);
    }),
  };

  return {
    mockPipelineQb,
    mockPipelineRepository,
    mockVersionQb,
    mockVersionRepository,
    mockLogQb,
    mockLogRepository,
    mockUserRepository,
    mockDataSource,
    transactionVersionSave,
    transactionPipelineSave,
  };
}

// =====================================================
// Test Suite: Version List (TS-F033-001, 002, 003, 020)
// =====================================================

describe('EtlPipelineService - getVersions (F033)', () => {
  let service: EtlPipelineService;
  let mocks: ReturnType<typeof createMocks>;

  beforeEach(async () => {
    mocks = createMocks();
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EtlPipelineService,
        { provide: getRepositoryToken(EtlPipeline), useValue: mocks.mockPipelineRepository },
        { provide: getRepositoryToken(EtlPipelineLog), useValue: mocks.mockLogRepository },
        { provide: getRepositoryToken(EtlPipelineVersion), useValue: mocks.mockVersionRepository },
        { provide: getRepositoryToken(User), useValue: mocks.mockUserRepository },
        { provide: DataSource, useValue: mocks.mockDataSource },
      ],
    }).compile();

    service = module.get(EtlPipelineService);
  });

  // TS-F033-001: 版本清單依版本號降序排列
  it('should return versions in descending order by version number', async () => {
    const pipeline = makePipeline();
    mocks.mockPipelineQb.getOne.mockResolvedValue(pipeline);

    const v3 = makeVersion({ id: 'v3', version: 3, status: 'draft', change_summary: 'v3 change' });
    const v2 = makeVersion({ id: 'v2', version: 2, status: 'testing', change_summary: 'v2 change' });
    const v1 = makeVersion({ id: 'v1', version: 1, status: 'published', change_summary: '初始版本' });
    mocks.mockVersionQb.getMany.mockResolvedValue([v3, v2, v1]);

    const result = await service.getVersions('pipeline-a');

    expect(result.data).toHaveLength(3);
    expect(result.data[0].version).toBe(3);
    expect(result.data[1].version).toBe(2);
    expect(result.data[2].version).toBe(1);
  });

  // TS-F033-002: 版本清單欄位完整性驗證（不含 definition）
  it('should return correct fields without definition', async () => {
    const pipeline = makePipeline();
    mocks.mockPipelineQb.getOne.mockResolvedValue(pipeline);

    const v1 = makeVersion({
      id: 'v1-uuid',
      version: 1,
      status: 'published',
      change_summary: '初始版本',
      created_at: new Date('2026-01-01T00:00:00Z'),
    });
    mocks.mockVersionQb.getMany.mockResolvedValue([v1]);

    const result = await service.getVersions('pipeline-a');

    const item = result.data[0];
    expect(item.id).toBe('v1-uuid');
    expect(item.version).toBe(1);
    expect(item.status).toBe('published');
    expect(item.changeSummary).toBe('初始版本');
    expect(item.createdBy).toBe('Admin User');
    expect(item.createdAt).toBeDefined();
    // Must NOT contain definition
    expect((item as any).definition).toBeUndefined();
  });

  // TS-F033-003: 版本清單含所有狀態
  it('should include all version statuses (draft/testing/published)', async () => {
    const pipeline = makePipeline();
    mocks.mockPipelineQb.getOne.mockResolvedValue(pipeline);

    const versions = [
      makeVersion({ id: 'v3', version: 3, status: 'draft' }),
      makeVersion({ id: 'v2', version: 2, status: 'testing' }),
      makeVersion({ id: 'v1', version: 1, status: 'published' }),
    ];
    mocks.mockVersionQb.getMany.mockResolvedValue(versions);

    const result = await service.getVersions('pipeline-a');

    const statuses = result.data.map((d) => d.status);
    expect(statuses).toContain('draft');
    expect(statuses).toContain('testing');
    expect(statuses).toContain('published');
  });

  // TS-F033-020: Pipeline 不存在 → 404
  it('should throw NotFoundException when pipeline does not exist', async () => {
    mocks.mockPipelineQb.getOne.mockResolvedValue(null);

    await expect(service.getVersions('nonexistent')).rejects.toThrow(NotFoundException);

    try {
      await service.getVersions('nonexistent');
    } catch (e: any) {
      expect(e.response.error).toBe(ERROR_CODES.PIPELINE_NOT_FOUND);
    }
  });
});

// =====================================================
// Test Suite: Version Detail (TS-F033-004, 005, 021)
// =====================================================

describe('EtlPipelineService - getVersionDetail (F033)', () => {
  let service: EtlPipelineService;
  let mocks: ReturnType<typeof createMocks>;

  beforeEach(async () => {
    mocks = createMocks();
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EtlPipelineService,
        { provide: getRepositoryToken(EtlPipeline), useValue: mocks.mockPipelineRepository },
        { provide: getRepositoryToken(EtlPipelineLog), useValue: mocks.mockLogRepository },
        { provide: getRepositoryToken(EtlPipelineVersion), useValue: mocks.mockVersionRepository },
        { provide: getRepositoryToken(User), useValue: mocks.mockUserRepository },
        { provide: DataSource, useValue: mocks.mockDataSource },
      ],
    }).compile();

    service = module.get(EtlPipelineService);
  });

  // TS-F033-004: 版本詳情含完整 definition JSONB
  it('should return version detail with full definition', async () => {
    const pipeline = makePipeline();
    mocks.mockPipelineQb.getOne.mockResolvedValue(pipeline);

    const v1 = makeVersion({
      id: 'v1-uuid',
      pipeline_id: 'pipeline-a',
      version: 1,
      definition: SEED_DEFINITION_V1,
      status: 'published',
      change_summary: '初始版本',
    });
    mocks.mockVersionRepository.findOne.mockResolvedValue(v1);

    const result = await service.getVersionDetail('pipeline-a', 'v1-uuid');

    expect(result.id).toBe('v1-uuid');
    expect(result.pipelineId).toBe('pipeline-a');
    expect(result.version).toBe(1);
    expect(result.status).toBe('published');
    expect(result.definition.nodes).toBeInstanceOf(Array);
    expect(result.definition.edges).toBeInstanceOf(Array);
    expect(result.changeSummary).toBe('初始版本');
    expect(result.createdBy).toBeDefined();
    expect(result.createdAt).toBeDefined();
  });

  // TS-F033-005: definition 內容與建立時完全一致（JSONB 完整性）
  it('should return definition matching the seed data exactly', async () => {
    const pipeline = makePipeline();
    mocks.mockPipelineQb.getOne.mockResolvedValue(pipeline);

    const v1 = makeVersion({
      id: 'v1-uuid',
      pipeline_id: 'pipeline-a',
      version: 1,
      definition: SEED_DEFINITION_V1,
    });
    mocks.mockVersionRepository.findOne.mockResolvedValue(v1);

    const result = await service.getVersionDetail('pipeline-a', 'v1-uuid');

    expect(result.definition).toEqual(SEED_DEFINITION_V1);
  });

  // TS-F033-021: 版本不存在 → 404
  it('should throw NotFoundException when version does not exist', async () => {
    const pipeline = makePipeline();
    mocks.mockPipelineQb.getOne.mockResolvedValue(pipeline);
    mocks.mockVersionRepository.findOne.mockResolvedValue(null);

    await expect(service.getVersionDetail('pipeline-a', 'nonexistent')).rejects.toThrow(NotFoundException);

    try {
      await service.getVersionDetail('pipeline-a', 'nonexistent');
    } catch (e: any) {
      expect(e.response.error).toBe(ERROR_CODES.PIPELINE_VERSION_NOT_FOUND);
    }
  });

  // Version pipeline_id mismatch → 404
  it('should throw NotFoundException when version belongs to different pipeline', async () => {
    const pipeline = makePipeline({ id: 'pipeline-a' });
    mocks.mockPipelineQb.getOne.mockResolvedValue(pipeline);

    const v1 = makeVersion({ pipeline_id: 'pipeline-b' });
    mocks.mockVersionRepository.findOne.mockResolvedValue(v1);

    await expect(service.getVersionDetail('pipeline-a', v1.id)).rejects.toThrow(NotFoundException);
  });
});

// =====================================================
// Test Suite: Diff (TS-F033-006 ~ 010, 022, 023)
// =====================================================

describe('EtlPipelineService - getVersionDiff (F033)', () => {
  let service: EtlPipelineService;
  let mocks: ReturnType<typeof createMocks>;

  beforeEach(async () => {
    mocks = createMocks();
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EtlPipelineService,
        { provide: getRepositoryToken(EtlPipeline), useValue: mocks.mockPipelineRepository },
        { provide: getRepositoryToken(EtlPipelineLog), useValue: mocks.mockLogRepository },
        { provide: getRepositoryToken(EtlPipelineVersion), useValue: mocks.mockVersionRepository },
        { provide: getRepositoryToken(User), useValue: mocks.mockUserRepository },
        { provide: DataSource, useValue: mocks.mockDataSource },
      ],
    }).compile();

    service = module.get(EtlPipelineService);
  });

  // TS-F033-006: nodesAdded 正確識別新增節點
  it('should identify nodesAdded correctly', async () => {
    const pipeline = makePipeline();
    mocks.mockPipelineQb.getOne.mockResolvedValue(pipeline);

    const v1 = makeVersion({ version: 1, definition: SEED_DEFINITION_V1 });
    const v2 = makeVersion({ version: 2, definition: SEED_DEFINITION_V2 });

    mocks.mockVersionRepository.findOne
      .mockResolvedValueOnce(v1)
      .mockResolvedValueOnce(v2);

    const result = await service.getVersionDiff('pipeline-a', 1, 2);

    expect(result.from).toBe(1);
    expect(result.to).toBe(2);
    expect(result.changes.nodesAdded).toHaveLength(1);
    expect(result.changes.nodesAdded[0].nodeId).toBe('node-3');
    expect(result.changes.nodesAdded[0].nodeType).toBe('load');
    expect(result.changes.nodesRemoved).toHaveLength(0);
  });

  // TS-F033-007: nodesRemoved 正確識別刪除節點
  it('should identify nodesRemoved correctly', async () => {
    const pipeline = makePipeline();
    mocks.mockPipelineQb.getOne.mockResolvedValue(pipeline);

    // v1 has node-1, node-2; v2 has only node-1 (node-2 removed)
    const defV1 = {
      nodes: [
        { id: 'node-1', type: 'extract', position: { x: 0, y: 0 }, data: {} },
        { id: 'node-2', type: 'transform-null-handler', position: { x: 200, y: 0 }, data: {} },
      ],
      edges: [],
    };
    const defV2 = {
      nodes: [
        { id: 'node-1', type: 'extract', position: { x: 0, y: 0 }, data: {} },
      ],
      edges: [],
    };

    const v1 = makeVersion({ version: 1, definition: defV1 });
    const v2 = makeVersion({ version: 2, definition: defV2 });

    mocks.mockVersionRepository.findOne
      .mockResolvedValueOnce(v1)
      .mockResolvedValueOnce(v2);

    const result = await service.getVersionDiff('pipeline-a', 1, 2);

    expect(result.changes.nodesRemoved).toHaveLength(1);
    expect(result.changes.nodesRemoved[0].nodeId).toBe('node-2');
    expect(result.changes.nodesAdded).toHaveLength(0);
  });

  // TS-F033-008: nodesModified 正確識別修改節點 (dot notation)
  it('should identify nodesModified with dot notation field path', async () => {
    const pipeline = makePipeline();
    mocks.mockPipelineQb.getOne.mockResolvedValue(pipeline);

    const v1 = makeVersion({ version: 1, definition: SEED_DEFINITION_V1 });
    const v2 = makeVersion({ version: 2, definition: SEED_DEFINITION_V2 });

    mocks.mockVersionRepository.findOne
      .mockResolvedValueOnce(v1)
      .mockResolvedValueOnce(v2);

    const result = await service.getVersionDiff('pipeline-a', 1, 2);

    expect(result.changes.nodesModified).toHaveLength(1);
    expect(result.changes.nodesModified[0].nodeId).toBe('node-2');
    expect(result.changes.nodesModified[0].field).toBe('data.strategy');
    expect(result.changes.nodesModified[0].oldValue).toBe('default_value');
    expect(result.changes.nodesModified[0].newValue).toBe('remove_row');
  });

  // TS-F033-009: edgesAdded 與 edgesRemoved 正確識別連線變化
  it('should identify edgesAdded and edgesRemoved correctly', async () => {
    const pipeline = makePipeline();
    mocks.mockPipelineQb.getOne.mockResolvedValue(pipeline);

    // v1: edge node-1→node-2; v2: edge node-3→node-4 (removed node-1→node-2, added node-3→node-4)
    const defV1 = {
      nodes: [
        { id: 'node-1', type: 'extract', position: { x: 0, y: 0 }, data: {} },
        { id: 'node-2', type: 'transform-null-handler', position: { x: 200, y: 0 }, data: {} },
      ],
      edges: [{ id: 'edge-1', source: 'node-1', target: 'node-2' }],
    };
    const defV2 = {
      nodes: [
        { id: 'node-1', type: 'extract', position: { x: 0, y: 0 }, data: {} },
        { id: 'node-2', type: 'transform-null-handler', position: { x: 200, y: 0 }, data: {} },
        { id: 'node-3', type: 'load', position: { x: 400, y: 0 }, data: {} },
        { id: 'node-4', type: 'load', position: { x: 600, y: 0 }, data: {} },
      ],
      edges: [{ id: 'edge-2', source: 'node-3', target: 'node-4' }],
    };

    const v1 = makeVersion({ version: 1, definition: defV1 });
    const v2 = makeVersion({ version: 2, definition: defV2 });

    mocks.mockVersionRepository.findOne
      .mockResolvedValueOnce(v1)
      .mockResolvedValueOnce(v2);

    const result = await service.getVersionDiff('pipeline-a', 1, 2);

    expect(result.changes.edgesAdded).toEqual(
      expect.arrayContaining([expect.objectContaining({ source: 'node-3', target: 'node-4' })]),
    );
    expect(result.changes.edgesRemoved).toEqual(
      expect.arrayContaining([expect.objectContaining({ source: 'node-1', target: 'node-2' })]),
    );
  });

  // TS-F033-010: 相同版本（from=to）回傳全空差異
  it('should return empty diff when comparing same version', async () => {
    const pipeline = makePipeline();
    mocks.mockPipelineQb.getOne.mockResolvedValue(pipeline);

    const v1 = makeVersion({ version: 1, definition: SEED_DEFINITION_V1 });

    mocks.mockVersionRepository.findOne
      .mockResolvedValueOnce(v1)
      .mockResolvedValueOnce(v1);

    const result = await service.getVersionDiff('pipeline-a', 1, 1);

    expect(result.from).toBe(1);
    expect(result.to).toBe(1);
    expect(result.changes.nodesAdded).toEqual([]);
    expect(result.changes.nodesRemoved).toEqual([]);
    expect(result.changes.nodesModified).toEqual([]);
    expect(result.changes.edgesAdded).toEqual([]);
    expect(result.changes.edgesRemoved).toEqual([]);
  });

  // TS-F033-022: 版本不存在 → Diff 404
  it('should throw NotFoundException when diff target version does not exist', async () => {
    const pipeline = makePipeline();
    mocks.mockPipelineQb.getOne.mockResolvedValue(pipeline);

    const v1 = makeVersion({ version: 1 });
    mocks.mockVersionRepository.findOne
      .mockResolvedValueOnce(v1)
      .mockResolvedValueOnce(null); // to=999 not found

    await expect(service.getVersionDiff('pipeline-a', 1, 999)).rejects.toThrow(NotFoundException);

    // Reset for error code check
    mocks.mockVersionRepository.findOne
      .mockResolvedValueOnce(v1)
      .mockResolvedValueOnce(null);

    try {
      await service.getVersionDiff('pipeline-a', 1, 999);
    } catch (e: any) {
      expect(e.response.error).toBe(ERROR_CODES.PIPELINE_VERSION_NOT_FOUND);
    }
  });

  // TS-F033-023: from 版本不存在 → 404
  it('should throw NotFoundException when diff source version does not exist', async () => {
    const pipeline = makePipeline();
    mocks.mockPipelineQb.getOne.mockResolvedValue(pipeline);

    mocks.mockVersionRepository.findOne.mockResolvedValueOnce(null);

    await expect(service.getVersionDiff('pipeline-a', 1, 2)).rejects.toThrow(NotFoundException);
  });
});

// =====================================================
// Test Suite: Rollback (TS-F033-011, 012, 013, 024)
// =====================================================

describe('EtlPipelineService - rollbackVersion (F033)', () => {
  let service: EtlPipelineService;
  let mocks: ReturnType<typeof createMocks>;

  beforeEach(async () => {
    mocks = createMocks();
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EtlPipelineService,
        { provide: getRepositoryToken(EtlPipeline), useValue: mocks.mockPipelineRepository },
        { provide: getRepositoryToken(EtlPipelineLog), useValue: mocks.mockLogRepository },
        { provide: getRepositoryToken(EtlPipelineVersion), useValue: mocks.mockVersionRepository },
        { provide: getRepositoryToken(User), useValue: mocks.mockUserRepository },
        { provide: DataSource, useValue: mocks.mockDataSource },
      ],
    }).compile();

    service = module.get(EtlPipelineService);
  });

  // TS-F033-011: 回滾建立新版本（status=draft，版本號遞增）
  it('should create new version with incremented number, status=draft, and correct changeSummary', async () => {
    const pipeline = makePipeline();
    mocks.mockPipelineQb.getOne.mockResolvedValue(pipeline);

    const v1 = makeVersion({
      id: 'v1-uuid',
      version: 1,
      definition: SEED_DEFINITION_V1,
      pipeline_id: 'pipeline-a',
    });
    // findOne for source version
    mocks.mockVersionRepository.findOne.mockResolvedValue(v1);

    // findOne for latest version (to get max version number)
    // We need a second call to get the latest version
    const v2 = makeVersion({ id: 'v2-uuid', version: 2, pipeline_id: 'pipeline-a' });
    mocks.mockVersionRepository.findOne
      .mockResolvedValueOnce(v1)  // source version lookup
      .mockResolvedValueOnce(v2); // latest version lookup

    // The transaction save should return the new version
    mocks.transactionVersionSave.mockResolvedValue({
      id: 'v3-uuid',
      pipeline_id: 'pipeline-a',
      version: 3,
      status: 'draft',
      definition: SEED_DEFINITION_V1,
      change_summary: '回滾自版本 1',
      created_by: 'admin-user',
      created_at: new Date(),
    });

    const result = await service.rollbackVersion('pipeline-a', 'v1-uuid', 'admin-user');

    expect(result.version).toBe(3);
    expect(result.status).toBe('draft');
    expect(result.changeSummary).toContain('回滾自版本 1');
    expect(result.createdAt).toBeDefined();
  });

  // TS-F033-012: 回滾後 definition 內容與來源版本完全一致
  it('should deep-copy definition from source version', async () => {
    const pipeline = makePipeline();
    mocks.mockPipelineQb.getOne.mockResolvedValue(pipeline);

    const v1 = makeVersion({
      id: 'v1-uuid',
      version: 1,
      definition: SEED_DEFINITION_V1,
      pipeline_id: 'pipeline-a',
    });
    const v2 = makeVersion({ id: 'v2-uuid', version: 2, pipeline_id: 'pipeline-a' });

    mocks.mockVersionRepository.findOne
      .mockResolvedValueOnce(v1)
      .mockResolvedValueOnce(v2);

    mocks.transactionVersionSave.mockImplementation((entity) =>
      Promise.resolve({ ...entity, id: 'v3-uuid', created_at: new Date() }),
    );

    await service.rollbackVersion('pipeline-a', 'v1-uuid', 'admin-user');

    // Verify the save was called with definition matching v1
    const savedEntity = mocks.transactionVersionSave.mock.calls[0][0];
    expect(savedEntity.definition).toEqual(SEED_DEFINITION_V1);
    // Verify it's a deep copy (not same reference)
    expect(savedEntity.definition).not.toBe(v1.definition);
  });

  // TS-F033-024: 版本不存在 → 回滾 404
  it('should throw NotFoundException when rollback source version does not exist', async () => {
    const pipeline = makePipeline();
    mocks.mockPipelineQb.getOne.mockResolvedValue(pipeline);
    mocks.mockVersionRepository.findOne.mockResolvedValue(null);

    await expect(service.rollbackVersion('pipeline-a', 'nonexistent', 'admin-user')).rejects.toThrow(NotFoundException);

    mocks.mockVersionRepository.findOne.mockResolvedValue(null);
    try {
      await service.rollbackVersion('pipeline-a', 'nonexistent', 'admin-user');
    } catch (e: any) {
      expect(e.response.error).toBe(ERROR_CODES.PIPELINE_VERSION_NOT_FOUND);
    }
  });

  // Pipeline not found → 404
  it('should throw NotFoundException when pipeline does not exist for rollback', async () => {
    mocks.mockPipelineQb.getOne.mockResolvedValue(null);

    await expect(service.rollbackVersion('nonexistent', 'v1', 'admin-user')).rejects.toThrow(NotFoundException);
  });
});

// =====================================================
// Test Suite: Publish with test log check (TS-F033-019)
// =====================================================

describe('EtlPipelineService - publishVersion with test log check (F033)', () => {
  let service: EtlPipelineService;
  let mocks: ReturnType<typeof createMocks>;

  beforeEach(async () => {
    mocks = createMocks();
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EtlPipelineService,
        { provide: getRepositoryToken(EtlPipeline), useValue: mocks.mockPipelineRepository },
        { provide: getRepositoryToken(EtlPipelineLog), useValue: mocks.mockLogRepository },
        { provide: getRepositoryToken(EtlPipelineVersion), useValue: mocks.mockVersionRepository },
        { provide: getRepositoryToken(User), useValue: mocks.mockUserRepository },
        { provide: DataSource, useValue: mocks.mockDataSource },
      ],
    }).compile();

    service = module.get(EtlPipelineService);
  });

  // TS-F033-019: testing 版本但無成功測試執行記錄 → 422
  it('should throw 422 when testing version has no successful test run log', async () => {
    const pipeline = makePipeline();
    const version = makeVersion({
      id: 'v-testing',
      pipeline_id: 'pipeline-a',
      version: 2,
      status: 'testing',
    });

    mocks.mockPipelineQb.getOne.mockResolvedValue(pipeline);
    mocks.mockVersionRepository.findOne.mockResolvedValue(version);
    // No completed test run logs
    mocks.mockLogQb.getCount.mockResolvedValue(0);

    await expect(service.publishVersion('pipeline-a', 'v-testing')).rejects.toThrow(
      UnprocessableEntityException,
    );

    // Reset mocks for error code check
    mocks.mockPipelineQb.getOne.mockResolvedValue(pipeline);
    mocks.mockVersionRepository.findOne.mockResolvedValue(version);
    mocks.mockLogQb.getCount.mockResolvedValue(0);

    try {
      await service.publishVersion('pipeline-a', 'v-testing');
    } catch (e: any) {
      expect(e.response.error).toBe(ERROR_CODES.PIPELINE_PUBLISH_REQUIRES_TEST);
    }
  });

  // TS-F033-014: testing 版本有成功測試記錄 → 可以發布
  it('should allow publishing when testing version has successful test run log', async () => {
    const pipeline = makePipeline({ version: 1 });
    const version = makeVersion({
      id: 'v-testing',
      pipeline_id: 'pipeline-a',
      version: 2,
      status: 'testing',
    });

    mocks.mockPipelineQb.getOne.mockResolvedValue(pipeline);
    mocks.mockVersionRepository.findOne.mockResolvedValue(version);
    // Has completed test run log
    mocks.mockLogQb.getCount.mockResolvedValue(1);

    const result = await service.publishVersion('pipeline-a', 'v-testing');

    expect(result.status).toBe('published');
    expect(result.publishedAt).toBeDefined();
  });
});
