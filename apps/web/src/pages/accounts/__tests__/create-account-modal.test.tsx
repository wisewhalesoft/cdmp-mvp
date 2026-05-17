import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { CreateAccountModal } from '../create-account-modal';
import * as accountsApi from '@/api/accounts';

vi.mock('@/api/accounts');
const mockedCreateAccount = vi.mocked(accountsApi.createAccount);

function renderModal(props: { open?: boolean; onClose?: () => void; onSuccess?: () => void } = {}) {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    onSuccess: vi.fn(),
    ...props,
  };
  return {
    ...render(
      <BrowserRouter>
        <CreateAccountModal {...defaultProps} />
      </BrowserRouter>,
    ),
    ...defaultProps,
  };
}

describe('CreateAccountModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('渲染測試', () => {
    it('open=true 時顯示 Modal', () => {
      renderModal();
      expect(screen.getByText('建立帳號')).toBeInTheDocument();
    });

    it('open=false 時不顯示 Modal', () => {
      renderModal({ open: false });
      expect(screen.queryByText('建立帳號')).not.toBeInTheDocument();
    });

    it('渲染姓名輸入欄', () => {
      renderModal();
      expect(screen.getByLabelText('姓名')).toBeInTheDocument();
    });

    it('渲染 Email 輸入欄', () => {
      renderModal();
      expect(screen.getByLabelText('Email')).toBeInTheDocument();
    });

    it('渲染密碼輸入欄', () => {
      renderModal();
      expect(screen.getByLabelText('密碼')).toBeInTheDocument();
    });

    it('渲染角色選擇欄', () => {
      renderModal();
      expect(screen.getByLabelText('角色')).toBeInTheDocument();
    });

    it('渲染建立與取消按鈕', () => {
      renderModal();
      expect(screen.getByRole('button', { name: '建立' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '取消' })).toBeInTheDocument();
    });
  });

  describe('前端欄位驗證', () => {
    it('姓名空白提交顯示錯誤', async () => {
      const user = userEvent.setup();
      renderModal();
      await user.click(screen.getByRole('button', { name: '建立' }));
      expect(await screen.findByText('請輸入姓名（1-100 個字元）')).toBeInTheDocument();
    });

    it('Email 空白提交顯示錯誤', async () => {
      const user = userEvent.setup();
      renderModal();
      await user.click(screen.getByRole('button', { name: '建立' }));
      expect(await screen.findByText('請輸入有效的 Email 地址')).toBeInTheDocument();
    });

    it('Email 格式錯誤顯示錯誤', async () => {
      const user = userEvent.setup();
      renderModal();
      await user.type(screen.getByLabelText('姓名'), 'Test');
      await user.type(screen.getByLabelText('Email'), 'not-valid');
      await user.type(screen.getByLabelText('密碼'), 'password123');
      await user.click(screen.getByRole('button', { name: '建立' }));
      await waitFor(() => {
        expect(screen.getByText('請輸入有效的 Email 地址')).toBeInTheDocument();
      });
    });

    it('密碼少於 8 字元顯示錯誤', async () => {
      const user = userEvent.setup();
      renderModal();
      await user.type(screen.getByLabelText('姓名'), 'Test');
      await user.type(screen.getByLabelText('Email'), 'test@test.com');
      await user.type(screen.getByLabelText('密碼'), '1234567');
      await user.click(screen.getByRole('button', { name: '建立' }));
      expect(await screen.findByText('密碼長度至少需要 8 個字元')).toBeInTheDocument();
    });
  });

  describe('成功提交', () => {
    it('成功建立帳號後呼叫 onSuccess', async () => {
      const user = userEvent.setup();
      mockedCreateAccount.mockResolvedValue({
        id: 'new-id',
        name: 'New User',
        email: 'new@test.com',
        role: 'user',
        is_sales_manager: false,

        business_role: null,
        status: 'active',
        created_at: '2026-01-01T00:00:00Z',
      });
      const { onSuccess } = renderModal();

      await user.type(screen.getByLabelText('姓名'), 'New User');
      await user.type(screen.getByLabelText('Email'), 'new@test.com');
      await user.type(screen.getByLabelText('密碼'), 'password123');
      await user.click(screen.getByRole('button', { name: '建立' }));

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalled();
      });
    });

    it('提交時呼叫 createAccount API', async () => {
      const user = userEvent.setup();
      mockedCreateAccount.mockResolvedValue({
        id: 'new-id',
        name: 'Test',
        email: 'test@test.com',
        role: 'admin',
        is_sales_manager: false,

        business_role: null,
        status: 'active',
        created_at: '2026-01-01T00:00:00Z',
      });
      renderModal();

      await user.type(screen.getByLabelText('姓名'), 'Test');
      await user.type(screen.getByLabelText('Email'), 'test@test.com');
      await user.type(screen.getByLabelText('密碼'), 'password123');
      // Change role to admin
      await user.selectOptions(screen.getByLabelText('角色'), 'admin');
      await user.click(screen.getByRole('button', { name: '建立' }));

      await waitFor(() => {
        expect(mockedCreateAccount).toHaveBeenCalledWith({
          name: 'Test',
          email: 'test@test.com',
          password: 'password123',
          role: 'admin',
          // admin 角色 checkbox 隱藏並重置為 false
          isSalesManager: false,
        });
      });
    });
  });

  // ===== F004 SM: 業務主管旗標 checkbox =====
  describe('F004 SM: 業務主管旗標 checkbox', () => {
    // TS-F004-SM-FE-001
    it('role=user 時 checkbox 區塊顯示且預設未勾選', () => {
      renderModal();
      const wrap = screen.getByTestId('create-sales-manager-wrap');
      expect(wrap).toBeInTheDocument();
      const cb = screen.getByTestId('create-sales-manager-flag') as HTMLInputElement;
      expect(cb).toBeInTheDocument();
      expect(cb.checked).toBe(false);
    });

    // TS-F004-SM-FE-002
    it('role=admin 時 checkbox 區塊不顯示', async () => {
      const user = userEvent.setup();
      renderModal();
      await user.selectOptions(screen.getByLabelText('角色'), 'admin');
      expect(screen.queryByTestId('create-sales-manager-wrap')).not.toBeInTheDocument();
    });

    // TS-F004-SM-FE-003
    it('切換 user→admin → checkbox 隱藏並重置', async () => {
      const user = userEvent.setup();
      renderModal();
      const cb = screen.getByTestId('create-sales-manager-flag') as HTMLInputElement;
      await user.click(cb);
      expect(cb.checked).toBe(true);

      await user.selectOptions(screen.getByLabelText('角色'), 'admin');
      expect(screen.queryByTestId('create-sales-manager-wrap')).not.toBeInTheDocument();
    });

    // TS-F004-SM-FE-004
    it('切換 user→admin→user → checkbox 再顯示但重置為未勾選', async () => {
      const user = userEvent.setup();
      renderModal();
      let cb = screen.getByTestId('create-sales-manager-flag') as HTMLInputElement;
      await user.click(cb);
      expect(cb.checked).toBe(true);

      await user.selectOptions(screen.getByLabelText('角色'), 'admin');
      expect(screen.queryByTestId('create-sales-manager-wrap')).not.toBeInTheDocument();

      await user.selectOptions(screen.getByLabelText('角色'), 'user');
      cb = screen.getByTestId('create-sales-manager-flag') as HTMLInputElement;
      expect(cb).toBeInTheDocument();
      expect(cb.checked).toBe(false);
    });

    // TS-F004-SM-FE-005
    it('checkbox wrap className 嚴格對齊 prototype 07 line 480', () => {
      renderModal();
      const wrap = screen.getByTestId('create-sales-manager-wrap');
      expect(wrap.className).toContain('rounded-lg');
      expect(wrap.className).toContain('border');
      expect(wrap.className).toContain('border-amber-200');
      expect(wrap.className).toContain('bg-amber-50/50');
      expect(wrap.className).toContain('p-3');
    });

    // TS-F004-SM-FE-006
    it('checkbox 顯示說明文字', () => {
      renderModal();
      expect(
        screen.getByText(/啟用後此帳號可存取 E07 客戶名單分派與 E06 Customer 360/),
      ).toBeInTheDocument();
    });

    // TS-F004-SM-FE-007
    it('勾選 checkbox 後提交 → API request body 含 isSalesManager: true', async () => {
      const user = userEvent.setup();
      mockedCreateAccount.mockResolvedValue({
        id: 'new-id',
        name: 'SM User',
        email: 'sm@test.com',
        role: 'user',
        is_sales_manager: true,

        business_role: 'director',
        status: 'active',
        created_at: '2026-01-01T00:00:00Z',
      });
      renderModal();

      await user.type(screen.getByLabelText('姓名'), 'SM User');
      await user.type(screen.getByLabelText('Email'), 'sm@test.com');
      await user.type(screen.getByLabelText('密碼'), 'password123');
      await user.click(screen.getByTestId('create-sales-manager-flag'));
      await user.click(screen.getByRole('button', { name: '建立' }));

      await waitFor(() => {
        expect(mockedCreateAccount).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'SM User',
            email: 'sm@test.com',
            password: 'password123',
            role: 'user',
            isSalesManager: true,
          }),
        );
      });
    });

    // TS-F004-SM-FE-008
    it('未勾選 checkbox 提交 → API request body 含 isSalesManager: false', async () => {
      const user = userEvent.setup();
      mockedCreateAccount.mockResolvedValue({
        id: 'new-id',
        name: 'No SM User',
        email: 'nosm@test.com',
        role: 'user',
        is_sales_manager: false,

        business_role: null,
        status: 'active',
        created_at: '2026-01-01T00:00:00Z',
      });
      renderModal();

      await user.type(screen.getByLabelText('姓名'), 'No SM User');
      await user.type(screen.getByLabelText('Email'), 'nosm@test.com');
      await user.type(screen.getByLabelText('密碼'), 'password123');
      await user.click(screen.getByRole('button', { name: '建立' }));

      await waitFor(() => {
        expect(mockedCreateAccount).toHaveBeenCalledWith(
          expect.objectContaining({
            isSalesManager: false,
          }),
        );
      });
    });
  });

  describe('伺服器錯誤處理', () => {
    it('409 重複 Email 顯示欄位錯誤', async () => {
      const user = userEvent.setup();
      mockedCreateAccount.mockRejectedValue({
        response: { status: 409, data: { error: 'ACCOUNT_EMAIL_EXISTS', message: '此 Email 已有帳號存在' } },
      });
      renderModal();

      await user.type(screen.getByLabelText('姓名'), 'Test');
      await user.type(screen.getByLabelText('Email'), 'existing@test.com');
      await user.type(screen.getByLabelText('密碼'), 'password123');
      await user.click(screen.getByRole('button', { name: '建立' }));

      expect(await screen.findByText('此 Email 已有帳號存在')).toBeInTheDocument();
    });

    it('未知錯誤顯示通用錯誤訊息', async () => {
      const user = userEvent.setup();
      mockedCreateAccount.mockRejectedValue({
        response: { status: 500 },
      });
      renderModal();

      await user.type(screen.getByLabelText('姓名'), 'Test');
      await user.type(screen.getByLabelText('Email'), 'test@test.com');
      await user.type(screen.getByLabelText('密碼'), 'password123');
      await user.click(screen.getByRole('button', { name: '建立' }));

      expect(await screen.findByText('發生未知錯誤，請稍後再試。')).toBeInTheDocument();
    });
  });

  describe('互動行為', () => {
    it('送出後按鈕顯示 loading 狀態', async () => {
      const user = userEvent.setup();
      mockedCreateAccount.mockImplementation(() => new Promise(() => {}));
      renderModal();

      await user.type(screen.getByLabelText('姓名'), 'Test');
      await user.type(screen.getByLabelText('Email'), 'test@test.com');
      await user.type(screen.getByLabelText('密碼'), 'password123');
      await user.click(screen.getByRole('button', { name: '建立' }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: '建立中...' })).toBeDisabled();
      });
    });

    it('點擊取消呼叫 onClose', async () => {
      const user = userEvent.setup();
      const { onClose } = renderModal();
      await user.click(screen.getByRole('button', { name: '取消' }));
      expect(onClose).toHaveBeenCalled();
    });

    it('點擊 X 關閉按鈕呼叫 onClose', async () => {
      const user = userEvent.setup();
      const { onClose } = renderModal();
      await user.click(screen.getByRole('button', { name: '關閉' }));
      expect(onClose).toHaveBeenCalled();
    });

    it('點擊背景遮罩呼叫 onClose', async () => {
      const user = userEvent.setup();
      const { onClose } = renderModal();
      await user.click(screen.getByTestId('modal-backdrop'));
      expect(onClose).toHaveBeenCalled();
    });

    it('密碼可見切換', async () => {
      const user = userEvent.setup();
      renderModal();
      const passwordInput = screen.getByLabelText('密碼');
      expect(passwordInput).toHaveAttribute('type', 'password');

      await user.click(screen.getByRole('button', { name: '顯示密碼' }));
      expect(passwordInput).toHaveAttribute('type', 'text');

      await user.click(screen.getByRole('button', { name: '隱藏密碼' }));
      expect(passwordInput).toHaveAttribute('type', 'password');
    });
  });
});
