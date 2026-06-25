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
 *   - kind='composite'：複合欄位（F105 / AD-E07-35）：每 score row 同時 AND 兩子條件——
 *       `level2` 字串區間（codeExpr）AND `level1` 衍生關鍵字相等（keywordExpr）。
 *       PROJECT_TP 專用（spec_tp 代碼 + 借新還舊衍生關鍵字）。
 *
 * 表達式以 alias `o`（ob_pool_data）/ `cc`（customer_core LEFT JOIN）引用。
 * 來源未明確（architecture-spec.md §3.10 未列、或需額外表如 ob_arreturndf_min_cap）之 column_name
 * **不在此表** → 比照 JS resolveColumnValue default：回傳 NULL（range）/ ''（category）→ 不取分
 * （spec-schema-gap-first：不臆造來源欄位）。
 */
export interface ColumnSource {
  kind: 'range' | 'category' | 'composite';
  /** kind='range'/'category' 時使用；kind='composite' 時忽略（AD-E07-35）。 */
  expr?: string;
  /** kind='composite' 專用（AD-E07-35）：spec_tp 代碼 SQL 取值表達式（含 COALESCE 缺值處理）。 */
  codeExpr?: string;
  /** kind='composite' 專用（AD-E07-35）：借新還舊衍生關鍵字 SQL 取值表達式（回傳 'A' 或 ''）。 */
  keywordExpr?: string;
}

// ---------------------------------------------------------------------------
// F104 / AD-E07-33：per-card default 常數表 CARD_DEFAULTS
// ---------------------------------------------------------------------------

/**
 * F104 / AD-E07-33：逐 (column_name, card_type) 之 per-card 缺值 default 值。
 *
 * - undefined（key 不存在）= 該欄在該 card 「不啟用」（不設 default）；引擎不查 default，
 *   但實務上 activeColumns 來自 DB（`ob_levelcard_column`），不啟用之欄不會出現於 activeColumns，
 *   故此處 undefined 僅為 fallback 安全網（BR-F104-16）。
 * - 數值 default（LIST_MONTH / LOAN_RATE）→ number；字串 default（EDUCAT_BACK / 縣市欄）→ string。
 *
 * 出處：legacy SP UTF-16LE 解碼查證（AD-E07-33 矩陣，2026-06-24）。
 */
const CARD_DEFAULTS: Record<string, Record<string, number | string>> = {
  LIST_MONTH: { H: 25, S: 25, E: 12, E5: 12 }, // M/HM 不啟用
  LOAN_RATE: { S5: 77, E: 12, E5: 12 }, // H/S/M/HM 不啟用；其他 card → 0（fallback）
  EDUCAT_BACK: { S: '02', S5: '08', E: '02', E5: '02' },
  HPOST_NUM_NM: { S5: '花蓮縣', M: '臺北市', HM: '臺北市' },
  CPOST_NUM_NM: { M: '臺南市', HM: '臺南市' },
  CO_NUM_NM: { S5: '金門縣', E5: '金門縣', M: '高雄市', HM: '高雄市' },
};

/**
 * 取 (column, cardType) per-card default。未列 card → BR-F104-16 fallback（H/S 基準）。
 *   - LIST_MONTH 未列 → 25（H 基準）；LOAN_RATE 未列 → 0（其他 card default）。
 *   - EDUCAT_BACK 未列 → '02'（E 基準）。
 *   - 縣市欄未列 → null（未知 card 不計分縣市欄，回 null 由呼叫端判斷）。
 */
export function cardDefault(
  columnName: string,
  cardType: string,
): number | string | null {
  const col = CARD_DEFAULTS[columnName];
  if (col && cardType in col) return col[cardType];
  // BR-F104-16 未知 / 未列 card_type fallback。
  switch (columnName) {
    case 'LIST_MONTH':
      return 25;
    case 'LOAN_RATE':
      return 0;
    case 'EDUCAT_BACK':
      return '02';
    case 'HPOST_NUM_NM':
    case 'CPOST_NUM_NM':
    case 'CO_NUM_NM':
      return null; // 縣市欄未列 card → 不計分（無 default）。
    default:
      return null;
  }
}

