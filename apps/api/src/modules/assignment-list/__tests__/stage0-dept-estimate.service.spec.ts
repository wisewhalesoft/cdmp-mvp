/**
 * Stage0EstimateService.computeDeptEstimate — F049 v2.0 Part B 部門投影層 unit tests
 *
 * 對應 test-design：F049-test.md Part B（DEPT / GAP / SCOPE / FEAS / INVAR / EDGE）
 * 對應 spec：F049 v2.0 §14~§22；架構 AD-E07-v3.6
 *
 * 數值 oracle（手算，§16.1/§16.3）：dept_real = Σ(list_total × ration/100 × dpm/1000)，
 * 最終 Math.round 一次；gap_real 先算再 round（容差 ±部門數件，不 assert Σ 部門捨入 === orgTotal）。
 *
 * dpm（每日千分位）由 computeWorkingDayRatios 對「整月工作日」計算（與 prototype recompute 同源，
 * 全月 20 工作日 → 每工作日 50‰）；起訖日僅限縮 days[] 顯示子集。故測試多以 seedMay2026Calendar
 * （20 工作日）+ 單日範圍取得 dpm=50‰ 之乾淨斷言。
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  Stage0EstimateService,
  computeWorkingDayRatios,
  type ActorLike,
} from '../stage0-estimate.service';
import { SectionChiefScopeService } from '@/modules/assignment/services/section-chief-scope.service';
import { ObListDefinition } from '@/database/entities/ob-list-definition.entity';
import { ObPoolData } from '@/database/entities/ob-pool-data.entity';
import { ObPoolDataList } from '@/database/entities/ob-pool-data-list.entity';
import { ObCalendar } from '@/database/entities/ob-calendar.entity';
import { ObDeptPct } from '@/database/entities/ob-dept-pct.entity';
import { ObEmphire } from '@/database/entities/ob-emphire.entity';
import { ObEmplSet } from '@/database/entities/ob-empl-set.entity';
import { User } from '@/database/entities/user.entity';

const YM = '202605';
const WORKDAY = '2026-05-04'; // 週一，dpm=50‰（全月 20 工作日）
const RESTDAY = '2026-05-03'; // 週日，rest_flg='1'

async function buildModule() {
  const app: TestingModule = await Test.createTestingModule({
    imports: [
      TypeOrmModule.forRoot({
        type: 'better-sqlite3',
        database: ':memory:',
        entities: [
          ObListDefinition,
          ObPoolData,
          ObPoolDataList,
          ObCalendar,
          ObDeptPct,
          ObEmphire,
          ObEmplSet,
          User,
        ],
        synchronize: true,
      }),
      TypeOrmModule.forFeature([
        ObListDefinition,
        ObPoolData,
        ObPoolDataList,
        ObCalendar,
        ObDeptPct,
        ObEmphire,
        ObEmplSet,
        User,
      ]),
    ],
    providers: [Stage0EstimateService, SectionChiefScopeService],
  }).compile();

  await app.init();
  const ds = app.get(DataSource);
  return {
    app,
    ds,
    service: app.get(Stage0EstimateService),
    scopeService: app.get(SectionChiefScopeService),
    listRepo: app.get<Repository<ObListDefinition>>(
      getRepositoryToken(ObListDefinition),
    ),
    deptPctRepo: app.get<Repository<ObDeptPct>>(getRepositoryToken(ObDeptPct)),
    emphireRepo: app.get<Repository<ObEmphire>>(getRepositoryToken(ObEmphire)),
    poolRepo: app.get<Repository<ObPoolData>>(getRepositoryToken(ObPoolData)),
    calRepo: app.get<Repository<ObCalendar>>(getRepositoryToken(ObCalendar)),
  };
}

async function seedList(
  listRepo: Repository<ObListDefinition>,
  listNo: string,
  stage0EstimateCount: number | null,
): Promise<void> {
  const now = new Date();
  await listRepo.save(
    listRepo.create({
      list_no: listNo,
      list_nm: '名單' + listNo,
      prod_kind: 'A',
      prod_best: 'Y',
      list_type: '01',
      list_period_start: '001',
      list_period_end: '030',
      list_interval: '030',
      project_workym: YM,
      caseyear: '113',
      settle_src: '01',
      card_type: 'T1',
      case_status: '01',
      cr_enabled: false,
      status: 'active',
      stage: 'ready',
      stage0_estimate_count: stage0EstimateCount,
      created_by_prog: 'TEST',
      created_by: 'tester',
      created_at: now,
      updated_by_prog: 'TEST',
      updated_by: 'tester',
      updated_at: now,
    } as Partial<ObListDefinition>),
  );
}

async function seedDeptPct(
  deptPctRepo: Repository<ObDeptPct>,
  listNo: string,
  obdeptid: string,
  obdeptnm: string,
  ration: number,
): Promise<void> {
  const now = new Date();
  await deptPctRepo.save(
    deptPctRepo.create({
      project_workym: YM,
      list_no: listNo,
      obdeptid,
      obdeptnm,
      ration: String(ration),
      created_by_prog: 'TEST',
      created_by: 'tester',
      created_at: now,
      updated_by_prog: 'TEST',
      updated_by: 'tester',
      updated_at: now,
    } as Partial<ObDeptPct>),
  );
}

async function seedEmphire(
  emphireRepo: Repository<ObEmphire>,
  deptCode: string,
  count: number,
  idPrefix = deptCode,
): Promise<void> {
  for (let i = 0; i < count; i++) {
    await emphireRepo.save(
      emphireRepo.create({
        emp_id: `${idPrefix}-${i}`.slice(0, 10),
        emp_nm: 'E' + i,
        dept_code: deptCode,
        dept_name: deptCode + '部',
        jfun_nm: '電訪員',
        resign_date: null,
      } as Partial<ObEmphire>),
    );
  }
}

/** 2026-05 全月行事曆（20 工作日；5/1 勞動節 + 週末 = rest_flg='1'）。 */
async function seedMay2026Calendar(calRepo: Repository<ObCalendar>) {
  const holidays = new Set(['2026-05-01']);
  const rows: ObCalendar[] = [];
  for (let day = 1; day <= 31; day++) {
    const d = new Date(Date.UTC(2026, 4, day));
    const ymd = `2026-05-${String(day).padStart(2, '0')}`;
    const dow = d.getUTCDay();
    const isWeekend = dow === 0 || dow === 6;
    const restFlg = isWeekend || holidays.has(ymd) ? '1' : '0';
    rows.push(calRepo.create({ calendar_date: new Date(ymd), rest_flg: restFlg }));
  }
  await calRepo.save(rows);
}

