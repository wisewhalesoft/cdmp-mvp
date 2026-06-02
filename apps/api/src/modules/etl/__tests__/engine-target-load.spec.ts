/**
 * F044: ETL Target Load + UPSERT 測試（In-DB SQL Strategy）
 * 覆蓋 TS-F044-001 ~ TS-F044-016
 */
import { describe, it, expect, vi } from 'vitest';
import { TargetLoadHandler } from '../engine/handlers/target-load-handler';
import { NodeExecutionContext, DataSet, makeTempTableName } from '../engine/types';

// --- Helpers ---
function makeDs(tempTable: string, rowCount: number): DataSet {
  return { tempTable, rowCount };
}

function createMockQueryRunner(opts: {
  tableExists?: boolean;
  columns?: string[];
  rowCount?: number;
  pkColumns?: string[];
  notNullColumns?: string[];
  customHandler?: (sql: string, params?: any[]) => any;
} = {}) {
  const { tableExists = true, columns = ['customer_id', 'source_customer_no', 'name', '_etl_loaded_at', '_etl_pipeline_id'], rowCount = 0, pkColumns = [], notNullColumns, customHandler } = opts;
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

    // PK lookup for fullMode dedup
    if (sql.includes('information_schema.table_constraints')) {
      return pkColumns.map((c, i) => ({ column_name: c, ordinal_position: i + 1 }));
    }

    // NOT NULL 必填欄清單查詢（customer_core 守門用）：模擬 target 端 is_nullable='NO' 欄位，
    // 預設為所有欄位扣除 handler 自填欄（對齊真實 SQL 的 NOT IN 排除）
    if (sql.includes('is_nullable')) {
      const handlerOwned = new Set(['customer_id', '_etl_loaded_at', '_etl_pipeline_id', 'data_source']);
      return (notNullColumns ?? columns.filter((c) => !handlerOwned.has(c))).map((c) => ({ column_name: c }));
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
    columns = ['customer_id', 'source_customer_no', 'name', '_etl_loaded_at', '_etl_pipeline_id'],
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
  // Regression guard: 即使列數遠大於舊的 5000 批次門檻，仍只發一條 INSERT…SELECT
  // （防止 LIMIT/OFFSET 分批 O(n²) 反模式被重新引入）。
  it('TS-F044-008: single SQL UPSERT for all rows regardless of row count (no OFFSET batching)', async () => {
    const ctx = makeTargetLoadContext(makeDs('etl_tmp_df3', 100000));
    const result = await handler.execute(ctx);
    expect(result.rowCount).toBe(100000);

    const qr = ctx.queryRunner;
    const insertCalls = qr.calls.filter((c: any) => c.sql.includes('INSERT INTO'));
    expect(insertCalls.length).toBe(1); // Single SQL UPSERT — 一條搬全部
    // 不得出現 LIMIT/OFFSET 分頁（O(n²) 反模式）
    expect(insertCalls[0].sql).not.toMatch(/OFFSET/i);
    expect(insertCalls[0].sql).not.toMatch(/LIMIT/i);
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
    await expect(handler.execute(ctx)).rejects.toThrow('UPSERT 失敗：DB connection lost');
  });
});

// ===== BUG-2 Fix Verification =====

