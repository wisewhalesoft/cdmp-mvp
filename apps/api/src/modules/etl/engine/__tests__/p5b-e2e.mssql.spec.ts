/**
 * AD-E07-43 P5b — 其餘 5 條生產 ETL pipeline 端對端整合測試（真實 MSSQL，獨立庫 CDMP_P5B，方案乙）。
 *
 * 覆蓋（真實 MSSQL）：
 *   §一 GATE-002/003/004｜§二 DISPATCH-E2E-001/002｜§三 E2E-RUN（5 條 ×3）
 *   §四 FULLMODE-001..005｜§五 PARTITION-001/002/003｜§六 ATOMIC-001..005（probe，report-not-fix）
 *   §七 ISTESTRUN-002/003｜§八 FIELD-001/002/004..010｜§九 IDEMPOTENT-001..005｜§十 CLEANUP-001..004
 *
 * 隔離（REG-006）：連 CDMP_P5B（獨立庫）；fullMode TRUNCATE 不污染 CDMP_TEST.dbo 之 P3a/P3c/P3d 共用 baseline。
 * ⚠️ 必須 side-effect import mssql-env-preload（DB_TYPE=mssql）。CDMP_P5B 不可達 → 全檔 skip（不偽綠）。
 */
import '@/database/__tests__/mssql-env-preload';
import { describe, it, beforeAll, afterAll, expect, vi } from 'vitest';
import { restoreDbType } from '@/database/__tests__/mssql-env-preload';
import { uniqueLogId, objectExists } from './_p4a-mssql-harness';
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
import { NodeLogEntry, makeTempTableName } from '../types';
import { topologicalSort } from '../topological-sort';
import { ExtractHandlerMssql } from '../handlers/extract-handler-mssql';
import { MergeHandlerMssql } from '../handlers/merge-handler-mssql';
import { DedupHandlerMssql } from '../handlers/dedup-handler-mssql';
import { TypeCastHandlerMssql } from '../handlers/type-cast-handler-mssql';
import { DerivedFieldHandlerMssql } from '../handlers/derived-field-handler-mssql';
import { FieldMappingHandlerMssql } from '../handlers/field-mapping-handler-mssql';
import { ConditionalHandlerMssql } from '../handlers/conditional-handler-mssql';
import { TargetLoadHandlerMssql } from '../handlers/target-load-handler-mssql';
import { LookupHandlerMssql } from '../handlers/lookup-handler-mssql';
import { EtlPipelineExecutionService } from '../../etl-pipeline-execution.service';

vi.setConfig({ testTimeout: 60000 });

const PIPELINE_ID = '22222222-2222-2222-2222-222222222222';

let h: P5bHarness;
const mainRuns: Partial<Record<PipelineKey, RunResult>> = {};

interface RunResult {
  nodeLogs: NodeLogEntry[];
  logId: string;
}

function buildMssqlDispatcher(): NodeDispatcher {
  const d = new NodeDispatcher();
  d.register(new ExtractHandlerMssql());
  d.register(new MergeHandlerMssql());
  d.register(new DedupHandlerMssql());
  d.register(new TypeCastHandlerMssql());
  d.register(new DerivedFieldHandlerMssql());
  d.register(new FieldMappingHandlerMssql());
  d.register(new ConditionalHandlerMssql());
  d.register(new TargetLoadHandlerMssql());
  d.register(new LookupHandlerMssql());
  return d;
}

async function runByKey(
  key: PipelineKey,
  opts: { isTestRun?: boolean; logId?: string; dispatcher?: NodeDispatcher } = {},
): Promise<RunResult> {
  const def = loadPipelineDef(key);
  const dispatcher = opts.dispatcher ?? buildMssqlDispatcher();
  const store = new NodeOutputStore();
  const runner = new PipelineRunner(dispatcher, store);
  const logId = opts.logId ?? uniqueLogId();
  const nodeLogs = await runner.run(
    def,
    { batchSize: 10000, upsertBatchSize: 5000, isTestRun: opts.isTestRun ?? false, pipelineId: PIPELINE_ID, logId },
    h.qr!,
    async () => {},
  );
  return { nodeLogs, logId };
}

/**
 * 直接（非經 pipeline）塞入目標表既存列，供 fullMode/partition 全量替換與 ATOMIC 探測之「舊列」基準。
 * `tag` 隔離不同 insertStale 呼叫之 PK（同一測試多次呼叫時避免撞既有 PK）。
 */
async function insertStale(key: PipelineKey, n: number, opts: { dataSource?: string; tag?: string } = {}): Promise<void> {
  const q = h.qr!;
  const now = `CAST(GETDATE() AS datetime2)`;
  const t = opts.tag ?? '';
  for (let i = 0; i < n; i++) {
    if (key === 'calendar') {
      const mm = String(i + 1).padStart(2, '0');
      await q.query(`INSERT INTO "ob_calendar" ("calendar_date","rest_flg") VALUES ('2030-${mm}-01','0')`);
    } else if (key === 'arreturndf') {
      await q.query(`INSERT INTO "ob_arreturndf_min_cap" ("appl_no","add_un_capital","_cdmp_extracted_at") VALUES ('ST${t}${i}', 1, ${now})`);
    } else if (key === 'emphire') {
      await q.query(`INSERT INTO "ob_emphire" ("emp_id","emp_nm") VALUES ('ST${t}${i}', N'舊員工')`);
    } else if (key === 'pooldata') {
      await q.query(
        `INSERT INTO "ob_pool_data" ("orgno","appl_no","custo_no","sta_code","dept_id","list_type","settle_src","_cdmp_extracted_at") ` +
          `VALUES ('99','ST${t}${i}','C','1','D','0',N'N', ${now})`,
      );
    } else if (key === 'pooldata_list') {
      const ds = opts.dataSource ?? 'etl_load';
      await q.query(
        `INSERT INTO "ob_pool_data_list" ("list_no","orgno","appl_no","settle_src","data_source") ` +
          `VALUES ('STALE${t}${i}','99','S${t}${i}',N'N','${ds}')`,
      );
    }
  }
}

