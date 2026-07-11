import {
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';
import { User } from '@/database/entities/user.entity';
import { AssignmentRunGuardService } from './assignment-run-guard.service';
import { MonthlyRunReadinessService } from './monthly-run-readiness.service';
import { RunQueueProducer } from '../queue/run-queue.producer';
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
  /** F065 BR-5：triggered_by(UUID) → users.name 解析結果；查無對應 user 時為 null */
  triggeredByName?: string | null;
  triggeredAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  totalCases: number | null;
  totalLists: number | null;
  errorMessage: string | null;
  /**
   * F062 進度頁視覺化：由 status + total_cases 合成的粗粒度逐階段進度。
   * 僅 getRunById 附帶（listRuns 不需，避免清單 payload 膨脹）。
   */
  stages?: RunStageProgress[];
  totals?: RunProgressTotals;
}

/** F062 逐階段進度（合成值；後端目前無逐階段 checkpoint，見 attachProgressView） */
export interface RunStageProgress {
  name: string;
  status: AssignmentRun['status'];
  progressPercent: number;
  processedCount: number;
  totalCount: number;
}

/** F062 總體進度（合成值） */
export interface RunProgressTotals {
  processedCount: number;
  totalCount: number;
  progressPercent: number;
}

/**
 * F062 進度頁 5-step stepper 對應階段名。
 * ⚠️ 須與前端 run-progress-page.tsx `EXPECTED_STAGES` 的 name 完全一致，
 * 否則 buildStepperStages 對不上 → stepper 恆 pending。
 */
const PROGRESS_STAGE_NAMES = [
  'Stage 0',
  'Stage 1',
  'Stage 2',
  'Stage 3',
  'Stage 4',
] as const;

