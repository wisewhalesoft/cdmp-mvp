/**
 * F063 v1.1 / F064 v1.1 / F067 v1.1 — 處長轄區 scopeByCreator 過濾
 *
 * 對應 spec：
 *   - F063 v1.1 AC-5 + BR-6 + BR-7：section_chief 視角自動 filter；director / admin bypass
 *   - F064 v1.1（同 pattern，下載 CSV 也應 filter）
 *   - F067 v1.1（compare 對比也應 filter）
 *
 * TC：
 *   - TC-SCOPE-001：section_chief getSummary → 限縮 deptSummary 與 totalCases
 *   - TC-SCOPE-002：director getSummary → bypass（回全公司聚合）
 *   - TC-SCOPE-003：admin getSummary → bypass
 *   - TC-SCOPE-004：section_chief exportResult → CSV 僅含轄區資料
 *   - TC-SCOPE-005：director exportResult → bypass
 *   - TC-SCOPE-006：admin exportResult → bypass
 *   - TC-SCOPE-007：section_chief compareRuns → 兩邊都套 filter
 *   - TC-SCOPE-008：director compareRuns → bypass
 *   - TC-SCOPE-009：section_chief 無轄區 → 空集合（200 OK 非 403）
 *   - TC-SCOPE-010：section_chief getSnapshot type=result → 僅轄區 assignments
 *   - TC-SCOPE-011：section_chief getSnapshot type=input_list → 僅轄區 cases
 *   - TC-SCOPE-012：admin getSnapshot full → bypass（三份完整）
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AssignmentRunReportService } from '../assignment-run-report.service';
import { AssignmentRunSnapshotService } from '../assignment-run-snapshot.service';
import { SectionChiefScopeService } from '../section-chief-scope.service';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { AssignmentRunSnapshot } from '@/database/entities/assignment-run-snapshot.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';
import { ObEmplSet } from '@/database/entities/ob-empl-set.entity';

const YM = '202605';
const SC_USER = 'sc-001';
const OTHER_USER = 'other-01';

const ACTOR_SECTION_CHIEF = {
  userId: SC_USER,
  role: 'user',
  businessRole: 'section_chief',
};
const ACTOR_DIRECTOR = {
  userId: 'dir-001',
  role: 'user',
  businessRole: 'director',
};
const ACTOR_ADMIN = {
  userId: 'admin-01',
  role: 'admin',
  businessRole: null,
};

interface Env {
  reportService: AssignmentRunReportService;
  snapshotService: AssignmentRunSnapshotService;
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
        entities: [AssignmentRun, AssignmentRunSnapshot, AssignmentAuditLog, ObEmplSet],
        synchronize: true,
      }),
      TypeOrmModule.forFeature([
        AssignmentRun,
        AssignmentRunSnapshot,
        AssignmentAuditLog,
        ObEmplSet,
      ]),
    ],
    providers: [AssignmentRunReportService, AssignmentRunSnapshotService, SectionChiefScopeService],
  }).compile();
  await app.init();
  return {
    reportService: app.get(AssignmentRunReportService),
    snapshotService: app.get(AssignmentRunSnapshotService),
    runRepo: app.get(getRepositoryToken(AssignmentRun)),
    snapRepo: app.get(getRepositoryToken(AssignmentRunSnapshot)),
    auditRepo: app.get(getRepositoryToken(AssignmentAuditLog)),
    emplSetRepo: app.get(getRepositoryToken(ObEmplSet)),
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
      finished_at: new Date('2026-05-15T12:30:00Z'),
      created_at: new Date('2026-05-15T12:00:00Z'),
    } as Partial<AssignmentRun>),
  );
}

async function seedSnap(
  repo: Repository<AssignmentRunSnapshot>,
  runId: string,
  type: 'config' | 'input_list' | 'result',
  payload: Record<string, unknown>,
): Promise<void> {
  await repo.save(
    repo.create({
      run_id: runId,
      snapshot_type: type,
      payload,
      created_at: new Date(),
    } as Partial<AssignmentRunSnapshot>),
  );
}

/**
 * 轄區設計：
 *   - section_chief SC_USER 擁有 L1 D01 之 ob_empl_set 紀錄（E1/E2 ration 50/50）
 *   - L1 D02 由 OTHER_USER 設定（E3/E4 ration 50/50）
 *   - 處長視角應只看到 D01 → emplid in {E1, E2} 之 assignments
 */
