/**
 * F100 / AD-E07-28 P3 — runPipeline 端到端 Stage 1~4 SQL 下推（PG 真庫）
 *
 * 對應測試設計（F100-test.md）：
 *   - EQ-001：純 ob_pool_data 卡（區間+類別，無 customer_core）→ SQL == 手算 == v1 JS（三方相等，(b) 下推等價）
 *   - EQ-003：含 customer_core 卡 + 部分案件無 match（混合 (a)/(b)）
 *   - EQ-005：score / level / tier NULL 邊界（無 active version）
 *   - EQ-006/007：CR 開 / 關
 *   - IDEM-001：同 run_id 重跑 → 列集合一致（冪等清理）
 *   - RUNEST 連動：下推路徑不破壞 estimate（Stage 1 列數一致）
 *
 * 透過 runPipeline（ASSIGNMENT_PIPELINE_V2=true + DB_TYPE=postgres）走 P3 SQL 下推路徑；
 * 另對 (b) 案件以 SQLite v1 JS（executeV2）取值斷言三方相等（守下推未引入 regression）。
 *
 * 連線：env PG_BOSS_TEST_*，預設 postgres-test（5433/cdmp_test）。不可達 → skip-with-reason。
 */

import { restoreDbType } from '../../stage1/__tests__/pg-env-preload';

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from 'vitest';
import * as net from 'net';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { AssignmentRunPipelineService } from '../assignment-run-pipeline.service';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { AssignmentRunSnapshot } from '@/database/entities/assignment-run-snapshot.entity';
import { ObListDefinition } from '@/database/entities/ob-list-definition.entity';
import { ObPoolData } from '@/database/entities/ob-pool-data.entity';
import { ObPoolDataList } from '@/database/entities/ob-pool-data-list.entity';
import { ObMonthlyRunResult } from '@/database/entities/ob-monthly-run-result.entity';
import { ObDeptPct } from '@/database/entities/ob-dept-pct.entity';
import { ObEmplSet } from '@/database/entities/ob-empl-set.entity';
import { ObEmphire } from '@/database/entities/ob-emphire.entity';
import { ObCardType } from '@/database/entities/ob-card-type.entity';
import { ObLevelcardVersion } from '@/database/entities/ob-levelcard-version.entity';
import { ObLevelcardColumn } from '@/database/entities/ob-levelcard-column.entity';
import { ObLevelcardScore } from '@/database/entities/ob-levelcard-score.entity';
import { ObLevelcardLevel } from '@/database/entities/ob-levelcard-level.entity';
import { ObTier } from '@/database/entities/ob-tier.entity';
import { ObCalendar } from '@/database/entities/ob-calendar.entity';
import { MatchType } from '@/modules/assignment-scoring/dto/match-type.enum';

const PG = {
  host: process.env.PG_BOSS_TEST_HOST ?? '127.0.0.1',
  port: Number(process.env.PG_BOSS_TEST_PORT ?? 5433),
  user: process.env.PG_BOSS_TEST_USER ?? 'cdmp',
  password: process.env.PG_BOSS_TEST_PASSWORD ?? 'cdmp_secret',
  database: process.env.PG_BOSS_TEST_DB ?? 'cdmp_test',
};
const SKIP_REASON =
  '需 Postgres（docker compose -f docker-compose.test.yml up -d postgres-test）— 未實跑';
const YM = '202606';

const ENTITIES = [
  AssignmentRun, AssignmentRunSnapshot, ObListDefinition, ObPoolData,
  ObPoolDataList, ObMonthlyRunResult, ObDeptPct, ObEmplSet, ObEmphire, ObCardType,
  ObLevelcardVersion, ObLevelcardColumn, ObLevelcardScore, ObLevelcardLevel, ObTier,
  ObCalendar,
];

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

