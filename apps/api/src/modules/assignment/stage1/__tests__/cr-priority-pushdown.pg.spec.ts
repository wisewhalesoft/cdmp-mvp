/**
 * F102 / AD-E07-30 — 月跑 CR 優先分派 SQL 下推（PG 真庫，強制 Postgres）
 *
 * 對應測試設計（F102-test.md）：
 *   - GATE-001/002/006：cr_enabled true/false 閘控 + is_cr 強制清 N + 全案件入比例池
 *   - STEP1-001/002/003/005：逾2年清空嚴格小於邊界 + pool 原始不改
 *   - STEP2-001/002/003/004/005：離職清空嚴格小於 + 在職不清 + 查無 ob_emphire 不清（BR-F102-08）
 *   - STEP3-001/002/003/004/005：ration>0 才指派 + deptid_m ASC 第一筆（I-DET-CR-01）+ worked example
 *   - DEDUCT-001/002/003/004：F101 Stage 3/4 案件池 WHERE is_cr<>'Y' + CR 案不被覆蓋
 *   - EQ-001~006：JS applyCrPriority ↔ PG runCrPrioritySql 六元組逐列等價（DoD 門檻）
 *   - IDEM-001/002：不同 run_id / 同 run 重跑結果相同
 *   - S2CLEAN-001：Stage 2 不寫 is_cr（is_cr = Stage 1 帶入原值）
 *   - S1SRC-001/002：Stage 1 INSERT 帶入 cr_id/cr_nm/is_cr/appl_date
 *   - ORDER-002：CR 步驟 3 寫入後不被 Stage 3 清除覆蓋
 *   - ASGD-CR-001/002：CR 案件（is_cr='Y'）assignday 全非 NULL 且納入工作日散佈（I-CR-ASSIGNDAY-01，
 *     live 202606 bug regression：CR 案 assignday 不可全空、須與同 emplid 非 CR 案同基準散佈）
 *
 * EQ 群組以同一 seed 跑「JS applyCrPriority」與「PG runCrPrioritySql」逐列 toEqual（確定性 → 精確比對）。
 *
 * 連線：env PG_BOSS_TEST_*，預設 docker-compose.test.yml 之 postgres-test（5433/cdmp_test）。
 * 不可達 → 整 describe skip-with-reason（不假綠）。
 *
 * ⚠️ CI 序列：F098/F099/F100/F101/F102 pg.spec 共用 cdmp_test DB（DROP/synchronize），一次跑一個檔案。
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
import { ObPoolDataList } from '@/database/entities/ob-pool-data-list.entity';
import { ObMonthlyRunResult } from '@/database/entities/ob-monthly-run-result.entity';
import { ObEmplSet } from '@/database/entities/ob-empl-set.entity';
import { ObEmphire } from '@/database/entities/ob-emphire.entity';
import { ObListDefinition } from '@/database/entities/ob-list-definition.entity';
import { ObLevelcardLevel } from '@/database/entities/ob-levelcard-level.entity';
import { ObTier } from '@/database/entities/ob-tier.entity';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { runCrPrioritySql } from '../cr-priority-sql';
import {
  applyCrPriority,
  computeCrSysDates,
  type CrCase,
  type CrEmplSet,
  type CrEmphire,
} from '../cr-priority';
import {
  clearStage3Fields,
  runStage3to4RationSql,
} from '../stage3to4-ration-sql';
import { runStage1SqlInsert } from '../stage1-sql-executor';
import { runStage2and3Sql } from '../stage2to4-sql-executor';
import {
  distributeStage3to4,
  type DeptRation,
  type EmplRation,
  type WorkingDay,
  type RationCase,
  type CrPreassignedCase,
} from '../stage3to4-ration';

/** 20 工作日，各 ratioPerMille=50（與 F101 ASGD 群組同 fixture）。 */
const WORKDAYS_20: WorkingDay[] = Array.from({ length: 20 }, (_, i) => ({
  casedt: `2026-07-${String(i + 1).padStart(2, '0')}`,
  ratioPerMille: 50,
}));

const PG = {
  host: process.env.PG_BOSS_TEST_HOST ?? '127.0.0.1',
  port: Number(process.env.PG_BOSS_TEST_PORT ?? 5433),
  user: process.env.PG_BOSS_TEST_USER ?? 'cdmp',
  password: process.env.PG_BOSS_TEST_PASSWORD ?? 'cdmp_secret',
  database: process.env.PG_BOSS_TEST_DB ?? 'cdmp_test',
};

const SKIP_REASON =
  '需 Postgres（docker compose -f docker-compose.test.yml up -d postgres-test）— 未實跑';

const RUN_ID = '00000000-0000-0000-0000-0000000000f1';
const RUN_ID_2 = '00000000-0000-0000-0000-0000000000f2';
const YM = '202607'; // sysDate=2026-07-01, twoYearsAgo=2024-07-01
const SYS_DATE = '2026-07-01';
const LIST = 'OB202607001';

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
let poolListRepo: Repository<ObPoolDataList>;
let resultRepo: Repository<ObMonthlyRunResult>;
let emplRepo: Repository<ObEmplSet>;
let emphireRepo: Repository<ObEmphire>;
let manager: EntityManager;

let applSeq = 0;

