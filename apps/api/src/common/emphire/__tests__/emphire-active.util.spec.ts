import { describe, it, expect } from 'vitest';
import {
  toYmd,
  isEmphireActive,
  activeEmphireCondition,
} from '../emphire-active.util';

/**
 * emphire-active.util — 「在職 / 離職」語意共用工具測試。
 *
 * 對齊 legacy SP（RESIGN_DATE < @SYS_DT = 離職）：在職 = NULL 或 resign_date >= sysDate；
 * 真實資料哨兵 '9999-12-31' = 永久在職。防止 `resign_date IS NULL` 舊假設再度 drift。
 */
describe('emphire-active.util', () => {
  describe('toYmd', () => {
    it('Date → YYYY-MM-DD（UTC）', () => {
      expect(toYmd(new Date('2026-07-03T12:34:56Z'))).toBe('2026-07-03');
    });
    it('哨兵 9999-12-31', () => {
      expect(toYmd(new Date('9999-12-31T00:00:00Z'))).toBe('9999-12-31');
    });
    it('ISO datetime 字串取前 10 碼', () => {
      expect(toYmd('2025-01-15T08:00:00.000Z')).toBe('2025-01-15');
    });
    it('YYYY-MM-DD 字串原樣', () => {
      expect(toYmd('2025-01-15')).toBe('2025-01-15');
    });
    it('null / undefined → null', () => {
      expect(toYmd(null)).toBeNull();
      expect(toYmd(undefined)).toBeNull();
    });
  });

  describe('isEmphireActive', () => {
    const SYS = '2026-07-03';

    it('null → 在職（true）', () => {
      expect(isEmphireActive(null, SYS)).toBe(true);
    });
    it('哨兵 9999-12-31 → 在職（真實 contract 主要情境）', () => {
      expect(isEmphireActive(new Date('9999-12-31T00:00:00Z'), SYS)).toBe(true);
      expect(isEmphireActive('9999-12-31', SYS)).toBe(true);
    });
    it('過去日期 → 離職（false）', () => {
      expect(isEmphireActive('2025-12-31', SYS)).toBe(false);
      expect(isEmphireActive(new Date('2024-05-31T00:00:00Z'), SYS)).toBe(false);
    });
    it('resign_date == sysDate → 在職（legacy 為嚴格 < 才離職）', () => {
      expect(isEmphireActive('2026-07-03', SYS)).toBe(true);
    });
    it('未來日期 → 在職', () => {
      expect(isEmphireActive('2026-07-04', SYS)).toBe(true);
    });
    it('省略 sysDate 時以今日為準（哨兵恆在職 / 遠古日恆離職）', () => {
      expect(isEmphireActive('9999-12-31')).toBe(true);
      expect(isEmphireActive('2000-01-01')).toBe(false);
      expect(isEmphireActive(null)).toBe(true);
    });
  });

  describe('activeEmphireCondition', () => {
    it('產生含 :sysDate 的 SQL 片段（NULL 或 >= sysDate）', () => {
      expect(activeEmphireCondition('e')).toBe(
        '(e.resign_date IS NULL OR e.resign_date >= :sysDate)',
      );
    });
    it('可自訂 alias 與參數名', () => {
      expect(activeEmphireCondition('emp', 'asOf')).toBe(
        '(emp.resign_date IS NULL OR emp.resign_date >= :asOf)',
      );
    });
  });
});
