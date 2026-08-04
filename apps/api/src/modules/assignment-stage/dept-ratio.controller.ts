import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '@/common/guards/auth.guard';
import { DirectorGuard } from '@/common/guards/director.guard';
import { RequireDirector } from '@/common/decorators/business-role.decorator';
import { FeatureFlagGuard } from '@/common/feature-flags/feature-flag.guard';
import { RequireFeatureFlag } from '@/common/feature-flags/feature-flag.decorator';
import { SystemService } from '@/modules/system/system.service';
import { DeptRatioService } from './dept-ratio.service';
import { SetDeptRatioDto } from './dto/set-dept-ratio.dto';

/** query string 布林旗標（沿用既有 'true' / '1' 慣例） */
function isTruthyFlag(value?: string): boolean {
  return value === 'true' || value === '1';
}

/**
 * F079 v1.2 / F117 v1.1 — 部門比例設定 Controller
 *
 * 路由：
 *   - GET  /api/v1/assignment/ratios/dept/{listNo}
 *   - PUT  /api/v1/assignment/ratios/dept/{listNo}
 *
 * 權限：DirectorGuard（admin / director）；處長 403 AUTH_FORBIDDEN
 * FeatureFlag：ENABLE_E07_REFACTOR_PHASE3（503 / FEATURE_NOT_ENABLED）
 */
@Controller('assignment/ratios/dept')
@UseGuards(AuthGuard, FeatureFlagGuard, DirectorGuard)
@RequireDirector()
@RequireFeatureFlag('ENABLE_E07_REFACTOR_PHASE3')
export class DeptRatioController {
  constructor(
    private readonly service: DeptRatioService,
    // F097 / AD-E07-27 §27.3：current_work_ym 取值改用 SystemService（行為不變）
    private readonly systemService: SystemService,
  ) {}

  /**
   * F117 §5.1：新增選用 query flag `requireDirector`（比照既有 `excludeZeroRatio` 之 API 層 flag 模式）。
   * 設定頁帶 true 以套用「有在職處長」三分類過濾；其餘既有消費端不帶（維持既有行為，AC-10）。
   */
  @Get(':listNo')
  async getDeptRatios(
    @Param('listNo') listNo: string,
    @Query('excludeZeroRatio') excludeZeroRatio?: string,
    @Query('requireDirector') requireDirector?: string,
  ) {
    return this.service.getDeptRatios(listNo, {
      excludeZeroRatio: isTruthyFlag(excludeZeroRatio),
      requireDirector: isTruthyFlag(requireDirector),
    });
  }

  @Put(':listNo')
  @HttpCode(HttpStatus.OK)
  async setDeptRatios(
    @Param('listNo') listNo: string,
    @Body() dto: SetDeptRatioDto,
    @Req() req: Request,
  ) {
    const user = (req as any).user;
    return this.service.setDeptRatios(
      listNo,
      dto,
      {
        userId: user.userId,
        ipAddress: req.ip ?? null,
      },
      this.systemService.getCurrentWorkYm(),
    );
  }
}
