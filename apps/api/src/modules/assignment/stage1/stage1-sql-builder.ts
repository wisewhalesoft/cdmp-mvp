/**
 * buildStage1Sql — F099 / AD-E07-28 P2 Stage 1 set-based SQL 下推核心
 *
 * 將 `executeStage1Chain`（stage1-filter-chain.ts，golden oracle）的
 *   「全載 ob_pool_data（getMany）+ 應用層 filter + 全載近 3 月 DISTINCT custo_no Set」
 * 改寫為單一 set-based SQL：產生唯一的 WHERE/JOIN core（針對 alias `o` = ob_pool_data），
 * run（INSERT…SELECT）與 estimate（SELECT COUNT(*)）共用同一份 core（I-RUN-EST-01，F049 老坑不再 fork）。
 *
 * core 涵蓋（對齊 executeStage1Chain 執行順序與語意，AC-2/4/5/6/8）：
 *   ① 欄位篩選         沿用 buildStage1WhereConditions（stage1-query-composer.ts，不重寫，AC-2①）
 *   ② MONTH_CNT 期別    沿用 buildMonthCntFragment（stage1-filter-chain.ts，不重寫，AC-2②）
 *   ③ 詐騙白牌 DELETE   WHERE NOT (list_type='01' AND spec_name LIKE '%白牌%')（無條件，AC-4）
 *   ④ 近 3 月去重       NOT EXISTS anti-join（不載 Set 進 heap；NULL custo_no 安全，AC-5/A-1）
 *   ⑤ 機車期中/期中小資  WHERE NOT (...) 數值比較（matchesSpecialRule 仍 JS 觸發，AC-6/C-1）
 *   ⑥ year-above        WHERE NOT (yearval < cutoff)，yearval 前導數字解析（PG 可移植，AC-8）
 *
 * 設計原則（AD-E07-28 §6 / A-3）：純函式群組 + 接受 repo 參數的 async 函式（非 NestJS Injectable），
 * 呼叫端（AssignmentRunPipelineService / Stage0EstimateService）以自身已注入的 poolDataListRepo 傳入，
 * 避免 AssignmentListModule → AssignmentRunModule 的循環依賴。
 *
 * ⚠️ 不變式：
 *   - I-RUN-EST-01：run / estimate 共用本函式輸出之 core（分叉僅在最外層 INSERT…SELECT vs SELECT COUNT(*)）。
 *   - I-NOLOAD-01：本路徑不對 ob_pool_data 全表 getMany()/find()；去重以 SQL anti-join。
 *   - I-PORT-01：year-above 之 year_produ 數值化以 PG 可移植寫法，等價基準 = 現行 JS（parseInt(year_produ ?? '1900')）。
 *   - SQLG-003：所有使用者 / 動態輸入（cutoff、assignday 視窗界、columnName 沿用 allowlist）以 params 綁定，不字串拼接。
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
import { buildCustomerCoreClause } from './stage1-customer-core-clause';
import { matchesSpecialRule } from './special-rules';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * buildStage1Sql 輸出之 SQL core。run / estimate 共用：
 *   - run      ：INSERT INTO ob_monthly_run_result (...) SELECT ... FROM ob_pool_data o WHERE <where>
 *   - estimate ：SELECT COUNT(*) FROM ob_pool_data o WHERE <where>
 */
export interface Stage1SqlCore {
  /**
   * 完整 WHERE 子句（多 fragment 以 AND 連接），針對 alias `o` = ob_pool_data。
   * skip=true 時為 null（呼叫端不執行 INSERT/COUNT，直接視為 0 列）。
   */
  where: string | null;
  /** WHERE 內所有具名參數（:paramName / :...listParam）；與 driver query runner 綁定。 */
  params: Record<string, unknown>;
  /** 來源表 alias（固定 'o'，供呼叫端組裝 FROM 片段）。 */
  fromAlias: 'o';
  /** EMPTY_CONDITIONS（欄位篩選後零有效 fragment）→ 整 list skip，與 executeStage1Chain 一致。 */
  skip: boolean;
  /** skip 原因（目前僅 'EMPTY_CONDITIONS'）。 */
  skipReason?: 'EMPTY_CONDITIONS';
  /** 非阻擋型 warning（沿用 composer + month_cnt skip 等，與 executeStage1Chain 一致）。 */
  warnings: Stage1ChainWarning[];
  /**
   * F109 / AD-E07-37 §5.2：customer_core 條件式 LEFT JOIN 子句；
   *   null = 本名單無 customer_core 條件（呼叫端不注入 JOIN，純案件資料名單行為/效能不變，AC-11）。
   */
  customerCoreJoin: string | null;
}

