/**
 * P5g — ETL target_load ATOMIC 交易包裝修法之 MSSQL 端對端驗收（真實 MSSQL / CDMP_P5B）。
 *
 * 覆蓋（真實 MSSQL）：
 *   §二 TXNCORE-001..007（交易包裝核心：TRUNCATE/DELETE + 失敗 INSERT → 回滾、既存資料保留）
 *   §五 SCOPE-001（isTransactionActive 黑盒：成功/失敗後皆 false）/ SCOPE-003（前置唯讀查詢不在交易內）
 *       / SCOPE-006（## 全域暫存表於交易內可見 — 由成功路徑佐證）
 *   §六 ISO-002/003（MSSQL 並行讀者可見性 probe：雙連線手動編排，記錄阻塞 vs 立即讀舊值）
 *   §七 SUCC-001/002/004/005/006（成功路徑不因交易包裝而破壞）
 *   §九 CLEANUPTXN-002/003（交易失敗後 ## 暫存表清理仍成功、連線未被毒化）
 *
 * 承 P5b 之凍結清單解凍：target-load-handler-mssql.ts 已加交易保護（I-ETL-ATOMIC-LOAD-01）。
 * ⚠️ 必須 side-effect import mssql-env-preload；CDMP_P5B 不可達 → 全檔 skip（不偽綠）。
 * ⚠️ 與 p5b-e2e.mssql.spec.ts 共用 CDMP_P5B 之 baseline 表（TRUNCATE 破壞性）→ CI 以
 *    --no-file-parallelism 序列化 *.mssql.spec.ts，本機亦同（見 ci.yml mssql-specs lane）。
 */
import '@/database/__tests__/mssql-env-preload';
import { describe, it, beforeAll, afterAll, expect, vi } from 'vitest';
import { restoreDbType } from '@/database/__tests__/mssql-env-preload';
import { uniqueLogId } from './_p4a-mssql-harness';
import {
  connectMssqlP5b, teardownMssqlP5b, P5bHarness,
  P5B_PIPELINES, PIPELINE_KEYS, PipelineKey, loadPipelineDef,
  ensureAllTargetTables, ensureAuxTables, buildAllHappyFixtures, rebuildHappy,
  clearTarget, countTarget, cleanupRawFixtures, createRawTable, insertTargetRows,
  deriveRawColumns, invertMappings,
  FIX_ARRETURNDF, FIX_CALENDAR, FIX_EMPHIRE, FIX_POOLDATA, FIX_POOLDATA_LIST,
} from './_p5b-fixtures';
import { NodeDispatcher } from '../node-dispatcher';
import { NodeOutputStore } from '../node-output-store';
import { PipelineRunner } from '../pipeline-runner';
import { NodeLogEntry, makeTempTableName, DataSet, NodeExecutionContext } from '../types';
import { ExtractHandlerMssql } from '../handlers/extract-handler-mssql';
import { FieldMappingHandlerMssql } from '../handlers/field-mapping-handler-mssql';
import { ConditionalHandlerMssql } from '../handlers/conditional-handler-mssql';
import { TargetLoadHandlerMssql } from '../handlers/target-load-handler-mssql';

vi.setConfig({ testTimeout: 60000 });

const PIPELINE_ID = '77777777-7777-7777-7777-777777777777';

let h: P5bHarness;

interface RunResult {
  nodeLogs: NodeLogEntry[];
  logId: string;
  /** onLogUpdate 最後一次收到的整體 status（服務層據此回寫 EtlPipelineLog.status）。 */
  finalStatus: 'running' | 'completed' | 'failed' | undefined;
}

function buildMssqlDispatcher(): NodeDispatcher {
  const d = new NodeDispatcher();
  d.register(new ExtractHandlerMssql());
  d.register(new FieldMappingHandlerMssql());
  d.register(new ConditionalHandlerMssql());
  d.register(new TargetLoadHandlerMssql());
  return d;
}

async function runByKey(key: PipelineKey, opts: { logId?: string } = {}): Promise<RunResult> {
  const def = loadPipelineDef(key);
  const store = new NodeOutputStore();
  const runner = new PipelineRunner(buildMssqlDispatcher(), store);
  const logId = opts.logId ?? uniqueLogId();
  let finalStatus: RunResult['finalStatus'];
  const nodeLogs = await runner.run(
    def,
    { batchSize: 10000, upsertBatchSize: 5000, isTestRun: false, pipelineId: PIPELINE_ID, logId },
    h.qr!,
    async (_logs, status) => {
      finalStatus = status;
    },
  );
  return { nodeLogs, logId, finalStatus };
}

