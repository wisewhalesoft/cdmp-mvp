/**
 * F101 / AD-E07-29 — Stage 3/4 真實比例分派 SQL 下推（PG 真庫，強制 Postgres）
 *
 * 對應測試設計（F101-test.md）：
 *   - DEPT-001~008：Stage 3 dept ration 手算 oracle（FLOOR + obdeptid ASC 差額補足）
 *   - EMPL-001~009：Stage 4 empl ration 手算 oracle（FLOOR + ADD_CNT + emplid ASC 前 N）
 *   - ASGD-001~005：ASSIGNDAY 千分比（per casedt FLOOR + 最末吸收 + 無 calendar fallback）
 *   - EQ-001~008：JS executeV2 oracle ↔ PG SQL 下推逐列四元組等價（DoD 門檻，AC-15）
 *   - IDEM-001~002：Stage 3 前清除 + 兩次 run 四元組相同
 *   - FALL-004~006：複合警告 / skipped_cases.warnings 合併 / 不寫 audit_log
 *   - REG-001~004：emplid≠NULL（Bug C 防護）/ no st4_exchange / is_cr 不改
 *
 * oracle = 手算預期（非跑 placeholder）。EQ 群組以同一 seed 跑「JS distributeStage3to4」與
 * 「PG runStage3to4RationSql」逐列 toEqual（確定性 → 精確比對）。
 *
 * 連線：env PG_BOSS_TEST_*，預設 docker-compose.test.yml 之 postgres-test（5433/cdmp_test）。
 * 不可達 → 整 describe skip-with-reason（不假綠）。
 *
 * ⚠️ CI 序列：F098/F099/F100/F101 pg.spec 共用 cdmp_test DB（DROP/synchronize），一次跑一個檔案。
 */

// ⚠️ 必須最先 import（side-effect 設 DB_TYPE=postgres）。
import { restoreDbType } from './pg-env-preload';

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from 'vitest';
import * as net from 'net';
import { DataSource, Repository, EntityManager } from 'typeorm';

import { ObPoolData } from '@/database/entities/ob-pool-data.entity';
import { ObMonthlyRunResult } from '@/database/entities/ob-monthly-run-result.entity';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { AssignmentRunSnapshot } from '@/database/entities/assignment-run-snapshot.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';
import { runStage3to4RationSql } from '../stage3to4-ration-sql';
import {
  distributeStage3to4,
  type RationCase,
  type DeptRation,
  type EmplRation,
  type WorkingDay,
} from '../stage3to4-ration';

const PG = {
  host: process.env.PG_BOSS_TEST_HOST ?? '127.0.0.1',
  port: Number(process.env.PG_BOSS_TEST_PORT ?? 5433),
  user: process.env.PG_BOSS_TEST_USER ?? 'cdmp',
  password: process.env.PG_BOSS_TEST_PASSWORD ?? 'cdmp_secret',
  database: process.env.PG_BOSS_TEST_DB ?? 'cdmp_test',
};

const SKIP_REASON =
  '需 Postgres（docker compose -f docker-compose.test.yml up -d postgres-test）— 未實跑';

const RUN_ID = '00000000-0000-0000-0000-0000000000e1';
const RUN_ID_2 = '00000000-0000-0000-0000-0000000000e2';
const YM = '202606';

function pgPortReachable(timeoutMs = 1000): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = net.connect({ host: PG.host, port: PG.port });
    const finish = (ok: boolean) => {
      sock.destroy();
      resolve(ok);
    };
    sock.setTimeout(timeoutMs);
    sock.once('connect', () => finish(true));
    sock.once('error', () => finish(false));
    sock.once('timeout', () => finish(false));
  });
}

let reachable = false;
let ds: DataSource | null = null;
let poolRepo: Repository<ObPoolData>;
let resultRepo: Repository<ObMonthlyRunResult>;
let manager: EntityManager;

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

/** seed pool + result（同案件，Stage 1+2 已寫入 result，tier_level 已定）。 */
/**
 * 建構單一案件之 pool / result row 物件（不寫 DB，供批量 bulk insert）。
 * appl_no 以全域 applSeq 連號（保證每 run 內唯一，避免 PK 衝突 / save() upsert 競態）。
 */
