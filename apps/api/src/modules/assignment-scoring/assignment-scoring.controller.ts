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
import { SalesManagerGuard } from '@/common/guards/sales-manager.guard';
import { RequireSalesManager } from '@/common/decorators/sales-manager.decorator';
import { AssignmentScoringService } from './assignment-scoring.service';
import { GetScoringQueryDto } from './dto/get-scoring-query.dto';
import { UpdateDimensionsDto } from './dto/update-dimensions.dto';
import { CreateDimensionDto } from './dto/create-dimension.dto';
import { DisableDimensionQueryDto } from './dto/disable-dimension-query.dto';
import { UpdateCardLevelsDto } from './dto/update-card-levels.dto';
import { GetCardLevelsQueryDto } from './dto/get-card-levels-query.dto';
import { PreviewCardLevelsQueryDto } from './dto/preview-card-levels-query.dto';
import { DeleteCardLevelQueryDto } from './dto/delete-card-level-query.dto';
import { UpdateTierMappingDto } from './dto/update-tier-mapping.dto';
import { CreateTierMappingDto } from './dto/create-tier-mapping.dto';
import { DeleteTierMappingQueryDto } from './dto/delete-tier-mapping-query.dto';

/**
 * F053 / F054 / F055 / F056：E07 計分卡設定 Controller
 *
 * 路由前綴 `assignment/scoring`（global prefix `api/v1`，最終
 * `/api/v1/assignment/scoring/...`）。
 *
 * 權限：所有端點 AuthGuard + SalesManagerGuard
 *   - admin 直接通過
 *   - role='user' + is_sales_manager=true 通過
 *   - 其餘 403 AUTH_FORBIDDEN
 */
@Controller('assignment/scoring')
@UseGuards(AuthGuard, SalesManagerGuard)
@RequireSalesManager()
export class AssignmentScoringController {
  constructor(private readonly service: AssignmentScoringService) {}

  // ===== F053 =====

  @Get()
  async getScoring(@Query() query: GetScoringQueryDto) {
    return this.service.getScoring({ cardType: query.cardType });
  }

  // ===== F054 =====

  @Put('dimensions')
  async updateDimensions(@Body() dto: UpdateDimensionsDto, @Req() req: any) {
    const actor = {
      userId: req.user.userId,
      ipAddress: req.ip ?? null,
    };
    return this.service.updateDimensions(dto, actor);
  }

  @Post('dimensions')
  @HttpCode(HttpStatus.CREATED)
  async createDimension(@Body() dto: CreateDimensionDto, @Req() req: any) {
    const actor = {
      userId: req.user.userId,
      ipAddress: req.ip ?? null,
    };
    return this.service.createDimension(dto, actor);
  }

  @Put('dimensions/:columnName/disable')
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
  async updateCardLevels(@Body() dto: UpdateCardLevelsDto, @Req() req: any) {
    const actor = {
      userId: req.user.userId,
      ipAddress: req.ip ?? null,
    };
    return this.service.updateCardLevels(dto, actor);
  }

  /**
   * F055 §5.3 DELETE /api/v1/assignment/scoring/card-levels
   * Query: cardType, cardVersion, cardLevel（皆必填）
   *
   * Hard delete + cascade reference check（BR-5/BR-6）。
   */
  @Delete('card-levels')
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

  // ===== F056 =====

  @Get('tier-mapping')
  async getTierMapping() {
    return this.service.getTierMapping();
  }

  @Put('tier-mapping')
  async updateTierMapping(@Body() dto: UpdateTierMappingDto, @Req() req: any) {
    const actor = {
      userId: req.user.userId,
      ipAddress: req.ip ?? null,
    };
    return this.service.updateTierMapping(dto, actor);
  }

  @Post('tier-mapping')
  @HttpCode(HttpStatus.CREATED)
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
