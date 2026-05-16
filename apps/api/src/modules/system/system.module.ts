import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { User } from '@/database/entities/user.entity';
import { TokenBlocklist } from '@/database/entities/token-blocklist.entity';
import { SystemController } from './system.controller';
import { SystemService } from './system.service';

/**
 * F077 v1.2 §5.1 — System 模組（E07 重構 P1 B2 補完）
 *
 * 提供 GET /api/v1/system/current-work-ym 端點。
 *
 * 需 TokenBlocklist + User entity 因 AuthGuard 會檢查 token 黑名單 / password_changed_at。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([User, TokenBlocklist]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET', 'default-dev-secret'),
      }),
    }),
  ],
  controllers: [SystemController],
  providers: [SystemService],
  exports: [SystemService],
})
export class SystemModule {}
