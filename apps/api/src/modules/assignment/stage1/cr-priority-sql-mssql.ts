/**
 * cr-priority-sql-mssql — AD-E07-42 P3d：`cr-priority-sql.ts` 之 MSSQL 平行版
 * （CR 優先分派前置步驟下推：步驟 1 逾2年清空 → 步驟 2 離職清空 → 步驟 3 CR 優先指派）。
 *
 * 與 PG 版（runCrPrioritySql）逐條等價，方言差異（AD §2.4）：
 *   ① 🔴🔴 步驟 1 日期轉型（DATECAST-001/002/GATE-002）：`ob_monthly_run_result.appl_date` 為
 *      `datetime2`（非 varchar；與 P3c ASSIGNDAY assignday=varchar 之結論**相反**，不可類推省略）。
 *      PG `appl_date < :twoYearsAgo::date` → T-SQL `appl_date < CAST(:twoYearsAgo AS DATE)`。
 *      SQL Server 依型別優先順序將 DATE 常值隱式提升為 DATETIME2（補 00:00:00.0000000）比對，
 *      與 PG「date 常值提升為 timestamp 於午夜比對」語意一致（真庫 STEP1 邊界驗證）。
 *   ② 步驟 2/3 UPDATE...FROM 重構（承 P3b/P3c 手法，UPDATEFROM-001/002）：
 *      PG「目標就地宣告別名 + FROM 來源表」→ MSSQL「UPDATE r SET ... FROM ob_monthly_run_result r
 *      INNER JOIN <來源> ON <join key> WHERE r.run_id=:runId AND r.list_no=:listNo」
 *      （join key 移入 INNER JOIN ON、WHERE 僅保留 run_id/list_no 範圍限定鍵 + 過濾條件；
 *       防跨 run 污染 UPDATEFROM-001；INNER JOIN 語意等同 PG 隱式 INNER，BR-F102-08 查無不清空）。
 *   ③ 步驟 2 resign_date（GATE-003）：`ob_emphire.resign_date` 為原生 `date`（PG/MSSQL 皆是），
 *      `resign_date < :sysDate::date` → `resign_date < CAST(:sysDate AS DATE)`（DATE↔DATE 同型，低風險）。
 *   ④ 步驟 3 CTE（GATE-006）：`empl_set_ranked` 主體為 `SELECT ... FROM ob_empl_set`（直接對真實表
 *      SELECT，非 P3c dept_pct/empl_set/cal 之 PG `WITH x(cols) AS (VALUES ...)` 語法糖）——T-SQL CTE
 *      本即要求主體為 SELECT，此站點**不需要** derived table 包裝改寫。
 *   ⑤ 視窗函式（ROW_NUMBER() OVER (PARTITION BY emplid ORDER BY deptid_m ASC)）**不變**——
 *      SQL Server 2012+ 原生支援；決定性 deptid_m ASC 取 rn=1（I-DET-CR-01，真庫 collation 驗證）。
 *   ⑥ 本檔全程**無** ration 之 DECIMAL CAST 算術（GATE-004）：`ration > 0` 僅作 `ob_empl_set` 內建表
 *      WHERE 過濾（非參數化字面值），不適用 P3b/P3c 之 NUMERIC(18,4) 精度風險，MSSQL 版**不引入**任何
 *      精度宣告。
 *   ⑦ `CURRENT_TIMESTAMP`（ANSI 保留字）不變。
 *   ⑧ crEnabled=false 分支（GATE-005）：單表 UPDATE、無 JOIN、無日期比較、純 ANSI
 *      （無 `||`/`::`/`RETURNING`/`ON CONFLICT`/`LIMIT`）——SQL 字面與 PG 版逐位元組相同（沿用不改寫；
 *       真庫 GATECR 驗證直接對 MSSQL 連線執行）。
 *
 * ⚠️ PG 檔（cr-priority-sql.ts）完全不動（STATIC-003 / REG-001 byte-identical）；本檔為新增平行版。
 *    CR 前置步驟為純粹確定性 UPDATE，**不產生任何 warning/skipped_cases**（回傳 Promise<void>，
 *    與 PG 版契約一致，CRWARN-001）。`:twoYearsAgo` / `:sysDate` 由 JS 計算（'YYYY-MM-DD'）傳入，
 *    避免 DB 端日期計算差異（feedback_typeorm_between_timezone）；CR 步驟只對 result 工作集 UPDATE，
 *    不讀回來源歷史表（I-CR-COLSRC-01）。
 */

