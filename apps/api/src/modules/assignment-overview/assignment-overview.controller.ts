import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import type { AssignmentOverviewResponse } from './assignment-overview.types';
import { AuthGuard } from '@/common/guards/auth.guard';
import { DirectorGuard } from '@/common/guards/director.guard';
import { DirectorOrSectionChiefGuard } from '@/common/guards/director-or-section-chief.guard';
import { RequireDirectorOrSectionChief } from '@/common/decorators/business-role.decorator';
import { SystemService } from '@/modules/system/system.service';
import type { ActorLike } from '@/modules/assignment-list/stage0-estimate.service';
import { AssignmentOverviewService } from './assignment-overview.service';
import { OverviewQueryDto } from './dto/overview-query.dto';

/**
 * F111 / AD-E07-46 §3.3 — 分派總覽唯讀聚合端點。
 *
 * class 級 guard 組合比照 Stage0EstimateController（AuthGuard → DirectorOrSectionChiefGuard →
 * DirectorGuard + @RequireDirectorOrSectionChief()）；controller 為純讀端點，method 無
 * @RequireDirector()（section_chief 亦可存取，AC-8）。**無** FeatureFlagGuard（OQ-F111-04）。
 */
@Controller('assignment')
@UseGuards(AuthGuard, DirectorOrSectionChiefGuard, DirectorGuard)
@RequireDirectorOrSectionChief()
export class AssignmentOverviewController {
  constructor(
    private readonly service: AssignmentOverviewService,
    private readonly systemService: SystemService,
  ) {}

  @Get('overview')
  async getOverview(
    @Request() req: { user?: ActorLike | null },
    @Query() query: OverviewQueryDto,
  ): Promise<AssignmentOverviewResponse> {
    const selectedYm = query.ym ?? this.systemService.getCurrentWorkYm();
    return this.service.getOverview(selectedYm, req.user ?? null);
  }
}