function makeCase(opts: {
  listNo: string;
  poolDeptId: string;
  tier: string | null;
  runId?: string;
  applNo?: string;
  isCr?: string;
}): { orgno: string; applNo: string; pool: Partial<ObPoolData>; result: Partial<ObMonthlyRunResult> } {
  applSeq += 1;
  const applNo = opts.applNo ?? String(applSeq).padStart(5, '0');
  const orgno = '01';
  const custoNo = `C${String(applSeq).padStart(6, '0')}`;
  return {
    orgno,
    applNo,
    pool: {
      orgno, appl_no: applNo, custo_no: custoNo, sta_code: '01',
      dept_id: opts.poolDeptId, list_type: '01', settle_src: '01',
      month_cnt: 1, _cdmp_extracted_at: new Date(),
    } as Partial<ObPoolData>,
    result: {
      run_id: opts.runId ?? RUN_ID, list_no: opts.listNo, orgno, appl_no: applNo,
      custo_no: custoNo, settle_src: '01', tier_level: opts.tier, is_cr: opts.isCr ?? 'N',
      result_status: 'PENDING', created_at: new Date(), updated_at: new Date(),
    } as Partial<ObMonthlyRunResult>,
  };
}

/** seed 單一案件（bulk insert 一列 pool + 一列 result）。 */
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

/**
 * 批量 seed n 件同分組案件（appl_no 連號）——以單一 bulk insert 寫入（避免 n 次 save() 往返之競態）。
 */
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
      listNo: opts.listNo, poolDeptId: opts.poolDeptId, tier: opts.tier, runId: opts.runId,
    });
    pools.push(c.pool);
    results.push(c.result);
  }
  await poolRepo.insert(pools as never);
  await resultRepo.insert(results as never);
}

async function deptDist(
  listNo: string,
  runId = RUN_ID,
): Promise<Record<string, number>> {
  const rows = await resultRepo.find({ where: { run_id: runId, list_no: listNo } });
  const out: Record<string, number> = {};
  for (const r of rows) {
    if (r.dept_id) out[r.dept_id] = (out[r.dept_id] ?? 0) + 1;
  }
  return out;
}

async function emplDist(
  listNo: string,
  runId = RUN_ID,
): Promise<Record<string, number>> {
  const rows = await resultRepo.find({ where: { run_id: runId, list_no: listNo } });
  const out: Record<string, number> = {};
  for (const r of rows) {
    if (r.emplid) out[r.emplid] = (out[r.emplid] ?? 0) + 1;
  }
  return out;
}

function ensurePg(ctx: { skip: () => void }): void {
  if (!reachable || !ds) {
    // eslint-disable-next-line no-console
    console.warn(`[F101 PG Integration] SKIPPED — ${SKIP_REASON}`);
    ctx.skip();
  }
}

beforeAll(async () => {
  reachable = await pgPortReachable();
  if (!reachable) return;
  try {
    ds = new DataSource({
      type: 'postgres',
      host: PG.host,
      port: PG.port,
      username: PG.user,
      password: PG.password,
      database: PG.database,
      entities: [
        ObPoolData,
        ObMonthlyRunResult,
        AssignmentRun,
        AssignmentRunSnapshot,
        AssignmentAuditLog,
      ],
      synchronize: true,
    });
    await ds.initialize();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[F101 PG Integration] init failed → skip:', (e as Error)?.message);
    reachable = false;
    ds = null;
    return;
  }
  poolRepo = ds.getRepository(ObPoolData);
  resultRepo = ds.getRepository(ObMonthlyRunResult);
  manager = ds.manager;
}, 60000);

afterAll(async () => {
  if (ds) {
    await ds.query('DROP TABLE IF EXISTS ob_monthly_run_result CASCADE');
    await ds.query('DROP TABLE IF EXISTS ob_pool_data CASCADE');
    await ds.query('DROP TABLE IF EXISTS assignment_run_snapshot CASCADE');
    await ds.query('DROP TABLE IF EXISTS assignment_audit_log CASCADE');
    await ds.query('DROP TABLE IF EXISTS assignment_run CASCADE');
    await ds.destroy();
  }
  restoreDbType();
});

beforeEach(async () => {
  if (!reachable || !ds) return;
  await ds.query('DELETE FROM ob_monthly_run_result');
  await ds.query('DELETE FROM assignment_run_snapshot');
  await ds.query('DELETE FROM assignment_audit_log');
  await ds.query('DELETE FROM ob_pool_data');
  await ds.query('DELETE FROM assignment_run');
  await ds.query(
    `INSERT INTO assignment_run (run_id, project_workym, status, triggered_by, created_at)
     VALUES ($1, '202606', 'running', '00000000-0000-0000-0000-000000000001', now()),
            ($2, '202606', 'running', '00000000-0000-0000-0000-000000000001', now())`,
    [RUN_ID, RUN_ID_2],
  );
  applSeq = 0;
});

