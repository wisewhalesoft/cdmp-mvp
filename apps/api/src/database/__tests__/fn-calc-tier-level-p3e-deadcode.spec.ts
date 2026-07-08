/**
 * AD-E07-42 P3e — `fn_calc_tier_level` 死碼收尾（回歸守門）。
 *
 * 背景（AD-E07-42 §2.5 / §3；P3d impl log「範圍外後續」）：
 *   `fn_calc_tier_level` 為 legacy Stage 2 計分 plpgsql 函式。tier 已於 migration 162 統一
 *   T1–T5、改由計分引擎（P3b `runStage2and3Sql` / `runStage2and3SqlMssql`）以
 *   `score → card_level（ob_levelcard_level）→ tier_level（ob_tier NULL-aware JOIN）` 計算。
 *   Spike 1（P1 期間）＋ P1b2 端對端 `OBJECT_ID('dbo.fn_calc_tier_level') = NULL` 雙重確認：
 *   MSSQL baseline 不建立此函式、production 計分/分派引擎零 live 呼叫。
 *
 * 本 spec 為「純靜態 fs+regex 守門」（不需 MSSQL/PG 連線、恆執行於預設 `vitest run`），
 * 鎖住三項不變式，防止死碼被重新引入：
 *   GATE  — MSSQL baseline migration 不建立 `fn_calc_tier_level`（承 P1b2 TIERFN-002，
 *            以「不依賴 DB 連線的獨立靜態斷言」補強；不引入 mssql-env-preload 的 DB_TYPE 副作用）。
 *   ENGINE — 計分/分派引擎 production code（`src/modules/assignment` +
 *            `src/modules/assignment-scoring`，排除 `__tests__`）無任何 live 呼叫形式
 *            `fn_calc_tier_level(`（註解提及名稱以記錄「解耦」為合法，故只鎖呼叫形式）。
 *   TIERSRC— tier_level 由計分引擎 executor（PG + MSSQL 兩版）之 `tier_level = ti.tier_level`
 *            （JOIN `ob_tier`）產生，承 P3b；且兩 executor 皆不含 `fn_calc_tier_level(`。
 *
 * PG 路徑零風險原則（§2.5）：PG baseline migration `1711360000000-BaselineSchema.ts` 之
 *   `CREATE FUNCTION public.fn_calc_tier_level(...)` 與 `src/database/functions/fn_calc_tier_level.sql`
 *   （PG-only legacy）刻意**不移除**、不在本守門掃描範圍；待 Phase 6 cutover 隨整批 PG 產物移除。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const API_SRC = join(__dirname, '..', '..'); // apps/api/src

// live 呼叫 / 建立形式：函式名後緊接（可含空白）左括號。註解僅提及名稱（無括號）不匹配。
const CALL_FORM = /fn_calc_tier_level\s*\(/;

// 死碼函式名（純子字串；用於 baseline migration「完全不含」之最嚴斷言，承 P1b2 TIERFN-002）。
const FN_NAME = 'fn_calc_tier_level';

const MSSQL_MIGRATION_DIR = join(API_SRC, 'database', 'migrations', 'mssql');
const MSSQL_BASELINE_SCHEMA = join(MSSQL_MIGRATION_DIR, '1751884800000-MssqlBaselineSchema.ts');
const MSSQL_BASELINE_REFDATA = join(MSSQL_MIGRATION_DIR, '1751884800001-MssqlBaselineReferenceData.ts');
const MSSQL_QUEUE_SCHEMA = join(MSSQL_MIGRATION_DIR, '1751884800002-MssqlQueueJobSchema.ts');

const PG_EXECUTOR = join(API_SRC, 'modules', 'assignment', 'stage1', 'stage2to4-sql-executor.ts');
const MSSQL_EXECUTOR = join(API_SRC, 'modules', 'assignment', 'stage1', 'stage2to4-sql-executor-mssql.ts');

const ASSIGNMENT_DIR = join(API_SRC, 'modules', 'assignment');
const ASSIGNMENT_SCORING_DIR = join(API_SRC, 'modules', 'assignment-scoring');

/** 遞迴收集目錄下所有 .ts production 檔（排除任何 `__tests__` 路徑段與 .spec.ts）。 */
function collectProductionTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === '__tests__') continue; // 測試檔（describe 字串可合法提及名稱）不列入 production 掃描
      out.push(...collectProductionTsFiles(full));
    } else if (name.endsWith('.ts') && !name.endsWith('.spec.ts')) {
      out.push(full);
    }
  }
  return out;
}

