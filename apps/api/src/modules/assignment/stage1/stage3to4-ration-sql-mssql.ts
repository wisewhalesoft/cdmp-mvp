/**
 * stage3to4-ration-sql-mssql — AD-E07-42 P3c：`stage3to4-ration-sql.ts` 之 MSSQL 平行版
 * （Stage 3/4 真實比例分派下推：dept ration → empl ration → ASSIGNDAY 千分比）。
 *
 * 與 PG 版（runStage3to4RationSql）逐條等價，方言差異（AD §2.3）：
 *   ① VALUES-CTE 三處（dept_pct / empl_set / cal）：PG `WITH x(cols) AS (VALUES ...)`
 *      → T-SQL 要求 CTE 主體須為 SELECT，改 `WITH x(cols) AS (SELECT * FROM (VALUES ...) AS v(cols))`
 *      （derived table 包裝；GATE-003 / VALUESCTE-001~003）。
 *   ② `::int` → `CAST(... AS INT)`；`COUNT(*)::int` → `COUNT(*)`（MSSQL COUNT(*) 已回 INT）。
 *   ③ 🔴🔴 ration 精度（DECIMAL-RATION-001/002）：PG 裸 `CAST(:param AS numeric)` 對已有精度值原樣保留；
 *      T-SQL 未指定精度之裸 `NUMERIC` 預設 `NUMERIC(18,0)`，會在 VALUES 建構階段（早於 FLOOR）
 *      即把 `33.67` 四捨五入為 `34` → 配額系統性偏移。**兩處（dept ration:113 / empl ration:251）
 *      皆改明確精度 `NUMERIC(18,4)`**（對齊 P3b LOAN_RATE 決策原則：寬精度保留小數 + 對 fallback
 *      未知精度亦安全；來源 ob_dept_pct.ration numeric(9,2)/ob_empl_set.ration numeric(10,2) 皆 ⊆ (18,4)）。
 *      **兩處必須一致**（DECIMAL-RATION-002 防修一漏一）。
 *   ④ `LIMIT 1`（hasEmplRows 存在性檢查）→ `SELECT TOP (1) 1 FROM ...`（T-SQL 無 LIMIT，TOPLIMIT-001/002）。
 *   ⑤ UPDATE...FROM 重構（3 道 dept/empl/assignday）：PG「目標就地宣告別名不入 FROM」
 *      → MSSQL `UPDATE r SET ... FROM ob_monthly_run_result r INNER JOIN assigned a ON r.orgno=a.orgno
 *      AND r.appl_no=a.appl_no WHERE r.run_id=... AND r.list_no=...`（join key 移入 INNER JOIN ON、
 *      WHERE 僅 run_id/list_no 範圍限定；防跨 run 污染 UPDATEFROM-004；承 P3b UPDATEFROM 手法）。
 *   ⑥ 視窗函式（ROW_NUMBER / SUM OVER ... ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING）
 *      **不變**——SQL Server 2012+ 原生支援含 frame clause（AD §2.3 標低風險；WINDOWFN-001~003 驗單列空框架）。
 *   ⑦ `CURRENT_TIMESTAMP`（ANSI 保留字）不變。
 *   ⑧ ASSIGNDAY **無日期型別轉換**（GATE-004）：`assignday` 為 varchar(100)，casedt 全程字串處理，
 *      無 `::date`/DATEADD/DATEDIFF —— MSSQL 版沿用字串比對/寫入語意，不新增任何日期轉換。
 *   ⑨ `is_cr` 篩選（CRFILTER）：`(r.is_cr IS NULL OR r.is_cr <> 'Y')` 三值邏輯不變（配額基數排除 CR、
 *      ASSIGNDAY 不篩選；I-CR-DEDUCT-01 / I-CR-ASSIGNDAY-01）。MSSQL 三值邏輯與 PG 一致（真庫 CRFILTER-003 驗）。
 *
 * ⚠️ PG 檔（stage3to4-ration-sql.ts）完全不動（STATIC-002 / REG-003 byte-identical）；本檔為新增平行版。
 * clearStage3Fields（純 ANSI，無方言字面）由 PG 檔直接複用（DISPATCH-002 決策，真庫驗證）——本檔不重造。
 */

