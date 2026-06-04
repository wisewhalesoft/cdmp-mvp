/**
 * F100 / AD-E07-28 P3 — Stage 2~4 SQL 下推 + v2 真實計分引擎（PG 真庫，強制 Postgres）
 *
 * 對應測試設計（F100-test.md）：
 *   - SCORE-001~007：Stage 2 SUM(CASE…) 區間 / 類別 / 邊界 / disabled / NULL vs 0
 *   - CJOIN-001~004：LEFT JOIN customer_core 補計分（match / 無 match / 純 pool / 混合）
 *   - LEVTIER-001~005：score → card_level → tier_level NULL fallback 分歧
 *   - CR-001~005：Stage 3 EXISTS 動態回分（cr_enabled 開/關；未成交語意）
 *   - EXCH-001~008：Stage 4 st4_exchange 視窗函式（CEIL / 保底 1 / partition / deterministic）
 *   - EQ-001~008：SQL 版逐列輸出 == 升級後手算預期（P3 DoD，AC-8）
 *   - RUNEST-001：estimate 路徑不含 Stage 2~4 計分 join（I-RUN-EST-01 延續）
 *
 * oracle = 手算預期（非跑 v1 JS）：以確定性 seed 之計分卡規則 + customer_core 屬性手算 score/level/tier。
 *
 * 連線：env PG_BOSS_TEST_*，預設對 docker-compose.test.yml 之 postgres-test（5433/cdmp_test）。
 * 不可達 → 整 describe skip-with-reason（不假綠）。啟動：
 *   docker compose -f docker-compose.test.yml up -d postgres-test
 *
 * ⚠️ 強制 PG（RISK-F100-007）：視窗函式 / SUM(CASE…) / customer_core LEFT JOIN / EXISTS 在 SQLite
 *    不具代表性且不支援。customer_core 無 entity（AD-E06-1）→ 以 raw SQL 建表 + LEFT JOIN。
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

import { ObListDefinition } from '@/database/entities/ob-list-definition.entity';
import { ObPoolData } from '@/database/entities/ob-pool-data.entity';
import { ObMonthlyRunResult } from '@/database/entities/ob-monthly-run-result.entity';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { AssignmentRunSnapshot } from '@/database/entities/assignment-run-snapshot.entity';
import { ObLevelcardVersion } from '@/database/entities/ob-levelcard-version.entity';
import { ObLevelcardColumn } from '@/database/entities/ob-levelcard-column.entity';
import { ObLevelcardScore } from '@/database/entities/ob-levelcard-score.entity';
import { ObLevelcardLevel } from '@/database/entities/ob-levelcard-level.entity';
import { ObTier } from '@/database/entities/ob-tier.entity';
import {
  runStage2to4Sql,
  runStage2and3Sql,
  type Stage2to4ListContext,
} from '../stage2to4-sql-executor';
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

const RUN_ID = '00000000-0000-0000-0000-0000000000c0';
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
let versionRepo: Repository<ObLevelcardVersion>;
let columnRepo: Repository<ObLevelcardColumn>;
let scoreRepo: Repository<ObLevelcardScore>;
let levelRepo: Repository<ObLevelcardLevel>;
let tierRepo: Repository<ObTier>;
let snapshotRepo: Repository<AssignmentRunSnapshot>;
let manager: EntityManager;

// ---------------------------------------------------------------------------
// seed helpers
// ---------------------------------------------------------------------------

let applSeq = 0;
async function seedResultRow(opts: {
  applNo: string;
  custoNo?: string | null;
  listNo: string;
  runId?: string;
}): Promise<void> {
  applSeq += 1;
  await resultRepo.save(
    resultRepo.create({
      run_id: opts.runId ?? RUN_ID,
      list_no: opts.listNo,
      orgno: '01',
      appl_no: opts.applNo,
      custo_no: opts.custoNo ?? `C${String(applSeq).padStart(6, '0')}`,
      settle_src: '01',
      result_status: 'PENDING',
      created_at: new Date(),
      updated_at: new Date(),
    } as Partial<ObMonthlyRunResult>),
  );
}

async function seedPool(opts: {
  applNo: string;
  custoNo?: string | null;
  monthCnt?: number | null;
  specTp?: string | null;
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
      month_cnt: opts.monthCnt ?? 1,
      spec_tp: opts.specTp ?? null,
      _cdmp_extracted_at: new Date(),
    } as Partial<ObPoolData>),
  );
}

/** seed pool + result（同案件，Stage 1 已寫入 result）。 */
async function seedCase(opts: {
  applNo: string;
  custoNo?: string | null;
  listNo: string;
  monthCnt?: number | null;
  specTp?: string | null;
}): Promise<void> {
  await seedPool(opts);
  await seedResultRow({
    applNo: opts.applNo,
    custoNo: opts.custoNo,
    listNo: opts.listNo,
  });
}

async function seedCustomerCore(opts: {
  sourceCustomerNo: string;
  gender?: string | null;
  dateOfBirth?: string | null;
  educationCode?: string | null;
}): Promise<void> {
  await ds!.query(
    `INSERT INTO customer_core
       (source_customer_no, customer_type, name, gender, date_of_birth, education_code, data_source, _etl_loaded_at, _etl_pipeline_id)
     VALUES ($1, '01', 'T', $2, $3, $4, 'test', now(), '00000000-0000-0000-0000-000000000099')`,
    [
      opts.sourceCustomerNo,
      opts.gender ?? null,
      opts.dateOfBirth ?? null,
      opts.educationCode ?? null,
    ],
  );
}

