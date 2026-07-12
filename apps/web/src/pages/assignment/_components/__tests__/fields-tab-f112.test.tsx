/**
 * F112 / US-178 — 進入點 1（新增欄位 Modal）distinct 偵測核取清單 + 儲存編排
 *
 * 對應 prototype: /prototypes/37-base-code.html #cfDistinctSection（L313-380）
 * 測試設計：docs/test-specs/features/F112-test.md
 *   - FE1（7）：核心流程（偵測 / 勾選 / 全選清除 / numeric 不觸發 / 儲存編排 / 全清 / bulk 失敗）
 *   - FE1STATE（6）：五態呈現（loading / empty / truncated / 503 / 500+重試 / regression 非空白）
 *
 * 權威來源優先序：test design > spec > AD > prototype。
 *   - 空狀態文案採 AC-14/spec §7.2 之「未偵測到任何可選值」（prototype 為「該欄位查無資料」，
 *     此處以較高權威之 AC 文案為準；prototype 之解釋性次文案保留）。
 *   - 503 未就緒 vs 500 逾時：AC-12/AC-13 + FE1STATE-004/005 要求兩者文案「明確區隔」，
 *     故實作以 error.response.data.error 代碼字串分流（prototype 僅單一 error 態，此為刻意細化）。
 */
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { FieldsTab } from '../fields-tab';
import { ToastProvider } from '@/components/ui/toast';
import * as poolApi from '@/api/pooldata-fields';
import * as authStore from '@/stores/auth-store';
import type { DistinctValuesResponse } from '@/api/pooldata-fields';

vi.mock('@/api/pooldata-fields');
vi.mock('@/stores/auth-store');

const mockedListFields = vi.mocked(poolApi.listFields);
const mockedListAvailable = vi.mocked(poolApi.listAvailableColumns);
const mockedCreateField = vi.mocked(poolApi.createField);
const mockedGetDistinct = vi.mocked(poolApi.getDistinctValues);
const mockedCreateBulk = vi.mocked(poolApi.createOptionsBulk);

function renderTab() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <FieldsTab />
      </ToastProvider>
    </MemoryRouter>,
  );
}

function distinctResponse(
  values: Array<{ value: string; alreadyOption?: boolean }>,
  extra: Partial<DistinctValuesResponse> = {},
): DistinctValuesResponse {
  return {
    columnName: 'risk_level',
    dataSource: 'ob_pool_data',
    values: values.map((v) => ({ value: v.value, alreadyOption: v.alreadyOption ?? false })),
    totalReturned: values.length,
    truncated: false,
    cap: 200,
    ...extra,
  };
}

async function openModal() {
  fireEvent.click(screen.getByTestId('btn-create-field'));
  await waitFor(() => expect(mockedListAvailable).toHaveBeenCalled());
  fireEvent.click(screen.getByTestId('dropdown-column-name-trigger'));
}

async function selectColumn(col: string) {
  fireEvent.click(await screen.findByTestId(`dropdown-option-${col}`));
}

