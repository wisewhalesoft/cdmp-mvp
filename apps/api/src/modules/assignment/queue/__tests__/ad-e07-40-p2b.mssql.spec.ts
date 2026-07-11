/**
 * AD-E07-40 P2b — 端對端（真實 MSSQL）：Producer/Consumer 輪詢 loop 全鏈路 drain。
 *
 * 覆蓋測試設計 §五 E2E（5 案例）：
 *   E2E-001 觸發月名單分派 → worker 輪詢撿到 → stub pipeline → assignment_run.status=completed
 *   E2E-002 業務失敗路徑 → status=failed；queue_job.state=completed（retry=0，佇列層不卡）
 *   E2E-003 連續 send 3 筆 → 單一 worker 輪詢 loop 逐筆 drain 全部至終態
 *   E2E-004 send→pipeline 實際被呼叫之延遲量測（觀察性，非嚴格阻擋）
 *   E2E-005 cancel-before-consume → worker 不執行對應 pipeline
 *
 * Harness（§0.6）：直接 new 真實 RunQueueProducer/RunQueueConsumer + 真實 MssqlQueueService(ds)，
 *   pipeline 以 stub（直接 SQL 更新 assignment_run.status）取代真實 AssignmentRunPipelineService，
 *   schema `p2b_e2e`（AssignmentRun + QueueJob 兩表 synchronize）。
 *
 * Gating：連不上 MSSQL → 每個 test ctx.skip()（不偽造綠燈，feedback_mock_real_system_contract）。
 */

// 必最先 import（side-effect 設 DB_TYPE=mssql，供 entity column-types helper 解析 mssql 分支值）。
import {
  restoreDbType,
  MSSQL,
  mssqlPortReachable,
  SKIP_REASON,
} from '@/database/__tests__/mssql-env-preload';

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { performance } from 'node:perf_hooks';
import type { ConfigService } from '@nestjs/config';
import { DataSource, Repository } from 'typeorm';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { QueueJob } from '@/database/entities/queue-job.entity';
import { MssqlQueueService } from '../mssql-queue.service';
import { RunQueueProducer } from '../run-queue.producer';
import { RunQueueConsumer } from '../run-queue.consumer';
import { DEFAULT_RUN_QUEUE_TUNING, RunQueueTuning } from '../run-queue-tuning.provider';

vi.setConfig({ testTimeout: 120000 });

const SCHEMA = 'p2b_e2e';
const RUN_TBL = `[${SCHEMA}].[assignment_run]`;
const JOB_TBL = `[${SCHEMA}].[queue_job]`;
const POLL_INTERVAL_MS = 150;

let reachable = false;
let ds: DataSource | null = null;
let queue: MssqlQueueService;
let producer: RunQueueProducer;
let runRepo: Repository<AssignmentRun>;

function ensureMssql(ctx: { skip: () => void }): void {
  if (!reachable || !ds) {
    // eslint-disable-next-line no-console
    console.warn(`[AD-E07-40 P2b E2E] SKIPPED — ${SKIP_REASON}`);
    ctx.skip();
  }
}

function mssqlConfig(): ConfigService {
  return { get: (k: string) => (k === 'DB_TYPE' ? 'mssql' : undefined) } as unknown as ConfigService;
}

function tuning(): RunQueueTuning {
  return { ...DEFAULT_RUN_QUEUE_TUNING, pollIntervalMs: POLL_INTERVAL_MS };
}

/** 建立一筆 pending assignment_run，回傳 run_id。 */
async function seedRun(ym = '202606', status = 'pending'): Promise<string> {
  const rows: Array<{ run_id: string }> = await ds!.query(
    `INSERT INTO ${RUN_TBL} (run_id, project_workym, status, triggered_by, created_at)
     OUTPUT inserted.run_id
     VALUES (NEWID(), @0, @1, NEWID(), SYSUTCDATETIME())`,
    [ym, status],
  );
  return rows[0].run_id;
}

async function runStatus(runId: string): Promise<string | null> {
  const r = await ds!.query(`SELECT status FROM ${RUN_TBL} WHERE run_id = @0`, [runId]);
  return r[0]?.status ?? null;
}
async function jobState(jobId: string): Promise<string | null> {
  const r = await ds!.query(`SELECT state FROM ${JOB_TBL} WHERE id = @0`, [jobId]);
  return r[0]?.state ?? null;
}

// 逾時放寬（20s）：本檔與其他 .mssql.spec.ts 併跑時，共享 MSSQL 容器之 CPU/連線競爭會拖慢
// claim/處理（feedback pg-shared-db-cross-spec-interference / pg-spec-parallel-load-timeout）。
// testTimeout 已設 120s，故此處給足窗口，避免併跑下輪詢 tick 被 starve 而假性逾時。
async function waitFor(
  predicate: () => Promise<boolean>,
  { timeout = 20000, interval = 50 } = {},
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      if (await predicate()) return true;
    } catch {
      // 併跑下共享 MSSQL 容器偶發之瞬時查詢錯誤 → 視為「尚未達成」續輪詢，不使測試假性失敗。
    }
    await new Promise((r) => setTimeout(r, interval));
  }
  return false;
}

