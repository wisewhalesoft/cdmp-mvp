import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { ObListDefinition } from '@/database/entities/ob-list-definition.entity';
import { ObDeptPct } from '@/database/entities/ob-dept-pct.entity';
import { ObEmphire } from '@/database/entities/ob-emphire.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';
import { RatioValidationService } from '@/modules/assignment/services/ratio-validation.service';
import { StageTransitionService } from '@/modules/assignment/services/stage-transition.service';
import { AssignmentRunGuardService } from '@/modules/assignment/services/assignment-run-guard.service';
import { ERROR_CODES, ERROR_MESSAGES } from '@/common/errors/error-codes';
import type { SetDeptRatioDto } from './dto/set-dept-ratio.dto';

/**
 * F079 v1.2 — 部門比例設定 Service（per-LIST_NO 各部門 RATION）
 *
 * 對應 spec：F079 §5.1 GET / §5.2 PUT。
 *
 * 流程：
 *   - GET：自 ob_emphire 取在職部門 + ob_dept_pct 既有 RATION 合併
 *   - PUT：assertStageEquals('dept_ratio') → 比例驗證 → 覆寫式寫入 → audit
 *
 * 所有寫入 method 頂層必呼 `assignmentRunGuard.assertNoRunningRun()`（BR-11）。
 * 歷史月份阻擋於 service 層執行（BR-8 / F077 BR-3）。
 */
@Injectable()
export class DeptRatioService {
  private readonly logger = new Logger(DeptRatioService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(ObListDefinition)
    private readonly listRepo: Repository<ObListDefinition>,
    @InjectRepository(ObDeptPct)
    private readonly deptPctRepo: Repository<ObDeptPct>,
    @InjectRepository(ObEmphire)
    private readonly emphireRepo: Repository<ObEmphire>,
    private readonly ratioValidation: RatioValidationService,
    private readonly stageTransition: StageTransitionService,
    private readonly runGuard: AssignmentRunGuardService,
  ) {}

  /**
   * GET /api/v1/assignment/ratios/dept/{listNo}
   *
   * Response：listNo / listNm / projectWorkym / stage / deptRatios[] / total / isReadOnly
   */
  async getDeptRatios(listNo: string): Promise<{
    listNo: string;
    listNm: string;
    projectWorkym: string;
    stage: string;
    deptRatios: Array<{
      obdeptId: string;
      obdeptNm: string;
      ration: number;
      isActive: boolean;
      directorName: string | null;
    }>;
    total: number;
    isReadOnly: boolean;
  }> {
    const list = await this.findListOrThrow(listNo);

    // 在職部門（dept_code 去重 + RTRIM；BR-6）
    const activeDeptsRaw = await this.emphireRepo
      .createQueryBuilder('e')
      .select('e.dept_code', 'dept_code')
      .addSelect('MAX(e.dept_name)', 'dept_name')
      .where('e.resign_date IS NULL')
      .groupBy('e.dept_code')
      .orderBy('e.dept_code', 'ASC')
      .getRawMany<{ dept_code: string; dept_name: string }>();

    const activeMap = new Map<string, string>();
    for (const row of activeDeptsRaw) {
      const code = (row.dept_code ?? '').trim();
      if (code) activeMap.set(code, (row.dept_name ?? '').trim() || code);
    }

    // 各部門處長：jfun_nm='處長' 且在職、同部門取最早入職者（BR-14）
    // 排序：dept_code → hire_date IS NULL 排後 → hire_date ASC（跨 PG/SQLite 相容）
    const directorRows = await this.emphireRepo
      .createQueryBuilder('e')
      .select('TRIM(e.dept_code)', 'dept_code')
      .addSelect('TRIM(e.emp_nm)', 'emp_nm')
      .where('e.resign_date IS NULL')
      .andWhere(`TRIM(e.jfun_nm) = '處長'`)
      .orderBy('TRIM(e.dept_code)', 'ASC')
      .addOrderBy('CASE WHEN e.hire_date IS NULL THEN 1 ELSE 0 END', 'ASC')
      .addOrderBy('e.hire_date', 'ASC')
      .getRawMany<{ dept_code: string; emp_nm: string }>();
    const directorMap = new Map<string, string>();
    for (const row of directorRows) {
      const code = row.dept_code;
      if (code && !directorMap.has(code)) {
        directorMap.set(code, row.emp_nm || '');
      }
    }

    // 既有 RATION
    const existing = await this.deptPctRepo.find({
      where: { project_workym: list.project_workym ?? '', list_no: listNo },
    });

    const existingMap = new Map<string, ObDeptPct>();
    for (const e of existing) existingMap.set(e.obdeptid.trim(), e);

    const allDeptIds = new Set<string>([...activeMap.keys(), ...existingMap.keys()]);
    const deptRatios = Array.from(allDeptIds)
      .sort()
      .map((code) => {
        const existingRow = existingMap.get(code);
        const isActive = activeMap.has(code);
        return {
          obdeptId: code,
          obdeptNm: existingRow?.obdeptnm?.trim() ?? activeMap.get(code) ?? code,
          ration: existingRow ? Number(existingRow.ration) : 0,
          isActive,
          directorName: directorMap.get(code) ?? null,
        };
      });

    const total = deptRatios.reduce((acc, d) => acc + d.ration, 0);

    return {
      listNo,
      listNm: list.list_nm,
      projectWorkym: list.project_workym ?? '',
      stage: list.stage,
      deptRatios,
      total: Math.round(total * 100) / 100,
      isReadOnly: list.stage !== 'dept_ratio' || list.status !== 'active',
    };
  }

