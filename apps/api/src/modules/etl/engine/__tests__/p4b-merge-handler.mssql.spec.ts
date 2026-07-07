/**
 * AD-E07-41 P4b — merge-handler-mssql 真實 MSSQL EQ（MERGE-EQ-001..008）。
 *
 * 全數 `##` fixture（`SELECT ... INTO ##L/##R FROM (VALUES ...)`），不落 dbo。手算 oracle 逐列比對。
 */
import { restoreDbType, SKIP_REASON } from '@/database/__tests__/mssql-env-preload';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { MergeHandlerMssql } from '../handlers/merge-handler-mssql';
import { getMssqlTempTableColumns, dropMssqlTempTableIfExists } from '../handlers/mssql/temp-table.util';
import { connectMssql, teardownMssql, MssqlHarness, uniqueLogId, makeRealCtx, readAll } from './_p4a-mssql-harness';
import { DataSet } from '../types';

vi.setConfig({ testTimeout: 60000 });

const handler = new MergeHandlerMssql();
let h: MssqlHarness;
const created: string[] = [];

beforeAll(async () => {
  h = await connectMssql();
}, 60000);
afterAll(async () => {
  if (h?.qr) for (const t of created) await dropMssqlTempTableIfExists(h.qr, t);
  await teardownMssql(h);
  restoreDbType();
});
function guard(ctx: { skip: () => void }): boolean {
  if (!h?.reachable || !h.qr) {
    console.warn('[P4b merge] SKIP —', SKIP_REASON);
    ctx.skip();
    return false;
  }
  return true;
}

/** 建立 `##` fixture（VALUES → SELECT INTO），回傳 DataSet。 */
async function fx(valuesSql: string, rowCount: number): Promise<DataSet> {
  const name = '##mgfx_' + Math.random().toString(16).slice(2, 10);
  created.push(name);
  await h.qr!.query(`SELECT * INTO ${name} FROM ${valuesSql}`);
  return { tempTable: name, rowCount };
}

async function runMerge(
  left: DataSet,
  right: DataSet,
  conditions: { leftColumn: string; rightColumn: string }[],
): Promise<DataSet> {
  const logId = uniqueLogId();
  const out = await handler.execute(
    makeRealCtx(h.qr!, 'merge', { conditions }, { 'left-input': left, 'right-input': right }, { nodeId: 'mg', logId }),
  );
  created.push(out.tempTable);
  return out;
}
const sameKey = [{ leftColumn: 'CUSTID', rightColumn: 'CUSTID' }];

