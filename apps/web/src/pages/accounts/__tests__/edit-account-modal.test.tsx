import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { EditAccountModal } from '../edit-account-modal';
import * as accountsApi from '@/api/accounts';
import type { AccountListItem } from '@cdmp/shared';

vi.mock('@/api/accounts');
const mockedUpdateAccount = vi.mocked(accountsApi.updateAccount);

const mockAccount: AccountListItem = {
  id: 'user-uuid-1',
  name: 'Test User',
  email: 'test@cdmp.test',
  role: 'user',
  is_sales_manager: false,

  business_role: null,
  employee_no: null,
  status: 'active',
  created_at: '2025-01-01T00:00:00.000Z',
};

function renderModal(
  props: { open?: boolean; account?: AccountListItem | null; onClose?: () => void; onSuccess?: () => void } = {},
) {
  const defaultProps = {
    open: true,
    account: mockAccount,
    onClose: vi.fn(),
    onSuccess: vi.fn(),
    ...props,
  };
  return {
    ...render(
      <BrowserRouter>
        <EditAccountModal {...defaultProps} />
      </BrowserRouter>,
    ),
    ...defaultProps,
  };
}

describe('EditAccountModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('渲染測試', () => {
    it('open=true 時顯示 Modal', () => {
      renderModal();
      expect(screen.getByText('編輯帳號')).toBeInTheDocument();
    });

    it('open=false 時不顯示 Modal', () => {
      renderModal({ open: false });
      expect(screen.queryByText('編輯帳號')).not.toBeInTheDocument();
    });

    it('預填現有姓名', () => {
      renderModal();
      expect(screen.getByLabelText('姓名')).toHaveValue('Test User');
    });

    it('預填現有 Email', () => {
      renderModal();
      expect(screen.getByLabelText('Email')).toHaveValue('test@cdmp.test');
    });

    it('渲染儲存與取消按鈕', () => {
      renderModal();
      expect(screen.getByRole('button', { name: '儲存' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '取消' })).toBeInTheDocument();
    });

    it('不包含密碼或角色欄位', () => {
      renderModal();
      expect(screen.queryByLabelText('密碼')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('角色')).not.toBeInTheDocument();
    });
  });

  describe('前端欄位驗證', () => {
    it('姓名清空後提交顯示錯誤', async () => {
      const user = userEvent.setup();
      renderModal();
      const nameInput = screen.getByLabelText('姓名');
      await user.clear(nameInput);
      await user.click(screen.getByRole('button', { name: '儲存' }));
      expect(await screen.findByText('請輸入姓名（1-100 個字元）')).toBeInTheDocument();
    });

    it('Email 清空後提交顯示錯誤', async () => {
      const user = userEvent.setup();
      renderModal();
      const emailInput = screen.getByLabelText('Email');
      await user.clear(emailInput);
      await user.click(screen.getByRole('button', { name: '儲存' }));
      expect(await screen.findByText('請輸入有效的 Email 地址')).toBeInTheDocument();
    });

    it('Email 格式錯誤顯示錯誤', async () => {
      const user = userEvent.setup();
      renderModal();
      const emailInput = screen.getByLabelText('Email');
      await user.clear(emailInput);
      await user.type(emailInput, 'not-valid');
      await user.click(screen.getByRole('button', { name: '儲存' }));
      await waitFor(() => {
        expect(screen.getByText('請輸入有效的 Email 地址')).toBeInTheDocument();
      });
    });
  });

  describe('成功提交', () => {
    it('成功更新帳號後呼叫 onSuccess', async () => {
      const user = userEvent.setup();
      mockedUpdateAccount.mockResolvedValue({
        id: 'user-uuid-1',
        name: 'Updated Name',
        email: 'test@cdmp.test',
        role: 'user',
        is_sales_manager: false,

        business_role: null,
        employee_no: null,
        status: 'active',
        created_at: '2025-01-01T00:00:00.000Z',
        updated_at: '2025-06-01T00:00:00.000Z',
      });
      const { onSuccess } = renderModal();

      const nameInput = screen.getByLabelText('姓名');
      await user.clear(nameInput);
      await user.type(nameInput, 'Updated Name');
      await user.click(screen.getByRole('button', { name: '儲存' }));

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalled();
      });
    });

    it('提交時呼叫 updateAccount API 含正確參數', async () => {
      const user = userEvent.setup();
      mockedUpdateAccount.mockResolvedValue({
        id: 'user-uuid-1',
        name: 'New Name',
        email: 'new@cdmp.test',
        role: 'user',
        is_sales_manager: false,

        business_role: null,
        employee_no: null,
        status: 'active',
        created_at: '2025-01-01T00:00:00.000Z',
        updated_at: '2025-06-01T00:00:00.000Z',
      });
      renderModal();

      const nameInput = screen.getByLabelText('姓名');
      const emailInput = screen.getByLabelText('Email');
      await user.clear(nameInput);
      await user.type(nameInput, 'New Name');
      await user.clear(emailInput);
      await user.type(emailInput, 'new@cdmp.test');
      await user.click(screen.getByRole('button', { name: '儲存' }));

      await waitFor(() => {
        // F113：payload 額外攜帶 employeeNo（此帳號原值為 null → 欄位預填 ''，未更動即送 ''）
        expect(mockedUpdateAccount).toHaveBeenCalledWith('user-uuid-1', {
          name: 'New Name',
          email: 'new@cdmp.test',
          employeeNo: '',
        });
      });
    });
  });

  // ===== F113 / US-179：員工編號（選填登入識別碼）FE-EDIT =====
  describe('F113 員工編號（FE-EDIT）', () => {
    const okResponse = {
      id: 'user-uuid-1',
      name: 'Test User',
      email: 'test@cdmp.test',
      role: 'user' as const,
      is_sales_manager: false,
      business_role: null,
      employee_no: null,
      status: 'active' as const,
      created_at: '2025-01-01T00:00:00.000Z',
      updated_at: '2025-06-01T00:00:00.000Z',
    };

    // TS-F113-FE-EDIT-001：預填既有值
    it('開啟時員工編號欄位預填既有值', () => {
      renderModal({ account: { ...mockAccount, employee_no: 'E10001' } });
      expect(screen.getByLabelText('員工編號')).toHaveValue('E10001');
    });

    // TS-F113-FE-EDIT-001（null）：null → 欄位為空
    it('既有值為 null → 欄位為空', () => {
      renderModal({ account: { ...mockAccount, employee_no: null } });
      expect(screen.getByLabelText('員工編號')).toHaveValue('');
    });

    // TS-F113-FE-EDIT-002：變更為新值 → payload 含新值
    it('變更為新值送出 → payload 含新員工編號', async () => {
      const user = userEvent.setup();
      mockedUpdateAccount.mockResolvedValue({ ...okResponse, employee_no: 'E30001' });
      renderModal({ account: { ...mockAccount, employee_no: null } });

      await user.type(screen.getByLabelText('員工編號'), 'E30001');
      await user.click(screen.getByRole('button', { name: '儲存' }));

      await waitFor(() => {
        expect(mockedUpdateAccount).toHaveBeenCalledWith(
          'user-uuid-1',
          expect.objectContaining({ employeeNo: 'E30001' }),
        );
      });
    });

    // TS-F113-FE-EDIT-003：清空欄位 → 送出空字串（移除）
    it('清空既有值送出 → payload employeeNo 為空字串', async () => {
      const user = userEvent.setup();
      mockedUpdateAccount.mockResolvedValue(okResponse);
      renderModal({ account: { ...mockAccount, employee_no: 'E10001' } });

      const empInput = screen.getByLabelText('員工編號');
      await user.clear(empInput);
      await user.click(screen.getByRole('button', { name: '儲存' }));

      await waitFor(() => {
        expect(mockedUpdateAccount).toHaveBeenCalledWith(
          'user-uuid-1',
          expect.objectContaining({ employeeNo: '' }),
        );
      });
    });

    // TS-F113-FE-EDIT-004：保留原值、僅改其他欄位 → 成功、不觸發 409
    it('保留原員工編號、僅改姓名 → 成功送出原值', async () => {
      const user = userEvent.setup();
      mockedUpdateAccount.mockResolvedValue({ ...okResponse, employee_no: 'E12345' });
      renderModal({ account: { ...mockAccount, employee_no: 'E12345' } });

      const nameInput = screen.getByLabelText('姓名');
      await user.clear(nameInput);
      await user.type(nameInput, '新姓名');
      await user.click(screen.getByRole('button', { name: '儲存' }));

      await waitFor(() => {
        expect(mockedUpdateAccount).toHaveBeenCalledWith(
          'user-uuid-1',
          expect.objectContaining({ name: '新姓名', employeeNo: 'E12345' }),
        );
      });
    });

    // TS-F113-FE-EDIT-005：變更為他人已用值 → 409 inline
    it('409 ACCOUNT_EMPLOYEE_NO_EXISTS → inline「此員工編號已被使用」，Modal 不關閉', async () => {
      const user = userEvent.setup();
      mockedUpdateAccount.mockRejectedValue({
        response: {
          status: 409,
          data: { error: 'ACCOUNT_EMPLOYEE_NO_EXISTS', message: '此員工編號已被使用' },
        },
      });
      const { onSuccess } = renderModal({ account: { ...mockAccount, employee_no: null } });

      await user.type(screen.getByLabelText('員工編號'), 'E12345');
      await user.click(screen.getByRole('button', { name: '儲存' }));

      expect(await screen.findByText('此員工編號已被使用')).toBeInTheDocument();
      expect(onSuccess).not.toHaveBeenCalled();
    });
  });

  describe('伺服器錯誤處理', () => {
    it('409 重複 Email 顯示欄位錯誤', async () => {
      const user = userEvent.setup();
      mockedUpdateAccount.mockRejectedValue({
        response: { status: 409, data: { error: 'ACCOUNT_EMAIL_IN_USE', message: '此 Email 已被使用' } },
      });
      renderModal();

      await user.click(screen.getByRole('button', { name: '儲存' }));

      expect(await screen.findByText('此 Email 已被使用')).toBeInTheDocument();
    });

    it('404 帳號不存在顯示通用錯誤', async () => {
      const user = userEvent.setup();
      mockedUpdateAccount.mockRejectedValue({
        response: { status: 404, data: { error: 'ACCOUNT_NOT_FOUND', message: '找不到指定的帳號' } },
      });
      renderModal();

      await user.click(screen.getByRole('button', { name: '儲存' }));

      expect(await screen.findByText('找不到指定的帳號')).toBeInTheDocument();
    });

    it('未知錯誤顯示通用錯誤訊息', async () => {
      const user = userEvent.setup();
      mockedUpdateAccount.mockRejectedValue({
        response: { status: 500 },
      });
      renderModal();

      await user.click(screen.getByRole('button', { name: '儲存' }));

      expect(await screen.findByText('發生未知錯誤，請稍後再試。')).toBeInTheDocument();
    });
  });

  describe('互動行為', () => {
    it('送出後按鈕顯示 loading 狀態', async () => {
      const user = userEvent.setup();
      mockedUpdateAccount.mockImplementation(() => new Promise(() => {}));
      renderModal();

      await user.click(screen.getByRole('button', { name: '儲存' }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: '儲存中...' })).toBeDisabled();
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
  });

  // ===== F006a / AD-E07 v3.0: business_role read-only role badge =====
  describe('F006a / AD-E07 v3.0: 角色 read-only RoleBadge', () => {
    it('Admin → 顯示「系統管理者」RoleBadge', () => {
      renderModal({
        account: { ...mockAccount, role: 'admin', business_role: null },
      });
      const wrap = screen.getByTestId('edit-role-wrap');
      expect(wrap).toBeInTheDocument();
      expect(screen.getByTestId('role-badge-admin')).toHaveTextContent('系統管理者');
    });

    it('Director → 顯示「業務部長」RoleBadge', () => {
      renderModal({
        account: { ...mockAccount, role: 'user', business_role: 'director' },
      });
      expect(screen.getByTestId('role-badge-director')).toHaveTextContent('業務部長');
    });

    it('Section chief → 顯示「業務處長」RoleBadge', () => {
      renderModal({
        account: { ...mockAccount, role: 'user', business_role: 'section_chief' },
      });
      expect(screen.getByTestId('role-badge-section_chief')).toHaveTextContent('業務處長');
    });

    it('一般使用者 (role=user, business_role=null) → 顯示「一般使用者」RoleBadge', () => {
      renderModal({
        account: { ...mockAccount, role: 'user', business_role: null },
      });
      expect(screen.getByTestId('role-badge-user')).toHaveTextContent('一般使用者');
    });

    it('chip 旁顯示引導文字「需變更請至變更角色 dialog」', () => {
      renderModal({
        account: { ...mockAccount, role: 'user', business_role: 'director' },
      });
      expect(screen.getByText(/需變更請至變更角色 dialog/)).toBeInTheDocument();
    });

    it('提交時 PUT request body 不含 business_role 欄位（只送 name/email）', async () => {
      const user = userEvent.setup();
      mockedUpdateAccount.mockResolvedValue({
        id: 'user-uuid-1',
        name: 'Updated',
        email: 'test@cdmp.test',
        role: 'user',
        is_sales_manager: true,
        business_role: 'director',
        employee_no: null,
        status: 'active',
        created_at: '2025-01-01T00:00:00.000Z',
        updated_at: '2025-06-01T00:00:00.000Z',
      });
      renderModal({
        account: { ...mockAccount, role: 'user', business_role: 'director' },
      });

      await user.click(screen.getByRole('button', { name: '儲存' }));

      await waitFor(() => {
        const sentBody = mockedUpdateAccount.mock.calls[0][1];
        expect(sentBody).not.toHaveProperty('business_role');
        expect(sentBody).not.toHaveProperty('isSalesManager');
        expect(sentBody).toHaveProperty('name');
        expect(sentBody).toHaveProperty('email');
      });
    });
  });
});
