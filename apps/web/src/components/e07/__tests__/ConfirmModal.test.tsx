import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ConfirmModal } from '../ConfirmModal';

describe('ConfirmModal', () => {
  beforeEach(() => {
    cleanup();
  });

  it('open=false 不渲染', () => {
    render(
      <ConfirmModal
        open={false}
        title="Test"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByText('Test')).toBeNull();
  });

  it('open=true 渲染標題與按鈕（預設 info variant）', () => {
    render(
      <ConfirmModal
        open
        title="確認操作"
        description="此操作將..."
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText('確認操作')).toBeInTheDocument();
    expect(screen.getByText('此操作將...')).toBeInTheDocument();
    expect(screen.getByTestId('confirm-modal-info')).toBeInTheDocument();
  });

  it('warning variant 渲染對應 testid', () => {
    render(
      <ConfirmModal
        open
        variant="warning"
        title="警告"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByTestId('confirm-modal-warning')).toBeInTheDocument();
  });

  it('danger variant 渲染對應 testid', () => {
    render(
      <ConfirmModal
        open
        variant="danger"
        title="刪除"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByTestId('confirm-modal-danger')).toBeInTheDocument();
  });

  it('success variant 渲染對應 testid', () => {
    render(
      <ConfirmModal
        open
        variant="success"
        title="完成"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByTestId('confirm-modal-success')).toBeInTheDocument();
  });

  it('點擊確認按鈕觸發 onConfirm', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmModal
        open
        title="Test"
        confirmLabel="OK"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it('點擊取消按鈕觸發 onCancel', () => {
    const onCancel = vi.fn();
    render(
      <ConfirmModal
        open
        title="Test"
        cancelLabel="Cancel"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('點擊 backdrop 觸發 onCancel', () => {
    const onCancel = vi.fn();
    render(
      <ConfirmModal open title="Test" onConfirm={vi.fn()} onCancel={onCancel} />,
    );
    fireEvent.click(screen.getByTestId('confirm-modal-backdrop'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('loading=true 確認按鈕顯示 loadingText', () => {
    render(
      <ConfirmModal
        open
        title="Test"
        loading
        loadingText="處理中..."
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText('處理中...')).toBeInTheDocument();
  });
});
