/**
 * buildStage1SqlMssql — AD-E07-42 P3a：`stage1-sql-builder.ts` 之 MSSQL 平行版。
 *
 * 與 PG 版（buildStage1Sql）逐條等價，方言差異僅兩處：
 *   ⑥ year-above 前導數字擷取：PG `SUBSTRING(o.year_produ FROM '^[0-9]+')::int`
 *      → MSSQL `PATINDEX('%[^0-9]%', ...)` + `LEFT` + `TRY_CAST(... AS INT)`（見 mssqlLeadingYearExpr）。
 *   ①b customer_core AGE：委派 buildCustomerCoreClauseMssql（DATEDIFF 公式，見該檔）。
 *
 * 其餘站點（欄位篩選 composer、month_cnt、詐騙白牌 COALESCE+LIKE、近 3 月去重 NOT EXISTS、
 * 機車期中 / 期中小資 CAST(... AS numeric)）皆 ANSI，與 PG 版逐字相同（AD §2.1 表格「不變」列）。
 *
 * ⚠️ PG 檔（stage1-sql-builder.ts）完全不動（AD §1.1 / STATIC-002）；本檔為新增平行版。
 * 沿用 PG 版所有純函式（buildStage1WhereConditions / buildMonthCntFragment / computeDedupWindow /
 * matchesSpecialRule）——這些不含方言字面值，無需 MSSQL 版本。
 */

import type { Repository } from 'typeorm';

import type { ObListDefinition } from '@/database/entities/ob-list-definition.entity';
import type { ObPoolDataList } from '@/database/entities/ob-pool-data-list.entity';
import {
  buildMonthCntFragment,
  computeDedupWindow,
  type Stage1ChainWarning,
} from './stage1-filter-chain';
import { buildStage1WhereConditions } from './stage1-query-composer';
import { buildCustomerCoreClauseMssql } from './stage1-customer-core-clause-mssql';
import { matchesSpecialRule } from './special-rules';
// 沿用 PG 版之輸出型別（結構與 dialect 無關）。
import type { Stage1SqlCore } from './stage1-sql-builder';

/**
 * MSSQL 前導數字年份表達式（對齊 PG `SUBSTRING(col FROM '^[0-9]+')::int`，「擷取」非「驗證」）。
 *
 * 語意（對照 JS `parseInt(year_produ ?? '1900', 10)`）：
 *   - col IS NULL              → 1900（退化，對應 JS `?? '1900'`）
 *   - LEN(col)=0（空字串）      → NULL（無前導數字 → JS parseInt('')=NaN → 保留）🔴 空字串陷阱守門
 *   - PATINDEX('%[^0-9]%',col)=0（全數字非空）→ TRY_CAST(col AS INT)
 *   - PATINDEX(...)=1（首字元即非數字，如 'N/A'）→ NULL（無前導數字 → 保留）
 *   - 其餘（前導數字 + 尾隨非數字，如 '1980abc'）→ TRY_CAST(LEFT(col, PATINDEX-1) AS INT)
 *
 * 🔴 空字串 vs 全數字：PATINDEX('%[^0-9]%','')=0 與「全數字」同值，故須額外 `LEN=0→NULL` 特判區分
 *   （I-MSSQL-REGEX-CHARCLASS-01；P4a 全字串驗證公式 `NOT LIKE '%[^0-9]%'` 不可逐字複用——語意不同）。
 *
 * @param colRef year_produ 欄位表達式（如 'o.year_produ'）
 */
export function mssqlLeadingYearExpr(colRef: string): string {
  const pat = `PATINDEX('%[^0-9]%', ${colRef})`;
  return (
    `(CASE ` +
    `WHEN ${colRef} IS NULL THEN 1900 ` +
    `WHEN LEN(${colRef}) = 0 THEN NULL ` +
    `WHEN ${pat} = 0 THEN TRY_CAST(${colRef} AS INT) ` +
    `WHEN ${pat} = 1 THEN NULL ` +
    `ELSE TRY_CAST(LEFT(${colRef}, ${pat} - 1) AS INT) END)`
  );
}

/**
 * 產生 Stage 1 唯一 SQL core（WHERE + params）之 MSSQL 版，run / estimate 共用（I-RUN-EST-01）。
 * 簽章與 PG 版 buildStage1Sql 完全一致，呼叫端（executor mssql 版）可依 dialect 切換。
 */
