/**
 * F050 v2.1 Phase 5d 波 3：FieldBasePage 2-Tab 容器
 *
 * 對應 prototype: /prototypes/37-base-code.html line 124-164
 *
 * 容器職責：
 *   - 標題列「篩選欄位」+ 副標題（prototype L126-128）
 *   - v2.1 廢除通知 banner（amber-50，prototype L130-139）
 *   - Tab bar（欄位管理 F075 / 可選值管理 F076，prototype L142-164）
 *   - ?tab=fields|options URL sync
 *   - breadcrumb header（prototype L84-89：客戶名單分派 → 篩選欄位）
 *
 * FieldsTab / OptionsTab 內容由波 4 / 5 落地；本 spec 用 mock 確認容器組裝即可。
 */
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { FieldBasePage } from '../field-base-page';
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

// FieldsTab / OptionsTab 內部會呼叫 pooldata-fields API，mock 之
vi.mock('@/api/pooldata-fields', () => ({
  listFields: vi.fn().mockResolvedValue({ fields: [] }),
  listOptions: vi.fn().mockResolvedValue({ options: [] }),
  listAvailableColumns: vi.fn().mockResolvedValue({ availableColumns: [] }),
  createField: vi.fn(),
  updateField: vi.fn(),
  disableField: vi.fn(),
  getActiveOptionsCount: vi.fn().mockResolvedValue({ activeCount: 0 }),
  createOption: vi.fn(),
  deactivateOption: vi.fn(),
  reactivateOption: vi.fn(),
}));

