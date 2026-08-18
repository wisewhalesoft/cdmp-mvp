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
export const SAFE_COLUMN_NAME_RE = /^[a-z][a-z0-9_]{0,63}$/;

/**
 * F109 / US-172 / AD-E07-37 §OQ-F109-01：customer_core 來源 8 個篩選欄名靜態集合。
 *
 * 用於 `resolveConditionDataSource` 之防禦性 fallback（涵蓋 F109 上線前無 `dataSource`
 * 固化值之既有 condition_payload）。**不可**增減或改名（feedback_tdd_naming_drift）；
 * 與 spec §5.2 8 欄逐字對齊（STATIC-001 / DATASRC-004 守門）。
 */
export const CUSTOMER_CORE_COLUMN_NAMES: ReadonlySet<string> = new Set([
  'gender',
  'date_of_birth',
  'occupation_desc',
  'education_desc',
  'marital_status_desc',
  'customer_type_desc',
  'monthly_income_desc',
  'cpost_city',
]);

/**
 * F114：customer_financial 來源 10 個篩選欄名靜態集合（resolveConditionDataSource fallback）。
 *
 * 與 CUSTOMER_CORE_COLUMN_NAMES 同機制：固化值缺漏時的防禦性 fallback。F114 上線後
 * 之 condition 皆由 stampConditionDataSource 蓋章 'customer_financial'，故 fallback 多為
 * defense-in-depth。**不可**與 CUSTOMER_CORE_COLUMN_NAMES 交集（兩來源欄名互斥）。
 */
export const CUSTOMER_FINANCIAL_COLUMN_NAMES: ReadonlySet<string> = new Set([
  'has_guarantor',
  'guarantor_count',
  'phone_coll_case_cnt',
  'legal_coll_case_cnt',
  'midterm_case_cnt',
  'matured_case_cnt',
  'settled_case_cnt',
  'void_case_cnt',
]);

/**
 * 決定性解析單一 condition 之資料來源（AD-E07-37 §OQ-F109-01 雙層機制，I-CC-DATASOURCE-01）：
 *   1. 固化值優先：`cond.dataSource` 為合法值（'customer_core' / 'ob_pool_data'）→ 直接採用。
 *   2. 靜態 Set fallback：缺漏時比對 CUSTOMER_CORE_COLUMN_NAMES；命中 → 'customer_core'，否則 'ob_pool_data'。
 *
 * 純函式，**永不** runtime 查詢 pooldata_field_whitelist（沿用 F075 BR-4；白名單欄位事後停用後
 * 仍決定性）。
 */
export function resolveConditionDataSource(cond: {
  columnName: string;
  dataSource?: 'ob_pool_data' | 'customer_core' | 'customer_financial';
}): 'ob_pool_data' | 'customer_core' | 'customer_financial' {
  if (
    cond.dataSource === 'customer_core' ||
    cond.dataSource === 'ob_pool_data' ||
    cond.dataSource === 'customer_financial'
  ) {
    return cond.dataSource;
  }
  if (CUSTOMER_CORE_COLUMN_NAMES.has(cond.columnName)) return 'customer_core';
  if (CUSTOMER_FINANCIAL_COLUMN_NAMES.has(cond.columnName)) return 'customer_financial';
  return 'ob_pool_data';
}

/**
 * §18.5.1：caseyear 「不限年數」wildcard 代碼。
 */
const CASEYEAR_WILDCARD = '99';

// ---------------------------------------------------------------------------
// F119 / US-183 / AD-E07-50 §3.2 / §3.3 — categorical 文字比對運算子
// ---------------------------------------------------------------------------

/** BR-1：categorical 條件之四種合法比對運算子（命名不得更動）。 */
export type CategoricalOperator = 'in' | 'contains' | 'not_contains' | 'equals';

/** 三種文字比對運算子（相對於既有 `in` 核取清單語意）。 */
const TEXT_OPERATORS: ReadonlySet<CategoricalOperator> = new Set<CategoricalOperator>([
  'contains',
  'not_contains',
  'equals',
]);