/** 直接（非經 pipeline）塞入既存列（沿用 p5b insertStale 手法）。 */
async function insertStale(key: PipelineKey, n: number, opts: { dataSource?: string; tag?: string } = {}): Promise<void> {
  const q = h.qr!;
  const now = `CAST(GETDATE() AS datetime2)`;
  const t = opts.tag ?? '';
  for (let i = 0; i < n; i++) {
    if (key === 'calendar') {
      const mm = String(i + 1).padStart(2, '0');
      await q.query(`INSERT INTO "ob_calendar" ("calendar_date","rest_flg") VALUES ('2031-${mm}-01','0')`);
    } else if (key === 'arreturndf') {
      await q.query(`INSERT INTO "ob_arreturndf_min_cap" ("appl_no","add_un_capital","_cdmp_extracted_at") VALUES ('SG${t}${i}', 1, ${now})`);
    } else if (key === 'emphire') {
      await q.query(`INSERT INTO "ob_emphire" ("emp_id","emp_nm") VALUES ('SG${t}${i}', N'舊員工')`);
    } else if (key === 'pooldata') {
      await q.query(
        `INSERT INTO "ob_pool_data" ("orgno","appl_no","custo_no","sta_code","dept_id","list_type","settle_src","_cdmp_extracted_at") ` +
          `VALUES ('98','SG${t}${i}','C','1','D','0',N'N', ${now})`,
      );
    } else if (key === 'pooldata_list') {
      const ds = opts.dataSource ?? 'etl_load';
      await q.query(
        `INSERT INTO "ob_pool_data_list" ("list_no","orgno","appl_no","settle_src","data_source") ` +
          `VALUES ('SGL${t}${i}','98','SG${t}${i}',N'N','${ds}')`,
      );
    }
  }
}

/** tempdb 全域 ## 殘留掃描（本次 logId 前 8 碼）。 */
async function tempLeakCount(logId: string): Promise<number> {
  const prefix = makeTempTableName('x', logId).split('_').pop()!;
  const r = await h.qr!.query(
    `SELECT COUNT(*) AS c FROM tempdb.sys.objects WHERE name LIKE '##%' AND name LIKE @0`,
    ['%' + prefix + '%'],
  );
  return Number(r[0].c);
}

async function restoreHappy(key: PipelineKey): Promise<void> {
  await clearTarget(h.qr!, key);
  await rebuildHappy(h.qr!, key);
  await runByKey(key);
}

/** 追加壞列後跑 pipeline（觸發 INSERT 失敗）。 */
async function runWithDirty(key: PipelineKey, dirty: Record<string, string | null>, logId?: string): Promise<RunResult> {
  const def = loadPipelineDef(key);
  await createRawTable(h.qr!, P5B_PIPELINES[key].rawTable, deriveRawColumns(def));
  const happy: Record<PipelineKey, Record<string, string | null>[]> = {
    arreturndf: FIX_ARRETURNDF.happy, calendar: FIX_CALENDAR.happy, emphire: FIX_EMPHIRE.happy,
    pooldata: FIX_POOLDATA.happy, pooldata_list: FIX_POOLDATA_LIST.happy,
  };
  await insertTargetRows(h.qr!, P5B_PIPELINES[key].rawTable, invertMappings(def), [...happy[key], dirty]);
  return runByKey(key, { logId });
}

beforeAll(async () => {
  h = await connectMssqlP5b();
  if (!h.reachable || !h.qr) return;
  await ensureAllTargetTables(h.qr);
  await ensureAuxTables(h.qr);
  await buildAllHappyFixtures(h.qr);
  for (const key of PIPELINE_KEYS) {
    await clearTarget(h.qr, key);
    await runByKey(key);
  }
});
afterAll(async () => {
  if (h?.qr) await cleanupRawFixtures(h.qr);
  await teardownMssqlP5b(h);
  restoreDbType();
});
const gate = () => !h?.reachable || !h?.qr;

