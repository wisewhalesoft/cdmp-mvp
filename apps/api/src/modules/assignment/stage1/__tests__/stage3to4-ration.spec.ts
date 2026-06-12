/**
 * F101 / AD-E07-29 — Stage 3/4 真實比例分派純函式 oracle 測試（SQLite-free，純 JS）
 *
 * 對應 F101-test.md 之手算 oracle 群組（DEPT / EMPL / ASGD），數值寫死於測試設計、由人複核。
 * 此層驗證 distributeStage3to4 純函式（JS golden oracle 核心）的 FLOOR + 確定性差額補足 + ADD_CNT
 * + ASSIGNDAY 千分比 + 最末吸收 + DIVIDE_LEFT round-robin，與 SP（NEWID 取代為確定性鍵）對齊。
 *
 * 確定性鍵（AD-E07-29 §3.3）：Stage 3 差額 obdeptid ASC；案件 (orgno, appl_no) ASC；
 * Stage 4 差額 emplid ASC；EMP_ORD per-emplid (orgno, appl_no)；DIVIDE_LEFT (tier_level, orgno, appl_no)。
 */

import { describe, it, expect } from 'vitest';

import {
  distributeStage3to4,
  buildWarningSummary,
  type RationCase,
  type DeptRation,
  type EmplRation,
  type WorkingDay,
  type CrPreassignedCase,
} from '../stage3to4-ration';

const LIST = 'OB202606001';
const YM = '202606';

/** 產 n 件案件（同分處 + 同 tier）；appl_no 遞增（'0001'..），orgno 固定 '01'。 */
function makeCases(opts: {
  poolDeptId: string;
  tier: string;
  n: number;
  startSeq?: number;
}): RationCase[] {
  const out: RationCase[] = [];
  const start = opts.startSeq ?? 1;
  for (let i = 0; i < opts.n; i++) {
    out.push({
      orgno: '01',
      appl_no: String(start + i).padStart(4, '0'),
      tier_level: opts.tier,
      pool_dept_id: opts.poolDeptId,
    });
  }
  return out;
}

const DEPT_3 = (): DeptRation[] => [
  { obdeptid: 'AI000', ration: 50 },
  { obdeptid: 'AM000', ration: 30 },
  { obdeptid: 'B0000', ration: 20 },
];

function deptCount(r: ReturnType<typeof distributeStage3to4>, deptId: string): number {
  return r.assignments.filter((a) => a.dept_id === deptId).length;
}
function emplCount(r: ReturnType<typeof distributeStage3to4>, emplid: string): number {
  return r.assignments.filter((a) => a.emplid === emplid).length;
}

