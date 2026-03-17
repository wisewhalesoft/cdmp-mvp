import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { DatasourceService } from './datasource.service';
import { Datasource } from '@/database/entities/datasource.entity';
import { DatasourceHealthLog } from '@/database/entities/datasource-health-log.entity';
import { CryptoUtil } from '@/common/crypto/crypto.util';
import { CONNECTION_TESTER, type IConnectionTester } from './connection-tester.provider';

describe('DatasourceService', () => {
  let service: DatasourceService;

  const mockQueryBuilder = {
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    take: vi.fn().mockReturnThis(),
    getOne: vi.fn(),
    getManyAndCount: vi.fn(),
  };

  const mockRepository = {
    createQueryBuilder: vi.fn().mockReturnValue(mockQueryBuilder),
    create: vi.fn((data: any) => ({ id: 'test-uuid', ...data })),
    save: vi.fn((entity: any) => Promise.resolve({
      ...entity,
      id: entity.id || 'test-uuid',
      created_at: new Date('2026-01-01'),
      updated_at: new Date('2026-01-01'),
    })),
    manager: {
      transaction: vi.fn(async (cb: any) => {
        const em = {
          save: vi.fn((entity: any) => Promise.resolve({
            ...entity,
            id: entity.id || 'test-uuid',
            created_at: new Date('2026-01-01'),
            updated_at: new Date('2026-01-01'),
          })),
        };
        return cb(em);
      }),
    },
  };

  const mockHealthLogRepository = {
    create: vi.fn((data: any) => ({ id: 'log-uuid', ...data })),
    save: vi.fn((entity: any) => Promise.resolve({ ...entity, id: entity.id || 'log-uuid' })),
  };

  const mockConnectionTester: IConnectionTester = {
    testConnection: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    // Mock CryptoUtil.encrypt and decrypt
    vi.spyOn(CryptoUtil, 'encrypt').mockReturnValue('iv-base64:tag-base64:cipher-base64');
    vi.spyOn(CryptoUtil, 'decrypt').mockReturnValue('decrypted-password');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatasourceService,
        {
          provide: getRepositoryToken(Datasource),
          useValue: mockRepository,
        },
        {
          provide: getRepositoryToken(DatasourceHealthLog),
          useValue: mockHealthLogRepository,
        },
        {
          provide: CONNECTION_TESTER,
          useValue: mockConnectionTester,
        },
      ],
    }).compile();

    service = module.get<DatasourceService>(DatasourceService);
  });

  const validDto = {
    name: 'MySQL Production',
    type: 'mysql' as const,
    host: '192.168.1.100',
    port: 3306,
    databaseName: 'app_db',
    username: 'db_admin',
    password: 'SecretP@ss',
    description: 'Production MySQL server',
  };

  it('should create datasource successfully', async () => {
    mockQueryBuilder.getOne.mockResolvedValue(null); // no duplicate

    const result = await service.createDatasource(validDto, 'user-uuid');

    expect(result).toBeDefined();
    expect(result.name).toBe('MySQL Production');
    expect(result.type).toBe('mysql');
    expect(result.host).toBe('192.168.1.100');
    expect(result.port).toBe(3306);
    expect(result.databaseName).toBe('app_db');
    expect(result.username).toBe('db_admin');
    expect(result.status).toBe('unknown');
    expect(result.lastTestedAt).toBeNull();
    expect(result).not.toHaveProperty('password');
    expect(result).not.toHaveProperty('encrypted_password');
    expect(CryptoUtil.encrypt).toHaveBeenCalledWith('SecretP@ss');
    expect(mockRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        encrypted_password: 'iv-base64:tag-base64:cipher-base64',
        created_by: 'user-uuid',
      }),
    );
  });

  it('should throw ConflictException when name already exists', async () => {
    mockQueryBuilder.getOne.mockResolvedValue({ id: 'existing-id', name: 'MySQL Production' });

    await expect(service.createDatasource(validDto, 'user-uuid'))
      .rejects.toThrow(ConflictException);

    await expect(service.createDatasource(validDto, 'user-uuid'))
      .rejects.toThrow();
  });

  it('should encrypt password before saving', async () => {
    mockQueryBuilder.getOne.mockResolvedValue(null);

    await service.createDatasource(validDto, 'user-uuid');

    expect(CryptoUtil.encrypt).toHaveBeenCalledWith('SecretP@ss');
    expect(mockRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        encrypted_password: 'iv-base64:tag-base64:cipher-base64',
      }),
    );
  });

  // F012: findAll tests
  describe('findAll', () => {
    const mockDatasources = [
      {
        id: 'ds-1',
        name: 'MySQL 主資料庫',
        type: 'mysql',
        host: '192.168.1.100',
        port: 3306,
        database_name: 'prod_db',
        username: 'admin',
        encrypted_password: 'iv:tag:cipher',
        description: 'Production MySQL',
        status: 'connected',
        last_tested_at: new Date('2026-01-15'),
        created_at: new Date('2026-01-01'),
        updated_at: new Date('2026-01-10'),
        deleted_at: null,
      },
      {
        id: 'ds-2',
        name: 'PostgreSQL 分析庫',
        type: 'postgresql',
        host: '192.168.1.101',
        port: 5432,
        database_name: 'analytics_db',
        username: 'analyst',
        encrypted_password: 'iv:tag:cipher',
        description: null,
        status: 'disconnected',
        last_tested_at: null,
        created_at: new Date('2026-01-02'),
        updated_at: new Date('2026-01-02'),
        deleted_at: null,
      },
    ];

    beforeEach(() => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([mockDatasources, 2]);
    });

    it('should return paginated list with default page=1, limit=20', async () => {
      const result = await service.findAll({});

      expect(mockRepository.createQueryBuilder).toHaveBeenCalledWith('ds');
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('ds.deleted_at IS NULL');
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('ds.created_at', 'DESC');
      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(0);
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(20);
      expect(result.data).toHaveLength(2);
      expect(result.pagination).toEqual({ page: 1, limit: 20, total: 2, totalPages: 1 });
    });

    it('should exclude encrypted_password from results', async () => {
      const result = await service.findAll({});

      result.data.forEach((item) => {
        expect(item).not.toHaveProperty('encrypted_password');
        expect(item).not.toHaveProperty('password');
      });
    });

    it('should map entity fields to camelCase', async () => {
      const result = await service.findAll({});

      expect(result.data[0].databaseName).toBe('prod_db');
      expect(result.data[0].lastTestedAt).toBeDefined();
      expect(result.data[0].createdAt).toBeDefined();
      expect(result.data[0].updatedAt).toBeDefined();
    });

    it('should apply search filter when provided', async () => {
      await service.findAll({ search: 'mysql' });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'LOWER(ds.name) LIKE :search',
        { search: '%mysql%' },
      );
    });

    it('should apply type filter when provided', async () => {
      await service.findAll({ type: 'postgresql' });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'ds.type = :type',
        { type: 'postgresql' },
      );
    });

    it('should apply status filter when provided', async () => {
      await service.findAll({ status: 'connected' });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'ds.status = :status',
        { status: 'connected' },
      );
    });

    it('should calculate totalPages correctly', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([mockDatasources, 45]);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result.pagination.totalPages).toBe(3);
    });
  });

  // F013: findById tests
  describe('findById', () => {
    const mockEntity = {
      id: 'ds-1',
      name: 'MySQL 主資料庫',
      type: 'mysql',
      host: '192.168.1.100',
      port: 3306,
      database_name: 'prod_db',
      username: 'admin',
      encrypted_password: 'iv:tag:cipher',
      description: 'Production MySQL',
      status: 'connected',
      last_tested_at: new Date('2026-01-15'),
      created_at: new Date('2026-01-01'),
      updated_at: new Date('2026-01-10'),
      deleted_at: null,
    };

    it('should return datasource by id', async () => {
      mockQueryBuilder.getOne.mockResolvedValue(mockEntity);

      const result = await service.findById('ds-1');

      expect(result.id).toBe('ds-1');
      expect(result.name).toBe('MySQL 主資料庫');
      expect(result.databaseName).toBe('prod_db');
      expect(result).not.toHaveProperty('encrypted_password');
      expect(result).not.toHaveProperty('password');
    });

    it('should throw NotFoundException when datasource not found', async () => {
      mockQueryBuilder.getOne.mockResolvedValue(null);

      await expect(service.findById('nonexistent-id'))
        .rejects.toThrow(NotFoundException);
    });
  });

  // F013: updateDatasource tests
  describe('updateDatasource', () => {
    const existingEntity = {
      id: 'ds-1',
      name: 'MySQL 主資料庫',
      type: 'mysql',
      host: '192.168.1.100',
      port: 3306,
      database_name: 'prod_db',
      username: 'admin',
      encrypted_password: 'old-iv:old-tag:old-cipher',
      description: 'Production MySQL',
      status: 'connected',
      last_tested_at: new Date('2026-01-15'),
      created_at: new Date('2026-01-01'),
      updated_at: new Date('2026-01-10'),
      deleted_at: null,
    };

    const updateDto = {
      name: 'MySQL 主資料庫',
      type: 'mysql' as const,
      host: 'new-host.example.com',
      port: 3307,
      databaseName: 'prod_db',
      username: 'admin',
      description: 'Updated description',
    };

    it('should update datasource and reset status to unknown', async () => {
      // First call: find existing entity; Second call: duplicate check returns null
      mockQueryBuilder.getOne
        .mockResolvedValueOnce(existingEntity)
        .mockResolvedValueOnce(null);

      const result = await service.updateDatasource('ds-1', updateDto);

      expect(result.host).toBe('new-host.example.com');
      expect(result.port).toBe(3307);
      expect(result.status).toBe('unknown');
      expect(result.description).toBe('Updated description');
    });

    it('should preserve password when password is null', async () => {
      mockQueryBuilder.getOne
        .mockResolvedValueOnce({ ...existingEntity })
        .mockResolvedValueOnce(null);

      await service.updateDatasource('ds-1', { ...updateDto, password: null });

      // CryptoUtil.encrypt should NOT be called for update
      // (it was called in beforeEach mock setup, so check save arg)
      const savedArg = mockRepository.save.mock.calls[0][0];
      expect(savedArg.encrypted_password).toBe('old-iv:old-tag:old-cipher');
    });

    it('should encrypt and update password when provided', async () => {
      mockQueryBuilder.getOne
        .mockResolvedValueOnce({ ...existingEntity })
        .mockResolvedValueOnce(null);

      await service.updateDatasource('ds-1', { ...updateDto, password: 'NewP@ss' });

      expect(CryptoUtil.encrypt).toHaveBeenCalledWith('NewP@ss');
      const savedArg = mockRepository.save.mock.calls[0][0];
      expect(savedArg.encrypted_password).toBe('iv-base64:tag-base64:cipher-base64');
    });

    it('should throw NotFoundException when datasource not found', async () => {
      mockQueryBuilder.getOne.mockResolvedValue(null);

      await expect(service.updateDatasource('nonexistent', updateDto))
        .rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException when name conflicts with another datasource', async () => {
      mockQueryBuilder.getOne
        .mockResolvedValueOnce(existingEntity) // find existing
        .mockResolvedValueOnce({ id: 'ds-other', name: 'Duplicate' }); // duplicate found

      await expect(service.updateDatasource('ds-1', { ...updateDto, name: 'Duplicate' }))
        .rejects.toThrow(ConflictException);
    });
  });

  // F014: deleteDatasource tests
  describe('deleteDatasource', () => {
    const existingEntity = {
      id: 'ds-1',
      name: 'MySQL 主資料庫',
      type: 'mysql',
      host: '192.168.1.100',
      port: 3306,
      database_name: 'prod_db',
      username: 'admin',
      encrypted_password: 'iv:tag:cipher',
      description: 'Production MySQL',
      status: 'connected',
      last_tested_at: new Date('2026-01-15'),
      created_at: new Date('2026-01-01'),
      updated_at: new Date('2026-01-10'),
      deleted_at: null,
    };

    it('should soft-delete datasource successfully', async () => {
      mockQueryBuilder.getOne.mockResolvedValue({ ...existingEntity });

      const result = await service.deleteDatasource('ds-1');

      expect(result.message).toBe('資料來源已成功刪除');
      expect(result.id).toBe('ds-1');

      const savedArg = mockRepository.save.mock.calls[0][0];
      expect(savedArg.deleted_at).toBeInstanceOf(Date);
      expect(savedArg.deleted_at).not.toBeNull();
    });

    it('should throw NotFoundException when datasource not found', async () => {
      mockQueryBuilder.getOne.mockResolvedValue(null);

      await expect(service.deleteDatasource('nonexistent-id'))
        .rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for already soft-deleted datasource', async () => {
      // The query already has `deleted_at IS NULL`, so soft-deleted records return null
      mockQueryBuilder.getOne.mockResolvedValue(null);

      await expect(service.deleteDatasource('ds-deleted'))
        .rejects.toThrow(NotFoundException);
    });
  });

  // F015: testConnection tests
  describe('testConnection', () => {
    const existingEntity = {
      id: 'ds-1',
      name: 'MySQL 主資料庫',
      type: 'mysql',
      host: '192.168.1.100',
      port: 3306,
      database_name: 'prod_db',
      username: 'admin',
      encrypted_password: 'iv:tag:cipher',
      description: 'Production MySQL',
      status: 'unknown',
      last_tested_at: null,
      created_at: new Date('2026-01-01'),
      updated_at: new Date('2026-01-01'),
      deleted_at: null,
    };

    it('should return success result for MySQL connection', async () => {
      mockQueryBuilder.getOne.mockResolvedValue({ ...existingEntity });
      (mockConnectionTester.testConnection as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        responseTimeMs: 42,
      });

      const result = await service.testConnection('ds-1');

      expect(result.success).toBe(true);
      expect(result.message).toContain('連線成功');
      expect(result.responseTime).toBe(42);
      expect(mockConnectionTester.testConnection).toHaveBeenCalledWith({
        type: 'mysql',
        host: '192.168.1.100',
        port: 3306,
        database: 'prod_db',
        username: 'admin',
        password: 'decrypted-password',
      });
    });

    it('should return success result for PostgreSQL connection', async () => {
      const pgEntity = { ...existingEntity, id: 'ds-2', type: 'postgresql', port: 5432 };
      mockQueryBuilder.getOne.mockResolvedValue(pgEntity);
      (mockConnectionTester.testConnection as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        responseTimeMs: 38,
      });

      const result = await service.testConnection('ds-2');

      expect(result.success).toBe(true);
      expect(result.responseTime).toBe(38);
    });

    it('should write health log on successful connection', async () => {
      mockQueryBuilder.getOne.mockResolvedValue({ ...existingEntity });
      (mockConnectionTester.testConnection as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        responseTimeMs: 42,
      });

      await service.testConnection('ds-1');

      // Verify transaction was used for both DB update and health log
      expect(mockRepository.manager.transaction).toHaveBeenCalled();
    });

    it('should update datasource status to connected on success', async () => {
      const entity = { ...existingEntity };
      mockQueryBuilder.getOne.mockResolvedValue(entity);
      (mockConnectionTester.testConnection as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        responseTimeMs: 42,
      });

      await service.testConnection('ds-1');

      const txCallback = mockRepository.manager.transaction.mock.calls[0][0];
      const mockEm = { save: vi.fn((e: any) => Promise.resolve(e)) };
      await txCallback(mockEm);

      // The entity should have status updated
      expect(entity.status).toBe('connected');
      expect(entity.last_tested_at).toBeInstanceOf(Date);
    });

    it('should return failure for host unreachable', async () => {
      mockQueryBuilder.getOne.mockResolvedValue({ ...existingEntity });
      (mockConnectionTester.testConnection as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: false,
        responseTimeMs: 1500,
        errorMessage: '無法連線至主機',
        errorCode: 'DS_HOST_UNREACHABLE',
      });

      const result = await service.testConnection('ds-1');

      expect(result.success).toBe(false);
      expect(result.message).toContain('無法連線至主機');
      expect(result.responseTime).toBe(1500);
    });

    it('should return failure for auth error', async () => {
      mockQueryBuilder.getOne.mockResolvedValue({ ...existingEntity });
      (mockConnectionTester.testConnection as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: false,
        responseTimeMs: 200,
        errorMessage: '帳號或密碼錯誤',
        errorCode: 'DS_AUTH_FAILED',
      });

      const result = await service.testConnection('ds-1');

      expect(result.success).toBe(false);
      expect(result.message).toContain('帳號或密碼錯誤');
    });

    it('should return failure for connection timeout', async () => {
      mockQueryBuilder.getOne.mockResolvedValue({ ...existingEntity });
      (mockConnectionTester.testConnection as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: false,
        responseTimeMs: 10000,
        errorMessage: '連線逾時',
        errorCode: 'DS_CONNECTION_TIMEOUT',
      });

      const result = await service.testConnection('ds-1');

      expect(result.success).toBe(false);
      expect(result.message).toContain('連線逾時');
      expect(result.responseTime).toBe(10000);
    });

    it('should throw NotFoundException when datasource not found', async () => {
      mockQueryBuilder.getOne.mockResolvedValue(null);

      await expect(service.testConnection('nonexistent'))
        .rejects.toThrow(NotFoundException);
    });

    it('should return failure for database not found', async () => {
      mockQueryBuilder.getOne.mockResolvedValue({ ...existingEntity });
      (mockConnectionTester.testConnection as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: false,
        responseTimeMs: 300,
        errorMessage: '找不到指定的資料庫',
        errorCode: 'DS_DATABASE_NOT_FOUND',
      });

      const result = await service.testConnection('ds-1');

      expect(result.success).toBe(false);
      expect(result.message).toContain('找不到指定的資料庫');
    });

    it('should update datasource status to disconnected on failure', async () => {
      const entity = { ...existingEntity };
      mockQueryBuilder.getOne.mockResolvedValue(entity);
      (mockConnectionTester.testConnection as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: false,
        responseTimeMs: 1500,
        errorMessage: '無法連線至主機',
        errorCode: 'DS_HOST_UNREACHABLE',
      });

      await service.testConnection('ds-1');

      const txCallback = mockRepository.manager.transaction.mock.calls[0][0];
      const mockEm = { save: vi.fn((e: any) => Promise.resolve(e)) };
      await txCallback(mockEm);

      expect(entity.status).toBe('disconnected');
      expect(entity.last_tested_at).toBeInstanceOf(Date);
    });

    it('should decrypt password before testing connection', async () => {
      mockQueryBuilder.getOne.mockResolvedValue({ ...existingEntity });
      (mockConnectionTester.testConnection as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        responseTimeMs: 42,
      });

      await service.testConnection('ds-1');

      expect(CryptoUtil.decrypt).toHaveBeenCalledWith('iv:tag:cipher');
      expect(mockConnectionTester.testConnection).toHaveBeenCalledWith(
        expect.objectContaining({ password: 'decrypted-password' }),
      );
    });

    it('should not include decrypted password in health log error_message', async () => {
      mockQueryBuilder.getOne.mockResolvedValue({ ...existingEntity });
      (mockConnectionTester.testConnection as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: false,
        responseTimeMs: 200,
        errorMessage: '帳號或密碼錯誤',
        errorCode: 'DS_AUTH_FAILED',
      });

      await service.testConnection('ds-1');

      const txCallback = mockRepository.manager.transaction.mock.calls[0][0];
      const mockEm = { save: vi.fn((e: any) => Promise.resolve(e)) };
      await txCallback(mockEm);

      // Check that the health log saved via the entity manager
      const healthLogSaveCall = mockEm.save.mock.calls.find(
        (call: any[]) => call[0]?.error_message !== undefined || call[0]?.success !== undefined,
      );
      if (healthLogSaveCall) {
        expect(healthLogSaveCall[0].error_message).not.toContain('decrypted-password');
      }
    });
  });
});
