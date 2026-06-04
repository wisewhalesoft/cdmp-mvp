/**
 * F098 / AD-E07-28 P1 — triggerRun 改入列（不在 API 程序跑 pipeline）單元測試。
 *
 * 對應測試設計 §1：
 *   - TS-F098-TRIG-001：通過前置後入列 pg-boss job，runPipeline 不被呼叫，回 202 形 result
 *   - TS-F098-TRIG-002：不再 setImmediate/kickoffPipeline 跑 pipeline（advance timers 後仍 0 次）
 *   - TS-F098-TRIG-003：入列發生在 save(pending) + writeAudit 之後（順序）
 *   - TS-F098-TRIG-004：前置失敗（併發 409 / readiness 422）→ 不入列
 *   - TS-F098-TRIG-005：triggerRun 即時返回，不承載 pipeline
 *   - TS-F098-TRIG-006：send 回 jobId，但 TriggerRunResult 不暴露 jobId
 *   - TS-F098-OQ-001：入列失敗 → 不留孤兒 pending（標 failed）
 *   - TS-F098-NFR-002：triggerRun 回應結構性不承載 pipeline（runPipeline 0 次）
 *
 * Level: Unit（SQLite in-memory + spy producer / spy pipeline）。需 Postgres：否。
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AssignmentRunService } from '../../services/assignment-run.service';
import { AssignmentRunGuardService } from '../../services/assignment-run-guard.service';
import { MonthlyRunReadinessService } from '../../services/monthly-run-readiness.service';
import { AssignmentRunPipelineService } from '../../services/assignment-run-pipeline.service';
import { RunQueueProducer } from '../run-queue.producer';
import { RUN_QUEUE_NAME } from '../run-queue.constants';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { ObListDefinition } from '@/database/entities/ob-list-definition.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';
import { ObLevelcardVersion } from '@/database/entities/ob-levelcard-version.entity';
import { EtlPipelineLog } from '@/database/entities/etl-pipeline-log.entity';
import { EtlPipeline } from '@/database/entities/etl-pipeline.entity';
import { User } from '@/database/entities/user.entity';
import { ERROR_CODES } from '@/common/errors/error-codes';

const YM = '202606';
const ACTOR_ID = 'a1b2c3d4-e5f6-7890-abcd-ef0123456789';
const FAKE_JOB_ID = '11111111-2222-3333-4444-555555555555';

/** spy producer：模擬真實 pg-boss send 回傳 jobId（string），非 void（feedback_mock_real_system_contract） */
class SpyProducer {
  send = vi.fn(async (_payload: { runId: string; ym: string }) => FAKE_JOB_ID);
  cancel = vi.fn(async (_jobId: string) => undefined);
}

/** spy pipeline：斷言 runPipeline 在 triggerRun 路徑中 0 次被呼叫（I-TRIGGER-01 紅線） */
class SpyPipeline {
  runPipeline = vi.fn(async (_runId: string, _ym: string) => undefined);
}

async function buildModule(producer: SpyProducer, pipeline: SpyPipeline) {
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
        User,
      ]),
    ],
    providers: [
      AssignmentRunService,
      AssignmentRunGuardService,
      MonthlyRunReadinessService,
      { provide: RunQueueProducer, useValue: producer },
      { provide: AssignmentRunPipelineService, useValue: pipeline },
    ],
  }).compile();

  await app.init();
  return {
    app,
    service: app.get(AssignmentRunService),
    runRepo: app.get<Repository<AssignmentRun>>(getRepositoryToken(AssignmentRun)),
    listRepo: app.get<Repository<ObListDefinition>>(
      getRepositoryToken(ObListDefinition),
    ),
    auditRepo: app.get<Repository<AssignmentAuditLog>>(
      getRepositoryToken(AssignmentAuditLog),
    ),
    ds: app.get(DataSource),
  };
}

