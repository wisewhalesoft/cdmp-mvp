/**
 * F064 v2.0 — 匯出分派結果（23 欄對齊 legacy）測試（SQLite / Unit 層）
 *
 * 對應 test spec：docs/test-specs/features/F064-test.md（v2.0）
 *
 * 本檔涵蓋不需 Postgres 的群組（mock cursorRows / queryRunner，AD-E07-31 §9）：
 *   - COLSEQ（表頭 23 欄 + 欄序，unit 子案）
 *   - REGRESSION（破壞性排除四欄，DoD 紅線）
 *   - FMT（日期格式轉換邊界）
 *   - CR（is_cr='N' NULL→空字串）
 *   - JOINMISS（emphire join-miss fallback + WARNING 彙總）
 *   - OVERDUE（逾期天數恆空保留欄）
 *   - STREAM（CSV PassThrough 逐列、xlsx/CSV 共用 producer、靜態 NoOffset）
 *   - STATUS（月跑未完成阻擋 422）
 *   - AUDIT（after_value 含 4 欄）
 *   - SCOPE（無轄區 → 僅表頭；scope WHERE 注入靜態）
 *   - STATIC（loadAllPayloads 不被 export 呼叫 / EXPORT_HEADER_V2 常數 / getSummary 仍讀 snapshot）
 *
 * COLSRC / DET / APLDATE / 多筆 scope runtime 等需真 join 的群組於
 *   f064-export-23col.pg.spec.ts（PG 真庫）。
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { Readable } from 'stream';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';

import {
  AssignmentRunReportService,
  EXPORT_HEADER_V2,
  RawExportRow,
} from '../assignment-run-report.service';
import { SectionChiefScopeService } from '../section-chief-scope.service';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { AssignmentRunSnapshot } from '@/database/entities/assignment-run-snapshot.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';
import { ObEmplSet } from '@/database/entities/ob-empl-set.entity';
import { ObEmphire } from '@/database/entities/ob-emphire.entity';
import { ObDeptPct } from '@/database/entities/ob-dept-pct.entity';
import { User } from '@/database/entities/user.entity';
import { ERROR_CODES } from '@/common/errors/error-codes';

const YM = '202606';

interface Env {
  service: AssignmentRunReportService;
  runRepo: Repository<AssignmentRun>;
  snapRepo: Repository<AssignmentRunSnapshot>;
  auditRepo: Repository<AssignmentAuditLog>;
  emplSetRepo: Repository<ObEmplSet>;
  app: TestingModule;
}

async function buildModule(): Promise<Env> {
  const app: TestingModule = await Test.createTestingModule({
    imports: [
      TypeOrmModule.forRoot({
        type: 'better-sqlite3',
        database: ':memory:',
        entities: [
          AssignmentRun,
          AssignmentRunSnapshot,
          AssignmentAuditLog,
          ObEmplSet,
          ObEmphire,
          ObDeptPct,
          User,
        ],
        synchronize: true,
      }),
      TypeOrmModule.forFeature([
        AssignmentRun,
        AssignmentRunSnapshot,
        AssignmentAuditLog,
        ObEmplSet,
        ObEmphire,
        ObDeptPct,
        User,
      ]),
    ],
    providers: [AssignmentRunReportService, SectionChiefScopeService],
  }).compile();
  await app.init();
  return {
    service: app.get(AssignmentRunReportService),
    runRepo: app.get(getRepositoryToken(AssignmentRun)),
    snapRepo: app.get(getRepositoryToken(AssignmentRunSnapshot)),
    auditRepo: app.get(getRepositoryToken(AssignmentAuditLog)),
    emplSetRepo: app.get(getRepositoryToken(ObEmplSet)),
    app,
  };
}

async function seedRun(
  repo: Repository<AssignmentRun>,
  overrides: Partial<AssignmentRun> = {},
): Promise<AssignmentRun> {
  return repo.save(
    repo.create({
      project_workym: YM,
      status: 'completed',
      triggered_by: '00000000-0000-0000-0000-000000000001',
      total_cases: 100,
      duration_ms: 1800000,
      finished_at: new Date('2026-06-15T12:30:00Z'),
      created_at: new Date('2026-06-15T12:00:00Z'),
      ...overrides,
    } as Partial<AssignmentRun>),
  );
}

/** 完整 23 欄 raw row（emphire 命中），可帶 overrides 製造各種邊界。 */
function makeRaw(overrides: Partial<RawExportRow> = {}): RawExportRow {
  return {
    dept_name: '台北分處',
    appl_no: 'A2026060001',
    assignday: '20260601',
    list_no: 'OB202606001',
    list_nm: '2026年6月汽車名單',
    appl_date: '2025-03-01',
    cr_id: 'E003',
    cr_nm: '王小明',
    is_cr: 'Y',
    tier_level: 'T2',
    dept_id: 'XVE1',
    emphire_dept_name: '電銷一課',
    emplid: 'E003',
    emp_nm: '王小明',
    title_name: '專員',
    project_tp: '01',
    spec_name: '優質專案',
    overdue_day: null,
    pro_rate: 12.5,
    sta_code: 'A1',
    sta_code_na: '正常',
    brand_name: 'Toyota',
    month_cnt: 3,
    ...overrides,
  };
}

