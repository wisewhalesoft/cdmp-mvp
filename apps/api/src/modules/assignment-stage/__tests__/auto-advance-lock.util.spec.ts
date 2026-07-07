/**
 * AD-E07-38 P1c — auto-advance 跨 driver 鎖 helper 單元測試（I-MSSQL-LOCK-01）。
 *
 * 覆蓋：
 *   - resolveLockDbKind / buildLockResource / extractLockCode / mapMssqlLockCode 純函式
 *   - acquireAutoAdvanceLock 三分支（pg advisory / mssql sp_getapplock / other no-op）
 *   - LOCK-006/007/008：mssql 回傳碼 -2/-3/-999 → rethrow（unit mock，不需真 DLL）
 *   - LOCK-010：assertMssqlLockPrecondition 防禦性斷言
 *   - DISPATCH（helper 層）：各分支對 mgr.query 的呼叫形狀
 */
import { describe, it, expect, vi } from 'vitest';
import type { EntityManager } from 'typeorm';
import {
  resolveLockDbKind,
  buildLockResource,
  extractLockCode,
  mapMssqlLockCode,
  acquireAutoAdvanceLock,
  assertMssqlLockPrecondition,
  isPgLockNotAvailable,
  MSSQL_GETAPPLOCK_SQL,
} from '../auto-advance-lock.util';

function mgrWithQuery(impl: (...args: unknown[]) => unknown): EntityManager {
  return { query: vi.fn(impl) } as unknown as EntityManager;
}

describe('AD-E07-38 P1c — resolveLockDbKind', () => {
  it('postgres 別名皆歸類 postgres', () => {
    for (const t of ['postgres', 'postgresql', 'pg', 'POSTGRES']) {
      expect(resolveLockDbKind(t)).toBe('postgres');
    }
  });
  it('mssql 別名皆歸類 mssql', () => {
    for (const t of ['mssql', 'sqlserver', 'MSSQL']) {
      expect(resolveLockDbKind(t)).toBe('mssql');
    }
  });
  it('sqlite / 未知 / undefined → other 或 postgres 預設', () => {
    expect(resolveLockDbKind('sqlite')).toBe('other');
    expect(resolveLockDbKind('better-sqlite3')).toBe('other');
    // 未設定 → 預設 postgres（對齊既有 isPostgres() 預設）
    expect(resolveLockDbKind(undefined)).toBe('postgres');
  });
});

describe('AD-E07-38 P1c — buildLockResource / extractLockCode', () => {
  it('resource 由 listNo 組出穩定字串（同 listNo 恆同 resource，LOCK-011）', () => {
    expect(buildLockResource('OB202606001')).toBe('personnel-ratio:OB202606001');
    expect(buildLockResource('OB202606001')).toBe(buildLockResource('OB202606001'));
    expect(buildLockResource('X')).not.toBe(buildLockResource('Y'));
  });

  it('extractLockCode 解析 tedious 實測形狀 [{ lockResult: n }]', () => {
    expect(extractLockCode([{ lockResult: 0 }])).toBe(0);
    expect(extractLockCode([{ lockResult: -1 }])).toBe(-1);
    expect(extractLockCode([{ lockResult: -999 }])).toBe(-999);
    // 巢狀 / 物件形態容錯
    expect(extractLockCode([[{ lockResult: 1 }]])).toBe(1);
    expect(extractLockCode({ lockResult: -3 })).toBe(-3);
  });

  it('extractLockCode 無法解析時拋錯', () => {
    expect(() => extractLockCode([])).toThrow();
    expect(() => extractLockCode([{ other: 1 }])).toThrow();
  });
});

describe('AD-E07-38 P1c — mapMssqlLockCode（AD §4 對應表）', () => {
  it('0 / 1 → acquired', () => {
    expect(mapMssqlLockCode(0)).toBe('acquired');
    expect(mapMssqlLockCode(1)).toBe('acquired');
  });
  it('-1 → timeout（↔ 55P03）', () => {
    expect(mapMssqlLockCode(-1)).toBe('timeout');
  });
  // LOCK-006 / 007 / 008
  it('LOCK-006/007/008：-2 / -3 / -999 → rethrow（帶 lockCode）', () => {
    for (const code of [-2, -3, -999]) {
      let caught: (Error & { lockCode?: number }) | null = null;
      try {
        mapMssqlLockCode(code);
      } catch (e) {
        caught = e as Error & { lockCode?: number };
      }
      expect(caught).not.toBeNull();
      expect(caught!.lockCode).toBe(code);
    }
  });
});

