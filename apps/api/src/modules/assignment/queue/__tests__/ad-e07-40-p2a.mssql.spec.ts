/**
 * AD-E07-40 P2a — MSSQL 自建 T-SQL 佇列 queue_job schema + MssqlQueueService 五操作 + 併發正確性 harness。
 *
 * 覆蓋測試設計 AD-E07-40-P2a-test.md（59 案例，10 群組）：
 *   SCHEMA（15）  — queue_job 兩軌（synchronize p2a_sync / baseline migration p2a_baseline）結構 + filtered index
 *   UNIT（6）      — 五操作 SQL 文字/參數 spy（mock DataSource，免真實連線）
 *   SEND/CANCEL/CLAIM/COMPLETE/SWEEP（4/4/6/3/5）— 五操作對真實 MSSQL 之整合行為
 *   CONC（8）      — 🔴 併發正確性 harness（pool.max=20 專屬 DataSource + pool.max=1 對照鑑別力）
 *   STATIC（3）    — 命名鎖定 + 獨立性靜態守門
 *   REG（5）       — 回歸靜態守門（真實重跑於測試 session 層另行執行）
 *
 * 兩軌 Harness（測試設計 §0.2，比照 P1b2）：
 *   - Path A（synchronize）：schema `p2a_sync`（entity @Index → 一般索引）。
 *   - Path B（baseline migration）：schema `p2a_baseline`（手寫 filtered index；刻意不落 dbo，避免與 P1b2/P1b3 之
 *     dbo 全套 36 表 baseline 流程重疊，見測試設計 §0.2 之刻意偏離說明）。
 *
 * CONC 專屬 DataSource（測試設計 §0.3，I-MSSQL-QUEUE-TEST-CONCURRENCY-01）：pool.max=20（>K=10），
 *   否則 TypeORM mssql 連線池預設 max=1 會把並發 claim 靜默序列化 → 假陽性。
 *
 * Gating：連不上 MSSQL → 每個 DB 相依 test ctx.skip()（不偽造綠燈，feedback_mock_real_system_contract）。
 */

// 必最先 import（side-effect 設 DB_TYPE=mssql，供 entity 之 column-types helper 解析 mssql 分支值）。
import {
  restoreDbType,
  MSSQL,
  mssqlPortReachable,
  SKIP_REASON,
} from '@/database/__tests__/mssql-env-preload';

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { performance } from 'node:perf_hooks';
import { DataSource } from 'typeorm';

import {
  diffColumnSets,
  isEmptyComparison,
  type ColumnRow,
} from '@/database/__tests__/schema-parity';
import { QueueJob } from '@/database/entities/queue-job.entity';
import { MssqlQueueService } from '@/modules/assignment/queue/mssql-queue.service';
import { MssqlQueueJobSchema1751884800002 } from '@/database/migrations/mssql/1751884800002-MssqlQueueJobSchema';
import { RUN_QUEUE_NAME, type RunJobPayload } from '@/modules/assignment/queue/run-queue.constants';

// 測試設計 §0.4：比照 P1a/P1b1 慣例（feedback_pg_spec_parallel_timeout）。
vi.setConfig({ testTimeout: 120000 });

const SYNC_SCHEMA = 'p2a_sync'; // Path A
const BASELINE_SCHEMA = 'p2a_baseline'; // Path B
const SYNC_TBL = `[${SYNC_SCHEMA}].[queue_job]`;

const SERVICE_PATH = join(__dirname, '..', 'mssql-queue.service.ts');
const ENTITY_PATH = join(__dirname, '..', '..', '..', '..', 'database', 'entities', 'queue-job.entity.ts');
const MIGRATION_PATH = join(
  __dirname, '..', '..', '..', '..', 'database', 'migrations', 'mssql', '1751884800002-MssqlQueueJobSchema.ts',
);
const APP_MODULE_PATH = join(__dirname, '..', '..', '..', '..', 'app.module.ts');
const DATA_SOURCE_PATH = join(__dirname, '..', '..', '..', '..', 'database', 'data-source.ts');
const WORKER_APP_PATH = join(__dirname, '..', '..', '..', '..', 'worker-app.module.ts');
const SRC_ROOT = join(__dirname, '..', '..', '..', '..'); // apps/api/src

let reachable = false;
let ds: DataSource | null = null; // p2a_sync（synchronize，操作性群組共用）
let baselineDs: DataSource | null = null; // p2a_baseline（baseline migration）
let concDs: DataSource | null = null; // pool.max=20（CONC 專屬）
let poolMax1Ds: DataSource | null = null; // pool.max=1（CONC-006 對照）

let queue: MssqlQueueService; // 操作性群組
let concQueue: MssqlQueueService; // pool.max=20
let poolMax1Queue: MssqlQueueService; // pool.max=1 對照

function ensureMssql(ctx: { skip: () => void }): void {
  if (!reachable || !ds) {
    // eslint-disable-next-line no-console
    console.warn(`[AD-E07-40 P2a] SKIPPED — ${SKIP_REASON}`);
    ctx.skip();
  }
}

function baseMssqlOptions() {
  return {
    type: 'mssql' as const,
    host: MSSQL.host,
    port: MSSQL.port,
    username: MSSQL.username,
    password: MSSQL.password,
    database: MSSQL.database,
    options: {
      encrypt: MSSQL.encrypt,
      trustServerCertificate: MSSQL.trustServerCertificate,
    },
  };
}

// ── metadata / seed helpers ─────────────────────────────────────────────────

async function fetchColumns(schema: string): Promise<ColumnRow[]> {
  return ds!.query(
    `SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name, DATA_TYPE,
            CHARACTER_MAXIMUM_LENGTH, NUMERIC_PRECISION, NUMERIC_SCALE,
            DATETIME_PRECISION, IS_NULLABLE, COLUMN_DEFAULT
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = @0 AND TABLE_NAME = 'queue_job'`,
    [schema],
  );
}

interface IdxInfo {
  name: string;
  has_filter: boolean;
  filter_definition: string | null;
  columns: string[];
}

async function fetchQueueIndexes(schema: string): Promise<IdxInfo[]> {
  const rows: Array<{
    index_name: string;
    has_filter: boolean | number;
    filter_definition: string | null;
    column_name: string;
    key_ordinal: number;
  }> = await ds!.query(
    `SELECT i.name AS index_name, i.has_filter AS has_filter, i.filter_definition AS filter_definition,
            c.name AS column_name, ic.key_ordinal AS key_ordinal
     FROM sys.indexes i
     JOIN sys.tables t ON i.object_id = t.object_id
     JOIN sys.schemas s ON t.schema_id = s.schema_id
     JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id AND ic.is_included_column = 0
     JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
     WHERE s.name = @0 AND t.name = 'queue_job' AND i.is_primary_key = 0
     ORDER BY i.name, ic.key_ordinal`,
    [schema],
  );
  const map = new Map<string, IdxInfo>();
  for (const r of rows) {
    if (!map.has(r.index_name)) {
      map.set(r.index_name, {
        name: r.index_name,
        has_filter: Boolean(r.has_filter),
        filter_definition: r.filter_definition,
        columns: [],
      });
    }
    map.get(r.index_name)!.columns.push(r.column_name);
  }
  return [...map.values()];
}

