import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { AccountsController } from './accounts.controller';
import { TokenBlocklist } from '@/database/entities/token-blocklist.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([TokenBlocklist]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET', 'default-dev-secret'),
      }),
    }),
  ],
  controllers: [AccountsController],
})
export class AccountsModule {}
