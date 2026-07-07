import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import * as path from 'path';
import { AssignmentWorkerModule } from './modules/assignment/assignment-worker.module';
import { User } from './database/entities/user.entity';
import { Role } from './database/entities/role.entity';
import { TokenBlocklist } from './database/entities/token-blocklist.entity';
import { PasswordResetToken } from './database/entities/password-reset-token.entity';

/**
 * F098 / AD-E07-28 P1 / §5：cdmp-worker 程序的根 module。
 *
 * 與 AppModule（API 程序）區分：本 module **不**掛任何 HTTP controller / Guard / Throttler，
 * 只建立 DB 連線 + AssignmentWorkerModule（pg-boss consumer + reaper + pipeline）。
 * worker-main.ts 以 `NestFactory.createApplicationContext(WorkerAppModule)` 啟動，
 * **不呼叫 app.listen()** → 不掛 HTTP server、不 expose port（AC-8 / TS-F098-WORKER-001）。
 *
 * entities 以 glob 載入（對齊 database/data-source.ts），避免與 AppModule 的 entity 清單漂移。
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: process.env.NODE_ENV === 'test' ? '.env.test' : '.env',
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const dbType = configService.get<string>('DB_TYPE', 'postgres');
        const entities = [
          path.join(__dirname, 'database', 'entities', '*.entity.{ts,js}'),
        ];

        if (dbType === 'sqlite') {
          return {
            type: 'better-sqlite3' as any,
            database: ':memory:',
            entities,
            synchronize: true,
          };
        }

        // AD-E07-38 D-1：顯式 mssql 分支（不再隱式 fallback）。
        // ⚠️ P1a 過渡態：僅掛 auth 最小 4 entity（glob 全量會對未修正型別的 33 entity synchronize 而失敗）。
        //    P1b 才恢復 glob 全 37 entity。完整 WorkerAppModule（含 AssignmentWorkerModule forFeature）
        //    於本分支無法啟動，屬 P1a 已知邊界，見 AD-E07-38-P1a-impl.md。
        if (dbType === 'mssql') {
          return {
            type: 'mssql',
            host: configService.get<string>('DB_HOST', 'localhost'),
            port: configService.get<number>('DB_PORT', 1433),
            username: configService.get<string>('DB_USERNAME', 'sa'),
            password: configService.get<string>('DB_PASSWORD'),
            database: configService.get<string>('DB_NAME', 'CDMP'),
            options: {
              encrypt: configService.get<string>('DB_MSSQL_ENCRYPT', 'true') === 'true',
              trustServerCertificate:
                configService.get<string>('DB_MSSQL_TRUST_CERT', 'true') === 'true',
            },
            entities: [User, Role, TokenBlocklist, PasswordResetToken],
            synchronize: configService.get<string>('NODE_ENV') !== 'production',
          };
        }

        return {
          type: 'postgres',
          host: configService.get<string>('DB_HOST', 'localhost'),
          port: configService.get<number>('DB_PORT', 5432),
          username: configService.get<string>('DB_USERNAME', 'cdmp'),
          password: configService.get<string>('DB_PASSWORD', 'cdmp_secret'),
          database: configService.get<string>('DB_NAME', 'cdmp_dev'),
          entities,
          synchronize: configService.get<string>('NODE_ENV') !== 'production',
        };
      },
    }),
    AssignmentWorkerModule,
  ],
})
export class WorkerAppModule {}
