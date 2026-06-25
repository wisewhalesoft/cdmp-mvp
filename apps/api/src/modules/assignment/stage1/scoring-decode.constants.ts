/**
 * F107 / AD-E07-10-S：計分衍生碼 Decode Dictionary（後端共用對照常數）
 *
 * 用途：讓「計分卡設定」UI（Tab 3 分數設定碼層 / Tab 2 計分維度欄層）能將每個計分欄之
 *   「原始碼 → 來源欄 + 衍生規則 + 業務語意」呈現給業務 / 稽核，落實「衍生碼可回溯」設計原則。
 *
 * ⚠️ 同源（single source of truth，BR-2 / BR-4）：
 *   本常數為 decode 的唯一真值來源，內容須與**引擎衍生規則**
 *   （`stage2to4-sql-builder.ts` `resolveColumnSource` / `MAPPED_SCORING_COLUMNS`）
 *   與 **AD-E07-10-S 文件**（`docs/specs/scorecard-derived-code-dictionary.md` §1 / §2 / §3）一致。
 *   `getScoring()`（`assignment-scoring.service.ts`）import 本常數附於每個 dimension 之 `decode` 回傳。
 *
 *   同步斷言（BR-4 / AC-4，`scoring-decode.constants.spec.ts`）強制三項一致：
 *     (i)   decode `codes` 碼集合與意義 ≡ AD-E07-10-S §2；
 *     (ii)  decode `sourceField` ≡ 引擎 `resolveColumnSource` 取值來源
 *           （引擎 keyword 變更如 SALES_STS '中古車商'→'UCD' / PROJECT_TP '%借新還舊%'→'A' 時斷言失敗以提示同步）；
 *     (iii) decode 涵蓋欄集合 ⊆ 引擎 `MAPPED_SCORING_COLUMNS`。
 *
 * decode **唯讀**：legacy 碼（如 'A'）之值不可於 UI 更改（值來自 legacy config，AD-E07-10-S 開宗即述）。
 * 本常數為記憶體中之共用對照，不落 DB、無 migration（BR-7）。
 */

/** 單一碼之業務語意對照。 */
export interface DecodeCodeEntry {
  /** 該碼所屬層（'level1' / 'level2'），對應 ob_levelcard_score 的 level1 / level2_s(=level2_e)。 */
  level: 'level1' | 'level2';
  /**
   * 原始碼（'A' / 'AGENT' / '1' …）；`null` 表「空 / NULL 碼」的語意
   * （如 PROJECT_TP level1=NULL → 非借新還舊）。
   */
  code: string | null;
  /** 該碼之業務語意（中文），對齊 AD-E07-10-S §2。 */
  meaning: string;
}

/** 單一維度（計分欄）之 decode 說明。 */
export interface DecodeEntry {
  /** 來源欄（人類可讀，對齊 AD-E07-10-S §1「來源欄」欄），如 'spec_tp + spec_name'。 */
  sourceField: string;
  /** 衍生規則摘要（人類可讀），對齊 AD-E07-10-S §1「衍生規則（業務語意）」欄之摘要。 */
  derivationRule: string;
  /**
   * 碼 → 業務語意 對照；純數值區間欄（如 LIST_MONTH）/ 個人法人分流欄（codes 為空陣列）。
   */
  codes: DecodeCodeEntry[];
}

/**
 * F107：計分欄 column_name → decode 說明對照。
 *
 * 涵蓋面（OQ-decode-2 拍板：全部衍生欄）：
 *   - 碼層 decode（codes 非空）：PROJECT_TP / SALES_STS / CUS_SEX / 三縣市（HPOST/CPOST/CO_NUM_NM）
 *   - 欄層分流摘要（codes 空陣列）：CAREA_NO1 / CAREA_NO2 / CELLULAR / AGE / EDUCAT_BACK（個人/法人分流 gating，§3）
 *
 * 其餘純數值欄（LIST_MONTH / CAR_YEAR / LOAN_RATE / ADD_UN_CAPITAL）**不在此表** →
 *   getScoring 回 `decode=null`，前端優雅降級不渲染（BR-6）。
 *
 * ⚠️ decode 不展開 per-card default 卡別細目（如「S5→花蓮縣」）；僅述「缺值套 per-card default」。
 *   完整 default 矩陣為引擎 `CARD_DEFAULTS` / AD-E07-10-S §1 工程真值（F107 §5.1.2 註）。
 */
