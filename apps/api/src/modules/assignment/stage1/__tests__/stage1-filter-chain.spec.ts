/**
 * Stage1FilterChain — F091 純函式 + mock 單元測試
 *
 * 對應 spec / 測試設計：
 *   - F091 AC-1~AC-8；F091-test MC-001~006 / DD-001~004 / SD-001~008 / CH-001~002 / CH-005 / RG-001
 *   - AD-E07-22 §22.2~§22.4 / AD-E07-23 §23.1~§23.2
 *   - ground truth SP：SP_INFOT_ASSIGNEXPORTNAMELIST_st1_list（L38~L65 / L69 / L73~L87 / L90~L112）
 *
 * 純函式測試（buildMonthCntFragment / applySpecialDeletes / computeDedupWindow）無 DB 依賴；
 * executeStage1Chain 以 mock poolRepo / poolDataListRepo（createQueryBuilder）覆蓋去重 + skip + 順序。
 *
 * mock 契約注意（memory feedback_mock_real_system_contract）：list_nm 字串比對 mock 含真實繁體中文
 * （中結 / 強案 / 滿 / 年資 / 白牌）；assignday mock 為 yyyyMMdd 字串格式（與 F090 ETL 一致）。
 */

import { describe, it, expect, vi } from 'vitest';

import {
  buildMonthCntFragment,
  applySpecialDeletes,
  computeDedupWindow,
  executeStage1Chain,
  type Stage1ChainWarning,
} from '../stage1-filter-chain';
import type { ObListDefinition } from '@/database/entities/ob-list-definition.entity';
import type { ObPoolData } from '@/database/entities/ob-pool-data.entity';
import type { ObPoolDataList } from '@/database/entities/ob-pool-data-list.entity';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeList(opts: Partial<ObListDefinition> = {}): ObListDefinition {
  return {
    list_no: 'OB202606001',
    list_nm: '一般催收名單',
    prod_kind: '',
    prod_best: 'Y',
    spec_tp: null,
    list_type: '01',
    list_period_start: '1',
    list_period_end: '6',
    list_interval: '1',
    assigned_date: null,
    total_amount: null,
    reserved_amount: null,
    is_assigned: null,
    project_workym: '202606',
    casenumber: null,
    name: null,
    caseyear: null,
    caseyearnm: null,
    settle_src: null,
    card_type: 'T1',
    status: 'active',
    stage: 'ready',
    case_status: '',
    cr_enabled: false,
    condition_payload: null,
    created_by_prog: 'TEST',
    created_by: 'tester',
    created_at: new Date(),
    updated_by_prog: 'TEST',
    updated_by: 'tester',
    updated_at: new Date(),
    ...opts,
  } as ObListDefinition;
}

function makeCase(opts: Partial<ObPoolData> = {}): ObPoolData {
  return {
    orgno: '01',
    appl_no: 'A001',
    custo_no: 'C000001',
    list_type: '01',
    spec_name: null,
    payt_term: null,
    payt_num: null,
    deal_num: null,
    appl_no_dummy: undefined,
    year_produ: null,
    month_cnt: 1,
    sta_code: '01',
    dept_id: 'D001',
    settle_src: '01',
    ...opts,
  } as unknown as ObPoolData;
}

/** mock poolRepo.createQueryBuilder：getMany 回傳指定 pool */
function mockPoolRepo(pool: ObPoolData[]) {
  const qb = {
    where: vi.fn().mockReturnThis(),
    getMany: vi.fn().mockResolvedValue(pool),
  };
  return {
    createQueryBuilder: vi.fn().mockReturnValue(qb),
    __qb: qb,
  } as unknown as import('typeorm').Repository<ObPoolData> & { __qb: typeof qb };
}

/** mock poolDataListRepo.createQueryBuilder：getRawMany 回傳去重 custo_no rows */
function mockPoolDataListRepo(custoNos: Array<string | null>) {
  const qb = {
    select: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    getRawMany: vi
      .fn()
      .mockResolvedValue(custoNos.map((c) => ({ custo_no: c }))),
  };
  return {
    createQueryBuilder: vi.fn().mockReturnValue(qb),
    __qb: qb,
  } as unknown as import('typeorm').Repository<ObPoolDataList> & {
    __qb: typeof qb;
  };
}

const WORKDT = new Date(2026, 5, 1); // 2026-06-01（month index 5 = June）

