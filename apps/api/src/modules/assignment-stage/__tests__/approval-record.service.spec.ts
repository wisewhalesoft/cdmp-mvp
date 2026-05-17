/**
 * F087 v1.1 BR-11 + F082 v1.1 §7.x latestRejection 觸發機制
 *
 * 涵蓋：
 *   - F087 rejectToPersonnelRatio 寫入 assignment_approval（action='reject' + reject_reason）
 *   - F082 getPersonnelRatios response.latestRejection 從 assignment_approval 查最新 reject
 *
 * TC：
 *   - TC-APPROVAL-RECORD-001：reject 後 assignment_approval 寫入一筆 action='reject' + reject_reason
 *   - TC-APPROVAL-RECORD-002：approver_id / approver_role 正確填入
 *   - TC-LATEST-REJECTION-001：F082 GET 含 latestRejection（最近一筆 reject）
 *   - TC-LATEST-REJECTION-002：最近一筆為 approve → latestRejection = null
 *   - TC-LATEST-REJECTION-003：多筆 reject 取最新一筆（依 approved_at DESC）
 *   - TC-LATEST-REJECTION-004：無任何簽核 → latestRejection = null
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { StageActionService } from '../stage-action.service';
import { PersonnelRatioService } from '../personnel-ratio.service';
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

const YM = '202605';

interface Env {
  stageActionService: StageActionService;
  personnelRatioService: PersonnelRatioService;
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
      PersonnelRatioService,
      StageTransitionService,
      RatioValidationService,
      PersonnelRatioValidationService,
      {
        provide: AssignmentRunGuardService,
        useValue: { assertNoRunningRun: vi.fn().mockResolvedValue(undefined) },
      },
    ],
  }).compile();
  await app.init();
  return {
    stageActionService: app.get(StageActionService),
    personnelRatioService: app.get(PersonnelRatioService),
    listRepo: app.get(getRepositoryToken(ObListDefinition)),
    approvalRepo: app.get(getRepositoryToken(AssignmentApproval)),
    app,
  };
}

async function seedApprovalList(repo: Repository<ObListDefinition>): Promise<ObListDefinition> {
  const now = new Date();
  return repo.save(
    repo.create({
      list_no: 'OB202605001',
      list_nm: 'T',
      prod_kind: '01',
      prod_best: '',
      spec_tp: 'A',
      list_type: '01',
      list_period_start: '1',
      list_period_end: '12',
      list_interval: '1',
      project_workym: YM,
      settle_src: 'Y',
      card_type: 'M5',
      case_status: '01',
      cr_enabled: false,
      status: 'active',
      stage: 'approval',
      created_by_prog: 'TEST',
      created_by: 'u1',
      created_at: now,
      updated_by_prog: 'TEST',
      updated_by: 'u1',
      updated_at: now,
    } as Partial<ObListDefinition>),
  );
}

const ACTOR_DIRECTOR = {
  userId: 'dir-001',
  role: 'user',
  businessRole: 'director',
  ipAddress: '127.0.0.1',
};

describe('F087 + F082 — latestRejection 觸發機制 (assignment_approval 表)', () => {
  let env: Env;

  beforeAll(async () => {
    env = await buildModule();
  });
  afterAll(async () => {
    await env.app.close();
  });
  beforeEach(async () => {
    await env.approvalRepo.createQueryBuilder().delete().execute();
    await env.listRepo.createQueryBuilder().delete().execute();
  });

  describe('TC-APPROVAL-RECORD：reject 後寫入 assignment_approval', () => {
    it('TC-APPROVAL-RECORD-001：reject 寫入一筆 action=reject + reject_reason', async () => {
      await seedApprovalList(env.listRepo);
      await env.stageActionService.rejectToPersonnelRatio(
        'OB202605001',
        '部門 D01 比例需調整為 60%',
        ACTOR_DIRECTOR,
        YM,
      );
      const records = await env.approvalRepo.find({ where: { list_no: 'OB202605001' } });
      expect(records.length).toBe(1);
      expect(records[0]).toMatchObject({
        action: 'reject',
        reject_reason: '部門 D01 比例需調整為 60%',
        approver_id: 'dir-001',
      });
    });

    it('TC-APPROVAL-RECORD-002：approver_role 正確填入', async () => {
      await seedApprovalList(env.listRepo);
      await env.stageActionService.rejectToPersonnelRatio(
        'OB202605001',
        '需重新檢視',
        ACTOR_DIRECTOR,
        YM,
      );
      const r = await env.approvalRepo.findOne({ where: { list_no: 'OB202605001' } });
      expect(r?.approver_role).toBe('director');
    });
  });

  describe('TC-LATEST-REJECTION：F082 GET 含 latestRejection', () => {
    async function seedListAtPersonnelStage(): Promise<void> {
      const now = new Date();
      await env.listRepo.save(
        env.listRepo.create({
          list_no: 'OB202605002',
          list_nm: 'T2',
          prod_kind: '01',
          prod_best: '',
          spec_tp: 'A',
          list_type: '01',
          list_period_start: '1',
          list_period_end: '12',
          list_interval: '1',
          project_workym: YM,
          settle_src: 'Y',
          card_type: 'M5',
          case_status: '01',
          cr_enabled: false,
          status: 'active',
          stage: 'personnel_ratio',
          created_by_prog: 'TEST',
          created_by: 'u1',
          created_at: now,
          updated_by_prog: 'TEST',
          updated_by: 'u1',
          updated_at: now,
        } as Partial<ObListDefinition>),
      );
    }

    it('TC-LATEST-REJECTION-001：F082 GET 含最近一筆 reject', async () => {
      await seedListAtPersonnelStage();
      // 寫入一筆 reject 紀錄
      await env.approvalRepo.save(
        env.approvalRepo.create({
          list_no: 'OB202605002',
          action: 'reject',
          reject_reason: '比例不合理',
          approver_id: 'dir-001',
          approver_name: 'Director One',
          approver_role: 'director',
          approved_at: new Date('2026-05-15T10:00:00Z'),
          created_at: new Date('2026-05-15T10:00:00Z'),
        } as Partial<AssignmentApproval>),
      );

      const res = await env.personnelRatioService.getPersonnelRatios(
        'OB202605002',
        null,
        ACTOR_DIRECTOR,
      );
      expect(res.latestRejection).toMatchObject({
        rejectReason: '比例不合理',
        rejectorRole: 'director',
      });
      expect((res.latestRejection as any).rejectedAt).toBeTruthy();
    });

    it('TC-LATEST-REJECTION-002：最近一筆為 approve → latestRejection = null', async () => {
      await seedListAtPersonnelStage();
      await env.approvalRepo.save([
        env.approvalRepo.create({
          list_no: 'OB202605002',
          action: 'reject',
          reject_reason: '比例不合理',
          approver_id: 'dir-001',
          approver_name: 'Director One',
          approver_role: 'director',
          approved_at: new Date('2026-05-15T10:00:00Z'),
          created_at: new Date('2026-05-15T10:00:00Z'),
        } as Partial<AssignmentApproval>),
        env.approvalRepo.create({
          list_no: 'OB202605002',
          action: 'approve',
          reject_reason: null,
          approver_id: 'dir-001',
          approver_name: 'Director One',
          approver_role: 'director',
          approved_at: new Date('2026-05-15T11:00:00Z'),
          created_at: new Date('2026-05-15T11:00:00Z'),
        } as Partial<AssignmentApproval>),
      ]);

      const res = await env.personnelRatioService.getPersonnelRatios(
        'OB202605002',
        null,
        ACTOR_DIRECTOR,
      );
      expect(res.latestRejection).toBeNull();
    });

    it('TC-LATEST-REJECTION-003：多筆 reject 取最新一筆（依 approved_at DESC）', async () => {
      await seedListAtPersonnelStage();
      await env.approvalRepo.save([
        env.approvalRepo.create({
          list_no: 'OB202605002',
          action: 'reject',
          reject_reason: '舊原因',
          approver_id: 'dir-001',
          approver_role: 'director',
          approved_at: new Date('2026-05-10T10:00:00Z'),
          created_at: new Date('2026-05-10T10:00:00Z'),
        } as Partial<AssignmentApproval>),
        env.approvalRepo.create({
          list_no: 'OB202605002',
          action: 'reject',
          reject_reason: '新原因',
          approver_id: 'dir-002',
          approver_role: 'director',
          approved_at: new Date('2026-05-15T10:00:00Z'),
          created_at: new Date('2026-05-15T10:00:00Z'),
        } as Partial<AssignmentApproval>),
      ]);
      const res = await env.personnelRatioService.getPersonnelRatios(
        'OB202605002',
        null,
        ACTOR_DIRECTOR,
      );
      expect((res.latestRejection as any).rejectReason).toBe('新原因');
    });

    it('TC-LATEST-REJECTION-004：無任何簽核紀錄 → latestRejection = null', async () => {
      await seedListAtPersonnelStage();
      const res = await env.personnelRatioService.getPersonnelRatios(
        'OB202605002',
        null,
        ACTOR_DIRECTOR,
      );
      expect(res.latestRejection).toBeNull();
    });
  });
});
