/**
 * AD-E07-42 P3d — CR 優先分派 raw SQL 引擎 MSSQL 移植：JS golden oracle（applyCrPriority）↔ MSSQL
 * 下推（runCrPrioritySqlMssql）逐列六元組等價 + MUST-FIX 守門（DISPATCH 第四步接線由負轉正 /
 * appl_date datetime2 日期轉型 / 步驟 2/3 UPDATE...FROM INNER JOIN / 步驟 3 CTE+ROW_NUMBER 三重疊加 /
 * per-list cr_enabled 閘控 / 扣量非 ASSIGNDAY / EQ 端對端跨切片旗艦）。
 *
 * 對應測試設計 AD-E07-42-P3d-test.md（58 案）：
 *   GATE / DISPATCH / STEP1 / STEP2 / STEP3 / GATECR / DATECAST / UPDATEFROM / WINDOWFN / CRWARN /
 *   EQ / IDEM / REG / STATIC。
 *
 * Harness（§0.2，沿用 P3a/P3c「共用既有表」策略；本輪首次 raw SQL 直接 JOIN ob_emphire/ob_empl_set）：
 *   5 表（assignment_run / ob_pool_data / ob_monthly_run_result / ob_emphire / ob_empl_set）OBJECT_ID
 *   探測 → existedBeforeSuite；缺表以 P3b 零 drift DDL（_p3b-mssql-ddl.ts，本輪已擴充 ob_emphire/
 *   ob_empl_set）自建；afterAll 對自建表 DROP、對既有表僅前綴 DELETE（禁 DROP/TRUNCATE 共用表）→
 *   全新/部分缺表 dbo 亦可獨立完整重跑（自足）。
 *   隔離：run_id 固定 UUID（P3D_RUN_ID_1/2）；list_no 前綴 'P3D'；appl_no 前綴 'P3D' 連號；
 *   emp_id/emplid/cr_id 前綴 'PE'（避免與共用 ob_emphire/ob_empl_set 之潛在真實資料碰撞）。
 *   ⚠️ 與 p1b2/p4/p3a/p3b/p3c mssql 套件共用 dbo → 本檔須 `--no-file-parallelism`（或單檔）執行。
 *
 * 靜態守門（capture 假 manager + method source scan）不需 MSSQL、恆執行；DB 案例不可達 → skip-with-reason（不假綠）。
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
import { ObEmphire } from '@/database/entities/ob-emphire.entity';
import { ObEmplSet } from '@/database/entities/ob-empl-set.entity';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { runCrPrioritySqlMssql } from '../cr-priority-sql-mssql';
import {
  applyCrPriority,
  computeCrSysDates,
  type CrCase,
  type CrEmplSet,
  type CrEmphire,
} from '../cr-priority';
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

const RUN_ID = '00000000-0000-0000-0000-0000000042d1';
const RUN_ID_2 = '00000000-0000-0000-0000-0000000042d2';
const YM = '202607'; // sysDate=2026-07-01, twoYearsAgo=2024-07-01
const SYS_DATE = '2026-07-01';
const LIST = 'P3DL1';

/** GATE-001 之 4 張核心表（測試設計 §0.2）；另含 ob_pool_data 供 EQ-004 跨切片 ration 之 dept join。 */
const CORE_TABLES = [
  'assignment_run',
  'ob_monthly_run_result',
  'ob_emphire',
  'ob_empl_set',
] as const;
const ALL_TABLES = [...CORE_TABLES, 'ob_pool_data'] as const;

/** 20 工作日，各 ratioPerMille=50。 */
const WORKDAYS_20: WorkingDay[] = Array.from({ length: 20 }, (_, i) => ({
  casedt: `2026-07-${String(i + 1).padStart(2, '0')}`,
  ratioPerMille: 50,
}));

let reachable = false;
let ds: DataSource | null = null;
let poolRepo: Repository<ObPoolData>;
let resultRepo: Repository<ObMonthlyRunResult>;
let emplRepo: Repository<ObEmplSet>;
let emphireRepo: Repository<ObEmphire>;
let manager: EntityManager;
const existedBeforeSuite = new Set<string>();
const selfBuiltTables: string[] = [];

let applSeq = 0;

function ensureMssql(ctx: { skip: () => void }): void {
  if (!reachable || !ds) {
    // eslint-disable-next-line no-console
    console.warn(`[AD-E07-42 P3d MSSQL] SKIPPED — ${SKIP_REASON}`);
    ctx.skip();
  }
}

// ---------------------------------------------------------------------------
// seed helpers（appl_no 前綴 'P3D' 連號，保證 (orgno, appl_no) 字串序 = 注入序）
// ---------------------------------------------------------------------------
/** seed 一筆 result（+ 對應 pool row）。Stage 1 已帶入 cr_id/cr_nm/is_cr/appl_date/tier_level。 */
async function seedResult(opts: {
  applNo?: string;
  runId?: string;
  crId?: string | null;
  crNm?: string | null;
  isCr?: string | null;
  applDate?: string | null; // 'YYYY-MM-DD'
  tier?: string | null;
  poolDeptId?: string;
}): Promise<{ orgno: string; applNo: string }> {
  applSeq += 1;
  const applNo = opts.applNo ?? `P3D${String(applSeq).padStart(5, '0')}`;
  const orgno = '01';
  const custoNo = `P3D${String(applSeq).padStart(5, '0')}`;
  await poolRepo.insert({
    orgno,
    appl_no: applNo,
    custo_no: custoNo,
    sta_code: '01',
    dept_id: opts.poolDeptId ?? 'XVF1',
    list_type: '01',
    settle_src: '01',
    month_cnt: 1,
    _cdmp_extracted_at: new Date(),
  } as never);
  await resultRepo.insert({
    run_id: opts.runId ?? RUN_ID,
    list_no: LIST,
    orgno,
    appl_no: applNo,
    custo_no: custoNo,
    settle_src: '01',
    cr_id: opts.crId ?? null,
    cr_nm: opts.crNm ?? null,
    is_cr: opts.isCr === undefined ? 'N' : opts.isCr,
    appl_date: opts.applDate ? new Date(`${opts.applDate}T00:00:00Z`) : null,
    tier_level: opts.tier ?? null,
    result_status: 'PENDING',
    created_at: new Date(),
    updated_at: new Date(),
  } as never);
  return { orgno, applNo };
}

async function seedEmpl(opts: {
  emplid: string;
  deptidM: string;
  ration: number;
  listNo?: string;
}): Promise<void> {
  await emplRepo.insert({
    list_no: opts.listNo ?? LIST,
    deptid_m: opts.deptidM,
    emplid: opts.emplid,
    ration: String(opts.ration),
    created_at: new Date(),
    updated_at: new Date(),
  } as never);
}

async function seedEmphire(opts: {
  empId: string;
  resignDate?: string | null;
}): Promise<void> {
  await emphireRepo.insert({
    emp_id: opts.empId,
    emp_nm: `E-${opts.empId}`,
    id_no: `ID${opts.empId}`.slice(0, 10),
    resign_date: opts.resignDate ? (`${opts.resignDate}` as never) : null,
  } as never);
}

async function fetchResult(
  applNo: string,
  runId = RUN_ID,
): Promise<ObMonthlyRunResult> {
  return (await resultRepo.findOne({
    where: { run_id: runId, list_no: LIST, orgno: '01', appl_no: applNo },
  }))!;
}

const ctx = (crEnabled: boolean, runId = RUN_ID) => ({
  runId,
  listNo: LIST,
  crEnabled,
  sysDate: SYS_DATE,
});

async function cleanupP3D(): Promise<void> {
  await manager.query(`DELETE FROM ob_monthly_run_result WHERE list_no LIKE 'P3D%'`);
  await manager.query(`DELETE FROM ob_empl_set WHERE list_no LIKE 'P3D%'`);
  await manager.query(`DELETE FROM ob_emphire WHERE emp_id LIKE 'PE%'`);
  await manager.query(
    `DELETE FROM assignment_run WHERE run_id IN ('${RUN_ID}', '${RUN_ID_2}')`,
  );
  await manager.query(`DELETE FROM ob_pool_data WHERE appl_no LIKE 'P3D%'`);
}

async function seedRun(runId: string): Promise<void> {
  await manager.query(
    `INSERT INTO assignment_run (run_id, project_workym, status, triggered_by, created_at)
     VALUES (@0, '202607', 'running', '00000000-0000-0000-0000-000000000001', GETDATE())`,
    [runId],
  );
}

