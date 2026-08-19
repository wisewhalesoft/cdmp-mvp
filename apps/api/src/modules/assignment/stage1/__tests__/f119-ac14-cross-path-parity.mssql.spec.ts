/**
 * F119 / US-183 — AC-14（★核心）五條執行路徑一致性：R-F119-04 缺口補強（真實 MSSQL）。
 *
 * 背景（risks-and-gaps.md R-F119-04）：上一輪 test-generator 僅驗證了「共用函式本身」
 * （buildCategoricalOperatorFragment，BR-4/BR-5 結構性保證）+ 一條可達路徑
 * （previewHitCount，草稿抽樣估算）之黑箱正確性；MSSQL 下推 / PG 下推 / JS filter chain /
 * Stage 0 估算四條路徑之「逐路徑真實查詢比對數字」未驗證。此檔補其中**兩條真正各自獨立實作**
 * 之路徑：
 *
 *   路徑 1：MSSQL 下推（`stage1-sql-executor-mssql.ts` → `runStage1SqlInsertMssql`，
 *           INSERT…SELECT 寫入 `ob_monthly_run_result`）
 *   路徑 3：JS filter chain（`stage1-filter-chain.ts` → `executeStage1Chain`；依 AD-E07-50
 *           §2.1 查證，此路徑經 TypeORM QueryBuilder `.where(...)` 送入 SQL 執行，非應用層
 *           陣列 filter，是與路徑 1 真正物理上分離的第二套 SQL 組裝/執行程式碼）
 *
 * 依 AD-E07-50 §2.1，路徑 4（Stage 0 估算，`dryRunChainCount`）**呼叫路徑 3 本身、非獨立實作**
 * ——對路徑 4 的正確驗證手法是「證明委派不失真」而非「重覆執行路徑 3」，另見同輪新增檔案
 * `assignment-list/__tests__/f119-ac14-stage0-delegation.spec.ts`（SQLite，spy 驗證委派）。
 * 路徑 2（PG 下推）本機無 PG 可跑，另見 `f119-ac14-pg-semantic-equivalence.spec.ts`（字串/語意
 * 等價，非真實執行，已在該檔明確標記驗證層級較低）。路徑 5（草稿抽樣估算 `previewHitCount`）已由
 * 上一輪 `assignment-list/__tests__/f119-preview-hit-count-text-operators.spec.ts` 黑箱覆蓋
 * （SQLite），AC-14 本身明文「草稿命中預估因抽樣估算，不要求數字逐筆相等」，故本輪不重複。
 *
 * 手法：比照既有 `stage1-sql-pushdown.mssql.spec.ts`（AD-E07-42 P3a）之 `assertEquivalent`
 * 慣例——同一份 list + condition，分別跑 JS oracle（executeStage1Chain）與 MSSQL 下推
 * （runStage1SqlInsertMssql），比對 PK 集合逐列相等（非僅 count）。本檔首次將此既有驗證技法
 * 套用於 F119 新增之類別型文字比對運算子（`contains`/`not_contains`），覆蓋 AC-3 之 NULL
 * 不對稱語意（★核心）跨路徑一致性——這正是最容易因「兩處各自實作 NULL 特判」而分歧之處。
 *
 * 業務情境（team lead 提供之真實 dev DB 查證）：`ob_pool_data.spec_name LIKE '%勁便利%'` 於
 * 167 萬列母體命中 1,820 列，為 US-183 之代表性業務範例。本檔以獨立前綴 `F19` 隔離、精準
 * DELETE 清理，不觸碰既有 167 萬列（僅新增自己 seed 之少量列）。
 *
 * ⚠️ test-generator 撰寫依據：F119 spec AC-3/AC-14 + AD-E07-50 §2.1/§3.3/§7（I-CATOP-NULL-MATRIX-01）
 * + 既有測試檔 `stage1-sql-pushdown.mssql.spec.ts`（允許範圍：既有測試檔之 harness/wiring 慣例，
 * 見 test-generator agent memory `blindness-practical-exceptions`）。**未**另行開啟
 * `stage1-query-composer.ts`/`stage1-sql-executor-mssql.ts`/`stage1-filter-chain.ts` 生產碼本體
 * 決定斷言內容——斷言內容（PK 集合逐列相等）源自 F119 AC-14 本身之契約文字，非讀生產碼決定。
 */