// ===========================================================================
// DEPT — Stage 3 手算 oracle（AC-1/13）
// ===========================================================================
describe('F101 DEPT — Stage 3 dept 比例分配（手算 oracle）', () => {
  it('DEPT-001：Seed 1（101 件，diff=1 → AI000 +1）→ 51/30/20', () => {
    const cases = makeCases({ poolDeptId: 'XVF1', tier: 'T1', n: 101 });
    const r = distributeStage3to4(LIST, YM, cases, DEPT_3(), [], []);
    expect(deptCount(r, 'AI000')).toBe(51);
    expect(deptCount(r, 'AM000')).toBe(30);
    expect(deptCount(r, 'B0000')).toBe(20);
    expect(r.assignments.filter((a) => a.dept_id !== null).length).toBe(101);
  });

  it('DEPT-002：Seed 2（73 件，diff=2 → AI000/AM000 +1）→ 37/22/14', () => {
    const cases = makeCases({ poolDeptId: 'XVF1', tier: 'T2', n: 73 });
    const r = distributeStage3to4(LIST, YM, cases, DEPT_3(), [], []);
    expect(deptCount(r, 'AI000')).toBe(37);
    expect(deptCount(r, 'AM000')).toBe(22);
    expect(deptCount(r, 'B0000')).toBe(14);
  });

  it('DEPT-003：Seed 4（40 件，diff=0 整除）→ 20/12/8', () => {
    const cases = makeCases({ poolDeptId: 'XVG1', tier: 'T2', n: 40 });
    const r = distributeStage3to4(LIST, YM, cases, DEPT_3(), [], []);
    expect(deptCount(r, 'AI000')).toBe(20);
    expect(deptCount(r, 'AM000')).toBe(12);
    expect(deptCount(r, 'B0000')).toBe(8);
  });

  it('DEPT-004：2 分處 × 2 Tier 全矩陣 oracle', () => {
    const cases = [
      ...makeCases({ poolDeptId: 'XVF1', tier: 'T1', n: 101, startSeq: 1 }),
      ...makeCases({ poolDeptId: 'XVF1', tier: 'T2', n: 73, startSeq: 1001 }),
      ...makeCases({ poolDeptId: 'XVG1', tier: 'T1', n: 58, startSeq: 2001 }),
      ...makeCases({ poolDeptId: 'XVG1', tier: 'T2', n: 40, startSeq: 3001 }),
    ];
    const r = distributeStage3to4(LIST, YM, cases, DEPT_3(), [], []);
    // 分組統計：以建構案件子集之 (orgno, appl_no) 反查實際 dept_id 分佈。
    const group = (poolDept: string, tier: string) =>
      cases.filter((c) => c.pool_dept_id === poolDept && c.tier_level === tier);
    const countIn = (subset: RationCase[], dept: string) => {
      const keys = new Set(subset.map((c) => `${c.orgno} ${c.appl_no}`));
      return r.assignments.filter(
        (a) => keys.has(`${a.orgno} ${a.appl_no}`) && a.dept_id === dept,
      ).length;
    };
    // XVF1 T1: 51/30/20
    expect(countIn(group('XVF1', 'T1'), 'AI000')).toBe(51);
    expect(countIn(group('XVF1', 'T1'), 'AM000')).toBe(30);
    expect(countIn(group('XVF1', 'T1'), 'B0000')).toBe(20);
    // XVF1 T2: 37/22/14
    expect(countIn(group('XVF1', 'T2'), 'AI000')).toBe(37);
    expect(countIn(group('XVF1', 'T2'), 'AM000')).toBe(22);
    expect(countIn(group('XVF1', 'T2'), 'B0000')).toBe(14);
    // XVG1 T1: 30/17/11
    expect(countIn(group('XVG1', 'T1'), 'AI000')).toBe(30);
    expect(countIn(group('XVG1', 'T1'), 'AM000')).toBe(17);
    expect(countIn(group('XVG1', 'T1'), 'B0000')).toBe(11);
    // XVG1 T2: 20/12/8
    expect(countIn(group('XVG1', 'T2'), 'AI000')).toBe(20);
    expect(countIn(group('XVG1', 'T2'), 'AM000')).toBe(12);
    expect(countIn(group('XVG1', 'T2'), 'B0000')).toBe(8);
  });

  it('DEPT-005：多分處不退化（distinct dept = 3，AI000 不因下游無員工被略過）', () => {
    const cases = makeCases({ poolDeptId: 'XVF1', tier: 'T1', n: 101 });
    // ob_empl_set 僅 AM000/B0000 有員工（AI000 無）；Stage 3 仍須配 AI000。
    const empl: EmplRation[] = [
      { emplid: 'F1', deptid_m: 'AM000', ration: 100 },
      { emplid: 'G1', deptid_m: 'B0000', ration: 100 },
    ];
    const r = distributeStage3to4(LIST, YM, cases, DEPT_3(), empl, []);
    const distinct = new Set(
      r.assignments.filter((a) => a.dept_id !== null).map((a) => a.dept_id),
    );
    expect(distinct.size).toBe(3);
    expect(deptCount(r, 'AI000')).toBe(51); // 不退化
  });

  it('DEPT-006：依配額循序指派（orgno, appl_no ASC）', () => {
    // 10 件；ration 配額 AI000=6, AM000=3, B0000=1（手選 ration 使 quota 確定）。
    const cases = makeCases({ poolDeptId: 'XVF1', tier: 'T1', n: 10 });
    const dept: DeptRation[] = [
      { obdeptid: 'AI000', ration: 60 },
      { obdeptid: 'AM000', ration: 30 },
      { obdeptid: 'B0000', ration: 10 },
    ];
    const r = distributeStage3to4(LIST, YM, cases, dept, [], []);
    const deptByAppl = (appl: string) =>
      r.assignments.find((a) => a.appl_no === appl)!.dept_id;
    for (let i = 1; i <= 6; i++) expect(deptByAppl(String(i).padStart(4, '0'))).toBe('AI000');
    for (let i = 7; i <= 9; i++) expect(deptByAppl(String(i).padStart(4, '0'))).toBe('AM000');
    expect(deptByAppl('0010')).toBe('B0000');
  });

  it('DEPT-007：無 ration → dept_id NULL + STAGE3_NO_DEPT_RATION 警告', () => {
    const cases = makeCases({ poolDeptId: 'XVF1', tier: 'T2', n: 12 });
    const r = distributeStage3to4(LIST, YM, cases, [], [], []);
    expect(r.assignments.every((a) => a.dept_id === null)).toBe(true);
    const w = r.warnings.find((w) => w.event === 'STAGE3_NO_DEPT_RATION');
    expect(w).toMatchObject({ event: 'STAGE3_NO_DEPT_RATION', list_no: LIST, tier_level: 'T2' });
    expect(buildWarningSummary(r.warnings)).toContain('STAGE3_NO_DEPT_RATION');
  });

  it('DEPT-008：tier_level 全 NULL（Stage 2 未跑）→ Stage 3 不分配', () => {
    const cases: RationCase[] = makeCases({ poolDeptId: 'XVF1', tier: 'T1', n: 10 }).map(
      (c) => ({ ...c, tier_level: null }),
    );
    const r = distributeStage3to4(LIST, YM, cases, DEPT_3(), [], []);
    expect(r.assignments.every((a) => a.dept_id === null)).toBe(true);
  });
});

