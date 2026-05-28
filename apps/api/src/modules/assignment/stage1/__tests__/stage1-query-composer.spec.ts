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

  it('UCQ-005b：Path A case_status → 對應 ob_pool_data.list_type（§18.5 路徑 A/B 共用映射；F049 v1.2 AC-4）', () => {
    // 既有盲區補完：路徑 A 之 case_status condition 過去產生 "case_status" IN(...)，
    // 打到 ob_pool_data 不存在的欄位（與路徑 B / 流程圖 §18.5 不一致）。
    const list = makeList({
      condition_payload: {
        logic: 'AND',
        conditions: [
          { columnName: 'case_status', fieldType: 'categorical', values: ['02', '03'] },
        ],
      },
    });
    const result = buildStage1WhereConditions(list);

    expect(result.skipReason).toBeNull();
    expect(result.where).toContain('"list_type" IN (');
    expect(result.where).not.toContain('"case_status" IN (');
    expect(Object.values(result.params)).toContainEqual(['02', '03']);
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

// ===========================================================================
// 波 4：caseyear wildcard（§18.5.1）
// ===========================================================================

describe('Stage1QueryComposer 波 4 — caseyear wildcard (§18.5.1)', () => {
  it('UCQ-019：Path A caseyear=[99] → 完全 skip year_cnt fragment（IT-M01-013）', () => {
    const list = makeList({
      condition_payload: {
        logic: 'AND',
        conditions: [
          { columnName: 'caseyear', fieldType: 'categorical', values: ['99'] },
        ],
      },
    });
    const result = buildStage1WhereConditions(list);

    // 完全 skip → 唯一 condition 失效 → §18.5.2 衍生 EMPTY_CONDITIONS
    expect(result.skipReason).toBe('EMPTY_CONDITIONS');
    expect(result.where).toBeNull();
    // SQL 中不應有 year_cnt / caseyear 相關欄位
    expect(JSON.stringify(result)).not.toContain('year_cnt');
  });

  it('UCQ-020：Path A caseyear=[1,99,3] → 含 99 即 wildcard，完全 skip year_cnt（IT-M01-014）', () => {
    const list = makeList({
      condition_payload: {
        logic: 'AND',
        conditions: [
          { columnName: 'caseyear', fieldType: 'categorical', values: ['1', '99', '3'] },
        ],
      },
    });
    const result = buildStage1WhereConditions(list);

    expect(result.skipReason).toBe('EMPTY_CONDITIONS');
    // 不可只過濾 year_cnt=1,3，必須完全省略
    expect(JSON.stringify(result.params)).not.toContain('1');
    expect(JSON.stringify(result.params)).not.toContain('3');
  });

  it('UCQ-021：Path A caseyear=[1,3] → 不含 99，正常生成 year_cnt IN (1,3)（IT-M01-015）', () => {
    const list = makeList({
      condition_payload: {
        logic: 'AND',
        conditions: [
          { columnName: 'caseyear', fieldType: 'categorical', values: ['1', '3'] },
        ],
      },
    });
    const result = buildStage1WhereConditions(list);

    expect(result.skipReason).toBeNull();
    // §18.5.1 表第 2 列：「正常走 year_cnt IN (:...vals_N)」
    expect(result.where).toContain('"year_cnt"');
    expect(result.where).not.toContain('"caseyear"');
    const paramVals = Object.values(result.params);
    expect(paramVals).toContainEqual([1, 3]);
  });

  it('UCQ-022：Path A caseyear=[99] + 其他 condition → 其他 condition 仍生效，caseyear 部分 skip', () => {
    const list = makeList({
      condition_payload: {
        logic: 'AND',
        conditions: [
          { columnName: 'caseyear', fieldType: 'categorical', values: ['99'] },
          { columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] },
        ],
      },
    });
    const result = buildStage1WhereConditions(list);

    expect(result.skipReason).toBeNull();
    expect(result.where).toContain('"prod_kind"');
    expect(result.where).not.toContain('"year_cnt"');
    expect(result.where).not.toContain('"caseyear"');
  });

  it('UCQ-023：Path B caseyear="99" → split 後含 99，完全 skip year_cnt（§18.5.1 注意段）', () => {
    const list = makeList({
      condition_payload: null,
      caseyear: '99',
    });
    const result = buildStage1WhereConditions(list);

    // 唯一條件 skip → EMPTY_CONDITIONS
    expect(result.skipReason).toBe('EMPTY_CONDITIONS');
  });

  it('UCQ-024：Path B caseyear="1$$99$$3" → 含 99 即 wildcard，完全 skip year_cnt', () => {
    const list = makeList({
      condition_payload: null,
      caseyear: '1$$99$$3',
      prod_kind: '01', // 另一條件保持有效
    });
    const result = buildStage1WhereConditions(list);

    expect(result.skipReason).toBeNull();
    expect(result.where).toContain('"prod_kind"');
    expect(result.where).not.toContain('"year_cnt"');
    // params 不應含 [1,3] 或 [1,99,3]
    const paramVals = JSON.stringify(Object.values(result.params));
    expect(paramVals).not.toContain('99');
  });
});

// ===========================================================================
// 波 5：columnName allowlist SQL Injection 防禦（§18.5）
// 對應 brief §7：IT-M01-022 / IT-M01-023（新增編號，後續由 test-designer 追補進
//   M01-whitelist-driven-integration-test.md）
// ===========================================================================

describe('Stage1QueryComposer 波 5 — columnName allowlist 防禦', () => {
  it('UCQ-025 (IT-M01-022a)：columnName 含 SQL Injection payload → skip + INVALID_COLUMN_NAME', () => {
    const list = makeList({
      condition_payload: {
        logic: 'AND',
        conditions: [
          {
            // 經典 SQL Injection payload
            columnName: 'prod_kind"; DROP TABLE ob_pool_data; --',
            fieldType: 'categorical',
            values: ['01'],
          } as any,
        ],
      },
    });
    const result = buildStage1WhereConditions(list);

    // 唯一條件被 skip → §18.5.2 EMPTY_CONDITIONS
    expect(result.skipReason).toBe('EMPTY_CONDITIONS');
    expect(result.warnings.some((w) => w.code === 'INVALID_COLUMN_NAME')).toBe(true);
    // 關鍵：SQL fragment（where）必須完全 null，注入 payload 不可進入 SQL 執行路徑
    expect(result.where).toBeNull();
    // params 不可帶入注入 payload（params 是 queryBuilder 第二參數）
    expect(JSON.stringify(result.params)).not.toContain('DROP TABLE');
  });

  it('UCQ-026 (IT-M01-022b)：columnName 含 UPPERCASE → skip + INVALID_COLUMN_NAME（正規式僅允許 lowercase）', () => {
    const list = makeList({
      condition_payload: {
        logic: 'AND',
        conditions: [
          { columnName: 'PROD_KIND', fieldType: 'categorical', values: ['01'] },
        ],
      },
    });
    const result = buildStage1WhereConditions(list);

    expect(result.skipReason).toBe('EMPTY_CONDITIONS');
    expect(result.warnings.some((w) => w.code === 'INVALID_COLUMN_NAME')).toBe(true);
  });

  it('UCQ-027 (IT-M01-022c)：columnName 含空白 / 特殊字元 → skip + INVALID_COLUMN_NAME', () => {
    const list = makeList({
      condition_payload: {
        logic: 'AND',
        conditions: [
          { columnName: 'prod kind', fieldType: 'categorical', values: ['01'] }, // 含空白
        ],
      },
    });
    const result = buildStage1WhereConditions(list);

    expect(result.skipReason).toBe('EMPTY_CONDITIONS');
    expect(result.warnings.some((w) => w.code === 'INVALID_COLUMN_NAME')).toBe(true);
  });

  it('UCQ-028 (IT-M01-023a)：非法 columnName 出現於 numeric / date fragment 同樣被 skip', () => {
    const list = makeList({
      condition_payload: {
        logic: 'AND',
        conditions: [
          { columnName: 'evil;col', fieldType: 'numeric', min: 1, max: 5 } as any,
          { columnName: 'bad col', fieldType: 'date', dateStart: '2024-01-01', dateEnd: '2024-12-31' } as any,
        ],
      },
    });
    const result = buildStage1WhereConditions(list);

    expect(result.skipReason).toBe('EMPTY_CONDITIONS');
    const invalidWarnings = result.warnings.filter((w) => w.code === 'INVALID_COLUMN_NAME');
    expect(invalidWarnings.length).toBe(2);
  });

  it('UCQ-029 (IT-M01-023b)：合法 columnName 與非法 columnName 並存 → 合法部分通過，非法 skip', () => {
    const list = makeList({
      condition_payload: {
        logic: 'AND',
        conditions: [
          { columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] },
          { columnName: 'BAD;COL', fieldType: 'categorical', values: ['02'] } as any,
        ],
      },
    });
    const result = buildStage1WhereConditions(list);

    expect(result.skipReason).toBeNull();
    expect(result.where).toContain('"prod_kind"');
    expect(result.where).not.toContain('BAD');
    expect(result.warnings.some((w) => w.code === 'INVALID_COLUMN_NAME')).toBe(true);
  });

  it('UCQ-030：合法 columnName 邊界（64 字元 / 純字母數字底線）→ 通過', () => {
    const longButLegal = 'a' + '_a'.repeat(31); // 'a' + 31×'_a' = 63 字元，剛好在邊界內
    expect(longButLegal.length).toBe(63);
    const list = makeList({
      condition_payload: {
        logic: 'AND',
        conditions: [
          { columnName: longButLegal, fieldType: 'categorical', values: ['01'] },
        ],
      },
    });
    const result = buildStage1WhereConditions(list);

    expect(result.skipReason).toBeNull();
    expect(result.where).toContain(`"${longButLegal}"`);
  });
});