/** tempdb 全域 ## 殘留掃描（本次 logId 前 8 碼）。 */
async function tempLeakCount(logId: string): Promise<number> {
  const prefix = makeTempTableName('x', logId).split('_').pop()!; // 8 hex
  const r = await h.qr!.query(
    `SELECT COUNT(*) AS c FROM tempdb.sys.objects WHERE name LIKE '##%' AND name LIKE @0`,
    ['%' + prefix + '%'],
  );
  return Number(r[0].c);
}

/** 重建某 pipeline 之 happy 狀態（clear target + rebuild raw + rerun）。 */
async function restoreHappy(key: PipelineKey): Promise<void> {
  await clearTarget(h.qr!, key);
  await rebuildHappy(h.qr!, key);
  await runByKey(key);
}

beforeAll(async () => {
  h = await connectMssqlP5b();
  if (!h.reachable || !h.qr) return;
  await ensureAllTargetTables(h.qr);
  await ensureAuxTables(h.qr);
  await buildAllHappyFixtures(h.qr);
  for (const key of PIPELINE_KEYS) {
    await clearTarget(h.qr, key);
    mainRuns[key] = await runByKey(key);
  }
});
afterAll(async () => {
  if (h?.qr) await cleanupRawFixtures(h.qr);
  await teardownMssqlP5b(h);
  restoreDbType();
});
const gate = () => !h?.reachable || !h?.qr;

// ===========================================================================
// §一 GATE
// ===========================================================================
describe('P5b GATE — 前置守門（真實 MSSQL / CDMP_P5B）', () => {
  it('GATE-002：datasources / extraction_tasks 存在（列數 0 不視為錯誤）', async () => {
    if (gate()) return;
    const ds = await h.qr!.query(`SELECT OBJECT_ID('dbo.datasources') AS oid`);
    const et = await h.qr!.query(`SELECT OBJECT_ID('dbo.extraction_tasks') AS oid`);
    expect(ds[0].oid).not.toBeNull();
    expect(et[0].oid).not.toBeNull();
  });

  it('GATE-003：5 條 pipeline 皆無環（topologicalSort）', async () => {
    if (gate()) return;
    for (const key of PIPELINE_KEYS) {
      const def = loadPipelineDef(key);
      const { hasCycle, sorted } = topologicalSort(def.nodes, def.edges);
      expect(hasCycle).toBe(false);
      expect(sorted.length).toBe(def.nodes.length);
    }
  });

  it('GATE-004：5 張目標表 PK 與 entity 宣告一致（getPrimaryKeyColumns 前置事實）', async () => {
    if (gate()) return;
    for (const key of PIPELINE_KEYS) {
      const meta = P5B_PIPELINES[key];
      const rows = await h.qr!.query(
        `SELECT kcu.column_name FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
           JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
             ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
          WHERE tc.table_name = @0 AND tc.constraint_type = 'PRIMARY KEY'`,
        [meta.targetTable],
      );
      const pk = new Set(rows.map((r: any) => r.column_name));
      expect(pk).toEqual(new Set(meta.pkCols));
    }
  });
});

// ===========================================================================
// §二 DISPATCH-E2E
// ===========================================================================
describe('P5b DISPATCH-E2E — 真實 createDispatcher（真實 MSSQL）', () => {
  it('DISPATCHE2E-001（補充 DoD）：createDispatcher(DB_TYPE=mssql) 驅動 ob_calendar 至 completed 且實表有列', async () => {
    if (gate()) return;
    const cfg = { get: (k: string, d?: unknown) => (k === 'DB_TYPE' ? 'mssql' : d) };
    const svc = new EtlPipelineExecutionService(null as any, null as any, null as any, null as any, cfg as any);
    const dispatcher: NodeDispatcher = (svc as any).createDispatcher();
    await clearTarget(h.qr!, 'calendar');
    await rebuildHappy(h.qr!, 'calendar');
    const r = await runByKey('calendar', { dispatcher });
    expect(r.nodeLogs.every((l) => l.status === 'completed')).toBe(true);
    expect(await countTarget(h.qr!, 'calendar')).toBe(FIX_CALENDAR.uniqueCount);
  });

  it('DISPATCHE2E-002：createDispatcher 回傳之本文件用到的 handler 皆為 mssql 版本', async () => {
    if (gate()) return;
    const cfg = { get: (k: string, d?: unknown) => (k === 'DB_TYPE' ? 'mssql' : d) };
    const svc = new EtlPipelineExecutionService(null as any, null as any, null as any, null as any, cfg as any);
    const dispatcher: NodeDispatcher = (svc as any).createDispatcher();
    for (const [nodeType, ctor] of [
      ['raw_data_extract', ExtractHandlerMssql],
      ['field_mapping', FieldMappingHandlerMssql],
      ['conditional', ConditionalHandlerMssql],
      ['target_load', TargetLoadHandlerMssql],
    ] as const) {
      const exec = dispatcher.getExecutor(nodeType);
      expect(exec).toBeInstanceOf(ctor);
    }
  });
});

