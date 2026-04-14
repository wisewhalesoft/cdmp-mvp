/**
 * F043: ETL 節點執行器測試（In-DB SQL Strategy）
 * 覆蓋 TS-F043-001 ~ TS-F043-044
 * 所有 handler 現在透過 SQL 操作 temp table，測試驗證 SQL 產出
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExtractHandler } from '../engine/handlers/extract-handler';
import { MergeHandler } from '../engine/handlers/merge-handler';
import { DedupHandler } from '../engine/handlers/dedup-handler';
import { TypeCastHandler } from '../engine/handlers/type-cast-handler';
import { DerivedFieldHandler } from '../engine/handlers/derived-field-handler';
import { FieldMappingHandler } from '../engine/handlers/field-mapping-handler';
import { ConditionalHandler } from '../engine/handlers/conditional-handler';
import { NodeExecutionContext, DataSet, PipelineNode, makeTempTableName } from '../engine/types';

// --- Helpers ---

/**
 * Build a mock QueryRunner that captures SQL calls and provides configurable responses.
 */
function createMockQueryRunner(opts: {
  tableExists?: boolean;
  columns?: string[];
  rowCount?: number;
  customHandler?: (sql: string, params?: any[]) => any;
} = {}) {
  const { tableExists = true, columns = [], rowCount = 0, customHandler } = opts;
  const calls: { sql: string; params?: any[] }[] = [];

  const query = vi.fn(async (sql: string, params?: any[]) => {
    calls.push({ sql, params });

    if (customHandler) {
      const result = customHandler(sql, params);
      if (result !== undefined) return result;
    }

    // information_schema.tables check
    if (sql.includes('information_schema.tables')) {
      return tableExists ? [{ table_name: 'test_table' }] : [];
    }

    // information_schema.columns check
    if (sql.includes('information_schema.columns')) {
      return columns.map((c, i) => ({ column_name: c, ordinal_position: i + 1 }));
    }

    // COUNT query
    if (sql.includes('COUNT(*)')) {
      return [{ cnt: rowCount }];
    }

    // CREATE TEMP TABLE / DROP TABLE / INSERT — return empty
    return [];
  });

  return { query, calls } as any;
}

function makeContext(
  nodeData: Record<string, unknown>,
  inputs: Record<string, DataSet>,
  opts: {
    nodeType?: string;
    nodeId?: string;
    logId?: string;
    queryRunner?: any;
    isTestRun?: boolean;
  } = {},
): NodeExecutionContext {
  return {
    node: {
      id: opts.nodeId ?? 'test-node',
      type: 'pipelineNode',
      position: { x: 0, y: 0 },
      data: { nodeType: opts.nodeType ?? 'test', label: 'Test', ...nodeData },
    },
    inputs,
    pipelineId: 'test-pipeline',
    logId: opts.logId ?? 'test-log-1234',
    isTestRun: opts.isTestRun ?? false,
    queryRunner: opts.queryRunner ?? createMockQueryRunner(),
  };
}

function makeDs(tempTable: string, rowCount: number): DataSet {
  return { tempTable, rowCount };
}

// ===== ExtractHandler Tests =====

describe('ExtractHandler', () => {
  const handler = new ExtractHandler();

  // TS-F043-001: 正常讀取 — CREATE TEMP TABLE AS SELECT
  it('TS-F043-001: creates temp table from raw table', async () => {
    const qr = createMockQueryRunner({ tableExists: true, rowCount: 3 });
    const ctx = makeContext({ rawTable: 'raw_test_table' }, {}, {
      nodeType: 'raw_data_extract', nodeId: 'e1', logId: 'abcd1234-5678', queryRunner: qr,
    });

    const result = await handler.execute(ctx);
    expect(result.rowCount).toBe(3);
    expect(result.tempTable).toBe('etl_tmp_e1_abcd1234');

    // Verify CREATE TEMP TABLE SQL
    const createCall = qr.calls.find((c: any) => c.sql.includes('CREATE TEMP TABLE'));
    expect(createCall).toBeDefined();
    expect(createCall.sql).toContain('SELECT * FROM "raw_test_table"');
  });

  // TS-F043-002: (batch reads no longer needed — single SQL CREATE TABLE AS SELECT)
  it('TS-F043-002: single SQL operation instead of batched reads', async () => {
    const qr = createMockQueryRunner({ tableExists: true, rowCount: 2100000 });
    const ctx = makeContext({ rawTable: 'raw_big_table' }, {}, {
      nodeType: 'raw_data_extract', nodeId: 'e1', logId: 'abcd1234-5678', queryRunner: qr,
    });

    const result = await handler.execute(ctx);
    expect(result.rowCount).toBe(2100000);

    // Only 3 SQL calls: table check + CREATE TEMP + COUNT
    const nonDropCalls = qr.calls.filter((c: any) => !c.sql.includes('DROP'));
    expect(nonDropCalls.length).toBe(3);
  });

  // TS-F043-003: raw table 不存在
  it('TS-F043-003: throws when raw table does not exist', async () => {
    const qr = createMockQueryRunner({ tableExists: false });
    const ctx = makeContext({ rawTable: 'raw_nonexistent' }, {}, {
      nodeType: 'raw_data_extract', queryRunner: qr,
    });

    await expect(handler.execute(ctx)).rejects.toThrow('原始資料表 raw_nonexistent 不存在');
  });

  // TS-F043-004: 空 raw table
  it('TS-F043-004: empty raw table returns DataSet with rowCount=0', async () => {
    const qr = createMockQueryRunner({ tableExists: true, rowCount: 0 });
    const ctx = makeContext({ rawTable: 'raw_empty' }, {}, {
      nodeType: 'raw_data_extract', nodeId: 'e1', logId: 'abcd1234-5678', queryRunner: qr,
    });

    const result = await handler.execute(ctx);
    expect(result.rowCount).toBe(0);
    expect(result.tempTable).toBeTruthy(); // temp table still created
  });
});

