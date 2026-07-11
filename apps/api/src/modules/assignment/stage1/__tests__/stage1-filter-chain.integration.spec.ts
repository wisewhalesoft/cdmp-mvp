/**
 * Stage1FilterChain — F091 整合測試（better-sqlite3 in-memory，真實 repo + getRawMany / getMany）
 *
 * 對應測試設計：
 *   - DD-005：去重來源聯集（etl_legacy + monthly_run + NULL data_source），SQL 不加 data_source 過濾
 *   - CH-003：月名單分派模式回完整案件列（MONTH_CNT + 去重交互）
 *   - CH-004：月名單分派 vs dry-run 同 fixture 回相同 count（F092 前置驗證）
 *
 * 本專案無 PostgreSQL TestContainer package（memory：feedback_pg_advisory_lock_sqlite_compat）；
 * 以 better-sqlite3 in-memory 跑真實 Stage 1 chain（assignday 字串比對 + custo_no 去重 + month_cnt 整數過濾）。
 * data_source 為 varchar nullable，SQLite / PG 行為一致 — 聯集（不過濾）語意可在 SQLite 完整驗證。
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { DataSource, Repository } from 'typeorm';

import { executeStage1Chain } from '../stage1-filter-chain';
import { ObListDefinition } from '@/database/entities/ob-list-definition.entity';
import { ObPoolData } from '@/database/entities/ob-pool-data.entity';
import { ObPoolDataList } from '@/database/entities/ob-pool-data-list.entity';

const WORKDT = new Date(2026, 5, 1); // 2026-06-01；去重視窗 [20260301, 20260531]

let ds: DataSource;
let poolRepo: Repository<ObPoolData>;
let pdlRepo: Repository<ObPoolDataList>;

async function makeList(opts: Partial<ObListDefinition> = {}): Promise<ObListDefinition> {
  return {
    list_no: 'OB202606001',
    list_nm: '一般名單',
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
      conditions: [{ columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] }],
    } as ObListDefinition['condition_payload'],
    created_by_prog: 'TEST',
    created_by: 'tester',
    created_at: new Date(),
    updated_by_prog: 'TEST',
    updated_by: 'tester',
    updated_at: new Date(),
    ...opts,
  } as ObListDefinition;
}

async function seedPool(opts: { applNo: string; custoNo: string; monthCnt?: number; prodKind?: string }): Promise<void> {
  await poolRepo.save(
    poolRepo.create({
      orgno: '01',
      appl_no: opts.applNo,
      custo_no: opts.custoNo,
      sta_code: '01',
      dept_id: 'D001',
      list_type: '01',
      settle_src: '01',
      prod_kind: opts.prodKind ?? '01',
      month_cnt: opts.monthCnt ?? 1,
      _cdmp_extracted_at: new Date(),
    } as Partial<ObPoolData>),
  );
}

async function seedPoolDataList(opts: {
  applNo: string;
  custoNo: string | null;
  assignday: string;
  dataSource: string | null;
}): Promise<void> {
  await pdlRepo.save(
    pdlRepo.create({
      list_no: 'HIST',
      orgno: '01',
      appl_no: opts.applNo,
      custo_no: opts.custoNo,
      assignday: opts.assignday,
      data_source: opts.dataSource,
      settle_src: '01',
    } as Partial<ObPoolDataList>),
  );
}

beforeAll(async () => {
  ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [ObListDefinition, ObPoolData, ObPoolDataList],
    synchronize: true,
  });
  await ds.initialize();
  poolRepo = ds.getRepository(ObPoolData);
  pdlRepo = ds.getRepository(ObPoolDataList);
});

afterAll(async () => {
  await ds.destroy();
});

beforeEach(async () => {
  await ds.query('DELETE FROM ob_pool_data_list');
  await ds.query('DELETE FROM ob_pool_data');
});

describe('F091 整合 — Stage1FilterChain（better-sqlite3 in-memory）', () => {
  it('DD-005：去重來源聯集（etl_legacy + monthly_run + NULL）均納入，SQL 不加 data_source 過濾', async () => {
    const list = await makeList();
    await seedPool({ applNo: 'AE1', custoNo: 'CE001' });
    await seedPool({ applNo: 'AM1', custoNo: 'CM001' });
    await seedPool({ applNo: 'AN1', custoNo: 'CN001' });
    await seedPool({ applNo: 'AX1', custoNo: 'CX001' });
    // 三種 data_source 各一筆，均在去重視窗 [20260301, 20260531] 內
    await seedPoolDataList({ applNo: 'H1', custoNo: 'CE001', assignday: '20260401', dataSource: 'etl_legacy' });
    await seedPoolDataList({ applNo: 'H2', custoNo: 'CM001', assignday: '20260415', dataSource: 'monthly_run' });
    await seedPoolDataList({ applNo: 'H3', custoNo: 'CN001', assignday: '20260420', dataSource: null });

    const result = await executeStage1Chain(list, WORKDT, poolRepo, pdlRepo, { dryRun: false });
    // CE001 / CM001 / CN001 均被去重（三種來源聯集），只剩 CX001
    expect(result.cases!.map((c) => c.custo_no)).toEqual(['CX001']);
    expect(result.count).toBe(1);
  });

  it('DD-005b：去重視窗邊界 — 視窗外 assignday 不納入去重', async () => {
    const list = await makeList();
    await seedPool({ applNo: 'A1', custoNo: 'C001' });
    await seedPool({ applNo: 'A2', custoNo: 'C002' });
    // C001 在視窗內（20260415）→ 去重；C002 在視窗外（20260201 < start 20260301）→ 不去重
    await seedPoolDataList({ applNo: 'H1', custoNo: 'C001', assignday: '20260415', dataSource: 'etl_legacy' });
    await seedPoolDataList({ applNo: 'H2', custoNo: 'C002', assignday: '20260201', dataSource: 'etl_legacy' });

    const result = await executeStage1Chain(list, WORKDT, poolRepo, pdlRepo, { dryRun: false });
    expect(result.cases!.map((c) => c.custo_no)).toEqual(['C002']);
  });

  it('DDv2-001c(int)：MAX(assignday) 為異常未來日 → 上界封頂 workdt-1（拒絕穿越本月）', async () => {
    const list = await makeList();
    await seedPool({ applNo: 'A1', custoNo: 'C001' });
    await seedPool({ applNo: 'A2', custoNo: 'C002' });
    // 表中最大 assignday = 20261231（異常未來日，> workdt-1 = 20260531）→ 上界封頂 20260531
    // C001 派於 20260410（落於 [20260301, 20260531] 視窗內）→ 去重
    // C002 派於 20261231（> 封頂上界 20260531，本月之後）→ 不去重
    await seedPoolDataList({ applNo: 'H1', custoNo: 'C001', assignday: '20260410', dataSource: 'etl_legacy' });
    await seedPoolDataList({ applNo: 'H2', custoNo: 'C002', assignday: '20261231', dataSource: 'etl_legacy' });

    const result = await executeStage1Chain(list, WORKDT, poolRepo, pdlRepo, { dryRun: false });
    // C002（未來日，被 workdt-1 封頂排除於視窗外）保留；C001 被去重
    expect(result.cases!.map((c) => c.custo_no)).toEqual(['C002']);
  });

  it('DDv2-001b(int)：MAX(assignday) 為 NULL（無歷史）→ 上界退化 workdt-1，不過濾', async () => {
    const list = await makeList();
    await seedPool({ applNo: 'A1', custoNo: 'C001' });
    await seedPool({ applNo: 'A2', custoNo: 'C002' });
    // ob_pool_data_list 全空 → MAX(assignday)=NULL → 退化 workdt-1，去重集合空 → 不過濾
    const result = await executeStage1Chain(list, WORKDT, poolRepo, pdlRepo, { dryRun: false });
    expect(result.count).toBe(2);
  });

  it('CH-003：月名單分派模式回完整案件列（MONTH_CNT 過濾 + 去重交互）', async () => {
    const list = await makeList(); // list_period 1~6 interval 1 → month_cnt IN (1..6)
    // 7 筆 month_cnt 1~6 入選 month_cnt 過濾；3 筆 month_cnt=9 被排除
    for (let i = 1; i <= 7; i++) {
      await seedPool({ applNo: `A${i}`, custoNo: `C${i}`, monthCnt: ((i - 1) % 6) + 1 });
    }
    for (let i = 8; i <= 10; i++) {
      await seedPool({ applNo: `A${i}`, custoNo: `C${i}`, monthCnt: 9 });
    }
    // 2 筆去重（C1 / C2 在視窗內）
    await seedPoolDataList({ applNo: 'H1', custoNo: 'C1', assignday: '20260410', dataSource: 'etl_legacy' });
    await seedPoolDataList({ applNo: 'H2', custoNo: 'C2', assignday: '20260410', dataSource: 'monthly_run' });

    const result = await executeStage1Chain(list, WORKDT, poolRepo, pdlRepo, { dryRun: false });
    // 10 - 3（month_cnt=9）- 2（去重 C1/C2）= 5
    expect(result.cases).toBeDefined();
    expect(result.count).toBe(5);
    expect(result.count).toBe(result.cases!.length);
    expect(result.skipped).toBe(false);
  });

  it('CH-004：月名單分派 vs dry-run 同 fixture 回相同 count（F092 前置）', async () => {
    const list = await makeList();
    for (let i = 1; i <= 7; i++) {
      await seedPool({ applNo: `A${i}`, custoNo: `C${i}`, monthCnt: ((i - 1) % 6) + 1 });
    }
    for (let i = 8; i <= 10; i++) {
      await seedPool({ applNo: `A${i}`, custoNo: `C${i}`, monthCnt: 9 });
    }
    await seedPoolDataList({ applNo: 'H1', custoNo: 'C1', assignday: '20260410', dataSource: 'etl_legacy' });
    await seedPoolDataList({ applNo: 'H2', custoNo: 'C2', assignday: '20260410', dataSource: 'monthly_run' });

    const runResult = await executeStage1Chain(list, WORKDT, poolRepo, pdlRepo, { dryRun: false });
    // dry-run 不寫表（本 chain 本就不寫表）→ 同快照再跑
    const dryResult = await executeStage1Chain(list, WORKDT, poolRepo, pdlRepo, { dryRun: true });

    expect(dryResult.count).toBe(runResult.count);
    expect(dryResult.cases).toBeUndefined();
    expect(runResult.cases).toBeDefined();
  });
});
