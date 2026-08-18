/**
 * buildCustomerCoreClauseMssql — AD-E07-42 P3a：`stage1-customer-core-clause.ts` 之 MSSQL 平行版。
 *
 * 與 PG 版（buildCustomerCoreClause）行為逐條等價，唯一方言差異為 **AGE 衍生欄位**：
 *   PG ：`(EXTRACT(YEAR FROM AGE(:ccWorkdt::date, cc.date_of_birth)))::int BETWEEN :ccAgeMin AND :ccAgeMax`
 *   MSSQL：`DATEDIFF(YEAR, cc.date_of_birth, CAST(:ccWorkdt AS DATE))`
 *          `  - CASE WHEN (MONTH(dob)>MONTH(wk)) OR (MONTH(dob)=MONTH(wk) AND DAY(dob)>DAY(wk)) THEN 1 ELSE 0 END`
 *
 * 🔴 引數順序（R-MSSQL-P3A-02 / test-designer 查證發現 2）：`DATEDIFF(datepart, start, end)` 語意為
 *   `end − start`；`start=date_of_birth, end=workdt` 才得正值年齡（AD §2.1 表格建議把兩者寫反 → 得負值）。
 *   AD 建議之 CASE（「未達當年生日不計」）方向正確，僅 DATEDIFF 兩引數需對調。
 *
 * NULL 傳播（I-CC-NULL-EXCLUDE-01，延伸至 MSSQL）：`date_of_birth IS NULL` →
 *   `DATEDIFF(YEAR, NULL, wk)` = NULL；CASE 各分量 `MONTH(NULL)` = NULL → 布林 unknown → 走 ELSE 0；
 *   `NULL − 0` = NULL → `NULL BETWEEN min AND max` = unknown → WHERE 天然排除。不得 COALESCE。
 *
 * 其餘（gender/5 個 _desc 直接比對、cpost_city LEFT3、LEFT JOIN、參數命名 cc 前綴）皆 ANSI，
 * 與 PG 版逐字相同（MSSQL `LEFT()` 原生支援；雙引號識別碼於 QUOTED_IDENTIFIER ON 可用）。
 *
 * ⚠️ PG 檔（stage1-customer-core-clause.ts）完全不動（AD §1.1 / STATIC-002）；本檔為新增平行版。
 */

import type { ObListDefinitionConditionItem } from '@/database/entities/ob-list-definition.entity';
import {
  buildCategoricalOperatorFragment,
  resolveCategoricalOperator,
  resolveConditionDataSource,
  SAFE_COLUMN_NAME_RE,
  type Stage1ComposerWarning,
} from './stage1-query-composer';
// 型別 only（編譯期擦除，無 runtime 循環依賴）：沿用 PG 版之 CustomerCoreClause 結構定義。
import type { CustomerCoreClause } from './stage1-customer-core-clause';
import type { Stage1ChainWarning } from './stage1-filter-chain';

/** gender + 5 個 _desc 欄：直接值比對（`cc.col IN (...)`）。與 PG 版同一集合。 */
const DIRECT_MATCH_COLUMNS: ReadonlySet<string> = new Set([
  'gender',
  'occupation_desc',
  'education_desc',
  'marital_status_desc',
  'customer_type_desc',
  'monthly_income_desc',
]);

/**
 * MSSQL 版 customer_core 條件式 LEFT JOIN + WHERE fragments（AD-E07-42 §2.1）。
 * 簽章與 PG 版 buildCustomerCoreClause 完全一致，呼叫端可依 dialect 切換。
 *
 * @param conditions 完整 condition 陣列（未過濾）；內部以 resolveConditionDataSource 篩出 customer_core 條件
 * @param workdt     作業月首日（AGE 基準日，BR-5）
 * @param baseAlias  ob_pool_data 在呼叫端查詢中的 alias（buildStage1SqlMssql 用 'o'）
 * @param warnings   呼叫端 warnings 陣列（本函式 push，不自建）
 */
