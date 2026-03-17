import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { HealthCheckService } from '../health-check.service';
import { DatasourceService } from '@/modules/datasource/datasource.service';
import { Datasource } from '@/database/entities/datasource.entity';

describe('HealthCheckService - TS-F016-009', () => {
  let service: HealthCheckService;
  let mockDatasourceService: { testConnection: ReturnType<typeof vi.fn> };

  const mockDsQueryBuilder = {
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    getMany: vi.fn(),
  };

  const mockDsRepository = {
    createQueryBuilder: vi.fn().mockReturnValue(mockDsQueryBuilder),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    mockDatasourceService = {
      testConnection: vi.fn(),
    };

    mockDsRepository.createQueryBuilder.mockReturnValue(mockDsQueryBuilder);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthCheckService,
        {
          provide: DatasourceService,
          useValue: mockDatasourceService,
        },
        {
          provide: getRepositoryToken(Datasource),
          useValue: mockDsRepository,
        },
      ],
    }).compile();

    service = module.get<HealthCheckService>(HealthCheckService);
  });

  it('should test all non-deleted datasources', async () => {
    const datasources = [
      { id: 'ds-1', name: 'Active DS 1', deleted_at: null },
      { id: 'ds-2', name: 'Active DS 2', deleted_at: null },
    ];
    mockDsQueryBuilder.getMany.mockResolvedValue(datasources);
    mockDatasourceService.testConnection.mockResolvedValue({
      success: true,
      message: '連線成功 (42ms)',
      responseTime: 42,
    });

    await service.handleHealthCheck();

    expect(mockDsRepository.createQueryBuilder).toHaveBeenCalledWith('ds');
    expect(mockDsQueryBuilder.where).toHaveBeenCalledWith('ds.deleted_at IS NULL');
    expect(mockDatasourceService.testConnection).toHaveBeenCalledTimes(2);
    expect(mockDatasourceService.testConnection).toHaveBeenCalledWith('ds-1');
    expect(mockDatasourceService.testConnection).toHaveBeenCalledWith('ds-2');
  });

  it('should not test soft-deleted datasources (query filters them out)', async () => {
    // Only non-deleted datasources returned by the query
    const datasources = [
      { id: 'ds-1', name: 'Active DS', deleted_at: null },
    ];
    mockDsQueryBuilder.getMany.mockResolvedValue(datasources);
    mockDatasourceService.testConnection.mockResolvedValue({
      success: true,
      message: '連線成功 (42ms)',
      responseTime: 42,
    });

    await service.handleHealthCheck();

    expect(mockDatasourceService.testConnection).toHaveBeenCalledTimes(1);
    expect(mockDatasourceService.testConnection).toHaveBeenCalledWith('ds-1');
  });

  it('should handle individual datasource test failure gracefully', async () => {
    const datasources = [
      { id: 'ds-1', name: 'Failing DS', deleted_at: null },
      { id: 'ds-2', name: 'Working DS', deleted_at: null },
    ];
    mockDsQueryBuilder.getMany.mockResolvedValue(datasources);

    mockDatasourceService.testConnection
      .mockRejectedValueOnce(new Error('Connection error'))
      .mockResolvedValueOnce({
        success: true,
        message: '連線成功 (42ms)',
        responseTime: 42,
      });

    // Should not throw even if one datasource fails
    await expect(service.handleHealthCheck()).resolves.not.toThrow();
    expect(mockDatasourceService.testConnection).toHaveBeenCalledTimes(2);
  });

  it('should do nothing when no datasources exist', async () => {
    mockDsQueryBuilder.getMany.mockResolvedValue([]);

    await service.handleHealthCheck();

    expect(mockDatasourceService.testConnection).not.toHaveBeenCalled();
  });
});
