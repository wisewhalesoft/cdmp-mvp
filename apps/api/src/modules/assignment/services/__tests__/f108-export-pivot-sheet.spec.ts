/**
 * F108 — 匯出新增「樞紐分析」頁籤（部門×員編×名單代號 % of parent row 靜態交叉表）
 *
 * 對應 test spec：docs/test-specs/features/F108-test.md（40 TC，本檔涵蓋 38 個不需 Postgres 之 TC）
 *   SHEET / HEADER / PARENTROW / ZEROBLANK / DET / BLANK / SCOPE / EMPTY / REGRESSION / STATIC
 *
 * Oracle 唯一來源：F108 spec §6 Worked Example（2 部門 / 3 員編 / 2 名單代號）+ §6.4（(空白) 群組）
 *   + AD-E07-v3.7 §9 逐格驗算表。
 *
 * Mock 策略：沿用 f064-export-23col.spec.ts —— spy protected `cursorRows` 回傳固定 RawExportRow[]
 *   （Readable objectMode）→ 呼叫 exportResult(runId,'xlsx'|'csv') → 以 exceljs `wb.xlsx.load(buffer)`
 *   讀回 Buffer → 斷言第 2 頁「樞紐分析」格子值 / numFmt / 排序。
 *
 * 需 Postgres 之 PG-001/002 於 f108-export-pivot-sheet.pg.spec.ts。
 * tsc gate（STATIC-003）於 Phase C 以 `tsc --noEmit -p tsconfig.build.json` 驗（vitest 不做型別檢查）。
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { Readable } from 'stream';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import * as ExcelJS from 'exceljs';

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

const YM = '202606';
const L1 = 'OB202606001';
const L2 = 'OB202606007';
const L3 = 'OB202606013';

const ACTOR_DIRECTOR = { userId: 'dir-001', role: 'user', businessRole: 'director' };
const ACTOR_SECTION_CHIEF = {
  userId: 'sc-001',
  role: 'user',
  businessRole: 'section_chief',
};

interface Env {
  service: AssignmentRunReportService;
  runRepo: Repository<AssignmentRun>;
  auditRepo: Repository<AssignmentAuditLog>;
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
    auditRepo: app.get(getRepositoryToken(AssignmentAuditLog)),
    app,
  };
}

async function seedRun(repo: Repository<AssignmentRun>): Promise<AssignmentRun> {
  return repo.save(
    repo.create({
      project_workym: YM,
      status: 'completed',
      triggered_by: '00000000-0000-0000-0000-000000000001',
      total_cases: 100,
      duration_ms: 1800000,
      finished_at: new Date('2026-06-15T12:30:00Z'),
      created_at: new Date('2026-06-15T12:00:00Z'),
    } as Partial<AssignmentRun>),
  );
}

/** 產生完整 23 欄 RawExportRow（pivot 只用 emphire_dept_name / emplid / list_no 三欄）。 */
function makePivotRaw(
  dept: string | null,
  emplid: string | null,
  listNo: string | null,
  i: number,
): RawExportRow {
  return {
    dept_name: '台北分處',
    appl_no: `A${String(i).padStart(6, '0')}`,
    assignday: '20260601',
    list_no: listNo,
    list_nm: '名單',
    appl_date: '2025-03-01',
    cr_id: null,
    cr_nm: null,
    is_cr: 'N',
    tier_level: 'T2',
    dept_id: 'XVE1',
    emphire_dept_name: dept,
    emplid,
    emp_nm: dept ? '姓名' : null,
    title_name: dept ? '專員' : null,
    project_tp: '01',
    spec_name: '專案',
    overdue_day: null,
    pro_rate: 12.5,
    sta_code: 'A1',
    sta_code_na: '正常',
    brand_name: 'Toyota',
    month_cnt: 3,
  };
}

interface CellSpec {
  dept: string | null;
  emplid: string | null;
  listNo: string | null;
  count: number;
}

function expand(specs: CellSpec[]): RawExportRow[] {
  const rows: RawExportRow[] = [];
  let i = 0;
  for (const s of specs) {
    for (let k = 0; k < s.count; k++) {
      rows.push(makePivotRaw(s.dept, s.emplid, s.listNo, i++));
    }
  }
  return rows;
}

/** spec §6.1 合成資料集（20 筆，2 部門 / 3 員編 / 2 名單代號）。 */
function dataset20(): RawExportRow[] {
  return expand([
    { dept: '北區電銷1', emplid: 'E1', listNo: L1, count: 6 },
    { dept: '北區電銷1', emplid: 'E1', listNo: L2, count: 2 },
    { dept: '北區電銷1', emplid: 'E2', listNo: L1, count: 2 },
    { dept: '南區電銷', emplid: 'E3', listNo: L1, count: 2 },
    { dept: '南區電銷', emplid: 'E3', listNo: L2, count: 8 },
  ]);
}