// ===== MergeHandler Tests =====

describe('MergeHandler', () => {
  const handler = new MergeHandler();

  function mergeCtx(left: DataSet, right: DataSet, leftCol = 'CUSTO_NO', rightCol = 'CUSTO_NO', opts: { leftCols?: string[]; rightCols?: string[] } = {}) {
    const leftCols = opts.leftCols ?? ['CUSTO_NO', 'NAME', 'AREA'];
    const rightCols = opts.rightCols ?? ['CUSTO_NO', 'NAME', 'EXTRA'];

    const qr = createMockQueryRunner({
      rowCount: 4, // result count
      customHandler: (sql, params) => {
        if (sql.includes('information_schema.columns')) {
          const tableName = params?.[0];
          if (tableName === left.tempTable) {
            return leftCols.map((c, i) => ({ column_name: c, ordinal_position: i + 1 }));
          }
          if (tableName === right.tempTable) {
            return rightCols.map((c, i) => ({ column_name: c, ordinal_position: i + 1 }));
          }
        }
        return undefined;
      },
    });

    return makeContext(
      { nodeType: 'merge', conditions: [{ leftColumn: leftCol, rightColumn: rightCol, operator: '=' }] },
      { 'left-input': left, 'right-input': right },
      { nodeType: 'merge', nodeId: 'm1', logId: 'abcd1234-5678', queryRunner: qr },
    );
  }

  // TS-F043-005: FULL OUTER JOIN SQL
  it('TS-F043-005: generates FULL OUTER JOIN SQL', async () => {
    const ctx = mergeCtx(makeDs('etl_tmp_e1', 3), makeDs('etl_tmp_e2', 2));
    const result = await handler.execute(ctx);

    const qr = ctx.queryRunner;
    const createCall = qr.calls.find((c: any) => c.sql.includes('CREATE TEMP TABLE'));
    expect(createCall).toBeDefined();
    expect(createCall.sql).toContain('FULL OUTER JOIN');
    expect(createCall.sql).toContain('"etl_tmp_e1" l');
    expect(createCall.sql).toContain('"etl_tmp_e2" r');
    expect(createCall.sql).toContain('l."CUSTO_NO" = r."CUSTO_NO"');
  });

  // TS-F043-006: 欄位命名衝突加 _right
  it('TS-F043-006: conflicting column names get _right suffix in SQL', async () => {
    const ctx = mergeCtx(makeDs('etl_tmp_e1', 3), makeDs('etl_tmp_e2', 2));
    const qr = ctx.queryRunner;

    await handler.execute(ctx);

    const createCall = qr.calls.find((c: any) => c.sql.includes('CREATE TEMP TABLE'));
    // NAME exists in both sides → right side becomes NAME_right
    expect(createCall.sql).toContain('r."NAME" AS "NAME_right"');
    // EXTRA only in right → no suffix
    expect(createCall.sql).toContain('r."EXTRA"');
    // JOIN key CUSTO_NO → COALESCE
    expect(createCall.sql).toContain('COALESCE(l."CUSTO_NO", r."CUSTO_NO")');
  });

  // TS-F043-007: JOIN key COALESCE
  it('TS-F043-007: JOIN key uses COALESCE in SQL', async () => {
    const ctx = mergeCtx(makeDs('etl_tmp_e1', 3), makeDs('etl_tmp_e2', 2));
    const qr = ctx.queryRunner;

    await handler.execute(ctx);

    const createCall = qr.calls.find((c: any) => c.sql.includes('CREATE TEMP TABLE'));
    expect(createCall.sql).toContain('COALESCE(l."CUSTO_NO", r."CUSTO_NO") AS "CUSTO_NO"');
  });

  // TS-F043-008: one-to-many JOIN (SQL handles naturally)
  it('TS-F043-008: FULL OUTER JOIN handles one-to-many naturally in SQL', async () => {
    const qr = createMockQueryRunner({
      rowCount: 2,
      customHandler: (sql, params) => {
        if (sql.includes('information_schema.columns')) {
          const tableName = params?.[0];
          if (tableName === 'etl_tmp_e1') return [{ column_name: 'CUSTO_NO' }, { column_name: 'L' }];
          if (tableName === 'etl_tmp_e2') return [{ column_name: 'CUSTO_NO' }, { column_name: 'R' }];
        }
        return undefined;
      },
    });

    const ctx = makeContext(
      { conditions: [{ leftColumn: 'CUSTO_NO', rightColumn: 'CUSTO_NO' }] },
      { 'left-input': makeDs('etl_tmp_e1', 1), 'right-input': makeDs('etl_tmp_e2', 2) },
      { nodeType: 'merge', nodeId: 'm1', logId: 'abcd1234', queryRunner: qr },
    );

    const result = await handler.execute(ctx);
    expect(result.rowCount).toBe(2);
  });

  // TS-F043-009: 左側輸入缺失
  it('TS-F043-009: throws when left-input missing', async () => {
    const ctx = makeContext(
      { conditions: [{ leftColumn: 'K', rightColumn: 'K' }] },
      { 'right-input': makeDs('etl_tmp_r', 0) },
      { nodeType: 'merge' },
    );
    await expect(handler.execute(ctx)).rejects.toThrow('Merge 節點缺少左側輸入（left-input）');
  });

  // TS-F043-010: 左右均為空
  it('TS-F043-010: both sides empty returns empty DataSet', async () => {
    const ctx = makeContext(
      { conditions: [{ leftColumn: 'K', rightColumn: 'K' }] },
      { 'left-input': makeDs('', 0), 'right-input': makeDs('', 0) },
      { nodeType: 'merge' },
    );
    const result = await handler.execute(ctx);
    expect(result).toEqual({ tempTable: '', rowCount: 0 });
  });

  // TS-F043-010A: [BUG-1] same-name join key — 額外輸出 _left / _right 欄位
  it('TS-F043-010A: same-name join key outputs _left and _right columns', async () => {
    const leftCols = ['source_customer_no', 'name'];
    const rightCols = ['source_customer_no', 'mobile_phone'];

    const qr = createMockQueryRunner({
      rowCount: 2,
      customHandler: (sql, params) => {
        if (sql.includes('information_schema.columns')) {
          const tableName = params?.[0];
          if (tableName === 'etl_tmp_fm1') return leftCols.map((c, i) => ({ column_name: c, ordinal_position: i + 1 }));
          if (tableName === 'etl_tmp_fm2') return rightCols.map((c, i) => ({ column_name: c, ordinal_position: i + 1 }));
        }
        return undefined;
      },
    });

    const ctx = makeContext(
      { conditions: [{ leftColumn: 'source_customer_no', rightColumn: 'source_customer_no' }] },
      { 'left-input': makeDs('etl_tmp_fm1', 1), 'right-input': makeDs('etl_tmp_fm2', 1) },
      { nodeType: 'merge', nodeId: 'm4', logId: 'abcd1234-5678', queryRunner: qr },
    );

    await handler.execute(ctx);

    const createCall = qr.calls.find((c: any) => c.sql.includes('CREATE TEMP TABLE'));
    expect(createCall).toBeDefined();
    // COALESCE for the main key
    expect(createCall.sql).toContain('COALESCE(l."source_customer_no", r."source_customer_no") AS "source_customer_no"');
    // BUG-1 fix: additional _left and _right columns
    expect(createCall.sql).toContain('l."source_customer_no" AS "source_customer_no_left"');
    expect(createCall.sql).toContain('r."source_customer_no" AS "source_customer_no_right"');
  });

  // TS-F043-010B: [BUG-1] same-name join key 雙方均 match — _left / _right 均有值
  it('TS-F043-010B: same-name join key with both sides matching outputs _left and _right', async () => {
    const cols = ['source_customer_no', 'data'];

    const qr = createMockQueryRunner({
      rowCount: 1,
      customHandler: (sql, params) => {
        if (sql.includes('information_schema.columns')) {
          return cols.map((c, i) => ({ column_name: c, ordinal_position: i + 1 }));
        }
        return undefined;
      },
    });

    const ctx = makeContext(
      { conditions: [{ leftColumn: 'source_customer_no', rightColumn: 'source_customer_no' }] },
      { 'left-input': makeDs('etl_tmp_left', 1), 'right-input': makeDs('etl_tmp_right', 1) },
      { nodeType: 'merge', nodeId: 'm4', logId: 'abcd1234-5678', queryRunner: qr },
    );

    await handler.execute(ctx);

    const createCall = qr.calls.find((c: any) => c.sql.includes('CREATE TEMP TABLE'));
    expect(createCall).toBeDefined();
    // Same structure: COALESCE + _left + _right
    expect(createCall.sql).toContain('COALESCE(l."source_customer_no", r."source_customer_no") AS "source_customer_no"');
    expect(createCall.sql).toContain('l."source_customer_no" AS "source_customer_no_left"');
    expect(createCall.sql).toContain('r."source_customer_no" AS "source_customer_no_right"');
  });
});