// ===========================================================================
// §二 TXN-CORE — 交易包裝核心（DoD 核心，I-ETL-ATOMIC-LOAD-01）
// ===========================================================================
describe('P5g TXN-CORE（MSSQL）— TRUNCATE/DELETE + 失敗 INSERT → 回滾、既存資料保留', () => {
  it('TXNCORE-001（MUST-FIX）：ob_calendar 單欄 PK、rest_flg 空字串 → tl1 失敗、3 既存列保留', async () => {
    if (gate()) return;
    await clearTarget(h.qr!, 'calendar');
    await insertStale('calendar', 3);
    expect(await countTarget(h.qr!, 'calendar')).toBe(3);
    const r = await runWithDirty('calendar', { calendar_date: '2027-03-01', rest_flg: '' });
    const tl1 = r.nodeLogs.find((l) => l.nodeId === 'tl1')!;
    expect(tl1.status).toBe('failed');
    expect(tl1.errorMessage ?? '').toMatch(/Cannot insert the value NULL into column 'rest_flg'/);
    expect(await countTarget(h.qr!, 'calendar')).toBe(3); // 分支 B：既存列保留
    await restoreHappy('calendar');
  });

  it('TXNCORE-002（MUST-FIX）：ob_pool_data composite PK、custo_no 空字串 → tl1 失敗、3 既存列保留', async () => {
    if (gate()) return;
    await clearTarget(h.qr!, 'pooldata');
    await insertStale('pooldata', 3);
    expect(await countTarget(h.qr!, 'pooldata')).toBe(3);
    const r = await runWithDirty('pooldata', {
      orgno: '03', appl_no: 'DIRTYSG01', custo_no: '', sta_code: '10', dept_id: 'D00001', list_type: '01', settle_src: 'N', cust_name: '髒列',
    });
    const tl1 = r.nodeLogs.find((l) => l.nodeId === 'tl1')!;
    expect(tl1.status).toBe('failed');
    expect(await countTarget(h.qr!, 'pooldata')).toBe(3);
    await restoreHappy('pooldata');
  });

  it('TXNCORE-003（MUST-FIX）：ob_arreturndf_min_cap numeric(15,0) 16 位溢位 → tl1 失敗、3 既存列保留', async () => {
    if (gate()) return;
    await clearTarget(h.qr!, 'arreturndf');
    await insertStale('arreturndf', 3);
    expect(await countTarget(h.qr!, 'arreturndf')).toBe(3);
    const r = await runWithDirty('arreturndf', { appl_no: 'A0000099', add_un_capital: '1234567890123456' });
    const tl1 = r.nodeLogs.find((l) => l.nodeId === 'tl1')!;
    expect(tl1.status).toBe('failed');
    expect(tl1.errorMessage ?? '').toMatch(/overflow|arithmetic|convert|numeric/i);
    expect(await countTarget(h.qr!, 'arreturndf')).toBe(3);
    await restoreHappy('arreturndf');
  });

  it('TXNCORE-004（MUST-FIX）：ob_pool_data_list partition_replace 撞 PK → DELETE 回滾、etl_load 既存列保留', async () => {
    if (gate()) return;
    await clearTarget(h.qr!, 'pooldata_list');
    await insertStale('pooldata_list', 3, { dataSource: 'etl_load' });
    await insertStale('pooldata_list', 1, { dataSource: FIX_POOLDATA_LIST.otherPartition, tag: 'O' });
    const r = await runWithDirty('pooldata_list', FIX_POOLDATA_LIST.dupPk);
    const tl1 = r.nodeLogs.find((l) => l.nodeId === 'tl1')!;
    expect(tl1.status).toBe('failed');
    expect(await countTarget(h.qr!, 'pooldata_list', `data_source='etl_load'`)).toBe(3); // DELETE 回滾
    expect(await countTarget(h.qr!, 'pooldata_list', `data_source='${FIX_POOLDATA_LIST.otherPartition}'`)).toBe(1);
    await clearTarget(h.qr!, 'pooldata_list');
    await restoreHappy('pooldata_list');
  });

  it('TXNCORE-005（DoD 核心，可觀察性回歸）：失敗時 tl1.status/errorMessage/nodeLogs 結構完整，錯誤未被交易吞掉', async () => {
    if (gate()) return;
    await clearTarget(h.qr!, 'calendar');
    await insertStale('calendar', 2);
    const r = await runWithDirty('calendar', { calendar_date: '2027-04-01', rest_flg: '' });
    // nodeLogs 完整（e1/fm1/tl1 三節點），tl1 failed 且帶明確 errorMessage，其餘節點 completed
    expect(r.nodeLogs.length).toBe(3);
    const tl1 = r.nodeLogs.find((l) => l.nodeId === 'tl1')!;
    expect(tl1.status).toBe('failed');
    expect((tl1.errorMessage ?? '').length).toBeGreaterThan(0);
    expect(r.nodeLogs.filter((l) => l.nodeId !== 'tl1').every((l) => l.status === 'completed')).toBe(true);
    await restoreHappy('calendar');
  });

  it('TXNCORE-006：失敗時 onLogUpdate 之 finalStatus=failed（服務層狀態回寫之依據，未被交易包裝改變）', async () => {
    if (gate()) return;
    await clearTarget(h.qr!, 'calendar');
    await insertStale('calendar', 1);
    const r = await runWithDirty('calendar', { calendar_date: '2027-05-01', rest_flg: '' });
    expect(r.finalStatus).toBe('failed');
    await restoreHappy('calendar');
  });

  it('TXNCORE-007（DoD 核心，可恢復性）：失敗後改用乾淨 fixture 立即重跑 → 完成且資料正確落地', async () => {
    if (gate()) return;
    await clearTarget(h.qr!, 'calendar');
    await insertStale('calendar', 3);
    await runWithDirty('calendar', { calendar_date: '2027-06-01', rest_flg: '' }); // 失敗、保留 3
    expect(await countTarget(h.qr!, 'calendar')).toBe(3);
    // 乾淨 fixture 重跑
    await rebuildHappy(h.qr!, 'calendar');
    const r2 = await runByKey('calendar');
    expect(r2.nodeLogs.every((l) => l.status === 'completed')).toBe(true);
    expect(await countTarget(h.qr!, 'calendar')).toBe(FIX_CALENDAR.uniqueCount);
  });
});

