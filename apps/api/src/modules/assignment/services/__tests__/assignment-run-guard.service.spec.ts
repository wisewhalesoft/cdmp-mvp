import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConflictException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { AssignmentRunGuardService } from '../assignment-run-guard.service';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { ERROR_CODES } from '@/common/errors/error-codes';

/**
 * AssignmentRunGuardService（AD-E07 v3.0 / 決議 #6 / 2026-05-16）
 *
 * 提供 assertNoRunningRun(workYm?) method：
 *   - 查詢 assignment_run.status IN ('pending', 'running')
 *   - 若有 → 拋 409 ConflictException + ASSIGNMENT_RUN_ALREADY_RUNNING
 *   - 若無 → silent return
 *   - workYm 為 optional：傳入時加 project_workym 過濾
 */
describe('AssignmentRunGuardService', () => {
  let service: AssignmentRunGuardService;
  let repo: { count: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    repo = { count: vi.fn() };
    service = new AssignmentRunGuardService(repo as unknown as Repository<AssignmentRun>);
  });

  it('無 running / pending run → silent return', async () => {
    repo.count.mockResolvedValue(0);
    await expect(service.assertNoRunningRun()).resolves.toBeUndefined();
    expect(repo.count).toHaveBeenCalledOnce();
  });

  it('有 running run → 拋 409 ASSIGNMENT_RUN_ALREADY_RUNNING', async () => {
    repo.count.mockResolvedValue(1);
    await expect(service.assertNoRunningRun()).rejects.toThrow(ConflictException);
    try {
      await service.assertNoRunningRun();
    } catch (e: any) {
      expect(e.response.error).toBe(ERROR_CODES.ASSIGNMENT_RUN_ALREADY_RUNNING);
    }
  });

  it('帶 workYm 過濾：呼叫 repo.count with project_workym filter', async () => {
    repo.count.mockResolvedValue(0);
    await service.assertNoRunningRun('202605');
    const callArg = repo.count.mock.calls[0][0];
    expect(callArg.where.project_workym).toBe('202605');
    // 須包含 status IN ('pending', 'running') 條件
    expect(callArg.where.status).toBeDefined();
  });

  it('查詢條件包含 status IN ("pending", "running")', async () => {
    repo.count.mockResolvedValue(0);
    await service.assertNoRunningRun();
    const callArg = repo.count.mock.calls[0][0];
    expect(callArg.where.status).toBeDefined();
    // TypeORM In() 序列化後格式
    const statusFilter = callArg.where.status;
    // 接受 In(['pending','running']) 或 ['pending','running'] 兩種呼叫風格
    const hasPending = JSON.stringify(statusFilter).includes('pending');
    const hasRunning = JSON.stringify(statusFilter).includes('running');
    expect(hasPending && hasRunning).toBe(true);
  });
});