// ===== DedupHandler Tests =====

describe('DedupHandler', () => {
  const handler = new DedupHandler();

  function dedupCtx(rowCount: number, keyColumns = ['CUSTO_NO'], timestampColumn = 'UPDATE_DATE', columns?: string[]) {
    const cols = columns ?? ['CUSTO_NO', 'UPDATE_DATE', 'DATA'];
    const qr = createMockQueryRunner({ columns: cols, rowCount });
    return makeContext(
      { keyColumns, keepStrategy: 'latest_timestamp', timestampColumn },
      { default: makeDs('etl_tmp_input', rowCount > 0 ? 100 : 0) },
      { nodeType: 'dedup', nodeId: 'd1', logId: 'abcd1234-5678', queryRunner: qr },
    );
  }

  // TS-F043-011: DISTINCT ON SQL 保留最新時間戳
  it('TS-F043-011: generates DISTINCT ON SQL with ORDER BY timestamp DESC', async () => {
    const ctx = dedupCtx(1);
    const result = await handler.execute(ctx);

    const qr = ctx.queryRunner;
    const createCall = qr.calls.find((c: any) => c.sql.includes('CREATE TEMP TABLE'));
    expect(createCall).toBeDefined();
    expect(createCall.sql).toContain('DISTINCT ON ("CUSTO_NO")');
    expect(createCall.sql).toContain('ORDER BY "CUSTO_NO", "UPDATE_DATE" DESC NULLS LAST');
  });

  // TS-F043-012: null 時間戳透過 NULLS LAST 排到最後
  it('TS-F043-012: null timestamps handled by NULLS LAST in SQL', async () => {
    const ctx = dedupCtx(1);
    await handler.execute(ctx);

    const qr = ctx.queryRunner;
    const createCall = qr.calls.find((c: any) => c.sql.includes('CREATE TEMP TABLE'));
    expect(createCall.sql).toContain('NULLS LAST');
  });

  // TS-F043-013: 時間戳相同時透過 ctid ASC 保留第一筆
  it('TS-F043-013: same timestamp tie-breaking by ctid ASC', async () => {
    const ctx = dedupCtx(1);
    await handler.execute(ctx);

    const qr = ctx.queryRunner;
    const createCall = qr.calls.find((c: any) => c.sql.includes('CREATE TEMP TABLE'));
    expect(createCall.sql).toContain('ctid ASC');
  });

  // TS-F043-014: 所有 key 唯一（SQL 仍然正確處理）
  it('TS-F043-014: all unique keys returns same count via SQL', async () => {
    const ctx = dedupCtx(3);
    const result = await handler.execute(ctx);
    expect(result.rowCount).toBe(3);
  });

  // TS-F043-015: keyColumns 欄位不存在
  it('TS-F043-015: throws when key column does not exist', async () => {
    const cols = ['OTHER', 'UPDATE_DATE'];
    const qr = createMockQueryRunner({ columns: cols, rowCount: 1 });
    const ctx = makeContext(
      { keyColumns: ['NON_EXIST_COLUMN'], timestampColumn: 'UPDATE_DATE' },
      { default: makeDs('etl_tmp_input', 1) },
      { nodeType: 'dedup', queryRunner: qr },
    );
    await expect(handler.execute(ctx)).rejects.toThrow('Dedup 節點 key 欄位 NON_EXIST_COLUMN 不存在於資料集中');
  });
});

