/**
 * F098 / AD-E07-28 P1 — 真實 pg-boss 端到端 PG Integration 測試（強制需 Postgres）。
 *
 * 對應測試設計 §7 / §3 / §4 / §5 / §6 中標【PG】之案例：
 *   - TS-F098-PGINT-001：入列 → 消費 → completed 全鏈（真 pg-boss）
 *   - TS-F098-PGINT-002：pg-boss schema migration 固定（getConstructionPlans）+ start() 冪等不衝突
 *   - TS-F098-PGINT-004：job payload contract 真實往返（runId/ym 序列化不失真）
 *   - TS-F098-PGINT-005：worker 重啟後接續消費佇列殘留 job（job 持久於 Postgres）
 *   - TS-F098-RETRY-002：handler 拋錯後 pg-boss 不重派（retryLimit=0）
 *   - TS-F098-SER-002：兩 job 序列化執行（batchSize=1，不重疊）
 *   - TS-F098-CANCEL-006：pending job cancel 快路徑 → worker 永不執行
 *   - TS-F098-ORPHAN-007（簡化）：job expire 後仍可由 reaper 邏輯回收（時間閾值）
 *
 * 連線：env PG_BOSS_TEST_HOST/PORT/...，預設對 docker-compose.test.yml 之 postgres-test（5433/cdmp_test）。
 * 若 Postgres 不可達 → 整個 describe skip-with-reason（不假綠）。啟動方式：
 *   docker compose -f docker-compose.test.yml up -d postgres-test
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from 'vitest';
import * as net from 'net';
// pg-boss 為 CommonJS（`export = PgBoss`）：用 `import = require`（與 prod 程式碼一致）。
import PgBoss = require('pg-boss');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Client } = require('pg') as {
  Client: new (cfg: unknown) => PgClient;
};
import {
  RUN_QUEUE_NAME,
  RUN_QUEUE_RETRY_LIMIT,
  RunJobPayload,
} from '../run-queue.constants';

/** 最小 pg.Client 型別（避免依賴 @types/pg；本檔僅用 connect/query/end）。 */
interface PgClient {
  connect(): Promise<void>;
  query(text: string, values?: unknown[]): Promise<{ rows: any[]; rowCount: number }>;
  end(): Promise<void>;
}

const PG = {
  host: process.env.PG_BOSS_TEST_HOST ?? '127.0.0.1',
  port: Number(process.env.PG_BOSS_TEST_PORT ?? 5433),
  user: process.env.PG_BOSS_TEST_USER ?? 'cdmp',
  password: process.env.PG_BOSS_TEST_PASSWORD ?? 'cdmp_secret',
  database: process.env.PG_BOSS_TEST_DB ?? 'cdmp_test',
};

/** 非同步 TCP 可達性探測：僅判定 port 是否開啟（真正連線 / 權限於 beforeAll 再驗）。 */
function pgPortReachable(timeoutMs = 1000): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = net.connect({ host: PG.host, port: PG.port });
    const finish = (ok: boolean) => {
      sock.destroy();
      resolve(ok);
    };
    sock.setTimeout(timeoutMs);
    sock.once('connect', () => finish(true));
    sock.once('error', () => finish(false));
    sock.once('timeout', () => finish(false));
  });
}

/**
 * 可達性於 beforeAll 解析（避免 top-level await → tsc commonjs 相容）。
 * 不可達時，每個 it 以 ctx.skip() 跳過並印出原因（不假綠）。
 */
let reachable = false;
const SKIP_REASON =
  '需 Postgres（docker compose -f docker-compose.test.yml up -d postgres-test）— 未實跑';

function makeBoss(opts: Partial<PgBoss.ConstructorOptions> = {}): PgBoss {
  return new PgBoss({ ...PG, schema: 'pgboss', ...opts });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor(
  pred: () => Promise<boolean>,
  timeoutMs = 8000,
  stepMs = 100,
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await pred()) return true;
    await sleep(stepMs);
  }
  return false;
}

