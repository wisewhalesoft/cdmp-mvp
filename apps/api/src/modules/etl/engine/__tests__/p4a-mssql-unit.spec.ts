/**
 * AD-E07-41 P4a — ETL Handler 群組一 MSSQL 版：UNIT 測試（mock QueryRunner，CI 恆常執行）。
 *
 * 覆蓋（測試設計 AD-E07-41-P4a-test.md）：
 *   HELPER-UNIT-001..005 / EXTRACT-UNIT-001..007 / EXTRACT-RESOLVE-001(unit) /
 *   FIELDMAP-UNIT-001..006 / DERIVED-UNIT-001..006 / CAST-UNIT-001..003/005/006 /
 *   COND-UNIT-001..004 / DISPATCH-003。
 *
 * 手法：直接實例化 handler class（不透過 dispatcher，選項甲），比對產出 SQL 文字之方言關鍵字。
 */
import { describe, it, expect, vi } from 'vitest';
import {
  createMssqlTempTable,
  getMssqlTempTableColumns,
  countMssqlTempTableRows,
} from '../handlers/mssql/temp-table.util';
import { resolveRawTableMssql } from '../handlers/resolve-raw-table-mssql';
import { ExtractHandlerMssql } from '../handlers/extract-handler-mssql';
import { FieldMappingHandlerMssql } from '../handlers/field-mapping-handler-mssql';
import { DerivedFieldHandlerMssql } from '../handlers/derived-field-handler-mssql';
import { TypeCastHandlerMssql } from '../handlers/type-cast-handler-mssql';
import { ConditionalHandlerMssql } from '../handlers/conditional-handler-mssql';
import { NodeExecutionContext, DataSet } from '../types';

// ---- mock QueryRunner ----
interface MockOpts {
  columns?: string[];
  tableExists?: boolean;
  rowCount?: number;
  resolveResult?: any[];
  customHandler?: (sql: string, params?: any[]) => any;
}
function createMssqlMock(opts: MockOpts = {}) {
  const { columns = [], tableExists = true, rowCount = 0, resolveResult, customHandler } = opts;
  const calls: { sql: string; params?: any[] }[] = [];
  const query = vi.fn(async (sql: string, params?: any[]) => {
    calls.push({ sql, params });
    if (customHandler) {
      const r = customHandler(sql, params);
      if (r !== undefined) return r;
    }
    if (sql.includes('tempdb.sys.columns')) {
      return columns.map((c, i) => ({ column_name: c, column_id: i + 1 }));
    }
    if (sql.includes('INFORMATION_SCHEMA.TABLES')) {
      return tableExists ? [{ table_name: 'x' }] : [];
    }
    if (sql.includes('extraction_tasks')) {
      return resolveResult ?? [];
    }
    if (sql.includes('COUNT(*)')) {
      return [{ cnt: rowCount }];
    }
    return [];
  });
  return { query, calls } as any;
}

function makeCtx(
  nodeData: Record<string, unknown>,
  inputs: Record<string, DataSet>,
  qr: any,
  opts: { nodeType?: string; nodeId?: string; logId?: string } = {},
): NodeExecutionContext {
  return {
    node: {
      id: opts.nodeId ?? 'n1',
      type: 'pipelineNode',
      position: { x: 0, y: 0 },
      data: { nodeType: opts.nodeType ?? 'test', label: 'T', ...nodeData },
    },
    inputs,
    pipelineId: 'p',
    logId: opts.logId ?? 'abcd1234-ffff',
    isTestRun: false,
    queryRunner: qr,
  };
}

const inDs = (t = '##in', n = 3): DataSet => ({ tempTable: t, rowCount: n });
function intoSql(qr: any): string {
  const c = qr.calls.find((x: any) => typeof x.sql === 'string' && x.sql.includes('INTO ##'));
  expect(c, 'expected a SELECT ... INTO ## call').toBeDefined();
  return c.sql as string;
}

