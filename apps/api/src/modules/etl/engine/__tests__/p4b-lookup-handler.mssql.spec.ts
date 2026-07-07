/**
 * AD-E07-41 P4b — lookup-handler-mssql 真實 MSSQL 整合。
 *
 * 涵蓋：ALTERCOL-MSSQL-001..003 / ALTERCOL-TRAP-001 / UPDATEFROM-TRAP-001 / UPDATEFROM-EQ-001..006 /
 *       LOOKUP-EQ-001..005 / SKIP-MSSQL-001..003 / DEFAULT-MSSQL-001 / RESOLVE-002 / CLEANUP-003..004。
 *
 * legacy mode 之對照表落 dbo（`raw_p4b_fixture_<hex>`，afterAll DROP）；主資料流為 `##`。
 */
import { restoreDbType, SKIP_REASON } from '@/database/__tests__/mssql-env-preload';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { LookupHandlerMssql } from '../handlers/lookup-handler-mssql';
import { ExtractHandlerMssql } from '../handlers/extract-handler-mssql';
import { MergeHandlerMssql } from '../handlers/merge-handler-mssql';
import { getMssqlTempTableColumns, dropMssqlTempTableIfExists } from '../handlers/mssql/temp-table.util';
import { NodeDispatcher } from '../node-dispatcher';
import { NodeOutputStore } from '../node-output-store';
import { PipelineRunner } from '../pipeline-runner';
import {
  connectMssql,
  teardownMssql,
  MssqlHarness,
  uniqueLogId,
  tempName,
  makeRealCtx,
  readAll,
  objectExists,
} from './_p4a-mssql-harness';
import { DataSet, PipelineDefinition, PipelineRunnerConfig } from '../types';

vi.setConfig({ testTimeout: 60000 });

const handler = new LookupHandlerMssql();
let h: MssqlHarness;
const tempTables: string[] = [];
const rawTables: string[] = [];
let ownDs = false;
let ownEt = false;
let resolveReady = false;

beforeAll(async () => {
  h = await connectMssql();
  if (!h.reachable || !h.qr) return;
  const qr = h.qr;
  const dsExists = (await qr.query(`SELECT OBJECT_ID('dbo.datasources') AS o`))[0].o != null;
  const etExists = (await qr.query(`SELECT OBJECT_ID('dbo.extraction_tasks') AS o`))[0].o != null;
  if (!dsExists && !etExists) {
    await qr.query(`CREATE TABLE dbo.datasources (id INT PRIMARY KEY, name NVARCHAR(200))`);
    await qr.query(
      `CREATE TABLE dbo.extraction_tasks (id INT IDENTITY(1,1) PRIMARY KEY, datasource_id INT,
         source_table NVARCHAR(200), raw_table_name NVARCHAR(200), last_execution_at DATETIME2 NULL)`,
    );
    ownDs = true;
    ownEt = true;
    resolveReady = true;
  }
}, 60000);

afterAll(async () => {
  if (h?.qr) {
    for (const t of tempTables) await dropMssqlTempTableIfExists(h.qr, t);
    for (const t of rawTables) {
      try {
        await h.qr.query(`IF OBJECT_ID('dbo.${t}') IS NOT NULL DROP TABLE dbo.${t}`);
      } catch {
        /* ignore */
      }
    }
    if (ownEt) await h.qr.query(`IF OBJECT_ID('dbo.extraction_tasks') IS NOT NULL DROP TABLE dbo.extraction_tasks`);
    if (ownDs) await h.qr.query(`IF OBJECT_ID('dbo.datasources') IS NOT NULL DROP TABLE dbo.datasources`);
  }
  await teardownMssql(h);
  restoreDbType();
});

function guard(ctx: { skip: () => void }): boolean {
  if (!h?.reachable || !h.qr) {
    console.warn('[P4b lookup] SKIP —', SKIP_REASON);
    ctx.skip();
    return false;
  }
  return true;
}

