import { Repository } from 'typeorm';
import { Datasource } from '@/database/entities/datasource.entity';
import { ColumnMetadata } from '../extraction-executor.provider';
import { BaseExecutor } from './base-executor';

const CONNECT_TIMEOUT = 10000;

export interface MySQLDriver {
  createConnection(config: any): Promise<any>;
}

export class MySQLExecutor extends BaseExecutor {
  private driver: MySQLDriver;

  constructor(datasourceRepository: Repository<Datasource>, driver?: MySQLDriver) {
    super(datasourceRepository);
    // Allow injection for testing; fallback to require for production
    this.driver = driver || require('mysql2/promise');
  }

  protected quoteIdentifier(name: string): string {
    return '`' + name.replace(/`/g, '``') + '`';
  }

  private async withConnection<T>(
    datasourceId: string,
    fn: (connection: any) => Promise<T>,
  ): Promise<T> {
    const connInfo = await this.resolveConnection(datasourceId);
    let connection: any;
    try {
      connection = await this.driver.createConnection({
        host: connInfo.host,
        port: connInfo.port,
        database: connInfo.database,
        user: connInfo.username,
        password: connInfo.password,
        connectTimeout: CONNECT_TIMEOUT,
      });
      return await fn(connection);
    } finally {
      if (connection) {
        try { await connection.end(); } catch { /* ignore */ }
      }
    }
  }

  async listSchemas(params: { datasourceId: string }): Promise<string[]> {
    return this.withConnection(params.datasourceId, async (conn) => {
      const [rows] = await conn.query('SHOW DATABASES');
      return (rows as any[]).map((row: any) => {
        const key = Object.keys(row)[0];
        return row[key] as string;
      });
    });
  }

  async listTables(params: { datasourceId: string; schema: string }): Promise<string[]> {
    return this.withConnection(params.datasourceId, async (conn) => {
      const [rows] = await conn.query(`SHOW TABLES FROM ${this.quoteIdentifier(params.schema)}`);
      return (rows as any[]).map((row: any) => {
        const key = Object.keys(row)[0];
        return row[key] as string;
      });
    });
  }

  async getSourceTableMetadata(params: {
    datasourceId: string;
    sourceTable: string;
    sourceSchema?: string | null;
  }): Promise<ColumnMetadata[]> {
    return this.withConnection(params.datasourceId, async (conn) => {
      const schema = params.sourceSchema || (await this.resolveConnection(params.datasourceId)).database;
      const [rows] = await conn.query(
        `SELECT COLUMN_NAME, DATA_TYPE, COLUMN_KEY
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
         ORDER BY ORDINAL_POSITION`,
        [schema, params.sourceTable],
      );
      return (rows as any[]).map((row: any) => ({
        name: row.COLUMN_NAME,
        dataType: row.DATA_TYPE,
        isPrimary: row.COLUMN_KEY === 'PRI',
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
    return this.withConnection(params.datasourceId, async (conn) => {
      const tableName = this.qualifiedTable(params.sourceSchema, params.sourceTable);
      let sql = `SELECT COUNT(*) AS cnt FROM ${tableName}`;
      const values: any[] = [];

      if (params.mode === 'incremental' && params.incrementalColumn && params.lastIncrementalValue != null) {
        sql += ` WHERE ${this.quoteIdentifier(params.incrementalColumn)} > ?`;
        values.push(params.lastIncrementalValue);
      }

      const [rows] = await conn.query(sql, values);
      return Number((rows as any[])[0].cnt);
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
    return this.withConnection(params.datasourceId, async (conn) => {
      const tableName = this.qualifiedTable(params.sourceSchema, params.sourceTable);
      const values: any[] = [];
      const conditions: string[] = [];

      // Incremental mode: use keyset pagination on the incremental column
      // Full mode: always use offset pagination to avoid data loss with composite PKs
      const useKeyset = params.mode === 'incremental' && !!params.incrementalColumn;

      if (useKeyset && params.lastIncrementalValue != null) {
        conditions.push(`${this.quoteIdentifier(params.incrementalColumn!)} > ?`);
        values.push(params.lastIncrementalValue);
      }

      if (useKeyset && params.lastKeyValue != null) {
        conditions.push(`${this.quoteIdentifier(params.incrementalColumn!)} > ?`);
        values.push(params.lastKeyValue);
      }

      let sql = `SELECT * FROM ${tableName}`;
      if (conditions.length > 0) {
        sql += ` WHERE ${conditions.join(' AND ')}`;
      }

      if (useKeyset) {
        sql += ` ORDER BY ${this.quoteIdentifier(params.incrementalColumn!)} ASC`;
      }
      sql += ` LIMIT ?`;
      values.push(params.batchSize);
      if (!useKeyset) {
        sql += ` OFFSET ?`;
        values.push(params.offset || 0);
      }

      const [rows] = await conn.query(sql, values);
      const resultRows = rows as Record<string, any>[];
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
