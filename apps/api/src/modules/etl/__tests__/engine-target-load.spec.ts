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
  rowCount?: number;
  customHandler?: (sql: string, params?: any[]) => any;
} = {}) {
  const { tableExists = true, columns = ['customer_id', 'source_customer_no', 'name'], rowCount = 0, customHandler } = opts;
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

    // BUG-2 fix: data_type query for VARCHAR detection
    if (sql.includes('information_schema.columns') && sql.includes('data_type')) {
      return columns.map((c, i) => ({
        column_name: c,
        data_type: c === 'customer_id' ? 'uuid' : 'character varying',
        ordinal_position: i + 1,
      }));
    }

    if (sql.includes('information_schema.columns')) {
      return columns.map((c, i) => ({ column_name: c, ordinal_position: i + 1 }));
    }

    if (sql.includes('COUNT(*)')) {
      return [{ cnt: rowCount }];
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
    fullMode?: boolean;
  } = {},
): NodeExecutionContext {
  const {
    isTestRun = false,
    tableExists = true,
    targetTable = 'customer_core',
    pipelineId = 'test-pipeline-uuid-123',
    columns = ['customer_id', 'source_customer_no', 'name'],
    fullMode,
  } = opts;

  const queryRunner = opts.queryRunner ?? createMockQueryRunner({ tableExists, columns, rowCount: input.rowCount });

  return {
    node: {
      id: 'tl1',
      type: 'pipelineNode',
      position: { x: 0, y: 0 },
      data: { nodeType: 'target_load', label: '載入', targetTable, ...(fullMode !== undefined ? { fullMode } : {}) },
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
      rowCount: 10,
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

// ===== BUG-2 Fix Verification =====

describe('TargetLoadHandler - BUG-2 fixes', () => {
  const handler = new TargetLoadHandler();

  // TS-F044-018: [BUG-2] name=null 記錄正常寫入，不被隱性過濾排除
  it('TS-F044-018: name=null row is NOT filtered out by implicit NOT NULL check', async () => {
    const ctx = makeTargetLoadContext(makeDs('etl_tmp_df3', 1));
    await handler.execute(ctx);

    const qr = ctx.queryRunner;
    // After BUG-2 fix: no information_schema.columns query for is_nullable
    const isNullableCall = qr.calls.find((c: any) => c.sql.includes('is_nullable'));
    expect(isNullableCall).toBeUndefined();
    // UPSERT SQL should NOT contain any IS NOT NULL WHERE filter
    const insertCall = qr.calls.find((c: any) => c.sql.includes('INSERT INTO'));
    expect(insertCall).toBeDefined();
    expect(insertCall.sql).not.toContain('IS NOT NULL');
  });

  // TS-F044-019: [BUG-2] ghost record 閘門 — source_customer_no 長度 < 5 被跳過
  it('TS-F044-019: ghost record gate filters source_customer_no with LENGTH >= 5', async () => {
    const ctx = makeTargetLoadContext(makeDs('etl_tmp_df3', 4));
    await handler.execute(ctx);

    const qr = ctx.queryRunner;
    // After BUG-2 fix: UPSERT SQL should contain ghost record gate
    const insertCall = qr.calls.find((c: any) => c.sql.includes('INSERT INTO'));
    expect(insertCall).toBeDefined();
    expect(insertCall.sql).toContain('LENGTH(TRIM("source_customer_no")) >= 5');
  });

  // TS-F044-020: [BUG-2] VARCHAR 空字串正規化為 null (NULLIF(TRIM))
  it('TS-F044-020: VARCHAR columns use NULLIF(TRIM(col), \'\') normalization', async () => {
    const columns = ['customer_id', 'source_customer_no', 'name', 'email'];
    const qr = createMockQueryRunner({ columns, rowCount: 3 });
    const ctx = makeTargetLoadContext(makeDs('etl_tmp_df3', 3), { queryRunner: qr, columns });
    await handler.execute(ctx);

    // After BUG-2 fix: CREATE TEMP TABLE (enriched) should apply NULLIF(TRIM) to VARCHAR columns
    const createCall = qr.calls.find((c: any) => c.sql.includes('CREATE TEMP TABLE'));
    expect(createCall).toBeDefined();
    expect(createCall.sql).toContain('NULLIF(TRIM(');
  });
});

// ===== AD-E07-12 fullMode generic target table support =====

describe('TargetLoadHandler - fullMode 通用全量替換路徑（AD-E07-12）', () => {
  const handler = new TargetLoadHandler();

  // fullMode 對 ob_emphire 等通用目標表跳過 customer_core 專屬邏輯
  it('fullMode + 非 customer_core 目標表：SQL 不含 source_customer_no 相關邏輯', async () => {
    const obEmphireColumns = ['emp_id', 'emp_nm', 'dept_code', 'resign_date'];
    const qr = createMockQueryRunner({ columns: obEmphireColumns, rowCount: 100 });
    const ctx = makeTargetLoadContext(makeDs('etl_tmp_extract', 100), {
      queryRunner: qr,
      targetTable: 'ob_emphire',
      columns: obEmphireColumns,
      fullMode: true,
    });

    const result = await handler.execute(ctx);
    expect(result.rowCount).toBe(100);

    // 不應出現 customer_core 專屬的 ghost gate / dedup / UPSERT 字串
    const allSql = qr.calls.map((c: any) => c.sql).join('\n');
    expect(allSql).not.toContain('source_customer_no');
    expect(allSql).not.toContain('LENGTH(TRIM');
    expect(allSql).not.toContain('DISTINCT ON');
    expect(allSql).not.toContain('ON CONFLICT');
    expect(allSql).not.toContain('DO UPDATE');
    expect(allSql).not.toContain('is_nullable');
  });

  it('fullMode：執行 TRUNCATE TABLE 後批次 INSERT', async () => {
    const ctx = makeTargetLoadContext(makeDs('etl_tmp_extract', 50), {
      targetTable: 'ob_calendar',
      columns: ['calendar_date', 'rest_flg'],
      fullMode: true,
    });
    await handler.execute(ctx);

    const qr = ctx.queryRunner;
    const truncateCall = qr.calls.find((c: any) => c.sql.includes('TRUNCATE TABLE'));
    expect(truncateCall).toBeDefined();
    expect(truncateCall.sql).toContain('"ob_calendar"');

    const insertCalls = qr.calls.filter((c: any) => c.sql.includes('INSERT INTO'));
    expect(insertCalls.length).toBeGreaterThanOrEqual(1);
    expect(insertCalls[0].sql).toContain('INSERT INTO "ob_calendar"');
  });

  it('fullMode：TRUNCATE 失敗時拋出明確錯誤訊息', async () => {
    const qr = createMockQueryRunner({
      columns: ['emp_id', 'emp_nm'],
      rowCount: 5,
      customHandler: (sql) => {
        if (sql.includes('TRUNCATE TABLE')) {
          throw new Error('permission denied');
        }
        return undefined;
      },
    });
    const ctx = makeTargetLoadContext(makeDs('etl_tmp_extract', 5), {
      queryRunner: qr,
      targetTable: 'ob_emphire',
      columns: ['emp_id', 'emp_nm'],
      fullMode: true,
    });

    await expect(handler.execute(ctx)).rejects.toThrow('fullMode TRUNCATE 失敗：permission denied');
  });

  it('fullMode：INSERT 批次失敗時錯誤訊息含 offset 與已寫入數', async () => {
    let insertCount = 0;
    const qr = createMockQueryRunner({
      columns: ['emp_id'],
      rowCount: 6000,
      customHandler: (sql) => {
        if (sql.includes('INSERT INTO') && !sql.includes('CREATE')) {
          insertCount++;
          if (insertCount === 2) throw new Error('disk full');
        }
        return undefined;
      },
    });
    const ctx = makeTargetLoadContext(makeDs('etl_tmp_extract', 6000), {
      queryRunner: qr,
      targetTable: 'ob_emphire',
      columns: ['emp_id'],
      fullMode: true,
    });

    // 單次執行同時驗證兩個 substring（避免跨呼叫狀態累積）
    await expect(handler.execute(ctx)).rejects.toThrow(
      /fullMode INSERT 批次失敗.*offset: 5000.*已成功寫入: 5000/s,
    );
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

// ===== fullMode 全量重寫 =====

describe('TargetLoadHandler - fullMode', () => {
  const handler = new TargetLoadHandler();

  // TS-F044-021: fullMode=true 正常路徑 — TRUNCATE 後 INSERT，無 ON CONFLICT
  it('TS-F044-021: fullMode=true executes TRUNCATE then INSERT without ON CONFLICT', async () => {
    const ctx = makeTargetLoadContext(makeDs('etl_tmp_df3', 2), { fullMode: true });
    const result = await handler.execute(ctx);

    const qr = ctx.queryRunner;

    // TRUNCATE SQL 已呼叫
    const truncateCall = qr.calls.find((c: any) => c.sql.includes('TRUNCATE'));
    expect(truncateCall).toBeDefined();
    expect(truncateCall.sql).toContain('"customer_core"');

    // INSERT SQL 已呼叫
    const insertCall = qr.calls.find((c: any) => c.sql.includes('INSERT INTO'));
    expect(insertCall).toBeDefined();
    expect(insertCall.sql).toContain('INSERT INTO "customer_core"');

    // INSERT SQL 不含 ON CONFLICT
    expect(insertCall.sql).not.toContain('ON CONFLICT');

    // INSERT SQL 含 ETL 追蹤欄位
    expect(insertCall.sql).toContain('_etl_loaded_at');
    expect(insertCall.sql).toContain('_etl_pipeline_id');

    // TRUNCATE 在 INSERT 之前（依 calls 陣列 index）
    const truncateIdx = qr.calls.indexOf(truncateCall);
    const insertIdx = qr.calls.indexOf(insertCall);
    expect(truncateIdx).toBeLessThan(insertIdx);

    // 回傳 rowCount = 2
    expect(result.rowCount).toBe(2);
  });

  // TS-F044-022: fullMode=true + isTestRun=true — 不執行 TRUNCATE（安全防護）
  it('TS-F044-022: fullMode=true + isTestRun=true skips TRUNCATE and INSERT', async () => {
    const ctx = makeTargetLoadContext(makeDs('etl_tmp_df3', 3), { fullMode: true, isTestRun: true });
    const result = await handler.execute(ctx);

    const qr = ctx.queryRunner;

    // 無 TRUNCATE
    const truncateCalls = qr.calls.filter((c: any) => c.sql.includes('TRUNCATE'));
    expect(truncateCalls).toHaveLength(0);

    // 無 INSERT
    const insertCalls = qr.calls.filter((c: any) => c.sql.includes('INSERT INTO'));
    expect(insertCalls).toHaveLength(0);

    // 回傳 rowCount = 3（輸入筆數）
    expect(result.rowCount).toBe(3);
  });

  // TS-F044-023: fullMode=false（或未設定）— 維持 UPSERT，無 TRUNCATE
  it('TS-F044-023: fullMode=false maintains UPSERT with ON CONFLICT, no TRUNCATE', async () => {
    // 測試 fullMode=false
    const ctx1 = makeTargetLoadContext(makeDs('etl_tmp_df3', 1), { fullMode: false });
    await handler.execute(ctx1);

    const qr1 = ctx1.queryRunner;
    const truncateCalls1 = qr1.calls.filter((c: any) => c.sql.includes('TRUNCATE'));
    expect(truncateCalls1).toHaveLength(0);

    const insertCall1 = qr1.calls.find((c: any) => c.sql.includes('INSERT INTO'));
    expect(insertCall1).toBeDefined();
    expect(insertCall1.sql).toContain('ON CONFLICT ("source_customer_no")');
    expect(insertCall1.sql).toContain('DO UPDATE SET');

    // 測試 fullMode 未設定（向後相容）
    const ctx2 = makeTargetLoadContext(makeDs('etl_tmp_df3', 1));
    await handler.execute(ctx2);

    const qr2 = ctx2.queryRunner;
    const truncateCalls2 = qr2.calls.filter((c: any) => c.sql.includes('TRUNCATE'));
    expect(truncateCalls2).toHaveLength(0);

    const insertCall2 = qr2.calls.find((c: any) => c.sql.includes('INSERT INTO'));
    expect(insertCall2).toBeDefined();
    expect(insertCall2.sql).toContain('ON CONFLICT ("source_customer_no")');
  });

  // TS-F044-024: fullMode=true INSERT 失敗 — TRUNCATE 已執行，節點拋出錯誤
  it('TS-F044-024: fullMode=true INSERT failure after TRUNCATE reports error', async () => {
    const qr = createMockQueryRunner({
      rowCount: 5,
      customHandler: (sql) => {
        // TRUNCATE 正常通過
        if (sql.includes('TRUNCATE')) {
          return [];
        }
        // INSERT 拋出錯誤
        if (sql.includes('INSERT INTO') && !sql.includes('CREATE')) {
          throw new Error('DB connection lost during INSERT');
        }
        return undefined;
      },
    });

    const ctx = makeTargetLoadContext(makeDs('etl_tmp_df3', 5), { queryRunner: qr, fullMode: true });

    // 預期拋出錯誤
    await expect(handler.execute(ctx)).rejects.toThrow();

    // TRUNCATE 已執行
    const truncateCall = qr.calls.find((c: any) => c.sql.includes('TRUNCATE'));
    expect(truncateCall).toBeDefined();

    // 錯誤訊息含識別資訊
    try {
      await handler.execute(ctx);
    } catch (e: any) {
      expect(e.message).toMatch(/fullMode|INSERT 批次失敗/);
    }
  });

  // TS-F044-025: fullMode=true 跳過 customer_core 專屬 ghost gate（AD-E07-12）
  // 行為已於 2026-05-05 反轉：fullMode 為通用全量替換，不再套用 customer_core 的
  // source_customer_no 長度檢查；通用目標表（如 ob_pool_data）可能無此欄位。
  it('TS-F044-025: fullMode=true 跳過 ghost gate（AD-E07-12 純粹全量替換語意）', async () => {
    const ctx = makeTargetLoadContext(makeDs('etl_tmp_df3', 3), { fullMode: true });
    await handler.execute(ctx);

    const qr = ctx.queryRunner;

    // 任何 SQL 均不應出現 ghost gate 條件（純粹全量替換）
    const allSqlWithGhostGate = qr.calls.filter((c: any) =>
      c.sql.includes('LENGTH(TRIM("source_customer_no")) >= 5'),
    );
    expect(allSqlWithGhostGate.length).toBe(0);

    // 也不應出現 source_customer_no DISTINCT ON dedup
    const allSqlWithDedup = qr.calls.filter((c: any) =>
      c.sql.includes('DISTINCT ON ("source_customer_no")'),
    );
    expect(allSqlWithDedup.length).toBe(0);
  });
});
