import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RunSummaryPanel } from '../run-summary-panel';

/**
 * F061 「本次執行摘要」面板（trigger-run 頁右側）
 *
 * 對應 prototype 31-trigger-run.html L332+
 *
 * 顯示：
 *   - workYm
 *   - 觸發者
 *   - 本次將執行的 active 名單列表（含 listNo / listNm / estimated count）
 *   - 總筆數 = sum of estimates
 */

const LISTS = [
  { listNo: 'OB202605001', listNm: '汽車期中', estimatedCount: 5000 },
  { listNo: 'OB202605002', listNm: '機車期中', estimatedCount: 3000 },
  { listNo: 'OB202605003', listNm: '信貸主力', estimatedCount: 1500 },
];

describe('RunSummaryPanel', () => {
  it('顯示 workYm + 觸發者', () => {
    render(
      <RunSummaryPanel
        workYm="202605"
        triggeredBy="張部長"
        lists={LISTS}
      />,
    );
    expect(screen.getAllByText(/202605/).length).toBeGreaterThan(0);
    expect(screen.getByText(/張部長/)).toBeInTheDocument();
  });

  it('列出所有名單（含 listNo / listNm / 估算筆數）', () => {
    render(
      <RunSummaryPanel
        workYm="202605"
        triggeredBy="張部長"
        lists={LISTS}
      />,
    );
    expect(screen.getByText('OB202605001')).toBeInTheDocument();
    expect(screen.getByText('汽車期中')).toBeInTheDocument();
    expect(screen.getByText('OB202605002')).toBeInTheDocument();
  });

  it('總筆數顯示加總後的數字（含千分位）', () => {
    render(
      <RunSummaryPanel
        workYm="202605"
        triggeredBy="張部長"
        lists={LISTS}
      />,
    );
    const total = screen.getByTestId('total-estimated');
    expect(total.textContent).toContain('9,500');
  });

  it('active 名單數量顯示', () => {
    render(
      <RunSummaryPanel
        workYm="202605"
        triggeredBy="張部長"
        lists={LISTS}
      />,
    );
    const cnt = screen.getByTestId('active-list-count');
    expect(cnt.textContent).toContain('3');
  });

  it('lists=[] 顯示「無 active 名單」', () => {
    render(
      <RunSummaryPanel
        workYm="202605"
        triggeredBy="張部長"
        lists={[]}
      />,
    );
    expect(screen.getByText(/無.*ready.*名單|本月尚無/)).toBeInTheDocument();
  });

  it('loading 顯示載入中', () => {
    render(
      <RunSummaryPanel
        workYm="202605"
        triggeredBy="張部長"
        lists={[]}
        loading
      />,
    );
    expect(screen.getByText('載入名單摘要中...')).toBeInTheDocument();
  });
});