// ===========================================================================
// 一、MONTH_CNT 期別過濾（MC-001~006）
// ===========================================================================

describe('F091 一、buildMonthCntFragment（MONTH_CNT 期別過濾，SP L38~L65）', () => {
  it('MC-001：interval=1（start=1, end=6）→ [1..6]', () => {
    const f = buildMonthCntFragment(makeList({ list_period_start: '1', list_period_end: '6', list_interval: '1' }));
    expect(f).not.toBeNull();
    expect(f!.fragment).toContain('"month_cnt" IN (:...monthCntVals)');
    expect(f!.params.monthCntVals).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('MC-002：interval=2 → [1,3,5]（奇數期別）', () => {
    const f = buildMonthCntFragment(makeList({ list_period_start: '1', list_period_end: '6', list_interval: '2' }));
    expect(f!.params.monthCntVals).toEqual([1, 3, 5]);
  });

  it('MC-003：start=end=6 → [6]（單一期別）', () => {
    const f = buildMonthCntFragment(makeList({ list_period_start: '6', list_period_end: '6', list_interval: '1' }));
    expect(f).not.toBeNull();
    expect(f!.params.monthCntVals).toEqual([6]);
  });

  it('MC-004：interval > (end-start) → 只產生 start 一個值 [3]', () => {
    const f = buildMonthCntFragment(makeList({ list_period_start: '3', list_period_end: '5', list_interval: '10' }));
    expect(f!.params.monthCntVals).toEqual([3]);
  });

  describe('MC-005：缺值 / 非法 interval → skip + warning（不 throw）', () => {
    it('5a：list_period_start 缺值 → null + warning', () => {
      const warnings: Stage1ChainWarning[] = [];
      const f = buildMonthCntFragment(
        makeList({ list_period_start: null as unknown as string, list_period_end: '6', list_interval: '1' }),
        warnings,
      );
      expect(f).toBeNull();
      expect(warnings.some((w) => w.code === 'MONTH_CNT_PERIOD_INCOMPLETE')).toBe(true);
    });

    it('5b：list_period_end 缺值 → null', () => {
      const f = buildMonthCntFragment(
        makeList({ list_period_start: '1', list_period_end: null as unknown as string, list_interval: '1' }),
      );
      expect(f).toBeNull();
    });

    it('5c：list_interval = 0 → null + MONTH_CNT_INTERVAL_INVALID warning（防 infinite loop）', () => {
      const warnings: Stage1ChainWarning[] = [];
      const f = buildMonthCntFragment(
        makeList({ list_period_start: '1', list_period_end: '6', list_interval: '0' }),
        warnings,
      );
      expect(f).toBeNull();
      expect(warnings.some((w) => w.code === 'MONTH_CNT_INTERVAL_INVALID')).toBe(true);
    });

    it('5c-2：list_interval 負值 → null', () => {
      const f = buildMonthCntFragment(makeList({ list_period_start: '1', list_period_end: '6', list_interval: '-1' }));
      expect(f).toBeNull();
    });
  });

  it('MC-006：fragment 以 AND 連接至欄位篩選（executeStage1Chain 組合驗證）', async () => {
    const list = makeList({
      list_period_start: '1',
      list_period_end: '3',
      list_interval: '1',
      condition_payload: {
        logic: 'AND',
        conditions: [{ columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] }],
      } as ObListDefinition['condition_payload'],
    });
    const poolRepo = mockPoolRepo([]);
    const pdlRepo = mockPoolDataListRepo([]);
    await executeStage1Chain(list, WORKDT, poolRepo, pdlRepo, { dryRun: false });

    const [whereClause] = poolRepo.__qb.where.mock.calls[0];
    expect(whereClause).toContain('"prod_kind" IN');
    expect(whereClause).toContain('"month_cnt" IN (:...monthCntVals)');
    // 以 AND 連接（非 OR）
    expect(whereClause).toContain(') AND (');
    expect(whereClause).not.toContain(' OR ');
  });
});

// ===========================================================================
// 二、近 3 個月去重（DD-001~004）
// ===========================================================================

describe('F091 二、近 3 個月去重（SP L73~L87）', () => {
  it('DD-001：去重視窗計算正確（assigndayStart=workdt-3月, assigndayEnd=workdt-1日，yyyyMMdd）', () => {
    const { assigndayStart, assigndayEnd } = computeDedupWindow(new Date(2026, 5, 1)); // 2026-06-01
    expect(assigndayStart).toBe('20260301');
    expect(assigndayEnd).toBe('20260531');
    expect(assigndayStart).toHaveLength(8);
    expect(assigndayEnd).toHaveLength(8);
  });

  it('DD-002：custo_no 在去重集合 → 從結果刪除', async () => {
    const list = makeList({
      condition_payload: { logic: 'AND', conditions: [{ columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] }] } as ObListDefinition['condition_payload'],
    });
    const pool = [
      makeCase({ appl_no: 'A1', custo_no: 'C000001' }),
      makeCase({ appl_no: 'A2', custo_no: 'C000002' }),
      makeCase({ appl_no: 'A3', custo_no: 'C000003' }),
      makeCase({ appl_no: 'A4', custo_no: 'C000004' }),
      makeCase({ appl_no: 'A5', custo_no: 'C000005' }),
    ];
    const poolRepo = mockPoolRepo(pool);
    const pdlRepo = mockPoolDataListRepo(['C000001', 'C000002']);

    const result = await executeStage1Chain(list, WORKDT, poolRepo, pdlRepo, { dryRun: false });
    expect(result.cases!.map((c) => c.custo_no).sort()).toEqual(['C000003', 'C000004', 'C000005']);
    expect(result.count).toBe(3);
  });

  it('DD-003：custo_no IS NULL 的案件不被誤排除', async () => {
    const list = makeList({
      condition_payload: { logic: 'AND', conditions: [{ columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] }] } as ObListDefinition['condition_payload'],
    });
    const pool = [
      makeCase({ appl_no: 'A1', custo_no: 'C000001' }),
      makeCase({ appl_no: 'A2', custo_no: null as unknown as string }),
    ];
    const poolRepo = mockPoolRepo(pool);
    const pdlRepo = mockPoolDataListRepo(['C000001']);

    const result = await executeStage1Chain(list, WORKDT, poolRepo, pdlRepo, { dryRun: false });
    // C000001 被去重；custo_no=null 案件保留
    expect(result.cases!.map((c) => c.appl_no)).toEqual(['A2']);
    // 去重查詢 SQL 含 custo_no IS NOT NULL（不把 NULL 加入去重集合）
    expect(pdlRepo.__qb.andWhere.mock.calls.some((c) => String(c[0]).includes('custo_no IS NOT NULL'))).toBe(true);
  });

  it('DD-004：無歷史（去重集合為空）→ 不過濾（退化行為）', async () => {
    const list = makeList({
      condition_payload: { logic: 'AND', conditions: [{ columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] }] } as ObListDefinition['condition_payload'],
    });
    const pool = Array.from({ length: 10 }, (_, i) => makeCase({ appl_no: `A${i}`, custo_no: `C${i}` }));
    const poolRepo = mockPoolRepo(pool);
    const pdlRepo = mockPoolDataListRepo([]);

    const result = await executeStage1Chain(list, WORKDT, poolRepo, pdlRepo, { dryRun: false });
    expect(result.count).toBe(10);
  });
});

