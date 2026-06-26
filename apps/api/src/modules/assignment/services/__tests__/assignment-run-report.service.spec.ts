/**
 * AssignmentRunReportService — F063 摘要 / F064 匯出 / F067 比對
 *
 * 對應 spec 場景：
 *   - TC-M05-SUMMARY-001：getSummary 正常輸出（總量 / coverage / 部門偏差 / 等級分佈）
 *   - TC-M05-SUMMARY-002：未完成 run → 422 ASSIGNMENT_RUN_NOT_COMPLETED
 *   - TC-M05-SUMMARY-003：部門偏差 > 3% → alert=true
 *   - TC-M05-SUMMARY-004：warnings 段含 skipped_cases + warning_summary
 *   - TC-M05-EXPORT-001：exportResult format=csv → header + rows
 *   - TC-M05-EXPORT-002：xlsx → ZIP 二進位（不再 422，v2.0 補 B6）
 *   - TC-M05-EXPORT-003：csv 寫入 audit log（action=EXPORT）
 *   - TC-M05-EXPORT-004：未完成 run → 422
 *   - TC-M05-EXPORT-005：CSV 內容含特殊字元（逗號 / 引號）正確 escape
 *   - TC-EXPORT-XLSX-001：exportResult format=xlsx → Buffer + filename + contentType
 *   - TC-EXPORT-XLSX-002：xlsx 包含 header + 8 欄位（與 CSV 一致）
 *   - TC-EXPORT-XLSX-003：xlsx 寫入 audit log（after_value.format=xlsx）
 *   - TC-EXPORT-XLSX-004：xlsx 含特殊字元值（,/"/\n）能安全寫入
 *   - TC-EXPORT-XLSX-005：未完成 run → 422 ASSIGNMENT_RUN_NOT_COMPLETED
 *   - TC-EXPORT-STREAMING：xlsx 50,001 筆 streaming 不爆 memory
 *   - TC-EXPORT-EXPIRED：xlsx 超過 timeout → 500 EXPORT_FILE_EXPIRED
 *   - TC-M05-COMPARE-001：compareRuns 正常輸出（summary / configDiff / personnelMismatch / customerDiff）
 *   - TC-M05-COMPARE-002：任一 run 非 completed → 422 ASSIGNMENT_RUN_NOT_COMPARABLE
 *   - TC-M05-COMPARE-003：人員配對不一致率（NFR-005）alert > 3% → true
 *   - TC-M05-COMPARE-004：人員配對 0 共同案件 → rate=0, alert=false（不發生除零）
 *   - TC-M05-COMPARE-005：customerDiff added/removed 集合運算正確
 *   - TC-M05-COMPARE-006：configDiff card_version 與 dept_pct ration 變更偵測
 *   - TC-COMPARE-EXPORT-XLSX：compareRunsExport 回傳 ZIP（xlsx） + filename + 3 sheets 結構
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AssignmentRunReportService } from '../assignment-run-report.service';
import { SectionChiefScopeService } from '../section-chief-scope.service';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { AssignmentRunSnapshot } from '@/database/entities/assignment-run-snapshot.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';
import { ObEmplSet } from '@/database/entities/ob-empl-set.entity';
import { ObEmphire } from '@/database/entities/ob-emphire.entity';
import { User } from '@/database/entities/user.entity';
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
        entities: [
          AssignmentRun,
          AssignmentRunSnapshot,
          AssignmentAuditLog,
          ObEmplSet,
          ObEmphire,
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
          { applNo: 'A1', deptId: 'D01', cardLevel: 'A', tierLevel: 'T1', emplid: 'E1' },
          { applNo: 'A2', deptId: 'D01', cardLevel: 'A', tierLevel: 'T1', emplid: 'E1' },
          { applNo: 'A3', deptId: 'D01', cardLevel: 'B', tierLevel: 'T2', emplid: 'E1' },
          { applNo: 'A4', deptId: 'D02', cardLevel: 'B', tierLevel: 'T2', emplid: 'E2' },
          { applNo: 'A5', deptId: 'D02', cardLevel: 'C', tierLevel: 'T3', emplid: 'E2' },
        ],
      });

      const s = await env.service.getSummary(run.run_id);

      expect(s.runId).toBe(run.run_id);
      expect(s.stage1Count).toBe(10);
      expect(s.stage4Count).toBe(5);
      expect(s.coverageRate).toBe(0.5);
      // F063 gap fix：分派業務員數（distinct emplid E1/E2 → 2）對齊 prototype「分派業務員數」stat card
      expect(s.emplCount).toBe(2);

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

      // F063 gap fix：TIER_LEVEL 分佈聚合（對齊 prototype 33-run-summary.html「TIER_LEVEL 分佈」）
      expect(s.tierDistribution.find((x) => x.tierLevel === 'T1')).toMatchObject({
        count: 2,
        ratio: 40,
      });
      expect(s.tierDistribution.find((x) => x.tierLevel === 'T2')).toMatchObject({
        count: 2,
        ratio: 40,
      });
      expect(s.tierDistribution.find((x) => x.tierLevel === 'T3')).toMatchObject({
        count: 1,
        ratio: 20,
      });
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

    it('TC-M05-SUMMARY-005：config-only 部門（actualCount=0）排除於 deptSummary', async () => {
      // 部門 D99 於 ob_dept_pct 有設定比例，但本次月跑無任何實際分派（actualCount=0）。
      // 「未分派部門」對使用者無意義（其 deviation 恆為 -configRatio 之假警示），須排除。
      const run = await seedRun(env.runRepo);
      await seedSnap(env.snapRepo, run.run_id, 'config', {
        deptPct: [
          { listNo: 'L1', deptId: 'D01', ration: '50' },
          { listNo: 'L1', deptId: 'D99', ration: '50' }, // 有設定、無實際分派
        ],
      });
      await seedSnap(env.snapRepo, run.run_id, 'input_list', { cases: [] });
      await seedSnap(env.snapRepo, run.run_id, 'result', {
        assignments: [
          { applNo: 'A1', deptId: 'D01', cardLevel: 'A' },
          { applNo: 'A2', deptId: 'D01', cardLevel: 'A' },
        ],
      });

      const s = await env.service.getSummary(run.run_id);

      // D99（actual=0）不出現；deptSummary 僅含實際有分派之部門
      expect(s.deptSummary.map((x) => x.deptId)).toEqual(['D01']);
      expect(s.deptSummary.every((x) => x.actualCount > 0)).toBe(true);
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

  // F064 v2.0（US-155 / AD-E07-31）：匯出改 ob_monthly_run_result 多表 join + cursor streaming，
  // 不再讀 snapshot.payload。v1.1 之 8 欄 / snapshot-based 匯出測試已由
  // `f064-export-23col.spec.ts`（SQLite/Unit）+ `f064-export-23col.pg.spec.ts`（PG 真庫）取代。
  // 422 阻擋 / timeout / 稽核 / 23 欄 / 格式轉換 / scope 等皆移至該二檔，本檔僅保留 F063 / F067。

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

    it('TC-COMPARE-EXPORT-XLSX：compareRunsExport 回傳 xlsx Buffer + filename + 3 sheets', async () => {
      const { runA, runB } = await seedComparePair();
      const out = await env.service.compareRunsExport(
        runA.run_id,
        runB.run_id,
        'actor-1',
      );
      expect(Buffer.isBuffer(out.body)).toBe(true);
      const buf = out.body as Buffer;
      expect(buf[0]).toBe(0x50);
      expect(buf[1]).toBe(0x4b);
      expect(out.contentType).toBe(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      expect(out.filename).toMatch(
        new RegExp(`^assignment_compare_[a-z0-9]{8}_[a-z0-9]{8}\\.xlsx$`),
      );
      // sheet 數 (summary / personnelMismatch / customerDiff)
      const wb = new (await import('exceljs')).Workbook();
      await wb.xlsx.load(
        buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
      );
      expect(wb.getWorksheet('summary')).toBeDefined();
      expect(wb.getWorksheet('personnelMismatch')).toBeDefined();
      expect(wb.getWorksheet('customerDiff')).toBeDefined();
      // personnelMismatch sheet 第 2 列 = A2 mismatch
      const pmSheet = wb.getWorksheet('personnelMismatch')!;
      // row 1 header；row 2 第一筆 mismatch
      const r2 = pmSheet.getRow(2);
      expect(String(r2.getCell(1).value)).toBe('A2');
      expect(String(r2.getCell(2).value)).toBe('E2');
      expect(String(r2.getCell(3).value)).toBe('E99');
    });
  });
});
