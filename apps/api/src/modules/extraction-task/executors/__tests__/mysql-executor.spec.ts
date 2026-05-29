import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MySQLExecutor, MySQLDriver } from '../mysql-executor';
import { Repository } from 'typeorm';
import { Datasource } from '@/database/entities/datasource.entity';
import { CryptoUtil } from '@/common/crypto/crypto.util';
import { randomBytes } from 'crypto';

const TEST_AES_KEY = randomBytes(32).toString('hex');

describe('MySQLExecutor', () => {
  let executor: MySQLExecutor;
  let mockDatasourceRepo: Partial<Repository<Datasource>>;
  let encryptedPassword: string;
  let mockQuery: ReturnType<typeof vi.fn>;
  let mockEnd: ReturnType<typeof vi.fn>;
  let mockDriver: MySQLDriver;

  beforeEach(() => {
    vi.clearAllMocks();

    process.env.AES_ENCRYPTION_KEY = TEST_AES_KEY;
    encryptedPassword = CryptoUtil.encrypt('test-password');

    mockDatasourceRepo = {
      findOne: vi.fn().mockResolvedValue({
        id: 'ds-1',
        host: '10.0.0.1',
        port: 3306,
        database_name: 'mydb',
        username: 'root',
        encrypted_password: encryptedPassword,
        type: 'mysql',
      } as Partial<Datasource>),
    };

    mockQuery = vi.fn();
    mockEnd = vi.fn();
    mockDriver = {
      createConnection: vi.fn().mockResolvedValue({
        query: mockQuery,
        end: mockEnd,
      }),
    };

    executor = new MySQLExecutor(
      mockDatasourceRepo as Repository<Datasource>,
      mockDriver,
    );
  });

  // --- listSchemas ---
  it('should call SHOW DATABASES for listSchemas', async () => {
    mockQuery.mockResolvedValue([[
      { Database: 'mydb' },
      { Database: 'testdb' },
    ]]);

    const result = await executor.listSchemas({ datasourceId: 'ds-1' });

    expect(mockQuery).toHaveBeenCalledWith('SHOW DATABASES');
    expect(result).toEqual(['mydb', 'testdb']);
  });

  // --- listTables ---
  it('should call SHOW TABLES FROM `schema` for listTables', async () => {
    mockQuery.mockResolvedValue([[
      { 'Tables_in_mydb': 'users' },
      { 'Tables_in_mydb': 'orders' },
    ]]);

    const result = await executor.listTables({ datasourceId: 'ds-1', schema: 'mydb' });

    expect(mockQuery).toHaveBeenCalledWith('SHOW TABLES FROM `mydb`');
    expect(result).toEqual(['users', 'orders']);
  });

  it('should escape backticks in schema name for listTables', async () => {
    mockQuery.mockResolvedValue([[]]);

    await executor.listTables({ datasourceId: 'ds-1', schema: 'my`db' });

    expect(mockQuery).toHaveBeenCalledWith('SHOW TABLES FROM `my``db`');
  });

  // --- getSourceTableMetadata ---
  it('should query INFORMATION_SCHEMA.COLUMNS for metadata', async () => {
    mockQuery.mockResolvedValue([[
      { COLUMN_NAME: 'id', DATA_TYPE: 'int', COLUMN_KEY: 'PRI' },
      { COLUMN_NAME: 'name', DATA_TYPE: 'varchar', COLUMN_KEY: '' },
    ]]);

    const result = await executor.getSourceTableMetadata({
      datasourceId: 'ds-1',
      sourceTable: 'users',
      sourceSchema: 'mydb',
    });

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('INFORMATION_SCHEMA.COLUMNS'),
      ['mydb', 'users'],
    );
    expect(result).toEqual([
      { name: 'id', dataType: 'int', isPrimary: true },
      { name: 'name', dataType: 'varchar', isPrimary: false },
    ]);
  });

  // --- getSourceCount ---
  it('should generate correct COUNT SQL for full mode', async () => {
    mockQuery.mockResolvedValue([[{ cnt: 42 }]]);

    const result = await executor.getSourceCount({
      datasourceId: 'ds-1',
      sourceTable: 'users',
      sourceSchema: 'mydb',
      mode: 'full',
    });

    expect(mockQuery).toHaveBeenCalledWith(
      'SELECT COUNT(*) AS cnt FROM `mydb`.`users`',
      [],
    );
    expect(result).toBe(42);
  });

  it('should generate correct COUNT SQL for incremental mode', async () => {
    mockQuery.mockResolvedValue([[{ cnt: 10 }]]);

    const result = await executor.getSourceCount({
      datasourceId: 'ds-1',
      sourceTable: 'users',
      sourceSchema: 'mydb',
      mode: 'incremental',
      incrementalColumn: 'updated_at',
      lastIncrementalValue: '2024-01-01',
    });

    expect(mockQuery).toHaveBeenCalledWith(
      'SELECT COUNT(*) AS cnt FROM `mydb`.`users` WHERE `updated_at` > ?',
      ['2024-01-01'],
    );
    expect(result).toBe(10);
  });

  // --- readBatch ---
  // Full mode uses OFFSET pagination (no ORDER BY, no lastKeyValue) to avoid
  // data loss with composite PKs; keyset is reserved for incremental mode.
  it('should generate correct SELECT with LIMIT/OFFSET for full mode readBatch', async () => {
    mockQuery.mockResolvedValue([[
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
    ]]);

    const result = await executor.readBatch({
      datasourceId: 'ds-1',
      sourceTable: 'users',
      sourceSchema: 'mydb',
      mode: 'full',
      batchSize: 100,
    });

    expect(mockQuery).toHaveBeenCalledWith(
      'SELECT * FROM `mydb`.`users` LIMIT ? OFFSET ?',
      [100, 0],
    );
    expect(result.rows).toHaveLength(2);
    expect(result.hasMore).toBe(false);
    expect(result.lastKeyValue).toBeUndefined();
  });

  it('should generate correct SELECT with WHERE for incremental mode readBatch', async () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({
      id: i + 1,
      updated_at: `2024-01-${String(i + 1).padStart(2, '0')}`,
    }));
    mockQuery.mockResolvedValue([rows]);

    const result = await executor.readBatch({
      datasourceId: 'ds-1',
      sourceTable: 'users',
      sourceSchema: 'mydb',
      mode: 'incremental',
      incrementalColumn: 'updated_at',
      lastIncrementalValue: '2023-12-31',
      batchSize: 100,
    });

    expect(mockQuery).toHaveBeenCalledWith(
      'SELECT * FROM `mydb`.`users` WHERE `updated_at` > ? ORDER BY `updated_at` ASC LIMIT ?',
      ['2023-12-31', 100],
    );
    expect(result.hasMore).toBe(true);
  });

  it('should use keyset pagination with lastKeyValue in incremental mode', async () => {
    mockQuery.mockResolvedValue([[{ id: 11, name: 'Charlie' }]]);

    const result = await executor.readBatch({
      datasourceId: 'ds-1',
      sourceTable: 'users',
      sourceSchema: 'mydb',
      mode: 'incremental',
      incrementalColumn: 'id',
      batchSize: 10,
      lastKeyValue: 10,
    });

    expect(mockQuery).toHaveBeenCalledWith(
      'SELECT * FROM `mydb`.`users` WHERE `id` > ? ORDER BY `id` ASC LIMIT ?',
      [10, 10],
    );
    expect(result.rows).toHaveLength(1);
    expect(result.lastKeyValue).toBe(11);
  });

  // --- Connection handling ---
  it('should create connection with correct config including connectTimeout', async () => {
    mockQuery.mockResolvedValue([[]]);

    await executor.listSchemas({ datasourceId: 'ds-1' });

    expect(mockDriver.createConnection).toHaveBeenCalledWith({
      host: '10.0.0.1',
      port: 3306,
      database: 'mydb',
      user: 'root',
      password: 'test-password',
      connectTimeout: 10000,
    });
  });

  it('should always close connection even on query error', async () => {
    mockQuery.mockRejectedValue(new Error('Query failed'));

    await expect(executor.listSchemas({ datasourceId: 'ds-1' })).rejects.toThrow('Query failed');
    expect(mockEnd).toHaveBeenCalled();
  });

  it('should throw when connection fails', async () => {
    (mockDriver.createConnection as any).mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(executor.listSchemas({ datasourceId: 'ds-1' })).rejects.toThrow('ECONNREFUSED');
  });

  it('should throw when datasource is not found', async () => {
    (mockDatasourceRepo.findOne as any).mockResolvedValue(null);

    await expect(executor.listSchemas({ datasourceId: 'ds-999' })).rejects.toThrow('Datasource not found');
  });
});
