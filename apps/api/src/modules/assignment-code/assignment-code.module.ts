import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { ObCodeDf } from '@/database/entities/ob-code-df.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';
import { User } from '@/database/entities/user.entity';
import { TokenBlocklist } from '@/database/entities/token-blocklist.entity';
import { AssignmentCodeController } from './assignment-code.controller';
import { AssignmentCodeService } from './assignment-code.service';

/**
 * F068：E07 代碼維護模組
 *
 * 需要 TokenBlocklist + User entity 是因為 AuthGuard 會檢查 token 黑名單與
 * 使用者狀態 / password_changed_at（與其他 protected 模組一致 pattern）。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([ObCodeDf, AssignmentAuditLog, User, TokenBlocklist]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET', 'default-dev-secret'),
      }),
    }),
  ],
  controllers: [AssignmentCodeController],
  providers: [AssignmentCodeService],
})
export class AssignmentCodeModule {}
