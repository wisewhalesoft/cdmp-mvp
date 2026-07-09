/**
 * AD-E07-41 P4-followup — raw-data.service 完整性（真實 MSSQL 整合）。
 *
 * 覆蓋 test 設計 `AD-E07-41-P4-followup-rawdata-test.md`：
 *  §一 PKFINDING（candidate b：字串來源 PK → _cdmp_id surrogate）006/008/009/010
 *  §二 GETCOLMETA 001(trap)/002/003
 *  §三 GETIDXCOLS 001(trap)/002/003
 *  §四 GETRAWPAGE 001(trap)/002/003/004/005/006/007
 *  §五 INSERTBATCH 001(trap)/002/003/004/005/007
 *  §六 E2EAPI 001/002/003/004/005
 *
 * 連線一律走本機 dev 容器（localhost:1433 / CDMP_TEST，見 mssql-env-preload）。
 * 不可達時 describe.skip 全檔（never fake green）。自建拋棄式 raw_/來源表，afterAll DROP 清理。
 */
import { MSSQL, mssqlPortReachable, restoreDbType, SKIP_REASON } from '@/database/__tests__/mssql-env-preload';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { DataSource } from 'typeorm';
import { RawDataService } from '../raw-data.service';
import { ExtractionExecutionService } from '../extraction-execution.service';
import type { ColumnMetadata } from '../extraction-executor.provider';

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
    console.warn('[P4fu raw-data] SKIP —', SKIP_REASON);
    ctx.skip();
    return false;
  }
  return true;
}

/** Mock ExtractionTask/ExtractionLog repos for getRawData()'s task lookup. */
function makeSvcWithRepos(task: any): RawDataService {
  const taskRepo = { findOne: vi.fn().mockResolvedValue(task) } as any;
  const logRepo = { findOne: vi.fn().mockResolvedValue(null) } as any;
  return new RawDataService(ds as DataSource, taskRepo, logRepo);
}

const MIXED_COLS: ColumnMetadata[] = [
  { name: 's', dataType: 'nvarchar', isPrimary: false }, // NVARCHAR(MAX)
  { name: 'i', dataType: 'int', isPrimary: false }, // INT
  { name: 'big', dataType: 'bigint', isPrimary: false }, // BIGINT
  { name: 'flag', dataType: 'bit', isPrimary: false }, // BIT
  { name: 'dt', dataType: 'datetime', isPrimary: false }, // DATETIME2
  { name: 'amt', dataType: 'decimal', isPrimary: false }, // NVARCHAR(MAX) (TYPEMAP-003)
];

