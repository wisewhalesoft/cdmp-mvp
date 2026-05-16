import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UnprocessableEntityException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { PersonnelRatioValidationService } from '../personnel-ratio-validation.service';
import { ObEmplSet } from '@/database/entities/ob-empl-set.entity';
import { ObEmphire } from '@/database/entities/ob-emphire.entity';
import { ERROR_CODES } from '@/common/errors/error-codes';

/**
 * PersonnelRatioValidationService（AD-E07 v3.0 / E07 重構批次 5 / 2026-05-15 / 2026-05-16 補全員離職邊界）
 *
 * per-DEPT 個別業務比例驗算 helper。
 *   - assertDeptSumEquals100(deptCode, ratios, activeEmployeeCount)
 *     - F082 PUT 寫入校驗
 *     - v1.3 / 決議 #1：activeEmployeeCount === 0 → 短路 return（全員離職允許 sum=0%）
 *   - assertAllDeptsSumEquals100(listNo) — F084 推進前置條件驗證
 *     - 內部查詢 ob_empl_set GROUP BY deptid_m
 *     - 全員離職部門 (activeEmployeeCount=0) 短路放行
 */
describe('PersonnelRatioValidationService', () => {
  let service: PersonnelRatioValidationService;
  let emplSetRepo: any;
  let emphireRepo: any;

  beforeEach(() => {
    emplSetRepo = {
      createQueryBuilder: vi.fn(),
      find: vi.fn(),
    };
    emphireRepo = {
      count: vi.fn(),
      createQueryBuilder: vi.fn(),
    };
    service = new PersonnelRatioValidationService(
      emplSetRepo as Repository<ObEmplSet>,
      emphireRepo as Repository<ObEmphire>,
    );
  });

  describe('assertDeptSumEquals100', () => {
    it('部門有 active 員工 + 比例總和 = 100 → pass', () => {
      expect(() =>
        service.assertDeptSumEquals100('D001', [50, 50], 2),
      ).not.toThrow();
    });

    it('部門有 active 員工 + 比例總和 != 100 → 422 PERSONNEL_RATIO_SUM_NOT_100', () => {
      expect(() =>
        service.assertDeptSumEquals100('D001', [50, 40], 2),
      ).toThrow(UnprocessableEntityException);
      try {
        service.assertDeptSumEquals100('D001', [50, 40], 2);
      } catch (e: any) {
        expect(e.response.error).toBe(ERROR_CODES.PERSONNEL_RATIO_SUM_NOT_100);
      }
    });

    it('部門全員離職 (activeEmployeeCount=0) → 短路 return（允許 sum=0%）', () => {
      expect(() => service.assertDeptSumEquals100('D001', [], 0)).not.toThrow();
      expect(() => service.assertDeptSumEquals100('D001', [0], 0)).not.toThrow();
      // 即使 sum != 100 也應放行（全員離職邊界）
      expect(() => service.assertDeptSumEquals100('D001', [50], 0)).not.toThrow();
    });

    it('小數精度容差 0.01 → pass', () => {
      expect(() =>
        service.assertDeptSumEquals100('D001', [33.33, 33.33, 33.34], 3),
      ).not.toThrow();
    });
  });

  describe('assertAllDeptsSumEquals100', () => {
    it('所有部門 sum = 100 → pass', async () => {
      // mock createQueryBuilder chain：依 dept group by 取得 sum
      const groupRows = [
        { deptid_m: 'D001', sumRation: '100.0' },
        { deptid_m: 'D002', sumRation: '100.0' },
      ];
      const qb = {
        select: vi.fn().mockReturnThis(),
        addSelect: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        groupBy: vi.fn().mockReturnThis(),
        getRawMany: vi.fn().mockResolvedValue(groupRows),
      };
      emplSetRepo.createQueryBuilder.mockReturnValue(qb);
      // 兩個部門均有 active 員工
      emphireRepo.count.mockResolvedValue(3);

      await expect(service.assertAllDeptsSumEquals100('L001')).resolves.toBeUndefined();
    });

    it('某部門 sum != 100 且該部門 active 員工 > 0 → 422', async () => {
      const groupRows = [
        { deptid_m: 'D001', sumRation: '80.0' },
      ];
      emplSetRepo.createQueryBuilder.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        addSelect: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        groupBy: vi.fn().mockReturnThis(),
        getRawMany: vi.fn().mockResolvedValue(groupRows),
      });
      emphireRepo.count.mockResolvedValue(2);

      await expect(service.assertAllDeptsSumEquals100('L001')).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('某部門全員離職 → 短路放行（即使 sum=0）', async () => {
      const groupRows = [
        { deptid_m: 'D001', sumRation: '0' },
      ];
      emplSetRepo.createQueryBuilder.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        addSelect: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        groupBy: vi.fn().mockReturnThis(),
        getRawMany: vi.fn().mockResolvedValue(groupRows),
      });
      emphireRepo.count.mockResolvedValue(0);

      await expect(service.assertAllDeptsSumEquals100('L001')).resolves.toBeUndefined();
    });
  });
});
