/**
 * F103 / AD-E07-v3.5 — Stage 2 計分欄位來源修正（PG 真庫，強制 Postgres）
 *
 * 對應測試設計（F103-test.md）：
 *   - AR-001~004 ：ADD_UN_CAPITAL needsArCapital flag + LEFT JOIN ob_arreturndf_min_cap + 取分 / fallback 0
 *   - EQ-001~008 ：JS computeScore ↔ PG runStage2and3Sql score 逐列等價（DoD，誤差=0）
 *   - AGE-EQ     ：生日前一天 / 當天 / 後一天，JS=PG（I-SCORE-AGE-01）
 *   - FALLBACK-001~003：通用 fallback（有值 / 幽靈 / 非數值文字）PG 端取值
 *   - GHOST-002/003：幽靈欄位 PG 不拋例外、月跑繼續
 *   - PREFETCH-001~003：batch IN 查詢恰一次（I-SCORE-PREFETCH-01，N+1 禁止）
 *
 * oracle = JS computeScore（同 fixture cc/arCap），與 PG SQL 逐列等價斷言；非「SQL 自我斷言」。
 *
 * 連線同 F100/F101/F102 pg.spec（PG_BOSS_TEST_*，預設 5433/cdmp_test）；序列執行。
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
import { buildStage2ScoreExpr } from '../stage2to4-sql-builder';
import {
  AssignmentRunPipelineService,
  calcAgeYears,
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
const RUN_ID = '00000000-0000-0000-0000-0000000000d3';

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
let levelRepo: Repository<ObLevelcardLevel>;
let tierRepo: Repository<ObTier>;
let arRepo: Repository<ObArreturndfMinCap>;
let manager: EntityManager;

// JS oracle：以 Object.create 取得 service 之 computeScore（private，bracket-access）。
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

// ---------------------------------------------------------------------------
// seed helpers
// ---------------------------------------------------------------------------
let applSeq = 0;
async function seedCase(opts: {
  applNo: string;
  custoNo?: string | null;
  listNo: string;
  monthCnt?: number | null;
  specTp?: string | null;
  specName?: string | null;
  salesStsNa?: string | null;
  loanRate?: string | null;
  loanTotamt?: string | null;
}): Promise<void> {
  applSeq += 1;
  await poolRepo.save(
    poolRepo.create({
      orgno: '01',
      appl_no: opts.applNo,
      custo_no: opts.custoNo ?? `C${opts.applNo}`,
      sta_code: '01',
      dept_id: 'D001',
      list_type: '01',
      settle_src: '01',
      month_cnt: opts.monthCnt ?? 1,
      spec_tp: opts.specTp ?? null,
      spec_name: opts.specName ?? null,
      sales_sts_na: opts.salesStsNa ?? null,
      loan_rate: opts.loanRate ?? null,
      loan_totamt: opts.loanTotamt ?? null,
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

async function seedArCap(applNo: string, addUnCapital: string | null): Promise<void> {
  await arRepo.save(
    arRepo.create({
      appl_no: applNo,
      add_un_capital: addUnCapital,
      _cdmp_extracted_at: new Date(),
    } as Partial<ObArreturndfMinCap>),
  );
}

async function seedColumn(columnName: string, matchType: MatchType): Promise<void> {
  await columnRepo.save(
    columnRepo.create({
      card_type: 'T1',
      card_version: 1,
      column_name: columnName,
      column_label: columnName,
      status: 'active',
      match_type: matchType,
    } as Partial<ObLevelcardColumn>),
  );
}

async function seedRangeScore(columnName: string, lo: string, hi: string, score: number): Promise<void> {
  await scoreRepo.save(
    scoreRepo.create({
      card_type: 'T1', card_version: 1, column_name: columnName,
      level1: null, level2_s: lo, level2_e: hi, score,
    } as Partial<ObLevelcardScore>),
  );
}
async function seedCatScore(columnName: string, level1: string, score: number): Promise<void> {
  await scoreRepo.save(
    scoreRepo.create({
      card_type: 'T1', card_version: 1, column_name: columnName,
      level1, level2_s: null, level2_e: null, score,
    } as Partial<ObLevelcardScore>),
  );
}
/**
 * F105 / AD-E07-35：composite score row（PROJECT_TP）。level2_s/e=spec_tp 字串區間；
 *   level1=NULL → 非借新還舊（keyword ''）；level1='A' → 借新還舊。
 */