const hex = () => Math.random().toString(16).slice(2, 10);

/** 建立 `##` 主輸入 fixture。 */
async function inFx(valuesSql: string, rowCount: number): Promise<DataSet> {
  const name = '##lkin_' + hex();
  tempTables.push(name);
  await h.qr!.query(`SELECT * INTO ${name} FROM ${valuesSql}`);
  return { tempTable: name, rowCount };
}

/** 建立 dbo 對照表 fixture，回傳裸表名（供 lookupSource）。 */
async function rawFx(valuesSql: string): Promise<string> {
  const name = 'raw_p4b_fixture_' + hex();
  rawTables.push(name);
  await h.qr!.query(`SELECT * INTO dbo.${name} FROM ${valuesSql}`);
  return name;
}

async function runLookup(input: DataSet, data: Record<string, unknown>): Promise<DataSet> {
  return handler.execute(makeRealCtx(h.qr!, 'lookup', data, { default: input }, { nodeId: 'lk', logId: uniqueLogId() }));
}

// 標準對照表：(TBL_ID, TBL_CD, TBL_DESC1)，含同 TBL_CD 不同 TBL_ID（供 filter 測）
const EDU_VALUES = `(VALUES (N'A2',N'1',N'國小'),(N'A4',N'1',N'排除'),(N'A2',N'2',N'國中'),(N'A2',N'3',N'高中')) AS v("TBL_ID","TBL_CD","TBL_DESC1")`;

// =====================================================================
// 一、ALTERCOL — 真實 MSSQL
// =====================================================================
describe('P4b ALTERCOL-MSSQL', () => {
  it('ALTERCOL-MSSQL-001: 首次新增欄位成功，型別為 nvarchar（非 text）', async (ctx) => {
    if (!guard(ctx)) return;
    const raw = await rawFx(EDU_VALUES);
    const input = await inFx(`(VALUES (N'2')) AS v("EDUCAT_BACK")`, 1);
    await runLookup(input, {
      matchColumn: 'EDUCAT_BACK', lookupMatchColumn: 'TBL_CD',
      outputColumns: [{ lookupColumn: 'TBL_DESC1', outputAlias: 'education_desc' }],
      noMatchStrategy: 'null', lookupSource: raw, lookupFilter: `"TBL_ID" = 'A2'`,
    });
    const col = (await getMssqlTempTableColumns(h.qr!, input.tempTable)).find((c) => c.name === 'education_desc');
    expect(col).toBeDefined();
    const type = await h.qr!.query(
      `SELECT ty.name AS t FROM tempdb.sys.columns c JOIN tempdb.sys.types ty ON c.user_type_id = ty.user_type_id
        WHERE c.object_id = OBJECT_ID('tempdb..' + @0) AND c.name = 'education_desc'`,
      [input.tempTable],
    );
    expect(type[0].t).toBe('nvarchar');
  });

  it('ALTERCOL-MSSQL-002 (🔴 冪等): 同表同 alias 重複呼叫兩次，不拋錯，欄位僅一份', async (ctx) => {
    if (!guard(ctx)) return;
    const raw = await rawFx(EDU_VALUES);
    const input = await inFx(`(VALUES (N'2')) AS v("EDUCAT_BACK")`, 1);
    const data = {
      matchColumn: 'EDUCAT_BACK', lookupMatchColumn: 'TBL_CD',
      outputColumns: [{ lookupColumn: 'TBL_DESC1', outputAlias: 'education_desc' }],
      noMatchStrategy: 'null', lookupSource: raw, lookupFilter: `"TBL_ID" = 'A2'`,
    };
    await runLookup(input, data);
    await runLookup(input, data); // 第二次不得拋錯
    const dupes = (await getMssqlTempTableColumns(h.qr!, input.tempTable)).filter((c) => c.name === 'education_desc');
    expect(dupes.length).toBe(1);
  });

  it('ALTERCOL-MSSQL-003: 同表依序新增 5 個不同 alias，互不干擾', async (ctx) => {
    if (!guard(ctx)) return;
    const raw = await rawFx(EDU_VALUES);
    const input = await inFx(`(VALUES (N'2')) AS v("EDUCAT_BACK")`, 1);
    for (let i = 1; i <= 5; i++) {
      await runLookup(input, {
        matchColumn: 'EDUCAT_BACK', lookupMatchColumn: 'TBL_CD',
        outputColumns: [{ lookupColumn: 'TBL_DESC1', outputAlias: `desc_${i}` }],
        noMatchStrategy: 'null', lookupSource: raw, lookupFilter: `"TBL_ID" = 'A2'`,
      });
    }
    const cols = (await getMssqlTempTableColumns(h.qr!, input.tempTable)).map((c) => c.name);
    for (let i = 1; i <= 5; i++) expect(cols).toContain(`desc_${i}`);
  });

  it('ALTERCOL-TRAP-001 (🔴 陷阱佐證): naive ADD COLUMN IF NOT EXISTS ... TEXT 對真實 MSSQL 拋語法錯誤', async (ctx) => {
    if (!guard(ctx)) return;
    const probe = '##altertrap_' + hex();
    tempTables.push(probe);
    await h.qr!.query(`SELECT * INTO ${probe} FROM (VALUES (1)) AS v(a)`);
    // 手動組裝 naive PG 逐字語法（非呼叫 handler）
    const naive = 'ALTER TABLE ' + probe + ' ADD ' + 'COLUMN IF NOT EXISTS "x" ' + 'TEXT';
    await expect(h.qr!.query(naive)).rejects.toThrow();
  });
});

