/**
 * F119 / AD-E07-50 §3.3（四個呼叫端之一）—— buildCustomerFinancialClause 文字比對運算子擴充。
 *
 * 撰寫依據同 f119-customer-core-categorical-operator.spec.ts：F119 spec BR-5 / AC-3 / AC-10 +
 * AD-E07-50 §3.3（呼叫端 4）+ §7 I-CATOP-NULL-MATRIX-01。**未**開啟
 * `stage1-customer-financial-clause.ts` 生產碼；wiring 慣例取自既有測試檔
 * `stage1-customer-financial-clause.spec.ts`。
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

import {
  buildCustomerFinancialClause,
  type CustomerFinancialClause,
} from '../stage1-customer-financial-clause';
import type { ObListDefinitionConditionItem } from '@/database/entities/ob-list-definition.entity';
import type { Stage1ChainWarning } from '../stage1-filter-chain';

type F119ConditionItem = ObListDefinitionConditionItem & {
  operator?: 'in' | 'contains' | 'not_contains' | 'equals';
  keyword?: string;
};

const WORKDT = new Date(Date.UTC(2026, 6, 1));

function build(
  conditions: F119ConditionItem[],
  baseAlias = 'o',
): { clause: CustomerFinancialClause; warnings: Stage1ChainWarning[] } {
  const warnings: Stage1ChainWarning[] = [];
  const clause = buildCustomerFinancialClause(conditions as ObListDefinitionConditionItem[], WORKDT, baseAlias, warnings);
  return { clause, warnings };
}

describe('F119 customer_financial — has_guarantor 之文字運算子', () => {
  it('CF-OP-001：has_guarantor contains → fragment 含 cf.has_guarantor 與 LIKE/ESCAPE', () => {
    const { clause } = build([
      { columnName: 'has_guarantor', fieldType: 'categorical', operator: 'contains', keyword: 'Y', dataSource: 'customer_financial' },
    ]);
    const frag = clause.whereFragments.join(' ');
    expect(frag).toMatch(/cf\.has_guarantor/);
    expect(frag).toMatch(/LIKE/i);
    expect(frag).toMatch(/ESCAPE/i);
  });

  it('CF-OP-002：has_guarantor equals → "cf.has_guarantor = "，不含 LIKE', () => {
    const { clause } = build([
      { columnName: 'has_guarantor', fieldType: 'categorical', operator: 'equals', keyword: 'Y', dataSource: 'customer_financial' },
    ]);
    const frag = clause.whereFragments.join(' ');
    expect(frag).toMatch(/cf\.has_guarantor\s*=/);
    expect(frag).not.toMatch(/LIKE/i);
  });

  it('CF-OP-003（★核心 / I-CATOP-NULL-MATRIX-01）：has_guarantor not_contains → 不得含 IS NULL / COALESCE（customer_financial 七格之一）', () => {
    const { clause } = build([
      { columnName: 'has_guarantor', fieldType: 'categorical', operator: 'not_contains', keyword: 'Y', dataSource: 'customer_financial' },
    ]);
    const frag = clause.whereFragments.join(' ');
    expect(frag).toMatch(/NOT LIKE/i);
    expect(frag).not.toMatch(/IS NULL/i);
    expect(frag).not.toMatch(/COALESCE/i);
  });

  it('CF-OP-004：operator 缺漏（視為 in）與現況 IN 語意逐字相同（AC-17 回歸）', () => {
    const { clause } = build([
      { columnName: 'has_guarantor', fieldType: 'categorical', values: ['Y'], dataSource: 'customer_financial' },
    ]);
    expect(clause.whereFragments).toEqual(['(cf.has_guarantor IN (:...cfCat0))']);
  });
});

describe('F119 customer_financial — 靜態原始碼掃描', () => {
  it('CF-OP-STATIC-001：原始碼不含 COALESCE(cf.*)（I-CF-NULL-EXCLUDE-01 未被本 feature 破壞）', () => {
    const p = path.resolve(__dirname, '../stage1-customer-financial-clause.ts');
    const src = fs.readFileSync(p, 'utf8');
    expect(/COALESCE\s*\(\s*cf\./i.test(src)).toBe(false);
  });

  it('CF-OP-STATIC-002（I-CATOP-SINGLE-FRAGMENT-01）：customer_financial 建構器須 import buildCategoricalOperatorFragment，不得自行拼裝關鍵字比對', () => {
    const p = path.resolve(__dirname, '../stage1-customer-financial-clause.ts');
    const src = fs.readFileSync(p, 'utf8');
    expect(src).toMatch(/buildCategoricalOperatorFragment/);
  });
});
