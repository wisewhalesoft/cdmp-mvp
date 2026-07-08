/**
 * AD-E07-38 P1c — PARAM 站點 1/2/4 之真實 MSSQL 驗證（跨 driver 資料等價 / 錯誤分類）。
 *
 *   PARAM-003：站點 1（customer_core，PG-only）→ mssql 表不存在，驗「錯誤被正確分類為表不存在，非參數/語法錯誤」。
 *   PARAM-007：站點 2（ob_arreturndf_min_cap，已在 baseline）→ IN (:...applNos) 於 mssql 展開 @0,@1 且資料等價。
 *   PARAM-016：站點 4（buildExportQuery）→ 真實 :runId + :...emplIds 單一 escape 之 SQL 於 mssql 語法合法且資料等價
 *              （直接 manager.query，不經 cursorRows / 站點 5）。
 *
 * Gating：連不上 MSSQL → ctx.skip（不偽造綠燈）。表建於 dbo（本容器 dbo 空），try/finally DROP。
 */

// 必最先 import：side-effect 設 DB_TYPE=mssql（供 entity column-types helper 解析 mssql 分支）。
import {
  restoreDbType,
  MSSQL,
  mssqlPortReachable,
  SKIP_REASON,
} from '../../../../database/__tests__/mssql-env-preload';

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { DataSource } from 'typeorm';
import { AssignmentRunReportService } from '../assignment-run-report.service';

vi.setConfig({ testTimeout: 60000 });

// AD-E07-43 P5a（I-MSSQL-CI-BOOTSTRAP-01）：本套件假設 dbo 為空——PARAM-003 斷言 customer_core 缺表、
//   PARAM-007/016 於 dbo 建/丟 baseline 名稱之簡化表。CI bootstrap 後 CDMP_TEST.dbo 已有完整 baseline
//   （customer_core 存在 → PARAM-003 失敗；且其 DROP 會殃及 baseline）。故隔離至專屬 fresh empty 庫
//   （CDMP_PATTERNB，永不 bootstrap，由 docker/mssql-init.sql 建立），保「dbo 空」前提、且不碰共用 baseline。
const PATTERNB_DATABASE = process.env.MSSQL_PATTERNB_DB ?? 'CDMP_PATTERNB';

let reachable = false;
let ds: DataSource | null = null;

function ensure(ctx: { skip: () => void }): void {
  if (!reachable || !ds) {
    // eslint-disable-next-line no-console
    console.warn(`[AD-E07-38 P1c PARAM.mssql] SKIPPED — ${SKIP_REASON}`);
    ctx.skip();
  }
}

/** 以當前 driver 展開具名參數（比照生產 prefetchScoringSources / buildExportQuery）。 */
function escape(sqlNamed: string, params: Record<string, unknown>): [string, unknown[]] {
  return ds!.driver.escapeQueryWithParameters(sqlNamed, params, {});
}

async function drop(name: string): Promise<void> {
  await ds!.query(`IF OBJECT_ID('dbo.${name}','U') IS NOT NULL DROP TABLE dbo.${name}`);
}

beforeAll(async () => {
  reachable = await mssqlPortReachable(1500);
  if (!reachable) return;
  try {
    ds = new DataSource({
      type: 'mssql',
      host: MSSQL.host,
      port: MSSQL.port,
      username: MSSQL.username,
      password: MSSQL.password,
      database: PATTERNB_DATABASE,
      options: {
        encrypt: MSSQL.encrypt,
        trustServerCertificate: MSSQL.trustServerCertificate,
      },
      entities: [],
      synchronize: false,
    });
    await ds.initialize();
  } catch {
    reachable = false;
    ds = null;
  }
}, 60000);

afterAll(async () => {
  if (ds) await ds.destroy();
  restoreDbType();
});

// ===========================================================================
// PARAM-003 — 站點 1 customer_core（PG-only）錯誤分類
// ===========================================================================
describe('AD-E07-38 P1c PARAM — 站點 1（customer_core，錯誤分類）', () => {
  it('TS-MSSQL-P1C-PARAM-003：customer_core 不存在 → 表不存在錯誤（非語法/參數繫結錯誤）', async (ctx) => {
    ensure(ctx);
    const [sql, params] = escape(
      `SELECT source_customer_no, cus_sex FROM customer_core WHERE source_customer_no IN (:...custoNos)`,
      { custoNos: ['C1', 'C2'] },
    );
    let caught: Error | null = null;
    try {
      await ds!.manager.query(sql, params);
    } catch (e) {
      caught = e as Error;
    }
    expect(caught).not.toBeNull();
    // 斷言重點：捕捉到「表不存在」而非「語法錯誤 / 參數繫結錯誤」——證明具名參數轉換本身未失敗。
    expect(caught!.message).toMatch(/invalid object name/i);
    expect(caught!.message).not.toMatch(/incorrect syntax/i);
    expect(caught!.message).not.toMatch(/must be declared/i);
  });
});