function mockCursor(service: AssignmentRunReportService, rows: RawExportRow[]) {
  return vi
    .spyOn(service as unknown as { cursorRows: unknown }, 'cursorRows')
    .mockImplementation(async () => Readable.from(rows));
}

async function loadXlsx(body: string | Buffer): Promise<ExcelJS.Workbook> {
  const buf = body as Buffer;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
  );
  return wb;
}

function colA(ws: ExcelJS.Worksheet, r: number): string {
  return String(ws.getRow(r).getCell(1).value ?? '');
}

/** 掃描 A 欄找第一個 label 出現的列號（找不到回 -1）。 */
function findRow(ws: ExcelJS.Worksheet, label: string): number {
  for (let r = 1; r <= ws.rowCount; r++) {
    if (colA(ws, r) === label) return r;
  }
  return -1;
}

function near(actual: unknown, expected: number, tol = 1e-9): void {
  expect(typeof actual).toBe('number');
  expect(Math.abs((actual as number) - expected)).toBeLessThan(tol);
}

function parseCsv(body: string): string[][] {
  return body
    .replace(/^﻿/, '')
    .split('\n')
    .filter((l) => l.length > 0)
    .map((line) => line.split(','));
}

// 樞紐「專屬」標籤（不存在於 23 欄明細表頭）。
// 注意：test 設計原列含「部門代號」，但該詞為明細第 11 欄合法欄名（EXPORT_HEADER_V2[10]），
//   並非樞紐專屬；明細表頭完整性已由 toEqual(EXPORT_HEADER_V2) 鎖定，故 not-contain 僅檢查真正專屬標籤。
const PIVOT_ONLY_HEADERS = ['樞紐分析', '計數 - 案號', '列標籤'];

