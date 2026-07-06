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
