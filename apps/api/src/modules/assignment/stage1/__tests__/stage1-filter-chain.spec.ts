/**
 * Stage1FilterChain — F091 v2.0 純函式 + mock 單元測試（SP 修正版）
 *
 * 對應 spec / 測試設計：
 *   - F091 v2.0 AC-1~AC-8；F091-test v2.0 MC-001~006 / DDv2-001a~c / SDv2-001~009 / CH-001v2 / RGv2-001~005
 *   - AD-E07-22 §22.2~§22.4 / AD-E07-25 §25.5（去重上界）/ AD-E07-26 §26.2（trigger SP 修正）
 *   - ground truth SP：SP_INFOT_ASSIGNEXPORTNAMELIST_st1_list（UTF-16LE 解碼後）
 *       L66~L68 詐騙白牌 / L73~L87 去重 / L89~L94 機車期中 / L97~L100 期中小資 / L105~L108 年以上
 *
 * 純函式測試（buildMonthCntFragment / applySpecialDeletes）無 DB 依賴；
 * computeDedupWindow / executeStage1Chain 以 mock poolRepo / poolDataListRepo 覆蓋去重上界 + skip + 順序。
 *
 * ⚠️ v2.0 mock 契約（memory feedback_mock_real_system_contract / F091 BR-8）：
 *   list_nm 字串比對 mock 必須含 SP 正確繁體中文（期中 / 機車 / 小資 / 年以上 / 白牌），
 *   禁止沿用 v1.0 誤判字（中結 / 強案 / 年資 / 滿）；assignday mock 為 yyyyMMdd 字串格式。
 */

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import * as path from 'path';

import {
  buildMonthCntFragment,
  applySpecialDeletes,
  computeDedupWindow,
  executeStage1Chain,
  type Stage1ChainWarning,
} from '../stage1-filter-chain';
import { deriveAppliedSpecialRules } from '../special-rules';
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

/**
 * mock poolDataListRepo.createQueryBuilder：
 *   - getRawOne → { max } 提供 computeDedupWindow 的 MAX(assignday) 上界（v2.0）
 *   - getRawMany → 去重 custo_no rows
 * opts.maxAssignday：MAX(assignday) 上界（null → 退化 workdt-1）
 */
