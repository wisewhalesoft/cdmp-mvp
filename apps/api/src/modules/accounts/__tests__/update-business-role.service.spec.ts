/**
 * F006a v1.0 / AD-E07 v3.0 / E07 重構 P1 B1 / 2026-05-16
 *
 * AccountsService.updateBusinessRole(targetId, role, actorId) 單元測試。
 *
 * 對應 spec：
 *   - F006a-update-business-role.md §4 AC-1~AC-8 / §5.5 token revoke / §6 BR-1~BR-8 / §9 audit
 *
 * 涵蓋 case：
 *   TC-MERGED-001  指派 director（NULL → director）
 *   TC-MERGED-002  指派 section_chief
 *   TC-MERGED-003  撤銷（director → null，action = REVOKE_ROLE）
 *   TC-MERGED-004  覆寫（director → section_chief，audit log before/after 正確）
 *   TC-MERGED-005  目標帳號不存在 → NotFoundException ACCOUNT_NOT_FOUND
 *   TC-MERGED-006  寫入 password_changed_at = now + 1000 ms
 *   TC-MERGED-007  寫入 assignment_audit_log（action / entity_type / entity_id / before / after）
 *   TC-MERGED-008  同 transaction（DataSource.transaction 被呼叫一次）
 *   TC-MERGED-009  Admin 帳號可寫入（BR-7：不阻擋）
 *   TC-MERGED-010  撤銷時 audit entity_id 含 oldRole 後綴
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { AccountsService } from '../accounts.service';
import { User } from '@/database/entities/user.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';

describe('AccountsService.updateBusinessRole (F006a)', () => {
  let service: AccountsService;
  let userRepository: {
    findOne: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    createQueryBuilder: ReturnType<typeof vi.fn>;
  };
  let dataSource: {
    transaction: ReturnType<typeof vi.fn>;
  };
  let mgr: {
    findOne: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
  };

  const adminId = 'admin-uuid';
  const targetId = 'target-user-uuid';

  const baseUser = {
    id: targetId,
    name: 'Target User',
    email: 'target@example.com',
    role: 'user' as const,
    status: 'active' as const,
    business_role: null,
    created_at: new Date('2025-01-01'),
    updated_at: new Date('2025-01-01'),
  };

  beforeEach(async () => {
    mgr = {
      findOne: vi.fn(),
      update: vi.fn().mockResolvedValue(undefined),
      insert: vi.fn().mockResolvedValue(undefined),
    };

    userRepository = {
      findOne: vi.fn(),
      save: vi.fn((entity: any) => Promise.resolve(entity)),
      create: vi.fn(),
      count: vi.fn(),
      createQueryBuilder: vi.fn(),
    };

    dataSource = {
      transaction: vi.fn().mockImplementation(async (cb: any) => cb(mgr)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountsService,
        { provide: getRepositoryToken(User), useValue: userRepository },
        { provide: getDataSourceToken(), useValue: dataSource },
      ],
    }).compile();

    service = module.get<AccountsService>(AccountsService);
  });

  // ---------- 基礎指派 ----------

  it('TC-MERGED-001 指派 director（NULL → director）', async () => {
    mgr.findOne.mockResolvedValueOnce({ ...baseUser, business_role: null });

    const result = await service.updateBusinessRole(targetId, 'director', adminId);

    expect(result.business_role).toBe('director');
    expect(mgr.update).toHaveBeenCalled();
    const updateCall = mgr.update.mock.calls[0];
    expect(updateCall[2]).toMatchObject({ business_role: 'director' });
  });

  it('TC-MERGED-002 指派 section_chief', async () => {
    mgr.findOne.mockResolvedValueOnce({ ...baseUser, business_role: null });

    const result = await service.updateBusinessRole(targetId, 'section_chief', adminId);

    expect(result.business_role).toBe('section_chief');
  });

  // ---------- 撤銷 ----------

  it('TC-MERGED-003 撤銷（director → null，action = REVOKE_ROLE）', async () => {
    mgr.findOne.mockResolvedValueOnce({ ...baseUser, business_role: 'director' });

    const result = await service.updateBusinessRole(targetId, null, adminId);

    expect(result.business_role).toBeNull();
    const insertCall = mgr.insert.mock.calls[0];
    expect(insertCall[0]).toBe(AssignmentAuditLog);
    expect(insertCall[1]).toMatchObject({
      action: 'REVOKE_ROLE',
      entity_type: 'business_role',
      actor_id: adminId,
    });
  });

  it('TC-MERGED-004 覆寫 director → section_chief，audit before/after 正確', async () => {
    mgr.findOne.mockResolvedValueOnce({ ...baseUser, business_role: 'director' });

    await service.updateBusinessRole(targetId, 'section_chief', adminId);

    const insertCall = mgr.insert.mock.calls[0];
    expect(insertCall[1]).toMatchObject({
      action: 'ASSIGN_ROLE',
      entity_type: 'business_role',
      before_value: { business_role: 'director' },
      after_value: { business_role: 'section_chief' },
    });
  });

  // ---------- 不存在 ----------

  it('TC-MERGED-005 目標帳號不存在回 ACCOUNT_NOT_FOUND', async () => {
    mgr.findOne.mockResolvedValueOnce(null);

    await expect(
      service.updateBusinessRole('non-existent', 'director', adminId),
    ).rejects.toThrow(NotFoundException);
  });

  // ---------- Token revoke 機制 ----------

  it('TC-MERGED-006 寫入 password_changed_at = Date.now() + 1000 ms', async () => {
    mgr.findOne.mockResolvedValueOnce({ ...baseUser, business_role: null });

    const before = Date.now();
    await service.updateBusinessRole(targetId, 'director', adminId);
    const after = Date.now();

    const updateCall = mgr.update.mock.calls[0];
    const patch = updateCall[2];
    expect(patch.password_changed_at).toBeInstanceOf(Date);
    const ts = (patch.password_changed_at as Date).getTime();
    // 容忍 1ms 邊界（避免 setTimer 邊界）
    expect(ts).toBeGreaterThanOrEqual(before + 1000 - 5);
    expect(ts).toBeLessThanOrEqual(after + 1000 + 5);
  });

  // ---------- Audit 寫入 ----------

  it('TC-MERGED-007 audit log entity_id 含 {userId}|{newRole} 後綴', async () => {
    mgr.findOne.mockResolvedValueOnce({ ...baseUser, business_role: null });

    await service.updateBusinessRole(targetId, 'director', adminId);

    const insertCall = mgr.insert.mock.calls[0];
    expect(insertCall[1]).toMatchObject({
      action: 'ASSIGN_ROLE',
      entity_type: 'business_role',
      entity_id: `${targetId}|director`,
      actor_id: adminId,
      before_value: { business_role: null },
      after_value: { business_role: 'director' },
    });
  });

  // ---------- Transaction ----------

  it('TC-MERGED-008 同 transaction（DataSource.transaction 被呼叫一次）', async () => {
    mgr.findOne.mockResolvedValueOnce({ ...baseUser, business_role: null });

    await service.updateBusinessRole(targetId, 'director', adminId);

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
  });

  // ---------- BR-7 Admin 不阻擋 ----------

  it('TC-MERGED-009 Admin 帳號可寫入 business_role（BR-7：不阻擋）', async () => {
    mgr.findOne.mockResolvedValueOnce({ ...baseUser, role: 'admin', business_role: null });

    const result = await service.updateBusinessRole(targetId, 'director', adminId);

    expect(result.business_role).toBe('director');
  });

  // ---------- 撤銷 entity_id ----------

  it('TC-MERGED-010 撤銷時 audit entity_id 後綴使用 oldRole', async () => {
    mgr.findOne.mockResolvedValueOnce({ ...baseUser, business_role: 'director' });

    await service.updateBusinessRole(targetId, null, adminId);

    const insertCall = mgr.insert.mock.calls[0];
    expect(insertCall[1].entity_id).toBe(`${targetId}|director`);
  });
});
