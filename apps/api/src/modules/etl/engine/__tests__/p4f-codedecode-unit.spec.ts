/**
 * F110 / US-173 — AD-E07-41 P4f `code_decode` 節點：UNIT 測試（mock QueryRunner，CI 恆常執行）。
 *
 * 覆蓋（本切片 SLICE 1 = backend engine only）：
 *   - VALIDATE（F110-test AC-10 群組，TS-F110-001~014）：設定驗證 + 主資料流/字典解析錯誤（兩 dialect 共用同一驗證）。
 *   - SQLGEN（AD-E07-41-P4-codedecode-test §二）：兩 dialect 各自產出 SQL 之結構斷言
 *     （filter 位置 / ROW_NUMBER 去重 / TRIM+cast 正規化 / SELECT INTO / 顯式欄位枚舉 / OPTION (HASH JOIN)）。
 *   - DISPATCH（§三）：nodeType 契約 + createDispatcher 第 10 對 + 真實 NodeDispatcher 並存不覆蓋。
 *   - 語意契約（F110-test AC-1/2/3/6/7/§6.2）：DataSet 形狀（tempTable / rowCount）與欄位投影。
 *
 * 手法：直接實例化 handler class（不透過 dispatcher），mock queryRunner 攔截 SQL 文字與回傳。
 * 明確排除（交姊妹文件真實連線群組）：EQ-MSSQL / EQ-PG-BYTEIDENTICAL / PERF-NFR / MIGRATION。
 */
import { describe, it, expect, vi } from 'vitest';
import { CodeDecodeHandler } from '../handlers/code-decode-handler';
import { CodeDecodeHandlerMssql } from '../handlers/code-decode-handler-mssql';
import { LookupHandler } from '../handlers/lookup-handler';
import { NodeDispatcher } from '../node-dispatcher';
import { NodeExecutionContext, DataSet } from '../types';

// =====================================================================
// Mock QueryRunner（PG / MSSQL 各一）
// =====================================================================
interface MockOpts {
  columnsByTable?: Record<string, string[]>; // 暫存表欄位（input）
  dictColumns?: Record<string, string[]>; // 字典表欄位（_cdmp_id 判定）
  defaultColumns?: string[];
  tableExists?: boolean;
  rowCount?: number;
  mainThrows?: string; // 主 JOIN 查詢拋錯（模擬 filter 語法錯誤）
  extractionEmpty?: boolean; // extraction_tasks 查無（lookupRef 解析失敗）
}

function createPgMock(opts: MockOpts = {}) {
  const {
    columnsByTable = {},
    dictColumns = {},
    defaultColumns = [],
    tableExists = true,
    rowCount = 0,
    mainThrows,
  } = opts;
  const calls: { sql: string; params?: any[] }[] = [];
  const query = vi.fn(async (sql: string, params?: any[]) => {
    calls.push({ sql, params });
    if (sql.includes('extraction_tasks')) {
      return []; // lookupRef 解析：一律回空（本檔僅在 TS-013 用 lookupRef）
    }
    if (sql.includes('information_schema.tables')) {
      return tableExists ? [{ table_name: params?.[0] }] : [];
    }
    if (sql.includes('information_schema.columns')) {
      const t = params?.[0] as string;
      const cols = dictColumns[t] ?? columnsByTable[t] ?? defaultColumns;
      return cols.map((c) => ({ column_name: c }));
    }
    if (sql.includes('COUNT(*)')) {
      return [{ cnt: rowCount }];
    }
    if (sql.startsWith('CREATE TEMP TABLE')) {
      if (mainThrows) throw new Error(mainThrows);
      return [];
    }
    return [];
  });
  return { query, calls } as any;
}

function createMssqlMock(opts: MockOpts = {}) {
  const {
    columnsByTable = {},
    dictColumns = {},
    defaultColumns = [],
    tableExists = true,
    rowCount = 0,
    mainThrows,
  } = opts;
  const calls: { sql: string; params?: any[] }[] = [];
  const query = vi.fn(async (sql: string, params?: any[]) => {
    calls.push({ sql, params });
    if (sql.includes('tempdb.sys.columns')) {
      const t = params?.[0] as string;
      const cols = columnsByTable[t] ?? defaultColumns;
      return cols.map((c, i) => ({ column_name: c, column_id: i + 1, data_type: 'nvarchar' }));
    }
    if (sql.includes('INFORMATION_SCHEMA.TABLES')) {
      return tableExists ? [{ table_name: params?.[0] }] : [];
    }
    if (sql.includes('INFORMATION_SCHEMA.COLUMNS')) {
      const t = params?.[0] as string;
      const cols = dictColumns[t] ?? [];
      return cols.map((c) => ({ column_name: c }));
    }
    if (sql.includes('COUNT(*)')) {
      return [{ cnt: rowCount }];
    }
    if (sql.includes('INTO ##')) {
      if (mainThrows) throw new Error(mainThrows);
      return [];
    }
    return [];
  });
  return { query, calls } as any;
}