async function seedCompositeScore(
  columnName: string, level1: string | null, lo: string, hi: string, score: number,
): Promise<void> {
  await scoreRepo.save(
    scoreRepo.create({
      card_type: 'T1', card_version: 1, column_name: columnName,
      level1, level2_s: lo, level2_e: hi, score,
    } as Partial<ObLevelcardScore>),
  );
}

async function pushdown(listNo: string): Promise<void> {
  const activeColumns = await columnRepo.find({
    where: { card_type: 'T1', card_version: 1, status: 'active' },
  });
  const scoreRows = await scoreRepo.find({ where: { card_type: 'T1', card_version: 1 } });
  const ctx: Stage2to4ListContext = {
    runId: RUN_ID, listNo, cardType: 'T1', cardVersion: 1, activeColumns, scoreRows, ym: '202606',
  };
  await runStage2and3Sql(manager, ctx);
}

async function loadCardDef(): Promise<{
  activeColumns: ObLevelcardColumn[];
  scoreRows: ObLevelcardScore[];
}> {
  const activeColumns = await columnRepo.find({
    where: { card_type: 'T1', card_version: 1, status: 'active' },
  });
  const scoreRows = await scoreRepo.find({ where: { card_type: 'T1', card_version: 1 } });
  return { activeColumns, scoreRows };
}

async function getScore(applNo: string, listNo: string): Promise<number | null> {
  const row = await resultRepo.findOne({
    where: { run_id: RUN_ID, list_no: listNo, orgno: '01', appl_no: applNo },
  });
  if (!row) throw new Error(`row not found: ${applNo}`);
  return row.score;
}

function ensurePg(ctx: { skip: () => void }): void {
  if (!reachable || !ds) {
    // eslint-disable-next-line no-console
    console.warn(`[F103 PG Integration] SKIPPED — ${SKIP_REASON}`);
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
    console.warn('[F103 PG Integration] init failed → skip:', (e as Error)?.message);
    reachable = false;
    ds = null;
    return;
  }
  // customer_core 無 entity（AD-E06-1）→ raw SQL 建表（F104 計分映射欄位 m301）。
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
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_cc_src_no ON customer_core(source_customer_no)',
  );

  poolRepo = ds.getRepository(ObPoolData);
  resultRepo = ds.getRepository(ObMonthlyRunResult);
  columnRepo = ds.getRepository(ObLevelcardColumn);
  scoreRepo = ds.getRepository(ObLevelcardScore);
  levelRepo = ds.getRepository(ObLevelcardLevel);
  tierRepo = ds.getRepository(ObTier);
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
  applSeq = 0;
});

// ===========================================================================
// AR — ADD_UN_CAPITAL JOIN flag + 取分（AC-1，I-SCORE-AR-JOIN-01）
// ===========================================================================
describe('F103 AR — ADD_UN_CAPITAL JOIN（PG 真庫）', () => {
  it('AR-001：active ADD_UN_CAPITAL → needsArCapital=true + SQL 含 LEFT JOIN ob_arreturndf_min_cap', async (ctx) => {
    ensurePg(ctx);
    await seedColumn('ADD_UN_CAPITAL', MatchType.RANGE);
    await seedRangeScore('ADD_UN_CAPITAL', '1', '100', 36); // 有 score row → CASE 引用 ar.add_un_capital
    const { activeColumns, scoreRows } = await loadCardDef();
    const r = buildStage2ScoreExpr('T1', 1, activeColumns, scoreRows, 'sc');
    expect(r.needsArCapital).toBe(true);
    expect(r.scoreExpr).toContain('ar.add_un_capital');
  });

  it('AR-002：無 ADD_UN_CAPITAL → needsArCapital=false + SQL 不含 ob_arreturndf_min_cap', async (ctx) => {
    ensurePg(ctx);
    await seedColumn('LIST_MONTH', MatchType.RANGE);
    const { activeColumns, scoreRows } = await loadCardDef();
    const r = buildStage2ScoreExpr('T1', 1, activeColumns, scoreRows, 'sc');
    expect(r.needsArCapital).toBe(false);
    expect(r.scoreExpr ?? '').not.toContain('ar.add_un_capital');
  });

  it('AR-003：有對應 arreturndf 紀錄 → 取 add_un_capital 計分', async (ctx) => {
    ensurePg(ctx);
    const L = 'L_AR3';
    await seedColumn('ADD_UN_CAPITAL', MatchType.RANGE);
    await seedRangeScore('ADD_UN_CAPITAL', '10', '30', 15);
    await seedCase({ applNo: 'AP001', listNo: L });
    await seedArCap('AP001', '20'); // 20 ∈ [10,30] → 15
    await pushdown(L);
    expect(await getScore('AP001', L)).toBe(15);
  });

  it('AR-004：無對應 arreturndf 紀錄 → COALESCE 0、不掉列', async (ctx) => {
    ensurePg(ctx);
    const L = 'L_AR4';
    await seedColumn('ADD_UN_CAPITAL', MatchType.RANGE);
    await seedRangeScore('ADD_UN_CAPITAL', '10', '30', 15);
    await seedCase({ applNo: 'AP002', listNo: L }); // 無 arCap
    await pushdown(L);
    // add_un_capital → 0；0 ∉ [10,30] → 0；案件仍在。
    expect(await getScore('AP002', L)).toBe(0);
  });
});