import type { EntityManager } from 'typeorm';

import { computeCrSysDates } from './cr-priority';
import type { CrPriorityContext } from './cr-priority-sql';

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
 * F102 CR 優先分派前置步驟 SQL 下推（MSSQL 真庫；對稱 PG runCrPrioritySql）。
 *
 * - crEnabled=false → 僅執行強制 is_cr='N' UPDATE（BR-F102-02）。
 * - crEnabled=true  → 步驟 1 → 步驟 2 → 步驟 3（嚴格序，I-CR-ORDER-01 內步驟序）。
 *
 * @param manager EntityManager（呼叫端以 DB_TYPE='mssql' gate）
 * @param ctx     runId / listNo / crEnabled / sysDate
 */
export async function runCrPrioritySqlMssql(
  manager: EntityManager,
  ctx: CrPriorityContext,
): Promise<void> {
  if (!ctx.crEnabled) {
    // cr_enabled=false：強制 is_cr='N'（避免來源殘留 'Y' 污染），跳過步驟 1–3（BR-F102-02）。
    // 純 ANSI，字面與 PG 版相同（GATE-005 真庫驗證直接對 MSSQL 執行通過，無方言差異）。
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
  // 🔴🔴 appl_date 為 datetime2；PG `::date` → T-SQL `CAST(:twoYearsAgo AS DATE)`（DATECAST-001）。
  {
    const [sql, parameters] = escape(
      manager,
      `UPDATE ob_monthly_run_result
          SET cr_id = NULL, cr_nm = NULL, is_cr = 'N', updated_at = CURRENT_TIMESTAMP
        WHERE run_id = :runId AND list_no = :listNo
          AND cr_id IS NOT NULL
          AND appl_date IS NOT NULL
          AND appl_date < CAST(:twoYearsAgo AS DATE)`,
      { runId: ctx.runId, listNo: ctx.listNo, twoYearsAgo },
    );
    await manager.query(sql, parameters);
  }

  // ----- 步驟 2：離職清空（INNER JOIN ob_emphire，resign_date < sysDate，嚴格小於）-----
  // UPDATE...FROM 重構：join key（r.cr_id = e.emp_id）移入 INNER JOIN ON；resign_date 原生 date，
  // PG `::date` → `CAST(:sysDate AS DATE)`（DATE↔DATE 同型，GATE-003）。
  {
    const [sql, parameters] = escape(
      manager,
      `UPDATE r
          SET cr_id = NULL, cr_nm = NULL, is_cr = 'N', updated_at = CURRENT_TIMESTAMP
         FROM ob_monthly_run_result r
         INNER JOIN ob_emphire e ON r.cr_id = e.emp_id
        WHERE r.run_id = :runId AND r.list_no = :listNo
          AND r.cr_id IS NOT NULL
          AND e.resign_date IS NOT NULL
          AND e.resign_date < CAST(:sysDate AS DATE)`,
      { runId: ctx.runId, listNo: ctx.listNo, sysDate: ctx.sysDate },
    );
    await manager.query(sql, parameters);
  }

  // ----- 步驟 3：CR 優先指派（INNER JOIN ob_empl_set ration>0，deptid_m ASC 取第一筆）-----
  // CTE 主體直接對 ob_empl_set SELECT（GATE-006：不需 derived table 包裝）；ROW_NUMBER 不變；
  // UPDATE...FROM 重構：join key（r.cr_id = fd.emplid）移入 INNER JOIN ON。
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
       UPDATE r
          SET emplid        = r.cr_id,
              dept_id       = fd.deptid_m,
              emplid_deptid = fd.deptid_m,
              is_cr         = 'Y',
              updated_at    = CURRENT_TIMESTAMP
         FROM ob_monthly_run_result r
         INNER JOIN first_dept fd ON r.cr_id = fd.emplid
        WHERE r.run_id = :runId AND r.list_no = :listNo
          AND r.cr_id IS NOT NULL`,
      { runId: ctx.runId, listNo: ctx.listNo },
    );
    await manager.query(sql, parameters);
  }
}