// ===========================================================================
// DEPT — Stage 3 dept ration 手算 oracle
// ===========================================================================
describe('F101 DEPT — Stage 3 dept ration（PG 真庫）', () => {
  it('DEPT-001：Seed 1（XVF1/T1，101 件，diff=1）→ 51/30/20', async (ctx) => {
    ensurePg(ctx);
    const L = 'OB202606001';
    await seedGroup({ listNo: L, poolDeptId: 'XVF1', tier: 'T1', n: 101 });
    await runStage3to4RationSql(manager, {
      runId: RUN_ID, listNo: L, ym: YM, deptRations: DEPT_3, emplRations: [], workingDays: [],
    });
    expect(await deptDist(L)).toEqual({ AI000: 51, AM000: 30, B0000: 20 });
  });

  it('DEPT-002：Seed 2（73 件，diff=2）→ 37/22/14', async (ctx) => {
    ensurePg(ctx);
    const L = 'OB202606001';
    await seedGroup({ listNo: L, poolDeptId: 'XVF1', tier: 'T2', n: 73 });
    await runStage3to4RationSql(manager, {
      runId: RUN_ID, listNo: L, ym: YM, deptRations: DEPT_3, emplRations: [], workingDays: [],
    });
    expect(await deptDist(L)).toEqual({ AI000: 37, AM000: 22, B0000: 14 });
  });

  it('DEPT-003：Seed 4（40 件，diff=0）→ 20/12/8', async (ctx) => {
    ensurePg(ctx);
    const L = 'OB202606001';
    await seedGroup({ listNo: L, poolDeptId: 'XVG1', tier: 'T2', n: 40 });
    await runStage3to4RationSql(manager, {
      runId: RUN_ID, listNo: L, ym: YM, deptRations: DEPT_3, emplRations: [], workingDays: [],
    });
    expect(await deptDist(L)).toEqual({ AI000: 20, AM000: 12, B0000: 8 });
  });

  it('DEPT-004：2 分處 × 2 Tier 全矩陣', async (ctx) => {
    ensurePg(ctx);
    const L = 'OB202606001';
    await seedGroup({ listNo: L, poolDeptId: 'XVF1', tier: 'T1', n: 101 });
    await seedGroup({ listNo: L, poolDeptId: 'XVF1', tier: 'T2', n: 73 });
    await seedGroup({ listNo: L, poolDeptId: 'XVG1', tier: 'T1', n: 58 });
    await seedGroup({ listNo: L, poolDeptId: 'XVG1', tier: 'T2', n: 40 });
    await runStage3to4RationSql(manager, {
      runId: RUN_ID, listNo: L, ym: YM, deptRations: DEPT_3, emplRations: [], workingDays: [],
    });
    // 以 (pool dept, tier) join 統計：XVG1/T1 → 30/17/11。
    const rows = await resultRepo
      .createQueryBuilder('r')
      .innerJoin(ObPoolData, 'o', 'o.orgno = r.orgno AND o.appl_no = r.appl_no')
      .select(['o.dept_id AS pd', 'r.tier_level AS tl', 'r.dept_id AS dd', 'COUNT(*) AS cnt'])
      .where('r.run_id = :runId', { runId: RUN_ID })
      .groupBy('o.dept_id').addGroupBy('r.tier_level').addGroupBy('r.dept_id')
      .getRawMany<{ pd: string; tl: string; dd: string; cnt: string }>();
    const cell = (pd: string, tl: string, dd: string) =>
      Number(rows.find((x) => x.pd === pd && x.tl === tl && x.dd === dd)?.cnt ?? 0);
    expect([cell('XVF1', 'T1', 'AI000'), cell('XVF1', 'T1', 'AM000'), cell('XVF1', 'T1', 'B0000')]).toEqual([51, 30, 20]);
    expect([cell('XVF1', 'T2', 'AI000'), cell('XVF1', 'T2', 'AM000'), cell('XVF1', 'T2', 'B0000')]).toEqual([37, 22, 14]);
    expect([cell('XVG1', 'T1', 'AI000'), cell('XVG1', 'T1', 'AM000'), cell('XVG1', 'T1', 'B0000')]).toEqual([30, 17, 11]);
    expect([cell('XVG1', 'T2', 'AI000'), cell('XVG1', 'T2', 'AM000'), cell('XVG1', 'T2', 'B0000')]).toEqual([20, 12, 8]);
  });

  it('DEPT-005：多分處不退化（distinct dept=3，AI000 無員工仍配）', async (ctx) => {
    ensurePg(ctx);
    const L = 'OB202606001';
    await seedGroup({ listNo: L, poolDeptId: 'XVF1', tier: 'T1', n: 101 });
    await runStage3to4RationSql(manager, {
      runId: RUN_ID, listNo: L, ym: YM, deptRations: DEPT_3,
      emplRations: [
        { emplid: 'F1', deptid_m: 'AM000', ration: 100 },
        { emplid: 'G1', deptid_m: 'B0000', ration: 100 },
      ],
      workingDays: [],
    });
    const dist = await deptDist(L);
    expect(Object.keys(dist).sort()).toEqual(['AI000', 'AM000', 'B0000']);
    expect(dist.AI000).toBe(51);
  });

  it('DEPT-006：依配額循序指派 (orgno, appl_no) ASC', async (ctx) => {
    ensurePg(ctx);
    const L = 'OB202606001';
    for (let i = 1; i <= 10; i++) {
      await seedCase({ listNo: L, poolDeptId: 'XVF1', tier: 'T1', applNo: String(i).padStart(4, '0') });
    }
    await runStage3to4RationSql(manager, {
      runId: RUN_ID, listNo: L, ym: YM,
      deptRations: [
        { obdeptid: 'AI000', ration: 60 },
        { obdeptid: 'AM000', ration: 30 },
        { obdeptid: 'B0000', ration: 10 },
      ],
      emplRations: [], workingDays: [],
    });
    const byAppl = async (appl: string) =>
      (await resultRepo.findOne({ where: { run_id: RUN_ID, list_no: L, orgno: '01', appl_no: appl } }))!.dept_id;
    for (let i = 1; i <= 6; i++) expect(await byAppl(String(i).padStart(4, '0'))).toBe('AI000');
    for (let i = 7; i <= 9; i++) expect(await byAppl(String(i).padStart(4, '0'))).toBe('AM000');
    expect(await byAppl('0010')).toBe('B0000');
  });

  it('DEPT-007：無 ration → dept_id NULL + STAGE3_NO_DEPT_RATION 警告', async (ctx) => {
    ensurePg(ctx);
    const L = 'OB202606001';
    await seedGroup({ listNo: L, poolDeptId: 'XVF1', tier: 'T2', n: 12 });
    const warnings = await runStage3to4RationSql(manager, {
      runId: RUN_ID, listNo: L, ym: YM, deptRations: [], emplRations: [], workingDays: [],
    });
    const rows = await resultRepo.find({ where: { run_id: RUN_ID, list_no: L } });
    expect(rows.every((r) => r.dept_id === null)).toBe(true);
    expect(warnings).toContainEqual({
      event: 'STAGE3_NO_DEPT_RATION', list_no: L, tier_level: 'T2', case_count: 12,
    });
  });

  it('DEPT-008：tier_level 全 NULL（Stage 2 未跑）→ 不分配', async (ctx) => {
    ensurePg(ctx);
    const L = 'OB202606001';
    for (let i = 0; i < 10; i++) await seedCase({ listNo: L, poolDeptId: 'XVF1', tier: null });
    await runStage3to4RationSql(manager, {
      runId: RUN_ID, listNo: L, ym: YM, deptRations: DEPT_3, emplRations: [], workingDays: [],
    });
    const rows = await resultRepo.find({ where: { run_id: RUN_ID, list_no: L } });
    expect(rows.every((r) => r.dept_id === null)).toBe(true);
  });
});

