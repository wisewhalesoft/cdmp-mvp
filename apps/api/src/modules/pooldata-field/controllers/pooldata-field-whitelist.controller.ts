import {
  Body,
  Controller,
  Delete,
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
import { PooldataFieldWhitelistService } from '../services/pooldata-field-whitelist.service';
import { CreatePooldataFieldDto } from '../dto/create-pooldata-field.dto';
import { UpdatePooldataFieldDto } from '../dto/update-pooldata-field.dto';
import { ListPooldataFieldsQueryDto } from '../dto/list-pooldata-fields-query.dto';

/**
 * F075 v1.3 / v1.4：POOLDATA 篩選欄位白名單 Controller
 *
 * 路由前綴：`/api/v1/pooldata-fields`
 *
 * 權限（依 F075 §5 / AD-E07 v3.0）：
 *   - class 級 AuthGuard + DirectorOrSectionChiefGuard + DirectorGuard
 *   - class 級 `@RequireDirectorOrSectionChief()`：所有方法至少需 director/section_chief/admin
 *   - GET 端點未額外標 → 走 DirectorOrSectionChiefGuard
 *   - POST / PATCH / DELETE 額外標 `@RequireDirector()` → 走 DirectorGuard
 *   - v1.4 GET /available-columns 額外標 `@RequireDirector()` + FeatureFlag → 與寫入流程一致
 *
 * 端點：
 *   - GET    /available-columns                F075 v1.4 §5.5 新增 Modal dropdown 資料源（DirectorGuard + FeatureFlag）
 *   - GET    /                                 F075 §5.1 列表
 *   - GET    /:columnName/active-options-count F075 v1.3 UI 預查（confirm Modal 顯示 N）
 *   - POST   /                                 F075 §5.2 新增
 *   - PATCH  /:columnName                      F075 §5.3 編輯（含 F076-C 軟停用級聯）
 *   - DELETE /:columnName                      F075 §5.4 軟刪除（is_active=false）
 *
 * 路由排序回歸（architecture-spec v2.12 / NestJS 靜態路由優先規則）：
 *   `@Get('available-columns')` 必須宣告於 `@Get(':columnName/active-options-count')` 與其他
 *   動態 `:columnName` 路由之前；否則 'available-columns' 會被誤判為 columnName 路徑參數。
 *   對應回歸測試：TS-F075-E2E-008。
 */
@Controller('api/v1/pooldata-fields')
@UseGuards(AuthGuard, FeatureFlagGuard, DirectorOrSectionChiefGuard, DirectorGuard)
@RequireDirectorOrSectionChief()
export class PooldataFieldWhitelistController {
  constructor(private readonly service: PooldataFieldWhitelistService) {}

  // ===== F075 v1.4 §5.5 =====
  //
  // 路由排序：靜態 'available-columns' 必須宣告於 :columnName 動態路由之前
  // （NestJS 靜態路由優先規則）。對應回歸測試：TS-F075-E2E-008。

  @Get('available-columns')
  @RequireDirector()
  @RequireFeatureFlag('ENABLE_E07_REFACTOR_PHASE3')
  async getAvailableColumns() {
    return this.service.getAvailableColumns();
  }

  // ===== F075 §5.1 =====

  @Get()
  async listFields(@Query() query: ListPooldataFieldsQueryDto) {
    return this.service.listFields({ active: query.active });
  }

  /**
   * UI 預查：給前端 confirm Modal「將自動停用 N 個可選值」用（F075 v1.3 AC-6）
   * GET /:columnName/active-options-count
   */
  @Get(':columnName/active-options-count')
  async getActiveOptionCount(@Param('columnName') columnName: string) {
    await this.service.findOneOrFail(columnName);
    return this.service.getInactiveCount(columnName);
  }

  // ===== F075 §5.2 =====

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequireDirector()
  @RequireFeatureFlag('ENABLE_E07_REFACTOR_PHASE3')
  async createField(@Body() dto: CreatePooldataFieldDto, @Req() req: any) {
    const actor = {
      userId: req.user.userId,
      ipAddress: req.ip ?? null,
    };
    return this.service.createField(
      {
        columnName: dto.columnName,
        displayName: dto.displayName,
        fieldType: dto.fieldType,
      },
      actor,
    );
  }

  // ===== F075 §5.3 =====

  @Patch(':columnName')
  @RequireDirector()
  @RequireFeatureFlag('ENABLE_E07_REFACTOR_PHASE3')
  async updateField(
    @Param('columnName') columnName: string,
    @Body() dto: UpdatePooldataFieldDto,
    @Req() req: any,
  ) {
    const actor = {
      userId: req.user.userId,
      ipAddress: req.ip ?? null,
    };
    return this.service.updateField(
      columnName,
      {
        displayName: dto.displayName,
        fieldType: dto.fieldType,
        isActive: dto.isActive,
      },
      actor,
    );
  }

  // ===== F075 §5.4 =====

  @Delete(':columnName')
  @RequireDirector()
  @RequireFeatureFlag('ENABLE_E07_REFACTOR_PHASE3')
  async disableField(
    @Param('columnName') columnName: string,
    @Req() req: any,
  ) {
    const actor = {
      userId: req.user.userId,
      ipAddress: req.ip ?? null,
    };
    return this.service.disableField(columnName, actor);
  }
}
