/**
 * AD-E07-40 P2b — Producer/Consumer 接線 + 輪詢 Loop + processPayload 共用（fake/unit，免真實連線）。
 *
 * 覆蓋測試設計 AD-E07-40-P2b-test.md 之 fake/unit 群組（§0.2；PG 全面移除後收斂為 mssql 單一路徑，
 * 原 postgres/boss 分支之 DISPATCH-004 / POLL-001 / PAYLOAD-007 已刪）：
 *   一、DISPATCH（4）— driver 判定 + 防呆（mssql 走 MssqlQueueService；非 mssql 不啟輪詢）
 *   二、PROD（5）     — Producer 業務行為（轉接 MssqlQueueService）
 *   三、POLL（9）     — Consumer 輪詢 loop（reentrancy guard + 生命週期，vi.useFakeTimers）
 *   四、PAYLOAD（7）  — processPayload 共用（I-MSSQL-QUEUE-PAYLOAD-UNITY-01）+ JSON.parse 轉接
 *   七、STATIC（3）   — 命名鎖定 + 前瞻性守門
 *   （ZERO-003 靜態守門一併置於本檔末，orphan-reaper / cancellation-poller 零改動）
 *
 * 手法（§0.2）：fake `MssqlQueueService` + fake `ConfigService`（driver 判定）+ `vi.useFakeTimers()`
 *   （輪詢時序）。需 MSSQL：否，CI 恆常執行。
 *
 * Level: Unit。需 Postgres/MSSQL：否。
 */
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import type { ConfigService } from '@nestjs/config';
import { RunQueueProducer } from '../run-queue.producer';
import {
  RunQueueConsumer,
  WORKER_INTERRUPTED_ERROR_MESSAGE,
} from '../run-queue.consumer';
import type { MssqlQueueService } from '../mssql-queue.service';
import { DEFAULT_RUN_QUEUE_TUNING, RunQueueTuning } from '../run-queue-tuning.provider';
import { RUN_QUEUE_NAME } from '../run-queue.constants';

// ── 檔案路徑（靜態守門用）────────────────────────────────────────────────────
const QUEUE_DIR = join(__dirname, '..');
const CONSUMER_PATH = join(QUEUE_DIR, 'run-queue.consumer.ts');
const PRODUCER_PATH = join(QUEUE_DIR, 'run-queue.producer.ts');
const PROVIDER_PATH = join(QUEUE_DIR, 'run-queue-tuning.provider.ts');
const REAPER_PATH = join(QUEUE_DIR, 'orphan-reaper.ts');
const CANCEL_PATH = join(QUEUE_DIR, 'cancellation-poller.ts');
const SERVICE_PATH = join(QUEUE_DIR, 'mssql-queue.service.ts');
const ASSIGNMENT_MODULE_PATH = join(__dirname, '..', '..', 'assignment.module.ts');
const SRC_ROOT = join(__dirname, '..', '..', '..', '..'); // apps/api/src

/** 移除 // 行註解與 block 註解（使守門僅針對實際程式碼，比照 f098-static-guards）。 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** 遞迴列出 src/ 下（相對路徑）內容符合 pattern 的 .ts 檔（比照 P2a filesContaining）。 */
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

// ── fake 依賴工廠 ────────────────────────────────────────────────────────────
function makeConfig(dbType: string): ConfigService {
  return {
    get: (key: string) => (key === 'DB_TYPE' ? dbType : undefined),
  } as unknown as ConfigService;
}

interface FakeMssqlQueue {
  send: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
  claimNext: ReturnType<typeof vi.fn>;
  complete: ReturnType<typeof vi.fn>;
  expireSweep: ReturnType<typeof vi.fn>;
}
function makeMssqlQueue(): FakeMssqlQueue {
  return {
    send: vi.fn(async () => 'mssql-job-id'),
    cancel: vi.fn(async () => undefined),
    claimNext: vi.fn(async () => null),
    complete: vi.fn(async () => undefined),
    expireSweep: vi.fn(async () => undefined),
  };
}
function asSvc(q: FakeMssqlQueue): MssqlQueueService {
  return q as unknown as MssqlQueueService;
}

