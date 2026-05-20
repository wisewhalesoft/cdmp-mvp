/**
 * Stage1QueryComposer — Phase 5b 波 1 ~ 波 5
 *
 * 對應 spec：
 *   - AD-E07-18 §18.5（Stage 1 動態 SQL 演算法）
 *   - AD-E07-18 §18.5.1（caseyear wildcard 規則）
 *   - AD-E07-18 §18.5.2（空 conditions 名單 skip）
 *   - AD-E07-18 §18.6（衍生規則 / Path B fallback entity column mapping）
 *
 * Pure function 單元測試（不依賴 DB）；驗證 buildStage1WhereConditions 之 fragment / params / skipReason / warnings。
 *
 * 各波對應 case：
 *   - 波 1（Path A categorical）：UCQ-001~005
 *   - 波 2（numeric + date）：UCQ-006~011
 *   - 波 3（Path B fallback）：UCQ-012~018
 *   - 波 4（caseyear wildcard）：UCQ-019~024
 *   - 波 5（columnName allowlist）：UCQ-025~028
 */

import { describe, it, expect } from 'vitest';

import { buildStage1WhereConditions } from '../stage1-query-composer';
import type { ObListDefinition } from '@/database/entities/ob-list-definition.entity';

// ---------------------------------------------------------------------------
// Helper：建立 ObListDefinition partial（測試用最小欄位）
// ---------------------------------------------------------------------------
function makeList(opts: Partial<ObListDefinition> = {}): ObListDefinition {
  return {
    list_no: opts.list_no ?? 'OB202605001',
    list_nm: opts.list_nm ?? 'TEST-LIST',
    prod_kind: opts.prod_kind ?? '',
    prod_best: opts.prod_best ?? 'Y',
    spec_tp: opts.spec_tp ?? null,
    list_type: opts.list_type ?? '01',
    list_period_start: opts.list_period_start ?? '001',
    list_period_end: opts.list_period_end ?? '030',
    list_interval: opts.list_interval ?? '001',
    assigned_date: opts.assigned_date ?? null,
    total_amount: opts.total_amount ?? null,
    reserved_amount: opts.reserved_amount ?? null,
    is_assigned: opts.is_assigned ?? null,
    project_workym: opts.project_workym ?? '202605',
    casenumber: opts.casenumber ?? null,
    name: opts.name ?? null,
    caseyear: opts.caseyear ?? null,
    caseyearnm: opts.caseyearnm ?? null,
    settle_src: opts.settle_src ?? null,
    card_type: opts.card_type ?? 'T1',
    status: opts.status ?? 'active',
    stage: opts.stage ?? 'ready',
    case_status: opts.case_status ?? '',
    cr_enabled: opts.cr_enabled ?? false,
    condition_payload: opts.condition_payload ?? null,
    created_by_prog: 'TEST',
    created_by: 'tester',
    created_at: new Date(),
    updated_by_prog: 'TEST',
    updated_by: 'tester',
    updated_at: new Date(),
  } as ObListDefinition;
}

// ===========================================================================
// 波 1：Composer 骨架 + Path A categorical
// ===========================================================================

describe('Stage1QueryComposer 波 1 — Path A categorical', () => {
  it('UCQ-001：單 categorical condition → 產生 IN fragment', () => {
    const list = makeList({
      condition_payload: {
        logic: 'AND',
        conditions: [
          { columnName: 'prod_kind', fieldType: 'categorical', values: ['01', '02'] },
        ],
      },
    });
    const result = buildStage1WhereConditions(list);

    expect(result.skipReason).toBeNull();
    expect(result.where).toContain('"prod_kind"');
    expect(result.where).toMatch(/IN\s*\(:\.\.\.[a-zA-Z0-9_]+\)/);
    // 應有一個 array 型參數含 '01','02'
    const paramValues = Object.values(result.params);
    expect(paramValues).toHaveLength(1);
    expect(paramValues[0]).toEqual(['01', '02']);
  });

  it('UCQ-002：多 categorical condition → 多 fragment AND 連接', () => {
    const list = makeList({
      condition_payload: {
        logic: 'AND',
        conditions: [
          { columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] },
          { columnName: 'spec_tp', fieldType: 'categorical', values: ['A', 'B'] },
        ],
      },
    });
    const result = buildStage1WhereConditions(list);

    expect(result.skipReason).toBeNull();
    // fragments 之間用 AND 連接
    expect(result.where).toContain('AND');
    expect(result.where).toContain('"prod_kind"');
    expect(result.where).toContain('"spec_tp"');
    expect(Object.keys(result.params)).toHaveLength(2);
  });

  it('UCQ-003：condition_payload IS NULL → Path B fallback，不應落入 Path A', () => {
    // Path B 在波 3 才實作；此處 condition_payload=null + 所有 entity column 空
    // → 預期 skipReason='EMPTY_CONDITIONS'
    const list = makeList({ condition_payload: null });
    const result = buildStage1WhereConditions(list);

    expect(result.skipReason).toBe('EMPTY_CONDITIONS');
    expect(result.where).toBeNull();
  });

  it('UCQ-004：condition_payload 含空 conditions 陣列 → skip + skipReason=EMPTY_CONDITIONS（§18.5.2）', () => {
    const list = makeList({
      condition_payload: {
        logic: 'AND',
        conditions: [],
      },
    });
    const result = buildStage1WhereConditions(list);

    expect(result.skipReason).toBe('EMPTY_CONDITIONS');
    expect(result.where).toBeNull();
    expect(result.params).toEqual({});
  });

  it('UCQ-005：condition_payload 含 _backfill_empty=true + 空 conditions → skip（§18.5.2）', () => {
    const list = makeList({
      condition_payload: {
        logic: 'AND',
        conditions: [],
        _backfill_empty: true,
      },
    });
    const result = buildStage1WhereConditions(list);

    expect(result.skipReason).toBe('EMPTY_CONDITIONS');
    expect(result.where).toBeNull();
  });
});

