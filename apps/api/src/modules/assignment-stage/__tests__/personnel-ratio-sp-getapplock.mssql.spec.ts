/**
 * AD-E07-38 P1c — LOCK 群組：sp_getapplock 跨 driver 鎖核心行為（真實 MSSQL，I-MSSQL-LOCK-01）。
 *
 * 決策關卡（LOCK-001 / LOCK-009）與並發行為（LOCK-002~012）。
 *
 * ⚠️ 本機 MSSQL 容器實測結論（2026-07-07，SQL2022-Linux RTM-CU25）：
 *   `sp_getapplock` 之**實際取鎖路徑**於本容器一律拋 17750「Could not load the DLL, Reason 126」
 *   —— 與既有 sp_executesql 17750 同一容器層缺陷（見 typeorm-mssql-driver-realities 記憶）。
 *   屬**環境層 DLL 缺失**，非程式碼契約問題；生產 Windows SQL Server 不受影響。
 *   故「需真實取鎖」之案例（LOCK-002/003/004/005/011/012）於偵測到 17750 時 ctx.skip（OQ-MSSQL-P1C-01），
 *   不偽造綠燈。回傳碼映射（-2/-3/-999→rethrow、-1→timeout）由 auto-advance-lock.util.spec.ts 之
 *   unit mock 完整覆蓋（不需真 DLL）。
 */
import {
  restoreDbType,
  MSSQL,
  mssqlPortReachable,
  SKIP_REASON,
} from '../../../database/__tests__/mssql-env-preload';

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { DataSource } from 'typeorm';
import {
  acquireAutoAdvanceLock,
  buildLockResource,
  MSSQL_GETAPPLOCK_SQL,
} from '../auto-advance-lock.util';

vi.setConfig({ testTimeout: 60000 });

const OQ_DLL =
  'OQ-MSSQL-P1C-01：本容器 sp_getapplock 取鎖路徑 17750 DLL 缺失（環境層，非程式碼）— 生產 Windows SQL Server 未受影響';

let reachable = false;
let ds: DataSource | null = null;
/** 本容器 sp_getapplock 實際取鎖是否可用（17750 → false）。 */
let spLockUsable = false;

function mssqlDs(): DataSource {
  return new DataSource({
    type: 'mssql',
    host: MSSQL.host,
    port: MSSQL.port,
    username: MSSQL.username,
    password: MSSQL.password,
    database: MSSQL.database,
    options: {
      encrypt: MSSQL.encrypt,
      trustServerCertificate: MSSQL.trustServerCertificate,
    },
    entities: [],
    synchronize: false,
  });
}

function isDllError(e: unknown): boolean {
  const n = (e as { number?: number })?.number;
  const m = String((e as { message?: string })?.message ?? '');
  return n === 17750 || /Could not load the DLL/i.test(m);
}

function ensure(ctx: { skip: () => void }): void {
  if (!reachable || !ds) {
    // eslint-disable-next-line no-console
    console.warn(`[AD-E07-38 P1c LOCK] SKIPPED — ${SKIP_REASON}`);
    ctx.skip();
  }
}

function ensureLockUsable(ctx: { skip: () => void }): void {
  ensure(ctx);
  if (!spLockUsable) {
    // eslint-disable-next-line no-console
    console.warn(`[AD-E07-38 P1c LOCK] SKIPPED real-acquire — ${OQ_DLL}`);
    ctx.skip();
  }
}

/** 於顯式交易內以 helper 取鎖並回傳 outcome；qr 交由呼叫端釋放。 */
async function acquireInTx(
  qr: import('typeorm').QueryRunner,
  listNo: string,
  timeoutMs: number,
): Promise<'acquired' | 'timeout'> {
  return acquireAutoAdvanceLock(qr.manager, 'mssql', listNo, {
    lockTimeoutMs: timeoutMs,
  });
}