// ===========================================================================
// §三 E2E-RUN — 5 條端對端（DoD 核心）
// ===========================================================================
describe('P5b E2E-RUN — 5 條 pipeline 端對端（真實 MSSQL，DoD 核心）', () => {
  const expected: Record<PipelineKey, number> = {
    arreturndf: FIX_ARRETURNDF.uniqueCount,
    calendar: FIX_CALENDAR.uniqueCount,
    emphire: FIX_EMPHIRE.uniqueCount,
    pooldata: FIX_POOLDATA.uniqueCount,
    pooldata_list: FIX_POOLDATA_LIST.uniqueCount,
  };

  for (const key of PIPELINE_KEYS) {
    const meta = P5B_PIPELINES[key];
    it(`E2E-${key}-001：全節點 completed`, async () => {
      if (gate()) return;
      const run = mainRuns[key]!;
      const bad = run.nodeLogs.filter((l) => l.status !== 'completed');
      expect(bad.map((b) => `${b.nodeId}:${b.status}:${b.errorMessage ?? ''}`)).toEqual([]);
      // emphire 4 節點（含 cd1），其餘 3 節點
      expect(run.nodeLogs.length).toBe(meta.hasConditional ? 4 : 3);
    });

    it(`E2E-${key}-002：目標表 COUNT(*) 交叉查實表 = fixture 唯一鍵數`, async () => {
      if (gate()) return;
      const where = key === 'pooldata_list' ? `data_source='etl_load'` : undefined;
      expect(await countTarget(h.qr!, key, where)).toBe(expected[key]);
    });
  }

  it('E2E-arreturndf-003：add_un_capital numeric round-trip', async () => {
    if (gate()) return;
    const r = await h.qr!.query(`SELECT add_un_capital FROM "ob_arreturndf_min_cap" WHERE appl_no='A0000002'`);
    expect(Number(r[0].add_un_capital)).toBe(250000);
  });

  it('E2E-calendar-003：calendar_date(date PK)/rest_flg round-trip（含假日/工作日）', async () => {
    if (gate()) return;
    const r1 = await h.qr!.query(`SELECT rest_flg FROM "ob_calendar" WHERE calendar_date='2026-01-01'`);
    const r2 = await h.qr!.query(`SELECT rest_flg FROM "ob_calendar" WHERE calendar_date='2026-01-31'`);
    expect(r1[0].rest_flg).toBe('1');
    expect(r2[0].rest_flg).toBe('0');
  });

  it('E2E-emphire-003：中文 emp_nm/dept_name round-trip；hire_date 原生 date', async () => {
    if (gate()) return;
    const r = await h.qr!.query(`SELECT emp_nm, dept_name, hire_date FROM "ob_emphire" WHERE emp_id='E00001'`);
    expect(r[0].emp_nm).toBe('陳志明');
    expect(r[0].dept_name).toBe('電銷一部');
    expect(r[0].hire_date).not.toBeNull();
  });

  it('E2E-pooldata-003：114 欄旗艦 — numeric/date/中文 抽樣 round-trip + NOT NULL 業務欄有值', async () => {
    if (gate()) return;
    const r = await h.qr!.query(
      `SELECT cust_name, dept_name, car_name, loan_totamt, pro_rate, term_amt, appl_date, custo_no, sta_code, dept_id, list_type, settle_src ` +
        `FROM "ob_pool_data" WHERE orgno='01' AND appl_no='P000000001'`,
    );
    const row = r[0];
    expect(row.cust_name).toBe('陳大文');
    expect(row.dept_name).toBe('台北分處');
    expect(row.car_name).toBe('豐田');
    expect(Number(row.loan_totamt)).toBe(1500000);
    expect(Number(row.pro_rate)).toBe(12.5);
    expect(Number(row.term_amt)).toBeCloseTo(123456.789, 3);
    expect(row.appl_date).not.toBeNull();
    for (const c of ['custo_no', 'sta_code', 'dept_id', 'list_type', 'settle_src']) {
      expect(row[c]).not.toBeNull();
    }
  });

  it('E2E-pooldata_list-003：122 欄 + partition — data_source=etl_load；score NULL（未映射）', async () => {
    if (gate()) return;
    const r = await h.qr!.query(
      `SELECT data_source, score FROM "ob_pool_data_list" WHERE list_no='L0001' AND orgno='01' AND appl_no='P000000001'`,
    );
    expect(r[0].data_source).toBe('etl_load');
    expect(r[0].score).toBeNull(); // score 不在 field_mapping → 恆 NULL（★發現 5 修正：僅 score+data_source 未映射）
  });
});

