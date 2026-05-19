import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { FieldOptionsPage } from '../field-options-page';
import { ToastProvider } from '@/components/ui/toast';
import * as poolApi from '@/api/pooldata-fields';
import * as authStore from '@/stores/auth-store';
import type { PooldataOption } from '@/api/pooldata-fields';

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

const mockedListOptions = vi.mocked(poolApi.listOptions);
const mockedCreateOption = vi.mocked(poolApi.createOption);
const mockedDeactivateOption = vi.mocked(poolApi.deactivateOption);
const mockedReactivateOption = vi.mocked(poolApi.reactivateOption);
const mockedGetUser = vi.mocked(authStore.getUser);
const mockedGetBusinessRole = vi.mocked(authStore.getBusinessRole);
const mockedGetEffectiveIdentity = vi.mocked(authStore.getEffectiveIdentity);

const sampleOptions: PooldataOption[] = [
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
    deactivatedReason: '已棄用',
    createdAt: '2026-05-14T00:00:00.000Z',
    updatedAt: '2026-05-15T00:00:00.000Z',
  },
];

function renderPage(col = 'prod_kind') {
  return render(
    <MemoryRouter initialEntries={[`/assignment/whitelist/options?col=${col}`]}>
      <ToastProvider>
        <Routes>
          <Route path="/assignment/whitelist/options" element={<FieldOptionsPage />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('FieldOptionsPage (F076)', () => {
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
    mockedListOptions.mockResolvedValue({ options: [sampleOptions[0]] });
  });

  afterEach(() => cleanup());

  it('缺少 col query → 顯示錯誤', async () => {
    renderPage('');
    await waitFor(() =>
      expect(screen.getByTestId('options-error')).toHaveTextContent(/缺少 col/),
    );
  });

  it('TS-F076-FE-BREADCRUMB：三層麵包屑「代碼維護 → 篩選欄位管理 → 類別型欄位可選值」，前兩層可點擊', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('M3')).toBeInTheDocument());

    const breadcrumb = screen.getByRole('navigation', { name: '麵包屑' });
    expect(breadcrumb).toBeInTheDocument();

    // 第一層「代碼維護」可點擊
    const codesLink = within(breadcrumb).getByRole('link', { name: '代碼維護' });
    expect(codesLink).toHaveAttribute('href', '/assignment/base-codes');

    // 第二層「篩選欄位管理」可點擊
    const whitelistLink = within(breadcrumb).getByRole('link', { name: '篩選欄位管理' });
    expect(whitelistLink).toHaveAttribute('href', '/assignment/whitelist');

    // 第三層「類別型欄位可選值」為當前頁面 span（非 link）
    expect(within(breadcrumb).getByText('類別型欄位可選值')).toBeInTheDocument();
    expect(within(breadcrumb).queryByRole('link', { name: '類別型欄位可選值' })).toBeNull();
  });

  it('渲染 active 可選值（預設不顯示已停用）', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('M3')).toBeInTheDocument());
    expect(mockedListOptions).toHaveBeenCalledWith('prod_kind', {
      includeInactive: 'false',
    });
  });

  it('toggle 顯示已停用 → re-fetch with includeInactive=true', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('M3')).toBeInTheDocument());
    mockedListOptions.mockResolvedValue({ options: sampleOptions });
    fireEvent.click(screen.getByTestId('toggle-include-inactive'));
    await waitFor(() =>
      expect(mockedListOptions).toHaveBeenCalledWith('prod_kind', {
        includeInactive: 'true',
      }),
    );
  });

  it('新增可選值 → 呼叫 createOption API', async () => {
    mockedCreateOption.mockResolvedValue(sampleOptions[0]);
    renderPage();
    await waitFor(() => expect(screen.getByText('M3')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('btn-create-option'));
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

  it('停用可選值 modal 需 reason 必填', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('M3')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('btn-deactivate-M3'));
    expect(screen.getByTestId('deactivate-modal')).toBeInTheDocument();

    const confirmBtn = screen.getByRole('button', { name: /確認停用/ });
    expect(confirmBtn).toBeDisabled();

    fireEvent.change(screen.getByTestId('input-deactivate-reason'), {
      target: { value: '棄用' },
    });
    expect(confirmBtn).not.toBeDisabled();
  });

  it('提交停用 → 呼叫 deactivateOption with reason', async () => {
    mockedDeactivateOption.mockResolvedValue({ ...sampleOptions[0], isActive: false });
    renderPage();
    await waitFor(() => expect(screen.getByText('M3')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('btn-deactivate-M3'));
    fireEvent.change(screen.getByTestId('input-deactivate-reason'), {
      target: { value: '棄用 — 已合併至 M5' },
    });
    fireEvent.click(screen.getByRole('button', { name: /確認停用/ }));

    await waitFor(() =>
      expect(mockedDeactivateOption).toHaveBeenCalledWith('prod_kind', 'M3', {
        isActive: false,
        reason: '棄用 — 已合併至 M5',
      }),
    );
  });

  it('已停用 row 顯示「重新啟用」按鈕並可呼叫 API', async () => {
    mockedListOptions.mockResolvedValue({ options: sampleOptions });
    mockedReactivateOption.mockResolvedValue({ ...sampleOptions[1], isActive: true });
    renderPage();
    await waitFor(() => expect(screen.getByText('M5')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('toggle-include-inactive'));
    await waitFor(() => expect(screen.getByTestId('btn-reactivate-M5')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('btn-reactivate-M5'));
    await waitFor(() =>
      expect(mockedReactivateOption).toHaveBeenCalledWith('prod_kind', 'M5'),
    );
  });

  describe('Phase 4 P3-4', () => {
    it('顯示總計 / 啟用 / 停用 統計列', async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByTestId('option-stats')).toBeInTheDocument(),
      );
      const stats = screen.getByTestId('option-stats');
      expect(stats.textContent).toMatch(/總計|筆/);
    });

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
});