// ===========================================================================
// 波 2：Path A numeric + date
// ===========================================================================

describe('Stage1QueryComposer 波 2 — Path A numeric + date', () => {
  it('UCQ-006：numeric condition → 產生 BETWEEN（或 >=/<=）fragment', () => {
    const list = makeList({
      condition_payload: {
        logic: 'AND',
        conditions: [
          { columnName: 'year_cnt', fieldType: 'numeric', min: 2, max: 5 },
        ],
      },
    });
    const result = buildStage1WhereConditions(list);

    expect(result.skipReason).toBeNull();
    expect(result.where).toContain('"year_cnt"');
    // 接受 BETWEEN 或 >= AND <= 兩種等價寫法
    expect(result.where).toMatch(/BETWEEN|>=/);
    // 應有 min/max 兩個參數
    const paramVals = Object.values(result.params);
    expect(paramVals).toContain(2);
    expect(paramVals).toContain(5);
  });

  it('UCQ-007：numeric condition min=max=同值 → 仍產生有效 fragment', () => {
    const list = makeList({
      condition_payload: {
        logic: 'AND',
        conditions: [
          { columnName: 'month_cnt', fieldType: 'numeric', min: 10, max: 10 },
        ],
      },
    });
    const result = buildStage1WhereConditions(list);

    expect(result.skipReason).toBeNull();
    expect(result.where).toContain('"month_cnt"');
  });

  it('UCQ-008：numeric 缺 min 或 max → skip 該 fragment + warning INCOMPLETE_NUMERIC_RANGE', () => {
    const list = makeList({
      condition_payload: {
        logic: 'AND',
        conditions: [
          { columnName: 'year_cnt', fieldType: 'numeric', min: 2 }, // 缺 max
        ],
      },
    });
    const result = buildStage1WhereConditions(list);

    // 只有此一條件，全部 skip → skipReason='EMPTY_CONDITIONS'
    expect(result.skipReason).toBe('EMPTY_CONDITIONS');
    expect(result.warnings.some((w) => w.code === 'INCOMPLETE_NUMERIC_RANGE')).toBe(true);
  });

  it('UCQ-009：date condition → 產生 BETWEEN（或 >=/<=）fragment，dateStart/dateEnd 保留 ISO 字串', () => {
    const list = makeList({
      condition_payload: {
        logic: 'AND',
        conditions: [
          {
            columnName: 'eff_date',
            fieldType: 'date',
            dateStart: '2024-01-01',
            dateEnd: '2024-12-31',
          },
        ],
      },
    });
    const result = buildStage1WhereConditions(list);

    expect(result.skipReason).toBeNull();
    expect(result.where).toContain('"eff_date"');
    expect(result.where).toMatch(/BETWEEN|>=/);
    const paramVals = Object.values(result.params);
    expect(paramVals).toContain('2024-01-01');
    expect(paramVals).toContain('2024-12-31');
  });

  it('UCQ-010：date condition 缺 dateStart 或 dateEnd → skip + INCOMPLETE_DATE_RANGE', () => {
    const list = makeList({
      condition_payload: {
        logic: 'AND',
        conditions: [
          { columnName: 'eff_date', fieldType: 'date', dateStart: '2024-01-01' }, // 缺 dateEnd
        ],
      },
    });
    const result = buildStage1WhereConditions(list);

    expect(result.skipReason).toBe('EMPTY_CONDITIONS');
    expect(result.warnings.some((w) => w.code === 'INCOMPLETE_DATE_RANGE')).toBe(true);
  });

  it('UCQ-011：mixed categorical + numeric + date 三條件 → 三個 fragment AND 連接', () => {
    const list = makeList({
      condition_payload: {
        logic: 'AND',
        conditions: [
          { columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] },
          { columnName: 'year_cnt', fieldType: 'numeric', min: 1, max: 5 },
          {
            columnName: 'eff_date',
            fieldType: 'date',
            dateStart: '2024-01-01',
            dateEnd: '2024-12-31',
          },
        ],
      },
    });
    const result = buildStage1WhereConditions(list);

    expect(result.skipReason).toBeNull();
    // 三 fragment → 至少兩個 AND 連接
    const andCount = (result.where ?? '').match(/AND/g)?.length ?? 0;
    expect(andCount).toBeGreaterThanOrEqual(2);
    expect(result.where).toContain('"prod_kind"');
    expect(result.where).toContain('"year_cnt"');
    expect(result.where).toContain('"eff_date"');
  });
});

