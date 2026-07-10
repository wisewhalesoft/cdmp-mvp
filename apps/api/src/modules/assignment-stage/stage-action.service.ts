import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type { EntityManager } from 'typeorm';
import { ObListDefinition } from '@/database/entities/ob-list-definition.entity';
import { ObDeptPct } from '@/database/entities/ob-dept-pct.entity';
import { ObEmplSet } from '@/database/entities/ob-empl-set.entity';
import { AssignmentApproval } from '@/database/entities/assignment-approval.entity';
import { User } from '@/database/entities/user.entity';
import { isUuid } from '@/common/uuid.util';
import { StageTransitionService } from '@/modules/assignment/services/stage-transition.service';
import { RatioValidationService } from '@/modules/assignment/services/ratio-validation.service';
import { PersonnelRatioValidationService } from '@/modules/assignment/services/personnel-ratio-validation.service';
import { AssignmentRunGuardService } from '@/modules/assignment/services/assignment-run-guard.service';
import { Stage0EstimateService } from '@/modules/assignment-list/stage0-estimate.service';
import { ERROR_CODES, ERROR_MESSAGES } from '@/common/errors/error-codes';

interface ActorUser {
  userId: string;
  role: string;
  businessRole?: string | null;
  ipAddress: string | null;
}

/**
 * StageActionService — M03a / M03b / M03c / M03d 五階段流程 action 服務
 *
 * 對應 spec：
 *   - F078：草稿 → 部門比例（advance）
 *   - F080：部門比例 → 個別業務比例（advance / DirectorGuard）
 *   - F081：部門比例 → 草稿（rollback / DirectorGuard）
 *   - F084：個別業務比例 → 簽核（advance / DirectorOrSectionChiefGuard）
 *   - F085：個別業務比例 → 部門比例（rollback / DirectorGuard）
 *   - F086：簽核 → 準備完成（approve / DirectorGuard）
 *   - F087：簽核 → 個別業務比例（reject + reason / DirectorGuard）
 *   - F089：準備完成 → 簽核（rollback / DirectorGuard）
 *
 * 寫入透過 P0 StageTransitionService 之 advanceTo / rollbackTo / rejectTo
 * helper 統一執行，含 audit log 寫入於同一 transaction。
 */
@Injectable()
export class StageActionService {
  private readonly logger = new Logger(StageActionService.name);

  constructor(
    @InjectRepository(ObListDefinition)
    private readonly listRepo: Repository<ObListDefinition>,
    @InjectRepository(ObDeptPct)
    private readonly deptPctRepo: Repository<ObDeptPct>,
    @InjectRepository(ObEmplSet)
    private readonly emplSetRepo: Repository<ObEmplSet>,
    @InjectRepository(AssignmentApproval)
    private readonly approvalRepo: Repository<AssignmentApproval>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly stageTransition: StageTransitionService,
    private readonly ratioValidation: RatioValidationService,
    private readonly personnelRatioValidation: PersonnelRatioValidationService,
    private readonly runGuard: AssignmentRunGuardService,
    private readonly stage0Estimate: Stage0EstimateService,
  ) {}

  // ===========================================================================
  // F078 草稿 → dept_ratio（無前置條件）
  // ===========================================================================
  async advanceDraftToDeptRatio(
    listNo: string,
    actor: ActorUser,
    currentWorkYm: string,
  ): Promise<StageActionResponse> {
    await this.runGuard.assertNoRunningRun();
    const list = await this.findListOrThrow(listNo);
    this.assertListActive(list);
    this.assertNotHistorical(list.project_workym, currentWorkYm);

    const before = list.stage;
    await this.stageTransition.advanceTo(
      listNo,
      'draft',
      'dept_ratio',
      actor.userId,
      async () => undefined,
    );
    return { listNo, previousStage: before, currentStage: 'dept_ratio', advancedBy: actor.userId, advancedAt: new Date() };
  }

