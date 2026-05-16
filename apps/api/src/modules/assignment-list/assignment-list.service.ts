import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Like, Repository } from 'typeorm';
import { ObListDefinition } from '@/database/entities/ob-list-definition.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';
import { AssignmentRunGuardService } from '@/modules/assignment/services/assignment-run-guard.service';
import { ERROR_CODES, ERROR_MESSAGES } from '@/common/errors/error-codes';
import type { CreateListDto } from './dto/create-list.dto';
import type { UpdateListDto } from './dto/update-list.dto';

/**
 * AssignmentListService — F048 / F050 / F051 / F052 / F077 共用 service
 *
 * 對應 spec：
 *   - F048 v2.0：list（含 lockState）
 *   - F050 v2.0：create（LIST_NO 自動產生 / 999 上限 / PROD_KIND+CARD_TYPE 唯一 / case_status 必填）
 *   - F051 v2.0：update（覆寫式 / 不可動 list_no / case_status 不可清空）
 *   - F052 v2.0：disable（軟刪除 / 重複停用阻擋）
 *   - F077 v1.2：listLists（month switch + stage filter；historical readonly 由 controller 寫入 guard）
 *
 * 所有寫入 method 頂層必呼 `assignmentRunGuard.assertNoRunningRun()`（spec BR / AD-E07 v3.0）。
 */
@Injectable()
export class AssignmentListService {
  private readonly logger = new Logger(AssignmentListService.name);

  constructor(
    @InjectRepository(ObListDefinition)
    private readonly listRepo: Repository<ObListDefinition>,
    @InjectRepository(AssignmentAuditLog)
    private readonly auditRepo: Repository<AssignmentAuditLog>,
    private readonly assignmentRunGuard: AssignmentRunGuardService,
  ) {}

  // -------------------------------------------------------------------------
  // F077 / F048 — List
  // -------------------------------------------------------------------------