describe('F108 — 匯出樞紐分析頁籤（SQLite / Unit）', () => {
  let env: Env;

  beforeAll(async () => {
    env = await buildModule();
  });
  afterAll(async () => {
    await env.app.close();
  });
  beforeEach(async () => {
    await env.auditRepo.createQueryBuilder().delete().execute();
    await env.runRepo.createQueryBuilder().delete().execute();
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // 一、SHEET — 頁籤結構與 CSV 不含樞紐
  // ===========================================================================
  describe('SHEET', () => {
    it('TS-F108-SHEET-001：xlsx workbook 恰好含 2 個工作表', async () => {
      const run = await seedRun(env.runRepo);
      mockCursor(env.service, dataset20());
      const out = await env.service.exportResult(run.run_id, 'xlsx', 'actor-1', ACTOR_DIRECTOR);
      const wb = await loadXlsx(out.body);
      expect(wb.worksheets.length).toBe(2);
    });

    it('TS-F108-SHEET-002：頁籤名稱與順序正確', async () => {
      const run = await seedRun(env.runRepo);
      mockCursor(env.service, dataset20());
      const out = await env.service.exportResult(run.run_id, 'xlsx', 'actor-1', ACTOR_DIRECTOR);
      const wb = await loadXlsx(out.body);
      expect(wb.worksheets[0].name).toBe('assignment_result');
      expect(wb.worksheets[1].name).toBe('樞紐分析');
    });

    it('TS-F108-SHEET-003：CSV 匯出不含樞紐頁籤（純文字 23 欄）', async () => {
      const run = await seedRun(env.runRepo);
      mockCursor(env.service, dataset20().slice(0, 5));
      const out = await env.service.exportResult(run.run_id, 'csv', 'actor-1', ACTOR_DIRECTOR);
      expect(typeof out.body).toBe('string');
      expect(out.contentType).toContain('text/csv');
      const rows = parseCsv(out.body as string);
      expect(rows[0].length).toBe(23);
      expect(rows[0]).toEqual([...EXPORT_HEADER_V2]);
      for (const h of PIVOT_ONLY_HEADERS) {
        expect(rows[0]).not.toContain(h);
      }
    });

    it('TS-F108-SHEET-004（靜態）：buildExportCsvStreaming 不含 pivot 呼叫', () => {
      const csv = sliceFn(SERVICE_SRC, 'private async buildExportCsvStreaming(');
      for (const kw of [
        'addWorksheet',
        'accumulatePivot',
        'createPivotAggregation',
        'writePivotSheet',
        'pivotAgg',
      ]) {
        expect(csv).not.toContain(kw);
      }
    });
  });

  // ===========================================================================
  // 二、HEADER — 版面標頭列
  // ===========================================================================
  describe('HEADER', () => {
    async function pivotOf(): Promise<ExcelJS.Worksheet> {
      const run = await seedRun(env.runRepo);
      mockCursor(env.service, dataset20());
      const out = await env.service.exportResult(run.run_id, 'xlsx', 'actor-1', ACTOR_DIRECTOR);
      const wb = await loadXlsx(out.body);
      return wb.worksheets[1];
    }

    it('TS-F108-HEADER-001：R1 = 部門代號 / (全部)', async () => {
      const ws = await pivotOf();
      expect(ws.getCell('A1').value).toBe('部門代號');
      expect(ws.getCell('B1').value).toBe('(全部)');
    });

    it('TS-F108-HEADER-002：R2 為空列', async () => {
      const ws = await pivotOf();
      const row = ws.getRow(2);
      for (let c = 1; c <= 5; c++) {
        const v = row.getCell(c).value;
        expect(v === null || v === undefined || v === '').toBe(true);
      }
    });

    it('TS-F108-HEADER-003：R3 = 計數 - 案號 / 欄標籤', async () => {
      const ws = await pivotOf();
      expect(ws.getCell('A3').value).toBe('計數 - 案號');
      expect(ws.getCell('B3').value).toBe('欄標籤');
    });

    it('TS-F108-HEADER-004：R4 = 列標籤 / listNo 升冪 / 總計', async () => {
      const ws = await pivotOf();
      expect(ws.getCell('A4').value).toBe('列標籤');
      expect(ws.getCell('B4').value).toBe(L1);
      expect(ws.getCell('C4').value).toBe(L2);
      expect(ws.getCell('D4').value).toBe('總計');
    });
  });

  // ===========================================================================
  // 三、PARENTROW — % of parent row 逐格 oracle
  // ===========================================================================
  describe('PARENTROW', () => {
    async function pivotOf(): Promise<ExcelJS.Worksheet> {
      const run = await seedRun(env.runRepo);
      mockCursor(env.service, dataset20());
      const out = await env.service.exportResult(run.run_id, 'xlsx', 'actor-1', ACTOR_DIRECTOR);
      const wb = await loadXlsx(out.body);
      return wb.worksheets[1];
    }

    it('TS-F108-PARENTROW-001：spec §6.2 全 18 格逐格 oracle', async () => {
      const ws = await pivotOf();
      // 列順序：R5 北區電銷1 / R6 E1 / R7 E2 / R8 南區電銷 / R9 E3 / R10 總計
      expect(colA(ws, 5)).toBe('北區電銷1');
      near(ws.getCell('B5').value, 0.8);
      near(ws.getCell('C5').value, 0.2);
      near(ws.getCell('D5').value, 0.5);

      expect(colA(ws, 6)).toBe('E1');
      near(ws.getCell('B6').value, 0.75);
      near(ws.getCell('C6').value, 1.0);
      near(ws.getCell('D6').value, 0.8);

      expect(colA(ws, 7)).toBe('E2');
      near(ws.getCell('B7').value, 0.25);
      near(ws.getCell('C7').value, 0.0);
      near(ws.getCell('D7').value, 0.2);

      expect(colA(ws, 8)).toBe('南區電銷');
      near(ws.getCell('B8').value, 0.2);
      near(ws.getCell('C8').value, 0.8);
      near(ws.getCell('D8').value, 0.5);

      expect(colA(ws, 9)).toBe('E3');
      near(ws.getCell('B9').value, 1.0);
      near(ws.getCell('C9').value, 1.0);
      near(ws.getCell('D9').value, 1.0);

      expect(colA(ws, 10)).toBe('總計');
      near(ws.getCell('B10').value, 1.0);
      near(ws.getCell('C10').value, 1.0);
      near(ws.getCell('D10').value, 1.0);
    });

    it('TS-F108-PARENTROW-002：同欄各部門列加總 = 100%', async () => {
      const ws = await pivotOf();
      const sum1 = (ws.getCell('B5').value as number) + (ws.getCell('B8').value as number);
      const sum2 = (ws.getCell('C5').value as number) + (ws.getCell('C8').value as number);
      const sum3 = (ws.getCell('D5').value as number) + (ws.getCell('D8').value as number);
      expect(Math.abs(sum1 - 1.0)).toBeLessThan(1e-3);
      expect(Math.abs(sum2 - 1.0)).toBeLessThan(1e-3);
      expect(Math.abs(sum3 - 1.0)).toBeLessThan(1e-3);
    });

    it('TS-F108-PARENTROW-003：同部門同欄員編列加總 ≈ 100%', async () => {
      const ws = await pivotOf();
      // 北區電銷1：E1(R6) + E2(R7)
      const nL1 = (ws.getCell('B6').value as number) + (ws.getCell('B7').value as number);
      const nL2 = (ws.getCell('C6').value as number) + (ws.getCell('C7').value as number);
      const nT = (ws.getCell('D6').value as number) + (ws.getCell('D7').value as number);
      expect(Math.abs(nL1 - 1.0)).toBeLessThan(1e-3);
      expect(Math.abs(nL2 - 1.0)).toBeLessThan(1e-3);
      expect(Math.abs(nT - 1.0)).toBeLessThan(1e-3);
      // 南區電銷：E3(R9) 單一員編
      expect(Math.abs((ws.getCell('B9').value as number) - 1.0)).toBeLessThan(1e-3);
      expect(Math.abs((ws.getCell('C9').value as number) - 1.0)).toBeLessThan(1e-3);
      expect(Math.abs((ws.getCell('D9').value as number) - 1.0)).toBeLessThan(1e-3);
    });

    it('TS-F108-PARENTROW-004：總計列每欄值 = 1.000', async () => {
      const ws = await pivotOf();
      near(ws.getCell('B10').value, 1.0);
      near(ws.getCell('C10').value, 1.0);
      near(ws.getCell('D10').value, 1.0);
    });

    it('TS-F108-PARENTROW-005：部門列總計欄 = 部門全部 ÷ 全體', async () => {
      const ws = await pivotOf();
      near(ws.getCell('D5').value, 0.5);
      near(ws.getCell('D8').value, 0.5);
      const sum = (ws.getCell('D5').value as number) + (ws.getCell('D8').value as number);
      expect(Math.abs(sum - 1.0)).toBeLessThan(1e-3);
    });

    it('TS-F108-PARENTROW-006：員編列總計欄 = 員編全部 ÷ 所屬部門全部', async () => {
      const ws = await pivotOf();
      near(ws.getCell('D6').value, 0.8); // E1 = 8/10
      near(ws.getCell('D7').value, 0.2); // E2 = 2/10
      near(ws.getCell('D9').value, 1.0); // E3 = 10/10
    });

    it('TS-F108-PARENTROW-007：所有數值儲存格 numFmt = 0.0%', async () => {
      const ws = await pivotOf();
      for (let r = 5; r <= 10; r++) {
        for (const col of ['B', 'C', 'D']) {
          expect(ws.getCell(`${col}${r}`).numFmt).toBe('0.0%');
        }
      }
      // 含 E2-L2（C7 = 0，非 null）的 numFmt 亦為 0.0%
      expect(ws.getCell('C7').value).toBe(0);
      expect(ws.getCell('C7').numFmt).toBe('0.0%');
    });
  });

  // ===========================================================================
  // 四、ZEROBLANK — 除零保護
  // ===========================================================================
  describe('ZEROBLANK', () => {
    it('TS-F108-ZEROBLANK-001：分子=0、分母>0 → 值=0（0.0%），非 null', async () => {
      const run = await seedRun(env.runRepo);
      mockCursor(env.service, dataset20());
      const out = await env.service.exportResult(run.run_id, 'xlsx', 'actor-1', ACTOR_DIRECTOR);
      const ws = (await loadXlsx(out.body)).worksheets[1];
      const c7 = ws.getCell('C7'); // E2 / OB202606007
      expect(c7.value).not.toBeNull();
      expect(c7.value).not.toBeUndefined();
      near(c7.value, 0.0);
      expect(c7.numFmt).toBe('0.0%');
    });

    it('TS-F108-ZEROBLANK-002：部門在某欄 deptByList=0 → 員編列對應欄為空白', async () => {
      const run = await seedRun(env.runRepo);
      // 部門甲(EA) 在 L1 ×3；部門乙(EB) 在 L2 ×2；無甲-L2、乙-L1
      mockCursor(
        env.service,
        expand([
          { dept: '部門甲', emplid: 'EA', listNo: L1, count: 3 },
          { dept: '部門乙', emplid: 'EB', listNo: L2, count: 2 },
        ]),
      );
      const out = await env.service.exportResult(run.run_id, 'xlsx', 'actor-1', ACTOR_DIRECTOR);
      const ws = (await loadXlsx(out.body)).worksheets[1];
      const ea = findRow(ws, 'EA');
      expect(ea).toBeGreaterThan(0);
      // 欄序：B=L1, C=L2, D=總計
      expect(ws.getCell(`C${ea}`).value).toBeNull(); // 甲-EA 在 L2 → 0/0 → 空白
      near(ws.getCell(`B${ea}`).value, 1.0); // 甲-EA 在 L1 → 3/3
    });

    it('TS-F108-ZEROBLANK-003：部門列分子=0、分母>0 → 0.0%，非空白', async () => {
      const run = await seedRun(env.runRepo);
      mockCursor(
        env.service,
        expand([
          { dept: '部門甲', emplid: 'EA', listNo: L1, count: 3 },
          { dept: '部門乙', emplid: 'EB', listNo: L2, count: 2 },
        ]),
      );
      const out = await env.service.exportResult(run.run_id, 'xlsx', 'actor-1', ACTOR_DIRECTOR);
      const ws = (await loadXlsx(out.body)).worksheets[1];
      const jia = findRow(ws, '部門甲');
      expect(jia).toBeGreaterThan(0);
      // 甲部門 L2 欄：deptByList[甲][L2]=0 / grandByList[L2]=2 > 0 → 0（非 null）
      expect(ws.getCell(`C${jia}`).value).toBe(0);
      expect(ws.getCell(`C${jia}`).numFmt).toBe('0.0%');
    });
  });

  // ===========================================================================
  // 五、DET — 確定性排序
  // ===========================================================================
  describe('DET', () => {
    it('TS-F108-DET-001：欄軸 listNo 字串升冪，最右欄固定為總計', async () => {
      const run = await seedRun(env.runRepo);
      // 刻意打亂輸入順序：L3, L1, L2
      mockCursor(
        env.service,
        expand([
          { dept: '北區電銷1', emplid: 'E1', listNo: L3, count: 1 },
          { dept: '北區電銷1', emplid: 'E1', listNo: L1, count: 1 },
          { dept: '北區電銷1', emplid: 'E1', listNo: L2, count: 1 },
        ]),
      );
      const out = await env.service.exportResult(run.run_id, 'xlsx', 'actor-1', ACTOR_DIRECTOR);
      const ws = (await loadXlsx(out.body)).worksheets[1];
      expect(ws.getCell('B4').value).toBe(L1);
      expect(ws.getCell('C4').value).toBe(L2);
      expect(ws.getCell('D4').value).toBe(L3);
      expect(ws.getCell('E4').value).toBe('總計');
    });

    it('TS-F108-DET-002：列軸外層部門 localeCompare 升冪（南在前輸入仍北先出）', async () => {
      const run = await seedRun(env.runRepo);
      // 反序輸入（南區電銷在前）；北含 E1/E2 兩員編 → 南部門列落 R8
      mockCursor(env.service, dataset20().reverse());
      const out = await env.service.exportResult(run.run_id, 'xlsx', 'actor-1', ACTOR_DIRECTOR);
      const ws = (await loadXlsx(out.body)).worksheets[1];
      expect(colA(ws, 5)).toBe('北區電銷1');
      expect(colA(ws, 8)).toBe('南區電銷');
    });

    it('TS-F108-DET-003：列軸內層員編字串升冪（E3 先輸入仍 E1→E2→E3）', async () => {
      const run = await seedRun(env.runRepo);
      mockCursor(
        env.service,
        expand([
          { dept: '北區電銷1', emplid: 'E3', listNo: L1, count: 1 },
          { dept: '北區電銷1', emplid: 'E1', listNo: L1, count: 1 },
          { dept: '北區電銷1', emplid: 'E2', listNo: L1, count: 1 },
        ]),
      );
      const out = await env.service.exportResult(run.run_id, 'xlsx', 'actor-1', ACTOR_DIRECTOR);
      const ws = (await loadXlsx(out.body)).worksheets[1];
      const dept = findRow(ws, '北區電銷1');
      expect(colA(ws, dept + 1)).toBe('E1');
      expect(colA(ws, dept + 2)).toBe('E2');
      expect(colA(ws, dept + 3)).toBe('E3');
    });

    it('TS-F108-DET-004：(空白) 部門群組固定排在最後', async () => {
      const run = await seedRun(env.runRepo);
      mockCursor(
        env.service,
        expand([
          { dept: '北區電銷1', emplid: 'E1', listNo: L1, count: 2 },
          { dept: null, emplid: 'X999', listNo: L1, count: 1 },
          { dept: '南區電銷', emplid: 'E3', listNo: L1, count: 2 },
        ]),
      );
      const out = await env.service.exportResult(run.run_id, 'xlsx', 'actor-1', ACTOR_DIRECTOR);
      const ws = (await loadXlsx(out.body)).worksheets[1];
      const idxN = findRow(ws, '北區電銷1');
      const idxS = findRow(ws, '南區電銷');
      const idxBlank = findRow(ws, '(空白)');
      expect(idxN).toBeGreaterThan(0);
      expect(idxS).toBeGreaterThan(idxN);
      expect(idxBlank).toBeGreaterThan(idxS);
    });
  });

  // ===========================================================================
  // 六、BLANK — join-miss 與空值歸組
  // ===========================================================================
  describe('BLANK', () => {
    function dataset21(): RawExportRow[] {
      return [
        ...dataset20(),
        ...expand([{ dept: null, emplid: 'X999', listNo: L1, count: 1 }]),
      ];
    }

    it('TS-F108-BLANK-001：emphire join-miss → 歸 (空白) 部門群組，匯出不中斷', async () => {
      const run = await seedRun(env.runRepo);
      mockCursor(env.service, dataset21());
      const out = await env.service.exportResult(run.run_id, 'xlsx', 'actor-1', ACTOR_DIRECTOR);
      const ws = (await loadXlsx(out.body)).worksheets[1];
      const idxBlank = findRow(ws, '(空白)');
      expect(idxBlank).toBeGreaterThan(0);
      expect(colA(ws, idxBlank + 1)).toBe('X999');
    });

    it('TS-F108-BLANK-002：(空白) 群組加入後欄總計重算正確（§6.4 oracle）', async () => {
      const run = await seedRun(env.runRepo);
      mockCursor(env.service, dataset21());
      const out = await env.service.exportResult(run.run_id, 'xlsx', 'actor-1', ACTOR_DIRECTOR);
      const ws = (await loadXlsx(out.body)).worksheets[1];
      const idxN = findRow(ws, '北區電銷1');
      const idxS = findRow(ws, '南區電銷');
      const idxBlank = findRow(ws, '(空白)');
      const idxX = findRow(ws, 'X999');
      near(ws.getCell(`B${idxN}`).value, 8 / 11);
      near(ws.getCell(`B${idxS}`).value, 2 / 11);
      near(ws.getCell(`B${idxBlank}`).value, 1 / 11);
      const sum =
        (ws.getCell(`B${idxN}`).value as number) +
        (ws.getCell(`B${idxS}`).value as number) +
        (ws.getCell(`B${idxBlank}`).value as number);
      expect(Math.abs(sum - 1.0)).toBeLessThan(1e-3);
      near(ws.getCell(`B${idxX}`).value, 1.0); // X999 在 (空白) 下 L1 = 1/1
      expect(ws.getCell(`C${idxX}`).value).toBeNull(); // X999 L2 = 0/0 → 空白
    });

    it('TS-F108-BLANK-003：emplid=null → 歸入該部門 (空白) 員編列', async () => {
      const run = await seedRun(env.runRepo);
      mockCursor(
        env.service,
        expand([{ dept: '北區電銷1', emplid: null, listNo: L1, count: 1 }]),
      );
      const out = await env.service.exportResult(run.run_id, 'xlsx', 'actor-1', ACTOR_DIRECTOR);
      const ws = (await loadXlsx(out.body)).worksheets[1];
      const dept = findRow(ws, '北區電銷1');
      expect(dept).toBeGreaterThan(0);
      expect(colA(ws, dept + 1)).toBe('(空白)');
      near(ws.getCell(`B${dept + 1}`).value, 1.0);
    });
  });

  // ===========================================================================
  // 七、SCOPE — 處長 scope（SCOPE 紅線）
  // ===========================================================================
  describe('SCOPE', () => {
    it('TS-F108-SCOPE-001：section_chief — 樞紐只含轄區內部門，不洩漏轄區外', async () => {
      const run = await seedRun(env.runRepo);
      // 模擬 scope filter 已過濾，只回轄區 E1（屬北區電銷1）3 筆
      mockCursor(
        env.service,
        expand([{ dept: '北區電銷1', emplid: 'E1', listNo: L1, count: 3 }]),
      );
      const out = await env.service.exportResult(
        run.run_id,
        'xlsx',
        ACTOR_SECTION_CHIEF.userId,
        ACTOR_SECTION_CHIEF,
      );
      const wb = await loadXlsx(out.body);
      expect(wb.worksheets.length).toBe(2);
      const ws = wb.worksheets[1];
      // 蒐集所有 A 欄 label
      const labels: string[] = [];
      for (let r = 5; r <= ws.rowCount; r++) labels.push(colA(ws, r));
      expect(labels).toContain('北區電銷1');
      expect(labels).not.toContain('南區電銷');
      expect(labels).not.toContain('E2');
      expect(labels).not.toContain('E3');
    });

    it('TS-F108-SCOPE-002：director — bypass，樞紐含全公司部門', async () => {
      const run = await seedRun(env.runRepo);
      mockCursor(env.service, dataset20());
      const out = await env.service.exportResult(run.run_id, 'xlsx', ACTOR_DIRECTOR.userId, ACTOR_DIRECTOR);
      const ws = (await loadXlsx(out.body)).worksheets[1];
      const labels: string[] = [];
      for (let r = 5; r <= ws.rowCount; r++) labels.push(colA(ws, r));
      expect(labels).toContain('北區電銷1');
      expect(labels).toContain('南區電銷');
      expect(labels).toContain('E1');
      expect(labels).toContain('E2');
      expect(labels).toContain('E3');
    });

    it('TS-F108-SCOPE-003（靜態）：accumulatePivot 在 for await 迴圈內、cursorRows 僅呼叫 1 次', () => {
      const body = sliceFn(SERVICE_SRC, 'private async buildExportXlsxStreaming(');
      expect(body).toContain('accumulatePivot(raw, pivotAgg)');
      expect((body.match(/this\.cursorRows\(/g) ?? []).length).toBe(1);
      expect(body.indexOf('for await')).toBeGreaterThan(-1);
      expect(body.indexOf('for await')).toBeLessThan(body.indexOf('accumulatePivot(raw, pivotAgg)'));
      expect(body.indexOf('accumulatePivot(raw, pivotAgg)')).toBeLessThan(
        body.indexOf('sheet.commit()'),
      );
    });
  });

  // ===========================================================================
  // 八、EMPTY — 空結果邊界
  // ===========================================================================
  describe('EMPTY', () => {
    it('TS-F108-EMPTY-001：0 列輸入 → xlsx 仍含 2 個工作表', async () => {
      const run = await seedRun(env.runRepo);
      mockCursor(env.service, []);
      const out = await env.service.exportResult(run.run_id, 'xlsx', 'actor-1', ACTOR_DIRECTOR);
      const wb = await loadXlsx(out.body);
      expect(wb.worksheets.length).toBe(2);
    });

    it('TS-F108-EMPTY-002：空結果第 2 頁含 R1~R4 + 總計列；無 listNo 欄；總計欄=null', async () => {
      const run = await seedRun(env.runRepo);
      mockCursor(env.service, []);
      const out = await env.service.exportResult(run.run_id, 'xlsx', 'actor-1', ACTOR_DIRECTOR);
      const ws = (await loadXlsx(out.body)).worksheets[1];
      expect(ws.getCell('A1').value).toBe('部門代號');
      expect(ws.getCell('B1').value).toBe('(全部)');
      const r2 = ws.getRow(2);
      expect(r2.getCell(1).value === null || r2.getCell(1).value === undefined || r2.getCell(1).value === '').toBe(true);
      expect(ws.getCell('A3').value).toBe('計數 - 案號');
      expect(ws.getCell('B3').value).toBe('欄標籤');
      expect(ws.getCell('A4').value).toBe('列標籤');
      expect(ws.getCell('B4').value).toBe('總計'); // 無 listNo 欄 → 總計直接在 B4
      // 總計列（R5）：A=總計、B(總計欄)=null（0/0 → 空白）
      expect(ws.getCell('A5').value).toBe('總計');
      expect(ws.getCell('B5').value).toBeNull();
      expect(ws.rowCount).toBe(5);
    });

    it('TS-F108-EMPTY-003：0 列輸入整體匯出不拋錯（控制器回 200），body 可解析', async () => {
      const run = await seedRun(env.runRepo);
      mockCursor(env.service, []);
      const out = await env.service.exportResult(run.run_id, 'xlsx', 'actor-1', ACTOR_DIRECTOR);
      expect(out.contentType).toContain(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      expect(Buffer.isBuffer(out.body)).toBe(true);
      const wb = await loadXlsx(out.body);
      expect(wb.worksheets.length).toBe(2);
      expect(out.rowCount).toBe(0);
    });
  });

  // ===========================================================================
  // 九、REGRESSION — DoD 紅線（明細頁 + CSV 不受影響）
  // ===========================================================================
  describe('REGRESSION', () => {
    it('TS-F108-REGRESSION-001：第 1 頁表頭仍為 23 欄且欄序不變', async () => {
      const run = await seedRun(env.runRepo);
      mockCursor(env.service, dataset20());
      const out = await env.service.exportResult(run.run_id, 'xlsx', 'actor-1', ACTOR_DIRECTOR);
      const ws = (await loadXlsx(out.body)).worksheets[0];
      const header: string[] = [];
      for (let c = 1; c <= 23; c++) header.push(String(ws.getRow(1).getCell(c).value ?? ''));
      expect(header).toEqual([...EXPORT_HEADER_V2]);
      for (const h of PIVOT_ONLY_HEADERS) expect(header).not.toContain(h);
    });

    it('TS-F108-REGRESSION-002：第 1 頁資料列數 = cursorRows 輸入筆數（20）', async () => {
      const run = await seedRun(env.runRepo);
      mockCursor(env.service, dataset20());
      const out = await env.service.exportResult(run.run_id, 'xlsx', 'actor-1', ACTOR_DIRECTOR);
      const ws = (await loadXlsx(out.body)).worksheets[0];
      expect(ws.rowCount - 1).toBe(20); // 排除表頭
      expect(out.rowCount).toBe(20);
    });

    it('TS-F108-REGRESSION-003：CSV 路徑輸出與 F064 一致，不含樞紐', async () => {
      const run = await seedRun(env.runRepo);
      mockCursor(env.service, dataset20().slice(0, 5));
      const out = await env.service.exportResult(run.run_id, 'csv', 'actor-1', ACTOR_DIRECTOR);
      const rows = parseCsv(out.body as string);
      expect(rows[0].length).toBe(23);
      expect(rows[0]).toEqual([...EXPORT_HEADER_V2]);
      expect(rows.length - 1).toBe(5);
      for (const h of PIVOT_ONLY_HEADERS) expect(rows[0]).not.toContain(h);
    });

    it('TS-F108-REGRESSION-004（靜態）：buildExportCsvStreaming 不含 pivotAgg / 樞紐寫入', () => {
      const csv = sliceFn(SERVICE_SRC, 'private async buildExportCsvStreaming(');
      for (const kw of [
        'pivotAgg',
        'createPivotAggregation',
        'accumulatePivot',
        'writePivotSheet',
        "addWorksheet('樞紐分析')",
      ]) {
        expect(csv).not.toContain(kw);
      }
    });
  });

  // ===========================================================================
  // 十、STATIC — 靜態掃描
  // ===========================================================================
  describe('STATIC', () => {
    it('TS-F108-STATIC-001：addWorksheet(樞紐分析) 在 sheet.commit() 後；pivotSheet.commit() 在 workbook.commit() 前', () => {
      const body = sliceFn(SERVICE_SRC, 'private async buildExportXlsxStreaming(');
      const iSheetCommit = body.indexOf('sheet.commit()');
      const iAddPivot = body.indexOf("addWorksheet('樞紐分析')");
      const iPivotCommit = body.indexOf('pivotSheet.commit()');
      const iWbCommit = body.indexOf('workbook.commit()');
      expect(iSheetCommit).toBeGreaterThan(-1);
      expect(iAddPivot).toBeGreaterThan(iSheetCommit);
      expect(iPivotCommit).toBeGreaterThan(-1);
      expect(iWbCommit).toBeGreaterThan(iPivotCommit);
    });

    it('TS-F108-STATIC-002：accumulatePivot 只存計數，不全載明細列', () => {
      const body = sliceFn(SERVICE_SRC, 'private accumulatePivot(');
      expect(body).not.toContain('rows.push(');
      expect(body).not.toContain('allRows');
      expect(body).not.toContain('Buffer.concat');
      const hasCountUpdate = /\?\?\s*0\)\s*\+\s*1/.test(body) || body.includes('+= 1');
      expect(hasCountUpdate).toBe(true);
    });
  });
});

// 靜態掃描共用：讀 service 原始碼 + 函式切片（沿用 f064-export-23col.spec.ts 模式）
const SERVICE_SRC = fs.readFileSync(
  path.resolve(__dirname, '../assignment-run-report.service.ts'),
  'utf8',
);

function sliceFn(src: string, signature: string): string {
  const start = src.indexOf(signature);
  if (start < 0) throw new Error(`fn not found: ${signature}`);
  const rest = src.slice(start + signature.length);
  const boundary = rest.search(/\n  (private |protected |public |async |\/\*\*|[a-zA-Z]+\()/);
  const end = boundary < 0 ? rest.length : boundary;
  return rest.slice(0, end);
}