// ===========================================================================
// §一 PKFINDING — candidate (b): 字串來源 PK → _cdmp_id surrogate
// ===========================================================================
describe('P4fu PKFINDING (candidate b, real MSSQL)', () => {
  it('PKFINDING-006: 單一字串 PK → _cdmp_id surrogate、CUST_NO 非 PK NVARCHAR(MAX)、>900byte round-trip', async (ctx) => {
    if (!guard(ctx)) return;
    const t = rawName();
    await expect(
      svc.createRawTable(t, [{ name: 'CUST_NO', dataType: 'varchar', isPrimary: true }]),
    ).resolves.toBeUndefined();

    const cols = await svc.getTableColumns(t);
    expect(cols).toEqual(['_cdmp_id', 'CUST_NO', '_cdmp_extracted_at']);

    const idx = await ds!.query(
      `SELECT c.name AS col, i.is_primary_key AS pk
         FROM sys.indexes i
         JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
         JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
        WHERE i.object_id = OBJECT_ID('dbo.' + @0)`,
      [t],
    );
    expect(idx.filter((r: any) => r.pk).map((r: any) => r.col)).toEqual(['_cdmp_id']);
    expect(idx.map((r: any) => r.col)).not.toContain('CUST_NO');

    // 天生不受 900-byte index-key 上限（candidate b 結構性優勢）
    const long = '客'.repeat(600); // 1200 bytes
    await ds!.query(`INSERT INTO "${t}" (CUST_NO) VALUES (@0)`, [long]);
    const back = await ds!.query(`SELECT CUST_NO FROM "${t}"`);
    expect(back[0].CUST_NO).toBe(long);
  });

  it('PKFINDING-008: 純 int 來源 PK（單一/複合）不受本輪修法影響（決策範圍=僅字串/MAX 型別觸發 surrogate）', async (ctx) => {
    if (!guard(ctx)) return;
    // 單一 int PK：保留原生 PK、無 _cdmp_id
    const single = rawName();
    await svc.createRawTable(single, [
      { name: 'ID', dataType: 'int', isPrimary: true },
      { name: 'V', dataType: 'varchar', isPrimary: false },
    ]);
    const sCols = await svc.getTableColumns(single);
    expect(sCols).toEqual(['ID', 'V', '_cdmp_extracted_at']); // 無 _cdmp_id
    const sPk = await ds!.query(
      `SELECT c.name AS col FROM sys.indexes i
         JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
         JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
        WHERE i.object_id = OBJECT_ID('dbo.' + @0) AND i.is_primary_key = 1`,
      [single],
    );
    expect(sPk.map((r: any) => r.col)).toEqual(['ID']);

    // 純 int/bigint 複合 PK：table-level PK 不變、無 _cdmp_id
    const comp = rawName();
    await svc.createRawTable(comp, [
      { name: 'K1', dataType: 'int', isPrimary: true },
      { name: 'K2', dataType: 'bigint', isPrimary: true },
    ]);
    const cCols = await svc.getTableColumns(comp);
    expect(cCols).not.toContain('_cdmp_id');
    const cPk = await ds!.query(
      `SELECT c.name AS col FROM sys.indexes i
         JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
         JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
        WHERE i.object_id = OBJECT_ID('dbo.' + @0) AND i.is_primary_key = 1
        ORDER BY ic.key_ordinal`,
      [comp],
    );
    expect(cPk.map((r: any) => r.col)).toEqual(['K1', 'K2']);
  });

  it('PKFINDING-009: 無 PK / 非字串欄情境不受影響（_cdmp_id surrogate 一如既往）', async (ctx) => {
    if (!guard(ctx)) return;
    const t = rawName();
    await svc.createRawTable(t, MIXED_COLS);
    const cols = await svc.getTableColumns(t);
    expect(cols).toEqual(['_cdmp_id', 's', 'i', 'big', 'flag', 'dt', 'amt', '_cdmp_extracted_at']);
  });

  it('PKFINDING-010: 混合複合 PK（1 int + 1 字串）→ 字串鍵為 MAX 型別 → 整組降級為 _cdmp_id surrogate', async (ctx) => {
    if (!guard(ctx)) return;
    const t = rawName();
    await svc.createRawTable(t, [
      { name: 'K1', dataType: 'int', isPrimary: true },
      { name: 'K2', dataType: 'varchar', isPrimary: true },
    ]);
    const cols = await svc.getTableColumns(t);
    expect(cols).toEqual(['_cdmp_id', 'K1', 'K2', '_cdmp_extracted_at']);
    const pk = await ds!.query(
      `SELECT c.name AS col FROM sys.indexes i
         JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
         JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
        WHERE i.object_id = OBJECT_ID('dbo.' + @0) AND i.is_primary_key = 1`,
      [t],
    );
    expect(pk.map((r: any) => r.col)).toEqual(['_cdmp_id']); // 非 K1/K2
  });
});

// ===========================================================================
// §二 GETCOLMETA
// ===========================================================================
describe('P4fu GETCOLMETA (real MSSQL)', () => {
  it('GETCOLMETA-001 (trap): 現行 sqlite 分支字面 PRAGMA 對 MSSQL 拋 #102', async (ctx) => {
    if (!guard(ctx)) return;
    const t = rawName();
    await svc.createRawTable(t, MIXED_COLS);
    // 重現修法前 sqlite 分支字面 SQL（PRAGMA），證明缺口存在（V13）
    await expect(ds!.query(`PRAGMA table_info("${t}")`)).rejects.toThrow();
  });

  it('GETCOLMETA-002 (DoD): mssql 分支正確回傳欄位 metadata（順序/isSystem/欄位數）', async (ctx) => {
    if (!guard(ctx)) return;
    const t = rawName();
    await svc.createRawTable(t, MIXED_COLS);
    const meta = await (svc as any).getColumnMetadata(t);
    expect(meta.map((c: any) => c.name)).toEqual([
      '_cdmp_id', 's', 'i', 'big', 'flag', 'dt', 'amt', '_cdmp_extracted_at',
    ]);
    const sys = Object.fromEntries(meta.map((c: any) => [c.name, c.isSystem]));
    expect(sys._cdmp_id).toBe(true);
    expect(sys._cdmp_extracted_at).toBe(true);
    expect(sys.s).toBe(false);
    expect(sys.amt).toBe(false);
    // 欄位數與 getTableColumns 一致（交叉驗證）
    const cols = await svc.getTableColumns(t);
    expect(meta.length).toBe(cols.length);
  });

  it('GETCOLMETA-003: dataType 回傳 INFORMATION_SCHEMA 原生字面（int/nvarchar/bigint/bit/datetime2）', async (ctx) => {
    if (!guard(ctx)) return;
    const t = rawName();
    await svc.createRawTable(t, MIXED_COLS);
    const meta = await (svc as any).getColumnMetadata(t);
    const byName = Object.fromEntries(meta.map((c: any) => [c.name, c.dataType]));
    expect(byName._cdmp_id).toBe('int');
    expect(byName.s).toBe('nvarchar');
    expect(byName.i).toBe('int');
    expect(byName.big).toBe('bigint');
    expect(byName.flag).toBe('bit');
    expect(byName.dt).toBe('datetime2');
    expect(byName.amt).toBe('nvarchar'); // decimal → NVARCHAR(MAX)，DATA_TYPE 回報 'nvarchar'
    expect(byName._cdmp_extracted_at).toBe('datetime2');
  });
});

