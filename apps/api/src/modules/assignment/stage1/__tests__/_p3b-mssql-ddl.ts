/**
 * AD-E07-42 P3b — 零 drift 自建 DDL（非 .spec，vitest 不收集）。
 *
 * §0.2 / HARNESS-005：Harness 對缺表以「逐字複製 baseline migration 對應 CREATE TABLE」自建。
 *   為徹底消除手動複製之 drift 風險（HARNESS-005 建議），此處**於載入時直接從
 *   `1751884800000-MssqlBaselineSchema.ts` 解析出對應 CREATE TABLE 陳述式**（非手抄常數）。
 *   → 自建 DDL 恆等於 baseline migration 之陳述式，未來 baseline 修訂自動同步。
 *
 * ⚠️ 僅取 CREATE TABLE 本體（不含 CREATE INDEX / ALTER FK）——PK 已在 CREATE TABLE 內；
 *   次要索引/跨表 FK 對測試正確性非必要（本套件控制 insert/cleanup 序），且省略不影響
 *   CREATE TABLE 欄位/型別/約束之零 drift（HARNESS-005 比對對象為 CREATE TABLE 片段）。
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const MIGRATION_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'database',
  'migrations',
  'mssql',
  '1751884800000-MssqlBaselineSchema.ts',
);

const migrationSrc = readFileSync(MIGRATION_PATH, 'utf8');

/** 從 migration 解析單一表之 `CREATE TABLE "<table>" (...)` 陳述式（backtick 內字面，逐字）。 */
function extractCreateTable(table: string): string {
  // migration 每張表為單行 `await queryRunner.query(\`CREATE TABLE "<t>" ... \`);`
  //   SQL 內不含 backtick → 以 backtick 為界擷取。
  const re = new RegExp('`(CREATE TABLE "' + table + '"[\\s\\S]*?)`');
  const m = migrationSrc.match(re);
  if (!m) {
    throw new Error(`[P3b DDL] 於 baseline migration 找不到 CREATE TABLE "${table}"`);
  }
  return m[1];
}

/**
 * 依賴表之零 drift CREATE TABLE DDL（自 baseline migration 解析）。
 * P3d（AD-E07-42）新增 `ob_emphire`（步驟 2 JOIN 來源）+ `ob_empl_set`（步驟 3 CTE 來源）——
 *   本輪首次以 raw SQL 直接 JOIN 觸及兩表；additive，既有 P3b/P3c 引用之鍵不受影響。
 */
export const MSSQL_BASELINE_DDL: Record<string, string> = {
  ob_pool_data: extractCreateTable('ob_pool_data'),
  ob_pool_data_list: extractCreateTable('ob_pool_data_list'),
  ob_list_definition: extractCreateTable('ob_list_definition'),
  assignment_run: extractCreateTable('assignment_run'),
  ob_monthly_run_result: extractCreateTable('ob_monthly_run_result'),
  customer_core: extractCreateTable('customer_core'),
  ob_levelcard_version: extractCreateTable('ob_levelcard_version'),
  ob_levelcard_column: extractCreateTable('ob_levelcard_column'),
  ob_levelcard_score: extractCreateTable('ob_levelcard_score'),
  ob_levelcard_level: extractCreateTable('ob_levelcard_level'),
  ob_tier: extractCreateTable('ob_tier'),
  ob_arreturndf_min_cap: extractCreateTable('ob_arreturndf_min_cap'),
  ob_emphire: extractCreateTable('ob_emphire'),
  ob_empl_set: extractCreateTable('ob_empl_set'),
};
