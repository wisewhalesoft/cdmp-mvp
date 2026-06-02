import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { AssignmentModule } from './assignment.module';
import { RunQueueConsumer } from './queue/run-queue.consumer';
import { OrphanReaper } from './queue/orphan-reaper';

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
  providers: [RunQueueConsumer, OrphanReaper],
})
export class AssignmentWorkerModule {}
