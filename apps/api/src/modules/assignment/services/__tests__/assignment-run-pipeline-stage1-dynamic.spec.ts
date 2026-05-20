/**
 * AssignmentRunPipelineService Stage 1 動態 SQL 整合測試 — Phase 5b 波 6 / 波 7
 *
 * 對應 spec：
 *   - AD-E07-18 §18.5（Stage 1 從 poolRepo.find() 全表改為動態 WHERE 過濾）
 *   - AD-E07-18 §18.5.1（caseyear wildcard）
 *   - AD-E07-18 §18.5.2（空 conditions 名單 skip）
 *   - M01 IT-M01-009 / 010 / 011 / 012 / 016 / 017
 *
 * 注意：此 spec 與既有 assignment-run-pipeline.service.spec.ts 並存；
 *       既有 spec 對應 v1.0 簡化版（5a 之前 poolRepo.find() 全表）已於波 8 補
 *       condition_payload seed 以維持 0 regression。
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { AssignmentRunPipelineService } from '../assignment-run-pipeline.service';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { AssignmentRunSnapshot } from '@/database/entities/assignment-run-snapshot.entity';
import { ObListDefinition } from '@/database/entities/ob-list-definition.entity';
import { ObPoolData } from '@/database/entities/ob-pool-data.entity';
import { ObPoolDataList } from '@/database/entities/ob-pool-data-list.entity';
import { ObDeptPct } from '@/database/entities/ob-dept-pct.entity';
import { ObEmplSet } from '@/database/entities/ob-empl-set.entity';
import { ObCardType } from '@/database/entities/ob-card-type.entity';
import { ObLevelcardVersion } from '@/database/entities/ob-levelcard-version.entity';
import { ObLevelcardColumn } from '@/database/entities/ob-levelcard-column.entity';
import { ObLevelcardScore } from '@/database/entities/ob-levelcard-score.entity';
import { ObLevelcardLevel } from '@/database/entities/ob-levelcard-level.entity';
import { ObTier } from '@/database/entities/ob-tier.entity';

const YM = '202605';

interface Env {
  service: AssignmentRunPipelineService;
  runRepo: Repository<AssignmentRun>;
  listRepo: Repository<ObListDefinition>;
  poolRepo: Repository<ObPoolData>;
  resultRepo: Repository<ObPoolDataList>;
  deptPctRepo: Repository<ObDeptPct>;
  emplSetRepo: Repository<ObEmplSet>;
  cardTypeRepo: Repository<ObCardType>;
  versionRepo: Repository<ObLevelcardVersion>;
  levelRepo: Repository<ObLevelcardLevel>;
  tierRepo: Repository<ObTier>;
  ds: DataSource;
  app: TestingModule;
}

async function buildModule(): Promise<Env> {
  const app: TestingModule = await Test.createTestingModule({
    imports: [
      TypeOrmModule.forRoot({
        type: 'better-sqlite3',
        database: ':memory:',
        entities: [
          AssignmentRun,
          AssignmentRunSnapshot,
          ObListDefinition,
          ObPoolData,
          ObPoolDataList,
          ObDeptPct,
          ObEmplSet,
          ObCardType,
          ObLevelcardVersion,
          ObLevelcardColumn,
          ObLevelcardScore,
          ObLevelcardLevel,
          ObTier,
        ],
        synchronize: true,
      }),
      TypeOrmModule.forFeature([
        AssignmentRun,
        AssignmentRunSnapshot,
        ObListDefinition,
        ObPoolData,
        ObPoolDataList,
        ObDeptPct,
        ObEmplSet,
        ObCardType,
        ObLevelcardVersion,
        ObLevelcardColumn,
        ObLevelcardScore,
        ObLevelcardLevel,
        ObTier,
      ]),
    ],
    providers: [AssignmentRunPipelineService],
  }).compile();

  await app.init();

  return {
    service: app.get(AssignmentRunPipelineService),
    runRepo: app.get(getRepositoryToken(AssignmentRun)),
    listRepo: app.get(getRepositoryToken(ObListDefinition)),
    poolRepo: app.get(getRepositoryToken(ObPoolData)),
    resultRepo: app.get(getRepositoryToken(ObPoolDataList)),
    deptPctRepo: app.get(getRepositoryToken(ObDeptPct)),
    emplSetRepo: app.get(getRepositoryToken(ObEmplSet)),
    cardTypeRepo: app.get(getRepositoryToken(ObCardType)),
    versionRepo: app.get(getRepositoryToken(ObLevelcardVersion)),
    levelRepo: app.get(getRepositoryToken(ObLevelcardLevel)),
    tierRepo: app.get(getRepositoryToken(ObTier)),
    ds: app.get(DataSource),
    app,
  };
}

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

async function seedRun(repo: Repository<AssignmentRun>): Promise<AssignmentRun> {
  return repo.save(
    repo.create({
      project_workym: YM,
      status: 'pending',
      triggered_by: 'a1b2c3d4-e5f6-7890-abcd-ef0123456789',
      created_at: new Date(),
    } as Partial<AssignmentRun>),
  );
}

async function seedList(
  repo: Repository<ObListDefinition>,
  opts: {
    listNo: string;
    cardType?: string;
    conditionPayload?: ObListDefinition['condition_payload'];
    prodKind?: string;
    caseyear?: string | null;
    caseStatus?: string;
    settleSrc?: string | null;
    specTp?: string | null;
  },
): Promise<void> {
  const now = new Date();
  await repo.save(
    repo.create({
      list_no: opts.listNo,
      list_nm: `名單-${opts.listNo}`,
      prod_kind: opts.prodKind ?? '',
      prod_best: 'Y',
      list_type: '01',
      list_period_start: '001',
      list_period_end: '030',
      list_interval: '001',
      project_workym: YM,
      caseyear: opts.caseyear ?? null,
      spec_tp: opts.specTp ?? null,
      settle_src: opts.settleSrc ?? null,
      card_type: opts.cardType ?? 'T1',
      case_status: opts.caseStatus ?? '',
      cr_enabled: false,
      status: 'active',
      stage: 'ready',
      condition_payload: opts.conditionPayload ?? null,
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
  opts: {
    applNo: string;
    orgno?: string;
    prodKind?: string | null;
    yearCnt?: number | null;
    specTp?: string | null;
    settleSrc?: string;
    listType?: string;
  },
): Promise<void> {
  await repo.save(
    repo.create({
      orgno: opts.orgno ?? '01',
      appl_no: opts.applNo,
      custo_no: `C${opts.applNo}`,
      sta_code: '01',
      dept_id: 'D001',
      list_type: opts.listType ?? '01',
      settle_src: opts.settleSrc ?? '01',
      commission: '1000',
      prod_kind: opts.prodKind ?? null,
      year_cnt: opts.yearCnt ?? null,
      spec_tp: opts.specTp ?? null,
      _cdmp_extracted_at: new Date(),
    } as Partial<ObPoolData>),
  );
}

async function seedDeptPct(
  repo: Repository<ObDeptPct>,
  listNo: string,
): Promise<void> {
  const now = new Date();
  await repo.save(
    repo.create({
      project_workym: YM,
      list_no: listNo,
      obdeptid: 'D001',
      obdeptnm: '部門-D001',
      ration: '100.0',
      created_at: now,
      updated_at: now,
      created_by_prog: 'TEST',
      created_by: 'T',
      updated_by_prog: 'TEST',
      updated_by: 'T',
    } as Partial<ObDeptPct>),
  );
}

async function seedEmpl(
  repo: Repository<ObEmplSet>,
  listNo: string,
): Promise<void> {
  const now = new Date();
  await repo.save(
    repo.create({
      list_no: listNo,
      deptid_m: 'D001',
      emplid: 'E001',
      ration: '100.0',
      created_at: now,
      updated_at: now,
    } as Partial<ObEmplSet>),
  );
}

async function seedCardType(
  repo: Repository<ObCardType>,
  cardType: string = 'T1',
): Promise<void> {
  const now = new Date();
  await repo.save(
    repo.create({
      card_type: cardType,
      card_name: cardType,
      prod_kind: 'A',
      status: 'active',
      created_at: now,
      created_by: 'T',
      updated_at: now,
      updated_by: 'T',
    } as Partial<ObCardType>),
  );
}

async function seedLevel(repo: Repository<ObLevelcardLevel>): Promise<void> {
  await repo.save(
    repo.create({
      card_type: 'T1',
      card_version: 1,
      score_s: 0,
      score_e: 9999,
      card_level: 'A',
    } as Partial<ObLevelcardLevel>),
  );
}

async function seedTier(repo: Repository<ObTier>): Promise<void> {
  await repo.save(
    repo.create({
      card_type: 'T1',
      card_level: 'A',
      tier_level: 'T1',
    } as Partial<ObTier>),
  );
}

async function seedCommonFixtures(env: Env, listNo: string): Promise<void> {
  await seedCardType(env.cardTypeRepo);
  await seedDeptPct(env.deptPctRepo, listNo);
  await seedEmpl(env.emplSetRepo, listNo);
  await seedLevel(env.levelRepo);
  await seedTier(env.tierRepo);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AssignmentRunPipelineService Stage 1 動態 SQL — Phase 5b', () => {
  let env: Env;

  beforeAll(async () => {
    env = await buildModule();
  });

  afterAll(async () => {
    await env.app.close();
  });

  beforeEach(async () => {
    await env.ds.query('DELETE FROM assignment_run_snapshot');
    await env.ds.query('DELETE FROM assignment_run');
    await env.ds.query('DELETE FROM ob_pool_data_list');
    await env.ds.query('DELETE FROM ob_pool_data');
    await env.ds.query('DELETE FROM ob_dept_pct');
    await env.ds.query('DELETE FROM ob_empl_set');
    await env.ds.query('DELETE FROM ob_levelcard_level');
    await env.ds.query('DELETE FROM ob_tier');
    await env.ds.query('DELETE FROM ob_card_type');
    await env.ds.query('DELETE FROM ob_list_definition');
  });

  // -------------------------------------------------------------------------
  // 波 6：runPipeline 整合改寫核心
  // -------------------------------------------------------------------------

  describe('波 6 — runPipeline 從 poolRepo.find() 改為動態 WHERE', () => {
    it('ITP-001 / IT-M01-009 (Path A categorical)：只撈到符合 condition_payload 的案件', async () => {
      const listNo = 'OB202605001';
      await seedCommonFixtures(env, listNo);
      await seedList(env.listRepo, {
        listNo,
        conditionPayload: {
          logic: 'AND',
          conditions: [
            { columnName: 'prod_kind', fieldType: 'categorical', values: ['01', '02'] },
          ],
        },
      });
      // 3 個案件：2 個符合（prod_kind 01/02）、1 個不符合（prod_kind 99）
      await seedPool(env.poolRepo, { applNo: 'A001', prodKind: '01' });
      await seedPool(env.poolRepo, { applNo: 'A002', prodKind: '02' });
      await seedPool(env.poolRepo, { applNo: 'A003', prodKind: '99' });

      const run = await seedRun(env.runRepo);
      await env.service.runPipeline(run.run_id, YM);

      const rows = await env.resultRepo.find({ where: { list_no: listNo } });
      expect(rows).toHaveLength(2);
      expect(rows.map((r) => r.appl_no).sort()).toEqual(['A001', 'A002']);
    });

    it('ITP-002 / IT-M01-010 (Path A numeric)：BETWEEN 過濾 year_cnt', async () => {
      const listNo = 'OB202605002';
      await seedCommonFixtures(env, listNo);
      await seedList(env.listRepo, {
        listNo,
        conditionPayload: {
          logic: 'AND',
          conditions: [
            { columnName: 'year_cnt', fieldType: 'numeric', min: 2, max: 5 },
          ],
        },
      });
      await seedPool(env.poolRepo, { applNo: 'A001', yearCnt: 1 }); // 不符合
      await seedPool(env.poolRepo, { applNo: 'A002', yearCnt: 3 }); // 符合
      await seedPool(env.poolRepo, { applNo: 'A003', yearCnt: 5 }); // 符合
      await seedPool(env.poolRepo, { applNo: 'A004', yearCnt: 6 }); // 不符合

      const run = await seedRun(env.runRepo);
      await env.service.runPipeline(run.run_id, YM);

      const rows = await env.resultRepo.find({ where: { list_no: listNo } });
      expect(rows).toHaveLength(2);
      expect(rows.map((r) => r.appl_no).sort()).toEqual(['A002', 'A003']);
    });

    it('ITP-003 / IT-M01-011 (Path B fallback)：condition_payload IS NULL 走 entity column', async () => {
      const listNo = 'OB202605003';
      await seedCommonFixtures(env, listNo);
      // condition_payload=null + prod_kind='01$$02'
      await seedList(env.listRepo, {
        listNo,
        conditionPayload: null,
        prodKind: '01$$02',
      });
      await seedPool(env.poolRepo, { applNo: 'A001', prodKind: '01' });
      await seedPool(env.poolRepo, { applNo: 'A002', prodKind: '02' });
      await seedPool(env.poolRepo, { applNo: 'A003', prodKind: '99' });

      const run = await seedRun(env.runRepo);
      await env.service.runPipeline(run.run_id, YM);

      const rows = await env.resultRepo.find({ where: { list_no: listNo } });
      expect(rows).toHaveLength(2);
      expect(rows.map((r) => r.appl_no).sort()).toEqual(['A001', 'A002']);
    });

    it('ITP-004 (caseyear wildcard)：caseyear=[99] → 不過濾 year_cnt，全案件入選', async () => {
      const listNo = 'OB202605004';
      await seedCommonFixtures(env, listNo);
      await seedList(env.listRepo, {
        listNo,
        conditionPayload: {
          logic: 'AND',
          conditions: [
            // 加另一條件確保 SQL 不會 EMPTY_CONDITIONS skip 整 list
            { columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] },
            { columnName: 'caseyear', fieldType: 'categorical', values: ['99'] },
          ],
        },
      });
      // year_cnt 各種值都該入選（只要 prod_kind=01）
      await seedPool(env.poolRepo, { applNo: 'A001', prodKind: '01', yearCnt: 1 });
      await seedPool(env.poolRepo, { applNo: 'A002', prodKind: '01', yearCnt: 99 });
      await seedPool(env.poolRepo, { applNo: 'A003', prodKind: '01', yearCnt: null });
      await seedPool(env.poolRepo, { applNo: 'A004', prodKind: '02', yearCnt: 5 }); // prod_kind 不符

      const run = await seedRun(env.runRepo);
      await env.service.runPipeline(run.run_id, YM);

      const rows = await env.resultRepo.find({ where: { list_no: listNo } });
      // A001 / A002 / A003 都符合 prod_kind=01（year_cnt 不過濾）；A004 prod_kind 不符
      // 注意 A003 year_cnt=null 也應通過（無 year_cnt 條件）
      expect(rows.map((r) => r.appl_no).sort()).toEqual(['A001', 'A002', 'A003']);
    });
  });
});
