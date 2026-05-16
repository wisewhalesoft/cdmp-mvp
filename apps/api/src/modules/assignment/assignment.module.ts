import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { AssignmentRunSnapshot } from '@/database/entities/assignment-run-snapshot.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';
import { ObListDefinition } from '@/database/entities/ob-list-definition.entity';
import { ObPoolData } from '@/database/entities/ob-pool-data.entity';
import { ObPoolDataList } from '@/database/entities/ob-pool-data-list.entity';
import { ObDeptPct } from '@/database/entities/ob-dept-pct.entity';
import { ObEmplSet } from '@/database/entities/ob-empl-set.entity';
import { ObCardType } from '@/database/entities/ob-card-type.entity';
import { ObLevelcardLevel } from '@/database/entities/ob-levelcard-level.entity';
import { ObTier } from '@/database/entities/ob-tier.entity';
import { User } from '@/database/entities/user.entity';
import { TokenBlocklist } from '@/database/entities/token-blocklist.entity';
import { AssignmentRunGuardService } from './services/assignment-run-guard.service';
import { MonthlyRunReadinessService } from './services/monthly-run-readiness.service';
import { StageTransitionService } from './services/stage-transition.service';
import { AssignmentRunService } from './services/assignment-run.service';
import { AssignmentRunPipelineService } from './services/assignment-run-pipeline.service';
import { AssignmentRunController } from './assignment-run.controller';

/**
 * AssignmentModule — F061 / F062 / F065 / F066（M04 月跑觸發 + 歷史 + 詳情）
 *
 * 同時 export AssignmentRunGuardService / MonthlyRunReadinessService /
 * StageTransitionService 供其他模組（assignment-list / assignment-scoring / ...）注入。
 *
 * 需 TokenBlocklist + User entity 因 AuthGuard 會檢查 token 黑名單 / password_changed_at。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      AssignmentRun,
      AssignmentRunSnapshot,
      AssignmentAuditLog,
      ObListDefinition,
      ObPoolData,
      ObPoolDataList,
      ObDeptPct,
      ObEmplSet,
      ObCardType,
      ObLevelcardLevel,
      ObTier,
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
  controllers: [AssignmentRunController],
  providers: [
    AssignmentRunService,
    AssignmentRunPipelineService,
    AssignmentRunGuardService,
    MonthlyRunReadinessService,
    StageTransitionService,
  ],
  exports: [
    AssignmentRunGuardService,
    MonthlyRunReadinessService,
    StageTransitionService,
  ],
})
export class AssignmentModule {}
