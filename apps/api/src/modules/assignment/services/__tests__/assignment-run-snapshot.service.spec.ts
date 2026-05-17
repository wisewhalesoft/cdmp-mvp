/**
 * AssignmentRunSnapshotService — F066 查看執行快照詳情
 *
 * 對應 spec 場景：
 *   - TC-M05-SNAPSHOT-001：getFullSnapshot 三份完整 → 200 含 config/inputList/result
 *   - TC-M05-SNAPSHOT-002：getFullSnapshot 缺某份 → 對應欄位為 null（spec L91 結構保留）
 *   - TC-M05-SNAPSHOT-003：getSnapshotByType('config') → 單一 payload
 *   - TC-M05-SNAPSHOT-004：getSnapshotByType 不存在 type → 404
 *   - TC-M05-SNAPSHOT-005：run_id 不存在 → 404 ASSIGNMENT_RUN_NOT_FOUND
 *   - TC-M05-SNAPSHOT-006：未完成 run 仍可讀取（不阻擋）
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';

import { AssignmentRunSnapshotService } from '../assignment-run-snapshot.service';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { AssignmentRunSnapshot } from '@/database/entities/assignment-run-snapshot.entity';
import { ERROR_CODES } from '@/common/errors/error-codes';

const YM = '202605';

interface Env {
  service: AssignmentRunSnapshotService;
  runRepo: Repository<AssignmentRun>;
  snapRepo: Repository<AssignmentRunSnapshot>;
  app: TestingModule;
}

async function buildModule(): Promise<Env> {
  const app: TestingModule = await Test.createTestingModule({
    imports: [
      TypeOrmModule.forRoot({
        type: 'better-sqlite3',
        database: ':memory:',
        entities: [AssignmentRun, AssignmentRunSnapshot],
        synchronize: true,
      }),
      TypeOrmModule.forFeature([AssignmentRun, AssignmentRunSnapshot]),
    ],
    providers: [AssignmentRunSnapshotService],
  }).compile();
  await app.init();
  return {
    service: app.get(AssignmentRunSnapshotService),
    runRepo: app.get(getRepositoryToken(AssignmentRun)),
    snapRepo: app.get(getRepositoryToken(AssignmentRunSnapshot)),
    app,
  };
}

async function seedRun(
  repo: Repository<AssignmentRun>,
  status: AssignmentRun['status'] = 'completed',
): Promise<AssignmentRun> {
  return repo.save(
    repo.create({
      project_workym: YM,
      status,
      triggered_by: '00000000-0000-0000-0000-000000000001',
      total_cases: 100,
      created_at: new Date(),
    } as Partial<AssignmentRun>),
  );
}

async function seedSnapshot(
  repo: Repository<AssignmentRunSnapshot>,
  runId: string,
  type: 'config' | 'input_list' | 'result',
  payload: Record<string, unknown>,
): Promise<void> {
  await repo.save(
    repo.create({
      run_id: runId,
      snapshot_type: type,
      payload,
      created_at: new Date(),
    } as Partial<AssignmentRunSnapshot>),
  );
}

describe('AssignmentRunSnapshotService — F066', () => {
  let env: Env;

  beforeAll(async () => {
    env = await buildModule();
  });
  afterAll(async () => {
    await env.app.close();
  });
  beforeEach(async () => {
    await env.snapRepo.createQueryBuilder().delete().execute();
    await env.runRepo.createQueryBuilder().delete().execute();
  });

  it('TC-M05-SNAPSHOT-001：getFullSnapshot 三份完整 → 200', async () => {
    const run = await seedRun(env.runRepo);
    await seedSnapshot(env.snapRepo, run.run_id, 'config', { projectWorkym: YM });
    await seedSnapshot(env.snapRepo, run.run_id, 'input_list', { cases: [{ a: 1 }] });
    await seedSnapshot(env.snapRepo, run.run_id, 'result', { assignments: [{ a: 2 }] });

    const res = await env.service.getFullSnapshot(run.run_id);

    expect(res.runMeta.runId).toBe(run.run_id);
    expect(res.runMeta.status).toBe('completed');
    expect(res.snapshots.config).toEqual({ projectWorkym: YM });
    expect(res.snapshots.inputList).toEqual({ cases: [{ a: 1 }] });
    expect(res.snapshots.result).toEqual({ assignments: [{ a: 2 }] });
  });

  it('TC-M05-SNAPSHOT-002：缺 input_list → inputList=null，其他保留', async () => {
    const run = await seedRun(env.runRepo);
    await seedSnapshot(env.snapRepo, run.run_id, 'config', { projectWorkym: YM });
    await seedSnapshot(env.snapRepo, run.run_id, 'result', { assignments: [] });

    const res = await env.service.getFullSnapshot(run.run_id);
    expect(res.snapshots.config).toBeTruthy();
    expect(res.snapshots.inputList).toBeNull();
    expect(res.snapshots.result).toBeTruthy();
  });

  it('TC-M05-SNAPSHOT-003：getSnapshotByType("config") → 單一 payload', async () => {
    const run = await seedRun(env.runRepo);
    await seedSnapshot(env.snapRepo, run.run_id, 'config', { foo: 'bar' });

    const res = await env.service.getSnapshotByType(run.run_id, 'config');
    expect(res.type).toBe('config');
    expect(res.payload).toEqual({ foo: 'bar' });
    expect(res.runMeta.runId).toBe(run.run_id);
  });

  it('TC-M05-SNAPSHOT-004：getSnapshotByType 不存在 type → 404', async () => {
    const run = await seedRun(env.runRepo);
    await seedSnapshot(env.snapRepo, run.run_id, 'config', {});

    await expect(
      env.service.getSnapshotByType(run.run_id, 'result'),
    ).rejects.toMatchObject({
      response: { error: ERROR_CODES.ASSIGNMENT_RUN_NOT_FOUND },
    });
  });

  it('TC-M05-SNAPSHOT-005：run_id 不存在 → 404', async () => {
    await expect(
      env.service.getFullSnapshot('00000000-0000-0000-0000-000000000999'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('TC-M05-SNAPSHOT-006：未完成 run 仍可讀取（不阻擋，缺者為 null）', async () => {
    const run = await seedRun(env.runRepo, 'running');
    // 未寫任何快照
    const res = await env.service.getFullSnapshot(run.run_id);
    expect(res.runMeta.status).toBe('running');
    expect(res.snapshots.config).toBeNull();
    expect(res.snapshots.inputList).toBeNull();
    expect(res.snapshots.result).toBeNull();
  });
});