function makeConsumer(opts: {
  dbType?: string | null;
  mssqlQueue?: FakeMssqlQueue | null;
  tuning?: RunQueueTuning;
  pipeline?: { runPipeline: ReturnType<typeof vi.fn> };
  runRepo?: { findOne: ReturnType<typeof vi.fn> };
}): RunQueueConsumer {
  const pipeline = opts.pipeline ?? { runPipeline: vi.fn(async () => undefined) };
  const runRepo =
    opts.runRepo ?? { findOne: vi.fn(async () => ({ run_id: 'r1', status: 'pending' })) };
  return new RunQueueConsumer(
    pipeline as any,
    runRepo as any,
    opts.tuning ?? DEFAULT_RUN_QUEUE_TUNING,
    opts.dbType == null ? null : makeConfig(opts.dbType),
    opts.mssqlQueue ? asSvc(opts.mssqlQueue) : null,
  );
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ===========================================================================
// 一、DISPATCH — 🔴 driver 三分支 MUST-FIX 守門
// ===========================================================================
describe('AD-E07-40 P2b DISPATCH（driver 三分支 MUST-FIX）', () => {
  it('TS-MSSQL-P2B-DISPATCH-001：mssql → send 呼叫 mssqlQueue.send', async () => {
    const mq = makeMssqlQueue();
    const producer = new RunQueueProducer(asSvc(mq));
    const jobId = await producer.send({ runId: 'r1', ym: '202606' });
    expect(mq.send).toHaveBeenCalledTimes(1);
    expect(jobId).toBe('mssql-job-id');
  });

  it('TS-MSSQL-P2B-DISPATCH-002：mssql → cancel 呼叫 mssqlQueue.cancel', async () => {
    const mq = makeMssqlQueue();
    const producer = new RunQueueProducer(asSvc(mq));
    await producer.cancel('some-job-id');
    expect(mq.cancel).toHaveBeenCalledTimes(1);
    expect(mq.cancel).toHaveBeenCalledWith('some-job-id');
  });

  it('TS-MSSQL-P2B-DISPATCH-003（🔴 最核心守門）：mssql → onModuleInit 啟動輪詢（setInterval 1 次），不 warn', async () => {
    const mq = makeMssqlQueue();
    const consumer = makeConsumer({ dbType: 'mssql', mssqlQueue: mq });
    const warnSpy = vi.spyOn((consumer as any).logger, 'warn');
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    await consumer.onModuleInit();
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).not.toHaveBeenCalled();
    consumer.onModuleDestroy(); // 清 timer，避免懸掛 handle
  });

  it('TS-MSSQL-P2B-DISPATCH-005：非 mssql（sqlite，無 mssqlQueue）→ 防呆保留，不啟動輪詢', async () => {
    // producer 無 mssqlQueue → send 拋（佇列不可用）；consumer config=null → 走 process.env.DB_TYPE（測試預設 sqlite）。
    const producer = new RunQueueProducer(null);
    const consumer = makeConsumer({ dbType: null, mssqlQueue: null });
    const warnSpy = vi.spyOn((consumer as any).logger, 'warn');
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');

    await expect(producer.send({ runId: 'r', ym: '202606' })).rejects.toThrow();
    await expect(producer.cancel('j')).resolves.toBeUndefined();
    await expect(consumer.onModuleInit()).resolves.toBeUndefined();
    expect(setIntervalSpy).not.toHaveBeenCalled(); // 非 mssql → 不啟輪詢
    expect(warnSpy).toHaveBeenCalledTimes(1); // onModuleInit warn+return
  });

  it('TS-MSSQL-P2B-CONFIG-006（🔴 MUST-FIX，AD §4.2 缺口）：assignment.module.ts providers 含 MssqlQueueService（API 程序）', () => {
    const src = stripComments(readFileSync(ASSIGNMENT_MODULE_PATH, 'utf8'));
    // import 存在
    expect(/import\s*\{\s*MssqlQueueService\s*\}/.test(src)).toBe(true);
    // providers 陣列內含 MssqlQueueService（非僅 import）
    const providersBlock = src.slice(src.indexOf('providers:'), src.indexOf('exports:'));
    expect(/\bMssqlQueueService\b/.test(providersBlock)).toBe(true);
  });
});

