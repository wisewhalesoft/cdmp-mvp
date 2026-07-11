import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { AssignmentRunSnapshot } from '@/database/entities/assignment-run-snapshot.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';
import { ObListDefinition } from '@/database/entities/ob-list-definition.entity';
import { ObPoolData } from '@/database/entities/ob-pool-data.entity';
import { ObPoolDataList } from '@/database/entities/ob-pool-data-list.entity';
import { ObMonthlyRunResult } from '@/database/entities/ob-monthly-run-result.entity';
import { ObDeptPct } from '@/database/entities/ob-dept-pct.entity';
import { ObEmplSet } from '@/database/entities/ob-empl-set.entity';
import { ObCalendar } from '@/database/entities/ob-calendar.entity';
import { ObEmphire } from '@/database/entities/ob-emphire.entity';
import { ObCardType } from '@/database/entities/ob-card-type.entity';
import { ObLevelcardVersion } from '@/database/entities/ob-levelcard-version.entity';
import { ObLevelcardColumn } from '@/database/entities/ob-levelcard-column.entity';
import { ObLevelcardScore } from '@/database/entities/ob-levelcard-score.entity';
import { ObLevelcardLevel } from '@/database/entities/ob-levelcard-level.entity';
import { ObTier } from '@/database/entities/ob-tier.entity';
import { EtlPipeline } from '@/database/entities/etl-pipeline.entity';
import { EtlPipelineLog } from '@/database/entities/etl-pipeline-log.entity';
import { EtlPipelineVersion } from '@/database/entities/etl-pipeline-version.entity';
import { User } from '@/database/entities/user.entity';
import { TokenBlocklist } from '@/database/entities/token-blocklist.entity';
import { AssignmentRunGuardService } from './services/assignment-run-guard.service';
import { MonthlyRunReadinessService } from './services/monthly-run-readiness.service';
import { StageTransitionService } from './services/stage-transition.service';
import { AssignmentRunService } from './services/assignment-run.service';
import { AssignmentRunPipelineService } from './services/assignment-run-pipeline.service';
import { AssignmentRunSnapshotService } from './services/assignment-run-snapshot.service';
import { AssignmentRunReportService } from './services/assignment-run-report.service';
import { SectionChiefScopeService } from './services/section-chief-scope.service';
import { AssignmentRunController } from './assignment-run.controller';
import { AssignmentScoringModule } from '@/modules/assignment-scoring/assignment-scoring.module';
import { SystemModule } from '@/modules/system/system.module';
import { RunQueueProducer } from './queue/run-queue.producer';
import { CancellationPoller } from './queue/cancellation-poller';
import { MssqlQueueService } from './queue/mssql-queue.service';
import { runQueueTuningProvider } from './queue/run-queue-tuning.provider';

/**
 * AssignmentModule — F061 / F062 / F065 / F066（M04 月跑觸發 + 歷史 + 詳情）
 *
 * 同時 export AssignmentRunGuardService / MonthlyRunReadinessService /
 * StageTransitionService 供其他模組（assignment-list / assignment-scoring / ...）注入。
 *
 * 需 TokenBlocklist + User entity 因 AuthGuard 會檢查 token 黑名單 / password_changed_at。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      AssignmentRun,
      AssignmentRunSnapshot,
      AssignmentAuditLog,
      ObListDefinition,
      ObPoolData,
      ObPoolDataList,
      ObMonthlyRunResult,
      ObDeptPct,
      ObEmplSet,
      ObCalendar,
      ObEmphire,
      ObCardType,
      ObLevelcardVersion,
      ObLevelcardColumn,
      ObLevelcardScore,
      ObLevelcardLevel,
      ObTier,
      EtlPipeline,
      EtlPipelineLog,
      EtlPipelineVersion,
      User,
      TokenBlocklist,
    ]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET', 'default-dev-secret'),
      }),
    }),
    // F061 v1.3：Stage 2 前置 soft check（ScoringIntegrityCheckService）
    AssignmentScoringModule,
    // F097 / AD-E07-27 §27.3：current_work_ym 收斂至 SystemService（過去月 guard + readiness 取值）
    SystemModule,
  ],
  controllers: [AssignmentRunController],
  providers: [
    AssignmentRunService,
    AssignmentRunPipelineService,
    AssignmentRunSnapshotService,
    AssignmentRunReportService,
    AssignmentRunGuardService,
    MonthlyRunReadinessService,
    StageTransitionService,
    SectionChiefScopeService,
    // F098 / AD-E07-28 P1：API 側只註冊入列 producer + 佇列服務 + tuning。
    // worker 側（RunQueueConsumer / CancellationPoller / OrphanReaper）由 worker bootstrap
    // 之 AssignmentWorkerModule 註冊，不掛在 API module（API 程序不消費、不執行 pipeline）。
    RunQueueProducer,
    // CancellationPoller 註冊於此，使 worker 之 pipeline（同 module scope）可注入取消檢查；
    // API 程序之 pipeline 雖也注入，但 API 程序不執行 pipeline → 無副作用（既有 pipeline
    // unit test 未提供此 provider，@Optional 維持 undefined → baseline 不變）。
    CancellationPoller,
    // AD-E07-40 P2b（CONFIG-006 MUST-FIX）：API 程序之 RunQueueProducer 之 mssql 分支（send/cancel）
    // 需注入 MssqlQueueService；AD §4.2 檔案改動清單漏列 assignment.module（僅列 worker module），
    // 此為文件缺口補正。DB_TYPE≠mssql 時 producer 走 boss 路徑，此 provider 建立但不使用（無害）。
    MssqlQueueService,
    runQueueTuningProvider,
  ],
  exports: [
    AssignmentRunGuardService,
    MonthlyRunReadinessService,
    StageTransitionService,
    SectionChiefScopeService,
    // worker module 重用 pipeline + tuning + producer（producer 供 pending 取消快路徑）
    AssignmentRunPipelineService,
    RunQueueProducer,
    CancellationPoller,
    // worker module 之 RunQueueConsumer 需 MssqlQueueService（透過 import AssignmentModule 取得）。
    MssqlQueueService,
    runQueueTuningProvider,
  ],
})
export class AssignmentModule {}
