/**
 * P5g §三 TXN-CORE-PG / §九 CLEANUPTXN-001 — 交易包裝之 PG 對稱驗收（degradable，P5B_PG_DB + 5433）。
 *
 * 架構師裁定「PG 亦須修、兩引擎共通」（I-ETL-ATOMIC-LOAD-01）——本群組非錦上添花，是兩引擎對稱落地
 *   之直接驗收，僅因環境限制降級為 degradable（非降低驗收標準）。政策沿用 p5b-eqpg：需專用 PG 庫
 *   （env P5B_PG_DB，非 cdmp_test，避免 fullMode TRUNCATE 污染 CI 共用庫）+ 5433 可達；否則 ctx.skip()
 *   + SKIP_REASON（DEFERRED，不偽綠，不構成 DoD 未達成）。
 *
 * §九 CLEANUPTXN-001（PG 專屬核心）：PG 交易中止會毒化連線（後續語句被拒直到 ROLLBACK）。若 handler
 *   catch 未先 rollbackTransaction()，pipeline-runner 外層 cleanupAll(queryRunner) 會連帶失敗、使 run() 拋錯
 *   （而非正常回傳 tl1 failed）。故「run() 正常回傳 + tl1 failed + 資料保留」即為 rollback 確實被呼叫之黑盒訊號。
 */
import { describe, it, expect } from 'vitest';
import * as net from 'net';
import { DataSource } from 'typeorm';
import {
  loadPipelineDef, deriveRawColumns, invertMappings, PipelineKey, P5B_PIPELINES,
  FIX_CALENDAR, FIX_ARRETURNDF, FIX_POOLDATA, FIX_POOLDATA_LIST,
} from './_p5b-fixtures';
import { NodeDispatcher } from '../node-dispatcher';
import { NodeOutputStore } from '../node-output-store';
import { PipelineRunner } from '../pipeline-runner';
import { NodeLogEntry } from '../types';
import { ExtractHandler } from '../handlers/extract-handler';
import { FieldMappingHandler } from '../handlers/field-mapping-handler';
import { ConditionalHandler } from '../handlers/conditional-handler';
import { TargetLoadHandler } from '../handlers/target-load-handler';

const PG = {
  host: process.env.PG_BOSS_TEST_HOST ?? '127.0.0.1',
  port: Number(process.env.PG_BOSS_TEST_PORT ?? 5433),
  user: process.env.PG_BOSS_TEST_USER ?? 'cdmp',
  password: process.env.PG_BOSS_TEST_PASSWORD ?? 'cdmp_secret',
  database: process.env.P5B_PG_DB ?? '', // 專用庫（非 cdmp_test）
};
const SKIP_REASON =
  '需專用 Postgres 庫（env P5B_PG_DB，非 cdmp_test；5433 可達且已建 baseline）— DEFERRED，不偽綠';

function pgPortReachable(timeoutMs = 1000): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = net.connect({ host: PG.host, port: PG.port });
    const finish = (ok: boolean) => { sock.destroy(); resolve(ok); };
    sock.setTimeout(timeoutMs);
    sock.once('connect', () => finish(true));
    sock.once('error', () => finish(false));
    sock.once('timeout', () => finish(false));
  });
}
async function pgEqEnabled(): Promise<boolean> {
  if (!PG.database) return false;
  return pgPortReachable();
}

let enabled = false;
let ds: DataSource | null = null;