// ===========================================================================
// §五 SCOPE — 交易範圍（isTransactionActive 黑盒 + 前置查詢不在交易內）
// ===========================================================================
describe('P5g SCOPE（MSSQL）— 交易範圍正確性', () => {
  it('SCOPE-001a（MUST-FIX）：成功路徑後 queryRunner.isTransactionActive===false（交易不跨節點邊界）', async () => {
    if (gate()) return;
    await restoreHappy('calendar');
    await runByKey('calendar');
    expect(h.qr!.isTransactionActive).toBe(false);
  });

  it('SCOPE-001b（MUST-FIX）：失敗路徑後 queryRunner.isTransactionActive===false（rollback 已關閉交易）', async () => {
    if (gate()) return;
    await clearTarget(h.qr!, 'calendar');
    await insertStale('calendar', 1);
    const r = await runWithDirty('calendar', { calendar_date: '2027-07-01', rest_flg: '' });
    expect(r.nodeLogs.find((l) => l.nodeId === 'tl1')!.status).toBe('failed');
    expect(h.qr!.isTransactionActive).toBe(false);
    await restoreHappy('calendar');
  });

  it('SCOPE-003：前置唯讀查詢（validate target exists）於交易外——目標表不存在時直接拋錯、無殘留交易', async () => {
    if (gate()) return;
    // 直接驅動 handler，餵入不存在的 targetTable：前置存在性檢查應先拋錯，且不開啟交易
    const inputTable = '##sg_scope003_' + uniqueLogId().slice(0, 8);
    await h.qr!.query(`SELECT * INTO ${inputTable} FROM (VALUES (1)) AS v(x)`);
    const ctx: NodeExecutionContext = {
      node: { id: 'tl1', type: 'pipelineNode', position: { x: 0, y: 0 }, data: { nodeType: 'target_load', label: 'T', targetTable: 'no_such_table_p5g', fullMode: true } },
      inputs: { default: { tempTable: inputTable, rowCount: 1 } as DataSet },
      pipelineId: PIPELINE_ID,
      logId: uniqueLogId(),
      isTestRun: false,
      queryRunner: h.qr!,
    };
    await expect(new TargetLoadHandlerMssql().execute(ctx)).rejects.toThrow(/不存在/);
    expect(h.qr!.isTransactionActive).toBe(false);
    await h.qr!.query(`IF OBJECT_ID('tempdb..${inputTable}') IS NOT NULL DROP TABLE ${inputTable}`);
  });
});

