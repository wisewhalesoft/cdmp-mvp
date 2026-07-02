/**
 * F109 / US-172 — M06 白名單頁「資料來源」欄 + 篩選（AC-2 / §7.1 / FE-001~003）
 *
 * 對應 prototype: /prototypes/37-base-code.html（L190-194 來源 filter、L214 資料來源欄）
 * 渲染 FieldBasePage（tab=fields → FieldsTab），mock listFields 回傳含 dataSource 之 fixture。
 */
import { render, screen, fireEvent, within, cleanup, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { FieldBasePage } from '../field-base-page';
import { ToastProvider } from '@/components/ui/toast';
import * as pooldataApi from '@/api/pooldata-fields';
import type { ListFieldsResponse } from '@/api/pooldata-fields';

vi.mock('@/stores/auth-store', () => ({
  isAuthenticated: vi.fn(() => true),
  getUserRole: vi.fn(() => 'user'),
  getIsSalesManager: vi.fn(() => true),
  getBusinessRole: vi.fn(() => 'director'),
  getEffectiveIdentity: vi.fn(() => 'director'),
  getUser: vi.fn(() => ({ id: 'd1', name: 'D', email: 'd@x.test', role: 'user', isSalesManager: true, businessRole: 'director' })),
  clearAuth: vi.fn(),
}));
vi.mock('@/api/auth', () => ({ logout: vi.fn().mockResolvedValue({}) }));
vi.mock('@/api/pooldata-fields');

const mockedListFields = vi.mocked(pooldataApi.listFields);
const mockedListOptions = vi.mocked(pooldataApi.listOptions);
const mockedListAvailable = vi.mocked(pooldataApi.listAvailableColumns);
const mockedGetActiveCount = vi.mocked(pooldataApi.getActiveOptionsCount);

const OB_FIELDS = ['prod_kind', 'caseyear', 'spec_tp', 'case_status', 'settle_src', 'list_type', 'best_case'];
const CC_CATEGORICAL = ['gender', 'occupation_desc', 'education_desc', 'marital_status_desc', 'customer_type_desc', 'monthly_income_desc', 'cpost_city'];

const fixture: ListFieldsResponse = {
  fields: [
    ...OB_FIELDS.map((c) => ({
      columnName: c, displayName: c, fieldType: 'categorical' as const,
      isActive: true, isSystemFixed: c === 'best_case', dataSource: 'ob_pool_data' as const,
      createdAt: '2026-07-01T00:00:00Z', updatedAt: '2026-07-01T00:00:00Z',
    })),
    ...CC_CATEGORICAL.map((c) => ({
      columnName: c, displayName: c, fieldType: 'categorical' as const,
      isActive: true, isSystemFixed: false, dataSource: 'customer_core' as const,
      createdAt: '2026-07-01T00:00:00Z', updatedAt: '2026-07-01T00:00:00Z',
    })),
    {
      columnName: 'date_of_birth', displayName: '年齡', fieldType: 'numeric',
      isActive: true, isSystemFixed: false, dataSource: 'customer_core',
      createdAt: '2026-07-01T00:00:00Z', updatedAt: '2026-07-01T00:00:00Z',
    },
  ],
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/assignment/field-base']}>
      <ToastProvider>
        <Routes>
          <Route path="/assignment/field-base" element={<FieldBasePage />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('F109 FieldsTab — 資料來源欄 + 篩選', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedListFields.mockResolvedValue(fixture);
    mockedListOptions.mockResolvedValue({ options: [] });
    mockedListAvailable.mockResolvedValue({ availableColumns: [] });
    mockedGetActiveCount.mockResolvedValue({ columnName: 'x', activeCount: 0 });
  });
  afterEach(() => cleanup());

  it('TS-F109-FE-001：customer_core → 綠色「客戶資料」badge；ob_pool_data → 灰色「案件資料」badge', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('data-source-badge-gender')).toBeInTheDocument());
    expect(screen.getByTestId('data-source-badge-gender')).toHaveTextContent('客戶資料');
    expect(screen.getByTestId('data-source-badge-prod_kind')).toHaveTextContent('案件資料');
  });

  it('TS-F109-FE-002：來源篩選 dropdown 選「客戶資料」→ 只顯示 8 筆 customer_core（ob_pool_data 隱藏）', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('field-row-gender')).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('filter-data-source'), { target: { value: 'customer_core' } });
    await waitFor(() => expect(screen.queryByTestId('field-row-prod_kind')).toBeNull());
    // 8 筆 customer_core（7 categorical + date_of_birth）皆在
    for (const c of [...CC_CATEGORICAL, 'date_of_birth']) {
      expect(screen.getByTestId(`field-row-${c}`)).toBeInTheDocument();
    }
    // ob_pool_data 全隱藏
    for (const c of OB_FIELDS) {
      expect(screen.queryByTestId(`field-row-${c}`)).toBeNull();
    }
  });

  it('TS-F109-FE-003：7 categorical 客戶欄有「管理可選值」入口；date_of_birth（numeric）無', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('field-row-gender')).toBeInTheDocument());
    for (const c of CC_CATEGORICAL) {
      expect(screen.getByTestId(`btn-options-${c}`)).toBeInTheDocument();
    }
    // date_of_birth 為 numeric → 無「管理可選值」入口
    expect(screen.queryByTestId('btn-options-date_of_birth')).toBeNull();
  });
});
