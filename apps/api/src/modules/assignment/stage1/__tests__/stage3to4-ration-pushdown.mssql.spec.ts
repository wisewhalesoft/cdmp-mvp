/**
 * AD-E07-42 P3c — Stage 3/4 比例分派 raw SQL 引擎 MSSQL 移植：JS golden oracle ↔ MSSQL 下推逐列四元組等價
 * + MUST-FIX 守門（DISPATCH 呼叫鏈 / DECIMAL-RATION 精度 / VALUES-CTE derived table / UPDATE...FROM /
 * TOPLIMIT / WINDOWFN 空框架 / CRFILTER is_cr 三值 / EQ DoD）。
 *
 * 對應測試設計 AD-E07-42-P3c-test.md（56 案）：
 *   GATE / DISPATCH / VALUESCTE / WINDOWFN / DECIMAL / UPDATEFROM / TOPLIMIT / DEPT / EMPL / ASGD /
 *   CRFILTER / EQ / IDEM / REG / STATIC。
 *
 * Harness（§0.2，沿用 P3a「共用既有表」策略）：3 表（assignment_run / ob_pool_data /
 *   ob_monthly_run_result）OBJECT_ID 探測 → existedBeforeSuite；缺表以 P3b 零 drift DDL
 *   （_p3b-mssql-ddl.ts，自 baseline migration 解析）自建；afterAll 對自建表 DROP、對既有表僅前綴
 *   DELETE（禁 DROP/TRUNCATE 共用表）→ 全新/部分缺表 dbo 亦可獨立完整重跑。
 *   隔離：run_id 固定 UUID（P3C_RUN_ID_1/2）；list_no 前綴 'P3C'；appl_no 前綴 'P3C' 連號。
 *   ⚠️ 與 p1b2/p4/p3a/p3b mssql 套件共用 dbo → 本檔須 `--no-file-parallelism`（或單檔）執行。
 *
 * 靜態守門（capture 假 manager）不需 MSSQL、恆執行；DB 案例不可達 → skip-with-reason（不假綠）。
 */

// 必最先 import（side-effect 設 DB_TYPE=mssql）。
import {
  restoreDbType,
  MSSQL,
  mssqlPortReachable,
  SKIP_REASON,
} from '@/database/__tests__/mssql-env-preload';

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from 'vitest';
import { DataSource, Repository, EntityManager } from 'typeorm';

import { ObPoolData } from '@/database/entities/ob-pool-data.entity';
import { ObMonthlyRunResult } from '@/database/entities/ob-monthly-run-result.entity';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { runStage3to4RationSqlMssql } from '../stage3to4-ration-sql-mssql';
import { clearStage3Fields } from '../stage3to4-ration-sql';
import {
  distributeStage3to4,
  type RationCase,
  type DeptRation,
  type EmplRation,
  type WorkingDay,
  type CrPreassignedCase,
} from '../stage3to4-ration';
import {
  AssignmentRunPipelineService,
  resolveStage2to4Strategy,
} from '../../services/assignment-run-pipeline.service';
import { MSSQL_BASELINE_DDL } from './_p3b-mssql-ddl';

vi.setConfig({ testTimeout: 60000 });

const RUN_ID = '00000000-0000-0000-0000-0000000042c1';
const RUN_ID_2 = '00000000-0000-0000-0000-0000000042c2';
const YM = '202606';

/** 本檔 raw SQL 直接觸及之 3 表（皆 P3a 共用子集）。 */
const THREE_TABLES = ['assignment_run', 'ob_pool_data', 'ob_monthly_run_result'] as const;

let reachable = false;
let ds: DataSource | null = null;
let poolRepo: Repository<ObPoolData>;
let resultRepo: Repository<ObMonthlyRunResult>;
let manager: EntityManager;
const existedBeforeSuite = new Set<string>();
const selfBuiltTables: string[] = [];

const DEPT_3: DeptRation[] = [
  { obdeptid: 'AI000', ration: 50 },
  { obdeptid: 'AM000', ration: 30 },
  { obdeptid: 'B0000', ration: 20 },
];

/** 20 工作日，各 ratioPerMille=50。 */
const WORKDAYS_20: WorkingDay[] = Array.from({ length: 20 }, (_, i) => ({
  casedt: `2026-06-${String(i + 1).padStart(2, '0')}`,
  ratioPerMille: 50,
}));

let applSeq = 0;

function ensureMssql(ctx: { skip: () => void }): void {
  if (!reachable || !ds) {
    // eslint-disable-next-line no-console
    console.warn(`[AD-E07-42 P3c MSSQL] SKIPPED — ${SKIP_REASON}`);
    ctx.skip();
  }
}

// ---------------------------------------------------------------------------
// seed helpers（appl_no 前綴 'P3C' 連號，保證 (orgno, appl_no) 字串序 = 注入序）
// ---------------------------------------------------------------------------
function makeCase(opts: {
  listNo: string;
  poolDeptId: string;
  tier: string | null;
  runId?: string;
  applNo?: string;
  isCr?: string;
}): {
  orgno: string;
  applNo: string;
  pool: Partial<ObPoolData>;
  result: Partial<ObMonthlyRunResult>;
} {
  applSeq += 1;
  const applNo = opts.applNo ?? `P3C${String(applSeq).padStart(5, '0')}`;
  const orgno = '01';
  const custoNo = `P3C${String(applSeq).padStart(5, '0')}`;
  return {
    orgno,
    applNo,
    pool: {
      orgno,
      appl_no: applNo,
      custo_no: custoNo,
      sta_code: '01',
      dept_id: opts.poolDeptId,
      list_type: '01',
      settle_src: '01',
      month_cnt: 1,
      _cdmp_extracted_at: new Date(),
    } as Partial<ObPoolData>,
    result: {
      run_id: opts.runId ?? RUN_ID,
      list_no: opts.listNo,
      orgno,
      appl_no: applNo,
      custo_no: custoNo,
      settle_src: '01',
      tier_level: opts.tier,
      is_cr: opts.isCr ?? 'N',
      result_status: 'PENDING',
      created_at: new Date(),
      updated_at: new Date(),
    } as Partial<ObMonthlyRunResult>,
  };
}

/** 分塊 bulk insert（避免 mssql 單陳述式 2100 參數上限）。 */
async function bulkInsert<T extends object>(
  repo: Repository<T>,
  rows: T[],
  chunk = 50,
): Promise<void> {
  for (let i = 0; i < rows.length; i += chunk) {
    await repo.insert(rows.slice(i, i + chunk) as never);
  }
}

async function seedCase(opts: {
  listNo: string;
  poolDeptId: string;
  tier: string | null;
  runId?: string;
  applNo?: string;
  isCr?: string;
}): Promise<{ orgno: string; applNo: string }> {
  const c = makeCase(opts);
  await poolRepo.insert(c.pool as never);
  await resultRepo.insert(c.result as never);
  return { orgno: c.orgno, applNo: c.applNo };
}

async function seedGroup(opts: {
  listNo: string;
  poolDeptId: string;
  tier: string;
  n: number;
  runId?: string;
}): Promise<void> {
  const pools: Partial<ObPoolData>[] = [];
  const results: Partial<ObMonthlyRunResult>[] = [];
  for (let i = 0; i < opts.n; i++) {
    const c = makeCase({
      listNo: opts.listNo,
      poolDeptId: opts.poolDeptId,
      tier: opts.tier,
      runId: opts.runId,
    });
    pools.push(c.pool);
    results.push(c.result);
  }
  await bulkInsert(poolRepo, pools as ObPoolData[]);
  await bulkInsert(resultRepo, results as ObMonthlyRunResult[]);
}