/** seed 一筆 result row（Stage 1 已帶入 cr_id/cr_nm/is_cr/appl_date/tier_level）。 */
async function seedResult(opts: {
  applNo?: string;
  runId?: string;
  crId?: string | null;
  crNm?: string | null;
  isCr?: string;
  applDate?: string | null;
  tier?: string | null;
  poolDeptId?: string;
}): Promise<{ orgno: string; applNo: string }> {
  applSeq += 1;
  const applNo = opts.applNo ?? String(applSeq).padStart(5, '0');
  const orgno = '01';
  const custoNo = `C${String(applSeq).padStart(6, '0')}`;
  await poolRepo.insert({
    orgno, appl_no: applNo, custo_no: custoNo, sta_code: '01',
    dept_id: opts.poolDeptId ?? 'XVF1', list_type: '01', settle_src: '01',
    month_cnt: 1, _cdmp_extracted_at: new Date(),
  } as never);
  await resultRepo.insert({
    run_id: opts.runId ?? RUN_ID, list_no: LIST, orgno, appl_no: applNo,
    custo_no: custoNo, settle_src: '01',
    cr_id: opts.crId ?? null, cr_nm: opts.crNm ?? null, is_cr: opts.isCr ?? 'N',
    appl_date: opts.applDate ? new Date(`${opts.applDate}T00:00:00Z`) : null,
    tier_level: opts.tier ?? null, result_status: 'PENDING',
    created_at: new Date(), updated_at: new Date(),
  } as never);
  return { orgno, applNo };
}

async function seedEmpl(opts: { emplid: string; deptidM: string; ration: number }): Promise<void> {
  await emplRepo.insert({
    list_no: LIST, deptid_m: opts.deptidM, emplid: opts.emplid,
    ration: String(opts.ration), created_at: new Date(), updated_at: new Date(),
  } as never);
}

async function seedEmphire(opts: { empId: string; resignDate?: string | null }): Promise<void> {
  await emphireRepo.insert({
    emp_id: opts.empId, emp_nm: `E-${opts.empId}`,
    resign_date: opts.resignDate ? (`${opts.resignDate}` as never) : null,
  } as never);
}

async function fetchResult(applNo: string, runId = RUN_ID): Promise<ObMonthlyRunResult> {
  return (await resultRepo.findOne({
    where: { run_id: runId, list_no: LIST, orgno: '01', appl_no: applNo },
  }))!;
}

function ensurePg(ctx: { skip: () => void }): void {
  if (!reachable || !ds) {
    // eslint-disable-next-line no-console
    console.warn(`[F102 PG Integration] SKIPPED — ${SKIP_REASON}`);
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
        ObPoolDataList,
        ObMonthlyRunResult,
        ObEmplSet,
        ObEmphire,
        ObListDefinition,
        ObLevelcardLevel,
        ObTier,
        AssignmentRun,
      ],
      synchronize: true,
    });
    await ds.initialize();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[F102 PG Integration] init failed → skip:', (e as Error)?.message);
    reachable = false;
    ds = null;
    return;
  }
  poolRepo = ds.getRepository(ObPoolData);
  poolListRepo = ds.getRepository(ObPoolDataList);
  resultRepo = ds.getRepository(ObMonthlyRunResult);
  emplRepo = ds.getRepository(ObEmplSet);
  emphireRepo = ds.getRepository(ObEmphire);
  manager = ds.manager;
}, 60000);

afterAll(async () => {
  if (ds) {
    await ds.query('DROP TABLE IF EXISTS ob_monthly_run_result CASCADE');
    await ds.query('DROP TABLE IF EXISTS ob_pool_data CASCADE');
    await ds.query('DROP TABLE IF EXISTS ob_pool_data_list CASCADE');
    await ds.query('DROP TABLE IF EXISTS ob_empl_set CASCADE');
    await ds.query('DROP TABLE IF EXISTS ob_emphire CASCADE');
    await ds.query('DROP TABLE IF EXISTS ob_list_definition CASCADE');
    await ds.query('DROP TABLE IF EXISTS ob_levelcard_level CASCADE');
    await ds.query('DROP TABLE IF EXISTS ob_tier CASCADE');
    await ds.query('DROP TABLE IF EXISTS assignment_run CASCADE');
    await ds.destroy();
  }
  restoreDbType();
});

beforeEach(async () => {
  if (!reachable || !ds) return;
  await ds.query('DELETE FROM ob_monthly_run_result');
  await ds.query('DELETE FROM ob_pool_data');
  await ds.query('DELETE FROM ob_pool_data_list');
  await ds.query('DELETE FROM ob_empl_set');
  await ds.query('DELETE FROM ob_emphire');
  await ds.query('DELETE FROM ob_list_definition');
  await ds.query('DELETE FROM assignment_run');
  await ds.query(
    `INSERT INTO assignment_run (run_id, project_workym, status, triggered_by, created_at)
     VALUES ($1, '202607', 'running', '00000000-0000-0000-0000-000000000001', now()),
            ($2, '202607', 'running', '00000000-0000-0000-0000-000000000001', now())`,
    [RUN_ID, RUN_ID_2],
  );
  applSeq = 0;
});

const ctx = (crEnabled: boolean, runId = RUN_ID) => ({
  runId, listNo: LIST, crEnabled, sysDate: SYS_DATE,
});