function makeCtx(
  nodeData: Record<string, unknown>,
  inputs: Record<string, DataSet>,
  qr: any,
  opts: { nodeId?: string; logId?: string } = {},
): NodeExecutionContext {
  return {
    node: {
      id: opts.nodeId ?? 'cd1',
      type: 'pipelineNode',
      position: { x: 0, y: 0 },
      data: { nodeType: 'code_decode', label: 'T', ...nodeData },
    },
    inputs,
    pipelineId: 'p',
    logId: opts.logId ?? 'abcd1234-ffff',
    isTestRun: false,
    queryRunner: qr,
  };
}

const ds = (t: string, n = 4): DataSet => ({ tempTable: t, rowCount: n });

/** 主 JOIN 陳述式（PG：CREATE TEMP TABLE / MSSQL：SELECT ... INTO ##）。 */
function mainSql(qr: any): string {
  const c = qr.calls.find(
    (x: any) =>
      typeof x.sql === 'string' &&
      (x.sql.startsWith('CREATE TEMP TABLE') || x.sql.includes('INTO ##')),
  );
  expect(c, 'expected a main CREATE TEMP TABLE / SELECT INTO ## statement').toBeDefined();
  return c.sql;
}

// 標準單一 mapping（education_desc，單一等式 filter，legacy static 模式）
function oneMapping(over: Record<string, unknown> = {}) {
  return {
    lookupSource: 'raw_edu',
    mappings: [
      {
        matchColumn: 'EDUCAT_BACK',
        lookupMatchColumn: 'TBL_CD',
        filter: `"TBL_ID" = 'A2'`,
        outputColumns: [{ lookupColumn: 'TBL_DESC1', outputAlias: 'education_desc' }],
      },
    ],
    ...over,
  };
}

// 兩組 mapping（education + occupation），比照 F110-test 縮減子集
function twoMappings(over: Record<string, unknown> = {}) {
  return {
    lookupSource: 'raw_edu',
    mappings: [
      {
        matchColumn: 'EDUCAT_BACK',
        lookupMatchColumn: 'TBL_CD',
        filter: `"TBL_ID" = 'A2'`,
        outputColumns: [{ lookupColumn: 'TBL_DESC1', outputAlias: 'education_desc' }],
      },
      {
        matchColumn: 'VOCATION_CODE',
        lookupMatchColumn: 'TBL_CD',
        filter: `"TBL_ID" = 'A4'`,
        outputColumns: [{ lookupColumn: 'TBL_DESC1', outputAlias: 'occupation_desc' }],
      },
    ],
    ...over,
  };
}

const NINE_ALIASES = [
  ['EDUCAT_BACK', 'A2', 'education_desc'],
  ['VOCATION_CODE', 'A4', 'occupation_desc'],
  ['JOB_TITLE', 'A5', 'job_title_desc'],
  ['CMARRY_MK', '33', 'marital_status_desc'],
  ['CUSTOM_MK', '55', 'customer_type_desc'],
  ['INCOME_SOURCE', 'Y0', 'income_source_desc'],
  ['INDUSTRY', 'AA', 'industry_desc'],
  ['JOB_LEVEL', 'A6', 'job_level_desc'],
  ['MONTH_INCOME', 'A3', 'monthly_income_desc'],
];
function nineMappings(over: Record<string, unknown> = {}) {
  return {
    lookupSource: 'raw_e5a2345c',
    mappings: NINE_ALIASES.map(([mc, id, alias]) => ({
      matchColumn: mc,
      lookupMatchColumn: 'TBL_CD',
      filter: `"TBL_ID" = '${id}'`,
      outputColumns: [{ lookupColumn: 'TBL_DESC1', outputAlias: alias }],
    })),
    ...over,
  };
}

// input 暫存表欄位（含全部 matchColumn + CUSTO_NO）
const INPUT_COLS_9 = ['CUSTO_NO', ...NINE_ALIASES.map((m) => m[0])];

