/**
 * AD-E07-40 P2c — 🔴 兩層回收獨立且一致（旗艦群組，真實 MSSQL）。
 *
 * 覆蓋測試設計 §二 RECOVERY（10 案例）：佇列層（queue_job.state='expired'，MssqlQueueService.expireSweep）
 *   與業務層（assignment_run.status='failed'，OrphanReaper.reap）兩層回收各自獨立、順序無關、結果一致。
 *
 * Harness（§0.5，最小化依賴、不透過 NestJS 完整 bootstrap）：
 *   - 真實 MssqlQueueService(ds)（P2a 黑盒依賴，直接 new）。
 *   - 真實 OrphanReaper（直接 new(runRepo, ds, TEST_TUNING)；零改動、只用不改）——比照 f098-orphan-reaper
 *     之 reap(now) 注入時鐘機制，非重新發明。
 *   - schema `p2c_e2e`（AssignmentRun + QueueJob 兩表 synchronize；不與既有保留 schema 交集）。
 *
 * 🔴 兩層「控制時間」手法本質不同（§0.3，非疏漏）：
 *   - 佇列層 expireSweep() **無** injectable now → 沿用 P2a 技術：直接 SQL 將 expire_at 撥至過去
 *     （DATEADD(SECOND,-100,expire_at)），expireSweep 內以 DB 端 SYSUTCDATETIME() 判定。
 *   - 業務層 OrphanReaper.reap(now) **有** 注入時鐘 → 傳「遠未來」now + 短 orphanThresholdMs 使其判定逾時
 *     （seed started_at/created_at 為近期，避開 tedious datetime2↔JS Date 時區偏移，以遠大於 ±12h 的時間差確保穩健）。
 *
 * 「模擬 worker 崩潰」＝ claimNext() 成功（queue_job→active）但**不** complete() + 配對 assignment_run
 *   設 status='running'、started_at=近期（processPayload 已推進 running 但尚未完成即崩潰）。
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
import type { ConfigService } from '@nestjs/config';
import { DataSource, Repository } from 'typeorm';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { QueueJob } from '@/database/entities/queue-job.entity';
import { MssqlQueueService } from '../mssql-queue.service';
import { OrphanReaper, ORPHAN_ERROR_MESSAGE } from '../orphan-reaper';
import { RunQueueConsumer } from '../run-queue.consumer';
import { DEFAULT_RUN_QUEUE_TUNING, RunQueueTuning } from '../run-queue-tuning.provider';
import { RUN_QUEUE_NAME, type RunJobPayload } from '../run-queue.constants';

vi.setConfig({ testTimeout: 120000 });

const SCHEMA = 'p2c_e2e';
const RUN_TBL = `[${SCHEMA}].[assignment_run]`;
const JOB_TBL = `[${SCHEMA}].[queue_job]`;

// 短 orphan 閾值（1s）；reaperIntervalMs=0（本檔直呼 reap，不啟動自動 setInterval）。
const TEST_TUNING: RunQueueTuning = {
  ...DEFAULT_RUN_QUEUE_TUNING,
  jobExpireInSeconds: 14400,
  reaperIntervalMs: 0,
  orphanThresholdMs: 1000,
  cancelPollIntervalMs: 0,
};

/** 遠未來注入時鐘：cutoff = FUTURE_NOW - 1s ≈ 10 天後 → 近期 started_at/created_at 必判逾時（時區穩健）。 */
function futureNow(): Date {
  return new Date(Date.now() + 10 * 86400_000);
}

let reachable = false;
let ds: DataSource | null = null;
let queue: MssqlQueueService;
let reaper: OrphanReaper;
let runRepo: Repository<AssignmentRun>;

function ensureMssql(ctx: { skip: () => void }): void {
  if (!reachable || !ds) {
    // eslint-disable-next-line no-console
    console.warn(`[AD-E07-40 P2c RECOVERY] SKIPPED — ${SKIP_REASON}`);
    ctx.skip();
  }
}

