import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, IsNull } from 'typeorm';
import { ColumnMetadata } from './extraction-executor.provider';
import { ExtractionTask } from '@/database/entities/extraction-task.entity';
import { ExtractionLog } from '@/database/entities/extraction-log.entity';
import { ERROR_CODES, ERROR_MESSAGES } from '@/common/errors/error-codes';
import { GetRawDataDto } from './dto/get-raw-data.dto';

const SYSTEM_COLUMNS = ['_cdmp_id', '_cdmp_extracted_at'];

export interface RawDataColumn {
  name: string;
  dataType: string;
  isSystem: boolean;
}

export interface RawDataMeta {
  taskName: string;
  sourceTable: string;
  sourceSchema: string | null;
  rawTableName: string;
  lastUpdatedAt: string | null;
  totalCount: number;
  page: number;
  limit: number;
  totalPages: number;
  warning?: string;
}

export interface RawDataResponse {
  meta: RawDataMeta;
  columns: RawDataColumn[];
  data: Record<string, any>[];
}

@Injectable()
export class RawDataService {
  private readonly isPostgres: boolean;

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(ExtractionTask)
    private readonly taskRepository: Repository<ExtractionTask>,
    @InjectRepository(ExtractionLog)
    private readonly logRepository: Repository<ExtractionLog>,
  ) {
    // Detect database type from the TypeORM DataSource driver
    const driverType = (this.dataSource.options as any).type;
    this.isPostgres = driverType === 'postgres';
  }

  /**
   * Get raw data for a given extraction task with pagination and sorting.
   */
  async getRawData(taskId: string, query: GetRawDataDto): Promise<RawDataResponse> {
    // 1. Find task (not soft-deleted)
    const task = await this.taskRepository.findOne({
      where: { id: taskId, deleted_at: IsNull() },
    });
    if (!task) {
      throw new NotFoundException({
        error: ERROR_CODES.EXTRACTION_NOT_FOUND,
        message: ERROR_MESSAGES.EXTRACTION_NOT_FOUND,
      });
    }

    // 2. Check raw table exists
    if (!task.raw_table_name || !(await this.tableExists(task.raw_table_name))) {
      throw new NotFoundException({
        error: ERROR_CODES.EXTRACTION_RAW_TABLE_NOT_FOUND,
        message: ERROR_MESSAGES.EXTRACTION_RAW_TABLE_NOT_FOUND,
      });
    }

    const rawTableName = task.raw_table_name;

    // 3. Get column metadata
    const columns = await this.getColumnMetadata(rawTableName);

    // 4. Get total count
    const countResult = await this.dataSource.query(
      `SELECT COUNT(*) as count FROM "${rawTableName}"`,
    );
    const totalCount = Number(countResult[0].count);

    // 5. Pagination
    const page = query.page || 1;
    const limit = query.limit || 50;
    const totalPages = totalCount > 0 ? Math.ceil(totalCount / limit) : 0;
    const offset = (page - 1) * limit;

    // 6. Sorting — validate sortBy against actual column names to prevent SQL injection
    let orderClause = '';
    let warning: string | undefined;
    if (query.sortBy) {
      const validColumn = columns.find((c) => c.name === query.sortBy);
      if (validColumn) {
        const sortOrder = query.sortOrder || 'asc';
        orderClause = `ORDER BY "${query.sortBy}" ${sortOrder.toUpperCase()}`;

        // Warning: non-indexed column sort on large datasets
        if (totalCount > 100000) {
          const indexedColumns = await this.getIndexedColumns(rawTableName);
          if (!indexedColumns.has(query.sortBy)) {
            warning = `排序欄位 "${query.sortBy}" 非索引欄位，資料量超過 100,000 筆時可能影響效能`;
          }
        }
      }
    }

    // 7. Query data
    let data: Record<string, any>[];
    if (this.isPostgres) {
      data = await this.dataSource.query(
        `SELECT * FROM "${rawTableName}" ${orderClause} LIMIT $1 OFFSET $2`,
        [limit, offset],
      );
    } else {
      data = await this.dataSource.query(
        `SELECT * FROM "${rawTableName}" ${orderClause} LIMIT ? OFFSET ?`,
        [limit, offset],
      );
    }

    // 8. Get lastUpdatedAt (latest completed log's finished_at)
    const lastLog = await this.logRepository.findOne({
      where: { task_id: taskId, status: 'completed' },
      order: { finished_at: 'DESC' },
    });

    return {
      meta: {
        taskName: task.name,
        sourceTable: task.source_table,
        sourceSchema: task.source_schema,
        rawTableName,
        lastUpdatedAt: lastLog?.finished_at
          ? (lastLog.finished_at instanceof Date
              ? lastLog.finished_at.toISOString()
              : String(lastLog.finished_at))
          : null,
        totalCount,
        page,
        limit,
        totalPages,
        ...(warning ? { warning } : {}),
      },
      columns,
      data,
    };
  }

  /**
   * Check if a raw data table exists in the database.
   */
  async tableExists(rawTableName: string): Promise<boolean> {
    this.validateTableName(rawTableName);

    if (this.isPostgres) {
      const result = await this.dataSource.query(
        `SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = $1
        ) AS "exists"`,
        [rawTableName],
      );
      return result[0].exists === true || result[0].exists === 't';
    }

    const result = await this.dataSource.query(
      `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
      [rawTableName],
    );
    return result.length > 0;
  }

  /**
   * Get column names of a raw data table.
   */
  async getTableColumns(rawTableName: string): Promise<string[]> {
    this.validateTableName(rawTableName);

    if (this.isPostgres) {
      const columns = await this.dataSource.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1
         ORDER BY ordinal_position`,
        [rawTableName],
      );
      return columns.map((col: any) => col.column_name);
    }

    const columns = await this.dataSource.query(
      `PRAGMA table_info("${rawTableName}")`,
    );
    return columns.map((col: any) => col.name);
  }

  /**
   * Dynamically create a raw data table based on source column metadata.
   * - Sanitizes all column names
   * - Appends _cdmp_id as auto-increment PRIMARY KEY if no primary key exists
   * - Appends _cdmp_extracted_at with DEFAULT current timestamp
   * - Maps external DB types to appropriate target types
   */
  async createRawTable(
    rawTableName: string,
    columns: ColumnMetadata[],
  ): Promise<void> {
    this.validateTableName(rawTableName);

    if (columns.length === 0) {
      throw new Error(`Cannot create raw table "${rawTableName}" with no business columns — source metadata may be empty`);
    }

    const primaryColumns = columns.filter((c) => c.isPrimary);
    const hasPrimary = primaryColumns.length > 0;
    const columnDefs: string[] = [];

    // If no primary key in source, add _cdmp_id
    if (!hasPrimary) {
      if (this.isPostgres) {
        columnDefs.push('_cdmp_id SERIAL PRIMARY KEY');
      } else {
        columnDefs.push('_cdmp_id INTEGER PRIMARY KEY AUTOINCREMENT');
      }
    }

    for (const col of columns) {
      const safeName = this.sanitizeColumnName(col.name);
      const mappedType = this.isPostgres
        ? this.mapToPostgresType(col.dataType)
        : this.mapToSqliteType(col.dataType);
      // Single PK can use inline PRIMARY KEY; composite PK uses table-level constraint
      if (col.isPrimary && primaryColumns.length === 1) {
        columnDefs.push(`"${safeName}" ${mappedType} PRIMARY KEY`);
      } else {
        columnDefs.push(`"${safeName}" ${mappedType}`);
      }
    }

    // Always add _cdmp_extracted_at
    if (this.isPostgres) {
      columnDefs.push(`_cdmp_extracted_at TIMESTAMP DEFAULT NOW()`);
    } else {
      columnDefs.push(`_cdmp_extracted_at TEXT DEFAULT (datetime('now'))`);
    }

    // Composite primary key: add table-level constraint
    if (primaryColumns.length > 1) {
      const pkNames = primaryColumns.map((c) => `"${this.sanitizeColumnName(c.name)}"`).join(', ');
      columnDefs.push(`PRIMARY KEY (${pkNames})`);
    }

    const sql = `CREATE TABLE IF NOT EXISTS "${rawTableName}" (${columnDefs.join(', ')})`;
    await this.dataSource.query(sql);
  }

  /**
   * Drop a raw data table if it exists.
   */
  async dropTable(rawTableName: string): Promise<void> {
    this.validateTableName(rawTableName);
    await this.dataSource.query(`DROP TABLE IF EXISTS "${rawTableName}"`);
  }

  /**
   * Truncate (delete all rows from) a raw data table. Used for full mode.
   */
  async truncateTable(rawTableName: string): Promise<void> {
    this.validateTableName(rawTableName);
    if (this.isPostgres) {
      await this.dataSource.query(`TRUNCATE TABLE "${rawTableName}"`);
    } else {
      await this.dataSource.query(`DELETE FROM "${rawTableName}"`);
    }
  }

  /**
   * Insert a batch of rows into the raw data table.
   * Returns the number of rows inserted.
   *
   * 自動切片：PostgreSQL extended query protocol 對單次 bind 訊息的參數數量有
   * uint16 上限（65535）；行數 × 欄位數超過此值會拋
   * `bind message has N parameter formats but 0 parameters`。寬欄位來源（如
   * OBPOOLDATA 122 欄 × batch 1000 = 122000）必須切成多個 INSERT 才能跑通。
   */
  async insertBatch(
    rawTableName: string,
    columns: string[],
    rows: Record<string, any>[],
  ): Promise<number> {
    this.validateTableName(rawTableName);

    if (rows.length === 0) return 0;

    const safeCols = columns.map((c) => this.sanitizeColumnName(c));
    const colCount = columns.length || 1;

    // 留 535 buffer 防 driver 邊界條件；最少 1 row 一批
    const PG_PARAM_LIMIT = 65000;
    const maxRowsPerInsert = this.isPostgres
      ? Math.max(1, Math.floor(PG_PARAM_LIMIT / colCount))
      : rows.length;

    let inserted = 0;
    for (let offset = 0; offset < rows.length; offset += maxRowsPerInsert) {
      const chunk = rows.slice(offset, offset + maxRowsPerInsert);

      if (this.isPostgres) {
        // PostgreSQL uses $1, $2, ... numbered parameters
        let paramIndex = 1;
        const placeholders = chunk
          .map(() => `(${safeCols.map(() => `$${paramIndex++}`).join(', ')})`)
          .join(', ');

        const values: any[] = [];
        for (const row of chunk) {
          for (const col of columns) {
            values.push(row[col] ?? null);
          }
        }

        const sql = `INSERT INTO "${rawTableName}" (${safeCols.map((c) => `"${c}"`).join(', ')}) VALUES ${placeholders}`;
        await this.dataSource.query(sql, values);
      } else {
        // SQLite uses ? positional parameters
        const placeholders = chunk
          .map(() => `(${safeCols.map(() => '?').join(', ')})`)
          .join(', ');

        const values: any[] = [];
        for (const row of chunk) {
          for (const col of columns) {
            values.push(row[col] ?? null);
          }
        }

        const sql = `INSERT INTO "${rawTableName}" (${safeCols.map((c) => `"${c}"`).join(', ')}) VALUES ${placeholders}`;
        await this.dataSource.query(sql, values);
      }

      inserted += chunk.length;
    }

    return inserted;
  }

  /**
   * Validate that a table name matches the expected raw table format.
   */
  private validateTableName(name: string): void {
    if (!/^raw_[0-9a-f]{8}$/.test(name)) {
      throw new Error(`Invalid raw table name: ${name}`);
    }
  }

  /**
   * Sanitize a column name to contain only safe characters.
   * Replaces any non-[a-zA-Z0-9_] character with underscore.
   */
  sanitizeColumnName(name: string): string {
    const sanitized = name.replace(/[^a-zA-Z0-9_]/g, '_');
    if (sanitized.length === 0) {
      throw new Error(`Column name is empty after sanitization: "${name}"`);
    }
    return sanitized;
  }

  /**
   * Get column metadata (name, dataType, isSystem) for a raw data table.
   */
  private async getColumnMetadata(rawTableName: string): Promise<RawDataColumn[]> {
    if (this.isPostgres) {
      const pgColumns = await this.dataSource.query(
        `SELECT column_name, data_type FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1
         ORDER BY ordinal_position`,
        [rawTableName],
      );
      return pgColumns.map((col: any) => ({
        name: col.column_name,
        dataType: col.data_type || 'text',
        isSystem: SYSTEM_COLUMNS.includes(col.column_name),
      }));
    }

    // SQLite path
    const pragmaColumns = await this.dataSource.query(
      `PRAGMA table_info("${rawTableName}")`,
    );
    return pragmaColumns.map((col: any) => ({
      name: col.name,
      dataType: col.type || 'TEXT',
      isSystem: SYSTEM_COLUMNS.includes(col.name),
    }));
  }

  /**
   * Get the set of indexed column names for a given table.
   */
  private async getIndexedColumns(rawTableName: string): Promise<Set<string>> {
    const indexedColumns = new Set<string>();

    if (this.isPostgres) {
      const result = await this.dataSource.query(
        `SELECT a.attname AS column_name
         FROM pg_index i
         JOIN pg_class c ON c.oid = i.indrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
         JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(i.indkey)
         WHERE n.nspname = 'public' AND c.relname = $1`,
        [rawTableName],
      );
      for (const row of result) {
        indexedColumns.add(row.column_name);
      }
    } else {
      const indexList = await this.dataSource.query(
        `PRAGMA index_list("${rawTableName}")`,
      );
      for (const idx of indexList) {
        const indexInfo = await this.dataSource.query(
          `PRAGMA index_info("${idx.name}")`,
        );
        for (const info of indexInfo) {
          indexedColumns.add(info.name);
        }
      }
    }

    return indexedColumns;
  }

  /**
   * Map external database types to SQLite-compatible types.
   */
  private mapToSqliteType(dataType: string): string {
    const lower = dataType.toLowerCase();
    if (
      lower.includes('int') ||
      lower.includes('serial') ||
      lower.includes('bool')
    ) {
      return 'INTEGER';
    }
    if (
      lower.includes('float') ||
      lower.includes('double') ||
      lower.includes('decimal') ||
      lower.includes('numeric') ||
      lower.includes('real')
    ) {
      return 'REAL';
    }
    if (lower.includes('blob') || lower.includes('bytea')) {
      return 'BLOB';
    }
    // Default: TEXT covers varchar, char, text, date, datetime, timestamp, etc.
    return 'TEXT';
  }

  /**
   * Map external database types to PostgreSQL-compatible types.
   */
  private mapToPostgresType(dataType: string): string {
    const lower = dataType.toLowerCase();
    if (lower.includes('serial')) {
      return 'INTEGER';
    }
    if (lower.includes('bigint')) {
      return 'BIGINT';
    }
    if (lower.includes('smallint') || lower.includes('tinyint')) {
      return 'SMALLINT';
    }
    if (lower.includes('int')) {
      return 'INTEGER';
    }
    if (lower.includes('bool') || lower.includes('bit')) {
      return 'BOOLEAN';
    }
    if (lower.includes('float') || lower.includes('double')) {
      return 'DOUBLE PRECISION';
    }
    if (
      lower.includes('decimal') ||
      lower.includes('numeric') ||
      lower.includes('money')
    ) {
      return 'NUMERIC';
    }
    if (lower.includes('real')) {
      return 'REAL';
    }
    if (lower.includes('bytea') || lower.includes('blob') || lower.includes('binary') || lower.includes('image') || lower.includes('varbinary')) {
      return 'BYTEA';
    }
    if (lower.includes('datetime') || lower.includes('timestamp')) {
      return 'TIMESTAMP';
    }
    if (lower === 'date') {
      return 'DATE';
    }
    if (lower === 'time') {
      return 'TIME';
    }
    if (lower.includes('uuid') || lower.includes('uniqueidentifier')) {
      return 'UUID';
    }
    if (lower.includes('json')) {
      return 'JSONB';
    }
    if (lower.includes('xml')) {
      return 'XML';
    }
    if (lower.includes('text') || lower.includes('ntext')) {
      return 'TEXT';
    }
    // Default: VARCHAR for char, varchar, nchar, nvarchar, etc.
    return 'TEXT';
  }
}
