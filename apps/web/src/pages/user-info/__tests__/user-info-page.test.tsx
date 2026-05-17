import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { UserInfoPage } from '../user-info-page';
import * as authStore from '@/stores/auth-store';
import * as authApi from '@/api/auth';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('@/stores/auth-store', async () => {
  const actual = await vi.importActual('@/stores/auth-store');
  return {
    ...actual,
    getUser: vi.fn(),
    clearAuth: vi.fn(),
    getBusinessRole: vi.fn(),
  };
});

vi.mock('@/api/auth', async () => {
  const actual = await vi.importActual('@/api/auth');
  return { ...actual, logout: vi.fn() };
});

const mockedGetUser = vi.mocked(authStore.getUser);
const mockedClearAuth = vi.mocked(authStore.clearAuth);
const mockedGetBusinessRole = vi.mocked(authStore.getBusinessRole);
const mockedLogout = vi.mocked(authApi.logout);

function renderPage(
  user: {
    id: string;
    name: string;
    email: string;
    role: 'admin' | 'user';
    isSalesManager?: boolean;
    businessRole?: 'director' | 'section_chief' | null;
  } = {
    id: 'user-1',
    name: '陳小美',
    email: 'user@cdmp.test',
    role: 'user',
  },
) {
  mockedGetUser.mockReturnValue(user);
  // 4 角色：admin/director/section_chief 視為「有業務權限」；否則為 null
  let br: 'director' | 'section_chief' | null = null;
  if (user.businessRole) br = user.businessRole;
  else if (user.isSalesManager === true) br = 'director';
  mockedGetBusinessRole.mockReturnValue(br);
  return render(
    <MemoryRouter>
      <UserInfoPage />
    </MemoryRouter>,
  );
}

describe('UserInfoPage（AD-E02-4-C：Profile 頁套用 AppLayout）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedLogout.mockResolvedValue({ message: '登出成功' });
  });

  it('套用 AppLayout — sidebar 與 header 共用元件存在', () => {
    renderPage();
    // sidebar 共用元件存在（CDMP 品牌標頭只在 AppSidebar 中）
    expect(screen.getByText('CDMP')).toBeInTheDocument();
    // sidebar 至少顯示 Customer 360（一般使用者基本入口）
    expect(screen.getByText('Customer 360')).toBeInTheDocument();
  });

  it('顯示 Profile 資訊 — 姓名、Email、角色', () => {
    renderPage();
    // 姓名出現於 header（一次）與 Profile row（一次）— 使用 getAllByText 確認皆存在
    expect(screen.getAllByText('陳小美').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('user@cdmp.test')).toBeInTheDocument();
  });

  it('業務主管 — sidebar 顯示客戶名單分派群組 + header 顯示 Sales Manager Badge', () => {
    renderPage({
      id: 'm1',
      name: 'Manager',
      email: 'manager@cdmp.test',
      role: 'user',
      isSalesManager: true,
    });
    expect(screen.getByText('客戶名單分派')).toBeInTheDocument();
    expect(screen.getByTestId('sales-manager-badge')).toBeInTheDocument();
  });

  it('一般使用者 — sidebar 無客戶名單分派群組', () => {
    const { container } = renderPage();
    expect(container.textContent).not.toContain('客戶名單分派');
  });

  it('admin — sidebar 顯示完整管理者群組', () => {
    renderPage({
      id: 'a1',
      name: 'Admin User',
      email: 'admin@cdmp.test',
      role: 'admin',
      isSalesManager: false,
    });
    expect(screen.getByText('帳號管理')).toBeInTheDocument();
    expect(screen.getByText('資料來源')).toBeInTheDocument();
  });

  it('不再顯示「目前尚無可用功能」訊息', () => {
    renderPage();
    expect(screen.queryByText('目前尚無可用功能')).toBeNull();
  });

  it('點擊登出 → 呼叫 logout API + clearAuth + 導向 /login', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: /登出/ }));
    await waitFor(() => {
      expect(mockedLogout).toHaveBeenCalled();
      expect(mockedClearAuth).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith('/login');
    });
  });

  it('登出 API 失敗 → 仍清除 Session 並導向 /login（降級處理）', async () => {
    mockedLogout.mockRejectedValue(new Error('Network Error'));
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: /登出/ }));
    await waitFor(() => {
      expect(mockedClearAuth).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith('/login');
    });
  });
});
