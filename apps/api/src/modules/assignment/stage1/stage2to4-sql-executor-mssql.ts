/**
 * stage2to4-sql-executor-mssql — AD-E07-42 P3b：`stage2to4-sql-executor.ts` 之 MSSQL 平行版
 * （Stage 2 計分 + score→card_level→tier_level 一道 UPDATE；不含 Stage 3c/3d/3e，屬 P3c/P3d 範圍）。
 *
 * 與 PG 版（runStage2and3Sql）逐條等價，方言差異：
 *   ① `UPDATE ob_monthly_run_result r SET ... FROM ob_pool_data o ... WHERE o.orgno=r.orgno ...`
 *      （PG：目標就地宣告別名不入 FROM）→ MSSQL `UPDATE r SET ... FROM ob_monthly_run_result r
 *      INNER JOIN ob_pool_data o ON o.orgno=r.orgno AND o.appl_no=r.appl_no ...`（目標併入 FROM，
 *      join key 移入 INNER JOIN ON；UPDATEFROM-001/002/003）。WHERE 僅保留 run_id/list_no（防跨 run 污染）。
 *   ② `CROSS JOIN LATERAL (SELECT ... ) sub` → `CROSS APPLY (SELECT ...) sub`（T-SQL 原生 LATERAL；
 *      純量子查詢恆 1 列，score NULL 亦不掉列，CROSSAPPLY-001~003）。
 *   ③ `ti.card_level IS NOT DISTINCT FROM lv.card_level` → `(ti.card_level = lv.card_level OR
 *      (ti.card_level IS NULL AND lv.card_level IS NULL))`（NULL-aware fallback；DISTINCTFROM-001~005）。
 *   ④ `NULL::int` → `CAST(NULL AS INT)`；`(scoreExpr)::int` → `CAST((scoreExpr) AS INT)`（DECIMAL-SCOREINT-001）。
 *   ⑤ score 表達式 fallback schema 檢查：SQL 生成前查 INFORMATION_SCHEMA.COLUMNS（一次性，
 *      I-MSSQL-DYNAMIC-FALLBACK-01 / FALLBACK-005 N+1 禁止），以 Set 注入 buildStage2ScoreExprMssql。
 *
 * ⚠️ PG 檔（stage2to4-sql-executor.ts）完全不動（STATIC-002）；本檔為新增平行版。
 *   F102（I-CR-STAGE2-CLEAN-01）：Stage 2 **不寫 is_cr**（同 PG 版）。
 */

import type { EntityManager } from 'typeorm';

import { buildStage2ScoreExprMssql } from './stage2to4-sql-builder-mssql';
import type { Stage2to4ListContext } from './stage2to4-sql-executor';

function escape(
  manager: EntityManager,
  sqlWithNamedParams: string,
  params: Record<string, unknown>,
): [string, unknown[]] {
  return manager.connection.driver.escapeQueryWithParameters(
    sqlWithNamedParams,
    params,
    {},
  );
}

/**
 * 一次性查回 ob_pool_data 現有欄位集合（小寫，I-MSSQL-CATALOG-CASE-01）。
 * 供 fallback（to_jsonb 等價）schema 檢查判定欄位存在與否——O(1) 查詢（非逐欄 N+1，FALLBACK-005）。
 *
 * ⚠️ 目錄查詢須用大寫 `INFORMATION_SCHEMA.COLUMNS`（BIN collation 下小寫查無資料）。
 *   欄名以 LOWER() 正規化，與 buildStage2ScoreExprMssql 之 `columnName.toLowerCase()` 比對一致。
 */
export async function fetchPoolDataColumnsMssql(
  manager: EntityManager,
): Promise<Set<string>> {
  const rows = (await manager.query(
    `SELECT LOWER(COLUMN_NAME) AS name FROM INFORMATION_SCHEMA.COLUMNS ` +
      `WHERE TABLE_NAME = 'ob_pool_data'`,
  )) as Array<{ name: string }>;
  return new Set((rows ?? []).map((r) => r.name));
}

/**
 * Stage 2 計分（MSSQL）：UPDATE ob_monthly_run_result SET score / card_level / tier_level。
 *
 * @param existingColumns （選填）預查好之 ob_pool_data 欄位集合；未提供則本函式自行一次性查詢
 *   （FALLBACK-005：每次呼叫恰 1 次 INFORMATION_SCHEMA 查詢）。
 */
export async function runStage2and3SqlMssql(
  manager: EntityManager,
  ctx: Stage2to4ListContext,
  existingColumns?: ReadonlySet<string>,
): Promise<void> {
  const poolColumns = existingColumns ?? (await fetchPoolDataColumnsMssql(manager));

  const { scoreExpr, needsCustomerCore, needsArCapital, params: scoreParams } =
    buildStage2ScoreExprMssql(
      ctx.cardType,
      ctx.cardVersion,
      ctx.activeColumns,
      ctx.scoreRows,
      'sc',
      poolColumns,
    );

  const params: Record<string, unknown> = {
    runId: ctx.runId,
    listNo: ctx.listNo,
    cardType: ctx.cardType,
    lvVersion: ctx.cardVersion,
    ...scoreParams,
  };

  const customerCoreJoin = needsCustomerCore
    ? 'LEFT JOIN customer_core cc ON cc.source_customer_no = o.custo_no'
    : '';
  const arCapitalJoin = needsArCapital
    ? 'LEFT JOIN ob_arreturndf_min_cap ar ON ar.appl_no = o.appl_no'
    : '';

  // 無 active version → CAST(NULL AS INT)；否則 CAST((SUM CASE…) AS INT)。
  const scoreSelect = scoreExpr === null ? 'CAST(NULL AS INT)' : `CAST((${scoreExpr}) AS INT)`;

  const sql =
    `UPDATE r SET ` +
    `score = sub.score, ` +
    `card_level = lv.card_level, ` +
    `tier_level = ti.tier_level, ` +
    `updated_at = CURRENT_TIMESTAMP ` +
    // 🔴 UPDATEFROM：目標 ob_monthly_run_result 併入 FROM；join key 移入 INNER JOIN ON。
    `FROM ob_monthly_run_result r ` +
    `INNER JOIN ob_pool_data o ON o.orgno = r.orgno AND o.appl_no = r.appl_no ` +
    `${customerCoreJoin} ` +
    `${arCapitalJoin} ` +
    // 🔴 CROSS APPLY（LATERAL 等價）：讓 lv / ti join 可引用 sub.score。
    `CROSS APPLY (SELECT ${scoreSelect} AS score) sub ` +
    `LEFT JOIN ob_levelcard_level lv ON lv.card_type = :cardType ` +
    `AND lv.card_version = :lvVersion ` +
    `AND sub.score IS NOT NULL ` +
    `AND sub.score >= lv.score_s AND sub.score <= lv.score_e ` +
    // 🔴 tier：card_level NULL-aware（IS NOT DISTINCT FROM → OR-NULL 重寫）。
    `LEFT JOIN ob_tier ti ON ti.card_type = :cardType ` +
    `AND (ti.card_level = lv.card_level OR (ti.card_level IS NULL AND lv.card_level IS NULL)) ` +
    `AND (sub.score IS NOT NULL OR lv.card_level IS NOT NULL) ` +
    // 🔴 WHERE 僅 run_id/list_no（防跨 run 污染，UPDATEFROM-002）。
    `WHERE r.run_id = :runId AND r.list_no = :listNo`;

  const [escaped, parameters] = escape(manager, sql, params);
  await manager.query(escaped, parameters);
}
