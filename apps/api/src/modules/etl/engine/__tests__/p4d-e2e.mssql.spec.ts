/**
 * AD-E07-41 P4d — customer_core 56 節點端對端整合測試（真實 MSSQL，方案乙：直接建構 NodeDispatcher）。
 *
 * 覆蓋（真實 MSSQL）：
 *   §二 DISPATCH-E2E-001（透過真實 createDispatcher）｜§三 E2E-RUN-001..007｜§四 ISTESTRUN-002
 *   §五 TIEBREAK-001/002/004/005｜§七 CHARSET-001..003｜§八 LOOKUPHIT-001 / LOOKUPMISS-001/002
 *   §九 NULLEXC-001..003｜§十 IDEMPOTENT-001..003｜§十一 CLEANUP-E2E-001..003
 *   ＋ GATE-002 / GATE-004（前置守門）＋ FINDING-P4D-01（DECIMAL(38,10)→varchar(5) 溢位，跨引擎差異）。
 *
 * 方案乙為 DoD 核心（§0.2 建議）；DISPATCH-E2E 以真實 `createDispatcher()` 生產路徑補充驗證接線
 * （見 impl log DISPATCHE2E-GATE-001 分工決策）。
 *
 * ⚠️ 必須 side-effect import mssql-env-preload（設 DB_TYPE=mssql）。MSSQL 不可達 → 全檔 skip（不造假）。
 */
import '@/database/__tests__/mssql-env-preload';
import { describe, it, beforeAll, afterAll, expect, vi } from 'vitest';
import { restoreDbType } from '@/database/__tests__/mssql-env-preload';
import { connectMssql, teardownMssql, uniqueLogId, objectExists, MssqlHarness } from './_p4a-mssql-harness';
import {
  buildFixtures, ensureAuxTables, ensureCustomerCore, cleanupFixtures, deleteCustomerRows,
  loadCustomerCoreDef, CUST, SURVIVING_CODES, RAW_EXTRACT,
} from './_p4d-fixtures';
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

vi.setConfig({ testTimeout: 120000 });

const PIPELINE_ID = '11111111-1111-1111-1111-111111111111';
const NODE_TYPES_9 = [
  'raw_data_extract', 'derived_field', 'lookup', 'merge', 'dedup',
  'type_cast', 'field_mapping', 'conditional', 'target_load',
];

let h: MssqlHarness;
let mainRun: RunResult;

beforeAll(async () => {
  h = await connectMssql();
  if (!h.reachable || !h.qr) return;
  await ensureCustomerCore(h.qr);
  await ensureAuxTables(h.qr);
  await buildFixtures(h.qr);
  await deleteCustomerRows(h.qr);
  mainRun = await runPipeline(uniqueLogId());
});
afterAll(async () => {
  if (h?.qr) await cleanupFixtures(h.qr);
  await teardownMssql(h);
  restoreDbType();
});
const gate = () => !h?.reachable || !h?.qr;

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

interface RunResult {
  nodeLogs: NodeLogEntry[];
  logId: string;
  durationMs: number;
  runningSnapshots: { nodeId: string; existsSample: boolean }[];
}

async function runPipeline(
  logId: string,
  opts: { isTestRun?: boolean; sampleAtNode?: string; sampleUpstream?: string; dispatcher?: NodeDispatcher } = {},
): Promise<RunResult> {
  const def = loadCustomerCoreDef();
  const dispatcher = opts.dispatcher ?? buildMssqlDispatcher();
  const store = new NodeOutputStore();
  const runner = new PipelineRunner(dispatcher, store);
  const runningSnapshots: { nodeId: string; existsSample: boolean }[] = [];
  const start = Date.now();
  const nodeLogs = await runner.run(
    def,
    { batchSize: 10000, upsertBatchSize: 5000, isTestRun: opts.isTestRun ?? false, pipelineId: PIPELINE_ID, logId },
    h.qr!,
    async (logs) => {
      if (opts.sampleAtNode && opts.sampleUpstream) {
        const target = logs.find((l) => l.nodeId === opts.sampleAtNode);
        if (target?.status === 'running' && !runningSnapshots.some((s) => s.nodeId === opts.sampleAtNode)) {
          const upTable = '##' + makeTempTableName(opts.sampleUpstream, logId);
          runningSnapshots.push({ nodeId: opts.sampleAtNode, existsSample: await objectExists(h.qr!, upTable) });
        }
      }
    },
  );
  return { nodeLogs, logId, durationMs: Date.now() - start, runningSnapshots };
}

