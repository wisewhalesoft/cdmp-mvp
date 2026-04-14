import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './modules/auth/auth.module';
import { AccountsModule } from './modules/accounts/accounts.module';
import { DatasourceModule } from './modules/datasource/datasource.module';
import { ExtractionTaskModule } from './modules/extraction-task/extraction-task.module';
import { SchedulerModule } from './modules/scheduler/scheduler.module';
import { User } from './database/entities/user.entity';
import { TokenBlocklist } from './database/entities/token-blocklist.entity';
import { PasswordResetToken } from './database/entities/password-reset-token.entity';
import { Datasource } from './database/entities/datasource.entity';
import { DatasourceHealthLog } from './database/entities/datasource-health-log.entity';
import { ExtractionTask } from './database/entities/extraction-task.entity';
import { ExtractionLog } from './database/entities/extraction-log.entity';
import { EtlPipeline } from './database/entities/etl-pipeline.entity';
import { EtlPipelineLog } from './database/entities/etl-pipeline-log.entity';
import { EtlPipelineVersion } from './database/entities/etl-pipeline-version.entity';
import { EtlModule } from './modules/etl/etl.module';
import { OrphanRecoveryModule } from './modules/orphan-recovery/orphan-recovery.module';
import { RolesModule } from './modules/roles/roles.module';
import { C360Module } from './modules/c360/c360.module';
import { Role } from './database/entities/role.entity';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: process.env.NODE_ENV === 'test' ? '.env.test' : '.env',
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const dbType = configService.get<string>('DB_TYPE', 'sqlite');

        if (dbType === 'sqlite') {
          return {
            type: 'better-sqlite3' as any,
            database: ':memory:',
            entities: [User, TokenBlocklist, PasswordResetToken, Datasource, DatasourceHealthLog, ExtractionTask, ExtractionLog, EtlPipeline, EtlPipelineLog, EtlPipelineVersion, Role],
            synchronize: true,
          };
        }

        return {
          type: 'postgres',
          host: configService.get<string>('DB_HOST', 'localhost'),
          port: configService.get<number>('DB_PORT', 5432),
          username: configService.get<string>('DB_USERNAME', 'cdmp'),
          password: configService.get<string>('DB_PASSWORD', 'cdmp'),
          database: configService.get<string>('DB_NAME', 'cdmp'),
          entities: [User, TokenBlocklist, PasswordResetToken, Datasource, DatasourceHealthLog, ExtractionTask, ExtractionLog, EtlPipeline, EtlPipelineLog, EtlPipelineVersion, Role],
          synchronize: configService.get<string>('NODE_ENV') !== 'production',
        };
      },
    }),
    ThrottlerModule.forRoot([
      {
        name: 'login',
        ttl: 60000, // 1 minute
        limit: 5, // BR-004: 5 requests per minute per IP
      },
    ]),
    AuthModule,
    AccountsModule,
    RolesModule,
    DatasourceModule,
    ExtractionTaskModule,
    EtlModule,
    OrphanRecoveryModule,
    SchedulerModule,
    C360Module,
  ],
  providers: [],
})
export class AppModule {}
