import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ApprovalHistoryTimeline } from '../approval-history-timeline';
import type { ApprovalHistoryItem } from '@/api/assignment-stage';

/**
 * 29c §4 / 29d §4 簽核歷史時間軸
 *
 * 對應 prototype 29c-approval-review.html L284-295
 *
 * 行為：
 *   - history = [] 顯示「尚無簽核紀錄」
 *   - approve 紀錄 → 綠色 dot
 *   - reject 紀錄 → 紅色 dot + rejectReason
 *   - 多筆按 approvedAt DESC 順序渲染（最新在最上）
 */

describe('ApprovalHistoryTimeline', () => {
  it('空陣列顯示「尚無簽核紀錄」', () => {
    render(<ApprovalHistoryTimeline history={[]} />);
    expect(screen.getByText('尚無簽核紀錄')).toBeInTheDocument();
  });

  it('loading=true 顯示「載入中...」', () => {
    render(<ApprovalHistoryTimeline history={[]} loading />);
    expect(screen.getByText('載入中...')).toBeInTheDocument();
    expect(screen.queryByText('尚無簽核紀錄')).not.toBeInTheDocument();
  });

  it('approve 紀錄渲染 approver name + 核准標籤', () => {
    const history: ApprovalHistoryItem[] = [
      {
        approvalId: 'a1',
        action: 'approve',
        rejectReason: null,
        approverId: 'dir-001',
        approverName: '張部長',
        approverRole: 'director',
        approvedAt: '2026-05-14T18:05:00Z',
      },
    ];
    render(<ApprovalHistoryTimeline history={history} />);
    const item = screen.getByTestId('approval-history-item-a1');
    expect(item.textContent).toContain('張部長');
    expect(item.textContent).toContain('核准');
  });

  it('reject 紀錄渲染 reject 標籤 + rejectReason', () => {
    const history: ApprovalHistoryItem[] = [
      {
        approvalId: 'a1',
        action: 'reject',
        rejectReason: '比例不合理，請調整',
        approverId: 'dir-001',
        approverName: '王部長',
        approverRole: 'director',
        approvedAt: '2026-05-13T10:00:00Z',
      },
    ];
    render(<ApprovalHistoryTimeline history={history} />);
    expect(screen.getByText('拒絕')).toBeInTheDocument();
    expect(screen.getByText('比例不合理，請調整')).toBeInTheDocument();
  });

  it('多筆紀錄全部渲染', () => {
    const history: ApprovalHistoryItem[] = [
      {
        approvalId: 'a3',
        action: 'approve',
        rejectReason: null,
        approverId: 'dir-001',
        approverName: '張部長',
        approverRole: 'director',
        approvedAt: '2026-05-14T18:05:00Z',
      },
      {
        approvalId: 'a2',
        action: 'reject',
        rejectReason: '第二次拒絕',
        approverId: 'dir-001',
        approverName: '張部長',
        approverRole: 'director',
        approvedAt: '2026-05-12T10:00:00Z',
      },
      {
        approvalId: 'a1',
        action: 'reject',
        rejectReason: '第一次拒絕',
        approverId: 'dir-001',
        approverName: '張部長',
        approverRole: 'director',
        approvedAt: '2026-05-10T10:00:00Z',
      },
    ];
    render(<ApprovalHistoryTimeline history={history} />);
    const items = screen.getAllByTestId(/^approval-history-item-/);
    expect(items.length).toBe(3);
    expect(screen.getByText('第一次拒絕')).toBeInTheDocument();
    expect(screen.getByText('第二次拒絕')).toBeInTheDocument();
  });

  it('approver name=null 時顯示 approverId fallback', () => {
    const history: ApprovalHistoryItem[] = [
      {
        approvalId: 'a1',
        action: 'approve',
        rejectReason: null,
        approverId: 'dir-002',
        approverName: null,
        approverRole: 'director',
        approvedAt: '2026-05-14T18:05:00Z',
      },
    ];
    render(<ApprovalHistoryTimeline history={history} />);
    expect(screen.getByText(/dir-002/)).toBeInTheDocument();
  });

  it('顯示總筆數 count', () => {
    const history: ApprovalHistoryItem[] = [
      {
        approvalId: 'a1',
        action: 'approve',
        rejectReason: null,
        approverId: 'dir-001',
        approverName: 'X',
        approverRole: 'director',
        approvedAt: '2026-05-14T18:05:00Z',
      },
      {
        approvalId: 'a2',
        action: 'reject',
        rejectReason: 'r',
        approverId: 'dir-001',
        approverName: 'X',
        approverRole: 'director',
        approvedAt: '2026-05-13T10:00:00Z',
      },
    ];
    render(<ApprovalHistoryTimeline history={history} />);
    const counter = screen.getByTestId('approval-history-count');
    expect(counter.textContent).toContain('2');
  });
});