// =====================================================================
// HELPER-UNIT
// =====================================================================
describe('P4a HELPER-UNIT (temp-table.util)', () => {
  it('HELPER-UNIT-001: createMssqlTempTable → SELECT ... INTO ##name FROM（非 CREATE TEMP TABLE）', async () => {
    const qr = createMssqlMock();
    await createMssqlTempTable(qr, '##etl_tmp_e1_abcd1234', 'SELECT * FROM "raw_test"');
    expect(qr.query).toHaveBeenCalledTimes(1);
    const sql = qr.calls[0].sql as string;
    expect(sql).toContain('INTO ##etl_tmp_e1_abcd1234');
    expect(sql).not.toContain('CREATE TEMP TABLE');
    // 插入點在 SELECT 之後、FROM 之前
    expect(sql).toBe('SELECT * INTO ##etl_tmp_e1_abcd1234 FROM "raw_test"');
  });

  it('HELPER-UNIT-002 (MUST-FIX): 巢狀 FROM 之 selectSql，INTO 插入頂層 FROM 之前', async () => {
    const qr = createMssqlMock();
    await createMssqlTempTable(qr, '##x', 'SELECT a.id FROM (SELECT id FROM "raw_y") a');
    const out = qr.calls[0].sql as string;
    expect(out).toBe('SELECT a.id INTO ##x FROM (SELECT id FROM "raw_y") a');
    // 不得誤植於巢狀 FROM 之前
    expect(out).not.toContain('(SELECT id INTO');
  });

  it('HELPER-UNIT-003: getMssqlTempTableColumns → tempdb.sys.columns + OBJECT_ID 具名參數', async () => {
    const qr = createMssqlMock({ columns: ['a'] });
    await getMssqlTempTableColumns(qr, '##x');
    const sql = qr.calls[0].sql as string;
    expect(sql).toContain('tempdb.sys.columns');
    expect(sql).toContain("OBJECT_ID('tempdb..' + @0)");
    expect(sql).toContain('ORDER BY c.column_id');
    expect(qr.calls[0].params).toEqual(['##x']);
    expect(sql).not.toContain('information_schema.columns');
  });

  it('HELPER-UNIT-004: 依 column_id 序映射為 {name, columnId}（原樣，不重新排序）', async () => {
    const qr = createMssqlMock({
      customHandler: (sql) =>
        sql.includes('tempdb.sys.columns')
          ? [
              { column_name: 'a', column_id: 1 },
              { column_name: 'b', column_id: 2 },
            ]
          : undefined,
    });
    const cols = await getMssqlTempTableColumns(qr, '##x');
    expect(cols).toEqual([
      { name: 'a', columnId: 1 },
      { name: 'b', columnId: 2 },
    ]);
  });

  it('HELPER-UNIT-005: countMssqlTempTableRows → SELECT COUNT(*) AS cnt FROM ##name（無 ::int）', async () => {
    const qr = createMssqlMock({ rowCount: 7 });
    const n = await countMssqlTempTableRows(qr, '##x');
    const sql = qr.calls[0].sql as string;
    expect(sql).toBe('SELECT COUNT(*) AS cnt FROM ##x');
    expect(sql).not.toContain('::int');
    expect(n).toBe(7);
  });
});

