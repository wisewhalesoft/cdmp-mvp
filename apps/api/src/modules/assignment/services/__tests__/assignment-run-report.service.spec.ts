/**
 * AssignmentRunReportService — F063 摘要 / F064 匯出 / F067 比對
 *
 * 對應 spec 場景：
 *   - TC-M05-SUMMARY-001：getSummary 正常輸出（總量 / coverage / 部門偏差 / 等級分佈）
 *   - TC-M05-SUMMARY-002：未完成 run → 422 ASSIGNMENT_RUN_NOT_COMPLETED
 *   - TC-M05-SUMMARY-003：部門偏差 > 3% → alert=true
 *   - TC-M05-SUMMARY-004：warnings 段含 skipped_cases + warning_summary
 *   - TC-M05-EXPORT-001：exportResult format=csv → header + rows
 *   - TC-M05-EXPORT-002：xlsx → 422 EXPORT_FORMAT_NOT_SUPPORTED
 *   - TC-M05-EXPORT-003：csv 寫入 audit log（action=EXPORT）
 *   - TC-M05-EXPORT-004：未完成 run → 422
 *   - TC-M05-EXPORT-005：CSV 內容含特殊字元（逗號 / 引號）正確 escape
 *   - TC-M05-COMPARE-001：compareRuns 正常輸出（summary / configDiff / personnelMismatch / customerDiff）
 *   - TC-M05-COMPARE-002：任一 run 非 completed → 422 ASSIGNMENT_RUN_NOT_COMPARABLE
 *   - TC-M05-COMPARE-003：人員配對不一致率（NFR-005）alert > 3% → true
 *   - TC-M05-COMPARE-004：人員配對 0 共同案件 → rate=0, alert=false（不發生除零）
 *   - TC-M05-COMPARE-005：customerDiff added/removed 集合運算正確
 *   - TC-M05-COMPARE-006：configDiff card_version 與 dept_pct ration 變更偵測
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AssignmentRunReportService } from '../assignment-run-report.service';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { AssignmentRunSnapshot } from '@/database/entities/assignment-run-snapshot.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';
import { ERROR_CODES } from '@/common/errors/error-codes';

const YM = '202605';

interface Env {
  service: AssignmentRunReportService;
  runRepo: Repository<AssignmentRun>;
  snapRepo: Repository<AssignmentRunSnapshot>;
  auditRepo: Repository<AssignmentAuditLog>;
  app: TestingModule;
}

async function buildModule(): Promise<Env> {
  const app: TestingModule = await Test.createTestingModule({
    imports: [
      TypeOrmModule.forRoot({
        type: 'better-sqlite3',
        database: ':memory:',
        entities: [AssignmentRun, AssignmentRunSnapshot, AssignmentAuditLog],
        synchronize: true,
      }),
      TypeOrmModule.forFeature([
        AssignmentRun,
        AssignmentRunSnapshot,
        AssignmentAuditLog,
      ]),
    ],
    providers: [AssignmentRunReportService],
  }).compile();
  await app.init();
  return {
    service: app.get(AssignmentRunReportService),
    runRepo: app.get(getRepositoryToken(AssignmentRun)),
    snapRepo: app.get(getRepositoryToken(AssignmentRunSnapshot)),
    auditRepo: app.get(getRepositoryToken(AssignmentAuditLog)),
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
      finished_at: new Date('2026-05-15T12:30:00Z'),
      created_at: new Date('2026-05-15T12:00:00Z'),
      ...overrides,
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

describe('AssignmentRunReportService — F063 / F064 / F067', () => {
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
  });

  // -------------------------------------------------------------------------
  // F063 Summary
  // -------------------------------------------------------------------------

  describe('getSummary (F063)', () => {
    it('TC-M05-SUMMARY-001：正常輸出', async () => {
      const run = await seedRun(env.runRepo);
      await seedSnap(env.snapRepo, run.run_id, 'config', {
        deptPct: [
          { listNo: 'L1', deptId: 'D01', ration: '50' },
          { listNo: 'L1', deptId: 'D02', ration: '50' },
        ],
      });
      await seedSnap(env.snapRepo, run.run_id, 'input_list', {
        cases: new Array(10).fill({ applNo: 'A' }),
      });
      await seedSnap(env.snapRepo, run.run_id, 'result', {
        assignments: [
          { applNo: 'A1', deptId: 'D01', cardLevel: 'A', emplid: 'E1' },
          { applNo: 'A2', deptId: 'D01', cardLevel: 'A', emplid: 'E1' },
          { applNo: 'A3', deptId: 'D01', cardLevel: 'B', emplid: 'E1' },
          { applNo: 'A4', deptId: 'D02', cardLevel: 'B', emplid: 'E2' },
          { applNo: 'A5', deptId: 'D02', cardLevel: 'C', emplid: 'E2' },
        ],
      });

      const s = await env.service.getSummary(run.run_id);

      expect(s.runId).toBe(run.run_id);
      expect(s.stage1Count).toBe(10);
      expect(s.stage4Count).toBe(5);
      expect(s.coverageRate).toBe(0.5);

      const d01 = s.deptSummary.find((x) => x.deptId === 'D01');
      const d02 = s.deptSummary.find((x) => x.deptId === 'D02');
      expect(d01).toMatchObject({
        configRatio: 50,
        actualCount: 3,
        actualRatio: 60,
        deviation: 10,
        alert: true,
      });
      expect(d02).toMatchObject({
        configRatio: 50,
        actualCount: 2,
        actualRatio: 40,
        deviation: -10,
        alert: true,
      });

      const aLevel = s.levelDistribution.find((x) => x.cardLevel === 'A');
      expect(aLevel).toMatchObject({ count: 2, ratio: 40 });
    });

    it('TC-M05-SUMMARY-002：未完成 run → 422', async () => {
      const run = await seedRun(env.runRepo, { status: 'running' });
      await expect(env.service.getSummary(run.run_id)).rejects.toMatchObject({
        response: { error: ERROR_CODES.ASSIGNMENT_RUN_NOT_COMPLETED },
      });
    });

    it('TC-M05-SUMMARY-003：部門偏差恰 3% → alert=false（嚴格 >）', async () => {
      const run = await seedRun(env.runRepo);
      await seedSnap(env.snapRepo, run.run_id, 'config', {
        deptPct: [{ listNo: 'L1', deptId: 'D01', ration: '50' }],
      });
      await seedSnap(env.snapRepo, run.run_id, 'input_list', { cases: [] });
      await seedSnap(env.snapRepo, run.run_id, 'result', {
        assignments: [
          ...new Array(53).fill(0).map((_, i) => ({
            applNo: `A${i}`,
            deptId: 'D01',
            cardLevel: 'A',
          })),
          ...new Array(47).fill(0).map((_, i) => ({
            applNo: `B${i}`,
            deptId: 'D02',
            cardLevel: 'A',
          })),
        ],
      });
      const s = await env.service.getSummary(run.run_id);
      const d01 = s.deptSummary.find((x) => x.deptId === 'D01')!;
      expect(d01.deviation).toBe(3);
      expect(d01.alert).toBe(false); // 嚴格 > 3
    });

    it('TC-M05-SUMMARY-004：warnings 段含 skipped_cases', async () => {
      const run = await seedRun(env.runRepo, {
        warning_summary: 'BR-12_EDGE_CARD_TYPE_SKIPPED',
        skipped_cases: {
          cases: [{ cardType: 'X', applNoCount: 5, reason: 'edge' }],
        },
      });
      await seedSnap(env.snapRepo, run.run_id, 'config', { deptPct: [] });
      await seedSnap(env.snapRepo, run.run_id, 'input_list', { cases: [] });
      await seedSnap(env.snapRepo, run.run_id, 'result', { assignments: [] });

      const s = await env.service.getSummary(run.run_id);
      expect(s.warnings.summaryCode).toBe('BR-12_EDGE_CARD_TYPE_SKIPPED');
      expect(s.warnings.skippedCases).toEqual({
        cases: [{ cardType: 'X', applNoCount: 5, reason: 'edge' }],
      });
    });
  });

  // -------------------------------------------------------------------------
  // F064 Export
  // -------------------------------------------------------------------------

  describe('exportResult (F064)', () => {
    it('TC-M05-EXPORT-001：csv 含 header + rows + filename', async () => {
      const run = await seedRun(env.runRepo);
      await seedSnap(env.snapRepo, run.run_id, 'result', {
        assignments: [
          {
            listNo: 'L1',
            applNo: 'A1',
            cardLevel: 'A',
            tierLevel: 'T1',
            deptId: 'D01',
            emplid: 'E1',
            score: 90,
            isCr: 'N',
          },
        ],
      });
      const out = await env.service.exportResult(
        run.run_id,
        'csv',
        'actor-1',
      );
      const lines = out.body.split('\n');
      expect(lines[0]).toBe(
        'list_no,appl_no,card_level,tier_level,dept_id,emplid,score,is_cr',
      );
      expect(lines[1]).toBe('L1,A1,A,T1,D01,E1,90,N');
      expect(out.contentType).toContain('text/csv');
      expect(out.filename).toMatch(
        new RegExp(`^assignment_result_${YM}_[a-z0-9]{8}\\.csv$`),
      );
      expect(out.rowCount).toBe(1);
    });

    it('TC-M05-EXPORT-002：xlsx → 422 EXPORT_FORMAT_NOT_SUPPORTED', async () => {
      const run = await seedRun(env.runRepo);
      await expect(
        env.service.exportResult(run.run_id, 'xlsx', 'actor-1'),
      ).rejects.toMatchObject({
        response: { error: ERROR_CODES.EXPORT_FORMAT_NOT_SUPPORTED },
      });
    });

    it('TC-M05-EXPORT-003：csv 寫入 audit log (action=EXPORT)', async () => {
      const run = await seedRun(env.runRepo);
      await seedSnap(env.snapRepo, run.run_id, 'result', { assignments: [] });
      await env.service.exportResult(run.run_id, 'csv', 'actor-1');
      const logs = await env.auditRepo.find();
      expect(logs.length).toBe(1);
      expect(logs[0]).toMatchObject({
        action: 'EXPORT',
        entity_type: 'assignment_run',
        entity_id: run.run_id,
        actor_id: 'actor-1',
      });
      expect(logs[0].after_value).toEqual({ format: 'csv', rowCount: 0 });
    });

    it('TC-M05-EXPORT-004：未完成 → 422 ASSIGNMENT_RUN_NOT_COMPLETED', async () => {
      const run = await seedRun(env.runRepo, { status: 'pending' });
      await expect(
        env.service.exportResult(run.run_id, 'csv', 'actor-1'),
      ).rejects.toMatchObject({
        response: { error: ERROR_CODES.ASSIGNMENT_RUN_NOT_COMPLETED },
      });
    });

    it('TC-M05-EXPORT-005：CSV escape 含逗號 / 引號', async () => {
      const run = await seedRun(env.runRepo);
      await seedSnap(env.snapRepo, run.run_id, 'result', {
        assignments: [
          {
            listNo: 'L,1',
            applNo: 'A"1',
            cardLevel: 'A',
            tierLevel: null,
            deptId: 'D01',
            emplid: 'E1',
            score: 80,
            isCr: 'N',
          },
        ],
      });
      const out = await env.service.exportResult(
        run.run_id,
        'csv',
        'actor-1',
      );
      const dataLine = out.body.split('\n')[1];
      expect(dataLine).toContain('"L,1"');
      expect(dataLine).toContain('"A""1"');
    });
  });

  // -------------------------------------------------------------------------
  // F067 Compare
  // -------------------------------------------------------------------------

  describe('compareRuns (F067)', () => {
    async function seedComparePair(): Promise<{
      runA: AssignmentRun;
      runB: AssignmentRun;
    }> {
      const runA = await seedRun(env.runRepo, { project_workym: '202604' });
      const runB = await seedRun(env.runRepo, { project_workym: '202605' });
      await seedSnap(env.snapRepo, runA.run_id, 'config', {
        levelcardLevels: [{ cardVersion: 2 }],
        deptPct: [{ listNo: 'L1', deptId: 'D01', ration: '30' }],
        listDefinitions: [{ listNo: 'L1', crEnabled: false }],
      });
      await seedSnap(env.snapRepo, runA.run_id, 'input_list', { cases: [] });
      await seedSnap(env.snapRepo, runA.run_id, 'result', {
        assignments: [
          { applNo: 'A1', deptId: 'D01', cardLevel: 'A', emplid: 'E1' },
          { applNo: 'A2', deptId: 'D01', cardLevel: 'A', emplid: 'E2' },
          { applNo: 'A3', deptId: 'D02', cardLevel: 'B', emplid: 'E3' },
        ],
      });

      await seedSnap(env.snapRepo, runB.run_id, 'config', {
        levelcardLevels: [{ cardVersion: 3 }],
        deptPct: [{ listNo: 'L1', deptId: 'D01', ration: '35' }],
        listDefinitions: [{ listNo: 'L1', crEnabled: true }],
      });
      await seedSnap(env.snapRepo, runB.run_id, 'input_list', { cases: [] });
      await seedSnap(env.snapRepo, runB.run_id, 'result', {
        assignments: [
          // A1 同 E1（一致）
          { applNo: 'A1', deptId: 'D01', cardLevel: 'A', emplid: 'E1' },
          // A2 改派給 E99（不一致）
          { applNo: 'A2', deptId: 'D01', cardLevel: 'A', emplid: 'E99' },
          // A4 為新增
          { applNo: 'A4', deptId: 'D02', cardLevel: 'B', emplid: 'E3' },
        ],
      });
      return { runA, runB };
    }

    it('TC-M05-COMPARE-001：正常輸出', async () => {
      const { runA, runB } = await seedComparePair();
      const c = await env.service.compareRuns(runA.run_id, runB.run_id);
      expect(c.base.runId).toBe(runA.run_id);
      expect(c.compare.runId).toBe(runB.run_id);
      expect(c.summary.totalDiff).toBe(0); // 兩邊都 3 筆
      expect(c.summary.deptDiff.length).toBeGreaterThan(0);
      expect(c.summary.levelDiff.length).toBeGreaterThan(0);
    });

    it('TC-M05-COMPARE-002：任一 run 非 completed → 422', async () => {
      const runA = await seedRun(env.runRepo, { status: 'running' });
      const runB = await seedRun(env.runRepo);
      await expect(
        env.service.compareRuns(runA.run_id, runB.run_id),
      ).rejects.toMatchObject({
        response: { error: ERROR_CODES.ASSIGNMENT_RUN_NOT_COMPARABLE },
      });
    });

    it('TC-M05-COMPARE-003：人員配對不一致率（共同 A1/A2/A3 中 A2 不一致 → 1/2=50% alert=true，A3 base 有 cmp 無不算共同）', async () => {
      const { runA, runB } = await seedComparePair();
      const c = await env.service.compareRuns(runA.run_id, runB.run_id);
      // 共同 applNo：A1, A2（A3 base only, A4 cmp only）
      expect(c.personnelMismatch.totalCount).toBe(2);
      expect(c.personnelMismatch.mismatchCount).toBe(1);
      expect(c.personnelMismatch.rate).toBe(0.5);
      expect(c.personnelMismatch.alert).toBe(true);
      expect(c.personnelMismatch.list).toEqual([
        { applNo: 'A2', baseEmplId: 'E2', compareEmplId: 'E99' },
      ]);
    });

    it('TC-M05-COMPARE-004：0 共同案件 → rate=0 alert=false（無除零）', async () => {
      const runA = await seedRun(env.runRepo, { project_workym: '202603' });
      const runB = await seedRun(env.runRepo, { project_workym: '202604' });
      await seedSnap(env.snapRepo, runA.run_id, 'result', {
        assignments: [{ applNo: 'A1', emplid: 'E1' }],
      });
      await seedSnap(env.snapRepo, runB.run_id, 'result', {
        assignments: [{ applNo: 'B1', emplid: 'E2' }],
      });
      const c = await env.service.compareRuns(runA.run_id, runB.run_id);
      expect(c.personnelMismatch.totalCount).toBe(0);
      expect(c.personnelMismatch.rate).toBe(0);
      expect(c.personnelMismatch.alert).toBe(false);
    });

    it('TC-M05-COMPARE-005：customerDiff added/removed', async () => {
      const { runA, runB } = await seedComparePair();
      const c = await env.service.compareRuns(runA.run_id, runB.run_id);
      const addedSet = new Set(c.customerDiff.added.map((x) => x.applNo));
      const removedSet = new Set(c.customerDiff.removed.map((x) => x.applNo));
      expect(addedSet.has('A4')).toBe(true);
      expect(removedSet.has('A3')).toBe(true);
      expect(addedSet.has('A1')).toBe(false);
    });

    it('TC-M05-COMPARE-006：configDiff card_version 與 dept_pct 變更偵測', async () => {
      const { runA, runB } = await seedComparePair();
      const c = await env.service.compareRuns(runA.run_id, runB.run_id);
      expect(c.configDiff.cardVersionChanged).toEqual({ from: 2, to: 3 });
      expect(c.configDiff.deptRatioChanges).toContainEqual({
        listNo: 'L1',
        deptId: 'D01',
        from: 30,
        to: 35,
      });
      expect(c.configDiff.crRuleChanged).toEqual({ from: false, to: true });
    });
  });
});