// =====================================================================
// 二、UPDATEFROM — 真實 MSSQL
// =====================================================================
describe('P4b UPDATEFROM-MSSQL', () => {
  const nullData = (raw: string, filter = '') => ({
    matchColumn: 'EDUCAT_BACK', lookupMatchColumn: 'TBL_CD',
    outputColumns: [{ lookupColumn: 'TBL_DESC1', outputAlias: 'education_desc' }],
    noMatchStrategy: 'null', lookupSource: raw, lookupFilter: filter,
  });

  it('UPDATEFROM-TRAP-001 (🔴 陷阱佐證): naive UPDATE _src FROM (sub)（未宣告 target）拋錯', async (ctx) => {
    if (!guard(ctx)) return;
    await expect(
      h.qr!.query(`UPDATE _src SET z = _lk.y FROM (SELECT 1 AS y) _lk WHERE 1=1`),
    ).rejects.toThrow();
  });

  it('UPDATEFROM-EQ-001 (🔴 旗艦, 防笛卡兒積): 多列逐列取得自身對應值', async (ctx) => {
    if (!guard(ctx)) return;
    // 對照表無 filter 干擾：代碼 1/2/3 各對應不同 desc
    const raw = await rawFx(`(VALUES (N'1',N'一'),(N'2',N'二'),(N'3',N'三')) AS v("TBL_CD","TBL_DESC1")`);
    const input = await inFx(`(VALUES (N'1'),(N'2'),(N'3'),(N'2'),(N'9')) AS v("EDUCAT_BACK")`, 5);
    await runLookup(input, nullData(raw));
    const rows = await readAll(h.qr!, input.tempTable);
    const byCode = (c: string) => rows.filter((r: any) => r.EDUCAT_BACK === c).map((r: any) => r.education_desc);
    expect(byCode('1')).toEqual(['一']);
    expect(byCode('2')).toEqual(['二', '二']); // 重複代碼皆正確、非誤填同值
    expect(byCode('3')).toEqual(['三']);
    expect(byCode('9')).toEqual([null]); // 無匹配 → NULL
    expect(rows.length).toBe(5); // UPDATE 不改變列數
  });

  it('UPDATEFROM-EQ-002: 未匹配列維持 NULL（null 策略 LEFT JOIN 語意）', async (ctx) => {
    if (!guard(ctx)) return;
    const raw = await rawFx(`(VALUES (N'1',N'一')) AS v("TBL_CD","TBL_DESC1")`);
    const input = await inFx(`(VALUES (N'1'),(N'9')) AS v("EDUCAT_BACK")`, 2);
    await runLookup(input, nullData(raw));
    const rows = await readAll(h.qr!, input.tempTable, 'EDUCAT_BACK');
    expect(rows.find((r: any) => r.EDUCAT_BACK === '9').education_desc).toBeNull();
  });

  it('UPDATEFROM-EQ-003 (🔴 DoD, lookupFilter): 同 TBL_CD 不同 TBL_ID，filter 排除者不誤配', async (ctx) => {
    if (!guard(ctx)) return;
    const raw = await rawFx(EDU_VALUES); // (A2,1,國小) 與 (A4,1,排除) 同 TBL_CD='1'
    const input = await inFx(`(VALUES (N'1')) AS v("EDUCAT_BACK")`, 1);
    await runLookup(input, nullData(raw, `"TBL_ID" = 'A2'`));
    const rows = await readAll(h.qr!, input.tempTable);
    expect(rows[0].education_desc).toBe('國小'); // A2 之列，絕非 A4 的「排除」
  });

  it('UPDATEFROM-EQ-004: TRIM 雙邊空白去除後比對成功', async (ctx) => {
    if (!guard(ctx)) return;
    const raw = await rawFx(`(VALUES (N'1',N'一')) AS v("TBL_CD","TBL_DESC1")`);
    const input = await inFx(`(VALUES (N' 1 ')) AS v("EDUCAT_BACK")`, 1);
    await runLookup(input, nullData(raw));
    const rows = await readAll(h.qr!, input.tempTable);
    expect(rows[0].education_desc).toBe('一');
  });

  it('UPDATEFROM-EQ-005: filter 使子查詢為空 → 全部 NULL，不拋錯，列數不變', async (ctx) => {
    if (!guard(ctx)) return;
    const raw = await rawFx(EDU_VALUES);
    const input = await inFx(`(VALUES (N'1'),(N'2')) AS v("EDUCAT_BACK")`, 2);
    await runLookup(input, nullData(raw, `"TBL_ID" = 'ZZ'`)); // 無此 TBL_ID → 空集合
    const rows = await readAll(h.qr!, input.tempTable);
    expect(rows.every((r: any) => r.education_desc === null)).toBe(true);
    expect(rows.length).toBe(2);
  });

  it('UPDATEFROM-EQ-006: 中文 desc 輸出正確 round-trip', async (ctx) => {
    if (!guard(ctx)) return;
    const raw = await rawFx(`(VALUES (N'A',N'借新還舊')) AS v("TBL_CD","TBL_DESC1")`);
    const input = await inFx(`(VALUES (N'A')) AS v("EDUCAT_BACK")`, 1);
    await runLookup(input, nullData(raw));
    const rows = await readAll(h.qr!, input.tempTable);
    expect(rows[0].education_desc).toBe('借新還舊');
  });
});