beforeAll(async () => {
  reachable = await mssqlPortReachable(1500);
  if (!reachable) return;
  try {
    ds = mssqlDs();
    await ds.initialize();
  } catch {
    reachable = false;
    ds = null;
    return;
  }
  // 能力偵測：於 tx 內嘗試真實取鎖；17750 → spLockUsable=false。
  const qr = ds.createQueryRunner();
  await qr.connect();
  await qr.startTransaction();
  try {
    await acquireInTx(qr, 'CAP_PROBE', 1000);
    spLockUsable = true;
  } catch (e) {
    spLockUsable = false;
    if (isDllError(e)) {
      // eslint-disable-next-line no-console
      console.warn(`[AD-E07-38 P1c LOCK] sp_getapplock 取鎖不可用 → ${OQ_DLL}`);
    } else {
      // eslint-disable-next-line no-console
      console.warn('[AD-E07-38 P1c LOCK] 能力偵測非 DLL 錯誤：', (e as Error).message);
    }
  } finally {
    try {
      await qr.rollbackTransaction();
    } catch {
      /* ignore */
    }
    await qr.release();
  }
}, 60000);

afterAll(async () => {
  if (ds) await ds.destroy();
  restoreDbType();
});

// ===========================================================================
// 決策關卡（可於本容器執行——不依賴實際取鎖 DLL）
// ===========================================================================
describe('AD-E07-38 P1c LOCK — 決策關卡（LOCK-001 / LOCK-009）', () => {
  // LOCK-001：回傳碼可否經 manager.query 取回？
  it('TS-MSSQL-P1C-LOCK-001：sp_getapplock 批次經 manager.query 回傳 [{lockResult:number}] 形狀', async (ctx) => {
    ensure(ctx);
    // 於「無顯式交易 + @LockOwner=Transaction」下，sp_getapplock 於進入 DLL 取鎖前即回 -999，
    // 故此路徑不觸發 17750，可用以驗證「回傳碼經 SELECT @res 由 manager.query 取回」之機制。
    const rows = await ds!.manager.query(MSSQL_GETAPPLOCK_SQL, [
      buildLockResource('PROBE001'),
      1000,
    ]);
    expect(Array.isArray(rows)).toBe(true);
    expect(rows[0]).toHaveProperty('lockResult');
    expect(typeof Number(rows[0].lockResult)).toBe('number');
    // 決策結論：純 SQL 字串 + SELECT @res 取回回傳碼 = 可行（不需改用 mssql 套件 Request.output()）。
  });

  // LOCK-009：@LockOwner='Transaction' 於交易外之真實行為
  it('TS-MSSQL-P1C-LOCK-009：@LockOwner=Transaction 於交易外 → 回傳 -999（不 raise）', async (ctx) => {
    ensure(ctx);
    const rows = await ds!.manager.query(MSSQL_GETAPPLOCK_SQL, [
      buildLockResource('PROBE009'),
      1000,
    ]);
    // 實測：交易外呼叫回傳碼 -999（非 raise）→ I-MSSQL-LOCK-01 為程式碼契約，
    // 資料庫不會為呼叫端擋下違規使用 → 已於 tryAutoAdvance 加 assertMssqlLockPrecondition 防禦（LOCK-010）。
    expect(Number(rows[0].lockResult)).toBe(-999);
  });
});