// =====================================================================
// 一、VALIDATE — 設定驗證 (AC-10, TS-F110-001~014)。兩 dialect 共用 validateCodeDecodeConfig。
// =====================================================================
describe.each([
  ['PG', () => new CodeDecodeHandler(), createPgMock],
  ['MSSQL', () => new CodeDecodeHandlerMssql(), createMssqlMock],
] as const)('P4f VALIDATE (%s)', (_label, makeHandler, makeMock) => {
  const h = makeHandler();
  const mockOk = () =>
    makeMock({
      defaultColumns: ['EDUCAT_BACK'],
      columnsByTable: { '##in': ['EDUCAT_BACK'], in: ['EDUCAT_BACK'] },
      dictColumns: { raw_edu: ['TBL_CD', 'TBL_DESC1', 'TBL_ID', '_cdmp_id'] },
      rowCount: 3,
    });

  it('TS-F110-001: mappings 為空陣列 → 缺少解碼 mapping', async () => {
    await expect(
      h.execute(makeCtx(oneMapping({ mappings: [] }), { default: ds('in') }, mockOk())),
    ).rejects.toThrow('code_decode 節點缺少解碼 mapping');
  });

  it('TS-F110-002: mappings 欄位缺失（undefined）→ 缺少解碼 mapping', async () => {
    await expect(
      h.execute(makeCtx({ lookupSource: 'raw_edu' }, { default: ds('in') }, mockOk())),
    ).rejects.toThrow('code_decode 節點缺少解碼 mapping');
  });

  it('TS-F110-003: 無 lookupRef/lookupSource/lookup-input → 字典來源不可解析', async () => {
    await expect(
      h.execute(makeCtx(oneMapping({ lookupSource: undefined }), { default: ds('in') }, mockOk())),
    ).rejects.toThrow(/lookupRef/);
  });

  it('TS-F110-004: mapping 缺 matchColumn → 缺少比對欄位（主表）', async () => {
    const cfg = oneMapping();
    (cfg.mappings[0] as any).matchColumn = undefined;
    await expect(h.execute(makeCtx(cfg, { default: ds('in') }, mockOk()))).rejects.toThrow(
      'code_decode 節點 mapping 缺少比對欄位（主表）',
    );
  });

  it('TS-F110-005: mapping 缺 lookupMatchColumn → 缺少比對欄位（對照表）', async () => {
    const cfg = oneMapping();
    (cfg.mappings[0] as any).lookupMatchColumn = undefined;
    await expect(h.execute(makeCtx(cfg, { default: ds('in') }, mockOk()))).rejects.toThrow(
      'code_decode 節點 mapping 缺少比對欄位（對照表）',
    );
  });

  it('TS-F110-006: outputColumns 為空陣列 → 缺少輸出欄位', async () => {
    const cfg = oneMapping();
    (cfg.mappings[0] as any).outputColumns = [];
    await expect(h.execute(makeCtx(cfg, { default: ds('in') }, mockOk()))).rejects.toThrow(
      'code_decode 節點 mapping 缺少輸出欄位',
    );
  });

  it('TS-F110-007a: outputColumns 項缺 lookupColumn → 缺少輸出欄位', async () => {
    const cfg = oneMapping();
    (cfg.mappings[0] as any).outputColumns = [{ outputAlias: 'education_desc' }];
    await expect(h.execute(makeCtx(cfg, { default: ds('in') }, mockOk()))).rejects.toThrow(
      'code_decode 節點 mapping 缺少輸出欄位',
    );
  });

  it('TS-F110-007b: outputColumns 項缺 outputAlias → 缺少輸出欄位', async () => {
    const cfg = oneMapping();
    (cfg.mappings[0] as any).outputColumns = [{ lookupColumn: 'TBL_DESC1' }];
    await expect(h.execute(makeCtx(cfg, { default: ds('in') }, mockOk()))).rejects.toThrow(
      'code_decode 節點 mapping 缺少輸出欄位',
    );
  });

  it('TS-F110-008: 跨 mapping 重複 outputAlias → 輸出別名重複：{alias}', async () => {
    const cfg = twoMappings();
    (cfg.mappings[1] as any).outputColumns = [
      { lookupColumn: 'TBL_DESC1', outputAlias: 'education_desc' },
    ];
    await expect(h.execute(makeCtx(cfg, { default: ds('in') }, mockOk()))).rejects.toThrow(
      'code_decode 節點輸出別名重複：education_desc',
    );
  });

  it('TS-F110-009: 同一 mapping 內重複 outputAlias → 輸出別名重複：{alias}', async () => {
    const cfg = oneMapping();
    (cfg.mappings[0] as any).outputColumns = [
      { lookupColumn: 'TBL_DESC1', outputAlias: 'customer_type_desc' },
      { lookupColumn: 'TBL_DESC2', outputAlias: 'customer_type_desc' },
    ];
    await expect(h.execute(makeCtx(cfg, { default: ds('in') }, mockOk()))).rejects.toThrow(
      'code_decode 節點輸出別名重複：customer_type_desc',
    );
  });

  it('TS-F110-010: 合法最小設定通過驗證，進入執行階段（回傳 DataSet）', async () => {
    const out = await h.execute(makeCtx(oneMapping(), { default: ds('in') }, mockOk()));
    expect(out.rowCount).toBe(3);
    expect(out.tempTable).toContain('etl_tmp_cd1');
  });

  it('TS-F110-011: 主資料流缺失（inputs 無 default）→ 缺少主資料流輸入', async () => {
    await expect(h.execute(makeCtx(oneMapping(), {}, mockOk()))).rejects.toThrow(
      'code_decode 節點缺少主資料流輸入',
    );
  });

  it('TS-F110-012: 字典來源表不存在 → 對照表 {source} 不存在', async () => {
    const qr = makeMock({
      defaultColumns: ['EDUCAT_BACK'],
      columnsByTable: { '##in': ['EDUCAT_BACK'], in: ['EDUCAT_BACK'] },
      tableExists: false,
      rowCount: 3,
    });
    await expect(
      h.execute(makeCtx(oneMapping({ lookupSource: 'raw_nonexistent' }), { default: ds('in') }, qr)),
    ).rejects.toThrow('對照表 raw_nonexistent 不存在');
  });

  it('TS-F110-013: lookupRef 查不到且無 lookupSource fallback → 解析失敗（沿用 lookup 現行措辭）', async () => {
    const qr = makeMock({ defaultColumns: ['EDUCAT_BACK'], rowCount: 3 });
    // 註：F110 §13 表列文案為「找不到對應的 extraction task…」；spec §13 明訂「文案由 tdd 對齊 lookup handler 現行措辭」，
    //     lookup 現行實作重用 resolveRawTable(Mssql)，其實際拋出訊息為「解析失敗且無靜態表名可 fallback」，故此處對齊之。
    await expect(
      h.execute(
        makeCtx(
          {
            lookupRef: { datasourceName: 'DS', sourceTable: 'ST' },
            mappings: oneMapping().mappings,
          },
          { default: ds('in') },
          qr,
        ),
      ),
    ).rejects.toThrow(/解析失敗.*fallback/);
  });

  it('TS-F110-014: mapping filter 語法錯誤（主查詢拋錯）→ 對照表查詢失敗：{error}', async () => {
    const qr = makeMock({
      defaultColumns: ['EDUCAT_BACK'],
      columnsByTable: { '##in': ['EDUCAT_BACK'], in: ['EDUCAT_BACK'] },
      dictColumns: { raw_edu: ['TBL_CD', 'TBL_DESC1', '_cdmp_id'] },
      rowCount: 3,
      mainThrows: "Incorrect syntax near 'AND'",
    });
    await expect(
      h.execute(
        makeCtx(oneMapping({ mappings: oneMapping({}).mappings }), { default: ds('in') }, qr),
      ),
    ).rejects.toThrow('對照表查詢失敗：');
  });
});

