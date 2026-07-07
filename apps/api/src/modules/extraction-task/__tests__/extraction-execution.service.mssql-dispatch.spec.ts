/**
 * AD-E07-41 P4e — §三 DISPATCH：ExtractionExecutionService 之 canStream 認識 supportsBulk，
 * mssql 目標於 full+streaming 情境正確分派至 openBulkWriter（否則 bulk 機制為死碼）。
 * mock-based，比照既有 extraction-execution.service.spec.ts 風格。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExtractionExecutionService } from '../extraction-execution.service';

describe('ExtractionExecutionService — P4e bulk dispatch (mssql target)', () => {
  let taskRepository: any;
  let logRepository: any;
  let executor: any;
  let rawDataService: any;
  let service: ExtractionExecutionService;
  let bulkWriter: { rows: any[]; writeRows: any; finish: any; abort: any };
  let copyWriter: { rows: any[]; writeRows: any; finish: any; abort: any };

  const META = [
    { name: 'a', dataType: 'int', isPrimary: false },
    { name: 'b', dataType: 'nvarchar', isPrimary: false },
  ];
  const ALL_COLS = ['a', 'b', '_cdmp_extracted_at'];

  function makeTask(overrides: Record<string, any> = {}) {
    return {
      id: 'task-1', datasource_id: 'ds-ms', source_table: 'OBPOOLDATA', source_schema: 'dbo',
      mode: 'full', raw_table_name: 'raw_deadbeef', incremental_column: null,
      last_incremental_value: null, status: 'running', execution_count: 0, avg_duration_ms: 0,
      extracted_count: 0, progress_percent: 0, total_count: 0, error_message: null, ...overrides,
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
    bulkWriter = makeWriter();
    copyWriter = makeWriter();

    executor = {
      getSourceTableMetadata: vi.fn().mockResolvedValue(META),
      getSourceCount: vi.fn().mockResolvedValue(3),
      supportsStreaming: vi.fn().mockResolvedValue(true),
      streamBatches: vi.fn(async (_p: any, onBatch: (rows: any[]) => Promise<void>) => {
        await onBatch([{ a: 1, b: 2 }, { a: 3, b: 4 }]);
        await onBatch([{ a: 5, b: 6 }]);
      }),
      readBatch: vi.fn(),
    };

    // mssql target: supportsCopy=false, supportsBulk=true
    rawDataService = {
      tableExists: vi.fn().mockResolvedValue(true),
      getTableColumns: vi.fn().mockResolvedValue(['a', 'b', '_cdmp_id', '_cdmp_extracted_at']),
      sanitizeColumnName: (n: string) => n,
      createRawTable: vi.fn().mockResolvedValue(undefined),
      dropTable: vi.fn().mockResolvedValue(undefined),
      truncateTable: vi.fn().mockResolvedValue(undefined),
      supportsCopy: vi.fn().mockReturnValue(false),
      supportsBulk: vi.fn().mockReturnValue(true),
      openBulkWriter: vi.fn(async () => bulkWriter),
      openCopyWriter: vi.fn(async () => copyWriter),
      insertBatch: vi.fn(async (_t: string, _c: string[], rows: any[]) => rows.length),
    };

    service = new ExtractionExecutionService(taskRepository, logRepository, executor, rawDataService);
  });

  it('DISPATCH-003: mssql + full + streaming → openBulkWriter（非 openCopyWriter、非 insertBatch）', async () => {
    const task = makeTask();
    const log: any = { total_count: 0, extracted_count: 0 };

    await (service as any).executeExtraction(task, log);

    expect(rawDataService.openBulkWriter).toHaveBeenCalledTimes(1);
    expect(rawDataService.openBulkWriter).toHaveBeenCalledWith('raw_deadbeef', ALL_COLS);
    expect(rawDataService.openCopyWriter).not.toHaveBeenCalled();
    expect(executor.streamBatches).toHaveBeenCalledTimes(1);
    expect(bulkWriter.writeRows).toHaveBeenCalledTimes(2);
    expect(bulkWriter.finish).toHaveBeenCalledTimes(1);
    expect(bulkWriter.abort).not.toHaveBeenCalled();

    // 全部 3 列進 bulk writer，各列蓋上 _cdmp_extracted_at；慢路徑未觸發
    expect(bulkWriter.rows).toHaveLength(3);
    expect(bulkWriter.rows.every((r) => typeof r._cdmp_extracted_at === 'string')).toBe(true);
    expect(executor.readBatch).not.toHaveBeenCalled();
    expect(rawDataService.insertBatch).not.toHaveBeenCalled();

    expect(task.status).toBe('completed');
    expect(task.extracted_count).toBe(3);
    expect(log.status).toBe('completed');
    expect(log.extracted_count).toBe(3);
  });

  it('DISPATCH-004 (Regression): postgres 目標（supportsCopy=true/supportsBulk=false）走 openCopyWriter', async () => {
    rawDataService.supportsCopy.mockReturnValue(true);
    rawDataService.supportsBulk.mockReturnValue(false);

    const task = makeTask();
    await (service as any).executeExtraction(task, { total_count: 0, extracted_count: 0 });

    expect(rawDataService.openCopyWriter).toHaveBeenCalledTimes(1);
    expect(rawDataService.openBulkWriter).not.toHaveBeenCalled();
    expect(copyWriter.rows).toHaveLength(3);
  });

  it('DISPATCH-001 (陷阱佐證): 若目標 supportsCopy=false 且 supportsBulk=false → canStream 為 false，落回 insertBatch 慢迴圈', async () => {
    // 模擬「新機制未被觸發」之死碼陷阱情境（例如未修正 canStream）
    rawDataService.supportsCopy.mockReturnValue(false);
    rawDataService.supportsBulk.mockReturnValue(false);
    executor.readBatch.mockResolvedValue({ rows: [], hasMore: false });

    const task = makeTask();
    await (service as any).executeExtraction(task, { total_count: 0, extracted_count: 0 });

    expect(rawDataService.openBulkWriter).not.toHaveBeenCalled();
    expect(rawDataService.openCopyWriter).not.toHaveBeenCalled();
    expect(executor.streamBatches).not.toHaveBeenCalled();
    expect(executor.readBatch).toHaveBeenCalled();
  });

  it('DISPATCH-005 (Boundary): incremental 模式 mssql 目標恆走 readBatch（不 bulk）', async () => {
    executor.readBatch.mockResolvedValue({ rows: [], hasMore: false });
    const task = makeTask({ mode: 'incremental', incremental_column: 'updated_at' });

    await (service as any).executeExtraction(task, { total_count: 0, extracted_count: 0 });

    expect(rawDataService.openBulkWriter).not.toHaveBeenCalled();
    expect(executor.streamBatches).not.toHaveBeenCalled();
    expect(executor.readBatch).toHaveBeenCalled();
  });

  it('bulk stream error → openBulkWriter.abort 呼叫、task/log 標記 failed', async () => {
    executor.streamBatches.mockImplementation(async (_p: any, onBatch: any) => {
      await onBatch([{ a: 1, b: 2 }]);
      throw new Error('mssql stream died');
    });

    const task = makeTask();
    const log: any = { total_count: 0, extracted_count: 0 };
    await (service as any).executeExtraction(task, log);

    expect(bulkWriter.abort).toHaveBeenCalledTimes(1);
    expect(bulkWriter.finish).not.toHaveBeenCalled();
    expect(task.status).toBe('failed');
    expect(task.error_message).toContain('mssql stream died');
    expect(log.status).toBe('failed');
  });
});
