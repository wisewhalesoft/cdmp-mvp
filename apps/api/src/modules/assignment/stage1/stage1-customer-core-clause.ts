/**
 * buildCustomerCoreClause — F109 / US-172 / AD-E07-37 §OQ-F109-02
 *
 * customer_core 來源篩選欄位之條件式 LEFT JOIN 子句 + WHERE fragments 建構器。
 *
 * 設計原則（AD §OQ-F109-02）：
 *   - PG 下推（buildStage1Sql）與 chain 路徑（executeStage1Chain）**共用同一函式**（同一份 SQL，
 *     等價由「單一程式碼源」保證，而非兩份實作靠測試守住）。
 *   - customer_core 僅存在 PostgreSQL（無 TypeORM entity、SQLite 測試庫不建表）；本函式產出之
 *     `cc.*` / AGE / LEFT3 運算式僅可能在 PG 環境成功執行（AD §2 / §9 PG-only 邊界）。
 *
 * 不變式：
 *   - I-CC-NULL-EXCLUDE-01：客戶欄一律**不得 COALESCE**；NULL（無對應客戶 / 客戶欄本身 NULL）
 *     恆通過 SQL 三值邏輯自然排除（`cc.col IN (...)` / `LEFT(cc.col,3) IN (...)` /
 *     `AGE(...,NULL)` 對 NULL 均求值為 NULL → WHERE 過濾為 false）。兩種 NULL 情境共用同一段
 *     運算式，不得另立 if/else 特判。
 *   - I-CC-COMPOSER-SCOPE-01：composer 僅負責 ob_pool_data 側；cc.* fragment 一律由本函式產生。
 *   - I-CC-PARAM-NS-01：參數命名一律 `cc` 前綴（ccCat{n} / ccAgeMin / ccAgeMax / ccWorkdt），
 *     與 composer 既有前綴（cat/numMin/numMax/dateStart/dateEnd/pbCat/pbNum/caseyear）零碰撞。
 */

import type { ObListDefinitionConditionItem } from '@/database/entities/ob-list-definition.entity';
import {
  buildCategoricalOperatorFragment,
  resolveCategoricalOperator,
  resolveConditionDataSource,
  SAFE_COLUMN_NAME_RE,
  type Stage1ComposerWarning,
} from './stage1-query-composer';
// 型別 only（編譯期擦除，無 runtime 循環依賴；filter-chain 於 value 層依賴本檔案）
import type { Stage1ChainWarning } from './stage1-filter-chain';

/** buildCustomerCoreClause 產出。 */
export interface CustomerCoreClause {
  /** null = 本名單無 customer_core 條件，呼叫端不得注入 JOIN。 */
  join: string | null;
  /** 已各自以 (...) 包裹之 SQL 片段，呼叫端可直接併入 AND 清單。 */
  whereFragments: string[];
  /** 具名參數（一律 cc 前綴）。 */
  params: Record<string, unknown>;
}

/** gender + 5 個 _desc 欄：直接值比對（`cc.col IN (...)`）。 */
const DIRECT_MATCH_COLUMNS: ReadonlySet<string> = new Set([
  'gender',
  'occupation_desc',
  'education_desc',
  'marital_status_desc',
  'customer_type_desc',
  'monthly_income_desc',
]);

/**
 * 建構 customer_core 條件式 LEFT JOIN + WHERE fragments（AD §OQ-F109-02）。
 *
 * @param conditions 完整 condition 陣列（未過濾）；內部以 resolveConditionDataSource 篩出 customer_core 條件
 * @param workdt     作業月首日（AGE 基準日，BR-5）
 * @param baseAlias  ob_pool_data 在呼叫端查詢中的 alias（buildStage1Sql 用 'o'；
 *                   executeStage1Chain 之 TypeORM qb 用 'ob_pool_data'）
 * @param warnings   呼叫端 warnings 陣列（本函式 push，不自建，慣例同 buildMonthCntFragment）
 */
export function buildCustomerCoreClause(
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

    // gender + 5 個 _desc 欄：直接值比對（BR-7；gender 值為代碼 1/2/3，其餘為中文值）
    // F119：`cpost_city` 之 LEFT3 衍生運算式亦適用同一組運算子（AD-E07-50 §3.3 呼叫端 2 / A-3）
    if (DIRECT_MATCH_COLUMNS.has(cond.columnName) || cond.columnName === 'cpost_city') {
      // LEFT3 縣市級衍生（BR-6）：四運算子皆套用「與 in 相同之衍生後運算式」
      const colExpr =
        cond.columnName === 'cpost_city'
          ? 'LEFT(cc.cpost_city, 3)'
          : `cc.${cond.columnName}`;
      const built = buildCustomerCoreCategorical(cond, colExpr, `ccCat${catIdx}`, pushWarning);
      if (!built) continue;
      catIdx += 1;
      // 不得 COALESCE / 不得新增 IS NULL 特判（I-CC-NULL-EXCLUDE-01 + I-CATOP-NULL-MATRIX-01
      //   七格之二）：NULL IN (...) / NULL LIKE / NULL NOT LIKE 皆求值 NULL → 三值邏輯天然排除
      whereFragments.push(`(${built.fragment})`);
      Object.assign(params, built.params);
      continue;
    }

    // date_of_birth：AGE 衍生（BR-5，基準日 = workdt 作業月首日）
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
      // EXTRACT(YEAR FROM AGE(...))：PG age() 內建「未達當年生日不計」整年差語意，恰對齊業務定義（BR-5）。
      // AGE(:ccWorkdt, NULL) = NULL → BETWEEN 求值 NULL → 排除（不得 COALESCE 為預設歲數，BR-3）。
      whereFragments.push(
        `((EXTRACT(YEAR FROM AGE(:ccWorkdt::date, cc.date_of_birth)))::int BETWEEN :ccAgeMin AND :ccAgeMax)`,
      );
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

/** Date → 'YYYY-MM-DD'（AGE 基準日字串，供 :ccWorkdt::date 綁定）。 */
function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * F119 / AD-E07-50 §3.3（呼叫端 2）：customer_core categorical 條件之 SQL 片段。
 *
 * 四運算子一律委派 `buildCategoricalOperatorFragment`（I-CATOP-SINGLE-FRAGMENT-01），
 * 本函式僅負責「輸入完整性檢查 + warning」——不得自行拼裝 LIKE 樣式或 NULL 判斷。
 * `nullKeptOnNotContains: false`：客戶來源沿用既有天然排除（I-CC-NULL-EXCLUDE-01 /
 * I-CATOP-NULL-MATRIX-01 七格之一），`not_contains` 亦不得新增 IS NULL 特判。
 */
function buildCustomerCoreCategorical(
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
