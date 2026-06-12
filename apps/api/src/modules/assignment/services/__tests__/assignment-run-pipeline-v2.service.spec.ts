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

interface Env {
  service: AssignmentRunPipelineService;
  runRepo: Repository<AssignmentRun>;
  snapshotRepo: Repository<AssignmentRunSnapshot>;
  listRepo: Repository<ObListDefinition>;
  poolRepo: Repository<ObPoolData>;
  resultRepo: Repository<ObMonthlyRunResult>;
  deptPctRepo: Repository<ObDeptPct>;
  emplSetRepo: Repository<ObEmplSet>;
  emphireRepo: Repository<ObEmphire>;
  poolDataListRepo: Repository<ObPoolDataList>;
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
        ObEmphire,
        ObCardType,
        ObLevelcardVersion,
        ObLevelcardColumn,
        ObLevelcardScore,
        ObLevelcardLevel,
        ObTier,
        ObCalendar,
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
    deptPctRepo: app.get(getRepositoryToken(ObDeptPct)),
    emplSetRepo: app.get(getRepositoryToken(ObEmplSet)),
    emphireRepo: app.get(getRepositoryToken(ObEmphire)),
    poolDataListRepo: app.get(getRepositoryToken(ObPoolDataList)),
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
      // F091：list_interval='001' → month_cnt 集合 [1..30]，涵蓋 seedPool monthCnt 1/2/10
      // （原 '030' → 僅 [1]，會排除 monthCnt=2/10 案件）。維持既有 v2 計分案件數 baseline。
      list_interval: '001',
      project_workym: YM,
      caseyear: '113',
      settle_src: '01',
      card_type: opts.cardType,
      case_status: '01$$02',
      cr_enabled: opts.crEnabled ?? false,
      status: 'active',
      stage: 'ready',
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
  opts: { applNo: string; commission?: string; monthCnt?: number; prodKind?: string },
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
      // F091：seedList list_interval='001' → month_cnt 集合 [1..30]；
      // 預設 month_cnt=1（原 null 會被 F091 MONTH_CNT 過濾排除）。明確傳入 monthCnt 之測試不受影響。
      month_cnt: opts.monthCnt ?? 1,
      // Phase 5b：seedList 預設 condition_payload.prod_kind=['A']，
      // seedPool 須對應 prod_kind='A' 以通過 Stage 1 SQL 過濾。
      prod_kind: opts.prodKind ?? 'A',
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

/**
 * F102：seed ob_pool_data_list 之 CR 三欄 + appl_date（Stage 1 由本表帶入 result，I-CR-COLSRC-01）。
 * JS 路徑（executeV2）由 poolDataListRepo 讀回 cr_id/cr_nm/is_cr/appl_date。
 */
async function seedPoolList(
  repo: Repository<ObPoolDataList>,
  opts: {
    listNo: string;
    applNo: string;
    crId?: string | null;
    crNm?: string | null;
    isCr?: string;
    applDate?: string | null;
  },
): Promise<void> {
  await repo.save(
    repo.create({
      list_no: opts.listNo,
      orgno: '01',
      appl_no: opts.applNo,
      custo_no: `C${opts.applNo}`,
      settle_src: '01',
      cr_id: opts.crId ?? null,
      cr_nm: opts.crNm ?? null,
      is_cr: opts.isCr ?? 'N',
      appl_date: opts.applDate ? new Date(`${opts.applDate}T00:00:00Z`) : null,
    } as Partial<ObPoolDataList>),
  );
}

/** F102：seed ob_emphire（CR 失效規則步驟 2 離職清空之來源；resign_date null=在職）。 */
async function seedEmphire(
  repo: Repository<ObEmphire>,
  opts: { empId: string; resignDate?: string | null },
): Promise<void> {
  await repo.save(
    repo.create({
      emp_id: opts.empId,
      emp_nm: `EMP-${opts.empId}`,
      resign_date: opts.resignDate ? new Date(`${opts.resignDate}T00:00:00Z`) : null,
    } as Partial<ObEmphire>),
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
    await env.ds.query('DELETE FROM ob_monthly_run_result');
    await env.ds.query('DELETE FROM assignment_run');
    await env.ds.query('DELETE FROM ob_pool_data_list');
    await env.ds.query('DELETE FROM ob_pool_data');
    await env.ds.query('DELETE FROM ob_dept_pct');
    await env.ds.query('DELETE FROM ob_empl_set');
    await env.ds.query('DELETE FROM ob_emphire');
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
  // TC-V2-STAGE4: F101 真實比例分派（取代 st4_exchange；I-NO-ST4-EXCHANGE）
  //
  // F101 / AD-E07-29：st4_exchange（T1/T2 → senior 10% swap）已廢除。Stage 4 emplid 純由
  // ob_empl_set ration 決定；prod_type='TIER:T*' 為被動標記，不再走任何 senior swap 路徑（REG-002/003）。
  // -------------------------------------------------------------------------
  describe('TC-V2-STAGE4 F101 員工比例分派（no st4_exchange）', () => {
    it('REG-002：senior swap 不發生——T3 員工件數 = 純 ration（非 FLOOR + 10%）', async () => {
      await seedCardType(env.cardTypeRepo, 'T1');
      await seedList(env.listRepo, { listNo: 'OB202605001', cardType: 'T1' });

      // 10 件 T1 案件；E_NEW ration=70、S1（T3 資深）ration=30。
      for (let i = 1; i <= 10; i++) {
        await seedPool(env.poolRepo, {
          applNo: `A${String(i).padStart(3, '0')}`, commission: '10000',
        });
      }
      await seedDeptPct(env.deptPctRepo, { listNo: 'OB202605001', deptId: 'D001', ration: '100.0' });
      await seedEmpl(env.emplSetRepo, {
        listNo: 'OB202605001', deptId: 'D001', emplid: 'E_NEW', ration: '70.0',
      });
      await seedEmpl(env.emplSetRepo, {
        listNo: 'OB202605001', deptId: 'D001', emplid: 'S1', ration: '30.0',
      });

      await seedVersion(env.versionRepo, { cardType: 'T1', cardVersion: 1 });
      await seedLevel(env.levelRepo, {
        cardType: 'T1', cardVersion: 1, scoreS: 0, scoreE: 99999, cardLevel: 'A',
      });
      await seedTier(env.tierRepo, { cardType: 'T1', cardLevel: 'A', tierLevel: 'T1' });
      // prod_type 被動標記（不影響 ration）。
      await env.ds.query(`UPDATE ob_empl_set SET prod_type = 'TIER:T3' WHERE emplid = 'S1'`);
      await env.ds.query(`UPDATE ob_empl_set SET prod_type = 'TIER:T1' WHERE emplid = 'E_NEW'`);

      const run = await seedRun(env.runRepo);
      await env.service.runPipeline(run.run_id, YM);

      const rows = await env.resultRepo.find({ where: { list_no: 'OB202605001' } });
      // 純 ration：E_NEW=FLOOR(10×70/100)=7、S1=FLOOR(10×30/100)=3，diff=0。
      // 若 st4_exchange 仍在，S1（T3）會額外多拿 10% swap → 件數 ≠ 3。
      expect(rows.filter((r) => r.emplid === 'E_NEW').length).toBe(7);
      expect(rows.filter((r) => r.emplid === 'S1').length).toBe(3);
    });

    it('REG-004：is_cr 值不被 Stage 4 修改（被動標記）', async () => {
      await seedCardType(env.cardTypeRepo, 'T1');
      await seedList(env.listRepo, { listNo: 'OB202605001', cardType: 'T1' });
      for (let i = 1; i <= 4; i++) {
        await seedPool(env.poolRepo, { applNo: `A${String(i).padStart(3, '0')}` });
      }
      await seedDeptPct(env.deptPctRepo, { listNo: 'OB202605001', deptId: 'D001', ration: '100.0' });
      await seedEmpl(env.emplSetRepo, {
        listNo: 'OB202605001', deptId: 'D001', emplid: 'E1', ration: '100.0',
      });
      await seedVersion(env.versionRepo, { cardType: 'T1', cardVersion: 1 });
      await seedLevel(env.levelRepo, {
        cardType: 'T1', cardVersion: 1, scoreS: 0, scoreE: 99999, cardLevel: 'A',
      });
      await seedTier(env.tierRepo, { cardType: 'T1', cardLevel: 'A', tierLevel: 'T1' });

      const run = await seedRun(env.runRepo);
      await env.service.runPipeline(run.run_id, YM);

      const rows = await env.resultRepo.find({ where: { list_no: 'OB202605001' } });
      // cr_enabled=false → is_cr 全 'N'（Stage 4 不改）；emplid 全 E1（ration 100%）。
      expect(rows.every((r) => r.is_cr === 'N')).toBe(true);
      expect(rows.every((r) => r.emplid === 'E1')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // TC-V2-STAGE3 (F102): CR 優先分派（JS executeV2 路徑，取代舊歷史 snapshot 動態回分）
  //
  // F102 / AD-E07-30：CR 三欄由 ob_pool_data_list 帶入（I-CR-COLSRC-01）；cr_enabled=true 時
  // 對有 cr_id 且該業代在 ob_empl_set ration>0 之案件 → emplid=cr_id、is_cr='Y'；cr_enabled=false
  // → is_cr 全強制 'N'（BR-F102-02）。YM='202605' → sysDate='2025-05-01'、twoYearsAgo='2023-05-01'。
  // -------------------------------------------------------------------------
  describe('TC-V2-STAGE3 (F102) CR 優先分派', () => {
    it('cr_enabled=true：有效 CR 案件優先指派 emplid=cr_id + is_cr=Y；新件 is_cr=N', async () => {
      await seedCardType(env.cardTypeRepo, 'T1');
      await seedList(env.listRepo, { listNo: 'OB202605001', cardType: 'T1', crEnabled: true });
      // CR 案件 A_CR（cr_id=E001，appl_date 近期、業代在職）；新件 A001（無 cr_id）。
      await seedPool(env.poolRepo, { applNo: 'A_CR' });
      await seedPool(env.poolRepo, { applNo: 'A001' });
      await seedPoolList(env.poolDataListRepo, {
        listNo: 'OB202605001', applNo: 'A_CR', crId: 'E001', crNm: '業代一', isCr: 'Y', applDate: '2025-03-01',
      });
      await seedPoolList(env.poolDataListRepo, {
        listNo: 'OB202605001', applNo: 'A001', crId: null, crNm: null, isCr: 'N', applDate: '2025-03-01',
      });
      await seedEmphire(env.emphireRepo, { empId: 'E001', resignDate: null }); // 在職
      await seedDeptPct(env.deptPctRepo, { listNo: 'OB202605001', deptId: 'D001', ration: '100.0' });
      // E001 在 ob_empl_set 有 ration>0（deptid_m=XVE1）→ CR 優先指派；E_OTHER 供比例池分派新件。
      await seedEmpl(env.emplSetRepo, {
        listNo: 'OB202605001', deptId: 'XVE1', emplid: 'E001', ration: '50.0',
      });
      await seedEmpl(env.emplSetRepo, {
        listNo: 'OB202605001', deptId: 'D001', emplid: 'E_OTH', ration: '100.0',
      });

      await seedVersion(env.versionRepo, { cardType: 'T1', cardVersion: 1 });
      await seedLevel(env.levelRepo, {
        cardType: 'T1', cardVersion: 1, scoreS: 0, scoreE: 99999, cardLevel: 'A',
      });
      await seedTier(env.tierRepo, { cardType: 'T1', cardLevel: 'A', tierLevel: 'T1' });

      const run = await seedRun(env.runRepo);
      await env.service.runPipeline(run.run_id, YM);

      const rows = await env.resultRepo.find({ where: { list_no: 'OB202605001' } });
      const aCr = rows.find((r) => r.appl_no === 'A_CR');
      const a001 = rows.find((r) => r.appl_no === 'A001');
      expect(aCr?.is_cr).toBe('Y');
      expect(aCr?.emplid).toBe('E001'); // emplid=cr_id（CR 優先指派）
      expect(aCr?.dept_id).toBe('XVE1');
      // A001 新件 → is_cr='N'，走 F101 比例分派池（不被 CR 預指派）。
      expect(a001?.is_cr).toBe('N');
    });

    it('cr_enabled=false：is_cr 全強制 N（BR-F102-02）', async () => {
      await seedCardType(env.cardTypeRepo, 'T1');
      await seedList(env.listRepo, { listNo: 'OB202605001', cardType: 'T1', crEnabled: false });
      await seedPool(env.poolRepo, { applNo: 'A_CR' });
      await seedPool(env.poolRepo, { applNo: 'A001' });
      // 來源 ob_pool_data_list 有 is_cr='Y'，但 cr_enabled=false → 強制清 N。
      await seedPoolList(env.poolDataListRepo, {
        listNo: 'OB202605001', applNo: 'A_CR', crId: 'E001', crNm: '業代一', isCr: 'Y', applDate: '2025-03-01',
      });
      await seedPoolList(env.poolDataListRepo, {
        listNo: 'OB202605001', applNo: 'A001', crId: null, crNm: null, isCr: 'N', applDate: '2025-03-01',
      });
      await seedEmphire(env.emphireRepo, { empId: 'E001', resignDate: null });
      await seedDeptPct(env.deptPctRepo, { listNo: 'OB202605001', deptId: 'D001', ration: '100.0' });
      await seedEmpl(env.emplSetRepo, {
        listNo: 'OB202605001', deptId: 'D001', emplid: 'E001', ration: '100.0',
      });

      await seedVersion(env.versionRepo, { cardType: 'T1', cardVersion: 1 });
      await seedLevel(env.levelRepo, {
        cardType: 'T1', cardVersion: 1, scoreS: 0, scoreE: 99999, cardLevel: 'A',
      });
      await seedTier(env.tierRepo, { cardType: 'T1', cardLevel: 'A', tierLevel: 'T1' });

      const run = await seedRun(env.runRepo);
      await env.service.runPipeline(run.run_id, YM);

      const rows = await env.resultRepo.find({ where: { list_no: 'OB202605001' } });
      // cr_enabled=false → 所有 is_cr='N'（含來源 is_cr='Y' 之 A_CR）。
      expect(rows.every((r) => r.is_cr === 'N')).toBe(true);
    });

    it('cr_enabled=true：逾2年清空（appl_date < twoYearsAgo）→ is_cr=N、cr_id 清空', async () => {
      await seedCardType(env.cardTypeRepo, 'T1');
      await seedList(env.listRepo, { listNo: 'OB202605001', cardType: 'T1', crEnabled: true });
      await seedPool(env.poolRepo, { applNo: 'A_OLD' });
      // appl_date '2023-01-01' < twoYearsAgo '2023-05-01' → 步驟 1 清空。
      await seedPoolList(env.poolDataListRepo, {
        listNo: 'OB202605001', applNo: 'A_OLD', crId: 'E001', crNm: '業代一', isCr: 'Y', applDate: '2023-01-01',
      });
      await seedEmphire(env.emphireRepo, { empId: 'E001', resignDate: null });
      await seedDeptPct(env.deptPctRepo, { listNo: 'OB202605001', deptId: 'D001', ration: '100.0' });
      await seedEmpl(env.emplSetRepo, {
        listNo: 'OB202605001', deptId: 'D001', emplid: 'E_OTH', ration: '100.0',
      });

      await seedVersion(env.versionRepo, { cardType: 'T1', cardVersion: 1 });
      await seedLevel(env.levelRepo, {
        cardType: 'T1', cardVersion: 1, scoreS: 0, scoreE: 99999, cardLevel: 'A',
      });
      await seedTier(env.tierRepo, { cardType: 'T1', cardLevel: 'A', tierLevel: 'T1' });

      const run = await seedRun(env.runRepo);
      await env.service.runPipeline(run.run_id, YM);

      const rows = await env.resultRepo.find({ where: { list_no: 'OB202605001' } });
      const aOld = rows.find((r) => r.appl_no === 'A_OLD');
      expect(aOld?.is_cr).toBe('N'); // 逾2年清空
      expect(aOld?.cr_id).toBeNull();
    });
  });
});