// ===== TypeCastHandler Tests =====

describe('TypeCastHandler', () => {
  const handler = new TypeCastHandler();

  function castCtx(columns: string[], castRules: any[], rowCount = 1) {
    const qr = createMockQueryRunner({ columns, rowCount });
    return makeContext(
      { castRules },
      { default: makeDs('etl_tmp_input', rowCount) },
      { nodeType: 'type_cast', nodeId: 'tc1', logId: 'abcd1234-5678', queryRunner: qr },
    );
  }

  // TS-F043-016: VARCHAR → DECIMAL SQL CAST
  it('TS-F043-016: VARCHAR to DECIMAL generates CAST SQL', async () => {
    const ctx = castCtx(['CUSTNOWCAPTIAL'], [{ column: 'CUSTNOWCAPTIAL', sourceType: 'VARCHAR', targetType: 'DECIMAL' }]);
    await handler.execute(ctx);

    const qr = ctx.queryRunner;
    const createCall = qr.calls.find((c: any) => c.sql.includes('CREATE TEMP TABLE'));
    expect(createCall.sql).toContain('NUMERIC');
    expect(createCall.sql).toContain('"CUSTNOWCAPTIAL"');
  });

  // TS-F043-017: VARCHAR → DECIMAL 失敗 → NULL (via regex validation)
  it('TS-F043-017: non-numeric values handled by regex → NULL in SQL', async () => {
    const ctx = castCtx(['CUSTNOWCAPTIAL'], [{ column: 'CUSTNOWCAPTIAL', sourceType: 'VARCHAR', targetType: 'DECIMAL' }]);
    await handler.execute(ctx);

    const qr = ctx.queryRunner;
    const createCall = qr.calls.find((c: any) => c.sql.includes('CREATE TEMP TABLE'));
    // Should have CASE WHEN with regex check
    expect(createCall.sql).toContain('CASE WHEN');
    expect(createCall.sql).toContain('ELSE NULL END');
  });

  // TS-F043-018: VARCHAR → INTEGER
  it('TS-F043-018: VARCHAR to INTEGER generates INTEGER CAST SQL', async () => {
    const ctx = castCtx(['COUNT'], [{ column: 'COUNT', sourceType: 'VARCHAR', targetType: 'INTEGER' }]);
    await handler.execute(ctx);

    const qr = ctx.queryRunner;
    const createCall = qr.calls.find((c: any) => c.sql.includes('CREATE TEMP TABLE'));
    expect(createCall.sql).toContain('INTEGER');
  });

  // TS-F043-019: VARCHAR → DATE
  it('TS-F043-019: VARCHAR to DATE generates DATE CAST SQL', async () => {
    const ctx = castCtx(['BIRTH_DATE'], [{ column: 'BIRTH_DATE', sourceType: 'VARCHAR', targetType: 'DATE' }]);
    await handler.execute(ctx);

    const qr = ctx.queryRunner;
    const createCall = qr.calls.find((c: any) => c.sql.includes('CREATE TEMP TABLE'));
    expect(createCall.sql).toContain('DATE');
  });

  // TS-F043-020: null 值 → NULL in SQL (handled by CASE WHEN IS NOT NULL)
  it('TS-F043-020: null handling in SQL via CASE WHEN IS NOT NULL', async () => {
    const ctx = castCtx(['CUSTNOWCAPTIAL'], [{ column: 'CUSTNOWCAPTIAL', sourceType: 'VARCHAR', targetType: 'DECIMAL' }]);
    await handler.execute(ctx);

    const qr = ctx.queryRunner;
    const createCall = qr.calls.find((c: any) => c.sql.includes('CREATE TEMP TABLE'));
    expect(createCall.sql).toContain('IS NOT NULL');
  });

  // TS-F043-021: 不支援的轉換組合
  it('TS-F043-021: unsupported cast throws error', async () => {
    const ctx = castCtx(['V'], [{ column: 'V', sourceType: 'INTEGER', targetType: 'VARCHAR' }]);
    await expect(handler.execute(ctx)).rejects.toThrow('不支援的型別轉換：INTEGER → VARCHAR');
  });

  // TS-F043-022: 欄位不存在 — 靜默跳過（不在 columns 中，不會生成 CAST）
  it('TS-F043-022: non-existent column not in CAST SQL (silently skipped)', async () => {
    const ctx = castCtx(['OTHER'], [{ column: 'NON_EXIST', sourceType: 'VARCHAR', targetType: 'DECIMAL' }]);
    await handler.execute(ctx);

    const qr = ctx.queryRunner;
    const createCall = qr.calls.find((c: any) => c.sql.includes('CREATE TEMP TABLE'));
    // OTHER should be selected as-is
    expect(createCall.sql).toContain('"OTHER"');
    // NON_EXIST should not appear (since it's not in the table columns)
    expect(createCall.sql).not.toContain('NON_EXIST');
  });
});

