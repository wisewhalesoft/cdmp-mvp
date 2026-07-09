/**
 * AD-E07-41 P4-followup — REG-003/004 postgres/sqlite 基準覆蓋（新建，非既有回歸確認）。
 *
 * 查證發現 1：createRawTable / getColumnMetadata / getIndexedColumns / getRawData /
 * insertBatch 於 postgres/sqlite 此前零測試覆蓋。本檔為這 4(+建表) 方法首次建立
 * 最小行為基準，確認本輪 mssql 分支新增未動到既有 postgres/sqlite 邏輯。
 *
 * sqlite：real better-sqlite3 :memory:（恆常執行）。
 * postgres：real dev PostgreSQL（5432/cdmp_dev），不可達時 self-skip（never fake green）。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { DataSource } from 'typeorm';
import { RawDataService } from '../raw-data.service';
import type { ColumnMetadata } from '../extraction-executor.provider';

const COLS: ColumnMetadata[] = [
  { name: 'seq', dataType: 'int', isPrimary: false },
  { name: 'nm', dataType: 'nvarchar', isPrimary: false },
];

/** Shared behaviour baseline exercised against a real driver DataSource. */
async function runBaseline(ds: DataSource): Promise<void> {
  const svc = new RawDataService(ds, null as any, null as any);
  const t = 'raw_' + Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
  try {
    await ds.query(`DROP TABLE IF EXISTS "${t}"`);

    // --- createRawTable (no source PK → _cdmp_id surrogate) ---
    await svc.createRawTable(t, COLS);
    expect(await svc.tableExists(t)).toBe(true);
    const cols = await svc.getTableColumns(t);
    expect(cols).toEqual(['_cdmp_id', 'seq', 'nm', '_cdmp_extracted_at']);

    // --- getColumnMetadata (private) ---
    const meta = await (svc as any).getColumnMetadata(t);
    expect(meta.map((c: any) => c.name)).toEqual(['_cdmp_id', 'seq', 'nm', '_cdmp_extracted_at']);
    const isSys = Object.fromEntries(meta.map((c: any) => [c.name, c.isSystem]));
    expect(isSys._cdmp_id).toBe(true);
    expect(isSys._cdmp_extracted_at).toBe(true);
    expect(isSys.seq).toBe(false);
    expect(isSys.nm).toBe(false);
    for (const c of meta) expect(typeof c.dataType).toBe('string');

    // --- insertBatch ---
    const rows = Array.from({ length: 60 }, (_, k) => ({ seq: k + 1, nm: '客戶' + (k + 1) }));
    expect(await svc.insertBatch(t, ['seq', 'nm'], rows)).toBe(60);
    const cntRow = await ds.query(`SELECT COUNT(*) AS c FROM "${t}"`);
    expect(Number(cntRow[0].c)).toBe(60);
    // 特殊字元 / 中文 via 具名參數化
    await svc.insertBatch(t, ['seq', 'nm'], [{ seq: 61, nm: `O'Brien 你好` }]);
    const one = await ds.query(`SELECT nm FROM "${t}" WHERE seq = 61`);
    expect(one[0].nm).toBe(`O'Brien 你好`);

    // --- getIndexedColumns (private) ---
    await ds.query(`CREATE INDEX ix_p4fu_base_seq ON "${t}" (seq)`);
    const idx: Set<string> = await (svc as any).getIndexedColumns(t);
    expect(idx.has('seq')).toBe(true);
    expect(idx.has('nm')).toBe(false);

    // --- getRawData (public, mock repos) ---
    const task = {
      id: 'task-base', name: 'B', source_table: 'src', source_schema: null,
      raw_table_name: t, deleted_at: null,
    };
    const repoSvc = new RawDataService(
      ds,
      { findOne: vi.fn().mockResolvedValue(task) } as any,
      { findOne: vi.fn().mockResolvedValue(null) } as any,
    );
    const p1 = await repoSvc.getRawData('task-base', { page: 1, limit: 50, sortBy: 'seq', sortOrder: 'asc' } as any);
    expect(p1.meta.totalCount).toBe(61);
    expect(p1.meta.totalPages).toBe(2);
    expect(p1.data.length).toBe(50);
    expect(p1.data[0].seq).toBe(1);
    const p2 = await repoSvc.getRawData('task-base', { page: 2, limit: 50, sortBy: 'seq', sortOrder: 'asc' } as any);
    expect(p2.data.length).toBe(11);
    expect(p2.data[10].seq).toBe(61);
  } finally {
    try { await ds.query(`DROP TABLE IF EXISTS "${t}"`); } catch { /* ignore */ }
  }
}

// ---------------------------------------------------------------------------
// REG-004: sqlite (better-sqlite3 :memory:) — 恆常執行
// ---------------------------------------------------------------------------
describe('P4fu REG-004 baseline — sqlite (real better-sqlite3)', () => {
  let ds: DataSource;
  beforeAll(async () => {
    ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', entities: [], synchronize: false });
    await ds.initialize();
  });
  afterAll(async () => { if (ds?.isInitialized) await ds.destroy(); });

  it('createRawTable / getColumnMetadata / getIndexedColumns / getRawData / insertBatch 基準', async () => {
    await runBaseline(ds);
  });
});

// ---------------------------------------------------------------------------
// REG-003: postgres (dev cdmp_dev) — 不可達 self-skip
// ---------------------------------------------------------------------------
describe('P4fu REG-003 baseline — postgres (real dev, self-skip)', () => {
  let ds: DataSource | null = null;
  beforeAll(async () => {
    const candidate = new DataSource({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USERNAME || 'cdmp',
      password: process.env.DB_PASSWORD || 'cdmp_secret',
      database: process.env.DB_NAME || 'cdmp_dev',
      entities: [],
      synchronize: false,
    });
    try {
      await candidate.initialize();
      ds = candidate;
    } catch {
      ds = null;
    }
  }, 15_000);
  afterAll(async () => { if (ds?.isInitialized) await ds.destroy(); });

  it('createRawTable / getColumnMetadata / getIndexedColumns / getRawData / insertBatch 基準', async (ctx) => {
    if (!ds) {
      console.warn('[P4fu REG-003] SKIP — dev PostgreSQL unreachable');
      ctx.skip();
      return;
    }
    await runBaseline(ds);
  });
});