// =====================================================================
// 八、LOOKUP-EQ — 真實代表情境
// =====================================================================
describe('P4b LOOKUP-EQ', () => {
  it('LOOKUP-EQ-001 (🔴 DoD, 仿 lk_edu1): 代碼對照 + lookupFilter + 中文 desc', async (ctx) => {
    if (!guard(ctx)) return;
    const raw = await rawFx(EDU_VALUES);
    const input = await inFx(`(VALUES (N'2'),(N'9')) AS v("EDUCAT_BACK")`, 2);
    await runLookup(input, {
      matchColumn: 'EDUCAT_BACK', lookupMatchColumn: 'TBL_CD',
      outputColumns: [{ lookupColumn: 'TBL_DESC1', outputAlias: 'education_desc' }],
      noMatchStrategy: 'null', lookupSource: raw, lookupFilter: `"TBL_ID" = 'A2'`,
    });
    const rows = await readAll(h.qr!, input.tempTable, 'EDUCAT_BACK');
    expect(rows.find((r: any) => r.EDUCAT_BACK === '2').education_desc).toBe('國中');
    expect(rows.find((r: any) => r.EDUCAT_BACK === '9').education_desc).toBeNull();
  });

  it('LOOKUP-EQ-002 (仿 lk_hcity, 無 filter): 郵遞區號對照正確', async (ctx) => {
    if (!guard(ctx)) return;
    const raw = await rawFx(`(VALUES (N'100',N'台北中正'),(N'220',N'新北板橋')) AS v("POSTAL_NO","POSTAL_ADD")`);
    const input = await inFx(`(VALUES (N'100'),(N'220')) AS v("HCITY")`, 2);
    await runLookup(input, {
      matchColumn: 'HCITY', lookupMatchColumn: 'POSTAL_NO',
      outputColumns: [{ lookupColumn: 'POSTAL_ADD', outputAlias: 'hcity_desc' }],
      noMatchStrategy: 'null', lookupSource: raw, lookupFilter: '',
    });
    const rows = await readAll(h.qr!, input.tempTable, 'HCITY');
    expect(rows.map((r: any) => r.hcity_desc)).toEqual(['台北中正', '新北板橋']);
  });

  it('LOOKUP-EQ-003 (🔴 規模, 微縮 31 節點): 5 個 lookup 依序對同一 ## 各加 1 欄，值各自正確', async (ctx) => {
    if (!guard(ctx)) return;
    const raw = await rawFx(`(VALUES (N'K',N'val-K')) AS v("TBL_CD","TBL_DESC1")`);
    const input = await inFx(`(VALUES (N'K')) AS v("M")`, 1);
    const firstTable = input.tempTable;
    for (let i = 1; i <= 5; i++) {
      const out = await runLookup(input, {
        matchColumn: 'M', lookupMatchColumn: 'TBL_CD',
        outputColumns: [{ lookupColumn: 'TBL_DESC1', outputAlias: `enrich_${i}` }],
        noMatchStrategy: 'null', lookupSource: raw, lookupFilter: '',
      });
      expect(out.tempTable).toBe(firstTable); // 原地修改，同一張表
    }
    const rows = await readAll(h.qr!, firstTable);
    for (let i = 1; i <= 5; i++) expect(rows[0][`enrich_${i}`]).toBe('val-K');
  });

  it('LOOKUP-EQ-004: lookup 回傳與上游相同 tempTable（in-place 語意）', async (ctx) => {
    if (!guard(ctx)) return;
    const raw = await rawFx(`(VALUES (N'1',N'一')) AS v("TBL_CD","TBL_DESC1")`);
    const input = await inFx(`(VALUES (N'1')) AS v("EDUCAT_BACK")`, 1);
    const out = await runLookup(input, {
      matchColumn: 'EDUCAT_BACK', lookupMatchColumn: 'TBL_CD',
      outputColumns: [{ lookupColumn: 'TBL_DESC1', outputAlias: 'd' }],
      noMatchStrategy: 'null', lookupSource: raw, lookupFilter: '',
    });
    expect(out.tempTable).toBe(input.tempTable);
    expect(out.rowCount).toBe(1);
  });

  it('LOOKUP-EQ-005: 中文 matchColumn 值於比對與輸出皆正確 round-trip', async (ctx) => {
    if (!guard(ctx)) return;
    const raw = await rawFx(`(VALUES (N'台北',N'城市A')) AS v("TBL_CD","TBL_DESC1")`);
    const input = await inFx(`(VALUES (N'台北')) AS v("ADDR")`, 1);
    await runLookup(input, {
      matchColumn: 'ADDR', lookupMatchColumn: 'TBL_CD',
      outputColumns: [{ lookupColumn: 'TBL_DESC1', outputAlias: 'city_desc' }],
      noMatchStrategy: 'null', lookupSource: raw, lookupFilter: '',
    });
    const rows = await readAll(h.qr!, input.tempTable);
    expect(rows[0].city_desc).toBe('城市A');
  });
});

