/**
 * AD-E07-43 P5 收尾 — 匯出「進件日」appl_date 於 SQL 端格式化（真實 dev CDMP MSSQL）。
 * P5h §7 AD-3 follow-up 之根治：buildExportQuery 內 `CONVERT(varchar(10), o.appl_date, 120)`（mssql）
 * 使 datetime2 wall-clock 於 SQL 端直接格式化，繞開 formatApplDate 之 JS Date getter ≥16:00 +1 日漂移。
 *
 * 對應 docs/test-specs/infrastructure/AD-E07-43-P5-followup-display-test.md：
 *   §六 APLFMT-BOUNDARY-001~005：對真 datetime2 逐秒邊界（15:59:59 / 16:00:00 / 23:59:59 / 00:00:00 /
 *       歷史 2015-05-18 15:24:00）以真實 buildExportQuery 產出之 SQL 執行，驗證 appl_date 欄回傳正確日字串。
 *   §七 APLFMT-EXPORT-001/002：真實 exportResult('csv'/'xlsx')，16:00 案件「進件日」= 2026/07/01
 *       （修法前本地 getter 為 2026/07/02）。
 *
 * ★ Harness：buildExportQuery 之表名為**裸名**（生產程式碼不可改），連線池 raw query 之預設 schema 為
 *   dbo → 必然解析到 dbo 已部署 baseline 表。故本 slice 依任務指示「自建 probe 列 + 前綴 DELETE，不
 *   DROP/TRUNCATE baseline」：對真實 dbo baseline 表 seed 一組 P5FU 前綴列（valid GUID run_id、appl_date
 *   為真 datetime2 邊界值），跑真實 buildExportQuery（WHERE run_id=@guid 隔離），afterAll 精準 DELETE。
 *   appl_date 為 baseline 原生 datetime2 欄 → CONVERT 對真實日期型別運算（非字串短路）。
 * §一 GATE：cursorRows PG 專屬 cursor 於 MSSQL 不可用 → EXPORT 群組 spy cursorRows 直接 manager.query
 *   （僅替換 streaming plumbing，buildExportQuery SQL / formatRow / CSV·xlsx 產出皆為真實生產路徑）。
 * Gating：連不上 dev CDMP → ctx.skip。
 */

import {
  restoreDbType,
  MSSQL,
  mssqlPortReachable,
  SKIP_REASON,
} from '../../../../database/__tests__/mssql-env-preload';

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { DataSource } from 'typeorm';
import { Readable } from 'stream';
import { randomUUID } from 'crypto';
import { AssignmentRunReportService } from '../assignment-run-report.service';

vi.setConfig({ testTimeout: 60000 });

const RUN = randomUUID(); // valid uniqueidentifier（dbo.ob_monthly_run_result.run_id）
const LIST_NO = 'P5FUEXP'; // 前綴隔離
const ORGNO = 'OB';
const EMPLID = 'P5FUE1';

let reachable = false;
let ds: DataSource | null = null;

function ensure(ctx: { skip: () => void }): void {
  if (!reachable || !ds) {
    // eslint-disable-next-line no-console
    console.warn(`[AD-E07-43 P5FU APLFMT] SKIPPED — ${SKIP_REASON}`);
    ctx.skip();
  }
}

/** wall-clock datetime2 樣本（以字串載入，避免 tedious JS Date 參數轉換；對照測試設計 §六 表）。 */
const SAMPLES: Array<{ applNo: string; wall: string; expectYmd: string; expectSlash: string }> = [
  { applNo: 'P5FUE01', wall: '2015-05-18 15:24:00', expectYmd: '2015-05-18', expectSlash: '2015/05/18' },
  { applNo: 'P5FUE02', wall: '2026-07-01 15:59:59', expectYmd: '2026-07-01', expectSlash: '2026/07/01' },
  { applNo: 'P5FUE03', wall: '2026-07-01 16:00:00', expectYmd: '2026-07-01', expectSlash: '2026/07/01' },
  { applNo: 'P5FUE04', wall: '2026-07-01 23:59:59', expectYmd: '2026-07-01', expectSlash: '2026/07/01' },
  { applNo: 'P5FUE05', wall: '2026-07-01 00:00:00', expectYmd: '2026-07-01', expectSlash: '2026/07/01' },
];

