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
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(ExtractionTask)
    private readonly taskRepository: Repository<ExtractionTask>,
    @InjectRepository(ExtractionLog)
    private readonly logRepository: Repository<ExtractionLog>,
  ) {}

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

    // 3. Get column metadata via PRAGMA
    const pragmaColumns = await this.dataSource.query(
      `PRAGMA table_info("${rawTableName}")`,
    );
    const columns: RawDataColumn[] = pragmaColumns.map((col: any) => ({
      name: col.name,
      dataType: col.type || 'TEXT',
      isSystem: SYSTEM_COLUMNS.includes(col.name),
    }));

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
          const indexList = await this.dataSource.query(
            `PRAGMA index_list("${rawTableName}")`,
          );
          const indexedColumns = new Set<string>();
          for (const idx of indexList) {
            const indexInfo = await this.dataSource.query(
              `PRAGMA index_info("${idx.name}")`,
            );
            for (const info of indexInfo) {
              indexedColumns.add(info.name);
            }
          }
          if (!indexedColumns.has(query.sortBy)) {
            warning = `排序欄位 "${query.sortBy}" 非索引欄位，資料量超過 100,000 筆時可能影響效能`;
          }
        }
      }
    }

    // 7. Query data
    const data = await this.dataSource.query(
      `SELECT * FROM "${rawTableName}" ${orderClause} LIMIT ? OFFSET ?`,
      [limit, offset],
    );

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

    const columns = await this.dataSource.query(
      `PRAGMA table_info("${rawTableName}")`,
    );
    return columns.map((col: any) => col.name);
  }

  /**
   * Dynamically create a raw data table based on source column metadata.
   * - Sanitizes all column names
   * - Appends _cdmp_id as PRIMARY KEY AUTOINCREMENT if no primary key exists
   * - Appends _cdmp_extracted_at with DEFAULT datetime('now')
   * - Maps external DB types to SQLite types
   */
  async createRawTable(
    rawTableName: string,
    columns: ColumnMetadata[],
  ): Promise<void> {
    this.validateTableName(rawTableName);

    const hasPrimary = columns.some((c) => c.isPrimary);
    const columnDefs: string[] = [];

    // If no primary key in source, add _cdmp_id
    if (!hasPrimary) {
      columnDefs.push('_cdmp_id INTEGER PRIMARY KEY AUTOINCREMENT');
    }

    for (const col of columns) {
      const safeName = this.sanitizeColumnName(col.name);
      const sqliteType = this.mapToSqliteType(col.dataType);
      if (col.isPrimary && hasPrimary) {
        columnDefs.push(`"${safeName}" ${sqliteType} PRIMARY KEY`);
      } else {
        columnDefs.push(`"${safeName}" ${sqliteType}`);
      }
    }

    // Always add _cdmp_extracted_at
    columnDefs.push(
      `_cdmp_extracted_at TEXT DEFAULT (datetime('now'))`,
    );

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
    await this.dataSource.query(`DELETE FROM "${rawTableName}"`);
  }

  /**
   * Insert a batch of rows into the raw data table.
   * Returns the number of rows inserted.
   */
  async insertBatch(
    rawTableName: string,
    columns: string[],
    rows: Record<string, any>[],
  ): Promise<number> {
    this.validateTableName(rawTableName);

    if (rows.length === 0) return 0;

    const safeCols = columns.map((c) => this.sanitizeColumnName(c));
    const placeholders = rows
      .map(() => `(${safeCols.map(() => '?').join(', ')})`)
      .join(', ');

    const values: any[] = [];
    for (const row of rows) {
      for (const col of columns) {
        values.push(row[col] ?? null);
      }
    }

    const sql = `INSERT INTO "${rawTableName}" (${safeCols.map((c) => `"${c}"`).join(', ')}) VALUES ${placeholders}`;
    await this.dataSource.query(sql, values);

    return rows.length;
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
}
