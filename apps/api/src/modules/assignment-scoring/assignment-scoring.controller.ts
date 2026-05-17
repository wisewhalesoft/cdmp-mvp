import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
import { AssignmentScoringService } from './assignment-scoring.service';
import { GetScoringQueryDto } from './dto/get-scoring-query.dto';
import { UpdateDimensionsDto } from './dto/update-dimensions.dto';
import { CreateDimensionDto } from './dto/create-dimension.dto';
import { DisableDimensionQueryDto } from './dto/disable-dimension-query.dto';
import { UpdateCardLevelsDto } from './dto/update-card-levels.dto';
import { GetCardLevelsQueryDto } from './dto/get-card-levels-query.dto';
import { PreviewCardLevelsQueryDto } from './dto/preview-card-levels-query.dto';
import { DeleteCardLevelQueryDto } from './dto/delete-card-level-query.dto';
import { CreateCardLevelDto } from './dto/create-card-level.dto';
import {
  UpdateTierMappingDto,
  UpdateTierMappingQueryDto,
} from './dto/update-tier-mapping.dto';
import { CreateTierMappingDto } from './dto/create-tier-mapping.dto';
import { DeleteTierMappingQueryDto } from './dto/delete-tier-mapping-query.dto';
import { GetTierMappingQueryDto } from './dto/get-tier-mapping-query.dto';

/**
 * F053 / F054 / F055 / F056：E07 計分卡設定 Controller
 *
 * 路由前綴 `assignment/scoring`（global prefix `api/v1`，最終
 * `/api/v1/assignment/scoring/...`）。
 *
 * 權限（依 F002 §4.6.2 / AD-E07 v3.0 / 2026-05-16）：
 *   - class 級 AuthGuard + DirectorOrSectionChiefGuard + DirectorGuard
 *   - class 級 `@RequireDirectorOrSectionChief()`：所有方法至少需 director/section_chief/admin
 *   - GET 端點未額外標 → 走 DirectorOrSectionChiefGuard（M02 讀取開放至處長）
 *   - 寫入端點額外標 `@RequireDirector()` → 走 DirectorGuard（M02 寫入限部長）
 */
@Controller('assignment/scoring')
@UseGuards(AuthGuard, FeatureFlagGuard, DirectorOrSectionChiefGuard, DirectorGuard)
@RequireDirectorOrSectionChief()
export class AssignmentScoringController {
  constructor(private readonly service: AssignmentScoringService) {}

  // ===== F053 =====

  @Get()
  async getScoring(@Query() query: GetScoringQueryDto) {
    return this.service.getScoring({ cardType: query.cardType });
  }

  // ===== F054 =====

  @Put('dimensions')
  @RequireDirector()
  @RequireFeatureFlag('ENABLE_E07_REFACTOR_PHASE3')
  async updateDimensions(@Body() dto: UpdateDimensionsDto, @Req() req: any) {
    const actor = {
      userId: req.user.userId,
      ipAddress: req.ip ?? null,
    };
    return this.service.updateDimensions(dto, actor);
  }

  @Post('dimensions')
  @HttpCode(HttpStatus.CREATED)
  @RequireDirector()
  @RequireFeatureFlag('ENABLE_E07_REFACTOR_PHASE3')
  async createDimension(@Body() dto: CreateDimensionDto, @Req() req: any) {
    const actor = {
      userId: req.user.userId,
      ipAddress: req.ip ?? null,
    };
    return this.service.createDimension(dto, actor);
  }

  @Put('dimensions/:columnName/disable')
  @RequireDirector()
  @RequireFeatureFlag('ENABLE_E07_REFACTOR_PHASE3')
  async disableDimension(
    @Param('columnName') columnName: string,
    @Query() query: DisableDimensionQueryDto,
    @Req() req: any,
  ) {
    const actor = {
      userId: req.user.userId,
      ipAddress: req.ip ?? null,
    };
    return this.service.disableDimension(query.cardType, columnName, actor);
  }

  // ===== F055 =====

  @Get('card-levels')
  async getCardLevels(@Query() query: GetCardLevelsQueryDto) {
    return this.service.getCardLevels({
      cardType: query.cardType,
      cardVersion: query.cardVersion,
    });
  }

  @Get('card-levels/preview')
  async previewCardLevels(@Query() query: PreviewCardLevelsQueryDto) {
    return this.service.previewCardLevels({
      cardType: query.cardType,
      levels: query.levels,
    });
  }