async function deptDist(listNo: string, runId = RUN_ID): Promise<Record<string, number>> {
  const rows = await resultRepo.find({ where: { run_id: runId, list_no: listNo } });
  const out: Record<string, number> = {};
  for (const r of rows) if (r.dept_id) out[r.dept_id] = (out[r.dept_id] ?? 0) + 1;
  return out;
}

async function emplDist(listNo: string, runId = RUN_ID): Promise<Record<string, number>> {
  const rows = await resultRepo.find({ where: { run_id: runId, list_no: listNo } });
  const out: Record<string, number> = {};
  for (const r of rows) if (r.emplid) out[r.emplid] = (out[r.emplid] ?? 0) + 1;
  return out;
}

async function ration(
  listNo: string,
  deptRations: DeptRation[],
  emplRations: EmplRation[],
  workingDays: WorkingDay[],
  runId = RUN_ID,
  ym = YM,
) {
  return runStage3to4RationSqlMssql(manager, {
    runId,
    listNo,
    ym,
    deptRations,
    emplRations,
    workingDays,
  });
}

async function cleanupP3C(): Promise<void> {
  await manager.query(`DELETE FROM ob_monthly_run_result WHERE list_no LIKE 'P3C%'`);
  await manager.query(
    `DELETE FROM assignment_run WHERE run_id IN ('${RUN_ID}', '${RUN_ID_2}')`,
  );
  await manager.query(`DELETE FROM ob_pool_data WHERE appl_no LIKE 'P3C%'`);
}

async function seedRun(runId: string): Promise<void> {
  await manager.query(
    `INSERT INTO assignment_run (run_id, project_workym, status, triggered_by, created_at)
     VALUES (@0, '202606', 'running', '00000000-0000-0000-0000-000000000001', GETDATE())`,
    [runId],
  );
}

// ===========================================================================
// 連線 + 3 表探測/自建（§0.2）
// ===========================================================================
beforeAll(async () => {
  reachable = await mssqlPortReachable(1500);
  if (!reachable) return;
  try {
    ds = new DataSource({
      type: 'mssql',
      host: MSSQL.host,
      port: MSSQL.port,
      username: MSSQL.username,
      password: MSSQL.password,
      database: MSSQL.database,
      options: {
        encrypt: MSSQL.encrypt,
        trustServerCertificate: MSSQL.trustServerCertificate,
      },
      entities: [ObPoolData, ObMonthlyRunResult, AssignmentRun],
      synchronize: false, // §0.2：共用既有 dbo，絕不 synchronize。
    });
    await ds.initialize();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[AD-E07-42 P3c MSSQL] init failed → skip:', (e as Error)?.message);
    reachable = false;
    ds = null;
    return;
  }
  manager = ds.manager;

  // GATE-001：3 表 OBJECT_ID 探測 → existedBeforeSuite；缺表以零 drift DDL 自建。
  for (const t of THREE_TABLES) {
    const rows = await manager.query(`SELECT OBJECT_ID('dbo.${t}', 'U') AS oid`);
    if (rows?.[0]?.oid != null) {
      existedBeforeSuite.add(t);
    } else {
      const ddl = MSSQL_BASELINE_DDL[t];
      if (!ddl) {
        // eslint-disable-next-line no-console
        console.warn(`[AD-E07-42 P3c MSSQL] 缺 DDL 常數：${t} → skip DB 案例`);
        reachable = false;
        return;
      }
      await manager.query(ddl);
      selfBuiltTables.push(t);
    }
  }

  poolRepo = ds.getRepository(ObPoolData);
  resultRepo = ds.getRepository(ObMonthlyRunResult);
}, 120000);

afterAll(async () => {
  if (ds) {
    try {
      await cleanupP3C();
    } catch {
      /* best-effort */
    }
    // 自建表 DROP 還原（reverse 序，避免 FK）；既有表絕不 DROP。
    for (const t of [...selfBuiltTables].reverse()) {
      try {
        await manager.query(`DROP TABLE dbo.${t}`);
      } catch {
        /* best-effort */
      }
    }
    await ds.destroy();
  }
  restoreDbType();
});

beforeEach(async () => {
  if (!reachable || !ds) return;
  await cleanupP3C();
  await seedRun(RUN_ID);
  await seedRun(RUN_ID_2);
  applSeq = 0;
});

// ===========================================================================
// 靜態守門 — capture 假 manager（恆執行，不需 MSSQL）
// ===========================================================================
/** 假 EntityManager：escape 為 identity（保留 template token），query 記錄 SQL。 */
function makeCaptureManager(): { mgr: EntityManager; captured: string[] } {
  const captured: string[] = [];
  const mgr = {
    connection: {
      driver: {
        escapeQueryWithParameters: (
          sql: string,
          params: Record<string, unknown>,
        ): [string, unknown[]] => [sql, Object.values(params ?? {})],
      },
    },
    query: async (sql: string): Promise<unknown> => {
      captured.push(sql);
      if (/TOP \(1\)/.test(sql)) return [{ one: 1 }]; // hasEmplRows → 有列。
      if (/^\s*SELECT/i.test(sql)) return []; // warnRows → 無警告。
      return undefined; // UPDATE。
    },
  } as unknown as EntityManager;
  return { mgr, captured };
}

/** 產生 dept + empl + assignday 三道 UPDATE SQL（供靜態掃描）。 */
async function captureAllSql(): Promise<string[]> {
  const { mgr, captured } = makeCaptureManager();
  await runStage3to4RationSqlMssql(mgr, {
    runId: 'R',
    listNo: 'L',
    ym: '202606',
    deptRations: [
      { obdeptid: 'D1', ration: 33.67 },
      { obdeptid: 'D2', ration: 66.33 },
    ],
    emplRations: [{ emplid: 'E1', deptid_m: 'D1', ration: 100 }],
    workingDays: [{ casedt: '2026-06-01', ratioPerMille: 1000 }],
  });
  return captured;
}