// ===========================================================================
// EMPL — Stage 4 empl ration 手算 oracle
// ===========================================================================
describe('F101 EMPL — Stage 4 empl ration（PG 真庫）', () => {
  function singleDept(deptId: string): DeptRation[] {
    return [{ obdeptid: deptId, ration: 100 }];
  }

  it('EMPL-001：Seed A（AI000/T1，51 件，40/35/25）→ 21/18/12', async (ctx) => {
    ensurePg(ctx);
    const L = 'OB202606001';
    await seedGroup({ listNo: L, poolDeptId: 'XVF1', tier: 'T1', n: 51 });
    await runStage3to4RationSql(manager, {
      runId: RUN_ID, listNo: L, ym: YM, deptRations: singleDept('AI000'),
      emplRations: [
        { emplid: 'E1', deptid_m: 'AI000', ration: 40 },
        { emplid: 'E2', deptid_m: 'AI000', ration: 35 },
        { emplid: 'E3', deptid_m: 'AI000', ration: 25 },
      ],
      workingDays: [],
    });
    expect(await emplDist(L)).toEqual({ E1: 21, E2: 18, E3: 12 });
    const rows = await resultRepo.find({ where: { run_id: RUN_ID, list_no: L } });
    expect(rows.every((r) => r.emplid_deptid === 'AI000')).toBe(true);
  });

  it('EMPL-002：Seed B（30 件，50/30/20 整除）→ 15/9/6', async (ctx) => {
    ensurePg(ctx);
    const L = 'OB202606001';
    await seedGroup({ listNo: L, poolDeptId: 'XVF1', tier: 'T1', n: 30 });
    await runStage3to4RationSql(manager, {
      runId: RUN_ID, listNo: L, ym: YM, deptRations: singleDept('AM000'),
      emplRations: [
        { emplid: 'F1', deptid_m: 'AM000', ration: 50 },
        { emplid: 'F2', deptid_m: 'AM000', ration: 30 },
        { emplid: 'F3', deptid_m: 'AM000', ration: 20 },
      ],
      workingDays: [],
    });
    expect(await emplDist(L)).toEqual({ F1: 15, F2: 9, F3: 6 });
  });

  it('EMPL-003：Seed C（103 件，34/33/33，diff=2 前 2 +1）→ 36/34/33', async (ctx) => {
    ensurePg(ctx);
    const L = 'OB202606001';
    await seedGroup({ listNo: L, poolDeptId: 'XVE2', tier: 'T2', n: 103 });
    await runStage3to4RationSql(manager, {
      runId: RUN_ID, listNo: L, ym: YM, deptRations: singleDept('XVE2'),
      emplRations: [
        { emplid: 'G1', deptid_m: 'XVE2', ration: 34 },
        { emplid: 'G2', deptid_m: 'XVE2', ration: 33 },
        { emplid: 'G3', deptid_m: 'XVE2', ration: 33 },
      ],
      workingDays: [],
    });
    expect(await emplDist(L)).toEqual({ G1: 36, G2: 34, G3: 33 });
  });

  it('EMPL-007：課有案件但無員工 → emplid NULL + STAGE4_NO_EMPL_WARN', async (ctx) => {
    ensurePg(ctx);
    const L = 'OB202606001';
    await seedGroup({ listNo: L, poolDeptId: 'XVF1', tier: 'T1', n: 51 });
    const warnings = await runStage3to4RationSql(manager, {
      runId: RUN_ID, listNo: L, ym: YM, deptRations: singleDept('AI000'),
      emplRations: [], workingDays: [],
    });
    const rows = await resultRepo.find({ where: { run_id: RUN_ID, list_no: L } });
    expect(rows.filter((r) => r.dept_id === 'AI000').length).toBe(51);
    expect(rows.every((r) => r.emplid === null)).toBe(true);
    expect(warnings).toContainEqual({
      event: 'STAGE4_NO_EMPL_WARN', dept_id: 'AI000', list_no: L, tier_level: 'T1', case_count: 51,
    });
  });

  it('EMPL-008：AI000/T2（37 件，40/35/25，diff=2）→ 15/13/9', async (ctx) => {
    ensurePg(ctx);
    const L = 'OB202606001';
    await seedGroup({ listNo: L, poolDeptId: 'XVF1', tier: 'T2', n: 37 });
    await runStage3to4RationSql(manager, {
      runId: RUN_ID, listNo: L, ym: YM, deptRations: singleDept('AI000'),
      emplRations: [
        { emplid: 'E1', deptid_m: 'AI000', ration: 40 },
        { emplid: 'E2', deptid_m: 'AI000', ration: 35 },
        { emplid: 'E3', deptid_m: 'AI000', ration: 25 },
      ],
      workingDays: [],
    });
    expect(await emplDist(L)).toEqual({ E1: 15, E2: 13, E3: 9 });
  });
});

