/**
 * AD-E07-45 v1.2 / I-SAMPLE-CLIENT-HISTOGRAM-01：per-cardType histogram 快取 hook 測試
 *
 * cross-ref F055-test.md：
 *   TS-F055-056：histogram 每 cardType 僅載入一次（同 cardType 重複 render 不重抓）
 *   TS-F055-059：切換 cardType 觸發新的一次請求（快取依 cardType 區分）
 */

import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCardLevelHistogram } from '../use-card-level-histogram';
import * as api from '@/api/assignment-scoring';

vi.mock('@/api/assignment-scoring', async () => {
  const actual = await vi.importActual<typeof api>('@/api/assignment-scoring');
  return { ...actual, previewCardLevels: vi.fn() };
});

const mockedPreview = vi.mocked(api.previewCardLevels);

const LEVELS = [
  { cardLevel: 'A', scoreS: 243, scoreE: 999 },
  { cardLevel: 'B', scoreS: 0, scoreE: 242 },
];

function Harness({ cardType }: { cardType: string }) {
  const q = useCardLevelHistogram(cardType, LEVELS as any);
  return (
    <div data-testid="out">
      {q.isLoading ? 'loading' : `total:${q.data?.totalCount ?? '-'}`}
    </div>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedPreview.mockResolvedValue({
    distribution: {},
    histogram: [{ score: 300, count: 1 }],
    isEstimate: true,
    sampleSize: 100,
    totalCount: 100,
  });
});

describe('useCardLevelHistogram', () => {
  it('TS-F055-056：同一 QueryClient 下同 cardType 兩個 observer 只抓一次', async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={qc}>
        <Harness cardType="H" />
        <Harness cardType="H" />
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(screen.getAllByTestId('out')[0].textContent).toContain('total:100');
    });
    // 兩個 observer 共享同一 query key → previewCardLevels 只被呼叫 1 次
    expect(mockedPreview).toHaveBeenCalledTimes(1);
    expect(mockedPreview).toHaveBeenCalledWith('H', LEVELS);
  });

  it('TS-F055-059：切換 cardType 觸發新的一次請求', async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { rerender } = render(
      <QueryClientProvider client={qc}>
        <Harness cardType="H" />
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('out').textContent).toContain('total:100');
    });
    expect(mockedPreview).toHaveBeenCalledTimes(1);

    rerender(
      <QueryClientProvider client={qc}>
        <Harness cardType="S5" />
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(mockedPreview).toHaveBeenCalledTimes(2);
    });
    expect(mockedPreview).toHaveBeenLastCalledWith('S5', LEVELS);
  });

  it('cardType 為空時停用（levels 有值但無 cardType 不抓）', () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={qc}>
        <Harness cardType="" />
      </QueryClientProvider>,
    );
    expect(mockedPreview).not.toHaveBeenCalled();
  });
});
