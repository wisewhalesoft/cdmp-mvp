/**
 * AssignmentRunService — F061 月跑觸發 service unit tests
 *
 * 對應 spec：
 *   - F061 v1.2 AC-1：前置條件 → calculateReadiness → 失敗 422 ASSIGNMENT_RUN_PRECHECK_FAILED
 *   - F061 v1.2 AC-1：無 stage=ready 名單 → 422 NO_READY_LIST_FOUND
 *   - F061 v1.2 AC-2：INSERT assignment_run（status='pending', triggered_by, project_workym）
 *   - F061 v1.2 AC-2：寫入 audit log（action='RUN'）
 *   - F061 v1.2 AC-6：同月 pending/running → 409 ASSIGNMENT_RUN_ALREADY_RUNNING（由 AssignmentRunGuardService 攔截）
 *   - F062/F065：listRuns / getRunById
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AssignmentRunService } from '../assignment-run.service';
import { AssignmentRunGuardService } from '../assignment-run-guard.service';
import { MonthlyRunReadinessService } from '../monthly-run-readiness.service';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { ObListDefinition } from '@/database/entities/ob-list-definition.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';
import { ObLevelcardVersion } from '@/database/entities/ob-levelcard-version.entity';
import { EtlPipelineLog } from '@/database/entities/etl-pipeline-log.entity';
import { EtlPipeline } from '@/database/entities/etl-pipeline.entity';
import { EtlPipelineVersion } from '@/database/entities/etl-pipeline-version.entity';
import { User } from '@/database/entities/user.entity';
import { ERROR_CODES } from '@/common/errors/error-codes';

const YM = '202605';
const ACTOR_ID = 'a1b2c3d4-e5f6-7890-abcd-ef0123456789';

async function buildModule(): Promise<{
  service: AssignmentRunService;
  runRepo: Repository<AssignmentRun>;
  listRepo: Repository<ObListDefinition>;
  auditRepo: Repository<AssignmentAuditLog>;
  userRepo: Repository<User>;
  ds: DataSource;
  app: TestingModule;
}> {
  const app: TestingModule = await Test.createTestingModule({
    imports: [
      TypeOrmModule.forRoot({
        type: 'better-sqlite3',
        database: ':memory:',
        entities: [
          AssignmentRun,
          ObListDefinition,
          AssignmentAuditLog,
          ObLevelcardVersion,
          EtlPipelineLog,
          EtlPipeline,
          EtlPipelineVersion,
          User,
        ],
        synchronize: true,
      }),
      TypeOrmModule.forFeature([
        AssignmentRun,
        ObListDefinition,
        AssignmentAuditLog,
        ObLevelcardVersion,
        EtlPipelineLog,
        EtlPipeline,
        EtlPipelineVersion,
        User,
      ]),
    ],
    providers: [
      AssignmentRunService,
      AssignmentRunGuardService,
      MonthlyRunReadinessService,
    ],
  }).compile();

  await app.init();

  return {
    service: app.get(AssignmentRunService),
    runRepo: app.get(getRepositoryToken(AssignmentRun)),
    listRepo: app.get(getRepositoryToken(ObListDefinition)),
    auditRepo: app.get(getRepositoryToken(AssignmentAuditLog)),
    userRepo: app.get(getRepositoryToken(User)),
    ds: app.get(DataSource),
    app,
  };
}

async function seedList(
  listRepo: Repository<ObListDefinition>,
  listNo: string,
  stage: ObListDefinition['stage'],
  status: 'active' | 'inactive' = 'active',
): Promise<void> {
  const now = new Date();
  await listRepo.save(
    listRepo.create({
      list_no: listNo,
      list_nm: '測試名單',
      prod_kind: 'A',
      prod_best: 'Y',
      list_type: '01',
      list_period_start: '001',
      list_period_end: '030',
      list_interval: '030',
      project_workym: YM,
      caseyear: '113',
      settle_src: '01',
      card_type: 'T1',
      case_status: '01$$02',
      cr_enabled: false,
      status,
      stage,
      created_by_prog: 'TEST',
      created_by: 'tester',
      created_at: now,
      updated_by_prog: 'TEST',
      updated_by: 'tester',
      updated_at: now,
    } as Partial<ObListDefinition>),
  );
}

describe('AssignmentRunService', () => {
  let env: Awaited<ReturnType<typeof buildModule>>;

  beforeAll(async () => {
    env = await buildModule();
  });

  afterAll(async () => {
    await env.app.close();
  });

  beforeEach(async () => {
    // 依 FK 順序清空（無 FK 但避免殘料）
    await env.ds.query('DELETE FROM assignment_audit_log');
    await env.ds.query('DELETE FROM assignment_run');
    await env.ds.query('DELETE FROM ob_list_definition');
  });

  describe('triggerRun', () => {
    it('AC-2：所有名單 stage=ready → 建立 pending 月跑並寫 audit log', async () => {
      await seedList(env.listRepo, 'OB202605001', 'ready');
      await seedList(env.listRepo, 'OB202605002', 'ready');

      const res = await env.service.triggerRun(YM, ACTOR_ID);

      expect(res.runId).toBeDefined();
      expect(res.status).toBe('pending');
      expect(res.projectWorkym).toBe(YM);
      expect(res.triggeredAt).toBeInstanceOf(Date);

      // DB 紀錄
      const row = await env.runRepo.findOne({ where: { run_id: res.runId } });
      expect(row).toBeTruthy();
      expect(row?.status).toBe('pending');
      expect(row?.triggered_by).toBe(ACTOR_ID);
      expect(row?.project_workym).toBe(YM);

      // audit log action='RUN'
      const auditRows = await env.auditRepo.find({
        where: { entity_id: res.runId },
      });
      expect(auditRows).toHaveLength(1);
      expect(auditRows[0].action).toBe('RUN');
      expect(auditRows[0].actor_id).toBe(ACTOR_ID);
    });

    it('AC-1：無 stage=ready 名單 → 422 NO_READY_LIST_FOUND', async () => {
      // 只有 draft，無 ready
      await seedList(env.listRepo, 'OB202605001', 'draft');

      await expect(env.service.triggerRun(YM, ACTOR_ID)).rejects.toThrow(
        UnprocessableEntityException,
      );
      try {
        await env.service.triggerRun(YM, ACTOR_ID);
      } catch (e: any) {
        expect(e.response.error).toBe(ERROR_CODES.NO_READY_LIST_FOUND);
      }
    });

    it('AC-1：部分名單未 ready → 422 ASSIGNMENT_RUN_PRECHECK_FAILED + details', async () => {
      await seedList(env.listRepo, 'OB202605001', 'ready');
      await seedList(env.listRepo, 'OB202605002', 'personnel_ratio');

      try {
        await env.service.triggerRun(YM, ACTOR_ID);
        throw new Error('should have thrown');
      } catch (e: any) {
        expect(e).toBeInstanceOf(UnprocessableEntityException);
        expect(e.response.error).toBe(ERROR_CODES.ASSIGNMENT_RUN_PRECHECK_FAILED);
        // 失敗清單回傳細節
        expect(Array.isArray(e.response.details)).toBe(true);
        expect(e.response.details.length).toBeGreaterThan(0);
      }
    });

    it('AC-6：同月已有 pending/running → 409 ASSIGNMENT_RUN_ALREADY_RUNNING', async () => {
      await seedList(env.listRepo, 'OB202605001', 'ready');
      // 預先植入 running run
      await env.runRepo.save(
        env.runRepo.create({
          project_workym: YM,
          status: 'running',
          triggered_by: ACTOR_ID,
          created_at: new Date(),
        } as Partial<AssignmentRun>),
      );

      await expect(env.service.triggerRun(YM, ACTOR_ID)).rejects.toThrow(
        ConflictException,
      );
      try {
        await env.service.triggerRun(YM, ACTOR_ID);
      } catch (e: any) {
        expect(e.response.error).toBe(ERROR_CODES.ASSIGNMENT_RUN_ALREADY_RUNNING);
      }
    });

    it('AC-7：上月已有 completed run，本月可重新觸發產生新 run_id', async () => {
      await seedList(env.listRepo, 'OB202605001', 'ready');
      // 已 completed 不應阻擋
      await env.runRepo.save(
        env.runRepo.create({
          project_workym: YM,
          status: 'completed',
          triggered_by: ACTOR_ID,
          created_at: new Date('2026-04-30'),
        } as Partial<AssignmentRun>),
      );

      const res = await env.service.triggerRun(YM, ACTOR_ID);
      expect(res.runId).toBeDefined();
      expect(res.status).toBe('pending');

      // 確認新舊 run 並存
      const all = await env.runRepo.find({ where: { project_workym: YM } });
      expect(all).toHaveLength(2);
    });
  });

  describe('listRuns + getRunById（F062 / F065）', () => {
    it('listRuns：依 created_at DESC 排序回傳所有 runs', async () => {
      await env.runRepo.save([
        env.runRepo.create({
          project_workym: YM,
          status: 'completed',
          triggered_by: ACTOR_ID,
          created_at: new Date('2026-04-01'),
        } as Partial<AssignmentRun>),
        env.runRepo.create({
          project_workym: YM,
          status: 'pending',
          triggered_by: ACTOR_ID,
          created_at: new Date('2026-05-01'),
        } as Partial<AssignmentRun>),
      ]);

      const rows = await env.service.listRuns({ ym: YM });
      expect(rows).toHaveLength(2);
      expect(rows[0].status).toBe('pending'); // 較新的在前
    });

    // F065 BR-5：triggered_by(UUID) → users.name 解析為 triggeredByName
    it('listRuns：以 triggered_by(UUID) join users.name 回傳 triggeredByName', async () => {
      const user = await env.userRepo.save(
        env.userRepo.create({
          name: '王部長',
          email: 'director-f065@cdmp.test',
          password_hash: 'x',
          role: 'user',
        } as Partial<User>),
      );
      const saved = await env.runRepo.save(
        env.runRepo.create({
          project_workym: YM,
          status: 'completed',
          triggered_by: user.id,
          created_at: new Date('2026-06-01'),
        } as Partial<AssignmentRun>),
      );

      const rows = await env.service.listRuns({ ym: YM });
      const row = rows.find((r) => r.runId === saved.run_id);
      expect(row).toBeDefined();
      expect(row?.triggeredBy).toBe(user.id); // 原 UUID 保留
      expect(row?.triggeredByName).toBe('王部長'); // 解析後名稱
    });

    // F065 BR-5：查無對應 user → triggeredByName = null（graceful）
    it('listRuns：triggered_by 無對應 user → triggeredByName=null', async () => {
      const saved = await env.runRepo.save(
        env.runRepo.create({
          project_workym: YM,
          status: 'completed',
          triggered_by: '00000000-0000-0000-0000-0000000000aa',
          created_at: new Date('2026-06-02'),
        } as Partial<AssignmentRun>),
      );

      const rows = await env.service.listRuns({ ym: YM });
      const row = rows.find((r) => r.runId === saved.run_id);
      expect(row?.triggeredByName ?? null).toBeNull();
    });

    it('getRunById：找不到 → 404 ASSIGNMENT_RUN_NOT_FOUND', async () => {
      await expect(
        env.service.getRunById('00000000-0000-0000-0000-000000000000'),
      ).rejects.toThrow(NotFoundException);
    });

    it('getRunById：回傳 run record + projectWorkym / triggeredAt', async () => {
      const saved = await env.runRepo.save(
        env.runRepo.create({
          project_workym: YM,
          status: 'completed',
          triggered_by: ACTOR_ID,
          created_at: new Date(),
        } as Partial<AssignmentRun>),
      );
      const res = await env.service.getRunById(saved.run_id);
      expect(res.runId).toBe(saved.run_id);
      expect(res.status).toBe('completed');
      expect(res.projectWorkym).toBe(YM);
    });

    // F062：getRunById 亦應 join users.name → triggeredByName（與 listRuns 一致）。
    // 進度頁「觸發者」欄需顯示名稱而非 UUID；「總筆數」讀 totalCases。
    it('getRunById：以 triggered_by(UUID) join users.name 回傳 triggeredByName', async () => {
      const user = await env.userRepo.save(
        env.userRepo.create({
          name: '李處長',
          email: 'chief-f062@cdmp.test',
          password_hash: 'x',
          role: 'user',
        } as Partial<User>),
      );
      const saved = await env.runRepo.save(
        env.runRepo.create({
          project_workym: YM,
          status: 'completed',
          triggered_by: user.id,
          total_cases: 9500,
          created_at: new Date(),
        } as Partial<AssignmentRun>),
      );
      const res = await env.service.getRunById(saved.run_id);
      expect(res.triggeredBy).toBe(user.id); // 原 UUID 保留
      expect(res.triggeredByName).toBe('李處長'); // 解析後名稱
      expect(res.totalCases).toBe(9500);
    });

    it('getRunById：triggered_by 無對應 user → triggeredByName=null（graceful）', async () => {
      const saved = await env.runRepo.save(
        env.runRepo.create({
          project_workym: YM,
          status: 'completed',
          triggered_by: '00000000-0000-0000-0000-0000000000ff',
          created_at: new Date(),
        } as Partial<AssignmentRun>),
      );
      const res = await env.service.getRunById(saved.run_id);
      expect(res.triggeredByName ?? null).toBeNull();
    });

    // F062 方案 1：getRunById 依 status + total_cases 合成 stages / totals，
    // 供進度頁 stepper + 進度條 + 「X/Y 筆」渲染（原本恆缺 → 畫面卡 0%/全 pending）。
    describe('getRunById：合成進度視圖（stages / totals）', () => {
      it('completed → 5 階段全 completed、100%、processed = total = total_cases', async () => {
        const saved = await env.runRepo.save(
          env.runRepo.create({
            project_workym: YM,
            status: 'completed',
            triggered_by: ACTOR_ID,
            total_cases: 9500,
            created_at: new Date(),
          } as Partial<AssignmentRun>),
        );
        const res = await env.service.getRunById(saved.run_id);
        expect(res.stages).toHaveLength(5);
        expect(res.stages?.map((s) => s.name)).toEqual([
          'Stage 0',
          'Stage 1',
          'Stage 2',
          'Stage 3',
          'Stage 4',
        ]);
        expect(res.stages?.every((s) => s.status === 'completed')).toBe(true);
        expect(res.stages?.every((s) => s.progressPercent === 100)).toBe(true);
        expect(res.totals).toEqual({
          processedCount: 9500,
          totalCount: 9500,
          progressPercent: 100,
        });
      });

      it('pending → 5 階段全 pending、0%、total = 0（total_cases 尚未寫入）', async () => {
        const saved = await env.runRepo.save(
          env.runRepo.create({
            project_workym: YM,
            status: 'pending',
            triggered_by: ACTOR_ID,
            created_at: new Date(),
          } as Partial<AssignmentRun>),
        );
        const res = await env.service.getRunById(saved.run_id);
        expect(res.stages?.every((s) => s.status === 'pending')).toBe(true);
        expect(res.totals).toEqual({
          processedCount: 0,
          totalCount: 0,
          progressPercent: 0,
        });
      });

      it('running → 5 階段全 running、0%', async () => {
        const saved = await env.runRepo.save(
          env.runRepo.create({
            project_workym: YM,
            status: 'running',
            triggered_by: ACTOR_ID,
            created_at: new Date(),
          } as Partial<AssignmentRun>),
        );
        const res = await env.service.getRunById(saved.run_id);
        expect(res.stages?.every((s) => s.status === 'running')).toBe(true);
        expect(res.totals?.progressPercent).toBe(0);
      });

      it('failed → 5 階段全 failed、0%', async () => {
        const saved = await env.runRepo.save(
          env.runRepo.create({
            project_workym: YM,
            status: 'failed',
            triggered_by: ACTOR_ID,
            error_message: '使用者取消',
            created_at: new Date(),
          } as Partial<AssignmentRun>),
        );
        const res = await env.service.getRunById(saved.run_id);
        expect(res.stages?.every((s) => s.status === 'failed')).toBe(true);
        expect(res.totals?.progressPercent).toBe(0);
      });
    });
  });

  describe('cancelRun (F062 Phase 2)', () => {
    it('pending run 可 cancel → status="failed" + errorMessage="使用者取消"', async () => {
      const saved = await env.runRepo.save(
        env.runRepo.create({
          project_workym: YM,
          status: 'pending',
          triggered_by: ACTOR_ID,
          created_at: new Date(),
        } as Partial<AssignmentRun>),
      );
      const res = await env.service.cancelRun(saved.run_id, ACTOR_ID);
      expect(res.status).toBe('failed');
      expect(res.errorMessage).toBe('使用者取消');
      const reloaded = await env.runRepo.findOne({
        where: { run_id: saved.run_id },
      });
      expect(reloaded?.status).toBe('failed');
      expect(reloaded?.error_message).toBe('使用者取消');
    });

    it('running run 可 cancel', async () => {
      const saved = await env.runRepo.save(
        env.runRepo.create({
          project_workym: YM,
          status: 'running',
          triggered_by: ACTOR_ID,
          created_at: new Date(),
        } as Partial<AssignmentRun>),
      );
      const res = await env.service.cancelRun(saved.run_id, ACTOR_ID);
      expect(res.status).toBe('failed');
    });

    it('completed run 不可 cancel → 422 ASSIGNMENT_RUN_NOT_CANCELLABLE', async () => {
      const saved = await env.runRepo.save(
        env.runRepo.create({
          project_workym: YM,
          status: 'completed',
          triggered_by: ACTOR_ID,
          created_at: new Date(),
        } as Partial<AssignmentRun>),
      );
      await expect(
        env.service.cancelRun(saved.run_id, ACTOR_ID),
      ).rejects.toMatchObject({
        response: { error: ERROR_CODES.ASSIGNMENT_RUN_NOT_CANCELLABLE },
      });
    });

    it('failed run 不可重複 cancel → 422 ASSIGNMENT_RUN_NOT_CANCELLABLE', async () => {
      const saved = await env.runRepo.save(
        env.runRepo.create({
          project_workym: YM,
          status: 'failed',
          triggered_by: ACTOR_ID,
          created_at: new Date(),
        } as Partial<AssignmentRun>),
      );
      await expect(
        env.service.cancelRun(saved.run_id, ACTOR_ID),
      ).rejects.toMatchObject({
        response: { error: ERROR_CODES.ASSIGNMENT_RUN_NOT_CANCELLABLE },
      });
    });

    it('runId 不存在 → 404 ASSIGNMENT_RUN_NOT_FOUND', async () => {
      await expect(
        env.service.cancelRun(
          '00000000-0000-0000-0000-000000000000',
          ACTOR_ID,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('cancel 後寫入 audit log（action="CANCEL"）', async () => {
      const saved = await env.runRepo.save(
        env.runRepo.create({
          project_workym: YM,
          status: 'pending',
          triggered_by: ACTOR_ID,
          created_at: new Date(),
        } as Partial<AssignmentRun>),
      );
      await env.service.cancelRun(saved.run_id, ACTOR_ID);
      const auditRows = await env.auditRepo.find({
        where: { entity_id: saved.run_id, action: 'CANCEL' },
      });
      expect(auditRows).toHaveLength(1);
      expect(auditRows[0].actor_id).toBe(ACTOR_ID);
    });
  });
});
