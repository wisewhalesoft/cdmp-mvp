import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { User } from '@/database/entities/user.entity';
import { TokenBlocklist } from '@/database/entities/token-blocklist.entity';
import { JwtUtil } from '@/common/jwt/jwt.util';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, TokenBlocklist]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET', 'default-dev-secret'),
        signOptions: { expiresIn: '8h' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtUtil],
  exports: [AuthService, JwtUtil, JwtModule],
})
export class AuthModule {}