/**
 * F104 / AD-E07-34：cus_sex NULL-safe int cast（PG fragment）。
 *   非數值髒值（'C'/'D' 等）/ 空字串 / NULL → NULL（不拋 invalid input syntax，BR-F104-13）。
 */
const SAFE_INT_CUS_SEX = "CASE WHEN cc.cus_sex ~ '^[0-9]+$' THEN cc.cus_sex::int ELSE NULL END";

/**
 * F104 / AD-E07-34：五欄分流 gating「個人」判斷式（PG fragment）。
 *   gating default = '1'（個人）：空/NULL → NULLIF →'1'→ 個人；
 *   非數值髒值（'C'）→ NULLIF 保留 'C' → safe_int NULL → NULL IN(1,2)=UNKNOWN → COALESCE FALSE → 法人。
 *   '1'/'2' → 個人；'3'/數值非 1/2 → 法人。
 */
const IS_PERSONAL_GATING =
  "COALESCE((CASE WHEN COALESCE(NULLIF(cc.cus_sex,''),'1') ~ '^[0-9]+$' " +
  "THEN COALESCE(NULLIF(cc.cus_sex,''),'1')::int ELSE NULL END) IN (1, 2), FALSE)";

/** SQL 字串字面值跳脫（單引號加倍）。per-card default 為 DB 管理者設定之縣市名常數。 */
function sqlLiteral(v: string): string {
  return `'${v.replace(/'/g, "''")}'`;
}

/**
 * 解析 column_name 之 SQL 取值表達式（F104 / AD-E07-10-L v4.0 全欄對齊 legacy SP）。
 *
 * @param columnName 計分欄位名
 * @param cardType   名單 card_type（F104 AD-E07-32：per-card default + 分流 gating 需要）
 *
 * **已映射（AD-E07-10-L v4.0，architecture-spec.md §4063–4162；F104 對齊 legacy SP）**：
 *   ob_pool_data 直接取：
 *     - LIST_MONTH（range）← o.month_cnt（per-card default：H/S→25；E/E5→12，F104）
 *     - PROJECT_TP（composite，F105 / AD-E07-35）← codeExpr COALESCE(o.spec_tp,'01') + keywordExpr 借新還舊→'A'
 *     - CAR_YEAR（range）← 當年 − o.year_produ（缺值 0，F103 不動）
 *     - SALES_STS（category）← o.sales_sts_na CASE（'中古車商'→'UCD'，F104 BR-F104-02；缺值 'HFC'）
 *     - LOAN_RATE（range）← o.loan_rate（per-card default：S5→77；E/E5→12；其他→0，F104）
 *   customer_core LEFT JOIN（§3.10，F104 欄名 / 語意修正）：
 *     - CUS_SEX（range）← COALESCE(<safe_int>(cc.cus_sex), 3)（F104 category→range；計分 default 3）
 *     - AGE（range）← isCorp 分流：個人 age(cc.date_of_birth) >100/<0→0；法人→0（F104）
 *     - EDUCAT_BACK（range，字串 BETWEEN）← isCorp 分流：個人 RIGHT('0'||code,2) 缺值 per-card default；法人→per-card default（F104）
 *     - CAREA_NO1/CAREA_NO2/CELLULAR（range）← isCorp 分流：個人 presence(IS NOT NULL AND <>'')→1/0；法人→0（F104）
 *     - HPOST_NUM_NM/CPOST_NUM_NM/CO_NUM_NM（category）← LEFT(COALESCE(NULLIF(cc.*_city,''),per-card default),3)（F104）
 *   ob_arreturndf_min_cap LEFT JOIN（F103 BR-F103-01 補齊，alias ar）：
 *     - ADD_UN_CAPITAL（range）← COALESCE(ar.add_un_capital, 0)（F103 不動）
 *
 * **F104 變更**（對齊 legacy SP，AD-E07-10-L v4.0）：
 *   - cus_sex NULL-safe cast（BR-F104-13）：禁裸 `::int`，髒值 'C'/'D' → NULL（不拋例外、不中斷月跑）。
 *   - 兩處 default 分離（BR-F104-13a）：CUS_SEX 計分欄 default=3；五欄分流 gating default='1'（個人）。
 *   - 五欄 isCorp 分流（CAREA_NO1/NO2/CELLULAR/AGE/EDUCAT_BACK）：個人取自身屬性、法人取 0/per-card default。
 *   - per-card default（LIST_MONTH/LOAN_RATE/EDUCAT_BACK/三縣市欄）依 cardType（CARD_DEFAULTS / AD-E07-33）。
 *   - 縣市欄改讀 cc.*_city + LEFT(...,3)（cc 為「縣市+區」6 字，比對 level1 縣市-only 3 字）。
 *
 * **F103 變更（保留）**：COMMISSION 死碼移除；default 通用 fallback（I-SCORE-FALLBACK-01）。
 */