function mockPoolDataListRepo(
  custoNos: Array<string | null>,
  opts: { maxAssignday?: string | null } = {},
) {
  const qb = {
    select: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    getRawOne: vi
      .fn()
      .mockResolvedValue({ max: opts.maxAssignday ?? null }),
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
// 一、MONTH_CNT 期別過濾（MC-001~006，v1.0 維持不受 v2.0 影響）
// ===========================================================================

describe('F091 一、buildMonthCntFragment（MONTH_CNT 期別過濾，SP L37~L65）', () => {
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
// 二、近 3 個月去重（DDv2-001a~c 上界動態計算 + DD-002~004 filter）
// ===========================================================================

describe('F091 二、近 3 個月去重（SP L73~L87，v2.0 上界 MIN(MAX(assignday), workdt-1)）', () => {
  it('DDv2-001a：MAX(assignday) 早於 workdt-1 → 取 MAX（MIN 較小者）', async () => {
    const pdlRepo = mockPoolDataListRepo([], { maxAssignday: '20260415' });
    const { assigndayStart, assigndayEnd } = await computeDedupWindow(WORKDT, pdlRepo);
    expect(assigndayStart).toBe('20260301'); // workdt − 3 月
    expect(assigndayEnd).toBe('20260415'); // MIN('20260415', '20260531')
  });

  it('DDv2-001b：MAX(assignday) 為 NULL（無歷史）→ 退化 workdt-1（不 throw）', async () => {
    const pdlRepo = mockPoolDataListRepo([], { maxAssignday: null });
    const { assigndayStart, assigndayEnd } = await computeDedupWindow(WORKDT, pdlRepo);
    expect(assigndayStart).toBe('20260301');
    expect(assigndayEnd).toBe('20260531'); // 退化 workdt − 1 日
  });

  it('DDv2-001c：MAX(assignday) 晚於 workdt-1（異常未來日）→ 取 workdt-1（拒絕穿越本月）', async () => {
    const pdlRepo = mockPoolDataListRepo([], { maxAssignday: '20261231' });
    const { assigndayEnd } = await computeDedupWindow(WORKDT, pdlRepo);
    expect(assigndayEnd).toBe('20260531'); // MIN('20261231', '20260531')
  });

  it('DD-001：去重視窗 yyyyMMdd 格式（8 字元字串）', async () => {
    const pdlRepo = mockPoolDataListRepo([], { maxAssignday: null });
    const { assigndayStart, assigndayEnd } = await computeDedupWindow(WORKDT, pdlRepo);
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
    const pdlRepo = mockPoolDataListRepo(['C000001', 'C000002'], { maxAssignday: '20260415' });

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
    const pdlRepo = mockPoolDataListRepo(['C000001'], { maxAssignday: '20260415' });

    const result = await executeStage1Chain(list, WORKDT, poolRepo, pdlRepo, { dryRun: false });
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
    const pdlRepo = mockPoolDataListRepo([], { maxAssignday: null });

    const result = await executeStage1Chain(list, WORKDT, poolRepo, pdlRepo, { dryRun: false });
    expect(result.count).toBe(10);
  });
});

// ===========================================================================
// 三、特例 DELETE v2.0（SDv2-001~009）— applySpecialDeletes 純函式
// ===========================================================================

describe('F091 三、applySpecialDeletes v2.0（特例 DELETE，SP L66~L68 / L89~L108）', () => {
  it('SDv2-001：詐騙白牌 — list_type=01 AND spec_name 含白牌（無條件，不依賴 list_nm）', () => {
    const list = makeList({ list_nm: '一般催收名單' });
    const pool = [
      makeCase({ appl_no: 'A1', list_type: '01', spec_name: '詐騙白牌方案' }), // 排除
      makeCase({ appl_no: 'A2', list_type: '02', spec_name: '詐騙白牌方案' }), // list_type 不符
      makeCase({ appl_no: 'A3', list_type: '01', spec_name: '一般方案' }),     // spec_name 不含白牌
    ];
    const out = applySpecialDeletes(pool, list, WORKDT);
    expect(out.map((c) => c.appl_no).sort()).toEqual(['A2', 'A3']);
  });

  it('SDv2-002：機車期中 — list_nm 含「期中」+「機車」→ payt_term>=deal_num-3 排除；appl_no T/Y 開頭排除', () => {
    const list = makeList({ list_nm: '機車期中催收名單' });
    const pool = [
      makeCase({ appl_no: 'A001', payt_term: 21, deal_num: '24' }), // 21>=21 排除
      makeCase({ appl_no: 'A002', payt_term: 20, deal_num: '24' }), // 20<21 保留
      makeCase({ appl_no: 'T003', payt_term: 5, deal_num: '36' }),  // T 開頭排除
      makeCase({ appl_no: 'Y004', payt_term: 5, deal_num: '36' }),  // Y 開頭排除
    ];
    const out = applySpecialDeletes(pool, list, WORKDT);
    expect(out.map((c) => c.appl_no)).toEqual(['A002']);
  });

  it('SDv2-003：機車期中邊界 — payt_term=deal_num-4 保留；=deal_num-3 排除', () => {
    const list = makeList({ list_nm: '機車期中優先名單' });
    const pool = [
      makeCase({ appl_no: 'B001', payt_term: 20, deal_num: '24' }), // 20 = 24-4 < 21 保留
      makeCase({ appl_no: 'B002', payt_term: 21, deal_num: '24' }), // 21 = 24-3 排除
    ];
    const out = applySpecialDeletes(pool, list, WORKDT);
    expect(out.map((c) => c.appl_no)).toEqual(['B001']);
  });

  it('SDv2-004：期中小資 — list_nm 含「期中」→ payt_num>deal_num-8 AND spec_name 含「小資」排除', () => {
    const list = makeList({ list_nm: '期中催收名單' }); // 含「期中」不含「機車」
    const pool = [
      makeCase({ appl_no: 'A1', payt_num: 17, deal_num: '24', spec_name: '小資分期方案' }), // 17>16 且含小資 排除
      makeCase({ appl_no: 'A2', payt_num: 16, deal_num: '24', spec_name: '小資分期方案' }), // 16=16 非> 保留
      makeCase({ appl_no: 'A3', payt_num: 17, deal_num: '24', spec_name: '一般方案' }),     // 不含小資 保留
    ];
    const out = applySpecialDeletes(pool, list, WORKDT);
    expect(out.map((c) => c.appl_no).sort()).toEqual(['A2', 'A3']);
  });

  it('SDv2-005：期中小資邊界 — payt_num=deal_num-8 保留；=deal_num-7 排除', () => {
    const list = makeList({ list_nm: '期中個人信貸名單' });
    const pool = [
      makeCase({ appl_no: 'A1', payt_num: 16, deal_num: '24', spec_name: '小資方案' }), // 16=24-8 非> 保留
      makeCase({ appl_no: 'A2', payt_num: 17, deal_num: '24', spec_name: '小資方案' }), // 17>16 排除
    ];
    const out = applySpecialDeletes(pool, list, WORKDT);
    expect(out.map((c) => c.appl_no)).toEqual(['A1']);
  });

  it('SDv2-006：年以上 — list_nm 含「年以上」→ parseInt(year_produ) < 當年-15 排除；null→1900 排除', () => {
    const list = makeList({ list_nm: '5年以上車主催收名單' });
    // workdt=2026 → cutoffYear=2011
    const pool = [
      makeCase({ appl_no: 'A1', year_produ: '2010' }), // 2010<2011 排除
      makeCase({ appl_no: 'A2', year_produ: '2011' }), // 2011≮2011 保留
      makeCase({ appl_no: 'A3', year_produ: '2020' }), // 保留
      makeCase({ appl_no: 'A4', year_produ: null as unknown as string }), // null→1900<2011 排除
    ];
    const out = applySpecialDeletes(pool, list, WORKDT);
    expect(out.map((c) => c.appl_no).sort()).toEqual(['A2', 'A3']);
  });

  it('SDv2-007：年以上 — year_produ 非數值防禦（parseInt → NaN，NaN<cutoff=false → 保留，不 throw）', () => {
    const list = makeList({ list_nm: '3年以上機車名單' });
    const pool = [
      makeCase({ appl_no: 'A1', year_produ: '' }),     // parseInt('')=NaN → 保留
      makeCase({ appl_no: 'A2', year_produ: 'N/A' }),  // parseInt('N/A')=NaN → 保留
      makeCase({ appl_no: 'A3', year_produ: '200' }),  // 200<2011 排除
    ];
    expect(() => applySpecialDeletes(pool, list, WORKDT)).not.toThrow();
    const out = applySpecialDeletes(pool, list, WORKDT);
    expect(out.map((c) => c.appl_no).sort()).toEqual(['A1', 'A2']);
  });

  it('SDv2-008：含「期中機車」名單 — 機車期中 + 期中小資雙重套用（不合併，依 SP 順序）', () => {
    const list = makeList({ list_nm: '機車期中小資催收名單' }); // 含「期中」+「機車」
    const pool = [
      // A：機車期中（payt_term=21>=21）排除
      makeCase({ appl_no: 'A001', payt_term: 21, deal_num: '24', payt_num: 5, spec_name: '一般' }),
      // B：機車期中不排（payt_term=5），期中小資（payt_num=17>16 + 小資）排除
      makeCase({ appl_no: 'B001', payt_term: 5, deal_num: '24', payt_num: 17, spec_name: '小資方案' }),
      // C：兩規則均不排
      makeCase({ appl_no: 'C001', payt_term: 5, deal_num: '24', payt_num: 5, spec_name: '一般' }),
    ];
    const out = applySpecialDeletes(pool, list, WORKDT);
    expect(out.map((c) => c.appl_no)).toEqual(['C001']);
  });

  describe('SDv2-009：非 v2.0 觸發名單不受影響', () => {
    it('9a：一般名單 — 僅詐騙白牌被排除，list_nm 規則不觸發', () => {
      const list = makeList({ list_nm: '一般催收名單' });
      const pool = [
        makeCase({ appl_no: 'A1', payt_term: 99, deal_num: '24' }),                  // 若機車期中觸發會排除
        makeCase({ appl_no: 'T2', payt_term: 1, deal_num: '24' }),                    // T 開頭，若觸發會排除
        makeCase({ appl_no: 'A3', year_produ: '1900' }),                             // 若年以上觸發會排除
        makeCase({ appl_no: 'A4', payt_num: 99, deal_num: '24', spec_name: '小資方案' }), // 若期中小資觸發會排除
        makeCase({ appl_no: 'A5', list_type: '01', spec_name: '白牌專案' }),          // 詐騙白牌無條件排除
      ];
      const out = applySpecialDeletes(pool, list, WORKDT);
      expect(out.map((c) => c.appl_no).sort()).toEqual(['A1', 'A3', 'A4', 'T2']);
    });

    it('9b：含 v1.0 誤判字「中結強案年資」名單 — 機車期中/期中小資/年以上均不觸發（Regression guard）', () => {
      const list = makeList({ list_nm: '中結強案年資催收名單' }); // 無 v2.0 正確觸發字
      const pool = [
        makeCase({ appl_no: 'A1', payt_term: 99, deal_num: '24', payt_num: 99, spec_name: '小資方案', year_produ: '1900' }),
        makeCase({ appl_no: 'A2', list_type: '01', spec_name: '詐騙白牌方案' }), // 詐騙白牌無條件排除
      ];
      const out = applySpecialDeletes(pool, list, WORKDT);
      // 第 1 筆保留（v2.0 list_nm 規則不觸發）；詐騙白牌排除
      expect(out.map((c) => c.appl_no)).toEqual(['A1']);
    });

    it('9c：含「年資」但不含「年以上」名單 — R-YEAR-ABOVE 不觸發', () => {
      const list = makeList({ list_nm: '年資管理名單' });
      const pool = [makeCase({ appl_no: 'A1', year_produ: '2005' })]; // 距今>15 年，若觸發會排除
      const out = applySpecialDeletes(pool, list, WORKDT);
      expect(out.map((c) => c.appl_no)).toEqual(['A1']); // 保留
    });
  });

  it('SDv2-002b：deal_num 型別轉換 — string 含小數點需 Number() 轉換（regression guard）', () => {
    const list = makeList({ list_nm: '機車期中名單' });
    const pool = [
      makeCase({ appl_no: 'A1', payt_term: 21, deal_num: '24.0' }), // Number('24.0')-3=21；21>=21 排除
    ];
    const out = applySpecialDeletes(pool, list, WORKDT);
    expect(out).toHaveLength(0);
  });
});

// ===========================================================================
// 四、executeStage1Chain 封裝（CH-001v2 + CH-002~005）
// ===========================================================================

describe('F091 四、executeStage1Chain 封裝（AC-7 / AC-8）', () => {
  it('CH-001v2：全規則觸發名單（機車期中小資5年以上）— 欄位篩選 + 去重 DB query 皆呼叫；回 appliedRuleIds', async () => {
    const list = makeList({
      list_nm: '機車期中小資5年以上催收名單', // v2.0：含「機車」+「期中」+「年以上」全觸發
      condition_payload: { logic: 'AND', conditions: [{ columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] }] } as ObListDefinition['condition_payload'],
    });
    const pool = [makeCase({ appl_no: 'A1', custo_no: 'C1' })];
    const poolRepo = mockPoolRepo(pool);
    const pdlRepo = mockPoolDataListRepo(['CX'], { maxAssignday: '20260415' });

    const result = await executeStage1Chain(list, WORKDT, poolRepo, pdlRepo, { dryRun: false });
    expect(poolRepo.createQueryBuilder).toHaveBeenCalled();
    expect(pdlRepo.createQueryBuilder).toHaveBeenCalled();
    // appliedRuleIds 含全 4 規則，順序 fraud → motorcycle → xiaozi → year-above
    expect(result.appliedRuleIds).toEqual([
      'R-FRAUD-WHITEBOARD',
      'R-PERIOD-MOTORCYCLE',
      'R-PERIOD-XIAOZI',
      'R-YEAR-ABOVE',
    ]);
  });

  it('CH-002：EMPTY_CONDITIONS skip 保留 — 不撈 pool / 不去重（appliedRuleIds 仍回報）', async () => {
    const list = makeList({
      list_nm: '機車期中名單',
      condition_payload: { logic: 'AND', conditions: [], _backfill_empty: true } as ObListDefinition['condition_payload'],
    });
    const poolRepo = mockPoolRepo([]);
    const pdlRepo = mockPoolDataListRepo(['C1']);

    const result = await executeStage1Chain(list, WORKDT, poolRepo, pdlRepo, { dryRun: false });
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe('EMPTY_CONDITIONS');
    expect(result.count).toBe(0);
    expect(poolRepo.createQueryBuilder).not.toHaveBeenCalled();
    expect(pdlRepo.createQueryBuilder).not.toHaveBeenCalled();
    // skip 名單仍依 list_nm 推導 appliedRuleIds（與 F095 一致）
    expect(result.appliedRuleIds).toContain('R-FRAUD-WHITEBOARD');
    expect(result.appliedRuleIds).toContain('R-PERIOD-MOTORCYCLE');
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

// ===========================================================================
// 五、Regression 防回退（v2.0 最關鍵群組，RGv2-001~005）
// ===========================================================================

const CHAIN_SRC = readFileSync(
  path.resolve(__dirname, '../stage1-filter-chain.ts'),
  'utf8',
);
const SPECIAL_RULES_SRC = readFileSync(
  path.resolve(__dirname, '../special-rules.ts'),
  'utf8',
);

describe('F091 五、Regression 防回退（v2.0 BR-8）', () => {
  it('RGv2-001：trigger 邏輯不含 v1.0 誤判關鍵字（中結 / 強案 / 年資 作為 includes 觸發）', () => {
    // chain 與 special-rules 之 trigger / 排除判斷段落不得以 v1.0 誤判字作為 list_nm.includes / spec_name.includes
    for (const src of [CHAIN_SRC, SPECIAL_RULES_SRC]) {
      expect(src).not.toMatch(/includes\(\s*['"]中結['"]\s*\)/);
      expect(src).not.toMatch(/includes\(\s*['"]強案['"]\s*\)/);
      expect(src).not.toMatch(/includes\(\s*['"]年資['"]\s*\)/);
      // 排除條件不得以 spec_name 含「滿」（v1.0 誤判排除條件）
      expect(src).not.toMatch(/includes\(\s*['"]滿['"]\s*\)/);
    }
  });

  it('RGv2-002：含「中結」名單不被誤套機車期中 / 期中小資規則', () => {
    const list = makeList({ list_nm: '中結強案催收名單' });
    const pool = [
      makeCase({ appl_no: 'A1', payt_term: 21, deal_num: '24', spec_name: '小資方案', payt_num: 17 }), // 若誤觸發會排除
      makeCase({ appl_no: 'A2', list_type: '01', spec_name: '詐騙白牌方案' }), // 詐騙白牌無條件排除
    ];
    const out = applySpecialDeletes(pool, list, WORKDT);
    expect(out.map((c) => c.appl_no)).toEqual(['A1']); // 第 1 筆保留
  });

  it('RGv2-003：含「期中」名單正確套用期中小資規則（v2.0 觸發確認）', () => {
    const list = makeList({ list_nm: '期中分期催收名單' });
    const pool = [
      makeCase({ appl_no: 'A1', payt_num: 20, deal_num: '24', spec_name: '小資優惠方案' }), // 20>16 + 小資 排除
      makeCase({ appl_no: 'A2', payt_num: 10, deal_num: '24', spec_name: '一般方案' }),     // 不含小資 保留
    ];
    const out = applySpecialDeletes(pool, list, WORKDT);
    expect(out.map((c) => c.appl_no)).toEqual(['A2']);
  });

  it('RGv2-004：含「信貸滿期」spec_name 不再因 v1.0 誤規則排除（排除條件已改 %小資%）', () => {
    const list = makeList({ list_nm: '期中車貸催收名單' }); // 觸發期中小資
    const pool = [makeCase({ appl_no: 'A1', payt_num: 20, deal_num: '24', spec_name: '信貸滿期方案' })]; // 含「滿」不含「小資」
    const out = applySpecialDeletes(pool, list, WORKDT);
    expect(out.map((c) => c.appl_no)).toEqual(['A1']); // 保留（v1.0「滿」排除行為不再）
  });

  it('RGv2-005：trigger / 排除邏輯含 v2.0 正確關鍵字（期中 / 機車 / 年以上 / 小資 / 白牌）', () => {
    // special-rules.ts trigger 含期中 / 機車 / 年以上；chain 排除條件含小資；fraud 含白牌
    expect(SPECIAL_RULES_SRC).toMatch(/includes\(\s*['"]期中['"]\s*\)/);
    expect(SPECIAL_RULES_SRC).toMatch(/includes\(\s*['"]機車['"]\s*\)/);
    expect(SPECIAL_RULES_SRC).toMatch(/includes\(\s*['"]年以上['"]\s*\)/);
    expect(CHAIN_SRC).toMatch(/includes\(\s*['"]小資['"]\s*\)/);
    expect(CHAIN_SRC).toMatch(/includes\(\s*['"]白牌['"]\s*\)/);
  });
});

// ===========================================================================
// 六、共用 trigger pure utility 一致性（F091 AC-7 / F095 AC-3）
// ===========================================================================

describe('F091 六、appliedRuleIds 與 deriveAppliedSpecialRules 一致性（共用 matchesSpecialRule）', () => {
  const cases = [
    '機車期中小資5年以上催收名單',
    '期中分期催收名單',
    '機車期中名單',
    '5年以上名單',
    '一般催收名單',
    '中結強案年資催收名單', // v1.0 誤判字 → 僅詐騙白牌
  ];
  for (const listNm of cases) {
    it(`一致性：「${listNm}」chain.appliedRuleIds === derive 推導 ruleId 集合`, async () => {
      const chainResult = await executeStage1Chain(
        makeList({
          list_nm: listNm,
          condition_payload: { logic: 'AND', conditions: [{ columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] }] } as ObListDefinition['condition_payload'],
        }),
        WORKDT,
        mockPoolRepo([]),
        mockPoolDataListRepo([]),
        { dryRun: true },
      );
      const deriveIds = deriveAppliedSpecialRules(listNm).map((r) => r.ruleId);
      expect(new Set(chainResult.appliedRuleIds)).toEqual(new Set(deriveIds));
    });
  }
});