// =====================================================================
// EXTRACT-UNIT
// =====================================================================
describe('P4a EXTRACT-UNIT (extract-handler-mssql)', () => {
  const h = new ExtractHandlerMssql();

  it('EXTRACT-UNIT-001: SELECT * INTO ##name FROM raw_xxx（非 CREATE TEMP TABLE）', async () => {
    const qr = createMssqlMock({ rowCount: 3 });
    const r = await h.execute(makeCtx({ rawTable: 'raw_test' }, {}, qr, { nodeType: 'raw_data_extract', nodeId: 'e1', logId: 'abcd1234-5678' }));
    const sql = intoSql(qr);
    expect(sql).toContain('INTO ##etl_tmp_e1_abcd1234');
    expect(sql).not.toContain('CREATE TEMP TABLE');
    expect(sql).toBe('SELECT * INTO ##etl_tmp_e1_abcd1234 FROM "raw_test"');
    expect(r.tempTable).toBe('##etl_tmp_e1_abcd1234');
  });

  it('EXTRACT-UNIT-002 (🔴): 存在性檢查用 INFORMATION_SCHEMA.TABLES 大寫 + 具名參數，無小寫', async () => {
    const qr = createMssqlMock({ rowCount: 1 });
    await h.execute(makeCtx({ rawTable: 'raw_test' }, {}, qr, { nodeType: 'raw_data_extract' }));
    const check = qr.calls.find((c: any) => c.sql.includes('INFORMATION_SCHEMA.TABLES'));
    expect(check).toBeDefined();
    expect(check.sql).toContain('INFORMATION_SCHEMA.TABLES');
    expect(check.sql).toContain('@0');
    expect(check.sql).not.toContain('$1');
    // 全檔無小寫 information_schema
    for (const c of qr.calls) expect(c.sql.includes('information_schema')).toBe(false);
  });

  it('EXTRACT-UNIT-003: raw 表不存在 → 拋既有錯誤訊息格式', async () => {
    const qr = createMssqlMock({ tableExists: false });
    await expect(
      h.execute(makeCtx({ rawTable: 'raw_nonexistent' }, {}, qr, { nodeType: 'raw_data_extract' })),
    ).rejects.toThrow('原始資料表 raw_nonexistent 不存在');
  });

  it('EXTRACT-UNIT-004: sourceFilter 產生 WHERE "ASSIGNDAY" < ... 結構不變', async () => {
    const qr = createMssqlMock({ rowCount: 1 });
    await h.execute(
      makeCtx(
        { rawTable: 'raw_test', sourceFilter: { column: 'ASSIGNDAY', operator: '<', valueExpr: 'currentMonthFirstDay' } },
        {},
        qr,
        { nodeType: 'raw_data_extract' },
      ),
    );
    const sql = intoSql(qr);
    expect(sql).toContain('WHERE "ASSIGNDAY" <');
    expect(sql).toMatch(/WHERE "ASSIGNDAY" < '\d{6}01'/);
  });

  it('EXTRACT-UNIT-005: 不支援的 operator 仍拋錯', async () => {
    const qr = createMssqlMock();
    await expect(
      h.execute(
        makeCtx(
          { rawTable: 'raw_test', sourceFilter: { column: 'ASSIGNDAY', operator: 'LIKE', valueExpr: 'x' } },
          {},
          qr,
          { nodeType: 'raw_data_extract' },
        ),
      ),
    ).rejects.toThrow('sourceFilter 不支援的運算子：LIKE');
  });

  it('EXTRACT-UNIT-006: 列數用 countMssqlTempTableRows（COUNT(*) AS cnt，無 ::int）', async () => {
    const qr = createMssqlMock({ rowCount: 5 });
    await h.execute(makeCtx({ rawTable: 'raw_test' }, {}, qr, { nodeType: 'raw_data_extract' }));
    const countCall = qr.calls.find((c: any) => c.sql.includes('COUNT(*)'));
    expect(countCall.sql).toContain('COUNT(*) AS cnt');
    for (const c of qr.calls) expect(c.sql.includes('::int')).toBe(false);
  });

  it('EXTRACT-UNIT-007: 空 raw table（0 列）不報錯，tempTable 有效', async () => {
    const qr = createMssqlMock({ rowCount: 0 });
    const r = await h.execute(makeCtx({ rawTable: 'raw_test' }, {}, qr, { nodeType: 'raw_data_extract' }));
    expect(r.rowCount).toBe(0);
    expect(r.tempTable).toBeTruthy();
  });
});

// =====================================================================
// EXTRACT-RESOLVE-001 (unit)
// =====================================================================
describe('P4a EXTRACT-RESOLVE-001 (resolve-raw-table-mssql)', () => {
  it('RESOLVE-001 (🔴): $1/$2→@0/@1、NULLS LAST→CASE WHEN、LIMIT 1→TOP (1)', async () => {
    let capturedSql = '';
    let capturedParams: any[] | undefined;
    const qr = createMssqlMock({
      customHandler: (sql, params) => {
        if (sql.includes('extraction_tasks')) {
          capturedSql = sql;
          capturedParams = params;
          return [{ raw_table_name: 'raw_dynamic' }];
        }
        return undefined;
      },
    });
    const out = await resolveRawTableMssql(qr, { datasourceName: 'DS', sourceTable: 'ST' }, undefined, 'extractionRef');
    expect(out).toBe('raw_dynamic');
    expect(capturedSql).toContain('CASE WHEN et.last_execution_at IS NULL THEN 1 ELSE 0 END');
    expect(capturedSql).toContain('TOP (1)');
    expect(capturedSql).toContain('@0');
    expect(capturedSql).toContain('@1');
    expect(capturedSql).not.toContain('$1');
    expect(capturedSql).not.toContain('$2');
    expect(capturedSql).not.toContain('NULLS LAST');
    expect(capturedSql).not.toContain('LIMIT');
    expect(capturedParams).toEqual(['DS', 'ST']);
  });
});

