import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Repository } from 'typeorm';
import { Datasource } from '@/database/entities/datasource.entity';
import { DelegatingExecutor } from '../delegating-executor';
import { ExecutorFactory } from '../executor-factory';

/**
 * DelegatingExecutor is the executor actually injected in production, so its
 * streaming feature-detection + delegation must be covered directly (the
 * execution-service spec mocks the executor and bypasses this class).
 */
describe('DelegatingExecutor — streaming detection & delegation', () => {
  let repo: Partial<Repository<Datasource>>;
  let factory: Partial<ExecutorFactory>;
  let fakeMssql: any;
  let fakePg: any;
  let delegating: DelegatingExecutor;

  beforeEach(() => {
    vi.clearAllMocks();

    fakeMssql = {
      streamBatches: vi.fn().mockResolvedValue(undefined),
      supportsStreaming: vi.fn().mockResolvedValue(true),
    };
    fakePg = {
      // no streamBatches / supportsStreaming → not stream-capable
      readBatch: vi.fn(),
    };

    repo = {
      findOne: vi.fn().mockImplementation(({ where: { id } }: any) =>
        Promise.resolve({ type: id === 'ds-ms' ? 'sqlserver' : 'postgresql' }),
      ),
    };
    factory = {
      getExecutor: vi.fn((type: string) => (type === 'sqlserver' ? fakeMssql : fakePg)),
    };

    delegating = new DelegatingExecutor(
      repo as Repository<Datasource>,
      factory as ExecutorFactory,
    );
  });

  it('supportsStreaming → true for an MSSQL datasource', async () => {
    await expect(delegating.supportsStreaming('ds-ms')).resolves.toBe(true);
    expect(fakeMssql.supportsStreaming).toHaveBeenCalledWith('ds-ms');
  });

  it('supportsStreaming → false for a non-streaming datasource (PostgreSQL)', async () => {
    await expect(delegating.supportsStreaming('ds-pg')).resolves.toBe(false);
  });

  it('streamBatches delegates to the resolved MSSQL executor', async () => {
    const onBatch = async () => { /* no-op */ };
    const params = { datasourceId: 'ds-ms', sourceTable: 'T', sourceSchema: 'dbo', batchSize: 1000 };
    await delegating.streamBatches(params, onBatch);
    expect(fakeMssql.streamBatches).toHaveBeenCalledWith(params, onBatch);
  });

  it('streamBatches throws when the resolved executor cannot stream', async () => {
    await expect(
      delegating.streamBatches(
        { datasourceId: 'ds-pg', sourceTable: 'T', sourceSchema: null, batchSize: 1000 },
        async () => { /* no-op */ },
      ),
    ).rejects.toThrow(/not supported/i);
  });
});
