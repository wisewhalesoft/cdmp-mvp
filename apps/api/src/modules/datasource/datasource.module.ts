import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DatasourceController } from './datasource.controller';
import { DatasourceService } from './datasource.service';
import { Datasource } from '@/database/entities/datasource.entity';
import { TokenBlocklist } from '@/database/entities/token-blocklist.entity';
import { User } from '@/database/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Datasource, TokenBlocklist, User]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET', 'default-dev-secret'),
      }),
    }),
  ],
  controllers: [DatasourceController],
  providers: [DatasourceService],
})
export class DatasourceModule {}
