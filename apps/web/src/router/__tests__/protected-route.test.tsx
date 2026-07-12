import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import {
  ProtectedRoute,
  AdminRoute,
  UserRoute,
  SalesManagerRoute,
  Customer360Route,
  DirectorRoute,
  DirectorOrSectionChiefRoute,
} from '../protected-route';
import * as authStore from '@/stores/auth-store';

vi.mock('@/stores/auth-store', () => ({
  isAuthenticated: vi.fn(),
  getUserRole: vi.fn(),
  getIsSalesManager: vi.fn(),
  getBusinessRole: vi.fn(),
  getDefaultHomePath: vi.fn(),
}));

const mockedIsAuthenticated = vi.mocked(authStore.isAuthenticated);
const mockedGetUserRole = vi.mocked(authStore.getUserRole);
const mockedGetIsSalesManager = vi.mocked(authStore.getIsSalesManager);
const mockedGetBusinessRole = vi.mocked(authStore.getBusinessRole);
const mockedGetDefaultHomePath = vi.mocked(authStore.getDefaultHomePath);

function renderWithRouter(element: React.ReactElement, initialPath = '/test') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/test" element={element} />
        <Route path="/login" element={<div>Login Page</div>} />
        <Route path="/user-info" element={<div>User Info Page</div>} />
        <Route path="/c360/customers" element={<div>C360 Customers Page</div>} />
        <Route
          path="/assignment/overview"
          element={<div>Assignment Overview Page</div>}
        />
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

  // 一般使用者 fallback = getDefaultHomePath() → /c360/customers
  it('一般使用者 → 導向 getDefaultHomePath()（/c360/customers）', () => {
    mockedIsAuthenticated.mockReturnValue(true);
    mockedGetUserRole.mockReturnValue('user');
    mockedGetDefaultHomePath.mockReturnValue('/c360/customers');
    renderWithRouter(
      <AdminRoute><div>Admin Content</div></AdminRoute>,
    );
    expect(screen.getByText('C360 Customers Page')).toBeInTheDocument();
    expect(screen.queryByText('User Info Page')).toBeNull();
  });

  // T-010（v2.1.0）：業務角色（director）fallback = /assignment/overview（角色感知）
  it('業務部長（director） → 導向 /assignment/overview（非 /c360/customers）', () => {
    mockedIsAuthenticated.mockReturnValue(true);
    mockedGetUserRole.mockReturnValue('user');
    mockedGetBusinessRole.mockReturnValue('director');
    mockedGetDefaultHomePath.mockReturnValue('/assignment/overview');
    renderWithRouter(
      <AdminRoute><div>Admin Content</div></AdminRoute>,
    );
    expect(screen.getByText('Assignment Overview Page')).toBeInTheDocument();
    expect(screen.queryByText('C360 Customers Page')).toBeNull();
  });

  it('未認證 → 導向 /login', () => {
    mockedIsAuthenticated.mockReturnValue(false);
    renderWithRouter(
      <AdminRoute><div>Admin Content</div></AdminRoute>,
    );
    expect(screen.getByText('Login Page')).toBeInTheDocument();
  });
});

// =============================================================================
// F002 v2.1.0 / US-177 / F111 — Customer360Route（業務角色無 Customer 360 存取權）
// =============================================================================
describe('Customer360Route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('admin → render children', () => {
    mockedIsAuthenticated.mockReturnValue(true);
    mockedGetUserRole.mockReturnValue('admin');
    mockedGetBusinessRole.mockReturnValue(null);
    renderWithRouter(
      <Customer360Route><div>C360 Content</div></Customer360Route>,
    );
    expect(screen.getByText('C360 Content')).toBeInTheDocument();
  });

  it('一般使用者（businessRole=null） → render children', () => {
    mockedIsAuthenticated.mockReturnValue(true);
    mockedGetUserRole.mockReturnValue('user');
    mockedGetBusinessRole.mockReturnValue(null);
    renderWithRouter(
      <Customer360Route><div>C360 Content</div></Customer360Route>,
    );
    expect(screen.getByText('C360 Content')).toBeInTheDocument();
  });

  // T-015：業務部長存取 /c360/** → 導向 /assignment/overview
  it('業務部長（director） → 導向 /assignment/overview', () => {
    mockedIsAuthenticated.mockReturnValue(true);
    mockedGetUserRole.mockReturnValue('user');
    mockedGetBusinessRole.mockReturnValue('director');
    renderWithRouter(
      <Customer360Route><div>C360 Content</div></Customer360Route>,
    );
    expect(screen.getByText('Assignment Overview Page')).toBeInTheDocument();
    expect(screen.queryByText('C360 Content')).toBeNull();
  });

  // T-015：業務處長存取 /c360/** → 導向 /assignment/overview
  it('業務處長（section_chief） → 導向 /assignment/overview', () => {
    mockedIsAuthenticated.mockReturnValue(true);
    mockedGetUserRole.mockReturnValue('user');
    mockedGetBusinessRole.mockReturnValue('section_chief');
    renderWithRouter(
      <Customer360Route><div>C360 Content</div></Customer360Route>,
    );
    expect(screen.getByText('Assignment Overview Page')).toBeInTheDocument();
    expect(screen.queryByText('C360 Content')).toBeNull();
  });

  it('未認證 → 導向 /login', () => {
    mockedIsAuthenticated.mockReturnValue(false);
    renderWithRouter(
      <Customer360Route><div>C360 Content</div></Customer360Route>,
    );
    expect(screen.getByText('Login Page')).toBeInTheDocument();
  });
});

