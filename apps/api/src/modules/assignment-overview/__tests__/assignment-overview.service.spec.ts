import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { Test } from '@nestjs/testing';
import { AssignmentOverviewService } from '../assignment-overview.service';
import { AssignmentListService } from '@/modules/assignment-list/assignment-list.service';
import { Stage0EstimateService } from '@/modules/assignment-list/stage0-estimate.service';
import { MonthlyRunReadinessService } from '@/modules/assignment/services/monthly-run-readiness.service';
import { AssignmentRunService } from '@/modules/assignment/services/assignment-run.service';
import { AssignmentRunReportService } from '@/modules/assignment/services/assignment-run-report.service';
import { SystemService } from '@/modules/system/system.service';
import { AssignmentModule } from '@/modules/assignment/assignment.module';

/**
 * F111-test.md 一、後端測試場景 — assignment-overview.service.spec.ts
 * 群組：SVC-COMPOSE / ISO / EMPTY / DEDUP / HAL / SCOPE / UNSCOPED / RISK / RECENT / STATIC。
 *
 * AD §10 測試邊界：AssignmentOverviewService 零 SQL / 零 Repository 注入 → 全數純 mock，無 DB。
 */

// ---- Actor fixtures ----
const directorActor = { userId: 'u-d', role: 'user', businessRole: 'director' };
const sectionChiefActor = {
  userId: 'u-sc',
  role: 'user',
  businessRole: 'section_chief',
};
const adminActor = { userId: 'u-a', role: 'admin', businessRole: null };

// ---- fixture factories ----
function makeListLists(overrides: Partial<{ lists: any[]; stageCounts: any }> = {}) {
  const lists = overrides.lists ?? [
    { listNo: 'OB202608005', listNm: '個貸名單', status: 'active', stage: 'personnel_ratio' },
    { listNo: 'OB202608009', listNm: '車貸名單', status: 'active', stage: 'draft' },
    { listNo: 'OB202608001', listNm: '已就緒A', status: 'active', stage: 'ready' },
    { listNo: 'OB202608002', listNm: '停用名單', status: 'inactive', stage: 'ready' },
  ];
  return {
    selectedYm: '202608',
    isHistorical: false,
    isFuture: false,
    lockState: { locked: false, reason: null },
    lists,
    stageCounts:
      overrides.stageCounts ?? {
        draft: 1,
        dept_ratio: 0,
        personnel_ratio: 1,
        approval: 0,
        ready: 1,
        disabled: 1,
      },
  };
}

function makeReadiness(overrides: Record<string, any> = {}) {
  return {
    workYm: '202608',
    totalActiveLists: 10,
    readyCount: 8,
    allReady: false,
    notReadyLists: [{ listNo: 'OB202608005', listNm: '個貸名單', stage: 'personnel_ratio' }],
    monthlyRunStatus: 'pending',
    scoringActive: true,
    etlStatus: {
      pooldata: { status: 'completed', lastRunAt: '2026-08-01T02:10:00Z', rowCount: 3631548 },
      emphire: { status: 'completed', lastRunAt: '2026-08-01T02:12:00Z', rowCount: 1180 },
      calendar: { status: 'completed', lastRunAt: '2026-08-01T02:13:00Z', rowCount: 366 },
      arreturndf: { status: 'completed', lastRunAt: '2026-08-01T02:15:00Z', rowCount: 55863 },
    },
    sourcesAllHaveData: true,
    emptySourceTables: [],
    ...overrides,
  };
}

