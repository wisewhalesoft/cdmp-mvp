/**
 * F119 / US-183 / AD-E07-50 §3.6 — 篩選條件描述字串之**唯一**格式化來源
 * （BR-10 / I-CATOP-DISPLAY-SINGLE-01）。
 *
 * 消費端（現階段兩處，禁止各自組字串）：
 *   - `_components/ListDetailDrawer.tsx`（名單詳情 Drawer 條件頁籤）
 *   - `list-definition-page.tsx`（Kanban 卡片條件 chip）
 *
 * 格式（AC-15，逐字對齊 `prototypes/27a-list-create-draft.html` 之 `formatConditionSummary()`；
 * 三份原型逐字相同）：
 *   - 文字運算子 → `{欄位} {運算子標籤}「{關鍵字}」`，例：`主約專案名稱 包含「勁便利」`
 *     （欄位名不加引號、以**半形空格**分隔、關鍵字用直角引號）
 *   - `in` / 缺漏 operator → `{欄位}：{值1}、{值2}`（全形冒號 + 頓號）
 *   - 空 values → `{欄位}：（未選擇任何值）`（AC-15：不得顯示為空白 / `IN []` / 僅欄位名）
 *
 * ⚠️ 本函式同時接管 `in` 與三種文字運算子（使用者裁定，AD §3.6 / 設計總覽附錄 C C-16 / C-Q2）：
 * `in` 分支若回退為各頁既有格式，BR-10「單一格式化來源」即名存實亡——既有 `IN []` 缺陷
 * 正源於各頁自拼字串。Kanban chip 因此由 `欄位:值1/值2+N` 改為 `欄位：值1、值2`（純外觀變更，
 * 不影響篩選結果）。
 */

import type { ConditionItem } from '@/api/assignment-list';
import type { ConditionDecoder } from '../_hooks/use-condition-decoder';
import { isTextOperator, operatorLabel, resolveCategoricalOperator, trimKeyword } from './labels';

/**
 * 本函式所需之最小解碼介面（對齊 prototype `CONDITION_DECODER`）。
 * 以 `toSummaryDecoder()` 由 `useConditionDecoder()` 之 `ConditionDecoder` 轉接。
 */
export interface ConditionSummaryDecoder {
  /** 欄位代碼 → 中文顯示名稱（查無回傳原始代碼）。 */
  fieldDisplayName: (columnName: string) => string;
  /** (欄位, 值代碼) → 中文值標籤（查無回傳原始值）。 */
  valueLabel: (columnName: string, value: string) => string;
}

/** 將頁面既有之 `ConditionDecoder` 轉接為本模組所需之最小介面。 */
export function toSummaryDecoder(decoder: ConditionDecoder): ConditionSummaryDecoder {
  return {
    fieldDisplayName: (columnName) => decoder.decodeField(columnName),
    valueLabel: (columnName, value) => decoder.decodeValue(columnName, value),
  };
}

/**
 * 產生單一條件之描述字串（BR-10：含運算子中文標籤，全站唯一格式化落點）。
 */
export function formatConditionSummary(
  cond: ConditionItem,
  decoder: ConditionSummaryDecoder,
): string {
  const name = decoder.fieldDisplayName(cond.columnName);

  if (cond.fieldType === 'categorical') {
    // BR-11：operator 之解讀一律經唯一 fallback 落點（`_utils/labels.ts`）
    const op = resolveCategoricalOperator(cond.operator);
    if (isTextOperator(op)) {
      return `${name} ${operatorLabel(op)}「${trimKeyword(cond.keyword)}」`;
    }
    const vals = (cond.values ?? []).map((v) => decoder.valueLabel(cond.columnName, v));
    // AC-15：不得顯示為空白 / `IN []` / 僅欄位名
    return vals.length === 0 ? `${name}：（未選擇任何值）` : `${name}：${vals.join('、')}`;
  }

  if (cond.fieldType === 'numeric') return `${name}：${cond.min} ~ ${cond.max}`;
  if (cond.fieldType === 'date') return `${name}：${cond.dateStart} ~ ${cond.dateEnd}`;
  return name;
}
