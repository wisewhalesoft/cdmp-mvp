import { Provider } from '@nestjs/common';

/**
 * 月名單分派自建 T-SQL 佇列（queue_job）之調校參數與 DI token。
 *
 * （原 pg-boss.provider.ts；PG 全面遷移後 pg-boss 已移除，本檔僅保留 driver-agnostic 的佇列調校設定，
 *  由 RunQueueConsumer 輪詢 loop / OrphanReaper / MssqlQueueExpiryReaper 共用。）
 *
 * orphan 偵測 / 輪詢週期之閾值（OQ-F098-02）：預設值保守設於「明顯大於最長月名單分派執行時間 + 安全邊際」，
 * 並讓 env 可調；測試環境以極短值注入（不等真實逾時）。
 */
export const RUN_QUEUE_TUNING = Symbol('RUN_QUEUE_TUNING');

export interface RunQueueTuning {
  /**
   * job expiration（秒）。月名單分派最壞可達數十分鐘，預設保守設 4 小時（14400s），
   * 遠大於最長月名單分派以免誤殺執行中 run（claimNext 據此判定逾期可重領）。
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
   * 自建 T-SQL 佇列輪詢間隔（毫秒）：RunQueueConsumer `startMssqlPolling` 使用。
   * 預設 2000ms，可 env `RUN_QUEUE_POLL_INTERVAL_MS` 覆蓋。
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

export const runQueueTuningProvider: Provider = {
  provide: RUN_QUEUE_TUNING,
  useValue: DEFAULT_RUN_QUEUE_TUNING,
};
