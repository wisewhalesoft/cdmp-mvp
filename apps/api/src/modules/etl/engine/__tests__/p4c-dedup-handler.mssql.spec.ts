/**
 * AD-E07-41 P4c — DedupHandlerMssql 真實 MSSQL 整合測試（## fixture，不落 dbo）。
 *
 * 覆蓋：DEDUP-TIEBREAK-001..005 / DEDUP-MSSQL-001..003 / DEDUP-EQ-004 / DEDUP-CLEANUP-001..002。
 * ⚠️ 必須 side-effect import mssql-env-preload（設 DB_TYPE=mssql）。MSSQL 不可達 → 全檔 skip（不造假）。
 */
import '@/database/__tests__/mssql-env-preload';
import { describe, it, beforeAll, afterAll, expect, vi } from 'vitest';
import { restoreDbType } from '@/database/__tests__/mssql-env-preload';
import {
  connectMssql,
  teardownMssql,
  makeRealCtx,
  uniqueLogId,
  objectExists,
  readAll,
  MssqlHarness,
} from './_p4a-mssql-harness';
import { DedupHandlerMssql } from '../handlers/dedup-handler-mssql';
import { makeTempTableName } from '../types';

vi.setConfig({ testTimeout: 60000 });

let h: MssqlHarness;
beforeAll(async () => {
  h = await connectMssql();
});
afterAll(async () => {
  await teardownMssql(h);
  restoreDbType();
});
const gate = () => !h?.reachable || !h?.qr;

/** 建 ## fixture 表。 */
async function fixture(sql: string): Promise<string> {
  const name = '##fx_' + uniqueLogId().slice(0, 10);
  await h.qr!.query(`SELECT * INTO ${name} FROM (${sql}) AS v_outer`);
  return name;
}

async function runDedup(inputTable: string, rowCount: number, keyColumns: string[], timestampColumn: string, nodeId = 'd1') {
  const dh = new DedupHandlerMssql();
  const ctx = makeRealCtx(
    h.qr!,
    'dedup',
    { keyColumns, timestampColumn },
    { default: { tempTable: inputTable, rowCount } },
    { nodeId },
  );
  return dh.execute(ctx);
}