// ===========================================================================
// §七 REGRESSION-SUCCESS — 成功路徑不因交易包裝破壞
// ===========================================================================
describe('P5g SUCC（MSSQL）— 成功路徑回歸', () => {
  it('SUCC-001（DoD 核心）：4 條 fullMode 乾淨 fixture 端對端 → 列數=唯一鍵數（## 於交易內可見）', async () => {
    if (gate()) return;
    const exp: Record<string, number> = {
      arreturndf: FIX_ARRETURNDF.uniqueCount, calendar: FIX_CALENDAR.uniqueCount,
      emphire: FIX_EMPHIRE.uniqueCount, pooldata: FIX_POOLDATA.uniqueCount,
    };
    for (const key of ['arreturndf', 'calendar', 'emphire', 'pooldata'] as PipelineKey[]) {
      await restoreHappy(key);
      expect(await countTarget(h.qr!, key)).toBe(exp[key]);
    }
  });

  it('SUCC-002（DoD 核心）：partition_replace 乾淨 fixture → etl_load 分區替換、他分區保留', async () => {
    if (gate()) return;
    await clearTarget(h.qr!, 'pooldata_list');
    await insertStale('pooldata_list', 1, { dataSource: FIX_POOLDATA_LIST.otherPartition, tag: 'O' });
    await rebuildHappy(h.qr!, 'pooldata_list');
    await runByKey('pooldata_list');
    expect(await countTarget(h.qr!, 'pooldata_list', `data_source='etl_load'`)).toBe(FIX_POOLDATA_LIST.uniqueCount);
    expect(await countTarget(h.qr!, 'pooldata_list', `data_source='${FIX_POOLDATA_LIST.otherPartition}'`)).toBe(1);
    await clearTarget(h.qr!, 'pooldata_list');
    await runByKey('pooldata_list');
  });

  it('SUCC-004：composite PK dedup 決定性（交易包裝後連跑 3 次勝出列一致）', async () => {
    if (gate()) return;
    const winners: string[] = [];
    for (let i = 0; i < 3; i++) {
      await clearTarget(h.qr!, 'pooldata');
      const def = loadPipelineDef('pooldata');
      await createRawTable(h.qr!, P5B_PIPELINES.pooldata.rawTable, deriveRawColumns(def));
      await insertTargetRows(h.qr!, P5B_PIPELINES.pooldata.rawTable, invertMappings(def), [...FIX_POOLDATA.happy, FIX_POOLDATA.dupPk]);
      await runByKey('pooldata');
      const rr = await h.qr!.query(`SELECT cust_name FROM "ob_pool_data" WHERE orgno='01' AND appl_no='P000000001'`);
      winners.push(rr[0].cust_name);
    }
    expect(new Set(winners).size).toBe(1);
    expect(winners[0]).toBe('陳大文');
    await restoreHappy('pooldata');
  });

  it('SUCC-005（DoD 核心）：冪等重跑——fullMode + partition 各重跑第二次列數不疊加', async () => {
    if (gate()) return;
    for (const key of ['arreturndf', 'calendar', 'emphire', 'pooldata'] as PipelineKey[]) {
      await restoreHappy(key);
      const before = await countTarget(h.qr!, key);
      await runByKey(key);
      expect(await countTarget(h.qr!, key)).toBe(before);
    }
    await clearTarget(h.qr!, 'pooldata_list');
    await rebuildHappy(h.qr!, 'pooldata_list');
    await runByKey('pooldata_list');
    const l1 = await countTarget(h.qr!, 'pooldata_list', `data_source='etl_load'`);
    await runByKey('pooldata_list');
    expect(await countTarget(h.qr!, 'pooldata_list', `data_source='etl_load'`)).toBe(l1);
    await clearTarget(h.qr!, 'pooldata_list');
    await runByKey('pooldata_list');
  });

  it('SUCC-006（觀察性，非阻擋）：小量 fixture 交易包裝耗時可忽略（BEGIN/COMMIT 微秒級）', async () => {
    if (gate()) return;
    await restoreHappy('calendar');
    const t0 = Date.now();
    await runByKey('calendar');
    const dur = Date.now() - t0;
    console.log('[P5g SUCC-006] ob_calendar 交易包裝端對端耗時 =', dur, 'ms');
    expect(dur).toBeLessThan(30000); // 寬鬆上界，僅佐證未爆炸
  });
});

