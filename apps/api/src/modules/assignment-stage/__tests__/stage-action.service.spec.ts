import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { StageActionService } from '../stage-action.service';
import { ERROR_CODES } from '@/common/errors/error-codes';

/**
 * StageActionService（F078 / F080 / F081 / F084 / F085 / F086 / F087 / F089）測試
 *
 * 重點：
 *   - 推進 / Rollback / 核准 / 拒絕分支 oneshot 覆蓋
 *   - F087 reject reason 必填 / 長度檢查
 *   - 月跑 / 歷史月份 / 已停用 / 非預期 stage 攔截
 *   - cleanup function 影響 deletedXxxCount 回傳
 */
describe('StageActionService', () => {
  let svc: StageActionService;
  let listRepo: any;
  let deptPctRepo: any;
  let emplSetRepo: any;
  let stageTransition: any;
  let ratioValidation: any;
  let personnelRatioValidation: any;
  let runGuard: any;

  beforeEach(() => {
    listRepo = { findOne: vi.fn() };
    deptPctRepo = {};
    emplSetRepo = {};
    stageTransition = {
      advanceTo: vi.fn().mockImplementation(async (_l, _f, _t, _u, pre, post) => {
        await pre({ find: vi.fn().mockResolvedValue([]), delete: vi.fn().mockResolvedValue({ affected: 0 }) });
        if (post) await post({});
      }),
      rollbackTo: vi.fn().mockImplementation(async (_l, _f, _t, _u, cleanup) => {
        await cleanup({ delete: vi.fn().mockResolvedValue({ affected: 5 }) });
      }),
      rejectTo: vi.fn().mockImplementation(async (_l, _f, _t, _u, _r, cleanup) => {
        if (cleanup) await cleanup({ delete: vi.fn().mockResolvedValue({ affected: 12 }) });
      }),
    };
    ratioValidation = { assertSumEquals100: vi.fn() };
    personnelRatioValidation = { assertAllDeptsSumEquals100: vi.fn().mockResolvedValue(undefined) };
    runGuard = { assertNoRunningRun: vi.fn().mockResolvedValue(undefined) };

    svc = new StageActionService(
      listRepo,
      deptPctRepo,
      emplSetRepo,
      stageTransition,
      ratioValidation,
      personnelRatioValidation,
      runGuard,
    );
  });

  const actor = { userId: 'u1', role: 'admin', businessRole: null, ipAddress: null };
  const okList = (stage: string) => ({
    list_no: 'L1',
    project_workym: '202605',
    stage,
    status: 'active',
  });

  // F078
  it('F078 advanceDraftToDeptRatio → 200', async () => {
    listRepo.findOne.mockResolvedValue(okList('draft'));
    const res = await svc.advanceDraftToDeptRatio('L1', actor, '202605');
    expect(res.currentStage).toBe('dept_ratio');
    expect(stageTransition.advanceTo).toHaveBeenCalledWith('L1', 'draft', 'dept_ratio', 'u1', expect.any(Function));
  });

  // F080
  it('F080 advanceDeptRatioToPersonnelRatio：dept_pct rows 為空 → 422 STAGE_ADVANCE_PRECONDITION_FAILED', async () => {
    listRepo.findOne.mockResolvedValue(okList('dept_ratio'));
    // mock advanceTo 內呼叫 precondition：rows = []
    stageTransition.advanceTo = vi.fn().mockImplementation(async (_l, _f, _t, _u, pre) => {
      const fakeMgr = { find: vi.fn().mockResolvedValue([]) };
      await pre(fakeMgr);
    });
    try {
      await svc.advanceDeptRatioToPersonnelRatio('L1', actor, '202605');
    } catch (e: any) {
      expect(e.response.error).toBe(ERROR_CODES.STAGE_ADVANCE_PRECONDITION_FAILED);
    }
  });

  // F081
  it('F081 rollbackDeptRatioToDraft：返回 deletedDeptPctCount', async () => {
    listRepo.findOne.mockResolvedValue(okList('dept_ratio'));
    const res = await svc.rollbackDeptRatioToDraft('L1', actor, '202605');
    expect(res.currentStage).toBe('draft');
    expect(res.deletedDeptPctCount).toBe(5);
  });

  // F081 stage 不是 dept_ratio → STAGE_ROLLBACK_BLOCKED
  it('F081 stage != dept_ratio → 422 STAGE_ROLLBACK_BLOCKED', async () => {
    listRepo.findOne.mockResolvedValue(okList('personnel_ratio'));
    try {
      await svc.rollbackDeptRatioToDraft('L1', actor, '202605');
    } catch (e: any) {
      expect(e).toBeInstanceOf(UnprocessableEntityException);
      expect(e.response.error).toBe(ERROR_CODES.STAGE_ROLLBACK_BLOCKED);
    }
  });

  // F084
  it('F084 advancePersonnelRatioToApproval：呼叫 assertAllDeptsSumEquals100', async () => {
    listRepo.findOne.mockResolvedValue(okList('personnel_ratio'));
    stageTransition.advanceTo = vi.fn().mockImplementation(async (_l, _f, _t, _u, pre) => {
      await pre({});
    });
    const res = await svc.advancePersonnelRatioToApproval('L1', actor, '202605');
    expect(res.currentStage).toBe('approval');
    expect(personnelRatioValidation.assertAllDeptsSumEquals100).toHaveBeenCalledWith('L1');
  });

  // F085
  it('F085 rollbackPersonnelRatioToDeptRatio：deletedEmplSetCount=5', async () => {
    listRepo.findOne.mockResolvedValue(okList('personnel_ratio'));
    const res = await svc.rollbackPersonnelRatioToDeptRatio('L1', actor, '202605');
    expect(res.deletedEmplSetCount).toBe(5);
  });

  // F086
  it('F086 approveToReady：approval → ready', async () => {
    listRepo.findOne.mockResolvedValue(okList('approval'));
    const res = await svc.approveToReady('L1', actor, '202605');
    expect(res.currentStage).toBe('ready');
    expect(stageTransition.advanceTo).toHaveBeenCalledWith('L1', 'approval', 'ready', 'u1', expect.any(Function));
  });

  // F087
  it('F087 rejectToPersonnelRatio reason 空字串 → 422 REJECT_REASON_REQUIRED', async () => {
    listRepo.findOne.mockResolvedValue(okList('approval'));
    try {
      await svc.rejectToPersonnelRatio('L1', '   ', actor, '202605');
    } catch (e: any) {
      expect(e.response.error).toBe(ERROR_CODES.REJECT_REASON_REQUIRED);
    }
  });

  // F087 reason > 500
  it('F087 reason > 500 → 422 REJECT_REASON_TOO_LONG', async () => {
    listRepo.findOne.mockResolvedValue(okList('approval'));
    const longReason = 'A'.repeat(501);
    try {
      await svc.rejectToPersonnelRatio('L1', longReason, actor, '202605');
    } catch (e: any) {
      expect(e.response.error).toBe(ERROR_CODES.REJECT_REASON_TOO_LONG);
    }
  });

  // F087 happy path
  it('F087 reject 成功 → previousStage=approval/currentStage=personnel_ratio/clearedEmployeeRatios=12', async () => {
    listRepo.findOne.mockResolvedValue(okList('approval'));
    const res = await svc.rejectToPersonnelRatio('L1', '比例需重設', actor, '202605');
    expect(res.currentStage).toBe('personnel_ratio');
    expect(res.clearedEmployeeRatios).toBe(12);
    expect(res.rejectReason).toBe('比例需重設');
  });

  // F089
  it('F089 rollbackReadyToApproval: ready → approval', async () => {
    listRepo.findOne.mockResolvedValue(okList('ready'));
    const res = await svc.rollbackReadyToApproval('L1', actor, '202605');
    expect(res.currentStage).toBe('approval');
  });

  // F089 stage != ready
  it('F089 stage != ready → 422 STAGE_ROLLBACK_BLOCKED', async () => {
    listRepo.findOne.mockResolvedValue(okList('approval'));
    try {
      await svc.rollbackReadyToApproval('L1', actor, '202605');
    } catch (e: any) {
      expect(e.response.error).toBe(ERROR_CODES.STAGE_ROLLBACK_BLOCKED);
    }
  });

  // 月跑進行中
  it('月跑進行中 → 立刻拋例外，不繼續執行', async () => {
    runGuard.assertNoRunningRun.mockRejectedValue(new Error('ASSIGNMENT_RUN_ALREADY_RUNNING'));
    listRepo.findOne.mockResolvedValue(okList('approval'));
    await expect(svc.approveToReady('L1', actor, '202605')).rejects.toThrow();
    expect(stageTransition.advanceTo).not.toHaveBeenCalled();
  });

  // 歷史月份
  it('歷史月份 → 403 LIST_HISTORICAL_READONLY', async () => {
    listRepo.findOne.mockResolvedValue({ ...okList('approval'), project_workym: '202504' });
    try {
      await svc.approveToReady('L1', actor, '202605');
    } catch (e: any) {
      expect(e).toBeInstanceOf(ForbiddenException);
      expect(e.response.error).toBe(ERROR_CODES.LIST_HISTORICAL_READONLY);
    }
  });

  // 名單停用
  it('名單已停用 → 422 ASSIGNMENT_LIST_INACTIVE', async () => {
    listRepo.findOne.mockResolvedValue({ ...okList('approval'), status: 'inactive' });
    try {
      await svc.approveToReady('L1', actor, '202605');
    } catch (e: any) {
      expect(e.response.error).toBe(ERROR_CODES.ASSIGNMENT_LIST_INACTIVE);
    }
  });
});
