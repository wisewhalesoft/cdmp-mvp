/**
 * F044: ETL Target Load + UPSERT 測試（In-DB SQL Strategy）
 * 覆蓋 TS-F044-001 ~ TS-F044-016
 */
import { describe, it, expect, vi } from 'vitest';
import { TargetLoadHandler, calculateBatchSize } from '../engine/handlers/target-load-handler';
import { NodeExecutionContext, DataSet, makeTempTableName } from '../engine/types';

// --- Helpers ---
function makeDs(tempTable: string, rowCount: number): DataSet {
  return { tempTable, rowCount };
}

function createMockQueryRunner(opts: {
  tableExists?: boolean;
  columns?: string[];
  customHandler?: (sql: string, params?: any[]) => any;
} = {}) {
  const { tableExists = true, columns = ['customer_id', 'source_customer_no', 'name'], customHandler } = opts;
  const calls: { sql: string; params?: any[] }[] = [];

  const query = vi.fn(async (sql: string, params?: any[]) => {
    calls.push({ sql, params });

    if (customHandler) {
      const result = customHandler(sql, params);
      if (result !== undefined) return result;
    }

    if (sql.includes('information_schema.tables')) {
      return tableExists ? [{ table_name: 'customer_core' }] : [];
    }

    if (sql.includes('information_schema.columns')) {
      return columns.map((c, i) => ({ column_name: c, ordinal_position: i + 1 }));
    }

    return [];
  });

  return { query, calls } as any;
}

function makeTargetLoadContext(
  input: DataSet,
  opts: {
    isTestRun?: boolean;
    tableExists?: boolean;
    targetTable?: string;
    pipelineId?: string;
    queryRunner?: any;
    columns?: string[];
  } = {},
): NodeExecutionContext {
  const {
    isTestRun = false,
    tableExists = true,
    targetTable = 'customer_core',
    pipelineId = 'test-pipeline-uuid-123',
    columns = ['customer_id', 'source_customer_no', 'name'],
  } = opts;

  const queryRunner = opts.queryRunner ?? createMockQueryRunner({ tableExists, columns });

  return {
    node: {
      id: 'tl1',
      type: 'pipelineNode',
      position: { x: 0, y: 0 },
      data: { nodeType: 'target_load', label: '載入', targetTable },
    },
    inputs: { default: input },
    pipelineId,
    logId: 'test-log-1234',
    isTestRun,
    queryRunner,
  };
}

// ===== Test Run Mode =====

describe('TargetLoadHandler - test run mode', () => {
  const handler = new TargetLoadHandler();

  // TS-F044-001: is_test_run=true 跳過 UPSERT
  it('TS-F044-001: test run skips UPSERT, returns input rowCount', async () => {
    const ctx = makeTargetLoadContext(makeDs('etl_tmp_df3', 100), { isTestRun: true });
    const result = await handler.execute(ctx);

    expect(result.rowCount).toBe(100);

    // Verify no INSERT/UPSERT SQL was called (only table check)
    const qr = ctx.queryRunner;
    const upsertCalls = qr.calls.filter((c: any) => c.sql.includes('INSERT'));
    expect(upsertCalls).toHaveLength(0);
  });
});

// ===== Table Validation =====

describe('TargetLoadHandler - table validation', () => {
  const handler = new TargetLoadHandler();

  // TS-F044-003: 目標表不存在
  it('TS-F044-003: throws when target table does not exist', async () => {
    const ctx = makeTargetLoadContext(
      makeDs('etl_tmp_input', 1),
      { tableExists: false, targetTable: 'non_existent_table' },
    );

    await expect(handler.execute(ctx)).rejects.toThrow(
      '目標表 non_existent_table 不存在，請確認 migration 已執行',
    );
  });
});

// ===== UPSERT Logic =====