function mssqlConfig(): ConfigService {
  return { get: (k: string) => (k === 'DB_TYPE' ? 'mssql' : undefined) } as unknown as ConfigService;
}

/** 建一筆 assignment_run（status/時間欄由 DB 端 SYSUTCDATETIME 產生），回傳 run_id。 */
async function seedRun(status: string, timeCol: 'started_at' | 'created_at'): Promise<string> {
  // 兩欄皆填近期（started_at 供 running 分支、created_at 供 pending 分支）；未用之 timeCol 亦填近期無害。
  const rows: Array<{ run_id: string }> = await ds!.query(
    `INSERT INTO ${RUN_TBL} (run_id, project_workym, status, triggered_by, started_at, created_at)
     OUTPUT inserted.run_id
     VALUES (NEWID(), @0, @1, NEWID(),
             ${status === 'running' ? 'SYSUTCDATETIME()' : 'NULL'},
             SYSUTCDATETIME())`,
    ['202606', status],
  );
  void timeCol;
  return rows[0].run_id;
}

async function runStatus(runId: string): Promise<string | null> {
  const r = await ds!.query(`SELECT status FROM ${RUN_TBL} WHERE run_id = @0`, [runId]);
  return r[0]?.status ?? null;
}
async function getRun(runId: string): Promise<{ status: string; error_message: string | null; finished_at: Date | null }> {
  const r = await ds!.query(
    `SELECT status, error_message, finished_at FROM ${RUN_TBL} WHERE run_id = @0`,
    [runId],
  );
  return r[0];
}
async function jobState(jobId: string): Promise<string | null> {
  const r = await ds!.query(`SELECT state FROM ${JOB_TBL} WHERE id = @0`, [jobId]);
  return r[0]?.state ?? null;
}

/**
 * 模擬「已 claim 後崩潰」：seed running run + send job + claimNext（→ active，不 complete）
 *   + 直接 SQL 將 expire_at 撥至過去（§0.3 技術）。回傳 { jobId, runId }。
 */