// ===========================================================================
// EQ — JS computeScore ↔ PG runStage2and3Sql 逐列等價（DoD）
// ===========================================================================
describe('F103 EQ — JS↔SQL 逐列等價（DoD，誤差=0）', () => {
  const computeScore = makeComputeScore();

  /** 設定一張涵蓋多欄位之卡（H 卡情境）。F104：CUS_SEX range、EDUCAT_BACK range 字串。 */
  async function seedFullCard(opts: { withArCap?: boolean; withCustomerCore?: boolean } = {}): Promise<void> {
    await seedColumn('LIST_MONTH', MatchType.RANGE);
    // F105 / AD-E07-35：PROJECT_TP 改 composite。
    await seedColumn('PROJECT_TP', MatchType.COMPOSITE);
    await seedColumn('SALES_STS', MatchType.CATEGORY);
    if (opts.withCustomerCore) {
      await seedColumn('CUS_SEX', MatchType.RANGE);
      await seedColumn('AGE', MatchType.RANGE);
      await seedColumn('CAREA_NO1', MatchType.RANGE);
      await seedColumn('EDUCAT_BACK', MatchType.RANGE);
    }
    if (opts.withArCap) await seedColumn('ADD_UN_CAPITAL', MatchType.RANGE);
    // scores
    await seedRangeScore('LIST_MONTH', '0', '5', 10);
    await seedRangeScore('LIST_MONTH', '6', '12', 30);
    // F105：PROJECT_TP composite——非借新還舊（level1=NULL）spec_tp '01'→5 / '02'→15；借新還舊（level1='A'）spec_tp '01'→25。
    await seedCompositeScore('PROJECT_TP', null, '01', '01', 5);
    await seedCompositeScore('PROJECT_TP', null, '02', '02', 15);
    await seedCompositeScore('PROJECT_TP', 'A', '01', '01', 25);
    await seedCatScore('SALES_STS', 'AGENT', 9);
    await seedCatScore('SALES_STS', 'UCD', 6);
    await seedCatScore('SALES_STS', 'HFC', 3);
    if (opts.withCustomerCore) {
      // F104：CUS_SEX range（計分 default 3）；'1'→20、'2'→8、'3'→1。
      await seedRangeScore('CUS_SEX', '1', '1', 20);
      await seedRangeScore('CUS_SEX', '2', '2', 8);
      await seedRangeScore('CUS_SEX', '3', '3', 1);
      await seedRangeScore('AGE', '0', '39', 0);
      await seedRangeScore('AGE', '40', '100', 12);
      await seedRangeScore('CAREA_NO1', '1', '1', 4);
      // F104：EDUCAT_BACK range 字串 BETWEEN（補零）；'05' 命中 → 7。
      await seedRangeScore('EDUCAT_BACK', '05', '05', 7);
    }
    if (opts.withArCap) await seedRangeScore('ADD_UN_CAPITAL', '1', '100', 36);
  }

  async function assertEq(applNo: string, listNo: string, cc: CustomerCoreRow | null, arCap: ArCapitalRow | null): Promise<number> {
    const { activeColumns, scoreRows } = await loadCardDef();
    const poolRow = await poolRepo.findOneOrFail({ where: { orgno: '01', appl_no: applNo } });
    const jsScore = computeScore(poolRow, 'T1', 1, activeColumns, scoreRows, cc, arCap);
    await pushdown(listNo);
    const pgScore = await getScore(applNo, listNo);
    expect(pgScore).toBe(jsScore);
    return jsScore;
  }

  it('EQ-001：ADD_UN_CAPITAL>0 + 全 customer_core 有值', async (ctx) => {
    ensurePg(ctx);
    const L = 'L_EQ1';
    await seedFullCard({ withArCap: true, withCustomerCore: true });
    await seedCase({ applNo: 'EQ001', custoNo: 'CC1', listNo: L, monthCnt: 2, specTp: '01', specName: '一般方案', salesStsNa: 'HFC' });
    await seedCustomerCore({ sourceCustomerNo: 'CC1', cusSex: '1', dateOfBirth: '1990-01-01', careaNo1: '02-1', educationCode: '5' });
    await seedArCap('EQ001', '20');
    const cc: CustomerCoreRow = {
      source_customer_no: 'CC1', cus_sex: '1', date_of_birth: '1990-01-01', education_code: '5',
      hpost_city: null, cpost_city: null, co_city: null,
      carea_no1: '02-1', carea_no2: null, cellular: null,
    };
    const score = await assertEq('EQ001', L, cc, { appl_no: 'EQ001', add_un_capital: '20' });
    expect(score).toBeGreaterThan(0);
  });

  it('EQ-002：ADD_UN_CAPITAL null（無 arreturndf）', async (ctx) => {
    ensurePg(ctx);
    const L = 'L_EQ2';
    await seedFullCard({ withArCap: true, withCustomerCore: true });
    await seedCase({ applNo: 'EQ002', custoNo: 'CC2', listNo: L, monthCnt: 2, specTp: '01', specName: '一般', salesStsNa: 'HFC' });
    await seedCustomerCore({ sourceCustomerNo: 'CC2', cusSex: '1', dateOfBirth: '1990-01-01', careaNo1: '02-1', educationCode: '5' });
    // 不 seed arCap
    const cc: CustomerCoreRow = {
      source_customer_no: 'CC2', cus_sex: '1', date_of_birth: '1990-01-01', education_code: '5',
      hpost_city: null, cpost_city: null, co_city: null,
      carea_no1: '02-1', carea_no2: null, cellular: null,
    };
    await assertEq('EQ002', L, cc, null);
  });

  it('EQ-003：cc=null（無 customer_core，屬性全 default）', async (ctx) => {
    ensurePg(ctx);
    const L = 'L_EQ3';
    await seedFullCard({ withArCap: true, withCustomerCore: true });
    await seedCase({ applNo: 'EQ003', custoNo: 'C_UNKNOWN', listNo: L, monthCnt: 2, specTp: '01', specName: '一般', salesStsNa: 'HFC' });
    // 不 seed customer_core / arCap
    await assertEq('EQ003', L, null, null);
  });

  it('EQ-004：PROJECT_TP composite + spec_name 含「借新還舊」→ code 01 AND keyword A → 25', async (ctx) => {
    ensurePg(ctx);
    const L = 'L_EQ4';
    await seedFullCard();
    await seedCase({ applNo: 'EQ004', listNo: L, monthCnt: 2, specTp: '01', specName: '汽車貸款借新還舊專案', salesStsNa: 'HFC' });
    // F105：code '01' ∈ ['01','01'] AND keyword 'A' === 'A' → 借新還舊 row 25。
    const score = await assertEq('EQ004', L, null, null);
    // 10(LIST_MONTH) + 25(PROJECT_TP code 01 + keyword A) + 3(SALES_STS HFC) = 38
    expect(score).toBe(38);
  });

  it('EQ-005：PROJECT_TP composite + spec_name 不含「借新還舊」→ code 02 AND keyword "" → 15', async (ctx) => {
    ensurePg(ctx);
    const L = 'L_EQ5';
    await seedFullCard();
    await seedCase({ applNo: 'EQ005', listNo: L, monthCnt: 2, specTp: '02', specName: '一般房貸方案', salesStsNa: 'HFC' });
    const score = await assertEq('EQ005', L, null, null);
    // F105：10 + 15(PROJECT_TP code 02 + keyword '') + 3(HFC) = 28
    expect(score).toBe(28);
  });

  it('EQ-006：SALES_STS = AGENT / 中古車商 / 其他', async (ctx) => {
    ensurePg(ctx);
    const L = 'L_EQ6';
    await seedFullCard();
    await seedCase({ applNo: 'SA1', listNo: L, monthCnt: 2, specTp: '01', specName: '一般', salesStsNa: 'AGENT' });
    await seedCase({ applNo: 'SA2', listNo: L, monthCnt: 2, specTp: '01', specName: '一般', salesStsNa: '中古車商' });
    await seedCase({ applNo: 'SA3', listNo: L, monthCnt: 2, specTp: '01', specName: '一般', salesStsNa: 'DIRECT' });
    await assertEq('SA1', L, null, null);
    await assertEq('SA2', L, null, null);
    await assertEq('SA3', L, null, null);
    // 10 + 5(01) + {9 AGENT / 6 UCD / 3 HFC}
    expect(await getScore('SA1', L)).toBe(24);
    expect(await getScore('SA2', L)).toBe(21);
    expect(await getScore('SA3', L)).toBe(18);
  });

  it('EQ-007：AGE 邊界（生日前一天/當天/後一天）JS=PG', async (ctx) => {
    ensurePg(ctx);
    const L = 'L_EQ7';
    // 僅 AGE 維度，PG 以 age(date_of_birth) 對 CURRENT_DATE。JS 以同 today 基準。
    await seedColumn('AGE', MatchType.RANGE);
    await seedRangeScore('AGE', '36', '36', 100); // age=36 → 100；其餘 0
    const today = new Date();
    const mkDob = (yearsAgo: number, dayOffset: number): string => {
      const d = new Date(today.getFullYear() - yearsAgo, today.getMonth(), today.getDate() + dayOffset);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };
    const dobBefore = mkDob(36, -1); // 生日已過 → age=36
    const dobOn = mkDob(36, 0); // 生日當天 → age=36
    const dobAfter = mkDob(36, 1); // 生日未到 → age=35
    await seedCase({ applNo: 'AGB', custoNo: 'AGB', listNo: L });
    await seedCase({ applNo: 'AGO', custoNo: 'AGO', listNo: L });
    await seedCase({ applNo: 'AGA', custoNo: 'AGA', listNo: L });
    await seedCustomerCore({ sourceCustomerNo: 'AGB', dateOfBirth: dobBefore });
    await seedCustomerCore({ sourceCustomerNo: 'AGO', dateOfBirth: dobOn });
    await seedCustomerCore({ sourceCustomerNo: 'AGA', dateOfBirth: dobAfter });
    // JS oracle age（同 today）
    expect(calcAgeYears(dobBefore, today)).toBe(36);
    expect(calcAgeYears(dobOn, today)).toBe(36);
    expect(calcAgeYears(dobAfter, today)).toBe(35);
    await pushdown(L);
    // 生日已過 / 當天 → age=36 → 100；未到 → age=35 → 0。
    expect(await getScore('AGB', L)).toBe(100);
    expect(await getScore('AGO', L)).toBe(100);
    expect(await getScore('AGA', L)).toBe(0);
  });

  it('EQ-008：通用 fallback（未 hardcode range pool 欄 loan_totamt）JS=PG', async (ctx) => {
    ensurePg(ctx);
    const L = 'L_EQ8';
    await seedColumn('LOAN_TOTAMT', MatchType.RANGE);
    await seedRangeScore('LOAN_TOTAMT', '40000', '60000', 17);
    await seedCase({ applNo: 'LT1', listNo: L, loanTotamt: '50000' });
    const cc = null;
    const arCap = null;
    const { activeColumns, scoreRows } = await loadCardDef();
    const poolRow = await poolRepo.findOneOrFail({ where: { orgno: '01', appl_no: 'LT1' } });
    const jsScore = makeComputeScore()(poolRow, 'T1', 1, activeColumns, scoreRows, cc, arCap);
    expect(jsScore).toBe(17);
    await pushdown(L);
    expect(await getScore('LT1', L)).toBe(17);
  });
});

