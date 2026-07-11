/**
 * AD-E07-40 P2c — Expire sweep 定時掛載 + 靜態守門（fake/unit，免真實連線）。
 *
 * 覆蓋測試設計 AD-E07-40-P2c-test.md 之 fake/unit 群組（§0.2）：
 *   一、MOUNT（6）  — sweep 定時掃描機制掛載（黑盒 spy MssqlQueueService.expireSweep + vi.useFakeTimers）
 *   三、STATIC（4） — docker-compose RUN_QUEUE_POLL_INTERVAL_MS + 單一 SQL 位置守門延續 + 決策關卡
 *   四、REG-002      — CreatePgBossSchema migration 持續不存在（PGINT-002 排除理由有效性守門）
 *
 * 🔴 掛載機制選型（MOUNT-001 / impl log AD-5）：本輪選「新建獨立 provider MssqlQueueExpiryReaper」
 *    （非擴充 OrphanReaper），理由見 mssql-queue-expiry-reaper.ts 檔頭 + impl log。因此 MOUNT-002~006
 *    對應之實際符號為 MssqlQueueExpiryReaper.onApplicationBootstrap / onModuleDestroy / setInterval。
 *
 * Level: Unit。需 Postgres/MSSQL：否，CI 恆常執行。
 */
import {
  describe,
  it,
  expect,
  afterEach,
  vi,
} from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join } from 'path';
import type { ConfigService } from '@nestjs/config';
import { MssqlQueueExpiryReaper } from '../mssql-queue-expiry-reaper';
import type { MssqlQueueService } from '../mssql-queue.service';
import { DEFAULT_RUN_QUEUE_TUNING, RunQueueTuning } from '../run-queue-tuning.provider';

// ── 檔案路徑（靜態守門用）────────────────────────────────────────────────────
const QUEUE_DIR = join(__dirname, '..');
const EXPIRY_REAPER_PATH = join(QUEUE_DIR, 'mssql-queue-expiry-reaper.ts');
const SERVICE_PATH = join(QUEUE_DIR, 'mssql-queue.service.ts');
const PROVIDER_PATH = join(QUEUE_DIR, 'run-queue-tuning.provider.ts');
const WORKER_MODULE_PATH = join(__dirname, '..', '..', 'assignment-worker.module.ts');
const API_SRC = join(__dirname, '..', '..', '..', '..'); // apps/api/src
const SRC_ROOT = API_SRC;
const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..', '..', '..'); // cdmp-mvp
const COMPOSE_PATH = join(REPO_ROOT, 'docker-compose.yml');
const IMPL_LOG_PATH = join(
  REPO_ROOT, 'docs', 'specs', 'implementation-log', 'AD-E07-40-P2c-impl.md',
);
const MIGRATIONS_DIR = join(API_SRC, 'database', 'migrations');

/** 移除 // 行註解與 block 註解（使守門僅針對實際程式碼，比照 f098-static-guards / P2b）。 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** 遞迴列出 src/ 下（相對路徑）內容符合 pattern 的 .ts 檔（比照 P2a/P2b filesContaining）。 */
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
  expireSweep: ReturnType<typeof vi.fn>;
}
function makeMssqlQueue(): FakeMssqlQueue {
  return { expireSweep: vi.fn(async () => undefined) };
}

