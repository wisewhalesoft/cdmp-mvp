/**
 * Stage1FilterChain — F091 / AD-E07-22 + AD-E07-23 Stage 1 完整篩選鏈
 *
 * 補齊原系統 SP `SP_INFOT_ASSIGNEXPORTNAMELIST_st1_list` 現行 pipeline 尚未實作的三步驟，
 * 與既有 `buildStage1WhereConditions()`（欄位篩選，路徑 A/B，不變更）一起封裝為單一篩選鏈：
 *
 *   ① 欄位篩選       buildStage1WhereConditions()   ← 既有（stage1-query-composer.ts）
 *   ② MONTH_CNT 期別  buildMonthCntFragment()        ← 新增（AC-1 / SP L38~L65）
 *   ③ 詐騙白牌 DELETE  applySpecialDeletes() 內部      ← 新增（AC-3 / SP L66~L68，無條件）
 *   ④ 近 3 個月去重    executeStage1Chain() 內部       ← 新增（AC-2 / SP L73~L87）
 *   ⑤ 特例 DELETE     applySpecialDeletes() 內部      ← 新增（AC-4~AC-6 / SP L89~L108）
 *
 * 設計原則（AD-E07-23）：純函式群組 + 一個 async 主入口 `executeStage1Chain`，
 * 供月跑（dryRun:false，寫入 + 回傳完整案件列）與 F092 dry-run（dryRun:true，COUNT 唯讀）共用同一套實作，
 * 消除 estimate / run 雙軌 drift。
 *
 * 模組歸屬（AD-E07-23 §23.5）：`executeStage1Chain` 設計為「接受 repo 參數的 async 純函式」
 * （非 NestJS Injectable），呼叫端（AssignmentRunPipelineService / Stage0EstimateService）以自身已注入的
 * poolRepo / poolDataListRepo 傳入，避免 AssignmentListModule → AssignmentRunModule 的循環依賴。
 *
 * 忠實複刻原則（DP-AD22-1 / BR-1）：特例 DELETE 依 SP 順序逐條套用，機車期中（AC-4）與期中小資（AC-5）
 * 即使對同一名單雙重套用亦不合併。
 *
 * ⚠️ v2.0 SP bug fix（AD-E07-26，high-severity）：特例 DELETE 觸發關鍵字 v1.0 之值（中結 / 強案 /
 *   年資 / 滿）為 mojibake 誤判，已修正為 SP 正確版（期中機車 / 期中 / 年以上 / 小資 / 白牌）。
 *   trigger 判斷統一抽至 `special-rules.ts` 之 `matchesSpecialRule`，與 F095 `deriveAppliedSpecialRules`
 *   共用同一份判斷（AD-E07-26 §26.5）。
 *   去重上界 v2.0 升級為 `MIN(MAX(ob_pool_data_list.assignday), workdt − 1 日)`（AD-E07-25 DP-AD25-4）。
 */

import type { Repository } from 'typeorm';

import type { ObListDefinition } from '@/database/entities/ob-list-definition.entity';
import type { ObPoolData } from '@/database/entities/ob-pool-data.entity';
import type { ObPoolDataList } from '@/database/entities/ob-pool-data-list.entity';
import {
  buildStage1WhereConditions,
  type Stage1ComposerWarning,
  type Stage1SkipReason,
} from './stage1-query-composer';
import { buildCustomerCoreClause } from './stage1-customer-core-clause';
import { matchesSpecialRule, type SpecialRuleId } from './special-rules';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * F091 新增 warning code，擴充 composer 既有 warning 集合：
 *   - MONTH_CNT_PERIOD_INCOMPLETE：list_period_* 任一缺值 → skip month_cnt fragment（AC-1 邊界）
 *   - MONTH_CNT_INTERVAL_INVALID：list_interval <= 0 或非數字 → skip（防 infinite loop）
 */
export type Stage1ChainWarning =
  | Stage1ComposerWarning
  | {
      code: 'MONTH_CNT_PERIOD_INCOMPLETE' | 'MONTH_CNT_INTERVAL_INVALID';
      columnName?: string;
      reason: string;
    };

