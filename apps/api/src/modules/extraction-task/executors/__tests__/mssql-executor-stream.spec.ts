import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { MSSQLExecutor, MSSQLDriver } from '../mssql-executor';
import { Repository } from 'typeorm';
import { Datasource } from '@/database/entities/datasource.entity';
import { CryptoUtil } from '@/common/crypto/crypto.util';
import { randomBytes } from 'crypto';

const TEST_AES_KEY = randomBytes(32).toString('hex');

/**
 * Emulates an mssql streaming Request: emits 'row' per row then 'done',
 * honouring pause()/resume() so we can verify the executor's backpressure.
 * Optionally emits 'error' after N rows.
 */
class FakeStreamRequest extends EventEmitter {
  stream = false;
  paused = false;
  cancelled = false;
  pauseCount = 0;
  resumeCount = 0;
  lastSql = '';
  private i = 0;
  private done = false;

  constructor(
    private readonly rows: any[],
    private readonly errorAfter: number | null = null,
  ) {
    super();
  }

  input() {
    return this;
  }
  pause() {
    this.paused = true;
    this.pauseCount++;
  }
  resume() {
    this.paused = false;
    this.resumeCount++;
    this.pump();
  }
  cancel() {
    this.cancelled = true;
  }
  query(sql: string) {
    this.lastSql = sql;
    this.pump();
  }

  private pump() {
    setImmediate(() => {
      if (this.cancelled || this.paused) return;
      if (this.errorAfter != null && this.i === this.errorAfter) {
        this.emit('error', new Error('stream boom'));
        return;
      }
      if (this.i < this.rows.length) {
        this.emit('row', this.rows[this.i++]);
        this.pump();
      } else if (!this.done) {
        this.done = true;
        this.emit('done', {});
      }
    });
  }
}

describe('MSSQLExecutor.streamBatches', () => {
  let executor: MSSQLExecutor;
  let mockDatasourceRepo: Partial<Repository<Datasource>>;
  let poolConfigs: any[];
  let lastRequest: FakeStreamRequest;
  let pendingRows: any[];
  let pendingErrorAfter: number | null;
  let mockClose: ReturnType<typeof vi.fn>;
  let mockDriver: MSSQLDriver;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AES_ENCRYPTION_KEY = TEST_AES_KEY;
    const encryptedPassword = CryptoUtil.encrypt('mssql-pass');

    mockDatasourceRepo = {
      findOne: vi.fn().mockResolvedValue({
        id: 'ds-ms',
        host: '10.0.0.3',
        port: 1433,
        database_name: 'msdb',
        username: 'sa',
        encrypted_password: encryptedPassword,
        type: 'sqlserver',
      } as Partial<Datasource>),
    };

    poolConfigs = [];
    pendingRows = [];
    pendingErrorAfter = null;
    mockClose = vi.fn();

    mockDriver = {
      ConnectionPool: vi.fn().mockImplementation((config: any) => {
        poolConfigs.push(config);
        return {
          connect: vi.fn().mockResolvedValue(undefined),
          request: () => {
            lastRequest = new FakeStreamRequest(pendingRows, pendingErrorAfter);
            return lastRequest;
          },
          close: mockClose,
        };
      }),
    } as any;

    executor = new MSSQLExecutor(
      mockDatasourceRepo as Repository<Datasource>,
      mockDriver,
    );
  });

  async function collect(
    rows: any[],
    batchSize: number,
    errorAfter: number | null = null,
  ): Promise<any[][]> {
    pendingRows = rows;
    pendingErrorAfter = errorAfter;
    const batches: any[][] = [];
    await executor.streamBatches(
      { datasourceId: 'ds-ms', sourceTable: 'T', sourceSchema: 'dbo', batchSize },
      async (b) => {
        // force a microtask gap to expose any onBatch overlap bugs
        await Promise.resolve();
        batches.push(b);
      },
    );
    return batches;
  }

  it('supportsStreaming returns true', async () => {
    await expect(executor.supportsStreaming()).resolves.toBe(true);
  });

  it('delivers rows in batches of batchSize with a final partial batch', async () => {
    const rows = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }];
    const batches = await collect(rows, 2);
    expect(batches.map((b) => b.length)).toEqual([2, 2, 1]);
    expect(batches.flat()).toEqual(rows);
  });

  it('does not emit an empty trailing batch when count is an exact multiple', async () => {
    const batches = await collect([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }], 2);
    expect(batches.map((b) => b.length)).toEqual([2, 2]);
  });

  it('resolves with no onBatch calls for an empty table', async () => {
    const batches = await collect([], 1000);
    expect(batches).toEqual([]);
  });

  it('issues a plain SELECT with NO OFFSET and NO ORDER BY', async () => {
    await collect([{ id: 1 }], 1000);
    expect(lastRequest.lastSql).toBe('SELECT * FROM [dbo].[T]');
    expect(lastRequest.lastSql).not.toMatch(/OFFSET/i);
    expect(lastRequest.lastSql).not.toMatch(/ORDER BY/i);
  });

  it('uses a single connection (one ConnectionPool) for the whole stream', async () => {
    await collect([{ id: 1 }, { id: 2 }, { id: 3 }], 1);
    expect(mockDriver.ConnectionPool).toHaveBeenCalledTimes(1);
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it('applies backpressure: pause() before each onBatch, resume() after', async () => {
    await collect([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }], 2);
    // two full batches trigger pause/resume; the final partial flushes on done
    expect(lastRequest.pauseCount).toBe(2);
    expect(lastRequest.resumeCount).toBe(2);
  });

  it('disables the per-request timeout (requestTimeout: 0) while streaming', async () => {
    await collect([{ id: 1 }], 1000);
    expect(poolConfigs).toHaveLength(1);
    expect(poolConfigs[0].options.requestTimeout).toBe(0);
  });

  it('rejects and cancels the request on a stream error', async () => {
    pendingRows = [{ id: 1 }, { id: 2 }, { id: 3 }];
    pendingErrorAfter = 1; // error after first row emitted
    await expect(
      executor.streamBatches(
        { datasourceId: 'ds-ms', sourceTable: 'T', sourceSchema: 'dbo', batchSize: 1 },
        async () => { /* no-op */ },
      ),
    ).rejects.toThrow('stream boom');
    expect(lastRequest.cancelled).toBe(true);
    // pool still closed via withConnection finally
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it('propagates an error thrown by onBatch and cancels the stream', async () => {
    pendingRows = [{ id: 1 }, { id: 2 }];
    await expect(
      executor.streamBatches(
        { datasourceId: 'ds-ms', sourceTable: 'T', sourceSchema: 'dbo', batchSize: 1 },
        async () => { throw new Error('write failed'); },
      ),
    ).rejects.toThrow('write failed');
    expect(lastRequest.cancelled).toBe(true);
  });
});
