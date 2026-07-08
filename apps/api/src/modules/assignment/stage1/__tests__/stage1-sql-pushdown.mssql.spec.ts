/**
 * AD-E07-42 P3a — Stage 1 篩選 raw SQL 引擎 MSSQL 移植：JS↔MSSQL 逐案件等價 + 4 MUST-FIX 守門。
 *
 * 對應測試設計 AD-E07-42-P3a-test.md（73 案例）：
 *   GATE / DISPATCH / CONCAT / AGE / YEARABOVE / EQ / CCNULLEXC / CCJOIN / CCMISC / CCEQ /
 *   RUNEST / IDEM / CHARSET / STATIC / REG。
 *
 * Harness（§零）：共用既有 dbo 表（六表 + ob_emphire）+ 前綴隔離（P3A…）+ 精準 DELETE（禁 DROP/TRUNCATE）。
 *   不可達 → DB 相依 it 以 ctx.skip()（不假綠，feedback_mock_real_system_contract）。純函式 / 靜態掃描
 *   （DISPATCH/STATIC/GATE-doc/CONCAT-static/YEARABOVE-direct 之部分）不需連線，恆執行。
 *   ⚠️ 與 p1b2/p4 mssql 套件共用 dbo → 本檔須以 `--no-file-parallelism`（或單檔）執行，避免併發 wipe。
 */

// 必最先 import（side-effect 設 DB_TYPE=mssql，供 entity column-types helper 解析 mssql 分支值）。
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
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { DataSource, Repository, EntityManager } from 'typeorm';

import { ObListDefinition } from '@/database/entities/ob-list-definition.entity';
import { ObPoolData } from '@/database/entities/ob-pool-data.entity';
import { ObPoolDataList } from '@/database/entities/ob-pool-data-list.entity';
import { ObMonthlyRunResult } from '@/database/entities/ob-monthly-run-result.entity';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { ObEmphire } from '@/database/entities/ob-emphire.entity';
import { executeStage1Chain } from '../stage1-filter-chain';
import {
  runStage1SqlInsertMssql,
  estimateStage1SqlCountMssql,
} from '../stage1-sql-executor-mssql';
import { mssqlLeadingYearExpr } from '../stage1-sql-builder-mssql';
import { mssqlAgeExpr } from '../stage1-customer-core-clause-mssql';
import { resolveStage1Strategy } from '@/modules/assignment/services/assignment-run-pipeline.service';

// feedback_pg_spec_parallel_timeout：真 MSSQL 連線在 CPU 競爭下需拉高預設 5s。
vi.setConfig({ testTimeout: 60000 });

// WORKDT（Stage1 核心 EQ/YEARABOVE/dedup）：2026-06-01 → year-above cutoff=2011；去重視窗 [20260301,20260531]。
const WORKDT = new Date(2026, 5, 1);
// AGE / customer_core 基準（對稱 F109 PG spec）。
const WORKDT_JUL = new Date(Date.UTC(2026, 6, 1)); // 2026-07-01
const WORKDT_AUG = new Date(Date.UTC(2026, 7, 1)); // 2026-08-01

const RUN_ID = '00000000-0000-0000-0000-0000000003aa';
const RUN_ID2 = '00000000-0000-0000-0000-0000000003bb';
const ETL_PID = '00000000-0000-0000-0000-0000000003cc';

const SIX_TABLES = [
  'ob_pool_data',
  'ob_pool_data_list',
  'ob_list_definition',
  'assignment_run',
  'ob_monthly_run_result',
  'customer_core',
] as const;

let reachable = false;
let missingTables: string[] = [];
let ds: DataSource | null = null;
let poolRepo: Repository<ObPoolData>;
let pdlRepo: Repository<ObPoolDataList>;
let resultRepo: Repository<ObMonthlyRunResult>;
let listRepo: Repository<ObListDefinition>;
let runRepo: Repository<AssignmentRun>;
let emphireRepo: Repository<ObEmphire>;
let manager: EntityManager;

function ensureMssql(ctx: { skip: () => void }): void {
  if (!reachable || !ds) {
    // eslint-disable-next-line no-console
    console.warn(`[AD-E07-42 P3a MSSQL] SKIPPED — ${SKIP_REASON}`);
    ctx.skip();
  }
}

// ---------------------------------------------------------------------------
// seed helpers（真實 contract：list_nm 真繁體中文觸發字；前綴 P3A 隔離；精準 DELETE 清理）
// ---------------------------------------------------------------------------

let listSeq = 0;
function makeListDef(opts: Partial<ObListDefinition> = {}): ObListDefinition {
  listSeq += 1;
  return listRepo.create({
    list_no: `P3AL${String(listSeq).padStart(6, '0')}`,
    list_nm: '一般催收名單',
    prod_kind: '',
    prod_best: 'Y',
    list_type: '01',
    list_period_start: '1',
    list_period_end: '6',
    list_interval: '1',
    project_workym: '202606',
    caseyear: null,
    spec_tp: null,
    settle_src: null,
    card_type: 'T1',
    case_status: '',
    status: 'active',
    stage: 'ready',
    cr_enabled: false,
    condition_payload: {
      logic: 'AND',
      conditions: [
        { columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] },
      ],
    } as ObListDefinition['condition_payload'],
    created_by_prog: 'TEST',
    created_by: 'tester',
    created_at: new Date(),
    updated_by_prog: 'TEST',
    updated_by: 'tester',
    updated_at: new Date(),
    ...opts,
  } as ObListDefinition);
}

let applSeq = 0;
async function seedPool(
  opts: Partial<ObPoolData> & { applNo?: string } = {},
): Promise<ObPoolData> {
  applSeq += 1;
  const { applNo: applNoOpt, ...rest } = opts;
  const applNo = applNoOpt ?? `P3AA${String(applSeq).padStart(5, '0')}`;
  const row = poolRepo.create({
    orgno: '01',
    custo_no: opts.custo_no ?? `P3AC${String(applSeq).padStart(5, '0')}`,
    sta_code: '01',
    dept_id: 'D001',
    list_type: '01',
    settle_src: '01',
    prod_kind: '01',
    month_cnt: 1,
    _cdmp_extracted_at: new Date(),
    ...rest,
    appl_no: applNo,
  } as Partial<ObPoolData>);
  return poolRepo.save(row);
}

let pdlSeq = 0;
async function seedPdl(opts: {
  applNo?: string;
  custoNo: string | null;
  assignday: string;
}): Promise<void> {
  pdlSeq += 1;
  await pdlRepo.save(
    pdlRepo.create({
      list_no: 'P3AH',
      orgno: '01',
      appl_no: opts.applNo ?? `P3AH${String(pdlSeq).padStart(5, '0')}`,
      custo_no: opts.custoNo,
      assignday: opts.assignday,
      data_source: 'etl_load',
      settle_src: '01',
    } as Partial<ObPoolDataList>),
  );
}

/**
 * 去重視窗錨點：seed 一列 assignday=workdt−1（20260531）custo_no=NULL 之 pdl，
 * 使 computeDedupWindow 之 MAX(assignday)（跨全表，含 dbo 既有外來列）>= workdt−1 →
 * 上界穩定為 workdt−1（20260531），不受外來資料干擾。custo_no NULL → 不進去重集合（不誤排）。
 */
async function seedWindowAnchor(): Promise<void> {
  await seedPdl({ applNo: 'P3AHANCH', custoNo: null, assignday: '20260531' });
}

interface CustomerRow {
  source_customer_no: string;
  gender?: string | null;
  date_of_birth?: string | null;
  occupation_desc?: string | null;
  education_desc?: string | null;
  marital_status_desc?: string | null;
  customer_type_desc?: string | null;
  monthly_income_desc?: string | null;
  cpost_city?: string | null;
}
async function seedCustomer(row: CustomerRow): Promise<void> {
  // dbo.customer_core（92 欄，無 entity）：補齊 NOT NULL 無預設欄（customer_type_code/name/data_source/_etl_pipeline_id）。
  await manager.query(
    `INSERT INTO customer_core
       (source_customer_no, customer_type_code, name, data_source, _etl_pipeline_id,
        gender, date_of_birth, occupation_desc, education_desc, marital_status_desc,
        customer_type_desc, monthly_income_desc, cpost_city)
     VALUES (@0, 'P', 'P3A', 'P3A', '${ETL_PID}',
       @1, @2, @3, @4, @5, @6, @7, @8)`,
    [
      row.source_customer_no,
      row.gender ?? null,
      row.date_of_birth ?? null,
      row.occupation_desc ?? null,
      row.education_desc ?? null,
      row.marital_status_desc ?? null,
      row.customer_type_desc ?? null,
      row.monthly_income_desc ?? null,
      row.cpost_city ?? null,
    ],
  );
}

