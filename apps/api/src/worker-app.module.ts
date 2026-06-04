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
