/**
 * F087 v1.2 P1 — getApprovalHistory（簽核歷史完整時間軸）
 *
 * 涵蓋：
 *   - StageActionService.getApprovalHistory(listNo) → 回傳所有 assignment_approval 紀錄
 *   - 排序：approved_at DESC（最新在前）
 *
 * TC：
 *   - TC-APPROVAL-HISTORY-001：無紀錄 → 回傳空陣列
 *   - TC-APPROVAL-HISTORY-002：單筆 approve → 回傳 1 筆紀錄
 *   - TC-APPROVAL-HISTORY-003：多筆紀錄 → 依 approved_at DESC 排序
 *   - TC-APPROVAL-HISTORY-004：reject 紀錄包含 rejectReason
 *   - TC-APPROVAL-HISTORY-005：approve 紀錄 rejectReason = null
 *   - TC-APPROVAL-HISTORY-006：欄位完整（approverName、approverRole）
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { StageActionService } from '../stage-action.service';
import { Stage0EstimateService } from '@/modules/assignment-list/stage0-estimate.service';
import { ObListDefinition } from '@/database/entities/ob-list-definition.entity';
import { ObDeptPct } from '@/database/entities/ob-dept-pct.entity';
import { ObEmplSet } from '@/database/entities/ob-empl-set.entity';
import { ObEmphire } from '@/database/entities/ob-emphire.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';
import { AssignmentApproval } from '@/database/entities/assignment-approval.entity';
import { AssignmentRunGuardService } from '@/modules/assignment/services/assignment-run-guard.service';
import { StageTransitionService } from '@/modules/assignment/services/stage-transition.service';
import { RatioValidationService } from '@/modules/assignment/services/ratio-validation.service';
import { PersonnelRatioValidationService } from '@/modules/assignment/services/personnel-ratio-validation.service';

const LIST_NO = 'OB202605010';

interface Env {
  stageActionService: StageActionService;
  listRepo: Repository<ObListDefinition>;
  approvalRepo: Repository<AssignmentApproval>;
  app: TestingModule;
}

async function buildModule(): Promise<Env> {
  const app: TestingModule = await Test.createTestingModule({
    imports: [
      TypeOrmModule.forRoot({
        type: 'better-sqlite3',
        database: ':memory:',
        entities: [
          ObListDefinition,
          ObDeptPct,
          ObEmplSet,
          ObEmphire,
          AssignmentAuditLog,
          AssignmentApproval,
        ],
        synchronize: true,
      }),
      TypeOrmModule.forFeature([
        ObListDefinition,
        ObDeptPct,
        ObEmplSet,
        ObEmphire,
        AssignmentAuditLog,
        AssignmentApproval,
      ]),
    ],
    providers: [
      StageActionService,
      StageTransitionService,
      RatioValidationService,
      PersonnelRatioValidationService,
      {
        provide: AssignmentRunGuardService,
        useValue: { assertNoRunningRun: vi.fn().mockResolvedValue(undefined) },
      },
      {
        provide: Stage0EstimateService,
        useValue: { estimateListCount: vi.fn().mockResolvedValue({ count: 0 }) },
      },
    ],
  }).compile();
  await app.init();
  return {
    stageActionService: app.get(StageActionService),
    listRepo: app.get(getRepositoryToken(ObListDefinition)),
    approvalRepo: app.get(getRepositoryToken(AssignmentApproval)),
    app,
  };
}

async function seedList(repo: Repository<ObListDefinition>): Promise<void> {
  const now = new Date();
  await repo.save(
    repo.create({
      list_no: LIST_NO,
      list_nm: 'T',
      prod_kind: '01',
      prod_best: '',
      spec_tp: 'A',
      list_type: '01',
      list_period_start: '1',
      list_period_end: '12',
      list_interval: '1',
      project_workym: '202605',
      settle_src: 'Y',
      card_type: 'M5',
      case_status: '01',
      cr_enabled: false,
      status: 'active',
      stage: 'ready',
      created_by_prog: 'TEST',
      created_by: 'u1',
      created_at: now,
      updated_by_prog: 'TEST',
      updated_by: 'u1',
      updated_at: now,
    } as Partial<ObListDefinition>),
  );
}

describe('F087 v1.2 — getApprovalHistory (簽核歷史時間軸)', () => {
  let env: Env;

  beforeAll(async () => {
    env = await buildModule();
  });
  afterAll(async () => {
    if (env?.app) await env.app.close();
  });
  beforeEach(async () => {
    await env.approvalRepo.createQueryBuilder().delete().execute();
    await env.listRepo.createQueryBuilder().delete().execute();
    await seedList(env.listRepo);
  });

  it('TC-APPROVAL-HISTORY-001：無紀錄 → 回傳空陣列', async () => {
    const res = await env.stageActionService.getApprovalHistory(LIST_NO);
    expect(res).toEqual({ listNo: LIST_NO, history: [] });
  });

  it('TC-APPROVAL-HISTORY-002：單筆 approve → 回傳 1 筆紀錄', async () => {
    await env.approvalRepo.save(
      env.approvalRepo.create({
        list_no: LIST_NO,
        action: 'approve',
        reject_reason: null,
        approver_id: 'dir-001',
        approver_name: 'Director One',
        approver_role: 'director',
        approved_at: new Date('2026-05-14T18:05:00Z'),
        created_at: new Date('2026-05-14T18:05:00Z'),
      } as Partial<AssignmentApproval>),
    );

    const res = await env.stageActionService.getApprovalHistory(LIST_NO);
    expect(res.listNo).toBe(LIST_NO);
    expect(res.history.length).toBe(1);
    expect(res.history[0]).toMatchObject({
      action: 'approve',
      rejectReason: null,
      approverName: 'Director One',
      approverRole: 'director',
    });
  });

  it('TC-APPROVAL-HISTORY-003：多筆紀錄 → 依 approved_at DESC 排序', async () => {
    await env.approvalRepo.save([
      env.approvalRepo.create({
        list_no: LIST_NO,
        action: 'reject',
        reject_reason: '第一次拒絕',
        approver_id: 'dir-001',
        approver_role: 'director',
        approved_at: new Date('2026-05-10T10:00:00Z'),
        created_at: new Date('2026-05-10T10:00:00Z'),
      } as Partial<AssignmentApproval>),
      env.approvalRepo.create({
        list_no: LIST_NO,
        action: 'reject',
        reject_reason: '第二次拒絕',
        approver_id: 'dir-001',
        approver_role: 'director',
        approved_at: new Date('2026-05-12T10:00:00Z'),
        created_at: new Date('2026-05-12T10:00:00Z'),
      } as Partial<AssignmentApproval>),
      env.approvalRepo.create({
        list_no: LIST_NO,
        action: 'approve',
        reject_reason: null,
        approver_id: 'dir-001',
        approver_role: 'director',
        approved_at: new Date('2026-05-14T18:05:00Z'),
        created_at: new Date('2026-05-14T18:05:00Z'),
      } as Partial<AssignmentApproval>),
    ]);

    const res = await env.stageActionService.getApprovalHistory(LIST_NO);
    expect(res.history.length).toBe(3);
    expect(res.history[0].action).toBe('approve');
    expect(res.history[1].rejectReason).toBe('第二次拒絕');
    expect(res.history[2].rejectReason).toBe('第一次拒絕');
  });

  it('TC-APPROVAL-HISTORY-004：reject 紀錄包含 rejectReason', async () => {
    await env.approvalRepo.save(
      env.approvalRepo.create({
        list_no: LIST_NO,
        action: 'reject',
        reject_reason: '比例不合理',
        approver_id: 'dir-001',
        approver_role: 'director',
        approved_at: new Date('2026-05-15T10:00:00Z'),
        created_at: new Date('2026-05-15T10:00:00Z'),
      } as Partial<AssignmentApproval>),
    );

    const res = await env.stageActionService.getApprovalHistory(LIST_NO);
    expect(res.history[0].action).toBe('reject');
    expect(res.history[0].rejectReason).toBe('比例不合理');
  });

  it('TC-APPROVAL-HISTORY-005：approve 紀錄 rejectReason = null', async () => {
    await env.approvalRepo.save(
      env.approvalRepo.create({
        list_no: LIST_NO,
        action: 'approve',
        reject_reason: null,
        approver_id: 'dir-001',
        approver_role: 'director',
        approved_at: new Date('2026-05-14T18:05:00Z'),
        created_at: new Date('2026-05-14T18:05:00Z'),
      } as Partial<AssignmentApproval>),
    );
    const res = await env.stageActionService.getApprovalHistory(LIST_NO);
    expect(res.history[0].rejectReason).toBeNull();
  });

  it('TC-APPROVAL-HISTORY-006：欄位完整（approverName / approverRole / approvedAt）', async () => {
    await env.approvalRepo.save(
      env.approvalRepo.create({
        list_no: LIST_NO,
        action: 'approve',
        reject_reason: null,
        approver_id: 'dir-002',
        approver_name: '張部長',
        approver_role: 'director',
        approved_at: new Date('2026-05-14T18:05:00Z'),
        created_at: new Date('2026-05-14T18:05:00Z'),
      } as Partial<AssignmentApproval>),
    );

    const res = await env.stageActionService.getApprovalHistory(LIST_NO);
    expect(res.history[0]).toMatchObject({
      approverId: 'dir-002',
      approverName: '張部長',
      approverRole: 'director',
      action: 'approve',
      rejectReason: null,
    });
    expect(res.history[0].approvedAt).toBeTruthy();
  });

  it('TC-APPROVAL-HISTORY-007：找不到名單 → throw NotFoundException', async () => {
    await expect(
      env.stageActionService.getApprovalHistory('NOT_EXIST_LIST'),
    ).rejects.toThrow();
  });
});