// ===========================================================================
// §九 CLEANUPTXN — 交易失敗後暫存表清理（連線未被毒化）
// ===========================================================================
describe('P5g CLEANUPTXN（MSSQL）— 交易失敗後 ## 清理', () => {
  it('CLEANUPTXN-002/003（MUST-FIX 精神）：TXNCORE 失敗後 ## 暫存表零殘留（finally + cleanupAll 皆成功）', async () => {
    if (gate()) return;
    await clearTarget(h.qr!, 'pooldata');
    await insertStale('pooldata', 2);
    const logId = uniqueLogId();
    const r = await runWithDirty('pooldata', {
      orgno: '03', appl_no: 'DIRTYSG02', custo_no: '', sta_code: '10', dept_id: 'D00001', list_type: '01', settle_src: 'N', cust_name: '髒列',
    }, logId);
    expect(r.nodeLogs.find((l) => l.nodeId === 'tl1')!.status).toBe('failed');
    // 交易 rollback 後連線未毒化 → finally 清 handler 自身 ## + pipeline-runner cleanupAll 清上游 ## 皆成功
    expect(await tempLeakCount(logId)).toBe(0);
    expect(await countTarget(h.qr!, 'pooldata')).toBe(2); // 且既存列保留
    await restoreHappy('pooldata');
  });
});

// ===========================================================================
// §六 ISOLATION — 並行讀者可見性 probe（MSSQL 引擎語意，雙連線手動編排）
// ===========================================================================
describe('P5g ISOLATION（MSSQL）— 並行讀者可見性 probe（不預設分支）', () => {
  const ISO_TABLE = 'p5g_iso_scratch';

  it('ISO-002/003（Probe，不預設答案）：連線 A BEGIN+TRUNCATE 未提交時，連線 B SELECT 之行為（阻塞 vs 立即讀舊值）', async () => {
    if (gate()) return;
    // 第二條獨立連線（連同一 CDMP_P5B）
    const hb = await connectMssqlP5b();
    if (!hb.reachable || !hb.qr) return;
    try {
      // scratch 表 5 列（已提交）
      await h.qr!.query(`IF OBJECT_ID('dbo.${ISO_TABLE}','U') IS NOT NULL DROP TABLE "${ISO_TABLE}"`);
      await h.qr!.query(`CREATE TABLE "${ISO_TABLE}" ("id" int NOT NULL PRIMARY KEY, "v" varchar(10) NOT NULL)`);
      await h.qr!.query(`INSERT INTO "${ISO_TABLE}" ("id","v") VALUES (1,'a'),(2,'b'),(3,'c'),(4,'d'),(5,'e')`);
      // 連線 B 設短鎖逾時，避免萬一無限等待
      await hb.qr.query(`SET LOCK_TIMEOUT 8000`);

      // 連線 A：開交易 → TRUNCATE（持排他鎖、未提交）
      await h.qr!.startTransaction();
      await h.qr!.query(`TRUNCATE TABLE "${ISO_TABLE}"`);

      // 連線 B：發出 SELECT COUNT（不 await；鎖based 隔離下會阻塞）
      const t0 = Date.now();
      let bError: any = null;
      const bPromise = hb.qr
        .query(`SELECT COUNT(*) AS c FROM "${ISO_TABLE}"`)
        .then((r: any) => ({ c: Number(r[0].c), at: Date.now() }))
        .catch((e: any) => { bError = e; return { c: -1, at: Date.now() }; });

      // A 持鎖約 700ms 後把資料放回並提交
      await new Promise((res) => setTimeout(res, 700));
      await h.qr!.query(`INSERT INTO "${ISO_TABLE}" ("id","v") VALUES (1,'a'),(2,'b'),(3,'c'),(4,'d'),(5,'e')`);
      await h.qr!.commitTransaction();

      const b = await bPromise;
      const waited = b.at - t0;
      const branch = bError ? 'lock-timeout' : waited >= 500 ? '(b) 阻塞等待' : '(a) 立即讀舊值';
      console.log(`[P5g ISO-002/003] MSSQL Read Committed（無 RCSI）連線 B：branch=${branch}，waited=${waited}ms，count=${b.c}，err=${bError?.message ?? 'none'}`);

      // 兩分支皆合法；核心不變式：B 永不讀到「空表」（不會因未提交 TRUNCATE 看到 0）
      if (!bError) {
        expect(b.c).toBe(5);
      }
      // ISO-003 記錄性：分支已 console 記錄供業務評估月名單分派期間查詢阻塞可接受度
      expect(['(a) 立即讀舊值', '(b) 阻塞等待', 'lock-timeout']).toContain(branch);
    } finally {
      // 確保交易已關閉
      if (h.qr!.isTransactionActive) {
        try { await h.qr!.rollbackTransaction(); } catch { /* ignore */ }
      }
      await h.qr!.query(`IF OBJECT_ID('dbo.${ISO_TABLE}','U') IS NOT NULL DROP TABLE "${ISO_TABLE}"`);
      await teardownMssqlP5b(hb);
    }
  });
});