  // ===========================================================================
  // F080 dept_ratio → personnel_ratio（前置：部門比例加總 = 100%）
  // ===========================================================================
  async advanceDeptRatioToPersonnelRatio(
    listNo: string,
    actor: ActorUser,
    currentWorkYm: string,
  ): Promise<StageActionResponse> {
    await this.runGuard.assertNoRunningRun();
    const list = await this.findListOrThrow(listNo);
    this.assertListActive(list);
    this.assertNotHistorical(list.project_workym, currentWorkYm);

    await this.stageTransition.advanceTo(
      listNo,
      'dept_ratio',
      'personnel_ratio',
      actor.userId,
      async (mgr: EntityManager) => {
        // 前置：ob_dept_pct 加總 = 100%
        const rows = await mgr.find(ObDeptPct, {
          where: { project_workym: list.project_workym ?? '', list_no: listNo },
        });
        if (rows.length === 0) {
          throw new UnprocessableEntityException({
            error: ERROR_CODES.STAGE_ADVANCE_PRECONDITION_FAILED,
            message: '請先確認各部門比例加總為 100%，再推進',
          });
        }
        const ratios = rows.map((r) => Number(r.ration));
        try {
          this.ratioValidation.assertSumEquals100(ratios);
        } catch {
          throw new UnprocessableEntityException({
            error: ERROR_CODES.STAGE_ADVANCE_PRECONDITION_FAILED,
            message: '部門比例加總非 100%，無法推進',
            details: [{ actualSum: Math.round(ratios.reduce((a, v) => a + v, 0) * 100) / 100 }],
          });
        }
      },
    );
    return { listNo, previousStage: 'dept_ratio', currentStage: 'personnel_ratio', advancedBy: actor.userId, advancedAt: new Date() };
  }

  // ===========================================================================
  // F081 dept_ratio → draft（清空 ob_dept_pct）
  // ===========================================================================
  async rollbackDeptRatioToDraft(
    listNo: string,
    actor: ActorUser,
    currentWorkYm: string,
  ): Promise<StageRollbackResponse> {
    await this.runGuard.assertNoRunningRun();
    const list = await this.findListOrThrow(listNo);
    this.assertListActive(list);
    this.assertNotHistorical(list.project_workym, currentWorkYm);

    if (list.stage !== 'dept_ratio') {
      throw new UnprocessableEntityException({
        error: ERROR_CODES.STAGE_ROLLBACK_BLOCKED,
        message: `名單目前階段為 ${list.stage}，不可 Rollback 至 draft`,
      });
    }

    let deletedCount = 0;
    await this.stageTransition.rollbackTo(
      listNo,
      'dept_ratio',
      'draft',
      actor.userId,
      async (mgr: EntityManager) => {
        const res = await mgr.delete(ObDeptPct, {
          project_workym: list.project_workym ?? '',
          list_no: listNo,
        });
        deletedCount = res.affected ?? 0;
      },
    );

    return {
      listNo,
      previousStage: 'dept_ratio',
      currentStage: 'draft',
      deletedDeptPctCount: deletedCount,
      rollbackedBy: actor.userId,
      rollbackedAt: new Date(),
    };
  }

  // ===========================================================================
  // F084 personnel_ratio → approval（前置：所有部門加總 100%）
  // ===========================================================================
  async advancePersonnelRatioToApproval(
    listNo: string,
    actor: ActorUser,
    currentWorkYm: string,
  ): Promise<StageActionResponse> {
    await this.runGuard.assertNoRunningRun();
    const list = await this.findListOrThrow(listNo);
    this.assertListActive(list);
    this.assertNotHistorical(list.project_workym, currentWorkYm);

    await this.stageTransition.advanceTo(
      listNo,
      'personnel_ratio',
      'approval',
      actor.userId,
      async () => {
        // 前置：所有 ob_dept_pct 之部門皆有對應 ob_empl_set 加總 = 100%（含全員離職部門短路）
        await this.personnelRatioValidation.assertAllDeptsSumEquals100(listNo);
      },
    );
    return {
      listNo,
      previousStage: 'personnel_ratio',
      currentStage: 'approval',
      advancedBy: actor.userId,
      advancedByRole: actor.role === 'admin' ? 'admin' : (actor.businessRole ?? null),
      advancedAt: new Date(),
    };
  }

  // ===========================================================================
  // F085 personnel_ratio → dept_ratio（清空 ob_empl_set）
  // ===========================================================================
  async rollbackPersonnelRatioToDeptRatio(
    listNo: string,
    actor: ActorUser,
    currentWorkYm: string,
  ): Promise<StageRollbackResponse> {
    await this.runGuard.assertNoRunningRun();
    const list = await this.findListOrThrow(listNo);
    this.assertListActive(list);
    this.assertNotHistorical(list.project_workym, currentWorkYm);

    if (list.stage !== 'personnel_ratio') {
      throw new UnprocessableEntityException({
        error: ERROR_CODES.STAGE_ROLLBACK_BLOCKED,
        message: `名單目前階段為 ${list.stage}，不可 Rollback 至 dept_ratio`,
      });
    }

    let deletedCount = 0;
    await this.stageTransition.rollbackTo(
      listNo,
      'personnel_ratio',
      'dept_ratio',
      actor.userId,
      async (mgr: EntityManager) => {
        const res = await mgr.delete(ObEmplSet, { list_no: listNo });
        deletedCount = res.affected ?? 0;
      },
    );

    return {
      listNo,
      previousStage: 'personnel_ratio',
      currentStage: 'dept_ratio',
      deletedEmplSetCount: deletedCount,
      rollbackedBy: actor.userId,
      rollbackedAt: new Date(),
    };
  }