/** 直接 INSERT 一筆 job（可控 created_at 供 FIFO 測試）；回傳 job id。 */
async function seedJob(opts: {
  queueName?: string;
  payload?: RunJobPayload;
  createdAt?: Date;
  state?: string;
} = {}): Promise<string> {
  const rows: Array<{ id: string }> = await ds!.query(
    `INSERT INTO ${SYNC_TBL} (id, queue_name, payload, state, retry_limit, created_at)
     OUTPUT inserted.id
     VALUES (NEWID(), @0, @1, @2, 0, @3)`,
    [
      opts.queueName ?? RUN_QUEUE_NAME,
      JSON.stringify(opts.payload ?? { runId: 'r', ym: '202606' }),
      opts.state ?? 'created',
      opts.createdAt ?? new Date(),
    ],
  );
  return rows[0].id;
}

async function getRow(
  id: string,
): Promise<{ state: string; started_at: Date | null; expire_at: Date | null; completed_at: Date | null; payload: string; retry_limit: number } | null> {
  const rows = await ds!.query(
    `SELECT state, started_at, expire_at, completed_at, payload, retry_limit FROM ${SYNC_TBL} WHERE id = @0`,
    [id],
  );
  return rows[0] ?? null;
}

async function countByState(state: string): Promise<number> {
  const r = await ds!.query(`SELECT COUNT(*) AS n FROM ${SYNC_TBL} WHERE state = @0`, [state]);
  return Number(r[0].n);
}

/** K 個並發 claim；同步記錄每個呼叫的發起時間戳（於 await 前）供 CONC-004 併發性證據。 */
async function runConcurrentClaims(
  svc: MssqlQueueService,
  k: number,
  expireSeconds = 14400,
): Promise<{ results: Array<{ jobId: string } | null>; starts: number[]; batchDuration: number }> {
  const starts: number[] = new Array(k);
  const batchStart = performance.now();
  const results = await Promise.all(
    Array.from({ length: k }, (_unused, i) => {
      starts[i] = performance.now(); // 於呼叫 claimNext() 之前立即（同步）記錄發起時間戳
      return svc.claimNext(RUN_QUEUE_NAME, expireSeconds);
    }),
  );
  const batchDuration = performance.now() - batchStart;
  return { results, starts, batchDuration };
}

/**
 * 🔴 排空式併發領取（drain）：反覆以 K 個並發 claim 直到某一輪領到 0 筆為止；回傳累計領取 id、每輪筆數、第一輪證據。
 *
 * ⚠️ 為何用 drain 而非「單一 Promise.all 恰領 M 筆」（實測驅動之必要修正，見 impl log 偏差 D-CONC-01）：
 *    READPAST（＝模擬 PG `FOR UPDATE SKIP LOCKED`）為「非阻塞、跳過被鎖列」語意——多個並發 claim 同時發出時，
 *    session 會跳過彼此瞬間持鎖的列，導致「單一並發突發」領到的筆數 < 可領筆數（實測 5 筆常只領到 2~4 筆，
 *    且 plain / filtered index 皆如此，非索引問題）。此為 SKIP-LOCKED 家族的固有正確行為（PG 亦然），
 *    非 bug。真正不變式是「絕不重複領取（no double-claim，I-MSSQL-QUEUE-CLAIM-01）」＋「反覆輪詢終能全部領完
 *    （no loss）」——後者正是 prod 單一 worker 輪詢 loop 的行為。故 drain 反覆併發突發，累計即得恰 M 筆、零重複。
 *    每一輪仍是真並發（Promise.all of K）；CONC-004 另證並發性（時間戳/耗時）。
 */
async function drainConcurrent(
  svc: MssqlQueueService,
  k: number,
  expireSeconds = 14400,
): Promise<{ allClaimed: string[]; burstSizes: number[]; firstBurstDuration: number; maxBurstDistinct: number }> {
  const allClaimed: string[] = [];
  const burstSizes: number[] = [];
  let firstBurstDuration = 0;
  let maxBurstDistinct = 0;
  for (let guard = 0; guard < 200; guard++) {
    const { results, batchDuration } = await runConcurrentClaims(svc, k, expireSeconds);
    const ids = results.filter((r): r is { jobId: string } => r !== null).map((r) => r.jobId);
    if (guard === 0) firstBurstDuration = batchDuration;
    // 每一輪突發內部：絕不重複領取（no double-claim 即時守門）。
    expect(new Set(ids).size, `burst ${guard} 內出現重複領取`).toBe(ids.length);
    burstSizes.push(ids.length);
    maxBurstDistinct = Math.max(maxBurstDistinct, ids.length);
    if (ids.length === 0) break;
    allClaimed.push(...ids);
  }
  return { allClaimed, burstSizes, firstBurstDuration, maxBurstDistinct };
}

// ── lifecycle ───────────────────────────────────────────────────────────────

beforeAll(async () => {
  reachable = await mssqlPortReachable(1500);
  if (!reachable) return;
  try {
    ds = new DataSource({
      ...baseMssqlOptions(),
      schema: SYNC_SCHEMA,
      entities: [QueueJob],
      synchronize: false,
    });
    await ds.initialize();

    // 建兩個測試 schema（皆非 dbo）+ 乾淨重建。
    await ds.query(`IF SCHEMA_ID('${SYNC_SCHEMA}') IS NULL EXEC('CREATE SCHEMA ${SYNC_SCHEMA}')`);
    await ds.query(`IF SCHEMA_ID('${BASELINE_SCHEMA}') IS NULL EXEC('CREATE SCHEMA ${BASELINE_SCHEMA}')`);
    await ds.query(`IF OBJECT_ID('${SYNC_SCHEMA}.queue_job','U') IS NOT NULL DROP TABLE ${SYNC_SCHEMA}.queue_job`);
    await ds.query(`IF OBJECT_ID('${BASELINE_SCHEMA}.queue_job','U') IS NOT NULL DROP TABLE ${BASELINE_SCHEMA}.queue_job`);
    await ds.query(`IF OBJECT_ID('${BASELINE_SCHEMA}.typeorm_migrations','U') IS NOT NULL DROP TABLE ${BASELINE_SCHEMA}.typeorm_migrations`);

    // Path A：synchronize → p2a_sync.queue_job（一般索引）。
    await ds.synchronize();

    // Path B：baseline migration → p2a_baseline.queue_job（filtered index）。直接 import migration class + runMigrations。
    baselineDs = new DataSource({
      ...baseMssqlOptions(),
      schema: BASELINE_SCHEMA,
      migrations: [MssqlQueueJobSchema1751884800002],
      migrationsTableName: 'typeorm_migrations',
      synchronize: false,
    });
    await baselineDs.initialize();
    await baselineDs.runMigrations();

    // CONC 專屬 DataSource：pool.max=20 ≥ K=10（I-MSSQL-QUEUE-TEST-CONCURRENCY-01）。
    // ⚠️ 此 pool 設定不得被靜默移除或調低（AD §8）——TypeORM mssql 連線池預設 max=1 會把並發 claim
    //    靜默序列化為假陽性；CONC-006 以 pool.max=1 對照證明計數斷言對序列化無鑑別力。
    concDs = new DataSource({
      ...baseMssqlOptions(),
      schema: SYNC_SCHEMA,
      entities: [QueueJob],
      synchronize: false,
      pool: { max: 20 },
    });
    await concDs.initialize();

    // CONC-006 對照：pool.max=1（TypeORM mssql driver 預設值），刻意保留以證明鑑別力。
    poolMax1Ds = new DataSource({
      ...baseMssqlOptions(),
      schema: SYNC_SCHEMA,
      entities: [QueueJob],
      synchronize: false,
      pool: { max: 1 },
    });
    await poolMax1Ds.initialize();

    queue = new MssqlQueueService(ds);
    concQueue = new MssqlQueueService(concDs);
    poolMax1Queue = new MssqlQueueService(poolMax1Ds);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[AD-E07-40 P2a] init failed → skip:', (e as Error)?.message);
    reachable = false;
    ds = null;
    return;
  }
}, 120000);

