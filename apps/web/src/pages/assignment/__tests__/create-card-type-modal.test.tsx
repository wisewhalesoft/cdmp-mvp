/**
 * F070 frontend：CreateCardTypeModal RTL tests
 *
 * 對應 test-spec：docs/test-specs/features/F070-test.md
 *   TC-F070-13（隱含）：表單必填驗證
 *   TC-F070-14：422 CARD_TYPE_DUPLICATE → Modal 不關閉 + 行內錯誤訊息
 *   + 格式驗證（小寫 → 阻擋）+ Esc 關閉 + 成功 callback
 */

import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/ui/toast';
import { CreateCardTypeModal } from '../_components/create-card-type-modal';
import * as cardTypeApi from '@/api/card-type';

vi.mock('@/api/card-type', async () => {
  const actual = await vi.importActual<typeof cardTypeApi>('@/api/card-type');
  return {
    ...actual,
    createCardType: vi.fn(),
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

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CreateCardTypeModal — F070', () => {
  it('open=true 時渲染 Modal；open=false 時不渲染', () => {
    const { rerender } = render(
      wrap(<CreateCardTypeModal open={false} onClose={() => {}} />),
    );
    expect(screen.queryByTestId('create-card-type-modal')).toBeNull();

    rerender(wrap(<CreateCardTypeModal open onClose={() => {}} />));
    expect(screen.getByTestId('create-card-type-modal')).toBeInTheDocument();
  });

  it('必填驗證：cardType 為空 → 行內錯誤訊息，不送 API', async () => {
    const onClose = vi.fn();
    render(wrap(<CreateCardTypeModal open onClose={onClose} />));

    // 直接點「確認新增」
    fireEvent.click(screen.getByText('確認新增'));

    await waitFor(() => {
      expect(screen.getByText('請輸入 card_type 代碼')).toBeInTheDocument();
    });
    expect(cardTypeApi.createCardType).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('格式驗證 + 自動大寫：cardType 輸入 x1 → onChange 轉 X1 → 送 API', async () => {
    // 元件 onChange 中有 .toUpperCase()，'x1' → 'X1'；驗證 happy path
    vi.mocked(cardTypeApi.createCardType).mockResolvedValue({
      cardType: 'X1',
      cardName: '測試',
      prodKind: '01',
      prodKindName: '汽車',
      status: 'active',
      cardVersion: 1,
      createdAt: new Date().toISOString(),
    });

    const onClose = vi.fn();
    render(wrap(<CreateCardTypeModal open onClose={onClose} />));

    const codeInput = screen.getByLabelText(/card_type 代碼/) as HTMLInputElement;
    const nameInput = screen.getByLabelText(/card_name 名稱/) as HTMLInputElement;
    const prodInput = screen.getByLabelText(/PROD_KIND/) as HTMLSelectElement;

    fireEvent.change(codeInput, { target: { value: 'x1' } });
    fireEvent.change(nameInput, { target: { value: '測試' } });
    fireEvent.change(prodInput, { target: { value: '01' } });

    expect(codeInput.value).toBe('X1');
    fireEvent.click(screen.getByText('確認新增'));
    await waitFor(
      () => {
        expect(cardTypeApi.createCardType).toHaveBeenLastCalledWith({
          cardType: 'X1',
          cardName: '測試',
          prodKind: '01',
        });
      },
      { timeout: 3000 },
    );
  });

  it('TC-F070-14：422 CARD_TYPE_DUPLICATE → Modal 不關閉 + 行內錯誤', async () => {
    vi.mocked(cardTypeApi.createCardType).mockRejectedValue({
      response: {
        status: 422,
        data: { error: 'CARD_TYPE_DUPLICATE', message: '計分卡代碼 H 已存在' },
      },
    });
    const onClose = vi.fn();
    render(wrap(<CreateCardTypeModal open onClose={onClose} />));

    fireEvent.change(screen.getByLabelText(/card_type 代碼/), {
      target: { value: 'H' },
    });
    fireEvent.change(screen.getByLabelText(/card_name 名稱/), {
      target: { value: '重複' },
    });
    fireEvent.change(screen.getByLabelText(/PROD_KIND/), {
      target: { value: '01' },
    });
    fireEvent.click(screen.getByText('確認新增'));

    await waitFor(() => {
      expect(screen.getByText(/計分卡代碼.*H.*已存在/)).toBeInTheDocument();
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('成功 → 觸發 onCreated callback 並關閉 Modal', async () => {
    vi.mocked(cardTypeApi.createCardType).mockResolvedValue({
      cardType: 'X1',
      cardName: '測試',
      prodKind: '01',
      prodKindName: '汽車',
      status: 'active',
      cardVersion: 1,
      createdAt: new Date().toISOString(),
    });
    const onClose = vi.fn();
    const onCreated = vi.fn();
    render(
      wrap(
        <CreateCardTypeModal
          open
          onClose={onClose}
          onCreated={onCreated}
        />,
      ),
    );

    fireEvent.change(screen.getByLabelText(/card_type 代碼/), {
      target: { value: 'X1' },
    });
    fireEvent.change(screen.getByLabelText(/card_name 名稱/), {
      target: { value: '測試' },
    });
    fireEvent.change(screen.getByLabelText(/PROD_KIND/), {
      target: { value: '01' },
    });
    fireEvent.click(screen.getByText('確認新增'));

    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith(
        expect.objectContaining({ cardType: 'X1' }),
      );
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('Esc 鍵關閉 Modal', () => {
    const onClose = vi.fn();
    render(wrap(<CreateCardTypeModal open onClose={onClose} />));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
