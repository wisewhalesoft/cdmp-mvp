import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Not, Repository } from 'typeorm';
import { ObListDefinition } from '@/database/entities/ob-list-definition.entity';
import { ObDeptPct } from '@/database/entities/ob-dept-pct.entity';
import { ObEmplSet } from '@/database/entities/ob-empl-set.entity';
import { ObEmphire } from '@/database/entities/ob-emphire.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';
import { AssignmentApproval } from '@/database/entities/assignment-approval.entity';
import { RatioValidationService } from '@/modules/assignment/services/ratio-validation.service';
import { PersonnelRatioValidationService } from '@/modules/assignment/services/personnel-ratio-validation.service';
import { StageTransitionService } from '@/modules/assignment/services/stage-transition.service';
import { AssignmentRunGuardService } from '@/modules/assignment/services/assignment-run-guard.service';
import { ERROR_CODES, ERROR_MESSAGES } from '@/common/errors/error-codes';
import type { SetPersonnelRatioDto, AppliedTemplateDto } from './dto/set-personnel-ratio.dto';

interface ActorUser {
  userId: string;
  role: string;
  businessRole?: string | null;
  ipAddress: string | null;
}

/**
 * F082 v1.4 + F083 v1.3 — 個別業務比例設定 Service（per-LIST_NO + per-DEPT）
 *
 * 對應 spec：F082 §5.1 GET / §5.2 PUT、F083 §5.2 後端二次校驗
 *
 * 角色 × 行為：
 *   - admin / director：bypass 轄區（可跨任意部門讀寫）
 *   - section_chief：service 層 `scopeByCreator()` filter（GET）；PUT 嚴格檢查 deptCode + empId 屬於轄區
 *
 * 全員離職分支：當部門 active=0 時 PersonnelRatioValidationService 短路放行（v1.3 決議 #1）。
 */
@Injectable()
export class PersonnelRatioService {
  private readonly logger = new Logger(PersonnelRatioService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(ObListDefinition)
    private readonly listRepo: Repository<ObListDefinition>,
    @InjectRepository(ObDeptPct)
    private readonly deptPctRepo: Repository<ObDeptPct>,
    @InjectRepository(ObEmplSet)
    private readonly emplSetRepo: Repository<ObEmplSet>,
    @InjectRepository(ObEmphire)
    private readonly emphireRepo: Repository<ObEmphire>,
    @InjectRepository(AssignmentApproval)
    private readonly approvalRepo: Repository<AssignmentApproval>,
    private readonly ratioValidation: RatioValidationService,
    private readonly personnelRatioValidation: PersonnelRatioValidationService,
    private readonly stageTransition: StageTransitionService,
    private readonly runGuard: AssignmentRunGuardService,
  ) {}

