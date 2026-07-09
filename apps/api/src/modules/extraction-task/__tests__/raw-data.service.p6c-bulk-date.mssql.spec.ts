/**
 * AD-E07-P6c / FINDING-P6C-01 — raw 日期欄 bulk-load 缺陷之重現 + 修復（真實 MSSQL 整合）。
 *
 * 缺陷：`mapToMssqlType` 舊版將來源 date/datetime/timestamp 欄映射為 typed `DATETIME2`
 *   raw 欄 → `openBulkWriter` 的 `mapToBulkColumnType` 據此宣告 bulk Table 欄為 DateTime2 →
 *   真實 legacy 某日期值（tedious `useUTC:true` 讀出後位移至 year<1 之最小日哨兵，或字串化
 *   髒日期）塞不進 datetime2 → tedious bulk 拋
 *   `OLE DB provider 'STREAM' ... returned invalid data for column '[!BulkInsert].<col>'`
 *   （P6c 首次真實 ETL 於 ~1,024,000 / 3,615,694 列失敗；同 FINDING-P4D-01 家族，decimal 早已改
 *   NVARCHAR(MAX)，date 漏掉）。
 *
 * 修法：date/datetime/timestamp/time 家族 → `NVARCHAR(MAX)`（文字保真）。本檔以「同一條
 *   `openBulkWriter` 程式路徑」對照兩種 raw 欄型別（手建 DATETIME2 重現舊行為 vs `createRawTable`
 *   建 NVARCHAR 走修法後行為），證明修法前失敗、修法後成功存為字串，並佐證下游相容性。
 *
 * 連線走 `.env.test.mssql`（dev CDMP，見 mssql-env-preload）。不可達 → 全檔 skip（never fake green）。
 * 自建拋棄式 raw_ / 下游目標表，afterAll DROP 清理；不觸碰已部署 baseline。
 */
import { MSSQL, mssqlPortReachable, restoreDbType, SKIP_REASON } from '@/database/__tests__/mssql-env-preload';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { DataSource } from 'typeorm';
import { RawDataService } from '../raw-data.service';

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
function tblName(): string {
  // downstream 目標表（非 raw_ 命名，免 validateTableName 限制）；同樣登記清理。
  const n = 'p6c_tgt_' + Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
  created.push(n);
  return n;
}

/** 「datetime2 塞不進」的髒值：UTC 位移至 year 0 的最小日哨兵（真實 legacy 型態，重現任務所述錯誤）。 */
const DIRTY_YEAR0_DATE = new Date('0000-12-31T16:00:00.000Z');
/** 字串化髒日期（legacy 零日期），亦無法作 typed datetime2 bulk 值。 */
const DIRTY_STRING_DATE = '0000-00-00';
/** 乾淨日期（多數列型態）：修法後存為 ISO 字串，下游仍可 implicit-convert 進 typed 目標。 */
const CLEAN_DATE = new Date('2024-01-15T08:30:00.000Z');

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
    console.warn('[P6c bulk-date] SKIP —', SKIP_REASON);
    ctx.skip();
    return false;
  }
  return true;
}

// ===========================================================================
// §一 重現：raw 日期欄為 typed DATETIME2（舊 mapToMssqlType 行為）→ bulk 失敗
// ===========================================================================
describe('P6c BULKDATE §一 重現（DATETIME2 raw 欄 → bulk 拒收髒日期）', () => {
  it('P6C-BULKDATE-001 (Repro/Date): DATETIME2 欄 bulk-load UTC 位移 year0 哨兵 → returned invalid data', async (ctx) => {
    if (!guard(ctx)) return;
    const t = rawName();
    // 手建 typed DATETIME2 日期欄 = 舊 mapToMssqlType('datetime') 之生成型別。
    await ds!.query(
      `CREATE TABLE "${t}" (_cdmp_id INT IDENTITY(1,1) PRIMARY KEY, "dt" DATETIME2, ` +
        `_cdmp_extracted_at DATETIME2 DEFAULT SYSUTCDATETIME())`,
    );
    // openBulkWriter 由 INFORMATION_SCHEMA 解析 dt 為 datetime2 → bulk 欄宣告 DateTime2。
    const writer = await svc.openBulkWriter(t, ['dt']);
    try {
      await expect(writer.writeRows([{ dt: DIRTY_YEAR0_DATE }])).rejects.toThrow(
        /returned invalid data|invalid data for column/i,
      );
    } finally {
      await writer.abort();
    }
    // 缺陷證據：該列未落庫（bulk 整批失敗）。
    const c = await ds!.query(`SELECT COUNT(*) AS c FROM "${t}"`);
    expect(Number(c[0].c)).toBe(0);
  });

  it('P6C-BULKDATE-002 (Repro/String): DATETIME2 欄 bulk-load 字串化零日期 → 拒收（Invalid date value）', async (ctx) => {
    if (!guard(ctx)) return;
    const t = rawName();
    await ds!.query(
      `CREATE TABLE "${t}" (_cdmp_id INT IDENTITY(1,1) PRIMARY KEY, "dt" DATETIME2, ` +
        `_cdmp_extracted_at DATETIME2 DEFAULT SYSUTCDATETIME())`,
    );
    const writer = await svc.openBulkWriter(t, ['dt']);
    try {
      await expect(writer.writeRows([{ dt: DIRTY_STRING_DATE }])).rejects.toThrow(
        /invalid data|invalid date value/i,
      );
    } finally {
      await writer.abort();
    }
  });
});