// ===========================================================================
// 三、特殊 DELETE（SD-001~008）— applySpecialDeletes 純函式
// ===========================================================================

describe('F091 三、applySpecialDeletes（特殊 DELETE，SP L69 / L90~L112）', () => {
  it('SD-001：詐騙白牌 — list_type=01 AND spec_name 含白牌（無條件，不依賴 list_nm）', () => {
    const list = makeList({ list_nm: '一般催收名單' });
    const pool = [
      makeCase({ appl_no: 'A1', list_type: '01', spec_name: '詐騙白牌方案' }), // 排除
      makeCase({ appl_no: 'A2', list_type: '02', spec_name: '詐騙白牌方案' }), // list_type 不符
      makeCase({ appl_no: 'A3', list_type: '01', spec_name: '一般方案' }),     // spec_name 不含白牌
    ];
    const out = applySpecialDeletes(pool, list, WORKDT);
    expect(out.map((c) => c.appl_no).sort()).toEqual(['A2', 'A3']);
  });

  it('SD-002：中結強案 — payt_term>=deal_num-3 排除；appl_no T/Y 開頭排除', () => {
    const list = makeList({ list_nm: '中結強案特催名單' });
    const pool = [
      makeCase({ appl_no: 'A001', payt_term: 21, deal_num: '24' }), // 21>=21 排除
      makeCase({ appl_no: 'A002', payt_term: 20, deal_num: '24' }), // 20<21 保留
      makeCase({ appl_no: 'T003', payt_term: 5, deal_num: '36' }),  // T 開頭排除
      makeCase({ appl_no: 'Y004', payt_term: 5, deal_num: '36' }),  // Y 開頭排除
    ];
    const out = applySpecialDeletes(pool, list, WORKDT);
    expect(out.map((c) => c.appl_no)).toEqual(['A002']);
  });

  it('SD-003：中結強案邊界 — payt_term=deal_num-4 保留；=deal_num-3 排除', () => {
    const list = makeList({ list_nm: '中結強案名單' });
    const pool = [
      makeCase({ appl_no: 'B1', payt_term: 20, deal_num: '24' }), // 20 < 21 保留
      makeCase({ appl_no: 'B2', payt_term: 21, deal_num: '24' }), // 21 >= 21 排除
    ];
    const out = applySpecialDeletes(pool, list, WORKDT);
    expect(out.map((c) => c.appl_no)).toEqual(['B1']);
  });

  it('SD-004：中結 — payt_num>deal_num-8 AND spec_name 含滿', () => {
    const list = makeList({ list_nm: '中結定型化契約名單' });
    const pool = [
      makeCase({ appl_no: 'A1', payt_num: 17, deal_num: '24', spec_name: '信貸滿期' }), // 17>16 且含滿 排除
      makeCase({ appl_no: 'A2', payt_num: 16, deal_num: '24', spec_name: '信貸滿期' }), // 16=16 非> 保留
      makeCase({ appl_no: 'A3', payt_num: 17, deal_num: '24', spec_name: '一般方案' }), // 不含滿 保留
    ];
    const out = applySpecialDeletes(pool, list, WORKDT);
    expect(out.map((c) => c.appl_no).sort()).toEqual(['A2', 'A3']);
  });

  it('SD-005：年資 15 年 — year_produ < 當年-15（字串比較）；null→1900 排除', () => {
    const list = makeList({ list_nm: '年資管理名單' });
    // workdt=2026 → 閾值 '2011'
    const pool = [
      makeCase({ appl_no: 'A1', year_produ: '2010' }), // '2010'<'2011' 排除
      makeCase({ appl_no: 'A2', year_produ: '2011' }), // '2011'≮'2011' 保留
      makeCase({ appl_no: 'A3', year_produ: '2020' }), // 保留
      makeCase({ appl_no: 'A4', year_produ: null as unknown as string }), // null→'1900'<'2011' 排除
    ];
    const out = applySpecialDeletes(pool, list, WORKDT);
    expect(out.map((c) => c.appl_no).sort()).toEqual(['A2', 'A3']);
  });

  it('SD-006：中結強案 AND 中結雙重套用（不合併，依 SP 順序）', () => {
    const list = makeList({ list_nm: '中結強案方案' });
    const pool = [
      makeCase({ appl_no: 'A', payt_term: 21, deal_num: '24', payt_num: 0, spec_name: '一般' }), // AC-3 排除
      makeCase({ appl_no: 'B', payt_term: 5, deal_num: '24', payt_num: 17, spec_name: '信貸滿期' }), // AC-3 不排除；AC-4 排除
      makeCase({ appl_no: 'C', payt_term: 5, deal_num: '24', payt_num: 5, spec_name: '一般' }), // 均保留
    ];
    const out = applySpecialDeletes(pool, list, WORKDT);
    expect(out.map((c) => c.appl_no)).toEqual(['C']);
  });

  it('SD-007：非觸發名單不受 list_nm 規則影響（但詐騙白牌無條件仍套用）', () => {
    const list = makeList({ list_nm: '一般催收名單' });
    const pool = [
      makeCase({ appl_no: 'A1', payt_term: 99, deal_num: '24' }),       // 若中結強案觸發會排除
      makeCase({ appl_no: 'T2', payt_term: 1, deal_num: '24' }),         // T 開頭，若觸發會排除
      makeCase({ appl_no: 'A3', year_produ: '1900' }),                   // 若年資觸發會排除
      makeCase({ appl_no: 'A4', payt_num: 99, deal_num: '24', spec_name: '滿期' }), // 若中結觸發會排除
      makeCase({ appl_no: 'A5', list_type: '01', spec_name: '白牌專案' }), // 詐騙白牌無條件排除
    ];
    const out = applySpecialDeletes(pool, list, WORKDT);
    expect(out.map((c) => c.appl_no).sort()).toEqual(['A1', 'A3', 'A4', 'T2']);
  });

  it('SD-008：deal_num 型別轉換 — string 含小數點需 Number() 轉換（regression guard）', () => {
    const list = makeList({ list_nm: '中結強案名單' });
    const pool = [
      makeCase({ appl_no: 'A1', payt_term: 21, deal_num: '24.0' }), // Number('24.0')-3=21；21>=21 排除
    ];
    const out = applySpecialDeletes(pool, list, WORKDT);
    expect(out).toHaveLength(0);
  });
});

