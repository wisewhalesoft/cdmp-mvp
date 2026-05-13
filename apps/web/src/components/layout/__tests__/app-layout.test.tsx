import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AppLayout } from '../app-layout';
import * as authStore from '@/stores/auth-store';
import * as authApi from '@/api/auth';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('@/stores/auth-store', async () => {
  const actual = await vi.importActual('@/stores/auth-store');
  return { ...actual, getUser: vi.fn(), clearAuth: vi.fn() };
});

vi.mock('@/api/auth', async () => {
  const actual = await vi.importActual('@/api/auth');
  return { ...actual, logout: vi.fn() };
});

const mockedGetUser = vi.mocked(authStore.getUser);
const mockedClearAuth = vi.mocked(authStore.clearAuth);
const mockedLogout = vi.mocked(authApi.logout);

describe('AppLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedLogout.mockResolvedValue({ message: '登出成功' });
  });

  it('業務主管登入後 AppLayout 顯示 Customer 360 + 客戶名單分派 sidebar + header + main slot', () => {
    mockedGetUser.mockReturnValue({
      id: 'm1',
      name: 'Manager',
      email: 'manager@cdmp.test',
      role: 'user',
      isSalesManager: true,
    });
    render(
      <MemoryRouter>
        <AppLayout title="測試頁">
          <div data-testid="main-content">Main Slot Content</div>
        </AppLayout>
      </MemoryRouter>,
    );
    // sidebar
    expect(screen.getByText('Customer 360')).toBeInTheDocument();
    expect(screen.getByText('客戶名單分派')).toBeInTheDocument();
    // header
    expect(screen.getByText('Manager')).toBeInTheDocument();
    expect(screen.getByTestId('sales-manager-badge')).toBeInTheDocument();
    // main slot
    expect(screen.getByTestId('main-content')).toBeInTheDocument();
  });

  it('一般使用者：sidebar 僅 Customer 360；header 不顯示 Sales Manager Badge', () => {
    mockedGetUser.mockReturnValue({
      id: 'u1',
      name: '一般使用者',
      email: 'user@cdmp.test',
      role: 'user',
      isSalesManager: false,
    });
    const { container } = render(
      <MemoryRouter>
        <AppLayout title="測試頁">
          <div>content</div>
        </AppLayout>
      </MemoryRouter>,
    );
    expect(screen.getByText('Customer 360')).toBeInTheDocument();
    expect(container.textContent).not.toContain('客戶名單分派');
    expect(screen.queryByTestId('sales-manager-badge')).toBeNull();
  });

  it('admin：sidebar 顯示完整管理者群組；header 不顯示 Sales Manager Badge', () => {
    mockedGetUser.mockReturnValue({
      id: 'a1',
      name: 'Admin User',
      email: 'admin@cdmp.test',
      role: 'admin',
      isSalesManager: false,
    });
    render(
      <MemoryRouter>
        <AppLayout title="管理頁">
          <div>content</div>
        </AppLayout>
      </MemoryRouter>,
    );
    expect(screen.getByText('帳號管理')).toBeInTheDocument();
    expect(screen.queryByTestId('sales-manager-badge')).toBeNull();
  });

  it('header 顯示 title prop', () => {
    mockedGetUser.mockReturnValue({
      id: 'u1',
      name: 'User',
      email: 'user@cdmp.test',
      role: 'user',
      isSalesManager: false,
    });
    render(
      <MemoryRouter>
        <AppLayout title="個人資訊">
          <div>content</div>
        </AppLayout>
      </MemoryRouter>,
    );
    expect(screen.getByText('個人資訊')).toBeInTheDocument();
  });

  it('點擊登出 → 呼叫 logout API + clearAuth + 導向 /login', async () => {
    mockedGetUser.mockReturnValue({
      id: 'u1',
      name: 'User',
      email: 'user@cdmp.test',
      role: 'user',
      isSalesManager: false,
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AppLayout title="頁">
          <div>content</div>
        </AppLayout>
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: /登出/ }));
    await waitFor(() => {
      expect(mockedLogout).toHaveBeenCalled();
      expect(mockedClearAuth).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith('/login');
    });
  });

  it('登出 API 失敗仍清除 session 並導向 /login', async () => {
    mockedGetUser.mockReturnValue({
      id: 'u1',
      name: 'User',
      email: 'user@cdmp.test',
      role: 'user',
      isSalesManager: false,
    });
    mockedLogout.mockRejectedValue(new Error('Network'));
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AppLayout title="頁">
          <div>content</div>
        </AppLayout>
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: /登出/ }));
    await waitFor(() => {
      expect(mockedClearAuth).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith('/login');
    });
  });
});
