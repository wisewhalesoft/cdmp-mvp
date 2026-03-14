import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { AccountListPage } from '../account-list-page';
import * as accountsApi from '@/api/accounts';
import * as authStore from '@/stores/auth-store';
import type { AccountListResponse } from '@cdmp/shared';

vi.mock('@/api/accounts');
vi.mock('@/api/auth', () => ({
  logout: vi.fn().mockResolvedValue({}),
}));
vi.mock('@/stores/auth-store');

const mockedGetAccounts = vi.mocked(accountsApi.getAccounts);
const mockedCreateAccount = vi.mocked(accountsApi.createAccount);
const mockedUpdateAccount = vi.mocked(accountsApi.updateAccount);
const mockedUpdateAccountStatus = vi.mocked(accountsApi.updateAccountStatus);
const mockedUpdateAccountRole = vi.mocked(accountsApi.updateAccountRole);
const mockedAdminResetPassword = vi.mocked(accountsApi.adminResetPassword);
const mockedGetUser = vi.mocked(authStore.getUser);
const mockedClearAuth = vi.mocked(authStore.clearAuth);

const mockAccountsResponse: AccountListResponse = {
  data: [
    {
      id: '1',
      name: 'Test Admin',
      email: 'admin@cdmp.test',
      role: 'admin',
      status: 'active',
      created_at: '2025-03-01T00:00:00.000Z',
    },
    {
      id: '2',
      name: 'Normal User',
      email: 'user@cdmp.test',
      role: 'user',
      status: 'active',
      created_at: '2025-02-15T00:00:00.000Z',
    },
    {
      id: '3',
      name: 'Disabled User',
      email: 'disabled@cdmp.test',
      role: 'user',
      status: 'disabled',
      created_at: '2025-01-10T00:00:00.000Z',
    },
  ],
  total: 3,
  page: 1,
  limit: 20,
};

const emptyResponse: AccountListResponse = {
  data: [],
  total: 0,
  page: 1,
  limit: 20,
};

function setupMocks(response: AccountListResponse = mockAccountsResponse) {
  mockedGetAccounts.mockResolvedValue(response);
  mockedGetUser.mockReturnValue({
    id: '1',
    name: 'Admin User',
    email: 'admin@cdmp.test',
    role: 'admin',
  });
  mockedClearAuth.mockImplementation(() => {});
}