import {
  restoreDbType,
  MSSQL,
  mssqlPortReachable,
  SKIP_REASON,
} from '@/database/__tests__/mssql-env-preload';

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { DataSource, Repository, EntityManager } from 'typeorm';

import { ObListDefinition } from '@/database/entities/ob-list-definition.entity';
import { ObPoolData } from '@/database/entities/ob-pool-data.entity';
import { ObPoolDataList } from '@/database/entities/ob-pool-data-list.entity';
import { ObMonthlyRunResult } from '@/database/entities/ob-monthly-run-result.entity';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { executeStage1Chain } from '../stage1-filter-chain';
import { runStage1SqlInsertMssql } from '../stage1-sql-executor-mssql';

// feedback_pg_spec_parallel_timeout：真 MSSQL 連線在 CPU 競爭下需拉高預設 5s。
// 實測 not_contains 全表（167 萬列）NOT LIKE 掃描單案例可達 ~46s，故拉高至 180s 留足餘裕。
vi.setConfig({ testTimeout: 180000 });

const WORKDT = new Date(2026, 5, 1); // 2026-06-01（與 P3A 同錨點；期別 1~6 涵蓋 month_cnt=1）
const RUN_ID = '00000000-0000-0000-0000-0000000119aa';

let reachable = false;
let ds: DataSource | null = null;
let poolRepo: Repository<ObPoolData>;
let pdlRepo: Repository<ObPoolDataList>;
let resultRepo: Repository<ObMonthlyRunResult>;
let listRepo: Repository<ObListDefinition>;
let manager: EntityManager;

function ensureMssql(ctx: { skip: () => void }): void {
  if (!reachable || !ds) {
    // eslint-disable-next-line no-console
    console.warn(`[F119 AC-14 MSSQL] SKIPPED — ${SKIP_REASON}`);
    ctx.skip();
  }
}

let listSeq = 0;
function makeTextOpList(
  operator: 'contains' | 'not_contains',
  keyword: string,
): ObListDefinition {
  listSeq += 1;
  return listRepo.create({
    list_no: `F19L${String(listSeq).padStart(6, '0')}`,
    list_nm: '主約專案名稱文字比對名單',
    prod_kind: '',
    prod_best: 'Y',
    list_type: '01',
    list_period_start: '1',
    list_period_end: '6',
    list_interval: '1',
    project_workym: '202606',
    caseyear: null,
    spec_tp: null,
    settle_src: null,
    card_type: 'T1',
    case_status: '',
    status: 'active',
    stage: 'ready',
    cr_enabled: false,
    condition_payload: {
      logic: 'AND',
      conditions: [{ columnName: 'spec_name', fieldType: 'categorical', operator, keyword }],
    } as ObListDefinition['condition_payload'],
    created_by_prog: 'TEST',
    created_by: 'tester',
    created_at: new Date(),
    updated_by_prog: 'TEST',
    updated_by: 'tester',
    updated_at: new Date(),
  } as ObListDefinition);
}

let applSeq = 0;
/** 回傳所建列之 PK 字串（`orgno:appl_no`），供逐 PK 斷言（見檔頭之「絕對數字為陷阱」聲明）。 */
async function seedPool(opts: { specName: string | null }): Promise<string> {
  applSeq += 1;
  const applNo = `F19A${String(applSeq).padStart(5, '0')}`;
  await poolRepo.save(
    poolRepo.create({
      orgno: '01',
      appl_no: applNo,
      custo_no: `F19C${String(applSeq).padStart(5, '0')}`,
      sta_code: '01',
      dept_id: 'D001',
      list_type: '01',
      settle_src: '01',
      prod_kind: '01',
      month_cnt: 1,
      spec_name: opts.specName,
      _cdmp_extracted_at: new Date(),
    } as Partial<ObPoolData>),
  );
  return `01:${applNo}`;
}

