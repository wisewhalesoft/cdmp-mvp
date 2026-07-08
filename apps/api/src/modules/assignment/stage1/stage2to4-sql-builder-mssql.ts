/**
 * stage2to4-sql-builder-mssql — AD-E07-42 P3b：`stage2to4-sql-builder.ts` 之 MSSQL 平行版
 * （Stage 2~3 計分逐站點方言轉換；JS golden oracle ↔ MSSQL 下推逐列等價）。
 *
 * 與 PG 版（resolveColumnSource / buildStage2ScoreExpr）行為逐條等價，方言差異：
 *   ① 三處 `~ '^[0-9]+$'` 全字串數字驗證（SAFE_INT_CUS_SEX / IS_PERSONAL_GATING / EDUCAT_BACK numExpr）
 *      → MSSQL `NOT LIKE '%[^0-9]%'` + `LEN(x) > 0` 空字串守門 + `TRY_CAST`（複用 P4a
 *      type-cast-handler-mssql 已驗證公式；I-MSSQL-REGEX-CHARCLASS-01）。**非** P3a year-above 之
 *      `PATINDEX` 前導擷取（語意不同：本處為「全字串驗證回布林」，非「擷取子字串」）。
 *   ② EDUCAT_BACK 之 PG `'0' || cc.education_code` 串接 → T-SQL `'0' + cc.education_code`
 *      （NULL 傳播一致：`'0' + NULL = NULL`，對齊 PG `||`）。
 *   ③ AGE 參考日 = **今日** `CAST(SYSDATETIME() AS DATE)`（對齊 PG `age(dob)` 單引數＝CURRENT_DATE、
 *      JS `calcAgeYears(dob, new Date())`）——**不得**誤植 P3a 之 `@ccWorkdt`（工作月）；否則跨月漂移。
 *   ④ CAR_YEAR：前導年份擷取複用 P3a `mssqlLeadingYearExpr`；年份分量 = `YEAR(SYSDATETIME())`（今日）。
 *   ⑤ LOAN_RATE / fallback 命中真實欄位：`TRY_CAST(... AS NUMERIC(18,4))` 明確精度
 *      （裸 `CAST(...AS NUMERIC)` = `NUMERIC(18,0)` 會四捨五入去小數，12.50→13；I-MSSQL-DECIMAL-NORMALIZE-01）。
 *   ⑥ to_jsonb(o)->>'col' 動態 fallback（PG）→ MSSQL 無單一 SQL 等價：改「SQL 生成前 TS 端查
 *      INFORMATION_SCHEMA.COLUMNS 判斷欄位存在」（I-MSSQL-DYNAMIC-FALLBACK-01）。存在 → 直接欄位參照；
 *      不存在（幽靈欄位）→ 生成期烤入字面 `0`（非執行期動態解析）。呼叫端一次性查欄位集合以 Set 注入
 *      （選項甲，GATE-002；O(1) 查詢，非逐欄 N+1）。
 *   ⑦ composite / category 之 `CAST(... AS text)` → `CAST(... AS NVARCHAR(4000))`；`TRIM` 為 MSSQL 2017+ 原生。
 *
 * ⚠️ PG 檔（stage2to4-sql-builder.ts）完全不動（STATIC-002）；本檔為新增平行版。
 *   沿用 PG 版純函式 / 常數（cardDefault / CUSTOMER_CORE_COLUMNS / 型別）——不含方言字面值。
 */

import type { ObLevelcardColumn } from '@/database/entities/ob-levelcard-column.entity';
import type { ObLevelcardScore } from '@/database/entities/ob-levelcard-score.entity';
import {
  cardDefault,
  CUSTOMER_CORE_COLUMNS,
  type ColumnSource,
  type Stage2ScoreSql,
} from './stage2to4-sql-builder';
import { mssqlLeadingYearExpr } from './stage1-sql-builder-mssql';