function makeReaper(opts: {
  dbType?: string | null;
  mssqlQueue?: FakeMssqlQueue | null;
  tuning?: Partial<RunQueueTuning>;
}): MssqlQueueExpiryReaper {
  return new MssqlQueueExpiryReaper(
    { ...DEFAULT_RUN_QUEUE_TUNING, ...(opts.tuning ?? {}) },
    opts.dbType == null ? null : makeConfig(opts.dbType),
    (opts.mssqlQueue ?? null) as unknown as MssqlQueueService,
  );
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ===========================================================================
// 一、MOUNT — 定時掃描機制掛載
// ===========================================================================
describe('AD-E07-40 P2c MOUNT（sweep 定時掛載）', () => {
  it('TS-MSSQL-P2C-MOUNT-001（🔴 決策關卡 / AD-5）：掛載機制選型於 impl log 記錄，且落實為獨立 provider + worker module 註冊', () => {
    // (a) 選定之類別存在且為合法 class。
    expect(typeof MssqlQueueExpiryReaper).toBe('function');
    // (b) worker module providers 已註冊該 provider（供 REG 靜態對齊）。
    const workerSrc = stripComments(readFileSync(WORKER_MODULE_PATH, 'utf8'));
    expect(/import\s*\{\s*MssqlQueueExpiryReaper\s*\}/.test(workerSrc)).toBe(true);
    const providersBlock = workerSrc.slice(workerSrc.indexOf('providers:'));
    expect(/\bMssqlQueueExpiryReaper\b/.test(providersBlock)).toBe(true);
    // (c) impl log 記錄 AD-5 決策（選擇之方案 + 實際 class 名稱）。
    expect(existsSync(IMPL_LOG_PATH), 'AD-E07-40-P2c-impl.md 缺（AD-5 決策記錄）').toBe(true);
    const implLog = readFileSync(IMPL_LOG_PATH, 'utf8');
    expect(implLog).toContain('AD-5');
    expect(implLog).toContain('MssqlQueueExpiryReaper');
  });

  it('TS-MSSQL-P2C-MOUNT-002：onApplicationBootstrap 立即執行一次 sweep（比照 OrphanReaper 啟動掃一次）', async () => {
    const mq = makeMssqlQueue();
    // reaperIntervalMs=0 → 只驗啟動時立即呼叫，不啟動定期 timer（避免殘留）。
    const reaper = makeReaper({ dbType: 'mssql', mssqlQueue: mq, tuning: { reaperIntervalMs: 0 } });
    await reaper.onApplicationBootstrap();
    expect(mq.expireSweep).toHaveBeenCalledTimes(1);
    reaper.onModuleDestroy();
  });

  it('TS-MSSQL-P2C-MOUNT-003：定期觸發（短週期）→ 多次 tick，呼叫次數 ≥ 3', async () => {
    vi.useFakeTimers();
    const mq = makeMssqlQueue();
    const reaper = makeReaper({ dbType: 'mssql', mssqlQueue: mq, tuning: { reaperIntervalMs: 100 } });
    await reaper.onApplicationBootstrap(); // 啟動立即 1 次 + 啟動定期 timer
    await vi.advanceTimersByTimeAsync(350); // 推進 3 個週期
    expect(mq.expireSweep.mock.calls.length).toBeGreaterThanOrEqual(3);
    reaper.onModuleDestroy();
  });

  it('TS-MSSQL-P2C-MOUNT-004：reaperIntervalMs=0 → 不啟動定時器（比照 orphan-reaper 防呆）', async () => {
    vi.useFakeTimers();
    const mq = makeMssqlQueue();
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const reaper = makeReaper({ dbType: 'mssql', mssqlQueue: mq, tuning: { reaperIntervalMs: 0 } });
    await reaper.onApplicationBootstrap();
    const afterBootstrap = mq.expireSweep.mock.calls.length; // 1（啟動立即）
    await vi.advanceTimersByTimeAsync(1000);
    expect(mq.expireSweep.mock.calls.length).toBe(afterBootstrap); // 無後續定期呼叫
    expect(setIntervalSpy).not.toHaveBeenCalled();
    reaper.onModuleDestroy();
  });

  it('TS-MSSQL-P2C-MOUNT-005（🔴 DoD）：onModuleDestroy → 清除計時器，之後不再觸發', async () => {
    vi.useFakeTimers();
    const mq = makeMssqlQueue();
    const reaper = makeReaper({ dbType: 'mssql', mssqlQueue: mq, tuning: { reaperIntervalMs: 100 } });
    await reaper.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(150); // 至少一輪定期觸發
    const before = mq.expireSweep.mock.calls.length;
    expect(before).toBeGreaterThanOrEqual(2); // 啟動立即 1 + 至少 1 定期
    reaper.onModuleDestroy();
    await vi.advanceTimersByTimeAsync(500); // destroy 後推進數個週期
    expect(mq.expireSweep.mock.calls.length).toBe(before); // 不再增加
  });

  it('TS-MSSQL-P2C-MOUNT-006（靜態守門）：setInterval 建構處緊鄰 .unref（不阻擋程序退出）', () => {
    const src = readFileSync(EXPIRY_REAPER_PATH, 'utf8');
    expect(src).toContain('setInterval');
    // setInterval 之後不遠處存在 unref 調用（比照 orphan-reaper.ts / run-queue.consumer.ts）。
    expect(/setInterval[\s\S]{0,400}\.unref\(\)/.test(src)).toBe(true);
  });

  it('TS-MSSQL-P2C-MOUNT（附）：非 mssql（postgres）→ onApplicationBootstrap no-op，不呼叫 expireSweep、不啟動 timer', async () => {
    vi.useFakeTimers();
    const mq = makeMssqlQueue();
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const reaper = makeReaper({ dbType: 'postgres', mssqlQueue: mq, tuning: { reaperIntervalMs: 100 } });
    await reaper.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(500);
    expect(mq.expireSweep).not.toHaveBeenCalled();
    expect(setIntervalSpy).not.toHaveBeenCalled();
    reaper.onModuleDestroy();
  });
});

// ===========================================================================
// 三、STATIC — docker-compose env 補齊 + 單一 SQL 位置守門延續
// ===========================================================================
describe('AD-E07-40 P2c STATIC', () => {
  it('TS-MSSQL-P2C-STATIC-001（🔴 DoD #4）：docker-compose worker: 區塊之 environment 含 RUN_QUEUE_POLL_INTERVAL_MS', () => {
    const compose = readFileSync(COMPOSE_PATH, 'utf8');
    // 比照既有 TS-F098-WORKER-001b 之 slice 方式（worker: → web:）。
    const workerBlock = compose.slice(
      compose.indexOf('\n  worker:'),
      compose.indexOf('\n  web:'),
    );
    expect(workerBlock.length).toBeGreaterThan(0);
    expect(/RUN_QUEUE_POLL_INTERVAL_MS/.test(workerBlock)).toBe(true);
  });

  it('TS-MSSQL-P2C-STATIC-002（守門鏈延續 P2a STATIC-003→P2b STATIC-002）：READPAST/UPDLOCK/ROWLOCK 於 src/ 仍僅命中 mssql-queue.service.ts 一處', () => {
    const hits = filesContaining(SRC_ROOT, /READPAST|UPDLOCK|ROWLOCK/);
    const nonTest = hits.filter((f) => !f.endsWith('.spec.ts'));
    expect(nonTest).toEqual([join('modules', 'assignment', 'queue', 'mssql-queue.service.ts')]);
  });

  it('TS-MSSQL-P2C-STATIC-003：state=\'expired\' 狀態轉移特徵字串於 src/（剝除註解後）僅命中 mssql-queue.service.ts 一處', () => {
    const out: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) {
          if (name === 'node_modules' || name === 'dist') continue;
          walk(full);
        } else if (name.endsWith('.ts') && !name.endsWith('.spec.ts')) {
          const src = stripComments(readFileSync(full, 'utf8'));
          if (/state\s*=\s*'expired'/.test(src)) out.push(full.slice(SRC_ROOT.length + 1));
        }
      }
    };
    walk(SRC_ROOT);
    expect(out).toEqual([join('modules', 'assignment', 'queue', 'mssql-queue.service.ts')]);
  });

  it('TS-MSSQL-P2C-STATIC-004（決策關卡：重用既有週期）：MssqlQueueExpiryReaper 重用 tuning.reaperIntervalMs（env RUN_QUEUE_REAPER_INTERVAL_MS 可覆蓋），無寫死常數週期', () => {
    // 本輪 MOUNT-001 選「新建獨立 provider」，週期重用既有 reaperIntervalMs（非新增設定）。
    const reaperSrc = readFileSync(EXPIRY_REAPER_PATH, 'utf8');
    // 週期來源為 tuning.reaperIntervalMs（可由 env 注入），非 setInterval(fn, <字面數字>)。
    expect(/this\.tuning\.reaperIntervalMs/.test(reaperSrc)).toBe(true);
    // 既有 reaperIntervalMs 有 env RUN_QUEUE_REAPER_INTERVAL_MS 覆蓋（STATIC-004 自動滿足）。
    const providerSrc = readFileSync(PROVIDER_PATH, 'utf8');
    expect(/reaperIntervalMs\s*:\s*Number\(process\.env\.RUN_QUEUE_REAPER_INTERVAL_MS\)/.test(providerSrc)).toBe(true);
    // setInterval 之間隔引數非寫死數字字面（應為變數 interval）。
    expect(/setInterval\([^,]+,\s*\d+\s*\)/.test(reaperSrc)).toBe(false);
  });
});

// ===========================================================================
// 四、REG-002 — 已知失敗排除理由有效性守門
// ===========================================================================
describe('AD-E07-40 P2c REG', () => {
  it('TS-MSSQL-P2C-REG-002（守門）：CreatePgBossSchema migration 持續不存在於 repo（TS-F098-PGINT-002 排除理由有效）', () => {
    const files = readdirSync(MIGRATIONS_DIR);
    const hit = files.find((f) => /1711360000299-CreatePgBossSchema\.ts$/.test(f));
    // 若此檔未來重新出現，代表 REG-001 之 PGINT-002 排除理由已失效，須重新評估（見 P2b REG-004）。
    expect(hit, `CreatePgBossSchema migration 重新出現 → PGINT-002 排除理由失效`).toBeUndefined();
  });
});
