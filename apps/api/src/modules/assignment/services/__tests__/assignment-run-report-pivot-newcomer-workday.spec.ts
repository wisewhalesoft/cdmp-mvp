/**
 * AssignmentRunReportService.getPivot — F116 v1.1（US-182：職稱／新人標註／總計欄置前／工作天模式）
 *
 * 對應 spec：F116 v1.1 §4 AC-6~AC-11 / §5.1.1 欄位契約 / §6 BR-5~BR-17。
 * 對應架構：AD-E07-49 §3 裁定彙總 / §4 詳細設計 / §7 不變式。
 * 「總計欄移至最左」（AC-9/BR-11）純屬前端渲染順序，spec 明載「API 回應結構不因本 AC 改變」，
 * 故不在本檔（後端）測試，改由前端 `snapshot-pivot-view-newcomer-workday.test.tsx` 涵蓋。
 *
 * 盲測原則：斷言內容僅依 F116 v1.1 spec / AD-E07-49 之契約與規則撰寫，未讀取
 * assignment-run-report.service.ts 生產碼決定斷言內容；僅讀取既有
 * assignment-run-report-pivot.spec.ts（v1.0，同目錄）與 assignment-run-pipeline.service.spec.ts /
 * stage0-estimate.service.spec.ts 之既有測試檔以取得 buildModule/seed 慣例與 ObCalendar fixture
 * 寫法（test-generator blindness-practical-exceptions 記憶所載之 wiring 例外）。
 *
 * v1.0 既有測試（assignment-run-report-pivot.spec.ts）維持不變、不弱化，作為 AD-E07-49 §9 R-3
 * 要求之「無重複 emp_id 情境」回歸保護；本檔僅新增 v1.1 場景。
 *
 * 【v1.1.1 更正，2026-08-13】職稱來源由 `ob_emphire.jfun_nm` 改為 `ob_emphire.title_name`；
 * API 欄位 `jfunNm` → `titleName`（BR-5 整條反轉，理由與 dev MSSQL 317 筆實測數據見 spec §1.2）。
 * 本檔已同步更新：BR-5/AC-6 群組之陷阱值方向掉頭（現為「不得誤取 jfun_nm」），其餘場景僅欄名更名。
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { AssignmentRunReportService, isNewcomerAtWorkym } from '../assignment-run-report.service';
import { SectionChiefScopeService } from '../section-chief-scope.service';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { AssignmentRunSnapshot } from '@/database/entities/assignment-run-snapshot.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';
import { ObDeptPct } from '@/database/entities/ob-dept-pct.entity';
import { ObMonthlyRunResult } from '@/database/entities/ob-monthly-run-result.entity';
import { ObEmphire } from '@/database/entities/ob-emphire.entity';
import { ObEmplSet } from '@/database/entities/ob-empl-set.entity';
import { ObCalendar } from '@/database/entities/ob-calendar.entity';
import { User } from '@/database/entities/user.entity';

interface Env {
  service: AssignmentRunReportService;
  runRepo: Repository<AssignmentRun>;
  resultRepo: Repository<ObMonthlyRunResult>;
  emphireRepo: Repository<ObEmphire>;
  emplSetRepo: Repository<ObEmplSet>;
  calendarRepo: Repository<ObCalendar>;
  app: TestingModule;
}

async function buildModule(): Promise<Env> {
  const app = await Test.createTestingModule({
    imports: [
      TypeOrmModule.forRoot({
        type: 'better-sqlite3',
        database: ':memory:',
        entities: [
          AssignmentRun,
          AssignmentRunSnapshot,
          AssignmentAuditLog,
          ObDeptPct,
          ObMonthlyRunResult,
          ObEmphire,
          ObEmplSet,
          ObCalendar,
          User,
        ],
        synchronize: true,
      }),
      TypeOrmModule.forFeature([
        AssignmentRun,
        AssignmentRunSnapshot,
        AssignmentAuditLog,
        ObDeptPct,
        ObMonthlyRunResult,
        ObEmphire,
        ObEmplSet,
        ObCalendar,
        User,
      ]),
    ],
    providers: [AssignmentRunReportService, SectionChiefScopeService],
  }).compile();
  await app.init();
  return {
    service: app.get(AssignmentRunReportService),
    runRepo: app.get(getRepositoryToken(AssignmentRun)),
    resultRepo: app.get(getRepositoryToken(ObMonthlyRunResult)),
    emphireRepo: app.get(getRepositoryToken(ObEmphire)),
    emplSetRepo: app.get(getRepositoryToken(ObEmplSet)),
    calendarRepo: app.get(getRepositoryToken(ObCalendar)),
    app,
  };
}

let seq = 0;
function mkResult(env: Env, runId: string, emplid: string, listNo: string): ObMonthlyRunResult {
  return env.resultRepo.create({
    run_id: runId,
    list_no: listNo,
    orgno: '02',
    appl_no: `A${String(++seq).padStart(6, '0')}`,
    emplid,
    dept_id: 'D01',
    result_status: 'PENDING',
  } as Partial<ObMonthlyRunResult>);
}

function mkRun(runId: string, projectWorkym: string): Partial<AssignmentRun> {
  return {
    run_id: runId,
    project_workym: projectWorkym,
    triggered_by: 'u-director',
    status: 'completed',
    total_cases: 0,
    created_at: new Date('2026-07-11T08:43:28Z'),
  };
}

// ============================================================================
// isNewcomerAtWorkym 純函式（BR-6/BR-7/BR-8，T-2：月份位移與比較一律 TS 端 date-only 計算）
// ============================================================================
describe('isNewcomerAtWorkym（純函式，F116 v1.1 BR-6/BR-7/BR-8/T-2）', () => {
  // spec F116 §4 AC-7「驗證用具體樣本」：project_workym=202607 → baselineDate=2026-07-01,
  // thresholdDate = baselineDate − 3 個月 = 2026-04-01（曆月位移，BR-7）
  it.each([
    ['2026-03-31', false],
    ['2026-04-01', false], // 恰滿 3 個月（=門檻日）→ 非新人（BR-7 嚴格大於，不是 >=）
    ['2026-04-02', true],
    ['2026-07-15', true],
  ])('TS-F116-001：hire_date=%s, project_workym=202607 → isNewcomer=%s', (hireDate, expected) => {
    expect(isNewcomerAtWorkym(hireDate, '202607')).toBe(expected);
  });

  it('TS-F116-002：hire_date=null → false（BR-8，不臆測資歷）', () => {
    expect(isNewcomerAtWorkym(null, '202607')).toBe(false);
  });

  it('TS-F116-003：接受 Date 物件與 YYYY-MM-DD 字串兩種輸入，同一天結果一致（T-2 date-only 語意）', () => {
    expect(isNewcomerAtWorkym(new Date(Date.UTC(2026, 3, 2)), '202607')).toBe(true);
    expect(isNewcomerAtWorkym('2026-04-02', '202607')).toBe(true);
  });

  it('TS-F116-004（★核心）：判定結果不隨系統當日時間漂移（AC-7 末句：快照為歷史資料，任何檢視日期皆同結果）', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
      const a = isNewcomerAtWorkym('2026-04-02', '202607');
      vi.setSystemTime(new Date('2030-12-31T23:59:59Z'));
      const b = isNewcomerAtWorkym('2026-04-02', '202607');
      expect(a).toBe(true);
      expect(b).toBe(true);
      expect(a).toBe(b);
    } finally {
      vi.useRealTimers();
    }
  });

  it('TS-F116-005：跨年份曆月位移（project_workym=202601 → 門檻 2025-10-01）', () => {
    expect(isNewcomerAtWorkym('2025-10-01', '202601')).toBe(false); // 恰滿 3 個月
    expect(isNewcomerAtWorkym('2025-10-02', '202601')).toBe(true);
  });
});

// ============================================================================
// getPivot 整合測試（真實 SQLite）
// ============================================================================
describe('AssignmentRunReportService.getPivot — F116 v1.1（US-182）', () => {
  let env: Env;

  beforeAll(async () => {
    env = await buildModule();
  });

  afterAll(async () => {
    await env.app.close();
  });

  describe('BR-5 / AC-6【v1.1.1 反轉】：職稱來源唯一為 title_name（禁止誤取 jfun_nm）', () => {
    // v1.1.1 更正（2026-08-13，spec §1.2）：dev MSSQL 317 筆實測 jfun_nm 91% 為「營業一般職」
    // （職能分類，於樞紐列標籤無辨識度），title_name 才是真正職稱。BR-5 條文整條反轉：現為
    // 「來源唯一 title_name、禁用 jfun_nm」。每筆 fixture 之 jfun_nm 與 title_name 刻意帶不同值，
    // 避免兩者恰巧相同而矇混掉取錯欄位的紅燈。
    const runId = 'f116v11-title-run';

    beforeAll(async () => {
      await env.runRepo.save(env.runRepo.create(mkRun(runId, '202607')));
      await env.emphireRepo.save([
        env.emphireRepo.create({
          emp_id: 'JF001',
          dept_name: '中區電銷1',
          emp_nm: '測試甲',
          title_name: '業務專員',
          jfun_nm: '營業一般職', // 陷阱值：與 title_name 刻意不同，若實作誤取此欄斷言會失敗
        } as Partial<ObEmphire>),
        env.emphireRepo.create({
          emp_id: 'JF002',
          dept_name: '中區電銷1',
          emp_nm: '測試乙',
          title_name: null,
          jfun_nm: '營業一般職', // 陷阱值：title_name=NULL 但 jfun_nm 有值，不得誤 fallback
        } as Partial<ObEmphire>),
        env.emphireRepo.create({
          emp_id: 'JF003',
          dept_name: '中區電銷1',
          emp_nm: '測試丙',
          title_name: '',
          jfun_nm: '處長', // 陷阱值：title_name=空字串但 jfun_nm 有值，不得誤 fallback
        } as Partial<ObEmphire>),
      ]);
      await env.resultRepo.save([
        mkResult(env, runId, 'JF001', 'OB1'),
        mkResult(env, runId, 'JF002', 'OB1'),
        mkResult(env, runId, 'JF003', 'OB1'),
      ]);
    });

    it('TS-F116-010（★核心）：titleName 來源為 title_name，不得為 jfun_nm', async () => {
      const res = await env.service.getPivot(runId, null);
      const emp = res.depts[0].emplids.find((e) => e.emplid === 'JF001')!;
      expect(emp.titleName).toBe('業務專員');
      expect(emp.titleName).not.toBe('營業一般職');
    });

    it('TS-F116-011：title_name 為 NULL → titleName 契約值為 null（AC-8，即使 jfun_nm 有值也不得 fallback）', async () => {
      const res = await env.service.getPivot(runId, null);
      const emp = res.depts[0].emplids.find((e) => e.emplid === 'JF002')!;
      expect(emp.titleName).toBeNull();
    });

    it('TS-F116-012：title_name 為空字串 → titleName 契約值為 null（BR-5，即使 jfun_nm 有值也不得 fallback）', async () => {
      const res = await env.service.getPivot(runId, null);
      const emp = res.depts[0].emplids.find((e) => e.emplid === 'JF003')!;
      expect(emp.titleName).toBeNull();
    });
  });

  describe('BR-6/BR-7 / AC-7：新人判定（透過 getPivot 整合路徑）', () => {
    const runId = 'f116v11-newcomer-run';

    beforeAll(async () => {
      await env.runRepo.save(env.runRepo.create(mkRun(runId, '202607')));
      await env.emphireRepo.save([
        env.emphireRepo.create({
          emp_id: 'NC001',
          dept_name: '北區電銷1',
          emp_nm: '恰滿三月',
          hire_date: new Date('2026-04-01'),
        } as Partial<ObEmphire>),
        env.emphireRepo.create({
          emp_id: 'NC002',
          dept_name: '北區電銷1',
          emp_nm: '未滿三月',
          hire_date: new Date('2026-04-02'),
        } as Partial<ObEmphire>),
      ]);
      await env.resultRepo.save([mkResult(env, runId, 'NC001', 'OB1'), mkResult(env, runId, 'NC002', 'OB1')]);
    });

    it('TS-F116-013：hire_date 恰等於門檻日（2026-04-01）→ isNewcomer=false（嚴格大於）', async () => {
      const res = await env.service.getPivot(runId, null);
      const emp = res.depts[0].emplids.find((e) => e.emplid === 'NC001')!;
      expect(emp.isNewcomer).toBe(false);
    });

    it('TS-F116-014：hire_date 門檻日+1天（2026-04-02）→ isNewcomer=true', async () => {
      const res = await env.service.getPivot(runId, null);
      const emp = res.depts[0].emplids.find((e) => e.emplid === 'NC002')!;
      expect(emp.isNewcomer).toBe(true);
    });
  });

  describe('AC-8 / BR-8~BR-10：職稱／新人標註之邊界情境', () => {
    const runId = 'f116v11-edge-run';

    beforeAll(async () => {
      await env.runRepo.save(env.runRepo.create(mkRun(runId, '202607')));
      await env.emphireRepo.save([
        env.emphireRepo.create({
          emp_id: 'ED001',
          dept_name: '南區電銷',
          emp_nm: '無到職日',
          hire_date: null,
        } as Partial<ObEmphire>),
        env.emphireRepo.create({
          emp_id: 'ED002',
          dept_name: '南區電銷',
          emp_nm: '已離職',
          title_name: '資深專員',
          jfun_nm: '營業一般職', // 陷阱值：與 title_name 刻意不同
          hire_date: new Date('2020-01-01'),
          resign_date: new Date('2021-06-30'), // 非哨兵值，明確代表非在職
        } as Partial<ObEmphire>),
      ]);
      await env.resultRepo.save([
        mkResult(env, runId, 'ED001', 'OB1'),
        mkResult(env, runId, 'ED002', 'OB1'),
        mkResult(env, runId, 'ED002', 'OB2'),
        mkResult(env, runId, '99999', 'OB1'), // 無 ob_emphire 對應 → 歸組「(空白)」
      ]);
    });

    it('TS-F116-015：hire_date=NULL → isNewcomer=false（BR-8，不臆測資歷）', async () => {
      const res = await env.service.getPivot(runId, null);
      const emp = res.depts[0].emplids.find((e) => e.emplid === 'ED001')!;
      expect(emp.isNewcomer).toBe(false);
    });

    it('TS-F116-016（★核心 / I-F116-NO-ACTIVE-FILTER-01）：已離職員編仍完整顯示 empNm/titleName/isNewcomer 與分派筆數，不得被在職過濾排除', async () => {
      const res = await env.service.getPivot(runId, null);
      const dept = res.depts.find((d) => d.deptName === '南區電銷')!;
      const emp = dept.emplids.find((e) => e.emplid === 'ED002')!;
      // 若實作誤引入 emphire-active.util 或 resign_date 過濾（BR-9/T-6 明文禁止），此員編會從結果消失
      expect(emp).toBeDefined();
      expect(emp.empNm).toBe('已離職');
      expect(emp.titleName).toBe('資深專員');
      expect(emp.isNewcomer).toBe(false); // hire_date=2020-01-01 遠早於門檻，非新人
      expect(emp.total).toBe(2); // OB1 x1 + OB2 x1，計數不因離職被歸零或濾除
      expect(emp.byList).toEqual({ OB1: 1, OB2: 1 });
    });

    it('TS-F116-017：「(空白)」分組（無 ob_emphire 對應）→ titleName=null、isNewcomer=false（BR-10）', async () => {
      const res = await env.service.getPivot(runId, null);
      const blank = res.depts.find((d) => d.deptName === '(空白)')!;
      const emp = blank.emplids.find((e) => e.emplid === '99999')!;
      expect(emp.titleName).toBeNull();
      expect(emp.isNewcomer).toBe(false);
    });
  });

  describe('BR-12 / T-3：workingDays 計算（複用 computeWorkingDayRatios，AD-E07-49 §4.1）', () => {
    const runId = 'f116v11-workday-run';

    beforeAll(async () => {
      await env.runRepo.save(env.runRepo.create(mkRun(runId, '202607')));
      await env.resultRepo.save([mkResult(env, runId, 'WD001', 'OB1')]);
      // 刻意混合工作日/例假日 + 月份邊界日（T-3 陷阱：查詢須以 'YYYY-MM-DD' 字串邊界比較，
      // 不得傳入 JS Date 物件，否則 UTC+8 換算會漏掉邊界日，見 feedback_typeorm_between_timezone）
      const rows: Array<[string, string]> = [
        ['2026-06-30', '0'], // 6 月末工作日 → 不應計入 7 月
        ['2026-07-01', '0'], // 7 月首日工作日 → 應計入
        ['2026-07-02', '1'], // 7 月例假日 → 不計入
        ['2026-07-03', '0'], // 工作日 → 應計入
        ['2026-07-31', '0'], // 7 月末日工作日 → 應計入
        ['2026-08-01', '0'], // 8 月首日工作日 → 不應計入 7 月
      ];
      await env.calendarRepo.save(
        rows.map(([d, f]) =>
          env.calendarRepo.create({ calendar_date: new Date(d), rest_flg: f } as Partial<ObCalendar>),
        ),
      );
    });

    it('TS-F116-020（★核心 / T-3 邊界）：workingDays 僅計入 project_workym 當月 rest_flg=0 之列，月界正確（不漏含首尾日、不誤含跨月日）', async () => {
      const res = await env.service.getPivot(runId, null);
      // 7 月工作日：07-01, 07-03, 07-31 = 3 天（06-30 與 08-01 均不計入）
      expect(res.workingDays).toBe(3);
    });

    it('TS-F116-021：projectWorkym 回傳值取自 run.project_workym', async () => {
      const res = await env.service.getPivot(runId, null);
      expect(res.projectWorkym).toBe('202607');
    });
  });

  describe('AC-11 / BR-15：ob_calendar 該月無資料 → workingDays=0（非錯誤、非 null/undefined）', () => {
    const runId = 'f116v11-noworkday-run';

    beforeAll(async () => {
      // 202609：本檔案未對此月份 seed 任何 ob_calendar 資料
      await env.runRepo.save(env.runRepo.create(mkRun(runId, '202609')));
      await env.resultRepo.save([mkResult(env, runId, 'WD002', 'OB1')]);
    });

    it('TS-F116-022（★核心）：ob_calendar 缺該月資料 → workingDays=0（型別為 number，非 null/undefined）', async () => {
      const res = await env.service.getPivot(runId, null);
      expect(res.workingDays).toBe(0);
      expect(typeof res.workingDays).toBe('number');
      expect(res.workingDays).not.toBeNull();
      expect(res.workingDays).not.toBeUndefined();
    });
  });

  describe('AC-4 v1.1 補充：workingDays 為 run 月份屬性，與處長 scope 無關', () => {
    const runId = 'f116v11-scope-workday-run';

    beforeAll(async () => {
      // 沿用「BR-12 / T-3」describe 已 seed 之 202607 ob_calendar（workingDays=3）
      await env.runRepo.save(env.runRepo.create(mkRun(runId, '202607')));
      await env.emphireRepo.save([
        env.emphireRepo.create({ emp_id: 'SC001', dept_name: '北區電銷2', emp_nm: '無轄區員編' } as Partial<ObEmphire>),
      ]);
      await env.resultRepo.save([mkResult(env, runId, 'SC001', 'OB1')]);
      // 刻意不建立任何 ob_empl_set 轄區資料 → section_chief 無轄區
    });

    it('TS-F116-023（spec §11 邊界矩陣「處長無轄區」列）：section_chief 無轄區 → depts=[]、grandTotal=0，但 workingDays 仍為真實值（不受 scope 影響）', async () => {
      const actor = { userId: 'sc-empty', role: 'user', businessRole: 'section_chief' };
      const res = await env.service.getPivot(runId, actor);
      expect(res.depts).toEqual([]);
      expect(res.grandTotal).toBe(0);
      expect(res.workingDays).toBe(3);
      expect(res.projectWorkym).toBe('202607');
    });
  });
});

// ============================================================================
// I-F116-EMPHIRE-DEDUP-01（AD-E07-49 §4.2 / §2 事實 4）：獨立 DB，因需重建
// ob_emphire 為無 PK 約束之表以重現「ETL full-replace 同步表繞過 PK 產生同 emp_id 兩列」情境
// （正常 synchronize:true 建表對 emp_id 有 UNIQUE/PK 索引，會擋下重複插入，故需獨立處理，不與
// 上方共用 env，避免影響其他 describe）。DROP + 無 PK CREATE TABLE 為既有 c360.service.spec.ts
// 已驗證之 raw DDL 慣例（見 test-generator blindness-practical-exceptions 記憶）。
// ============================================================================
describe('I-F116-EMPHIRE-DEDUP-01：ob_emphire 同 emp_id 重複列防禦', () => {
  const runId = 'f116v11-dedup-run';
  let dedupEnv: Env;

  beforeAll(async () => {
    dedupEnv = await buildModule();
    const ds = dedupEnv.app.get(DataSource);
    await ds.query('DROP TABLE ob_emphire');
    await ds.query(
      // v1.1.1：title_name（非 jfun_nm）為職稱來源欄位（BR-5 反轉），本測試不斷言職稱內容本身，
      // 僅需與 getPivot 查詢實際 SELECT 的欄位集合一致（title_name/hire_date），避免因欄名不符
      // 產生 "no such column" 而使本測試以錯誤原因紅燈
      `CREATE TABLE ob_emphire (emp_id varchar, dept_name varchar, emp_nm varchar, title_name varchar, hire_date date)`,
    );
    // 以純 raw SQL INSERT（非 TypeORM repo.save()/insert()）寫入重複 emp_id 兩列：
    // repo.save() 對非資料庫產生 PK 之 entity 會先送出存在性檢查 SELECT、repo.insert() 之
    // multi-row VALUES 會展開整個 entity 欄位集合（含本測試未重建之 id_no 等欄），兩者皆會因
    // 本測試刻意精簡的 5 欄表而報 "no such column"。改用 raw SQL 完全繞過 entity metadata，
    // 僅參照本測試實際建立的欄位（此為本測試 fixture 本身之 wiring 需求，非斷言內容）。
    await ds.query(
      `INSERT INTO ob_emphire (emp_id, dept_name, emp_nm, title_name) VALUES (?, ?, ?, ?), (?, ?, ?, ?)`,
      ['50001', '中區電銷1', '測試重複', '業務專員', '50001', '中區電銷1', '測試重複', '業務專員'],
    );
    await dedupEnv.runRepo.save(dedupEnv.runRepo.create(mkRun(runId, '202607')));
    await dedupEnv.resultRepo.save([
      mkResult(dedupEnv, runId, '50001', 'OB1'),
      mkResult(dedupEnv, runId, '50001', 'OB1'),
      mkResult(dedupEnv, runId, '50001', 'OB2'),
    ]);
  });

  afterAll(async () => {
    await dedupEnv.app.close();
  });

  it('TS-F116-018（★核心）：ob_emphire 重複 emp_id 不得使 join fan-out、計數不得被重複計入', async () => {
    const res = await dedupEnv.service.getPivot(runId, null);
    // 真實計數：OB1 x2 + OB2 x1 = 3；若未去重（join fan-out）會變成 6
    expect(res.grandTotal).toBe(3);
    const dept = res.depts.find((d) => d.deptName === '中區電銷1')!;
    expect(dept.total).toBe(3);
    const matches = dept.emplids.filter((e) => e.emplid === '50001');
    expect(matches).toHaveLength(1); // 輸出仍收斂為單一節點，不因重複主檔列產生兩個節點
    expect(matches[0].total).toBe(3);
    expect(matches[0].byList).toEqual({ OB1: 2, OB2: 1 });
  });
});
