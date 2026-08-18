/**
 * F119 / US-183 / AD-E07-50 §3.2 / §3.3 — buildCategoricalOperatorFragment + escapeLikeKeyword
 * + resolveCategoricalOperator 純函式測試（單一 SQL 落點，BR-4 / I-CATOP-SINGLE-FRAGMENT-01）。
 *
 * ⚠️ test-generator 撰寫依據：僅 F119 spec + AD-E07-50（本 feature 之架構決策文件，非生產碼）+
 *   US-183。三個函式之簽章/契約逐字取自 AD-E07-50 §3.2 / §3.3（system-architect 已核可、TDD
 *   落地依據），**未**開啟 `stage1-query-composer.ts` 生產碼本體。
 *
 * 覆蓋：
 *   - resolveCategoricalOperator 之唯一 fallback（BR-11 / I-CATOP-OPERATOR-FALLBACK-01）
 *   - escapeLikeKeyword 之跳脫超集（BR-7 / I-CATOP-ESCAPE-SINGLE-01）：`\` `%` `_` `[` `]` `^`
 *   - buildCategoricalOperatorFragment 之 BR-6 NULL 矩陣（★核心，逐格斷言）：
 *     四運算子 × { ob_pool_data（nullKeptOnNotContains=true）, 客戶來源（=false） }
 *   - 「若未跳脫則測試必紅」案例：關鍵字 `100%` 不得誤命中 `1000元`；`A_B` 不得誤命中 `AXB`
 *
 * 執行方式：呼叫該函式取得 { fragment, params }，將 fragment 轉換為可執行之 better-sqlite3
 * SQL（`:name` → `@name`），對一張自建之最小資料表執行查詢，以「真實列選取結果」驗證行為，
 * 而非僅比對字串形狀——SQLite 本身即實作 ANSI `LIKE`/`ESCAPE` 語意，函式本身宣稱
 * dialect-neutral（AD §3.2），故可信度足夠；大小寫/全半形 collation 敏感度另見
 * `.mssql.spec.ts` 軌（AD §8）。
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';

import {
  resolveCategoricalOperator,
  escapeLikeKeyword,
  buildCategoricalOperatorFragment,
  type CategoricalOperator,
  type CategoricalOperatorFragmentInput,
} from '../stage1-query-composer';

// ---------------------------------------------------------------------------
// 最小可執行 SQL 環境：t(id, col)
// ---------------------------------------------------------------------------
let db: InstanceType<typeof Database>;

beforeAll(() => {
  db = new Database(':memory:');
  db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, col TEXT)');
});

afterAll(() => {
  db.close();
});

function seed(rows: Array<{ id: number; col: string | null }>) {
  db.exec('DELETE FROM t');
  const stmt = db.prepare('INSERT INTO t (id, col) VALUES (@id, @col)');
  for (const r of rows) stmt.run(r);
}

/** 將 TypeORM 風格 params（`:name` 純值 / `:...name` 陣列）轉為 better-sqlite3 可執行之查詢。 */
function runFragment(fragment: string, params: Record<string, unknown>): number[] {
  let sql = fragment;
  const bind: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      const placeholders = value.map((_, i) => `@${key}${i}`);
      sql = sql.split(`:...${key}`).join(placeholders.join(','));
      value.forEach((v, i) => {
        bind[`${key}${i}`] = v;
      });
    } else {
      sql = sql.split(`:${key}`).join(`@${key}`);
      bind[key] = value as never;
    }
  }
  const rows = db.prepare(`SELECT id FROM t WHERE ${sql} ORDER BY id`).all(bind) as Array<{
    id: number;
  }>;
  return rows.map((r) => r.id);
}

function fragmentOf(input: CategoricalOperatorFragmentInput) {
  const result = buildCategoricalOperatorFragment(input);
  expect(result).not.toBeNull();
  return result as { fragment: string; params: Record<string, unknown> };
}

// ===========================================================================
// resolveCategoricalOperator（BR-11 / I-CATOP-OPERATOR-FALLBACK-01）
// ===========================================================================

