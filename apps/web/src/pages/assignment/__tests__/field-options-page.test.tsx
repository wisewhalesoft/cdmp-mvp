import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { FieldOptionsPage } from '../field-options-page';
import { ToastProvider } from '@/components/ui/toast';
import * as poolApi from '@/api/pooldata-fields';
import * as authStore from '@/stores/auth-store';
import type { PooldataOption, PooldataField } from '@/api/pooldata-fields';

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
const mockedListOptions = vi.mocked(poolApi.listOptions);
const mockedCreateOption = vi.mocked(poolApi.createOption);
const mockedDeactivateOption = vi.mocked(poolApi.deactivateOption);
const mockedReactivateOption = vi.mocked(poolApi.reactivateOption);
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
    columnName: 'list_type',
    displayName: '名單類別',
    fieldType: 'categorical',
    isActive: true,
    createdAt: '2026-05-15T00:00:00.000Z',
    updatedAt: '2026-05-15T00:00:00.000Z',
  },
  // 非 categorical — 應被過濾
  {
    columnName: 'amount',
    displayName: '金額',
    fieldType: 'numeric',
    isActive: true,
    createdAt: '2026-05-16T00:00:00.000Z',
    updatedAt: '2026-05-16T00:00:00.000Z',
  },
];

const prodKindOptions: PooldataOption[] = [
  {
    columnName: 'prod_kind',
    optionValue: 'M3',
    optionLabel: '第三類',
    isActive: true,
    createdAt: '2026-05-15T00:00:00.000Z',
    updatedAt: '2026-05-15T00:00:00.000Z',
  },
  {
    columnName: 'prod_kind',
    optionValue: 'M5',
    optionLabel: '第五類',
    isActive: false,
    deactivatedReason: 'manual',
    createdAt: '2026-05-14T00:00:00.000Z',
    updatedAt: '2026-05-15T00:00:00.000Z',
  },
  {
    columnName: 'prod_kind',
    optionValue: 'M9',
    optionLabel: '第九類（已類別變更）',
    isActive: false,
    deactivatedReason: 'field_type_changed',
    createdAt: '2026-05-14T00:00:00.000Z',
    updatedAt: '2026-05-15T00:00:00.000Z',
  },
];

const listTypeOptions: PooldataOption[] = [
  {
    columnName: 'list_type',
    optionValue: 'A',
    optionLabel: '一般名單',
    isActive: true,
    createdAt: '2026-05-15T00:00:00.000Z',
    updatedAt: '2026-05-15T00:00:00.000Z',
  },
];

function setupHappyPath() {
  mockedListFields.mockResolvedValue({ fields: sampleFields });
  mockedListOptions.mockImplementation((col) => {
    if (col === 'prod_kind') {
      return Promise.resolve({ options: prodKindOptions });
    }
    if (col === 'list_type') {
      return Promise.resolve({ options: listTypeOptions });
    }
    return Promise.resolve({ options: [] });
  });
}