let reachable = false;
let app: TestingModule | null = null;
let ds: DataSource;
let service: AssignmentRunPipelineService;
let R: {
  run: Repository<AssignmentRun>;
  list: Repository<ObListDefinition>;
  pool: Repository<ObPoolData>;
  result: Repository<ObMonthlyRunResult>;
  deptPct: Repository<ObDeptPct>;
  empl: Repository<ObEmplSet>;
  emphire: Repository<ObEmphire>;
  poolList: Repository<ObPoolDataList>;
  cardType: Repository<ObCardType>;
  version: Repository<ObLevelcardVersion>;
  column: Repository<ObLevelcardColumn>;
  score: Repository<ObLevelcardScore>;
  level: Repository<ObLevelcardLevel>;
  tier: Repository<ObTier>;
};
const ORIGINAL_FLAG = process.env.ASSIGNMENT_PIPELINE_V2;

function ensurePg(ctx: { skip: () => void }): void {
  if (!reachable || !app) {
    // eslint-disable-next-line no-console
    console.warn(`[F100 P3 pipeline PG] SKIPPED — ${SKIP_REASON}`);
    ctx.skip();
  }
}

beforeAll(async () => {
  reachable = await pgPortReachable();
  if (!reachable) return;
  process.env.DB_TYPE = 'postgres';
  process.env.ASSIGNMENT_PIPELINE_V2 = 'true';
  try {
    app = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: PG.host, port: PG.port, username: PG.user,
          password: PG.password, database: PG.database,
          entities: ENTITIES, synchronize: true,
        }),
        TypeOrmModule.forFeature(ENTITIES),
      ],
      providers: [AssignmentRunPipelineService],
    }).compile();
    await app.init();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[F100 P3 pipeline PG] init failed → skip:', (e as Error)?.message);
    reachable = false;
    app = null;
    return;
  }
  ds = app.get(DataSource);
  service = app.get(AssignmentRunPipelineService);
  await ds.query(`
    CREATE TABLE IF NOT EXISTS customer_core (
      customer_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      source_customer_no VARCHAR(20) NOT NULL,
      customer_type VARCHAR(2) NOT NULL, name VARCHAR(100) NOT NULL,
      cus_sex VARCHAR(2), date_of_birth DATE, education_code VARCHAR(2),
      carea_no1 VARCHAR(10), carea_no2 VARCHAR(10), cellular VARCHAR(20),
      hpost_city VARCHAR(20), cpost_city VARCHAR(20), co_city VARCHAR(20),
      data_source VARCHAR(50) NOT NULL, _etl_loaded_at TIMESTAMP NOT NULL,
      _etl_pipeline_id UUID NOT NULL
    );
  `);
  await ds.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_cc_src_no2 ON customer_core(source_customer_no)');
  R = {
    run: app.get(getRepositoryToken(AssignmentRun)),
    list: app.get(getRepositoryToken(ObListDefinition)),
    pool: app.get(getRepositoryToken(ObPoolData)),
    result: app.get(getRepositoryToken(ObMonthlyRunResult)),
    deptPct: app.get(getRepositoryToken(ObDeptPct)),
    empl: app.get(getRepositoryToken(ObEmplSet)),
    emphire: app.get(getRepositoryToken(ObEmphire)),
    poolList: app.get(getRepositoryToken(ObPoolDataList)),
    cardType: app.get(getRepositoryToken(ObCardType)),
    version: app.get(getRepositoryToken(ObLevelcardVersion)),
    column: app.get(getRepositoryToken(ObLevelcardColumn)),
    score: app.get(getRepositoryToken(ObLevelcardScore)),
    level: app.get(getRepositoryToken(ObLevelcardLevel)),
    tier: app.get(getRepositoryToken(ObTier)),
  };
}, 60000);

