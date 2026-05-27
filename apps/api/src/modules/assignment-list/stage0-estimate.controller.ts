import {
  Controller,
  Get,
  Param,
  Query,
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
import {
  Stage0EstimateService,
  type CalendarSource,
} from './stage0-estimate.service';

/**
 * F049 v1.0 — Stage 0 每日估算 + 單一 LIST_NO 試算 Controller
 *
 * 路由：
 *   - GET /api/v1/assignment/stage0/daily-estimate?ym=YYYYMM   → DirectorGuard
 *   - GET /api/v1/assignment/list-definitions/:listNo/estimate → DirectorGuard
 *
 * 權限（F049 §5 / F002 §4.6.2）：月跑前置試算為部長專屬。
 */
@Controller('assignment')
@UseGuards(AuthGuard, DirectorOrSectionChiefGuard, DirectorGuard)
@RequireDirectorOrSectionChief()
export class Stage0EstimateController {
  constructor(
    private readonly service: Stage0EstimateService,
    // F097 / AD-E07-27 §27.3：current_work_ym 計算收斂至 SystemService
    private readonly systemService: SystemService,
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

  @Get('list-definitions/:listNo/estimate')
  @RequireDirector()
  async estimateListCount(@Param('listNo') listNo: string) {
    return this.service.estimateListCount(listNo);
  }
}