const director: ActorLike = {
  userId: 'u-dir',
  role: 'user',
  businessRole: 'director',
};
const sectionChief: ActorLike = {
  userId: 'u-sc',
  role: 'user',
  businessRole: 'section_chief',
};

function findDay(res: { days: Array<{ date: string }> }, date: string) {
  return res.days.find((d) => d.date === date)!;
}

describe('Stage0EstimateService.computeDeptEstimate（F049 v2.0 Part B）', () => {
  let env: Awaited<ReturnType<typeof buildModule>>;

  beforeAll(async () => {
    env = await buildModule();
  });
  afterAll(async () => {
    await env.app.close();
  });
  beforeEach(async () => {
    delete process.env.STAGE0_MAX_CASES_PER_PERSON_PER_DAY;
    delete process.env.STAGE0_DEPT_ESTIMATE_TIMEOUT_MS;
    delete process.env.STAGE0_POOL_WARN_THRESHOLD;
    await env.ds.query('DELETE FROM ob_list_definition');
    await env.ds.query('DELETE FROM ob_dept_pct');
    await env.ds.query('DELETE FROM ob_emphire');
    await env.ds.query('DELETE FROM ob_pool_data');
    await env.ds.query('DELETE FROM ob_calendar');
    vi.restoreAllMocks();
  });

  // =====================================================================
  // 五、DEPT — 部門投影公式
  // =====================================================================
  describe('DEPT — 部門投影公式（BR-8 / §16.1）', () => {
    it('TS-F049-DEPT-001：兩名單×兩部門×一工作日完整公式（26/49/75/0）', async () => {
      await seedMay2026Calendar(env.calRepo);
      await seedList(env.listRepo, 'LIST-A', 1000);
      await seedList(env.listRepo, 'LIST-B', 500);
      await seedDeptPct(env.deptPctRepo, 'LIST-A', 'D001', '北一', 40);
      await seedDeptPct(env.deptPctRepo, 'LIST-A', 'D002', '北二', 60);
      await seedDeptPct(env.deptPctRepo, 'LIST-B', 'D001', '北一', 25);
      await seedDeptPct(env.deptPctRepo, 'LIST-B', 'D002', '北二', 75);
      await seedEmphire(env.emphireRepo, 'D001', 10);
      await seedEmphire(env.emphireRepo, 'D002', 10);

      const res = await env.service.computeDeptEstimate(YM, {
        calendarSource: 'weekday',
        startDate: WORKDAY,
        endDate: WORKDAY,
        actor: director,
      });

      const day = findDay(res, WORKDAY);
      expect(day.isWorkday).toBe(true);
      expect(day.deptCells).toHaveLength(2);
      // I-DEPT-ORDER-01：deptCode ASC
      expect(day.deptCells[0].deptCode).toBe('D001');
      expect(day.deptCells[1].deptCode).toBe('D002');
      expect(day.deptCells[0].cases).toBe(26);
      expect(day.deptCells[1].cases).toBe(49);
      expect(day.orgTotal).toBe(75);
      expect(day.gap).toBe(0);
      // 容差確認（±1，不 assert 嚴格等於）
      expect(day.deptCells[0].cases + day.deptCells[1].cases).toBeGreaterThanOrEqual(74);
      expect(day.deptCells[0].cases + day.deptCells[1].cases).toBeLessThanOrEqual(76);
    });

    it('TS-F049-DEPT-002：休息日 deptCells=[] / orgTotal=0 / gap=0；工作日對比非空', async () => {
      await seedMay2026Calendar(env.calRepo);
      await seedList(env.listRepo, 'LIST-A', 1000);
      await seedDeptPct(env.deptPctRepo, 'LIST-A', 'D001', '北一', 40);
      await seedDeptPct(env.deptPctRepo, 'LIST-A', 'D002', '北二', 60);
      await seedEmphire(env.emphireRepo, 'D001', 10);
      await seedEmphire(env.emphireRepo, 'D002', 10);

      const res = await env.service.computeDeptEstimate(YM, {
        startDate: RESTDAY,
        endDate: WORKDAY,
        actor: director,
      });

      const rest = findDay(res, RESTDAY);
      expect(rest.isWorkday).toBe(false);
      expect(rest.deptCells).toEqual([]);
      expect(rest.orgTotal).toBe(0);
      expect(rest.deptAssignedTotal).toBe(0);
      expect(rest.gap).toBe(0);
      expect(findDay(res, WORKDAY).deptCells.length).toBeGreaterThan(0);
    });

    it('TS-F049-DEPT-003：ration 為 per-list（D001=50，非 MIN(LIST_NO) 共用 40）', async () => {
      await seedMay2026Calendar(env.calRepo);
      await seedList(env.listRepo, 'LIST-A', 1000);
      await seedList(env.listRepo, 'LIST-B', 1000);
      await seedDeptPct(env.deptPctRepo, 'LIST-A', 'D001', '北一', 40);
      await seedDeptPct(env.deptPctRepo, 'LIST-B', 'D001', '北一', 60);
      await seedEmphire(env.emphireRepo, 'D001', 10);

      const res = await env.service.computeDeptEstimate(YM, {
        startDate: WORKDAY,
        endDate: WORKDAY,
        actor: director,
      });
      const day = findDay(res, WORKDAY);
      // (1000×0.40×0.05)+(1000×0.60×0.05) = 20+30 = 50（非 2000×0.40×0.05=40）
      expect(day.deptCells[0].cases).toBe(50);
    });

    it('TS-F049-DEPT-004：single-list 模式僅該名單貢獻；mode/listNo 正確', async () => {
      await seedMay2026Calendar(env.calRepo);
      await seedList(env.listRepo, 'LIST-A', 1000);
      await seedList(env.listRepo, 'LIST-B', 1000);
      await seedList(env.listRepo, 'LIST-C', 1000);
      for (const l of ['LIST-A', 'LIST-B', 'LIST-C']) {
        await seedDeptPct(env.deptPctRepo, l, 'D001', '北一', 40);
      }
      await seedEmphire(env.emphireRepo, 'D001', 10);

      const agg = await env.service.computeDeptEstimate(YM, {
        startDate: WORKDAY,
        endDate: WORKDAY,
        actor: director,
      });
      const single = await env.service.computeDeptEstimate(YM, {
        listNo: 'LIST-B',
        startDate: WORKDAY,
        endDate: WORKDAY,
        actor: director,
      });
      expect(single.mode).toBe('single-list');
      expect(single.listNo).toBe('LIST-B');
      expect(agg.mode).toBe('aggregated');
      // single < aggregated
      const aggCases = findDay(agg, WORKDAY).deptCells[0].cases;
      const singleCases = findDay(single, WORKDAY).deptCells[0].cases;
      expect(singleCases).toBeLessThan(aggCases);
      expect(singleCases).toBe(20); // 1000×0.40×0.05
    });

    it('TS-F049-DEPT-005：整期 0 件部門（ration=0）被隱藏、不發 DEPT_HEADCOUNT_ZERO、org/gap 不變（AC-DEPT-2）', async () => {
      await seedMay2026Calendar(env.calRepo);
      await seedList(env.listRepo, 'LIST-A', 1000);
      // D001 取全部量；DZERO 有 ration 列但為 0% → 整期 0 件，應被隱藏
      await seedDeptPct(env.deptPctRepo, 'LIST-A', 'D001', '北一', 100);
      await seedDeptPct(env.deptPctRepo, 'LIST-A', 'DZERO', '閒置部', 0);
      await seedEmphire(env.emphireRepo, 'D001', 10);
      // DZERO 不 seed 員工（headcount=0）：若未被排除會誤發 DEPT_HEADCOUNT_ZERO

      const res = await env.service.computeDeptEstimate(YM, {
        startDate: WORKDAY,
        endDate: WORKDAY,
        actor: director,
      });
      const day = findDay(res, WORKDAY);
      // 只保留 D001；DZERO 不出現於 departments[] 與 deptCells[]
      expect(res.departments.map((d) => d.deptCode)).toEqual(['D001']);
      expect(day.deptCells).toHaveLength(1);
      expect(day.deptCells[0].deptCode).toBe('D001');
      expect(day.deptCells.find((c) => c.deptCode === 'DZERO')).toBeUndefined();
      // 不變量：org_total / gap 不受隱藏影響（DZERO 件數=0）
      expect(day.orgTotal).toBe(50);
      expect(day.deptCells[0].cases).toBe(50);
      expect(day.gap).toBe(0);
      // 被隱藏的 0 件部門不得觸發 DEPT_HEADCOUNT_ZERO
      expect(res.warnings.some((w) => w.code === 'DEPT_HEADCOUNT_ZERO')).toBe(
        false,
      );
    });
  });

  // =====================================================================
  // 六、GAP — 缺口機制
  // =====================================================================
  describe('GAP — 缺口機制（BR-9/10/11 / §16.2~16.3）', () => {
    it('TS-F049-GAP-001：60% → gap=20、缺口列、D002 不出現', async () => {
      await seedMay2026Calendar(env.calRepo);
      await seedList(env.listRepo, 'LIST-A', 1000);
      await seedDeptPct(env.deptPctRepo, 'LIST-A', 'D001', '北一', 60);
      await seedEmphire(env.emphireRepo, 'D001', 10);

      const res = await env.service.computeDeptEstimate(YM, {
        startDate: WORKDAY,
        endDate: WORKDAY,
        actor: director,
      });
      const day = findDay(res, WORKDAY);
      expect(day.deptCells).toHaveLength(1);
      expect(day.deptCells[0].cases).toBe(30);
      expect(day.orgTotal).toBe(50);
      expect(day.gap).toBe(20);
      expect(day.deptCells.find((c) => c.deptCode === 'D002')).toBeUndefined();
    });

    it('TS-F049-GAP-002：70%（30+40）→ gap=30；無名單層警示', async () => {
      await seedMay2026Calendar(env.calRepo);
      await seedList(env.listRepo, 'LIST-B', 2000);
      await seedDeptPct(env.deptPctRepo, 'LIST-B', 'D001', '北一', 30);
      await seedDeptPct(env.deptPctRepo, 'LIST-B', 'D002', '北二', 40);
      await seedEmphire(env.emphireRepo, 'D001', 10);
      await seedEmphire(env.emphireRepo, 'D002', 10);

      const res = await env.service.computeDeptEstimate(YM, {
        startDate: WORKDAY,
        endDate: WORKDAY,
        actor: director,
      });
      const day = findDay(res, WORKDAY);
      expect(day.deptCells[0].cases).toBe(30);
      expect(day.deptCells[1].cases).toBe(40);
      expect(day.orgTotal).toBe(100);
      expect(day.gap).toBe(30);
      const codes = res.warnings.map((w) => w.code);
      expect(codes).not.toContain('RATIO_BELOW_100');
    });

    it('TS-F049-GAP-003：完全無 ob_dept_pct → deptCells=[]、gap=org_total=25', async () => {
      await seedMay2026Calendar(env.calRepo);
      await seedList(env.listRepo, 'LIST-A', 500);

      const res = await env.service.computeDeptEstimate(YM, {
        startDate: WORKDAY,
        endDate: WORKDAY,
        actor: director,
      });
      const day = findDay(res, WORKDAY);
      expect(day.deptCells).toEqual([]);
      expect(day.orgTotal).toBe(25);
      expect(day.deptAssignedTotal).toBe(0);
      expect(day.gap).toBe(25);
    });

    it('TS-F049-GAP-004：100% → gap=0', async () => {
      await seedMay2026Calendar(env.calRepo);
      await seedList(env.listRepo, 'LIST-A', 1000);
      await seedDeptPct(env.deptPctRepo, 'LIST-A', 'D001', '北一', 40);
      await seedDeptPct(env.deptPctRepo, 'LIST-A', 'D002', '北二', 60);
      await seedEmphire(env.emphireRepo, 'D001', 10);
      await seedEmphire(env.emphireRepo, 'D002', 10);

      const res = await env.service.computeDeptEstimate(YM, {
        startDate: WORKDAY,
        endDate: WORKDAY,
        actor: director,
      });
      expect(findDay(res, WORKDAY).gap).toBe(0);
    });

    it('TS-F049-GAP-005：33/33/33 捨入容差 → gap=1（不 assert Σ 部門 === orgTotal）', async () => {
      await seedMay2026Calendar(env.calRepo);
      await seedList(env.listRepo, 'LIST-A', 1000);
      await seedDeptPct(env.deptPctRepo, 'LIST-A', 'D001', '北一', 33);
      await seedDeptPct(env.deptPctRepo, 'LIST-A', 'D002', '北二', 33);
      await seedDeptPct(env.deptPctRepo, 'LIST-A', 'D003', '北三', 33);
      await seedEmphire(env.emphireRepo, 'D001', 10);
      await seedEmphire(env.emphireRepo, 'D002', 10);
      await seedEmphire(env.emphireRepo, 'D003', 10);

      const res = await env.service.computeDeptEstimate(YM, {
        startDate: WORKDAY,
        endDate: WORKDAY,
        actor: director,
      });
      const day = findDay(res, WORKDAY);
      expect(day.deptCells[0].cases).toBe(17); // round(16.5)
      expect(day.deptCells[1].cases).toBe(17);
      expect(day.deptCells[2].cases).toBe(17);
      expect(day.orgTotal).toBe(50);
      expect(day.gap).toBe(1); // round(0.5)
    });

    it('TS-F049-GAP-006：org_total 不依賴比例（LIST-A 無比例仍計入）→ 75', async () => {
      await seedMay2026Calendar(env.calRepo);
      await seedList(env.listRepo, 'LIST-A', 1000); // 無比例
      await seedList(env.listRepo, 'LIST-B', 500);
      await seedDeptPct(env.deptPctRepo, 'LIST-B', 'D001', '北一', 40);
      await seedEmphire(env.emphireRepo, 'D001', 10);

      const res = await env.service.computeDeptEstimate(YM, {
        startDate: WORKDAY,
        endDate: WORKDAY,
        actor: director,
      });
      expect(findDay(res, WORKDAY).orgTotal).toBe(75); // (1000+500)×0.05
    });
  });

  // =====================================================================
  // 七、SCOPE — 範圍隔離層【SECURITY】
  // =====================================================================
  describe('SCOPE — 處長唯讀 scope 隔離（BR-12/13/14 / §17）', () => {
    async function seedThreeDepts() {
      await seedMay2026Calendar(env.calRepo);
      await seedList(env.listRepo, 'LIST-A', 1000);
      await seedDeptPct(env.deptPctRepo, 'LIST-A', 'XVE1', '北區電銷一課', 40);
      await seedDeptPct(env.deptPctRepo, 'LIST-A', 'XVE2', '北區電銷二課', 35);
      await seedDeptPct(env.deptPctRepo, 'LIST-A', 'XVE3', '中區電銷課', 25);
      await seedEmphire(env.emphireRepo, 'XVE1', 27);
      await seedEmphire(env.emphireRepo, 'XVE2', 28);
      await seedEmphire(env.emphireRepo, 'XVE3', 22);
    }

    it('TS-F049-SCOPE-001：處長 scope=XVE1 → response 只含 XVE1', async () => {
      await seedThreeDepts();
      vi.spyOn(env.scopeService, 'getScopeDeptCode').mockResolvedValue('XVE1');

      const res = await env.service.computeDeptEstimate(YM, {
        startDate: WORKDAY,
        endDate: WORKDAY,
        actor: sectionChief,
      });
      expect(res.scope.scoped).toBe(true);
      expect(res.scope.deptCode).toBe('XVE1');
      expect(res.departments).toHaveLength(1);
      expect(res.departments[0].deptCode).toBe('XVE1');
      const day = findDay(res, WORKDAY);
      expect(day.deptCells).toHaveLength(1);
      expect(day.deptCells[0].deptCode).toBe('XVE1');
    });

    it('TS-F049-SCOPE-002【SECURITY】：XVE2/XVE3 完全不存在於 response（含 headcount 28/22）', async () => {
      await seedThreeDepts();
      vi.spyOn(env.scopeService, 'getScopeDeptCode').mockResolvedValue('XVE1');

      const res = await env.service.computeDeptEstimate(YM, {
        startDate: WORKDAY,
        endDate: WORKDAY,
        actor: sectionChief,
      });
      const str = JSON.stringify(res);
      expect(str).not.toContain('XVE2');
      expect(str).not.toContain('XVE3');
      expect(str).not.toContain('28'); // XVE2 headcount
      expect(str).not.toContain('22'); // XVE3 headcount
      expect(res.departments.every((d) => d.deptCode === 'XVE1')).toBe(true);
      for (const day of res.days) {
        expect(day.deptCells.every((c) => c.deptCode === 'XVE1')).toBe(true);
      }
    });

    it('TS-F049-SCOPE-003：scope=null → 200 空結果 + SCOPE_UNRESOLVED（不 throw）', async () => {
      await seedThreeDepts();
      vi.spyOn(env.scopeService, 'getScopeDeptCode').mockResolvedValue(null);

      const res = await env.service.computeDeptEstimate(YM, {
        startDate: WORKDAY,
        endDate: WORKDAY,
        actor: sectionChief,
      });
      expect(res.departments).toEqual([]);
      for (const day of res.days) expect(day.deptCells).toEqual([]);
      expect(res.warnings.map((w) => w.code)).toContain('SCOPE_UNRESOLVED');
      expect(res.scope.scoped).toBe(true);
      expect(res.scope.deptCode).toBeNull();
    });

    it('TS-F049-SCOPE-004：部長 → 全部門可見、不套 scope', async () => {
      await seedThreeDepts();
      const res = await env.service.computeDeptEstimate(YM, {
        startDate: WORKDAY,
        endDate: WORKDAY,
        actor: director,
      });
      expect(res.scope.scoped).toBe(false);
      expect(res.departments).toHaveLength(3);
      expect(findDay(res, WORKDAY).deptCells).toHaveLength(3);
      const codes = res.departments.map((d) => d.deptCode).sort();
      expect(codes).toEqual(['XVE1', 'XVE2', 'XVE3']);
    });

    it('TS-F049-SCOPE-006：處長模式 orgTotal/deptAssignedTotal/gap=null；cases 仍為數字', async () => {
      await seedThreeDepts();
      vi.spyOn(env.scopeService, 'getScopeDeptCode').mockResolvedValue('XVE1');
      const res = await env.service.computeDeptEstimate(YM, {
        startDate: WORKDAY,
        endDate: WORKDAY,
        actor: sectionChief,
      });
      const day = findDay(res, WORKDAY);
      expect(day.orgTotal).toBeNull();
      expect(day.deptAssignedTotal).toBeNull();
      expect(day.gap).toBeNull();
      expect(typeof day.deptCells[0].cases).toBe('number');
    });
  });

  // =====================================================================
  // 八、FEAS — 可行性層
  // =====================================================================
  describe('FEAS — 人均可行性（BR-15/16 / §18）', () => {
    it('TS-F049-FEAS-001：per_person=round(cases÷headcount)=12；休息日 null', async () => {
      await seedMay2026Calendar(env.calRepo);
      // cases=120：list_total×ration×0.05=120 → 4800×0.5×0.05=120
      await seedList(env.listRepo, 'LIST-A', 4800);
      await seedDeptPct(env.deptPctRepo, 'LIST-A', 'D001', '北一', 50);
      await seedEmphire(env.emphireRepo, 'D001', 10);

      const res = await env.service.computeDeptEstimate(YM, {
        startDate: RESTDAY,
        endDate: WORKDAY,
        actor: director,
      });
      const day = findDay(res, WORKDAY);
      expect(day.deptCells[0].cases).toBe(120);
      expect(day.deptCells[0].perPerson).toBe(12);
      const rest = findDay(res, RESTDAY);
      expect(rest.deptCells).toEqual([]); // 休息日無部門列（人均不適用）
    });

    it('TS-F049-FEAS-002：headcount=0 → perPerson=null + DEPT_HEADCOUNT_ZERO；不 throw', async () => {
      await seedMay2026Calendar(env.calRepo);
      await seedList(env.listRepo, 'LIST-A', 1000);
      await seedDeptPct(env.deptPctRepo, 'LIST-A', 'D005', '數位組', 50);
      // D005 無在職員工

      const res = await env.service.computeDeptEstimate(YM, {
        startDate: WORKDAY,
        endDate: WORKDAY,
        actor: director,
      });
      const day = findDay(res, WORKDAY);
      expect(day.deptCells[0].cases).toBe(25); // 1000×0.5×0.05
      expect(day.deptCells[0].perPerson).toBeNull();
      expect(
        res.warnings.find(
          (w) => w.code === 'DEPT_HEADCOUNT_ZERO' && w.deptCode === 'D005',
        ),
      ).toBeDefined();
    });

    it('TS-F049-FEAS-003：per_person 超門檻 → overThreshold=true（20>15）', async () => {
      process.env.STAGE0_MAX_CASES_PER_PERSON_PER_DAY = '15';
      await seedMay2026Calendar(env.calRepo);
      // cases=200：8000×0.5×0.05=200；headcount=10 → perPerson=20
      await seedList(env.listRepo, 'LIST-A', 8000);
      await seedDeptPct(env.deptPctRepo, 'LIST-A', 'D002', '北二', 50);
      await seedEmphire(env.emphireRepo, 'D002', 10);

      const res = await env.service.computeDeptEstimate(YM, {
        startDate: WORKDAY,
        endDate: WORKDAY,
        actor: director,
      });
      expect(res.threshold).toBe(15);
      const cell = findDay(res, WORKDAY).deptCells[0];
      expect(cell.perPerson).toBe(20);
      expect(cell.overThreshold).toBe(true);
    });

    it('TS-F049-FEAS-004：threshold=null（env 未設）→ overThreshold=false；不 crash', async () => {
      await seedMay2026Calendar(env.calRepo);
      await seedList(env.listRepo, 'LIST-A', 8000);
      await seedDeptPct(env.deptPctRepo, 'LIST-A', 'D002', '北二', 50);
      await seedEmphire(env.emphireRepo, 'D002', 10);

      const res = await env.service.computeDeptEstimate(YM, {
        startDate: WORKDAY,
        endDate: WORKDAY,
        actor: director,
      });
      expect(res.threshold).toBeNull();
      for (const day of res.days) {
        for (const c of day.deptCells) expect(c.overThreshold).toBe(false);
      }
    });

    it('TS-F049-FEAS-005：headcount 查詢使用 TRIM(dept_code)（尾白相容）', async () => {
      await seedMay2026Calendar(env.calRepo);
      await seedList(env.listRepo, 'LIST-A', 1000);
      await seedDeptPct(env.deptPctRepo, 'LIST-A', 'XVE1', '北一', 50);
      await seedEmphire(env.emphireRepo, 'XVE1 ', 5); // 尾白 dept_code

      const res = await env.service.computeDeptEstimate(YM, {
        startDate: WORKDAY,
        endDate: WORKDAY,
        actor: director,
      });
      expect(res.departments[0].activeHeadcount).toBe(5);
      expect(findDay(res, WORKDAY).deptCells[0].perPerson).not.toBeNull();
    });

    it('TS-F049-FEAS-006：處長 scope 下 headcount 僅計轄區（不洩漏 XVE2）', async () => {
      await seedMay2026Calendar(env.calRepo);
      await seedList(env.listRepo, 'LIST-A', 1000);
      await seedDeptPct(env.deptPctRepo, 'LIST-A', 'XVE1', '北一', 40);
      await seedDeptPct(env.deptPctRepo, 'LIST-A', 'XVE2', '北二', 30);
      await seedEmphire(env.emphireRepo, 'XVE1', 10);
      await seedEmphire(env.emphireRepo, 'XVE2', 5);
      vi.spyOn(env.scopeService, 'getScopeDeptCode').mockResolvedValue('XVE1');

      const res = await env.service.computeDeptEstimate(YM, {
        startDate: WORKDAY,
        endDate: WORKDAY,
        actor: sectionChief,
      });
      expect(res.departments).toHaveLength(1);
      expect(res.departments[0].activeHeadcount).toBe(10);
      expect(JSON.stringify(res)).not.toContain('XVE2');
    });
  });

  // =====================================================================
  // 九、INVAR — 不變量
  // =====================================================================
  describe('INVAR — 估算 ≡ 月名單分派 不變量（I-RUN-EST-01）', () => {
    it('TS-F049-INVAR-001：days 工作日集合 ≡ computeWorkingDayRatios 輸出（不分叉 ratio 來源）', async () => {
      await seedMay2026Calendar(env.calRepo);
      await seedList(env.listRepo, 'LIST-A', 1000);
      await seedDeptPct(env.deptPctRepo, 'LIST-A', 'D001', '北一', 40);
      await seedEmphire(env.emphireRepo, 'D001', 10);

      const res = await env.service.computeDeptEstimate(YM, {
        calendarSource: 'weekday',
        actor: director,
      });

      // 獨立以同一純函式（唯一 ratio 來源）算出整月工作日，斷言 days 工作日集合完全一致
      const calRows = await env.calRepo.find();
      const ratios = computeWorkingDayRatios(
        calRows.map((r) => ({ calendar_date: r.calendar_date, rest_flg: r.rest_flg })),
        'weekday',
      );
      const expectedWorkdays = ratios.map((r) => r.casedt).sort();
      const actualWorkdays = res.days
        .filter((d) => d.isWorkday)
        .map((d) => d.date)
        .sort();
      expect(actualWorkdays).toEqual(expectedWorkdays);
      expect(expectedWorkdays).toHaveLength(20);
    });

    it('TS-F049-INVAR-002a：stage0_estimate_count 物化 → 不觸發 fallback', async () => {
      await seedMay2026Calendar(env.calRepo);
      await seedList(env.listRepo, 'LIST-A', 8500);
      await seedDeptPct(env.deptPctRepo, 'LIST-A', 'D001', '北一', 100);
      await seedEmphire(env.emphireRepo, 'D001', 10);
      const fallback = vi.spyOn(env.service, 'estimateListCount');

      const res = await env.service.computeDeptEstimate(YM, {
        startDate: WORKDAY,
        endDate: WORKDAY,
        actor: director,
      });
      expect(fallback).not.toHaveBeenCalled();
      // org_total = 8500 × 0.05 = 425
      expect(findDay(res, WORKDAY).orgTotal).toBe(425);
    });

    it('TS-F049-INVAR-002b：stage0_estimate_count NULL → fallback estimateListCount', async () => {
      await seedMay2026Calendar(env.calRepo);
      await seedList(env.listRepo, 'LIST-A', null);
      await seedDeptPct(env.deptPctRepo, 'LIST-A', 'D001', '北一', 100);
      await seedEmphire(env.emphireRepo, 'D001', 10);
      const fallback = vi
        .spyOn(env.service, 'estimateListCount')
        .mockResolvedValue({ listNo: 'LIST-A', count: 7000 });

      const res = await env.service.computeDeptEstimate(YM, {
        startDate: WORKDAY,
        endDate: WORKDAY,
        actor: director,
      });
      expect(fallback).toHaveBeenCalled();
      // org_total = 7000 × 0.05 = 350
      expect(findDay(res, WORKDAY).orgTotal).toBe(350);
    });
  });

  // =====================================================================
  // 十、EDGE — 邊緣案例
  // =====================================================================
  describe('EDGE — 邊緣案例（§22.2）', () => {
    it('TS-F049-EDGE-001：某名單 fallback 逾時 → STAGE0_LIST_ESTIMATE_PARTIAL；其他正常', async () => {
      process.env.STAGE0_DEPT_ESTIMATE_TIMEOUT_MS = '50';
      await seedMay2026Calendar(env.calRepo);
      await seedList(env.listRepo, 'LIST-A', 1000);
      await seedList(env.listRepo, 'LIST-B', null); // fallback → timeout
      await seedList(env.listRepo, 'LIST-C', 500);
      for (const l of ['LIST-A', 'LIST-B', 'LIST-C']) {
        await seedDeptPct(env.deptPctRepo, l, 'D001', '北一', 100);
      }
      await seedEmphire(env.emphireRepo, 'D001', 10);
      vi.spyOn(env.service, 'estimateListCount').mockImplementation(
        (listNo: string) =>
          new Promise((resolve) =>
            setTimeout(() => resolve({ listNo, count: 999 }), 500),
          ),
      );

      const res = await env.service.computeDeptEstimate(YM, {
        startDate: WORKDAY,
        endDate: WORKDAY,
        actor: director,
      });
      expect(
        res.warnings.find(
          (w) => w.code === 'STAGE0_LIST_ESTIMATE_PARTIAL' && w.listNo === 'LIST-B',
        ),
      ).toBeDefined();
      // org_total = (1000 + 500) × 0.05 = 75（LIST-B 排除）
      expect(findDay(res, WORKDAY).orgTotal).toBe(75);
    });

    it('TS-F049-EDGE-002：0 active 名單 → departments=[]、deptCells=[]、無 warnings', async () => {
      await seedMay2026Calendar(env.calRepo);
      const res = await env.service.computeDeptEstimate(YM, { actor: director });
      expect(res.departments).toEqual([]);
      for (const day of res.days) expect(day.deptCells).toEqual([]);
      expect(res.mode).toBe('aggregated');
      const codes = res.warnings.map((w) => w.code);
      expect(codes).not.toContain('DEPT_HEADCOUNT_ZERO');
      expect(codes).not.toContain('SCOPE_UNRESOLVED');
    });

    it('TS-F049-EDGE-003：處長轄區於該名單無比例 → deptCells=[]、orgTotal=null、無 SCOPE_UNRESOLVED', async () => {
      await seedMay2026Calendar(env.calRepo);
      await seedList(env.listRepo, 'LIST-A', 1000);
      await seedDeptPct(env.deptPctRepo, 'LIST-A', 'XVE2', '北二', 50);
      await seedEmphire(env.emphireRepo, 'XVE1', 10);
      await seedEmphire(env.emphireRepo, 'XVE2', 10);
      vi.spyOn(env.scopeService, 'getScopeDeptCode').mockResolvedValue('XVE1');

      const res = await env.service.computeDeptEstimate(YM, {
        startDate: WORKDAY,
        endDate: WORKDAY,
        actor: sectionChief,
      });
      expect(findDay(res, WORKDAY).deptCells).toEqual([]);
      expect(findDay(res, WORKDAY).orgTotal).toBeNull();
      expect(res.warnings.map((w) => w.code)).not.toContain('SCOPE_UNRESOLVED');
      expect(JSON.stringify(res)).not.toContain('XVE2');
    });
  });
});
