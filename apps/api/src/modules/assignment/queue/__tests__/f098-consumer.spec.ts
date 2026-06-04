/**
 * F098 / AD-E07-28 P1 — RunQueueConsumer 消費 + status 轉移單元測試。
 *
 * 對應測試設計 §2（AC-2 / AC-7）：
 *   - TS-F098-CONS-001：handler 取 job → runPipeline(runId, ym)，參數取自 job.data（非 job 本身）
 *   - TS-F098-CONS-004：pipeline 拋錯不使 worker crash（pipeline 內部已標 failed）
 *   - TS-F098-CONS-005：job 對應 run 不存在 → 不 crash、記 log、視為已處理
 *   - TS-F098-CONS-006：consumer 註冊 queue name === producer queue name === 'assignment-run'
 *   - 取消快路徑：pending 已被標 failed 之 run → 略過 pipeline
 *   - TS-F098-SER-001：work 註冊 batchSize=1（v10 序列化等效，OQ-AD28-05）
 *   - TS-F098-RETRY-001：send options retryLimit=0（OQ-AD28-04）
 *
 * Level: Unit（直呼 handler；fake boss 模擬 v10 contract：work handler 收 job 陣列）。需 Postgres：否。
 */
import {
  describe,
  it,
  expect,
  beforeEach,
  vi,
} from 'vitest';
import type PgBoss from 'pg-boss';
import { RunQueueConsumer } from '../run-queue.consumer';
import { RUN_QUEUE_NAME, RUN_QUEUE_BATCH_SIZE } from '../run-queue.constants';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';

function makeJob(
  runId: string,
  ym: string,
  id = 'job-1',
): PgBoss.Job<{ runId: string; ym: string }> {
  return { id, name: RUN_QUEUE_NAME, data: { runId, ym }, expireInSeconds: 900 };
}

describe('F098 RunQueueConsumer 消費 + status 轉移', () => {
  let pipeline: { runPipeline: ReturnType<typeof vi.fn> };
  let runRepo: { findOne: ReturnType<typeof vi.fn> };
  let boss: {
    work: ReturnType<typeof vi.fn>;
  };
  let consumer: RunQueueConsumer;

  beforeEach(() => {
    pipeline = { runPipeline: vi.fn(async () => undefined) };
    runRepo = {
      findOne: vi.fn(async () => ({ run_id: 'r1', status: 'pending' })),
    };
    boss = { work: vi.fn(async () => 'worker-id') };
    consumer = new RunQueueConsumer(
      boss as unknown as PgBoss,
      pipeline as any,
      runRepo as unknown as any,
    );
  });

  it('TS-F098-CONS-001：handler 取 job → runPipeline(runId, ym)（參數取自 job.data）', async () => {
    const job = makeJob('run-abc', '202606');
    await consumer.handleJobs([job]);
    expect(pipeline.runPipeline).toHaveBeenCalledTimes(1);
    expect(pipeline.runPipeline).toHaveBeenCalledWith('run-abc', '202606');
  });

  it('TS-F098-CONS-001b：payload 在 job.data，非 job 物件本身（v10 contract）', async () => {
    const job = makeJob('run-xyz', '202607');
    await consumer.handleJobs([job]);
    // 取的是 job.data.runId / job.data.ym，不是 job.runId
    const [calledRunId, calledYm] = pipeline.runPipeline.mock.calls[0];
    expect(calledRunId).toBe(job.data.runId);
    expect(calledYm).toBe(job.data.ym);
  });

  it('TS-F098-CONS-005：job 對應 run 不存在 → 不 crash、不呼叫 pipeline', async () => {
    runRepo.findOne.mockResolvedValueOnce(null);
    const job = makeJob('ghost-run', '202606');
    await expect(consumer.handleJobs([job])).resolves.toBeUndefined();
    expect(pipeline.runPipeline).not.toHaveBeenCalled();
  });

  it('取消快路徑：run 已被標 failed（pending 取消）→ 略過 pipeline', async () => {
    runRepo.findOne.mockResolvedValueOnce({ run_id: 'r1', status: 'failed' });
    const job = makeJob('r1', '202606');
    await consumer.handleJobs([job]);
    expect(pipeline.runPipeline).not.toHaveBeenCalled();
  });

  it('TS-F098-CONS-004：pipeline 拋錯不使 worker crash（handler resolve）', async () => {
    pipeline.runPipeline.mockRejectedValueOnce(new Error('stage exploded'));
    const job = makeJob('r1', '202606');
    // handler 不向上拋（pipeline 內部本應自行 try/catch 標 failed；此處保險不退出 worker）
    await expect(consumer.handleJobs([job])).resolves.toBeUndefined();
  });

  it('TS-F098-CONS-006 / SER-001：work 註冊 queue name + batchSize=1', async () => {
    await consumer.onModuleInit();
    expect(boss.work).toHaveBeenCalledTimes(1);
    const [queueName, options] = boss.work.mock.calls[0];
    expect(queueName).toBe(RUN_QUEUE_NAME);
    expect(queueName).toBe('assignment-run');
    expect(options).toMatchObject({ batchSize: RUN_QUEUE_BATCH_SIZE });
    expect(options.batchSize).toBe(1);
  });

  it('TS-F098-CONS-005b：boss 為 null（非 PG / 非 worker 程序）→ onModuleInit 不註冊、不 crash', async () => {
    const c = new RunQueueConsumer(
      null,
      pipeline as any,
      runRepo as unknown as any,
    );
    await expect(c.onModuleInit()).resolves.toBeUndefined();
  });

  it('handler 收多筆 job（batch）逐筆處理', async () => {
    runRepo.findOne.mockResolvedValue({ run_id: 'x', status: 'pending' });
    await consumer.handleJobs([
      makeJob('a', '202601', 'j1'),
      makeJob('b', '202602', 'j2'),
    ]);
    expect(pipeline.runPipeline).toHaveBeenCalledTimes(2);
  });
});
