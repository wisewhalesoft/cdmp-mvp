import {
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { ObListDefinition } from '@/database/entities/ob-list-definition.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';
import { ERROR_CODES, ERROR_MESSAGES } from '@/common/errors/error-codes';

/**
 * 五階段流程列舉（F077 BR / data-model L848）
 */
export type StageName = 'draft' | 'dept_ratio' | 'personnel_ratio' | 'approval' | 'ready';

export type PreconditionFn = (mgr: EntityManager) => Promise<void>;
export type PostActionFn = (mgr: EntityManager) => Promise<void>;
export type CleanupFn = (mgr: EntityManager) => Promise<void>;

/**
 * StageTransitionService（AD-E07 v3.0 / 重構批次 4 / architecture-spec L1043）
 *
 * 五階段流程引擎共用 helper。提供：
 *   - advanceTo / rollbackTo / rejectTo / assertStageEquals 4 個 method
 *   - 所有寫入操作於同一 DB transaction 內完成（含 assignment_audit_log INSERT）
 *
 * 對應 spec：F078, F079, F080, F081, F082, F084, F085, F086, F087, F089
 */
@Injectable()
export class StageTransitionService {
  private readonly logger = new Logger(StageTransitionService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * 驗證名單目前 stage 是否等於 expectedStage。
   *
   * @throws 404 NotFoundException — 名單不存在
   * @throws 422 LIST_STAGE_TRANSITION_FORBIDDEN — stage 不符
   */
  async assertStageEquals(
    listNo: string,
    expectedStage: StageName,
    mgr?: EntityManager,
  ): Promise<void> {
    const row = mgr
      ? await mgr.findOne(ObListDefinition, { where: { list_no: listNo } })
      : await this.dataSource.getRepository(ObListDefinition).findOne({ where: { list_no: listNo } });
    if (!row) {
      throw new NotFoundException({
        error: 'LIST_NOT_FOUND',
        message: `找不到指定的名單：${listNo}`,
      });
    }
    if ((row as any).stage !== expectedStage) {
      throw new UnprocessableEntityException({
        error: ERROR_CODES.LIST_STAGE_TRANSITION_FORBIDDEN,
        message: ERROR_MESSAGES.LIST_STAGE_TRANSITION_FORBIDDEN,
        details: [{ field: 'stage', currentStage: (row as any).stage, expectedStage }],
      });
    }
  }

  /**
   * 推進：fromStage → toStage。
   * 流程：
   *   1) assertStageEquals(listNo, fromStage)
   *   2) preconditionFn(mgr)（業務檢查，例如 RatioValidationService.assertSumEquals100）
   *   3) UPDATE ob_list_definition.stage = toStage
   *   4) INSERT assignment_audit_log（action='STAGE_ADVANCE'）
   *   5) postActionFn(mgr)（可選；例如清空下一階段預備資料）
   *
   * 1~5 步驟在同一 transaction 內完成。
   */
  async advanceTo(
    listNo: string,
    fromStage: StageName,
    toStage: StageName,
    actorId: string,
    preconditionFn: PreconditionFn,
    postActionFn?: PostActionFn,
  ): Promise<void> {
    await this.dataSource.transaction(async (mgr) => {
      await this.assertStageEquals(listNo, fromStage, mgr);
      await preconditionFn(mgr);
      await mgr.update(ObListDefinition, { list_no: listNo }, { stage: toStage } as any);
      await mgr.insert(AssignmentAuditLog, this.buildAudit('STAGE_ADVANCE', listNo, actorId, { fromStage, toStage }) as any);
      if (postActionFn) await postActionFn(mgr);
    });
    this.logger.log(`STAGE_ADVANCE list=${listNo} ${fromStage} → ${toStage} by ${actorId}`);
  }

  /**
   * 推進（過載）：使用外部傳入的 EntityManager，**不自開 tx**。
   *
   * F084 v2.0 auto-advance 主路徑專用（AD-E07-19 §19.3.2）：
   *   auto-advance 偵測 + stage 更新 + 稽核須與 setPersonnelRatios() 的 ob_empl_set
   *   寫入同屬一個 transaction，因此不能呼叫 this.dataSource.transaction()（會另開 tx）。
   *
   * 流程（皆用傳入 mgr）：
   *   1) assertStageEquals(listNo, fromStage, mgr)（idempotent guard：若 stage 已變則拋 422）
   *   2) UPDATE ob_list_definition.stage = toStage
   *   3) INSERT assignment_audit_log（action='STAGE_ADVANCE'）
   *      - auditMetadata 合併進 after_value.metadata（用以區分自動 / 手動路徑）
   *
   * @param auditMetadata 可選；提供時寫入 after_value.metadata（例如
   *                      { auto_advanced_by_completion: true, operator_role: 'section_chief' }）；
   *                      省略時 after_value 不含 metadata 欄位（手動 fallback 路徑語意）。
   * @throws 422 LIST_STAGE_TRANSITION_FORBIDDEN — stage 不符 fromStage
   */
  async advanceToInMgr(
    listNo: string,
    fromStage: StageName,
    toStage: StageName,
    actorId: string,
    mgr: EntityManager,
    auditMetadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.assertStageEquals(listNo, fromStage, mgr);
    await mgr.update(ObListDefinition, { list_no: listNo }, { stage: toStage } as any);
    const payload: Record<string, unknown> = { fromStage, toStage };
    if (auditMetadata !== undefined) {
      payload.metadata = auditMetadata;
    }
    await mgr.insert(
      AssignmentAuditLog,
      this.buildAudit('STAGE_ADVANCE', listNo, actorId, payload) as any,
    );
    this.logger.log(`STAGE_ADVANCE(inMgr) list=${listNo} ${fromStage} → ${toStage} by ${actorId}`);
  }

  /**
   * Rollback：fromStage → toStage（往前退）。
   * 與 advanceTo 結構相同，但 audit action='STAGE_ROLLBACK'，且必須執行 cleanupFn（清空當前階段資料）。
   */
  async rollbackTo(
    listNo: string,
    fromStage: StageName,
    toStage: StageName,
    actorId: string,
    cleanupFn: CleanupFn,
  ): Promise<void> {
    await this.dataSource.transaction(async (mgr) => {
      await this.assertStageEquals(listNo, fromStage, mgr);
      await cleanupFn(mgr);
      await mgr.update(ObListDefinition, { list_no: listNo }, ({ stage: toStage } as any));
      await mgr.insert(AssignmentAuditLog, this.buildAudit('STAGE_ROLLBACK', listNo, actorId, { fromStage, toStage }) as any);
    });
    this.logger.log(`STAGE_ROLLBACK list=${listNo} ${fromStage} → ${toStage} by ${actorId}`);
  }

  /**
   * 退件：F087 退回上一階段並紀錄 rejectReason。
   */
  async rejectTo(
    listNo: string,
    fromStage: StageName,
    toStage: StageName,
    actorId: string,
    rejectReason: string,
    cleanupFn?: CleanupFn,
    postActionFn?: PostActionFn,
  ): Promise<void> {
    await this.dataSource.transaction(async (mgr) => {
      await this.assertStageEquals(listNo, fromStage, mgr);
      if (cleanupFn) await cleanupFn(mgr);
      await mgr.update(ObListDefinition, { list_no: listNo }, ({ stage: toStage } as any));
      await mgr.insert(
        AssignmentAuditLog,
        this.buildAudit('STAGE_REJECT', listNo, actorId, { fromStage, toStage, rejectReason }) as any,
      );
      if (postActionFn) await postActionFn(mgr);
    });
    this.logger.log(`STAGE_REJECT list=${listNo} ${fromStage} → ${toStage} reason="${rejectReason}" by ${actorId}`);
  }

  private buildAudit(
    action: string,
    listNo: string,
    actorId: string,
    payload: Record<string, unknown>,
  ): Partial<AssignmentAuditLog> {
    // m16 / 2026-05-16：column 已擴為 varchar(30) + entity union 已含 STAGE_*，可寫完整名稱
    // 2026-05-26：entity_type 對齊 assignment-list.service writeAudit 與 getFullSnapshot 查詢值
    //   （原 'list_definition' 與查詢用 'ob_list_definition' 不一致，導致階段事件在 Detail Drawer
    //    簽核歷史完全查不到 —— 拒絕/核准/推進/退回都漏顯示）。table 名為 ob_list_definition，故以此為準。
    return {
      action: action as AssignmentAuditLog['action'],
      entity_type: 'ob_list_definition',
      entity_id: listNo,
      actor_id: actorId,
      actor_name: actorId, // placeholder：上層 service 可覆寫
      after_value: payload as Record<string, unknown>,
    };
  }
}