import type { EntityManager } from 'typeorm';

import type {
  DeptRation,
  EmplRation,
  RationWarning,
} from './stage3to4-ration';
import type { Stage3to4SqlContext } from './stage3to4-ration-sql';

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
 * Stage 3 dept ration UPDATE（MSSQL）：寫 ob_monthly_run_result.dept_id。
 * 對稱 PG runStage3DeptSql；VALUES-CTE derived table + ration NUMERIC(18,4) + ::int→CAST + UPDATE...FROM。
 */
async function runStage3DeptSqlMssql(
  manager: EntityManager,
  ctx: Stage3to4SqlContext,
): Promise<RationWarning[]> {
  // 無 ration 課 → 全列 dept_id 保持 NULL；對每個 (tier_level) 分組發警告。
  // F102（I-CR-DEDUCT-01）：案件池排除 is_cr='Y'（CR 預指派件不入比例池、不計入警告基數）。
  if (ctx.deptRations.length === 0) {
    const rows = await manager.query(
      ...escape(
        manager,
        `SELECT r.tier_level AS tier_level, COUNT(*) AS cnt
           FROM ob_monthly_run_result r
          WHERE r.run_id = :runId AND r.list_no = :listNo
            AND r.tier_level IN ('T1','T2','T3','T4','T5')
            AND (r.is_cr IS NULL OR r.is_cr <> 'Y')
          GROUP BY r.tier_level`,
        { runId: ctx.runId, listNo: ctx.listNo },
      ),
    );
    return (rows as Array<{ tier_level: string; cnt: number }>).map((row) => ({
      event: 'STAGE3_NO_DEPT_RATION' as const,
      list_no: ctx.listNo,
      tier_level: row.tier_level,
      case_count: Number(row.cnt),
    }));
  }

  // ob_dept_pct VALUES（obdeptid ASC 序為 dept_seq）。
  const sorted = [...ctx.deptRations].sort((a, b) =>
    a.obdeptid < b.obdeptid ? -1 : a.obdeptid > b.obdeptid ? 1 : 0,
  );
  const deptValues: string[] = [];
  const params: Record<string, unknown> = { runId: ctx.runId, listNo: ctx.listNo };
  sorted.forEach((d, i) => {
    params[`od${i}`] = d.obdeptid;
    params[`or${i}`] = d.ration;
    // dept_seq = i+1（obdeptid ASC）。🔴🔴 DECIMAL-RATION-001：明確 NUMERIC(18,4)（非裸 numeric）。
    deptValues.push(`(:od${i}, CAST(:or${i} AS NUMERIC(18,4)), ${i + 1})`);
  });

  const sql = `
WITH dept_pct(obdeptid, ration, dept_seq) AS (
  SELECT * FROM (VALUES ${deptValues.join(', ')}) AS v(obdeptid, ration, dept_seq)
),
-- 案件 + 分處（JOIN ob_pool_data 取 dept_id，G-1）。
-- F102（I-CR-DEDUCT-01）：案件池排除 is_cr='Y'（CR 預指派件不被 Stage 3 覆蓋、不計入分組基數）。
cases AS (
  SELECT r.orgno, r.appl_no, r.tier_level, o.dept_id AS pool_dept_id
    FROM ob_monthly_run_result r
    JOIN ob_pool_data o ON o.orgno = r.orgno AND o.appl_no = r.appl_no
   WHERE r.run_id = :runId AND r.list_no = :listNo
     AND r.tier_level IN ('T1','T2','T3','T4','T5')
     AND (r.is_cr IS NULL OR r.is_cr <> 'Y')
),
-- 分組件數（分處 + tier）。
grp AS (
  SELECT pool_dept_id, tier_level, COUNT(*) AS group_cnt
    FROM cases GROUP BY pool_dept_id, tier_level
),
-- 各 (分組, 課) FLOOR 配額 + 差額（dept_seq ≤ diff 各 +1）。
quota AS (
  SELECT g.pool_dept_id, g.tier_level, g.group_cnt,
         d.obdeptid, d.dept_seq,
         CAST(FLOOR(g.group_cnt * d.ration / 100) AS INT) AS floor_cnt,
         CAST(g.group_cnt - SUM(CAST(FLOOR(g.group_cnt * d.ration / 100) AS INT))
            OVER (PARTITION BY g.pool_dept_id, g.tier_level) AS INT) AS diff
    FROM grp g CROSS JOIN dept_pct d
),
final_quota AS (
  SELECT pool_dept_id, tier_level, obdeptid, dept_seq,
         floor_cnt + (CASE WHEN dept_seq <= diff THEN 1 ELSE 0 END) AS final_cnt
    FROM quota
),
-- 各課累積邊界 [lo, hi)：lo = Σ 前面課 final_cnt；hi = lo + 本課 final_cnt。
bounded AS (
  SELECT pool_dept_id, tier_level, obdeptid, final_cnt,
         COALESCE(SUM(final_cnt) OVER (
           PARTITION BY pool_dept_id, tier_level
           ORDER BY dept_seq
           ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS lo,
         (COALESCE(SUM(final_cnt) OVER (
           PARTITION BY pool_dept_id, tier_level
           ORDER BY dept_seq
           ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) + final_cnt) AS hi
    FROM final_quota
),
-- 案件 (orgno, appl_no) ASC 編號（per 分組）。
ranked AS (
  SELECT orgno, appl_no, pool_dept_id, tier_level,
         (ROW_NUMBER() OVER (
            PARTITION BY pool_dept_id, tier_level
            ORDER BY orgno, appl_no) - 1) AS rn0
    FROM cases
),
assigned AS (
  SELECT rk.orgno, rk.appl_no, b.obdeptid
    FROM ranked rk
    JOIN bounded b ON b.pool_dept_id = rk.pool_dept_id
                  AND b.tier_level = rk.tier_level
                  AND rk.rn0 >= b.lo AND rk.rn0 < b.hi
)
UPDATE r
   SET dept_id = a.obdeptid, updated_at = CURRENT_TIMESTAMP
  FROM ob_monthly_run_result r
  INNER JOIN assigned a ON r.orgno = a.orgno AND r.appl_no = a.appl_no
 WHERE r.run_id = :runId AND r.list_no = :listNo`;

  await manager.query(...escape(manager, sql, params));
  return [];
}