function lit(v: string | null | undefined): string {
  if (v === null || v === undefined) return 'NULL';
  return `'${String(v).replace(/'/g, "''")}'`;
}
function buildPgDispatcher(): NodeDispatcher {
  const d = new NodeDispatcher();
  d.register(new ExtractHandler());
  d.register(new FieldMappingHandler());
  d.register(new ConditionalHandler());
  d.register(new TargetLoadHandler());
  return d;
}
async function pgBuildRaw(key: PipelineKey, rows: Record<string, string | null>[]): Promise<void> {
  const qr = ds!.createQueryRunner();
  await qr.connect();
  try {
    const def = loadPipelineDef(key);
    const cols = deriveRawColumns(def);
    const inverse = invertMappings(def);
    const raw = P5B_PIPELINES[key].rawTable;
    await qr.query(`DROP TABLE IF EXISTS "${raw}"`);
    await qr.query(`CREATE TABLE "${raw}" (${cols.map((c) => `"${c}" TEXT`).join(', ')})`);
    for (const trow of rows) {
      const srow: Record<string, string | null> = {};
      for (const [t, v] of Object.entries(trow)) {
        const s = inverse[t];
        if (s) srow[s] = v;
      }
      const ks = Object.keys(srow);
      if (!ks.length) continue;
      await qr.query(
        `INSERT INTO "${raw}" (${ks.map((c) => `"${c}"`).join(', ')}) VALUES (${ks.map((c) => lit(srow[c])).join(', ')})`,
      );
    }
  } finally {
    await qr.release();
  }
}
/** 執行 pipeline，回傳完整 nodeLogs（供檢查 tl1 狀態）。若連線被毒化，run() 會拋錯 → 測試直接失敗。 */
async function pgRun(key: PipelineKey): Promise<NodeLogEntry[]> {
  const qr = ds!.createQueryRunner();
  await qr.connect();
  try {
    const runner = new PipelineRunner(buildPgDispatcher(), new NodeOutputStore());
    return runner.run(
      loadPipelineDef(key),
      { batchSize: 10000, upsertBatchSize: 5000, isTestRun: false, pipelineId: '99999999-9999-9999-9999-999999999999', logId: Math.random().toString(16).slice(2, 10) },
      qr,
      async () => {},
    );
  } finally {
    await qr.release();
  }
}
async function pgCount(table: string, where?: string): Promise<number> {
  const qr = ds!.createQueryRunner();
  await qr.connect();
  try {
    const r = await qr.query(`SELECT COUNT(*) AS c FROM "${table}"${where ? ` WHERE ${where}` : ''}`);
    return Number(r[0].c);
  } finally {
    await qr.release();
  }
}
async function pgExec(sql: string): Promise<void> {
  const qr = ds!.createQueryRunner();
  await qr.connect();
  try { await qr.query(sql); } finally { await qr.release(); }
}

