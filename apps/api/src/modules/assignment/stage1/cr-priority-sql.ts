/**
 * CR 優先分派前置步驟 — PG 下推（F102 / AD-E07-30，PG 真庫）
 *
 * 以 set-based SQL UPDATE 對 ob_monthly_run_result 直接更新，與 JS oracle（cr-priority.ts
 * applyCrPriority）逐列確定性等價（DoD EQ 群組）。
 *
 * crEnabled=true → 三道 UPDATE（步驟 1 → 步驟 2 → 步驟 3）：
 *   ① 步驟 1（逾2年清空）：cr_id IS NOT NULL AND appl_date < :twoYearsAgo::date → cr_id/cr_nm=NULL、is_cr='N'
 *   ② 步驟 2（離職清空）：JOIN ob_emphire（隱式 INNER），resign_date IS NOT NULL AND < :sysDate::date → 清空
 *      （INNER JOIN 確保 ob_emphire 查無 emp_id 不清空，BR-F102-08）
 *   ③ 步驟 3（CR 優先指派）：JOIN ob_empl_set（ration>0），ROW_NUMBER() OVER (PARTITION BY emplid
 *      ORDER BY deptid_m ASC) rn=1（I-DET-CR-01）→ emplid=cr_id、dept_id/emplid_deptid=deptid_m、is_cr='Y'
 *
 * crEnabled=false → 僅一道 UPDATE：is_cr 強制清 'N'（BR-F102-02），跳過步驟 1–3。
 *
 * :twoYearsAgo / :sysDate 由 JS 計算（'YYYY-MM-DD'）傳入，避免 DB 端日期計算差異
 * （feedback_typeorm_between_timezone）。CR 步驟只對 result 工作集 UPDATE，不讀回來源歷史表
 * （I-CR-COLSRC-01）。
 *
 * 確定性（I-DET-CR-01 / I-DET-01）：全程無任何亂數函式；deptid_m ASC ROW_NUMBER 取第一筆。
 */

import type { EntityManager } from 'typeorm';

import { computeCrSysDates } from './cr-priority';

export interface CrPriorityContext {
  runId: string;
  listNo: string;
  /** per-list cr_enabled 快照值（false → 僅強制清 N）。 */
  crEnabled: boolean;
  /** @SYS_DT = project_workym + '01'（'YYYY-MM-DD'）。 */
  sysDate: string;
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
 * F102 CR 優先分派前置步驟 SQL 下推（PG 真庫）。
 *
 * - crEnabled=false → 僅執行強制 is_cr='N' UPDATE（BR-F102-02）。
 * - crEnabled=true  → 步驟 1 → 步驟 2 → 步驟 3（嚴格序，I-CR-ORDER-01 內步驟序）。
 *
 * @param manager EntityManager（呼叫端以 DB_TYPE='postgres' gate）
 * @param ctx     runId / listNo / crEnabled / sysDate
 */
export async function runCrPrioritySql(
  manager: EntityManager,
  ctx: CrPriorityContext,
): Promise<void> {
  if (!ctx.crEnabled) {
    // cr_enabled=false：強制 is_cr='N'（避免來源殘留 'Y' 污染），跳過步驟 1–3（BR-F102-02）。
    const [sql, parameters] = escape(
      manager,
      `UPDATE ob_monthly_run_result
          SET is_cr = 'N', updated_at = CURRENT_TIMESTAMP
        WHERE run_id = :runId AND list_no = :listNo
          AND (is_cr IS NULL OR is_cr <> 'N')`,
      { runId: ctx.runId, listNo: ctx.listNo },
    );
    await manager.query(sql, parameters);
    return;
  }

  // twoYearsAgo = sysDate 往回 2 年同月 1 日（與 JS oracle 同算法）。
  const { twoYearsAgo } = computeCrSysDates(
    `${ctx.sysDate.slice(0, 4)}${ctx.sysDate.slice(5, 7)}`,
  );

  // ----- 步驟 1：逾2年清空（appl_date < twoYearsAgo，嚴格小於）-----
  {
    const [sql, parameters] = escape(
      manager,
      `UPDATE ob_monthly_run_result
          SET cr_id = NULL, cr_nm = NULL, is_cr = 'N', updated_at = CURRENT_TIMESTAMP
        WHERE run_id = :runId AND list_no = :listNo
          AND cr_id IS NOT NULL
          AND appl_date IS NOT NULL
          AND appl_date < :twoYearsAgo::date`,
      { runId: ctx.runId, listNo: ctx.listNo, twoYearsAgo },
    );
    await manager.query(sql, parameters);
  }

  // ----- 步驟 2：離職清空（INNER JOIN ob_emphire，resign_date < sysDate，嚴格小於）-----
  {
    const [sql, parameters] = escape(
      manager,
      `UPDATE ob_monthly_run_result r
          SET cr_id = NULL, cr_nm = NULL, is_cr = 'N', updated_at = CURRENT_TIMESTAMP
         FROM ob_emphire e
        WHERE r.run_id = :runId AND r.list_no = :listNo
          AND r.cr_id IS NOT NULL
          AND r.cr_id = e.emp_id
          AND e.resign_date IS NOT NULL
          AND e.resign_date < :sysDate::date`,
      { runId: ctx.runId, listNo: ctx.listNo, sysDate: ctx.sysDate },
    );
    await manager.query(sql, parameters);
  }

  // ----- 步驟 3：CR 優先指派（INNER JOIN ob_empl_set ration>0，deptid_m ASC 取第一筆）-----
  {
    const [sql, parameters] = escape(
      manager,
      `WITH empl_set_ranked AS (
         SELECT emplid, deptid_m,
                ROW_NUMBER() OVER (
                  PARTITION BY emplid
                  ORDER BY deptid_m ASC
                ) AS rn
           FROM ob_empl_set
          WHERE list_no = :listNo AND ration > 0
       ),
       first_dept AS (
         SELECT emplid, deptid_m FROM empl_set_ranked WHERE rn = 1
       )
       UPDATE ob_monthly_run_result r
          SET emplid        = r.cr_id,
              dept_id       = fd.deptid_m,
              emplid_deptid = fd.deptid_m,
              is_cr         = 'Y',
              updated_at    = CURRENT_TIMESTAMP
         FROM first_dept fd
        WHERE r.run_id = :runId AND r.list_no = :listNo
          AND r.cr_id IS NOT NULL
          AND r.cr_id = fd.emplid`,
      { runId: ctx.runId, listNo: ctx.listNo },
    );
    await manager.query(sql, parameters);
  }
}
