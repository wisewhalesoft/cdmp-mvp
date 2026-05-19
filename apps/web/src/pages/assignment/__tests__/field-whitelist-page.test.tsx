import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { FieldWhitelistPage } from '../field-whitelist-page';
import { ToastProvider } from '@/components/ui/toast';
import * as poolApi from '@/api/pooldata-fields';
import * as authStore from '@/stores/auth-store';
import type { PooldataField, AvailableColumn } from '@/api/pooldata-fields';

vi.mock('@/api/pooldata-fields');
vi.mock('@/api/auth', () => ({ logout: vi.fn().mockResolvedValue({}) }));
vi.mock('@/stores/auth-store', async () => {
  const actual = await vi.importActual('@/stores/auth-store');
  return {
    ...actual,
    getUser: vi.fn(),
    getBusinessRole: vi.fn(),
    getEffectiveIdentity: vi.fn(),
    clearAuth: vi.fn(),
  };
});

const mockedListFields = vi.mocked(poolApi.listFields);
const mockedCreateField = vi.mocked(poolApi.createField);
const mockedGetCount = vi.mocked(poolApi.getActiveOptionsCount);
const mockedDisableField = vi.mocked(poolApi.disableField);
const mockedUpdateField = vi.mocked(poolApi.updateField);
const mockedListAvailableColumns = vi.mocked(poolApi.listAvailableColumns);
const mockedGetUser = vi.mocked(authStore.getUser);
const mockedGetBusinessRole = vi.mocked(authStore.getBusinessRole);
const mockedGetEffectiveIdentity = vi.mocked(authStore.getEffectiveIdentity);

const sampleFields: PooldataField[] = [
  {
    columnName: 'prod_kind',
    displayName: '產品類別',
    fieldType: 'categorical',
    isActive: true,
    createdAt: '2026-05-15T00:00:00.000Z',
    updatedAt: '2026-05-15T00:00:00.000Z',
  },
  {
    columnName: 'amount',
    displayName: '金額',
    fieldType: 'numeric',
    isActive: true,
    createdAt: '2026-05-16T00:00:00.000Z',
    updatedAt: '2026-05-16T00:00:00.000Z',
  },
];

