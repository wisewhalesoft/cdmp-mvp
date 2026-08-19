/**
 * F119 / AD-E07-50 §3.3（四個呼叫端之一）—— buildCustomerCoreClause 文字比對運算子擴充。
 *
 * 撰寫依據：F119 spec BR-5 / AC-3 / AC-10 + AD-E07-50 §3.3（「四個呼叫端改動」第 2/3 項）+
 * §7 I-CATOP-NULL-MATRIX-01 / I-CATOP-SINGLE-FRAGMENT-01。**未**開啟
 * `stage1-customer-core-clause.ts` / `stage1-customer-core-clause-mssql.ts` 生產碼；wiring
 * 慣例（`build()` helper、`ObListDefinitionConditionItem` 型別、既有 `WORKDT`）取自既有測試檔
 * `stage1-customer-core-clause.spec.ts`（允許範圍：既有測試檔）。
 *
 * 核心斷言：
 *   - customer_core 之文字運算子分支必須路由至 buildCategoricalOperatorFragment
 *     （結構性代理指標：LIKE/ESCAPE/= 之出現 + colExpr 為 cc.xxx / LEFT(cc.cpost_city,3)）
 *   - I-CC-NULL-EXCLUDE-01 不得被本 feature 破壞：not_contains 分支**不得**新增 IS NULL /
 *     COALESCE 特判（BR-5 / I-CATOP-NULL-MATRIX-01 七格之一）
 *   - AD assumption A-3：cpost_city 之文字運算子套用於「與 in 相同之衍生後運算式」
 *     （LEFT(cc.cpost_city, 3)），而非原始欄位值
 *
 * 本檔沿用既有慣例，僅驗證 SQL 字串產物、不執行查詢（customer_core 僅存在 PG，見既有測試檔頭）。
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

import { buildCustomerCoreClause, type CustomerCoreClause } from '../stage1-customer-core-clause';
import type { ObListDefinitionConditionItem } from '@/database/entities/ob-list-definition.entity';
import type { Stage1ChainWarning } from '../stage1-filter-chain';

// F119 純加性擴充；正式型別擴充前，測試檔本地宣告 operator/keyword 兩個 optional 欄位
// （§3.9 DTO 層改動，entity 型別本身之擴充由 TDD 落地，測試檔不需等待該擴充即可先行紅燈）。
type F119ConditionItem = ObListDefinitionConditionItem & {
  operator?: 'in' | 'contains' | 'not_contains' | 'equals';
  keyword?: string;
};

const WORKDT = new Date(Date.UTC(2026, 6, 1));

function build(
  conditions: F119ConditionItem[],
  baseAlias = 'o',
): { clause: CustomerCoreClause; warnings: Stage1ChainWarning[] } {
  const warnings: Stage1ChainWarning[] = [];
  const clause = buildCustomerCoreClause(conditions as ObListDefinitionConditionItem[], WORKDT, baseAlias, warnings);
  return { clause, warnings };
}

describe('F119 customer_core — 直接值比對欄位（gender）之文字運算子', () => {
  it('CC-OP-001：gender contains → fragment 含 cc.gender 與 LIKE/ESCAPE（路由至共用函式，AD §3.3 呼叫端 2）', () => {
    const { clause } = build([
      { columnName: 'gender', fieldType: 'categorical', operator: 'contains', keyword: '男', dataSource: 'customer_core' },
    ]);
    const frag = clause.whereFragments.join(' ');
    expect(frag).toMatch(/cc\.gender/);
    expect(frag).toMatch(/LIKE/i);
    expect(frag).toMatch(/ESCAPE/i);
  });

  it('CC-OP-002：gender equals → fragment 含 "cc.gender = "，不含 LIKE', () => {
    const { clause } = build([
      { columnName: 'gender', fieldType: 'categorical', operator: 'equals', keyword: '男', dataSource: 'customer_core' },
    ]);
    const frag = clause.whereFragments.join(' ');
    expect(frag).toMatch(/cc\.gender\s*=/);
    expect(frag).not.toMatch(/LIKE/i);
  });

  it('CC-OP-003（★核心 / I-CATOP-NULL-MATRIX-01）：gender not_contains → fragment 不得含 IS NULL / COALESCE（customer_core 七格之一，沿用既有天然排除）', () => {
    const { clause } = build([
      { columnName: 'gender', fieldType: 'categorical', operator: 'not_contains', keyword: '男', dataSource: 'customer_core' },
    ]);
    const frag = clause.whereFragments.join(' ');
    expect(frag).toMatch(/NOT LIKE/i);
    expect(frag).not.toMatch(/IS NULL/i);
    expect(frag).not.toMatch(/COALESCE/i);
  });

  it('CC-OP-004：operator 缺漏（視為 in）與現況 IN 語意逐字相同（AC-17 回歸，未破壞既有 F109 路徑）', () => {
    const { clause } = build([
      { columnName: 'gender', fieldType: 'categorical', values: ['1'], dataSource: 'customer_core' },
    ]);
    expect(clause.whereFragments).toEqual(['(cc.gender IN (:...ccCat0))']);
  });
});

describe('F119 customer_core — 衍生欄位（cpost_city LEFT3）之文字運算子', () => {
  it('CC-OP-005（AD assumption A-3）：cpost_city contains → colExpr 為衍生後之 LEFT(cc.cpost_city, 3)，非原始欄位', () => {
    const { clause } = build([
      { columnName: 'cpost_city', fieldType: 'categorical', operator: 'contains', keyword: '北', dataSource: 'customer_core' },
    ]);
    const frag = clause.whereFragments.join(' ');
    expect(frag).toMatch(/LEFT\(\s*cc\.cpost_city\s*,\s*3\s*\)/);
    expect(frag).toMatch(/LIKE/i);
  });

  it('CC-OP-006：cpost_city not_contains → 不得新增 IS NULL 特判（同 CC-OP-003 理由）', () => {
    const { clause } = build([
      { columnName: 'cpost_city', fieldType: 'categorical', operator: 'not_contains', keyword: '北', dataSource: 'customer_core' },
    ]);
    const frag = clause.whereFragments.join(' ');
    expect(frag).not.toMatch(/IS NULL/i);
  });
});

describe('F119 customer_core — 靜態原始碼掃描（NULLEXC 延伸）', () => {
  const files = ['../stage1-customer-core-clause.ts', '../stage1-customer-core-clause-mssql.ts'];

  it('CC-OP-STATIC-001：兩份 customer_core 建構器原始碼皆不含 COALESCE(cc.*)（I-CC-NULL-EXCLUDE-01 未被本 feature 破壞）', () => {
    for (const rel of files) {
      const p = path.resolve(__dirname, rel);
      if (!fs.existsSync(p)) continue; // TDD 落地前檔案可能尚無此路徑變體，容許 skip 個別檔
      const src = fs.readFileSync(p, 'utf8');
      expect(/COALESCE\s*\(\s*cc\./i.test(src)).toBe(false);
    }
  });

  it('CC-OP-STATIC-002（I-CATOP-SINGLE-FRAGMENT-01）：customer_core 建構器不得各自實作關鍵字比對——原始碼須 import buildCategoricalOperatorFragment，禁止自行拼裝 "LIKE" 字面樣式字串', () => {
    for (const rel of files) {
      const p = path.resolve(__dirname, rel);
      if (!fs.existsSync(p)) continue;
      const src = fs.readFileSync(p, 'utf8');
      expect(src).toMatch(/buildCategoricalOperatorFragment/);
    }
  });
});
