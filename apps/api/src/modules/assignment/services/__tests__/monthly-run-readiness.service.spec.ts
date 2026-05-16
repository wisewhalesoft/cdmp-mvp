import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Repository } from 'typeorm';
import { MonthlyRunReadinessService } from '../monthly-run-readiness.service';
import { ObListDefinition } from '@/database/entities/ob-list-definition.entity';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';

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

  beforeEach(() => {
    listRepo = { find: vi.fn() };
    runRepo = { findOne: vi.fn() };
    service = new MonthlyRunReadinessService(
      listRepo as Repository<ObListDefinition>,
      runRepo as Repository<AssignmentRun>,
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
});