export interface Stage1ChainResult {
  /** 篩選後案件數（dry-run 與 run 均返回） */
  count: number;
  /** run 模式回完整案件列；dry-run 模式為 undefined（不載入記憶體） */
  cases?: ObPoolData[];
  /** composer skipReason='EMPTY_CONDITIONS' → 整 list skip */
  skipped: boolean;
  skipReason?: Stage1SkipReason;
  /** 含 month_cnt skip 等非阻擋 warning */
  warnings: Stage1ChainWarning[];
  /**
   * 本名單實際套用之特例規則 ID（F091 §5.1）。與 F095 `deriveAppliedSpecialRules`
   * 對同一 list_nm 推導之 ruleId 集合一致（共用 `matchesSpecialRule`，F091 AC-7 / F095 AC-3）。
   */
  appliedRuleIds: SpecialRuleId[];
}

export interface ExecuteStage1ChainOptions {
  dryRun: boolean;
}

// ---------------------------------------------------------------------------
// ② MONTH_CNT 期別過濾（AC-1 / SP L38~L65）
// ---------------------------------------------------------------------------

/**
 * 依名單 list_period_start / list_period_end / list_interval 生成 month_cnt 值集合，
 * 對齊 SP WHILE 迴圈：
 *
 *   while (start <= end) { months.push(start); start += interval }
 *
 * entity 欄位實際為 VARCHAR(3)（spec/architecture 稱「INTEGER 一級欄位」，與 entity 型別有落差），
 * 故先以 parseInt 轉換（與 stage1-query-composer path B caseyear 處理風格一致）。
 *
 * 邊界（AC-1 / BR-4）：
 *   - start / end / interval 任一缺值（null / '' / 非數字）→ 回 null（skip）+ warning（不阻擋月跑）
 *   - interval <= 0 → 回 null（防 infinite loop）+ warning
 *   - 生成集合為空 → 回 null（skip）
 *
 * @returns fragment + params（month_cnt IN 條件），或 null 表示 skip
 */
export function buildMonthCntFragment(
  list: ObListDefinition,
  warnings?: Stage1ChainWarning[],
): { fragment: string; params: Record<string, unknown> } | null {
  const start = toInt(list.list_period_start);
  const end = toInt(list.list_period_end);
  const interval = toInt(list.list_interval);

  // AC-1 邊界：任一缺值 → skip + warning
  if (start === null || end === null || interval === null) {
    warnings?.push({
      code: 'MONTH_CNT_PERIOD_INCOMPLETE',
      reason: `list_period_start/end/interval incomplete (start=${list.list_period_start}, end=${list.list_period_end}, interval=${list.list_interval})`,
    });
    return null;
  }

  // AC-1 邊界：interval <= 0 → skip + warning（防 infinite loop）
  if (interval <= 0) {
    warnings?.push({
      code: 'MONTH_CNT_INTERVAL_INVALID',
      reason: `list_interval must be > 0 (got ${interval})`,
    });
    return null;
  }

  const months: number[] = [];
  for (let m = start; m <= end; m += interval) {
    months.push(m);
  }

  // AC-1 邊界：空集合 → skip
  if (months.length === 0) {
    return null;
  }

  return {
    fragment: '"month_cnt" IN (:...monthCntVals)',
    params: { monthCntVals: months },
  };
}

// ---------------------------------------------------------------------------
// ③⑤ 特例 DELETE（AC-3~AC-6 / SP L66~L68 + L89~L108，v2.0 SP 修正版）
// ---------------------------------------------------------------------------

