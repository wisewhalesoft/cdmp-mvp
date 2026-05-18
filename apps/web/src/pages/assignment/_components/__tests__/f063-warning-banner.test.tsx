/**
 * F063 — ScoringWarningBanner Component Tests
 *
 * 涵蓋計分警告 Banner 前端行為（test-designer 已建 it.todo，Phase 2 由 tdd-implementation 補實作）：
 *   - TS-F063-WB-001：warningSummary=null → 不渲染
 *   - TS-F063-WB-002：warningSummary.issueCount=0 → 不渲染（無警告）
 *   - TS-F063-WB-003：warningSummary.issueCount>0 → 渲染警告 banner
 *   - TS-F063-WB-004：issue.type='MISSING_MATCH_TYPE' → 顯示對應中文說明
 *   - TS-F063-WB-005：issue.type='EMPTY_SCORE_RANGE' → 顯示對應中文說明
 *   - TS-F063-WB-006：issue.type='COMPOSITE_MISSING_BASELINE' → 顯示對應說明
 *   - TS-F063-WB-007：多個 issue → 全部顯示（不只顯示第一筆）
 *   - TS-F063-WB-008：點「關閉」→ 觸發 onDismiss callback（父層控制顯示）
 *   - TS-F063-WB-009：warningSummary 存在但 run.status='failed' → 顯示「稽核失敗」樣式（非一般警告）
 *   - TS-F063-WB-010：issue.columnName 顯示於 banner（告知使用者哪個維度有問題）
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  ScoringWarningBanner,
  ISSUE_TYPE_DESCRIPTIONS,
  type ScoringWarningSummary,
} from '../scoring-warning-banner';

const SINGLE_ISSUE_SUMMARY: ScoringWarningSummary = {
  issueCount: 1,
  issues: [
    {
      type: 'MISSING_MATCH_TYPE',
      columnName: 'ACCOUNT_AGE',
      detail: '缺少 match_type 欄位',
    },
  ],
};

const MULTI_ISSUE_SUMMARY: ScoringWarningSummary = {
  issueCount: 3,
  issues: [
    { type: 'MISSING_MATCH_TYPE', columnName: 'ACCOUNT_AGE', detail: '缺少 match_type' },
    { type: 'EMPTY_SCORE_RANGE', columnName: 'CONTRACT_YEARS', detail: '無分數區間' },
    { type: 'COMPOSITE_MISSING_BASELINE', columnName: 'PROJECT_TP', detail: '缺少基線區間' },
  ],
};

describe('ScoringWarningBanner', () => {
  it('TS-F063-WB-001：warningSummary=null → 不渲染', () => {
    const { container } = render(
      <ScoringWarningBanner warningSummary={null} runStatus="completed" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('TS-F063-WB-002：warningSummary.issueCount=0 → 不渲染', () => {
    const { container } = render(
      <ScoringWarningBanner
        warningSummary={{ issueCount: 0, issues: [] }}
        runStatus="completed"
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('TS-F063-WB-003：warningSummary.issueCount>0 → 渲染警告 banner', () => {
    render(
      <ScoringWarningBanner
        warningSummary={SINGLE_ISSUE_SUMMARY}
        runStatus="completed"
      />,
    );
    const banner = screen.getByTestId('scoring-warning-banner');
    expect(banner).toBeTruthy();
    // banner 應顯示 issueCount badge（在 title 內出現 "1 筆"）
    expect(banner.textContent?.includes('1 筆')).toBe(true);
  });

  it('TS-F063-WB-004：MISSING_MATCH_TYPE → 顯示中文說明', () => {
    render(
      <ScoringWarningBanner
        warningSummary={SINGLE_ISSUE_SUMMARY}
        runStatus="completed"
      />,
    );
    const items = screen.getAllByTestId('scoring-warning-issue-item');
    expect(items).toHaveLength(1);
    expect(items[0].getAttribute('data-issue-type')).toBe('MISSING_MATCH_TYPE');
    // 中文說明必須出現
    expect(
      items[0].textContent?.includes(ISSUE_TYPE_DESCRIPTIONS.MISSING_MATCH_TYPE),
    ).toBe(true);
  });

  it('TS-F063-WB-005：EMPTY_SCORE_RANGE → 顯示中文說明', () => {
    render(
      <ScoringWarningBanner
        warningSummary={{
          issueCount: 1,
          issues: [
            {
              type: 'EMPTY_SCORE_RANGE',
              columnName: 'CONTRACT_YEARS',
              detail: '無分數區間',
            },
          ],
        }}
        runStatus="completed"
      />,
    );
    const items = screen.getAllByTestId('scoring-warning-issue-item');
    expect(items[0].getAttribute('data-issue-type')).toBe('EMPTY_SCORE_RANGE');
    expect(
      items[0].textContent?.includes(ISSUE_TYPE_DESCRIPTIONS.EMPTY_SCORE_RANGE),
    ).toBe(true);
  });

  it('TS-F063-WB-006：COMPOSITE_MISSING_BASELINE → 顯示中文說明', () => {
    render(
      <ScoringWarningBanner
        warningSummary={{
          issueCount: 1,
          issues: [
            {
              type: 'COMPOSITE_MISSING_BASELINE',
              columnName: 'PROJECT_TP',
              detail: '缺少基線區間',
            },
          ],
        }}
        runStatus="completed"
      />,
    );
    const items = screen.getAllByTestId('scoring-warning-issue-item');
    expect(items[0].getAttribute('data-issue-type')).toBe(
      'COMPOSITE_MISSING_BASELINE',
    );
    expect(
      items[0].textContent?.includes(
        ISSUE_TYPE_DESCRIPTIONS.COMPOSITE_MISSING_BASELINE,
      ),
    ).toBe(true);
  });

  it('TS-F063-WB-007：多個 issue → 全部顯示（不截斷）', () => {
    render(
      <ScoringWarningBanner
        warningSummary={MULTI_ISSUE_SUMMARY}
        runStatus="completed"
      />,
    );
    const items = screen.getAllByTestId('scoring-warning-issue-item');
    expect(items).toHaveLength(3);
    expect(items[0].getAttribute('data-issue-type')).toBe('MISSING_MATCH_TYPE');
    expect(items[1].getAttribute('data-issue-type')).toBe('EMPTY_SCORE_RANGE');
    expect(items[2].getAttribute('data-issue-type')).toBe(
      'COMPOSITE_MISSING_BASELINE',
    );
  });

  it('TS-F063-WB-008：點關閉按鈕 → 觸發 onDismiss callback', () => {
    const onDismiss = vi.fn();
    render(
      <ScoringWarningBanner
        warningSummary={SINGLE_ISSUE_SUMMARY}
        runStatus="completed"
        onDismiss={onDismiss}
      />,
    );
    fireEvent.click(screen.getByTestId('scoring-warning-dismiss'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('TS-F063-WB-009：runStatus=failed → 顯示「稽核失敗」樣式（非一般警告）', () => {
    render(
      <ScoringWarningBanner
        warningSummary={SINGLE_ISSUE_SUMMARY}
        runStatus="failed"
      />,
    );
    const banner = screen.getByTestId('scoring-warning-banner');
    expect(banner.getAttribute('data-status')).toBe('failed');
    // 失敗樣式：紅色容器（與 completed 的 amber 不同）
    expect(banner.className).toContain('border-danger');
    expect(banner.className).toContain('bg-red-50');
    // 標題使用「稽核失敗」措辭
    expect(banner.textContent?.includes('稽核失敗')).toBe(true);
  });

  it('TS-F063-WB-010：issue.columnName 顯示於 banner（告知使用者哪個維度有問題）', () => {
    render(
      <ScoringWarningBanner
        warningSummary={SINGLE_ISSUE_SUMMARY}
        runStatus="completed"
      />,
    );
    expect(screen.getByText(/ACCOUNT_AGE/)).toBeTruthy();
  });
});