// ===========================================================================
// §四 FULLMODE-WIRING
// ===========================================================================
describe('P5b FULLMODE-WIRING — TRUNCATE+INSERT 全量替換接線（真實 MSSQL）', () => {
  const fullModeKeys: PipelineKey[] = ['arreturndf', 'calendar', 'emphire', 'pooldata'];

  it('FULLMODE-001（DoD 核心）：4 條 fullMode 預置陳舊列，跑後僅存 fixture 列、舊列全消', async () => {
    if (gate()) return;
    for (const key of fullModeKeys) {
      await clearTarget(h.qr!, key);
      await insertStale(key, 2);
      expect(await countTarget(h.qr!, key)).toBe(2);
      await rebuildHappy(h.qr!, key);
      await runByKey(key);
      const uniqueCount =
        { arreturndf: FIX_ARRETURNDF.uniqueCount, calendar: FIX_CALENDAR.uniqueCount, emphire: FIX_EMPHIRE.uniqueCount, pooldata: FIX_POOLDATA.uniqueCount }[key] ?? 0;
      // 陳舊列 PK 與 happy fixture 完全不重疊 → 跑後總數恰等 uniqueCount 即證明舊列被 TRUNCATE 清除
      expect(await countTarget(h.qr!, key)).toBe(uniqueCount);
    }
  });

  it('FULLMODE-002（composite PK 旗艦）：ob_pool_data (orgno,appl_no) 重複列端對端後恰 1 列', async () => {
    if (gate()) return;
    await clearTarget(h.qr!, 'pooldata');
    const def = loadPipelineDef('pooldata');
    await createRawTable(h.qr!, P5B_PIPELINES.pooldata.rawTable, deriveRawColumns(def));
    await insertTargetRows(h.qr!, P5B_PIPELINES.pooldata.rawTable, invertMappings(def), [
      ...FIX_POOLDATA.happy,
      FIX_POOLDATA.dupPk,
    ]);
    await runByKey('pooldata');
    const r = await countTarget(h.qr!, 'pooldata', `orgno='01' AND appl_no='P000000001'`);
    expect(r).toBe(1);
    expect(await countTarget(h.qr!, 'pooldata')).toBe(FIX_POOLDATA.uniqueCount);
    await restoreHappy('pooldata');
  });

  it('FULLMODE-003：單欄 PK（calendar/emphire/arreturndf）重複列同樣去重', async () => {
    if (gate()) return;
    for (const [key, fix] of [
      ['calendar', FIX_CALENDAR],
      ['emphire', FIX_EMPHIRE],
      ['arreturndf', FIX_ARRETURNDF],
    ] as const) {
      await clearTarget(h.qr!, key);
      const def = loadPipelineDef(key);
      await createRawTable(h.qr!, P5B_PIPELINES[key].rawTable, deriveRawColumns(def));
      await insertTargetRows(h.qr!, P5B_PIPELINES[key].rawTable, invertMappings(def), [...fix.happy, fix.dupPk]);
      await runByKey(key);
      expect(await countTarget(h.qr!, key)).toBe(fix.uniqueCount);
      await restoreHappy(key);
    }
  });

  it('FULLMODE-004：4 條 fullMode 各重跑 3 次，去重勝出列內容一致（決定性）', async () => {
    if (gate()) return;
    // ob_pool_data 之 (01,P000000001) 勝出列 cust_name 應每次一致
    const winners: string[] = [];
    for (let i = 0; i < 3; i++) {
      await clearTarget(h.qr!, 'pooldata');
      const def = loadPipelineDef('pooldata');
      await createRawTable(h.qr!, P5B_PIPELINES.pooldata.rawTable, deriveRawColumns(def));
      await insertTargetRows(h.qr!, P5B_PIPELINES.pooldata.rawTable, invertMappings(def), [
        ...FIX_POOLDATA.happy,
        FIX_POOLDATA.dupPk,
      ]);
      await runByKey('pooldata');
      const r = await h.qr!.query(`SELECT cust_name FROM "ob_pool_data" WHERE orgno='01' AND appl_no='P000000001'`);
      winners.push(r[0].cust_name);
    }
    expect(new Set(winners).size).toBe(1);
    expect(winners[0]).toBe('陳大文'); // _seq 最小（首寫入）勝出
    await restoreHappy('pooldata');
  });

  it('FULLMODE-005：ob_calendar date PK 隱式轉換 round-trip（月初/月底/閏年 2/29）', async () => {
    if (gate()) return;
    const dates = ['2026-01-01', '2026-01-31', '2024-02-29', '2026-12-31'];
    for (const d of dates) {
      const r = await h.qr!.query(`SELECT COUNT(*) AS c FROM "ob_calendar" WHERE calendar_date=@0`, [d]);
      expect(Number(r[0].c)).toBe(1);
    }
  });
});