async function seedVersion(cardType: string, cardVersion: number): Promise<void> {
  await versionRepo.save(
    versionRepo.create({
      card_type: cardType,
      card_name: cardType,
      card_version: cardVersion,
      sdate: '20250101',
      edate: '20991231',
      status: 'active',
    } as Partial<ObLevelcardVersion>),
  );
}

async function seedColumn(opts: {
  cardType: string;
  cardVersion: number;
  columnName: string;
  status?: string;
  matchType?: MatchType;
}): Promise<void> {
  await columnRepo.save(
    columnRepo.create({
      card_type: opts.cardType,
      card_version: opts.cardVersion,
      column_name: opts.columnName,
      column_label: opts.columnName,
      status: opts.status ?? 'active',
      match_type: opts.matchType ?? MatchType.RANGE,
    } as Partial<ObLevelcardColumn>),
  );
}

async function seedScore(opts: {
  cardType: string;
  cardVersion: number;
  columnName: string;
  level1?: string | null;
  level2S?: string | null;
  level2E?: string | null;
  score: number;
}): Promise<void> {
  await scoreRepo.save(
    scoreRepo.create({
      card_type: opts.cardType,
      card_version: opts.cardVersion,
      column_name: opts.columnName,
      level1: opts.level1 ?? null,
      level2_s: opts.level2S ?? null,
      level2_e: opts.level2E ?? null,
      score: opts.score,
    } as Partial<ObLevelcardScore>),
  );
}

async function seedLevel(opts: {
  cardType: string;
  cardVersion: number;
  scoreS: number;
  scoreE: number;
  cardLevel: string;
}): Promise<void> {
  await levelRepo.save(
    levelRepo.create({
      card_type: opts.cardType,
      card_version: opts.cardVersion,
      score_s: opts.scoreS,
      score_e: opts.scoreE,
      card_level: opts.cardLevel,
    } as Partial<ObLevelcardLevel>),
  );
}

async function seedTier(opts: {
  cardType: string;
  cardLevel: string | null;
  tierLevel: string;
}): Promise<void> {
  await tierRepo.save(
    tierRepo.create({
      card_type: opts.cardType,
      card_level: opts.cardLevel,
      tier_level: opts.tierLevel,
    } as Partial<ObTier>),
  );
}

/** 標準 T1 計分卡（§一矩陣）：LIST_MONTH 區間 + PROJECT_TP 類別 + CUS_SEX + AGE customer_core。 */
async function seedStandardCardT1(opts: { withCustomerCore?: boolean } = {}): Promise<void> {
  await seedVersion('T1', 1);
  await seedColumn({ cardType: 'T1', cardVersion: 1, columnName: 'LIST_MONTH' });
  await seedColumn({
    cardType: 'T1', cardVersion: 1, columnName: 'PROJECT_TP', matchType: MatchType.CATEGORY,
  });
  if (opts.withCustomerCore) {
    await seedColumn({
      cardType: 'T1', cardVersion: 1, columnName: 'CUS_SEX', matchType: MatchType.CATEGORY,
    });
    await seedColumn({ cardType: 'T1', cardVersion: 1, columnName: 'AGE' });
  }
  // LIST_MONTH 區間：[0,5]→10；[6,12]→30
  await seedScore({ cardType: 'T1', cardVersion: 1, columnName: 'LIST_MONTH', level2S: '0', level2E: '5', score: 10 });
  await seedScore({ cardType: 'T1', cardVersion: 1, columnName: 'LIST_MONTH', level2S: '6', level2E: '12', score: 30 });
  // PROJECT_TP 類別：'01'→5；'02'→15
  await seedScore({ cardType: 'T1', cardVersion: 1, columnName: 'PROJECT_TP', level1: '01', score: 5 });
  await seedScore({ cardType: 'T1', cardVersion: 1, columnName: 'PROJECT_TP', level1: '02', score: 15 });
  if (opts.withCustomerCore) {
    // CUS_SEX 類別：'M'→20；'F'→8
    await seedScore({ cardType: 'T1', cardVersion: 1, columnName: 'CUS_SEX', level1: 'M', score: 20 });
    await seedScore({ cardType: 'T1', cardVersion: 1, columnName: 'CUS_SEX', level1: 'F', score: 8 });
    // AGE 區間：[0,39]→0；[40,100]→12
    await seedScore({ cardType: 'T1', cardVersion: 1, columnName: 'AGE', level2S: '0', level2E: '39', score: 0 });
    await seedScore({ cardType: 'T1', cardVersion: 1, columnName: 'AGE', level2S: '40', level2E: '100', score: 12 });
  }
  // card_level：[0,20]→C；[21,40]→B；[41,100]→A
  await seedLevel({ cardType: 'T1', cardVersion: 1, scoreS: 0, scoreE: 20, cardLevel: 'C' });
  await seedLevel({ cardType: 'T1', cardVersion: 1, scoreS: 21, scoreE: 40, cardLevel: 'B' });
  await seedLevel({ cardType: 'T1', cardVersion: 1, scoreS: 41, scoreE: 100, cardLevel: 'A' });
  // tier：C→T3；B→T2；A→T1；card_level NULL fallback → T3
  await seedTier({ cardType: 'T1', cardLevel: 'C', tierLevel: 'T3' });
  await seedTier({ cardType: 'T1', cardLevel: 'B', tierLevel: 'T2' });
  await seedTier({ cardType: 'T1', cardLevel: 'A', tierLevel: 'T1' });
  await seedTier({ cardType: 'T1', cardLevel: null, tierLevel: 'T3' });
}

