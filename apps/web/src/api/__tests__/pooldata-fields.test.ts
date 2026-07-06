/**
 * pooldata-fields API client — regression tests
 *
 * 案例：
 *   reactivate-1：reactivateOption() body 必須含 `isActive: true`
 *     （F076 §5.3 / update-pooldata-option.dto.ts @Equals(true)；漏帶會 422
 *     「此端點僅支援重新啟用（isActive=true）」— 2026-05-20 incident）
 *   reactivate-2：optionLabel 一併提供時要透傳
 *   deactivate-1：deactivateOption() body 含 isActive=false + reason
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiClient } from '../client';
import { reactivateOption, deactivateOption, reorderOptions } from '../pooldata-fields';

vi.mock('../client', () => ({
  apiClient: {
    patch: vi.fn(),
  },
}));

const mockedPatch = vi.mocked(apiClient.patch);

beforeEach(() => {
  vi.clearAllMocks();
  mockedPatch.mockResolvedValue({ data: {} });
});

describe('pooldata-fields API client', () => {
  it('reactivate-1：reactivateOption body 必含 isActive=true（regression for backend @Equals(true)）', async () => {
    await reactivateOption('prod_kind', '01');
    expect(mockedPatch).toHaveBeenCalledWith(
      '/api/v1/pooldata-fields/prod_kind/options/01',
      expect.objectContaining({ isActive: true }),
    );
  });

  it('reactivate-2：reactivateOption 一併提供 optionLabel 時透傳', async () => {
    await reactivateOption('prod_kind', '01', { optionLabel: '汽車新車（更新）' });
    expect(mockedPatch).toHaveBeenCalledWith(
      '/api/v1/pooldata-fields/prod_kind/options/01',
      { isActive: true, optionLabel: '汽車新車（更新）' },
    );
  });

  it('deactivate-1：deactivateOption body 含 isActive=false + reason，路徑帶 /deactivate', async () => {
    await deactivateOption('prod_kind', '01', { isActive: false, reason: '與新代碼合併' });
    expect(mockedPatch).toHaveBeenCalledWith(
      '/api/v1/pooldata-fields/prod_kind/options/01/deactivate',
      { isActive: false, reason: '與新代碼合併' },
    );
  });

  it('reorder-1：reorderOptions PATCH /options/reorder，body 帶 orderedValues 陣列', async () => {
    mockedPatch.mockResolvedValue({ data: { options: [] } });
    await reorderOptions('prod_kind', ['02', '01', '03']);
    expect(mockedPatch).toHaveBeenCalledWith(
      '/api/v1/pooldata-fields/prod_kind/options/reorder',
      { orderedValues: ['02', '01', '03'] },
    );
  });
});