  // ===========================================================================
  // F086 approval → ready（核准；保留所有設定資料）
  // ===========================================================================
  async approveToReady(
    listNo: string,
    actor: ActorUser,
    currentWorkYm: string,
  ): Promise<StageActionResponse> {
    await this.runGuard.assertNoRunningRun();
    const list = await this.findListOrThrow(listNo);
    this.assertListActive(list);
    this.assertNotHistorical(list.project_workym, currentWorkYm);

    const approvedAt = new Date();
    const approverRole =
      actor.role === 'admin' ? 'admin' : (actor.businessRole ?? null);

    await this.stageTransition.advanceTo(
      listNo,
      'approval',
      'ready',
      actor.userId,
      async () => undefined,
      // F086 v1.3 BR-11：同 transaction 寫入 assignment_approval(action='approve')
      //（mirror F087 reject 之 postActionFn；亦為 F088 清單卡片 approvedAt / 詳情簽核歷史 approve 列來源）
      async (mgr: EntityManager) => {
        await mgr.insert(AssignmentApproval, {
          list_no: listNo,
          action: 'approve',
          reject_reason: null,
          approver_id: actor.userId,
          approver_name: actor.userId,
          approver_role: approverRole,
          approved_at: approvedAt,
          created_at: approvedAt,
        } as Partial<AssignmentApproval>);
      },
    );

    // F086 v1.3 BR-12 / AD-E07-20：commit 後 best-effort 物化 Stage 0 估算
    //（transaction 外執行；計算 / 寫入失敗僅 log，不影響 approve 結果）
    await this.materializeStage0Estimate(listNo);

    return {
      listNo,
      previousStage: 'approval',
      currentStage: 'ready',
      advancedBy: actor.userId,
      advancedAt: approvedAt,
    };
  }

  /**
   * F086 v1.3 BR-12 / AD-E07-20：best-effort 物化 Stage 0 估算至 ob_list_definition。
   *
   * 失敗（estimate timeout / 名單異常 / UPDATE 失敗）僅 Logger.warn，不拋出 —
   * approve→ready 已完成，估算僅為清單頁顯示用快取，不可因此 rollback。
   */
  private async materializeStage0Estimate(listNo: string): Promise<void> {
    try {
      const { count } = await this.stage0Estimate.estimateListCount(listNo);
      await this.listRepo.update(
        { list_no: listNo },
        {
          stage0_estimate_count: count,
          stage0_estimated_at: new Date(),
        },
      );
    } catch (err) {
      this.logger.warn(
        `物化 Stage 0 估算失敗 (listNo=${listNo}): ${(err as Error).message}`,
      );
    }
  }

  // ===========================================================================
  // F087 approval → personnel_ratio（拒絕 + reason；清空 ob_empl_set）
  // ===========================================================================
  async rejectToPersonnelRatio(
    listNo: string,
    rejectReason: string | undefined | null,
    actor: ActorUser,
    currentWorkYm: string,
  ): Promise<{
    listNo: string;
    previousStage: string;
    currentStage: string;
    rejectReason: string;
    rejectorId: string;
    rejectedAt: Date;
    clearedEmployeeRatios: number;
  }> {
    // BR-3 拒絕原因必填 / 長度
    const trimmed = (rejectReason ?? '').trim();
    if (trimmed.length === 0) {
      throw new UnprocessableEntityException({
        error: ERROR_CODES.REJECT_REASON_REQUIRED,
        message: ERROR_MESSAGES.REJECT_REASON_REQUIRED,
      });
    }
    if (trimmed.length > 500) {
      throw new UnprocessableEntityException({
        error: ERROR_CODES.REJECT_REASON_TOO_LONG,
        message: ERROR_MESSAGES.REJECT_REASON_TOO_LONG,
      });
    }

    await this.runGuard.assertNoRunningRun();
    const list = await this.findListOrThrow(listNo);
    this.assertListActive(list);
    this.assertNotHistorical(list.project_workym, currentWorkYm);

    let clearedCount = 0;
    const rejectedAt = new Date();
    const approverRole =
      actor.role === 'admin' ? 'admin' : (actor.businessRole ?? null);
    await this.stageTransition.rejectTo(
      listNo,
      'approval',
      'personnel_ratio',
      actor.userId,
      trimmed,
      async (mgr: EntityManager) => {
        const res = await mgr.delete(ObEmplSet, { list_no: listNo });
        clearedCount = res.affected ?? 0;
      },
      // F087 v1.1 BR-11：同 transaction INSERT assignment_approval（postActionFn）
      async (mgr: EntityManager) => {
        await mgr.insert(AssignmentApproval, {
          list_no: listNo,
          action: 'reject',
          reject_reason: trimmed,
          approver_id: actor.userId,
          approver_name: actor.userId,
          approver_role: approverRole,
          approved_at: rejectedAt,
          created_at: rejectedAt,
        } as Partial<AssignmentApproval>);
      },
    );

    return {
      listNo,
      previousStage: 'approval',
      currentStage: 'personnel_ratio',
      rejectReason: trimmed,
      rejectorId: actor.userId,
      rejectedAt,
      clearedEmployeeRatios: clearedCount,
    };
  }

