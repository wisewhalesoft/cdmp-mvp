/**
 * AD-E07-41 P4a — type-cast-handler-mssql 真實 MSSQL EQ（CAST-EQ-001..011）。
 * 含 🔴 空字串陷阱（CAST-EQ-002）、DATE 寬鬆前綴比對防過度修正（CAST-EQ-006/007）。
 */
import { restoreDbType, SKIP_REASON } from '@/database/__tests__/mssql-env-preload';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { TypeCastHandlerMssql } from '../handlers/type-cast-handler-mssql';
import { countMssqlTempTableRows, dropMssqlTempTableIfExists } from '../handlers/mssql/temp-table.util';
import { connectMssql, teardownMssql, MssqlHarness, uniqueLogId, tempName, makeRealCtx } from './_p4a-mssql-harness';
import { DataSet } from '../types';

vi.setConfig({ testTimeout: 60000 });

const handler = new TypeCastHandlerMssql();
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
    console.warn('[P4a cast] SKIP —', SKIP_REASON);
    ctx.skip();
    return false;
  }
  return true;
}

/** 建 input ## → 執行 cast → 回傳 output DataSet 與 input 名（呼叫端負責讀取與 cleanup）。 */
async function execCast(targetType: string, inputFrom: string, col = 'v'): Promise<{ out: DataSet; inName: string }> {
  const qr = h.qr!;
  const logId = uniqueLogId();
  const inName = tempName('cin', logId);
  await qr.query(`SELECT * INTO ${inName} FROM ${inputFrom}`);
  const inCount = await countMssqlTempTableRows(qr, inName);
  const ctx = makeRealCtx(
    qr,
    'type_cast',
    { castRules: [{ column: col, sourceType: 'VARCHAR', targetType }] },
    { default: { tempTable: inName, rowCount: inCount } },
    { nodeId: 'cv', logId },
  );
  const out = await handler.execute(ctx);
  return { out, inName };
}
async function cleanup(out: DataSet, inName: string) {
  await dropMssqlTempTableIfExists(h.qr!, out.tempTable);
  await dropMssqlTempTableIfExists(h.qr!, inName);
}