export const SCORING_DECODE: Readonly<Record<string, DecodeEntry>> = Object.freeze({
  // ----- 碼層 decode（AD-E07-10-S §2）-----
  PROJECT_TP: {
    // 引擎 codeExpr=COALESCE(o.spec_tp,'01')；keywordExpr=spec_name LIKE '%借新還舊%' → 'A'
    sourceField: 'spec_tp + spec_name',
    derivationRule: 'spec_tp 代碼且是否借新還舊（spec_name 含「借新還舊」→ A，否則非借新還舊）',
    codes: [
      { level: 'level1', code: 'A', meaning: '借新還舊' },
      { level: 'level1', code: null, meaning: '非借新還舊' },
      { level: 'level2', code: null, meaning: '專案代碼 spec_tp（兩碼，level2_s=level2_e）' },
    ],
  },
  SALES_STS: {
    // 引擎：o.sales_sts_na CASE 'AGENT'→'AGENT' / '中古車商'→'UCD' / ELSE 'HFC'
    sourceField: 'ob_pool_data.sales_sts_na',
    derivationRule: '轉成 AGENT / UCD / HFC',
    codes: [
      { level: 'level1', code: 'AGENT', meaning: '代理商' },
      { level: 'level1', code: 'UCD', meaning: '中古車商' },
      { level: 'level1', code: 'HFC', meaning: '和潤自家' },
    ],
  },
  CUS_SEX: {
    // 引擎：COALESCE(safe_int(cc.cus_sex), 3)；計分 default 3
    sourceField: 'customer_core.cus_sex',
    derivationRule: '性別碼；缺值/髒值計分 default 3',
    codes: [
      { level: 'level1', code: '1', meaning: '男（個人）' },
      { level: 'level1', code: '2', meaning: '女（個人）' },
      { level: 'level1', code: '3', meaning: '法人' },
    ],
  },
  HPOST_NUM_NM: {
    sourceField: 'customer_core.hpost_city',
    derivationRule: '取縣市名（取 customer_core 縣市欄前 3 字比對）；缺值 per-card default',
    codes: [
      { level: 'level1', code: null, meaning: '縣市名（3 字，如「臺北市」「花蓮縣」；取縣市欄前 3 字比對）' },
    ],
  },
  CPOST_NUM_NM: {
    sourceField: 'customer_core.cpost_city',
    derivationRule: '取縣市名（取 customer_core 縣市欄前 3 字比對）；缺值 per-card default',
    codes: [
      { level: 'level1', code: null, meaning: '縣市名（3 字，如「臺北市」「花蓮縣」；取縣市欄前 3 字比對）' },
    ],
  },
  CO_NUM_NM: {
    sourceField: 'customer_core.co_city',
    derivationRule: '取縣市名（取 customer_core 縣市欄前 3 字比對）；缺值 per-card default',
    codes: [
      { level: 'level1', code: null, meaning: '縣市名（3 字，如「臺北市」「花蓮縣」；取縣市欄前 3 字比對）' },
    ],
  },

  // ----- 欄層個人/法人分流摘要（AD-E07-10-S §3；codes 為空陣列）-----
  CAREA_NO1: {
    sourceField: 'customer_core.carea_no1',
    derivationRule: '取值前先判個人/法人；個人→有戶籍區碼=1/無=0；法人→恆 0',
    codes: [],
  },
  CAREA_NO2: {
    sourceField: 'customer_core.carea_no2',
    derivationRule: '取值前先判個人/法人；個人→有通訊區碼=1/無=0；法人→恆 0',
    codes: [],
  },
  CELLULAR: {
    sourceField: 'customer_core.cellular',
    derivationRule: '取值前先判個人/法人；個人→有行動電話=1/無=0；法人→恆 0',
    codes: [],
  },
  AGE: {
    sourceField: 'customer_core.date_of_birth',
    derivationRule: '取值前先判個人/法人；個人→由生日推年齡（>100/<0 視為無效取 0）；法人→0',
    codes: [],
  },
  EDUCAT_BACK: {
    sourceField: 'customer_core.education_code',
    derivationRule: '取值前先判個人/法人；個人→補零兩碼學歷碼；法人/缺值→per-card default',
    codes: [],
  },
});

/**
 * 取某 column_name 之 decode（無對應 decode 之純數值欄 → `null`，前端優雅降級，BR-6）。
 * 回傳 deep copy 以避免外部變更凍結之常數來源（decode 唯讀）。
 */
export function getDecodeForColumn(columnName: string): DecodeEntry | null {
  const entry = SCORING_DECODE[columnName];
  if (!entry) return null;
  return {
    sourceField: entry.sourceField,
    derivationRule: entry.derivationRule,
    codes: entry.codes.map((c) => ({ ...c })),
  };
}