  /**
   * GET /api/v1/assignment/ratios/personnel/{listNo}
   *
   * 處長視角：scopeByCreator helper 在 service 層統一 filter（v1.3 決議 #4）。
   */
  async getPersonnelRatios(
    listNo: string,
    deptCodeQuery: string | null,
    actor: ActorUser,
  ): Promise<Record<string, unknown>> {
    const list = await this.findListOrThrow(listNo);

    const isSectionChief = this.isSectionChiefOnly(actor);

    // 員工清單來源：ob_emphire 全部（不過濾 resign_date；BR-6）
    const emphireRows = await this.emphireRepo
      .createQueryBuilder('e')
      .select(['e.emp_id', 'e.emp_nm', 'e.dept_code', 'e.dept_name', 'e.resign_date'])
      .orderBy('e.dept_code', 'ASC')
      .addOrderBy('CASE WHEN e.resign_date IS NULL THEN 0 ELSE 1 END', 'ASC')
      .addOrderBy('e.emp_id', 'ASC')
      .getMany();

    // 既有 ob_empl_set
    let emplSetQb = this.emplSetRepo
      .createQueryBuilder('s')
      .where('s.list_no = :listNo', { listNo });
    // 處長：scopeByCreator (BR-3 / v1.3 決議 #4)
    if (isSectionChief) {
      emplSetQb = emplSetQb.andWhere('s.created_by = :uid', { uid: actor.userId });
    }
    const emplSetRows = await emplSetQb.getMany();

    const emplSetByDept = new Map<string, ObEmplSet[]>();
    for (const r of emplSetRows) {
      const key = (r.deptid_m ?? '').trim();
      const arr = emplSetByDept.get(key) ?? [];
      arr.push(r);
      emplSetByDept.set(key, arr);
    }

    // 部門配額表
    const deptPctRows = await this.deptPctRepo.find({
      where: { project_workym: list.project_workym ?? '', list_no: listNo },
    });
    const deptPctMap = new Map<string, ObDeptPct>();
    for (const d of deptPctRows) deptPctMap.set(d.obdeptid.trim(), d);

    // 依 query deptCode 過濾（部長 / Admin 可帶；處長忽略，始終回自己轄區）
    let targetDeptCodes: string[] | null = null;
    if (deptCodeQuery && !isSectionChief) {
      targetDeptCodes = [deptCodeQuery];
    }

    // group emphire by dept
    const empByDept = new Map<string, ObEmphire[]>();
    for (const e of emphireRows) {
      const code = (e.dept_code ?? '').trim();
      if (!code) continue;
      const arr = empByDept.get(code) ?? [];
      arr.push(e);
      empByDept.set(code, arr);
    }

    // 處長視角：只回包含自己 created_by 之部門
    let visibleDeptCodes: string[] = Array.from(empByDept.keys());
    if (isSectionChief) {
      const inScope = new Set<string>();
      for (const r of emplSetRows) inScope.add(r.deptid_m.trim());
      visibleDeptCodes = visibleDeptCodes.filter((c) => inScope.has(c));
    }
    if (targetDeptCodes) {
      visibleDeptCodes = visibleDeptCodes.filter((c) => targetDeptCodes!.includes(c));
    }

    const departments = visibleDeptCodes.map((code) => {
      const emps = empByDept.get(code) ?? [];
      const setRows = emplSetByDept.get(code) ?? [];
      const setMap = new Map<string, ObEmplSet>();
      for (const r of setRows) setMap.set(r.emplid.trim(), r);

      const activeEmps = emps.filter((e) => e.resign_date == null);
      const activeCount = activeEmps.length;

      const employees = emps.map((e) => {
        const row = setMap.get(e.emp_id.trim());
        return {
          empId: e.emp_id.trim(),
          empName: (e.emp_nm ?? '').trim() || e.emp_id.trim(),
          ration: row ? Number(row.ration) : null,
          createdBy: row?.created_by ?? null,
          isResigned: e.resign_date != null,
        };
      });

      const deptSum = employees
        .filter((emp) => !emp.isResigned && emp.ration != null)
        .reduce((acc, emp) => acc + Number(emp.ration ?? 0), 0);

      const allResigned = activeCount === 0;
      const sumValidated = allResigned ? false : Math.abs(deptSum - 100) <= 0.01;

      const deptPct = deptPctMap.get(code);
      return {
        deptCode: code,
        deptName: (deptPct?.obdeptnm?.trim() ?? emps[0]?.dept_name?.trim() ?? code),
        deptRatio: deptPct ? Number(deptPct.ration) : null,
        isInScope: isSectionChief ? setRows.length > 0 : true,
        activeCount,
        sumValidated,
        allResigned,
        employees,
        deptSum: Math.round(deptSum * 100) / 100,
      };
    });

    const viewerRole = actor.role === 'admin' || actor.businessRole === 'director'
      ? actor.role === 'admin' ? 'admin' : 'director'
      : 'section_chief';

    // F087 v1.1 BR-11：查最新一筆 assignment_approval
    // 邏輯：取該 listNo 最新 approved_at 紀錄；若為 reject 回傳，approve 則為 null
    const latestRejection = await this.findLatestRejection(listNo);

    return {
      listNo,
      listNm: list.list_nm,
      projectWorkym: list.project_workym ?? '',
      stage: list.stage,
      isReadOnly: list.stage !== 'personnel_ratio' || list.status !== 'active',
      viewerRole,
      departments,
      latestRejection,
    };
  }

  /**
   * F087 v1.1 BR-11：取最新一筆 approval；若 action='reject' 回傳；'approve' / 無紀錄 → null
   */
  private async findLatestRejection(listNo: string): Promise<{
    rejectReason: string;
    rejectorId: string;
    rejectorName: string | null;
    rejectorRole: string | null;
    rejectedAt: Date;
  } | null> {
    const latest = await this.approvalRepo
      .createQueryBuilder('a')
      .where('a.list_no = :listNo', { listNo })
      .orderBy('a.approved_at', 'DESC')
      .addOrderBy('a.created_at', 'DESC')
      .limit(1)
      .getOne();
    if (!latest || latest.action !== 'reject') return null;
    return {
      rejectReason: latest.reject_reason ?? '',
      rejectorId: latest.approver_id,
      rejectorName: latest.approver_name,
      rejectorRole: latest.approver_role,
      rejectedAt: latest.approved_at,
    };
  }

