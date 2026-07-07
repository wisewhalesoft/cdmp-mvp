/**
 * AD-E07-41 P4b — ETL Handler 群組二 MSSQL 版：UNIT 測試（mock QueryRunner，CI 恆常執行）。
 *
 * 覆蓋（測試設計 AD-E07-41-P4b-test.md）：
 *   ALTERCOL-UNIT-001..003 / UPDATEFROM-UNIT-001..003 / MERGE-UNIT-001..007 /
 *   RESOLVE-003(unit) / SKIP-UNIT-001..002 / DEFAULT-UNIT-001 / LOOKUP-UNIT-001..003 / DISPATCH-001。
 *
 * 手法：直接實例化 handler class（選項甲，不透過 dispatcher），比對產出 SQL 文字之方言關鍵字。
 *
 * ⚠️ 偏差備註（SKIP-UNIT-001）：測試設計原述「`DELETE FROM ##t AS _src` 為 T-SQL 原生合法語法，不需併入 FROM」。
 *    真實 MSSQL 探測證此為誤（`DELETE FROM ##t AS _src` / `DELETE FROM ##t _src` 皆 `Incorrect syntax`），
 *    唯一合法宣告 target 別名之形式為兩段式 `DELETE _src FROM ##t AS _src`。故本測試斷言「正確可執行」之兩段式結構，
 *    詳見 impl log 偏差段。
 */
import { describe, it, expect, vi } from 'vitest';
import { MergeHandlerMssql } from '../handlers/merge-handler-mssql';
import { LookupHandlerMssql } from '../handlers/lookup-handler-mssql';
import { MergeHandler } from '../handlers/merge-handler';
import { LookupHandler } from '../handlers/lookup-handler';
import { NodeExecutionContext, DataSet } from '../types';

// ---- mock QueryRunner ----
interface MockOpts {
  columnsByTable?: Record<string, string[]>;
  defaultColumns?: string[];
  tableExists?: boolean;
  rowCount?: number;
}
function createMssqlMock(opts: MockOpts = {}) {
  const { columnsByTable = {}, defaultColumns = [], tableExists = true, rowCount = 0 } = opts;
  const calls: { sql: string; params?: any[] }[] = [];
  const query = vi.fn(async (sql: string, params?: any[]) => {
    calls.push({ sql, params });
    if (sql.includes('tempdb.sys.columns')) {
      const t = params?.[0];
      const cols = (t && columnsByTable[t]) ?? defaultColumns;
      return cols.map((c, i) => ({ column_name: c, column_id: i + 1 }));
    }
    if (sql.includes('INFORMATION_SCHEMA.TABLES')) {
      return tableExists ? [{ table_name: 'x' }] : [];
    }
    if (sql.includes('COUNT(*)')) {
      return [{ cnt: rowCount }];
    }
    return [];
  });
  return { query, calls } as any;
}

function makeCtx(
  nodeType: string,
  nodeData: Record<string, unknown>,
  inputs: Record<string, DataSet>,
  qr: any,
  opts: { nodeId?: string; logId?: string } = {},
): NodeExecutionContext {
  return {
    node: {
      id: opts.nodeId ?? 'n1',
      type: 'pipelineNode',
      position: { x: 0, y: 0 },
      data: { nodeType, label: 'T', ...nodeData },
    },
    inputs,
    pipelineId: 'p',
    logId: opts.logId ?? 'abcd1234-ffff',
    isTestRun: false,
    queryRunner: qr,
  };
}

const ds = (t: string, n = 3): DataSet => ({ tempTable: t, rowCount: n });

/** 找出 handler 產出之 SELECT ... INTO ## 語句（merge 建表）。 */
function intoSql(qr: any): string | undefined {
  return qr.calls.find((c: any) => typeof c.sql === 'string' && c.sql.includes('INTO ##'))?.sql;
}
function findCall(qr: any, needle: string): string | undefined {
  return qr.calls.find((c: any) => typeof c.sql === 'string' && c.sql.includes(needle))?.sql;
}