  // ===========================================================================
  // F089 ready → approval（保留所有設定）
  // ===========================================================================
  async rollbackReadyToApproval(
    listNo: string,
    actor: ActorUser,
    currentWorkYm: string,
  ): Promise<StageRollbackResponse> {
    await this.runGuard.assertNoRunningRun();
    const list = await this.findListOrThrow(listNo);
    this.assertListActive(list);
    this.assertNotHistorical(list.project_workym, currentWorkYm);

    if (list.stage !== 'ready') {
      throw new UnprocessableEntityException({
        error: ERROR_CODES.STAGE_ROLLBACK_BLOCKED,
        message: `名單目前階段為 ${list.stage}，不可 Rollback 至 approval`,
      });
    }

    await this.stageTransition.rollbackTo(
      listNo,
      'ready',
      'approval',
      actor.userId,
      async () => undefined,
    );

    return {
      listNo,
      previousStage: 'ready',
      currentStage: 'approval',
      rollbackedBy: actor.userId,
      rollbackedAt: new Date(),
    };
  }

  // ===========================================================================
  // F087 v1.2 P1 — 簽核歷史完整時間軸（GET）
  // ===========================================================================
  async getApprovalHistory(listNo: string): Promise<ApprovalHistoryResponse> {
    await this.findListOrThrow(listNo); // 名單不存在 → NotFoundException
    const rows = await this.approvalRepo
      .createQueryBuilder('a')
      .where('a.list_no = :listNo', { listNo })
      .orderBy('a.approved_at', 'DESC')
      .addOrderBy('a.created_at', 'DESC')
      .getMany();

    // 簽核者姓名解析：approver_name 於寫入時存的是 user id（UUID，見 approve/reject 分支），
    // 顯示層需姓名而非 UUID。批次 JOIN users 解析（對齊 assignment-list.service listLists 模式）。
    // 🔴 isUuid 過濾避免非 GUID 值餵入 users.id(uniqueidentifier) 查詢拋「Invalid GUID」500。
    const approverIds = Array.from(
      new Set(rows.map((r) => r.approver_id).filter(isUuid)),
    );
    const nameById = new Map<string, string>();
    if (approverIds.length > 0) {
      const users = await this.userRepo.find({ where: { id: In(approverIds) } });
      for (const u of users) nameById.set(u.id, u.name);
    }

    const history: ApprovalHistoryItem[] = rows.map((r) => ({
      approvalId: r.approval_id,
      action: r.action,
      rejectReason: r.reject_reason,
      approverId: r.approver_id,
      // 解析姓名優先；查無 user 時退回原存值（保留既有 fallback 行為，不回退為空）
      approverName: nameById.get(r.approver_id) ?? r.approver_name,
      approverRole: r.approver_role,
      approvedAt: r.approved_at,
    }));

    return { listNo, history };
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

export interface StageActionResponse {
  listNo: string;
  previousStage: string;
  currentStage: string;
  advancedBy: string;
  advancedByRole?: string | null;
  advancedAt: Date;
}

export interface StageRollbackResponse {
  listNo: string;
  previousStage: string;
  currentStage: string;
  deletedDeptPctCount?: number;
  deletedEmplSetCount?: number;
  rollbackedBy: string;
  rollbackedAt: Date;
}

/**
 * F087 v1.2 P1 — getApprovalHistory 回應結構
 *
 * 對應 assignment_approval table；依 approved_at DESC 排序回傳全部紀錄。
 */
export interface ApprovalHistoryItem {
  approvalId: string;
  action: 'approve' | 'reject';
  rejectReason: string | null;
  approverId: string;
  approverName: string | null;
  approverRole: string | null;
  approvedAt: Date;
}

export interface ApprovalHistoryResponse {
  listNo: string;
  history: ApprovalHistoryItem[];
}
