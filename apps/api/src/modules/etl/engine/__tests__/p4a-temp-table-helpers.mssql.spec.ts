/**
 * AD-E07-41 P4a — 共用 temp helper 真實 MSSQL 整合（HELPER-MSSQL-001..006 + CLEANUP-006）。
 * Gating：連不上 MSSQL → 每個 test ctx.skip()。
 */
import { restoreDbType, SKIP_REASON } from '@/database/__tests__/mssql-env-preload';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
  createMssqlTempTable,
  getMssqlTempTableColumns,
  countMssqlTempTableRows,
  dropMssqlTempTableIfExists,
} from '../handlers/mssql/temp-table.util';
import { connectMssql, teardownMssql, MssqlHarness, uniqueLogId, tempName, objectExists } from './_p4a-mssql-harness';

vi.setConfig({ testTimeout: 60000 });

let h: MssqlHarness;
beforeAll(async () => {
  h = await connectMssql();
}, 60000);
afterAll(async () => {
  await teardownMssql(h);
  restoreDbType();
});
function guard(ctx: { skip: () => void }): boolean {
  if (!h?.reachable || !h.qr) {
    console.warn('[P4a helpers] SKIP —', SKIP_REASON);
    ctx.skip();
    return false;
  }
  return true;
}

describe('P4a HELPER-MSSQL', () => {
  it('HELPER-MSSQL-001: createMssqlTempTable 建表成功、中文 round-trip', async (ctx) => {
    if (!guard(ctx)) return;
    const qr = h.qr!;
    const name = tempName('h1', uniqueLogId());
    try {
      await createMssqlTempTable(qr, name, `SELECT * FROM (VALUES (1,N'借新還舊'),(2,N'中古車商')) AS v(id, memo)`);
      const rows = await qr.query(`SELECT id, memo FROM ${name} ORDER BY id`);
      expect(rows.length).toBe(2);
      expect(rows.map((r: any) => r.memo)).toEqual(['借新還舊', '中古車商']);
    } finally {
      await dropMssqlTempTableIfExists(qr, name);
    }
  });

  it('HELPER-MSSQL-002: getMssqlTempTableColumns 回傳正確欄位序', async (ctx) => {
    if (!guard(ctx)) return;
    const qr = h.qr!;
    const name = tempName('h2', uniqueLogId());
    try {
      await createMssqlTempTable(qr, name, `SELECT * FROM (VALUES (1,N'a')) AS v(id, memo)`);
      const cols = await getMssqlTempTableColumns(qr, name);
      expect(cols).toEqual([
        { name: 'id', columnId: 1 },
        { name: 'memo', columnId: 2 },
      ]);
    } finally {
      await dropMssqlTempTableIfExists(qr, name);
    }
  });

  it('HELPER-MSSQL-003: countMssqlTempTableRows 回傳正確列數（number）', async (ctx) => {
    if (!guard(ctx)) return;
    const qr = h.qr!;
    const name = tempName('h3', uniqueLogId());
    try {
      await createMssqlTempTable(qr, name, `SELECT * FROM (VALUES (1,N'a'),(2,N'b')) AS v(id, memo)`);
      const n = await countMssqlTempTableRows(qr, name);
      expect(n).toBe(2);
      expect(typeof n).toBe('number');
    } finally {
      await dropMssqlTempTableIfExists(qr, name);
    }
  });

  it('HELPER-MSSQL-004: 巢狀 FROM selectSql 於真實 MSSQL 執行正確', async (ctx) => {
    if (!guard(ctx)) return;
    const qr = h.qr!;
    const src = tempName('h4src', uniqueLogId());
    const name = tempName('h4', uniqueLogId());
    try {
      await qr.query(`SELECT * INTO ${src} FROM (VALUES (1),(2),(3)) AS v(id)`);
      await createMssqlTempTable(qr, name, `SELECT t.id FROM (SELECT id FROM ${src} WHERE id >= 2) t`);
      const n = await countMssqlTempTableRows(qr, name);
      expect(n).toBe(2);
    } finally {
      await dropMssqlTempTableIfExists(qr, name);
      await dropMssqlTempTableIfExists(qr, src);
    }
  });

  it('HELPER-MSSQL-005: 空結果集（0 列）建表不報錯', async (ctx) => {
    if (!guard(ctx)) return;
    const qr = h.qr!;
    const name = tempName('h5', uniqueLogId());
    try {
      await createMssqlTempTable(qr, name, `SELECT * FROM (VALUES (1)) AS v(id) WHERE 1 = 0`);
      expect(await objectExists(qr, name)).toBe(true);
      expect(await countMssqlTempTableRows(qr, name)).toBe(0);
      const cols = await getMssqlTempTableColumns(qr, name);
      expect(cols.map((c) => c.name)).toEqual(['id']);
    } finally {
      await dropMssqlTempTableIfExists(qr, name);
    }
  });

  it('HELPER-MSSQL-006: create→getColumns→count→drop 全流程；drop 後 OBJECT_ID NULL', async (ctx) => {
    if (!guard(ctx)) return;
    const qr = h.qr!;
    const name = tempName('h6', uniqueLogId());
    await createMssqlTempTable(qr, name, `SELECT * FROM (VALUES (1,N'x'),(2,N'y')) AS v(id, memo)`);
    expect((await getMssqlTempTableColumns(qr, name)).map((c) => c.name)).toEqual(['id', 'memo']);
    expect(await countMssqlTempTableRows(qr, name)).toBe(2);
    await dropMssqlTempTableIfExists(qr, name);
    expect(await objectExists(qr, name)).toBe(false);
  });

  it('CLEANUP-006: 已清理之 ## 上 getMssqlTempTableColumns 回空陣列（非拋錯）', async (ctx) => {
    if (!guard(ctx)) return;
    const qr = h.qr!;
    const name = tempName('c6', uniqueLogId());
    await createMssqlTempTable(qr, name, `SELECT * FROM (VALUES (1)) AS v(id)`);
    await dropMssqlTempTableIfExists(qr, name);
    expect(await objectExists(qr, name)).toBe(false);
    const cols = await getMssqlTempTableColumns(qr, name);
    expect(cols).toEqual([]);
  });
});