// ===========================================================================
// EMPL — Stage 4 員工比例手算 oracle（AC-6/7/14）
// ===========================================================================
describe('F101 EMPL — Stage 4 員工比例分配（手算 oracle）', () => {
  /** 單課單 tier 場景：全部案件由單一 ob_dept_pct(100%) 落入 deptId，再員工分配。 */
  function singleDept(deptId: string): DeptRation[] {
    return [{ obdeptid: deptId, ration: 100 }];
  }

  it('EMPL-001：Seed A（AI000/T1，51 件，E1=40/E2=35/E3=25）→ 21/18/12', () => {
    const cases = makeCases({ poolDeptId: 'XVF1', tier: 'T1', n: 51 });
    const empl: EmplRation[] = [
      { emplid: 'E1', deptid_m: 'AI000', ration: 40 },
      { emplid: 'E2', deptid_m: 'AI000', ration: 35 },
      { emplid: 'E3', deptid_m: 'AI000', ration: 25 },
    ];
    const r = distributeStage3to4(LIST, YM, cases, singleDept('AI000'), empl, []);
    expect(emplCount(r, 'E1')).toBe(21);
    expect(emplCount(r, 'E2')).toBe(18);
    expect(emplCount(r, 'E3')).toBe(12);
    expect(r.assignments.every((a) => a.emplid_deptid === 'AI000')).toBe(true);
  });

  it('EMPL-002：Seed B（AM000/T1，30 件，F1=50/F2=30/F3=20，整除）→ 15/9/6', () => {
    const cases = makeCases({ poolDeptId: 'XVF1', tier: 'T1', n: 30 });
    const empl: EmplRation[] = [
      { emplid: 'F1', deptid_m: 'AM000', ration: 50 },
      { emplid: 'F2', deptid_m: 'AM000', ration: 30 },
      { emplid: 'F3', deptid_m: 'AM000', ration: 20 },
    ];
    const r = distributeStage3to4(LIST, YM, cases, singleDept('AM000'), empl, []);
    expect(emplCount(r, 'F1')).toBe(15);
    expect(emplCount(r, 'F2')).toBe(9);
    expect(emplCount(r, 'F3')).toBe(6);
  });

  it('EMPL-003：Seed C（103 件，G1=34/G2=33/G3=33，diff=2 前 2 各 +1）→ 36/34/33', () => {
    const cases = makeCases({ poolDeptId: 'XVE2', tier: 'T2', n: 103 });
    const empl: EmplRation[] = [
      { emplid: 'G1', deptid_m: 'XVE2', ration: 34 },
      { emplid: 'G2', deptid_m: 'XVE2', ration: 33 },
      { emplid: 'G3', deptid_m: 'XVE2', ration: 33 },
    ];
    const r = distributeStage3to4(LIST, YM, cases, singleDept('XVE2'), empl, []);
    expect(emplCount(r, 'G1')).toBe(36);
    expect(emplCount(r, 'G2')).toBe(34);
    expect(emplCount(r, 'G3')).toBe(33);
  });

  it('EMPL-003b：Seed D（13 件，H1/H2/H3 34/33/33，ADD_CNT=0，前 1 +1）→ 5/4/4', () => {
    const cases = makeCases({ poolDeptId: 'XVE3', tier: 'T3', n: 13 });
    const empl: EmplRation[] = [
      { emplid: 'H1', deptid_m: 'XVE3', ration: 34 },
      { emplid: 'H2', deptid_m: 'XVE3', ration: 33 },
      { emplid: 'H3', deptid_m: 'XVE3', ration: 33 },
    ];
    const r = distributeStage3to4(LIST, YM, cases, singleDept('XVE3'), empl, []);
    expect(emplCount(r, 'H1')).toBe(5);
    expect(emplCount(r, 'H2')).toBe(4);
    expect(emplCount(r, 'H3')).toBe(4);
  });

  it('EMPL-004：兩次執行確定性一致（相同 oracle 件數 + 相同 per-case emplid）', () => {
    const cases = makeCases({ poolDeptId: 'XVE2', tier: 'T2', n: 103 });
    const empl: EmplRation[] = [
      { emplid: 'G1', deptid_m: 'XVE2', ration: 34 },
      { emplid: 'G2', deptid_m: 'XVE2', ration: 33 },
      { emplid: 'G3', deptid_m: 'XVE2', ration: 33 },
    ];
    const r1 = distributeStage3to4(LIST, YM, cases, singleDept('XVE2'), empl, []);
    const r2 = distributeStage3to4(LIST, YM, cases, singleDept('XVE2'), empl, []);
    const norm = (r: typeof r1) =>
      r.assignments
        .map((a) => `${a.appl_no}:${a.emplid}`)
        .sort()
        .join(',');
    expect(norm(r1)).toBe(norm(r2));
  });

  it('EMPL-005：simplified is_cr — Y/N 同池（J1=60/J2=40）→ 60/40，不分流', () => {
    // is_cr 不在 RationCase；分配純依 ration，驗證 60/40。
    const cases = makeCases({ poolDeptId: 'XVE3', tier: 'T2', n: 100 });
    const empl: EmplRation[] = [
      { emplid: 'J1', deptid_m: 'XVE3', ration: 60 },
      { emplid: 'J2', deptid_m: 'XVE3', ration: 40 },
    ];
    const r = distributeStage3to4(LIST, YM, cases, singleDept('XVE3'), empl, []);
    expect(emplCount(r, 'J1')).toBe(60);
    expect(emplCount(r, 'J2')).toBe(40);
  });

  it('EMPL-007：課有案件但無員工 → emplid NULL + STAGE4_NO_EMPL_WARN', () => {
    const cases = makeCases({ poolDeptId: 'XVF1', tier: 'T1', n: 51 });
    const r = distributeStage3to4(LIST, YM, cases, singleDept('AI000'), [], []);
    // Stage 3 配到 AI000（單課 100%），Stage 4 無員工 → emplid NULL。
    expect(r.assignments.filter((a) => a.dept_id === 'AI000').length).toBe(51);
    expect(r.assignments.every((a) => a.emplid === null)).toBe(true);
    const w = r.warnings.find((w) => w.event === 'STAGE4_NO_EMPL_WARN');
    expect(w).toMatchObject({
      event: 'STAGE4_NO_EMPL_WARN',
      dept_id: 'AI000',
      list_no: LIST,
      tier_level: 'T1',
      case_count: 51,
    });
  });

  it('EMPL-008：AI000/T2（37 件，E1/E2/E3 40/35/25，diff=2）→ 15/13/9', () => {
    const cases = makeCases({ poolDeptId: 'XVF1', tier: 'T2', n: 37 });
    const empl: EmplRation[] = [
      { emplid: 'E1', deptid_m: 'AI000', ration: 40 },
      { emplid: 'E2', deptid_m: 'AI000', ration: 35 },
      { emplid: 'E3', deptid_m: 'AI000', ration: 25 },
    ];
    const r = distributeStage3to4(LIST, YM, cases, singleDept('AI000'), empl, []);
    expect(emplCount(r, 'E1')).toBe(15);
    expect(emplCount(r, 'E2')).toBe(13);
    expect(emplCount(r, 'E3')).toBe(9);
  });

  it('EMPL-008b：AM000/T2（22 件，F1/F2/F3 50/30/20，diff=1）→ 12/6/4', () => {
    const cases = makeCases({ poolDeptId: 'XVF1', tier: 'T2', n: 22 });
    const empl: EmplRation[] = [
      { emplid: 'F1', deptid_m: 'AM000', ration: 50 },
      { emplid: 'F2', deptid_m: 'AM000', ration: 30 },
      { emplid: 'F3', deptid_m: 'AM000', ration: 20 },
    ];
    const r = distributeStage3to4(LIST, YM, cases, singleDept('AM000'), empl, []);
    expect(emplCount(r, 'F1')).toBe(12);
    expect(emplCount(r, 'F2')).toBe(6);
    expect(emplCount(r, 'F3')).toBe(4);
  });

  it('EMPL-009：T5 員工不走分流（K1=60/K2=40，prod_type 被動）→ 12/8', () => {
    const cases = makeCases({ poolDeptId: 'XVE4', tier: 'T5', n: 20 });
    const empl: EmplRation[] = [
      { emplid: 'K1', deptid_m: 'XVE4', ration: 60 },
      { emplid: 'K2', deptid_m: 'XVE4', ration: 40 },
    ];
    const r = distributeStage3to4(LIST, YM, cases, singleDept('XVE4'), empl, []);
    expect(emplCount(r, 'K1')).toBe(12);
    expect(emplCount(r, 'K2')).toBe(8);
  });
});