  @Put('card-levels')
  @RequireDirector()
  @RequireFeatureFlag('ENABLE_E07_REFACTOR_PHASE3')
  async updateCardLevels(@Body() dto: UpdateCardLevelsDto, @Req() req: any) {
    const actor = {
      userId: req.user.userId,
      ipAddress: req.ip ?? null,
    };
    return this.service.updateCardLevels(dto, actor);
  }

  /**
   * F055 v1.5 §5.4 POST /api/v1/assignment/scoring/card-levels
   * Body: cardType / cardLevel / scoreS / scoreE（不含 cardVersion，後端依 active 版本帶入）
   *
   * 新增單筆 CARD_LEVEL 等級至選中 CARD_TYPE 之 active 計分版本。
   * 對應 AC-8 ~ AC-8f / BR-1 / BR-7 / BR-8 / BR-9。
   */
  @Post('card-levels')
  @HttpCode(HttpStatus.CREATED)
  @RequireDirector()
  @RequireFeatureFlag('ENABLE_E07_REFACTOR_PHASE3')
  async createCardLevel(@Body() dto: CreateCardLevelDto, @Req() req: any) {
    const actor = {
      userId: req.user.userId,
      ipAddress: req.ip ?? null,
    };
    return this.service.createCardLevel(dto, actor);
  }

  /**
   * F055 §5.3 DELETE /api/v1/assignment/scoring/card-levels
   * Query: cardType, cardVersion, cardLevel（皆必填）
   *
   * Hard delete + cascade reference check（BR-5/BR-6）。
   */
  @Delete('card-levels')
  @RequireDirector()
  @RequireFeatureFlag('ENABLE_E07_REFACTOR_PHASE3')
  async deleteCardLevel(
    @Query() query: DeleteCardLevelQueryDto,
    @Req() req: any,
  ) {
    const actor = {
      userId: req.user.userId,
      ipAddress: req.ip ?? null,
    };
    return this.service.deleteCardLevel(
      {
        cardType: query.cardType,
        cardVersion: query.cardVersion,
        cardLevel: query.cardLevel,
      },
      actor,
    );
  }

  // ===== F056 v1.5 =====

  @Get('tier-mapping')
  async getTierMapping(@Query() query: GetTierMappingQueryDto) {
    return this.service.getTierMapping({ cardType: query.cardType });
  }

  @Put('tier-mapping')
  @RequireDirector()
  @RequireFeatureFlag('ENABLE_E07_REFACTOR_PHASE3')
  async updateTierMapping(
    @Query() query: UpdateTierMappingQueryDto,
    @Body() dto: UpdateTierMappingDto,
    @Req() req: any,
  ) {
    const actor = {
      userId: req.user.userId,
      ipAddress: req.ip ?? null,
    };
    return this.service.updateTierMapping(
      {
        cardType: query.cardType,
        mappings: dto.mappings,
      },
      actor,
    );
  }

  @Post('tier-mapping')
  @HttpCode(HttpStatus.CREATED)
  @RequireDirector()
  @RequireFeatureFlag('ENABLE_E07_REFACTOR_PHASE3')
  async createTierMapping(@Body() dto: CreateTierMappingDto, @Req() req: any) {
    const actor = {
      userId: req.user.userId,
      ipAddress: req.ip ?? null,
    };
    return this.service.createTierMapping(dto, actor);
  }

  /**
   * F056 §5.4 DELETE /api/v1/assignment/scoring/tier-mapping
   * Query: cardType（必填）、cardLevel（選填，省略代表 fallback NULL）
   *
   * Hard delete（BR-11）。
   */
  @Delete('tier-mapping')
  @RequireDirector()
  @RequireFeatureFlag('ENABLE_E07_REFACTOR_PHASE3')
  async deleteTierMapping(
    @Query() query: DeleteTierMappingQueryDto,
    @Req() req: any,
  ) {
    const actor = {
      userId: req.user.userId,
      ipAddress: req.ip ?? null,
    };
    return this.service.deleteTierMapping(
      {
        cardType: query.cardType,
        // 省略 cardLevel → null（fallback 規則紀錄）
        cardLevel: query.cardLevel === undefined ? null : query.cardLevel,
      },
      actor,
    );
  }
}
