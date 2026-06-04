/**
 * F098 / AD-E07-28 P1：月跑 worker 抽離 — pg-boss 佇列共用常數與型別。
 *
 * ⚠️ **單一事實來源（single source of truth）**：queue name 與 job payload 型別
 * 由本檔集中匯出，producer（cdmp-api）與 consumer（cdmp-worker）一律 import 此處常數，
 * 嚴禁各自硬寫字串。理由：若 producer 與 consumer 的 queue name 不一致（typo），
 * job 會被入列但永遠不會被消費（silent stuck job）— 測試 TS-F098-CONS-006 守此契約。
 */

/**
 * pg-boss 月跑佇列名稱（AD-E07-28 §4.2 / A-4）。
 * producer `send(RUN_QUEUE_NAME, …)` 與 consumer `work(RUN_QUEUE_NAME, …)` 必須引用同一常數。
 */
export const RUN_QUEUE_NAME = 'assignment-run';

/**
 * 月跑 job 之 payload 形狀（AD-E07-28 §4.2 / A-4）。
 * 經 pg-boss 之 JSON 序列化往返後，handler 由 `job.data` 取回相同物件
 * （TS-F098-PGINT-004 驗證 runId/ym 序列化不失真）。
 */
export interface RunJobPayload {
  /** assignment_run.run_id（UUID）— pending run 已先 INSERT，worker 依此推進狀態 */
  runId: string;
  /** 目標分派月 project_workym（'YYYYMM' 字串，含前導零如 '202606'） */
  ym: string;
}

/**
 * 月跑 job retry 上限（OQ-AD28-04 拍板 = 0）。
 * 未完備冪等清理前，失敗一律標 failed、不自動重派；重跑須由使用者人工 triggerRun。
 */
export const RUN_QUEUE_RETRY_LIMIT = 0;

/**
 * 單 worker 序列化（OQ-AD28-05 拍板）。
 *
 * pg-boss v10 已移除 `teamConcurrency`/`teamSize`；序列化等效設定為「每次取 1 筆」
 * （`batchSize: 1`）+ 單一 worker 程序。配合 API 側 `assertNoRunningRun` 同月併發保護，
 * 同月不會有兩個 job 同時被消費。
 */
export const RUN_QUEUE_BATCH_SIZE = 1;