describe('P4c DEDUP-TIEBREAK (決定性)', () => {
  it('TIEBREAK-001（DoD 核心）：同 key 同 timestamp，_seq 較小（較早寫入）決定性勝出、多跑一致', async (ctx) => {
    if (gate()) return ctx.skip();
    const winners = new Set<string>();
    let onlyOne = true;
    for (let i = 0; i < 3; i++) {
      const fx = await fixture(
        `SELECT * FROM (VALUES ('K1',N'FIRST','2020-01-01'),('K1',N'SECOND','2020-01-01')) AS v(k,val,ts)`,
      );
      const res = await runDedup(fx, 2, ['k'], 'ts');
      if (res.rowCount !== 1) onlyOne = false;
      const rows = await readAll(h.qr!, res.tempTable, 'k');
      winners.add(rows[0].val);
    }
    expect(onlyOne).toBe(true);
    expect(winners.size).toBe(1); // 決定性：3 次勝出列一致
    expect([...winners][0]).toBe('FIRST'); // _seq 較小（首列）勝出
  });

  it('TIEBREAK-002：timestamp 不同 → 較新者勝出，_seq 不介入', async (ctx) => {
    if (gate()) return ctx.skip();
    const fx = await fixture(
      `SELECT * FROM (VALUES ('K1',N'OLD','2020-01-01'),('K1',N'NEW','2020-06-01')) AS v(k,val,ts)`,
    );
    const res = await runDedup(fx, 2, ['k'], 'ts');
    const rows = await readAll(h.qr!, res.tempTable, 'k');
    expect(res.rowCount).toBe(1);
    expect(rows[0].val).toBe('NEW');
  });

  it('TIEBREAK-003：NULL timestamp 排最後（非 NULL 存在時不被選中）', async (ctx) => {
    if (gate()) return ctx.skip();
    const fx = await fixture(
      `SELECT * FROM (VALUES ('K1',N'HASDATE','2020-01-01'),('K1',N'NULLDATE',NULL)) AS v(k,val,ts)`,
    );
    const res = await runDedup(fx, 2, ['k'], 'ts');
    const rows = await readAll(h.qr!, res.tempTable, 'k');
    expect(res.rowCount).toBe(1);
    expect(rows[0].val).toBe('HASDATE');
  });

  it('TIEBREAK-004：同 key 全部 timestamp 皆 NULL → _seq 決勝（仍決定性）', async (ctx) => {
    if (gate()) return ctx.skip();
    const winners = new Set<string>();
    for (let i = 0; i < 3; i++) {
      const fx = await fixture(
        `SELECT * FROM (VALUES ('K1',N'A',NULL),('K1',N'B',NULL),('K2',N'C','2020-01-01')) AS v(k,val,ts)`,
      );
      const res = await runDedup(fx, 3, ['k'], 'ts');
      expect(res.rowCount).toBe(2); // K1 一列 + K2 一列
      const rows = await readAll(h.qr!, res.tempTable, 'k');
      winners.add(rows.find((r: any) => r.k === 'K1').val);
    }
    expect(winners.size).toBe(1);
    expect([...winners][0]).toBe('A'); // 首列（_seq 較小）
  });

  it('TIEBREAK-005（§4.3 語意）：僅斷言決定性選出恰一列，不要求與 PG 選同一實體列', async (ctx) => {
    if (gate()) return ctx.skip();
    const fx = await fixture(
      `SELECT * FROM (VALUES ('K1',N'X','2020-01-01'),('K1',N'Y','2020-01-01'),('K1',N'Z','2020-01-01')) AS v(k,val,ts)`,
    );
    const res = await runDedup(fx, 3, ['k'], 'ts');
    expect(res.rowCount).toBe(1); // 恰一列（非零、非多）
  });
});

describe('P4c DEDUP-MSSQL (三組真實 key 配置)', () => {
  it('MSSQL-001（仿 d1）：CUSTO_NO / UPDATE_DATE 去重正確', async (ctx) => {
    if (gate()) return ctx.skip();
    const fx = await fixture(
      `SELECT * FROM (VALUES ('C1',N'old','2020-01-01'),('C1',N'new','2021-01-01'),('C2',N'solo','2020-05-05')) AS v(CUSTO_NO,payload,UPDATE_DATE)`,
    );
    const res = await runDedup(fx, 3, ['CUSTO_NO'], 'UPDATE_DATE');
    const rows = await readAll(h.qr!, res.tempTable, 'CUSTO_NO');
    expect(res.rowCount).toBe(2);
    expect(rows.find((r: any) => r.CUSTO_NO === 'C1').payload).toBe('new');
    expect(rows.find((r: any) => r.CUSTO_NO === 'C2').payload).toBe('solo');
  });

  it('MSSQL-002（仿 d2）：CUSTID / U_SYSDT 去重正確', async (ctx) => {
    if (gate()) return ctx.skip();
    const fx = await fixture(
      `SELECT * FROM (VALUES ('I1',N'v1','2019-01-01'),('I1',N'v2','2019-12-31'),('I1',N'v3','2019-06-01')) AS v(CUSTID,payload,U_SYSDT)`,
    );
    const res = await runDedup(fx, 3, ['CUSTID'], 'U_SYSDT');
    const rows = await readAll(h.qr!, res.tempTable, 'CUSTID');
    expect(res.rowCount).toBe(1);
    expect(rows[0].payload).toBe('v2'); // 2019-12-31 最新
  });

  it('MSSQL-003（仿 d3）：source_customer_no / source_updated_at 去重正確', async (ctx) => {
    if (gate()) return ctx.skip();
    const fx = await fixture(
      `SELECT * FROM (VALUES ('S1',N'a','2022-01-01'),('S2',N'b','2022-02-02'),('S1',N'c','2022-03-03')) AS v(source_customer_no,payload,source_updated_at)`,
    );
    const res = await runDedup(fx, 3, ['source_customer_no'], 'source_updated_at');
    const rows = await readAll(h.qr!, res.tempTable, 'source_customer_no');
    expect(res.rowCount).toBe(2);
    expect(rows.find((r: any) => r.source_customer_no === 'S1').payload).toBe('c');
  });
});

