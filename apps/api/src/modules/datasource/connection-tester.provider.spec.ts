import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConnectionTesterProvider } from './connection-tester.provider';

/**
 * 測試 ConnectionTesterProvider 的 SQL Server 並行連線隔離性。
 *
 * Bug：mssql.connect() 使用全域連線池，並行呼叫多個不同 config 時
 * 會因全域池衝突導致 ELOGIN。
 * 修復：改用 new mssql.ConnectionPool(config).connect() 建立獨立連線池。
 */
describe('ConnectionTesterProvider - SQL Server 並行連線隔離', () => {
  let provider: ConnectionTesterProvider;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mssql = require('mssql');
  let originalConnectionPool: any;

  beforeEach(() => {
    provider = new ConnectionTesterProvider();
    originalConnectionPool = mssql.ConnectionPool;
  });

  afterEach(() => {
    // 還原原本的 ConnectionPool
    mssql.ConnectionPool = originalConnectionPool;
    vi.restoreAllMocks();
  });

  it('並行測試多個不同 SQL Server 設定時，每個連線應使用獨立的連線池', async () => {
    const poolConfigs: any[] = [];
    const closeFns: ReturnType<typeof vi.fn>[] = [];

    // 替換 mssql.ConnectionPool constructor
    mssql.ConnectionPool = function MockConnectionPool(config: any) {
      poolConfigs.push(config);
      const closeFn = vi.fn().mockResolvedValue(undefined);
      closeFns.push(closeFn);

      return {
        connect: vi.fn().mockResolvedValue({
          request: vi.fn().mockReturnValue({
            query: vi.fn().mockResolvedValue({}),
          }),
          close: closeFn,
        }),
      };
    };

    // 確保全域 connect 沒有被呼叫
    mssql.connect = vi.fn().mockImplementation(() => {
      throw new Error('不應使用全域 mssql.connect()');
    });

    const configs = [
      { type: 'sqlserver' as const, host: 'host-a', port: 1433, database: 'db_a', username: 'user_a', password: 'pass_a' },
      { type: 'sqlserver' as const, host: 'host-b', port: 1434, database: 'db_b', username: 'user_b', password: 'pass_b' },
      { type: 'sqlserver' as const, host: 'host-c', port: 1435, database: 'db_c', username: 'user_c', password: 'pass_c' },
    ];

    // 並行呼叫
    const results = await Promise.allSettled(
      configs.map((c) => provider.testConnection(c)),
    );

    // 全域 connect 不應被呼叫
    expect(mssql.connect).not.toHaveBeenCalled();

    // 所有連線都應該成功
    for (const result of results) {
      expect(result.status).toBe('fulfilled');
      if (result.status === 'fulfilled') {
        expect(result.value.success).toBe(true);
      }
    }

    // 應該建立了 3 個獨立的 ConnectionPool，各自收到正確的 config
    expect(poolConfigs).toHaveLength(3);
    expect(poolConfigs[0].server).toBe('host-a');
    expect(poolConfigs[0].user).toBe('user_a');
    expect(poolConfigs[1].server).toBe('host-b');
    expect(poolConfigs[1].user).toBe('user_b');
    expect(poolConfigs[2].server).toBe('host-c');
    expect(poolConfigs[2].user).toBe('user_c');
  });

  it('每個並行連線完成後應各自關閉自己的連線池', async () => {
    const closeFns: ReturnType<typeof vi.fn>[] = [];

    mssql.ConnectionPool = function MockConnectionPool() {
      const closeFn = vi.fn().mockResolvedValue(undefined);
      closeFns.push(closeFn);

      return {
        connect: vi.fn().mockResolvedValue({
          request: vi.fn().mockReturnValue({
            query: vi.fn().mockResolvedValue({}),
          }),
          close: closeFn,
        }),
      };
    };

    const configs = [
      { type: 'sqlserver' as const, host: 'host-1', port: 1433, database: 'db1', username: 'u1', password: 'p1' },
      { type: 'sqlserver' as const, host: 'host-2', port: 1433, database: 'db2', username: 'u2', password: 'p2' },
    ];

    await Promise.allSettled(
      configs.map((c) => provider.testConnection(c)),
    );

    // 每個連線池的 close 都應被呼叫
    expect(closeFns).toHaveLength(2);
    for (const fn of closeFns) {
      expect(fn).toHaveBeenCalledTimes(1);
    }
  });

  it('SQL Server 連線失敗時仍應正確關閉獨立連線池並回傳正確錯誤', async () => {
    const closeFn = vi.fn().mockResolvedValue(undefined);

    mssql.ConnectionPool = function MockConnectionPool() {
      return {
        connect: vi.fn().mockResolvedValue({
          request: vi.fn().mockReturnValue({
            query: vi.fn().mockRejectedValue(
              Object.assign(new Error('Login failed for user'), { code: 'ELOGIN' }),
            ),
          }),
          close: closeFn,
        }),
      };
    };

    const result = await provider.testConnection({
      type: 'sqlserver',
      host: 'host-x',
      port: 1433,
      database: 'db_x',
      username: 'bad_user',
      password: 'bad_pass',
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('DS_AUTH_FAILED');
    expect(result.errorMessage).toBe('帳號或密碼錯誤');
    // pool.close() 應該被呼叫以清理資源
    expect(closeFn).toHaveBeenCalledTimes(1);
  });
});
