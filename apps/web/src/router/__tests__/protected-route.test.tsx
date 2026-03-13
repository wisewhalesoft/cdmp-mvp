import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ProtectedRoute, AdminRoute, UserRoute } from '../protected-route';
import * as authStore from '@/stores/auth-store';

vi.mock('@/stores/auth-store', () => ({
  isAuthenticated: vi.fn(),
  getUserRole: vi.fn(),
}));

const mockedIsAuthenticated = vi.mocked(authStore.isAuthenticated);
const mockedGetUserRole = vi.mocked(authStore.getUserRole);

function renderWithRouter(element: React.ReactElement, initialPath = '/test') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/test" element={element} />
        <Route path="/login" element={<div>Login Page</div>} />
        <Route path="/user-info" element={<div>User Info Page</div>} />
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

  it('user → 導向 /user-info', () => {
    mockedIsAuthenticated.mockReturnValue(true);
    mockedGetUserRole.mockReturnValue('user');
    renderWithRouter(
      <AdminRoute><div>Admin Content</div></AdminRoute>,
    );
    expect(screen.getByText('User Info Page')).toBeInTheDocument();
  });

  it('未認證 → 導向 /login', () => {
    mockedIsAuthenticated.mockReturnValue(false);
    renderWithRouter(
      <AdminRoute><div>Admin Content</div></AdminRoute>,
    );
    expect(screen.getByText('Login Page')).toBeInTheDocument();
  });
});

describe('UserRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('user → render children', () => {
    mockedIsAuthenticated.mockReturnValue(true);
    mockedGetUserRole.mockReturnValue('user');
    renderWithRouter(
      <UserRoute><div>User Content</div></UserRoute>,
    );
    expect(screen.getByText('User Content')).toBeInTheDocument();
  });

  it('admin → 導向 /', () => {
    mockedIsAuthenticated.mockReturnValue(true);
    mockedGetUserRole.mockReturnValue('admin');
    renderWithRouter(
      <UserRoute><div>User Content</div></UserRoute>,
    );
    expect(screen.getByText('Admin Home')).toBeInTheDocument();
  });
});
