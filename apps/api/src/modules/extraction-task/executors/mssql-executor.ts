import { Repository } from 'typeorm';
import { Datasource } from '@/database/entities/datasource.entity';
import { ColumnMetadata } from '../extraction-executor.provider';
import { BaseExecutor } from './base-executor';

const CONNECT_TIMEOUT = 10000;
// 全量擷取走 OFFSET pagination，OFFSET 大時單批 query 可能 > 15s 預設 timeout（OBPOOLDATA
// 1.48M 列 × 122 寬欄到 offset ~660K 觀察值 > 15s 拋 'Timeout: Request failed to complete in 15000ms'）
// 設為 5 min 給寬表 + 高 offset 場景充足容忍度
const REQUEST_TIMEOUT = 300000;

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
        requestTimeout: REQUEST_TIMEOUT,
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

  /**
   * F075 v1.4.7 / AC-16：取得 SQL Server 表內各欄位的 MS_Description（extended property）。
   *
   * 用於 `pooldata-fields/available-columns` response 補上 `columnDescription` 欄位。
   *
   * 注意：
   *   - schema 為 null/undefined 時 fallback 'dbo'（沿用 `getSourceTableMetadata` 同款行為）
   *   - 查詢失敗由 caller（service 層）以 try/catch 降級為「全部欄位 omit columnDescription」
   *   - 回傳 Map<columnName, ms_description>；若該表無任何 extended_properties 則回空 Map
   */
  async getColumnDescriptions(params: {
    datasourceId: string;
    sourceSchema?: string | null;
    sourceTable: string;
  }): Promise<Map<string, string>> {
    return this.withConnection(params.datasourceId, async (pool) => {
      const schema = params.sourceSchema || 'dbo';
      const schemaTable = `${schema}.${params.sourceTable}`;

      const result = await pool
        .request()
        .input('schema_table', schemaTable)
        .query(
          `SELECT
             c.name            AS column_name,
             ep.value          AS ms_description
           FROM sys.columns c
           JOIN sys.extended_properties ep
             ON  ep.major_id   = c.object_id
             AND ep.minor_id   = c.column_id
             AND ep.class      = 1
             AND ep.name       = 'MS_Description'
           WHERE c.object_id = OBJECT_ID(@schema_table)`,
        );

      const map = new Map<string, string>();
      for (const row of result.recordset as Array<{
        column_name: string;
        ms_description: string | null;
      }>) {
        if (row.column_name && row.ms_description) {
          map.set(row.column_name, String(row.ms_description));
        }
      }
      return map;
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
    offset?: number;
  }): Promise<{ rows: Record<string, any>[]; lastKeyValue?: any; hasMore: boolean }> {
    return this.withConnection(params.datasourceId, async (pool) => {
      const tableName = this.qualifiedTable(params.sourceSchema, params.sourceTable);
      const conditions: string[] = [];
      const request = pool.request();

      // Incremental mode: use keyset pagination on the incremental column
      // Full mode: always use offset pagination to avoid data loss with composite PKs
      const useKeyset = params.mode === 'incremental' && !!params.incrementalColumn;

      if (useKeyset && params.lastIncrementalValue != null) {
        conditions.push(`${this.quoteIdentifier(params.incrementalColumn!)} > @lastIncrValue`);
        request.input('lastIncrValue', params.lastIncrementalValue);
      }

      if (useKeyset && params.lastKeyValue != null) {
        conditions.push(`${this.quoteIdentifier(params.incrementalColumn!)} > @lastKey`);
        request.input('lastKey', params.lastKeyValue);
      }

      let sql = `SELECT * FROM ${tableName}`;
      if (conditions.length > 0) {
        sql += ` WHERE ${conditions.join(' AND ')}`;
      }
      if (useKeyset) {
        sql += ` ORDER BY ${this.quoteIdentifier(params.incrementalColumn!)} ASC`;
        sql += ` OFFSET 0 ROWS FETCH NEXT @batchSize ROWS ONLY`;
      } else {
        sql += ` ORDER BY (SELECT NULL) OFFSET @offsetVal ROWS FETCH NEXT @batchSize ROWS ONLY`;
        request.input('offsetVal', params.offset || 0);
      }
      request.input('batchSize', params.batchSize);

      const result = await request.query(sql);
      const resultRows = result.recordset as Record<string, any>[];
      const hasMore = resultRows.length === params.batchSize;

      let lastKeyVal: any = undefined;
      if (resultRows.length > 0 && useKeyset) {
        const lastRow = resultRows[resultRows.length - 1];
        lastKeyVal = lastRow[params.incrementalColumn!];
      }

      return { rows: resultRows, lastKeyValue: lastKeyVal, hasMore };
    });
  }
}