describe('F112 FieldsTab 進入點 1 — 偵測核取清單（FE1）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authStore.getEffectiveIdentity).mockReturnValue('director');
    mockedListFields.mockResolvedValue({ fields: [] });
    mockedListAvailable.mockResolvedValue({
      availableColumns: [
        {
          columnName: 'risk_level',
          dataType: 'varchar',
          suggestedFieldType: 'categorical',
          columnDescription: '風險等級',
        },
        {
          columnName: 'month_cnt',
          dataType: 'int',
          suggestedFieldType: 'numeric',
          columnDescription: '撈取月份計數',
        },
      ],
    });
    mockedCreateField.mockResolvedValue({
      columnName: 'risk_level',
      displayName: '風險等級',
      fieldType: 'categorical',
      isActive: true,
      createdAt: '2026-07-12T00:00:00Z',
      updatedAt: '2026-07-12T00:00:00Z',
    } as never);
    mockedCreateBulk.mockResolvedValue({
      columnName: 'risk_level',
      createdCount: 0,
      skippedCount: 0,
      options: [],
    });
    mockedGetDistinct.mockResolvedValue(
      distinctResponse([{ value: '01' }, { value: '02' }]),
    );
  });
  afterEach(() => cleanup());

  it('FE1-001：選定類別型欄位 → 呼叫 getDistinctValues，渲染核取清單全選', async () => {
    renderTab();
    await waitFor(() => expect(mockedListFields).toHaveBeenCalled());
    await openModal();
    await selectColumn('risk_level');

    await waitFor(() => expect(mockedGetDistinct).toHaveBeenCalledWith('risk_level'));
    expect(mockedGetDistinct).toHaveBeenCalledTimes(1);

    await screen.findByTestId('cf-distinct-ready');
    // 2 個候選皆預設勾選
    expect((screen.getByTestId('cf-distinct-check-01') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByTestId('cf-distinct-check-02') as HTMLInputElement).checked).toBe(true);
    // 標題文案（偵測到 N 個可選值）
    expect(screen.getByTestId('cf-heading-count').textContent).toBe('2');
    expect(screen.getByTestId('cf-distinct-ready').textContent).toContain(
      '偵測到',
    );
    expect(screen.getByTestId('cf-distinct-ready').textContent).toContain(
      '是否一併新增',
    );
  });

  it('FE1-002：可個別取消勾選候選值', async () => {
    mockedGetDistinct.mockResolvedValue(
      distinctResponse([
        { value: '01' },
        { value: '02' },
        { value: '03' },
        { value: '04' },
        { value: '05' },
      ]),
    );
    renderTab();
    await waitFor(() => expect(mockedListFields).toHaveBeenCalled());
    await openModal();
    await selectColumn('risk_level');
    await screen.findByTestId('cf-distinct-ready');

    fireEvent.click(screen.getByTestId('cf-distinct-check-02'));
    fireEvent.click(screen.getByTestId('cf-distinct-check-04'));

    expect((screen.getByTestId('cf-distinct-check-02') as HTMLInputElement).checked).toBe(false);
    expect((screen.getByTestId('cf-distinct-check-04') as HTMLInputElement).checked).toBe(false);
    // 其餘 3 個仍勾選
    expect((screen.getByTestId('cf-distinct-check-01') as HTMLInputElement).checked).toBe(true);
    expect(screen.getByTestId('cf-sel-count').textContent).toBe('3');
    // 欄位建立表單其他元件不受影響（顯示名稱仍為自動帶入值）
    expect((screen.getByTestId('input-display-name') as HTMLInputElement).value).toBe('風險等級');
  });

  it('FE1-003：全選 / 清除捷徑 + 即時計數', async () => {
    mockedGetDistinct.mockResolvedValue(
      distinctResponse([
        { value: '01' },
        { value: '02' },
        { value: '03' },
        { value: '04' },
        { value: '05' },
      ]),
    );
    renderTab();
    await waitFor(() => expect(mockedListFields).toHaveBeenCalled());
    await openModal();
    await selectColumn('risk_level');
    await screen.findByTestId('cf-distinct-ready');

    expect(screen.getByTestId('cf-sel-count').textContent).toBe('5');
    fireEvent.click(screen.getByTestId('cf-select-clear'));
    expect(screen.getByTestId('cf-sel-count').textContent).toBe('0');
    expect((screen.getByTestId('cf-distinct-check-01') as HTMLInputElement).checked).toBe(false);
    fireEvent.click(screen.getByTestId('cf-select-all'));
    expect(screen.getByTestId('cf-sel-count').textContent).toBe('5');
    expect((screen.getByTestId('cf-distinct-check-05') as HTMLInputElement).checked).toBe(true);
  });

  it('FE1-004：選定數值型欄位 → 不呼叫 getDistinctValues、無核取清單；切回 numeric 清除清單', async () => {
    renderTab();
    await waitFor(() => expect(mockedListFields).toHaveBeenCalled());
    await openModal();
    await selectColumn('month_cnt');

    // 數值型 → 不呼叫 distinct、無偵測區塊
    await waitFor(() =>
      expect((screen.getByTestId('input-display-name') as HTMLInputElement).value).toBe(
        '撈取月份計數',
      ),
    );
    expect(mockedGetDistinct).not.toHaveBeenCalled();
    expect(screen.queryByTestId('cf-distinct-section')).toBeNull();

    // 切為 categorical → 觸發偵測 → 顯示清單
    fireEvent.click(screen.getByTestId('field-type-radio-categorical'));
    await screen.findByTestId('cf-distinct-ready');
    expect(mockedGetDistinct).toHaveBeenCalledTimes(1);

    // 再切回 numeric → 清單清除、無區塊
    fireEvent.click(screen.getByTestId('field-type-radio-numeric'));
    await waitFor(() => expect(screen.queryByTestId('cf-distinct-section')).toBeNull());
    expect(mockedGetDistinct).toHaveBeenCalledTimes(1); // 切回不再呼叫
  });

  it('FE1-005：儲存時 createField 先於 createOptionsBulk，且 bulk payload optionValue===optionLabel===勾選值', async () => {
    mockedGetDistinct.mockResolvedValue(
      distinctResponse([{ value: '01' }, { value: '02' }, { value: '03' }]),
    );
    renderTab();
    await waitFor(() => expect(mockedListFields).toHaveBeenCalled());
    await openModal();
    await selectColumn('risk_level');
    await screen.findByTestId('cf-distinct-ready');

    fireEvent.click(screen.getByTestId('btn-submit-create-field'));

    await waitFor(() => expect(mockedCreateBulk).toHaveBeenCalled());
    // 呼叫順序：createField 先於 createOptionsBulk
    expect(mockedCreateField.mock.invocationCallOrder[0]).toBeLessThan(
      mockedCreateBulk.mock.invocationCallOrder[0],
    );
    expect(mockedCreateField).toHaveBeenCalledWith({
      columnName: 'risk_level',
      displayName: '風險等級',
      fieldType: 'categorical',
    });
    // bulk payload：3 筆，optionValue===optionLabel===勾選值本身
    expect(mockedCreateBulk).toHaveBeenCalledWith('risk_level', [
      { optionValue: '01', optionLabel: '01' },
      { optionValue: '02', optionLabel: '02' },
      { optionValue: '03', optionLabel: '03' },
    ]);
  });

  it('FE1-006：全部取消勾選後儲存 → 僅呼叫 createField，不呼叫 createOptionsBulk', async () => {
    mockedGetDistinct.mockResolvedValue(
      distinctResponse([{ value: '01' }, { value: '02' }]),
    );
    renderTab();
    await waitFor(() => expect(mockedListFields).toHaveBeenCalled());
    await openModal();
    await selectColumn('risk_level');
    await screen.findByTestId('cf-distinct-ready');

    fireEvent.click(screen.getByTestId('cf-select-clear'));
    expect(screen.getByTestId('cf-sel-count').textContent).toBe('0');

    fireEvent.click(screen.getByTestId('btn-submit-create-field'));
    await waitFor(() => expect(mockedCreateField).toHaveBeenCalled());
    expect(mockedCreateBulk).not.toHaveBeenCalled();
  });

  it('FE1-007：createField 成功、createOptionsBulk 失敗 → 非阻斷警告，欄位建立仍視為成功', async () => {
    mockedGetDistinct.mockResolvedValue(
      distinctResponse([{ value: '01' }, { value: '02' }]),
    );
    mockedCreateBulk.mockRejectedValue({ response: { data: { message: 'boom' } } });
    renderTab();
    await waitFor(() => expect(mockedListFields).toHaveBeenCalled());
    await openModal();
    await selectColumn('risk_level');
    await screen.findByTestId('cf-distinct-ready');

    fireEvent.click(screen.getByTestId('btn-submit-create-field'));

    // 非阻斷警告 toast
    expect(
      await screen.findByText(/欄位已建立，但可選值帶入失敗/),
    ).toBeInTheDocument();
    // 欄位建立仍視為成功：createField 已呼叫、Modal 關閉、列表重新載入
    expect(mockedCreateField).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByTestId('create-field-modal')).toBeNull());
    // listFields 於 mount(1) + 建立後刷新(2)
    expect(mockedListFields.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});