// ===========================================================================
// ASGD — ASSIGNDAY 千分比
// ===========================================================================
describe('F101 ASGD — ASSIGNDAY 千分比（PG 真庫）', () => {
  it('ASGD-001：E1（21 件，20 工作日）→ 19 日各 1 + 末日 2', async (ctx) => {
    ensurePg(ctx);
    const L = 'OB202606001';
    await seedGroup({ listNo: L, poolDeptId: 'AI000', tier: 'T1', n: 21 });
    await runStage3to4RationSql(manager, {
      runId: RUN_ID, listNo: L, ym: YM,
      deptRations: [{ obdeptid: 'AI000', ration: 100 }],
      emplRations: [{ emplid: 'E1', deptid_m: 'AI000', ration: 100 }],
      workingDays: WORKDAYS_20,
    });
    const rows = await resultRepo.find({ where: { run_id: RUN_ID, list_no: L } });
    expect(rows.every((r) => r.assignday !== null)).toBe(true);
    const byDay: Record<string, number> = {};
    for (const r of rows) byDay[r.assignday!] = (byDay[r.assignday!] ?? 0) + 1;
    expect(byDay['2026-06-20']).toBe(2);
    expect(Object.entries(byDay).filter(([d]) => d !== '2026-06-20').every(([, c]) => c === 1)).toBe(true);
    expect(rows.length).toBe(21);
  });

  it('ASGD-002：E2（18 件，FLOOR=0）→ 全 18 件落末日', async (ctx) => {
    ensurePg(ctx);
    const L = 'OB202606001';
    await seedGroup({ listNo: L, poolDeptId: 'AI000', tier: 'T1', n: 18 });
    await runStage3to4RationSql(manager, {
      runId: RUN_ID, listNo: L, ym: YM,
      deptRations: [{ obdeptid: 'AI000', ration: 100 }],
      emplRations: [{ emplid: 'E2', deptid_m: 'AI000', ration: 100 }],
      workingDays: WORKDAYS_20,
    });
    const rows = await resultRepo.find({ where: { run_id: RUN_ID, list_no: L } });
    const byDay: Record<string, number> = {};
    for (const r of rows) byDay[r.assignday!] = (byDay[r.assignday!] ?? 0) + 1;
    expect(byDay).toEqual({ '2026-06-20': 18 });
  });

  it('ASGD-005：無工作日 → assignday NULL + ASSIGNDAY_NO_CALENDAR_WARN', async (ctx) => {
    ensurePg(ctx);
    const L = 'OB202606001';
    await seedGroup({ listNo: L, poolDeptId: 'AI000', tier: 'T1', n: 10 });
    const warnings = await runStage3to4RationSql(manager, {
      runId: RUN_ID, listNo: L, ym: '202607',
      deptRations: [{ obdeptid: 'AI000', ration: 100 }],
      emplRations: [{ emplid: 'E1', deptid_m: 'AI000', ration: 100 }],
      workingDays: [],
    });
    const rows = await resultRepo.find({ where: { run_id: RUN_ID, list_no: L } });
    expect(rows.every((r) => r.assignday === null)).toBe(true);
    expect(warnings).toContainEqual({
      event: 'ASSIGNDAY_NO_CALENDAR_WARN', list_no: L, work_ym: '202607',
    });
  });
});