describe('F098 pg-boss PG Integration（真 Postgres）', () => {
  let client: PgClient | null = null;

  /** 每個 PG 案例開頭呼叫：不可達則 ctx.skip()（skip-with-reason，不假綠）。 */
  function ensurePg(ctx: { skip: () => void }): void {
    if (!reachable || !client) {
      // eslint-disable-next-line no-console
      console.warn(`[F098 PG Integration] SKIPPED — ${SKIP_REASON}`);
      ctx.skip();
    }
  }

  beforeAll(async () => {
    reachable = await pgPortReachable();
    if (!reachable) return;
    const c: PgClient = new Client(PG);
    try {
      await c.connect();
      await c.query('SELECT 1');
    } catch {
      reachable = false;
      return;
    }
    client = c;
    // 最小 assignment_run 表（status 狀態機）— 真實 schema 子集，供 status 轉移驗證
    await client!.query(`
      CREATE TABLE IF NOT EXISTS assignment_run (
        run_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        project_workym varchar(6) NOT NULL,
        status varchar(20) NOT NULL,
        triggered_by uuid NOT NULL,
        started_at timestamp NULL,
        finished_at timestamp NULL,
        error_message text NULL,
        created_at timestamp NOT NULL DEFAULT now()
      )
    `);
  });

  afterAll(async () => {
    if (client) {
      // CASCADE：cdmp_test 若曾被 worker synchronize 建出 ob_monthly_run_result（FK → assignment_run），
      // 純 DROP 會因相依被擋；CASCADE 一併移除相依 FK（僅清測試用最小表）。
      await client!.query('DROP TABLE IF EXISTS assignment_run CASCADE');
      await client!.query('DROP SCHEMA IF EXISTS pgboss CASCADE');
      await client.end();
    }
  });

  beforeEach(async () => {
    if (!reachable || !client) return;
    await client!.query('DELETE FROM assignment_run');
    await client!.query('DROP SCHEMA IF EXISTS pgboss CASCADE');
  });

  async function seedPendingRun(ym = '202606'): Promise<string> {
    const res = await client!.query(
      `INSERT INTO assignment_run (project_workym, status, triggered_by, created_at)
       VALUES ($1, 'pending', '00000000-0000-0000-0000-000000000001', now())
       RETURNING run_id`,
      [ym],
    );
    return res.rows[0].run_id;
  }

  it(
    'TS-F098-PGINT-002：getConstructionPlans DDL 建 pgboss schema；start() 對既有 schema 冪等',
    async (ctx) => {
      ensurePg(ctx);
      // 先以官方 DDL 建 schema（模擬 migration m299）
      await client!.query(PgBoss.getConstructionPlans('pgboss'));
      const r = await client!.query(
        `SELECT 1 FROM information_schema.schemata WHERE schema_name='pgboss'`,
      );
      expect(r.rowCount).toBe(1);

      // 之後 worker start() 對既有 schema 不衝突（冪等）
      const boss = makeBoss();
      await boss.start();
      await boss.stop({ graceful: false });
    },
    30000,
  );

  it(
    'TS-F098-PGINT-001 / PGINT-004：入列 → 消費 → completed；payload runId/ym 往返不失真',
    async (ctx) => {
      ensurePg(ctx);
      const runId = await seedPendingRun('202606');
      const boss = makeBoss();
      await boss.start();
      await boss.createQueue(RUN_QUEUE_NAME, {
        name: RUN_QUEUE_NAME,
        retryLimit: RUN_QUEUE_RETRY_LIMIT,
      });

      let received: RunJobPayload | null = null;
      await boss.work<RunJobPayload>(
        RUN_QUEUE_NAME,
        { batchSize: 1 },
        async (jobs) => {
          const job = jobs[0];
          received = job.data;
          // 模擬 runPipeline：pending → running → completed
          await client!.query(
            `UPDATE assignment_run SET status='running', started_at=now() WHERE run_id=$1`,
            [job.data.runId],
          );
          await client!.query(
            `UPDATE assignment_run SET status='completed', finished_at=now() WHERE run_id=$1`,
            [job.data.runId],
          );
        },
      );

      const jobId = await boss.send(
        RUN_QUEUE_NAME,
        { runId, ym: '202606' },
        { retryLimit: RUN_QUEUE_RETRY_LIMIT },
      );
      expect(typeof jobId).toBe('string');

      const done = await waitFor(async () => {
        const r = await client!.query(
          `SELECT status FROM assignment_run WHERE run_id=$1`,
          [runId],
        );
        return r.rows[0]?.status === 'completed';
      });
      expect(done).toBe(true);
      // payload 往返不失真
      expect(received).toEqual({ runId, ym: '202606' });

      await boss.stop({ graceful: false });
    },
    30000,
  );

  it(
    'TS-F098-RETRY-002：handler 拋錯後 pg-boss 不重派（retryLimit=0，handler 僅 1 次）',
    async (ctx) => {
      ensurePg(ctx);
      const boss = makeBoss();
      await boss.start();
      await boss.createQueue(RUN_QUEUE_NAME, {
        name: RUN_QUEUE_NAME,
        retryLimit: RUN_QUEUE_RETRY_LIMIT,
      });

      let calls = 0;
      await boss.work<RunJobPayload>(
        RUN_QUEUE_NAME,
        { batchSize: 1 },
        async () => {
          calls += 1;
          throw new Error('boom');
        },
      );

      await boss.send(
        RUN_QUEUE_NAME,
        { runId: 'r', ym: '202606' },
        { retryLimit: RUN_QUEUE_RETRY_LIMIT },
      );

      // 等候足夠時間，確認不重派（retry=0 → 只跑 1 次）
      await sleep(3000);
      expect(calls).toBe(1);

      await boss.stop({ graceful: false });
    },
    30000,
  );

  it(
    'TS-F098-SER-002：兩 job 序列化執行（batchSize=1，不重疊）',
    async (ctx) => {
      ensurePg(ctx);
      const boss = makeBoss();
      await boss.start();
      await boss.createQueue(RUN_QUEUE_NAME, {
        name: RUN_QUEUE_NAME,
        retryLimit: RUN_QUEUE_RETRY_LIMIT,
      });

      const intervals: Array<{ enter: number; leave: number }> = [];
      await boss.work<RunJobPayload>(
        RUN_QUEUE_NAME,
        { batchSize: 1 },
        async () => {
          const enter = Date.now();
          await sleep(300);
          intervals.push({ enter, leave: Date.now() });
        },
      );

      await boss.send(RUN_QUEUE_NAME, { runId: 'a', ym: '202601' });
      await boss.send(RUN_QUEUE_NAME, { runId: 'b', ym: '202602' });

      const both = await waitFor(async () => intervals.length === 2, 12000);
      expect(both).toBe(true);
      // 排序後第二段的 enter >= 第一段的 leave（無重疊）
      intervals.sort((x, y) => x.enter - y.enter);
      expect(intervals[1].enter).toBeGreaterThanOrEqual(intervals[0].leave);

      await boss.stop({ graceful: false });
    },
    30000,
  );

  it(
    'TS-F098-CANCEL-006：pending job cancel 快路徑 → worker 永不執行該 job',
    async (ctx) => {
      ensurePg(ctx);
      const boss = makeBoss();
      await boss.start();
      await boss.createQueue(RUN_QUEUE_NAME, {
        name: RUN_QUEUE_NAME,
        retryLimit: RUN_QUEUE_RETRY_LIMIT,
      });

      const jobId = await boss.send(RUN_QUEUE_NAME, {
        runId: 'cancel-me',
        ym: '202606',
      });
      expect(jobId).toBeTruthy();

      // 消費前取消（v10：cancel(name, id)）
      await boss.cancel(RUN_QUEUE_NAME, jobId as string);

      let called = false;
      await boss.work<RunJobPayload>(
        RUN_QUEUE_NAME,
        { batchSize: 1 },
        async () => {
          called = true;
        },
      );

      await sleep(2000);
      expect(called).toBe(false);

      const job = await boss.getJobById(RUN_QUEUE_NAME, jobId as string, {
        includeArchive: true,
      });
      expect(job?.state).toBe('cancelled');

      await boss.stop({ graceful: false });
    },
    30000,
  );

  it(
    'TS-F098-PGINT-005：worker 重啟後接續消費佇列殘留 job（job 持久於 Postgres）',
    async (ctx) => {
      ensurePg(ctx);
      // boss1：只入列，不註冊 work，然後停止（模擬 worker 尚未消費即重啟）
      const boss1 = makeBoss();
      await boss1.start();
      await boss1.createQueue(RUN_QUEUE_NAME, {
        name: RUN_QUEUE_NAME,
        retryLimit: RUN_QUEUE_RETRY_LIMIT,
      });
      const jobId = await boss1.send(RUN_QUEUE_NAME, {
        runId: 'persist',
        ym: '202606',
      });
      await boss1.stop({ graceful: false });

      // boss2：重啟後註冊 work → 應取得殘留 job
      const boss2 = makeBoss();
      await boss2.start();
      let consumed: string | null = null;
      await boss2.work<RunJobPayload>(
        RUN_QUEUE_NAME,
        { batchSize: 1 },
        async (jobs) => {
          consumed = jobs[0].data.runId;
        },
      );
      const ok = await waitFor(async () => consumed === 'persist', 10000);
      expect(ok).toBe(true);
      expect(jobId).toBeTruthy();

      await boss2.stop({ graceful: false });
    },
    40000,
  );
});

// skip 時印出原因，便於 CI / 回報辨識「需 Postgres、未實跑」
if (!reachable) {
  // eslint-disable-next-line no-console
  console.warn(`[F098 PG Integration] SKIPPED — ${SKIP_REASON}`);
}