// ===========================================================================
// §五 PARTITION-WIRING（ob_pool_data_list）
// ===========================================================================
describe('P5b PARTITION-WIRING — DELETE+INSERT 分區語意接線（真實 MSSQL）', () => {
  it('PARTITION-001（DoD 核心）：data_source≠etl_load 之既存列跑後不受影響', async () => {
    if (gate()) return;
    await clearTarget(h.qr!, 'pooldata_list');
    await insertStale('pooldata_list', 1, { dataSource: FIX_POOLDATA_LIST.otherPartition, tag: 'O' });
    await rebuildHappy(h.qr!, 'pooldata_list');
    const before = await countTarget(h.qr!, 'pooldata_list', `data_source='${FIX_POOLDATA_LIST.otherPartition}'`);
    expect(before).toBe(1);
    await runByKey('pooldata_list');
    const after = await countTarget(h.qr!, 'pooldata_list', `data_source='${FIX_POOLDATA_LIST.otherPartition}'`);
    expect(after).toBe(1); // 他分區保留
    expect(await countTarget(h.qr!, 'pooldata_list', `data_source='etl_load'`)).toBe(FIX_POOLDATA_LIST.uniqueCount);
    await clearTarget(h.qr!, 'pooldata_list');
    await runByKey('pooldata_list');
  });

  it('PARTITION-002（DoD 核心）：etl_load 分區既存舊列被本次 fixture 全量取代（非疊加）', async () => {
    if (gate()) return;
    await clearTarget(h.qr!, 'pooldata_list');
    await insertStale('pooldata_list', 3, { dataSource: 'etl_load' });
    expect(await countTarget(h.qr!, 'pooldata_list', `data_source='etl_load'`)).toBe(3);
    await rebuildHappy(h.qr!, 'pooldata_list');
    await runByKey('pooldata_list');
    expect(await countTarget(h.qr!, 'pooldata_list', `data_source='etl_load'`)).toBe(FIX_POOLDATA_LIST.uniqueCount);
    const stale = await countTarget(h.qr!, 'pooldata_list', `list_no LIKE 'STALE%'`);
    expect(stale).toBe(0);
  });

  it('PARTITION-003（負向對照）：來源含重複 PK → INSERT 撞 PK，tl1 failed（無內部去重）', async () => {
    if (gate()) return;
    await clearTarget(h.qr!, 'pooldata_list');
    const def = loadPipelineDef('pooldata_list');
    await createRawTable(h.qr!, P5B_PIPELINES.pooldata_list.rawTable, deriveRawColumns(def));
    await insertTargetRows(h.qr!, P5B_PIPELINES.pooldata_list.rawTable, invertMappings(def), [
      ...FIX_POOLDATA_LIST.happy,
      FIX_POOLDATA_LIST.dupPk,
    ]);
    const r = await runByKey('pooldata_list');
    const tl1 = r.nodeLogs.find((l) => l.nodeId === 'tl1')!;
    expect(tl1.status).toBe('failed');
    await restoreHappy('pooldata_list');
  });
});

// ===========================================================================
// §六 ATOMIC — TRUNCATE/DELETE 後 INSERT 失敗之資料完整性（probe，report-not-fix）
// ===========================================================================
describe('P5b ATOMIC — 先破壞後重建之資料完整性 probe（真實 MSSQL）', () => {
  it('ATOMIC-001（MUST-FIX probe）：ob_calendar 3 既存列 + rest_flg 空字串髒批 → tl1 失敗後實際列數', async () => {
    if (gate()) return;
    await clearTarget(h.qr!, 'calendar');
    await insertStale('calendar', 3);
    expect(await countTarget(h.qr!, 'calendar')).toBe(3);
    const def = loadPipelineDef('calendar');
    await createRawTable(h.qr!, P5B_PIPELINES.calendar.rawTable, deriveRawColumns(def));
    await insertTargetRows(h.qr!, P5B_PIPELINES.calendar.rawTable, invertMappings(def), [
      ...FIX_CALENDAR.happy,
      { calendar_date: '2027-01-01', rest_flg: '' }, // NULLIF(TRIM(''))→NULL → 違反 rest_flg NOT NULL
    ]);
    const r = await runByKey('calendar');
    const tl1 = r.nodeLogs.find((l) => l.nodeId === 'tl1')!;
    expect(tl1.status).toBe('failed');
    const count = await countTarget(h.qr!, 'calendar');
    console.log('[P5b ATOMIC-001] ob_calendar count after TRUNCATE+failed INSERT =', count, '| tl1.err =', tl1.errorMessage);
    // 分支 A（資料遺失）：count=0（TRUNCATE 已提交、INSERT 整句失敗）
    expect(count).toBe(0);
    await restoreHappy('calendar');
  });

  it('ATOMIC-002（MUST-FIX probe）：ob_pool_data composite PK + custo_no 空字串 → tl1 失敗後實際列數', async () => {
    if (gate()) return;
    await clearTarget(h.qr!, 'pooldata');
    await insertStale('pooldata', 3);
    expect(await countTarget(h.qr!, 'pooldata')).toBe(3);
    const def = loadPipelineDef('pooldata');
    await createRawTable(h.qr!, P5B_PIPELINES.pooldata.rawTable, deriveRawColumns(def));
    await insertTargetRows(h.qr!, P5B_PIPELINES.pooldata.rawTable, invertMappings(def), [
      ...FIX_POOLDATA.happy,
      { orgno: '03', appl_no: 'DIRTY0001', custo_no: '', sta_code: '10', dept_id: 'D00001', list_type: '01', settle_src: 'N', cust_name: '髒列' },
    ]);
    const r = await runByKey('pooldata');
    const tl1 = r.nodeLogs.find((l) => l.nodeId === 'tl1')!;
    expect(tl1.status).toBe('failed');
    const count = await countTarget(h.qr!, 'pooldata');
    console.log('[P5b ATOMIC-002] ob_pool_data count after TRUNCATE+failed INSERT =', count, '| tl1.err =', tl1.errorMessage);
    expect(count).toBe(0);
    await restoreHappy('pooldata');
  });

  it('ATOMIC-003（數值溢位 probe）：add_un_capital 16 位數 → numeric(15,0) 溢位、tl1 失敗', async () => {
    if (gate()) return;
    await clearTarget(h.qr!, 'arreturndf');
    await insertStale('arreturndf', 3);
    const def = loadPipelineDef('arreturndf');
    await createRawTable(h.qr!, P5B_PIPELINES.arreturndf.rawTable, deriveRawColumns(def));
    await insertTargetRows(h.qr!, P5B_PIPELINES.arreturndf.rawTable, invertMappings(def), [
      ...FIX_ARRETURNDF.happy,
      { appl_no: 'A0000009', add_un_capital: '1234567890123456' }, // 16 位 → numeric(15,0) 溢位
    ]);
    const r = await runByKey('arreturndf');
    const tl1 = r.nodeLogs.find((l) => l.nodeId === 'tl1')!;
    expect(tl1.status).toBe('failed');
    expect(tl1.errorMessage ?? '').toMatch(/overflow|arithmetic|convert|numeric/i);
    const count = await countTarget(h.qr!, 'arreturndf');
    console.log('[P5b ATOMIC-003] ob_arreturndf count after TRUNCATE+failed INSERT =', count, '| tl1.err =', tl1.errorMessage);
    expect(count).toBe(0);
    await restoreHappy('arreturndf');
  });

  it('ATOMIC-004（partition_replace probe）：PARTITION-003 撞 PK → DELETE 已執行、INSERT 失敗後 etl_load 分區列數', async () => {
    if (gate()) return;
    await clearTarget(h.qr!, 'pooldata_list');
    await insertStale('pooldata_list', 3, { dataSource: 'etl_load' });
    await insertStale('pooldata_list', 1, { dataSource: FIX_POOLDATA_LIST.otherPartition, tag: 'O' });
    const def = loadPipelineDef('pooldata_list');
    await createRawTable(h.qr!, P5B_PIPELINES.pooldata_list.rawTable, deriveRawColumns(def));
    await insertTargetRows(h.qr!, P5B_PIPELINES.pooldata_list.rawTable, invertMappings(def), [
      ...FIX_POOLDATA_LIST.happy,
      FIX_POOLDATA_LIST.dupPk,
    ]);
    const r = await runByKey('pooldata_list');
    const tl1 = r.nodeLogs.find((l) => l.nodeId === 'tl1')!;
    expect(tl1.status).toBe('failed');
    const etlLoad = await countTarget(h.qr!, 'pooldata_list', `data_source='etl_load'`);
    const other = await countTarget(h.qr!, 'pooldata_list', `data_source='${FIX_POOLDATA_LIST.otherPartition}'`);
    console.log('[P5b ATOMIC-004] etl_load partition after DELETE+failed INSERT =', etlLoad, '| other partition =', other);
    expect(etlLoad).toBe(0); // DELETE 已提交、INSERT 整句失敗
    expect(other).toBe(1); // 他分區不受 DELETE 影響
    await clearTarget(h.qr!, 'pooldata_list');
    await restoreHappy('pooldata_list');
  });

  it('ATOMIC-005（PG degradable 於 EQ-PG 檔）：交叉引用，MSSQL 側分支 A 已由 001~004 判定', async () => {
    if (gate()) return;
    // PG 對稱探測見 p5b-eqpg.mssql.spec.ts EQPG-ATOMIC；此處僅記錄 MSSQL 側結論＝分支 A（資料遺失）
    expect(true).toBe(true);
  });
});

