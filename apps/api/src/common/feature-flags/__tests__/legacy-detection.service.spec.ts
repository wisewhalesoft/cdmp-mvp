import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Logger } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { LegacyDetectionService } from '../legacy-detection.service';

/**
 * LegacyDetectionService（AD-E07 v3.0 / 決議 #T2 / 2026-05-16）
 *
 * 啟動時偵測 legacy 資料殘留：
 *   - users.is_sales_manager = true 仍存在（m14 之後應全部 DROP COLUMN，
 *     但 backward-compat 階段可能仍有資料殘留）
 *   - users.business_role 為非允許值（DB CHECK 應已攔截，雙層保護）
 *
 * 觸發時機：on application bootstrap（NestJS OnApplicationBootstrap hook）
 * 行為：偵測到 legacy 資料時 logger.warn（不阻擋啟動）；無殘留則 logger.log。
 */
describe('LegacyDetectionService', () => {
  let service: LegacyDetectionService;
  let dataSource: { query: ReturnType<typeof vi.fn> };
  let warnSpy: any;
  let logSpy: any;

  beforeEach(() => {
    dataSource = {
      query: vi.fn(),
    };
    warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    logSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    service = new LegacyDetectionService(dataSource as unknown as DataSource);
  });

  it('偵測到 is_sales_manager=true 殘留 → logger.warn 提示需 admin 重新指派', async () => {
    dataSource.query
      .mockResolvedValueOnce([{ count: '5' }]) // is_sales_manager check
      .mockResolvedValueOnce([{ count: '0' }]); // invalid business_role check

    await service.onApplicationBootstrap();

    const warnCalls = warnSpy.mock.calls.map((c: any[]) => String(c[0]));
    expect(warnCalls.some((s: string) => /is_sales_manager/i.test(s) && /5/.test(s))).toBe(true);
  });

  it('無 legacy 資料殘留 → logger.log 表示乾淨啟動', async () => {
    dataSource.query
      .mockResolvedValueOnce([{ count: '0' }])
      .mockResolvedValueOnce([{ count: '0' }]);

    await service.onApplicationBootstrap();

    expect(warnSpy).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalled();
  });

  it('資料表不存在（column dropped already）→ 吞例外，不阻擋啟動', async () => {
    dataSource.query.mockRejectedValue(new Error('column "is_sales_manager" does not exist'));

    await expect(service.onApplicationBootstrap()).resolves.not.toThrow();
    // 預期 logger.log 訊息表示 column already dropped，視為正常
    expect(logSpy).toHaveBeenCalled();
  });

  it('偵測到 invalid business_role 值 → logger.warn', async () => {
    dataSource.query
      .mockResolvedValueOnce([{ count: '0' }]) // is_sales_manager OK
      .mockResolvedValueOnce([{ count: '2' }]); // invalid business_role 2 筆

    await service.onApplicationBootstrap();

    const warnCalls = warnSpy.mock.calls.map((c: any[]) => String(c[0]));
    expect(warnCalls.some((s: string) => /business_role.*invalid|非允許值/i.test(s))).toBe(true);
  });
});