describe('AccountListPage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setupMocks();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /** Render and advance timers past debounce so initial data loads */
  async function renderAndLoad(response?: AccountListResponse) {
    if (response) {
      mockedGetAccounts.mockResolvedValue(response);
    }

    render(
      <BrowserRouter>
        <AccountListPage />
      </BrowserRouter>,
    );

    // Flush initial debounce + async fetch
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
  }

  describe('渲染測試', () => {
    it('顯示搜尋框', async () => {
      await renderAndLoad();
      expect(screen.getByPlaceholderText('搜尋姓名或 Email')).toBeInTheDocument();
    });

    it('顯示角色篩選下拉', async () => {
      await renderAndLoad();
      expect(screen.getByDisplayValue('全部角色')).toBeInTheDocument();
    });

    it('顯示狀態篩選下拉', async () => {
      await renderAndLoad();
      expect(screen.getByDisplayValue('全部狀態')).toBeInTheDocument();
    });

    it('顯示建立帳號按鈕', async () => {
      await renderAndLoad();
      expect(screen.getByText('建立帳號')).toBeInTheDocument();
    });
  });

  describe('資料載入', () => {
    it('頁面載入後呼叫 getAccounts', async () => {
      await renderAndLoad();
      expect(mockedGetAccounts).toHaveBeenCalledTimes(1);
    });

    it('顯示帳號表格含必要欄位', async () => {
      await renderAndLoad();
      expect(screen.getByText('admin@cdmp.test')).toBeInTheDocument();
      expect(screen.getByText('Normal User')).toBeInTheDocument();
      expect(screen.getByText('user@cdmp.test')).toBeInTheDocument();
      expect(screen.getByText('Disabled User')).toBeInTheDocument();
    });

    it('顯示角色 Badge — Admin 與 User', async () => {
      await renderAndLoad();
      const adminBadges = screen.getAllByText('Admin');
      expect(adminBadges.length).toBeGreaterThanOrEqual(1);
      const userBadges = screen.getAllByText('User');
      expect(userBadges.length).toBeGreaterThanOrEqual(1);
    });

    it('顯示狀態 Badge — 啟用中與已停用', async () => {
      await renderAndLoad();
      expect(screen.getAllByText('啟用中').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('已停用').length).toBeGreaterThanOrEqual(1);
    });

    it('顯示建立日期', async () => {
      await renderAndLoad();
      expect(screen.getByText('2025-03-01')).toBeInTheDocument();
    });
  });

  describe('搜尋功能', () => {
    it('輸入搜尋後觸發 API 呼叫含 search 參數', async () => {
      await renderAndLoad();

      const searchInput = screen.getByPlaceholderText('搜尋姓名或 Email');
      // Use fireEvent instead of userEvent to avoid fake timer conflicts
      fireEvent.change(searchInput, { target: { value: 'admin' } });

      // Advance past debounce
      await act(async () => {
        await vi.advanceTimersByTimeAsync(400);
      });

      expect(mockedGetAccounts).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'admin', page: 1 }),
      );
    });
  });

  describe('篩選功能', () => {
    it('選擇角色篩選後觸發 API 呼叫含 role 參數', async () => {
      await renderAndLoad();

      const roleSelect = screen.getByDisplayValue('全部角色');
      fireEvent.change(roleSelect, { target: { value: 'admin' } });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(400);
      });

      expect(mockedGetAccounts).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'admin', page: 1 }),
      );
    });

    it('選擇狀態篩選後觸發 API 呼叫含 status 參數', async () => {
      await renderAndLoad();

      const statusSelect = screen.getByDisplayValue('全部狀態');
      fireEvent.change(statusSelect, { target: { value: 'disabled' } });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(400);
      });

      expect(mockedGetAccounts).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'disabled', page: 1 }),
      );
    });
  });

  describe('空狀態', () => {
    it('無結果時顯示找不到帳號', async () => {
      await renderAndLoad(emptyResponse);
      expect(screen.getByText('找不到帳號')).toBeInTheDocument();
    });

    it('空狀態含建議調整篩選條件提示', async () => {
      await renderAndLoad(emptyResponse);
      expect(screen.getByText(/調整篩選條件/)).toBeInTheDocument();
    });
  });

  describe('分頁', () => {
    it('顯示分頁資訊', async () => {
      await renderAndLoad();
      expect(screen.getByText(/第 1 頁/)).toBeInTheDocument();
    });

    it('點擊下一頁觸發 page+1 API 呼叫', async () => {
      await renderAndLoad({ ...mockAccountsResponse, total: 25 });

      const nextButton = screen.getByRole('button', { name: /下一頁/ });
      fireEvent.click(nextButton);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(400);
      });

      expect(mockedGetAccounts).toHaveBeenCalledWith(
        expect.objectContaining({ page: 2 }),
      );
    });

    it('第1頁時上一頁按鈕停用', async () => {
      await renderAndLoad();
      const prevButton = screen.getByRole('button', { name: /上一頁/ });
      expect(prevButton).toBeDisabled();
    });

    it('最後一頁時下一頁按鈕停用', async () => {
      await renderAndLoad();
      const nextButton = screen.getByRole('button', { name: /下一頁/ });
      expect(nextButton).toBeDisabled();
    });
  });

  describe('Loading 狀態', () => {
    it('載入中顯示 loading 狀態', async () => {
      let resolvePromise: (v: AccountListResponse) => void;
      mockedGetAccounts.mockReturnValue(
        new Promise((resolve) => {
          resolvePromise = resolve;
        }),
      );

      render(
        <BrowserRouter>
          <AccountListPage />
        </BrowserRouter>,
      );

      // Advance past debounce to trigger fetch, but don't resolve yet
      await act(async () => {
        await vi.advanceTimersByTimeAsync(400);
      });

      expect(screen.getByText(/載入中/)).toBeInTheDocument();

      // Resolve to clean up
      await act(async () => {
        resolvePromise!(emptyResponse);
      });
    });
  });

  describe('建立帳號整合', () => {
    it('建立帳號成功後刷新清單', async () => {
      mockedCreateAccount.mockResolvedValue({
        id: '99',
        name: 'New Account',
        email: 'new@cdmp.test',
        role: 'user',
        status: 'active',
        created_at: '2025-04-01T00:00:00.000Z',
      });

      userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      render(
        <BrowserRouter>
          <AccountListPage />
        </BrowserRouter>,
      );

      // Wait for initial load
      await act(async () => {
        await vi.advanceTimersByTimeAsync(400);
      });

      const initialCalls = mockedGetAccounts.mock.calls.length;

      // Open modal
      fireEvent.click(screen.getByText('建立帳號'));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(screen.getByLabelText('姓名')).toBeInTheDocument();

      // Fill form using fireEvent for reliability with fake timers
      fireEvent.change(screen.getByLabelText('姓名'), { target: { value: 'New Account' } });
      fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@cdmp.test' } });
      fireEvent.change(screen.getByLabelText('密碼'), { target: { value: 'P@ssw0rd123' } });

      // Submit — modal submit button text is "建立"
      const submitButtons = screen.getAllByRole('button', { name: '建立' });
      // The last "建立" button is the modal submit (first one is the toolbar button with icon)
      fireEvent.click(submitButtons[submitButtons.length - 1]);

      // Flush async operations
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });

      // After success, getAccounts should be called again (refresh)
      expect(mockedGetAccounts.mock.calls.length).toBeGreaterThan(initialCalls);
    });
  });

  describe('停用／啟用帳號整合', () => {
    it('active 帳號顯示「停用」按鈕', async () => {
      await renderAndLoad();
      // accounts[1] (Normal User) is active and not the current user (id '1')
      const disableButtons = screen.getAllByText('停用');
      expect(disableButtons.length).toBeGreaterThanOrEqual(1);
    });

    it('disabled 帳號顯示「啟用」按鈕', async () => {
      await renderAndLoad();
      // accounts[2] (Disabled User) has status 'disabled'
      expect(screen.getByText('啟用')).toBeInTheDocument();
    });

    it('當前 Admin 自己的帳號停用按鈕為 disabled 狀態', async () => {
      await renderAndLoad();
      // Current user id='1', accounts[0] id='1' — self-disable should be disabled
      const disableButtons = screen.getAllByText('停用');
      // The first "停用" in the table should be the self-disable (disabled) button
      const selfDisableBtn = disableButtons[0];
      expect(selfDisableBtn).toBeDisabled();
      expect(selfDisableBtn).toHaveAttribute('title', '無法停用自己的帳號');
    });

    it('點擊停用按鈕彈出確認對話框', async () => {
      await renderAndLoad();
      // Click the disable button for Normal User (second row, not self)
      const disableButtons = screen.getAllByText('停用');
      // Find the enabled one (not the self-disable)
      const enabledDisableBtn = disableButtons.find((btn) => !btn.hasAttribute('disabled'));
      fireEvent.click(enabledDisableBtn!);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(screen.getByText('停用帳號')).toBeInTheDocument();
      expect(screen.getByText(/您確定要停用 Normal User 的帳號嗎/)).toBeInTheDocument();
    });

    it('確認停用後呼叫 updateAccountStatus API', async () => {
      mockedUpdateAccountStatus.mockResolvedValue({
        id: '2',
        name: 'Normal User',
        email: 'user@cdmp.test',
        role: 'user',
        status: 'disabled',
        updated_at: '2025-06-01T00:00:00.000Z',
      });

      await renderAndLoad();

      const disableButtons = screen.getAllByText('停用');
      const enabledDisableBtn = disableButtons.find((btn) => !btn.hasAttribute('disabled'));
      fireEvent.click(enabledDisableBtn!);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      // Confirm in dialog
      const dialogConfirmButtons = screen.getAllByRole('button', { name: '停用' });
      // The dialog confirm button is the last one (inside dialog)
      fireEvent.click(dialogConfirmButtons[dialogConfirmButtons.length - 1]);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });

      expect(mockedUpdateAccountStatus).toHaveBeenCalledWith('2', { status: 'disabled' });
    });

    it('點擊啟用按鈕彈出確認對話框', async () => {
      await renderAndLoad();

      fireEvent.click(screen.getByText('啟用'));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(screen.getByText('啟用帳號')).toBeInTheDocument();
      expect(screen.getByText(/確定要啟用 Disabled User 的帳號嗎/)).toBeInTheDocument();
    });

    it('確認啟用後呼叫 updateAccountStatus API', async () => {
      mockedUpdateAccountStatus.mockResolvedValue({
        id: '3',
        name: 'Disabled User',
        email: 'disabled@cdmp.test',
        role: 'user',
        status: 'active',
        updated_at: '2025-06-01T00:00:00.000Z',
      });

      await renderAndLoad();

      fireEvent.click(screen.getByText('啟用'));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      // Confirm in dialog — the "啟用" button inside dialog
      const enableButtons = screen.getAllByRole('button', { name: '啟用' });
      fireEvent.click(enableButtons[enableButtons.length - 1]);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });

      expect(mockedUpdateAccountStatus).toHaveBeenCalledWith('3', { status: 'active' });
    });
  });

  describe('變更角色整合 (F008)', () => {
    it('顯示「變更角色」按鈕', async () => {
      await renderAndLoad();
      const roleButtons = screen.getAllByText('變更角色');
      expect(roleButtons.length).toBeGreaterThanOrEqual(1);
    });

    it('點擊「變更角色」按鈕開啟角色變更對話框', async () => {
      await renderAndLoad();
      const roleButtons = screen.getAllByText('變更角色');
      fireEvent.click(roleButtons[0]);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(screen.getByText('變更角色', { selector: 'h3' })).toBeInTheDocument();
      expect(screen.getByText('目前角色')).toBeInTheDocument();
    });

    it('對話框顯示正確的帳號名稱', async () => {
      await renderAndLoad();
      // Click role change for the second row (Normal User)
      const roleButtons = screen.getAllByText('變更角色');
      fireEvent.click(roleButtons[1]);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      // The dialog shows the account name next to "帳號名稱" label
      const label = screen.getByText('帳號名稱');
      const nameText = label.parentElement?.querySelector('p');
      expect(nameText?.textContent).toBe('Normal User');
    });

    it('確認變更後呼叫 updateAccountRole API 並刷新清單', async () => {
      mockedUpdateAccountRole.mockResolvedValue({
        id: '2',
        name: 'Normal User',
        email: 'user@cdmp.test',
        role: 'admin',
        status: 'active',
        updated_at: '2025-06-01T00:00:00.000Z',
      });

      await renderAndLoad();

      const initialCalls = mockedGetAccounts.mock.calls.length;

      // Click role change for Normal User (second row, role=user)
      const roleButtons = screen.getAllByText('變更角色');
      fireEvent.click(roleButtons[1]);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      // Confirm in dialog — click "確認變更"
      fireEvent.click(screen.getByRole('button', { name: '確認變更' }));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });

      expect(mockedUpdateAccountRole).toHaveBeenCalledWith('2', { role: 'admin' });
      // List should be refreshed
      expect(mockedGetAccounts.mock.calls.length).toBeGreaterThan(initialCalls);
    });

    it('取消對話框不呼叫 API', async () => {
      await renderAndLoad();

      const roleButtons = screen.getAllByText('變更角色');
      fireEvent.click(roleButtons[0]);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      // Click cancel
      fireEvent.click(screen.getByRole('button', { name: '取消' }));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(mockedUpdateAccountRole).not.toHaveBeenCalled();
    });
  });

  describe('編輯帳號整合', () => {
    it('點擊編輯按鈕後顯示編輯 Modal', async () => {
      await renderAndLoad();

      // Find all edit buttons — one per row
      const editButtons = screen.getAllByText('編輯');
      fireEvent.click(editButtons[0]);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(screen.getByText('編輯帳號')).toBeInTheDocument();
    });

    it('編輯成功後刷新清單', async () => {
      mockedUpdateAccount.mockResolvedValue({
        id: '1',
        name: 'Updated Admin',
        email: 'admin@cdmp.test',
        role: 'admin',
        status: 'active',
        created_at: '2025-03-01T00:00:00.000Z',
        updated_at: '2025-06-01T00:00:00.000Z',
      });

      await renderAndLoad();

      const initialCalls = mockedGetAccounts.mock.calls.length;

      // Click edit on first row
      const editButtons = screen.getAllByText('編輯');
      fireEvent.click(editButtons[0]);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      // Modal should be open with prefilled data
      expect(screen.getByText('編輯帳號')).toBeInTheDocument();

      // Change name
      const nameInput = screen.getByLabelText('姓名');
      fireEvent.change(nameInput, { target: { value: 'Updated Admin' } });

      // Submit
      fireEvent.click(screen.getByRole('button', { name: '儲存' }));

      // Flush async
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });

      // After success, getAccounts should be called again (refresh)
      expect(mockedGetAccounts.mock.calls.length).toBeGreaterThan(initialCalls);
    });
  });

  describe('重設密碼整合 (F010)', () => {
    it('其他帳號顯示可點擊的「重設密碼」按鈕', async () => {
      await renderAndLoad();
      const resetButtons = screen.getAllByText('重設密碼');
      // At least one should be enabled (for non-self accounts)
      const enabledResetBtns = resetButtons.filter((btn) => !btn.hasAttribute('disabled'));
      expect(enabledResetBtns.length).toBeGreaterThanOrEqual(1);
    });

    it('自己的帳號「重設密碼」按鈕為 disabled', async () => {
      await renderAndLoad();
      // Current user id='1', first account id='1'
      // All "重設密碼" buttons — find the one in the self row
      const rows = screen.getAllByRole('row');
      // Row 0 is header; row 1 is account[0] (id='1', self)
      const selfRow = rows[1];
      const selfResetBtn = selfRow.querySelector('button[disabled]');
      // The self row should have a disabled button with title hint
      const resetBtns = selfRow.querySelectorAll('button');
      const disabledResetBtn = Array.from(resetBtns).find(
        (btn) => btn.textContent === '重設密碼' && btn.hasAttribute('disabled'),
      );
      expect(disabledResetBtn).toBeTruthy();
    });

    it('點擊「重設密碼」按鈕開啟重設密碼對話框', async () => {
      await renderAndLoad();
      const resetButtons = screen.getAllByText('重設密碼');
      const enabledResetBtn = resetButtons.find((btn) => !btn.hasAttribute('disabled'));
      fireEvent.click(enabledResetBtn!);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(screen.getByText('重設使用者密碼')).toBeInTheDocument();
    });

    it('重設成功後刷新清單', async () => {
      mockedAdminResetPassword.mockResolvedValue({
        message: '密碼已重設，使用者需以新密碼重新登入',
      });

      await renderAndLoad();

      const initialCalls = mockedGetAccounts.mock.calls.length;

      const resetButtons = screen.getAllByText('重設密碼');
      const enabledResetBtn = resetButtons.find((btn) => !btn.hasAttribute('disabled'));
      fireEvent.click(enabledResetBtn!);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      // Fill in passwords using fireEvent
      const newPasswordInput = screen.getByLabelText('新密碼');
      const confirmPasswordInput = screen.getByLabelText('確認密碼');
      fireEvent.change(newPasswordInput, { target: { value: 'NewPass99' } });
      fireEvent.change(confirmPasswordInput, { target: { value: 'NewPass99' } });

      // Submit — click the dialog's submit button (last one with name "重設密碼")
      const resetBtns = screen.getAllByRole('button', { name: '重設密碼' });
      fireEvent.click(resetBtns[resetBtns.length - 1]);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });

      expect(mockedAdminResetPassword).toHaveBeenCalledWith('2', { newPassword: 'NewPass99' });
      expect(mockedGetAccounts.mock.calls.length).toBeGreaterThan(initialCalls);
    });
  });
});
