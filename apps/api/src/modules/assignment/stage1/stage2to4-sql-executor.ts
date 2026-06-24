/**
 * Stage 2~4 SQL 下推 run 包裝（F100 / AD-E07-28 P3）
 *
 * P2（F099）已 INSERT Stage 1 案件至 ob_monthly_run_result（score/level/tier/emplid 皆 NULL）。
 * P3 在其上以兩道 UPDATE 補計分 / CR / 分派（單表 set-based，消 re-hydrate heap，I-NOLOAD-01）：
 *
 *   ① runStage2and3Sql：UPDATE r SET score / card_level / tier_level
 *      - FROM ob_pool_data o LEFT JOIN customer_core cc ON o.custo_no = cc.source_customer_no
 *        LEFT JOIN ob_levelcard_level lv（score 區間 → card_level）
 *        LEFT JOIN ob_tier ti（card_type + card_level NULL-aware → tier_level）
 *      - score = Stage 2 SUM(CASE…)（buildStage2ScoreExpr）；無 active version → NULL
 *      - F102（I-CR-STAGE2-CLEAN-01）：Stage 2 **不寫 is_cr**。is_cr 由 Stage 1 帶入原始值
 *        （ob_pool_data_list），再由 F102 CR 前置步驟（cr-priority-sql.ts）依業務規則修改。
 *        原 simplified is_cr（EXISTS 歷史 snapshot 未成交同案件）邏輯已移除。
 *
 *   ② runStage4Sql：UPDATE r SET dept_id / emplid / emplid_deptid
 *      - st4_exchange：T1/T2 案件以 ROW_NUMBER() OVER (PARTITION BY list_no ORDER BY orgno, appl_no)
 *        取前 CEIL(n*0.1)（保底 1）件 → senior；其餘 → defaultEmpl（OQ-F100-01 對齊現行 JS 簡化版）。
 *      - 須在 ① 之後執行（依賴 tier_level 已寫入）。
 *
 * DB_TYPE gate：本路徑一律 PG（呼叫端以 DB_TYPE==='postgres' gate；SQLite 沿用 JS executeV2）。
 * customer_core 無 entity（AD-E06-1）→ raw SQL LEFT JOIN，僅在 PG 庫存在時可 join。
 */

import type { EntityManager } from 'typeorm';

import { buildStage2ScoreExpr } from './stage2to4-sql-builder';
import type { ObLevelcardColumn } from '@/database/entities/ob-levelcard-column.entity';
import type { ObLevelcardScore } from '@/database/entities/ob-levelcard-score.entity';

/**
 * Stage 2~3 下推單一 list 之輸入（呼叫端已查好之計分資料）。
 *
 * F101（AD-E07-29 / I-NO-ST4-EXCHANGE）：Stage 4 分派（dept_id / emplid / emplid_deptid / assignday）
 * 已移出本 context，改由 stage3to4-ration-sql（runStage3to4RationSql）以真實比例分派處理。
 * 原 placeholder 之 deptId / seniorEmplid / defaultEmplid 等欄位已廢除（st4_exchange 移除）。
 */
export interface Stage2to4ListContext {
  runId: string;
  listNo: string;
  cardType: string;
  /** active version（null → 無 active version → score NULL）。 */
  cardVersion: number | null;
  activeColumns: ObLevelcardColumn[];
  scoreRows: ObLevelcardScore[];
  /** 月跑工作年月（YYYYMM 字串）。 */
  ym: string;
}

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
 * Stage 2 計分 + Stage 3 CR：UPDATE ob_monthly_run_result SET score / card_level / tier_level / is_cr。
 *
 * 設計：以 derived join 在 UPDATE…FROM 內完成 score→level→tier：
 *   - score 子查詢（SUM CASE WHEN）需 LEFT JOIN customer_core（若有客戶屬性維度）。
 *   - card_level：score BETWEEN ob_levelcard_level.score_s/score_e（同 card_type + version）。
 *   - tier_level：ob_tier 同 card_type，card_level IS NOT DISTINCT FROM <card_level>（NULL-aware fallback）。
 *   - score NULL（無 active version）→ 不查 level（card_level NULL）；tier 亦不走 fallback（NULL，LEVTIER-004）。
 *   - F102（I-CR-STAGE2-CLEAN-01）：**不寫 is_cr**（移除原 CR 標記之 EXISTS 歷史 snapshot 邏輯）；
 *     is_cr 由 Stage 1 帶入 + F102 CR 前置步驟（cr-priority-sql.ts）依業務規則修改。
 */
