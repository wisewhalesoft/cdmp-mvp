import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { DashboardService } from '../dashboard.service';
import { Datasource } from '@/database/entities/datasource.entity';
import { DatasourceHealthLog } from '@/database/entities/datasource-health-log.entity';

describe('DashboardService', () => {
  let service: DashboardService;

  const mockDsQueryBuilder = {
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    getMany: vi.fn(),
    getOne: vi.fn(),
  };

  const mockLogQueryBuilder = {
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    getMany: vi.fn(),
  };

  const mockDsRepository = {
    createQueryBuilder: vi.fn().mockReturnValue(mockDsQueryBuilder),
  };

  const mockLogRepository = {
    createQueryBuilder: vi.fn().mockReturnValue(mockLogQueryBuilder),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    // Reset mock return values
    mockDsRepository.createQueryBuilder.mockReturnValue(mockDsQueryBuilder);
    mockLogRepository.createQueryBuilder.mockReturnValue(mockLogQueryBuilder);

    // Default: no health logs (for consecutive failures calculations)
    mockLogQueryBuilder.getMany.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        {
          provide: getRepositoryToken(Datasource),
          useValue: mockDsRepository,
        },
        {
          provide: getRepositoryToken(DatasourceHealthLog),
          useValue: mockLogRepository,
        },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
  });

  // Helper: create mock datasource entities
  function makeDatasource(overrides: Partial<Datasource> = {}): Partial<Datasource> {
    return {
      id: 'ds-1',
      name: 'Test DS',
      type: 'mysql',
      status: 'connected',
      last_tested_at: new Date('2026-01-15'),
      deleted_at: null,
      created_at: new Date('2026-01-01'),
      ...overrides,
    };
  }

  function makeHealthLog(overrides: Partial<DatasourceHealthLog> = {}): Partial<DatasourceHealthLog> {
    return {
      id: 'log-1',
      datasource_id: 'ds-1',
      success: true,
      response_time_ms: 42,
      error_message: null,
      checked_at: new Date('2026-01-15T10:00:00Z'),
      ...overrides,
    };
  }

  // TS-F016-001: 摘要統計正確
  describe('getDashboard - TS-F016-001', () => {
    it('should return correct summary statistics', async () => {
      const datasources = [
        makeDatasource({ id: 'ds-1', type: 'mysql', status: 'connected' }),
        makeDatasource({ id: 'ds-2', type: 'mysql', status: 'connected' }),
        makeDatasource({ id: 'ds-3', type: 'postgresql', status: 'connected' }),
        makeDatasource({ id: 'ds-4', type: 'sqlserver', status: 'disconnected' }),
        makeDatasource({ id: 'ds-5', type: 'postgresql', status: 'unknown' }),
      ];
      mockDsQueryBuilder.getMany.mockResolvedValue(datasources);

      const result = await service.getDashboard();

      expect(result.summary.total).toBe(5);
      expect(result.summary.connected).toBe(3);
      expect(result.summary.disconnected).toBe(1);
      expect(result.summary.unknown).toBe(1);
      // Verify total = connected + disconnected + unknown
      expect(result.summary.total).toBe(
        result.summary.connected + result.summary.disconnected + result.summary.unknown,
      );
    });
  });

  // TS-F016-002: 類型分佈正確
  describe('getDashboard - TS-F016-002', () => {
    it('should return correct typeCounts', async () => {
      const datasources = [
        makeDatasource({ id: 'ds-1', type: 'mysql' }),
        makeDatasource({ id: 'ds-2', type: 'mysql' }),
        makeDatasource({ id: 'ds-3', type: 'postgresql' }),
        makeDatasource({ id: 'ds-4', type: 'postgresql' }),
        makeDatasource({ id: 'ds-5', type: 'sqlserver' }),
      ];
      mockDsQueryBuilder.getMany.mockResolvedValue(datasources);

      const result = await service.getDashboard();

      expect(result.summary.typeCounts).toEqual({
        mysql: 2,
        postgresql: 2,
        sqlserver: 1,
      });
    });
  });

  // TS-F016-003: 效能趨勢圖 24h
  describe('getMetrics - TS-F016-003', () => {
    it('should return datapoints for 24h range', async () => {
      const ds = makeDatasource({ id: 'ds-1' });
      mockDsQueryBuilder.getOne.mockResolvedValue(ds);

      // Create 48 health log entries within 24h
      const now = Date.now();
      const logs = Array.from({ length: 48 }, (_, i) =>
        makeHealthLog({
          id: `log-${i}`,
          datasource_id: 'ds-1',
          checked_at: new Date(now - (48 - i) * 30 * 60 * 1000), // every 30 min
          response_time_ms: 40 + Math.floor(Math.random() * 20),
        }),
      );
      mockLogQueryBuilder.getMany.mockResolvedValue(logs);

      const result = await service.getMetrics('ds-1', '24h');

      expect(result.datasourceId).toBe('ds-1');
      expect(result.range).toBe('24h');
      expect(result.datapoints).toHaveLength(48);
      // Verify each datapoint has required fields
      result.datapoints.forEach((dp) => {
        expect(dp).toHaveProperty('timestamp');
        expect(dp).toHaveProperty('responseTimeMs');
        expect(dp).toHaveProperty('success');
      });
    });
  });

  // TS-F016-004: 效能趨勢圖 7d
  describe('getMetrics - TS-F016-004', () => {
    it('should return datapoints for 7d range', async () => {
      const ds = makeDatasource({ id: 'ds-1' });
      mockDsQueryBuilder.getOne.mockResolvedValue(ds);

      const logs = Array.from({ length: 10 }, (_, i) =>
        makeHealthLog({
          id: `log-${i}`,
          datasource_id: 'ds-1',
          checked_at: new Date(Date.now() - i * 24 * 60 * 60 * 1000),
        }),
      );
      mockLogQueryBuilder.getMany.mockResolvedValue(logs);

      const result = await service.getMetrics('ds-1', '7d');

      expect(result.range).toBe('7d');
      expect(result.datapoints.length).toBe(10);
    });
  });

  // TS-F016-005: 警示觸發（連續 2 次失敗）
  describe('getAlerts - TS-F016-005', () => {
    it('should return alerts for datasources with >= 2 consecutive failures', async () => {
      const datasources = [
        makeDatasource({ id: 'ds-1', name: 'Healthy DS', status: 'connected' }),
        makeDatasource({ id: 'ds-2', name: 'Failing DS', status: 'disconnected' }),
      ];
      mockDsQueryBuilder.getMany.mockResolvedValue(datasources);

      // Mock: ds-1 has no failures, ds-2 has 3 consecutive failures
      mockLogRepository.createQueryBuilder.mockImplementation(() => {
        const qb = {
          where: vi.fn().mockReturnThis(),
          andWhere: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockReturnThis(),
          getMany: vi.fn(),
        };

        // We need to track which datasource_id was called
        qb.where.mockImplementation((_: string, params: any) => {
          if (params?.dsId === 'ds-1') {
            qb.getMany.mockResolvedValue([]); // no logs
          } else if (params?.dsId === 'ds-2') {
            qb.getMany.mockResolvedValue([
              makeHealthLog({ id: 'log-3', datasource_id: 'ds-2', success: false, error_message: '連線被拒', checked_at: new Date('2026-01-15T12:00:00Z') }),
              makeHealthLog({ id: 'log-2', datasource_id: 'ds-2', success: false, error_message: '連線逾時', checked_at: new Date('2026-01-15T11:30:00Z') }),
              makeHealthLog({ id: 'log-1', datasource_id: 'ds-2', success: false, error_message: '無法連線', checked_at: new Date('2026-01-15T11:00:00Z') }),
            ]);
          }
          return qb;
        });
        return qb;
      });

      const result = await service.getAlerts();

      expect(result.alerts).toHaveLength(1);
      expect(result.alerts[0].datasourceId).toBe('ds-2');
      expect(result.alerts[0].consecutiveFailures).toBe(3);
      expect(result.alerts[0].lastErrorMessage).toBe('連線被拒');
      expect(result.alerts[0].firstFailureTime).toEqual(new Date('2026-01-15T11:00:00Z'));
    });
  });

  // TS-F016-006: 警示移除（恢復連線）
  describe('getAlerts - TS-F016-006', () => {
    it('should not include datasource that has recovered (latest log is success)', async () => {
      const datasources = [
        makeDatasource({ id: 'ds-1', name: 'Recovered DS', status: 'connected' }),
      ];
      mockDsQueryBuilder.getMany.mockResolvedValue(datasources);

      // Most recent log is success, so consecutive failures = 0
      mockLogRepository.createQueryBuilder.mockImplementation(() => {
        const qb = {
          where: vi.fn().mockReturnThis(),
          andWhere: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockReturnThis(),
          getMany: vi.fn().mockResolvedValue([
            makeHealthLog({ success: true, checked_at: new Date('2026-01-15T12:00:00Z') }),
            makeHealthLog({ success: false, error_message: 'error', checked_at: new Date('2026-01-15T11:30:00Z') }),
            makeHealthLog({ success: false, error_message: 'error', checked_at: new Date('2026-01-15T11:00:00Z') }),
          ]),
        };
        return qb;
      });

      const result = await service.getAlerts();

      expect(result.alerts).toHaveLength(0);
    });
  });

  // TS-F016-008: 排除軟刪除資料來源
  describe('getDashboard - TS-F016-008', () => {
    it('should not include soft-deleted datasources (query filters deleted_at IS NULL)', async () => {
      // The service queries with deleted_at IS NULL, so the mock only returns non-deleted
      const datasources = [
        makeDatasource({ id: 'ds-1', status: 'connected' }),
      ];
      mockDsQueryBuilder.getMany.mockResolvedValue(datasources);

      const result = await service.getDashboard();

      expect(result.summary.total).toBe(1);
      // Verify the query builder was called with deleted_at IS NULL filter
      expect(mockDsQueryBuilder.where).toHaveBeenCalledWith('ds.deleted_at IS NULL');
    });
  });

  // TS-F016-010: 無資料時的趨勢圖
  describe('getMetrics - TS-F016-010', () => {
    it('should return empty datapoints when no health logs exist', async () => {
      const ds = makeDatasource({ id: 'ds-1' });
      mockDsQueryBuilder.getOne.mockResolvedValue(ds);
      mockLogQueryBuilder.getMany.mockResolvedValue([]);

      const result = await service.getMetrics('ds-1', '24h');

      expect(result.datasourceId).toBe('ds-1');
      expect(result.range).toBe('24h');
      expect(result.datapoints).toEqual([]);
    });

    it('should throw NotFoundException for non-existent datasource', async () => {
      mockDsQueryBuilder.getOne.mockResolvedValue(null);

      await expect(service.getMetrics('nonexistent', '24h'))
        .rejects.toThrow(NotFoundException);
    });
  });

  // Additional: alerts sorted by consecutiveFailures DESC
  describe('getAlerts - sorting', () => {
    it('should sort alerts by consecutiveFailures DESC', async () => {
      const datasources = [
        makeDatasource({ id: 'ds-1', name: 'DS A', type: 'mysql' }),
        makeDatasource({ id: 'ds-2', name: 'DS B', type: 'postgresql' }),
      ];
      mockDsQueryBuilder.getMany.mockResolvedValue(datasources);

      mockLogRepository.createQueryBuilder.mockImplementation(() => {
        const qb = {
          where: vi.fn().mockReturnThis(),
          andWhere: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockReturnThis(),
          getMany: vi.fn(),
        };

        qb.where.mockImplementation((_: string, params: any) => {
          if (params?.dsId === 'ds-1') {
            // 2 consecutive failures
            qb.getMany.mockResolvedValue([
              makeHealthLog({ success: false, error_message: 'err', checked_at: new Date('2026-01-15T12:00:00Z') }),
              makeHealthLog({ success: false, error_message: 'err', checked_at: new Date('2026-01-15T11:30:00Z') }),
            ]);
          } else if (params?.dsId === 'ds-2') {
            // 5 consecutive failures
            qb.getMany.mockResolvedValue([
              makeHealthLog({ success: false, error_message: 'err', checked_at: new Date('2026-01-15T12:00:00Z') }),
              makeHealthLog({ success: false, error_message: 'err', checked_at: new Date('2026-01-15T11:30:00Z') }),
              makeHealthLog({ success: false, error_message: 'err', checked_at: new Date('2026-01-15T11:00:00Z') }),
              makeHealthLog({ success: false, error_message: 'err', checked_at: new Date('2026-01-15T10:30:00Z') }),
              makeHealthLog({ success: false, error_message: 'err', checked_at: new Date('2026-01-15T10:00:00Z') }),
            ]);
          }
          return qb;
        });
        return qb;
      });

      const result = await service.getAlerts();

      expect(result.alerts).toHaveLength(2);
      expect(result.alerts[0].consecutiveFailures).toBe(5);
      expect(result.alerts[0].datasourceId).toBe('ds-2');
      expect(result.alerts[1].consecutiveFailures).toBe(2);
      expect(result.alerts[1].datasourceId).toBe('ds-1');
    });
  });
});