/**
 * BR-11 / I-CATOP-OPERATOR-FALLBACK-01：缺漏 `operator` 之預設值解讀「唯一」落點。
 *
 * 任何消費端（SQL 建構 / 簽章 / 驗證）皆須透過本函式取得 operator；禁止各自寫
 * `cond.operator ?? 'in'`——分散預設正是「顯式 in 與缺漏 in 行為分歧」（AC-17 風險點）之成因。
 * 非四值集合內之任何輸入（含 undefined / null / '' / 非法字串）一律視為缺漏 → `'in'`。
 */
export function resolveCategoricalOperator(raw: unknown): CategoricalOperator {
  return raw === 'contains' || raw === 'not_contains' || raw === 'equals' ? raw : 'in';
}

/** operator 是否為三種文字比對運算子之一（先經 resolveCategoricalOperator 正規化）。 */
export function isTextCategoricalOperator(raw: unknown): boolean {
  return TEXT_OPERATORS.has(resolveCategoricalOperator(raw));
}

/** LIKE 樣式跳脫字元（SQL 文字中以固定字面 `ESCAPE '\'` 宣告）。 */
const LIKE_ESCAPE_CHAR = '\\';

/**
 * BR-7 / I-CATOP-ESCAPE-SINGLE-01：LIKE 樣式跳脫之**唯一**實作。
 *
 * 跳脫字元集固定為 `\` `%` `_` `[` `]` `^`（跳脫字元本身排在最前處理，避免雙重跳脫），
 * **不依 dialect 增減**：`[` / `]` / `^` 之字元類語意僅 MSSQL 有，但 ANSI `ESCAPE` 之語意為
 * 「跳脫字元 + 下一字元 = 該字元之字面值」，與該字元原本是否特殊無關——對 PG 而言跳脫一個
 * 本來就不特殊的字元是安全的 no-op，兩方言因此產生逐字元相同之比對結果（AD-E07-50 §3.2）。
 */
export function escapeLikeKeyword(raw: string): string {
  return raw.replace(/[\\%_[\]^]/g, (ch) => `${LIKE_ESCAPE_CHAR}${ch}`);
}

/** buildCategoricalOperatorFragment 之輸入（AD-E07-50 §3.3）。 */
export interface CategoricalOperatorFragmentInput {
  /**
   * 完整欄位引用表達式：composer 傳入引號欄名（如 "prod_kind"）；客戶來源建構器傳入其
   * alias 前綴欄位或衍生後運算式（見 stage1-customer-core-clause.ts /
   * stage1-customer-financial-clause.ts，本檔不得出現該類 SQL 片段——I-CC-COMPOSER-SCOPE-01）。
   */
  colExpr: string;
  operator: CategoricalOperator;
  values?: string[];
  /** 已由呼叫端（validateConditionPayload 等）保證：文字運算子時非空、trim 後 1~100 字元。 */
  keyword?: string;
  paramName: string;
  /** BR-6 八格矩陣中唯一顯式格：僅 ob_pool_data 來源之 not_contains 為 true。 */
  nullKeptOnNotContains: boolean;
}

/**
 * BR-4 / BR-5 / I-CATOP-SINGLE-FRAGMENT-01：四運算子之 SQL 產生**唯一**落點。
 *
 * composer（`ob_pool_data`）、`buildCustomerCoreClause`（PG + MSSQL 兩檔）、
 * `buildCustomerFinancialClause` 四個呼叫端皆呼叫本函式，禁止各自實作關鍵字比對或 NULL 判斷。
 *
 * BR-6 NULL 八格矩陣：八格中僅「`ob_pool_data` × `not_contains`」（`nullKeptOnNotContains=true`）
 * 顯式保留 NULL；其餘七格依賴 SQL 三值邏輯天然排除，不得新增任何 `IS NULL` / `COALESCE` 特判
 * ——`nullKeptOnNotContains=false` 分支即為那七格之單一共用程式碼路徑。
 *
 * @returns fragment + params；`in` 且 values 為空時回傳 null（既有邊界不變）
 */