/** `::TEXT` 等價字串轉型（composite / category TRIM 於字串上進行）。 */
const TEXT_CAST = 'NVARCHAR(4000)';
/**
 * 數值轉型精度（LOAN_RATE / fallback 命中真實欄位）。DECIMAL-LOANRATE-001 / GATE-004：
 *   裸 `NUMERIC` = `NUMERIC(18,0)`（四捨五入去小數，12.50→13）→ 明確 `NUMERIC(18,4)` 保留小數 + 防溢位。
 *   loan_rate baseline 為 numeric(5,2)；(18,4) 涵蓋且對 fallback 未知精度欄位亦安全（不整數化）。
 */
const NUMERIC_CAST = 'NUMERIC(18,4)';

/** SQL 字串字面值跳脫（單引號加倍）。per-card default 為 DB 管理者設定之縣市名常數。 */
function sqlLiteral(v: string): string {
  return `'${v.replace(/'/g, "''")}'`;
}

/**
 * MSSQL 全字串數字驗證（對齊 PG `x ~ '^[0-9]+$'`，回布林）。
 *   `x IS NOT NULL AND LEN(x) > 0 AND x NOT LIKE '%[^0-9]%'`
 *   🔴 空字串守門（I-MSSQL-REGEX-CHARCLASS-01）：`'' NOT LIKE '%[^0-9]%'` = TRUE，須加 `LEN(x) > 0`
 *      否則空字串誤判為合法數字（P4a CAST-EQ-002 同型陷阱）。NULL → LEN NULL → 整式 unknown → 不成立。
 *
 * @param x 待驗證之字串 SQL 表達式（欄位或子表達式）
 */
export function mssqlAllDigits(x: string): string {
  return `(${x} IS NOT NULL AND LEN(${x}) > 0 AND ${x} NOT LIKE '%[^0-9]%')`;
}

/**
 * MSSQL 整年年齡表達式，參考日 = **今日** `CAST(SYSDATETIME() AS DATE)`
 * （對齊 PG `EXTRACT(YEAR FROM age(dob))` / JS `calcAgeYears(dob, new Date())`）。
 *
 * 🔴 與 P3a `mssqlAgeExpr` 之差異：本處參考日為執行當下今日（非月跑工作月 `@ccWorkdt`）——
 *    Stage 2 計分 AGE 依「今日」，跨月重跑同 dob 得同年齡（AGESCORE-META-001 守門）。
 *
 * 引數順序（dob 為 start）：`DATEDIFF(YEAR, dob, today) - CASE 未達今年生日 THEN 1 ELSE 0 END`。
 * NULL dob → DATEDIFF NULL、MONTH(NULL) NULL → 整式 NULL（由呼叫端外層 `dob IS NULL THEN 0` 攔截）。
 */
export function mssqlAgeTodayExpr(dobExpr: string): string {
  const today = 'CAST(SYSDATETIME() AS DATE)';
  return (
    `(DATEDIFF(YEAR, ${dobExpr}, ${today}) - ` +
    `CASE WHEN (MONTH(${dobExpr}) > MONTH(${today})) ` +
    `OR (MONTH(${dobExpr}) = MONTH(${today}) AND DAY(${dobExpr}) > DAY(${today})) ` +
    `THEN 1 ELSE 0 END)`
  );
}

/** F104 / AD-E07-34：cus_sex NULL-safe int cast（MSSQL fragment；髒值/空/NULL → NULL，BR-F104-13）。 */
const SAFE_INT_CUS_SEX_MSSQL =
  `CASE WHEN ${mssqlAllDigits('cc.cus_sex')} THEN TRY_CAST(cc.cus_sex AS INT) ELSE NULL END`;

/**
 * F104 / AD-E07-34：五欄分流 gating「個人」判斷式（MSSQL predicate，供 `CASE WHEN <此> THEN 個人 ELSE 法人`）。
 *   gate 輸入 = `COALESCE(NULLIF(cc.cus_sex,''),'1')`（空/NULL → '1' 個人保底）。
 *   髒值 'C' → NULLIF 保留 'C' → 非全數字 → NULL → `NULL IN (1,2)` unknown → CASE 走 ELSE（法人）。
 *   '1'/'2' → 個人；'3'/數值非 1/2 → 法人。MSSQL `CASE WHEN` 對 unknown 走 ELSE，等價 PG `COALESCE(...,FALSE)`。
 */
