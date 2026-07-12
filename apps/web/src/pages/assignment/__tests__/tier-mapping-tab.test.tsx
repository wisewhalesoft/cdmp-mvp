/**
 * F056 v1.5 frontend：TierMappingTabV15 RTL tests
 *
 * 對應 test-spec：docs/test-specs/features/F056-test.md
 *   TS-F056-021：Fallback 列顯示紫色底色 + 「Fallback」標籤
 *   TS-F056-022：標準對應列無 Fallback 標籤
 *   TS-F056-024：list_nm null 顯示「—」
 *   TS-F056-025：月名單分派鎖時新增按鈕 disabled
 *   TS-F056-028：M3/HC/C3 過渡 fallback 顯示一致
 *
 * v1.5 新增：
 *   - Mode Banner（Standard N 筆 / Fallback / 尚未建立）
 *   - 規則類型 badge（Standard 藍 / Fallback 紫）
 *   - 待遷移舊後綴值 badge（T5M / THC / T3C → 琥珀）
 *   - 列表依 cardType 篩選（context selectedCardType）
 */

import { render, screen, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/ui/toast';
import { TierMappingTabV15 } from '../_components/tier-mapping-tab';
import { SelectedCardTypeProvider } from '../_hooks/use-selected-card-type';
import * as api from '@/api/assignment-scoring';

vi.mock('@/api/assignment-scoring', async () => {
  const actual = await vi.importActual<typeof api>('@/api/assignment-scoring');
  return {
    ...actual,
    getTierMapping: vi.fn(),
    deleteTierMapping: vi.fn(),
    // F056 v1.6：TIER 分布面板需 active 門檻 + histogram
    getCardLevels: vi.fn(),
    previewCardLevels: vi.fn(),
  };
});

// H 型 active 門檻 + histogram（first-match-wins 分桶 → A:10/B:20/C:30/D:40，sample=total=100）
const H_ACTIVE_LEVELS = {
  cardType: 'H',
  cardVersion: 1,
  levels: [
    { cardLevel: 'A', scoreS: 250, scoreE: 999 },
    { cardLevel: 'B', scoreS: 200, scoreE: 249 },
    { cardLevel: 'C', scoreS: 100, scoreE: 199 },
    { cardLevel: 'D', scoreS: 0, scoreE: 99 },
  ],
};
const HISTO_H = {
  distribution: {},
  histogram: [
    { score: 300, count: 10 }, // A
    { score: 220, count: 20 }, // B
    { score: 150, count: 30 }, // C
    { score: 50, count: 40 }, // D
  ],
  isEstimate: true,
  sampleSize: 100,
  totalCount: 100,
};

function wrap(node: React.ReactElement, selectedCardType = 'H') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <SelectedCardTypeProvider
          initialCardType={{
            cardType: selectedCardType,
            cardName: '期中',
            prodKind: '01',
            prodKindName: '汽車',
            status: 'active',
            // Iter 9：CardTypeListItem 新增 5 個 metadata 欄位
            cardVersion: 1,
            sdate: '20190823',
            edate: '20991231',
            createdBy: null,
            createdAt: null,
          }}
        >
          {node}
        </SelectedCardTypeProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // TIER 分布面板預設：H active 門檻 + histogram（可被個別 test override）
  vi.mocked(api.getCardLevels).mockResolvedValue(H_ACTIVE_LEVELS);
  vi.mocked(api.previewCardLevels).mockResolvedValue(HISTO_H);
});