// ===========================================================================
// ASGD — ASSIGNDAY 千分比手算 oracle（AC-12）
// ===========================================================================
describe('F101 ASGD — ASSIGNDAY 千分比（手算 oracle）', () => {
  /** 20 工作日，各 ratioPerMille=50（baseRatio=FLOOR(1000/20)=50, remainder=0）。 */
  function workdays20(): WorkingDay[] {
    const out: WorkingDay[] = [];
    for (let i = 1; i <= 20; i++) {
      out.push({ casedt: `2026-06-${String(i).padStart(2, '0')}`, ratioPerMille: 50 });
    }
    return out;
  }

  function singleEmpl(emplid: string, deptId: string): {
    dept: DeptRation[];
    empl: EmplRation[];
  } {
    return {
      dept: [{ obdeptid: deptId, ration: 100 }],
      empl: [{ emplid, deptid_m: deptId, ration: 100 }],
    };
  }

  it('ASGD-001：E1（21 件，20 工作日）→ 19 日各 1 + 末日 2', () => {
    const cases = makeCases({ poolDeptId: 'XVF1', tier: 'T1', n: 21 });
    const { dept, empl } = singleEmpl('E1', 'AI000');
    const r = distributeStage3to4(LIST, YM, cases, dept, empl, workdays20());
    const byDay = new Map<string, number>();
    for (const a of r.assignments) {
      expect(a.assignday).not.toBeNull();
      byDay.set(a.assignday!, (byDay.get(a.assignday!) ?? 0) + 1);
    }
    const lastDay = '2026-06-20';
    expect(byDay.get(lastDay)).toBe(2);
    let onesCount = 0;
    for (const [d, c] of byDay) if (d !== lastDay) { expect(c).toBe(1); onesCount++; }
    expect(onesCount).toBe(19);
    expect([...byDay.values()].reduce((s, n) => s + n, 0)).toBe(21);
  });

  it('ASGD-002：E2（18 件，FLOOR(18×50/1000)=0）→ 全 18 件落末日', () => {
    const cases = makeCases({ poolDeptId: 'XVF1', tier: 'T1', n: 18 });
    const { dept, empl } = singleEmpl('E2', 'AI000');
    const r = distributeStage3to4(LIST, YM, cases, dept, empl, workdays20());
    const byDay = new Map<string, number>();
    for (const a of r.assignments) {
      expect(a.assignday).not.toBeNull();
      byDay.set(a.assignday!, (byDay.get(a.assignday!) ?? 0) + 1);
    }
    expect(byDay.get('2026-06-20')).toBe(18);
    expect(byDay.size).toBe(1);
  });

  it('ASGD-005：無工作日 → assignday NULL + ASSIGNDAY_NO_CALENDAR_WARN', () => {
    const cases = makeCases({ poolDeptId: 'XVF1', tier: 'T1', n: 21 });
    const { dept, empl } = singleEmpl('E1', 'AI000');
    const r = distributeStage3to4(LIST, '202607', cases, dept, empl, []);
    expect(r.assignments.every((a) => a.assignday === null)).toBe(true);
    const w = r.warnings.find((w) => w.event === 'ASSIGNDAY_NO_CALENDAR_WARN');
    expect(w).toMatchObject({
      event: 'ASSIGNDAY_NO_CALENDAR_WARN',
      list_no: LIST,
      work_ym: '202607',
    });
  });

  // F102 / AD-E07-30（I-CR-ASSIGNDAY-01）：CR 預指派案件納入 ASSIGNDAY 散佈但不參與 dept/empl 配額。
  it('ASGD-CR-001：CR 預指派案件 assignday 全非 NULL 且散佈（不扣量於指派日）', () => {
    // 21 件 CR 預指派至 E_CR（無 ration cases，配額池為空）。
    const crPreassigned: CrPreassignedCase[] = Array.from({ length: 21 }, (_, i) => ({
      orgno: '01',
      appl_no: `C${String(i + 1).padStart(4, '0')}`,
      tier_level: 'T1',
      emplid: 'E_CR',
      dept_id: 'XVE1',
      emplid_deptid: 'XVE1',
    }));
    const r = distributeStage3to4(LIST, YM, [], [], [], workdays20(), crPreassigned);
    const crRows = r.assignments.filter((a) => a.emplid === 'E_CR');
    expect(crRows.length).toBe(21);
    expect(crRows.every((a) => a.assignday !== null)).toBe(true);
    const byDay = new Map<string, number>();
    for (const a of crRows) byDay.set(a.assignday!, (byDay.get(a.assignday!) ?? 0) + 1);
    expect(byDay.get('2026-06-20')).toBe(2); // 末日吸收（FLOOR(21×50/1000)=1 ×19 + 末日 2）
    expect(byDay.size).toBe(20); // 散佈全 20 工作日
  });

  it('ASGD-CR-002：CR + 非 CR 同 emplid → 同基準散佈（CR 不扣量、配額仍只算非 CR）', () => {
    // 10 件非 CR（ration 分派至 XVE1/E_CR）+ 10 件 CR 預指派 emplid=E_CR。
    const cases = makeCases({ poolDeptId: 'XVF1', tier: 'T1', n: 10 });
    const dept: DeptRation[] = [{ obdeptid: 'XVE1', ration: 100 }];
    const empl: EmplRation[] = [{ emplid: 'E_CR', deptid_m: 'XVE1', ration: 100 }];
    const crPreassigned: CrPreassignedCase[] = Array.from({ length: 10 }, (_, i) => ({
      orgno: '01',
      appl_no: `C${String(i + 1).padStart(4, '0')}`,
      tier_level: 'T1',
      emplid: 'E_CR',
      dept_id: 'XVE1',
      emplid_deptid: 'XVE1',
    }));
    const r = distributeStage3to4(LIST, YM, cases, dept, empl, workdays20(), crPreassigned);
    // 全 20 件 emplid=E_CR（10 ration + 10 CR）。
    expect(r.assignments.filter((a) => a.emplid === 'E_CR').length).toBe(20);
    expect(r.assignments.every((a) => a.assignday !== null)).toBe(true);
    const byDay = new Map<string, number>();
    for (const a of r.assignments) byDay.set(a.assignday!, (byDay.get(a.assignday!) ?? 0) + 1);
    // E_CR 20 件 / 20 工作日（FLOOR(20×50/1000)=1，整除 → 每日 1）。
    expect(byDay.size).toBe(20);
    expect([...byDay.values()].every((n) => n === 1)).toBe(true);
  });
});

// ===========================================================================
// FALL — 警告組裝
// ===========================================================================
describe('F101 FALL — warning_summary 組裝', () => {
  it('FALL-004：三類警告 → summary 固定順序', () => {
    const summary = buildWarningSummary([
      { event: 'ASSIGNDAY_NO_CALENDAR_WARN', list_no: LIST, work_ym: YM },
      { event: 'STAGE4_NO_EMPL_WARN', dept_id: 'AI000', list_no: LIST, tier_level: 'T1', case_count: 5 },
      { event: 'STAGE3_NO_DEPT_RATION', list_no: LIST, tier_level: 'T2', case_count: 3 },
    ]);
    expect(summary).toBe(
      'STAGE3_NO_DEPT_RATION|STAGE4_NO_EMPL_WARN|ASSIGNDAY_NO_CALENDAR_WARN',
    );
  });

  it('無警告 → null', () => {
    expect(buildWarningSummary([])).toBeNull();
  });
});
