/**
 * F056 v1.5 frontend：TierMappingTabV15 RTL tests
 *
 * 對應 test-spec：docs/test-specs/features/F056-test.md
 *   TS-F056-021：Fallback 列顯示紫色底色 + 「Fallback」標籤
 *   TS-F056-022：標準對應列無 Fallback 標籤
 *   TS-F056-024：list_nm null 顯示「—」
 *   TS-F056-025：月跑鎖時新增按鈕 disabled
 *   TS-F056-028：M3/HC/C3 過渡 fallback 顯示一致
 *
 * v1.5 新增：
 *   - Mode Banner（Standard N 筆 / Fallback / 尚未建立）
 *   - 規則類型 badge（Standard 藍 / Fallback 紫）
 *   - 待遷移舊後綴值 badge（T5M / THC / T3C → 琥珀）
 *   - 列表依 cardType 篩選（context selectedCardType）
 */

import { render, screen, waitFor } from '@testing-library/react';
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
  };
});

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

  it('TS-F056-025：月跑鎖時新增按鈕 disabled', async () => {
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