/**
 * Stage 4 empl ration UPDATE（MSSQL）：寫 ob_monthly_run_result.emplid / emplid_deptid。
 * 對稱 PG runStage4EmplSql。
 */
async function runStage4EmplSqlMssql(
  manager: EntityManager,
  ctx: Stage3to4SqlContext,
): Promise<RationWarning[]> {
  const empls = ctx.emplRations;

  // 先找「有 dept_id（Stage 3 配到）但對應 deptid_m 無員工 ration」之 (dept_id, tier_level) → 警告。
  const deptsWithEmpl = new Set(empls.map((e) => e.deptid_m));
  const warnRows = (await manager.query(
    ...escape(
      manager,
      `SELECT r.dept_id AS dept_id, r.tier_level AS tier_level, COUNT(*) AS cnt
         FROM ob_monthly_run_result r
        WHERE r.run_id = :runId AND r.list_no = :listNo
          AND r.dept_id IS NOT NULL
          AND r.tier_level IN ('T1','T2','T3','T4','T5')
          AND (r.is_cr IS NULL OR r.is_cr <> 'Y')
        GROUP BY r.dept_id, r.tier_level`,
      { runId: ctx.runId, listNo: ctx.listNo },
    ),
  )) as Array<{ dept_id: string; tier_level: string; cnt: number }>;
  const warnings: RationWarning[] = [];
  for (const row of warnRows) {
    if (!deptsWithEmpl.has(row.dept_id)) {
      warnings.push({
        event: 'STAGE4_NO_EMPL_WARN',
        dept_id: row.dept_id,
        list_no: ctx.listNo,
        tier_level: row.tier_level,
        case_count: Number(row.cnt),
      });
    }
  }

  if (empls.length === 0) return warnings;

  // ob_empl_set VALUES（emplid ASC 內每 deptid_m 之 seq）。
  const params: Record<string, unknown> = { runId: ctx.runId, listNo: ctx.listNo };
  const emplValues: string[] = [];
  const byDept = new Map<string, EmplRation[]>();
  for (const e of empls) {
    const arr = byDept.get(e.deptid_m);
    if (arr) arr.push(e);
    else byDept.set(e.deptid_m, [e]);
  }
  let idx = 0;
  for (const [, arr] of byDept) {
    arr
      .slice()
      .sort((a, b) => (a.emplid < b.emplid ? -1 : a.emplid > b.emplid ? 1 : 0))
      .forEach((e, seq) => {
        params[`em${idx}`] = e.emplid;
        params[`ed${idx}`] = e.deptid_m;
        params[`er${idx}`] = e.ration;
        // 🔴🔴 DECIMAL-RATION-002：明確 NUMERIC(18,4)（與 dept 一致，非裸 numeric）。
        emplValues.push(
          `(:em${idx}, :ed${idx}, CAST(:er${idx} AS NUMERIC(18,4)), ${seq + 1})`,
        );
        idx++;
      });
  }

  const sql = `
WITH empl_set(emplid, deptid_m, ration, emp_seq) AS (
  SELECT * FROM (VALUES ${emplValues.join(', ')}) AS v(emplid, deptid_m, ration, emp_seq)
),
-- 分組件數（dept_id + tier）。F102（I-CR-DEDUCT-01）：排除 is_cr='Y'（CR 預指派件不計入員工分配基數）。
grp AS (
  SELECT r.dept_id, r.tier_level, COUNT(*) AS grp_cnt
    FROM ob_monthly_run_result r
   WHERE r.run_id = :runId AND r.list_no = :listNo
     AND r.dept_id IS NOT NULL
     AND r.tier_level IN ('T1','T2','T3','T4','T5')
     AND (r.is_cr IS NULL OR r.is_cr <> 'Y')
   GROUP BY r.dept_id, r.tier_level
),
-- FLOOR 配額 + 員工數 + ΣFLOOR。
base AS (
  SELECT g.dept_id, g.tier_level, g.grp_cnt,
         e.emplid, e.emp_seq,
         CAST(FLOOR(g.grp_cnt * e.ration / 100) AS INT) AS floor_cnt,
         COUNT(*) OVER (PARTITION BY g.dept_id, g.tier_level) AS emp_count,
         SUM(CAST(FLOOR(g.grp_cnt * e.ration / 100) AS INT))
           OVER (PARTITION BY g.dept_id, g.tier_level) AS sum_floor
    FROM grp g
    JOIN empl_set e ON e.deptid_m = g.dept_id
),
-- ① left = grp_cnt - ΣFLOOR；② add_cnt = FLOOR(left/emp_count)；left2 = left - add_cnt*emp_count；
-- ③ 前 left2（emp_seq ASC）各 +1。
quota AS (
  SELECT dept_id, tier_level, emplid, emp_seq, grp_cnt, emp_count,
         (grp_cnt - sum_floor) AS lft,
         CAST(FLOOR((grp_cnt - sum_floor) / emp_count) AS INT) AS add_cnt
    FROM base
),
final_quota AS (
  SELECT dept_id, tier_level, emplid, emp_seq,
         floor_cnt_x + add_cnt
           + (CASE WHEN emp_seq <= (lft - add_cnt * emp_count) THEN 1 ELSE 0 END) AS final_cnt
    FROM (
      SELECT b.dept_id, b.tier_level, b.emplid, b.emp_seq, b.floor_cnt AS floor_cnt_x,
             q.add_cnt, q.lft, q.emp_count
        FROM base b
        JOIN quota q ON q.dept_id = b.dept_id AND q.tier_level = b.tier_level
                    AND q.emplid = b.emplid
    ) t
),
bounded AS (
  SELECT dept_id, tier_level, emplid, final_cnt,
         COALESCE(SUM(final_cnt) OVER (
           PARTITION BY dept_id, tier_level
           ORDER BY emp_seq
           ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS lo,
         (COALESCE(SUM(final_cnt) OVER (
           PARTITION BY dept_id, tier_level
           ORDER BY emp_seq
           ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) + final_cnt) AS hi
    FROM final_quota
),
ranked AS (
  SELECT orgno, appl_no, dept_id, tier_level,
         (ROW_NUMBER() OVER (
            PARTITION BY dept_id, tier_level
            ORDER BY orgno, appl_no) - 1) AS rn0
    FROM ob_monthly_run_result
   WHERE run_id = :runId AND list_no = :listNo
     AND dept_id IS NOT NULL
     AND tier_level IN ('T1','T2','T3','T4','T5')
     AND (is_cr IS NULL OR is_cr <> 'Y')
),
assigned AS (
  SELECT rk.orgno, rk.appl_no, b.emplid, b.dept_id AS emplid_deptid
    FROM ranked rk
    JOIN bounded b ON b.dept_id = rk.dept_id AND b.tier_level = rk.tier_level
                  AND rk.rn0 >= b.lo AND rk.rn0 < b.hi
)
UPDATE r
   SET emplid = a.emplid, emplid_deptid = a.emplid_deptid, updated_at = CURRENT_TIMESTAMP
  FROM ob_monthly_run_result r
  INNER JOIN assigned a ON r.orgno = a.orgno AND r.appl_no = a.appl_no
 WHERE r.run_id = :runId AND r.list_no = :listNo`;

  await manager.query(...escape(manager, sql, params));
  return warnings;
}