/**
 * F104 BR-F104-09/10/11：三縣市欄共用取值表達式。
 *   `LEFT(COALESCE(NULLIF(cc.<col>,''), <per-card default>), 3)` 比對 level1（縣市-only 3 字）。
 *   cc 欄為「縣市+區」6 字 → LEFT3 取縣市。default 注入在 LEFT3 之前（default 本身已 3 字）。
 *   未列 card（cardDefault 回 null，BR-F104-16）→ 不計分縣市欄 → 取 ''（不匹配任何 level1）。
 */
function cityColumnSource(
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

export function resolveColumnSource(columnName: string, cardType: string): ColumnSource {
  switch (columnName) {
    // ----- ob_pool_data 直接取（沿用現行 JS resolveColumnValue 映射，守 (b) 下推等價）-----
    case 'LIST_MONTH': {
      // F104 BR-F104-12：per-card default（H/S→25；E/E5→12；其他 card → 25 fallback）。
      const def = cardDefault('LIST_MONTH', cardType) as number;
      return { kind: 'range', expr: `COALESCE(o.month_cnt, ${def})` };
    }
    case 'PROJECT_TP':
      // F105 / AD-E07-35：復原 legacy COMPOSITE 真語意（推翻 F104 OQ-F104-03 category 簡化）。
      //   每 score row 同時 AND 兩子條件：spec_tp 代碼字串區間（codeExpr）AND 借新還舊衍生關鍵字（keywordExpr）。
      //   codeExpr：COALESCE(o.spec_tp,'01')（對齊 legacy ISNULL(CAST(SPEC_TP AS VARCHAR),'01')）。
      //   keywordExpr：spec_name LIKE '%借新還舊%' → 'A'，否則 ''（F104 借新還舊關鍵字修正保留）。
      return {
        kind: 'composite',
        codeExpr: "COALESCE(o.spec_tp, '01')",
        keywordExpr: "CASE WHEN o.spec_name LIKE '%借新還舊%' THEN 'A' ELSE '' END",
      };
    case 'CAR_YEAR':
      // JS：year_produ 有值 → 當年 − year_produ；否則 0（F103 不動）。
      return {
        kind: 'range',
        expr:
          "CASE WHEN o.year_produ IS NULL OR NULLIF(SUBSTRING(o.year_produ FROM '^[0-9]+'), '') IS NULL " +
          "THEN 0 ELSE EXTRACT(YEAR FROM CURRENT_DATE)::int - SUBSTRING(o.year_produ FROM '^[0-9]+')::int END",
      };
    // F103 BR-F103-05：COMMISSION 死碼 case 移除（改走通用 fallback → +0）。
    // ----- customer_core LEFT JOIN（§3.10 已映射）-----
    case 'CUS_SEX':
      // F104 BR-F104-03：range；計分 default = 3（與分流 gating default '1' 分離，BR-F104-13a）；
      //   NULL-safe cast（BR-F104-13，禁裸 ::int）。
      return { kind: 'range', expr: `COALESCE((${SAFE_INT_CUS_SEX}), 3)` };
    case 'AGE': {
      // F104 BR-F104-07：isCorp 分流（個人→年齡 >100/<0 排除；法人→0）。
      const ageExpr =
        'CASE WHEN cc.date_of_birth IS NULL THEN 0 ' +
        'WHEN EXTRACT(YEAR FROM age(cc.date_of_birth))::int > 100 ' +
        'OR EXTRACT(YEAR FROM age(cc.date_of_birth))::int < 0 THEN 0 ' +
        'ELSE EXTRACT(YEAR FROM age(cc.date_of_birth))::int END';
      return {
        kind: 'range',
        expr: `CASE WHEN ${IS_PERSONAL_GATING} THEN (${ageExpr}) ELSE 0 END`,
      };
    }
    case 'EDUCAT_BACK': {
      // F104 BR-F104-08：isCorp 分流；個人 → RIGHT('0'||code,2) 缺值 per-card default；法人 → per-card default。
      // kind=range（已 DB 查證 0 category / 29 range，level2_s/level2_e 為補零字串如 '02'/'08'/'99'）。
      //   ⚠️ OQ-TDS-F104-02：JS computeScore range 分支以 Number(value) 數值比較；PG 須對齊。
      //   故取值表達式以 NULL-safe 數值化（補零字串 '05'→5；'0D' 等非數字→NULL→不命中，與 JS NaN→不命中等價）。
      const def = sqlLiteral(String(cardDefault('EDUCAT_BACK', cardType) ?? '02'));
      const personalStr = `COALESCE(NULLIF(RIGHT('0'||cc.education_code, 2), ''), ${def})`;
      const valStr = `CASE WHEN ${IS_PERSONAL_GATING} THEN (${personalStr}) ELSE ${def} END`;
      // 數值化（與 JS Number(value) 對齊；非數字 → NULL → range 比對 UNKNOWN → 不命中）。
      const numExpr = `(CASE WHEN (${valStr}) ~ '^[0-9]+$' THEN (${valStr})::int ELSE NULL END)`;
      return { kind: 'range', expr: numExpr };
    }
    case 'CAREA_NO1':
      // F104 BR-F104-05：個人 → presence（IS NOT NULL AND <>''）→ 1/0；法人 → 0。
      return {
        kind: 'range',
        expr:
          `CASE WHEN ${IS_PERSONAL_GATING} ` +
          `THEN (CASE WHEN cc.carea_no1 IS NOT NULL AND cc.carea_no1 <> '' THEN 1 ELSE 0 END) ELSE 0 END`,
      };
    case 'CAREA_NO2':
      return {
        kind: 'range',
        expr:
          `CASE WHEN ${IS_PERSONAL_GATING} ` +
          `THEN (CASE WHEN cc.carea_no2 IS NOT NULL AND cc.carea_no2 <> '' THEN 1 ELSE 0 END) ELSE 0 END`,
      };
    case 'CELLULAR':
      return {
        kind: 'range',
        expr:
          `CASE WHEN ${IS_PERSONAL_GATING} ` +
          `THEN (CASE WHEN cc.cellular IS NOT NULL AND cc.cellular <> '' THEN 1 ELSE 0 END) ELSE 0 END`,
      };
    case 'HPOST_NUM_NM':
      return cityColumnSource('HPOST_NUM_NM', 'cc.hpost_city', cardType);
    case 'CPOST_NUM_NM':
      return cityColumnSource('CPOST_NUM_NM', 'cc.cpost_city', cardType);
    case 'CO_NUM_NM':
      return cityColumnSource('CO_NUM_NM', 'cc.co_city', cardType);
    case 'SALES_STS':
      // F104 BR-F104-02：UCD key 改為「中古車商」（取代舊系統別名）。
      return {
        kind: 'category',
        expr:
          "CASE o.sales_sts_na WHEN 'AGENT' THEN 'AGENT' WHEN '中古車商' THEN 'UCD' ELSE 'HFC' END",
      };
    case 'LOAN_RATE': {
      // F104 BR-F104-12：per-card default（S5→77；E/E5→12；其他→0）。
      const def = cardDefault('LOAN_RATE', cardType) as number;
      return { kind: 'range', expr: `COALESCE(CAST(o.loan_rate AS numeric), ${def})` };
    }
    // ----- ob_arreturndf_min_cap LEFT JOIN（F103 BR-F103-01，alias ar）-----
    case 'ADD_UN_CAPITAL':
      return { kind: 'range', expr: 'COALESCE(ar.add_un_capital, 0)' };
    default:
      // F103 BR-F103-04 / I-SCORE-FALLBACK-01：通用 fallback（AD-E07-10-L line 4091）。
      //   未 hardcode 之 ob_pool_data 數值欄位 → to_jsonb(o) 取值 cast numeric。
      //   安全性：column_name 來自 ob_levelcard_column.column_name（DB 管理者設定，非外部輸入）；
      //     lower() 對齊大小寫；幽靈欄位（to_jsonb 無此 key）/ 非數值文字 → cast → NULL → COALESCE 0
      //     （靜默 +0，不阻擋月跑，BR-F103-08）。category 維度已由 hardcode case 覆蓋，不進此分支。
      return {
        kind: 'range',
        expr: `COALESCE((to_jsonb(o)->>'${columnName.toLowerCase()}')::numeric, 0)`,
      };
  }
}

/**
 * 公開供測試 / 文件：列出明確 hardcode 之計分欄位（其餘 column_name 走通用 fallback，BR-F103-04）。
 * F103：移除 'COMMISSION'（死碼）、新增 'ADD_UN_CAPITAL'（ob_arreturndf_min_cap）。
 */
export const MAPPED_SCORING_COLUMNS = [
  'LIST_MONTH',
  'PROJECT_TP',
  'CAR_YEAR',
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
  'ADD_UN_CAPITAL',
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
  /**
   * F103 BR-F103-01 / I-SCORE-AR-JOIN-01：是否有 active 之 ADD_UN_CAPITAL 欄位
   * （決定是否需 LEFT JOIN ob_arreturndf_min_cap ar）。
   */
  needsArCapital: boolean;
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
    return { scoreExpr: null, needsCustomerCore: false, needsArCapital: false, params };
  }

  const caseFragments: string[] = [];
  let needsCustomerCore = false;
  let needsArCapital = false;
  let pIdx = 0;

  for (const col of activeColumns) {
    if (!col.column_name) continue;
    // F103 I-SCORE-FALLBACK-01：resolveColumnSource 永不回 undefined（未 hardcode → 通用 fallback）。
    // F104 AD-E07-32：傳入 cardType（per-card default + 分流 gating 需要）。
    const src = resolveColumnSource(col.column_name, cardType);

    if (CUSTOMER_CORE_COLUMNS.has(col.column_name)) needsCustomerCore = true;
    // F103 BR-F103-01 / I-SCORE-AR-JOIN-01：有 active ADD_UN_CAPITAL 欄 → 需 LEFT JOIN ob_arreturndf_min_cap。
    if (col.column_name === 'ADD_UN_CAPITAL') needsArCapital = true;

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
      if (src.kind === 'composite') {
        // F105 / AD-E07-35：複合型（PROJECT_TP）。每 row 同時 AND 兩子條件：
        //   ① codeExpr 字串區間 TRIM(code) BETWEEN level2_s/level2_e（varchar 原值，**不 Number() cast**，
        //      對齊 legacy CAST AS VARCHAR BETWEEN 字串序）。
        //   ② TRIM(keyword) = COALESCE(level1,'')（level1 NULL → '' → 比對非借新還舊 keyword ''）。
        //   篩選：level2_s/level2_e 皆非 NULL（與 range 一致，缺 level2 之 row 跳過）。
        if (sr.level2_s === null || sr.level2_e === null) continue;
        params[`${sp}_lo`] = String(sr.level2_s).trim();
        params[`${sp}_hi`] = String(sr.level2_e).trim();
        params[`${sp}_v`] = sr.level1 === null || sr.level1 === undefined ? '' : String(sr.level1).trim();
        params[`${sp}_s`] = sr.score;
        const code = `TRIM(CAST(${src.codeExpr} AS text))`;
        const keyword = `TRIM(CAST(${src.keywordExpr} AS text))`;
        whenClauses.push(
          `WHEN ${code} >= :${sp}_lo AND ${code} <= :${sp}_hi ` +
            `AND ${keyword} = :${sp}_v THEN :${sp}_s`,
        );
      } else if (src.kind === 'category') {
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
    return { scoreExpr: '0', needsCustomerCore, needsArCapital, params };
  }

  return {
    scoreExpr: caseFragments.join(' + '),
    needsCustomerCore,
    needsArCapital,
    params,
  };
}
