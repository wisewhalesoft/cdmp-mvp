import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { ObListDefinition } from '@/database/entities/ob-list-definition.entity';
import { ObDeptPct } from '@/database/entities/ob-dept-pct.entity';
import { ObEmplSet } from '@/database/entities/ob-empl-set.entity';
import { ObEmphire } from '@/database/entities/ob-emphire.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';
import { AssignmentApproval } from '@/database/entities/assignment-approval.entity';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { User } from '@/database/entities/user.entity';
import { TokenBlocklist } from '@/database/entities/token-blocklist.entity';
import { AssignmentRunGuardService } from '@/modules/assignment/services/assignment-run-guard.service';
import { StageTransitionService } from '@/modules/assignment/services/stage-transition.service';
import { RatioValidationService } from '@/modules/assignment/services/ratio-validation.service';
import { PersonnelRatioValidationService } from '@/modules/assignment/services/personnel-ratio-validation.service';
import { DeptRatioController } from './dept-ratio.controller';
import { DeptRatioService } from './dept-ratio.service';
import { PersonnelRatioController } from './personnel-ratio.controller';
import { PersonnelRatioService } from './personnel-ratio.service';
import { StageActionController } from './stage-action.controller';
import { StageActionService } from './stage-action.service';

/**
 * AssignmentStageModule（E07 P2 / 2026-05-17）
 *
 * 涵蓋：M03a / M03b / M03c / M03d 之 11 個端點
 *   - GET/PUT /api/v1/assignment/ratios/dept/{listNo}          → F079
 *   - GET/PUT /api/v1/assignment/ratios/personnel/{listNo}     → F082 + F083
 *   - POST /api/v1/assignment/lists/{listNo}/stage/...         → F078/F080/F081/F084/F085/F086/F089
 *   - POST /api/v1/assignment/lists/{listNo}/reject            → F087
 *
 * 全部寫入：
 *   1) FeatureFlagGuard(ENABLE_E07_REFACTOR_PHASE3)
 *   2) AuthGuard
 *   3) Director / DirectorOrSectionChiefGuard（依端點）
 *   4) AssignmentRunGuardService.assertNoRunningRun()（service 層頂層）
 *   5) StageTransitionService（含 audit log tx）
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ObListDefinition,
      ObDeptPct,
      ObEmplSet,
      ObEmphire,
      AssignmentAuditLog,
      AssignmentApproval,
      AssignmentRun,
      User,
      TokenBlocklist,
    ]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET', 'default-dev-secret'),
      }),
    }),
  ],
  controllers: [DeptRatioController, PersonnelRatioController, StageActionController],
  providers: [
    DeptRatioService,
    PersonnelRatioService,
    StageActionService,
    AssignmentRunGuardService,
    StageTransitionService,
    RatioValidationService,
    PersonnelRatioValidationService,
  ],
  exports: [DeptRatioService, PersonnelRatioService, StageActionService],
})
export class AssignmentStageModule {}
