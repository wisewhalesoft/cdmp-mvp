/**
 * AssignmentRunPipelineService — F061 v1.2 AC-3 + AC-4 + AC-5 + AC-7b
 *
 * 對應 spec / 任務：
 *   - TC-STAGE-001~004  : Stage 1 案件挑選 / Stage 2 計分 / Stage 3 CR 回分 / Stage 4 名單交換
 *   - TC-CR-REASSIGN    : per-LIST cr_enabled 啟用 / 停用
 *   - TC-BR-12          : 邊緣 CARD_TYPE 跳過 + skippedCases JSONB 結構
 *   - TC-SNAPSHOT-001~003: config / input_list / result 三份快照 同 transaction 原子寫入
 *   - TC-RUN-LIFECYCLE  : pending → running → completed / failed
 *
 * v1.0 簡化實作（標明於 service header）：
 *   - Stage 2 計分：score = SUM(維度 weight) 簡化版（非真實 fn_calc_tier_level SP）
 *   - Stage 4 名單交換：依 priority round-robin（非真實 st4_exchange T1/T2/T3 10% 轉資深）
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
import { ObMonthlyRunResult } from '@/database/entities/ob-monthly-run-result.entity';
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
  snapshotRepo: Repository<AssignmentRunSnapshot>;
  listRepo: Repository<ObListDefinition>;
  poolRepo: Repository<ObPoolData>;
  /** F094：月跑提案結果表（ob_monthly_run_result，取代 ob_pool_data_list 寫入目標） */
  resultRepo: Repository<ObMonthlyRunResult>;
  /** F094：去重來源（ob_pool_data_list，仍只讀不寫） */
  poolDataListRepo: Repository<ObPoolDataList>;
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
          ObMonthlyRunResult,
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
        ObMonthlyRunResult,
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
    snapshotRepo: app.get(getRepositoryToken(AssignmentRunSnapshot)),
    listRepo: app.get(getRepositoryToken(ObListDefinition)),
    poolRepo: app.get(getRepositoryToken(ObPoolData)),
    resultRepo: app.get(getRepositoryToken(ObMonthlyRunResult)),
    poolDataListRepo: app.get(getRepositoryToken(ObPoolDataList)),
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

async function seedRun(
  repo: Repository<AssignmentRun>,
  ym: string,
  status: AssignmentRun['status'] = 'pending',
): Promise<AssignmentRun> {
  return repo.save(
    repo.create({
      project_workym: ym,
      status,
      triggered_by: 'a1b2c3d4-e5f6-7890-abcd-ef0123456789',
      created_at: new Date(),
    } as Partial<AssignmentRun>),
  );
}

