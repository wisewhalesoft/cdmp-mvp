/**
 * F112 / US-178 — 進入點 2（可選值管理頁）從實際資料批次帶入
 *
 * 對應 prototype: /prototypes/37-base-code.html #bulkImportModal（L426-513）+ 按鈕 L230-232
 * 測試設計：docs/test-specs/features/F112-test.md
 *   - FE2（7）：按鈕可見性（director / numeric / 處長不渲染）+ 去重清單 + 無新可帶入 + 確認帶入刷新
 *   - FEREG（2）：既有逐筆新增流程 + numeric/date 行為不受影響
 *
 * ⚠️ FE2-003 紅線：處長（section_chief）身份下「從實際資料帶入可選值」按鈕須
 *   **完全不渲染**（queryByTestId === null），非既有「新增可選值」之 disabled-but-visible 模式。
 */
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { OptionsTab } from '../options-tab';
import { ToastProvider } from '@/components/ui/toast';
import * as poolApi from '@/api/pooldata-fields';
import * as authStore from '@/stores/auth-store';
import type { DistinctValuesResponse, PooldataField } from '@/api/pooldata-fields';

vi.mock('@/api/pooldata-fields');
vi.mock('@/stores/auth-store');

const mockedListFields = vi.mocked(poolApi.listFields);
const mockedListOptions = vi.mocked(poolApi.listOptions);
const mockedGetDistinct = vi.mocked(poolApi.getDistinctValues);
const mockedCreateBulk = vi.mocked(poolApi.createOptionsBulk);
const mockedCreateOption = vi.mocked(poolApi.createOption);

const prodKind: PooldataField = {
  columnName: 'prod_kind',
  displayName: '產品類別',
  fieldType: 'categorical',
  isActive: true,
  dataSource: 'ob_pool_data',
  createdAt: '2026-05-01T00:00:00Z',
  updatedAt: '2026-05-01T00:00:00Z',
};

const numericField: PooldataField = {
  columnName: 'date_of_birth',
  displayName: '年齡',
  fieldType: 'numeric',
  isActive: true,
  dataSource: 'customer_core',
  createdAt: '2026-05-01T00:00:00Z',
  updatedAt: '2026-05-01T00:00:00Z',
};