/**
 * ASSIGNDAY 千分比 UPDATE（MSSQL）：寫 ob_monthly_run_result.assignday。
 * 對稱 PG runAssignDaySql；LIMIT 1 → TOP (1)；VALUES-CTE derived table；無日期型別轉換（GATE-004）。
 */
async function runAssignDaySqlMssql(
  manager: EntityManager,
  ctx: Stage3to4SqlContext,
): Promise<RationWarning[]> {
  const days = ctx.workingDays;
  // 是否有 emplid 案件（無則無需 assignday，也不發 calendar 警告）。
  // F102 修正（I-CR-ASSIGNDAY-01）：ASSIGNDAY 階段**不**過濾 is_cr —— CR 預指派案件（is_cr='Y'）
  //   亦有 emplid（=cr_id），須與同 emplid 之非 CR 案件一同納入指派日散佈。
  // TOPLIMIT-001：PG `LIMIT 1` → T-SQL `SELECT TOP (1) 1 FROM ...`。
  const hasEmplRows = (await manager.query(
    ...escape(
      manager,
      `SELECT TOP (1) 1 AS one FROM ob_monthly_run_result
        WHERE run_id = :runId AND list_no = :listNo AND emplid IS NOT NULL`,
      { runId: ctx.runId, listNo: ctx.listNo },
    ),
  )) as unknown[];
  if (hasEmplRows.length === 0) return [];

  if (days.length === 0) {
    return [
      { event: 'ASSIGNDAY_NO_CALENDAR_WARN', list_no: ctx.listNo, work_ym: ctx.ym },
    ];
  }

  // casedt VALUES（工作日序 day_seq 0-based + ratioPerMille）。ratioPerMille 為整數千分比 → 整數算術
  //   （無 ration 小數精度議題，故 casedt/ratio 無 NUMERIC cast；GATE-004：casedt varchar 全程字串）。
  const params: Record<string, unknown> = { runId: ctx.runId, listNo: ctx.listNo };
  const dayValues: string[] = [];
  days.forEach((d, i) => {
    params[`cd${i}`] = d.casedt;
    params[`cr${i}`] = d.ratioPerMille;
    dayValues.push(`(:cd${i}, ${d.ratioPerMille}, ${i})`);
  });
  const lastIdx = days.length - 1;

  const sql = `
WITH cal(casedt, ratio, day_seq) AS (
  SELECT * FROM (VALUES ${dayValues.join(', ')}) AS v(casedt, ratio, day_seq)
),
empl_total AS (
  SELECT emplid, COUNT(*) AS total
    FROM ob_monthly_run_result
   WHERE run_id = :runId AND list_no = :listNo AND emplid IS NOT NULL
   GROUP BY emplid
),
-- 各 (emplid, day) FLOOR 取件；最末日吸收。
per_day AS (
  SELECT et.emplid, c.casedt, c.day_seq,
         CASE WHEN c.day_seq = ${lastIdx}
              -- WINDOWFN-003 邊界：單一工作日（lastIdx=0）時最末日框架為空 → SUM 回 NULL；
              --   PG 版此處無 COALESCE（單工作日 latent NULL，但月曆恆多工作日 production 不觸發）。
              --   MSSQL 版以 COALESCE(...,0) 修正空框架，使單工作日邊界亦與 JS oracle 逐列等價
              --   （AD §4.1：等價目標為 JS golden oracle 而非 PG；多工作日情境 COALESCE 為 no-op）。
              THEN et.total - COALESCE(SUM(CAST(FLOOR(et.total * c.ratio / 1000) AS INT))
                     OVER (PARTITION BY et.emplid ORDER BY c.day_seq
                           ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0)
              ELSE CAST(FLOOR(et.total * c.ratio / 1000) AS INT)
         END AS take
    FROM empl_total et CROSS JOIN cal c
),
-- 各 day 累積邊界 [lo, hi)（per emplid，day_seq ASC）。
bounded AS (
  SELECT emplid, casedt, day_seq, take,
         COALESCE(SUM(take) OVER (
           PARTITION BY emplid ORDER BY day_seq
           ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS lo,
         (COALESCE(SUM(take) OVER (
           PARTITION BY emplid ORDER BY day_seq
           ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) + take) AS hi
    FROM per_day
),
-- 案件 per emplid (orgno, appl_no) ASC EMP_ORD（0-based）。CR 案件（is_cr='Y'）一同納入散佈（I-CR-ASSIGNDAY-01）。
ranked AS (
  SELECT orgno, appl_no, emplid,
         (ROW_NUMBER() OVER (
            PARTITION BY emplid ORDER BY orgno, appl_no) - 1) AS emp_ord0
    FROM ob_monthly_run_result
   WHERE run_id = :runId AND list_no = :listNo AND emplid IS NOT NULL
),
assigned AS (
  SELECT rk.orgno, rk.appl_no, b.casedt
    FROM ranked rk
    JOIN bounded b ON b.emplid = rk.emplid
                  AND rk.emp_ord0 >= b.lo AND rk.emp_ord0 < b.hi
)
UPDATE r
   SET assignday = a.casedt, updated_at = CURRENT_TIMESTAMP
  FROM ob_monthly_run_result r
  INNER JOIN assigned a ON r.orgno = a.orgno AND r.appl_no = a.appl_no
 WHERE r.run_id = :runId AND r.list_no = :listNo`;

  await manager.query(...escape(manager, sql, params));
  return [];
}

/**
 * Stage 3/4/ASSIGNDAY 完整下推（MSSQL，單一 list）：dept ration → empl ration → ASSIGNDAY。
 * 對稱 PG runStage3to4RationSql。須在 runStage2and3SqlMssql（tier_level 已寫）之後執行。
 * 案件池排除 is_cr='Y'（I-CR-DEDUCT-01）。回傳本 list 之三類警告。
 */
export async function runStage3to4RationSqlMssql(
  manager: EntityManager,
  ctx: Stage3to4SqlContext,
): Promise<RationWarning[]> {
  const warnings: RationWarning[] = [];
  warnings.push(...(await runStage3DeptSqlMssql(manager, ctx)));
  warnings.push(...(await runStage4EmplSqlMssql(manager, ctx)));
  warnings.push(...(await runAssignDaySqlMssql(manager, ctx)));
  return warnings;
}
