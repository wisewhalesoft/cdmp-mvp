import { Repository } from 'typeorm';
import { Datasource } from '@/database/entities/datasource.entity';
import { ColumnMetadata } from '../extraction-executor.provider';
import { BaseExecutor } from './base-executor';

const CONNECT_TIMEOUT = 10000;

export interface PgDriver {
  Client: new (config: any) => any;
}

export class PostgreSQLExecutor extends BaseExecutor {
  private driver: PgDriver;

  constructor(datasourceRepository: Repository<Datasource>, driver?: PgDriver) {
    super(datasourceRepository);
    this.driver = driver || require('pg');
  }

  protected quoteIdentifier(name: string): string {
    return '"' + name.replace(/"/g, '""') + '"';
  }

  private async withConnection<T>(
    datasourceId: string,
    fn: (client: any) => Promise<T>,
  ): Promise<T> {
    const connInfo = await this.resolveConnection(datasourceId);
    const client = new this.driver.Client({
      host: connInfo.host,
      port: connInfo.port,
      database: connInfo.database,
      user: connInfo.username,
      password: connInfo.password,
      connectionTimeoutMillis: CONNECT_TIMEOUT,
    });
    try {
      await client.connect();
      return await fn(client);
    } finally {
      try { await client.end(); } catch { /* ignore */ }
    }
  }

  async listSchemas(params: { datasourceId: string }): Promise<string[]> {
    return this.withConnection(params.datasourceId, async (client) => {
      const result = await client.query(
        `SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT IN ('pg_catalog', 'pg_toast', 'information_schema') ORDER BY schema_name`,
      );
      return result.rows.map((row: any) => row.schema_name);
    });
  }

  async listTables(params: { datasourceId: string; schema: string }): Promise<string[]> {
    return this.withConnection(params.datasourceId, async (client) => {
      const result = await client.query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE' ORDER BY table_name`,
        [params.schema],
      );
      return result.rows.map((row: any) => row.table_name);
    });
  }

  async getSourceTableMetadata(params: {
    datasourceId: string;
    sourceTable: string;
    sourceSchema?: string | null;
  }): Promise<ColumnMetadata[]> {
    return this.withConnection(params.datasourceId, async (client) => {
      const schema = params.sourceSchema || 'public';

      const colResult = await client.query(
        `SELECT column_name, data_type
         FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = $2
         ORDER BY ordinal_position`,
        [schema, params.sourceTable],
      );

      const pkResult = await client.query(
        `SELECT kcu.column_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON tc.constraint_name = kcu.constraint_name
           AND tc.table_schema = kcu.table_schema
         WHERE tc.table_schema = $1 AND tc.table_name = $2 AND tc.constraint_type = 'PRIMARY KEY'`,
        [schema, params.sourceTable],
      );

      const pkColumns = new Set(pkResult.rows.map((r: any) => r.column_name));

      return colResult.rows.map((row: any) => ({
        name: row.column_name,
        dataType: row.data_type,
        isPrimary: pkColumns.has(row.column_name),
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
    return this.withConnection(params.datasourceId, async (client) => {
      const tableName = this.qualifiedTable(params.sourceSchema, params.sourceTable);
      const values: any[] = [];
      let paramIndex = 1;

      let sql = `SELECT COUNT(*) AS cnt FROM ${tableName}`;

      if (params.mode === 'incremental' && params.incrementalColumn && params.lastIncrementalValue != null) {
        sql += ` WHERE ${this.quoteIdentifier(params.incrementalColumn)} > $${paramIndex}`;
        values.push(params.lastIncrementalValue);
        paramIndex++;
      }

      const result = await client.query(sql, values);
      return Number(result.rows[0].cnt);
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
  }): Promise<{ rows: Record<string, any>[]; lastKeyValue?: any; hasMore: boolean }> {
    return this.withConnection(params.datasourceId, async (client) => {
      const tableName = this.qualifiedTable(params.sourceSchema, params.sourceTable);
      const values: any[] = [];
      const conditions: string[] = [];
      let paramIndex = 1;

      if (params.mode === 'incremental' && params.incrementalColumn && params.lastIncrementalValue != null) {
        conditions.push(`${this.quoteIdentifier(params.incrementalColumn)} > $${paramIndex}`);
        values.push(params.lastIncrementalValue);
        paramIndex++;
      }

      if (params.lastKeyValue != null) {
        const orderCol = params.incrementalColumn || 'id';
        conditions.push(`${this.quoteIdentifier(orderCol)} > $${paramIndex}`);
        values.push(params.lastKeyValue);
        paramIndex++;
      }

      let sql = `SELECT * FROM ${tableName}`;
      if (conditions.length > 0) {
        sql += ` WHERE ${conditions.join(' AND ')}`;
      }

      const orderCol = params.incrementalColumn || 'id';
      sql += ` ORDER BY ${this.quoteIdentifier(orderCol)} ASC`;
      sql += ` LIMIT $${paramIndex}`;
      values.push(params.batchSize);

      const result = await client.query(sql, values);
      const resultRows = result.rows as Record<string, any>[];
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
