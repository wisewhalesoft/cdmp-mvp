/**
 * Stage1 SQL 下推 run / estimate 包裝之 MSSQL 平行版（AD-E07-42 P3a）。
 *
 * 與 PG 版（stage1-sql-executor.ts）逐條等價，方言差異僅一處（🔴 MUST-FIX CONCAT / R-MSSQL-P3A-01）：
 *   CR 業代顯示名稱 `cr_nm` 之字串串接——PG `'CR' || cremp.emp_nm` 為 PostgreSQL 專屬 `||` 運算子，
 *   T-SQL **不支援**（語法錯誤，非僅語意差異）→ 改用 `'CR' + cremp.emp_nm`。
 *   選用 `+` 而非 `CONCAT()`：`+` 對 NULL 傳播（`'CR' + NULL = NULL`）與 PG `||` 逐位元組等價
 *   （emp_nm=NULL 時兩者皆 NULL）；CONCAT() 會把 NULL 視為空字串 → 與 PG 不等價。
 *   CASE `cremp.emp_id IS NOT NULL` 守門不變（未命中在職員工 → cr_id/cr_nm 皆 NULL，不觸發串接）。
 *
 * 其餘（INSERT…SELECT 骨架、DELETE 冪等清理、customer_core LEFT JOIN、ob_emphire 子查詢、
 * CURRENT_TIMESTAMP、TRIM/COALESCE、SELECT COUNT(*)）皆 ANSI / MSSQL 原生（TRIM 為 2017+），
 * 與 PG 版逐字相同。builder 委派 buildStage1SqlMssql（year-above PATINDEX / AGE DATEDIFF）。
 *
 * ⚠️ PG 檔（stage1-sql-executor.ts）完全不動（AD §1.1 / STATIC-002）；本檔為新增平行版
 *   （CONCAT-001：本檔原始碼不得含 PG `||` 字串串接運算子）。
 */

import type { EntityManager, Repository } from 'typeorm';

import type { ObListDefinition } from '@/database/entities/ob-list-definition.entity';
import type { ObPoolDataList } from '@/database/entities/ob-pool-data-list.entity';
import { buildStage1SqlMssql } from './stage1-sql-builder-mssql';
import type { Stage1SqlCore } from './stage1-sql-builder';
import type { RunStage1SqlContext } from './stage1-sql-executor';
import { toYmd } from '@/common/emphire/emphire-active.util';

/**
 * 將 named-param SQL 片段轉為當前 driver 的 positional SQL + 參數陣列。
 * MSSQL driver 之 escapeQueryWithParameters 同時處理 :param（→ @N）與 :...arr 展開，
 * 重複具名參數（如 AGE 之 :ccWorkdt）映射至同一 @N（parameterIndexMap）。
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
 * run 路徑（MSSQL）：INSERT INTO ob_monthly_run_result SELECT … FROM ob_pool_data o WHERE <core>。
 * 與 PG 版 runStage1SqlInsert 邏輯一致；差異僅 cr_nm 串接運算子（見檔頭）。
 */
export async function runStage1SqlInsertMssql(
  manager: EntityManager,
  list: ObListDefinition,
  workdt: Date,
  poolDataListRepo: Repository<ObPoolDataList>,
  ctx: RunStage1SqlContext,
): Promise<{ inserted: number; core: Stage1SqlCore }> {
  const core = await buildStage1SqlMssql(list, workdt, poolDataListRepo);

  // I-IDEM-01：本 list 寫入前清除同 (run_id, list_no) 既有列（重觸發一致）。
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

  // 🔴 CONCAT MUST-FIX：`'CR' + cremp.emp_nm`（T-SQL；保留 PG `||` NULL 傳播語意）。
  // ⚠️ 影響列數：MSSQL driver 對 INSERT…SELECT（無 OUTPUT）之 manager.query() 僅回 recordset（undefined），
  //   不回 affected → 尾綴 `SELECT @@ROWCOUNT` 讀回準確寫入列數（batch 最後陳述式之 recordset）。
  //   `@@ROWCOUNT` 無冒號、不被 escapeQueryWithParameters 誤判為具名參數。
  const crSysDate = toYmd(workdt) ?? '';
  const selectSql =
    `INSERT INTO ob_monthly_run_result ` +
    `(run_id, list_no, orgno, appl_no, custo_no, settle_src, cr_id, cr_nm, is_cr, appl_date, result_status, created_at, updated_at) ` +
    `SELECT :insRunId, :insListNo, o.orgno, o.appl_no, o.custo_no, o.settle_src, ` +
    `cremp.emp_id, CASE WHEN cremp.emp_id IS NOT NULL THEN 'CR' + cremp.emp_nm ELSE NULL END, 'N', o.appl_date, 'PENDING', ` +
    `CURRENT_TIMESTAMP, CURRENT_TIMESTAMP ` +
    `FROM ob_pool_data o ` +
    `${core.customerCoreJoin ? core.customerCoreJoin + ' ' : ''}` +
    `${core.customerFinancialJoin ? core.customerFinancialJoin + ' ' : ''}` +
    `LEFT JOIN (SELECT TRIM(id_no) AS agent_ref, emp_id, emp_nm FROM ob_emphire ` +
    `WHERE resign_date IS NULL OR resign_date >= :crSysDate) cremp ` +
    `ON COALESCE(TRIM(o.agent_id), '') <> '' AND cremp.agent_ref = TRIM(o.agent_id) ` +
    `WHERE ${core.where}; ` +
    `SELECT @@ROWCOUNT AS affected`;

  const [sql, parameters] = escape(manager, selectSql, {
    insRunId: ctx.runId,
    insListNo: ctx.listNo,
    crSysDate,
    ...core.params,
  });

  const rows = (await manager.query(sql, parameters)) as
    | Array<{ affected: string | number }>
    | undefined;
  const inserted =
    Array.isArray(rows) && rows[0]?.affected != null ? Number(rows[0].affected) : 0;
  return { inserted, core };
}

/**
 * estimate 路徑（MSSQL）：SELECT COUNT(*) FROM ob_pool_data o WHERE <core>（與 run 共用同一 core）。
 * core.skip（EMPTY_CONDITIONS）→ 回 0。
 */
export async function estimateStage1SqlCountMssql(
  manager: EntityManager,
  list: ObListDefinition,
  workdt: Date,
  poolDataListRepo: Repository<ObPoolDataList>,
): Promise<{ count: number; core: Stage1SqlCore }> {
  const core = await buildStage1SqlMssql(list, workdt, poolDataListRepo);

  if (core.skip || core.where === null) {
    return { count: 0, core };
  }

  const countSql =
    `SELECT COUNT(*) AS cnt FROM ob_pool_data o ` +
    `${core.customerCoreJoin ? core.customerCoreJoin + ' ' : ''}` +
    `${core.customerFinancialJoin ? core.customerFinancialJoin + ' ' : ''}` +
    `WHERE ${core.where}`;
  const [sql, parameters] = escape(manager, countSql, core.params);

  const rows = (await manager.query(sql, parameters)) as Array<{
    cnt: string | number;
  }>;
  const count = rows?.[0]?.cnt != null ? Number(rows[0].cnt) : 0;
  return { count, core };
}
