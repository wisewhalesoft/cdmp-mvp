import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { ForgotPasswordPage } from '../forgot-password-page';
import * as authApi from '@/api/auth';

vi.mock('@/api/auth');
const mockedForgotPassword = vi.mocked(authApi.forgotPassword);

function renderPage() {
  return render(
    <BrowserRouter>
      <ForgotPasswordPage />
    </BrowserRouter>,
  );
}

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('渲染測試', () => {
    it('渲染標題「忘記密碼」', () => {
      renderPage();
      expect(screen.getByText('忘記密碼')).toBeInTheDocument();
    });

    it('渲染說明文字', () => {
      renderPage();
      expect(
        screen.getByText(
          '請輸入您的 Email 地址，我們將寄送密碼重設連結給您。',
        ),
      ).toBeInTheDocument();
    });

    it('渲染 Email 輸入欄', () => {
      renderPage();
      expect(screen.getByLabelText('Email')).toBeInTheDocument();
    });

    it('渲染「發送重設連結」按鈕', () => {
      renderPage();
      expect(
        screen.getByRole('button', { name: '發送重設連結' }),
      ).toBeInTheDocument();
    });

    it('渲染「返回登入」連結', () => {
      renderPage();
      expect(screen.getByText('返回登入')).toBeInTheDocument();
    });
  });

  describe('表單驗證', () => {
    it('空 Email 提交顯示驗證錯誤', async () => {
      const user = userEvent.setup();
      renderPage();

      await user.click(screen.getByRole('button', { name: '發送重設連結' }));

      await waitFor(() => {
        expect(
          screen.getByText('請輸入有效的 Email 地址'),
        ).toBeInTheDocument();
      });
    });

    it('無效 Email 格式顯示驗證錯誤', async () => {
      const user = userEvent.setup();
      renderPage();

      await user.type(screen.getByLabelText('Email'), 'invalid-email');
      await user.click(screen.getByRole('button', { name: '發送重設連結' }));

      await waitFor(() => {
        expect(
          screen.getByText('請輸入有效的 Email 地址'),
        ).toBeInTheDocument();
      });
    });
  });

  describe('成功發送', () => {
    it('成功後顯示確認畫面', async () => {
      const user = userEvent.setup();
      mockedForgotPassword.mockResolvedValue({
        message: '若此 Email 存在，重設連結已寄出',
      });

      renderPage();

      await user.type(screen.getByLabelText('Email'), 'test@example.com');
      await user.click(screen.getByRole('button', { name: '發送重設連結' }));

      await waitFor(() => {
        expect(
          screen.getByText('若此 Email 存在，重設連結已寄出'),
        ).toBeInTheDocument();
      });

      expect(mockedForgotPassword).toHaveBeenCalledWith({
        email: 'test@example.com',
      });
    });

    it('確認畫面有「返回登入」按鈕', async () => {
      const user = userEvent.setup();
      mockedForgotPassword.mockResolvedValue({
        message: '若此 Email 存在，重設連結已寄出',
      });

      renderPage();

      await user.type(screen.getByLabelText('Email'), 'test@example.com');
      await user.click(screen.getByRole('button', { name: '發送重設連結' }));

      await waitFor(() => {
        expect(screen.getByText('返回登入')).toBeInTheDocument();
      });
    });
  });

  describe('錯誤處理', () => {
    it('API 錯誤顯示錯誤訊息', async () => {
      const user = userEvent.setup();
      mockedForgotPassword.mockRejectedValue(new Error('Network error'));

      renderPage();

      await user.type(screen.getByLabelText('Email'), 'test@example.com');
      await user.click(screen.getByRole('button', { name: '發送重設連結' }));

      await waitFor(() => {
        expect(screen.getByText('發生錯誤，請稍後再試。')).toBeInTheDocument();
      });
    });
  });
});