// ===========================================================================
// PARAM-007 — 站點 2 ob_arreturndf_min_cap 跨 driver 資料等價
// ===========================================================================
describe('AD-E07-38 P1c PARAM — 站點 2（ob_arreturndf_min_cap，資料等價）', () => {
  const T = 'ob_arreturndf_min_cap';

  beforeAll(async () => {
    if (!reachable || !ds) return;
    await drop(T);
    await ds.query(
      `CREATE TABLE dbo.${T} (appl_no NVARCHAR(40) NOT NULL PRIMARY KEY, add_un_capital NVARCHAR(40) NULL)`,
    );
    await ds.query(
      `INSERT INTO dbo.${T} (appl_no, add_un_capital) VALUES ('A1','100'),('A2','200'),('A3','300')`,
    );
  }, 60000);

  afterAll(async () => {
    if (reachable && ds) await drop(T);
  });

  it('TS-MSSQL-P1C-PARAM-007：IN (:...applNos) 展開 @0,@1,@2 且 arMap 資料等價', async (ctx) => {
    ensure(ctx);
    const [sql, params] = escape(
      `SELECT appl_no, add_un_capital FROM ob_arreturndf_min_cap WHERE appl_no IN (:...applNos)`,
      { applNos: ['A1', 'A2', 'A3'] },
    );
    expect(sql).toContain('IN (@0, @1, @2)');
    const rows: Array<{ appl_no: string; add_un_capital: string }> =
      await ds!.manager.query(sql, params);
    const arMap = new Map(rows.map((r) => [r.appl_no, r.add_un_capital]));
    expect([...arMap.keys()].sort()).toEqual(['A1', 'A2', 'A3']);
    expect(arMap.get('A2')).toBe('200');
  });

  it('TS-MSSQL-P1C-PARAM-009（mssql）：長度 1 之 :...applNos → IN (@0) 合法', async (ctx) => {
    ensure(ctx);
    const [sql, params] = escape(
      `SELECT appl_no, add_un_capital FROM ob_arreturndf_min_cap WHERE appl_no IN (:...applNos)`,
      { applNos: ['A2'] },
    );
    expect(sql).toContain('IN (@0)');
    const rows = await ds!.manager.query(sql, params);
    expect(rows.map((r: { appl_no: string }) => r.appl_no)).toEqual(['A2']);
  });
});