  /**
   * PUT /api/v1/assignment/ratios/personnel/{listNo}
   *
   * 流程（spec §5.2）：
   *   1) runGuard.assertNoRunningRun()
   *   2) findListOrThrow + 歷史月份 + status 檢查
   *   3) stageTransition.assertStageEquals(listNo, 'personnel_ratio')
   *   4) ob_dept_pct 該部門存在 (PERSONNEL_RATIO_DEPT_NOT_FOUND)
   *   5) section_chief 轄區檢查（deptCode + empId）→ 403 PERSONNEL_RATIO_OUT_OF_SCOPE
   *   6) employees 中含離職員工 → 422 RATIO_OUT_OF_RANGE (details.resignedEmpIds)
   *   7) ratioValidation.assertEachInRange + PersonnelRatioValidationService.assertDeptSumEquals100
   *   8) F083 appliedTemplate 二次校驗
   *   9) Tx: DELETE (list_no, deptid_m) → INSERT → audit
   */
  async setPersonnelRatios(
    listNo: string,
    dto: SetPersonnelRatioDto,
    actor: ActorUser,
    currentWorkYm: string,
  ): Promise<{
    listNo: string;
    deptCode: string;
    savedCount: number;
    deptSum: number;
    savedAt: Date;
    savedBy: string;
  }> {
    await this.runGuard.assertNoRunningRun();

    const list = await this.findListOrThrow(listNo);
    this.assertNotHistorical(list.project_workym, currentWorkYm);
    this.assertListActive(list);
    await this.stageTransition.assertStageEquals(listNo, 'personnel_ratio');

    // 部門存在於 ob_dept_pct
    const deptPct = await this.deptPctRepo.findOne({
      where: {
        project_workym: list.project_workym ?? '',
        list_no: listNo,
        obdeptid: dto.deptCode,
      },
    });
    if (!deptPct) {
      throw new UnprocessableEntityException({
        error: ERROR_CODES.PERSONNEL_RATIO_DEPT_NOT_FOUND,
        message: `部門 ${dto.deptCode} 尚未於部門比例設定階段配置，無法設定個別業務比例`,
      });
    }

    // 員工資料 + active count
    const emphireRows = await this.emphireRepo.find({
      where: { dept_code: dto.deptCode },
    });
    const empMap = new Map<string, ObEmphire>();
    for (const e of emphireRows) empMap.set(e.emp_id.trim(), e);

    const activeCount = emphireRows.filter((e) => e.resign_date == null).length;

    // 處長轄區檢查（v1.3 BR-14）
    if (this.isSectionChiefOnly(actor)) {
      // deptCode 屬於處長：要求 ob_empl_set 該 dept 中至少 1 筆 created_by = actor.userId
      // 首次設定時無紀錄，採寬鬆策略：仍允許處長寫入該 dept（後續以 created_by 鎖定）。
      // 但若 dept 既有紀錄全屬他人，且處長嘗試寫，則攔截。
      const existing = await this.emplSetRepo.find({
        where: { list_no: listNo, deptid_m: dto.deptCode },
      });
      const hasMine = existing.some((r) => r.created_by === actor.userId);
      const hasOthers = existing.some((r) => r.created_by !== actor.userId && r.created_by != null);
      if (hasOthers && !hasMine) {
        throw new ForbiddenException({
          error: ERROR_CODES.PERSONNEL_RATIO_OUT_OF_SCOPE,
          message: ERROR_MESSAGES.PERSONNEL_RATIO_OUT_OF_SCOPE,
        });
      }
    }

    // 員工有效性檢查（BR-13）：不可含離職員工 / 不在 ob_emphire
    const invalidEmpIds: string[] = [];
    const resignedEmpIds: string[] = [];
    for (const e of dto.employees) {
      const row = empMap.get(e.empId);
      if (!row) {
        invalidEmpIds.push(e.empId);
      } else if (row.resign_date != null) {
        resignedEmpIds.push(e.empId);
      }
    }
    if (invalidEmpIds.length > 0 || resignedEmpIds.length > 0) {
      throw new UnprocessableEntityException({
        error: ERROR_CODES.RATIO_OUT_OF_RANGE,
        message: '員工不存在或已離職',
        details: [{ deptCode: dto.deptCode, invalidEmpIds, resignedEmpIds }],
      });
    }

    // 數值範圍
    const ratios = dto.employees.map((e) => Number(e.ration));
    this.ratioValidation.assertEachInRange(ratios);

    // per-DEPT 加總 100% （全員離職分支短路 by service）
    this.personnelRatioValidation.assertDeptSumEquals100(dto.deptCode, ratios, activeCount);

    // F083 後端二次校驗
    if (dto.appliedTemplate) {
      this.validateAppliedTemplate(dto.appliedTemplate, dto.employees);
    }

    // 覆寫式寫入 + audit
    const savedAt = new Date();
    const beforeRows = await this.emplSetRepo.find({
      where: { list_no: listNo, deptid_m: dto.deptCode },
    });

    await this.dataSource.transaction(async (mgr) => {
      await mgr.delete(ObEmplSet, { list_no: listNo, deptid_m: dto.deptCode });
      for (const e of dto.employees) {
        await mgr.insert(ObEmplSet, {
          list_no: listNo,
          deptid_m: dto.deptCode,
          emplid: e.empId,
          ration: String(e.ration) as unknown as string,
          prod_type: null,
          created_by_prog: 'CDMP-F082',
          created_by: actor.userId,
          created_at: savedAt,
          updated_by_prog: 'CDMP-F082',
          updated_by: actor.userId,
          updated_at: savedAt,
        } as Partial<ObEmplSet>);
      }

      try {
        await mgr.insert(AssignmentAuditLog, {
          entity_type: 'ob_empl_set',
          entity_id: listNo,
          action: 'UPDATE', // SET_PERSONNEL_RATIO
          actor_id: actor.userId,
          actor_name: actor.userId,
          before_value: { deptCode: dto.deptCode, employees: beforeRows.map((r) => ({ empId: r.emplid, ration: Number(r.ration) })) },
          after_value: { deptCode: dto.deptCode, employees: dto.employees, appliedTemplate: dto.appliedTemplate ?? null },
          ip_address: actor.ipAddress,
        } as any);
      } catch (err) {
        this.logger.error(`SET_PERSONNEL_RATIO audit log 寫入失敗 (listNo=${listNo}, dept=${dto.deptCode}): ${(err as Error).message}`);
      }
    });

    const deptSum = ratios.reduce((acc, v) => acc + v, 0);
    return {
      listNo,
      deptCode: dto.deptCode,
      savedCount: dto.employees.length,
      deptSum: Math.round(deptSum * 100) / 100,
      savedAt,
      savedBy: actor.userId,
    };
  }