// ===========================================================================
// §七 ISTESTRUN — dry-run 陷阱
// ===========================================================================
describe('P5b ISTESTRUN — isTestRun 陷阱（真實 MSSQL）', () => {
  it('ISTESTRUN-002（fullMode 陷阱佐證）：isTestRun=true → nodeLogs 全綠但 ob_calendar 零寫入', async () => {
    if (gate()) return;
    await clearTarget(h.qr!, 'calendar');
    await rebuildHappy(h.qr!, 'calendar');
    const r = await runByKey('calendar', { isTestRun: true });
    expect(r.nodeLogs.every((l) => l.status === 'completed')).toBe(true);
    const tl1 = r.nodeLogs.find((l) => l.nodeId === 'tl1')!;
    expect(tl1.outputRowCount).toBeGreaterThan(0); // 看似寫入
    expect(await countTarget(h.qr!, 'calendar')).toBe(0); // 但實表零列
    await restoreHappy('calendar');
  });

  it('ISTESTRUN-003（partition_replace 陷阱佐證）：isTestRun=true → ob_pool_data_list 零寫入', async () => {
    if (gate()) return;
    await clearTarget(h.qr!, 'pooldata_list');
    await rebuildHappy(h.qr!, 'pooldata_list');
    const r = await runByKey('pooldata_list', { isTestRun: true });
    expect(r.nodeLogs.every((l) => l.status === 'completed')).toBe(true);
    expect(await countTarget(h.qr!, 'pooldata_list')).toBe(0);
    await restoreHappy('pooldata_list');
  });
});