// =====================================================================
// 七、LOOKUP-STRATEGY — skip_row / default_value 真實 MSSQL
// =====================================================================
describe('P4b SKIP-MSSQL / DEFAULT-MSSQL', () => {
  const strat = (raw: string, noMatchStrategy: string, extra: Record<string, unknown> = {}) => ({
    matchColumn: 'EDUCAT_BACK', lookupMatchColumn: 'TBL_CD',
    outputColumns: [{ lookupColumn: 'TBL_DESC1', outputAlias: 'd' }],
    noMatchStrategy, lookupSource: raw, lookupFilter: '', ...extra,
  });

  it('SKIP-MSSQL-001: 部分匹配 — 未匹配列刪除，匹配列保留且值正確', async (ctx) => {
    if (!guard(ctx)) return;
    const raw = await rawFx(`(VALUES (N'1',N'一'),(N'3',N'三')) AS v("TBL_CD","TBL_DESC1")`);
    const input = await inFx(`(VALUES (N'1'),(N'2'),(N'3')) AS v("EDUCAT_BACK")`, 3);
    const out = await runLookup(input, strat(raw, 'skip_row'));
    const rows = await readAll(h.qr!, input.tempTable, 'EDUCAT_BACK');
    expect(rows.map((r: any) => r.EDUCAT_BACK)).toEqual(['1', '3']); // '2' 被刪
    expect(rows.map((r: any) => r.d)).toEqual(['一', '三']);
    expect(out.rowCount).toBe(2);
  });

  it('SKIP-MSSQL-002: 全數匹配 → 無刪除，列數不變', async (ctx) => {
    if (!guard(ctx)) return;
    const raw = await rawFx(`(VALUES (N'1',N'一'),(N'2',N'二')) AS v("TBL_CD","TBL_DESC1")`);
    const input = await inFx(`(VALUES (N'1'),(N'2')) AS v("EDUCAT_BACK")`, 2);
    const out = await runLookup(input, strat(raw, 'skip_row'));
    expect(out.rowCount).toBe(2);
  });

  it('SKIP-MSSQL-003: 全數不匹配 → 全刪，0 列，不拋錯', async (ctx) => {
    if (!guard(ctx)) return;
    const raw = await rawFx(`(VALUES (N'8',N'八')) AS v("TBL_CD","TBL_DESC1")`);
    const input = await inFx(`(VALUES (N'1'),(N'2')) AS v("EDUCAT_BACK")`, 2);
    const out = await runLookup(input, strat(raw, 'skip_row'));
    expect(out.rowCount).toBe(0);
  });

  it('DEFAULT-MSSQL-001: default_value 對未匹配列填入預設值', async (ctx) => {
    if (!guard(ctx)) return;
    const raw = await rawFx(`(VALUES (N'1',N'一')) AS v("TBL_CD","TBL_DESC1")`);
    const input = await inFx(`(VALUES (N'1'),(N'9')) AS v("EDUCAT_BACK")`, 2);
    await runLookup(input, strat(raw, 'default_value', { defaultValue: 'NA' }));
    const rows = await readAll(h.qr!, input.tempTable, 'EDUCAT_BACK');
    expect(rows.find((r: any) => r.EDUCAT_BACK === '1').d).toBe('一');
    expect(rows.find((r: any) => r.EDUCAT_BACK === '9').d).toBe('NA');
  });
});