// ===========================================================================
// PARAM-016 — 站點 4 buildExportQuery 真實 SQL 於 mssql 語法合法 + 資料等價
// ===========================================================================
describe('AD-E07-38 P1c PARAM — 站點 4（buildExportQuery，mssql SQL 執行）', () => {
  const RUN = 'RUN-P1C-016';
  const TABLES = ['ob_monthly_run_result', 'ob_pool_data', 'ob_emphire', 'ob_list_definition'];

  function makeService(scopeEmplIds: string[] | null): AssignmentRunReportService {
    const scopeStub = {
      shouldFilter: (actor: { businessRole?: string } | null | undefined) =>
        !!scopeEmplIds && actor?.businessRole === 'section_chief',
      getScopeEmplIds: async () => new Set(scopeEmplIds ?? []),
    };
    // 建構子：(runRepo, snapshotRepo, auditRepo, deptPctRepo, scope, dataSource)
    return new AssignmentRunReportService(
      null as never,
      null as never,
      null as never,
      null as never,
      scopeStub as never,
      ds as DataSource,
    );
  }

  beforeAll(async () => {
    if (!reachable || !ds) return;
    for (const t of TABLES) await drop(t);
    await ds.query(`CREATE TABLE dbo.ob_monthly_run_result (
      run_id NVARCHAR(60), orgno NVARCHAR(20), appl_no NVARCHAR(40), assignday NVARCHAR(20),
      list_no NVARCHAR(40), cr_id NVARCHAR(20), cr_nm NVARCHAR(60), is_cr NVARCHAR(4),
      tier_level NVARCHAR(10), dept_id NVARCHAR(20), emplid NVARCHAR(20))`);
    await ds.query(`CREATE TABLE dbo.ob_pool_data (
      orgno NVARCHAR(20), appl_no NVARCHAR(40), dept_name NVARCHAR(60), appl_date NVARCHAR(20),
      project_tp NVARCHAR(20), spec_name NVARCHAR(60), overdue_day NVARCHAR(20), pro_rate NVARCHAR(20),
      sta_code NVARCHAR(20), sta_code_na NVARCHAR(60), brand_name NVARCHAR(60), month_cnt NVARCHAR(20))`);
    await ds.query(`CREATE TABLE dbo.ob_emphire (
      emp_id NVARCHAR(20), dept_name NVARCHAR(60), emp_nm NVARCHAR(60), title_name NVARCHAR(60))`);
    await ds.query(`CREATE TABLE dbo.ob_list_definition (list_no NVARCHAR(40), list_nm NVARCHAR(60))`);

    // 2 筆 result（emplid E1 / E2），對應 pool、emphire、list_def
    await ds.query(`INSERT INTO dbo.ob_monthly_run_result
      (run_id, orgno, appl_no, assignday, list_no, cr_id, cr_nm, is_cr, tier_level, dept_id, emplid) VALUES
      ('${RUN}','O1','A1','20260601','L1',NULL,NULL,'N','T1','D01','E1'),
      ('${RUN}','O2','A2','20260601','L1',NULL,NULL,'N','T2','D02','E2')`);
    await ds.query(`INSERT INTO dbo.ob_pool_data
      (orgno, appl_no, dept_name, appl_date, project_tp, spec_name, overdue_day, pro_rate, sta_code, sta_code_na, brand_name, month_cnt) VALUES
      ('O1','A1','分處一','20260501','TP','專案A',NULL,'0.1','S1','狀態一','廠牌A','3'),
      ('O2','A2','分處二','20260502','TP','專案B',NULL,'0.2','S2','狀態二','廠牌B','3')`);
    await ds.query(`INSERT INTO dbo.ob_emphire (emp_id, dept_name, emp_nm, title_name) VALUES
      ('E1','部門一','張三','專員'),('E2','部門二','李四','襄理')`);
    await ds.query(`INSERT INTO dbo.ob_list_definition (list_no, list_nm) VALUES ('L1','名單一')`);
  }, 60000);

  afterAll(async () => {
    if (reachable && ds) for (const t of TABLES) await drop(t);
  });

  it('TS-MSSQL-P1C-PARAM-016：admin（無 scope）→ SQL 於 mssql 執行、回傳全部列', async (ctx) => {
    ensure(ctx);
    const svc = makeService(null);
    const q = await (svc as never as {
      buildExportQuery: (
        runId: string,
        actor: unknown,
      ) => Promise<{ sql: string; params: unknown[]; scopedByCreator: boolean }>;
    }).buildExportQuery(RUN, { userId: 'admin', role: 'admin', businessRole: 'admin' });

    expect(q.scopedByCreator).toBe(false);
    // 主參數展開為 mssql @0（單一 escape）
    expect(q.sql).toContain('r.run_id = @0');
    const rows = await ds!.manager.query(q.sql, q.params);
    expect(rows.length).toBe(2);
    // 欄位別名正確帶出（跨 driver 語意等價）
    const byAppl = new Map(rows.map((r: { appl_no: string }) => [r.appl_no, r]));
    expect((byAppl.get('A1') as { dept_name: string }).dept_name).toBe('分處一');
    expect((byAppl.get('A1') as { emp_nm: string }).emp_nm).toBe('張三');
    expect((byAppl.get('A1') as { list_nm: string }).list_nm).toBe('名單一');
  });

  it('TS-MSSQL-P1C-PARAM-016b：section_chief（scope E1）→ :runId + :...emplIds 單一 escape、僅回轄區列', async (ctx) => {
    ensure(ctx);
    const svc = makeService(['E1']);
    const q = await (svc as never as {
      buildExportQuery: (
        runId: string,
        actor: unknown,
      ) => Promise<{ sql: string; params: unknown[]; scopedByCreator: boolean }>;
    }).buildExportQuery(RUN, { userId: 'sc', role: 'user', businessRole: 'section_chief' });

    expect(q.scopedByCreator).toBe(true);
    // 單一 escape：runId=@0、emplIds=@1（依字串出現順序）
    expect(q.sql).toContain('r.run_id = @0');
    expect(q.sql).toContain('r.emplid IN (@1)');
    expect(q.params).toEqual([RUN, 'E1']);
    const rows = await ds!.manager.query(q.sql, q.params);
    expect(rows.length).toBe(1);
    expect(rows[0].emplid).toBe('E1');
  });
});
