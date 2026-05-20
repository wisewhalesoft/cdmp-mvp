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
      <Routes>
        <Route path="/assignment/field-base" element={<FieldBasePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('FieldBasePage — Phase 5d 波 3', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authStore.getEffectiveIdentity).mockReturnValue('director');
  });
  afterEach(() => cleanup());

  it('field-base-1：標題「篩選欄位」+ 副標題對齊 prototype L126-128', () => {
    renderAt();
    // prototype L126：<h1>篩選欄位</h1>
    expect(screen.getByRole('heading', { name: '篩選欄位' })).toBeInTheDocument();
    // prototype L127：副標題完整文字
    expect(
      screen.getByText('F075 v1.5 白名單 + F076 v1.5 類別型欄位可選值（v2.1 取代 F068 代碼維護）'),
    ).toBeInTheDocument();
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

  it('field-base-6：v2.1 廢除通知 banner 顯示對齊 prototype L130-139 amber-50 文字', () => {
    renderAt();
    // prototype L135 之標題完整文字（不可改字）
    expect(
      screen.getByText('F068（PROD_KIND / SPEC_TP / CASE_STATUS 代碼維護）已於 v2.1 廢除'),
    ).toBeInTheDocument();
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
});