// =====================================================================
// 六、RESOLVE-002 — legacy mode 透過 lookupRef 解析
// =====================================================================
describe('P4b RESOLVE-002 (lookupRef 動態解析)', () => {
  it('RESOLVE-002 (🔴 DoD): 透過 lookupRef 解析出 raw 表並正確 enrich', async (ctx) => {
    if (!guard(ctx)) return;
    if (!resolveReady) {
      console.warn('[P4b resolve] SKIP — dbo.extraction_tasks/datasources 已存在（非本 spec 自建）');
      ctx.skip();
      return;
    }
    const qr = h.qr!;
    const raw = await rawFx(`(VALUES (N'1',N'一')) AS v("TBL_CD","TBL_DESC1")`);
    await qr.query(`DELETE FROM dbo.extraction_tasks`);
    await qr.query(`DELETE FROM dbo.datasources`);
    await qr.query(`INSERT INTO dbo.datasources (id, name) VALUES (1, N'DS_LK')`);
    await qr.query(
      `INSERT INTO dbo.extraction_tasks (datasource_id, source_table, raw_table_name, last_execution_at)
        VALUES (1, N'ST_LK', N'${raw}', '2024-05-01T00:00:00')`,
    );
    const input = await inFx(`(VALUES (N'1')) AS v("EDUCAT_BACK")`, 1);
    await runLookup(input, {
      matchColumn: 'EDUCAT_BACK', lookupMatchColumn: 'TBL_CD',
      outputColumns: [{ lookupColumn: 'TBL_DESC1', outputAlias: 'd' }],
      noMatchStrategy: 'null',
      lookupRef: { datasourceName: 'DS_LK', sourceTable: 'ST_LK' },
      lookupFilter: '',
    });
    const rows = await readAll(h.qr!, input.tempTable);
    expect(rows[0].d).toBe('一');
  });
});