/**
 * 依 SP 順序逐條套用特例 DELETE（應用層 array filter）。
 *
 * 執行順序（對齊 SP L67 → L89 → L97 → L105）：
 *   1. 詐騙白牌（SP L66~L68）：無條件套用所有名單 — list_type='01' AND spec_name 含「白牌」
 *   2. 機車期中（SP L89~L94）：list_nm 含「期中」且「機車」 —
 *        Number(payt_term) >= Number(deal_num)-3  OR  appl_no 以 'T'/'Y' 開頭
 *   3. 期中小資（SP L97~L100）：list_nm 含「期中」 —
 *        Number(payt_num) > Number(deal_num)-8  AND  spec_name 含「小資」
 *   4. 年以上（SP L105~L108）：list_nm 含「年以上」 —
 *        parseInt(year_produ ?? '1900', 10) < workdt.getFullYear()-15（數值比較）
 *
 * 忠實複刻（BR-1）：機車期中與期中小資即使對同一「期中機車」名單雙重套用亦不合併。
 *
 * NUMERIC 欄位（deal_num，entity string|null）比較前以 Number() 轉換（AC-4/AC-5 型別處理；
 * 避免字串減法產生 NaN 的 regression）。year_produ（AC-6）以 parseInt 數值比較（v2.0 防禦）。
 *
 * @param pool   欄位篩選 + month_cnt + 去重後的案件列
 * @param list   名單定義（讀 list_nm 觸發條件）
 * @param workdt 月跑工作日 PROJECT_WORKYM+'01'（年以上規則取當年）
 * @returns 套用所有特例 DELETE 後保留的案件列
 */
export function applySpecialDeletes(
  pool: ObPoolData[],
  list: ObListDefinition,
  workdt: Date,
): ObPoolData[] {
  // 規則 1（SP L66~L68）：詐騙白牌 — 無條件套用（不依賴 list_nm）
  let result = applyFraudWhiteboardDelete(pool);
  // 規則 2~4（SP L89~L108）：list_nm 觸發之機車期中 / 期中小資 / 年以上
  result = applyListNmSpecialDeletes(result, list, workdt);
  return result;
}

/**
 * 規則 1（SP L66~L68）：詐騙白牌 — list_type='01' AND spec_name 含「白牌」，無條件套用所有名單。
 */
function applyFraudWhiteboardDelete(pool: ObPoolData[]): ObPoolData[] {
  return pool.filter(
    (c) => !(c.list_type === '01' && (c.spec_name ?? '').includes('白牌')),
  );
}

/**
 * 規則 2~4（SP L89~L108）：依 list_nm 字串比對觸發之機車期中 / 期中小資 / 年以上特例 DELETE。
 * 依 SP 順序逐條套用，機車期中與期中小資即使對同一「期中機車」名單雙重套用亦不合併（BR-1）。
 *
 * ⚠️ v2.0：trigger 判斷統一使用 `matchesSpecialRule`（special-rules.ts，與 F095 共用）。
 * 禁止沿用 v1.0 誤判關鍵字（中結 / 強案 / 年資 / 滿）作為 trigger 或排除條件（BR-8）。
 */
function applyListNmSpecialDeletes(
  pool: ObPoolData[],
  list: ObListDefinition,
  workdt: Date,
): ObPoolData[] {
  let result = pool;
  const listNm = list.list_nm;

  // 規則 2（SP L89~L94）：機車期中 — list_nm 同時含「期中」與「機車」
  if (matchesSpecialRule(listNm, 'R-PERIOD-MOTORCYCLE')) {
    result = result.filter(
      (c) =>
        !(
          Number(c.payt_term) >= Number(c.deal_num) - 3 ||
          (c.appl_no?.startsWith('T') ?? false) ||
          (c.appl_no?.startsWith('Y') ?? false)
        ),
    );
  }

  // 規則 3（SP L97~L100）：期中小資 — list_nm 含「期中」（依 SP 順序，不與規則 2 合併）
  if (matchesSpecialRule(listNm, 'R-PERIOD-XIAOZI')) {
    result = result.filter(
      (c) =>
        !(
          Number(c.payt_num) > Number(c.deal_num) - 8 &&
          (c.spec_name ?? '').includes('小資')
        ),
    );
  }

  // 規則 4（SP L105~L108）：年以上車齡超 15 年 — list_nm 含「年以上」
  // v2.0：parseInt 數值比較（AD-E07-26 DP-AD26-2）；NaN < cutoff 在 JS 為 false → 非數值保留
  if (matchesSpecialRule(listNm, 'R-YEAR-ABOVE')) {
    const cutoffYear = workdt.getFullYear() - 15;
    result = result.filter(
      (c) => !(parseInt(c.year_produ ?? '1900', 10) < cutoffYear),
    );
  }

  return result;
}