// =====================================================================
// FIELDMAP-UNIT
// =====================================================================
describe('P4a FIELDMAP-UNIT (field-mapping-handler-mssql)', () => {
  const h = new FieldMappingHandlerMssql();

  it('FIELDMAP-UNIT-001: dropUnmapped=true 只輸出 mapping 欄位', async () => {
    const qr = createMssqlMock({ columns: ['a', 'b', 'c'], rowCount: 3 });
    await h.execute(
      makeCtx(
        { mappings: [{ sourceColumn: 'a', targetColumn: 'x' }, { sourceColumn: 'b', targetColumn: 'y' }], dropUnmapped: true },
        { default: inDs() },
        qr,
        { nodeType: 'field_mapping' },
      ),
    );
    const sql = intoSql(qr);
    expect(sql).toContain('"a" AS "x"');
    expect(sql).toContain('"b" AS "y"');
    expect(sql).not.toContain('"c"');
  });

  it('FIELDMAP-UNIT-002: dropUnmapped=false 保留全部原欄位並附加 mapping', async () => {
    const qr = createMssqlMock({ columns: ['a', 'c'], rowCount: 3 });
    await h.execute(
      makeCtx(
        { mappings: [{ sourceColumn: 'a', targetColumn: 'x' }], dropUnmapped: false },
        { default: inDs() },
        qr,
        { nodeType: 'field_mapping' },
      ),
    );
    const sql = intoSql(qr);
    expect(sql).toContain('"c"');
    expect(sql).toContain('"a" AS "x"');
  });

  it('FIELDMAP-UNIT-003: 輸入欄位改由 getMssqlTempTableColumns（無 information_schema.columns）', async () => {
    const qr = createMssqlMock({ columns: ['a'], rowCount: 3 });
    await h.execute(
      makeCtx({ mappings: [{ sourceColumn: 'a', targetColumn: 'x' }], dropUnmapped: true }, { default: inDs() }, qr, { nodeType: 'field_mapping' }),
    );
    expect(qr.calls.some((c: any) => c.sql.includes('tempdb.sys.columns'))).toBe(true);
    for (const c of qr.calls) expect(c.sql.includes('information_schema.columns')).toBe(false);
  });

  it('FIELDMAP-UNIT-004 (🔴 MUST-FIX): boolean defaultValue 不產生裸 TRUE/FALSE', async () => {
    const qr = createMssqlMock({ columns: ['a'], rowCount: 3 });
    await h.execute(
      makeCtx(
        { mappings: [{ sourceColumn: 'missing', targetColumn: 'y', defaultValue: true }], dropUnmapped: true },
        { default: inDs() },
        qr,
        { nodeType: 'field_mapping' },
      ),
    );
    const sql = intoSql(qr);
    expect(sql).toContain('CAST(1 AS BIT)');
    expect(sql).not.toMatch(/\bTRUE\b/);
    expect(sql).not.toMatch(/\bFALSE\b/);
  });

  it('FIELDMAP-UNIT-005: string/number/null defaultValue 與 PG 版一致', async () => {
    const qr = createMssqlMock({ columns: ['a'], rowCount: 3 });
    await h.execute(
      makeCtx(
        {
          mappings: [
            { sourceColumn: 'm1', targetColumn: 't1', defaultValue: 'hello' },
            { sourceColumn: 'm2', targetColumn: 't2', defaultValue: 42 },
            { sourceColumn: 'm3', targetColumn: 't3', defaultValue: null },
          ],
          dropUnmapped: true,
        },
        { default: inDs() },
        qr,
        { nodeType: 'field_mapping' },
      ),
    );
    const sql = intoSql(qr);
    expect(sql).toContain(`'hello' AS "t1"`);
    expect(sql).toContain('42 AS "t2"');
    expect(sql).toContain('NULL AS "t3"');
  });

  it('FIELDMAP-UNIT-006 (決策關卡): dropUnmapped=true 且 mappings=[] → 明確拋錯（零欄位 SELECT INTO 不支援）', async () => {
    const qr = createMssqlMock({ columns: ['a'], rowCount: 3 });
    await expect(
      h.execute(makeCtx({ mappings: [], dropUnmapped: true }, { default: inDs() }, qr, { nodeType: 'field_mapping' })),
    ).rejects.toThrow(/零欄位/);
  });
});