afterAll(async () => {
  if (ds) {
    try {
      await ds.query(`IF OBJECT_ID('${SYNC_SCHEMA}.queue_job','U') IS NOT NULL DROP TABLE ${SYNC_SCHEMA}.queue_job`);
      await ds.query(`IF OBJECT_ID('${BASELINE_SCHEMA}.queue_job','U') IS NOT NULL DROP TABLE ${BASELINE_SCHEMA}.queue_job`);
      await ds.query(`IF OBJECT_ID('${BASELINE_SCHEMA}.typeorm_migrations','U') IS NOT NULL DROP TABLE ${BASELINE_SCHEMA}.typeorm_migrations`);
    } catch { /* noop */ }
  }
  await poolMax1Ds?.destroy().catch(() => undefined);
  await concDs?.destroy().catch(() => undefined);
  await baselineDs?.destroy().catch(() => undefined);
  await ds?.destroy().catch(() => undefined);
  restoreDbType();
});

// 操作性/併發群組共用 p2a_sync.queue_job；每個 test 前清空（結構不受影響）。
beforeEach(async () => {
  if (!reachable || !ds) return;
  await ds.query(`DELETE FROM ${SYNC_TBL}`);
});

// ===========================================================================
// 一、SCHEMA — queue_job 表結構兩軌驗證
// ===========================================================================
describe('AD-E07-40 P2a SCHEMA', () => {
  it('TS-MSSQL-P2A-SCHEMA-001：Path A（synchronize，p2a_sync）建出 queue_job 表', async (ctx) => {
    ensureMssql(ctx);
    const rows = await ds!.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=@0 AND TABLE_NAME='queue_job'`,
      [SYNC_SCHEMA],
    );
    expect(rows.length).toBe(1);
  });

  it('TS-MSSQL-P2A-SCHEMA-002：Path B（baseline migration，p2a_baseline）建出 queue_job 表；typeorm_migrations 恰 1 筆', async (ctx) => {
    ensureMssql(ctx);
    const rows = await ds!.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=@0 AND TABLE_NAME='queue_job'`,
      [BASELINE_SCHEMA],
    );
    expect(rows.length).toBe(1);
    const mig = await ds!.query(`SELECT COUNT(*) AS n FROM [${BASELINE_SCHEMA}].[typeorm_migrations]`);
    expect(Number(mig[0].n)).toBe(1);
  });

  it('TS-MSSQL-P2A-SCHEMA-003：id 欄型別 = uniqueidentifier（兩路徑一致）', async (ctx) => {
    ensureMssql(ctx);
    for (const schema of [SYNC_SCHEMA, BASELINE_SCHEMA]) {
      const r = await ds!.query(
        `SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@0 AND TABLE_NAME='queue_job' AND COLUMN_NAME='id'`,
        [schema],
      );
      expect(r[0].DATA_TYPE, schema).toBe('uniqueidentifier');
    }
  });

  it('TS-MSSQL-P2A-SCHEMA-004：queue_name varchar(100) / state varchar(20) / retry_limit int（兩路徑一致）', async (ctx) => {
    ensureMssql(ctx);
    for (const schema of [SYNC_SCHEMA, BASELINE_SCHEMA]) {
      const cols = await fetchColumnsBySchema(schema);
      expect(cols.queue_name.DATA_TYPE, schema).toBe('varchar');
      expect(cols.queue_name.CHARACTER_MAXIMUM_LENGTH, schema).toBe(100);
      expect(cols.state.DATA_TYPE, schema).toBe('varchar');
      expect(cols.state.CHARACTER_MAXIMUM_LENGTH, schema).toBe(20);
      expect(cols.retry_limit.DATA_TYPE, schema).toBe('int');
    }
  });

  it('TS-MSSQL-P2A-SCHEMA-005：payload = nvarchar(MAX)（CHARACTER_MAXIMUM_LENGTH=-1，兩路徑一致）', async (ctx) => {
    ensureMssql(ctx);
    for (const schema of [SYNC_SCHEMA, BASELINE_SCHEMA]) {
      const cols = await fetchColumnsBySchema(schema);
      expect(cols.payload.DATA_TYPE, schema).toBe('nvarchar');
      expect(cols.payload.CHARACTER_MAXIMUM_LENGTH, schema).toBe(-1);
    }
  });

  it('TS-MSSQL-P2A-SCHEMA-006：4 個日期欄 datetime2；started_at/expire_at/completed_at nullable，其餘 NOT NULL（兩路徑一致）', async (ctx) => {
    ensureMssql(ctx);
    for (const schema of [SYNC_SCHEMA, BASELINE_SCHEMA]) {
      const cols = await fetchColumnsBySchema(schema);
      for (const dcol of ['created_at', 'started_at', 'expire_at', 'completed_at']) {
        expect(cols[dcol].DATA_TYPE, `${schema}.${dcol}`).toBe('datetime2');
      }
      for (const nn of ['id', 'queue_name', 'payload', 'state', 'retry_limit', 'created_at']) {
        expect(cols[nn].IS_NULLABLE, `${schema}.${nn}`).toBe('NO');
      }
      for (const nl of ['started_at', 'expire_at', 'completed_at']) {
        expect(cols[nl].IS_NULLABLE, `${schema}.${nl}`).toBe('YES');
      }
    }
  });

  it('TS-MSSQL-P2A-SCHEMA-007：state 預設 created、created_at 預設近似當下（smoke，Path A 插入僅必要值）', async (ctx) => {
    ensureMssql(ctx);
    const rows: Array<{ id: string }> = await ds!.query(
      `INSERT INTO ${SYNC_TBL} (queue_name, payload) OUTPUT inserted.id VALUES (@0, @1)`,
      [RUN_QUEUE_NAME, JSON.stringify({ runId: 'r', ym: '202606' })],
    );
    const row = await getRow(rows[0].id);
    expect(row!.state).toBe('created');
    const created = (await ds!.query(`SELECT created_at FROM ${SYNC_TBL} WHERE id=@0`, [rows[0].id]))[0].created_at as Date;
    expect(created).toBeInstanceOf(Date);
    expect(Math.abs(created.getTime() - Date.now())).toBeLessThan(12 * 3600 * 1000);
  });

  it('TS-MSSQL-P2A-SCHEMA-008（🔴 DoD 核心）：兩路徑欄位集合結構化 diff 為空（diffColumnSets）', async (ctx) => {
    ensureMssql(ctx);
    const a = await fetchColumns(SYNC_SCHEMA);
    const b = await fetchColumns(BASELINE_SCHEMA);
    const cmp = diffColumnSets(a, b);
    expect(cmp.fieldDiffs, JSON.stringify(cmp.fieldDiffs)).toEqual([]);
    expect(cmp.setDiffs, JSON.stringify(cmp.setDiffs)).toEqual([]);
    expect(isEmptyComparison(cmp)).toBe(true);
  });

  it('TS-MSSQL-P2A-SCHEMA-009（前置守門）：diffColumnSets 對本表具鑑別力（人工注入合成差異）', async (ctx) => {
    ensureMssql(ctx);
    const a = await fetchColumns(SYNC_SCHEMA);
    expect(a.length).toBeGreaterThan(0);
    const mutated: ColumnRow[] = a.map((r) => ({ ...r }));
    const idx = mutated.findIndex((r) => r.column_name === 'retry_limit');
    expect(idx).toBeGreaterThanOrEqual(0);
    mutated[idx].DATA_TYPE = 'bigint';
    const cmp = diffColumnSets(a, mutated);
    expect(cmp.setDiffs).toEqual([]);
    const hit = cmp.fieldDiffs.find(
      (d) => d.table === 'queue_job' && d.column === 'retry_limit' && d.field === 'DATA_TYPE',
    );
    expect(hit).toBeTruthy();
  });

  it('TS-MSSQL-P2A-SCHEMA-010（🔴 決策關卡／設計提醒）：queue_job 兩路徑索引同名但欄位刻意不同，不套用 diffIndexSets parity', () => {
    // 說明性守門（不執行 diffIndexSets）：Path A（@Index 一般索引）= idx_queue_job_pending(queue_name,state)
    //   / idx_queue_job_active_expiry(state,expire_at)；Path B（filtered index）同名但 (queue_name,created_at)
    //   WHERE state='created' / (expire_at) WHERE state='active'。既有 diffIndexSets 不含 has_filter，
    //   且比對 key 含欄位組成 → 會誤判為「兩側各自獨有」並掩蓋「同名定義不同」與 filter 差異這兩個關鍵事實。
    //   故本表索引改由 SCHEMA-011/012 各自獨立斷言；migration 原始碼已記錄此為刻意設計。
    const migSrc = readFileSync(MIGRATION_PATH, 'utf8');
    expect(migSrc).toContain('SCHEMA-010');
    expect(migSrc).toContain('diffIndexSets');
  });

  it('TS-MSSQL-P2A-SCHEMA-011：Path A 兩個一般索引結構正確、has_filter=false', async (ctx) => {
    ensureMssql(ctx);
    const idx = await fetchQueueIndexes(SYNC_SCHEMA);
    const pending = idx.find((i) => i.name === 'idx_queue_job_pending');
    const active = idx.find((i) => i.name === 'idx_queue_job_active_expiry');
    expect(pending, 'idx_queue_job_pending').toBeTruthy();
    expect(active, 'idx_queue_job_active_expiry').toBeTruthy();
    expect(pending!.columns).toEqual(['queue_name', 'state']);
    expect(pending!.has_filter).toBe(false);
    expect(active!.columns).toEqual(['state', 'expire_at']);
    expect(active!.has_filter).toBe(false);
  });

  it('TS-MSSQL-P2A-SCHEMA-012（🔴 DoD 核心）：Path B 兩個 filtered index 結構 + filter_definition 正確、has_filter=true', async (ctx) => {
    ensureMssql(ctx);
    const idx = await fetchQueueIndexes(BASELINE_SCHEMA);
    const pending = idx.find((i) => i.name === 'idx_queue_job_pending');
    const active = idx.find((i) => i.name === 'idx_queue_job_active_expiry');
    expect(pending, 'idx_queue_job_pending').toBeTruthy();
    expect(active, 'idx_queue_job_active_expiry').toBeTruthy();
    const norm = (s: string | null) => (s ?? '').replace(/[[\]\s]/g, '');
    expect(pending!.columns).toEqual(['queue_name', 'created_at']);
    expect(pending!.has_filter).toBe(true);
    expect(norm(pending!.filter_definition)).toContain("state='created'");
    expect(active!.columns).toEqual(['expire_at']);
    expect(active!.has_filter).toBe(true);
    expect(norm(active!.filter_definition)).toContain("state='active'");
  });

  it('TS-MSSQL-P2A-SCHEMA-013：app.module.ts 之 ALL_ENTITIES 已納入 QueueJob', () => {
    const src = readFileSync(APP_MODULE_PATH, 'utf8');
    const m = src.match(/const ALL_ENTITIES\s*=\s*\[([\s\S]*?)\];/);
    expect(m, 'ALL_ENTITIES 陣列字面未找到').toBeTruthy();
    expect(m![1]).toMatch(/\bQueueJob\b/);
    expect(src).toMatch(/import\s*\{\s*QueueJob\s*\}/);
  });

  it('TS-MSSQL-P2A-SCHEMA-014：data-source.ts / worker-app.module.ts glob 自動涵蓋新 entity/migration（非硬寫檔名）', () => {
    const dsSrc = readFileSync(DATA_SOURCE_PATH, 'utf8');
    const workerSrc = readFileSync(WORKER_APP_PATH, 'utf8');
    // entity glob（兩檔皆以 *.entity.{ts,js} 掃描 → 自動涵蓋 queue-job.entity.ts）。
    expect(dsSrc).toMatch(/\*\.entity\.\{ts,js\}/);
    expect(workerSrc).toMatch(/\*\.entity\.\{ts,js\}/);
    // migration glob（mssql 分支掃 migrations/mssql/* → 自動涵蓋新 baseline migration）。
    expect(dsSrc).toMatch(/'migrations',\s*'mssql'/);
    expect(dsSrc).toMatch(/\*\.\{ts,js\}/);
    // 非硬寫檔名清單。
    expect(dsSrc).not.toContain('1751884800002-MssqlQueueJobSchema');
    expect(dsSrc).not.toContain('queue-job.entity');
  });

  it('TS-MSSQL-P2A-SCHEMA-015：entity / migration 不含 driver-conditional schema 邏輯（AD §1 RESOLVED）', () => {
    for (const p of [ENTITY_PATH, MIGRATION_PATH]) {
      const src = readFileSync(p, 'utf8');
      expect(src, p).not.toMatch(/process\.env\.DB_TYPE/);
      expect(src, p).not.toMatch(/\bisPostgres\b/);
    }
  });
});

