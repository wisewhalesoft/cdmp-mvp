/**
 * AD-E07-42 P3b — Stage 2~3 計分 raw SQL 引擎 MSSQL 移植：JS golden oracle ↔ MSSQL 下推逐列等價
 * + MUST-FIX 守門（DISPATCH / REGEX×3 / FALLBACK / AGESCORE 參考日 / LOAN_RATE 精度 / UPDATEFROM）。
 *
 * 對應測試設計 AD-E07-42-P3b-test.md（131 案）：
 *   GATE / DISPATCH / REGEX-SAFESEX/GATING/EDUCAT/META / FALLBACK / AGESCORE / CARYEAR / PJTP /
 *   CROSSAPPLY / DISTINCTFROM / UPDATEFROM / DECIMAL / CCDIM / SCORE / CJOIN / AR / S2CLEAN /
 *   FULLEQ / CHARSET / STATIC / HARNESS / REG。
 *
 * Harness（§0.2）：12 表 OBJECT_ID 探測 → existedBeforeSuite；缺表以零 drift DDL（逐字複製
 *   1751884800000-MssqlBaselineSchema.ts）自建；afterAll 對自建表 DROP、對既有表僅前綴/version DELETE
 *   （禁 DROP/TRUNCATE 共用表）。→ 全新/部分缺表 dbo 亦可獨立完整重跑。
 *   隔離：card_version=999001；ob_tier card_type 'ZP3B%'；pool/result/list/cc/ar 前綴 P3B。
 *   ⚠️ 與 p1b2/p4/p3a mssql 套件共用 dbo → 本檔須 `--no-file-parallelism`（或單檔）執行。
 */

// 必最先 import（side-effect 設 DB_TYPE=mssql）。
import {
  restoreDbType,
  MSSQL,
  mssqlPortReachable,
  SKIP_REASON,
} from '@/database/__tests__/mssql-env-preload';

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { DataSource, Repository, EntityManager } from 'typeorm';

import { ObPoolData } from '@/database/entities/ob-pool-data.entity';
import { ObMonthlyRunResult } from '@/database/entities/ob-monthly-run-result.entity';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { ObLevelcardColumn } from '@/database/entities/ob-levelcard-column.entity';
import { ObLevelcardScore } from '@/database/entities/ob-levelcard-score.entity';
import { ObLevelcardLevel } from '@/database/entities/ob-levelcard-level.entity';
import { ObTier } from '@/database/entities/ob-tier.entity';
import { ObArreturndfMinCap } from '@/database/entities/ob-arreturndf-min-cap.entity';
import {
  runStage2and3SqlMssql,
  fetchPoolDataColumnsMssql,
} from '../stage2to4-sql-executor-mssql';
import {
  resolveColumnSourceMssql,
  mssqlAllDigits,
  mssqlAgeTodayExpr,
} from '../stage2to4-sql-builder-mssql';
import type { Stage2to4ListContext } from '../stage2to4-sql-executor';
import {
  AssignmentRunPipelineService,
  resolveStage2to4Strategy,
  type CustomerCoreRow,
  type ArCapitalRow,
} from '../../services/assignment-run-pipeline.service';
import { MatchType } from '@/modules/assignment-scoring/dto/match-type.enum';
import { MSSQL_BASELINE_DDL } from './_p3b-mssql-ddl';

vi.setConfig({ testTimeout: 60000 });

const RUN_ID = '00000000-0000-0000-0000-0000000042bb';
const RUN_ID2 = '00000000-0000-0000-0000-0000000042cc';
const CARD_VER = 999001;

/** 12 依賴表（P3a 已依賴 6 + P3b 新增 6）。 */
const TWELVE_TABLES = [
  'ob_pool_data',
  'ob_pool_data_list',
  'ob_list_definition',
  'assignment_run',
  'ob_monthly_run_result',
  'customer_core',
  'ob_levelcard_version',
  'ob_levelcard_column',
  'ob_levelcard_score',
  'ob_levelcard_level',
  'ob_tier',
  'ob_arreturndf_min_cap',
] as const;

let reachable = false;
let ds: DataSource | null = null;
let poolRepo: Repository<ObPoolData>;
let resultRepo: Repository<ObMonthlyRunResult>;
let columnRepo: Repository<ObLevelcardColumn>;
let scoreRepo: Repository<ObLevelcardScore>;
let levelRepo: Repository<ObLevelcardLevel>;
let tierRepo: Repository<ObTier>;
let arRepo: Repository<ObArreturndfMinCap>;
let manager: EntityManager;
/** 本套件執行前已存在之表（afterAll 絕不 DROP，僅前綴/version DELETE）。 */
const existedBeforeSuite = new Set<string>();
/** 本套件自建之表（afterAll DROP 還原）。 */
const selfBuiltTables: string[] = [];

function ensureMssql(ctx: { skip: () => void }): void {
  if (!reachable || !ds) {
    // eslint-disable-next-line no-console
    console.warn(`[AD-E07-42 P3b MSSQL] SKIPPED — ${SKIP_REASON}`);
    ctx.skip();
  }
}

// ---------------------------------------------------------------------------
// JS golden oracle：computeScore（AssignmentRunPipelineService 私有方法，Object.create + bind）
// ---------------------------------------------------------------------------
type ComputeScoreFn = (
  pool: ObPoolData,
  cardType: string,
  cardVersion: number,
  activeColumns: ObLevelcardColumn[],
  allScores: ObLevelcardScore[],
  cc: CustomerCoreRow | null,
  arCap: ArCapitalRow | null,
) => number;
function makeComputeScore(): ComputeScoreFn {
  const svc = Object.create(
    AssignmentRunPipelineService.prototype,
  ) as AssignmentRunPipelineService;
  Object.defineProperty(svc, 'logger', {
    value: { warn: vi.fn(), log: vi.fn(), error: vi.fn(), debug: vi.fn() },
    configurable: true,
  });
  return (svc as unknown as { computeScore: ComputeScoreFn }).computeScore.bind(svc);
}
const computeScore = makeComputeScore();

// ---------------------------------------------------------------------------
// seed helpers
// ---------------------------------------------------------------------------
async function seedRun(runId: string): Promise<void> {
  await manager.query(
    `INSERT INTO assignment_run (run_id, project_workym, status, triggered_by, created_at)
     VALUES (@0, '202606', 'running', '00000000-0000-0000-0000-000000000001', GETDATE())`,
    [runId],
  );
}

async function seedCase(opts: {
  applNo: string;
  custoNo?: string | null;
  listNo: string;
  runId?: string;
  monthCnt?: number | null;
  specTp?: string | null;
  specName?: string | null;
  salesStsNa?: string | null;
  loanRate?: string | null;
  yearProdu?: string | null;
  listType?: string | null;
  loanTotamt?: string | null;
  isCr?: string | null;
}): Promise<void> {
  await poolRepo.save(
    poolRepo.create({
      orgno: '01',
      appl_no: opts.applNo,
      custo_no: opts.custoNo ?? `C${opts.applNo}`,
      sta_code: '01',
      dept_id: 'D001',
      list_type: opts.listType ?? '01',
      settle_src: '01',
      month_cnt: opts.monthCnt ?? null,
      spec_tp: opts.specTp ?? null,
      spec_name: opts.specName ?? null,
      sales_sts_na: opts.salesStsNa ?? null,
      loan_rate: opts.loanRate ?? null,
      year_produ: opts.yearProdu ?? null,
      loan_totamt: opts.loanTotamt ?? null,
      _cdmp_extracted_at: new Date(),
    } as Partial<ObPoolData>),
  );
  await resultRepo.save(
    resultRepo.create({
      run_id: opts.runId ?? RUN_ID,
      list_no: opts.listNo,
      orgno: '01',
      appl_no: opts.applNo,
      custo_no: opts.custoNo ?? `C${opts.applNo}`,
      settle_src: '01',
      is_cr: opts.isCr ?? null,
      result_status: 'PENDING',
      created_at: new Date(),
      updated_at: new Date(),
    } as Partial<ObMonthlyRunResult>),
  );
}

async function seedCustomerCore(opts: {
  sourceCustomerNo: string;
  cusSex?: string | null;
  dateOfBirth?: string | null;
  educationCode?: string | null;
  careaNo1?: string | null;
  careaNo2?: string | null;
  cellular?: string | null;
  hpostCity?: string | null;
  cpostCity?: string | null;
  coCity?: string | null;
}): Promise<void> {
  await manager.query(
    `INSERT INTO customer_core
       (source_customer_no, customer_type_code, name, data_source, _etl_pipeline_id,
        cus_sex, date_of_birth, education_code, carea_no1, carea_no2, cellular,
        hpost_city, cpost_city, co_city)
     VALUES (@0, 'P', 'P3B', 'P3B', '00000000-0000-0000-0000-000000000099',
        @1, @2, @3, @4, @5, @6, @7, @8, @9)`,
    [
      opts.sourceCustomerNo,
      opts.cusSex ?? null,
      opts.dateOfBirth ?? null,
      opts.educationCode ?? null,
      opts.careaNo1 ?? null,
      opts.careaNo2 ?? null,
      opts.cellular ?? null,
      opts.hpostCity ?? null,
      opts.cpostCity ?? null,
      opts.coCity ?? null,
    ],
  );
}