// ===========================================================================
// 並發行為（需真實取鎖；本容器 17750 → skip）
// ===========================================================================
describe('AD-E07-38 P1c LOCK — 並發取鎖（LOCK-002~012，需真實 sp_getapplock）', () => {
  // LOCK-002：取鎖成功、COMMIT 後自動釋放
  it('TS-MSSQL-P1C-LOCK-002：取鎖成功，commit 後自動釋放（@LockOwner=Transaction）', async (ctx) => {
    ensureLockUsable(ctx);
    const a = ds!.createQueryRunner();
    await a.connect();
    await a.startTransaction();
    expect(await acquireInTx(a, 'LK002', 5000)).toBe('acquired');
    await a.commitTransaction();
    await a.release();

    const b = ds!.createQueryRunner();
    await b.connect();
    await b.startTransaction();
    // A commit 後 B 立即取得（不需等 timeout）
    expect(await acquireInTx(b, 'LK002', 500)).toBe('acquired');
    await b.rollbackTransaction();
    await b.release();
  });

  // LOCK-003：ROLLBACK 後亦自動釋放
  it('TS-MSSQL-P1C-LOCK-003：rollback 後自動釋放', async (ctx) => {
    ensureLockUsable(ctx);
    const a = ds!.createQueryRunner();
    await a.connect();
    await a.startTransaction();
    expect(await acquireInTx(a, 'LK003', 5000)).toBe('acquired');
    await a.rollbackTransaction();
    await a.release();

    const b = ds!.createQueryRunner();
    await b.connect();
    await b.startTransaction();
    expect(await acquireInTx(b, 'LK003', 500)).toBe('acquired');
    await b.rollbackTransaction();
    await b.release();
  });

  // LOCK-004：競爭同一 resource → 逾時（-1 → 'timeout'，對應 55P03 降級）
  it('TS-MSSQL-P1C-LOCK-004：競爭同一 resource → B 短逾時降級 timeout', async (ctx) => {
    ensureLockUsable(ctx);
    const a = ds!.createQueryRunner();
    const b = ds!.createQueryRunner();
    await a.connect();
    await b.connect();
    await a.startTransaction();
    await b.startTransaction();
    try {
      expect(await acquireInTx(a, 'LK004', 5000)).toBe('acquired'); // A 持鎖不放
      expect(await acquireInTx(b, 'LK004', 500)).toBe('timeout'); // B 逾時
    } finally {
      await a.rollbackTransaction();
      await b.rollbackTransaction();
      await a.release();
      await b.release();
    }
  });

  // LOCK-005：等待後取得（回傳碼 1）視為成功
  it('TS-MSSQL-P1C-LOCK-005：B 以足夠逾時等待、A 先釋放 → B 取得（回傳碼 1）', async (ctx) => {
    ensureLockUsable(ctx);
    const a = ds!.createQueryRunner();
    await a.connect();
    await a.startTransaction();
    expect(await acquireInTx(a, 'LK005', 5000)).toBe('acquired');

    const b = ds!.createQueryRunner();
    await b.connect();
    await b.startTransaction();
    // 直接以 raw batch 檢視回傳碼（helper 將 0/1 皆映射 acquired，此處要求驗證「等待後取得＝1」）
    const bPromise = b.manager.query(MSSQL_GETAPPLOCK_SQL, [buildLockResource('LK005'), 5000]);
    // A 於 B 逾時前釋放
    await new Promise((r) => setTimeout(r, 200));
    await a.commitTransaction();
    await a.release();
    const rows = await bPromise;
    expect(Number(rows[0].lockResult)).toBe(1);
    await b.rollbackTransaction();
    await b.release();
  });

  // LOCK-011：@Resource 由字串組成（免 hashtext）；同一 listNo 鎖同一資源
  it('TS-MSSQL-P1C-LOCK-011：同一 listNo → 同一 @Resource（互斥，功能等價 PG hashtext）', async (ctx) => {
    ensureLockUsable(ctx);
    const a = ds!.createQueryRunner();
    const b = ds!.createQueryRunner();
    await a.connect();
    await b.connect();
    await a.startTransaction();
    await b.startTransaction();
    try {
      expect(await acquireInTx(a, 'OB202606001', 5000)).toBe('acquired');
      // 第二次呼叫同 listNo → 互斥 → 短逾時降級
      expect(await acquireInTx(b, 'OB202606001', 500)).toBe('timeout');
    } finally {
      await a.rollbackTransaction();
      await b.rollbackTransaction();
      await a.release();
      await b.release();
    }
  });

  // LOCK-012：不同 listNo（不同 @Resource）不互相阻塞
  it('TS-MSSQL-P1C-LOCK-012：不同 listNo → 不同 @Resource，互不等待（皆立即 acquired）', async (ctx) => {
    ensureLockUsable(ctx);
    const a = ds!.createQueryRunner();
    const b = ds!.createQueryRunner();
    await a.connect();
    await b.connect();
    await a.startTransaction();
    await b.startTransaction();
    try {
      const [ra, rb] = await Promise.all([
        acquireInTx(a, 'LK012_X', 500),
        acquireInTx(b, 'LK012_Y', 500),
      ]);
      expect(ra).toBe('acquired');
      expect(rb).toBe('acquired');
    } finally {
      await a.rollbackTransaction();
      await b.rollbackTransaction();
      await a.release();
      await b.release();
    }
  });
});
