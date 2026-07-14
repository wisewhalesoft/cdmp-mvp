/**
 * F098 / AD-E07-28 P1 — OrphanReaper 殭屍 running 回收單元測試。
 *
 * 對應測試設計 §6（AC-6 / §9.2）：
 *   - TS-F098-ORPHAN-001：running 且逾時 → failed + error_message='worker 中斷，請重新觸發'
 *   - TS-F098-ORPHAN-002：定期掃描亦回收（可注入週期 / 直呼 reap）
 *   - TS-F098-ORPHAN-003：執行中 run（started_at 較新 / 未逾時）不被誤殺（核心邊界）
 *   - TS-F098-ORPHAN-004：閾值前後分開驗證（−ε 不回收 / +ε 回收）
 *   - TS-F098-ORPHAN-005：completed / failed 不被觸碰；pending 涵蓋（OQ-F098-01）
 *   - TS-F098-ORPHAN-006：回收後 assertNoRunningRun 不再阻擋同月重觸發
 *
 * Level: Unit（SQLite + 注入短閾值 + 注入時鐘）。需 Postgres：否。
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { OrphanReaper, ORPHAN_ERROR_MESSAGE } from '../orphan-reaper';
import { AssignmentRunGuardService } from '../../services/assignment-run-guard.service';
import {
  RUN_QUEUE_TUNING,
  RunQueueTuning,
} from '../run-queue-tuning.provider';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';

const ACTOR = 'a1b2c3d4-e5f6-7890-abcd-ef0123456789';
const YM = '202606';

// 測試用極短閾值（1 秒）；reaperIntervalMs=0 關閉自動 setInterval（避免測試殘留 timer）
const TEST_TUNING: RunQueueTuning = {
  jobExpireInSeconds: 1,
  reaperIntervalMs: 0,
  orphanThresholdMs: 1000,
  cancelPollIntervalMs: 0,
};

async function buildModule() {
  const app: TestingModule = await Test.createTestingModule({
    imports: [
      TypeOrmModule.forRoot({
        type: 'better-sqlite3',
        database: ':memory:',
        entities: [AssignmentRun],
        synchronize: true,
      }),
      TypeOrmModule.forFeature([AssignmentRun]),
    ],
    providers: [
      OrphanReaper,
      AssignmentRunGuardService,
      { provide: RUN_QUEUE_TUNING, useValue: TEST_TUNING },
    ],
  }).compile();
  await app.init();
  return {
    app,
    reaper: app.get(OrphanReaper),
    guard: app.get(AssignmentRunGuardService),
    runRepo: app.get<Repository<AssignmentRun>>(getRepositoryToken(AssignmentRun)),
    ds: app.get(DataSource),
  };
}

async function seedRun(
  repo: Repository<AssignmentRun>,
  opts: {
    status: AssignmentRun['status'];
    startedAt?: Date | null;
    createdAt?: Date;
  },
): Promise<AssignmentRun> {
  return repo.save(
    repo.create({
      project_workym: YM,
      status: opts.status,
      triggered_by: ACTOR,
      started_at: opts.startedAt ?? null,
      created_at: opts.createdAt ?? new Date(),
    } as Partial<AssignmentRun>),
  );
}

describe('F098 OrphanReaper 殭屍回收', () => {
  let env: Awaited<ReturnType<typeof buildModule>>;
  // 固定 now 供注入時鐘；閾值 1000ms
  const NOW = new Date('2026-06-02T10:00:00.000Z');
  const longAgo = new Date(NOW.getTime() - 60_000); // 60s 前（遠逾時）
  const justNow = new Date(NOW.getTime() - 100); // 100ms 前（未逾時）

  beforeAll(async () => {
    env = await buildModule();
  });
  afterAll(async () => {
    env.reaper.onModuleDestroy();
    await env.app.close();
  });
  beforeEach(async () => {
    await env.ds.query('DELETE FROM assignment_run');
  });

  it('TS-F098-ORPHAN-001：running 且逾時 → failed + 正確 error_message', async () => {
    const run = await seedRun(env.runRepo, {
      status: 'running',
      startedAt: longAgo,
    });
    const recovered = await env.reaper.reap(NOW);
    expect(recovered).toBe(1);
    const reloaded = await env.runRepo.findOne({ where: { run_id: run.run_id } });
    expect(reloaded?.status).toBe('failed');
    expect(reloaded?.error_message).toBe(ORPHAN_ERROR_MESSAGE);
    expect(reloaded?.error_message).toBe('worker 中斷，請重新觸發');
  });

  it('TS-F098-ORPHAN-003：執行中 run（started_at 未逾時）不被誤殺', async () => {
    const run = await seedRun(env.runRepo, {
      status: 'running',
      startedAt: justNow,
    });
    const recovered = await env.reaper.reap(NOW);
    expect(recovered).toBe(0);
    const reloaded = await env.runRepo.findOne({ where: { run_id: run.run_id } });
    expect(reloaded?.status).toBe('running');
  });

  it('TS-F098-ORPHAN-004：閾值前後分開驗證', async () => {
    // 案例 A：閾值 − ε（999ms 前，未逾時）→ 不回收
    const runA = await seedRun(env.runRepo, {
      status: 'running',
      startedAt: new Date(NOW.getTime() - 999),
    });
    expect(await env.reaper.reap(NOW)).toBe(0);
    expect(
      (await env.runRepo.findOne({ where: { run_id: runA.run_id } }))?.status,
    ).toBe('running');

    await env.ds.query('DELETE FROM assignment_run');

    // 案例 B：閾值 + ε（1001ms 前，已逾時）→ 回收
    const runB = await seedRun(env.runRepo, {
      status: 'running',
      startedAt: new Date(NOW.getTime() - 1001),
    });
    expect(await env.reaper.reap(NOW)).toBe(1);
    expect(
      (await env.runRepo.findOne({ where: { run_id: runB.run_id } }))?.status,
    ).toBe('failed');
  });

  it('TS-F098-ORPHAN-005：completed / failed 不被觸碰；只掃 running / pending', async () => {
    const completed = await seedRun(env.runRepo, {
      status: 'completed',
      startedAt: longAgo,
    });
    const failed = await seedRun(env.runRepo, {
      status: 'failed',
      startedAt: longAgo,
    });
    const running = await seedRun(env.runRepo, {
      status: 'running',
      startedAt: longAgo,
    });
    const recovered = await env.reaper.reap(NOW);
    expect(recovered).toBe(1); // 只有 running
    expect(
      (await env.runRepo.findOne({ where: { run_id: completed.run_id } }))?.status,
    ).toBe('completed');
    expect(
      (await env.runRepo.findOne({ where: { run_id: failed.run_id } }))
        ?.error_message ?? null,
    ).not.toBe(ORPHAN_ERROR_MESSAGE);
    expect(
      (await env.runRepo.findOne({ where: { run_id: running.run_id } }))?.status,
    ).toBe('failed');
  });

  it('TS-F098-OQ-002 / OQ-F098-01：pending 且逾時（入列失敗孤兒）亦回收', async () => {
    const pending = await seedRun(env.runRepo, {
      status: 'pending',
      createdAt: longAgo,
    });
    const recovered = await env.reaper.reap(NOW);
    expect(recovered).toBe(1);
    const reloaded = await env.runRepo.findOne({
      where: { run_id: pending.run_id },
    });
    expect(reloaded?.status).toBe('failed');
    expect(reloaded?.error_message).toBe(ORPHAN_ERROR_MESSAGE);
  });

  it('TS-F098-ORPHAN-005b：未逾時 pending（剛入列）不被回收', async () => {
    const pending = await seedRun(env.runRepo, {
      status: 'pending',
      createdAt: justNow,
    });
    expect(await env.reaper.reap(NOW)).toBe(0);
    expect(
      (await env.runRepo.findOne({ where: { run_id: pending.run_id } }))?.status,
    ).toBe('pending');
  });

  it('TS-F098-ORPHAN-006：回收後 assertNoRunningRun 不再阻擋同月重觸發', async () => {
    await seedRun(env.runRepo, { status: 'running', startedAt: longAgo });
    // 回收前：同月有 running → assertNoRunningRun 拋
    await expect(env.guard.assertNoRunningRun(YM)).rejects.toThrow();
    // 回收
    await env.reaper.reap(NOW);
    // 回收後：殭屍解除 → 不再阻擋
    await expect(env.guard.assertNoRunningRun(YM)).resolves.toBeUndefined();
  });

  it('TS-F098-ORPHAN-002：無孤兒時 reap 回 0', async () => {
    await seedRun(env.runRepo, { status: 'running', startedAt: justNow });
    expect(await env.reaper.reap(NOW)).toBe(0);
  });

  // 追加：running 但 started_at IS NULL（半轉換殭屍；SQL `NULL <= cutoff` 恆逃過主 running 分支）
  it('TS-F098-ORPHAN-007：running 且 started_at IS NULL 且 created_at 逾時 → 回收', async () => {
    const run = await seedRun(env.runRepo, {
      status: 'running',
      startedAt: null,
      createdAt: longAgo,
    });
    const recovered = await env.reaper.reap(NOW);
    expect(recovered).toBe(1);
    const reloaded = await env.runRepo.findOne({ where: { run_id: run.run_id } });
    expect(reloaded?.status).toBe('failed');
    expect(reloaded?.error_message).toBe(ORPHAN_ERROR_MESSAGE);
  });

  it('TS-F098-ORPHAN-008：running 且 started_at IS NULL 但 created_at 未逾時 → 不誤殺', async () => {
    const run = await seedRun(env.runRepo, {
      status: 'running',
      startedAt: null,
      createdAt: justNow,
    });
    expect(await env.reaper.reap(NOW)).toBe(0);
    const reloaded = await env.runRepo.findOne({ where: { run_id: run.run_id } });
    expect(reloaded?.status).toBe('running');
  });
});