// ===========================================================================
// 波 6：v2.1.1 best_case categorical（架構 §18.11.7 / BR-12 §(3)）
// ===========================================================================
//
// 確認 best_case 由路徑 A 通用 categorical fragment 邏輯自動處理，無需特殊規則。
//
// 大小寫警告（[[feedback_mock_real_system_contract]]）：
//   ob_pool_data.best_case 為 ETL 落地之 varchar(1) 大寫；mock 與 assertion
//   一律用 'Y' / 'N'（不可 'y' / 'n'），否則 SQL IN 比對 case-sensitive silent miss。

describe('Stage1QueryComposer 波 6 — best_case categorical (v2.1.1 / §18.11.7)', () => {
  it('TS-F050-G01：best_case 單值 [\'Y\'] → "best_case" IN (:...cat0)；params 含 [\'Y\']', () => {
    const list = makeList({
      condition_payload: {
        logic: 'AND',
        conditions: [
          { columnName: 'best_case', fieldType: 'categorical', values: ['Y'] },
        ],
      },
    });
    const result = buildStage1WhereConditions(list);

    expect(result.skipReason).toBeNull();
    expect(result.where).toContain('"best_case"');
    expect(result.where).toMatch(/IN\s*\(:\.\.\.[a-zA-Z0-9_]+\)/);
    const paramValues = Object.values(result.params);
    expect(paramValues).toHaveLength(1);
    expect(paramValues[0]).toEqual(['Y']);
  });

  it('TS-F050-G02：best_case 雙值 [\'Y\', \'N\'] → IN 子句含兩個值', () => {
    const list = makeList({
      condition_payload: {
        logic: 'AND',
        conditions: [
          {
            columnName: 'best_case',
            fieldType: 'categorical',
            values: ['Y', 'N'],
          },
        ],
      },
    });
    const result = buildStage1WhereConditions(list);

    expect(result.skipReason).toBeNull();
    expect(result.where).toContain('"best_case"');
    expect(result.where).toMatch(/IN\s*\(:\.\.\.[a-zA-Z0-9_]+\)/);
    const paramValues = Object.values(result.params);
    expect(paramValues).toHaveLength(1);
    expect(paramValues[0]).toEqual(['Y', 'N']);
  });

  it('TS-F050-G03：best_case 與 prod_kind 並存 → 兩個 fragment AND 連接，params 不衝突', () => {
    const list = makeList({
      condition_payload: {
        logic: 'AND',
        conditions: [
          {
            columnName: 'prod_kind',
            fieldType: 'categorical',
            values: ['01'],
          },
          {
            columnName: 'best_case',
            fieldType: 'categorical',
            values: ['Y'],
          },
        ],
      },
    });
    const result = buildStage1WhereConditions(list);

    expect(result.skipReason).toBeNull();
    expect(result.where).toContain('"prod_kind"');
    expect(result.where).toContain('"best_case"');
    // AND 連接（連 fragment 中至少含一個 AND keyword）
    expect(result.where).toMatch(/\bAND\b/i);

    // params key 互不衝突（共有 2 個 param）
    const paramKeys = Object.keys(result.params);
    expect(paramKeys).toHaveLength(2);
    expect(new Set(paramKeys).size).toBe(2);

    // 兩組 array 分別為 ['01'] / ['Y']
    const paramArrays = Object.values(result.params) as string[][];
    expect(paramArrays).toContainEqual(['01']);
    expect(paramArrays).toContainEqual(['Y']);
  });

  it("TS-F050-G04：best_case 不觸發 caseyear wildcard 特殊邏輯（regression）", () => {
    // 故意用 caseyear 的 wildcard 值 '99'，驗證 best_case 不走 caseyear skip 路徑
    const list = makeList({
      condition_payload: {
        logic: 'AND',
        conditions: [
          {
            columnName: 'best_case',
            fieldType: 'categorical',
            values: ['99'],
          },
        ],
      },
    });
    const result = buildStage1WhereConditions(list);

    expect(result.skipReason).toBeNull();
    expect(result.where).toContain('"best_case"');
    expect(result.where).toMatch(/IN\s*\(:\.\.\.[a-zA-Z0-9_]+\)/);
    // params 含 '99'（不被 skip）
    const paramValues = Object.values(result.params);
    expect(paramValues).toHaveLength(1);
    expect(paramValues[0]).toEqual(['99']);
  });

  it("TS-F050-G05：columnName allowlist guard — 'best_case' 通過正則 /^[a-z][a-z0-9_]{0,63}$/", () => {
    const list = makeList({
      condition_payload: {
        logic: 'AND',
        conditions: [
          {
            columnName: 'best_case',
            fieldType: 'categorical',
            values: ['Y'],
          },
        ],
      },
    });
    // 不應拋例外
    expect(() => buildStage1WhereConditions(list)).not.toThrow();
    const result = buildStage1WhereConditions(list);
    expect(result.skipReason).toBeNull();
  });
});

