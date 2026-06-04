/**
 * F098 / AD-E07-28 P1 — 靜態 / 回歸 guard（結果不變 + 結構斷言）。
 *
 * 對應測試設計 §9 / §10：
 *   - TS-F098-RG-001：triggerRun 不再 setImmediate(runPipeline) / kickoffPipeline（fs+regex，
 *                     沿用 feedback_grep_negative_lookahead：不可僅靠 Grep tool）
 *   - TS-F098-RG-004：無自動重新入列 failed run 之路徑（無 re-enqueue 模式）
 *   - TS-F098-WORKER-001：worker entrypoint 不掛 HTTP server（無 app.listen）
 *   - TS-F098-WORKER-001b：docker-compose worker service 無 ports 對外映射
 *   - TS-F098-WORKER-002：worker service build.context = ./apps/api（與 api 同源）
 *   - TS-F098-WORKER-003：worker env 含 ASSIGNMENT_PIPELINE flag 相關（feature flag）
 *   - TS-F098-WORKER-004：api 程序註冊 RunQueueProducer
 *   - TS-F098-PGINT-002（部分）：pg-boss schema migration 存在（檔案 + getConstructionPlans）
 *
 * Level: 靜態（fs 讀檔 + regex）。需 Postgres：否。
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const API_SRC = path.resolve(__dirname, '../../../..');
const REPO_ROOT = path.resolve(__dirname, '../../../../../../..');

function read(rel: string, base = API_SRC): string {
  return fs.readFileSync(path.resolve(base, rel), 'utf-8');
}

/** 移除 // 行註解與 block 註解，使 guard 斷言僅針對實際程式碼（非註解中提及的類名）。 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('F098 靜態 / 回歸 guard', () => {
  it('TS-F098-RG-001：assignment-run.service.ts 不含 setImmediate(... runPipeline) / kickoffPipeline', () => {
    const raw = read('modules/assignment/services/assignment-run.service.ts');
    const src = stripComments(raw);
    // setImmediate 完全移除（程式碼層；註解已剝除）
    expect(/setImmediate/.test(src)).toBe(false);
    // kickoffPipeline 方法 / 呼叫完全移除
    expect(/kickoffPipeline/.test(src)).toBe(false);
    // triggerRun 不直接呼叫 runPipeline（API 程序不跑 pipeline）
    expect(/\.pipeline\.runPipeline/.test(src)).toBe(false);
    // 改為入列 producer
    expect(/queueProducer\.send/.test(src)).toBe(true);
  });

  it('TS-F098-RG-004：無自動重新入列 failed run 之路徑（無偵測 failed 後 re-send）', () => {
    const producerSrc = read('modules/assignment/queue/run-queue.producer.ts');
    const consumerSrc = read('modules/assignment/queue/run-queue.consumer.ts');
    const reaperSrc = read('modules/assignment/queue/orphan-reaper.ts');
    // reaper / consumer 不呼叫 producer.send（不自動重新入列）
    expect(/\.send\(/.test(reaperSrc)).toBe(false);
    expect(/producer\.send|queueProducer\.send|boss\.send/.test(consumerSrc)).toBe(
      false,
    );
    // producer 僅在被呼叫時 send，無「掃 failed 自動 re-enqueue」迴圈
    expect(/status\s*===?\s*['"]failed['"][\s\S]*\.send\(/.test(producerSrc)).toBe(
      false,
    );
  });

  it('TS-F098-WORKER-001：worker-main.ts 不掛 HTTP server（無 app.listen）', () => {
    const src = stripComments(read('worker-main.ts'));
    expect(/\.listen\(/.test(src)).toBe(false);
    // 以 createApplicationContext 啟動（非 NestFactory.create + listen）
    expect(/createApplicationContext/.test(src)).toBe(true);
  });

  it('TS-F098-WORKER-001b/002/003：docker-compose worker service 結構', () => {
    const compose = read('docker-compose.yml', REPO_ROOT);
    // 取 worker: ... 到下一個頂層 service 之間的區塊
    const workerBlock = compose.slice(
      compose.indexOf('\n  worker:'),
      compose.indexOf('\n  web:'),
    );
    expect(workerBlock.length).toBeGreaterThan(0);
    // build.context 與 api 同源
    expect(/context:\s*\.\/apps\/api/.test(workerBlock)).toBe(true);
    // command 跑 worker-main
    expect(/worker-main\.ts/.test(workerBlock)).toBe(true);
    // 不對外 expose port（worker 區塊內無 ports:）
    expect(/\n\s*ports:/.test(workerBlock)).toBe(false);
    // 含 feature flag（worker 才是真正執行 pipeline 者）
    expect(/ENABLE_E07_REFACTOR_PHASE3/.test(workerBlock)).toBe(true);
    // depends_on postgres healthy
    expect(/depends_on:[\s\S]*postgres:[\s\S]*service_healthy/.test(workerBlock)).toBe(
      true,
    );
  });

  it('TS-F098-WORKER-004：AssignmentModule 註冊 RunQueueProducer（api 程序）', () => {
    const src = stripComments(read('modules/assignment/assignment.module.ts'));
    expect(/RunQueueProducer/.test(src)).toBe(true);
    // worker 專屬（consumer / reaper）不掛在 api module（註解已剝除，僅看實際 import/provider）
    expect(/RunQueueConsumer/.test(src)).toBe(false);
    expect(/OrphanReaper/.test(src)).toBe(false);
  });

  it('TS-F098-WORKER-004b：AssignmentWorkerModule 註冊 consumer + reaper', () => {
    const src = stripComments(
      read('modules/assignment/assignment-worker.module.ts'),
    );
    expect(/RunQueueConsumer/.test(src)).toBe(true);
    expect(/OrphanReaper/.test(src)).toBe(true);
  });

  it('TS-F098-PGINT-002（靜態部分）：pg-boss schema migration 檔存在且用 getConstructionPlans', () => {
    const migDir = path.resolve(API_SRC, 'database/migrations');
    const files = fs.readdirSync(migDir);
    const mig = files.find((f) => /1711360000299-CreatePgBossSchema\.ts$/.test(f));
    expect(mig).toBeTruthy();
    const src = read(`database/migrations/${mig}`);
    expect(/getConstructionPlans\(['"]pgboss['"]\)/.test(src)).toBe(true);
    // SQLite no-op 慣例
    expect(/DB_TYPE\s*===?\s*['"]sqlite['"]/.test(src)).toBe(true);
  });

  it('queue name / payload 為單一匯出常數（防 producer/consumer typo）', () => {
    const constSrc = read('modules/assignment/queue/run-queue.constants.ts');
    expect(/export const RUN_QUEUE_NAME\s*=\s*['"]assignment-run['"]/.test(constSrc)).toBe(
      true,
    );
    // producer + consumer 皆 import 此常數（不硬寫字串）
    const producerSrc = read('modules/assignment/queue/run-queue.producer.ts');
    const consumerSrc = read('modules/assignment/queue/run-queue.consumer.ts');
    expect(/RUN_QUEUE_NAME/.test(producerSrc)).toBe(true);
    expect(/RUN_QUEUE_NAME/.test(consumerSrc)).toBe(true);
  });
});
