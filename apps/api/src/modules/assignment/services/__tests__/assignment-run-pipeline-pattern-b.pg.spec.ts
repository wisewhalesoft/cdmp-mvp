/**
 * AD-E07-38 P1c — PARAM 站點 1/2/4 之 PostgreSQL 等價性 baseline（真庫）。
 *
 *   PARAM-002：站點 1 customer_core IN (:...custoNos) 於 PG 回傳等價（customer_core 於 PG 存在）。
 *   PARAM-006：站點 2 ob_arreturndf_min_cap IN (:...applNos) 於 PG 回傳等價。
 *   PARAM-013/014/015：站點 4 buildExportQuery scope 三分支（有轄區 / 無轄區 1=0 / bypass）於 PG 執行等價。
 *
 * 連線：預設 postgres-test（5433/cdmp_test）；不可達 → skip-with-reason（不偽造綠燈）。
 * 隔離：專屬 schema `p1c_pg` + search_path（跨檔不干擾 F098~F109 共用 cdmp_test）。
 */
import { restoreDbType } from '../../stage1/__tests__/pg-env-preload';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as net from 'net';
import { DataSource } from 'typeorm';
import { AssignmentRunReportService } from '../assignment-run-report.service';

const PG = {
  host: process.env.PG_BOSS_TEST_HOST ?? '127.0.0.1',
  port: Number(process.env.PG_BOSS_TEST_PORT ?? 5433),
  user: process.env.PG_BOSS_TEST_USER ?? 'cdmp',
  password: process.env.PG_BOSS_TEST_PASSWORD ?? 'cdmp_secret',
  database: process.env.PG_BOSS_TEST_DB ?? 'cdmp_test',
};
const SKIP_REASON =
  '需 Postgres（docker compose -f docker-compose.test.yml up -d postgres-test，5433）— 未實跑';
const SCHEMA = 'p1c_pg';
const RUN = 'RUN-P1C-PG-016';

let reachable = false;
let ds: DataSource | null = null;

function pgPortReachable(timeoutMs = 1000): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = net.connect({ host: PG.host, port: PG.port });
    const finish = (ok: boolean) => {
      sock.destroy();
      resolve(ok);
    };
    sock.setTimeout(timeoutMs);
    sock.once('connect', () => finish(true));
    sock.once('error', () => finish(false));
    sock.once('timeout', () => finish(false));
  });
}

function ensure(ctx: { skip: () => void }): void {
  if (!reachable || !ds) {
    // eslint-disable-next-line no-console
    console.warn(`[AD-E07-38 P1c PARAM.pg] SKIPPED — ${SKIP_REASON}`);
    ctx.skip();
  }
}

function escape(sqlNamed: string, params: Record<string, unknown>): [string, unknown[]] {
  return ds!.driver.escapeQueryWithParameters(sqlNamed, params, {});
}