// ===========================================================================
// GATE — 閘控 cr_enabled
// ===========================================================================
describe('F102 GATE — 閘控 cr_enabled（PG 真庫）', () => {
  it('GATE-001：cr_enabled=true 執行步驟 1/2/3', async (c) => {
    ensurePg(c);
    await seedEmphire({ empId: 'E001', resignDate: null }); // 在職
    await seedEmpl({ emplid: 'E001', deptidM: 'XVE1', ration: 50 });
    const a = await seedResult({ crId: 'E001', crNm: 'N1', isCr: 'Y', applDate: '2025-01-01' }); // 有效 → 指派
    const b = await seedResult({ crId: 'E002', crNm: 'N2', isCr: 'Y', applDate: '2023-01-01' }); // 逾2年 → 清
    await runCrPrioritySql(manager, ctx(true));
    const ra = await fetchResult(a.applNo);
    const rb = await fetchResult(b.applNo);
    expect(ra.is_cr).toBe('Y');
    expect(ra.emplid).toBe('E001');
    expect(ra.dept_id).toBe('XVE1');
    expect(rb.is_cr).toBe('N');
    expect(rb.cr_id).toBeNull();
  });

  it('GATE-002：cr_enabled=false 跳過步驟 1–3 且 is_cr 強制清 N', async (c) => {
    ensurePg(c);
    const a = await seedResult({ crId: 'E001', crNm: 'N1', isCr: 'Y', applDate: '2025-01-01' });
    const b = await seedResult({ crId: null, crNm: null, isCr: 'N', applDate: '2025-01-01' });
    await runCrPrioritySql(manager, ctx(false));
    const ra = await fetchResult(a.applNo);
    const rb = await fetchResult(b.applNo);
    expect(ra.is_cr).toBe('N'); // 強制清 N
    expect(ra.cr_id).toBe('E001'); // 步驟 1/2/3 不執行 → cr_id 不動
    expect(ra.emplid).toBeNull();
    expect(rb.is_cr).toBe('N');
  });

  it('GATE-006：cr_enabled=false 名單全案件入 F101 比例池（無扣量）', async (c) => {
    ensurePg(c);
    for (let i = 0; i < 10; i++) {
      await seedResult({ tier: 'T1', isCr: i < 3 ? 'Y' : 'N', poolDeptId: 'XVF1' });
    }
    await runCrPrioritySql(manager, ctx(false));
    await runStage3to4RationSql(manager, {
      runId: RUN_ID, listNo: LIST, ym: YM,
      deptRations: [{ obdeptid: 'AI000', ration: 100 }] as DeptRation[],
      emplRations: [] as EmplRation[], workingDays: [],
    });
    const rows = await resultRepo.find({ where: { run_id: RUN_ID, list_no: LIST } });
    expect(rows.length).toBe(10);
    expect(rows.every((r) => r.dept_id === 'AI000')).toBe(true); // 全 10 件入池分派
  });
});

// ===========================================================================
// STEP1 — 逾2年清空（嚴格小於邊界）
// ===========================================================================
describe('F102 STEP1 — 逾2年清空（PG 真庫）', () => {
  it('STEP1-001/002/005：< twoYearsAgo 清空；= 不清', async (c) => {
    ensurePg(c);
    const a = await seedResult({ crId: 'E010', crNm: 'N', isCr: 'Y', applDate: '2024-06-30' }); // < 2024-07-01
    const b = await seedResult({ crId: 'E010', crNm: 'N', isCr: 'Y', applDate: '2024-07-01' }); // = 不清
    await runCrPrioritySql(manager, ctx(true));
    const ra = await fetchResult(a.applNo);
    const rb = await fetchResult(b.applNo);
    expect(ra.cr_id).toBeNull();
    expect(ra.is_cr).toBe('N');
    expect(rb.cr_id).toBe('E010'); // 剛好等於 → 不清
    expect(rb.is_cr).toBe('Y');
  });

  it('STEP1-003：ob_pool_data_list 原始資料不被修改', async (c) => {
    ensurePg(c);
    const a = await seedResult({ crId: 'E010', crNm: 'N', isCr: 'Y', applDate: '2024-06-30' });
    // pool list 原始資料（CR 步驟限定 result 工作集，不改本表）。
    await poolListRepo.insert({
      list_no: LIST, orgno: '01', appl_no: a.applNo, custo_no: 'CX', settle_src: '01',
      cr_id: 'E010', cr_nm: 'N', is_cr: 'Y', appl_date: new Date('2024-06-30T00:00:00Z'),
    } as never);
    await runCrPrioritySql(manager, ctx(true));
    const src = await poolListRepo.findOne({ where: { list_no: LIST, orgno: '01', appl_no: a.applNo } });
    expect(src!.cr_id).toBe('E010'); // pool list 維持原值
    expect(src!.is_cr).toBe('Y');
  });
});

// ===========================================================================
// STEP2 — 離職清空 + 查無不清
// ===========================================================================
describe('F102 STEP2 — 離職清空（PG 真庫）', () => {
  it('STEP2-001/002/003：離職清；在職不清；resign=sysDate 不清', async (c) => {
    ensurePg(c);
    await seedEmphire({ empId: 'E001', resignDate: '2026-06-15' }); // 離職 < 2026-07-01
    await seedEmphire({ empId: 'E002', resignDate: null }); // 在職
    await seedEmphire({ empId: 'E003', resignDate: '2026-07-01' }); // = sysDate
    const cCase = await seedResult({ crId: 'E001', crNm: 'N', isCr: 'Y', applDate: '2025-01-01' });
    const dCase = await seedResult({ crId: 'E002', crNm: 'N', isCr: 'Y', applDate: '2025-01-01' });
    const eCase = await seedResult({ crId: 'E003', crNm: 'N', isCr: 'Y', applDate: '2025-01-01' });
    await runCrPrioritySql(manager, ctx(true));
    expect((await fetchResult(cCase.applNo)).cr_id).toBeNull(); // 離職清
    expect((await fetchResult(cCase.applNo)).is_cr).toBe('N');
    expect((await fetchResult(dCase.applNo)).cr_id).toBe('E002'); // 在職不清
    expect((await fetchResult(eCase.applNo)).cr_id).toBe('E003'); // = sysDate 不清
  });

  it('STEP2-004：cr_id 查無 ob_emphire 不清空（BR-F102-08）', async (c) => {
    ensurePg(c);
    // ob_emphire 無 E999。
    const h = await seedResult({ crId: 'E999', crNm: 'N', isCr: 'Y', applDate: '2025-01-01' });
    await runCrPrioritySql(manager, ctx(true));
    const rh = await fetchResult(h.applNo);
    expect(rh.cr_id).toBe('E999'); // INNER JOIN 不命中 → 不清
    expect(rh.is_cr).toBe('Y');
  });
});

