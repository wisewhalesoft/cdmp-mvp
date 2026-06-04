/**
 * buildStage2to4Sql — F100 / AD-E07-28 P3 Stage 2~4 set-based SQL 下推核心
 *
 * P2（F099）已以 `INSERT…SELECT` 把 Stage 1 挑選之案件寫入 `ob_monthly_run_result`
 * （run_id / list_no / orgno / appl_no / custo_no / settle_src，score/level/tier/emplid 皆 NULL）。
 *
 * P3 在其上以 SQL 補計分 / CR / 分派，消除「re-hydrate 全 pool 回 heap 計分」往返（I-NOLOAD-01）：
 *   - Stage 2 計分：對該 card_type active version 之 active `ob_levelcard_column`，以
 *     `SUM(CASE WHEN <區間/類別命中> THEN score ELSE 0 END)` 累加 score；
 *     可從 `ob_pool_data` 直接取之欄位沿用既有映射，客戶屬性欄位 `LEFT JOIN customer_core`（AD-E06-1，無 entity）補齊。
 *   - score → card_level（`ob_levelcard_level` 區間）→ tier_level（`ob_tier` NULL-aware）。
 *   - Stage 3 CR：`is_cr` 以 `EXISTS`（歷史 result snapshot 未成交案件）下推（對齊 JS collectCrCandidates）。
 *   - Stage 4 st4_exchange：T1/T2 案件 `CEIL(n*0.1)`（保底 1）以
 *     `ROW_NUMBER() OVER (PARTITION BY list_no ORDER BY orgno, appl_no)` 轉該部門單一 senior（OQ-F100-01）。
 *
 * 設計原則（對齊 stage1-sql-builder）：純函式群組（非 NestJS Injectable），回傳「SQL 字串 + named params」，
 * 由呼叫端（stage2to4-sql-executor）以 driver.escapeQueryWithParameters 轉 positional + 綁定（SQLG-003）。
 *
 * ⚠️ DB_TYPE gate：本下推一律對 Postgres 執行（與 P2 一致）。視窗函式 / SUM(CASE…) / customer_core
 *    LEFT JOIN / EXISTS 在 SQLite 不具代表性（I-PORT-01）；SQLite / 非 PG 環境沿用 JS executeV2（golden oracle）。
 *
 * ⚠️ customer_core：依 AD-E06-1 不建 TypeORM entity，以 raw SQL LEFT JOIN。
 *    JOIN key = `ob_pool_data.custo_no = customer_core.source_customer_no`（dev 88 萬筆 match 已驗證）。
 *    LEFT JOIN（非 INNER）：無對應客戶之案件不消失，屬性以 NULL 參與 → 不匹配任何 score row → +0
 *    （與 JS resolveColumnValue default `''` 不匹配等價，RISK-F100-002）。
 */

import type { Repository } from 'typeorm';

import type { ObLevelcardColumn } from '@/database/entities/ob-levelcard-column.entity';
import type { ObLevelcardScore } from '@/database/entities/ob-levelcard-score.entity';

// ---------------------------------------------------------------------------
// column_name → ob_pool_data / customer_core 取值來源映射（architecture-spec.md §3.10 AD-E07-10-L）
// ---------------------------------------------------------------------------

/**
 * 計分欄位之 SQL 取值表達式。
 *   - kind='range'：數值欄位（與 ob_levelcard_score.level2_s/level2_e 區間比較）
 *   - kind='category'：字串欄位（與 ob_levelcard_score.level1 trim 後相等比較）
 *
 * 表達式以 alias `o`（ob_pool_data）/ `cc`（customer_core LEFT JOIN）引用。
 * 來源未明確（architecture-spec.md §3.10 未列、或需額外表如 ob_arreturndf_min_cap）之 column_name
 * **不在此表** → 比照 JS resolveColumnValue default：回傳 NULL（range）/ ''（category）→ 不取分
 * （spec-schema-gap-first：不臆造來源欄位）。
 */
interface ColumnSource {
  kind: 'range' | 'category';
  /** SQL 純量表達式（已含 COALESCE 缺值處理）。 */
  expr: string;
}

