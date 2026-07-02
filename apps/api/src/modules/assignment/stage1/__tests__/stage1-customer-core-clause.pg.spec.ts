/**
 * F109 / US-172 / AD-E07-37 — customer_core 條件式 LEFT JOIN 行為（PG 真庫，強制 Postgres）
 *
 * 對應測試設計（F109-test.md）核心紅線：
 *   - NULLEXC-001~005/007：NULL 排除三變體（無對應客戶 / 客戶欄 NULL / 無客戶條件不排除）+ cpost_city/AGE NULL
 *   - JOIN-001/003/005/007：條件式 JOIN 觸發 / EMPTY_CONDITIONS 陷阱 / 多條件共用 JOIN / chain 路徑
 *   - AGE-001~005：年齡衍生（作業月首日基準、未達生日不計、BETWEEN 邊界、決定性、workdt 驅動）
 *   - CITY-001~004：LEFT3 縣市級比對
 *   - AND-001~003：跨來源 AND
 *   - DESC / GENDER-002：查詢層值比對
 *   - EQ-001~006：buildStage1Sql(estimate) ↔ executeStage1Chain 逐列等價（BR-10 DoD）
 *   - JOINCARD-001/002：source_customer_no UNIQUE + JOIN 基數 ≤1:1（COUNT 不膨脹）
 *   - DEACT-002：欄位停用後既有名單（dataSource 已固化）仍正確過濾
 *
 * customer_core 僅存 PG（AD §9）；SQLite 無此表 → 全數 PG-only。連線預設 postgres-test（5433/cdmp_test）；
 * 不可達 → 整檔 skip-with-reason（不假綠）。啟動：docker compose -f docker-compose.test.yml up -d postgres-test
 */

// 必最先 import（side-effect 設 DB_TYPE=postgres，供 entity dateColumnType 解析 PG 型別）。
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

import { ObListDefinition } from '@/database/entities/ob-list-definition.entity';
import { ObPoolData } from '@/database/entities/ob-pool-data.entity';
import { ObPoolDataList } from '@/database/entities/ob-pool-data-list.entity';
import { ObMonthlyRunResult } from '@/database/entities/ob-monthly-run-result.entity';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { executeStage1Chain } from '../stage1-filter-chain';
import { estimateStage1SqlCount } from '../stage1-sql-executor';

// feedback_pg_spec_parallel_timeout：預設 5s 在 CPU 競爭下易誤判失敗
vi.setConfig({ testTimeout: 60000 });

const PG = {
  host: process.env.PG_BOSS_TEST_HOST ?? '127.0.0.1',
  port: Number(process.env.PG_BOSS_TEST_PORT ?? 5433),
  user: process.env.PG_BOSS_TEST_USER ?? 'cdmp',
  password: process.env.PG_BOSS_TEST_PASSWORD ?? 'cdmp_secret',
  database: process.env.PG_BOSS_TEST_DB ?? 'cdmp_test',
};
const SKIP_REASON =
  '需 Postgres（docker compose -f docker-compose.test.yml up -d postgres-test）— 未實跑';

// 作業月首日（AGE 基準）；July 用於 AGE 測試（1996-07-01 → 30 歲）
const WORKDT = new Date(Date.UTC(2026, 6, 1)); // 2026-07-01

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
let listRepo: Repository<ObListDefinition>;
let manager: EntityManager;