afterAll(async () => {
  if (app) {
    await ds.query('DROP TABLE IF EXISTS customer_core CASCADE');
    for (const t of [
      'ob_monthly_run_result', 'assignment_run_snapshot', 'ob_pool_data', 'ob_pool_data_list',
      'ob_dept_pct', 'ob_empl_set', 'ob_card_type', 'ob_levelcard_version', 'ob_levelcard_column',
      'ob_levelcard_score', 'ob_levelcard_level', 'ob_tier', 'ob_list_definition', 'assignment_run',
    ]) {
      await ds.query(`DROP TABLE IF EXISTS ${t} CASCADE`);
    }
    await app.close();
  }
  if (ORIGINAL_FLAG === undefined) delete process.env.ASSIGNMENT_PIPELINE_V2;
  else process.env.ASSIGNMENT_PIPELINE_V2 = ORIGINAL_FLAG;
  restoreDbType();
});

beforeEach(async () => {
  if (!reachable || !app) return;
  for (const t of [
    'ob_monthly_run_result', 'assignment_run_snapshot', 'ob_pool_data', 'ob_pool_data_list',
    'ob_dept_pct', 'ob_empl_set', 'ob_emphire', 'ob_card_type', 'ob_levelcard_version', 'ob_levelcard_column',
    'ob_levelcard_score', 'ob_levelcard_level', 'ob_tier', 'ob_list_definition', 'assignment_run',
  ]) {
    await ds.query(`DELETE FROM ${t}`);
  }
  await ds.query('DELETE FROM customer_core');
});

