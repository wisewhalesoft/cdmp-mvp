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
import { ObCardType } from '@/database/entities/ob-card-type.entity';
import { ObCodeDf } from '@/database/entities/ob-code-df.entity';
import { ObListDefinition } from '@/database/entities/ob-list-definition.entity';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';
import { User } from '@/database/entities/user.entity';
import { TokenBlocklist } from '@/database/entities/token-blocklist.entity';
import { AssignmentScoringController } from './assignment-scoring.controller';
import { AssignmentScoringService } from './assignment-scoring.service';
import { CardTypeController } from './controllers/card-type.controller';
import { CardTypeService } from './services/card-type.service';

/**
 * F053 / F054 / F055 / F056：E07 計分卡設定模組
 * F069 / F070 / F071 / F072（Iter 2 新增）：CARD_TYPE 計分卡類型 CRUD
 *
 * 需要 TokenBlocklist + User entity 因 AuthGuard 會檢查 token 黑名單與
 * password_changed_at（與其他 protected 模組一致 pattern）。
 *
 * Iter 2 新增 entity：
 *   - ObCardType        F069~F072 主檔
 *   - ObCodeDf          F069 prodKindName join / F070 F071 prodKind 驗證
 *   - ObListDefinition  F072 listDefinitionsAffected 統計
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
      ObCardType,
      ObCodeDf,
      ObListDefinition,
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
  controllers: [AssignmentScoringController, CardTypeController],
  providers: [AssignmentScoringService, CardTypeService],
})
export class AssignmentScoringModule {}