/**
 * AssignmentRunService — F061 月名單分派觸發 + F062/F065/F066 查詢
 *
 * 三大流程：
 *   - triggerRun(ym, actorId)：前置 → INSERT pending → audit RUN → 入列 pg-boss job（F098 P1，回 202）
 *   - listRuns({ ym? })：歷史月名單分派清單（F065）
 *   - getRunById(runId)：單一月名單分派詳情（F062 / F066）
 *
 * 前置條件（spec AC-1）：
 *   1. AssignmentRunGuardService.assertNoRunningRun(ym) — 同月併發保護（409）
 *   2. MonthlyRunReadinessService.calculateReadiness(ym) — 確認所有 active 名單 stage=ready
 *      - 無 ready 名單 → 422 NO_READY_LIST_FOUND
 *      - 部分名單未 ready → 422 ASSIGNMENT_RUN_PRECHECK_FAILED + details
 *
 * F098 / AD-E07-28 P1：pipeline 不再於本（API）程序執行，改入列 pg-boss job →
 *   獨立 cdmp-worker 容器消費（RunQueueConsumer → AssignmentRunPipelineService.runPipeline）。
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
    /**
     * F098 / AD-E07-28 P1：月名單分派入列 producer。triggerRun 改為「INSERT pending → 入列 → 回 202」，
     * 不再於 API 程序內呼叫 runPipeline（I-TRIGGER-01）。
     * @Optional：少數舊 unit test harness 未提供 producer（其 triggerRun 測試會自行提供 fake）。
     */
    @Optional() private readonly queueProducer?: RunQueueProducer,
    /**
     * F065 BR-5：triggered_by(UUID) → users.name 解析所需的 users repo。
     * @Optional：少數舊 unit test harness 未提供 User repo（缺漏時 graceful 跳過解析，
     * triggeredByName = null，不影響清單其餘欄位）。
     */
    @Optional()
    @InjectRepository(User)
    private readonly userRepo?: Repository<User>,
  ) {}

  /**
   * F061 v1.2 AC-1 + AC-2 + AC-6 / F097 AC-14：觸發月名單分派。
   *
   * F097（生效日期 = F097 部署日）：`ym` 參數即使用者選定之「目標分派月」（target_work_ym），
   * 由 controller 自 dto.workYm 傳入並通過格式驗證 + 過去月 guard；本服務直接寫入
   * `AssignmentRun.project_workym = ym`，**不再以 new Date() 自算執行月**。
   *
   * ⚠️ forward-only（歷史資料不回填，glossary §7 / AC-18）：F097 部署前既有歷史 run 之
   * `project_workym` 為「執行月」語意，與目標分派月不同；無可靠方式反推，業務決策為接受
   * 此語意混雜，**不進行任何資料回填或修正**，僅以本注釋 + CHANGELOG 標注邊界，不呈現給一般使用者。
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

    // F098 / AD-E07-28 P1 AC-1 / I-TRIGGER-01：入列 pg-boss job，立即回 202。
    //   不再 setImmediate(runPipeline)；pipeline 一律於 cdmp-worker 程序執行。
    //   入列在 pending INSERT + audit 之後（TS-F098-TRIG-003），確保 worker 取到 job 時 run 已存在。
    //   入列失敗（DB 不可用）→ 向上拋；不留下孤兒 pending（OQ-F098-01 / TS-F098-OQ-001）。
    if (this.queueProducer) {
      try {
        await this.queueProducer.send({ runId: saved.run_id, ym });
      } catch (err: any) {
        // 入列失敗：補償 — 標該 pending run 為 failed，避免孤兒 pending 卡住同月併發保護。
        this.logger.error(
          `enqueue failed: run=${saved.run_id} ym=${ym}: ${err?.message ?? err}`,
        );
        await this.runRepo.update(
          { run_id: saved.run_id },
          {
            status: 'failed',
            finished_at: new Date(),
            error_message: '月名單分派入列失敗，請重新觸發',
          },
        );
        throw err;
      }
    } else {
      // 防呆：正常部署 module 一律提供 producer；此分支僅出現於未注入 producer 的舊 test harness。
      this.logger.warn(
        `RunQueueProducer 未注入，run=${saved.run_id} ym=${ym} 未入列（測試 harness 或設定缺漏）`,
      );
    }

    return {
      runId: saved.run_id,
      status: 'pending',
      projectWorkym: ym,
      triggeredAt: saved.created_at,
    };
  }

  /**
   * F065：月名單分派歷史清單（可選 ym 過濾）
   */
  async listRuns(opts: { ym?: string } = {}): Promise<RunSummary[]> {
    const qb = this.runRepo
      .createQueryBuilder('r')
      .orderBy('r.created_at', 'DESC');
    if (opts.ym) {
      qb.where('r.project_workym = :ym', { ym: opts.ym });
    }
    const rows = await qb.getMany();
    const summaries = rows.map((r) => this.toSummary(r));
    await this.resolveTriggeredByNames(summaries);
    return summaries;
  }

  /**
   * F065 BR-5：批次將 summaries 的 triggered_by(UUID) join users.name → triggeredByName。
   *   - 單一 IN 查詢避免 N+1；查無對應 user 之 triggered_by → triggeredByName = null。
   *   - userRepo 未注入（舊 test harness）→ graceful 跳過（保持 toSummary 設的 null）。
   */
  private async resolveTriggeredByNames(summaries: RunSummary[]): Promise<void> {
    if (!this.userRepo || summaries.length === 0) return;
    const ids = Array.from(
      new Set(summaries.map((s) => s.triggeredBy).filter(Boolean)),
    );
    if (ids.length === 0) return;
    const users = await this.userRepo.find({
      where: { id: In(ids) },
      select: ['id', 'name'],
    });
    const nameById = new Map(users.map((u) => [u.id, u.name]));
    for (const s of summaries) {
      s.triggeredByName = nameById.get(s.triggeredBy) ?? null;
    }
  }

  /**
   * F062 / F066：單一月名單分派詳情
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
    const summary = this.toSummary(row);
    // F062：與 listRuns 一致解析 triggered_by(UUID) → users.name（進度頁「觸發者」欄顯示名稱而非 UUID）
    await this.resolveTriggeredByNames([summary]);
    // F062（方案 1）：附帶合成之逐階段 / 總體進度，供進度頁 stepper + 進度條 + 筆數渲染。
    this.attachProgressView(summary);
    return summary;
  }

  /**
   * F062（方案 1）：合成進度視圖。
   *
   * 背景：F098/pushdown 重構後，Stage 1~4 於 worker 內以原子 SQL 下推執行，
   * DB 無逐階段 checkpoint（assignment_run 無 stage/progress 欄位）。進度頁
   * （run-progress-page.tsx）之 stepper / 進度條 / 「X/Y 筆」全依賴 `stages` /
   * `totals`，而原 getRunById 從不回這兩欄 → 畫面恆卡 0% / 全 pending，即使跑完。
   *
   * 本法依 run `status` + `total_cases` 合成粗粒度進度：
   *   - pending   → 5 階段全 pending，0%
   *   - running   → 5 階段全 running，0%（無真實中途值，以 badge + spinner 表達進行中）
   *   - completed → 5 階段全 completed，100%，processed = total = total_cases
   *   - failed    → 5 階段全 failed，0%
   *
   * 若日後 pipeline 補逐階段 checkpoint（方案 2），改由真實資料覆寫此合成值即可。
   */
  private attachProgressView(s: RunSummary): void {
    const total = s.totalCases ?? 0;
    let stageStatus: AssignmentRun['status'];
    let processed: number;
    let percent: number;
    switch (s.status) {
      case 'completed':
        stageStatus = 'completed';
        processed = total;
        percent = 100;
        break;
      case 'failed':
        stageStatus = 'failed';
        processed = 0;
        percent = 0;
        break;
      case 'running':
        stageStatus = 'running';
        processed = 0;
        percent = 0;
        break;
      default:
        stageStatus = 'pending';
        processed = 0;
        percent = 0;
        break;
    }
    s.stages = PROGRESS_STAGE_NAMES.map((name) => ({
      name,
      status: stageStatus,
      progressPercent: percent,
      processedCount: processed,
      totalCount: total,
    }));
    s.totals = {
      processedCount: processed,
      totalCount: total,
      progressPercent: percent,
    };
  }

  /**
   * F062 Phase 2：使用者取消月名單分派
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

  private toSummary(r: AssignmentRun): RunSummary {
    return {
      runId: r.run_id,
      projectWorkym: r.project_workym,
      status: r.status,
      triggeredBy: r.triggered_by,
      triggeredByName: null,
      triggeredAt: r.created_at,
      startedAt: r.started_at,
      finishedAt: r.finished_at,
      totalCases: r.total_cases,
      totalLists: r.total_lists,
      errorMessage: r.error_message,
    };
  }
}
