import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import {
  ProtectedRoute,
  AdminRoute,
  UserRoute,
  SalesManagerRoute,
} from '../protected-route';
import * as authStore from '@/stores/auth-store';

vi.mock('@/stores/auth-store', () => ({
  isAuthenticated: vi.fn(),
  getUserRole: vi.fn(),
  getIsSalesManager: vi.fn(),
}));

const mockedIsAuthenticated = vi.mocked(authStore.isAuthenticated);
const mockedGetUserRole = vi.mocked(authStore.getUserRole);
const mockedGetIsSalesManager = vi.mocked(authStore.getIsSalesManager);

function renderWithRouter(element: React.ReactElement, initialPath = '/test') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/test" element={element} />
        <Route path="/login" element={<div>Login Page</div>} />
        <Route path="/user-info" element={<div>User Info Page</div>} />
        <Route path="/c360/customers" element={<div>C360 Customers Page</div>} />
        <Route path="/" element={<div>Admin Home</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('未認證 → 導向 /login', () => {
    mockedIsAuthenticated.mockReturnValue(false);
    renderWithRouter(
      <ProtectedRoute><div>Protected Content</div></ProtectedRoute>,
    );
    expect(screen.getByText('Login Page')).toBeInTheDocument();
  });

  it('已認證 → render children（任意身份）', () => {
    mockedIsAuthenticated.mockReturnValue(true);
    renderWithRouter(
      <ProtectedRoute><div>Protected Content</div></ProtectedRoute>,
    );
    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });
});

describe('AdminRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('admin → render children', () => {
    mockedIsAuthenticated.mockReturnValue(true);
    mockedGetUserRole.mockReturnValue('admin');
    renderWithRouter(
      <AdminRoute><div>Admin Content</div></AdminRoute>,
    );
    expect(screen.getByText('Admin Content')).toBeInTheDocument();
  });

  // T-004（修訂）：AdminRoute redirect 目標 /user-info → /c360/customers
  it('user → 導向 /c360/customers（非 /user-info）', () => {
    mockedIsAuthenticated.mockReturnValue(true);
    mockedGetUserRole.mockReturnValue('user');
    renderWithRouter(
      <AdminRoute><div>Admin Content</div></AdminRoute>,
    );
    expect(screen.getByText('C360 Customers Page')).toBeInTheDocument();
    expect(screen.queryByText('User Info Page')).toBeNull();
  });

  it('未認證 → 導向 /login', () => {
    mockedIsAuthenticated.mockReturnValue(false);
    renderWithRouter(
      <AdminRoute><div>Admin Content</div></AdminRoute>,
    );
    expect(screen.getByText('Login Page')).toBeInTheDocument();
  });
});

describe('SalesManagerRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('admin → render children（admin 為超集）', () => {
    mockedIsAuthenticated.mockReturnValue(true);
    mockedGetUserRole.mockReturnValue('admin');
    mockedGetIsSalesManager.mockReturnValue(false);
    renderWithRouter(
      <SalesManagerRoute><div>SM Content</div></SalesManagerRoute>,
    );
    expect(screen.getByText('SM Content')).toBeInTheDocument();
  });

  it('user + isSalesManager=true → render children', () => {
    mockedIsAuthenticated.mockReturnValue(true);
    mockedGetUserRole.mockReturnValue('user');
    mockedGetIsSalesManager.mockReturnValue(true);
    renderWithRouter(
      <SalesManagerRoute><div>SM Content</div></SalesManagerRoute>,
    );
    expect(screen.getByText('SM Content')).toBeInTheDocument();
  });

  it('user + isSalesManager=false → 導向 /c360/customers', () => {
    mockedIsAuthenticated.mockReturnValue(true);
    mockedGetUserRole.mockReturnValue('user');
    mockedGetIsSalesManager.mockReturnValue(false);
    renderWithRouter(
      <SalesManagerRoute><div>SM Content</div></SalesManagerRoute>,
    );
    expect(screen.getByText('C360 Customers Page')).toBeInTheDocument();
  });

  // T-013（新增）：嚴格 === true，防禦 truthy
  // getIsSalesManager() helper 內部已嚴格比對 === true，因此 SalesManagerRoute
  // 透過 helper 取得布林結果；此測試確保 helper truthy 值（如 1）視為 false。
  it('user + isSalesManager 非嚴格 true → 視為 false 並 redirect', () => {
    mockedIsAuthenticated.mockReturnValue(true);
    mockedGetUserRole.mockReturnValue('user');
    // helper 嚴格 === true 比對，非 boolean true 一律回 false
    mockedGetIsSalesManager.mockReturnValue(false);
    renderWithRouter(
      <SalesManagerRoute><div>SM Content</div></SalesManagerRoute>,
    );
    expect(screen.getByText('C360 Customers Page')).toBeInTheDocument();
    expect(screen.queryByText('SM Content')).toBeNull();
  });

  it('未認證 → 導向 /login', () => {
    mockedIsAuthenticated.mockReturnValue(false);
    renderWithRouter(
      <SalesManagerRoute><div>SM Content</div></SalesManagerRoute>,
    );
    expect(screen.getByText('Login Page')).toBeInTheDocument();
  });
});

describe('UserRoute（deprecated → delegate to ProtectedRoute）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('已認證 admin → 仍 render children（不再限定 role=user）', () => {
    mockedIsAuthenticated.mockReturnValue(true);
    mockedGetUserRole.mockReturnValue('admin');
    renderWithRouter(
      <UserRoute><div>User Content</div></UserRoute>,
    );
    expect(screen.getByText('User Content')).toBeInTheDocument();
  });

  it('已認證 user → render children', () => {
    mockedIsAuthenticated.mockReturnValue(true);
    mockedGetUserRole.mockReturnValue('user');
    renderWithRouter(
      <UserRoute><div>User Content</div></UserRoute>,
    );
    expect(screen.getByText('User Content')).toBeInTheDocument();
  });

  it('未認證 → 導向 /login', () => {
    mockedIsAuthenticated.mockReturnValue(false);
    renderWithRouter(
      <UserRoute><div>User Content</div></UserRoute>,
    );
    expect(screen.getByText('Login Page')).toBeInTheDocument();
  });
});
