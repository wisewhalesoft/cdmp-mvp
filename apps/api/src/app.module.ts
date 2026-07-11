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
// F068 廢除（F050 v2.1 重構 / AD-E07-18 §18.7 Step 1，Phase 5c 波 10）：
// F068 assignment-code/ 模組已移除。原 ob_code_df CRUD 功能已遷至 F075/F076
// (pooldata-field whitelist + options)。
import { AssignmentScoringModule } from './modules/assignment-scoring/assignment-scoring.module';
import { AssignmentListModule } from './modules/assignment-list/assignment-list.module';
import { AssignmentModule } from './modules/assignment/assignment.module';
import { AssignmentStageModule } from './modules/assignment-stage/assignment-stage.module';
import { PooldataFieldModule } from './modules/pooldata-field/pooldata-field.module';
import { SystemModule } from './modules/system/system.module';
import { Role } from './database/entities/role.entity';
// === E07 Entities (Track A — 19 表)===
import { ObCodeDf } from './database/entities/ob-code-df.entity';
import { ObListDefinition } from './database/entities/ob-list-definition.entity';
import { ObDeptPct } from './database/entities/ob-dept-pct.entity';
import { ObEmplSet } from './database/entities/ob-empl-set.entity';
import { ObLevelcardVersion } from './database/entities/ob-levelcard-version.entity';
import { ObLevelcardColumn } from './database/entities/ob-levelcard-column.entity';
import { ObLevelcardScore } from './database/entities/ob-levelcard-score.entity';
import { ObLevelcardLevel } from './database/entities/ob-levelcard-level.entity';
import { ObTier } from './database/entities/ob-tier.entity';
import { ObEmphire } from './database/entities/ob-emphire.entity';
import { ObCalendar } from './database/entities/ob-calendar.entity';
import { ObPoolData } from './database/entities/ob-pool-data.entity';
import { ObPoolDataList } from './database/entities/ob-pool-data-list.entity';
import { ObMonthlyRunResult } from './database/entities/ob-monthly-run-result.entity';
import { AssignmentRun } from './database/entities/assignment-run.entity';
import { AssignmentRunSnapshot } from './database/entities/assignment-run-snapshot.entity';
import { AssignmentRunStageLog } from './database/entities/assignment-run-stage-log.entity';
import { AssignmentApproval } from './database/entities/assignment-approval.entity';
import { AssignmentAuditLog } from './database/entities/assignment-audit-log.entity';
import { ObAssignConfig } from './database/entities/ob-assign-config.entity';
import { ObAssignSet } from './database/entities/ob-assign-set.entity';
import { ObArreturndfMinCap } from './database/entities/ob-arreturndf-min-cap.entity';
// Iter 1：F069~F072 CARD_TYPE 主檔 entity
import { ObCardType } from './database/entities/ob-card-type.entity';
// P1 B5：F075 / F076 POOLDATA 篩選欄位白名單 + 類別型可選值 entity
import { PooldataFieldWhitelist } from './database/entities/pooldata-field-whitelist.entity';
import { PooldataFieldOption } from './database/entities/pooldata-field-option.entity';
// AD-E07-40 P2a：自建 T-SQL 佇列 QueueJob entity（取代 pg-boss）。所有 driver 通用建立，
//   API 程序之 RunQueueProducer.send/cancel 需 DataSource 存取此表（PG 上為無害空表，見 AD §9.3）。
import { QueueJob } from './database/entities/queue-job.entity';

const E07_ENTITIES = [
  ObCodeDf, ObListDefinition, ObDeptPct, ObEmplSet,
  ObLevelcardVersion, ObLevelcardColumn, ObLevelcardScore, ObLevelcardLevel,
  ObTier, ObEmphire, ObCalendar, ObPoolData, ObPoolDataList, ObMonthlyRunResult,
  AssignmentRun, AssignmentRunSnapshot, AssignmentRunStageLog, AssignmentAuditLog, AssignmentApproval,
  ObAssignConfig, ObAssignSet,
  ObArreturndfMinCap,
  ObCardType,
  PooldataFieldWhitelist, PooldataFieldOption,
];

