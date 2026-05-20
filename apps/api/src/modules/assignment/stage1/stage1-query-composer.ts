/**
 * Stage1QueryComposer — F050 v2.1 / AD-E07-18 §18.5 Stage 1 動態 SQL 演算法
 *
 * Pure function 設計（不掛 NestJS DI），與 5a `deriveBackwardCompatColumns` 風格一致。
 *
 * 對應 spec：
 *   - §18.5 路徑 A（condition_payload IS NOT NULL）：JSONB 解析 → IN/BETWEEN fragment
 *   - §18.5 路徑 B（condition_payload IS NULL）：5 個 entity column → IN fragment
 *   - §18.5.1：caseyear values 含 '99' wildcard → 完全 skip year_cnt fragment
 *   - §18.5.2：conditions=[] 或 _backfill_empty=true → skipReason='EMPTY_CONDITIONS'
 *   - §18.6 路徑 B entity column → ob_pool_data 欄位 mapping 表
 *   - 防禦：columnName 須符合 `/^[a-z][a-z0-9_]{0,63}$/`（防 SQL Injection）
 *
 * 不在範圍：
 *   - list_period_* × month_cnt × list_interval mod 過濾（5c 處理）
 *
 * 回傳 Stage1QueryFragment 給 AssignmentRunPipelineService 組裝 queryBuilder。
 */

import type { ObListDefinition } from '@/database/entities/ob-list-definition.entity';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type Stage1SkipReason = 'EMPTY_CONDITIONS';

export interface Stage1ComposerWarning {
  code:
    | 'INVALID_COLUMN_NAME'
    | 'EMPTY_VALUES'
    | 'INCOMPLETE_NUMERIC_RANGE'
    | 'INCOMPLETE_DATE_RANGE'
    | 'UNKNOWN_FIELD_TYPE';
  columnName?: string;
  reason: string;
}

export interface Stage1QueryFragment {
  /** SQL WHERE 子句（fragments AND 連接）；skip 或無有效條件時為 null */
  where: string | null;
  /** TypeORM queryBuilder.where(...) 第二參數 */
  params: Record<string, unknown>;
  /** 若 skipReason 非 null → runPipeline 跳過此 list */
  skipReason: Stage1SkipReason | null;
  /** 非阻擋型警告（記錄但不 skip）；composer skip 整 list 時透過 skipReason 表達，warnings 為附加細節 */
  warnings: Stage1ComposerWarning[];
}

// ---------------------------------------------------------------------------
// Internal constants
// ---------------------------------------------------------------------------

/**
 * §18.5 columnName allowlist 防禦：
 *   - 起首為小寫英文字母
 *   - 後續為小寫英文 / 數字 / 底線
 *   - 全長 1~64 字元
 *
 * 不符合者一律 skip 並 push warning（不 throw），避免 SQL Injection。
 */
const SAFE_COLUMN_NAME_RE = /^[a-z][a-z0-9_]{0,63}$/;

/**
 * §18.5.1：caseyear 「不限年數」wildcard 代碼。
 */
const CASEYEAR_WILDCARD = '99';

/**
 * §18.5 路徑 B：5 個 backward-compat entity column 與 ob_pool_data 欄位映射。
 *
 * 注意 case_status 對應 ob_pool_data.list_type（§18.5 表）。
 */