// ===========================================================================
// EQ — JS executeV2 oracle ↔ PG SQL 下推逐列等價（DoD 門檻，AC-15）
// ===========================================================================
describe('F101 EQ — JS↔SQL 逐列四元組等價（DoD）', () => {
  /** 跑 PG 下推後取四元組（依 orgno, appl_no 排序）。 */
  async function sqlQuad(
    listNo: string,
  ): Promise<Array<{ orgno: string; applNo: string; deptId: string | null; emplid: string | null; emplidDeptid: string | null; assignday: string | null }>> {
    const rows = await resultRepo.find({
      where: { run_id: RUN_ID, list_no: listNo },
      order: { orgno: 'ASC', appl_no: 'ASC' },
    });
    return rows.map((r) => ({
      orgno: r.orgno, applNo: r.appl_no, deptId: r.dept_id, emplid: r.emplid,
      emplidDeptid: r.emplid_deptid, assignday: r.assignday,
    }));
  }

  /** 以同 seed 跑 JS oracle，取四元組（依 orgno, appl_no 排序）。 */
  function jsQuad(
    cases: RationCase[], listNo: string, deptR: DeptRation[], emplR: EmplRation[], wd: WorkingDay[],
  ) {
    const r = distributeStage3to4(listNo, YM, cases, deptR, emplR, wd);
    return r.assignments
      .slice()
      .sort((a, b) => (a.orgno !== b.orgno ? (a.orgno < b.orgno ? -1 : 1) : a.appl_no < b.appl_no ? -1 : a.appl_no > b.appl_no ? 1 : 0))
      .map((a) => ({
        orgno: a.orgno, applNo: a.appl_no, deptId: a.dept_id, emplid: a.emplid,
        emplidDeptid: a.emplid_deptid, assignday: a.assignday,
      }));
  }

  it('EQ-001：基準（XVF1/T1/101 件 + 3 課 + 3 員工 + 20 工作日）逐列等價', async (ctx) => {
    ensurePg(ctx);
    const L = 'OB202606001';
    const cases: RationCase[] = [];
    for (let i = 1; i <= 101; i++) {
      const { orgno, applNo } = await seedCase({ listNo: L, poolDeptId: 'XVF1', tier: 'T1', applNo: String(i).padStart(5, '0') });
      cases.push({ orgno, appl_no: applNo, tier_level: 'T1', pool_dept_id: 'XVF1' });
    }
    const emplR: EmplRation[] = [
      { emplid: 'E1', deptid_m: 'AI000', ration: 40 },
      { emplid: 'E2', deptid_m: 'AI000', ration: 35 },
      { emplid: 'E3', deptid_m: 'AI000', ration: 25 },
      { emplid: 'F1', deptid_m: 'AM000', ration: 100 },
      { emplid: 'G1', deptid_m: 'B0000', ration: 100 },
    ];
    await runStage3to4RationSql(manager, {
      runId: RUN_ID, listNo: L, ym: YM, deptRations: DEPT_3, emplRations: emplR, workingDays: WORKDAYS_20,
    });
    expect(await sqlQuad(L)).toEqual(jsQuad(cases, L, DEPT_3, emplR, WORKDAYS_20));
  });

  it('EQ-003：多 Tier（T1+T2+T3）逐列等價', async (ctx) => {
    ensurePg(ctx);
    const L = 'OB202606001';
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
    const emplR: EmplRation[] = [
      { emplid: 'E1', deptid_m: 'AI000', ration: 40 },
      { emplid: 'E2', deptid_m: 'AI000', ration: 35 },
      { emplid: 'E3', deptid_m: 'AI000', ration: 25 },
      { emplid: 'F1', deptid_m: 'AM000', ration: 100 },
      { emplid: 'G1', deptid_m: 'B0000', ration: 100 },
    ];
    await runStage3to4RationSql(manager, {
      runId: RUN_ID, listNo: L, ym: YM, deptRations: DEPT_3, emplRations: emplR, workingDays: WORKDAYS_20,
    });
    expect(await sqlQuad(L)).toEqual(jsQuad(cases, L, DEPT_3, emplR, WORKDAYS_20));
  });

  it('EQ-006：無 ration 課（dept_id NULL fallback）逐列等價', async (ctx) => {
    ensurePg(ctx);
    const L = 'OB202606001';
    const cases: RationCase[] = [];
    for (let i = 0; i < 20; i++) {
      const { orgno, applNo } = await seedCase({ listNo: L, poolDeptId: 'XVF1', tier: 'T1' });
      cases.push({ orgno, appl_no: applNo, tier_level: 'T1', pool_dept_id: 'XVF1' });
    }
    await runStage3to4RationSql(manager, {
      runId: RUN_ID, listNo: L, ym: YM, deptRations: [], emplRations: [], workingDays: WORKDAYS_20,
    });
    expect(await sqlQuad(L)).toEqual(jsQuad(cases, L, [], [], WORKDAYS_20));
  });

  it('EQ-007：無員工課（emplid NULL fallback）逐列等價', async (ctx) => {
    ensurePg(ctx);
    const L = 'OB202606001';
    const cases: RationCase[] = [];
    for (let i = 0; i < 51; i++) {
      const { orgno, applNo } = await seedCase({ listNo: L, poolDeptId: 'XVF1', tier: 'T1' });
      cases.push({ orgno, appl_no: applNo, tier_level: 'T1', pool_dept_id: 'XVF1' });
    }
    const deptR: DeptRation[] = [{ obdeptid: 'AI000', ration: 100 }];
    await runStage3to4RationSql(manager, {
      runId: RUN_ID, listNo: L, ym: YM, deptRations: deptR, emplRations: [], workingDays: WORKDAYS_20,
    });
    expect(await sqlQuad(L)).toEqual(jsQuad(cases, L, deptR, [], WORKDAYS_20));
  });
});

