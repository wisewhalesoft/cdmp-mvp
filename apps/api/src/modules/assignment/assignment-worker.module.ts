import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { AssignmentModule } from './assignment.module';
import { RunQueueConsumer } from './queue/run-queue.consumer';
import { OrphanReaper } from './queue/orphan-reaper';
import { MssqlQueueService } from './queue/mssql-queue.service';
import { MssqlQueueExpiryReaper } from './queue/mssql-queue-expiry-reaper';

/**
 * F098 / AD-E07-28 P1 / §5：cdmp-worker 程序專用 module。
 *
 * 只在 worker bootstrap（worker-main.ts）載入，**不**掛在 AppModule（API 程序不載）。
 * 職責：
 *  - `RunQueueConsumer`：註冊 pg-boss work handler，消費 'assignment-run' job → runPipeline。
 *  - `OrphanReaper`：worker 啟動 + 定期掃描殭屍 running / pending run，標 failed。
 *
 * 重用 AssignmentModule 之 exports：
 *  - AssignmentRunPipelineService（已注入 CancellationPoller，於可中斷邊界中止）
 *  - pg-boss 實例（PG_BOSS）+ RUN_QUEUE_TUNING + RunQueueProducer
 *
 * consumer / reaper 自身需 AssignmentRun repo + DataSource（DataSource 為全域 TypeORM provider）。
 */
@Module({
  imports: [
    AssignmentModule,
    TypeOrmModule.forFeature([AssignmentRun]),
  ],
  // AD-E07-40 P2b（§4.2）：worker 之 RunQueueConsumer mssql 分支（輪詢 loop）需 MssqlQueueService。
  // AssignmentModule 亦已 export 之；此處於 worker scope 顯式註冊，語意明確、與 AD §4.2 清單一致。
  // AD-E07-40 P2c（§4.3 / MOUNT-001 = AD-5）：MssqlQueueExpiryReaper 為獨立 provider，掛於 worker 程序，
  //   啟動 + 定期呼叫 MssqlQueueService.expireSweep()（僅 mssql 分支）。OrphanReaper 零改動（只用不改）。
  providers: [
    RunQueueConsumer,
    OrphanReaper,
    MssqlQueueService,
    MssqlQueueExpiryReaper,
  ],
})
export class AssignmentWorkerModule {}
