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
import { Stage0EstimateService } from './stage0-estimate.service';

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
  constructor(private readonly service: Stage0EstimateService) {}

  static computeCurrentWorkYm(now: Date = new Date()): string {
    const override = process.env.OVERRIDE_CURRENT_WORK_YM;
    if (override && /^\d{6}$/.test(override)) return override;
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    return `${y}${String(m).padStart(2, '0')}`;
  }

  @Get('stage0/daily-estimate')
  @RequireDirector()
  async dailyEstimate(@Query('ym') ym?: string) {
    const effectiveYm = ym ?? Stage0EstimateController.computeCurrentWorkYm();
    return this.service.calculateDailyEstimate(effectiveYm);
  }

  @Get('list-definitions/:listNo/estimate')
  @RequireDirector()
  async estimateListCount(@Param('listNo') listNo: string) {
    return this.service.estimateListCount(listNo);
  }
}
