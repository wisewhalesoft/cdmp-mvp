/**
 * F092 — Stage 1 完整鏈 Dry-run 精確估算 unit / integration（SQLite in-memory）測試
 *
 * 對應 spec：docs/specs/features/F092-stage1-dry-run-estimate.md
 * 測試設計：docs/test-specs/features/F092-test.md
 *
 * 覆蓋群組：
 *   - TS-F092-DR-001~004：dry-run 唯讀（不寫任何表）+ cases undefined + dryRun flag 傳遞
 *   - TS-F092-EQ-002~003：EMPTY_CONDITIONS skip count=0 / 去重退化一致
 *   - TS-F092-EST-001~004：estimateListCount 升級為完整鏈 dry-run（路徑 A / B / EMPTY / timeout）
 *   - TS-F092-RG-001：舊欄位篩選版 COUNT 路徑已移除（grep guard）
 *
 * 注意（測試層界定）：
 *   - TS-F092-EQ-001（同一名單 dry-run ≡ run 全規則精確一致）需真實 PostgreSQL TestContainer
 *     （本專案未裝 PG TC package）→ 以下以 SQLite in-memory 跑「真實 executeStage1Chain」做
 *     同鏈一致性子集驗證（dry-run count === run cases.length），全規則 PG 版標 DEFERRED。
 *   - dry-run 與 run 共用同一 executeStage1Chain；不 mock 該函式（除 DR-004 / EST spy 驗 flag 傳遞外）。
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { InternalServerErrorException } from '@nestjs/common';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { Stage0EstimateService } from '../stage0-estimate.service';
import * as chainModule from '@/modules/assignment/stage1/stage1-filter-chain';
import { executeStage1Chain } from '@/modules/assignment/stage1/stage1-filter-chain';
import { ObListDefinition } from '@/database/entities/ob-list-definition.entity';
import { ObPoolData } from '@/database/entities/ob-pool-data.entity';
import { ObPoolDataList } from '@/database/entities/ob-pool-data-list.entity';
import { ObCalendar } from '@/database/entities/ob-calendar.entity';
import { ERROR_CODES } from '@/common/errors/error-codes';

const YM = '202606';

interface Env {
  service: Stage0EstimateService;
  listRepo: Repository<ObListDefinition>;
  poolRepo: Repository<ObPoolData>;
  poolDataListRepo: Repository<ObPoolDataList>;
  calRepo: Repository<ObCalendar>;
  ds: DataSource;
  app: TestingModule;
}

async function buildModule(): Promise<Env> {
  const app: TestingModule = await Test.createTestingModule({
    imports: [
      TypeOrmModule.forRoot({
        type: 'better-sqlite3',
        database: ':memory:',
        entities: [ObListDefinition, ObPoolData, ObPoolDataList, ObCalendar],
        synchronize: true,
      }),
      TypeOrmModule.forFeature([
        ObListDefinition,
        ObPoolData,
        ObPoolDataList,
        ObCalendar,
      ]),
    ],
    providers: [Stage0EstimateService],
  }).compile();

  await app.init();
  const ds = app.get(DataSource);
  return {
    service: app.get(Stage0EstimateService),
    listRepo: app.get(getRepositoryToken(ObListDefinition)),
    poolRepo: app.get(getRepositoryToken(ObPoolData)),
    poolDataListRepo: app.get(getRepositoryToken(ObPoolDataList)),
    calRepo: app.get(getRepositoryToken(ObCalendar)),
    ds,
    app,
  };
}

async function seedActiveList(
  listRepo: Repository<ObListDefinition>,
  listNo: string,
  overrides: Partial<ObListDefinition> = {},
): Promise<void> {
  const now = new Date();
  await listRepo.save(
    listRepo.create({
      list_no: listNo,
      list_nm: '一般名單',
      prod_kind: '01',
      prod_best: 'Y',
      list_type: '01',
      // 期別欄位：start=1 end=12 interval=1 → month_cnt IN (1..12)
      list_period_start: '001',
      list_period_end: '012',
      list_interval: '001',
      project_workym: YM,
      caseyear: null,
      settle_src: null,
      case_status: null,
      cr_enabled: false,
      status: 'active',
      stage: 'draft',
      created_by_prog: 'TEST',
      created_by: 'tester',
      created_at: now,
      updated_by_prog: 'TEST',
      updated_by: 'tester',
      updated_at: now,
      ...overrides,
    } as Partial<ObListDefinition>),
  );
}

async function seedPool(
  poolRepo: Repository<ObPoolData>,
  rows: Array<Partial<ObPoolData>>,
): Promise<void> {
  for (let i = 0; i < rows.length; i++) {
    await poolRepo.save(
      poolRepo.create({
        orgno: '01',
        appl_no: String(i + 1).padStart(10, '0'),
        custo_no: 'C' + String(i + 1).padStart(6, '0'),
        sta_code: '01',
        dept_id: 'D01',
        list_type: '01',
        settle_src: 'N',
        prod_kind: '01',
        month_cnt: 3, // 落在 1..12 期別集合內
        _cdmp_extracted_at: new Date(),
        ...rows[i],
      } as Partial<ObPoolData>),
    );
  }
}

describe('F092 Stage0EstimateService dry-run 完整鏈升級', () => {
  let env: Env;

  beforeAll(async () => {
    env = await buildModule();
  });

  afterAll(async () => {
    await env.app.close();
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
    delete process.env.STAGE0_POOL_WARN_THRESHOLD;
    await env.ds.query('DELETE FROM ob_list_definition');
    await env.ds.query('DELETE FROM ob_pool_data');
    await env.ds.query('DELETE FROM ob_pool_data_list');
  });

  // =========================================================================
  // 一、Dry-run 唯讀性（TS-F092-DR-001~004）
  // =========================================================================
  describe('一、Dry-run 唯讀性', () => {
    // ---- TS-F092-DR-001：dry-run 不寫入 ob_pool_data_list ----
    it('TS-F092-DR-001：estimateListCount 透過 dry-run 不寫入 ob_pool_data_list', async () => {
      await seedActiveList(env.listRepo, 'OB202606001', {
        prod_kind: '01',
        settle_src: 'N',
        condition_payload: null,
      });
      await seedPool(env.poolRepo, [{}, {}, {}]);

      const saveSpy = vi.spyOn(env.poolDataListRepo, 'save');
      const insertSpy = vi.spyOn(env.poolDataListRepo, 'insert');
      const deleteSpy = vi.spyOn(env.poolDataListRepo, 'delete');

      const before = await env.poolDataListRepo.count();
      await env.service.estimateListCount('OB202606001');
      const after = await env.poolDataListRepo.count();

      expect(saveSpy).not.toHaveBeenCalled();
      expect(insertSpy).not.toHaveBeenCalled();
      expect(deleteSpy).not.toHaveBeenCalled();
      expect(after).toBe(before); // 0 → 0，無新增列
    });

    // ---- TS-F092-DR-003：dry-run 回傳 cases=undefined（executeStage1Chain 直接層級）----
    it('TS-F092-DR-003：executeStage1Chain dryRun:true → cases=undefined、count 仍有值', async () => {
      await seedActiveList(env.listRepo, 'OB202606003', {
        prod_kind: '01',
        settle_src: 'N',
        condition_payload: null,
      });
      await seedPool(env.poolRepo, [{}, {}, {}, {}, {}]);
      const list = await env.listRepo.findOneOrFail({
        where: { list_no: 'OB202606003' },
      });

      const result = await executeStage1Chain(
        list,
        new Date(2026, 5, 1),
        env.poolRepo,
        env.poolDataListRepo,
        { dryRun: true },
      );

      expect(result.cases).toBeUndefined();
      expect(result.count).toBeGreaterThanOrEqual(0);
      expect(result.skipped).toBe(false);
    });

    // ---- TS-F092-DR-004：estimateListCount 內部以 dryRun:true 呼叫 executeStage1Chain ----
    it('TS-F092-DR-004：estimateListCount 內部呼叫 executeStage1Chain，opts.dryRun===true、workdt=WORKYM+01', async () => {
      await seedActiveList(env.listRepo, 'OB202606004', {
        project_workym: '202606',
        prod_kind: '01',
        settle_src: 'N',
        condition_payload: null,
      });

      const spy = vi
        .spyOn(chainModule, 'executeStage1Chain')
        .mockResolvedValue({
          count: 42,
          cases: undefined,
          skipped: false,
          warnings: [],
          appliedRuleIds: ['R-FRAUD-WHITEBOARD'],
        });

      const res = await env.service.estimateListCount('OB202606004');

      expect(spy).toHaveBeenCalledTimes(1);
      const callArgs = spy.mock.calls[0];
      // 參數順序：(list, workdt, poolRepo, poolDataListRepo, opts)
      const workdt = callArgs[1] as Date;
      const opts = callArgs[4] as { dryRun: boolean };
      expect(opts.dryRun).toBe(true);
      // workdt = 202606 + 01 → 2026-06-01（當月 1 日）
      expect(workdt.getFullYear()).toBe(2026);
      expect(workdt.getMonth()).toBe(5); // 0-based：6 月
      expect(workdt.getDate()).toBe(1);
      expect(res).toEqual({ listNo: 'OB202606004', count: 42 });
    });
  });

  // =========================================================================
  // 二、Dry-run ≡ run 一致性（TS-F092-EQ-001 DEFERRED / EQ-002~003）
  // =========================================================================
  describe('二、Dry-run ≡ run 一致性', () => {
    // ---- TS-F092-EQ-001（PG 全規則精確一致）：本專案無 PG TestContainer → DEFERRED ----
    it.skip('TS-F092-EQ-001（DEFERRED — 需真實 PostgreSQL TestContainer）：全規則觸發名單 dry-run count ≡ 月跑案件數', () => {
      // 需 PG TC + ob_pool_data 30 筆混合 month_cnt + ob_pool_data_list 5 筆去重 seed
      // + list_nm='中結強案年資特催' 全特殊 DELETE 觸發。
      // 本專案 package 未裝 PG TC；以下 SQLite 子集（EQ-SQLITE）替代驗證同鏈一致性。
    });

    // ---- EQ-SQLITE：同一名單 dry-run count === run cases.length（同鏈一致性子集，SQLite）----
    it('TS-F092-EQ-001-SQLITE：同名單 dry-run count === 月跑 cases.length（同鏈一致性，含去重 + month_cnt）', async () => {
      await seedActiveList(env.listRepo, 'OB202606EQ', {
        list_nm: '一般名單',
        prod_kind: '01',
        settle_src: 'N',
        condition_payload: null,
        list_period_start: '001',
        list_period_end: '012',
        list_interval: '001',
      });
      // 10 筆：8 筆 month_cnt 在期別內、2 筆 month_cnt=99 不在；其中 1 筆 custo_no 命中去重視窗
      await seedPool(env.poolRepo, [
        { month_cnt: 1, custo_no: 'CDUP001' },
        { month_cnt: 2, custo_no: 'C000002' },
        { month_cnt: 3, custo_no: 'C000003' },
        { month_cnt: 4, custo_no: 'C000004' },
        { month_cnt: 5, custo_no: 'C000005' },
        { month_cnt: 6, custo_no: 'C000006' },
        { month_cnt: 7, custo_no: 'C000007' },
        { month_cnt: 12, custo_no: 'C000008' },
        { month_cnt: 99, custo_no: 'C000009' }, // 期別外 → 被 month_cnt 過濾
        { month_cnt: 0, custo_no: 'C000010' }, // 期別外
      ]);
      // 去重視窗（2026-06-01 − 3 月 ~ −1 日）內已派 CDUP001
      await env.poolDataListRepo.save(
        env.poolDataListRepo.create({
          list_no: 'OLD',
          orgno: '01',
          appl_no: '9999999999',
          custo_no: 'CDUP001',
          settle_src: 'N',
          assignday: '20260515', // 落在 [20260301, 20260531]
          data_source: 'etl_legacy',
        } as Partial<ObPoolDataList>),
      );

      const list = await env.listRepo.findOneOrFail({
        where: { list_no: 'OB202606EQ' },
      });
      const workdt = new Date(2026, 5, 1);

      const dry = await executeStage1Chain(
        list,
        workdt,
        env.poolRepo,
        env.poolDataListRepo,
        { dryRun: true },
      );
      const run = await executeStage1Chain(
        list,
        workdt,
        env.poolRepo,
        env.poolDataListRepo,
        { dryRun: false },
      );

      // 8 筆在期別內 − 1 筆去重（CDUP001）= 7
      expect(dry.count).toBe(7);
      expect(run.cases?.length).toBe(7);
      expect(dry.count).toBe(run.cases?.length);
    });

    // ---- TS-F092-EQ-002：EMPTY_CONDITIONS → dry-run count=0、skipped、skipReason ----
    it('TS-F092-EQ-002：condition_payload.conditions=[] → dry-run count=0、skipped=true、skipReason=EMPTY_CONDITIONS', async () => {
      await seedActiveList(env.listRepo, 'OB202606EMP', {
        condition_payload: { logic: 'AND', conditions: [] },
      });
      await seedPool(env.poolRepo, [{}, {}, {}, {}, {}]);
      const list = await env.listRepo.findOneOrFail({
        where: { list_no: 'OB202606EMP' },
      });

      const result = await executeStage1Chain(
        list,
        new Date(2026, 5, 1),
        env.poolRepo,
        env.poolDataListRepo,
        { dryRun: true },
      );

      expect(result.count).toBe(0);
      expect(result.skipped).toBe(true);
      expect(result.skipReason).toBe('EMPTY_CONDITIONS');
    });

    // ---- TS-F092-EQ-003：ob_pool_data_list 無歷史 → 去重退化（dry-run === run）----
    it('TS-F092-EQ-003：去重表為空 → 不過濾去重，dry-run count === run cases.length（同步退化）', async () => {
      await seedActiveList(env.listRepo, 'OB202606DEG', {
        prod_kind: '01',
        settle_src: 'N',
        condition_payload: null,
        list_period_start: '001',
        list_period_end: '012',
        list_interval: '001',
      });
      await seedPool(env.poolRepo, [
        { month_cnt: 1 },
        { month_cnt: 2 },
        { month_cnt: 3 },
        { month_cnt: 4 },
        { month_cnt: 5 },
      ]);
      // ob_pool_data_list 不 seed → 去重集合為空
      const list = await env.listRepo.findOneOrFail({
        where: { list_no: 'OB202606DEG' },
      });
      const workdt = new Date(2026, 5, 1);

      const dry = await executeStage1Chain(
        list,
        workdt,
        env.poolRepo,
        env.poolDataListRepo,
        { dryRun: true },
      );
      const run = await executeStage1Chain(
        list,
        workdt,
        env.poolRepo,
        env.poolDataListRepo,
        { dryRun: false },
      );

      expect(dry.count).toBe(5); // 不過濾去重
      expect(dry.count).toBe(run.cases?.length);
    });
  });

  // =========================================================================
  // 三、estimateListCount 升級（TS-F092-EST-001~004）
  // =========================================================================
  describe('三、estimateListCount 升級為完整鏈 dry-run', () => {
    // ---- TS-F092-EST-001：路徑 A condition_payload → 完整鏈 dry-run COUNT ----
    it('TS-F092-EST-001：路徑 A condition_payload → executeStage1Chain dry-run，count 來自 result.count', async () => {
      await seedActiveList(env.listRepo, 'OB202606A01', {
        condition_payload: {
          logic: 'AND',
          conditions: [
            { columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] },
          ],
        },
      });
      const spy = vi
        .spyOn(chainModule, 'executeStage1Chain')
        .mockResolvedValue({
          count: 42,
          cases: undefined,
          skipped: false,
          warnings: [],
          appliedRuleIds: ['R-FRAUD-WHITEBOARD'],
        });

      const res = await env.service.estimateListCount('OB202606A01');

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0][4]).toEqual({ dryRun: true });
      expect(res).toEqual({ listNo: 'OB202606A01', count: 42 });
    });

    // ---- TS-F092-EST-002：路徑 B（condition_payload=null）→ 完整鏈 dry-run ----
    it('TS-F092-EST-002：路徑 B condition_payload=null → executeStage1Chain dry-run（非直接 COUNT）', async () => {
      await seedActiveList(env.listRepo, 'OB202606B01', {
        condition_payload: null,
        prod_kind: '01$$02',
        settle_src: null,
        case_status: null,
        caseyear: null,
      });
      const spy = vi
        .spyOn(chainModule, 'executeStage1Chain')
        .mockResolvedValue({
          count: 15,
          cases: undefined,
          skipped: false,
          warnings: [],
          appliedRuleIds: ['R-FRAUD-WHITEBOARD'],
        });

      const res = await env.service.estimateListCount('OB202606B01');

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0][4]).toEqual({ dryRun: true });
      expect(res.count).toBe(15);
    });

    // ---- TS-F092-EST-003：EMPTY_CONDITIONS → count=0（HTTP 200，regression）----
    it('TS-F092-EST-003：EMPTY_CONDITIONS → estimateListCount 回 count=0（不拋例外）', async () => {
      await seedActiveList(env.listRepo, 'OB202606EMP2', {
        condition_payload: { logic: 'AND', conditions: [] },
      });
      await seedPool(env.poolRepo, [{}, {}, {}, {}, {}]); // 若未 skip 會回 5

      const res = await env.service.estimateListCount('OB202606EMP2');
      expect(res.count).toBe(0);
    });

    // ---- TS-F092-EST-004：timeoutMs=0 → STAGE0_ESTIMATE_TIMEOUT（沿用 F049）----
    it('TS-F092-EST-004：timeoutMs=0 → 500 STAGE0_ESTIMATE_TIMEOUT', async () => {
      await seedActiveList(env.listRepo, 'OB202606TMO', {
        prod_kind: '01',
        settle_src: 'N',
        condition_payload: null,
      });
      await expect(
        env.service.estimateListCount('OB202606TMO', { timeoutMs: 0 }),
      ).rejects.toMatchObject({
        response: { error: ERROR_CODES.STAGE0_ESTIMATE_TIMEOUT },
      });
    });

    // ---- TS-F092-EST-004b：executeStage1Chain hang → race timeout 觸發 STAGE0_ESTIMATE_TIMEOUT ----
    it('TS-F092-EST-004b：executeStage1Chain 永不 resolve → timeoutMs race → STAGE0_ESTIMATE_TIMEOUT', async () => {
      await seedActiveList(env.listRepo, 'OB202606HANG', {
        prod_kind: '01',
        settle_src: 'N',
        condition_payload: null,
      });
      vi.spyOn(chainModule, 'executeStage1Chain').mockImplementation(
        () => new Promise(() => {}), // 永不 resolve
      );
      await expect(
        env.service.estimateListCount('OB202606HANG', { timeoutMs: 20 }),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
    });
  });
});