const GATE_INPUT = "COALESCE(NULLIF(cc.cus_sex, ''), '1')";
const IS_PERSONAL_GATING_MSSQL =
  `((CASE WHEN ${mssqlAllDigits(GATE_INPUT)} THEN TRY_CAST(${GATE_INPUT} AS INT) ELSE NULL END) IN (1, 2))`;

/** F104 BR-F104-09/10/11：三縣市欄共用取值（ANSI；MSSQL LEFT 原生，與 PG 逐字相同）。 */
function cityColumnSourceMssql(
  columnName: string,
  ccCol: string,
  cardType: string,
): ColumnSource {
  const def = cardDefault(columnName, cardType);
  const defLiteral = def === null ? "''" : sqlLiteral(String(def));
  return {
    kind: 'category',
    expr: `LEFT(COALESCE(NULLIF(${ccCol}, ''), ${defLiteral}), 3)`,
  };
}

/**
 * 解析 column_name 之 MSSQL SQL 取值表達式（對齊 PG resolveColumnSource）。
 *
 * @param columnName      計分欄位名
 * @param cardType        名單 card_type（per-card default + 分流 gating）
 * @param existingColumns ob_pool_data 現有欄位集合（小寫，I-MSSQL-CATALOG-CASE-01）；fallback 分支據此
 *                        決定「直接欄位參照」或「幽靈欄位 → 字面 0」（I-MSSQL-DYNAMIC-FALLBACK-01）。
 */