/**
 * 推導本名單實際套用之特例規則 ID（含無條件之 R-FRAUD-WHITEBOARD）。
 * 與 F095 `deriveAppliedSpecialRules` 共用同一 `matchesSpecialRule`（F091 AC-7 / F095 AC-3）。
 */
function computeAppliedRuleIds(list: ObListDefinition): SpecialRuleId[] {
  const ORDER: SpecialRuleId[] = [
    'R-FRAUD-WHITEBOARD',
    'R-PERIOD-MOTORCYCLE',
    'R-PERIOD-XIAOZI',
    'R-YEAR-ABOVE',
  ];
  return ORDER.filter((ruleId) => matchesSpecialRule(list.list_nm, ruleId));
}

// ---------------------------------------------------------------------------
// ④ 近 3 個月去重視窗計算（AC-2 / SP L73~L87，v2.0 上界升級 DP-AD25-4）
// ---------------------------------------------------------------------------

/**
 * 計算近 3 個月去重視窗（yyyyMMdd 字串），對齊 SP（v2.0 上界動態化，AD-E07-25 DP-AD25-4）：
 *   assigndayStart = workdt − 3 個月（SP @Q_ASSIGNDAY_S = DATEADD(MONTH,-3,@WORKDT)）
 *   assigndayEnd   = MIN( MAX(ob_pool_data_list.assignday), workdt − 1 日 )
 *
 * v2.0 上界推導（取代 v1.0 固定 workdt − 1 日）：
 *   1. SELECT MAX(assignday) FROM ob_pool_data_list WHERE assignday IS NOT NULL → maxAssignday
 *   2. maxAssignday 為 NULL（無歷史）→ 退化為 workdt − 1 日（與 v1.0 相同，不過濾失效）
 *   3. 否則取 MIN(maxAssignday, workdt − 1 日)（防 ETL 異常載入未來日期穿越本月）
 *
 * SP 對照：SP L74~L75 以 ISNULL(MAX(OBASSIGNSET.CASEDT), workdt−1) 動態調整上界；本系統不建
 * OBASSIGNSET ETL，改以 ob_pool_data_list.MAX(assignday) 近似（精確上界列為 OQ-STAGE1-02）。
 *
 * 回傳 yyyyMMdd 字串（8 字元），與 F090 ETL 載入的 assignday 格式一致，供字串比對查詢。
 */
export async function computeDedupWindow(
  workdt: Date,
  poolDataListRepo: Repository<ObPoolDataList>,
): Promise<{
  assigndayStart: string;
  assigndayEnd: string;
}> {
  // workdt − 3 個月（保持當月 1 日）
  const start = new Date(workdt.getTime());
  start.setMonth(start.getMonth() - 3);

  // workdt − 1 日（上月末日）— 上界 fallback / 封頂
  const prevDay = new Date(workdt.getTime());
  prevDay.setDate(prevDay.getDate() - 1);
  const workdtMinus1 = toYmd(prevDay);

  // v2.0：SELECT MAX(assignday) WHERE assignday IS NOT NULL
  const maxRow: { max: string | null } | undefined = await poolDataListRepo
    .createQueryBuilder('pdl')
    .select('MAX(pdl.assignday)', 'max')
    .where('pdl.assignday IS NOT NULL')
    .getRawOne();
  const maxAssignday = maxRow?.max ?? null;

  // NULL → 退化 workdt−1；否則取 MIN(maxAssignday, workdt−1)（yyyyMMdd 字串可直接字典序比較）
  const assigndayEnd =
    maxAssignday === null
      ? workdtMinus1
      : maxAssignday < workdtMinus1
        ? maxAssignday
        : workdtMinus1;

  return {
    assigndayStart: toYmd(start),
    assigndayEnd,
  };
}