// ---------------------------------------------------------------------------
// seed helpers（透過 repo；list condition_payload prod_kind=['A'] 對齊 pool prod_kind='A'）
// ---------------------------------------------------------------------------
async function seedRun(): Promise<string> {
  const r = await R.run.save(R.run.create({
    project_workym: YM, status: 'pending',
    triggered_by: 'a1b2c3d4-e5f6-7890-abcd-ef0123456789', created_at: new Date(),
  } as Partial<AssignmentRun>));
  return r.run_id;
}
async function seedCardType(ct: string): Promise<void> {
  const now = new Date();
  await R.cardType.save(R.cardType.create({
    card_type: ct, card_name: ct, prod_kind: 'A', status: 'active',
    created_at: now, created_by: 'T', updated_at: now, updated_by: 'T',
  } as Partial<ObCardType>));
}
async function seedList(opts: { listNo: string; cardType: string; crEnabled?: boolean }): Promise<void> {
  const now = new Date();
  await R.list.save(R.list.create({
    list_no: opts.listNo, list_nm: `名單-${opts.listNo}`, prod_kind: 'A', prod_best: 'Y',
    list_type: '01', list_period_start: '001', list_period_end: '030', list_interval: '001',
    project_workym: YM, caseyear: '113', settle_src: '01', card_type: opts.cardType,
    case_status: '01$$02', cr_enabled: opts.crEnabled ?? false, status: 'active', stage: 'ready',
    condition_payload: { logic: 'AND', conditions: [{ columnName: 'prod_kind', fieldType: 'categorical', values: ['A'] }] },
    created_by_prog: 'TEST', created_by: 'tester', created_at: now,
    updated_by_prog: 'TEST', updated_by: 'tester', updated_at: now,
  } as Partial<ObListDefinition>));
}
async function seedPool(opts: { applNo: string; custoNo?: string; monthCnt?: number; specTp?: string | null; agentId?: string | null; applDate?: string | null }): Promise<void> {
  await R.pool.save(R.pool.create({
    orgno: '01', appl_no: opts.applNo, custo_no: opts.custoNo ?? `C${opts.applNo}`,
    sta_code: '01', dept_id: 'D001', list_type: '01', settle_src: '01',
    month_cnt: opts.monthCnt ?? 1, spec_tp: opts.specTp ?? null, prod_kind: 'A',
    // F102（2026-07-06）：CR業代來源 = agent_id → 在職 ob_emphire(id_no) → emp_id。
    agent_id: opts.agentId ?? null,
    appl_date: opts.applDate ? new Date(`${opts.applDate}T00:00:00Z`) : null,
    _cdmp_extracted_at: new Date(),
  } as Partial<ObPoolData>));
}
async function seedDeptPct(listNo: string): Promise<void> {
  const now = new Date();
  await R.deptPct.save(R.deptPct.create({
    project_workym: YM, list_no: listNo, obdeptid: 'D001', obdeptnm: 'D', ration: '100.0',
    created_at: now, updated_at: now, created_by_prog: 'T', created_by: 'T', updated_by_prog: 'T', updated_by: 'T',
  } as Partial<ObDeptPct>));
}
async function seedEmpl(listNo: string, emplid: string, tier?: string): Promise<void> {
  const now = new Date();
  await R.empl.save(R.empl.create({
    list_no: listNo, deptid_m: 'D001', emplid, ration: '100.0',
    prod_type: tier ? `TIER:${tier}` : null, created_at: now, updated_at: now,
  } as Partial<ObEmplSet>));
}
async function seedCustomerCore(opts: { src: string; cusSex?: string; dob?: string }): Promise<void> {
  await ds.query(
    `INSERT INTO customer_core (source_customer_no, customer_type, name, cus_sex, date_of_birth, data_source, _etl_loaded_at, _etl_pipeline_id)
     VALUES ($1,'01','T',$2,$3,'test',now(),'00000000-0000-0000-0000-000000000099')`,
    [opts.src, opts.cusSex ?? null, opts.dob ?? null],
  );
}
/** F102：seed ob_emphire（CR業代來源＝id_no↔agent_id；resignDate null=在職）。id_no 預設 'ID-<empId>'。 */
async function seedEmphire(opts: { empId: string; resignDate?: string | null; idNo?: string | null }): Promise<void> {
  await R.emphire.save(R.emphire.create({
    emp_id: opts.empId, emp_nm: `E-${opts.empId}`, id_no: opts.idNo ?? `ID-${opts.empId}`,
    resign_date: opts.resignDate ? new Date(`${opts.resignDate}T00:00:00Z`) : null,
  } as Partial<ObEmphire>));
}
async function seedStandardCard(withCC = false): Promise<void> {
  await R.version.save(R.version.create({ card_type: 'T1', card_name: 'T1', card_version: 1, sdate: '20250101', edate: '20991231', status: 'active' } as Partial<ObLevelcardVersion>));
  const mk = (columnName: string, mt = MatchType.RANGE) => R.column.create({ card_type: 'T1', card_version: 1, column_name: columnName, column_label: columnName, status: 'active', match_type: mt } as Partial<ObLevelcardColumn>);
  // F105 / AD-E07-35：PROJECT_TP 改 composite（codeExpr spec_tp 字串區間 + keywordExpr 借新還舊）。
  await R.column.save([mk('LIST_MONTH'), mk('PROJECT_TP', MatchType.COMPOSITE)]);
  if (withCC) await R.column.save([mk('CUS_SEX', MatchType.RANGE), mk('AGE')]); // F104：CUS_SEX category→range
  const sc = (columnName: string, o: Partial<ObLevelcardScore>) => R.score.create({ card_type: 'T1', card_version: 1, column_name: columnName, level1: null, level2_s: null, level2_e: null, ...o } as Partial<ObLevelcardScore>);
  await R.score.save([
    sc('LIST_MONTH', { level2_s: '0', level2_e: '5', score: 10 }),
    sc('LIST_MONTH', { level2_s: '6', level2_e: '12', score: 30 }),
    // F105：composite 非借新還舊（level1=NULL→keyword ''）：spec_tp '01'→5；'02'→15。
    sc('PROJECT_TP', { level2_s: '01', level2_e: '01', score: 5 }),
    sc('PROJECT_TP', { level2_s: '02', level2_e: '02', score: 15 }),
  ]);
  if (withCC) await R.score.save([
    sc('CUS_SEX', { level2_s: '1', level2_e: '1', score: 20 }), // F104：CUS_SEX range '1'→20
    sc('CUS_SEX', { level2_s: '2', level2_e: '2', score: 8 }), // '2'→8
    sc('AGE', { level2_s: '0', level2_e: '39', score: 0 }),
    sc('AGE', { level2_s: '40', level2_e: '100', score: 12 }),
  ]);
  await R.level.save([
    R.level.create({ card_type: 'T1', card_version: 1, score_s: 0, score_e: 20, card_level: 'C' } as Partial<ObLevelcardLevel>),
    R.level.create({ card_type: 'T1', card_version: 1, score_s: 21, score_e: 40, card_level: 'B' } as Partial<ObLevelcardLevel>),
    R.level.create({ card_type: 'T1', card_version: 1, score_s: 41, score_e: 100, card_level: 'A' } as Partial<ObLevelcardLevel>),
  ]);
  await R.tier.save([
    R.tier.create({ card_type: 'T1', card_level: 'C', tier_level: 'T3' } as Partial<ObTier>),
    R.tier.create({ card_type: 'T1', card_level: 'B', tier_level: 'T2' } as Partial<ObTier>),
    R.tier.create({ card_type: 'T1', card_level: 'A', tier_level: 'T1' } as Partial<ObTier>),
    R.tier.create({ card_type: 'T1', card_level: null, tier_level: 'T3' } as Partial<ObTier>),
  ]);
}