async function seedEmplSet(repo: Repository<ObEmplSet>): Promise<void> {
  const make = (
    deptCode: string,
    empId: string,
    createdBy: string,
  ): Partial<ObEmplSet> => ({
    list_no: 'L1',
    deptid_m: deptCode,
    emplid: empId,
    ration: '50' as unknown as string,
    prod_type: null,
    created_by_prog: 'TEST',
    created_by: createdBy,
    created_at: new Date(),
    updated_by_prog: 'TEST',
    updated_by: createdBy,
    updated_at: new Date(),
  });
  await repo.save([
    repo.create(make('D01', 'E1', SC_USER)),
    repo.create(make('D01', 'E2', SC_USER)),
    repo.create(make('D02', 'E3', OTHER_USER)),
    repo.create(make('D02', 'E4', OTHER_USER)),
  ]);
}

describe('AssignmentRunReportService + SnapshotService — scopeByCreator (F063/F064/F066/F067 v1.1)', () => {
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
    await seedEmplSet(env.emplSetRepo);
  });

  async function seedStandardRun(): Promise<AssignmentRun> {
    const run = await seedRun(env.runRepo);
    await seedSnap(env.snapRepo, run.run_id, 'config', {
      deptPct: [
        { listNo: 'L1', deptId: 'D01', ration: '50' },
        { listNo: 'L1', deptId: 'D02', ration: '50' },
      ],
    });
    await seedSnap(env.snapRepo, run.run_id, 'input_list', {
      cases: [
        { applNo: 'A1', emplid: 'E1' },
        { applNo: 'A2', emplid: 'E2' },
        { applNo: 'A3', emplid: 'E3' },
        { applNo: 'A4', emplid: 'E4' },
      ],
    });
    await seedSnap(env.snapRepo, run.run_id, 'result', {
      assignments: [
        { applNo: 'A1', deptId: 'D01', cardLevel: 'A', emplid: 'E1', listNo: 'L1' },
        { applNo: 'A2', deptId: 'D01', cardLevel: 'B', emplid: 'E2', listNo: 'L1' },
        { applNo: 'A3', deptId: 'D02', cardLevel: 'A', emplid: 'E3', listNo: 'L1' },
        { applNo: 'A4', deptId: 'D02', cardLevel: 'C', emplid: 'E4', listNo: 'L1' },
      ],
    });
    return run;
  }

  describe('getSummary scope', () => {
    it('TC-SCOPE-001：section_chief 只看自己轄區 D01', async () => {
      const run = await seedStandardRun();
      const s = await env.reportService.getSummary(run.run_id, ACTOR_SECTION_CHIEF);
      // 處長僅看 D01（2 筆），不應出現 D02
      expect(s.deptSummary.map((x) => x.deptId)).toEqual(['D01']);
      expect(s.stage4Count).toBe(2);
      expect(s.totalCases).toBe(2);
    });

    it('TC-SCOPE-002：director bypass 看全公司', async () => {
      const run = await seedStandardRun();
      const s = await env.reportService.getSummary(run.run_id, ACTOR_DIRECTOR);
      expect(s.deptSummary.map((x) => x.deptId).sort()).toEqual(['D01', 'D02']);
      expect(s.stage4Count).toBe(4);
    });

    it('TC-SCOPE-003：admin bypass 看全公司', async () => {
      const run = await seedStandardRun();
      const s = await env.reportService.getSummary(run.run_id, ACTOR_ADMIN);
      expect(s.deptSummary.map((x) => x.deptId).sort()).toEqual(['D01', 'D02']);
      expect(s.stage4Count).toBe(4);
    });

    it('TC-SCOPE-009：section_chief 無轄區 → 空集合（200 OK 非 403）', async () => {
      const run = await seedStandardRun();
      const s = await env.reportService.getSummary(run.run_id, {
        userId: 'nobody-1',
        role: 'user',
        businessRole: 'section_chief',
      });
      expect(s.deptSummary).toEqual([]);
      expect(s.stage4Count).toBe(0);
      expect(s.totalCases).toBe(0);
    });
  });

  describe('exportResult scope', () => {
    it('TC-SCOPE-004：section_chief CSV 僅含 D01 兩筆', async () => {
      const run = await seedStandardRun();
      const out = await env.reportService.exportResult(
        run.run_id,
        'csv',
        SC_USER,
        ACTOR_SECTION_CHIEF,
      );
      const lines = out.body.split('\n').filter(Boolean);
      // header + 2 rows
      expect(lines.length).toBe(3);
      expect(out.rowCount).toBe(2);
      expect(out.body).toContain('E1');
      expect(out.body).toContain('E2');
      expect(out.body).not.toContain('E3');
      expect(out.body).not.toContain('E4');
    });

    it('TC-SCOPE-005：director CSV 含全部 4 筆', async () => {
      const run = await seedStandardRun();
      const out = await env.reportService.exportResult(
        run.run_id,
        'csv',
        ACTOR_DIRECTOR.userId,
        ACTOR_DIRECTOR,
      );
      expect(out.rowCount).toBe(4);
    });

    it('TC-SCOPE-006：admin CSV 含全部 4 筆', async () => {
      const run = await seedStandardRun();
      const out = await env.reportService.exportResult(
        run.run_id,
        'csv',
        ACTOR_ADMIN.userId,
        ACTOR_ADMIN,
      );
      expect(out.rowCount).toBe(4);
    });
  });

  describe('compareRuns scope', () => {
    async function seedComparePair(): Promise<{ runA: AssignmentRun; runB: AssignmentRun }> {
      const runA = await seedStandardRun();
      const runB = await env.runRepo.save(
        env.runRepo.create({
          project_workym: '202604',
          status: 'completed',
          triggered_by: '00000000-0000-0000-0000-000000000001',
          total_cases: 100,
          duration_ms: 1800000,
          finished_at: new Date('2026-04-15T12:30:00Z'),
          created_at: new Date('2026-04-15T12:00:00Z'),
        } as Partial<AssignmentRun>),
      );
      await seedSnap(env.snapRepo, runB.run_id, 'config', { deptPct: [] });
      await seedSnap(env.snapRepo, runB.run_id, 'input_list', { cases: [] });
      await seedSnap(env.snapRepo, runB.run_id, 'result', {
        // base: A1->E1, A2->E2, A3->E3, A4->E4
        // cmp:  A1->E1 (same), A2->E1 (改派；E1/E2 都在 SC 轄區), A3->E3
        // 對 SC 視角：base 留 A1(E1)/A2(E2)；cmp 留 A1(E1)/A2(E1)
        //   → common = {A1, A2}, A2 不一致 → mismatch=1 / total=2
        assignments: [
          { applNo: 'A1', deptId: 'D01', cardLevel: 'A', emplid: 'E1', listNo: 'L1' },
          { applNo: 'A2', deptId: 'D01', cardLevel: 'A', emplid: 'E1', listNo: 'L1' },
          { applNo: 'A3', deptId: 'D02', cardLevel: 'A', emplid: 'E3', listNo: 'L1' },
        ],
      });
      return { runA, runB };
    }

    it('TC-SCOPE-007：section_chief compare 兩邊都套 filter', async () => {
      const { runA, runB } = await seedComparePair();
      const c = await env.reportService.compareRuns(
        runA.run_id,
        runB.run_id,
        ACTOR_SECTION_CHIEF,
      );
      // common applNo 限縮 A1/A2（base D01 含 A1/A2；compare D01 含 A1/A2），A2 不一致
      expect(c.personnelMismatch.totalCount).toBe(2);
      expect(c.personnelMismatch.mismatchCount).toBe(1);
      // base 含 D01 2 筆；compare 含 D01 2 筆
      expect(c.base.totalCases).toBe(2);
      expect(c.compare.totalCases).toBe(2);
    });

    it('TC-SCOPE-008：director compare bypass（totalCases 用 run.total_cases 原值）', async () => {
      const { runA, runB } = await seedComparePair();
      const c = await env.reportService.compareRuns(
        runA.run_id,
        runB.run_id,
        ACTOR_DIRECTOR,
      );
      // director bypass：base/compare totalCases 沿用 run.total_cases (seed = 100)
      expect(c.base.totalCases).toBe(100);
      expect(c.compare.totalCases).toBe(100);
      // 全公司 personnel mismatch：base 4 筆 vs cmp 3 筆，common={A1,A2,A3}，A2 改派(E2→E1) 不一致
      expect(c.personnelMismatch.totalCount).toBe(3);
      expect(c.personnelMismatch.mismatchCount).toBe(1);
    });
  });

  describe('SnapshotService scope', () => {
    it('TC-SCOPE-010：section_chief getSnapshot type=result 僅轄區', async () => {
      const run = await seedStandardRun();
      const out = await env.snapshotService.getSnapshotByType(
        run.run_id,
        'result',
        ACTOR_SECTION_CHIEF,
      );
      const assigns = (out.payload as any).assignments as Array<{ emplid: string }>;
      expect(assigns.map((a) => a.emplid).sort()).toEqual(['E1', 'E2']);
    });

    it('TC-SCOPE-011：section_chief getSnapshot type=input_list 僅轄區', async () => {
      const run = await seedStandardRun();
      const out = await env.snapshotService.getSnapshotByType(
        run.run_id,
        'input_list',
        ACTOR_SECTION_CHIEF,
      );
      const cases = (out.payload as any).cases as Array<{ emplid: string }>;
      expect(cases.map((a) => a.emplid).sort()).toEqual(['E1', 'E2']);
    });

    it('TC-SCOPE-012：admin getFullSnapshot bypass（三份完整）', async () => {
      const run = await seedStandardRun();
      const out = await env.snapshotService.getFullSnapshot(run.run_id, ACTOR_ADMIN);
      expect((out.snapshots.result as any).assignments.length).toBe(4);
      expect((out.snapshots.inputList as any).cases.length).toBe(4);
    });
  });
});