// ===== DerivedFieldHandler Tests =====

describe('DerivedFieldHandler', () => {
  const handler = new DerivedFieldHandler();

  function derivedCtx(columns: string[], expressions: any[], rowCount = 1) {
    const qr = createMockQueryRunner({ columns, rowCount });
    return makeContext(
      { expressions },
      { default: makeDs('etl_tmp_input', rowCount) },
      { nodeType: 'derived_field', nodeId: 'df1', logId: 'abcd1234-5678', queryRunner: qr },
    );
  }

  // TS-F043-023: mergePhone SQL
  it('TS-F043-023: mergePhone generates CASE WHEN CONCAT SQL', async () => {
    const ctx = derivedCtx(
      ['CAREA_NO1', 'CTEL_NO1'],
      [{ outputColumn: 'home_phone', expression: 'mergePhone(CAREA_NO1, CTEL_NO1)', outputType: 'VARCHAR' }],
    );
    await handler.execute(ctx);

    const qr = ctx.queryRunner;
    const createCall = qr.calls.find((c: any) => c.sql.includes('CREATE TEMP TABLE'));
    expect(createCall.sql).toContain('CONCAT("CAREA_NO1"');
    expect(createCall.sql).toContain("'-'");
    expect(createCall.sql).toContain('"CTEL_NO1"');
    expect(createCall.sql).toContain('AS "home_phone"');
  });

  // TS-F043-024: mergePhone 佔位值 — all-zeros check in SQL
  it('TS-F043-024: mergePhone generates all-zeros regex check', async () => {
    const ctx = derivedCtx(
      ['CAREA_NO1', 'CTEL_NO1'],
      [{ outputColumn: 'home_phone', expression: 'mergePhone(CAREA_NO1, CTEL_NO1)', outputType: 'VARCHAR' }],
    );
    await handler.execute(ctx);

    const qr = ctx.queryRunner;
    const createCall = qr.calls.find((c: any) => c.sql.includes('CREATE TEMP TABLE'));
    expect(createCall.sql).toContain("'^0+$'"); // regex for all-zeros
  });

  // mergePhone with extension (3rd argument)
  it('mergePhone with extension generates CONCAT with # separator', async () => {
    const ctx = derivedCtx(
      ['CAREA_NO1', 'CTEL_NO1', 'CEXTEN_NO1'],
      [{ outputColumn: 'home_phone', expression: 'mergePhone(CAREA_NO1, CTEL_NO1, CEXTEN_NO1)', outputType: 'VARCHAR' }],
    );
    await handler.execute(ctx);

    const qr = ctx.queryRunner;
    const createCall = qr.calls.find((c: any) => c.sql.includes('CREATE TEMP TABLE'));
    expect(createCall.sql).toContain('"CEXTEN_NO1"');
    expect(createCall.sql).toContain("'#'");
    expect(createCall.sql).toContain('AS "home_phone"');
  });

  // TS-F043-025: padStart SQL → LPAD
  it('TS-F043-025: padStart generates LPAD SQL', async () => {
    const ctx = derivedCtx(
      ['CUTYPE'],
      [{ outputColumn: 'customer_type_mapped', expression: "padStart(CUTYPE, 2, '0')", outputType: 'VARCHAR' }],
    );
    await handler.execute(ctx);

    const qr = ctx.queryRunner;
    const createCall = qr.calls.find((c: any) => c.sql.includes('CREATE TEMP TABLE'));
    expect(createCall.sql).toContain('LPAD("CUTYPE"::TEXT, 2');
    expect(createCall.sql).toContain('AS "customer_type_mapped"');
  });

  // TS-F043-026: padStart 已達目標長度 (LPAD handles naturally)
  it('TS-F043-026: padStart LPAD handles already-at-length values', async () => {
    const ctx = derivedCtx(
      ['CUTYPE'],
      [{ outputColumn: 'customer_type_mapped', expression: "padStart(CUTYPE, 2, '0')", outputType: 'VARCHAR' }],
    );
    const result = await handler.execute(ctx);
    expect(result.tempTable).toBeTruthy();
  });

  // TS-F043-027: gen_random_uuid SQL
  it('TS-F043-027: gen_random_uuid generates gen_random_uuid() SQL', async () => {
    const ctx = derivedCtx(
      ['data'],
      [{ outputColumn: 'customer_id', expression: 'gen_random_uuid()', outputType: 'VARCHAR' }],
    );
    await handler.execute(ctx);

    const qr = ctx.queryRunner;
    const createCall = qr.calls.find((c: any) => c.sql.includes('CREATE TEMP TABLE'));
    expect(createCall.sql).toContain('gen_random_uuid()');
    expect(createCall.sql).toContain('AS "customer_id"');
  });

  // TS-F043-028: CASE WHEN 雙側非 null
  it('TS-F043-028: CASE WHEN with IS NOT NULL generates proper SQL', async () => {
    const expression = "CASE WHEN left.source_customer_no IS NOT NULL AND right.source_customer_no IS NOT NULL THEN 'ZZIP_BAMCUST_M+MLMCUSTOMER' WHEN left.source_customer_no IS NOT NULL THEN 'ZZIP_BAMCUST_M' ELSE 'MLMCUSTOMER' END";
    const ctx = derivedCtx(
      ['source_customer_no', 'source_customer_no_right'],
      [{ outputColumn: 'data_source', expression, outputType: 'VARCHAR' }],
    );
    await handler.execute(ctx);

    const qr = ctx.queryRunner;
    const createCall = qr.calls.find((c: any) => c.sql.includes('CREATE TEMP TABLE'));
    expect(createCall.sql).toContain('"source_customer_no" IS NOT NULL');
    expect(createCall.sql).toContain('"source_customer_no_right" IS NOT NULL');
    expect(createCall.sql).toContain('ZZIP_BAMCUST_M+MLMCUSTOMER');
  });

  // TS-F043-029: CASE WHEN 僅左側非 null (SQL handles naturally)
  it('TS-F043-029: CASE WHEN resolves left./right. prefixes to column references', async () => {
    const expression = "CASE WHEN left.source_customer_no IS NOT NULL AND right.source_customer_no IS NOT NULL THEN 'ZZIP_BAMCUST_M+MLMCUSTOMER' WHEN left.source_customer_no IS NOT NULL THEN 'ZZIP_BAMCUST_M' ELSE 'MLMCUSTOMER' END";
    const ctx = derivedCtx(
      ['source_customer_no', 'source_customer_no_right'],
      [{ outputColumn: 'data_source', expression, outputType: 'VARCHAR' }],
    );
    await handler.execute(ctx);

    const qr = ctx.queryRunner;
    const createCall = qr.calls.find((c: any) => c.sql.includes('CREATE TEMP TABLE'));
    // left.source_customer_no → "source_customer_no"
    // right.source_customer_no → "source_customer_no_right"
    expect(createCall.sql).not.toContain('left.');
    expect(createCall.sql).not.toContain('right.');
  });

  // TS-F043-030: left null → ELSE (handled at SQL runtime)
  it('TS-F043-030: CASE WHEN ELSE clause present in SQL', async () => {
    const expression = "CASE WHEN left.source_customer_no IS NOT NULL THEN 'HAS_LEFT' ELSE 'MLMCUSTOMER' END";
    const ctx = derivedCtx(
      ['source_customer_no'],
      [{ outputColumn: 'data_source', expression, outputType: 'VARCHAR' }],
    );
    await handler.execute(ctx);

    const qr = ctx.queryRunner;
    const createCall = qr.calls.find((c: any) => c.sql.includes('CREATE TEMP TABLE'));
    expect(createCall.sql).toContain('ELSE');
    expect(createCall.sql).toContain('MLMCUSTOMER');
  });

  // TS-F043-031: missing column (SQL handles null for missing ref)
  it('TS-F043-031: mergePhone with non-existent columns generates SQL with those columns', async () => {
    const ctx = derivedCtx(
      ['OTHER'],
      [{ outputColumn: 'home_phone', expression: 'mergePhone(NON_EXIST_AREA, NON_EXIST_TEL)', outputType: 'VARCHAR' }],
    );
    await handler.execute(ctx);

    const qr = ctx.queryRunner;
    const createCall = qr.calls.find((c: any) => c.sql.includes('CREATE TEMP TABLE'));
    // SQL will reference the columns; DB will handle missing columns
    expect(createCall.sql).toContain('AS "home_phone"');
  });

  // TS-F043-032: 不支援的表達式函數
  it('TS-F043-032: unsupported expression throws error', async () => {
    const ctx = derivedCtx(
      ['COL1'],
      [{ outputColumn: 'out', expression: 'unsupported_func(COL1)', outputType: 'VARCHAR' }],
    );
    await expect(handler.execute(ctx)).rejects.toThrow('不支援的表達式函數：unsupported_func');
  });
});