  /**
   * F083 §5.2 後端二次校驗：依 template 重算結果，與 request payload 比對。
   * 偏差超過容忍誤差 → 422 BONUS_PENALTY_TEMPLATE_INVALID。
   */
  private validateAppliedTemplate(
    template: AppliedTemplateDto,
    employees: Array<{ empId: string; ration: number }>,
  ): void {
    const N = employees.length;
    if (N <= 1) {
      throw new UnprocessableEntityException({
        error: ERROR_CODES.BONUS_PENALTY_TEMPLATE_INVALID,
        message: '部門僅 1 位業務員，無法套用相對調整模板',
        details: [{ template: template.template, reason: 'single-employee' }],
      });
    }
    const defaultRation = 100 / N;
    const delta = parseInt(template.template, 10);
    const targetExpected = defaultRation + delta;
    const remainingExpected = (100 - targetExpected) / (N - 1);

    if (targetExpected < 0 || targetExpected > 100 || remainingExpected < 0 || remainingExpected > 100) {
      throw new UnprocessableEntityException({
        error: ERROR_CODES.BONUS_PENALTY_TEMPLATE_INVALID,
        message: '快速模板計算結果越界',
        details: [{ template: template.template, targetExpected, remainingExpected }],
      });
    }

    for (const e of employees) {
      const expected = e.empId === template.targetEmpId ? targetExpected : remainingExpected;
      if (Math.abs(Number(e.ration) - expected) > 0.02) {
        throw new UnprocessableEntityException({
          error: ERROR_CODES.BONUS_PENALTY_TEMPLATE_INVALID,
          message: '快速模板套用結果與後端二次校驗不符',
          details: [{
            template: template.template,
            targetEmpId: template.targetEmpId,
            empId: e.empId,
            actualRation: Number(e.ration),
            expectedRation: Math.round(expected * 100) / 100,
          }],
        });
      }
    }
  }

  private isSectionChiefOnly(actor: ActorUser): boolean {
    return actor.role !== 'admin'
      && actor.businessRole === 'section_chief';
  }

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