// ---------------------------------------------------------------------------
// buildStage1Sql 主函式
// ---------------------------------------------------------------------------

/**
 * 產生 Stage 1 唯一 SQL core（WHERE + params），run / estimate 共用。
 *
 * @param list             名單定義（欄位篩選 + month_cnt + list_nm 觸發特例）
 * @param workdt           月跑工作日 PROJECT_WORKYM+'01'（去重視窗 + year-above cutoff 取當年）
 * @param poolDataListRepo 近 3 月去重來源（查 MAX(assignday) 推算上界；anti-join 子查詢針對本表）
 */
export async function buildStage1Sql(
  list: ObListDefinition,
  workdt: Date,
  poolDataListRepo: Repository<ObPoolDataList>,
): Promise<Stage1SqlCore> {
  const warnings: Stage1ChainWarning[] = [];
  const fromAlias = 'o' as const;

  // ① 欄位篩選（沿用既有 composer，AC-2①；composer 對 customer_core 條件靜默 skip，見 §5.1）
  const fieldFragment = buildStage1WhereConditions(list);
  for (const w of fieldFragment.warnings) warnings.push(w);

  // ①b F109 / AD-E07-37 §5.2：customer_core 條件式 LEFT JOIN + cc.* fragments（AGE/LEFT3/直接比對）。
  const ccConditions = list.condition_payload?.conditions ?? [];
  const customerCoreClause = buildCustomerCoreClause(
    ccConditions,
    workdt,
    fromAlias,
    warnings,
  );

  // 統一 EMPTY_CONDITIONS 判定（AD §5.2 步驟 3）：composer 側與 customer_core 側**皆**無有效 fragment
  //   才 skip。當名單僅含 customer_core 條件（如 gender IN [1]），composer 側 where=null 但
  //   customerCoreClause.whereFragments.length>0 → 不 skip（修正純方案 (a) 之 EMPTY_CONDITIONS 陷阱）。
  //   無 customer_core 條件時 whereFragments 恆為 []，此判斷退化為與 F109 前完全等價（zero behavior change）。
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

  // ① 欄位篩選 fragment（composer 產出之欄位以 "col" 形式引用，無 alias；下推時對 o 別名仍有效，
  //    因 FROM 僅單一表 ob_pool_data o，欄位無歧義）。
  if (fieldFragment.where) {
    clauses.push(`(${fieldFragment.where})`);
    Object.assign(params, fieldFragment.params);
  }

  // ①b customer_core fragments（cc.* / AGE / LEFT3），於 month_cnt 之前併入（AND 交換律，順序不影響正確性）。
  for (const f of customerCoreClause.whereFragments) {
    clauses.push(f);
  }
  Object.assign(params, customerCoreClause.params);

  // ② MONTH_CNT 期別過濾（沿用 buildMonthCntFragment，AC-2②；缺值 / interval<=0 → skip + warning）
  const monthCntFragment = buildMonthCntFragment(list, warnings);
  if (monthCntFragment) {
    clauses.push(`(${monthCntFragment.fragment})`);
    Object.assign(params, monthCntFragment.params);
  }

  // ③ 詐騙白牌 DELETE（SP L66~L68，無條件，AC-4）— keep = NOT (list_type='01' AND spec_name 含白牌)。
  //    ⚠️ NULL 等價：JS `(c.spec_name ?? '').includes('白牌')`（NULL→'' 不含白牌→保留）。
  //    SQL 須用 COALESCE(spec_name,'')，否則 `NULL LIKE` = NULL → `true AND NULL` = NULL → `NOT NULL` = NULL
  //    （非 true）→ PG 會把 spec_name=NULL 之列誤排（與 JS 保留不等價）。
  clauses.push(
    `NOT (${fromAlias}.list_type = :fraudListType AND COALESCE(${fromAlias}.spec_name, '') LIKE :fraudPattern)`,
  );
  params.fraudListType = '01';
  params.fraudPattern = '%白牌%';

  // ④ 近 3 月去重 anti-join（AC-5 / A-1）— NOT EXISTS，custo_no=NULL 安全（NULL 不 match → 保留）。
  //    去重視窗上界 = MIN(MAX(ob_pool_data_list.assignday), workdt−1)，computeDedupWindow 語意不變（C-2）。
  const { assigndayStart, assigndayEnd } = await computeDedupWindow(
    workdt,
    poolDataListRepo,
  );
  // JS 去重以 custo_no IS NOT NULL 之歷史集合比對，且 pool 中 custo_no=null 不被排除。
  //   等價 SQL：NOT EXISTS (SELECT 1 FROM ob_pool_data_list pdl
  //              WHERE pdl.custo_no = o.custo_no   ← o.custo_no=NULL 時恆不 match → 保留
  //                AND pdl.assignday BETWEEN start AND end
  //                AND pdl.custo_no IS NOT NULL)
  clauses.push(
    `NOT EXISTS (SELECT 1 FROM ob_pool_data_list pdl ` +
      `WHERE pdl.custo_no = ${fromAlias}.custo_no ` +
      `AND pdl.custo_no IS NOT NULL ` +
      `AND pdl.assignday >= :dedupStart AND pdl.assignday <= :dedupEnd)`,
  );
  params.dedupStart = assigndayStart;
  params.dedupEnd = assigndayEnd;

  // ⑤ 機車期中（SP L89~L94，AC-6）— list_nm 觸發（matchesSpecialRule 仍 JS，C-1）。
  //    keep = NOT ( Number(payt_term) >= Number(deal_num)-3 OR appl_no 以 T/Y 開頭 )
  //    ⚠️ NULL 等價：JS `Number(c.payt_term)`／`Number(c.deal_num)` 對 null → 0（Number(null)=0）。
  //    SQL 須 COALESCE(...,0)，否則 CAST(NULL) → NULL 比較 → OR 短路後可能整體 NULL → 列誤保留/誤排。
  //    appl_no 為 PK（NOT NULL）；LIKE 'T%'/'Y%' 無 NULL 問題。
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

  // ⑥ 期中小資（SP L97~L100，AC-6）— list_nm 含「期中」觸發（依 SP 順序，不與機車期中合併，BR-1）。
  //    keep = NOT ( Number(payt_num) > Number(deal_num)-8 AND spec_name 含小資 )
  //    ⚠️ NULL 等價：payt_num/deal_num null → 0；spec_name null → ''（COALESCE）。
  if (matchesSpecialRule(list.list_nm, 'R-PERIOD-XIAOZI')) {
    clauses.push(
      `NOT (` +
        `COALESCE(CAST(${fromAlias}.payt_num AS numeric), 0) > COALESCE(CAST(${fromAlias}.deal_num AS numeric), 0) - 8 ` +
        `AND COALESCE(${fromAlias}.spec_name, '') LIKE :xiaoziPattern` +
        `)`,
    );
    params.xiaoziPattern = '%小資%';
  }

  // ⑦ year-above（SP L105~L108，AC-8 / I-PORT-01）— list_nm 含「年以上」觸發。
  //    JS golden：parseInt(year_produ ?? '1900', 10) < cutoff 才 DELETE（cutoff = workdt 年份 − 15）。
  //    parseInt 語意三類：
  //      - NULL          → '1900' → 1900（< cutoff 通常成立 → 排除）
  //      - 空字串 / 純非數字（''、'N/A'）→ NaN → NaN < cutoff = false → 保留
  //      - 前導數字（'1980abc'）→ 1980（leading-digit 解析 → 排除）
  //    等價 PG 寫法（前導數字解析，禁 '^[0-9]+$' strict、禁 NULLIF(REGEXP_REPLACE(...,'[^0-9]'))）：
  //      yearval = CASE WHEN year_produ IS NULL THEN 1900
  //                     ELSE NULLIF(SUBSTRING(year_produ FROM '^[0-9]+'), '')::int END
  //      keep = NOT (yearval < cutoff)
  //    yearval 為 NULL（無前導數字：''、'N/A'）時 `yearval < cutoff` = NULL → NOT NULL = NULL（非 true）
  //      → 不排除（保留）→ 與 JS NaN 保留等價。
  if (matchesSpecialRule(list.list_nm, 'R-YEAR-ABOVE')) {
    const cutoffYear = workdt.getFullYear() - 15;
    // yearval：NULL(原欄位 NULL)→1900；前導數字解析；無前導數字（''、'N/A'）→ yearval=NULL（對應 JS NaN）。
    // keep = NOT ( yearval IS NOT NULL AND yearval < cutoff )：
    //   - yearval=NULL（NaN 等價）→ `NULL IS NOT NULL`=false → keep（與 JS NaN<cutoff=false 保留等價）。
    //     ⚠️ 不可寫 `NOT (yearval < cutoff)`：yearval=NULL 時 `NULL < cutoff`=NULL → `NOT NULL`=NULL（非 true）→ 列誤排。
    //   - yearval=1900（原 NULL 退化）/ 數值 < cutoff → 排除（與 JS parseInt(... ?? '1900') 等價）。
    const yearvalExpr =
      `(CASE WHEN ${fromAlias}.year_produ IS NULL THEN 1900 ` +
      `ELSE NULLIF(SUBSTRING(${fromAlias}.year_produ FROM '^[0-9]+'), '')::int END)`;
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
