/**
 * AD-E07-41 P4e — raw-data.service + ExtractionExecutionService 真實 MSSQL 整合。
 *
 * 涵蓋：§二 ISPG-GATE（createRawTable/tableExists/getTableColumns/drop/truncate 真庫）、
 * §一 TYPEMAP-010/011（IDENTITY / SYSUTCDATETIME 可執行）、§四 BULK-WRITE（round-trip/列數/NULL/空字串）、
 * §五 NOESCAPE-CHARSET（tab/newline/反斜線真實字元 + 中文 + 特殊字元）、§六 BATCH（逐批遞增/邊界）、
 * §七 E2E-EXTRACT（真實 MSSQLExecutor + RawDataService 走 bulk 路徑）、§八 PIPELINE-READ（ExtractHandlerMssql
 * 讀 bulk 產出）、§九 PERF、§一 PROBE-013、§四 BULKWRITE-006 abort。
 *
 * 不可達 CDMP_TEST 時 describe.skip 全檔（never fake green）。
 */
import { MSSQL, mssqlPortReachable, restoreDbType, SKIP_REASON } from '@/database/__tests__/mssql-env-preload';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { DataSource, Repository } from 'typeorm';
import { RawDataService } from '../raw-data.service';
import { ExtractionExecutionService } from '../extraction-execution.service';
import { MSSQLExecutor } from '../executors/mssql-executor';
import type { ColumnMetadata } from '../extraction-executor.provider';
import { Datasource } from '@/database/entities/datasource.entity';
import { CryptoUtil } from '@/common/crypto/crypto.util';
import { randomBytes } from 'crypto';
import { ExtractHandlerMssql } from '../../etl/engine/handlers/extract-handler-mssql';
import { dropMssqlTempTableIfExists } from '../../etl/engine/handlers/mssql/temp-table.util';
import { makeRealCtx } from '../../etl/engine/__tests__/_p4a-mssql-harness';

vi.setConfig({ testTimeout: 30000 });

let ds: DataSource | null = null;
let svc: RawDataService;
let reachable = false;
const created: string[] = [];

function rawName(): string {
  const n = 'raw_' + Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
  created.push(n);
  return n;
}

async function count(table: string): Promise<number> {
  const rows = await ds!.query(`SELECT COUNT(*) AS c FROM "${table}"`);
  return Number(rows[0].c);
}

beforeAll(async () => {
  reachable = await mssqlPortReachable(1500);
  if (!reachable) return;
  try {
    ds = new DataSource({
      type: 'mssql',
      host: MSSQL.host,
      port: MSSQL.port,
      username: MSSQL.username,
      password: MSSQL.password,
      database: MSSQL.database,
      options: { encrypt: MSSQL.encrypt, trustServerCertificate: MSSQL.trustServerCertificate, useUTC: true },
      entities: [],
      synchronize: false,
    });
    await ds.initialize();
    svc = new RawDataService(ds, null as any, null as any);
  } catch {
    ds = null;
    reachable = false;
  }
}, 30000);

afterAll(async () => {
  if (ds) {
    for (const t of created) {
      try { await ds.query(`DROP TABLE IF EXISTS "${t}"`); } catch { /* ignore */ }
    }
    await ds.destroy();
  }
  restoreDbType();
});

function guard(ctx: { skip: () => void }): boolean {
  if (!reachable || !ds) {
    console.warn('[P4e raw-data] SKIP —', SKIP_REASON);
    ctx.skip();
    return false;
  }
  return true;
}

// Representative mixed-type raw table (createRawTable maps source → raw DDL).
const MIXED_COLS: ColumnMetadata[] = [
  { name: 's', dataType: 'nvarchar', isPrimary: false }, // NVARCHAR(MAX)
  { name: 'i', dataType: 'int', isPrimary: false }, // INT
  { name: 'big', dataType: 'bigint', isPrimary: false }, // BIGINT
  { name: 'flag', dataType: 'bit', isPrimary: false }, // BIT
  { name: 'dt', dataType: 'datetime', isPrimary: false }, // DATETIME2
  { name: 'amt', dataType: 'decimal', isPrimary: false }, // NVARCHAR(MAX) (TYPEMAP-003)
];
const MIXED_ALL = ['s', 'i', 'big', 'flag', 'dt', 'amt', '_cdmp_extracted_at'];