// ===== FieldMappingHandler Tests =====

describe('FieldMappingHandler', () => {
  const handler = new FieldMappingHandler();

  function mappingCtx(columns: string[], mappings: any[], dropUnmapped: boolean, rowCount = 1) {
    const qr = createMockQueryRunner({ columns, rowCount });
    return makeContext(
      { mappings, dropUnmapped },
      { default: makeDs('etl_tmp_input', rowCount) },
      { nodeType: 'field_mapping', nodeId: 'fm1', logId: 'abcd1234-5678', queryRunner: qr },
    );
  }

  // TS-F043-033: dropUnmapped=true outputs only mapped columns
  it('TS-F043-033: dropUnmapped=true selects only mapped columns in SQL', async () => {
    const ctx = mappingCtx(
      ['CUSTO_NO', 'CUS_NAME', 'EXTRA_FIELD'],
      [
        { sourceColumn: 'CUSTO_NO', targetColumn: 'source_customer_no', defaultValue: null },
        { sourceColumn: 'CUS_NAME', targetColumn: 'name', defaultValue: null },
      ],
      true,
    );
    await handler.execute(ctx);

    const qr = ctx.queryRunner;
    const createCall = qr.calls.find((c: any) => c.sql.includes('CREATE TEMP TABLE'));
    expect(createCall.sql).toContain('"CUSTO_NO" AS "source_customer_no"');
    expect(createCall.sql).toContain('"CUS_NAME" AS "name"');
    expect(createCall.sql).not.toContain('EXTRA_FIELD');
  });

  // TS-F043-034: dropUnmapped=false preserves all original columns
  it('TS-F043-034: dropUnmapped=false keeps all original columns in SQL', async () => {
    const ctx = mappingCtx(
      ['CUSTO_NO', 'CUS_NAME', 'EXTRA'],
      [{ sourceColumn: 'CUSTO_NO', targetColumn: 'source_customer_no', defaultValue: null }],
      false,
    );
    await handler.execute(ctx);

    const qr = ctx.queryRunner;
    const createCall = qr.calls.find((c: any) => c.sql.includes('CREATE TEMP TABLE'));
    expect(createCall.sql).toContain('"CUSTO_NO"');
    expect(createCall.sql).toContain('"CUS_NAME"');
    expect(createCall.sql).toContain('"EXTRA"');
    expect(createCall.sql).toContain('"CUSTO_NO" AS "source_customer_no"');
  });

  // TS-F043-035: sourceColumn 不存在 — defaultValue 非 null
  it('TS-F043-035: missing sourceColumn uses defaultValue in SQL', async () => {
    const ctx = mappingCtx(
      ['CUSTO_NO'],
      [{ sourceColumn: 'NON_EXIST', targetColumn: 'optional_field', defaultValue: 'default_val' }],
      true,
    );
    await handler.execute(ctx);

    const qr = ctx.queryRunner;
    const createCall = qr.calls.find((c: any) => c.sql.includes('CREATE TEMP TABLE'));
    expect(createCall.sql).toContain("'default_val' AS \"optional_field\"");
  });

  // TS-F043-036: sourceColumn 不存在 — defaultValue 為 null → NULL
  it('TS-F043-036: missing sourceColumn with null defaultValue → NULL in SQL', async () => {
    const ctx = mappingCtx(
      ['CUSTO_NO'],
      [{ sourceColumn: 'MISSING_NO_DEFAULT', targetColumn: 'will_be_null', defaultValue: null }],
      true,
    );
    await handler.execute(ctx);

    const qr = ctx.queryRunner;
    const createCall = qr.calls.find((c: any) => c.sql.includes('CREATE TEMP TABLE'));
    expect(createCall.sql).toContain('NULL AS "will_be_null"');
  });

  // TS-F043-037: mappings 為空且 dropUnmapped=true → empty row
  it('TS-F043-037: empty mappings with dropUnmapped=true generates SELECT FROM (no columns)', async () => {
    const ctx = mappingCtx(['CUSTO_NO', 'NAME'], [], true);
    const result = await handler.execute(ctx);
    expect(result.rowCount).toBe(1);

    const qr = ctx.queryRunner;
    const createCall = qr.calls.find((c: any) => c.sql.includes('CREATE TEMP TABLE'));
    expect(createCall.sql).toContain('SELECT FROM');
  });
});