// D1 / AD-E07-39 §5（I-MSSQL-ENTITY-LIST-PARITY-01）：三個 dialect 分支共用「單一」entity 清單，
// 防止任一分支單獨維護部分清單（P1a 過渡態 mssql 分支曾僅掛 4 entity）而漂移。
const ALL_ENTITIES = [
  User, TokenBlocklist, PasswordResetToken,
  Datasource, DatasourceHealthLog,
  ExtractionTask, ExtractionLog,
  EtlPipeline, EtlPipelineLog, EtlPipelineVersion,
  Role,
  ...E07_ENTITIES,
  // AD-E07-40 P2a：佇列基礎建設 entity（非 E07 業務表；三 dialect 通用建立）。
  QueueJob,
];

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
            entities: ALL_ENTITIES,
            synchronize: true,
          };
        }

        // AD-E07-38 D-1：顯式 mssql 分支（不再隱式 fallback）。
        // AD-E07-39 D1（§5）：P1b 起 mssql 分支載入全 37 entity（共用 ALL_ENTITIES），
        //   完整 AppModule（各業務模組 forFeature）於本分支可啟動。
        if (dbType === 'mssql') {
          return {
            type: 'mssql',
            host: configService.get<string>('DB_HOST', 'localhost'),
            // ⚠️ env 之 DB_PORT 為字串；tedious 要求 number（否則 "config.options.port must be of type number"）→ 強制 Number()。
            port: Number(configService.get('DB_PORT', 1433)),
            username: configService.get<string>('DB_USERNAME', 'sa'),
            password: configService.get<string>('DB_PASSWORD'),
            database: configService.get<string>('DB_NAME', 'CDMP'),
            // P6c / I-MSSQL-REQ-TIMEOUT-01：tedious requestTimeout 預設僅 15s，對百萬列 ETL
            //   extract/load（raw→core）與月跑等長操作遠遠不足（PG node-postgres 預設無 statement
            //   timeout，故 PG 從不逾時）。此連線亦跑 ETL pipeline（API 程序），故須放大。env
            //   DB_MSSQL_REQUEST_TIMEOUT 覆蓋（預設 1hr；用 truthy 值避免 mssql 對 0 做 falsy-coalescing 退回預設）。
            requestTimeout: Number(
              configService.get('DB_MSSQL_REQUEST_TIMEOUT', 3600000),
            ),
            options: {
              encrypt: configService.get<string>('DB_MSSQL_ENCRYPT', 'true') === 'true',
              trustServerCertificate:
                configService.get<string>('DB_MSSQL_TRUST_CERT', 'true') === 'true',
              // AD-E07-43 P5h / I-MSSQL-DATE-TZ-01：顯式 useUTC:true。若未設，TypeORM SqlServerDriver
              //   會覆寫 tedious 內建 true 預設為 false → date/datetime2 讀寫改本地時區分量，
              //   使 getUTC*() 正規化於 UTC+ 時區（Asia/Taipei）取到前一日（assignday −1）。
              //   設 true 讓「DB Date 回 UTC 午夜」之全庫既有慣例於 MSSQL 成立、與 PG 對齊。
              useUTC: true,
            },
            entities: ALL_ENTITIES,
            synchronize: configService.get<string>('NODE_ENV') !== 'production',
          };
        }

        // PG 全面移除後僅支援 sqlite（測試）/ mssql（正式）；其餘明確拋錯（不再隱式 fallback postgres）。
        throw new Error(
          `不支援的 DB_TYPE='${dbType}'（PG 已移除；僅支援 mssql 或 sqlite）`,
        );
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
    // F068 assignment-code/ 已於 F050 v2.1 Phase 5c 波10 移除（AD-E07-18 §18.7 Step 1）
    AssignmentScoringModule,
    AssignmentListModule,
    AssignmentModule,
    AssignmentStageModule,
    PooldataFieldModule,
    SystemModule,
  ],
  providers: [],
})
export class AppModule {}
