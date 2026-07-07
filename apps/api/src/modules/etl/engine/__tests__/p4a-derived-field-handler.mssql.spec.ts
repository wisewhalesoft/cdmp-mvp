/**
 * AD-E07-41 P4a — derived-field-handler-mssql 真實 MSSQL EQ（DERIVED-EQ-001..010，最高優先）。
 * 手算 oracle 直接寫在案例（AD §0.4 分層 2）。Gating：連不上 → skip。
 */
import { restoreDbType, SKIP_REASON } from '@/database/__tests__/mssql-env-preload';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { DerivedFieldHandlerMssql } from '../handlers/derived-field-handler-mssql';
import { countMssqlTempTableRows, dropMssqlTempTableIfExists } from '../handlers/mssql/temp-table.util';
import { connectMssql, teardownMssql, MssqlHarness, uniqueLogId, tempName, makeRealCtx } from './_p4a-mssql-harness';

vi.setConfig({ testTimeout: 60000 });

const handler = new DerivedFieldHandlerMssql();
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
    console.warn('[P4a derived] SKIP —', SKIP_REASON);
    ctx.skip();
    return false;
  }
  return true;
}

/** 建 input ## → 執行 derived → 讀回 output 全列 → 清理兩表。 */
async function runDerived(
  expression: string,
  outputColumn: string,
  inputFrom: string,
): Promise<any[]> {
  const qr = h.qr!;
  const logId = uniqueLogId();
  const inName = tempName('din', logId);
  await qr.query(`SELECT * INTO ${inName} FROM ${inputFrom}`);
  const inCount = await countMssqlTempTableRows(qr, inName);
  const ctx = makeRealCtx(
    qr,
    'derived_field',
    { expressions: [{ outputColumn, expression, outputType: 'TEXT' }] },
    { default: { tempTable: inName, rowCount: inCount } },
    { nodeId: 'dv', logId },
  );
  const out = await handler.execute(ctx);
  const rows = await qr.query(`SELECT * FROM ${out.tempTable}`);
  await dropMssqlTempTableIfExists(qr, out.tempTable);
  await dropMssqlTempTableIfExists(qr, inName);
  return rows;
}

describe('P4a DERIVED-EQ', () => {
  it('DERIVED-EQ-001 (🔴 旗艦): padStart 輸入長度 > n → 保留前 n 碼（PG LPAD 截斷語意）', async (ctx) => {
    if (!guard(ctx)) return;
    const rows = await runDerived("padStart(CUSTOM_MK, 2, '0')", 'padded', `(VALUES (N'ABC')) AS v(CUSTOM_MK)`);
    expect(rows[0].padded).toBe('AB'); // 非 'BC'
  });

  it('DERIVED-EQ-002: padStart 短於 n → 補零', async (ctx) => {
    if (!guard(ctx)) return;
    const rows = await runDerived("padStart(CUSTOM_MK, 2, '0')", 'padded', `(VALUES (N'5')) AS v(CUSTOM_MK)`);
    expect(rows[0].padded).toBe('05');
  });

  it('DERIVED-EQ-003: padStart 恰等於 n（邊界）', async (ctx) => {
    if (!guard(ctx)) return;
    const rows = await runDerived("padStart(CUSTOM_MK, 2, '0')", 'padded', `(VALUES (N'12')) AS v(CUSTOM_MK)`);
    expect(rows[0].padded).toBe('12');
  });

  it('DERIVED-EQ-004: mergePhone 2 參數 → area-tel', async (ctx) => {
    if (!guard(ctx)) return;
    const rows = await runDerived('mergePhone(area, tel)', 'phone', `(VALUES (N'02',N'12345678')) AS v(area, tel)`);
    expect(rows[0].phone).toBe('02-12345678');
  });

  it('DERIVED-EQ-005: mergePhone 3 參數 → area-tel#exten', async (ctx) => {
    if (!guard(ctx)) return;
    const rows = await runDerived('mergePhone(area, tel, exten)', 'phone', `(VALUES (N'02',N'12345678',N'99')) AS v(area, tel, exten)`);
    expect(rows[0].phone).toBe('02-12345678#99');
  });

  it('DERIVED-EQ-006: mergePhone area/tel 任一 NULL → NULL', async (ctx) => {
    if (!guard(ctx)) return;
    const rows = await runDerived(
      'mergePhone(area, tel)',
      'phone',
      `(VALUES (CAST(NULL AS NVARCHAR(20)), N'12345678')) AS v(area, tel)`,
    );
    expect(rows[0].phone).toBeNull();
  });

  it('DERIVED-EQ-007: mergePhone area/tel 任一空字串 → NULL', async (ctx) => {
    if (!guard(ctx)) return;
    const rows = await runDerived('mergePhone(area, tel)', 'phone', `(VALUES (N'', N'12345678')) AS v(area, tel)`);
    expect(rows[0].phone).toBeNull();
  });

  it('DERIVED-EQ-008 (🔴 正則轉換核心): 全零 → NULL；含 0 非全零 → 不誤判', async (ctx) => {
    if (!guard(ctx)) return;
    const rows = await runDerived(
      'mergePhone(area, tel)',
      'phone',
      `(VALUES (N'000', N'123'), (N'102', N'123')) AS v(area, tel)`,
    );
    const byArea = new Map(rows.map((r: any) => [r.area, r.phone]));
    expect(byArea.get('000')).toBeNull(); // 全零 → NULL
    expect(byArea.get('102')).toBe('102-123'); // 含 0 但非全零 → 保留
  });

  it('DERIVED-EQ-009: gen_random_uuid() → NEWID()，合法 GUID、跨列不重複', async (ctx) => {
    if (!guard(ctx)) return;
    const rows = await runDerived(
      'gen_random_uuid()',
      'uid',
      `(VALUES (1),(2),(3),(4),(5),(6),(7),(8),(9),(10)) AS v(id)`,
    );
    const guidRe = /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/;
    const uids = rows.map((r: any) => String(r.uid));
    expect(uids.length).toBe(10);
    for (const u of uids) expect(u).toMatch(guidRe);
    expect(new Set(uids).size).toBe(10);
  });

  it('DERIVED-EQ-010: CASE WHEN passthrough customer_type_code 三段映射', async (ctx) => {
    if (!guard(ctx)) return;
    const expr =
      `CASE WHEN customer_type_code = '1' THEN '01' ` +
      `WHEN customer_type_code = '2' THEN '02' ` +
      `WHEN customer_type_code = '3' THEN '04' ` +
      `ELSE customer_type_code END`;
    const rows = await runDerived(
      expr,
      'mapped',
      `(VALUES (N'1'),(N'2'),(N'3'),(N'9')) AS v(customer_type_code)`,
    );
    const m = new Map(rows.map((r: any) => [r.customer_type_code, r.mapped]));
    expect(m.get('1')).toBe('01');
    expect(m.get('2')).toBe('02');
    expect(m.get('3')).toBe('04');
    expect(m.get('9')).toBe('9');
  });
});