function makeService(): AssignmentRunReportService {
  const runRepoStub = {
    findOne: async () => ({ run_id: RUN, status: 'completed', project_workym: '202607' }),
  };
  const scopeStub = {
    shouldFilter: () => false,
    getScopeEmplIds: async () => new Set<string>(),
  };
  // 建構子：(runRepo, snapshotRepo, auditRepo, deptPctRepo, scope, dataSource)
  return new AssignmentRunReportService(
    runRepoStub as never,
    null as never,
    null as never,
    null as never,
    scopeStub as never,
    ds as DataSource,
  );
}

/** 將真實 buildExportQuery 產出之 SQL 直接 manager.query（BOUNDARY 用；不經 cursor）。 */
async function runExportQuery(): Promise<Array<Record<string, unknown>>> {
  const svc = makeService();
  const q = await (
    svc as never as {
      buildExportQuery: (
        runId: string,
        actor: unknown,
      ) => Promise<{ sql: string; params: unknown[] }>;
    }
  ).buildExportQuery(RUN, { userId: 'admin', role: 'admin', businessRole: 'admin' });
  return ds!.manager.query(q.sql, q.params);
}

function parseCsv(body: string): string[][] {
  return body
    .replace(/^﻿/, '')
    .split('\n')
    .filter((l) => l.length > 0)
    .map((line) => line.split(','));
}

async function cleanup(): Promise<void> {
  if (!ds) return;
  // 先子表（ob_monthly_run_result，FK→assignment_run）再母表；皆前綴/GUID 隔離
  await ds.query(`DELETE FROM ob_monthly_run_result WHERE run_id = @0`, [RUN]).catch(() => undefined);
  await ds.query(`DELETE FROM assignment_run WHERE run_id = @0`, [RUN]).catch(() => undefined);
  await ds.query(`DELETE FROM ob_pool_data WHERE appl_no LIKE 'P5FUE%'`).catch(() => undefined);
  await ds.query(`DELETE FROM ob_emphire WHERE emp_id = @0`, [EMPLID]).catch(() => undefined);
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
      database: MSSQL.database,
      options: {
        encrypt: MSSQL.encrypt,
        trustServerCertificate: MSSQL.trustServerCertificate,
        useUTC: true, // 對齊生產 P5h；驗 CONVERT 於 SQL 端不受 tedious Date 轉換影響
      },
      entities: [],
      synchronize: false,
    });
    await ds.initialize();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[AD-E07-43 P5FU APLFMT] init failed → skip:', (e as Error)?.message);
    reachable = false;
    ds = null;
    return;
  }
  // 前置清理（避免前一次殘留）+ seed 真實 dbo baseline 表（前綴隔離）
  await cleanup();
  // assignment_run 母列（FK：ob_monthly_run_result.run_id → assignment_run.run_id）
  await ds.query(
    `INSERT INTO assignment_run (run_id, project_workym, status, triggered_by)
     VALUES (@0, '202607', 'completed', '00000000-0000-0000-0000-000000000001')`,
    [RUN],
  );
  // emphire（LEFT JOIN e.emp_id = r.emplid）——避免 join-miss 警告；emp_id 為唯一 NOT NULL
  await ds.query(
    `INSERT INTO ob_emphire (emp_id, emp_nm, dept_name, title_name) VALUES (@0, '張三', '部門一', '專員')`,
    [EMPLID],
  );
  for (const s of SAMPLES) {
    // ob_pool_data：補齊 NOT NULL 欄（sta_code / dept_id / list_type / settle_src / _cdmp_extracted_at）+ 匯出用欄
    await ds.query(
      `INSERT INTO ob_pool_data
        (orgno, appl_no, custo_no, dept_name, appl_date, project_tp, spec_name, pro_rate,
         sta_code, sta_code_na, brand_name, month_cnt, dept_id, list_type, settle_src, _cdmp_extracted_at)
       VALUES ('${ORGNO}','${s.applNo}','C000000001','分處一','${s.wall}','TP','專案A','0.1',
         'S1','狀態一','廠牌A',3,'D01','OB','N','2026-07-01 00:00:00')`,
    );
    // ob_monthly_run_result：PK + 匯出欄（settle_src/created_at/updated_at 走 baseline default）
    await ds.query(
      `INSERT INTO ob_monthly_run_result
        (run_id, list_no, orgno, appl_no, is_cr, tier_level, dept_id, emplid, assignday)
       VALUES (@0, '${LIST_NO}', '${ORGNO}', '${s.applNo}', 'N', 'T1', 'D01', '${EMPLID}', '20260601')`,
      [RUN],
    );
  }
}, 60000);

afterAll(async () => {
  if (ds) {
    await cleanup();
    await ds.destroy();
  }
  restoreDbType();
});

