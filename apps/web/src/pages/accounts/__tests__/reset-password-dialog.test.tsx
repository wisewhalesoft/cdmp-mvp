import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ResetPasswordDialog } from '../reset-password-dialog';

function renderDialog(
  props: {
    open?: boolean;
    accountName?: string;
    loading?: boolean;
    onConfirm?: (newPassword: string) => void;
    onCancel?: () => void;
  } = {},
) {
  const defaultProps = {
    open: true,
    accountName: 'Test User',
    loading: false,
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    ...props,
  };
  return {
    ...render(<ResetPasswordDialog {...defaultProps} />),
    ...defaultProps,
  };
}

describe('ResetPasswordDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('open=false 時不渲染對話框', () => {
    renderDialog({ open: false });
    expect(screen.queryByText('重設使用者密碼')).not.toBeInTheDocument();
  });

  it('open=true 時顯示對話框標題「重設使用者密碼」', () => {
    renderDialog();
    expect(screen.getByText('重設使用者密碼')).toBeInTheDocument();
  });

  it('顯示帳號名稱', () => {
    renderDialog({ accountName: 'Alice' });
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('顯示新密碼與確認密碼欄位', () => {
    renderDialog();
    expect(screen.getByLabelText('新密碼')).toBeInTheDocument();
    expect(screen.getByLabelText('確認密碼')).toBeInTheDocument();
  });

  it('密碼不足 8 字元時顯示錯誤', async () => {
    const user = userEvent.setup();
    renderDialog();

    const newPassword = screen.getByLabelText('新密碼');
    await user.type(newPassword, 'short');

    const confirmPassword = screen.getByLabelText('確認密碼');
    await user.type(confirmPassword, 'short');

    await user.click(screen.getByRole('button', { name: '重設密碼' }));

    await waitFor(() => {
      expect(screen.getByText('密碼長度不得少於 8 個字元')).toBeInTheDocument();
    });
  });

  it('密碼不一致時顯示錯誤', async () => {
    const user = userEvent.setup();
    renderDialog();

    const newPassword = screen.getByLabelText('新密碼');
    await user.type(newPassword, 'Password123');

    const confirmPassword = screen.getByLabelText('確認密碼');
    await user.type(confirmPassword, 'DifferentPass');

    await user.click(screen.getByRole('button', { name: '重設密碼' }));

    await waitFor(() => {
      expect(screen.getByText('密碼不一致')).toBeInTheDocument();
    });
  });

  it('成功送出時呼叫 onConfirm 並傳入新密碼', async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog();

    const newPassword = screen.getByLabelText('新密碼');
    await user.type(newPassword, 'NewPass99');

    const confirmPassword = screen.getByLabelText('確認密碼');
    await user.type(confirmPassword, 'NewPass99');

    await user.click(screen.getByRole('button', { name: '重設密碼' }));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith('NewPass99');
    });
  });

  it('點擊取消呼叫 onCancel', async () => {
    const user = userEvent.setup();
    const { onCancel } = renderDialog();
    await user.click(screen.getByRole('button', { name: '取消' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('loading 狀態下確認按鈕 disabled', () => {
    renderDialog({ loading: true });
    expect(screen.getByRole('button', { name: '重設中...' })).toBeDisabled();
  });

  it('點擊背景遮罩呼叫 onCancel', async () => {
    const user = userEvent.setup();
    const { onCancel } = renderDialog();
    await user.click(screen.getByTestId('dialog-backdrop'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('密碼恰好 8 字元時可成功送出', async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog();

    const newPassword = screen.getByLabelText('新密碼');
    await user.type(newPassword, '12345678');

    const confirmPassword = screen.getByLabelText('確認密碼');
    await user.type(confirmPassword, '12345678');

    await user.click(screen.getByRole('button', { name: '重設密碼' }));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith('12345678');
    });
  });
});
