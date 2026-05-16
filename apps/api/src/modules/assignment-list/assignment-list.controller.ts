import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  BadRequestException,
  Post,
  Put,
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
import { FeatureFlagGuard } from '@/common/feature-flags/feature-flag.guard';
import { RequireFeatureFlag } from '@/common/feature-flags/feature-flag.decorator';
import { ERROR_CODES, ERROR_MESSAGES } from '@/common/errors/error-codes';
import { AssignmentListService } from './assignment-list.service';
import { CreateListDto } from './dto/create-list.dto';
import { UpdateListDto } from './dto/update-list.dto';
import { ListListsQueryDto } from './dto/list-lists-query.dto';

/**
 * F048 v2.0 / F050 v2.0 / F051 v2.0 / F052 v2.0 / F077 v1.2 — M01 名單 CRUD Controller
 *
 * 路由前綴：`/api/v1/assignment/lists`
 *
 * 權限（F002 §4.6.2 / AD-E07 v3.0）：
 *   - GET（清單瀏覽）→ DirectorOrSectionChiefGuard
 *   - POST / PUT / DELETE（寫入）→ DirectorGuard + FeatureFlagGuard ENABLE_E07_REFACTOR_PHASE3
 *     + Service 層 assignmentRunGuard.assertNoRunningRun()
 *
 * 月份範圍：`current_work_ym ± 12`（F077 §6 BR-2）。歷史月份寫入回 403
 *   LIST_HISTORICAL_READONLY（F077 §6 BR-3）。
 */
@Controller('assignment/lists')
@UseGuards(
  AuthGuard,
  FeatureFlagGuard,
  DirectorOrSectionChiefGuard,
  DirectorGuard,
)
@RequireDirectorOrSectionChief()
export class AssignmentListController {
  constructor(private readonly service: AssignmentListService) {}

  /**
   * 計算當前作業月份。
   *
   * 規則：依 F077 §6 BR-1 / data-model.md current-work-ym rule：
   *   - 環境變數 `OVERRIDE_CURRENT_WORK_YM=YYYYMM` 強制覆蓋（測試 / 災難復原）
   *   - 否則：每月 1 號 0:00 切換為當月，即 `YYYYMM of today`
   */
  static computeCurrentWorkYm(now: Date = new Date()): string {
    const override = process.env.OVERRIDE_CURRENT_WORK_YM;
    if (override && /^\d{6}$/.test(override)) return override;
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    return `${y}${String(m).padStart(2, '0')}`;
  }

  /**
   * 計算 ym 是否在 current_work_ym ± 12 範圍內（含本月，共 25 月）。
   * 超出 → 400 INVALID_YM_RANGE
   */
  private assertYmInRange(ym: string, currentWorkYm: string): void {
    const toMonths = (s: string) =>
      parseInt(s.slice(0, 4), 10) * 12 + parseInt(s.slice(4, 6), 10);
    const diff = toMonths(ym) - toMonths(currentWorkYm);
    if (diff < -12 || diff > 12) {
      throw new BadRequestException({
        error: 'INVALID_YM_RANGE',
        message: 'ym 超出 current_work_ym ± 12 範圍',
      });
    }
  }

  /**
   * 歷史月份寫入攔截（F077 §6 BR-3）。
   */
  private assertNotHistorical(ym: string, currentWorkYm: string): void {
    if (ym < currentWorkYm) {
      throw new ForbiddenException({
        error: ERROR_CODES.LIST_HISTORICAL_READONLY,
        message: ERROR_MESSAGES.LIST_HISTORICAL_READONLY,
      });
    }
  }

  // -------------------------------------------------------------------------
  // F048 / F077 — GET
  // -------------------------------------------------------------------------

  @Get()
  async list(@Query() query: ListListsQueryDto) {
    const currentWorkYm = AssignmentListController.computeCurrentWorkYm();
    const ym = query.ym ?? currentWorkYm;
    this.assertYmInRange(ym, currentWorkYm);

    const stages =
      typeof query.stage === 'string' && query.stage.length > 0
        ? query.stage.split(',').map((s) => s.trim()).filter(Boolean)
        : undefined;

    const includeDisabled =
      query.includeDisabled === true || query.includeDisabled === 'true';

    const result = await this.service.listLists({
      ym,
      stages,
      includeDisabled,
    });

    return {
      ...result,
      currentWorkYm,
      isHistorical: ym < currentWorkYm,
      isFuture: ym > currentWorkYm,
    };
  }

  // -------------------------------------------------------------------------
  // F050 v2.0 — Create
  // -------------------------------------------------------------------------

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequireDirector()
  @RequireFeatureFlag('ENABLE_E07_REFACTOR_PHASE3')
  async create(@Body() dto: CreateListDto, @Req() req: any) {
    const currentWorkYm = AssignmentListController.computeCurrentWorkYm();
    const actor = {
      userId: req.user.userId,
      ipAddress: req.ip ?? null,
    };
    return this.service.createList(dto, actor, currentWorkYm);
  }

  // -------------------------------------------------------------------------
  // F051 v2.0 — Update（spec §6.1 用 PUT；保留 PATCH alias 待 FE 對接決定）
  // -------------------------------------------------------------------------

  @Put(':listNo')
  @RequireDirector()
  @RequireFeatureFlag('ENABLE_E07_REFACTOR_PHASE3')
  async update(
    @Param('listNo') listNo: string,
    @Body() dto: UpdateListDto,
    @Req() req: any,
  ) {
    const currentWorkYm = AssignmentListController.computeCurrentWorkYm();
    const actor = {
      userId: req.user.userId,
      ipAddress: req.ip ?? null,
    };
    return this.service.updateList(listNo, dto, actor, currentWorkYm);
  }

  // -------------------------------------------------------------------------
  // F052 v2.0 — Disable（spec §5.1 用 PUT /:listNo/disable，REST 語意保留）
  // -------------------------------------------------------------------------

  @Put(':listNo/disable')
  @RequireDirector()
  @RequireFeatureFlag('ENABLE_E07_REFACTOR_PHASE3')
  async disable(@Param('listNo') listNo: string, @Req() req: any) {
    const currentWorkYm = AssignmentListController.computeCurrentWorkYm();
    const actor = {
      userId: req.user.userId,
      ipAddress: req.ip ?? null,
    };
    return this.service.disableList(listNo, actor, currentWorkYm);
  }

  /**
   * 任務描述 B2 §1 提及 DELETE 語意（與 spec PUT /:listNo/disable 雙軌支援）。
   * 用戶任務以 DELETE 為主，spec 以 PUT/disable 為主；兩者都委派至 disableList。
   */
  @Delete(':listNo')
  @RequireDirector()
  @RequireFeatureFlag('ENABLE_E07_REFACTOR_PHASE3')
  async deleteList(@Param('listNo') listNo: string, @Req() req: any) {
    const currentWorkYm = AssignmentListController.computeCurrentWorkYm();
    const actor = {
      userId: req.user.userId,
      ipAddress: req.ip ?? null,
    };
    return this.service.disableList(listNo, actor, currentWorkYm);
  }
}
