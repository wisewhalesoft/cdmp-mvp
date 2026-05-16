import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@/common/guards/auth.guard';
import { DirectorGuard } from '@/common/guards/director.guard';
import { DirectorOrSectionChiefGuard } from '@/common/guards/director-or-section-chief.guard';
import {
  RequireDirector,
  RequireDirectorOrSectionChief,
} from '@/common/decorators/business-role.decorator';
import { AssignmentRunService } from './services/assignment-run.service';
import { TriggerRunDto } from './dto/trigger-run.dto';

/**
 * F061 v1.2 / F062 / F065 / F066 — 月跑觸發 + 歷史 + 詳情 Controller
 *
 * 路由前綴：`/api/v1/assignment/runs`
 *
 * 權限（F002 §4.6.2 / AD-E07 v3.0）：
 *   - POST /runs（觸發）→ DirectorGuard（部長專屬，F061 §5.1 + §3 前置條件 L48）
 *   - GET /runs（歷史清單）/ GET /runs/:runId（詳情）→ DirectorOrSectionChiefGuard
 *
 * 月跑併發保護 + 前置檢查由 service 層處理（AssignmentRunGuardService /
 * MonthlyRunReadinessService）。
 */
@Controller('assignment/runs')
@UseGuards(AuthGuard, DirectorOrSectionChiefGuard, DirectorGuard)
@RequireDirectorOrSectionChief()
export class AssignmentRunController {
  constructor(private readonly service: AssignmentRunService) {}

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
  // F061 v1.2 — POST 觸發月跑
  // -------------------------------------------------------------------------

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @RequireDirector()
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
  // F062 / F066 — GET 單一月跑詳情
  // -------------------------------------------------------------------------

  @Get(':runId')
  async getRunById(@Param('runId') runId: string) {
    return this.service.getRunById(runId);
  }
}