/** stub pipeline：直接以 SQL 推進 status（模擬 pending→running→completed/failed）。 */
function makeCompleteStub() {
  return {
    runPipeline: vi.fn(async (runId: string) => {
      await ds!.query(`UPDATE ${RUN_TBL} SET status='running', started_at=SYSUTCDATETIME() WHERE run_id=@0`, [runId]);
      await ds!.query(`UPDATE ${RUN_TBL} SET status='completed', finished_at=SYSUTCDATETIME() WHERE run_id=@0`, [runId]);
    }),
  };
}
function makeFailStub() {
  return {
    runPipeline: vi.fn(async (runId: string) => {
      await ds!.query(`UPDATE ${RUN_TBL} SET status='running', started_at=SYSUTCDATETIME() WHERE run_id=@0`, [runId]);
      await ds!.query(`UPDATE ${RUN_TBL} SET status='failed', finished_at=SYSUTCDATETIME(), error_message='stub 業務失敗' WHERE run_id=@0`, [runId]);
    }),
  };
}

function makeConsumer(stub: { runPipeline: ReturnType<typeof vi.fn> }): RunQueueConsumer {
  return new RunQueueConsumer(
    null,
    stub as any,
    runRepo,
    tuning(),
    mssqlConfig(),
    queue,
  );
}

beforeAll(async () => {
  reachable = await mssqlPortReachable(1500);
  if (!reachable) return;
  try {
    ds = new DataSource({
      type: 'mssql',
      host: MSSQL.host,
      port: MSSQL.port,
      username: MSSQL.username,
      password: MSSQL.password,
      database: MSSQL.database,
      options: { encrypt: MSSQL.encrypt, trustServerCertificate: MSSQL.trustServerCertificate },
      schema: SCHEMA,
      entities: [AssignmentRun, QueueJob],
      synchronize: false,
    });
    await ds.initialize();
    await ds.query(`IF SCHEMA_ID('${SCHEMA}') IS NULL EXEC('CREATE SCHEMA ${SCHEMA}')`);
    await ds.query(`IF OBJECT_ID('${SCHEMA}.queue_job','U') IS NOT NULL DROP TABLE ${SCHEMA}.queue_job`);
    await ds.query(`IF OBJECT_ID('${SCHEMA}.assignment_run','U') IS NOT NULL DROP TABLE ${SCHEMA}.assignment_run`);
    await ds.synchronize(); // 於 p2b_e2e schema 建 assignment_run + queue_job 兩表

    queue = new MssqlQueueService(ds);
    runRepo = ds.getRepository(AssignmentRun);
    producer = new RunQueueProducer(null, tuning(), mssqlConfig(), queue);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[AD-E07-40 P2b E2E] init failed → skip:', (e as Error)?.message);
    reachable = false;
    ds = null;
  }
}, 120000);

afterAll(async () => {
  if (ds) {
    try {
      await ds.query(`IF OBJECT_ID('${SCHEMA}.queue_job','U') IS NOT NULL DROP TABLE ${SCHEMA}.queue_job`);
      await ds.query(`IF OBJECT_ID('${SCHEMA}.assignment_run','U') IS NOT NULL DROP TABLE ${SCHEMA}.assignment_run`);
    } catch { /* noop */ }
  }
  await ds?.destroy().catch(() => undefined);
  restoreDbType();
});

beforeEach(async () => {
  if (!reachable || !ds) return;
  await ds.query(`DELETE FROM ${JOB_TBL}`);
  await ds.query(`DELETE FROM ${RUN_TBL}`);
});

