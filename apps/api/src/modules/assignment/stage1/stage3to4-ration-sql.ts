/**
 * Stage 3/4 真實比例分派 SQL 下推（F101 / AD-E07-29，PG 真庫）
 *
 * 取代 F100 placeholder runStage4Sql（dept[0] + 單一 defaultEmpl + st4_exchange 10% senior swap）。
 * 本模組以 set-based SQL UPDATE 對 ob_monthly_run_result 補 dept_id / emplid / emplid_deptid /
 * assignday，與 JS distributeStage3to4 oracle **逐列確定性等價**（AC-15 DoD）。
 *
 * 三道 UPDATE（依賴鏈 Stage 2(tier) → Stage 3(dept) → Stage 4(empl) → ASSIGNDAY）：
 *
 *   ① Stage 3 dept ration：
 *      - GROUP BY (o.dept_id〔分處〕, r.list_no, r.tier_level) 計件 group_cnt
 *      - 各電銷課 ob_dept_pct(obdeptid, ration>0)：FLOOR(group_cnt × ration/100) + 差額（obdeptid ASC
 *        前 diff 課各 +1）→ final_cnt
 *      - 案件 (orgno, appl_no) ASC ROW_NUMBER；各課累積區間 [prefix_lo, prefix_hi) 取件 → dept_id
 *
 *   ② Stage 4 empl ration：
 *      - GROUP BY (r.dept_id〔Stage 3 寫入〕, r.tier_level) 計件 grp_cnt
 *      - 各員工 ob_empl_set(deptid_m=dept_id, ration>0)：FLOOR(grp_cnt × ration/100) + ADD_CNT
 *        （FLOOR(left/empCount) 均攤）+ 前 N（emplid ASC）各 +1 → final_cnt
 *      - 案件 (orgno, appl_no) ASC ROW_NUMBER；各員工累積區間取件 → emplid / emplid_deptid
 *
 *   ③ ASSIGNDAY 千分比：
 *      - per emplid 案件 (orgno, appl_no) ASC EMP_ORD；total = 員工件數
 *      - 各 casedt（工作日，傳入 workingDays）FLOOR(total × ratioPerMille/1000)，最末 casedt 吸收餘額
 *      - 以「per (emplid) 累積邊界」對應 casedt：EMP_ORD ≤ Σ_{d'≤d} FLOOR → casedt[d]；最末日吸收
 *
 * 確定性鍵（AD-E07-29 §3.3）：dept 差額 obdeptid ASC；案件 (orgno, appl_no) ASC；empl 差額
 * emplid ASC；EMP_ORD per-emplid (orgno, appl_no) ASC。全程無 NEWID / random（I-DET-01）。
 *
 * DB_TYPE gate：本路徑一律 PG（呼叫端以 DB_TYPE='postgres' gate）；SQLite 沿用 JS executeV2。
 * tier_level / dept_id / emplid / assignday 全在 ob_monthly_run_result（單表 set-based，I-NOLOAD-01）；
 * 分處（o.dept_id）需 JOIN ob_pool_data（G-1：ob_pool_data 有 dept_id，無 tier_level）。
 */

import type { EntityManager } from 'typeorm';

import type {
  DeptRation,
  EmplRation,
  WorkingDay,
  RationWarning,
} from './stage3to4-ration';

