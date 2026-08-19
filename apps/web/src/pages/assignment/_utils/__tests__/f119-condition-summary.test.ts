/**
 * F119 / US-183 / AD-E07-50 §3.6 — `_utils/condition-summary.ts` 之 formatConditionSummary()。
 *
 * 撰寫依據：F119 spec AC-15（BR-10 單一格式化來源，「不得顯示為空白 / IN [] / 僅欄位名」）+
 * AD-E07-50 §3.6/§7 I-CATOP-DISPLAY-SINGLE-01 + `docs/ui-ux-design-overview.md` 附錄 C（C-13/
 * C-Q1：AD §3.6 樣板字串與 AC-15 例句不一致，ui-ux-designer 已裁定採 **AC-15 例句**——
 * 欄位名不加引號、以半形空格分隔、關鍵字用直角引號「」；本檔採 AC-15 例句為準，
 * 與 AD 樣板字串（欄位名加引號）不同，此為 ui-ux-designer 已記錄之裁定，非本檔誤植，
 * 詳見附錄 C C.7 C-Q1）+ `prototypes/27a-list-create-draft.html` formatConditionSummary()
 * 原始碼（L973-985，本 feature 唯一格式化來源，三份原型逐字相同）。
 * **未**開啟生產碼 `_utils/condition-summary.ts`（尚不存在，本檔即定義其紅燈起點）。
 */

import { describe, it, expect } from 'vitest';
import { formatConditionSummary } from '../condition-summary';

// 對齊 prototype CONDITION_DECODER 之最小介面（fieldDisplayName / valueLabel）
function decoder(displayNames: Record<string, string>, valueLabels: Record<string, Record<string, string>> = {}) {
  return {
    fieldDisplayName: (col: string) => displayNames[col] ?? col,
    valueLabel: (col: string, v: string) => valueLabels[col]?.[v] ?? v,
  };
}

describe('F119 formatConditionSummary() — 文字運算子格式（AC-15 例句為準，非 AD §3.6 樣板）', () => {
  it('SUMMARY-001（★核心 / AC-15 例句本身）：spec_name not_contains 勁便利 → "主約專案名稱 不包含「勁便利」"', () => {
    const cond = { columnName: 'spec_name', fieldType: 'categorical', operator: 'not_contains', keyword: '勁便利' };
    const d = decoder({ spec_name: '主約專案名稱' });
    expect(formatConditionSummary(cond as never, d as never)).toBe('主約專案名稱 不包含「勁便利」');
  });

  it('SUMMARY-002：occupation_desc equals 軍公教 → "職業別 完全等於「軍公教」"', () => {
    const cond = { columnName: 'occupation_desc', fieldType: 'categorical', operator: 'equals', keyword: '軍公教' };
    const d = decoder({ occupation_desc: '職業別' });
    expect(formatConditionSummary(cond as never, d as never)).toBe('職業別 完全等於「軍公教」');
  });

  it('SUMMARY-003：contains 格式 → "{欄位} 包含「{關鍵字}」"', () => {
    const cond = { columnName: 'spec_name', fieldType: 'categorical', operator: 'contains', keyword: '勁便利' };
    const d = decoder({ spec_name: '主約專案名稱' });
    expect(formatConditionSummary(cond as never, d as never)).toBe('主約專案名稱 包含「勁便利」');
  });

  it('SUMMARY-004（AC-17 向後相容）：keyword 前後若已 trim 之值需逐字顯示，不得額外增刪空白', () => {
    const cond = { columnName: 'spec_name', fieldType: 'categorical', operator: 'contains', keyword: '勁 便利' };
    const d = decoder({ spec_name: '主約專案名稱' });
    expect(formatConditionSummary(cond as never, d as never)).toBe('主約專案名稱 包含「勁 便利」');
  });
});

describe('F119 formatConditionSummary() — in 形態格式（BR-10，取代各頁自拼字串）', () => {
  it('SUMMARY-005：in 條件 → "{欄位}：{值1}、{值2}"（全形冒號 + 頓號）', () => {
    const cond = { columnName: 'prod_kind', fieldType: 'categorical', values: ['01', '02'] };
    const d = decoder({ prod_kind: '產品類別' }, { prod_kind: { '01': '汽車', '02': '機車' } });
    expect(formatConditionSummary(cond as never, d as never)).toBe('產品類別：汽車、機車');
  });

  it('SUMMARY-006（★核心 / AC-15：不得顯示為空白或 IN []）：空 values → "{欄位}：（未選擇任何值）"', () => {
    const cond = { columnName: 'prod_kind', fieldType: 'categorical', values: [] };
    const d = decoder({ prod_kind: '產品類別' });
    const out = formatConditionSummary(cond as never, d as never);
    expect(out).toBe('產品類別：（未選擇任何值）');
    expect(out).not.toBe('');
    expect(out).not.toContain('IN []');
  });
});

describe('F119 formatConditionSummary() — AC-17 向後相容硬性要求（顯式 in ≡ 缺漏 operator）', () => {
  it('SUMMARY-007（★核心）：顯式 operator:"in" 與缺漏 operator（同 values）→ 輸出字串逐字相同', () => {
    const withExplicitIn = { columnName: 'prod_kind', fieldType: 'categorical', operator: 'in', values: ['01'] };
    const withoutOperator = { columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] };
    const d = decoder({ prod_kind: '產品類別' }, { prod_kind: { '01': '汽車' } });
    expect(formatConditionSummary(withExplicitIn as never, d as never)).toBe(
      formatConditionSummary(withoutOperator as never, d as never),
    );
  });
});