// ===========================================================================
// 四、Stage1FilterChain 封裝（CH-001~002, CH-005）
// ===========================================================================

describe('F091 四、executeStage1Chain 封裝（AC-7 / AC-8）', () => {
  it('CH-001：執行順序 — 詐騙白牌在去重之前；去重 DB query 被呼叫', async () => {
    const list = makeList({
      list_nm: '中結強案年資名單',
      condition_payload: { logic: 'AND', conditions: [{ columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] }] } as ObListDefinition['condition_payload'],
    });
    const pool = [makeCase({ appl_no: 'A1', custo_no: 'C1' })];
    const poolRepo = mockPoolRepo(pool);
    const pdlRepo = mockPoolDataListRepo(['CX']);

    await executeStage1Chain(list, WORKDT, poolRepo, pdlRepo, { dryRun: false });
    // 欄位篩選 + month_cnt 撈 pool（poolRepo）+ 去重查詢（pdlRepo）皆被呼叫
    expect(poolRepo.createQueryBuilder).toHaveBeenCalled();
    expect(pdlRepo.createQueryBuilder).toHaveBeenCalled();
  });

  it('CH-002：EMPTY_CONDITIONS skip 保留 — 不撈 pool / 不去重', async () => {
    const list = makeList({
      condition_payload: { logic: 'AND', conditions: [], _backfill_empty: true } as ObListDefinition['condition_payload'],
    });
    const poolRepo = mockPoolRepo([]);
    const pdlRepo = mockPoolDataListRepo(['C1']);

    const result = await executeStage1Chain(list, WORKDT, poolRepo, pdlRepo, { dryRun: false });
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe('EMPTY_CONDITIONS');
    expect(result.count).toBe(0);
    // skip 後不繼續下游：不撈 pool、不去重
    expect(poolRepo.createQueryBuilder).not.toHaveBeenCalled();
    expect(pdlRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('CH-005：MONTH_CNT skip（list_period_* null）→ 月跑仍繼續（不阻擋）+ warning', async () => {
    const list = makeList({
      list_period_start: null as unknown as string,
      condition_payload: { logic: 'AND', conditions: [{ columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] }] } as ObListDefinition['condition_payload'],
    });
    const pool = [makeCase({ appl_no: 'A1', custo_no: 'C1', month_cnt: null as unknown as number })];
    const poolRepo = mockPoolRepo(pool);
    const pdlRepo = mockPoolDataListRepo([]);

    const result = await executeStage1Chain(list, WORKDT, poolRepo, pdlRepo, { dryRun: false });
    expect(result.skipped).toBe(false);
    expect(result.count).toBe(1);
    expect(result.warnings.some((w) => w.code === 'MONTH_CNT_PERIOD_INCOMPLETE')).toBe(true);
    // month_cnt fragment 缺失 → where 不含 month_cnt
    const [whereClause] = poolRepo.__qb.where.mock.calls[0] ?? [''];
    expect(whereClause).not.toContain('month_cnt');
  });

  it('CH dry-run：dryRun:true 回 count 不回 cases', async () => {
    const list = makeList({
      condition_payload: { logic: 'AND', conditions: [{ columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] }] } as ObListDefinition['condition_payload'],
    });
    const pool = [makeCase({ appl_no: 'A1', custo_no: 'C1' }), makeCase({ appl_no: 'A2', custo_no: 'C2' })];
    const result = await executeStage1Chain(list, WORKDT, mockPoolRepo(pool), mockPoolDataListRepo([]), { dryRun: true });
    expect(result.count).toBe(2);
    expect(result.cases).toBeUndefined();
  });
});