export function buildCategoricalOperatorFragment(
  input: CategoricalOperatorFragmentInput,
): { fragment: string; params: Record<string, unknown> } | null {
  const { colExpr, operator, values, keyword, paramName, nullKeptOnNotContains } = input;

  if (operator === 'in') {
    if (!Array.isArray(values) || values.length === 0) return null;
    return { fragment: `${colExpr} IN (:...${paramName})`, params: { [paramName]: values } };
  }

  if (operator === 'equals') {
    // BR-7：`=` 天然無萬用字元語意，關鍵字原樣綁定，不經跳脫機制。
    return { fragment: `${colExpr} = :${paramName}`, params: { [paramName]: keyword } };
  }

  const likeParam = `%${escapeLikeKeyword(keyword ?? '')}%`;
  if (operator === 'contains') {
    return {
      fragment: `${colExpr} LIKE :${paramName} ESCAPE '\\'`,
      params: { [paramName]: likeParam },
    };
  }

  // not_contains（BR-6 唯一顯式格：ob_pool_data 保留 NULL；客戶來源沿用既有天然排除）
  const notLike = `${colExpr} NOT LIKE :${paramName} ESCAPE '\\'`;
  return {
    fragment: nullKeptOnNotContains ? `(${colExpr} IS NULL OR ${notLike})` : notLike,
    params: { [paramName]: likeParam },
  };
}

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

/**
 * §18.5 路徑 A categorical condition columnName → ob_pool_data 欄位映射。
 *
 * 與 PATH_B_MAPPING 共用語意（F049 v1.2 AC-4「欄位映射 路徑 A 與路徑 B 共用」）：
 *   - `case_status` → `list_type`（ob_pool_data 無 case_status 欄位；架構 §18.5 流程圖 D 節點 +
 *     L4169 映射表）
 *   - `caseyear` → `year_cnt`（整數比對，於 buildCategoricalFragment 另以 wildcard 規則處理，
 *     不經本表）
 *   - 其餘欄位同名映射至 ob_pool_data 對應欄位（不在表中者直接沿用 columnName）
 */
