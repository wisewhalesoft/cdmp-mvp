/**
 * SystemController — GET /api/v1/system/current-work-ym（E07 重構 P1 B2 補完）
 *
 * 對應 spec：
 *   - F077 v1.2 §5.1：當前作業月份端點
 *   - architecture-spec.md §E07 currentWorkYm AD：每月 1 號 0:00 切換至當月
 *
 * 涵蓋 case：
 *   1) 任何登入用戶可呼叫，返回 { currentWorkYm: 'YYYYMM' }
 *   2) 環境變數 OVERRIDE_CURRENT_WORK_YM 強制覆蓋（測試 / 災難復原）
 *   3) 服務層 getCurrentWorkYm() 邏輯：YYYYMM of today
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SystemService } from '../system.service';
import { SystemController } from '../system.controller';

describe('SystemService.getCurrentWorkYm', () => {
  let service: SystemService;
  const originalOverride = process.env.OVERRIDE_CURRENT_WORK_YM;

  beforeEach(() => {
    service = new SystemService();
  });

  afterEach(() => {
    if (originalOverride === undefined) {
      delete process.env.OVERRIDE_CURRENT_WORK_YM;
    } else {
      process.env.OVERRIDE_CURRENT_WORK_YM = originalOverride;
    }
  });

  it('1) 預設返回 YYYYMM of today', () => {
    delete process.env.OVERRIDE_CURRENT_WORK_YM;
    const ym = service.getCurrentWorkYm();
    const now = new Date();
    const expected = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    expect(ym).toBe(expected);
    expect(ym).toMatch(/^\d{6}$/);
  });

  it('2) OVERRIDE_CURRENT_WORK_YM 環境變數覆蓋', () => {
    process.env.OVERRIDE_CURRENT_WORK_YM = '202612';
    const ym = service.getCurrentWorkYm();
    expect(ym).toBe('202612');
  });

  it('3) OVERRIDE 格式不正確時忽略，採用 today', () => {
    process.env.OVERRIDE_CURRENT_WORK_YM = 'invalid';
    const ym = service.getCurrentWorkYm();
    expect(ym).toMatch(/^\d{6}$/);
  });

  it('4) 注入 now 參數測試邊界', () => {
    delete process.env.OVERRIDE_CURRENT_WORK_YM;
    const explicit = new Date('2026-01-15T00:00:00Z');
    const ym = service.getCurrentWorkYm(explicit);
    expect(ym).toBe('202601');
  });
});

// =====================================================================
// F097 / AC-16 — SystemService.getDefaultTargetWorkYm（target_work_ym = current + 1）
// =====================================================================
describe('SystemService.getDefaultTargetWorkYm (F097)', () => {
  let service: SystemService;
  const originalOverride = process.env.OVERRIDE_CURRENT_WORK_YM;

  beforeEach(() => {
    service = new SystemService();
    delete process.env.OVERRIDE_CURRENT_WORK_YM;
  });

  afterEach(() => {
    if (originalOverride === undefined) {
      delete process.env.OVERRIDE_CURRENT_WORK_YM;
    } else {
      process.env.OVERRIDE_CURRENT_WORK_YM = originalOverride;
    }
  });

  // TS-F097-SVC-001：一般月 +1
  it('TS-F097-SVC-001：一般月 +1（202605 → 202606）', () => {
    const ym = service.getDefaultTargetWorkYm(new Date('2026-05-15T00:00:00Z'));
    expect(ym).toBe('202606');
  });

  // TS-F097-SVC-002：跨年邊界
  it('TS-F097-SVC-002：跨年邊界（202512 → 202601，非 202513）', () => {
    const ym = service.getDefaultTargetWorkYm(new Date('2025-12-15T00:00:00Z'));
    expect(ym).toBe('202601');
  });

  // TS-F097-SVC-003：OVERRIDE 套用後 +1
  it('TS-F097-SVC-003：OVERRIDE_CURRENT_WORK_YM=202506 → 202507', () => {
    process.env.OVERRIDE_CURRENT_WORK_YM = '202506';
    // now 對應 202505，但 OVERRIDE 覆蓋為 202506
    const ym = service.getDefaultTargetWorkYm(new Date('2026-05-15T00:00:00Z'));
    expect(service.getCurrentWorkYm(new Date('2026-05-15T00:00:00Z'))).toBe('202506');
    expect(ym).toBe('202507');
  });

  // TS-F097-SVC-004：透過 getCurrentWorkYm 取得基準月（不直接自算）
  it('TS-F097-SVC-004：透過 getCurrentWorkYm 取得基準月（spy 驗證被呼叫一次）', () => {
    const spy = vi.spyOn(service, 'getCurrentWorkYm');
    const now = new Date('2026-07-15T00:00:00Z');
    const ym = service.getDefaultTargetWorkYm(now);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(now);
    expect(ym).toBe('202608');
    spy.mockRestore();
  });

  // TS-F097-SVC-005：getCurrentWorkYm 行為不變（regression）— 12 月 +1 不污染 current
  it('TS-F097-SVC-005：getCurrentWorkYm 行為不受影響（regression）', () => {
    expect(service.getCurrentWorkYm(new Date('2025-12-15T00:00:00Z'))).toBe('202512');
    // 呼叫 default 後再驗 current 仍正確
    service.getDefaultTargetWorkYm(new Date('2025-12-15T00:00:00Z'));
    expect(service.getCurrentWorkYm(new Date('2025-12-15T00:00:00Z'))).toBe('202512');
  });
});

describe('SystemController', () => {
  let controller: SystemController;
  let service: SystemService;

  beforeEach(() => {
    service = new SystemService();
    controller = new SystemController(service);
  });

  afterEach(() => {
    delete process.env.OVERRIDE_CURRENT_WORK_YM;
  });

  it('5) GET /current-work-ym 返回 { currentWorkYm }', () => {
    process.env.OVERRIDE_CURRENT_WORK_YM = '202605';
    const res = controller.getCurrentWorkYm();
    expect(res).toEqual({ currentWorkYm: '202605' });
  });
});
