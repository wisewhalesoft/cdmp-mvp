/**
 * 特例 DELETE 規則 — 單一來源 trigger pure utility（F091 v2.0 + F095 共用）
 *
 * 依 SP `SP_INFOT_ASSIGNEXPORTNAMELIST_st1_list`（Node.js UTF-16LE 解碼後 ground truth）定義
 * 月跑 Stage 1 之特例排除規則觸發條件。**月跑實際套用（F091 `applyListNmSpecialDeletes`）與
 * 前端唯讀呈現（F095 `deriveAppliedSpecialRules`）必須共用本檔之 trigger 判斷**，避免 UI / run drift
 * （AD-E07-26 §26.5 注意段 / F091 AC-7 / F095 AC-3）。
 *
 * ⚠️ v2.0 SP bug fix（AD-E07-26 §26.2，high-severity）：
 *   v1.0 之觸發關鍵字（中結 / 強案 / 年資 / 滿）為 mojibake 誤判，與 SP 完全不符。
 *   v2.0 修正為 SP 正確版：期中機車 / 期中 / 年以上 / 小資 / 白牌。
 *   **禁止沿用 v1.0 誤判關鍵字作為 trigger 或排除條件**（F091 BR-8 / F091-test RGv2 grep guard 會驗）。
 *
 * SP 對照（已解碼）：
 *   L66~L68 詐騙白牌（無條件）   list_type='01' AND spec_name LIKE '%白牌%'
 *   L89~L94 機車期中滿期前3個月  LIST_NM LIKE '%期中%機車%'
 *   L97~L100 期中小資最後七期    LIST_NM LIKE '%期中%' + SPEC_NAME LIKE '%小資%'
 *   L105~L108 年以上車齡超15年   LIST_NM LIKE '%年以上%'
 */

/** 特例規則代號（AD-E07-26 §26.4 / F091 §5.3 / F095 §5.1） */
export type SpecialRuleId =
  | 'R-FRAUD-WHITEBOARD'
  | 'R-PERIOD-MOTORCYCLE'
  | 'R-PERIOD-XIAOZI'
  | 'R-YEAR-ABOVE';

/**
 * 套用於某名單之特例排除規則（F095 唯讀呈現契約，AD-E07-26 §26.5）。
 */
export interface AppliedSpecialRule {
  /** 規則代號 */
  ruleId: SpecialRuleId;
  /** 規則中文名稱，供前端直接顯示 */
  ruleName: string;
  /** 是否為全名單強制套用（true → 前端顯示為灰色不可關閉的系統規則） */
  isSystemMandatory: boolean;
  /** 人類可讀排除說明（描述「排除什麼樣的案件」） */
  exclusionDescription: string;
}

/**
 * 依 `list_nm` 判斷某條 list_nm-based 特例規則是否觸發（單一 trigger pure utility）。
 *
 * `R-FRAUD-WHITEBOARD` 為無條件規則（不依賴 list_nm），對其呼叫一律回 true。
 *
 * @param listNm 名單名稱（null / '' 視為不含任何關鍵字）
 * @param ruleId 規則代號
 */
export function matchesSpecialRule(
  listNm: string | null | undefined,
  ruleId: SpecialRuleId,
): boolean {
  const nm = listNm ?? '';
  switch (ruleId) {
    case 'R-FRAUD-WHITEBOARD':
      // 無條件（所有名單）— SP L66~L68，不讀 list_nm
      return true;
    case 'R-PERIOD-MOTORCYCLE':
      // SP L89：LIST_NM LIKE '%期中%機車%'（同時含「期中」與「機車」）
      return nm.includes('期中') && nm.includes('機車');
    case 'R-PERIOD-XIAOZI':
      // SP L97：LIST_NM LIKE '%期中%'
      return nm.includes('期中');
    case 'R-YEAR-ABOVE':
      // SP L105：LIST_NM LIKE '%年以上%'
      return nm.includes('年以上');
    default:
      return false;
  }
}

/** 規則 metadata（ruleName / isSystemMandatory / exclusionDescription），供 derive 組裝。 */
const RULE_META: Record<
  SpecialRuleId,
  Omit<AppliedSpecialRule, 'ruleId'>
> = {
  'R-FRAUD-WHITEBOARD': {
    ruleName: '詐騙白牌排除',
    isSystemMandatory: true,
    exclusionDescription:
      '排除名單類別為期中（list_type=01）且規格名稱含「白牌」之案件',
  },
  'R-PERIOD-MOTORCYCLE': {
    ruleName: '機車期中滿期前3個月排除',
    isSystemMandatory: false,
    exclusionDescription:
      '排除已繳期數接近總期數減3（接近滿期）或申請號以 T／Y 開頭之案件',
  },
  'R-PERIOD-XIAOZI': {
    ruleName: '期中小資最後七期排除',
    isSystemMandatory: false,
    exclusionDescription:
      '排除已繳期數超過總期數減8（最後七期）且規格名稱含「小資」之案件',
  },
  'R-YEAR-ABOVE': {
    ruleName: '年以上車齡超15年排除',
    isSystemMandatory: false,
    exclusionDescription: '排除出廠年份距今超過15年之案件',
  },
};

/**
 * 依 `list_nm` 讀時推導本名單套用之特例排除規則清單（F095 AC-1 / AC-2，read-time derivation）。
 *
 * 推導順序對齊 SP（AD-E07-26 §26.5 偽碼）：fraud → motorcycle → xiaozi → year-above。
 * **與 F091 月跑 `applyListNmSpecialDeletes` 共用同一 `matchesSpecialRule` 判斷**（保證一致）。
 * 純函式：相同輸入永遠相同輸出，無 DB / async 依賴（DP-AD26-3 不新建 DB 欄位）。
 *
 * `R-FRAUD-WHITEBOARD` 無條件恆存（F095 AC-5 / BR-4），故回傳陣列永不為空。
 *
 * @param listNm 名單名稱
 * @returns 套用之特例規則清單（至少含 R-FRAUD-WHITEBOARD）
 */
export function deriveAppliedSpecialRules(
  listNm: string | null | undefined,
): AppliedSpecialRule[] {
  // 依 SP 順序逐條判斷（與 applyListNmSpecialDeletes 之執行順序一致）
  const ORDER: SpecialRuleId[] = [
    'R-FRAUD-WHITEBOARD',
    'R-PERIOD-MOTORCYCLE',
    'R-PERIOD-XIAOZI',
    'R-YEAR-ABOVE',
  ];
  const rules: AppliedSpecialRule[] = [];
  for (const ruleId of ORDER) {
    if (matchesSpecialRule(listNm, ruleId)) {
      rules.push({ ruleId, ...RULE_META[ruleId] });
    }
  }
  return rules;
}
