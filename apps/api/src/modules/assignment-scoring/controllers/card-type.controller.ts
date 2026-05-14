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
 * 權限：所有端點 AuthGuard + SalesManagerGuard
 *   - admin 直接通過（豁免）
 *   - role='user' + is_sales_manager=true 通過
 *   - 其餘 403 AUTH_FORBIDDEN
 *
 * 端點：
 *   - GET    /                        F069 列表
 *   - POST   /                        F070 新增（同 tx 建 v1 版本）
 *   - PUT    /:cardType               F071 編輯
 *   - GET    /:cardType/delete-preview F072 級聯刪除預覽
 *   - DELETE /:cardType               F072 級聯刪除（需 confirmCascade=true）
 */
@Controller('assignment/scoring/card-types')
@UseGuards(AuthGuard, SalesManagerGuard)
@RequireSalesManager()
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

  // ===== F072 =====

  @Get(':cardType/delete-preview')
  async getDeletePreview(@Param('cardType') cardType: string) {
    return this.service.getDeletePreview(cardType);
  }

  @Delete(':cardType')
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
