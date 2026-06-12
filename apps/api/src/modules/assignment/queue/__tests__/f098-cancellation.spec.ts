/**
 * F098 / AD-E07-28 P1 — cancellation 真生效（修現有 bug）單元測試。
 *
 * 對應測試設計 §5（AC-5）：
 *   - TS-F098-CANCEL-001：CancellationPoller 偵測 status=failed → 拋 RunCancelledException
 *   - TS-F098-CANCEL-002：取消後不再寫快照 / ob_monthly_run_result（核心）
 *   - TS-F098-CANCEL-003：stage 之間取消亦生效
 *   - TS-F098-CANCEL-004：取消粒度為 list 級（poll 點位於 list 邊界，非 list 內部）
 *
 * Level: Unit（SQLite + 真 pipeline + 真 poller）。需 Postgres：否。
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
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { AssignmentRunPipelineService } from '../../services/assignment-run-pipeline.service';
import { CancellationPoller } from '../cancellation-poller';
import { RunCancelledException } from '../run-cancelled.exception';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { AssignmentRunSnapshot } from '@/database/entities/assignment-run-snapshot.entity';
import { ObListDefinition } from '@/database/entities/ob-list-definition.entity';
import { ObPoolData } from '@/database/entities/ob-pool-data.entity';
import { ObPoolDataList } from '@/database/entities/ob-pool-data-list.entity';
import { ObMonthlyRunResult } from '@/database/entities/ob-monthly-run-result.entity';
import { ObDeptPct } from '@/database/entities/ob-dept-pct.entity';
import { ObEmplSet } from '@/database/entities/ob-empl-set.entity';
import { ObEmphire } from '@/database/entities/ob-emphire.entity';
import { ObCardType } from '@/database/entities/ob-card-type.entity';
import { ObLevelcardVersion } from '@/database/entities/ob-levelcard-version.entity';
import { ObLevelcardColumn } from '@/database/entities/ob-levelcard-column.entity';
import { ObLevelcardScore } from '@/database/entities/ob-levelcard-score.entity';
import { ObLevelcardLevel } from '@/database/entities/ob-levelcard-level.entity';
import { ObTier } from '@/database/entities/ob-tier.entity';
import { ObCalendar } from '@/database/entities/ob-calendar.entity';

const YM = '202605';

const ENTITIES = [
  AssignmentRun,
  AssignmentRunSnapshot,
  ObListDefinition,
  ObPoolData,
  ObPoolDataList,
  ObMonthlyRunResult,
  ObDeptPct,
  ObEmplSet,
  ObEmphire,
  ObCardType,
  ObLevelcardVersion,
  ObLevelcardColumn,
  ObLevelcardScore,
  ObLevelcardLevel,
  ObTier,
  ObCalendar,
];

async function buildModule() {
  const app: TestingModule = await Test.createTestingModule({
    imports: [
      TypeOrmModule.forRoot({
        type: 'better-sqlite3',
        database: ':memory:',
        entities: ENTITIES,
        synchronize: true,
      }),
      TypeOrmModule.forFeature(ENTITIES),
    ],
    providers: [AssignmentRunPipelineService, CancellationPoller],
  }).compile();
  await app.init();
  return {
    app,
    pipeline: app.get(AssignmentRunPipelineService),
    poller: app.get(CancellationPoller),
    runRepo: app.get<Repository<AssignmentRun>>(getRepositoryToken(AssignmentRun)),
    snapshotRepo: app.get<Repository<AssignmentRunSnapshot>>(
      getRepositoryToken(AssignmentRunSnapshot),
    ),
    listRepo: app.get<Repository<ObListDefinition>>(
      getRepositoryToken(ObListDefinition),
    ),
    poolRepo: app.get<Repository<ObPoolData>>(getRepositoryToken(ObPoolData)),
    resultRepo: app.get<Repository<ObMonthlyRunResult>>(
      getRepositoryToken(ObMonthlyRunResult),
    ),
    cardTypeRepo: app.get<Repository<ObCardType>>(getRepositoryToken(ObCardType)),
    ds: app.get(DataSource),
  };
}

async function seedRun(
  repo: Repository<AssignmentRun>,
  status: AssignmentRun['status'] = 'pending',
): Promise<AssignmentRun> {
  return repo.save(
    repo.create({
      project_workym: YM,
      status,
      triggered_by: 'a1b2c3d4-e5f6-7890-abcd-ef0123456789',
      created_at: new Date(),
    } as Partial<AssignmentRun>),
  );
}

async function seedList(
  repo: Repository<ObListDefinition>,
  listNo: string,
): Promise<void> {
  const now = new Date();
  await repo.save(
    repo.create({
      list_no: listNo,
      list_nm: `名單-${listNo}`,
      prod_kind: 'A',
      prod_best: 'Y',
      list_type: '01',
      list_period_start: '001',
      list_period_end: '030',
      list_interval: '001',
      project_workym: YM,
      caseyear: '113',
      settle_src: '01',
      card_type: 'T1',
      case_status: '01$$02',
      cr_enabled: false,
      status: 'active',
      stage: 'ready',
      condition_payload: {
        logic: 'AND',
        conditions: [
          { columnName: 'prod_kind', fieldType: 'categorical', values: ['A'] },
        ],
      },
      created_by_prog: 'TEST',
      created_by: 'tester',
      created_at: now,
      updated_by_prog: 'TEST',
      updated_by: 'tester',
      updated_at: now,
    } as Partial<ObListDefinition>),
  );
}

async function seedPool(
  repo: Repository<ObPoolData>,
  applNo: string,
): Promise<void> {
  await repo.save(
    repo.create({
      orgno: '01',
      appl_no: applNo,
      custo_no: `C${applNo}`,
      sta_code: '01',
      dept_id: 'D001',
      list_type: '01',
      settle_src: '01',
      commission: '1000',
      prod_kind: 'A',
      month_cnt: 1,
      _cdmp_extracted_at: new Date(),
    } as Partial<ObPoolData>),
  );
}

async function seedCardType(repo: Repository<ObCardType>): Promise<void> {
  const now = new Date();
  await repo.save(
    repo.create({
      card_type: 'T1',
      card_name: 'T1',
      prod_kind: 'A',
      status: 'active',
      created_at: now,
      created_by: 'T',
      updated_at: now,
      updated_by: 'T',
    } as Partial<ObCardType>),
  );
}

describe('F098 cancellation 真生效（worker 可中斷邊界）', () => {
  let env: Awaited<ReturnType<typeof buildModule>>;

  beforeAll(async () => {
    env = await buildModule();
  });
  afterAll(async () => {
    await env.app.close();
  });
  beforeEach(async () => {
    await env.ds.query('DELETE FROM ob_monthly_run_result');
    await env.ds.query('DELETE FROM assignment_run_snapshot');
    await env.ds.query('DELETE FROM ob_pool_data');
    await env.ds.query('DELETE FROM ob_list_definition');
    await env.ds.query('DELETE FROM ob_card_type');
    await env.ds.query('DELETE FROM assignment_run');
  });

  it('TS-F098-CANCEL-001：poller 偵測 status=failed → throwIfCancelled 拋 RunCancelledException', async () => {
    const run = await seedRun(env.runRepo, 'running');
    // 模擬 cancelRun：標 failed
    await env.runRepo.update({ run_id: run.run_id }, { status: 'failed' });

    await expect(env.poller.throwIfCancelled(run.run_id)).rejects.toBeInstanceOf(
      RunCancelledException,
    );
    // running 狀態則不拋
    const run2 = await seedRun(env.runRepo, 'running');
    await expect(
      env.poller.throwIfCancelled(run2.run_id),
    ).resolves.toBeUndefined();
  });

  it('TS-F098-CANCEL-001b：isCancelled 純判定（failed=true / running=false / 不存在=true）', async () => {
    const run = await seedRun(env.runRepo, 'running');
    expect(await env.poller.isCancelled(run.run_id)).toBe(false);
    await env.runRepo.update({ run_id: run.run_id }, { status: 'failed' });
    expect(await env.poller.isCancelled(run.run_id)).toBe(true);
    expect(
      await env.poller.isCancelled('00000000-0000-0000-0000-000000000000'),
    ).toBe(true);
  });

  it('TS-F098-CANCEL-002：取消後不再寫快照 / ob_monthly_run_result，run 維持 failed', async () => {
    await seedCardType(env.cardTypeRepo);
    await seedList(env.listRepo, 'OB202605001');
    await seedList(env.listRepo, 'OB202605002');
    await seedPool(env.poolRepo, 'A001');
    const run = await seedRun(env.runRepo, 'pending');

    // 於第一個 list 邊界後（第 2 次 throwIfCancelled）模擬使用者取消：標 failed 並拋
    let calls = 0;
    const throwSpy = vi
      .spyOn(env.poller, 'throwIfCancelled')
      .mockImplementation(async (runId: string) => {
        calls += 1;
        if (calls >= 2) {
          await env.runRepo.update({ run_id: runId }, { status: 'failed' });
          throw new RunCancelledException(runId);
        }
      });

    await env.pipeline.runPipeline(run.run_id, YM);
    throwSpy.mockRestore();

    // 核心：result / snapshot 0 筆
    const resultCount = await env.resultRepo.count();
    const snapshotCount = await env.snapshotRepo.count();
    expect(resultCount).toBe(0);
    expect(snapshotCount).toBe(0);

    // run 維持 failed（不被 completeRun 覆寫回 completed）
    const reloaded = await env.runRepo.findOne({ where: { run_id: run.run_id } });
    expect(reloaded?.status).toBe('failed');
  });

  it('TS-F098-CANCEL-003：stage 之間取消亦生效（pool 撈完、計分前標 failed）', async () => {
    await seedCardType(env.cardTypeRepo);
    await seedList(env.listRepo, 'OB202605001');
    await seedPool(env.poolRepo, 'A001');
    const run = await seedRun(env.runRepo, 'pending');

    // 單一 list：list 邊界查 1 次（不取消），Stage 之間查第 2 次（取消）
    let calls = 0;
    const throwSpy = vi
      .spyOn(env.poller, 'throwIfCancelled')
      .mockImplementation(async (runId: string) => {
        calls += 1;
        if (calls >= 2) {
          await env.runRepo.update({ run_id: runId }, { status: 'failed' });
          throw new RunCancelledException(runId);
        }
      });

    await env.pipeline.runPipeline(run.run_id, YM);
    throwSpy.mockRestore();

    expect(await env.resultRepo.count()).toBe(0);
    const reloaded = await env.runRepo.findOne({ where: { run_id: run.run_id } });
    expect(reloaded?.status).toBe('failed');
    // 至少呼叫了 list 邊界 + stage 邊界兩次
    expect(calls).toBeGreaterThanOrEqual(2);
  });

  it('TS-F098-CANCEL（無取消基準）：未取消時 pipeline 正常完成並寫 result + completed', async () => {
    await seedCardType(env.cardTypeRepo);
    await seedList(env.listRepo, 'OB202605001');
    await seedPool(env.poolRepo, 'A001');
    const run = await seedRun(env.runRepo, 'pending');

    await env.pipeline.runPipeline(run.run_id, YM);

    const reloaded = await env.runRepo.findOne({ where: { run_id: run.run_id } });
    expect(reloaded?.status).toBe('completed');
    expect(await env.resultRepo.count()).toBeGreaterThan(0);
  });
});