// 依欄位名索引查詢結果（SCHEMA-004/005/006 用）。
async function fetchColumnsBySchema(schema: string): Promise<Record<string, ColumnRow>> {
  const rows = await fetchColumns(schema);
  const out: Record<string, ColumnRow> = {};
  for (const r of rows) out[r.column_name] = r;
  return out;
}

// ===========================================================================
// 二、UNIT — 五操作 SQL 文字/參數 spy（mock DataSource，免真實連線）
// ===========================================================================
describe('AD-E07-40 P2a UNIT', () => {
  function mockService(queryResult: unknown[] = []) {
    const query = vi.fn(async () => queryResult);
    const mockDs = { options: {}, query } as unknown as DataSource;
    return { svc: new MssqlQueueService(mockDs), query };
  }

  it('TS-MSSQL-P2A-UNIT-001：send() SQL 含 INSERT INTO/queue_job/NEWID()/OUTPUT inserted.id，值以參數綁定', async () => {
    const { svc, query } = mockService([{ id: 'mock-id' }]);
    const id = await svc.send('assignment-run', { runId: 'r1', ym: '202606' }, 0);
    expect(id).toBe('mock-id');
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('INSERT INTO');
    expect(sql).toContain('queue_job');
    expect(sql).toContain('NEWID()');
    expect(sql).toContain('OUTPUT inserted.id');
    expect(params).toEqual(['assignment-run', JSON.stringify({ runId: 'r1', ym: '202606' }), 0]);
  });

  it('TS-MSSQL-P2A-UNIT-002：cancel() SQL 含 id 參數 + state = \'created\' 字面條件', async () => {
    const { svc, query } = mockService();
    await svc.cancel('job-1');
    const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toMatch(/id\s*=\s*@0/);
    expect(sql).toContain("state = 'created'");
    expect(params).toEqual(['job-1']);
  });

  it('TS-MSSQL-P2A-UNIT-003（🔴 I-MSSQL-QUEUE-CLAIM-01）：claimNext() 單一陳述式含 READPAST/ROWLOCK/UPDLOCK/OUTPUT/WITH(，僅 1 次 round-trip', async () => {
    const { svc, query } = mockService([]);
    await svc.claimNext('assignment-run', 14400);
    expect(query).toHaveBeenCalledTimes(1);
    const [sql] = query.mock.calls[0] as unknown as [string];
    expect(sql).toContain('READPAST');
    expect(sql).toContain('ROWLOCK');
    expect(sql).toContain('UPDLOCK');
    expect(sql).toContain('OUTPUT');
    expect(sql).toContain('WITH (');
    // 不存在任何獨立先行 SELECT round-trip：整個 claim 只有一次 query 呼叫（上方 toHaveBeenCalledTimes(1) 已守）。
  });

  it('TS-MSSQL-P2A-UNIT-004：complete() 單一 UPDATE ... WHERE id = @0，恰 1 次呼叫', async () => {
    const { svc, query } = mockService();
    await svc.complete('job-2');
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain("state = 'completed'");
    expect(sql).toContain('completed_at = SYSUTCDATETIME()');
    expect(sql).toMatch(/WHERE id = @0/);
    expect(params).toEqual(['job-2']);
  });

  it('TS-MSSQL-P2A-UNIT-005：expireSweep() SQL 含 state=\'active\' AND expire_at <= SYSUTCDATETIME() 及 ROWLOCK', async () => {
    const { svc, query } = mockService();
    await svc.expireSweep();
    const [sql] = query.mock.calls[0] as unknown as [string];
    expect(sql).toContain("state = 'active'");
    expect(sql).toContain('expire_at <= SYSUTCDATETIME()');
    expect(sql).toContain('ROWLOCK');
    expect(sql).toContain("state = 'expired'");
  });

  it('TS-MSSQL-P2A-UNIT-006：外部輸入一律具名參數，不字串內插（SQL injection 防線）', async () => {
    const { svc, query } = mockService([{ id: 'x' }]);
    const evil = "'; DROP TABLE queue_job; --";
    await svc.send('assignment-run', { runId: evil, ym: '202606' }, 0);
    const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).not.toContain('DROP TABLE');
    expect(sql).not.toContain(evil);
    expect(String(params[1])).toContain('DROP TABLE queue_job');
  });
});