describe('TierMappingTabV15 — F056 v1.5', () => {
  it('未選中 CARD_TYPE 時顯示空狀態', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ToastProvider>
          <SelectedCardTypeProvider>
            <TierMappingTabV15 />
          </SelectedCardTypeProvider>
        </ToastProvider>
      </QueryClientProvider>,
    );
    expect(screen.getByTestId('no-card-type-selected')).toBeInTheDocument();
  });

  it('TS-F056-022：Standard 對應列顯示 Standard badge 且無紫色底色', async () => {
    vi.mocked(api.getTierMapping).mockResolvedValue({
      mappings: [
        { cardType: 'H', cardLevel: 'A', tierLevel: 'T1', listNm: '高資產卡 A 級' },
        { cardType: 'H', cardLevel: 'B', tierLevel: 'T2', listNm: null },
      ],
    });

    render(wrap(<TierMappingTabV15 />));

    await waitFor(() => {
      expect(screen.getByTestId('tier-row-H-A')).toBeInTheDocument();
    });
    const rowA = screen.getByTestId('tier-row-H-A');
    expect(rowA.className).not.toContain('purple');
    const badge = screen.getByTestId('rule-badge-H-A');
    expect(badge.textContent).toContain('Standard');
  });

  it('TS-F056-021 + TS-F056-024：Fallback 列含紫色底色 + Fallback badge + listNm 為 null 顯示 —', async () => {
    vi.mocked(api.getTierMapping).mockResolvedValue({
      mappings: [
        { cardType: 'M5', cardLevel: null, tierLevel: 'T5', listNm: null },
      ],
    });

    render(wrap(<TierMappingTabV15 />, 'M5'));

    await waitFor(() => {
      expect(screen.getByTestId('tier-row-M5-null')).toBeInTheDocument();
    });
    const row = screen.getByTestId('tier-row-M5-null');
    expect(row.className).toContain('purple');
    const badge = screen.getByTestId('rule-badge-M5-null');
    expect(badge.textContent).toContain('Fallback');
    // listNm null 顯示「—」
    expect(row.textContent).toContain('—');
  });

  it('Mode Banner：DB 中該 cardType 有 N 筆 Standard → 顯示「採用 Standard 規則」+ count', async () => {
    vi.mocked(api.getTierMapping).mockResolvedValue({
      mappings: [
        { cardType: 'H', cardLevel: 'A', tierLevel: 'T1', listNm: '' },
        { cardType: 'H', cardLevel: 'B', tierLevel: 'T2', listNm: '' },
        { cardType: 'H', cardLevel: 'C', tierLevel: 'T3', listNm: '' },
      ],
    });

    render(wrap(<TierMappingTabV15 />));

    // 用 waitFor 等待 query data 載入後 banner 文字更新
    await waitFor(() => {
      const banner = screen.getByTestId('tier-mode-banner');
      expect(banner.textContent).toContain('Standard');
      expect(banner.textContent).toContain('3');
    });
  });

  it('Mode Banner：DB 中該 cardType 有 Fallback 紀錄 → 顯示「採用 Fallback 規則」', async () => {
    vi.mocked(api.getTierMapping).mockResolvedValue({
      mappings: [
        { cardType: 'M5', cardLevel: null, tierLevel: 'T5', listNm: '' },
      ],
    });

    render(wrap(<TierMappingTabV15 />, 'M5'));

    const banner = await screen.findByTestId('tier-mode-banner');
    expect(banner.textContent).toContain('Fallback');
  });

  it('Mode Banner：DB 中無紀錄 → 顯示「尚未建立」', async () => {
    vi.mocked(api.getTierMapping).mockResolvedValue({ mappings: [] });

    render(wrap(<TierMappingTabV15 />));

    const banner = await screen.findByTestId('tier-mode-banner');
    expect(banner.textContent).toContain('尚未建立');
  });

  it('待遷移舊後綴值 → 顯示琥珀 legacy badge', async () => {
    vi.mocked(api.getTierMapping).mockResolvedValue({
      mappings: [
        { cardType: 'M3', cardLevel: null, tierLevel: 'T5M', listNm: '' },
      ],
    });

    render(wrap(<TierMappingTabV15 />, 'M3'));

    await waitFor(() => {
      expect(screen.getByTestId('legacy-tier-badge-M3-null')).toBeInTheDocument();
    });
    const legacy = screen.getByTestId('legacy-tier-badge-M3-null');
    expect(legacy.textContent).toContain('待遷移');
  });

  it('TS-F056-025：月名單分派鎖時新增按鈕 disabled', async () => {
    vi.mocked(api.getTierMapping).mockResolvedValue({ mappings: [] });

    render(wrap(<TierMappingTabV15 isLocked />));

    await waitFor(() => {
      expect(screen.getByTestId('btn-add-tier-v15')).toBeInTheDocument();
    });
    expect(screen.getByTestId('btn-add-tier-v15')).toBeDisabled();
  });

  it('依 selectedCardType 篩選 — getTierMapping 被以 cardType=H 呼叫', async () => {
    vi.mocked(api.getTierMapping).mockResolvedValue({ mappings: [] });

    render(wrap(<TierMappingTabV15 />, 'H'));

    await waitFor(() => {
      expect(api.getTierMapping).toHaveBeenCalledWith('H');
    });
  });
});

