import { Injectable, Logger } from '@nestjs/common';
import type {
  AssignmentOverviewResponse,
  DialingVolumeBlock,
  MonthTotal,
  OverviewBlock,
  OverviewBlockError,
  OverviewScope,
  RecentRunBlock,
  RunReadinessBlock,
  StageTodoBlock,
} from './assignment-overview.types';
import { AssignmentListService } from '@/modules/assignment-list/assignment-list.service';
import {
  Stage0EstimateService,
  type ActorLike,
  type Stage0DeptEstimateResult,
} from '@/modules/assignment-list/stage0-estimate.service';
import { MonthlyRunReadinessService } from '@/modules/assignment/services/monthly-run-readiness.service';
import { AssignmentRunService } from '@/modules/assignment/services/assignment-run.service';
import { AssignmentRunReportService } from '@/modules/assignment/services/assignment-run-report.service';
import { SystemService } from '@/modules/system/system.service';
import {
  OVERVIEW_BLOCK_ERROR_MESSAGE,
  deriveDeptDistribution,
  sumWorkdayCases,
  wrapBlock,
} from './assignment-overview.util';

/**
 * §3.4 — 防禦性 fallback：僅在 wrapBlock 本身意外 reject（正常路徑不會）時，
 * 對應各區塊之錯誤常數。順序須對齊 getOverview 內 Promise.allSettled 之四區塊順序。
 */
const FALLBACK_ERROR_BLOCKS: OverviewBlockError[] = (
  [
    'STAGE_TODO_UNAVAILABLE',
    'RUN_READINESS_UNAVAILABLE',
    'DIALING_VOLUME_UNAVAILABLE',
    'RECENT_RUN_UNAVAILABLE',
  ] as const
).map((errorCode) => ({
  error: true as const,
  errorCode,
  message: OVERVIEW_BLOCK_ERROR_MESSAGE,
}));

/**
 * AssignmentOverviewService（F111 / AD-E07-46）— 純組合層（composition-only）。
 *
 * I-OVW-COMPOSE-ONLY-01：建構子**只**注入既有 5 組唯讀 service + SystemService，
 * 不注入任何 TypeORM repo / 資料連線；不執行任何 SQL。
 * I-OVW-BLOCK-ISOLATE-01：四區塊各自 wrapBlock 包裝、Promise.allSettled 併行，
 * 任一失敗僅該區塊 { error:true }，其餘正常、HTTP 整體恆 200。
 * I-OVW-SCOPE-PASSTHROUGH-01：僅透傳 actor 給下游服務，不自行實作 deptCode 過濾。
 */
@Injectable()
export class AssignmentOverviewService {
  private readonly logger = new Logger(AssignmentOverviewService.name);

  constructor(
    private readonly listService: AssignmentListService,
    private readonly readinessService: MonthlyRunReadinessService,
    private readonly stage0Service: Stage0EstimateService,
    private readonly runService: AssignmentRunService,
    private readonly reportService: AssignmentRunReportService,
    private readonly systemService: SystemService,
  ) {}

  async getOverview(
    selectedYm: string,
    actor: ActorLike | null,
  ): Promise<AssignmentOverviewResponse> {
    const currentWorkYm = this.systemService.getCurrentWorkYm();
    const targetWorkYm = this.systemService.getDefaultTargetWorkYm();
    // resolveScope 為純函式（無 I/O）；scope.deptCode 於區塊三成功後回填（§3.9）。
    const scope = this.resolveScope(actor);

    const settled = await Promise.allSettled([
      wrapBlock(
        () => this.fetchStageTodoBlock(selectedYm, actor),
        'STAGE_TODO_UNAVAILABLE',
        this.logger,
      ),
      wrapBlock(
        () => this.fetchRunReadinessBlock(selectedYm, scope),
        'RUN_READINESS_UNAVAILABLE',
        this.logger,
      ),
      wrapBlock(
        () =>
          this.fetchDialingVolumeBlock(
            selectedYm,
            currentWorkYm,
            targetWorkYm,
            actor,
            scope,
          ),
        'DIALING_VOLUME_UNAVAILABLE',
        this.logger,
      ),
      wrapBlock(
        () => this.fetchRecentRunBlock(selectedYm, actor),
        'RECENT_RUN_UNAVAILABLE',
        this.logger,
      ),
    ]);

    const stageTodo = this.settledValue(settled[0], FALLBACK_ERROR_BLOCKS[0]);
    const runReadiness = this.settledValue(settled[1], FALLBACK_ERROR_BLOCKS[1]);
    const dialingVolume = this.settledValue(
      settled[2],
      FALLBACK_ERROR_BLOCKS[2],
    );
    const recentRun = this.settledValue(settled[3], FALLBACK_ERROR_BLOCKS[3]);

    return {
      selectedYm,
      currentWorkYm,
      targetWorkYm,
      scope,
      stageTodo,
      runReadiness,
      dialingVolume,
      recentRun,
    };
  }

  private settledValue<T>(
    res: PromiseSettledResult<OverviewBlock<T>>,
    fallback: OverviewBlockError,
  ): OverviewBlock<T> {
    return res.status === 'fulfilled' ? res.value : fallback;
  }

  /** §3.9 — 角色分類同步判定；deptCode 留 null（真實轄區代號由區塊三回填）。 */
  private resolveScope(actor: ActorLike | null): OverviewScope {
    const role: OverviewScope['role'] =
      actor?.role === 'admin'
        ? 'admin'
        : actor?.businessRole === 'section_chief'
          ? 'section_chief'
          : 'director';
    return { role, deptCode: null, scoped: role === 'section_chief' };
  }

