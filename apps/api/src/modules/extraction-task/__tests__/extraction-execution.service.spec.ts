import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExtractionExecutionService } from '../extraction-execution.service';

/**
 * Unit tests for the full-mode fast-path selection in executeExtraction:
 *   - full + streaming source (MSSQL) + COPY target (PG) → streamBatches + COPY
 *   - everything else                                     → readBatch + insertBatch
 * executeExtraction is private + fire-and-forget; we invoke it directly and await.
 */
describe('ExtractionExecutionService — stream+COPY path selection', () => {
  let taskRepository: any;
  let logRepository: any;
  let executor: any;
  let rawDataService: any;
  let service: ExtractionExecutionService;
  let writer: { rows: any[]; writeRows: any; finish: any; abort: any };

  const META = [
    { name: 'a', dataType: 'int', isPrimary: false },
    { name: 'b', dataType: 'nvarchar', isPrimary: false },
  ];
  const ALL_COLS = ['a', 'b', '_cdmp_extracted_at'];

  function makeTask(overrides: Record<string, any> = {}) {
    return {
      id: 'task-1',
      datasource_id: 'ds-ms',
      source_table: 'OBPOOLDATA',
      source_schema: 'dbo',
      mode: 'full',
      raw_table_name: 'raw_deadbeef',
      incremental_column: null,
      last_incremental_value: null,
      status: 'running',
      execution_count: 0,
      avg_duration_ms: 0,
      extracted_count: 0,
      progress_percent: 0,
      total_count: 0,
      error_message: null,
      ...overrides,
    };
  }

  function makeWriter() {
    const rows: any[] = [];
    return {
      rows,
      writeRows: vi.fn(async (r: any[]) => { rows.push(...r); }),
      finish: vi.fn(async () => { /* no-op */ }),
      abort: vi.fn(async () => { /* no-op */ }),
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    taskRepository = { save: vi.fn(async (t: any) => t) };
    logRepository = { save: vi.fn(async (l: any) => l) };
    writer = makeWriter();

    executor = {
      getSourceTableMetadata: vi.fn().mockResolvedValue(META),
      getSourceCount: vi.fn().mockResolvedValue(3),
      supportsStreaming: vi.fn().mockResolvedValue(true),
      streamBatches: vi.fn(async (_params: any, onBatch: (rows: any[]) => Promise<void>) => {
        await onBatch([{ a: 1, b: 2 }, { a: 3, b: 4 }]);
        await onBatch([{ a: 5, b: 6 }]);
      }),
      readBatch: vi.fn(),
    };

    rawDataService = {
      tableExists: vi.fn().mockResolvedValue(true),
      getTableColumns: vi.fn().mockResolvedValue(['a', 'b', '_cdmp_id', '_cdmp_extracted_at']),
      sanitizeColumnName: (n: string) => n,
      createRawTable: vi.fn().mockResolvedValue(undefined),
      dropTable: vi.fn().mockResolvedValue(undefined),
      truncateTable: vi.fn().mockResolvedValue(undefined),
      supportsCopy: vi.fn().mockReturnValue(true),
      openCopyWriter: vi.fn(async () => writer),
      insertBatch: vi.fn(async (_t: string, _c: string[], rows: any[]) => rows.length),
    };

    service = new ExtractionExecutionService(
      taskRepository,
      logRepository,
      executor,
      rawDataService,
    );
  });

  it('full + MSSQL + PG: uses streamBatches + COPY (never readBatch/insertBatch)', async () => {
    const task = makeTask();
    const log: any = { total_count: 0, extracted_count: 0 };

    await (service as any).executeExtraction(task, log);

    expect(executor.streamBatches).toHaveBeenCalledTimes(1);
    expect(rawDataService.openCopyWriter).toHaveBeenCalledWith('raw_deadbeef', ALL_COLS);
    expect(writer.writeRows).toHaveBeenCalledTimes(2);
    expect(writer.finish).toHaveBeenCalledTimes(1);
    expect(writer.abort).not.toHaveBeenCalled();

    // COPY received all 3 rows, each stamped with _cdmp_extracted_at
    expect(writer.rows).toHaveLength(3);
    expect(writer.rows.every((r) => typeof r._cdmp_extracted_at === 'string')).toBe(true);

    // original slow path untouched
    expect(executor.readBatch).not.toHaveBeenCalled();
    expect(rawDataService.insertBatch).not.toHaveBeenCalled();

    expect(task.status).toBe('completed');
    expect(task.extracted_count).toBe(3);
    expect(task.progress_percent).toBe(100);
    expect(log.status).toBe('completed');
    expect(log.extracted_count).toBe(3);
  });

  it('source without streaming (supportsStreaming=false): falls back to readBatch + insertBatch', async () => {
    executor.supportsStreaming.mockResolvedValue(false);
    let call = 0;
    executor.readBatch.mockImplementation(async () => {
      call++;
      return call === 1
        ? { rows: [{ a: 1, b: 2 }], hasMore: true, lastKeyValue: undefined }
        : { rows: [], hasMore: false };
    });

    const task = makeTask();
    await (service as any).executeExtraction(task, { total_count: 0, extracted_count: 0 });

    expect(rawDataService.openCopyWriter).not.toHaveBeenCalled();
    expect(executor.streamBatches).not.toHaveBeenCalled();
    expect(executor.readBatch).toHaveBeenCalled();
    expect(rawDataService.insertBatch).toHaveBeenCalledWith('raw_deadbeef', ALL_COLS, expect.any(Array));
    expect(task.status).toBe('completed');
  });

  it('incremental mode: stays on readBatch even if source/target could stream', async () => {
    executor.readBatch.mockResolvedValue({ rows: [], hasMore: false });
    const task = makeTask({ mode: 'incremental', incremental_column: 'updated_at' });

    await (service as any).executeExtraction(task, { total_count: 0, extracted_count: 0 });

    expect(rawDataService.openCopyWriter).not.toHaveBeenCalled();
    expect(executor.streamBatches).not.toHaveBeenCalled();
    expect(executor.readBatch).toHaveBeenCalled();
  });

  it('non-PostgreSQL target (supportsCopy=false): falls back to readBatch + insertBatch', async () => {
    rawDataService.supportsCopy.mockReturnValue(false);
    executor.readBatch.mockResolvedValue({ rows: [], hasMore: false });

    const task = makeTask();
    await (service as any).executeExtraction(task, { total_count: 0, extracted_count: 0 });

    expect(rawDataService.openCopyWriter).not.toHaveBeenCalled();
    expect(executor.readBatch).toHaveBeenCalled();
  });

  it('on stream error: aborts the COPY writer and marks task/log failed', async () => {
    executor.streamBatches.mockImplementation(async (_p: any, onBatch: any) => {
      await onBatch([{ a: 1, b: 2 }]);
      throw new Error('mssql stream died');
    });

    const task = makeTask();
    const log: any = { total_count: 0, extracted_count: 0 };
    await (service as any).executeExtraction(task, log);

    expect(writer.abort).toHaveBeenCalledTimes(1);
    expect(writer.finish).not.toHaveBeenCalled();
    expect(task.status).toBe('failed');
    expect(task.error_message).toContain('mssql stream died');
    expect(log.status).toBe('failed');
  });
});
