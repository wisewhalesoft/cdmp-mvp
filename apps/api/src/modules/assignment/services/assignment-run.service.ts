import {
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';
import { AssignmentRunGuardService } from './assignment-run-guard.service';
import { MonthlyRunReadinessService } from './monthly-run-readiness.service';
import { AssignmentRunPipelineService } from './assignment-run-pipeline.service';
import { ERROR_CODES, ERROR_MESSAGES } from '@/common/errors/error-codes';

export interface TriggerRunResult {
  runId: string;
  status: 'pending';
  projectWorkym: string;
  triggeredAt: Date;
}

export interface RunSummary {
  runId: string;
  projectWorkym: string;
  status: AssignmentRun['status'];
  triggeredBy: string;
  triggeredAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  totalCases: number | null;
  totalLists: number | null;
  errorMessage: string | null;
}

/**
 * AssignmentRunService — F061 月跑觸發 + F062/F065/F066 查詢
 *
 * 三大流程：
 *   - triggerRun(ym, actorId)：前置 → INSERT pending → audit RUN → 觸發背景 pipeline
 *   - listRuns({ ym? })：歷史月跑清單（F065）
 *   - getRunById(runId)：單一月跑詳情（F062 / F066）
 *
 * 前置條件（spec AC-1）：
 *   1. AssignmentRunGuardService.assertNoRunningRun(ym) — 同月併發保護（409）
 *   2. MonthlyRunReadinessService.calculateReadiness(ym) — 確認所有 active 名單 stage=ready
 *      - 無 ready 名單 → 422 NO_READY_LIST_FOUND
 *      - 部分名單未 ready → 422 ASSIGNMENT_RUN_PRECHECK_FAILED + details
 *
 * 注意：Stage 1~4 pipeline 在 B5+ 階段補實作；目前僅完成 record + audit 寫入。
 */
@Injectable()
export class AssignmentRunService {
  private readonly logger = new Logger(AssignmentRunService.name);

  constructor(
    @InjectRepository(AssignmentRun)
    private readonly runRepo: Repository<AssignmentRun>,
    @InjectRepository(AssignmentAuditLog)
    private readonly auditRepo: Repository<AssignmentAuditLog>,
    private readonly runGuard: AssignmentRunGuardService,
    private readonly readiness: MonthlyRunReadinessService,
    @Optional() private readonly pipeline?: AssignmentRunPipelineService,
  ) {}

  /**
   * F061 v1.2 AC-1 + AC-2 + AC-6：觸發月跑
   */
  async triggerRun(ym: string, actorId: string): Promise<TriggerRunResult> {
    // BR-2 / AC-6：併發保護（同月 pending/running → 409）
    await this.runGuard.assertNoRunningRun(ym);

    // AC-1：前置條件（readiness 聚合）
    const readiness = await this.readiness.calculateReadiness(ym);

    if (readiness.totalActiveLists === 0 || readiness.readyCount === 0) {
      throw new UnprocessableEntityException({
        error: ERROR_CODES.NO_READY_LIST_FOUND,
        message: ERROR_MESSAGES.NO_READY_LIST_FOUND,
      });
    }
    if (!readiness.allReady) {
      throw new UnprocessableEntityException({
        error: ERROR_CODES.ASSIGNMENT_RUN_PRECHECK_FAILED,
        message: ERROR_MESSAGES.ASSIGNMENT_RUN_PRECHECK_FAILED,
        details: readiness.notReadyLists.map((l) => ({
          listNo: l.listNo,
          listNm: l.listNm,
          stage: l.stage,
          reason: 'STAGE_NOT_READY',
        })),
      });
    }

    // AC-2：建立 pending run
    const now = new Date();
    const saved = await this.runRepo.save(
      this.runRepo.create({
        project_workym: ym,
        status: 'pending',
        triggered_by: actorId,
        created_at: now,
      } as Partial<AssignmentRun>),
    );

    // AC-2：寫入 audit log（action='RUN'）
    await this.writeAudit(saved.run_id, actorId, ym);

    // AC-3：觸發背景 pipeline（P1 B4 暫保留 setImmediate hook；Stage 1~4 待 B5+ 補實作）
    this.kickoffPipeline(saved.run_id, ym);

    return {
      runId: saved.run_id,
      status: 'pending',
      projectWorkym: ym,
      triggeredAt: saved.created_at,
    };
  }

  /**
   * F065：月跑歷史清單（可選 ym 過濾）
   */
  async listRuns(opts: { ym?: string } = {}): Promise<RunSummary[]> {
    const qb = this.runRepo
      .createQueryBuilder('r')
      .orderBy('r.created_at', 'DESC');
    if (opts.ym) {
      qb.where('r.project_workym = :ym', { ym: opts.ym });
    }
    const rows = await qb.getMany();
    return rows.map((r) => this.toSummary(r));
  }

  /**
   * F062 / F066：單一月跑詳情
   *
   * @throws 404 ASSIGNMENT_RUN_NOT_FOUND
   */
  async getRunById(runId: string): Promise<RunSummary> {
    const row = await this.runRepo.findOne({ where: { run_id: runId } });
    if (!row) {
      throw new NotFoundException({
        error: ERROR_CODES.ASSIGNMENT_RUN_NOT_FOUND,
        message: ERROR_MESSAGES.ASSIGNMENT_RUN_NOT_FOUND,
      });
    }
    return this.toSummary(row);
  }

  /**
   * F062 Phase 2：使用者取消月跑
   *
   * 規則：
   *   - 僅 status='pending' 或 'running' 可取消
   *   - 其他 status → 422 ASSIGNMENT_RUN_NOT_CANCELLABLE
   *   - 不存在 → 404
   *   - 成功：status='failed' + error_message='使用者取消' + audit log (action='CANCEL')
   *   - 注意：背景 pipeline 不會立即中斷（Stage 1~4 尚未實作 cancellation token），
   *     但 status 已標記，下一輪 polling 即會收到 failed。
   *
   * @throws 404 ASSIGNMENT_RUN_NOT_FOUND
   * @throws 422 ASSIGNMENT_RUN_NOT_CANCELLABLE
   */
  async cancelRun(runId: string, actorId: string): Promise<RunSummary> {
    const row = await this.runRepo.findOne({ where: { run_id: runId } });
    if (!row) {
      throw new NotFoundException({
        error: ERROR_CODES.ASSIGNMENT_RUN_NOT_FOUND,
        message: ERROR_MESSAGES.ASSIGNMENT_RUN_NOT_FOUND,
      });
    }
    if (row.status !== 'pending' && row.status !== 'running') {
      throw new UnprocessableEntityException({
        error: ERROR_CODES.ASSIGNMENT_RUN_NOT_CANCELLABLE,
        message: ERROR_MESSAGES.ASSIGNMENT_RUN_NOT_CANCELLABLE,
        details: [{ currentStatus: row.status }],
      });
    }
    const now = new Date();
    row.status = 'failed';
    row.error_message = '使用者取消';
    row.finished_at = now;
    await this.runRepo.save(row);

    // 寫 audit log
    try {
      await this.auditRepo.save(
        this.auditRepo.create({
          entity_type: 'assignment_run',
          entity_id: runId,
          action: 'CANCEL',
          actor_id: actorId,
          actor_name: actorId,
          before_value: null,
          after_value: { status: 'failed', errorMessage: '使用者取消' },
          ip_address: null,
          created_at: now,
        } as Partial<AssignmentAuditLog>),
      );
    } catch (err: any) {
      this.logger.error(
        `assignment_audit_log write failed: run=${runId}, action=CANCEL: ${err?.message ?? err}`,
      );
    }

    return this.toSummary(row);
  }

  // -------------------------------------------------------------------------
  // 內部
  // -------------------------------------------------------------------------

  private async writeAudit(
    runId: string,
    actorId: string,
    ym: string,
  ): Promise<void> {
    try {
      await this.auditRepo.save(
        this.auditRepo.create({
          entity_type: 'assignment_run',
          entity_id: runId,
          action: 'RUN',
          actor_id: actorId,
          actor_name: actorId,
          before_value: null,
          after_value: { project_workym: ym, triggered_status: 'pending' },
          ip_address: null,
          created_at: new Date(),
        } as Partial<AssignmentAuditLog>),
      );
    } catch (err: any) {
      // BR：稽核失敗僅記錄，不 rollback
      this.logger.error(
        `assignment_audit_log write failed: run=${runId}, action=RUN: ${err?.message ?? err}`,
      );
    }
  }

  /**
   * 觸發背景 Stage 1~4 pipeline。
   *
   * P1 B4 補完（2026-05-17）：串接 AssignmentRunPipelineService.runPipeline。
   *   - 非同步（setImmediate）；triggerRun() 已 return 202 後才執行
   *   - pipeline 內部自行更新 status='running' → 'completed' / 'failed'
   *   - pipeline 注入為 @Optional()，原 8 個 service unit tests 不依賴 pipeline 仍可通過
   */
  private kickoffPipeline(runId: string, ym: string): void {
    setImmediate(() => {
      if (!this.pipeline) {
        this.logger.log(
          `Pipeline hook: run=${runId} ym=${ym} (pipeline service not provided — placeholder mode)`,
        );
        return;
      }
      this.pipeline.runPipeline(runId, ym).catch((err: any) => {
        this.logger.error(
          `Pipeline kickoff failure: run=${runId} ym=${ym} err=${err?.message ?? err}`,
        );
      });
    });
  }

  private toSummary(r: AssignmentRun): RunSummary {
    return {
      runId: r.run_id,
      projectWorkym: r.project_workym,
      status: r.status,
      triggeredBy: r.triggered_by,
      triggeredAt: r.created_at,
      startedAt: r.started_at,
      finishedAt: r.finished_at,
      totalCases: r.total_cases,
      totalLists: r.total_lists,
      errorMessage: r.error_message,
    };
  }
}