async function simulateClaimedCrash(): Promise<{ jobId: string; runId: string }> {
  const runId = await seedRun('running', 'started_at');
  const jobId = await queue.send(RUN_QUEUE_NAME, { runId, ym: '202606' }, 0);
  const claimed = await queue.claimNext(RUN_QUEUE_NAME, TEST_TUNING.jobExpireInSeconds);
  expect(claimed?.jobId, 'claimNext 應撈到剛 send 的 job（崩潰模擬前置）').toBe(jobId);
  // §0.3 技術：直接 SQL 把 expire_at 撥至「明確過去」。基準為 DB 端 SYSUTCDATETIME()（非既有的
  //   14400s 未來值——否則 DATEADD(-100, 未來值) 仍在未來、不會被 sweep 判逾時），比照 P2a SWEEP-001。
  await ds!.query(
    `UPDATE ${JOB_TBL} SET expire_at = DATEADD(SECOND, -100, SYSUTCDATETIME()) WHERE id = @0`,
    [jobId],
  );
  return { jobId, runId };
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
    await ds.synchronize(); // 於 p2c_e2e schema 建 assignment_run + queue_job 兩表

    queue = new MssqlQueueService(ds);
    runRepo = ds.getRepository(AssignmentRun);
    // 真實 OrphanReaper（零改動、直接 new；比照 f098-orphan-reaper reap(now) 注入時鐘）。
    reaper = new OrphanReaper(runRepo, ds, TEST_TUNING);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[AD-E07-40 P2c RECOVERY] init failed → skip:', (e as Error)?.message);
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

describe('AD-E07-40 P2c RECOVERY（兩層回收獨立且一致，真實 MSSQL）', () => {
  it('TS-MSSQL-P2C-RECOVERY-001（🔴 DoD #2）：崩潰後 queue_job 逾時 → expireSweep 標 expired', async (ctx) => {
    ensureMssql(ctx);
    const { jobId } = await simulateClaimedCrash();
    await queue.expireSweep();
    expect(await jobState(jobId)).toBe('expired');
  });

  it('TS-MSSQL-P2C-RECOVERY-002（🔴 DoD #2，業務層不依賴佇列表）：reap 獨立標 run failed，即使 queue_job 仍 active', async (ctx) => {
    ensureMssql(ctx);
    const { jobId, runId } = await simulateClaimedCrash();
    // 故意不呼叫 expireSweep（queue_job 仍 active）。
    await reaper.reap(futureNow());
    const run = await getRun(runId);
    expect(run.status).toBe('failed');
    expect(run.error_message).toBe(ORPHAN_ERROR_MESSAGE);
    expect(await jobState(jobId)).toBe('active'); // reap 完全不觸碰佇列表
  });

  it('TS-MSSQL-P2C-RECOVERY-003（🔴 DoD #2，順序無關）：先 reap 後 sweep 結果與正常順序一致', async (ctx) => {
    ensureMssql(ctx);
    const { jobId, runId } = await simulateClaimedCrash();
    await reaper.reap(futureNow());
    await queue.expireSweep();
    expect(await jobState(jobId)).toBe('expired');
    expect(await runStatus(runId)).toBe('failed');
  });

  it('TS-MSSQL-P2C-RECOVERY-004（獨立性反證）：只 sweep 不 reap → queue_job=expired 但 run 仍 running', async (ctx) => {
    ensureMssql(ctx);
    const { jobId, runId } = await simulateClaimedCrash();
    await queue.expireSweep();
    expect(await jobState(jobId)).toBe('expired');
    expect(await runStatus(runId)).toBe('running'); // sweep 未觸碰業務表
  });

  it('TS-MSSQL-P2C-RECOVERY-005（獨立性反證，鏡像 004）：只 reap 不 sweep → run=failed 但 queue_job 仍 active', async (ctx) => {
    ensureMssql(ctx);
    const { jobId, runId } = await simulateClaimedCrash();
    await reaper.reap(futureNow());
    expect(await runStatus(runId)).toBe('failed');
    expect(await jobState(jobId)).toBe('active'); // reap 未觸碰佇列表
  });

  it('TS-MSSQL-P2C-RECOVERY-006：兩層皆執行後為穩定終態，重跑各自冪等不再變動', async (ctx) => {
    ensureMssql(ctx);
    const { jobId, runId } = await simulateClaimedCrash();
    await queue.expireSweep();
    await reaper.reap(futureNow());
    const first = await getRun(runId);
    expect(await jobState(jobId)).toBe('expired');
    expect(first.status).toBe('failed');

    // 重跑（全域 sweep + reap）→ 不再變動、error_message / finished_at 不被覆寫為不同值。
    await queue.expireSweep();
    await reaper.reap(futureNow());
    const second = await getRun(runId);
    expect(await jobState(jobId)).toBe('expired');
    expect(second.status).toBe('failed');
    expect(second.error_message).toBe(first.error_message);
    expect(new Date(second.finished_at as Date).getTime()).toBe(new Date(first.finished_at as Date).getTime());
  });

  it('TS-MSSQL-P2C-RECOVERY-007（retry=0，崩潰恢復整合語境）：expired job 不被 claimNext 重撈，且其他 created job 正常領取', async (ctx) => {
    ensureMssql(ctx);
    const { jobId } = await simulateClaimedCrash();
    await queue.expireSweep();
    expect(await jobState(jobId)).toBe('expired');
    // 另塞一筆正常 created，claimNext 應撈到它而非 expired 那筆。
    const freshJobId = await queue.send(RUN_QUEUE_NAME, { runId: 'fresh-run', ym: '202606' }, 0);
    const claimed = await queue.claimNext(RUN_QUEUE_NAME, TEST_TUNING.jobExpireInSeconds);
    expect(claimed?.jobId).toBe(freshJobId); // 撈到正常那筆
    expect(await jobState(jobId)).toBe('expired'); // expired 仍 expired、未被重派
  });

  it('TS-MSSQL-P2C-RECOVERY-008（非崩潰對照組）：正常 complete/completed 之 job/run 不被 sweep/reap 誤傷', async (ctx) => {
    ensureMssql(ctx);
    const runId = await seedRun('running', 'started_at');
    const jobId = await queue.send(RUN_QUEUE_NAME, { runId, ym: '202606' }, 0);
    const claimed = await queue.claimNext(RUN_QUEUE_NAME, TEST_TUNING.jobExpireInSeconds);
    await queue.complete(claimed!.jobId); // 佇列層正常完成 → completed
    await ds!.query(`UPDATE ${RUN_TBL} SET status='completed', finished_at=SYSUTCDATETIME() WHERE run_id=@0`, [runId]);

    // 施壓：極端 now（遠未來）使 reap 會判所有 running/pending 逾時；expireSweep 掃全域 active。
    await queue.expireSweep();
    await reaper.reap(futureNow());

    expect(await jobState(jobId)).toBe('completed'); // 未被改 expired（sweep 只掃 active）
    const run = await getRun(runId);
    expect(run.status).toBe('completed'); // 未被改 failed（reap 只掃 running/pending）
    expect(run.error_message ?? null).toBeNull();
  });

  it('TS-MSSQL-P2C-RECOVERY-009（批次崩潰）：3 筆同時崩潰 → sweep 一次全 expired、reap 一次全 failed', async (ctx) => {
    ensureMssql(ctx);
    const crashes: Array<{ jobId: string; runId: string }> = [];
    for (let i = 0; i < 3; i++) crashes.push(await simulateClaimedCrash());
    await queue.expireSweep();
    await reaper.reap(futureNow());
    for (const c of crashes) {
      expect(await jobState(c.jobId), `job ${c.jobId}`).toBe('expired');
      expect(await runStatus(c.runId), `run ${c.runId}`).toBe('failed');
    }
  });

  it('TS-MSSQL-P2C-RECOVERY-010（🔴 三片段協同：pending 孤兒未被 claim，既有 processPayload 防線）', async (ctx) => {
    ensureMssql(ctx);
    // send 一筆但不 claim（queue_job 保持 created）；對應 run 為 pending 逾時孤兒（OQ-F098-01）。
    const runId = await seedRun('pending', 'created_at');
    const jobId = await queue.send(RUN_QUEUE_NAME, { runId, ym: '202606' }, 0);

    // ① reap（pending 分支判定逾時）→ run failed。
    await reaper.reap(futureNow());
    expect(await runStatus(runId)).toBe('failed');

    // ② expireSweep → queue_job 仍 created（sweep 只掃 active，未 claim 之孤兒不受影響）。
    await queue.expireSweep();
    expect(await jobState(jobId)).toBe('created');

    // ③ claimNext 仍能撈到（因仍 created）。
    const claimed = await queue.claimNext(RUN_QUEUE_NAME, TEST_TUNING.jobExpireInSeconds);
    expect(claimed?.jobId).toBe(jobId);

    // ④ 若之後 processPayload：既有 run.status==='failed' 快路徑防線（P2b PAYLOAD-004）→ 略過 pipeline。
    const pipelineStub = { runPipeline: vi.fn(async () => undefined) };
    const consumer = new RunQueueConsumer(
      null,
      pipelineStub as any,
      runRepo,
      TEST_TUNING,
      mssqlConfig(),
      queue,
    );
    await (consumer as any).processPayload(claimed!.jobId, JSON.parse(claimed!.payload) as RunJobPayload);
    expect(pipelineStub.runPipeline).not.toHaveBeenCalled();
  });
});
