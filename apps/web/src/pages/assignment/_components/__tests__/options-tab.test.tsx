/**
 * F050 v2.1 Phase 5d 波 5：OptionsTab（master-detail 兩欄佈局）
 *
 * 對應 prototype: /prototypes/37-base-code.html line 242-323 Tab 2
 *
 * 涵蓋：
 *   - mount 載入 categorical 欄位 → Promise.all listOptions
 *   - master-detail layout：左欄欄位清單 + 右欄 detail
 *   - 點選欄位切換 detail + ?col= URL 同步
 *   - 「顯示已停用值」toggle
 *   - F076 v1.5 商業規則 footer（含 caseyear / case_status / prod_kind / spec_tp / settle_src 統一在此管理）
 *   - Scope 提示 banner
 */
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { OptionsTab } from '../options-tab';
import { ToastProvider } from '@/components/ui/toast';
import * as poolApi from '@/api/pooldata-fields';
import * as authStore from '@/stores/auth-store';

vi.mock('@/api/pooldata-fields');
vi.mock('@/stores/auth-store');

const mockedListFields = vi.mocked(poolApi.listFields);
const mockedListOptions = vi.mocked(poolApi.listOptions);

function LocationSpy({ onChange }: { onChange: (search: string) => void }) {
  const loc = useLocation();
  onChange(loc.search);
  return null;
}

function renderAt(path = '/assignment/field-base?tab=options') {
  let lastSearch = '';
  const utils = render(
    <MemoryRouter initialEntries={[path]}>
      <ToastProvider>
        <Routes>
          <Route
            path="/assignment/field-base"
            element={
              <>
                <OptionsTab />
                <LocationSpy onChange={(s) => (lastSearch = s)} />
              </>
            }
          />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
  return { ...utils, getLastSearch: () => lastSearch };
}

describe('OptionsTab — master-detail 兩欄佈局（對齊 prototype 37-base-code.html L242-323）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authStore.getEffectiveIdentity).mockReturnValue('director');
    mockedListFields.mockResolvedValue({
      fields: [
        {
          columnName: 'prod_kind',
          displayName: '產品類別',
          fieldType: 'categorical',
          isActive: true,
          createdAt: '2026-05-01T00:00:00Z',
          updatedAt: '2026-05-01T00:00:00Z',
        },
        {
          columnName: 'caseyear',
          displayName: '進件 / 滿期年數',
          fieldType: 'categorical',
          isActive: true,
          createdAt: '2026-05-01T00:00:00Z',
          updatedAt: '2026-05-01T00:00:00Z',
        },
      ],
    });
    mockedListOptions.mockResolvedValue({ options: [] });
  });
  afterEach(() => cleanup());

  it('options-tab-1：mount 時呼叫 listFields({active: true}) 過濾 categorical', async () => {
    renderAt();
    await waitFor(() => {
      expect(mockedListFields).toHaveBeenCalledWith({ active: 'true' });
    });
  });

  it('options-tab-2：對每個 categorical 欄位呼叫 listOptions', async () => {
    renderAt();
    await waitFor(() => {
      expect(mockedListOptions).toHaveBeenCalledWith('prod_kind', expect.any(Object));
      expect(mockedListOptions).toHaveBeenCalledWith('caseyear', expect.any(Object));
    });
  });

  it('options-tab-3：渲染 master-detail 兩欄佈局（左欄欄位清單 + 右欄 detail）', async () => {
    renderAt();
    await waitFor(() => expect(mockedListFields).toHaveBeenCalled());
    expect(await screen.findByTestId('field-options-master-detail')).toBeInTheDocument();
    expect(screen.getByTestId('categorical-columns-panel')).toBeInTheDocument();
    expect(screen.getByTestId('options-detail-panel')).toBeInTheDocument();
    expect(screen.getByTestId('column-item-prod_kind')).toBeInTheDocument();
    expect(screen.getByTestId('column-item-caseyear')).toBeInTheDocument();
  });

  it('options-tab-4：預設選中第一個欄位（detail 以顯示名稱為主，欄位名稱置於括號）', async () => {
    renderAt();
    // 顯示名稱為主
    await waitFor(() =>
      expect(screen.getByTestId('current-column-display').textContent).toBe('產品類別'),
    );
    // 欄位名稱以括號呈現
    expect(screen.getByTestId('current-column-name').textContent).toContain('prod_kind');
    expect(screen.getByTestId('column-item-prod_kind').getAttribute('data-state')).toBe(
      'active',
    );
  });

  it('options-tab-5：?col=caseyear deep link 自動選中該欄位', async () => {
    renderAt('/assignment/field-base?tab=options&col=caseyear');
    await waitFor(() =>
      expect(screen.getByTestId('current-column-name').textContent).toContain('caseyear'),
    );
    expect(screen.getByTestId('column-item-caseyear').getAttribute('data-state')).toBe(
      'active',
    );
  });

  it('options-tab-6：點選左欄欄位切換 detail + 更新 URL ?col=', async () => {
    const { getLastSearch } = renderAt();
    await waitFor(() => expect(mockedListFields).toHaveBeenCalled());
    await waitFor(() => screen.getByTestId('column-item-caseyear'));
    fireEvent.click(screen.getByTestId('column-item-caseyear'));
    await waitFor(() =>
      expect(screen.getByTestId('current-column-name').textContent).toContain('caseyear'),
    );
    expect(getLastSearch()).toContain('col=caseyear');
  });

  it('options-tab-7：「顯示已停用值」toggle 觸發 includeInactive=true 重新載入', async () => {
    renderAt();
    await waitFor(() => expect(mockedListOptions).toHaveBeenCalled());
    mockedListOptions.mockClear();
    fireEvent.click(screen.getByTestId('toggle-include-inactive'));
    await waitFor(() => {
      expect(mockedListOptions).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ includeInactive: 'true' }),
      );
    });
  });

  it('options-tab-8：左欄搜尋過濾欄位清單', async () => {
    renderAt();
    await waitFor(() => screen.getByTestId('column-item-prod_kind'));
    fireEvent.change(screen.getByTestId('input-column-search'), {
      target: { value: 'caseyear' },
    });
    expect(screen.queryByTestId('column-item-prod_kind')).not.toBeInTheDocument();
    expect(screen.getByTestId('column-item-caseyear')).toBeInTheDocument();
  });

  it('options-tab-9：不再顯示開發者導向的 F076 商業規則 footer', async () => {
    renderAt();
    await waitFor(() => expect(mockedListFields).toHaveBeenCalled());
    expect(
      screen.queryByTestId('field-options-rules-footer'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/商業規則摘要/)).not.toBeInTheDocument();
  });

  it('options-tab-10：不再顯示 F076 scope 提示 banner', async () => {
    renderAt();
    await waitFor(() => expect(mockedListFields).toHaveBeenCalled());
    expect(
      screen.queryByTestId('field-options-scope-hint'),
    ).not.toBeInTheDocument();
  });
});