// ===========================================================================
// §三 GETIDXCOLS
// ===========================================================================
describe('P4fu GETIDXCOLS (real MSSQL)', () => {
  it('GETIDXCOLS-001 (trap): 現行 sqlite 分支字面 PRAGMA index_list 對 MSSQL 拋 #102', async (ctx) => {
    if (!guard(ctx)) return;
    const t = rawName();
    await svc.createRawTable(t, MIXED_COLS);
    await expect(ds!.query(`PRAGMA index_list("${t}")`)).rejects.toThrow();
  });

  it('GETIDXCOLS-002 (DoD): 已索引 vs 未索引欄位正確辨識', async (ctx) => {
    if (!guard(ctx)) return;
    const t = rawName();
    await svc.createRawTable(t, MIXED_COLS); // _cdmp_id PK
    await ds!.query(`CREATE INDEX ix_p4fu_i ON "${t}" (i)`);
    const idx: Set<string> = await (svc as any).getIndexedColumns(t);
    expect(idx.has('_cdmp_id')).toBe(true); // PK 隱含 index
    expect(idx.has('i')).toBe(true); // 顯式 index
    expect(idx.has('s')).toBe(false); // 一般欄
    expect(idx.has('amt')).toBe(false);
  });

  it('GETIDXCOLS-003 (Boundary): 僅 PK、無額外索引 → 只含 PK 欄位', async (ctx) => {
    if (!guard(ctx)) return;
    const t = rawName();
    await svc.createRawTable(t, MIXED_COLS);
    const idx: Set<string> = await (svc as any).getIndexedColumns(t);
    expect([...idx]).toEqual(['_cdmp_id']);
  });
});

