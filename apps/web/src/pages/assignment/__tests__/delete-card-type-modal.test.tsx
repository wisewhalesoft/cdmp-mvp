/**
 * F072 frontend：DeleteCardTypeModal RTL tests
 *
 * 對應 test-spec：docs/test-specs/features/F072-test.md
 *   TC-F072-03：listDefinitionsAffected > 0 時對話框顯示警告
 *   TC-F072-04：listDefinitionsAffected = 0 時對話框不顯示警告
 *   TC-F072-11：停用成功後清單刷新（透過 onDeleted callback）
 *
 * 額外：二次確認 checkbox 行為 / cascade preview 載入
 */

import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/ui/toast';
import { DeleteCardTypeModal } from '../_components/delete-card-type-modal';
import * as cardTypeApi from '@/api/card-type';

vi.mock('@/api/card-type', async () => {
  const actual = await vi.importActual<typeof cardTypeApi>('@/api/card-type');
  return {
    ...actual,
    getDeletePreview: vi.fn(),
    deleteCardType: vi.fn(),
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
  cardType: 'X',
  cardName: '測試停用卡',
  prodKind: '01',
  prodKindName: '汽車',
  status: 'active' as const,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DeleteCardTypeModal — F072', () => {
  it('TC-F072-04：listDefinitionsAffected = 0 時對話框不顯示警告', async () => {
    vi.mocked(cardTypeApi.getDeletePreview).mockResolvedValue({
      cardType: 'X',
      cardName: '測試',
      cascade: { versions: 1, columns: 3, scores: 6, levels: 4, tierMappings: 2 },
      listDefinitionsAffected: 0,
    });

    render(
      wrap(<DeleteCardTypeModal open target={TARGET} onClose={() => {}} />),
    );

    await waitFor(() => {
      expect(screen.queryByTestId('preview-loading')).toBeNull();
    });
    expect(screen.queryByTestId('list-def-warn')).toBeNull();
    // 仍可看見「確認永久刪除」按鈕
    expect(screen.getByTestId('confirm-delete-btn')).toBeInTheDocument();
  });

  it('TC-F072-03：listDefinitionsAffected > 0 時顯示警告 + 數字', async () => {
    vi.mocked(cardTypeApi.getDeletePreview).mockResolvedValue({
      cardType: 'X',
      cardName: '測試',
      cascade: { versions: 1, columns: 3, scores: 6, levels: 4, tierMappings: 2 },
      listDefinitionsAffected: 3,
    });

    render(
      wrap(<DeleteCardTypeModal open target={TARGET} onClose={() => {}} />),
    );

    const warn = await screen.findByTestId('list-def-warn');
    expect(warn).toBeInTheDocument();
    expect(warn.textContent).toContain('3');
    expect(warn.textContent).toContain('名單定義引用警告');
  });

  it('二次確認 checkbox 未勾 → 按鈕 disabled；勾選後 enabled', async () => {
    vi.mocked(cardTypeApi.getDeletePreview).mockResolvedValue({
      cardType: 'X',
      cardName: '測試',
      cascade: { versions: 0, columns: 0, scores: 0, levels: 0, tierMappings: 0 },
      listDefinitionsAffected: 0,
    });

    render(
      wrap(<DeleteCardTypeModal open target={TARGET} onClose={() => {}} />),
    );

    await waitFor(() => {
      expect(screen.queryByTestId('preview-loading')).toBeNull();
    });

    const btn = screen.getByTestId('confirm-delete-btn');
    expect(btn).toBeDisabled();

    fireEvent.click(screen.getByTestId('confirm-checkbox'));
    expect(btn).not.toBeDisabled();
  });

  it('TC-F072-11：成功 → 觸發 onDeleted + 關閉 Modal', async () => {
    vi.mocked(cardTypeApi.getDeletePreview).mockResolvedValue({
      cardType: 'X',
      cardName: '測試',
      cascade: { versions: 1, columns: 3, scores: 6, levels: 4, tierMappings: 2 },
      listDefinitionsAffected: 0,
    });
    vi.mocked(cardTypeApi.deleteCardType).mockResolvedValue({
      cardType: 'X',
      deletedCascade: {
        versions: 1, columns: 3, scores: 6, levels: 4, tierMappings: 2,
      },
      listDefinitionsAffected: 0,
      deletedAt: new Date().toISOString(),
    });
    const onClose = vi.fn();
    const onDeleted = vi.fn();

    render(
      wrap(
        <DeleteCardTypeModal
          open
          target={TARGET}
          onClose={onClose}
          onDeleted={onDeleted}
        />,
      ),
    );

    await waitFor(() => {
      expect(screen.queryByTestId('preview-loading')).toBeNull();
    });

    fireEvent.click(screen.getByTestId('confirm-checkbox'));
    fireEvent.click(screen.getByTestId('confirm-delete-btn'));

    await waitFor(() => {
      expect(cardTypeApi.deleteCardType).toHaveBeenCalledWith('X');
      expect(onDeleted).toHaveBeenCalledWith('X');
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('target=null → Modal 不渲染', () => {
    render(
      wrap(<DeleteCardTypeModal open target={null} onClose={() => {}} />),
    );
    expect(screen.queryByTestId('delete-card-type-modal')).toBeNull();
  });
});