describe('P4c DEDUP-EQ (既有邏輯回歸)', () => {
  it('EQ-004：中文欄位值去重後正確 round-trip', async (ctx) => {
    if (gate()) return ctx.skip();
    const fx = await fixture(
      `SELECT * FROM (VALUES ('C1',N'王小明舊','2020-01-01'),('C1',N'王小明新','2021-01-01')) AS v(CUSTO_NO,CUST_NAME,UPDATE_DATE)`,
    );
    const res = await runDedup(fx, 2, ['CUSTO_NO'], 'UPDATE_DATE');
    const rows = await readAll(h.qr!, res.tempTable, 'CUSTO_NO');
    expect(res.rowCount).toBe(1);
    expect(rows[0].CUST_NAME).toBe('王小明新');
  });
});

describe('P4c DEDUP-CLEANUP (中繼 ##raw 清理)', () => {
  it('CLEANUP-001：成功路徑 — ##raw_<x> handler 完成後立即清理；##dedup_<x>（回傳）仍存活待 pipeline 清', async (ctx) => {
    if (gate()) return ctx.skip();
    const logId = uniqueLogId();
    const fx = await fixture(
      `SELECT * FROM (VALUES ('K1',N'a','2020-01-01'),('K1',N'b','2021-01-01')) AS v(k,val,ts)`,
    );
    const dh = new DedupHandlerMssql();
    const dctx = makeRealCtx(h.qr!, 'dedup', { keyColumns: ['k'], timestampColumn: 'ts' }, { default: { tempTable: fx, rowCount: 2 } }, { nodeId: 'dc1', logId });
    const res = await dh.execute(dctx);
    const rawName = `##raw_${makeTempTableName('dc1', logId)}`;
    expect(await objectExists(h.qr!, rawName)).toBe(false); // ##raw 已清理
    expect(await objectExists(h.qr!, res.tempTable)).toBe(true); // ##dedup 仍存活
  });

  it('CLEANUP-002：失敗路徑（ROW_NUMBER 階段拋錯）— ##raw_<x> 不殘留', async (ctx) => {
    if (gate()) return ctx.skip();
    const logId = uniqueLogId();
    const fx = await fixture(
      `SELECT * FROM (VALUES ('K1',N'a','2020-01-01')) AS v(k,val,ts)`,
    );
    const rawName = `##raw_${makeTempTableName('dc2', logId)}`;
    // 包裝 qr：ROW_NUMBER 陳述式（##dedup 建立）強制拋錯，模擬型別問題
    const realQr = h.qr!;
    const proxyQr: any = {
      query: (sql: string, params?: any[]) =>
        sql.includes('ROW_NUMBER') ? Promise.reject(new Error('forced ROW_NUMBER failure')) : realQr.query(sql, params),
    };
    const dh = new DedupHandlerMssql();
    const dctx = makeRealCtx(realQr, 'dedup', { keyColumns: ['k'], timestampColumn: 'ts' }, { default: { tempTable: fx, rowCount: 1 } }, { nodeId: 'dc2', logId });
    dctx.queryRunner = proxyQr;
    await expect(dh.execute(dctx)).rejects.toThrow(/forced ROW_NUMBER/);
    // finally 已透過 proxy 委派真實 qr drop ##raw（drop 陳述式不含 ROW_NUMBER）
    expect(await objectExists(realQr, rawName)).toBe(false);
  });
});
