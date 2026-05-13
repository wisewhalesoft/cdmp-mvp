import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { LoginPage } from '../login-page';
import * as authApi from '@/api/auth';

vi.mock('@/api/auth');
const mockedLogin = vi.mocked(authApi.login);

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderLoginPage() {
  return render(
    <BrowserRouter>
      <LoginPage />
    </BrowserRouter>,
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('渲染測試', () => {
    it('渲染 Email 輸入欄', () => {
      renderLoginPage();
      expect(screen.getByLabelText('Email')).toBeInTheDocument();
    });

    it('渲染密碼輸入欄', () => {
      renderLoginPage();
      expect(screen.getByLabelText('密碼')).toBeInTheDocument();
    });

    it('渲染「記住我」checkbox', () => {
      renderLoginPage();
      expect(screen.getByLabelText('記住我')).toBeInTheDocument();
    });

    it('渲染「登入」按鈕', () => {
      renderLoginPage();
      expect(screen.getByRole('button', { name: '登入' })).toBeInTheDocument();
    });

    it('渲染「忘記密碼？」連結', () => {
      renderLoginPage();
      expect(screen.getByRole('link', { name: '忘記密碼？' })).toBeInTheDocument();
    });
  });

  describe('前端欄位驗證', () => {
    it('Email 空白提交顯示錯誤訊息', async () => {
      const user = userEvent.setup();
      renderLoginPage();
      await user.click(screen.getByRole('button', { name: '登入' }));
      expect(await screen.findByText('請輸入有效的 Email 地址')).toBeInTheDocument();
    });

    it('Email 格式錯誤顯示錯誤訊息', async () => {
      const user = userEvent.setup();
      renderLoginPage();
      await user.type(screen.getByLabelText('Email'), 'not-an-email');
      await user.click(screen.getByRole('button', { name: '登入' }));
      expect(await screen.findByText('請輸入有效的 Email 地址')).toBeInTheDocument();
    });

    it('密碼空白提交顯示錯誤訊息', async () => {
      const user = userEvent.setup();
      renderLoginPage();
      await user.type(screen.getByLabelText('Email'), 'admin@example.com');
      await user.click(screen.getByRole('button', { name: '登入' }));
      expect(await screen.findByText('請輸入密碼')).toBeInTheDocument();
    });
  });

  describe('互動狀態', () => {
    it('送出後按鈕顯示 loading 狀態', async () => {
      const user = userEvent.setup();
      mockedLogin.mockImplementation(
        () => new Promise(() => {}), // never resolves
      );
      renderLoginPage();
      await user.type(screen.getByLabelText('Email'), 'admin@example.com');
      await user.type(screen.getByLabelText('密碼'), 'password123');
      await user.click(screen.getByRole('button', { name: '登入' }));
      await waitFor(() => {
        const button = screen.getByRole('button', { name: '登入中...' });
        expect(button).toBeDisabled();
      });
    });

    it('後端 401 清空密碼欄並顯示錯誤', async () => {
      const user = userEvent.setup();
      mockedLogin.mockRejectedValue({
        response: { status: 401 },
      });
      renderLoginPage();
      await user.type(screen.getByLabelText('Email'), 'admin@example.com');
      await user.type(screen.getByLabelText('密碼'), 'wrongpass');
      await user.click(screen.getByRole('button', { name: '登入' }));
      expect(await screen.findByText('Email 或密碼錯誤')).toBeInTheDocument();
      expect(screen.getByLabelText('密碼')).toHaveValue('');
    });

    it('後端 403 顯示帳號停用訊息', async () => {
      const user = userEvent.setup();
      mockedLogin.mockRejectedValue({
        response: { status: 403 },
      });
      renderLoginPage();
      await user.type(screen.getByLabelText('Email'), 'admin@example.com');
      await user.type(screen.getByLabelText('密碼'), 'password123');
      await user.click(screen.getByRole('button', { name: '登入' }));
      expect(await screen.findByText('您的帳號已被停用，請聯絡管理員。')).toBeInTheDocument();
    });

    it('後端 429 顯示 rate limit 訊息', async () => {
      const user = userEvent.setup();
      mockedLogin.mockRejectedValue({
        response: { status: 429 },
      });
      renderLoginPage();
      await user.type(screen.getByLabelText('Email'), 'admin@example.com');
      await user.type(screen.getByLabelText('密碼'), 'password123');
      await user.click(screen.getByRole('button', { name: '登入' }));
      expect(await screen.findByText('登入嘗試過於頻繁，請稍後再試。')).toBeInTheDocument();
    });

    it('密碼欄位眼睛圖示切換可見/隱藏', async () => {
      const user = userEvent.setup();
      renderLoginPage();
      const passwordInput = screen.getByLabelText('密碼');
      expect(passwordInput).toHaveAttribute('type', 'password');

      await user.click(screen.getByRole('button', { name: '顯示密碼' }));
      expect(passwordInput).toHaveAttribute('type', 'text');

      await user.click(screen.getByRole('button', { name: '隱藏密碼' }));
      expect(passwordInput).toHaveAttribute('type', 'password');
    });
  });

  describe('登入後角色導向（F002 v1.2 §4.5 矩陣）', () => {
    // T-001（修訂）：一般使用者導向 /c360/customers
    it('一般使用者（role=user, isSalesManager=false）登入 → 導向 /c360/customers', async () => {
      const user = userEvent.setup();
      mockedLogin.mockResolvedValue({
        token: 'user-token',
        user: {
          id: 'u1',
          name: 'User',
          email: 'user@test.com',
          role: 'user',
          isSalesManager: false,
        },
      });
      renderLoginPage();
      await user.type(screen.getByLabelText('Email'), 'user@test.com');
      await user.type(screen.getByLabelText('密碼'), 'password123');
      await user.click(screen.getByRole('button', { name: '登入' }));
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/c360/customers');
      });
    });

    // T-008（新增）：業務主管登入 → 導向 /c360/customers
    it('業務主管（role=user, isSalesManager=true）登入 → 導向 /c360/customers', async () => {
      const user = userEvent.setup();
      mockedLogin.mockResolvedValue({
        token: 'manager-token',
        user: {
          id: 'm1',
          name: 'Manager',
          email: 'manager@cdmp.test',
          role: 'user',
          isSalesManager: true,
        },
      });
      renderLoginPage();
      await user.type(screen.getByLabelText('Email'), 'manager@cdmp.test');
      await user.type(screen.getByLabelText('密碼'), 'P@ssw0rd123');
      await user.click(screen.getByRole('button', { name: '登入' }));
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/c360/customers');
      });
    });

    // T-004（修訂）：admin 導向 /
    it('Admin 登入 → 導向 /', async () => {
      const user = userEvent.setup();
      mockedLogin.mockResolvedValue({
        token: 'admin-token',
        user: {
          id: 'a1',
          name: 'Admin',
          email: 'admin@test.com',
          role: 'admin',
        },
      });
      renderLoginPage();
      await user.type(screen.getByLabelText('Email'), 'admin@test.com');
      await user.type(screen.getByLabelText('密碼'), 'password123');
      await user.click(screen.getByRole('button', { name: '登入' }));
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/');
      });
    });

    // 既有 user 但無 isSalesManager 欄位（舊 token）
    it('一般使用者（role=user，無 isSalesManager 欄位）登入 → 導向 /c360/customers', async () => {
      const user = userEvent.setup();
      mockedLogin.mockResolvedValue({
        token: 'user-token-legacy',
        user: { id: 'u9', name: 'Legacy', email: 'legacy@test.com', role: 'user' },
      });
      renderLoginPage();
      await user.type(screen.getByLabelText('Email'), 'legacy@test.com');
      await user.type(screen.getByLabelText('密碼'), 'password123');
      await user.click(screen.getByRole('button', { name: '登入' }));
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/c360/customers');
      });
    });
  });
});