// ===========================================================================
// STEP3 — CR 優先指派 + I-DET-CR-01
// ===========================================================================
describe('F102 STEP3 — CR 優先指派（PG 真庫）', () => {
  it('STEP3-001/002：ration>0 才指派；ration=0/無記錄不指派', async (c) => {
    ensurePg(c);
    await seedEmphire({ empId: 'E003', resignDate: null });
    await seedEmpl({ emplid: 'E003', deptidM: 'XVE1', ration: 30 });
    // E004 無 ration 記錄。
    const f = await seedResult({ crId: 'E003', crNm: 'N', isCr: 'Y', applDate: '2025-09-01' });
    const g = await seedResult({ crId: 'E004', crNm: 'N', isCr: 'Y', applDate: '2025-09-01' });
    await runCrPrioritySql(manager, ctx(true));
    const rf = await fetchResult(f.applNo);
    const rg = await fetchResult(g.applNo);
    expect(rf.emplid).toBe('E003');
    expect(rf.dept_id).toBe('XVE1');
    expect(rf.emplid_deptid).toBe('XVE1');
    expect(rf.is_cr).toBe('Y');
    expect(rg.emplid).toBeNull(); // 無 ration → 不指派
    expect(rg.is_cr).toBe('Y'); // 原值維持
  });

  it('STEP3-003：多筆 deptid_m 取 deptid_m ASC 第一筆（I-DET-CR-01）', async (c) => {
    ensurePg(c);
    await seedEmpl({ emplid: 'E005', deptidM: 'XVE2', ration: 20 });
    await seedEmpl({ emplid: 'E005', deptidM: 'XVE1', ration: 30 });
    const i = await seedResult({ crId: 'E005', crNm: 'N', isCr: 'Y', applDate: '2025-09-01' });
    await runCrPrioritySql(manager, ctx(true));
    const ri = await fetchResult(i.applNo);
    expect(ri.dept_id).toBe('XVE1'); // ASC：XVE1 < XVE2
    expect(ri.emplid_deptid).toBe('XVE1');
    expect(ri.is_cr).toBe('Y');
  });

  it('STEP3-004：查無 ob_emphire（BR-F102-08）案件仍可步驟 3 指派', async (c) => {
    ensurePg(c);
    await seedEmpl({ emplid: 'E999', deptidM: 'XVE1', ration: 25 });
    const h = await seedResult({ crId: 'E999', crNm: 'N', isCr: 'Y', applDate: '2025-09-01' });
    await runCrPrioritySql(manager, ctx(true));
    const rh = await fetchResult(h.applNo);
    expect(rh.emplid).toBe('E999');
    expect(rh.dept_id).toBe('XVE1');
    expect(rh.is_cr).toBe('Y');
  });
});

// ===========================================================================
// DEDUCT — 步驟 4 扣量
// ===========================================================================
describe('F102 DEDUCT — 扣量（PG 真庫）', () => {
  it('DEDUCT-001/002：Stage 3 案件池排除 is_cr=Y；CR 案 dept_id 不被覆蓋', async (c) => {
    ensurePg(c);
    // 5 件 CR 預指派（is_cr=Y，dept_id=XVE9 假裝 CR 寫入）；95 件待分派。
    const crApplNos: string[] = [];
    for (let i = 0; i < 5; i++) {
      const r = await seedResult({ tier: 'T1', isCr: 'Y', poolDeptId: 'XVF1' });
      crApplNos.push(r.applNo);
    }
    // 手動設 CR 案 dept_id/emplid（模擬 CR 步驟 3 已寫入）。
    await resultRepo.update(
      { run_id: RUN_ID, list_no: LIST, is_cr: 'Y' },
      { dept_id: 'XVE9', emplid: 'CRX', emplid_deptid: 'XVE9' },
    );
    for (let i = 0; i < 95; i++) await seedResult({ tier: 'T1', isCr: 'N', poolDeptId: 'XVF1' });
    await runStage3to4RationSql(manager, {
      runId: RUN_ID, listNo: LIST, ym: YM,
      deptRations: [{ obdeptid: 'AI000', ration: 100 }] as DeptRation[],
      emplRations: [] as EmplRation[], workingDays: [],
    });
    // Stage 3 只分派 95 件（is_cr<>'Y'）到 AI000。
    const ai = await resultRepo.count({ where: { run_id: RUN_ID, list_no: LIST, dept_id: 'AI000' } });
    expect(ai).toBe(95);
    // CR 5 件 dept_id 不被覆蓋（仍 XVE9）。
    const crUnchanged = await resultRepo.count({ where: { run_id: RUN_ID, list_no: LIST, dept_id: 'XVE9' } });
    expect(crUnchanged).toBe(5);
  });
});

