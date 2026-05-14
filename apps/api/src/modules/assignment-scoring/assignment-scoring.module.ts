import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { ObLevelcardVersion } from '@/database/entities/ob-levelcard-version.entity';
import { ObLevelcardColumn } from '@/database/entities/ob-levelcard-column.entity';
import { ObLevelcardScore } from '@/database/entities/ob-levelcard-score.entity';
import { ObLevelcardLevel } from '@/database/entities/ob-levelcard-level.entity';
import { ObTier } from '@/database/entities/ob-tier.entity';
import { ObPoolDataList } from '@/database/entities/ob-pool-data-list.entity';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';
import { User } from '@/database/entities/user.entity';
import { TokenBlocklist } from '@/database/entities/token-blocklist.entity';
import { AssignmentScoringController } from './assignment-scoring.controller';
import { AssignmentScoringService } from './assignment-scoring.service';

/**
 * F053 / F054 / F055 / F056：E07 計分卡設定模組
 *
 * 需要 TokenBlocklist + User entity 因 AuthGuard 會檢查 token 黑名單與
 * password_changed_at（與其他 protected 模組一致 pattern）。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ObLevelcardVersion,
      ObLevelcardColumn,
      ObLevelcardScore,
      ObLevelcardLevel,
      ObTier,
      ObPoolDataList,
      AssignmentRun,
      AssignmentAuditLog,
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
  controllers: [AssignmentScoringController],
  providers: [AssignmentScoringService],
})
export class AssignmentScoringModule {}