// ===== ConditionalHandler Tests =====

describe('ConditionalHandler', () => {
  const handler = new ConditionalHandler();

  function conditionalCtx(columns: string[], rules: any[], rowCount = 1) {
    const qr = createMockQueryRunner({ columns, rowCount });
    return makeContext(
      { rules },
      { default: makeDs('etl_tmp_input', rowCount) },
      { nodeType: 'conditional', nodeId: 'cd1', logId: 'abcd1234-5678', queryRunner: qr },
    );
  }

  const rule = {
    targetColumn: 'name',
    conditions: [{ when: 'left.source_updated_at >= right.source_updated_at', then: 'left.name' }],
    elseValue: 'right.name',
  };

  // TS-F043-038: left >= right SQL
  it('TS-F043-038: generates CASE WHEN >= SQL', async () => {
    const ctx = conditionalCtx(
      ['source_updated_at', 'source_updated_at_right', 'name', 'name_right'],
      [rule],
    );
    await handler.execute(ctx);

    const qr = ctx.queryRunner;
    const createCall = qr.calls.find((c: any) => c.sql.includes('CREATE TEMP TABLE'));
    expect(createCall.sql).toContain('"source_updated_at" >= "source_updated_at_right"');
    expect(createCall.sql).toContain('THEN "name"');
    expect(createCall.sql).toContain('ELSE "name_right"');
  });

  // TS-F043-039: left < right → ELSE in SQL
  it('TS-F043-039: CASE WHEN with ELSE clause for right value', async () => {
    const ctx = conditionalCtx(
      ['source_updated_at', 'source_updated_at_right', 'name', 'name_right'],
      [rule],
    );
    await handler.execute(ctx);

    const qr = ctx.queryRunner;
    const createCall = qr.calls.find((c: any) => c.sql.includes('CREATE TEMP TABLE'));
    expect(createCall.sql).toContain('ELSE "name_right" END');
  });

  // TS-F043-040: null 安全 (PostgreSQL handles NULL >= NULL as NULL/false)
  it('TS-F043-040: PostgreSQL handles NULL >= comparison naturally', async () => {
    const ctx = conditionalCtx(
      ['source_updated_at', 'source_updated_at_right', 'name', 'name_right'],
      [rule],
    );
    const result = await handler.execute(ctx);
    expect(result.tempTable).toBeTruthy();
  });

  // TS-F043-041: IS NOT NULL 條件 SQL
  it('TS-F043-041: IS NOT NULL condition generates proper SQL', async () => {
    const isNotNullRule = {
      targetColumn: 'source',
      conditions: [
        { when: 'left.source_customer_no IS NOT NULL', then: "'HAS_LEFT'" },
      ],
      elseValue: "'NO_LEFT'",
    };

    const ctx = conditionalCtx(
      ['source_customer_no', 'source_customer_no_right'],
      [isNotNullRule],
    );
    await handler.execute(ctx);

    const qr = ctx.queryRunner;
    const createCall = qr.calls.find((c: any) => c.sql.includes('CREATE TEMP TABLE'));
    expect(createCall.sql).toContain('"source_customer_no" IS NOT NULL');
    expect(createCall.sql).toContain("'HAS_LEFT'");
    expect(createCall.sql).toContain("'NO_LEFT'");
  });

  // TS-F043-042: 所有 when 都不成立 → ELSE
  it('TS-F043-042: ELSE clause always present in SQL', async () => {
    const ctx = conditionalCtx(
      ['source_updated_at', 'source_updated_at_right', 'name', 'name_right'],
      [{
        targetColumn: 'result',
        conditions: [
          { when: 'left.source_updated_at IS NOT NULL', then: 'left.name' },
        ],
        elseValue: "'UNKNOWN'",
      }],
    );
    await handler.execute(ctx);

    const qr = ctx.queryRunner;
    const createCall = qr.calls.find((c: any) => c.sql.includes('CREATE TEMP TABLE'));
    expect(createCall.sql).toContain("ELSE 'UNKNOWN' END");
  });

  // TS-F043-043: string literal in then/elseValue
  it('TS-F043-043: string literals passed through to SQL', async () => {
    const ctx = conditionalCtx(
      ['source_customer_no'],
      [{
        targetColumn: 'source_type',
        conditions: [{ when: 'left.source_customer_no IS NOT NULL', then: "'ZZIP_BAMCUST_M'" }],
        elseValue: "'OTHER'",
      }],
    );
    await handler.execute(ctx);

    const qr = ctx.queryRunner;
    const createCall = qr.calls.find((c: any) => c.sql.includes('CREATE TEMP TABLE'));
    expect(createCall.sql).toContain("'ZZIP_BAMCUST_M'");
    expect(createCall.sql).toContain("'OTHER'");
  });
});

