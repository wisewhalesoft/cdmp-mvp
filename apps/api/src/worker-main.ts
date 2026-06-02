import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkerAppModule } from './worker-app.module';

/**
 * F098 / AD-E07-28 P1 / AC-8：cdmp-worker 程序進入點。
 *
 * 以 `createApplicationContext`（**非** HTTP app + port 綁定）啟動：
 *  - 不掛 HTTP server、不 expose port（AC-8 / TS-F098-WORKER-001）。
 *  - lifecycle hooks 仍會觸發：RunQueueConsumer.onModuleInit（註冊 pg-boss work handler）、
 *    OrphanReaper.onApplicationBootstrap（啟動掃描）。
 *
 * docker-compose `cdmp-worker` service 以
 *   `npx ts-node -r tsconfig-paths/register src/worker-main.ts`
 * 啟動（與 api 同一份 apps/api 程式碼、同 DB / feature flag env）。
 */
async function bootstrapWorker(): Promise<void> {
  const logger = new Logger('WorkerMain');
  const appContext = await NestFactory.createApplicationContext(WorkerAppModule, {
    // worker 為背景程序，bufferLogs 預設關閉即可；保留預設 logger
  });
  // 確保 onApplicationBootstrap（OrphanReaper）觸發
  await appContext.init();

  logger.log('cdmp-worker 已啟動：pg-boss consumer + orphan reaper 就緒（無 HTTP server）');

  const shutdown = async (signal: string): Promise<void> => {
    logger.log(`收到 ${signal}，關閉 worker...`);
    await appContext.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

bootstrapWorker().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('cdmp-worker 啟動失敗:', err);
  process.exit(1);
});