describe('P4a CAST-EQ', () => {
  it('CAST-EQ-001: INTEGER 有效值 123 / -456 正確轉型', async (ctx) => {
    if (!guard(ctx)) return;
    const { out, inName } = await execCast('INTEGER', `(VALUES (N'123'),(N'-456')) AS v(v)`);
    const rows = await h.qr!.query(`SELECT v FROM ${out.tempTable} ORDER BY v`);
    expect(rows.map((r: any) => Number(r.v))).toEqual([-456, 123]);
    await cleanup(out, inName);
  });

  it('CAST-EQ-002 (🔴 旗艦): INTEGER 空字串 → NULL（LEN>0 守門，非誤判為合法整數）', async (ctx) => {
    if (!guard(ctx)) return;
    const { out, inName } = await execCast('INTEGER', `(VALUES (N'')) AS v(v)`);
    const rows = await h.qr!.query(`SELECT v FROM ${out.tempTable}`);
    expect(rows[0].v).toBeNull();
    await cleanup(out, inName);
  });

  it('CAST-EQ-003: DECIMAL 空字串 → NULL', async (ctx) => {
    if (!guard(ctx)) return;
    const { out, inName } = await execCast('DECIMAL', `(VALUES (N'')) AS v(v)`);
    const rows = await h.qr!.query(`SELECT v FROM ${out.tempTable}`);
    expect(rows[0].v).toBeNull();
    await cleanup(out, inName);
  });

  it('CAST-EQ-004: DATE 過短字串 2024（len 4 < 10）→ NULL', async (ctx) => {
    if (!guard(ctx)) return;
    const { out, inName } = await execCast('DATE', `(VALUES (N'2024')) AS v(v)`);
    const rows = await h.qr!.query(`SELECT v FROM ${out.tempTable}`);
    expect(rows[0].v).toBeNull();
    await cleanup(out, inName);
  });

  it('CAST-EQ-005: INTEGER/DECIMAL 單一負號 - → NULL（+ 量詞要求至少一位數字）', async (ctx) => {
    if (!guard(ctx)) return;
    const i = await execCast('INTEGER', `(VALUES (N'-')) AS v(v)`);
    const ir = await h.qr!.query(`SELECT v FROM ${i.out.tempTable}`);
    expect(ir[0].v).toBeNull();
    await cleanup(i.out, i.inName);

    const d = await execCast('DECIMAL', `(VALUES (N'-')) AS v(v)`);
    const dr = await h.qr!.query(`SELECT v FROM ${d.out.tempTable}`);
    expect(dr[0].v).toBeNull();
    await cleanup(d.out, d.inName);
  });

  it('CAST-EQ-006 (🔴 防過度修正): DATE 格式合法但曆法無效 9999-99-99 → 格式通過、TRY_CAST 回 NULL、不拋錯', async (ctx) => {
    if (!guard(ctx)) return;
    const { out, inName } = await execCast('DATE', `(VALUES (N'9999-99-99')) AS v(v)`);
    // 未拋錯（兩階段：格式驗證通過、TRY_CAST 曆法無效 → NULL）
    const rows = await h.qr!.query(`SELECT v FROM ${out.tempTable}`);
    expect(rows[0].v).toBeNull();
    await cleanup(out, inName);
  });

  it('CAST-EQ-007 (🔴 防過度修正): DATE 合法前綴 + 尾碼 2024-01-01garbage → 格式通過、不拋錯', async (ctx) => {
    if (!guard(ctx)) return;
    const { out, inName } = await execCast('DATE', `(VALUES (N'2024-01-01garbage')) AS v(v)`);
    const rows = await h.qr!.query(`SELECT v FROM ${out.tempTable}`);
    // TRY_CAST 對尾碼髒值回 NULL（寬鬆、不拋錯即為「格式驗證未過度收緊」之觀察）
    expect(rows[0].v).toBeNull();
    await cleanup(out, inName);
  });

  it('CAST-EQ-008: DATE 有效值 2024-06-15 正確轉型為 DATE', async (ctx) => {
    if (!guard(ctx)) return;
    const { out, inName } = await execCast('DATE', `(VALUES (N'2024-06-15')) AS v(v)`);
    // 以 SQL 端 CONVERT 讀回，避開 JS Date 時區歧義
    const rows = await h.qr!.query(`SELECT CONVERT(varchar(10), v, 23) AS vs FROM ${out.tempTable}`);
    expect(rows[0].vs).toBe('2024-06-15');
    await cleanup(out, inName);
  });

  it('CAST-EQ-009: INT/INTEGER 同義詞 — TRY_CAST 成功不拋語法錯誤', async (ctx) => {
    if (!guard(ctx)) return;
    const { out, inName } = await execCast('INTEGER', `(VALUES (N'123')) AS v(v)`);
    const rows = await h.qr!.query(`SELECT v FROM ${out.tempTable}`);
    expect(Number(rows[0].v)).toBe(123);
    await cleanup(out, inName);
  });

  it('CAST-EQ-010: VARCHAR→DECIMAL 代表性 fixture 逐列與手算相符（保留小數）', async (ctx) => {
    if (!guard(ctx)) return;
    const { out, inName } = await execCast('DECIMAL', `(VALUES (N'0.055'),(N'1.5'),(N'123'),(N'abc')) AS v(v)`);
    const rows = await h.qr!.query(`SELECT v FROM ${out.tempTable}`);
    const vals = rows.map((r: any) => (r.v == null ? null : Number(r.v)));
    // 順序不保證 → 以集合比對（含非法 'abc' → NULL）
    expect(vals.filter((x: any) => x !== null).sort((a: number, b: number) => a - b)).toEqual([0.055, 1.5, 123]);
    expect(vals.filter((x: any) => x === null).length).toBe(1);
    await cleanup(out, inName);
  });

  it('CAST-EQ-011: NULL 輸入 → NULL（短路，不進正則驗證）', async (ctx) => {
    if (!guard(ctx)) return;
    const { out, inName } = await execCast('INTEGER', `(VALUES (CAST(NULL AS NVARCHAR(20)))) AS v(v)`);
    const rows = await h.qr!.query(`SELECT v FROM ${out.tempTable}`);
    expect(rows[0].v).toBeNull();
    await cleanup(out, inName);
  });
});