// =====================================================================
// DERIVED-UNIT
// =====================================================================
describe('P4a DERIVED-UNIT (derived-field-handler-mssql)', () => {
  const h = new DerivedFieldHandlerMssql();
  async function derive(expression: string, columns: string[]): Promise<string> {
    const qr = createMssqlMock({ columns, rowCount: 3 });
    await h.execute(
      makeCtx({ expressions: [{ outputColumn: 'out', expression, outputType: 'TEXT' }] }, { default: inDs() }, qr, {
        nodeType: 'derived_field',
      }),
    );
    return intoSql(qr);
  }

  it('DERIVED-UNIT-001: padStart → RIGHT/REPLICATE（非 LPAD）', async () => {
    const sql = await derive("padStart(CUSTOM_MK, 2, '0')", ['CUSTOM_MK']);
    expect(sql).toContain('REPLICATE');
    expect(sql).toContain('RIGHT');
    expect(sql).not.toContain('LPAD');
  });

  it('DERIVED-UNIT-002 (🔴 MUST-FIX): padStart 含 LEN>=n THEN LEFT 截斷分支', async () => {
    const sql = await derive("padStart(CUSTOM_MK, 2, '0')", ['CUSTOM_MK']);
    expect(sql).toMatch(/LEN\(.*\) >= 2 THEN LEFT\(/);
  });

  it('DERIVED-UNIT-003 (🔴): mergePhone 全零判斷 → LEN>0 AND NOT LIKE %[^0]%（無 ~）', async () => {
    const sql = await derive('mergePhone(area, tel)', ['area', 'tel']);
    expect(sql).toContain("NOT LIKE '%[^0]%'");
    expect(sql).toContain('LEN("area") > 0');
    expect(sql).not.toContain('~');
  });

  it('DERIVED-UNIT-004: mergePhone CONCAT/NULL/空字串判斷結構保留', async () => {
    const sql = await derive('mergePhone(area, tel)', ['area', 'tel']);
    expect(sql).toContain('CONCAT(');
    expect(sql).toContain('IS NULL');
    expect(sql).toContain("= ''");
  });

  it('DERIVED-UNIT-005: gen_random_uuid() → NEWID()', async () => {
    const sql = await derive('gen_random_uuid()', ['a']);
    expect(sql).toContain('NEWID()');
    expect(sql).not.toContain('gen_random_uuid');
  });

  it('DERIVED-UNIT-006: CASE WHEN passthrough left./right. 解析 + getMssqlTempTableColumns', async () => {
    const qr = createMssqlMock({ columns: ['a', 'b_right'], rowCount: 3 });
    await h.execute(
      makeCtx(
        { expressions: [{ outputColumn: 'out', expression: 'CASE WHEN left.a IS NOT NULL THEN left.a ELSE right.b END', outputType: 'TEXT' }] },
        { default: inDs() },
        qr,
        { nodeType: 'derived_field' },
      ),
    );
    const sql = intoSql(qr);
    expect(sql).toContain('"a"');
    expect(sql).toContain('"b_right"');
    expect(qr.calls.some((c: any) => c.sql.includes('tempdb.sys.columns'))).toBe(true);
  });
});

// =====================================================================
// CAST-UNIT
// =====================================================================
describe('P4a CAST-UNIT (type-cast-handler-mssql)', () => {
  const h = new TypeCastHandlerMssql();
  async function cast(targetType: string, col = 'x'): Promise<string> {
    const qr = createMssqlMock({ columns: [col], rowCount: 3 });
    await h.execute(
      makeCtx({ castRules: [{ column: col, sourceType: 'VARCHAR', targetType }] }, { default: inDs() }, qr, { nodeType: 'type_cast' }),
    );
    return intoSql(qr);
  }

  it('CAST-UNIT-001: CAST → TRY_CAST（目標型別轉型無裸 CAST）', async () => {
    const sql = await cast('INTEGER');
    expect(sql).toContain('TRY_CAST');
    // 目標型別 INT 之轉型不得為裸 CAST（未經 TRY_ 前綴）
    expect(sql).not.toMatch(/(?<!TRY_)CAST\(/);
  });

  it('CAST-UNIT-002: toMssqlType — INTEGER→INT / DECIMAL→DECIMAL(38,10) / DATE→DATE', async () => {
    expect(await cast('INTEGER')).toContain('AS INT)');
    expect(await cast('DECIMAL')).toContain('AS DECIMAL(38, 10)');
    expect(await cast('DATE')).toContain('AS DATE)');
  });

  it('CAST-UNIT-003 (🔴 §5.4): 三型別驗證為字元類別（LIKE/SUBSTRING/LEN/CHARINDEX），含 LEN>0 空字串守門', async () => {
    const intSql = await cast('INTEGER');
    expect(intSql).toContain("NOT LIKE '%[^0-9]%'");
    expect(intSql).toContain('LEN(');
    // 空字串守門：LEN(sv) > 0，sv = TRY_CAST("x" AS NVARCHAR(4000))
    expect(intSql).toContain('LEN(TRY_CAST("x" AS NVARCHAR(4000))) > 0');

    const decSql = await cast('DECIMAL');
    expect(decSql).toContain("CHARINDEX('.'");
    expect(decSql).toContain("NOT LIKE '%[^0-9]%'");

    const dateSql = await cast('DATE');
    expect(dateSql).toContain('SUBSTRING(');
    expect(dateSql).toContain("= '-'");
    expect(dateSql).toContain('LEN(TRY_CAST("x" AS NVARCHAR(4000))) >= 10');
  });

  it('CAST-UNIT-007 (🔴 §5.6 I-MSSQL-DECIMAL-NORMALIZE-01): DECIMAL 走去尾零正規化式，INTEGER/DATE 維持裸 TRY_CAST', async () => {
    const decSql = await cast('DECIMAL');
    // DECIMAL 目標：TRY_CAST(.. AS DECIMAL(38, 10)) 保留為合法性關卡（CAST-UNIT-002 仍成立），
    // 外層包 CONVERT(VARCHAR(50))→RTRIM 去尾零→NULLIF 保底（FINDING-P4D-01 修法）
    expect(decSql).toContain('AS DECIMAL(38, 10)'); // 合法性關卡子字串未被移除
    expect(decSql).toContain('CONVERT(VARCHAR(50)');
    expect(decSql).toContain("RTRIM(");
    expect(decSql).toContain("'0'"); // 剝尾端 0
    expect(decSql).toContain("'.'"); // 剝殘留小數點
    expect(decSql).toContain('NULLIF(');
    // INTEGER / DATE：無去尾零包裹（維持原裸 TRY_CAST）
    const intSql = await cast('INTEGER');
    expect(intSql).not.toContain('CONVERT(VARCHAR(50)');
    expect(intSql).toContain('TRY_CAST(TRY_CAST("x" AS NVARCHAR(4000)) AS INT)');
    const dateSql = await cast('DATE');
    expect(dateSql).not.toContain('CONVERT(VARCHAR(50)');
    expect(dateSql).toContain('TRY_CAST(TRY_CAST("x" AS NVARCHAR(4000)) AS DATE)');
  });

  it('CAST-UNIT-005: 輸入欄位改由 getMssqlTempTableColumns（無 information_schema.columns）', async () => {
    const qr = createMssqlMock({ columns: ['x'], rowCount: 3 });
    await h.execute(
      makeCtx({ castRules: [{ column: 'x', sourceType: 'VARCHAR', targetType: 'INTEGER' }] }, { default: inDs() }, qr, { nodeType: 'type_cast' }),
    );
    expect(qr.calls.some((c: any) => c.sql.includes('tempdb.sys.columns'))).toBe(true);
    for (const c of qr.calls) expect(c.sql.includes('information_schema.columns')).toBe(false);
  });

  it('CAST-UNIT-006: 不支援的 targetType 仍拋錯', async () => {
    const qr = createMssqlMock({ columns: ['x'], rowCount: 3 });
    await expect(
      h.execute(
        makeCtx({ castRules: [{ column: 'x', sourceType: 'VARCHAR', targetType: 'BOOLEAN' }] }, { default: inDs() }, qr, { nodeType: 'type_cast' }),
      ),
    ).rejects.toThrow('不支援的型別轉換：VARCHAR → BOOLEAN');
  });
});

// =====================================================================
// COND-UNIT
// =====================================================================
describe('P4a COND-UNIT (conditional-handler-mssql)', () => {
  const h = new ConditionalHandlerMssql();

  it('COND-UNIT-001: CASE WHEN ... END 結構保留', async () => {
    const qr = createMssqlMock({ columns: ['resign_date'], rowCount: 3 });
    await h.execute(
      makeCtx(
        { rules: [{ targetColumn: 'resign_date', conditions: [{ when: `resign_date = '9999-12-31'`, then: `'NULL_SENTINEL'` }], elseValue: 'left.resign_date' }] },
        { default: inDs() },
        qr,
        { nodeType: 'conditional' },
      ),
    );
    const sql = intoSql(qr);
    expect(sql).toContain('CASE');
    expect(sql).toContain('WHEN');
    expect(sql).toContain('END');
  });

  it('COND-UNIT-002: NULL-safety guard（left/right 全 NULL 防護）保留', async () => {
    const qr = createMssqlMock({ columns: ['source_updated_at', 'source_updated_at_right', 'v'], rowCount: 3 });
    await h.execute(
      makeCtx(
        {
          rules: [
            {
              targetColumn: 'v',
              conditions: [{ when: 'left.source_updated_at >= right.source_updated_at', then: 'left.v' }],
              elseValue: 'right.v',
            },
          ],
        },
        { default: inDs() },
        qr,
        { nodeType: 'conditional' },
      ),
    );
    const sql = intoSql(qr);
    expect(sql).toContain('IS NULL');
  });

  it('COND-UNIT-003: 輸入欄位改由 getMssqlTempTableColumns', async () => {
    const qr = createMssqlMock({ columns: ['a'], rowCount: 3 });
    await h.execute(
      makeCtx({ rules: [{ targetColumn: 'a', conditions: [{ when: `a = '1'`, then: `'2'` }], elseValue: 'a' }] }, { default: inDs() }, qr, {
        nodeType: 'conditional',
      }),
    );
    expect(qr.calls.some((c: any) => c.sql.includes('tempdb.sys.columns'))).toBe(true);
    for (const c of qr.calls) expect(c.sql.includes('information_schema.columns')).toBe(false);
  });

  it('COND-UNIT-004: left./right. 前綴解析輸出 SQL 結構正確', async () => {
    const qr = createMssqlMock({ columns: ['source_updated_at', 'source_updated_at_right', 'v', 'v_right'], rowCount: 3 });
    await h.execute(
      makeCtx(
        {
          rules: [
            {
              targetColumn: 'v',
              conditions: [{ when: 'left.source_updated_at >= right.source_updated_at', then: 'left.v' }],
              elseValue: 'right.v',
            },
          ],
        },
        { default: inDs() },
        qr,
        { nodeType: 'conditional' },
      ),
    );
    const sql = intoSql(qr);
    expect(sql).toContain('"source_updated_at" >= "source_updated_at_right"');
    expect(sql).toContain('"v_right"');
  });
});

// =====================================================================
// DISPATCH-003: nodeType 契約
// =====================================================================
describe('P4a DISPATCH-003 (nodeType 契約與 PG 版一致)', () => {
  it('五個 mssql handler 之 nodeType 字面值與 PG 版相同', () => {
    expect(new ExtractHandlerMssql().nodeType).toBe('raw_data_extract');
    expect(new FieldMappingHandlerMssql().nodeType).toBe('field_mapping');
    expect(new DerivedFieldHandlerMssql().nodeType).toBe('derived_field');
    expect(new TypeCastHandlerMssql().nodeType).toBe('type_cast');
    expect(new ConditionalHandlerMssql().nodeType).toBe('conditional');
  });
});