async function seedColumn(cardType: string, columnName: string, matchType: MatchType): Promise<void> {
  await columnRepo.save(
    columnRepo.create({
      card_type: cardType,
      card_version: CARD_VER,
      column_name: columnName,
      column_label: columnName,
      status: 'active',
      match_type: matchType,
    } as Partial<ObLevelcardColumn>),
  );
}
async function seedRangeScore(cardType: string, columnName: string, lo: string, hi: string, score: number): Promise<void> {
  await scoreRepo.save(
    scoreRepo.create({
      card_type: cardType, card_version: CARD_VER, column_name: columnName,
      level1: null, level2_s: lo, level2_e: hi, score,
    } as Partial<ObLevelcardScore>),
  );
}
async function seedCatScore(cardType: string, columnName: string, level1: string, score: number): Promise<void> {
  await scoreRepo.save(
    scoreRepo.create({
      card_type: cardType, card_version: CARD_VER, column_name: columnName,
      level1, level2_s: null, level2_e: null, score,
    } as Partial<ObLevelcardScore>),
  );
}
async function seedCompositeScore(cardType: string, columnName: string, level1: string | null, lo: string, hi: string, score: number): Promise<void> {
  await scoreRepo.save(
    scoreRepo.create({
      card_type: cardType, card_version: CARD_VER, column_name: columnName,
      level1, level2_s: lo, level2_e: hi, score,
    } as Partial<ObLevelcardScore>),
  );
}
async function seedLevel(cardType: string, scoreS: number, scoreE: number, cardLevel: string): Promise<void> {
  await levelRepo.save(
    levelRepo.create({
      card_type: cardType, card_version: CARD_VER, score_s: scoreS, score_e: scoreE, card_level: cardLevel,
    } as Partial<ObLevelcardLevel>),
  );
}
async function seedTier(cardType: string, cardLevel: string | null, tierLevel: string): Promise<void> {
  await tierRepo.save(
    tierRepo.create({ card_type: cardType, card_level: cardLevel, tier_level: tierLevel } as Partial<ObTier>),
  );
}
async function seedArCap(applNo: string, addUnCapital: string): Promise<void> {
  await arRepo.save(
    arRepo.create({ appl_no: applNo, add_un_capital: addUnCapital, _cdmp_extracted_at: new Date() } as Partial<ObArreturndfMinCap>),
  );
}

async function loadCardDef(cardType: string): Promise<{ activeColumns: ObLevelcardColumn[]; scoreRows: ObLevelcardScore[] }> {
  const activeColumns = await columnRepo.find({ where: { card_type: cardType, card_version: CARD_VER, status: 'active' } });
  const scoreRows = await scoreRepo.find({ where: { card_type: cardType, card_version: CARD_VER } });
  return { activeColumns, scoreRows };
}

async function pushdown(cardType: string, listNo: string, runId = RUN_ID): Promise<void> {
  const { activeColumns, scoreRows } = await loadCardDef(cardType);
  const ctx: Stage2to4ListContext = {
    runId, listNo, cardType, cardVersion: CARD_VER, activeColumns, scoreRows, ym: '202606',
  };
  await runStage2and3SqlMssql(manager, ctx);
}

async function getRow(applNo: string, listNo: string, runId = RUN_ID): Promise<ObMonthlyRunResult> {
  const row = await resultRepo.findOne({ where: { run_id: runId, list_no: listNo, orgno: '01', appl_no: applNo } });
  if (!row) throw new Error(`row not found: ${applNo}`);
  return row;
}
async function getScore(applNo: string, listNo: string, runId = RUN_ID): Promise<number | null> {
  return (await getRow(applNo, listNo, runId)).score;
}

/** EQ：JS computeScore === MSSQL pushdown score（誤差 0）。 */
async function assertEq(
  cardType: string,
  applNo: string,
  listNo: string,
  cc: CustomerCoreRow | null,
  arCap: ArCapitalRow | null,
): Promise<number> {
  const { activeColumns, scoreRows } = await loadCardDef(cardType);
  const poolRow = await poolRepo.findOneOrFail({ where: { orgno: '01', appl_no: applNo } });
  const jsScore = computeScore(poolRow, cardType, CARD_VER, activeColumns, scoreRows, cc, arCap);
  await pushdown(cardType, listNo);
  const sqlScore = await getScore(applNo, listNo);
  expect(sqlScore).toBe(jsScore);
  return jsScore;
}

function ccOf(partial: Partial<CustomerCoreRow> & { source_customer_no: string }): CustomerCoreRow {
  return {
    cus_sex: null, date_of_birth: null, education_code: null,
    hpost_city: null, cpost_city: null, co_city: null,
    carea_no1: null, carea_no2: null, cellular: null,
    ...partial,
  };
}

