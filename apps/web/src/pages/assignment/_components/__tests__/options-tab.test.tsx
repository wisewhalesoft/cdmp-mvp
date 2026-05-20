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

  it('options-tab-4：預設選中第一個欄位（detail 顯示 current column name）', async () => {
    renderAt();
    await waitFor(() =>
      expect(screen.getByTestId('current-column-name').textContent).toBe('prod_kind'),
    );
    expect(screen.getByTestId('column-item-prod_kind').getAttribute('data-state')).toBe(
      'active',
    );
  });

  it('options-tab-5：?col=caseyear deep link 自動選中該欄位', async () => {
    renderAt('/assignment/field-base?tab=options&col=caseyear');
    await waitFor(() =>
      expect(screen.getByTestId('current-column-name').textContent).toBe('caseyear'),
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
      expect(screen.getByTestId('current-column-name').textContent).toBe('caseyear'),
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

  it('options-tab-9：F076 v1.5 商業規則 footer 含 5 個關鍵欄位名 + 取代 F068 文字', async () => {
    renderAt();
    await waitFor(() => expect(mockedListFields).toHaveBeenCalled());
    const footer = screen.getByTestId('field-options-rules-footer');
    expect(footer).toHaveTextContent('F076');
    expect(footer).toHaveTextContent('BR-1');
    expect(footer).toHaveTextContent('BR-3');
    expect(footer.textContent).toMatch(/不回溯/);
    expect(footer).toHaveTextContent('caseyear');
    expect(footer).toHaveTextContent('case_status');
    expect(footer).toHaveTextContent('prod_kind');
    expect(footer).toHaveTextContent('spec_tp');
    expect(footer).toHaveTextContent('settle_src');
    expect(footer.textContent).toMatch(/取代\s*F068|F068.*ob_code_df/);
  });

  it('options-tab-10：Scope 提示 banner 顯示 F076 v1.5 標題', async () => {
    renderAt();
    await waitFor(() => expect(mockedListFields).toHaveBeenCalled());
    const banner = screen.getByTestId('field-options-scope-hint');
    expect(banner).toHaveTextContent('F076 v1.5');
    expect(banner).toHaveTextContent('類別型欄位可選值');
  });
});
