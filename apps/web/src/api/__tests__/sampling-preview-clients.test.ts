/**
 * F050 §6.3 / F055 §5.2（AD-E07-45）：抽樣估算 API client 契約測試
 *
 * 驗證：
 *   - previewHitCount → POST /assignment/list-definitions/preview-hit-count，body { conditionPayload }
 *   - previewCardLevels → GET /assignment/scoring/card-levels/preview，回應含 histogram/sampleSize/totalCount
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn() },
}));

import { apiClient } from '../client';
import { previewHitCount } from '../assignment-list';
import { previewCardLevels } from '../assignment-scoring';

const mockedGet = vi.mocked(apiClient.get);
const mockedPost = vi.mocked(apiClient.post);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('previewHitCount API client', () => {
  it('POST 至 /assignment/list-definitions/preview-hit-count，body 為 { conditionPayload }', async () => {
    mockedPost.mockResolvedValue({
      data: {
        estimatedHitCount: 67180,
        isEstimate: true,
        sampleSize: 50000,
        totalCount: 1679489,
      },
    } as never);

    const res = await previewHitCount({
      conditions: [
        { columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] },
      ],
      logic: 'AND',
    });

    expect(mockedPost).toHaveBeenCalledWith(
      '/assignment/list-definitions/preview-hit-count',
      {
        conditionPayload: {
          conditions: [
            { columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] },
          ],
          logic: 'AND',
        },
      },
    );
    expect(res.estimatedHitCount).toBe(67180);
    expect(res.isEstimate).toBe(true);
    expect(res.sampleSize).toBe(50000);
    expect(res.totalCount).toBe(1679489);
  });
});

describe('previewCardLevels API client（v1.2 histogram 契約）', () => {
  it('GET /assignment/scoring/card-levels/preview，透傳 histogram/sampleSize/totalCount', async () => {
    mockedGet.mockResolvedValue({
      data: {
        distribution: { A: 20, B: 40, C: 30, D: 10 },
        histogram: [
          { score: 300, count: 20 },
          { score: 220, count: 40 },
        ],
        isEstimate: true,
        sampleSize: 100,
        totalCount: 100,
      },
    } as never);

    const res = await previewCardLevels('H', [
      { cardLevel: 'A', scoreS: 243, scoreE: 999 },
    ]);

    expect(mockedGet).toHaveBeenCalledWith(
      '/assignment/scoring/card-levels/preview',
      expect.objectContaining({
        params: expect.objectContaining({ cardType: 'H' }),
      }),
    );
    expect(res.histogram).toEqual([
      { score: 300, count: 20 },
      { score: 220, count: 40 },
    ]);
    expect(res.isEstimate).toBe(true);
    expect(res.sampleSize).toBe(100);
    expect(res.totalCount).toBe(100);
  });
});
