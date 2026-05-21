import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { ObListDefinition } from '@/database/entities/ob-list-definition.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { ObPoolData } from '@/database/entities/ob-pool-data.entity';
import { ObCalendar } from '@/database/entities/ob-calendar.entity';
import { ObDeptPct } from '@/database/entities/ob-dept-pct.entity';
import { ObEmplSet } from '@/database/entities/ob-empl-set.entity';
import { ObEmphire } from '@/database/entities/ob-emphire.entity';
import { PooldataFieldOption } from '@/database/entities/pooldata-field-option.entity';
import { PooldataFieldWhitelist } from '@/database/entities/pooldata-field-whitelist.entity';
import { User } from '@/database/entities/user.entity';
import { TokenBlocklist } from '@/database/entities/token-blocklist.entity';
import { AssignmentRunGuardService } from '@/modules/assignment/services/assignment-run-guard.service';
import { AssignmentListController } from './assignment-list.controller';
import { AssignmentListService } from './assignment-list.service';
import { Stage0EstimateController } from './stage0-estimate.controller';
import { Stage0EstimateService } from './stage0-estimate.service';

/**
 * F048 / F050 / F051 / F052 / F077：M01 名單 CRUD 模組
 *
 * 對齊 AD-E07 v3.0 P1 B2：
 *   - 寫入端點以 FeatureFlagGuard(ENABLE_E07_REFACTOR_PHASE3) 保護
 *   - 寫入頂層呼叫 AssignmentRunGuardService.assertNoRunningRun()
 *
 * 需 TokenBlocklist + User entity 因 AuthGuard 會檢查 token 黑名單 / password_changed_at。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ObListDefinition,
      AssignmentAuditLog,
      AssignmentRun,
      ObPoolData,
      ObCalendar,
      ObDeptPct,
      ObEmplSet,
      ObEmphire,
      PooldataFieldOption,
      PooldataFieldWhitelist,
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
  controllers: [AssignmentListController, Stage0EstimateController],
  providers: [
    AssignmentListService,
    AssignmentRunGuardService,
    Stage0EstimateService,
  ],
  exports: [AssignmentListService, Stage0EstimateService],
})
export class AssignmentListModule {}
