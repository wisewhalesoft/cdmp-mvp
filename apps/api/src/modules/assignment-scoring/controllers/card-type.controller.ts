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
import { CardTypeService } from '../services/card-type.service';
import { CreateCardTypeDto } from '../dto/create-card-type.dto';
import { UpdateCardTypeDto } from '../dto/update-card-type.dto';
import { ListCardTypesQueryDto } from '../dto/list-card-types-query.dto';
import { DeleteCardTypeQueryDto } from '../dto/delete-card-type-query.dto';

/**
 * F069 / F070 / F071 / F072：CARD_TYPE 計分卡類型 CRUD Controller
 *
 * 路由前綴：`/api/v1/assignment/scoring/card-types`
 *
 * 權限（依 F002 §4.6.2 / AD-E07 v3.0 / 2026-05-16）：
 *   - class 級 AuthGuard + DirectorOrSectionChiefGuard + DirectorGuard
 *   - class 級 `@RequireDirectorOrSectionChief()`：所有方法至少需 director/section_chief/admin
 *   - GET 端點未額外標 → 走 DirectorOrSectionChiefGuard（M02 讀取開放至處長）
 *   - 寫入端點額外標 `@RequireDirector()` → 走 DirectorGuard（M02 寫入限部長）
 *
 * 端點：
 *   - GET    /                        F069 列表
 *   - POST   /                        F070 新增（同 tx 建 v1 版本）
 *   - PUT    /:cardType               F071 編輯
 *   - GET    /:cardType/delete-preview F072 級聯刪除預覽
 *   - DELETE /:cardType               F072 級聯刪除（需 confirmCascade=true）
 */
@Controller('assignment/scoring/card-types')
@UseGuards(AuthGuard, FeatureFlagGuard, DirectorOrSectionChiefGuard, DirectorGuard)
@RequireDirectorOrSectionChief()
export class CardTypeController {
  constructor(private readonly service: CardTypeService) {}

  // ===== F069 =====

  @Get()
  async listCardTypes(@Query() query: ListCardTypesQueryDto) {
    return this.service.listCardTypes({ status: query.status });
  }

  // ===== F070 =====

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequireDirector()
  @RequireFeatureFlag('ENABLE_E07_REFACTOR_PHASE3')
  async createCardType(@Body() dto: CreateCardTypeDto, @Req() req: any) {
    const actor = {
      userId: req.user.userId,
      ipAddress: req.ip ?? null,
    };
    return this.service.createCardType(
      {
        cardType: dto.cardType,
        cardName: dto.cardName,
        prodKind: dto.prodKind,
      },
      actor,
    );
  }

  // ===== F071 =====

  @Put(':cardType')
  @RequireDirector()
  @RequireFeatureFlag('ENABLE_E07_REFACTOR_PHASE3')
  async updateCardType(
    @Param('cardType') cardType: string,
    @Body() dto: UpdateCardTypeDto,
    @Req() req: any,
  ) {
    const actor = {
      userId: req.user.userId,
      ipAddress: req.ip ?? null,
    };
    // AC-2：body 即使含 cardType 亦忽略，以 URL path 為準
    return this.service.updateCardType(
      cardType,
      { cardName: dto.cardName, prodKind: dto.prodKind },
      actor,
    );
  }

  // ===== Iter 9 — GET /:cardType/stats =====

  @Get(':cardType/stats')
  async getCardTypeStats(@Param('cardType') cardType: string) {
    return this.service.getCardTypeStats(cardType);
  }

  // ===== F072 =====

  @Get(':cardType/delete-preview')
  async getDeletePreview(@Param('cardType') cardType: string) {
    return this.service.getDeletePreview(cardType);
  }

  @Delete(':cardType')
  @RequireDirector()
  @RequireFeatureFlag('ENABLE_E07_REFACTOR_PHASE3')
  async deleteCardType(
    @Param('cardType') cardType: string,
    @Query() query: DeleteCardTypeQueryDto,
    @Req() req: any,
  ) {
    const actor = {
      userId: req.user.userId,
      ipAddress: req.ip ?? null,
    };
    return this.service.deleteCardTypeCascade(
      cardType,
      query.confirmCascade,
      actor,
    );
  }
}
