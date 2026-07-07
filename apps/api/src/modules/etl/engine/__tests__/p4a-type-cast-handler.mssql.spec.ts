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

  it('CAST-EQ-010: VARCHAR→DECIMAL 代表性 fixture 逐列去尾零字串正確（AD §5.6 I-MSSQL-DECIMAL-NORMALIZE-01）', async (ctx) => {
    if (!guard(ctx)) return;
    const { out, inName } = await execCast('DECIMAL', `(VALUES (N'0.055'),(N'1.5'),(N'123'),(N'abc')) AS v(v)`);
    const rows = await h.qr!.query(`SELECT v FROM ${out.tempTable}`);
    const vals = rows.map((r: any) => r.v);
    // 去尾零字串（非 DECIMAL(38,10) 之固定 10 位小數 '123.0000000000'）；含非法 'abc' → NULL。順序不保證 → 集合比對
    const nonNull = vals.filter((x: any) => x != null).sort();
    expect(nonNull).toEqual(['0.055', '1.5', '123'].sort());
    expect(vals.filter((x: any) => x == null).length).toBe(1);
    // 數值語意亦相符（去尾零不改變數值）
    expect(nonNull.map(Number).sort((a: number, b: number) => a - b)).toEqual([0.055, 1.5, 123]);
    await cleanup(out, inName);
  });

  it('CAST-EQ-012 (🔴 §5.6 去尾零正規化): DECIMAL 邊界逐值 — 尾零/前導零/單值/非法（FINDING-P4D-01 修法佐證）', async (ctx) => {
    if (!guard(ctx)) return;
    // 每筆為 [輸入, 去尾零預期輸出]；證明 DECIMAL(38,10) 固定尾零已正規化為短字串（不再溢位下游短 varchar）
    const cases: [string, string | null][] = [
      ['3', '3'], // FINDING-P4D-01 核心：'3'→'3'（非 '3.0000000000'）
      ['1.5', '1.5'], // 有效小數保留
      ['3.10', '3.1'], // 尾零剝除
      ['0.055', '0.055'], // 小數不誤剝有效位
      ['007', '7'], // 前導零 → DECIMAL 正規化
      ['30', '30'], // 整數尾零保留（. 之前不剝）
      ['0', '0'], // 單一零保留
      ['abc', null], // 非法 → 外層 validation 擋 → NULL
    ];
    for (const [input, expected] of cases) {
      const { out, inName } = await execCast('DECIMAL', `(VALUES (N'${input}')) AS v(v)`);
      const rows = await h.qr!.query(`SELECT v FROM ${out.tempTable}`);
      expect(rows[0].v, `DECIMAL 正規化: '${input}' → ${expected === null ? 'NULL' : `'${expected}'`}`).toBe(expected);
      await cleanup(out, inName);
    }
  });

  it('CAST-EQ-011: NULL 輸入 → NULL（短路，不進正則驗證）', async (ctx) => {
    if (!guard(ctx)) return;
    const { out, inName } = await execCast('INTEGER', `(VALUES (CAST(NULL AS NVARCHAR(20)))) AS v(v)`);
    const rows = await h.qr!.query(`SELECT v FROM ${out.tempTable}`);
    expect(rows[0].v).toBeNull();
    await cleanup(out, inName);
  });
});