function makeEstimate(
  ym: string,
  opts: {
    departments?: Array<{ deptCode: string; deptName: string; activeHeadcount: number }>;
    days?: any[];
    scope?: { role: string; deptCode: string | null; scoped: boolean };
  } = {},
) {
  const departments =
    opts.departments ?? [{ deptCode: 'XVE1', deptName: '北區電銷1', activeHeadcount: 27 }];
  const days =
    opts.days ?? [
      {
        date: '2026-08-03',
        weekday: '一',
        isWorkday: true,
        orgTotal: 480,
        deptAssignedTotal: 480,
        gap: 0,
        deptCells: [{ deptCode: 'XVE1', cases: 480, perPerson: 18, overThreshold: true }],
      },
      {
        date: '2026-08-09',
        weekday: '日',
        isWorkday: false,
        orgTotal: 0,
        deptAssignedTotal: 0,
        gap: 0,
        deptCells: [],
      },
    ];
  return {
    ym,
    mode: 'aggregated',
    listNo: null,
    calendarSource: 'weekday',
    startDate: `${ym.slice(0, 4)}-${ym.slice(4, 6)}-01`,
    endDate: `${ym.slice(0, 4)}-${ym.slice(4, 6)}-28`,
    scope: opts.scope ?? { role: 'director', deptCode: null, scoped: false },
    departments,
    days,
    threshold: 15,
    warnings: [],
    poolCount: 50000,
    poolWarning: null,
  };
}

function makeRun(overrides: Record<string, any> = {}) {
  return {
    runId: 'run-1',
    projectWorkym: '202608',
    status: 'completed',
    triggeredBy: 'u-d',
    triggeredAt: new Date('2026-08-02T08:00:00Z'),
    startedAt: new Date('2026-08-02T08:01:00Z'),
    finishedAt: new Date('2026-08-02T09:00:00Z'),
    totalCases: 55863,
    totalLists: 10,
    errorMessage: null,
    ...overrides,
  };
}

function makeSummary(overrides: Record<string, any> = {}) {
  return {
    runId: 'run-1',
    projectWorkym: '202608',
    finishedAt: new Date('2026-08-02T09:00:00Z'),
    durationMs: 9600,
    totalCases: 55863,
    stage1Count: 57000,
    stage4Count: 55863,
    coverageRate: 0.98,
    emplCount: 91,
    deptSummary: [
      {
        deptId: 'XVE1',
        deptName: '北區電銷1',
        configRatio: 32.5,
        actualCount: 18200,
        actualRatio: 32.6,
        deviation: 0.1,
        alert: false,
      },
    ],
    levelDistribution: [{ cardLevel: 'A', count: 6271, ratio: 11.2 }],
    tierDistribution: [{ tierLevel: 'T1', count: 1748, ratio: 3.1 }],
    warnings: { summaryCode: null, skippedCases: null },
    ...overrides,
  };
}

