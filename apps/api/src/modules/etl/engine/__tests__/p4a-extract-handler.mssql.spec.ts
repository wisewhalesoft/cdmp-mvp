/**
 * AD-E07-41 P4a — extract-handler-mssql + resolve-raw-table-mssql 真實 MSSQL 整合。
 *
 * EXTRACT-EQ-001..003（自建 dbo.raw_* fixture，隨機尾碼，afterAll DROP）。
 * EXTRACT-RESOLVE-002..004：CDMP_TEST 無 extraction_tasks/datasources baseline（實測缺）→ 本 spec
 *   自建最小 dbo 版本（僅在兩表皆不存在時建立並於 afterAll DROP，避免破壞既有 baseline）。
 *   DUAL-DB（PG 對照）之 PG 側降級為「MSSQL 側行為驗證 + 既有 PG 版已測行為」——理由：唯一可達 PG
 *   為 dev DB（5432）不可注入測試列（見 impl log RESOLVE 段偏差說明）。
 */
import { restoreDbType, SKIP_REASON } from '@/database/__tests__/mssql-env-preload';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { ExtractHandlerMssql } from '../handlers/extract-handler-mssql';
import { resolveRawTableMssql } from '../handlers/resolve-raw-table-mssql';
import { dropMssqlTempTableIfExists } from '../handlers/mssql/temp-table.util';
import { connectMssql, teardownMssql, MssqlHarness, uniqueLogId, makeRealCtx } from './_p4a-mssql-harness';

vi.setConfig({ testTimeout: 60000 });

const handler = new ExtractHandlerMssql();
let h: MssqlHarness;
const rawTables: string[] = [];
let ownDs = false;
let ownEt = false;
let resolveReady = false;

function rawName(): string {
  const n = 'raw_p4a_fixture_' + Math.random().toString(16).slice(2, 10);
  rawTables.push(n);
  return n;
}

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
    console.warn('[P4a extract] SKIP —', SKIP_REASON);
    ctx.skip();
    return false;
  }
  return true;
}

async function runExtract(nodeData: Record<string, unknown>) {
  const logId = uniqueLogId();
  const ctx = makeRealCtx(h.qr!, 'raw_data_extract', nodeData, {}, { nodeId: 'ex', logId });
  const out = await handler.execute(ctx);
  return out;
}

describe('P4a EXTRACT-EQ', () => {
  it('EXTRACT-EQ-001: sourceFilter 過濾後 ## 列數符合手算', async (ctx) => {
    if (!guard(ctx)) return;
    const raw = rawName();
    await h.qr!.query(`CREATE TABLE dbo.${raw} (ASSIGNDAY NVARCHAR(8), CUSTOM_MK NVARCHAR(50))`);
    await h.qr!.query(
      `INSERT INTO dbo.${raw} (ASSIGNDAY, CUSTOM_MK) VALUES
        ('20200101',N'a'),('20200201',N'b'),('20200301',N'c'),('29991231',N'd'),('29990101',N'e')`,
    );
    const out = await runExtract({
      rawTable: raw,
      sourceFilter: { column: 'ASSIGNDAY', operator: '<', valueExpr: 'currentMonthFirstDay' },
    });
    // 3 筆過去 (< 本月第一天) 保留、2 筆未來 (2999) 排除
    expect(out.rowCount).toBe(3);
    await dropMssqlTempTableIfExists(h.qr!, out.tempTable);
  });

  it('EXTRACT-EQ-002: 中文欄位值 extract 階段 round-trip 正確', async (ctx) => {
    if (!guard(ctx)) return;
    const raw = rawName();
    await h.qr!.query(`CREATE TABLE dbo.${raw} (id INT, CUSTOM_MK NVARCHAR(50))`);
    await h.qr!.query(`INSERT INTO dbo.${raw} (id, CUSTOM_MK) VALUES (1,N'借新還舊'),(2,N'中古車商')`);
    const out = await runExtract({ rawTable: raw });
    const rows = await h.qr!.query(`SELECT CUSTOM_MK FROM ${out.tempTable} ORDER BY id`);
    expect(rows.map((r: any) => r.CUSTOM_MK)).toEqual(['借新還舊', '中古車商']);
    await dropMssqlTempTableIfExists(h.qr!, out.tempTable);
  });

  it('EXTRACT-EQ-003: INFORMATION_SCHEMA.TABLES 存在性 — 存在正常、不存在拋既有訊息', async (ctx) => {
    if (!guard(ctx)) return;
    const raw = rawName();
    await h.qr!.query(`CREATE TABLE dbo.${raw} (id INT)`);
    await h.qr!.query(`INSERT INTO dbo.${raw} (id) VALUES (1)`);
    const out = await runExtract({ rawTable: raw });
    expect(out.rowCount).toBe(1);
    await dropMssqlTempTableIfExists(h.qr!, out.tempTable);

    await expect(runExtract({ rawTable: 'raw_p4a_does_not_exist_zzz' })).rejects.toThrow(
      '原始資料表 raw_p4a_does_not_exist_zzz 不存在',
    );
  });
});