const PATH_B_MAPPING: ReadonlyArray<{
  entityCol: 'prod_kind' | 'caseyear' | 'spec_tp' | 'case_status' | 'settle_src';
  poolDataCol: string;
  /** caseyear 對應 year_cnt 為整數欄位，需特別處理 + wildcard 判斷 */
  numericInt?: boolean;
}> = [
  { entityCol: 'prod_kind', poolDataCol: 'prod_kind' },
  { entityCol: 'caseyear', poolDataCol: 'year_cnt', numericInt: true },
  { entityCol: 'spec_tp', poolDataCol: 'spec_tp' },
  { entityCol: 'case_status', poolDataCol: 'list_type' },
  { entityCol: 'settle_src', poolDataCol: 'settle_src' },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * 主入口：對單一 ObListDefinition 生成 Stage 1 SQL fragment。
 *
 * 呼叫端（AssignmentRunPipelineService.runPipeline）依結果決定：
 *   - `skipReason !== null` → 不撈 ob_pool_data，記錄 skip + Logger.warn
 *   - `skipReason === null && where !== null` →
 *       `poolRepo.createQueryBuilder('p').where(where, params).getMany()`
 */
export function buildStage1WhereConditions(
  list: ObListDefinition,
): Stage1QueryFragment {
  // 路徑 A：condition_payload IS NOT NULL
  if (list.condition_payload) {
    return buildPathA(list.condition_payload);
  }

  // 路徑 B：condition_payload IS NULL（legacy 名單 fallback）
  return buildPathB(list);
}

// ---------------------------------------------------------------------------
// Path A 實作（波 1 — categorical；波 2 補 numeric/date；波 4 補 caseyear wildcard）
// ---------------------------------------------------------------------------

function buildPathA(
  payload: NonNullable<ObListDefinition['condition_payload']>,
): Stage1QueryFragment {
  const warnings: Stage1ComposerWarning[] = [];

  // §18.5.2：空 conditions skip
  if (!Array.isArray(payload.conditions) || payload.conditions.length === 0) {
    return {
      where: null,
      params: {},
      skipReason: 'EMPTY_CONDITIONS',
      warnings: [],
    };
  }

  const fragments: string[] = [];
  const params: Record<string, unknown> = {};
  let paramIdx = 0;

  for (const cond of payload.conditions) {
    if (cond.fieldType === 'categorical') {
      const built = buildCategoricalFragment(cond, paramIdx, warnings);
      if (built) {
        fragments.push(built.fragment);
        Object.assign(params, built.params);
        paramIdx += 1;
      }
      continue;
    }

    // 波 2~5 補：numeric / date / 其他
    warnings.push({
      code: 'UNKNOWN_FIELD_TYPE',
      columnName: cond.columnName,
      reason: `fieldType=${cond.fieldType} not yet supported`,
    });
  }

  // §18.5.2 衍生：所有 fragment 皆被 wildcard / 失敗過濾掉 → 視為空條件 skip
  if (fragments.length === 0) {
    return {
      where: null,
      params: {},
      skipReason: 'EMPTY_CONDITIONS',
      warnings,
    };
  }

  return {
    where: fragments.join(' AND '),
    params,
    skipReason: null,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Path B 實作（波 3 補完）— 此波先回 EMPTY_CONDITIONS 占位
// ---------------------------------------------------------------------------

function buildPathB(_list: ObListDefinition): Stage1QueryFragment {
  // 波 3 將補完；此處先回 EMPTY_CONDITIONS 讓 UCQ-003 通過
  return {
    where: null,
    params: {},
    skipReason: 'EMPTY_CONDITIONS',
    warnings: [],
  };
}

// ---------------------------------------------------------------------------
// Fragment builders
// ---------------------------------------------------------------------------

/**
 * 建構 categorical fragment：
 *   - 一般欄位 → `"colName" IN (:...catN)`
 *   - 波 4 將補 caseyear wildcard 例外處理
 *
 * @returns fragment + params，或 null 表示此 condition 無效（skip）
 */
function buildCategoricalFragment(
  cond: { columnName: string; values?: string[] },
  paramIdx: number,
  warnings: Stage1ComposerWarning[],
): { fragment: string; params: Record<string, unknown> } | null {
  // columnName allowlist 防禦（波 5 強化測試）
  if (!SAFE_COLUMN_NAME_RE.test(cond.columnName)) {
    warnings.push({
      code: 'INVALID_COLUMN_NAME',
      columnName: cond.columnName,
      reason: `columnName violates ${SAFE_COLUMN_NAME_RE}`,
    });
    return null;
  }

  if (!Array.isArray(cond.values) || cond.values.length === 0) {
    warnings.push({
      code: 'EMPTY_VALUES',
      columnName: cond.columnName,
      reason: 'values missing or empty',
    });
    return null;
  }

  const paramName = `cat${paramIdx}`;
  return {
    fragment: `"${cond.columnName}" IN (:...${paramName})`,
    params: { [paramName]: cond.values },
  };
}