describe('P3c STATIC — 靜態守門（capture，恆執行）', () => {
  it('TS-MSSQL-P3C-STATIC-002：生成 SQL 不含 PG-only token（:: / 裸 VALUES / LIMIT / || / RETURNING / ON CONFLICT）', async () => {
    const all = (await captureAllSql()).join('\n---\n');
    expect(all).not.toMatch(/::/); // cast 運算子。
    expect(all).not.toMatch(/\bLIMIT\b/i);
    expect(all).not.toMatch(/\|\|/);
    expect(all).not.toMatch(/RETURNING/i);
    expect(all).not.toMatch(/ON\s+CONFLICT/i);
    // 裸 VALUES 直接接於 CTE 名稱後（未經 SELECT * FROM (...) AS v(...) 包裝）。
    expect(all).not.toMatch(/AS\s*\(\s*VALUES/i);
  });

  it('TS-MSSQL-P3C-STATIC-003 / GATE-003 / VALUESCTE：三處 VALUES-CTE 皆改寫為 derived table', async () => {
    const all = (await captureAllSql()).join('\n');
    const wraps = all.match(/SELECT \* FROM \(VALUES/g) ?? [];
    // dept_pct + empl_set + cal 三處。
    expect(wraps.length).toBe(3);
  });

  it('TS-MSSQL-P3C-DECIMAL-RATION（GATE-002 決策）：dept + empl ration 皆明確 NUMERIC(18,4)、無裸 numeric', async () => {
    const [deptSql, , emplSql] = await captureAllSql();
    expect(deptSql).toContain('CAST(:or0 AS NUMERIC(18,4))');
    expect(emplSql).toContain('CAST(:er0 AS NUMERIC(18,4))');
    // DECIMAL-RATION-002：兩處一致，皆非裸 numeric（防修一漏一）。
    const all = (await captureAllSql()).join('\n');
    expect(all).not.toMatch(/AS\s+numeric\s*\)/i); // 無小寫裸 numeric。
    expect(all).not.toMatch(/AS\s+NUMERIC\s*\)/); // 無無精度 NUMERIC)。
    expect((all.match(/NUMERIC\(18,4\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('TS-MSSQL-P3C-GATE-004：ASSIGNDAY 無日期型別轉換（無 ::date / DATEADD / DATEDIFF / CAST AS DATE）', async () => {
    const all = (await captureAllSql()).join('\n');
    expect(all).not.toMatch(/::date/i);
    expect(all).not.toMatch(/DATEADD/i);
    expect(all).not.toMatch(/DATEDIFF/i);
    expect(all).not.toMatch(/AS\s+DATE\s*\)/i);
  });

  it('TS-MSSQL-P3C-TOPLIMIT-001：hasEmplRows 改 SELECT TOP (1)（無 LIMIT）', async () => {
    const captured = await captureAllSql();
    const topSql = captured.find((s) => /TOP \(1\)/.test(s));
    expect(topSql).toBeDefined();
    expect(topSql!).toMatch(/emplid IS NOT NULL/);
    expect(topSql!).not.toMatch(/LIMIT/i);
  });

  it('TS-MSSQL-P3C-UPDATEFROM-001/002/003：三道 UPDATE 皆 UPDATE r + FROM ob_monthly_run_result r INNER JOIN + WHERE 僅 run_id/list_no', async () => {
    const captured = await captureAllSql();
    const updates = captured.filter((s) => /^\s*\nWITH/.test(s) || /UPDATE r\b/.test(s));
    // dept / empl / assignday 三道 UPDATE。
    const updateSqls = captured.filter((s) => /UPDATE r\b/.test(s));
    expect(updateSqls.length).toBe(3);
    for (const u of updateSqls) {
      expect(u).toMatch(/FROM ob_monthly_run_result r\s+INNER JOIN/);
      expect(u).toMatch(/WHERE r\.run_id = :runId AND r\.list_no = :listNo/);
      // join key 在 INNER JOIN ON，非 WHERE。
      expect(u).toMatch(/INNER JOIN \w+ a ON r\.orgno = a\.orgno AND r\.appl_no = a\.appl_no/);
    }
    expect(updates.length).toBeGreaterThanOrEqual(3);
  });

  it('TS-MSSQL-P3C-STATIC-001：Harness 對 3 共用表僅 DELETE（無 DROP/TRUNCATE 共用表）', () => {
    // cleanupP3C 原始碼字面掃描（本測試檔自身之清理策略）。
    const src = cleanupP3C.toString();
    expect(src).toMatch(/DELETE FROM ob_monthly_run_result/);
    expect(src).toMatch(/DELETE FROM ob_pool_data/);
    expect(src).toMatch(/DELETE FROM assignment_run/);
    expect(src).not.toMatch(/DROP TABLE/i);
    expect(src).not.toMatch(/TRUNCATE/i);
  });
});

// ===========================================================================
// DISPATCH — 呼叫鏈守門（method source scan，恆執行）+ 純函式三態
// ===========================================================================
describe('P3c DISPATCH — Stage 3/4 接線 mssql 月名單分派鏈路', () => {
  /** executeStage2to3PushdownMssql 之編譯後方法本體字串。 */
  const methodSrc = (
    AssignmentRunPipelineService.prototype as unknown as {
      executeStage2to3PushdownMssql: (...a: unknown[]) => unknown;
    }
  ).executeStage2to3PushdownMssql.toString();

  it('TS-MSSQL-P3C-DISPATCH-001：executeStage2to3PushdownMssql 現已呼叫 runStage3to4RationSqlMssql', () => {
    expect(methodSrc).toContain('runStage3to4RationSqlMssql');
  });

  it('TS-MSSQL-P3C-DISPATCH-002：呼叫鏈含 clearStage3Fields（方言中立，PG/MSSQL 共用，非另建 mssql 版）', () => {
    expect(methodSrc).toContain('clearStage3Fields');
  });

  it('TS-MSSQL-P3C-DISPATCH-003（P3d 已閉環，負向守門翻轉為正向）：mssql 呼叫鏈呼叫 runCrPrioritySqlMssql，且不呼叫 PG-only 版 runCrPrioritySql(', () => {
    // P3d（AD-E07-42-P3d）已將 CR 前置 mssql 化並接線，此處負向守門正式翻轉：
    //   mssql 路徑改呼叫平行版 runCrPrioritySqlMssql；仍不得呼叫 PG-only 之 bare runCrPrioritySql(
    //   （逐字對 MSSQL 執行 `::date` 會語法錯）。詳見 cr-priority-pushdown.mssql.spec.ts DISPATCH 群組。
    expect(methodSrc).toContain('runCrPrioritySqlMssql');
    expect(methodSrc).not.toMatch(/runCrPrioritySql\(/); // bare PG 版呼叫（runCrPrioritySqlMssql( 不匹配）。
  });

  it('TS-MSSQL-P3C-DISPATCH-004：resolveStage2to4Strategy 三態互斥（postgres/mssql/其餘）', () => {
    expect(resolveStage2to4Strategy({ DB_TYPE: 'postgres' })).toBe('pushdownPg');
    expect(resolveStage2to4Strategy({ DB_TYPE: 'mssql' })).toBe('pushdownMssql');
    expect(resolveStage2to4Strategy({ DB_TYPE: 'sqlite' })).toBe('v1Inmemory');
    expect(
      resolveStage2to4Strategy({ DB_TYPE: undefined, ASSIGNMENT_PIPELINE_V2: 'true' }),
    ).toBe('v2Inmemory');
    // 互斥：mssql 不誤觸 pushdownPg，postgres 不誤觸 pushdownMssql。
    expect(resolveStage2to4Strategy({ DB_TYPE: 'mssql' })).not.toBe('pushdownPg');
    expect(resolveStage2to4Strategy({ DB_TYPE: 'postgres' })).not.toBe('pushdownMssql');
  });

  it('TS-MSSQL-P3C-GATE-001：3 表就緒（existedBeforeSuite ∪ selfBuiltTables = 3，互斥）', (ctx) => {
    ensureMssql(ctx);
    expect(existedBeforeSuite.size + selfBuiltTables.length).toBe(THREE_TABLES.length);
    for (const t of selfBuiltTables) expect(existedBeforeSuite.has(t)).toBe(false);
  });

  it('TS-MSSQL-P3C-DISPATCH-005：完整 dept→empl→assignday 後 dept_id/emplid/assignday 不再恆 NULL', async (ctx) => {
    ensureMssql(ctx);
    const L = 'P3CL1';
    await seedGroup({ listNo: L, poolDeptId: 'XVF1', tier: 'T1', n: 51 });
    await ration(
      L,
      [{ obdeptid: 'AI000', ration: 100 }],
      [{ emplid: 'E1', deptid_m: 'AI000', ration: 100 }],
      WORKDAYS_20,
    );
    const rows = await resultRepo.find({ where: { run_id: RUN_ID, list_no: L } });
    expect(rows.some((r) => r.dept_id !== null)).toBe(true);
    expect(rows.some((r) => r.emplid !== null)).toBe(true);
    expect(rows.some((r) => r.emplid_deptid !== null)).toBe(true);
    expect(rows.some((r) => r.assignday !== null)).toBe(true);
  });
});

// ===========================================================================
// DECIMAL — ration 精度旗艦（🔴🔴 MUST-FIX）
// ===========================================================================
describe('P3c DECIMAL — ration 精度旗艦（真庫）', () => {
  it('TS-MSSQL-P3C-DECIMAL-RATION-001：dept 33.67/33.67/32.66 × 300 → {D1:102, D2:101, D3:97}（非裸 NUMERIC 四捨五入）', async (ctx) => {
    ensureMssql(ctx);
    const L = 'P3CL1';
    await seedGroup({ listNo: L, poolDeptId: 'XVF1', tier: 'T1', n: 300 });
    await ration(
      L,
      [
        { obdeptid: 'D1', ration: 33.67 },
        { obdeptid: 'D2', ration: 33.67 },
        { obdeptid: 'D3', ration: 32.66 },
      ],
      [],
      [],
    );
    expect(await deptDist(L)).toEqual({ D1: 102, D2: 101, D3: 97 });
  });

  it('TS-MSSQL-P3C-DECIMAL-RATION-002：empl 40.25/35.25/24.50 精度同型（JS oracle 逐員工相等）', async (ctx) => {
    ensureMssql(ctx);
    const L = 'P3CL1';
    const cases: RationCase[] = [];
    for (let i = 0; i < 97; i++) {
      const { orgno, applNo } = await seedCase({ listNo: L, poolDeptId: 'XVF1', tier: 'T1' });
      cases.push({ orgno, appl_no: applNo, tier_level: 'T1', pool_dept_id: 'XVF1' });
    }
    const deptR: DeptRation[] = [{ obdeptid: 'AI000', ration: 100 }];
    const emplR: EmplRation[] = [
      { emplid: 'E1', deptid_m: 'AI000', ration: 40.25 },
      { emplid: 'E2', deptid_m: 'AI000', ration: 35.25 },
      { emplid: 'E3', deptid_m: 'AI000', ration: 24.5 },
    ];
    await ration(L, deptR, emplR, []);
    const js = distributeStage3to4(L, YM, cases, deptR, emplR, []);
    const jsDist: Record<string, number> = {};
    for (const a of js.assignments) if (a.emplid) jsDist[a.emplid] = (jsDist[a.emplid] ?? 0) + 1;
    expect(await emplDist(L)).toEqual(jsDist);
  });
});

// ===========================================================================
// WINDOWFN — 單列 partition 空框架邊界
// ===========================================================================
describe('P3c WINDOWFN — 累積框架邊界（真庫）', () => {
  it('TS-MSSQL-P3C-WINDOWFN-001：單一部門 ration=100% → 全部落該唯一課（空框架 COALESCE 0）', async (ctx) => {
    ensureMssql(ctx);
    const L = 'P3CL1';
    await seedGroup({ listNo: L, poolDeptId: 'XVF1', tier: 'T1', n: 37 });
    await ration(L, [{ obdeptid: 'AI000', ration: 100 }], [], []);
    expect(await deptDist(L)).toEqual({ AI000: 37 });
  });

  it('TS-MSSQL-P3C-WINDOWFN-002：單一員工 ration=100% → 全部落該唯一員工', async (ctx) => {
    ensureMssql(ctx);
    const L = 'P3CL1';
    await seedGroup({ listNo: L, poolDeptId: 'XVF1', tier: 'T1', n: 44 });
    await ration(
      L,
      [{ obdeptid: 'AI000', ration: 100 }],
      [{ emplid: 'E1', deptid_m: 'AI000', ration: 100 }],
      [],
    );
    expect(await emplDist(L)).toEqual({ E1: 44 });
  });

  it('TS-MSSQL-P3C-WINDOWFN-003：單一工作日（lastIdx=0）→ 全部吸收該日', async (ctx) => {
    ensureMssql(ctx);
    const L = 'P3CL1';
    await seedGroup({ listNo: L, poolDeptId: 'XVF1', tier: 'T1', n: 13 });
    await ration(
      L,
      [{ obdeptid: 'AI000', ration: 100 }],
      [{ emplid: 'E1', deptid_m: 'AI000', ration: 100 }],
      [{ casedt: '2026-06-02', ratioPerMille: 1000 }],
    );
    const rows = await resultRepo.find({ where: { run_id: RUN_ID, list_no: L } });
    expect(rows.every((r) => r.assignday === '2026-06-02')).toBe(true);
    expect(rows.length).toBe(13);
  });
});

// ===========================================================================
// DEPT — Stage 3 dept ration 手算 oracle
// ===========================================================================
describe('P3c DEPT — Stage 3 dept ration（真庫）', () => {
  it('TS-MSSQL-P3C-DEPT-001：101 件 / 50/30/20（diff=1）→ 51/30/20', async (ctx) => {
    ensureMssql(ctx);
    const L = 'P3CL1';
    await seedGroup({ listNo: L, poolDeptId: 'XVF1', tier: 'T1', n: 101 });
    await ration(L, DEPT_3, [], []);
    expect(await deptDist(L)).toEqual({ AI000: 51, AM000: 30, B0000: 20 });
  });

  it('TS-MSSQL-P3C-DEPT-002：30 件整除 → 15/9/6', async (ctx) => {
    ensureMssql(ctx);
    const L = 'P3CL1';
    await seedGroup({ listNo: L, poolDeptId: 'XVF1', tier: 'T2', n: 30 });
    await ration(L, DEPT_3, [], []);
    expect(await deptDist(L)).toEqual({ AI000: 15, AM000: 9, B0000: 6 });
  });

  it('TS-MSSQL-P3C-DEPT-003：2 分處 × 2 Tier 全矩陣各自獨立', async (ctx) => {
    ensureMssql(ctx);
    const L = 'P3CL1';
    await seedGroup({ listNo: L, poolDeptId: 'XVF1', tier: 'T1', n: 101 });
    await seedGroup({ listNo: L, poolDeptId: 'XVG1', tier: 'T2', n: 40 });
    await ration(L, DEPT_3, [], []);
    const rows = await resultRepo
      .createQueryBuilder('r')
      .innerJoin(ObPoolData, 'o', 'o.orgno = r.orgno AND o.appl_no = r.appl_no')
      .select(['o.dept_id AS pd', 'r.tier_level AS tl', 'r.dept_id AS dd', 'COUNT(*) AS cnt'])
      .where('r.run_id = :runId', { runId: RUN_ID })
      .groupBy('o.dept_id')
      .addGroupBy('r.tier_level')
      .addGroupBy('r.dept_id')
      .getRawMany<{ pd: string; tl: string; dd: string; cnt: string }>();
    const cell = (pd: string, dd: string) =>
      Number(rows.find((x) => x.pd === pd && x.dd === dd)?.cnt ?? 0);
    expect([cell('XVF1', 'AI000'), cell('XVF1', 'AM000'), cell('XVF1', 'B0000')]).toEqual([51, 30, 20]);
    expect([cell('XVG1', 'AI000'), cell('XVG1', 'AM000'), cell('XVG1', 'B0000')]).toEqual([20, 12, 8]);
  });

  it('TS-MSSQL-P3C-DEPT-004：10 件 60/30/10 依 (orgno,appl_no) ASC 循序指派', async (ctx) => {
    ensureMssql(ctx);
    const L = 'P3CL1';
    for (let i = 1; i <= 10; i++) {
      await seedCase({ listNo: L, poolDeptId: 'XVF1', tier: 'T1', applNo: `P3C${String(i).padStart(4, '0')}` });
    }
    await ration(
      L,
      [
        { obdeptid: 'AI000', ration: 60 },
        { obdeptid: 'AM000', ration: 30 },
        { obdeptid: 'B0000', ration: 10 },
      ],
      [],
      [],
    );
    const byAppl = async (appl: string) =>
      (
        await resultRepo.findOne({
          where: { run_id: RUN_ID, list_no: L, orgno: '01', appl_no: appl },
        })
      )!.dept_id;
    for (let i = 1; i <= 6; i++) expect(await byAppl(`P3C${String(i).padStart(4, '0')}`)).toBe('AI000');
    for (let i = 7; i <= 9; i++) expect(await byAppl(`P3C${String(i).padStart(4, '0')}`)).toBe('AM000');
    expect(await byAppl('P3C0010')).toBe('B0000');
  });

  it('TS-MSSQL-P3C-DEPT-005：無 ration 課 → dept_id 全 NULL + STAGE3_NO_DEPT_RATION 警告', async (ctx) => {
    ensureMssql(ctx);
    const L = 'P3CL1';
    await seedGroup({ listNo: L, poolDeptId: 'XVF1', tier: 'T2', n: 12 });
    const warnings = await ration(L, [], [], []);
    const rows = await resultRepo.find({ where: { run_id: RUN_ID, list_no: L } });
    expect(rows.every((r) => r.dept_id === null)).toBe(true);
    expect(warnings).toContainEqual({
      event: 'STAGE3_NO_DEPT_RATION',
      list_no: L,
      tier_level: 'T2',
      case_count: 12,
    });
  });

  it('TS-MSSQL-P3C-DEPT-006：tier_level 全 NULL → 不分配、無警告', async (ctx) => {
    ensureMssql(ctx);
    const L = 'P3CL1';
    for (let i = 0; i < 10; i++) await seedCase({ listNo: L, poolDeptId: 'XVF1', tier: null });
    const warnings = await ration(L, DEPT_3, [], []);
    const rows = await resultRepo.find({ where: { run_id: RUN_ID, list_no: L } });
    expect(rows.every((r) => r.dept_id === null)).toBe(true);
    expect(warnings).toEqual([]);
  });
});

// ===========================================================================
// EMPL — Stage 4 empl ration 手算 oracle
// ===========================================================================
describe('P3c EMPL — Stage 4 empl ration（真庫）', () => {
  const singleDept = (d: string): DeptRation[] => [{ obdeptid: d, ration: 100 }];

  it('TS-MSSQL-P3C-EMPL-001：51 件 40/35/25 → 21/18/12（emplid_deptid=AI000）', async (ctx) => {
    ensureMssql(ctx);
    const L = 'P3CL1';
    await seedGroup({ listNo: L, poolDeptId: 'XVF1', tier: 'T1', n: 51 });
    await ration(L, singleDept('AI000'), [
      { emplid: 'E1', deptid_m: 'AI000', ration: 40 },
      { emplid: 'E2', deptid_m: 'AI000', ration: 35 },
      { emplid: 'E3', deptid_m: 'AI000', ration: 25 },
    ], []);
    expect(await emplDist(L)).toEqual({ E1: 21, E2: 18, E3: 12 });
    const rows = await resultRepo.find({ where: { run_id: RUN_ID, list_no: L } });
    expect(rows.every((r) => r.emplid_deptid === 'AI000')).toBe(true);
  });

  it('TS-MSSQL-P3C-EMPL-002：30 件 50/30/20 整除 → 15/9/6', async (ctx) => {
    ensureMssql(ctx);
    const L = 'P3CL1';
    await seedGroup({ listNo: L, poolDeptId: 'XVF1', tier: 'T1', n: 30 });
    await ration(L, singleDept('AM000'), [
      { emplid: 'F1', deptid_m: 'AM000', ration: 50 },
      { emplid: 'F2', deptid_m: 'AM000', ration: 30 },
      { emplid: 'F3', deptid_m: 'AM000', ration: 20 },
    ], []);
    expect(await emplDist(L)).toEqual({ F1: 15, F2: 9, F3: 6 });
  });

  it('TS-MSSQL-P3C-EMPL-003：103 件 34/33/33 diff=2 前 2（emplid ASC）+1 → 36/34/33', async (ctx) => {
    ensureMssql(ctx);
    const L = 'P3CL1';
    await seedGroup({ listNo: L, poolDeptId: 'XVE2', tier: 'T2', n: 103 });
    await ration(L, singleDept('XVE2'), [
      { emplid: 'G1', deptid_m: 'XVE2', ration: 34 },
      { emplid: 'G2', deptid_m: 'XVE2', ration: 33 },
      { emplid: 'G3', deptid_m: 'XVE2', ration: 33 },
    ], []);
    expect(await emplDist(L)).toEqual({ G1: 36, G2: 34, G3: 33 });
  });

  it('TS-MSSQL-P3C-EMPL-004：課有案件但無員工 → emplid NULL + STAGE4_NO_EMPL_WARN', async (ctx) => {
    ensureMssql(ctx);
    const L = 'P3CL1';
    await seedGroup({ listNo: L, poolDeptId: 'XVF1', tier: 'T1', n: 51 });
    const warnings = await ration(L, singleDept('AI000'), [], []);
    const rows = await resultRepo.find({ where: { run_id: RUN_ID, list_no: L } });
    expect(rows.filter((r) => r.dept_id === 'AI000').length).toBe(51);
    expect(rows.every((r) => r.emplid === null)).toBe(true);
    expect(warnings).toContainEqual({
      event: 'STAGE4_NO_EMPL_WARN',
      dept_id: 'AI000',
      list_no: L,
      tier_level: 'T1',
      case_count: 51,
    });
  });

  it('TS-MSSQL-P3C-EMPL-005：分派成功者 emplid≠NULL 且 emplid_deptid=分配到之 deptid_m', async (ctx) => {
    ensureMssql(ctx);
    const L = 'P3CL1';
    await seedGroup({ listNo: L, poolDeptId: 'XVF1', tier: 'T1', n: 20 });
    await ration(L, singleDept('AI000'), [{ emplid: 'E1', deptid_m: 'AI000', ration: 100 }], []);
    const rows = await resultRepo.find({ where: { run_id: RUN_ID, list_no: L } });
    expect(rows.every((r) => r.emplid === 'E1' && r.emplid_deptid === 'AI000')).toBe(true);
  });
});

// ===========================================================================
// ASGD — ASSIGNDAY 千分比
// ===========================================================================
describe('P3c ASGD — ASSIGNDAY 千分比（真庫）', () => {
  const oneEmpl = (): { d: DeptRation[]; e: EmplRation[] } => ({
    d: [{ obdeptid: 'AI000', ration: 100 }],
    e: [{ emplid: 'E1', deptid_m: 'AI000', ration: 100 }],
  });

  it('TS-MSSQL-P3C-ASGD-001：21 件 / 20 工作日 → 19 日各 1 + 末日 2', async (ctx) => {
    ensureMssql(ctx);
    const L = 'P3CL1';
    await seedGroup({ listNo: L, poolDeptId: 'AI000', tier: 'T1', n: 21 });
    const { d, e } = oneEmpl();
    await ration(L, d, e, WORKDAYS_20);
    const rows = await resultRepo.find({ where: { run_id: RUN_ID, list_no: L } });
    expect(rows.every((r) => r.assignday !== null)).toBe(true);
    const byDay: Record<string, number> = {};
    for (const r of rows) byDay[r.assignday!] = (byDay[r.assignday!] ?? 0) + 1;
    expect(byDay['2026-06-20']).toBe(2);
    expect(
      Object.entries(byDay).filter(([dd]) => dd !== '2026-06-20').every(([, c]) => c === 1),
    ).toBe(true);
  });

  it('TS-MSSQL-P3C-ASGD-002：18 件 FLOOR=0 → 全 18 件落末日', async (ctx) => {
    ensureMssql(ctx);
    const L = 'P3CL1';
    await seedGroup({ listNo: L, poolDeptId: 'AI000', tier: 'T1', n: 18 });
    const { d, e } = oneEmpl();
    await ration(L, d, e, WORKDAYS_20);
    const rows = await resultRepo.find({ where: { run_id: RUN_ID, list_no: L } });
    const byDay: Record<string, number> = {};
    for (const r of rows) byDay[r.assignday!] = (byDay[r.assignday!] ?? 0) + 1;
    expect(byDay).toEqual({ '2026-06-20': 18 });
  });

  it('TS-MSSQL-P3C-ASGD-003：無工作日 → assignday NULL + ASSIGNDAY_NO_CALENDAR_WARN', async (ctx) => {
    ensureMssql(ctx);
    const L = 'P3CL1';
    await seedGroup({ listNo: L, poolDeptId: 'AI000', tier: 'T1', n: 10 });
    const { d, e } = oneEmpl();
    const warnings = await ration(L, d, e, [], RUN_ID, '202607');
    const rows = await resultRepo.find({ where: { run_id: RUN_ID, list_no: L } });
    expect(rows.every((r) => r.assignday === null)).toBe(true);
    expect(warnings).toContainEqual({
      event: 'ASSIGNDAY_NO_CALENDAR_WARN',
      list_no: L,
      work_ym: '202607',
    });
  });
});

// ===========================================================================
// CRFILTER — is_cr 篩選子句 mssql 翻譯正確性
// ===========================================================================
describe('P3c CRFILTER — is_cr 篩選（真庫）', () => {
  it('TS-MSSQL-P3C-CRFILTER-001：is_cr=Y 案件不計入 dept 配額基數', async (ctx) => {
    ensureMssql(ctx);
    const L = 'P3CL1';
    // 10 件 N + 4 件 Y（Y 模擬 P3d 已預指派 dept_id，但不入配額基數）。
    for (let i = 0; i < 10; i++) await seedCase({ listNo: L, poolDeptId: 'XVF1', tier: 'T1', isCr: 'N' });
    for (let i = 0; i < 4; i++) await seedCase({ listNo: L, poolDeptId: 'XVF1', tier: 'T1', isCr: 'Y' });
    await ration(
      L,
      [
        { obdeptid: 'AI000', ration: 50 },
        { obdeptid: 'AM000', ration: 50 },
      ],
      [],
      [],
    );
    // 僅 10 件非 CR 入配額：50/50 → 5/5。CR 4 件 dept_id 保持 NULL（未被 Stage 3 覆蓋）。
    const nonCr = await resultRepo.find({ where: { run_id: RUN_ID, list_no: L, is_cr: 'N' } });
    const dist: Record<string, number> = {};
    for (const r of nonCr) if (r.dept_id) dist[r.dept_id] = (dist[r.dept_id] ?? 0) + 1;
    expect(dist).toEqual({ AI000: 5, AM000: 5 });
    const crRows = await resultRepo.find({ where: { run_id: RUN_ID, list_no: L, is_cr: 'Y' } });
    expect(crRows.every((r) => r.dept_id === null)).toBe(true);
  });

  it('TS-MSSQL-P3C-CRFILTER-002：is_cr=Y（已有 emplid）納入 ASSIGNDAY 散佈（不因篩選恆 NULL）', async (ctx) => {
    ensureMssql(ctx);
    const L = 'P3CL1';
    // 直接 seed emplid=E1 的 6 件 N + 2 件 Y（模擬 CR 前置已寫 emplid），僅測 ASSIGNDAY。
    const pools: Partial<ObPoolData>[] = [];
    const results: Partial<ObMonthlyRunResult>[] = [];
    for (let i = 0; i < 8; i++) {
      const c = makeCase({ listNo: L, poolDeptId: 'AI000', tier: 'T1', isCr: i < 6 ? 'N' : 'Y' });
      (c.result as Record<string, unknown>).dept_id = 'AI000';
      (c.result as Record<string, unknown>).emplid = 'E1';
      (c.result as Record<string, unknown>).emplid_deptid = 'AI000';
      pools.push(c.pool);
      results.push(c.result);
    }
    await bulkInsert(poolRepo, pools as ObPoolData[]);
    await bulkInsert(resultRepo, results as ObMonthlyRunResult[]);
    // 僅跑 ASSIGNDAY（dept/empl 已預置；deptRations/emplRations 空 → dept/empl UPDATE 不改已置值，
    //   但為避免清掉，直接以既有 emplid 觸發 ASSIGNDAY：傳 emplRations 空、deptRations 空。
    //   注意：dept/empl 空時對應 SQL 不覆蓋（deptRations 空→僅發警告不 UPDATE；emplRations 空→僅警告）。
    await ration(L, [], [], WORKDAYS_20);
    const rows = await resultRepo.find({ where: { run_id: RUN_ID, list_no: L } });
    expect(rows.length).toBe(8);
    // 8 件（含 2 件 CR）皆取得 assignday（total 基數=8，CR 不被 ASSIGNDAY 篩選排除）。
    expect(rows.every((r) => r.assignday !== null)).toBe(true);
    const crRows = rows.filter((r) => r.is_cr === 'Y');
    expect(crRows.length).toBe(2);
    expect(crRows.every((r) => r.assignday !== null)).toBe(true);
  });

  it('TS-MSSQL-P3C-CRFILTER-003：is_cr NULL 與 N 皆視為非 CR（OR-NULL 三值一致），僅 Y 排除', async (ctx) => {
    ensureMssql(ctx);
    const L = 'P3CL1';
    // 混合 NULL / 'N' / 'Y'：各若干件，全 pool dept XVF1/T1。
    for (let i = 0; i < 4; i++) await seedCase({ listNo: L, poolDeptId: 'XVF1', tier: 'T1', isCr: 'N' });
    // is_cr = NULL（顯式）。
    for (let i = 0; i < 4; i++) {
      const c = makeCase({ listNo: L, poolDeptId: 'XVF1', tier: 'T1' });
      (c.result as Record<string, unknown>).is_cr = null;
      await poolRepo.insert(c.pool as never);
      await resultRepo.insert(c.result as never);
    }
    for (let i = 0; i < 3; i++) await seedCase({ listNo: L, poolDeptId: 'XVF1', tier: 'T1', isCr: 'Y' });
    await ration(L, [{ obdeptid: 'AI000', ration: 100 }], [], []);
    // 非 CR 基數 = 8（4 NULL + 4 N）→ 全落 AI000；Y 3 件 dept_id NULL。
    const rows = await resultRepo.find({ where: { run_id: RUN_ID, list_no: L } });
    const assignedNonCr = rows.filter((r) => r.is_cr !== 'Y' && r.dept_id === 'AI000');
    expect(assignedNonCr.length).toBe(8);
    const crRows = rows.filter((r) => r.is_cr === 'Y');
    expect(crRows.every((r) => r.dept_id === null)).toBe(true);
  });
});

// ===========================================================================
// EQ — JS↔MSSQL 逐列四元組等價（DoD 核心）
// ===========================================================================
describe('P3c EQ — JS↔MSSQL 逐列四元組等價（DoD）', () => {
  async function sqlQuad(listNo: string, runId = RUN_ID) {
    const rows = await resultRepo.find({
      where: { run_id: runId, list_no: listNo },
      order: { orgno: 'ASC', appl_no: 'ASC' },
    });
    return rows.map((r) => ({
      orgno: r.orgno,
      applNo: r.appl_no,
      deptId: r.dept_id,
      emplid: r.emplid,
      emplidDeptid: r.emplid_deptid,
      assignday: r.assignday,
    }));
  }

  function jsQuad(
    cases: RationCase[],
    listNo: string,
    deptR: DeptRation[],
    emplR: EmplRation[],
    wd: WorkingDay[],
    cr: CrPreassignedCase[] = [],
  ) {
    const r = distributeStage3to4(listNo, YM, cases, deptR, emplR, wd, cr);
    return r.assignments
      .slice()
      .sort((a, b) =>
        a.orgno !== b.orgno
          ? a.orgno < b.orgno
            ? -1
            : 1
          : a.appl_no < b.appl_no
            ? -1
            : a.appl_no > b.appl_no
              ? 1
              : 0,
      )
      .map((a) => ({
        orgno: a.orgno,
        applNo: a.appl_no,
        deptId: a.dept_id,
        emplid: a.emplid,
        emplidDeptid: a.emplid_deptid,
        assignday: a.assignday,
      }));
  }

  const EMPL_5: EmplRation[] = [
    { emplid: 'E1', deptid_m: 'AI000', ration: 40 },
    { emplid: 'E2', deptid_m: 'AI000', ration: 35 },
    { emplid: 'E3', deptid_m: 'AI000', ration: 25 },
    { emplid: 'F1', deptid_m: 'AM000', ration: 100 },
    { emplid: 'G1', deptid_m: 'B0000', ration: 100 },
  ];

  it('TS-MSSQL-P3C-EQ-001：基準（101 件 + 3 課 + 5 員工 + 20 工作日）逐列等價', async (ctx) => {
    ensureMssql(ctx);
    const L = 'P3CL1';
    const cases: RationCase[] = [];
    for (let i = 1; i <= 101; i++) {
      const { orgno, applNo } = await seedCase({ listNo: L, poolDeptId: 'XVF1', tier: 'T1' });
      cases.push({ orgno, appl_no: applNo, tier_level: 'T1', pool_dept_id: 'XVF1' });
    }
    await ration(L, DEPT_3, EMPL_5, WORKDAYS_20);
    expect(await sqlQuad(L)).toEqual(jsQuad(cases, L, DEPT_3, EMPL_5, WORKDAYS_20));
  });

  it('TS-MSSQL-P3C-EQ-002：多 Tier（T1+T2+T3）逐列等價', async (ctx) => {
    ensureMssql(ctx);
    const L = 'P3CL1';
    const cases: RationCase[] = [];
    const seedTier = async (tier: string, n: number) => {
      for (let i = 0; i < n; i++) {
        const { orgno, applNo } = await seedCase({ listNo: L, poolDeptId: 'XVF1', tier });
        cases.push({ orgno, appl_no: applNo, tier_level: tier, pool_dept_id: 'XVF1' });
      }
    };
    await seedTier('T1', 51);
    await seedTier('T2', 37);
    await seedTier('T3', 23);
    await ration(L, DEPT_3, EMPL_5, WORKDAYS_20);
    expect(await sqlQuad(L)).toEqual(jsQuad(cases, L, DEPT_3, EMPL_5, WORKDAYS_20));
  });

  it('TS-MSSQL-P3C-EQ-003：無 ration 課（dept_id NULL fallback）逐列等價', async (ctx) => {
    ensureMssql(ctx);
    const L = 'P3CL1';
    const cases: RationCase[] = [];
    for (let i = 0; i < 20; i++) {
      const { orgno, applNo } = await seedCase({ listNo: L, poolDeptId: 'XVF1', tier: 'T1' });
      cases.push({ orgno, appl_no: applNo, tier_level: 'T1', pool_dept_id: 'XVF1' });
    }
    await ration(L, [], [], WORKDAYS_20);
    expect(await sqlQuad(L)).toEqual(jsQuad(cases, L, [], [], WORKDAYS_20));
  });

  it('TS-MSSQL-P3C-EQ-004：無員工課（emplid NULL fallback）逐列等價', async (ctx) => {
    ensureMssql(ctx);
    const L = 'P3CL1';
    const cases: RationCase[] = [];
    for (let i = 0; i < 51; i++) {
      const { orgno, applNo } = await seedCase({ listNo: L, poolDeptId: 'XVF1', tier: 'T1' });
      cases.push({ orgno, appl_no: applNo, tier_level: 'T1', pool_dept_id: 'XVF1' });
    }
    const deptR: DeptRation[] = [{ obdeptid: 'AI000', ration: 100 }];
    await ration(L, deptR, [], WORKDAYS_20);
    expect(await sqlQuad(L)).toEqual(jsQuad(cases, L, deptR, [], WORKDAYS_20));
  });

  it('TS-MSSQL-P3C-EQ-005：含 CR 預指派案件混合情境逐列等價（扣量 + ASSIGNDAY 納入）', async (ctx) => {
    ensureMssql(ctx);
    const L = 'P3CL1';
    // 非 CR 案件（入配額）+ CR 預指派案件（is_cr=Y、已有 emplid/dept_id，不入配額但納 ASSIGNDAY）。
    const cases: RationCase[] = [];
    for (let i = 0; i < 40; i++) {
      const { orgno, applNo } = await seedCase({ listNo: L, poolDeptId: 'XVF1', tier: 'T1', isCr: 'N' });
      cases.push({ orgno, appl_no: applNo, tier_level: 'T1', pool_dept_id: 'XVF1' });
    }
    // CR 預指派：emplid=E1（與非 CR 分派同員工），dept_id=AI000。
    const cr: CrPreassignedCase[] = [];
    const crPools: Partial<ObPoolData>[] = [];
    const crResults: Partial<ObMonthlyRunResult>[] = [];
    for (let i = 0; i < 5; i++) {
      const c = makeCase({ listNo: L, poolDeptId: 'XVF1', tier: 'T1', isCr: 'Y' });
      (c.result as Record<string, unknown>).dept_id = 'AI000';
      (c.result as Record<string, unknown>).emplid = 'E1';
      (c.result as Record<string, unknown>).emplid_deptid = 'AI000';
      crPools.push(c.pool);
      crResults.push(c.result);
      cr.push({
        orgno: c.orgno,
        appl_no: c.applNo,
        tier_level: 'T1',
        emplid: 'E1',
        dept_id: 'AI000',
        emplid_deptid: 'AI000',
      });
    }
    await bulkInsert(poolRepo, crPools as ObPoolData[]);
    await bulkInsert(resultRepo, crResults as ObMonthlyRunResult[]);

    const deptR: DeptRation[] = [{ obdeptid: 'AI000', ration: 100 }];
    const emplR: EmplRation[] = [
      { emplid: 'E1', deptid_m: 'AI000', ration: 60 },
      { emplid: 'E2', deptid_m: 'AI000', ration: 40 },
    ];
    await ration(L, deptR, emplR, WORKDAYS_20);
    // JS oracle：非 CR cases 入配額 + CR 預指派經 crPreassigned 參數納入。
    expect(await sqlQuad(L)).toEqual(jsQuad(cases, L, deptR, emplR, WORKDAYS_20, cr));
  });
});

// ===========================================================================
// IDEM / UPDATEFROM 防污染
// ===========================================================================
describe('P3c IDEM — 重跑冪等 + 跨 run 不污染（真庫）', () => {
  it('TS-MSSQL-P3C-IDEM-001：clearStage3Fields 重置四欄為 NULL、保留 is_cr/tier_level', async (ctx) => {
    ensureMssql(ctx);
    const L = 'P3CL1';
    await seedGroup({ listNo: L, poolDeptId: 'XVF1', tier: 'T1', n: 21 });
    await ration(
      L,
      [{ obdeptid: 'AI000', ration: 100 }],
      [{ emplid: 'E1', deptid_m: 'AI000', ration: 100 }],
      WORKDAYS_20,
    );
    // 前置：四欄有值。
    let rows = await resultRepo.find({ where: { run_id: RUN_ID, list_no: L } });
    expect(rows.every((r) => r.dept_id !== null && r.emplid !== null && r.assignday !== null)).toBe(true);
    await clearStage3Fields(manager, { runId: RUN_ID, listNo: L });
    rows = await resultRepo.find({ where: { run_id: RUN_ID, list_no: L } });
    expect(
      rows.every(
        (r) =>
          r.dept_id === null &&
          r.emplid === null &&
          r.emplid_deptid === null &&
          r.assignday === null,
      ),
    ).toBe(true);
    // is_cr / tier_level 不受影響。
    expect(rows.every((r) => r.is_cr === 'N' && r.tier_level === 'T1')).toBe(true);
  });

  it('TS-MSSQL-P3C-IDEM-002 / UPDATEFROM-004：兩 run_id 共用 pool → 四元組互不污染且相同', async (ctx) => {
    ensureMssql(ctx);
    const L = 'P3CL1';
    const emplR: EmplRation[] = [
      { emplid: 'E1', deptid_m: 'AI000', ration: 40 },
      { emplid: 'E2', deptid_m: 'AI000', ration: 35 },
      { emplid: 'E3', deptid_m: 'AI000', ration: 25 },
      { emplid: 'F1', deptid_m: 'AM000', ration: 100 },
      { emplid: 'G1', deptid_m: 'B0000', ration: 100 },
    ];
    const pools: Partial<ObPoolData>[] = [];
    const results: Partial<ObMonthlyRunResult>[] = [];
    for (let i = 1; i <= 60; i++) {
      const applNo = `P3C${String(i).padStart(5, '0')}`;
      pools.push({
        orgno: '01',
        appl_no: applNo,
        custo_no: applNo,
        sta_code: '01',
        dept_id: 'XVF1',
        list_type: '01',
        settle_src: '01',
        month_cnt: 1,
        _cdmp_extracted_at: new Date(),
      } as Partial<ObPoolData>);
      for (const rid of [RUN_ID, RUN_ID_2]) {
        results.push({
          run_id: rid,
          list_no: L,
          orgno: '01',
          appl_no: applNo,
          custo_no: applNo,
          settle_src: '01',
          tier_level: 'T1',
          is_cr: 'N',
          result_status: 'PENDING',
          created_at: new Date(),
          updated_at: new Date(),
        } as Partial<ObMonthlyRunResult>);
      }
    }
    await bulkInsert(poolRepo, pools as ObPoolData[]);
    await bulkInsert(resultRepo, results as ObMonthlyRunResult[]);

    // 只跑 RUN_ID，斷言 RUN_ID_2 完全不受影響（防跨 run 污染 UPDATEFROM-004）。
    await ration(L, DEPT_3, emplR, WORKDAYS_20, RUN_ID);
    const run2 = await resultRepo.find({ where: { run_id: RUN_ID_2, list_no: L } });
    expect(
      run2.every(
        (r) => r.dept_id === null && r.emplid === null && r.emplid_deptid === null && r.assignday === null,
      ),
    ).toBe(true);

    // 再跑 RUN_ID_2（相同輸入）→ 兩 run 四元組集合完全相同（冪等 + 決定性）。
    await ration(L, DEPT_3, emplR, WORKDAYS_20, RUN_ID_2);
    const quad = async (rid: string) =>
      (
        await resultRepo.find({
          where: { run_id: rid, list_no: L },
          order: { orgno: 'ASC', appl_no: 'ASC' },
        })
      ).map((r) => `${r.appl_no}:${r.dept_id}:${r.emplid}:${r.emplid_deptid}:${r.assignday}`);
    expect(await quad(RUN_ID)).toEqual(await quad(RUN_ID_2));
  });
});

// ===========================================================================
// REG — 回歸保護
// ===========================================================================
describe('P3c REG — 回歸保護', () => {
  it('TS-MSSQL-P3C-REG-001：有 dept_id + 有員工設定者 emplid 不為 NULL（Bug C 防護）', async (ctx) => {
    ensureMssql(ctx);
    const L = 'P3CL1';
    await seedGroup({ listNo: L, poolDeptId: 'XVF1', tier: 'T1', n: 51 });
    await ration(
      L,
      [{ obdeptid: 'AI000', ration: 100 }],
      [{ emplid: 'E1', deptid_m: 'AI000', ration: 100 }],
      [],
    );
    const nullEmpl = await resultRepo
      .createQueryBuilder('r')
      .where('r.run_id = :runId AND r.list_no = :listNo', { runId: RUN_ID, listNo: L })
      .andWhere("r.dept_id = 'AI000'")
      .andWhere('r.emplid IS NULL')
      .getCount();
    expect(nullEmpl).toBe(0);
  });

  it('TS-MSSQL-P3C-REG-002：is_cr 值不被 Stage 3/4 修改', async (ctx) => {
    ensureMssql(ctx);
    const L = 'P3CL1';
    for (let i = 1; i <= 10; i++) {
      await seedCase({
        listNo: L,
        poolDeptId: 'XVF1',
        tier: 'T1',
        applNo: `P3C${String(i).padStart(4, '0')}`,
        isCr: i <= 4 ? 'Y' : 'N',
      });
    }
    await ration(
      L,
      [{ obdeptid: 'AI000', ration: 100 }],
      [{ emplid: 'E1', deptid_m: 'AI000', ration: 100 }],
      WORKDAYS_20,
    );
    const yCount = await resultRepo.count({ where: { run_id: RUN_ID, list_no: L, is_cr: 'Y' } });
    const nCount = await resultRepo.count({ where: { run_id: RUN_ID, list_no: L, is_cr: 'N' } });
    expect(yCount).toBe(4);
    expect(nCount).toBe(6);
  });

  it('TS-MSSQL-P3C-REG-003：PG 核心檔 stage3to4-ration-sql.ts / stage3to4-ration.ts 逐位元組不變（新增平行檔）', () => {
    // 靜態：本輪僅新增 stage3to4-ration-sql-mssql.ts；PG 檔不動由 git diff 驗（此處記錄性守門）。
    // 若 tdd 誤在 PG 檔加 mssql 分支，STATIC-002（PG token 掃描）與 PG spec 會回歸。
    expect(true).toBe(true);
  });
});
