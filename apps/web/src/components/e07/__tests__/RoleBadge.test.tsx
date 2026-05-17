import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RoleBadge } from '../RoleBadge';

describe('RoleBadge', () => {
  it('renders admin badge from identity prop', () => {
    render(<RoleBadge identity="admin" />);
    const badge = screen.getByTestId('role-badge-admin');
    expect(badge).toHaveTextContent('系統管理者');
    expect(badge.className).toMatch(/bg-blue-100/);
    expect(badge.className).toMatch(/text-blue-700/);
  });

  it('renders director badge from role + businessRole', () => {
    render(<RoleBadge role="user" businessRole="director" />);
    const badge = screen.getByTestId('role-badge-director');
    expect(badge).toHaveTextContent('業務部長');
    expect(badge.className).toMatch(/bg-violet-100/);
  });

  it('renders section_chief badge from role + businessRole', () => {
    render(<RoleBadge role="user" businessRole="section_chief" />);
    const badge = screen.getByTestId('role-badge-section_chief');
    expect(badge).toHaveTextContent('業務處長');
    expect(badge.className).toMatch(/bg-cyan-100/);
  });

  it('renders user badge for role=user with null businessRole', () => {
    render(<RoleBadge role="user" businessRole={null} />);
    const badge = screen.getByTestId('role-badge-user');
    expect(badge).toHaveTextContent('一般使用者');
    expect(badge.className).toMatch(/bg-gray-100/);
  });

  it('admin role overrides businessRole (admin always rendered as admin)', () => {
    render(<RoleBadge role="admin" businessRole="director" />);
    expect(screen.getByTestId('role-badge-admin')).toHaveTextContent('系統管理者');
  });

  it('falls back to user when only role is provided and is user with undefined businessRole', () => {
    render(<RoleBadge role="user" businessRole={undefined} />);
    expect(screen.getByTestId('role-badge-user')).toHaveTextContent('一般使用者');
  });
});
