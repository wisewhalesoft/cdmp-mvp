/**
 * F114 — buildCustomerFinancialClause + resolveConditionDataSource（customer_financial）純單元測試
 *
 * 純函式（不依賴 DB / customer_financial 表）；驗證：
 *   - DATASRC：resolveConditionDataSource 對 customer_financial 之固化值優先 + 靜態 Set fallback
 *   - STATIC：CUSTOMER_FINANCIAL_COLUMN_NAMES 8 欄、與 customer_core 集合不交集、檔案/export 存在
 *   - CAT：has_guarantor IN fragment
 *   - NUM：件數 BETWEEN fragment + min/max 缺一 → INCOMPLETE_NUMERIC_RANGE
 *   - JOIN：條件式單一 JOIN + baseAlias、cf 前綴命名空間
 *   - NULLEXC：原始碼不含 COALESCE(cf.*)
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

import {
  buildCustomerFinancialClause,
  type CustomerFinancialClause,
} from '../stage1-customer-financial-clause';
import {
  CUSTOMER_CORE_COLUMN_NAMES,
  CUSTOMER_FINANCIAL_COLUMN_NAMES,
  resolveConditionDataSource,
} from '../stage1-query-composer';
import type { ObListDefinitionConditionItem } from '@/database/entities/ob-list-definition.entity';
import type { Stage1ChainWarning } from '../stage1-filter-chain';

const WORKDT = new Date(Date.UTC(2026, 6, 1));

function build(
  conditions: ObListDefinitionConditionItem[],
  baseAlias = 'o',
): { clause: CustomerFinancialClause; warnings: Stage1ChainWarning[] } {
  const warnings: Stage1ChainWarning[] = [];
  const clause = buildCustomerFinancialClause(conditions, WORKDT, baseAlias, warnings);
  return { clause, warnings };
}

describe('F114 DATASRC — resolveConditionDataSource（customer_financial）', () => {
  it('固化值 customer_financial → 直接採用', () => {
    expect(
      resolveConditionDataSource({ columnName: 'has_guarantor', dataSource: 'customer_financial' }),
    ).toBe('customer_financial');
  });

  it('缺 dataSource + columnName ∈ 集合 → fallback customer_financial', () => {
    expect(resolveConditionDataSource({ columnName: 'phone_coll_case_cnt' })).toBe('customer_financial');
    expect(resolveConditionDataSource({ columnName: 'has_guarantor' })).toBe('customer_financial');
  });

  it('固化值 ob_pool_data 優先（即使欄名屬 financial 集合）', () => {
    expect(
      resolveConditionDataSource({ columnName: 'has_guarantor', dataSource: 'ob_pool_data' }),
    ).toBe('ob_pool_data');
  });
});

describe('F114 STATIC — 集合 / 原始碼掃描', () => {
  const clausePath = path.resolve(__dirname, '../stage1-customer-financial-clause.ts');

  it('CUSTOMER_FINANCIAL_COLUMN_NAMES 恰 8 欄、與 customer_core 集合零交集', () => {
    expect(CUSTOMER_FINANCIAL_COLUMN_NAMES.size).toBe(8);
    for (const c of CUSTOMER_FINANCIAL_COLUMN_NAMES) {
      expect(CUSTOMER_CORE_COLUMN_NAMES.has(c)).toBe(false);
    }
    expect([...CUSTOMER_FINANCIAL_COLUMN_NAMES].sort()).toEqual(
      [
        'guarantor_count',
        'has_guarantor',
        'legal_coll_case_cnt',
        'matured_case_cnt',
        'midterm_case_cnt',
        'phone_coll_case_cnt',
        'settled_case_cnt',
        'void_case_cnt',
      ].sort(),
    );
  });

  it('buildCustomerFinancialClause export 存在且不含 COALESCE(cf.*)', () => {
    expect(fs.existsSync(clausePath)).toBe(true);
    const src = fs.readFileSync(clausePath, 'utf8');
    expect(src).toMatch(/export function buildCustomerFinancialClause/);
    expect(/COALESCE\s*\(\s*cf\./i.test(src)).toBe(false);
  });
});

describe('F114 CAT — has_guarantor 直接值比對', () => {
  it('has_guarantor IN [Y] → (cf.has_guarantor IN (:...cfCat0)) + join', () => {
    const { clause } = build([
      { columnName: 'has_guarantor', fieldType: 'categorical', values: ['Y'], dataSource: 'customer_financial' },
    ]);
    expect(clause.whereFragments).toEqual(['(cf.has_guarantor IN (:...cfCat0))']);
    expect(clause.params.cfCat0).toEqual(['Y']);
    expect(clause.join).toBe(
      'LEFT JOIN customer_financial cf ON cf.source_customer_no = o.custo_no',
    );
  });

  it('空 values → EMPTY_VALUES + 不建 fragment / join null', () => {
    const { clause, warnings } = build([
      { columnName: 'has_guarantor', fieldType: 'categorical', values: [], dataSource: 'customer_financial' },
    ]);
    expect(warnings).toContainEqual(
      expect.objectContaining({ code: 'EMPTY_VALUES', columnName: 'has_guarantor' }),
    );
    expect(clause.whereFragments).toEqual([]);
    expect(clause.join).toBeNull();
  });
});

describe('F114 NUM — 件數 BETWEEN', () => {
  it('phone_coll_case_cnt min/max → (cf.phone_coll_case_cnt BETWEEN :cfNumMin0 AND :cfNumMax0)', () => {
    const { clause } = build([
      { columnName: 'phone_coll_case_cnt', fieldType: 'numeric', min: 1, max: 5, dataSource: 'customer_financial' },
    ]);
    expect(clause.whereFragments).toEqual([
      '(cf.phone_coll_case_cnt BETWEEN :cfNumMin0 AND :cfNumMax0)',
    ]);
    expect(clause.params.cfNumMin0).toBe(1);
    expect(clause.params.cfNumMax0).toBe(5);
  });

  it('min/max 缺一 → INCOMPLETE_NUMERIC_RANGE + 不建 fragment', () => {
    const { clause, warnings } = build([
      { columnName: 'legal_coll_case_cnt', fieldType: 'numeric', min: 1, dataSource: 'customer_financial' },
    ]);
    expect(warnings).toContainEqual(
      expect.objectContaining({ code: 'INCOMPLETE_NUMERIC_RANGE', columnName: 'legal_coll_case_cnt' }),
    );
    expect(clause.whereFragments).toEqual([]);
    expect(clause.join).toBeNull();
  });
});

describe('F114 JOIN / mixed / scope', () => {
  it('無 customer_financial 條件 → join null / 無 fragment', () => {
    const { clause } = build([
      { columnName: 'prod_kind', fieldType: 'categorical', values: ['01'], dataSource: 'ob_pool_data' },
    ]);
    expect(clause.join).toBeNull();
    expect(clause.whereFragments).toEqual([]);
    expect(clause.params).toEqual({});
  });

  it('多條件共用單一 JOIN，params 獨立且一律 cf 前綴', () => {
    const { clause } = build([
      { columnName: 'has_guarantor', fieldType: 'categorical', values: ['Y'], dataSource: 'customer_financial' },
      { columnName: 'phone_coll_case_cnt', fieldType: 'numeric', min: 1, max: 5, dataSource: 'customer_financial' },
      { columnName: 'legal_coll_case_cnt', fieldType: 'numeric', min: 0, max: 3, dataSource: 'customer_financial' },
    ]);
    expect(clause.whereFragments).toHaveLength(3);
    expect(clause.join).toBe(
      'LEFT JOIN customer_financial cf ON cf.source_customer_no = o.custo_no',
    );
    for (const k of Object.keys(clause.params)) {
      expect(k.startsWith('cf')).toBe(true);
    }
  });

  it('baseAlias=ob_pool_data（chain 路徑）→ JOIN ON 使用該 alias', () => {
    const { clause } = build(
      [{ columnName: 'has_guarantor', fieldType: 'categorical', values: ['Y'], dataSource: 'customer_financial' }],
      'ob_pool_data',
    );
    expect(clause.join).toBe(
      'LEFT JOIN customer_financial cf ON cf.source_customer_no = ob_pool_data.custo_no',
    );
  });
});