function makeService(scopeEmplIds: string[] | null): AssignmentRunReportService {
  const scopeStub = {
    shouldFilter: (actor: { businessRole?: string } | null | undefined) =>
      !!scopeEmplIds && actor?.businessRole === 'section_chief',
    getScopeEmplIds: async () => new Set(scopeEmplIds ?? []),
  };
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
  reachable = await pgPortReachable(1000);
  if (!reachable) return;
  try {
    ds = new DataSource({
      type: 'postgres',
      host: PG.host,
      port: PG.port,
      username: PG.user,
      password: PG.password,
      database: PG.database,
      schema: SCHEMA,
      entities: [],
      synchronize: false,
    });
    await ds.initialize();
  } catch {
    reachable = false;
    ds = null;
    return;
  }
  await ds.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`);
  await ds.query(`SET search_path TO ${SCHEMA}, public`);
  // 站點 1/2 來源表
  await ds.query(`DROP TABLE IF EXISTS ${SCHEMA}.customer_core`);
  await ds.query(
    `CREATE TABLE ${SCHEMA}.customer_core (source_customer_no text primary key, cus_sex text)`,
  );
  await ds.query(
    `INSERT INTO ${SCHEMA}.customer_core VALUES ('C1','1'),('C2','2'),('C3','1')`,
  );
  await ds.query(`DROP TABLE IF EXISTS ${SCHEMA}.ob_arreturndf_min_cap`);
  await ds.query(
    `CREATE TABLE ${SCHEMA}.ob_arreturndf_min_cap (appl_no text primary key, add_un_capital text)`,
  );
  await ds.query(
    `INSERT INTO ${SCHEMA}.ob_arreturndf_min_cap VALUES ('A1','100'),('A2','200'),('A3','300')`,
  );
  // 站點 4 匯出多表
  for (const t of ['ob_monthly_run_result', 'ob_pool_data', 'ob_emphire', 'ob_list_definition']) {
    await ds.query(`DROP TABLE IF EXISTS ${SCHEMA}.${t}`);
  }
  await ds.query(`CREATE TABLE ${SCHEMA}.ob_monthly_run_result (
    run_id text, orgno text, appl_no text, assignday text, list_no text, cr_id text, cr_nm text,
    is_cr text, tier_level text, dept_id text, emplid text)`);
  await ds.query(`CREATE TABLE ${SCHEMA}.ob_pool_data (
    orgno text, appl_no text, dept_name text, appl_date text, project_tp text, spec_name text,
    overdue_day text, pro_rate text, sta_code text, sta_code_na text, brand_name text, month_cnt text)`);
  await ds.query(`CREATE TABLE ${SCHEMA}.ob_emphire (emp_id text, dept_name text, emp_nm text, title_name text)`);
  await ds.query(`CREATE TABLE ${SCHEMA}.ob_list_definition (list_no text, list_nm text)`);
  await ds.query(`INSERT INTO ${SCHEMA}.ob_monthly_run_result
    (run_id, orgno, appl_no, assignday, list_no, is_cr, tier_level, dept_id, emplid) VALUES
    ('${RUN}','O1','A1','20260601','L1','N','T1','D01','E1'),
    ('${RUN}','O2','A2','20260601','L1','N','T2','D02','E2')`);
  await ds.query(`INSERT INTO ${SCHEMA}.ob_pool_data
    (orgno, appl_no, dept_name, appl_date, project_tp, spec_name, pro_rate, sta_code, sta_code_na, brand_name, month_cnt) VALUES
    ('O1','A1','分處一','20260501','TP','專案A','0.1','S1','狀態一','廠牌A','3'),
    ('O2','A2','分處二','20260502','TP','專案B','0.2','S2','狀態二','廠牌B','3')`);
  await ds.query(`INSERT INTO ${SCHEMA}.ob_emphire VALUES ('E1','部門一','張三','專員'),('E2','部門二','李四','襄理')`);
  await ds.query(`INSERT INTO ${SCHEMA}.ob_list_definition VALUES ('L1','名單一')`);
}, 60000);

afterAll(async () => {
  if (ds) {
    try {
      await ds.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    } catch {
      /* ignore */
    }
    await ds.destroy();
  }
  restoreDbType();
});

describe('AD-E07-38 P1c PARAM.pg — 站點 1/2 prefetch 等價', () => {
  it('TS-MSSQL-P1C-PARAM-002：customer_core IN (:...custoNos) 於 PG 展開 $n 且回傳等價', async (ctx) => {
    ensure(ctx);
    const [sql, params] = escape(
      `SELECT source_customer_no, cus_sex FROM customer_core WHERE source_customer_no IN (:...custoNos)`,
      { custoNos: ['C1', 'C3'] },
    );
    expect(sql).toContain('IN ($1, $2)');
    const rows = await ds!.manager.query(sql, params);
    expect(rows.map((r: { source_customer_no: string }) => r.source_customer_no).sort()).toEqual(['C1', 'C3']);
  });

  it('TS-MSSQL-P1C-PARAM-006：ob_arreturndf_min_cap IN (:...applNos) 於 PG 回傳等價', async (ctx) => {
    ensure(ctx);
    const [sql, params] = escape(
      `SELECT appl_no, add_un_capital FROM ob_arreturndf_min_cap WHERE appl_no IN (:...applNos)`,
      { applNos: ['A1', 'A2', 'A3'] },
    );
    const rows = await ds!.manager.query(sql, params);
    const arMap = new Map(rows.map((r: { appl_no: string; add_un_capital: string }) => [r.appl_no, r.add_un_capital]));
    expect(arMap.get('A2')).toBe('200');
    expect(arMap.size).toBe(3);
  });
});

describe('AD-E07-38 P1c PARAM.pg — 站點 4 buildExportQuery scope 三分支', () => {
  async function runExport(actor: unknown, scopeEmplIds: string[] | null) {
    const svc = makeService(scopeEmplIds);
    const q = await (svc as never as {
      buildExportQuery: (runId: string, a: unknown) => Promise<{ sql: string; params: unknown[]; scopedByCreator: boolean }>;
    }).buildExportQuery(RUN, actor);
    // buildExportQuery 於 PG 端展開 $n；直接執行（不經 cursorRows / 站點 5）
    const rows = await ds!.manager.query(q.sql, q.params);
    return { q, rows };
  }

  it('TS-MSSQL-P1C-PARAM-013：section_chief 有轄區 → 僅回轄區列（$1 + $2..）', async (ctx) => {
    ensure(ctx);
    const { q, rows } = await runExport(
      { userId: 'sc', role: 'user', businessRole: 'section_chief' },
      ['E1'],
    );
    expect(q.scopedByCreator).toBe(true);
    expect(q.sql).toContain('r.run_id = $1');
    expect(q.sql).toContain('r.emplid IN ($2)');
    expect(rows.length).toBe(1);
    expect(rows[0].emplid).toBe('E1');
  });

  it('TS-MSSQL-P1C-PARAM-014：section_chief 無轄區 → AND 1=0 → 0 列（僅 :runId）', async (ctx) => {
    ensure(ctx);
    const { q, rows } = await runExport(
      { userId: 'sc0', role: 'user', businessRole: 'section_chief' },
      [], // 無轄區
    );
    expect(q.scopedByCreator).toBe(true);
    expect(q.sql).toContain('1 = 0');
    expect(q.sql).not.toContain('r.emplid IN');
    expect(rows.length).toBe(0);
  });

  it('TS-MSSQL-P1C-PARAM-015：director bypass → 全部列（僅 :runId 單一參數）', async (ctx) => {
    ensure(ctx);
    const { q, rows } = await runExport(
      { userId: 'dir', role: 'user', businessRole: 'director' },
      null,
    );
    expect(q.scopedByCreator).toBe(false);
    expect(q.sql).not.toContain('r.emplid IN');
    expect(q.params).toEqual([RUN]);
    expect(rows.length).toBe(2);
  });
});
