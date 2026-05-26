/**
 * Stage1FilterChain — F091 / AD-E07-22 + AD-E07-23 Stage 1 完整篩選鏈
 *
 * 補齊原系統 SP `SP_INFOT_ASSIGNEXPORTNAMELIST_st1_list` 現行 pipeline 尚未實作的三步驟，
 * 與既有 `buildStage1WhereConditions()`（欄位篩選，路徑 A/B，不變更）一起封裝為單一篩選鏈：
 *
 *   ① 欄位篩選       buildStage1WhereConditions()   ← 既有（stage1-query-composer.ts）
 *   ② MONTH_CNT 期別  buildMonthCntFragment()        ← 新增（AC-1 / SP L38~L65）
 *   ③ 詐騙白牌 DELETE  applySpecialDeletes() 內部      ← 新增（AC-6 / SP L69，無條件）
 *   ④ 近 3 個月去重    executeStage1Chain() 內部       ← 新增（AC-2 / SP L73~L87）
 *   ⑤ 特殊 DELETE     applySpecialDeletes() 內部      ← 新增（AC-3~AC-5 / SP L90~L112）
 *
 * 設計原則（AD-E07-23）：純函式群組 + 一個 async 主入口 `executeStage1Chain`，
 * 供月跑（dryRun:false，寫入 + 回傳完整案件列）與 F092 dry-run（dryRun:true，COUNT 唯讀）共用同一套實作，
 * 消除 estimate / run 雙軌 drift。
 *
 * 模組歸屬（AD-E07-23 §23.5）：`executeStage1Chain` 設計為「接受 repo 參數的 async 純函式」
 * （非 NestJS Injectable），呼叫端（AssignmentRunPipelineService / Stage0EstimateService）以自身已注入的
 * poolRepo / poolDataListRepo 傳入，避免 AssignmentListModule → AssignmentRunModule 的循環依賴。
 *
 * 忠實複刻原則（DP-AD22-1 / BR-1）：特殊 DELETE 依 SP 順序逐條套用，中結強案（AC-3）與中結（AC-4）
 * 即使對同一名單雙重套用亦不合併。
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
// ③⑤ 特殊 DELETE（AC-3~AC-6 / SP L69 + L90~L112）
// ---------------------------------------------------------------------------

/**
 * 依 SP 順序逐條套用特殊 DELETE（應用層 array filter）。
 *
 * 執行順序（對齊 SP L69 → L90 → L98 → L108）：
 *   1. 詐騙白牌（SP L69）：無條件套用所有名單 — list_type='01' AND spec_name 含「白牌」
 *   2. 中結強案（SP L90~L94）：list_nm 含「中結」且「強案」 —
 *        payt_term >= deal_num-3  OR  appl_no 以 'T'/'Y' 開頭
 *   3. 中結（SP L98~L100）：list_nm 含「中結」 —
 *        payt_num > deal_num-8  AND  spec_name 含「滿」
 *   4. 年資（SP L108~L111）：list_nm 含「年資」 —
 *        (year_produ ?? '1900') < String(當年 - 15)（字串比較）
 *
 * 忠實複刻（BR-1）：中結強案與中結即使對同一名單雙重套用亦不合併。
 *
 * NUMERIC 欄位（deal_num，entity string|null）比較前以 Number() 轉換（AC-3/AC-4 型別處理；
 * 避免字串減法產生 NaN 的 regression）。
 *
 * @param pool   欄位篩選 + month_cnt + 去重後的案件列
 * @param list   名單定義（讀 list_nm 觸發條件）
 * @param workdt 月跑工作日 PROJECT_WORKYM+'01'（年資規則取當年）
 * @returns 套用所有特殊 DELETE 後保留的案件列
 */
export function applySpecialDeletes(
  pool: ObPoolData[],
  list: ObListDefinition,
  workdt: Date,
): ObPoolData[] {
  // 規則 1（SP L69）：詐騙白牌 — 無條件套用（不依賴 list_nm）
  let result = applyFraudWhiteboardDelete(pool);
  // 規則 2~4（SP L90~L112）：list_nm 觸發之中結強案 / 中結 / 年資
  result = applyListNmSpecialDeletes(result, list, workdt);
  return result;
}

/**
 * 規則 1（SP L69）：詐騙白牌 — list_type='01' AND spec_name 含「白牌」，無條件套用所有名單。
 */
function applyFraudWhiteboardDelete(pool: ObPoolData[]): ObPoolData[] {
  return pool.filter(
    (c) => !(c.list_type === '01' && (c.spec_name ?? '').includes('白牌')),
  );
}

/**
 * 規則 2~4（SP L90~L112）：依 list_nm 字串比對觸發之中結強案 / 中結 / 年資特殊 DELETE。
 * 依 SP 順序逐條套用，中結強案與中結即使對同一名單雙重套用亦不合併（BR-1）。
 */