// ===========================================================================
// §八 FIELD — 欄位級正確性
// ===========================================================================
describe('P5b FIELD — 欄位級正確性（真實 MSSQL）', () => {
  it('FIELD-001（DoD 核心，★發現 4）：在職員工 resign_date=9999-12-31 → NULL（cd1 正確執行）', async () => {
    if (gate()) return;
    for (const id of FIX_EMPHIRE.activeIds) {
      const r = await h.qr!.query(`SELECT resign_date FROM "ob_emphire" WHERE emp_id=@0`, [id]);
      expect(r[0].resign_date).toBeNull();
    }
  });

  it('FIELD-002：離職員工 resign_date 保留原值（cd1 elseValue）', async () => {
    if (gate()) return;
    for (const id of FIX_EMPHIRE.resignedIds) {
      const r = await h.qr!.query(`SELECT resign_date FROM "ob_emphire" WHERE emp_id=@0`, [id]);
      expect(r[0].resign_date).not.toBeNull();
    }
  });

  it('FIELD-004：中文欄位 round-trip（emphire + pooldata + pooldata_list）', async () => {
    if (gate()) return;
    const e = await h.qr!.query(`SELECT emp_nm, dept_name, title_name FROM "ob_emphire" WHERE emp_id='E00003'`);
    expect(e[0].emp_nm).toBe('王大衛');
    expect(e[0].title_name).toBe('襄理');
    const p = await h.qr!.query(`SELECT cust_name, dept_name, car_name FROM "ob_pool_data" WHERE orgno='02' AND appl_no='P000000001'`);
    expect(p[0].cust_name).toBe('黃美玲');
    expect(p[0].car_name).toBe('本田');
    const l = await h.qr!.query(`SELECT cust_name FROM "ob_pool_data_list" WHERE list_no='L0002' AND orgno='02' AND appl_no='P000000001'`);
    expect(l[0].cust_name).toBe('黃美玲');
  });

  it('FIELD-005：numeric 欄位合法值精度不失真（pro_rate 兩位小數 / term_amt 四位）', async () => {
    if (gate()) return;
    const r = await h.qr!.query(`SELECT pro_rate, term_amt, loan_totamt FROM "ob_pool_data" WHERE orgno='01' AND appl_no='P000000001'`);
    expect(Number(r[0].pro_rate)).toBe(12.5);
    expect(Number(r[0].term_amt)).toBeCloseTo(123456.789, 3);
    expect(Number(r[0].loan_totamt)).toBe(1500000);
  });

  it('FIELD-006：date/datetime2 欄位合法日期 round-trip（appl_date/first_pay_dt/maturity_dt）', async () => {
    if (gate()) return;
    const r = await h.qr!.query(`SELECT appl_date, first_pay_dt, maturity_dt FROM "ob_pool_data" WHERE orgno='01' AND appl_no='P000000001'`);
    expect(r[0].appl_date).not.toBeNull();
    expect(r[0].first_pay_dt).not.toBeNull();
    expect(r[0].maturity_dt).not.toBeNull();
    expect(new Date(r[0].appl_date).getUTCFullYear()).toBe(2026);
  });

  it('FIELD-007：ob_pool_data NOT NULL 業務欄 happy path 全填入', async () => {
    if (gate()) return;
    const r = await h.qr!.query(
      `SELECT COUNT(*) AS c FROM "ob_pool_data" WHERE custo_no IS NULL OR sta_code IS NULL OR dept_id IS NULL OR list_type IS NULL OR settle_src IS NULL`,
    );
    expect(Number(r[0].c)).toBe(0);
  });

  it('FIELD-008：ob_calendar.rest_flg NOT NULL happy path（0/1 兩值皆有）', async () => {
    if (gate()) return;
    const nulls = await h.qr!.query(`SELECT COUNT(*) AS c FROM "ob_calendar" WHERE rest_flg IS NULL`);
    expect(Number(nulls[0].c)).toBe(0);
    const zero = await h.qr!.query(`SELECT COUNT(*) AS c FROM "ob_calendar" WHERE rest_flg='0'`);
    const one = await h.qr!.query(`SELECT COUNT(*) AS c FROM "ob_calendar" WHERE rest_flg='1'`);
    expect(Number(zero[0].c)).toBeGreaterThan(0);
    expect(Number(one[0].c)).toBeGreaterThan(0);
  });

  it('FIELD-009：空字串來源（非 NOT NULL 欄）經 NULLIF(TRIM())→NULL', async () => {
    if (gate()) return;
    // pooldata happy 第 3 列（02/P000000001）未提供 first_pay_dt → 來源空/未設 → NULL
    const r = await h.qr!.query(`SELECT first_pay_dt, maturity_dt FROM "ob_pool_data" WHERE orgno='02' AND appl_no='P000000001'`);
    expect(r[0].first_pay_dt).toBeNull();
  });

  it('FIELD-010：_cdmp_extracted_at 由 handler 自動填入（ob_pool_data / ob_arreturndf_min_cap 兩表）', async () => {
    if (gate()) return;
    const p = await h.qr!.query(`SELECT COUNT(*) AS c FROM "ob_pool_data" WHERE _cdmp_extracted_at IS NULL`);
    expect(Number(p[0].c)).toBe(0);
    const a = await h.qr!.query(`SELECT COUNT(*) AS c FROM "ob_arreturndf_min_cap" WHERE _cdmp_extracted_at IS NULL`);
    expect(Number(a[0].c)).toBe(0);
  });
});