async function seedRun(runId: string): Promise<void> {
  await manager.query(
    `INSERT INTO assignment_run (run_id, project_workym, status, triggered_by, created_at)
     VALUES (@0, '202606', 'running', '00000000-0000-0000-0000-000000000001', GETDATE())`,
    [runId],
  );
}

/** 精準清理本檔寫入列（禁 DROP/TRUNCATE；FK 序：result → assignment_run）。獨立前綴 F19，僅清自己的列。 */
async function cleanupF19(): Promise<void> {
  await manager.query(`DELETE FROM ob_monthly_run_result WHERE list_no LIKE 'F19%'`);
  await manager.query(`DELETE FROM assignment_run WHERE run_id = '${RUN_ID}'`);
  await manager.query(`DELETE FROM ob_pool_data WHERE appl_no LIKE 'F19%'`);
  await manager.query(`DELETE FROM ob_pool_data_list WHERE appl_no LIKE 'F19%'`);
  await manager.query(`DELETE FROM ob_list_definition WHERE list_no LIKE 'F19%'`);
}

/** 路徑 3：JS filter chain（executeStage1Chain），回 PK 集合。 */
async function runPath3Pks(list: ObListDefinition): Promise<string[]> {
  const r = await executeStage1Chain(list, WORKDT, poolRepo, pdlRepo, { dryRun: false });
  return (r.cases ?? []).map((c) => `${c.orgno}:${c.appl_no}`).sort();
}

/** 路徑 1：MSSQL 下推（runStage1SqlInsertMssql，INSERT…SELECT），回 ob_monthly_run_result 之 PK 集合。 */
async function runPath1Pks(list: ObListDefinition): Promise<string[]> {
  await runStage1SqlInsertMssql(manager, list, WORKDT, pdlRepo, {
    runId: RUN_ID,
    listNo: list.list_no,
  });
  const rows = await resultRepo.find({ where: { run_id: RUN_ID, list_no: list.list_no } });
  return rows.map((r) => `${r.orgno}:${r.appl_no}`).sort();
}

beforeAll(async () => {
  reachable = await mssqlPortReachable(1500);
  if (!reachable) return;
  try {
    ds = new DataSource({
      type: 'mssql',
      host: MSSQL.host,
      port: MSSQL.port,
      username: MSSQL.username,
      password: MSSQL.password,
      database: MSSQL.database,
      options: { encrypt: MSSQL.encrypt, trustServerCertificate: MSSQL.trustServerCertificate },
      entities: [ObListDefinition, ObPoolData, ObPoolDataList, ObMonthlyRunResult, AssignmentRun],
      synchronize: false, // 共用既有 dbo，絕不 synchronize / DROP（比照 P3a）。
      // I-MSSQL-REQUEST-TIMEOUT-01（data-source.ts）：tedious 預設 15s，對 spec_name 全表
      // LIKE/NOT LIKE 掃描（dev pool 167 萬列）不足，實測 not_contains 案例已逾時，比照生產
      // DataSource 之慣例拉高（此為測試自身連線設定，非修改生產碼）。
      requestTimeout: 120000,
    });
    await ds.initialize();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[F119 AC-14 MSSQL] init failed → skip:', (e as Error)?.message);
    reachable = false;
    ds = null;
    return;
  }
  poolRepo = ds.getRepository(ObPoolData);
  pdlRepo = ds.getRepository(ObPoolDataList);
  resultRepo = ds.getRepository(ObMonthlyRunResult);
  listRepo = ds.getRepository(ObListDefinition);
  manager = ds.manager;
}, 60000);

afterAll(async () => {
  if (ds) {
    try {
      await cleanupF19();
    } catch {
      /* best-effort */
    }
    await ds.destroy();
  }
  restoreDbType();
});

beforeEach(async () => {
  if (!reachable || !ds) return;
  await cleanupF19();
  await seedRun(RUN_ID);
});