/** 將 service.cursorRows spy 成回傳指定 raw rows 的 Readable（objectMode）。 */
function mockCursor(service: AssignmentRunReportService, rows: RawExportRow[]) {
  return vi
    .spyOn(service as any, 'cursorRows')
    .mockImplementation(async () => Readable.from(rows));
}

function parseCsv(body: string): string[][] {
  // 簡易 CSV 解析（支援 "..." quoting + escaped "")，本測試資料不含換行於欄位內
  return body
    .replace(/^\uFEFF/, '') // F064：去除開頭 UTF-8 BOM（CSV 以 BOM 開頭供 Excel 正確判定 UTF-8 編碼）
    .split('\n')
    .filter((l) => l.length > 0)
    .map((line) => {
      const cells: string[] = [];
      let cur = '';
      let inQ = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQ) {
          if (ch === '"') {
            if (line[i + 1] === '"') {
              cur += '"';
              i++;
            } else {
              inQ = false;
            }
          } else {
            cur += ch;
          }
        } else if (ch === '"') {
          inQ = true;
        } else if (ch === ',') {
          cells.push(cur);
          cur = '';
        } else {
          cur += ch;
        }
      }
      cells.push(cur);
      return cells;
    });
}

describe('F064 v2.0 — 匯出分派結果（23 欄）SQLite/Unit', () => {
  let env: Env;

  beforeAll(async () => {
    env = await buildModule();
  });
  afterAll(async () => {
    await env.app.close();
  });
  beforeEach(async () => {
    await env.auditRepo.createQueryBuilder().delete().execute();
    await env.snapRepo.createQueryBuilder().delete().execute();
    await env.runRepo.createQueryBuilder().delete().execute();
    await env.emplSetRepo.createQueryBuilder().delete().execute();
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // STATIC — 靜態掃描
  // -------------------------------------------------------------------------
  describe('STATIC', () => {
    it('TS-F064-STATIC-002：EXPORT_HEADER_V2 為 23 欄且欄序正確', () => {
      expect(EXPORT_HEADER_V2.length).toBe(23);
      expect([...EXPORT_HEADER_V2]).toEqual([
        '分處',
        '案號',
        '指派日',
        '名單代號',
        '名單名稱',
        '進件日',
        'CR_ID',
        'CR_NM',
        '是否分配CR',
        'TIER',
        '部門代號',
        '部門名稱',
        '員編',
        '姓名',
        '職級',
        '專案類別',
        '專案名稱',
        '逾期天數',
        '客戶利率',
        'STA_CODE',
        '案件狀態',
        '廠牌名稱',
        '名單週期月數',
      ]);
    });

    const SERVICE_SRC = fs.readFileSync(
      path.resolve(__dirname, '../assignment-run-report.service.ts'),
      'utf8',
    );

    function sliceFn(src: string, signature: string): string {
      const start = src.indexOf(signature);
      if (start < 0) throw new Error(`fn not found: ${signature}`);
      // 從簽名往後抓到「下一個 method 宣告 / JSDoc 區塊」邊界，避免越界到下一函式
      const rest = src.slice(start + signature.length);
      const boundary = rest.search(/\n  (private |protected |public |async |\/\*\*|[a-zA-Z]+\()/);
      const end = boundary < 0 ? rest.length : boundary;
      return rest.slice(0, end);
    }

    it('TS-F064-STATIC-001：exportResult 不呼叫 loadAllPayloads（I-EXP-COLSRC-01）', () => {
      const body = sliceFn(SERVICE_SRC, 'async exportResult(');
      expect(body).not.toContain('loadAllPayloads(');
    });

    it('TS-F064-REGRESSION-005：buildExportQuery 不 SELECT 禁止欄位 + 不讀 snapshot', () => {
      const body = sliceFn(SERVICE_SRC, 'private async buildExportQuery(');
      expect(/custo_no|cust_name|card_level|score/i.test(body)).toBe(false);
      expect(/assignment_run_snapshot|\.payload/i.test(body)).toBe(false);
    });

    it('TS-F064-DET-002：buildExportQuery 含確定性 ORDER BY，無 RANDOM/NEWID', () => {
      const body = sliceFn(SERVICE_SRC, 'private async buildExportQuery(');
      expect(body).toContain('ORDER BY r.list_no, r.orgno, r.appl_no');
      expect(/RANDOM\(\)|NEWID\(\)/i.test(body)).toBe(false);
    });

    it('TS-F064-APLDATE-002：欄 6 進件日取 o.appl_date 非 r.appl_date', () => {
      const body = sliceFn(SERVICE_SRC, 'private async buildExportQuery(');
      // SELECT 中 appl_date 來源為 ob_pool_data alias o（I-EXP-LINEAGE-01）
      expect(body).toContain('o.appl_date');
      expect(body).not.toContain('r.appl_date');
    });

    it('TS-F064-LINEAGE-002：buildExportQuery join ob_pool_data（共享池）非 ob_pool_data_list', () => {
      const body = sliceFn(SERVICE_SRC, 'private async buildExportQuery(');
      // 剝除註解（行內 // 與區塊 /* */），只看實際 SQL，避免解釋性註解誤判
      const code = body
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      // INNER JOIN 目標表為 ob_pool_data（by orgno+appl_no），維持血緣不掉列
      expect(/INNER JOIN\s+ob_pool_data\s+o/i.test(code)).toBe(true);
      // 實際 SQL 不得 JOIN ob_pool_data_list（per-list 去重表，會掉列，I-EXP-LINEAGE-01）
      expect(/JOIN\s+ob_pool_data_list/i.test(code)).toBe(false);
    });

    it('TS-F064-STREAM-003 / REGRESSION-006：CSV streaming 無 lines.push/join、無 OFFSET', () => {
      const csvBody = sliceFn(
        SERVICE_SRC,
        'private async buildExportCsvStreaming(',
      );
      expect(csvBody).not.toContain('lines.push(');
      expect(csvBody).not.toContain('lines.join(');
      expect(csvBody).toContain('csvSink.push(');
      const qBody = sliceFn(SERVICE_SRC, 'private async buildExportQuery(');
      expect(/\bOFFSET\b/i.test(qBody)).toBe(false);
    });

    it('TS-F064-SCOPE-005：scope filter 為 SQL WHERE 注入，export 路徑不用 filterByEmplId', () => {
      const exportBody = sliceFn(SERVICE_SRC, 'async exportResult(');
      expect(exportBody).not.toContain('filterByEmplId');
      const qBody = sliceFn(SERVICE_SRC, 'private async buildExportQuery(');
      expect(qBody).toContain('r.emplid IN');
    });

    it('TS-F064-STATIC-003：compareRuns 仍讀 snapshot；getSummary 改 SQL 聚合（I-SUMMARY-SQL-01）', () => {
      // getSummary 效能重構：不再 loadAllPayloads（巨大 result/input_list 快照 → 45s 逾時），
      //   改以 SQL 聚合 ob_monthly_run_result（<1s）；僅載小型 config 快照取 deptPct。
      const getSummary = sliceFn(SERVICE_SRC, 'async getSummary(');
      expect(getSummary).not.toContain('loadAllPayloads(');
      expect(getSummary).toContain('getRepository(ObMonthlyRunResult)');
      expect(getSummary).toContain("snapshot_type: 'config'");
      // compareRuns 仍讀 snapshot（不受本次重構影響）。
      const compareRuns = sliceFn(SERVICE_SRC, 'async compareRuns(');
      expect(compareRuns).toContain('loadAllPayloads(');
    });
  });

  // -------------------------------------------------------------------------
  // COLSEQ — 表頭與欄序
  // -------------------------------------------------------------------------
  describe('COLSEQ', () => {
    it('TS-F064-COLSEQ-002：CSV 表頭恰 23 欄且欄序正確', async () => {
      const run = await seedRun(env.runRepo);
      mockCursor(env.service, [makeRaw()]);
      const out = await env.service.exportResult(run.run_id, 'csv', 'actor-1');
      const rows = parseCsv(out.body as string);
      expect(rows[0].length).toBe(23);
      expect(rows[0]).toEqual([...EXPORT_HEADER_V2]);
    });

    it('TS-F064-BOM-001：CSV 以 UTF-8 BOM(U+FEFF) 開頭（Excel 開啟中文不亂碼）', async () => {
      const run = await seedRun(env.runRepo);
      mockCursor(env.service, [makeRaw()]);
      const out = await env.service.exportResult(run.run_id, 'csv', 'actor-1');
      // U+FEFF：缺此 BOM 時 Excel 以系統 locale(Big5) 解 UTF-8 中文 → 亂碼。
      expect((out.body as string).charCodeAt(0)).toBe(0xfeff);
    });

    it('TS-F064-COLSEQ-001（unit）：xlsx 表頭恰 23 欄', async () => {
      const run = await seedRun(env.runRepo);
      mockCursor(env.service, [makeRaw()]);
      const out = await env.service.exportResult(run.run_id, 'xlsx', 'actor-1');
      const buf = out.body as Buffer;
      const wb = new (await import('exceljs')).Workbook();
      await wb.xlsx.load(
        buf.buffer.slice(
          buf.byteOffset,
          buf.byteOffset + buf.byteLength,
        ) as ArrayBuffer,
      );
      const sheet = wb.getWorksheet('assignment_result')!;
      const header = sheet.getRow(1);
      const values: string[] = [];
      for (let c = 1; c <= 23; c++) {
        values.push(String(header.getCell(c).value ?? ''));
      }
      expect(values).toEqual([...EXPORT_HEADER_V2]);
    });

    it('TS-F064-COLSEQ-003（unit）：worked example 兩筆案件逐欄走查', async () => {
      const run = await seedRun(env.runRepo);
      const c1 = makeRaw(); // CR 案件，emphire 命中
      const c2 = makeRaw({
        dept_name: '台中分處',
        appl_no: 'A2026060099',
        assignday: '20260603',
        appl_date: '2025-08-15',
        cr_id: null,
        cr_nm: null,
        is_cr: 'N',
        tier_level: 'T3',
        dept_id: 'XVE2',
        emphire_dept_name: null,
        emplid: 'X999',
        emp_nm: null,
        title_name: null,
        project_tp: '02',
        spec_name: '一般專案',
        pro_rate: 8.88,
        sta_code: 'B2',
        sta_code_na: '催收中',
        brand_name: 'Honda',
        month_cnt: 6,
      });
      mockCursor(env.service, [c1, c2]);
      const out = await env.service.exportResult(run.run_id, 'csv', 'actor-1');
      const rows = parseCsv(out.body as string);
      // rows[0] = header；rows[1] = c1；rows[2] = c2
      expect(rows[1]).toEqual([
        '台北分處',
        'A2026060001',
        '20260601',
        'OB202606001',
        '2026年6月汽車名單',
        '2025/03/01',
        'E003',
        '王小明',
        'Y',
        'T2',
        'XVE1',
        '電銷一課',
        'E003',
        '王小明',
        '專員',
        '01',
        '優質專案',
        '',
        '12.5',
        'A1',
        '正常',
        'Toyota',
        '3',
      ]);
      expect(rows[2]).toEqual([
        '台中分處',
        'A2026060099',
        '20260603',
        'OB202606001',
        '2026年6月汽車名單',
        '2025/08/15',
        '',
        '',
        'N',
        'T3',
        'XVE2',
        '', // 部門名稱 join-miss
        'X999',
        '', // 姓名 join-miss
        '', // 職級 join-miss
        '02',
        '一般專案',
        '',
        '8.88',
        'B2',
        '催收中',
        'Honda',
        '6',
      ]);
    });

    it('TS-F064-COLSEQ-004：欄 1 分處 ≠ 欄 12 部門名稱（來源獨立）', () => {
      const f = env.service.formatRow(
        makeRaw({ dept_name: '台北分處', emphire_dept_name: '電銷一課' }),
      );
      expect(f.row[0]).toBe('台北分處'); // pool.dept_name
      expect(f.row[11]).toBe('電銷一課'); // emphire dept_name
      expect(f.row[0]).not.toBe(f.row[11]);
    });
  });

  // -------------------------------------------------------------------------
  // REGRESSION — 破壞性排除（DoD 紅線）
  // -------------------------------------------------------------------------
  describe('REGRESSION', () => {
    const forbidden = /custo_no|cust_name|card_level|score/i;

    it('TS-F064-REGRESSION-001/002：xlsx 表頭不含 custo_no/cust_name/card_level/score', async () => {
      const run = await seedRun(env.runRepo);
      mockCursor(env.service, [makeRaw()]);
      const out = await env.service.exportResult(run.run_id, 'xlsx', 'actor-1');
      const buf = out.body as Buffer;
      const wb = new (await import('exceljs')).Workbook();
      await wb.xlsx.load(
        buf.buffer.slice(
          buf.byteOffset,
          buf.byteOffset + buf.byteLength,
        ) as ArrayBuffer,
      );
      const sheet = wb.getWorksheet('assignment_result')!;
      const header = sheet.getRow(1);
      const headers: string[] = [];
      for (let c = 1; c <= 23; c++) headers.push(String(header.getCell(c).value ?? ''));
      expect(headers.some((h) => forbidden.test(h))).toBe(false);
    });

    it('TS-F064-REGRESSION-003：CSV 表頭不含四禁止欄位', async () => {
      const run = await seedRun(env.runRepo);
      mockCursor(env.service, [makeRaw()]);
      const out = await env.service.exportResult(run.run_id, 'csv', 'actor-1');
      const headers = parseCsv(out.body as string)[0];
      expect(headers.some((h) => forbidden.test(h))).toBe(false);
    });

    it('TS-F064-REGRESSION-004：formatRow 輸出恰 23 欄', () => {
      const f = env.service.formatRow(makeRaw());
      expect(f.row.length).toBe(23);
    });
  });

  // -------------------------------------------------------------------------
  // FMT — 日期格式
  // -------------------------------------------------------------------------
  describe('FMT', () => {
    it('TS-F064-FMT-001：assignday 整數字串 → YYYYMMDD（string）', () => {
      const f = env.service.formatRow(makeRaw({ assignday: '20260601' }));
      expect(f.row[2]).toBe('20260601');
      expect(typeof f.row[2]).toBe('string');
    });

    it('TS-F064-FMT-002：assignday ISO 字串 → YYYYMMDD（移除 -）', () => {
      const f = env.service.formatRow(makeRaw({ assignday: '2026-06-01' }));
      expect(f.row[2]).toBe('20260601');
      expect(f.row[2]).not.toContain('-');
    });

    it('TS-F064-FMT-003/004：assignday leading-zero 不遺失', () => {
      expect(env.service.formatRow(makeRaw({ assignday: '2026-06-01' })).row[2]).toBe(
        '20260601',
      );
      expect(env.service.formatRow(makeRaw({ assignday: '20260601' })).row[2]).toBe(
        '20260601',
      );
    });

    it('TS-F064-FMT-005：appl_date Date 物件 → YYYY/MM/DD', () => {
      const f = env.service.formatRow(
        makeRaw({ appl_date: new Date('2026-03-15T00:00:00Z') }),
      );
      expect(f.row[5]).toBe('2026/03/15');
      expect(f.row[5]).not.toContain('-');
    });

    it('TS-F064-FMT-006：appl_date 字串 → YYYY/MM/DD', () => {
      const f = env.service.formatRow(makeRaw({ appl_date: '2025-08-15' }));
      expect(f.row[5]).toBe('2025/08/15');
    });

    it('TS-F064-FMT-007：appl_date 月份 leading-zero 保留', () => {
      const f = env.service.formatRow(makeRaw({ appl_date: '2025-03-01' }));
      expect(f.row[5]).toBe('2025/03/01');
    });

    it('TS-F064-FMT-008：兩日期欄位輸出為 string 型別', () => {
      const f = env.service.formatRow(makeRaw());
      expect(typeof f.row[2]).toBe('string');
      expect(typeof f.row[5]).toBe('string');
    });
  });

  // -------------------------------------------------------------------------
  // CR — CR 三欄
  // -------------------------------------------------------------------------
  describe('CR', () => {
    it('TS-F064-CR-002：is_cr=N 時 CR_ID/CR_NM 輸出空字串', () => {
      const f = env.service.formatRow(
        makeRaw({ is_cr: 'N', cr_id: null, cr_nm: null }),
      );
      expect(f.row[6]).toBe(''); // CR_ID
      expect(f.row[7]).toBe(''); // CR_NM
      expect(f.row[8]).toBe('N'); // 是否分配CR
    });

    it('TS-F064-CR-001（unit）：is_cr=Y 時三欄有值', () => {
      const f = env.service.formatRow(
        makeRaw({ is_cr: 'Y', cr_id: 'E003', cr_nm: '王小明' }),
      );
      expect(f.row[6]).toBe('E003');
      expect(f.row[7]).toBe('王小明');
      expect(f.row[8]).toBe('Y');
    });
  });

  // -------------------------------------------------------------------------
  // JOINMISS — emphire join-miss fallback
  // -------------------------------------------------------------------------
  describe('JOINMISS', () => {
    it('TS-F064-JOINMISS-001/002：join-miss 時欄 12/14/15 空、欄 13 員編原值', () => {
      const f = env.service.formatRow(
        makeRaw({
          emplid: 'X999',
          emphire_dept_name: null,
          emp_nm: null,
          title_name: null,
        }),
      );
      expect(f.row[11]).toBe(''); // 部門名稱
      expect(f.row[12]).toBe('X999'); // 員編
      expect(f.row[13]).toBe(''); // 姓名
      expect(f.row[14]).toBe(''); // 職級
      expect(f.empJoinMiss).toBe(true);
      expect(f.emplid).toBe('X999');
    });

    it('TS-F064-COLSRC-004：list_def join-miss → 名單名稱空、不拋例外', () => {
      const f = env.service.formatRow(makeRaw({ list_nm: null }));
      expect(f.row[4]).toBe('');
    });

    it('TS-F064-JOINMISS-003：join-miss 不中斷整體匯出（3 列輸出）', async () => {
      const run = await seedRun(env.runRepo);
      mockCursor(env.service, [
        makeRaw({ emplid: 'E1' }),
        makeRaw({
          emplid: 'X999',
          emphire_dept_name: null,
          emp_nm: null,
          title_name: null,
        }),
        makeRaw({ emplid: 'E3' }),
      ]);
      const out = await env.service.exportResult(run.run_id, 'csv', 'actor-1');
      const rows = parseCsv(out.body as string);
      expect(rows.length).toBe(4); // header + 3
      expect(out.rowCount).toBe(3);
      // 第 2 列（index 2）join-miss → 欄 12/14/15 空
      expect(rows[2][11]).toBe('');
      expect(rows[2][13]).toBe('');
      expect(rows[2][14]).toBe('');
    });

    it('TS-F064-JOINMISS-004：join-miss 後記一筆 WARNING log（彙總含 emplid + run_id）', async () => {
      const run = await seedRun(env.runRepo);
      const warnSpy = vi
        .spyOn((env.service as any).logger, 'warn')
        .mockImplementation(() => undefined);
      mockCursor(env.service, [
        makeRaw({ emplid: 'X999', emphire_dept_name: null, emp_nm: null, title_name: null }),
        makeRaw({ emplid: 'Y888', emphire_dept_name: null, emp_nm: null, title_name: null }),
      ]);
      await env.service.exportResult(run.run_id, 'csv', 'actor-1');
      expect(warnSpy).toHaveBeenCalledTimes(1);
      const msg = String(warnSpy.mock.calls[0][0]);
      expect(msg).toContain('X999');
      expect(msg).toContain('Y888');
      expect(msg).toContain(run.run_id);
    });

    it('TS-F064-JOINMISS-005：join-miss > 100 筆時 log 補 truncated 標示', async () => {
      const run = await seedRun(env.runRepo);
      const warnSpy = vi
        .spyOn((env.service as any).logger, 'warn')
        .mockImplementation(() => undefined);
      const rows: RawExportRow[] = [];
      for (let i = 0; i < 150; i++) {
        rows.push(
          makeRaw({
            emplid: `M${i}`,
            emphire_dept_name: null,
            emp_nm: null,
            title_name: null,
          }),
        );
      }
      mockCursor(env.service, rows);
      await env.service.exportResult(run.run_id, 'csv', 'actor-1');
      expect(warnSpy).toHaveBeenCalledTimes(1);
      const msg = String(warnSpy.mock.calls[0][0]);
      expect(msg).toContain('truncated to 100 of 150');
      // 列出的 emplid 數量 ≤ 100
      const listed = (msg.match(/M\d+/g) ?? []).length;
      expect(listed).toBeLessThanOrEqual(100);
    });
  });

  // -------------------------------------------------------------------------
  // OVERDUE — 逾期天數恆空
  // -------------------------------------------------------------------------
  describe('OVERDUE', () => {
    it('TS-F064-OVERDUE-001：overdue_day NULL → 空字串', () => {
      const f = env.service.formatRow(makeRaw({ overdue_day: null }));
      expect(f.row[17]).toBe('');
    });

    it('TS-F064-OVERDUE-002：表頭仍保留「逾期天數」欄', () => {
      expect(EXPORT_HEADER_V2[17]).toBe('逾期天數');
      expect(EXPORT_HEADER_V2[16]).toBe('專案名稱');
      expect(EXPORT_HEADER_V2[18]).toBe('客戶利率');
    });
  });

  // -------------------------------------------------------------------------
  // STREAM — streaming 機制
  // -------------------------------------------------------------------------
  describe('STREAM', () => {
    it('TS-F064-STREAM-001：xlsx / CSV 共用 row-producer（cursorRows 各呼叫一次）', async () => {
      const run = await seedRun(env.runRepo);
      const rows = new Array(10).fill(0).map((_, i) => makeRaw({ appl_no: `A${i}` }));
      const spy = mockCursor(env.service, rows);
      const xlsx = await env.service.exportResult(run.run_id, 'xlsx', 'actor-1');
      const csv = await env.service.exportResult(run.run_id, 'csv', 'actor-1');
      expect(spy).toHaveBeenCalledTimes(2); // 各路徑各一次
      expect(xlsx.rowCount).toBe(10);
      expect(csv.rowCount).toBe(10);
      expect(Buffer.isBuffer(xlsx.body)).toBe(true);
      expect(typeof csv.body).toBe('string');
    });

    it('TS-F064-STREAM-002：CSV 路徑逐列 push（push 次數 = 1 header + N 資料）', async () => {
      const run = await seedRun(env.runRepo);
      const n = 100;
      const rows = new Array(n).fill(0).map((_, i) => makeRaw({ appl_no: `A${i}` }));
      mockCursor(env.service, rows);
      const pushSpy = vi.spyOn(
        (await import('stream')).PassThrough.prototype,
        'push',
      );
      await env.service.exportResult(run.run_id, 'csv', 'actor-1');
      // header push(1) + N row push(N)；end() 不算 push。允許 >= 因 xlsx sink 不在此路徑
      const dataPushes = pushSpy.mock.calls.filter(
        (c) => typeof c[0] === 'string' || Buffer.isBuffer(c[0]),
      );
      expect(dataPushes.length).toBeGreaterThanOrEqual(n + 1);
      pushSpy.mockRestore();
    });
  });

  // -------------------------------------------------------------------------
  // STATUS — 月跑未完成阻擋
  // -------------------------------------------------------------------------
  describe('STATUS', () => {
    it.each(['pending', 'running', 'failed'])(
      'TS-F064-STATUS：status=%s → 422 ASSIGNMENT_RUN_NOT_COMPLETED',
      async (status) => {
        const run = await seedRun(env.runRepo, { status });
        await expect(
          env.service.exportResult(run.run_id, 'csv', 'actor-1'),
        ).rejects.toMatchObject({
          response: { error: ERROR_CODES.ASSIGNMENT_RUN_NOT_COMPLETED },
        });
      },
    );

    it('TS-F064-STATUS-004：status=completed → 允許匯出', async () => {
      const run = await seedRun(env.runRepo, { status: 'completed' });
      mockCursor(env.service, [makeRaw()]);
      const out = await env.service.exportResult(run.run_id, 'csv', 'actor-1');
      expect(out.rowCount).toBe(1);
    });

    it('TS-F064-AUTH-003：run_id 不存在 → 404 ASSIGNMENT_RUN_NOT_FOUND', async () => {
      await expect(
        env.service.exportResult('nonexistent-uuid', 'csv', 'actor-1'),
      ).rejects.toMatchObject({
        response: { error: ERROR_CODES.ASSIGNMENT_RUN_NOT_FOUND },
      });
    });
  });

  // -------------------------------------------------------------------------
  // AUDIT — 稽核 log
  // -------------------------------------------------------------------------
  describe('AUDIT', () => {
    it('TS-F064-AUDIT-001：xlsx 匯出寫 after_value 含 4 欄（director / scopedByCreator=false）', async () => {
      const run = await seedRun(env.runRepo);
      mockCursor(env.service, [makeRaw(), makeRaw(), makeRaw(), makeRaw(), makeRaw()]);
      await env.service.exportResult(run.run_id, 'xlsx', 'actor-1', {
        userId: 'actor-1',
        role: 'user',
        businessRole: 'director',
      });
      const logs = await env.auditRepo.find();
      expect(logs.length).toBe(1);
      expect(logs[0]).toMatchObject({
        action: 'EXPORT',
        entity_type: 'assignment_run',
        entity_id: run.run_id,
        actor_id: 'actor-1',
      });
      expect(logs[0].after_value).toEqual({
        format: 'xlsx',
        actorBusinessRole: 'director',
        scopedByCreator: false,
        exportedRowCount: 5,
      });
    });

    it('TS-F064-AUDIT-002：section_chief CSV 匯出 after_value scopedByCreator=true', async () => {
      const run = await seedRun(env.runRepo);
      // section_chief 轄區 emplid = E003（makeRaw 預設），seed empl_set
      await env.emplSetRepo.save(
        env.emplSetRepo.create({
          list_no: 'OB202606001',
          deptid_m: 'XVE1',
          emplid: 'E003',
          ration: '50' as unknown as string,
          prod_type: null,
          created_by_prog: 'TEST',
          created_by: 'sc-1',
          created_at: new Date(),
          updated_by_prog: 'TEST',
          updated_by: 'sc-1',
          updated_at: new Date(),
        } as Partial<ObEmplSet>),
      );
      mockCursor(env.service, new Array(30).fill(0).map(() => makeRaw()));
      await env.service.exportResult(run.run_id, 'csv', 'sc-1', {
        userId: 'sc-1',
        role: 'user',
        businessRole: 'section_chief',
      });
      const logs = await env.auditRepo.find();
      expect(logs[0].after_value).toEqual({
        format: 'csv',
        actorBusinessRole: 'section_chief',
        scopedByCreator: true,
        exportedRowCount: 30,
      });
    });
  });

  // -------------------------------------------------------------------------
  // SCOPE — 處長 scope（unit / 無轄區邊界）
  // -------------------------------------------------------------------------
  describe('SCOPE', () => {
    it('TS-F064-SCOPE-004：section_chief 無轄區 → 200 + 僅表頭（0 資料列）', async () => {
      const run = await seedRun(env.runRepo);
      // 無 empl_set 記錄 → getScopeEmplIds 空集合 → buildExportQuery 注入 1=0
      // cursorRows 真實會回 0 列；此處 mock 回 0 列模擬 SQL 結果
      const spy = mockCursor(env.service, []);
      const out = await env.service.exportResult(run.run_id, 'csv', 'sc-empty', {
        userId: 'sc-empty',
        role: 'user',
        businessRole: 'section_chief',
      });
      const rows = parseCsv(out.body as string);
      expect(rows.length).toBe(1); // 僅表頭
      expect(out.rowCount).toBe(0);
      // 驗證注入 query 含 scope 限縮（1=0）
      const querySpec = spy.mock.calls[0][0] as { sql: string; scopedByCreator: boolean };
      expect(querySpec.scopedByCreator).toBe(true);
      expect(querySpec.sql).toContain('1 = 0');
    });

    it('TS-F064-SCOPE-001（unit）：section_chief 有轄區 → SQL 含 emplid IN', async () => {
      const run = await seedRun(env.runRepo);
      await env.emplSetRepo.save(
        env.emplSetRepo.create({
          list_no: 'OB202606001',
          deptid_m: 'XVE1',
          emplid: 'E003',
          ration: '50' as unknown as string,
          prod_type: null,
          created_by_prog: 'TEST',
          created_by: 'sc-1',
          created_at: new Date(),
          updated_by_prog: 'TEST',
          updated_by: 'sc-1',
          updated_at: new Date(),
        } as Partial<ObEmplSet>),
      );
      const spy = mockCursor(env.service, [makeRaw()]);
      await env.service.exportResult(run.run_id, 'csv', 'sc-1', {
        userId: 'sc-1',
        role: 'user',
        businessRole: 'section_chief',
      });
      const querySpec = spy.mock.calls[0][0] as { sql: string; params: unknown[] };
      expect(querySpec.sql).toContain('r.emplid IN');
      expect(querySpec.params).toContain('E003');
    });

    it('TS-F064-SCOPE-002（unit）：director → SQL 不含 scope 子句', async () => {
      const run = await seedRun(env.runRepo);
      const spy = mockCursor(env.service, [makeRaw()]);
      await env.service.exportResult(run.run_id, 'csv', 'dir-1', {
        userId: 'dir-1',
        role: 'user',
        businessRole: 'director',
      });
      const querySpec = spy.mock.calls[0][0] as { sql: string; scopedByCreator: boolean };
      expect(querySpec.scopedByCreator).toBe(false);
      expect(querySpec.sql).not.toContain('r.emplid IN');
    });
  });

  // -------------------------------------------------------------------------
  // 檔名 — AC-1
  // -------------------------------------------------------------------------
  describe('FILENAME', () => {
    it('TS-F064-AC1：檔名 assignment_result_{project_workym}_{8碼}.csv/xlsx', async () => {
      const run = await seedRun(env.runRepo);
      mockCursor(env.service, [makeRaw()]);
      const csv = await env.service.exportResult(run.run_id, 'csv', 'a');
      expect(csv.filename).toMatch(
        new RegExp(`^assignment_result_${YM}_[a-z0-9]{8}\\.csv$`),
      );
      mockCursor(env.service, [makeRaw()]);
      const xlsx = await env.service.exportResult(run.run_id, 'xlsx', 'a');
      expect(xlsx.filename).toMatch(
        new RegExp(`^assignment_result_${YM}_[a-z0-9]{8}\\.xlsx$`),
      );
    });
  });
});
