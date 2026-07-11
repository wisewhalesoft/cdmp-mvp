import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Repository } from 'typeorm';
import { MonthlyRunReadinessService } from '../monthly-run-readiness.service';
import { ObListDefinition } from '@/database/entities/ob-list-definition.entity';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { ObLevelcardVersion } from '@/database/entities/ob-levelcard-version.entity';
import { EtlPipelineLog } from '@/database/entities/etl-pipeline-log.entity';
import { EtlPipeline } from '@/database/entities/etl-pipeline.entity';
import { EtlPipelineVersion } from '@/database/entities/etl-pipeline-version.entity';

/**
 * MonthlyRunReadinessService（F088 §5.2 / F061 月名單分派前置條件）
 *
 * calculateReadiness(workYm) → {
 *   workYm, totalActiveLists, readyCount, notReadyLists, allReady,
 *   monthlyRunStatus, scoringActive, etlStatus
 * }
 *
 * etlStatus 對應（改為依 pipeline definition 的 `target_load` targetTable，脫離顯示名）：
 *   ob_pool_data→pooldata / ob_emphire→emphire / ob_calendar→calendar /
 *   ob_arreturndf_min_cap→arreturndf
 */
describe('MonthlyRunReadinessService', () => {
  let service: MonthlyRunReadinessService;
  let listRepo: any;
  let runRepo: any;
  let versionRepo: any; // ObLevelcardVersion（scoringActive）
  let etlLogRepo: any;
  let etlPipelineRepo: any;
  let etlVersionRepo: any; // EtlPipelineVersion（definition → target_load）
  let dataSource: any; // getTableRowCounts 用（sqlite 分支：query 回 [{n}]）

  /** 建 log query builder mock（新邏輯：where/orderBy/limit/getMany，無 join）。 */
  const makeLogQb = (logs: any[]) => ({
    innerJoin: vi.fn().mockReturnThis(),
    innerJoinAndSelect: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    getMany: vi.fn().mockResolvedValue(logs),
  });

  /** 便捷：以 target_load 目標表建一支 pipeline + 其 version 定義。 */
  const pipelineWithTarget = (id: string, targetTable: string) => ({
    pipeline: { id, version: 1 },
    version: {
      pipeline_id: id,
      version: 1,
      definition: {
        nodes: [
          { data: { nodeType: 'raw_data_extract' } },
          { data: { nodeType: 'target_load', targetTable } },
        ],
        edges: [],
      },
    },
  });

  beforeEach(() => {
    listRepo = { find: vi.fn() };
    runRepo = { findOne: vi.fn() };
    versionRepo = { count: vi.fn().mockResolvedValue(1) };
    etlLogRepo = { createQueryBuilder: vi.fn().mockReturnValue(makeLogQb([])) };
    etlPipelineRepo = { find: vi.fn().mockResolvedValue([]) };
    etlVersionRepo = { find: vi.fn().mockResolvedValue([]) };
    // sqlite 分支：getTableRowCounts 逐表 `SELECT COUNT(*)`；預設回 100（4 表皆有資料）。
    dataSource = {
      options: { type: 'sqlite' },
      query: vi.fn().mockResolvedValue([{ n: 100 }]),
    };
    service = new MonthlyRunReadinessService(
      listRepo as Repository<ObListDefinition>,
      runRepo as Repository<AssignmentRun>,
      versionRepo as Repository<ObLevelcardVersion>,
      etlLogRepo as Repository<EtlPipelineLog>,
      etlPipelineRepo as Repository<EtlPipeline>,
      etlVersionRepo as Repository<EtlPipelineVersion>,
      dataSource,
    );
  });

  it('全部 active 名單均 ready → allReady=true, notReadyLists=[]', async () => {
    listRepo.find.mockResolvedValue([
      { list_no: 'L1', list_nm: 'A', stage: 'ready', status: 'active', project_workym: '202605' },
      { list_no: 'L2', list_nm: 'B', stage: 'ready', status: 'active', project_workym: '202605' },
    ]);
    runRepo.findOne.mockResolvedValue(null);

    const res = await service.calculateReadiness('202605');
    expect(res.workYm).toBe('202605');
    expect(res.totalActiveLists).toBe(2);
    expect(res.readyCount).toBe(2);
    expect(res.notReadyLists).toEqual([]);
    expect(res.allReady).toBe(true);
    expect(res.monthlyRunStatus).toBe('none');
  });

  it('部分名單未 ready → allReady=false + notReadyLists', async () => {
    listRepo.find.mockResolvedValue([
      { list_no: 'L1', list_nm: 'A', stage: 'ready', status: 'active', project_workym: '202605' },
      { list_no: 'L2', list_nm: 'B', stage: 'personnel_ratio', status: 'active', project_workym: '202605' },
    ]);
    runRepo.findOne.mockResolvedValue(null);

    const res = await service.calculateReadiness('202605');
    expect(res.allReady).toBe(false);
    expect(res.readyCount).toBe(1);
    expect(res.notReadyLists).toEqual([
      { listNo: 'L2', listNm: 'B', stage: 'personnel_ratio' },
    ]);
  });

  it('排除 stage = draft 名單（spec BR-5：不計入 totalActiveLists）', async () => {
    listRepo.find.mockResolvedValue([
      { list_no: 'L1', list_nm: 'A', stage: 'ready', status: 'active', project_workym: '202605' },
    ]);
    runRepo.findOne.mockResolvedValue(null);

    const res = await service.calculateReadiness('202605');
    expect(res.totalActiveLists).toBe(1);
  });

  it('當月有 running 月名單分派 → monthlyRunStatus = "running"', async () => {
    listRepo.find.mockResolvedValue([
      { list_no: 'L1', list_nm: 'A', stage: 'ready', status: 'active', project_workym: '202605' },
    ]);
    runRepo.findOne.mockResolvedValue({
      run_id: 'r1',
      project_workym: '202605',
      status: 'running',
    });

    const res = await service.calculateReadiness('202605');
    expect(res.monthlyRunStatus).toBe('running');
  });

  it('沒有任何 active 名單 → totalActiveLists=0, allReady=true（空集合視為 ready）', async () => {
    listRepo.find.mockResolvedValue([]);
    runRepo.findOne.mockResolvedValue(null);

    const res = await service.calculateReadiness('202605');
    expect(res.totalActiveLists).toBe(0);
    expect(res.readyCount).toBe(0);
    expect(res.allReady).toBe(true);
  });

  describe('F061 Phase 2 — scoringActive + etlStatus 擴充', () => {
    it('有 active levelcard version → scoringActive=true', async () => {
      listRepo.find.mockResolvedValue([]);
      runRepo.findOne.mockResolvedValue(null);
      versionRepo.count.mockResolvedValue(1);

      const res = await service.calculateReadiness('202605');
      expect(res.scoringActive).toBe(true);
    });

    it('沒有 active levelcard version → scoringActive=false', async () => {
      listRepo.find.mockResolvedValue([]);
      runRepo.findOne.mockResolvedValue(null);
      versionRepo.count.mockResolvedValue(0);

      const res = await service.calculateReadiness('202605');
      expect(res.scoringActive).toBe(false);
    });

    it('etlStatus 回傳 4 個 key（pooldata / emphire / calendar / arreturndf）', async () => {
      listRepo.find.mockResolvedValue([]);
      runRepo.findOne.mockResolvedValue(null);

      const res = await service.calculateReadiness('202605');
      expect(res.etlStatus).toBeDefined();
      expect(res.etlStatus).toHaveProperty('pooldata');
      expect(res.etlStatus).toHaveProperty('emphire');
      expect(res.etlStatus).toHaveProperty('calendar');
      expect(res.etlStatus).toHaveProperty('arreturndf');
    });

    it('每個 etlStatus 項目皆有 status / lastRunAt 欄位', async () => {
      listRepo.find.mockResolvedValue([]);
      runRepo.findOne.mockResolvedValue(null);

      const res = await service.calculateReadiness('202605');
      const keys = ['pooldata', 'emphire', 'calendar', 'arreturndf'] as const;
      for (const k of keys) {
        const it = (res.etlStatus as Record<string, unknown>)[k] as {
          status: string;
          lastRunAt: string | null;
        };
        expect(it).toHaveProperty('status');
        expect(it).toHaveProperty('lastRunAt');
      }
    });

    it('沒有任何 pipeline / log → 全部 status="missing", lastRunAt=null', async () => {
      listRepo.find.mockResolvedValue([]);
      runRepo.findOne.mockResolvedValue(null);
      etlPipelineRepo.find.mockResolvedValue([]);
      etlVersionRepo.find.mockResolvedValue([]);
      etlLogRepo.createQueryBuilder.mockReturnValue(makeLogQb([]));

      const res = await service.calculateReadiness('202605');
      expect((res.etlStatus as any).pooldata.status).toBe('missing');
      expect((res.etlStatus as any).emphire.status).toBe('missing');
      expect((res.etlStatus as any).pooldata.lastRunAt).toBeNull();
    });

    it('pooldata 最新 log completed → 依 target_load(ob_pool_data) 對應 → status="completed" + lastRunAt', async () => {
      listRepo.find.mockResolvedValue([]);
      runRepo.findOne.mockResolvedValue(null);
      const p = pipelineWithTarget('p-pool', 'ob_pool_data');
      etlPipelineRepo.find.mockResolvedValue([p.pipeline]);
      etlVersionRepo.find.mockResolvedValue([p.version]);
      const finishedAt = new Date('2026-05-15T03:00:00Z');
      etlLogRepo.createQueryBuilder.mockReturnValue(
        makeLogQb([{ status: 'completed', finished_at: finishedAt, pipeline_id: 'p-pool' }]),
      );

      const res = await service.calculateReadiness('202605');
      expect((res.etlStatus as any).pooldata.status).toBe('completed');
      expect((res.etlStatus as any).pooldata.lastRunAt).toBe(finishedAt.toISOString());
    });

    // 🔴 回歸（本次 bug）：pipeline 顯示名改成中文（dev CDMP 實況：「電銷人事行事曆 ETL」等）
    //   時，舊的英文 name regex（/calendar/i 等）比不到 → 4 項全誤報 missing（即使 ETL 已 completed）。
    //   改依 definition 的 target_load targetTable 對應後，中文名也能正確識別。
    it('回歸：pipeline 顯示名為中文，仍依 target_load(ob_calendar) 正確對應 completed', async () => {
      listRepo.find.mockResolvedValue([]);
      runRepo.findOne.mockResolvedValue(null);
      const p = pipelineWithTarget('p-cal', 'ob_calendar');
      // 顯示名為中文（不含任何英文 keyword）——舊 regex 會漏，新邏輯依 target 表命中。
      (p.pipeline as any).name = '電銷人事行事曆 ETL';
      etlPipelineRepo.find.mockResolvedValue([p.pipeline]);
      etlVersionRepo.find.mockResolvedValue([p.version]);
      const finishedAt = new Date('2026-07-10T02:00:00Z');
      etlLogRepo.createQueryBuilder.mockReturnValue(
        makeLogQb([{ status: 'completed', finished_at: finishedAt, pipeline_id: 'p-cal' }]),
      );

      const res = await service.calculateReadiness('202607');
      expect((res.etlStatus as any).calendar.status).toBe('completed');
      expect((res.etlStatus as any).calendar.lastRunAt).toBe(finishedAt.toISOString());
    });

    // 🔴 回歸：pooldata 必須精確對 ob_pool_data，不得被 ob_pool_data_list（歷史資料 pipeline）誤匹配
    //   （舊 regex /pooldata/i 會同時命中 OBPOOLDATA 與 OBPOOLDATA_LIST）。
    it('回歸：pooldata 精確對 ob_pool_data，不被 ob_pool_data_list 誤匹配', async () => {
      listRepo.find.mockResolvedValue([]);
      runRepo.findOne.mockResolvedValue(null);
      const pool = pipelineWithTarget('p-pool', 'ob_pool_data');
      const list = pipelineWithTarget('p-list', 'ob_pool_data_list');
      etlPipelineRepo.find.mockResolvedValue([pool.pipeline, list.pipeline]);
      etlVersionRepo.find.mockResolvedValue([pool.version, list.version]);
      const poolFinished = new Date('2026-07-10T01:00:00Z');
      const listFinished = new Date('2026-07-10T05:00:00Z'); // 更新，但屬 pool_data_list，不應影響 pooldata
      etlLogRepo.createQueryBuilder.mockReturnValue(
        makeLogQb([
          { status: 'running', finished_at: listFinished, pipeline_id: 'p-list' },
          { status: 'completed', finished_at: poolFinished, pipeline_id: 'p-pool' },
        ]),
      );

      const res = await service.calculateReadiness('202607');
      expect((res.etlStatus as any).pooldata.status).toBe('completed');
      expect((res.etlStatus as any).pooldata.lastRunAt).toBe(poolFinished.toISOString());
    });

    it('取當前版 definition（pipeline.version）對應 target_load', async () => {
      listRepo.find.mockResolvedValue([]);
      runRepo.findOne.mockResolvedValue(null);
      // pipeline 當前版=2；v1 target=ob_emphire（舊）、v2 target=ob_emphire（現）——取 v2。
      etlPipelineRepo.find.mockResolvedValue([{ id: 'p-emp', version: 2 }]);
      etlVersionRepo.find.mockResolvedValue([
        { pipeline_id: 'p-emp', version: 1, definition: { nodes: [{ data: { nodeType: 'target_load', targetTable: 'ob_emphire' } }], edges: [] } },
        { pipeline_id: 'p-emp', version: 2, definition: { nodes: [{ data: { nodeType: 'target_load', targetTable: 'ob_emphire' } }], edges: [] } },
      ]);
      const finishedAt = new Date('2026-07-09T10:39:07Z');
      etlLogRepo.createQueryBuilder.mockReturnValue(
        makeLogQb([{ status: 'completed', finished_at: finishedAt, pipeline_id: 'p-emp' }]),
      );

      const res = await service.calculateReadiness('202607');
      expect((res.etlStatus as any).emphire.status).toBe('completed');
    });

    // 🔴 空表 guard：來源表 rowCount=0（log 可能 completed 但表被清空）→ sourcesAllHaveData=false + 列出空表。
    it('來源表為空（rowCount=0）→ sourcesAllHaveData=false + emptySourceTables 含該表', async () => {
      listRepo.find.mockResolvedValue([]);
      runRepo.findOne.mockResolvedValue(null);
      // sqlite 分支逐表 SELECT COUNT(*)：ob_calendar 回 0、其餘回 100。
      dataSource.query = vi.fn().mockImplementation((sql: string) =>
        /ob_calendar/.test(sql)
          ? Promise.resolve([{ n: 0 }])
          : Promise.resolve([{ n: 100 }]),
      );

      const res = await service.calculateReadiness('202607');
      expect((res.etlStatus as any).calendar.rowCount).toBe(0);
      expect((res.etlStatus as any).pooldata.rowCount).toBe(100);
      expect(res.sourcesAllHaveData).toBe(false);
      expect(res.emptySourceTables).toContain('ob_calendar');
    });

    it('4 來源表皆有資料 → sourcesAllHaveData=true + emptySourceTables=[]', async () => {
      listRepo.find.mockResolvedValue([]);
      runRepo.findOne.mockResolvedValue(null);
      // 預設 dataSource.query 回 [{n:100}]（beforeEach）。
      const res = await service.calculateReadiness('202607');
      expect(res.sourcesAllHaveData).toBe(true);
      expect(res.emptySourceTables).toEqual([]);
    });
  });
});
