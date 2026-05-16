import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { ERROR_CODES, ERROR_MESSAGES } from '@/common/errors/error-codes';

/**
 * RatioValidationService（AD-E07 v3.0 / E07 重構批次 4 / 2026-05-15）
 *
 * per-LIST_NO 部門比例驗算 helper。對應 F079 / F080。
 */
@Injectable()
export class RatioValidationService {
  private static readonly FLOAT_TOLERANCE = 0.01;

  /**
   * 驗證一組比例總和為 100（允許浮點容差 0.01）。
   * 用於 F079 PUT 寫入校驗 + F080 推進前置條件驗證。
   *
   * @throws 422 UnprocessableEntityException + RATIO_SUM_NOT_100
   */
  assertSumEquals100(ratios: number[]): void {
    const sum = (ratios ?? []).reduce((acc, v) => acc + Number(v ?? 0), 0);
    if (Math.abs(sum - 100) > RatioValidationService.FLOAT_TOLERANCE) {
      throw new UnprocessableEntityException({
        error: ERROR_CODES.RATIO_SUM_NOT_100,
        message: ERROR_MESSAGES.RATIO_SUM_NOT_100,
        details: [{ field: 'ratios', actualSum: Math.round(sum * 100) / 100, expectedSum: 100 }],
      });
    }
  }

  /**
   * 驗證每個比例值落在 [min, max] 範圍。預設 [0, 100]。
   *
   * @throws 422 UnprocessableEntityException + RATIO_OUT_OF_RANGE
   */
  assertEachInRange(ratios: number[], range: [number, number] = [0, 100]): void {
    const [min, max] = range;
    for (const r of ratios ?? []) {
      const n = Number(r);
      if (Number.isNaN(n) || n < min || n > max) {
        throw new UnprocessableEntityException({
          error: ERROR_CODES.RATIO_OUT_OF_RANGE,
          message: ERROR_MESSAGES.RATIO_OUT_OF_RANGE,
          details: [{ field: 'ratio', value: r, allowedRange: [min, max] }],
        });
      }
    }
  }
}