export function buildCustomerCoreClauseMssql(
  conditions: ObListDefinitionConditionItem[],
  workdt: Date,
  baseAlias: string,
  warnings: Stage1ChainWarning[],
): CustomerCoreClause {
  const ccConditions = (conditions ?? []).filter(
    (c) => resolveConditionDataSource(c) === 'customer_core',
  );
  if (ccConditions.length === 0) {
    return { join: null, whereFragments: [], params: {} };
  }

  const whereFragments: string[] = [];
  const params: Record<string, unknown> = {};
  let catIdx = 0;

  const pushWarning = (w: Stage1ComposerWarning) => warnings.push(w);

  for (const cond of ccConditions) {
    if (!SAFE_COLUMN_NAME_RE.test(cond.columnName)) {
      pushWarning({
        code: 'INVALID_COLUMN_NAME',
        columnName: cond.columnName,
        reason: `columnName violates ${SAFE_COLUMN_NAME_RE}`,
      });
      continue;
    }

    // gender + 5 個 _desc 欄：直接值比對（不得 COALESCE：NULL IN (...) = NULL → 排除）
    // cpost_city：LEFT3 縣市級衍生（MSSQL LEFT() 原生；LEFT(NULL,3)=NULL → 排除，不得 COALESCE）
    // F119：四運算子共用同一衍生後運算式（AD-E07-50 §3.3 呼叫端 3，與 PG 版逐字相同）
    if (DIRECT_MATCH_COLUMNS.has(cond.columnName) || cond.columnName === 'cpost_city') {
      const colExpr =
        cond.columnName === 'cpost_city'
          ? 'LEFT(cc.cpost_city, 3)'
          : `cc.${cond.columnName}`;
      const built = buildCustomerCoreCategoricalMssql(
        cond,
        colExpr,
        `ccCat${catIdx}`,
        pushWarning,
      );
      if (!built) continue;
      catIdx += 1;
      // I-CC-NULL-EXCLUDE-01 + I-CATOP-NULL-MATRIX-01：not_contains 亦不得新增 IS NULL 特判
      whereFragments.push(`(${built.fragment})`);
      Object.assign(params, built.params);
      continue;
    }

    // date_of_birth：AGE 衍生（BR-5，基準日 = workdt 作業月首日）— MSSQL DATEDIFF 公式（dob 為 start 引數）。
    if (cond.columnName === 'date_of_birth') {
      if (
        cond.min === undefined ||
        cond.min === null ||
        cond.max === undefined ||
        cond.max === null
      ) {
        pushWarning({
          code: 'INCOMPLETE_NUMERIC_RANGE',
          columnName: cond.columnName,
          reason: 'min or max missing',
        });
        continue;
      }
      whereFragments.push(`(${mssqlAgeExpr('cc.date_of_birth')} BETWEEN :ccAgeMin AND :ccAgeMax)`);
      params.ccWorkdt = toIsoDate(workdt);
      params.ccAgeMin = cond.min;
      params.ccAgeMax = cond.max;
      continue;
    }

    // 未知 customer_core 欄名（理論上不會發生，defense-in-depth）
    pushWarning({
      code: 'INVALID_COLUMN_NAME',
      columnName: cond.columnName,
      reason: 'unrecognized customer_core column',
    });
  }

  if (whereFragments.length === 0) {
    return { join: null, whereFragments: [], params: {} };
  }

  return {
    join: `LEFT JOIN customer_core cc ON cc.source_customer_no = ${baseAlias}.custo_no`,
    whereFragments,
    params,
  };
}

/**
 * MSSQL 整年年齡表達式（對齊 PG `EXTRACT(YEAR FROM AGE(workdt, dob))` 語意）。
 * 基準日以具名參數 `:ccWorkdt`（'YYYY-MM-DD'）帶入，重複引用 → 同一 `@N`（driver parameterIndexMap）。
 *
 * @param dobExpr date_of_birth 欄位表達式（如 'cc.date_of_birth'）
 */
export function mssqlAgeExpr(dobExpr: string): string {
  const wk = 'CAST(:ccWorkdt AS DATE)';
  return (
    `(DATEDIFF(YEAR, ${dobExpr}, ${wk}) - ` +
    `CASE WHEN (MONTH(${dobExpr}) > MONTH(${wk})) ` +
    `OR (MONTH(${dobExpr}) = MONTH(${wk}) AND DAY(${dobExpr}) > DAY(${wk})) ` +
    `THEN 1 ELSE 0 END)`
  );
}

/** Date → 'YYYY-MM-DD'（AGE 基準日字串，與 PG 版 toIsoDate 逐字相同，供 :ccWorkdt 綁定）。 */
function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * F119 / AD-E07-50 §3.3（呼叫端 3）：customer_core categorical 條件之 SQL 片段（MSSQL 版）。
 *
 * 與 PG 版 `buildCustomerCoreCategorical` 逐條等價——四運算子一律委派
 * `buildCategoricalOperatorFragment`（I-CATOP-SINGLE-FRAGMENT-01），本函式僅負責輸入完整性
 * 檢查 + warning；`nullKeptOnNotContains: false`（I-CATOP-NULL-MATRIX-01 七格之一，
 * `not_contains` 依賴三值邏輯天然排除，不得新增 IS NULL / COALESCE 特判）。
 */
function buildCustomerCoreCategoricalMssql(
  cond: ObListDefinitionConditionItem,
  colExpr: string,
  paramName: string,
  pushWarning: (w: Stage1ComposerWarning) => void,
): { fragment: string; params: Record<string, unknown> } | null {
  const operator = resolveCategoricalOperator(cond.operator);
  if (operator === 'in') {
    if (!Array.isArray(cond.values) || cond.values.length === 0) {
      pushWarning({
        code: 'EMPTY_VALUES',
        columnName: cond.columnName,
        reason: 'values missing or empty',
      });
      return null;
    }
    return buildCategoricalOperatorFragment({
      colExpr,
      operator,
      values: cond.values,
      paramName,
      nullKeptOnNotContains: false,
    });
  }

  const keyword = typeof cond.keyword === 'string' ? cond.keyword.trim() : '';
  if (keyword.length === 0) {
    pushWarning({
      code: 'EMPTY_VALUES',
      columnName: cond.columnName,
      reason: 'keyword missing or empty for text match operator',
    });
    return null;
  }
  return buildCategoricalOperatorFragment({
    colExpr,
    operator,
    keyword,
    paramName,
    nullKeptOnNotContains: false,
  });
}
