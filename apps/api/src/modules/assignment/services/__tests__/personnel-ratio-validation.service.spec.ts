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
  let deptPctRepo: any;

  beforeEach(() => {
    emplSetRepo = {
      createQueryBuilder: vi.fn(),
      find: vi.fn(),
    };
    emphireRepo = {
      count: vi.fn(),
      createQueryBuilder: vi.fn(),
    };
    deptPctRepo = {
      // universe = deptRatio > 0 之部門；預設空（個別測試覆寫）
      find: vi.fn().mockResolvedValue([]),
    };
    service = new PersonnelRatioValidationService(
      emplSetRepo as Repository<ObEmplSet>,
      emphireRepo as Repository<ObEmphire>,
      deptPctRepo as any,
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
    // helper：mock ob_empl_set group-by-dept 加總
    const mockEmplSetSums = (groupRows: Array<{ deptid_m: string; sumRation: string }>) => {
      emplSetRepo.createQueryBuilder.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        addSelect: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        groupBy: vi.fn().mockReturnThis(),
        getRawMany: vi.fn().mockResolvedValue(groupRows),
      });
    };

    it('所有 deptRatio>0 部門 sum = 100 → pass', async () => {
      // universe = D001 / D002（ration>0）
      deptPctRepo.find.mockResolvedValue([
        { obdeptid: 'D001', ration: '50' },
        { obdeptid: 'D002', ration: '50' },
      ]);
      mockEmplSetSums([
        { deptid_m: 'D001', sumRation: '100.0' },
        { deptid_m: 'D002', sumRation: '100.0' },
      ]);
      emphireRepo.count.mockResolvedValue(3); // 兩部門均有 active 員工

      await expect(service.assertAllDeptsSumEquals100('L001')).resolves.toBeUndefined();
    });

    it('某 deptRatio>0 部門 sum != 100 且 active > 0 → 422', async () => {
      deptPctRepo.find.mockResolvedValue([{ obdeptid: 'D001', ration: '100' }]);
      mockEmplSetSums([{ deptid_m: 'D001', sumRation: '80.0' }]);
      emphireRepo.count.mockResolvedValue(2);

      await expect(service.assertAllDeptsSumEquals100('L001')).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('某 deptRatio>0 部門全員離職 → 短路放行（即使 0 筆 / sum=0）', async () => {
      deptPctRepo.find.mockResolvedValue([{ obdeptid: 'D001', ration: '100' }]);
      mockEmplSetSums([]); // 全員離職 → 沒設 / 0 筆
      emphireRepo.count.mockResolvedValue(0);

      await expect(service.assertAllDeptsSumEquals100('L001')).resolves.toBeUndefined();
    });

    // 迴歸：universe = deptRatio>0（非 group-by-empl_set）。修復 OB202605002 提早推進。
    it('deptRatio>0 部門「完全沒設」（empl_set 0 筆）且 active > 0 → 422（不可放行）', async () => {
      // 4 個 deptRatio>0 部門，但只有 XVE4 設了 → XVE1/2/3 未完成
      deptPctRepo.find.mockResolvedValue([
        { obdeptid: 'XVE1', ration: '25' },
        { obdeptid: 'XVE2', ration: '25' },
        { obdeptid: 'XVE3', ration: '25' },
        { obdeptid: 'XVE4', ration: '25' },
      ]);
      mockEmplSetSums([{ deptid_m: 'XVE4', sumRation: '100' }]); // 只有 XVE4 有紀錄
      emphireRepo.count.mockResolvedValue(10); // 所有部門皆有在職員工

      await expect(service.assertAllDeptsSumEquals100('L001')).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('deptRatio=0 部門不在 universe → 不要求設定（不阻擋推進）', async () => {
      // D001 ration>0 已完成；D999 ration=0（被 deptPctRepo.find 後 filter 掉）
      deptPctRepo.find.mockResolvedValue([
        { obdeptid: 'D001', ration: '100' },
        { obdeptid: 'D999', ration: '0' },
      ]);
      mockEmplSetSums([{ deptid_m: 'D001', sumRation: '100' }]);
      emphireRepo.count.mockResolvedValue(5);

      await expect(service.assertAllDeptsSumEquals100('L001')).resolves.toBeUndefined();
    });
  });
});