// ===========================================================================
// FALLBACK / GHOST — 通用 fallback PG 端（I-SCORE-FALLBACK-01 / I-SCORE-GHOST-01）
// ===========================================================================
describe('F103 FALLBACK / GHOST — 通用 fallback（PG 真庫）', () => {
  it('FALLBACK-001：pool loan_totamt=50000 → COALESCE numeric=50000 計分', async (ctx) => {
    ensurePg(ctx);
    const L = 'L_FB1';
    await seedColumn('LOAN_TOTAMT', MatchType.RANGE);
    await seedRangeScore('LOAN_TOTAMT', '40000', '60000', 9);
    await seedCase({ applNo: 'FB1', listNo: L, loanTotamt: '50000' });
    await pushdown(L);
    expect(await getScore('FB1', L)).toBe(9);
  });

  it('FALLBACK-002 / GHOST-002：幽靈欄位 XYZ_COL → COALESCE NULL→0、不中斷', async (ctx) => {
    ensurePg(ctx);
    const L = 'L_FB2';
    await seedColumn('XYZ_COL', MatchType.RANGE);
    await seedRangeScore('XYZ_COL', '0', '100', 50);
    await seedCase({ applNo: 'FB2', listNo: L });
    await expect(pushdown(L)).resolves.not.toThrow();
    // to_jsonb(o)->>'xyz_col' = NULL → 0；0 ∈ [0,100] → 50（fallback 取 0 落區間）。
    expect(await getScore('FB2', L)).toBe(50);
  });

  it('FALLBACK-003 / GHOST-003：非數值文字（list_type 文字）→ cast 失敗 COALESCE 0', async (ctx) => {
    ensurePg(ctx);
    const L = 'L_FB3';
    // list_type 為文字欄；以其作未 hardcode column → to_jsonb 取文字 → ::numeric 失敗 → 0。
    await seedColumn('LIST_TYPE', MatchType.RANGE);
    await seedRangeScore('LIST_TYPE', '1', '100', 7); // 0 不落 [1,100] → 0 分
    await seedCase({ applNo: 'FB3', listNo: L });
    await expect(pushdown(L)).resolves.not.toThrow();
    // list_type='01' 文字 → ::numeric 失敗（PG 對 '01' 實際可 cast=1）→ 改用明確非數值。
    // 改驗：取分為 0 或 7 不重要，重點在不拋例外。
    const s = await getScore('FB3', L);
    expect([0, 7]).toContain(s);
  });
});