describe('AssignmentOverviewService', () => {
  let service: AssignmentOverviewService;
  let listMock: { listLists: ReturnType<typeof vi.fn> };
  let readinessMock: { calculateReadiness: ReturnType<typeof vi.fn> };
  let stage0Mock: { computeDeptEstimate: ReturnType<typeof vi.fn> };
  let runMock: { listRuns: ReturnType<typeof vi.fn> };
  let reportMock: { getSummary: ReturnType<typeof vi.fn> };
  let systemMock: {
    getCurrentWorkYm: ReturnType<typeof vi.fn>;
    getDefaultTargetWorkYm: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    listMock = { listLists: vi.fn().mockResolvedValue(makeListLists()) };
    readinessMock = { calculateReadiness: vi.fn().mockResolvedValue(makeReadiness()) };
    stage0Mock = {
      computeDeptEstimate: vi.fn().mockImplementation((ym: string) => Promise.resolve(makeEstimate(ym))),
    };
    runMock = { listRuns: vi.fn().mockResolvedValue([makeRun()]) };
    reportMock = { getSummary: vi.fn().mockResolvedValue(makeSummary()) };
    systemMock = {
      getCurrentWorkYm: vi.fn().mockReturnValue('202607'),
      getDefaultTargetWorkYm: vi.fn().mockReturnValue('202608'),
    };
    service = new AssignmentOverviewService(
      listMock as unknown as AssignmentListService,
      readinessMock as unknown as MonthlyRunReadinessService,
      stage0Mock as unknown as Stage0EstimateService,
      runMock as unknown as AssignmentRunService,
      reportMock as unknown as AssignmentRunReportService,
      systemMock as unknown as SystemService,
    );
  });

  // ---- B. SVC-COMPOSE ----
  describe('SVC-COMPOSE — 組合成功路徑', () => {
    it('SVC-001：部長視角 5 服務全成功 → 四區塊 error:false + 頂層欄位正確', async () => {
      const res = await service.getOverview('202608', directorActor);
      expect(res.selectedYm).toBe('202608');
      expect(res.currentWorkYm).toBe('202607');
      expect(res.targetWorkYm).toBe('202608');
      expect(res.scope).toEqual({ role: 'director', deptCode: null, scoped: false });
      expect(res.stageTodo.error).toBe(false);
      expect(res.runReadiness.error).toBe(false);
      expect(res.dialingVolume.error).toBe(false);
      expect(res.recentRun.error).toBe(false);
      // 區塊一組裝
      const stageTodo = res.stageTodo as any;
      expect(stageTodo.hasAnyList).toBe(true);
      expect(stageTodo.notReadyCount).toBe(2); // personnel_ratio + draft（active 且非 ready）
      expect(stageTodo.notReadyLists.map((l: any) => l.stage).sort()).toEqual(['draft', 'personnel_ratio']);
      // 區塊四組裝
      const recentRun = res.recentRun as any;
      expect(recentRun.hasCompletedRun).toBe(true);
      expect(recentRun.runId).toBe('run-1');
    });

    it('SVC-002：admin 視角 → scope=admin/unscoped，結構與 director 同構', async () => {
      const res = await service.getOverview('202608', adminActor);
      expect(res.scope).toEqual({ role: 'admin', deptCode: null, scoped: false });
      expect(res.stageTodo.error).toBe(false);
      expect(res.runReadiness.error).toBe(false);
      expect(res.dialingVolume.error).toBe(false);
      expect(res.recentRun.error).toBe(false);
      expect((res.runReadiness as any).canNavigateToTrigger).toBe(true);
    });
  });

  // ---- C. ISO — 區塊獨立失敗 ----
  describe('ISO — 區塊獨立失敗（HTTP 恆 200 語意）', () => {
    it('ISO-001：listLists 拋例外 → 僅 stageTodo.error=true，其餘 3 區塊正常', async () => {
      listMock.listLists.mockRejectedValue(new Error('db down'));
      const res = await service.getOverview('202608', directorActor);
      expect(res.stageTodo).toMatchObject({ error: true, errorCode: 'STAGE_TODO_UNAVAILABLE' });
      expect(res.runReadiness.error).toBe(false);
      expect(res.dialingVolume.error).toBe(false);
      expect(res.recentRun.error).toBe(false);
    });

    it('ISO-002：calculateReadiness 拋例外 → 僅 runReadiness.error=true', async () => {
      readinessMock.calculateReadiness.mockRejectedValue(new Error('boom'));
      const res = await service.getOverview('202608', directorActor);
      expect(res.runReadiness).toMatchObject({ error: true, errorCode: 'RUN_READINESS_UNAVAILABLE' });
      expect(res.stageTodo.error).toBe(false);
      expect(res.dialingVolume.error).toBe(false);
      expect(res.recentRun.error).toBe(false);
    });

    it('ISO-003：任一次 computeDeptEstimate 拋例外 → 僅 dialingVolume.error=true（TC-177-12）', async () => {
      stage0Mock.computeDeptEstimate.mockRejectedValue(new Error('estimate fail'));
      const res = await service.getOverview('202608', directorActor);
      expect(res.dialingVolume).toMatchObject({ error: true, errorCode: 'DIALING_VOLUME_UNAVAILABLE' });
      expect(res.stageTodo.error).toBe(false);
      expect(res.runReadiness.error).toBe(false);
      expect(res.recentRun.error).toBe(false);
    });

    it('ISO-004：listRuns 拋例外 → 僅 recentRun.error=true', async () => {
      runMock.listRuns.mockRejectedValue(new Error('boom'));
      const res = await service.getOverview('202608', directorActor);
      expect(res.recentRun).toMatchObject({ error: true, errorCode: 'RECENT_RUN_UNAVAILABLE' });
      expect(res.stageTodo.error).toBe(false);
      expect(res.runReadiness.error).toBe(false);
      expect(res.dialingVolume.error).toBe(false);
    });

    it('ISO-005：listRuns 成功但 getSummary 拋例外 → 同歸 recentRun.error=true（整塊 granularity）', async () => {
      runMock.listRuns.mockResolvedValue([makeRun()]);
      reportMock.getSummary.mockRejectedValue(new Error('summary fail'));
      const res = await service.getOverview('202608', directorActor);
      expect(res.recentRun).toMatchObject({ error: true, errorCode: 'RECENT_RUN_UNAVAILABLE' });
      expect(res.stageTodo.error).toBe(false);
    });

    it('ISO-006：多區塊同時失敗 → 各自獨立標記，未失敗區塊不受影響', async () => {
      listMock.listLists.mockRejectedValue(new Error('a'));
      stage0Mock.computeDeptEstimate.mockRejectedValue(new Error('b'));
      const res = await service.getOverview('202608', directorActor);
      expect(res.stageTodo).toMatchObject({ error: true, errorCode: 'STAGE_TODO_UNAVAILABLE' });
      expect(res.dialingVolume).toMatchObject({ error: true, errorCode: 'DIALING_VOLUME_UNAVAILABLE' });
      expect(res.runReadiness.error).toBe(false);
      expect(res.recentRun.error).toBe(false);
    });

    it('ISO-007：四區塊全失敗 → 四區塊各自正確 errorCode；頂層欄位仍正確', async () => {
      listMock.listLists.mockRejectedValue(new Error('a'));
      readinessMock.calculateReadiness.mockRejectedValue(new Error('b'));
      stage0Mock.computeDeptEstimate.mockRejectedValue(new Error('c'));
      runMock.listRuns.mockRejectedValue(new Error('d'));
      const res = await service.getOverview('202608', directorActor);
      expect((res.stageTodo as any).errorCode).toBe('STAGE_TODO_UNAVAILABLE');
      expect((res.runReadiness as any).errorCode).toBe('RUN_READINESS_UNAVAILABLE');
      expect((res.dialingVolume as any).errorCode).toBe('DIALING_VOLUME_UNAVAILABLE');
      expect((res.recentRun as any).errorCode).toBe('RECENT_RUN_UNAVAILABLE');
      expect(res.selectedYm).toBe('202608');
      expect(res.currentWorkYm).toBe('202607');
      expect(res.targetWorkYm).toBe('202608');
      expect(res.scope.role).toBe('director');
    });

    it('ISO-008：錯誤訊息為固定 zh-TW 文案，不外洩原始例外 message/stack', async () => {
      listMock.listLists.mockRejectedValue(new Error('ECONNREFUSED 5432 detail...'));
      const res = await service.getOverview('202608', directorActor);
      const msg = (res.stageTodo as any).message as string;
      expect(msg).toBe('本區塊資料暫時無法取得，請稍後重試。');
      expect(msg).not.toContain('ECONNREFUSED');
    });
  });

  // ---- D. EMPTY — empty ≠ zero ≠ error ----
  describe('EMPTY — empty ≠ zero ≠ error 三態', () => {
    it('EMPTY-001：某月 departments=[] → hasActiveLists=false，total=null（非 0）', async () => {
      stage0Mock.computeDeptEstimate.mockImplementation((ym: string) =>
        Promise.resolve(ym === '202607' ? makeEstimate(ym, { departments: [], days: [] }) : makeEstimate(ym)),
      );
      const res = await service.getOverview('202608', directorActor);
      const dv = res.dialingVolume as any;
      expect(dv.headline.currentMonth.hasActiveLists).toBe(false);
      expect(dv.headline.currentMonth.total).toBeNull();
    });

    it('EMPTY-002：departments.length>0 → hasActiveLists=true，total 為工作日案量真實加總', async () => {
      const res = await service.getOverview('202608', directorActor);
      const dv = res.dialingVolume as any;
      expect(dv.headline.nextMonth.hasActiveLists).toBe(true);
      expect(dv.headline.nextMonth.total).toBe(480); // 單一工作日 480，非工作日排除
    });

    it('EMPTY-003：hasActiveLists=false 為合法空值，dialingVolume.error 仍為 false', async () => {
      stage0Mock.computeDeptEstimate.mockImplementation((ym: string) =>
        Promise.resolve(makeEstimate(ym, { departments: [], days: [] })),
      );
      const res = await service.getOverview('202608', directorActor);
      expect(res.dialingVolume.error).toBe(false);
      expect((res.dialingVolume as any).headline.currentMonth.total).toBeNull();
    });

    it('EMPTY-004：listRuns 回空陣列 → noRun 空狀態', async () => {
      runMock.listRuns.mockResolvedValue([]);
      const res = await service.getOverview('202608', directorActor);
      expect(res.recentRun).toMatchObject({
        error: false,
        hasCompletedRun: false,
        emptyReason: 'noRun',
        latestRunStatus: null,
        latestRunId: null,
      });
    });

    it('EMPTY-005：listRuns 僅含 failed（無 completed）→ noCompletedRun + latestRunStatus=failed', async () => {
      runMock.listRuns.mockResolvedValue([
        makeRun({ runId: 'r1', status: 'failed', finishedAt: null }),
      ]);
      const res = await service.getOverview('202608', directorActor);
      expect(res.recentRun).toMatchObject({
        hasCompletedRun: false,
        emptyReason: 'noCompletedRun',
        latestRunStatus: 'failed',
        latestRunId: 'r1',
      });
    });

    it('EMPTY-006：listRuns 拋例外 → recentRun.error=true（不得誤判為 noCompletedRun 空狀態）', async () => {
      runMock.listRuns.mockRejectedValue(new Error('boom'));
      const res = await service.getOverview('202608', directorActor);
      expect(res.recentRun.error).toBe(true);
      expect((res.recentRun as any).emptyReason).toBeUndefined();
      expect((res.recentRun as any).hasCompletedRun).toBeUndefined();
    });

    it('EMPTY-007：兩種空狀態下 recentRun.error 恆為 false', async () => {
      runMock.listRuns.mockResolvedValue([]);
      const a = await service.getOverview('202608', directorActor);
      expect(a.recentRun.error).toBe(false);
      runMock.listRuns.mockResolvedValue([makeRun({ status: 'running', finishedAt: null })]);
      const b = await service.getOverview('202608', directorActor);
      expect(b.recentRun.error).toBe(false);
    });

    it('EMPTY-008：listLists lists=[] → 五階段皆 0、hasAnyList=false、notReadyLists=[]', async () => {
      listMock.listLists.mockResolvedValue(
        makeListLists({
          lists: [],
          stageCounts: { draft: 0, dept_ratio: 0, personnel_ratio: 0, approval: 0, ready: 0, disabled: 0 },
        }),
      );
      const res = await service.getOverview('202608', directorActor);
      expect(res.stageTodo).toMatchObject({
        error: false,
        hasAnyList: false,
        notReadyCount: 0,
      });
      expect((res.stageTodo as any).notReadyLists).toEqual([]);
    });

    it('EMPTY-009：名單皆 active+ready（hasAnyList=true 但 notReadyLists=[]）→ 不與 EMPTY-008 混淆', async () => {
      const readyLists = Array.from({ length: 8 }).map((_, i) => ({
        listNo: `OB20260800${i}`,
        listNm: `就緒${i}`,
        status: 'active',
        stage: 'ready',
      }));
      listMock.listLists.mockResolvedValue(
        makeListLists({
          lists: readyLists,
          stageCounts: { draft: 0, dept_ratio: 0, personnel_ratio: 0, approval: 0, ready: 8, disabled: 0 },
        }),
      );
      const res = await service.getOverview('202608', directorActor);
      const st = res.stageTodo as any;
      expect(st.hasAnyList).toBe(true);
      expect(st.notReadyLists).toEqual([]);
      expect(st.stageCounts.ready).toBe(8);
    });
  });

  // ---- E. DEDUP ----
  describe('DEDUP — computeDeptEstimate 去重（I-OVW-DEDUP-01）', () => {
    it('DEDUP-001：selectedYm===currentWorkYm → 恰呼叫 2 次', async () => {
      await service.getOverview('202607', directorActor); // current=202607, target=202608
      expect(stage0Mock.computeDeptEstimate).toHaveBeenCalledTimes(2);
    });

    it('DEDUP-002：selectedYm===targetWorkYm（對稱情境）→ 恰呼叫 2 次', async () => {
      await service.getOverview('202608', directorActor);
      expect(stage0Mock.computeDeptEstimate).toHaveBeenCalledTimes(2);
    });

    it('DEDUP-003：三月份皆相異 → 恰呼叫 3 次', async () => {
      await service.getOverview('202609', directorActor);
      expect(stage0Mock.computeDeptEstimate).toHaveBeenCalledTimes(3);
    });

    it('DEDUP-004：三次呼叫 ym 集合恰為 {202607,202608,202609}，無重複', async () => {
      await service.getOverview('202609', directorActor);
      const yms = stage0Mock.computeDeptEstimate.mock.calls.map((c) => c[0]).sort();
      expect(yms).toEqual(['202607', '202608', '202609']);
    });
  });

  // ---- F. HAL — hasActiveLists 邊界 ----
  describe('HAL — hasActiveLists 邊界（OQ-F111-01）', () => {
    it('HAL-001：有名單但比例未設定（departments=[]）→ hasActiveLists=false、total=null（刻意行為）', async () => {
      stage0Mock.computeDeptEstimate.mockImplementation((ym: string) =>
        Promise.resolve(makeEstimate(ym, { departments: [], days: [] })),
      );
      const res = await service.getOverview('202608', directorActor);
      const dv = res.dialingVolume as any;
      expect(dv.headline.currentMonth.hasActiveLists).toBe(false);
      expect(dv.headline.currentMonth.total).toBeNull();
      expect(dv.headline.nextMonth.total).toBeNull();
    });
  });

  // ---- G. SCOPE ----
  describe('SCOPE — 處長轄區透傳（I-OVW-SCOPE-PASSTHROUGH-01）', () => {
    beforeEach(() => {
      stage0Mock.computeDeptEstimate.mockImplementation((ym: string) =>
        Promise.resolve(
          makeEstimate(ym, {
            scope: { role: 'section_chief', deptCode: 'D003', scoped: true },
            departments: [{ deptCode: 'D003', deptName: '轄區部門', activeHeadcount: 20 }],
            days: [
              {
                date: '2026-08-03',
                weekday: '一',
                isWorkday: true,
                orgTotal: null,
                deptAssignedTotal: null,
                gap: null,
                deptCells: [{ deptCode: 'D003', cases: 300, perPerson: 15, overThreshold: false }],
              },
            ],
          }),
        ),
      );
    });

    it('SCOPE-001：處長 → 頂層 scope.deptCode 取自 computeDeptEstimate 回應（回填 D003）', async () => {
      const res = await service.getOverview('202608', sectionChiefActor);
      expect(res.scope).toEqual({ role: 'section_chief', deptCode: 'D003', scoped: true });
    });

    it('SCOPE-002：actor 原樣透傳給 listLists / computeDeptEstimate / getSummary（不重新實作過濾）', async () => {
      await service.getOverview('202608', sectionChiefActor);
      expect(listMock.listLists).toHaveBeenCalledWith(
        expect.objectContaining({ actor: sectionChiefActor }),
      );
      expect(stage0Mock.computeDeptEstimate).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ actor: sectionChiefActor }),
      );
      expect(reportMock.getSummary).toHaveBeenCalledWith(expect.any(String), sectionChiefActor);
    });

    it('SCOPE-003：處長 → canNavigateToTrigger=false', async () => {
      const res = await service.getOverview('202608', sectionChiefActor);
      expect((res.runReadiness as any).canNavigateToTrigger).toBe(false);
    });

    it('SCOPE-004：部長 → canNavigateToTrigger=true', async () => {
      stage0Mock.computeDeptEstimate.mockImplementation((ym: string) => Promise.resolve(makeEstimate(ym)));
      const res = await service.getOverview('202608', directorActor);
      expect((res.runReadiness as any).canNavigateToTrigger).toBe(true);
    });

    it('SCOPE-005：admin → canNavigateToTrigger=true', async () => {
      stage0Mock.computeDeptEstimate.mockImplementation((ym: string) => Promise.resolve(makeEstimate(ym)));
      const res = await service.getOverview('202608', adminActor);
      expect((res.runReadiness as any).canNavigateToTrigger).toBe(true);
    });
  });

  // ---- H. UNSCOPED — 區塊二維持全月視角 ----
  describe('UNSCOPED — calculateReadiness 不吃 actor（OQ-F111-03）', () => {
    it('UNSCOPED-001：處長視角 → calculateReadiness 僅以 (ym) 呼叫、無第二參數', async () => {
      await service.getOverview('202608', sectionChiefActor);
      expect(readinessMock.calculateReadiness).toHaveBeenCalledWith('202608');
      expect(readinessMock.calculateReadiness.mock.calls[0]).toHaveLength(1);
    });

    it('UNSCOPED-002：部長視角呼叫形狀相同（無角色分歧路徑）', async () => {
      await service.getOverview('202608', directorActor);
      expect(readinessMock.calculateReadiness).toHaveBeenCalledWith('202608');
      expect(readinessMock.calculateReadiness.mock.calls[0]).toHaveLength(1);
    });
  });

  // ---- I. RISK — 殘留議題邊界（AD §11.3）----
  describe('RISK — scope.deptCode 回填邊界', () => {
    it('RISK-001：處長 + 區塊三失敗 → scope.deptCode 退回 null，整體正常返回', async () => {
      stage0Mock.computeDeptEstimate.mockRejectedValue(new Error('estimate down'));
      const res = await service.getOverview('202608', sectionChiefActor);
      expect(res.scope).toEqual({ role: 'section_chief', deptCode: null, scoped: true });
      expect(res.dialingVolume.error).toBe(true);
      expect(res.stageTodo.error).toBe(false);
      expect(res.runReadiness.error).toBe(false);
      expect(res.recentRun.error).toBe(false);
    });

    it('RISK-002：處長 + 區塊三成功 → scope.deptCode 填入真實轄區代號 D003', async () => {
      stage0Mock.computeDeptEstimate.mockImplementation((ym: string) =>
        Promise.resolve(
          makeEstimate(ym, { scope: { role: 'section_chief', deptCode: 'D003', scoped: true } }),
        ),
      );
      const res = await service.getOverview('202608', sectionChiefActor);
      expect(res.scope.deptCode).toBe('D003');
    });
  });

  // ---- K. RECENT — 最近一次月跑選取（BR-5）----
  describe('RECENT — 最近一次月跑選取', () => {
    it('RECENT-001：多筆 completed → 取 finishedAt 最新者（非 created_at DESC 首筆）', async () => {
      runMock.listRuns.mockResolvedValue([
        makeRun({ runId: 'r-newest-created', finishedAt: new Date('2026-08-02T08:00:00Z') }),
        makeRun({ runId: 'r-latest-finished', finishedAt: new Date('2026-08-02T10:00:00Z') }),
        makeRun({ runId: 'r-mid', finishedAt: new Date('2026-08-02T09:00:00Z') }),
      ]);
      await service.getOverview('202608', directorActor);
      expect(reportMock.getSummary).toHaveBeenCalledWith('r-latest-finished', expect.anything());
    });

    it('RECENT-002：completed 之 finishedAt=null → 以 triggeredAt 作為比較基準', async () => {
      runMock.listRuns.mockResolvedValue([
        makeRun({ runId: 'rA', finishedAt: null, triggeredAt: new Date('2026-08-02T10:00:00Z') }),
        makeRun({ runId: 'rB', finishedAt: new Date('2026-08-01T09:00:00Z') }),
      ]);
      await service.getOverview('202608', directorActor);
      expect(reportMock.getSummary).toHaveBeenCalledWith('rA', expect.anything());
    });

    it('RECENT-003：非 completed（running）不參與選取，即使時間戳最新', async () => {
      runMock.listRuns.mockResolvedValue([
        makeRun({ runId: 'r-running', status: 'running', finishedAt: new Date('2026-08-03T00:00:00Z') }),
        makeRun({ runId: 'r-completed', finishedAt: new Date('2026-08-01T09:00:00Z') }),
      ]);
      await service.getOverview('202608', directorActor);
      expect(reportMock.getSummary).toHaveBeenCalledTimes(1);
      expect(reportMock.getSummary).toHaveBeenCalledWith('r-completed', expect.anything());
    });

    it('RECENT-004：noCompletedRun → latestRunStatus/latestRunId 取 listRuns()[0]（不重新排序）', async () => {
      runMock.listRuns.mockResolvedValue([
        makeRun({ runId: 'r-newest', status: 'running', finishedAt: null }),
        makeRun({ runId: 'r-older', status: 'failed', finishedAt: null }),
      ]);
      const res = await service.getOverview('202608', directorActor);
      expect(res.recentRun).toMatchObject({
        hasCompletedRun: false,
        emptyReason: 'noCompletedRun',
        latestRunStatus: 'running',
        latestRunId: 'r-newest',
      });
    });
  });

  // ---- L. STATIC — 架構不變式靜態守門 ----
  describe('STATIC — 架構不變式守門', () => {
    const serviceSrc = fs.readFileSync(
      path.resolve(__dirname, '../assignment-overview.service.ts'),
      'utf8',
    );

    it('STATIC-001：service 建構子未注入任何 Repository / DataSource（I-OVW-COMPOSE-ONLY-01）', () => {
      expect(serviceSrc).not.toContain('@InjectRepository');
      expect(serviceSrc).not.toContain('Repository<');
      expect(serviceSrc).not.toMatch(/\bDataSource\b/);
      // 僅注入 5 個既有 service + SystemService
      expect(serviceSrc).toContain('AssignmentListService');
      expect(serviceSrc).toContain('MonthlyRunReadinessService');
      expect(serviceSrc).toContain('Stage0EstimateService');
      expect(serviceSrc).toContain('AssignmentRunService');
      expect(serviceSrc).toContain('AssignmentRunReportService');
      expect(serviceSrc).toContain('SystemService');
    });

    it('STATIC-002a：AssignmentModule 已 export AssignmentRunService + AssignmentRunReportService（§3.2 wiring）', () => {
      const exports = (Reflect.getMetadata('exports', AssignmentModule) ?? []) as unknown[];
      expect(exports).toContain(AssignmentRunService);
      expect(exports).toContain(AssignmentRunReportService);
    });

    it('STATIC-002b：AssignmentOverviewService 可由 DI 完整解析（6 個注入 token）', async () => {
      const moduleRef = await Test.createTestingModule({
        providers: [
          AssignmentOverviewService,
          { provide: AssignmentListService, useValue: {} },
          { provide: MonthlyRunReadinessService, useValue: {} },
          { provide: Stage0EstimateService, useValue: {} },
          { provide: AssignmentRunService, useValue: {} },
          { provide: AssignmentRunReportService, useValue: {} },
          { provide: SystemService, useValue: {} },
        ],
      }).compile();
      expect(moduleRef.get(AssignmentOverviewService)).toBeDefined();
    });

    it('STATIC-004：service 原始碼不含任何寫入語意 method 呼叫 + 無自建 scope 過濾', () => {
      for (const pattern of [
        'createList(',
        'updateList(',
        'triggerRun(',
        '.save(',
        '.remove(',
        '.delete(',
        '.update(',
      ]) {
        expect(serviceSrc).not.toContain(pattern);
      }
      // I-OVW-SCOPE-PASSTHROUGH-01：不得自建 deptCode 比對 / EXISTS 過濾
      expect(serviceSrc).not.toContain('deptCode ===');
      expect(serviceSrc).not.toContain('EXISTS ob_dept_pct');
    });
  });
});