async function seedRun(runId: string): Promise<void> {
  await manager.query(
    `INSERT INTO assignment_run (run_id, project_workym, status, triggered_by, created_at)
     VALUES (@0, '202606', 'running', '00000000-0000-0000-0000-000000000001', GETDATE())`,
    [runId],
  );
}

async function seedEmphire(opts: {
  empId: string;
  idNo: string;
  empNm: string | null;
  resignDate?: string | null;
}): Promise<void> {
  await emphireRepo.save(
    emphireRepo.create({
      emp_id: opts.empId,
      id_no: opts.idNo,
      emp_nm: opts.empNm,
      resign_date: opts.resignDate ?? null,
    } as Partial<ObEmphire>),
  );
}

/** 精準清理本檔寫入列（禁 DROP/TRUNCATE；FK 序：result → assignment_run）。 */
async function cleanupP3A(): Promise<void> {
  await manager.query(`DELETE FROM ob_monthly_run_result WHERE list_no LIKE 'P3A%'`);
  await manager.query(
    `DELETE FROM assignment_run WHERE run_id IN ('${RUN_ID}', '${RUN_ID2}')`,
  );
  // 含 EQ-007 之 T/Y 開頭列（機車期中規則需 appl_no 以 T/Y 開頭，故無法用 P3A 前綴）。
  await manager.query(
    `DELETE FROM ob_pool_data WHERE appl_no LIKE 'P3A%' OR appl_no LIKE 'TP3A%' OR appl_no LIKE 'YP3A%'`,
  );
  await manager.query(`DELETE FROM ob_pool_data_list WHERE appl_no LIKE 'P3A%'`);
  await manager.query(`DELETE FROM ob_list_definition WHERE list_no LIKE 'P3A%'`);
  await manager.query(`DELETE FROM customer_core WHERE source_customer_no LIKE 'P3A%'`);
  await manager.query(`DELETE FROM ob_emphire WHERE emp_id LIKE 'P3A%'`);
}

/** 跑 JS oracle（executeStage1Chain），回 PK 集合。⚠️ 僅非 customer_core 名單可安全對 MSSQL 執行。 */
async function runJsOraclePks(
  list: ObListDefinition,
  workdt = WORKDT,
): Promise<string[]> {
  const r = await executeStage1Chain(list, workdt, poolRepo, pdlRepo, {
    dryRun: false,
  });
  return (r.cases ?? []).map((c) => `${c.orgno}:${c.appl_no}`).sort();
}

/** 跑 MSSQL 下推（INSERT…SELECT），回寫入 ob_monthly_run_result 之 PK 集合 + 列。 */
async function runSqlPushdownPks(
  list: ObListDefinition,
  workdt = WORKDT,
  runId = RUN_ID,
): Promise<{ pks: string[]; rows: ObMonthlyRunResult[] }> {
  await runStage1SqlInsertMssql(manager, list, workdt, pdlRepo, {
    runId,
    listNo: list.list_no,
  });
  const rows = await resultRepo.find({
    where: { run_id: runId, list_no: list.list_no },
  });
  return { pks: rows.map((r) => `${r.orgno}:${r.appl_no}`).sort(), rows };
}

/** EQ 骨架：同 seed 跑 JS oracle 與 MSSQL 下推，斷言 PK 集合逐列相等 + assignday 恆 NULL。 */
async function assertEquivalent(
  list: ObListDefinition,
  workdt = WORKDT,
): Promise<string[]> {
  const jsPks = await runJsOraclePks(list, workdt);
  const { pks: sqlPks, rows } = await runSqlPushdownPks(list, workdt);
  expect(sqlPks).toEqual(jsPks); // 逐列 PK 集合精確相等（非僅 count）
  expect(rows.every((r) => r.assignday === null)).toBe(true); // OQ-F099-03
  return jsPks;
}

async function estimate(list: ObListDefinition, workdt = WORKDT_JUL): Promise<number> {
  const { count } = await estimateStage1SqlCountMssql(manager, list, workdt, pdlRepo);
  return count;
}

// ===========================================================================
// 連線生命週期
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
      entities: [
        ObListDefinition,
        ObPoolData,
        ObPoolDataList,
        ObMonthlyRunResult,
        AssignmentRun,
        ObEmphire,
      ],
      synchronize: false, // §0.2：共用既有 dbo，絕不 synchronize / DROP。
    });
    await ds.initialize();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[AD-E07-42 P3a MSSQL] init failed → skip:', (e as Error)?.message);
    reachable = false;
    ds = null;
    return;
  }
  poolRepo = ds.getRepository(ObPoolData);
  pdlRepo = ds.getRepository(ObPoolDataList);
  resultRepo = ds.getRepository(ObMonthlyRunResult);
  listRepo = ds.getRepository(ObListDefinition);
  runRepo = ds.getRepository(AssignmentRun);
  emphireRepo = ds.getRepository(ObEmphire);
  manager = ds.manager;

  // GATE-002：六表存在性探測（不存在 → 不自建，引導 bootstrap）。
  missingTables = [];
  for (const t of SIX_TABLES) {
    const rows = await manager.query(`SELECT OBJECT_ID('dbo.${t}', 'U') AS oid`);
    if (rows?.[0]?.oid == null) missingTables.push(t);
  }
  if (missingTables.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(
      `[AD-E07-42 P3a MSSQL] dbo 缺表 ${missingTables.join(',')} → 請先執行 baseline migration/bootstrap；本套件 DB 案例將 skip。`,
    );
    reachable = false;
  }
}, 60000);

afterAll(async () => {
  if (ds) {
    try {
      await cleanupP3A();
    } catch {
      /* best-effort */
    }
    await ds.destroy();
  }
  restoreDbType();
});

beforeEach(async () => {
  if (!reachable || !ds) return;
  await cleanupP3A();
  await seedRun(RUN_ID); // 每測試 result INSERT 需 FK 父列。
});

// ===========================================================================
// 一、GATE
// ===========================================================================
describe('P3a GATE — 前置決策關卡', () => {
  it('TS-MSSQL-P3A-GATE-002：dbo 六表存在性（不存在則引導 bootstrap，非自建）', (ctx) => {
    ensureMssql(ctx);
    expect(missingTables).toEqual([]);
  });

  it('TS-MSSQL-P3A-GATE-001：query-composer 雙引號識別碼於真實 dbo 表複用 QUOTE-003（非拋語法錯）', async (ctx) => {
    ensureMssql(ctx);
    const list = makeListDef({ list_nm: '一般催收名單' });
    await listRepo.save(list);
    await seedPool({ applNo: 'P3AA_G1', prod_kind: '01' });
    await seedPool({ applNo: 'P3AA_G2', prod_kind: '02' });
    // "prod_kind" IN (:...) 片段經 estimate 下推對 dbo.ob_pool_data 執行 → 成功且正確過濾（1 命中）。
    expect(await estimate(list, WORKDT)).toBe(1);
  });

  it('TS-MSSQL-P3A-GATE-004：customer_core.source_customer_no UNIQUE 約束存在（sys.key_constraints/indexes）', async (ctx) => {
    ensureMssql(ctx);
    const rows = await manager.query(
      `SELECT i.name AS idx, i.is_unique AS is_unique
         FROM sys.indexes i
         JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
         JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
        WHERE i.object_id = OBJECT_ID('dbo.customer_core')
          AND c.name = 'source_customer_no' AND i.is_unique = 1`,
    );
    // GATE-004：MSSQL baseline 具 UQ_customer_core_source_customer_no（I-CC-JOIN-CARD-01 有 DB 層防線）。
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });
});

// ===========================================================================
// 二、DISPATCH（純函式，恆執行；三分支互斥）
// ===========================================================================
describe('P3a DISPATCH — resolveStage1Strategy 三分支（不需連線）', () => {
  it('TS-MSSQL-P3A-DISPATCH-001：mssql → pushdownMssql（非 jsChain）', () => {
    expect(resolveStage1Strategy('mssql')).toBe('pushdownMssql');
    expect(resolveStage1Strategy('mssql')).not.toBe('jsChain');
  });

  it('TS-MSSQL-P3A-DISPATCH-002：estimate 側同源三分支（mssql → 走 estimateStage1SqlCountMssql）', () => {
    // stage0-estimate 之 dryRunChainCount 亦以 dbType==='mssql' 選 estimateStage1SqlCountMssql（STATIC-004 守門）。
    expect(resolveStage1Strategy('mssql')).toBe('pushdownMssql');
  });

  it('TS-MSSQL-P3A-DISPATCH-003：非 postgres 非 mssql（sqlite/未設）→ jsChain 不回歸', () => {
    expect(resolveStage1Strategy(undefined)).toBe('jsChain');
    expect(resolveStage1Strategy('sqlite')).toBe('jsChain');
    expect(resolveStage1Strategy('postgres')).toBe('pushdownPg');
  });

  it('TS-MSSQL-P3A-DISPATCH-004：三分支互斥（單一輸入恰對映一路徑，三輸出相異）', () => {
    const outs = new Set([
      resolveStage1Strategy('postgres'),
      resolveStage1Strategy('mssql'),
      resolveStage1Strategy('sqlite'),
    ]);
    expect(outs.size).toBe(3);
    expect([...outs].sort()).toEqual(['jsChain', 'pushdownMssql', 'pushdownPg']);
  });
});

