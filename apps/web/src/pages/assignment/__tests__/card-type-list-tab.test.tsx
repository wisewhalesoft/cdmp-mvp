/**
 * F069 frontend：CardTypeListTab + ProdKindBanner（排列 B 單列三欄）+ CardTypeSwitcher RTL tests
 *
 * 對應 prototype 28（排列 B：身分 5 / metadata 3 / 統計+操作 4）；
 * 累積變更後與最初 test-spec TC-F069-06 行為相反 —— 不應再有「前往代碼維護」連結，
 * 且 banner 改成「目前選中卡 + metadata + KPI + 切換器」一體式。
 *
 * 涵蓋：
 *   - CardTypeListTab 既有 8 個 testcase（不動）
 *   - ProdKindBanner / SelectedCardTypeBanner：
 *     · 不應有前往代碼維護連結（翻轉）
 *     · metadata caption（version / 起訖 / createdBy·createdAt）
 *     · dash placeholder 用 text-gray-300
 *     · status active/inactive pill 樣式
 *     · 5 個 KPI button（維度/分數/LEVEL/TIER/名單）+ amber warning when affected>0
 *     · KPI click → onSwitchTab/onGoToListDefinitions
 *     · 排列 B 三欄佈局（col-span-5/3/4）
 *     · placeholder 狀態 col-span-12 + meta/stats hidden
 *     · monthRunLocked → divide-amber-200 主題
 */

