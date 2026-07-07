/**
 * AD-E07-38 P1c — auto-advance 跨 driver blocking lock helper（I-MSSQL-LOCK-01）。
 *
 * 抽離自 personnel-ratio.service.ts tryAutoAdvance [4a]，改為**三分支**（原為 isPostgres() 二元 gate）：
 *   - postgres：`SET LOCAL lock_timeout` + `pg_advisory_xact_lock(hashtext($1)::bigint)`；
 *               55P03（lock_not_available）→ 'timeout'（降級 no-op），其餘 rethrow。
 *   - mssql   ：`sp_getapplock @Resource=@0 @LockMode='Exclusive' @LockOwner='Transaction' @LockTimeout=@1`；
 *               回傳碼 0/1 → 'acquired'、-1 → 'timeout'（↔ 55P03 語意）、-2/-3/-999 → rethrow。
 *   - other   ：sqlite / 未知 → no-op（跳過鎖，直接 'acquired'）。
 *
 * 設計為純函式 + 只依賴 `EntityManager.query`，供 unit 與真 MSSQL 並發測試直接驗證。
 *
 * ⚠️ mssql 前置條件（I-MSSQL-LOCK-01）：`@LockOwner='Transaction'` 必須在**顯式交易**內呼叫，
 *    否則鎖於單一陳述式結束即釋放、失去互斥效果（實測：交易外呼叫回傳碼 -999，不 raise）。
 *    呼叫端須先以 assertMssqlLockPrecondition 作防禦性斷言（LOCK-010）。
 */
import type { EntityManager } from 'typeorm';

export type LockOutcome = 'acquired' | 'timeout';
export type LockDbKind = 'postgres' | 'mssql' | 'other';

/** auto-advance 鎖之預設等待逾時（ms）；對齊既有 PG 版 `SET LOCAL lock_timeout='5000ms'`。 */
export const AUTO_ADVANCE_LOCK_TIMEOUT_MS = 5000;

/** DB_TYPE → 鎖分支種類。 */
export function resolveLockDbKind(dbType: string | undefined): LockDbKind {
  const t = (dbType ?? 'postgres').toLowerCase();
  if (t === 'postgres' || t === 'postgresql' || t === 'pg') return 'postgres';
  if (t === 'mssql' || t === 'sqlserver' || t === 'mssqlserver') return 'mssql';
  return 'other';
}

/**
 * 由 listNo 組出 `@Resource` 字串（免 PG `hashtext` — MSSQL applock 直接用字串 resource，
 * 同一 listNo 於不同呼叫間鎖住同一資源，功能等價，見 LOCK-011）。
 */
export function buildLockResource(listNo: string): string {
  return `personnel-ratio:${listNo}`;
}

/** PostgreSQL lock 等待逾時（55P03 lock_not_available）。 */
export function isPgLockNotAvailable(err: unknown): boolean {
  return (
    !!err &&
    typeof err === 'object' &&
    (err as { code?: string }).code === '55P03'
  );
}

/**
 * 由 `SELECT @res AS lockResult` 之 manager.query 回傳解析出 sp_getapplock 回傳碼。
 * 實測 mssql（tedious）形狀為 `[{ lockResult: number }]`；防禦性支援巢狀 / 物件形態。
 */
export function extractLockCode(rows: unknown): number {
  const pick = (o: unknown): number | null => {
    if (o && typeof o === 'object' && 'lockResult' in (o as Record<string, unknown>)) {
      const v = (o as { lockResult: unknown }).lockResult;
      return v == null ? null : Number(v);
    }
    return null;
  };
  if (Array.isArray(rows)) {
    for (const item of rows) {
      const direct = pick(item);
      if (direct != null) return direct;
      if (Array.isArray(item)) {
        for (const inner of item) {
          const v = pick(inner);
          if (v != null) return v;
        }
      }
    }
  } else {
    const v = pick(rows);
    if (v != null) return v;
  }
  throw new Error('sp_getapplock 回傳形狀無法解析 lockResult');
}

/**
 * MSSQL sp_getapplock 回傳碼 → LockOutcome（AD §4 對應表）。
 *   0（立即取得）/ 1（等待後取得）→ 'acquired'
 *   -1（逾時）→ 'timeout'（比照 PG 55P03 降級 no-op）
 *   -2（cancelled）/ -3（deadlock victim）/ -999（參數或其他錯誤）→ rethrow
 */
export function mapMssqlLockCode(code: number): LockOutcome {
  if (code === 0 || code === 1) return 'acquired';
  if (code === -1) return 'timeout';
  const err = new Error(`sp_getapplock 取鎖失敗（回傳碼 ${code}）`) as Error & {
    lockCode?: number;
  };
  err.lockCode = code;
  throw err;
}

/** sp_getapplock 取鎖批次（回傳碼由 `SELECT @res AS lockResult` 取回，見 LOCK-001）。 */
export const MSSQL_GETAPPLOCK_SQL =
  'DECLARE @res INT; ' +
  "EXEC @res = sp_getapplock @Resource = @0, @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = @1; " +
  'SELECT @res AS lockResult;';

/**
 * 取得 auto-advance blocking lock（跨 driver）。
 *
 * @param mgr     交易內 EntityManager（mssql 必須為顯式交易內，見 I-MSSQL-LOCK-01）
 * @param kind    鎖分支（resolveLockDbKind(process.env.DB_TYPE)）
 * @param listNo  名單代號（resource key 來源）
 * @param opts.lockTimeoutMs 測試可縮短逾時（預設 5000）
 * @returns 'acquired' | 'timeout'；-2/-3/-999 或非鎖錯誤 → throw
 */
export async function acquireAutoAdvanceLock(
  mgr: EntityManager,
  kind: LockDbKind,
  listNo: string,
  opts: { lockTimeoutMs?: number } = {},
): Promise<LockOutcome> {
  if (kind === 'other') {
    // sqlite / 未知：測試 infra 無此鎖原語 → 跳過（直接視為取得，維持既有降級行為）。
    return 'acquired';
  }

  const timeoutMs = Number.isFinite(opts.lockTimeoutMs as number)
    ? Math.trunc(opts.lockTimeoutMs as number)
    : AUTO_ADVANCE_LOCK_TIMEOUT_MS;

  if (kind === 'postgres') {
    try {
      await mgr.query(`SET LOCAL lock_timeout = '${timeoutMs}ms'`);
      await mgr.query('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', [
        listNo,
      ]);
      return 'acquired';
    } catch (err) {
      if (isPgLockNotAvailable(err)) return 'timeout';
      throw err;
    }
  }

  // mssql：@Resource=@0、@LockTimeout=@1（positional binding → tedious @0/@1）。
  const rows = await mgr.query(MSSQL_GETAPPLOCK_SQL, [
    buildLockResource(listNo),
    timeoutMs,
  ]);
  return mapMssqlLockCode(extractLockCode(rows));
}

/**
 * LOCK-010 防禦性斷言：mssql `@LockOwner='Transaction'` 必須在顯式交易內呼叫。
 *
 * 僅在能**確證**未處於交易時才拋（queryRunner.isTransactionActive === false）；
 * 無法判定（unit mock 無 queryRunner）時放行——資料庫層另有 -999 回傳碼作最後防線。
 */
export function assertMssqlLockPrecondition(mgr: EntityManager): void {
  const qr = (mgr as { queryRunner?: { isTransactionActive?: boolean } })
    .queryRunner;
  if (qr && qr.isTransactionActive === false) {
    throw new Error(
      'I-MSSQL-LOCK-01：auto-advance sp_getapplock 必須在顯式交易內呼叫（@LockOwner=Transaction）',
    );
  }
}
