import { Logger, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// pg-boss 為 CommonJS（`export = PgBoss`）：須用 `import = require` 形式，
// 否則 ts-node（worker entrypoint / migration runner）下 `import PgBoss from 'pg-boss'`
// 會編成 `pg_boss_1.default` → undefined → "is not a constructor"（swc/vitest 可運作但 ts-node 不行）。
import PgBoss = require('pg-boss');
import {
  RUN_QUEUE_NAME,
  RUN_QUEUE_RETRY_LIMIT,
} from './run-queue.constants';

/**
 * F098 / AD-E07-28 P1：pg-boss 實例的 DI token。
 *
 * producer（cdmp-api）與 consumer（cdmp-worker）皆透過此 token 注入同一抽象，
 * 測試可用 `overrideProvider(PG_BOSS)` 注入 fake boss（模擬真實 contract：send 回 jobId、
 * work handler 收 job 陣列、createQueue 設 retryLimit=0）。
 */
export const PG_BOSS = Symbol('PG_BOSS');

/**
 * orphan 偵測 / cancellation poller 之閾值與週期（OQ-F098-02）。
 *
 * 預設值保守設於「明顯大於 P1 JS 版月跑最長執行時間 + 安全邊際」，並讓 env 可調，
 * 測試環境以極短值注入（不等真實逾時）。
 */
export const RUN_QUEUE_TUNING = Symbol('RUN_QUEUE_TUNING');

export interface RunQueueTuning {
  /**
   * job expiration（pg-boss `expireInSeconds`）。P1 JS 版月跑最壞可達數十分鐘，
   * 預設保守設 4 小時（14400s），遠大於最長月跑以免誤殺執行中 run。
   */
  jobExpireInSeconds: number;
  /**
   * OrphanReaper 掃描週期（毫秒）。預設 60s。
   */
  reaperIntervalMs: number;
  /**
   * orphan 判定逾時門檻（毫秒）：running 持續超過此值且 job 已消失 / expire → 視為殭屍。
   * 預設與 jobExpireInSeconds 對齊（4 小時）。
   */
  orphanThresholdMs: number;
  /**
   * CancellationPoller 於可中斷邊界查 status 的最小間隔（毫秒）；P1 採「每個 list/stage
   * 邊界查一次」，本值僅在需要時做節流，預設 0（每個邊界都查）。
   */
  cancelPollIntervalMs: number;
  /**
   * AD-E07-40 P2b（§4.2）：mssql 自建佇列輪詢間隔（毫秒）。
   * 僅 mssql 路徑之 `RunQueueConsumer` 輪詢 loop（`startMssqlPolling`）使用；
   * pg-boss（postgres）路徑不使用（boss.work 內部自行排程）。
   * 預設 2000ms，可 env `RUN_QUEUE_POLL_INTERVAL_MS` 覆蓋（AD §9.1 建議 P2b 端對端量測後調整）。
   */
  pollIntervalMs: number;
}

export const DEFAULT_RUN_QUEUE_TUNING: RunQueueTuning = {
  jobExpireInSeconds: Number(process.env.RUN_QUEUE_JOB_EXPIRE_SECONDS) || 14400,
  reaperIntervalMs: Number(process.env.RUN_QUEUE_REAPER_INTERVAL_MS) || 60_000,
  orphanThresholdMs:
    Number(process.env.RUN_QUEUE_ORPHAN_THRESHOLD_MS) || 14400 * 1000,
  cancelPollIntervalMs: Number(process.env.RUN_QUEUE_CANCEL_POLL_INTERVAL_MS) || 0,
  pollIntervalMs: Number(process.env.RUN_QUEUE_POLL_INTERVAL_MS) || 2000,
};

/**
 * 建立並啟動真實 pg-boss 實例（連既有 Postgres 之 `pgboss` schema）。
 *
 * 注意：
 *  - dev / 首啟靠 `boss.start()` 自建 schema；prod 由 migration `1711360000299` 先固定 DDL，
 *    `start()` 對既有 schema 冪等（getConstructionPlans 內含 `CREATE SCHEMA IF NOT EXISTS` +
 *    advisory lock，多 worker 首啟不 race）。
 *  - DB_TYPE !== 'postgres'（如測試 SQLite）時回傳 null：pg-boss 僅支援 Postgres，
 *    SQLite 單元測試一律以 fake boss override，不建立真實實例。
 */
const PG_BOSS_LOGGER = new Logger('PgBossProvider');

export async function createPgBoss(
  config: ConfigService,
): Promise<PgBoss | null> {
  const dbType = config.get<string>('DB_TYPE') ?? process.env.DB_TYPE;
  if (dbType !== 'postgres') {
    PG_BOSS_LOGGER.warn(
      `DB_TYPE=${dbType} 非 postgres，跳過 pg-boss 初始化（測試 / 非 PG 環境以 fake boss override）`,
    );
    return null;
  }

  const boss = new PgBoss({
    host: config.get<string>('DB_HOST') ?? process.env.DB_HOST,
    port: Number(config.get<string>('DB_PORT') ?? process.env.DB_PORT) || 5432,
    user: config.get<string>('DB_USERNAME') ?? process.env.DB_USERNAME,
    password: config.get<string>('DB_PASSWORD') ?? process.env.DB_PASSWORD,
    database: config.get<string>('DB_NAME') ?? process.env.DB_NAME,
    schema: 'pgboss',
  });

  boss.on('error', (err: Error) => {
    PG_BOSS_LOGGER.error(`pg-boss error: ${err.message}`, err.stack);
  });

  await boss.start();
  // v10：send/work 前需先建立 queue；retryLimit 於 queue policy 固定（OQ-AD28-04 = 0）
  await boss.createQueue(RUN_QUEUE_NAME, {
    name: RUN_QUEUE_NAME,
    retryLimit: RUN_QUEUE_RETRY_LIMIT,
  });
  return boss;
}

/**
 * NestJS provider：以 ConfigService 建立 pg-boss 實例（API + worker 共用）。
 */
export const pgBossProvider: Provider = {
  provide: PG_BOSS,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => createPgBoss(config),
};

export const runQueueTuningProvider: Provider = {
  provide: RUN_QUEUE_TUNING,
  useValue: DEFAULT_RUN_QUEUE_TUNING,
};
