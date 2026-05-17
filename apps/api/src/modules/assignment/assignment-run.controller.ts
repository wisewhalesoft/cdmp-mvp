import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '@/common/guards/auth.guard';
import { DirectorGuard } from '@/common/guards/director.guard';
import { DirectorOrSectionChiefGuard } from '@/common/guards/director-or-section-chief.guard';
import {
  RequireDirector,
  RequireDirectorOrSectionChief,
} from '@/common/decorators/business-role.decorator';
import { FeatureFlagGuard } from '@/common/feature-flags/feature-flag.guard';
import { RequireFeatureFlag } from '@/common/feature-flags/feature-flag.decorator';
import { AssignmentRunService } from './services/assignment-run.service';
import { AssignmentRunSnapshotService } from './services/assignment-run-snapshot.service';
import { AssignmentRunReportService } from './services/assignment-run-report.service';
import { MonthlyRunReadinessService } from './services/monthly-run-readiness.service';
import { TriggerRunDto } from './dto/trigger-run.dto';
import { ExportQueryDto } from './dto/export-query.dto';
import { SnapshotQueryDto } from './dto/snapshot-query.dto';
import { CompareRunsQueryDto } from './dto/compare-runs-query.dto';

/**
 * F061~F067 — 月跑觸發 + 歷史 + 詳情 + 摘要 + 匯出 + 比對 Controller
 *
 * 路由前綴：`/api/v1/assignment/runs`
 *
 * 路由列表：
 *   - POST   /                          F061 觸發月跑（DirectorGuard）
 *   - GET    /                          F065 歷史清單（DirectorOrSectionChief）
 *   - GET    /compare?runA=&runB=       F067 比對差異（DirectorOrSectionChief）
 *   - GET    /:runId                    F062 進度頁（DirectorOrSectionChief）
 *   - GET    /:runId/summary            F063 結果摘要（DirectorOrSectionChief）
 *   - GET    /:runId/export?format=csv  F064 匯出（DirectorOrSectionChief）
 *   - GET    /:runId/snapshot           F066 三份快照（DirectorOrSectionChief）
 *   - GET    /:runId/snapshot/:type     F066 單份快照（DirectorOrSectionChief）
 *
 * 路由順序：`/compare` 必須在 `/:runId` 之前，避免 path 攔截（NestJS 採宣告順序註冊）。
 *
 * 權限（F002 §4.6.2 / AD-E07 v3.0）：
 *   - POST /runs → DirectorGuard（部長專屬）
 *   - 其他 GET → DirectorOrSectionChiefGuard（部長或處長）
 */
@Controller('assignment/runs')
@UseGuards(AuthGuard, FeatureFlagGuard, DirectorOrSectionChiefGuard, DirectorGuard)
@RequireDirectorOrSectionChief()
export class AssignmentRunController {
  constructor(
    private readonly service: AssignmentRunService,
    private readonly snapshotService: AssignmentRunSnapshotService,
    private readonly reportService: AssignmentRunReportService,
    private readonly readinessService: MonthlyRunReadinessService,
  ) {}

  /**
   * F049 / F050 / F051 / F052 對齊：current_work_ym 計算
   */
  static computeCurrentWorkYm(now: Date = new Date()): string {
    const override = process.env.OVERRIDE_CURRENT_WORK_YM;
    if (override && /^\d{6}$/.test(override)) return override;
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    return `${y}${String(m).padStart(2, '0')}`;
  }

  // -------------------------------------------------------------------------
  // F061 — POST 觸發月跑
  // -------------------------------------------------------------------------

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @RequireDirector()
  @RequireFeatureFlag('ENABLE_E07_REFACTOR_PHASE3')
  async triggerRun(@Body() _dto: TriggerRunDto, @Req() req: any) {
    const ym = AssignmentRunController.computeCurrentWorkYm();
    return this.service.triggerRun(ym, req.user.userId);
  }

  // -------------------------------------------------------------------------
  // F065 — GET 月跑歷史清單
  // -------------------------------------------------------------------------

  @Get()
  async listRuns(@Query('ym') ym?: string) {
    const rows = await this.service.listRuns({ ym });
    return { runs: rows };
  }

  // -------------------------------------------------------------------------
  // F061 Phase 2 — GET 月跑前置條件就緒度（必須在 :runId 之前）
  // -------------------------------------------------------------------------

