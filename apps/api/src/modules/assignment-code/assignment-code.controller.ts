import {
  Body,
  Controller,
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
 * 權限（依 F002 §4.6.2 / AD-E07 v3.0 / 2026-05-16）：
 *   - class 級套 AuthGuard + DirectorOrSectionChiefGuard + DirectorGuard
 *   - class 級 `@RequireDirectorOrSectionChief()`：所有方法至少需 director/section_chief/admin
 *   - GET 端點未額外標 → 走 DirectorOrSectionChiefGuard（瀏覽開放至處長）
 *   - 寫入端點額外標 `@RequireDirector()` → 走 DirectorGuard（M06 白名單寫入限部長）
 */
@Controller('assignment/codes')
@UseGuards(AuthGuard, FeatureFlagGuard, DirectorOrSectionChiefGuard, DirectorGuard)
@RequireDirectorOrSectionChief()
export class AssignmentCodeController {
  constructor(private readonly service: AssignmentCodeService) {}

  @Get()
  async list(@Query() query: ListCodesQueryDto) {
    return this.service.listCodes(query.tblId, query.includeInactive ?? false);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequireDirector()
  @RequireFeatureFlag('ENABLE_E07_REFACTOR_PHASE3')
  async create(@Body() dto: CreateCodeDto, @Req() req: any) {
    const actor = {
      userId: req.user.userId,
      ipAddress: req.ip ?? null,
    };
    return this.service.createCode(dto, actor);
  }

  @Put(':tblId/:tblCd')
  @RequireDirector()
  @RequireFeatureFlag('ENABLE_E07_REFACTOR_PHASE3')
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
  @RequireDirector()
  @RequireFeatureFlag('ENABLE_E07_REFACTOR_PHASE3')
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