// ---------------------------------------------------------------------------
// §二 ISPG-GATE + §一 TYPEMAP-010/011
// ---------------------------------------------------------------------------
describe('P4e ISPG-GATE (real MSSQL)', () => {
  it('CREATETABLE-002 / TABLEEXISTS-002 / GETTABLECOLUMNS-001 / TYPEMAP-010/011 (DoD core)', async (ctx) => {
    if (!guard(ctx)) return;
    const t = rawName();

    // 建立前不存在
    expect(await svc.tableExists(t)).toBe(false);

    // createRawTable (mssql 分支：IDENTITY / DATETIME2 SYSUTCDATETIME 可執行不拋錯)
    await svc.createRawTable(t, MIXED_COLS);

    // OBJECT_ID 非 NULL + tableExists true
    const oid = await ds!.query(`SELECT OBJECT_ID('dbo.${t}', 'U') AS o`);
    expect(oid[0].o).not.toBeNull();
    expect(await svc.tableExists(t)).toBe(true);

    // getTableColumns（INFORMATION_SCHEMA，含系統欄）
    const cols = await svc.getTableColumns(t);
    expect(cols).toEqual(['_cdmp_id', 's', 'i', 'big', 'flag', 'dt', 'amt', '_cdmp_extracted_at']);

    // _cdmp_id IDENTITY + _cdmp_extracted_at 型別/預設可實際運作：直接 INSERT 一列（不給兩系統欄）
    await ds!.query(`INSERT INTO "${t}" (s, i, big, flag, dt, amt) VALUES (N'x', 1, 2, 1, '2020-01-01', N'3')`);
    const row = await ds!.query(`SELECT _cdmp_id, _cdmp_extracted_at FROM "${t}"`);
    expect(row[0]._cdmp_id).toBe(1); // IDENTITY(1,1)
    expect(row[0]._cdmp_extracted_at).toBeInstanceOf(Date); // SYSUTCDATETIME() default
  });

  it('CREATETABLE-002 冪等：重複 createRawTable 不拋錯（OBJECT_ID guard）', async (ctx) => {
    if (!guard(ctx)) return;
    const t = rawName();
    await svc.createRawTable(t, MIXED_COLS);
    await expect(svc.createRawTable(t, MIXED_COLS)).resolves.toBeUndefined();
  });

  it('CREATETABLE-003: 單一 PK（inline）與複合 PK（table-level）於 T-SQL 可執行', async (ctx) => {
    if (!guard(ctx)) return;
    const single = rawName();
    await svc.createRawTable(single, [
      { name: 'ID', dataType: 'int', isPrimary: true },
      { name: 'V', dataType: 'varchar', isPrimary: false },
    ]);
    expect(await svc.tableExists(single)).toBe(true);

    const comp = rawName();
    await svc.createRawTable(comp, [
      { name: 'K1', dataType: 'int', isPrimary: true },
      { name: 'K2', dataType: 'bigint', isPrimary: true },
    ]);
    expect(await svc.tableExists(comp)).toBe(true);
  });

  it('CREATETABLE-FINDING (範圍外，flag 非自行重設計): 字串來源 PK → NVARCHAR(MAX) 無法作 MSSQL PK/index key', async (ctx) => {
    if (!guard(ctx)) return;
    // NVARCHAR(MAX)/MAX 型別不可作為 PRIMARY KEY / index key（MSSQL 硬限制）。
    // 真實來源（客戶編號多為字串型 PK）於 MSSQL 走 createRawTable 會在此拋錯 →
    // 記入 impl log「範圍外家族」，建議後續：PK 字串欄改有界 NVARCHAR(≤450) 或忽略來源 PK 一律用 _cdmp_id。
    const t = rawName();
    await expect(
      svc.createRawTable(t, [{ name: 'CUST_NO', dataType: 'varchar', isPrimary: true }]),
    ).rejects.toThrow();
  });

  it('DROPTABLE-001 (Regression): dropTable / truncateTable 免改動於 mssql 可執行', async (ctx) => {
    if (!guard(ctx)) return;
    const t = rawName();
    await svc.createRawTable(t, MIXED_COLS);
    await ds!.query(`INSERT INTO "${t}" (s) VALUES (N'a')`);
    expect(await count(t)).toBe(1);
    await svc.truncateTable(t); // mssql → DELETE FROM（既有 else 分支，冪等）
    expect(await count(t)).toBe(0);
    await svc.dropTable(t); // DROP TABLE IF EXISTS（T-SQL 2016+ 原生）
    expect(await svc.tableExists(t)).toBe(false);
  });

  it('SANITIZE-001 (Regression): sanitizeColumnName / validateTableName 不受 dbType 影響', async (ctx) => {
    if (!guard(ctx)) return;
    expect(svc.sanitizeColumnName('AB-C.1')).toBe('AB_C_1');
    // validateTableName 拒非法名（openBulkWriter 亦透過此驗證）
    await expect(svc.openBulkWriter('DROP TABLE x' as any, ['a'])).rejects.toThrow(/Invalid raw table/);
  });
});

