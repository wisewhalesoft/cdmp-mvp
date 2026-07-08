import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import * as path from 'path';
import { AssignmentWorkerModule } from './modules/assignment/assignment-worker.module';

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
        // AD-E07-39 D1（§5 / I-MSSQL-ENTITY-LIST-PARITY-01）：mssql 分支與 sqlite/postgres 一致，
        //   使用同一份 glob `entities`（全 37 entity），不再單獨硬寫子集清單。
        if (dbType === 'mssql') {
          return {
            type: 'mssql',
            host: configService.get<string>('DB_HOST', 'localhost'),
            // ⚠️ env 之 DB_PORT 為字串；tedious 要求 number → 強制 Number()。
            port: Number(configService.get('DB_PORT', 1433)),
            username: configService.get<string>('DB_USERNAME', 'sa'),
            password: configService.get<string>('DB_PASSWORD'),
            database: configService.get<string>('DB_NAME', 'CDMP'),
            options: {
              encrypt: configService.get<string>('DB_MSSQL_ENCRYPT', 'true') === 'true',
              trustServerCertificate:
                configService.get<string>('DB_MSSQL_TRUST_CERT', 'true') === 'true',
              // AD-E07-43 P5h / I-MSSQL-DATE-TZ-01：顯式 useUTC:true（worker 執行月跑 Stage 4 ASSIGNDAY，
              //   此連線為 assignday 讀 ob_calendar.calendar_date 的實際生產路徑）。理由同 app.module.ts。
              useUTC: true,
            },
            entities,
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
