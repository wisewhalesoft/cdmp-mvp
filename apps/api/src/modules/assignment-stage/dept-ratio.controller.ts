import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '@/common/guards/auth.guard';
import { DirectorGuard } from '@/common/guards/director.guard';
import { RequireDirector } from '@/common/decorators/business-role.decorator';
import { FeatureFlagGuard } from '@/common/feature-flags/feature-flag.guard';
import { RequireFeatureFlag } from '@/common/feature-flags/feature-flag.decorator';
import { AssignmentListController } from '@/modules/assignment-list/assignment-list.controller';
import { DeptRatioService } from './dept-ratio.service';
import { SetDeptRatioDto } from './dto/set-dept-ratio.dto';

/**
 * F079 v1.2 — 部門比例設定 Controller
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
  constructor(private readonly service: DeptRatioService) {}

  @Get(':listNo')
  async getDeptRatios(@Param('listNo') listNo: string) {
    return this.service.getDeptRatios(listNo);
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
      AssignmentListController.computeCurrentWorkYm(),
    );
  }
}