function renderAt(path = '/assignment/field-base') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ToastProvider>
        <Routes>
          <Route path="/assignment/field-base" element={<FieldBasePage />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('FieldBasePage — Phase 5d 波 3', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authStore.getEffectiveIdentity).mockReturnValue('director');
  });
  afterEach(() => cleanup());

  it('field-base-1：標題「篩選欄位」+ 使用者友善副標題', () => {
    renderAt();
    expect(screen.getByRole('heading', { name: '篩選欄位' })).toBeInTheDocument();
    // 開發者導向副標題（F075/F076/F068 代碼）已移除，改為業務語意描述
    expect(
      screen.getByText('管理可用於名單定義的篩選欄位與其可選值'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/F075 v1.5 白名單/)).not.toBeInTheDocument();
  });

  it('field-base-2：渲染 2 個 Tab button（欄位管理 + 可選值管理）對齊 prototype L142-164', () => {
    renderAt();
    expect(screen.getByRole('button', { name: /欄位管理/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /可選值管理/ })).toBeInTheDocument();
  });

  it('field-base-3：default tab=fields（panelFields 顯示、panelOptions hidden）', () => {
    renderAt();
    expect(screen.getByTestId('panel-fields')).toBeInTheDocument();
    expect(screen.queryByTestId('panel-options')).not.toBeInTheDocument();
  });

  it('field-base-4：點「可選值管理」Tab → URL search 變為 ?tab=options + panel-options 可見', async () => {
    renderAt();
    fireEvent.click(screen.getByRole('button', { name: /可選值管理/ }));
    expect(screen.getByTestId('panel-options')).toBeInTheDocument();
    expect(screen.queryByTestId('panel-fields')).not.toBeInTheDocument();
  });

  it('field-base-5：初始 URL ?tab=options → 預設 options tab 已 active', () => {
    renderAt('/assignment/field-base?tab=options');
    expect(screen.getByTestId('panel-options')).toBeInTheDocument();
    expect(screen.queryByTestId('panel-fields')).not.toBeInTheDocument();
  });

  it('field-base-6：不再顯示開發者導向的 F068 廢除通知 banner', () => {
    renderAt();
    expect(screen.queryByTestId('v2.1-deprecation-banner')).not.toBeInTheDocument();
    expect(screen.queryByText(/已於 v2.1 廢除/)).not.toBeInTheDocument();
  });

  it('field-base-7：header breadcrumb 客戶名單分派 → 篩選欄位（對齊 prototype L84-89）', () => {
    renderAt();
    // breadcrumb container 用 aria-label="麵包屑"
    const nav = screen.getByLabelText('麵包屑');
    expect(nav).toBeInTheDocument();
    // 客戶名單分派 為前一級（灰色文字非連結；prototype L86 也是 span）
    expect(nav).toHaveTextContent('客戶名單分派');
    expect(nav).toHaveTextContent('篩選欄位');
  });

  // ==========================================================================
  // v1.7（US-144 AC-6）：is_system_fixed 旗標 UI — system-fixed badge + disabled 停用按鈕
  // 對應 F075-test.md §十 TS-F075-v17-007~010
  // prototype ground truth：37-base-code.html（field-row-best_case / btn-disable-best_case）
  // ==========================================================================
  describe('v1.7 — is_system_fixed 旗標 UI（US-144）', () => {
    // v1.7 fieldsFixture（含 isSystemFixed；best_case=true，其他=false）
    const v17Fields = {
      fields: [
        { columnName: 'prod_kind', displayName: '產品類別', fieldType: 'categorical', isActive: true, isSystemFixed: false, createdAt: '2026-05-01T00:00:00Z', updatedAt: '2026-05-01T00:00:00Z' },
        { columnName: 'best_case', displayName: '優質案件', fieldType: 'categorical', isActive: true, isSystemFixed: true, createdAt: '2026-05-01T00:00:00Z', updatedAt: '2026-05-01T00:00:00Z' },
        { columnName: 'caseyear', displayName: '案件年度', fieldType: 'categorical', isActive: true, isSystemFixed: false, createdAt: '2026-05-01T00:00:00Z', updatedAt: '2026-05-01T00:00:00Z' },
      ],
    };

    beforeEach(async () => {
      const pooldataApi = await import('@/api/pooldata-fields');
      vi.mocked(pooldataApi.listFields).mockResolvedValue(v17Fields as never);
    });

    it('TS-F075-v17-007：best_case 列 field-row-best_case 含 data-system-fixed="true"；prod_kind 列為 false', async () => {
      renderAt();
      const bestRow = await screen.findByTestId('field-row-best_case');
      expect(bestRow.getAttribute('data-system-fixed')).toBe('true');
      const prodRow = screen.getByTestId('field-row-prod_kind');
      expect(prodRow.getAttribute('data-system-fixed')).toBe('false');
    });

    it('TS-F075-v17-008：best_case 停用按鈕 btn-disable-best_case 為 disabled（aria-disabled=true）', async () => {
      renderAt();
      const btn = (await screen.findByTestId('btn-disable-best_case')) as HTMLButtonElement;
      expect(
        btn.disabled === true || btn.getAttribute('aria-disabled') === 'true',
      ).toBe(true);
    });

    it('TS-F075-v17-009：prod_kind 停用按鈕（對照組）不為 disabled', async () => {
      renderAt();
      const btn = (await screen.findByTestId('btn-disable-prod_kind')) as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
      expect(btn.getAttribute('aria-disabled')).not.toBe('true');
    });

    it('TS-F075-v17-010：click best_case 停用按鈕 → 不發出 PATCH/DELETE 請求', async () => {
      const pooldataApi = await import('@/api/pooldata-fields');
      const disableSpy = vi.mocked(pooldataApi.disableField);
      renderAt();
      const btn = await screen.findByTestId('btn-disable-best_case');
      fireEvent.click(btn);
      expect(disableSpy).not.toHaveBeenCalled();
    });

    it('TS-F075-v17-007b：best_case 列顯示「系統固定」badge', async () => {
      renderAt();
      const badge = await screen.findByTestId('system-fixed-badge-best_case');
      expect(badge).toHaveTextContent('系統固定');
    });
  });
});