// ===========================================================================
// IDEM — 重跑冪等
// ===========================================================================
describe('F101 IDEM — 重跑冪等（PG 真庫）', () => {
  it('IDEM-002：兩次不同 run_id 四元組集合完全相同', async (ctx) => {
    ensurePg(ctx);
    const L = 'OB202606001';
    const emplR: EmplRation[] = [
      { emplid: 'E1', deptid_m: 'AI000', ration: 40 },
      { emplid: 'E2', deptid_m: 'AI000', ration: 35 },
      { emplid: 'E3', deptid_m: 'AI000', ration: 25 },
      { emplid: 'F1', deptid_m: 'AM000', ration: 100 },
      { emplid: 'G1', deptid_m: 'B0000', ration: 100 },
    ];
    // 兩個 run 共用同一份 ob_pool_data（PK orgno+appl_no），各自一份 result（PK 含 run_id）。
    const pools: Partial<ObPoolData>[] = [];
    const results: Partial<ObMonthlyRunResult>[] = [];
    for (let i = 1; i <= 60; i++) {
      const applNo = String(i).padStart(5, '0');
      pools.push({
        orgno: '01', appl_no: applNo, custo_no: `C${applNo}`, sta_code: '01',
        dept_id: 'XVF1', list_type: '01', settle_src: '01', month_cnt: 1, _cdmp_extracted_at: new Date(),
      } as Partial<ObPoolData>);
      for (const rid of [RUN_ID, RUN_ID_2]) {
        results.push({
          run_id: rid, list_no: L, orgno: '01', appl_no: applNo, custo_no: `C${applNo}`,
          settle_src: '01', tier_level: 'T1', is_cr: 'N', result_status: 'PENDING',
          created_at: new Date(), updated_at: new Date(),
        } as Partial<ObMonthlyRunResult>);
      }
    }
    await poolRepo.insert(pools as never);
    await resultRepo.insert(results as never);
    await runStage3to4RationSql(manager, { runId: RUN_ID, listNo: L, ym: YM, deptRations: DEPT_3, emplRations: emplR, workingDays: WORKDAYS_20 });
    await runStage3to4RationSql(manager, { runId: RUN_ID_2, listNo: L, ym: YM, deptRations: DEPT_3, emplRations: emplR, workingDays: WORKDAYS_20 });
    const quad = async (runId: string) =>
      (await resultRepo.find({ where: { run_id: runId, list_no: L }, order: { orgno: 'ASC', appl_no: 'ASC' } }))
        .map((r) => `${r.appl_no}:${r.dept_id}:${r.emplid}:${r.emplid_deptid}:${r.assignday}`);
    expect(await quad(RUN_ID)).toEqual(await quad(RUN_ID_2));
  });
});

