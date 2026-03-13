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
  return { ...actual, getUser: vi.fn(), clearAuth: vi.fn() };
});

vi.mock('@/api/auth', async () => {
  const actual = await vi.importActual('@/api/auth');
  return { ...actual, logout: vi.fn() };
});

const mockedGetUser = vi.mocked(authStore.getUser);
const mockedClearAuth = vi.mocked(authStore.clearAuth);
const mockedLogout = vi.mocked(authApi.logout);

function renderPage() {
  mockedGetUser.mockReturnValue({
    id: 'user-1',
    name: '陳小美',
    email: 'user@cdmp.test',
    role: 'user',
  });
  return render(
    <MemoryRouter>
      <UserInfoPage />
    </MemoryRouter>,
  );
}

describe('UserInfoPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedLogout.mockResolvedValue({ message: '登出成功' });
  });

  it('渲染「目前尚無可用功能」訊息', () => {
    renderPage();
    expect(screen.getByText('目前尚無可用功能')).toBeInTheDocument();
  });

  it('渲染「請聯絡您的管理員」文字', () => {
    renderPage();
    expect(screen.getByText('請聯絡您的管理員。')).toBeInTheDocument();
  });

  it('渲染登出按鈕', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /登出/ })).toBeInTheDocument();
  });

  // TS-F003-FE: 點擊登出 → 呼叫 logout API + clearAuth + 導向 /login
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

  // TS-F003-006: 登出 API 失敗降級處理 — 仍清除 Session 並導向 /login
  it('登出 API 失敗 → 仍清除 Session 並導向 /login（降級處理）', async () => {
    mockedLogout.mockRejectedValue(new Error('Network Error'));
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: /登出/ }));

    await waitFor(() => {
      expect(mockedLogout).toHaveBeenCalled();
      expect(mockedClearAuth).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith('/login');
    });
  });

  it('顯示使用者名稱', () => {
    renderPage();
    expect(screen.getByText('陳小美')).toBeInTheDocument();
  });
});