// ===========================================================================
// §四 GETRAWDATA-PAGE
// ===========================================================================
describe('P4fu GETRAWPAGE (real MSSQL)', () => {
  /** Build a raw table (no source PK → _cdmp_id) seeded with seq 1..n + name. */
  async function seedSeqTable(n: number): Promise<string> {
    const t = rawName();
    await svc.createRawTable(t, [
      { name: 'seq', dataType: 'int', isPrimary: false },
      { name: 'name', dataType: 'nvarchar', isPrimary: false },
    ]);
    const rows = Array.from({ length: n }, (_, k) => ({ seq: k + 1, name: '客戶' + (k + 1) }));
    if (rows.length) await svc.insertBatch(t, ['seq', 'name'], rows);
    return t;
  }

  function taskFor(raw: string) {
    return {
      id: 'task-page', name: 'T', source_table: 'src', source_schema: 'dbo',
      raw_table_name: raw, deleted_at: null,
    };
  }

  it('GETRAWPAGE-001 (trap): 現行 else 分支字面 LIMIT ? OFFSET ? 對 MSSQL 拋 #102', async (ctx) => {
    if (!guard(ctx)) return;
    const t = await seedSeqTable(3);
    await expect(
      ds!.query(`SELECT * FROM "${t}" LIMIT ? OFFSET ?`, [2, 0]),
    ).rejects.toThrow();
  });

  it('GETRAWPAGE-002 (DoD): sortBy 情境跨頁分頁正確、無重複無遺漏', async (ctx) => {
    if (!guard(ctx)) return;
    const t = await seedSeqTable(65);
    const s = makeSvcWithRepos(taskFor(t));
    const p1 = await s.getRawData('task-page', { page: 1, limit: 50, sortBy: 'seq', sortOrder: 'asc' } as any);
    const p2 = await s.getRawData('task-page', { page: 2, limit: 50, sortBy: 'seq', sortOrder: 'asc' } as any);
    expect(p1.meta.totalCount).toBe(65);
    expect(p1.meta.totalPages).toBe(2);
    expect(p1.data.map((r: any) => r.seq)).toEqual(Array.from({ length: 50 }, (_, k) => k + 1));
    expect(p2.data.map((r: any) => r.seq)).toEqual(Array.from({ length: 15 }, (_, k) => k + 51));
    const union = [...p1.data, ...p2.data].map((r: any) => r.seq);
    expect(new Set(union).size).toBe(65); // 無重複
  });

  it('GETRAWPAGE-003 (DoD): 無 sortBy — 有來源 PK 與 有 _cdmp_id 兩表皆不拋 #153、結果確定', async (ctx) => {
    if (!guard(ctx)) return;
    // (A) 有來源 PK（無 _cdmp_id）
    const a = rawName();
    await svc.createRawTable(a, [
      { name: 'ID', dataType: 'int', isPrimary: true },
      { name: 'nm', dataType: 'nvarchar', isPrimary: false },
    ]);
    await svc.insertBatch(a, ['ID', 'nm'], Array.from({ length: 60 }, (_, k) => ({ ID: k + 1, nm: 'x' + (k + 1) })));
    const sa = makeSvcWithRepos(taskFor(a));
    const ra1 = await sa.getRawData('task-page', { page: 1, limit: 50 } as any);
    const ra2 = await sa.getRawData('task-page', { page: 2, limit: 50 } as any);
    expect(ra1.data.length).toBe(50);
    expect(ra2.data.length).toBe(10);
    expect(new Set([...ra1.data, ...ra2.data].map((r: any) => r.ID)).size).toBe(60);

    // (B) 無來源 PK（有 _cdmp_id）
    const b = await seedSeqTable(60);
    const sb = makeSvcWithRepos(taskFor(b));
    const rb1 = await sb.getRawData('task-page', { page: 1, limit: 50 } as any);
    const rb2 = await sb.getRawData('task-page', { page: 2, limit: 50 } as any);
    expect(rb1.data.length).toBe(50);
    expect(rb2.data.length).toBe(10);
    expect(new Set([...rb1.data, ...rb2.data].map((r: any) => r._cdmp_id)).size).toBe(60);
  });

  it('GETRAWPAGE-004 (Boundary): page 超出總筆數 → data=[]、totalPages 正確', async (ctx) => {
    if (!guard(ctx)) return;
    const t = await seedSeqTable(65);
    const s = makeSvcWithRepos(taskFor(t));
    const r = await s.getRawData('task-page', { page: 99, limit: 50, sortBy: 'seq' } as any);
    expect(r.data).toEqual([]);
    expect(r.meta.totalPages).toBe(2);
  });

  it('GETRAWPAGE-005: limit 三種 DTO 允許值（50/100/200）', async (ctx) => {
    if (!guard(ctx)) return;
    const t = await seedSeqTable(60);
    const s = makeSvcWithRepos(taskFor(t));
    expect((await s.getRawData('task-page', { page: 1, limit: 50, sortBy: 'seq' } as any)).data.length).toBe(50);
    expect((await s.getRawData('task-page', { page: 1, limit: 100, sortBy: 'seq' } as any)).data.length).toBe(60);
    expect((await s.getRawData('task-page', { page: 1, limit: 200, sortBy: 'seq' } as any)).data.length).toBe(60);
  });

  it('GETRAWPAGE-006: sortOrder=desc 反向排序', async (ctx) => {
    if (!guard(ctx)) return;
    const t = await seedSeqTable(65);
    const s = makeSvcWithRepos(taskFor(t));
    const r = await s.getRawData('task-page', { page: 1, limit: 50, sortBy: 'seq', sortOrder: 'desc' } as any);
    expect(r.data[0].seq).toBe(65);
    expect(r.data[49].seq).toBe(16);
  });

  it('GETRAWPAGE-007 (Boundary): 空表 → totalPages=0、data=[]、不拋錯', async (ctx) => {
    if (!guard(ctx)) return;
    const t = await seedSeqTable(0);
    const s = makeSvcWithRepos(taskFor(t));
    const r = await s.getRawData('task-page', { page: 1, limit: 50 } as any);
    expect(r.meta.totalCount).toBe(0);
    expect(r.meta.totalPages).toBe(0);
    expect(r.data).toEqual([]);
  });
});

