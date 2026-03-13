import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToggleStatusDialog } from '../toggle-status-dialog';

function renderDialog(
  props: {
    open?: boolean;
    mode?: 'disable' | 'enable';
    accountName?: string;
    loading?: boolean;
    onConfirm?: () => void;
    onCancel?: () => void;
  } = {},
) {
  const defaultProps = {
    open: true,
    mode: 'disable' as const,
    accountName: 'Test User',
    loading: false,
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    ...props,
  };
  return {
    ...render(<ToggleStatusDialog {...defaultProps} />),
    ...defaultProps,
  };
}

describe('ToggleStatusDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('停用模式', () => {
    it('open=true 時渲染停用確認對話框', () => {
      renderDialog();
      expect(screen.getByText('停用帳號')).toBeInTheDocument();
    });

    it('顯示帳號名稱於確認訊息中', () => {
      renderDialog({ accountName: 'Alice' });
      expect(screen.getByText(/Alice/)).toBeInTheDocument();
    });

    it('顯示停用警告訊息', () => {
      renderDialog();
      expect(screen.getByText(/停用後該使用者將無法登入系統/)).toBeInTheDocument();
    });

    it('確認按鈕顯示「停用」文字', () => {
      renderDialog();
      expect(screen.getByRole('button', { name: '停用' })).toBeInTheDocument();
    });

    it('點擊停用按鈕呼叫 onConfirm', async () => {
      const user = userEvent.setup();
      const { onConfirm } = renderDialog();
      await user.click(screen.getByRole('button', { name: '停用' }));
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it('點擊取消按鈕呼叫 onCancel', async () => {
      const user = userEvent.setup();
      const { onCancel } = renderDialog();
      await user.click(screen.getByRole('button', { name: '取消' }));
      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('loading 時確認按鈕 disabled', () => {
      renderDialog({ loading: true });
      expect(screen.getByRole('button', { name: '停用中...' })).toBeDisabled();
    });

    it('open=false 時不渲染', () => {
      renderDialog({ open: false });
      expect(screen.queryByText('停用帳號')).not.toBeInTheDocument();
    });

    it('點擊背景遮罩呼叫 onCancel', async () => {
      const user = userEvent.setup();
      const { onCancel } = renderDialog();
      await user.click(screen.getByTestId('dialog-backdrop'));
      expect(onCancel).toHaveBeenCalledTimes(1);
    });
  });

  describe('啟用模式', () => {
    it('顯示啟用確認標題', () => {
      renderDialog({ mode: 'enable' });
      expect(screen.getByText('啟用帳號')).toBeInTheDocument();
    });

    it('顯示啟用確認訊息', () => {
      renderDialog({ mode: 'enable', accountName: 'Bob' });
      expect(screen.getByText(/確定要啟用 Bob 的帳號嗎/)).toBeInTheDocument();
    });

    it('確認按鈕顯示「啟用」文字', () => {
      renderDialog({ mode: 'enable' });
      expect(screen.getByRole('button', { name: '啟用' })).toBeInTheDocument();
    });

    it('點擊啟用按鈕呼叫 onConfirm', async () => {
      const user = userEvent.setup();
      const { onConfirm } = renderDialog({ mode: 'enable' });
      await user.click(screen.getByRole('button', { name: '啟用' }));
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it('點擊取消按鈕呼叫 onCancel', async () => {
      const user = userEvent.setup();
      const { onCancel } = renderDialog({ mode: 'enable' });
      await user.click(screen.getByRole('button', { name: '取消' }));
      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('loading 時確認按鈕 disabled', () => {
      renderDialog({ mode: 'enable', loading: true });
      expect(screen.getByRole('button', { name: '啟用中...' })).toBeDisabled();
    });
  });
});
