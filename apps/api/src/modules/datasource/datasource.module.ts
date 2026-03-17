import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DatasourceController } from './datasource.controller';
import { DatasourceService } from './datasource.service';
import { DashboardService } from './dashboard.service';
import { Datasource } from '@/database/entities/datasource.entity';
import { DatasourceHealthLog } from '@/database/entities/datasource-health-log.entity';
import { TokenBlocklist } from '@/database/entities/token-blocklist.entity';
import { User } from '@/database/entities/user.entity';
import { CONNECTION_TESTER, ConnectionTesterProvider } from './connection-tester.provider';

@Module({
  imports: [
    TypeOrmModule.forFeature([Datasource, DatasourceHealthLog, TokenBlocklist, User]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET', 'default-dev-secret'),
      }),
    }),
  ],
  controllers: [DatasourceController],
  providers: [
    DatasourceService,
    DashboardService,
    {
      provide: CONNECTION_TESTER,
      useClass: ConnectionTesterProvider,
    },
  ],
  exports: [DatasourceService],
})
export class DatasourceModule {}