// ===========================================================================
// 三、SEND
// ===========================================================================
describe('AD-E07-40 P2a SEND', () => {
  it('TS-MSSQL-P2A-SEND-001：send() 寫入 state=created 並回傳合法 uuid', async (ctx) => {
    ensureMssql(ctx);
    const id = await queue.send(RUN_QUEUE_NAME, { runId: 'r1', ym: '202606' }, 0);
    expect(id).toMatch(/^[0-9a-fA-F-]{36}$/);
    const row = await getRow(id);
    expect(row!.state).toBe('created');
    expect(JSON.parse(row!.payload)).toEqual({ runId: 'r1', ym: '202606' });
  });

  it('TS-MSSQL-P2A-SEND-002：retry_limit 正確寫入所帶入值', async (ctx) => {
    ensureMssql(ctx);
    const id = await queue.send(RUN_QUEUE_NAME, { runId: 'r', ym: '202606' }, 0);
    const row = await getRow(id);
    expect(row!.retry_limit).toBe(0);
  });

  it('TS-MSSQL-P2A-SEND-003：多次 send() 產生的 id 皆唯一', async (ctx) => {
    ensureMssql(ctx);
    const ids: string[] = [];
    for (let i = 0; i < 20; i++) ids.push(await queue.send(RUN_QUEUE_NAME, { runId: `r${i}`, ym: '202606' }, 0));
    expect(new Set(ids).size).toBe(20);
  });

  it('TS-MSSQL-P2A-SEND-004：created_at 由 DB 端 SYSUTCDATETIME() 產生（非 app 端傳入固定值）', async (ctx) => {
    ensureMssql(ctx);
    const before = Date.now();
    const id = await queue.send(RUN_QUEUE_NAME, { runId: 'r', ym: '202606' }, 0);
    const after = Date.now();
    const created = (await ds!.query(`SELECT created_at FROM ${SYNC_TBL} WHERE id=@0`, [id]))[0].created_at as Date;
    expect(created).toBeInstanceOf(Date);
    // TZ-safe 寬容窗（tedious datetime2→Date 可能有 UTC/local 偏移）：落於呼叫前後 ±12h 內即證明為近期 DB 生成值。
    expect(created.getTime()).toBeGreaterThan(before - 12 * 3600 * 1000);
    expect(created.getTime()).toBeLessThan(after + 12 * 3600 * 1000);
  });
});

// ===========================================================================
// 四、CANCEL
// ===========================================================================
describe('AD-E07-40 P2a CANCEL', () => {
  it('TS-MSSQL-P2A-CANCEL-001：send() 後 cancel() → state=cancelled', async (ctx) => {
    ensureMssql(ctx);
    const id = await queue.send(RUN_QUEUE_NAME, { runId: 'r', ym: '202606' }, 0);
    await queue.cancel(id);
    expect((await getRow(id))!.state).toBe('cancelled');
  });

  it('TS-MSSQL-P2A-CANCEL-002（🔴 §6.3.2）：cancel-before-claim → 該筆不被 claim；同佇列其他 created 正常領取', async (ctx) => {
    ensureMssql(ctx);
    const a = await seedJob({ createdAt: new Date(Date.now() - 2000) });
    const b = await seedJob({ createdAt: new Date(Date.now() - 1000) });
    await queue.cancel(a);
    const first = await queue.claimNext(RUN_QUEUE_NAME, 14400);
    const second = await queue.claimNext(RUN_QUEUE_NAME, 14400);
    expect(first).not.toBeNull();
    expect(first!.jobId).toBe(b);
    expect(second).toBeNull();
    expect((await getRow(a))!.state).toBe('cancelled');
  });

  it('TS-MSSQL-P2A-CANCEL-003：cancel() 對已 active job → 影響 0、狀態不變', async (ctx) => {
    ensureMssql(ctx);
    const id = await seedJob();
    await queue.claimNext(RUN_QUEUE_NAME, 14400);
    await expect(queue.cancel(id)).resolves.toBeUndefined();
    expect((await getRow(id))!.state).toBe('active');
  });

  it('TS-MSSQL-P2A-CANCEL-004：cancel() 對不存在 jobId → 不拋例外', async (ctx) => {
    ensureMssql(ctx);
    await expect(queue.cancel('11111111-1111-1111-1111-111111111111')).resolves.toBeUndefined();
  });
});