// ===========================================================================
// §二 修復：createRawTable 建 NVARCHAR(MAX) 日期欄 → bulk 成功、存為字串
// ===========================================================================
describe('P6c BULKDATE §二 修復（NVARCHAR raw 欄 → bulk 保真存字串）', () => {
  it('P6C-BULKDATE-003 (Fix/DDL): createRawTable 對 date/datetime/timestamp/time 生成 NVARCHAR(MAX)；系統欄仍 DATETIME2', async (ctx) => {
    if (!guard(ctx)) return;
    const t = rawName();
    await svc.createRawTable(t, [
      { name: 'd_date', dataType: 'date', isPrimary: false },
      { name: 'd_datetime', dataType: 'datetime', isPrimary: false },
      { name: 'd_timestamp', dataType: 'timestamp', isPrimary: false },
      { name: 'd_time', dataType: 'time', isPrimary: false },
    ]);
    const meta = await ds!.query(
      `SELECT COLUMN_NAME AS c, DATA_TYPE AS dt, CHARACTER_MAXIMUM_LENGTH AS len
         FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME=@0`,
      [t],
    );
    const byName = Object.fromEntries(meta.map((r: any) => [r.c, { dt: r.dt, len: r.len }]));
    for (const col of ['d_date', 'd_datetime', 'd_timestamp', 'd_time']) {
      expect(byName[col].dt, col).toBe('nvarchar');
      expect(byName[col].len, col).toBe(-1); // MAX
    }
    // 系統欄不受影響：_cdmp_extracted_at 仍 datetime2（恆有效值）。
    expect(byName._cdmp_extracted_at.dt).toBe('datetime2');
  });

  it('P6C-BULKDATE-004 (Fix/DoD): 同一 openBulkWriter 路徑對 NVARCHAR 欄成功吃 髒Date/髒字串/乾淨Date/NULL', async (ctx) => {
    if (!guard(ctx)) return;
    const t = rawName();
    // createRawTable 現將 'datetime' 映射為 NVARCHAR(MAX)（修法後行為）。
    await svc.createRawTable(t, [{ name: 'dt', dataType: 'datetime', isPrimary: false }]);

    const writer = await svc.openBulkWriter(t, ['dt']);
    try {
      await writer.writeRows([
        { dt: DIRTY_YEAR0_DATE },   // 修法前令 bulk 崩潰的髒 Date → 現保真存 ISO 字串
        { dt: DIRTY_STRING_DATE },  // 字串化零日期 → 原字串保真
        { dt: CLEAN_DATE },         // 乾淨 Date → ISO 字串
        { dt: null },               // NULL → SQL NULL
      ]);
      await writer.finish();
    } catch (e) {
      await writer.abort();
      throw e;
    }

    const rows = await ds!.query(`SELECT dt FROM "${t}" ORDER BY _cdmp_id`);
    expect(rows.length).toBe(4);
    // coerce：Date → toISOString()（isString 欄）
    expect(rows[0].dt).toBe(DIRTY_YEAR0_DATE.toISOString()); // '0000-12-31T16:00:00.000Z'
    expect(rows[1].dt).toBe(DIRTY_STRING_DATE);              // '0000-00-00' 原樣
    expect(rows[2].dt).toBe(CLEAN_DATE.toISOString());       // '2024-01-15T08:30:00.000Z'
    expect(rows[3].dt).toBeNull();
    // 乾淨值可 round-trip 回 Date（fidelity）
    expect(new Date(rows[2].dt).toISOString()).toBe(CLEAN_DATE.toISOString());
  });

  it('P6C-BULKDATE-005 (Fix/insertBatch 一致性): 參數化路徑 Date 亦存為 ISO（非 style-0 lossy 格式）', async (ctx) => {
    if (!guard(ctx)) return;
    const t = rawName();
    await svc.createRawTable(t, [{ name: 'dt', dataType: 'datetime', isPrimary: false }]);
    // insertBatch（incremental / 非串流 full 之慢路徑）：MSSQL 分支對 Date 先 toISOString()，
    // 與 bulk 路徑一致，避免 SQL Server 隱式 datetime→nvarchar 之 style-0（'Mar  4 2020  5:06AM'，
    // 掉秒、非 ISO、new Date() 無法解析）。
    await svc.insertBatch(t, ['dt'], [{ dt: CLEAN_DATE }, { dt: DIRTY_YEAR0_DATE }, { dt: null }]);
    const rows = await ds!.query(`SELECT dt FROM "${t}" ORDER BY _cdmp_id`);
    expect(rows[0].dt).toBe(CLEAN_DATE.toISOString());
    expect(rows[1].dt).toBe(DIRTY_YEAR0_DATE.toISOString());
    expect(rows[2].dt).toBeNull();
    // 無 lossy style-0 殘留
    expect(rows[0].dt).not.toMatch(/AM|PM/);
    expect(new Date(rows[0].dt).toISOString()).toBe(CLEAN_DATE.toISOString());
  });
});