// ===========================================================================
// 三、CONCAT — CR 業代姓名字串串接（MUST-FIX）
// ===========================================================================
describe('P3a CONCAT — CR 業代姓名 || → + MUST-FIX', () => {
  it('TS-MSSQL-P3A-CONCAT-001：mssql executor 原始碼不得含 PG || 字串串接（靜態，不需連線）', () => {
    const src = readFileSync(
      join(__dirname, '..', 'stage1-sql-executor-mssql.ts'),
      'utf8',
    );
    // 鎖定 SQL 字串模板內（backtick template literal）不得含 PG `||`；排除 JS 邏輯 OR
    // （如 `core.skip || core.where`，合法）與 docstring 引述 PG `||` 之對照文字。
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const templates = code.match(/`[^`]*`/g) ?? [];
    expect(templates.some((t) => t.includes('||'))).toBe(false); // SQL 模板無 || 串接
    expect(src).toContain("'CR' + cremp.emp_nm"); // CR 串接改 T-SQL +
  });

  it('TS-MSSQL-P3A-CONCAT-002：CR 命中 → cr_nm = CR王小明（中文 round-trip，非拋錯/空字串）', async (ctx) => {
    ensureMssql(ctx);
    await seedEmphire({ empId: 'P3AE1', idNo: 'P3A00001', empNm: '王小明' });
    const list = makeListDef({ list_nm: '一般催收名單' });
    await listRepo.save(list);
    await seedPool({ applNo: 'P3AA_CR1', prod_kind: '01', agent_id: 'P3A00001' });
    const { rows } = await runSqlPushdownPks(list);
    expect(rows.length).toBe(1);
    expect(rows[0].cr_id).toBe('P3AE1');
    expect(rows[0].cr_nm).toBe('CR王小明');
  });

  it('TS-MSSQL-P3A-CONCAT-003：CR 未命中 → cr_id/cr_nm 皆 NULL（CASE 守門，不觸發串接）', async (ctx) => {
    ensureMssql(ctx);
    const list = makeListDef({ list_nm: '一般催收名單' });
    await listRepo.save(list);
    await seedPool({ applNo: 'P3AA_CR2', prod_kind: '01', agent_id: 'P3A_NONE' } as Partial<ObPoolData>);
    const { rows } = await runSqlPushdownPks(list);
    expect(rows.length).toBe(1);
    expect(rows[0].cr_id).toBeNull();
    expect(rows[0].cr_nm).toBeNull();
  });
});

// ===========================================================================
// 四、AGE — customer_core AGE 衍生（含 AD 建議公式符號反轉旗艦守門）
// ===========================================================================
function ageList(min: number, max: number): ObListDefinition {
  return makeListDef({
    list_nm: '客戶篩選名單',
    condition_payload: {
      logic: 'AND',
      conditions: [
        { columnName: 'date_of_birth', fieldType: 'numeric', min, max, dataSource: 'customer_core' },
      ],
    } as ObListDefinition['condition_payload'],
  });
}

describe('P3a AGE — DATEDIFF 年齡公式（MUST-FIX 引數順序）', () => {
  it('TS-MSSQL-P3A-AGE-MSSQL-001：dob=1996-07-01 workdt=2026-07-01 min=30 max=35 → 命中 1（攔截負值反轉）', async (ctx) => {
    ensureMssql(ctx);
    const list = ageList(30, 35);
    await listRepo.save(list);
    await seedPool({ applNo: 'P3AA_AGE1', custo_no: 'P3AC_AGE1' });
    await seedCustomer({ source_customer_no: 'P3AC_AGE1', date_of_birth: '1996-07-01' });
    expect(await estimate(list, WORKDT_JUL)).toBe(1);
  });

  it('TS-MSSQL-P3A-AGE-MSSQL-002：生日未到→29 入選、已過→30 排除（BETWEEN 邊界，min=25 max=29）', async (ctx) => {
    ensureMssql(ctx);
    const list = ageList(25, 29);
    await listRepo.save(list);
    await seedPool({ applNo: 'P3AA_G', custo_no: 'P3AC_G' });
    await seedCustomer({ source_customer_no: 'P3AC_G', date_of_birth: '1996-07-02' }); // 生日未到→29→入
    await seedPool({ applNo: 'P3AA_H', custo_no: 'P3AC_H' });
    await seedCustomer({ source_customer_no: 'P3AC_H', date_of_birth: '1996-06-30' }); // 生日已過→30→排
    expect(await estimate(list, WORKDT_JUL)).toBe(1);
  });

  it('TS-MSSQL-P3A-AGE-MSSQL-003：閏年 2/29 出生於非閏年 workdt 語意正確、不拋錯', async (ctx) => {
    ensureMssql(ctx);
    // workdt=2026-03-01（已過 2/29→26 歲）；workdt=2026-02-01（未到→25 歲）
    await seedPool({ applNo: 'P3AA_LY', custo_no: 'P3AC_LY' });
    await seedCustomer({ source_customer_no: 'P3AC_LY', date_of_birth: '2000-02-29' });
    const listMar = ageList(26, 26);
    await listRepo.save(listMar);
    expect(await estimate(listMar, new Date(Date.UTC(2026, 2, 1)))).toBe(1);
    const listFeb = ageList(25, 25);
    await listRepo.save(listFeb);
    expect(await estimate(listFeb, new Date(Date.UTC(2026, 1, 1)))).toBe(1);
  });

  it('TS-MSSQL-P3A-AGE-MSSQL-004：date_of_birth=NULL → 排除（NULL 傳播，極寬區間 0~150 亦不入選）', async (ctx) => {
    ensureMssql(ctx);
    const list = ageList(0, 150);
    await listRepo.save(list);
    await seedPool({ applNo: 'P3AA_N1', custo_no: 'P3AC_N1' });
    await seedCustomer({ source_customer_no: 'P3AC_N1', date_of_birth: '1990-01-01' }); // 命中
    await seedPool({ applNo: 'P3AA_N2', custo_no: 'P3AC_N2' });
    await seedCustomer({ source_customer_no: 'P3AC_N2', date_of_birth: null }); // 排除
    expect(await estimate(list, WORKDT_JUL)).toBe(1);
  });

  it('TS-MSSQL-P3A-AGE-MSSQL-005：決定性 — 同 workdt 重跑兩次一致', async (ctx) => {
    ensureMssql(ctx);
    const list = ageList(20, 40);
    await listRepo.save(list);
    await seedPool({ applNo: 'P3AA_D1', custo_no: 'P3AC_D1' });
    await seedCustomer({ source_customer_no: 'P3AC_D1', date_of_birth: '1996-08-10' });
    const a = await estimate(list, WORKDT_JUL);
    const b = await estimate(list, WORKDT_JUL);
    expect(a).toBe(b);
    expect(a).toBe(1);
  });

  it('TS-MSSQL-P3A-AGE-MSSQL-006：workdt 驅動 — 同 dob 於不同 workdt 得不同年齡', async (ctx) => {
    ensureMssql(ctx);
    const list = ageList(30, 30);
    await listRepo.save(list);
    await seedPool({ applNo: 'P3AA_W1', custo_no: 'P3AC_W1' });
    await seedCustomer({ source_customer_no: 'P3AC_W1', date_of_birth: '1996-07-15' });
    expect(await estimate(list, WORKDT_JUL)).toBe(0); // 2026-07-01 → 29（生日未到）
    expect(await estimate(list, WORKDT_AUG)).toBe(1); // 2026-08-01 → 30
  });

  it('TS-MSSQL-P3A-AGE-MSSQL-007（Meta/靜態）：mssqlAgeExpr dob 為 start 引數（非 workdt）', () => {
    // 直接核對公式引數順序：DATEDIFF(YEAR, <dob>, CAST(:ccWorkdt AS DATE))；dob 在前（正值年齡）。
    const expr = mssqlAgeExpr('cc.date_of_birth');
    expect(expr).toContain('DATEDIFF(YEAR, cc.date_of_birth, CAST(:ccWorkdt AS DATE))');
    expect(expr).not.toContain('DATEDIFF(YEAR, CAST(:ccWorkdt AS DATE), cc.date_of_birth)');
  });
});

// ===========================================================================
// 五、YEARABOVE — year-above 前導數字擷取（PATINDEX；直接表達式 + 全鏈）
// ===========================================================================
describe('P3a YEARABOVE — 前導數字擷取（PATINDEX，非 P4a 全字串驗證）', () => {
  it('TS-MSSQL-P3A-YEARABOVE-001~007：直接表達式對 7 邊界值 keep/exclude（含空字串陷阱、1980abc 擷取）', async (ctx) => {
    ensureMssql(ctx);
    const expr = mssqlLeadingYearExpr('v.yp');
    // keep = NOT (yearval IS NOT NULL AND yearval < 2011)
    const sql =
      `SELECT v.id AS id, CASE WHEN NOT (${expr} IS NOT NULL AND ${expr} < 2011) THEN 1 ELSE 0 END AS keep ` +
      `FROM (VALUES (1, '2010'), (2, '2011'), (3, 'N/A'), (4, '200'), (5, '1980abc'), (6, ''), (7, CAST(NULL AS VARCHAR(20)))) v(id, yp) ` +
      `ORDER BY v.id`;
    const rows: Array<{ id: number; keep: number }> = await manager.query(sql);
    const keep = new Map(rows.map((r) => [Number(r.id), Number(r.keep)]));
    expect(keep.get(1)).toBe(0); // '2010' < 2011 → 排除（PORT-001）
    expect(keep.get(2)).toBe(1); // '2011' 非 < → 保留（PORT-002）
    expect(keep.get(3)).toBe(1); // 'N/A' 首字非數字 → yearval NULL → 保留（PORT-005）
    expect(keep.get(4)).toBe(0); // '200' < 2011 → 排除（PORT-006）
    expect(keep.get(5)).toBe(0); // '1980abc' 擷取 1980 < 2011 → 排除（PORT-007 旗艦）
    expect(keep.get(6)).toBe(1); // '' → LEN=0 → NULL → 保留（PORT-004 空字串陷阱）
    expect(keep.get(7)).toBe(0); // NULL → 1900 < 2011 → 排除（PORT-003）
  });

  it('TS-MSSQL-P3A-YEARABOVE-008：EQ 全鏈（JS↔MSSQL，year_produ 可入 varchar(4) 之邊界值）', async (ctx) => {
    ensureMssql(ctx);
    const list = makeListDef({ list_nm: '5年以上車主催收名單' });
    await listRepo.save(list);
    await seedWindowAnchor();
    await seedPool({ applNo: 'P3AA_Y1', year_produ: '2000' }); // 排
    await seedPool({ applNo: 'P3AA_Y2', year_produ: '2020' }); // 留
    await seedPool({ applNo: 'P3AA_Y3', year_produ: null }); // 排（→1900）
    await seedPool({ applNo: 'P3AA_Y4', year_produ: '' }); // 留（NaN 等價）
    await seedPool({ applNo: 'P3AA_Y5', year_produ: 'N/A' }); // 留（NaN）
    const pks = await assertEquivalent(list);
    expect(pks).toEqual(['01:P3AA_Y2', '01:P3AA_Y4', '01:P3AA_Y5']);
  });
});

// ===========================================================================
// 六、EQ — Stage 1 核心規則 JS↔MSSQL 逐案件等價（對稱 PG EQ-001~014）
// ===========================================================================
describe('P3a EQ — JS↔MSSQL 逐 list 結果集精確等價', () => {
  it('TS-MSSQL-P3A-EQ-001：基準純欄位篩選（prod_kind IN）', async (ctx) => {
    ensureMssql(ctx);
    const list = makeListDef();
    await listRepo.save(list);
    await seedPool({ applNo: 'P3AA_E1', prod_kind: '01' });
    await seedPool({ applNo: 'P3AA_E2', prod_kind: '01' });
    await seedPool({ applNo: 'P3AA_E3', prod_kind: '02' });
    const pks = await assertEquivalent(list);
    expect(pks).toEqual(['01:P3AA_E1', '01:P3AA_E2']);
  });

  it('TS-MSSQL-P3A-EQ-002：month_cnt 期別過濾（IN 1..6，含 NULL 排除）', async (ctx) => {
    ensureMssql(ctx);
    const list = makeListDef();
    await listRepo.save(list);
    await seedPool({ applNo: 'P3AA_M1', month_cnt: 3 });
    await seedPool({ applNo: 'P3AA_M2', month_cnt: 9 });
    await seedPool({ applNo: 'P3AA_M3', month_cnt: null });
    const pks = await assertEquivalent(list);
    expect(pks).toEqual(['01:P3AA_M1']);
  });

  it('TS-MSSQL-P3A-EQ-003：month_cnt 步進邊界（interval=2 → IN 1,3,5）', async (ctx) => {
    ensureMssql(ctx);
    const list = makeListDef({ list_interval: '2' });
    await listRepo.save(list);
    for (const [a, m] of [['P3AA_S1', 1], ['P3AA_S3', 3], ['P3AA_S5', 5]] as const) {
      await seedPool({ applNo: a, month_cnt: m });
    }
    for (const [a, m] of [['P3AA_S2', 2], ['P3AA_S4', 4], ['P3AA_S6', 6]] as const) {
      await seedPool({ applNo: a, month_cnt: m });
    }
    const pks = await assertEquivalent(list);
    expect(pks).toEqual(['01:P3AA_S1', '01:P3AA_S3', '01:P3AA_S5']);
  });

  it('TS-MSSQL-P3A-EQ-004：list_period 缺值 → month_cnt skip（全留）', async (ctx) => {
    ensureMssql(ctx);
    const list = makeListDef({ list_period_start: '', list_period_end: '', list_interval: '' });
    await listRepo.save(list);
    await seedPool({ applNo: 'P3AA_P1', month_cnt: 3 });
    await seedPool({ applNo: 'P3AA_P2', month_cnt: 99 });
    await assertEquivalent(list);
  });

  it('TS-MSSQL-P3A-EQ-005：interval=0 → month_cnt skip（全留）', async (ctx) => {
    ensureMssql(ctx);
    const list = makeListDef({ list_interval: '0' });
    await listRepo.save(list);
    await seedPool({ applNo: 'P3AA_I1', month_cnt: 3 });
    await seedPool({ applNo: 'P3AA_I2', month_cnt: 99 });
    await assertEquivalent(list);
  });

  it('TS-MSSQL-P3A-EQ-006：詐騙白牌（中文 round-trip，含 NULL spec_name 保留）', async (ctx) => {
    ensureMssql(ctx);
    const list = makeListDef({ list_nm: '詐騙白牌專案' });
    await listRepo.save(list);
    await seedPool({ applNo: 'P3AA_F1', list_type: '01', spec_name: '詐騙白牌方案' }); // 排
    await seedPool({ applNo: 'P3AA_F2', list_type: '02', spec_name: '白牌' }); // 留（type 不符）
    await seedPool({ applNo: 'P3AA_F3', list_type: '01', spec_name: '一般' }); // 留
    await seedPool({ applNo: 'P3AA_F4', list_type: '01', spec_name: null }); // 留（NULL）
    const pks = await assertEquivalent(list);
    expect(pks).toEqual(['01:P3AA_F2', '01:P3AA_F3', '01:P3AA_F4']);
  });

  it('TS-MSSQL-P3A-EQ-007：機車期中（payt_term>=deal_num-3 OR appl_no T/Y 開頭）+ 邊界', async (ctx) => {
    ensureMssql(ctx);
    const list = makeListDef({ list_nm: '機車期中催收名單' });
    await listRepo.save(list);
    await seedPool({ applNo: 'P3AA_C1', payt_term: 21, deal_num: '24' }); // 排（21>=21）
    await seedPool({ applNo: 'P3AA_C2', payt_term: 20, deal_num: '24' }); // 留（20<21）
    await seedPool({ applNo: 'TP3A1', payt_term: 0, deal_num: '24' }); // 排（T 開頭）
    await seedPool({ applNo: 'YP3A1', payt_term: 0, deal_num: '24' }); // 排（Y 開頭）
    await seedPool({ applNo: 'P3AA_C5', payt_term: 0, deal_num: '24' }); // 留
    const pks = await assertEquivalent(list);
    expect(pks).toEqual(['01:P3AA_C2', '01:P3AA_C5']);
  });

  it('TS-MSSQL-P3A-EQ-008：期中小資（payt_num>deal_num-8 AND spec_name 含小資）+ 邊界（中文）', async (ctx) => {
    ensureMssql(ctx);
    const list = makeListDef({ list_nm: '期中催收名單' });
    await listRepo.save(list);
    await seedPool({ applNo: 'P3AA_X1', payt_num: 17, deal_num: '24', spec_name: '小資' }); // 排
    await seedPool({ applNo: 'P3AA_X2', payt_num: 16, deal_num: '24', spec_name: '小資' }); // 留（16=16 非>）
    await seedPool({ applNo: 'P3AA_X3', payt_num: 17, deal_num: '24', spec_name: '一般' }); // 留（不含小資）
    const pks = await assertEquivalent(list);
    expect(pks).toEqual(['01:P3AA_X2', '01:P3AA_X3']);
  });

  it('TS-MSSQL-P3A-EQ-009：year-above 正常值（< cutoff 2011 排除）', async (ctx) => {
    ensureMssql(ctx);
    const list = makeListDef({ list_nm: '5年以上車主催收名單' });
    await listRepo.save(list);
    await seedPool({ applNo: 'P3AA_YA1', year_produ: '2010' }); // 排
    await seedPool({ applNo: 'P3AA_YA2', year_produ: '2011' }); // 留
    await seedPool({ applNo: 'P3AA_YA3', year_produ: '2020' }); // 留
    const pks = await assertEquivalent(list);
    expect(pks).toEqual(['01:P3AA_YA2', '01:P3AA_YA3']);
  });

  it('TS-MSSQL-P3A-EQ-010：year-above 退化/非數字/前導數字邊界（varchar(4) 可容值）', async (ctx) => {
    ensureMssql(ctx);
    const list = makeListDef({ list_nm: '年以上機車名單' });
    await listRepo.save(list);
    await seedPool({ applNo: 'P3AA_YB1', year_produ: null }); // 排（→1900）
    await seedPool({ applNo: 'P3AA_YB2', year_produ: '' }); // 留
    await seedPool({ applNo: 'P3AA_YB3', year_produ: 'N/A' }); // 留
    await seedPool({ applNo: 'P3AA_YB4', year_produ: '200' }); // 排（200<2011）
    const pks = await assertEquivalent(list);
    expect(pks).toEqual(['01:P3AA_YB2', '01:P3AA_YB3']);
  });

  it('TS-MSSQL-P3A-EQ-011：規則疊加（fraud + motorcycle + xiaozi + year-above，BR-1 不合併）', async (ctx) => {
    ensureMssql(ctx);
    const list = makeListDef({ list_nm: '機車期中小資5年以上催收名單' });
    await listRepo.save(list);
    await seedPool({ applNo: 'P3AA_Z1', list_type: '01', spec_name: '白牌' }); // fraud
    await seedPool({ applNo: 'P3AA_Z2', payt_term: 30, deal_num: '24' }); // motorcycle
    await seedPool({ applNo: 'P3AA_Z3', payt_num: 30, deal_num: '24', spec_name: '小資' }); // xiaozi
    await seedPool({ applNo: 'P3AA_Z4', year_produ: '1990' }); // year-above
    await seedPool({
      applNo: 'P3AA_Z5',
      list_type: '02',
      spec_name: '一般',
      payt_term: 0,
      payt_num: 0,
      deal_num: '24',
      year_produ: '2020',
    });
    const pks = await assertEquivalent(list);
    expect(pks).toEqual(['01:P3AA_Z5']);
  });

  it('TS-MSSQL-P3A-EQ-012：近 3 月去重 — 上界 + NULL custo_no 安全（NOT EXISTS）', async (ctx) => {
    ensureMssql(ctx);
    const list = makeListDef({ list_nm: '一般催收名單' });
    await listRepo.save(list);
    await seedWindowAnchor(); // 釘住去重視窗上界 = 20260531（不受 dbo 外來列干擾）
    await seedPool({ applNo: 'P3AA_D1', custo_no: 'P3AC_D1' }); // 視窗內已派 → 排
    await seedPool({ applNo: 'P3AA_D2', custo_no: 'P3AC_D2' }); // 視窗外 → 留
    // ⚠️ 偏差：dbo.ob_pool_data.custo_no 為 NOT NULL（§0.2 禁 ALTER 共用表），無法比照 PG spec 之
    //   DROP NOT NULL 種 NULL custo_no 之 pool 列（NOT EXISTS 之 pool 側 NULL 防禦分支）；改以「歷史側
    //   NULL」（下方 seedPdl custoNo=null，pdl.custo_no 可空）驗證 anti-join 之 `IS NOT NULL` 守門。
    await seedPdl({ custoNo: 'P3AC_D1', assignday: '20260420' });
    await seedPdl({ custoNo: 'P3AC_D2', assignday: '20260201' }); // 視窗外
    await seedPdl({ custoNo: null, assignday: '20260420' }); // 歷史 NULL 不致 anti-join 全 match
    const pks = await assertEquivalent(list);
    expect(pks).toEqual(['01:P3AA_D2']);
  });

  it('TS-MSSQL-P3A-EQ-013：去重上界邊界（MAX 未來日封頂 → 該 custo 不去重）', async (ctx) => {
    ensureMssql(ctx);
    const list = makeListDef({ list_nm: '一般催收名單' });
    await listRepo.save(list);
    await seedWindowAnchor();
    await seedPool({ applNo: 'P3AA_UB', custo_no: 'P3AC_UB' });
    await seedPdl({ custoNo: 'P3AC_UB', assignday: '20261231' }); // 未來 → 封頂後落視窗外 → 不去重
    const pks = await assertEquivalent(list);
    expect(pks).toEqual(['01:P3AA_UB']); // 未被去重
  });

  it('TS-MSSQL-P3A-EQ-014：EMPTY_CONDITIONS → 整 list skip（0 列，不 INSERT）', async (ctx) => {
    ensureMssql(ctx);
    const list = makeListDef({
      list_nm: '一般催收名單',
      condition_payload: { logic: 'AND', conditions: [] } as ObListDefinition['condition_payload'],
    });
    await listRepo.save(list);
    await seedPool({ applNo: 'P3AA_EC1' });
    const jsPks = await runJsOraclePks(list);
    expect(jsPks).toEqual([]);
    const { pks } = await runSqlPushdownPks(list);
    expect(pks).toEqual([]);
  });
});

// ===========================================================================
// 七、CCNULLEXC — customer_core NULL 排除三變體（手算 oracle vs estimate）
// ===========================================================================
function genderList(values: string[]): ObListDefinition {
  return makeListDef({
    list_nm: '客戶篩選名單',
    condition_payload: {
      logic: 'AND',
      conditions: [
        { columnName: 'gender', fieldType: 'categorical', values, dataSource: 'customer_core' },
      ],
    } as ObListDefinition['condition_payload'],
  });
}

describe('P3a CCNULLEXC — customer_core NULL 排除', () => {
  it('TS-MSSQL-P3A-CCNULLEXC-001【變體 a】無對應客戶 → 排除', async (ctx) => {
    ensureMssql(ctx);
    const list = genderList(['1']);
    await listRepo.save(list);
    await seedPool({ applNo: 'P3AA_NA1', custo_no: 'P3AC_NA1' });
    await seedCustomer({ source_customer_no: 'P3AC_NA1', gender: '1' }); // 命中
    await seedPool({ applNo: 'P3AA_NA3', custo_no: 'P3AC_NA3' }); // 無對應客戶
    expect(await estimate(list, WORKDT_JUL)).toBe(1);
  });

  it('TS-MSSQL-P3A-CCNULLEXC-002【變體 b】客戶存在但 gender=NULL → 排除', async (ctx) => {
    ensureMssql(ctx);
    const list = genderList(['1']);
    await listRepo.save(list);
    await seedPool({ applNo: 'P3AA_NB1', custo_no: 'P3AC_NB1' });
    await seedCustomer({ source_customer_no: 'P3AC_NB1', gender: '1' });
    await seedPool({ applNo: 'P3AA_NB2', custo_no: 'P3AC_NB2' });
    await seedCustomer({ source_customer_no: 'P3AC_NB2', gender: null }); // 欄 NULL → 排除
    expect(await estimate(list, WORKDT_JUL)).toBe(1);
  });

  it('TS-MSSQL-P3A-CCNULLEXC-003【變體 c】無客戶條件 → 不注入 JOIN，customer_core NULL 不影響入選', async (ctx) => {
    ensureMssql(ctx);
    const list = makeListDef({
      list_nm: '客戶篩選名單',
      condition_payload: {
        logic: 'AND',
        conditions: [
          { columnName: 'prod_kind', fieldType: 'categorical', values: ['01'], dataSource: 'ob_pool_data' },
        ],
      } as ObListDefinition['condition_payload'],
    });
    await listRepo.save(list);
    await seedPool({ applNo: 'P3AA_NC1', custo_no: 'P3AC_NC1', prod_kind: '01' });
    await seedCustomer({ source_customer_no: 'P3AC_NC1', gender: '1' });
    await seedPool({ applNo: 'P3AA_NC2', custo_no: 'P3AC_NC2', prod_kind: '01' });
    await seedPool({ applNo: 'P3AA_NC3', custo_no: 'P3AC_NC3', prod_kind: '01' }); // 無客戶
    // 額外驗證產出 SQL 不含 LEFT JOIN customer_core（core.customerCoreJoin===null）。
    const { core } = await estimateStage1SqlCountMssql(manager, list, WORKDT_JUL, pdlRepo);
    expect(core.customerCoreJoin).toBeNull();
    expect(await estimate(list, WORKDT_JUL)).toBe(3);
  });

  it('TS-MSSQL-P3A-CCNULLEXC-004：cpost_city=NULL → LEFT(NULL,3)=NULL → 排除', async (ctx) => {
    ensureMssql(ctx);
    const list = makeListDef({
      list_nm: '客戶篩選名單',
      condition_payload: {
        logic: 'AND',
        conditions: [
          { columnName: 'cpost_city', fieldType: 'categorical', values: ['臺北市'], dataSource: 'customer_core' },
        ],
      } as ObListDefinition['condition_payload'],
    });
    await listRepo.save(list);
    await seedPool({ applNo: 'P3AA_CT1', custo_no: 'P3AC_CT1' });
    await seedCustomer({ source_customer_no: 'P3AC_CT1', cpost_city: '臺北市大安區' }); // 命中
    await seedPool({ applNo: 'P3AA_CT2', custo_no: 'P3AC_CT2' });
    await seedCustomer({ source_customer_no: 'P3AC_CT2', cpost_city: null }); // 排除
    expect(await estimate(list, WORKDT_JUL)).toBe(1);
  });

  it('TS-MSSQL-P3A-CCNULLEXC-005：date_of_birth=NULL → 排除（極寬區間 0~150，交叉引用 AGE-004）', async (ctx) => {
    ensureMssql(ctx);
    const list = ageList(0, 150);
    await listRepo.save(list);
    await seedPool({ applNo: 'P3AA_DN1', custo_no: 'P3AC_DN1' });
    await seedCustomer({ source_customer_no: 'P3AC_DN1', date_of_birth: '1990-01-01' });
    await seedPool({ applNo: 'P3AA_DN2', custo_no: 'P3AC_DN2' });
    await seedCustomer({ source_customer_no: 'P3AC_DN2', date_of_birth: null });
    expect(await estimate(list, WORKDT_JUL)).toBe(1);
  });

  it('TS-MSSQL-P3A-CCNULLEXC-006：Case A/B/C 同查詢互不干擾（prod_kind AND gender），僅 A 入選', async (ctx) => {
    ensureMssql(ctx);
    const list = makeListDef({
      list_nm: '客戶篩選名單',
      condition_payload: {
        logic: 'AND',
        conditions: [
          { columnName: 'prod_kind', fieldType: 'categorical', values: ['01'], dataSource: 'ob_pool_data' },
          { columnName: 'gender', fieldType: 'categorical', values: ['1'], dataSource: 'customer_core' },
        ],
      } as ObListDefinition['condition_payload'],
    });
    await listRepo.save(list);
    await seedPool({ applNo: 'P3AA_MX1', custo_no: 'P3AC_MX1', prod_kind: '01' });
    await seedCustomer({ source_customer_no: 'P3AC_MX1', gender: '1' }); // 命中
    await seedPool({ applNo: 'P3AA_MX2', custo_no: 'P3AC_MX2', prod_kind: '01' });
    await seedCustomer({ source_customer_no: 'P3AC_MX2', gender: null }); // 排除
    await seedPool({ applNo: 'P3AA_MX3', custo_no: 'P3AC_MX3', prod_kind: '01' }); // 無客戶 → 排除
    expect(await estimate(list, WORKDT_JUL)).toBe(1);
  });
});

// ===========================================================================
// 八、CCJOIN — 條件式 JOIN 觸發 + EMPTY_CONDITIONS 陷阱
// ===========================================================================
describe('P3a CCJOIN — 條件式 JOIN + EMPTY_CONDITIONS 陷阱', () => {
  it('TS-MSSQL-P3A-CCJOIN-001【EMPTY_CONDITIONS 陷阱】僅含 gender → 不整批 skip，依 gender 過濾', async (ctx) => {
    ensureMssql(ctx);
    const list = genderList(['1']);
    await listRepo.save(list);
    await seedPool({ applNo: 'P3AA_J1', custo_no: 'P3AC_J1' });
    await seedCustomer({ source_customer_no: 'P3AC_J1', gender: '1' }); // 命中
    await seedPool({ applNo: 'P3AA_J2', custo_no: 'P3AC_J2' });
    await seedCustomer({ source_customer_no: 'P3AC_J2', gender: '2' }); // 不符
    const { count, core } = await estimateStage1SqlCountMssql(manager, list, WORKDT_JUL, pdlRepo);
    expect(core.skip).toBe(false); // 非全批 skip
    expect(count).toBe(1); // 依 gender 過濾（非全放行 2 / 非誤 skip 0）
  });

  it('TS-MSSQL-P3A-CCJOIN-002：多客戶條件共用同一 JOIN，estimate 正確過濾', async (ctx) => {
    ensureMssql(ctx);
    const list = makeListDef({
      list_nm: '客戶篩選名單',
      condition_payload: {
        logic: 'AND',
        conditions: [
          { columnName: 'gender', fieldType: 'categorical', values: ['1'], dataSource: 'customer_core' },
          { columnName: 'education_desc', fieldType: 'categorical', values: ['大學'], dataSource: 'customer_core' },
        ],
      } as ObListDefinition['condition_payload'],
    });
    await listRepo.save(list);
    await seedPool({ applNo: 'P3AA_J3', custo_no: 'P3AC_J3' });
    await seedCustomer({ source_customer_no: 'P3AC_J3', gender: '1', education_desc: '大學' }); // 命中兩者
    await seedPool({ applNo: 'P3AA_J4', custo_no: 'P3AC_J4' });
    await seedCustomer({ source_customer_no: 'P3AC_J4', gender: '1', education_desc: '高中' }); // education 不符
    expect(await estimate(list, WORKDT_JUL)).toBe(1);
  });
});

// ===========================================================================
// 九、CCMISC — CITY / AND / JOINCARD / DEACT
// ===========================================================================
function cityList(values: string[]): ObListDefinition {
  return makeListDef({
    list_nm: '客戶篩選名單',
    condition_payload: {
      logic: 'AND',
      conditions: [
        { columnName: 'cpost_city', fieldType: 'categorical', values, dataSource: 'customer_core' },
      ],
    } as ObListDefinition['condition_payload'],
  });
}

describe('P3a CCMISC — CITY / AND / JOINCARD / DEACT', () => {
  it('TS-MSSQL-P3A-CCMISC-CITY-001：LEFT3 命中/不命中（臺北市大安區→命中；新北市板橋區→排除）', async (ctx) => {
    ensureMssql(ctx);
    const list = cityList(['臺北市']);
    await listRepo.save(list);
    await seedPool({ applNo: 'P3AA_CY1', custo_no: 'P3AC_CY1' });
    await seedCustomer({ source_customer_no: 'P3AC_CY1', cpost_city: '臺北市大安區' });
    await seedPool({ applNo: 'P3AA_CY2', custo_no: 'P3AC_CY2' });
    await seedCustomer({ source_customer_no: 'P3AC_CY2', cpost_city: '新北市板橋區' });
    expect(await estimate(list, WORKDT_JUL)).toBe(1);
  });

  it('TS-MSSQL-P3A-CCMISC-CITY-002：空字串排除；恰 3 字命中', async (ctx) => {
    ensureMssql(ctx);
    const list = cityList(['臺北市']);
    await listRepo.save(list);
    await seedPool({ applNo: 'P3AA_CY3', custo_no: 'P3AC_CY3' });
    await seedCustomer({ source_customer_no: 'P3AC_CY3', cpost_city: '' }); // LEFT('',3)='' → 排除
    await seedPool({ applNo: 'P3AA_CY4', custo_no: 'P3AC_CY4' });
    await seedCustomer({ source_customer_no: 'P3AC_CY4', cpost_city: '臺北市' }); // 恰 3 字 → 命中
    expect(await estimate(list, WORKDT_JUL)).toBe(1);
  });

  it('TS-MSSQL-P3A-CCMISC-AND-001：跨來源 AND（prod_kind[01] AND gender[2]）僅同時符合入選', async (ctx) => {
    ensureMssql(ctx);
    const list = makeListDef({
      list_nm: '客戶篩選名單',
      condition_payload: {
        logic: 'AND',
        conditions: [
          { columnName: 'prod_kind', fieldType: 'categorical', values: ['01'], dataSource: 'ob_pool_data' },
          { columnName: 'gender', fieldType: 'categorical', values: ['2'], dataSource: 'customer_core' },
        ],
      } as ObListDefinition['condition_payload'],
    });
    await listRepo.save(list);
    await seedPool({ applNo: 'P3AA_AN1', custo_no: 'P3AC_AN1', prod_kind: '01' });
    await seedCustomer({ source_customer_no: 'P3AC_AN1', gender: '2' }); // 兩者符合 → 入
    await seedPool({ applNo: 'P3AA_AN2', custo_no: 'P3AC_AN2', prod_kind: '01' });
    await seedCustomer({ source_customer_no: 'P3AC_AN2', gender: '1' }); // 客戶不符 → 排
    await seedPool({ applNo: 'P3AA_AN3', custo_no: 'P3AC_AN3', prod_kind: '02' });
    await seedCustomer({ source_customer_no: 'P3AC_AN3', gender: '2' }); // 案件不符 → 排
    expect(await estimate(list, WORKDT_JUL)).toBe(1);
  });

  it('TS-MSSQL-P3A-CCMISC-JOINCARD-001：3 案件各對應不同客戶 → COUNT=3 不因 JOIN 膨脹（DB 層 UNIQUE 防線）', async (ctx) => {
    ensureMssql(ctx);
    const list = genderList(['1', '2', '3']);
    await listRepo.save(list);
    for (const [a, c, g] of [
      ['P3AA_JC1', 'P3AC_JC1', '1'],
      ['P3AA_JC2', 'P3AC_JC2', '2'],
      ['P3AA_JC3', 'P3AC_JC3', '3'],
    ] as const) {
      await seedPool({ applNo: a, custo_no: c });
      await seedCustomer({ source_customer_no: c, gender: g });
    }
    expect(await estimate(list, WORKDT_JUL)).toBe(3);
  });

  it('TS-MSSQL-P3A-CCMISC-DEACT-001：既有名單 gender 已固化 dataSource=customer_core，欄位停用後仍正確過濾', async (ctx) => {
    ensureMssql(ctx);
    const list = genderList(['1']); // dataSource 已固化 customer_core（resolveConditionDataSource 純函式）
    await listRepo.save(list);
    await seedPool({ applNo: 'P3AA_DE1', custo_no: 'P3AC_DE1' });
    await seedCustomer({ source_customer_no: 'P3AC_DE1', gender: '1' });
    await seedPool({ applNo: 'P3AA_DE2', custo_no: 'P3AC_DE2' });
    await seedCustomer({ source_customer_no: 'P3AC_DE2', gender: '2' });
    expect(await estimate(list, WORKDT_JUL)).toBe(1);
  });
});

// ===========================================================================
// 十、CCEQ — customer_core 條件下 JS↔MSSQL 等價（手算 oracle）
// ===========================================================================
describe('P3a CCEQ — customer_core estimate ↔ 手算 oracle 等價', () => {
  async function seedMixedFixture() {
    await seedPool({ applNo: 'P3AA_Q1', custo_no: 'P3AC_Q1', prod_kind: '01' });
    await seedCustomer({ source_customer_no: 'P3AC_Q1', gender: '1', education_desc: '大學', cpost_city: '臺北市大安區', date_of_birth: '1990-05-05' });
    await seedPool({ applNo: 'P3AA_Q2', custo_no: 'P3AC_Q2', prod_kind: '01' });
    await seedCustomer({ source_customer_no: 'P3AC_Q2', gender: '2', education_desc: '高中', cpost_city: '新北市板橋區', date_of_birth: '1970-01-01' });
    await seedPool({ applNo: 'P3AA_Q3', custo_no: 'P3AC_Q3', prod_kind: '01' }); // 無客戶
    await seedPool({ applNo: 'P3AA_Q4', custo_no: 'P3AC_Q4', prod_kind: '02' });
    await seedCustomer({ source_customer_no: 'P3AC_Q4', gender: '1', education_desc: '大學', cpost_city: '臺北市信義區', date_of_birth: '1995-12-31' });
  }

  it('TS-MSSQL-P3A-CCEQ-GATE-001（決策關卡）：oracle 方法論 = 手算 JS（未修改 stage1-filter-chain.ts）', () => {
    // §0.3 預設路徑：不改 stage1-filter-chain.ts；customer_core 群組以「已知 fixture 手算期望值」為 oracle
    //   （不用 executeStage1Chain，其對 MSSQL 會拋 PG AGE()/EXTRACT/::date 語法錯誤）。見 impl log Architectural Decisions。
    const src = readFileSync(join(__dirname, '..', 'stage1-filter-chain.ts'), 'utf8');
    expect(src).toContain('buildCustomerCoreClause('); // PG 版仍為唯一 clause 呼叫（未 dialect-aware）
    expect(src).not.toContain('buildCustomerCoreClauseMssql'); // 未逾越 AD §1.1 檔案清單
  });

  it('TS-MSSQL-P3A-CCEQ-001：純 customer_core（gender[1]）estimate = 手算 oracle（2）', async (ctx) => {
    ensureMssql(ctx);
    await seedMixedFixture();
    const list = genderList(['1']);
    await listRepo.save(list);
    // 手算：gender=1 → Q1、Q4（Q2 gender=2 排、Q3 無客戶排）→ 2
    expect(await estimate(list, WORKDT_JUL)).toBe(2);
  });

  it('TS-MSSQL-P3A-CCEQ-002：ob_pool_data + customer_core AND estimate = 手算 oracle（1）', async (ctx) => {
    ensureMssql(ctx);
    await seedMixedFixture();
    const list = makeListDef({
      list_nm: '客戶篩選名單',
      condition_payload: {
        logic: 'AND',
        conditions: [
          { columnName: 'prod_kind', fieldType: 'categorical', values: ['01'], dataSource: 'ob_pool_data' },
          { columnName: 'gender', fieldType: 'categorical', values: ['1'], dataSource: 'customer_core' },
        ],
      } as ObListDefinition['condition_payload'],
    });
    await listRepo.save(list);
    // 手算：prod_kind=01 AND gender=1 → 僅 Q1（Q4 prod_kind=02 排）→ 1
    expect(await estimate(list, WORKDT_JUL)).toBe(1);
  });

  it('TS-MSSQL-P3A-CCEQ-003：AGE 條件 estimate = 手算 oracle', async (ctx) => {
    ensureMssql(ctx);
    await seedMixedFixture();
    const list = ageList(30, 40);
    await listRepo.save(list);
    // workdt=2026-07-01：Q1(1990-05-05→36) 入、Q2(1970→56) 排、Q4(1995-12-31→30) 入、Q3 無客戶排 → 2
    expect(await estimate(list, WORKDT_JUL)).toBe(2);
  });

  it('TS-MSSQL-P3A-CCEQ-004：cpost_city LEFT3 estimate = 手算 oracle', async (ctx) => {
    ensureMssql(ctx);
    await seedMixedFixture();
    const list = cityList(['臺北市']);
    await listRepo.save(list);
    // LEFT3=臺北市 → Q1(臺北市大安區)、Q4(臺北市信義區) 入；Q2(新北市) 排、Q3 無客戶排 → 2
    expect(await estimate(list, WORKDT_JUL)).toBe(2);
  });

  it('TS-MSSQL-P3A-CCEQ-005：純 ob_pool_data（無 customer_core）estimate = executeStage1Chain（regression）', async (ctx) => {
    ensureMssql(ctx);
    await seedMixedFixture();
    const list = makeListDef({
      list_nm: '客戶篩選名單',
      condition_payload: {
        logic: 'AND',
        conditions: [
          { columnName: 'prod_kind', fieldType: 'categorical', values: ['01'], dataSource: 'ob_pool_data' },
        ],
      } as ObListDefinition['condition_payload'],
    });
    await listRepo.save(list);
    // 本案例不含 customer_core → executeStage1Chain 可安全對 MSSQL 執行（oracle）。
    const est = await estimate(list, WORKDT_JUL);
    const chain = await runJsOraclePks(list, WORKDT_JUL);
    expect(est).toBe(chain.length); // prod_kind=01 → Q1/Q2/Q3 → 3
    expect(est).toBe(3);
  });
});

// ===========================================================================
// 十一、RUNEST — run 列數 === estimate COUNT
// ===========================================================================
describe('P3a RUNEST — run 列數 === estimate COUNT', () => {
  it('TS-MSSQL-P3A-RUNEST-001：含特例 + 去重名單，run 列數 === estimate COUNT', async (ctx) => {
    ensureMssql(ctx);
    const list = makeListDef({ list_nm: '機車期中催收名單' });
    await listRepo.save(list);
    await seedWindowAnchor();
    await seedPool({ applNo: 'P3AA_R1', payt_term: 21, deal_num: '24' }); // 排
    await seedPool({ applNo: 'P3AA_R2', payt_term: 0, deal_num: '24', custo_no: 'P3AC_R2' }); // 去重排
    await seedPool({ applNo: 'P3AA_R3', payt_term: 0, deal_num: '24' }); // 留
    await seedPdl({ custoNo: 'P3AC_R2', assignday: '20260420' });
    const count = await estimate(list, WORKDT);
    const { rows } = await runSqlPushdownPks(list, WORKDT);
    expect(rows.length).toBe(count);
  });

  it('TS-MSSQL-P3A-RUNEST-002：year-above 名單 estimate 不漏套（列數===COUNT，year-above 已扣除）', async (ctx) => {
    ensureMssql(ctx);
    const list = makeListDef({ list_nm: '5年以上名單' });
    await listRepo.save(list);
    await seedPool({ applNo: 'P3AA_R4', year_produ: '2000' }); // 排
    await seedPool({ applNo: 'P3AA_R5', year_produ: '2020' }); // 留
    const count = await estimate(list, WORKDT);
    const { rows } = await runSqlPushdownPks(list, WORKDT);
    expect(rows.length).toBe(count);
    expect(count).toBe(1);
  });
});

// ===========================================================================
// 十二、IDEM — 冪等清理
// ===========================================================================
describe('P3a IDEM — 冪等清理（I-IDEM-01）', () => {
  it('TS-MSSQL-P3A-IDEM-001：同 run_id 重觸發前清理 → 列集合一致（不重複殘留）', async (ctx) => {
    ensureMssql(ctx);
    const list = makeListDef({ list_nm: '一般催收名單' });
    await listRepo.save(list);
    await seedPool({ applNo: 'P3AA_ID1' });
    await seedPool({ applNo: 'P3AA_ID2' });
    const first = await runSqlPushdownPks(list);
    const second = await runSqlPushdownPks(list); // 重跑（內部先 DELETE by run_id+list_no）
    expect(second.pks).toEqual(first.pks);
    const total = await resultRepo.count({ where: { run_id: RUN_ID } });
    expect(total).toBe(first.pks.length);
  });

  it('TS-MSSQL-P3A-IDEM-002：刪除 assignment_run → FK CASCADE 自動清 result 列（0 殘留）', async (ctx) => {
    ensureMssql(ctx);
    const list = makeListDef({ list_nm: '一般催收名單' });
    await listRepo.save(list);
    await seedPool({ applNo: 'P3AA_ID3' });
    await runSqlPushdownPks(list);
    expect(await resultRepo.count({ where: { run_id: RUN_ID } })).toBeGreaterThan(0);
    await runRepo.delete({ run_id: RUN_ID });
    expect(await resultRepo.count({ where: { run_id: RUN_ID } })).toBe(0);
  });

  it('TS-MSSQL-P3A-IDEM-003：重觸發兩 run_id 互不污染', async (ctx) => {
    ensureMssql(ctx);
    await seedRun(RUN_ID2);
    const list = makeListDef({ list_nm: '一般催收名單' });
    await listRepo.save(list);
    await seedPool({ applNo: 'P3AA_ID4' });
    await runSqlPushdownPks(list, WORKDT, RUN_ID);
    await runSqlPushdownPks(list, WORKDT, RUN_ID2);
    await runSqlPushdownPks(list, WORKDT, RUN_ID); // 重跑 RUN_ID
    expect(await resultRepo.count({ where: { run_id: RUN_ID } })).toBe(1);
    expect(await resultRepo.count({ where: { run_id: RUN_ID2 } })).toBe(1);
  });
});

// ===========================================================================
// 十三、CHARSET — 中文 round-trip
// ===========================================================================
describe('P3a CHARSET — 中文 LIKE / spec_name round-trip', () => {
  it('TS-MSSQL-P3A-CHARSET-001：特例觸發字（機車期中/期中/年以上/小資）中文正確觸發對應 WHERE 片段', async (ctx) => {
    ensureMssql(ctx);
    // 觸發字純 JS matchesSpecialRule（不動）；本案例驗證觸發後產出之 MSSQL SQL 片段中文常數正確 round-trip。
    await seedWindowAnchor();
    const mc = makeListDef({ list_nm: '機車期中催收名單' });
    await listRepo.save(mc);
    await seedPool({ applNo: 'P3AA_H1', payt_term: 30, deal_num: '24' }); // 排（機車期中）
    await seedPool({ applNo: 'P3AA_H2', payt_term: 0, deal_num: '24' }); // 留
    const pks = await assertEquivalent(mc);
    expect(pks).toEqual(['01:P3AA_H2']);
  });

  it('TS-MSSQL-P3A-CHARSET-002：spec_name 中文值（白牌/一般）byte-exact 比對', async (ctx) => {
    ensureMssql(ctx);
    const list = makeListDef({ list_nm: '詐騙白牌專案' });
    await listRepo.save(list);
    await seedPool({ applNo: 'P3AA_H3', list_type: '01', spec_name: '白牌' }); // 排
    await seedPool({ applNo: 'P3AA_H4', list_type: '01', spec_name: '一般' }); // 留
    const pks = await assertEquivalent(list);
    expect(pks).toEqual(['01:P3AA_H4']);
  });
});

// ===========================================================================
// 十四、STATIC — 靜態守門（不需連線）
// ===========================================================================
describe('P3a STATIC — 靜態守門', () => {
  const STAGE1_DIR = join(__dirname, '..');
  const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..', '..', '..');

  it('TS-MSSQL-P3A-STATIC-001：本 mssql spec 不對六共用表 DROP/TRUNCATE', () => {
    // 鎖定實際資料表級 DDL 陳述式；註解 / 測試描述中之斜線相連字樣不算執行陳述式。
    // 為免本斷言之字面關鍵字自我誤判，關鍵字以片段組合，掃描時才還原。
    const src = readFileSync(__filename, 'utf8');
    const dropTbl = new RegExp('DROP' + '\\s+' + 'TABLE', 'i');
    const truncTbl = new RegExp('TRUNCATE' + '\\s+' + 'TABLE', 'i');
    expect(dropTbl.test(src)).toBe(false);
    expect(truncTbl.test(src)).toBe(false);
    // 清理一律 DELETE（精準前綴 P3A），確認 cleanupP3A 僅用 DELETE。
    expect(src).toContain('DELETE FROM ob_pool_data WHERE');
  });

  it('TS-MSSQL-P3A-STATIC-002：PG 現行五核心檔案 git diff 為空（cutover 前零風險）', () => {
    const files = [
      'stage1-sql-builder.ts',
      'stage1-customer-core-clause.ts',
      'stage1-sql-executor.ts',
      'stage1-query-composer.ts',
      'stage1-filter-chain.ts',
    ].map((f) => join('apps', 'api', 'src', 'modules', 'assignment', 'stage1', f));
    const res = spawnSync('git', ['diff', '--quiet', '--', ...files], {
      cwd: REPO_ROOT,
    });
    if (res.error) {
      // git 不可用 → 退化為文字守門（PG 檔不得含 mssql 專屬字面）。
      for (const rel of files) {
        const src = readFileSync(join(REPO_ROOT, rel), 'utf8');
        expect(src).not.toContain('buildCustomerCoreClauseMssql');
        expect(src).not.toContain('mssqlLeadingYearExpr');
      }
      return;
    }
    expect(res.status).toBe(0); // diff 為空
  });

  it('TS-MSSQL-P3A-STATIC-003：special-rules.ts 未新增 mssql 版本', () => {
    expect(existsSync(join(STAGE1_DIR, 'special-rules-mssql.ts'))).toBe(false);
  });

  it('TS-MSSQL-P3A-STATIC-004：DISPATCH 三分支於原始碼層級確實存在（含 mssql 分支字面）', () => {
    const svcDir = join(__dirname, '..', '..');
    const pipelineSrc = readFileSync(
      join(svcDir, 'services', 'assignment-run-pipeline.service.ts'),
      'utf8',
    );
    expect(pipelineSrc).toContain("=== 'mssql'"); // resolveStage1Strategy 內
    expect(pipelineSrc).toContain('runStage1SqlPushdownMssql');
    const estimateSrc = readFileSync(
      join(__dirname, '..', '..', '..', 'assignment-list', 'stage0-estimate.service.ts'),
      'utf8',
    );
    expect(estimateSrc).toContain("=== 'mssql'");
    expect(estimateSrc).toContain('estimateStage1SqlCountMssql');
  });
});
