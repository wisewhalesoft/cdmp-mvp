/**
 * AD-E07-41 P4c — ETL Handler 群組三 MSSQL 版：UNIT 測試（mock QueryRunner，CI 恆常執行）。
 *
 * 覆蓋（測試設計 AD-E07-41-P4c-test.md）：
 *   DEDUP-UNIT-001..007 / DEDUP-EQ-001..003（throw/短路）/
 *   TLDEDUP-UNIT-001..003 / UPSERT-UNIT-001..005 /
 *   FULLMODE-UNIT-001..004 / PARTITION-UNIT-001..003 /
 *   CATALOG-UNIT-001..004 / LITERAL-UNIT-001/002/004/005 /
 *   DISPATCH-001/002/004。
 *
 * 手法：直接實例化 handler class（選項甲，不透過 dispatcher）；比對產出 SQL 文字之方言關鍵字。
 * DISPATCH：構造 service（mock ConfigService）呼叫私有 createDispatcher()，以 getExecutor 驗證註冊之 class。
 */
import { describe, it, expect, vi } from 'vitest';
import { DedupHandlerMssql } from '../handlers/dedup-handler-mssql';
import { TargetLoadHandlerMssql } from '../handlers/target-load-handler-mssql';
import { DedupHandler } from '../handlers/dedup-handler';
import { TargetLoadHandler } from '../handlers/target-load-handler';
import { NodeExecutionContext, DataSet } from '../types';

// =====================================================================
// mock QueryRunner
// =====================================================================
interface ColMeta {
  name: string;
  type: string;
}
interface MockOpts {
  inputCols?: ColMeta[];
  targetCols?: string[];
  pkCols?: string[];
  notNullCols?: string[];
  count?: number;
  tableExists?: boolean;
}
function createMock(opts: MockOpts = {}) {
  const {
    inputCols = [],
    targetCols = [],
    pkCols = [],
    notNullCols = [],
    count = 0,
    tableExists = true,
  } = opts;
  const calls: { sql: string; params?: any[] }[] = [];
  const query = vi.fn(async (sql: string, params?: any[]) => {
    calls.push({ sql, params });
    if (sql.includes('tempdb.sys.columns')) {
      return inputCols.map((c, i) => ({ column_name: c.name, column_id: i + 1, data_type: c.type }));
    }
    if (sql.includes('INFORMATION_SCHEMA.TABLES')) {
      return tableExists ? [{ table_name: 'x' }] : [];
    }
    if (sql.includes('TABLE_CONSTRAINTS')) {
      return pkCols.map((c) => ({ column_name: c }));
    }
    if (sql.includes('is_nullable')) {
      return notNullCols.map((c) => ({ column_name: c }));
    }
    if (sql.includes('INFORMATION_SCHEMA.COLUMNS')) {
      return targetCols.map((c) => ({ column_name: c }));
    }
    if (sql.includes('COUNT(*)')) {
      return [{ cnt: count }];
    }
    return [];
  });
  // P5g：handler 交易包裝需 transaction API（真實 QueryRunner 皆有）；no-op stub 不影響 SQL 生成斷言。
  const mock: any = { query, calls, isTransactionActive: false };
  mock.startTransaction = vi.fn(async () => { mock.isTransactionActive = true; });
  mock.commitTransaction = vi.fn(async () => { mock.isTransactionActive = false; });
  mock.rollbackTransaction = vi.fn(async () => { mock.isTransactionActive = false; });
  return mock;
}

function makeCtx(
  nodeType: string,
  nodeData: Record<string, unknown>,
  inputs: Record<string, DataSet>,
  qr: any,
  opts: { nodeId?: string; logId?: string; pipelineId?: string } = {},
): NodeExecutionContext {
  return {
    node: {
      id: opts.nodeId ?? 'n1',
      type: 'pipelineNode',
      position: { x: 0, y: 0 },
      data: { nodeType, label: 'T', ...nodeData },
    },
    inputs,
    pipelineId: opts.pipelineId ?? '11111111-2222-3333-4444-555555555555',
    logId: opts.logId ?? 'abcd1234-ffff',
    isTestRun: false,
    queryRunner: qr,
  };
}

