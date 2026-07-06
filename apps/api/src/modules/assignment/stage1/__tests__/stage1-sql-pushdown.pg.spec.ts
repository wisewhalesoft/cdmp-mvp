/**
 * F099 / AD-E07-28 P2 — Stage 1 SQL 下推 JS↔SQL 逐 list 結果集等價（PG 真庫，強制 Postgres）
 *
 * 對應測試設計（F099-test.md）：
 *   - EQ-001~014：JS executeStage1Chain（golden oracle） vs SQL buildStage1Sql（INSERT…SELECT）逐列 PK 集合相等（P2 DoD）
 *   - PORT-001~007：year-above year_produ 前導數字 / 空字串 / 非數字 / null / cutoff 邊界（oracle=現行 JS）
 *   - RUNEST-002/003：run 列數 === estimate COUNT（共用 buildStage1Sql core）；year-above 名單 estimate 不漏套
 *   - IDEM-001~003：同 run_id 重觸發前清理列集合一致 / FK CASCADE / snapshot 同理
 *
 * 連線：env PG_BOSS_TEST_HOST/PORT/...，預設對 docker-compose.test.yml 之 postgres-test（5433/cdmp_test）。
 * 不可達 → 整 describe skip-with-reason（不假綠）。啟動：
 *   docker compose -f docker-compose.test.yml up -d postgres-test
 *
 * ⚠️ I-PORT-01：本群組一律 PG，禁 better-sqlite3（year-above 之 ::int / SUBSTRING regexp、CAST(... AS numeric)
 * 在 SQLite 不具代表性且不支援）。
 */

// ⚠️ 必須最先 import（side-effect 設 DB_TYPE=postgres，供下方 entity 之 dateColumnType 解析為 PG 型別）。
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
import { ObPoolDataList } from '@/database/entities/ob-pool-data-list.entity';
import { ObEmphire } from '@/database/entities/ob-emphire.entity';
import { ObMonthlyRunResult } from '@/database/entities/ob-monthly-run-result.entity';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { executeStage1Chain } from '../stage1-filter-chain';
import {
  runStage1SqlInsert,
  estimateStage1SqlCount,
} from '../stage1-sql-executor';

const PG = {
  host: process.env.PG_BOSS_TEST_HOST ?? '127.0.0.1',
  port: Number(process.env.PG_BOSS_TEST_PORT ?? 5433),
  user: process.env.PG_BOSS_TEST_USER ?? 'cdmp',
  password: process.env.PG_BOSS_TEST_PASSWORD ?? 'cdmp_secret',
  database: process.env.PG_BOSS_TEST_DB ?? 'cdmp_test',
};

const SKIP_REASON =
  '需 Postgres（docker compose -f docker-compose.test.yml up -d postgres-test）— 未實跑';

const WORKDT = new Date(2026, 5, 1); // 2026-06-01；year-above cutoff=2011；去重視窗 [20260301, 20260531]
const RUN_ID = '00000000-0000-0000-0000-0000000000aa';

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
let pdlRepo: Repository<ObPoolDataList>;
let resultRepo: Repository<ObMonthlyRunResult>;
let listRepo: Repository<ObListDefinition>;
let runRepo: Repository<AssignmentRun>;
let manager: EntityManager;

// ---------------------------------------------------------------------------
// seed helpers（真實 contract：list_nm 真繁體中文觸發字；year_produ varchar(4) 含 null/空/非數字/前導數字）
// ---------------------------------------------------------------------------