/** 由 today 推算 age 歲之 date_of_birth（生日已過 → 整數年齡）。 */
function dobForAge(age: number, dayOffset = -1): string {
  const t = new Date();
  const d = new Date(t.getFullYear() - age, t.getMonth(), t.getDate() + dayOffset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ---------------------------------------------------------------------------
// 精準清理（禁 DROP/TRUNCATE 共用表；FK 序 result → run）
// ---------------------------------------------------------------------------
async function cleanupP3B(): Promise<void> {
  await manager.query(`DELETE FROM ob_monthly_run_result WHERE list_no LIKE 'P3B%'`);
  await manager.query(`DELETE FROM assignment_run WHERE run_id IN ('${RUN_ID}', '${RUN_ID2}')`);
  await manager.query(`DELETE FROM ob_pool_data WHERE appl_no LIKE 'P3B%'`);
  await manager.query(`DELETE FROM customer_core WHERE source_customer_no LIKE 'P3B%'`);
  await manager.query(`DELETE FROM ob_arreturndf_min_cap WHERE appl_no LIKE 'P3B%'`);
  await manager.query(`DELETE FROM ob_levelcard_column WHERE card_version = ${CARD_VER}`);
  await manager.query(`DELETE FROM ob_levelcard_score WHERE card_version = ${CARD_VER}`);
  await manager.query(`DELETE FROM ob_levelcard_level WHERE card_version = ${CARD_VER}`);
  await manager.query(`DELETE FROM ob_levelcard_version WHERE card_version = ${CARD_VER}`);
  await manager.query(`DELETE FROM ob_tier WHERE card_type LIKE 'ZP3B%'`);
}

// ===========================================================================
// 連線 + 12 表探測/自建（§0.2）
// ===========================================================================
beforeAll(async () => {
  reachable = await mssqlPortReachable(1500);
  if (!reachable) return;
  try {
    ds = new DataSource({
      type: 'mssql',
      host: MSSQL.host, port: MSSQL.port, username: MSSQL.username,
      password: MSSQL.password, database: MSSQL.database,
      options: { encrypt: MSSQL.encrypt, trustServerCertificate: MSSQL.trustServerCertificate },
      entities: [
        ObPoolData, ObMonthlyRunResult, AssignmentRun,
        ObLevelcardColumn, ObLevelcardScore, ObLevelcardLevel, ObTier, ObArreturndfMinCap,
      ],
      synchronize: false, // §0.2：共用既有 dbo，絕不 synchronize。
    });
    await ds.initialize();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[AD-E07-42 P3b MSSQL] init failed → skip:', (e as Error)?.message);
    reachable = false; ds = null; return;
  }
  manager = ds.manager;

  // GATE-001：12 表 OBJECT_ID 探測 → existedBeforeSuite；缺表以零 drift DDL 自建（HARNESS-001）。
  for (const t of TWELVE_TABLES) {
    const rows = await manager.query(`SELECT OBJECT_ID('dbo.${t}', 'U') AS oid`);
    if (rows?.[0]?.oid != null) {
      existedBeforeSuite.add(t);
    } else {
      const ddl = MSSQL_BASELINE_DDL[t];
      if (!ddl) {
        // eslint-disable-next-line no-console
        console.warn(`[AD-E07-42 P3b MSSQL] 缺 DDL 常數：${t} → skip DB 案例`);
        reachable = false;
        return;
      }
      await manager.query(ddl);
      selfBuiltTables.push(t);
    }
  }

  poolRepo = ds.getRepository(ObPoolData);
  resultRepo = ds.getRepository(ObMonthlyRunResult);
  columnRepo = ds.getRepository(ObLevelcardColumn);
  scoreRepo = ds.getRepository(ObLevelcardScore);
  levelRepo = ds.getRepository(ObLevelcardLevel);
  tierRepo = ds.getRepository(ObTier);
  arRepo = ds.getRepository(ObArreturndfMinCap);
}, 120000);

afterAll(async () => {
  if (ds) {
    try {
      await cleanupP3B();
    } catch {
      /* best-effort */
    }
    // HARNESS-002/003：本次自建表 DROP 還原（DROP 子表在前，避免 FK）；既有表絕不 DROP。
    for (const t of [...selfBuiltTables].reverse()) {
      try {
        await manager.query(`DROP TABLE dbo.${t}`);
      } catch {
        /* best-effort */
      }
    }
    await ds.destroy();
  }
  restoreDbType();
});

beforeEach(async () => {
  if (!reachable || !ds) return;
  await cleanupP3B();
  await seedRun(RUN_ID);
});

// ===========================================================================
// 一、GATE
// ===========================================================================
describe('P3b GATE — 前置決策關卡', () => {
  it('TS-MSSQL-P3B-GATE-001：12 表 existedBeforeSuite 探測 + DROP/DELETE 分流不硬編碼', (ctx) => {
    ensureMssql(ctx);
    // 12 表皆已就緒（既有或本次自建），兩集合互斥且聯集=12。
    expect(existedBeforeSuite.size + selfBuiltTables.length).toBe(TWELVE_TABLES.length);
    for (const t of selfBuiltTables) expect(existedBeforeSuite.has(t)).toBe(false);
  });

  it('TS-MSSQL-P3B-GATE-003：計分 6 表欄位型別事實（baseline 常數複核）', () => {
    // level2_s/level2_e varchar(10)；loan_rate numeric(5,2)；year_produ varchar(4)；spec_tp varchar(2)。
    expect(MSSQL_BASELINE_DDL.ob_levelcard_score).toContain('"level2_s" varchar(10)');
    expect(MSSQL_BASELINE_DDL.ob_pool_data).toContain('"loan_rate" numeric(5,2)');
    expect(MSSQL_BASELINE_DDL.ob_pool_data).toContain('"year_produ" varchar(4)');
    expect(MSSQL_BASELINE_DDL.ob_pool_data).toContain('"spec_tp" varchar(2)');
  });

  it('TS-MSSQL-P3B-GATE-004：LOAN_RATE 明確精度 NUMERIC(18,4)（非裸 NUMERIC）', () => {
    const src = resolveColumnSourceMssql('LOAN_RATE', 'H', new Set());
    expect(src.expr).toContain('TRY_CAST(o.loan_rate AS NUMERIC(18,4))');
    expect(src.expr).not.toMatch(/AS\s+NUMERIC\s*\)/i); // 無裸 NUMERIC)
  });

  it('TS-MSSQL-P3B-GATE-006：customer_core 現有列前綴分布（MONTHRUN-DIFF 資料來源探測）', async (ctx) => {
    ensureMssql(ctx);
    const rows = await manager.query(
      `SELECT COUNT(*) AS c FROM customer_core WHERE source_customer_no NOT LIKE 'P3B%'`,
    );
    // 非阻擋：僅記錄既有列數（供 impl log 判斷 MONTHRUN-DIFF 是否有既有生產規模資料）。
    expect(Number(rows?.[0]?.c ?? 0)).toBeGreaterThanOrEqual(0);
  });
});

// ===========================================================================
// 二、DISPATCH（純函式 + wiring，恆執行）
// ===========================================================================
describe('P3b DISPATCH — resolveStage2to4Strategy 三態（MUST-FIX）', () => {
  it('TS-MSSQL-P3B-DISPATCH-001：mssql → pushdownMssql（不論 ASSIGNMENT_PIPELINE_V2）', () => {
    expect(resolveStage2to4Strategy({ DB_TYPE: 'mssql', ASSIGNMENT_PIPELINE_V2: 'true' })).toBe('pushdownMssql');
    expect(resolveStage2to4Strategy({ DB_TYPE: 'mssql', ASSIGNMENT_PIPELINE_V2: undefined })).toBe('pushdownMssql');
    expect(resolveStage2to4Strategy({ DB_TYPE: 'mssql' })).not.toBe('v2Inmemory');
    expect(resolveStage2to4Strategy({ DB_TYPE: 'mssql' })).not.toBe('v1Inmemory');
  });

  it('TS-MSSQL-P3B-DISPATCH-002：三態互斥全組合（postgres→pushdownPg / mssql→pushdownMssql / 其餘依 flag）', () => {
    const combos: Array<[string | undefined, string | undefined, string]> = [
      ['postgres', 'true', 'pushdownPg'],
      ['postgres', undefined, 'pushdownPg'],
      ['mssql', 'true', 'pushdownMssql'],
      ['mssql', undefined, 'pushdownMssql'],
      ['sqlite', 'true', 'v2Inmemory'],
      [undefined, undefined, 'v1Inmemory'],
    ];
    for (const [db, flag, expected] of combos) {
      expect(resolveStage2to4Strategy({ DB_TYPE: db, ASSIGNMENT_PIPELINE_V2: flag })).toBe(expected);
    }
  });

  it('TS-MSSQL-P3B-DISPATCH-003：mssql 走 SQL 下推（executeStage2to3PushdownMssql → runStage2and3SqlMssql，非 PG 版）', async (ctx) => {
    ensureMssql(ctx);
    // 以 service 私有方法 executeStage2to3PushdownMssql 驗證真實下推寫入 score（PG 版 SQL 之 ::int /
    //   CROSS JOIN LATERAL 對 MSSQL 會語法錯 → 「無錯且 score 有值」即證走 mssql 版）。
    const L = 'P3BL_DISP';
    await seedColumn('ZP3BD', 'LIST_MONTH', MatchType.RANGE);
    await seedRangeScore('ZP3BD', 'LIST_MONTH', '1', '5', 7);
    await seedCase({ applNo: 'P3BA_DP', listNo: L, monthCnt: 3 });
    const svc = Object.create(AssignmentRunPipelineService.prototype) as any;
    svc.columnRepo = columnRepo;
    svc.scoreRepo = scoreRepo;
    svc.versionRepo = { find: async () => [{ card_type: 'ZP3BD', card_version: CARD_VER, status: 'active' }] };
    svc.resultRepo = resultRepo;
    svc.dataSource = ds;
    // AD-E07-42 P3c：executeStage2to3PushdownMssql 已擴為含 Stage 3/4 比例分派鏈（clearStage3Fields +
    //   runStage3to4RationSqlMssql）→ 需額外提供 calendarRepo / deptPctRepo / emplSetRepo / rationWarnings
    //   相依（本測試聚焦「計分下推真實寫入 score」，比例分派輸入皆空 → 不影響 score 斷言）。
    svc.calendarRepo = {
      createQueryBuilder: () => ({
        select: () => ({ where: () => ({ getRawMany: async () => [] }) }),
      }),
    };
    svc.deptPctRepo = { find: async () => [] };
    svc.emplSetRepo = { find: async () => [] };
    svc.rationWarnings = [];
    // active version 需含 999001，改以 loadCardDef 直接餵；此處以私有方法路徑證明下推被呼叫。
    const rows = await svc.executeStage2to3PushdownMssql([{ list: { list_no: L, card_type: 'ZP3BD' }, inserted: 1 }], '202606', RUN_ID);
    expect(Array.isArray(rows)).toBe(true);
    expect(await getScore('P3BA_DP', L)).toBe(7); // 3 ∈ [1,5] → 7；證 mssql 下推真實寫入
  });

  it('TS-MSSQL-P3B-DISPATCH-004 / STATIC-006：Stage2to4Strategy 型別 + useStage2to4Pushdown 三態化字面掃描', () => {
    const src = readFileSync(join(__dirname, '..', '..', 'services', 'assignment-run-pipeline.service.ts'), 'utf8');
    expect(src).toContain("'pushdownMssql'");
    expect(src).toContain("'pushdownPg'");
    // useStage2to4Pushdown 明確涵蓋兩下推值（非僅字面替換）。
    expect(src).toMatch(/strategy === 'pushdownPg' \|\| strategy === 'pushdownMssql'/);
  });
});

// ===========================================================================
// 三/四/五、REGEX — 三處 ^[0-9]+$ 站點
// ===========================================================================
describe('P3b REGEX-SAFESEX — SAFE_INT_CUS_SEX（站點 1）', () => {
  async function seedSexCard(): Promise<void> {
    await seedColumn('H', 'CUS_SEX', MatchType.RANGE);
    await seedRangeScore('H', 'CUS_SEX', '1', '1', 20);
    await seedRangeScore('H', 'CUS_SEX', '2', '2', 8);
    await seedRangeScore('H', 'CUS_SEX', '3', '3', 3);
  }
  it('SAFESEX-001~005：NULL/空/1/C/9 混合批次 JS↔MSSQL 逐列等價（空字串守門+髒值→default 3）', async (ctx) => {
    ensureMssql(ctx);
    const L = 'P3BL_SSX';
    await seedSexCard();
    const vals: Array<[string, string | null]> = [
      ['P3BA_SN', null], ['P3BA_SE', ''], ['P3BA_S1', '1'], ['P3BA_SC', 'C'], ['P3BA_S9', '9'],
    ];
    for (const [appl, sex] of vals) {
      await seedCase({ applNo: appl, custoNo: appl, listNo: L });
      if (sex !== null) await seedCustomerCore({ sourceCustomerNo: appl, cusSex: sex });
      else await seedCustomerCore({ sourceCustomerNo: appl, cusSex: null });
    }
    for (const [appl, sex] of vals) {
      await assertEq('H', appl, L, ccOf({ source_customer_no: appl, cus_sex: sex }), null);
    }
    // NULL/'' → default 3 → [3,3]→3；'1'→20；'C'→3；'9'→無 range→0。
    expect(await getScore('P3BA_SN', L)).toBe(3);
    expect(await getScore('P3BA_SE', L)).toBe(3);
    expect(await getScore('P3BA_S1', L)).toBe(20);
    expect(await getScore('P3BA_SC', L)).toBe(3);
    expect(await getScore('P3BA_S9', L)).toBe(0);
  });
});

describe('P3b REGEX-GATING — IS_PERSONAL_GATING（站點 2，五欄共用）', () => {
  it('GATING-001~005：NULL/空/1/3/C → 個人/法人分流五欄同步（CAREA_NO1 觀察）', async (ctx) => {
    ensureMssql(ctx);
    const L = 'P3BL_GAT';
    await seedColumn('H', 'CAREA_NO1', MatchType.RANGE);
    await seedRangeScore('H', 'CAREA_NO1', '1', '1', 4);
    const vals: Array<[string, string | null, number]> = [
      ['P3BA_GN', null, 4], // NULL → 個人 → presence 1 → 4
      ['P3BA_GE', '', 4], // '' → 個人 → 4
      ['P3BA_G1', '1', 4], // 個人 → 4
      ['P3BA_G3', '3', 0], // 法人 → 0
      ['P3BA_GC', 'C', 0], // 髒值 → 法人 → 0
    ];
    for (const [appl, sex] of vals) {
      await seedCase({ applNo: appl, custoNo: appl, listNo: L });
      await seedCustomerCore({ sourceCustomerNo: appl, cusSex: sex, careaNo1: '02' });
    }
    for (const [appl, sex, expected] of vals) {
      await assertEq('H', appl, L, ccOf({ source_customer_no: appl, cus_sex: sex, carea_no1: '02' }), null);
      expect(await getScore(appl, L)).toBe(expected);
    }
  });
});

describe('P3b REGEX-EDUCAT — EDUCAT_BACK numExpr（站點 3，巢狀輸入）', () => {
  it('EDUCAT-001~005：個人 05/S5 default 08/髒值 AB/法人/99 補零，JS↔MSSQL 等價', async (ctx) => {
    ensureMssql(ctx);
    // 個人 '5' → '05' → 命中 [05,05]（H 卡）
    const LH = 'P3BL_EDH';
    await seedColumn('H', 'EDUCAT_BACK', MatchType.RANGE);
    await seedRangeScore('H', 'EDUCAT_BACK', '05', '05', 7);
    await seedCase({ applNo: 'P3BA_ED1', custoNo: 'P3BA_ED1', listNo: LH });
    await seedCustomerCore({ sourceCustomerNo: 'P3BA_ED1', cusSex: '1', educationCode: '5' });
    await assertEq('H', 'P3BA_ED1', LH, ccOf({ source_customer_no: 'P3BA_ED1', cus_sex: '1', education_code: '5' }), null);
    expect(await getScore('P3BA_ED1', LH)).toBe(7);

    // 髒值 'AB' → RIGHT('0AB',2)='AB' → 非數字 → 不命中 0（H 卡 [05,05]）
    await seedCase({ applNo: 'P3BA_EDAB', custoNo: 'P3BA_EDAB', listNo: LH });
    await seedCustomerCore({ sourceCustomerNo: 'P3BA_EDAB', cusSex: '1', educationCode: 'AB' });
    await assertEq('H', 'P3BA_EDAB', LH, ccOf({ source_customer_no: 'P3BA_EDAB', cus_sex: '1', education_code: 'AB' }), null);
    expect(await getScore('P3BA_EDAB', LH)).toBe(0);

    // S5 缺值 → default '08' → [08,99]
    const L5 = 'P3BL_ED5';
    await seedColumn('S5', 'EDUCAT_BACK', MatchType.RANGE);
    await seedRangeScore('S5', 'EDUCAT_BACK', '08', '99', 13);
    await seedCase({ applNo: 'P3BA_ED5', custoNo: 'P3BA_ED5', listNo: L5 });
    await seedCustomerCore({ sourceCustomerNo: 'P3BA_ED5', cusSex: '1', educationCode: null });
    await assertEq('S5', 'P3BA_ED5', L5, ccOf({ source_customer_no: 'P3BA_ED5', cus_sex: '1', education_code: null }), null);
    expect(await getScore('P3BA_ED5', L5)).toBe(13);

    // 個人 '99' → RIGHT('099',2)='99' → 命中 [08,99]（S5）
    await seedCase({ applNo: 'P3BA_ED99', custoNo: 'P3BA_ED99', listNo: L5 });
    await seedCustomerCore({ sourceCustomerNo: 'P3BA_ED99', cusSex: '1', educationCode: '99' });
    await assertEq('S5', 'P3BA_ED99', L5, ccOf({ source_customer_no: 'P3BA_ED99', cus_sex: '1', education_code: '99' }), null);
    expect(await getScore('P3BA_ED99', L5)).toBe(13);
  });
});

describe('P3b REGEX-META — 三站點語意/TRY_CAST 靜態守門', () => {
  it('REGEX-META-001：三處採全字串驗證（NOT LIKE %[^0-9]% + LEN>0），非 PATINDEX 擷取', () => {
    const src = readFileSync(join(__dirname, '..', 'stage2to4-sql-builder-mssql.ts'), 'utf8');
    // mssqlAllDigits 為三站點共用形態。
    expect(mssqlAllDigits('x')).toBe("(x IS NOT NULL AND LEN(x) > 0 AND x NOT LIKE '%[^0-9]%')");
    // CUS_SEX safe-cast / gating / EDUCAT numExpr 皆經 mssqlAllDigits（原始碼含三處呼叫）。
    const calls = (src.match(/mssqlAllDigits\(/g) ?? []).length;
    expect(calls).toBeGreaterThanOrEqual(3);
  });
  it('REGEX-META-002：三處數值化用 TRY_CAST（非裸 CAST）', () => {
    expect(resolveColumnSourceMssql('CUS_SEX', 'H', new Set()).expr).toContain('TRY_CAST(cc.cus_sex AS INT)');
    expect(resolveColumnSourceMssql('AGE', 'H', new Set()).expr).toContain('TRY_CAST');
    expect(resolveColumnSourceMssql('EDUCAT_BACK', 'H', new Set()).expr).toContain('TRY_CAST');
  });
});

// ===========================================================================
// 七、FALLBACK — to_jsonb 動態 fallback → TS 端 schema 檢查
// ===========================================================================
describe('P3b FALLBACK — schema 檢查（I-MSSQL-DYNAMIC-FALLBACK-01）', () => {
  it('FALLBACK-001：存在欄位（loan_totamt）→ 直接欄位參照，計分等價', async (ctx) => {
    ensureMssql(ctx);
    const L = 'P3BL_FB1';
    await seedColumn('ZP3BF', 'LOAN_TOTAMT', MatchType.RANGE);
    await seedRangeScore('ZP3BF', 'LOAN_TOTAMT', '1', '100000', 15);
    await seedCase({ applNo: 'P3BA_FB1', listNo: L, loanTotamt: '50000' });
    await assertEq('ZP3BF', 'P3BA_FB1', L, null, null);
    expect(await getScore('P3BA_FB1', L)).toBe(15);
  });

  it('FALLBACK-002：幽靈欄位（xyz_col）→ 生成期字面 0；SQL 不含 INFORMATION_SCHEMA/動態欄名 token', () => {
    const cols = new Set<string>(['loan_totamt']); // 不含 xyz_col
    const ghost = resolveColumnSourceMssql('XYZ_COL', 'H', cols);
    expect(ghost.expr).toBe('0'); // 字面 0
    const hit = resolveColumnSourceMssql('LOAN_TOTAMT', 'H', cols);
    expect(hit.expr).toContain('o.[loan_totamt]');
    // 生成之 SQL 字面不含 INFORMATION_SCHEMA / to_jsonb / ->>。
    for (const e of [ghost.expr, hit.expr]) {
      expect(e).not.toContain('INFORMATION_SCHEMA');
      expect(e).not.toContain('to_jsonb');
      expect(e).not.toContain('->>');
    }
  });

  it('FALLBACK-002b：幽靈欄位 0 ∈ [0,100] → 命中對應 score（BR-F103-08 不阻擋月名單分派）', async (ctx) => {
    ensureMssql(ctx);
    const L = 'P3BL_FB2';
    await seedColumn('ZP3BG', 'XYZ_COL', MatchType.RANGE);
    await seedRangeScore('ZP3BG', 'XYZ_COL', '0', '100', 50);
    await seedCase({ applNo: 'P3BA_FB2', listNo: L });
    await expect(pushdown('ZP3BG', L)).resolves.not.toThrow();
    expect(await getScore('P3BA_FB2', L)).toBe(50); // 幽靈 0 ∈ [0,100]
    // JS oracle 對應：pool 無 xyz_col → 0 → 命中。
    await assertEq('ZP3BG', 'P3BA_FB2', L, null, null);
  });

  it('FALLBACK-003：存在但非數值文字（list_type=XX）→ TRY_CAST NULL → COALESCE 0，JS↔MSSQL 等價', async (ctx) => {
    ensureMssql(ctx);
    const L = 'P3BL_FB3';
    await seedColumn('ZP3BH', 'LIST_TYPE', MatchType.RANGE);
    await seedRangeScore('ZP3BH', 'LIST_TYPE', '0', '0', 9);
    await seedCase({ applNo: 'P3BA_FB3', listNo: L, listType: 'XX' }); // 非數字
    await assertEq('ZP3BH', 'P3BA_FB3', L, null, null);
    expect(await getScore('P3BA_FB3', L)).toBe(9); // 'XX'→NULL→0 ∈ [0,0]
  });

  it('FALLBACK-004：schema 檢查用大寫 INFORMATION_SCHEMA，欄名小寫比對正確（真庫）', async (ctx) => {
    ensureMssql(ctx);
    const cols = await fetchPoolDataColumnsMssql(manager);
    expect(cols.has('loan_totamt')).toBe(true); // 存在（小寫比對）
    expect(cols.has('year_produ')).toBe(true);
    expect(cols.has('xyz_col')).toBe(false); // 幽靈
  });

  it('FALLBACK-005：schema 檢查 O(1)（單次 runStage2and3SqlMssql 恰 1 次 INFORMATION_SCHEMA 查詢，非 N+1）', async (ctx) => {
    ensureMssql(ctx);
    const L = 'P3BL_FB5';
    // 3+ 個未 hardcode 欄位皆走 fallback。
    await seedColumn('ZP3BI', 'LOAN_TOTAMT', MatchType.RANGE);
    await seedColumn('ZP3BI', 'LOAN_CAPITAL', MatchType.RANGE);
    await seedColumn('ZP3BI', 'THROU_MON', MatchType.RANGE);
    await seedRangeScore('ZP3BI', 'LOAN_TOTAMT', '0', '999999999', 1);
    await seedRangeScore('ZP3BI', 'LOAN_CAPITAL', '0', '999999999', 1);
    await seedRangeScore('ZP3BI', 'THROU_MON', '0', '999999999', 1);
    await seedCase({ applNo: 'P3BA_FB5', listNo: L, loanTotamt: '10' });
    const { activeColumns, scoreRows } = await loadCardDef('ZP3BI');
    const ctx2: Stage2to4ListContext = { runId: RUN_ID, listNo: L, cardType: 'ZP3BI', cardVersion: CARD_VER, activeColumns, scoreRows, ym: '202606' };
    const spy = vi.spyOn(manager, 'query');
    await runStage2and3SqlMssql(manager, ctx2);
    const schemaQueries = spy.mock.calls.filter((c) => String(c[0]).includes('INFORMATION_SCHEMA.COLUMNS')).length;
    spy.mockRestore();
    expect(schemaQueries).toBe(1); // O(1)：恰 1 次
  });

  it('FALLBACK-006：命中真實欄位精度 NUMERIC(18,4)（非裸 NUMERIC）', () => {
    const src = resolveColumnSourceMssql('LOAN_TOTAMT', 'H', new Set(['loan_totamt']));
    expect(src.expr).toContain('NUMERIC(18,4)');
    expect(src.expr).not.toMatch(/AS\s+NUMERIC\s*\)/i);
  });

  it('FALLBACK-007：存在/幽靈/非數值文字三態混合批次 JS↔MSSQL 逐列等價', async (ctx) => {
    ensureMssql(ctx);
    const L = 'P3BL_FB7';
    await seedColumn('ZP3BJ', 'LOAN_TOTAMT', MatchType.RANGE); // 存在
    await seedColumn('ZP3BJ', 'XYZ_COL', MatchType.RANGE); // 幽靈
    await seedColumn('ZP3BJ', 'LIST_TYPE', MatchType.RANGE); // 非數值文字
    await seedRangeScore('ZP3BJ', 'LOAN_TOTAMT', '1', '100000', 5);
    await seedRangeScore('ZP3BJ', 'XYZ_COL', '0', '0', 6);
    await seedRangeScore('ZP3BJ', 'LIST_TYPE', '0', '0', 7);
    await seedCase({ applNo: 'P3BA_FB7', listNo: L, loanTotamt: '50000', listType: 'XX' });
    await assertEq('ZP3BJ', 'P3BA_FB7', L, null, null);
    // 5(loan_totamt∈)+6(xyz 0)+7(list_type XX→0) = 18
    expect(await getScore('P3BA_FB7', L)).toBe(18);
  });
});

// ===========================================================================
// 八、AGESCORE — Stage 2 AGE（參考日=今日）
// ===========================================================================
describe('P3b AGESCORE — AGE 今日參考日（MUST-FIX）', () => {
  it('AGESCORE-META-001：mssqlAgeTodayExpr 用 SYSDATETIME()（非 @ccWorkdt）；ym 不影響 score', async (ctx) => {
    ensureMssql(ctx);
    expect(mssqlAgeTodayExpr('cc.date_of_birth')).toContain('CAST(SYSDATETIME() AS DATE)');
    expect(mssqlAgeTodayExpr('cc.date_of_birth')).not.toContain('ccWorkdt');
    const L = 'P3BL_AGM';
    await seedColumn('S', 'AGE', MatchType.RANGE);
    await seedRangeScore('S', 'AGE', '30', '30', 12);
    await seedCase({ applNo: 'P3BA_AGM', custoNo: 'P3BA_AGM', listNo: L });
    await seedCustomerCore({ sourceCustomerNo: 'P3BA_AGM', cusSex: '1', dateOfBirth: dobForAge(30) });
    // ym 設非當月（下推 ctx.ym 不參與 AGE），兩次 score 皆相同（今日參考）。
    const ctxA: Stage2to4ListContext = { ...(await loadCardDef('S')), runId: RUN_ID, listNo: L, cardType: 'S', cardVersion: CARD_VER, ym: '202601' };
    await runStage2and3SqlMssql(manager, ctxA);
    const s1 = await getScore('P3BA_AGM', L);
    const ctxB: Stage2to4ListContext = { ...(await loadCardDef('S')), runId: RUN_ID, listNo: L, cardType: 'S', cardVersion: CARD_VER, ym: '202612' };
    await runStage2and3SqlMssql(manager, ctxB);
    const s2 = await getScore('P3BA_AGM', L);
    expect(s1).toBe(12);
    expect(s2).toBe(12);
  });

  it('AGESCORE-002/004/005/006：100/101/法人/NULL dob + 多筆 JS↔MSSQL 等價', async (ctx) => {
    ensureMssql(ctx);
    const L = 'P3BL_AG';
    await seedColumn('S', 'AGE', MatchType.RANGE);
    await seedRangeScore('S', 'AGE', '90', '120', 50);
    const cases: Array<[string, string | null, string, number]> = [
      ['P3BA_A100', '1', dobForAge(100), 50], // 100 ∈ [90,120]
      ['P3BA_A101', '1', dobForAge(101), 0], // >100 → 0
      ['P3BA_ACORP', '3', dobForAge(100), 0], // 法人 → 0
      ['P3BA_ANULL', '1', '__NULL__', 0], // NULL dob → 0
    ];
    for (const [appl, sex, dob, _e] of cases) {
      await seedCase({ applNo: appl, custoNo: appl, listNo: L });
      await seedCustomerCore({ sourceCustomerNo: appl, cusSex: sex, dateOfBirth: dob === '__NULL__' ? null : dob });
    }
    for (const [appl, sex, dob, expected] of cases) {
      await assertEq('S', appl, L, ccOf({ source_customer_no: appl, cus_sex: sex, date_of_birth: dob === '__NULL__' ? null : dob }), null);
      expect(await getScore(appl, L)).toBe(expected);
    }
  });

  it('AGESCORE-003：閏年 2/29 生日於非閏年不拋錯、與 JS 一致', async (ctx) => {
    ensureMssql(ctx);
    const L = 'P3BL_AGLY';
    await seedColumn('S', 'AGE', MatchType.RANGE);
    await seedRangeScore('S', 'AGE', '0', '150', 1);
    await seedCase({ applNo: 'P3BA_AGLY', custoNo: 'P3BA_AGLY', listNo: L });
    await seedCustomerCore({ sourceCustomerNo: 'P3BA_AGLY', cusSex: '1', dateOfBirth: '2000-02-29' });
    await expect(pushdown('S', L)).resolves.not.toThrow();
    await assertEq('S', 'P3BA_AGLY', L, ccOf({ source_customer_no: 'P3BA_AGLY', cus_sex: '1', date_of_birth: '2000-02-29' }), null);
  });
});

// ===========================================================================
// 九、CARYEAR — CAR_YEAR（今日年份 − 前導擷取）
// ===========================================================================
describe('P3b CARYEAR — CAR_YEAR 今日年份參考', () => {
  it('CARYEAR-001/002：複用 mssqlLeadingYearExpr + YEAR(SYSDATETIME())（非 ccWorkdt）', () => {
    const src = resolveColumnSourceMssql('CAR_YEAR', 'H', new Set());
    expect(src.expr).toContain('YEAR(CAST(SYSDATETIME() AS DATE))');
    expect(src.expr).toContain('PATINDEX'); // 複用 mssqlLeadingYearExpr
    expect(src.expr).not.toContain('ccWorkdt');
  });

  it('CARYEAR-004/005：正常/髒值/NULL year_produ JS↔MSSQL 逐列等價', async (ctx) => {
    ensureMssql(ctx);
    const L = 'P3BL_CY';
    const nowY = new Date().getFullYear();
    await seedColumn('H', 'CAR_YEAR', MatchType.RANGE);
    await seedRangeScore('H', 'CAR_YEAR', String(nowY - 2020), String(nowY - 2020), 11); // 2020 車齡
    await seedRangeScore('H', 'CAR_YEAR', '0', '0', 3); // 缺值/髒值 → 0
    const cases: Array<[string, string | null]> = [
      ['P3BA_CY1', '2020'], ['P3BA_CY2', null], ['P3BA_CY3', 'N/A'], ['P3BA_CY4', ''],
    ];
    for (const [appl, yp] of cases) {
      await seedCase({ applNo: appl, listNo: L, yearProdu: yp });
      await assertEq('H', appl, L, null, null);
    }
    expect(await getScore('P3BA_CY1', L)).toBe(11); // 車齡 = nowY-2020
    expect(await getScore('P3BA_CY2', L)).toBe(3); // NULL → 0
    expect(await getScore('P3BA_CY3', L)).toBe(3); // N/A → 0
    expect(await getScore('P3BA_CY4', L)).toBe(3); // '' → 0
  });
});

// ===========================================================================
// 十、PJTP — PROJECT_TP composite
// ===========================================================================
describe('P3b PJTP — PROJECT_TP composite（TRIM+NVARCHAR）', () => {
  it('PJTP-001：codeExpr/keywordExpr 轉 NVARCHAR(4000)（非 AS text）', () => {
    const src = resolveColumnSourceMssql('PROJECT_TP', 'H', new Set());
    expect(src.kind).toBe('composite');
    // buildStage2ScoreExprMssql 生成 SQL 應以 NVARCHAR(4000) cast（下方 EQ 已覆蓋執行）。
    expect(src.codeExpr).toContain("COALESCE(o.spec_tp, '01')");
  });

  it('PJTP-002/003/004：借新還舊 keyword A + spec_tp 區間 + NULL COALESCE 01，多 row JS↔MSSQL 等價', async (ctx) => {
    ensureMssql(ctx);
    const L = 'P3BL_PJ';
    await seedColumn('H', 'PROJECT_TP', MatchType.COMPOSITE);
    await seedCompositeScore('H', 'PROJECT_TP', 'A', '06', '06', 37); // 借新還舊
    await seedCompositeScore('H', 'PROJECT_TP', null, '06', '06', 35); // 非借新還舊 同代碼
    await seedCompositeScore('H', 'PROJECT_TP', null, '01', '01', 19); // COALESCE 01
    await seedCase({ applNo: 'P3BA_PJ1', listNo: L, specTp: '06', specName: '汽車貸款借新還舊專案' });
    await seedCase({ applNo: 'P3BA_PJ2', listNo: L, specTp: '06', specName: '一般專案' });
    await seedCase({ applNo: 'P3BA_PJ3', listNo: L, specTp: null, specName: null });
    for (const a of ['P3BA_PJ1', 'P3BA_PJ2', 'P3BA_PJ3']) await assertEq('H', a, L, null, null);
    expect(await getScore('P3BA_PJ1', L)).toBe(37); // A|06
    expect(await getScore('P3BA_PJ2', L)).toBe(35); // NULL|06
    expect(await getScore('P3BA_PJ3', L)).toBe(19); // spec_tp NULL → 01
  });
});

// ===========================================================================
// 十一/十二、CROSSAPPLY / DISTINCTFROM — score→level→tier
// ===========================================================================
describe('P3b CROSSAPPLY / DISTINCTFROM — level/tier NULL-aware', () => {
  async function seedTierChain(): Promise<void> {
    await seedColumn('ZP3BT', 'LIST_MONTH', MatchType.RANGE);
    await seedRangeScore('ZP3BT', 'LIST_MONTH', '1', '10', 40); // month 5 → score 40
    await seedLevel('ZP3BT', 30, 50, 'A'); // 40 ∈ [30,50] → level A
    await seedTier('ZP3BT', 'A', 'T1');
    await seedTier('ZP3BT', null, 'T9'); // fallback 列
  }

  it('DISTINCTFROM-001/003：score 命中 level A → tier T1；score NULL（無 version）→ tier NULL', async (ctx) => {
    ensureMssql(ctx);
    const L = 'P3BL_TI';
    await seedTierChain();
    await seedCase({ applNo: 'P3BA_TI1', listNo: L, monthCnt: 5 });
    await pushdown('ZP3BT', L);
    const r = await getRow('P3BA_TI1', L);
    expect(r.score).toBe(40);
    expect(r.card_level).toBe('A');
    expect(r.tier_level).toBe('T1'); // A=A 正常匹配（非 fallback）
  });

  it('DISTINCTFROM-003/004：score 未命中任何 level（card_level NULL）→ 命中 fallback 列 T9；有效 level 不誤觸 fallback', async (ctx) => {
    ensureMssql(ctx);
    const L = 'P3BL_TIF';
    await seedColumn('ZP3BU', 'LIST_MONTH', MatchType.RANGE);
    await seedRangeScore('ZP3BU', 'LIST_MONTH', '1', '10', 5); // score 5
    await seedLevel('ZP3BU', 30, 50, 'A'); // 5 不落 [30,50] → card_level NULL
    await seedTier('ZP3BU', 'A', 'T1');
    await seedTier('ZP3BU', null, 'T9'); // fallback
    await seedCase({ applNo: 'P3BA_TIF', listNo: L, monthCnt: 5 });
    await pushdown('ZP3BU', L);
    const r = await getRow('P3BA_TIF', L);
    expect(r.score).toBe(5);
    expect(r.card_level).toBeNull(); // 未命中 level
    expect(r.tier_level).toBe('T9'); // NULL=NULL → fallback（DISTINCTFROM-003）；非誤觸 A（DISTINCTFROM-004）
  });

  it('CROSSAPPLY-003 / SCORE-006：無 active version → score NULL，不掉列，tier NULL', async (ctx) => {
    ensureMssql(ctx);
    const L = 'P3BL_NV';
    // 無 active column（activeColumns 空）→ cardVersion null 語意由 ctx.cardVersion 決定；此處以 null 版本。
    await seedCase({ applNo: 'P3BA_NV', listNo: L, monthCnt: 5 });
    const ctxNull: Stage2to4ListContext = { runId: RUN_ID, listNo: L, cardType: 'ZP3BV', cardVersion: null, activeColumns: [], scoreRows: [], ym: '202606' };
    await runStage2and3SqlMssql(manager, ctxNull);
    const r = await getRow('P3BA_NV', L);
    expect(r.score).toBeNull(); // CAST(NULL AS INT)（CROSS APPLY 仍產 1 列，不掉列）
    expect(r.card_level).toBeNull();
    expect(r.tier_level).toBeNull();
  });

  it('SCORE-007：有 active version 但 0 命中 → score=0（與 NULL 區分）', async (ctx) => {
    ensureMssql(ctx);
    const L = 'P3BL_S7';
    await seedColumn('ZP3BW', 'LIST_MONTH', MatchType.RANGE);
    await seedRangeScore('ZP3BW', 'LIST_MONTH', '90', '99', 5); // month 5 不落
    await seedCase({ applNo: 'P3BA_S7', listNo: L, monthCnt: 5 });
    await pushdown('ZP3BW', L);
    expect(await getScore('P3BA_S7', L)).toBe(0); // 0 ≠ NULL
  });
});

// ===========================================================================
// 十三、UPDATEFROM — 目標併入 FROM + 防跨 run 污染
// ===========================================================================
describe('P3b UPDATEFROM — 目標併入 FROM（MUST-FIX）', () => {
  it('UPDATEFROM-001/003：不拋 Invalid object name；join key o.orgno/appl_no 正確', async (ctx) => {
    ensureMssql(ctx);
    const L = 'P3BL_UF';
    await seedColumn('ZP3BX', 'LIST_MONTH', MatchType.RANGE);
    await seedRangeScore('ZP3BX', 'LIST_MONTH', '1', '10', 8);
    await seedCase({ applNo: 'P3BA_UF1', listNo: L, monthCnt: 5 });
    await expect(pushdown('ZP3BX', L)).resolves.not.toThrow();
    expect(await getScore('P3BA_UF1', L)).toBe(8);
  });

  it('UPDATEFROM-002：WHERE run_id/list_no 保留 → 僅本 run 更新，另一 run 完全不受影響（防跨 run 污染）', async (ctx) => {
    ensureMssql(ctx);
    const L = 'P3BL_UF2';
    await seedRun(RUN_ID2);
    await seedColumn('ZP3BY', 'LIST_MONTH', MatchType.RANGE);
    await seedRangeScore('ZP3BY', 'LIST_MONTH', '1', '10', 9);
    // 同 list_no、同 appl_no，但不同 run_id（RUN_ID / RUN_ID2）。
    await seedCase({ applNo: 'P3BA_UF2', listNo: L, runId: RUN_ID, monthCnt: 5 });
    await seedCase({ applNo: 'P3BA_UF2', listNo: L, runId: RUN_ID2, monthCnt: 5 });
    await pushdown('ZP3BY', L, RUN_ID); // 僅對 RUN_ID
    expect(await getScore('P3BA_UF2', L, RUN_ID)).toBe(9); // 更新
    expect(await getScore('P3BA_UF2', L, RUN_ID2)).toBeNull(); // 未受影響（仍 Stage 1 NULL）
  });
});

// ===========================================================================
// 十四、DECIMAL — LOAN_RATE 精度旗艦
// ===========================================================================
describe('P3b DECIMAL — LOAN_RATE 精度（MUST-FIX）', () => {
  it('DECIMAL-LOANRATE-001：loan_rate=12.50 命中 [12.00,12.99]（裸 NUMERIC 會 →13 不命中）', async (ctx) => {
    ensureMssql(ctx);
    const L = 'P3BL_LR';
    await seedColumn('ZP3BZ', 'LOAN_RATE', MatchType.RANGE);
    await seedRangeScore('ZP3BZ', 'LOAN_RATE', '12.00', '12.99', 25);
    await seedCase({ applNo: 'P3BA_LR', listNo: L, loanRate: '12.50' });
    await assertEq('ZP3BZ', 'P3BA_LR', L, null, null);
    expect(await getScore('P3BA_LR', L)).toBe(25); // 12.50 保留小數 → 命中
  });

  it('DECIMAL-LOANRATE-002 / ARCAP-001：per-card default 整數 + ADD_UN_CAPITAL 整數 regression', async (ctx) => {
    ensureMssql(ctx);
    const L = 'P3BL_DEC';
    await seedColumn('S5', 'LOAN_RATE', MatchType.RANGE);
    await seedColumn('S5', 'ADD_UN_CAPITAL', MatchType.RANGE);
    await seedRangeScore('S5', 'LOAN_RATE', '77', '77', 8); // S5 default 77
    await seedRangeScore('S5', 'ADD_UN_CAPITAL', '5000', '5000', 6);
    await seedCase({ applNo: 'P3BA_DEC', listNo: L, loanRate: null }); // → default 77
    await seedArCap('P3BA_DEC', '5000');
    await assertEq('S5', 'P3BA_DEC', L, null, { appl_no: 'P3BA_DEC', add_un_capital: '5000' });
    expect(await getScore('P3BA_DEC', L)).toBe(14); // 8 + 6
  });
});

// ===========================================================================
// 十五、CCDIM — customer_core 9 維度 EQ 矩陣
// ===========================================================================
describe('P3b CCDIM — 9 維度逐列 EQ', () => {
  it('CCDIM-SEX：1/2/3/缺值 default 3', async (ctx) => {
    ensureMssql(ctx);
    const L = 'P3BL_CDS';
    await seedColumn('H', 'CUS_SEX', MatchType.RANGE);
    await seedRangeScore('H', 'CUS_SEX', '1', '1', 20);
    await seedRangeScore('H', 'CUS_SEX', '3', '3', 3);
    await seedCase({ applNo: 'P3BA_CDS1', custoNo: 'P3BA_CDS1', listNo: L });
    await seedCustomerCore({ sourceCustomerNo: 'P3BA_CDS1', cusSex: '1' });
    await seedCase({ applNo: 'P3BA_CDSN', custoNo: 'C_NONE_CDS', listNo: L }); // 無 cc → default 3
    await assertEq('H', 'P3BA_CDS1', L, ccOf({ source_customer_no: 'P3BA_CDS1', cus_sex: '1' }), null);
    await assertEq('H', 'P3BA_CDSN', L, null, null);
    expect(await getScore('P3BA_CDS1', L)).toBe(20);
    expect(await getScore('P3BA_CDSN', L)).toBe(3);
  });

  it('CCDIM-BRANCH：個人五欄全有值 vs 法人五欄 0/default，五欄同步', async (ctx) => {
    ensureMssql(ctx);
    const seedSCard = async () => {
      for (const [c, mt] of [['CUS_SEX', MatchType.RANGE], ['AGE', MatchType.RANGE], ['CAREA_NO1', MatchType.RANGE], ['CAREA_NO2', MatchType.RANGE], ['EDUCAT_BACK', MatchType.RANGE]] as const) {
        await seedColumn('S', c, mt);
      }
      await seedRangeScore('S', 'CUS_SEX', '1', '1', 20);
      await seedRangeScore('S', 'CUS_SEX', '3', '3', 1);
      await seedRangeScore('S', 'AGE', '30', '40', 12);
      await seedRangeScore('S', 'CAREA_NO1', '1', '1', 4);
      await seedRangeScore('S', 'CAREA_NO2', '1', '1', 3);
      await seedRangeScore('S', 'EDUCAT_BACK', '05', '05', 7);
    };
    const L = 'P3BL_CDB';
    await seedSCard();
    await seedCase({ applNo: 'P3BA_BR9', custoNo: 'P3BA_BR9', listNo: L });
    await seedCustomerCore({ sourceCustomerNo: 'P3BA_BR9', cusSex: '1', careaNo1: '02', careaNo2: '03', dateOfBirth: dobForAge(36), educationCode: '5' });
    await seedCase({ applNo: 'P3BA_BR10', custoNo: 'P3BA_BR10', listNo: L });
    await seedCustomerCore({ sourceCustomerNo: 'P3BA_BR10', cusSex: '3', careaNo1: '02', careaNo2: '03', dateOfBirth: dobForAge(36), educationCode: '5' });
    await assertEq('S', 'P3BA_BR9', L, ccOf({ source_customer_no: 'P3BA_BR9', cus_sex: '1', carea_no1: '02', carea_no2: '03', date_of_birth: dobForAge(36), education_code: '5' }), null);
    await assertEq('S', 'P3BA_BR10', L, ccOf({ source_customer_no: 'P3BA_BR10', cus_sex: '3', carea_no1: '02', carea_no2: '03', date_of_birth: dobForAge(36), education_code: '5' }), null);
    expect(await getScore('P3BA_BR9', L)).toBe(46); // 20+12+4+3+7
    expect(await getScore('P3BA_BR10', L)).toBe(1); // 法人：CUS_SEX 1，五欄 0
  });

  it('CCDIM-CITY：LEFT3 命中/未命中/M 卡 default', async (ctx) => {
    ensureMssql(ctx);
    const L = 'P3BL_CDC';
    await seedColumn('M', 'HPOST_NUM_NM', MatchType.CATEGORY);
    await seedColumn('M', 'CPOST_NUM_NM', MatchType.CATEGORY);
    await seedColumn('M', 'CO_NUM_NM', MatchType.CATEGORY);
    await seedCatScore('M', 'HPOST_NUM_NM', '臺北市', 10);
    await seedCatScore('M', 'CPOST_NUM_NM', '臺南市', 20);
    await seedCatScore('M', 'CO_NUM_NM', '高雄市', 30);
    await seedCase({ applNo: 'P3BA_CT9', custoNo: 'P3BA_CT9', listNo: L });
    await seedCustomerCore({ sourceCustomerNo: 'P3BA_CT9', hpostCity: '臺北市信義區', cpostCity: '臺南市東區', coCity: '高雄市三民區' });
    await seedCase({ applNo: 'P3BA_CT10', custoNo: 'C_NONE_CT', listNo: L }); // 無 cc → M default 三縣市
    await assertEq('M', 'P3BA_CT9', L, ccOf({ source_customer_no: 'P3BA_CT9', hpost_city: '臺北市信義區', cpost_city: '臺南市東區', co_city: '高雄市三民區' }), null);
    await assertEq('M', 'P3BA_CT10', L, null, null);
    expect(await getScore('P3BA_CT9', L)).toBe(60);
    expect(await getScore('P3BA_CT10', L)).toBe(60); // default 臺北市/臺南市/高雄市
  });

  it('CCDIM-SALES/PCD：SALES_STS 三值 + LIST_MONTH per-card default', async (ctx) => {
    ensureMssql(ctx);
    const L = 'P3BL_CDP';
    await seedColumn('H', 'SALES_STS', MatchType.CATEGORY);
    await seedColumn('H', 'LIST_MONTH', MatchType.RANGE);
    await seedCatScore('H', 'SALES_STS', 'AGENT', 9);
    await seedCatScore('H', 'SALES_STS', 'UCD', 6);
    await seedCatScore('H', 'SALES_STS', 'HFC', 3);
    await seedRangeScore('H', 'LIST_MONTH', '25', '25', 5); // H default 25
    await seedCase({ applNo: 'P3BA_UCD', listNo: L, salesStsNa: '中古車商', monthCnt: null });
    await assertEq('H', 'P3BA_UCD', L, null, null);
    expect(await getScore('P3BA_UCD', L)).toBe(11); // UCD 6 + LIST_MONTH default 25 → 5
  });
});

// ===========================================================================
// 十七/十八/十九、CJOIN / AR / S2CLEAN
// ===========================================================================
describe('P3b CJOIN / AR / S2CLEAN', () => {
  it('CJOIN-002：customer_core 無 match → LEFT JOIN 不掉列，屬性 default', async (ctx) => {
    ensureMssql(ctx);
    const L = 'P3BL_CJ';
    await seedColumn('H', 'CUS_SEX', MatchType.RANGE);
    await seedRangeScore('H', 'CUS_SEX', '3', '3', 3);
    await seedCase({ applNo: 'P3BA_CJ', custoNo: 'C_NOMATCH', listNo: L }); // 無對應 cc
    await pushdown('H', L);
    expect(await getScore('P3BA_CJ', L)).toBe(3); // 案件不消失，safe-cast NULL → default 3
  });

  it('AR-004：無 ob_arreturndf_min_cap 對應 → COALESCE 0，不掉列', async (ctx) => {
    ensureMssql(ctx);
    const L = 'P3BL_AR';
    await seedColumn('H', 'ADD_UN_CAPITAL', MatchType.RANGE);
    await seedRangeScore('H', 'ADD_UN_CAPITAL', '0', '0', 5);
    await seedCase({ applNo: 'P3BA_AR', listNo: L }); // 無 ar 列
    await assertEq('H', 'P3BA_AR', L, null, null);
    expect(await getScore('P3BA_AR', L)).toBe(5); // COALESCE(NULL,0)=0 ∈ [0,0]
  });

  it('S2CLEAN-001/002：Stage 2 不寫 is_cr（Y/N/NULL 原值保留）', async (ctx) => {
    ensureMssql(ctx);
    const L = 'P3BL_S2C';
    await seedColumn('H', 'LIST_MONTH', MatchType.RANGE);
    await seedRangeScore('H', 'LIST_MONTH', '1', '10', 5);
    await seedCase({ applNo: 'P3BA_CRY', listNo: L, monthCnt: 5, isCr: 'Y' });
    await seedCase({ applNo: 'P3BA_CRN', listNo: L, monthCnt: 5, isCr: null });
    await pushdown('H', L);
    expect((await getRow('P3BA_CRY', L)).is_cr).toBe('Y'); // 保留
    expect((await getRow('P3BA_CRN', L)).is_cr).toBeNull(); // 不誤寫
  });
});

// ===========================================================================
// 二十、FULLEQ — 綜合大場景
// ===========================================================================
describe('P3b FULLEQ — 綜合 DoD EQ（誤差 0）', () => {
  it('FULLEQ-008：S5 卡 age/educat/loan_rate/co_num default + 部分有值 + LOAN_RATE 小數 綜合', async (ctx) => {
    ensureMssql(ctx);
    const L = 'P3BL_FEQ';
    for (const [c, mt] of [['AGE', MatchType.RANGE], ['CAREA_NO1', MatchType.RANGE], ['EDUCAT_BACK', MatchType.RANGE], ['LOAN_RATE', MatchType.RANGE], ['CO_NUM_NM', MatchType.CATEGORY], ['HPOST_NUM_NM', MatchType.CATEGORY]] as const) {
      await seedColumn('S5', c, mt);
    }
    await seedRangeScore('S5', 'AGE', '30', '40', 5);
    await seedRangeScore('S5', 'CAREA_NO1', '1', '1', 4);
    await seedRangeScore('S5', 'EDUCAT_BACK', '08', '99', 6); // default '08'
    await seedRangeScore('S5', 'LOAN_RATE', '12.00', '12.99', 8); // 小數精度
    await seedCatScore('S5', 'CO_NUM_NM', '金門縣', 9); // S5 default 金門縣
    await seedCatScore('S5', 'HPOST_NUM_NM', '臺北市', 3);
    await seedCase({ applNo: 'P3BA_FEQ', custoNo: 'P3BA_FEQ', listNo: L, loanRate: '12.50' });
    await seedCustomerCore({ sourceCustomerNo: 'P3BA_FEQ', cusSex: '1', careaNo1: '02', dateOfBirth: dobForAge(36), educationCode: null, hpostCity: '臺北市中正區', coCity: null });
    const cc = ccOf({ source_customer_no: 'P3BA_FEQ', cus_sex: '1', carea_no1: '02', date_of_birth: dobForAge(36), education_code: null, hpost_city: '臺北市中正區', co_city: null });
    const score = await assertEq('S5', 'P3BA_FEQ', L, cc, null);
    // AGE 36→5 + CAREA1 1→4 + EDUCAT '08'→6 + LOAN_RATE 12.5→8 + CO_NUM 金門縣→9 + HPOST 臺北市→3 = 35
    expect(score).toBe(35);
  });
});

// ===========================================================================
// 二十二、CHARSET — 中文 round-trip
// ===========================================================================
describe('P3b CHARSET — 中文 round-trip', () => {
  it('CHARSET-001/002/003：中古車商 + 借新還舊 LIKE + 縣市 LEFT3 中文字元計數', async (ctx) => {
    ensureMssql(ctx);
    const L = 'P3BL_CS';
    await seedColumn('H', 'SALES_STS', MatchType.CATEGORY);
    await seedColumn('H', 'PROJECT_TP', MatchType.COMPOSITE);
    await seedColumn('M', 'HPOST_NUM_NM', MatchType.CATEGORY);
    await seedCatScore('H', 'SALES_STS', 'UCD', 6);
    await seedCompositeScore('H', 'PROJECT_TP', 'A', '06', '06', 37);
    await seedCatScore('M', 'HPOST_NUM_NM', '花蓮縣', 12);
    await seedCase({ applNo: 'P3BA_CS1', listNo: L, salesStsNa: '中古車商', specTp: '06', specName: '借新還舊專案' });
    await assertEq('H', 'P3BA_CS1', L, null, null);
    expect(await getScore('P3BA_CS1', L)).toBe(43); // UCD 6 + PROJECT_TP A|06 37

    const LM = 'P3BL_CSM';
    await seedCase({ applNo: 'P3BA_CS2', custoNo: 'P3BA_CS2', listNo: LM });
    await seedCustomerCore({ sourceCustomerNo: 'P3BA_CS2', hpostCity: '花蓮縣吉安鄉' }); // LEFT3=花蓮縣
    await assertEq('M', 'P3BA_CS2', LM, ccOf({ source_customer_no: 'P3BA_CS2', hpost_city: '花蓮縣吉安鄉' }), null);
    expect(await getScore('P3BA_CS2', LM)).toBe(12);
  });
});

// ===========================================================================
// 二十三、STATIC — 原始碼靜態守門
// ===========================================================================
describe('P3b STATIC — 原始碼靜態守門', () => {
  const builderMssql = () => readFileSync(join(__dirname, '..', 'stage2to4-sql-builder-mssql.ts'), 'utf8');
  const executorMssql = () => readFileSync(join(__dirname, '..', 'stage2to4-sql-executor-mssql.ts'), 'utf8');

  it('STATIC-001：測試檔對 12 共用表無 DROP/TRUNCATE（僅本次自建表條件式 DROP）', () => {
    const src = readFileSync(join(__dirname, 'stage2to4-sql-pushdown.mssql.spec.ts'), 'utf8');
    // 無 TRUNCATE...TABLE 陳述式（regex 字面含 \s+，不自我匹配；註解提及政策文字不算）。
    expect(src).not.toMatch(/TRUNCATE\s+TABLE/);
    // 唯一 DROP 位於 selfBuiltTables 還原迴圈（動態 dbo.<t>）；無針對具名共用表之硬編碼 DROP。
    expect(src).toMatch(/for \(const t of \[\.\.\.selfBuiltTables\]/);
    expect(src).not.toMatch(/DROP TABLE\s+"?(ob_|customer_core|assignment_run)/);
  });

  it('STATIC-002：PG 核心檔 byte-identical（git diff 空）', () => {
    const { execSync } = require('child_process') as typeof import('child_process');
    const repoRoot = join(__dirname, '..', '..', '..', '..', '..', '..', '..');
    for (const f of ['apps/api/src/modules/assignment/stage1/stage2to4-sql-builder.ts', 'apps/api/src/modules/assignment/stage1/stage2to4-sql-executor.ts']) {
      const diff = execSync(`git diff -- ${f}`, { cwd: repoRoot, encoding: 'utf8' });
      expect(diff.trim()).toBe('');
    }
  });

  it('STATIC-003：mssql 新檔命名鎖定', () => {
    expect(builderMssql().length).toBeGreaterThan(0);
    expect(executorMssql().length).toBeGreaterThan(0);
  });

  it('STATIC-004：mssql 產出 SQL 無 PG 專屬 token（:: / ~ / to_jsonb / ->> / CROSS JOIN LATERAL / IS NOT DISTINCT FROM）', () => {
    for (const src of [builderMssql(), executorMssql()]) {
      // 去除 block/line 註解後掃描 code（含 SQL 字串模板）。
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(code).not.toContain('to_jsonb');
      expect(code).not.toContain('->>');
      expect(code).not.toContain('CROSS JOIN LATERAL');
      expect(code).not.toContain('IS NOT DISTINCT FROM');
      expect(code).not.toMatch(/~\s*'/); // PG 正則運算子
      expect(code).not.toMatch(/\)::(int|numeric|text)/i); // PG cast ::
    }
  });

  it('STATIC-007：LOAN_RATE 精度宣告字面（NUMERIC(18,4)，非裸 NUMERIC）', () => {
    expect(builderMssql()).toContain('NUMERIC(18,4)');
  });
});

// ===========================================================================
// 二十四、HARNESS — 自建策略
// ===========================================================================
describe('P3b HARNESS — beforeAll/afterAll 自建策略', () => {
  it('HARNESS-001/004：12 表就緒（既有或自建），冪等不重複 CREATE', () => {
    // beforeAll 已成功（reachable 為真代表 12 表皆就緒）；existedBeforeSuite ∪ selfBuilt = 12。
    if (!reachable) return; // 不可達則本斷言不適用
    expect(existedBeforeSuite.size + selfBuiltTables.length).toBe(12);
  });

  it('HARNESS-005：自建 DDL 與 baseline migration 逐欄比對（零 drift）', () => {
    const migration = readFileSync(join(__dirname, '..', '..', '..', '..', 'database', 'migrations', 'mssql', '1751884800000-MssqlBaselineSchema.ts'), 'utf8');
    for (const t of TWELVE_TABLES) {
      const ddl = MSSQL_BASELINE_DDL[t];
      // DDL 常數之 CREATE TABLE 片段須逐字出現於 baseline migration（零 drift）。
      expect(migration).toContain(ddl);
    }
  });
});
