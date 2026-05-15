/**
 * F071 frontend：EditCardTypeModal RTL tests
 *
 * 對應 test-spec：docs/test-specs/features/F071-test.md
 *   TC-F071-01：開啟 Modal 預填現有 cardName / prodKind 值
 *   cardType 欄位 disabled（AC-2）
 *   404 CARD_TYPE_NOT_FOUND → toast + 關閉
 *   成功 → callback + 關閉
 */

import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/ui/toast';
import { EditCardTypeModal } from '../_components/edit-card-type-modal';
import * as cardTypeApi from '@/api/card-type';

vi.mock('@/api/card-type', async () => {
  const actual = await vi.importActual<typeof cardTypeApi>('@/api/card-type');
  return {
    ...actual,
    updateCardType: vi.fn(),
  };
});

function wrap(node: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{node}</ToastProvider>
    </QueryClientProvider>
  );
}

const TARGET = {
  cardType: 'H',
  cardName: '期中',
  prodKind: '01',
  prodKindName: '汽車',
  status: 'active' as const,
  // Iter 9：CardTypeListItem 5 個 metadata 欄位（modal 不讀此值，僅 satisfy 型別）
  cardVersion: 1,
  sdate: '20190823',
  edate: '20991231',
  createdBy: 'Sales Manager',
  createdAt: '2019-08-23T00:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('EditCardTypeModal — F071', () => {
  it('TC-F071-01：開啟 Modal 預填現有 cardName / prodKind 值；cardType 欄位 disabled', () => {
    render(
      wrap(<EditCardTypeModal open target={TARGET} onClose={() => {}} />),
    );

    expect(screen.getByTestId('edit-card-type-modal')).toBeInTheDocument();
    const codeInput = screen.getByLabelText(
      /card_type 代碼/,
    ) as HTMLInputElement;
    expect(codeInput.value).toBe('H');
    expect(codeInput).toBeDisabled();

    const nameInput = screen.getByLabelText(
      /card_name 名稱/,
    ) as HTMLInputElement;
    expect(nameInput.value).toBe('期中');

    const prodInput = screen.getByLabelText(/PROD_KIND/) as HTMLSelectElement;
    expect(prodInput.value).toBe('01');
  });

  it('target=null → Modal 不渲染', () => {
    render(
      wrap(<EditCardTypeModal open target={null} onClose={() => {}} />),
    );
    expect(screen.queryByTestId('edit-card-type-modal')).toBeNull();
  });

  it('cardName 清空 → 行內錯誤，不送 API', async () => {
    render(
      wrap(<EditCardTypeModal open target={TARGET} onClose={() => {}} />),
    );

    fireEvent.change(screen.getByLabelText(/card_name 名稱/), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByText('儲存變更'));

    await waitFor(() => {
      expect(screen.getByText('請輸入 card_name 名稱')).toBeInTheDocument();
    });
    expect(cardTypeApi.updateCardType).not.toHaveBeenCalled();
  });

  it('404 CARD_TYPE_NOT_FOUND → 關閉 Modal', async () => {
    vi.mocked(cardTypeApi.updateCardType).mockRejectedValue({
      response: {
        status: 404,
        data: { error: 'CARD_TYPE_NOT_FOUND', message: 'not found' },
      },
    });
    const onClose = vi.fn();
    render(
      wrap(<EditCardTypeModal open target={TARGET} onClose={onClose} />),
    );

    fireEvent.click(screen.getByText('儲存變更'));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('成功 → 觸發 onUpdated + 關閉 Modal', async () => {
    vi.mocked(cardTypeApi.updateCardType).mockResolvedValue({
      cardType: 'H',
      cardName: '新名稱',
      prodKind: '02',
      prodKindName: '機車',
      status: 'active',
      updatedAt: new Date().toISOString(),
    });
    const onClose = vi.fn();
    const onUpdated = vi.fn();
    render(
      wrap(
        <EditCardTypeModal
          open
          target={TARGET}
          onClose={onClose}
          onUpdated={onUpdated}
        />,
      ),
    );

    fireEvent.change(screen.getByLabelText(/card_name 名稱/), {
      target: { value: '新名稱' },
    });
    fireEvent.change(screen.getByLabelText(/PROD_KIND/), {
      target: { value: '02' },
    });
    fireEvent.click(screen.getByText('儲存變更'));

    await waitFor(() => {
      expect(cardTypeApi.updateCardType).toHaveBeenCalledWith('H', {
        cardName: '新名稱',
        prodKind: '02',
      });
      expect(onUpdated).toHaveBeenCalledWith('H');
      expect(onClose).toHaveBeenCalled();
    });
  });
});
