import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { FieldWhitelistPage } from '../field-whitelist-page';
import { ToastProvider } from '@/components/ui/toast';
import * as poolApi from '@/api/pooldata-fields';
import * as authStore from '@/stores/auth-store';
import type { PooldataField } from '@/api/pooldata-fields';

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
const mockedGetUser = vi.mocked(authStore.getUser);
const mockedGetBusinessRole = vi.mocked(authStore.getBusinessRole);
const mockedGetEffectiveIdentity = vi.mocked(authStore.getEffectiveIdentity);

const sampleFields: PooldataField[] = [
  {
    columnName: 'PROD_KIND',
    displayName: '產品類別',
    fieldType: 'categorical',
    isActive: true,
    createdAt: '2026-05-15T00:00:00.000Z',
    updatedAt: '2026-05-15T00:00:00.000Z',
  },
  {
    columnName: 'AMOUNT',
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
    await waitFor(() => expect(screen.getByText('PROD_KIND')).toBeInTheDocument());
    expect(screen.getByText('AMOUNT')).toBeInTheDocument();
    expect(screen.getByTestId('field-type-categorical')).toBeInTheDocument();
    expect(screen.getByTestId('field-type-numeric')).toBeInTheDocument();
  });

  it('section_chief 身份新增按鈕停用', async () => {
    mockedGetEffectiveIdentity.mockReturnValue('section_chief');
    mockedGetBusinessRole.mockReturnValue('section_chief');
    renderPage();
    await waitFor(() => expect(screen.getByText('PROD_KIND')).toBeInTheDocument());
    expect(screen.getByTestId('btn-create-field')).toBeDisabled();
  });

  it('director 點新增按鈕開啟 modal 並可提交', async () => {
    mockedCreateField.mockResolvedValue({
      ...sampleFields[0],
      columnName: 'NEW_COL',
      displayName: '新欄位',
    });
    renderPage();
    await waitFor(() => expect(screen.getByText('PROD_KIND')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('btn-create-field'));
    expect(screen.getByTestId('create-field-modal')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('input-column-name'), {
      target: { value: 'NEW_COL' },
    });
    fireEvent.change(screen.getByTestId('input-display-name'), {
      target: { value: '新欄位' },
    });
    fireEvent.click(screen.getByRole('button', { name: '建立' }));

    await waitFor(() => expect(mockedCreateField).toHaveBeenCalledTimes(1));
    expect(mockedCreateField.mock.calls[0][0]).toMatchObject({
      columnName: 'NEW_COL',
      displayName: '新欄位',
      fieldType: 'categorical',
    });
  });

  it('column_name 數字開頭（regex 不符）→ 顯示錯誤', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('PROD_KIND')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('btn-create-field'));
    // 1NAME 開頭數字 — 即使被 uppercase 也不符 ^[A-Z][A-Z0-9_]*$
    fireEvent.change(screen.getByTestId('input-column-name'), {
      target: { value: '1NAME' },
    });
    fireEvent.change(screen.getByTestId('input-display-name'), {
      target: { value: '名稱' },
    });
    fireEvent.click(screen.getByRole('button', { name: '建立' }));
    await waitFor(() =>
      expect(screen.getByTestId('create-error')).toHaveTextContent(/大寫英文/),
    );
    expect(mockedCreateField).not.toHaveBeenCalled();
  });

  it('停用 categorical 欄位 → 預查 active count 並顯示級聯 modal', async () => {
    mockedGetCount.mockResolvedValue({
      columnName: 'PROD_KIND',
      activeCount: 5,
    });
    renderPage();
    await waitFor(() => expect(screen.getByText('PROD_KIND')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('btn-disable-PROD_KIND'));
    await waitFor(() =>
      expect(screen.getByTestId('category-switch-modal')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('active-count')).toHaveTextContent('5');
  });

  it('停用 numeric 欄位 → 顯示一般 confirm modal（無級聯）', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('AMOUNT')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('btn-disable-AMOUNT'));
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
        expect(screen.getByText('AMOUNT')).toBeInTheDocument(),
      );
      fireEvent.change(screen.getByTestId('filter-type'), {
        target: { value: 'numeric' },
      });
      // PROD_KIND (categorical) 應被過濾掉
      expect(screen.queryByText('PROD_KIND')).not.toBeInTheDocument();
      // AMOUNT (numeric) 仍在
      expect(screen.getByText('AMOUNT')).toBeInTheDocument();
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
});
