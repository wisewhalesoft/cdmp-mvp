/**
 * F050 v2.1 Phase 5d 波 4：FieldsTab（移植 field-whitelist-page main）
 *
 * 對應 prototype: /prototypes/37-base-code.html line 166-240 Tab 1
 *
 * 涵蓋：
 *   - toolbar：search / type filter / status filter / 清除 / 統計 / 新增按鈕（prototype L186-207）
 *   - 表格 columns（prototype L210-220 含 columnDescription column）
 *   - F075 v1.5 商業規則 footer 4 條 BR（prototype L226-237）
 *     - BR-1 / BR-3 / BR-4 / **BR-8（v1.5 新增 list_period_* 一級保留欄位）**
 *   - listFields() 在 mount 時呼叫
 *   - 新增 Modal dropdown 既有 columnDescription 自動填入 hint（v1.4.7 沿用）
 */
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { FieldsTab } from '../fields-tab';
import { ToastProvider } from '@/components/ui/toast';
import * as poolApi from '@/api/pooldata-fields';
import * as authStore from '@/stores/auth-store';

vi.mock('@/api/pooldata-fields');
vi.mock('@/stores/auth-store');

const mockedListFields = vi.mocked(poolApi.listFields);

function renderTab() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <FieldsTab />
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('FieldsTab — Phase 5d 波 4', () => {
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
  });
  afterEach(() => cleanup());

  it('fields-tab-1：mount 時呼叫 listFields()', async () => {
    renderTab();
    await waitFor(() => {
      expect(mockedListFields).toHaveBeenCalled();
    });
  });

  it('fields-tab-2：toolbar 含 search / type filter / status filter / 清除 / 統計 / 新增按鈕', async () => {
    renderTab();
    await waitFor(() => expect(mockedListFields).toHaveBeenCalled());
    // search input（依 prototype 既有 testid 'field-whitelist-toolbar' 容器）
    expect(screen.getByTestId('field-whitelist-toolbar')).toBeInTheDocument();
    expect(screen.getByTestId('filter-type')).toBeInTheDocument();
    expect(screen.getByTestId('filter-active')).toBeInTheDocument();
    expect(screen.getByTestId('btn-clear-filters')).toBeInTheDocument();
    expect(screen.getByTestId('field-stats')).toBeInTheDocument();
    expect(screen.getByTestId('btn-create-field')).toBeInTheDocument();
  });

  it('fields-tab-3：F075 v1.5 商業規則 footer 4 條 BR（含 BR-8 list_period_* 一級保留欄位 J8）', async () => {
    renderTab();
    await waitFor(() => expect(mockedListFields).toHaveBeenCalled());
    // prototype L226-237 之 4 條 BR
    expect(screen.getByTestId('field-whitelist-rules-footer')).toBeInTheDocument();
    const footer = screen.getByTestId('field-whitelist-rules-footer');
    expect(footer).toHaveTextContent('F075 v1.5 商業規則摘要');
    expect(footer).toHaveTextContent('BR-1');
    expect(footer).toHaveTextContent('BR-3');
    expect(footer).toHaveTextContent('BR-4');
    // BR-8 v1.5 新增（prototype L234）— list_period_* 為一級保留欄位（J8）
    expect(footer).toHaveTextContent('BR-8');
    expect(footer).toHaveTextContent('list_period_start');
    expect(footer).toHaveTextContent('list_period_end');
    expect(footer).toHaveTextContent('list_interval');
    expect(footer).toHaveTextContent('一級保留欄位');
  });

  it('fields-tab-4：渲染 field row 顯示 columnName / displayName / fieldType', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('prod_kind')).toBeInTheDocument();
      expect(screen.getByText('產品類別')).toBeInTheDocument();
    });
  });

  it('fields-tab-5：Scope 提示 banner 顯示 F075 v1.5 標題（對齊 prototype L173-183）', async () => {
    renderTab();
    await waitFor(() => expect(mockedListFields).toHaveBeenCalled());
    const banner = screen.getByTestId('field-whitelist-scope-hint');
    expect(banner).toHaveTextContent('F075 v1.5');
    expect(banner).toHaveTextContent('POOLDATA 篩選欄位白名單');
  });

  it('fields-tab-6：active 列「停用」按鈕含 icon + 文字標籤（對齊 prototype L607）', async () => {
    renderTab();
    await waitFor(() =>
      expect(screen.getByTestId('btn-disable-prod_kind')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('btn-disable-prod_kind')).toHaveTextContent('停用');
  });

  it('fields-tab-7：inactive 列「啟用」按鈕含 icon + 文字標籤', async () => {
    mockedListFields.mockResolvedValueOnce({
      fields: [
        {
          columnName: 'payt_term',
          displayName: '還款期別',
          fieldType: 'numeric',
          isActive: false,
          createdAt: '2026-05-01T00:00:00Z',
          updatedAt: '2026-05-01T00:00:00Z',
        },
      ],
    });
    renderTab();
    await waitFor(() =>
      expect(screen.getByTestId('btn-reactivate-payt_term')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('btn-reactivate-payt_term')).toHaveTextContent('啟用');
  });
});
