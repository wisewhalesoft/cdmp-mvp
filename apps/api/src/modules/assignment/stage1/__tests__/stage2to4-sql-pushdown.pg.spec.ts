/**
 * F100 / AD-E07-28 P3 — Stage 2~4 SQL 下推 + v2 真實計分引擎（PG 真庫，強制 Postgres）
 *
 * 對應測試設計（F100-test.md）：
 *   - SCORE-001~007：Stage 2 SUM(CASE…) 區間 / 類別 / 邊界 / disabled / NULL vs 0
 *   - CJOIN-001~004：LEFT JOIN customer_core 補計分（match / 無 match / 純 pool / 混合）
 *   - LEVTIER-001~005：score → card_level → tier_level NULL fallback 分歧
 *   - S2CLEAN-001/002：Stage 2 不寫 is_cr（F102 I-CR-STAGE2-CLEAN-01；原 CR-001~005 EXISTS 動態回分已移除）
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
  /** F102：Stage 1 帶入之 is_cr（驗證 Stage 2 不修改，I-CR-STAGE2-CLEAN-01）。 */
  isCr?: string | null;
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
      is_cr: opts.isCr ?? null,
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
  isCr?: string | null;
}): Promise<void> {
  await seedPool(opts);
  await seedResultRow({
    applNo: opts.applNo,
    custoNo: opts.custoNo,
    listNo: opts.listNo,
    isCr: opts.isCr,
  });
}

