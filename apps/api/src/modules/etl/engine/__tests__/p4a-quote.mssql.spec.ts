/**
 * AD-E07-41 P4a — QUOTE 決策關卡（本文件查證發現 1）：雙引號識別碼跨 driver 相容性（真實 MSSQL）。
 *
 * QUOTE-001：SELECT ... INTO ## FROM (VALUES ...) AS v("MixedCase_Col") 雙引號識別碼建表可行。
 * QUOTE-002：雙引號識別碼於 WHERE 比較可行（比照 extract-handler buildSourceFilterClause）。
 * 結論（QUOTE-003）記錄於 AD-E07-41-P4a-impl.md（PASS 分支：5 handler 逐字複用 PG 雙引號組裝）。
 */
import { restoreDbType, SKIP_REASON } from '@/database/__tests__/mssql-env-preload';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { getMssqlTempTableColumns, dropMssqlTempTableIfExists } from '../handlers/mssql/temp-table.util';
import { connectMssql, teardownMssql, MssqlHarness, uniqueLogId, tempName } from './_p4a-mssql-harness';

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
    console.warn('[P4a quote] SKIP —', SKIP_REASON);
    ctx.skip();
    return false;
  }
  return true;
}

describe('P4a QUOTE 決策關卡（雙引號識別碼）', () => {
  it('QUOTE-001: 雙引號識別碼 SELECT INTO ## 可行、大小寫原樣保留', async (ctx) => {
    if (!guard(ctx)) return;
    const qr = h.qr!;
    const name = tempName('quote', uniqueLogId());
    try {
      await qr.query(`SELECT "id", "MixedCase_Col" INTO ${name} FROM (VALUES (1,N'a')) AS v("id","MixedCase_Col")`);
      const oid = await qr.query(`SELECT OBJECT_ID('tempdb..' + @0) AS oid`, [name]);
      expect(oid[0].oid).not.toBeNull();
      const cols = await getMssqlTempTableColumns(qr, name);
      // 大小寫原樣保留（非摺疊為全小寫）
      expect(cols.map((c) => c.name)).toEqual(['id', 'MixedCase_Col']);
    } finally {
      await dropMssqlTempTableIfExists(qr, name);
    }
  });

  it('QUOTE-002: 雙引號識別碼於 WHERE 比較可行', async (ctx) => {
    if (!guard(ctx)) return;
    const qr = h.qr!;
    const name = tempName('quotew', uniqueLogId());
    try {
      await qr.query(`SELECT "id", "MixedCase_Col" INTO ${name} FROM (VALUES (1,N'a'),(2,N'b')) AS v("id","MixedCase_Col")`);
      const rows = await qr.query(`SELECT * FROM ${name} WHERE "MixedCase_Col" = N'a'`);
      expect(rows.length).toBe(1);
    } finally {
      await dropMssqlTempTableIfExists(qr, name);
    }
  });
});
