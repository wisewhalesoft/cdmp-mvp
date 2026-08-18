/**
 * buildCustomerFinancialClause — F114：customer_financial 來源篩選欄位之條件式 LEFT JOIN
 * 子句 + WHERE fragments 建構器（比照 F109 buildCustomerCoreClause）。
 *
 * 設計原則：
 *   - PG 下推（buildStage1Sql）與 chain 路徑（executeStage1Chain）**共用同一函式**。
 *   - customer_financial 為 migration-managed 目標表（無 TypeORM entity）；join 於呼叫端注入。
 *   - **方言無關**：customer_financial 欄位僅類別值比對（has_guarantor IN）與數值範圍
 *     （各件數/次數 BETWEEN），皆 ANSI，PG 與 MSSQL 逐字相同 → MSSQL 版
 *     （stage1-customer-financial-clause-mssql.ts）直接 re-export 本函式（不像 customer_core
 *     之 AGE 需 DATEDIFF 方言分歧）。
 *
 * 不變式：
 *   - I-CF-NULL-EXCLUDE-01：客戶財務欄一律**不得 COALESCE**；NULL（無對應客戶 / 欄本身 NULL）
 *     於 `cf.col IN (...)` / `cf.col BETWEEN ...` 均求值 NULL → WHERE 三值邏輯天然排除。
 *   - I-CF-COMPOSER-SCOPE-01：composer 僅負責 ob_pool_data 側；cf.* fragment 一律由本函式產生。
 *   - I-CF-PARAM-NS-01：參數命名一律 `cf` 前綴（cfCat{n} / cfNumMin{n} / cfNumMax{n}），
 *     與 composer（cat/numMin/…）及 customer_core（cc*）零碰撞。
 */

import type { ObListDefinitionConditionItem } from '@/database/entities/ob-list-definition.entity';
import {
  buildCategoricalOperatorFragment,
  resolveCategoricalOperator,
  resolveConditionDataSource,
  SAFE_COLUMN_NAME_RE,
  type Stage1ComposerWarning,
} from './stage1-query-composer';
import type { Stage1ChainWarning } from './stage1-filter-chain';

/** buildCustomerFinancialClause 產出。 */
export interface CustomerFinancialClause {
  /** null = 本名單無 customer_financial 條件，呼叫端不得注入 JOIN。 */
  join: string | null;
  /** 已各自以 (...) 包裹之 SQL 片段，呼叫端可直接併入 AND 清單。 */
  whereFragments: string[];
  /** 具名參數（一律 cf 前綴）。 */
  params: Record<string, unknown>;
}

/**
 * 建構 customer_financial 條件式 LEFT JOIN + WHERE fragments。
 *
 * @param conditions 完整 condition 陣列（未過濾）；內部以 resolveConditionDataSource 篩出 customer_financial 條件
 * @param _workdt    未使用（保留與 buildCustomerCoreClause 同簽章，方便呼叫端一致傳參）
 * @param baseAlias  ob_pool_data 在呼叫端查詢中的 alias（buildStage1Sql 用 'o'；chain 用 'ob_pool_data'）
 * @param warnings   呼叫端 warnings 陣列（本函式 push，不自建）
 */
export function buildCustomerFinancialClause(
  conditions: ObListDefinitionConditionItem[],
  _workdt: Date,
  baseAlias: string,
  warnings: Stage1ChainWarning[],
): CustomerFinancialClause {
  const cfConditions = (conditions ?? []).filter(
    (c) => resolveConditionDataSource(c) === 'customer_financial',
  );
  if (cfConditions.length === 0) {
    return { join: null, whereFragments: [], params: {} };
  }

  const whereFragments: string[] = [];
  const params: Record<string, unknown> = {};
  let idx = 0;

  const pushWarning = (w: Stage1ComposerWarning) => warnings.push(w);

  for (const cond of cfConditions) {
    if (!SAFE_COLUMN_NAME_RE.test(cond.columnName)) {
      pushWarning({
        code: 'INVALID_COLUMN_NAME',
        columnName: cond.columnName,
        reason: `columnName violates ${SAFE_COLUMN_NAME_RE}`,
      });
      continue;
    }

    // categorical（has_guarantor：Y/N）：直接值比對；不得 COALESCE（NULL IN (...) = NULL → 排除）
    // F119 / AD-E07-50 §3.3（呼叫端 4）：四運算子一律委派 buildCategoricalOperatorFragment
    if (cond.fieldType === 'categorical') {
      const built = buildCustomerFinancialCategorical(
        cond,
        `cf.${cond.columnName}`,
        `cfCat${idx}`,
        pushWarning,
      );
      if (!built) continue;
      idx += 1;
      // I-CF-NULL-EXCLUDE-01 + I-CATOP-NULL-MATRIX-01（七格之一）：not_contains 不得新增 IS NULL 特判
      whereFragments.push(`(${built.fragment})`);
      Object.assign(params, built.params);
      continue;
    }

    // numeric（各件數 / 次數）：BETWEEN；NULL BETWEEN … = unknown → 排除，不得 COALESCE
    if (cond.fieldType === 'numeric') {
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
      const minP = `cfNumMin${idx}`;
      const maxP = `cfNumMax${idx}`;
      idx += 1;
      whereFragments.push(`(cf.${cond.columnName} BETWEEN :${minP} AND :${maxP})`);
      params[minP] = cond.min;
      params[maxP] = cond.max;
      continue;
    }

    // customer_financial 無 date 型欄位（defense-in-depth）
    pushWarning({
      code: 'UNKNOWN_FIELD_TYPE',
      columnName: cond.columnName,
      reason: `fieldType=${(cond as { fieldType?: string }).fieldType} not supported for customer_financial`,
    });
  }

  if (whereFragments.length === 0) {
    return { join: null, whereFragments: [], params: {} };
  }

  return {
    join: `LEFT JOIN customer_financial cf ON cf.source_customer_no = ${baseAlias}.custo_no`,
    whereFragments,
    params,
  };
}

/**
 * F119 / AD-E07-50 §3.3（呼叫端 4）：customer_financial categorical 條件之 SQL 片段。
 *
 * 四運算子一律委派 `buildCategoricalOperatorFragment`（I-CATOP-SINGLE-FRAGMENT-01），
 * 本函式僅負責輸入完整性檢查 + warning；`nullKeptOnNotContains: false`
 * （I-CATOP-NULL-MATRIX-01 七格之一，NULL 由 SQL 三值邏輯天然排除）。
 */
function buildCustomerFinancialCategorical(
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