// ---------------------------------------------------------------------------
// §四 BULK-WRITE + §五 NOESCAPE-CHARSET
// ---------------------------------------------------------------------------
describe('P4e BULK-WRITE + NOESCAPE-CHARSET (real MSSQL)', () => {
  it('BULKWRITE-001/002/003/004 + NOESCAPE-001 + CHARSET-001/003: 逐欄 round-trip / NULL / 空字串 / 真實控制字元 / 中文 / 特殊字元', async (ctx) => {
    if (!guard(ctx)) return;
    const t = rawName();
    await svc.createRawTable(t, MIXED_COLS);
    const writer = await svc.openBulkWriter(t, MIXED_ALL);

    const dt1 = new Date('2020-03-04T05:06:07.000Z');
    await writer.writeRows([
      // NOESCAPE-001 + CHARSET-001：真實 tab/newline/反斜線 + 中文（含罕用字）
      { s: '借新還舊\ta\nb\\c 車貸', i: 42, big: '9007199254740993', flag: true, dt: dt1, amt: '3.14', _cdmp_extracted_at: '2020-01-01T00:00:00.000Z' },
      // NULL 列（型別化 NULL，非 COPY '\N'）
      { s: null, i: null, big: null, flag: null, dt: null, amt: null, _cdmp_extracted_at: '2020-01-02T00:00:00.000Z' },
      // 空字串 vs NULL 可區分 + CHARSET-003 特殊字元 + flag false
      { s: `O'Brien "x" 50%`, i: 0, big: '0', flag: false, dt: null, amt: '', _cdmp_extracted_at: '2020-01-03T00:00:00.000Z' },
    ]);
    await writer.finish();

    expect(await count(t)).toBe(3);
    const rows = await ds!.query(`SELECT s, i, big, flag, dt, amt FROM "${t}" ORDER BY _cdmp_extracted_at`);

    // Row 1：逐字元相等（真實控制字元，非 \t 字面兩字元 → 證明未誤用 COPY 跳脫）
    expect(rows[0].s).toBe('借新還舊\ta\nb\\c 車貸');
    expect(rows[0].s.includes('\\t')).toBe(false); // 反證：不得含字面 backslash+t
    expect(rows[0].i).toBe(42);
    expect(rows[0].big).toBe('9007199254740993'); // BIGINT → string（>2^53 精度）
    expect(rows[0].flag).toBe(true);
    expect(new Date(rows[0].dt).toISOString().slice(0, 19)).toBe('2020-03-04T05:06:07');
    expect(rows[0].amt).toBe('3.14');

    // Row 2：全 NULL（SQL NULL，非字面 '\N'）
    expect(rows[1].s).toBeNull();
    expect(rows[1].i).toBeNull();
    expect(rows[1].amt).toBeNull();
    expect(rows[1].flag).toBeNull();

    // Row 3：空字串 ≠ NULL；特殊字元；flag false
    expect(rows[2].s).toBe(`O'Brien "x" 50%`);
    expect(rows[2].i).toBe(0);
    expect(rows[2].amt).toBe(''); // 空字串保留（非 NULL）
    expect(rows[2].amt).not.toBeNull();
    expect(rows[2].flag).toBe(false);
  });

  it('CHARSET-002 (Boundary, 佐證): 非 BMP 字元（surrogate pair）round-trip', async (ctx) => {
    if (!guard(ctx)) return;
    const t = rawName();
    await svc.createRawTable(t, [{ name: 's', dataType: 'nvarchar', isPrimary: false }]);
    const writer = await svc.openBulkWriter(t, ['s', '_cdmp_extracted_at']);
    const nonBmp = '𧬈😀'; // U+27B08 + U+1F600（各需 surrogate pair）
    await writer.writeRows([{ s: nonBmp, _cdmp_extracted_at: '2020-01-01T00:00:00.000Z' }]);
    await writer.finish();
    const rows = await ds!.query(`SELECT s FROM "${t}"`);
    expect(rows[0].s).toBe(nonBmp);
  });

  it('BULKWRITE-005 (Regression): openBulkWriter 對 postgres/sqlite fake DS 拒絕', async (ctx) => {
    if (!guard(ctx)) return;
    const pg = new RawDataService({ options: { type: 'postgres' } } as any, null as any, null as any);
    await expect(pg.openBulkWriter('raw_deadbeef', ['a'])).rejects.toThrow(/MSSQL|SQL Server/);
  });

  it('BULKWRITE-006 (Probe): abort() 不拋例外；已寫入批次留存', async (ctx) => {
    if (!guard(ctx)) return;
    const t = rawName();
    await svc.createRawTable(t, [{ name: 's', dataType: 'nvarchar', isPrimary: false }]);
    const writer = await svc.openBulkWriter(t, ['s', '_cdmp_extracted_at']);
    await writer.writeRows([{ s: 'kept', _cdmp_extracted_at: '2020-01-01T00:00:00.000Z' }]);
    // abort 硬性契約：never throws
    await expect(writer.abort(new Error('mid-way'))).resolves.toBeUndefined();
    // 已 flush 的批次（獨立 bulk）留存於目標表（實作而定，據實記錄）
    expect(await count(t)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// §六 BATCH
// ---------------------------------------------------------------------------
describe('P4e BATCH (real MSSQL)', () => {
  it('BATCH-001/002: 逐批觸發獨立 bulk，目標表列數隨每次 writeRows 逐步增加（記憶體有界佐證）', async (ctx) => {
    if (!guard(ctx)) return;
    const t = rawName();
    await svc.createRawTable(t, [{ name: 'i', dataType: 'int', isPrimary: false }]);
    const writer = await svc.openBulkWriter(t, ['i', '_cdmp_extracted_at']);
    const iso = '2020-01-01T00:00:00.000Z';
    const batch = (base: number) => Array.from({ length: 50 }, (_, k) => ({ i: base + k, _cdmp_extracted_at: iso }));

    await writer.writeRows(batch(0));
    expect(await count(t)).toBe(50); // 逐步增加（非 finish 後才一次跳增）
    await writer.writeRows(batch(50));
    expect(await count(t)).toBe(100);
    await writer.writeRows(batch(100));
    expect(await count(t)).toBe(150);
    await writer.finish();

    // 無遺漏/重複：0..149 各一次
    const distinct = await ds!.query(`SELECT COUNT(DISTINCT i) AS d, MIN(i) AS mn, MAX(i) AS mx FROM "${t}"`);
    expect(Number(distinct[0].d)).toBe(150);
    expect(Number(distinct[0].mn)).toBe(0);
    expect(Number(distinct[0].mx)).toBe(149);
  });

  it('BATCH-003 (Boundary): 空批 writeRows([]) no-op、非整除餘數、單批小於批量、finish 後總數正確', async (ctx) => {
    if (!guard(ctx)) return;
    const t = rawName();
    await svc.createRawTable(t, [{ name: 'i', dataType: 'int', isPrimary: false }]);
    const writer = await svc.openBulkWriter(t, ['i', '_cdmp_extracted_at']);
    const iso = '2020-01-01T00:00:00.000Z';
    await writer.writeRows([]); // 空批不拋錯、不增列
    expect(await count(t)).toBe(0);
    await writer.writeRows([{ i: 1, _cdmp_extracted_at: iso }]); // 單列
    await writer.writeRows([]); // 再一個空批
    await writer.writeRows([{ i: 2, _cdmp_extracted_at: iso }, { i: 3, _cdmp_extracted_at: iso }]); // 餘數批
    await writer.finish();
    expect(await count(t)).toBe(3);
  });

  it('PROBE-013 (記錄): bulk 欄型別若與目標窄型不符，bcp 拒絕（非靜默截斷）— 佐證需與目標一致', async (ctx) => {
    if (!guard(ctx)) return;
    // 直接以 mssql 套件重現探測結論（openBulkWriter 以 INFORMATION_SCHEMA 對齊型別故不受此害）
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const sql = require('mssql');
    const t = rawName();
    await svc.createRawTable(t, [{ name: 's', dataType: 'nvarchar', isPrimary: false }]);
    const pool = new sql.ConnectionPool({
      server: MSSQL.host, port: MSSQL.port, user: MSSQL.username, password: MSSQL.password,
      database: MSSQL.database, options: { encrypt: MSSQL.encrypt, trustServerCertificate: MSSQL.trustServerCertificate },
    });
    await pool.connect();
    try {
      const tbl = new sql.Table(t);
      tbl.create = false;
      tbl.columns.add('s', sql.NVarChar(100), { nullable: true }); // 刻意窄於 NVARCHAR(MAX)
      tbl.rows.add('A'.repeat(250));
      await expect(pool.request().bulk(tbl)).rejects.toThrow(); // (a) 拋錯，非靜默截斷
    } finally {
      await pool.close();
    }
  });
});

// ---------------------------------------------------------------------------
// §七 E2E-EXTRACT + §八 PIPELINE-READ + §九 PERF
// ---------------------------------------------------------------------------
describe('P4e E2E-EXTRACT / PIPELINE-READ / PERF (real MSSQL)', () => {
  const AES_KEY = randomBytes(32).toString('hex');
  const srcTables: string[] = [];

  function srcName(): string {
    const n = 'p4e_src_' + Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
    srcTables.push(n);
    return n;
  }

  afterAll(async () => {
    if (ds) {
      for (const s of srcTables) {
        try { await ds.query(`DROP TABLE IF EXISTS "${s}"`); } catch { /* ignore */ }
      }
    }
  });

  function makeExecutor(): MSSQLExecutor {
    process.env.AES_ENCRYPTION_KEY = AES_KEY;
    const encrypted = CryptoUtil.encrypt(MSSQL.password);
    const repo = {
      findOne: vi.fn().mockResolvedValue({
        id: 'ds-cdmp-test', host: MSSQL.host, port: MSSQL.port, database_name: MSSQL.database,
        username: MSSQL.username, encrypted_password: encrypted, type: 'sqlserver',
      } as Partial<Datasource>),
    } as unknown as Repository<Datasource>;
    return new MSSQLExecutor(repo);
  }

  function makeTask(raw: string, src: string, overrides: Record<string, any> = {}) {
    return {
      id: 'task-e2e', datasource_id: 'ds-cdmp-test', source_table: src, source_schema: 'dbo',
      mode: 'full', raw_table_name: raw, incremental_column: null, last_incremental_value: null,
      status: 'running', execution_count: 0, avg_duration_ms: 0, extracted_count: 0,
      progress_percent: 0, total_count: 0, error_message: null, ...overrides,
    };
  }

  async function seedSource(src: string, n: number): Promise<void> {
    await ds!.query(`CREATE TABLE dbo.${src} (id INT, name NVARCHAR(50), amt DECIMAL(10,2))`);
    await ds!.query(
      `INSERT INTO dbo.${src} (id, name, amt)
         SELECT TOP ${n} ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS rn,
                N'客戶' + CAST(ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS NVARCHAR(10)), 1.50
         FROM sys.all_columns a CROSS JOIN sys.all_columns b`,
    );
  }

  it('E2EEXTRACT-001/002/005: 全量擷取走 bulk 路徑、列數一致、log/task 狀態正確、重跑冪等', async (ctx) => {
    if (!guard(ctx)) return;
    const src = srcName();
    const raw = rawName();
    await seedSource(src, 1200); // >1000 → 至少 2 批（BATCH_SIZE=1000）

    const executor = makeExecutor();
    const bulkSpy = vi.spyOn(svc, 'openBulkWriter');
    const insertSpy = vi.spyOn(svc, 'insertBatch');
    const taskRepo = { save: vi.fn(async (t: any) => t) } as any;
    const logRepo = { save: vi.fn(async (l: any) => l) } as any;
    const exec = new ExtractionExecutionService(taskRepo, logRepo, executor, svc);

    const task = makeTask(raw, src);
    const log: any = { total_count: 0, extracted_count: 0 };
    await (exec as any).executeExtraction(task, log);

    // bulk 路徑（非 insertBatch 慢迴圈）
    expect(bulkSpy).toHaveBeenCalledTimes(1);
    expect(insertSpy).not.toHaveBeenCalled();
    // 列數一致
    expect(await count(raw)).toBe(1200);
    expect(task.status).toBe('completed');
    expect(task.extracted_count).toBe(1200);
    expect(log.status).toBe('completed');
    expect(log.extracted_count).toBe(1200);
    // 中文欄位值 round-trip 抽查
    const sample = await ds!.query(`SELECT name FROM "${raw}" WHERE id = 1`);
    expect(sample[0].name).toBe('客戶1');

    // E2EEXTRACT-005：同來源重跑 → TRUNCATE(DELETE) 後不疊加
    const task2 = makeTask(raw, src);
    await (exec as any).executeExtraction(task2, { total_count: 0, extracted_count: 0 });
    expect(await count(raw)).toBe(1200);

    bulkSpy.mockRestore();
    insertSpy.mockRestore();
  });

  it('PIPELINEREAD-001/002/003: ExtractHandlerMssql 讀 bulk 產出之 raw 表，列數/中文/NULL 一致', async (ctx) => {
    if (!guard(ctx)) return;
    // 以 bulk-load 直接灌一張 raw 表（含中文 + NULL）
    const raw = rawName();
    await svc.createRawTable(raw, [
      { name: 'id', dataType: 'int', isPrimary: false },
      { name: 'nm', dataType: 'nvarchar', isPrimary: false },
    ]);
    const writer = await svc.openBulkWriter(raw, ['id', 'nm', '_cdmp_extracted_at']);
    const iso = '2020-01-01T00:00:00.000Z';
    await writer.writeRows([
      { id: 1, nm: '借新還舊', _cdmp_extracted_at: iso },
      { id: 2, nm: null, _cdmp_extracted_at: iso },
      { id: 3, nm: '中古車商', _cdmp_extracted_at: iso },
    ]);
    await writer.finish();

    // P4a ExtractHandlerMssql 讀取 bulk 產出（複用 P4a harness ctx；共享同一 QueryRunner）
    const qr = ds!.createQueryRunner();
    await qr.connect();
    try {
      const handler = new ExtractHandlerMssql();
      const ctx2 = makeRealCtx(qr, 'raw_data_extract', { rawTable: raw }, {}, { nodeId: 'ex' });
      const out = await handler.execute(ctx2);
      expect(out.rowCount).toBe(3); // 列數一致
      const back = await qr.query(`SELECT id, nm FROM ${out.tempTable} ORDER BY id`);
      expect(back.map((r: any) => r.nm)).toEqual(['借新還舊', null, '中古車商']); // 中文一致 + NULL 正確辨識
      await dropMssqlTempTableIfExists(qr, out.tempTable);
    } finally {
      await qr.release();
    }
  });

  it('PERF-001/002 (Observability, 非阻擋): bulk-load 吞吐量量測', async (ctx) => {
    if (!guard(ctx)) return;
    const raw = rawName();
    await svc.createRawTable(raw, [{ name: 'i', dataType: 'int', isPrimary: false }]);
    const writer = await svc.openBulkWriter(raw, ['i', '_cdmp_extracted_at']);
    const iso = '2020-01-01T00:00:00.000Z';
    const N_ROWS = 10000;
    const t0 = Date.now();
    for (let off = 0; off < N_ROWS; off += 1000) {
      await writer.writeRows(Array.from({ length: 1000 }, (_, k) => ({ i: off + k, _cdmp_extracted_at: iso })));
    }
    await writer.finish();
    const ms = Date.now() - t0;
    console.log(`[P4e PERF-001] bulk-load ${N_ROWS} 列耗時 ${ms}ms (${Math.round(N_ROWS / (ms / 1000))} rows/s)`);
    expect(await count(raw)).toBe(N_ROWS);
  });
});
