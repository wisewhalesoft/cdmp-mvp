/**
 * 名單定義相關頁共用的「代碼 → 中文顯示名稱」對照。
 *
 * 抽出自 F051 v2.1 編輯頁 LEGACY entity column 對照（prototype 27b L835-841），
 * 供名單定義主頁（Kanban 條件 chip）、Detail Drawer 條件頁籤、編輯頁 LEGACY 唯讀摘要、
 * 從上月複製 modal 共用，避免各頁重複維護、也避免對使用者裸露欄位代碼。
 *
 * 注意：此為「欄位名稱」對照，非「可選值」對照。可選值的中文標籤（如 prod_kind 的
 * 02 → 機車）來自後端 pooldata-fields options（listOptions），非靜態表；名單主頁 /
 * Drawer 未載入 options，故該情境一律保留原始代碼，不臆測翻譯。
 */
export const FIELD_DISPLAY: Record<string, string> = {
  prod_kind: '產品類別',
  caseyear: '進件 / 滿期年數',
  spec_tp: '專案類別',
  case_status: '案件結清期別',
  settle_src: '他行代償',
  // best_case 為系統固定欄位，其顯示名稱沿用建立 / 編輯頁既有文案「優質案件」。
  best_case: '優質案件',
};

/** 取欄位中文顯示名稱；無對照時回傳原始欄位代碼（不臆測翻譯）。 */
export function fieldDisplayName(columnName: string): string {
  return FIELD_DISPLAY[columnName] ?? columnName;
}

/** 名單階段代碼 → 中文顯示名稱。 */
export const STAGE_LABEL: Record<string, string> = {
  draft: '草稿',
  dept_ratio: '部門比例',
  personnel_ratio: '個別業務比例',
  approval: '待簽核',
  ready: '準備完成',
};

/** 取階段中文顯示名稱；無對照時回傳原始代碼。 */
export function stageLabel(stage: string): string {
  return STAGE_LABEL[stage] ?? stage;
}

// ---------------------------------------------------------------------------
// F119 / US-183 / AD-E07-50 §3.6 — categorical 條件之比對運算子（前端側詞彙唯一來源）
// ---------------------------------------------------------------------------

/** BR-1：categorical 條件之四種合法比對運算子（命名不得更動；順序即下拉選項順序）。 */
export const CATEGORICAL_OPERATORS = ['in', 'contains', 'not_contains', 'equals'] as const;

export type CategoricalOperator = (typeof CATEGORICAL_OPERATORS)[number];

/** BR-10：運算子中文標籤（全系統統一，禁止各頁自訂）。 */
export const OPERATOR_LABEL: Record<CategoricalOperator, string> = {
  in: 'IN',
  contains: '包含',
  not_contains: '不包含',
  equals: '完全等於',
};

const TEXT_OPERATORS: ReadonlySet<string> = new Set([
  'contains',
  'not_contains',
  'equals',
]);

/**
 * BR-11 / I-CATOP-OPERATOR-FALLBACK-01：缺漏 `operator` 之預設值解讀「唯一」落點（前端側）。
 *
 * 前端為獨立 bundle、無法 import 後端模組，故與後端 `resolveCategoricalOperator()` 為
 * 各自 runtime 內的單一來源。其他任何地方**不得**再寫 `cond.operator ?? 'in'`——分散預設
 * 正是「顯式 in 與缺漏 in 行為分歧」（AC-17 風險點）之典型成因。
 */
export function resolveCategoricalOperator(op?: unknown): CategoricalOperator {
  return op === 'contains' || op === 'not_contains' || op === 'equals' ? op : 'in';
}

/** operator 是否為三種文字比對運算子之一（先經 resolveCategoricalOperator 正規化）。 */
export function isTextOperator(op?: unknown): boolean {
  return TEXT_OPERATORS.has(resolveCategoricalOperator(op));
}

/** 取運算子中文標籤；缺漏 / 非法值一律回「IN」（AC-17：顯式 in ≡ 缺漏 operator）。 */
export function operatorLabel(op?: unknown): string {
  return OPERATOR_LABEL[resolveCategoricalOperator(op)];
}

/** BR-2 / §13.1 D-3：關鍵字 trim 後之長度上限。 */
export const KEYWORD_MAX_LEN = 100;

/**
 * BR-2：trim 前後之半形空白 / 全形空格 U+3000 / Tab / CR / LF；
 * 關鍵字「內部」空白一律保留（「勁 便利」與「勁便利」為不同關鍵字）。
 */
export function trimKeyword(s?: unknown): string {
  return String(s === undefined || s === null ? '' : s).replace(/^[\s　]+|[\s　]+$/g, '');
}

/**
 * I-CATOP-CASEYEAR-EXCLUDE-01（AD-E07-50 §3.8）：`caseyear` 對應 `ob_pool_data.year_cnt`
 * （INTEGER），文字運算子於 PG 端直接型別錯誤，且 `'99'`（不限年數）wildcard 規則僅對
 * `IN` 有定義 → 排除文字比對運算子。
 */
export const TEXT_OPERATOR_EXCLUDED_COLUMNS: readonly string[] = ['caseyear'];

/** 該欄位是否不支援文字比對運算子。 */
export function isTextOperatorExcluded(columnName: string): boolean {
  return TEXT_OPERATOR_EXCLUDED_COLUMNS.includes(columnName);
}

/**
 * AC-12 / 附錄 C C-7：文字運算子之效能提示文案（告知性——不阻擋操作、不需確認、不影響儲存）。
 * ui-ux-designer 定案文案；勿在此常數外另寫第二份措辭。
 */
export const TEXT_OP_PERF_HINT =
  '文字比對需逐筆掃描全部案件，較勾選可選值耗時；命中預估與 Stage 0 試算可能因此逾時。此為正常現象，不影響條件儲存。';