const allSql = (calls: { sql: string }[]) => calls.map((c) => c.sql).join('\n;;\n');

// =====================================================================
// 一、DEDUP UNIT
// =====================================================================
describe('P4c DEDUP UNIT', () => {
  const dedupCols = ['CUSTO_NO', 'UPDATE_DATE', 'CUST_NAME'];
  async function runDedup(over: Partial<MockOpts> = {}) {
    const qr = createMock({ inputCols: dedupCols.map((n) => ({ name: n, type: 'varchar' })), count: 2, ...over });
    const h = new DedupHandlerMssql();
    const ctx = makeCtx(
      'dedup',
      { keyColumns: ['CUSTO_NO'], timestampColumn: 'UPDATE_DATE' },
      { default: { tempTable: '##in', rowCount: 3 } },
      qr,
      { nodeId: 'd1' },
    );
    const res = await h.execute(ctx);
    return { qr, res, sql: allSql(qr.calls) };
  }

  it('UNIT-001：含 IDENTITY(INT,1,1) AS _seq + INTO ##raw_ 中繼表', async () => {
    const { sql } = await runDedup();
    expect(sql).toMatch(/IDENTITY\(INT,1,1\)\s+AS\s+_seq/);
    expect(sql).toMatch(/INTO\s+##raw_etl_tmp_d1_abcd1234/);
  });

  it('UNIT-002：ROW_NUMBER() OVER(PARTITION BY <key> ORDER BY <ts> DESC, ..., _seq ASC) + WHERE rn = 1', async () => {
    const { sql } = await runDedup();
    expect(sql).toMatch(
      /ROW_NUMBER\(\)\s+OVER\s*\(\s*PARTITION BY "CUSTO_NO"\s+ORDER BY "UPDATE_DATE" DESC,.*_seq ASC\s*\)/s,
    );
    expect(sql).toMatch(/WHERE rn = 1/);
  });

  it('UNIT-003：NULLS LAST 顯式 CASE WHEN <ts> IS NULL THEN 1 ELSE 0 END', async () => {
    const { sql } = await runDedup();
    expect(sql).toContain('CASE WHEN "UPDATE_DATE" IS NULL THEN 1 ELSE 0 END');
  });

  it('UNIT-004：getColumns 用 tempdb.sys.columns（非 information_schema.columns）', async () => {
    const { sql } = await runDedup();
    expect(sql).toContain('tempdb.sys.columns');
    expect(sql.includes('information_schema.columns')).toBe(false);
  });

  it('UNIT-005：列數 → COUNT(*)（countMssqlTempTableRows），無 PG 版 ::int', async () => {
    const { sql } = await runDedup();
    expect(sql).toMatch(/SELECT COUNT\(\*\) AS cnt FROM ##etl_tmp_d1_abcd1234/);
    expect(sql.includes('::int')).toBe(false);
  });

  it('UNIT-006：雙引號識別碼沿用（QUOTE-003）', async () => {
    const { sql } = await runDedup();
    expect(sql).toContain('"CUSTO_NO"');
    expect(sql).toContain('"UPDATE_DATE"');
  });

  it('UNIT-007：##raw_<x> 與 ##<x> 兩張中繼表命名互不衝突', async () => {
    const { sql } = await runDedup();
    expect(sql).toContain('##raw_etl_tmp_d1_abcd1234');
    expect(sql).toContain('##etl_tmp_d1_abcd1234');
    // 最終輸出表名不含 raw_ 前綴
    expect(sql).toMatch(/INTO ##etl_tmp_d1_abcd1234 /);
  });

  it('EQ-001：key 欄位不存在 → 拋錯', async () => {
    await expect(runDedup({ inputCols: [{ name: 'UPDATE_DATE', type: 'varchar' }] })).rejects.toThrow(
      /key 欄位 CUSTO_NO 不存在/,
    );
  });

  it('EQ-002：timestamp 欄位不存在 → 拋錯', async () => {
    await expect(runDedup({ inputCols: [{ name: 'CUSTO_NO', type: 'varchar' }] })).rejects.toThrow(
      /時間戳.*UPDATE_DATE 不存在/,
    );
  });

  it('EQ-003：rowCount===0 → emptyDataSet 短路，不建任何 ## 表', async () => {
    const qr = createMock();
    const h = new DedupHandlerMssql();
    const ctx = makeCtx('dedup', { keyColumns: ['CUSTO_NO'], timestampColumn: 'UPDATE_DATE' }, { default: { tempTable: '', rowCount: 0 } }, qr);
    const res = await h.execute(ctx);
    expect(res).toEqual({ tempTable: '', rowCount: 0 });
    expect(qr.calls.length).toBe(0);
  });
});

// =====================================================================
// target-load 共用 fixture
// =====================================================================
const CC_INPUT: ColMeta[] = [
  { name: 'customer_id', type: 'uniqueidentifier' },
  { name: 'source_customer_no', type: 'varchar' },
  { name: 'customer_type_code', type: 'varchar' },
  { name: 'name', type: 'nvarchar' },
  { name: 'approved_income', type: 'int' },
  { name: 'data_source', type: 'varchar' },
];
const CC_TARGET = [
  'customer_id',
  'source_customer_no',
  'customer_type_code',
  'name',
  'approved_income',
  'data_source',
  '_etl_loaded_at',
  '_etl_pipeline_id',
];
const CC_NOTNULL = ['source_customer_no', 'customer_type_code', 'name'];

async function runUpsert(over: Partial<MockOpts> = {}) {
  const qr = createMock({
    inputCols: CC_INPUT,
    targetCols: CC_TARGET,
    notNullCols: CC_NOTNULL,
    count: 2,
    ...over,
  });
  const h = new TargetLoadHandlerMssql();
  const ctx = makeCtx(
    'target_load',
    { targetTable: 'customer_core', fullMode: false },
    { default: { tempTable: '##in', rowCount: 2 } },
    qr,
    { nodeId: 'tl1' },
  );
  const res = await h.execute(ctx);
  return { qr, res, sql: allSql(qr.calls) };
}

// =====================================================================
// 三、UPSERT UNIT
// =====================================================================
describe('P4c UPSERT UNIT', () => {
  it('UNIT-001：零 ON CONFLICT / DO UPDATE SET / EXCLUDED 字面', async () => {
    const { sql } = await runUpsert();
    expect(sql).not.toMatch(/ON CONFLICT/i);
    expect(sql).not.toMatch(/DO UPDATE SET/i);
    expect(sql).not.toMatch(/EXCLUDED/i);
  });

  it('UNIT-002：兩段式 — UPDATE ... FROM customer_core tgt JOIN ##..._dq src + 獨立 INSERT ... WHERE NOT EXISTS', async () => {
    const { sql } = await runUpsert();
    expect(sql).toMatch(
      /UPDATE tgt SET .* FROM "customer_core" tgt JOIN "##etl_tmp_tl1_abcd1234_dq" src ON tgt\."source_customer_no" = src\."source_customer_no"/s,
    );
    expect(sql).toMatch(
      /INSERT INTO "customer_core" \(.*\) SELECT .* FROM "##etl_tmp_tl1_abcd1234_dq" src WHERE .* AND NOT EXISTS \(SELECT 1 FROM "customer_core" tgt WHERE tgt\."source_customer_no" = src\."source_customer_no"\)/s,
    );
  });

  it('UNIT-003：SET 子句以 src."col" 引用（非 EXCLUDED），非主鍵欄逐一無遺漏', async () => {
    const { sql } = await runUpsert();
    // customer_type_code / name / approved_income / data_source 皆應以 src. 更新；customer_id / source_customer_no 排除
    expect(sql).toContain('"customer_type_code" = src."customer_type_code"');
    expect(sql).toContain('"name" = src."name"');
    expect(sql).toContain('"data_source" = src."data_source"');
    expect(sql).not.toContain('"customer_id" = src."customer_id"');
    expect(sql).not.toContain('"source_customer_no" = src."source_customer_no" ,'); // 不出現在 SET
  });

  it('UNIT-004：ghost gate LENGTH(TRIM(...)) → LEN(TRIM(...))', async () => {
    const { sql } = await runUpsert();
    expect(sql).toContain('LEN(TRIM(src."source_customer_no")) >= 5');
    expect(sql.includes('LENGTH(TRIM')).toBe(false);
  });

  it('UNIT-005：notNullTargetCols 用 INFORMATION_SCHEMA.COLUMNS（大寫）+ IS_NULLABLE + 具名參數', async () => {
    const { qr } = await runUpsert();
    const nnCall = qr.calls.find((c: any) => c.sql.includes('is_nullable'));
    expect(nnCall).toBeTruthy();
    expect(nnCall.sql).toContain('INFORMATION_SCHEMA.COLUMNS');
    expect(nnCall.sql).toContain("is_nullable = 'NO'");
    expect(nnCall.sql).toContain('@0');
    expect(nnCall.params).toEqual(['customer_core']);
    expect(nnCall.sql.includes('information_schema')).toBe(false);
  });
});

// =====================================================================
// 二、TLDEDUP UNIT（內部 DISTINCT ON tie-breaker）
// =====================================================================
describe('P4c TLDEDUP UNIT', () => {
  async function runFullModeComposite() {
    const qr = createMock({
      inputCols: [
        { name: 'orgno', type: 'varchar' },
        { name: 'appl_no', type: 'varchar' },
        { name: 'payload', type: 'varchar' },
      ],
      targetCols: ['orgno', 'appl_no', 'payload'],
      pkCols: ['orgno', 'appl_no'],
      count: 3,
    });
    const h = new TargetLoadHandlerMssql();
    const ctx = makeCtx('target_load', { targetTable: 'ob_pool_data', fullMode: true }, { default: { tempTable: '##in', rowCount: 4 } }, qr, { nodeId: 'tl1' });
    await h.execute(ctx);
    return allSql(qr.calls);
  }

  it('UNIT-001：fullMode PK dedup 含顯式 _seq tie-breaker，非樸素 ORDER BY <pk>', async () => {
    const sql = await runFullModeComposite();
    expect(sql).toMatch(/IDENTITY\(INT,1,1\)\s+AS\s+_seq/);
    expect(sql).toMatch(/ROW_NUMBER\(\)\s+OVER\s*\(\s*PARTITION BY "orgno", "appl_no"\s+ORDER BY _seq ASC\s*\)/);
    // 不得是樸素 ORDER BY 僅含 pk
    expect(sql).not.toMatch(/ORDER BY "orgno", "appl_no"\s*\)/);
  });

  it('UNIT-002：UPSERT source_customer_no dedup 同含顯式 _seq tie-breaker', async () => {
    const { sql } = await runUpsert();
    expect(sql).toMatch(/IDENTITY\(INT,1,1\)\s+AS\s+_seq/);
    expect(sql).toMatch(/ROW_NUMBER\(\)\s+OVER\s*\(\s*PARTITION BY "source_customer_no"\s+ORDER BY _seq ASC\s*\)/);
  });

  it('UNIT-003：兩處 tie-breaker 機制與 §一 DEDUP 一致（同 IDENTITY(INT,1,1)+_seq 手法）', async () => {
    const fullSql = await runFullModeComposite();
    const { sql: upSql } = await runUpsert();
    for (const s of [fullSql, upSql]) {
      expect(s).toContain('IDENTITY(INT,1,1) AS _seq');
      expect(s).toContain('ORDER BY _seq ASC');
    }
  });
});

// =====================================================================
// 四、FULLMODE UNIT
// =====================================================================
describe('P4c FULLMODE UNIT', () => {
  async function runFullSinglePk() {
    const qr = createMock({
      inputCols: [
        { name: 'calendar_date', type: 'date' },
        { name: 'rest_flg', type: 'varchar' },
      ],
      targetCols: ['calendar_date', 'rest_flg'],
      pkCols: ['calendar_date'],
      count: 2,
    });
    const h = new TargetLoadHandlerMssql();
    const ctx = makeCtx('target_load', { targetTable: 'ob_calendar', fullMode: true }, { default: { tempTable: '##in', rowCount: 2 } }, qr, { nodeId: 'tl1' });
    await h.execute(ctx);
    return { qr, sql: allSql(qr.calls) };
  }

  it('UNIT-001：getPrimaryKeyColumns 用大寫 INFORMATION_SCHEMA.TABLE_CONSTRAINTS/KEY_COLUMN_USAGE + @0', async () => {
    const { qr } = await runFullSinglePk();
    const pkCall = qr.calls.find((c: any) => c.sql.includes('TABLE_CONSTRAINTS'));
    expect(pkCall).toBeTruthy();
    expect(pkCall.sql).toContain('INFORMATION_SCHEMA.TABLE_CONSTRAINTS');
    expect(pkCall.sql).toContain('INFORMATION_SCHEMA.KEY_COLUMN_USAGE');
    expect(pkCall.sql).toContain('@0');
    expect(pkCall.sql.includes('information_schema')).toBe(false);
  });

  it('UNIT-002：PK 查詢依 ordinal_position 排序（composite PK 順序）', async () => {
    const { qr } = await runFullSinglePk();
    const pkCall = qr.calls.find((c: any) => c.sql.includes('TABLE_CONSTRAINTS'));
    expect(pkCall.sql).toContain('ORDER BY kcu.ordinal_position');
  });

  it('UNIT-003：TRUNCATE TABLE 語法沿用', async () => {
    const { sql } = await runFullSinglePk();
    expect(sql).toContain('TRUNCATE TABLE "ob_calendar"');
  });

  it('UNIT-004：單條 INSERT...SELECT + 雙引號識別碼', async () => {
    const { sql } = await runFullSinglePk();
    expect(sql).toMatch(/INSERT INTO "ob_calendar" \("calendar_date", "rest_flg"\) SELECT "calendar_date", "rest_flg" FROM "##/);
  });
});

// =====================================================================
// 五、PARTITION UNIT
// =====================================================================
describe('P4c PARTITION UNIT', () => {
  async function runPartition(over: Record<string, unknown> = {}) {
    const qr = createMock({
      inputCols: [
        { name: 'list_no', type: 'varchar' },
        { name: 'orgno', type: 'varchar' },
      ],
      targetCols: ['list_no', 'orgno', 'data_source'],
      count: 1,
    });
    const h = new TargetLoadHandlerMssql();
    const ctx = makeCtx(
      'target_load',
      { targetTable: 'ob_pool_data_list', loadMode: 'partition_replace', partitionColumn: 'data_source', partitionValue: 'etl_load', ...over },
      { default: { tempTable: '##in', rowCount: 1 } },
      qr,
      { nodeId: 'tl1' },
    );
    const res = await h.execute(ctx);
    return { qr, res, sql: allSql(qr.calls) };
  }

  it('UNIT-001：DELETE FROM target WHERE "<partitionColumn>" = \'<value>\'', async () => {
    const { sql } = await runPartition();
    expect(sql).toContain(`DELETE FROM "ob_pool_data_list" WHERE "data_source" = 'etl_load'`);
  });

  it('UNIT-002：INSERT...SELECT 含字面 partitionValue 附加欄位', async () => {
    const { sql } = await runPartition();
    expect(sql).toMatch(/SELECT "list_no", "orgno", 'etl_load' AS "data_source" FROM "##/);
  });

  it('UNIT-003：partitionColumn/partitionValue 未設定 → 拋錯', async () => {
    await expect(runPartition({ partitionColumn: undefined })).rejects.toThrow(/partition_replace 模式需設定/);
  });
});

// =====================================================================
// 六、CATALOG UNIT
// =====================================================================
describe('P4c CATALOG UNIT', () => {
  it('UNIT-001：## 輸入暫存表欄位內省用 tempdb.sys.columns', async () => {
    const { qr } = await runUpsert();
    const inputMetaCall = qr.calls.find((c: any) => c.sql.includes('tempdb.sys.columns'));
    expect(inputMetaCall).toBeTruthy();
    expect(inputMetaCall.params).toEqual(['##in']);
  });

  it('UNIT-002：真實 target 表欄位用 INFORMATION_SCHEMA.COLUMNS（大寫）+ 具名參數（非 tempdb.sys.columns）', async () => {
    const { qr } = await runUpsert();
    const realColCall = qr.calls.find(
      (c: any) => c.sql.includes('INFORMATION_SCHEMA.COLUMNS') && c.sql.includes('ORDER BY ordinal_position') && !c.sql.includes('is_nullable'),
    );
    expect(realColCall).toBeTruthy();
    expect(realColCall.params).toEqual(['customer_core']);
    // target 表不得誤用 tempdb.sys.columns
    const tempdbForTarget = qr.calls.find((c: any) => c.sql.includes('tempdb.sys.columns') && c.params?.[0] === 'customer_core');
    expect(tempdbForTarget).toBeUndefined();
  });

  it('UNIT-003：varcharColumns MSSQL 型別集合 — varchar/nvarchar 套 NULLIF(TRIM())，int 不套', async () => {
    const { sql } = await runUpsert();
    // name(nvarchar) / customer_type_code(varchar) 應套 NULLIF(TRIM())
    expect(sql).toContain('NULLIF(TRIM("name"), \'\') AS "name"');
    expect(sql).toContain('NULLIF(TRIM("customer_type_code"), \'\') AS "customer_type_code"');
    // approved_income(int) 不套 TRIM，原樣引用
    expect(sql).not.toContain('TRIM("approved_income")');
    expect(sql).toMatch(/, "approved_income"[ ,]/);
  });

  it('UNIT-004：target 表存在性檢查用 INFORMATION_SCHEMA.TABLES（大寫）+ 具名參數', async () => {
    const { qr } = await runUpsert();
    const tblCall = qr.calls.find((c: any) => c.sql.includes('INFORMATION_SCHEMA.TABLES'));
    expect(tblCall).toBeTruthy();
    expect(tblCall.sql).toContain('@0');
    expect(tblCall.params).toEqual(['customer_core']);
  });
});

// =====================================================================
// 八、LITERAL UNIT
// =====================================================================
describe('P4c LITERAL UNIT', () => {
  it('UNIT-001：_etl_loaded_at → CAST(... AS datetime2)', async () => {
    const { sql } = await runUpsert();
    expect(sql).toMatch(/CAST\('[^']*' AS datetime2\) AS "_etl_loaded_at"/);
    expect(sql.includes('::TIMESTAMP')).toBe(false);
  });

  it('UNIT-002：_etl_pipeline_id → CAST(... AS uniqueidentifier)', async () => {
    const { sql } = await runUpsert();
    expect(sql).toMatch(/CAST\('11111111-2222-3333-4444-555555555555' AS uniqueidentifier\) AS "_etl_pipeline_id"/);
    expect(sql.includes('::UUID')).toBe(false);
  });

  it('UNIT-004：NULLIF(TRIM(col), \'\') 結構原樣保留（ANSI）', async () => {
    const { sql } = await runUpsert();
    expect(sql).toMatch(/NULLIF\(TRIM\("[^"]+"\), ''\)/);
  });

  it('UNIT-005：字面值單引號逸出（partitionValue 含單引號）', async () => {
    const qr = createMock({ inputCols: [{ name: 'id', type: 'varchar' }], targetCols: ['id', 'data_source'], count: 1 });
    const h = new TargetLoadHandlerMssql();
    const ctx = makeCtx('target_load', { targetTable: 't', loadMode: 'partition_replace', partitionColumn: 'data_source', partitionValue: "a'b" }, { default: { tempTable: '##in', rowCount: 1 } }, qr, { nodeId: 'tl1' });
    await h.execute(ctx);
    const sql = allSql(qr.calls);
    expect(sql).toContain(`= 'a''b'`);
  });
});

// =====================================================================
// 九、DISPATCH UNIT
// =====================================================================
import { EtlPipelineExecutionService } from '../../etl-pipeline-execution.service';
import {
  ExtractHandlerMssql,
  MergeHandlerMssql,
  DedupHandlerMssql as DedupMssqlBarrel,
  TypeCastHandlerMssql,
  DerivedFieldHandlerMssql,
  FieldMappingHandlerMssql,
  ConditionalHandlerMssql,
  TargetLoadHandlerMssql as TargetLoadMssqlBarrel,
  LookupHandlerMssql,
  ExtractHandler,
  DedupHandler as DedupPgBarrel,
  TargetLoadHandler as TargetLoadPgBarrel,
} from '../index';

function makeService(dbType: string | undefined) {
  const cfg = { get: (_k: string, d?: unknown) => dbType ?? d } as any;
  return new EtlPipelineExecutionService(null as any, null as any, null as any, null as any, cfg);
}
function dispatcherOf(svc: any) {
  return svc.createDispatcher();
}

describe('P4c DISPATCH UNIT', () => {
  const NINE: Array<[string, any, any]> = [
    ['raw_data_extract', ExtractHandlerMssql, ExtractHandler],
    ['merge', MergeHandlerMssql, undefined],
    ['dedup', DedupMssqlBarrel, DedupPgBarrel],
    ['type_cast', TypeCastHandlerMssql, undefined],
    ['derived_field', DerivedFieldHandlerMssql, undefined],
    ['field_mapping', FieldMappingHandlerMssql, undefined],
    ['conditional', ConditionalHandlerMssql, undefined],
    ['target_load', TargetLoadMssqlBarrel, TargetLoadPgBarrel],
    ['lookup', LookupHandlerMssql, undefined],
  ];

  it('DISPATCH-001：DB_TYPE=mssql → 9 個 handler 皆為 *HandlerMssql 實例', () => {
    const d = dispatcherOf(makeService('mssql'));
    for (const [nodeType, MssqlClass] of NINE) {
      expect(d.getExecutor(nodeType)).toBeInstanceOf(MssqlClass);
    }
  });

  it('DISPATCH-002：DedupHandlerMssql.nodeType===dedup、TargetLoadHandlerMssql.nodeType===target_load（與 PG 相等）', () => {
    expect(new DedupMssqlBarrel().nodeType).toBe('dedup');
    expect(new DedupPgBarrel().nodeType).toBe('dedup');
    expect(new TargetLoadMssqlBarrel().nodeType).toBe('target_load');
    expect(new TargetLoadPgBarrel().nodeType).toBe('target_load');
  });

  it('DISPATCH-004：sqlite/postgres/未設定 → 沿用 PG handler（預設分支不變）', () => {
    for (const dbType of ['sqlite', 'postgres', undefined]) {
      const d = dispatcherOf(makeService(dbType));
      expect(d.getExecutor('dedup')).toBeInstanceOf(DedupPgBarrel);
      expect(d.getExecutor('dedup')).not.toBeInstanceOf(DedupMssqlBarrel);
      expect(d.getExecutor('target_load')).toBeInstanceOf(TargetLoadPgBarrel);
    }
  });
});

// =====================================================================
// REG-002（PG 原檔語意不被改為 mssql）— 快速交叉確認（完整靜態守門見 static spec）
// =====================================================================
describe('P4c REG-002 (PG handler 未被 mssql 化)', () => {
  it('PG DedupHandler/TargetLoadHandler nodeType 不變', () => {
    expect(new DedupHandler().nodeType).toBe('dedup');
    expect(new TargetLoadHandler().nodeType).toBe('target_load');
  });
});