const PATH_A_COLUMN_MAPPING: Readonly<Record<string, string>> = {
  case_status: 'list_type',
};

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
    // F109 / F114 / I-CC-COMPOSER-SCOPE-01 / I-CF-COMPOSER-SCOPE-01：非 ob_pool_data 來源條件
    //   （customer_core → buildCustomerCoreClause；customer_financial → buildCustomerFinancialClause）
    //   一律委派對應 clause 建構器，composer 僅負責 ob_pool_data 側。靜默 continue（不建 fragment、
    //   不發 warning）；避免對 ob_pool_data（無 gender / has_guarantor 等欄）建出 SQL 出錯的偽 fragment。
    if (resolveConditionDataSource(cond) !== 'ob_pool_data') continue;

    if (cond.fieldType === 'categorical') {
      const built = buildCategoricalFragment(cond, paramIdx, warnings);
      if (built) {
        fragments.push(built.fragment);
        Object.assign(params, built.params);
        paramIdx += 1;
      }
      continue;
    }

    if (cond.fieldType === 'numeric') {
      const built = buildNumericFragment(cond, paramIdx, warnings);
      if (built) {
        fragments.push(built.fragment);
        Object.assign(params, built.params);
        paramIdx += 1;
      }
      continue;
    }

    if (cond.fieldType === 'date') {
      const built = buildDateFragment(cond, paramIdx, warnings);
      if (built) {
        fragments.push(built.fragment);
        Object.assign(params, built.params);
        paramIdx += 1;
      }
      continue;
    }

    // 未知 fieldType（理論上 validateConditionPayload 應已攔截）
    warnings.push({
      code: 'UNKNOWN_FIELD_TYPE',
      columnName: cond.columnName,
      reason: `fieldType=${(cond as { fieldType?: string }).fieldType} not supported`,
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
// Path B 實作（§18.5 路徑 B + §18.6 衍生規則表）
// ---------------------------------------------------------------------------

/**
 * 路徑 B fallback（舊名單，condition_payload IS NULL）：
 *
 * 讀 5 個 entity column，依 §18.5 路徑 B mapping 表轉為 ob_pool_data 欄位 IN fragment：
 *   - prod_kind   → ob_pool_data.prod_kind
 *   - caseyear    → ob_pool_data.year_cnt（整數）
 *   - spec_tp     → ob_pool_data.spec_tp
 *   - case_status → ob_pool_data.list_type（注意：ob_pool_data 無 case_status 欄位）
 *   - settle_src  → ob_pool_data.settle_src
 *
 * 空值處置（§18.5 路徑 B 表）：空字串 / null → skip 該欄位（不加 fragment）。
 *
 * §18.5.1 注意：path B caseyear 含 '99' 時，wildcard 規則由波 4 補；本波先實作標準路徑。
 */
function buildPathB(list: ObListDefinition): Stage1QueryFragment {
  const fragments: string[] = [];
  const params: Record<string, unknown> = {};
  const warnings: Stage1ComposerWarning[] = [];
  let paramIdx = 0;

  for (const mapping of PATH_B_MAPPING) {
    const raw = list[mapping.entityCol];
    if (raw === null || raw === undefined || raw === '') continue;

    const values = String(raw)
      .split('$$')
      .map((v) => v.trim())
      .filter((v) => v.length > 0);

    if (values.length === 0) continue;

    if (mapping.numericInt) {
      // §18.5.1 注意段：path B caseyear 含 '99' 同樣 skip year_cnt 比對
      if (mapping.entityCol === 'caseyear' && values.includes(CASEYEAR_WILDCARD)) {
        continue;
      }

      const intValues = values
        .map((v) => parseInt(v, 10))
        .filter((n) => Number.isFinite(n));
      if (intValues.length === 0) continue;

      const paramName = `pbNum${paramIdx}`;
      fragments.push(`"${mapping.poolDataCol}" IN (:...${paramName})`);
      params[paramName] = intValues;
      paramIdx += 1;
      continue;
    }

    const paramName = `pbCat${paramIdx}`;
    fragments.push(`"${mapping.poolDataCol}" IN (:...${paramName})`);
    params[paramName] = values;
    paramIdx += 1;
  }

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
// Fragment builders
// ---------------------------------------------------------------------------

/**
 * 建構 categorical fragment：
 *   - 一般欄位 `in` → `"colName" IN (:...catN)`
 *   - 一般欄位文字運算子（F119）→ `"colName" LIKE/NOT LIKE/=`（經 buildCategoricalOperatorFragment）
 *   - caseyear wildcard 例外處理（僅服務 `in`，見 AD-E07-50 §3.8）
 *
 * @returns fragment + params，或 null 表示此 condition 無效（skip）
 */
function buildCategoricalFragment(
  cond: { columnName: string; values?: string[]; operator?: unknown; keyword?: unknown },
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

  // F119 / BR-11：operator 之解讀一律經唯一 fallback 落點
  const operator = resolveCategoricalOperator(cond.operator);

  // F119 / AD-E07-50 §3.8 / I-CATOP-CASEYEAR-EXCLUDE-01：caseyear 對應 year_cnt（INTEGER），
  //   文字運算子於 PG 端直接型別錯誤且 '99' wildcard 規則僅對 IN 有定義 → 排除。
  //   主要防線在驗證層（validateConditionPayload / validateConditionsForPreview）；
  //   此處為 defense-in-depth：不嘗試建構 SQL，改為 skip + warning。
  if (cond.columnName === 'caseyear' && operator !== 'in') {
    warnings.push({
      code: 'EMPTY_VALUES',
      columnName: cond.columnName,
      reason: 'caseyear does not support text match operators (maps to integer year_cnt)',
    });
    return null;
  }

  // F119：文字比對運算子（contains / not_contains / equals）—— 經唯一 SQL 落點建構
  if (operator !== 'in') {
    const keyword = typeof cond.keyword === 'string' ? cond.keyword.trim() : '';
    if (keyword.length === 0) {
      warnings.push({
        code: 'EMPTY_VALUES',
        columnName: cond.columnName,
        reason: 'keyword missing or empty for text match operator',
      });
      return null;
    }
    const textCol = PATH_A_COLUMN_MAPPING[cond.columnName] ?? cond.columnName;
    // BR-6：ob_pool_data 為八格矩陣中唯一顯式保留 NULL 之來源（not_contains）
    return buildCategoricalOperatorFragment({
      colExpr: `"${textCol}"`,
      operator,
      keyword,
      paramName: `cat${paramIdx}`,
      nullKeptOnNotContains: true,
    });
  }

  // ── 以下為既有 `in` 路徑（AC-17：行為逐字不變）────────────────────────────
  if (!Array.isArray(cond.values) || cond.values.length === 0) {
    warnings.push({
      code: 'EMPTY_VALUES',
      columnName: cond.columnName,
      reason: 'values missing or empty',
    });
    return null;
  }

  // §18.5.1：caseyear wildcard 規則 — 含 '99' 即完全 skip year_cnt fragment
  if (cond.columnName === 'caseyear') {
    if (cond.values.includes(CASEYEAR_WILDCARD)) {
      // 不加任何 fragment，但也不發 warning（業務有效行為）
      return null;
    }
    // 非 wildcard：caseyear 對應 ob_pool_data.year_cnt 整數比對
    const intValues = cond.values
      .map((v) => parseInt(String(v), 10))
      .filter((n) => Number.isFinite(n));
    if (intValues.length === 0) {
      warnings.push({
        code: 'EMPTY_VALUES',
        columnName: cond.columnName,
        reason: 'no valid integer values for caseyear',
      });
      return null;
    }
    const paramName = `caseyear${paramIdx}`;
    return {
      fragment: `"year_cnt" IN (:...${paramName})`,
      params: { [paramName]: intValues },
    };
  }

  // §18.5 路徑 A / B 共用映射（F049 v1.2 AC-4 欄位映射表）：
  //   case_status → ob_pool_data.list_type（ob_pool_data 無 case_status 欄位）。
  //   與路徑 B PATH_B_MAPPING 一致，確保 estimate 與月名單分派 Stage 1 逐欄位相同。
  const poolDataCol = PATH_A_COLUMN_MAPPING[cond.columnName] ?? cond.columnName;

  // I-CATOP-SINGLE-FRAGMENT-01：`in` 亦經唯一 SQL 落點（輸出與 F119 上線前逐字元相同）
  return buildCategoricalOperatorFragment({
    colExpr: `"${poolDataCol}"`,
    operator: 'in',
    values: cond.values,
    paramName: `cat${paramIdx}`,
    nullKeptOnNotContains: true,
  });
}

/**
 * 建構 numeric fragment：
 *   - `"colName" BETWEEN :minN AND :maxN`
 *   - 缺 min 或 max → skip + warn
 */
function buildNumericFragment(
  cond: { columnName: string; min?: number; max?: number },
  paramIdx: number,
  warnings: Stage1ComposerWarning[],
): { fragment: string; params: Record<string, unknown> } | null {
  if (!SAFE_COLUMN_NAME_RE.test(cond.columnName)) {
    warnings.push({
      code: 'INVALID_COLUMN_NAME',
      columnName: cond.columnName,
      reason: `columnName violates ${SAFE_COLUMN_NAME_RE}`,
    });
    return null;
  }

  if (cond.min === undefined || cond.min === null || cond.max === undefined || cond.max === null) {
    warnings.push({
      code: 'INCOMPLETE_NUMERIC_RANGE',
      columnName: cond.columnName,
      reason: 'min or max missing',
    });
    return null;
  }

  const minParam = `numMin${paramIdx}`;
  const maxParam = `numMax${paramIdx}`;
  return {
    fragment: `"${cond.columnName}" BETWEEN :${minParam} AND :${maxParam}`,
    params: { [minParam]: cond.min, [maxParam]: cond.max },
  };
}

/**
 * 建構 date fragment：
 *   - `"colName" BETWEEN :dateStartN AND :dateEndN`
 *   - 缺 dateStart 或 dateEnd → skip + warn
 *   - 日期值保留 ISO 字串（'YYYY-MM-DD'），PG / SQLite 均相容
 */
function buildDateFragment(
  cond: { columnName: string; dateStart?: string; dateEnd?: string },
  paramIdx: number,
  warnings: Stage1ComposerWarning[],
): { fragment: string; params: Record<string, unknown> } | null {
  if (!SAFE_COLUMN_NAME_RE.test(cond.columnName)) {
    warnings.push({
      code: 'INVALID_COLUMN_NAME',
      columnName: cond.columnName,
      reason: `columnName violates ${SAFE_COLUMN_NAME_RE}`,
    });
    return null;
  }

  if (!cond.dateStart || !cond.dateEnd) {
    warnings.push({
      code: 'INCOMPLETE_DATE_RANGE',
      columnName: cond.columnName,
      reason: 'dateStart or dateEnd missing',
    });
    return null;
  }

  const startParam = `dateStart${paramIdx}`;
  const endParam = `dateEnd${paramIdx}`;
  return {
    fragment: `"${cond.columnName}" BETWEEN :${startParam} AND :${endParam}`,
    params: { [startParam]: cond.dateStart, [endParam]: cond.dateEnd },
  };
}