/** 跑 Stage 2~4 下推（單一 list ctx）。 */
async function pushdown(ctx: Partial<Stage2to4ListContext> & { listNo: string }): Promise<void> {
  const full: Stage2to4ListContext = {
    runId: RUN_ID,
    cardType: 'T1',
    cardVersion: 1,
    activeColumns: [],
    scoreRows: [],
    crEnabled: false,
    ym: YM,
    deptId: 'D001',
    seniorEmplid: null,
    seniorDeptid: null,
    defaultEmplid: 'E_NEW',
    defaultDeptid: 'D001',
    ...ctx,
  };
  await runStage2to4Sql(manager, full);
}

/** 以 active columns / scores 自 DB 載入並跑 Stage 2~4（標準卡）。 */
async function pushdownStandard(opts: {
  listNo: string;
  crEnabled?: boolean;
  seniorEmplid?: string | null;
  defaultEmplid?: string | null;
}): Promise<void> {
  const activeColumns = await columnRepo.find({
    where: { card_type: 'T1', card_version: 1, status: 'active' },
  });
  const scoreRows = await scoreRepo.find({ where: { card_type: 'T1', card_version: 1 } });
  await pushdown({
    listNo: opts.listNo,
    cardType: 'T1',
    cardVersion: 1,
    activeColumns,
    scoreRows,
    crEnabled: opts.crEnabled ?? false,
    seniorEmplid: opts.seniorEmplid ?? null,
    seniorDeptid: opts.seniorEmplid ? 'D001' : null,
    defaultEmplid: opts.defaultEmplid ?? 'E_NEW',
  });
}

async function getRow(applNo: string, listNo: string): Promise<ObMonthlyRunResult> {
  const row = await resultRepo.findOne({
    where: { run_id: RUN_ID, list_no: listNo, orgno: '01', appl_no: applNo },
  });
  if (!row) throw new Error(`row not found: ${applNo}`);
  return row;
}

