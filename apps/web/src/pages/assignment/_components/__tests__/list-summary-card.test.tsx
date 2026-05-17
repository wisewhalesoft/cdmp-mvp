import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ListSummaryCard } from '../list-summary-card';

/**
 * 29a/b/c/d 共用名單摘要區塊測試。
 *
 * 對應 prototypes：
 *   - 29a-dept-ratio-config.html L200-241
 *   - 29b-personnel-ratio-config.html L225-258
 *   - 29c-approval-review.html L175-228
 *   - 29d-ready-summary.html L243-280
 */
describe('ListSummaryCard', () => {
  const baseProps = {
    listNo: 'OB202605003',
    listNm: '2026-05 主力催收名單 A',
    title: '部門比例設定',
    description: '為本名單之各在職部門設定 RATION，加總須 = 100%。',
    createdBy: '張部長',
    createdAt: '2026-05-15',
    conditions: [
      'PROD_KIND in (汽車, 機車)',
      'LIST_TYPE = 期中',
      'CASEYEAR in (3, 4, 5)',
    ],
    crEnabled: true,
  };

  it('顯示頁面標題與 listNo / listNm', () => {
    render(<ListSummaryCard {...baseProps} />);
    expect(screen.getByText('部門比例設定')).toBeInTheDocument();
    expect(screen.getByText('OB202605003')).toBeInTheDocument();
    expect(screen.getByText(/2026-05 主力催收名單 A/)).toBeInTheDocument();
  });

  it('顯示說明文字', () => {
    render(<ListSummaryCard {...baseProps} />);
    expect(
      screen.getByText('為本名單之各在職部門設定 RATION，加總須 = 100%。'),
    ).toBeInTheDocument();
  });

  it('顯示建立者與建立時間', () => {
    render(<ListSummaryCard {...baseProps} />);
    expect(screen.getByText('張部長')).toBeInTheDocument();
    expect(screen.getByText('2026-05-15')).toBeInTheDocument();
  });

  it('顯示所有篩選條件 chips', () => {
    render(<ListSummaryCard {...baseProps} />);
    expect(screen.getByText('PROD_KIND in (汽車, 機車)')).toBeInTheDocument();
    expect(screen.getByText('LIST_TYPE = 期中')).toBeInTheDocument();
    expect(screen.getByText('CASEYEAR in (3, 4, 5)')).toBeInTheDocument();
  });

  it('crEnabled=true 顯示 CR 啟用 badge', () => {
    render(<ListSummaryCard {...baseProps} crEnabled={true} />);
    expect(screen.getByText(/CR.*啟用/)).toBeInTheDocument();
  });

  it('crEnabled=false 不顯示 CR 啟用 badge（或顯示停用）', () => {
    render(<ListSummaryCard {...baseProps} crEnabled={false} />);
    // 不允許出現 "CR 啟用" 字串
    expect(screen.queryByText(/CR.*啟用/)).not.toBeInTheDocument();
  });

  it('條件為空陣列時不渲染 chips 區但仍渲染卡片', () => {
    render(<ListSummaryCard {...baseProps} conditions={[]} />);
    expect(screen.getByText('OB202605003')).toBeInTheDocument();
    // chips section 仍可渲染（顯示「無篩選條件」）或不渲染；以「條件文字不出現」為驗證
    expect(screen.queryByText(/PROD_KIND/)).not.toBeInTheDocument();
  });

  it('提供 estimatedCount 時顯示預估命中筆數', () => {
    render(<ListSummaryCard {...baseProps} estimatedCount={1200} />);
    const block = screen.getByTestId('estimated-count');
    expect(block.textContent).toContain('1,200');
  });

  it('未提供 estimatedCount 時不渲染預估區塊', () => {
    render(<ListSummaryCard {...baseProps} />);
    expect(screen.queryByText(/預估命中/)).not.toBeInTheDocument();
  });
});