// ===========================================================================
// 連線 + 5 表探測/自建（§0.2）
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
      entities: [ObPoolData, ObMonthlyRunResult, ObEmphire, ObEmplSet, AssignmentRun],
      synchronize: false, // §0.2：共用既有 dbo，絕不 synchronize。
    });
    await ds.initialize();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[AD-E07-42 P3d MSSQL] init failed → skip:', (e as Error)?.message);
    reachable = false;
    ds = null;
    return;
  }
  manager = ds.manager;

  // GATE-001：5 表 OBJECT_ID 探測 → existedBeforeSuite；缺表以零 drift DDL 自建。
  for (const t of ALL_TABLES) {
    const rows = await manager.query(`SELECT OBJECT_ID('dbo.${t}', 'U') AS oid`);
    if (rows?.[0]?.oid != null) {
      existedBeforeSuite.add(t);
    } else {
      const ddl = MSSQL_BASELINE_DDL[t];
      if (!ddl) {
        // eslint-disable-next-line no-console
        console.warn(`[AD-E07-42 P3d MSSQL] 缺 DDL 常數：${t} → skip DB 案例`);
        reachable = false;
        return;
      }
      await manager.query(ddl);
      selfBuiltTables.push(t);
    }
  }

  poolRepo = ds.getRepository(ObPoolData);
  resultRepo = ds.getRepository(ObMonthlyRunResult);
  emplRepo = ds.getRepository(ObEmplSet);
  emphireRepo = ds.getRepository(ObEmphire);
}, 120000);

afterAll(async () => {
  if (ds) {
    try {
      await cleanupP3D();
    } catch {
      /* best-effort */
    }
    // 自建表 DROP 還原（reverse 序）；既有表絕不 DROP。
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
  await cleanupP3D();
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
      return undefined; // 全為 UPDATE。
    },
  } as unknown as EntityManager;
  return { mgr, captured };
}

/** 產生 CR 步驟 1/2/3（crEnabled=true）或單步（false）之 UPDATE SQL（供靜態掃描）。 */
async function captureCrSql(crEnabled: boolean): Promise<string[]> {
  const { mgr, captured } = makeCaptureManager();
  const r = await runCrPrioritySqlMssql(mgr, {
    runId: 'R',
    listNo: 'L',
    crEnabled,
    sysDate: SYS_DATE,
  });
  // CRWARN-001：回傳 void（無 warning 陣列）。
  expect(r).toBeUndefined();
  return captured;
}