  @Get('readiness')
  async getReadiness(@Query('ym') ym?: string) {
    const effectiveYm = ym ?? AssignmentRunController.computeCurrentWorkYm();
    return this.readinessService.calculateReadiness(effectiveYm);
  }

  // -------------------------------------------------------------------------
  // F067 — GET 比對差異（必須在 :runId 之前）
  // -------------------------------------------------------------------------

  @Get('compare')
  async compareRuns(
    @Query() query: CompareRunsQueryDto,
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    // F067 AC-3：export=xlsx → streaming xlsx 下載；其他 → JSON
    if (query.export === 'xlsx') {
      const out = await this.reportService.compareRunsExport(
        query.runA,
        query.runB,
        req.user?.userId,
        this.toActor(req.user),
      );
      res.setHeader('Content-Type', out.contentType);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${out.filename}"`,
      );
      res.send(out.body);
      return;
    }
    return this.reportService.compareRuns(
      query.runA,
      query.runB,
      this.toActor(req.user),
    );
  }

  // -------------------------------------------------------------------------
  // F062 — GET 單一月跑詳情（進度）
  // -------------------------------------------------------------------------

  @Get(':runId')
  async getRunById(@Param('runId') runId: string) {
    return this.service.getRunById(runId);
  }

  // -------------------------------------------------------------------------
  // F063 — GET 結果摘要
  // -------------------------------------------------------------------------

  @Get(':runId/summary')
  async getRunSummary(@Param('runId') runId: string, @Req() req: any) {
    return this.reportService.getSummary(runId, this.toActor(req.user));
  }

  // -------------------------------------------------------------------------
  // F064 — GET 匯出
  // -------------------------------------------------------------------------

  @Get(':runId/export')
  async exportRun(
    @Param('runId') runId: string,
    @Query() query: ExportQueryDto,
    @Req() req: any,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    const format = query.format ?? 'csv';
    const out = await this.reportService.exportResult(
      runId,
      format,
      req.user?.userId,
      this.toActor(req.user),
    );
    res.setHeader('Content-Type', out.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${out.filename}"`,
    );
    res.send(out.body);
  }

  // -------------------------------------------------------------------------
  // F066 — GET 快照詳情（三份 / 單份）
  // -------------------------------------------------------------------------

  @Get(':runId/snapshot')
  async getRunSnapshot(
    @Param('runId') runId: string,
    @Query() query: SnapshotQueryDto,
    @Req() req: any,
  ) {
    const actor = this.toActor(req.user);
    if (query.type) {
      return this.snapshotService.getSnapshotByType(runId, query.type, actor);
    }
    return this.snapshotService.getFullSnapshot(runId, actor);
  }

  @Get(':runId/snapshot/:type')
  async getRunSnapshotByType(
    @Param('runId') runId: string,
    @Param('type') type: string,
    @Req() req: any,
  ) {
    const actor = this.toActor(req.user);
    if (type !== 'config' && type !== 'input_list' && type !== 'result') {
      // 對齊 spec：未知 type 視為快照缺失 → 404 路徑由 service NotFoundException 處理
      return this.snapshotService.getSnapshotByType(
        runId,
        type as 'config' | 'input_list' | 'result',
        actor,
      );
    }
    return this.snapshotService.getSnapshotByType(runId, type, actor);
  }

  // -------------------------------------------------------------------------
  // F062 Phase 2 — POST 取消月跑（director only）
  // -------------------------------------------------------------------------

  @Post(':runId/cancel')
  @HttpCode(HttpStatus.OK)
  @RequireDirector()
  @RequireFeatureFlag('ENABLE_E07_REFACTOR_PHASE3')
  async cancelRun(@Param('runId') runId: string, @Req() req: any) {
    return this.service.cancelRun(runId, req.user.userId);
  }

  /**
   * 從 req.user 抽取 SectionChiefScopeService 所需的 ActorUser shape。
   */
  private toActor(user: any): {
    userId: string;
    role: string;
    businessRole?: string | null;
  } | null {
    if (!user || !user.userId) return null;
    return {
      userId: user.userId,
      role: user.role ?? 'user',
      businessRole: user.businessRole ?? null,
    };
  }
}