  /** §3.5 — 區塊一：一次 listLists（includeDisabled）同時滿足 hasAnyList（含 disabled）與 notReadyLists（僅 active）。 */
  private async fetchStageTodoBlock(
    ym: string,
    actor: ActorLike | null,
  ): Promise<StageTodoBlock> {
    const { lists, stageCounts } = await this.listService.listLists({
      ym,
      includeDisabled: true,
      actor: actor as never,
    });
    const notReadyLists = lists
      .filter((l) => l.status === 'active' && l.stage !== 'ready')
      .map((l) => ({
        listNo: l.listNo as string,
        listNm: l.listNm as string,
        stage: l.stage as string,
      }));
    return {
      stageCounts: stageCounts as StageTodoBlock['stageCounts'],
      notReadyLists,
      notReadyCount: notReadyLists.length,
      hasAnyList: lists.length > 0,
    };
  }

  /** §3.6 — 區塊二：calculateReadiness(ym)（不吃 actor，OQ-F111-03）；canNavigateToTrigger 僅依 scope.role。 */
  private async fetchRunReadinessBlock(
    ym: string,
    scope: OverviewScope,
  ): Promise<RunReadinessBlock> {
    const r = await this.readinessService.calculateReadiness(ym);
    return {
      totalActiveLists: r.totalActiveLists,
      readyCount: r.readyCount,
      allReady: r.allReady,
      notReadyLists: r.notReadyLists,
      monthlyRunStatus: r.monthlyRunStatus,
      scoringActive: r.scoringActive,
      etlStatus: r.etlStatus,
      sourcesAllHaveData: r.sourcesAllHaveData,
      emptySourceTables: r.emptySourceTables,
      canNavigateToTrigger: scope.role !== 'section_chief', // AC-8
    };
  }

  /** §3.7 — 區塊三：對 {current,target,selected} 唯一 ym 去重（≤3 次 computeDeptEstimate）。 */
  private async fetchDialingVolumeBlock(
    selectedYm: string,
    currentWorkYm: string,
    targetWorkYm: string,
    actor: ActorLike | null,
    scope: OverviewScope,
  ): Promise<DialingVolumeBlock> {
    const uniqueYms = Array.from(
      new Set([currentWorkYm, targetWorkYm, selectedYm]),
    );
    const resultByYm = new Map<string, Stage0DeptEstimateResult>();
    await Promise.all(
      uniqueYms.map(async (ym) => {
        resultByYm.set(
          ym,
          await this.stage0Service.computeDeptEstimate(ym, { actor }),
        );
      }),
    );

    const selected = resultByYm.get(selectedYm) as Stage0DeptEstimateResult;
    // §3.9 附註：回填頂層 scope.deptCode（僅在區塊三成功時；失敗則保持 null，見 §11.3 / RISK-001）。
    scope.deptCode = selected.scope.deptCode ?? null;

    const toMonthTotal = (ym: string): MonthTotal => {
      const r = resultByYm.get(ym) as Stage0DeptEstimateResult;
      const hasActiveLists = r.departments.length > 0; // §3.7.2
      return {
        ym,
        total: hasActiveLists ? sumWorkdayCases(r) : null, // empty≠zero（BR-4）
        hasActiveLists,
        scopedToDept: scope.scoped,
      };
    };

    return {
      headline: {
        currentMonth: toMonthTotal(currentWorkYm),
        nextMonth: toMonthTotal(targetWorkYm),
      },
      selected: {
        ym: selected.ym,
        mode: selected.mode,
        calendarSource: selected.calendarSource,
        startDate: selected.startDate,
        endDate: selected.endDate,
        departments: selected.departments,
        days: selected.days,
        threshold: selected.threshold,
        deptDistribution: deriveDeptDistribution(selected), // §3.7.3
        warnings: selected.warnings,
        poolCount: selected.poolCount,
        poolWarning: selected.poolWarning,
      },
    };
  }

  /** §3.8 — 區塊四：最新 completed（finishedAt desc，次選 triggeredAt）→ getSummary；否則兩態空狀態（BR-8）。 */
  private async fetchRecentRunBlock(
    ym: string,
    actor: ActorLike | null,
  ): Promise<RecentRunBlock> {
    const runs = await this.runService.listRuns({ ym }); // created_at DESC
    const completed = runs
      .filter((r) => r.status === 'completed')
      .sort((a, b) => {
        const at = (a.finishedAt ?? a.triggeredAt).getTime();
        const bt = (b.finishedAt ?? b.triggeredAt).getTime();
        return bt - at; // finishedAt desc、缺值退回 triggeredAt（BR-5）
      });

    if (completed.length === 0) {
      // BR-8 兩態：noRun（runs 全空）vs noCompletedRun（有 run 但無 completed）
      if (runs.length === 0) {
        return {
          hasCompletedRun: false,
          emptyReason: 'noRun',
          latestRunStatus: null,
          latestRunId: null,
        };
      }
      return {
        hasCompletedRun: false,
        emptyReason: 'noCompletedRun',
        // runs[0] 即該月最新一筆（listRuns 已 created_at DESC，§3.8）
        latestRunStatus: runs[0].status as 'failed' | 'running' | 'pending',
        latestRunId: runs[0].runId,
      };
    }

    const latest = completed[0];
    const summary = await this.reportService.getSummary(
      latest.runId,
      actor as never,
    );
    return {
      hasCompletedRun: true,
      runId: summary.runId,
      projectWorkym: summary.projectWorkym,
      finishedAt: summary.finishedAt ? summary.finishedAt.toISOString() : null,
      totalCases: summary.totalCases,
      coverageRate: summary.coverageRate,
      emplCount: summary.emplCount,
      deptSummary: summary.deptSummary,
      levelDistribution: summary.levelDistribution,
      tierDistribution: summary.tierDistribution,
    };
  }
}