// ===========================================================================
// 五、CLAIM
// ===========================================================================
describe('AD-E07-40 P2a CLAIM', () => {
  it('TS-MSSQL-P2A-CLAIM-001：唯一一筆 created → claim 成功，state=active，started_at/expire_at 正確', async (ctx) => {
    ensureMssql(ctx);
    await seedJob();
    const claimed = await queue.claimNext(RUN_QUEUE_NAME, 14400);
    expect(claimed).not.toBeNull();
    const row = await getRow(claimed!.jobId);
    expect(row!.state).toBe('active');
    expect(row!.started_at).toBeInstanceOf(Date);
    expect(row!.expire_at).toBeInstanceOf(Date);
    const deltaSec = (row!.expire_at!.getTime() - row!.started_at!.getTime()) / 1000;
    expect(Math.abs(deltaSec - 14400)).toBeLessThan(5);
  });

  it('TS-MSSQL-P2A-CLAIM-002（🔴 §6.3.3）：對已 active job 再次 claim（序列）→ null', async (ctx) => {
    ensureMssql(ctx);
    await seedJob();
    const first = await queue.claimNext(RUN_QUEUE_NAME, 14400);
    expect(first).not.toBeNull();
    const second = await queue.claimNext(RUN_QUEUE_NAME, 14400);
    expect(second).toBeNull();
  });

  it('TS-MSSQL-P2A-CLAIM-003（§6.3.4 FIFO）：多筆依 created_at ASC 依序被領取', async (ctx) => {
    ensureMssql(ctx);
    const a = await seedJob({ payload: { runId: 'A', ym: '202606' }, createdAt: new Date(Date.now() - 3000) });
    const b = await seedJob({ payload: { runId: 'B', ym: '202606' }, createdAt: new Date(Date.now() - 2000) });
    const c = await seedJob({ payload: { runId: 'C', ym: '202606' }, createdAt: new Date(Date.now() - 1000) });
    const c1 = await queue.claimNext(RUN_QUEUE_NAME, 14400);
    const c2 = await queue.claimNext(RUN_QUEUE_NAME, 14400);
    const c3 = await queue.claimNext(RUN_QUEUE_NAME, 14400);
    expect([c1!.jobId, c2!.jobId, c3!.jobId]).toEqual([a, b, c]);
  });

  it('TS-MSSQL-P2A-CLAIM-004：空佇列 → claim 回傳 null，不拋例外', async (ctx) => {
    ensureMssql(ctx);
    const claimed = await queue.claimNext(RUN_QUEUE_NAME, 14400);
    expect(claimed).toBeNull();
  });

  it('TS-MSSQL-P2A-CLAIM-005：claim 僅選符合 queueName 的 job（跨佇列隔離）', async (ctx) => {
    ensureMssql(ctx);
    await seedJob({ queueName: 'assignment-run' });
    const other = await seedJob({ queueName: 'other-queue' });
    const claimed = await queue.claimNext('assignment-run', 14400);
    expect(claimed).not.toBeNull();
    expect((await getRow(other))!.state).toBe('created');
  });

  it('TS-MSSQL-P2A-CLAIM-006：payload JSON 往返不失真', async (ctx) => {
    ensureMssql(ctx);
    await queue.send(RUN_QUEUE_NAME, { runId: 'r-abc', ym: '202606' }, 0);
    const claimed = await queue.claimNext(RUN_QUEUE_NAME, 14400);
    expect(JSON.parse(claimed!.payload)).toEqual({ runId: 'r-abc', ym: '202606' });
  });
});

// ===========================================================================
// 六、COMPLETE
// ===========================================================================
describe('AD-E07-40 P2a COMPLETE', () => {
  it('TS-MSSQL-P2A-COMPLETE-001：complete() 後 state=completed、completed_at 有值', async (ctx) => {
    ensureMssql(ctx);
    await seedJob();
    const claimed = await queue.claimNext(RUN_QUEUE_NAME, 14400);
    await queue.complete(claimed!.jobId);
    const row = await getRow(claimed!.jobId);
    expect(row!.state).toBe('completed');
    expect(row!.completed_at).toBeInstanceOf(Date);
  });

  it('TS-MSSQL-P2A-COMPLETE-002：complete() 對已 completed / 不存在 jobId → 不拋例外', async (ctx) => {
    ensureMssql(ctx);
    const id = await seedJob();
    await queue.complete(id);
    await expect(queue.complete(id)).resolves.toBeUndefined();
    await expect(queue.complete('22222222-2222-2222-2222-222222222222')).resolves.toBeUndefined();
  });

  it('TS-MSSQL-P2A-COMPLETE-003：complete() 簽章僅接受 jobId（不區分業務成功/失敗）', async (ctx) => {
    ensureMssql(ctx);
    // 契約記錄：complete 只做狀態轉移，無 success/error 參數（業務失敗處理屬 P2b processPayload）。
    expect(queue.complete.length).toBe(1);
    const id = await seedJob();
    await expect(queue.complete(id)).resolves.toBeUndefined();
  });
});

// ===========================================================================
// 七、SWEEP
// ===========================================================================
describe('AD-E07-40 P2a SWEEP', () => {
  it('TS-MSSQL-P2A-SWEEP-001（🔴 §6.3.1）：claim 不 complete + expire_at 撥過去 → expireSweep 後 state=expired', async (ctx) => {
    ensureMssql(ctx);
    await seedJob();
    const claimed = await queue.claimNext(RUN_QUEUE_NAME, 1);
    await ds!.query(`UPDATE ${SYNC_TBL} SET expire_at = DATEADD(SECOND, -10, SYSUTCDATETIME()) WHERE id=@0`, [claimed!.jobId]);
    await queue.expireSweep();
    expect((await getRow(claimed!.jobId))!.state).toBe('expired');
  });

  it('TS-MSSQL-P2A-SWEEP-002（🔴 §6.3.1，retry=0 不自動重派）：expired 後 claimNext → null', async (ctx) => {
    ensureMssql(ctx);
    await seedJob();
    const claimed = await queue.claimNext(RUN_QUEUE_NAME, 1);
    await ds!.query(`UPDATE ${SYNC_TBL} SET expire_at = DATEADD(SECOND, -10, SYSUTCDATETIME()) WHERE id=@0`, [claimed!.jobId]);
    await queue.expireSweep();
    const again = await queue.claimNext(RUN_QUEUE_NAME, 14400);
    expect(again).toBeNull();
  });

  it('TS-MSSQL-P2A-SWEEP-003：未過期 active job 不受 sweep 影響', async (ctx) => {
    ensureMssql(ctx);
    await seedJob();
    const claimed = await queue.claimNext(RUN_QUEUE_NAME, 14400);
    await queue.expireSweep();
    expect((await getRow(claimed!.jobId))!.state).toBe('active');
  });

  it('TS-MSSQL-P2A-SWEEP-004：多筆同時過期 → 一次全部標 expired', async (ctx) => {
    ensureMssql(ctx);
    for (let i = 0; i < 3; i++) {
      const id = await seedJob();
      await queue.claimNext(RUN_QUEUE_NAME, 1);
      await ds!.query(`UPDATE ${SYNC_TBL} SET expire_at = DATEADD(SECOND, -10, SYSUTCDATETIME()) WHERE id=@0`, [id]);
    }
    await queue.expireSweep();
    expect(await countByState('expired')).toBe(3);
  });

  it('TS-MSSQL-P2A-SWEEP-005：sweep 對 created 狀態 job 不受影響（WHERE state=active 守門）', async (ctx) => {
    ensureMssql(ctx);
    const id = await seedJob();
    await queue.expireSweep();
    expect((await getRow(id))!.state).toBe('created');
  });
});

