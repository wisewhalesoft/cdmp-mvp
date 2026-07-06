import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
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
import { FeatureFlagGuard } from '@/common/feature-flags/feature-flag.guard';
import { RequireFeatureFlag } from '@/common/feature-flags/feature-flag.decorator';
import { PooldataFieldOptionService } from '../services/pooldata-field-option.service';
import { CreatePooldataOptionDto } from '../dto/create-pooldata-option.dto';
import { UpdatePooldataOptionDto } from '../dto/update-pooldata-option.dto';
import { DeactivatePooldataOptionDto } from '../dto/deactivate-pooldata-option.dto';
import { ListPooldataOptionsQueryDto } from '../dto/list-pooldata-options-query.dto';
import { ReorderPooldataOptionsDto } from '../dto/reorder-pooldata-options.dto';

/**
 * F076 v1.3：類別型欄位可選值 Controller
 *
 * 路由前綴：`/api/v1/pooldata-fields/:columnName/options`
 *
 * 權限（依 F076 §5 / AD-E07 v3.0）：
 *   - class 級 AuthGuard + DirectorOrSectionChiefGuard + DirectorGuard
 *   - 寫入端點額外標 @RequireDirector()
 *
 * 端點：
 *   - GET   /                          F076 §5.1 列表（含 ?active / ?includeInactive）
 *   - POST  /                          F076 §5.2 新增
 *   - PATCH /:optionValue              F076 §5.3 重新啟用（DTO 限 isActive=true）
 *   - PATCH /:optionValue/deactivate   F076 §5.4 停用專屬（reason 必填 ≤200 字）
 *   - PATCH /reorder                   F076 §5.5 排序（orderedValues 完整陣列；先於 :optionValue 註冊）
 */
@Controller('api/v1/pooldata-fields/:columnName/options')
@UseGuards(AuthGuard, FeatureFlagGuard, DirectorOrSectionChiefGuard, DirectorGuard)
@RequireDirectorOrSectionChief()
export class PooldataFieldOptionController {
  constructor(private readonly service: PooldataFieldOptionService) {}

  // ===== F076 §5.1 =====

  @Get()
  async listOptions(
    @Param('columnName') columnName: string,
    @Query() query: ListPooldataOptionsQueryDto,
  ) {
    return this.service.listOptions(columnName, {
      active: query.active,
      includeInactive: query.includeInactive,
    });
  }

  // ===== F076 §5.2 =====

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequireDirector()
  @RequireFeatureFlag('ENABLE_E07_REFACTOR_PHASE3')
  async createOption(
    @Param('columnName') columnName: string,
    @Body() dto: CreatePooldataOptionDto,
    @Req() req: any,
  ) {
    const actor = {
      userId: req.user.userId,
      ipAddress: req.ip ?? null,
    };
    return this.service.createOption(
      columnName,
      { optionValue: dto.optionValue, optionLabel: dto.optionLabel },
      actor,
    );
  }

  // ===== F076 §5.5 — 排序（先註冊以免被 :optionValue 攔截）=====

  @Patch('reorder')
  @RequireDirector()
  @RequireFeatureFlag('ENABLE_E07_REFACTOR_PHASE3')
  async reorderOptions(
    @Param('columnName') columnName: string,
    @Body() dto: ReorderPooldataOptionsDto,
    @Req() req: any,
  ) {
    const actor = {
      userId: req.user.userId,
      ipAddress: req.ip ?? null,
    };
    return this.service.reorderOptions(columnName, dto.orderedValues, actor);
  }

  // ===== F076 §5.4 — deactivate 專屬（先註冊以免被 :optionValue 攔截）=====

  @Patch(':optionValue/deactivate')
  @RequireDirector()
  @RequireFeatureFlag('ENABLE_E07_REFACTOR_PHASE3')
  async deactivateOption(
    @Param('columnName') columnName: string,
    @Param('optionValue') optionValue: string,
    @Body() dto: DeactivatePooldataOptionDto,
    @Req() req: any,
  ) {
    const actor = {
      userId: req.user.userId,
      ipAddress: req.ip ?? null,
    };
    return this.service.deactivateOption(
      columnName,
      optionValue,
      { reason: dto.reason },
      actor,
    );
  }

  // ===== F076 §5.3 — 啟用用途 =====

  @Patch(':optionValue')
  @RequireDirector()
  @RequireFeatureFlag('ENABLE_E07_REFACTOR_PHASE3')
  async reactivateOption(
    @Param('columnName') columnName: string,
    @Param('optionValue') optionValue: string,
    @Body() dto: UpdatePooldataOptionDto,
    @Req() req: any,
  ) {
    const actor = {
      userId: req.user.userId,
      ipAddress: req.ip ?? null,
    };
    return this.service.reactivateOption(
      columnName,
      optionValue,
      { optionLabel: dto.optionLabel },
      actor,
    );
  }
}
