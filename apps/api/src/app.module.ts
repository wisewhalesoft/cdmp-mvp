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
            entities: [User, TokenBlocklist, PasswordResetToken, Datasource, DatasourceHealthLog, ExtractionTask, ExtractionLog, EtlPipeline, EtlPipelineLog, EtlPipelineVersion, Role, ...E07_ENTITIES],
            synchronize: true,
          };
        }

        // AD-E07-38 D-1：顯式 mssql 分支（不再隱式 fallback）。
        // ⚠️ P1a 過渡態：mssql 分支僅掛 auth 最小 4 entity（User/Role/TokenBlocklist/PasswordResetToken）。
        //    其餘 33 個 entity 尚未完成 D-2 型別修正（uuid/text 字面值），P1b 才擴為全 37 entity。
        //    因僅載 4 entity，本分支下「完整 AppModule」（各業務模組 forFeature 其餘 entity）無法啟動；
        //    P1a 可啟動的 API 面 = auth slice（AuthModule/AccountsModule），見 AD-E07-38-P1a-impl.md。
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
          password: configService.get<string>('DB_PASSWORD', 'cdmp'),
          database: configService.get<string>('DB_NAME', 'cdmp'),
          entities: [User, TokenBlocklist, PasswordResetToken, Datasource, DatasourceHealthLog, ExtractionTask, ExtractionLog, EtlPipeline, EtlPipelineLog, EtlPipelineVersion, Role, ...E07_ENTITIES],
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