function renderPage(query = '') {
  const entry = query
    ? `/assignment/whitelist/options?${query}`
    : '/assignment/whitelist/options';
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <ToastProvider>
        <Routes>
          <Route path="/assignment/whitelist/options" element={<FieldOptionsPage />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('FieldOptionsPage (F076 v1.4.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 清理 localStorage 避免測試污染
    try {
      const keys: string[] = [];
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith('cdmp.f076.acc.')) keys.push(k);
      }
      keys.forEach((k) => window.localStorage.removeItem(k));
    } catch {
      /* ignore */
    }

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
    setupHappyPath();
  });

  afterEach(() => cleanup());

  it('TS-F076-FE-BREADCRUMB：三層麵包屑「代碼維護 → 篩選欄位管理 → 類別型欄位可選值」', async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId('accordion-prod_kind')).toBeInTheDocument(),
    );
    const breadcrumb = screen.getByRole('navigation', { name: '麵包屑' });
    expect(
      within(breadcrumb).getByRole('link', { name: '代碼維護' }),
    ).toHaveAttribute('href', '/assignment/base-codes');
    expect(
      within(breadcrumb).getByRole('link', { name: '篩選欄位管理' }),
    ).toHaveAttribute('href', '/assignment/whitelist');
    expect(within(breadcrumb).getByText('類別型欄位可選值')).toBeInTheDocument();
    expect(
      within(breadcrumb).queryByRole('link', { name: '類別型欄位可選值' }),
    ).toBeNull();
  });

  // ============================================================
  // F076 v1.4.5 — prototype 對齊翻新（多欄位 accordion master）
  // ============================================================

  describe('F076 v1.4.5 — 多欄位 accordion 架構', () => {
    it('TS-F076-FE-V145-001：載入呼叫 listFields({active:"true"}) → Promise.all listOptions(N 次)', async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByTestId('accordion-prod_kind')).toBeInTheDocument(),
      );

      expect(mockedListFields).toHaveBeenCalledWith({ active: 'true' });

      // 2 個 categorical 欄位（prod_kind / list_type），amount 為 numeric 不應被呼叫
      expect(mockedListOptions).toHaveBeenCalledTimes(2);
      const calledCols = mockedListOptions.mock.calls.map((c) => c[0]).sort();
      expect(calledCols).toEqual(['list_type', 'prod_kind']);
      // amount 不被呼叫
      expect(calledCols).not.toContain('amount');
    });

    it('TS-F076-FE-V145-002：無 ?col= query 不報錯，正常渲染', async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByTestId('accordion-prod_kind')).toBeInTheDocument(),
      );
      expect(screen.queryByTestId('options-error')).not.toBeInTheDocument();
    });

    it('TS-F076-FE-V145-003：?col=prod_kind hint → 該 accordion 展開、其他 collapsed', async () => {
      renderPage('col=prod_kind');
      await waitFor(() =>
        expect(screen.getByTestId('accordion-prod_kind')).toBeInTheDocument(),
      );
      // 等待 hint 處理完成（state initialization 為 effect）
      await waitFor(() =>
        expect(
          screen.getByTestId('accordion-prod_kind').getAttribute('data-state'),
        ).toBe('open'),
      );
      expect(screen.getByTestId('accordion-list_type').getAttribute('data-state')).toBe(
        'closed',
      );
    });

    it('TS-F076-FE-V145-004：localStorage cdmp.f076.acc.prod_kind.expanded=1 → 該 accordion 預設展開', async () => {
      try {
        window.localStorage.setItem('cdmp.f076.acc.prod_kind.expanded', '1');
      } catch {
        /* ignore */
      }
      renderPage();
      await waitFor(() =>
        expect(screen.getByTestId('accordion-prod_kind')).toBeInTheDocument(),
      );
      await waitFor(() =>
        expect(
          screen.getByTestId('accordion-prod_kind').getAttribute('data-state'),
        ).toBe('open'),
      );
    });

    it('TS-F076-FE-V145-005：「全部展開」按鈕 → 所有 accordion open + 寫入 localStorage', async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByTestId('accordion-prod_kind')).toBeInTheDocument(),
      );
      // 確認預設全部 closed
      expect(screen.getByTestId('accordion-prod_kind').getAttribute('data-state')).toBe(
        'closed',
      );
      expect(screen.getByTestId('accordion-list_type').getAttribute('data-state')).toBe(
        'closed',
      );

      fireEvent.click(screen.getByTestId('btn-expand-all'));

      await waitFor(() =>
        expect(
          screen.getByTestId('accordion-prod_kind').getAttribute('data-state'),
        ).toBe('open'),
      );
      expect(screen.getByTestId('accordion-list_type').getAttribute('data-state')).toBe(
        'open',
      );
      // localStorage 寫入
      expect(window.localStorage.getItem('cdmp.f076.acc.prod_kind.expanded')).toBe('1');
      expect(window.localStorage.getItem('cdmp.f076.acc.list_type.expanded')).toBe('1');
    });

    it('TS-F076-FE-V145-006：全頁統計 — 欄位 / 啟用值總和 / 停用值總和', async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByTestId('accordion-prod_kind')).toBeInTheDocument(),
      );

      // 預設 showInactive=false → 只載入 active options
      // 但 mock 直接回應，全頁統計依目前 items 內 options 計算
      // prod_kind: 1 active + 2 inactive；list_type: 1 active
      // 預設 showInactive=false → listOptions 帶 includeInactive=false 但 mock 不分流，仍回所有 3 筆
      // 這在 happy path 表示統計為 active=2 / inactive=2 / fields=2

      const stats = screen.getByTestId('option-stats');
      expect(stats).toBeInTheDocument();
      expect(screen.getByTestId('stats-fields-count').textContent).toBe('2');
      // active 總和 = 2（M3 + A）
      expect(screen.getByTestId('stats-active-count').textContent).toBe('2');
      // inactive 總和 = 2（M5 + M9）
      expect(screen.getByTestId('stats-inactive-count').textContent).toBe('2');
    });

    it('TS-F076-FE-V145-007：active option 顯示 btn-deactivate (ban icon)', async () => {
      renderPage('col=prod_kind');
      await waitFor(() =>
        expect(
          screen.getByTestId('accordion-prod_kind').getAttribute('data-state'),
        ).toBe('open'),
      );
      expect(screen.getByTestId('btn-deactivate-M3')).toBeInTheDocument();
    });

    it('TS-F076-FE-V145-008：showInactive=true → manual inactive option 顯示 btn-reactivate', async () => {
      renderPage('col=prod_kind');
      await waitFor(() =>
        expect(
          screen.getByTestId('accordion-prod_kind').getAttribute('data-state'),
        ).toBe('open'),
      );

      fireEvent.click(screen.getByTestId('toggle-include-inactive'));

      await waitFor(() =>
        expect(screen.getByTestId('btn-reactivate-M5')).toBeInTheDocument(),
      );
      const btn = screen.getByTestId('btn-reactivate-M5');
      expect(btn.getAttribute('data-blocked')).toBe('false');
    });

    it('TS-F076-FE-V145-009：三種狀態徽章字串「啟用」「自動停用（類別變更）」「手動停用」', async () => {
      renderPage('col=prod_kind');
      await waitFor(() =>
        expect(
          screen.getByTestId('accordion-prod_kind').getAttribute('data-state'),
        ).toBe('open'),
      );
      fireEvent.click(screen.getByTestId('toggle-include-inactive'));

      await waitFor(() =>
        expect(screen.getByTestId('status-badge-M9')).toBeInTheDocument(),
      );

      expect(screen.getByTestId('status-badge-M3').textContent).toContain('啟用');
      expect(screen.getByTestId('status-badge-M5').textContent).toContain('手動停用');
      expect(screen.getByTestId('status-badge-M9').textContent).toContain(
        '自動停用（類別變更）',
      );

      // Glossary regression — 不含禁用字串
      const acc = screen.getByTestId('accordion-prod_kind');
      expect(acc.textContent).not.toContain('啟用中');
      // M3 row 不應顯示「已停用」舊字串
      const m3Badge = screen.getByTestId('status-badge-M3');
      expect(m3Badge.textContent).not.toContain('已停用');
    });

    it('TS-F076-FE-V145-010：field_type_changed option → 點 reactivate → warning toast，不呼叫 API', async () => {
      renderPage('col=prod_kind');
      await waitFor(() =>
        expect(
          screen.getByTestId('accordion-prod_kind').getAttribute('data-state'),
        ).toBe('open'),
      );
      fireEvent.click(screen.getByTestId('toggle-include-inactive'));

      await waitFor(() =>
        expect(screen.getByTestId('btn-reactivate-M9')).toBeInTheDocument(),
      );
      const m9Btn = screen.getByTestId('btn-reactivate-M9');
      expect(m9Btn.getAttribute('data-blocked')).toBe('true');

      fireEvent.click(m9Btn);

      // API 不被呼叫
      expect(mockedReactivateOption).not.toHaveBeenCalled();
      // toast 含說明文字
      await waitFor(() => {
        expect(
          screen.queryByText(/請先於 F075 將欄位類別改回 categorical/),
        ).toBeTruthy();
      });
    });

    it('TS-F076-FE-V145-011：per-column 新增按鈕 — 每個 accordion 有對應 btn-add-option', async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByTestId('accordion-prod_kind')).toBeInTheDocument(),
      );
      // 展開後才能看到內部按鈕
      fireEvent.click(screen.getByTestId('btn-expand-all'));

      await waitFor(() =>
        expect(screen.getByTestId('btn-add-option-prod_kind')).toBeInTheDocument(),
      );
      expect(screen.getByTestId('btn-add-option-list_type')).toBeInTheDocument();
    });

    it('TS-F076-FE-V145-012：點 btn-add-option-prod_kind → modal 開啟並以該 col 為 context', async () => {
      mockedCreateOption.mockResolvedValue(prodKindOptions[0]);
      renderPage();
      await waitFor(() =>
        expect(screen.getByTestId('accordion-prod_kind')).toBeInTheDocument(),
      );
      fireEvent.click(screen.getByTestId('btn-expand-all'));
      await waitFor(() =>
        expect(screen.getByTestId('btn-add-option-prod_kind')).toBeInTheDocument(),
      );
      fireEvent.click(screen.getByTestId('btn-add-option-prod_kind'));

      await waitFor(() =>
        expect(screen.getByTestId('create-option-modal')).toBeInTheDocument(),
      );
      const modal = screen.getByTestId('create-option-modal');
      expect(modal.textContent).toContain('prod_kind');

      fireEvent.change(screen.getByTestId('input-option-value'), {
        target: { value: 'M7' },
      });
      fireEvent.change(screen.getByTestId('input-option-label'), {
        target: { value: '第七類' },
      });
      fireEvent.click(screen.getByRole('button', { name: '建立' }));

      await waitFor(() => expect(mockedCreateOption).toHaveBeenCalledTimes(1));
      expect(mockedCreateOption.mock.calls[0][0]).toBe('prod_kind');
      expect(mockedCreateOption.mock.calls[0][1]).toEqual({
        optionValue: 'M7',
        optionLabel: '第七類',
      });
    });

    it('TS-F076-FE-V145-013：搜尋 keyword「M3」→ 只渲染含 M3 的 accordion，其他自動隱藏', async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByTestId('accordion-prod_kind')).toBeInTheDocument(),
      );
      // 列出全部 2 個 accordion
      expect(screen.getByTestId('accordion-list_type')).toBeInTheDocument();

      // 輸入 keyword「M3」
      fireEvent.change(
        screen.getByPlaceholderText(/搜尋 column_name \/ value \/ label/),
        { target: { value: 'M3' } },
      );

      await waitFor(() => {
        // list_type 內無 M3 → 整個 accordion 隱藏
        expect(screen.queryByTestId('accordion-list_type')).not.toBeInTheDocument();
      });
      // prod_kind 仍存在
      expect(screen.getByTestId('accordion-prod_kind')).toBeInTheDocument();
    });

    it('TS-F076-FE-V145-014：section_chief → btn-add-option / btn-deactivate / btn-reactivate 全部 disabled', async () => {
      mockedGetEffectiveIdentity.mockReturnValue('section_chief');
      mockedGetBusinessRole.mockReturnValue('section_chief');
      renderPage('col=prod_kind');
      await waitFor(() =>
        expect(
          screen.getByTestId('accordion-prod_kind').getAttribute('data-state'),
        ).toBe('open'),
      );
      fireEvent.click(screen.getByTestId('toggle-include-inactive'));

      await waitFor(() =>
        expect(screen.getByTestId('btn-reactivate-M5')).toBeInTheDocument(),
      );

      expect(screen.getByTestId('btn-add-option-prod_kind')).toBeDisabled();
      expect(screen.getByTestId('btn-deactivate-M3')).toBeDisabled();
      expect(screen.getByTestId('btn-reactivate-M5')).toBeDisabled();
    });

    it('TS-F076-FE-V145-015：deactivate flow — modal reason 必填，提交呼叫 deactivateOption(col, val, { isActive, reason })', async () => {
      mockedDeactivateOption.mockResolvedValue({
        ...prodKindOptions[0],
        isActive: false,
      });
      renderPage('col=prod_kind');
      await waitFor(() =>
        expect(
          screen.getByTestId('accordion-prod_kind').getAttribute('data-state'),
        ).toBe('open'),
      );

      fireEvent.click(screen.getByTestId('btn-deactivate-M3'));
      await waitFor(() =>
        expect(screen.getByTestId('deactivate-modal')).toBeInTheDocument(),
      );

      const confirmBtn = screen.getByRole('button', { name: /確認停用/ });
      expect(confirmBtn).toBeDisabled();

      fireEvent.change(screen.getByTestId('input-deactivate-reason'), {
        target: { value: '已合併至 M5' },
      });
      expect(confirmBtn).not.toBeDisabled();

      fireEvent.click(confirmBtn);
      await waitFor(() =>
        expect(mockedDeactivateOption).toHaveBeenCalledWith('prod_kind', 'M3', {
          isActive: false,
          reason: '已合併至 M5',
        }),
      );
    });
  });

  // ============================================================
  // 既有 footer regression
  // ============================================================
  it('footer 顯示 F076 商業規則摘要', async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId('field-options-rules-footer')).toBeInTheDocument(),
    );
    const footer = screen.getByTestId('field-options-rules-footer');
    expect(footer.textContent).toContain('BR-1');
    expect(footer.textContent).toContain('F076');
  });
});