let listSeq = 0;
function makeListDef(opts: Partial<ObListDefinition> = {}): ObListDefinition {
  listSeq += 1;
  return listRepo.create({
    list_no: `L${String(listSeq).padStart(8, '0')}`,
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
  const applNo = applNoOpt ?? `A${String(applSeq).padStart(6, '0')}`;
  const row = poolRepo.create({
    orgno: '01',
    custo_no: opts.custo_no ?? `C${String(applSeq).padStart(6, '0')}`,
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

async function seedPdl(opts: {
  applNo: string;
  custoNo: string | null;
  assignday: string;
  dataSource?: string | null;
}): Promise<void> {
  await pdlRepo.save(
    pdlRepo.create({
      list_no: 'HIST',
      orgno: '01',
      appl_no: opts.applNo,
      custo_no: opts.custoNo,
      assignday: opts.assignday,
      data_source: opts.dataSource ?? 'etl_load',
      settle_src: '01',
    } as Partial<ObPoolDataList>),
  );
}

/** 跑 JS oracle，回傳 PK 集合 { orgno:appl_no }（排序）。 */
async function runJsOraclePks(list: ObListDefinition): Promise<string[]> {
  const r = await executeStage1Chain(list, WORKDT, poolRepo, pdlRepo, {
    dryRun: false,
  });
  return (r.cases ?? []).map((c) => `${c.orgno}:${c.appl_no}`).sort();
}

/** 跑 SQL 下推（INSERT…SELECT），回傳寫入 ob_monthly_run_result 之 PK 集合（排序）+ 列。 */
async function runSqlPushdownPks(
  list: ObListDefinition,
  runId = RUN_ID,
): Promise<{ pks: string[]; rows: ObMonthlyRunResult[] }> {
  await runStage1SqlInsert(manager, list, WORKDT, pdlRepo, {
    runId,
    listNo: list.list_no,
  });
  const rows = await resultRepo.find({
    where: { run_id: runId, list_no: list.list_no },
  });
  return {
    pks: rows.map((r) => `${r.orgno}:${r.appl_no}`).sort(),
    rows,
  };
}

/** EQ 共用骨架：同 seed 跑 JS oracle 與 SQL 下推，斷言 PK 集合相等 + assignday 恆 NULL。 */
async function assertEquivalent(list: ObListDefinition): Promise<string[]> {
  const jsPks = await runJsOraclePks(list);
  const { pks: sqlPks, rows } = await runSqlPushdownPks(list);
  expect(sqlPks).toEqual(jsPks); // 逐列 PK 集合精確相等（非僅 count）
  // OQ-F099-03：assignday 恆 NULL（ob_pool_data 無此欄；JS / SQL 兩側皆 NULL）
  expect(rows.every((r) => r.assignday === null)).toBe(true);
  return jsPks;
}

function ensurePg(ctx: { skip: () => void }): void {
  if (!reachable || !ds) {
    // eslint-disable-next-line no-console
    console.warn(`[F099 PG Integration] SKIPPED — ${SKIP_REASON}`);
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
        ObPoolDataList,
        ObMonthlyRunResult,
        AssignmentRun,
        ObEmphire,
      ],
      synchronize: true,
    });
    await ds.initialize();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[F099 PG Integration] init failed → skip:', (e as Error)?.message);
    reachable = false;
    ds = null;
    return;
  }
  poolRepo = ds.getRepository(ObPoolData);
  pdlRepo = ds.getRepository(ObPoolDataList);
  resultRepo = ds.getRepository(ObMonthlyRunResult);
  listRepo = ds.getRepository(ObListDefinition);
  runRepo = ds.getRepository(AssignmentRun);
  manager = ds.manager;
  // EQ-012 需 pool 內 custo_no=NULL 樣本驗證 NOT EXISTS NULL-safety（JS chain 亦有 null-guard）；
  // ob_pool_data.custo_no entity 為 NOT NULL（prod schema），測試放寬以涵蓋防禦分支等價性。
  await ds.query('ALTER TABLE ob_pool_data ALTER COLUMN custo_no DROP NOT NULL');
}, 60000);

afterAll(async () => {
  if (ds) {
    // 清理 synchronize 建出的測試表（CASCADE 處理 ob_monthly_run_result → assignment_run FK）
    await ds.query('DROP TABLE IF EXISTS ob_monthly_run_result CASCADE');
    await ds.query('DROP TABLE IF EXISTS ob_pool_data CASCADE');
    await ds.query('DROP TABLE IF EXISTS ob_pool_data_list CASCADE');
    await ds.query('DROP TABLE IF EXISTS ob_list_definition CASCADE');
    await ds.query('DROP TABLE IF EXISTS assignment_run CASCADE');
    await ds.destroy();
  }
  // 還原 DB_TYPE，避免污染同 worker 後續 SQLite spec（column-types 每檔重評）。
  restoreDbType();
});

beforeEach(async () => {
  if (!reachable || !ds) return;
  await ds.query('DELETE FROM ob_monthly_run_result');
  await ds.query('DELETE FROM ob_pool_data');
  await ds.query('DELETE FROM ob_pool_data_list');
  await ds.query('DELETE FROM ob_list_definition');
  await ds.query('DELETE FROM assignment_run');
  // 每次 IDEM 測試需 assignment_run 父列（FK）；EQ 亦需，因 result 表 run_id FK → assignment_run，
  // INSERT…SELECT 須有對應 run 列才不違反 FK。預先建 RUN_ID。
  // run_id 為 @PrimaryGeneratedColumn('uuid')，須以原生 INSERT 指定固定 UUID。
  await seedRun(RUN_ID);
});

async function seedRun(runId: string): Promise<void> {
  await ds!.query(
    `INSERT INTO assignment_run (run_id, project_workym, status, triggered_by, created_at)
     VALUES ($1, '202606', 'running', '00000000-0000-0000-0000-000000000001', now())`,
    [runId],
  );
}

// ===========================================================================
// 一、EQ — JS↔SQL 逐 list 結果集精確等價（P2 DoD）
// ===========================================================================

describe('F099 EQ — JS↔SQL 逐 list 結果集精確等價（PG 真庫，P2 DoD）', () => {
  it('EQ-001：基準純欄位篩選（prod_kind IN）無特例無去重', async (ctx) => {
    ensurePg(ctx);
    const list = makeListDef({ list_nm: '一般催收名單' });
    await listRepo.save(list);
    await seedPool({ applNo: 'A1', prod_kind: '01' }); // 命中
    await seedPool({ applNo: 'A2', prod_kind: '01' }); // 命中
    await seedPool({ applNo: 'A3', prod_kind: '02' }); // 未命中
    const pks = await assertEquivalent(list);
    expect(pks).toEqual(['01:A1', '01:A2']);
  });

  it('EQ-002：month_cnt 期別過濾（IN 1..6）', async (ctx) => {
    ensurePg(ctx);
    const list = makeListDef();
    await listRepo.save(list);
    await seedPool({ applNo: 'A1', month_cnt: 3 }); // 入
    await seedPool({ applNo: 'A2', month_cnt: 9 }); // 排
    await seedPool({ applNo: 'A3', month_cnt: null }); // 排（NULL 不 IN）
    const pks = await assertEquivalent(list);
    expect(pks).toEqual(['01:A1']);
  });

  it('EQ-003：month_cnt 步進邊界（interval=2 → IN 1,3,5）', async (ctx) => {
    ensurePg(ctx);
    const list = makeListDef({ list_interval: '2' });
    await listRepo.save(list);
    for (const [a, m] of [['A1', 1], ['A3', 3], ['A5', 5]] as const) {
      await seedPool({ applNo: a, month_cnt: m });
    }
    for (const [a, m] of [['A2', 2], ['A4', 4], ['A6', 6]] as const) {
      await seedPool({ applNo: a, month_cnt: m });
    }
    const pks = await assertEquivalent(list);
    expect(pks).toEqual(['01:A1', '01:A3', '01:A5']);
  });

  it('EQ-004：list_period 缺值 → month_cnt skip（全留）', async (ctx) => {
    ensurePg(ctx);
    const list = makeListDef({ list_period_start: '', list_period_end: '', list_interval: '' });
    await listRepo.save(list);
    await seedPool({ applNo: 'A1', month_cnt: 3 });
    await seedPool({ applNo: 'A2', month_cnt: 99 });
    await assertEquivalent(list);
  });

  it('EQ-005：interval=0 → month_cnt skip（全留，防 infinite loop）', async (ctx) => {
    ensurePg(ctx);
    const list = makeListDef({ list_interval: '0' });
    await listRepo.save(list);
    await seedPool({ applNo: 'A1', month_cnt: 3 });
    await seedPool({ applNo: 'A2', month_cnt: 99 });
    await assertEquivalent(list);
  });

  it('EQ-006：詐騙白牌（list_type=01 AND spec_name 含白牌）', async (ctx) => {
    ensurePg(ctx);
    const list = makeListDef({ list_nm: '詐騙白牌專案' });
    await listRepo.save(list);
    await seedPool({ applNo: 'A1', list_type: '01', spec_name: '詐騙白牌方案' }); // 排
    await seedPool({ applNo: 'A2', list_type: '02', spec_name: '白牌' }); // 留（type 不符）
    await seedPool({ applNo: 'A3', list_type: '01', spec_name: '一般' }); // 留（不含白牌）
    await seedPool({ applNo: 'A4', list_type: '01', spec_name: null }); // 留（NULL 不含白牌）
    const pks = await assertEquivalent(list);
    expect(pks).toEqual(['01:A2', '01:A3', '01:A4']);
  });

  it('EQ-007：機車期中（payt_term>=deal_num-3 OR appl_no T/Y 開頭）+ 邊界', async (ctx) => {
    ensurePg(ctx);
    const list = makeListDef({ list_nm: '機車期中催收名單' });
    await listRepo.save(list);
    await seedPool({ applNo: 'A1', payt_term: 21, deal_num: '24' }); // 排（21>=21）
    await seedPool({ applNo: 'A2', payt_term: 20, deal_num: '24' }); // 留（20<21）
    await seedPool({ applNo: 'T003', payt_term: 0, deal_num: '24' }); // 排（T 開頭）
    await seedPool({ applNo: 'Y004', payt_term: 0, deal_num: '24' }); // 排（Y 開頭）
    await seedPool({ applNo: 'A005', payt_term: 0, deal_num: '24' }); // 留
    const pks = await assertEquivalent(list);
    expect(pks).toEqual(['01:A005', '01:A2']);
  });

  it('EQ-008：期中小資（payt_num>deal_num-8 AND spec_name 含小資）+ 邊界', async (ctx) => {
    ensurePg(ctx);
    const list = makeListDef({ list_nm: '期中催收名單' });
    await listRepo.save(list);
    await seedPool({ applNo: 'A1', payt_num: 17, deal_num: '24', spec_name: '小資' }); // 排（17>16 且含小資）
    await seedPool({ applNo: 'A2', payt_num: 16, deal_num: '24', spec_name: '小資' }); // 留（16=16 非>）
    await seedPool({ applNo: 'A3', payt_num: 17, deal_num: '24', spec_name: '一般' }); // 留（不含小資）
    const pks = await assertEquivalent(list);
    expect(pks).toEqual(['01:A2', '01:A3']);
  });

  it('EQ-009：year-above 正常值（< cutoff 2011 排除）', async (ctx) => {
    ensurePg(ctx);
    const list = makeListDef({ list_nm: '5年以上車主催收名單' });
    await listRepo.save(list);
    await seedPool({ applNo: 'A1', year_produ: '2010' }); // 排（2010<2011）
    await seedPool({ applNo: 'A2', year_produ: '2011' }); // 留（2011 非<2011）
    await seedPool({ applNo: 'A3', year_produ: '2020' }); // 留
    const pks = await assertEquivalent(list);
    expect(pks).toEqual(['01:A2', '01:A3']);
  });

  it('EQ-010：year-above 退化 / 非數字 / 前導數字邊界（對齊 JS parseInt）', async (ctx) => {
    ensurePg(ctx);
    const list = makeListDef({ list_nm: '年以上機車名單' });
    await listRepo.save(list);
    await seedPool({ applNo: 'A1', year_produ: null }); // 排（?? 1900 < 2011）
    await seedPool({ applNo: 'A2', year_produ: '' }); // 留（parseInt('')=NaN）
    await seedPool({ applNo: 'A3', year_produ: 'N/A' }); // 留（NaN）— varchar(4) 容納
    await seedPool({ applNo: 'A4', year_produ: '200' }); // 排（200<2011）
    await seedPool({ applNo: 'A5', year_produ: '1980' }); // 排（前導數字基準；'1980abc' 受 varchar(4) 限制改 PORT-007 專測）
    const pks = await assertEquivalent(list);
    expect(pks).toEqual(['01:A2', '01:A3']);
  });

  it('EQ-011：規則疊加（fraud + motorcycle + xiaozi + year-above，BR-1 不合併）', async (ctx) => {
    ensurePg(ctx);
    const list = makeListDef({ list_nm: '機車期中小資5年以上催收名單' });
    await listRepo.save(list);
    // 各只命中一條排除條件 → 全排
    await seedPool({ applNo: 'A1', list_type: '01', spec_name: '白牌' }); // fraud
    await seedPool({ applNo: 'A2', payt_term: 30, deal_num: '24' }); // motorcycle
    await seedPool({ applNo: 'A3', payt_num: 30, deal_num: '24', spec_name: '小資' }); // xiaozi
    await seedPool({ applNo: 'A4', year_produ: '1990' }); // year-above
    // 全不命中 → 留
    await seedPool({
      applNo: 'A5',
      list_type: '02',
      spec_name: '一般',
      payt_term: 0,
      payt_num: 0,
      deal_num: '24',
      year_produ: '2020',
    });
    const pks = await assertEquivalent(list);
    expect(pks).toEqual(['01:A5']);
  });

  it('EQ-012：近 3 月去重 — 上界 + NULL custo_no 安全（NOT EXISTS）', async (ctx) => {
    ensurePg(ctx);
    const list = makeListDef({ list_nm: '一般催收名單' });
    await listRepo.save(list);
    await seedPool({ applNo: 'A1', custo_no: 'C001' }); // 視窗內已派 → 排
    await seedPool({ applNo: 'A2', custo_no: 'C002' }); // 視窗外 → 留
    await seedPool({ applNo: 'A3', custo_no: null }); // NULL custo_no → 不被去重誤排（留）
    await seedPdl({ applNo: 'H1', custoNo: 'C001', assignday: '20260420' });
    await seedPdl({ applNo: 'H2', custoNo: 'C002', assignday: '20260201' }); // 視窗外
    await seedPdl({ applNo: 'H3', custoNo: null, assignday: '20260420' }); // 歷史 NULL 不致全 false
    const pks = await assertEquivalent(list);
    expect(pks).toEqual(['01:A2', '01:A3']);
  });

  it('EQ-013：去重上界邊界（MAX 未來日封頂 / 歷史空集）', async (ctx) => {
    ensurePg(ctx);
    // 子樣本 a：歷史最大 assignday 未來日 → 封頂 workdt-1，該 custo_no 不去重
    const listA = makeListDef({ list_nm: '一般催收名單' });
    await listRepo.save(listA);
    await seedPool({ applNo: 'A1', custo_no: 'C100' });
    await seedPdl({ applNo: 'H1', custoNo: 'C100', assignday: '20261231' }); // 未來 → 封頂後落視窗外 → 不去重
    await assertEquivalent(listA);

    // 子樣本 b：歷史全空 → 去重集合空、不過濾（另 list，beforeEach 不清，故清 pdl + result）
    await ds!.query('DELETE FROM ob_pool_data_list');
    await ds!.query('DELETE FROM ob_monthly_run_result');
    const listB = makeListDef({ list_nm: '一般催收名單' });
    await listRepo.save(listB);
    await assertEquivalent(listB);
  });

  it('EQ-014：EMPTY_CONDITIONS → 整 list skip（0 列，不 INSERT）', async (ctx) => {
    ensurePg(ctx);
    const list = makeListDef({
      list_nm: '一般催收名單',
      condition_payload: { logic: 'AND', conditions: [] } as ObListDefinition['condition_payload'],
    });
    await listRepo.save(list);
    await seedPool({ applNo: 'A1' });
    const jsPks = await runJsOraclePks(list);
    expect(jsPks).toEqual([]);
    const { pks } = await runSqlPushdownPks(list);
    expect(pks).toEqual([]);
  });
});

// ===========================================================================
// 三、PORT — year-above 前導數字 PG 可移植（禁 SQLite；year_produ 直接 INSERT 繞 varchar(4) 限制）
// ===========================================================================

describe('F099 PORT — year-above 數值化 PG 可移植（oracle=現行 JS parseInt）', () => {
  /**
   * year_produ entity 為 varchar(4)；'1980abc'（7 字元）無法經 entity save。
   * 以原生 INSERT 寫入（PG 欄位實寬由 synchronize 建為 varchar(4) → 仍受限）。
   * 故 PORT 群組建立獨立寬欄測試：synchronize 後 ALTER year_produ → varchar(10) 容納前導數字案例，
   * 並於本 describe 結束還原（避免污染 EQ 群組假設）。
   */
  beforeAll(async () => {
    if (!reachable || !ds) return;
    await ds.query("ALTER TABLE ob_pool_data ALTER COLUMN year_produ TYPE varchar(10)");
  });
  afterAll(async () => {
    if (!reachable || !ds) return;
    // 還原為 varchar(4)（先清資料避免截斷錯誤）
    await ds.query('DELETE FROM ob_monthly_run_result');
    await ds.query('DELETE FROM ob_pool_data');
    await ds.query("ALTER TABLE ob_pool_data ALTER COLUMN year_produ TYPE varchar(4) USING LEFT(year_produ,4)");
  });

  async function portCase(yearProdu: string | null): Promise<{ js: string[]; sql: string[] }> {
    const list = makeListDef({ list_nm: '年以上名單' });
    await listRepo.save(list);
    await seedPool({ applNo: 'P1', year_produ: yearProdu });
    const js = await runJsOraclePks(list);
    const { pks: sql } = await runSqlPushdownPks(list);
    return { js, sql };
  }

  it('PORT-001：2010 → 排除（2010<2011）', async (ctx) => {
    ensurePg(ctx);
    const { js, sql } = await portCase('2010');
    expect(sql).toEqual(js);
    expect(sql).toEqual([]); // 排除
  });

  it('PORT-002：2011 → 保留（cutoff 邊界，非<）', async (ctx) => {
    ensurePg(ctx);
    const { js, sql } = await portCase('2011');
    expect(sql).toEqual(js);
    expect(sql).toEqual(['01:P1']);
  });

  it('PORT-003：null → 排除（?? 1900）', async (ctx) => {
    ensurePg(ctx);
    const { js, sql } = await portCase(null);
    expect(sql).toEqual(js);
    expect(sql).toEqual([]);
  });

  it('PORT-004：空字串 → 保留（parseInt("")=NaN）⚠️陷阱①', async (ctx) => {
    ensurePg(ctx);
    const { js, sql } = await portCase('');
    expect(sql).toEqual(js);
    expect(sql).toEqual(['01:P1']); // 保留
  });

  it('PORT-005：N/A 純非數字 → 保留（NaN）⚠️陷阱①', async (ctx) => {
    ensurePg(ctx);
    const { js, sql } = await portCase('N/A');
    expect(sql).toEqual(js);
    expect(sql).toEqual(['01:P1']); // 保留
  });

  it('PORT-006：200 短整數 → 排除（200<2011）', async (ctx) => {
    ensurePg(ctx);
    const { js, sql } = await portCase('200');
    expect(sql).toEqual(js);
    expect(sql).toEqual([]);
  });

  it('PORT-007：1980abc 前導數字 → 排除（parseInt=1980<2011）⚠️陷阱②', async (ctx) => {
    ensurePg(ctx);
    const { js, sql } = await portCase('1980abc');
    expect(sql).toEqual(js);
    expect(sql).toEqual([]); // 排除（前導數字解析 1980；strict '^[0-9]+$' 會誤判保留）
  });
});

// ===========================================================================
// 二、RUNEST — estimate≡run 不分叉（列數 === COUNT）
// ===========================================================================

describe('F099 RUNEST — run 列數 === estimate COUNT（共用 buildStage1Sql core）', () => {
  it('RUNEST-002：含特例 + 去重名單，run 列數 === estimate COUNT', async (ctx) => {
    ensurePg(ctx);
    const list = makeListDef({ list_nm: '機車期中催收名單' });
    await listRepo.save(list);
    await seedPool({ applNo: 'A1', payt_term: 21, deal_num: '24' }); // 排
    await seedPool({ applNo: 'A2', payt_term: 0, deal_num: '24', custo_no: 'C001' }); // 去重排
    await seedPool({ applNo: 'A3', payt_term: 0, deal_num: '24' }); // 留
    await seedPdl({ applNo: 'H1', custoNo: 'C001', assignday: '20260420' });

    const { count } = await estimateStage1SqlCount(manager, list, WORKDT, pdlRepo);
    const { rows } = await runSqlPushdownPks(list);
    expect(rows.length).toBe(count);
  });

  it('RUNEST-003：year-above 名單 estimate 不漏套（列數===COUNT，year-above 已扣除）', async (ctx) => {
    ensurePg(ctx);
    const list = makeListDef({ list_nm: '5年以上名單' });
    await listRepo.save(list);
    await seedPool({ applNo: 'A1', year_produ: '2000' }); // 排
    await seedPool({ applNo: 'A2', year_produ: '2020' }); // 留
    const { count } = await estimateStage1SqlCount(manager, list, WORKDT, pdlRepo);
    const { rows } = await runSqlPushdownPks(list);
    expect(rows.length).toBe(count);
    expect(count).toBe(1); // year-above 已生效（A1 排除）
  });
});

// ===========================================================================
// 四、IDEM — 冪等清理（I-IDEM-01）
// ===========================================================================

describe('F099 IDEM — 重觸發前清理（I-IDEM-01）', () => {
  it('IDEM-001：同 run_id 重跑前清理 → 列集合一致（不重複殘留）', async (ctx) => {
    ensurePg(ctx);
    const list = makeListDef({ list_nm: '一般催收名單' });
    await listRepo.save(list);
    await seedPool({ applNo: 'A1' });
    await seedPool({ applNo: 'A2' });
    const first = await runSqlPushdownPks(list);
    const second = await runSqlPushdownPks(list); // 重跑（內部先 DELETE by run_id+list_no）
    expect(second.pks).toEqual(first.pks);
    // 不重複：總列數 = 唯一 PK 數
    const total = await resultRepo.count({ where: { run_id: RUN_ID } });
    expect(total).toBe(first.pks.length);
  });

  it('IDEM-002：刪除 assignment_run → FK CASCADE 自動清 result 列（0 殘留）', async (ctx) => {
    ensurePg(ctx);
    const list = makeListDef({ list_nm: '一般催收名單' });
    await listRepo.save(list);
    await seedPool({ applNo: 'A1' });
    await runSqlPushdownPks(list);
    expect(await resultRepo.count({ where: { run_id: RUN_ID } })).toBeGreaterThan(0);
    await runRepo.delete({ run_id: RUN_ID });
    expect(await resultRepo.count({ where: { run_id: RUN_ID } })).toBe(0);
  });

  it('IDEM-003：重觸發兩 run_id 互不污染（snapshot 同理 — 各自獨立清除）', async (ctx) => {
    ensurePg(ctx);
    const RUN_ID2 = '00000000-0000-0000-0000-0000000000bb';
    await seedRun(RUN_ID2);
    const list = makeListDef({ list_nm: '一般催收名單' });
    await listRepo.save(list);
    await seedPool({ applNo: 'A1' });
    await runSqlPushdownPks(list, RUN_ID);
    await runSqlPushdownPks(list, RUN_ID2);
    // 重跑 RUN_ID → 不影響 RUN_ID2 列
    await runSqlPushdownPks(list, RUN_ID);
    expect(await resultRepo.count({ where: { run_id: RUN_ID } })).toBe(1);
    expect(await resultRepo.count({ where: { run_id: RUN_ID2 } })).toBe(1);
  });
});

// skip 時印出原因
// 註：不在 module-eval 時印 SKIPPED（此時 reachable 尚為初值 false，會誤報）；
// 真正不可達時由各 it 之 ensurePg(ctx) 印出 skip 原因（不假綠）。
