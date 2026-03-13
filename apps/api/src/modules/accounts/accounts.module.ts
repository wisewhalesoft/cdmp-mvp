import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';
import { User } from '@/database/entities/user.entity';
import { TokenBlocklist } from '@/database/entities/token-blocklist.entity';

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
  controllers: [AccountsController],
  providers: [AccountsService],
})
export class AccountsModule {}
