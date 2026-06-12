/**
 * F102 / AD-E07-30 — CR 優先分派前置步驟 JS oracle + 確定性靜態掃描（非 PG）
 *
 * 對應測試設計（F102-test.md）：
 *   - STEP1-004：@SYS_DT / twoYearsAgo 計算（computeCrSysDates，含跨年邊界）
 *   - applyCrPriority JS oracle 行為：步驟 1（逾2年）/ 步驟 2（離職 + 查無不清）/ 步驟 3（ration>0 + deptid_m ASC）
 *   - DET-001：CR 步驟全程無亂數函式（NEWID / Math.random / crypto.randomUUID / ORDER BY RANDOM）
 *   - DET-002：Stage 2 移除 crExpr / collectCrCandidates / crApplPerList / crEnabledListNos（靜態面）
 *   - DET-003：無 service / controller 讀取 cr_reassignment_enabled（AC-12，排除 entity/migration/seed）
 *   - S1SRC-003：CR 步驟不直接讀 ob_pool_data_list（cr-priority.ts / cr-priority-sql.ts grep=0）
 *   - ORDER-001：clearStage3Fields 在 runCrPrioritySql 之前（pushdown）；applyCrPriority 在 distributeStage3to4 之前（v2）
 *
 * 靜態掃描以 fs 讀原始檔 + regex（feedback_grep_negative_lookahead：不依賴 Grep tool）。
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

import {
  applyCrPriority,
  computeCrSysDates,
  type CrCase,
  type CrEmplSet,
  type CrEmphire,
} from '../cr-priority';

const SRC = path.resolve(__dirname, '..');
const SERVICES = path.resolve(__dirname, '../../services');
const API_SRC = path.resolve(__dirname, '../../../..');

function read(p: string): string {
  return fs.readFileSync(p, 'utf8');
}

/** 遞迴列出某目錄下所有 .ts 檔（排除 __tests__）。 */
function listTs(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      out.push(...listTs(full));
    } else if (entry.name.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

// ===========================================================================
// STEP1-004 — @SYS_DT / twoYearsAgo 計算
// ===========================================================================
describe('F102 computeCrSysDates（STEP1-004）', () => {
  it('202606 → sysDate 2026-06-01 / twoYearsAgo 2024-06-01', () => {
    expect(computeCrSysDates('202606')).toEqual({
      sysDate: '2026-06-01',
      twoYearsAgo: '2024-06-01',
    });
  });

  it('202612 跨年邊界 → sysDate 2026-12-01 / twoYearsAgo 2024-12-01', () => {
    expect(computeCrSysDates('202612')).toEqual({
      sysDate: '2026-12-01',
      twoYearsAgo: '2024-12-01',
    });
  });

  it('202607 → twoYearsAgo 2024-07-01（嚴格小於邊界用）', () => {
    expect(computeCrSysDates('202607').twoYearsAgo).toBe('2024-07-01');
  });
});

// ===========================================================================
// applyCrPriority — JS oracle 行為（步驟 1/2/3）
// ===========================================================================
describe('F102 applyCrPriority — JS oracle', () => {
  const emphire: CrEmphire[] = [
    { emp_id: 'E001', resign_date: '2026-06-15' }, // 離職（< 2026-07-01）
    { emp_id: 'E002', resign_date: null }, // 在職
    { emp_id: 'E003', resign_date: null },
    { emp_id: 'E007', resign_date: null },
    // E999 不存在於 ob_emphire（查無）
  ];
  const emplSet: CrEmplSet[] = [
    { emplid: 'E003', deptid_m: 'XVE1', ration: 30 },
    { emplid: 'E999', deptid_m: 'XVE1', ration: 25 },
    { emplid: 'E007', deptid_m: 'XVE2', ration: 0 }, // ration=0 → 不指派
  ];
  const sysDate = '2026-07-01';

  it('步驟 1：appl_date < twoYearsAgo（2024-07-01）嚴格小於 → 清空', () => {
    const cases: CrCase[] = [
      { orgno: '01', appl_no: 'A', cr_id: 'E003', cr_nm: 'N3', is_cr: 'Y', appl_date: '2024-06-30' }, // < → 清
      { orgno: '01', appl_no: 'B', cr_id: 'E003', cr_nm: 'N3', is_cr: 'Y', appl_date: '2024-07-01' }, // = → 不清
    ];
    const r = applyCrPriority(cases, emplSet, emphire, sysDate);
    const a = r.find((x) => x.appl_no === 'A')!;
    const b = r.find((x) => x.appl_no === 'B')!;
    expect(a.cr_id).toBeNull();
    expect(a.cr_nm).toBeNull();
    expect(a.is_cr).toBe('N');
    // B 剛好等於 → 不清，續走步驟 3 指派（E003 ration>0）。
    expect(b.cr_id).toBe('E003');
    expect(b.is_cr).toBe('Y');
    expect(b.dept_id).toBe('XVE1');
  });

  it('步驟 2：resign_date < sysDate 清空；在職不清；查無 ob_emphire 不清（BR-F102-08）', () => {
    const cases: CrCase[] = [
      { orgno: '01', appl_no: 'C', cr_id: 'E001', cr_nm: 'N1', is_cr: 'Y', appl_date: '2025-01-01' }, // 離職 → 清
      { orgno: '01', appl_no: 'D', cr_id: 'E002', cr_nm: 'N2', is_cr: 'Y', appl_date: '2025-01-01' }, // 在職 → 不清（但 E002 無 ration → 不指派）
      { orgno: '01', appl_no: 'H', cr_id: 'E999', cr_nm: 'N9', is_cr: 'Y', appl_date: '2025-01-01' }, // 查無 → 不清 + 步驟 3 指派
    ];
    const r = applyCrPriority(cases, emplSet, emphire, sysDate);
    const c = r.find((x) => x.appl_no === 'C')!;
    const d = r.find((x) => x.appl_no === 'D')!;
    const h = r.find((x) => x.appl_no === 'H')!;
    expect(c.cr_id).toBeNull();
    expect(c.is_cr).toBe('N');
    // D 在職不清；E002 無 ration 設定 → 步驟 3 不指派，維持原 is_cr。
    expect(d.cr_id).toBe('E002');
    expect(d.is_cr).toBe('Y'); // 原值維持（未被清、未被步驟3改）
    expect(d.emplid).toBeNull();
    // H 查無 ob_emphire → 步驟 2 不清；E999 有 ration>0 → 步驟 3 指派。
    expect(h.cr_id).toBe('E999');
    expect(h.emplid).toBe('E999');
    expect(h.dept_id).toBe('XVE1');
    expect(h.is_cr).toBe('Y');
  });

  it('步驟 3：ration>0 才指派；ration=0 / 無記錄不指派', () => {
    const cases: CrCase[] = [
      { orgno: '01', appl_no: 'F', cr_id: 'E003', cr_nm: 'N3', is_cr: 'Y', appl_date: '2025-09-01' }, // ration>0 → 指派
      { orgno: '01', appl_no: 'G', cr_id: 'E007', cr_nm: 'N7', is_cr: 'Y', appl_date: '2025-09-01' }, // ration=0 → 不指派
    ];
    const r = applyCrPriority(cases, emplSet, emphire, sysDate);
    const f = r.find((x) => x.appl_no === 'F')!;
    const g = r.find((x) => x.appl_no === 'G')!;
    expect(f.emplid).toBe('E003');
    expect(f.dept_id).toBe('XVE1');
    expect(f.emplid_deptid).toBe('XVE1');
    expect(f.is_cr).toBe('Y');
    expect(g.emplid).toBeNull();
    expect(g.dept_id).toBeNull();
    expect(g.is_cr).toBe('Y'); // 原值維持（非 'Y'→'Y' 不改，案件進比例池由扣量過濾）
  });

  it('步驟 3：多筆 deptid_m 取 deptid_m ASC 第一筆（I-DET-CR-01）', () => {
    const multiEmpl: CrEmplSet[] = [
      { emplid: 'E005', deptid_m: 'XVE2', ration: 20 },
      { emplid: 'E005', deptid_m: 'XVE1', ration: 30 },
    ];
    const cases: CrCase[] = [
      { orgno: '01', appl_no: 'I', cr_id: 'E005', cr_nm: 'N5', is_cr: 'Y', appl_date: '2025-09-01' },
    ];
    const r = applyCrPriority(cases, multiEmpl, [{ emp_id: 'E005', resign_date: null }], sysDate);
    expect(r[0].dept_id).toBe('XVE1'); // ASC：XVE1 < XVE2
    expect(r[0].emplid_deptid).toBe('XVE1');
  });

  it('cr_id=NULL 案件不受任何步驟影響', () => {
    const cases: CrCase[] = [
      { orgno: '01', appl_no: 'N', cr_id: null, cr_nm: null, is_cr: 'N', appl_date: '2020-01-01' },
    ];
    const r = applyCrPriority(cases, emplSet, emphire, sysDate);
    expect(r[0].is_cr).toBe('N');
    expect(r[0].emplid).toBeNull();
  });

  it('Worked Example §6 完整 8 案件（is_cr=Y: c1/c2/c6/c7/c8）', () => {
    const sd = '2026-06-01'; // 202606 → twoYearsAgo 2024-06-01
    const empl: CrEmplSet[] = [
      { emplid: 'E003', deptid_m: 'XVE1', ration: 30 },
      { emplid: 'E005', deptid_m: 'XVE2', ration: 20 },
      { emplid: 'E006', deptid_m: 'XVE2', ration: 20 },
      { emplid: 'E007', deptid_m: 'XVE2', ration: 0 }, // ration=0
      { emplid: 'E999', deptid_m: 'XVE1', ration: 25 },
    ];
    const emp: CrEmphire[] = [
      { emp_id: 'E003', resign_date: null },
      { emp_id: 'E005', resign_date: null },
      { emp_id: 'E006', resign_date: '2026-05-20' }, // 離職 < 2026-06-01
      { emp_id: 'E007', resign_date: null },
      // E999 查無
    ];
    const cases: CrCase[] = [
      { orgno: '01', appl_no: 'c1', cr_id: 'E003', cr_nm: 'n', is_cr: 'Y', appl_date: '2025-03-01' },
      { orgno: '01', appl_no: 'c2', cr_id: 'E003', cr_nm: 'n', is_cr: 'Y', appl_date: '2025-05-10' },
      { orgno: '01', appl_no: 'c3', cr_id: 'E005', cr_nm: 'n', is_cr: 'Y', appl_date: '2023-12-31' }, // 逾2年清
      { orgno: '01', appl_no: 'c4', cr_id: 'E006', cr_nm: 'n', is_cr: 'Y', appl_date: '2025-08-01' }, // 離職清
      { orgno: '01', appl_no: 'c5', cr_id: 'E007', cr_nm: 'n', is_cr: 'Y', appl_date: '2025-09-01' }, // ration=0 不指派
      { orgno: '01', appl_no: 'c6', cr_id: 'E999', cr_nm: 'n', is_cr: 'Y', appl_date: '2025-10-01' }, // 查無不清 → 指派
      { orgno: '01', appl_no: 'c7', cr_id: 'E003', cr_nm: 'n', is_cr: 'Y', appl_date: '2025-11-01' },
      { orgno: '01', appl_no: 'c8', cr_id: 'E003', cr_nm: 'n', is_cr: 'Y', appl_date: '2024-06-01' }, // 剛好 ≥2 年
    ];
    const r = applyCrPriority(cases, empl, emp, sd);
    const byAppl = (a: string) => r.find((x) => x.appl_no === a)!;
    expect(byAppl('c1').is_cr).toBe('Y');
    expect(byAppl('c2').is_cr).toBe('Y');
    expect(byAppl('c3').is_cr).toBe('N'); // 逾2年清
    expect(byAppl('c3').cr_id).toBeNull();
    expect(byAppl('c4').is_cr).toBe('N'); // 離職清
    expect(byAppl('c4').cr_id).toBeNull();
    expect(byAppl('c5').is_cr).toBe('Y'); // 不指派但 is_cr 原值維持（扣量過濾）
    expect(byAppl('c5').emplid).toBeNull();
    expect(byAppl('c6').is_cr).toBe('Y');
    expect(byAppl('c6').emplid).toBe('E999');
    expect(byAppl('c7').is_cr).toBe('Y');
    expect(byAppl('c8').is_cr).toBe('Y');
    expect(byAppl('c8').emplid).toBe('E003');
    const yCount = r.filter((x) => x.is_cr === 'Y' && x.emplid !== null).length;
    expect(yCount).toBe(5); // c1/c2/c6/c7/c8
  });
});

// ===========================================================================
// DET — 確定性靜態掃描
// ===========================================================================
describe('F102 DET — 確定性 / 清理靜態掃描', () => {
  const f102Files = [
    path.join(SRC, 'cr-priority.ts'),
    path.join(SRC, 'cr-priority-sql.ts'),
    path.join(SERVICES, 'assignment-run-pipeline.service.ts'),
    path.join(SRC, 'stage3to4-ration-sql.ts'),
  ];

  it('DET-001：F102 檔案全程無亂數函式', () => {
    const banned = /NEWID\s*\(\s*\)|Math\.random\s*\(\s*\)|ORDER BY RANDOM\s*\(\s*\)|crypto\.randomUUID\s*\(\s*\)/;
    for (const f of f102Files) {
      expect(banned.test(read(f)), `${path.basename(f)} 含亂數`).toBe(false);
    }
  });

  it('DET-002：Stage 2 移除 crExpr / collectCrCandidates / crApplPerList / crEnabledListNos', () => {
    const banned = /crExpr|collectCrCandidates|crApplPerList|crEnabledListNos/;
    const stage2 = read(path.join(SRC, 'stage2to4-sql-executor.ts'));
    const pipeline = read(path.join(SERVICES, 'assignment-run-pipeline.service.ts'));
    expect(banned.test(stage2)).toBe(false);
    expect(banned.test(pipeline)).toBe(false);
  });

  it('DET-002b：runStage2and3Sql 不寫 is_cr（I-CR-STAGE2-CLEAN-01）', () => {
    const stage2 = read(path.join(SRC, 'stage2to4-sql-executor.ts'));
    // UPDATE SET 子句不含 is_cr（移除 `is_cr = sub.is_cr`）。
    expect(/is_cr\s*=\s*sub\.is_cr/.test(stage2)).toBe(false);
  });

  it('DET-003：apps/api/src 無 service/controller 讀取 cr_reassignment_enabled（排除 entity/migration/seed/scripts）', () => {
    const all = listTs(API_SRC);
    const hits: string[] = [];
    for (const f of all) {
      const rel = f.replace(/\\/g, '/');
      // 排除 entity / migration / seed（測試設計 AC-12 明示）。
      if (
        rel.includes('/database/entities/') ||
        rel.includes('/database/migrations/') ||
        rel.includes('/database/seeds/')
      ) {
        continue;
      }
      if (/cr_reassignment_enabled/.test(read(f))) hits.push(rel);
    }
    expect(hits, `命中: ${hits.join(', ')}`).toEqual([]);
  });

  it('S1SRC-003：cr-priority.ts / cr-priority-sql.ts 不直接讀 ob_pool_data_list（I-CR-COLSRC-01）', () => {
    expect(/ob_pool_data_list/.test(read(path.join(SRC, 'cr-priority.ts')))).toBe(false);
    expect(/ob_pool_data_list/.test(read(path.join(SRC, 'cr-priority-sql.ts')))).toBe(false);
  });
});

// ===========================================================================
// ORDER-001 — 執行順序靜態驗證（行號比較）
// ===========================================================================
describe('F102 ORDER-001 — 執行順序靜態驗證', () => {
  const pipeline = read(path.join(SERVICES, 'assignment-run-pipeline.service.ts'));

  it('pushdown：clearStage3Fields 在 runCrPrioritySql 之前；runCrPrioritySql 在 runStage3to4RationSql 之前', () => {
    const clearIdx = pipeline.indexOf('clearStage3Fields(manager');
    const crIdx = pipeline.indexOf('runCrPrioritySql(manager');
    const rationIdx = pipeline.indexOf('runStage3to4RationSql(manager');
    expect(clearIdx).toBeGreaterThan(-1);
    expect(crIdx).toBeGreaterThan(-1);
    expect(rationIdx).toBeGreaterThan(-1);
    expect(clearIdx).toBeLessThan(crIdx);
    expect(crIdx).toBeLessThan(rationIdx);
  });

  it('v2：applyCrPriority 在 distributeStage3to4 之前', () => {
    const crIdx = pipeline.indexOf('applyCrPriority(crCases');
    const distIdx = pipeline.indexOf('distributeStage3to4(');
    expect(crIdx).toBeGreaterThan(-1);
    expect(distIdx).toBeGreaterThan(-1);
    expect(crIdx).toBeLessThan(distIdx);
  });
});
