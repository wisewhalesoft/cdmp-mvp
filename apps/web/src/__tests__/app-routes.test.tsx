/**
 * F050 v2.1 Phase 5d 波 2：App.tsx 路由變更驗收
 *
 * 三條舊路由刪除 + 一條新路由新增：
 *   - 刪 /assignment/base-codes（BaseCodesPage）
 *   - 刪 /assignment/whitelist（FieldWhitelistPage）
 *   - 刪 /assignment/whitelist/options（FieldOptionsPage）
 *   - 新 /assignment/field-base（FieldBasePage，2-Tab 容器，對齊 prototype 37-base-code.html）
 *
 * `?tab=fields|options` 為 query string，不入 Route path；
 * FieldBasePage 內部用 useSearchParams 雙向同步（波 3 落地）。
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../App';
import { ToastProvider } from '@/components/ui/toast';
import * as authStore from '@/stores/auth-store';

vi.mock('@/stores/auth-store', () => ({
  isAuthenticated: vi.fn(() => true),
  getUserRole: vi.fn(() => 'user'),
  getIsSalesManager: vi.fn(() => true),
  getBusinessRole: vi.fn(() => 'director'),
  getEffectiveIdentity: vi.fn(() => 'director'),
  getUser: vi.fn(() => ({
    id: 'd1',
    name: 'Director',
    email: 'd@cdmp.test',
    role: 'user',
    isSalesManager: true,
    businessRole: 'director',
  })),
  clearAuth: vi.fn(),
}));

vi.mock('@/api/auth', () => ({ logout: vi.fn().mockResolvedValue({}) }));
// 提早 mock 任何外部 API client，避免 FieldBasePage / 其他頁初始化 fetch 失敗
vi.mock('@/api/pooldata-fields');
vi.mock('@/api/assignment-list');

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ToastProvider>
        <App />
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('App routes — Phase 5d 波 2', () => {
  beforeEach(() => {
    vi.mocked(authStore.isAuthenticated).mockReturnValue(true);
    vi.mocked(authStore.getEffectiveIdentity).mockReturnValue('director');
    vi.mocked(authStore.getBusinessRole).mockReturnValue('director');
  });

  it('新路由 /assignment/field-base → 渲染 FieldBasePage 容器（含 data-testid="field-base-page"）', () => {
    renderAt('/assignment/field-base');
    expect(screen.getByTestId('field-base-page')).toBeInTheDocument();
  });

  it('舊路由 /assignment/base-codes 已刪除 → 不再渲染 BaseCodesPage', () => {
    renderAt('/assignment/base-codes');
    // BaseCodesPage 既有渲染會出現「PROD_KIND」/「SPEC_TP」/「CASE_STATUS」Tab；新版不應有
    expect(screen.queryByText('PROD_KIND')).not.toBeInTheDocument();
    expect(screen.queryByText('SPEC_TP')).not.toBeInTheDocument();
    // 應 fallback 到 /login（App.tsx path="*" Navigate）
    expect(screen.queryByText(/帳號|Login|登入/)).toBeInTheDocument();
  });

  it('舊路由 /assignment/whitelist 已刪除 → 不再渲染 FieldWhitelistPage', () => {
    renderAt('/assignment/whitelist');
    // FieldWhitelistPage 既有渲染含「F075 商業規則摘要」；新版不應有
    expect(screen.queryByText(/F075 商業規則摘要/)).not.toBeInTheDocument();
  });

  it('舊路由 /assignment/whitelist/options 已刪除 → 不再渲染 FieldOptionsPage', () => {
    renderAt('/assignment/whitelist/options');
    expect(screen.queryByText(/F076 v1.1 商業規則摘要/)).not.toBeInTheDocument();
  });

  it('新路由保留 query string ?tab=options（不被 router 吃掉）', () => {
    renderAt('/assignment/field-base?tab=options');
    expect(screen.getByTestId('field-base-page')).toBeInTheDocument();
  });
});
