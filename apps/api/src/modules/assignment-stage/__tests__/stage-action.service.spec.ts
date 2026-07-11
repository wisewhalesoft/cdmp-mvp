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
 *   - 月名單分派 / 歷史月份 / 已停用 / 非預期 stage 攔截
 *   - cleanup function 影響 deletedXxxCount 回傳
 */
describe('StageActionService', () => {
  let svc: StageActionService;
  let listRepo: any;
  let deptPctRepo: any;
  let emplSetRepo: any;
  let approvalRepo: any;
  let userRepo: any;
  let stageTransition: any;
  let ratioValidation: any;
  let personnelRatioValidation: any;
  let runGuard: any;
  let stage0Estimate: any;

  beforeEach(() => {
    listRepo = { findOne: vi.fn(), update: vi.fn().mockResolvedValue({ affected: 1 }) };
    deptPctRepo = {};
    emplSetRepo = {};
    approvalRepo = {
      createQueryBuilder: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        addOrderBy: vi.fn().mockReturnThis(),
        getMany: vi.fn().mockResolvedValue([]),
      }),
    };
    userRepo = { find: vi.fn().mockResolvedValue([]) };
    stageTransition = {
      advanceTo: vi.fn().mockImplementation(async (_l, _f, _t, _u, pre, post) => {
        const mgr = {
          find: vi.fn().mockResolvedValue([]),
          delete: vi.fn().mockResolvedValue({ affected: 0 }),
          insert: vi.fn().mockResolvedValue({}),
        };
        await pre(mgr);
        if (post) await post(mgr);
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
    // F086 v1.3：物化 Stage 0 估算
    stage0Estimate = {
      estimateListCount: vi.fn().mockResolvedValue({ listNo: 'L1', count: 9999 }),
    };

    svc = new StageActionService(
      listRepo,
      deptPctRepo,
      emplSetRepo,
      approvalRepo,
      userRepo,
      stageTransition,
      ratioValidation,
      personnelRatioValidation,
      runGuard,
      stage0Estimate,
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
    // v1.3：advanceTo 多帶 postActionFn（寫 approve 紀錄）
    expect(stageTransition.advanceTo).toHaveBeenCalledWith(
      'L1',
      'approval',
      'ready',
      'u1',
      expect.any(Function),
      expect.any(Function),
    );
  });

  // F086 v1.3：approve 同 transaction 寫入 assignment_approval(action='approve')
  it('F086 approveToReady：postActionFn 寫入 assignment_approval(action=approve)', async () => {
    listRepo.findOne.mockResolvedValue(okList('approval'));
    const insertSpy = vi.fn().mockResolvedValue({});
    stageTransition.advanceTo = vi
      .fn()
      .mockImplementation(async (_l, _f, _t, _u, _pre, post) => {
        if (post) await post({ insert: insertSpy });
      });
    await svc.approveToReady('L1', actor, '202605');
    expect(insertSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ list_no: 'L1', action: 'approve', approver_id: 'u1' }),
    );
  });

  // F086 v1.3：commit 後物化 Stage 0 估算
  // F092 AC-6（TS-F092-UPG-003）：物化計算改用完整鏈 dry-run COUNT；hook 對 estimateListCount
  //   內部如何算 count 不敏感（升級後仍呼叫同簽名 estimateListCount(listNo)），故本案例同時涵蓋
  //   F092 物化來源升級的 hook 接點驗證（estimateListCount 被呼叫、count 寫回 stage0_estimate_count）。
  it('F086 approveToReady：物化 Stage 0 估算寫回 stage0_estimate_count', async () => {
    listRepo.findOne.mockResolvedValue(okList('approval'));
    await svc.approveToReady('L1', actor, '202605');
    expect(stage0Estimate.estimateListCount).toHaveBeenCalledWith('L1');
    expect(listRepo.update).toHaveBeenCalledWith(
      { list_no: 'L1' },
      expect.objectContaining({ stage0_estimate_count: 9999 }),
    );
  });

  // F086 v1.3：物化估算失敗 → best-effort，不影響 approve 結果
  // F092 AC-6（TS-F092-UPG-004）：完整鏈 dry-run 因含去重查詢耗時較高、逾時風險較大；
  //   best-effort 機制不變 —— estimateListCount 拋錯（如 STAGE0_ESTIMATE_TIMEOUT）時 approve 仍成功、
  //   stage0_estimate_count 不更新（保留舊值），錯誤僅 log。
  it('F086 approveToReady：估算失敗不阻擋 approve（best-effort）', async () => {
    listRepo.findOne.mockResolvedValue(okList('approval'));
    stage0Estimate.estimateListCount = vi
      .fn()
      .mockRejectedValue(new Error('STAGE0_ESTIMATE_TIMEOUT'));
    const res = await svc.approveToReady('L1', actor, '202605');
    expect(res.currentStage).toBe('ready');
    expect(listRepo.update).not.toHaveBeenCalled();
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

  // 月名單分派進行中
  it('月名單分派進行中 → 立刻拋例外，不繼續執行', async () => {
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

  // getApprovalHistory：approver_name 於寫入時存的是 UUID → 讀取時解析為 users.name
  it('getApprovalHistory：approver_id 為存在 user → approverName 解析為姓名（非 UUID）', async () => {
    const uid = 'd4e5f6a7-b8c9-0123-def4-567890123456';
    listRepo.findOne.mockResolvedValue(okList('ready'));
    approvalRepo.createQueryBuilder.mockReturnValue({
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      addOrderBy: vi.fn().mockReturnThis(),
      getMany: vi.fn().mockResolvedValue([
        {
          approval_id: 'a1',
          action: 'approve',
          reject_reason: null,
          approver_id: uid,
          approver_name: uid, // 寫入時存 UUID（bug 現況）
          approver_role: 'director',
          approved_at: new Date('2026-05-14T18:05:00Z'),
        },
      ]),
    });
    userRepo.find.mockResolvedValue([{ id: uid, name: '游馥瑄' }]);

    const res = await svc.getApprovalHistory('L1');
    expect(userRepo.find).toHaveBeenCalled();
    expect(res.history[0].approverName).toBe('游馥瑄');
    expect(res.history[0].approverId).toBe(uid);
  });

  // 查無對應 user → 退回原存值（不回退為空、不 500）
  it('getApprovalHistory：approver_id 查無 user → approverName 退回原存值', async () => {
    listRepo.findOne.mockResolvedValue(okList('ready'));
    approvalRepo.createQueryBuilder.mockReturnValue({
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      addOrderBy: vi.fn().mockReturnThis(),
      getMany: vi.fn().mockResolvedValue([
        {
          approval_id: 'a2',
          action: 'approve',
          reject_reason: null,
          approver_id: 'legacy-import', // 非 UUID → isUuid 過濾、不查 users
          approver_name: 'Legacy Approver',
          approver_role: 'director',
          approved_at: new Date('2026-05-14T18:05:00Z'),
        },
      ]),
    });

    const res = await svc.getApprovalHistory('L1');
    // 非 UUID 不餵入 users 查詢（避免 MSSQL Invalid GUID 500）
    expect(userRepo.find).not.toHaveBeenCalled();
    expect(res.history[0].approverName).toBe('Legacy Approver');
  });
});