import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/ui/toast';
import { SelectedCardTypeProvider } from '../_hooks/use-selected-card-type';
import {
  CardTypeListTab,
  SelectedCardTypeBanner,
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

// Iter 9：CardTypeListItem 加 5 個 metadata 欄位（後端 listCardTypes JOIN 帶回）
const META_NULL = {
  cardVersion: null,
  sdate: null,
  edate: null,
  createdBy: null,
  createdAt: null,
};

const THREE_CARDS = [
  {
    cardType: 'E',
    cardName: '滿期',
    prodKind: '01',
    prodKindName: '汽車',
    status: 'active' as const,
    ...META_NULL,
  },
  {
    cardType: 'H',
    cardName: '期中',
    prodKind: '01',
    prodKindName: '汽車',
    status: 'active' as const,
    ...META_NULL,
  },
  {
    cardType: 'M',
    cardName: '機車',
    prodKind: '02',
    prodKindName: '機車',
    status: 'active' as const,
    ...META_NULL,
  },
];

// 完整 CardType 物件（含 metadata + 6 張卡）供 Banner / Switcher 測試用
const FULL_H_CARD = {
  cardType: 'H',
  cardName: '期中',
  prodKind: '01',
  prodKindName: '汽車',
  status: 'active' as const,
  cardVersion: 1,
  sdate: '20190823',
  edate: '20991231',
  createdBy: '21251',
  createdAt: '2019-08-23 00:00',
};

const SIX_CARDS = [
  { cardType: 'E', cardName: '滿期', prodKind: '01', prodKindName: '汽車', status: 'active' as const, ...META_NULL },
  { cardType: 'H', cardName: '期中', prodKind: '01', prodKindName: '汽車', status: 'active' as const, ...META_NULL },
  { cardType: 'M', cardName: '機車', prodKind: '02', prodKindName: '機車', status: 'active' as const, ...META_NULL },
  { cardType: 'M5', cardName: '機車中結滿期', prodKind: '02', prodKindName: '機車', status: 'active' as const, ...META_NULL },
  { cardType: 'S', cardName: '一般商品', prodKind: '03', prodKindName: '商品', status: 'active' as const, ...META_NULL },
  { cardType: 'S5', cardName: '一般商品中結', prodKind: '03', prodKindName: '商品', status: 'active' as const, ...META_NULL },
];

const STATS_FULL = {
  dimCount: 8,
  scoreCount: 24,
  levelCount: 4,
  tierCount: 4,
  listDefsAffected: 2,
};

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

    await screen.findByTestId('card-type-row-E');

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
    expect(screen.getByTestId('btn-add-card-type').getAttribute('title'))
      .toContain('分派執行中');
  });

  it('排序：清單依 card_type 升冪（test-spec TC-F069-02 frontend 對應）', async () => {
    vi.mocked(cardTypeApi.listCardTypes).mockResolvedValue({
      cardTypes: THREE_CARDS,
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

// ============================================================
// SelectedCardTypeBanner（排列 B 單列三欄）— 累積變更後新形式
// ============================================================

describe('SelectedCardTypeBanner — F069 排列 B（身分 + metadata + 統計）', () => {
  // 用 'selectedCardType' in overrides 而非 ?? 判斷，才能讓 null 顯式傳入
  // Iter 9：stats 改 required；測試固定預設 STATS_FULL，overrides.stats 可覆寫
  const renderBanner = (overrides: any = {}) => {
    const selected =
      'selectedCardType' in overrides ? overrides.selectedCardType : FULL_H_CARD;
    return render(
      wrap(
        <SelectedCardTypeBanner
          selectedCardType={selected}
          monthRunLocked={overrides.monthRunLocked ?? false}
          availableCardTypes={overrides.availableCardTypes ?? SIX_CARDS}
          onSwitchCardType={overrides.onSwitchCardType ?? vi.fn()}
          stats={overrides.stats ?? STATS_FULL}
          onSwitchTab={overrides.onSwitchTab ?? vi.fn()}
          onGoToListDefinitions={overrides.onGoToListDefinitions ?? vi.fn()}
        />,
      ),
    );
  };

  // --- 翻轉 TC-F069-06 ---
  it('TC-F069-06（翻轉）：不應再有「前往代碼維護」連結', () => {
    renderBanner();
    expect(screen.queryByTestId('banner-link-base-codes')).toBeNull();
    expect(screen.queryByText(/前往代碼維護/)).toBeNull();
    expect(screen.queryByText(/由「代碼維護」管理|由代碼維護管理/)).toBeNull();
  });

  it('selectedCardType=null 時 banner 顯示「尚未選擇 CARD_TYPE」且仍無前往連結', () => {
    renderBanner({ selectedCardType: null });
    expect(screen.getByTestId('prod-kind-banner').textContent).toContain(
      '尚未選擇 CARD_TYPE',
    );
    expect(screen.queryByTestId('banner-link-base-codes')).toBeNull();
  });

  // --- metadata 區（欄 2）---
  it('Metadata：顯示 version / sdate~edate / createdBy · createdAt', () => {
    renderBanner();
    const meta = screen.getByTestId('banner-meta');
    expect(meta.textContent).toContain('v1');
    // fmtDate：YYYYMMDD → YYYY-MM-DD
    expect(meta.textContent).toContain('2019-08-23');
    expect(meta.textContent).toContain('2099-12-31');
    expect(meta.textContent).toContain('21251');
    expect(meta.textContent).toContain('2019-08-23 00:00');
  });

  it('Metadata：createdBy/createdAt 為「—」或 null 時渲染為淡灰 dash', () => {
    renderBanner({
      selectedCardType: {
        ...FULL_H_CARD,
        createdBy: '—',
        createdAt: null,
      },
    });
    const meta = screen.getByTestId('banner-meta');
    const dashes = meta.querySelectorAll('span.text-gray-300');
    // 至少有 2 個 dash span（createdBy + createdAt）
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  // --- status pill ---
  it('Status：active 顯示 green pill', () => {
    renderBanner();
    const pill = screen.getByTestId('banner-status-pill');
    expect(pill.className).toContain('bg-green-100');
    expect(pill.className).toContain('text-success');
    expect(pill.textContent).toContain('active');
  });

  it('Status：inactive 顯示 gray pill', () => {
    renderBanner({
      selectedCardType: { ...FULL_H_CARD, status: 'inactive' },
    });
    const pill = screen.getByTestId('banner-status-pill');
    expect(pill.className).toContain('bg-gray-100');
    expect(pill.className).toContain('text-gray-500');
    expect(pill.textContent).toContain('inactive');
  });

  // --- KPI 區（欄 3）---
  it('Stats：5 個 KPI button 顯示對應數字 + 縮寫 label', () => {
    renderBanner();
    expect(screen.getByTestId('kpi-dim').textContent).toContain('8');
    expect(screen.getByTestId('kpi-dim').textContent).toContain('維度');
    expect(screen.getByTestId('kpi-score').textContent).toContain('24');
    expect(screen.getByTestId('kpi-score').textContent).toContain('分數');
    expect(screen.getByTestId('kpi-level').textContent).toContain('4');
    expect(screen.getByTestId('kpi-level').textContent).toContain('LEVEL');
    expect(screen.getByTestId('kpi-tier').textContent).toContain('4');
    expect(screen.getByTestId('kpi-tier').textContent).toContain('TIER');
    expect(screen.getByTestId('kpi-listdef').textContent).toContain('2');
    expect(screen.getByTestId('kpi-listdef').textContent).toContain('名單');
  });

  it('Stats：listDefsAffected>0 → amber 警告（amber-600 + AlertTriangle）', () => {
    renderBanner({ stats: { ...STATS_FULL, listDefsAffected: 2 } });
    const kpi = screen.getByTestId('kpi-listdef');
    const number = kpi.querySelector('[data-testid="kpi-listdef-number"]');
    expect(number?.className).toContain('text-amber-600');
    // amber label
    const label = kpi.querySelector('[data-testid="kpi-listdef-label"]');
    expect(label?.className).toContain('text-amber-700');
  });

  it('Stats：listDefsAffected=0 → 中性樣式（text-gray-900 / text-gray-500）', () => {
    renderBanner({ stats: { ...STATS_FULL, listDefsAffected: 0 } });
    const kpi = screen.getByTestId('kpi-listdef');
    const number = kpi.querySelector('[data-testid="kpi-listdef-number"]');
    expect(number?.className).toContain('text-gray-900');
    expect(number?.className).not.toContain('text-amber-600');
  });

  it('Stats：5 個 KPI 點擊各自觸發 onSwitchTab / onGoToListDefinitions', () => {
    const onSwitchTab = vi.fn();
    const onGoToListDefinitions = vi.fn();
    renderBanner({ onSwitchTab, onGoToListDefinitions });
    fireEvent.click(screen.getByTestId('kpi-dim'));
    fireEvent.click(screen.getByTestId('kpi-score'));
    fireEvent.click(screen.getByTestId('kpi-level'));
    fireEvent.click(screen.getByTestId('kpi-tier'));
    fireEvent.click(screen.getByTestId('kpi-listdef'));
    expect(onSwitchTab).toHaveBeenNthCalledWith(1, 'dim');
    expect(onSwitchTab).toHaveBeenNthCalledWith(2, 'score');
    expect(onSwitchTab).toHaveBeenNthCalledWith(3, 'level');
    expect(onSwitchTab).toHaveBeenNthCalledWith(4, 'tier');
    expect(onGoToListDefinitions).toHaveBeenCalledWith('H');
  });

  // Iter 9：stats 改 required；父層 useQuery 未 ready 時應傳預設 0 或顯示 loading，
  // 不再有 stats=undefined hidden 情境（已從測試移除）。

  it('Stats：selectedCardType=null 時 stats 整欄 hidden（含 banner-stats-col）', () => {
    renderBanner({ selectedCardType: null });
    expect(screen.queryByTestId('banner-stats-col')).toBeNull();
    expect(screen.queryByTestId('banner-meta')).toBeNull();
  });

  // --- 排列 B 三欄佈局 ---
  it('Layout：banner-selection 含 xl:col-span-5、banner-meta xl:col-span-3、banner-stats-col xl:col-span-4', () => {
    renderBanner();
    expect(screen.getByTestId('banner-selection').className).toContain(
      'xl:col-span-5',
    );
    expect(screen.getByTestId('banner-meta').className).toContain(
      'xl:col-span-3',
    );
    expect(screen.getByTestId('banner-stats-col').className).toContain(
      'xl:col-span-4',
    );
  });

  it('Layout：banner-grid 含 divide-y xl:divide-y-0 xl:divide-x divide-border', () => {
    renderBanner();
    const grid = screen.getByTestId('banner-grid');
    expect(grid.className).toContain('divide-y');
    expect(grid.className).toContain('xl:divide-y-0');
    expect(grid.className).toContain('xl:divide-x');
    expect(grid.className).toContain('divide-border');
  });

  it('Layout：monthRunLocked=true → banner-grid 含 divide-amber-200（不含 divide-border）', () => {
    renderBanner({ monthRunLocked: true });
    const grid = screen.getByTestId('banner-grid');
    expect(grid.className).toContain('divide-amber-200');
    expect(grid.className).not.toContain('divide-border');
  });

  it('Layout：selectedCardType=null → banner-selection 改為 xl:col-span-12 + meta/stats 欄 hidden', () => {
    renderBanner({ selectedCardType: null });
    expect(screen.getByTestId('banner-selection').className).toContain(
      'xl:col-span-12',
    );
    expect(screen.queryByTestId('banner-meta')).toBeNull();
    expect(screen.queryByTestId('banner-stats-col')).toBeNull();
  });

  it('Style：KPI 數字 className 含 text-base font-bold（非 text-lg）', () => {
    renderBanner();
    const number = screen
      .getByTestId('kpi-dim')
      .querySelector('[data-testid="kpi-dim-number"]');
    expect(number?.className).toContain('text-base');
    expect(number?.className).toContain('font-bold');
    expect(number?.className).not.toContain('text-lg');
  });
});