// ===========================================================================
// EQ — JS↔SQL 逐列六元組等價（DoD）
// ===========================================================================
describe('F102 EQ — JS↔SQL 逐列等價（DoD）', () => {
  /** 跑 PG 後取六元組（依 orgno, appl_no 排序）。 */
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

  it('EQ-006：完整 worked example（8 案件）六元組逐列等價', async (c) => {
    ensurePg(c);
    await seedEmphire({ empId: 'E003', resignDate: null });
    await seedEmphire({ empId: 'E005', resignDate: null });
    await seedEmphire({ empId: 'E006', resignDate: '2026-06-20' }); // 離職 < 2026-07-01
    await seedEmphire({ empId: 'E007', resignDate: null });
    // E999 查無。
    await seedEmpl({ emplid: 'E003', deptidM: 'XVE1', ration: 30 });
    await seedEmpl({ emplid: 'E005', deptidM: 'XVE2', ration: 20 });
    await seedEmpl({ emplid: 'E006', deptidM: 'XVE2', ration: 20 });
    await seedEmpl({ emplid: 'E007', deptidM: 'XVE2', ration: 0 }); // ration=0
    await seedEmpl({ emplid: 'E999', deptidM: 'XVE1', ration: 25 });
    const spec: Array<[string, string, string]> = [
      // [applNo, cr_id, appl_date]
      ['c1', 'E003', '2025-03-01'],
      ['c2', 'E003', '2025-05-10'],
      ['c3', 'E005', '2023-12-31'], // 逾2年（< 2024-07-01）清
      ['c4', 'E006', '2025-08-01'], // 離職清
      ['c5', 'E007', '2025-09-01'], // ration=0 不指派
      ['c6', 'E999', '2025-10-01'], // 查無不清 → 指派
      ['c7', 'E003', '2025-11-01'],
      ['c8', 'E003', '2024-07-01'], // 剛好 = twoYearsAgo 不清 → 指派
    ];
    const cases: CrCase[] = [];
    for (const [applNo, crId, applDate] of spec) {
      await seedResult({ applNo, crId, crNm: 'n', isCr: 'Y', applDate });
      cases.push({ orgno: '01', appl_no: applNo, cr_id: crId, cr_nm: 'n', is_cr: 'Y', appl_date: applDate });
    }
    const empl: CrEmplSet[] = [
      { emplid: 'E003', deptid_m: 'XVE1', ration: 30 },
      { emplid: 'E005', deptid_m: 'XVE2', ration: 20 },
      { emplid: 'E006', deptid_m: 'XVE2', ration: 20 },
      { emplid: 'E007', deptid_m: 'XVE2', ration: 0 },
      { emplid: 'E999', deptid_m: 'XVE1', ration: 25 },
    ];
    const emp: CrEmphire[] = [
      { emp_id: 'E003', resign_date: null },
      { emp_id: 'E005', resign_date: null },
      { emp_id: 'E006', resign_date: '2026-06-20' },
      { emp_id: 'E007', resign_date: null },
    ];
    await runCrPrioritySql(manager, ctx(true));
    expect(await sqlSix()).toEqual(jsSix(cases, empl, emp));
  });

  it('EQ-005：cr_enabled=false 強制清 N 等價', async (c) => {
    ensurePg(c);
    const cases: CrCase[] = [];
    for (let i = 0; i < 5; i++) {
      const isCr = i < 3 ? 'Y' : 'N';
      const r = await seedResult({ crId: i < 3 ? `E${i}` : null, crNm: i < 3 ? 'n' : null, isCr, applDate: '2025-01-01' });
      cases.push({ orgno: '01', appl_no: r.applNo, cr_id: i < 3 ? `E${i}` : null, cr_nm: i < 3 ? 'n' : null, is_cr: isCr, appl_date: '2025-01-01' });
    }
    await runCrPrioritySql(manager, ctx(false));
    // JS 等價：cr_enabled=false → 全 is_cr='N'（cr_id/cr_nm 不動，與 SQL 強制清 N 一致）。
    const jsExpected = cases
      .slice()
      .sort((a, b) => (a.appl_no < b.appl_no ? -1 : a.appl_no > b.appl_no ? 1 : 0))
      .map((c2) => ({
        orgno: c2.orgno, appl_no: c2.appl_no, cr_id: c2.cr_id, cr_nm: c2.cr_nm,
        is_cr: 'N', emplid: null, dept_id: null, emplid_deptid: null,
      }));
    expect(await sqlSix()).toEqual(jsExpected);
  });
});

// ===========================================================================
// IDEM — 重跑安全
// ===========================================================================
describe('F102 IDEM — 重跑冪等（PG 真庫）', () => {
  it('IDEM-001：不同 run_id 兩次六元組相同', async (c) => {
    ensurePg(c);
    await seedEmphire({ empId: 'E003', resignDate: null });
    await seedEmpl({ emplid: 'E003', deptidM: 'XVE1', ration: 30 });
    const spec: Array<[string, string, string, string]> = [
      ['00001', 'E003', '2025-03-01', 'Y'],
      ['00002', 'E099', '2023-01-01', 'Y'], // 逾2年清
      ['00003', '', '2025-01-01', 'N'],
    ];
    for (const [applNo, crId, applDate, isCr] of spec) {
      for (const rid of [RUN_ID, RUN_ID_2]) {
        // 兩 run 共用 pool（PK orgno+appl_no）→ 只 insert 一次 pool。
        if (rid === RUN_ID) {
          await poolRepo.insert({
            orgno: '01', appl_no: applNo, custo_no: `C${applNo}`, sta_code: '01',
            dept_id: 'XVF1', list_type: '01', settle_src: '01', month_cnt: 1, _cdmp_extracted_at: new Date(),
          } as never);
        }
        await resultRepo.insert({
          run_id: rid, list_no: LIST, orgno: '01', appl_no: applNo, custo_no: `C${applNo}`,
          settle_src: '01', cr_id: crId || null, cr_nm: crId ? 'n' : null, is_cr: isCr,
          appl_date: new Date(`${applDate}T00:00:00Z`), tier_level: 'T1',
          result_status: 'PENDING', created_at: new Date(), updated_at: new Date(),
        } as never);
      }
    }
    await runCrPrioritySql(manager, ctx(true, RUN_ID));
    await runCrPrioritySql(manager, ctx(true, RUN_ID_2));
    const six = async (rid: string) =>
      (await resultRepo.find({ where: { run_id: rid, list_no: LIST }, order: { appl_no: 'ASC' } }))
        .map((r) => `${r.appl_no}:${r.cr_id}:${r.is_cr}:${r.emplid}:${r.dept_id}`);
    expect(await six(RUN_ID)).toEqual(await six(RUN_ID_2));
  });

  it('IDEM-002：同 run 重複執行冪等', async (c) => {
    ensurePg(c);
    await seedEmphire({ empId: 'E003', resignDate: null });
    await seedEmpl({ emplid: 'E003', deptidM: 'XVE1', ration: 30 });
    await seedResult({ applNo: 'A1', crId: 'E003', crNm: 'n', isCr: 'Y', applDate: '2025-03-01', tier: 'T1' });
    await runCrPrioritySql(manager, ctx(true));
    const first = await fetchResult('A1');
    await runCrPrioritySql(manager, ctx(true));
    const second = await fetchResult('A1');
    expect(second.is_cr).toBe(first.is_cr);
    expect(second.emplid).toBe(first.emplid);
    expect(second.dept_id).toBe(first.dept_id);
  });
});

