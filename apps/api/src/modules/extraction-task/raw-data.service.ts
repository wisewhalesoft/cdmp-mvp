import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, IsNull } from 'typeorm';
import { from as copyFrom } from 'pg-copy-streams';
import { ColumnMetadata } from './extraction-executor.provider';
import { ExtractionTask } from '@/database/entities/extraction-task.entity';
import { ExtractionLog } from '@/database/entities/extraction-log.entity';
import { ERROR_CODES, ERROR_MESSAGES } from '@/common/errors/error-codes';
import { GetRawDataDto } from './dto/get-raw-data.dto';

const SYSTEM_COLUMNS = ['_cdmp_id', '_cdmp_extracted_at'];

/**
 * A long-lived PostgreSQL `COPY ... FROM STDIN` writer. Open once at the start of
 * an extraction, push every streamed batch through `writeRows`, then `finish`.
 * Backpressure is honoured per write so memory stays bounded.
 */
export interface CopyWriter {
  /** Append rows to the COPY stream (reads each row by the columns given at open). */
  writeRows(rows: Record<string, any>[]): Promise<void>;
  /** Flush, end the COPY stream, and release the connection. */
  finish(): Promise<void>;
  /** Abort the COPY (on error) and release the connection. Never throws. */
  abort(err?: any): Promise<void>;
}

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
  // AD-E07-41 P4e (ISPG-GATE): the target AppDB driver is a three-state value.
  // The old two-state `isPostgres` boolean conflated MSSQL with SQLite (a `false`
  // for MSSQL wrongly routed createRawTable/tableExists/getTableColumns into the
  // SQLite branch — AUTOINCREMENT / sqlite_master / PRAGMA, none valid on T-SQL).
  // `isPostgres` is kept (derived) so the out-of-scope read paths (getRawData
  // LIMIT/OFFSET, getColumnMetadata, getIndexedColumns) behave byte-identically
  // for postgres/sqlite; the three write-path dependencies switch on `dbType`.
  private readonly dbType: 'postgres' | 'mssql' | 'sqlite';
  private readonly isPostgres: boolean;
  private readonly isMssql: boolean;

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
    this.dbType =
      driverType === 'postgres'
        ? 'postgres'
        : driverType === 'mssql'
          ? 'mssql'
          : 'sqlite';
    this.isPostgres = this.dbType === 'postgres';
    this.isMssql = this.dbType === 'mssql';
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
    } else if (this.isMssql) {
      // AD-E07-41 P4-followup / GETRAWPAGE: T-SQL has no LIMIT/OFFSET; use
      // `OFFSET ... ROWS FETCH NEXT ... ROWS ONLY`, which REQUIRES an ORDER BY
      // (#153 otherwise, real-DB verified V8). When the caller gives no sortBy we
      // fall back to a deterministic default key (GATE-001).
      const mssqlOrder =
        orderClause || `ORDER BY ${await this.defaultMssqlOrderBy(rawTableName, columns)}`;
      data = await this.dataSource.query(
        `SELECT * FROM "${rawTableName}" ${mssqlOrder} OFFSET @0 ROWS FETCH NEXT @1 ROWS ONLY`,
        [offset, limit],
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

    if (this.isMssql) {
      // MSSQL has no `sqlite_master`; OBJECT_ID is the established P1a catalog probe.
      const result = await this.dataSource.query(
        `SELECT OBJECT_ID('dbo.' + @0, 'U') AS oid`,
        [rawTableName],
      );
      return result[0].oid != null;
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

    if (this.isMssql) {
      // MSSQL has no PRAGMA; INFORMATION_SCHEMA must be UPPERCASE under BIN
      // collation (I-MSSQL-CATALOG-CASE-01).
      const columns = await this.dataSource.query(
        `SELECT COLUMN_NAME AS column_name FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = @0
         ORDER BY ORDINAL_POSITION`,
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

    // AD-E07-41 P4-followup / PKFINDING GATE-001 (candidate b): on MSSQL a source
    // PK column whose mapped physical type is a LOB / MAX type
    // (NVARCHAR(MAX) for strings & decimal/numeric/money; VARBINARY(MAX) for binary)
    // is INVALID as an index key (#1919, real-DB verified V1). Rather than force a
    // bounded NVARCHAR(n) (candidate a — still hits the 900-byte INSERT limit V3/V5)
    // or a NONCLUSTERED PK (candidate c), we demote such source keys to ordinary
    // columns and let the `_cdmp_id IDENTITY` surrogate carry the PK. Raw staging is
    // an ETL 中繼 that needs no DB-level source-key uniqueness — pipeline dedup owns
    // that — so no unique constraint is placed on the source key columns. Non-MAX
    // source PKs (int/bigint/etc.) stay native, unchanged (CREATETABLE-003).
    const mssqlSourcePkUnusable =
      this.isMssql &&
      primaryColumns.some((c) => this.mapToMssqlType(c.dataType).includes('(MAX)'));
    const effectivePrimaryColumns = mssqlSourcePkUnusable ? [] : primaryColumns;
    const hasPrimary = effectivePrimaryColumns.length > 0;
    const columnDefs: string[] = [];

    // If no usable primary key, add the _cdmp_id surrogate.
    if (!hasPrimary) {
      if (this.isPostgres) {
        columnDefs.push('_cdmp_id SERIAL PRIMARY KEY');
      } else if (this.isMssql) {
        columnDefs.push('_cdmp_id INT IDENTITY(1,1) PRIMARY KEY');
      } else {
        columnDefs.push('_cdmp_id INTEGER PRIMARY KEY AUTOINCREMENT');
      }
    }

    for (const col of columns) {
      const safeName = this.sanitizeColumnName(col.name);
      const mappedType = this.isPostgres
        ? this.mapToPostgresType(col.dataType)
        : this.isMssql
          ? this.mapToMssqlType(col.dataType)
          : this.mapToSqliteType(col.dataType);
      // Single PK can use inline PRIMARY KEY; composite PK uses table-level
      // constraint. When the source PK is demoted on MSSQL (mssqlSourcePkUnusable),
      // no column is emitted with an inline/table PRIMARY KEY.
      const isEffectivePk = !mssqlSourcePkUnusable && col.isPrimary;
      if (isEffectivePk && effectivePrimaryColumns.length === 1) {
        columnDefs.push(`"${safeName}" ${mappedType} PRIMARY KEY`);
      } else {
        columnDefs.push(`"${safeName}" ${mappedType}`);
      }
    }

    // Always add _cdmp_extracted_at
    if (this.isPostgres) {
      columnDefs.push(`_cdmp_extracted_at TIMESTAMP DEFAULT NOW()`);
    } else if (this.isMssql) {
      columnDefs.push(`_cdmp_extracted_at DATETIME2 DEFAULT SYSUTCDATETIME()`);
    } else {
      columnDefs.push(`_cdmp_extracted_at TEXT DEFAULT (datetime('now'))`);
    }

    // Composite primary key: add table-level constraint (skipped when the source
    // PK is demoted on MSSQL — the _cdmp_id surrogate is the PK instead).
    if (effectivePrimaryColumns.length > 1) {
      const pkNames = effectivePrimaryColumns
        .map((c) => `"${this.sanitizeColumnName(c.name)}"`)
        .join(', ');
      columnDefs.push(`PRIMARY KEY (${pkNames})`);
    }

    const columnsSql = columnDefs.join(', ');
    if (this.isMssql) {
      // T-SQL has no `CREATE TABLE IF NOT EXISTS`; guard with OBJECT_ID instead.
      await this.dataSource.query(
        `IF OBJECT_ID('dbo.${rawTableName}', 'U') IS NULL CREATE TABLE "${rawTableName}" (${columnsSql})`,
      );
    } else {
      await this.dataSource.query(
        `CREATE TABLE IF NOT EXISTS "${rawTableName}" (${columnsSql})`,
      );
    }
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
   * 自動切片（per-driver bind-parameter budget）：
   *  - PostgreSQL extended query protocol 對單次 bind 訊息的參數數量有 uint16 上限
   *    （65535）；行數 × 欄位數超過此值會拋 `bind message ...`。寬欄位來源（如
   *    OBPOOLDATA 122 欄 × batch 1000 = 122000）必須切成多個 INSERT。
   *  - MSSQL RPC 每次呼叫參數硬上限官方文件寫 2100，但本專案 `mssql`(tedious) 堆疊
   *    實測安全上限為 2098（AD-E07-41 P4-followup V7，2098 OK / 2099 起 #8003）；
   *    取保守門檻 2000（比照 PG 之 buffer 慣例），為套件版本差異保留餘裕。
   *  - SQLite（測試環境）維持既有不切片行為（小批次）。
   *
   * 跨 driver 佔位符：援用 Pattern B（AD-E07-38 P1c，assignment-run-pipeline.service）
   * 具名參數 + `driver.escapeQueryWithParameters`，一次讓 PG($n)/MSSQL(@n)/SQLite(?)
   * 三路徑統一展開，取代原 postgres/else 手刻兩分支。型別化參數協定天生防注入
   * （中文 / 單引號等字面值一律當資料，不會被誤判為 SQL）。
   */
  async insertBatch(
    rawTableName: string,
    columns: string[],
    rows: Record<string, any>[],
  ): Promise<number> {
    this.validateTableName(rawTableName);

    if (rows.length === 0) return 0;

    const safeCols = columns.map((c) => this.sanitizeColumnName(c));
    const colList = safeCols.map((c) => `"${c}"`).join(', ');
    const colCount = columns.length || 1;

    // Per-driver max bind-parameter budget (null = unbatched, SQLite test env).
    const paramLimit = this.isPostgres
      ? 65000 // uint16 buffer (留 535)
      : this.isMssql
        ? 2000 // < 2098 real-DB safe cap (V7)
        : null;
    const maxRowsPerInsert = paramLimit
      ? Math.max(1, Math.floor(paramLimit / colCount))
      : rows.length;

    const driver = this.dataSource.driver;

    let inserted = 0;
    for (let offset = 0; offset < rows.length; offset += maxRowsPerInsert) {
      const chunk = rows.slice(offset, offset + maxRowsPerInsert);

      // Pattern B: build named parameters :r{row}c{col}; escapeQueryWithParameters
      // rewrites them to each driver's native placeholder + positional array.
      const params: Record<string, any> = {};
      const valueTuples = chunk.map((row, r) => {
        const names = safeCols.map((_c, ci) => {
          const key = `r${r}c${ci}`;
          let v = row[columns[ci]] ?? null;
          // AD-E07-P6c / FINDING-P6C-01: raw date/time columns are now NVARCHAR(MAX)
          // (see mapToMssqlType). A JS `Date` bound as a parameter would be
          // implicit-converted by SQL Server into nvarchar using the locale-default
          // style-0 format ('Mar  4 2020  5:06AM' — lossy: seconds dropped, non-ISO,
          // unparseable by `new Date()`), diverging from the bulk path's ISO coercion
          // and losing precision. Coerce Date → ISO here (MSSQL only) so the
          // parameterized (incremental / non-streaming) path stores the SAME faithful
          // ISO string the bulk fast-path does. pg/sqlite keep binding native Date
          // (their raw date columns stay TIMESTAMP/TEXT — no regression).
          if (this.isMssql && v instanceof Date) {
            v = v.toISOString();
          }
          params[key] = v;
          return `:${key}`;
        });
        return `(${names.join(', ')})`;
      });

      const rawSql = `INSERT INTO "${rawTableName}" (${colList}) VALUES ${valueTuples.join(', ')}`;
      const [sql, parameters] = driver.escapeQueryWithParameters(rawSql, params, {});
      await this.dataSource.query(sql, parameters);

      inserted += chunk.length;
    }

    return inserted;
  }

  /**
   * Whether the target AppDB supports `COPY FROM STDIN` (PostgreSQL only).
   * SQLite (test env) falls back to parameterized INSERT.
   */
  supportsCopy(): boolean {
    return this.isPostgres;
  }

  /**
   * Whether the target AppDB supports typed bulk-load (SQL Server, via the
   * `mssql` package `Table` + `request.bulk()`). Mutually exclusive with
   * `supportsCopy()` — postgres uses COPY, mssql uses bulk, sqlite (test env)
   * falls back to parameterized INSERT.
   */
  supportsBulk(): boolean {
    return this.isMssql;
  }

  /**
   * Format a single value for a PostgreSQL `COPY ... FROM STDIN` stream in the
   * default TEXT format: NULL is `\N`, and backslash / tab / newline / CR are
   * backslash-escaped (backslash MUST be escaped first). UTF-8 (e.g. Chinese)
   * passes through untouched.
   */
  formatCopyValue(value: any): string {
    if (value === null || value === undefined) {
      return '\\N';
    }
    if (Buffer.isBuffer(value)) {
      // bytea text input: escaped-backslash + hex form (\\x...)
      return '\\\\x' + value.toString('hex');
    }
    let s: string;
    if (value instanceof Date) {
      s = value.toISOString();
    } else if (typeof value === 'object') {
      s = JSON.stringify(value);
    } else {
      s = String(value);
    }
    return s
      .replace(/\\/g, '\\\\')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');
  }

  /**
   * Open a `COPY <table> (<cols>) FROM STDIN` writer (PostgreSQL only).
   * Rows are read by the sanitized `columns` (same identifiers as the COPY
   * header), matching `insertBatch`'s read semantics. Throws for non-PostgreSQL.
   */
  async openCopyWriter(
    rawTableName: string,
    columns: string[],
  ): Promise<CopyWriter> {
    this.validateTableName(rawTableName);
    if (!this.isPostgres) {
      throw new Error('openCopyWriter is only supported for PostgreSQL targets');
    }
    if (columns.length === 0) {
      throw new Error(`Cannot open COPY writer for "${rawTableName}" with no columns`);
    }

    const safeCols = columns.map((c) => this.sanitizeColumnName(c));
    const colList = safeCols.map((c) => `"${c}"`).join(', ');

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    // The underlying node-postgres Client/PoolClient (needed for COPY streaming).
    const client: any = (queryRunner as any).databaseConnection;

    const copyStream: any = client.query(
      copyFrom(`COPY "${rawTableName}" (${colList}) FROM STDIN WITH (FORMAT text)`),
    );

    // Capture the first stream error so subsequent ops fail fast.
    let streamError: any = null;
    copyStream.on('error', (err: any) => {
      if (!streamError) streamError = err;
    });

    const formatValue = this.formatCopyValue.bind(this);

    const writeChunk = (chunk: string): Promise<void> =>
      new Promise<void>((resolve, reject) => {
        if (streamError) return reject(streamError);
        const onError = (err: any) => {
          copyStream.removeListener('drain', onDrain);
          reject(err);
        };
        const onDrain = () => {
          copyStream.removeListener('error', onError);
          resolve();
        };
        const ok = copyStream.write(chunk);
        if (ok) return resolve();
        copyStream.once('error', onError);
        copyStream.once('drain', onDrain);
      });

    return {
      async writeRows(rows: Record<string, any>[]): Promise<void> {
        if (rows.length === 0) return;
        let buf = '';
        for (const row of rows) {
          buf += safeCols.map((c) => formatValue(row[c])).join('\t') + '\n';
        }
        await writeChunk(buf);
      },
      async finish(): Promise<void> {
        await new Promise<void>((resolve, reject) => {
          copyStream.once('error', reject);
          copyStream.once('finish', resolve);
          copyStream.end();
        });
        await queryRunner.release();
      },
      async abort(err?: any): Promise<void> {
        try { copyStream.destroy(err); } catch { /* ignore */ }
        try { await queryRunner.release(); } catch { /* ignore */ }
      },
    };
  }

  /**
   * Open a typed bulk-load writer for a SQL Server raw table (MSSQL only), using
   * the `mssql` package `Table` + `request.bulk()`. Returns the same `CopyWriter`
   * shape as `openCopyWriter` so the orchestrator can dispatch on capability with
   * an identical call site (writeRows / finish / abort).
   *
   * AD-E07-41 P4e probe conclusions (real SQL Server, see impl log §4 Probe):
   *  - BULKWRITE-GATE-001: TypeORM mssql `QueryRunner.databaseConnection` is
   *    `undefined` (unlike PG's node-postgres client), so the PG手法 does NOT
   *    transfer. `request.bulk()` also requires the `Table` to be built from the
   *    *same* `mssql` module instance that owns the request (getTediousType maps
   *    by object identity — a foreign instance throws
   *    `c.type.declaration is not a function`). We therefore open a dedicated
   *    `mssql.ConnectionPool` here (the documented fallback), matching PG's
   *    dedicated-queryRunner lifecycle.
   *  - BATCH-GATE-001: multiple independent `request.bulk()` calls against the
   *    same physical table succeed and accumulate, so each `writeRows` triggers a
   *    fresh bulk over a fresh `Table` → memory stays bounded (no single
   *    accumulating in-memory structure).
   *  - PROBE-013: bcp rejects a bulk column type that does not match the target
   *    (`Invalid column type from bcp client`); it does NOT silently truncate. We
   *    therefore resolve each column's physical type from INFORMATION_SCHEMA and
   *    declare the bulk Table to match exactly.
   *
   * 🔴 NEVER routes values through the PG COPY TEXT escaper (which turns a real
   * tab into the two literal characters backslash+t); that would corrupt real
   * control characters under the typed bulk protocol. Value coercion here is a
   * separate, escape-free function (NOESCAPE-GATE-001 / STATIC-003).
   */
  async openBulkWriter(
    rawTableName: string,
    columns: string[],
  ): Promise<CopyWriter> {
    this.validateTableName(rawTableName);
    if (!this.isMssql) {
      throw new Error('openBulkWriter is only supported for MSSQL (SQL Server) targets');
    }
    if (columns.length === 0) {
      throw new Error(`Cannot open bulk writer for "${rawTableName}" with no columns`);
    }

    // Lazy require (mirrors mssql-executor.ts) so non-mssql environments never load it.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const sql = require('mssql');

    const safeCols = columns.map((c) => this.sanitizeColumnName(c));

    // Resolve each target column's physical type so the bulk Table declaration
    // matches the raw table exactly (PROBE-013).
    const typeRows: any[] = await this.dataSource.query(
      `SELECT COLUMN_NAME AS column_name, DATA_TYPE AS data_type
         FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = @0`,
      [rawTableName],
    );
    const typeByName = new Map<string, string>();
    for (const r of typeRows) {
      typeByName.set(String(r.column_name).toLowerCase(), String(r.data_type).toLowerCase());
    }
    const colTypes = safeCols.map((c) =>
      this.mapToBulkColumnType(sql, typeByName.get(c.toLowerCase()) ?? 'nvarchar'),
    );

    const pool = new sql.ConnectionPool(this.buildMssqlConnectionConfig());
    await pool.connect();

    const buildTable = () => {
      const table = new sql.Table(rawTableName);
      table.create = false;
      safeCols.forEach((c, i) => {
        table.columns.add(c, colTypes[i].type, { nullable: true });
      });
      return table;
    };

    // Typed-protocol value coercion (NO backslash-escaping — see class note).
    // NULL/undefined → SQL NULL; string columns stringify non-strings (e.g. a
    // numeric source column mapped to NVARCHAR(MAX)); empty string stays ''.
    const coerce = (value: any, isStringCol: boolean): any => {
      if (value === undefined || value === null) return null;
      if (!isStringCol) return value;
      if (Buffer.isBuffer(value)) return value.toString();
      if (value instanceof Date) return value.toISOString();
      if (typeof value === 'object') return JSON.stringify(value);
      return typeof value === 'string' ? value : String(value);
    };

    let closed = false;
    const closePool = async (): Promise<void> => {
      if (closed) return;
      closed = true;
      try { await pool.close(); } catch { /* ignore */ }
    };

    return {
      async writeRows(rows: Record<string, any>[]): Promise<void> {
        if (rows.length === 0) return;
        const table = buildTable();
        for (const row of rows) {
          table.rows.add(...safeCols.map((c, i) => coerce(row[c], colTypes[i].isString)));
        }
        await pool.request().bulk(table);
      },
      async finish(): Promise<void> {
        await closePool();
      },
      async abort(): Promise<void> {
        // Never throws (hard contract). Already-flushed batches remain in the
        // target table (each writeRows is an independent bulk); no rollback.
        await closePool();
      },
    };
  }

  /** Build an `mssql` ConnectionPool config from the TypeORM DataSource options. */
  private buildMssqlConnectionConfig(): any {
    const o: any = this.dataSource.options;
    return {
      server: o.host,
      port: o.port,
      user: o.username,
      password: o.password,
      database: o.database,
      options: {
        encrypt: o.options?.encrypt ?? false,
        trustServerCertificate: o.options?.trustServerCertificate ?? true,
        // Pin useUTC (tedious/mssql-executor default) so a DATETIME2 value written
        // via bulk stores the same wall-clock the app reads back — a JS Date is a
        // UTC instant, and a write/read tz mismatch would shift datetime columns.
        useUTC: true,
      },
    };
  }

  /**
   * Map a raw-table physical `DATA_TYPE` (from INFORMATION_SCHEMA) to the `mssql`
   * bulk `Table` column type + whether it is a string column (needs stringify
   * coercion). Kept in sync with `mapToMssqlType` (the DDL side): strings and the
   * decimal/numeric/money family are all NVARCHAR(MAX) in the raw table.
   */
  private mapToBulkColumnType(sql: any, dataType: string): { type: any; isString: boolean } {
    const lower = dataType.toLowerCase();
    if (lower === 'bigint') return { type: sql.BigInt, isString: false };
    if (lower === 'tinyint') return { type: sql.TinyInt, isString: false };
    if (lower === 'smallint') return { type: sql.SmallInt, isString: false };
    if (lower === 'int') return { type: sql.Int, isString: false };
    if (lower === 'bit') return { type: sql.Bit, isString: false };
    if (lower === 'float') return { type: sql.Float, isString: false };
    if (lower === 'real') return { type: sql.Real, isString: false };
    if (lower === 'uniqueidentifier') return { type: sql.UniqueIdentifier, isString: false };
    if (lower === 'time') return { type: sql.Time, isString: false };
    if (lower.includes('datetime') || lower === 'date') {
      return { type: sql.DateTime2, isString: false };
    }
    if (lower.includes('binary') || lower === 'image') {
      return { type: sql.VarBinary(sql.MAX), isString: false };
    }
    // varchar/nvarchar/char/nchar/text/ntext/xml + decimal/numeric/money → NVARCHAR(MAX)
    return { type: sql.NVarChar(sql.MAX), isString: true };
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

    if (this.isMssql) {
      // AD-E07-41 P4-followup / GETCOLMETA: MSSQL has no PRAGMA. INFORMATION_SCHEMA
      // MUST be UPPERCASE under BIN collation (#208 otherwise, V12) — mirrors the
      // P4e-fixed getTableColumns. DATA_TYPE is the native lowercase catalog literal
      // ('int'/'nvarchar'/'datetime2'/'bit', V10), symmetric with the postgres branch.
      const msColumns = await this.dataSource.query(
        `SELECT COLUMN_NAME AS column_name, DATA_TYPE AS data_type
           FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = @0
          ORDER BY ORDINAL_POSITION`,
        [rawTableName],
      );
      return msColumns.map((col: any) => ({
        name: col.column_name,
        dataType: col.data_type || 'nvarchar',
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
   * Resolve a deterministic default ORDER BY key for MSSQL `OFFSET ... FETCH`
   * pagination when the caller supplies no sortBy (T-SQL requires ORDER BY — V8).
   * Prefers `_cdmp_id` (unique + monotonic; present only when the source had no
   * PK), else the source PK columns (unique), else `_cdmp_extracted_at` (always
   * present — GATE-001 fallback). `_cdmp_id` is NOT assumed to exist.
   */
  private async defaultMssqlOrderBy(
    rawTableName: string,
    columns: RawDataColumn[],
  ): Promise<string> {
    if (columns.some((c) => c.name === '_cdmp_id')) {
      return '"_cdmp_id"';
    }
    // Source-PK table (no _cdmp_id): order by the PK columns for stable paging.
    const pkRows = await this.dataSource.query(
      `SELECT c.name AS column_name
         FROM sys.indexes i
         JOIN sys.index_columns ic
           ON ic.object_id = i.object_id AND ic.index_id = i.index_id
         JOIN sys.columns c
           ON c.object_id = ic.object_id AND c.column_id = ic.column_id
        WHERE i.object_id = OBJECT_ID('dbo.' + @0) AND i.is_primary_key = 1
        ORDER BY ic.key_ordinal`,
      [rawTableName],
    );
    if (pkRows.length > 0) {
      return pkRows.map((r: any) => `"${r.column_name}"`).join(', ');
    }
    return '"_cdmp_extracted_at"';
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
    } else if (this.isMssql) {
      // AD-E07-41 P4-followup / GETIDXCOLS: MSSQL has no pg_index / PRAGMA. The
      // sys.indexes + sys.index_columns + sys.columns join returns every indexed
      // column (PK's implicit clustered/nonclustered index + explicit CREATE INDEX),
      // real-DB verified shape (V11).
      const result = await this.dataSource.query(
        `SELECT c.name AS column_name
           FROM sys.indexes i
           JOIN sys.index_columns ic
             ON ic.object_id = i.object_id AND ic.index_id = i.index_id
           JOIN sys.columns c
             ON c.object_id = ic.object_id AND c.column_id = ic.column_id
          WHERE i.object_id = OBJECT_ID('dbo.' + @0)`,
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

  /**
   * Map external database types to SQL Server (MSSQL) raw-staging table types.
   * Mirrors the `lower.includes(...)` structure of the postgres/sqlite mappers.
   *
   * AD-E07-41 P4e design constraints:
   *  - Strings → `NVARCHAR(MAX)`: source lengths are unknown (ColumnMetadata has
   *    no length/precision), so avoid truncation; N-prefix keeps Chinese/Unicode
   *    correct under BIN collation (I-MSSQL-COLLATE-01).
   *  - decimal/numeric/money → `NVARCHAR(MAX)` (TYPEMAP-003 / MUST-FIX): MSSQL has
   *    no unbounded decimal, and a fixed `DECIMAL(38,10)` would re-open the
   *    FINDING-P4D-01 precision-overflow defect family at the raw DDL level. Text
   *    preserves the source's literal precision losslessly (PG uses unbounded
   *    NUMERIC; text is the equivalent that loses no precision on MSSQL).
   *  - date/datetime/timestamp/time family → `NVARCHAR(MAX)` (AD-E07-P6c / FINDING-P6C-01,
   *    same defect family as decimal): a source datetime read by tedious (`useUTC:true`)
   *    can surface a JS `Date` shifted below `datetime2`'s year-0001 floor (legacy
   *    minimum-date sentinels), or a legacy string-encoded dirty date ('0000-00-00',
   *    ''), neither of which fits a typed `DATETIME2`/`TIME` bulk column — real-DB
   *    reproduced the exact `OLE DB provider 'STREAM' ... returned invalid data for
   *    column '[!BulkInsert].<col>'` at ~1.02M/3.6M rows of P6c's first real ETL load.
   *    Text captures every legacy value faithfully (raw staging is a lossless 中繼);
   *    clean ISO values still implicit-convert to the typed target date columns
   *    downstream (real-DB verified), dirty values are the downstream pipeline's
   *    concern (see impl log — no DATE type_cast rule exists today). Only date/time
   *    are widened (proven temporal transport hazard); int/bigint/float/bit stay
   *    typed (no analogous hazard — see impl log §int/float decision).
   *  - `_cdmp_id` uses `IDENTITY(1,1)`, `_cdmp_extracted_at` uses `SYSUTCDATETIME()`
   *    (see createRawTable) — neither belongs here. `_cdmp_extracted_at` is a real
   *    `DATETIME2` column (always a valid SYSUTCDATETIME/ISO value), so
   *    `mapToBulkColumnType` KEEPS its datetime2/date branch for it; this widening
   *    only affects business source columns declared by createRawTable.
   */
  private mapToMssqlType(dataType: string): string {
    const lower = dataType.toLowerCase();
    if (lower.includes('serial')) {
      return 'INT';
    }
    if (lower.includes('uniqueidentifier') || lower.includes('uuid')) {
      return 'UNIQUEIDENTIFIER';
    }
    if (lower.includes('bigint')) {
      return 'BIGINT';
    }
    if (lower.includes('tinyint')) {
      return 'TINYINT';
    }
    if (lower.includes('smallint')) {
      return 'SMALLINT';
    }
    if (lower.includes('int')) {
      return 'INT';
    }
    if (lower.includes('bool') || lower.includes('bit')) {
      return 'BIT';
    }
    if (
      lower.includes('decimal') ||
      lower.includes('numeric') ||
      lower.includes('money')
    ) {
      // FINDING-P4D-01 同型缺陷家族防線：文字保真，不映射固定精度 DECIMAL(p,s)。
      return 'NVARCHAR(MAX)';
    }
    if (lower.includes('float') || lower.includes('double')) {
      return 'FLOAT';
    }
    if (lower.includes('real')) {
      return 'REAL';
    }
    if (
      lower.includes('binary') ||
      lower.includes('image') ||
      lower.includes('bytea') ||
      lower.includes('blob')
    ) {
      return 'VARBINARY(MAX)';
    }
    if (
      lower.includes('datetime') ||
      lower.includes('timestamp') ||
      lower === 'date' ||
      lower === 'time'
    ) {
      // FINDING-P6C-01（date 版之 FINDING-P4D-01 同型缺陷家族防線）：文字保真，不映射
      // 固定範圍的 DATETIME2/TIME。真實 legacy 日期／時間值（UTC 位移至 year<1 之最小日
      // 哨兵、字串化髒日期）塞不進 typed bulk 欄，會拋 'returned invalid data'。詳見類別
      // 註解與 impl log。
      return 'NVARCHAR(MAX)';
    }
    // Default: NVARCHAR(MAX) covers varchar/nvarchar/char/nchar/text/ntext/xml
    // and any unrecognised type (wide, lenient — matches the other two mappers).
    return 'NVARCHAR(MAX)';
  }
}
