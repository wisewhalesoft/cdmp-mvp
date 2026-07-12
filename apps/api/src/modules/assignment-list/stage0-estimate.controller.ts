import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@/common/guards/auth.guard';
import { DirectorGuard } from '@/common/guards/director.guard';
import { DirectorOrSectionChiefGuard } from '@/common/guards/director-or-section-chief.guard';
import {
  RequireDirector,
  RequireDirectorOrSectionChief,
} from '@/common/decorators/business-role.decorator';
import { SystemService } from '@/modules/system/system.service';
import { AssignmentListService } from './assignment-list.service';
import { PreviewHitCountDto } from './dto/preview-hit-count.dto';
import {
  Stage0EstimateService,
  type ActorLike,
  type CalendarSource,
} from './stage0-estimate.service';

/**
 * F049 — Stage 0 每日估算 + 單一 LIST_NO 試算 + 部門維度每日分派可行性 Controller
 *
 * 路由（權限 F049 §5 / §17 / F002 §4.6.2 / AD-E07-v3.6 §4 Guard 矩陣）：
 *   - GET stage0/daily-estimate         → @RequireDirector（v1.x 純 ratio 視圖，部長專屬）
 *   - GET stage0/dept-estimate          → class 級 DirectorOrSectionChief（處長唯讀，service 層 scope filter）
 *   - GET list-definitions/:listNo/estimate → class 級 DirectorOrSectionChief（BR-12，名單層總量無部門分解）
 *
 * class 級基底：AuthGuard + DirectorOrSectionChiefGuard + DirectorGuard +
 * @RequireDirectorOrSectionChief()（B2 標準模式）；method 以 @RequireDirector() 收緊為部長專屬。
 */
@Controller('assignment')
@UseGuards(AuthGuard, DirectorOrSectionChiefGuard, DirectorGuard)
@RequireDirectorOrSectionChief()
export class Stage0EstimateController {
  constructor(
    private readonly service: Stage0EstimateService,
    // F097 / AD-E07-27 §27.3：current_work_ym 計算收斂至 SystemService
    private readonly systemService: SystemService,
    // F050 v2.4 / US-176 §6.3：草稿命中筆數抽樣估算（同 module，複用既有 preview-hit-count 服務）
    private readonly listService: AssignmentListService,
  ) {}

  @Get('stage0/daily-estimate')
  @RequireDirector()
  async dailyEstimate(
    @Query('ym') ym?: string,
    @Query('calendarSource') calendarSource?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const effectiveYm = ym ?? this.systemService.getCurrentWorkYm();
    const source: CalendarSource =
      calendarSource === 'weekday-only' || calendarSource === 'all'
        ? calendarSource
        : 'weekday';
    return this.service.calculateDailyEstimate(effectiveYm, {
      calendarSource: source,
      startDate,
      endDate,
    });
  }

  /**
   * F049 v2.0 Part B（US-166~169 / AD-E07-v3.6 §4）：部門維度每日分派可行性矩陣。
   *
   * 授權放寬至 DirectorOrSectionChief（處長唯讀）；actor 透過 @Request() 傳入 service，
   * 由 service 層強制 dept scope filter（I-DEPT-SCOPE-01，安全邊界，非前端遮罩）。
   */
  @Get('stage0/dept-estimate')
  async deptEstimate(
    @Request() req: { user?: ActorLike | null },
    @Query('ym') ym?: string,
    @Query('calendarSource') calendarSource?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('listNo') listNo?: string,
  ) {
    const effectiveYm = ym ?? this.systemService.getCurrentWorkYm();
    const source: CalendarSource =
      calendarSource === 'weekday-only' || calendarSource === 'all'
        ? calendarSource
        : 'weekday';
    return this.service.computeDeptEstimate(effectiveYm, {
      calendarSource: source,
      startDate,
      endDate,
      listNo,
      actor: req.user ?? null,
    });
  }

  @Get('list-definitions/:listNo/estimate')
  async estimateListCount(@Param('listNo') listNo: string) {
    return this.service.estimateListCount(listNo);
  }

  /**
   * F050 v2.4 §6.3 POST /api/v1/assignment/list-definitions/preview-hit-count（US-176 / AD-E07-45）
   *
   * 草稿階段（尚未儲存，無 listNo）依 condition_payload 抽樣估算命中筆數。
   * 權限：DirectorGuard + @RequireDirector()（部長 / Admin；建立草稿頁僅此二角色可達，
   *   與 F055/F056 preview 之 DirectorOrSectionChief **不同**，處長 → 403）。
   * 讀鎖豁免：不攔截 ASSIGNMENT_RUN_ALREADY_RUNNING（service 層本就不呼叫月跑鎖，AD-E07-45 §6）。
   */
  @Post('list-definitions/preview-hit-count')
  @RequireDirector()
  async previewHitCount(@Body() dto: PreviewHitCountDto) {
    // AGE 衍生欄位基準日 = target_work_ym 首日（沿用系統既有 AssignmentWorkYm context）。
    const ym = this.systemService.getDefaultTargetWorkYm();
    const workdt = new Date(
      Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(4, 6)) - 1, 1),
    );
    return this.listService.previewHitCount(
      dto.conditionPayload as any,
      workdt,
    );
  }
}
