/**
 * Stage1 SQL 下推 run / estimate 包裝（F099 / AD-E07-28 P2）
 *
 * 將 buildStage1Sql 之 <core>（WHERE + named params，alias o = ob_pool_data）包成：
 *   - runStage1SqlInsert ：INSERT INTO ob_monthly_run_result (...) SELECT ... FROM ob_pool_data o WHERE <core>
 *   - estimateStage1SqlCount：SELECT COUNT(*) FROM ob_pool_data o WHERE <core>
 *
 * 兩者共用同一份 <core>（I-RUN-EST-01）：分叉僅在最外層 INSERT…SELECT vs SELECT COUNT(*)。
 *
 * named params（:fraudListType / :...cat0 …）→ 各 driver 之 positional placeholder（PG $1 / SQLite ?）
 * 由 TypeORM driver.escapeQueryWithParameters 轉換（含 :...arr 展開），不字串拼接使用者輸入（SQLG-003）。
 */

import type { EntityManager, Repository } from 'typeorm';

import type { ObListDefinition } from '@/database/entities/ob-list-definition.entity';
import type { ObPoolData } from '@/database/entities/ob-pool-data.entity';
import type { ObPoolDataList } from '@/database/entities/ob-pool-data-list.entity';
import { buildStage1Sql, type Stage1SqlCore } from './stage1-sql-builder';

/** INSERT…SELECT 寫入 ob_monthly_run_result 之欄位常數（Stage 1 範圍，AD-E07-25 / A-0）。 */
export interface RunStage1SqlContext {
  runId: string;
  listNo: string;
}

/**
 * 將 buildStage1Sql 之 named-param SQL 片段轉為當前 driver 的 positional SQL + 參數陣列。
 * `manager.connection.driver.escapeQueryWithParameters` 同時處理 :param 與 :...arr 展開。
 */
function escape(
  manager: EntityManager,
  sqlWithNamedParams: string,
  params: Record<string, unknown>,
): [string, unknown[]] {
  const [sql, parameters] =
    manager.connection.driver.escapeQueryWithParameters(
      sqlWithNamedParams,
      params,
      {},
    );
  return [sql, parameters];
}

/**
 * run 路徑：INSERT INTO ob_monthly_run_result SELECT … FROM ob_pool_data o WHERE <core>。
 *
 * - assignday 不下推（OQ-F099-03）：SELECT 寫 NULL（ob_pool_data 無此欄；JS pipeline 亦不寫）。
 * - I-IDEM-01（AC-9）：實質寫入前先 DELETE FROM ob_monthly_run_result WHERE run_id=:runId。
 * - core.skip（EMPTY_CONDITIONS）→ 不執行 INSERT，回 0。
 *
 * @returns 寫入列數（INSERT…SELECT 影響列數）
 */
