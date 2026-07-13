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
      expect(screen.getByLabelText('Email / 員工編號')).toBeInTheDocument();
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
    it('識別碼空白提交顯示錯誤訊息', async () => {
      const user = userEvent.setup();
      renderLoginPage();
      await user.click(screen.getByRole('button', { name: '登入' }));
      expect(await screen.findByText('請輸入 Email 或員工編號')).toBeInTheDocument();
    });

    // TS-F113-FE-LOGIN-003：前端 schema 不再要求 Email 格式，非 Email 字串（'A0001'）通過驗證
    it('非 Email 字串（員工編號）通過前端驗證、不顯示格式錯誤', async () => {
      const user = userEvent.setup();
      mockedLogin.mockImplementation(() => new Promise(() => {})); // never resolves
      renderLoginPage();
      await user.type(screen.getByLabelText('Email / 員工編號'), 'A0001');
      await user.type(screen.getByLabelText('密碼'), 'password123');
      await user.click(screen.getByRole('button', { name: '登入' }));
      // 不應出現任何格式錯誤；且應進入送出（呼叫 login）
      expect(screen.queryByText('請輸入 Email 或員工編號')).not.toBeInTheDocument();
      await waitFor(() => {
        expect(mockedLogin).toHaveBeenCalled();
      });
    });

    it('密碼空白提交顯示錯誤訊息', async () => {
      const user = userEvent.setup();
      renderLoginPage();
      await user.type(screen.getByLabelText('Email / 員工編號'), 'admin@example.com');
      await user.click(screen.getByRole('button', { name: '登入' }));
      expect(await screen.findByText('請輸入密碼')).toBeInTheDocument();
    });
  });

  // ===== F113 / US-179：員工編號作為登入識別碼（FE-LOGIN）=====
  describe('F113 員工編號登入（FE-LOGIN）', () => {
    // TS-F113-FE-LOGIN-001
    it('識別碼欄位 label 顯示為「Email / 員工編號」', () => {
      renderLoginPage();
      expect(screen.getByLabelText('Email / 員工編號')).toBeInTheDocument();
      expect(screen.getByText('可使用 Email 或員工編號登入')).toBeInTheDocument();
    });

    // TS-F113-FE-LOGIN-002
    it('輸入框 type="text"（非 type="email"）', () => {
      renderLoginPage();
      expect(screen.getByLabelText('Email / 員工編號')).toHaveAttribute('type', 'text');
    });

    // TS-F113-FE-LOGIN-004
    it('送出 payload 欄位名固定為 email（內容為員工編號時亦然）', async () => {
      const user = userEvent.setup();
      mockedLogin.mockResolvedValue({
        token: 't',
        user: { id: 'a1', name: 'Admin', email: 'admin@test.com', role: 'admin' },
      });
      renderLoginPage();
      await user.type(screen.getByLabelText('Email / 員工編號'), 'A0001');
      await user.type(screen.getByLabelText('密碼'), 'password123');
      await user.click(screen.getByRole('button', { name: '登入' }));
      await waitFor(() => {
        expect(mockedLogin).toHaveBeenCalledWith(
          expect.objectContaining({ email: 'A0001', password: 'password123' }),
        );
      });
    });

    // TS-F113-FE-LOGIN-005：員工編號錯誤與密碼錯誤顯示相同通用文案
    it('401 時顯示通用文案「帳號或密碼錯誤」（不區分失敗原因）', async () => {
      const user = userEvent.setup();
      mockedLogin.mockRejectedValue({ response: { status: 401 } });
      renderLoginPage();
      await user.type(screen.getByLabelText('Email / 員工編號'), 'E99999');
      await user.type(screen.getByLabelText('密碼'), 'whatever1');
      await user.click(screen.getByRole('button', { name: '登入' }));
      expect(await screen.findByText('帳號或密碼錯誤')).toBeInTheDocument();
    });

    // TS-F113-FE-LOGIN-006：合法 Email 登入既有流程不受影響
    it('regression — 合法 Email 登入仍走既有成功流程與導向', async () => {
      const user = userEvent.setup();
      mockedLogin.mockResolvedValue({
        token: 'admin-token',
        user: { id: 'a1', name: 'Admin', email: 'admin@test.com', role: 'admin' },
      });
      renderLoginPage();
      await user.type(screen.getByLabelText('Email / 員工編號'), 'admin@test.com');
      await user.type(screen.getByLabelText('密碼'), 'password123');
      await user.click(screen.getByRole('button', { name: '登入' }));
      await waitFor(() => {
        expect(mockedLogin).toHaveBeenCalledWith(
          expect.objectContaining({ email: 'admin@test.com' }),
        );
        expect(mockNavigate).toHaveBeenCalledWith('/');
      });
    });
  });

  describe('互動狀態', () => {
    it('送出後按鈕顯示 loading 狀態', async () => {
      const user = userEvent.setup();
      mockedLogin.mockImplementation(
        () => new Promise(() => {}), // never resolves
      );
      renderLoginPage();
      await user.type(screen.getByLabelText('Email / 員工編號'), 'admin@example.com');
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
      await user.type(screen.getByLabelText('Email / 員工編號'), 'admin@example.com');
      await user.type(screen.getByLabelText('密碼'), 'wrongpass');
      await user.click(screen.getByRole('button', { name: '登入' }));
      expect(await screen.findByText('帳號或密碼錯誤')).toBeInTheDocument();
      expect(screen.getByLabelText('密碼')).toHaveValue('');
    });

    it('後端 403 顯示帳號停用訊息', async () => {
      const user = userEvent.setup();
      mockedLogin.mockRejectedValue({
        response: { status: 403 },
      });
      renderLoginPage();
      await user.type(screen.getByLabelText('Email / 員工編號'), 'admin@example.com');
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
      await user.type(screen.getByLabelText('Email / 員工編號'), 'admin@example.com');
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
      await user.type(screen.getByLabelText('Email / 員工編號'), 'user@test.com');
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
      await user.type(screen.getByLabelText('Email / 員工編號'), 'manager@cdmp.test');
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
      await user.type(screen.getByLabelText('Email / 員工編號'), 'admin@test.com');
      await user.type(screen.getByLabelText('密碼'), 'password123');
      await user.click(screen.getByRole('button', { name: '登入' }));
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/');
      });
    });

    // T-008（v2.1.0）：業務部長登入 → 導向 /assignment/overview（分派總覽）
    it('業務部長（role=user, businessRole=director）登入 → 導向 /assignment/overview', async () => {
      const user = userEvent.setup();
      mockedLogin.mockResolvedValue({
        token: 'director-token',
        user: {
          id: 'd1',
          name: 'Director',
          email: 'director@cdmp.test',
          role: 'user',
          businessRole: 'director',
        },
      });
      renderLoginPage();
      await user.type(screen.getByLabelText('Email / 員工編號'), 'director@cdmp.test');
      await user.type(screen.getByLabelText('密碼'), 'P@ssw0rd123');
      await user.click(screen.getByRole('button', { name: '登入' }));
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/assignment/overview');
      });
    });

    // T-008b（v2.1.0）：業務處長登入 → 導向 /assignment/overview（分派總覽）
    it('業務處長（role=user, businessRole=section_chief）登入 → 導向 /assignment/overview', async () => {
      const user = userEvent.setup();
      mockedLogin.mockResolvedValue({
        token: 'chief-token',
        user: {
          id: 's1',
          name: 'SectionChief',
          email: 'chief@cdmp.test',
          role: 'user',
          businessRole: 'section_chief',
        },
      });
      renderLoginPage();
      await user.type(screen.getByLabelText('Email / 員工編號'), 'chief@cdmp.test');
      await user.type(screen.getByLabelText('密碼'), 'P@ssw0rd123');
      await user.click(screen.getByRole('button', { name: '登入' }));
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/assignment/overview');
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
      await user.type(screen.getByLabelText('Email / 員工編號'), 'legacy@test.com');
      await user.type(screen.getByLabelText('密碼'), 'password123');
      await user.click(screen.getByRole('button', { name: '登入' }));
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/c360/customers');
      });
    });
  });
});