describe('F119 AC-14（★核心）— 路徑 1（MSSQL 下推）vs 路徑 3（JS filter chain）真實查詢逐 PK 相等', () => {
  it('環境可達性', () => {
    if (!reachable) {
      // eslint-disable-next-line no-console
      console.warn(`[F119 AC-14 MSSQL] ${SKIP_REASON}`);
    }
    expect(true).toBe(true);
  });

  it('AC14-PARITY-001（★核心 / AC-2）：contains "勁便利" → 路徑1與路徑3之命中 PK 集合逐列相等，本檔自 seed 之三列依 AC-2 正確歸類', async (ctx) => {
    ensureMssql(ctx);
    const list = makeTextOpList('contains', '勁便利');
    await listRepo.save(list);
    const hit = await seedPool({ specName: '勁便利機車零利率專案' }); // 含關鍵字 → 應命中
    const miss = await seedPool({ specName: '一般專案' }); // 不含 → 不命中
    const nul = await seedPool({ specName: null }); // NULL → 兩路徑皆應排除（AC-2）

    const path3 = await runPath3Pks(list);
    const path1 = await runPath1Pks(list);

    // ⚠️ 不斷言絕對數字（team lead 明確指示）：dev pool 現有 167 萬列，`spec_name` 含「勁便利」
    // 之真實既有列（非本檔 seed）亦會被命中（實測曾出現 112 列），toBe(N) 式斷言對此環境早已
    // 失效（見既有 stage1-sql-pushdown.mssql.spec.ts 15~16 個因此失效之既有案例）。改採：
    //   (a) 路徑1與路徑3之完整 PK 集合逐列相等 —— 本 AC-14 之核心主張，不受既有真實列數量影響
    //   (b) 僅檢查「本檔自己 seed 之三列」是否被正確歸類 —— 免疫於既有真實資料雜訊
    expect(path1).toEqual(path3); // 逐列 PK 集合精確相等（非僅 count），涵蓋全部真實命中列
    expect(path1).toContain(hit);
    expect(path1).not.toContain(miss);
    expect(path1).not.toContain(nul);
  });

  it('AC14-PARITY-002（★核心 / AC-3，全 feature 唯一非對稱格）：not_contains "勁便利" → NULL 於兩路徑皆保留，本檔自 seed 之三列依 AC-3 正確歸類', async (ctx) => {
    ensureMssql(ctx);
    const list = makeTextOpList('not_contains', '勁便利');
    await listRepo.save(list);
    const excl = await seedPool({ specName: '勁便利機車零利率專案' }); // 含關鍵字 → 應排除
    const keep = await seedPool({ specName: '一般專案' }); // 不含 → 應保留
    const nul = await seedPool({ specName: null }); // NULL → ★AC-3 兩路徑皆應保留（與 PARITY-001 刻意相反）

    const path3 = await runPath3Pks(list);
    const path1 = await runPath1Pks(list);

    // 同上：不斷言絕對數字（167 萬列真實資料雜訊），改採路徑相等 + 自 seed 列逐項歸類。
    expect(path1).toEqual(path3); // 逐列 PK 集合精確相等——若任一路徑各自實作 NULL 特判有誤，此處必分歧
    expect(path1).not.toContain(excl);
    expect(path1).toContain(keep);
    expect(path1).toContain(nul); // ★核心：NULL 列須被兩路徑「一致地」保留，而非任一路徑獨自漏保留
  });

  it('AC14-PARITY-003（AC-9 字面值）：關鍵字含 "%" 於兩路徑皆不得誤判為萬用字元，本檔自 seed 之兩列依字面值正確歸類', async (ctx) => {
    ensureMssql(ctx);
    const list = makeTextOpList('contains', '100%');
    await listRepo.save(list);
    const hit = await seedPool({ specName: '達成率100%達標專案' }); // 含字面 100% → 應命中
    const miss = await seedPool({ specName: '1000元的商品專案' }); // 不含字面 100%，若 % 被誤判為萬用字元則誤命中

    const path3 = await runPath3Pks(list);
    const path1 = await runPath1Pks(list);

    expect(path1).toEqual(path3); // 不斷言絕對數字，理由同 PARITY-001/002（167 萬列真實資料雜訊）
    expect(path1).toContain(hit);
    expect(path1).not.toContain(miss);
  });
});