// ===========================================================================
// §五 INSERTBATCH
// ===========================================================================
describe('P4fu INSERTBATCH (real MSSQL)', () => {
  it('INSERTBATCH-001 (trap): 現行 else 分支字面 ? 佔位符對 MSSQL 拋 #102', async (ctx) => {
    if (!guard(ctx)) return;
    const t = rawName();
    await svc.createRawTable(t, [{ name: 'i', dataType: 'int', isPrimary: false }]);
    await expect(ds!.query(`INSERT INTO "${t}" ("i") VALUES (?)`, [1])).rejects.toThrow();
  });

  it('INSERTBATCH-002 (DoD): 逐欄值一致（字串/整數/中文/NULL/日期/decimal-as-text）', async (ctx) => {
    if (!guard(ctx)) return;
    const t = rawName();
    await svc.createRawTable(t, MIXED_COLS);
    const dt1 = new Date('2020-03-04T05:06:07.000Z');
    const n = await svc.insertBatch(t, ['s', 'i', 'big', 'flag', 'dt', 'amt'], [
      { s: '借新還舊 車貸', i: 42, big: '9007199254740993', flag: true, dt: dt1, amt: '3.14' },
      { s: null, i: null, big: null, flag: null, dt: null, amt: null },
    ]);
    expect(n).toBe(2);
    expect(await count(t)).toBe(2);
    const rows = await ds!.query(`SELECT s, i, big, flag, dt, amt FROM "${t}" ORDER BY _cdmp_id`);
    expect(rows[0].s).toBe('借新還舊 車貸');
    expect(rows[0].i).toBe(42);
    expect(rows[0].big).toBe('9007199254740993');
    expect(rows[0].flag).toBe(true);
    expect(new Date(rows[0].dt).toISOString().slice(0, 19)).toBe('2020-03-04T05:06:07');
    expect(rows[0].amt).toBe('3.14');
    expect(rows[1].s).toBeNull();
    expect(rows[1].i).toBeNull();
    expect(rows[1].amt).toBeNull();
  });

  it('INSERTBATCH-003 (DoD): 21 欄 × 101 列 → 自動切片跨越 2098 上限、總數/回傳值=101', async (ctx) => {
    if (!guard(ctx)) return;
    const cols = Array.from({ length: 21 }, (_, k) => `c${k}`);
    const t = rawName();
    await svc.createRawTable(t, cols.map((c) => ({ name: c, dataType: 'int', isPrimary: false })));
    const rows = Array.from({ length: 101 }, (_, r) =>
      Object.fromEntries(cols.map((c, ci) => [c, r * 100 + ci])),
    );
    const n = await svc.insertBatch(t, cols, rows); // 21×101=2121 > 2098 → 內部切片
    expect(n).toBe(101);
    expect(await count(t)).toBe(101);
    // 抽查首末列逐欄值
    const back = await ds!.query(`SELECT c0, c20 FROM "${t}" ORDER BY c0`);
    expect(back[0].c0).toBe(0);
    expect(back[0].c20).toBe(20);
    expect(back[100].c0).toBe(10000);
  });

  it('INSERTBATCH-004 (Boundary): 恰達門檻（20 欄×100=2000 單批）與略超（101 跨批）皆正確', async (ctx) => {
    if (!guard(ctx)) return;
    const cols = Array.from({ length: 20 }, (_, k) => `c${k}`);
    const mk = () => cols.map((c) => ({ name: c, dataType: 'int', isPrimary: false }));

    const t1 = rawName();
    await svc.createRawTable(t1, mk());
    const rows100 = Array.from({ length: 100 }, (_, r) => Object.fromEntries(cols.map((c, ci) => [c, r * 100 + ci])));
    expect(await svc.insertBatch(t1, cols, rows100)).toBe(100); // 2000 params 單批
    expect(await count(t1)).toBe(100);

    const t2 = rawName();
    await svc.createRawTable(t2, mk());
    const rows101 = Array.from({ length: 101 }, (_, r) => Object.fromEntries(cols.map((c, ci) => [c, r * 100 + ci])));
    expect(await svc.insertBatch(t2, cols, rows101)).toBe(101); // 2020 params → 2 批
    expect(await count(t2)).toBe(101);
  });

  it('INSERTBATCH-005: 空 rows 陣列 → 回傳 0、不執行 SQL、不增列', async (ctx) => {
    if (!guard(ctx)) return;
    const t = rawName();
    await svc.createRawTable(t, [{ name: 'i', dataType: 'int', isPrimary: false }]);
    expect(await svc.insertBatch(t, ['i'], [])).toBe(0);
    expect(await count(t)).toBe(0);
  });

  it('INSERTBATCH-007: 中文/單引號/雙引號等特殊字元透過具名參數化天然防注入', async (ctx) => {
    if (!guard(ctx)) return;
    const t = rawName();
    await svc.createRawTable(t, [{ name: 's', dataType: 'nvarchar', isPrimary: false }]);
    const evil = `O'Brien "x" 50%; DROP TABLE t; 你好`;
    await svc.insertBatch(t, ['s'], [{ s: evil }]);
    const rows = await ds!.query(`SELECT s FROM "${t}"`);
    expect(rows[0].s).toBe(evil);
    expect(await count(t)).toBe(1);
  });
});