export async function runStage1SqlInsert(
  manager: EntityManager,
  list: ObListDefinition,
  workdt: Date,
  poolDataListRepo: Repository<ObPoolDataList>,
  ctx: RunStage1SqlContext,
): Promise<{ inserted: number; core: Stage1SqlCore }> {
  const core = await buildStage1Sql(list, workdt, poolDataListRepo);

  // I-IDEM-01：本 list 寫入前清除同 (run_id, list_no) 既有列（重觸發一致；整 run 清除由呼叫端 / FK CASCADE 補強）。
  await manager
    .createQueryBuilder()
    .delete()
    .from('ob_monthly_run_result')
    .where('run_id = :runId AND list_no = :listNo', {
      runId: ctx.runId,
      listNo: ctx.listNo,
    })
    .execute();

  if (core.skip || core.where === null) {
    return { inserted: 0, core };
  }

  // INSERT 欄位清單（Stage 1 範圍 + 稽核 + F102 CR 三欄）。assignday 不在清單（保持 NULL，OQ-F099-03）。
  // run_id / list_no 為常數參數；orgno / appl_no / custo_no / settle_src / appl_date 取自 o；
  // created_at / updated_at = NOW()。
  //
  // F102（I-CR-COLSRC-01）：CR 步驟（cr-priority-sql.ts）讀寫 cr_id/cr_nm/is_cr/appl_date，
  //   須由 Stage 1 帶入 result 工作集。⚠️ ob_pool_data（alias o，Stage 1 篩選源表）**無** cr_id/cr_nm/is_cr
  //   三欄（亦無 appl_date 之外的 CR 欄位）—— 此三欄存於 ob_pool_data_list（legacy 派案歷史，同 PK
  //   orgno+appl_no+list_no），對齊 legacy SP `#OBPOOLDATA_LIST` 取自 OBPOOLDATA_LIST。
  //   故 LEFT JOIN ob_pool_data_list（同 orgno+appl_no，本 list_no 限定）帶入 cr_id/cr_nm/is_cr；
  //   pdl 無對應列時三欄為 NULL（is_cr COALESCE 'N'，與 cr_enabled=false 強制清 N 語意相容）。
  //   appl_date 優先取 pdl（CR 失效規則之來源），無則退 o.appl_date（兩表皆有 appl_date 欄位）。
  //   ⚠️ JOIN **必以子查詢只選 CR 四欄 + PK**（非整表 LEFT JOIN）—— ob_pool_data 與 ob_pool_data_list
  //   有數十個同名欄位（prod_kind / list_type / custo_no …），composer WHERE 以無 alias 之 "col" 引用
  //   （單表時無歧義），若整表 join 進來會觸發 `column reference "prod_kind" is ambiguous`（已驗）。
  //   子查詢只暴露 cr_id/cr_nm/is_cr/appl_date → WHERE 之 "col" 仍唯一解析至 o。
  //   詳見 impl log「偏離 spec/AD」段（AD-E07-30 §3.1 述「ob_pool_data_list.cr_id 帶入」，惟未言明
  //   Stage 1 SELECT 源表為 ob_pool_data → 以 scoped LEFT JOIN 補足，語意忠實於 legacy SP）。
  // F109 / AD-E07-37 §5.3：customer_core LEFT JOIN 插在既有 pdl CR JOIN 之前（順序不影響正確性）。
  //   核心不引用 customer_core 條件時 core.customerCoreJoin 為 null → 不注入（純案件資料名單 SQL 不變）。
  const selectSql =
    `INSERT INTO ob_monthly_run_result ` +
    `(run_id, list_no, orgno, appl_no, custo_no, settle_src, cr_id, cr_nm, is_cr, appl_date, result_status, created_at, updated_at) ` +
    `SELECT :insRunId, :insListNo, o.orgno, o.appl_no, o.custo_no, o.settle_src, ` +
    `pdl.cr_id, pdl.cr_nm, COALESCE(pdl.is_cr, 'N'), COALESCE(pdl.appl_date, o.appl_date), 'PENDING', ` +
    `CURRENT_TIMESTAMP, CURRENT_TIMESTAMP ` +
    `FROM ob_pool_data o ` +
    `${core.customerCoreJoin ? core.customerCoreJoin + ' ' : ''}` +
    `LEFT JOIN (SELECT orgno, appl_no, cr_id, cr_nm, is_cr, appl_date FROM ob_pool_data_list WHERE list_no = :insListNo) pdl ` +
    `ON pdl.orgno = o.orgno AND pdl.appl_no = o.appl_no ` +
    `WHERE ${core.where}`;

  const [sql, parameters] = escape(manager, selectSql, {
    insRunId: ctx.runId,
    insListNo: ctx.listNo,
    ...core.params,
  });

  const result = await manager.query(sql, parameters);
  // PG 回傳 [rows, affectedRows]；better-sqlite3 回傳 { changes }。取較通用的影響列數。
  const inserted = extractAffected(result);
  return { inserted, core };
}

/**
 * estimate 路徑：SELECT COUNT(*) FROM ob_pool_data o WHERE <core>（與 run 共用同一 core）。
 * core.skip（EMPTY_CONDITIONS）→ 回 0（不執行 COUNT，與月跑 skip 一致）。
 */
export async function estimateStage1SqlCount(
  manager: EntityManager,
  list: ObListDefinition,
  workdt: Date,
  poolDataListRepo: Repository<ObPoolDataList>,
): Promise<{ count: number; core: Stage1SqlCore }> {
  const core = await buildStage1Sql(list, workdt, poolDataListRepo);

  if (core.skip || core.where === null) {
    return { count: 0, core };
  }

  // F109 / AD-E07-37 §5.3：條件式 customer_core LEFT JOIN（null 時不注入）。
  //   source_customer_no UNIQUE（I-CC-JOIN-CARD-01）保證 1:0/1:1 基數，COUNT 不因 JOIN 膨脹。
  const countSql =
    `SELECT COUNT(*) AS cnt FROM ob_pool_data o ` +
    `${core.customerCoreJoin ? core.customerCoreJoin + ' ' : ''}` +
    `WHERE ${core.where}`;
  const [sql, parameters] = escape(manager, countSql, core.params);

  const rows = (await manager.query(sql, parameters)) as Array<{
    cnt: string | number;
  }>;
  const count = rows?.[0]?.cnt != null ? Number(rows[0].cnt) : 0;
  return { count, core };
}

/**
 * 不同 driver 之 manager.query() 回傳形態各異，統一取「影響列數」：
 *   - PostgreSQL（INSERT…SELECT）：raw driver 回 [rows[], affected:number] → TypeORM 包裝後常為 affected。
 *   - better-sqlite3：{ changes:number, lastInsertRowid }。
 */
function extractAffected(result: unknown): number {
  if (Array.isArray(result)) {
    // [rows, affected] 形態
    const last = result[result.length - 1];
    if (typeof last === 'number') return last;
    // rows 陣列（無 RETURNING）→ 長度即列數（部分 driver）
    if (Array.isArray(result[0])) return Array.isArray(result[1]) ? result[1].length : 0;
    return 0;
  }
  if (result && typeof result === 'object') {
    const r = result as { changes?: number; affected?: number; rowCount?: number };
    return r.changes ?? r.affected ?? r.rowCount ?? 0;
  }
  return 0;
}

/** 供測試 / NOLOAD guard：標記下推路徑（不使用 ObPoolData repo 全載）。 */
export type { ObPoolData };