describe('AD-E07-40 P2b E2E（真實 MSSQL 輪詢 loop drain）', () => {
  it('TS-MSSQL-P2B-E2E-001（🔴 DoD #3）：send → 輪詢撿到 → stub pipeline → status=completed；queue_job=completed', async (ctx) => {
    ensureMssql(ctx);
    const runId = await seedRun();
    const stub = makeCompleteStub();
    const consumer = makeConsumer(stub);
    await consumer.onModuleInit();
    try {
      const jobId = await producer.send({ runId, ym: '202606' });
      expect(typeof jobId).toBe('string');
      // key on queue_job=completed（pollOnce finally 之 complete 為最後動作，嚴格晚於 processPayload
      // 推進 run status）→ 一旦 job=completed，run status 必已落定，避免抽樣 race。
      const ok = await waitFor(async () => (await jobState(jobId!)) === 'completed');
      expect(ok, 'queue_job 未於逾時內 completed（worker 未撿到 / 未處理）').toBe(true);
      expect(await runStatus(runId)).toBe('completed');
      expect(stub.runPipeline).toHaveBeenCalledWith(runId, '202606');
    } finally {
      consumer.onModuleDestroy();
    }
  });

  it('TS-MSSQL-P2B-E2E-002：業務失敗 → status=failed；queue_job.state=completed（佇列層獨立落定）', async (ctx) => {
    ensureMssql(ctx);
    const runId = await seedRun();
    const stub = makeFailStub();
    const consumer = makeConsumer(stub);
    await consumer.onModuleInit();
    try {
      const jobId = await producer.send({ runId, ym: '202606' });
      // 同 E2E-001：key on queue_job=completed（佇列層最後動作）→ 保證 run status 已落定，再驗兩者。
      const ok = await waitFor(async () => (await jobState(jobId!)) === 'completed');
      expect(ok, 'queue_job 未於逾時內 completed').toBe(true);
      expect(await runStatus(runId)).toBe('failed'); // 業務層 failed
      expect(await jobState(jobId!)).toBe('completed'); // 佇列層 completed（retry=0，不因業務失敗卡住）
    } finally {
      consumer.onModuleDestroy();
    }
  });

  it('TS-MSSQL-P2B-E2E-003（🔴 D-CONC-01 drain）：連續 send 3 筆 → 單 worker 逐筆 drain 全部至終態', async (ctx) => {
    ensureMssql(ctx);
    const runIds = [await seedRun(), await seedRun(), await seedRun()];
    const stub = makeCompleteStub();
    const consumer = makeConsumer(stub);
    await consumer.onModuleInit();
    try {
      const jobIds: Array<string> = [];
      for (const runId of runIds) jobIds.push((await producer.send({ runId, ym: '202606' }))!);

      // key on 全部 queue_job=completed（每筆佇列層最後動作）→ 保證各 run status 已落定。
      const ok = await waitFor(
        async () => {
          const states = await Promise.all(jobIds.map((j) => jobState(j)));
          return states.every((s) => s === 'completed');
        },
        { timeout: 40000 },
      );
      expect(ok, '3 筆未於逾時內全部 drain（queue_job completed）').toBe(true);
      for (const r of runIds) expect(await runStatus(r)).toBe('completed');
      for (const j of jobIds) expect(await jobState(j)).toBe('completed');
    } finally {
      consumer.onModuleDestroy();
    }
  });

  it('TS-MSSQL-P2B-E2E-004（量測性，非阻擋）：send→pipeline 延遲落於 [0, pollIntervalMs+緩衝]', async (ctx) => {
    ensureMssql(ctx);
    const runId = await seedRun();
    let firstCallAt = 0;
    const stub = {
      runPipeline: vi.fn(async (rid: string) => {
        if (!firstCallAt) firstCallAt = performance.now();
        await ds!.query(`UPDATE ${RUN_TBL} SET status='completed' WHERE run_id=@0`, [rid]);
      }),
    };
    const consumer = makeConsumer(stub);
    await consumer.onModuleInit();
    try {
      const sentAt = performance.now();
      await producer.send({ runId, ym: '202606' });
      const ok = await waitFor(async () => (await runStatus(runId)) === 'completed');
      expect(ok).toBe(true);
      const latency = firstCallAt - sentAt;
      // eslint-disable-next-line no-console
      console.log(`[E2E-004] send→pipeline latency=${latency.toFixed(1)}ms (pollIntervalMs=${POLL_INTERVAL_MS})`);
      // 觀察性：延遲應為非負且不遠超一個輪詢週期（含一次 tick + claim/query 緩衝）。
      expect(latency).toBeGreaterThanOrEqual(0);
      expect(latency).toBeLessThan(POLL_INTERVAL_MS + 3000);
    } finally {
      consumer.onModuleDestroy();
    }
  });

  it('TS-MSSQL-P2B-E2E-005：cancel-before-consume → worker 不執行 pipeline；queue_job=cancelled，run 維持 pending', async (ctx) => {
    ensureMssql(ctx);
    const runId = await seedRun();
    const stub = makeCompleteStub();
    const consumer = makeConsumer(stub);
    // 先 send + cancel（趁輪詢尚未啟動）→ 再啟動輪詢，確保取消早於消費。
    const jobId = await producer.send({ runId, ym: '202606' });
    await producer.cancel(jobId!);
    expect(await jobState(jobId!)).toBe('cancelled');

    await consumer.onModuleInit();
    try {
      // 給予數個 tick 週期，證明 worker 不會撿起已取消 job。
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS * 5 + 300));
      expect(stub.runPipeline).not.toHaveBeenCalled();
      expect(await jobState(jobId!)).toBe('cancelled');
      expect(await runStatus(runId)).toBe('pending');
    } finally {
      consumer.onModuleDestroy();
    }
  });
});