function applyListNmSpecialDeletes(
  pool: ObPoolData[],
  list: ObListDefinition,
  workdt: Date,
): ObPoolData[] {
  let result = pool;
  const listNm = list.list_nm ?? '';

  // 規則 2（SP L90~L94）：中結強案 — list_nm 同時含「中結」與「強案」
  if (listNm.includes('中結') && listNm.includes('強案')) {
    result = result.filter(
      (c) =>
        !(
          Number(c.payt_term) >= Number(c.deal_num) - 3 ||
          (c.appl_no?.startsWith('T') ?? false) ||
          (c.appl_no?.startsWith('Y') ?? false)
        ),
    );
  }

  // 規則 3（SP L98~L100）：中結 — list_nm 含「中結」（依 SP 順序，不與規則 2 合併）
  if (listNm.includes('中結')) {
    result = result.filter(
      (c) =>
        !(
          Number(c.payt_num) > Number(c.deal_num) - 8 &&
          (c.spec_name ?? '').includes('滿')
        ),
    );
  }

  // 規則 4（SP L108~L111）：年資 15 年 — list_nm 含「年資」
  if (listNm.includes('年資')) {
    const currentYear = workdt.getFullYear();
    const threshold = String(currentYear - 15);
    result = result.filter((c) => !((c.year_produ ?? '1900') < threshold));
  }

  return result;
}

// ---------------------------------------------------------------------------
// ④ 近 3 個月去重視窗計算（AC-2 / SP L74~L75）
// ---------------------------------------------------------------------------

/**
 * 計算近 3 個月去重視窗（yyyyMMdd 字串），對齊 SP：
 *   assigndayStart = workdt − 3 個月（SP @Q_ASSIGNDAY_S = DATEADD(MONTH,-3,@WORKDT)）
 *   assigndayEnd   = workdt − 1 日   （SP @Q_ASSIGNDAY_E 近似上界，DP-AD21-3）
 *
 * 回傳 yyyyMMdd 字串（8 字元），與 F090 ETL 載入的 assignday 格式一致，供字串比對查詢。
 */
export function computeDedupWindow(workdt: Date): {
  assigndayStart: string;
  assigndayEnd: string;
} {
  // workdt − 3 個月（保持當月 1 日）
  const start = new Date(workdt.getTime());
  start.setMonth(start.getMonth() - 3);

  // workdt − 1 日（上月末日）
  const end = new Date(workdt.getTime());
  end.setDate(end.getDate() - 1);

  return {
    assigndayStart: toYmd(start),
    assigndayEnd: toYmd(end),
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
 *   ④ 詐騙白牌 DELETE（SP L69，去重之前）
 *   ⑤ 近 3 個月去重（查 ob_pool_data_list，應用層 filter）
 *   ⑥ 特殊 DELETE 中結強案 / 中結 / 年資（applySpecialDeletes 剩餘規則）
 *
 * dryRun:true  → { count, skipped, warnings }，cases=undefined（仍撈必要欄位以套用應用層 filter，
 *                但不回傳完整案件列；對齊 AD-E07-23 §23.3 DP-AD23-1 完整鏈精確模式）
 * dryRun:false → { count, cases, skipped, warnings }，回完整案件列供下游 Stage 2~4 使用
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

  // §18.5.2：空 conditions / wildcard 後零有效 fragment → 整 list skip，不繼續下游步驟
  if (fieldFragment.skipReason === 'EMPTY_CONDITIONS') {
    return {
      count: 0,
      cases: opts.dryRun ? undefined : [],
      skipped: true,
      skipReason: 'EMPTY_CONDITIONS',
      warnings,
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
  if (monthCntFragment) {
    whereClauses.push(`(${monthCntFragment.fragment})`);
    Object.assign(params, monthCntFragment.params);
  }

  // ③ 撈 pool（欄位篩選 + month_cnt fragment）
  const qb = poolRepo.createQueryBuilder('ob_pool_data');
  if (whereClauses.length > 0) {
    qb.where(whereClauses.join(' AND '), params);
  }
  let pool = await qb.getMany();

  // ⑤ 近 3 個月去重（先查去重集合）
  const { assigndayStart, assigndayEnd } = computeDedupWindow(workdt);
  const recentAssignedCustoNos = await queryRecentAssignedCustoNos(
    poolDataListRepo,
    assigndayStart,
    assigndayEnd,
  );

  // ④ 詐騙白牌 DELETE（SP L69）— 無條件，在去重之前套用（對齊 SP L69 位於 L77 去重之前）
  pool = applyFraudWhiteboardDelete(pool);

  // ⑤ 去重 filter（custo_no=null 不誤排：Set 不含 null）
  if (recentAssignedCustoNos.size > 0) {
    pool = pool.filter(
      (c) => c.custo_no === null || !recentAssignedCustoNos.has(c.custo_no),
    );
  }

  // ⑥ 特殊 DELETE 中結強案 / 中結 / 年資（SP L90~L112，去重之後，依 SP 順序）
  pool = applyListNmSpecialDeletes(pool, list, workdt);

  return {
    count: pool.length,
    cases: opts.dryRun ? undefined : pool,
    skipped: false,
    warnings,
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