// =============================================================================
// F002 v2.1.0 — 各 Guard 未通過時 fallback 為角色感知 getDefaultHomePath()
// =============================================================================
describe('角色感知 fallback（getDefaultHomePath）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('業務部長未通過 AdminRoute → getDefaultHomePath()（/assignment/overview）', () => {
    mockedIsAuthenticated.mockReturnValue(true);
    mockedGetUserRole.mockReturnValue('user');
    mockedGetBusinessRole.mockReturnValue('director');
    mockedGetDefaultHomePath.mockReturnValue('/assignment/overview');
    renderWithRouter(
      <AdminRoute><div>Admin Content</div></AdminRoute>,
    );
    expect(screen.getByText('Assignment Overview Page')).toBeInTheDocument();
  });

  it('一般使用者未通過 DirectorOrSectionChiefRoute → getDefaultHomePath()（/c360/customers）', () => {
    mockedIsAuthenticated.mockReturnValue(true);
    mockedGetUserRole.mockReturnValue('user');
    mockedGetBusinessRole.mockReturnValue(null);
    mockedGetDefaultHomePath.mockReturnValue('/c360/customers');
    renderWithRouter(
      <DirectorOrSectionChiefRoute>
        <div>E07 Content</div>
      </DirectorOrSectionChiefRoute>,
    );
    expect(screen.getByText('C360 Customers Page')).toBeInTheDocument();
    expect(screen.queryByText('E07 Content')).toBeNull();
  });

  it('一般使用者未通過 DirectorRoute → getDefaultHomePath()（/c360/customers）', () => {
    mockedIsAuthenticated.mockReturnValue(true);
    mockedGetUserRole.mockReturnValue('user');
    mockedGetBusinessRole.mockReturnValue(null);
    mockedGetDefaultHomePath.mockReturnValue('/c360/customers');
    renderWithRouter(
      <DirectorRoute><div>Director Content</div></DirectorRoute>,
    );
    expect(screen.getByText('C360 Customers Page')).toBeInTheDocument();
  });

  it('業務處長未通過 DirectorRoute → getDefaultHomePath()（/assignment/overview）', () => {
    mockedIsAuthenticated.mockReturnValue(true);
    mockedGetUserRole.mockReturnValue('user');
    mockedGetBusinessRole.mockReturnValue('section_chief');
    mockedGetDefaultHomePath.mockReturnValue('/assignment/overview');
    renderWithRouter(
      <DirectorRoute><div>Director Content</div></DirectorRoute>,
    );
    expect(screen.getByText('Assignment Overview Page')).toBeInTheDocument();
    expect(screen.queryByText('Director Content')).toBeNull();
  });

  it('業務部長通過 DirectorRoute → render children', () => {
    mockedIsAuthenticated.mockReturnValue(true);
    mockedGetUserRole.mockReturnValue('user');
    mockedGetBusinessRole.mockReturnValue('director');
    renderWithRouter(
      <DirectorRoute><div>Director Content</div></DirectorRoute>,
    );
    expect(screen.getByText('Director Content')).toBeInTheDocument();
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

  it('user + isSalesManager=false → 導向 getDefaultHomePath()（/c360/customers）', () => {
    mockedIsAuthenticated.mockReturnValue(true);
    mockedGetUserRole.mockReturnValue('user');
    mockedGetIsSalesManager.mockReturnValue(false);
    mockedGetDefaultHomePath.mockReturnValue('/c360/customers');
    renderWithRouter(
      <SalesManagerRoute><div>SM Content</div></SalesManagerRoute>,
    );
    expect(screen.getByText('C360 Customers Page')).toBeInTheDocument();
  });

  // T-013（沿用）：嚴格 === true，防禦 truthy
  // getIsSalesManager() helper 內部已嚴格比對 === true，因此 SalesManagerRoute
  // 透過 helper 取得布林結果；此測試確保 helper truthy 值（如 1）視為 false。
  it('user + isSalesManager 非嚴格 true → 視為 false 並 redirect', () => {
    mockedIsAuthenticated.mockReturnValue(true);
    mockedGetUserRole.mockReturnValue('user');
    // helper 嚴格 === true 比對，非 boolean true 一律回 false
    mockedGetIsSalesManager.mockReturnValue(false);
    mockedGetDefaultHomePath.mockReturnValue('/c360/customers');
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