/**
 * 查詢近 3 個月去重 CUSTO_NO 集合（SP L77~L83）。
 *
 * SELECT DISTINCT custo_no FROM ob_pool_data_list
 *   WHERE assignday >= :start AND assignday <= :end AND custo_no IS NOT NULL
 *
 * BR-3：不加 data_source 過濾 → 涵蓋 etl_legacy + monthly_run 聯集（F090 BR-5）。
 * custo_no IS NOT NULL 避免 NULL 進入去重集合（AC-2 / SP L79~L80）。
 */
export async function queryRecentAssignedCustoNos(
  poolDataListRepo: Repository<ObPoolDataList>,
  assigndayStart: string,
  assigndayEnd: string,
): Promise<Set<string>> {
  const rows: Array<{ custo_no: string | null }> = await poolDataListRepo
    .createQueryBuilder('pdl')
    .select('DISTINCT pdl.custo_no', 'custo_no')
    .where('pdl.assignday >= :start', { start: assigndayStart })
    .andWhere('pdl.assignday <= :end', { end: assigndayEnd })
    .andWhere('pdl.custo_no IS NOT NULL')
    .getRawMany();

  const set = new Set<string>();
  for (const r of rows) {
    if (r.custo_no !== null && r.custo_no !== undefined) {
      set.add(r.custo_no);
    }
  }
  return set;
}

// ---------------------------------------------------------------------------
// 主入口：executeStage1Chain（AC-7 / AC-8）
// ---------------------------------------------------------------------------

/**
 * Stage 1 完整篩選鏈主入口（月跑 + F092 dry-run 共用）。
 *
 * 執行順序（AC-8 / 對齊 SP）：
 *   ① 欄位篩選（buildStage1WhereConditions）→ EMPTY_CONDITIONS 直接 skip 回傳
 *   ② MONTH_CNT 期別過濾（buildMonthCntFragment，AND 連接至欄位篩選）
 *   ③ 撈 pool（欄位篩選 + month_cnt fragment 一次 SQL）
 *   ④ 詐騙白牌 DELETE（SP L67，去重之前）
 *   ⑤ 近 3 個月去重（查 ob_pool_data_list，應用層 filter；上界 v2.0 = MIN(MAX(assignday), workdt−1)）
 *   ⑥ 特例 DELETE 機車期中 / 期中小資 / 年以上（applyListNmSpecialDeletes 剩餘規則，SP L89~L108）
 *
 * dryRun:true  → { count, skipped, warnings, appliedRuleIds }，cases=undefined（仍撈必要欄位以套用
 *                應用層 filter，但不回傳完整案件列；對齊 AD-E07-23 §23.3 DP-AD23-1 完整鏈精確模式）
 * dryRun:false → { count, cases, skipped, warnings, appliedRuleIds }，回完整案件列供下游 Stage 2~4 使用
 */
