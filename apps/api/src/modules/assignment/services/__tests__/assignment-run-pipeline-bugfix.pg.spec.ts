/**
 * Bug A 修復 — PG 一律 Stage 2~4 SQL 下推（gate = DB_TYPE='postgres'），與 ASSIGNMENT_PIPELINE_V2 無關。
 *
 * 對應 app 實測迴歸（branch feat/monthly-run-execution-model-refactor，2026-06-04）：
 *   PG 但 ASSIGNMENT_PIPELINE_V2 未設（dev/prod 預設）時，原 gate `useV2 && DB_TYPE==='postgres'`
 *   為 false → 走壞掉的 v1-PG fallback `executeV1(stage1Cases)`，但 PG 下 Stage 1 為 SQL INSERT 寫表、
 *   pool re-hydrate 為空 → 計分 0 筆、total_cases=0、score/tier/emplid 全 NULL。
 *
 * 本 spec 在「DB_TYPE='postgres' 但 ASSIGNMENT_PIPELINE_V2 **刻意未設**」下跑 runPipeline，斷言：
 *   - BUGA-001：計分正確（走 P3 真實計分下推，非 v1 fallback）、列已寫入並有 score/tier/emplid。
 *   - BUGA-002：total_cases == 實際寫入列數（非 0）；且來自 SQL COUNT（資料驅動，非靠全載 .length）。
 *   - BUGA-003：result 快照之 assignments 為**完整** per-case 記錄（下游 F063/F064/F067 + CR 依賴）。
 *
 * 連線：env PG_BOSS_TEST_*，預設 postgres-test（5433/cdmp_test）。不可達 → skip-with-reason。
 * F-D：本 .pg.spec 與其他 PG spec 共用 cdmp_test，須逐檔執行（勿同 vitest run 併發）。
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
  snapshot: Repository<AssignmentRunSnapshot>;
  deptPct: Repository<ObDeptPct>;
  empl: Repository<ObEmplSet>;
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
    console.warn(`[Bug A pipeline PG] SKIPPED — ${SKIP_REASON}`);
    ctx.skip();
  }
}

beforeAll(async () => {
  reachable = await pgPortReachable();
  if (!reachable) return;
  process.env.DB_TYPE = 'postgres';
  // ⚠️ Bug A 核心：刻意「不設」ASSIGNMENT_PIPELINE_V2（模擬 dev/prod 預設），驗 PG 仍走下推。
  delete process.env.ASSIGNMENT_PIPELINE_V2;
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
    console.warn('[Bug A pipeline PG] init failed → skip:', (e as Error)?.message);
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
  await ds.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_cc_src_no3 ON customer_core(source_customer_no)');
  R = {
    run: app.get(getRepositoryToken(AssignmentRun)),
    list: app.get(getRepositoryToken(ObListDefinition)),
    pool: app.get(getRepositoryToken(ObPoolData)),
    result: app.get(getRepositoryToken(ObMonthlyRunResult)),
    snapshot: app.get(getRepositoryToken(AssignmentRunSnapshot)),
    deptPct: app.get(getRepositoryToken(ObDeptPct)),
    empl: app.get(getRepositoryToken(ObEmplSet)),
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
    'ob_dept_pct', 'ob_empl_set', 'ob_card_type', 'ob_levelcard_version', 'ob_levelcard_column',
    'ob_levelcard_score', 'ob_levelcard_level', 'ob_tier', 'ob_list_definition', 'assignment_run',
  ]) {
    await ds.query(`DELETE FROM ${t}`);
  }
  await ds.query('DELETE FROM customer_core');
});

// ---------------------------------------------------------------------------
// seed helpers（與 p3.pg.spec 一致）
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
async function seedPool(opts: { applNo: string; custoNo?: string; monthCnt?: number; specTp?: string | null }): Promise<void> {
  await R.pool.save(R.pool.create({
    orgno: '01', appl_no: opts.applNo, custo_no: opts.custoNo ?? `C${opts.applNo}`,
    sta_code: '01', dept_id: 'D001', list_type: '01', settle_src: '01',
    month_cnt: opts.monthCnt ?? 1, spec_tp: opts.specTp ?? null, prod_kind: 'A',
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
async function seedStandardCard(): Promise<void> {
  await R.version.save(R.version.create({ card_type: 'T1', card_name: 'T1', card_version: 1, sdate: '20250101', edate: '20991231', status: 'active' } as Partial<ObLevelcardVersion>));
  const mk = (columnName: string, mt = MatchType.RANGE) => R.column.create({ card_type: 'T1', card_version: 1, column_name: columnName, column_label: columnName, status: 'active', match_type: mt } as Partial<ObLevelcardColumn>);
  await R.column.save([mk('LIST_MONTH'), mk('PROJECT_TP', MatchType.CATEGORY)]);
  const sc = (columnName: string, o: Partial<ObLevelcardScore>) => R.score.create({ card_type: 'T1', card_version: 1, column_name: columnName, level1: null, level2_s: null, level2_e: null, ...o } as Partial<ObLevelcardScore>);
  await R.score.save([
    sc('LIST_MONTH', { level2_s: '0', level2_e: '5', score: 10 }),
    sc('LIST_MONTH', { level2_s: '6', level2_e: '12', score: 30 }),
    sc('PROJECT_TP', { level1: '01', score: 5 }),
    sc('PROJECT_TP', { level1: '02', score: 15 }),
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
// BUGA — PG + ASSIGNMENT_PIPELINE_V2 未設 → 仍走下推、真實計分、total_cases 正確
// ===========================================================================
describe('Bug A — PG 一律下推（ASSIGNMENT_PIPELINE_V2 未設下不回 v1 fallback）', () => {
  it('BUGA-000：環境前提 — DB_TYPE=postgres 且 ASSIGNMENT_PIPELINE_V2 未設', (ctx) => {
    ensurePg(ctx);
    expect(process.env.DB_TYPE).toBe('postgres');
    expect(process.env.ASSIGNMENT_PIPELINE_V2).toBeUndefined();
  });

  it('BUGA-001：計分正確（走 P3 真實計分，非 v1 空計分）', async (ctx) => {
    ensurePg(ctx);
    const L = 'BUGA1';
    await seedCardType('T1');
    await seedList({ listNo: L, cardType: 'T1' });
    await seedStandardCard();
    await seedDeptPct(L);
    await seedEmpl(L, 'E_NEW', 'T1');
    await seedPool({ applNo: 'A1', monthCnt: 2, specTp: '01' }); // 15 → C → T3
    await seedPool({ applNo: 'A2', monthCnt: 10, specTp: '02' }); // 45 → A → T1
    const runId = await seedRun();
    await service.runPipeline(runId, YM);

    const rows = await R.result.find({ where: { run_id: runId, list_no: L } });
    const a1 = rows.find((r) => r.appl_no === 'A1')!;
    const a2 = rows.find((r) => r.appl_no === 'A2')!;
    // 修復前（v1 fallback）：pool 空 → 0 列計分 → score/tier/emplid 全 NULL
    expect({ s: a1.score, c: a1.card_level, t: a1.tier_level }).toEqual({ s: 15, c: 'C', t: 'T3' });
    expect({ s: a2.score, c: a2.card_level, t: a2.tier_level }).toEqual({ s: 45, c: 'A', t: 'T1' });
    expect(rows.every((r) => r.emplid === 'E_NEW')).toBe(true);
    expect(rows.every((r) => r.score !== null)).toBe(true);
  });

  it('BUGA-002：total_cases == 實際寫入列數（非 0；來自 SQL COUNT）', async (ctx) => {
    ensurePg(ctx);
    const L = 'BUGA2';
    await seedCardType('T1');
    await seedList({ listNo: L, cardType: 'T1' });
    await seedStandardCard();
    await seedDeptPct(L);
    await seedEmpl(L, 'E_NEW', 'T1');
    await seedPool({ applNo: 'A1', monthCnt: 2, specTp: '01' });
    await seedPool({ applNo: 'A2', monthCnt: 2, specTp: '01' });
    await seedPool({ applNo: 'A3', monthCnt: 2, specTp: '01' });
    const runId = await seedRun();
    await service.runPipeline(runId, YM);

    const writtenCount = await R.result.count({ where: { run_id: runId } });
    const run = await R.run.findOne({ where: { run_id: runId } });
    expect(run?.status).toBe('completed');
    expect(writtenCount).toBe(3);
    // 修復前：total_cases=0（v1 fallback 計分 0 筆，stage4Results.length=0）
    expect(run?.total_cases).toBe(3);
    expect(run?.total_cases).toBe(writtenCount); // 資料驅動：== 表內實際列數
  });

  it('BUGA-003：result 快照 assignments 為完整 per-case 記錄（非 sample；下游 F063/F067 + CR 依賴）', async (ctx) => {
    ensurePg(ctx);
    const L = 'BUGA3';
    await seedCardType('T1');
    await seedList({ listNo: L, cardType: 'T1' });
    await seedStandardCard();
    await seedDeptPct(L);
    await seedEmpl(L, 'E_NEW', 'T1');
    const N = 12;
    for (let i = 0; i < N; i++) {
      await seedPool({ applNo: `A${i}`, monthCnt: 2, specTp: '01' });
    }
    const runId = await seedRun();
    await service.runPipeline(runId, YM);

    const writtenCount = await R.result.count({ where: { run_id: runId } });
    expect(writtenCount).toBe(N);

    const resultSnap = await R.snapshot.findOne({
      where: { run_id: runId, snapshot_type: 'result' },
    });
    const assignments = (resultSnap?.payload as { assignments?: unknown[] })?.assignments ?? [];
    // 完整：快照之 assignments 列數 == 表內列數（非有界 sample）。
    expect(assignments.length).toBe(N);
    // 每列含計分欄位（快照語意不變：完整 per-case）。
    const inputSnap = await R.snapshot.findOne({
      where: { run_id: runId, snapshot_type: 'input_list' },
    });
    const cases = (inputSnap?.payload as { cases?: unknown[] })?.cases ?? [];
    expect(cases.length).toBe(N);
    const sample = (assignments as Array<{ score: unknown; emplid: unknown }>)[0];
    expect(sample.score).not.toBeNull();
    expect(sample.emplid).toBe('E_NEW');
  });
});