// ===========================================================================
// §三 下游相容性佐證（raw NVARCHAR 日期字串 → typed 目標欄）
// ===========================================================================
describe('P6c BULKDATE §三 下游相容佐證', () => {
  it('P6C-BULKDATE-006 (Downstream/clean): 乾淨 ISO 字串 → INSERT...SELECT 進 datetime2/date typed 目標成功', async (ctx) => {
    if (!guard(ctx)) return;
    const raw = rawName();
    await svc.createRawTable(raw, [{ name: 'dt', dataType: 'datetime', isPrimary: false }]);
    const writer = await svc.openBulkWriter(raw, ['dt']);
    await writer.writeRows([{ dt: CLEAN_DATE }]);
    await writer.finish();

    // 模擬 target_load 之 INSERT...SELECT（nvarchar → typed 隱式轉換）。
    const tgt = tblName();
    await ds!.query(`CREATE TABLE "${tgt}" (x datetime2 NULL, y date NULL)`);
    await ds!.query(`INSERT INTO "${tgt}" (x, y) SELECT dt, dt FROM "${raw}"`);
    const got = await ds!.query(`SELECT x, y FROM "${tgt}"`);
    expect(new Date(got[0].x).toISOString()).toBe(CLEAN_DATE.toISOString());
    // date 欄僅保留日期部分
    expect(new Date(got[0].y).toISOString().slice(0, 10)).toBe('2024-01-15');
  });

  it('P6C-BULKDATE-007 (Downstream/dirty): 髒日期字串 隱式轉 typed 會失敗，但 TRY_CAST → NULL（防禦機制存在）', async (ctx) => {
    if (!guard(ctx)) return;
    const raw = rawName();
    await svc.createRawTable(raw, [{ name: 'dt', dataType: 'datetime', isPrimary: false }]);
    const writer = await svc.openBulkWriter(raw, ['dt']);
    await writer.writeRows([{ dt: DIRTY_STRING_DATE }, { dt: DIRTY_YEAR0_DATE }]);
    await writer.finish();

    const tgt = tblName();
    await ds!.query(`CREATE TABLE "${tgt}" (x datetime2 NULL)`);
    // (a) 隱式轉換髒日期 → 失敗（記錄下游現況：pipeline 若對此欄走 typed 目標直插會整批失敗）
    await expect(
      ds!.query(`INSERT INTO "${tgt}" (x) SELECT dt FROM "${raw}"`),
    ).rejects.toThrow(/conversion failed|converting date/i);
    // (b) TRY_CAST 防禦：髒日期 → NULL（P4a type_cast handler 之機制；但目前 5 條 pipeline 無 DATE
    //     type_cast 規則，日期欄係隱式轉入 typed 目標 → 見 impl log 之下游 follow-up）。
    const tc = await ds!.query(`SELECT TRY_CAST(dt AS date) AS v FROM "${raw}" ORDER BY _cdmp_id`);
    expect(tc[0].v).toBeNull();
    expect(tc[1].v).toBeNull();
  });
});