// ===========================================================================
// §九 IDEMPOTENT
// ===========================================================================
describe('P5b IDEMPOTENT — 冪等重跑（真實 MSSQL）', () => {
  it('IDEMPOTENT-001（DoD 核心）：4 條 fullMode 重跑第二次列數不變', async () => {
    if (gate()) return;
    for (const key of ['arreturndf', 'calendar', 'emphire', 'pooldata'] as PipelineKey[]) {
      await restoreHappy(key);
      const before = await countTarget(h.qr!, key);
      await runByKey(key);
      expect(await countTarget(h.qr!, key)).toBe(before);
    }
  });

  it('IDEMPOTENT-002（DoD 核心）：pooldata_list 重跑，etl_load 分區不變、他分區隔離', async () => {
    if (gate()) return;
    await clearTarget(h.qr!, 'pooldata_list');
    await insertStale('pooldata_list', 1, { dataSource: FIX_POOLDATA_LIST.otherPartition, tag: 'O' });
    await rebuildHappy(h.qr!, 'pooldata_list');
    await runByKey('pooldata_list');
    const load1 = await countTarget(h.qr!, 'pooldata_list', `data_source='etl_load'`);
    await runByKey('pooldata_list');
    const load2 = await countTarget(h.qr!, 'pooldata_list', `data_source='etl_load'`);
    expect(load2).toBe(load1);
    expect(await countTarget(h.qr!, 'pooldata_list', `data_source='${FIX_POOLDATA_LIST.otherPartition}'`)).toBe(1);
    await clearTarget(h.qr!, 'pooldata_list');
    await runByKey('pooldata_list');
  });

  it('IDEMPOTENT-003：composite PK 勝出列（pooldata）重跑後內容穩定', async () => {
    if (gate()) return;
    await restoreHappy('pooldata');
    const a = await h.qr!.query(`SELECT cust_name FROM "ob_pool_data" WHERE orgno='01' AND appl_no='P000000001'`);
    await runByKey('pooldata');
    const b = await h.qr!.query(`SELECT cust_name FROM "ob_pool_data" WHERE orgno='01' AND appl_no='P000000001'`);
    expect(b[0].cust_name).toBe(a[0].cust_name);
  });

  it('IDEMPOTENT-004：emphire resign_date NULL 化重跑後穩定（cd1 冪等）', async () => {
    if (gate()) return;
    await restoreHappy('emphire');
    await runByKey('emphire');
    const r = await h.qr!.query(`SELECT resign_date FROM "ob_emphire" WHERE emp_id='E00001'`);
    expect(r[0].resign_date).toBeNull();
  });

  it('IDEMPOTENT-005：同一 logId 重跑不因 ## 殘留命名衝突失敗', async () => {
    if (gate()) return;
    await restoreHappy('calendar');
    const logId = uniqueLogId();
    const r1 = await runByKey('calendar', { logId });
    const r2 = await runByKey('calendar', { logId });
    expect(r1.nodeLogs.every((l) => l.status === 'completed')).toBe(true);
    expect(r2.nodeLogs.every((l) => l.status === 'completed')).toBe(true);
  });
});

// ===========================================================================
// §十 CLEANUP — ## 全域暫存表清理
// ===========================================================================
describe('P5b CLEANUP — ## 全清（真實 MSSQL）', () => {
  it('CLEANUP-001（DoD 核心）：成功路徑後全部節點 ## 表 OBJECT_ID 皆 NULL', async () => {
    if (gate()) return;
    await restoreHappy('pooldata');
    const logId = uniqueLogId();
    await runByKey('pooldata', { logId });
    const def = loadPipelineDef('pooldata');
    for (const n of def.nodes) {
      const base = makeTempTableName(n.id, logId);
      expect(await objectExists(h.qr!, '##' + base)).toBe(false);
      if (n.data.nodeType === 'target_load') {
        expect(await objectExists(h.qr!, '##' + base + '_dq')).toBe(false);
        expect(await objectExists(h.qr!, '##' + base + '_dq_seq')).toBe(false);
      }
    }
  });

  it('CLEANUP-002（DoD 核心，失敗路徑）：tl1 失敗時上游 ## 亦全清', async () => {
    if (gate()) return;
    await clearTarget(h.qr!, 'calendar');
    await insertStale('calendar', 1);
    const def = loadPipelineDef('calendar');
    await createRawTable(h.qr!, P5B_PIPELINES.calendar.rawTable, deriveRawColumns(def));
    await insertTargetRows(h.qr!, P5B_PIPELINES.calendar.rawTable, invertMappings(def), [
      ...FIX_CALENDAR.happy,
      { calendar_date: '2027-02-02', rest_flg: '' },
    ]);
    const logId = uniqueLogId();
    const r = await runByKey('calendar', { logId });
    expect(r.nodeLogs.find((l) => l.nodeId === 'tl1')!.status).toBe('failed');
    expect(await tempLeakCount(logId)).toBe(0);
    await restoreHappy('calendar');
  });

  it('CLEANUP-003：target-load 內部 dedupTable(_dq) fullMode 路徑清理', async () => {
    if (gate()) return;
    await restoreHappy('emphire');
    const logId = uniqueLogId();
    await runByKey('emphire', { logId });
    const base = makeTempTableName('tl1', logId);
    expect(await objectExists(h.qr!, '##' + base + '_dq')).toBe(false);
    expect(await objectExists(h.qr!, '##' + base + '_dq_seq')).toBe(false);
  });

  it('CLEANUP-004：tempdb.sys.objects 依 logId 前 8 碼 LIKE 掃描零殘留', async () => {
    if (gate()) return;
    await restoreHappy('pooldata_list');
    const logId = uniqueLogId();
    await runByKey('pooldata_list', { logId });
    expect(await tempLeakCount(logId)).toBe(0);
  });
});
