import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { ObListDefinition } from '@/database/entities/ob-list-definition.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { User } from '@/database/entities/user.entity';
import { TokenBlocklist } from '@/database/entities/token-blocklist.entity';
import { AssignmentRunGuardService } from '@/modules/assignment/services/assignment-run-guard.service';
import { AssignmentListController } from './assignment-list.controller';
import { AssignmentListService } from './assignment-list.service';

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
  controllers: [AssignmentListController],
  providers: [AssignmentListService, AssignmentRunGuardService],
  exports: [AssignmentListService],
})
export class AssignmentListModule {}