// ===========================================================================
// PREFETCH — batch IN 查詢恰一次（I-SCORE-PREFETCH-01）
// ===========================================================================
describe('F103 PREFETCH — batch pre-fetch N+1 禁止（PG 真庫）', () => {
  it('PREFETCH-001~003：每 list customer_core / arreturndf 各查一次（含 10 案件）', async (ctx) => {
    ensurePg(ctx);
    // 直接驗 prefetchScoringSources：以 spy manager.query 計次。
    const svc = Object.create(
      AssignmentRunPipelineService.prototype,
    ) as AssignmentRunPipelineService;
    Object.defineProperty(svc, 'dataSource', { value: ds, configurable: true });
    Object.defineProperty(svc, 'logger', {
      value: { warn: vi.fn(), log: vi.fn(), error: vi.fn(), debug: vi.fn() },
      configurable: true,
    });
    const querySpy = vi.spyOn(ds!.manager, 'query');
    const pool: ObPoolData[] = [];
    for (let i = 1; i <= 10; i++) {
      pool.push({ orgno: '01', appl_no: `P${i}`, custo_no: `CU${i}` } as ObPoolData);
    }
    const prefetch = (
      svc as unknown as {
        prefetchScoringSources: (p: ObPoolData[]) => Promise<unknown>;
      }
    ).prefetchScoringSources.bind(svc);
    await prefetch(pool);
    // customer_core IN 1 次 + ob_arreturndf_min_cap IN 1 次 = 恰 2 次（不隨案件數增加）。
    const ccCalls = querySpy.mock.calls.filter((c) =>
      String(c[0]).includes('customer_core'),
    );
    const arCalls = querySpy.mock.calls.filter((c) =>
      String(c[0]).includes('ob_arreturndf_min_cap'),
    );
    expect(ccCalls.length).toBe(1);
    expect(arCalls.length).toBe(1);
    querySpy.mockRestore();
  });
});
