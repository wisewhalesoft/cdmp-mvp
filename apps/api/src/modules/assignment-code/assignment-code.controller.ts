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
import { AssignmentCodeService } from './assignment-code.service';
import { ListCodesQueryDto } from './dto/list-codes-query.dto';
import { CreateCodeDto } from './dto/create-code.dto';
import { UpdateCodeDto } from './dto/update-code.dto';

/**
 * F068：E07 代碼維護 Controller
 *
 * 路由前綴 `assignment/codes`（main.ts 設 global prefix `api/v1`，最終為
 * `/api/v1/assignment/codes`）。
 *
 * 權限：所有端點要求 AuthGuard + SalesManagerGuard
 *   - admin 直接通過
 *   - role='user' + is_sales_manager=true 通過
 *   - 其餘 403 AUTH_FORBIDDEN
 */
@Controller('assignment/codes')
@UseGuards(AuthGuard, SalesManagerGuard)
@RequireSalesManager()
export class AssignmentCodeController {
  constructor(private readonly service: AssignmentCodeService) {}

  @Get()
  async list(@Query() query: ListCodesQueryDto) {
    return this.service.listCodes(query.tblId, query.includeInactive ?? false);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateCodeDto, @Req() req: any) {
    const actor = {
      userId: req.user.userId,
      ipAddress: req.ip ?? null,
    };
    return this.service.createCode(dto, actor);
  }

  @Put(':tblId/:tblCd')
  async update(
    @Param('tblId') tblId: string,
    @Param('tblCd') tblCd: string,
    @Body() dto: UpdateCodeDto,
    @Req() req: any,
  ) {
    const actor = {
      userId: req.user.userId,
      ipAddress: req.ip ?? null,
    };
    return this.service.updateCode(tblId, tblCd, dto, actor);
  }

  @Put(':tblId/:tblCd/disable')
  async disable(
    @Param('tblId') tblId: string,
    @Param('tblCd') tblCd: string,
    @Req() req: any,
  ) {
    const actor = {
      userId: req.user.userId,
      ipAddress: req.ip ?? null,
    };
    return this.service.disableCode(tblId, tblCd, actor);
  }
}
