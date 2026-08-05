/**
 * F118 §5.1.1（AD-E07-48 §5.1）：checkCopyDuplicates API client 契約測試
 *
 * 沿用既有 sampling-preview-clients.test.ts 之慣例：只 mock `../client`（真實 `apiClient` 之
 * axios instance），本模組其餘部分（含 `checkCopyDuplicates` 函式本體）照常執行，藉此驗證
 * F118 新增之 API client wrapper 本身（GET URL / params 形狀 / response passthrough），
 * 而非僅透過元件測試之 `vi.mock('@/api/assignment-list')` 自動 mock 間接假設其正確。
 *
 * 對應：docs/specs/contracts/F118-copy-duplicate-check.contract.ts；
 *       docs/specs/features/F118-copy-from-prev-month-duplicate-indicator.md §5.1.1 AC-5。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn() },
}));

import { apiClient } from '../client';
import { checkCopyDuplicates } from '../assignment-list';

const mockedGet = vi.mocked(apiClient.get);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('checkCopyDuplicates API client（F118 §5.1.1）', () => {
  it('GET /assignment/lists/copy-duplicate-check，params 為 { prevYm, currentYm }（AC-5：由呼叫端帶入）', async () => {
    mockedGet.mockResolvedValue({
      data: {
        prevYm: '202604',
        currentYm: '202605',
        items: [
          { listNo: 'OB202604001', alreadyCopied: true, copiedToListNo: 'OB202605003' },
          { listNo: 'OB202604002', alreadyCopied: false, copiedToListNo: null },
        ],
      },
    } as never);

    const res = await checkCopyDuplicates({ prevYm: '202604', currentYm: '202605' });

    expect(mockedGet).toHaveBeenCalledWith('/assignment/lists/copy-duplicate-check', {
      params: { prevYm: '202604', currentYm: '202605' },
    });
    expect(res.prevYm).toBe('202604');
    expect(res.currentYm).toBe('202605');
    expect(res.items).toHaveLength(2);
    expect(res.items[0]).toEqual({
      listNo: 'OB202604001',
      alreadyCopied: true,
      copiedToListNo: 'OB202605003',
    });
    expect(res.items[1]).toEqual({
      listNo: 'OB202604002',
      alreadyCopied: false,
      copiedToListNo: null,
    });
  });

  it('AC-10 降級：呼叫端 reject 時原樣拋出（本函式不吞例外，降級邏輯由呼叫端負責）', async () => {
    mockedGet.mockRejectedValue(new Error('network error'));

    await expect(
      checkCopyDuplicates({ prevYm: '202604', currentYm: '202605' }),
    ).rejects.toThrow('network error');
  });
});