describe('F119 resolveCategoricalOperator — 唯一 fallback 落點', () => {
  it('FRAG-RESOLVE-001：undefined/null/空字串 → "in"', () => {
    expect(resolveCategoricalOperator(undefined)).toBe('in');
    expect(resolveCategoricalOperator(null)).toBe('in');
    expect(resolveCategoricalOperator('')).toBe('in');
  });

  it('FRAG-RESOLVE-002：合法四值原樣回傳', () => {
    expect(resolveCategoricalOperator('in')).toBe('in');
    expect(resolveCategoricalOperator('contains')).toBe('contains');
    expect(resolveCategoricalOperator('not_contains')).toBe('not_contains');
    expect(resolveCategoricalOperator('equals')).toBe('equals');
  });

  it('FRAG-RESOLVE-003：非法值（不在四值集合）→ 視為缺漏，回傳 "in"（AD 實作：非四值一律 fallback）', () => {
    expect(resolveCategoricalOperator('bogus')).toBe('in');
  });
});

// ===========================================================================
// escapeLikeKeyword（BR-7 / I-CATOP-ESCAPE-SINGLE-01）
// ===========================================================================

describe('F119 escapeLikeKeyword — 跳脫超集（不依 dialect 分支）', () => {
  it('FRAG-ESC-001：% 被跳脫為 \\%', () => {
    expect(escapeLikeKeyword('100%')).toBe('100\\%');
  });

  it('FRAG-ESC-002：_ 被跳脫為 \\_', () => {
    expect(escapeLikeKeyword('A_B')).toBe('A\\_B');
  });

  it('FRAG-ESC-003：[ ] ^ 皆被跳脫（MSSQL 字元類字元，對 PG 為安全 no-op，AD §3.2 論證）', () => {
    expect(escapeLikeKeyword('A[B]^C')).toBe('A\\[B\\]\\^C');
  });

  it('FRAG-ESC-004：反斜線本身被跳脫為 \\\\（避免雙重跳脫，跳脫字元須排在集合最前處理）', () => {
    expect(escapeLikeKeyword('A\\B')).toBe('A\\\\B');
  });

  it('FRAG-ESC-005：不含特殊字元之關鍵字原樣通過', () => {
    expect(escapeLikeKeyword('勁便利')).toBe('勁便利');
  });

  it('FRAG-ESC-006：混合特殊字元逐一跳脫，非僅第一個', () => {
    expect(escapeLikeKeyword('50%_[A]')).toBe('50\\%\\_\\[A\\]');
  });
});

// ===========================================================================
// buildCategoricalOperatorFragment — 結構契約（不依賴 DB）
// ===========================================================================