/**
 * 解析 column_name 之 SQL 取值表達式。
 *
 * **已映射（architecture-spec.md §3.10 + 現行 JS resolveColumnValue）**：
 *   ob_pool_data 直接取：
 *     - LIST_MONTH（range）← o.month_cnt（缺值 25，對齊 JS）
 *     - PROJECT_TP（category）← o.spec_tp（缺值 '01'，對齊 JS；§3.10 之 spec_name '%專案%' → LEVEL1='A'
 *       衍生屬 open item，比照 JS 不實作）
 *     - CAR_YEAR（range）← 當年 − o.year_produ（缺值 0，對齊 JS）
 *     - COMMISSION（range）← o.commission（缺值 0，對齊 JS）
 *   customer_core LEFT JOIN（P3 新增，§3.10）：
 *     - CUS_SEX（category）← cc.gender（缺值 '3'）
 *     - AGE（range）← 由 cc.date_of_birth 算年齡（缺值 0）
 *     - EDUCAT_BACK（category）← cc.education_code（缺值 ''）
 *     - CAREA_NO1/CAREA_NO2/CELLULAR（range）← (phone IS NOT NULL)::int（缺值 0）
 *     - HPOST_NUM_NM/CPOST_NUM_NM/CO_NUM_NM（category）← zip（缺值 ''）
 *     - SALES_STS（category）← o.sales_sts_na CASE（缺值 'HFC'）
 *     - LOAN_RATE（range）← o.loan_rate（缺值 0）
 *
 * **未映射（回 undefined → 不取分，open item）**：
 *   - ADD_UN_CAPITAL：來源 ob_arreturndf_min_cap（非 customer_core，需額外 JOIN）→ 比照 JS default 不取分。
 *   - 其餘未列於 §3.10 之 column_name → 不臆造，不取分。
 */
function resolveColumnSource(columnName: string): ColumnSource | undefined {
  switch (columnName) {
    // ----- ob_pool_data 直接取（沿用現行 JS resolveColumnValue 映射，守 (b) 下推等價）-----
    case 'LIST_MONTH':
      return { kind: 'range', expr: 'COALESCE(o.month_cnt, 25)' };
    case 'PROJECT_TP':
      return { kind: 'category', expr: "COALESCE(o.spec_tp, '01')" };
    case 'CAR_YEAR':
      // JS：year_produ 有值 → 當年 − year_produ；否則 0。
      return {
        kind: 'range',
        expr:
          "CASE WHEN o.year_produ IS NULL OR NULLIF(SUBSTRING(o.year_produ FROM '^[0-9]+'), '') IS NULL " +
          "THEN 0 ELSE EXTRACT(YEAR FROM CURRENT_DATE)::int - SUBSTRING(o.year_produ FROM '^[0-9]+')::int END",
      };
    case 'COMMISSION':
      return { kind: 'range', expr: 'COALESCE(CAST(o.commission AS numeric), 0)' };
    // ----- customer_core LEFT JOIN（P3 新增，§3.10 已映射）-----
    case 'CUS_SEX':
      return { kind: 'category', expr: "COALESCE(cc.gender, '3')" };
    case 'AGE':
      return {
        kind: 'range',
        expr:
          "CASE WHEN cc.date_of_birth IS NULL THEN 0 " +
          "ELSE EXTRACT(YEAR FROM age(cc.date_of_birth))::int END",
      };
    case 'EDUCAT_BACK':
      return { kind: 'category', expr: "COALESCE(cc.education_code, '')" };
    case 'CAREA_NO1':
      return { kind: 'range', expr: '(cc.home_phone IS NOT NULL)::int' };
    case 'CAREA_NO2':
      return { kind: 'range', expr: '(cc.contact_phone IS NOT NULL)::int' };
    case 'CELLULAR':
      return { kind: 'range', expr: '(cc.mobile_phone IS NOT NULL)::int' };
    case 'HPOST_NUM_NM':
      return { kind: 'category', expr: "COALESCE(cc.residential_zip, '')" };
    case 'CPOST_NUM_NM':
      return { kind: 'category', expr: "COALESCE(cc.mailing_zip, '')" };
    case 'CO_NUM_NM':
      return { kind: 'category', expr: "COALESCE(cc.company_zip, '')" };
    case 'SALES_STS':
      return {
        kind: 'category',
        expr:
          "CASE o.sales_sts_na WHEN 'AGENT' THEN 'AGENT' WHEN '經銷商' THEN 'UCD' ELSE 'HFC' END",
      };
    case 'LOAN_RATE':
      return { kind: 'range', expr: 'COALESCE(CAST(o.loan_rate AS numeric), 0)' };
    default:
      // 來源不明確（未列於 §3.10，或需額外表）→ 不臆造，比照 JS default 不取分（open item）。
      return undefined;
  }
}

/** 公開供測試 / 文件：列出已映射之計分欄位（其餘 column_name 比照 JS 不計分）。 */
export const MAPPED_SCORING_COLUMNS = [
  'LIST_MONTH',
  'PROJECT_TP',
  'CAR_YEAR',
  'COMMISSION',
  'CUS_SEX',
  'AGE',
  'EDUCAT_BACK',
  'CAREA_NO1',
  'CAREA_NO2',
  'CELLULAR',
  'HPOST_NUM_NM',
  'CPOST_NUM_NM',
  'CO_NUM_NM',
  'SALES_STS',
  'LOAN_RATE',
] as const;

/** customer_core 客戶屬性欄位（需 LEFT JOIN customer_core 才能取值）。 */
export const CUSTOMER_CORE_COLUMNS = new Set<string>([
  'CUS_SEX',
  'AGE',
  'EDUCAT_BACK',
  'CAREA_NO1',
  'CAREA_NO2',
  'CELLULAR',
  'HPOST_NUM_NM',
  'CPOST_NUM_NM',
  'CO_NUM_NM',
]);