describe('F112 FieldsTab 進入點 1 — 五態呈現（FE1STATE）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authStore.getEffectiveIdentity).mockReturnValue('director');
    mockedListFields.mockResolvedValue({ fields: [] });
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
  });
  afterEach(() => cleanup());

  it('FE1STATE-001：loading — 偵測進行中顯示載入指示，非空白', async () => {
    // 永不 resolve 的 promise → 停在 loading
    mockedGetDistinct.mockReturnValue(new Promise(() => {}) as never);
    renderTab();
    await waitFor(() => expect(mockedListFields).toHaveBeenCalled());
    await openModal();
    await selectColumn('risk_level');
    expect(await screen.findByTestId('cf-distinct-loading')).toBeInTheDocument();
    expect(screen.getByTestId('cf-distinct-loading').textContent).toContain('讀取');
  });

  it('FE1STATE-002：空狀態 — values:[] → 「未偵測到任何可選值」，非錯誤文案', async () => {
    mockedGetDistinct.mockResolvedValue(distinctResponse([]));
    renderTab();
    await waitFor(() => expect(mockedListFields).toHaveBeenCalled());
    await openModal();
    await selectColumn('risk_level');

    const empty = await screen.findByTestId('cf-distinct-empty');
    expect(empty.textContent).toContain('未偵測到任何可選值');
    // 非錯誤 / 非就緒清單
    expect(screen.queryByTestId('cf-distinct-error')).toBeNull();
    expect(screen.queryByTestId('cf-distinct-ready')).toBeNull();
    // 儲存按鈕不因此被停用
    expect((screen.getByTestId('btn-submit-create-field') as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it('FE1STATE-003：truncated 警告 — truncated:true → 顯示「過多 / 200」警告', async () => {
    const many = Array.from({ length: 200 }, (_, i) => ({
      value: 'V' + String(i + 1).padStart(3, '0'),
    }));
    mockedGetDistinct.mockResolvedValue(
      distinctResponse(many, { truncated: true, totalReturned: 200 }),
    );
    renderTab();
    await waitFor(() => expect(mockedListFields).toHaveBeenCalled());
    await openModal();
    await selectColumn('risk_level');

    const warn = await screen.findByTestId('cf-distinct-truncated-warning');
    expect(warn.textContent).toContain('過多');
    expect(warn.textContent).toContain('200');
    // 清單仍就緒，使用者仍可選擇
    expect(screen.getByTestId('cf-distinct-ready')).toBeInTheDocument();
  });

  it('FE1STATE-004：503 未就緒 — OBPOOLDATA_NOT_READY → 明確錯誤，非空白', async () => {
    mockedGetDistinct.mockRejectedValue({
      response: { data: { error: 'OBPOOLDATA_NOT_READY' } },
    });
    renderTab();
    await waitFor(() => expect(mockedListFields).toHaveBeenCalled());
    await openModal();
    await selectColumn('risk_level');

    const err = await screen.findByTestId('cf-distinct-error');
    expect(err.getAttribute('data-error-kind')).toBe('not_ready');
    expect(err.textContent).toContain('尚未就緒');
    // 非空白核取清單（BR-11）
    expect(screen.queryByTestId('cf-distinct-list')).toBeNull();
  });

  it('FE1STATE-005：500 逾時 — DISTINCT_VALUES_QUERY_TIMEOUT → 逾時專屬文案 + 重試，重試再呼叫', async () => {
    mockedGetDistinct.mockRejectedValueOnce({
      response: { data: { error: 'DISTINCT_VALUES_QUERY_TIMEOUT' } },
    });
    renderTab();
    await waitFor(() => expect(mockedListFields).toHaveBeenCalled());
    await openModal();
    await selectColumn('risk_level');

    const err = await screen.findByTestId('cf-distinct-error');
    expect(err.getAttribute('data-error-kind')).toBe('timeout');
    expect(err.textContent).toContain('逾時');
    // 逾時文案與 503 未就緒不同
    expect(err.textContent).not.toContain('尚未就緒');

    // 點重試 → 重新呼叫 getDistinctValues（此次 resolve → 就緒）
    mockedGetDistinct.mockResolvedValue(distinctResponse([{ value: '01' }]));
    fireEvent.click(screen.getByTestId('cf-distinct-retry'));
    await screen.findByTestId('cf-distinct-ready');
    expect(mockedGetDistinct).toHaveBeenCalledTimes(2);
  });

  it('FE1STATE-006：regression — 空狀態 / 503 / 500 各自為非空白且文案互異', async () => {
    // 空狀態
    mockedGetDistinct.mockResolvedValue(distinctResponse([]));
    renderTab();
    await waitFor(() => expect(mockedListFields).toHaveBeenCalled());
    await openModal();
    await selectColumn('risk_level');
    const emptyText = (await screen.findByTestId('cf-distinct-empty')).textContent ?? '';
    cleanup();

    // 503 未就緒
    mockedGetDistinct.mockReset();
    mockedGetDistinct.mockRejectedValue({
      response: { data: { error: 'CUSTOMER_CORE_NOT_READY' } },
    });
    renderTab();
    await waitFor(() => expect(mockedListFields).toHaveBeenCalled());
    await openModal();
    await selectColumn('risk_level');
    const notReadyText = (await screen.findByTestId('cf-distinct-error')).textContent ?? '';
    cleanup();

    // 500 逾時
    mockedGetDistinct.mockReset();
    mockedGetDistinct.mockRejectedValue({
      response: { data: { error: 'DISTINCT_VALUES_QUERY_TIMEOUT' } },
    });
    renderTab();
    await waitFor(() => expect(mockedListFields).toHaveBeenCalled());
    await openModal();
    await selectColumn('risk_level');
    const timeoutText = (await screen.findByTestId('cf-distinct-error')).textContent ?? '';

    // 三態皆非空白、且文案互異（BR-11：不得靜默空白、可辨識目前狀況）
    expect(emptyText.trim().length).toBeGreaterThan(0);
    expect(notReadyText.trim().length).toBeGreaterThan(0);
    expect(timeoutText.trim().length).toBeGreaterThan(0);
    expect(emptyText).not.toBe(notReadyText);
    expect(notReadyText).not.toBe(timeoutText);
    expect(emptyText).not.toBe(timeoutText);
  });
});