// 標準 lookup 節點資料（legacy mode，static lookupSource，避免 extraction_tasks 依賴）
function lookupData(over: Record<string, unknown> = {}) {
  return {
    matchColumn: 'EDUCAT_BACK',
    lookupMatchColumn: 'TBL_CD',
    outputColumns: [{ lookupColumn: 'TBL_DESC1', outputAlias: 'education_desc' }],
    noMatchStrategy: 'null',
    lookupSource: 'raw_edu',
    lookupFilter: `"TBL_ID" = 'A2'`,
    ...over,
  };
}

// =====================================================================
// 一、ALTERCOL — ALTER TABLE ADD COLUMN 轉換（🔴🔴 最高風險）
// =====================================================================
describe('P4b ALTERCOL-UNIT (lookup-handler-mssql)', () => {
  const h = new LookupHandlerMssql();

  async function alterSql(over: Record<string, unknown> = {}): Promise<string> {
    // input 既有欄位只含 match 欄位（不含 alias）→ ALTER 必觸發
    const qr = createMssqlMock({ defaultColumns: ['EDUCAT_BACK'], rowCount: 3 });
    await h.execute(makeCtx('lookup', lookupData(over), { default: ds('##in') }, qr));
    const sql = findCall(qr, 'ALTER TABLE');
    expect(sql, 'expected an ALTER TABLE call').toBeDefined();
    return sql!;
  }

  it('ALTERCOL-UNIT-001 (🔴 MUST-FIX): 不得含字面 ADD COLUMN', async () => {
    const sql = await alterSql();
    expect(sql).not.toMatch(/ADD\s+COLUMN/i);
    expect(sql).toMatch(/ALTER TABLE "##in" ADD "education_desc"/);
  });

  it('ALTERCOL-UNIT-002 (🔴 MUST-FIX): 不得含 IF NOT EXISTS 子句', async () => {
    const sql = await alterSql();
    expect(sql).not.toMatch(/IF\s+NOT\s+EXISTS/i);
  });

  it('ALTERCOL-UNIT-003 (🔴 MUST-FIX): 型別為 NVARCHAR(MAX)，非裸 TEXT', async () => {
    const sql = await alterSql();
    expect(sql).toContain('NVARCHAR(MAX)');
    expect(sql).not.toMatch(/\bTEXT\b/);
  });

  it('ALTERCOL-UNIT (冪等機制選項甲): alias 已存在時不發 ALTER（JS 端預查 tempdb.sys.columns）', async () => {
    const qr = createMssqlMock({ defaultColumns: ['EDUCAT_BACK', 'education_desc'], rowCount: 3 });
    await h.execute(makeCtx('lookup', lookupData(), { default: ds('##in') }, qr));
    expect(findCall(qr, 'ALTER TABLE')).toBeUndefined();
    // 仍有預查欄位（tempdb.sys.columns）
    expect(findCall(qr, 'tempdb.sys.columns')).toBeDefined();
  });
});