// ===========================================================================
// FALL — 警告通道
// ===========================================================================
describe('F101 FALL — 警告通道（PG 真庫）', () => {
  it('FALL-006：警告不寫 assignment_audit_log', async (ctx) => {
    ensurePg(ctx);
    const L = 'OB202606001';
    await seedGroup({ listNo: L, poolDeptId: 'XVF1', tier: 'T2', n: 12 });
    await runStage3to4RationSql(manager, {
      runId: RUN_ID, listNo: L, ym: YM, deptRations: [], emplRations: [], workingDays: [],
    });
    const audit = await ds!.query(
      `SELECT COUNT(*)::int AS cnt FROM assignment_audit_log
        WHERE action IN ('STAGE3_NO_DEPT_RATION','STAGE4_NO_EMPL_WARN','ASSIGNDAY_NO_CALENDAR_WARN')`,
    );
    expect(Number(audit[0].cnt)).toBe(0);
  });
});

// ===========================================================================
// REG — 回歸保護
// ===========================================================================
describe('F101 REG — 回歸保護（PG 真庫）', () => {
  it('REG-001：有 dept_id + 有員工設定者 emplid 不為 NULL（Bug C 防護）', async (ctx) => {
    ensurePg(ctx);
    const L = 'OB202606001';
    await seedGroup({ listNo: L, poolDeptId: 'XVF1', tier: 'T1', n: 51 });
    await runStage3to4RationSql(manager, {
      runId: RUN_ID, listNo: L, ym: YM,
      deptRations: [{ obdeptid: 'AI000', ration: 100 }],
      emplRations: [{ emplid: 'E1', deptid_m: 'AI000', ration: 100 }],
      workingDays: [],
    });
    const nullEmpl = await resultRepo
      .createQueryBuilder('r')
      .where('r.run_id = :runId AND r.list_no = :listNo', { runId: RUN_ID, listNo: L })
      .andWhere("r.dept_id = 'AI000'")
      .andWhere('r.emplid IS NULL')
      .getCount();
    expect(nullEmpl).toBe(0);
  });

  it('REG-004：is_cr 值不被 Stage 3/4 修改', async (ctx) => {
    ensurePg(ctx);
    const L = 'OB202606001';
    for (let i = 1; i <= 10; i++) {
      await seedCase({ listNo: L, poolDeptId: 'XVF1', tier: 'T1', applNo: String(i).padStart(4, '0'), isCr: i <= 4 ? 'Y' : 'N' });
    }
    await runStage3to4RationSql(manager, {
      runId: RUN_ID, listNo: L, ym: YM,
      deptRations: [{ obdeptid: 'AI000', ration: 100 }],
      emplRations: [{ emplid: 'E1', deptid_m: 'AI000', ration: 100 }],
      workingDays: WORKDAYS_20,
    });
    const yCount = await resultRepo.count({ where: { run_id: RUN_ID, list_no: L, is_cr: 'Y' } });
    const nCount = await resultRepo.count({ where: { run_id: RUN_ID, list_no: L, is_cr: 'N' } });
    expect(yCount).toBe(4);
    expect(nCount).toBe(6);
  });
});