// ===========================================================================
// S2CLEAN — Stage 2 不寫 is_cr
// ===========================================================================
describe('F102 S2CLEAN — Stage 2 不寫 is_cr（PG 真庫）', () => {
  it('S2CLEAN-001：runStage2and3Sql 後 is_cr = Stage 1 帶入原值', async (c) => {
    ensurePg(c);
    // 3 件 is_cr='Y'、2 件 'N'（Stage 1 帶入）；Stage 2 計分（無 active version → score NULL）。
    for (let i = 0; i < 3; i++) await seedResult({ isCr: 'Y' });
    for (let i = 0; i < 2; i++) await seedResult({ isCr: 'N' });
    // pool 已由 seedResult 寫入；runStage2and3Sql 需 ob_pool_data o join。
    await runStage2and3Sql(manager, {
      runId: RUN_ID, listNo: LIST, cardType: 'T1', cardVersion: null,
      activeColumns: [], scoreRows: [], ym: YM,
    });
    const yCount = await resultRepo.count({ where: { run_id: RUN_ID, list_no: LIST, is_cr: 'Y' } });
    const nCount = await resultRepo.count({ where: { run_id: RUN_ID, list_no: LIST, is_cr: 'N' } });
    expect(yCount).toBe(3); // Stage 2 未改 is_cr
    expect(nCount).toBe(2);
  });
});

// ===========================================================================
// S1SRC — Stage 1 帶入 cr_id/cr_nm/is_cr/appl_date
// ===========================================================================
describe('F102 S1SRC — Stage 1 帶入 CR 三欄（PG 真庫）', () => {
  async function seedListDef(): Promise<void> {
    const now = new Date();
    await ds!.getRepository(ObListDefinition).insert({
      list_no: LIST, list_nm: '名單', prod_kind: 'A', list_type: '01',
      list_period_start: '001', list_period_end: '030', list_interval: '001',
      project_workym: YM, settle_src: '01', card_type: 'T1', case_status: '01',
      status: 'active', stage: 'ready', cr_enabled: true,
      condition_payload: { logic: 'AND', conditions: [{ columnName: 'prod_kind', fieldType: 'categorical', values: ['A'] }] },
      created_by_prog: 'T', created_by: 't', created_at: now,
      updated_by_prog: 'T', updated_by: 't', updated_at: now,
    } as never);
  }

  it('S1SRC-001/002：Stage 1 INSERT 後 result cr_id/cr_nm/is_cr/appl_date 帶入；pool cr_id=NULL → result NULL', async (c) => {
    ensurePg(c);
    await seedListDef();
    // ob_pool_data：2 件（A1 對應 pool list 有 cr_id；A2 pool list 無 cr_id）。
    for (const applNo of ['A1', 'A2']) {
      await poolRepo.insert({
        orgno: '01', appl_no: applNo, custo_no: `C${applNo}`, sta_code: '01',
        dept_id: 'XVF1', list_type: '01', settle_src: '01', prod_kind: 'A',
        month_cnt: 1, appl_date: new Date('2025-01-01T00:00:00Z'), _cdmp_extracted_at: new Date(),
      } as never);
    }
    // ob_pool_data_list：A1 有 cr_id；A2 cr_id NULL。
    await poolListRepo.insert({
      list_no: LIST, orgno: '01', appl_no: 'A1', custo_no: 'CA1', settle_src: '01',
      cr_id: 'E001', cr_nm: '業代一', is_cr: 'Y', appl_date: new Date('2025-02-02T00:00:00Z'),
    } as never);
    await poolListRepo.insert({
      list_no: LIST, orgno: '01', appl_no: 'A2', custo_no: 'CA2', settle_src: '01',
      cr_id: null, cr_nm: null, is_cr: 'N', appl_date: new Date('2025-03-03T00:00:00Z'),
    } as never);

    const list = await ds!.getRepository(ObListDefinition).findOneByOrFail({ list_no: LIST });
    const workdt = new Date('2026-07-01T00:00:00Z');
    await runStage1SqlInsert(manager, list, workdt, poolListRepo, { runId: RUN_ID, listNo: LIST });

    const a1 = await fetchResult('A1');
    const a2 = await fetchResult('A2');
    expect(a1.cr_id).toBe('E001');
    expect(a1.cr_nm).toBe('業代一');
    expect(a1.is_cr).toBe('Y');
    expect(a1.appl_date).not.toBeNull();
    // A2：pool list cr_id NULL → result cr_id NULL；is_cr COALESCE 'N'。
    expect(a2.cr_id).toBeNull();
    expect(a2.is_cr).toBe('N');
  });
});