export function resolveColumnSourceMssql(
  columnName: string,
  cardType: string,
  existingColumns: ReadonlySet<string>,
): ColumnSource {
  switch (columnName) {
    // ----- ob_pool_data 直接取 -----
    case 'LIST_MONTH': {
      const def = cardDefault('LIST_MONTH', cardType) as number;
      return { kind: 'range', expr: `COALESCE(o.month_cnt, ${def})` };
    }
    case 'PROJECT_TP':
      // F105 / AD-E07-35：composite（codeExpr + keywordExpr 皆 ANSI，與 PG 逐字相同）。
      return {
        kind: 'composite',
        codeExpr: "COALESCE(o.spec_tp, '01')",
        keywordExpr: "CASE WHEN o.spec_name LIKE '%借新還舊%' THEN 'A' ELSE '' END",
      };
    case 'CAR_YEAR': {
      // 🔴 前導擷取複用 P3a mssqlLeadingYearExpr（PATINDEX）；年份分量 = 今日年份 YEAR(SYSDATETIME())。
      //   PG：year_produ IS NULL OR NULLIF(SUBSTRING(...^[0-9]+),'') IS NULL → 0；否則 今年 − 擷取值。
      //   mssqlLeadingYearExpr(NULL)=1900，但外層 `o.year_produ IS NULL` 優先攔截 → 0（等價）；
      //   ''/'N/A' → mssqlLeadingYearExpr NULL → `(y) IS NULL` → 0。
      const y = mssqlLeadingYearExpr('o.year_produ');
      return {
        kind: 'range',
        expr:
          `CASE WHEN o.year_produ IS NULL OR (${y}) IS NULL THEN 0 ` +
          `ELSE YEAR(CAST(SYSDATETIME() AS DATE)) - (${y}) END`,
      };
    }
    // ----- customer_core LEFT JOIN -----
    case 'CUS_SEX':
      return { kind: 'range', expr: `COALESCE((${SAFE_INT_CUS_SEX_MSSQL}), 3)` };
    case 'AGE': {
      // F104 BR-F104-07：isCorp 分流；個人年齡 >100/<0 → 0；法人 → 0。參考日＝今日（SYSDATETIME）。
      const ageYears = mssqlAgeTodayExpr('cc.date_of_birth');
      const ageExpr =
        'CASE WHEN cc.date_of_birth IS NULL THEN 0 ' +
        `WHEN (${ageYears}) > 100 OR (${ageYears}) < 0 THEN 0 ` +
        `ELSE (${ageYears}) END`;
      return {
        kind: 'range',
        expr: `CASE WHEN ${IS_PERSONAL_GATING_MSSQL} THEN (${ageExpr}) ELSE 0 END`,
      };
    }
    case 'EDUCAT_BACK': {
      // F104 BR-F104-08：isCorp 分流；個人 RIGHT('0' + code, 2) 缺值 per-card default；法人 → per-card default。
      //   數值化（對齊 JS Number(value)）：全字串數字 → TRY_CAST INT；非數字（如 'AB'）→ NULL → range 不命中。
      const def = sqlLiteral(String(cardDefault('EDUCAT_BACK', cardType) ?? '02'));
      const personalStr = `COALESCE(NULLIF(RIGHT('0' + cc.education_code, 2), ''), ${def})`;
      const valStr = `CASE WHEN ${IS_PERSONAL_GATING_MSSQL} THEN (${personalStr}) ELSE ${def} END`;
      const numExpr =
        `(CASE WHEN ${mssqlAllDigits(`(${valStr})`)} THEN TRY_CAST((${valStr}) AS INT) ELSE NULL END)`;
      return { kind: 'range', expr: numExpr };
    }
    case 'CAREA_NO1':
      return {
        kind: 'range',
        expr:
          `CASE WHEN ${IS_PERSONAL_GATING_MSSQL} ` +
          `THEN (CASE WHEN cc.carea_no1 IS NOT NULL AND cc.carea_no1 <> '' THEN 1 ELSE 0 END) ELSE 0 END`,
      };
    case 'CAREA_NO2':
      return {
        kind: 'range',
        expr:
          `CASE WHEN ${IS_PERSONAL_GATING_MSSQL} ` +
          `THEN (CASE WHEN cc.carea_no2 IS NOT NULL AND cc.carea_no2 <> '' THEN 1 ELSE 0 END) ELSE 0 END`,
      };
    case 'CELLULAR':
      return {
        kind: 'range',
        expr:
          `CASE WHEN ${IS_PERSONAL_GATING_MSSQL} ` +
          `THEN (CASE WHEN cc.cellular IS NOT NULL AND cc.cellular <> '' THEN 1 ELSE 0 END) ELSE 0 END`,
      };
    case 'HPOST_NUM_NM':
      return cityColumnSourceMssql('HPOST_NUM_NM', 'cc.hpost_city', cardType);
    case 'CPOST_NUM_NM':
      return cityColumnSourceMssql('CPOST_NUM_NM', 'cc.cpost_city', cardType);
    case 'CO_NUM_NM':
      return cityColumnSourceMssql('CO_NUM_NM', 'cc.co_city', cardType);
    case 'SALES_STS':
      return {
        kind: 'category',
        expr:
          "CASE o.sales_sts_na WHEN 'AGENT' THEN 'AGENT' WHEN '中古車商' THEN 'UCD' ELSE 'HFC' END",
      };
    case 'LOAN_RATE': {
      // 🔴 DECIMAL-LOANRATE-001：明確精度 NUMERIC(18,4)（裸 NUMERIC → 18,0 去小數，12.50→13）。
      const def = cardDefault('LOAN_RATE', cardType) as number;
      return {
        kind: 'range',
        expr: `COALESCE(TRY_CAST(o.loan_rate AS ${NUMERIC_CAST}), ${def})`,
      };
    }
    // ----- ob_arreturndf_min_cap LEFT JOIN（alias ar）-----
    case 'ADD_UN_CAPITAL':
      return { kind: 'range', expr: 'COALESCE(ar.add_un_capital, 0)' };
    default: {
      // 🔴 I-MSSQL-DYNAMIC-FALLBACK-01：SQL 生成前 schema 檢查（大寫目錄查詢由呼叫端完成）。
      //   命中真實欄位 → 直接欄位參照（NUMERIC(18,4) 明確精度，FALLBACK-006）；
      //   幽靈欄位（不存在）→ 生成期字面 0（非執行期動態；BR-F103-08 不阻擋月跑）。
      const key = columnName.toLowerCase();
      if (existingColumns.has(key)) {
        return {
          kind: 'range',
          expr: `COALESCE(TRY_CAST(o.[${key}] AS ${NUMERIC_CAST}), 0)`,
        };
      }
      // 幽靈欄位：字面 0（對稱 PG COALESCE(NULL,0)；不留 INFORMATION_SCHEMA / 動態欄名 token 進最終 SQL）。
      return { kind: 'range', expr: '0' };
    }
  }
}