// ============================================================
// F056 v1.6 / AD-E07-45（US-175）：預估各 TIER 分布面板（client-side histogram 彙總）
// ============================================================
describe('TierMappingTabV15 — 預估各 TIER 分布（S 組）', () => {
  it('TS-F056-050：Standard 多對一合計（A/B→T1、C→T2、D→T3）依數值序', async () => {
    vi.mocked(api.getTierMapping).mockResolvedValue({
      mappings: [
        { cardType: 'H', cardLevel: 'A', tierLevel: 'T1', listNm: null },
        { cardType: 'H', cardLevel: 'B', tierLevel: 'T1', listNm: null },
        { cardType: 'H', cardLevel: 'C', tierLevel: 'T2', listNm: null },
        { cardType: 'H', cardLevel: 'D', tierLevel: 'T3', listNm: null },
      ],
    });

    render(wrap(<TierMappingTabV15 />, 'H'));

    await waitFor(() => {
      expect(screen.getByTestId('tier-dist-ready')).toBeInTheDocument();
    });
    // A(10)+B(20)=T1 30；C(30)=T2；D(40)=T3
    expect(screen.getByTestId('tier-dist-count-T1').textContent).toContain('30');
    expect(screen.getByTestId('tier-dist-count-T2').textContent).toContain('30');
    expect(screen.getByTestId('tier-dist-count-T3').textContent).toContain('40');
    // 「約」估算標示
    expect(screen.getByTestId('tier-dist-count-T1').textContent).toContain('約');
    // 樣本/母體來源說明
    expect(screen.getByTestId('tier-dist-sample-caption').textContent).toContain(
      '樣本',
    );
  });

  it('TS-F056-053：TIER 依數值序排序（T10 不排在 T2 之前）', async () => {
    vi.mocked(api.getTierMapping).mockResolvedValue({
      mappings: [
        { cardType: 'H', cardLevel: 'A', tierLevel: 'T10', listNm: null },
        { cardType: 'H', cardLevel: 'B', tierLevel: 'T2', listNm: null },
        { cardType: 'H', cardLevel: 'C', tierLevel: 'T1', listNm: null },
      ],
    });

    render(wrap(<TierMappingTabV15 />, 'H'));

    await waitFor(() => {
      expect(screen.getByTestId('tier-dist-ready')).toBeInTheDocument();
    });
    const rows = screen
      .getAllByTestId(/^tier-dist-row-/)
      .map((el) => el.getAttribute('data-testid'));
    expect(rows).toEqual([
      'tier-dist-row-T1',
      'tier-dist-row-T2',
      'tier-dist-row-T10',
    ]);
  });

  it('TS-F056-054：Fallback → 單一 TIER（顯示 Fallback 說明，ratio≈100%）', async () => {
    vi.mocked(api.getCardLevels).mockResolvedValue({
      cardType: 'M5',
      cardVersion: 1,
      levels: [],
    });
    vi.mocked(api.getTierMapping).mockResolvedValue({
      mappings: [{ cardType: 'M5', cardLevel: null, tierLevel: 'T5', listNm: null }],
    });

    render(wrap(<TierMappingTabV15 />, 'M5'));

    await waitFor(() => {
      expect(screen.getByTestId('tier-dist-ready')).toBeInTheDocument();
    });
    // 單一 TIER 條目
    expect(screen.getByTestId('tier-dist-row-T5')).toBeInTheDocument();
    expect(screen.queryByTestId('tier-dist-row-T1')).toBeNull();
    // Fallback 說明
    expect(screen.getByTestId('tier-dist-ready').textContent).toContain('Fallback');
    // 100.0%（histogram sum=100 === sampleSize）
    expect(screen.getByTestId('tier-dist-ready').textContent).toContain('100.0%');
  });

  it('TS-F056-056：無任何對應規則 → 顯示提示（不留白、不報錯）', async () => {
    vi.mocked(api.getCardLevels).mockResolvedValue({
      cardType: 'S5',
      cardVersion: 1,
      levels: [
        { cardLevel: 'A', scoreS: 200, scoreE: 999 },
        { cardLevel: 'B', scoreS: 0, scoreE: 199 },
      ],
    });
    vi.mocked(api.getTierMapping).mockResolvedValue({ mappings: [] });

    render(wrap(<TierMappingTabV15 />, 'S5'));

    await waitFor(() => {
      expect(screen.getByTestId('tier-dist-empty')).toBeInTheDocument();
    });
    expect(screen.getByTestId('tier-dist-empty').textContent).toContain(
      '尚未設定 TIER 對應規則',
    );
    // 不得渲染 ready / error
    expect(screen.queryByTestId('tier-dist-ready')).toBeNull();
    expect(screen.queryByTestId('tier-dist-error')).toBeNull();
  });

  it('TS-F056-066：histogram 抓取失敗 → 錯誤 + 重試（不得空白）', async () => {
    vi.mocked(api.getTierMapping).mockResolvedValue({
      mappings: [
        { cardType: 'H', cardLevel: 'A', tierLevel: 'T1', listNm: null },
      ],
    });
    vi.mocked(api.previewCardLevels).mockRejectedValue({
      response: { status: 500 },
    });

    render(wrap(<TierMappingTabV15 />, 'H'));

    await waitFor(() => {
      expect(screen.getByTestId('tier-dist-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('tier-dist-error').textContent).toContain(
      '暫時無法取得',
    );
    expect(screen.getByTestId('tier-dist-retry')).toBeInTheDocument();
    expect(screen.queryByTestId('tier-dist-ready')).toBeNull();
  });

  it('TS-F056-057：未選中 CARD_TYPE → 不呼叫 histogram / tier-mapping 端點', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ToastProvider>
          <SelectedCardTypeProvider>
            <TierMappingTabV15 />
          </SelectedCardTypeProvider>
        </ToastProvider>
      </QueryClientProvider>,
    );
    expect(screen.getByTestId('no-card-type-selected')).toBeInTheDocument();
    expect(api.previewCardLevels).not.toHaveBeenCalled();
    expect(api.getTierMapping).not.toHaveBeenCalled();
  });

  it('TS-F056-067：資訊架構比照 Tab 4（每 TIER 列含代碼 + 筆數 + 佔比）', async () => {
    vi.mocked(api.getTierMapping).mockResolvedValue({
      mappings: [
        { cardType: 'H', cardLevel: 'A', tierLevel: 'T1', listNm: null },
        { cardType: 'H', cardLevel: 'B', tierLevel: 'T2', listNm: null },
      ],
    });

    render(wrap(<TierMappingTabV15 />, 'H'));

    await waitFor(() => {
      expect(screen.getByTestId('tier-dist-row-T1')).toBeInTheDocument();
    });
    const row = screen.getByTestId('tier-dist-row-T1');
    // 代碼（T1）+ 筆數（約 N 筆）+ 佔比（%）
    expect(row.textContent).toContain('T1');
    expect(within(row).getByTestId('tier-dist-count-T1').textContent).toContain(
      '筆',
    );
    expect(row.textContent).toContain('%');
  });
});
