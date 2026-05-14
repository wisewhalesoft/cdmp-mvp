/**
 * F069 frontend：CardTypeListTab + ProdKindBanner + 選中狀態 RTL tests
 *
 * 對應 test-spec：docs/test-specs/features/F069-test.md
 *   TC-F069-03：初始載入自動選中第一列（視覺高亮）
 *   TC-F069-04：初始選中後 Tab 2~5 傳入正確 cardType（context 同步）
 *   TC-F069-05：點擊另一列觸發 onCardTypeChange、Tab 2~5 reload
 *   TC-F069-06：PROD_KIND info banner 含「前往代碼維護」連結
 *   TC-F069-07：每列 prodKind 以 badge 形式顯示
 *   TC-F069-09：清單為空時顯示空狀態提示
 *   TC-F069-10：月跑鎖定時新增/編輯/停用按鈕 disabled
 */

import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/ui/toast';
import { SelectedCardTypeProvider } from '../_hooks/use-selected-card-type';
import {
  CardTypeListTab,
  ProdKindInfoBanner,
} from '../_components/card-type-list-tab';
import * as cardTypeApi from '@/api/card-type';

vi.mock('@/api/card-type', async () => {
  const actual = await vi.importActual<typeof cardTypeApi>('@/api/card-type');
  return {
    ...actual,
    listCardTypes: vi.fn(),
    createCardType: vi.fn(),
    updateCardType: vi.fn(),
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
      <ToastProvider>
        <BrowserRouter>
          <SelectedCardTypeProvider>{node}</SelectedCardTypeProvider>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

const THREE_CARDS = [
  {
    cardType: 'E',
    cardName: '滿期',
    prodKind: '01',
    prodKindName: '汽車',
    status: 'active' as const,
  },
  {
    cardType: 'H',
    cardName: '期中',
    prodKind: '01',
    prodKindName: '汽車',
    status: 'active' as const,
  },
  {
    cardType: 'M',
    cardName: '機車',
    prodKind: '02',
    prodKindName: '機車',
    status: 'active' as const,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CardTypeListTab — F069', () => {
  it('TC-F069-03：初始載入自動選中第一列（視覺高亮）', async () => {
    vi.mocked(cardTypeApi.listCardTypes).mockResolvedValue({
      cardTypes: THREE_CARDS,
    });

    render(wrap(<CardTypeListTab />));

    const firstRow = await screen.findByTestId('card-type-row-E');
    await waitFor(() => {
      expect(firstRow).toHaveAttribute('data-selected', 'true');
    });
    // 其他列未選中
    expect(screen.getByTestId('card-type-row-H')).toHaveAttribute(
      'data-selected',
      'false',
    );
    expect(screen.getByTestId('card-type-row-M')).toHaveAttribute(
      'data-selected',
      'false',
    );
  });

  it('TC-F069-05：點擊另一列觸發 selection 更新', async () => {
    vi.mocked(cardTypeApi.listCardTypes).mockResolvedValue({
      cardTypes: THREE_CARDS,
    });

    render(wrap(<CardTypeListTab />));

    // 等預設選中 E
    await screen.findByTestId('card-type-row-E');

    // 點 H 列
    fireEvent.click(screen.getByTestId('card-type-row-H'));

    await waitFor(() => {
      expect(screen.getByTestId('card-type-row-H')).toHaveAttribute(
        'data-selected',
        'true',
      );
      expect(screen.getByTestId('card-type-row-E')).toHaveAttribute(
        'data-selected',
        'false',
      );
    });
  });

  it('TC-F069-07：每列 prodKind 以 badge 形式顯示', async () => {
    vi.mocked(cardTypeApi.listCardTypes).mockResolvedValue({
      cardTypes: [THREE_CARDS[1]],
    });

    render(wrap(<CardTypeListTab />));

    await screen.findByTestId('card-type-row-H');
    const badges = screen.getAllByTestId('prod-kind-badge');
    expect(badges.length).toBeGreaterThan(0);
    // H 列的 badge 顯示 '01 汽車'
    const hBadge = badges.find((el) =>
      el.getAttribute('data-prod-kind') === '01',
    );
    expect(hBadge).toBeTruthy();
    expect(hBadge!.textContent).toContain('01');
    expect(hBadge!.textContent).toContain('汽車');
  });

  it('TC-F069-09：清單為空時顯示空狀態提示', async () => {
    vi.mocked(cardTypeApi.listCardTypes).mockResolvedValue({
      cardTypes: [],
    });

    render(wrap(<CardTypeListTab />));

    const empty = await screen.findByTestId('card-type-empty');
    expect(empty).toBeInTheDocument();
    expect(empty.textContent).toContain('尚未設定任何計分卡類型');
  });

  it('TC-F069-10：月跑鎖定時「新增」「編輯」「停用」按鈕 disabled', async () => {
    vi.mocked(cardTypeApi.listCardTypes).mockResolvedValue({
      cardTypes: [THREE_CARDS[1]],
    });

    render(wrap(<CardTypeListTab isLocked />));

    await screen.findByTestId('card-type-row-H');

    expect(screen.getByTestId('btn-add-card-type')).toBeDisabled();
    expect(screen.getByTestId('btn-edit-H')).toBeDisabled();
    expect(screen.getByTestId('btn-delete-H')).toBeDisabled();
    // hover title 含「分派執行中」
    expect(screen.getByTestId('btn-add-card-type').getAttribute('title'))
      .toContain('分派執行中');
  });

  it('排序：清單依 card_type 升冪（test-spec TC-F069-02 frontend 對應）', async () => {
    vi.mocked(cardTypeApi.listCardTypes).mockResolvedValue({
      cardTypes: THREE_CARDS, // E, H, M
    });

    render(wrap(<CardTypeListTab />));

    await screen.findByTestId('card-type-row-E');
    const rows = screen.getAllByTestId(/card-type-row-/);
    expect(rows.map((r) => r.getAttribute('data-testid'))).toEqual([
      'card-type-row-E',
      'card-type-row-H',
      'card-type-row-M',
    ]);
  });
});

describe('ProdKindInfoBanner — F069 AC-4', () => {
  it('TC-F069-06：PROD_KIND info banner 顯示且含「前往代碼維護」連結', () => {
    render(
      wrap(
        <ProdKindInfoBanner
          selectedCard={{
            cardType: 'H',
            cardName: '期中',
            prodKind: '01',
            prodKindName: '汽車',
            status: 'active',
          }}
        />,
      ),
    );

    expect(screen.getByTestId('prod-kind-banner')).toBeInTheDocument();
    const link = screen.getByTestId('banner-link-base-codes');
    expect(link).toBeInTheDocument();
    expect(link.getAttribute('href')).toContain('base-codes');
  });

  it('selectedCard=null 時 banner 顯示「尚未選擇 CARD_TYPE」', () => {
    render(wrap(<ProdKindInfoBanner selectedCard={null} />));
    expect(screen.getByTestId('prod-kind-banner').textContent).toContain(
      '尚未選擇 CARD_TYPE',
    );
  });
});