function renderAt(path = '/assignment/field-base?tab=options') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ToastProvider>
        <Routes>
          <Route path="/assignment/field-base" element={<OptionsTab />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

function distinctResponse(
  values: Array<{ value: string; alreadyOption: boolean }>,
  extra: Partial<DistinctValuesResponse> = {},
): DistinctValuesResponse {
  return {
    columnName: 'prod_kind',
    dataSource: 'ob_pool_data',
    values,
    totalReturned: values.length,
    truncated: false,
    cap: 200,
    ...extra,
  };
}

describe('F112 OptionsTab 進入點 2 — 批次帶入按鈕 + Modal（FE2）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authStore.getEffectiveIdentity).mockReturnValue('director');
    mockedListFields.mockResolvedValue({ fields: [prodKind] });
    mockedListOptions.mockResolvedValue({ options: [] });
    mockedCreateBulk.mockResolvedValue({
      columnName: 'prod_kind',
      createdCount: 0,
      skippedCount: 0,
      options: [],
    });
  });
  afterEach(() => cleanup());

  it('FE2-001：categorical 欄位對部長顯示「從實際資料帶入可選值」按鈕', async () => {
    renderAt();
    expect(
      await screen.findByTestId('btn-import-options-prod_kind'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('btn-import-options-prod_kind')).toHaveTextContent(
      '從實際資料帶入可選值',
    );
  });

  it('FE2-002：numeric 欄位不顯示此按鈕（numeric 欄位不進 categorical 清單）', async () => {
    mockedListFields.mockResolvedValue({ fields: [prodKind, numericField] });
    renderAt();
    await waitFor(() => expect(mockedListFields).toHaveBeenCalled());
    // 選中的 categorical 有按鈕；numeric 欄位不在清單、無其按鈕
    expect(await screen.findByTestId('btn-import-options-prod_kind')).toBeInTheDocument();
    expect(screen.queryByTestId('btn-import-options-date_of_birth')).toBeNull();
    expect(screen.queryByTestId('column-item-date_of_birth')).toBeNull();
  });

  it('FE2-003：⚠️ 處長身份下按鈕完全不渲染（queryByTestId === null，非 disabled）', async () => {
    vi.mocked(authStore.getEffectiveIdentity).mockReturnValue('section_chief');
    renderAt();
    // 頁面正常載入（詳情工具列存在），但新按鈕不在 DOM
    await waitFor(() => expect(mockedListFields).toHaveBeenCalled());
    await screen.findByTestId('options-detail-toolbar');
    expect(screen.queryByTestId('btn-import-options-prod_kind')).toBeNull();
    // 既有「新增可選值」按鈕仍在 DOM（disabled-but-visible 模式），作為對照
    expect(screen.getByTestId('btn-create-option')).toBeInTheDocument();
  });

  it('FE2-004：點擊按鈕 → getDistinctValues → Modal 僅列 alreadyOption===false 候選、全選', async () => {
    mockedGetDistinct.mockResolvedValue(
      distinctResponse([
        { value: 'A', alreadyOption: true },
        { value: 'B', alreadyOption: false },
        { value: 'C', alreadyOption: false },
      ]),
    );
    renderAt();
    fireEvent.click(await screen.findByTestId('btn-import-options-prod_kind'));

    await waitFor(() => expect(mockedGetDistinct).toHaveBeenCalledWith('prod_kind'));
    await screen.findByTestId('bi-ready');
    // 僅 B、C（排除已存在的 A）
    expect(screen.getByTestId('bi-distinct-check-B')).toBeInTheDocument();
    expect(screen.getByTestId('bi-distinct-check-C')).toBeInTheDocument();
    expect(screen.queryByTestId('bi-distinct-check-A')).toBeNull();
    // 兩者皆預設勾選
    expect((screen.getByTestId('bi-distinct-check-B') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByTestId('bi-distinct-check-C') as HTMLInputElement).checked).toBe(true);
    expect(screen.getByTestId('bi-sel-count').textContent).toBe('2');
  });

  it('FE2-005：全部候選皆已存在（alreadyOption 全 true）→ 「無新可選值可帶入」，非空清單', async () => {
    mockedGetDistinct.mockResolvedValue(
      distinctResponse([
        { value: 'A', alreadyOption: true },
        { value: 'B', alreadyOption: true },
      ]),
    );
    renderAt();
    fireEvent.click(await screen.findByTestId('btn-import-options-prod_kind'));

    const noNew = await screen.findByTestId('bi-no-new');
    expect(noNew.textContent).toContain('無新可選值可帶入');
    // 非空核取清單
    expect(screen.queryByTestId('bi-list')).toBeNull();
    // 使用者可正常關閉（確認按鈕 disabled）
    expect(
      (screen.getByTestId('btn-confirm-bulk-import') as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('FE2-006：確認新增 → createOptionsBulk（僅勾選值）→ 成功後 listOptions 刷新 + 結果 toast', async () => {
    mockedGetDistinct.mockResolvedValue(
      distinctResponse([
        { value: 'A', alreadyOption: false },
        { value: 'B', alreadyOption: false },
        { value: 'C', alreadyOption: false },
        { value: 'D', alreadyOption: false },
      ]),
    );
    mockedCreateBulk.mockResolvedValue({
      columnName: 'prod_kind',
      createdCount: 4,
      skippedCount: 0,
      options: [
        { optionValue: 'A', optionLabel: 'A', isActive: true },
        { optionValue: 'B', optionLabel: 'B', isActive: true },
        { optionValue: 'C', optionLabel: 'C', isActive: true },
        { optionValue: 'D', optionLabel: 'D', isActive: true },
      ],
    });
    renderAt();
    fireEvent.click(await screen.findByTestId('btn-import-options-prod_kind'));
    await screen.findByTestId('bi-ready');
    expect(screen.getByTestId('bi-sel-count').textContent).toBe('4');

    mockedListOptions.mockClear();
    fireEvent.click(screen.getByTestId('btn-confirm-bulk-import'));

    await waitFor(() =>
      expect(mockedCreateBulk).toHaveBeenCalledWith('prod_kind', [
        { optionValue: 'A', optionLabel: 'A' },
        { optionValue: 'B', optionLabel: 'B' },
        { optionValue: 'C', optionLabel: 'C' },
        { optionValue: 'D', optionLabel: 'D' },
      ]),
    );
    // 列表刷新（重新呼叫 listOptions）
    await waitFor(() => expect(mockedListOptions).toHaveBeenCalled());
    // 結果 toast 含 createdCount
    expect(await screen.findByText(/已帶入 4 筆可選值/)).toBeInTheDocument();
    // Modal 關閉
    await waitFor(() => expect(screen.queryByTestId('bulk-import-modal')).toBeNull());
  });

  it('FE2-007：取消部分勾選 → 未勾選項不進入 createOptionsBulk payload', async () => {
    mockedGetDistinct.mockResolvedValue(
      distinctResponse([
        { value: 'A', alreadyOption: false },
        { value: 'B', alreadyOption: false },
        { value: 'C', alreadyOption: false },
        { value: 'D', alreadyOption: false },
      ]),
    );
    mockedCreateBulk.mockResolvedValue({
      columnName: 'prod_kind',
      createdCount: 3,
      skippedCount: 0,
      options: [],
    });
    renderAt();
    fireEvent.click(await screen.findByTestId('btn-import-options-prod_kind'));
    await screen.findByTestId('bi-ready');

    fireEvent.click(screen.getByTestId('bi-distinct-check-C')); // 取消 C
    expect(screen.getByTestId('bi-sel-count').textContent).toBe('3');

    fireEvent.click(screen.getByTestId('btn-confirm-bulk-import'));
    await waitFor(() =>
      expect(mockedCreateBulk).toHaveBeenCalledWith('prod_kind', [
        { optionValue: 'A', optionLabel: 'A' },
        { optionValue: 'B', optionLabel: 'B' },
        { optionValue: 'D', optionLabel: 'D' },
      ]),
    );
  });
});

describe('F112 OptionsTab — 不變範圍 regression（FEREG）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authStore.getEffectiveIdentity).mockReturnValue('director');
    mockedListFields.mockResolvedValue({ fields: [prodKind] });
    mockedListOptions.mockResolvedValue({ options: [] });
  });
  afterEach(() => cleanup());

  it('FEREG-001：新增之批次帶入 Modal 與既有「新增可選值」Modal 並存、預設皆不開啟', async () => {
    renderAt();
    await waitFor(() => expect(mockedListFields).toHaveBeenCalled());
    // 初始兩個 Modal 皆未開啟
    expect(screen.queryByTestId('bulk-import-modal')).toBeNull();
    expect(screen.queryByTestId('create-option-modal')).toBeNull();
    // 兩個入口按鈕皆存在（互不干擾）
    expect(screen.getByTestId('btn-import-options-prod_kind')).toBeInTheDocument();
    expect(screen.getByTestId('btn-create-option')).toBeInTheDocument();
  });

  it('FEREG-002：既有「逐筆新增可選值」流程不受影響（createOption 單筆呼叫）', async () => {
    mockedCreateOption.mockResolvedValue({
      columnName: 'prod_kind',
      optionValue: '05',
      optionLabel: '新產品',
      isActive: true,
      createdAt: '',
      updatedAt: '',
    } as never);
    renderAt();
    await waitFor(() => expect(mockedListFields).toHaveBeenCalled());

    fireEvent.click(screen.getByTestId('btn-create-option'));
    await screen.findByTestId('create-option-modal');
    // 批次帶入 Modal 不因此開啟
    expect(screen.queryByTestId('bulk-import-modal')).toBeNull();

    fireEvent.change(screen.getByTestId('input-option-label'), {
      target: { value: '新產品' },
    });
    fireEvent.change(screen.getByTestId('input-option-value'), {
      target: { value: '05' },
    });
    fireEvent.click(screen.getByText('建立'));

    await waitFor(() =>
      expect(mockedCreateOption).toHaveBeenCalledWith('prod_kind', {
        optionValue: '05',
        optionLabel: '新產品',
      }),
    );
    // 批次端點未被誤觸
    expect(mockedCreateBulk).not.toHaveBeenCalled();
  });
});