// ===========================================================================
// 二、PROD — Producer mssql 分支業務行為
// ===========================================================================
describe('AD-E07-40 P2b PROD（Producer mssql 分支）', () => {
  let mq: FakeMssqlQueue;
  let producer: RunQueueProducer;
  beforeEach(() => {
    mq = makeMssqlQueue();
    producer = new RunQueueProducer(asSvc(mq));
  });

  it('TS-MSSQL-P2B-PROD-001：send mssql 分支參數 = (RUN_QUEUE_NAME, payload, RUN_QUEUE_RETRY_LIMIT=0)', async () => {
    await producer.send({ runId: 'r1', ym: '202606' });
    expect(mq.send).toHaveBeenCalledTimes(1);
    const [queueName, payload, retryLimit] = mq.send.mock.calls[0];
    expect(queueName).toBe(RUN_QUEUE_NAME);
    expect(queueName).toBe('assignment-run');
    expect(payload).toEqual({ runId: 'r1', ym: '202606' });
    expect(retryLimit).toBe(0);
  });

  it('TS-MSSQL-P2B-PROD-002：send 回傳 mssqlQueue.send 之 jobId（string），簽章不變', async () => {
    mq.send.mockResolvedValueOnce('11111111-2222-3333-4444-555555555555');
    const result = await producer.send({ runId: 'r2', ym: '202607' });
    expect(typeof result).toBe('string');
    expect(result).toBe('11111111-2222-3333-4444-555555555555');
  });

  it('TS-MSSQL-P2B-PROD-003：cancel mssql 分支呼叫 mssqlQueue.cancel(jobId)', async () => {
    await producer.cancel('job-abc');
    expect(mq.cancel).toHaveBeenCalledTimes(1);
    expect(mq.cancel).toHaveBeenCalledWith('job-abc');
  });

  it('TS-MSSQL-P2B-PROD-004：cancel 對已消費/不存在 job 由底層吞錯（正常 resolve）→ producer 不拋、不誤判', async () => {
    // MssqlQueueService.cancel 影響列數 0 亦正常 resolve（P2a CANCEL-003/004）→ producer 正常 resolve。
    mq.cancel.mockResolvedValueOnce(undefined);
    await expect(producer.cancel('gone')).resolves.toBeUndefined();
  });

  it('TS-MSSQL-P2B-PROD-005：mssql 分支 queueName 引用 RUN_QUEUE_NAME 常數，不硬寫字面字串', () => {
    const src = readFileSync(PRODUCER_PATH, 'utf8');
    // mssql send 呼叫以 RUN_QUEUE_NAME 為第一參數
    expect(/this\.mssqlQueue!?\.send\(\s*RUN_QUEUE_NAME/.test(src)).toBe(true);
    // 整檔（含 mssql 分支）無硬寫 'assignment-run' 字面字串
    expect(src.includes("'assignment-run'")).toBe(false);
  });
});

// ===========================================================================
// 三、POLL — Consumer 輪詢 Loop（reentrancy + 生命週期）
// ===========================================================================
describe('AD-E07-40 P2b POLL（輪詢 loop）', () => {
  it('TS-MSSQL-P2B-POLL-002：mssql 分支啟動輪詢（setInterval 1 次）', async () => {
    const mq = makeMssqlQueue();
    const consumer = makeConsumer({ dbType: 'mssql', mssqlQueue: mq });
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    await consumer.onModuleInit();
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    consumer.onModuleDestroy();
  });

  it('TS-MSSQL-P2B-POLL-003：輪詢間隔 = tuning.pollIntervalMs（注入 500；未注入 → 2000）', async () => {
    const mq = makeMssqlQueue();
    // (a) 注入 500
    const c1 = makeConsumer({
      dbType: 'mssql',
      mssqlQueue: mq,
      tuning: { ...DEFAULT_RUN_QUEUE_TUNING, pollIntervalMs: 500 },
    });
    const spy1 = vi.spyOn(globalThis, 'setInterval');
    await c1.onModuleInit();
    expect(spy1.mock.calls[0][1]).toBe(500);
    c1.onModuleDestroy();
    spy1.mockRestore();

    // (b) 預設（DEFAULT_RUN_QUEUE_TUNING.pollIntervalMs = 2000）
    const c2 = makeConsumer({ dbType: 'mssql', mssqlQueue: makeMssqlQueue() });
    const spy2 = vi.spyOn(globalThis, 'setInterval');
    await c2.onModuleInit();
    expect(spy2.mock.calls[0][1]).toBe(2000);
    c2.onModuleDestroy();
  });

  it('TS-MSSQL-P2B-POLL-004：pollOnce claimNext=null → 不呼叫 processPayload、不呼叫 complete', async () => {
    const mq = makeMssqlQueue();
    mq.claimNext.mockResolvedValueOnce(null);
    const consumer = makeConsumer({ dbType: 'mssql', mssqlQueue: mq });
    const ppSpy = vi.spyOn(consumer as any, 'processPayload');
    await (consumer as any).pollOnce();
    expect(ppSpy).not.toHaveBeenCalled();
    expect(mq.complete).not.toHaveBeenCalled();
  });

  it('TS-MSSQL-P2B-POLL-005：pollOnce claimNext=一筆 → 先 processPayload 再 complete（順序斷言）', async () => {
    const mq = makeMssqlQueue();
    mq.claimNext.mockResolvedValueOnce({
      jobId: 'j1',
      payload: '{"runId":"r1","ym":"202606"}',
      retryLimit: 0,
    });
    const consumer = makeConsumer({ dbType: 'mssql', mssqlQueue: mq });
    const ppSpy = vi.spyOn(consumer as any, 'processPayload').mockResolvedValue(undefined);
    await (consumer as any).pollOnce();
    expect(ppSpy).toHaveBeenCalledTimes(1);
    expect(mq.complete).toHaveBeenCalledTimes(1);
    expect(mq.complete).toHaveBeenCalledWith('j1');
    // complete 於 processPayload resolve 之後才呼叫
    expect(ppSpy.mock.invocationCallOrder[0]).toBeLessThan(mq.complete.mock.invocationCallOrder[0]);
  });

  it('TS-MSSQL-P2B-POLL-006：pollOnce 業務失敗（pipeline 拋錯，被 processPayload 內部吞）→ complete 仍呼叫、pollOnce 不拋', async () => {
    const mq = makeMssqlQueue();
    mq.claimNext.mockResolvedValueOnce({
      jobId: 'j1',
      payload: '{"runId":"r1","ym":"202606"}',
      retryLimit: 0,
    });
    const pipeline = { runPipeline: vi.fn(async () => { throw new Error('stage exploded'); }) };
    const runRepo = { findOne: vi.fn(async () => ({ run_id: 'r1', status: 'pending' })) };
    const consumer = makeConsumer({ dbType: 'mssql', mssqlQueue: mq, pipeline, runRepo });
    await expect((consumer as any).pollOnce()).resolves.toBeUndefined();
    expect(mq.complete).toHaveBeenCalledTimes(1);
    expect(mq.complete).toHaveBeenCalledWith('j1');
  });

  it('TS-MSSQL-P2B-POLL-007（🔴 I-MSSQL-QUEUE-SERIAL-01，reentrancy guard）：in-flight 期間下一輪 tick 被 guard 擋下', async () => {
    vi.useFakeTimers();
    const mq = makeMssqlQueue();
    // claimNext 回傳「可由測試外部控制何時 resolve」的 promise（模擬 processPayload 仍在執行中）。
    const resolvers: Array<(v: unknown) => void> = [];
    mq.claimNext.mockImplementation(() => new Promise((res) => resolvers.push(res)));
    const consumer = makeConsumer({
      dbType: 'mssql',
      mssqlQueue: mq,
      tuning: { ...DEFAULT_RUN_QUEUE_TUNING, pollIntervalMs: 100 },
    });
    await consumer.onModuleInit();

    await vi.advanceTimersByTimeAsync(100); // 第一次 tick：claimNext 進入、pending（in-flight）
    await vi.advanceTimersByTimeAsync(100); // 第二次 tick：polling===true → 被 guard 擋
    await vi.advanceTimersByTimeAsync(100); // 第三次 tick：同上
    expect(mq.claimNext).toHaveBeenCalledTimes(1);

    // 放行第一輪（resolve null → pollOnce 完成、polling 重置 false）
    resolvers[0](null);
    await vi.advanceTimersByTimeAsync(0); // flush microtasks（finally 重置 polling）
    await vi.advanceTimersByTimeAsync(100); // 下一輪 tick 允許再次進入
    expect(mq.claimNext).toHaveBeenCalledTimes(2);

    consumer.onModuleDestroy();
  });

  it('TS-MSSQL-P2B-POLL-008：單輪 tick 例外（claimNext reject）→ 被 catch、guard 於 finally 重置、下一輪仍觸發', async () => {
    vi.useFakeTimers();
    const mq = makeMssqlQueue();
    mq.claimNext
      .mockRejectedValueOnce(new Error('claim boom'))
      .mockResolvedValueOnce(null);
    const consumer = makeConsumer({
      dbType: 'mssql',
      mssqlQueue: mq,
      tuning: { ...DEFAULT_RUN_QUEUE_TUNING, pollIntervalMs: 100 },
    });
    const errSpy = vi.spyOn((consumer as any).logger, 'error');
    await consumer.onModuleInit();

    await vi.advanceTimersByTimeAsync(100); // 第一輪：claimNext reject → catch 記 error、finally 重置 polling
    await vi.advanceTimersByTimeAsync(100); // 第二輪：guard 已重置 → claimNext 再次呼叫（resolve null）
    expect(mq.claimNext).toHaveBeenCalledTimes(2);
    expect(errSpy).toHaveBeenCalled();

    consumer.onModuleDestroy();
  });

  it('TS-MSSQL-P2B-POLL-009（🔴 DoD #4）：onModuleDestroy 清 pollTimer；destroy 後 claimNext 不再被呼叫', async () => {
    vi.useFakeTimers();
    const mq = makeMssqlQueue();
    mq.claimNext.mockResolvedValue(null);
    const consumer = makeConsumer({
      dbType: 'mssql',
      mssqlQueue: mq,
      tuning: { ...DEFAULT_RUN_QUEUE_TUNING, pollIntervalMs: 100 },
    });
    await consumer.onModuleInit();
    await vi.advanceTimersByTimeAsync(100); // 至少完成一輪
    const countBefore = mq.claimNext.mock.calls.length;
    expect(countBefore).toBeGreaterThanOrEqual(1);

    consumer.onModuleDestroy();
    await vi.advanceTimersByTimeAsync(500); // destroy 後推進數個週期
    expect(mq.claimNext.mock.calls.length).toBe(countBefore);
    expect((consumer as any).pollTimer).toBeNull();
  });

  it('TS-MSSQL-P2B-POLL-010（Meta/範圍界定）：SIGTERM 優雅關閉由既有 worker-main SIGTERM handler + onModuleDestroy 組合滿足', () => {
    // 說明性守門（非常規 pass/fail）：P2b 不改 worker-main.ts（AD §4.2「不變」）；
    // appContext.close() 觸發 NestJS onModuleDestroy → RunQueueConsumer.onModuleDestroy（POLL-009 已驗）。
    const workerMain = stripComments(readFileSync(join(SRC_ROOT, 'worker-main.ts'), 'utf8'));
    expect(/SIGTERM/.test(workerMain)).toBe(true);
    expect(/appContext\.close\(\)/.test(workerMain)).toBe(true);
    const consumerSrc = stripComments(readFileSync(CONSUMER_PATH, 'utf8'));
    expect(/onModuleDestroy/.test(consumerSrc)).toBe(true);
  });
});

// ===========================================================================
// 五、SHUTDOWN — 優雅關閉時標記中斷 run（殭屍防治）
// ===========================================================================
describe('P2b SHUTDOWN（onModuleDestroy 標記中斷 run 為 failed）', () => {
  /** 可鏈式 update query builder mock，捕捉 set/where/andWhere/execute 呼叫。 */
  function makeUpdateQB(affected = 1) {
    const captured: any = {};
    const qb: any = {
      update: vi.fn(() => qb),
      set: vi.fn((v: any) => {
        captured.set = v;
        return qb;
      }),
      where: vi.fn((w: any, p: any) => {
        captured.where = [w, p];
        return qb;
      }),
      andWhere: vi.fn((w: any, p: any) => {
        captured.andWhere = [w, p];
        return qb;
      }),
      execute: vi.fn(async () => ({ affected })),
    };
    return { qb, captured };
  }

  it('SHUTDOWN-001：currentRunId 有值 → UPDATE status=failed + WORKER_INTERRUPTED_ERROR_MESSAGE，狀態守衛 running', async () => {
    const { qb, captured } = makeUpdateQB(1);
    const runRepo = {
      findOne: vi.fn(),
      createQueryBuilder: vi.fn(() => qb),
    };
    const consumer = makeConsumer({
      dbType: 'mssql',
      mssqlQueue: makeMssqlQueue(),
      runRepo: runRepo as any,
    });
    (consumer as any).currentRunId = 'r-stuck';
    await consumer.onModuleDestroy();

    expect(runRepo.createQueryBuilder).toHaveBeenCalledTimes(1);
    expect(captured.set.status).toBe('failed');
    expect(captured.set.error_message).toBe(WORKER_INTERRUPTED_ERROR_MESSAGE);
    expect(captured.set.finished_at).toBeInstanceOf(Date);
    // where run_id + 狀態守衛 status='running'（不覆寫 completed / 已取消 failed）
    expect(captured.where[0]).toMatch(/run_id/);
    expect(captured.where[1]).toEqual({ runId: 'r-stuck' });
    expect(captured.andWhere[0]).toMatch(/status/);
    expect(captured.andWhere[1]).toEqual({ running: 'running' });
  });

  it('SHUTDOWN-002：currentRunId 為 null（無 in-flight）→ 不觸碰 runRepo', async () => {
    const runRepo = { findOne: vi.fn(), createQueryBuilder: vi.fn() };
    const consumer = makeConsumer({
      dbType: 'mssql',
      mssqlQueue: makeMssqlQueue(),
      runRepo: runRepo as any,
    });
    // currentRunId 預設 null
    await consumer.onModuleDestroy();
    expect(runRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('SHUTDOWN-003：UPDATE 失敗（連線已關）→ best-effort 吞錯，不阻擋關閉', async () => {
    const runRepo = {
      findOne: vi.fn(),
      createQueryBuilder: vi.fn(() => {
        throw new Error('connection closed');
      }),
    };
    const consumer = makeConsumer({
      dbType: 'mssql',
      mssqlQueue: makeMssqlQueue(),
      runRepo: runRepo as any,
    });
    (consumer as any).currentRunId = 'r-stuck';
    await expect(consumer.onModuleDestroy()).resolves.toBeUndefined();
  });

  it('SHUTDOWN-004：processPayload 期間 currentRunId 標記、結束後歸零（in-flight 生命週期）', async () => {
    let seenDuring: string | null | undefined = 'UNSET' as any;
    const consumerRef: { c?: RunQueueConsumer } = {};
    const pipeline = {
      runPipeline: vi.fn(async () => {
        seenDuring = (consumerRef.c as any).currentRunId;
      }),
    };
    const runRepo = { findOne: vi.fn(async () => ({ run_id: 'r-abc', status: 'pending' })) };
    const consumer = makeConsumer({
      dbType: 'mssql',
      mssqlQueue: makeMssqlQueue(),
      pipeline,
      runRepo,
    });
    consumerRef.c = consumer;
    await (consumer as any).processPayload('job-1', { runId: 'r-abc', ym: '202607' });
    expect(seenDuring).toBe('r-abc'); // 執行途中已標記
    expect((consumer as any).currentRunId).toBeNull(); // finally 歸零
  });

  it('SHUTDOWN-005：pipeline 拋錯後 currentRunId 仍歸零（finally 保證）', async () => {
    const pipeline = { runPipeline: vi.fn(async () => { throw new Error('boom'); }) };
    const runRepo = { findOne: vi.fn(async () => ({ run_id: 'r1', status: 'pending' })) };
    const consumer = makeConsumer({
      dbType: 'mssql',
      mssqlQueue: makeMssqlQueue(),
      pipeline,
      runRepo,
    });
    await (consumer as any).processPayload('job-1', { runId: 'r1', ym: '202606' });
    expect((consumer as any).currentRunId).toBeNull();
  });
});

// ===========================================================================
// 四、PAYLOAD — 🔴 processPayload 共用
// ===========================================================================
describe('AD-E07-40 P2b PAYLOAD（processPayload 共用）', () => {
  it('TS-MSSQL-P2B-PAYLOAD-001（🔴 旗艦）：mssql（pollOnce）領到 job → 呼叫 processPayload', async () => {
    const mq = makeMssqlQueue();
    mq.claimNext.mockResolvedValueOnce({
      jobId: 'j1',
      payload: '{"runId":"r1","ym":"202606"}',
      retryLimit: 0,
    });
    const consumer = makeConsumer({ dbType: 'mssql', mssqlQueue: mq });
    const ppSpy = vi.spyOn(consumer as any, 'processPayload').mockResolvedValue(undefined);

    await (consumer as any).pollOnce(); // mssql 路徑（PG 移除後唯一路徑）

    expect(ppSpy).toHaveBeenCalledTimes(1);
  });

  it('TS-MSSQL-P2B-PAYLOAD-002（靜態）：pipeline.runPipeline / 取消檢查特徵字串於 consumer 各恰 1 次（單一方法）', () => {
    const src = stripComments(readFileSync(CONSUMER_PATH, 'utf8'));
    const pipelineHits = src.match(/this\.pipeline\.runPipeline/g) ?? [];
    const cancelHits = src.match(/status\s*===?\s*['"]failed['"]/g) ?? [];
    expect(pipelineHits.length).toBe(1);
    expect(cancelHits.length).toBe(1);
  });

  it('TS-MSSQL-P2B-PAYLOAD-003：processPayload run 不存在 → 記 log、不拋、不呼叫 pipeline', async () => {
    const pipeline = { runPipeline: vi.fn(async () => undefined) };
    const runRepo = { findOne: vi.fn(async () => null) };
    const consumer = makeConsumer({ dbType: 'mssql', mssqlQueue: makeMssqlQueue(), pipeline, runRepo });
    await expect(
      (consumer as any).processPayload('job-1', { runId: 'ghost-run', ym: '202606' }),
    ).resolves.toBeUndefined();
    expect(pipeline.runPipeline).not.toHaveBeenCalled();
  });

  it('TS-MSSQL-P2B-PAYLOAD-004：processPayload run.status===failed（取消快路徑）→ 略過 pipeline', async () => {
    const pipeline = { runPipeline: vi.fn(async () => undefined) };
    const runRepo = { findOne: vi.fn(async () => ({ run_id: 'r1', status: 'failed' })) };
    const consumer = makeConsumer({ dbType: 'mssql', mssqlQueue: makeMssqlQueue(), pipeline, runRepo });
    await (consumer as any).processPayload('job-1', { runId: 'r1', ym: '202606' });
    expect(pipeline.runPipeline).not.toHaveBeenCalled();
  });

  it('TS-MSSQL-P2B-PAYLOAD-005：processPayload 正常路徑 → runPipeline(runId, ym)', async () => {
    const pipeline = { runPipeline: vi.fn(async () => undefined) };
    const runRepo = { findOne: vi.fn(async () => ({ run_id: 'r-abc', status: 'pending' })) };
    const consumer = makeConsumer({ dbType: 'mssql', mssqlQueue: makeMssqlQueue(), pipeline, runRepo });
    await (consumer as any).processPayload('job-1', { runId: 'r-abc', ym: '202607' });
    expect(pipeline.runPipeline).toHaveBeenCalledTimes(1);
    expect(pipeline.runPipeline).toHaveBeenCalledWith('r-abc', '202607');
  });

  it('TS-MSSQL-P2B-PAYLOAD-006：processPayload pipeline 拋錯 → try/catch 吞、不向上拋', async () => {
    const pipeline = { runPipeline: vi.fn(async () => { throw new Error('boom'); }) };
    const runRepo = { findOne: vi.fn(async () => ({ run_id: 'r1', status: 'pending' })) };
    const consumer = makeConsumer({ dbType: 'mssql', mssqlQueue: makeMssqlQueue(), pipeline, runRepo });
    await expect(
      (consumer as any).processPayload('job-1', { runId: 'r1', ym: '202606' }),
    ).resolves.toBeUndefined();
  });

  it('TS-MSSQL-P2B-PAYLOAD-008：mssql 轉接層 JSON.parse(claimed.payload) 還原為物件後才傳入 processPayload', async () => {
    const mq = makeMssqlQueue();
    mq.claimNext.mockResolvedValueOnce({
      jobId: 'j1',
      payload: '{"runId":"r-abc","ym":"202606"}', // 原始 JSON 字串
      retryLimit: 0,
    });
    const consumer = makeConsumer({ dbType: 'mssql', mssqlQueue: mq });
    const ppSpy = vi.spyOn(consumer as any, 'processPayload').mockResolvedValue(undefined);
    await (consumer as any).pollOnce();
    expect(ppSpy).toHaveBeenCalledTimes(1);
    expect(ppSpy).toHaveBeenCalledWith('j1', { runId: 'r-abc', ym: '202606' }); // 已還原為物件
  });
});

// ===========================================================================
// 七、STATIC — 命名鎖定 + 前瞻性守門
// ===========================================================================
describe('AD-E07-40 P2b STATIC', () => {
  it('TS-MSSQL-P2B-STATIC-001：命名鎖定 startMssqlPolling/pollOnce/processPayload/pollTimer/polling 與 AD §4.1 一致', () => {
    const src = readFileSync(CONSUMER_PATH, 'utf8');
    for (const id of ['startMssqlPolling', 'pollOnce', 'processPayload', 'pollTimer', 'polling']) {
      expect(src, id).toContain(id);
    }
  });

  it('TS-MSSQL-P2B-STATIC-002：READPAST/UPDLOCK/ROWLOCK 於 src/ 僅命中 mssql-queue.service.ts 一處', () => {
    const hits = filesContaining(SRC_ROOT, /READPAST|UPDLOCK|ROWLOCK/);
    const nonTest = hits.filter((f) => !f.endsWith('.spec.ts'));
    expect(nonTest).toEqual([join('modules', 'assignment', 'queue', 'mssql-queue.service.ts')]);
  });

  it('TS-MSSQL-P2B-STATIC-003：RunQueueTuning.pollIntervalMs 存在 + DEFAULT 有 env 覆蓋 + fallback 2000', () => {
    const src = readFileSync(PROVIDER_PATH, 'utf8');
    // interface 有 pollIntervalMs
    expect(/pollIntervalMs\s*:\s*number/.test(src)).toBe(true);
    // DEFAULT_RUN_QUEUE_TUNING.pollIntervalMs 讀 env + fallback 2000
    expect(/pollIntervalMs\s*:\s*Number\(process\.env\.RUN_QUEUE_POLL_INTERVAL_MS\)\s*\|\|\s*2000/.test(src)).toBe(true);
  });
});

// ===========================================================================
// 六、ZERO-003（靜態）— OrphanReaper / CancellationPoller 零改動
// ===========================================================================
describe('AD-E07-40 P2b ZERO（零改動靜態守門）', () => {
  it('TS-MSSQL-P2B-ZERO-003：orphan-reaper.ts / cancellation-poller.ts 不含 DB_TYPE/isPostgres/mssqlQueue/queue_job/MssqlQueueService', () => {
    for (const p of [REAPER_PATH, CANCEL_PATH]) {
      const src = readFileSync(p, 'utf8');
      expect(/DB_TYPE/.test(src), p).toBe(false);
      expect(/isPostgres/.test(src), p).toBe(false);
      expect(/mssqlQueue/.test(src), p).toBe(false);
      expect(/queue_job/.test(src), p).toBe(false);
      expect(/MssqlQueueService/.test(src), p).toBe(false);
    }
  });

  it('TS-MSSQL-P2B-STATIC（附）：mssql-queue.service.ts 存在且未被本輪 P2b 接線改動（P2a 黑盒依賴）', () => {
    const src = readFileSync(SERVICE_PATH, 'utf8');
    expect(src).toContain('export class MssqlQueueService');
    // 仍為獨立層：不依賴 producer/consumer
    expect(src).not.toContain('RunQueueProducer');
    expect(src).not.toContain('RunQueueConsumer');
  });
});