describe('AD-E07-43 P5FU — appl_date SQL 端格式化（I-EXP-APLDATE-FMT-01）', () => {
  describe('APLFMT-BOUNDARY（真 datetime2，buildExportQuery 產出 SQL 執行）', () => {
    it('TS-P5FU-APLFMT-BOUNDARY-001~005：CONVERT(varchar(10),o.appl_date,120) 逐秒邊界皆正確', async (ctx) => {
      ensure(ctx);
      const rows = await runExportQuery();
      expect(rows.length).toBe(SAMPLES.length);
      const byAppl = new Map(
        rows.map((r) => [String((r as { appl_no: string }).appl_no), r]),
      );
      for (const s of SAMPLES) {
        const r = byAppl.get(s.applNo) as { appl_date: unknown } | undefined;
        expect(r, `sample ${s.applNo}`).toBeDefined();
        // SQL 端輸出為 'YYYY-MM-DD' 字串（CONVERT style 120 + varchar(10) 截斷）
        expect(String(r!.appl_date), `sample ${s.applNo} wall=${s.wall}`).toBe(s.expectYmd);
      }
    });

    it('TS-P5FU-APLFMT-BOUNDARY-003b：16:00:00 之修法前本地 getter 對照——SQL 端格式化未 +1 日', async (ctx) => {
      ensure(ctx);
      const rows = await runExportQuery();
      const r16 = rows.find(
        (r) => String((r as { appl_no: string }).appl_no) === 'P5FUE03',
      ) as { appl_date: unknown };
      // 危險帶首秒：現行 JS 本地 getter 會給 2026-07-02；SQL 端格式化正確給 2026-07-01
      expect(String(r16.appl_date)).toBe('2026-07-01');
      expect(String(r16.appl_date)).not.toBe('2026-07-02');
    });
  });

  describe('APLFMT-EXPORT（真實 exportResult end-to-end）', () => {
    it('TS-P5FU-APLFMT-EXPORT-001：exportResult(csv) 16:00 案件「進件日」= 2026/07/01', async (ctx) => {
      ensure(ctx);
      const svc = makeService();
      // cursorRows PG cursor 語法於 MSSQL 不可用 → 以 manager.query 執行真實 buildExportQuery SQL
      vi.spyOn(
        svc as never as { cursorRows: (q: unknown) => Promise<Readable> },
        'cursorRows',
      ).mockImplementation(async (q: unknown) => {
        const query = q as { sql: string; params: unknown[] };
        const rows = await ds!.manager.query(query.sql, query.params);
        return Readable.from(rows as Iterable<unknown>);
      });
      const out = await svc.exportResult(RUN, 'csv');
      const rows = parseCsv(out.body as string);
      expect(rows[0][5]).toBe('進件日'); // 表頭欄 6
      const dataRows = rows.slice(1);
      const r16 = dataRows.find((c) => c[1] === 'P5FUE03');
      expect(r16, '16:00 案件列存在').toBeDefined();
      expect(r16![5]).toBe('2026/07/01');
      // 全 5 樣本皆正確（含歷史 15:24 與 00:00 安全帶）
      for (const s of SAMPLES) {
        const row = dataRows.find((c) => c[1] === s.applNo);
        expect(row![5], `sample ${s.applNo}`).toBe(s.expectSlash);
      }
    });

    it('TS-P5FU-APLFMT-EXPORT-002：exportResult(xlsx) 同案件同欄位同斷言（共用 formatRow）', async (ctx) => {
      ensure(ctx);
      const svc = makeService();
      vi.spyOn(
        svc as never as { cursorRows: (q: unknown) => Promise<Readable> },
        'cursorRows',
      ).mockImplementation(async (q: unknown) => {
        const query = q as { sql: string; params: unknown[] };
        const rows = await ds!.manager.query(query.sql, query.params);
        return Readable.from(rows as Iterable<unknown>);
      });
      const out = await svc.exportResult(RUN, 'xlsx');
      const buf = out.body as Buffer;
      const wb = new (await import('exceljs')).Workbook();
      await wb.xlsx.load(
        buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
      );
      const sheet = wb.getWorksheet('assignment_result')!;
      let found = false;
      sheet.eachRow((row, idx) => {
        if (idx === 1) return; // 表頭
        if (String(row.getCell(2).value ?? '') === 'P5FUE03') {
          expect(String(row.getCell(6).value ?? '')).toBe('2026/07/01');
          found = true;
        }
      });
      expect(found).toBe(true);
    });
  });
});