export async function runStage2and3Sql(
  manager: EntityManager,
  ctx: Stage2to4ListContext,
): Promise<void> {
  const { scoreExpr, needsCustomerCore, needsArCapital, params: scoreParams } =
    buildStage2ScoreExpr(
      ctx.cardType,
      ctx.cardVersion,
      ctx.activeColumns,
      ctx.scoreRows,
      'sc',
    );

  const params: Record<string, unknown> = {
    runId: ctx.runId,
    listNo: ctx.listNo,
    cardType: ctx.cardType,
    ...scoreParams,
  };

  // customer_core LEFT JOIN（僅在有客戶屬性維度時 join，避免無謂掃描；AD-E06-1 raw SQL）。
  const customerCoreJoin = needsCustomerCore
    ? 'LEFT JOIN customer_core cc ON cc.source_customer_no = o.custo_no'
    : '';

  // F103 BR-F103-01 / I-SCORE-AR-JOIN-01：ob_arreturndf_min_cap LEFT JOIN（僅 active ADD_UN_CAPITAL 欄時注入）。
  //   alias 固定 ar；LEFT JOIN（無對應案件 → ar.add_un_capital NULL → COALESCE 0，不掉列）。
  const arCapitalJoin = needsArCapital
    ? 'LEFT JOIN ob_arreturndf_min_cap ar ON ar.appl_no = o.appl_no'
    : '';

  // score 表達式：無 active version → NULL；否則 SUM(CASE…)（needsCustomerCore 時 cc 已 join）。
  const scoreSelect = scoreExpr === null ? 'NULL::int' : `(${scoreExpr})::int`;

  const sql =
    `UPDATE ob_monthly_run_result r SET ` +
    `score = sub.score, ` +
    `card_level = lv.card_level, ` +
    `tier_level = ti.tier_level, ` +
    `updated_at = CURRENT_TIMESTAMP ` +
    `FROM ob_pool_data o ` +
    `${customerCoreJoin} ` +
    `${arCapitalJoin} ` +
    // score 以 LATERAL 計算（讓 lv / ti join 可引用 sub.score）。
    `CROSS JOIN LATERAL (SELECT ${scoreSelect} AS score) sub ` +
    `LEFT JOIN ob_levelcard_level lv ON lv.card_type = :cardType ` +
    `AND lv.card_version = :lvVersion ` +
    `AND sub.score IS NOT NULL ` +
    `AND sub.score >= lv.score_s AND sub.score <= lv.score_e ` +
    // tier：card_type 相符 + card_level NULL-aware（sub.score NULL → lv.card_level NULL →
    //   仍可命中 ob_tier 之 card_level IS NULL fallback 列；但 score NULL（無 active version）時
    //   不走 fallback（LEVTIER-004）→ 以 sub.score IS NOT NULL 守 fallback 邊界）。
    `LEFT JOIN ob_tier ti ON ti.card_type = :cardType ` +
    `AND ti.card_level IS NOT DISTINCT FROM lv.card_level ` +
    `AND (sub.score IS NOT NULL OR lv.card_level IS NOT NULL) ` +
    `WHERE r.run_id = :runId AND r.list_no = :listNo ` +
    `AND o.orgno = r.orgno AND o.appl_no = r.appl_no`;

  params.lvVersion = ctx.cardVersion;

  const [escaped, parameters] = escape(manager, sql, params);
  await manager.query(escaped, parameters);
}

// F101 / AD-E07-29（I-NO-ST4-EXCHANGE）：原 runStage4Sql（st4_exchange placeholder：dept[0] +
//   單一 defaultEmpl + 10% T1/T2→senior swap）已移除。Stage 4 真實比例分派（dept ration +
//   empl ration + ASSIGNDAY）改由 stage3to4-ration-sql 之 runStage3to4RationSql 處理。
//   原 runStage2to4Sql 包裝（runStage2and3Sql + runStage4Sql）亦移除——呼叫端改為
//   runStage2and3Sql（本檔）+ runStage3to4RationSql（stage3to4-ration-sql）依序執行。