describe('F119 buildCategoricalOperatorFragment — 結構契約（AD §3.3）', () => {
  it('FRAG-SHAPE-001：in + 空 values → 回傳 null（既有 "values 至少 1 個" 邊界不變）', () => {
    expect(
      buildCategoricalOperatorFragment({
        colExpr: 'col',
        operator: 'in',
        values: [],
        paramName: 'kw',
        nullKeptOnNotContains: true,
      }),
    ).toBeNull();
  });

  it('FRAG-SHAPE-002：in + 非空 values → "col IN (:...kw)"', () => {
    const { fragment, params } = fragmentOf({
      colExpr: 'col',
      operator: 'in',
      values: ['01', '02'],
      paramName: 'kw',
      nullKeptOnNotContains: true,
    });
    expect(fragment).toMatch(/col\s+IN\s*\(:\.\.\.kw\)/);
    expect(params.kw).toEqual(['01', '02']);
  });

  it('FRAG-SHAPE-003：equals → "col = :kw"，不含 LIKE / ESCAPE（BR-7：= 天然無萬用字元語意）', () => {
    const { fragment, params } = fragmentOf({
      colExpr: 'col',
      operator: 'equals',
      keyword: '勁便利',
      paramName: 'kw',
      nullKeptOnNotContains: true,
    });
    expect(fragment).toMatch(/col\s*=\s*:kw/);
    expect(fragment).not.toMatch(/LIKE/i);
    expect(params.kw).toBe('勁便利');
  });

  it('FRAG-SHAPE-004：contains → 含 LIKE 與 ESCAPE，params 樣式為 %keyword%（已跳脫）', () => {
    const { fragment, params } = fragmentOf({
      colExpr: 'col',
      operator: 'contains',
      keyword: '100%',
      paramName: 'kw',
      nullKeptOnNotContains: true,
    });
    expect(fragment).toMatch(/LIKE\s*:kw\s*ESCAPE/i);
    expect(params.kw).toBe('%100\\%%');
  });

  it('FRAG-SHAPE-005：not_contains + nullKeptOnNotContains=true → 含顯式 "col IS NULL OR"（ob_pool_data 唯一顯式格，BR-6）', () => {
    const { fragment } = fragmentOf({
      colExpr: 'col',
      operator: 'not_contains',
      keyword: '勁便利',
      paramName: 'kw',
      nullKeptOnNotContains: true,
    });
    expect(fragment).toMatch(/IS NULL/i);
    expect(fragment).toMatch(/NOT LIKE/i);
  });

  it('FRAG-SHAPE-006：not_contains + nullKeptOnNotContains=false → 不含 IS NULL（客戶來源七格之一，I-CATOP-NULL-MATRIX-01 禁止特判）', () => {
    const { fragment } = fragmentOf({
      colExpr: 'col',
      operator: 'not_contains',
      keyword: '勁便利',
      paramName: 'kw',
      nullKeptOnNotContains: false,
    });
    expect(fragment).not.toMatch(/IS NULL/i);
    expect(fragment).toMatch(/NOT LIKE/i);
  });

  it('FRAG-SHAPE-007：contains / equals 之 fragment 不受 nullKeptOnNotContains 影響（僅 not_contains 使用此旗標）', () => {
    const a = fragmentOf({
      colExpr: 'col',
      operator: 'contains',
      keyword: 'X',
      paramName: 'kw',
      nullKeptOnNotContains: true,
    });
    const b = fragmentOf({
      colExpr: 'col',
      operator: 'contains',
      keyword: 'X',
      paramName: 'kw',
      nullKeptOnNotContains: false,
    });
    expect(a.fragment).toBe(b.fragment);
  });
});

// ===========================================================================
// BR-6 NULL 八格矩陣 —— 真實 SQLite 執行（逐格斷言，本 feature 最容易出錯之處）
// ===========================================================================

describe('F119 BR-6 NULL 矩陣 — 真實資料列選取（★核心，逐格斷言）', () => {
  const KEYWORD = '勁便利';

  beforeAll(() => {
    seed([
      { id: 1, col: '勁便利專案A' }, // 含關鍵字
      { id: 2, col: '勁便利' }, // 恰等於關鍵字
      { id: 3, col: '其他專案' }, // 不含關鍵字
      { id: 4, col: null }, // NULL
    ]);
  });

  function run(operator: CategoricalOperator, nullKeptOnNotContains: boolean): number[] {
    const { fragment, params } = fragmentOf({
      colExpr: 'col',
      operator,
      keyword: KEYWORD,
      values: operator === 'in' ? [KEYWORD] : undefined,
      paramName: 'kw',
      nullKeptOnNotContains,
    });
    return runFragment(fragment, params);
  }

  // ── ob_pool_data 側（nullKeptOnNotContains = true）──────────────────────
  it('MATRIX-001：in（ob_pool_data）→ 僅精確等值列命中，NULL 排除', () => {
    expect(run('in', true)).toEqual([2]);
  });

  it('MATRIX-002：contains（ob_pool_data）→ 含關鍵字列命中，NULL 排除（AC-2）', () => {
    expect(run('contains', true)).toEqual([1, 2]);
  });

  it('MATRIX-003（★核心 / AC-3 不對稱）：not_contains（ob_pool_data）→ 不含關鍵字列 + NULL 皆命中', () => {
    expect(run('not_contains', true)).toEqual([3, 4]);
  });

  it('MATRIX-004：equals（ob_pool_data）→ 僅逐字元相同列命中，NULL 排除（AC-4）', () => {
    expect(run('equals', true)).toEqual([2]);
  });

  // ── 客戶來源側（nullKeptOnNotContains = false，代表 customer_core / customer_financial）──
  it('MATRIX-005：in（客戶來源）→ 僅精確等值列命中，NULL 排除', () => {
    expect(run('in', false)).toEqual([2]);
  });

  it('MATRIX-006：contains（客戶來源）→ 含關鍵字列命中，NULL 排除', () => {
    expect(run('contains', false)).toEqual([1, 2]);
  });

  it('MATRIX-007（★核心 / 唯一非對稱例外之對照組）：not_contains（客戶來源）→ 不含關鍵字列命中，NULL 排除（與 MATRIX-003 刻意不同）', () => {
    expect(run('not_contains', false)).toEqual([3]);
  });

  it('MATRIX-008：equals（客戶來源）→ 僅逐字元相同列命中，NULL 排除', () => {
    expect(run('equals', false)).toEqual([2]);
  });
});

