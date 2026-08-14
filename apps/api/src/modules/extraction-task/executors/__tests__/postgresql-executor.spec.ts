import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PostgreSQLExecutor, PgDriver } from '../postgresql-executor';
import { Repository } from 'typeorm';
import { Datasource } from '@/database/entities/datasource.entity';
import { CryptoUtil } from '@/common/crypto/crypto.util';
import { randomBytes } from 'crypto';

const TEST_AES_KEY = randomBytes(32).toString('hex');

describe('PostgreSQLExecutor', () => {
  let executor: PostgreSQLExecutor;
  let mockDatasourceRepo: Partial<Repository<Datasource>>;
  let encryptedPassword: string;
  let mockQuery: ReturnType<typeof vi.fn>;
  let mockConnect: ReturnType<typeof vi.fn>;
  let mockEnd: ReturnType<typeof vi.fn>;
  let mockDriver: PgDriver;
  let lastClientConfig: any;

  beforeEach(() => {
    vi.clearAllMocks();

    process.env.AES_ENCRYPTION_KEY = TEST_AES_KEY;
    encryptedPassword = CryptoUtil.encrypt('pg-password');

    mockDatasourceRepo = {
      findOne: vi.fn().mockResolvedValue({
        id: 'ds-pg',
        host: '10.0.0.2',
        port: 5432,
        database_name: 'pgdb',
        username: 'postgres',
        encrypted_password: encryptedPassword,
        type: 'postgresql',
      } as Partial<Datasource>),
    };

    mockQuery = vi.fn();
    mockConnect = vi.fn().mockResolvedValue(undefined);
    mockEnd = vi.fn().mockResolvedValue(undefined);
    lastClientConfig = null;

    mockDriver = {
      Client: class MockClient {
        query = mockQuery;
        connect = mockConnect;
        end = mockEnd;
        constructor(config: any) {
          lastClientConfig = config;
        }
      } as any,
    };

    executor = new PostgreSQLExecutor(
      mockDatasourceRepo as Repository<Datasource>,
      mockDriver,
    );
  });

  // --- listSchemas ---
  it('should query information_schema.schemata for listSchemas', async () => {
    mockQuery.mockResolvedValue({
      rows: [{ schema_name: 'public' }, { schema_name: 'myschema' }],
    });

    const result = await executor.listSchemas({ datasourceId: 'ds-pg' });

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('information_schema.schemata'),
    );
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("NOT IN ('pg_catalog', 'pg_toast', 'information_schema')"),
    );
    expect(result).toEqual(['public', 'myschema']);
  });

  // --- listTables ---
  it('should use parameterized query ($1) for listTables', async () => {
    mockQuery.mockResolvedValue({
      rows: [{ table_name: 'users' }, { table_name: 'orders' }],
    });

    const result = await executor.listTables({ datasourceId: 'ds-pg', schema: 'public' });

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('$1'),
      ['public'],
    );
    expect(result).toEqual(['users', 'orders']);
  });

  it('should include views (table_type = VIEW) in listTables', async () => {
    mockQuery.mockResolvedValue({
      rows: [{ table_name: 'users' }, { table_name: 'v_cust_case_summary' }],
    });

    const result = await executor.listTables({ datasourceId: 'ds-pg', schema: 'public' });

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("table_type IN ('BASE TABLE', 'VIEW')"),
      ['public'],
    );
    expect(result).toEqual(['users', 'v_cust_case_summary']);
  });

  // --- getSourceTableMetadata ---
  it('should query columns and primary keys', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          { column_name: 'id', data_type: 'integer' },
          { column_name: 'name', data_type: 'character varying' },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ column_name: 'id' }],
      });

    const result = await executor.getSourceTableMetadata({
      datasourceId: 'ds-pg',
      sourceTable: 'users',
      sourceSchema: 'public',
    });

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('$1'),
      ['public', 'users'],
    );
    expect(result).toEqual([
      { name: 'id', dataType: 'integer', isPrimary: true },
      { name: 'name', dataType: 'character varying', isPrimary: false },
    ]);
  });

  // --- getSourceCount ---
  it('should use double-quoted table reference for full mode count', async () => {
    mockQuery.mockResolvedValue({ rows: [{ cnt: 55 }] });

    const result = await executor.getSourceCount({
      datasourceId: 'ds-pg',
      sourceTable: 'users',
      sourceSchema: 'public',
      mode: 'full',
    });

    expect(mockQuery).toHaveBeenCalledWith(
      'SELECT COUNT(*) AS cnt FROM "public"."users"',
      [],
    );
    expect(result).toBe(55);
  });

  it('should add WHERE clause with $1 for incremental mode count', async () => {
    mockQuery.mockResolvedValue({ rows: [{ cnt: 5 }] });

    await executor.getSourceCount({
      datasourceId: 'ds-pg',
      sourceTable: 'events',
      sourceSchema: 'public',
      mode: 'incremental',
      incrementalColumn: 'created_at',
      lastIncrementalValue: '2024-06-01',
    });

    expect(mockQuery).toHaveBeenCalledWith(
      'SELECT COUNT(*) AS cnt FROM "public"."events" WHERE "created_at" > $1',
      ['2024-06-01'],
    );
  });

  // --- readBatch ---
  // Full mode uses OFFSET pagination (no ORDER BY) to avoid data loss with
  // composite PKs; keyset is reserved for incremental mode (see test below).
  it('should use LIMIT/OFFSET for readBatch in full mode', async () => {
    mockQuery.mockResolvedValue({
      rows: [{ id: 1, name: 'Alice' }],
    });

    const result = await executor.readBatch({
      datasourceId: 'ds-pg',
      sourceTable: 'users',
      sourceSchema: 'public',
      mode: 'full',
      batchSize: 500,
    });

    expect(mockQuery).toHaveBeenCalledWith(
      'SELECT * FROM "public"."users" LIMIT $1 OFFSET $2',
      [500, 0],
    );
    expect(result.rows).toHaveLength(1);
    expect(result.hasMore).toBe(false);
  });

  it('should combine incremental WHERE + keyset pagination with correct $N params', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    await executor.readBatch({
      datasourceId: 'ds-pg',
      sourceTable: 'events',
      sourceSchema: 'public',
      mode: 'incremental',
      incrementalColumn: 'created_at',
      lastIncrementalValue: '2024-01-01',
      batchSize: 100,
      lastKeyValue: '2024-01-15',
    });

    expect(mockQuery).toHaveBeenCalledWith(
      'SELECT * FROM "public"."events" WHERE "created_at" > $1 AND "created_at" > $2 ORDER BY "created_at" ASC LIMIT $3',
      ['2024-01-01', '2024-01-15', 100],
    );
  });

  // --- Connection handling ---
  it('should create Client with correct config', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    await executor.listSchemas({ datasourceId: 'ds-pg' });

    expect(lastClientConfig).toEqual({
      host: '10.0.0.2',
      port: 5432,
      database: 'pgdb',
      user: 'postgres',
      password: 'pg-password',
      connectionTimeoutMillis: 10000,
    });
    expect(mockConnect).toHaveBeenCalled();
  });

  it('should always close client even on error', async () => {
    mockQuery.mockRejectedValue(new Error('PG error'));

    await expect(executor.listSchemas({ datasourceId: 'ds-pg' })).rejects.toThrow('PG error');
    expect(mockEnd).toHaveBeenCalled();
  });

  it('should escape double quotes in identifiers', async () => {
    mockQuery.mockResolvedValue({ rows: [{ cnt: 0 }] });

    await executor.getSourceCount({
      datasourceId: 'ds-pg',
      sourceTable: 'my"table',
      sourceSchema: 'my"schema',
      mode: 'full',
    });

    expect(mockQuery).toHaveBeenCalledWith(
      'SELECT COUNT(*) AS cnt FROM "my""schema"."my""table"',
      [],
    );
  });
});