  /**
   * F077 v1.2 §5.2 + F048 v2.0 §5.1 列表
   *
   * @returns { lists, lockState, currentWorkYm, selectedYm, isHistorical, isFuture, stageCounts }
   */
  async listLists(opts: {
    ym: string;
    stages?: string[];
    includeDisabled?: boolean;
  }): Promise<{
    selectedYm: string;
    isHistorical: boolean;
    isFuture: boolean;
    lockState: { locked: boolean; reason: string | null };
    lists: Array<Record<string, unknown>>;
    stageCounts: Record<string, number>;
  }> {
    const { ym, stages, includeDisabled } = opts;

    const qb = this.listRepo
      .createQueryBuilder('l')
      .where('l.project_workym = :ym', { ym });

    if (stages && stages.length > 0) {
      qb.andWhere('l.stage IN (:...stages)', { stages });
    }

    if (!includeDisabled) {
      qb.andWhere("l.status = 'active'");
    }

    qb.orderBy('l.list_no', 'ASC');
    const records = await qb.getMany();

    // 月跑鎖：assertNoRunningRun 失敗即視為 locked
    let locked = false;
    try {
      await this.assignmentRunGuard.assertNoRunningRun(ym);
    } catch {
      locked = true;
    }

    const stageCounts: Record<string, number> = {
      draft: 0,
      dept_ratio: 0,
      personnel_ratio: 0,
      approval: 0,
      ready: 0,
      disabled: 0,
    };
    for (const r of records) {
      if (r.status === 'inactive') stageCounts.disabled += 1;
      else if (stageCounts[r.stage] !== undefined) stageCounts[r.stage] += 1;
    }

    return {
      selectedYm: ym,
      isHistorical: false, // controller 計算 currentWorkYm 與此比對後覆寫
      isFuture: false,
      lockState: {
        locked,
        reason: locked ? '分派執行中' : null,
      },
      lists: records.map((r) => ({
        listNo: r.list_no,
        listNm: r.list_nm,
        prodKind: r.prod_kind,
        caseYear: r.caseyear,
        specTp: r.spec_tp,
        listPeriodStart: r.list_period_start,
        listPeriodEnd: r.list_period_end,
        listInterval: r.list_interval,
        settleSrc: r.settle_src,
        cardType: r.card_type,
        prodBest: r.prod_best,
        status: r.status,
        stage: r.stage,
        createdBy: r.created_by,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
      stageCounts,
    };
  }

  // -------------------------------------------------------------------------
  // F050 v2.0 — Create
  // -------------------------------------------------------------------------

  async createList(
    dto: CreateListDto,
    actor: { userId: string; ipAddress: string | null },
    currentWorkYm: string,
  ): Promise<{
    listNo: string;
    listNm: string;
    status: string;
    projectWorkym: string;
  }> {
    // BR / spec AC-6：月跑鎖（最頂層）
    await this.assignmentRunGuard.assertNoRunningRun();

    // E07 重構 P1 B2 補完：歷史月份不可建立（CREATE 永遠寫入 currentWorkYm，故 project_workym = currentWorkYm，但保留防護避免日後 dto 帶 ym 參數時繞過）
    // create 已綁定 project_workym = currentWorkYm，無歷史寫入風險，不需檢查

    // AC-7b / BR-6：case_status 必填（即使 DTO 已擋，保留 service 防護）
    const caseStatusValue = (dto.caseStatus ?? '').trim();
    if (!caseStatusValue) {
      throw new UnprocessableEntityException({
        error: ERROR_CODES.CASE_STATUS_REQUIRED,
        message: ERROR_MESSAGES.CASE_STATUS_REQUIRED,
      });
    }

    // AC-4 / BR-2：PROD_KIND + CARD_TYPE 在當月 active 名單中唯一
    const conflict = await this.findActivePkCardTypeConflict(
      currentWorkYm,
      dto.prodKind,
      dto.cardType ?? null,
    );
    if (conflict) {
      throw new UnprocessableEntityException({
        error: ERROR_CODES.LIST_NO_DUPLICATE,
        message: `${ERROR_MESSAGES.LIST_NO_DUPLICATE}（LIST_NO: ${conflict}）`,
      });
    }

    // AC-2 / AC-3 / BR-1：LIST_NO 自動產生
    const listNo = await this.generateNextListNo(currentWorkYm);

    const now = new Date();
    const entity = this.listRepo.create({
      list_no: listNo,
      list_nm: dto.listNm,
      prod_kind: dto.prodKind,
      prod_best: dto.prodBest ?? '',
      spec_tp: dto.specTp,
      list_type: '01', // AC-2：後端固定
      list_period_start: String(dto.listPeriodStart),
      list_period_end: String(dto.listPeriodEnd),
      list_interval: String(dto.listInterval),
      assigned_date: null,
      total_amount: null,
      reserved_amount: null,
      is_assigned: null,
      project_workym: currentWorkYm,
      casenumber: null,
      name: null,
      caseyear: dto.caseYear,
      caseyearnm: null,
      settle_src: dto.settleSrc,
      card_type: dto.cardType ?? null,
      // E07 重構 P1 B2 補完：case_status / cr_enabled 持久化
      case_status: caseStatusValue,
      cr_enabled: dto.crEnabled ?? false,
      status: 'active',
      stage: 'draft',
      created_by_prog: 'CDMP-F050',
      created_by: actor.userId,
      created_at: now,
      updated_by_prog: 'CDMP-F050',
      updated_by: actor.userId,
      updated_at: now,
    } as Partial<ObListDefinition>);

    await this.listRepo.save(entity);

    // AC-9 / BR-5：audit log
    await this.writeAudit({
      entityId: listNo,
      action: 'CREATE',
      actorId: actor.userId,
      ipAddress: actor.ipAddress,
      beforeValue: null,
      afterValue: {
        list_no: listNo,
        list_nm: dto.listNm,
        prod_kind: dto.prodKind,
        case_status: caseStatusValue,
        card_type: dto.cardType ?? null,
        copy_from_list_no: dto.copyFromListNo ?? null,
      },
    });

    return {
      listNo,
      listNm: dto.listNm,
      status: 'active',
      projectWorkym: currentWorkYm,
    };
  }

  // -------------------------------------------------------------------------
  // F051 v2.0 — Update
  // -------------------------------------------------------------------------

  async updateList(
    listNo: string,
    dto: UpdateListDto,
    actor: { userId: string; ipAddress: string | null },
    currentWorkYm?: string,
  ): Promise<{
    listNo: string;
    listNm: string;
    status: string;
    updatedAt: Date;
  }> {
    await this.assignmentRunGuard.assertNoRunningRun();

    const existing = await this.listRepo.findOne({ where: { list_no: listNo } });
    if (!existing) {
      throw new NotFoundException({
        error: ERROR_CODES.ASSIGNMENT_LIST_NOT_FOUND,
        message: ERROR_MESSAGES.ASSIGNMENT_LIST_NOT_FOUND,
      });
    }

    // E07 重構 P1 B2 補完：歷史月份寫入攔截（error-handling.md v1.14 / F077 §6 BR-3）
    // 若 controller 傳入 currentWorkYm 則比對 existing.project_workym；後者較舊即 403 LIST_HISTORICAL_READONLY
    this.assertNotHistorical(existing.project_workym ?? '', currentWorkYm);

    // AC-4：status=inactive 不可編輯
    if (existing.status === 'inactive') {
      throw new UnprocessableEntityException({
        error: ERROR_CODES.ASSIGNMENT_LIST_INACTIVE,
        message: ERROR_MESSAGES.ASSIGNMENT_LIST_INACTIVE,
      });
    }

    // AC-6b：case_status 必填
    const caseStatusValue = (dto.caseStatus ?? '').trim();
    if (!caseStatusValue) {
      throw new UnprocessableEntityException({
        error: ERROR_CODES.CASE_STATUS_REQUIRED,
        message: ERROR_MESSAGES.CASE_STATUS_REQUIRED,
      });
    }

    // AC-7 / BR-5：PROD_KIND + CARD_TYPE 衝突（排除本身）
    const conflict = await this.findActivePkCardTypeConflict(
      existing.project_workym ?? '',
      dto.prodKind,
      dto.cardType ?? null,
      listNo,
    );
    if (conflict) {
      throw new UnprocessableEntityException({
        error: ERROR_CODES.LIST_NO_DUPLICATE,
        message: `${ERROR_MESSAGES.LIST_NO_DUPLICATE}（LIST_NO: ${conflict}）`,
      });
    }

    const before = { ...existing };
    const now = new Date();

    existing.list_nm = dto.listNm;
    existing.prod_kind = dto.prodKind;
    existing.caseyear = dto.caseYear;
    existing.spec_tp = dto.specTp;
    existing.list_period_start = String(dto.listPeriodStart);
    existing.list_period_end = String(dto.listPeriodEnd);
    existing.list_interval = String(dto.listInterval);
    existing.settle_src = dto.settleSrc;
    existing.card_type = dto.cardType ?? null;
    existing.prod_best = dto.prodBest ?? '';
    // E07 重構 P1 B2 補完：case_status / cr_enabled 持久化
    existing.case_status = caseStatusValue;
    if (dto.crEnabled !== undefined) {
      existing.cr_enabled = dto.crEnabled;
    }
    existing.updated_by = actor.userId;
    existing.updated_by_prog = 'CDMP-F051';
    existing.updated_at = now;

    await this.listRepo.save(existing);

    await this.writeAudit({
      entityId: listNo,
      action: 'UPDATE',
      actorId: actor.userId,
      ipAddress: actor.ipAddress,
      beforeValue: {
        list_nm: before.list_nm,
        prod_kind: before.prod_kind,
        case_status_input: caseStatusValue, // case_status 暫存於 audit 紀錄
        card_type: before.card_type,
      },
      afterValue: {
        list_nm: dto.listNm,
        prod_kind: dto.prodKind,
        case_status_input: caseStatusValue,
        card_type: dto.cardType ?? null,
      },
    });

    return {
      listNo,
      listNm: dto.listNm,
      status: existing.status,
      updatedAt: now,
    };
  }

  // -------------------------------------------------------------------------
  // F052 v2.0 — Disable（軟刪除）
  // -------------------------------------------------------------------------

  async disableList(
    listNo: string,
    actor: { userId: string; ipAddress: string | null },
    currentWorkYm?: string,
  ): Promise<{ listNo: string; status: string; updatedAt: Date }> {
    await this.assignmentRunGuard.assertNoRunningRun();

    const existing = await this.listRepo.findOne({ where: { list_no: listNo } });
    if (!existing) {
      throw new NotFoundException({
        error: ERROR_CODES.ASSIGNMENT_LIST_NOT_FOUND,
        message: ERROR_MESSAGES.ASSIGNMENT_LIST_NOT_FOUND,
      });
    }

    // E07 重構 P1 B2 補完：歷史月份寫入攔截
    this.assertNotHistorical(existing.project_workym ?? '', currentWorkYm);

    // AC-7：重複停用阻擋
    if (existing.status === 'inactive') {
      throw new UnprocessableEntityException({
        error: ERROR_CODES.ASSIGNMENT_LIST_ALREADY_INACTIVE,
        message: ERROR_MESSAGES.ASSIGNMENT_LIST_ALREADY_INACTIVE,
      });
    }

    const now = new Date();
    const beforeStatus = existing.status;
    existing.status = 'inactive';
    existing.updated_by = actor.userId;
    existing.updated_by_prog = 'CDMP-F052';
    existing.updated_at = now;
    await this.listRepo.save(existing);

    // 注意：entity union 不含 'DISABLE'，採 UPDATE + status change 紀錄
    // 對應 spec AC-2「action='DISABLE'」之語意以 before/after status 差異保留稽核軌跡
    await this.writeAudit({
      entityId: listNo,
      action: 'UPDATE',
      actorId: actor.userId,
      ipAddress: actor.ipAddress,
      beforeValue: { status: beforeStatus, _operation: 'DISABLE' },
      afterValue: { status: 'inactive', _operation: 'DISABLE' },
    });

    return { listNo, status: 'inactive', updatedAt: now };
  }

  // -------------------------------------------------------------------------
  // 內部：歷史月份寫入攔截（E07 重構 P1 B2 補完 / error-handling.md v1.14）
  // -------------------------------------------------------------------------

  /**
   * 比對名單 project_workym 與當前 currentWorkYm，較舊則 403 LIST_HISTORICAL_READONLY。
   *
   * 參數 currentWorkYm 為 optional：
   *   - 未傳入：跳過檢查（service 單元測試 / 舊呼叫端向下相容）
   *   - 傳入：執行嚴格比對（controller 必須傳入以實施 spec BR-3）
   *
   * 注意：F077 §6 BR-3 規範「歷史月份資料為唯讀」適用於 update / disable；
   *       create 因 project_workym 由 currentWorkYm 強制注入，無歷史寫入風險。
   */
  private assertNotHistorical(
    listProjectWorkYm: string,
    currentWorkYm: string | undefined,
  ): void {
    if (!currentWorkYm) return;
    if (!listProjectWorkYm) return;
    if (listProjectWorkYm < currentWorkYm) {
      throw new ForbiddenException({
        error: ERROR_CODES.LIST_HISTORICAL_READONLY,
        message: ERROR_MESSAGES.LIST_HISTORICAL_READONLY,
      });
    }
  }

  // -------------------------------------------------------------------------
  // 內部：LIST_NO 自動產生（BR-1）
  // -------------------------------------------------------------------------

  /**
   * 依 spec AC-2：OB{YYYYMM}{NNN}，001~999，達 999 → LIST_NO_LIMIT_EXCEEDED
   */
  async generateNextListNo(ym: string): Promise<string> {
    const prefix = `OB${ym}`;
    const existing = await this.listRepo
      .createQueryBuilder('l')
      .where('l.list_no LIKE :pattern', { pattern: `${prefix}%` })
      .orderBy('l.list_no', 'DESC')
      .limit(1)
      .getOne();

    let nextSeq = 1;
    if (existing) {
      const seqStr = existing.list_no.slice(prefix.length);
      const seq = parseInt(seqStr, 10);
      if (!Number.isNaN(seq)) {
        nextSeq = seq + 1;
      }
    }

    if (nextSeq > 999) {
      throw new UnprocessableEntityException({
        error: ERROR_CODES.LIST_NO_LIMIT_EXCEEDED,
        message: `本月（${ym}）名單定義已達 999 筆上限，無法新增`,
      });
    }

    return `${prefix}${String(nextSeq).padStart(3, '0')}`;
  }

  /**
   * 找出在當月相同 prod_kind + card_type 的 active 名單 list_no。
   * @param excludeListNo 若指定（F051 update），排除此 list_no 本身。
   */
  async findActivePkCardTypeConflict(
    ym: string,
    prodKind: string,
    cardType: string | null,
    excludeListNo?: string,
  ): Promise<string | null> {
    const qb = this.listRepo
      .createQueryBuilder('l')
      .where("l.status = 'active'")
      .andWhere('l.project_workym = :ym', { ym })
      .andWhere('l.prod_kind = :prodKind', { prodKind });

    if (cardType === null || cardType === undefined) {
      qb.andWhere('l.card_type IS NULL');
    } else {
      qb.andWhere('l.card_type = :cardType', { cardType });
    }

    if (excludeListNo) {
      qb.andWhere('l.list_no != :excludeListNo', { excludeListNo });
    }

    const conflict = await qb.getOne();
    return conflict?.list_no ?? null;
  }

  // -------------------------------------------------------------------------
  // 內部：寫入 audit log
  // -------------------------------------------------------------------------

  private async writeAudit(args: {
    entityId: string;
    action: AssignmentAuditLog['action'];
    actorId: string;
    ipAddress: string | null;
    beforeValue: Record<string, unknown> | null;
    afterValue: Record<string, unknown> | null;
  }): Promise<void> {
    try {
      await this.auditRepo.save(
        this.auditRepo.create({
          entity_type: 'ob_list_definition',
          entity_id: args.entityId,
          action: args.action,
          actor_id: args.actorId,
          actor_name: args.actorId, // F050 spec 未要求查 user 名稱；以 id 暫填，後續可由 view join
          before_value: args.beforeValue,
          after_value: args.afterValue,
          ip_address: args.ipAddress,
          created_at: new Date(),
        } as Partial<AssignmentAuditLog>),
      );
    } catch (err: any) {
      // BR-5：稽核寫入失敗僅記錄 Logger.error，不 rollback 業務操作
      this.logger.error(
        `assignment_audit_log write failed: entity=${args.entityId}, ` +
          `action=${args.action}, actor=${args.actorId}: ${err?.message ?? err}`,
      );
    }
  }
}
