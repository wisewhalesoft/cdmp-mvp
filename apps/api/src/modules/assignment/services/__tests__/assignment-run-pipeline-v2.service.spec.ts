/**
 * AssignmentRunPipelineService — F061 v2.0 真實邏輯升級（B4 補完留項）
 *
 * 對應任務（補完 v1.0 簡化版）：
 *   - Stage 2 真實計分：依 ob_levelcard_column / ob_levelcard_score 權重計算 score
 *     （取代 v1.0 score = commission 簡化版）
 *   - Stage 4 真實 st4_exchange：T1/T2 新件中各 10% 轉給該部門 T3（資深）員工
 *     （取代 v1.0 round-robin 第一筆簡化版）
 *   - Stage 3 真實 CR 動態回分：讀歷史 result snapshot 找曾被分派但未成交案件
 *     重新加入本月分派（is_cr='Y'）
 *
 * **策略**：feature flag `ASSIGNMENT_PIPELINE_V2=true` 啟用 v2.0；預設 OFF 保留 v1.0 13 PASS。
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
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
  snapshotRepo: Repository<AssignmentRunSnapshot>;
  listRepo: Repository<ObListDefinition>;
  poolRepo: Repository<ObPoolData>;
  resultRepo: Repository<ObPoolDataList>;
  deptPctRepo: Repository<ObDeptPct>;
  emplSetRepo: Repository<ObEmplSet>;
  cardTypeRepo: Repository<ObCardType>;
  versionRepo: Repository<ObLevelcardVersion>;
  columnRepo: Repository<ObLevelcardColumn>;
  scoreRepo: Repository<ObLevelcardScore>;
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
    snapshotRepo: app.get(getRepositoryToken(AssignmentRunSnapshot)),
    listRepo: app.get(getRepositoryToken(ObListDefinition)),
    poolRepo: app.get(getRepositoryToken(ObPoolData)),
    resultRepo: app.get(getRepositoryToken(ObPoolDataList)),
    deptPctRepo: app.get(getRepositoryToken(ObDeptPct)),
    emplSetRepo: app.get(getRepositoryToken(ObEmplSet)),
    cardTypeRepo: app.get(getRepositoryToken(ObCardType)),
    versionRepo: app.get(getRepositoryToken(ObLevelcardVersion)),
    columnRepo: app.get(getRepositoryToken(ObLevelcardColumn)),
    scoreRepo: app.get(getRepositoryToken(ObLevelcardScore)),
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

async function seedList(
  repo: Repository<ObListDefinition>,
  opts: { listNo: string; cardType: string; crEnabled?: boolean },
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
      list_interval: '030',
      project_workym: YM,
      caseyear: '113',
      settle_src: '01',
      card_type: opts.cardType,
      case_status: '01$$02',
      cr_enabled: opts.crEnabled ?? false,
      status: 'active',
      stage: 'ready',
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
  opts: { applNo: string; commission?: string; monthCnt?: number },
): Promise<void> {
  await repo.save(
    repo.create({
      orgno: '01',
      appl_no: opts.applNo,
      custo_no: `C${opts.applNo}`,
      sta_code: '01',
      dept_id: 'D001',
      list_type: '01',
      settle_src: '01',
      commission: opts.commission ?? '1000',
      month_cnt: opts.monthCnt ?? null,
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
      obdeptnm: `D-${opts.deptId}`,
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

async function seedVersion(
  repo: Repository<ObLevelcardVersion>,
  opts: { cardType: string; cardVersion: number },
): Promise<void> {
  await repo.save(
    repo.create({
      card_type: opts.cardType,
      card_name: opts.cardType,
      card_version: opts.cardVersion,
      sdate: '20250101',
      edate: '20991231',
      status: 'active',
    } as Partial<ObLevelcardVersion>),
  );
}

async function seedColumn(
  repo: Repository<ObLevelcardColumn>,
  opts: {
    cardType: string;
    cardVersion: number;
    columnName: string;
    status?: string;
    matchType?: 'CATEGORY' | 'RANGE' | 'COMPOSITE';
  },
): Promise<void> {
  await repo.save(
    repo.create({
      card_type: opts.cardType,
      card_version: opts.cardVersion,
      column_name: opts.columnName,
      column_label: opts.columnName,
      status: opts.status ?? 'active',
      // F054 v1.3：match_type 為 NOT NULL；seed 預設 'RANGE'
      match_type: opts.matchType ?? 'RANGE',
    } as Partial<ObLevelcardColumn>),
  );
}

async function seedScore(
  repo: Repository<ObLevelcardScore>,
  opts: {
    cardType: string;
    cardVersion: number;
    columnName: string;
    level1?: string | null;
    level2S?: string | null;
    level2E?: string | null;
    score: number;
  },
): Promise<void> {
  await repo.save(
    repo.create({
      card_type: opts.cardType,
      card_version: opts.cardVersion,
      column_name: opts.columnName,
      level1: opts.level1 ?? null,
      level2_s: opts.level2S ?? null,
      level2_e: opts.level2E ?? null,
      score: opts.score,
    } as Partial<ObLevelcardScore>),
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
// Tests
// ---------------------------------------------------------------------------
describe('AssignmentRunPipelineService — F061 v2.0 真實邏輯', () => {
  let env: Env;
  const ORIGINAL_FLAG = process.env.ASSIGNMENT_PIPELINE_V2;

  beforeAll(async () => {
    env = await buildModule();
    process.env.ASSIGNMENT_PIPELINE_V2 = 'true';
  });

  afterAll(async () => {
    if (ORIGINAL_FLAG === undefined) {
      delete process.env.ASSIGNMENT_PIPELINE_V2;
    } else {
      process.env.ASSIGNMENT_PIPELINE_V2 = ORIGINAL_FLAG;
    }
    await env.app.close();
  });

  beforeEach(async () => {
    await env.ds.query('DELETE FROM assignment_run_snapshot');
    await env.ds.query('DELETE FROM assignment_run');
    await env.ds.query('DELETE FROM ob_pool_data_list');
    await env.ds.query('DELETE FROM ob_pool_data');
    await env.ds.query('DELETE FROM ob_dept_pct');
    await env.ds.query('DELETE FROM ob_empl_set');
    await env.ds.query('DELETE FROM ob_levelcard_score');
    await env.ds.query('DELETE FROM ob_levelcard_column');
    await env.ds.query('DELETE FROM ob_levelcard_version');
    await env.ds.query('DELETE FROM ob_levelcard_level');
    await env.ds.query('DELETE FROM ob_tier');
    await env.ds.query('DELETE FROM ob_card_type');
    await env.ds.query('DELETE FROM ob_list_definition');
  });

  // -------------------------------------------------------------------------
  // TC-V2-STAGE2-001: 真實計分（依 column 與 score 區間/類別權重累加）
  // -------------------------------------------------------------------------
  describe('TC-V2-STAGE2 Stage 2 真實 fn_calc_tier_level（JS 等價）', () => {
    it('區間型維度（LIST_MONTH）+ 類別型維度（PROJECT_TP）正確累加 score', async () => {
      await seedCardType(env.cardTypeRepo, 'T1');
      await seedList(env.listRepo, { listNo: 'OB202605001', cardType: 'T1' });
      // 兩個案件 month_cnt 不同 → score 應不同
      await seedPool(env.poolRepo, { applNo: 'A001', monthCnt: 2 });
      await seedPool(env.poolRepo, { applNo: 'A002', monthCnt: 10 });
      await seedDeptPct(env.deptPctRepo, { listNo: 'OB202605001', deptId: 'D001', ration: '100.0' });
      await seedEmpl(env.emplSetRepo, {
        listNo: 'OB202605001',
        deptId: 'D001',
        emplid: 'E001',
        ration: '100.0',
      });

      await seedVersion(env.versionRepo, { cardType: 'T1', cardVersion: 1 });

      // 兩個維度
      await seedColumn(env.columnRepo, { cardType: 'T1', cardVersion: 1, columnName: 'LIST_MONTH' });
      await seedColumn(env.columnRepo, { cardType: 'T1', cardVersion: 1, columnName: 'PROJECT_TP' });

      // LIST_MONTH 區間型：0~5 → 10 分；6~12 → 30 分
      await seedScore(env.scoreRepo, {
        cardType: 'T1', cardVersion: 1, columnName: 'LIST_MONTH',
        level2S: '0', level2E: '5', score: 10,
      });
      await seedScore(env.scoreRepo, {
        cardType: 'T1', cardVersion: 1, columnName: 'LIST_MONTH',
        level2S: '6', level2E: '12', score: 30,
      });
      // PROJECT_TP 類別型：'01' → 5 分（所有案件 seed 預設無 spec_tp → 應對應 fallback default '01'）
      await seedScore(env.scoreRepo, {
        cardType: 'T1', cardVersion: 1, columnName: 'PROJECT_TP',
        level1: '01', score: 5,
      });

      // CARD_LEVEL 門檻：0~20 → C；21~100 → A
      await seedLevel(env.levelRepo, {
        cardType: 'T1', cardVersion: 1, scoreS: 0, scoreE: 20, cardLevel: 'C',
      });
      await seedLevel(env.levelRepo, {
        cardType: 'T1', cardVersion: 1, scoreS: 21, scoreE: 100, cardLevel: 'A',
      });

      await seedTier(env.tierRepo, { cardType: 'T1', cardLevel: 'C', tierLevel: 'T3' });
      await seedTier(env.tierRepo, { cardType: 'T1', cardLevel: 'A', tierLevel: 'T1' });

      const run = await seedRun(env.runRepo);
      await env.service.runPipeline(run.run_id, YM);

      const rows = await env.resultRepo.find({ where: { list_no: 'OB202605001' } });
      const a001 = rows.find((r) => r.appl_no === 'A001')!;
      const a002 = rows.find((r) => r.appl_no === 'A002')!;

      // A001：LIST_MONTH=2 → 10 + PROJECT_TP='01' → 5 = 15 → C → T3
      expect(a001.score).toBe(15);
      expect(a001.card_level).toBe('C');
      expect(a001.tier_level).toBe('T3');

      // A002：LIST_MONTH=10 → 30 + PROJECT_TP='01' → 5 = 35 → A → T1
      expect(a002.score).toBe(35);
      expect(a002.card_level).toBe('A');
      expect(a002.tier_level).toBe('T1');
    });

    it('disabled 維度（status=disabled）不參與計分', async () => {
      await seedCardType(env.cardTypeRepo, 'T1');
      await seedList(env.listRepo, { listNo: 'OB202605001', cardType: 'T1' });
      await seedPool(env.poolRepo, { applNo: 'A001', monthCnt: 2 });
      await seedDeptPct(env.deptPctRepo, { listNo: 'OB202605001', deptId: 'D001', ration: '100.0' });
      await seedEmpl(env.emplSetRepo, {
        listNo: 'OB202605001', deptId: 'D001', emplid: 'E001', ration: '100.0',
      });

      await seedVersion(env.versionRepo, { cardType: 'T1', cardVersion: 1 });

      // active LIST_MONTH + disabled PROJECT_TP
      await seedColumn(env.columnRepo, { cardType: 'T1', cardVersion: 1, columnName: 'LIST_MONTH' });
      await seedColumn(env.columnRepo, {
        cardType: 'T1', cardVersion: 1, columnName: 'PROJECT_TP', status: 'disabled',
      });

      await seedScore(env.scoreRepo, {
        cardType: 'T1', cardVersion: 1, columnName: 'LIST_MONTH',
        level2S: '0', level2E: '5', score: 10,
      });
      // 此 score 不應被列入（PROJECT_TP 已 disabled）
      await seedScore(env.scoreRepo, {
        cardType: 'T1', cardVersion: 1, columnName: 'PROJECT_TP',
        level1: '01', score: 999,
      });

      await seedLevel(env.levelRepo, {
        cardType: 'T1', cardVersion: 1, scoreS: 0, scoreE: 100, cardLevel: 'A',
      });
      await seedTier(env.tierRepo, { cardType: 'T1', cardLevel: 'A', tierLevel: 'T1' });

      const run = await seedRun(env.runRepo);
      await env.service.runPipeline(run.run_id, YM);

      const rows = await env.resultRepo.find({ where: { list_no: 'OB202605001' } });
      // 只計 LIST_MONTH=2 → 10；不含 disabled PROJECT_TP 的 999
      expect(rows[0].score).toBe(10);
    });

    it('無 active version → 跳過計分（score=null）但案件仍寫入', async () => {
      await seedCardType(env.cardTypeRepo, 'T1');
      await seedList(env.listRepo, { listNo: 'OB202605001', cardType: 'T1' });
      await seedPool(env.poolRepo, { applNo: 'A001' });
      await seedDeptPct(env.deptPctRepo, { listNo: 'OB202605001', deptId: 'D001', ration: '100.0' });
      await seedEmpl(env.emplSetRepo, {
        listNo: 'OB202605001', deptId: 'D001', emplid: 'E001', ration: '100.0',
      });

      // 故意不 seed version / column / score / level / tier
      const run = await seedRun(env.runRepo);
      await env.service.runPipeline(run.run_id, YM);

      const rows = await env.resultRepo.find({ where: { list_no: 'OB202605001' } });
      expect(rows.length).toBe(1);
      expect(rows[0].score).toBeNull();
      expect(rows[0].card_level).toBeNull();
      expect(rows[0].tier_level).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // TC-V2-STAGE4: 真實 st4_exchange（T1/T2 → T3 10% 轉資深）
  // -------------------------------------------------------------------------
  describe('TC-V2-STAGE4 Stage 4 真實 st4_exchange', () => {
    it('T1 案件 10% 轉給該部門 T3（資深）員工', async () => {
      await seedCardType(env.cardTypeRepo, 'T1');
      await seedList(env.listRepo, { listNo: 'OB202605001', cardType: 'T1' });

      // 10 件案件 → T1 階級 → 應 1 件（10%）轉給 T3 員工
      for (let i = 1; i <= 10; i++) {
        await seedPool(env.poolRepo, {
          applNo: `A${String(i).padStart(3, '0')}`, commission: '10000',
        });
      }
      await seedDeptPct(env.deptPctRepo, { listNo: 'OB202605001', deptId: 'D001', ration: '100.0' });
      // 兩位員工：E_NEW (T1 新人) 與 E_SR (T3 資深)
      await seedEmpl(env.emplSetRepo, {
        listNo: 'OB202605001', deptId: 'D001', emplid: 'E_NEW', ration: '100.0',
      });
      await seedEmpl(env.emplSetRepo, {
        listNo: 'OB202605001', deptId: 'D001', emplid: 'E_SR', ration: '0.0',
      });

      await seedVersion(env.versionRepo, { cardType: 'T1', cardVersion: 1 });
      // 全部案件 score=0（不需 column/score）→ card_level='A'
      await seedLevel(env.levelRepo, {
        cardType: 'T1', cardVersion: 1, scoreS: 0, scoreE: 99999, cardLevel: 'A',
      });
      // A → T1
      await seedTier(env.tierRepo, { cardType: 'T1', cardLevel: 'A', tierLevel: 'T1' });

      // st4_exchange 設定：T1 → 該部門 T3 員工
      // 透過 employee_tier_map 提供（v2.0 用 ob_empl_set 之 extension：先用 prod_type 暫存 tier 標記）
      // 為了 v2.0 測試而設計：列出 E_SR 為 T3 員工（service 內查 emplToTier map）
      await env.ds.query(
        `UPDATE ob_empl_set SET prod_type = 'TIER:T3' WHERE emplid = 'E_SR'`,
      );
      await env.ds.query(
        `UPDATE ob_empl_set SET prod_type = 'TIER:T1' WHERE emplid = 'E_NEW'`,
      );

      const run = await seedRun(env.runRepo);
      await env.service.runPipeline(run.run_id, YM);

      const rows = await env.resultRepo.find({ where: { list_no: 'OB202605001' } });
      // 10 件案件中應有 1 件分給 E_SR（T3），9 件分給 E_NEW
      const srCount = rows.filter((r) => r.emplid === 'E_SR').length;
      const newCount = rows.filter((r) => r.emplid === 'E_NEW').length;
      expect(srCount).toBe(1);
      expect(newCount).toBe(9);
    });

    it('T1 / T2 案件不足 10 件時 — 至少轉 1 件給資深（保底）', async () => {
      await seedCardType(env.cardTypeRepo, 'T1');
      await seedList(env.listRepo, { listNo: 'OB202605001', cardType: 'T1' });
      // 5 件 T1 案件 → 10% = 0.5，向上取整為 1 件
      for (let i = 1; i <= 5; i++) {
        await seedPool(env.poolRepo, { applNo: `A${String(i).padStart(3, '0')}` });
      }
      await seedDeptPct(env.deptPctRepo, { listNo: 'OB202605001', deptId: 'D001', ration: '100.0' });
      await seedEmpl(env.emplSetRepo, {
        listNo: 'OB202605001', deptId: 'D001', emplid: 'E_NEW', ration: '100.0',
      });
      await seedEmpl(env.emplSetRepo, {
        listNo: 'OB202605001', deptId: 'D001', emplid: 'E_SR', ration: '0.0',
      });

      await seedVersion(env.versionRepo, { cardType: 'T1', cardVersion: 1 });
      await seedLevel(env.levelRepo, {
        cardType: 'T1', cardVersion: 1, scoreS: 0, scoreE: 99999, cardLevel: 'A',
      });
      await seedTier(env.tierRepo, { cardType: 'T1', cardLevel: 'A', tierLevel: 'T1' });

      await env.ds.query(`UPDATE ob_empl_set SET prod_type = 'TIER:T3' WHERE emplid = 'E_SR'`);
      await env.ds.query(`UPDATE ob_empl_set SET prod_type = 'TIER:T1' WHERE emplid = 'E_NEW'`);

      const run = await seedRun(env.runRepo);
      await env.service.runPipeline(run.run_id, YM);

      const rows = await env.resultRepo.find({ where: { list_no: 'OB202605001' } });
      const srCount = rows.filter((r) => r.emplid === 'E_SR').length;
      expect(srCount).toBeGreaterThanOrEqual(1);
    });

    it('T3 案件不轉（已是資深）', async () => {
      await seedCardType(env.cardTypeRepo, 'T1');
      await seedList(env.listRepo, { listNo: 'OB202605001', cardType: 'T1' });
      for (let i = 1; i <= 10; i++) {
        await seedPool(env.poolRepo, { applNo: `A${String(i).padStart(3, '0')}` });
      }
      await seedDeptPct(env.deptPctRepo, { listNo: 'OB202605001', deptId: 'D001', ration: '100.0' });
      await seedEmpl(env.emplSetRepo, {
        listNo: 'OB202605001', deptId: 'D001', emplid: 'E_NEW', ration: '100.0',
      });
      await seedEmpl(env.emplSetRepo, {
        listNo: 'OB202605001', deptId: 'D001', emplid: 'E_SR', ration: '0.0',
      });

      await seedVersion(env.versionRepo, { cardType: 'T1', cardVersion: 1 });
      await seedLevel(env.levelRepo, {
        cardType: 'T1', cardVersion: 1, scoreS: 0, scoreE: 99999, cardLevel: 'C',
      });
      // C → T3（所有案件均為 T3 = 資深 → 不應轉）
      await seedTier(env.tierRepo, { cardType: 'T1', cardLevel: 'C', tierLevel: 'T3' });

      await env.ds.query(`UPDATE ob_empl_set SET prod_type = 'TIER:T3' WHERE emplid = 'E_SR'`);
      await env.ds.query(`UPDATE ob_empl_set SET prod_type = 'TIER:T1' WHERE emplid = 'E_NEW'`);

      const run = await seedRun(env.runRepo);
      await env.service.runPipeline(run.run_id, YM);

      const rows = await env.resultRepo.find({ where: { list_no: 'OB202605001' } });
      // T3 案件不轉，但全部 ration 100% 在 E_NEW，故全部給 E_NEW
      const srCount = rows.filter((r) => r.emplid === 'E_SR').length;
      expect(srCount).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // TC-V2-STAGE3: CR 動態回分（讀歷史 snapshot 找未成交案件）
  // -------------------------------------------------------------------------
  describe('TC-V2-STAGE3 CR 動態回分', () => {
    it('cr_enabled=true：歷史曾分派但未成交案件納入本月 + is_cr=Y', async () => {
      await seedCardType(env.cardTypeRepo, 'T1');
      await seedList(env.listRepo, { listNo: 'OB202605001', cardType: 'T1', crEnabled: true });
      // 本月新案件 A001
      await seedPool(env.poolRepo, { applNo: 'A001' });
      // 歷史曾分派但未成交案件 A_OLD（仍在 pool 中）
      await seedPool(env.poolRepo, { applNo: 'A_OLD' });
      await seedDeptPct(env.deptPctRepo, { listNo: 'OB202605001', deptId: 'D001', ration: '100.0' });
      await seedEmpl(env.emplSetRepo, {
        listNo: 'OB202605001', deptId: 'D001', emplid: 'E001', ration: '100.0',
      });

      await seedVersion(env.versionRepo, { cardType: 'T1', cardVersion: 1 });
      await seedLevel(env.levelRepo, {
        cardType: 'T1', cardVersion: 1, scoreS: 0, scoreE: 99999, cardLevel: 'A',
      });
      await seedTier(env.tierRepo, { cardType: 'T1', cardLevel: 'A', tierLevel: 'T1' });

      // 先寫一筆歷史 run（202604）→ 含 result snapshot 顯示 A_OLD 曾被分派但 status='PENDING'（未成交）
      const oldRun = await env.runRepo.save(
        env.runRepo.create({
          project_workym: '202604',
          status: 'completed',
          triggered_by: 'a1b2c3d4-e5f6-7890-abcd-ef0123456789',
          created_at: new Date(),
          started_at: new Date(),
          finished_at: new Date(),
        } as Partial<AssignmentRun>),
      );
      await env.snapshotRepo.save(
        env.snapshotRepo.create({
          run_id: oldRun.run_id,
          snapshot_type: 'result',
          payload: {
            assignments: [
              { listNo: 'OB202604001', applNo: 'A_OLD', orgno: '01', status: 'PENDING' },
            ],
          },
          created_at: new Date(),
        } as Partial<AssignmentRunSnapshot>),
      );

      const run = await seedRun(env.runRepo);
      await env.service.runPipeline(run.run_id, YM);

      const rows = await env.resultRepo.find({ where: { list_no: 'OB202605001' } });
      // A001 新件 + A_OLD CR 回分 = 2 筆
      const a_old = rows.find((r) => r.appl_no === 'A_OLD');
      const a001 = rows.find((r) => r.appl_no === 'A001');
      expect(a_old).toBeTruthy();
      expect(a_old?.is_cr).toBe('Y');
      // A001 為新件 → is_cr='N'
      expect(a001?.is_cr).toBe('N');
    });

    it('cr_enabled=false：歷史未成交案件不納入（per-LIST 總開關停用）', async () => {
      await seedCardType(env.cardTypeRepo, 'T1');
      await seedList(env.listRepo, { listNo: 'OB202605001', cardType: 'T1', crEnabled: false });
      await seedPool(env.poolRepo, { applNo: 'A001' });
      await seedPool(env.poolRepo, { applNo: 'A_OLD' });
      await seedDeptPct(env.deptPctRepo, { listNo: 'OB202605001', deptId: 'D001', ration: '100.0' });
      await seedEmpl(env.emplSetRepo, {
        listNo: 'OB202605001', deptId: 'D001', emplid: 'E001', ration: '100.0',
      });

      await seedVersion(env.versionRepo, { cardType: 'T1', cardVersion: 1 });
      await seedLevel(env.levelRepo, {
        cardType: 'T1', cardVersion: 1, scoreS: 0, scoreE: 99999, cardLevel: 'A',
      });
      await seedTier(env.tierRepo, { cardType: 'T1', cardLevel: 'A', tierLevel: 'T1' });

      const oldRun = await env.runRepo.save(
        env.runRepo.create({
          project_workym: '202604',
          status: 'completed',
          triggered_by: 'a1b2c3d4-e5f6-7890-abcd-ef0123456789',
          created_at: new Date(),
          started_at: new Date(),
          finished_at: new Date(),
        } as Partial<AssignmentRun>),
      );
      await env.snapshotRepo.save(
        env.snapshotRepo.create({
          run_id: oldRun.run_id,
          snapshot_type: 'result',
          payload: {
            assignments: [
              { listNo: 'OB202604001', applNo: 'A_OLD', orgno: '01', status: 'PENDING' },
            ],
          },
          created_at: new Date(),
        } as Partial<AssignmentRunSnapshot>),
      );

      const run = await seedRun(env.runRepo);
      await env.service.runPipeline(run.run_id, YM);

      const rows = await env.resultRepo.find({ where: { list_no: 'OB202605001' } });
      // cr_enabled=false → 所有 is_cr='N'
      expect(rows.every((r) => r.is_cr === 'N')).toBe(true);
    });
  });
});