export async function executeStage1Chain(
  list: ObListDefinition,
  workdt: Date,
  poolRepo: Repository<ObPoolData>,
  poolDataListRepo: Repository<ObPoolDataList>,
  opts: ExecuteStage1ChainOptions,
): Promise<Stage1ChainResult> {
  const warnings: Stage1ChainWarning[] = [];

  // ① 欄位篩選（既有純函式，不變更）
  const fieldFragment = buildStage1WhereConditions(list);
  for (const w of fieldFragment.warnings) warnings.push(w);

  // 本名單套用之特例規則 ID（與 F095 deriveAppliedSpecialRules 一致；skip 名單亦回報）
  const appliedRuleIds = computeAppliedRuleIds(list);

  // ①b F109 / AD-E07-37 §5.4：customer_core 條件式 LEFT JOIN + cc.* fragments（與 buildStage1Sql 共用同一函式）。
  const ccConditions = list.condition_payload?.conditions ?? [];
  const customerCoreClause = buildCustomerCoreClause(
    ccConditions,
    workdt,
    'ob_pool_data',
    warnings,
  );

  // 統一 EMPTY_CONDITIONS 判定（AD §5.4）：composer 側與 customer_core 側**皆**無有效 fragment 才 skip。
  //   僅含 customer_core 條件之名單（fieldFragment.where===null 但 customerCoreClause 有 fragment）
  //   不得誤判整批 skip（JOIN-003 陷阱紅線）。無 customer_core 條件時退化為與 F109 前完全等價。
  if (fieldFragment.where === null && customerCoreClause.whereFragments.length === 0) {
    return {
      count: 0,
      cases: opts.dryRun ? undefined : [],
      skipped: true,
      skipReason: 'EMPTY_CONDITIONS',
      warnings,
      appliedRuleIds,
    };
  }

  // ② MONTH_CNT 期別過濾（以 AND 連接至欄位篩選 fragments）
  const monthCntFragment = buildMonthCntFragment(list, warnings);

  const whereClauses: string[] = [];
  const params: Record<string, unknown> = {};
  if (fieldFragment.where) {
    whereClauses.push(`(${fieldFragment.where})`);
    Object.assign(params, fieldFragment.params);
  }
  // ①b customer_core fragments（cc.* / AGE / LEFT3）；已各自以 (...) 包裹，直接併入 AND 清單。
  for (const f of customerCoreClause.whereFragments) {
    whereClauses.push(f);
  }
  Object.assign(params, customerCoreClause.params);
  if (monthCntFragment) {
    whereClauses.push(`(${monthCntFragment.fragment})`);
    Object.assign(params, monthCntFragment.params);
  }

  // ③ 撈 pool（欄位篩選 + customer_core + month_cnt fragment）
  const qb = poolRepo.createQueryBuilder('ob_pool_data');
  // F109：條件式注入 customer_core LEFT JOIN（原始表名字串，非 relation path；customer_core 無 entity）。
  //   getMany() 只 hydrate ObPoolData 自身欄位（未 leftJoinAndSelect），cc.* 不污染回傳型別。
  if (customerCoreClause.join) {
    qb.leftJoin(
      'customer_core',
      'cc',
      'cc.source_customer_no = ob_pool_data.custo_no',
    );
  }
  if (whereClauses.length > 0) {
    qb.where(whereClauses.join(' AND '), params);
  }
  let pool = await qb.getMany();

  // ⑤ 近 3 個月去重（先查去重集合；v2.0 上界 = MIN(MAX(assignday), workdt−1)）
  const { assigndayStart, assigndayEnd } = await computeDedupWindow(
    workdt,
    poolDataListRepo,
  );
  const recentAssignedCustoNos = await queryRecentAssignedCustoNos(
    poolDataListRepo,
    assigndayStart,
    assigndayEnd,
  );

  // ④ 詐騙白牌 DELETE（SP L67）— 無條件，在去重之前套用（對齊 SP L67 位於 L73 去重之前）
  pool = applyFraudWhiteboardDelete(pool);

  // ⑤ 去重 filter（custo_no=null 不誤排：Set 不含 null）
  if (recentAssignedCustoNos.size > 0) {
    pool = pool.filter(
      (c) => c.custo_no === null || !recentAssignedCustoNos.has(c.custo_no),
    );
  }

  // ⑥ 特例 DELETE 機車期中 / 期中小資 / 年以上（SP L89~L108，去重之後，依 SP 順序）
  pool = applyListNmSpecialDeletes(pool, list, workdt);

  return {
    count: pool.length,
    cases: opts.dryRun ? undefined : pool,
    skipped: false,
    warnings,
    appliedRuleIds,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * 將 entity VARCHAR / number 欄位轉為整數；無效（null / '' / 非數字）回 null。
 */
function toInt(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Date → yyyyMMdd 字串（8 字元），與 F090 ETL assignday 格式一致。
 */
function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}
