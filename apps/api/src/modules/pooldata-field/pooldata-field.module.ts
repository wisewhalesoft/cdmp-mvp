import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { PooldataFieldWhitelist } from '@/database/entities/pooldata-field-whitelist.entity';
import { PooldataFieldOption } from '@/database/entities/pooldata-field-option.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';
import { User } from '@/database/entities/user.entity';
import { TokenBlocklist } from '@/database/entities/token-blocklist.entity';
import { ExtractionTask } from '@/database/entities/extraction-task.entity';
import { PooldataFieldWhitelistController } from './controllers/pooldata-field-whitelist.controller';
import { PooldataFieldOptionController } from './controllers/pooldata-field-option.controller';
import { PooldataFieldWhitelistService } from './services/pooldata-field-whitelist.service';
import { PooldataFieldOptionService } from './services/pooldata-field-option.service';
import { ExtractionTaskModule } from '../extraction-task/extraction-task.module';

/**
 * F075 / F076 v1.3：POOLDATA 篩選欄位白名單 + 類別型可選值管理模組
 *
 * 路由：
 *   - /api/v1/pooldata-fields                                  → PooldataFieldWhitelistController
 *   - /api/v1/pooldata-fields/:columnName/options              → PooldataFieldOptionController
 *
 * 需要 TokenBlocklist + User entity 因 AuthGuard 會檢查 token 黑名單與
 * password_changed_at（與其他 protected 模組一致 pattern）。
 *
 * 兩個 Service 透過 PooldataFieldWhitelistService 提供 `assertCategorical()`
 * 達成「F076 寫入前校驗 field_type='categorical'」的耦合（BR-2）。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      PooldataFieldWhitelist,
      PooldataFieldOption,
      AssignmentAuditLog,
      User,
      TokenBlocklist,
      ExtractionTask,
    ]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET', 'default-dev-secret'),
      }),
    }),
    // F075 v1.4.7：取 MSSQLExecutor 供 available-columns 帶上 columnDescription（MS_Description）
    ExtractionTaskModule,
  ],
  controllers: [
    PooldataFieldWhitelistController,
    PooldataFieldOptionController,
  ],
  providers: [
    PooldataFieldWhitelistService,
    PooldataFieldOptionService,
  ],
  exports: [
    PooldataFieldWhitelistService,
    PooldataFieldOptionService,
  ],
})
export class PooldataFieldModule {}