describe('P5g PG TXN-CORE（degradable）— 兩引擎對稱：TRUNCATE/DELETE + 失敗 INSERT → 回滾、既存資料保留', () => {
  it('前置：偵測專用 PG 庫可用性', async () => {
    enabled = await pgEqEnabled();
    if (enabled) {
      ds = new DataSource({
        type: 'postgres', host: PG.host, port: PG.port, username: PG.user,
        password: PG.password, database: PG.database, entities: [], synchronize: false,
      });
      await ds.initialize();
    } else {
      console.warn(`[P5g PG TXN] SKIPPED live — ${SKIP_REASON}`);
    }
    expect(typeof enabled).toBe('boolean');
  });

  it('PGTXN-006：degradable gating 自我驗證（reachable 為 boolean、SKIP_REASON 非空）', async () => {
    expect(typeof (await pgEqEnabled())).toBe('boolean');
    expect(SKIP_REASON.length).toBeGreaterThan(0);
  });

  it('PGTXN-001（fullMode 單欄 PK，degradable）：ob_calendar rest_flg 空字串 → tl1 失敗、既存列保留', async (ctx) => {
    if (!enabled || !ds) return ctx.skip();
    await pgExec(`DELETE FROM "ob_calendar"`);
    await pgExec(`INSERT INTO "ob_calendar" ("calendar_date","rest_flg") VALUES ('2030-01-01','0'),('2030-02-01','0'),('2030-03-01','0')`);
    await pgBuildRaw('calendar', [...FIX_CALENDAR.happy, { calendar_date: '2027-01-01', rest_flg: '' }]);
    const logs = await pgRun('calendar');
    const tl1 = logs.find((l) => l.nodeId === 'tl1')!;
    expect(tl1.status).toBe('failed');
    expect(tl1.errorMessage ?? '').toMatch(/rest_flg|not-null|null value/i);
    expect(await pgCount('ob_calendar')).toBe(3); // 分支 B：既存列保留（TRUNCATE 已回滾）
  });

  it('PGTXN-002（fullMode composite PK，degradable）：ob_pool_data custo_no 空字串 → tl1 失敗、既存列保留', async (ctx) => {
    if (!enabled || !ds) return ctx.skip();
    await pgExec(`DELETE FROM "ob_pool_data"`);
    await pgExec(
      `INSERT INTO "ob_pool_data" ("orgno","appl_no","custo_no","sta_code","dept_id","list_type","settle_src","_cdmp_extracted_at") ` +
        `VALUES ('98','PGX1','C','1','D','0','N',NOW()),('98','PGX2','C','1','D','0','N',NOW())`,
    );
    await pgBuildRaw('pooldata', [
      ...FIX_POOLDATA.happy,
      { orgno: '03', appl_no: 'DIRTYPG1', custo_no: '', sta_code: '10', dept_id: 'D00001', list_type: '01', settle_src: 'N', cust_name: '髒列' },
    ]);
    const logs = await pgRun('pooldata');
    expect(logs.find((l) => l.nodeId === 'tl1')!.status).toBe('failed');
    expect(await pgCount('ob_pool_data')).toBe(2);
  });

  it('PGTXN-003（數值溢位，degradable）：ob_arreturndf_min_cap 16 位溢位 → tl1 失敗、既存列保留', async (ctx) => {
    if (!enabled || !ds) return ctx.skip();
    await pgExec(`DELETE FROM "ob_arreturndf_min_cap"`);
    await pgExec(`INSERT INTO "ob_arreturndf_min_cap" ("appl_no","add_un_capital","_cdmp_extracted_at") VALUES ('PGA1',1,NOW()),('PGA2',1,NOW())`);
    await pgBuildRaw('arreturndf', [...FIX_ARRETURNDF.happy, { appl_no: 'A0000099', add_un_capital: '1234567890123456' }]);
    const logs = await pgRun('arreturndf');
    expect(logs.find((l) => l.nodeId === 'tl1')!.status).toBe('failed');
    expect(await pgCount('ob_arreturndf_min_cap')).toBe(2);
  });

  it('PGTXN-004（partition_replace，degradable）：ob_pool_data_list 撞 PK → DELETE 回滾、etl_load 既存列保留', async (ctx) => {
    if (!enabled || !ds) return ctx.skip();
    await pgExec(`DELETE FROM "ob_pool_data_list"`);
    await pgExec(
      `INSERT INTO "ob_pool_data_list" ("list_no","orgno","appl_no","settle_src","data_source") ` +
        `VALUES ('PGL1','98','PGL1','N','etl_load'),('PGL2','98','PGL2','N','etl_load'),('PGL3','98','PGL3','N','etl_load'),('PGO1','98','PGO1','N','_P5B_OTHER_')`,
    );
    await pgBuildRaw('pooldata_list', [...FIX_POOLDATA_LIST.happy, FIX_POOLDATA_LIST.dupPk]);
    const logs = await pgRun('pooldata_list');
    expect(logs.find((l) => l.nodeId === 'tl1')!.status).toBe('failed');
    expect(await pgCount('ob_pool_data_list', `data_source='etl_load'`)).toBe(3); // DELETE 回滾
    expect(await pgCount('ob_pool_data_list', `data_source='_P5B_OTHER_'`)).toBe(1);
  });

  it('PGTXN-005（旗艦，degradable）：同一壞值形狀 PG 與 MSSQL 皆呈分支 B（資料保留）→ 兩引擎對稱落地', async (ctx) => {
    if (!enabled || !ds) return ctx.skip();
    // PG 側分支 B 已由 PGTXN-001..004 證；MSSQL 側由 p5g-txn TXNCORE-001..004 證。此處鎖定對稱結論。
    await pgExec(`DELETE FROM "ob_calendar"`);
    await pgExec(`INSERT INTO "ob_calendar" ("calendar_date","rest_flg") VALUES ('2030-05-05','0')`);
    await pgBuildRaw('calendar', [...FIX_CALENDAR.happy, { calendar_date: '2027-09-09', rest_flg: '' }]);
    const logs = await pgRun('calendar');
    expect(logs.find((l) => l.nodeId === 'tl1')!.status).toBe('failed');
    expect(await pgCount('ob_calendar')).toBe(1); // 保留（非 0）
  });

  it('CLEANUPTXN-001（MUST-FIX，PG 專屬，degradable）：INSERT 失敗後 pipeline-runner cleanupAll 成功——run() 正常回傳、連線未毒化', async (ctx) => {
    if (!enabled || !ds) return ctx.skip();
    await pgExec(`DELETE FROM "ob_calendar"`);
    await pgExec(`INSERT INTO "ob_calendar" ("calendar_date","rest_flg") VALUES ('2030-06-06','0'),('2030-07-07','0')`);
    await pgBuildRaw('calendar', [...FIX_CALENDAR.happy, { calendar_date: '2027-08-08', rest_flg: '' }]);
    // 若 handler catch 未先 rollback，PG 連線進入 aborted → cleanupAll(DROP 上游 ## 暫存表) 連帶失敗 → run() 拋錯。
    // 故「run() resolve 且回傳 nodeLogs（tl1 failed）」即為 rollback 確實被呼叫之黑盒證明。
    const logs = await pgRun('calendar'); // 不應 throw
    expect(Array.isArray(logs)).toBe(true);
    const tl1 = logs.find((l) => l.nodeId === 'tl1')!;
    expect(tl1.status).toBe('failed');
    expect(await pgCount('ob_calendar')).toBe(2); // 既存列保留
  });

  it('清理：teardown', async () => {
    if (ds) await ds.destroy();
    expect(true).toBe(true);
  });
});