// ===========================================================================
// ORDER-002 — CR 步驟 3 寫入後不被 Stage 3 清除覆蓋（行為）
// ===========================================================================
describe('F102 ORDER-002 — 執行順序行為（PG 真庫）', () => {
  it('clearStage3Fields → runCrPrioritySql → runStage3to4RationSql：CR 案 emplid/dept_id 不被覆蓋', async (c) => {
    ensurePg(c);
    await seedEmphire({ empId: 'E003', resignDate: null });
    await seedEmpl({ emplid: 'E003', deptidM: 'XVE1', ration: 30 });
    // 3 件 CR（is_cr=Y、cr_id=E003）+ 7 件普通。
    const crApplNos: string[] = [];
    for (let i = 0; i < 3; i++) {
      const r = await seedResult({ crId: 'E003', crNm: 'n', isCr: 'Y', applDate: '2025-03-01', tier: 'T1' });
      crApplNos.push(r.applNo);
    }
    for (let i = 0; i < 7; i++) await seedResult({ isCr: 'N', tier: 'T1' });

    // I-CR-ORDER-01 執行順序。
    await clearStage3Fields(manager, { runId: RUN_ID, listNo: LIST });
    const { sysDate } = computeCrSysDates(YM);
    await runCrPrioritySql(manager, { runId: RUN_ID, listNo: LIST, crEnabled: true, sysDate });
    await runStage3to4RationSql(manager, {
      runId: RUN_ID, listNo: LIST, ym: YM,
      deptRations: [{ obdeptid: 'AI000', ration: 100 }] as DeptRation[],
      emplRations: [{ emplid: 'EZ', deptid_m: 'AI000', ration: 100 }] as EmplRation[],
      workingDays: [],
    });

    // CR 3 件 emplid=E003、dept_id=XVE1 不被 Stage 3/4 覆蓋。
    for (const applNo of crApplNos) {
      const r = await fetchResult(applNo);
      expect(r.is_cr).toBe('Y');
      expect(r.emplid).toBe('E003');
      expect(r.dept_id).toBe('XVE1');
    }
    // 7 件普通走 F101 比例分派 → dept_id=AI000、emplid=EZ。
    const aiCount = await resultRepo.count({ where: { run_id: RUN_ID, list_no: LIST, dept_id: 'AI000' } });
    expect(aiCount).toBe(7);
  });
});

