import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ResetPasswordPage } from '../reset-password-page';
import * as authApi from '@/api/auth';

vi.mock('@/api/auth');
const mockedResetPassword = vi.mocked(authApi.resetPassword);

function renderPage(token?: string) {
  const initialEntries = token
    ? [`/reset-password?token=${token}`]
    : ['/reset-password'];

  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <ResetPasswordPage />
    </MemoryRouter>,
  );
}

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('渲染測試', () => {
    it('有 Token 時渲染重設密碼表單', () => {
      renderPage('valid-token');
      expect(screen.getByRole('heading', { name: '重設密碼' })).toBeInTheDocument();
      expect(screen.getByLabelText('新密碼')).toBeInTheDocument();
      expect(screen.getByLabelText('確認密碼')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: '重設密碼' }),
      ).toBeInTheDocument();
    });

    it('無 Token 時顯示無效連結畫面', () => {
      renderPage();
      expect(screen.getByText('重設連結無效')).toBeInTheDocument();
      expect(screen.getByText('重新申請密碼重設')).toBeInTheDocument();
    });
  });

  describe('表單驗證', () => {
    it('空密碼提交顯示驗證錯誤', async () => {
      const user = userEvent.setup();
      renderPage('valid-token');

      await user.click(screen.getByRole('button', { name: '重設密碼' }));

      await waitFor(() => {
        expect(screen.getByText('請輸入新密碼')).toBeInTheDocument();
      });
    });

    it('密碼少於 8 字元顯示驗證錯誤', async () => {
      const user = userEvent.setup();
      renderPage('valid-token');

      await user.type(screen.getByLabelText('新密碼'), '1234567');
      await user.type(screen.getByLabelText('確認密碼'), '1234567');
      await user.click(screen.getByRole('button', { name: '重設密碼' }));

      await waitFor(() => {
        expect(
          screen.getByText('密碼長度不得少於 8 個字元'),
        ).toBeInTheDocument();
      });
    });

    it('密碼不一致顯示驗證錯誤', async () => {
      const user = userEvent.setup();
      renderPage('valid-token');

      await user.type(screen.getByLabelText('新密碼'), 'NewPass99');
      await user.type(screen.getByLabelText('確認密碼'), 'Different99');
      await user.click(screen.getByRole('button', { name: '重設密碼' }));

      await waitFor(() => {
        expect(
          screen.getByText('密碼與確認密碼不一致'),
        ).toBeInTheDocument();
      });
    });
  });

  describe('成功重設', () => {
    it('成功後顯示成功畫面', async () => {
      const user = userEvent.setup();
      mockedResetPassword.mockResolvedValue({
        message: '密碼已成功重設，請重新登入',
      });

      renderPage('valid-token');

      await user.type(screen.getByLabelText('新密碼'), 'NewPass99');
      await user.type(screen.getByLabelText('確認密碼'), 'NewPass99');
      await user.click(screen.getByRole('button', { name: '重設密碼' }));

      await waitFor(() => {
        expect(screen.getByText('密碼已成功重設')).toBeInTheDocument();
        expect(screen.getByText('前往登入')).toBeInTheDocument();
      });

      expect(mockedResetPassword).toHaveBeenCalledWith({
        token: 'valid-token',
        newPassword: 'NewPass99',
      });
    });
  });

  describe('錯誤處理', () => {
    it('Token 過期顯示過期畫面', async () => {
      const user = userEvent.setup();
      mockedResetPassword.mockRejectedValue({
        response: {
          data: {
            error: 'AUTH_RESET_TOKEN_EXPIRED',
            message: '此連結已過期，請重新申請密碼重設',
          },
        },
      });

      renderPage('expired-token');

      await user.type(screen.getByLabelText('新密碼'), 'NewPass99');
      await user.type(screen.getByLabelText('確認密碼'), 'NewPass99');
      await user.click(screen.getByRole('button', { name: '重設密碼' }));

      await waitFor(() => {
        expect(screen.getByText('連結已過期')).toBeInTheDocument();
        expect(screen.getByText('重新申請密碼重設')).toBeInTheDocument();
      });
    });

    it('Token 已使用顯示過期畫面', async () => {
      const user = userEvent.setup();
      mockedResetPassword.mockRejectedValue({
        response: {
          data: {
            error: 'AUTH_RESET_TOKEN_USED',
            message: '此連結已失效',
          },
        },
      });

      renderPage('used-token');

      await user.type(screen.getByLabelText('新密碼'), 'NewPass99');
      await user.type(screen.getByLabelText('確認密碼'), 'NewPass99');
      await user.click(screen.getByRole('button', { name: '重設密碼' }));

      await waitFor(() => {
        expect(screen.getByText('連結已過期')).toBeInTheDocument();
      });
    });

    it('Token 無效顯示無效畫面', async () => {
      const user = userEvent.setup();
      mockedResetPassword.mockRejectedValue({
        response: {
          data: {
            error: 'AUTH_RESET_TOKEN_INVALID',
            message: '重設連結無效',
          },
        },
      });

      renderPage('invalid-token');

      await user.type(screen.getByLabelText('新密碼'), 'NewPass99');
      await user.type(screen.getByLabelText('確認密碼'), 'NewPass99');
      await user.click(screen.getByRole('button', { name: '重設密碼' }));

      await waitFor(() => {
        expect(screen.getByText('重設連結無效')).toBeInTheDocument();
      });
    });
  });
});
