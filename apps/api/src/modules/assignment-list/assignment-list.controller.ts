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
  UnprocessableEntityException,
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
import { SystemService } from '@/modules/system/system.service';
import { AssignmentListService } from './assignment-list.service';
import { CreateListDto } from './dto/create-list.dto';
import { UpdateListDto } from './dto/update-list.dto';
import { ListListsQueryDto } from './dto/list-lists-query.dto';
import { CopyDuplicateCheckQueryDto } from './dto/copy-duplicate-check-query.dto';

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
  constructor(
    private readonly service: AssignmentListService,
    // F097 / AD-E07-27 §27.3：current_work_ym 計算收斂至 SystemService（移除三 controller static copy）
    private readonly systemService: SystemService,
  ) {}

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
  // F118 v1.1 §5.1.1 / AD-E07-48 §5.1 — GET copy-duplicate-check
  //
  // 從上月複製「已複製過」判定（唯讀提示，不落表）。
  //
  // 唯讀端點：class 級 DirectorOrSectionChiefGuard，method 不加 @RequireDirector
  //   （比照 getFullSnapshot 慣例）；不套 FeatureFlagGuard /
  //   LIST_HISTORICAL_READONLY / ASSIGNMENT_RUN_ALREADY_RUNNING
  //   （I-F118-READONLY-JUDGE-01：不影響任何寫入路徑）。
  //
  // ⚠️ 路由排序：本字面路徑必須宣告於任何 @Get(':listNo...') 動態路由之前，
  //   否則 NestJS 會把 'copy-duplicate-check' 誤匹配為 :listNo。
  // -------------------------------------------------------------------------

  @Get('copy-duplicate-check')
  async copyDuplicateCheck(@Query() query: CopyDuplicateCheckQueryDto) {
    // AC-5：currentYm 由呼叫端帶入（F097 作業月語意），不由 SystemService 推導。
    const items = await this.service.checkCopyDuplicates(
      query.prevYm,
      query.currentYm,
    );
    return {
      prevYm: query.prevYm,
      currentYm: query.currentYm,
      items,
    };
  }

  // -------------------------------------------------------------------------
  // F050 v2.2 §6.2 — GET full-snapshot（US-131 Detail Drawer）
  //
  // 唯讀端點：class 級 DirectorOrSectionChiefGuard，method 不加 @RequireDirector。
  // 不套 FeatureFlagGuard / 不攔截 LIST_HISTORICAL_READONLY /
  //   ASSIGNMENT_RUN_ALREADY_RUNNING（spec §6.2 末段明定）。
  // 路由排序：宣告於 @Get(':listNo') 之前避免被通用路徑誤捕（雖目前無 :listNo route，預防未來增加）。
  // -------------------------------------------------------------------------

  @Get(':listNo/full-snapshot')
  async getFullSnapshot(
    @Param('listNo') listNo: string,
    @Query('excludeZeroRatio') excludeZeroRatio: string | undefined,
    @Req() req: any,
  ) {
    const actor = {
      userId: req.user.userId,
      role: req.user.role,
      businessRole: req.user.businessRole ?? null,
    };
    return this.service.getFullSnapshot(listNo, actor, {
      // 部門比例頁籤比照準備完成摘要，由 API 隱藏比例 = 0% 之部門。
      excludeZeroRatio: excludeZeroRatio === 'true' || excludeZeroRatio === '1',
    });
  }

  // -------------------------------------------------------------------------
  // F048 / F077 — GET
  // -------------------------------------------------------------------------

  @Get()
  async list(@Query() query: ListListsQueryDto, @Req() req: any) {
    const currentWorkYm = this.systemService.getCurrentWorkYm();
    const ym = query.ym ?? currentWorkYm;
    this.assertYmInRange(ym, currentWorkYm);

    const stages =
      typeof query.stage === 'string' && query.stage.length > 0
        ? query.stage.split(',').map((s) => s.trim()).filter(Boolean)
        : undefined;

    const includeDisabled =
      query.includeDisabled === true || query.includeDisabled === 'true';

    // F077 v1.3 §6 BR-4 / D3：傳入 actor 以套用 section_chief 轄區過濾
    const actor = {
      userId: req.user.userId,
      role: req.user.role,
      businessRole: req.user.businessRole ?? null,
    };

    const result = await this.service.listLists({
      ym,
      stages,
      includeDisabled,
      actor,
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
    const currentWorkYm = this.systemService.getCurrentWorkYm();
    // F097 fix：建立名單採用使用者選定的分派作業月份（target_work_ym），缺省 fallback 當月。
    let targetWorkYm = currentWorkYm;
    if (dto.workYm != null && dto.workYm !== '') {
      if (!/^\d{4}(0[1-9]|1[0-2])$/.test(dto.workYm)) {
        throw new UnprocessableEntityException({
          error: ERROR_CODES.WORK_YM_INVALID_FORMAT,
          message: ERROR_MESSAGES.WORK_YM_INVALID_FORMAT,
        });
      }
      targetWorkYm = dto.workYm;
    }
    this.assertYmInRange(targetWorkYm, currentWorkYm);
    this.assertNotHistorical(targetWorkYm, currentWorkYm);
    const actor = {
      userId: req.user.userId,
      ipAddress: req.ip ?? null,
    };
    return this.service.createList(dto, actor, targetWorkYm);
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
    const currentWorkYm = this.systemService.getCurrentWorkYm();
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
    const currentWorkYm = this.systemService.getCurrentWorkYm();
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
    const currentWorkYm = this.systemService.getCurrentWorkYm();
    const actor = {
      userId: req.user.userId,
      ipAddress: req.ip ?? null,
    };
    return this.service.disableList(listNo, actor, currentWorkYm);
  }
}
