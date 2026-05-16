import { describe, it, expect, beforeEach } from 'vitest';
import { UnprocessableEntityException } from '@nestjs/common';
import { RatioValidationService } from '../ratio-validation.service';
import { ERROR_CODES } from '@/common/errors/error-codes';

/**
 * RatioValidationService（AD-E07 v3.0 / E07 重構批次 4 / 2026-05-15）
 *
 * 提供 2 個 method：
 *   - assertSumEquals100(ratios) — F079 PUT + F080 推進前置驗證
 *   - assertEachInRange(ratios, [0, 100]) — 單欄位邊界校驗
 *
 * 錯誤碼：
 *   - RATIO_SUM_NOT_100（422）
 *   - RATIO_OUT_OF_RANGE（422）
 */
describe('RatioValidationService', () => {
  let service: RatioValidationService;

  beforeEach(() => {
    service = new RatioValidationService();
  });

  describe('assertSumEquals100', () => {
    it('總和 = 100 → pass', () => {
      expect(() => service.assertSumEquals100([60, 40])).not.toThrow();
      expect(() => service.assertSumEquals100([30, 30, 40])).not.toThrow();
    });

    it('總和 = 100.0（小數精度）→ pass', () => {
      expect(() => service.assertSumEquals100([33.3, 33.3, 33.4])).not.toThrow();
    });

    it('總和 != 100 → 422 RATIO_SUM_NOT_100', () => {
      expect(() => service.assertSumEquals100([60, 50])).toThrow(UnprocessableEntityException);
      try {
        service.assertSumEquals100([60, 50]);
      } catch (e: any) {
        expect(e.response.error).toBe(ERROR_CODES.RATIO_SUM_NOT_100);
      }
    });

    it('空陣列 → 視為總和 = 0 → 422', () => {
      expect(() => service.assertSumEquals100([])).toThrow(UnprocessableEntityException);
    });

    it('總和差 < 0.01 → 視為相等（浮點容差）', () => {
      expect(() => service.assertSumEquals100([33.33, 33.33, 33.34])).not.toThrow();
    });
  });

  describe('assertEachInRange', () => {
    it('全部在 [0, 100] → pass', () => {
      expect(() => service.assertEachInRange([0, 50, 100])).not.toThrow();
    });

    it('有負值 → 422 RATIO_OUT_OF_RANGE', () => {
      expect(() => service.assertEachInRange([50, -1])).toThrow(UnprocessableEntityException);
      try {
        service.assertEachInRange([50, -1]);
      } catch (e: any) {
        expect(e.response.error).toBe(ERROR_CODES.RATIO_OUT_OF_RANGE);
      }
    });

    it('有 > 100 值 → 422 RATIO_OUT_OF_RANGE', () => {
      expect(() => service.assertEachInRange([50, 101])).toThrow(UnprocessableEntityException);
    });

    it('客製化範圍 [0, 50] → 60 → 422', () => {
      expect(() => service.assertEachInRange([30, 60], [0, 50])).toThrow(
        UnprocessableEntityException,
      );
    });
  });
});