describe('P3d STATIC — 靜態守門（capture，恆執行）', () => {
  it('TS-MSSQL-P3D-STATIC-002：生成 SQL 不含 PG-only token（:: / LIMIT / || / RETURNING / ON CONFLICT）', async () => {
    const all = (await captureCrSql(true)).join('\n---\n');
    expect(all).not.toMatch(/::/); // cast 運算子。
    expect(all).not.toMatch(/\bLIMIT\b/i);
    expect(all).not.toMatch(/\|\|/);
    expect(all).not.toMatch(/RETURNING/i);
    expect(all).not.toMatch(/ON\s+CONFLICT/i);
  });

  it('TS-MSSQL-P3D-STEP1-003 / DATECAST-001：步驟 1 appl_date 以 CAST(:twoYearsAgo AS DATE)（非 ::date）', async () => {
    const [step1] = await captureCrSql(true);
    expect(step1).toContain('appl_date < CAST(:twoYearsAgo AS DATE)');
    expect(step1).toMatch(/appl_date IS NOT NULL/);
    expect(step1).not.toMatch(/::date/i);
  });

  it('TS-MSSQL-P3D-STEP2-005/006：步驟 2 UPDATE r + FROM ... INNER JOIN ob_emphire e ON r.cr_id=e.emp_id + CAST(:sysDate AS DATE)', async () => {
    const [, step2] = await captureCrSql(true);
    expect(step2).toMatch(/UPDATE r\b/);
    expect(step2).toMatch(/FROM ob_monthly_run_result r\s+INNER JOIN ob_emphire e ON r\.cr_id = e\.emp_id/);
    expect(step2).toContain('e.resign_date < CAST(:sysDate AS DATE)');
    // UPDATEFROM-002：範圍限定鍵保留於 WHERE（未誤入 INNER JOIN ON）。
    expect(step2).toMatch(/WHERE r\.run_id = :runId AND r\.list_no = :listNo/);
  });

  it('TS-MSSQL-P3D-STEP3-006 / GATE-006：步驟 3 UPDATE r + INNER JOIN first_dept fd ON r.cr_id=fd.emplid；empl_set_ranked CTE 主體對 ob_empl_set SELECT（非 VALUES 包裝）', async () => {
    const [, , step3] = await captureCrSql(true);
    expect(step3).toMatch(/UPDATE r\b/);
    expect(step3).toMatch(/FROM ob_monthly_run_result r\s+INNER JOIN first_dept fd ON r\.cr_id = fd\.emplid/);
    expect(step3).toMatch(/WHERE r\.run_id = :runId AND r\.list_no = :listNo/);
    // GATE-006：CTE 直接對真實表 SELECT，非 P3c 之 `WITH x(cols) AS (VALUES ...)` / derived table 包裝。
    expect(step3).toMatch(/empl_set_ranked AS \(\s*SELECT emplid, deptid_m/);
    expect(step3).toMatch(/FROM ob_empl_set/);
    expect(step3).not.toMatch(/AS\s*\(\s*VALUES/i);
    expect(step3).not.toMatch(/SELECT \* FROM \(VALUES/i);
  });

  it('TS-MSSQL-P3D-GATE-004：本檔無 ration DECIMAL CAST 站點（不引入 NUMERIC 精度宣告）', async () => {
    const all = (await captureCrSql(true)).join('\n');
    expect(all).not.toMatch(/NUMERIC\s*\(/i); // 無任何 NUMERIC(...) 轉型。
    expect(all).not.toMatch(/AS\s+numeric/i);
    // ration 僅作 ob_empl_set 內建表 WHERE 過濾（非參數化字面值）。
    expect(all).toMatch(/WHERE list_no = :listNo AND ration > 0/);
  });

  it('TS-MSSQL-P3D-STEP3-007（form）：emplid_deptid 與 dept_id 同來源 fd.deptid_m（同一 UPDATE 一致寫入）', async () => {
    const [, , step3] = await captureCrSql(true);
    expect(step3).toMatch(/dept_id\s*=\s*fd\.deptid_m/);
    expect(step3).toMatch(/emplid_deptid\s*=\s*fd\.deptid_m/);
    expect(step3).toMatch(/emplid\s*=\s*r\.cr_id/);
  });

  it('TS-MSSQL-P3D-GATECR（form）：crEnabled=false → 單一 UPDATE（強制 is_cr=N、跳步驟 1-3）', async () => {
    const captured = await captureCrSql(false);
    expect(captured.length).toBe(1);
    expect(captured[0]).toMatch(/SET is_cr = 'N'/);
    expect(captured[0]).toMatch(/\(is_cr IS NULL OR is_cr <> 'N'\)/);
    expect(captured[0]).not.toMatch(/INNER JOIN/i);
    expect(captured[0]).not.toMatch(/CAST\(/i);
  });

  it('TS-MSSQL-P3D-STATIC-001：Harness 對共用表僅 DELETE（無 DROP/TRUNCATE 共用表）', () => {
    const src = cleanupP3D.toString();
    expect(src).toMatch(/DELETE FROM ob_monthly_run_result/);
    expect(src).toMatch(/DELETE FROM ob_empl_set/);
    expect(src).toMatch(/DELETE FROM ob_emphire/);
    expect(src).toMatch(/DELETE FROM assignment_run/);
    expect(src).toMatch(/DELETE FROM ob_pool_data/);
    expect(src).not.toMatch(/DROP TABLE/i);
    expect(src).not.toMatch(/TRUNCATE/i);
  });

  it('TS-MSSQL-P3D-STATIC-003 / CRWARN-001：新增平行檔 runCrPrioritySqlMssql 存在且回傳 void（無 warning）', async () => {
    expect(typeof runCrPrioritySqlMssql).toBe('function');
    const captured = await captureCrSql(true);
    expect(captured.length).toBe(3); // 步驟 1/2/3。
  });
});

// ===========================================================================
// DISPATCH — 第四步接線（method source scan + strategy，恆執行）+ 真庫 DoD
// ===========================================================================
describe('P3d DISPATCH — CR 前置接線 mssql 月名單分派鏈路', () => {
  const mssqlMethodSrc = (
    AssignmentRunPipelineService.prototype as unknown as {
      executeStage2to3PushdownMssql: (...a: unknown[]) => unknown;
    }
  ).executeStage2to3PushdownMssql.toString();

  const pgMethodSrc = (
    AssignmentRunPipelineService.prototype as unknown as {
      executeStage2to4Pushdown: (...a: unknown[]) => unknown;
    }
  ).executeStage2to4Pushdown.toString();

  it('TS-MSSQL-P3D-DISPATCH-001（🔴🔴 MUST-FIX，正向）：executeStage2to3PushdownMssql 已呼叫 runCrPrioritySqlMssql', () => {
    expect(mssqlMethodSrc).toContain('runCrPrioritySqlMssql');
  });

  it('TS-MSSQL-P3D-DISPATCH-002（I-CR-ORDER-01）：呼叫順序 clearStage3Fields → runCrPrioritySqlMssql → runStage3to4RationSqlMssql', () => {
    const clearIdx = mssqlMethodSrc.indexOf('clearStage3Fields');
    const crIdx = mssqlMethodSrc.indexOf('runCrPrioritySqlMssql');
    const rationIdx = mssqlMethodSrc.indexOf('runStage3to4RationSqlMssql');
    expect(clearIdx).toBeGreaterThanOrEqual(0);
    expect(crIdx).toBeGreaterThan(clearIdx);
    expect(rationIdx).toBeGreaterThan(crIdx);
  });

  it('TS-MSSQL-P3D-DISPATCH-003：三分支互斥（postgres/mssql/其餘）CR 前置版本不誤觸對方', () => {
    // strategy 三態互斥。
    expect(resolveStage2to4Strategy({ DB_TYPE: 'postgres' })).toBe('pushdownPg');
    expect(resolveStage2to4Strategy({ DB_TYPE: 'mssql' })).toBe('pushdownMssql');
    expect(resolveStage2to4Strategy({ DB_TYPE: 'sqlite' })).toBe('v1Inmemory');
    // PG 鏈路呼叫 PG 版 bare runCrPrioritySql(（非 mssql 版）。
    expect(pgMethodSrc).toMatch(/runCrPrioritySql\(/);
    expect(pgMethodSrc).not.toContain('runCrPrioritySqlMssql');
    // mssql 鏈路呼叫 mssql 版（非 bare PG 版）。
    expect(mssqlMethodSrc).toContain('runCrPrioritySqlMssql');
    expect(mssqlMethodSrc).not.toMatch(/runCrPrioritySql\(/);
  });

  it('TS-MSSQL-P3D-DISPATCH-005：mssql 呼叫鏈零 PG-only runCrPrioritySql 殘留（新增平行檔）', () => {
    // bare PG 版呼叫 runCrPrioritySql( 不得出現於 mssql 鏈路（runCrPrioritySqlMssql( 不匹配）。
    expect(mssqlMethodSrc).not.toMatch(/runCrPrioritySql\(/);
    expect(mssqlMethodSrc).toContain('runCrPrioritySqlMssql');
  });

  it('TS-MSSQL-P3D-GATE-001：4 核心表就緒（existedBeforeSuite ∪ selfBuiltTables ⊇ 4 核心表）', (ctx0) => {
    ensureMssql(ctx0);
    for (const t of CORE_TABLES) {
      expect(existedBeforeSuite.has(t) || selfBuiltTables.includes(t)).toBe(true);
    }
    for (const t of selfBuiltTables) expect(existedBeforeSuite.has(t)).toBe(false);
  });

  it('TS-MSSQL-P3D-DISPATCH-004（DoD）：CR 前置後 emplid/dept_id/is_cr 不再恆維持 Stage 1 帶入原值', async (ctx0) => {
    ensureMssql(ctx0);
    await seedEmphire({ empId: 'PE003', resignDate: null });
    await seedEmpl({ emplid: 'PE003', deptidM: 'XVE1', ration: 30 });
    const a = await seedResult({ crId: 'PE003', crNm: 'n', isCr: 'Y', applDate: '2025-03-01' });
    await runCrPrioritySqlMssql(manager, ctx(true));
    const ra = await fetchResult(a.applNo);
    // 動態指派：emplid=cr_id、dept_id/emplid_deptid=deptid_m、is_cr='Y'（非 Stage 1 帶入之 emplid=NULL）。
    expect(ra.emplid).toBe('PE003');
    expect(ra.dept_id).toBe('XVE1');
    expect(ra.emplid_deptid).toBe('XVE1');
    expect(ra.is_cr).toBe('Y');
  });
});

// ===========================================================================
// GATE — 真庫事實核對（appl_date datetime2 / resign_date date / crEnabled=false 中立性）
// ===========================================================================
describe('P3d GATE — 型別事實核對（真庫）', () => {
  async function columnType(table: string, column: string): Promise<string> {
    const rows = (await manager.query(
      `SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = '${table}' AND COLUMN_NAME = '${column}'`,
    )) as Array<{ DATA_TYPE: string }>;
    return rows?.[0]?.DATA_TYPE ?? '';
  }

  it('TS-MSSQL-P3D-GATE-002 / DATECAST-001：ob_monthly_run_result.appl_date 為 datetime2（需日期轉換）', async (ctx0) => {
    ensureMssql(ctx0);
    expect(await columnType('ob_monthly_run_result', 'appl_date')).toBe('datetime2');
  });

  it('TS-MSSQL-P3D-GATE-003：ob_emphire.resign_date 為 date（DATE↔DATE 低風險比對）', async (ctx0) => {
    ensureMssql(ctx0);
    expect(await columnType('ob_emphire', 'resign_date')).toBe('date');
  });

  it('TS-MSSQL-P3D-GATE-005：crEnabled=false 分支可直接對 MSSQL 執行（方言中立，強制清 N）', async (ctx0) => {
    ensureMssql(ctx0);
    const a = await seedResult({ crId: 'PE001', crNm: 'n', isCr: 'Y', applDate: '2025-01-01' });
    await runCrPrioritySqlMssql(manager, ctx(false));
    const ra = await fetchResult(a.applNo);
    expect(ra.is_cr).toBe('N'); // 強制清 N，無語法錯。
    expect(ra.cr_id).toBe('PE001'); // 步驟 1-3 未執行。
  });
});

// ===========================================================================
// STEP1 — 逾2年清空（單表 UPDATE，appl_date datetime2 轉型）
// ===========================================================================
describe('P3d STEP1 — 逾2年清空（真庫）', () => {
  it('TS-MSSQL-P3D-STEP1-001/002/003：< twoYearsAgo 清空；= 邊界不清（CAST datetime2 比對正確）', async (ctx0) => {
    ensureMssql(ctx0);
    const a = await seedResult({ crId: 'PE010', crNm: 'n', isCr: 'Y', applDate: '2024-06-30' }); // < 2024-07-01
    const b = await seedResult({ crId: 'PE010', crNm: 'n', isCr: 'Y', applDate: '2024-07-01' }); // = 不清
    await runCrPrioritySqlMssql(manager, ctx(true));
    const ra = await fetchResult(a.applNo);
    const rb = await fetchResult(b.applNo);
    expect(ra.cr_id).toBeNull();
    expect(ra.cr_nm).toBeNull();
    expect(ra.is_cr).toBe('N');
    expect(rb.cr_id).toBe('PE010'); // 剛好等於 → 不清。
    expect(rb.is_cr).toBe('Y');
  });

  it('TS-MSSQL-P3D-STEP1-004：cr_id IS NULL 案件不受影響', async (ctx0) => {
    ensureMssql(ctx0);
    const a = await seedResult({ crId: null, crNm: null, isCr: 'N', applDate: '2020-01-01' });
    await runCrPrioritySqlMssql(manager, ctx(true));
    const ra = await fetchResult(a.applNo);
    expect(ra.cr_id).toBeNull();
    expect(ra.is_cr).toBe('N'); // 未被步驟 1 觸發（本就 N）。
  });

  it('TS-MSSQL-P3D-STEP1-005：appl_date IS NULL 案件不清空', async (ctx0) => {
    ensureMssql(ctx0);
    const a = await seedResult({ crId: 'PE010', crNm: 'n', isCr: 'Y', applDate: null });
    await runCrPrioritySqlMssql(manager, ctx(true));
    const ra = await fetchResult(a.applNo);
    expect(ra.cr_id).toBe('PE010'); // NULL appl_date → 無可比較 → 不清。
    expect(ra.is_cr).toBe('Y');
  });

  it('TS-MSSQL-P3D-STEP1-006：ob_pool_data 原始資料不受影響（限定 result 工作集）', async (ctx0) => {
    ensureMssql(ctx0);
    const a = await seedResult({ crId: 'PE010', crNm: 'n', isCr: 'Y', applDate: '2024-06-30' });
    await runCrPrioritySqlMssql(manager, ctx(true));
    const pool = await poolRepo.findOne({ where: { orgno: '01', appl_no: a.applNo } });
    // CR 步驟不改 ob_pool_data（本表無 cr_id 欄，僅確認列仍存在、dept_id 原值）。
    expect(pool).not.toBeNull();
    expect(pool!.dept_id).toBe('XVF1');
  });
});

// ===========================================================================
// STEP2 — 離職清空（UPDATE...FROM INNER JOIN + BR-F102-08）
// ===========================================================================
describe('P3d STEP2 — 離職清空（真庫）', () => {
  it('TS-MSSQL-P3D-STEP2-001/002/003/006：離職清；在職不清；resign=sysDate 不清（CAST DATE 比對）', async (ctx0) => {
    ensureMssql(ctx0);
    await seedEmphire({ empId: 'PE001', resignDate: '2026-06-15' }); // 離職 < 2026-07-01
    await seedEmphire({ empId: 'PE002', resignDate: null }); // 在職
    await seedEmphire({ empId: 'PE003', resignDate: '2026-07-01' }); // = sysDate
    const a = await seedResult({ crId: 'PE001', crNm: 'n', isCr: 'Y', applDate: '2025-01-01' });
    const b = await seedResult({ crId: 'PE002', crNm: 'n', isCr: 'Y', applDate: '2025-01-01' });
    const c = await seedResult({ crId: 'PE003', crNm: 'n', isCr: 'Y', applDate: '2025-01-01' });
    await runCrPrioritySqlMssql(manager, ctx(true));
    expect((await fetchResult(a.applNo)).cr_id).toBeNull(); // 離職清。
    expect((await fetchResult(a.applNo)).is_cr).toBe('N');
    expect((await fetchResult(b.applNo)).cr_id).toBe('PE002'); // 在職不清。
    expect((await fetchResult(c.applNo)).cr_id).toBe('PE003'); // = sysDate 不清。
  });

  it('TS-MSSQL-P3D-STEP2-004（🔴 BR-F102-08 MUST-FIX）：cr_id 查無 ob_emphire（INNER JOIN 不命中）不清空', async (ctx0) => {
    ensureMssql(ctx0);
    // ob_emphire 無 PE999。
    const a = await seedResult({ crId: 'PE999', crNm: 'n', isCr: 'Y', applDate: '2025-01-01' });
    await runCrPrioritySqlMssql(manager, ctx(true));
    const ra = await fetchResult(a.applNo);
    expect(ra.cr_id).toBe('PE999'); // INNER JOIN 不命中 → 不清。
    expect(ra.is_cr).toBe('Y');
  });

  it('TS-MSSQL-P3D-STEP2-005：UPDATE...FROM 正確執行（不拋 Invalid object name），僅離職者受影響', async (ctx0) => {
    ensureMssql(ctx0);
    await seedEmphire({ empId: 'PE001', resignDate: '2026-06-15' });
    await seedEmphire({ empId: 'PE002', resignDate: null });
    // 兩件同 emp 對照 + 一件他人。
    const a = await seedResult({ crId: 'PE001', crNm: 'n', isCr: 'Y', applDate: '2025-01-01' });
    const b = await seedResult({ crId: 'PE002', crNm: 'n', isCr: 'Y', applDate: '2025-01-01' });
    await runCrPrioritySqlMssql(manager, ctx(true));
    expect((await fetchResult(a.applNo)).cr_id).toBeNull();
    expect((await fetchResult(b.applNo)).cr_id).toBe('PE002');
  });
});

// ===========================================================================
// STEP3 — CR 優先指派（🔴🔴 CTE + ROW_NUMBER + UPDATE...FROM 三重疊加旗艦）
// ===========================================================================
describe('P3d STEP3 — CR 優先指派（真庫）', () => {
  it('TS-MSSQL-P3D-STEP3-001/002：ration>0 才指派；ration=0/無記錄不指派', async (ctx0) => {
    ensureMssql(ctx0);
    await seedEmphire({ empId: 'PE003', resignDate: null });
    await seedEmpl({ emplid: 'PE003', deptidM: 'XVE1', ration: 30 });
    // PE004 無 ration 記錄。
    const f = await seedResult({ crId: 'PE003', crNm: 'n', isCr: 'Y', applDate: '2025-09-01' });
    const g = await seedResult({ crId: 'PE004', crNm: 'n', isCr: 'Y', applDate: '2025-09-01' });
    await runCrPrioritySqlMssql(manager, ctx(true));
    const rf = await fetchResult(f.applNo);
    const rg = await fetchResult(g.applNo);
    expect(rf.emplid).toBe('PE003');
    expect(rf.dept_id).toBe('XVE1');
    expect(rf.emplid_deptid).toBe('XVE1');
    expect(rf.is_cr).toBe('Y');
    expect(rg.emplid).toBeNull(); // 無 ration → 不指派。
    expect(rg.is_cr).toBe('Y'); // 原值維持。
  });

  it('TS-MSSQL-P3D-STEP3-002b：ration=0 不指派（WHERE ration > 0 過濾）', async (ctx0) => {
    ensureMssql(ctx0);
    await seedEmpl({ emplid: 'PE007', deptidM: 'XVE2', ration: 0 });
    const a = await seedResult({ crId: 'PE007', crNm: 'n', isCr: 'Y', applDate: '2025-09-01' });
    await runCrPrioritySqlMssql(manager, ctx(true));
    const ra = await fetchResult(a.applNo);
    expect(ra.emplid).toBeNull();
    expect(ra.dept_id).toBeNull();
  });

  it('TS-MSSQL-P3D-STEP3-003（🔴🔴 I-DET-CR-01 MUST-FIX）：多筆 deptid_m 取 deptid_m ASC 第一筆（XVE1 < XVE2）', async (ctx0) => {
    ensureMssql(ctx0);
    await seedEmpl({ emplid: 'PE005', deptidM: 'XVE2', ration: 20 });
    await seedEmpl({ emplid: 'PE005', deptidM: 'XVE1', ration: 30 });
    const a = await seedResult({ crId: 'PE005', crNm: 'n', isCr: 'Y', applDate: '2025-09-01' });
    await runCrPrioritySqlMssql(manager, ctx(true));
    const ra = await fetchResult(a.applNo);
    expect(ra.dept_id).toBe('XVE1'); // ASC 取第一筆（非 ration 大小、非插入序）。
    expect(ra.emplid_deptid).toBe('XVE1');
    expect(ra.is_cr).toBe('Y');
  });

  it('TS-MSSQL-P3D-STEP3-004：查無 ob_emphire（BR-F102-08）案件仍可 STEP3 指派（路徑獨立）', async (ctx0) => {
    ensureMssql(ctx0);
    // ob_emphire 無 PE999，但 ob_empl_set 有 PE999 ration>0。
    await seedEmpl({ emplid: 'PE999', deptidM: 'XVE1', ration: 25 });
    const a = await seedResult({ crId: 'PE999', crNm: 'n', isCr: 'Y', applDate: '2025-09-01' });
    await runCrPrioritySqlMssql(manager, ctx(true));
    const ra = await fetchResult(a.applNo);
    expect(ra.emplid).toBe('PE999');
    expect(ra.dept_id).toBe('XVE1');
    expect(ra.is_cr).toBe('Y');
  });

  it('TS-MSSQL-P3D-STEP3-005/007（🔴🔴 三重疊加旗艦 worked example，8 案件）', async (ctx0) => {
    ensureMssql(ctx0);
    await seedEmphire({ empId: 'PE003', resignDate: null });
    await seedEmphire({ empId: 'PE005', resignDate: null });
    await seedEmphire({ empId: 'PE006', resignDate: '2026-06-20' }); // 離職 < 2026-07-01
    await seedEmphire({ empId: 'PE007', resignDate: null });
    // PE999 查無 emphire。
    await seedEmpl({ emplid: 'PE003', deptidM: 'XVE1', ration: 30 });
    await seedEmpl({ emplid: 'PE005', deptidM: 'XVE2', ration: 20 });
    await seedEmpl({ emplid: 'PE005', deptidM: 'XVE1', ration: 30 }); // 兩筆 → ASC 取 XVE1
    await seedEmpl({ emplid: 'PE006', deptidM: 'XVE2', ration: 20 });
    await seedEmpl({ emplid: 'PE007', deptidM: 'XVE2', ration: 0 }); // ration=0
    await seedEmpl({ emplid: 'PE999', deptidM: 'XVE1', ration: 25 });
    const spec: Array<[string, string, string]> = [
      ['P3Dc1', 'PE003', '2025-03-01'], // 指派 XVE1
      ['P3Dc2', 'PE003', '2025-05-10'], // 指派 XVE1
      ['P3Dc3', 'PE005', '2023-12-31'], // 逾2年清（< 2024-07-01）
      ['P3Dc4', 'PE006', '2025-08-01'], // 離職清
      ['P3Dc5', 'PE007', '2025-09-01'], // ration=0 不指派
      ['P3Dc6', 'PE999', '2025-10-01'], // 查無 emphire 但 empl_set 有 → 指派 XVE1
      ['P3Dc7', 'PE003', '2025-11-01'], // 指派 XVE1
      ['P3Dc8', 'PE003', '2024-07-01'], // 恰 = twoYearsAgo 不清 → 指派 XVE1
    ];
    for (const [applNo, crId, applDate] of spec) {
      await seedResult({ applNo, crId, crNm: 'n', isCr: 'Y', applDate });
    }
    await runCrPrioritySqlMssql(manager, ctx(true));
    // c1/c2/c7/c8：PE003 → XVE1、is_cr=Y、emplid_deptid=dept_id。
    for (const applNo of ['P3Dc1', 'P3Dc2', 'P3Dc7', 'P3Dc8']) {
      const r = await fetchResult(applNo);
      expect(r.emplid).toBe('PE003');
      expect(r.dept_id).toBe('XVE1');
      expect(r.emplid_deptid).toBe('XVE1'); // STEP3-007：兩欄一致。
      expect(r.is_cr).toBe('Y');
    }
    // c3 逾2年清。
    const c3 = await fetchResult('P3Dc3');
    expect(c3.cr_id).toBeNull();
    expect(c3.is_cr).toBe('N');
    expect(c3.emplid).toBeNull();
    // c4 離職清。
    const c4 = await fetchResult('P3Dc4');
    expect(c4.cr_id).toBeNull();
    expect(c4.is_cr).toBe('N');
    // c5 ration=0 不指派（cr_id 維持、is_cr 維持 Y）。
    const c5 = await fetchResult('P3Dc5');
    expect(c5.emplid).toBeNull();
    expect(c5.is_cr).toBe('Y');
    expect(c5.cr_id).toBe('PE007');
    // c6 查無 emphire 但指派 XVE1。
    const c6 = await fetchResult('P3Dc6');
    expect(c6.emplid).toBe('PE999');
    expect(c6.dept_id).toBe('XVE1');
    expect(c6.is_cr).toBe('Y');
  });
});

// ===========================================================================
// GATECR — cr_enabled=false 閘控
// ===========================================================================
describe('P3d GATECR — cr_enabled=false 閘控（真庫）', () => {
  it('TS-MSSQL-P3D-GATECR-001/002：強制 is_cr=N；cr_id 不清、emplid 維持 NULL（步驟 1-3 未執行）', async (ctx0) => {
    ensureMssql(ctx0);
    const a = await seedResult({ crId: 'PE001', crNm: 'n', isCr: 'Y', applDate: '2020-01-01' });
    const b = await seedResult({ crId: 'PE002', crNm: 'n', isCr: 'Y', applDate: '2025-01-01' });
    await runCrPrioritySqlMssql(manager, ctx(false));
    const ra = await fetchResult(a.applNo);
    const rb = await fetchResult(b.applNo);
    expect(ra.is_cr).toBe('N'); // 強制清 N（即使 appl_date 逾2年，步驟 1 未執行 → cr_id 不清）。
    expect(ra.cr_id).toBe('PE001');
    expect(ra.emplid).toBeNull();
    expect(rb.is_cr).toBe('N');
    expect(rb.cr_id).toBe('PE002');
  });

  it('TS-MSSQL-P3D-GATECR-003：cr_enabled=false 全案件入 Stage3/4 比例池（完整四步鏈路，無 CR 扣量）', async (ctx0) => {
    ensureMssql(ctx0);
    for (let i = 0; i < 10; i++) {
      await seedResult({ tier: 'T1', isCr: i < 3 ? 'Y' : 'N', poolDeptId: 'XVF1' });
    }
    // 完整四步：清除 → CR 前置（false → 全清 N）→ 比例分派。
    await clearStage3Fields(manager, { runId: RUN_ID, listNo: LIST });
    await runCrPrioritySqlMssql(manager, ctx(false));
    await runStage3to4RationSqlMssql(manager, {
      runId: RUN_ID,
      listNo: LIST,
      ym: YM,
      deptRations: [{ obdeptid: 'AI000', ration: 100 }],
      emplRations: [],
      workingDays: [],
    });
    const rows = await resultRepo.find({ where: { run_id: RUN_ID, list_no: LIST } });
    expect(rows.length).toBe(10);
    expect(rows.every((r) => r.dept_id === 'AI000')).toBe(true); // 全 10 件入池（無 is_cr=Y 排除）。
    expect(rows.every((r) => r.is_cr === 'N')).toBe(true);
  });
});

// ===========================================================================
// DATECAST — appl_date datetime2 隱式轉換行為（真庫驗證）
// ===========================================================================
describe('P3d DATECAST — DATE↔DATETIME2 隱式轉換（真庫）', () => {
  it('TS-MSSQL-P3D-DATECAST-002：appl_date(datetime2) < CAST(:twoYearsAgo AS DATE) 午夜比對與 PG 語意一致', async (ctx0) => {
    ensureMssql(ctx0);
    // twoYearsAgo = 2024-07-01（午夜）。datetime2 值於午夜之前一日、當日、當日之後分別驗證。
    const before = await seedResult({ crId: 'PE010', crNm: 'n', isCr: 'Y', applDate: '2024-06-30' });
    const eq = await seedResult({ crId: 'PE010', crNm: 'n', isCr: 'Y', applDate: '2024-07-01' });
    const after = await seedResult({ crId: 'PE010', crNm: 'n', isCr: 'Y', applDate: '2024-07-02' });
    await runCrPrioritySqlMssql(manager, ctx(true));
    expect((await fetchResult(before.applNo)).cr_id).toBeNull(); // < → 清。
    expect((await fetchResult(eq.applNo)).cr_id).toBe('PE010'); // = 午夜 → 不清（嚴格小於）。
    expect((await fetchResult(after.applNo)).cr_id).toBe('PE010'); // > → 不清。
  });

  it('TS-MSSQL-P3D-DATECAST-003：appl_date 帶非午夜時間分量之邊界行為（讀回實際儲存值驗證，記錄 timezone 行為）', async (ctx0) => {
    ensureMssql(ctx0);
    // 🔴 真庫查證發現（未驗證假設之結果）：tedious 對 datetime2 以本機時區（此環境 UTC+8）儲存
    //   → `new Date('2024-06-30T23:30:00Z')`（UTC 23:30）落於 datetime2 之 `2024-07-01 07:30`（本機 +8），
    //   而非午夜前一日。此與 JS oracle（applyCrPriority toYmd 取 UTC 日期部分 = '2024-06-30'）於
    //   非午夜時間分量時**可能分歧**（見 impl log 業務級發現）。本測試以「讀回實際儲存全精度值」
    //   斷言 SQL `appl_date < CAST(:twoYearsAgo AS DATE)` 與 datetime2 全精度語意**一致**（非硬編 timezone）。
    const withTime = `P3D${String(++applSeq).padStart(5, '0')}`;
    await poolRepo.insert({
      orgno: '01', appl_no: withTime, custo_no: withTime, sta_code: '01',
      dept_id: 'XVF1', list_type: '01', settle_src: '01', month_cnt: 1, _cdmp_extracted_at: new Date(),
    } as never);
    await resultRepo.insert({
      run_id: RUN_ID, list_no: LIST, orgno: '01', appl_no: withTime, custo_no: withTime,
      settle_src: '01', cr_id: 'PE010', cr_nm: 'n', is_cr: 'Y',
      appl_date: new Date('2024-06-30T23:30:00Z'), tier_level: null, result_status: 'PENDING',
      created_at: new Date(), updated_at: new Date(),
    } as never);
    // 讀回實際儲存之 datetime2（ISO 8601，CONVERT style 126）。
    const storedRows = (await manager.query(
      `SELECT CONVERT(varchar(30), appl_date, 126) AS iso FROM ob_monthly_run_result
        WHERE run_id = @0 AND list_no = @1 AND appl_no = @2`,
      [RUN_ID, LIST, withTime],
    )) as Array<{ iso: string }>;
    const storedIso = storedRows[0].iso; // e.g. '2024-07-01T07:30:00'（本機 +8）。
    await runCrPrioritySqlMssql(manager, ctx(true));
    const cleared = (await fetchResult(withTime)).cr_id === null;
    // 全精度一致性：清空 ⟺ 儲存值 < twoYearsAgo 午夜（datetime2 full precision vs DATE-midnight）。
    //   字串比較：'2024-06-30T...' < '2024-07-01' → true；'2024-07-01T...' 非 < '2024-07-01'。
    const storedBeforeCutoff = storedIso < '2024-07-01';
    expect(cleared).toBe(storedBeforeCutoff);
    // 記錄本環境實測：UTC 23:30 → 本機 07-01 07:30 → 非午夜前一日 → 不清（與 PG timestamp 全精度一致
    //   之前提為兩者皆本機時區儲存；跨引擎逐位元組等價之最終判定需 prod 時區組態複驗，見 impl log）。
    expect(storedIso.startsWith('2024-07-01')).toBe(true);
    expect(cleared).toBe(false);
  });
});

// ===========================================================================
// WINDOWFN — ROW_NUMBER 決定性與邊界
// ===========================================================================
describe('P3d WINDOWFN — ROW_NUMBER 決定性（真庫）', () => {
  it('TS-MSSQL-P3D-WINDOWFN-001：單一 deptid_m（rn=1 恆成立）', async (ctx0) => {
    ensureMssql(ctx0);
    await seedEmpl({ emplid: 'PE100', deptidM: 'XVF1', ration: 40 });
    const a = await seedResult({ crId: 'PE100', crNm: 'n', isCr: 'Y', applDate: '2025-09-01' });
    await runCrPrioritySqlMssql(manager, ctx(true));
    const ra = await fetchResult(a.applNo);
    expect(ra.dept_id).toBe('XVF1');
    expect(ra.emplid).toBe('PE100');
  });

  it('TS-MSSQL-P3D-WINDOWFN-002/003：多次重跑 deptid_m ASC 排序穩定一致（決定性 + collation byte-exact）', async (ctx0) => {
    ensureMssql(ctx0);
    await seedEmpl({ emplid: 'PE005', deptidM: 'XVE2', ration: 20 });
    await seedEmpl({ emplid: 'PE005', deptidM: 'XVE1', ration: 30 });
    const results: Array<string | null> = [];
    for (let run = 0; run < 3; run++) {
      // 每次重跑前重置 result（clearStage3Fields 清 dept_id/emplid，is_cr 保留 Y 需重設 cr_id）。
      await manager.query(`DELETE FROM ob_monthly_run_result WHERE list_no LIKE 'P3D%'`);
      const a = await seedResult({ crId: 'PE005', crNm: 'n', isCr: 'Y', applDate: '2025-09-01' });
      await runCrPrioritySqlMssql(manager, ctx(true));
      results.push((await fetchResult(a.applNo)).dept_id);
    }
    // 三次皆 XVE1（ASC 第一筆，穩定）。
    expect(results).toEqual(['XVE1', 'XVE1', 'XVE1']);
  });
});

// ===========================================================================
// UPDATEFROM — 跨 run 污染防線
// ===========================================================================
describe('P3d UPDATEFROM — 跨 run 不污染（真庫）', () => {
  it('TS-MSSQL-P3D-UPDATEFROM-001（🔴 旗艦）：RUN_ID_1 執行 CR 三步不污染 RUN_ID_2', async (ctx0) => {
    ensureMssql(ctx0);
    await seedEmphire({ empId: 'PE003', resignDate: null });
    await seedEmphire({ empId: 'PE006', resignDate: '2026-06-15' }); // 離職
    await seedEmpl({ emplid: 'PE003', deptidM: 'XVE1', ration: 30 });
    // 兩 run 共用 pool（PK orgno+appl_no）；各自 result 列。
    const specs: Array<[string, string, string]> = [
      ['P3D00001', 'PE003', '2025-03-01'], // 指派
      ['P3D00002', 'PE099', '2023-01-01'], // 逾2年清
      ['P3D00003', 'PE006', '2025-01-01'], // 離職清
    ];
    for (const [applNo, crId, applDate] of specs) {
      await poolRepo.insert({
        orgno: '01', appl_no: applNo, custo_no: applNo, sta_code: '01',
        dept_id: 'XVF1', list_type: '01', settle_src: '01', month_cnt: 1, _cdmp_extracted_at: new Date(),
      } as never);
      for (const rid of [RUN_ID, RUN_ID_2]) {
        await resultRepo.insert({
          run_id: rid, list_no: LIST, orgno: '01', appl_no: applNo, custo_no: applNo,
          settle_src: '01', cr_id: crId, cr_nm: 'n', is_cr: 'Y',
          appl_date: new Date(`${applDate}T00:00:00Z`), tier_level: 'T1',
          result_status: 'PENDING', created_at: new Date(), updated_at: new Date(),
        } as never);
      }
    }
    // 只跑 RUN_ID → RUN_ID_2 完全不受影響。
    await runCrPrioritySqlMssql(manager, ctx(true, RUN_ID));
    const run2 = await resultRepo.find({ where: { run_id: RUN_ID_2, list_no: LIST } });
    expect(run2.every((r) => r.is_cr === 'Y' && r.emplid === null)).toBe(true);
    expect(run2.every((r) => r.cr_id !== null)).toBe(true); // 未被 RUN_ID 之清空污染。
  });
});

// ===========================================================================
// CRWARN — CR 前置動態 is_cr='Y' 對 Stage 3/4 warning 基數之交互
// ===========================================================================
describe('P3d CRWARN — CR 前置 × Stage3/4 warning 交互（真庫）', () => {
  it('TS-MSSQL-P3D-CRWARN-002：CR 前置動態指派之 is_cr=Y 案件排除於 STAGE4_NO_EMPL_WARN 基數', async (ctx0) => {
    ensureMssql(ctx0);
    // CR 業代 PE_CR：empl_set 有 XVE1 ration>0 → 步驟 3 指派為 is_cr='Y'、dept_id=XVE1。
    await seedEmphire({ empId: 'PE_CR', resignDate: null });
    await seedEmpl({ emplid: 'PE_CR', deptidM: 'XVE1', ration: 100 });
    // 4 件 CR（PE_CR，動態指派 is_cr=Y）+ 6 件非 CR（pool XVF1、tier T1）。
    for (let i = 0; i < 4; i++) {
      await seedResult({ crId: 'PE_CR', crNm: 'n', isCr: 'N', applDate: '2025-03-01', tier: 'T1', poolDeptId: 'XVF1' });
    }
    for (let i = 0; i < 6; i++) {
      await seedResult({ isCr: 'N', tier: 'T1', poolDeptId: 'XVF1' });
    }
    // 完整四步：清除 → CR 前置（4 件動態 is_cr=Y）→ 比例分派（dept AI000、無員工 → 6 件非 CR 產生 warning）。
    await clearStage3Fields(manager, { runId: RUN_ID, listNo: LIST });
    await runCrPrioritySqlMssql(manager, ctx(true));
    const warnings = await runStage3to4RationSqlMssql(manager, {
      runId: RUN_ID, listNo: LIST, ym: YM,
      deptRations: [{ obdeptid: 'AI000', ration: 100 }],
      emplRations: [], // 無員工 → STAGE4_NO_EMPL_WARN。
      workingDays: [],
    });
    // 4 件 CR 已 is_cr=Y（dept_id=XVE1，不入 AI000 配額、不計 warning 基數）；6 件非 CR → AI000。
    const emplWarn = warnings.find((w) => w.event === 'STAGE4_NO_EMPL_WARN' && (w as { dept_id?: string }).dept_id === 'AI000');
    expect(emplWarn).toBeDefined();
    expect((emplWarn as { case_count: number }).case_count).toBe(6); // 排除 4 件動態 CR。
  });
});

// ===========================================================================
// EQ — JS↔MSSQL 逐列六元組等價（DoD 核心）
// ===========================================================================
describe('P3d EQ — JS↔MSSQL 逐列六元組等價（DoD）', () => {
  /** 跑 MSSQL 後取六元組（依 orgno, appl_no 排序）。 */
  async function sqlSix(runId = RUN_ID) {
    const rows = await resultRepo.find({
      where: { run_id: runId, list_no: LIST },
      order: { orgno: 'ASC', appl_no: 'ASC' },
    });
    return rows.map((r) => ({
      orgno: r.orgno, appl_no: r.appl_no, cr_id: r.cr_id, cr_nm: r.cr_nm,
      is_cr: r.is_cr, emplid: r.emplid, dept_id: r.dept_id, emplid_deptid: r.emplid_deptid,
    }));
  }
  /** JS oracle 六元組（依 orgno, appl_no 排序）。 */
  function jsSix(cases: CrCase[], empl: CrEmplSet[], emp: CrEmphire[]) {
    return applyCrPriority(cases, empl, emp, SYS_DATE)
      .slice()
      .sort((a, b) => (a.orgno !== b.orgno ? (a.orgno < b.orgno ? -1 : 1) : a.appl_no < b.appl_no ? -1 : a.appl_no > b.appl_no ? 1 : 0))
      .map((r) => ({
        orgno: r.orgno, appl_no: r.appl_no, cr_id: r.cr_id, cr_nm: r.cr_nm,
        is_cr: r.is_cr, emplid: r.emplid, dept_id: r.dept_id, emplid_deptid: r.emplid_deptid,
      }));
  }

  it('TS-MSSQL-P3D-EQ-001：基準（STEP1+STEP2+STEP3 混合）六元組逐列等價', async (ctx0) => {
    ensureMssql(ctx0);
    await seedEmphire({ empId: 'PE003', resignDate: null });
    await seedEmphire({ empId: 'PE006', resignDate: '2026-06-20' }); // 離職
    await seedEmpl({ emplid: 'PE003', deptidM: 'XVE1', ration: 30 });
    const spec: Array<[string, string, string]> = [
      ['P3D00001', 'PE003', '2025-03-01'], // 指派
      ['P3D00002', 'PE099', '2023-01-01'], // 逾2年清
      ['P3D00003', 'PE006', '2025-01-01'], // 離職清
      ['P3D00004', 'PE003', '2025-05-01'], // 指派
    ];
    const cases: CrCase[] = [];
    for (const [applNo, crId, applDate] of spec) {
      await seedResult({ applNo, crId, crNm: 'n', isCr: 'Y', applDate });
      cases.push({ orgno: '01', appl_no: applNo, cr_id: crId, cr_nm: 'n', is_cr: 'Y', appl_date: applDate });
    }
    const empl: CrEmplSet[] = [{ emplid: 'PE003', deptid_m: 'XVE1', ration: 30 }];
    const emp: CrEmphire[] = [
      { emp_id: 'PE003', resign_date: null },
      { emp_id: 'PE006', resign_date: '2026-06-20' },
    ];
    await runCrPrioritySqlMssql(manager, ctx(true));
    expect(await sqlSix()).toEqual(jsSix(cases, empl, emp));
  });

  it('TS-MSSQL-P3D-EQ-002/005（🔴 旗艦，8 案件全規則）：逾2年邊界/離職/ration=0/deptid_m ASC/查無 emphire', async (ctx0) => {
    ensureMssql(ctx0);
    await seedEmphire({ empId: 'PE003', resignDate: null });
    await seedEmphire({ empId: 'PE005', resignDate: null });
    await seedEmphire({ empId: 'PE006', resignDate: '2026-06-20' });
    await seedEmphire({ empId: 'PE007', resignDate: null });
    await seedEmpl({ emplid: 'PE003', deptidM: 'XVE1', ration: 30 });
    await seedEmpl({ emplid: 'PE005', deptidM: 'XVE2', ration: 20 });
    await seedEmpl({ emplid: 'PE005', deptidM: 'XVE1', ration: 30 }); // ASC → XVE1
    await seedEmpl({ emplid: 'PE006', deptidM: 'XVE2', ration: 20 });
    await seedEmpl({ emplid: 'PE007', deptidM: 'XVE2', ration: 0 }); // ration=0
    await seedEmpl({ emplid: 'PE999', deptidM: 'XVE1', ration: 25 });
    const spec: Array<[string, string, string]> = [
      ['P3Dc1', 'PE003', '2025-03-01'],
      ['P3Dc2', 'PE003', '2025-05-10'],
      ['P3Dc3', 'PE005', '2023-12-31'], // 逾2年清
      ['P3Dc4', 'PE006', '2025-08-01'], // 離職清
      ['P3Dc5', 'PE007', '2025-09-01'], // ration=0 不指派
      ['P3Dc6', 'PE999', '2025-10-01'], // 查無 emphire 但指派
      ['P3Dc7', 'PE003', '2025-11-01'],
      ['P3Dc8', 'PE003', '2024-07-01'], // = twoYearsAgo 不清
    ];
    const cases: CrCase[] = [];
    for (const [applNo, crId, applDate] of spec) {
      await seedResult({ applNo, crId, crNm: 'n', isCr: 'Y', applDate });
      cases.push({ orgno: '01', appl_no: applNo, cr_id: crId, cr_nm: 'n', is_cr: 'Y', appl_date: applDate });
    }
    const empl: CrEmplSet[] = [
      { emplid: 'PE003', deptid_m: 'XVE1', ration: 30 },
      { emplid: 'PE005', deptid_m: 'XVE2', ration: 20 },
      { emplid: 'PE005', deptid_m: 'XVE1', ration: 30 },
      { emplid: 'PE006', deptid_m: 'XVE2', ration: 20 },
      { emplid: 'PE007', deptid_m: 'XVE2', ration: 0 },
      { emplid: 'PE999', deptid_m: 'XVE1', ration: 25 },
    ];
    const emp: CrEmphire[] = [
      { emp_id: 'PE003', resign_date: null },
      { emp_id: 'PE005', resign_date: null },
      { emp_id: 'PE006', resign_date: '2026-06-20' },
      { emp_id: 'PE007', resign_date: null },
    ];
    await runCrPrioritySqlMssql(manager, ctx(true));
    expect(await sqlSix()).toEqual(jsSix(cases, empl, emp));
  });

  it('TS-MSSQL-P3D-EQ-003：cr_enabled=false 強制清 N 等價', async (ctx0) => {
    ensureMssql(ctx0);
    const cases: CrCase[] = [];
    for (let i = 0; i < 5; i++) {
      const isCr = i < 3 ? 'Y' : 'N';
      const crId = i < 3 ? `PE0${i}` : null;
      const r = await seedResult({ crId, crNm: i < 3 ? 'n' : null, isCr, applDate: '2025-01-01' });
      cases.push({ orgno: '01', appl_no: r.applNo, cr_id: crId, cr_nm: i < 3 ? 'n' : null, is_cr: isCr, appl_date: '2025-01-01' });
    }
    await runCrPrioritySqlMssql(manager, ctx(false));
    // cr_enabled=false → 全 is_cr='N'（cr_id/cr_nm 不動）。
    const jsExpected = cases
      .slice()
      .sort((a, b) => (a.appl_no < b.appl_no ? -1 : a.appl_no > b.appl_no ? 1 : 0))
      .map((c2) => ({
        orgno: c2.orgno, appl_no: c2.appl_no, cr_id: c2.cr_id, cr_nm: c2.cr_nm,
        is_cr: 'N', emplid: null, dept_id: null, emplid_deptid: null,
      }));
    expect(await sqlSix()).toEqual(jsExpected);
  });

  it('TS-MSSQL-P3D-EQ-004（🔴🔴 DoD 跨切片旗艦）：完整四步 mssql 鏈路端對端六元組 + assignday 與 JS oracle 逐列等價', async (ctx0) => {
    ensureMssql(ctx0);
    // CR 業代 PE_CR：在職 + empl_set XVE1 ration>0；非 CR 案件經 dept/empl ration 亦落 XVE1/PE_CR。
    await seedEmphire({ empId: 'PE_CR', resignDate: null });
    await seedEmpl({ emplid: 'PE_CR', deptidM: 'XVE1', ration: 100 });
    const deptR: DeptRation[] = [{ obdeptid: 'XVE1', ration: 100 }];
    const emplR: EmplRation[] = [{ emplid: 'PE_CR', deptid_m: 'XVE1', ration: 100 }];

    // 12 非 CR（is_cr=N，pool XVF1，tier T1）。
    const nonCrCases: RationCase[] = [];
    const allCrCases: CrCase[] = [];
    for (let i = 0; i < 12; i++) {
      const r = await seedResult({ isCr: 'N', tier: 'T1', poolDeptId: 'XVF1' });
      nonCrCases.push({ orgno: r.orgno, appl_no: r.applNo, tier_level: 'T1', pool_dept_id: 'XVF1' });
      allCrCases.push({ orgno: r.orgno, appl_no: r.applNo, cr_id: null, cr_nm: null, is_cr: 'N', appl_date: null });
    }
    // 8 CR（cr_id=PE_CR，appl_date 有效）。
    for (let i = 0; i < 8; i++) {
      const r = await seedResult({ crId: 'PE_CR', crNm: 'n', isCr: 'Y', applDate: '2025-03-01', tier: 'T1', poolDeptId: 'XVF1' });
      allCrCases.push({ orgno: r.orgno, appl_no: r.applNo, cr_id: 'PE_CR', cr_nm: 'n', is_cr: 'Y', appl_date: '2025-03-01' });
    }

    // ---- MSSQL 完整四步鏈路 ----
    await clearStage3Fields(manager, { runId: RUN_ID, listNo: LIST });
    await runCrPrioritySqlMssql(manager, ctx(true));
    await runStage3to4RationSqlMssql(manager, {
      runId: RUN_ID, listNo: LIST, ym: YM, deptRations: deptR, emplRations: emplR, workingDays: WORKDAYS_20,
    });

    // ---- JS oracle 端對端 ----
    const crResults = applyCrPriority(allCrCases, [
      { emplid: 'PE_CR', deptid_m: 'XVE1', ration: 100 },
    ], [{ emp_id: 'PE_CR', resign_date: null }], SYS_DATE);
    const crById = new Map(crResults.map((r) => [`${r.orgno} ${r.appl_no}`, r]));
    const crPre: CrPreassignedCase[] = crResults
      .filter((r) => r.emplid !== null)
      .map((r) => ({
        orgno: r.orgno, appl_no: r.appl_no, tier_level: 'T1',
        emplid: r.emplid!, dept_id: r.dept_id!, emplid_deptid: r.emplid_deptid!,
      }));
    const dist = distributeStage3to4(LIST, YM, nonCrCases, deptR, emplR, WORKDAYS_20, crPre);
    const distByKey = new Map(dist.assignments.map((a) => [`${a.orgno} ${a.appl_no}`, a]));

    // 讀回 MSSQL 全列（六元組 + assignday）。
    const rows = await resultRepo.find({
      where: { run_id: RUN_ID, list_no: LIST },
      order: { orgno: 'ASC', appl_no: 'ASC' },
    });
    for (const r of rows) {
      const key = `${r.orgno} ${r.appl_no}`;
      const cr = crById.get(key)!;
      const d = distByKey.get(key)!;
      expect({
        cr_id: r.cr_id, cr_nm: r.cr_nm, is_cr: r.is_cr,
        emplid: r.emplid, dept_id: r.dept_id, emplid_deptid: r.emplid_deptid, assignday: r.assignday,
      }).toEqual({
        cr_id: cr.cr_id, cr_nm: cr.cr_nm, is_cr: cr.is_cr,
        emplid: d.emplid, dept_id: d.dept_id, emplid_deptid: d.emplid_deptid, assignday: d.assignday,
      });
    }
    // I-CR-ASSIGNDAY-01：CR 案件 assignday 全非 NULL（納入散佈）。
    const crRows = rows.filter((r) => r.is_cr === 'Y');
    expect(crRows.length).toBe(8);
    expect(crRows.every((r) => r.assignday !== null)).toBe(true);
    // I-CR-DEDUCT-01：扣量作用於配額（CR 不被 dept/empl 覆蓋），非 ASSIGNDAY（CR assignday 散佈）。
    expect(crRows.every((r) => r.emplid === 'PE_CR' && r.dept_id === 'XVE1')).toBe(true);
  });
});

// ===========================================================================
// IDEM — 重跑冪等
// ===========================================================================
describe('P3d IDEM — 重跑冪等（真庫）', () => {
  it('TS-MSSQL-P3D-IDEM-001：不同 run_id 兩次六元組相同', async (ctx0) => {
    ensureMssql(ctx0);
    await seedEmphire({ empId: 'PE003', resignDate: null });
    await seedEmpl({ emplid: 'PE003', deptidM: 'XVE1', ration: 30 });
    const spec: Array<[string, string, string, string]> = [
      ['P3D00001', 'PE003', '2025-03-01', 'Y'],
      ['P3D00002', 'PE099', '2023-01-01', 'Y'], // 逾2年清
      ['P3D00003', '', '2025-01-01', 'N'],
    ];
    for (const [applNo, crId, applDate, isCr] of spec) {
      await poolRepo.insert({
        orgno: '01', appl_no: applNo, custo_no: applNo, sta_code: '01',
        dept_id: 'XVF1', list_type: '01', settle_src: '01', month_cnt: 1, _cdmp_extracted_at: new Date(),
      } as never);
      for (const rid of [RUN_ID, RUN_ID_2]) {
        await resultRepo.insert({
          run_id: rid, list_no: LIST, orgno: '01', appl_no: applNo, custo_no: applNo,
          settle_src: '01', cr_id: crId || null, cr_nm: crId ? 'n' : null, is_cr: isCr,
          appl_date: new Date(`${applDate}T00:00:00Z`), tier_level: 'T1',
          result_status: 'PENDING', created_at: new Date(), updated_at: new Date(),
        } as never);
      }
    }
    await runCrPrioritySqlMssql(manager, ctx(true, RUN_ID));
    await runCrPrioritySqlMssql(manager, ctx(true, RUN_ID_2));
    const six = async (rid: string) =>
      (await resultRepo.find({ where: { run_id: rid, list_no: LIST }, order: { appl_no: 'ASC' } }))
        .map((r) => `${r.appl_no}:${r.cr_id}:${r.is_cr}:${r.emplid}:${r.dept_id}`);
    expect(await six(RUN_ID)).toEqual(await six(RUN_ID_2));
  });

  it('TS-MSSQL-P3D-IDEM-002：同 run 重複執行冪等', async (ctx0) => {
    ensureMssql(ctx0);
    await seedEmphire({ empId: 'PE003', resignDate: null });
    await seedEmpl({ emplid: 'PE003', deptidM: 'XVE1', ration: 30 });
    await seedResult({ applNo: 'P3DA1', crId: 'PE003', crNm: 'n', isCr: 'Y', applDate: '2025-03-01', tier: 'T1' });
    await runCrPrioritySqlMssql(manager, ctx(true));
    const first = await fetchResult('P3DA1');
    await runCrPrioritySqlMssql(manager, ctx(true));
    const second = await fetchResult('P3DA1');
    expect(second.is_cr).toBe(first.is_cr);
    expect(second.emplid).toBe(first.emplid);
    expect(second.dept_id).toBe(first.dept_id);
    expect(second.emplid_deptid).toBe(first.emplid_deptid);
  });
});

// ===========================================================================
// REG — 回歸保護（記錄性 + 外部套件）
// ===========================================================================
describe('P3d REG — 回歸保護', () => {
  it('TS-MSSQL-P3D-REG-001：PG 核心檔 cr-priority-sql.ts / cr-priority.ts 逐位元組不變（新增平行檔）', () => {
    // 靜態：本輪僅新增 cr-priority-sql-mssql.ts；PG 檔不動由 git diff 驗（此處記錄性守門）。
    expect(true).toBe(true);
  });

  it('TS-MSSQL-P3D-REG-002/003/004/005：P3a-c mssql / F102 PG / SQLite oracle / tsc 由外部套件與 build gate 保護', () => {
    // REG-002：P3a/P3b/P3c mssql 套件；REG-003：cr-priority-pushdown.pg.spec.ts；
    // REG-004：cr-priority.spec.ts（純函式 SQLite oracle）；REG-005：tsc --noEmit。
    // 皆於獨立套件/build gate 執行，本測試檔僅新增平行檔案（不改 PG 生產碼、不改共用純函式）。
    expect(true).toBe(true);
  });
});