// ===========================================================================
// EQ — runPipeline 端到端
// ===========================================================================
describe('F100 EQ — runPipeline 端到端 Stage 1~4 SQL 下推（PG DoD）', () => {
  it('EQ-001：純 ob_pool_data 卡（區間+類別）→ 手算預期（(b) 下推等價）', async (ctx) => {
    ensurePg(ctx);
    const L = 'OB1';
    await seedCardType('T1');
    await seedList({ listNo: L, cardType: 'T1' });
    await seedStandardCard(false);
    await seedDeptPct(L);
    await seedEmpl(L, 'E_NEW', 'T1');
    await seedPool({ applNo: 'A1', monthCnt: 2, specTp: '01' }); // 15 → C → T3
    await seedPool({ applNo: 'A2', monthCnt: 10, specTp: '02' }); // 45 → A → T1
    const runId = await seedRun();
    await service.runPipeline(runId, YM);

    const rows = await R.result.find({ where: { run_id: runId, list_no: L } });
    const a1 = rows.find((r) => r.appl_no === 'A1')!;
    const a2 = rows.find((r) => r.appl_no === 'A2')!;
    expect({ s: a1.score, c: a1.card_level, t: a1.tier_level }).toEqual({ s: 15, c: 'C', t: 'T3' });
    expect({ s: a2.score, c: a2.card_level, t: a2.tier_level }).toEqual({ s: 45, c: 'A', t: 'T1' });
    // 分派：A2(T1) 唯一 → exchangeable 但無 senior → default
    expect(rows.every((r) => r.emplid === 'E_NEW')).toBe(true);
    expect(rows.every((r) => r.is_cr === 'N')).toBe(true);
    // run completed
    const run = await R.run.findOne({ where: { run_id: runId } });
    expect(run?.status).toBe('completed');
    expect(run?.total_cases).toBe(2);
  });

  it('EQ-003：含 customer_core 卡 + 部分案件無 match（混合 (a)/(b)）', async (ctx) => {
    ensurePg(ctx);
    const L = 'OB3';
    await seedCardType('T1');
    await seedList({ listNo: L, cardType: 'T1' });
    await seedStandardCard(true);
    await seedDeptPct(L);
    await seedEmpl(L, 'E_NEW', 'T1');
    // match：cus_sex=1 age30 → 10+5+20+0 = 35 → B
    await seedPool({ applNo: 'M1', custoNo: 'CC1', monthCnt: 2, specTp: '01' });
    await seedCustomerCore({ src: 'CC1', cusSex: '1', dob: '1996-01-01' });
    // 無 match：cus_sex 缺→計分 default 3（不落 [1,1]/[2,2]）→ 10+5+0+0 = 15 → C
    await seedPool({ applNo: 'M2', custoNo: 'NONE', monthCnt: 2, specTp: '01' });
    const runId = await seedRun();
    await service.runPipeline(runId, YM);

    const rows = await R.result.find({ where: { run_id: runId, list_no: L } });
    expect(rows.find((r) => r.appl_no === 'M1')!.score).toBe(35); // (a) 升級
    expect(rows.find((r) => r.appl_no === 'M2')!.score).toBe(15); // (b) 等價（無 match）
    expect(rows.length).toBe(2); // 無 match 案件不消失（LEFT JOIN）
  });

  it('EQ-005：無 active version → score/level/tier NULL（案件仍寫入）', async (ctx) => {
    ensurePg(ctx);
    const L = 'OB5';
    await seedCardType('T1');
    await seedList({ listNo: L, cardType: 'T1' });
    // 不 seed version/column/score/level/tier
    await seedDeptPct(L);
    await seedEmpl(L, 'E_NEW');
    await seedPool({ applNo: 'N1', monthCnt: 2 });
    const runId = await seedRun();
    await service.runPipeline(runId, YM);

    const rows = await R.result.find({ where: { run_id: runId, list_no: L } });
    expect(rows.length).toBe(1);
    expect(rows[0].score).toBeNull();
    expect(rows[0].card_level).toBeNull();
    expect(rows[0].tier_level).toBeNull();
    // F101 / AD-E07-29（語意演進，非 regression）：Stage 3/4 比例分派只處理 tier_level IN ('T1'..'T5')
    //   之案件（BR-F101-01 / I-PIPELINE-STAGE-ORDER）。無 active version → tier NULL → 不進 ration
    //   分派 → dept_id / emplid 保持 NULL（取代舊 placeholder「全案件指向單一 defaultEmpl」行為）。
    expect(rows[0].dept_id).toBeNull();
    expect(rows[0].emplid).toBeNull();
  });

  // F102 / AD-E07-30：EQ-006/007 改測端到端 CR 優先分派（取代舊歷史 snapshot 動態回分）。
  // YM='202606' → sysDate='2026-06-01'、twoYearsAgo='2024-06-01'。
  it('EQ-006：CR 開名單端到端 → 有效 CR 案件 is_cr=Y、emplid=cr_id；新件 is_cr=N', async (ctx) => {
    ensurePg(ctx);
    const LON = 'OBON';
    await seedCardType('T1');
    await seedList({ listNo: LON, cardType: 'T1', crEnabled: true });
    await seedStandardCard(false);
    await seedDeptPct(LON);
    await seedEmpl(LON, 'E_CR', 'T1'); // E_CR 在 ob_empl_set（deptid_m='D001'，ration 100>0）
    await seedEmphire({ empId: 'E_CR', resignDate: null }); // 在職，id_no=ID-E_CR
    // ob_pool_data + ob_pool_data_list（Stage 1 帶入 CR 三欄）。
    // A_CR 承辦人 agent_id=ID-E_CR → 在職業代 E_CR；A_NEW 無承辦人。
    await seedPool({ applNo: 'A_CR', monthCnt: 2, specTp: '01', agentId: 'ID-E_CR', applDate: '2025-03-01' });
    await seedPool({ applNo: 'A_NEW', monthCnt: 2, specTp: '01' });
    const runId = await seedRun();
    await service.runPipeline(runId, YM);
    const rows = await R.result.find({ where: { run_id: runId, list_no: LON } });
    const aCr = rows.find((r) => r.appl_no === 'A_CR')!;
    const aNew = rows.find((r) => r.appl_no === 'A_NEW')!;
    expect(aCr.is_cr).toBe('Y');
    expect(aCr.emplid).toBe('E_CR'); // emplid=cr_id（CR 優先指派）
    expect(aCr.dept_id).toBe('D001');
    expect(aNew.is_cr).toBe('N'); // 新件走比例池
  });

  it('EQ-007：CR 關名單端到端（cr_enabled=false → is_cr 全 N，含來源 is_cr=Y）', async (ctx) => {
    ensurePg(ctx);
    const LOFF = 'OBOFF';
    await seedCardType('T1');
    await seedList({ listNo: LOFF, cardType: 'T1', crEnabled: false });
    await seedStandardCard(false);
    await seedDeptPct(LOFF);
    await seedEmpl(LOFF, 'E_CR', 'T1');
    await seedEmphire({ empId: 'E_CR', resignDate: null });
    // A_CR 承辦人在職，但 cr_enabled=false → 強制清 N。
    await seedPool({ applNo: 'A_CR', monthCnt: 2, specTp: '01', agentId: 'ID-E_CR', applDate: '2025-03-01' });
    const runId = await seedRun();
    await service.runPipeline(runId, YM);
    const rows = await R.result.find({ where: { run_id: runId, list_no: LOFF } });
    expect(rows.every((r) => r.is_cr === 'N')).toBe(true);
  });
});

