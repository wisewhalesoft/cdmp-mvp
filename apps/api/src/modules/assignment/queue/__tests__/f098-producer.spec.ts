/**
 * F098 / AD-E07-28 P1 — RunQueueProducer 入列 contract 單元測試。
 *
 * 對應測試設計 §3（AC-3）：
 *   - TS-F098-RETRY-001：send options 含 retryLimit=0（OQ-AD28-04）
 *   - send 回傳 pg-boss jobId（string），非 void（feedback_mock_real_system_contract）
 *   - send 入列 queue name = 'assignment-run'，payload = { runId, ym }
 *   - cancel：pg-boss v10 cancel(name, id)（queue name 第一參數）
 *   - boss 為 null（非 PG）→ send 拋（防呆）
 *
 * Level: Unit（fake boss）。需 Postgres：否。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type PgBoss from 'pg-boss';
import { RunQueueProducer } from '../run-queue.producer';
import { RUN_QUEUE_NAME } from '../run-queue.constants';
import { DEFAULT_RUN_QUEUE_TUNING } from '../pg-boss.provider';

describe('F098 RunQueueProducer 入列 contract', () => {
  let boss: { send: ReturnType<typeof vi.fn>; cancel: ReturnType<typeof vi.fn> };
  let producer: RunQueueProducer;
  const FAKE_JOB_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

  beforeEach(() => {
    boss = {
      send: vi.fn(async () => FAKE_JOB_ID),
      cancel: vi.fn(async () => undefined),
    };
    producer = new RunQueueProducer(
      boss as unknown as PgBoss,
      DEFAULT_RUN_QUEUE_TUNING,
    );
  });

  it('TS-F098-RETRY-001：send 帶 retryLimit=0 + expireInSeconds', async () => {
    const jobId = await producer.send({ runId: 'r1', ym: '202606' });
    expect(jobId).toBe(FAKE_JOB_ID);
    expect(boss.send).toHaveBeenCalledTimes(1);
    const [name, payload, options] = boss.send.mock.calls[0];
    expect(name).toBe(RUN_QUEUE_NAME);
    expect(payload).toEqual({ runId: 'r1', ym: '202606' });
    expect(options).toMatchObject({ retryLimit: 0 });
    expect(options.expireInSeconds).toBe(
      DEFAULT_RUN_QUEUE_TUNING.jobExpireInSeconds,
    );
  });

  it('send 回傳 jobId（string），非 void（contract）', async () => {
    const result = await producer.send({ runId: 'r2', ym: '202607' });
    expect(typeof result).toBe('string');
  });

  it('TS-F098-CANCEL-006 (unit)：cancel 以 v10 簽章 cancel(name, jobId)', async () => {
    await producer.cancel(FAKE_JOB_ID);
    expect(boss.cancel).toHaveBeenCalledWith(RUN_QUEUE_NAME, FAKE_JOB_ID);
  });

  it('cancel 失敗（job 已被消費）不向上拋', async () => {
    boss.cancel.mockRejectedValueOnce(new Error('job not found'));
    await expect(producer.cancel('gone')).resolves.toBeUndefined();
  });

  it('boss 為 null（非 PG 環境且未 override）→ send 拋（防呆）', async () => {
    const p = new RunQueueProducer(null, DEFAULT_RUN_QUEUE_TUNING);
    await expect(p.send({ runId: 'r', ym: '202606' })).rejects.toThrow();
  });
});
