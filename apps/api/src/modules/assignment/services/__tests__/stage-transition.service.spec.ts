import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UnprocessableEntityException, NotFoundException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { StageTransitionService, type StageName } from '../stage-transition.service';
import { ERROR_CODES } from '@/common/errors/error-codes';

/**
 * StageTransitionService（AD-E07 v3.0 / 重構批次 4 / 2026-05-15）
 *
 * 五階段流程引擎共用 helper：
 *   - assertStageEquals(listNo, expectedStage)
 *   - advanceTo(listNo, fromStage, toStage, preconditionFn, postActionFn?)
 *   - rollbackTo(listNo, fromStage, toStage, cleanupFn)
 *   - rejectTo(listNo, fromStage, toStage, rejectReason, cleanupFn?, postActionFn?)
 *
 * 所有寫入操作於同一 DB transaction 內完成（含稽核 INSERT）；
 * 若名單階段不符 → 422 LIST_STAGE_TRANSITION_FORBIDDEN；
 * 若名單不存在 → 404；
 * 若 preconditionFn 拋例外 → 上拋；
 * 成功 → UPDATE stage + INSERT assignment_audit_log + 執行 postActionFn。
 */
describe('StageTransitionService', () => {
  let service: StageTransitionService;
  let dataSource: any;
  let mgr: any;

  beforeEach(() => {
    mgr = {
      findOne: vi.fn(),
      update: vi.fn(),
      insert: vi.fn(),
    };
    // 外層 repo.findOne(opts) 與 mgr.findOne(Entity, opts) 共用同 mock 結果
    const outerRepo = {
      findOne: (opts: any) => mgr.findOne(null, opts),
    };
    dataSource = {
      transaction: vi.fn(async (fn: any) => fn(mgr)),
      getRepository: vi.fn(() => outerRepo),
    };
    service = new StageTransitionService(dataSource as DataSource);
  });

  describe('assertStageEquals', () => {
    it('stage 符合 → silent', async () => {
      mgr.findOne.mockResolvedValue({ list_no: 'L1', stage: 'draft' });
      await expect(
        service.assertStageEquals('L1', 'draft' as StageName),
      ).resolves.toBeUndefined();
    });

    it('stage 不符 → 422 LIST_STAGE_TRANSITION_FORBIDDEN', async () => {
      mgr.findOne.mockResolvedValue({ list_no: 'L1', stage: 'dept_ratio' });
      await expect(
        service.assertStageEquals('L1', 'draft' as StageName),
      ).rejects.toThrow(UnprocessableEntityException);
      try {
        await service.assertStageEquals('L1', 'draft' as StageName);
      } catch (e: any) {
        expect(e.response.error).toBe(ERROR_CODES.LIST_STAGE_TRANSITION_FORBIDDEN);
      }
    });

    it('名單不存在 → 404', async () => {
      mgr.findOne.mockResolvedValue(null);
      await expect(
        service.assertStageEquals('L1', 'draft' as StageName),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('advanceTo', () => {
    it('成功：UPDATE stage + INSERT audit + 呼叫 preconditionFn / postActionFn', async () => {
      mgr.findOne.mockResolvedValue({ list_no: 'L1', stage: 'draft' });
      const precond = vi.fn().mockResolvedValue(undefined);
      const postAct = vi.fn().mockResolvedValue(undefined);

      await service.advanceTo('L1', 'draft', 'dept_ratio', 'u1', precond, postAct);

      expect(precond).toHaveBeenCalledOnce();
      expect(mgr.update).toHaveBeenCalled();
      expect(mgr.insert).toHaveBeenCalled(); // audit log
      expect(postAct).toHaveBeenCalledOnce();
    });

    it('preconditionFn 拋例外 → 上拋且不執行 UPDATE / postActionFn', async () => {
      mgr.findOne.mockResolvedValue({ list_no: 'L1', stage: 'draft' });
      const err = new Error('precondition failed');
      const precond = vi.fn().mockRejectedValue(err);
      const postAct = vi.fn();

      await expect(
        service.advanceTo('L1', 'draft', 'dept_ratio', 'u1', precond, postAct),
      ).rejects.toThrow('precondition failed');

      expect(mgr.update).not.toHaveBeenCalled();
      expect(postAct).not.toHaveBeenCalled();
    });

    it('fromStage 不符 → 422 LIST_STAGE_TRANSITION_FORBIDDEN', async () => {
      mgr.findOne.mockResolvedValue({ list_no: 'L1', stage: 'ready' });
      const precond = vi.fn();
      await expect(
        service.advanceTo('L1', 'draft', 'dept_ratio', 'u1', precond),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(precond).not.toHaveBeenCalled();
    });
  });

  describe('rollbackTo', () => {
    it('成功：UPDATE stage + INSERT audit + 呼叫 cleanupFn', async () => {
      mgr.findOne.mockResolvedValue({ list_no: 'L1', stage: 'dept_ratio' });
      const cleanup = vi.fn().mockResolvedValue(undefined);

      await service.rollbackTo('L1', 'dept_ratio', 'draft', 'u1', cleanup);

      expect(cleanup).toHaveBeenCalledOnce();
      expect(mgr.update).toHaveBeenCalled();
      expect(mgr.insert).toHaveBeenCalled();
    });
  });

  describe('rejectTo', () => {
    it('成功：UPDATE stage + INSERT audit (含 rejectReason) + cleanupFn + postActionFn', async () => {
      mgr.findOne.mockResolvedValue({ list_no: 'L1', stage: 'approval' });
      const cleanup = vi.fn().mockResolvedValue(undefined);
      const postAct = vi.fn().mockResolvedValue(undefined);

      await service.rejectTo(
        'L1',
        'approval',
        'personnel_ratio',
        'u1',
        '比例不合理',
        cleanup,
        postAct,
      );

      expect(cleanup).toHaveBeenCalledOnce();
      expect(postAct).toHaveBeenCalledOnce();
      const auditCall = mgr.insert.mock.calls[0];
      const auditPayload = auditCall[1];
      // audit 中應紀錄 rejectReason
      expect(JSON.stringify(auditPayload)).toContain('比例不合理');
      // 2026-05-26 regression guard：entity_type 必須與 getFullSnapshot 查詢值一致
      //（'ob_list_definition'）；否則拒絕事件不會出現在 Detail Drawer 簽核歷史。
      expect(auditPayload.entity_type).toBe('ob_list_definition');
      expect(auditPayload.action).toBe('STAGE_REJECT');
    });
  });
});
