import { Repository } from 'typeorm';
import { Datasource } from '@/database/entities/datasource.entity';
import { ColumnMetadata } from '../extraction-executor.provider';
import { BaseExecutor } from './base-executor';

const CONNECT_TIMEOUT = 10000;

export interface MSSQLDriver {
  ConnectionPool: new (config: any) => any;
}

export class MSSQLExecutor extends BaseExecutor {
  private driver: MSSQLDriver;

  constructor(datasourceRepository: Repository<Datasource>, driver?: MSSQLDriver) {
    super(datasourceRepository);
    this.driver = driver || require('mssql');
  }

  protected quoteIdentifier(name: string): string {
    return '[' + name.replace(/\]/g, ']]') + ']';
  }

  /**
   * Create an isolated ConnectionPool per call to avoid global pool conflicts
   * when multiple extraction tasks run concurrently.
   */
  private async withConnection<T>(
    datasourceId: string,
    fn: (pool: any) => Promise<T>,
  ): Promise<T> {
    const connInfo = await this.resolveConnection(datasourceId);
    const pool = new this.driver.ConnectionPool({
      server: connInfo.host,
      port: connInfo.port,
      database: connInfo.database,
      user: connInfo.username,
      password: connInfo.password,
      options: {
        encrypt: false,
        trustServerCertificate: true,
        connectTimeout: CONNECT_TIMEOUT,
      },
    });
    try {
      await pool.connect();
      return await fn(pool);
    } finally {
      try { await pool.close(); } catch { /* ignore */ }
    }
  }

  async listSchemas(params: { datasourceId: string }): Promise<string[]> {
    return this.withConnection(params.datasourceId, async (pool) => {
      const result = await pool.request().query(
        `SELECT name FROM sys.schemas WHERE name NOT IN ('sys', 'guest', 'INFORMATION_SCHEMA') ORDER BY name`,
      );
      return result.recordset.map((row: any) => row.name);
    });
  }

  async listTables(params: { datasourceId: string; schema: string }): Promise<string[]> {
    return this.withConnection(params.datasourceId, async (pool) => {
      const result = await pool.request()
        .input('schema', params.schema)
        .query(
          `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = @schema AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME`,
        );
      return result.recordset.map((row: any) => row.TABLE_NAME);
    });
  }

  async getSourceTableMetadata(params: {
    datasourceId: string;
    sourceTable: string;
    sourceSchema?: string | null;
  }): Promise<ColumnMetadata[]> {
    return this.withConnection(params.datasourceId, async (pool) => {
      const schema = params.sourceSchema || 'dbo';

      const colResult = await pool.request()
        .input('schema', schema)
        .input('table', params.sourceTable)
        .query(
          `SELECT COLUMN_NAME, DATA_TYPE
           FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = @table
           ORDER BY ORDINAL_POSITION`,
        );

      const pkResult = await pool.request()
        .input('schema', schema)
        .input('table', params.sourceTable)
        .query(
          `SELECT kcu.COLUMN_NAME
           FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
           JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
             ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
             AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA
           WHERE tc.TABLE_SCHEMA = @schema AND tc.TABLE_NAME = @table AND tc.CONSTRAINT_TYPE = 'PRIMARY KEY'`,
        );

      const pkColumns = new Set(pkResult.recordset.map((r: any) => r.COLUMN_NAME));

      return colResult.recordset.map((row: any) => ({
        name: row.COLUMN_NAME,
        dataType: row.DATA_TYPE,
        isPrimary: pkColumns.has(row.COLUMN_NAME),
      }));
    });
  }

  async getSourceCount(params: {
    datasourceId: string;
    sourceTable: string;
    sourceSchema?: string | null;
    mode: 'full' | 'incremental';
    incrementalColumn?: string | null;
    lastIncrementalValue?: string | null;
  }): Promise<number> {
    return this.withConnection(params.datasourceId, async (pool) => {
      const tableName = this.qualifiedTable(params.sourceSchema, params.sourceTable);
      let sql = `SELECT COUNT(*) AS cnt FROM ${tableName}`;
      const request = pool.request();

      if (params.mode === 'incremental' && params.incrementalColumn && params.lastIncrementalValue != null) {
        sql += ` WHERE ${this.quoteIdentifier(params.incrementalColumn)} > @lastValue`;
        request.input('lastValue', params.lastIncrementalValue);
      }

      const result = await request.query(sql);
      return Number(result.recordset[0].cnt);
    });
  }

  async readBatch(params: {
    datasourceId: string;
    sourceTable: string;
    sourceSchema?: string | null;
    mode: 'full' | 'incremental';
    incrementalColumn?: string | null;
    lastIncrementalValue?: string | null;
    batchSize: number;
    lastKeyValue?: any;
    primaryKeyColumn?: string | null;
  }): Promise<{ rows: Record<string, any>[]; lastKeyValue?: any; hasMore: boolean }> {
    return this.withConnection(params.datasourceId, async (pool) => {
      const tableName = this.qualifiedTable(params.sourceSchema, params.sourceTable);
      const conditions: string[] = [];
      const request = pool.request();
      const orderCol = params.incrementalColumn || params.primaryKeyColumn || 'id';

      if (params.mode === 'incremental' && params.incrementalColumn && params.lastIncrementalValue != null) {
        conditions.push(`${this.quoteIdentifier(params.incrementalColumn)} > @lastIncrValue`);
        request.input('lastIncrValue', params.lastIncrementalValue);
      }

      if (params.lastKeyValue != null) {
        conditions.push(`${this.quoteIdentifier(orderCol)} > @lastKey`);
        request.input('lastKey', params.lastKeyValue);
      }

      let sql = `SELECT * FROM ${tableName}`;
      if (conditions.length > 0) {
        sql += ` WHERE ${conditions.join(' AND ')}`;
      }
      sql += ` ORDER BY ${this.quoteIdentifier(orderCol)} ASC`;
      sql += ` OFFSET 0 ROWS FETCH NEXT @batchSize ROWS ONLY`;
      request.input('batchSize', params.batchSize);

      const result = await request.query(sql);
      const resultRows = result.recordset as Record<string, any>[];
      const hasMore = resultRows.length === params.batchSize;

      let lastKeyVal: any = undefined;
      if (resultRows.length > 0) {
        const lastRow = resultRows[resultRows.length - 1];
        lastKeyVal = lastRow[orderCol];
      }

      return { rows: resultRows, lastKeyValue: lastKeyVal, hasMore };
    });
  }
}
