/**
 * F104 / AD-E07-10-L v4.0 — Stage 2 計分引擎全欄對齊 legacy SP（PG 真庫，強制 Postgres）
 *
 * 對應測試設計（F104-test.md）需 PG 群組（約 48 案）：
 *   - KW-005/006     ：PROJECT_TP 借新還舊 / SALES_STS 中古車商 EQ
 *   - SEX-003/004    ：CUS_SEX range '1'/'2'/'3'/缺值 EQ（計分 default 3）
 *   - SAFE-001~003/005/006：cus_sex 髒值 SQL 不拋例外 + 兩 default 分離 EQ
 *   - BRANCH-009/010 ：個人/法人五欄 EQ
 *   - AGE100-005     ：age 100/101/−1 邊界 EQ
 *   - EDU-006/007    ：補零命中 + S5 default '08' EQ
 *   - CITY-002/003/009/010：縣市 LEFT3 命中/未命中/缺值 default EQ
 *   - PCD-007/008    ：LIST_MONTH / LOAN_RATE per-card default EQ
 *   - EQ-001~012     ：JS↔SQL 逐列等價 DoD（誤差=0）
 *
 * oracle = JS computeScore（同 fixture cc/arCap），與 PG runStage2and3Sql 逐列等價；非「SQL 自我斷言」。
 * 連線同 F100~F103 pg.spec（PG_BOSS_TEST_*，預設 5433/cdmp_test）；序列執行。
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
  vi,
} from 'vitest';
import * as net from 'net';
import { DataSource, Repository, EntityManager } from 'typeorm';

import { ObPoolData } from '@/database/entities/ob-pool-data.entity';
import { ObMonthlyRunResult } from '@/database/entities/ob-monthly-run-result.entity';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { ObLevelcardColumn } from '@/database/entities/ob-levelcard-column.entity';
import { ObLevelcardScore } from '@/database/entities/ob-levelcard-score.entity';
import { ObLevelcardLevel } from '@/database/entities/ob-levelcard-level.entity';
import { ObTier } from '@/database/entities/ob-tier.entity';
import { ObArreturndfMinCap } from '@/database/entities/ob-arreturndf-min-cap.entity';
import {
  runStage2and3Sql,
  type Stage2to4ListContext,
} from '../stage2to4-sql-executor';
import {
  AssignmentRunPipelineService,
  type CustomerCoreRow,
  type ArCapitalRow,
} from '../../services/assignment-run-pipeline.service';
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
const RUN_ID = '00000000-0000-0000-0000-0000000000d4';

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
let columnRepo: Repository<ObLevelcardColumn>;
let scoreRepo: Repository<ObLevelcardScore>;
let arRepo: Repository<ObArreturndfMinCap>;
let manager: EntityManager;

// 每張卡用同一 card_type / version；測 per-card default 時以實際 card_type（H/S/S5/E/E5/M）seed。
type ComputeScoreFn = (
  pool: ObPoolData,
  cardType: string,
  cardVersion: number,
  activeColumns: ObLevelcardColumn[],
  allScores: ObLevelcardScore[],
  cc: CustomerCoreRow | null,
  arCap: ArCapitalRow | null,
) => number;
function makeComputeScore(): ComputeScoreFn {
  const svc = Object.create(
    AssignmentRunPipelineService.prototype,
  ) as AssignmentRunPipelineService;
  Object.defineProperty(svc, 'logger', {
    value: { warn: vi.fn(), log: vi.fn(), error: vi.fn(), debug: vi.fn() },
    configurable: true,
  });
  return (svc as unknown as { computeScore: ComputeScoreFn }).computeScore.bind(svc);
}
const computeScore = makeComputeScore();

// ---------------------------------------------------------------------------
// seed helpers（card_type 參數化）
// ---------------------------------------------------------------------------
async function seedCase(opts: {
  applNo: string;
  custoNo?: string | null;
  listNo: string;
  monthCnt?: number | null;
  specTp?: string | null;
  specName?: string | null;
  salesStsNa?: string | null;
  loanRate?: string | null;
}): Promise<void> {
  await poolRepo.save(
    poolRepo.create({
      orgno: '01',
      appl_no: opts.applNo,
      custo_no: opts.custoNo ?? `C${opts.applNo}`,
      sta_code: '01',
      dept_id: 'D001',
      list_type: '01',
      settle_src: '01',
      month_cnt: opts.monthCnt ?? null,
      spec_tp: opts.specTp ?? null,
      spec_name: opts.specName ?? null,
      sales_sts_na: opts.salesStsNa ?? null,
      loan_rate: opts.loanRate ?? null,
      _cdmp_extracted_at: new Date(),
    } as Partial<ObPoolData>),
  );
  await resultRepo.save(
    resultRepo.create({
      run_id: RUN_ID,
      list_no: opts.listNo,
      orgno: '01',
      appl_no: opts.applNo,
      custo_no: opts.custoNo ?? `C${opts.applNo}`,
      settle_src: '01',
      result_status: 'PENDING',
      created_at: new Date(),
      updated_at: new Date(),
    } as Partial<ObMonthlyRunResult>),
  );
}

async function seedCustomerCore(opts: {
  sourceCustomerNo: string;
  cusSex?: string | null;
  dateOfBirth?: string | null;
  educationCode?: string | null;
  careaNo1?: string | null;
  careaNo2?: string | null;
  cellular?: string | null;
  hpostCity?: string | null;
  cpostCity?: string | null;
  coCity?: string | null;
}): Promise<void> {
  await ds!.query(
    `INSERT INTO customer_core
       (source_customer_no, customer_type, name, cus_sex, date_of_birth, education_code,
        carea_no1, carea_no2, cellular, hpost_city, cpost_city, co_city,
        data_source, _etl_loaded_at, _etl_pipeline_id)
     VALUES ($1,'01','T',$2,$3,$4,$5,$6,$7,$8,$9,$10,'test',now(),'00000000-0000-0000-0000-000000000099')`,
    [
      opts.sourceCustomerNo,
      opts.cusSex ?? null,
      opts.dateOfBirth ?? null,
      opts.educationCode ?? null,
      opts.careaNo1 ?? null,
      opts.careaNo2 ?? null,
      opts.cellular ?? null,
      opts.hpostCity ?? null,
      opts.cpostCity ?? null,
      opts.coCity ?? null,
    ],
  );
}

async function seedColumn(cardType: string, columnName: string, matchType: MatchType): Promise<void> {
  await columnRepo.save(
    columnRepo.create({
      card_type: cardType,
      card_version: 1,
      column_name: columnName,
      column_label: columnName,
      status: 'active',
      match_type: matchType,
    } as Partial<ObLevelcardColumn>),
  );
}

async function seedRangeScore(cardType: string, columnName: string, lo: string, hi: string, score: number): Promise<void> {
  await scoreRepo.save(
    scoreRepo.create({
      card_type: cardType, card_version: 1, column_name: columnName,
      level1: null, level2_s: lo, level2_e: hi, score,
    } as Partial<ObLevelcardScore>),
  );
}
async function seedCatScore(cardType: string, columnName: string, level1: string, score: number): Promise<void> {
  await scoreRepo.save(
    scoreRepo.create({
      card_type: cardType, card_version: 1, column_name: columnName,
      level1, level2_s: null, level2_e: null, score,
    } as Partial<ObLevelcardScore>),
  );
}

async function pushdown(cardType: string, listNo: string): Promise<void> {
  const activeColumns = await columnRepo.find({
    where: { card_type: cardType, card_version: 1, status: 'active' },
  });
  const scoreRows = await scoreRepo.find({ where: { card_type: cardType, card_version: 1 } });
  const ctx: Stage2to4ListContext = {
    runId: RUN_ID, listNo, cardType, cardVersion: 1, activeColumns, scoreRows, ym: '202606',
  };
  await runStage2and3Sql(manager, ctx);
}

async function loadCardDef(cardType: string): Promise<{
  activeColumns: ObLevelcardColumn[];
  scoreRows: ObLevelcardScore[];
}> {
  const activeColumns = await columnRepo.find({
    where: { card_type: cardType, card_version: 1, status: 'active' },
  });
  const scoreRows = await scoreRepo.find({ where: { card_type: cardType, card_version: 1 } });
  return { activeColumns, scoreRows };
}

async function getScore(applNo: string, listNo: string): Promise<number | null> {
  const row = await resultRepo.findOne({
    where: { run_id: RUN_ID, list_no: listNo, orgno: '01', appl_no: applNo },
  });
  if (!row) throw new Error(`row not found: ${applNo}`);
  return row.score;
}

/** EQ：seed pool + cc 後，斷言 JS computeScore === PG pushdown score（誤差 0）。 */
async function assertEq(
  cardType: string,
  applNo: string,
  listNo: string,
  cc: CustomerCoreRow | null,
  arCap: ArCapitalRow | null,
): Promise<number> {
  const { activeColumns, scoreRows } = await loadCardDef(cardType);
  const poolRow = await poolRepo.findOneOrFail({ where: { orgno: '01', appl_no: applNo } });
  const jsScore = computeScore(poolRow, cardType, 1, activeColumns, scoreRows, cc, arCap);
  await pushdown(cardType, listNo);
  const pgScore = await getScore(applNo, listNo);
  expect(pgScore).toBe(jsScore);
  return jsScore;
}