// ===========================================================================
// AC-9 / BR-7 — 使用者輸入之特殊字元視為字面值（「若未跳脫則測試必紅」案例）
// ===========================================================================

describe('F119 AC-9 — 特殊字元字面值比對（未跳脫必紅）', () => {
  it('LITERAL-001（★核心）：關鍵字 "100%" 於 contains 下僅命中含字面 "100%" 之列，不得誤命中 "1000元"', () => {
    seed([
      { id: 1, col: '達成率100%達標' }, // 含字面 100%
      { id: 2, col: '1000元的商品' }, // 不含字面 100%；若 % 被誤解為萬用字元則會被誤命中
    ]);
    const { fragment, params } = fragmentOf({
      colExpr: 'col',
      operator: 'contains',
      keyword: '100%',
      paramName: 'kw',
      nullKeptOnNotContains: true,
    });
    expect(runFragment(fragment, params)).toEqual([1]);
  });

  it('LITERAL-002：關鍵字含 "_" 於 contains 下不得被解讀為任意單一字元', () => {
    seed([
      { id: 1, col: '型號A_B規格' }, // 含字面 A_B
      { id: 2, col: '型號AXB規格' }, // 不含字面 A_B；若 _ 被誤解為萬用字元則會被誤命中
    ]);
    const { fragment, params } = fragmentOf({
      colExpr: 'col',
      operator: 'contains',
      keyword: 'A_B',
      paramName: 'kw',
      nullKeptOnNotContains: true,
    });
    expect(runFragment(fragment, params)).toEqual([1]);
  });

  it('LITERAL-003：equals 天然無萬用字元語意，"100%" 僅精確相等時命中', () => {
    seed([
      { id: 1, col: '100%' },
      { id: 2, col: '100%達標' },
    ]);
    const { fragment, params } = fragmentOf({
      colExpr: 'col',
      operator: 'equals',
      keyword: '100%',
      paramName: 'kw',
      nullKeptOnNotContains: true,
    });
    expect(runFragment(fragment, params)).toEqual([1]);
  });

  it('LITERAL-004：not_contains 亦須遵守字面值語意（不得因 % 被誤解讀而誤判排除）', () => {
    seed([
      { id: 1, col: '達成率100%達標' }, // 含字面 100% → not_contains 應排除
      { id: 2, col: '1000元的商品' }, // 不含字面 100% → not_contains 應保留
      { id: 3, col: null },
    ]);
    const { fragment, params } = fragmentOf({
      colExpr: 'col',
      operator: 'not_contains',
      keyword: '100%',
      paramName: 'kw',
      nullKeptOnNotContains: true,
    });
    expect(runFragment(fragment, params)).toEqual([2, 3]);
  });
});