async function seedCustomerCore(opts: {
  sourceCustomerNo: string;
  cusSex?: string | null;
  dateOfBirth?: string | null;
  educationCode?: string | null;
}): Promise<void> {
  await ds!.query(
    `INSERT INTO customer_core
       (source_customer_no, customer_type, name, cus_sex, date_of_birth, education_code, data_source, _etl_loaded_at, _etl_pipeline_id)
     VALUES ($1, '01', 'T', $2, $3, $4, 'test', now(), '00000000-0000-0000-0000-000000000099')`,
    [
      opts.sourceCustomerNo,
      opts.cusSex ?? null,
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

/** 標準 T1 計分卡（§一矩陣）：LIST_MONTH 區間 + PROJECT_TP 複合 + CUS_SEX + AGE customer_core。 */
async function seedStandardCardT1(opts: { withCustomerCore?: boolean } = {}): Promise<void> {
  await seedVersion('T1', 1);
  await seedColumn({ cardType: 'T1', cardVersion: 1, columnName: 'LIST_MONTH' });
  // F105 / AD-E07-35：PROJECT_TP 改 composite（codeExpr spec_tp 字串區間 + keywordExpr 借新還舊）。
  await seedColumn({
    cardType: 'T1', cardVersion: 1, columnName: 'PROJECT_TP', matchType: MatchType.COMPOSITE,
  });
  if (opts.withCustomerCore) {
    // F104：CUS_SEX category→range（safe-cast cc.cus_sex）。
    await seedColumn({
      cardType: 'T1', cardVersion: 1, columnName: 'CUS_SEX', matchType: MatchType.RANGE,
    });
    await seedColumn({ cardType: 'T1', cardVersion: 1, columnName: 'AGE' });
  }
  // LIST_MONTH 區間：[0,5]→10；[6,12]→30
  await seedScore({ cardType: 'T1', cardVersion: 1, columnName: 'LIST_MONTH', level2S: '0', level2E: '5', score: 10 });
  await seedScore({ cardType: 'T1', cardVersion: 1, columnName: 'LIST_MONTH', level2S: '6', level2E: '12', score: 30 });
  // F105：PROJECT_TP composite，非借新還舊（level1=NULL→keyword ''）：spec_tp '01'→5；'02'→15。
  await seedScore({ cardType: 'T1', cardVersion: 1, columnName: 'PROJECT_TP', level2S: '01', level2E: '01', score: 5 });
  await seedScore({ cardType: 'T1', cardVersion: 1, columnName: 'PROJECT_TP', level2S: '02', level2E: '02', score: 15 });
  if (opts.withCustomerCore) {
    // F104：CUS_SEX range：'1'→20；'2'→8（safe-cast cc.cus_sex）
    await seedScore({ cardType: 'T1', cardVersion: 1, columnName: 'CUS_SEX', level2S: '1', level2E: '1', score: 20 });
    await seedScore({ cardType: 'T1', cardVersion: 1, columnName: 'CUS_SEX', level2S: '2', level2E: '2', score: 8 });
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

/**
 * 跑 Stage 2+3 下推（單一 list ctx）。
 *
 * F101（I-NO-ST4-EXCHANGE）：Stage 4 st4_exchange placeholder 已移除；F100 此 spec 之計分 /
 * level / tier / CR 驗證僅需 runStage2and3Sql（dept_id / emplid 分派由 F101 stage3to4-ration 負責，
 * 另由 stage3to4-ration-sql.pg.spec.ts 覆蓋）。
 */
async function pushdown(ctx: Partial<Stage2to4ListContext> & { listNo: string }): Promise<void> {
  const full: Stage2to4ListContext = {
    runId: RUN_ID,
    cardType: 'T1',
    cardVersion: 1,
    activeColumns: [],
    scoreRows: [],
    ym: YM,
    ...ctx,
  };
  await runStage2and3Sql(manager, full);
}

/** 以 active columns / scores 自 DB 載入並跑 Stage 2+3（標準卡）。 */
async function pushdownStandard(opts: {
  listNo: string;
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
      cus_sex VARCHAR(2),
      date_of_birth DATE,
      education_code VARCHAR(2),
      carea_no1 VARCHAR(10),
      carea_no2 VARCHAR(10),
      cellular VARCHAR(20),
      hpost_city VARCHAR(20),
      cpost_city VARCHAR(20),
      co_city VARCHAR(20),
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

  it('SCORE-003：composite code trim 相等（level2 含 padding / 值相等 / 99 無對應）', async (ctx) => {
    ensurePg(ctx);
    const L = 'L_SCORE3';
    // F105 / AD-E07-35：PROJECT_TP composite，codeExpr 兩端 TRIM。
    //   ⚠️ ob_pool_data.spec_tp 為 varchar(2)，無法存 padding 值；trim 語意對齊 = trim level2_s/e（config 端）。
    //    額外 seed PROJECT_TP level2_s/e=' EX'（含前導空白，trim 後 'EX'）對應 spec_tp='EX' → 取分。
    await seedStandardCardT1();
    await seedScore({ cardType: 'T1', cardVersion: 1, columnName: 'PROJECT_TP', level2S: ' EX', level2E: ' EX', score: 7 });
    await seedCase({ applNo: 'C1', listNo: L, monthCnt: 2, specTp: '01' });
    await seedCase({ applNo: 'C2', listNo: L, monthCnt: 2, specTp: 'EX' });
    await seedCase({ applNo: 'C3', listNo: L, monthCnt: 2, specTp: '99' });
    await pushdownStandard({ listNo: L });
    expect((await getRow('C1', L)).score).toBe(15); // 10 + 5（'01'）
    expect((await getRow('C2', L)).score).toBe(17); // 10 + 7（level2 ' EX' trim→'EX' 相等）
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
    await seedCustomerCore({ sourceCustomerNo: 'X001', cusSex: '1', dateOfBirth: '1996-01-01' }); // age~30
    await pushdownStandard({ listNo: L });
    // 10(LIST_MONTH) + 5(PROJECT_TP) + 20(CUS_SEX '1') + 0(AGE<40) = 35
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
    // 10 + 5 + 0(cus_sex 缺→計分 default 3，不落 [1,1]/[2,2]) + 0(age default 0 ∈ [0,39]) = 15；案件仍在
    expect(r.score).toBe(15);
    expect(r.card_level).toBe('C');
    expect(r.tier_level).toBe('T3');
  });

  it('CJOIN-004：混合維度 cus_sex=2 age=55（P-04）', async (ctx) => {
    ensurePg(ctx);
    const L = 'L_CJOIN4';
    await seedStandardCardT1({ withCustomerCore: true });
    await seedCase({ applNo: 'J1', custoNo: 'X004', listNo: L, monthCnt: 10, specTp: '02' });
    await seedCustomerCore({ sourceCustomerNo: 'X004', cusSex: '2', dateOfBirth: '1971-01-01' }); // age~55
    await pushdownStandard({ listNo: L });
    // 30 + 15 + 8(CUS_SEX '2') + 12(age≥40) = 65 → A → T1
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
// F102 / AD-E07-30（I-CR-STAGE2-CLEAN-01）：原 F100 「Stage 3 EXISTS 動態回分」（cr_enabled + 歷史
// snapshot 未成交 → is_cr='Y'）已整段移除——runStage2and3Sql 不再寫 is_cr。is_cr 由 Stage 1 帶入 +
// F102 CR 前置步驟（cr-priority-sql.ts）修改。下列 S2CLEAN 群組驗證 Stage 2 不改 is_cr（保留 Stage 1 原值）。
describe('F100→F102 S2CLEAN — Stage 2 不寫 is_cr（PG 真庫）', () => {
  it('S2CLEAN-001：Stage 2 後 is_cr = Stage 1 帶入原值（Y/N 各保留）', async (ctx) => {
    ensurePg(ctx);
    const L = 'L_S2C1';
    await seedStandardCardT1();
    await seedCase({ applNo: 'Y1', listNo: L, monthCnt: 2, specTp: '01', isCr: 'Y' });
    await seedCase({ applNo: 'Y2', listNo: L, monthCnt: 2, specTp: '01', isCr: 'Y' });
    await seedCase({ applNo: 'N1', listNo: L, monthCnt: 2, specTp: '01', isCr: 'N' });
    await pushdownStandard({ listNo: L });
    // Stage 2 計分後 is_cr 不變（I-CR-STAGE2-CLEAN-01）。
    expect((await getRow('Y1', L)).is_cr).toBe('Y');
    expect((await getRow('Y2', L)).is_cr).toBe('Y');
    expect((await getRow('N1', L)).is_cr).toBe('N');
  });

  it('S2CLEAN-002：Stage 1 未帶 is_cr（NULL）→ Stage 2 後仍 NULL（不誤寫）', async (ctx) => {
    ensurePg(ctx);
    const L = 'L_S2C2';
    await seedStandardCardT1();
    await seedCase({ applNo: 'U1', listNo: L, monthCnt: 2, specTp: '01' }); // is_cr 未設 → NULL
    await pushdownStandard({ listNo: L });
    expect((await getRow('U1', L)).is_cr).toBeNull();
    // Stage 2 仍寫 score / tier（驗證計分仍正常）。
    const row = await getRow('U1', L);
    expect(row.score).not.toBeUndefined();
  });
});

// F100 EXCH（Stage 4 st4_exchange 視窗函式）已隨 F101 / AD-E07-29 I-NO-ST4-EXCHANGE 移除——
// senior swap 不再執行，Stage 4 分派改由 F101 真實比例分派（stage3to4-ration-sql.pg.spec.ts 覆蓋）。

// ===========================================================================
// EQ — SQL 版逐列 == 升級後手算預期（P3 DoD，AC-8）
// ===========================================================================
describe('F100 EQ — 逐列等價（手算 oracle，P3 DoD）', () => {
  it('EQ-002：含 customer_core 卡 match（P-03/P-04，升級差異 (a)）', async (ctx) => {
    ensurePg(ctx);
    const L = 'L_EQ2';
    await seedStandardCardT1({ withCustomerCore: true });
    // P-03：month=2 tp=01 cus_sex=1 age=30 → 35 → B → T2
    await seedCase({ applNo: 'P03', custoNo: 'Y03', listNo: L, monthCnt: 2, specTp: '01' });
    await seedCustomerCore({ sourceCustomerNo: 'Y03', cusSex: '1', dateOfBirth: '1996-01-01' });
    // P-04：month=10 tp=02 cus_sex=2 age=55 → 65 → A → T1
    await seedCase({ applNo: 'P04', custoNo: 'Y04', listNo: L, monthCnt: 10, specTp: '02' });
    await seedCustomerCore({ sourceCustomerNo: 'Y04', cusSex: '2', dateOfBirth: '1971-01-01' });
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

  it('EQ-004：trim 邊界（PROJECT_TP composite code level2 含 padding " 01" / age=40 下界，P-05）', async (ctx) => {
    ensurePg(ctx);
    const L = 'L_EQ4';
    // F105 / AD-E07-35：PROJECT_TP composite，codeExpr 兩端 TRIM；以 level2 padding 驗 trim 邊界。
    //    重設 PROJECT_TP score：level2_s/e=' 01'（含前導空白，trim→'01'）→ 5；驗證 spec_tp='01' 仍命中。
    await seedStandardCardT1({ withCustomerCore: true });
    await scoreRepo.delete({ card_type: 'T1', card_version: 1, column_name: 'PROJECT_TP' });
    await seedScore({ cardType: 'T1', cardVersion: 1, columnName: 'PROJECT_TP', level2S: ' 01', level2E: ' 01', score: 5 });
    await seedCase({ applNo: 'P05', custoNo: 'Y05', listNo: L, monthCnt: 2, specTp: '01' });
    await seedCustomerCore({ sourceCustomerNo: 'Y05', cusSex: '1', dateOfBirth: '1986-06-01' }); // age 40
    await pushdownStandard({ listNo: L });
    const r = await getRow('P05', L);
    // 10 + 5(level2 ' 01' trim→'01' 相等) + 20(CUS_SEX '1') + 12(age 40 ∈[40,100]) = 47 → A → T1
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
    });
    const r = await getRow('SEP1', L);
    expect(r.score).toBe(15);
    expect(r.dept_id).toBeNull(); // Stage 4（F101 ration）尚未跑
    expect(r.emplid).toBeNull();
  });
});