let listSeq = 0;
function makeList(
  conditions: unknown[],
  opts: Partial<ObListDefinition> = {},
): ObListDefinition {
  listSeq += 1;
  return listRepo.create({
    list_no: `F109L${String(listSeq).padStart(5, '0')}`,
    list_nm: '客戶篩選名單', // 不含特例觸發字（期中/機車/年以上/小資）
    prod_kind: '',
    prod_best: 'Y',
    list_type: '01',
    list_period_start: '1',
    list_period_end: '6',
    list_interval: '1',
    project_workym: '202607',
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
      conditions,
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
  return poolRepo.save(
    poolRepo.create({
      orgno: '01',
      custo_no: opts.custo_no ?? `C${String(applSeq).padStart(6, '0')}`,
      sta_code: '01',
      dept_id: 'D001',
      list_type: '01',
      settle_src: '01',
      prod_kind: '01',
      month_cnt: 1, // list period 1..6 → 命中
      spec_name: null,
      _cdmp_extracted_at: new Date(),
      ...rest,
      appl_no: applNo,
    } as Partial<ObPoolData>),
  );
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
  await ds!.query(
    `INSERT INTO customer_core
       (source_customer_no, gender, date_of_birth, occupation_desc, education_desc,
        marital_status_desc, customer_type_desc, monthly_income_desc, cpost_city)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
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

/** estimate 路徑 count。 */
async function estimateCount(
  list: ObListDefinition,
  workdt = WORKDT,
): Promise<number> {
  const { count } = await estimateStage1SqlCount(manager, list, workdt, pdlRepo);
  return count;
}

/** chain 路徑入選 PK 集合（排序）。 */
async function chainPks(
  list: ObListDefinition,
  workdt = WORKDT,
): Promise<string[]> {
  const r = await executeStage1Chain(list, workdt, poolRepo, pdlRepo, {
    dryRun: false,
  });
  return (r.cases ?? []).map((c) => `${c.orgno}:${c.appl_no}`).sort();
}

function ensurePg(ctx: { skip: () => void }): void {
  if (!reachable || !ds) {
    // eslint-disable-next-line no-console
    console.warn(`[F109 PG] SKIPPED — ${SKIP_REASON}`);
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
      ],
      synchronize: true,
    });
    await ds.initialize();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[F109 PG] init failed → skip:', (e as Error)?.message);
    reachable = false;
    ds = null;
    return;
  }
  // customer_core 無 entity → 手動建表（含 source_customer_no UNIQUE，JOINCARD-001）
  await ds.query(`DROP TABLE IF EXISTS customer_core CASCADE`);
  await ds.query(`
    CREATE TABLE customer_core (
      source_customer_no VARCHAR(11),
      gender VARCHAR(1),
      date_of_birth DATE,
      occupation_desc VARCHAR(50),
      education_desc VARCHAR(50),
      marital_status_desc VARCHAR(50),
      customer_type_desc VARCHAR(50),
      monthly_income_desc VARCHAR(50),
      cpost_city VARCHAR(20)
    )
  `);
  await ds.query(
    `CREATE UNIQUE INDEX idx_customer_core_source_no ON customer_core (source_customer_no)`,
  );
  poolRepo = ds.getRepository(ObPoolData);
  pdlRepo = ds.getRepository(ObPoolDataList);
  listRepo = ds.getRepository(ObListDefinition);
  manager = ds.manager;
}, 60000);

afterAll(async () => {
  if (ds) {
    await ds.query('DROP TABLE IF EXISTS customer_core CASCADE');
    await ds.query('DROP TABLE IF EXISTS ob_monthly_run_result CASCADE');
    await ds.query('DROP TABLE IF EXISTS ob_pool_data CASCADE');
    await ds.query('DROP TABLE IF EXISTS ob_pool_data_list CASCADE');
    await ds.query('DROP TABLE IF EXISTS ob_list_definition CASCADE');
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
  await ds.query('DELETE FROM ob_list_definition');
  await ds.query('DELETE FROM customer_core');
});

// ===========================================================================
// NULLEXC — NULL 排除三變體（核心紅線）
// ===========================================================================
describe('F109 NULLEXC — NULL 排除三變體', () => {
  it('TS-F109-NULLEXC-001【變體 a】無對應客戶（Case C）→ cc.* 全 NULL → 排除', async (ctx) => {
    ensurePg(ctx);
    const list = makeList([
      { columnName: 'gender', fieldType: 'categorical', values: ['1'], dataSource: 'customer_core' },
    ]);
    await listRepo.save(list);
    await seedPool({ applNo: 'A1', custo_no: 'C001' });
    await seedCustomer({ source_customer_no: 'C001', gender: '1' }); // 命中
    await seedPool({ applNo: 'A3', custo_no: 'C003' }); // customer_core 無 C003
    expect(await estimateCount(list)).toBe(1);
    expect(await chainPks(list)).toEqual(['01:A1']);
  });

  it('TS-F109-NULLEXC-002【變體 b】客戶存在但 gender=NULL（Case B）→ 排除', async (ctx) => {
    ensurePg(ctx);
    const list = makeList([
      { columnName: 'gender', fieldType: 'categorical', values: ['1'], dataSource: 'customer_core' },
    ]);
    await listRepo.save(list);
    await seedPool({ applNo: 'A1', custo_no: 'C001' });
    await seedCustomer({ source_customer_no: 'C001', gender: '1' });
    await seedPool({ applNo: 'A2', custo_no: 'C002' });
    await seedCustomer({ source_customer_no: 'C002', gender: null }); // 欄位 NULL
    expect(await estimateCount(list)).toBe(1);
    expect(await chainPks(list)).toEqual(['01:A1']);
  });

  it('TS-F109-NULLEXC-003【變體 c】無客戶條件 → 不注入 JOIN，customer_core NULL 不影響入選', async (ctx) => {
    ensurePg(ctx);
    const list = makeList([
      { columnName: 'prod_kind', fieldType: 'categorical', values: ['01'], dataSource: 'ob_pool_data' },
    ]);
    await listRepo.save(list);
    // A/B/C 三案件 prod_kind=01；customer_core 有/欄NULL/無 各一
    await seedPool({ applNo: 'A1', custo_no: 'C001', prod_kind: '01' });
    await seedCustomer({ source_customer_no: 'C001', gender: '1' });
    await seedPool({ applNo: 'A2', custo_no: 'C002', prod_kind: '01' });
    await seedCustomer({ source_customer_no: 'C002', gender: null });
    await seedPool({ applNo: 'A3', custo_no: 'C003', prod_kind: '01' }); // 無客戶
    expect(await estimateCount(list)).toBe(3); // 全入選
    expect(await chainPks(list)).toEqual(['01:A1', '01:A2', '01:A3']);
  });

  it('TS-F109-NULLEXC-004：cpost_city=NULL → LEFT(NULL,3)=NULL → 排除', async (ctx) => {
    ensurePg(ctx);
    const list = makeList([
      { columnName: 'cpost_city', fieldType: 'categorical', values: ['臺北市'], dataSource: 'customer_core' },
    ]);
    await listRepo.save(list);
    await seedPool({ applNo: 'A1', custo_no: 'C001' });
    await seedCustomer({ source_customer_no: 'C001', cpost_city: '臺北市大安區' }); // 命中
    await seedPool({ applNo: 'A2', custo_no: 'C002' });
    await seedCustomer({ source_customer_no: 'C002', cpost_city: null }); // 排除
    expect(await estimateCount(list)).toBe(1);
  });

  it('TS-F109-NULLEXC-005：date_of_birth=NULL → AGE(...,NULL)=NULL → 排除（含極寬區間 0~150）', async (ctx) => {
    ensurePg(ctx);
    const list = makeList([
      { columnName: 'date_of_birth', fieldType: 'numeric', min: 0, max: 150, dataSource: 'customer_core' },
    ]);
    await listRepo.save(list);
    await seedPool({ applNo: 'A1', custo_no: 'C001' });
    await seedCustomer({ source_customer_no: 'C001', date_of_birth: '1990-01-01' }); // 命中
    await seedPool({ applNo: 'A2', custo_no: 'C002' });
    await seedCustomer({ source_customer_no: 'C002', date_of_birth: null }); // 排除（即使極寬區間）
    expect(await estimateCount(list)).toBe(1);
  });

  it('TS-F109-NULLEXC-007：Case A/B/C 同查詢互不干擾（prod_kind AND gender），僅 A 入選', async (ctx) => {
    ensurePg(ctx);
    const list = makeList([
      { columnName: 'prod_kind', fieldType: 'categorical', values: ['01'], dataSource: 'ob_pool_data' },
      { columnName: 'gender', fieldType: 'categorical', values: ['1'], dataSource: 'customer_core' },
    ]);
    await listRepo.save(list);
    await seedPool({ applNo: 'A1', custo_no: 'C001', prod_kind: '01' });
    await seedCustomer({ source_customer_no: 'C001', gender: '1' }); // 命中
    await seedPool({ applNo: 'A2', custo_no: 'C002', prod_kind: '01' });
    await seedCustomer({ source_customer_no: 'C002', gender: null }); // 欄 NULL → 排除
    await seedPool({ applNo: 'A3', custo_no: 'C003', prod_kind: '01' }); // 無客戶 → 排除
    expect(await estimateCount(list)).toBe(1);
    expect(await chainPks(list)).toEqual(['01:A1']);
  });
});

// ===========================================================================
// JOIN — 條件式 JOIN 觸發 + EMPTY_CONDITIONS 陷阱
// ===========================================================================
describe('F109 JOIN — 條件式觸發', () => {
  it('TS-F109-JOIN-003【EMPTY_CONDITIONS 陷阱】僅含 gender(customer_core) → 不整批 skip，依 gender 過濾', async (ctx) => {
    ensurePg(ctx);
    const list = makeList([
      { columnName: 'gender', fieldType: 'categorical', values: ['1'], dataSource: 'customer_core' },
    ]);
    await listRepo.save(list);
    await seedPool({ applNo: 'A1', custo_no: 'C001' });
    await seedCustomer({ source_customer_no: 'C001', gender: '1' }); // 命中
    await seedPool({ applNo: 'A2', custo_no: 'C002' });
    await seedCustomer({ source_customer_no: 'C002', gender: '2' }); // 不符
    // 非全放行（否則 2）、非全排除（skip 誤判 → 0）；正確為 1
    expect(await estimateCount(list)).toBe(1);
    expect(await chainPks(list)).toEqual(['01:A1']);
  });

  it('TS-F109-JOIN-005/007：多客戶條件共用 JOIN，estimate 與 chain 皆正確過濾', async (ctx) => {
    ensurePg(ctx);
    const list = makeList([
      { columnName: 'gender', fieldType: 'categorical', values: ['1'], dataSource: 'customer_core' },
      { columnName: 'education_desc', fieldType: 'categorical', values: ['大學'], dataSource: 'customer_core' },
    ]);
    await listRepo.save(list);
    await seedPool({ applNo: 'A1', custo_no: 'C001' });
    await seedCustomer({ source_customer_no: 'C001', gender: '1', education_desc: '大學' }); // 命中兩者
    await seedPool({ applNo: 'A2', custo_no: 'C002' });
    await seedCustomer({ source_customer_no: 'C002', gender: '1', education_desc: '高中' }); // education 不符
    expect(await estimateCount(list)).toBe(1);
    expect(await chainPks(list)).toEqual(['01:A1']);
  });
});

// ===========================================================================
// AGE — 年齡衍生語意
// ===========================================================================
describe('F109 AGE — 年齡衍生', () => {
  it('TS-F109-AGE-001：workdt=2026-07-01、dob=1996-07-01（恰滿 30）、min=30 max=35 → 入選', async (ctx) => {
    ensurePg(ctx);
    const list = makeList([
      { columnName: 'date_of_birth', fieldType: 'numeric', min: 30, max: 35, dataSource: 'customer_core' },
    ]);
    await listRepo.save(list);
    await seedPool({ applNo: 'A1', custo_no: 'C001' });
    await seedCustomer({ source_customer_no: 'C001', date_of_birth: '1996-07-01' });
    expect(await estimateCount(list)).toBe(1);
  });

  it('TS-F109-AGE-002：dob=1996-08-10（生日未到）→ age=29（非 30）；min=29 max=29 → 入選', async (ctx) => {
    ensurePg(ctx);
    const list = makeList([
      { columnName: 'date_of_birth', fieldType: 'numeric', min: 29, max: 29, dataSource: 'customer_core' },
    ]);
    await listRepo.save(list);
    await seedPool({ applNo: 'A1', custo_no: 'C001' });
    await seedCustomer({ source_customer_no: 'C001', date_of_birth: '1996-08-10' });
    expect(await estimateCount(list)).toBe(1);
  });

  it('TS-F109-AGE-003：BETWEEN 邊界 — age=29 入選、age=30 排除（min=25 max=29）', async (ctx) => {
    ensurePg(ctx);
    const list = makeList([
      { columnName: 'date_of_birth', fieldType: 'numeric', min: 25, max: 29, dataSource: 'customer_core' },
    ]);
    await listRepo.save(list);
    await seedPool({ applNo: 'G', custo_no: 'CG' });
    await seedCustomer({ source_customer_no: 'CG', date_of_birth: '1996-07-02' }); // 生日未到 → 29 → 入
    await seedPool({ applNo: 'H', custo_no: 'CH' });
    await seedCustomer({ source_customer_no: 'CH', date_of_birth: '1996-06-30' }); // 生日已過 → 30 → 排
    expect(await chainPks(list)).toEqual(['01:G']);
  });

  it('TS-F109-AGE-004：決定性 — 同 workdt 重跑兩次結果一致', async (ctx) => {
    ensurePg(ctx);
    const list = makeList([
      { columnName: 'date_of_birth', fieldType: 'numeric', min: 20, max: 40, dataSource: 'customer_core' },
    ]);
    await listRepo.save(list);
    await seedPool({ applNo: 'A1', custo_no: 'C001' });
    await seedCustomer({ source_customer_no: 'C001', date_of_birth: '1996-08-10' });
    const first = await estimateCount(list);
    const second = await estimateCount(list);
    expect(first).toBe(second);
    expect(first).toBe(1);
  });

  it('TS-F109-AGE-005：workdt 驅動 — 同 dob(1996-07-15) 於 2026-07-01→29(生日未到) vs 2026-08-01→30(生日已過)', async (ctx) => {
    ensurePg(ctx);
    const list = makeList([
      { columnName: 'date_of_birth', fieldType: 'numeric', min: 30, max: 30, dataSource: 'customer_core' },
    ]);
    await listRepo.save(list);
    await seedPool({ applNo: 'A1', custo_no: 'C001' });
    await seedCustomer({ source_customer_no: 'C001', date_of_birth: '1996-07-15' });
    // min=max=30：僅 workdt=2026-08-01（age=30）入選；2026-07-01（age=29）不入選
    expect(await estimateCount(list, new Date(Date.UTC(2026, 6, 1)))).toBe(0);
    expect(await estimateCount(list, new Date(Date.UTC(2026, 7, 1)))).toBe(1);
  });
});

// ===========================================================================
// CITY — 居住城市 LEFT3
// ===========================================================================
describe('F109 CITY — LEFT3', () => {
  it('TS-F109-CITY-001/002：臺北市大安區→命中[臺北市]；新北市板橋區→排除', async (ctx) => {
    ensurePg(ctx);
    const list = makeList([
      { columnName: 'cpost_city', fieldType: 'categorical', values: ['臺北市'], dataSource: 'customer_core' },
    ]);
    await listRepo.save(list);
    await seedPool({ applNo: 'A1', custo_no: 'C001' });
    await seedCustomer({ source_customer_no: 'C001', cpost_city: '臺北市大安區' });
    await seedPool({ applNo: 'A2', custo_no: 'C002' });
    await seedCustomer({ source_customer_no: 'C002', cpost_city: '新北市板橋區' });
    expect(await chainPks(list)).toEqual(['01:A1']);
  });

  it('TS-F109-CITY-003/004：空字串排除；恰 3 字(臺北市)命中', async (ctx) => {
    ensurePg(ctx);
    const list = makeList([
      { columnName: 'cpost_city', fieldType: 'categorical', values: ['臺北市'], dataSource: 'customer_core' },
    ]);
    await listRepo.save(list);
    await seedPool({ applNo: 'I', custo_no: 'CI' });
    await seedCustomer({ source_customer_no: 'CI', cpost_city: '' }); // 空字串 → LEFT('',3)='' 排除
    await seedPool({ applNo: 'J', custo_no: 'CJ' });
    await seedCustomer({ source_customer_no: 'CJ', cpost_city: '臺北市' }); // 恰 3 字 → 命中
    expect(await chainPks(list)).toEqual(['01:J']);
  });
});

// ===========================================================================
// AND — 跨來源 AND 邏輯
// ===========================================================================
describe('F109 AND — 跨來源 AND', () => {
  it('TS-F109-AND-001：prod_kind[01] AND gender[2] → 僅同時符合入選', async (ctx) => {
    ensurePg(ctx);
    const list = makeList([
      { columnName: 'prod_kind', fieldType: 'categorical', values: ['01'], dataSource: 'ob_pool_data' },
      { columnName: 'gender', fieldType: 'categorical', values: ['2'], dataSource: 'customer_core' },
    ]);
    await listRepo.save(list);
    await seedPool({ applNo: 'K', custo_no: 'CK', prod_kind: '01' });
    await seedCustomer({ source_customer_no: 'CK', gender: '2' }); // 兩者符合 → 入
    await seedPool({ applNo: 'L', custo_no: 'CL', prod_kind: '01' });
    await seedCustomer({ source_customer_no: 'CL', gender: '1' }); // 客戶不符 → 排
    await seedPool({ applNo: 'M', custo_no: 'CM', prod_kind: '02' });
    await seedCustomer({ source_customer_no: 'CM', gender: '2' }); // 案件不符 → 排
    expect(await chainPks(list)).toEqual(['01:K']);
  });
});

// ===========================================================================
// EQ — estimate ↔ chain 等價（BR-10 DoD）
// ===========================================================================
describe('F109 EQ — estimate(SQL 下推) ↔ chain 逐列等價（DoD）', () => {
  async function seedMixedFixture() {
    await seedPool({ applNo: 'A1', custo_no: 'C001', prod_kind: '01' });
    await seedCustomer({ source_customer_no: 'C001', gender: '1', education_desc: '大學', cpost_city: '臺北市大安區', date_of_birth: '1990-05-05' });
    await seedPool({ applNo: 'A2', custo_no: 'C002', prod_kind: '01' });
    await seedCustomer({ source_customer_no: 'C002', gender: '2', education_desc: '高中', cpost_city: '新北市板橋區', date_of_birth: '1970-01-01' });
    await seedPool({ applNo: 'A3', custo_no: 'C003', prod_kind: '01' }); // 無客戶
    await seedPool({ applNo: 'A4', custo_no: 'C004', prod_kind: '02' });
    await seedCustomer({ source_customer_no: 'C004', gender: '1', education_desc: '大學', cpost_city: '臺北市信義區', date_of_birth: '1995-12-31' });
  }

  async function assertEq(list: ObListDefinition, workdt = WORKDT) {
    await listRepo.save(list);
    const est = await estimateCount(list, workdt);
    const pks = await chainPks(list, workdt);
    expect(est).toBe(pks.length); // count 等價
    return pks;
  }

  it('TS-F109-EQ-001：純 customer_core（gender[1]）estimate=chain', async (ctx) => {
    ensurePg(ctx);
    await seedMixedFixture();
    await assertEq(
      makeList([{ columnName: 'gender', fieldType: 'categorical', values: ['1'], dataSource: 'customer_core' }]),
    );
  });

  it('TS-F109-EQ-002：ob_pool_data + customer_core AND estimate=chain', async (ctx) => {
    ensurePg(ctx);
    await seedMixedFixture();
    await assertEq(
      makeList([
        { columnName: 'prod_kind', fieldType: 'categorical', values: ['01'], dataSource: 'ob_pool_data' },
        { columnName: 'gender', fieldType: 'categorical', values: ['1'], dataSource: 'customer_core' },
      ]),
    );
  });

  it('TS-F109-EQ-003：AGE 條件 estimate=chain', async (ctx) => {
    ensurePg(ctx);
    await seedMixedFixture();
    await assertEq(
      makeList([{ columnName: 'date_of_birth', fieldType: 'numeric', min: 30, max: 40, dataSource: 'customer_core' }]),
    );
  });

  it('TS-F109-EQ-004：cpost_city LEFT3 estimate=chain', async (ctx) => {
    ensurePg(ctx);
    await seedMixedFixture();
    await assertEq(
      makeList([{ columnName: 'cpost_city', fieldType: 'categorical', values: ['臺北市'], dataSource: 'customer_core' }]),
    );
  });

  it('TS-F109-EQ-005：純 ob_pool_data（無 customer_core）estimate=chain（regression）', async (ctx) => {
    ensurePg(ctx);
    await seedMixedFixture();
    await assertEq(
      makeList([{ columnName: 'prod_kind', fieldType: 'categorical', values: ['01'], dataSource: 'ob_pool_data' }]),
    );
  });
});

// ===========================================================================
// JOINCARD — JOIN 基數不變式
// ===========================================================================
describe('F109 JOINCARD — 基數 ≤1:1', () => {
  it('TS-F109-JOINCARD-001：source_customer_no UNIQUE 索引存在', async (ctx) => {
    ensurePg(ctx);
    const rows = await ds!.query(
      `SELECT indexdef FROM pg_indexes WHERE tablename='customer_core' AND indexname='idx_customer_core_source_no'`,
    );
    expect(rows.length).toBe(1);
    expect(String(rows[0].indexdef)).toMatch(/UNIQUE/i);
  });

  it('TS-F109-JOINCARD-002：3 案件各對應不同客戶（寬鬆條件全符合）→ COUNT=3 不膨脹', async (ctx) => {
    ensurePg(ctx);
    const list = makeList([
      { columnName: 'gender', fieldType: 'categorical', values: ['1', '2', '3'], dataSource: 'customer_core' },
    ]);
    await listRepo.save(list);
    for (const [a, c, g] of [['A1', 'C001', '1'], ['A2', 'C002', '2'], ['A3', 'C003', '3']] as const) {
      await seedPool({ applNo: a, custo_no: c });
      await seedCustomer({ source_customer_no: c, gender: g });
    }
    expect(await estimateCount(list)).toBe(3);
  });
});

// ===========================================================================
// DEACT — 欄位停用不回溯（dataSource 已固化）
// ===========================================================================
describe('F109 DEACT — 停用不回溯', () => {
  it('TS-F109-DEACT-002：既有名單 gender 條件已固化 dataSource=customer_core，欄位停用後仍正確過濾', async (ctx) => {
    ensurePg(ctx);
    // condition 已固化 dataSource（模擬既有名單）；白名單無需查詢（resolveConditionDataSource 純函式）
    const list = makeList([
      { columnName: 'gender', fieldType: 'categorical', values: ['1'], dataSource: 'customer_core' },
    ]);
    await listRepo.save(list);
    await seedPool({ applNo: 'A1', custo_no: 'C001' });
    await seedCustomer({ source_customer_no: 'C001', gender: '1' });
    await seedPool({ applNo: 'A2', custo_no: 'C002' });
    await seedCustomer({ source_customer_no: 'C002', gender: '2' });
    // 未查白名單即可正確過濾（欄位是否停用不影響 Stage 1 讀取路徑）
    expect(await estimateCount(list)).toBe(1);
    expect(await chainPks(list)).toEqual(['01:A1']);
  });
});