describe('P4a EXTRACT-RESOLVE (真實 MSSQL；自建最小 baseline)', () => {
  function resolveGuard(ctx: { skip: () => void }): boolean {
    if (!guard(ctx)) return false;
    if (!resolveReady) {
      console.warn('[P4a resolve] SKIP — dbo.extraction_tasks/datasources 已存在（非本 spec 自建），不注入未知 schema');
      ctx.skip();
      return false;
    }
    return true;
  }

  it('EXTRACT-RESOLVE-002: NULLS LAST 語意 — 選 last_execution_at 非 NULL 且最大者', async (ctx) => {
    if (!resolveGuard(ctx)) return;
    const qr = h.qr!;
    await qr.query(`DELETE FROM dbo.extraction_tasks`);
    await qr.query(`DELETE FROM dbo.datasources`);
    await qr.query(`INSERT INTO dbo.datasources (id, name) VALUES (1, N'DS_A')`);
    await qr.query(
      `INSERT INTO dbo.extraction_tasks (datasource_id, source_table, raw_table_name, last_execution_at) VALUES
        (1, N'ST', N'raw_null_exec', NULL),
        (1, N'ST', N'raw_has_exec', '2024-05-01T00:00:00')`,
    );
    const out = await resolveRawTableMssql(qr, { datasourceName: 'DS_A', sourceTable: 'ST' }, undefined, 'extractionRef');
    expect(out).toBe('raw_has_exec');
  });

  it('EXTRACT-RESOLVE-002b: 多筆有值 → 選 last_execution_at 最大者', async (ctx) => {
    if (!resolveGuard(ctx)) return;
    const qr = h.qr!;
    await qr.query(`DELETE FROM dbo.extraction_tasks`);
    await qr.query(`DELETE FROM dbo.datasources`);
    await qr.query(`INSERT INTO dbo.datasources (id, name) VALUES (1, N'DS_A')`);
    await qr.query(
      `INSERT INTO dbo.extraction_tasks (datasource_id, source_table, raw_table_name, last_execution_at) VALUES
        (1, N'ST', N'raw_old', '2024-01-01T00:00:00'),
        (1, N'ST', N'raw_new', '2024-09-09T00:00:00'),
        (1, N'ST', N'raw_null', NULL)`,
    );
    const out = await resolveRawTableMssql(qr, { datasourceName: 'DS_A', sourceTable: 'ST' }, undefined, 'extractionRef');
    expect(out).toBe('raw_new');
  });

  it('EXTRACT-RESOLVE-003: ref 無結果、有 fallback → 回 fallback + console.warn', async (ctx) => {
    if (!resolveGuard(ctx)) return;
    const qr = h.qr!;
    await qr.query(`DELETE FROM dbo.extraction_tasks`);
    await qr.query(`DELETE FROM dbo.datasources`);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const out = await resolveRawTableMssql(qr, { datasourceName: 'NOPE', sourceTable: 'X' }, 'raw_fallback', 'extractionRef');
    expect(out).toBe('raw_fallback');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('EXTRACT-RESOLVE-004: ref 無結果、無 fallback → 拋錯', async (ctx) => {
    if (!resolveGuard(ctx)) return;
    const qr = h.qr!;
    await qr.query(`DELETE FROM dbo.extraction_tasks`);
    await qr.query(`DELETE FROM dbo.datasources`);
    await expect(
      resolveRawTableMssql(qr, { datasourceName: 'NOPE', sourceTable: 'X' }, undefined, 'extractionRef'),
    ).rejects.toThrow(/解析失敗/);
  });
});
