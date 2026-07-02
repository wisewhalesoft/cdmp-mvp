/**
 * F109 / US-172 / AD-E07-37 — buildCustomerCoreClause + resolveConditionDataSource 純單元測試
 *
 * 純函式（不依賴 DB / customer_core 表）；驗證：
 *   - DATASRC-001~004 / 007：resolveConditionDataSource 決定性解析（固化值優先 + 靜態 Set fallback）
 *   - STATIC-001 / STATIC-002：CUSTOMER_CORE_COLUMN_NAMES 8 欄逐字 + 檔案/export 存在性
 *   - DESC-001/002 / GENDER-001 / CITY fragment / AGE fragment：fragment 形狀
 *   - AGE-008：min/max 缺一 → INCOMPLETE_NUMERIC_RANGE warning + 不建 fragment
 *   - JOIN-005：多個 customer_core 條件共用單一 JOIN + 獨立 ccCat{n}
 *   - NULLEXC-006：原始碼靜態掃描不含 COALESCE(cc.*)（I-CC-NULL-EXCLUDE-01）
 *   - PARAM-001：cc 前綴命名空間與 composer 既有前綴零碰撞（I-CC-PARAM-NS-01）
 *   - COMPSCOPE-001：composer 原始碼不含 cc. 前綴（I-CC-COMPOSER-SCOPE-01）
 *
 * customer_core 僅存在 PG（AD §9）；本檔僅驗證 SQL 字串產物，不執行查詢，故不需 Postgres。
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

import {
  buildCustomerCoreClause,
  type CustomerCoreClause,
} from '../stage1-customer-core-clause';
import {
  CUSTOMER_CORE_COLUMN_NAMES,
  resolveConditionDataSource,
} from '../stage1-query-composer';
import type { ObListDefinitionConditionItem } from '@/database/entities/ob-list-definition.entity';
import type { Stage1ChainWarning } from '../stage1-filter-chain';

const WORKDT = new Date(Date.UTC(2026, 6, 1)); // 2026-07-01（作業月首日）

function build(
  conditions: ObListDefinitionConditionItem[],
  baseAlias = 'o',
): { clause: CustomerCoreClause; warnings: Stage1ChainWarning[] } {
  const warnings: Stage1ChainWarning[] = [];
  const clause = buildCustomerCoreClause(conditions, WORKDT, baseAlias, warnings);
  return { clause, warnings };
}

// ===========================================================================
// DATASRC — resolveConditionDataSource（OQ-F109-01 / I-CC-DATASOURCE-01）
// ===========================================================================

describe('F109 DATASRC — resolveConditionDataSource', () => {
  it('TS-F109-DATASRC-001：固化值 customer_core → 直接採用（不查白名單）', () => {
    expect(
      resolveConditionDataSource({ columnName: 'gender', dataSource: 'customer_core' }),
    ).toBe('customer_core');
  });

  it('TS-F109-DATASRC-001b：固化值 ob_pool_data → 直接採用（即使欄名屬 customer_core 集合，固化值優先）', () => {
    expect(
      resolveConditionDataSource({ columnName: 'gender', dataSource: 'ob_pool_data' }),
    ).toBe('ob_pool_data');
  });

  it('TS-F109-DATASRC-002：缺 dataSource + columnName ∈ CUSTOMER_CORE_COLUMN_NAMES → fallback customer_core', () => {
    expect(resolveConditionDataSource({ columnName: 'cpost_city' })).toBe(
      'customer_core',
    );
    expect(resolveConditionDataSource({ columnName: 'date_of_birth' })).toBe(
      'customer_core',
    );
  });

  it('TS-F109-DATASRC-003：缺 dataSource + columnName ∉ 集合 → fallback ob_pool_data（涵蓋舊名單）', () => {
    expect(resolveConditionDataSource({ columnName: 'prod_kind' })).toBe(
      'ob_pool_data',
    );
    expect(resolveConditionDataSource({ columnName: 'case_status' })).toBe(
      'ob_pool_data',
    );
  });

  it('TS-F109-DATASRC-007：欄位停用後（固化值仍存在）resolveConditionDataSource 不受影響（不查白名單）', () => {
    // 固化值優先；此函式為純函式，無 DB 查詢 → 欄位 is_active 狀態與判定無關
    expect(
      resolveConditionDataSource({
        columnName: 'gender',
        dataSource: 'customer_core',
        values: ['1'],
      }),
    ).toBe('customer_core');
  });

  it('TS-F109-DATASRC-004 / STATIC-001：CUSTOMER_CORE_COLUMN_NAMES 恰 8 欄逐字相符', () => {
    expect(CUSTOMER_CORE_COLUMN_NAMES.size).toBe(8);
    const expected = [
      'gender',
      'date_of_birth',
      'occupation_desc',
      'education_desc',
      'marital_status_desc',
      'customer_type_desc',
      'monthly_income_desc',
      'cpost_city',
    ];
    for (const c of expected) {
      expect(CUSTOMER_CORE_COLUMN_NAMES.has(c)).toBe(true);
    }
    expect([...CUSTOMER_CORE_COLUMN_NAMES].sort()).toEqual([...expected].sort());
  });
});

// ===========================================================================
// GENDER / DESC / CITY / AGE — fragment 形狀（無 DB）
// ===========================================================================

describe('F109 GENDER/DESC — 直接值比對 fragment', () => {
  it('TS-F109-GENDER-001：gender IN [1] → (cc.gender IN (:...ccCat0))，params 存 code', () => {
    const { clause } = build([
      { columnName: 'gender', fieldType: 'categorical', values: ['1'], dataSource: 'customer_core' },
    ]);
    expect(clause.whereFragments).toEqual(['(cc.gender IN (:...ccCat0))']);
    expect(clause.params.ccCat0).toEqual(['1']);
    expect(clause.join).toBe(
      'LEFT JOIN customer_core cc ON cc.source_customer_no = o.custo_no',
    );
  });

  it('TS-F109-DESC-001：education_desc IN [大學] → cc.education_desc IN，值為中文（非代碼）', () => {
    const { clause } = build([
      { columnName: 'education_desc', fieldType: 'categorical', values: ['大學'], dataSource: 'customer_core' },
    ]);
    expect(clause.whereFragments).toEqual(['(cc.education_desc IN (:...ccCat0))']);
    expect(clause.params.ccCat0).toEqual(['大學']);
  });

  it('TS-F109-DESC-002：gender 值為代碼、customer_type_desc 值為中文，共存互不影響', () => {
    const { clause } = build([
      { columnName: 'gender', fieldType: 'categorical', values: ['1'], dataSource: 'customer_core' },
      { columnName: 'customer_type_desc', fieldType: 'categorical', values: ['個人'], dataSource: 'customer_core' },
    ]);
    expect(clause.whereFragments).toEqual([
      '(cc.gender IN (:...ccCat0))',
      '(cc.customer_type_desc IN (:...ccCat1))',
    ]);
    expect(clause.params.ccCat0).toEqual(['1']);
    expect(clause.params.ccCat1).toEqual(['個人']);
  });
});

describe('F109 CITY — LEFT3 衍生 fragment（BR-6）', () => {
  it('TS-F109-CITY：cpost_city → LEFT(cc.cpost_city, 3) IN (:...ccCat0)（不 COALESCE）', () => {
    const { clause } = build([
      { columnName: 'cpost_city', fieldType: 'categorical', values: ['臺北市'], dataSource: 'customer_core' },
    ]);
    expect(clause.whereFragments).toEqual([
      '(LEFT(cc.cpost_city, 3) IN (:...ccCat0))',
    ]);
    expect(clause.params.ccCat0).toEqual(['臺北市']);
  });
});

describe('F109 AGE — 年齡衍生 fragment（BR-5）', () => {
  it('TS-F109-AGE：date_of_birth min/max → EXTRACT(YEAR FROM AGE(:ccWorkdt::date, cc.date_of_birth))::int BETWEEN', () => {
    const { clause } = build([
      { columnName: 'date_of_birth', fieldType: 'numeric', min: 30, max: 35, dataSource: 'customer_core' },
    ]);
    expect(clause.whereFragments).toEqual([
      '((EXTRACT(YEAR FROM AGE(:ccWorkdt::date, cc.date_of_birth)))::int BETWEEN :ccAgeMin AND :ccAgeMax)',
    ]);
    expect(clause.params.ccWorkdt).toBe('2026-07-01'); // 作業月首日
    expect(clause.params.ccAgeMin).toBe(30);
    expect(clause.params.ccAgeMax).toBe(35);
  });

  it('TS-F109-AGE-008：min/max 缺一 → INCOMPLETE_NUMERIC_RANGE warning + 不建 fragment（不影響其他條件）', () => {
    const { clause, warnings } = build([
      { columnName: 'date_of_birth', fieldType: 'numeric', min: 30, dataSource: 'customer_core' },
      { columnName: 'gender', fieldType: 'categorical', values: ['1'], dataSource: 'customer_core' },
    ]);
    expect(warnings).toContainEqual(
      expect.objectContaining({
        code: 'INCOMPLETE_NUMERIC_RANGE',
        columnName: 'date_of_birth',
      }),
    );
    // 年齡 fragment 未建；gender fragment 仍在（ccCat0，不受跳過影響）
    expect(clause.whereFragments).toEqual(['(cc.gender IN (:...ccCat0))']);
  });

  it('empty values → EMPTY_VALUES warning + 不建 fragment', () => {
    const { clause, warnings } = build([
      { columnName: 'gender', fieldType: 'categorical', values: [], dataSource: 'customer_core' },
    ]);
    expect(warnings).toContainEqual(
      expect.objectContaining({ code: 'EMPTY_VALUES', columnName: 'gender' }),
    );
    expect(clause.whereFragments).toEqual([]);
    expect(clause.join).toBeNull(); // 全部 skip → 無 join
  });
});

// ===========================================================================
// JOIN — 條件式 JOIN 觸發 / 共用（AC-11 / BR-2）
// ===========================================================================

describe('F109 JOIN — 條件式 JOIN', () => {
  it('無 customer_core 條件 → join=null / 無 fragment（AC-11 反向；純案件資料名單不注入）', () => {
    const { clause } = build([
      { columnName: 'prod_kind', fieldType: 'categorical', values: ['01'], dataSource: 'ob_pool_data' },
    ]);
    expect(clause.join).toBeNull();
    expect(clause.whereFragments).toEqual([]);
    expect(clause.params).toEqual({});
  });

  it('TS-F109-JOIN-005：多個 customer_core 條件共用單一 JOIN + 獨立 ccCat0/ccCat1', () => {
    const { clause } = build([
      { columnName: 'gender', fieldType: 'categorical', values: ['1'], dataSource: 'customer_core' },
      { columnName: 'education_desc', fieldType: 'categorical', values: ['大學'], dataSource: 'customer_core' },
    ]);
    // 單一 join 字串（呼叫端只注入一次）
    expect(clause.join).toBe(
      'LEFT JOIN customer_core cc ON cc.source_customer_no = o.custo_no',
    );
    expect(clause.whereFragments).toHaveLength(2);
    expect(Object.keys(clause.params).sort()).toEqual(['ccCat0', 'ccCat1']);
  });

  it('baseAlias=ob_pool_data（chain 路徑）→ JOIN ON 使用該 alias', () => {
    const { clause } = build(
      [{ columnName: 'gender', fieldType: 'categorical', values: ['1'], dataSource: 'customer_core' }],
      'ob_pool_data',
    );
    expect(clause.join).toBe(
      'LEFT JOIN customer_core cc ON cc.source_customer_no = ob_pool_data.custo_no',
    );
  });

  it('fallback 判定：缺 dataSource 但欄名屬 customer_core 集合 → 仍被納入 clause（舊名單）', () => {
    const { clause } = build([
      { columnName: 'occupation_desc', fieldType: 'categorical', values: ['工程師'] },
    ]);
    expect(clause.join).not.toBeNull();
    expect(clause.whereFragments).toEqual([
      '(cc.occupation_desc IN (:...ccCat0))',
    ]);
  });
});

// ===========================================================================
// PARAM — 命名空間隔離（I-CC-PARAM-NS-01）
// ===========================================================================

describe('F109 PARAM — 命名空間隔離', () => {
  it('TS-F109-PARAM-001：params key 一律 cc 前綴，與 composer 既有前綴零碰撞', () => {
    const { clause } = build([
      { columnName: 'gender', fieldType: 'categorical', values: ['1'], dataSource: 'customer_core' },
      { columnName: 'date_of_birth', fieldType: 'numeric', min: 20, max: 60, dataSource: 'customer_core' },
    ]);
    const keys = Object.keys(clause.params);
    for (const k of keys) {
      expect(k.startsWith('cc')).toBe(true);
    }
    // 與 composer 既有前綴（cat/numMin/numMax/dateStart/dateEnd/pbCat/pbNum/caseyear）不重疊
    const composerPrefixes = ['cat', 'numMin', 'numMax', 'dateStart', 'dateEnd', 'pbCat', 'pbNum', 'caseyear'];
    for (const k of keys) {
      expect(composerPrefixes.some((p) => k === p || (k.startsWith(p) && !k.startsWith('cc')))).toBe(false);
    }
  });
});

// ===========================================================================
// STATIC / NULLEXC-006 / COMPSCOPE-001 — 原始碼靜態掃描
// ===========================================================================

describe('F109 STATIC — 原始碼掃描 / 命名鎖定', () => {
  const clausePath = path.resolve(__dirname, '../stage1-customer-core-clause.ts');
  const composerPath = path.resolve(__dirname, '../stage1-query-composer.ts');

  it('TS-F109-STATIC-002：buildCustomerCoreClause 存在於 AD 指定路徑且 export', () => {
    expect(fs.existsSync(clausePath)).toBe(true);
    const src = fs.readFileSync(clausePath, 'utf8');
    expect(src).toMatch(/export function buildCustomerCoreClause/);
  });

  it('TS-F109-NULLEXC-006：clause 原始碼不含 COALESCE(cc.*)（I-CC-NULL-EXCLUDE-01）', () => {
    const src = fs.readFileSync(clausePath, 'utf8');
    // 掃描實際 SQL 片段中的 COALESCE 包裹 cc. 欄位（排除註解說明較嚴格：直接禁任何 COALESCE(...cc.)）
    expect(/COALESCE\s*\(\s*cc\./i.test(src)).toBe(false);
    expect(/COALESCE\s*\(\s*LEFT\s*\(\s*cc\./i.test(src)).toBe(false);
  });

  it('TS-F109-COMPSCOPE-001：composer 主體不含 cc. 前綴 SQL（customer_core 邏輯外置）', () => {
    const src = fs.readFileSync(composerPath, 'utf8');
    // 允許註解含 columnName 說明；禁 SQL 片段字串 `cc.<col>`（IN / LEFT 等）
    expect(/`[^`]*\bcc\.[a-z_]/.test(src)).toBe(false);
    expect(/'[^']*\bcc\.[a-z_]/.test(src)).toBe(false);
  });
});