// ---------------------------------------------------------------------------
// Stage 2 計分 SQL：SUM(CASE WHEN …) 子查詢
// ---------------------------------------------------------------------------

export interface Stage2ScoreSql {
  /**
   * 純量子查詢：對單列 ob_pool_data o（+ customer_core cc）累加 score（含區間 / 類別 CASE）。
   * 已映射欄位皆有 active column 但無對應 score → 命中 0 → SUM=0（有 active version 但 0 命中）。
   * card_type 無 active version → activeColumns 空 → 此函式回傳 null（呼叫端 score 寫 NULL）。
   */
  scoreExpr: string | null;
  /** 是否有任一已映射且 active 之 customer_core 欄位（決定是否需 LEFT JOIN customer_core）。 */
  needsCustomerCore: boolean;
  params: Record<string, unknown>;
}

/**
 * 為單一 card_type 之 active version 產生 Stage 2 score 純量表達式（SUM CASE WHEN）。
 *
 * @param cardType      名單 card_type
 * @param cardVersion   active version（已由呼叫端確定 active）；null → 無 active version
 * @param activeColumns 該 card_type+version 之 active ob_levelcard_column（status='active'）
 * @param scoreRows     該 card_type+version 之 ob_levelcard_score（區間 / 類別權重）
 * @param paramPrefix   named param 前綴（多 list 串接避免衝突）
 */
export function buildStage2ScoreExpr(
  cardType: string,
  cardVersion: number | null,
  activeColumns: ObLevelcardColumn[],
  scoreRows: ObLevelcardScore[],
  paramPrefix: string,
): Stage2ScoreSql {
  const params: Record<string, unknown> = {};

  if (cardVersion === null) {
    // 無 active version → score NULL（AC-3 / SCORE-006），不查 column。
    return { scoreExpr: null, needsCustomerCore: false, params };
  }

  const caseFragments: string[] = [];
  let needsCustomerCore = false;
  let pIdx = 0;

  for (const col of activeColumns) {
    if (!col.column_name) continue;
    const src = resolveColumnSource(col.column_name);
    if (!src) continue; // 來源不明確 → 比照 JS 不取分（open item）。

    if (CUSTOMER_CORE_COLUMNS.has(col.column_name)) needsCustomerCore = true;

    // 該 column 之 score rows（同 card_type + version + column_name）。
    const colScores = scoreRows.filter(
      (s) =>
        s.card_type === cardType &&
        s.card_version === cardVersion &&
        s.column_name === col.column_name,
    );
    if (colScores.length === 0) continue;

    // 對齊 JS computeScore：逐 score row 依序比對，命中第一個即取分（break）。
    // SQL 以巢狀 CASE WHEN 表達「第一個命中即取分，否則 0」（依 colScores 順序）。
    const whenClauses: string[] = [];
    for (const sr of colScores) {
      const sp = `${paramPrefix}_${pIdx++}`;
      if (src.kind === 'category') {
        if (sr.level1 === null || sr.level1 === undefined) continue;
        // 類別型：trim 後字串相等（JS String(value) === String(level1).trim()）。
        // value 端為 SQL 表達式（已含 COALESCE）；以 TRIM 對齊（pool 值 / level1 兩端 trim 後比較）。
        params[`${sp}_v`] = String(sr.level1).trim();
        params[`${sp}_s`] = sr.score;
        whenClauses.push(
          `WHEN TRIM(CAST(${src.expr} AS text)) = :${sp}_v THEN :${sp}_s`,
        );
      } else {
        // 區間型：level2_s/level2_e 有值 → value 落 [lo, hi]。
        if (sr.level2_s === null || sr.level2_e === null) continue;
        const lo = Number(sr.level2_s);
        const hi = Number(sr.level2_e);
        if (Number.isNaN(lo) || Number.isNaN(hi)) continue;
        params[`${sp}_lo`] = lo;
        params[`${sp}_hi`] = hi;
        params[`${sp}_s`] = sr.score;
        whenClauses.push(
          `WHEN ${src.expr} >= :${sp}_lo AND ${src.expr} <= :${sp}_hi THEN :${sp}_s`,
        );
      }
    }
    if (whenClauses.length === 0) continue;
    // 巢狀 CASE：第一個命中即取分（依 score row 順序），否則 0（對齊 JS break 語意）。
    caseFragments.push(`(CASE ${whenClauses.join(' ')} ELSE 0 END)`);
  }

  if (caseFragments.length === 0) {
    // 有 active version 但無任一可計分維度命中規則 → score = 0（AC-3 / SCORE-007，與 NULL 區分）。
    return { scoreExpr: '0', needsCustomerCore, params };
  }

  return {
    scoreExpr: caseFragments.join(' + '),
    needsCustomerCore,
    params,
  };
}