// =====================================================================
// 二、UPDATEFROM — UPDATE...FROM 重構（🔴 第二高風險）
// =====================================================================
describe('P4b UPDATEFROM-UNIT (lookup-handler-mssql)', () => {
  const h = new LookupHandlerMssql();

  async function updateSql(over: Record<string, unknown> = {}): Promise<string> {
    const qr = createMssqlMock({ defaultColumns: ['EDUCAT_BACK'], rowCount: 3 });
    await h.execute(makeCtx('lookup', lookupData(over), { default: ds('##in') }, qr));
    const sql = qr.calls.find(
      (c: any) => typeof c.sql === 'string' && c.sql.startsWith('UPDATE _src'),
    )?.sql;
    expect(sql, 'expected an UPDATE _src ... FROM call').toBeDefined();
    return sql!;
  }

  it('UPDATEFROM-UNIT-001 (🔴 MUST-FIX): target 別名於 FROM 宣告（UPDATE _src ... FROM ##in AS _src JOIN）', async () => {
    const sql = await updateSql();
    // target 顯式併入 FROM/JOIN
    expect(sql).toMatch(/FROM\s+"##in"\s+AS\s+_src\s+JOIN\s+\(/);
    // 不得是 naive「UPDATE _src SET ... FROM (subquery) _lk WHERE」（_src 未經 FROM 宣告）
    expect(sql).not.toMatch(/FROM\s+\(SELECT/);
  });

  it('UPDATEFROM-UNIT-002: ::text 全數改 CAST/TRY_CAST（無殘留 ::text）', async () => {
    const sql = await updateSql();
    expect(sql).not.toContain('::text');
    expect(sql).toMatch(/TRY_CAST|CAST/);
  });

  it('UPDATEFROM-UNIT-003: 原 WHERE 比對條件（TRIM 雙邊）遷移至 JOIN...ON，兩操作元皆存在', async () => {
    const sql = await updateSql();
    // ON 之後同時含 match 欄位與 lookupMatch 欄位與 = 運算子
    const onPart = sql.slice(sql.indexOf(' ON '));
    expect(onPart).toContain('EDUCAT_BACK');
    expect(onPart).toContain('TBL_CD');
    expect(onPart).toContain('=');
    // TRIM 雙邊保留
    expect((sql.match(/TRIM\(/g) || []).length).toBeGreaterThanOrEqual(2);
  });
});

// =====================================================================
// 七、LOOKUP-STRATEGY — skip_row / default_value
// =====================================================================
describe('P4b SKIP-UNIT / DEFAULT-UNIT (lookup-handler-mssql)', () => {
  const h = new LookupHandlerMssql();

  it('SKIP-UNIT-001: DELETE 結構正確（🔴 偏差：兩段式 DELETE _src FROM ##in AS _src，非 DELETE FROM ##in AS _src）', async () => {
    const qr = createMssqlMock({ defaultColumns: ['EDUCAT_BACK'], rowCount: 2 });
    await h.execute(makeCtx('lookup', lookupData({ noMatchStrategy: 'skip_row' }), { default: ds('##in') }, qr));
    const del = findCall(qr, 'DELETE');
    expect(del).toBeDefined();
    // 兩段式：target 別名於 FROM 宣告（真實 MSSQL 唯一合法形式）
    expect(del).toMatch(/DELETE\s+_src\s+FROM\s+"##in"\s+AS\s+_src/);
    expect(del).toContain('WHERE NOT EXISTS');
    // ::text 已轉換
    expect(del).not.toContain('::text');
    expect(del).toMatch(/TRY_CAST|CAST/);
  });

  it('SKIP-UNIT-002: skip_row 之 UPDATE 骨幹與 UPDATEFROM 群組一致（同受 target-in-FROM 守門）', async () => {
    const qr = createMssqlMock({ defaultColumns: ['EDUCAT_BACK'], rowCount: 2 });
    await h.execute(makeCtx('lookup', lookupData({ noMatchStrategy: 'skip_row' }), { default: ds('##in') }, qr));
    const upd = qr.calls.find((c: any) => c.sql.startsWith('UPDATE _src'))?.sql;
    expect(upd).toBeDefined();
    expect(upd).toMatch(/FROM\s+"##in"\s+AS\s+_src\s+JOIN\s+\(/);
  });

  it('DEFAULT-UNIT-001: default_value → UPDATE ##in SET alias=@0 WHERE alias IS NULL（具名參數，無 FROM 重構）', async () => {
    const qr = createMssqlMock({ defaultColumns: ['EDUCAT_BACK'], rowCount: 3 });
    await h.execute(
      makeCtx('lookup', lookupData({ noMatchStrategy: 'default_value', defaultValue: 'X' }), { default: ds('##in') }, qr),
    );
    const dv = qr.calls.find(
      (c: any) => c.sql.includes('WHERE "education_desc" IS NULL'),
    );
    expect(dv).toBeDefined();
    expect(dv.sql).toContain('@0');
    expect(dv.sql).not.toContain('$1');
    expect(dv.params).toEqual(['X']);
  });
});

// =====================================================================
// 六、RESOLVE-003 (unit) — raw 表存在性檢查
// =====================================================================
describe('P4b RESOLVE-003 (lookup-handler-mssql, unit)', () => {
  const h = new LookupHandlerMssql();

  it('RESOLVE-003 (🔴): 存在性檢查用 INFORMATION_SCHEMA.TABLES 大寫 + @0，無小寫', async () => {
    const qr = createMssqlMock({ defaultColumns: ['EDUCAT_BACK'], rowCount: 3 });
    await h.execute(makeCtx('lookup', lookupData(), { default: ds('##in') }, qr));
    const chk = qr.calls.find((c: any) => c.sql.includes('INFORMATION_SCHEMA.TABLES'));
    expect(chk).toBeDefined();
    expect(chk.sql).toContain('table_name = @0');
    expect(chk.params).toEqual(['raw_edu']);
    for (const c of qr.calls) expect(c.sql.includes('information_schema')).toBe(false);
  });

  it('RESOLVE-003b: 對照表不存在 → 拋「對照表 X 不存在」（訊息格式與 PG 版相同）', async () => {
    const qr = createMssqlMock({ defaultColumns: ['EDUCAT_BACK'], tableExists: false, rowCount: 3 });
    await expect(
      h.execute(makeCtx('lookup', lookupData({ lookupSource: 'raw_missing' }), { default: ds('##in') }, qr)),
    ).rejects.toThrow('對照表 raw_missing 不存在');
  });
});

// =====================================================================
// 八、LOOKUP-UNIT — 通用防禦邏輯
// =====================================================================
describe('P4b LOOKUP-UNIT (lookup-handler-mssql)', () => {
  const h = new LookupHandlerMssql();

  it('LOOKUP-UNIT-001: 缺 matchColumn/lookupMatchColumn/outputColumns 任一 → 拋錯', async () => {
    const qr = createMssqlMock({ rowCount: 3 });
    await expect(
      h.execute(makeCtx('lookup', lookupData({ matchColumn: undefined }), { default: ds('##in') }, qr)),
    ).rejects.toThrow('Lookup 節點缺少比對欄位（主表）');
    await expect(
      h.execute(makeCtx('lookup', lookupData({ lookupMatchColumn: undefined }), { default: ds('##in') }, qr)),
    ).rejects.toThrow('Lookup 節點缺少比對欄位（對照表）');
    await expect(
      h.execute(makeCtx('lookup', lookupData({ outputColumns: [] }), { default: ds('##in') }, qr)),
    ).rejects.toThrow('Lookup 節點缺少輸出欄位');
  });

  it('LOOKUP-UNIT-002: mainInput.rowCount===0 → emptyDataSet 短路，不執行 ALTER/UPDATE', async () => {
    const qr = createMssqlMock({ rowCount: 0 });
    const out = await h.execute(makeCtx('lookup', lookupData(), { default: ds('##in', 0) }, qr));
    expect(out.tempTable).toBe('');
    expect(out.rowCount).toBe(0);
    expect(findCall(qr, 'ALTER TABLE')).toBeUndefined();
    expect(qr.calls.find((c: any) => c.sql.startsWith('UPDATE'))).toBeUndefined();
  });

  it('LOOKUP-UNIT-003 (防禦性): dual-input mode 優先採 lookup-input tempTable，不觸發 resolve / 存在性檢查', async () => {
    const qr = createMssqlMock({ defaultColumns: ['EDUCAT_BACK'], rowCount: 3 });
    await h.execute(
      makeCtx('lookup', lookupData({ lookupSource: undefined, lookupFilter: '' }), {
        default: ds('##in'),
        'lookup-input': ds('##lk_up'),
      }, qr),
    );
    // 無 INFORMATION_SCHEMA.TABLES 存在性檢查
    expect(findCall(qr, 'INFORMATION_SCHEMA.TABLES')).toBeUndefined();
    // 子查詢引用 lookup-input 之 ## 表
    const upd = qr.calls.find((c: any) => c.sql.startsWith('UPDATE _src'))?.sql;
    expect(upd).toContain('"##lk_up"');
  });
});

// =====================================================================
// 五、MERGE-UNIT — merge-handler-mssql
// =====================================================================
describe('P4b MERGE-UNIT (merge-handler-mssql)', () => {
  const h = new MergeHandlerMssql();
  const cond = [{ leftColumn: 'CUSTID', rightColumn: 'CUSTID', operator: '=' }];

  function mergeCtx(qr: any, over: Record<string, unknown> = {}, inputs?: Record<string, DataSet>) {
    return makeCtx(
      'merge',
      { conditions: cond, ...over },
      inputs ?? { 'left-input': ds('##L'), 'right-input': ds('##R') },
      qr,
      { nodeId: 'm1', logId: 'abcd1234-5678' },
    );
  }

  it('MERGE-UNIT-001: CTAS → SELECT ... INTO ##（非 CREATE TEMP TABLE）', async () => {
    const qr = createMssqlMock({ columnsByTable: { '##L': ['CUSTID', 'lname'], '##R': ['CUSTID', 'rname'] }, rowCount: 3 });
    const r = await h.execute(mergeCtx(qr));
    const sql = intoSql(qr);
    expect(sql).toContain('INTO ##etl_tmp_m1_abcd1234');
    expect(sql).not.toContain('CREATE TEMP TABLE');
    expect(r.tempTable).toBe('##etl_tmp_m1_abcd1234');
  });

  it('MERGE-UNIT-002 (🔴): getColumns 改用 tempdb.sys.columns（無 information_schema.columns）', async () => {
    const qr = createMssqlMock({ columnsByTable: { '##L': ['CUSTID', 'lname'], '##R': ['CUSTID', 'rname'] }, rowCount: 3 });
    await h.execute(mergeCtx(qr));
    expect(qr.calls.some((c: any) => c.sql.includes('tempdb.sys.columns'))).toBe(true);
    for (const c of qr.calls) expect(c.sql.includes('information_schema.columns')).toBe(false);
  });

  it('MERGE-UNIT-003: FULL OUTER JOIN 結構保留', async () => {
    const qr = createMssqlMock({ columnsByTable: { '##L': ['CUSTID'], '##R': ['CUSTID'] }, rowCount: 3 });
    await h.execute(mergeCtx(qr));
    expect(intoSql(qr)).toContain('FULL OUTER JOIN');
  });

  it('MERGE-UNIT-004: 列數用 countMssqlTempTableRows（COUNT(*) AS cnt，無 ::int）', async () => {
    const qr = createMssqlMock({ columnsByTable: { '##L': ['CUSTID'], '##R': ['CUSTID'] }, rowCount: 9 });
    const r = await h.execute(mergeCtx(qr));
    const cnt = qr.calls.find((c: any) => c.sql.includes('COUNT(*)'));
    expect(cnt.sql).toContain('COUNT(*) AS cnt');
    for (const c of qr.calls) expect(c.sql.includes('::int')).toBe(false);
    expect(r.rowCount).toBe(9);
  });

  it('MERGE-UNIT-005: 缺 left-input/right-input 任一 → 拋錯', async () => {
    const qr = createMssqlMock({ rowCount: 3 });
    await expect(h.execute(mergeCtx(qr, {}, { 'right-input': ds('##R') }))).rejects.toThrow('缺少左側輸入');
    await expect(h.execute(mergeCtx(qr, {}, { 'left-input': ds('##L') }))).rejects.toThrow('缺少右側輸入');
  });

  it('MERGE-UNIT-006: JOIN key 不存在於欄位清單 → 拋錯（欄位清單改由 tempdb.sys.columns）', async () => {
    const qr = createMssqlMock({ columnsByTable: { '##L': ['other'], '##R': ['CUSTID'] }, rowCount: 3 });
    await expect(h.execute(mergeCtx(qr))).rejects.toThrow('JOIN key 欄位 CUSTID 不存在於左側');
  });

  it('MERGE-UNIT-007: 雙側 rowCount=0 → emptyDataSet 短路，不呼叫 createMssqlTempTable', async () => {
    const qr = createMssqlMock({ rowCount: 0 });
    const out = await h.execute(mergeCtx(qr, {}, { 'left-input': ds('##L', 0), 'right-input': ds('##R', 0) }));
    expect(out.tempTable).toBe('');
    expect(intoSql(qr)).toBeUndefined();
  });
});

// =====================================================================
// 四、DISPATCH-001 — nodeType 契約
// =====================================================================
describe('P4b DISPATCH-001 (nodeType 與 PG 版一致)', () => {
  it('MergeHandlerMssql.nodeType==="merge"、LookupHandlerMssql.nodeType==="lookup"，與 PG 版相等', () => {
    expect(new MergeHandlerMssql().nodeType).toBe('merge');
    expect(new MergeHandlerMssql().nodeType).toBe(new MergeHandler().nodeType);
    expect(new LookupHandlerMssql().nodeType).toBe('lookup');
    expect(new LookupHandlerMssql().nodeType).toBe(new LookupHandler().nodeType);
  });
});