  /**
   * PUT /api/v1/assignment/ratios/dept/{listNo}
   *
   * 流程：
   *   1) runGuard.assertNoRunningRun()
   *   2) findListOrThrow + 歷史月份檢查（403 LIST_HISTORICAL_READONLY）
   *   3) status='active' 檢查（422 ASSIGNMENT_LIST_INACTIVE）
   *   4) stageTransition.assertStageEquals(listNo, 'dept_ratio')
   *   5) ratioValidation.assertEachInRange + assertSumEquals100
   *   6) Tx：DELETE 既有 + INSERT 新 + audit
   */
  async setDeptRatios(
    listNo: string,
    dto: SetDeptRatioDto,
    actor: { userId: string; ipAddress: string | null },
    currentWorkYm: string,
  ): Promise<{ listNo: string; savedCount: number; total: number; savedAt: Date; savedBy: string }> {
    await this.runGuard.assertNoRunningRun();

    const list = await this.findListOrThrow(listNo);
    this.assertNotHistorical(list.project_workym, currentWorkYm);
    this.assertListActive(list);

    await this.stageTransition.assertStageEquals(listNo, 'dept_ratio');

    const ratios = dto.deptRatios.map((r) => Number(r.ration));
    this.ratioValidation.assertEachInRange(ratios);
    this.ratioValidation.assertSumEquals100(ratios);

    const projectWorkym = list.project_workym ?? currentWorkYm;
    const savedAt = new Date();

    // 取 before 快照供 audit
    const beforeRows = await this.deptPctRepo.find({
      where: { project_workym: projectWorkym, list_no: listNo },
    });

    await this.dataSource.transaction(async (mgr) => {
      await mgr.delete(ObDeptPct, { project_workym: projectWorkym, list_no: listNo });
      for (const r of dto.deptRatios) {
        await mgr.insert(ObDeptPct, {
          project_workym: projectWorkym,
          list_no: listNo,
          obdeptid: r.obdeptId,
          obdeptnm: r.obdeptNm,
          ration: String(r.ration) as unknown as string,
          created_by_prog: 'CDMP-F079',
          created_by: actor.userId,
          created_at: savedAt,
          updated_by_prog: 'CDMP-F079',
          updated_by: actor.userId,
          updated_at: savedAt,
        } as Partial<ObDeptPct>);
      }

      // audit（BR-10：失敗僅 Logger）
      try {
        await mgr.insert(AssignmentAuditLog, {
          entity_type: 'ob_dept_pct',
          entity_id: listNo,
          action: 'UPDATE', // SET_DEPT_RATIO 對應 entity action union 中的 UPDATE
          actor_id: actor.userId,
          actor_name: actor.userId,
          before_value: { deptRatios: beforeRows.map((r) => ({ obdeptId: r.obdeptid, ration: Number(r.ration) })) },
          after_value: { deptRatios: dto.deptRatios, projectWorkym },
          ip_address: actor.ipAddress,
        } as any);
      } catch (err) {
        this.logger.error(`SET_DEPT_RATIO audit log 寫入失敗 (listNo=${listNo}): ${(err as Error).message}`);
      }
    });

    const total = ratios.reduce((acc, v) => acc + v, 0);
    return {
      listNo,
      savedCount: dto.deptRatios.length,
      total: Math.round(total * 100) / 100,
      savedAt,
      savedBy: actor.userId,
    };
  }

  // --- 共用 helpers ---

  private async findListOrThrow(listNo: string): Promise<ObListDefinition> {
    const list = await this.listRepo.findOne({ where: { list_no: listNo } });
    if (!list) {
      throw new NotFoundException({
        error: ERROR_CODES.ASSIGNMENT_LIST_NOT_FOUND,
        message: ERROR_MESSAGES.ASSIGNMENT_LIST_NOT_FOUND,
      });
    }
    return list;
  }

  private assertNotHistorical(projectWorkym: string | null, currentWorkYm: string): void {
    if (projectWorkym && projectWorkym < currentWorkYm) {
      throw new ForbiddenException({
        error: ERROR_CODES.LIST_HISTORICAL_READONLY,
        message: ERROR_MESSAGES.LIST_HISTORICAL_READONLY,
      });
    }
  }

  private assertListActive(list: ObListDefinition): void {
    if (list.status !== 'active') {
      throw new UnprocessableEntityException({
        error: ERROR_CODES.ASSIGNMENT_LIST_INACTIVE,
        message: ERROR_MESSAGES.ASSIGNMENT_LIST_INACTIVE,
      });
    }
  }
}