function renderPage() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <FieldWhitelistPage />
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('FieldWhitelistPage (F075)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUser.mockReturnValue({
      id: 'd1',
      name: 'Director',
      email: 'manager@cdmp.test',
      role: 'user',
      isSalesManager: true,
      businessRole: 'director',
    });
    mockedGetBusinessRole.mockReturnValue('director');
    mockedGetEffectiveIdentity.mockReturnValue('director');
    mockedListFields.mockResolvedValue({ fields: sampleFields });
  });

  afterEach(() => cleanup());

  it('渲染欄位列表 + field_type badge', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('prod_kind')).toBeInTheDocument());
    expect(screen.getByText('amount')).toBeInTheDocument();
    expect(screen.getByTestId('field-type-categorical')).toBeInTheDocument();
    expect(screen.getByTestId('field-type-numeric')).toBeInTheDocument();
  });

  it('section_chief 身份新增按鈕停用', async () => {
    mockedGetEffectiveIdentity.mockReturnValue('section_chief');
    mockedGetBusinessRole.mockReturnValue('section_chief');
    renderPage();
    await waitFor(() => expect(screen.getByText('prod_kind')).toBeInTheDocument());
    expect(screen.getByTestId('btn-create-field')).toBeDisabled();
  });

  it('director 點新增按鈕開啟 modal 並可提交（v1.4：dropdown 選擇 + displayName + radio）', async () => {
    // v1.4 BR-11：移除 input-column-name 自由輸入路徑，改為 dropdown 唯一來源
    mockedListAvailableColumns.mockResolvedValue({
      availableColumns: [
        {
          columnName: 'new_col',
          dataType: 'character varying',
          suggestedFieldType: 'categorical',
        },
      ],
    });
    mockedCreateField.mockResolvedValue({
      ...sampleFields[0],
      columnName: 'new_col',
      displayName: '新欄位',
    });
    renderPage();
    await waitFor(() => expect(screen.getByText('prod_kind')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('btn-create-field'));
    expect(screen.getByTestId('create-field-modal')).toBeInTheDocument();

    // dropdown 開啟 → 選 new_col
    await waitFor(() =>
      expect(screen.getByTestId('dropdown-column-name-trigger')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('dropdown-column-name-trigger'));
    await waitFor(() =>
      expect(screen.getByTestId('dropdown-option-new_col')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('dropdown-option-new_col'));

    fireEvent.change(screen.getByTestId('input-display-name'), {
      target: { value: '新欄位' },
    });
    fireEvent.click(screen.getByTestId('btn-submit-create-field'));

    await waitFor(() => expect(mockedCreateField).toHaveBeenCalledTimes(1));
    expect(mockedCreateField.mock.calls[0][0]).toMatchObject({
      columnName: 'new_col',
      displayName: '新欄位',
      fieldType: 'categorical', // suggestedFieldType 預選
    });
  });

  // v1.4 BR-11：自由文字 columnName 路徑已移除，原「column_name 數字開頭」regex 驗證
  //             由後端 dropdown 來源（OBPOOLDATA information_schema）天然保證；此 test SKIP。
  it.skip('column_name 數字開頭（regex 不符）→ 顯示錯誤【v1.4 已廢棄：dropdown 來源保證合法欄位】', () => {});

  it('停用 categorical 欄位 → 預查 active count 並顯示級聯 modal', async () => {
    mockedGetCount.mockResolvedValue({
      columnName: 'prod_kind',
      activeCount: 5,
    });
    renderPage();
    await waitFor(() => expect(screen.getByText('prod_kind')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('btn-disable-prod_kind'));
    await waitFor(() =>
      expect(screen.getByTestId('category-switch-modal')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('active-count')).toHaveTextContent('5');
  });

  it('停用 numeric 欄位 → 顯示一般 confirm modal（無級聯）', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('amount')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('btn-disable-amount'));
    await waitFor(() =>
      expect(screen.getByTestId('confirm-modal-danger')).toBeInTheDocument(),
    );
    expect(mockedGetCount).not.toHaveBeenCalled();
  });

  describe('Phase 4 P3-3', () => {
    it('顯示總計 / 啟用 / 停用 統計列', async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByTestId('field-stats')).toBeInTheDocument(),
      );
      const stats = screen.getByTestId('field-stats');
      // 至少含「總計」與某數字
      expect(stats.textContent).toMatch(/總計|筆/);
    });

    it('顯示 type filter dropdown（categorical/numeric/date/all）', async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByTestId('filter-type')).toBeInTheDocument(),
      );
      const sel = screen.getByTestId('filter-type') as HTMLSelectElement;
      // 4 options
      expect(sel.options.length).toBeGreaterThanOrEqual(4);
    });

    it('type filter=numeric 過濾為 numeric 欄位', async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByText('amount')).toBeInTheDocument(),
      );
      fireEvent.change(screen.getByTestId('filter-type'), {
        target: { value: 'numeric' },
      });
      // prod_kind (categorical) 應被過濾掉
      expect(screen.queryByText('prod_kind')).not.toBeInTheDocument();
      // amount (numeric) 仍在
      expect(screen.getByText('amount')).toBeInTheDocument();
    });

    it('footer 顯示 F075 商業規則摘要（BR-1/3/4/7）', async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByTestId('field-whitelist-rules-footer')).toBeInTheDocument(),
      );
      const footer = screen.getByTestId('field-whitelist-rules-footer');
      expect(footer.textContent).toContain('BR-1');
      expect(footer.textContent).toContain('BR-3');
      expect(footer.textContent).toContain('BR-4');
      expect(footer.textContent).toContain('BR-7');
    });
  });

  // ============================================================
  // F075 v1.4 — dropdown + hint + 命名（TS-F075-FE-001 ~ FE-016）
  // ============================================================

  describe('F075 v1.4 — dropdown + hint + 命名', () => {
    // 標準 available-columns mock response（3 筆，供多個 case 共用）
    //   v1.4.3：column_name 改小寫貼近 PostgreSQL information_schema.columns 真實 case
    const STANDARD_AVAILABLE: AvailableColumn[] = [
      { columnName: 'age', dataType: 'date', suggestedFieldType: 'date' },
      {
        columnName: 'code',
        dataType: 'character varying',
        suggestedFieldType: 'categorical',
      },
      { columnName: 'zyear', dataType: 'integer', suggestedFieldType: 'numeric' },
    ];

    beforeEach(() => {
      mockedListAvailableColumns.mockResolvedValue({
        availableColumns: STANDARD_AVAILABLE,
      });
    });

    // ===== A. 渲染驗證 — UI 命名規範 =====

    it('TS-F075-FE-001：麵包屑顯示「代碼維護 → 篩選欄位管理」，「代碼維護」可點擊返回', async () => {
      renderPage();
      await waitFor(() => expect(screen.getByText('prod_kind')).toBeInTheDocument());

      // 麵包屑導航存在（v1.4.4 對齊 prototype 37a）
      const breadcrumb = screen.getByRole('navigation', { name: '麵包屑' });
      expect(breadcrumb).toBeInTheDocument();

      // 「代碼維護」為可點擊 Link，指向 /assignment/base-codes
      const parentLink = within(breadcrumb).getByRole('link', { name: '代碼維護' });
      expect(parentLink).toHaveAttribute('href', '/assignment/base-codes');

      // 當前頁面「篩選欄位管理」為 span（非 link）
      expect(within(breadcrumb).getByText('篩選欄位管理')).toBeInTheDocument();
      expect(within(breadcrumb).queryByRole('link', { name: '篩選欄位管理' })).toBeNull();

      // 不含舊命名
      expect(breadcrumb.textContent).not.toContain('白名單管理');
      expect(breadcrumb.textContent).not.toContain('POOLDATA 篩選欄位白名單');
    });

    it('TS-F075-FE-002：點「新增篩選欄位」按鈕 → Modal 標題為「新增篩選欄位」', async () => {
      renderPage();
      await waitFor(() => expect(screen.getByText('prod_kind')).toBeInTheDocument());

      const btn = screen.getByTestId('btn-create-field');
      expect(btn.textContent).toContain('新增篩選欄位');
      fireEvent.click(btn);

      await waitFor(() =>
        expect(screen.getByTestId('create-field-modal')).toBeInTheDocument(),
      );

      // Modal 標題
      const modal = screen.getByTestId('create-field-modal');
      expect(modal.textContent).toContain('新增篩選欄位');
      expect(modal.textContent).not.toContain('新增白名單欄位');
      expect(modal.textContent).not.toContain('新增 POOLDATA 欄位');
    });

    // ===== B. Dropdown 渲染與互動 =====

    it('TS-F075-FE-003：開啟 Modal 後 dropdown panel 內 3 個 option 元素', async () => {
      renderPage();
      await waitFor(() => expect(screen.getByText('prod_kind')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('btn-create-field'));

      await waitFor(() =>
        expect(screen.getByTestId('dropdown-column-name-trigger')).toBeInTheDocument(),
      );
      fireEvent.click(screen.getByTestId('dropdown-column-name-trigger'));

      // 確認 3 個 option
      await waitFor(() => {
        expect(screen.getByTestId('dropdown-option-age')).toBeInTheDocument();
      });
      expect(screen.getByTestId('dropdown-option-code')).toBeInTheDocument();
      expect(screen.getByTestId('dropdown-option-zyear')).toBeInTheDocument();
    });

    it("TS-F075-FE-004：點 dropdown trigger → panel 可見且 data-state='open'", async () => {
      renderPage();
      await waitFor(() => expect(screen.getByText('prod_kind')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('btn-create-field'));

      await waitFor(() =>
        expect(screen.getByTestId('dropdown-column-name-trigger')).toBeInTheDocument(),
      );
      const trigger = screen.getByTestId('dropdown-column-name-trigger');
      expect(trigger.getAttribute('data-state')).toBe('closed');

      fireEvent.click(trigger);
      await waitFor(() =>
        expect(trigger.getAttribute('data-state')).toBe('open'),
      );
      expect(screen.getByTestId('dropdown-column-name-panel')).toBeInTheDocument();
    });

    it("TS-F075-FE-005：搜尋輸入 'ye' → 只顯示 zyear", async () => {
      renderPage();
      await waitFor(() => expect(screen.getByText('prod_kind')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('btn-create-field'));

      await waitFor(() =>
        expect(screen.getByTestId('dropdown-column-name-trigger')).toBeInTheDocument(),
      );
      fireEvent.click(screen.getByTestId('dropdown-column-name-trigger'));

      await waitFor(() =>
        expect(screen.getByTestId('dropdown-option-age')).toBeInTheDocument(),
      );

      fireEvent.change(screen.getByTestId('dropdown-column-name-search'), {
        target: { value: 'ye' },
      });

      // 只剩 zyear
      await waitFor(() =>
        expect(screen.getByTestId('dropdown-option-zyear')).toBeInTheDocument(),
      );
      expect(screen.queryByTestId('dropdown-option-age')).not.toBeInTheDocument();
      expect(screen.queryByTestId('dropdown-option-code')).not.toBeInTheDocument();
    });

    // ===== C. 點選 dropdown → hint + radio =====

    async function openDropdownAndSelect(columnTestId: string) {
      renderPage();
      await waitFor(() => expect(screen.getByText('prod_kind')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('btn-create-field'));
      await waitFor(() =>
        expect(screen.getByTestId('dropdown-column-name-trigger')).toBeInTheDocument(),
      );
      fireEvent.click(screen.getByTestId('dropdown-column-name-trigger'));
      await waitFor(() =>
        expect(screen.getByTestId(columnTestId)).toBeInTheDocument(),
      );
      fireEvent.click(screen.getByTestId(columnTestId));
    }

    it("TS-F075-FE-006：選 age → trigger label='age'、hint visible + suggested + radio-date checked", async () => {
      await openDropdownAndSelect('dropdown-option-age');

      // trigger label 顯示 age
      const trigger = screen.getByTestId('dropdown-column-name-trigger');
      expect(trigger.textContent).toContain('age');

      // hint visible 且 data-state='suggested'
      const hint = screen.getByTestId('field-type-hint');
      expect(hint.getAttribute('data-state')).toBe('suggested');
      expect(hint.textContent).toContain('系統推斷');
      expect(hint.textContent).toContain('date');
      expect(hint.textContent).toContain('dataType=date');

      // radio-date checked
      const radioDate = screen.getByTestId(
        'field-type-radio-date',
      ) as HTMLInputElement;
      expect(radioDate.checked).toBe(true);
      const radioNumeric = screen.getByTestId(
        'field-type-radio-numeric',
      ) as HTMLInputElement;
      expect(radioNumeric.checked).toBe(false);
      const radioCategorical = screen.getByTestId(
        'field-type-radio-categorical',
      ) as HTMLInputElement;
      expect(radioCategorical.checked).toBe(false);
    });

    it("TS-F075-FE-007：選 ZYEAR (suggestedFieldType='numeric') → radio-numeric checked + hint 含 'numeric' / 'integer'", async () => {
      await openDropdownAndSelect('dropdown-option-zyear');

      const radioNumeric = screen.getByTestId(
        'field-type-radio-numeric',
      ) as HTMLInputElement;
      expect(radioNumeric.checked).toBe(true);

      const hint = screen.getByTestId('field-type-hint');
      expect(hint.textContent).toContain('numeric');
      expect(hint.textContent).toContain('integer');
    });

    it("TS-F075-FE-008：選 CODE (suggestedFieldType='categorical') → radio-categorical checked", async () => {
      await openDropdownAndSelect('dropdown-option-code');

      const radioCategorical = screen.getByTestId(
        'field-type-radio-categorical',
      ) as HTMLInputElement;
      expect(radioCategorical.checked).toBe(true);

      const hint = screen.getByTestId('field-type-hint');
      expect(hint.textContent).toContain('categorical');
    });

    // ===== D. 使用者覆寫 radio → hint data-state 切換 =====

    it("TS-F075-FE-009：覆寫 → hint data-state 切換為 'user-overridden'", async () => {
      await openDropdownAndSelect('dropdown-option-age');

      // 覆寫為 numeric
      fireEvent.click(screen.getByTestId('field-type-radio-numeric'));

      const hint = screen.getByTestId('field-type-hint');
      expect(hint.getAttribute('data-state')).toBe('user-overridden');
      expect(hint.textContent).toContain('使用者選擇');
    });

    it("TS-F075-FE-010：覆寫後點回原 suggestedFieldType → 仍維持 'user-overridden'（RISK-003 決議）", async () => {
      await openDropdownAndSelect('dropdown-option-age');

      // 覆寫為 numeric
      fireEvent.click(screen.getByTestId('field-type-radio-numeric'));

      let hint = screen.getByTestId('field-type-hint');
      expect(hint.getAttribute('data-state')).toBe('user-overridden');

      // 點回原 suggestedFieldType='date'
      fireEvent.click(screen.getByTestId('field-type-radio-date'));

      hint = screen.getByTestId('field-type-hint');
      // 仍維持 user-overridden（業務決議）
      expect(hint.getAttribute('data-state')).toBe('user-overridden');
      expect(hint.textContent).toContain('使用者選擇');
    });

    it("TS-F075-FE-011：dropdown 重選另一欄位 → data-state 重置為 'suggested'", async () => {
      await openDropdownAndSelect('dropdown-option-age');

      // 先覆寫
      fireEvent.click(screen.getByTestId('field-type-radio-numeric'));
      let hint = screen.getByTestId('field-type-hint');
      expect(hint.getAttribute('data-state')).toBe('user-overridden');

      // 重新開 dropdown 選另一欄位 CODE
      fireEvent.click(screen.getByTestId('dropdown-column-name-trigger'));
      await waitFor(() =>
        expect(screen.getByTestId('dropdown-option-code')).toBeInTheDocument(),
      );
      fireEvent.click(screen.getByTestId('dropdown-option-code'));

      hint = screen.getByTestId('field-type-hint');
      expect(hint.getAttribute('data-state')).toBe('suggested');
      // radio 重新預選為 CODE 的 categorical
      const radioCategorical = screen.getByTestId(
        'field-type-radio-categorical',
      ) as HTMLInputElement;
      expect(radioCategorical.checked).toBe(true);
    });

    // ===== E. Empty 情境 =====

    it('TS-F075-FE-012：API 回 200 空陣列 → dropdown 空態顯示「全部已列入」(無重試按鈕) + submit 停用', async () => {
      mockedListAvailableColumns.mockResolvedValue({ availableColumns: [] });
      renderPage();
      await waitFor(() => expect(screen.getByText('prod_kind')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('btn-create-field'));

      await waitFor(() =>
        expect(screen.getByTestId('dropdown-column-name-trigger')).toBeInTheDocument(),
      );
      fireEvent.click(screen.getByTestId('dropdown-column-name-trigger'));

      // 空態元素可見（真實「全部已列入」情境）
      await waitFor(() =>
        expect(
          screen.getByTestId('dropdown-column-name-empty'),
        ).toBeInTheDocument(),
      );

      // v1.4.2 強化：200 空陣列不應有錯誤訊息或重試按鈕
      expect(screen.queryByTestId('available-columns-error')).not.toBeInTheDocument();
      expect(screen.queryByTestId('available-columns-retry')).not.toBeInTheDocument();

      // submit 停用
      const submitBtn = screen.getByTestId(
        'btn-submit-create-field',
      ) as HTMLButtonElement;
      expect(submitBtn.disabled).toBe(true);
    });

    // ============================================================
    // v1.4.2 D1 — dropdown 錯誤碼分流（TS-F075-FE-017 ~ FE-019）
    // ============================================================

    async function openCreateModalAndDropdown() {
      renderPage();
      await waitFor(() => expect(screen.getByText('prod_kind')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('btn-create-field'));
      await waitFor(() =>
        expect(screen.getByTestId('dropdown-column-name-trigger')).toBeInTheDocument(),
      );
      fireEvent.click(screen.getByTestId('dropdown-column-name-trigger'));
    }

    it('TS-F075-FE-017：API 回 503 OBPOOLDATA_NOT_READY → dropdown 顯示「ETL 同步」訊息 + 重試按鈕', async () => {
      mockedListAvailableColumns.mockRejectedValue({
        response: {
          status: 503,
          data: {
            error: 'OBPOOLDATA_NOT_READY',
            message: 'OBPOOLDATA 資料尚未由 ETL 同步至本系統',
          },
        },
      });

      await openCreateModalAndDropdown();

      await waitFor(() =>
        expect(screen.getByTestId('available-columns-error')).toBeInTheDocument(),
      );

      const errorEl = screen.getByTestId('available-columns-error');
      expect(errorEl.textContent).toContain('OBPOOLDATA');
      expect(errorEl.textContent).toContain('ETL');
      // 重試按鈕存在
      expect(screen.getByTestId('available-columns-retry')).toBeInTheDocument();
      // 不顯示「全部已列入」誤導訊息
      expect(
        screen.queryByTestId('dropdown-column-name-empty'),
      ).not.toBeInTheDocument();
    });

    it('TS-F075-FE-018：API 回 503 FEATURE_NOT_ENABLED → dropdown 顯示「功能尚未啟用」+ 重試按鈕', async () => {
      mockedListAvailableColumns.mockRejectedValue({
        response: {
          status: 503,
          data: {
            error: 'FEATURE_NOT_ENABLED',
            message: '此功能尚未啟用',
          },
        },
      });

      await openCreateModalAndDropdown();

      await waitFor(() =>
        expect(screen.getByTestId('available-columns-error')).toBeInTheDocument(),
      );

      const errorEl = screen.getByTestId('available-columns-error');
      expect(errorEl.textContent).toContain('F075 功能尚未啟用');
      expect(screen.getByTestId('available-columns-retry')).toBeInTheDocument();
      expect(
        screen.queryByTestId('dropdown-column-name-empty'),
      ).not.toBeInTheDocument();
    });

    it('TS-F075-FE-019：API 回 500 通用錯誤 → dropdown 顯示「載入失敗請重試」+ 重試按鈕', async () => {
      mockedListAvailableColumns.mockRejectedValue({
        response: {
          status: 500,
          data: {
            error: 'INTERNAL_ERROR',
            message: 'Internal server error',
          },
        },
      });

      await openCreateModalAndDropdown();

      await waitFor(() =>
        expect(screen.getByTestId('available-columns-error')).toBeInTheDocument(),
      );

      const errorEl = screen.getByTestId('available-columns-error');
      expect(errorEl.textContent).toContain('載入欄位清單失敗');
      expect(errorEl.textContent).toContain('稍後重試');
      expect(screen.getByTestId('available-columns-retry')).toBeInTheDocument();
    });

    it('TS-F075-FE-020（補）：點重試按鈕 → 重新呼叫 listAvailableColumns', async () => {
      // 第一次回 503，第二次成功（用 mockImplementation 計數而非 *Once，避免 once-queue 殘留污染後續測試）
      let callIndex = 0;
      mockedListAvailableColumns.mockImplementation(() => {
        callIndex += 1;
        if (callIndex === 1) {
          return Promise.reject({
            response: {
              status: 503,
              data: {
                error: 'OBPOOLDATA_NOT_READY',
                message: 'OBPOOLDATA not ready',
              },
            },
          });
        }
        return Promise.resolve({
          availableColumns: [
            { columnName: 'new_col', dataType: 'varchar', suggestedFieldType: 'categorical' },
          ],
        });
      });

      await openCreateModalAndDropdown();

      await waitFor(() =>
        expect(screen.getByTestId('available-columns-retry')).toBeInTheDocument(),
      );

      // 第一次呼叫已完成
      expect(mockedListAvailableColumns).toHaveBeenCalledTimes(1);

      // 點重試
      fireEvent.click(screen.getByTestId('available-columns-retry'));

      // 第二次呼叫
      await waitFor(() =>
        expect(mockedListAvailableColumns).toHaveBeenCalledTimes(2),
      );

      // 錯誤訊息消失、選項出現
      await waitFor(() =>
        expect(
          screen.queryByTestId('available-columns-error'),
        ).not.toBeInTheDocument(),
      );
    });

    // ===== F. 成功與錯誤 Toast =====

    it("TS-F075-FE-013：新增成功 → toast 以 displayName 為主（AC-15）", async () => {
      mockedCreateField.mockResolvedValue({
        columnName: 'zyear',
        displayName: '風險等級',
        fieldType: 'numeric',
        isActive: true,
        createdAt: '2026-05-18T00:00:00.000Z',
        updatedAt: '2026-05-18T00:00:00.000Z',
      });

      await openDropdownAndSelect('dropdown-option-zyear');

      // 填 displayName
      fireEvent.change(screen.getByTestId('input-display-name'), {
        target: { value: '風險等級' },
      });

      // submit
      fireEvent.click(screen.getByTestId('btn-submit-create-field'));

      await waitFor(() => expect(mockedCreateField).toHaveBeenCalledTimes(1));

      // toast 含「欄位『風險等級』已新增」（以 displayName 為主）
      await waitFor(() => {
        // 全頁查 toast 文字
        const toastEl = screen.queryByText(/欄位『風險等級』已新增/);
        expect(toastEl).toBeTruthy();
      });
    });

    it('TS-F075-FE-014：POST 回 409 POOLDATA_FIELD_DUPLICATE → 錯誤提示 + Modal 不關閉', async () => {
      mockedCreateField.mockRejectedValue({
        response: {
          status: 409,
          data: {
            error: 'POOLDATA_FIELD_DUPLICATE',
            message: '欄位名稱已存在',
          },
        },
      });

      await openDropdownAndSelect('dropdown-option-zyear');
      fireEvent.change(screen.getByTestId('input-display-name'), {
        target: { value: '重複欄位' },
      });
      fireEvent.click(screen.getByTestId('btn-submit-create-field'));

      await waitFor(() => expect(mockedCreateField).toHaveBeenCalled());

      // create-error 顯示「已存在」
      await waitFor(() => {
        const err = screen.getByTestId('create-error');
        expect(err.textContent).toContain('已存在');
      });

      // Modal 仍 in DOM
      expect(screen.getByTestId('create-field-modal')).toBeInTheDocument();

      // 確認禁用字串不出現
      const modal = screen.getByTestId('create-field-modal');
      expect(modal.textContent).not.toContain('WHITELIST_FIELD_DUPLICATE');
    });

    it('TS-F075-FE-015：POST 回 500 → 一般錯誤 toast/error + Modal 不關閉', async () => {
      mockedCreateField.mockRejectedValue({
        response: {
          status: 500,
          data: { error: 'INTERNAL_SERVER_ERROR', message: '伺服器錯誤' },
        },
      });

      await openDropdownAndSelect('dropdown-option-zyear');
      fireEvent.change(screen.getByTestId('input-display-name'), {
        target: { value: 'X' },
      });
      fireEvent.click(screen.getByTestId('btn-submit-create-field'));

      await waitFor(() => expect(mockedCreateField).toHaveBeenCalled());

      // 顯示一般錯誤
      await waitFor(() => {
        const err = screen.getByTestId('create-error');
        expect(err.textContent).toMatch(/伺服器錯誤|建立失敗/);
      });
      // Modal 不關閉
      expect(screen.getByTestId('create-field-modal')).toBeInTheDocument();
    });

    // ===== G. Edit 模式 Regression =====
    // TS-F075-FE-016：v1.4.5 reverse D-iii — Edit Modal 已實作（見下方 v1.4.5 區段）
    it.skip('TS-F075-FE-016（v1.4 D-iii skip / v1.4.5 reverse 補實作）', () => {});
  });

  // ============================================================
  // F075 v1.4.5 — prototype 對齊翻新（main content）
  //   - 工具列結構 / 3 icon 操作 column / Edit Modal / reactivate
  //   - filter 字串 / 清除按鈕
  // ============================================================

  describe('F075 v1.4.5 — prototype 對齊翻新', () => {
    const sampleFieldsInactive: PooldataField[] = [
      {
        columnName: 'prod_kind',
        displayName: '產品類別',
        fieldType: 'categorical',
        isActive: true,
        createdAt: '2026-05-15T00:00:00.000Z',
        updatedAt: '2026-05-15T00:00:00.000Z',
      },
      {
        columnName: 'amount',
        displayName: '金額',
        fieldType: 'numeric',
        isActive: true,
        createdAt: '2026-05-16T00:00:00.000Z',
        updatedAt: '2026-05-16T00:00:00.000Z',
      },
      {
        columnName: 'payt_term',
        displayName: '還款期別',
        fieldType: 'numeric',
        isActive: false,
        createdAt: '2026-05-15T00:00:00.000Z',
        updatedAt: '2026-05-15T00:00:00.000Z',
      },
    ];

    beforeEach(() => {
      // 預設活躍 + 停用混合
      mockedListFields.mockResolvedValue({ fields: sampleFieldsInactive });
    });

    it('TS-F075-FE-V145-001：新增按鈕渲染於工具列（與 filter-type / filter-active 同 parent toolbar）', async () => {
      renderPage();
      await waitFor(() => expect(screen.getByText('prod_kind')).toBeInTheDocument());

      const toolbar = screen.getByTestId('field-whitelist-toolbar');
      const createBtn = screen.getByTestId('btn-create-field');
      const typeFilter = screen.getByTestId('filter-type');
      const statusFilter = screen.getByTestId('filter-active');

      expect(toolbar).toContainElement(createBtn);
      expect(toolbar).toContainElement(typeFilter);
      expect(toolbar).toContainElement(statusFilter);
    });

    it('TS-F075-FE-V145-002：「清除」按鈕重置 search + filter-type + filter-active', async () => {
      renderPage();
      await waitFor(() => expect(screen.getByText('prod_kind')).toBeInTheDocument());

      // 設定狀態
      fireEvent.change(screen.getByPlaceholderText(/搜尋 columnName/), {
        target: { value: 'prod' },
      });
      fireEvent.change(screen.getByTestId('filter-type'), {
        target: { value: 'numeric' },
      });
      fireEvent.change(screen.getByTestId('filter-active'), {
        target: { value: 'active' },
      });

      // 點清除
      fireEvent.click(screen.getByTestId('btn-clear-filters'));

      // 確認重置
      expect(
        (screen.getByPlaceholderText(/搜尋 columnName/) as HTMLInputElement).value,
      ).toBe('');
      expect((screen.getByTestId('filter-type') as HTMLSelectElement).value).toBe('all');
      expect((screen.getByTestId('filter-active') as HTMLSelectElement).value).toBe('all');
    });

    it('TS-F075-FE-V145-003：filter-type 三個 option 字串對齊 prototype 37a L133-138', async () => {
      renderPage();
      await waitFor(() => expect(screen.getByText('prod_kind')).toBeInTheDocument());

      const sel = screen.getByTestId('filter-type') as HTMLSelectElement;
      const optionTexts = Array.from(sel.options).map((o) => o.text);
      expect(optionTexts).toContain('類別：全部');
      expect(optionTexts).toContain('categorical（類別型）');
      expect(optionTexts).toContain('numeric（數值型）');
      expect(optionTexts).toContain('date（日期型）');
    });

    it('TS-F075-FE-V145-004：filter-active 三個 option 字串對齊 prototype 37a L142-146', async () => {
      renderPage();
      await waitFor(() => expect(screen.getByText('prod_kind')).toBeInTheDocument());

      const sel = screen.getByTestId('filter-active') as HTMLSelectElement;
      const optionTexts = Array.from(sel.options).map((o) => o.text);
      expect(optionTexts).toContain('狀態：全部');
      expect(optionTexts).toContain('僅顯示啟用');
      expect(optionTexts).toContain('僅顯示停用');
      // 禁用辭彙
      expect(optionTexts).not.toContain('啟用中');
      expect(optionTexts).not.toContain('已停用');
    });

    it('TS-F075-FE-V145-005：操作 column — categorical 啟用欄位有 3 個 icon', async () => {
      renderPage();
      await waitFor(() => expect(screen.getByText('prod_kind')).toBeInTheDocument());

      expect(screen.getByTestId('btn-options-prod_kind')).toBeInTheDocument();
      expect(screen.getByTestId('btn-edit-prod_kind')).toBeInTheDocument();
      expect(screen.getByTestId('btn-disable-prod_kind')).toBeInTheDocument();
    });

    it('TS-F075-FE-V145-006：操作 column — numeric 啟用欄位有 2 個 icon（無 btn-options）', async () => {
      renderPage();
      await waitFor(() => expect(screen.getByText('amount')).toBeInTheDocument());

      expect(screen.queryByTestId('btn-options-amount')).not.toBeInTheDocument();
      expect(screen.getByTestId('btn-edit-amount')).toBeInTheDocument();
      expect(screen.getByTestId('btn-disable-amount')).toBeInTheDocument();
    });

    it('TS-F075-FE-V145-007：操作 column — inactive 欄位顯示 btn-edit + btn-reactivate（無 btn-disable）', async () => {
      renderPage();
      await waitFor(() => expect(screen.getByText('payt_term')).toBeInTheDocument());

      expect(screen.getByTestId('btn-edit-payt_term')).toBeInTheDocument();
      expect(screen.getByTestId('btn-reactivate-payt_term')).toBeInTheDocument();
      expect(screen.queryByTestId('btn-disable-payt_term')).not.toBeInTheDocument();
    });

    it('TS-F075-FE-V145-008：點 btn-edit → 開 Edit Modal 含 readonly columnName + 預填 displayName + 不渲染 dropdown / hint', async () => {
      renderPage();
      await waitFor(() => expect(screen.getByText('prod_kind')).toBeInTheDocument());

      fireEvent.click(screen.getByTestId('btn-edit-prod_kind'));

      await waitFor(() =>
        expect(screen.getByTestId('edit-field-modal')).toBeInTheDocument(),
      );
      // readonly columnName chip
      const readonly = screen.getByTestId('readonly-column-name');
      expect(readonly.textContent).toContain('prod_kind');
      expect(readonly.textContent).toContain('PK 不可變更');
      // displayName 預填
      const dispInput = screen.getByTestId(
        'edit-input-display-name',
      ) as HTMLInputElement;
      expect(dispInput.value).toBe('產品類別');
      // 預選 radio 為原 fieldType
      const radioCategorical = screen.getByTestId(
        'edit-field-type-radio-categorical',
      ) as HTMLInputElement;
      expect(radioCategorical.checked).toBe(true);
      // **不渲染** create-only 元素
      expect(screen.queryByTestId('dropdown-column-name-trigger')).not.toBeInTheDocument();
      expect(screen.queryByTestId('field-type-hint')).not.toBeInTheDocument();
    });

    it('TS-F075-FE-V145-009：Edit Modal submit（非級聯）→ 呼叫 updateField + refetch', async () => {
      mockedUpdateField.mockResolvedValue({
        ...sampleFieldsInactive[1],
        displayName: '金額（修正）',
      });
      renderPage();
      await waitFor(() => expect(screen.getByText('amount')).toBeInTheDocument());

      fireEvent.click(screen.getByTestId('btn-edit-amount'));
      await waitFor(() =>
        expect(screen.getByTestId('edit-field-modal')).toBeInTheDocument(),
      );

      fireEvent.change(screen.getByTestId('edit-input-display-name'), {
        target: { value: '金額（修正）' },
      });
      fireEvent.click(screen.getByTestId('btn-submit-edit-field'));

      await waitFor(() => expect(mockedUpdateField).toHaveBeenCalledTimes(1));
      expect(mockedUpdateField.mock.calls[0][0]).toBe('amount');
      expect(mockedUpdateField.mock.calls[0][1]).toMatchObject({
        displayName: '金額（修正）',
        fieldType: 'numeric',
      });
    });

    it('TS-F075-FE-V145-010：Edit Modal — categorical → numeric 切換 → 觸發 CategorySwitchConfirmModal（重用既有）', async () => {
      mockedGetCount.mockResolvedValue({
        columnName: 'prod_kind',
        activeCount: 7,
      });
      mockedUpdateField.mockResolvedValue({
        ...sampleFieldsInactive[0],
        fieldType: 'numeric',
      });
      renderPage();
      await waitFor(() => expect(screen.getByText('prod_kind')).toBeInTheDocument());

      fireEvent.click(screen.getByTestId('btn-edit-prod_kind'));
      await waitFor(() =>
        expect(screen.getByTestId('edit-field-modal')).toBeInTheDocument(),
      );

      // 切換 fieldType radio: categorical → numeric
      fireEvent.click(screen.getByTestId('edit-field-type-radio-numeric'));
      // submit
      fireEvent.click(screen.getByTestId('btn-submit-edit-field'));

      // 預期：先 getActiveOptionsCount，然後出現 CategorySwitchConfirmModal
      await waitFor(() => expect(mockedGetCount).toHaveBeenCalledTimes(1));
      await waitFor(() =>
        expect(screen.getByTestId('category-switch-modal')).toBeInTheDocument(),
      );
      // 此時 updateField 尚未被呼叫
      expect(mockedUpdateField).not.toHaveBeenCalled();
      // active count 顯示 7
      expect(screen.getByTestId('active-count').textContent).toBe('7');
    });

    it('TS-F075-FE-V145-011：點 btn-reactivate → 呼叫 updateField({ isActive: true }) + toast「已啟用」', async () => {
      mockedUpdateField.mockResolvedValue({
        ...sampleFieldsInactive[2],
        isActive: true,
      });
      renderPage();
      await waitFor(() => expect(screen.getByText('payt_term')).toBeInTheDocument());

      fireEvent.click(screen.getByTestId('btn-reactivate-payt_term'));

      await waitFor(() => expect(mockedUpdateField).toHaveBeenCalledTimes(1));
      expect(mockedUpdateField.mock.calls[0][0]).toBe('payt_term');
      expect(mockedUpdateField.mock.calls[0][1]).toEqual({ isActive: true });

      // toast 含 displayName + 已啟用
      await waitFor(() => {
        expect(screen.queryByText(/欄位『還款期別』已啟用/)).toBeTruthy();
      });
    });

    it('TS-F075-FE-V145-012：reactivate 回 403 → 顯示 error toast 不破壞列表', async () => {
      mockedUpdateField.mockRejectedValue({
        response: {
          status: 403,
          data: { error: 'FORBIDDEN', message: 'Director only' },
        },
      });
      renderPage();
      await waitFor(() => expect(screen.getByText('payt_term')).toBeInTheDocument());

      fireEvent.click(screen.getByTestId('btn-reactivate-payt_term'));

      await waitFor(() => expect(mockedUpdateField).toHaveBeenCalled());
      // 列表仍存在原資料
      expect(screen.getByText('payt_term')).toBeInTheDocument();
      // error toast
      await waitFor(() => {
        expect(screen.queryByText(/Director only/)).toBeTruthy();
      });
    });

    it('TS-F075-FE-V145-013：section_chief → btn-edit / btn-disable / btn-reactivate 全部 disabled', async () => {
      mockedGetEffectiveIdentity.mockReturnValue('section_chief');
      mockedGetBusinessRole.mockReturnValue('section_chief');
      renderPage();
      await waitFor(() => expect(screen.getByText('prod_kind')).toBeInTheDocument());

      expect(screen.getByTestId('btn-edit-prod_kind')).toBeDisabled();
      expect(screen.getByTestId('btn-disable-prod_kind')).toBeDisabled();
      expect(screen.getByTestId('btn-edit-payt_term')).toBeDisabled();
      expect(screen.getByTestId('btn-reactivate-payt_term')).toBeDisabled();
      expect(screen.getByTestId('btn-create-field')).toBeDisabled();
    });

    it('TS-F075-FE-V145-014：Glossary regression — filter-active 不含 v1.4 舊字串「啟用中」/「已停用」', async () => {
      renderPage();
      await waitFor(() => expect(screen.getByText('prod_kind')).toBeInTheDocument());
      const sel = screen.getByTestId('filter-active') as HTMLSelectElement;
      const html = sel.outerHTML;
      expect(html).not.toContain('啟用中');
      expect(html).not.toContain('已停用');
    });
  });

  // ============================================================
  // F075 v1.4.7 — columnDescription 自動填入 displayName（AC-17）
  // ============================================================

  describe('F075 v1.4.7 — autoFillDisplayNameFromColumn (AC-17)', () => {
    const AVAILABLE_WITH_DESC: AvailableColumn[] = [
      {
        columnName: 'prod_kind',
        dataType: 'character varying',
        suggestedFieldType: 'categorical',
        // columnDescription 須擴充 AvailableColumn type
        columnDescription: '產品類別',
      } as AvailableColumn,
      {
        columnName: 'cust_age',
        dataType: 'integer',
        suggestedFieldType: 'numeric',
        // 無 columnDescription（omit）
      },
    ];

    beforeEach(() => {
      mockedListAvailableColumns.mockResolvedValue({
        availableColumns: AVAILABLE_WITH_DESC,
      });
    });

    async function openModalAndDropdown() {
      renderPage();
      await waitFor(() => expect(screen.getByText('prod_kind')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('btn-create-field'));
      await waitFor(() =>
        expect(screen.getByTestId('dropdown-column-name-trigger')).toBeInTheDocument(),
      );
      fireEvent.click(screen.getByTestId('dropdown-column-name-trigger'));
      await waitFor(() =>
        expect(screen.getByTestId('dropdown-option-prod_kind')).toBeInTheDocument(),
      );
    }

    it('TS-F075-FE-V147-FE-01：選有 columnDescription 欄位 → displayName 自動填入 + hint 顯示', async () => {
      await openModalAndDropdown();

      // displayName 初始為空白
      const input = screen.getByTestId('input-display-name') as HTMLInputElement;
      expect(input.value).toBe('');
      expect(
        screen.queryByTestId('displayname-autofilled-hint'),
      ).not.toBeInTheDocument();

      // 選含 columnDescription 的欄位
      fireEvent.click(screen.getByTestId('dropdown-option-prod_kind'));

      // input 自動填入 columnDescription
      await waitFor(() => {
        const updated = screen.getByTestId('input-display-name') as HTMLInputElement;
        expect(updated.value).toBe('產品類別');
      });
      // hint 顯示
      expect(
        screen.getByTestId('displayname-autofilled-hint'),
      ).toBeInTheDocument();
    });

    it('TS-F075-FE-V147-FE-02：選無 columnDescription 欄位 → displayName 維持空白 + hint 不在 DOM', async () => {
      await openModalAndDropdown();

      fireEvent.click(screen.getByTestId('dropdown-option-cust_age'));

      // displayName 維持空白
      const input = screen.getByTestId('input-display-name') as HTMLInputElement;
      expect(input.value).toBe('');
      // hint 不在 DOM
      expect(
        screen.queryByTestId('displayname-autofilled-hint'),
      ).not.toBeInTheDocument();
    });

    it('TS-F075-FE-V147-FE-03：自動填入後使用者改寫 → hint 消失', async () => {
      await openModalAndDropdown();
      fireEvent.click(screen.getByTestId('dropdown-option-prod_kind'));

      await waitFor(() =>
        expect(screen.getByTestId('displayname-autofilled-hint')).toBeInTheDocument(),
      );

      // 使用者改寫
      fireEvent.change(screen.getByTestId('input-display-name'), {
        target: { value: '產品類別（覆寫）' },
      });

      // hint 消失
      expect(
        screen.queryByTestId('displayname-autofilled-hint'),
      ).not.toBeInTheDocument();
    });

    it('TS-F075-FE-V147-FE-04：input 已有內容 → 選欄位不覆寫 + hint 不出現', async () => {
      await openModalAndDropdown();

      // 使用者先輸入 displayName
      fireEvent.change(screen.getByTestId('input-display-name'), {
        target: { value: '使用者先輸入' },
      });

      // 再選含 columnDescription 的欄位
      fireEvent.click(screen.getByTestId('dropdown-option-prod_kind'));

      // input 維持使用者輸入值（不覆寫）
      const input = screen.getByTestId('input-display-name') as HTMLInputElement;
      expect(input.value).toBe('使用者先輸入');
      // hint 不出現
      expect(
        screen.queryByTestId('displayname-autofilled-hint'),
      ).not.toBeInTheDocument();
    });

    it('TS-F075-FE-V147-FE-05：關閉 modal 再重開 → hint 不在 DOM + input 為空', async () => {
      await openModalAndDropdown();
      fireEvent.click(screen.getByTestId('dropdown-option-prod_kind'));

      await waitFor(() =>
        expect(screen.getByTestId('displayname-autofilled-hint')).toBeInTheDocument(),
      );

      // 關閉 modal（點 modal 背景）
      const modal = screen.getByTestId('create-field-modal');
      // 模擬點背景遮罩
      const backdrop = modal.querySelector('.bg-black\\/50') as HTMLElement;
      fireEvent.click(backdrop);

      await waitFor(() =>
        expect(screen.queryByTestId('create-field-modal')).not.toBeInTheDocument(),
      );

      // 重開
      fireEvent.click(screen.getByTestId('btn-create-field'));
      await waitFor(() =>
        expect(screen.getByTestId('create-field-modal')).toBeInTheDocument(),
      );

      // hint 不在 DOM
      expect(
        screen.queryByTestId('displayname-autofilled-hint'),
      ).not.toBeInTheDocument();
      // input 為空
      const input = screen.getByTestId('input-display-name') as HTMLInputElement;
      expect(input.value).toBe('');
    });

    it('TS-F075-FE-V147-FE-06：Edit Modal 開啟 → hint 不在 DOM（sanity check：mode 隔離）', async () => {
      mockedUpdateField.mockResolvedValue({
        ...sampleFields[0],
      });
      renderPage();
      await waitFor(() => expect(screen.getByText('prod_kind')).toBeInTheDocument());

      // 開啟 Edit Modal
      fireEvent.click(screen.getByTestId('btn-edit-prod_kind'));
      await waitFor(() =>
        expect(screen.getByTestId('edit-field-modal')).toBeInTheDocument(),
      );

      // hint 不在 DOM
      expect(
        screen.queryByTestId('displayname-autofilled-hint'),
      ).not.toBeInTheDocument();
    });
  });
});