describe('OptionsTab — 可選值排序（#12）與中文欄位（#11）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authStore.getEffectiveIdentity).mockReturnValue('director');
    mockedListFields.mockResolvedValue({
      fields: [
        {
          columnName: 'prod_kind',
          displayName: '產品類別',
          fieldType: 'categorical',
          isActive: true,
          createdAt: '2026-05-01T00:00:00Z',
          updatedAt: '2026-05-01T00:00:00Z',
        },
      ],
    });
    const threeOpts = [
      { columnName: 'prod_kind', optionValue: '01', optionLabel: '汽車', isActive: true, displayOrder: 0, createdAt: '', updatedAt: '' },
      { columnName: 'prod_kind', optionValue: '02', optionLabel: '房屋', isActive: true, displayOrder: 1, createdAt: '', updatedAt: '' },
      { columnName: 'prod_kind', optionValue: '03', optionLabel: '信用', isActive: true, displayOrder: 2, createdAt: '', updatedAt: '' },
    ];
    mockedListOptions.mockResolvedValue({ options: threeOpts });
  });
  afterEach(() => cleanup());

  it('options-sort-1：可選值表以「顯示名稱 / 欄位值」為欄位標題（顯示名稱在前）', async () => {
    renderAt();
    expect(await screen.findByTestId('options-table')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '顯示名稱' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '欄位值' })).toBeInTheDocument();
  });

  it('options-sort-2：第一列「上移」disabled、最後一列「下移」disabled', async () => {
    renderAt();
    await screen.findByTestId('options-table');
    expect((screen.getByTestId('btn-move-up-01') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('btn-move-down-03') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('btn-move-down-01') as HTMLButtonElement).disabled).toBe(false);
  });

  it('options-sort-3：點「下移」以新順序呼叫 reorderOptions', async () => {
    const mockedReorder = vi.mocked(poolApi.reorderOptions);
    mockedReorder.mockResolvedValue({ options: [] });
    renderAt();
    await screen.findByTestId('options-table');
    fireEvent.click(screen.getByTestId('btn-move-down-01'));
    await waitFor(() =>
      expect(mockedReorder).toHaveBeenCalledWith('prod_kind', ['02', '01', '03']),
    );
  });
});