/** 由 today 推算 age 歲之 date_of_birth（生日已過 → 整數年齡）。 */
function dobForAge(age: number, dayOffset = -1): string {
  const t = new Date();
  const d = new Date(t.getFullYear() - age, t.getMonth(), t.getDate() + dayOffset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function ensurePg(ctx: { skip: () => void }): void {
  if (!reachable || !ds) {
    // eslint-disable-next-line no-console
    console.warn(`[F104 PG Integration] SKIPPED — ${SKIP_REASON}`);
    ctx.skip();
  }
}

beforeAll(async () => {
  reachable = await pgPortReachable();
  if (!reachable) return;
  try {
    ds = new DataSource({
      type: 'postgres',
      host: PG.host, port: PG.port, username: PG.user, password: PG.password, database: PG.database,
      entities: [
        ObPoolData,
        ObMonthlyRunResult,
        AssignmentRun,
        ObLevelcardColumn,
        ObLevelcardScore,
        ObLevelcardLevel,
        ObTier,
        ObArreturndfMinCap,
      ],
      synchronize: true,
    });
    await ds.initialize();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[F104 PG Integration] init failed → skip:', (e as Error)?.message);
    reachable = false;
    ds = null;
    return;
  }
  // customer_core 無 entity（AD-E06-1）→ raw SQL 建表（F104 m301 計分映射欄位）。
  await ds.query(`
    CREATE TABLE IF NOT EXISTS customer_core (
      customer_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      source_customer_no VARCHAR(20) NOT NULL,
      customer_type VARCHAR(2) NOT NULL,
      name VARCHAR(100) NOT NULL,
      cus_sex VARCHAR(2),
      date_of_birth DATE,
      education_code VARCHAR(2),
      carea_no1 VARCHAR(10),
      carea_no2 VARCHAR(10),
      cellular VARCHAR(20),
      hpost_city VARCHAR(20),
      cpost_city VARCHAR(20),
      co_city VARCHAR(20),
      data_source VARCHAR(50) NOT NULL,
      _etl_loaded_at TIMESTAMP NOT NULL,
      _etl_pipeline_id UUID NOT NULL
    );
  `);
  await ds.query(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_cc_src_no_f104 ON customer_core(source_customer_no)',
  );

  poolRepo = ds.getRepository(ObPoolData);
  resultRepo = ds.getRepository(ObMonthlyRunResult);
  columnRepo = ds.getRepository(ObLevelcardColumn);
  scoreRepo = ds.getRepository(ObLevelcardScore);
  arRepo = ds.getRepository(ObArreturndfMinCap);
  manager = ds.manager;
}, 60000);

afterAll(async () => {
  if (ds) {
    await ds.query('DROP TABLE IF EXISTS customer_core CASCADE');
    await ds.query('DROP TABLE IF EXISTS ob_arreturndf_min_cap CASCADE');
    await ds.query('DROP TABLE IF EXISTS ob_monthly_run_result CASCADE');
    await ds.query('DROP TABLE IF EXISTS ob_pool_data CASCADE');
    await ds.query('DROP TABLE IF EXISTS assignment_run CASCADE');
    await ds.query('DROP TABLE IF EXISTS ob_levelcard_column CASCADE');
    await ds.query('DROP TABLE IF EXISTS ob_levelcard_score CASCADE');
    await ds.query('DROP TABLE IF EXISTS ob_levelcard_level CASCADE');
    await ds.query('DROP TABLE IF EXISTS ob_tier CASCADE');
    await ds.destroy();
  }
  restoreDbType();
});

beforeEach(async () => {
  if (!reachable || !ds) return;
  await ds.query('DELETE FROM ob_monthly_run_result');
  await ds.query('DELETE FROM ob_pool_data');
  await ds.query('DELETE FROM customer_core');
  await ds.query('DELETE FROM ob_arreturndf_min_cap');
  await ds.query('DELETE FROM ob_levelcard_score');
  await ds.query('DELETE FROM ob_levelcard_column');
  await ds.query('DELETE FROM ob_levelcard_level');
  await ds.query('DELETE FROM ob_tier');
  await ds.query('DELETE FROM assignment_run');
  await ds.query(
    `INSERT INTO assignment_run (run_id, project_workym, status, triggered_by, created_at)
     VALUES ($1, '202606', 'running', '00000000-0000-0000-0000-000000000001', now())`,
    [RUN_ID],
  );
});

// ===========================================================================
// KW — 借新還舊 / 中古車商 EQ
// ===========================================================================
describe('F104 KW — PROJECT_TP 借新還舊 / SALES_STS 中古車商（EQ）', () => {
  it('KW-005：PROJECT_TP spec_name 含借新還舊 → A，JS=PG', async (ctx) => {
    ensurePg(ctx);
    const L = 'L_KW5';
    await seedColumn('H', 'PROJECT_TP', MatchType.CATEGORY);
    await seedCatScore('H', 'PROJECT_TP', '01', 5);
    await seedCatScore('H', 'PROJECT_TP', 'A', 25);
    await seedCase({ applNo: 'KW5', listNo: L, specTp: '01', specName: '汽車貸款借新還舊專案' });
    const score = await assertEq('H', 'KW5', L, null, null);
    expect(score).toBe(25); // 命中 'A'
  });

  it('KW-006：SALES_STS AGENT/中古車商/DIRECT 三值，JS=PG', async (ctx) => {
    ensurePg(ctx);
    const L = 'L_KW6';
    await seedColumn('H', 'SALES_STS', MatchType.CATEGORY);
    await seedCatScore('H', 'SALES_STS', 'AGENT', 9);
    await seedCatScore('H', 'SALES_STS', 'UCD', 6);
    await seedCatScore('H', 'SALES_STS', 'HFC', 3);
    await seedCase({ applNo: 'KW6A', listNo: L, salesStsNa: 'AGENT' });
    await seedCase({ applNo: 'KW6U', listNo: L, salesStsNa: '中古車商' });
    await seedCase({ applNo: 'KW6D', listNo: L, salesStsNa: 'DIRECT' });
    await assertEq('H', 'KW6A', L, null, null);
    await assertEq('H', 'KW6U', L, null, null);
    await assertEq('H', 'KW6D', L, null, null);
    expect(await getScore('KW6A', L)).toBe(9);
    expect(await getScore('KW6U', L)).toBe(6); // 中古車商 → UCD
    expect(await getScore('KW6D', L)).toBe(3);
  });
});

// ===========================================================================
// SEX — CUS_SEX range EQ
// ===========================================================================
describe('F104 SEX — CUS_SEX range（EQ）', () => {
  async function seedSexCard(): Promise<void> {
    await seedColumn('H', 'CUS_SEX', MatchType.RANGE);
    await seedRangeScore('H', 'CUS_SEX', '1', '1', 20);
    await seedRangeScore('H', 'CUS_SEX', '2', '2', 8);
    await seedRangeScore('H', 'CUS_SEX', '3', '3', 1);
  }
  function cc(cusSex: string | null): CustomerCoreRow {
    return {
      source_customer_no: 'CSX', cus_sex: cusSex, date_of_birth: null, education_code: null,
      hpost_city: null, cpost_city: null, co_city: null, carea_no1: null, carea_no2: null, cellular: null,
    };
  }

  it('SEX-003：cus_sex 1/2/3 落不同 range 區間，JS=PG', async (ctx) => {
    ensurePg(ctx);
    const L = 'L_SEX3';
    await seedSexCard();
    await seedCase({ applNo: 'SX1', custoNo: 'SX1', listNo: L });
    await seedCase({ applNo: 'SX2', custoNo: 'SX2', listNo: L });
    await seedCase({ applNo: 'SX3', custoNo: 'SX3', listNo: L });
    await seedCustomerCore({ sourceCustomerNo: 'SX1', cusSex: '1' });
    await seedCustomerCore({ sourceCustomerNo: 'SX2', cusSex: '2' });
    await seedCustomerCore({ sourceCustomerNo: 'SX3', cusSex: '3' });
    await assertEq('H', 'SX1', L, cc('1'), null);
    await assertEq('H', 'SX2', L, cc('2'), null);
    await assertEq('H', 'SX3', L, cc('3'), null);
    expect(await getScore('SX1', L)).toBe(20);
    expect(await getScore('SX2', L)).toBe(8);
    expect(await getScore('SX3', L)).toBe(1);
  });

  it('SEX-004：cus_sex 缺值（cc=null）→ 計分 default 3 命中 [3,3]，JS=PG', async (ctx) => {
    ensurePg(ctx);
    const L = 'L_SEX4';
    await seedSexCard();
    await seedCase({ applNo: 'SX4', custoNo: 'C_NONE', listNo: L });
    // 不 seed customer_core → cc LEFT JOIN 無命中 → safe-cast NULL → COALESCE 3 → [3,3]→1
    await assertEq('H', 'SX4', L, null, null);
    expect(await getScore('SX4', L)).toBe(1);
  });
});

// ===========================================================================
// SAFE — cus_sex NULL-safe cast（高嚴重度，不拋例外）
// ===========================================================================
describe('F104 SAFE — cus_sex NULL-safe cast（PG 真庫，不拋例外）', () => {
  it('SAFE-001：cus_sex=C 計分 SQL 不拋例外 + 計分 3 命中 [3,3]', async (ctx) => {
    ensurePg(ctx);
    const L = 'L_SAFE1';
    await seedColumn('H', 'CUS_SEX', MatchType.RANGE);
    await seedRangeScore('H', 'CUS_SEX', '3', '3', 1);
    await seedCase({ applNo: 'SF1', custoNo: 'SF1', listNo: L });
    await seedCustomerCore({ sourceCustomerNo: 'SF1', cusSex: 'C' });
    await expect(pushdown('H', L)).resolves.not.toThrow();
    expect(await getScore('SF1', L)).toBe(1); // safe-cast C→NULL→3→[3,3]
  });

  it('SAFE-002：cus_sex=C 五欄分流 SQL 不拋例外', async (ctx) => {
    ensurePg(ctx);
    const L = 'L_SAFE2';
    await seedColumn('S', 'CAREA_NO1', MatchType.RANGE);
    await seedColumn('S', 'AGE', MatchType.RANGE);
    await seedColumn('S', 'EDUCAT_BACK', MatchType.RANGE);
    await seedRangeScore('S', 'CAREA_NO1', '1', '1', 4);
    await seedCase({ applNo: 'SF2', custoNo: 'SF2', listNo: L });
    await seedCustomerCore({ sourceCustomerNo: 'SF2', cusSex: 'C', careaNo1: '02', dateOfBirth: '1990-01-01', educationCode: '5' });
    await expect(pushdown('S', L)).resolves.not.toThrow();
  });

  it('SAFE-003：混合髒值批次（C/D/8/9/空/1/3）整批不拋例外 + 不掉列', async (ctx) => {
    ensurePg(ctx);
    const L = 'L_SAFE3';
    await seedColumn('H', 'CUS_SEX', MatchType.RANGE);
    await seedRangeScore('H', 'CUS_SEX', '3', '3', 1);
    const vals: Array<[string, string | null]> = [
      ['D1', 'C'], ['D2', 'D'], ['D3', '8'], ['D4', '9'], ['D5', ''], ['D6', '1'], ['D7', '3'],
    ];
    for (const [appl, sex] of vals) {
      await seedCase({ applNo: appl, custoNo: appl, listNo: L });
      await seedCustomerCore({ sourceCustomerNo: appl, cusSex: sex });
    }
    await expect(pushdown('H', L)).resolves.not.toThrow();
    for (const [appl] of vals) {
      const s = await getScore(appl, L);
      expect(s).not.toBeNull(); // 不掉列
    }
  });

  it('SAFE-005：cus_sex=C 計分 default=3 兩路徑一致（EQ）', async (ctx) => {
    ensurePg(ctx);
    const L = 'L_SAFE5';
    await seedColumn('H', 'CUS_SEX', MatchType.RANGE);
    await seedRangeScore('H', 'CUS_SEX', '3', '3', 1);
    await seedCase({ applNo: 'SF5', custoNo: 'SF5', listNo: L });
    await seedCustomerCore({ sourceCustomerNo: 'SF5', cusSex: 'C' });
    const cc: CustomerCoreRow = {
      source_customer_no: 'SF5', cus_sex: 'C', date_of_birth: null, education_code: null,
      hpost_city: null, cpost_city: null, co_city: null, carea_no1: null, carea_no2: null, cellular: null,
    };
    await assertEq('H', 'SF5', L, cc, null);
    expect(await getScore('SF5', L)).toBe(1);
  });

  it('SAFE-006：cus_sex=C 分流 gating → 法人（CAREA 0）兩路徑一致（EQ）', async (ctx) => {
    ensurePg(ctx);
    const L = 'L_SAFE6';
    await seedColumn('S', 'CAREA_NO1', MatchType.RANGE);
    await seedRangeScore('S', 'CAREA_NO1', '1', '1', 4);
    await seedCase({ applNo: 'SF6', custoNo: 'SF6', listNo: L });
    await seedCustomerCore({ sourceCustomerNo: 'SF6', cusSex: 'C', careaNo1: '02' });
    const cc: CustomerCoreRow = {
      source_customer_no: 'SF6', cus_sex: 'C', date_of_birth: null, education_code: null,
      hpost_city: null, cpost_city: null, co_city: null, carea_no1: '02', carea_no2: null, cellular: null,
    };
    await assertEq('S', 'SF6', L, cc, null);
    // 'C' → 法人 → CAREA_NO1=0 → 不落 [1,1] → 0
    expect(await getScore('SF6', L)).toBe(0);
  });
});

// ===========================================================================
// BRANCH — 個人 / 法人五欄 EQ
// ===========================================================================
describe('F104 BRANCH — 個人 / 法人五欄（EQ）', () => {
  async function seedSCard(): Promise<void> {
    await seedColumn('S', 'CUS_SEX', MatchType.RANGE);
    await seedColumn('S', 'AGE', MatchType.RANGE);
    await seedColumn('S', 'CAREA_NO1', MatchType.RANGE);
    await seedColumn('S', 'CAREA_NO2', MatchType.RANGE);
    await seedColumn('S', 'EDUCAT_BACK', MatchType.RANGE);
    await seedRangeScore('S', 'CUS_SEX', '1', '1', 20);
    await seedRangeScore('S', 'CUS_SEX', '3', '3', 1);
    // AGE 區間刻意不含 0：法人 AGE=0 不命中（驗「法人取 0」之計分效果，非靠 0 落區間）。
    await seedRangeScore('S', 'AGE', '30', '40', 12);
    await seedRangeScore('S', 'CAREA_NO1', '1', '1', 4);
    await seedRangeScore('S', 'CAREA_NO2', '1', '1', 3);
    await seedRangeScore('S', 'EDUCAT_BACK', '05', '05', 7);
  }

  it('BRANCH-009：個人(1) 五欄全有值，JS=PG', async (ctx) => {
    ensurePg(ctx);
    const L = 'L_BR9';
    await seedSCard();
    await seedCase({ applNo: 'BR9', custoNo: 'BR9', listNo: L });
    await seedCustomerCore({
      sourceCustomerNo: 'BR9', cusSex: '1', careaNo1: '02', careaNo2: '03',
      dateOfBirth: dobForAge(36), educationCode: '5',
    });
    const cc: CustomerCoreRow = {
      source_customer_no: 'BR9', cus_sex: '1', date_of_birth: dobForAge(36), education_code: '5',
      hpost_city: null, cpost_city: null, co_city: null, carea_no1: '02', carea_no2: '03', cellular: null,
    };
    await assertEq('S', 'BR9', L, cc, null);
    // CUS_SEX 20 + AGE 12 + CAREA1 4 + CAREA2 3 + EDUCAT '05' 7 = 46
    expect(await getScore('BR9', L)).toBe(46);
  });

  it('BRANCH-010：法人(3) 五欄即使有值 → 0/default，JS=PG', async (ctx) => {
    ensurePg(ctx);
    const L = 'L_BR10';
    await seedSCard();
    await seedCase({ applNo: 'BR10', custoNo: 'BR10', listNo: L });
    await seedCustomerCore({
      sourceCustomerNo: 'BR10', cusSex: '3', careaNo1: '02', careaNo2: '03',
      dateOfBirth: dobForAge(36), educationCode: '5',
    });
    const cc: CustomerCoreRow = {
      source_customer_no: 'BR10', cus_sex: '3', date_of_birth: dobForAge(36), education_code: '5',
      hpost_city: null, cpost_city: null, co_city: null, carea_no1: '02', carea_no2: '03', cellular: null,
    };
    await assertEq('S', 'BR10', L, cc, null);
    // CUS_SEX 1（[3,3]）+ AGE 0 + CAREA 0 + CAREA2 0 + EDUCAT '02'(default，不落 [05,05]) 0 = 1
    expect(await getScore('BR10', L)).toBe(1);
  });
});

// ===========================================================================
// AGE100 — age 邊界 EQ
// ===========================================================================
describe('F104 AGE100 — age 100/101/−1 邊界（EQ）', () => {
  it('AGE100-005：age=100→命中、101→0、−1→0，JS=PG', async (ctx) => {
    ensurePg(ctx);
    const L = 'L_AGE5';
    await seedColumn('S', 'AGE', MatchType.RANGE);
    await seedRangeScore('S', 'AGE', '90', '120', 50);
    const futureDob = dobForAge(-1, 365); // 約 1 年後 → age<0
    await seedCase({ applNo: 'AG100', custoNo: 'AG100', listNo: L });
    await seedCase({ applNo: 'AG101', custoNo: 'AG101', listNo: L });
    await seedCase({ applNo: 'AGNEG', custoNo: 'AGNEG', listNo: L });
    await seedCustomerCore({ sourceCustomerNo: 'AG100', cusSex: '1', dateOfBirth: dobForAge(100) });
    await seedCustomerCore({ sourceCustomerNo: 'AG101', cusSex: '1', dateOfBirth: dobForAge(101) });
    await seedCustomerCore({ sourceCustomerNo: 'AGNEG', cusSex: '1', dateOfBirth: futureDob });
    const mkCc = (sn: string, dob: string): CustomerCoreRow => ({
      source_customer_no: sn, cus_sex: '1', date_of_birth: dob, education_code: null,
      hpost_city: null, cpost_city: null, co_city: null, carea_no1: null, carea_no2: null, cellular: null,
    });
    await assertEq('S', 'AG100', L, mkCc('AG100', dobForAge(100)), null);
    await assertEq('S', 'AG101', L, mkCc('AG101', dobForAge(101)), null);
    await assertEq('S', 'AGNEG', L, mkCc('AGNEG', futureDob), null);
    expect(await getScore('AG100', L)).toBe(50); // 100 ∈ [90,120]
    expect(await getScore('AG101', L)).toBe(0); // >100 → 0
    expect(await getScore('AGNEG', L)).toBe(0); // <0 → 0
  });
});

// ===========================================================================
// EDU — 補零 + per-card default EQ
// ===========================================================================
describe('F104 EDU — 補零 + per-card default（EQ）', () => {
  it('EDU-006：個人 educat 補零 05 命中 range 字串區間，JS=PG', async (ctx) => {
    ensurePg(ctx);
    const L = 'L_EDU6';
    await seedColumn('S', 'EDUCAT_BACK', MatchType.RANGE);
    await seedRangeScore('S', 'EDUCAT_BACK', '05', '05', 11);
    await seedCase({ applNo: 'ED6', custoNo: 'ED6', listNo: L });
    await seedCustomerCore({ sourceCustomerNo: 'ED6', cusSex: '1', educationCode: '5' });
    const cc: CustomerCoreRow = {
      source_customer_no: 'ED6', cus_sex: '1', date_of_birth: null, education_code: '5',
      hpost_city: null, cpost_city: null, co_city: null, carea_no1: null, carea_no2: null, cellular: null,
    };
    await assertEq('S', 'ED6', L, cc, null);
    expect(await getScore('ED6', L)).toBe(11);
  });

  it('EDU-007：S5 缺值 default 08 命中 [08,99]，JS=PG', async (ctx) => {
    ensurePg(ctx);
    const L = 'L_EDU7';
    await seedColumn('S5', 'EDUCAT_BACK', MatchType.RANGE);
    await seedRangeScore('S5', 'EDUCAT_BACK', '08', '99', 13);
    await seedCase({ applNo: 'ED7', custoNo: 'ED7', listNo: L });
    await seedCustomerCore({ sourceCustomerNo: 'ED7', cusSex: '1', educationCode: null });
    const cc: CustomerCoreRow = {
      source_customer_no: 'ED7', cus_sex: '1', date_of_birth: null, education_code: null,
      hpost_city: null, cpost_city: null, co_city: null, carea_no1: null, carea_no2: null, cellular: null,
    };
    await assertEq('S5', 'ED7', L, cc, null);
    expect(await getScore('ED7', L)).toBe(13); // default '08' ∈ [08,99]
  });
});

// ===========================================================================
// CITY — 縣市 LEFT3 + per-card default EQ
// ===========================================================================
describe('F104 CITY — 縣市 LEFT3 + per-card default（EQ）', () => {
  async function seedMCityCard(): Promise<void> {
    await seedColumn('M', 'HPOST_NUM_NM', MatchType.CATEGORY);
    await seedColumn('M', 'CPOST_NUM_NM', MatchType.CATEGORY);
    await seedColumn('M', 'CO_NUM_NM', MatchType.CATEGORY);
    await seedCatScore('M', 'HPOST_NUM_NM', '臺北市', 10);
    await seedCatScore('M', 'CPOST_NUM_NM', '臺南市', 20);
    await seedCatScore('M', 'CO_NUM_NM', '高雄市', 30);
  }
  const mkCc = (sn: string, h: string | null, c: string | null, o: string | null): CustomerCoreRow => ({
    source_customer_no: sn, cus_sex: null, date_of_birth: null, education_code: null,
    hpost_city: h, cpost_city: c, co_city: o, carea_no1: null, carea_no2: null, cellular: null,
  });

  it('CITY-002：HPOST 臺北市中正區 LEFT3=臺北市 命中，JS=PG', async (ctx) => {
    ensurePg(ctx);
    const L = 'L_CT2';
    await seedColumn('M', 'HPOST_NUM_NM', MatchType.CATEGORY);
    await seedCatScore('M', 'HPOST_NUM_NM', '臺北市', 10);
    await seedCase({ applNo: 'CT2', custoNo: 'CT2', listNo: L });
    await seedCustomerCore({ sourceCustomerNo: 'CT2', hpostCity: '臺北市中正區' });
    await assertEq('M', 'CT2', L, mkCc('CT2', '臺北市中正區', null, null), null);
    expect(await getScore('CT2', L)).toBe(10);
  });

  it('CITY-003：HPOST 南投縣中寮鄉 LEFT3=南投縣 無對應 → 0，JS=PG', async (ctx) => {
    ensurePg(ctx);
    const L = 'L_CT3';
    await seedColumn('M', 'HPOST_NUM_NM', MatchType.CATEGORY);
    await seedCatScore('M', 'HPOST_NUM_NM', '臺北市', 10);
    await seedCase({ applNo: 'CT3', custoNo: 'CT3', listNo: L });
    await seedCustomerCore({ sourceCustomerNo: 'CT3', hpostCity: '南投縣中寮鄉' });
    await assertEq('M', 'CT3', L, mkCc('CT3', '南投縣中寮鄉', null, null), null);
    expect(await getScore('CT3', L)).toBe(0);
  });

  it('CITY-009：M 卡三縣市欄全有值各命中，JS=PG', async (ctx) => {
    ensurePg(ctx);
    const L = 'L_CT9';
    await seedMCityCard();
    await seedCase({ applNo: 'CT9', custoNo: 'CT9', listNo: L });
    await seedCustomerCore({ sourceCustomerNo: 'CT9', hpostCity: '臺北市信義區', cpostCity: '臺南市東區', coCity: '高雄市三民區' });
    await assertEq('M', 'CT9', L, mkCc('CT9', '臺北市信義區', '臺南市東區', '高雄市三民區'), null);
    expect(await getScore('CT9', L)).toBe(60); // 10+20+30
  });

  it('CITY-010：M 卡三縣市欄全缺值走 default 命中，JS=PG', async (ctx) => {
    ensurePg(ctx);
    const L = 'L_CT10';
    await seedMCityCard();
    await seedCase({ applNo: 'CT10', custoNo: 'C_NONE10', listNo: L });
    // 不 seed customer_core → cc NULL → 三欄走 M default 臺北市/臺南市/高雄市
    await assertEq('M', 'CT10', L, null, null);
    expect(await getScore('CT10', L)).toBe(60);
  });
});

// ===========================================================================
// PCD — LIST_MONTH / LOAN_RATE per-card default EQ
// ===========================================================================
describe('F104 PCD — LIST_MONTH / LOAN_RATE per-card default（EQ）', () => {
  it('PCD-007：LIST_MONTH H→25 / E→12 default，JS=PG', async (ctx) => {
    ensurePg(ctx);
    const LH = 'L_PCDH';
    const LE = 'L_PCDE';
    await seedColumn('H', 'LIST_MONTH', MatchType.RANGE);
    await seedRangeScore('H', 'LIST_MONTH', '25', '25', 9);
    await seedColumn('E', 'LIST_MONTH', MatchType.RANGE);
    await seedRangeScore('E', 'LIST_MONTH', '12', '12', 7);
    await seedCase({ applNo: 'PCDH', listNo: LH, monthCnt: null });
    await seedCase({ applNo: 'PCDE', listNo: LE, monthCnt: null });
    await assertEq('H', 'PCDH', LH, null, null);
    await assertEq('E', 'PCDE', LE, null, null);
    expect(await getScore('PCDH', LH)).toBe(9); // default 25
    expect(await getScore('PCDE', LE)).toBe(7); // default 12
  });

  it('PCD-008：LOAN_RATE S5→77 / E→12 default，JS=PG', async (ctx) => {
    ensurePg(ctx);
    const L5 = 'L_LR5';
    const LE = 'L_LRE';
    await seedColumn('S5', 'LOAN_RATE', MatchType.RANGE);
    await seedRangeScore('S5', 'LOAN_RATE', '77', '77', 8);
    await seedColumn('E', 'LOAN_RATE', MatchType.RANGE);
    await seedRangeScore('E', 'LOAN_RATE', '12', '12', 6);
    await seedCase({ applNo: 'LR5', listNo: L5, loanRate: null });
    await seedCase({ applNo: 'LRE', listNo: LE, loanRate: null });
    await assertEq('S5', 'LR5', L5, null, null);
    await assertEq('E', 'LRE', LE, null, null);
    expect(await getScore('LR5', L5)).toBe(8); // default 77
    expect(await getScore('LRE', LE)).toBe(6); // default 12
  });
});

// ===========================================================================
// EQ — 綜合大場景（§8 矩陣對位）
// ===========================================================================
describe('F104 EQ — 綜合大場景（DoD 核心，JS=PG 誤差 0）', () => {
  it('EQ-012：S5 卡多欄交互（age/educat 08/loan_rate 77/co_num 金門縣 default + 有值混合）', async (ctx) => {
    ensurePg(ctx);
    const L = 'L_EQ12';
    // S5 啟用集（§13）：AGE/CAREA_NO1/CAREA_NO2/CAR_YEAR/EDUCAT_BACK/LOAN_RATE/CO_NUM_NM/HPOST_NUM_NM。
    await seedColumn('S5', 'AGE', MatchType.RANGE);
    await seedColumn('S5', 'CAREA_NO1', MatchType.RANGE);
    await seedColumn('S5', 'EDUCAT_BACK', MatchType.RANGE);
    await seedColumn('S5', 'LOAN_RATE', MatchType.RANGE);
    await seedColumn('S5', 'CO_NUM_NM', MatchType.CATEGORY);
    await seedColumn('S5', 'HPOST_NUM_NM', MatchType.CATEGORY);
    await seedRangeScore('S5', 'AGE', '30', '40', 5);
    await seedRangeScore('S5', 'CAREA_NO1', '1', '1', 4);
    await seedRangeScore('S5', 'EDUCAT_BACK', '08', '99', 6); // default '08' 命中
    await seedRangeScore('S5', 'LOAN_RATE', '77', '77', 8); // default 77 命中
    await seedCatScore('S5', 'CO_NUM_NM', '金門縣', 9); // default 金門縣 命中
    await seedCatScore('S5', 'HPOST_NUM_NM', '臺北市', 3); // 有值 臺北市 命中
    await seedCase({ applNo: 'EQ12', custoNo: 'EQ12', listNo: L, loanRate: null }); // loan_rate 缺 → default 77
    await seedCustomerCore({
      sourceCustomerNo: 'EQ12', cusSex: '1', careaNo1: '02',
      dateOfBirth: dobForAge(36), educationCode: null, // educat 缺 → default '08'
      hpostCity: '臺北市中正區', coCity: null, // co 缺 → default 金門縣
    });
    const cc: CustomerCoreRow = {
      source_customer_no: 'EQ12', cus_sex: '1', date_of_birth: dobForAge(36), education_code: null,
      hpost_city: '臺北市中正區', cpost_city: null, co_city: null, carea_no1: '02', carea_no2: null, cellular: null,
    };
    const score = await assertEq('S5', 'EQ12', L, cc, null);
    // AGE 36∈[30,40]→5 + CAREA1 1→4 + EDUCAT '08'→6 + LOAN_RATE 77→8 + CO_NUM 金門縣→9 + HPOST 臺北市→3 = 35
    expect(score).toBe(35);
  });
});
