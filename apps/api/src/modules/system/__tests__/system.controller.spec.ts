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

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
