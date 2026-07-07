/**
 * AD-E07-41 P4a — conditional-handler-mssql 真實 MSSQL EQ（COND-EQ-001..003）。
 */
import { restoreDbType, SKIP_REASON } from '@/database/__tests__/mssql-env-preload';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { ConditionalHandlerMssql } from '../handlers/conditional-handler-mssql';
import { countMssqlTempTableRows, dropMssqlTempTableIfExists } from '../handlers/mssql/temp-table.util';
import { connectMssql, teardownMssql, MssqlHarness, uniqueLogId, tempName, makeRealCtx } from './_p4a-mssql-harness';
import { DataSet } from '../types';

vi.setConfig({ testTimeout: 60000 });

const handler = new ConditionalHandlerMssql();
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
    console.warn('[P4a conditional] SKIP —', SKIP_REASON);
    ctx.skip();
    return false;
  }
  return true;
}

async function runCond(rules: any[], inputFrom: string): Promise<{ out: DataSet; inName: string }> {
  const qr = h.qr!;
  const logId = uniqueLogId();
  const inName = tempName('cdin', logId);
  await qr.query(`SELECT * INTO ${inName} FROM ${inputFrom}`);
  const inCount = await countMssqlTempTableRows(qr, inName);
  const ctx = makeRealCtx(
    qr,
    'conditional',
    { rules },
    { default: { tempTable: inName, rowCount: inCount } },
    { nodeId: 'cd', logId },
  );
  const out = await handler.execute(ctx);
  return { out, inName };
}
async function cleanup(out: DataSet, inName: string) {
  await dropMssqlTempTableIfExists(h.qr!, out.tempTable);
  await dropMssqlTempTableIfExists(h.qr!, inName);
}

describe('P4a COND-EQ', () => {
  it('COND-EQ-001: resign_date 哨兵值 9999-12-31 → NULL，ELSE → 原值', async (ctx) => {
    if (!guard(ctx)) return;
    const { out, inName } = await runCond(
      [
        {
          targetColumn: 'resign_date',
          conditions: [{ when: `resign_date = '9999-12-31'`, then: 'NULL' }],
          elseValue: 'resign_date',
        },
      ],
      `(VALUES (1, N'9999-12-31'), (2, N'2020-05-01')) AS v(id, resign_date)`,
    );
    const rows = await h.qr!.query(`SELECT id, resign_date FROM ${out.tempTable} ORDER BY id`);
    expect(rows[0].resign_date).toBeNull();
    expect(rows[1].resign_date).toBe('2020-05-01');
    await cleanup(out, inName);
  });

  it('COND-EQ-002: merge 後衝突解決 left/right（left 新 / right 新 / 相等）', async (ctx) => {
    if (!guard(ctx)) return;
    const rules = [
      {
        targetColumn: 'v',
        conditions: [{ when: 'left.source_updated_at >= right.source_updated_at', then: 'left.v' }],
        elseValue: 'right.v',
      },
    ];
    const inputFrom =
      `(VALUES ` +
      `(1, N'2024-02-01 00:00:00', N'2024-01-01 00:00:00', N'L1', N'R1'), ` + // left 新 → L1
      `(2, N'2024-01-01 00:00:00', N'2024-02-01 00:00:00', N'L2', N'R2'), ` + // right 新 → R2
      `(3, N'2024-03-01 00:00:00', N'2024-03-01 00:00:00', N'L3', N'R3') ` + // 相等 (>=) → L3
      `) AS v(id, source_updated_at, source_updated_at_right, v, v_right)`;
    const { out, inName } = await runCond(rules, inputFrom);
    const rows = await h.qr!.query(`SELECT id, v FROM ${out.tempTable} ORDER BY id`);
    expect(rows.map((r: any) => r.v)).toEqual(['L1', 'R2', 'L3']);
    await cleanup(out, inName);
  });

  it('COND-EQ-003: 中文欄位值於 conditional 分流後 round-trip', async (ctx) => {
    if (!guard(ctx)) return;
    const { out, inName } = await runCond(
      [{ targetColumn: 'label', conditions: [{ when: `code = '1'`, then: 'name' }], elseValue: 'name' }],
      `(VALUES (N'1', N'借新還舊')) AS v(code, name)`,
    );
    const rows = await h.qr!.query(`SELECT label FROM ${out.tempTable}`);
    expect(rows[0].label).toBe('借新還舊');
    await cleanup(out, inName);
  });
});