// =====================================================================
// 三、CLEANUP-003/004 — 真實 pipeline 清理
// =====================================================================
describe('P4b CLEANUP-MSSQL (真實 pipeline)', () => {
  const CONFIG: PipelineRunnerConfig = { batchSize: 10000, upsertBatchSize: 500, isTestRun: false, pipelineId: 'p', logId: '' };
  const noop = async () => {};

  function dispatcher(): NodeDispatcher {
    const d = new NodeDispatcher();
    d.register(new ExtractHandlerMssql());
    d.register(new LookupHandlerMssql());
    d.register(new MergeHandlerMssql());
    return d;
  }

  it('CLEANUP-003: extract→lookup×2→merge 成功後 tempdb 無殘留 ##', async (ctx) => {
    if (!guard(ctx)) return;
    const qr = h.qr!;
    const srcA = await rawFx(`(VALUES (N'1',N'a'),(N'2',N'b')) AS v("CUSTID", aval)`);
    const srcB = await rawFx(`(VALUES (N'1',N'x'),(N'3',N'y')) AS v("CUSTID", bval)`);
    const lk = await rawFx(`(VALUES (N'1',N'one'),(N'2',N'two')) AS v("TBL_CD","TBL_DESC1")`);
    const logId = uniqueLogId();
    const def: PipelineDefinition = {
      nodes: [
        { id: 'e1', type: 'pipelineNode', position: { x: 0, y: 0 }, data: { nodeType: 'raw_data_extract', label: 'e1', rawTable: srcA } },
        { id: 'e2', type: 'pipelineNode', position: { x: 0, y: 0 }, data: { nodeType: 'raw_data_extract', label: 'e2', rawTable: srcB } },
        { id: 'lk1', type: 'pipelineNode', position: { x: 0, y: 0 }, data: { nodeType: 'lookup', label: 'lk1', matchColumn: 'CUSTID', lookupMatchColumn: 'TBL_CD', outputColumns: [{ lookupColumn: 'TBL_DESC1', outputAlias: 'd1' }], noMatchStrategy: 'null', lookupSource: lk } },
        { id: 'lk2', type: 'pipelineNode', position: { x: 0, y: 0 }, data: { nodeType: 'lookup', label: 'lk2', matchColumn: 'CUSTID', lookupMatchColumn: 'TBL_CD', outputColumns: [{ lookupColumn: 'TBL_DESC1', outputAlias: 'd2' }], noMatchStrategy: 'null', lookupSource: lk } },
        { id: 'm1', type: 'pipelineNode', position: { x: 0, y: 0 }, data: { nodeType: 'merge', label: 'm1', conditions: [{ leftColumn: 'CUSTID', rightColumn: 'CUSTID' }] } },
      ],
      edges: [
        { id: 'e-e1-lk1', source: 'e1', target: 'lk1' },
        { id: 'e-lk1-lk2', source: 'lk1', target: 'lk2' },
        { id: 'e-lk2-m1', source: 'lk2', target: 'm1', targetHandle: 'left-input' },
        { id: 'e-e2-m1', source: 'e2', target: 'm1', targetHandle: 'right-input' },
      ],
    };
    const runner = new PipelineRunner(dispatcher(), new NodeOutputStore());
    const logs = await runner.run(def, { ...CONFIG, logId }, qr, noop);
    expect(logs.every((l) => l.status === 'completed')).toBe(true);
    for (const nodeId of ['e1', 'e2', 'm1']) {
      expect(await objectExists(qr, tempName(nodeId, logId))).toBe(false);
    }
  });

  it('CLEANUP-004: 某 lookup ALTER 成功但後續 merge 失敗，已建立/已修改之 ## 仍被清理', async (ctx) => {
    if (!guard(ctx)) return;
    const qr = h.qr!;
    const srcA = await rawFx(`(VALUES (N'1',N'a')) AS v("CUSTID", aval)`);
    const srcB = await rawFx(`(VALUES (N'1',N'x')) AS v("CUSTID", bval)`);
    const lk = await rawFx(`(VALUES (N'1',N'one')) AS v("TBL_CD","TBL_DESC1")`);
    const logId = uniqueLogId();
    const def: PipelineDefinition = {
      nodes: [
        { id: 'e1', type: 'pipelineNode', position: { x: 0, y: 0 }, data: { nodeType: 'raw_data_extract', label: 'e1', rawTable: srcA } },
        { id: 'e2', type: 'pipelineNode', position: { x: 0, y: 0 }, data: { nodeType: 'raw_data_extract', label: 'e2', rawTable: srcB } },
        { id: 'lk1', type: 'pipelineNode', position: { x: 0, y: 0 }, data: { nodeType: 'lookup', label: 'lk1', matchColumn: 'CUSTID', lookupMatchColumn: 'TBL_CD', outputColumns: [{ lookupColumn: 'TBL_DESC1', outputAlias: 'd1' }], noMatchStrategy: 'null', lookupSource: lk } },
        // merge JOIN key 不存在 → 觸發失敗
        { id: 'm1', type: 'pipelineNode', position: { x: 0, y: 0 }, data: { nodeType: 'merge', label: 'm1', conditions: [{ leftColumn: 'NO_SUCH_KEY', rightColumn: 'CUSTID' }] } },
      ],
      edges: [
        { id: 'e-e1-lk1', source: 'e1', target: 'lk1' },
        { id: 'e-lk1-m1', source: 'lk1', target: 'm1', targetHandle: 'left-input' },
        { id: 'e-e2-m1', source: 'e2', target: 'm1', targetHandle: 'right-input' },
      ],
    };
    const runner = new PipelineRunner(dispatcher(), new NodeOutputStore());
    const logs = await runner.run(def, { ...CONFIG, logId }, qr, noop);
    expect(logs.find((l) => l.nodeId === 'm1')!.status).toBe('failed');
    // lk1 原地修改之 ##e1 + e2 之 ##e2 仍被清理
    expect(await objectExists(qr, tempName('e1', logId))).toBe(false);
    expect(await objectExists(qr, tempName('e2', logId))).toBe(false);
  });
});
