import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DeptRatioService } from '../dept-ratio.service';
import { ERROR_CODES } from '@/common/errors/error-codes';

/**
 * F079 v1.2 — 部門比例 Service 測試
 *
 * 對應 spec：
 *   - GET 回傳在職部門 + 既有但已下線部門
 *   - PUT 加總 100% / 邊界容忍 ±0.01% / 越界
 *   - 處長不可達（由 controller layer DirectorGuard 拒絕；service 不需另測）
 *   - 月跑進行中 → 409
 *   - 歷史月份 → 403
 *   - 非 dept_ratio → 422 LIST_STAGE_TRANSITION_FORBIDDEN
 *   - 覆寫式：原 5 筆 + 新 3 筆 → DB 剩 3 筆
 */
describe('DeptRatioService (F079)', () => {
  let svc: DeptRatioService;
  let listRepo: any;
  let deptPctRepo: any;
  let emphireRepo: any;
  let userRepo: any;
  let stageTransition: any;
  let ratioValidation: any;
  let runGuard: any;
  let dataSource: any;
  let mgr: any;

  beforeEach(() => {
    mgr = {
      delete: vi.fn().mockResolvedValue({ affected: 0 }),
      insert: vi.fn().mockResolvedValue({}),
      find: vi.fn().mockResolvedValue([]),
    };
    dataSource = {
      transaction: vi.fn(async (fn: any) => fn(mgr)),
    };
    listRepo = { findOne: vi.fn() };
    deptPctRepo = {
      find: vi.fn().mockResolvedValue([]),
      createQueryBuilder: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        getMany: vi.fn().mockResolvedValue([]),
      })),
    };
    emphireRepo = {
      createQueryBuilder: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        addSelect: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        groupBy: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        addOrderBy: vi.fn().mockReturnThis(),
        getRawMany: vi.fn().mockResolvedValue([
          { dept_code: 'XTC0', dept_name: '業務一部' },
          { dept_code: 'XTD0', dept_name: '業務二部' },
        ]),
      })),
    };
    stageTransition = {
      assertStageEquals: vi.fn().mockResolvedValue(undefined),
    };
    ratioValidation = {
      assertEachInRange: vi.fn(),
      assertSumEquals100: vi.fn(),
    };
    runGuard = { assertNoRunningRun: vi.fn().mockResolvedValue(undefined) };
    // F088 v1.3：設定者解析（created_by → users）
    userRepo = { find: vi.fn().mockResolvedValue([]) };

    svc = new DeptRatioService(
      dataSource,
      listRepo,
      deptPctRepo,
      emphireRepo,
      userRepo,
      ratioValidation,
      stageTransition,
      runGuard,
    );
  });

  // TC-M03a-001
  it('GET 合併在職部門 + 既有 RATION', async () => {
    listRepo.findOne.mockResolvedValue({
      list_no: 'OB202605001',
      list_nm: '車貸',
      project_workym: '202605',
      stage: 'dept_ratio',
      status: 'active',
    });
    deptPctRepo.find.mockResolvedValue([
      { obdeptid: 'XTC0', obdeptnm: '業務一部', ration: '30' },
      { obdeptid: 'XTF0', obdeptnm: '業務四部(下線)', ration: '15' }, // 在 ob_emphire 不存在
    ]);
    const res = await svc.getDeptRatios('OB202605001');
    expect(res.stage).toBe('dept_ratio');
    const codes = res.deptRatios.map((d) => d.obdeptId).sort();
    expect(codes).toContain('XTC0');
    expect(codes).toContain('XTF0');
    const xtf = res.deptRatios.find((d) => d.obdeptId === 'XTF0');
    expect(xtf?.isActive).toBe(false);
    expect(res.isReadOnly).toBe(false);
  });

  // 準備完成摘要：excludeZeroRatio 隱藏 0% 部門
  it('GET excludeZeroRatio=true → 隱藏比例 = 0% 之部門（設定頁不傳則全顯示）', async () => {
    listRepo.findOne.mockResolvedValue({
      list_no: 'L1',
      list_nm: 'X',
      project_workym: '202605',
      stage: 'ready',
      status: 'active',
    });
    // XTC0 配置 60%；XTD0（在職部門）無配置 → ration 0
    deptPctRepo.find.mockResolvedValue([
      { obdeptid: 'XTC0', obdeptnm: '業務一部', ration: '60' },
    ]);

    const all = await svc.getDeptRatios('L1');
    expect(all.deptRatios.map((d) => d.obdeptId).sort()).toEqual(['XTC0', 'XTD0']);
    expect(all.deptRatios.find((d) => d.obdeptId === 'XTD0')!.ration).toBe(0);

    const filtered = await svc.getDeptRatios('L1', { excludeZeroRatio: true });
    expect(filtered.deptRatios.map((d) => d.obdeptId)).toEqual(['XTC0']);
    expect(filtered.deptRatios.every((d) => d.ration > 0)).toBe(true);
  });

  // F088 v1.3 BR-11：設定者 / 部長代設定 解析
  it('F088 GET：設定者解析 — director 設定 → proxyByDirector=true；section_chief → false', async () => {
    listRepo.findOne.mockResolvedValue({
      list_no: 'OB202605001',
      list_nm: '車貸',
      project_workym: '202605',
      stage: 'ready',
      status: 'active',
    });
    deptPctRepo.find.mockResolvedValue([
      { obdeptid: 'XTC0', obdeptnm: '業務一部', ration: '60', created_by: '0d1a0000-0000-4000-8000-000000000001' },
      { obdeptid: 'XTD0', obdeptnm: '業務二部', ration: '40', created_by: '0c1e0000-0000-4000-8000-000000000002' },
    ]);
    userRepo.find.mockResolvedValue([
      { id: '0d1a0000-0000-4000-8000-000000000001', name: '張部長', role: 'user', business_role: 'director' },
      { id: '0c1e0000-0000-4000-8000-000000000002', name: '李處長', role: 'user', business_role: 'section_chief' },
    ]);

    const res = await svc.getDeptRatios('OB202605001');
    const xtc0 = res.deptRatios.find((d) => d.obdeptId === 'XTC0')!;
    const xtd0 = res.deptRatios.find((d) => d.obdeptId === 'XTD0')!;
    expect(xtc0.setByName).toBe('張部長');
    expect(xtc0.proxyByDirector).toBe(true);
    expect(xtd0.setByName).toBe('李處長');
    expect(xtd0.proxyByDirector).toBe(false);
  });

  // TC-M03a-002
  it('PUT 加總 100 → 成功儲存 + audit', async () => {
    listRepo.findOne.mockResolvedValue({
      list_no: 'L1',
      list_nm: 'X',
      project_workym: '202605',
      stage: 'dept_ratio',
      status: 'active',
    });
    deptPctRepo.find.mockResolvedValue([]);

    const res = await svc.setDeptRatios(
      'L1',
      {
        deptRatios: [
          { obdeptId: 'XTC0', obdeptNm: '一部', ration: 60 },
          { obdeptId: 'XTD0', obdeptNm: '二部', ration: 40 },
        ],
      },
      { userId: 'u1', ipAddress: null },
      '202605',
    );
    expect(res.savedCount).toBe(2);
    expect(res.total).toBe(100);
    expect(runGuard.assertNoRunningRun).toHaveBeenCalled();
    expect(stageTransition.assertStageEquals).toHaveBeenCalledWith('L1', 'dept_ratio');
    expect(ratioValidation.assertEachInRange).toHaveBeenCalled();
    expect(ratioValidation.assertSumEquals100).toHaveBeenCalled();
    expect(mgr.delete).toHaveBeenCalled();
    expect(mgr.insert).toHaveBeenCalledTimes(3); // 2 dept rows + 1 audit
  });

  // TC-M03a-003
  it('PUT 名單不存在 → 404 ASSIGNMENT_LIST_NOT_FOUND', async () => {
    listRepo.findOne.mockResolvedValue(null);
    await expect(
      svc.setDeptRatios('NO', { deptRatios: [{ obdeptId: 'X', obdeptNm: 'X', ration: 100 }] }, { userId: 'u1', ipAddress: null }, '202605'),
    ).rejects.toThrow(NotFoundException);
  });

  // TC-M03a-004
  it('PUT 歷史月份 → 403 LIST_HISTORICAL_READONLY', async () => {
    listRepo.findOne.mockResolvedValue({
      list_no: 'L1',
      list_nm: 'X',
      project_workym: '202504',
      stage: 'dept_ratio',
      status: 'active',
    });
    try {
      await svc.setDeptRatios('L1', { deptRatios: [{ obdeptId: 'X', obdeptNm: 'X', ration: 100 }] }, { userId: 'u1', ipAddress: null }, '202605');
    } catch (e: any) {
      expect(e).toBeInstanceOf(ForbiddenException);
      expect(e.response.error).toBe(ERROR_CODES.LIST_HISTORICAL_READONLY);
    }
  });

  // TC-M03a-005
  it('PUT 已停用 → 422 ASSIGNMENT_LIST_INACTIVE', async () => {
    listRepo.findOne.mockResolvedValue({
      list_no: 'L1',
      list_nm: 'X',
      project_workym: '202605',
      stage: 'dept_ratio',
      status: 'inactive',
    });
    try {
      await svc.setDeptRatios('L1', { deptRatios: [{ obdeptId: 'X', obdeptNm: 'X', ration: 100 }] }, { userId: 'u1', ipAddress: null }, '202605');
    } catch (e: any) {
      expect(e).toBeInstanceOf(UnprocessableEntityException);
      expect(e.response.error).toBe(ERROR_CODES.ASSIGNMENT_LIST_INACTIVE);
    }
  });

  // TC-M03a-006
  it('PUT 月跑進行中 → 409', async () => {
    runGuard.assertNoRunningRun.mockRejectedValue(new Error('ASSIGNMENT_RUN_ALREADY_RUNNING'));
    await expect(
      svc.setDeptRatios('L1', { deptRatios: [{ obdeptId: 'X', obdeptNm: 'X', ration: 100 }] }, { userId: 'u1', ipAddress: null }, '202605'),
    ).rejects.toThrow();
    expect(stageTransition.assertStageEquals).not.toHaveBeenCalled();
  });
});
