import { Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, Repository } from 'typeorm';
import { ObEmplSet } from '@/database/entities/ob-empl-set.entity';
import { ObEmphire } from '@/database/entities/ob-emphire.entity';
import { ObDeptPct } from '@/database/entities/ob-dept-pct.entity';
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
    @InjectRepository(ObDeptPct)
    private readonly deptPctRepo: Repository<ObDeptPct>,
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
   * F084 推進前置驗證：listNo 下「**所有 deptRatio > 0 且有在職員工的部門**」
   * 之個別業務比例總和皆需 = 100。
   *
   * universe（必須完成設定的部門）= `ob_dept_pct` 中 `ration > 0` 之部門
   * （= 部長有配額、F082 GET 會顯示供設定的部門；對齊 F082 BR-18）。
   * - 該設部門完全沒設（`ob_empl_set` 0 筆 → sum=0）→ 視為未完成 → 攔截。
   * - 全員離職部門（active=0）→ BR-8 短路放行。
   * - deptRatio = 0 之部門 → 不在 universe，不要求設定。
   *
   * 2026-05-25 修正：原以 `GROUP BY ob_empl_set.deptid_m` 為 universe（只驗
   * 「已有紀錄的部門」），導致「該設但完全沒設」的部門被漏檢、提早推進。
   *
   * @throws 422 PERSONNEL_RATIO_SUM_NOT_100（首個違規部門）
   */
  async assertAllDeptsSumEquals100(listNo: string): Promise<void> {
    const requiredDepts = await this.getRequiredDeptCodes(listNo);
    const sumByDept = await this.sumByDeptFromRepo(listNo);

    for (const deptCode of requiredDepts) {
      const active = await this.countActiveEmployees(deptCode);
      if (active === 0) {
        this.logger.log(
          `Dept ${deptCode}: 全員離職邊界，listNo=${listNo} 推進前驗證短路放行`,
        );
        continue;
      }
      const sum = sumByDept.get(deptCode) ?? 0; // 0 筆 → sum=0 → 未完成
      if (Math.abs(sum - 100) > PersonnelRatioValidationService.FLOAT_TOLERANCE) {
        throw new UnprocessableEntityException({
          error: ERROR_CODES.PERSONNEL_RATIO_SUM_NOT_100,
          message: ERROR_MESSAGES.PERSONNEL_RATIO_SUM_NOT_100,
          details: [{ deptCode, listNo, actualSum: Math.round(sum * 100) / 100 }],
        });
      }
    }
  }

  /**
   * F084 v2.0 auto-advance 完成度偵測（EntityManager 版本 / AD-E07-19 §19.3.2）。
   *
   * 與 assertAllDeptsSumEquals100 行為相同（universe = deptRatio > 0 且有在職員工
   * 的部門；該設未設視為未完成；全員離職短路），但使用呼叫端傳入的 `mgr` 查詢，
   * 以讀取「同一 transaction 內剛 INSERT 但尚未 commit」的 ob_empl_set 資料
   * （READ COMMITTED 下，全域 repository 看不到同 tx 未 commit 的寫入）。
   *
   * @throws 422 PERSONNEL_RATIO_SUM_NOT_100（首個違規部門）
   */
  async assertAllDeptsSumEquals100WithMgr(
    listNo: string,
    mgr: EntityManager,
  ): Promise<void> {
    const requiredDepts = await this.getRequiredDeptCodesWithMgr(listNo, mgr);
    const sumByDept = await this.sumByDeptWithMgr(listNo, mgr);

    for (const deptCode of requiredDepts) {
      const active = await this.countActiveEmployeesWithMgr(deptCode, mgr);
      if (active === 0) {
        this.logger.log(
          `Dept ${deptCode}: 全員離職邊界，listNo=${listNo} auto-advance 偵測短路放行`,
        );
        continue;
      }
      const sum = sumByDept.get(deptCode) ?? 0; // 0 筆 → sum=0 → 未完成
      if (Math.abs(sum - 100) > PersonnelRatioValidationService.FLOAT_TOLERANCE) {
        throw new UnprocessableEntityException({
          error: ERROR_CODES.PERSONNEL_RATIO_SUM_NOT_100,
          message: ERROR_MESSAGES.PERSONNEL_RATIO_SUM_NOT_100,
          details: [{ deptCode, listNo, actualSum: Math.round(sum * 100) / 100 }],
        });
      }
    }
  }

  /** universe：ob_dept_pct 中 ration > 0 之部門代碼（TRIM）。ration 在 JS 過濾以跨 PG/SQLite。 */
  private async getRequiredDeptCodes(listNo: string): Promise<string[]> {
    const rows = await this.deptPctRepo.find({ where: { list_no: listNo } });
    return rows
      .filter((r) => Number(r.ration) > 0)
      .map((r) => (r.obdeptid ?? '').trim())
      .filter((c) => c.length > 0);
  }

  private async getRequiredDeptCodesWithMgr(
    listNo: string,
    mgr: EntityManager,
  ): Promise<string[]> {
    const rows = await mgr.find(ObDeptPct, { where: { list_no: listNo } });
    return rows
      .filter((r) => Number(r.ration) > 0)
      .map((r) => (r.obdeptid ?? '').trim())
      .filter((c) => c.length > 0);
  }

  /** 各部門 ob_empl_set ration 加總（TRIM(deptid_m) → sum）。 */
  private async sumByDeptFromRepo(listNo: string): Promise<Map<string, number>> {
    const groups: Array<{ deptid_m: string; sumRation: string | number }> =
      await this.emplSetRepo
        .createQueryBuilder('e')
        .select('e.deptid_m', 'deptid_m')
        .addSelect('SUM(e.ration)', 'sumRation')
        .where('e.list_no = :listNo', { listNo })
        .groupBy('e.deptid_m')
        .getRawMany();
    return new Map(
      groups.map((g) => [(g.deptid_m ?? '').trim(), Number(g.sumRation ?? 0)]),
    );
  }

  private async sumByDeptWithMgr(
    listNo: string,
    mgr: EntityManager,
  ): Promise<Map<string, number>> {
    const groups: Array<{ deptid_m: string; sumRation: string | number }> =
      await mgr
        .createQueryBuilder(ObEmplSet, 'e')
        .select('e.deptid_m', 'deptid_m')
        .addSelect('SUM(e.ration)', 'sumRation')
        .where('e.list_no = :listNo', { listNo })
        .groupBy('e.deptid_m')
        .getRawMany();
    return new Map(
      groups.map((g) => [(g.deptid_m ?? '').trim(), Number(g.sumRation ?? 0)]),
    );
  }

  /** 計算指定部門 active（未離職）員工數。 */
  private async countActiveEmployees(deptCode: string): Promise<number> {
    return this.emphireRepo.count({
      where: { dept_code: deptCode, resign_date: IsNull() },
    });
  }

  /** 計算指定部門 active 員工數（EntityManager 版本，走同一 tx）。 */
  private async countActiveEmployeesWithMgr(
    deptCode: string,
    mgr: EntityManager,
  ): Promise<number> {
    return mgr.count(ObEmphire, {
      where: { dept_code: deptCode, resign_date: IsNull() },
    });
  }
}