describe('TargetLoadHandler - BUG-2 fixes', () => {
  const handler = new TargetLoadHandler();

  // TS-F044-018: 必填欄守門 — target NOT NULL 業務欄位為 null 的列以 IS NOT NULL 過濾排除。
  // 2026-05-29 依裁示復原（commit 2b1e876 一度移除）：customer_core.name / customer_type_code
  // 皆為 schema NOT NULL，MLMC-only 合併列會留 null；不先濾掉會讓單條 INSERT 整批 rollback。
  it('TS-F044-018: rows with null NOT-NULL business columns are gated out via IS NOT NULL filter', async () => {
    const columns = ['customer_id', 'source_customer_no', 'name', 'customer_type_code', '_etl_loaded_at', '_etl_pipeline_id'];
    const qr = createMockQueryRunner({ columns, rowCount: 10 });
    const ctx = makeTargetLoadContext(makeDs('etl_tmp_df3', 10), { queryRunner: qr, columns });
    await handler.execute(ctx);

    // 會查 target NOT NULL 欄位清單
    const isNullableCall = qr.calls.find((c: any) => c.sql.includes('is_nullable'));
    expect(isNullableCall).toBeDefined();
    // UPSERT 的 SELECT WHERE 對必填業務欄加 IS NOT NULL
    const insertCall = qr.calls.find((c: any) => c.sql.includes('INSERT INTO'));
    expect(insertCall).toBeDefined();
    expect(insertCall.sql).toContain('"name" IS NOT NULL');
    expect(insertCall.sql).toContain('"customer_type_code" IS NOT NULL');
    // handler 自填欄不納入守門條件
    expect(insertCall.sql).not.toContain('"customer_id" IS NOT NULL');
    expect(insertCall.sql).not.toContain('"_etl_loaded_at" IS NOT NULL');
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
  it('fullMode + 非 customer_core 目標表：SQL 不含 customer_core 專屬字串', async () => {
    const obEmphireColumns = ['emp_id', 'emp_nm', 'dept_code', 'resign_date'];
    const qr = createMockQueryRunner({ columns: obEmphireColumns, rowCount: 100, pkColumns: ['emp_id'] });
    const ctx = makeTargetLoadContext(makeDs('etl_tmp_extract', 100), {
      queryRunner: qr,
      targetTable: 'ob_emphire',
      columns: obEmphireColumns,
      fullMode: true,
    });

    const result = await handler.execute(ctx);
    expect(result.rowCount).toBe(100);

    // 不應出現 customer_core 專屬的 ghost gate / UPSERT 字串
    const allSql = qr.calls.map((c: any) => c.sql).join('\n');
    expect(allSql).not.toContain('source_customer_no');
    expect(allSql).not.toContain('LENGTH(TRIM');
    expect(allSql).not.toContain('DISTINCT ON ("source_customer_no")');
    expect(allSql).not.toContain('ON CONFLICT');
    expect(allSql).not.toContain('DO UPDATE');
    expect(allSql).not.toContain('is_nullable');
  });

  // fullMode + 有 PK 的 target：在 TRUNCATE 前用 DISTINCT ON (pk) 去重，
  // 防禦來源端可能挾帶的重複 PK row（例：dbo.OBEMPHIRE / dbo.OBCALENDAR
  // 在 source 端無 PK constraint，曾觀察到每筆 row × 2）
  it('fullMode：target 有 PK 時用 DISTINCT ON (pk) 去重', async () => {
    const obEmphireColumns = ['emp_id', 'emp_nm', 'dept_code'];
    const qr = createMockQueryRunner({ columns: obEmphireColumns, rowCount: 100, pkColumns: ['emp_id'] });
    const ctx = makeTargetLoadContext(makeDs('etl_tmp_extract', 100), {
      queryRunner: qr,
      targetTable: 'ob_emphire',
      columns: obEmphireColumns,
      fullMode: true,
    });
    await handler.execute(ctx);

    // dedup temp table 用 DISTINCT ON ("emp_id") 建立，且 ORDER BY emp_id
    const dedupCreate = qr.calls.find((c: any) =>
      c.sql.includes('CREATE TEMP TABLE') && c.sql.includes('DISTINCT ON ("emp_id")'),
    );
    expect(dedupCreate).toBeDefined();
    expect(dedupCreate.sql).toMatch(/ORDER BY "emp_id"/);

    // dedup 必須在 TRUNCATE 之前
    const dedupIdx = qr.calls.indexOf(dedupCreate);
    const truncateIdx = qr.calls.findIndex((c: any) => c.sql.includes('TRUNCATE TABLE'));
    expect(dedupIdx).toBeLessThan(truncateIdx);

    // INSERT 讀取的是 dedup 表（_dq 後綴），不是原 enriched 表
    const insertCall = qr.calls.find((c: any) =>
      c.sql.includes('INSERT INTO "ob_emphire"'),
    );
    expect(insertCall).toBeDefined();
    expect(insertCall.sql).toMatch(/FROM "[^"]+_dq"/);
  });

  // fullMode + 複合 PK：DISTINCT ON 用所有 PK 欄位
  it('fullMode：複合 PK 的 target 使用全部 PK 欄位去重', async () => {
    const columns = ['col_a', 'col_b', 'payload'];
    const qr = createMockQueryRunner({ columns, rowCount: 10, pkColumns: ['col_a', 'col_b'] });
    const ctx = makeTargetLoadContext(makeDs('etl_tmp_extract', 10), {
      queryRunner: qr,
      targetTable: 'composite_pk_table',
      columns,
      fullMode: true,
    });
    await handler.execute(ctx);

    const dedupCreate = qr.calls.find((c: any) =>
      c.sql.includes('CREATE TEMP TABLE') && c.sql.includes('DISTINCT ON'),
    );
    expect(dedupCreate).toBeDefined();
    expect(dedupCreate.sql).toContain('DISTINCT ON ("col_a", "col_b")');
    expect(dedupCreate.sql).toContain('ORDER BY "col_a", "col_b"');
  });

  // fullMode + 無 PK 的 target：跳過 dedup，沿用既有 TRUNCATE + INSERT 行為
  it('fullMode：target 無 PK 時跳過 dedup', async () => {
    const columns = ['col_a', 'col_b'];
    const qr = createMockQueryRunner({ columns, rowCount: 5, pkColumns: [] });
    const ctx = makeTargetLoadContext(makeDs('etl_tmp_extract', 5), {
      queryRunner: qr,
      targetTable: 'no_pk_table',
      columns,
      fullMode: true,
    });
    await handler.execute(ctx);

    const allSql = qr.calls.map((c: any) => c.sql).join('\n');
    expect(allSql).not.toContain('DISTINCT ON');
    // INSERT 應直接從 enriched temp 表讀（非 _dq）
    const insertCall = qr.calls.find((c: any) => c.sql.includes('INSERT INTO "no_pk_table"'));
    expect(insertCall).toBeDefined();
    expect(insertCall.sql).not.toMatch(/_dq"/);
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

  it('fullMode：INSERT 失敗時拋出明確錯誤訊息（單條 INSERT…SELECT）', async () => {
    const qr = createMockQueryRunner({
      columns: ['emp_id'],
      rowCount: 6000,
      customHandler: (sql) => {
        if (sql.includes('INSERT INTO') && !sql.includes('CREATE')) {
          throw new Error('disk full');
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

    await expect(handler.execute(ctx)).rejects.toThrow('fullMode INSERT 失敗：disk full');

    // 列數遠大於舊 5000 門檻仍只一條 INSERT（regression guard：無 OFFSET 分批）
    const insertCalls = qr.calls.filter(
      (c: any) => c.sql.includes('INSERT INTO') && !c.sql.includes('CREATE'),
    );
    expect(insertCalls.length).toBe(1);
  });
});

// ===== F090: partition-replace load mode (AD-E07-21 §21.3) =====
// 覆蓋 TS-F090-ETL-002 / ETL-003（handler 行為層，mock queryRunner 斷言 SQL）
// 真實 PG 端到端（含歷史限定過濾 / 多 data_source 共存資料筆數）→ Integration，
// 本專案無 PG TestContainer（package 未安裝），標 DEFERRED 於 staging 手動驗證。

describe('TargetLoadHandler - partition_replace（F090 / AD-E07-21）', () => {
  const handler = new TargetLoadHandler();

  function makePartitionCtx(
    input: DataSet,
    opts: {
      columns?: string[];
      partitionColumn?: string;
      partitionValue?: string | undefined;
      queryRunner?: any;
      omitPartitionValue?: boolean;
    } = {},
  ): NodeExecutionContext {
    const columns = opts.columns ?? ['list_no', 'orgno', 'appl_no', 'custo_no', 'assignday', 'data_source'];
    const queryRunner = opts.queryRunner ?? createMockQueryRunner({ columns, rowCount: input.rowCount });
    const data: Record<string, unknown> = {
      nodeType: 'target_load',
      label: '載入',
      targetTable: 'ob_pool_data_list',
      loadMode: 'partition_replace',
      partitionColumn: opts.partitionColumn ?? 'data_source',
    };
    if (!opts.omitPartitionValue) {
      // v2.0（AD-E07-25 DP-AD25-1 單源化）：partitionValue 預設 'etl_load'（取代 'etl_legacy'）
      data.partitionValue = opts.partitionValue ?? 'etl_load';
    }
    return {
      node: { id: 'tl1', type: 'pipelineNode', position: { x: 0, y: 0 }, data },
      inputs: { default: input },
      pipelineId: 'test-pipeline-uuid-123',
      logId: 'test-log-1234',
      isTestRun: false,
      queryRunner,
    } as NodeExecutionContext;
  }

  // TS-F090-ETL-002v2（regression guard）：前置 DELETE 針對 partition（v2.0：data_source='etl_load'），
  // 不可全表 TRUNCATE（BR-3：fullMode 仍為 false，引擎層不 TRUNCATE）
  it('TS-F090-ETL-002v2: 前置 DELETE 針對 partition（data_source=etl_load），不 TRUNCATE 全表', async () => {
    const ctx = makePartitionCtx(makeDs('etl_tmp_oblist', 3));
    await handler.execute(ctx);

    const qr = ctx.queryRunner;
    const allSql = qr.calls.map((c: any) => c.sql).join('\n');

    // 不可全表 TRUNCATE（BR-3）
    expect(allSql).not.toContain('TRUNCATE');

    // DELETE 精確針對 partition（v2.0 partitionValue='etl_load'；AD-E07-25 §25.3 等效全量）
    const deleteCall = qr.calls.find((c: any) => c.sql.includes('DELETE FROM'));
    expect(deleteCall).toBeDefined();
    expect(deleteCall.sql).toContain('DELETE FROM "ob_pool_data_list"');
    expect(deleteCall.sql).toContain(`"data_source" = 'etl_load'`);
    // v2.0：不再以 'etl_legacy' 為 partition 值
    expect(deleteCall.sql).not.toContain(`'etl_legacy'`);

    // 不可出現未限定 partition 的 DELETE（regression guard）
    expect(allSql).not.toContain('DELETE FROM "ob_pool_data_list" WHERE "list_no"');
  });

  // TS-F090-ETL-003v2：INSERT 每列填 partitionValue（v2.0：'etl_load' AS "data_source"）
  it('TS-F090-ETL-003v2: INSERT 對每列填 data_source=etl_load（SELECT 加常數欄）', async () => {
    const ctx = makePartitionCtx(makeDs('etl_tmp_oblist', 5));
    const result = await handler.execute(ctx);

    const qr = ctx.queryRunner;
    const insertCall = qr.calls.find((c: any) => c.sql.includes('INSERT INTO'));
    expect(insertCall).toBeDefined();
    expect(insertCall.sql).toContain('INSERT INTO "ob_pool_data_list"');
    // SELECT 必含常數 partition 欄（v2.0 值域）
    expect(insertCall.sql).toContain(`'etl_load' AS "data_source"`);
    // v2.0：不再以 'etl_legacy' 為插入值
    expect(insertCall.sql).not.toContain(`'etl_legacy'`);
    // INSERT 欄位清單含 data_source
    expect(insertCall.sql).toContain('"data_source"');
    // 非 UPSERT、非 customer_core 專屬
    expect(insertCall.sql).not.toContain('ON CONFLICT');
    expect(insertCall.sql).not.toContain('source_customer_no');
    expect(result.rowCount).toBe(5);
  });

  // DELETE 必須在 INSERT 之前（per-partition 截斷語意）
  it('partition_replace: DELETE 在 INSERT 之前', async () => {
    const ctx = makePartitionCtx(makeDs('etl_tmp_oblist', 2));
    await handler.execute(ctx);

    const qr = ctx.queryRunner;
    const deleteIdx = qr.calls.findIndex((c: any) => c.sql.includes('DELETE FROM'));
    const insertIdx = qr.calls.findIndex((c: any) => c.sql.includes('INSERT INTO'));
    expect(deleteIdx).toBeGreaterThanOrEqual(0);
    expect(insertIdx).toBeGreaterThan(deleteIdx);
  });

  // partitionColumn 不應在來源映射欄位中重複出現（由 handler 填值）
  it('partition_replace: INSERT 欄位清單中 partitionColumn 僅出現一次（末尾）', async () => {
    const columns = ['list_no', 'orgno', 'appl_no', 'data_source'];
    const ctx = makePartitionCtx(makeDs('etl_tmp_oblist', 1), { columns });
    await handler.execute(ctx);

    const qr = ctx.queryRunner;
    const insertCall = qr.calls.find((c: any) => c.sql.includes('INSERT INTO'));
    // INSERT (...) 子句中 "data_source" 只出現一次
    const colListPart = insertCall.sql.split(') ')[0]; // INSERT INTO "t" (... 到第一個 ") "
    const occurrences = (colListPart.match(/"data_source"/g) || []).length;
    expect(occurrences).toBe(1);
  });

  // 缺 partitionValue → 明確錯誤
  it('partition_replace: 缺 partitionValue 拋明確錯誤', async () => {
    const ctx = makePartitionCtx(makeDs('etl_tmp_oblist', 1), { omitPartitionValue: true });
    await expect(handler.execute(ctx)).rejects.toThrow(/partitionColumn 與 partitionValue/);
  });

  // 空 input → 不 DELETE 不 INSERT（沿用 handler 早退）
  it('partition_replace: 空 DataSet 不執行 DELETE/INSERT', async () => {
    const ctx = makePartitionCtx(makeDs('', 0));
    const result = await handler.execute(ctx);
    const qr = ctx.queryRunner;
    expect(qr.calls.filter((c: any) => c.sql.includes('DELETE FROM'))).toHaveLength(0);
    expect(qr.calls.filter((c: any) => c.sql.includes('INSERT INTO'))).toHaveLength(0);
    expect(result.rowCount).toBe(0);
  });

  // isTestRun → 跳過寫入
  it('partition_replace: isTestRun 跳過 DELETE/INSERT', async () => {
    const ctx = makePartitionCtx(makeDs('etl_tmp_oblist', 3));
    (ctx as any).isTestRun = true;
    const result = await handler.execute(ctx);
    const qr = ctx.queryRunner;
    expect(qr.calls.filter((c: any) => c.sql.includes('DELETE FROM'))).toHaveLength(0);
    expect(qr.calls.filter((c: any) => c.sql.includes('INSERT INTO'))).toHaveLength(0);
    expect(result.rowCount).toBe(3);
  });

  // INSERT 失敗 → 拋明確錯誤訊息
  it('partition_replace: INSERT 失敗拋明確錯誤訊息', async () => {
    const columns = ['list_no', 'orgno', 'appl_no', 'data_source'];
    const qr = createMockQueryRunner({
      columns,
      rowCount: 3,
      customHandler: (sql: string) => {
        if (sql.includes('INSERT INTO') && !sql.includes('CREATE')) {
          throw new Error('disk full');
        }
        return undefined;
      },
    });
    const ctx = makePartitionCtx(makeDs('etl_tmp_oblist', 3), { columns, queryRunner: qr });
    await expect(handler.execute(ctx)).rejects.toThrow('partition_replace INSERT 失敗：disk full');
  });

  // 不破壞既有 fullMode：partition_replace 不應觸發 TRUNCATE 或 ON CONFLICT 路徑
  it('partition_replace: 不走 fullMode（無 TRUNCATE）也不走 UPSERT（無 ON CONFLICT）', async () => {
    const ctx = makePartitionCtx(makeDs('etl_tmp_oblist', 2));
    await handler.execute(ctx);
    const allSql = ctx.queryRunner.calls.map((c: any) => c.sql).join('\n');
    expect(allSql).not.toContain('TRUNCATE');
    expect(allSql).not.toContain('ON CONFLICT');
    expect(allSql).not.toContain('DO UPDATE');
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
      expect(e.message).toMatch(/fullMode INSERT 失敗/);
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