// ===========================================================================
// ASGD-CR — CR 案件 assignday 散佈（I-CR-ASSIGNDAY-01，live 202606 bug regression）
// ===========================================================================
describe('F102 ASGD-CR — CR 案件 assignday 非空且散佈（PG 真庫）', () => {
  it('ASGD-CR-001：M 筆 is_cr=Y 案件 assignday 全非 NULL 且散佈全 20 工作日', async (c) => {
    ensurePg(c);
    // CR 業代 E_CR：deptid_m='XVE1'，ration>0；同名單另有 D001 課承接非 CR 案件。
    await seedEmphire({ empId: 'E_CR', resignDate: null });
    await seedEmpl({ emplid: 'E_CR', deptidM: 'XVE1', ration: 100 });
    // 21 件 CR（is_cr=Y、cr_id=E_CR）→ 步驟 3 指派 emplid=E_CR、dept_id=XVE1。
    const crApplNos: string[] = [];
    for (let i = 0; i < 21; i++) {
      const r = await seedResult({ crId: 'E_CR', crNm: 'n', isCr: 'Y', applDate: '2025-03-01', tier: 'T1', poolDeptId: 'XVF1' });
      crApplNos.push(r.applNo);
    }
    // I-CR-ORDER-01 序：清除 → CR 前置 → F101 ration（含 ASSIGNDAY）。
    await clearStage3Fields(manager, { runId: RUN_ID, listNo: LIST });
    const { sysDate } = computeCrSysDates(YM);
    await runCrPrioritySql(manager, { runId: RUN_ID, listNo: LIST, crEnabled: true, sysDate });
    await runStage3to4RationSql(manager, {
      runId: RUN_ID, listNo: LIST, ym: YM,
      // ration 池為空（全 CR 扣量）；CR 案件仍須由 ASSIGNDAY 散佈（不過濾 is_cr）。
      deptRations: [{ obdeptid: 'AI000', ration: 100 }] as DeptRation[],
      emplRations: [{ emplid: 'EZ', deptid_m: 'AI000', ration: 100 }] as EmplRation[],
      workingDays: WORKDAYS_20,
    });

    // 所有 21 筆 CR 案件 assignday 非 NULL（bug 修正核心：不可全空）。
    const crRows = await resultRepo.find({ where: { run_id: RUN_ID, list_no: LIST, is_cr: 'Y' } });
    expect(crRows.length).toBe(21);
    expect(crRows.every((r) => r.assignday !== null)).toBe(true);
    // 散佈：E_CR 21 件 / 20 工作日（各 ratioPerMille=50 → FLOOR(21×50/1000)=1，末日吸收 2）。
    const byDay: Record<string, number> = {};
    for (const r of crRows) byDay[r.assignday!] = (byDay[r.assignday!] ?? 0) + 1;
    expect(byDay['2026-07-20']).toBe(2); // 末日吸收
    expect(Object.entries(byDay).filter(([d]) => d !== '2026-07-20').every(([, n]) => n === 1)).toBe(true);
    expect(Object.keys(byDay).length).toBe(20); // 散佈全 20 工作日
  });

  it('ASGD-CR-002：CR + 非CR 同 emplid → assignday 同基準散佈（CR 不扣量於指派日）', async (c) => {
    ensurePg(c);
    // E_CR 同時承接 CR 案件（XVE1）與 ration 分派之非 CR 案件（dept_id 須 = XVE1 才同 emplid）。
    // 設計：ration 課 = XVE1（E_CR ration 100）；非 CR 案件分派至 XVE1/E_CR；CR 案件亦 emplid=E_CR。
    await seedEmphire({ empId: 'E_CR', resignDate: null });
    await seedEmpl({ emplid: 'E_CR', deptidM: 'XVE1', ration: 100 });
    // 10 件 CR（emplid 將為 E_CR）。
    for (let i = 0; i < 10; i++) {
      await seedResult({ crId: 'E_CR', crNm: 'n', isCr: 'Y', applDate: '2025-03-01', tier: 'T1', poolDeptId: 'XVF1' });
    }
    // 10 件非 CR（pool_dept_id=XVF1，ration 分派至 XVE1/E_CR）。
    for (let i = 0; i < 10; i++) {
      await seedResult({ isCr: 'N', tier: 'T1', poolDeptId: 'XVF1' });
    }
    await clearStage3Fields(manager, { runId: RUN_ID, listNo: LIST });
    const { sysDate } = computeCrSysDates(YM);
    await runCrPrioritySql(manager, { runId: RUN_ID, listNo: LIST, crEnabled: true, sysDate });
    await runStage3to4RationSql(manager, {
      runId: RUN_ID, listNo: LIST, ym: YM,
      deptRations: [{ obdeptid: 'XVE1', ration: 100 }] as DeptRation[],
      emplRations: [{ emplid: 'E_CR', deptid_m: 'XVE1', ration: 100 }] as EmplRation[],
      workingDays: WORKDAYS_20,
    });

    const allRows = await resultRepo.find({ where: { run_id: RUN_ID, list_no: LIST } });
    // 全 20 件 emplid=E_CR（10 CR 預指派 + 10 ration 分派）。
    expect(allRows.filter((r) => r.emplid === 'E_CR').length).toBe(20);
    // 全 20 件 assignday 非 NULL（CR 與非 CR 同基準散佈）。
    expect(allRows.every((r) => r.assignday !== null)).toBe(true);
    // E_CR 20 件 / 20 工作日（FLOOR(20×50/1000)=1，整除 → 每日 1 件）。
    const byDay: Record<string, number> = {};
    for (const r of allRows) byDay[r.assignday!] = (byDay[r.assignday!] ?? 0) + 1;
    expect(Object.keys(byDay).length).toBe(20);
    expect(Object.values(byDay).every((n) => n === 1)).toBe(true);
  });

  it('ASGD-CR-EQ：JS distributeStage3to4(crPreassigned) ↔ PG 逐案件 assignday 等價（DoD）', async (c) => {
    ensurePg(c);
    // 10 非 CR + 10 CR（同 emplid=E_CR）；JS oracle 與 PG 下推同 seed → 逐案件 assignday 比對。
    await seedEmphire({ empId: 'E_CR', resignDate: null });
    await seedEmpl({ emplid: 'E_CR', deptidM: 'XVE1', ration: 100 });
    const nonCrCases: RationCase[] = [];
    for (let i = 0; i < 10; i++) {
      const r = await seedResult({ isCr: 'N', tier: 'T1', poolDeptId: 'XVF1' });
      nonCrCases.push({ orgno: r.orgno, appl_no: r.applNo, tier_level: 'T1', pool_dept_id: 'XVF1' });
    }
    const crPre: CrPreassignedCase[] = [];
    for (let i = 0; i < 10; i++) {
      const r = await seedResult({ crId: 'E_CR', crNm: 'n', isCr: 'Y', applDate: '2025-03-01', tier: 'T1', poolDeptId: 'XVF1' });
      crPre.push({ orgno: r.orgno, appl_no: r.applNo, tier_level: 'T1', emplid: 'E_CR', dept_id: 'XVE1', emplid_deptid: 'XVE1' });
    }
    // PG 下推。
    await clearStage3Fields(manager, { runId: RUN_ID, listNo: LIST });
    const { sysDate } = computeCrSysDates(YM);
    await runCrPrioritySql(manager, { runId: RUN_ID, listNo: LIST, crEnabled: true, sysDate });
    await runStage3to4RationSql(manager, {
      runId: RUN_ID, listNo: LIST, ym: YM,
      deptRations: [{ obdeptid: 'XVE1', ration: 100 }], emplRations: [{ emplid: 'E_CR', deptid_m: 'XVE1', ration: 100 }],
      workingDays: WORKDAYS_20,
    });
    // JS oracle（同 seed）。
    const js = distributeStage3to4(LIST, YM, nonCrCases, [{ obdeptid: 'XVE1', ration: 100 }], [{ emplid: 'E_CR', deptid_m: 'XVE1', ration: 100 }], WORKDAYS_20, crPre);
    const jsByKey = new Map(js.assignments.map((a) => [`${a.orgno} ${a.appl_no}`, a.assignday]));
    // 逐案件 assignday 等價。
    const rows = await resultRepo.find({ where: { run_id: RUN_ID, list_no: LIST }, order: { appl_no: 'ASC' } });
    for (const r of rows) {
      expect(r.assignday).toBe(jsByKey.get(`${r.orgno} ${r.appl_no}`) ?? null);
    }
  });
});
