/**
 * F119 / US-183 / AD-E07-50 §3.6 — `_utils/labels.ts` 之 OPERATOR_LABEL / operatorLabel() 擴充。
 *
 * 撰寫依據：F119 spec BR-10 / BR-11 + AD-E07-50 §3.6（「新增 `OPERATOR_LABEL` 對照表 +
 * `operatorLabel(operator)` 函式...內部即前端側之 resolveCategoricalOperator」）+
 * `docs/ui-ux-design-overview.md` 附錄 C（C-2：選項文字逐字採 BR-10 標籤）+
 * `prototypes/27a-list-create-draft.html`（OPERATOR_LABEL 常數字面值，L942）。
 * **未**開啟生產碼 `_utils/labels.ts` 本體（該檔今日已存在、供 FIELD_DISPLAY 使用，本檔僅
 * 測試 F119 新增之 operator 相關匯出，不對既有 FIELD_DISPLAY 相關匯出做任何斷言）。
 */

import { describe, it, expect } from 'vitest';
import { OPERATOR_LABEL, operatorLabel } from '../labels';

describe('F119 OPERATOR_LABEL — BR-10 運算子中文標籤（全系統統一）', () => {
  it('LABEL-001：四個運算子皆有對應中文標籤，逐字採 BR-10', () => {
    expect(OPERATOR_LABEL.in).toBe('IN');
    expect(OPERATOR_LABEL.contains).toBe('包含');
    expect(OPERATOR_LABEL.not_contains).toBe('不包含');
    expect(OPERATOR_LABEL.equals).toBe('完全等於');
  });
});

describe('F119 operatorLabel() — 單一標籤來源函式（BR-10 / I-CATOP-DISPLAY-SINGLE-01）', () => {
  it('LABEL-002：operatorLabel("contains") === "包含"', () => {
    expect(operatorLabel('contains')).toBe('包含');
  });

  it('LABEL-003：operatorLabel("not_contains") === "不包含"', () => {
    expect(operatorLabel('not_contains')).toBe('不包含');
  });

  it('LABEL-004：operatorLabel("equals") === "完全等於"', () => {
    expect(operatorLabel('equals')).toBe('完全等於');
  });

  it('LABEL-005（★核心 / BR-11 前端 fallback）：operatorLabel(undefined) === "IN"（缺漏視為 in）', () => {
    expect(operatorLabel(undefined)).toBe('IN');
  });

  it('LABEL-006：operatorLabel("in")（顯式）與 operatorLabel(undefined)（缺漏）輸出逐字相同（AC-17）', () => {
    expect(operatorLabel('in')).toBe(operatorLabel(undefined));
  });
});