// ===========================================================================
// IDEM — 冪等清理（I-IDEM-01）
// ===========================================================================
describe('F100 IDEM — 同 run_id 重跑列集合一致', () => {
  it('IDEM-001：同 run_id 重跑 → 計分 / 分派列集合一致（不重複殘留）', async (ctx) => {
    ensurePg(ctx);
    const L = 'OBIDEM';
    await seedCardType('T1');
    await seedList({ listNo: L, cardType: 'T1' });
    await seedStandardCard(false);
    await seedDeptPct(L);
    await seedEmpl(L, 'E_NEW', 'T1');
    await seedPool({ applNo: 'A1', monthCnt: 2, specTp: '01' });
    await seedPool({ applNo: 'A2', monthCnt: 10, specTp: '02' });
    const runId = await seedRun();

    await service.runPipeline(runId, YM);
    const first = await R.result.find({ where: { run_id: runId } });
    await service.runPipeline(runId, YM); // 重跑（內部 DELETE by run_id+list_no）
    const second = await R.result.find({ where: { run_id: runId } });

    expect(second.length).toBe(first.length); // 不重複殘留
    const firstMap = new Map(first.map((r) => [r.appl_no, r.score]));
    for (const r of second) {
      expect(r.score).toBe(firstMap.get(r.appl_no)); // 計分一致
    }
  });
});

// ===========================================================================
// RUNEST — estimate 不含計分 join（I-RUN-EST-01 延續）
// ===========================================================================
describe('F100 RUNEST — Stage 1 列數一致（下推不破壞 estimate≡run）', () => {
  it('RUNEST-001：run 後 Stage 1 寫入列數 == 案件數（計分不影響案件集合）', async (ctx) => {
    ensurePg(ctx);
    const L = 'OBRE';
    await seedCardType('T1');
    await seedList({ listNo: L, cardType: 'T1' });
    await seedStandardCard(false);
    await seedDeptPct(L);
    await seedEmpl(L, 'E_NEW', 'T1');
    await seedPool({ applNo: 'A1', monthCnt: 2, specTp: '01' });
    await seedPool({ applNo: 'A2', monthCnt: 2, specTp: '01' });
    await seedPool({ applNo: 'A3', monthCnt: 2, specTp: '01' });
    const runId = await seedRun();
    await service.runPipeline(runId, YM);
    // Stage 2~4 UPDATE 不改變列集合（案件數 = Stage 1 挑選數）
    expect(await R.result.count({ where: { run_id: runId, list_no: L } })).toBe(3);
  });
});