export async function buildStage1SqlMssql(
  list: ObListDefinition,
  workdt: Date,
  poolDataListRepo: Repository<ObPoolDataList>,
): Promise<Stage1SqlCore> {
  const warnings: Stage1ChainWarning[] = [];
  const fromAlias = 'o' as const;

  // ① 欄位篩選（沿用既有 composer，ANSI；composer 對 customer_core 條件靜默 skip）
  const fieldFragment = buildStage1WhereConditions(list);
  for (const w of fieldFragment.warnings) warnings.push(w);

  // ①b customer_core 條件式 LEFT JOIN + cc.* fragments（MSSQL 版：DATEDIFF AGE / LEFT3 / 直接比對）。
  const ccConditions = list.condition_payload?.conditions ?? [];
  const customerCoreClause = buildCustomerCoreClauseMssql(
    ccConditions,
    workdt,
    fromAlias,
    warnings,
  );

  // 統一 EMPTY_CONDITIONS 判定（與 PG 版逐字相同）：composer 側與 customer_core 側皆無有效 fragment 才 skip。
  if (fieldFragment.where === null && customerCoreClause.whereFragments.length === 0) {
    return {
      where: null,
      params: {},
      fromAlias,
      skip: true,
      skipReason: 'EMPTY_CONDITIONS',
      warnings,
      customerCoreJoin: null,
    };
  }

  const clauses: string[] = [];
  const params: Record<string, unknown> = {};

  // ① 欄位篩選 fragment（"col" 形式引用，無 alias；FROM 單一表 ob_pool_data o，無歧義）。
  if (fieldFragment.where) {
    clauses.push(`(${fieldFragment.where})`);
    Object.assign(params, fieldFragment.params);
  }

  // ①b customer_core fragments（AND 交換律，順序不影響正確性）。
  for (const f of customerCoreClause.whereFragments) {
    clauses.push(f);
  }
  Object.assign(params, customerCoreClause.params);

  // ② MONTH_CNT 期別過濾（沿用 buildMonthCntFragment，"month_cnt" IN (:...) 為 ANSI）
  const monthCntFragment = buildMonthCntFragment(list, warnings);
  if (monthCntFragment) {
    clauses.push(`(${monthCntFragment.fragment})`);
    Object.assign(params, monthCntFragment.params);
  }

  // ③ 詐騙白牌 DELETE（COALESCE + LIKE，ANSI；與 PG 版逐字相同）。
  clauses.push(
    `NOT (${fromAlias}.list_type = :fraudListType AND COALESCE(${fromAlias}.spec_name, '') LIKE :fraudPattern)`,
  );
  params.fraudListType = '01';
  params.fraudPattern = '%白牌%';

  // ④ 近 3 月去重 anti-join（NOT EXISTS，ANSI；custo_no=NULL 安全）。
  const { assigndayStart, assigndayEnd } = await computeDedupWindow(
    workdt,
    poolDataListRepo,
  );
  clauses.push(
    `NOT EXISTS (SELECT 1 FROM ob_pool_data_list pdl ` +
      `WHERE pdl.custo_no = ${fromAlias}.custo_no ` +
      `AND pdl.custo_no IS NOT NULL ` +
      `AND pdl.assignday >= :dedupStart AND pdl.assignday <= :dedupEnd)`,
  );
  params.dedupStart = assigndayStart;
  params.dedupEnd = assigndayEnd;

  // ⑤ 機車期中（CAST(... AS numeric) + COALESCE，ANSI；與 PG 版逐字相同）。
  if (matchesSpecialRule(list.list_nm, 'R-PERIOD-MOTORCYCLE')) {
    clauses.push(
      `NOT (` +
        `COALESCE(CAST(${fromAlias}.payt_term AS numeric), 0) >= COALESCE(CAST(${fromAlias}.deal_num AS numeric), 0) - 3 ` +
        `OR ${fromAlias}.appl_no LIKE :mcPrefixT ` +
        `OR ${fromAlias}.appl_no LIKE :mcPrefixY` +
        `)`,
    );
    params.mcPrefixT = 'T%';
    params.mcPrefixY = 'Y%';
  }

  // ⑥ 期中小資（CAST(... AS numeric) + COALESCE + LIKE，ANSI；與 PG 版逐字相同）。
  if (matchesSpecialRule(list.list_nm, 'R-PERIOD-XIAOZI')) {
    clauses.push(
      `NOT (` +
        `COALESCE(CAST(${fromAlias}.payt_num AS numeric), 0) > COALESCE(CAST(${fromAlias}.deal_num AS numeric), 0) - 8 ` +
        `AND COALESCE(${fromAlias}.spec_name, '') LIKE :xiaoziPattern` +
        `)`,
    );
    params.xiaoziPattern = '%小資%';
  }

  // ⑦ year-above（MSSQL PATINDEX 前導數字擷取，見 mssqlLeadingYearExpr）。
  //    keep = NOT (yearval IS NOT NULL AND yearval < cutoff)：yearval=NULL（NaN 等價）→ 保留。
  if (matchesSpecialRule(list.list_nm, 'R-YEAR-ABOVE')) {
    const cutoffYear = workdt.getFullYear() - 15;
    const yearvalExpr = mssqlLeadingYearExpr(`${fromAlias}.year_produ`);
    clauses.push(
      `NOT (${yearvalExpr} IS NOT NULL AND ${yearvalExpr} < :yearAboveCutoff)`,
    );
    params.yearAboveCutoff = cutoffYear;
  }

  return {
    where: clauses.length > 0 ? clauses.join(' AND ') : null,
    params,
    fromAlias,
    skip: false,
    warnings,
    customerCoreJoin: customerCoreClause.join,
  };
}
