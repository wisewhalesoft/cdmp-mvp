import { Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { ObEmplSet } from '@/database/entities/ob-empl-set.entity';
import { ObEmphire } from '@/database/entities/ob-emphire.entity';
import { ERROR_CODES, ERROR_MESSAGES } from '@/common/errors/error-codes';

/**
 * PersonnelRatioValidationService（AD-E07 v3.0 / E07 重構批次 5 / 2026-05-15）
 *
 * per-DEPT 個別業務比例驗算 helper。對應 F082 / F084。
 *
 * v1.3 / 決議 #1（2026-05-16）：全員離職邊界 — 部門 activeEmployeeCount === 0 時
 * `assertDeptSumEquals100` 短路 return，允許 sum = 0% 不阻擋儲存 / 推進。
 */
@Injectable()
export class PersonnelRatioValidationService {
  private readonly logger = new Logger(PersonnelRatioValidationService.name);
  private static readonly FLOAT_TOLERANCE = 0.01;

  constructor(
    @InjectRepository(ObEmplSet)
    private readonly emplSetRepo: Repository<ObEmplSet>,
    @InjectRepository(ObEmphire)
    private readonly emphireRepo: Repository<ObEmphire>,
  ) {}

  /**
   * 驗證單一部門個別業務比例總和為 100（容差 0.01）。
   *
   * @param deptCode 部門代碼
   * @param ratios   該部門所有 emplid 之 ration 列表
   * @param activeEmployeeCount 該部門 active 員工數（離職員工不計）；
   *                            === 0 時短路 return（全員離職邊界）
   * @throws 422 PERSONNEL_RATIO_SUM_NOT_100
   */
  assertDeptSumEquals100(
    deptCode: string,
    ratios: number[],
    activeEmployeeCount: number,
  ): void {
    if (activeEmployeeCount === 0) {
      this.logger.log(
        `Dept ${deptCode}: 全員離職邊界（activeEmployeeCount=0），短路放行比例校驗`,
      );
      return;
    }

    const sum = (ratios ?? []).reduce((acc, v) => acc + Number(v ?? 0), 0);
    if (Math.abs(sum - 100) > PersonnelRatioValidationService.FLOAT_TOLERANCE) {
      throw new UnprocessableEntityException({
        error: ERROR_CODES.PERSONNEL_RATIO_SUM_NOT_100,
        message: ERROR_MESSAGES.PERSONNEL_RATIO_SUM_NOT_100,
        details: [{ field: 'ratios', deptCode, actualSum: Math.round(sum * 100) / 100 }],
      });
    }
  }

  /**
   * F084 推進前置驗證：listNo 下「所有部門」之比例總和皆需 = 100，
   * 但全員離職部門 (active=0) 短路放行。
   *
   * @throws 422 PERSONNEL_RATIO_SUM_NOT_100（首個違規部門）
   */
  async assertAllDeptsSumEquals100(listNo: string): Promise<void> {
    const groups: Array<{ deptid_m: string; sumRation: string | number }> =
      await this.emplSetRepo
        .createQueryBuilder('e')
        .select('e.deptid_m', 'deptid_m')
        .addSelect('SUM(e.ration)', 'sumRation')
        .where('e.list_no = :listNo', { listNo })
        .groupBy('e.deptid_m')
        .getRawMany();

    for (const row of groups) {
      const deptCode = row.deptid_m;
      const sum = Number(row.sumRation ?? 0);
      const active = await this.countActiveEmployees(deptCode);
      if (active === 0) {
        this.logger.log(
          `Dept ${deptCode}: 全員離職邊界，listNo=${listNo} 推進前驗證短路放行`,
        );
        continue;
      }
      if (Math.abs(sum - 100) > PersonnelRatioValidationService.FLOAT_TOLERANCE) {
        throw new UnprocessableEntityException({
          error: ERROR_CODES.PERSONNEL_RATIO_SUM_NOT_100,
          message: ERROR_MESSAGES.PERSONNEL_RATIO_SUM_NOT_100,
          details: [{ deptCode, listNo, actualSum: Math.round(sum * 100) / 100 }],
        });
      }
    }
  }

  /** 計算指定部門 active（未離職）員工數。 */
  private async countActiveEmployees(deptCode: string): Promise<number> {
    return this.emphireRepo.count({
      where: { dept_code: deptCode, resign_date: IsNull() },
    });
  }
}
