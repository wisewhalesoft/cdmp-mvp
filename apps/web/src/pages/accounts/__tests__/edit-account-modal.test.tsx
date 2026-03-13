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
        expect(mockedUpdateAccount).toHaveBeenCalledWith('user-uuid-1', {
          name: 'New Name',
          email: 'new@cdmp.test',
        });
      });
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
});