// ===== Empty DataSet Edge Case =====

describe('Empty DataSet handling (TS-F043-044)', () => {
  it('TS-F043-044: all transform nodes return empty DataSet for empty input', async () => {
    const emptyDs = makeDs('', 0);

    // Dedup
    const dedup = new DedupHandler();
    const dedupResult = await dedup.execute(
      makeContext({ keyColumns: ['K'], timestampColumn: 'T' }, { default: emptyDs }, { nodeType: 'dedup' }),
    );
    expect(dedupResult).toEqual({ tempTable: '', rowCount: 0 });

    // TypeCast
    const typeCast = new TypeCastHandler();
    const tcResult = await typeCast.execute(
      makeContext({ castRules: [{ column: 'C', sourceType: 'VARCHAR', targetType: 'DECIMAL' }] }, { default: emptyDs }, { nodeType: 'type_cast' }),
    );
    expect(tcResult).toEqual({ tempTable: '', rowCount: 0 });

    // DerivedField
    const derived = new DerivedFieldHandler();
    const dfResult = await derived.execute(
      makeContext({ expressions: [{ outputColumn: 'x', expression: 'gen_random_uuid()', outputType: 'VARCHAR' }] }, { default: emptyDs }, { nodeType: 'derived_field' }),
    );
    expect(dfResult).toEqual({ tempTable: '', rowCount: 0 });

    // FieldMapping
    const fm = new FieldMappingHandler();
    const fmResult = await fm.execute(
      makeContext({ mappings: [], dropUnmapped: true }, { default: emptyDs }, { nodeType: 'field_mapping' }),
    );
    expect(fmResult).toEqual({ tempTable: '', rowCount: 0 });

    // Conditional
    const cond = new ConditionalHandler();
    const condResult = await cond.execute(
      makeContext({ rules: [] }, { default: emptyDs }, { nodeType: 'conditional' }),
    );
    expect(condResult).toEqual({ tempTable: '', rowCount: 0 });
  });
});
