import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Repository } from 'typeorm';
import { MonthlyRunReadinessService } from '../monthly-run-readiness.service';
import { ObListDefinition } from '@/database/entities/ob-list-definition.entity';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { ObLevelcardVersion } from '@/database/entities/ob-levelcard-version.entity';
import { EtlPipelineLog } from '@/database/entities/etl-pipeline-log.entity';
import { EtlPipeline } from '@/database/entities/etl-pipeline.entity';

/**
 * MonthlyRunReadinessService（F088 §5.2 / F061 月跑前置條件）
 *
 * calculateReadiness(workYm) → {
 *   workYm,
 *   totalActiveLists: status='active' AND stage != 'draft' 之名單數
 *   readyCount: 上者中 stage='ready' 之筆數
 *   notReadyLists: 上者中 stage != 'ready' 者清單（含 listNo / listNm / stage）
 *   allReady: readyCount === totalActiveLists
 *   monthlyRunStatus: 'none' | 'pending' | 'running' | 'completed' | 'failed'
 * }
 */
describe('MonthlyRunReadinessService', () => {
  let service: MonthlyRunReadinessService;
  let listRepo: any;
  let runRepo: any;
  let versionRepo: any;
  let etlLogRepo: any;
  let etlPipelineRepo: any;

  beforeEach(() => {
    listRepo = { find: vi.fn() };
    runRepo = { findOne: vi.fn() };
    versionRepo = { count: vi.fn().mockResolvedValue(1) };
    etlLogRepo = {
      createQueryBuilder: vi.fn().mockReturnValue({
        innerJoinAndSelect: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        getMany: vi.fn().mockResolvedValue([]),
      }),
    };
    etlPipelineRepo = { find: vi.fn().mockResolvedValue([]) };
    service = new MonthlyRunReadinessService(
      listRepo as Repository<ObListDefinition>,
      runRepo as Repository<AssignmentRun>,
      versionRepo as Repository<ObLevelcardVersion>,
      etlLogRepo as Repository<EtlPipelineLog>,
      etlPipelineRepo as Repository<EtlPipeline>,
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
      // draft 不計入 totalActiveLists（service 透過 find where 過濾，repo find 仍回傳所有
      // matched 結果。Mock 已模擬 service 預期的 query result）
    ]);
    runRepo.findOne.mockResolvedValue(null);

    const res = await service.calculateReadiness('202605');
    expect(res.totalActiveLists).toBe(1);
  });

  it('當月有 running 月跑 → monthlyRunStatus = "running"', async () => {
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
      versionRepo.count.mockResolvedValue(1);

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
      versionRepo.count.mockResolvedValue(1);

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

    it('沒有任何 etl_pipeline_logs → 全部 status="missing", lastRunAt=null', async () => {
      listRepo.find.mockResolvedValue([]);
      runRepo.findOne.mockResolvedValue(null);
      versionRepo.count.mockResolvedValue(1);
      etlLogRepo.createQueryBuilder.mockReturnValue({
        innerJoinAndSelect: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        getMany: vi.fn().mockResolvedValue([]),
      });

      const res = await service.calculateReadiness('202605');
      expect((res.etlStatus as any).pooldata.status).toBe('missing');
      expect((res.etlStatus as any).emphire.status).toBe('missing');
      expect((res.etlStatus as any).pooldata.lastRunAt).toBeNull();
    });

    it('pooldata 最新 log status=completed → etlStatus.pooldata.status="completed" + lastRunAt', async () => {
      listRepo.find.mockResolvedValue([]);
      runRepo.findOne.mockResolvedValue(null);
      versionRepo.count.mockResolvedValue(1);
      const finishedAt = new Date('2026-05-15T03:00:00Z');
      etlLogRepo.createQueryBuilder.mockReturnValue({
        innerJoinAndSelect: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        getMany: vi.fn().mockResolvedValue([
          {
            status: 'completed',
            finished_at: finishedAt,
            pipeline: { name: 'OBPOOLDATA' },
          },
        ]),
      });

      const res = await service.calculateReadiness('202605');
      expect((res.etlStatus as any).pooldata.status).toBe('completed');
      expect((res.etlStatus as any).pooldata.lastRunAt).toBe(finishedAt.toISOString());
    });

    // 回歸守門：calculateEtlStatus 在 JS 端讀 `l.pipeline?.name` 做 keyword 比對，
    // 因此 join 必須 hydrate 關聯。裸 `innerJoin` 只過濾不載入 → pipeline 永遠
    // undefined → 4 個 source 全 fallback 成 'missing'（prod 實測：DB 最新 log
    // 皆 completed，readiness 卻全回 missing，月跑觸發頁 ETL pre-check 被誤鎖）。
    // mock 無法用資料行為區分兩者（getMany 一律回預先塞好 pipeline 的物件），
    // 故直接斷言呼叫了 innerJoinAndSelect、且未退回裸 innerJoin。
    it('回歸：必須以 innerJoinAndSelect hydrate pipeline（禁裸 innerJoin）', async () => {
      listRepo.find.mockResolvedValue([]);
      runRepo.findOne.mockResolvedValue(null);
      versionRepo.count.mockResolvedValue(1);
      const qb = {
        innerJoin: vi.fn().mockReturnThis(),
        innerJoinAndSelect: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        getMany: vi.fn().mockResolvedValue([]),
      };
      etlLogRepo.createQueryBuilder.mockReturnValue(qb);

      await service.calculateReadiness('202605');

      expect(qb.innerJoinAndSelect).toHaveBeenCalledWith('log.pipeline', 'pipeline');
      expect(qb.innerJoin).not.toHaveBeenCalled();
    });
  });
});