// ===========================================================================
// 一、GATE — MSSQL baseline 不建立 fn_calc_tier_level（承 P1b2 TIERFN-002，靜態獨立補強）
// ===========================================================================
describe('AD-E07-42 P3e GATE — MSSQL baseline 不建立 fn_calc_tier_level', () => {
  it('TS-MSSQL-P3E-GATE-001（承 P1b2 TIERFN-002）：MSSQL baseline schema 原始碼完全不含 fn_calc_tier_level', () => {
    const src = readFileSync(MSSQL_BASELINE_SCHEMA, 'utf8');
    expect(src.includes(FN_NAME)).toBe(false);
    expect(CALL_FORM.test(src)).toBe(false);
  });

  it('TS-MSSQL-P3E-GATE-002：MSSQL baseline reference-data migration 亦不含此函式名', () => {
    const src = readFileSync(MSSQL_BASELINE_REFDATA, 'utf8');
    expect(src.includes(FN_NAME)).toBe(false);
  });

  it('TS-MSSQL-P3E-GATE-003：MSSQL queue-job schema migration 亦不含此函式名', () => {
    const src = readFileSync(MSSQL_QUEUE_SCHEMA, 'utf8');
    expect(src.includes(FN_NAME)).toBe(false);
  });
});

// ===========================================================================
// 二、ENGINE — 計分/分派引擎 production code 無 live 呼叫（fs+regex 掃描，防重引入）
// ===========================================================================
describe('AD-E07-42 P3e ENGINE — 計分/分派引擎 production code 零 live 呼叫', () => {
  it('TS-MSSQL-P3E-ENGINE-001：src/modules/assignment（排除 __tests__）無 fn_calc_tier_level( 呼叫形式', () => {
    const files = collectProductionTsFiles(ASSIGNMENT_DIR);
    // 自我防呆：確有掃到檔案（避免路徑錯誤導致空掃描而假綠）。
    expect(files.length).toBeGreaterThan(0);
    const offenders = files.filter((f) => CALL_FORM.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('TS-MSSQL-P3E-ENGINE-002：src/modules/assignment-scoring（排除 __tests__）無 fn_calc_tier_level( 呼叫形式', () => {
    const files = collectProductionTsFiles(ASSIGNMENT_SCORING_DIR);
    expect(files.length).toBeGreaterThan(0);
    const offenders = files.filter((f) => CALL_FORM.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});

// ===========================================================================
// 三、TIERSRC — tier_level 由計分引擎 executor 產生（承 P3b），非死碼函式
// ===========================================================================
describe('AD-E07-42 P3e TIERSRC — tier_level 由計分引擎 executor 產生（承 P3b）', () => {
  it('TS-MSSQL-P3E-TIERSRC-001（PG，承 F100/P3b）：stage2to4-sql-executor 以 tier_level = ti.tier_level（JOIN ob_tier）計算 tier', () => {
    const src = readFileSync(PG_EXECUTOR, 'utf8');
    expect(src.includes('tier_level = ti.tier_level')).toBe(true);
    expect(src.includes('ob_tier')).toBe(true);
    expect(CALL_FORM.test(src)).toBe(false); // 引擎不呼叫死碼函式
  });

  it('TS-MSSQL-P3E-TIERSRC-002（MSSQL，承 P3b）：stage2to4-sql-executor-mssql 同樣以 tier_level = ti.tier_level 計算 tier', () => {
    const src = readFileSync(MSSQL_EXECUTOR, 'utf8');
    expect(src.includes('tier_level = ti.tier_level')).toBe(true);
    expect(src.includes('ob_tier')).toBe(true);
    expect(CALL_FORM.test(src)).toBe(false);
  });
});