// ===========================================================================
// 波 7 — US-144 best_case 系統注入後 Stage 1 驗證（TS-F050-P01）
//   說明：模擬 createList injectSystemFixedConditions 注入後存入 DB 的 condition_payload
//         （prod_kind 使用者條件 + best_case:['Y'] 系統固定條件），驗證 composer 端對端產生
//         "best_case" IN ('Y')；對齊 §18.12.7「Stage 1 零改動」原則。
// ===========================================================================
describe('Stage1QueryComposer 波 7 — US-144 best_case 系統注入後 Stage 1 驗證', () => {
  it('TS-F050-P01：注入後名單 → composer 產生 "best_case" IN (...)，params 含 [Y]', () => {
    // 此 payload 形狀即 createList 注入後寫入 DB 的內容（使用者送 prod_kind，後端補 best_case）
    const list = makeList({
      condition_payload: {
        logic: 'AND',
        conditions: [
          { columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] },
          { columnName: 'best_case', fieldType: 'categorical', values: ['Y'] },
        ],
      },
    });
    const result = buildStage1WhereConditions(list);

    expect(result.skipReason).toBeNull();
    expect(result.where).toContain('"best_case"');
    expect(result.where).toMatch(/"best_case"\s+IN\s*\(:\.\.\.[a-zA-Z0-9_]+\)/);
    // params 其中一個值為大寫 ['Y']（[[feedback_mock_real_system_contract]]）
    const paramValues = Object.values(result.params);
    expect(paramValues).toContainEqual(['Y']);
  });
});