/**
 * 為單一 card_type 之 active version 產生 Stage 2 score 純量表達式（MSSQL；SUM CASE WHEN）。
 * 骨架與 PG buildStage2ScoreExpr 逐條對齊，差異僅 `AS text` → `AS NVARCHAR(4000)` +
 * resolveColumnSourceMssql（含 fallback schema 注入）。
 *
 * @param existingColumns ob_pool_data 現有欄位集合（小寫，呼叫端一次性查 INFORMATION_SCHEMA 注入）。
 */
export function buildStage2ScoreExprMssql(
  cardType: string,
  cardVersion: number | null,
  activeColumns: ObLevelcardColumn[],
  scoreRows: ObLevelcardScore[],
  paramPrefix: string,
  existingColumns: ReadonlySet<string>,
): Stage2ScoreSql {
  const params: Record<string, unknown> = {};

  if (cardVersion === null) {
    return { scoreExpr: null, needsCustomerCore: false, needsArCapital: false, params };
  }

  const caseFragments: string[] = [];
  let needsCustomerCore = false;
  let needsArCapital = false;
  let pIdx = 0;

  for (const col of activeColumns) {
    if (!col.column_name) continue;
    const src = resolveColumnSourceMssql(col.column_name, cardType, existingColumns);

    if (CUSTOMER_CORE_COLUMNS.has(col.column_name)) needsCustomerCore = true;
    if (col.column_name === 'ADD_UN_CAPITAL') needsArCapital = true;

    const colScores = scoreRows.filter(
      (s) =>
        s.card_type === cardType &&
        s.card_version === cardVersion &&
        s.column_name === col.column_name,
    );
    if (colScores.length === 0) continue;

    const whenClauses: string[] = [];
    for (const sr of colScores) {
      const sp = `${paramPrefix}_${pIdx++}`;
      if (src.kind === 'composite') {
        // F105 / AD-E07-35：codeExpr 字串區間 AND keywordExpr 相等（TRIM 兩端，NVARCHAR cast）。
        if (sr.level2_s === null || sr.level2_e === null) continue;
        params[`${sp}_lo`] = String(sr.level2_s).trim();
        params[`${sp}_hi`] = String(sr.level2_e).trim();
        params[`${sp}_v`] =
          sr.level1 === null || sr.level1 === undefined ? '' : String(sr.level1).trim();
        params[`${sp}_s`] = sr.score;
        const code = `TRIM(CAST(${src.codeExpr} AS ${TEXT_CAST}))`;
        const keyword = `TRIM(CAST(${src.keywordExpr} AS ${TEXT_CAST}))`;
        whenClauses.push(
          `WHEN ${code} >= :${sp}_lo AND ${code} <= :${sp}_hi ` +
            `AND ${keyword} = :${sp}_v THEN :${sp}_s`,
        );
      } else if (src.kind === 'category') {
        if (sr.level1 === null || sr.level1 === undefined) continue;
        params[`${sp}_v`] = String(sr.level1).trim();
        params[`${sp}_s`] = sr.score;
        whenClauses.push(
          `WHEN TRIM(CAST(${src.expr} AS ${TEXT_CAST})) = :${sp}_v THEN :${sp}_s`,
        );
      } else {
        // 區間型：level2_s/level2_e 有值 → value 落 [lo, hi]（JS number 綁定，無 SQL cast）。
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
    caseFragments.push(`(CASE ${whenClauses.join(' ')} ELSE 0 END)`);
  }

  if (caseFragments.length === 0) {
    return { scoreExpr: '0', needsCustomerCore, needsArCapital, params };
  }

  return {
    scoreExpr: caseFragments.join(' + '),
    needsCustomerCore,
    needsArCapital,
    params,
  };
}