describe('AD-E07-38 P1c — isPgLockNotAvailable', () => {
  it('僅 code=55P03 判為逾時（不以 message 比對）', () => {
    expect(isPgLockNotAvailable({ code: '55P03' })).toBe(true);
    expect(isPgLockNotAvailable({ code: '40001' })).toBe(false);
    expect(isPgLockNotAvailable(new Error('lock not available'))).toBe(false);
    expect(isPgLockNotAvailable(null)).toBe(false);
  });
});

describe('AD-E07-38 P1c — acquireAutoAdvanceLock 三分支', () => {
  it('other（sqlite）：不呼叫 mgr.query，直接 acquired', async () => {
    const mgr = mgrWithQuery(() => []);
    const out = await acquireAutoAdvanceLock(mgr, 'other', 'L1');
    expect(out).toBe('acquired');
    expect(mgr.query).not.toHaveBeenCalled();
  });

  it('postgres：SET LOCAL lock_timeout + pg_advisory_xact_lock → acquired', async () => {
    const calls: string[] = [];
    const mgr = mgrWithQuery((sql: string) => {
      calls.push(sql);
      return [];
    });
    const out = await acquireAutoAdvanceLock(mgr, 'postgres', 'L1', {
      lockTimeoutMs: 500,
    });
    expect(out).toBe('acquired');
    expect(calls[0]).toContain("SET LOCAL lock_timeout = '500ms'");
    expect(calls[1]).toContain('pg_advisory_xact_lock');
  });

  it('postgres：55P03 → timeout（降級 no-op，不 rethrow）', async () => {
    let n = 0;
    const mgr = mgrWithQuery(() => {
      n += 1;
      if (n === 1) return []; // SET LOCAL
      throw { code: '55P03', message: 'lock not available' };
    });
    const out = await acquireAutoAdvanceLock(mgr, 'postgres', 'L1');
    expect(out).toBe('timeout');
  });

  it('postgres：非 55P03 錯誤 → rethrow', async () => {
    const mgr = mgrWithQuery(() => {
      throw { code: '40001', message: 'serialization failure' };
    });
    await expect(acquireAutoAdvanceLock(mgr, 'postgres', 'L1')).rejects.toMatchObject({
      code: '40001',
    });
  });

  it('mssql：呼叫 sp_getapplock 批次（@0=resource、@1=timeout），回傳 0 → acquired', async () => {
    const spy = vi.fn(() => [{ lockResult: 0 }]);
    const mgr = { query: spy } as unknown as EntityManager;
    const out = await acquireAutoAdvanceLock(mgr, 'mssql', 'OB202606001', {
      lockTimeoutMs: 500,
    });
    expect(out).toBe('acquired');
    expect(spy).toHaveBeenCalledTimes(1);
    const [sql, params] = spy.mock.calls[0];
    expect(sql).toBe(MSSQL_GETAPPLOCK_SQL);
    expect(sql).toContain('sp_getapplock');
    expect(params).toEqual(['personnel-ratio:OB202606001', 500]);
  });

  it('mssql：回傳 1（等待後取得）→ acquired（LOCK-005 語意）', async () => {
    const mgr = mgrWithQuery(() => [{ lockResult: 1 }]);
    expect(await acquireAutoAdvanceLock(mgr, 'mssql', 'L1')).toBe('acquired');
  });

  it('mssql：回傳 -1 → timeout（降級 no-op）', async () => {
    const mgr = mgrWithQuery(() => [{ lockResult: -1 }]);
    expect(await acquireAutoAdvanceLock(mgr, 'mssql', 'L1')).toBe('timeout');
  });

  it('LOCK-006/007/008：mssql 回傳 -2/-3/-999 → rethrow', async () => {
    for (const code of [-2, -3, -999]) {
      const mgr = mgrWithQuery(() => [{ lockResult: code }]);
      await expect(
        acquireAutoAdvanceLock(mgr, 'mssql', 'L1'),
      ).rejects.toMatchObject({ lockCode: code });
    }
  });
});

describe('AD-E07-38 P1c — assertMssqlLockPrecondition（LOCK-010）', () => {
  it('queryRunner.isTransactionActive === false → 拋（確證交易外）', () => {
    const mgr = {
      queryRunner: { isTransactionActive: false },
    } as unknown as EntityManager;
    expect(() => assertMssqlLockPrecondition(mgr)).toThrow(/I-MSSQL-LOCK-01/);
  });

  it('queryRunner.isTransactionActive === true → 放行', () => {
    const mgr = {
      queryRunner: { isTransactionActive: true },
    } as unknown as EntityManager;
    expect(() => assertMssqlLockPrecondition(mgr)).not.toThrow();
  });

  it('無 queryRunner（unit mock 無法判定）→ 放行（資料庫 -999 為最後防線）', () => {
    const mgr = {} as unknown as EntityManager;
    expect(() => assertMssqlLockPrecondition(mgr)).not.toThrow();
  });
});