async function countP4d(): Promise<number> {
  const r = await h.qr!.query(`SELECT COUNT(*) AS c FROM "customer_core" WHERE "source_customer_no" LIKE 'P4D%'`);
  return Number(r[0].c);
}
async function readCode(code: string): Promise<any | null> {
  const r = await h.qr!.query(`SELECT * FROM "customer_core" WHERE "source_customer_no" = @0`, [code]);
  return r[0] ?? null;
}
/** 復原：重建 fixture + 清 P4D 列 + 重跑一次（isTestRun=false）→ customer_core 回到 5 列穩定態。 */
async function restoreMainState(): Promise<void> {
  await buildFixtures(h.qr!);
  await deleteCustomerRows(h.qr!);
  await runPipeline(uniqueLogId());
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

// ===========================================================================
// 前置守門
// ===========================================================================
describe('P4d GATE — 前置守門（真實 MSSQL）', () => {
  it('GATE-002：datasources / extraction_tasks 存在（列數 0 不視為錯誤）', async () => {
    if (gate()) return;
    const ds = await h.qr!.query(`SELECT OBJECT_ID('dbo.datasources') AS oid`);
    const et = await h.qr!.query(`SELECT OBJECT_ID('dbo.extraction_tasks') AS oid`);
    expect(ds[0].oid).not.toBeNull();
    expect(et[0].oid).not.toBeNull();
  });

  it('GATE-004：56 節點 DAG 無環（topologicalSort 不觸發 cycle）', async () => {
    if (gate()) return;
    const def = loadCustomerCoreDef();
    const { hasCycle, sorted } = topologicalSort(def.nodes, def.edges);
    expect(hasCycle).toBe(false);
    expect(sorted.length).toBe(56);
  });
});

// ===========================================================================
// §三 E2E-RUN（DoD 核心）
// ===========================================================================
describe('P4d E2E-RUN — 端對端跑通（真實 MSSQL，DoD 核心）', () => {
  it('E2E-001（DoD 核心）：56 節點全部 completed，無 failed/skipped', async () => {
    if (gate()) return;
    expect(mainRun.nodeLogs.length).toBe(56);
    const bad = mainRun.nodeLogs.filter((l) => l.status !== 'completed');
    expect(bad.map((b) => `${b.nodeId}:${b.status}:${b.errorMessage ?? ''}`)).toEqual([]);
  });

  it('E2E-002（DoD 核心）：9 種 handler 類型皆出現且皆 completed', async () => {
    if (gate()) return;
    const completedTypes = new Set(
      mainRun.nodeLogs.filter((l) => l.status === 'completed').map((l) => l.nodeType),
    );
    for (const t of NODE_TYPES_9) expect(completedTypes.has(t)).toBe(true);
    expect(completedTypes.size).toBe(9);
  });

  it('E2E-003：## global temp 於執行期間貫穿多節點（m4 running 時上游 fm1 ## 仍存在）', async () => {
    if (gate()) return;
    const r = await runPipeline(uniqueLogId(), { sampleAtNode: 'm4', sampleUpstream: 'fm1' });
    expect(r.runningSnapshots.length).toBeGreaterThan(0);
    expect(r.runningSnapshots[0].existsSample).toBe(true);
  });

  it('E2E-004（DoD 核心）：customer_core 新增列數 = fixture 唯一存活客戶數（5，NB 排除、BOTH 併為一列）', async () => {
    if (gate()) return;
    expect(await countP4d()).toBe(SURVIVING_CODES.length);
    for (const code of SURVIVING_CODES) expect(await readCode(code)).not.toBeNull();
  });

  it('E2E-006（觀察性）：記錄 56 節點端對端耗時', async () => {
    if (gate()) return;
    console.log('[P4d E2E-006] 56-node durationMs =', mainRun.durationMs);
    expect(mainRun.durationMs).toBeGreaterThan(0);
  });

  it('E2E-007：nodeLogs outputRowCount 與 customer_core 實際列數方向一致', async () => {
    if (gate()) return;
    const tl1 = mainRun.nodeLogs.find((l) => l.nodeId === 'tl1')!;
    expect(tl1.outputRowCount).toBeGreaterThan(0);
    expect(await countP4d()).toBeGreaterThan(0);
    // tl1 回報之寫入列數（validCount）＝存活客戶數
    expect(tl1.outputRowCount).toBe(SURVIVING_CODES.length);
  });
});

// ===========================================================================
// §八 LOOKUPHIT / LOOKUPMISS
// ===========================================================================
describe('P4d LOOKUP — 命中/未命中（真實 MSSQL）', () => {
  it('LOOKUPHIT-001（基準對照組）：ZH 全部相關 lookup 命中（desc 欄非 NULL）', async () => {
    if (gate()) return;
    const zh = await readCode(CUST.ZH);
    expect(zh).not.toBeNull();
    expect(zh.education_desc).toBe('高中');
    expect(zh.occupation_desc).toBe('工程師');
    expect(zh.job_title_desc).toBe('經理');
    expect(zh.marital_status_desc).toBe('已婚');
    expect(zh.income_source_desc).toBe('薪資所得');
    expect(zh.industry_desc).toBe('製造業');
    expect(zh.job_level_desc).toBe('中級主管');
    expect(zh.monthly_income_desc).toBe('中所得');
  });

  it('LOOKUPMISS-001（DoD 核心）：ZM education_desc 未命中為 NULL，其餘欄正常、整列不排除', async () => {
    if (gate()) return;
    const zm = await readCode(CUST.ZM);
    expect(zm).not.toBeNull(); // 單一 lookup 未命中不排除整列
    expect(zm.education_desc).toBeNull(); // EDUCAT_BACK='E9' 未命中
    expect(zm.occupation_desc).toBe('工程師'); // 其餘仍命中
    expect(zm.industry_desc).toBe('製造業');
    expect(zm.name).toBe('林小明');
  });

  it('LOOKUPMISS-002：不同客戶各自不同 lookup 未命中彼此互不干擾', async () => {
    if (gate()) return;
    const zm = await readCode(CUST.ZM); // education 未命中
    const ml = await readCode(CUST.ML); // MLMC-only：無 education/occupation lookup（本就 NULL）
    expect(zm.education_desc).toBeNull();
    expect(zm.industry_desc).toBe('製造業'); // ZM 的 industry 命中
    expect(ml.industry_desc).toBe('資訊服務業'); // ML 的 industry 命中（MLMC 分支）
    expect(ml.education_desc).toBeNull(); // ML 無 education 來源
  });
});

// ===========================================================================
// §七 CHARSET — 中文 round-trip
// ===========================================================================
describe('P4d CHARSET — 中文 round-trip（真實 MSSQL）', () => {
  it('CHARSET-001（DoD 核心）：ZH 中文姓名經 56 節點正確 round-trip', async () => {
    if (gate()) return;
    const zh = await readCode(CUST.ZH);
    expect(zh.name).toBe('陳大文');
    expect(zh.residential_address).toBe('台北市中正區忠孝東路一段1號');
  });

  it('CHARSET-002：lookup 中文 outputAlias（education_desc/customer_type_desc）正確 round-trip', async () => {
    if (gate()) return;
    const zh = await readCode(CUST.ZH);
    expect(zh.education_desc).toBe('高中');
    expect(zh.customer_type_desc).toBe('個人'); // df_ctype_desc_std 標準化（customer_type_code='01'）
  });

  it('CHARSET-003：中文於 ## 暫存表跨節點傳遞中途正確（m4 running 時上游 ## 存在＝資料確透過 ## 傳遞）', async () => {
    if (gate()) return;
    // 沿用 E2E-003 手法確認資料確實走 ## 全域暫存表（非繞過）；最終落地中文由 CHARSET-001 驗證
    const r = await runPipeline(uniqueLogId(), { sampleAtNode: 'd3', sampleUpstream: 'df3' });
    expect(r.runningSnapshots[0]?.existsSample).toBe(true);
  });
});

// ===========================================================================
// §九 NULLEXC — NOT NULL 業務欄防呆
// ===========================================================================
describe('P4d NULLEXC — NOT NULL 業務欄排除（真實 MSSQL）', () => {
  it('NULLEXC-001（DoD 核心）：NB（name 來源 NULL）整列不寫入，不影響其餘客戶', async () => {
    if (gate()) return;
    expect(await readCode(CUST.NB)).toBeNull();
    expect(await countP4d()).toBe(SURVIVING_CODES.length);
  });

  it('NULLEXC-002：存活列之 source_customer_no / customer_type_code 皆非 NULL（ghost gate 成立）', async () => {
    if (gate()) return;
    for (const code of SURVIVING_CODES) {
      const row = await readCode(code);
      expect(row.source_customer_no).not.toBeNull();
      expect(row.customer_type_code).not.toBeNull();
      expect(String(row.source_customer_no).trim().length).toBeGreaterThanOrEqual(5);
    }
  });

  it('NULLEXC-003（回歸）：重跑後 NB 仍被排除、存活數不變（不因節點順序失效）', async () => {
    if (gate()) return;
    await runPipeline(uniqueLogId());
    expect(await readCode(CUST.NB)).toBeNull();
    expect(await countP4d()).toBe(SURVIVING_CODES.length);
  });
});

// ===========================================================================
// §五 TIEBREAK — dedup tie-breaker（非破壞子集）
// ===========================================================================
describe('P4d TIEBREAK — dedup tie-breaker（真實 MSSQL）', () => {
  it('TIEBREAK-001（DoD 核心）：C-TIE 端對端後 customer_core 恰一列', async () => {
    if (gate()) return;
    const r = await h.qr!.query(`SELECT COUNT(*) AS c FROM "customer_core" WHERE "source_customer_no" = @0`, [CUST.TIE]);
    expect(Number(r[0].c)).toBe(1);
  });

  it('TIEBREAK-002（決定性）：連跑 3 次，每次恰一列且勝出列內容一致', async () => {
    if (gate()) return;
    const winners: string[] = [];
    for (let i = 0; i < 3; i++) {
      await runPipeline(uniqueLogId());
      const rows = await h.qr!.query(`SELECT name FROM "customer_core" WHERE "source_customer_no" = @0`, [CUST.TIE]);
      expect(rows.length).toBe(1);
      winners.push(rows[0].name);
    }
    expect(new Set(winners).size).toBe(1); // 3 次勝出列一致（_seq 決定性）
    console.log('[P4d TIEBREAK-002] deterministic winner =', winners[0]);
  });

  it('TIEBREAK-004（對照組）：無 tie 之客戶不受 tie-breaker 波及', async () => {
    if (gate()) return;
    // ZH/ZM/ML 各恰一列且內容穩定
    for (const code of [CUST.ZH, CUST.ZM, CUST.ML]) {
      const r = await h.qr!.query(`SELECT COUNT(*) AS c FROM "customer_core" WHERE "source_customer_no" = @0`, [code]);
      expect(Number(r[0].c)).toBe(1);
    }
  });
});

// ===========================================================================
// §十 IDEMPOTENT — 冪等重跑
// ===========================================================================
describe('P4d IDEMPOTENT — 冪等重跑（真實 MSSQL）', () => {
  it('IDEMPOTENT-001（DoD 核心）：完整重跑第二次，customer_core 列數不變（UPSERT 非疊加）', async () => {
    if (gate()) return;
    const before = await countP4d();
    await runPipeline(uniqueLogId());
    expect(await countP4d()).toBe(before);
    expect(before).toBe(SURVIVING_CODES.length);
  });

  it('IDEMPOTENT-002：C-TIE 勝出列內容重跑後穩定', async () => {
    if (gate()) return;
    const a = await readCode(CUST.TIE);
    await runPipeline(uniqueLogId());
    const b = await readCode(CUST.TIE);
    expect(b.name).toBe(a.name);
  });

  it('IDEMPOTENT-003：同一 logId 重跑不因前次 ## 殘留命名衝突而失敗', async () => {
    if (gate()) return;
    const logId = uniqueLogId();
    const r1 = await runPipeline(logId);
    const r2 = await runPipeline(logId); // 相同 logId → 相同 ## 名；cleanupAll 已清 → 不撞名
    expect(r1.nodeLogs.every((l) => l.status === 'completed')).toBe(true);
    expect(r2.nodeLogs.every((l) => l.status === 'completed')).toBe(true);
  });
});

// ===========================================================================
// §十一 CLEANUP-E2E — 全域 ## 清理（成功路徑）
// ===========================================================================
describe('P4d CLEANUP-E2E — ## 全清（真實 MSSQL）', () => {
  it('CLEANUP-E2E-001（DoD 核心）：成功路徑後全部節點 ## 表 OBJECT_ID 皆 NULL', async () => {
    if (gate()) return;
    const logId = uniqueLogId();
    await runPipeline(logId);
    const def = loadCustomerCoreDef();
    for (const n of def.nodes) {
      const base = makeTempTableName(n.id, logId);
      expect(await objectExists(h.qr!, '##' + base)).toBe(false);
      if (n.data.nodeType === 'dedup') {
        expect(await objectExists(h.qr!, '##raw_' + base)).toBe(false);
      }
      if (n.data.nodeType === 'target_load') {
        expect(await objectExists(h.qr!, '##' + base + '_dq')).toBe(false);
        expect(await objectExists(h.qr!, '##' + base + '_dq_seq')).toBe(false);
      }
    }
  });

  it('CLEANUP-E2E-003（防禦性全域掃描）：tempdb.sys.objects 依 logId 前 8 碼 LIKE 掃描零殘留', async () => {
    if (gate()) return;
    const logId = uniqueLogId();
    await runPipeline(logId);
    expect(await tempLeakCount(logId)).toBe(0);
  });
});

// ===========================================================================
// §二 DISPATCH-E2E — 透過真實 createDispatcher（補充 smoke）
// ===========================================================================
describe('P4d DISPATCH-E2E — 真實 createDispatcher 驅動 56 節點（真實 MSSQL）', () => {
  it('DISPATCHE2E-001（補充 DoD）：EtlPipelineExecutionService.createDispatcher(DB_TYPE=mssql) 產生之 dispatcher 跑通 56 節點且 customer_core 有列', async () => {
    if (gate()) return;
    const cfg = { get: (k: string, d?: unknown) => (k === 'DB_TYPE' ? 'mssql' : d) };
    const svc = new EtlPipelineExecutionService(
      null as any, null as any, null as any, null as any, cfg as any,
    );
    const dispatcher: NodeDispatcher = (svc as any).createDispatcher();
    await deleteCustomerRows(h.qr!);
    const r = await runPipeline(uniqueLogId(), { dispatcher });
    expect(r.nodeLogs.length).toBe(56);
    expect(r.nodeLogs.every((l) => l.status === 'completed')).toBe(true);
    expect(await countP4d()).toBe(SURVIVING_CODES.length); // 間接證明 isTestRun 未被誤設 true
  });
});

// ===========================================================================
// 破壞性 / 自癒（放最後；每案例自行復原 customer_core 至穩定 5 列）
// ===========================================================================
describe('P4d 破壞性/自癒（真實 MSSQL）', () => {
  it('ISTESTRUN-002（MUST-FIX 陷阱佐證）：isTestRun=true → nodeLogs 全綠但 customer_core 零寫入', async () => {
    if (gate()) return;
    await deleteCustomerRows(h.qr!);
    const r = await runPipeline(uniqueLogId(), { isTestRun: true });
    // 全部 completed（含 tl1，outputRowCount 顯示看似正常數字）
    expect(r.nodeLogs.every((l) => l.status === 'completed')).toBe(true);
    const tl1 = r.nodeLogs.find((l) => l.nodeId === 'tl1')!;
    expect(tl1.status).toBe('completed');
    expect(tl1.outputRowCount).toBeGreaterThan(0); // 陷阱：看似寫入
    // 但實表零列 → 證明「僅信 nodeLogs 不足以驗 DoD」
    expect(await countP4d()).toBe(0);
    await restoreMainState();
  });

  it('TIEBREAK-005（NULLS LAST）：C-TIE 其一 timestamp 為 NULL 時非 NULL 者優先', async () => {
    if (gate()) return;
    await deleteCustomerRows(h.qr!);
    // 將 TIE 其中一列（王二）UPDATE_DATE 設 NULL → 王一（非 NULL）應決定性勝出
    await h.qr!.query(
      `UPDATE "${RAW_EXTRACT.e1}" SET "UPDATE_DATE" = NULL WHERE "CUSTO_NO" = @0 AND "CUS_NAME" = N'王二'`,
      [CUST.TIE],
    );
    await runPipeline(uniqueLogId());
    const rows = await h.qr!.query(`SELECT name FROM "customer_core" WHERE "source_customer_no" = @0`, [CUST.TIE]);
    expect(rows.length).toBe(1);
    expect(rows[0].name).toBe('王一'); // NULLS LAST：非 NULL timestamp 勝出
    await restoreMainState();
  });

  it('E2E-005（DoD 核心，容錯路徑）：中游節點失敗 → 下游 skipped、customer_core 不新增、## 清空', async () => {
    if (gate()) return;
    await deleteCustomerRows(h.qr!);
    // 破壞 lk_m_indus1 之來源 raw 表（DROP）→ 該 lookup 節點拋錯
    await h.qr!.query(`IF OBJECT_ID('dbo.raw_b9558d10','U') IS NOT NULL DROP TABLE "raw_b9558d10"`);
    const logId = uniqueLogId();
    const r = await runPipeline(logId);
    const failed = r.nodeLogs.filter((l) => l.status === 'failed');
    const skipped = r.nodeLogs.filter((l) => l.status === 'skipped');
    expect(failed.length).toBe(1);
    expect(failed[0].nodeId).toBe('lk_m_indus1');
    expect(skipped.length).toBeGreaterThan(0);
    // tl1 未執行到 → customer_core 無本次新增
    expect(await countP4d()).toBe(0);
    // CLEANUP-E2E-002：失敗路徑亦全清
    expect(await tempLeakCount(logId)).toBe(0);
    await restoreMainState();
  });

  it('FINDING-P4D-01（🔴 跨引擎業務級差異）：數字型 MONTH_INCOME 使 tl1 於 MSSQL 溢位失敗（PG 不受影響）', async () => {
    if (gate()) return;
    await deleteCustomerRows(h.qr!);
    // 將 ZH 的 MONTH_INCOME 改為數字 '3'（真實 legacy 所得級距為數字碼）
    await h.qr!.query(
      `UPDATE "${RAW_EXTRACT.e1}" SET "MONTH_INCOME" = N'3' WHERE "CUSTO_NO" = @0`,
      [CUST.ZH],
    );
    const r = await runPipeline(uniqueLogId());
    const tl1 = r.nodeLogs.find((l) => l.nodeId === 'tl1')!;
    expect(tl1.status).toBe('failed');
    // DECIMAL(38,10)→varchar(5)（monthly_income_code）算術溢位
    expect(tl1.errorMessage || '').toMatch(/overflow|truncat/i);
    console.log('[P4d FINDING-P4D-01] tl1 error =', tl1.errorMessage);
    await restoreMainState();
  });
});
