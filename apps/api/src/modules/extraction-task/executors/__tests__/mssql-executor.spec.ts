import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MSSQLExecutor, MSSQLDriver } from '../mssql-executor';
import { Repository } from 'typeorm';
import { Datasource } from '@/database/entities/datasource.entity';
import { CryptoUtil } from '@/common/crypto/crypto.util';
import { randomBytes } from 'crypto';

const TEST_AES_KEY = randomBytes(32).toString('hex');

describe('MSSQLExecutor', () => {
  let executor: MSSQLExecutor;
  let mockDatasourceRepo: Partial<Repository<Datasource>>;
  let encryptedPassword: string;
  let mockRequestQuery: ReturnType<typeof vi.fn>;
  let mockRequestInput: ReturnType<typeof vi.fn>;
  let mockClose: ReturnType<typeof vi.fn>;
  let mockDriver: MSSQLDriver;
  let lastConnectConfig: any;

  function createMockRequest() {
    const req: any = {
      input: (...args: any[]) => {
        mockRequestInput(...args);
        return req;
      },
      query: mockRequestQuery,
    };
    return req;
  }

  beforeEach(() => {
    vi.clearAllMocks();

    process.env.AES_ENCRYPTION_KEY = TEST_AES_KEY;
    encryptedPassword = CryptoUtil.encrypt('mssql-pass');

    mockDatasourceRepo = {
      findOne: vi.fn().mockResolvedValue({
        id: 'ds-ms',
        host: '10.0.0.3',
        port: 1433,
        database_name: 'msdb',
        username: 'sa',
        encrypted_password: encryptedPassword,
        type: 'sqlserver',
      } as Partial<Datasource>),
    };

    mockRequestQuery = vi.fn();
    mockRequestInput = vi.fn();
    mockClose = vi.fn();
    lastConnectConfig = null;

    mockDriver = {
      ConnectionPool: vi.fn().mockImplementation((config: any) => {
        lastConnectConfig = config;
        return {
          connect: vi.fn().mockResolvedValue(undefined),
          request: () => createMockRequest(),
          close: mockClose,
        };
      }),
    } as any;

    executor = new MSSQLExecutor(
      mockDatasourceRepo as Repository<Datasource>,
      mockDriver,
    );
  });

  // --- listSchemas ---
  it('should query sys.schemas for listSchemas', async () => {
    mockRequestQuery.mockResolvedValue({
      recordset: [{ name: 'dbo' }, { name: 'sales' }],
    });

    const result = await executor.listSchemas({ datasourceId: 'ds-ms' });

    expect(mockRequestQuery).toHaveBeenCalledWith(
      expect.stringContaining('sys.schemas'),
    );
    expect(mockRequestQuery).toHaveBeenCalledWith(
      expect.stringContaining("NOT IN ('sys', 'guest', 'INFORMATION_SCHEMA')"),
    );
    expect(result).toEqual(['dbo', 'sales']);
  });

  // --- listTables ---
  it('should use @schema parameter for listTables', async () => {
    mockRequestQuery.mockResolvedValue({
      recordset: [{ TABLE_NAME: 'customers' }, { TABLE_NAME: 'orders' }],
    });

    const result = await executor.listTables({ datasourceId: 'ds-ms', schema: 'dbo' });

    expect(mockRequestInput).toHaveBeenCalledWith('schema', 'dbo');
    expect(mockRequestQuery).toHaveBeenCalledWith(
      expect.stringContaining('INFORMATION_SCHEMA.TABLES'),
    );
    expect(result).toEqual(['customers', 'orders']);
  });

  // --- getSourceTableMetadata ---
  it('should query INFORMATION_SCHEMA.COLUMNS and PK with @schema, @table params', async () => {
    mockRequestQuery
      .mockResolvedValueOnce({
        recordset: [
          { COLUMN_NAME: 'id', DATA_TYPE: 'int' },
          { COLUMN_NAME: 'name', DATA_TYPE: 'nvarchar' },
        ],
      })
      .mockResolvedValueOnce({
        recordset: [{ COLUMN_NAME: 'id' }],
      });

    const result = await executor.getSourceTableMetadata({
      datasourceId: 'ds-ms',
      sourceTable: 'customers',
      sourceSchema: 'dbo',
    });

    expect(mockRequestInput).toHaveBeenCalledWith('schema', 'dbo');
    expect(mockRequestInput).toHaveBeenCalledWith('table', 'customers');
    expect(result).toEqual([
      { name: 'id', dataType: 'int', isPrimary: true },
      { name: 'name', dataType: 'nvarchar', isPrimary: false },
    ]);
  });

  // --- getSourceCount ---
  it('should use bracket-quoted [schema].[table] for full mode count', async () => {
    mockRequestQuery.mockResolvedValue({ recordset: [{ cnt: 100 }] });

    const result = await executor.getSourceCount({
      datasourceId: 'ds-ms',
      sourceTable: 'customers',
      sourceSchema: 'dbo',
      mode: 'full',
    });

    expect(mockRequestQuery).toHaveBeenCalledWith(
      'SELECT COUNT(*) AS cnt FROM [dbo].[customers]',
    );
    expect(result).toBe(100);
  });

  it('should add WHERE with @lastValue for incremental count', async () => {
    mockRequestQuery.mockResolvedValue({ recordset: [{ cnt: 15 }] });

    await executor.getSourceCount({
      datasourceId: 'ds-ms',
      sourceTable: 'events',
      sourceSchema: 'dbo',
      mode: 'incremental',
      incrementalColumn: 'modified_at',
      lastIncrementalValue: '2024-03-01',
    });

    expect(mockRequestInput).toHaveBeenCalledWith('lastValue', '2024-03-01');
    expect(mockRequestQuery).toHaveBeenCalledWith(
      'SELECT COUNT(*) AS cnt FROM [dbo].[events] WHERE [modified_at] > @lastValue',
    );
  });

  // --- readBatch ---
  it('should use OFFSET/FETCH NEXT for readBatch in full mode', async () => {
    mockRequestQuery.mockResolvedValue({
      recordset: [{ id: 1, name: 'A' }],
    });

    const result = await executor.readBatch({
      datasourceId: 'ds-ms',
      sourceTable: 'customers',
      sourceSchema: 'dbo',
      mode: 'full',
      batchSize: 200,
    });

    expect(mockRequestInput).toHaveBeenCalledWith('batchSize', 200);
    expect(mockRequestQuery).toHaveBeenCalledWith(
      expect.stringContaining('OFFSET 0 ROWS FETCH NEXT @batchSize ROWS ONLY'),
    );
    expect(mockRequestQuery).toHaveBeenCalledWith(
      expect.stringContaining('[dbo].[customers]'),
    );
    expect(result.rows).toHaveLength(1);
    expect(result.hasMore).toBe(false);
  });

  it('should add keyset WHERE with @lastKey for pagination', async () => {
    mockRequestQuery.mockResolvedValue({ recordset: [] });

    await executor.readBatch({
      datasourceId: 'ds-ms',
      sourceTable: 'customers',
      sourceSchema: 'dbo',
      mode: 'full',
      batchSize: 50,
      lastKeyValue: 100,
    });

    expect(mockRequestInput).toHaveBeenCalledWith('lastKey', 100);
    expect(mockRequestQuery).toHaveBeenCalledWith(
      expect.stringContaining('[id] > @lastKey'),
    );
  });

  // --- Connection handling ---
  it('should connect with correct mssql config', async () => {
    mockRequestQuery.mockResolvedValue({ recordset: [] });

    await executor.listSchemas({ datasourceId: 'ds-ms' });

    expect(lastConnectConfig).toEqual({
      server: '10.0.0.3',
      port: 1433,
      database: 'msdb',
      user: 'sa',
      password: 'mssql-pass',
      options: {
        encrypt: false,
        trustServerCertificate: true,
        connectTimeout: 10000,
      },
    });
  });

  it('should always close pool even on error', async () => {
    mockRequestQuery.mockRejectedValue(new Error('MSSQL error'));

    await expect(executor.listSchemas({ datasourceId: 'ds-ms' })).rejects.toThrow('MSSQL error');
    expect(mockClose).toHaveBeenCalled();
  });

  it('should escape brackets in identifiers', async () => {
    mockRequestQuery.mockResolvedValue({ recordset: [{ cnt: 0 }] });

    await executor.getSourceCount({
      datasourceId: 'ds-ms',
      sourceTable: 'my]table',
      sourceSchema: 'my]schema',
      mode: 'full',
    });

    expect(mockRequestQuery).toHaveBeenCalledWith(
      'SELECT COUNT(*) AS cnt FROM [my]]schema].[my]]table]',
    );
  });
});