// ===========================================================================
// 八、CONC — 🔴 併發正確性 Harness
// ===========================================================================
describe('AD-E07-40 P2a CONC', () => {
  it('TS-MSSQL-P2A-CONC-001（🔴 前置守門）：CONC 專屬 DataSource pool.max ≥ 10', (ctx) => {
    ensureMssql(ctx);
    const poolMax = (concDs!.options as { pool?: { max?: number } }).pool?.max;
    expect(poolMax).toBeGreaterThanOrEqual(10);
    // 緊鄰設定處註解引用 I-MSSQL-QUEUE-TEST-CONCURRENCY-01（見 beforeAll concDs 建構），防止被靜默移除/調低。
    const selfSrc = readFileSync(join(__dirname, 'ad-e07-40-p2a.mssql.spec.ts'), 'utf8');
    expect(selfSrc).toContain('I-MSSQL-QUEUE-TEST-CONCURRENCY-01');
    expect(selfSrc).toMatch(/pool:\s*\{\s*max:\s*20\s*\}/);
  });

  it('TS-MSSQL-P2A-CONC-002（🔴 DoD，僧多粥少 M=5<K=10）：drain 後恰 5 次成功、無重複、無遺漏', async (ctx) => {
    ensureMssql(ctx);
    // 單一並發突發於 READPAST 下會 under-claim（SKIP-LOCKED 固有語意，見 drainConcurrent 說明）；
    // drain 反覆併發突發直到領完，累計即恰 M 筆、零重複、涵蓋全部 seed（無遺漏），為真正的併發正確性不變式。
    const seeded = new Set<string>();
    for (let i = 0; i < 5; i++) seeded.add(await seedJob({ payload: { runId: `m${i}`, ym: '202606' } }));
    const { allClaimed, maxBurstDistinct } = await drainConcurrent(concQueue, 10);
    expect(allClaimed.length, '重複領取（no double-claim 破線）').toBe(new Set(allClaimed).size);
    expect(allClaimed.length).toBe(5); // 累計恰 M 次成功
    expect(new Set(allClaimed)).toEqual(seeded); // 無遺漏、無 phantom（claimed ⊆ seed 且涵蓋全部）
    expect(await countByState('active')).toBe(5);
    expect(await countByState('created')).toBe(0);
    expect(maxBurstDistinct).toBeLessThanOrEqual(5); // 任一突發不會 over-claim
  });

  it('TS-MSSQL-P2A-CONC-003（🔴 DoD，粥多僧少 M=10>K=5）：drain 後恰 10 次成功、無重複，全部 active', async (ctx) => {
    ensureMssql(ctx);
    const seeded = new Set<string>();
    for (let i = 0; i < 10; i++) seeded.add(await seedJob({ payload: { runId: `n${i}`, ym: '202606' } }));
    const { allClaimed, maxBurstDistinct } = await drainConcurrent(concQueue, 5);
    expect(allClaimed.length).toBe(new Set(allClaimed).size); // 無重複
    expect(allClaimed.length).toBe(10);
    expect(new Set(allClaimed)).toEqual(seeded);
    expect(await countByState('created')).toBe(0);
    expect(await countByState('active')).toBe(10);
    expect(maxBurstDistinct).toBeLessThanOrEqual(5); // K=5 → 單一突發至多 5 筆（不 over-claim）
  });

  it('TS-MSSQL-P2A-CONC-004（🔴 併發性證據）：K=10 claim 確為並發送出，非序列化', async (ctx) => {
    ensureMssql(ctx);
    // 單次 claim 耗時基準（於已 warm 的 pool 上量測）。
    await seedJob(); // 供 baseline claim 一筆
    const t0 = performance.now();
    await concQueue.claimNext(RUN_QUEUE_NAME, 14400);
    const singleBaseline = performance.now() - t0;

    // 併發突發：seed 10 筆，一次 K=10 並發 claim，量測發起時間戳散佈與批次總耗時。
    for (let i = 0; i < 10; i++) await seedJob({ payload: { runId: `c${i}`, ym: '202606' } });
    const { starts, batchDuration } = await runConcurrentClaims(concQueue, 10);
    const spread = Math.max(...starts) - Math.min(...starts);

    // 證據 1：10 個發起時間戳於同一 event loop tick 內同步發起（必要非充分條件）。
    expect(spread).toBeLessThan(50);
    // 證據 2（充分）：批次總耗時遠小於「單次基準 × K」（若 ≈10× 則高度懷疑序列化）。
    expect(batchDuration).toBeLessThan(singleBaseline * 10);
    // eslint-disable-next-line no-console
    console.log(`[CONC-004] singleBaseline=${singleBaseline.toFixed(1)}ms batch(K=10)=${batchDuration.toFixed(1)}ms ratio=${(batchDuration / singleBaseline).toFixed(2)} startSpread=${spread.toFixed(1)}ms`);
  });

  it('TS-MSSQL-P2A-CONC-005：K = M（5/5）→ drain 後全部成功、無重複、全部 active', async (ctx) => {
    ensureMssql(ctx);
    const seeded = new Set<string>();
    for (let i = 0; i < 5; i++) seeded.add(await seedJob({ payload: { runId: `e${i}`, ym: '202606' } }));
    const { allClaimed } = await drainConcurrent(concQueue, 5);
    expect(allClaimed.length).toBe(new Set(allClaimed).size);
    expect(allClaimed.length).toBe(5);
    expect(new Set(allClaimed)).toEqual(seeded);
    expect(await countByState('active')).toBe(5);
  });

  it('TS-MSSQL-P2A-CONC-006（🔴 決策關卡，鑑別力驗證）：pool.max=1 vs =20 drain 計數皆正確（無鑑別力），耗時證明序列化', async (ctx) => {
    ensureMssql(ctx);
    // (1) pool.max=1（TypeORM 預設值）：M=5/K=10 → drain 計數仍正確（列鎖在序列化下依然正確，只是變慢）。
    for (let i = 0; i < 5; i++) await seedJob({ payload: { runId: `s${i}`, ym: '202606' } });
    const serial = await drainConcurrent(poolMax1Queue, 10);
    expect(serial.allClaimed.length).toBe(new Set(serial.allClaimed).size);
    expect(serial.allClaimed.length).toBe(5); // ← 計數正確，證明「drain 恰 M 次成功」對序列化無鑑別力

    // (2) pool.max=20：同場景，計數同樣正確。
    await ds!.query(`DELETE FROM ${SYNC_TBL}`);
    for (let i = 0; i < 5; i++) await seedJob({ payload: { runId: `p${i}`, ym: '202606' } });
    const concurrent = await drainConcurrent(concQueue, 10);
    expect(concurrent.allClaimed.length).toBe(5);

    // (3) 鑑別力：計數相同（皆 5），但「第一輪 K=10 突發」耗時可鑑別——序列化（pool.max=1，10 次序列 round-trip）
    //     之首輪耗時 > 真並發（pool.max=20，10 次並行）。此即「計數斷言不足以偵測序列化退化，須靠耗時/併發性
    //     證據」之直接反證（比照 PARITY-009 敏感度精神）。I-MSSQL-QUEUE-TEST-CONCURRENCY-01 之設定不得被靜默調低。
    // eslint-disable-next-line no-console
    console.log(`[CONC-006] serial(pool.max=1) firstBurst=${serial.firstBurstDuration.toFixed(1)}ms vs concurrent(pool.max=20) firstBurst=${concurrent.firstBurstDuration.toFixed(1)}ms — drain 計數皆=5（無鑑別力），耗時序列化>並發`);
    expect(serial.firstBurstDuration).toBeGreaterThan(concurrent.firstBurstDuration);
  });

  it('TS-MSSQL-P2A-CONC-007：連續兩輪 drain 併發 claim 可重複執行（無殘留鎖/連線洩漏）', async (ctx) => {
    ensureMssql(ctx);
    for (let round = 0; round < 2; round++) {
      await ds!.query(`DELETE FROM ${SYNC_TBL}`);
      const seeded = new Set<string>();
      for (let i = 0; i < 5; i++) seeded.add(await seedJob({ payload: { runId: `r${round}-${i}`, ym: '202606' } }));
      const { allClaimed } = await drainConcurrent(concQueue, 10);
      expect(allClaimed.length, `round ${round} 重複`).toBe(new Set(allClaimed).size);
      expect(allClaimed.length, `round ${round}`).toBe(5);
      expect(new Set(allClaimed), `round ${round}`).toEqual(seeded);
    }
  });

  it('TS-MSSQL-P2A-CONC-008：K 個並發 claim 對 0 筆 created → 全 null、無例外、無死鎖', async (ctx) => {
    ensureMssql(ctx);
    const { results } = await runConcurrentClaims(concQueue, 10);
    expect(results.every((r) => r === null)).toBe(true);
  });
});

