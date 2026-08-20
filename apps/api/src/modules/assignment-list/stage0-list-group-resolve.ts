// F120 / US-184 / AD-E07-51 §4.2：Stage 0「名單基礎預估數量總覽」之分組判定純函式
//
// 權威演算法＝F120 spec §5.2 `GROUP-RESOLVE`（6 步驟，逐步對應下方註解）。
//
// 三個 HOW 層級不變式（AD-E07-51 §8）：
//   - I-LISTOVW-PURE-GROUP-RESOLVE-01：純函式——不注入 repository、不接受 request context、
//     不查白名單、不看估算結果；輸出僅由輸入 payload 決定（AC-LIST-06b 決定性）。
//   - I-LISTOVW-OPERATOR-SINGLE-SOURCE-01：運算子預設值（缺漏 ≡ `in`）之解讀一律經既有唯一
//     落點 `resolveCategoricalOperator()`；本檔**不得**自行撰寫等義 fallback（F119 BR-11）。
//   - I-F120-04 / BR-1：分組判定之唯一權威來源為 `condition_payload`；**禁止**讀取
//     ob_list_definition 之 backward-compat 衍生欄位（文字運算子與「完全未設定」在該欄位
//     上同為空字串，無法區分——理由見 F120 spec §5.4）。

import { resolveCategoricalOperator } from '@/modules/assignment/stage1/stage1-query-composer';
import type {
  ObListDefinitionConditionItem,
  ObListDefinitionConditionPayload,
} from '@/database/entities/ob-list-definition.entity';

/**
 * 分組判定結果（結構化判別；下游**不得**以 groupKey 字串比對取代 `groupType`）。
 *   - `code`         ：歸入該產品類別代碼之分組（代碼是否登錄於白名單不影響判定）
 *   - `multi`        ：可選值去重後 ≥ 2 個代碼 →「多重產品類別」合成分組
 *   - `unclassified` ：未設定 / 無可選值 / 文字運算子 / 防禦性例外 →「未分類」合成分組
 */
export type ListGroupResolution =
  | { groupType: 'code'; optionValue: string }
  | { groupType: 'multi' }
  | { groupType: 'unclassified' };

/** 產品類別條件之欄位代碼（僅作字串比對，非 entity 屬性存取）。 */
const PRODUCT_KIND_COLUMN = 'prod_kind';

/**
 * F120 spec §5.2 `GROUP-RESOLVE`：由單一名單之 `condition_payload` 判定其所屬分組。
 *
 * 本函式為**全函式**（total function）：任何輸入皆回傳且僅回傳一個分組，
 * 故 `I-F120-01`（互斥且完備）**依建構成立**，非靠測試維持（BR-2）。
 */
export function resolveListGroup(
  payload: ObListDefinitionConditionPayload | null | undefined,
): ListGroupResolution {
  // 步驟 1：payload 為空 / conditions 非陣列 / 長度 0
  if (
    !payload ||
    !Array.isArray(payload.conditions) ||
    payload.conditions.length === 0
  ) {
    return { groupType: 'unclassified' };
  }

  // 步驟 2：取產品類別條件項
  const items = payload.conditions.filter(
    (c): c is ObListDefinitionConditionItem =>
      !!c && c.columnName === PRODUCT_KIND_COLUMN,
  );
  // 步驟 2a：不存在 → 未分類
  if (items.length === 0) return { groupType: 'unclassified' };
  // 步驟 2b：多筆時取最後一筆（last-wins 防禦；鏡射既有 backward-compat 衍生邏輯之處置）
  const cond = items[items.length - 1];

  // 步驟 3：防禦——產品類別為 categorical 欄位，型別誤植時不臆測
  if (cond.fieldType !== 'categorical') return { groupType: 'unclassified' };

  // 步驟 4：運算子解讀之唯一落點（缺漏 ≡ `in`）
  const operator = resolveCategoricalOperator(cond.operator);

  // 步驟 5：三種文字比對運算子（包含 / 不包含 / 完全等於）→ 不查資料即無法歸屬固定代碼
  if (operator !== 'in') return { groupType: 'unclassified' };

  // 步驟 6a：values 非陣列（防禦）
  if (!Array.isArray(cond.values)) return { groupType: 'unclassified' };

  // 步驟 6b：去重（保持首次出現順序；精確字串相等，不做大小寫 / 全半形折疊，F119 BR-8）
  const codes: string[] = [];
  for (const v of cond.values) {
    if (!codes.includes(v)) codes.push(v);
  }

  // 步驟 6c：空可選值清單
  if (codes.length === 0) return { groupType: 'unclassified' };
  // 步驟 6d：單一代碼
  if (codes.length === 1) return { groupType: 'code', optionValue: codes[0] };
  // 步驟 6e：兩個以上代碼 → 多重產品類別（不得同時計入個別分組）
  return { groupType: 'multi' };
}
