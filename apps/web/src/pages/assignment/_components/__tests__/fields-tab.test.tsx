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
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
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

  it('fields-tab-3：不再顯示開發者導向的商業規則 footer', async () => {
    renderTab();
    await waitFor(() => expect(mockedListFields).toHaveBeenCalled());
    expect(
      screen.queryByTestId('field-whitelist-rules-footer'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/商業規則摘要/)).not.toBeInTheDocument();
  });

  it('fields-tab-4：渲染 field row 顯示 顯示名稱 / 欄位名稱', async () => {
    renderTab();
    await waitFor(() => {
      // 顯示名稱（產品類別）在左、欄位名稱（prod_kind）在右，皆渲染
      expect(screen.getByText('產品類別')).toBeInTheDocument();
      expect(screen.getByText('prod_kind')).toBeInTheDocument();
    });
    // 表頭改為中文
    expect(screen.getByRole('columnheader', { name: '顯示名稱' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '欄位名稱' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '欄位類型' })).toBeInTheDocument();
  });

  it('fields-tab-4b（F114 regression）：customer_financial 欄位渲染「交易資料」badge 不 blank screen', async () => {
    mockedListFields.mockResolvedValue({
      fields: [
        {
          columnName: 'has_guarantor',
          displayName: '有無保人',
          fieldType: 'categorical',
          isActive: true,
          dataSource: 'customer_financial',
          createdAt: '2026-07-13T00:00:00Z',
          updatedAt: '2026-07-13T00:00:00Z',
        },
      ],
    });
    renderTab();
    // 曾因 DATA_SOURCE_CONFIG 無 customer_financial → cfg undefined → 整頁 render 崩潰（空白畫面）
    expect(await screen.findByText('有無保人')).toBeInTheDocument();
    expect(screen.getByTestId('data-source-badge-has_guarantor')).toHaveTextContent('交易資料');
  });

  it('fields-tab-5：不再顯示 F075 scope 提示 banner', async () => {
    renderTab();
    await waitFor(() => expect(mockedListFields).toHaveBeenCalled());
    expect(
      screen.queryByTestId('field-whitelist-scope-hint'),
    ).not.toBeInTheDocument();
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

  it('fields-tab-8：新增 modal 以顯示名稱選擇欄位，欄位名稱唯讀，提交衍生 displayName', async () => {
    const mockedListAvailable = vi.mocked(poolApi.listAvailableColumns);
    const mockedCreate = vi.mocked(poolApi.createField);
    mockedListAvailable.mockResolvedValue({
      availableColumns: [
        {
          columnName: 'risk_level',
          dataType: 'varchar',
          suggestedFieldType: 'categorical',
          columnDescription: '風險等級',
        },
      ],
    });
    mockedCreate.mockResolvedValue({
      columnName: 'risk_level',
      displayName: '風險等級',
      fieldType: 'categorical',
      isActive: true,
      createdAt: '2026-07-01T00:00:00Z',
      updatedAt: '2026-07-01T00:00:00Z',
    } as never);

    renderTab();
    await waitFor(() => expect(mockedListFields).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId('btn-create-field'));
    await waitFor(() => expect(mockedListAvailable).toHaveBeenCalled());

    fireEvent.click(screen.getByTestId('dropdown-column-name-trigger'));
    const option = await screen.findByTestId('dropdown-option-risk_level');
    // 下拉選項同時顯示 顯示名稱（欄位描述）與 欄位名稱
    expect(option).toHaveTextContent('風險等級');
    expect(option).toHaveTextContent('risk_level');
    fireEvent.click(option);

    // 欄位名稱唯讀 chip 顯示選定 columnName
    expect(screen.getByTestId('readonly-column-name')).toHaveTextContent('risk_level');
    // 顯示名稱自動帶入該欄位之 ETL 描述（columnDescription），可再修改
    expect(
      (screen.getByTestId('input-display-name') as HTMLInputElement).value,
    ).toBe('風險等級');

    fireEvent.click(screen.getByTestId('btn-submit-create-field'));
    await waitFor(() =>
      expect(mockedCreate).toHaveBeenCalledWith({
        columnName: 'risk_level',
        displayName: '風險等級',
        fieldType: 'categorical',
      }),
    );
  });

  it('fields-tab-9：無 ETL 描述的欄位不出現在選擇下拉（僅提供有描述欄位）', async () => {
    const mockedListAvailable = vi.mocked(poolApi.listAvailableColumns);
    // risk_level 有描述、year_cnt 無 columnDescription（來源無 MS_Description）
    mockedListAvailable.mockResolvedValue({
      availableColumns: [
        {
          columnName: 'risk_level',
          dataType: 'varchar',
          suggestedFieldType: 'categorical',
          columnDescription: '風險等級',
        },
        { columnName: 'year_cnt', dataType: 'int', suggestedFieldType: 'numeric' },
      ],
    });

    renderTab();
    await waitFor(() => expect(mockedListFields).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId('btn-create-field'));
    await waitFor(() => expect(mockedListAvailable).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId('dropdown-column-name-trigger'));

    // 有描述的欄位可選；無描述的欄位被隱藏（不提供選擇）
    expect(await screen.findByTestId('dropdown-option-risk_level')).toBeInTheDocument();
    expect(screen.queryByTestId('dropdown-option-year_cnt')).not.toBeInTheDocument();
  });

  it('fields-tab-10：重選欄位時顯示名稱更新為新欄位描述（未手動改動時）', async () => {
    const mockedListAvailable = vi.mocked(poolApi.listAvailableColumns);
    mockedListAvailable.mockResolvedValue({
      availableColumns: [
        {
          columnName: 'risk_level',
          dataType: 'varchar',
          suggestedFieldType: 'categorical',
          columnDescription: '風險等級',
        },
        {
          columnName: 'acc_date',
          dataType: 'datetime2',
          suggestedFieldType: 'date',
          columnDescription: '結清日',
        },
      ],
    });

    renderTab();
    await waitFor(() => expect(mockedListFields).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId('btn-create-field'));
    await waitFor(() => expect(mockedListAvailable).toHaveBeenCalled());

    // 先選 risk_level → 顯示名稱自動帶入「風險等級」
    fireEvent.click(screen.getByTestId('dropdown-column-name-trigger'));
    fireEvent.click(await screen.findByTestId('dropdown-option-risk_level'));
    const input = screen.getByTestId('input-display-name') as HTMLInputElement;
    expect(input.value).toBe('風險等級');

    // 重選 acc_date（未手動改動）→ 顯示名稱應更新為「結清日」，且欄位類型帶入 date
    fireEvent.click(screen.getByTestId('dropdown-column-name-trigger'));
    fireEvent.click(await screen.findByTestId('dropdown-option-acc_date'));
    expect((screen.getByTestId('input-display-name') as HTMLInputElement).value).toBe('結清日');
    expect(
      (screen.getByTestId('field-type-radio-date') as HTMLInputElement).checked,
    ).toBe(true);
  });

  it('fields-tab-11：使用者手動輸入顯示名稱後，重選欄位不覆寫', async () => {
    const mockedListAvailable = vi.mocked(poolApi.listAvailableColumns);
    mockedListAvailable.mockResolvedValue({
      availableColumns: [
        {
          columnName: 'risk_level',
          dataType: 'varchar',
          suggestedFieldType: 'categorical',
          columnDescription: '風險等級',
        },
        {
          columnName: 'acc_date',
          dataType: 'datetime2',
          suggestedFieldType: 'date',
          columnDescription: '結清日',
        },
      ],
    });

    renderTab();
    await waitFor(() => expect(mockedListFields).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId('btn-create-field'));
    await waitFor(() => expect(mockedListAvailable).toHaveBeenCalled());

    fireEvent.click(screen.getByTestId('dropdown-column-name-trigger'));
    fireEvent.click(await screen.findByTestId('dropdown-option-risk_level'));
    const input = screen.getByTestId('input-display-name') as HTMLInputElement;
    // 使用者手動改成自訂名稱
    fireEvent.change(input, { target: { value: '我的自訂名稱' } });

    // 重選 acc_date → 不覆寫使用者輸入
    fireEvent.click(screen.getByTestId('dropdown-column-name-trigger'));
    fireEvent.click(await screen.findByTestId('dropdown-option-acc_date'));
    expect((screen.getByTestId('input-display-name') as HTMLInputElement).value).toBe(
      '我的自訂名稱',
    );
  });
});
