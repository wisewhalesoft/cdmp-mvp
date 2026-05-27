import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import { AppliedSpecialRulesPanel } from '../ListDetailDrawer';
import type { AppliedSpecialRule } from '@/api/assignment-list';

/**
 * F095 — 系統特例排除規則唯讀區塊（AD-E07-26 §26.5）
 *
 * 對應測試設計 F095-test 四（前端 Component RTL）：
 *   - FE-001：呈現規則清單（ruleName + exclusionDescription）
 *   - FE-002：純唯讀 — 無任何 input / button / select / checkbox / switch 操作
 *   - FE-003：isSystemMandatory 標籤分流（系統強制 vs 名稱觸發）
 *   - FE-004：空集合防護 — 仍顯示 R-FRAUD-WHITEBOARD（不顯示空狀態）
 *
 * 對齊 prototype/27-list-definition.html 唯讀區塊版面（灰底卡 / 鎖頭 / pill / amber 標籤）。
 */

const FRAUD: AppliedSpecialRule = {
  ruleId: 'R-FRAUD-WHITEBOARD',
  ruleName: '詐騙白牌排除',
  isSystemMandatory: true,
  exclusionDescription: '排除名單類別為期中（list_type=01）且規格名稱含「白牌」之案件',
};
const MOTORCYCLE: AppliedSpecialRule = {
  ruleId: 'R-PERIOD-MOTORCYCLE',
  ruleName: '機車期中滿期前3個月排除',
  isSystemMandatory: false,
  exclusionDescription: '排除已繳期數接近總期數減3（接近滿期）或申請號以 T／Y 開頭之案件',
};
const YEAR_ABOVE: AppliedSpecialRule = {
  ruleId: 'R-YEAR-ABOVE',
  ruleName: '年以上車齡超15年排除',
  isSystemMandatory: false,
  exclusionDescription: '排除出廠年份距今超過15年之案件',
};

describe('F095 AppliedSpecialRulesPanel', () => {
  it('FE-001：呈現規則清單（ruleName + exclusionDescription + 區塊標題）', () => {
    render(<AppliedSpecialRulesPanel rules={[FRAUD, MOTORCYCLE]} />);

    expect(screen.getByText('系統特例排除規則')).toBeInTheDocument();
    expect(screen.getByText('詐騙白牌排除')).toBeInTheDocument();
    expect(screen.getByText('機車期中滿期前3個月排除')).toBeInTheDocument();
    expect(screen.getByText(FRAUD.exclusionDescription)).toBeInTheDocument();
    expect(screen.getByText(MOTORCYCLE.exclusionDescription)).toBeInTheDocument();
  });

  it('FE-002：純唯讀 — 不存在 input / button / select / checkbox / switch', () => {
    const { container } = render(
      <AppliedSpecialRulesPanel rules={[FRAUD, MOTORCYCLE, YEAR_ABOVE]} />,
    );
    expect(container.querySelectorAll('input')).toHaveLength(0);
    expect(container.querySelectorAll('button')).toHaveLength(0);
    expect(container.querySelectorAll('select')).toHaveLength(0);
    expect(container.querySelectorAll('[type="checkbox"]')).toHaveLength(0);
    expect(container.querySelectorAll('[role="switch"]')).toHaveLength(0);
    // 整個區塊無 interactive 元素（純資訊呈現；「不可編輯」為說明文字，非操作控制項）
    expect(container.querySelectorAll('a')).toHaveLength(0);
  });

  it('FE-003：isSystemMandatory 標籤分流 — 系統強制（詐騙白牌）vs 名稱觸發（機車期中）', () => {
    render(<AppliedSpecialRulesPanel rules={[FRAUD, MOTORCYCLE]} />);

    const fraudCard = screen.getByTestId('special-rule-R-FRAUD-WHITEBOARD');
    const motoCard = screen.getByTestId('special-rule-R-PERIOD-MOTORCYCLE');

    // 詐騙白牌 → 系統強制標籤
    expect(within(fraudCard).getByTestId('rule-tag-mandatory')).toBeInTheDocument();
    expect(within(fraudCard).queryByTestId('rule-tag-named')).not.toBeInTheDocument();
    // 機車期中 → 名稱觸發標籤
    expect(within(motoCard).getByTestId('rule-tag-named')).toBeInTheDocument();
    expect(within(motoCard).queryByTestId('rule-tag-mandatory')).not.toBeInTheDocument();
  });

  it('FE-004：空集合防護 — 僅 R-FRAUD-WHITEBOARD 時仍顯示（無空狀態）+ 顯示未觸發提示', () => {
    render(<AppliedSpecialRulesPanel rules={[FRAUD]} />);

    expect(screen.getByText('詐騙白牌排除')).toBeInTheDocument();
    expect(screen.queryByText(/尚無規則|無套用規則/)).not.toBeInTheDocument();
    // 無具名規則時顯示提示文字
    expect(screen.getByText(/未觸發其他具名特例規則/)).toBeInTheDocument();
  });

  it('FE-005：有具名規則時不顯示未觸發提示', () => {
    render(<AppliedSpecialRulesPanel rules={[FRAUD, YEAR_ABOVE]} />);
    expect(screen.queryByText(/未觸發其他具名特例規則/)).not.toBeInTheDocument();
    expect(screen.getByText('年以上車齡超15年排除')).toBeInTheDocument();
  });

  it('FE-006：rules undefined（舊版 API 容錯）→ 隱藏整個區塊', () => {
    const { container } = render(<AppliedSpecialRulesPanel rules={undefined} />);
    expect(container.querySelector('[data-testid="applied-special-rules-panel"]')).toBeNull();
  });
});
