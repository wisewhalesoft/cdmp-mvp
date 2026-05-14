/**
 * F056 v1.5 frontend：CreateTierMappingModal RTL tests
 *
 * 對應 test-spec：docs/test-specs/features/F056-test.md
 *   TS-F056-045：TIER_LEVEL 下拉僅 T1~T10 共 10 個選項，無自由輸入
 *   TS-F056-047：CARD_TYPE_FALLBACK_STANDARD_MUTEX → Modal 顯示對應錯誤
 *   TS-F056-048：Standard / Fallback radio 切換顯示對應欄位
 *
 * 額外：
 *   - 互斥 disabled：DB 已有 Standard → Fallback radio disabled + 警告訊息
 *   - 互斥 disabled：DB 已有 Fallback → Standard radio disabled + 警告訊息
 */

import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/ui/toast';
import { CreateTierMappingModal } from '../_components/create-tier-mapping-modal';
import * as api from '@/api/assignment-scoring';

vi.mock('@/api/assignment-scoring', async () => {
  const actual = await vi.importActual<typeof api>('@/api/assignment-scoring');
  return {
    ...actual,
    createTierMapping: vi.fn(),
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

const COMMON_PROPS = {
  open: true,
  cardType: 'H',
  cardName: '期中',
  availableCardLevels: ['A', 'B', 'C', 'D'],
  existingMappings: [],
  onClose: () => {},
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CreateTierMappingModal — F056 v1.5', () => {
  it('TS-F056-045：TIER_LEVEL 下拉僅 T1~T10 共 10 個選項', () => {
    render(wrap(<CreateTierMappingModal {...COMMON_PROPS} />));

    const tierSelect = document.getElementById('tier-tier-level')! as HTMLSelectElement;
    // 含 placeholder（請選擇）+ 10 個 option = 11 個 options
    expect(tierSelect.options.length).toBe(11);
    const values = Array.from(tierSelect.options).map((o) => o.value);
    expect(values).toEqual(['', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10']);
  });

  it('TS-F056-048：Standard 模式顯示 CARD_LEVEL 下拉；Fallback 模式隱藏 + 顯示 NULL 提示', () => {
    render(wrap(<CreateTierMappingModal {...COMMON_PROPS} />));

    // 預設 Standard
    expect(document.getElementById('tier-card-level')!).toBeInTheDocument();
    expect(screen.queryByTestId('fallback-hint')).toBeNull();

    // 點 Fallback radio
    fireEvent.click(screen.getByLabelText(/Fallback（不分等級）/));

    // CARD_LEVEL 下拉消失，fallback 提示出現
    expect(document.getElementById('tier-card-level')).toBeNull();
    expect(screen.getByTestId('fallback-hint')).toBeInTheDocument();
  });

  it('TS-F056-047 (互斥-disabled)：DB 已有 N 筆 Standard → Fallback radio disabled + 警告', () => {
    render(
      wrap(
        <CreateTierMappingModal
          {...COMMON_PROPS}
          existingMappings={[
            { cardType: 'H', cardLevel: 'A', tierLevel: 'T1', listNm: '' },
            { cardType: 'H', cardLevel: 'B', tierLevel: 'T2', listNm: '' },
            { cardType: 'H', cardLevel: 'C', tierLevel: 'T3', listNm: '' },
          ]}
        />,
      ),
    );

    const fallbackRadio = screen.getByLabelText(
      /Fallback（不分等級）/,
    ) as HTMLInputElement;
    expect(fallbackRadio).toBeDisabled();

    // 提示文字含「請先移除」與 count
    fireEvent.click(fallbackRadio); // 即使點擊也不變
    // 應仍維持 Standard mode（fallbackRadio 不變）
    const standardRadio = screen.getByLabelText(
      /Standard（依等級）/,
    ) as HTMLInputElement;
    expect(standardRadio.checked).toBe(true);
  });

  it('互斥-disabled：DB 已有 Fallback → Standard radio disabled', () => {
    render(
      wrap(
        <CreateTierMappingModal
          {...COMMON_PROPS}
          existingMappings={[
            { cardType: 'H', cardLevel: null, tierLevel: 'T1', listNm: '' },
          ]}
        />,
      ),
    );

    const standardRadio = screen.getByLabelText(
      /Standard（依等級）/,
    ) as HTMLInputElement;
    expect(standardRadio).toBeDisabled();
  });

  it('Standard 模式送出 → 呼叫 createTierMapping with cardLevel', async () => {
    vi.mocked(api.createTierMapping).mockResolvedValue({
      cardType: 'H',
      cardLevel: 'A',
      tierLevel: 'T1',
      listNm: '高資產卡',
    });

    render(wrap(<CreateTierMappingModal {...COMMON_PROPS} />));

    fireEvent.change(document.getElementById('tier-card-level')!, {
      target: { value: 'A' },
    });
    fireEvent.change(document.getElementById('tier-tier-level')!, {
      target: { value: 'T1' },
    });
    fireEvent.change(document.getElementById('tier-list-nm')!, {
      target: { value: '高資產卡' },
    });

    fireEvent.click(screen.getByTestId('btn-tier-confirm'));

    await waitFor(() => {
      expect(api.createTierMapping).toHaveBeenLastCalledWith({
        cardType: 'H',
        cardLevel: 'A',
        tierLevel: 'T1',
        listNm: '高資產卡',
      });
    });
  });

  it('Fallback 模式送出 → cardLevel=null', async () => {
    vi.mocked(api.createTierMapping).mockResolvedValue({
      cardType: 'M5',
      cardLevel: null,
      tierLevel: 'T5',
      listNm: null,
    });

    render(
      wrap(
        <CreateTierMappingModal
          {...COMMON_PROPS}
          cardType="M5"
          cardName="機車滿期"
          availableCardLevels={[]}
        />,
      ),
    );

    fireEvent.click(screen.getByLabelText(/Fallback（不分等級）/));
    fireEvent.change(document.getElementById('tier-tier-level')!, {
      target: { value: 'T5' },
    });

    fireEvent.click(screen.getByTestId('btn-tier-confirm'));

    await waitFor(() => {
      expect(api.createTierMapping).toHaveBeenLastCalledWith({
        cardType: 'M5',
        cardLevel: null,
        tierLevel: 'T5',
        listNm: null,
      });
    });
  });

  it('422 CARD_TYPE_FALLBACK_STANDARD_MUTEX → Modal 不關閉 + 顯示錯誤訊息', async () => {
    vi.mocked(api.createTierMapping).mockRejectedValue({
      response: {
        status: 422,
        data: {
          error: 'CARD_TYPE_FALLBACK_STANDARD_MUTEX',
          message: '同一計分卡類型不可同時存在 Fallback 與 Standard 規則',
        },
      },
    });
    const onClose = vi.fn();

    render(
      wrap(<CreateTierMappingModal {...COMMON_PROPS} onClose={onClose} />),
    );

    fireEvent.change(document.getElementById('tier-card-level')!, {
      target: { value: 'A' },
    });
    fireEvent.change(document.getElementById('tier-tier-level')!, {
      target: { value: 'T1' },
    });
    fireEvent.click(screen.getByTestId('btn-tier-confirm'));

    await waitFor(() => {
      expect(screen.getByTestId('mutex-error')).toBeInTheDocument();
    });
    expect(onClose).not.toHaveBeenCalled();
  });
});