// ===========================================================================
// 波 3：Path B fallback（5 個 entity column）
// ===========================================================================

describe('Stage1QueryComposer 波 3 — Path B fallback', () => {
  it('UCQ-012：condition_payload IS NULL + prod_kind 有值 → IN fragment', () => {
    const list = makeList({
      condition_payload: null,
      prod_kind: '01$$02',
    });
    const result = buildStage1WhereConditions(list);

    expect(result.skipReason).toBeNull();
    expect(result.where).toContain('"prod_kind"');
    expect(result.where).toMatch(/IN\s*\(:\.\.\.[a-zA-Z0-9_]+\)/);
    const paramVals = Object.values(result.params);
    expect(paramVals).toContainEqual(['01', '02']);
  });

  it('UCQ-013：Path B caseyear → 對應 ob_pool_data.year_cnt 整數 IN（§18.5 路徑 B 表）', () => {
    const list = makeList({
      condition_payload: null,
      prod_kind: '',
      caseyear: '1$$3',
    });
    const result = buildStage1WhereConditions(list);

    expect(result.skipReason).toBeNull();
    // caseyear → year_cnt 比對
    expect(result.where).toContain('"year_cnt"');
    expect(result.where).not.toContain('"caseyear"');
    // 整數比對
    const paramVals = Object.values(result.params);
    expect(paramVals).toContainEqual([1, 3]);
  });

  it('UCQ-014：Path B case_status → 對應 ob_pool_data.list_type（§18.5 路徑 B 表）', () => {
    const list = makeList({
      condition_payload: null,
      prod_kind: '',
      case_status: '01$$02',
    });
    const result = buildStage1WhereConditions(list);

    expect(result.skipReason).toBeNull();
    // case_status → list_type 比對（注意 ob_pool_data 無 case_status 欄位）
    expect(result.where).toContain('"list_type"');
    expect(result.where).not.toContain('"case_status"');
    const paramVals = Object.values(result.params);
    expect(paramVals).toContainEqual(['01', '02']);
  });

  it('UCQ-015：Path B spec_tp / settle_src → 直接 IN', () => {
    const list = makeList({
      condition_payload: null,
      prod_kind: '',
      spec_tp: '01$$02',
      settle_src: '03',
    });
    const result = buildStage1WhereConditions(list);

    expect(result.skipReason).toBeNull();
    expect(result.where).toContain('"spec_tp"');
    expect(result.where).toContain('"settle_src"');
    const paramVals = Object.values(result.params);
    expect(paramVals).toContainEqual(['01', '02']);
    expect(paramVals).toContainEqual(['03']);
  });

  it('UCQ-016：Path B 全空（5 個 entity column 皆空 / null）→ skipReason=EMPTY_CONDITIONS', () => {
    const list = makeList({
      condition_payload: null,
      prod_kind: '',
      caseyear: null,
      spec_tp: null,
      case_status: '',
      settle_src: null,
    });
    const result = buildStage1WhereConditions(list);

    expect(result.skipReason).toBe('EMPTY_CONDITIONS');
    expect(result.where).toBeNull();
  });

  it('UCQ-017：Path B prod_kind 空字串 → skip 該欄位（§18.5 路徑 B 表「空字串 → skip」）', () => {
    const list = makeList({
      condition_payload: null,
      prod_kind: '',
      spec_tp: '01',
    });
    const result = buildStage1WhereConditions(list);

    expect(result.skipReason).toBeNull();
    expect(result.where).not.toContain('"prod_kind"');
    expect(result.where).toContain('"spec_tp"');
  });

  it('UCQ-018：Path B 多欄位混合（prod_kind + caseyear + settle_src）→ 三個 fragment AND 連接', () => {
    const list = makeList({
      condition_payload: null,
      prod_kind: '01',
      caseyear: '5',
      settle_src: '02',
    });
    const result = buildStage1WhereConditions(list);

    expect(result.skipReason).toBeNull();
    const andCount = (result.where ?? '').match(/AND/g)?.length ?? 0;
    expect(andCount).toBeGreaterThanOrEqual(2);
    expect(result.where).toContain('"prod_kind"');
    expect(result.where).toContain('"year_cnt"'); // caseyear 映射
    expect(result.where).toContain('"settle_src"');
  });
});
