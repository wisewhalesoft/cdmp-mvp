import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '@/common/guards/auth.guard';
import { DirectorGuard } from '@/common/guards/director.guard';
import { DirectorOrSectionChiefGuard } from '@/common/guards/director-or-section-chief.guard';
import {
  RequireDirector,
  RequireDirectorOrSectionChief,
} from '@/common/decorators/business-role.decorator';
import { FeatureFlagGuard } from '@/common/feature-flags/feature-flag.guard';
import { RequireFeatureFlag } from '@/common/feature-flags/feature-flag.decorator';
import { AssignmentListController } from '@/modules/assignment-list/assignment-list.controller';
import { StageActionService } from './stage-action.service';
import { ApproveListDto, RejectListDto } from './dto/reject.dto';

/**
 * StageActionController — M03 五階段流程 advance / rollback / approve / reject
 *
 * 路由前綴：/api/v1/assignment/lists/{listNo}
 *
 * 對應 spec：F078 / F080 / F081 / F084 / F085 / F086 / F087 / F089
 *
 * 權限策略（各 method 各自掛 Guard）：
 *   - F078 / F080 / F081 / F085 / F086 / F087 / F089：DirectorGuard
 *   - F084：DirectorOrSectionChiefGuard
 *
 * 共通：FeatureFlag ENABLE_E07_REFACTOR_PHASE3、AuthGuard。
 */
@Controller('assignment/lists')
@UseGuards(AuthGuard, FeatureFlagGuard)
@RequireFeatureFlag('ENABLE_E07_REFACTOR_PHASE3')
export class StageActionController {
  constructor(private readonly service: StageActionService) {}

  // F078: draft → dept_ratio
  @Post(':listNo/stage/advance-to-dept-ratio')
  @HttpCode(HttpStatus.OK)
  @UseGuards(DirectorGuard)
  @RequireDirector()
  async advanceToDeptRatio(@Param('listNo') listNo: string, @Req() req: Request) {
    return this.service.advanceDraftToDeptRatio(
      listNo,
      this.actor(req),
      AssignmentListController.computeCurrentWorkYm(),
    );
  }

  // F080: dept_ratio → personnel_ratio
  @Post(':listNo/stage/advance-to-personnel-ratio')
  @HttpCode(HttpStatus.OK)
  @UseGuards(DirectorGuard)
  @RequireDirector()
  async advanceToPersonnelRatio(@Param('listNo') listNo: string, @Req() req: Request) {
    return this.service.advanceDeptRatioToPersonnelRatio(
      listNo,
      this.actor(req),
      AssignmentListController.computeCurrentWorkYm(),
    );
  }

  // F081: dept_ratio → draft
  @Post(':listNo/stage/rollback-to-draft')
  @HttpCode(HttpStatus.OK)
  @UseGuards(DirectorGuard)
  @RequireDirector()
  async rollbackToDraft(@Param('listNo') listNo: string, @Req() req: Request) {
    return this.service.rollbackDeptRatioToDraft(
      listNo,
      this.actor(req),
      AssignmentListController.computeCurrentWorkYm(),
    );
  }

  // F084: personnel_ratio → approval（DirectorOrSectionChief）
  @Post(':listNo/stage/advance-to-approval')
  @HttpCode(HttpStatus.OK)
  @UseGuards(DirectorOrSectionChiefGuard)
  @RequireDirectorOrSectionChief()
  async advanceToApproval(@Param('listNo') listNo: string, @Req() req: Request) {
    return this.service.advancePersonnelRatioToApproval(
      listNo,
      this.actor(req),
      AssignmentListController.computeCurrentWorkYm(),
    );
  }

  // F085: personnel_ratio → dept_ratio
  @Post(':listNo/stage/rollback-to-dept-ratio')
  @HttpCode(HttpStatus.OK)
  @UseGuards(DirectorGuard)
  @RequireDirector()
  async rollbackToDeptRatio(@Param('listNo') listNo: string, @Req() req: Request) {
    return this.service.rollbackPersonnelRatioToDeptRatio(
      listNo,
      this.actor(req),
      AssignmentListController.computeCurrentWorkYm(),
    );
  }

  // F086: approval → ready
  @Post(':listNo/stage/approve')
  @HttpCode(HttpStatus.OK)
  @UseGuards(DirectorGuard)
  @RequireDirector()
  async approve(
    @Param('listNo') listNo: string,
    @Body() _dto: ApproveListDto,
    @Req() req: Request,
  ) {
    return this.service.approveToReady(
      listNo,
      this.actor(req),
      AssignmentListController.computeCurrentWorkYm(),
    );
  }

  // F087: approval → personnel_ratio（reject + reason）
  @Post(':listNo/reject')
  @HttpCode(HttpStatus.OK)
  @UseGuards(DirectorGuard)
  @RequireDirector()
  async reject(
    @Param('listNo') listNo: string,
    @Body() dto: RejectListDto,
    @Req() req: Request,
  ) {
    return this.service.rejectToPersonnelRatio(
      listNo,
      dto.rejectReason,
      this.actor(req),
      AssignmentListController.computeCurrentWorkYm(),
    );
  }

  // F089: ready → approval
  @Post(':listNo/stage/rollback-to-approval')
  @HttpCode(HttpStatus.OK)
  @UseGuards(DirectorGuard)
  @RequireDirector()
  async rollbackToApproval(@Param('listNo') listNo: string, @Req() req: Request) {
    return this.service.rollbackReadyToApproval(
      listNo,
      this.actor(req),
      AssignmentListController.computeCurrentWorkYm(),
    );
  }

  private actor(req: Request) {
    const user = (req as any).user;
    return {
      userId: user.userId,
      role: user.role,
      businessRole: user.businessRole,
      ipAddress: req.ip ?? null,
    };
  }
}
