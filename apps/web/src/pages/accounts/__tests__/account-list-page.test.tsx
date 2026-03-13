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

      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

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
});
