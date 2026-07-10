import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '@/common/guards/auth.guard';
import { DirectorOrSectionChiefGuard } from '@/common/guards/director-or-section-chief.guard';
import { RequireDirectorOrSectionChief } from '@/common/decorators/business-role.decorator';
import { FeatureFlagGuard } from '@/common/feature-flags/feature-flag.guard';
import { RequireFeatureFlag } from '@/common/feature-flags/feature-flag.decorator';
import { SystemService } from '@/modules/system/system.service';
import { PersonnelRatioService } from './personnel-ratio.service';
import { SetPersonnelRatioDto } from './dto/set-personnel-ratio.dto';

/**
 * F082 v1.4 + F083 v1.3 — 個別業務比例設定 Controller
 *
 * 路由：
 *   - GET  /api/v1/assignment/ratios/personnel/{listNo}
 *   - PUT  /api/v1/assignment/ratios/personnel/{listNo}
 *
 * 權限：DirectorOrSectionChiefGuard（admin / director / section_chief）
 *   - GET：service 層 scopeByCreator filter（處長 only）
 *   - PUT：service 層轄區檢查（PERSONNEL_RATIO_OUT_OF_SCOPE）
 *
 * FeatureFlag：ENABLE_E07_REFACTOR_PHASE3。
 */
@Controller('assignment/ratios/personnel')
@UseGuards(AuthGuard, FeatureFlagGuard, DirectorOrSectionChiefGuard)
@RequireDirectorOrSectionChief()
@RequireFeatureFlag('ENABLE_E07_REFACTOR_PHASE3')
export class PersonnelRatioController {
  constructor(
    private readonly service: PersonnelRatioService,
    // F097 / AD-E07-27 §27.3：current_work_ym 取值改用 SystemService（行為不變）
    private readonly systemService: SystemService,
  ) {}

  /**
   * GET /api/v1/assignment/ratios/personnel/{listNo}/copy-sources?deptCode=XXX
   *
   * 「從本月其他名單複製」來源清單（設定頁 UX 優化）。宣告於 `:listNo` 之前避免歧義
   * （兩段路徑；NestJS 依段數區分，無實際衝突，此順序僅為明確）。
   */
  @Get(':listNo/copy-sources')
  async copySources(
    @Param('listNo') listNo: string,
    @Query('deptCode') deptCode: string | undefined,
    @Req() req: Request,
  ) {
    const user = (req as any).user;
    return this.service.getCopySources(listNo, deptCode ?? '', {
      userId: user.userId,
      role: user.role,
      businessRole: user.businessRole,
      ipAddress: req.ip ?? null,
    });
  }

  @Get(':listNo')
  async get(
    @Param('listNo') listNo: string,
    @Query('deptCode') deptCode: string | undefined,
    @Query('excludeResigned') excludeResigned: string | undefined,
    @Req() req: Request,
  ) {
    const user = (req as any).user;
    return this.service.getPersonnelRatios(
      listNo,
      deptCode ?? null,
      {
        userId: user.userId,
        role: user.role,
        businessRole: user.businessRole,
        ipAddress: req.ip ?? null,
      },
      { excludeResigned: excludeResigned === 'true' || excludeResigned === '1' },
    );
  }

  @Put(':listNo')
  @HttpCode(HttpStatus.OK)
  async set(
    @Param('listNo') listNo: string,
    @Body() dto: SetPersonnelRatioDto,
    @Req() req: Request,
  ) {
    const user = (req as any).user;
    return this.service.setPersonnelRatios(
      listNo,
      dto,
      {
        userId: user.userId,
        role: user.role,
        businessRole: user.businessRole,
        ipAddress: req.ip ?? null,
      },
      this.systemService.getCurrentWorkYm(),
    );
  }
}