export interface Stage3to4SqlContext {
  runId: string;
  listNo: string;
  /** 作業月 YYYYMM（ASSIGNDAY 無工作日警告之 work_ym）。 */
  ym: string;
  /** ob_dept_pct（list_no + ration>0）。 */
  deptRations: DeptRation[];
  /** ob_empl_set（list_no + ration>0）。 */
  emplRations: EmplRation[];
  /** calculateDailyEstimate(ym) 工作日千分比（已過濾 isWorkday；空 → ASSIGNDAY NULL + 警告）。 */
  workingDays: WorkingDay[];
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
 * Stage 3 dept ration UPDATE：寫 ob_monthly_run_result.dept_id。
 *
 * 以 VALUES 注入 ob_dept_pct（obdeptid, ration, dept_seq=obdeptid ASC 序）；CTE 計算分組件數、
 * FLOOR 配額、差額補足（dept_seq ≤ diff +1）、各課累積邊界，案件以 (orgno, appl_no) ROW_NUMBER
 * 落入對應課的累積區間 → dept_id。回傳該 list 因無 ration 而未配之 (tier_level, case_count) 警告資料。
 */
async function runStage3DeptSql(
  manager: EntityManager,
  ctx: Stage3to4SqlContext,
): Promise<RationWarning[]> {
  // 無 ration 課 → 全列 dept_id 保持 NULL；對每個 (tier_level) 分組發警告。
  // F102（I-CR-DEDUCT-01）：案件池排除 is_cr='Y'（CR 預指派件不入比例池、不計入警告基數）。
  if (ctx.deptRations.length === 0) {
    const rows = await manager.query(
      ...escape(
        manager,
        `SELECT r.tier_level AS tier_level, COUNT(*)::int AS cnt
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
    // dept_seq = i+1（obdeptid ASC）。
    deptValues.push(`(:od${i}, CAST(:or${i} AS numeric), ${i + 1})`);
  });

  const sql = `
WITH dept_pct(obdeptid, ration, dept_seq) AS (
  VALUES ${deptValues.join(', ')}
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
  SELECT pool_dept_id, tier_level, COUNT(*)::int AS group_cnt
    FROM cases GROUP BY pool_dept_id, tier_level
),
-- 各 (分組, 課) FLOOR 配額 + 差額（dept_seq ≤ diff 各 +1）。
quota AS (
  SELECT g.pool_dept_id, g.tier_level, g.group_cnt,
         d.obdeptid, d.dept_seq,
         FLOOR(g.group_cnt * d.ration / 100)::int AS floor_cnt,
         (g.group_cnt - SUM(FLOOR(g.group_cnt * d.ration / 100)::int)
            OVER (PARTITION BY g.pool_dept_id, g.tier_level))::int AS diff
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
UPDATE ob_monthly_run_result r
   SET dept_id = a.obdeptid, updated_at = CURRENT_TIMESTAMP
  FROM assigned a
 WHERE r.run_id = :runId AND r.list_no = :listNo
   AND r.orgno = a.orgno AND r.appl_no = a.appl_no`;

  await manager.query(...escape(manager, sql, params));
  return [];
}

/**
 * Stage 4 empl ration UPDATE：寫 ob_monthly_run_result.emplid / emplid_deptid。
 *
 * GROUP BY (dept_id〔Stage 3 寫入〕, tier_level)；各員工 ob_empl_set(deptid_m, ration>0)：
 * FLOOR + ADD_CNT(FLOOR(left/empCount) 均攤) + 前 N(emplid ASC) +1 → final_cnt；案件
 * (orgno, appl_no) ASC 落入累積區間 → emplid。回傳「課有案件但無員工」之警告資料。
 */
async function runStage4EmplSql(
  manager: EntityManager,
  ctx: Stage3to4SqlContext,
): Promise<RationWarning[]> {
  // 以 deptid_m 分群 ration（PG 端用 VALUES 注入）。
  const empls = ctx.emplRations;

  // 先找「有 dept_id（Stage 3 配到）但對應 deptid_m 無員工 ration」之 (dept_id, tier_level) → 警告。
  const deptsWithEmpl = new Set(empls.map((e) => e.deptid_m));
  const warnRows = (await manager.query(
    ...escape(
      manager,
      `SELECT r.dept_id AS dept_id, r.tier_level AS tier_level, COUNT(*)::int AS cnt
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
  // emp_seq = per deptid_m 之 emplid ASC 序（前 N 補足用）；以 JS 先算好注入。
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
        emplValues.push(
          `(:em${idx}, :ed${idx}, CAST(:er${idx} AS numeric), ${seq + 1})`,
        );
        idx++;
      });
  }

  const sql = `
WITH empl_set(emplid, deptid_m, ration, emp_seq) AS (
  VALUES ${emplValues.join(', ')}
),
-- 分組件數（dept_id + tier）。F102（I-CR-DEDUCT-01）：排除 is_cr='Y'（CR 預指派件不計入員工分配基數）。
grp AS (
  SELECT r.dept_id, r.tier_level, COUNT(*)::int AS grp_cnt
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
         FLOOR(g.grp_cnt * e.ration / 100)::int AS floor_cnt,
         COUNT(*) OVER (PARTITION BY g.dept_id, g.tier_level) AS emp_count,
         SUM(FLOOR(g.grp_cnt * e.ration / 100)::int)
           OVER (PARTITION BY g.dept_id, g.tier_level) AS sum_floor
    FROM grp g
    JOIN empl_set e ON e.deptid_m = g.dept_id
),
-- ① left = grp_cnt - ΣFLOOR；② add_cnt = FLOOR(left/emp_count)；left2 = left - add_cnt*emp_count；
-- ③ 前 left2（emp_seq ASC）各 +1。
quota AS (
  SELECT dept_id, tier_level, emplid, emp_seq, grp_cnt, emp_count,
         (grp_cnt - sum_floor) AS lft,
         FLOOR((grp_cnt - sum_floor) / emp_count)::int AS add_cnt
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
UPDATE ob_monthly_run_result r
   SET emplid = a.emplid, emplid_deptid = a.emplid_deptid, updated_at = CURRENT_TIMESTAMP
  FROM assigned a
 WHERE r.run_id = :runId AND r.list_no = :listNo
   AND r.orgno = a.orgno AND r.appl_no = a.appl_no`;

  await manager.query(...escape(manager, sql, params));
  return warnings;
}

/**
 * ASSIGNDAY 千分比 UPDATE：寫 ob_monthly_run_result.assignday。
 *
 * per emplid 案件 (orgno, appl_no) ASC EMP_ORD（1-based）；total = 員工件數；各 casedt(工作日序 d)
 * FLOOR(total × ratioPerMille/1000)，最末 casedt 吸收餘額。以累積邊界對應 EMP_ORD → casedt。
 * 無工作日 → 不執行 + 回 ASSIGNDAY_NO_CALENDAR_WARN（若有 emplid 案件）。
 */
async function runAssignDaySql(
  manager: EntityManager,
  ctx: Stage3to4SqlContext,
): Promise<RationWarning[]> {
  const days = ctx.workingDays;
  // 是否有 emplid 案件（無則無需 assignday，也不發 calendar 警告）。
  // F102 修正（I-CR-ASSIGNDAY-01）：ASSIGNDAY 階段**不**過濾 is_cr —— CR 預指派案件（is_cr='Y'）
  //   亦有 emplid（=cr_id），須與同 emplid 之非 CR 案件一同納入指派日散佈，否則 CR 案 assignday
  //   全 NULL（live 202606 抓到此 bug：2,073 筆 CR 全空，legacy 全有指派日）。
  //   扣量（is_cr<>'Y'）僅作用於數量配額（Stage 3 cases/ranked + Stage 4 grp/ranked），不及 ASSIGNDAY。
  const hasEmplRows = (await manager.query(
    ...escape(
      manager,
      `SELECT 1 FROM ob_monthly_run_result
        WHERE run_id = :runId AND list_no = :listNo AND emplid IS NOT NULL LIMIT 1`,
      { runId: ctx.runId, listNo: ctx.listNo },
    ),
  )) as unknown[];
  if (hasEmplRows.length === 0) return [];

  if (days.length === 0) {
    return [
      { event: 'ASSIGNDAY_NO_CALENDAR_WARN', list_no: ctx.listNo, work_ym: ctx.ym },
    ];
  }

  // casedt VALUES（工作日序 day_seq 0-based + ratioPerMille）。
  const params: Record<string, unknown> = { runId: ctx.runId, listNo: ctx.listNo };
  const dayValues: string[] = [];
  days.forEach((d, i) => {
    params[`cd${i}`] = d.casedt;
    params[`cr${i}`] = d.ratioPerMille;
    dayValues.push(`(:cd${i}, ${d.ratioPerMille}, ${i})`);
  });
  const lastIdx = days.length - 1;

  // 各 (emplid, day) 取件數 take：最末日吸收 total - Σ前面 FLOOR；否則 FLOOR(total × ratio/1000)。
  // 以累積邊界 [lo, hi) 對應 EMP_ORD（0-based）→ casedt。
  const sql = `
WITH cal(casedt, ratio, day_seq) AS (
  VALUES ${dayValues.join(', ')}
),
empl_total AS (
  SELECT emplid, COUNT(*)::int AS total
    FROM ob_monthly_run_result
   WHERE run_id = :runId AND list_no = :listNo AND emplid IS NOT NULL
   GROUP BY emplid
),
-- 各 (emplid, day) FLOOR 取件；最末日吸收。
per_day AS (
  SELECT et.emplid, c.casedt, c.day_seq,
         CASE WHEN c.day_seq = ${lastIdx}
              THEN et.total - SUM(FLOOR(et.total * c.ratio / 1000)::int)
                     OVER (PARTITION BY et.emplid ORDER BY c.day_seq
                           ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING)
              ELSE FLOOR(et.total * c.ratio / 1000)::int
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
UPDATE ob_monthly_run_result r
   SET assignday = a.casedt, updated_at = CURRENT_TIMESTAMP
  FROM assigned a
 WHERE r.run_id = :runId AND r.list_no = :listNo
   AND r.orgno = a.orgno AND r.appl_no = a.appl_no`;

  await manager.query(...escape(manager, sql, params));
  return [];
}

/**
 * Stage 3 前清除（F102 / AD-E07-30 §4.3，I-CR-ORDER-01）：清 dept_id / emplid / emplid_deptid /
 * assignday → NULL，**保留 is_cr**（BR-F101-06）。
 *
 * 須在 F102 CR 前置步驟（runCrPrioritySql）**之前**呼叫——否則 CR 步驟 3 寫入之 emplid / dept_id
 * 會被本清除覆蓋（C-2 裁示）。執行順序：clearStage3Fields → runCrPrioritySql → runStage3to4RationSql。
 *
 * 冪等保護：下推路徑 Stage 1 INSERT 之列原即 dept 欄全 NULL，本清除為重跑安全護欄
 * （重觸發同 run 時確保 ration 分派從乾淨狀態起算；is_cr 由 Stage 1 帶入後保留供 CR 步驟讀取）。
 */
export async function clearStage3Fields(
  manager: EntityManager,
  ctx: { runId: string; listNo: string },
): Promise<void> {
  const [sql, parameters] = escape(
    manager,
    `UPDATE ob_monthly_run_result
        SET dept_id = NULL, emplid = NULL, emplid_deptid = NULL, assignday = NULL,
            updated_at = CURRENT_TIMESTAMP
      WHERE run_id = :runId AND list_no = :listNo`,
    { runId: ctx.runId, listNo: ctx.listNo },
  );
  await manager.query(sql, parameters);
}

/**
 * Stage 3/4/ASSIGNDAY 完整下推（單一 list）：dept ration → empl ration → ASSIGNDAY。
 * 須在 runStage2and3Sql（tier_level 已寫）+ F102 runCrPrioritySql（CR 預指派）之後執行。
 * 案件池排除 is_cr='Y'（I-CR-DEDUCT-01）。回傳本 list 之三類警告。
 */
export async function runStage3to4RationSql(
  manager: EntityManager,
  ctx: Stage3to4SqlContext,
): Promise<RationWarning[]> {
  const warnings: RationWarning[] = [];
  warnings.push(...(await runStage3DeptSql(manager, ctx)));
  warnings.push(...(await runStage4EmplSql(manager, ctx)));
  warnings.push(...(await runAssignDaySql(manager, ctx)));
  return warnings;
}
