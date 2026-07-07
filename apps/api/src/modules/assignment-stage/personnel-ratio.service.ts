import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull, Not, Repository } from 'typeorm';
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
import { SectionChiefScopeService } from '@/modules/assignment/services/section-chief-scope.service';
import { ERROR_CODES, ERROR_MESSAGES } from '@/common/errors/error-codes';
import {
  activeEmphireCondition,
  isEmphireActive,
  todayYmd,
} from '@/common/emphire/emphire-active.util';
import type { SetPersonnelRatioDto, AppliedTemplateDto } from './dto/set-personnel-ratio.dto';
import {
  acquireAutoAdvanceLock,
  assertMssqlLockPrecondition,
  resolveLockDbKind,
} from './auto-advance-lock.util';

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
    private readonly scopeService: SectionChiefScopeService,
  ) {}

  /**
   * GET /api/v1/assignment/ratios/personnel/{listNo}
   *
   * 處長視角：scopeByCreator helper 在 service 層統一 filter（v1.3 決議 #4）。
   *
   * opts.excludeResigned=true（個別比例設定頁用）：employees[] 只回在職員工，
   *   離職者不列出（離職無法設定比例、顯示無意義）。activeCount / allResigned /
   *   deptSum / sumValidated 不受影響（本就以在職為分母）。預設 false 以保留
   *   完成彙總頁（ready-summary）「顯示離職＋X 位離職不計」之既有行為。
   */
  async getPersonnelRatios(
    listNo: string,
    deptCodeQuery: string | null,
    actor: ActorUser,
    opts: { excludeResigned?: boolean } = {},
  ): Promise<Record<string, unknown>> {
    const list = await this.findListOrThrow(listNo);
    const sysDate = todayYmd();

    const isSectionChief = this.isSectionChiefOnly(actor);
    // 處長視角下，先反查其轄區 dept_code（spec F082 BR-3 修訂；email 對 ob_emphire.email
    // + jfun_nm='處長' + 在職）。對應不到 → null（後端視同無轄區回空清單）。
    const sectionChiefScope: string | null = isSectionChief
      ? await this.scopeService.getScopeDeptCode(actor.userId)
      : null;

    // 員工清單來源：ob_emphire 全部（不過濾 resign_date；BR-6）
    const emphireRows = await this.emphireRepo
      .createQueryBuilder('e')
      .select(['e.emp_id', 'e.emp_nm', 'e.dept_code', 'e.dept_name', 'e.resign_date'])
      .orderBy('e.dept_code', 'ASC')
      // 在職者排前（對齊 legacy 在職語意；勿用 `resign_date IS NULL`）
      .addOrderBy(`CASE WHEN ${activeEmphireCondition('e')} THEN 0 ELSE 1 END`, 'ASC')
      .addOrderBy('e.emp_id', 'ASC')
      .setParameter('sysDate', sysDate)
      .getMany();

    // 各部門處長（沿用 F079 BR-14 定義；jfun_nm='處長' + hire_date ASC 取最早入職者）
    const directorRows = await this.emphireRepo
      .createQueryBuilder('e')
      .select('TRIM(e.dept_code)', 'dept_code')
      .addSelect('TRIM(e.emp_nm)', 'emp_nm')
      .where(activeEmphireCondition('e'), { sysDate })
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

    // 既有 ob_empl_set。處長視角不再用 created_by 過濾（chicken-and-egg），
    // 改為依 sectionChiefScope 過濾 deptid_m（spec F082 BR-3 修訂）。
    let emplSetQb = this.emplSetRepo
      .createQueryBuilder('s')
      .where('s.list_no = :listNo', { listNo });
    if (isSectionChief && sectionChiefScope) {
      emplSetQb = emplSetQb.andWhere('TRIM(s.deptid_m) = :scope', { scope: sectionChiefScope });
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

    // 處長視角：只回 sectionChiefScope 對應的部門（spec F082 BR-3 修訂）。
    // sectionChiefScope 為 null 時（email 對不上 ob_emphire 任何在職處長），回空清單。
    let visibleDeptCodes: string[] = Array.from(empByDept.keys());
    if (isSectionChief) {
      visibleDeptCodes = sectionChiefScope ? visibleDeptCodes.filter((c) => c === sectionChiefScope) : [];
    }
    if (targetDeptCodes) {
      visibleDeptCodes = visibleDeptCodes.filter((c) => targetDeptCodes!.includes(c));
    }
    // 只回 deptRatio > 0 的部門（spec F082 v1.6 / 2026-05-25）：
    //   - deptRatio = null（ob_dept_pct 沒紀錄）→ 隱藏
    //   - deptRatio = 0（部長刻意排除本月）→ 隱藏
    //   - deptRatio > 0 → 顯示供設定個別比例
    // 處長視角下若自己唯一轄區 deptRatio = 0/null，會回 departments=[]，
    // FE 顯示「本部門本月無配額」no-scope banner。
    visibleDeptCodes = visibleDeptCodes.filter((c) => {
      const pct = deptPctMap.get(c);
      return pct != null && Number(pct.ration) > 0;
    });

    const departments = visibleDeptCodes.map((code) => {
      const emps = empByDept.get(code) ?? [];
      const setRows = emplSetByDept.get(code) ?? [];
      const setMap = new Map<string, ObEmplSet>();
      for (const r of setRows) setMap.set(r.emplid.trim(), r);

      const activeEmps = emps.filter((e) => isEmphireActive(e.resign_date, sysDate));
      const activeCount = activeEmps.length;

      // excludeResigned：設定頁只列在職員工（離職無法設比例）；預設保留全部供彙總頁顯示。
      const listedEmps = opts.excludeResigned ? activeEmps : emps;
      const employees = listedEmps.map((e) => {
        const row = setMap.get(e.emp_id.trim());
        return {
          empId: e.emp_id.trim(),
          empName: (e.emp_nm ?? '').trim() || e.emp_id.trim(),
          ration: row ? Number(row.ration) : null,
          createdBy: row?.created_by ?? null,
          isResigned: !isEmphireActive(e.resign_date, sysDate),
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
        directorName: directorMap.get(code) ?? null,
        // 處長視角下 isInScope = (code === sectionChiefScope)；部長/Admin 永遠 true
        isInScope: isSectionChief ? code === sectionChiefScope : true,
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
    autoAdvanced: boolean;
    newStage: string | null;
    autoAdvanceFailReason?: string | null;
  }> {
    await this.runGuard.assertNoRunningRun();

    const list = await this.findListOrThrow(listNo);
    const sysDate = todayYmd();
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

    const activeCount = emphireRows.filter((e) => isEmphireActive(e.resign_date, sysDate)).length;

    // 處長轄區檢查（spec F082 BR-3 修訂）：
    // 改為依 users.email <-> ob_emphire.email + jfun_nm='處長' 反查 dept_code。
    // dto.deptCode 必須等於 scope，否則攔截。
    if (this.isSectionChiefOnly(actor)) {
      const scope = await this.scopeService.getScopeDeptCode(actor.userId);
      if (!scope || scope !== dto.deptCode.trim()) {
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
      } else if (!isEmphireActive(row.resign_date, sysDate)) {
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

    // ── auto-advance 結果（F084 v2.0）──────────────────────────────────────
    // 預設未推進；於 tx 內依偵測結果覆寫。
    let autoAdvanced = false;
    let newStage: string | null = null;
    let autoAdvanceFailReason: string | null = null;

    await this.dataSource.transaction(async (mgr) => {
      // [1] DELETE + [2] INSERT ob_empl_set（覆寫式）
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

      // [3] INSERT 個別比例稽核（SET_PERSONNEL_RATIO；沿用既有 action='UPDATE'，不擴 enum）
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

      // [4] auto-advance 偵測 + 推進（Option B：寫入 [1]~[3] 已於 lock 前完成）
      //     由 ENABLE_E07_AUTO_ADVANCE_TO_APPROVAL flag gate（prod 預設 off）。
      if (!this.isAutoAdvanceEnabled()) {
        return;
      }

      const result = await this.tryAutoAdvance(listNo, list.stage, actor, mgr);
      autoAdvanced = result.autoAdvanced;
      newStage = result.newStage;
      autoAdvanceFailReason = result.autoAdvanceFailReason;
    });

    const deptSum = ratios.reduce((acc, v) => acc + v, 0);
    return {
      listNo,
      deptCode: dto.deptCode,
      savedCount: dto.employees.length,
      deptSum: Math.round(deptSum * 100) / 100,
      savedAt,
      savedBy: actor.userId,
      autoAdvanced,
      newStage,
      autoAdvanceFailReason,
    };
  }

  /**
   * F084 v2.0 auto-advance 偵測 + 推進（於 setPersonnelRatios tx 內呼叫；AD-E07-19 §19.3.3 [4]）。
   *
   * 步驟：
   *   [4a] 取得 blocking lock（AD-E07-38 P1c 跨 driver 三分支，auto-advance-lock.util）；
   *        - postgres：advisory lock + lock_timeout=5000ms；55P03 逾時 → 降級 no-op
   *        - mssql   ：sp_getapplock @LockOwner='Transaction'；回傳碼 -1 逾時 → 降級 no-op、其餘錯誤碼 rethrow
   *        - other（sqlite 測試 infra）：跳過鎖，直接做偵測+推進
   *        逾時降級皆：catch 不 rethrow、autoAdvanced=false、不帶 failReason、tx 照常 commit（[1]~[3] 寫入保留）
   *   [4b] tx 內月跑 guard（runGuard.isRunning() 回 boolean）→ true 則 autoAdvanced=false +
   *        autoAdvanceFailReason='ASSIGNMENT_RUN_ALREADY_RUNNING'、跳過後續（PUT 仍 200，不 rollback）
   *   [4c] assertAllDeptsSumEquals100WithMgr（讀 tx 內 [1]~[3] 剛寫入的 ob_empl_set）；
   *        未完成 → 拋 422，由本方法 catch 轉為 autoAdvanced=false（不帶 failReason）
   *   [4d] 取得 lock 後重新偵測 stage 仍為 personnel_ratio（idempotent guard）→ advanceToInMgr 推進
   *        → autoAdvanced=true、newStage='approval'
   *
   * @returns auto-advance 結果（autoAdvanced / newStage / autoAdvanceFailReason）
   */
  private async tryAutoAdvance(
    listNo: string,
    currentStage: string,
    actor: ActorUser,
    mgr: EntityManager,
  ): Promise<{ autoAdvanced: boolean; newStage: string | null; autoAdvanceFailReason: string | null }> {
    const noAdvance = { autoAdvanced: false, newStage: null, autoAdvanceFailReason: null as string | null };

    // 進 tx 時 stage 已非 personnel_ratio（理論上 assertStageEquals 已擋；防禦性）→ 不推進
    if (currentStage !== 'personnel_ratio') {
      return noAdvance;
    }

    // [4a] blocking lock（AD-E07-38 P1c 跨 driver 三分支：pg advisory / mssql sp_getapplock / sqlite no-op）
    //   - postgres：pg_advisory_xact_lock + lock_timeout；55P03 → 降級 no-op
    //   - mssql   ：sp_getapplock @LockOwner='Transaction'；回傳碼 -1 → 降級 no-op；-2/-3/-999 → rethrow
    //   - other   ：sqlite 測試 infra 無此鎖原語 → 跳過（直接偵測+推進）
    //   逾時（pg 55P03 / mssql -1）皆：不 rethrow、降級 no-op、不帶 failReason、tx 照常 commit（寫入保留）。
    const lockKind = resolveLockDbKind(process.env.DB_TYPE);
    if (lockKind === 'mssql') {
      // I-MSSQL-LOCK-01（LOCK-010）：mssql lock 前置條件——須在顯式交易內。
      assertMssqlLockPrecondition(mgr);
    }
    const lockOutcome = await acquireAutoAdvanceLock(mgr, lockKind, listNo);
    if (lockOutcome === 'timeout') {
      this.logger.warn(`auto-advance lock 等待逾時，listNo=${listNo}，降級 no-op`);
      return noAdvance;
    }

    // [4b] tx 內月跑 guard（輕量版，回 boolean）
    if (await this.runGuard.isRunning()) {
      this.logger.log(`auto-advance 偵測到月跑進行中，listNo=${listNo}，跳過推進（PUT 仍 200）`);
      return {
        autoAdvanced: false,
        newStage: null,
        autoAdvanceFailReason: ERROR_CODES.ASSIGNMENT_RUN_ALREADY_RUNNING,
      };
    }

    // [4c] 完成度偵測（讀 tx 內未 commit 寫入）；未完成 → 不推進、不帶 failReason
    try {
      await this.personnelRatioValidation.assertAllDeptsSumEquals100WithMgr(listNo, mgr);
    } catch (err) {
      if (err instanceof UnprocessableEntityException) {
        return noAdvance;
      }
      throw err;
    }

    // [4d] idempotent advance：透過 advanceToInMgr 走同一 tx 推進 + 稽核
    //      advanceToInMgr 內部 assertStageEquals 再次確認 stage 仍為 personnel_ratio；
    //      若先到者已推進（stage='approval'）→ 拋 422 → catch 轉為 idempotent no-op（不帶 failReason）
    try {
      await this.stageTransition.advanceToInMgr(
        listNo,
        'personnel_ratio',
        'approval',
        actor.userId,
        mgr,
        {
          auto_advanced_by_completion: true,
          operator_role: this.resolveOperatorRole(actor),
        },
      );
    } catch (err) {
      if (err instanceof UnprocessableEntityException) {
        // idempotent no-op：stage 已被先到請求推進
        return noAdvance;
      }
      throw err;
    }

    return { autoAdvanced: true, newStage: 'approval', autoAdvanceFailReason: null };
  }

  /**
   * operator_role 推導（AD-E07-19 §19.4）：
   *   actor.role === 'admin' ? 'admin' : (actor.businessRole ?? 'section_chief')
   *
   * 注意 admin 優先（businessRole=null 時不 fallback 至 section_chief）。
   */
  private resolveOperatorRole(actor: ActorUser): string {
    return actor.role === 'admin' ? 'admin' : (actor.businessRole ?? 'section_chief');
  }

  /** ENABLE_E07_AUTO_ADVANCE_TO_APPROVAL flag（prod 預設 off；沿用 feature-flag 環境變數機制）。 */
  private isAutoAdvanceEnabled(): boolean {
    return (process.env.ENABLE_E07_AUTO_ADVANCE_TO_APPROVAL ?? '').toLowerCase() === 'true';
  }

  /**
   * F083 §5.2 後端二次校驗：依 template 重算結果，與 request payload 比對。
   * 偏差超過容忍誤差 → 422 BONUS_PENALTY_TEMPLATE_INVALID。
   */
  /**
   * F083 v1.4 弱化校驗（2026-05-21 / 用戶決議）：
   *
   * 變更理由：原 v1.3 校驗假設 `ration = (100/N) + delta`（prototype 模型），
   * 但前端 v1.5 改用 baseline + per-employee templates 模型，baseline 可為
   * 任何值（均等分配 round 後 / 手動編輯 / 之前儲存的值），不再固定 100/N。
   * 後端無法獨立復現前端 baseline，因此「精確公式比對」失去意義。
   *
   * 弱化後校驗範圍：
   *   1. targetEmpId 必須存在於 employees[]（防 typo）
   *   2. 部門員工數 ≥ 2（單員工模板無意義）
   *   3. 其他驗證沿用 service 既有：每筆 ration ∈ [0,100]（assertEachInRange）、
   *      per-DEPT 加總 = 100%（assertDeptSumEquals100）— 由 setPersonnelRatios
   *      流程之 BR-13 / BR-2 處理
   *
   * appliedTemplate 仍寫入 assignment_audit_log.after_value 供 audit 追溯
   * 「此次寫入是由 +N% 模板觸發」之語意，不再用於攔截。
   */
  private validateAppliedTemplate(
    template: AppliedTemplateDto,
    employees: Array<{ empId: string; ration: number }>,
  ): void {
    if (employees.length <= 1) {
      throw new UnprocessableEntityException({
        error: ERROR_CODES.BONUS_PENALTY_TEMPLATE_INVALID,
        message: '部門僅 1 位業務員，無法套用相對調整模板',
        details: [{ template: template.template, reason: 'single-employee' }],
      });
    }
    const targetExists = employees.some((e) => e.empId === template.targetEmpId);
    if (!targetExists) {
      throw new UnprocessableEntityException({
        error: ERROR_CODES.BONUS_PENALTY_TEMPLATE_INVALID,
        message: 'appliedTemplate.targetEmpId 不存在於 employees[]',
        details: [{ template: template.template, targetEmpId: template.targetEmpId }],
      });
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