function ensurePg(ctx: { skip: () => void }): void {
  if (!reachable || !ds) {
    // eslint-disable-next-line no-console
    console.warn(`[F100 PG Integration] SKIPPED — ${SKIP_REASON}`);
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
        ObListDefinition,
        ObPoolData,
        ObMonthlyRunResult,
        AssignmentRun,
        AssignmentRunSnapshot,
        ObLevelcardVersion,
        ObLevelcardColumn,
        ObLevelcardScore,
        ObLevelcardLevel,
        ObTier,
      ],
      synchronize: true,
    });
    await ds.initialize();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[F100 PG Integration] init failed → skip:', (e as Error)?.message);
    reachable = false;
    ds = null;
    return;
  }
  // customer_core 無 entity（AD-E06-1）→ raw SQL 建表（精簡欄位，含計分映射欄位）。
  await ds.query(`
    CREATE TABLE IF NOT EXISTS customer_core (
      customer_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      source_customer_no VARCHAR(20) NOT NULL,
      customer_type VARCHAR(2) NOT NULL,
      name VARCHAR(100) NOT NULL,
      gender VARCHAR(1),
      date_of_birth DATE,
      education_code VARCHAR(2),
      home_phone VARCHAR(20),
      contact_phone VARCHAR(20),
      mobile_phone VARCHAR(20),
      residential_zip VARCHAR(6),
      mailing_zip VARCHAR(6),
      company_zip VARCHAR(6),
      sales_sts_na VARCHAR(30),
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
  versionRepo = ds.getRepository(ObLevelcardVersion);
  columnRepo = ds.getRepository(ObLevelcardColumn);
  scoreRepo = ds.getRepository(ObLevelcardScore);
  levelRepo = ds.getRepository(ObLevelcardLevel);
  tierRepo = ds.getRepository(ObTier);
  snapshotRepo = ds.getRepository(AssignmentRunSnapshot);
  manager = ds.manager;
}, 60000);

afterAll(async () => {
  if (ds) {
    await ds.query('DROP TABLE IF EXISTS customer_core CASCADE');
    await ds.query('DROP TABLE IF EXISTS ob_monthly_run_result CASCADE');
    await ds.query('DROP TABLE IF EXISTS ob_pool_data CASCADE');
    await ds.query('DROP TABLE IF EXISTS assignment_run_snapshot CASCADE');
    await ds.query('DROP TABLE IF EXISTS assignment_run CASCADE');
    await ds.query('DROP TABLE IF EXISTS ob_list_definition CASCADE');
    await ds.query('DROP TABLE IF EXISTS ob_levelcard_version CASCADE');
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
  await ds.query('DELETE FROM assignment_run_snapshot');
  await ds.query('DELETE FROM ob_pool_data');
  await ds.query('DELETE FROM customer_core');
  await ds.query('DELETE FROM ob_levelcard_score');
  await ds.query('DELETE FROM ob_levelcard_column');
  await ds.query('DELETE FROM ob_levelcard_version');
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
// SCORE — Stage 2 SUM(CASE…) 區間 / 類別計分
// ===========================================================================
describe('F100 SCORE — Stage 2 SUM(CASE…) 計分（PG 真庫）', () => {
  it('SCORE-001：區間命中（month_cnt=2→10 / =10→30）', async (ctx) => {
    ensurePg(ctx);
    const L = 'L_SCORE1';
    await seedStandardCardT1();
    await seedCase({ applNo: 'A1', listNo: L, monthCnt: 2, specTp: '01' });
    await seedCase({ applNo: 'A2', listNo: L, monthCnt: 10, specTp: '01' });
    await pushdownStandard({ listNo: L });
    expect((await getRow('A1', L)).score).toBe(15); // 10 + 5
    expect((await getRow('A2', L)).score).toBe(35); // 30 + 5
  });

  it('SCORE-002：區間邊界（5→[0,5]上界 / 6→[6,12]下界 / 13→界外 0）', async (ctx) => {
    ensurePg(ctx);
    const L = 'L_SCORE2';
    await seedStandardCardT1();
    await seedCase({ applNo: 'B5', listNo: L, monthCnt: 5, specTp: '01' });
    await seedCase({ applNo: 'B6', listNo: L, monthCnt: 6, specTp: '01' });
    await seedCase({ applNo: 'B13', listNo: L, monthCnt: 13, specTp: '01' });
    await pushdownStandard({ listNo: L });
    expect((await getRow('B5', L)).score).toBe(15); // 10 + 5
    expect((await getRow('B6', L)).score).toBe(35); // 30 + 5
    expect((await getRow('B13', L)).score).toBe(5); // 0 + 5
  });

  it('SCORE-003：類別 trim 相等（level1 含 padding / 值相等 / 99 無對應）', async (ctx) => {
    ensurePg(ctx);
    const L = 'L_SCORE3';
    // ⚠️ ob_pool_data.spec_tp 為 varchar(2)，無法存 padding 值；trim 語意對齊 JS = trim level1（config 端）。
    //    額外 seed PROJECT_TP level1=' EX'（含前導空白，trim 後 'EX'）對應 spec_tp='EX' → 取分。
    await seedStandardCardT1();
    await seedScore({ cardType: 'T1', cardVersion: 1, columnName: 'PROJECT_TP', level1: ' EX', score: 7 });
    await seedCase({ applNo: 'C1', listNo: L, monthCnt: 2, specTp: '01' });
    await seedCase({ applNo: 'C2', listNo: L, monthCnt: 2, specTp: 'EX' });
    await seedCase({ applNo: 'C3', listNo: L, monthCnt: 2, specTp: '99' });
    await pushdownStandard({ listNo: L });
    expect((await getRow('C1', L)).score).toBe(15); // 10 + 5（'01'）
    expect((await getRow('C2', L)).score).toBe(17); // 10 + 7（level1 ' EX' trim→'EX' 相等）
    expect((await getRow('C3', L)).score).toBe(10); // 99 無對應 → 0
  });

  it('SCORE-004：多維度累加（非取單一最大）', async (ctx) => {
    ensurePg(ctx);
    const L = 'L_SCORE4';
    await seedStandardCardT1();
    await seedCase({ applNo: 'D1', listNo: L, monthCnt: 2, specTp: '02' });
    await pushdownStandard({ listNo: L });
    expect((await getRow('D1', L)).score).toBe(25); // 10 + 15
  });

  it('SCORE-005：disabled 維度不計分', async (ctx) => {
    ensurePg(ctx);
    const L = 'L_SCORE5';
    await seedVersion('T1', 1);
    await seedColumn({ cardType: 'T1', cardVersion: 1, columnName: 'LIST_MONTH' });
    await seedColumn({
      cardType: 'T1', cardVersion: 1, columnName: 'PROJECT_TP', status: 'disabled', matchType: MatchType.CATEGORY,
    });
    await seedScore({ cardType: 'T1', cardVersion: 1, columnName: 'LIST_MONTH', level2S: '0', level2E: '5', score: 10 });
    await seedScore({ cardType: 'T1', cardVersion: 1, columnName: 'PROJECT_TP', level1: '01', score: 999 });
    await seedLevel({ cardType: 'T1', cardVersion: 1, scoreS: 0, scoreE: 100, cardLevel: 'A' });
    await seedTier({ cardType: 'T1', cardLevel: 'A', tierLevel: 'T1' });
    await seedCase({ applNo: 'E1', listNo: L, monthCnt: 2, specTp: '01' });
    await pushdownStandard({ listNo: L });
    expect((await getRow('E1', L)).score).toBe(10); // 不含 disabled 999
  });

  it('SCORE-006：無 active version → score NULL（案件仍寫入）', async (ctx) => {
    ensurePg(ctx);
    const L = 'L_SCORE6';
    await seedCase({ applNo: 'F1', listNo: L, monthCnt: 2 });
    // 不 seed version → cardVersion=null
    await pushdown({ listNo: L, cardVersion: null, activeColumns: [], scoreRows: [] });
    const r = await getRow('F1', L);
    expect(r.score).toBeNull();
    expect(r.card_level).toBeNull();
    expect(r.tier_level).toBeNull();
  });

  it('SCORE-007：有 active 但 0 命中 → score 0（與 NULL 區分）', async (ctx) => {
    ensurePg(ctx);
    const L = 'L_SCORE7';
    await seedStandardCardT1();
    // month_cnt=99 落 LIST_MONTH 區間外；spec_tp='99' 無類別對應 → 全不命中 → 0
    await seedCase({ applNo: 'G1', listNo: L, monthCnt: 99, specTp: '99' });
    await pushdownStandard({ listNo: L });
    const r = await getRow('G1', L);
    expect(r.score).toBe(0);
    expect(r.card_level).toBe('C'); // 0 ∈ [0,20]
    expect(r.tier_level).toBe('T3');
  });
});

// ===========================================================================
// CJOIN — LEFT JOIN customer_core 補計分
// ===========================================================================
describe('F100 CJOIN — LEFT JOIN customer_core 補計分（PG 真庫）', () => {
  it('CJOIN-001：customer_core match → CUS_SEX 取分（P-03）', async (ctx) => {
    ensurePg(ctx);
    const L = 'L_CJOIN1';
    await seedStandardCardT1({ withCustomerCore: true });
    await seedCase({ applNo: 'H1', custoNo: 'X001', listNo: L, monthCnt: 2, specTp: '01' });
    await seedCustomerCore({ sourceCustomerNo: 'X001', gender: 'M', dateOfBirth: '1996-01-01' }); // age~30
    await pushdownStandard({ listNo: L });
    // 10(LIST_MONTH) + 5(PROJECT_TP) + 20(CUS_SEX M) + 0(AGE<40) = 35
    expect((await getRow('H1', L)).score).toBe(35);
    expect((await getRow('H1', L)).tier_level).toBe('T2'); // B
  });

  it('CJOIN-002：customer_core 無 match → 屬性 NULL 不取分（案件不消失，P-01）', async (ctx) => {
    ensurePg(ctx);
    const L = 'L_CJOIN2';
    await seedStandardCardT1({ withCustomerCore: true });
    await seedCase({ applNo: 'I1', custoNo: 'NOPE', listNo: L, monthCnt: 2, specTp: '01' });
    // 不 seed customer_core → LEFT JOIN NULL
    await pushdownStandard({ listNo: L });
    const r = await getRow('I1', L);
    // 10 + 5 + 0(gender→'3' 無對應) + 0(age default 0 ∈ [0,39]) = 15；案件仍在
    expect(r.score).toBe(15);
    expect(r.card_level).toBe('C');
    expect(r.tier_level).toBe('T3');
  });

  it('CJOIN-004：混合維度 cus_sex=F age=55（P-04）', async (ctx) => {
    ensurePg(ctx);
    const L = 'L_CJOIN4';
    await seedStandardCardT1({ withCustomerCore: true });
    await seedCase({ applNo: 'J1', custoNo: 'X004', listNo: L, monthCnt: 10, specTp: '02' });
    await seedCustomerCore({ sourceCustomerNo: 'X004', gender: 'F', dateOfBirth: '1971-01-01' }); // age~55
    await pushdownStandard({ listNo: L });
    // 30 + 15 + 8(F) + 12(age≥40) = 65 → A → T1
    expect((await getRow('J1', L)).score).toBe(65);
    expect((await getRow('J1', L)).tier_level).toBe('T1');
  });
});

// ===========================================================================
// LEVTIER — score → card_level → tier_level NULL fallback
// ===========================================================================
describe('F100 LEVTIER — score→level→tier（PG 真庫）', () => {
  it('LEVTIER-002：level 邊界（20→C / 21→B / 41→A）', async (ctx) => {
    ensurePg(ctx);
    const L = 'L_LT2';
    await seedStandardCardT1();
    // 構造 score：用 LIST_MONTH 區間自訂達到 20/21/41 不便，改直接驗 level join via score=固定。
    // 以 PROJECT_TP 類別 + LIST_MONTH 組合：month=5(10)+tp=02(15)=25→B；month=2(10)+tp=02(15)... 需精準。
    // 簡化：直接 seed 案件落不同 score 區間。20: month=5(10)+ ... 用額外 score row。
    // 改用直接 score 區間驗證：seed 三案件 score = 20 / 21 / 41 via 自訂 LIST_MONTH 區間。
    await seedScore({ cardType: 'T1', cardVersion: 1, columnName: 'LIST_MONTH', level2S: '20', level2E: '20', score: 20 });
    await seedScore({ cardType: 'T1', cardVersion: 1, columnName: 'LIST_MONTH', level2S: '21', level2E: '21', score: 21 });
    await seedScore({ cardType: 'T1', cardVersion: 1, columnName: 'LIST_MONTH', level2S: '41', level2E: '41', score: 41 });
    await seedCase({ applNo: 'K20', listNo: L, monthCnt: 20, specTp: '99' });
    await seedCase({ applNo: 'K21', listNo: L, monthCnt: 21, specTp: '99' });
    await seedCase({ applNo: 'K41', listNo: L, monthCnt: 41, specTp: '99' });
    await pushdownStandard({ listNo: L });
    expect((await getRow('K20', L)).card_level).toBe('C'); // 20 ∈ [0,20]
    expect((await getRow('K21', L)).card_level).toBe('B'); // 21 ∈ [21,40]
    expect((await getRow('K41', L)).card_level).toBe('A'); // 41 ∈ [41,100]
  });

  it('LEVTIER-003：score 落 level 區間外 → card_level NULL → tier fallback T3', async (ctx) => {
    ensurePg(ctx);
    const L = 'L_LT3';
    await seedStandardCardT1();
    await seedScore({ cardType: 'T1', cardVersion: 1, columnName: 'LIST_MONTH', level2S: '200', level2E: '200', score: 200 });
    await seedCase({ applNo: 'M1', listNo: L, monthCnt: 200, specTp: '99' });
    await pushdownStandard({ listNo: L });
    const r = await getRow('M1', L);
    expect(r.score).toBe(200);
    expect(r.card_level).toBeNull(); // 200 落所有 level 區間外
    expect(r.tier_level).toBe('T3'); // card_level NULL fallback
  });

  it('LEVTIER-004：score NULL（無 active version）→ tier NULL（不走 fallback）', async (ctx) => {
    ensurePg(ctx);
    const L = 'L_LT4';
    // tier fallback 列存在，但 score NULL 不應走 fallback
    await seedTier({ cardType: 'T1', cardLevel: null, tierLevel: 'T3' });
    await seedCase({ applNo: 'N1', listNo: L, monthCnt: 2 });
    await pushdown({ listNo: L, cardVersion: null, activeColumns: [], scoreRows: [] });
    const r = await getRow('N1', L);
    expect(r.score).toBeNull();
    expect(r.card_level).toBeNull();
    expect(r.tier_level).toBeNull(); // NOT T3
  });

  it('LEVTIER-005：無 fallback 列 + score 落 level 外 → tier NULL', async (ctx) => {
    ensurePg(ctx);
    const L = 'L_LT5';
    await seedVersion('T1', 1);
    await seedColumn({ cardType: 'T1', cardVersion: 1, columnName: 'LIST_MONTH' });
    await seedScore({ cardType: 'T1', cardVersion: 1, columnName: 'LIST_MONTH', level2S: '200', level2E: '200', score: 200 });
    await seedLevel({ cardType: 'T1', cardVersion: 1, scoreS: 0, scoreE: 20, cardLevel: 'C' });
    // tier 僅 C→T3，無 card_level NULL fallback 列
    await seedTier({ cardType: 'T1', cardLevel: 'C', tierLevel: 'T3' });
    await seedCase({ applNo: 'O1', listNo: L, monthCnt: 200, specTp: '99' });
    await pushdownStandard({ listNo: L });
    const r = await getRow('O1', L);
    expect(r.score).toBe(200);
    expect(r.card_level).toBeNull();
    expect(r.tier_level).toBeNull(); // 無 fallback 列 → NULL
  });
});

// ===========================================================================
// CR — Stage 3 EXISTS 動態回分
// ===========================================================================
describe('F100 CR — Stage 3 EXISTS（PG 真庫）', () => {
  async function seedHistorySnapshot(opts: {
    applNo: string;
    orgno?: string;
    status?: string | null;
    workym?: string;
  }): Promise<void> {
    const histRunId = '00000000-0000-0000-0000-0000000000d0';
    await ds!.query(
      `INSERT INTO assignment_run (run_id, project_workym, status, triggered_by, created_at)
       VALUES ($1, $2, 'completed', '00000000-0000-0000-0000-000000000001', now())
       ON CONFLICT (run_id) DO NOTHING`,
      [histRunId, opts.workym ?? '202604'],
    );
    await snapshotRepo.save(
      snapshotRepo.create({
        run_id: histRunId,
        snapshot_type: 'result',
        payload: {
          assignments: [
            {
              listNo: 'OLD',
              applNo: opts.applNo,
              orgno: opts.orgno ?? '01',
              status: opts.status === undefined ? 'PENDING' : opts.status,
            },
          ],
        },
        created_at: new Date(),
      } as Partial<AssignmentRunSnapshot>),
    );
  }

  it('CR-001：cr_enabled + 歷史未成交 → is_cr Y', async (ctx) => {
    ensurePg(ctx);
    const L = 'L_CR1';
    await seedStandardCardT1();
    await seedCase({ applNo: 'P1', listNo: L, monthCnt: 2, specTp: '01' });
    await seedHistorySnapshot({ applNo: 'P1', status: 'PENDING' });
    await pushdownStandard({ listNo: L, crEnabled: true });
    expect((await getRow('P1', L)).is_cr).toBe('Y');
  });

  it('CR-002：cr_enabled + 歷史已成交 / 無命中 → is_cr N', async (ctx) => {
    ensurePg(ctx);
    const L = 'L_CR2';
    await seedStandardCardT1();
    await seedCase({ applNo: 'Q1', listNo: L, monthCnt: 2, specTp: '01' }); // 歷史已成交
    await seedCase({ applNo: 'Q2', listNo: L, monthCnt: 2, specTp: '01' }); // 歷史無命中
    await seedHistorySnapshot({ applNo: 'Q1', status: 'SUCCESS' });
    await pushdownStandard({ listNo: L, crEnabled: true });
    expect((await getRow('Q1', L)).is_cr).toBe('N'); // 已成交
    expect((await getRow('Q2', L)).is_cr).toBe('N'); // 無命中
  });

  it('CR-003：cr_enabled=false → 一律 N（不查歷史）', async (ctx) => {
    ensurePg(ctx);
    const L = 'L_CR3';
    await seedStandardCardT1();
    await seedCase({ applNo: 'R1', listNo: L, monthCnt: 2, specTp: '01' });
    await seedHistorySnapshot({ applNo: 'R1', status: 'PENDING' });
    await pushdownStandard({ listNo: L, crEnabled: false });
    expect((await getRow('R1', L)).is_cr).toBe('N');
  });

  it('CR-004：未成交（PENDING/無 status）算 CR；已成交不算', async (ctx) => {
    ensurePg(ctx);
    const L = 'L_CR4';
    await seedStandardCardT1();
    await seedCase({ applNo: 'S1', listNo: L, monthCnt: 2, specTp: '01' }); // PENDING
    await seedCase({ applNo: 'S2', listNo: L, monthCnt: 2, specTp: '01' }); // 無 status
    await seedCase({ applNo: 'S3', listNo: L, monthCnt: 2, specTp: '01' }); // 已成交
    await seedHistorySnapshot({ applNo: 'S1', status: 'PENDING' });
    await seedHistorySnapshot({ applNo: 'S2', status: null });
    await seedHistorySnapshot({ applNo: 'S3', status: 'SUCCESS' });
    await pushdownStandard({ listNo: L, crEnabled: true });
    expect((await getRow('S1', L)).is_cr).toBe('Y');
    expect((await getRow('S2', L)).is_cr).toBe('Y'); // null status = 未成交
    expect((await getRow('S3', L)).is_cr).toBe('N');
  });
});

// ===========================================================================
// EXCH — Stage 4 st4_exchange 視窗函式
// ===========================================================================
describe('F100 EXCH — Stage 4 st4_exchange（PG 真庫）', () => {
  /** seed n 件 tier_level=T1 案件（score→A→T1）。 */
  async function seedExchangeCases(opts: {
    listNo: string;
    n: number;
    tierLevel?: 'T1' | 'T2' | 'T3';
  }): Promise<void> {
    const cardLevelByTier = { T1: 'A', T2: 'B', T3: 'C' } as const;
    const tl = opts.tierLevel ?? 'T1';
    await seedVersion('T1', 1);
    await seedLevel({ cardType: 'T1', cardVersion: 1, scoreS: 0, scoreE: 99999, cardLevel: cardLevelByTier[tl] });
    await seedTier({ cardType: 'T1', cardLevel: cardLevelByTier[tl], tierLevel: tl });
    for (let i = 1; i <= opts.n; i++) {
      await seedCase({ applNo: `X${String(i).padStart(3, '0')}`, listNo: opts.listNo, monthCnt: 1 });
    }
  }

  async function pushExchange(opts: {
    listNo: string;
    hasSenior: boolean;
  }): Promise<void> {
    const activeColumns = await columnRepo.find({
      where: { card_type: 'T1', card_version: 1, status: 'active' },
    });
    const scoreRows = await scoreRepo.find({ where: { card_type: 'T1', card_version: 1 } });
    await pushdown({
      listNo: opts.listNo,
      activeColumns,
      scoreRows,
      seniorEmplid: opts.hasSenior ? 'E_SR' : null,
      seniorDeptid: opts.hasSenior ? 'D001' : null,
      defaultEmplid: 'E_NEW',
    });
  }

  it('EXCH-002：無 senior → 0 交換（全 default）', async (ctx) => {
    ensurePg(ctx);
    const L = 'L_EX2';
    await seedExchangeCases({ listNo: L, n: 20 });
    await pushExchange({ listNo: L, hasSenior: false });
    const rows = await resultRepo.find({ where: { run_id: RUN_ID, list_no: L } });
    expect(rows.every((r) => r.emplid === 'E_NEW')).toBe(true);
  });

  it('EXCH-003：20 件 → CEIL(2) 件交換，前 2 件（ORDER BY orgno,appl_no）', async (ctx) => {
    ensurePg(ctx);
    const L = 'L_EX3';
    await seedExchangeCases({ listNo: L, n: 20 });
    await pushExchange({ listNo: L, hasSenior: true });
    const rows = await resultRepo.find({ where: { run_id: RUN_ID, list_no: L } });
    const sr = rows.filter((r) => r.emplid === 'E_SR').map((r) => r.appl_no).sort();
    expect(sr).toEqual(['X001', 'X002']); // 前 2 件
  });

  it('EXCH-004：5 件 → 保底 1 件', async (ctx) => {
    ensurePg(ctx);
    const L = 'L_EX4';
    await seedExchangeCases({ listNo: L, n: 5 });
    await pushExchange({ listNo: L, hasSenior: true });
    const rows = await resultRepo.find({ where: { run_id: RUN_ID, list_no: L } });
    expect(rows.filter((r) => r.emplid === 'E_SR').length).toBe(1);
  });

  it('EXCH-005：10 件 → CEIL(1.0)=1', async (ctx) => {
    ensurePg(ctx);
    const L = 'L_EX5';
    await seedExchangeCases({ listNo: L, n: 10 });
    await pushExchange({ listNo: L, hasSenior: true });
    const rows = await resultRepo.find({ where: { run_id: RUN_ID, list_no: L } });
    expect(rows.filter((r) => r.emplid === 'E_SR').length).toBe(1);
  });

  it('EXCH-006：11 件 → CEIL(1.1)=2（攔截 ROUND/FLOOR）', async (ctx) => {
    ensurePg(ctx);
    const L = 'L_EX6';
    await seedExchangeCases({ listNo: L, n: 11 });
    await pushExchange({ listNo: L, hasSenior: true });
    const rows = await resultRepo.find({ where: { run_id: RUN_ID, list_no: L } });
    expect(rows.filter((r) => r.emplid === 'E_SR').length).toBe(2);
  });

  it('EXCH-001：全 T3 案件 → 0 交換（T3 不可被交換）', async (ctx) => {
    ensurePg(ctx);
    const L = 'L_EX1';
    await seedExchangeCases({ listNo: L, n: 10, tierLevel: 'T3' });
    await pushExchange({ listNo: L, hasSenior: true });
    const rows = await resultRepo.find({ where: { run_id: RUN_ID, list_no: L } });
    expect(rows.filter((r) => r.emplid === 'E_SR').length).toBe(0);
  });

  it('EXCH-008：跨 2 名單各 CEIL(10×0.1)=1（partition by list_no）', async (ctx) => {
    ensurePg(ctx);
    const LA = 'L_EX8A';
    const LB = 'L_EX8B';
    await seedVersion('T1', 1);
    await seedLevel({ cardType: 'T1', cardVersion: 1, scoreS: 0, scoreE: 99999, cardLevel: 'A' });
    await seedTier({ cardType: 'T1', cardLevel: 'A', tierLevel: 'T1' });
    for (let i = 1; i <= 10; i++) await seedCase({ applNo: `AA${i}`, listNo: LA, monthCnt: 1 });
    for (let i = 1; i <= 10; i++) await seedCase({ applNo: `BB${i}`, listNo: LB, monthCnt: 1 });
    await pushExchange({ listNo: LA, hasSenior: true });
    await pushExchange({ listNo: LB, hasSenior: true });
    const rowsA = await resultRepo.find({ where: { run_id: RUN_ID, list_no: LA } });
    const rowsB = await resultRepo.find({ where: { run_id: RUN_ID, list_no: LB } });
    expect(rowsA.filter((r) => r.emplid === 'E_SR').length).toBe(1);
    expect(rowsB.filter((r) => r.emplid === 'E_SR').length).toBe(1);
  });
});

// ===========================================================================
// EQ — SQL 版逐列 == 升級後手算預期（P3 DoD，AC-8）
// ===========================================================================
describe('F100 EQ — 逐列等價（手算 oracle，P3 DoD）', () => {
  it('EQ-002：含 customer_core 卡 match（P-03/P-04，升級差異 (a)）', async (ctx) => {
    ensurePg(ctx);
    const L = 'L_EQ2';
    await seedStandardCardT1({ withCustomerCore: true });
    // P-03：month=2 tp=01 M age=30 → 35 → B → T2
    await seedCase({ applNo: 'P03', custoNo: 'Y03', listNo: L, monthCnt: 2, specTp: '01' });
    await seedCustomerCore({ sourceCustomerNo: 'Y03', gender: 'M', dateOfBirth: '1996-01-01' });
    // P-04：month=10 tp=02 F age=55 → 65 → A → T1
    await seedCase({ applNo: 'P04', custoNo: 'Y04', listNo: L, monthCnt: 10, specTp: '02' });
    await seedCustomerCore({ sourceCustomerNo: 'Y04', gender: 'F', dateOfBirth: '1971-01-01' });
    await pushdownStandard({ listNo: L });
    const p03 = await getRow('P03', L);
    expect({ score: p03.score, card: p03.card_level, tier: p03.tier_level }).toEqual({
      score: 35, card: 'B', tier: 'T2',
    });
    const p04 = await getRow('P04', L);
    expect({ score: p04.score, card: p04.card_level, tier: p04.tier_level }).toEqual({
      score: 65, card: 'A', tier: 'T1',
    });
  });

  it('EQ-004：trim 邊界（CUS_SEX level1 含 padding " M" / age=40 下界，P-05）', async (ctx) => {
    ensurePg(ctx);
    const L = 'L_EQ4';
    // ⚠️ customer_core.gender 為 varchar(1)、spec_tp varchar(2)，無法存 padding；trim 對齊 JS = trim level1。
    //    重設 CUS_SEX score：level1=' M'（含前導空白，trim→'M'）→ 20；驗證 gender='M' 仍命中。
    await seedStandardCardT1({ withCustomerCore: true });
    await scoreRepo.delete({ card_type: 'T1', card_version: 1, column_name: 'CUS_SEX' });
    await seedScore({ cardType: 'T1', cardVersion: 1, columnName: 'CUS_SEX', level1: ' M', score: 20 });
    await seedCase({ applNo: 'P05', custoNo: 'Y05', listNo: L, monthCnt: 2, specTp: '01' });
    await seedCustomerCore({ sourceCustomerNo: 'Y05', gender: 'M', dateOfBirth: '1986-06-01' }); // age 40
    await pushdownStandard({ listNo: L });
    const r = await getRow('P05', L);
    // 10 + 5(01) + 20(level1 ' M' trim→'M' 相等) + 12(age 40 ∈[40,100]) = 47 → A → T1
    expect({ score: r.score, card: r.card_level, tier: r.tier_level }).toEqual({
      score: 47, card: 'A', tier: 'T1',
    });
  });
});

// ===========================================================================
// CDEF — Stage 2+3 不誤動 dept_id / emplid（職責分離）
// ===========================================================================
describe('F100 — runStage2and3Sql 僅動計分欄位', () => {
  it('Stage 2+3 不寫 dept_id / emplid（由 Stage 4 負責）', async (ctx) => {
    ensurePg(ctx);
    const L = 'L_SEP';
    await seedStandardCardT1();
    await seedCase({ applNo: 'SEP1', listNo: L, monthCnt: 2, specTp: '01' });
    const activeColumns = await columnRepo.find({
      where: { card_type: 'T1', card_version: 1, status: 'active' },
    });
    const scoreRows = await scoreRepo.find({ where: { card_type: 'T1', card_version: 1 } });
    await runStage2and3Sql(manager, {
      runId: RUN_ID, listNo: L, cardType: 'T1', cardVersion: 1,
      activeColumns, scoreRows, crEnabled: false, ym: YM,
      deptId: 'D001', seniorEmplid: null, seniorDeptid: null,
      defaultEmplid: 'E_NEW', defaultDeptid: 'D001',
    });
    const r = await getRow('SEP1', L);
    expect(r.score).toBe(15);
    expect(r.dept_id).toBeNull(); // Stage 4 尚未跑
    expect(r.emplid).toBeNull();
  });
});
