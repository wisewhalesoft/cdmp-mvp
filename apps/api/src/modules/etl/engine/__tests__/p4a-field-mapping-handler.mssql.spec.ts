/**
 * AD-E07-41 P4a — field-mapping-handler-mssql 真實 MSSQL EQ（FIELDMAP-EQ-001..004）。
 */
import { restoreDbType, SKIP_REASON } from '@/database/__tests__/mssql-env-preload';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { FieldMappingHandlerMssql } from '../handlers/field-mapping-handler-mssql';
import {
  countMssqlTempTableRows,
  getMssqlTempTableColumns,
  dropMssqlTempTableIfExists,
} from '../handlers/mssql/temp-table.util';
import { connectMssql, teardownMssql, MssqlHarness, uniqueLogId, tempName, makeRealCtx } from './_p4a-mssql-harness';
import { DataSet } from '../types';

vi.setConfig({ testTimeout: 60000 });

const handler = new FieldMappingHandlerMssql();
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
    console.warn('[P4a fieldmap] SKIP —', SKIP_REASON);
    ctx.skip();
    return false;
  }
  return true;
}

async function runFieldMap(
  mappings: any[],
  dropUnmapped: boolean,
  inputFrom: string,
): Promise<{ out: DataSet; inName: string }> {
  const qr = h.qr!;
  const logId = uniqueLogId();
  const inName = tempName('fmin', logId);
  await qr.query(`SELECT * INTO ${inName} FROM ${inputFrom}`);
  const inCount = await countMssqlTempTableRows(qr, inName);
  const ctx = makeRealCtx(
    qr,
    'field_mapping',
    { mappings, dropUnmapped },
    { default: { tempTable: inName, rowCount: inCount } },
    { nodeId: 'fm', logId },
  );
  const out = await handler.execute(ctx);
  return { out, inName };
}
async function cleanup(out: DataSet, inName: string) {
  await dropMssqlTempTableIfExists(h.qr!, out.tempTable);
  await dropMssqlTempTableIfExists(h.qr!, inName);
}

describe('P4a FIELDMAP-EQ', () => {
  it('FIELDMAP-EQ-001: 114 欄規模映射，輸出欄位集合 = mapping 目標欄位集合', async (ctx) => {
    if (!guard(ctx)) return;
    const N = 114;
    const srcCols = Array.from({ length: N }, (_, i) => `c${i}`);
    const tgtCols = Array.from({ length: N }, (_, i) => `t${i}`);
    const valuesRow = Array.from({ length: N }, (_, i) => i).join(',');
    const inputFrom = `(VALUES (${valuesRow})) AS v(${srcCols.join(',')})`;
    const mappings = srcCols.map((s, i) => ({ sourceColumn: s, targetColumn: tgtCols[i] }));
    const { out, inName } = await runFieldMap(mappings, true, inputFrom);
    const cols = await getMssqlTempTableColumns(h.qr!, out.tempTable);
    expect(cols.length).toBe(N);
    expect(new Set(cols.map((c) => c.name))).toEqual(new Set(tgtCols));
    await cleanup(out, inName);
  });

  it('FIELDMAP-EQ-002: 中文來源值改名後正確 round-trip', async (ctx) => {
    if (!guard(ctx)) return;
    const { out, inName } = await runFieldMap(
      [{ sourceColumn: 'customer_type_desc', targetColumn: 'ctype_desc' }],
      false,
      `(VALUES (1, N'借新還舊')) AS v(id, customer_type_desc)`,
    );
    const rows = await h.qr!.query(`SELECT ctype_desc FROM ${out.tempTable}`);
    expect(rows[0].ctype_desc).toBe('借新還舊');
    await cleanup(out, inName);
  });

  it('FIELDMAP-EQ-003: 來源欄位不存在但有 string default → 全數填入預設', async (ctx) => {
    if (!guard(ctx)) return;
    const { out, inName } = await runFieldMap(
      [{ sourceColumn: 'missing', targetColumn: 't', defaultValue: 'DEF' }],
      true,
      `(VALUES (1),(2),(3)) AS v(a)`,
    );
    const rows = await h.qr!.query(`SELECT t FROM ${out.tempTable}`);
    expect(rows.length).toBe(3);
    expect(rows.every((r: any) => r.t === 'DEF')).toBe(true);
    await cleanup(out, inName);
  });

  it('FIELDMAP-EQ-004: boolean defaultValue 於真實 MSSQL 執行不拋語法錯誤（CAST(1 AS BIT)）', async (ctx) => {
    if (!guard(ctx)) return;
    const { out, inName } = await runFieldMap(
      [{ sourceColumn: 'missing', targetColumn: 'flag', defaultValue: true }],
      true,
      `(VALUES (1)) AS v(a)`,
    );
    const rows = await h.qr!.query(`SELECT flag FROM ${out.tempTable}`);
    // BIT 讀回為 true/1
    expect(Boolean(rows[0].flag)).toBe(true);
    await cleanup(out, inName);
  });
});
