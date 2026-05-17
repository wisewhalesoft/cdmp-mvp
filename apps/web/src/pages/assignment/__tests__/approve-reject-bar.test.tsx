import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApproveRejectBar } from '../_components/approve-reject-bar';
import { ToastProvider } from '@/components/ui/toast';
import * as stageApi from '@/api/assignment-stage';

vi.mock('@/api/assignment-stage');

const mockedApprove = vi.mocked(stageApi.approveList);
const mockedReject = vi.mocked(stageApi.rejectList);
const mockedRollback = vi.mocked(stageApi.rollbackToApproval);

function renderBar(stage: 'approval' | 'ready' | 'draft' | 'dept_ratio') {
  return render(
    <ToastProvider>
      <ApproveRejectBar listNo="OB202605001" stage={stage} />
    </ToastProvider>,
  );
}

describe('ApproveRejectBar (F086 / F087 / F089)', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('stage !== approval / ready 不渲染', () => {
    renderBar('draft');
    expect(screen.queryByTestId('approve-reject-bar')).toBeNull();
  });

  it('stage = approval 顯示 退件 + 簽核通過 按鈕', () => {
    renderBar('approval');
    expect(screen.getByTestId('approve-reject-bar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /退件/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /簽核通過/ })).toBeInTheDocument();
  });

  it('stage = ready 顯示 Rollback 至簽核 按鈕', () => {
    renderBar('ready');
    expect(screen.getByRole('button', { name: /Rollback 至簽核/ })).toBeInTheDocument();
  });

  it('點簽核通過 → confirm modal → 確認 → 呼叫 approveList', async () => {
    mockedApprove.mockResolvedValue({ listNo: 'OB202605001', stage: 'ready' });
    renderBar('approval');
    fireEvent.click(screen.getByRole('button', { name: /簽核通過/ }));
    fireEvent.click(screen.getByRole('button', { name: /確認簽核/ }));
    await waitFor(() =>
      expect(mockedApprove).toHaveBeenCalledWith('OB202605001'),
    );
  });

  it('退件需 reason 必填', async () => {
    renderBar('approval');
    fireEvent.click(screen.getByRole('button', { name: /退件/ }));
    expect(screen.getByTestId('reject-modal')).toBeInTheDocument();
    // 確認按鈕應 disabled (reason 為空)
    const confirmBtn = screen.getByRole('button', { name: /確認退件/ });
    expect(confirmBtn).toBeDisabled();
    // 填 reason 後可送出
    fireEvent.change(screen.getByTestId('input-reject-reason'), {
      target: { value: '個別比例不符' },
    });
    expect(confirmBtn).not.toBeDisabled();
  });

  it('提交退件 → 呼叫 rejectList(rejectReason)', async () => {
    mockedReject.mockResolvedValue({ listNo: 'OB202605001', stage: 'personnel_ratio' });
    renderBar('approval');
    fireEvent.click(screen.getByRole('button', { name: /退件/ }));
    fireEvent.change(screen.getByTestId('input-reject-reason'), {
      target: { value: '個別比例不符' },
    });
    fireEvent.click(screen.getByRole('button', { name: /確認退件/ }));
    await waitFor(() =>
      expect(mockedReject).toHaveBeenCalledWith('OB202605001', {
        rejectReason: '個別比例不符',
      }),
    );
  });

  it('ready 階段 Rollback → 呼叫 rollbackToApproval', async () => {
    mockedRollback.mockResolvedValue({ listNo: 'OB202605001', stage: 'approval' });
    renderBar('ready');
    fireEvent.click(screen.getByRole('button', { name: /Rollback 至簽核/ }));
    fireEvent.click(screen.getByRole('button', { name: /確認 Rollback/ }));
    await waitFor(() =>
      expect(mockedRollback).toHaveBeenCalledWith('OB202605001'),
    );
  });

  it('hidden=true 不渲染', () => {
    render(
      <ToastProvider>
        <ApproveRejectBar listNo="OB202605001" stage="approval" hidden />
      </ToastProvider>,
    );
    expect(screen.queryByTestId('approve-reject-bar')).toBeNull();
  });
});