async function seedReadyList(
  listRepo: Repository<ObListDefinition>,
  listNo: string,
  stage: ObListDefinition['stage'] = 'ready',
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
      status: 'active',
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

describe('F098 triggerRun 改入列（不在 API 程序跑 pipeline）', () => {
  let env: Awaited<ReturnType<typeof buildModule>>;
  let producer: SpyProducer;
  let pipeline: SpyPipeline;

  beforeAll(async () => {
    producer = new SpyProducer();
    pipeline = new SpyPipeline();
    env = await buildModule(producer, pipeline);
  });

  afterAll(async () => {
    await env.app.close();
  });

  beforeEach(async () => {
    producer.send.mockClear();
    producer.cancel.mockClear();
    pipeline.runPipeline.mockClear();
    await env.ds.query('DELETE FROM assignment_audit_log');
    await env.ds.query('DELETE FROM assignment_run');
    await env.ds.query('DELETE FROM ob_list_definition');
  });

  it('TS-F098-TRIG-001：通過前置後入列 job，runPipeline 不被呼叫，回 202 形 result', async () => {
    await seedReadyList(env.listRepo, 'OB202606001');

    const res = await env.service.triggerRun(YM, ACTOR_ID);

    // (1) pending INSERT 仍發生
    const row = await env.runRepo.findOne({ where: { run_id: res.runId } });
    expect(row?.status).toBe('pending');

    // (2) send 恰一次，queue name + payload 正確
    expect(producer.send).toHaveBeenCalledTimes(1);
    expect(producer.send).toHaveBeenCalledWith({ runId: res.runId, ym: YM });
    // queue name 由共用常數提供
    expect(RUN_QUEUE_NAME).toBe('assignment-run');

    // (3) runPipeline 未被呼叫（I-TRIGGER-01 紅線）
    expect(pipeline.runPipeline).not.toHaveBeenCalled();

    // (4) result 形狀
    expect(res).toMatchObject({
      runId: expect.any(String),
      status: 'pending',
      projectWorkym: YM,
    });
    expect(res.triggeredAt).toBeInstanceOf(Date);
  });

  it('TS-F098-TRIG-002：advance timers / flush microtask 後 runPipeline 仍 0 次（無 setImmediate 殘留）', async () => {
    vi.useFakeTimers();
    try {
      await seedReadyList(env.listRepo, 'OB202606001');
      await env.service.triggerRun(YM, ACTOR_ID);
      // 推進所有 timer + flush microtask
      await vi.advanceTimersByTimeAsync(5000);
      await Promise.resolve();
      expect(pipeline.runPipeline).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('TS-F098-TRIG-003：入列發生在 save(pending) + writeAudit 之後（順序）', async () => {
    await seedReadyList(env.listRepo, 'OB202606001');

    const order: string[] = [];
    const saveSpy = vi
      .spyOn(env.runRepo, 'save')
      .mockImplementation(async (entity: any) => {
        order.push('save');
        // 還原真實 save 行為（產生 run_id）
        saveSpy.mockRestore();
        const saved = await env.runRepo.save(entity);
        return saved as any;
      });
    const auditSpy = vi
      .spyOn(env.auditRepo, 'save')
      .mockImplementation(async (entity: any) => {
        order.push('audit');
        return entity as any;
      });
    producer.send.mockImplementation(async () => {
      order.push('send');
      return FAKE_JOB_ID;
    });

    await env.service.triggerRun(YM, ACTOR_ID);

    expect(order).toEqual(['save', 'audit', 'send']);
    auditSpy.mockRestore();
  });

  it('TS-F098-TRIG-004：併發 409 → 不入列、不產生 pending', async () => {
    await seedReadyList(env.listRepo, 'OB202606001');
    // 預植 running run（同月）→ assertNoRunningRun 拋 409
    await env.runRepo.save(
      env.runRepo.create({
        project_workym: YM,
        status: 'running',
        triggered_by: ACTOR_ID,
        created_at: new Date(),
      } as Partial<AssignmentRun>),
    );

    await expect(env.service.triggerRun(YM, ACTOR_ID)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(producer.send).not.toHaveBeenCalled();
    // 仍只有最初植入的那筆 running，沒有新增 pending
    const all = await env.runRepo.find({ where: { project_workym: YM } });
    expect(all.filter((r) => r.status === 'pending')).toHaveLength(0);
  });

  it('TS-F098-TRIG-004b：readiness 未過 422 → 不入列', async () => {
    // 只有 draft，無 ready → NO_READY_LIST_FOUND
    await seedReadyList(env.listRepo, 'OB202606001', 'draft');
    await expect(env.service.triggerRun(YM, ACTOR_ID)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(producer.send).not.toHaveBeenCalled();
  });

  it('TS-F098-TRIG-005/NFR-002：triggerRun 即時返回，runPipeline 0 次（結構性不承載 pipeline）', async () => {
    await seedReadyList(env.listRepo, 'OB202606001');
    await env.service.triggerRun(YM, ACTOR_ID);
    // 結構性保證：send 為純入列（立即 resolve jobId），runPipeline 完全不被觸發
    expect(pipeline.runPipeline).toHaveBeenCalledTimes(0);
    expect(producer.send).toHaveResolvedWith(FAKE_JOB_ID);
  });

  it('TS-F098-TRIG-006：send 回 jobId，但 TriggerRunResult 不暴露 jobId 給前端', async () => {
    await seedReadyList(env.listRepo, 'OB202606001');
    const res = await env.service.triggerRun(YM, ACTOR_ID);
    // send 確實回傳 jobId（pg-boss contract），但 result 不含 jobId（C-3：前端只看 runId + status）
    expect(producer.send).toHaveResolvedWith(FAKE_JOB_ID);
    expect(res).not.toHaveProperty('jobId');
    expect(Object.keys(res).sort()).toEqual(
      ['projectWorkym', 'runId', 'status', 'triggeredAt'].sort(),
    );
  });

  it('TS-F098-OQ-001：入列失敗 → 不留孤兒 pending（標 failed）', async () => {
    await seedReadyList(env.listRepo, 'OB202606001');
    producer.send.mockRejectedValueOnce(new Error('DB unavailable'));

    await expect(env.service.triggerRun(YM, ACTOR_ID)).rejects.toThrow();

    // 不留 status='pending' 孤兒：該 run 已標 failed
    const all = await env.runRepo.find({ where: { project_workym: YM } });
    const pendings = all.filter((r) => r.status === 'pending');
    expect(pendings).toHaveLength(0);
    const failed = all.filter((r) => r.status === 'failed');
    expect(failed.length).toBeGreaterThan(0);
    expect(failed[0].error_message).toBe('月跑入列失敗，請重新觸發');
  });
});