describe('P4b MERGE-EQ (真實 MSSQL)', () => {
  it('MERGE-EQ-001 (🔴 DoD): sameKeyName COALESCE — 僅左/僅右/兩側皆有', async (ctx) => {
    if (!guard(ctx)) return;
    const left = await fx(`(VALUES (1,N'la'),(3,N'lc')) AS v("CUSTID", lname)`, 2);
    const right = await fx(`(VALUES (2,N'rb'),(3,N'rc')) AS v("CUSTID", rname)`, 2);
    const out = await runMerge(left, right, sameKey);
    const rows = await readAll(h.qr!, out.tempTable, 'CUSTID');
    expect(rows.map((r: any) => r.CUSTID)).toEqual([1, 2, 3]); // COALESCE 補齊
    expect(out.rowCount).toBe(3);
  });

  it('MERGE-EQ-002: _left/_right 衍生欄位存在且值正確', async (ctx) => {
    if (!guard(ctx)) return;
    const left = await fx(`(VALUES (1,N'la'),(3,N'lc')) AS v("CUSTID", lname)`, 2);
    const right = await fx(`(VALUES (2,N'rb'),(3,N'rc')) AS v("CUSTID", rname)`, 2);
    const out = await runMerge(left, right, sameKey);
    const rows = await readAll(h.qr!, out.tempTable, 'CUSTID');
    const cols = (await getMssqlTempTableColumns(h.qr!, out.tempTable)).map((c) => c.name);
    expect(cols).toContain('CUSTID_left');
    expect(cols).toContain('CUSTID_right');
    const r3 = rows.find((r: any) => r.CUSTID === 3);
    expect(r3.CUSTID_left).toBe(3);
    expect(r3.CUSTID_right).toBe(3);
    const r1 = rows.find((r: any) => r.CUSTID === 1); // 僅左
    expect(r1.CUSTID_left).toBe(1);
    expect(r1.CUSTID_right).toBeNull();
  });

  it('MERGE-EQ-003: FULL OUTER JOIN 未匹配列，對側欄位為 NULL', async (ctx) => {
    if (!guard(ctx)) return;
    const left = await fx(`(VALUES (1,N'la')) AS v("CUSTID", lname)`, 1);
    const right = await fx(`(VALUES (2,N'rb')) AS v("CUSTID", rname)`, 1);
    const out = await runMerge(left, right, sameKey);
    const rows = await readAll(h.qr!, out.tempTable, 'CUSTID');
    expect(rows.find((r: any) => r.CUSTID === 1).rname).toBeNull();
    expect(rows.find((r: any) => r.CUSTID === 2).lname).toBeNull();
  });

  it('MERGE-EQ-004: 非 key 之同名欄位 → _right / _right_2 alias 正確遞增', async (ctx) => {
    if (!guard(ctx)) return;
    // 左側已含 name 與 name_right（模擬上游），右側含 name → 右側 name 應成為 name_right_2
    const left = await fx(`(VALUES (1,N'lname',N'lnr')) AS v("CUSTID", name, name_right)`, 1);
    const right = await fx(`(VALUES (1,N'rname')) AS v("CUSTID", name)`, 1);
    const out = await runMerge(left, right, sameKey);
    const cols = (await getMssqlTempTableColumns(h.qr!, out.tempTable)).map((c) => c.name);
    expect(cols).toContain('name');
    expect(cols).toContain('name_right');
    expect(cols).toContain('name_right_2');
    const row = (await readAll(h.qr!, out.tempTable, 'CUSTID'))[0];
    expect(row.name).toBe('lname');
    expect(row.name_right).toBe('lnr');
    expect(row.name_right_2).toBe('rname');
  });

  it('MERGE-EQ-005 (🔴 DoD, 鏈式 m2→m3): 正確跳過上游 _left/_right 衍生欄位', async (ctx) => {
    if (!guard(ctx)) return;
    // m2 輸出（左輸入）：已含 CUSTID / CUSTID_left / CUSTID_right / ldata
    const m2out = await fx(
      `(VALUES (3, 30, 31, N'm2data')) AS v("CUSTID", "CUSTID_left", "CUSTID_right", ldata)`,
      1,
    );
    // m3 右輸入
    const m3right = await fx(`(VALUES (3, N'm3data')) AS v("CUSTID", rdata)`, 1);
    const out = await runMerge(m2out, m3right, sameKey);
    const cols = (await getMssqlTempTableColumns(h.qr!, out.tempTable)).map((c) => c.name);
    // 輸出欄位集合：無重複、無非預期 _2 尾碼
    expect(cols.sort()).toEqual(['CUSTID', 'CUSTID_left', 'CUSTID_right', 'ldata', 'rdata'].sort());
    const row = (await readAll(h.qr!, out.tempTable, 'CUSTID'))[0];
    // m3 這一層新產生的 _left/_right（值為 m3 的左右 CUSTID=3），非 m2 殘留的 30/31
    expect(row.CUSTID_left).toBe(3);
    expect(row.CUSTID_right).toBe(3);
    expect(row.ldata).toBe('m2data');
    expect(row.rdata).toBe('m3data');
  });

  it('MERGE-EQ-006 (防禦性): sameKeyName=false（不同名 key）路徑正確執行', async (ctx) => {
    if (!guard(ctx)) return;
    const left = await fx(`(VALUES (1,N'la'),(3,N'lc')) AS v("LID", lname)`, 2);
    const right = await fx(`(VALUES (2,N'rb'),(3,N'rc')) AS v("RID", rname)`, 2);
    const out = await runMerge(left, right, [{ leftColumn: 'LID', rightColumn: 'RID' }]);
    const cols = (await getMssqlTempTableColumns(h.qr!, out.tempTable)).map((c) => c.name);
    // 不同名 key：僅輸出 l."LID"（無 COALESCE / _left / _right）+ 其餘欄位
    expect(cols).toContain('LID');
    expect(cols).toContain('RID');
    expect(cols).toContain('lname');
    expect(cols).toContain('rname');
    expect(cols).not.toContain('LID_left');
    expect(out.rowCount).toBe(3); // FULL OUTER JOIN：1/2/3
  });

  it('MERGE-EQ-007: 中文欄位值於 FULL OUTER JOIN 後正確 round-trip', async (ctx) => {
    if (!guard(ctx)) return;
    const left = await fx(`(VALUES (1,N'借新還舊')) AS v("CUSTID", lname)`, 1);
    const right = await fx(`(VALUES (1,N'中古車商')) AS v("CUSTID", rname)`, 1);
    const out = await runMerge(left, right, sameKey);
    const row = (await readAll(h.qr!, out.tempTable, 'CUSTID'))[0];
    expect(row.lname).toBe('借新還舊');
    expect(row.rname).toBe('中古車商');
  });

  it('MERGE-EQ-008: 一側 0 列（有結構）、另一側有資料 → 僅該側資料列，對側全 NULL', async (ctx) => {
    if (!guard(ctx)) return;
    const left = await fx(`(VALUES (1,N'la'),(2,N'lb')) AS v("CUSTID", lname)`, 2);
    const rightEmpty = await fx(`(SELECT * FROM (VALUES (9,N'x')) AS v0("CUSTID", rname) WHERE 1=0) AS v`, 0);
    const out = await runMerge(left, rightEmpty, sameKey);
    const rows = await readAll(h.qr!, out.tempTable, 'CUSTID');
    expect(rows.map((r: any) => r.CUSTID)).toEqual([1, 2]);
    expect(rows.every((r: any) => r.rname === null)).toBe(true);
    expect(out.rowCount).toBe(2);
  });
});