// ===========================================================================
// 九、STATIC — 命名鎖定 + 獨立性靜態守門
// ===========================================================================
describe('AD-E07-40 P2a STATIC', () => {
  it('TS-MSSQL-P2A-STATIC-001：命名鎖定 — 類別/方法/表/欄位名與 AD §1/§2 一致', () => {
    const src = readFileSync(SERVICE_PATH, 'utf8');
    expect(src).toContain('export class MssqlQueueService');
    for (const m of ['send', 'cancel', 'claimNext', 'complete', 'expireSweep']) {
      expect(src, m).toMatch(new RegExp(`\\b${m}\\s*\\(`));
    }
    expect(src).toContain('queue_job');
    for (const col of ['queue_name', 'payload', 'state', 'retry_limit', 'created_at', 'started_at', 'expire_at', 'completed_at']) {
      expect(src, col).toContain(col);
    }
  });

  it('TS-MSSQL-P2A-STATIC-002（P2a DoD #4）：MssqlQueueService 不依賴 RunQueueProducer/RunQueueConsumer', () => {
    const src = readFileSync(SERVICE_PATH, 'utf8');
    expect(src).not.toContain('run-queue.producer');
    expect(src).not.toContain('run-queue.consumer');
    expect(src).not.toContain('RunQueueProducer');
    expect(src).not.toContain('RunQueueConsumer');
  });

  it('TS-MSSQL-P2A-STATIC-003：claim SQL 特徵字串（READPAST/UPDLOCK/ROWLOCK）於 src/ 僅命中 mssql-queue.service.ts 一處', () => {
    const hits = filesContaining(SRC_ROOT, /READPAST|UPDLOCK/);
    // 排除本測試檔本身（測試檔為斷言字串而含這些關鍵字，非第二份 SQL 實作）。
    const nonTest = hits.filter((f) => !f.endsWith('.spec.ts'));
    expect(nonTest).toEqual([join('modules', 'assignment', 'queue', 'mssql-queue.service.ts')]);
  });
});

/** 遞迴列出 src/ 下（相對路徑）內容符合 pattern 的檔案。 */
function filesContaining(root: string, pattern: RegExp): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        if (name === 'node_modules' || name === 'dist') continue;
        walk(full);
      } else if (name.endsWith('.ts')) {
        if (pattern.test(readFileSync(full, 'utf8'))) out.push(full.slice(root.length + 1));
      }
    }
  };
  walk(root);
  return out;
}

// ===========================================================================
// 十、REG — 回歸靜態守門（真實重跑既有套件於測試 session 層另行執行）
// ===========================================================================
describe('AD-E07-40 P2a REG', () => {
  it('TS-MSSQL-P2A-REG-001：新增 QueueJob entity / MssqlQueueService / migration 可載入（權威 tsc 閘於 session 層另跑）', () => {
    // vitest 走 swc、不做型別檢查（feedback_vitest_no_typecheck）；權威型別閘為
    //   `npx tsc --noEmit -p tsconfig.build.json`（於測試 session 層執行，見 impl log）。
    // 本案例作為輕量守門：三個新產出於檔頭 import 後皆為合法 class（載入無 fatal 錯誤）。
    expect(typeof QueueJob).toBe('function');
    expect(typeof MssqlQueueService).toBe('function');
    expect(typeof MssqlQueueJobSchema1751884800002).toBe('function');
  });

  it('TS-MSSQL-P2A-REG-002（靜態）：既有 F098 佇列套件檔存在且本輪未 import/改動（decouple 守門）', () => {
    const f098Dir = join(__dirname);
    const files = readdirSync(f098Dir).filter((f) => f.startsWith('f098-') && f.endsWith('.spec.ts'));
    expect(files.length).toBeGreaterThanOrEqual(7);
    const serviceSrc = readFileSync(SERVICE_PATH, 'utf8');
    expect(serviceSrc).not.toContain('f098');
  });

  it('TS-MSSQL-P2A-REG-003（靜態）：queue-job.entity.ts 使用 portable helper（sqlite/pg synchronize 可用），無 mssql-only 硬型別', () => {
    const src = readFileSync(ENTITY_PATH, 'utf8');
    expect(src).toContain('dateColumnType');
    expect(src).toContain('longTextColumnType');
    // 不硬寫 mssql 專屬型別（應走 helper）。
    expect(src).not.toMatch(/type:\s*'datetime2'/);
    expect(src).not.toMatch(/type:\s*'nvarchar'/);
  });

  it('TS-MSSQL-P2A-REG-004（靜態）：既有業務程式碼無 queue_job 之 JOIN/查詢（PG 上為無害空表）', () => {
    const hits = filesContaining(SRC_ROOT, /\bqueue_job\b/);
    const nonTest = hits.filter((f) => !f.endsWith('.spec.ts'));
    // 僅新 entity / 新 migration / 新 service 三處合法引用 queue_job；無其他業務查詢。
    const allowed = [
      join('database', 'entities', 'queue-job.entity.ts'),
      join('database', 'migrations', 'mssql', '1751884800002-MssqlQueueJobSchema.ts'),
      join('modules', 'assignment', 'queue', 'mssql-queue.service.ts'),
    ];
    for (const f of nonTest) expect(allowed, f).toContain(f);
  });

  it('TS-MSSQL-P2A-REG-005（靜態）：p2a_sync/p2a_baseline 與既有保留 schema（dbo/p1a/p1b*）無交集', () => {
    expect([SYNC_SCHEMA, BASELINE_SCHEMA]).toEqual(['p2a_sync', 'p2a_baseline']);
    for (const reserved of ['dbo', 'p1a', 'p1b1', 'p1b2_sync', 'p1b3']) {
      expect([SYNC_SCHEMA, BASELINE_SCHEMA]).not.toContain(reserved);
    }
  });
});