// ===========================================================================
// §六 E2E-API — getRawData / insertBatch 公開入口全鏈路
// ===========================================================================
describe('P4fu E2EAPI (real MSSQL)', () => {
  it('E2EAPI-001/002 (DoD): getRawData 公開方法完整跑通、columns 與 getColumnMetadata 一致', async (ctx) => {
    if (!guard(ctx)) return;
    const t = rawName();
    await svc.createRawTable(t, MIXED_COLS);
    await svc.insertBatch(t, ['s', 'i'], [
      { s: '甲', i: 1 }, { s: '乙', i: 2 }, { s: '丙', i: 3 },
    ]);
    const task = {
      id: 'task-e2e', name: '任務', source_table: 'src', source_schema: 'dbo',
      raw_table_name: t, deleted_at: null,
    };
    const s = makeSvcWithRepos(task);
    const res = await s.getRawData('task-e2e', { page: 1, limit: 50, sortBy: 'i' } as any);
    expect(res.meta.taskName).toBe('任務');
    expect(res.meta.totalCount).toBe(3);
    expect(res.data.map((r: any) => r.s)).toEqual(['甲', '乙', '丙']);
    // columns 與 getColumnMetadata 直接呼叫一致
    const direct = await (svc as any).getColumnMetadata(t);
    expect(res.columns.map((c: any) => c.name)).toEqual(direct.map((c: any) => c.name));
  });

  it('E2EAPI-003 (DoD): insertBatch 於 incremental 模式真實 wiring（canStream=false 慢迴圈）', async (ctx) => {
    if (!guard(ctx)) return;
    const raw = rawName();
    const metadata: ColumnMetadata[] = [
      { name: 'id', dataType: 'int', isPrimary: false },
      { name: 'nm', dataType: 'nvarchar', isPrimary: false },
    ];
    let readCalled = false;
    const executor: any = {
      getSourceTableMetadata: vi.fn().mockResolvedValue(metadata),
      getSourceCount: vi.fn().mockResolvedValue(3),
      readBatch: vi.fn(async () => {
        if (readCalled) return { rows: [], hasMore: false, lastKeyValue: undefined };
        readCalled = true;
        return {
          rows: [{ id: 1, nm: '甲' }, { id: 2, nm: '乙' }, { id: 3, nm: '丙' }],
          hasMore: false, lastKeyValue: 3,
        };
      }),
    };
    const taskRepo = { save: vi.fn(async (x: any) => x) } as any;
    const logRepo = { save: vi.fn(async (x: any) => x) } as any;
    const bulkSpy = vi.spyOn(svc, 'openBulkWriter');
    const insSpy = vi.spyOn(svc, 'insertBatch');
    const exec = new ExtractionExecutionService(taskRepo, logRepo, executor, svc);
    const task: any = {
      id: 'task-inc', datasource_id: 'ds', source_table: 'src', source_schema: 'dbo',
      mode: 'incremental', raw_table_name: raw, incremental_column: 'id', last_incremental_value: null,
      status: 'running', execution_count: 0, avg_duration_ms: 0, extracted_count: 0,
      progress_percent: 0, total_count: 0, error_message: null,
    };
    await (exec as any).executeExtraction(task, { total_count: 0, extracted_count: 0 });

    expect(insSpy).toHaveBeenCalled();
    expect(bulkSpy).not.toHaveBeenCalled();
    expect(await count(raw)).toBe(3);
    expect(task.status).toBe('completed');
    const rows = await ds!.query(`SELECT nm FROM "${raw}" ORDER BY id`);
    expect(rows.map((r: any) => r.nm)).toEqual(['甲', '乙', '丙']);
    bulkSpy.mockRestore();
    insSpy.mockRestore();
  });

  it('E2EAPI-004 (DoD): full-mode 但來源不支援 streaming → 落 insertBatch fallback 迴圈', async (ctx) => {
    if (!guard(ctx)) return;
    const raw = rawName();
    const metadata: ColumnMetadata[] = [{ name: 'id', dataType: 'int', isPrimary: false }];
    let readCalled = false;
    const executor: any = {
      getSourceTableMetadata: vi.fn().mockResolvedValue(metadata),
      getSourceCount: vi.fn().mockResolvedValue(2),
      supportsStreaming: vi.fn().mockResolvedValue(false), // → canStream=false
      streamBatches: vi.fn(),
      readBatch: vi.fn(async () => {
        if (readCalled) return { rows: [], hasMore: false };
        readCalled = true;
        return { rows: [{ id: 10 }, { id: 20 }], hasMore: false };
      }),
    };
    const bulkSpy = vi.spyOn(svc, 'openBulkWriter');
    const insSpy = vi.spyOn(svc, 'insertBatch');
    const exec = new ExtractionExecutionService(
      { save: vi.fn(async (x: any) => x) } as any,
      { save: vi.fn(async (x: any) => x) } as any,
      executor, svc,
    );
    const task: any = {
      id: 'task-full', datasource_id: 'ds', source_table: 'src', source_schema: 'dbo',
      mode: 'full', raw_table_name: raw, incremental_column: null, last_incremental_value: null,
      status: 'running', execution_count: 0, avg_duration_ms: 0, extracted_count: 0,
      progress_percent: 0, total_count: 0, error_message: null,
    };
    await (exec as any).executeExtraction(task, { total_count: 0, extracted_count: 0 });

    expect(insSpy).toHaveBeenCalled();
    expect(bulkSpy).not.toHaveBeenCalled();
    expect(await count(raw)).toBe(2);
    bulkSpy.mockRestore();
    insSpy.mockRestore();
  });

  it('E2EAPI-005 (Regression): full-mode + streaming 來源 → 走 bulk 路徑（非 insertBatch）', async (ctx) => {
    if (!guard(ctx)) return;
    const raw = rawName();
    const metadata: ColumnMetadata[] = [
      { name: 'id', dataType: 'int', isPrimary: false },
      { name: 'nm', dataType: 'nvarchar', isPrimary: false },
    ];
    const executor: any = {
      getSourceTableMetadata: vi.fn().mockResolvedValue(metadata),
      getSourceCount: vi.fn().mockResolvedValue(2),
      supportsStreaming: vi.fn().mockResolvedValue(true),
      streamBatches: vi.fn(async (_params: any, cb: (rows: any[]) => Promise<void>) => {
        await cb([{ id: 1, nm: '甲' }, { id: 2, nm: '乙' }]);
      }),
      readBatch: vi.fn(),
    };
    const bulkSpy = vi.spyOn(svc, 'openBulkWriter');
    const insSpy = vi.spyOn(svc, 'insertBatch');
    const exec = new ExtractionExecutionService(
      { save: vi.fn(async (x: any) => x) } as any,
      { save: vi.fn(async (x: any) => x) } as any,
      executor, svc,
    );
    const task: any = {
      id: 'task-stream', datasource_id: 'ds', source_table: 'src', source_schema: 'dbo',
      mode: 'full', raw_table_name: raw, incremental_column: null, last_incremental_value: null,
      status: 'running', execution_count: 0, avg_duration_ms: 0, extracted_count: 0,
      progress_percent: 0, total_count: 0, error_message: null,
    };
    await (exec as any).executeExtraction(task, { total_count: 0, extracted_count: 0 });

    expect(bulkSpy).toHaveBeenCalledTimes(1);
    expect(insSpy).not.toHaveBeenCalled();
    expect(await count(raw)).toBe(2);
    bulkSpy.mockRestore();
    insSpy.mockRestore();
  });
});