describe('TargetLoadHandler - UPSERT', () => {
  const handler = new TargetLoadHandler();

  // TS-F044-004: UPSERT SQL — INSERT INTO target SELECT FROM temp ON CONFLICT
  it('TS-F044-004: UPSERT generates INSERT INTO SELECT FROM temp table', async () => {
    const ctx = makeTargetLoadContext(makeDs('etl_tmp_df3', 1));
    await handler.execute(ctx);

    const qr = ctx.queryRunner;
    const insertCall = qr.calls.find((c: any) => c.sql.includes('INSERT INTO'));
    expect(insertCall).toBeDefined();
    expect(insertCall.sql).toContain('INSERT INTO "customer_core"');
    expect(insertCall.sql).toContain('ON CONFLICT ("source_customer_no")');
    expect(insertCall.sql).toContain('DO UPDATE SET');
  });

  // TS-F044-005 & TS-F044-006: UPDATE logic excludes customer_id and source_customer_no
  it('TS-F044-005/006: UPSERT SQL excludes customer_id and source_customer_no from UPDATE', async () => {
    const ctx = makeTargetLoadContext(makeDs('etl_tmp_df3', 1));
    await handler.execute(ctx);

    const qr = ctx.queryRunner;
    const insertCall = qr.calls.find((c: any) => c.sql.includes('INSERT INTO'));
    const updatePart = insertCall.sql.split('DO UPDATE SET')[1];
    expect(updatePart).toBeDefined();
    expect(updatePart).not.toContain('"customer_id"');
    expect(updatePart).not.toContain('"source_customer_no"');
    expect(updatePart).toContain('"name"');
  });

  // TS-F044-007: ETL 追蹤欄位
  it('TS-F044-007: ETL tracking fields added to temp table', async () => {
    const ctx = makeTargetLoadContext(makeDs('etl_tmp_df3', 1), { pipelineId: 'test-pipeline-uuid-123' });
    await handler.execute(ctx);

    const qr = ctx.queryRunner;
    const createCall = qr.calls.find((c: any) => c.sql.includes('CREATE TEMP TABLE'));
    expect(createCall).toBeDefined();
    expect(createCall.sql).toContain('_etl_loaded_at');
    expect(createCall.sql).toContain('_etl_pipeline_id');
    expect(createCall.sql).toContain('test-pipeline-uuid-123');
  });

  // TS-F044-008: Single SQL UPSERT (no batch needed — SQL handles all rows)
  it('TS-F044-008: single SQL UPSERT for all rows (no memory batching needed)', async () => {
    const ctx = makeTargetLoadContext(makeDs('etl_tmp_df3', 100));
    const result = await handler.execute(ctx);
    expect(result.rowCount).toBe(100);

    const qr = ctx.queryRunner;
    const insertCalls = qr.calls.filter((c: any) => c.sql.includes('INSERT INTO'));
    expect(insertCalls.length).toBe(1); // Single SQL UPSERT
  });

  // TS-F044-011: 空 DataSet 不執行 UPSERT
  it('TS-F044-011: empty DataSet → no UPSERT, completed with rowCount=0', async () => {
    const ctx = makeTargetLoadContext(makeDs('', 0));
    const result = await handler.execute(ctx);

    expect(result.rowCount).toBe(0);
    expect(result.tempTable).toBe('');
  });

  // TS-F044-014: UPSERT 失敗
  it('TS-F044-014: UPSERT failure reports error', async () => {
    const qr = createMockQueryRunner({
      customHandler: (sql) => {
        if (sql.includes('INSERT INTO')) {
          throw new Error('DB connection lost');
        }
        return undefined;
      },
    });

    const ctx = makeTargetLoadContext(makeDs('etl_tmp_df3', 10), { queryRunner: qr });
    await expect(handler.execute(ctx)).rejects.toThrow('UPSERT 批次失敗');
    await expect(handler.execute(ctx)).rejects.toThrow('offset: 0');
  });
});

// ===== Batch Size Calculation =====

describe('calculateBatchSize', () => {
  // TS-F044-015: 批次大小計算 45 欄位
  it('TS-F044-015: 45 columns → batchSize = 1456', () => {
    expect(calculateBatchSize(45, 5000)).toBe(1456);
  });

  // TS-F044-016: 欄位數少時以 configuredBatchSize 為準
  it('TS-F044-016: 10 columns → uses configuredBatchSize 500', () => {
    expect(calculateBatchSize(10, 500)).toBe(500);
  });

  it('maxBatchSize calculation: floor(65535/45) = 1456', () => {
    expect(Math.floor(65535 / 45)).toBe(1456);
  });

  it('maxBatchSize calculation: floor(65535/10) = 6553', () => {
    expect(Math.floor(65535 / 10)).toBe(6553);
  });
});