async function seedList(
  repo: Repository<ObListDefinition>,
  opts: {
    listNo: string;
    cardType: string;
    crEnabled?: boolean;
    stage?: ObListDefinition['stage'];
  },
): Promise<void> {
  const now = new Date();
  await repo.save(
    repo.create({
      list_no: opts.listNo,
      list_nm: `名單-${opts.listNo}`,
      prod_kind: 'A',
      prod_best: 'Y',
      list_type: '01',
      list_period_start: '001',
      list_period_end: '030',
      // F091：list_interval='001' → month_cnt 集合 [1..30]，涵蓋 seedPool 預設 month_cnt=1
      // （原 '030' → 僅 [1]；改為 '001' 維持既有案件數 baseline，不受 F091 MONTH_CNT 過濾影響）
      list_interval: '001',
      project_workym: YM,
      caseyear: '113',
      settle_src: '01',
      card_type: opts.cardType,
      case_status: '01$$02',
      cr_enabled: opts.crEnabled ?? false,
      status: 'active',
      stage: opts.stage ?? 'ready',
      // Phase 5b：Stage 1 動態 SQL 需要 condition_payload；fixture seed 給最小條件
      // 對應 seedPool 預設 prod_kind='A' 確保 SQL 過濾後仍撈到既有測試案件。
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
  opts: { applNo: string; orgno?: string; staCode?: string; commission?: string; prodKind?: string; monthCnt?: number },
): Promise<void> {
  await repo.save(
    repo.create({
      orgno: opts.orgno ?? '01',
      appl_no: opts.applNo,
      custo_no: `C${opts.applNo}`,
      sta_code: opts.staCode ?? '01',
      dept_id: 'D001',
      list_type: '01',
      settle_src: '01',
      commission: opts.commission ?? '1000',
      // Phase 5b：seedList 預設 condition_payload.prod_kind=['A']，
      // seedPool 須對應 prod_kind='A' 以通過 Stage 1 SQL 過濾。
      prod_kind: opts.prodKind ?? 'A',
      // F091：seedList list_interval='001' → month_cnt 集合 [1..30]；
      // 預設 month_cnt=1 確保通過 F091 MONTH_CNT 過濾，維持既有案件數 baseline。
      month_cnt: opts.monthCnt ?? 1,
      _cdmp_extracted_at: new Date(),
    } as Partial<ObPoolData>),
  );
}

async function seedDeptPct(
  repo: Repository<ObDeptPct>,
  opts: { listNo: string; deptId: string; ration: string },
): Promise<void> {
  const now = new Date();
  await repo.save(
    repo.create({
      project_workym: YM,
      list_no: opts.listNo,
      obdeptid: opts.deptId,
      obdeptnm: `部門-${opts.deptId}`,
      ration: opts.ration,
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
  opts: { listNo: string; deptId: string; emplid: string; ration: string },
): Promise<void> {
  const now = new Date();
  await repo.save(
    repo.create({
      list_no: opts.listNo,
      deptid_m: opts.deptId,
      emplid: opts.emplid,
      ration: opts.ration,
      created_at: now,
      updated_at: now,
    } as Partial<ObEmplSet>),
  );
}

async function seedCardType(
  repo: Repository<ObCardType>,
  cardType: string,
  status: 'active' | 'inactive' = 'active',
): Promise<void> {
  const now = new Date();
  await repo.save(
    repo.create({
      card_type: cardType,
      card_name: cardType,
      prod_kind: 'A',
      status,
      created_at: now,
      created_by: 'T',
      updated_at: now,
      updated_by: 'T',
    } as Partial<ObCardType>),
  );
}

async function seedLevel(
  repo: Repository<ObLevelcardLevel>,
  opts: {
    cardType: string;
    cardVersion: number;
    scoreS: number;
    scoreE: number;
    cardLevel: string;
  },
): Promise<void> {
  await repo.save(
    repo.create({
      card_type: opts.cardType,
      card_version: opts.cardVersion,
      score_s: opts.scoreS,
      score_e: opts.scoreE,
      card_level: opts.cardLevel,
    } as Partial<ObLevelcardLevel>),
  );
}

async function seedTier(
  repo: Repository<ObTier>,
  opts: { cardType: string; cardLevel: string | null; tierLevel: string },
): Promise<void> {
  await repo.save(
    repo.create({
      card_type: opts.cardType,
      card_level: opts.cardLevel,
      tier_level: opts.tierLevel,
    } as Partial<ObTier>),
  );
}

// ---------------------------------------------------------------------------
// 共用 setup：建一個「最小可跑」場景（1 list / 2 cases / 1 dept / 1 empl）
// ---------------------------------------------------------------------------

async function seedMinimalScenario(env: Env, opts?: { crEnabled?: boolean }): Promise<void> {
  await seedCardType(env.cardTypeRepo, 'T1');
  await seedList(env.listRepo, {
    listNo: 'OB202605001',
    cardType: 'T1',
    crEnabled: opts?.crEnabled ?? false,
  });
  await seedPool(env.poolRepo, { applNo: 'A001' });
  await seedPool(env.poolRepo, { applNo: 'A002' });
  await seedDeptPct(env.deptPctRepo, {
    listNo: 'OB202605001',
    deptId: 'D001',
    ration: '100.0',
  });
  await seedEmpl(env.emplSetRepo, {
    listNo: 'OB202605001',
    deptId: 'D001',
    emplid: 'E001',
    ration: '100.0',
  });
  await seedLevel(env.levelRepo, {
    cardType: 'T1',
    cardVersion: 1,
    scoreS: 0,
    scoreE: 9999,
    cardLevel: 'A',
  });
  await seedTier(env.tierRepo, { cardType: 'T1', cardLevel: 'A', tierLevel: 'T1' });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AssignmentRunPipelineService — F061 v1.2 AC-3 / AC-4', () => {
  let env: Env;

  beforeAll(async () => {
    env = await buildModule();
  });

  afterAll(async () => {
    await env.app.close();
  });

  beforeEach(async () => {
    // 依 FK 順序清空（ob_monthly_run_result FK → assignment_run，須先於 assignment_run 清）
    await env.ds.query('DELETE FROM assignment_run_snapshot');
    await env.ds.query('DELETE FROM ob_monthly_run_result');
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

  describe('TC-RUN-LIFECYCLE', () => {
    it('pending → running → completed：成功流程更新 status 三段', async () => {
      await seedMinimalScenario(env);
      const run = await seedRun(env.runRepo, YM);

      await env.service.runPipeline(run.run_id, YM);

      const after = await env.runRepo.findOne({ where: { run_id: run.run_id } });
      expect(after?.status).toBe('completed');
      expect(after?.started_at).toBeTruthy();
      expect(after?.finished_at).toBeTruthy();
      expect(after?.total_cases).toBeGreaterThan(0);
      expect(after?.total_lists).toBe(1);
      expect(after?.error_message).toBeNull();
    });
  });

  describe('TC-STAGE-001 Stage 1 — 案件挑選', () => {
    it('依 ready list 從 ob_pool_data 篩出案件並寫入 ob_pool_data_list', async () => {
      await seedMinimalScenario(env);
      const run = await seedRun(env.runRepo, YM);

      await env.service.runPipeline(run.run_id, YM);

      const rows = await env.resultRepo.find({ where: { list_no: 'OB202605001' } });
      expect(rows).toHaveLength(2);
      expect(rows.map((r) => r.appl_no).sort()).toEqual(['A001', 'A002']);
    });

    it('未在 ready 階段的名單不挑案件', async () => {
      await seedCardType(env.cardTypeRepo, 'T1');
      await seedList(env.listRepo, {
        listNo: 'OB202605001',
        cardType: 'T1',
        stage: 'draft', // 非 ready
      });
      await seedPool(env.poolRepo, { applNo: 'A001' });
      const run = await seedRun(env.runRepo, YM);

      await env.service.runPipeline(run.run_id, YM);

      // 沒任何 ready list → service 應回 completed 但 total_cases=0 / total_lists=0
      const after = await env.runRepo.findOne({ where: { run_id: run.run_id } });
      expect(after?.status).toBe('completed');
      expect(after?.total_lists).toBe(0);
      const rows = await env.resultRepo.find();
      expect(rows).toHaveLength(0);
    });
  });

  describe('TC-STAGE-002 Stage 2 — 計分（v1.0 簡化版）', () => {
    it('寫入 score 與 card_level 與 tier_level（依 ob_levelcard_level / ob_tier）', async () => {
      await seedMinimalScenario(env);
      const run = await seedRun(env.runRepo, YM);

      await env.service.runPipeline(run.run_id, YM);

      const rows = await env.resultRepo.find({ where: { list_no: 'OB202605001' } });
      for (const r of rows) {
        expect(r.score).not.toBeNull();
        expect(r.card_level).toBe('A');
        expect(r.tier_level).toBe('T1');
      }
    });
  });

  describe('TC-STAGE-003 / TC-CR-REASSIGN Stage 3 — CR 回分 per-LIST', () => {
    it('cr_enabled=true：每案件 is_cr 標記為 Y', async () => {
      await seedMinimalScenario(env, { crEnabled: true });
      const run = await seedRun(env.runRepo, YM);

      await env.service.runPipeline(run.run_id, YM);

      const rows = await env.resultRepo.find({ where: { list_no: 'OB202605001' } });
      expect(rows.every((r) => r.is_cr === 'Y')).toBe(true);
    });

    it('cr_enabled=false：is_cr 為 N（或 null）', async () => {
      await seedMinimalScenario(env, { crEnabled: false });
      const run = await seedRun(env.runRepo, YM);

      await env.service.runPipeline(run.run_id, YM);

      const rows = await env.resultRepo.find({ where: { list_no: 'OB202605001' } });
      expect(rows.every((r) => r.is_cr === 'N' || r.is_cr === null)).toBe(true);
    });
  });

  describe('TC-STAGE-004 Stage 4 — 名單交換', () => {
    it('依 dept_pct + empl_set 寫入 dept_id / emplid（v1.0 round-robin 簡化）', async () => {
      await seedMinimalScenario(env);
      const run = await seedRun(env.runRepo, YM);

      await env.service.runPipeline(run.run_id, YM);

      const rows = await env.resultRepo.find({ where: { list_no: 'OB202605001' } });
      expect(rows.every((r) => r.dept_id === 'D001')).toBe(true);
      expect(rows.every((r) => r.emplid === 'E001')).toBe(true);
    });
  });

  describe('TC-BR-12 邊緣 CARD_TYPE 跳過', () => {
    it('list.card_type 在 ob_card_type 為 inactive → 該批跳過 + 記入 skipped_cases', async () => {
      // T1 active 名單 + T9 邊緣（race condition：list 通過前置但 card_type 已 inactive）
      await seedCardType(env.cardTypeRepo, 'T1');
      await seedCardType(env.cardTypeRepo, 'T9', 'inactive');
      await seedList(env.listRepo, { listNo: 'OB202605001', cardType: 'T1' });
      await seedList(env.listRepo, { listNo: 'OB202605002', cardType: 'T9' });
      await seedPool(env.poolRepo, { applNo: 'A001' });
      await seedPool(env.poolRepo, { applNo: 'A002' });
      await seedDeptPct(env.deptPctRepo, {
        listNo: 'OB202605001',
        deptId: 'D001',
        ration: '100.0',
      });
      await seedEmpl(env.emplSetRepo, {
        listNo: 'OB202605001',
        deptId: 'D001',
        emplid: 'E001',
        ration: '100.0',
      });
      await seedLevel(env.levelRepo, {
        cardType: 'T1',
        cardVersion: 1,
        scoreS: 0,
        scoreE: 9999,
        cardLevel: 'A',
      });
      await seedTier(env.tierRepo, { cardType: 'T1', cardLevel: 'A', tierLevel: 'T1' });

      const run = await seedRun(env.runRepo, YM);
      await env.service.runPipeline(run.run_id, YM);

      const after = await env.runRepo.findOne({ where: { run_id: run.run_id } });
      // BR-12：仍 completed（不 fail）
      expect(after?.status).toBe('completed');
      // warning_summary 標 BR-12
      expect(after?.warning_summary).toBe('BR-12_EDGE_CARD_TYPE_SKIPPED');
      // skipped_cases JSONB 結構
      expect(after?.skipped_cases).toBeTruthy();
      const skipped = after?.skipped_cases as any;
      expect(Array.isArray(skipped.cases)).toBe(true);
      expect(skipped.cases.length).toBeGreaterThan(0);
      const t9Entry = skipped.cases.find((c: any) => c.cardType === 'T9');
      expect(t9Entry).toBeTruthy();
      expect(typeof t9Entry.applNoCount).toBe('number');
      expect(t9Entry.reason).toBeTruthy();
    });
  });

  describe('TC-SNAPSHOT-001~003 三份快照原子寫入', () => {
    it('成功流程：寫入 config / input_list / result 三筆 snapshot', async () => {
      await seedMinimalScenario(env);
      const run = await seedRun(env.runRepo, YM);

      await env.service.runPipeline(run.run_id, YM);

      const snaps = await env.snapshotRepo.find({ where: { run_id: run.run_id } });
      expect(snaps).toHaveLength(3);
      const types = snaps.map((s) => s.snapshot_type).sort();
      expect(types).toEqual(['config', 'input_list', 'result']);
    });

    it('config snapshot：含 listDefinitions + levelcardConfig', async () => {
      await seedMinimalScenario(env);
      const run = await seedRun(env.runRepo, YM);

      await env.service.runPipeline(run.run_id, YM);

      const config = await env.snapshotRepo.findOne({
        where: { run_id: run.run_id, snapshot_type: 'config' },
      });
      expect(config?.payload).toBeTruthy();
      const p = config!.payload as any;
      expect(Array.isArray(p.listDefinitions)).toBe(true);
      expect(p.listDefinitions.length).toBe(1);
      expect(p.levelcardLevels).toBeTruthy();
    });

    it('input_list snapshot：含 Stage 1 候選名單', async () => {
      await seedMinimalScenario(env);
      const run = await seedRun(env.runRepo, YM);

      await env.service.runPipeline(run.run_id, YM);

      const input = await env.snapshotRepo.findOne({
        where: { run_id: run.run_id, snapshot_type: 'input_list' },
      });
      const p = input!.payload as any;
      expect(Array.isArray(p.cases)).toBe(true);
      expect(p.cases.length).toBe(2);
      expect(p.cases[0].applNo).toBeTruthy();
    });

    it('result snapshot：含 Stage 4 最終分派結果', async () => {
      await seedMinimalScenario(env);
      const run = await seedRun(env.runRepo, YM);

      await env.service.runPipeline(run.run_id, YM);

      const result = await env.snapshotRepo.findOne({
        where: { run_id: run.run_id, snapshot_type: 'result' },
      });
      const p = result!.payload as any;
      expect(Array.isArray(p.assignments)).toBe(true);
      expect(p.assignments.length).toBe(2);
      expect(p.assignments[0].deptId).toBe('D001');
      expect(p.assignments[0].emplid).toBe('E001');
    });

    it('任一快照寫入失敗 → 整體 rollback + status=failed', async () => {
      await seedMinimalScenario(env);
      const run = await seedRun(env.runRepo, YM);

      // 注入故障：攔截 DataSource.transaction，在 callback 內讓 EntityManager.save
      // 對 AssignmentRunSnapshot 第三筆（result）拋錯，確認三份快照原子 rollback。
      const originalTx = env.ds.transaction.bind(env.ds);
      const spy = vi
        .spyOn(env.ds, 'transaction')
        .mockImplementation(async (runInTx: any) => {
          return originalTx(async (txm: any) => {
            const originalSave = txm.save.bind(txm);
            // patch txm.getRepository().save for AssignmentRunSnapshot
            const originalGetRepo = txm.getRepository.bind(txm);
            txm.getRepository = (target: any) => {
              const repo = originalGetRepo(target);
              if (target === AssignmentRunSnapshot || target?.name === 'AssignmentRunSnapshot') {
                const origRepoSave = repo.save.bind(repo);
                repo.save = async (entities: any) => {
                  // 模擬 result snapshot 寫入失敗 → 拋錯 → transaction rollback
                  const arr = Array.isArray(entities) ? entities : [entities];
                  if (arr.some((e) => e?.snapshot_type === 'result')) {
                    throw new Error('simulated snapshot write failure');
                  }
                  return origRepoSave(entities);
                };
              }
              return repo;
            };
            return runInTx(txm);
          });
        });

      await env.service.runPipeline(run.run_id, YM);

      // 三份應全部 rollback（一筆都沒寫入）
      const snaps = await env.snapshotRepo.find({ where: { run_id: run.run_id } });
      expect(snaps).toHaveLength(0);

      const after = await env.runRepo.findOne({ where: { run_id: run.run_id } });
      expect(after?.status).toBe('failed');
      expect(after?.error_message).toContain('simulated snapshot write failure');

      spy.mockRestore();
    });
  });

  // =========================================================================
  // F094 / AD-E07-25 Phase A：月跑 Stage 1~4 寫入 ob_monthly_run_result（切換落點）
  // 對應 TS-F094-ST1-001~003 / ST34-001~002 / SN-001 / DEDUP-001
  // （SQLite in-memory integration，對齊本 spec 既有 better-sqlite3 module；非 PG TestContainer）
  // =========================================================================
  describe('TS-F094-ST1：月跑 Stage 1 寫入 ob_monthly_run_result（不再寫 ob_pool_data_list）', () => {
    it('TS-F094-ST1-001: 月跑提案寫入 ob_monthly_run_result（帶 run_id, result_status=PENDING）；ob_pool_data_list 不被寫入', async () => {
      await seedMinimalScenario(env);
      const run = await seedRun(env.runRepo, YM);

      await env.service.runPipeline(run.run_id, YM);

      // 月跑結果寫入新表，帶 run_id + PK 四欄 + result_status='PENDING'
      const rows = await env.resultRepo.find({ where: { run_id: run.run_id } });
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.run_id === run.run_id)).toBe(true);
      expect(rows.every((r) => !!r.list_no && !!r.orgno && !!r.appl_no)).toBe(true);
      expect(rows.every((r) => r.result_status === 'PENDING')).toBe(true);

      // regression guard：ob_pool_data_list 未被月跑寫入（單源化 — 僅 ETL 來源）
      const pdlRows = await env.poolDataListRepo.find();
      expect(pdlRows).toHaveLength(0);
    });

    it('TS-F094-ST1-001b: ob_pool_data_list 既有 ETL 歷史不受月跑影響（不寫入該表）', async () => {
      await seedMinimalScenario(env);

      // 預先 seed 一筆 ETL 歷史列（單源化後 data_source='etl_load'）
      await env.poolDataListRepo.save(
        env.poolDataListRepo.create({
          list_no: 'HIST', orgno: '01', appl_no: 'LEGACY999', custo_no: 'CE001',
          settle_src: 'OBDATA', assignday: '20250301', data_source: 'etl_load',
        } as Partial<ObPoolDataList>),
      );

      const run = await seedRun(env.runRepo, YM);
      await env.service.runPipeline(run.run_id, YM);

      // ETL 歷史列仍存在且仍只有 1 筆（月跑未寫入 ob_pool_data_list）
      const pdlRows = await env.poolDataListRepo.find();
      expect(pdlRows).toHaveLength(1);
      expect(pdlRows[0].appl_no).toBe('LEGACY999');

      // 月跑結果在新表
      const resultRows = await env.resultRepo.find({ where: { run_id: run.run_id } });
      expect(resultRows.length).toBeGreaterThan(0);
    });
  });

  describe('TS-F094-ST34：Stage 3/4 結果寫入 ob_monthly_run_result', () => {
    it('TS-F094-ST34-001: Stage 3 CR 回分結果（is_cr）寫入本表', async () => {
      await seedMinimalScenario(env, { crEnabled: true });
      const run = await seedRun(env.runRepo, YM);

      await env.service.runPipeline(run.run_id, YM);

      const rows = await env.resultRepo.find({ where: { run_id: run.run_id } });
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.is_cr === 'Y')).toBe(true);
    });

    it('TS-F094-ST34-002: Stage 4 部門/業務員分配（dept_id/emplid/emplid_deptid）寫入本表', async () => {
      await seedMinimalScenario(env);
      const run = await seedRun(env.runRepo, YM);

      await env.service.runPipeline(run.run_id, YM);

      const rows = await env.resultRepo.find({ where: { run_id: run.run_id } });
      expect(rows.every((r) => r.dept_id === 'D001')).toBe(true);
      expect(rows.every((r) => r.emplid === 'E001')).toBe(true);
      expect(rows.every((r) => r.emplid_deptid === 'D001')).toBe(true);
    });
  });

  describe('TS-F094-SN：snapshot type=result 短期雙軌保留', () => {
    it('TS-F094-SN-001: 月跑完成後仍寫 assignment_run_snapshot type=result（與本表並存）', async () => {
      await seedMinimalScenario(env);
      const run = await seedRun(env.runRepo, YM);

      await env.service.runPipeline(run.run_id, YM);

      const resultSnap = await env.snapshotRepo.findOne({
        where: { run_id: run.run_id, snapshot_type: 'result' },
      });
      expect(resultSnap).toBeTruthy();
      // 同時 ob_monthly_run_result 亦有對應 run_id 列（雙軌並存）
      const resultRows = await env.resultRepo.find({ where: { run_id: run.run_id } });
      expect(resultRows.length).toBeGreaterThan(0);
    });
  });

  describe('TS-F094-FK：FK ON DELETE CASCADE', () => {
    it('TS-F094-FK-001: 刪除 assignment_run → ob_monthly_run_result 對應列 CASCADE 清除', async () => {
      await seedMinimalScenario(env);
      const run = await seedRun(env.runRepo, YM);
      await env.service.runPipeline(run.run_id, YM);

      const before = await env.resultRepo.find({ where: { run_id: run.run_id } });
      expect(before.length).toBeGreaterThan(0);

      // 刪除 run（snapshot FK 亦 CASCADE；須先清 snapshot 由其自身 FK CASCADE 處理）
      await env.ds.query('DELETE FROM assignment_run_snapshot WHERE run_id = ?', [run.run_id]);
      await env.ds.query('DELETE FROM assignment_run WHERE run_id = ?', [run.run_id]);

      const after = await env.resultRepo.find({ where: { run_id: run.run_id } });
      expect(after).toHaveLength(0);
    });
  });

  describe('TS-F094-DEDUP：去重來源仍只讀 ob_pool_data_list（不讀本表）', () => {
    it('TS-F094-DEDUP-001: 月跑兩次 — 第二次去重不因第一次提案（本表）而排除（提案非真相）', async () => {
      await seedMinimalScenario(env);

      // 第一次月跑：寫入 ob_monthly_run_result（custo_no=CA001 / CA002）
      const run1 = await seedRun(env.runRepo, YM);
      await env.service.runPipeline(run1.run_id, YM);
      const firstRows = await env.resultRepo.find({ where: { run_id: run1.run_id } });
      expect(firstRows.length).toBe(2);

      // 第二次月跑：去重只讀 ob_pool_data_list（空）→ 不因第一次本表提案而去重
      const run2 = await seedRun(env.runRepo, YM);
      await env.service.runPipeline(run2.run_id, YM);
      const secondRows = await env.resultRepo.find({ where: { run_id: run2.run_id } });
      // 第二次仍挑到 2 筆（本表提案不納入去重；ob_pool_data_list 為空）
      expect(secondRows.length).toBe(2);
    });
  });
});

// vitest auto-import
import { vi } from 'vitest';