// =====================================================================
// 二、SQLGEN-MSSQL — MSSQL 版 SQL 生成結構（AD-E07-41-P4-codedecode-test §二）
// =====================================================================
describe('P4f SQLGEN-MSSQL (code-decode-handler-mssql)', () => {
  const h = new CodeDecodeHandlerMssql();

  async function gen(
    cfg: Record<string, unknown>,
    over: MockOpts = {},
  ): Promise<{ sql: string; qr: any }> {
    const qr = createMssqlMock({
      columnsByTable: { '##in': ['CUSTO_NO', 'EDUCAT_BACK', 'VOCATION_CODE'] },
      dictColumns: { raw_edu: ['TBL_CD', 'TBL_DESC1', 'TBL_ID', '_cdmp_id'] },
      rowCount: 4,
      ...over,
    });
    await h.execute(makeCtx(cfg, { default: ds('##in') }, qr));
    return { sql: mainSql(qr), qr };
  }

  it('JOINFILTER-MSSQL-001 (🔴 MUST-FIX): filter 僅出現於字典衍生子查詢內部，主查詢最外層無以 _cd_m 別名為條件之 WHERE', async () => {
    const { sql } = await gen(oneMapping());
    // filter 字面出現於 raw_edu 衍生子查詢範圍
    expect(sql).toContain(`FROM "raw_edu" d WHERE "TBL_ID" = 'A2'`);
    // 主查詢層級不得對 _cd_m 別名欄位做後置 WHERE（LEFT JOIN 退化為 INNER 之陷阱）
    expect(sql).not.toMatch(/\)\s*WHERE\s+"_cd_m\d+"/);
    // 主查詢唯一的 WHERE 應是去重子查詢的 WHERE "_cd_rn" = 1
    const outerAfterJoins = sql.slice(sql.lastIndexOf(') "_cd_m'));
    expect(outerAfterJoins).not.toMatch(/WHERE\s+"?_cd_m/);
  });

  it('DEDUP-MSSQL-001 (🔴 MUST-FIX): 字典衍生子查詢含 ROW_NUMBER() PARTITION BY 正規化鍵 + WHERE "_cd_rn" = 1', async () => {
    const { sql } = await gen(oneMapping());
    expect(sql).toMatch(/ROW_NUMBER\(\)\s+OVER\s+\(PARTITION BY TRIM\(TRY_CAST\(d\."TBL_CD"/);
    expect(sql).toContain('AS "_cd_rn"');
    expect(sql).toContain('WHERE "_cd_rn" = 1');
  });

  it('DEDUP-MSSQL-002a: 字典表有 _cdmp_id → ORDER BY d."_cdmp_id" ASC', async () => {
    const { sql } = await gen(oneMapping());
    expect(sql).toContain('ORDER BY d."_cdmp_id" ASC');
    expect(sql).not.toContain('(SELECT NULL)');
  });

  it('DEDUP-MSSQL-002b: 字典表無 _cdmp_id → fallback ORDER BY (SELECT NULL)', async () => {
    const { sql } = await gen(oneMapping(), {
      dictColumns: { raw_edu: ['TBL_CD', 'TBL_DESC1', 'TBL_ID'] },
    });
    expect(sql).toContain('ORDER BY (SELECT NULL)');
    expect(sql).not.toContain('_cdmp_id');
  });

  it('NORMALIZE-MSSQL-001: JOIN 鍵值等式與輸出值一律 TRIM(TRY_CAST(... AS NVARCHAR(4000)))（與 lookup trimCast 同）', async () => {
    const { sql } = await gen(oneMapping());
    // 主表 matchColumn 側
    expect(sql).toContain(`TRIM(TRY_CAST(m."EDUCAT_BACK" AS NVARCHAR(4000)))`);
    // 字典 lookupMatchColumn 側（鍵）
    expect(sql).toContain(`TRIM(TRY_CAST(d."TBL_CD" AS NVARCHAR(4000)))`);
    // 輸出值
    expect(sql).toContain(`TRIM(TRY_CAST(d."TBL_DESC1" AS NVARCHAR(4000))) AS "education_desc"`);
    // 零殘留 PG ::text
    expect(sql).not.toContain('::text');
  });

  it('SELECTINTO-MSSQL-001 (🔴 MUST-FIX): SELECT ... INTO ##新暫存表；零 ALTER TABLE / UPDATE...FROM', async () => {
    const { sql } = await gen(oneMapping());
    expect(sql).toMatch(/INTO ##etl_tmp_cd1_[a-z0-9]+/);
    expect(sql).not.toMatch(/ALTER\s+TABLE/i);
    expect(sql).not.toMatch(/ADD\s+COLUMN/i);
    expect(sql).not.toMatch(/UPDATE\s+.*\bFROM\b/i);
  });

  it('COLLISION-MSSQL-001 (🔴 MUST-FIX): 顯式欄位枚舉，無裸 * / m.* 萬用字元', async () => {
    const { sql } = await gen(twoMappings(), {
      columnsByTable: { '##in': ['CUSTO_NO', 'EDUCAT_BACK', 'VOCATION_CODE'] },
    });
    // passthrough 逐欄具名
    expect(sql).toContain('m."CUSTO_NO"');
    expect(sql).toContain('m."EDUCAT_BACK"');
    // 主查詢最外層 SELECT 清單無裸萬用字元（子查詢的 SELECT * 為去重包裹，允許）
    const selectList = sql.slice(0, sql.indexOf(' FROM "##in" m'));
    expect(selectList).not.toContain('*');
    expect(sql).not.toContain('m.*');
  });

  it('COLLISION-MSSQL-002: outputAlias 與既有輸入欄同名 → 該既有欄排除於 passthrough（解碼值覆蓋）', async () => {
    const { sql } = await gen(oneMapping(), {
      columnsByTable: { '##in': ['CUSTO_NO', 'EDUCAT_BACK', 'education_desc'] },
    });
    const selectList = sql.slice(0, sql.indexOf(' FROM "##in" m'));
    // 既有同名欄不進入 passthrough（不得有 m."education_desc"）
    expect(selectList).not.toContain('m."education_desc"');
    // 僅保留解碼投影一份
    expect(selectList).toContain('"_cd_m1"."education_desc" AS "education_desc"');
    expect(selectList).toContain('m."CUSTO_NO"');
  });

  it('HASHJOIN-MSSQL-001: 產出 SQL 結尾恰含一次 OPTION (HASH JOIN)，涵蓋全部 9 個 JOIN', async () => {
    const { sql } = await gen(nineMappings(), {
      columnsByTable: { '##in': INPUT_COLS_9 },
      dictColumns: { raw_e5a2345c: ['TBL_CD', 'TBL_DESC1', 'TBL_ID', '_cdmp_id'] },
    });
    expect((sql.match(/OPTION \(HASH JOIN\)/g) || []).length).toBe(1);
    expect(sql.trimEnd().endsWith('OPTION (HASH JOIN)')).toBe(true);
    expect((sql.match(/LEFT JOIN \(/g) || []).length).toBe(9);
  });

  it('MULTIMAP-MSSQL-001: 9 組 mapping → 單一 SELECT INTO 陳述式含 9 個 LEFT JOIN（非拆成多陳述式）', async () => {
    const qr = createMssqlMock({
      columnsByTable: { '##in': INPUT_COLS_9 },
      dictColumns: { raw_e5a2345c: ['TBL_CD', 'TBL_DESC1', 'TBL_ID', '_cdmp_id'] },
      rowCount: 4,
    });
    await h.execute(makeCtx(nineMappings(), { default: ds('##in') }, qr));
    const intoStmts = qr.calls.filter((c: any) => c.sql.includes('INTO ##'));
    expect(intoStmts.length).toBe(1);
    expect((intoStmts[0].sql.match(/LEFT JOIN \(/g) || []).length).toBe(9);
  });

  it('FILTER-MSSQL-001: 複合條件 filter 原樣沿用於字典衍生子查詢 WHERE', async () => {
    const cfg = {
      lookupSource: 'raw_mlmc',
      mappings: [
        {
          matchColumn: 'CUTYPE',
          lookupMatchColumn: 'DATAVA',
          filter: `TRIM("SYSCD")='CF' AND TRIM("DATAID")='CU'`,
          outputColumns: [{ lookupColumn: 'DATANM', outputAlias: 'customer_type_desc' }],
        },
      ],
    };
    const qr = createMssqlMock({
      columnsByTable: { '##in': ['CUSTO_NO', 'CUTYPE'] },
      dictColumns: { raw_mlmc: ['DATAVA', 'DATANM', 'SYSCD', 'DATAID', '_cdmp_id'] },
      rowCount: 4,
    });
    await h.execute(makeCtx(cfg, { default: ds('##in') }, qr));
    expect(mainSql(qr)).toContain(`WHERE TRIM("SYSCD")='CF' AND TRIM("DATAID")='CU'`);
  });

  it('FILTER-MSSQL-002: 無 filter → 字典衍生子查詢無 WHERE 子句（去重 WHERE "_cd_rn"=1 除外）', async () => {
    const cfg = {
      lookupSource: 'raw_post',
      mappings: [
        {
          matchColumn: 'HPOST_NUM',
          lookupMatchColumn: 'POST_NO',
          outputColumns: [{ lookupColumn: 'CITY', outputAlias: 'hpost_city' }],
        },
      ],
    };
    const qr = createMssqlMock({
      columnsByTable: { '##in': ['CUSTO_NO', 'HPOST_NUM'] },
      dictColumns: { raw_post: ['POST_NO', 'CITY', '_cdmp_id'] },
      rowCount: 4,
    });
    await h.execute(makeCtx(cfg, { default: ds('##in') }, qr));
    const sql = mainSql(qr);
    // 唯一的 WHERE 是去重 "_cd_rn" = 1
    expect((sql.match(/WHERE/g) || []).length).toBe(1);
    expect(sql).toContain('WHERE "_cd_rn" = 1');
    expect(sql).toContain('FROM "raw_post" d) _ranked');
  });
});

// =====================================================================
// 三、SQLGEN-PG — PG 版 SQL 生成結構（AD-E07-41 §13.3）
// =====================================================================
describe('P4f SQLGEN-PG (code-decode-handler)', () => {
  const h = new CodeDecodeHandler();

  async function gen(
    cfg: Record<string, unknown>,
    over: MockOpts = {},
  ): Promise<{ sql: string; qr: any }> {
    const qr = createPgMock({
      columnsByTable: { in: ['CUSTO_NO', 'EDUCAT_BACK', 'VOCATION_CODE'] },
      dictColumns: { raw_edu: ['TBL_CD', 'TBL_DESC1', 'TBL_ID', '_cdmp_id'] },
      rowCount: 4,
      ...over,
    });
    await h.execute(makeCtx(cfg, { default: ds('in') }, qr));
    return { sql: mainSql(qr), qr };
  }

  it('JOINFILTER-PG-001: filter 套於字典衍生子查詢內部，主查詢最外層無以 _cd_m 別名為條件之 WHERE', async () => {
    const { sql } = await gen(oneMapping());
    expect(sql).toContain(`FROM "raw_edu" d WHERE "TBL_ID" = 'A2'`);
    const outerAfterJoins = sql.slice(sql.lastIndexOf(') "_cd_m'));
    expect(outerAfterJoins).not.toMatch(/WHERE\s+"?_cd_m/);
  });

  it('DEDUP-PG-001: ROW_NUMBER() OVER (PARTITION BY ... ORDER BY ...) 與 MSSQL 同構（ANSI window function）', async () => {
    const { sql } = await gen(oneMapping());
    expect(sql).toMatch(/ROW_NUMBER\(\)\s+OVER\s+\(PARTITION BY TRIM\(d\."TBL_CD"::text\)/);
    expect(sql).toContain('ORDER BY d."_cdmp_id" ASC');
    expect(sql).toContain('WHERE "_cd_rn" = 1');
  });

  it('NORMALIZE-PG-001: 正規化為 TRIM(expr::text)（與 lookup-handler.ts PG 版一致）', async () => {
    const { sql } = await gen(oneMapping());
    expect(sql).toContain('TRIM(m."EDUCAT_BACK"::text)');
    expect(sql).toContain('TRIM(d."TBL_CD"::text)');
    expect(sql).toContain('TRIM(d."TBL_DESC1"::text) AS "education_desc"');
    expect(sql).not.toContain('TRY_CAST');
  });

  it('SELECTINTO-PG-001: CREATE TEMP TABLE ... AS SELECT；零 ALTER TABLE / UPDATE...SET...FROM', async () => {
    const { sql } = await gen(oneMapping());
    expect(sql).toMatch(/^CREATE TEMP TABLE "etl_tmp_cd1_[a-z0-9]+" AS SELECT /);
    expect(sql).not.toMatch(/ALTER\s+TABLE/i);
    expect(sql).not.toMatch(/UPDATE\s+.*\bSET\b.*\bFROM\b/i);
  });

  it('COLLISION-PG-001: 顯式欄位枚舉，無裸 * / m.*', async () => {
    const { sql } = await gen(twoMappings(), {
      columnsByTable: { in: ['CUSTO_NO', 'EDUCAT_BACK', 'VOCATION_CODE'] },
    });
    const selectList = sql.slice(0, sql.indexOf(' FROM "in" m'));
    expect(selectList).not.toContain('*');
    expect(sql).not.toContain('m.*');
    expect(sql).toContain('m."CUSTO_NO"');
  });

  it('HASHJOIN-PG-001 (負向): PG 版全文不含 OPTION / JOIN 演算法 hint', async () => {
    const { sql } = await gen(nineMappings(), {
      columnsByTable: { in: INPUT_COLS_9 },
      dictColumns: { raw_e5a2345c: ['TBL_CD', 'TBL_DESC1', 'TBL_ID', '_cdmp_id'] },
    });
    expect(sql).not.toContain('OPTION');
    expect(sql).not.toMatch(/HASH JOIN/i);
    expect((sql.match(/LEFT JOIN \(/g) || []).length).toBe(9);
  });
});

// =====================================================================
// 四、DISPATCH — Handler 註冊（§三）
// =====================================================================
describe('P4f DISPATCH', () => {
  it('DISPATCH-001: 兩 handler nodeType 皆為 code_decode，且不等於 lookup', () => {
    expect(new CodeDecodeHandler().nodeType).toBe('code_decode');
    expect(new CodeDecodeHandlerMssql().nodeType).toBe('code_decode');
    expect(new CodeDecodeHandler().nodeType).not.toBe(new LookupHandler().nodeType);
  });

  it('DISPATCH-002: createDispatcher 兩分支各自新增第 10 對 register（讀取 service 原始碼）', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const svc = fs.readFileSync(
      path.resolve(__dirname, '../../etl-pipeline-execution.service.ts'),
      'utf8',
    );
    expect(svc).toContain('dispatcher.register(new CodeDecodeHandlerMssql())');
    expect(svc).toContain('dispatcher.register(new CodeDecodeHandler())');
    // 既有 LookupHandler(Mssql) 仍存在（既有 9 對未被移除）
    expect(svc).toContain('dispatcher.register(new LookupHandlerMssql())');
    expect(svc).toContain('dispatcher.register(new LookupHandler())');
  });

  it('DISPATCH-003: lookup 與 code_decode 於同一 NodeDispatcher 並存，互不覆蓋', () => {
    const dispatcher = new NodeDispatcher();
    const lookup = new LookupHandler();
    const codeDecode = new CodeDecodeHandler();
    dispatcher.register(lookup);
    dispatcher.register(codeDecode);
    expect(dispatcher.getExecutor('lookup')).toBe(lookup);
    expect(dispatcher.getExecutor('code_decode')).toBe(codeDecode);
    expect(dispatcher.hasExecutor('lookup')).toBe(true);
    expect(dispatcher.hasExecutor('code_decode')).toBe(true);
  });
});

// =====================================================================
// 五、語意契約 — DataSet 形狀 / rowCount / 欄位投影（AC-1/2/3/6/7/§6.2）
// =====================================================================
describe('P4f SEMANTIC (DataSet 形狀與投影)', () => {
  const hPg = new CodeDecodeHandler();
  const hMssql = new CodeDecodeHandlerMssql();

  it('TS-F110-015: 單一節點 9 組 mapping 一次掃描 → SQL 含全部 9 個 outputAlias 投影、rowCount 不變', async () => {
    const qr = createMssqlMock({
      columnsByTable: { '##in': INPUT_COLS_9 },
      dictColumns: { raw_e5a2345c: ['TBL_CD', 'TBL_DESC1', 'TBL_ID', '_cdmp_id'] },
      rowCount: 4,
    });
    const out = await hMssql.execute(makeCtx(nineMappings(), { default: ds('##in', 4) }, qr));
    const sql = mainSql(qr);
    for (const [, , alias] of NINE_ALIASES) {
      expect(sql).toContain(`"${alias}" AS "${alias}"`);
    }
    expect(out.rowCount).toBe(4);
  });

  it('TS-F110-016: 輸出 = 輸入欄位 ∪ K 個 outputAlias（SQL 投影），rowCount 與輸入相同', async () => {
    const qr = createPgMock({
      columnsByTable: { in: ['CUSTO_NO', 'EDUCAT_BACK', 'VOCATION_CODE'] },
      dictColumns: { raw_edu: ['TBL_CD', 'TBL_DESC1', 'TBL_ID', '_cdmp_id'] },
      rowCount: 4,
    });
    const out = await hPg.execute(makeCtx(twoMappings(), { default: ds('in', 4) }, qr));
    const sql = mainSql(qr);
    // 輸入欄位保留
    expect(sql).toContain('m."CUSTO_NO"');
    expect(sql).toContain('m."EDUCAT_BACK"');
    expect(sql).toContain('m."VOCATION_CODE"');
    // K 個 outputAlias
    expect(sql).toContain('"education_desc" AS "education_desc"');
    expect(sql).toContain('"occupation_desc" AS "occupation_desc"');
    expect(out.rowCount).toBe(4);
  });

  it('TS-F110-017: 單一 mapping 合法執行（不因僅 1 組被拒），僅新增 1 欄', async () => {
    const qr = createPgMock({
      columnsByTable: { in: ['CUSTO_NO', 'EDUCAT_BACK'] },
      dictColumns: { raw_edu: ['TBL_CD', 'TBL_DESC1', 'TBL_ID', '_cdmp_id'] },
      rowCount: 4,
    });
    const out = await hPg.execute(makeCtx(oneMapping(), { default: ds('in', 4) }, qr));
    const sql = mainSql(qr);
    expect((sql.match(/LEFT JOIN \(/g) || []).length).toBe(1);
    expect(sql).toContain('"education_desc" AS "education_desc"');
    expect(out.rowCount).toBe(4);
  });

  it('TS-F110-018: 三種 filter 型態（等式/複合/無）同節點皆可設定並各自套用', async () => {
    const cfg = {
      lookupSource: 'raw_mix',
      mappings: [
        {
          matchColumn: 'A',
          lookupMatchColumn: 'K',
          filter: `"TBL_ID" = 'A2'`,
          outputColumns: [{ lookupColumn: 'V', outputAlias: 'a_desc' }],
        },
        {
          matchColumn: 'B',
          lookupMatchColumn: 'K',
          filter: `TRIM("SYSCD")='CF' AND TRIM("DATAID")='CU'`,
          outputColumns: [{ lookupColumn: 'V', outputAlias: 'b_desc' }],
        },
        {
          matchColumn: 'C',
          lookupMatchColumn: 'K',
          outputColumns: [{ lookupColumn: 'V', outputAlias: 'c_desc' }],
        },
      ],
    };
    const qr = createMssqlMock({
      columnsByTable: { '##in': ['A', 'B', 'C'] },
      dictColumns: { raw_mix: ['K', 'V', 'SYSCD', 'DATAID', 'TBL_ID', '_cdmp_id'] },
      rowCount: 4,
    });
    const out = await hMssql.execute(makeCtx(cfg, { default: ds('##in', 4) }, qr));
    const sql = mainSql(qr);
    expect(sql).toContain(`WHERE "TBL_ID" = 'A2'`);
    expect(sql).toContain(`WHERE TRIM("SYSCD")='CF' AND TRIM("DATAID")='CU'`);
    // 三個 outputAlias 皆投影
    expect(sql).toContain('"a_desc" AS "a_desc"');
    expect(sql).toContain('"b_desc" AS "b_desc"');
    expect(sql).toContain('"c_desc" AS "c_desc"');
    expect(out.rowCount).toBe(4);
  });

  it('TS-F110-019/026: 相同設定重複執行兩次，投影欄位順序完全一致（決定性）', async () => {
    const cfg = twoMappings();
    const run = async () => {
      const qr = createMssqlMock({
        columnsByTable: { '##in': ['CUSTO_NO', 'EDUCAT_BACK', 'VOCATION_CODE'] },
        dictColumns: { raw_edu: ['TBL_CD', 'TBL_DESC1', 'TBL_ID', '_cdmp_id'] },
        rowCount: 4,
      });
      await hMssql.execute(makeCtx(cfg, { default: ds('##in') }, qr));
      return mainSql(qr);
    };
    const s1 = await run();
    const s2 = await run();
    expect(s1).toBe(s2);
    // 投影順序：passthrough → education_desc → occupation_desc
    expect(s1.indexOf('"education_desc" AS')).toBeLessThan(s1.indexOf('"occupation_desc" AS'));
  });

  it('TS-F110-023: 輸入 rowCount=0 → 回傳空 DataSet、completed（不建立暫存表）', async () => {
    const qr = createPgMock({ rowCount: 0 });
    const out = await hPg.execute(makeCtx(oneMapping(), { default: ds('in', 0) }, qr));
    expect(out.tempTable).toBe('');
    expect(out.rowCount).toBe(0);
    // 無主 JOIN 建表
    expect(qr.calls.find((c: any) => c.sql.startsWith('CREATE TEMP TABLE'))).toBeUndefined();
  });

  it('TS-F110-025: outputAlias 與既有輸入欄同名 → 覆蓋（僅一份解碼投影，無重複欄名）', async () => {
    const qr = createMssqlMock({
      columnsByTable: { '##in': ['CUSTO_NO', 'EDUCAT_BACK', 'education_desc'] },
      dictColumns: { raw_edu: ['TBL_CD', 'TBL_DESC1', 'TBL_ID', '_cdmp_id'] },
      rowCount: 4,
    });
    await hMssql.execute(makeCtx(oneMapping(), { default: ds('##in') }, qr));
    const sql = mainSql(qr);
    const selectList = sql.slice(0, sql.indexOf(' FROM "##in" m'));
    expect(selectList).not.toContain('m."education_desc"');
    expect((selectList.match(/"education_desc"/g) || []).length).toBe(2); // 別名投影兩處（"_cd_m1"."education_desc" AS "education_desc"）
  });
});
