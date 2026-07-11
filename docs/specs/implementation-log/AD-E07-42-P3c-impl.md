---
type: implementation-log
feature_id: AD-E07-42-P3c
feature_name: MSSQL 全面遷移 P3c — Stage 3/4 比例分派 raw SQL 引擎移植（JS↔MSSQL 逐列四元組等價）
status: complete
last_updated: 2026-07-08
---

# AD-E07-42 P3c：Stage 3/4 比例分派 raw SQL 引擎 MSSQL 移植 — Implementation Log

將 Stage 3/4 真實比例分派之 PG set-based SQL 下推（`runStage3to4RationSql` ＝ dept ration → empl
ration → ASSIGNDAY 千分比）平行移植至 MSSQL，維持 JS golden oracle（`distributeStage3to4`）↔ MSSQL
下推**逐列四元組**（dept_id / emplid / emplid_deptid / assignday）等價（AC-15 / I-MSSQL-ENGINE-EQ-01）。
**PG 兩核心檔完全不動（byte-identical，`git diff` 空），新增平行 `stage3to4-ration-sql-mssql.ts`，
pipeline 服務層 mssql 分支擴為含比例分派三步鏈。範圍限 P3c；不含 3d（CR 優先分派）/ 3e（tier 收尾）。**

## Test Results Summary

真 MSSQL 實測（`localhost:1433` / `CDMP_TEST` / dbo）：**45 test block 全綠**（涵蓋測試設計 56 個
case ID；部分 case 折疊入單一 block，見下方對照）。靜態守門（capture 假 manager + method source scan +
純函式）不需 MSSQL、恆執行；DB 案例（DEPT/EMPL/ASGD/DECIMAL/WINDOWFN/CRFILTER/EQ/IDEM/REG/DISPATCH-005）
於真庫執行。

| 群組 | case ID → block | 狀態 |
|---|---|---|
| 一、GATE | 001（3 表就緒探測，DISPATCH 群組內）/002（NUMERIC(18,4) 決策，DECIMAL static）/003（3 處 derived table，STATIC-003）/004（無日期轉換，static）| PASS |
| 二、DISPATCH | 001（method scan 含 runStage3to4RationSqlMssql）/002（method scan 含 clearStage3Fields）/003（method scan 不含 runCrPrioritySql）/004（resolveStage2to4Strategy 三態互斥）/005（真庫：dept_id/emplid/assignday 不再恆 NULL）| PASS |
| 三、VALUESCTE | 001/002/003（3 處 `SELECT * FROM (VALUES ...) AS v(...)` 靜態計數=3 + DB DEPT/EMPL/ASGD 逐值驗證）| PASS |
| 四、WINDOWFN | 001（單部門空框架）/002（單員工）/003（單工作日 lastIdx=0，COALESCE 空框架，見偏差）| PASS |
| 五、DECIMAL | RATION-001（🔴🔴 33.67/33.67/32.66×300 → {D1:102,D2:101,D3:97}）/RATION-002（empl 40.25/35.25/24.50 JS oracle 逐員工相等 + 靜態兩處一致 NUMERIC(18,4)）| PASS |
| 六、UPDATEFROM | 001/002/003（三道 UPDATE r + FROM ... INNER JOIN + WHERE 僅 run_id/list_no，static）/004（IDEM-002 真庫跨 run 不污染）| PASS |
| 七、TOPLIMIT | 001（hasEmplRows 改 TOP (1)、無 LIMIT，static）/002（有 emplid 偵測，ASGD/EQ 真庫覆蓋）| PASS |
| 八、DEPT | 001~006（101/30/矩陣/循序/無 ration 警告/tier NULL 不分配，真庫手算 oracle）| PASS |
| 九、EMPL | 001~005（51/整除/diff=2/無員工警告/emplid_deptid，真庫）| PASS |
| 十、ASGD | 001~003（21 件末日吸收/18 件全末日/無工作日警告，真庫）| PASS |
| 十一、CRFILTER | 001（is_cr=Y 不入配額基數）/002（is_cr=Y 已有 emplid 納入 ASSIGNDAY 散佈）/003（NULL 與 N 皆非 CR，OR-NULL 三值一致）| PASS（真庫）|
| 十二、EQ | 001（基準 101/3 課/5 員工/20 工作日）/002（多 Tier）/003（無 ration fallback）/004（無員工 fallback）/005（🔴 CR 預指派混合，crPreassigned）逐列四元組 `toEqual` | PASS（真庫，DoD）|
| 十三、IDEM | 001（clearStage3Fields 四欄重置、is_cr/tier 保留）/002（雙 run 四元組相同）| PASS（真庫）|
| 十四、REG | 001（emplid≠NULL Bug C）/002（is_cr 不改）/003（PG 檔 byte-identical，git diff）/004（P3a/P3b 不回歸，外部套件）/005（SQLite oracle 不回歸，外部套件）/006（tsc 乾淨）| PASS |
| 十五、STATIC | 001（Harness 僅 DELETE 無 DROP/TRUNCATE）/002（無 PG-only token）/003（3 處 derived table）| PASS |

**回歸實測**：
- P3c mssql（`stage3to4-ration-pushdown.mssql.spec`）：**45 綠**（真 MSSQL）。
- SQLite JS oracle 純函式（`stage3to4-ration.spec` 25 + `stage3to4-ration-det.spec` 3）：**28 綠**（REG-005）。
- gate bugfix（`assignment-run-pipeline-gate.bugfix.spec`）：**6 綠**。
- pipeline 服務 non-pg/non-mssql spec（pipeline.service / v2 / stage1-dynamic / snapshot 4 檔）：**41 綠**。
- P3b mssql（`stage2to4-sql-pushdown.mssql.spec`）：**52 綠**（DISPATCH-003 補 stub 後，見偏差 6，REG-004）。
- P3a mssql（`stage1-sql-pushdown.mssql.spec`）：**11 綠 / 52 skip**（dbo 缺 P3a 六表之既有 bootstrap 基線，非本輪回歸，REG-004）。
- F101 PG spec（`stage3to4-ration-pushdown.pg.spec`）：**24 skip**（5433 不可達，PG 路徑不受影響、載入乾淨）。
- `npx tsc --noEmit -p tsconfig.build.json`：**乾淨（exit 0）**（REG-006）。

## Files Changed

| File Path | Change Type | Description |
|---|---|---|
| src/modules/assignment/stage1/stage3to4-ration-sql-mssql.ts | new | `runStage3to4RationSqlMssql`（+ 私有 dept/empl/assignday 三函式）；VALUES-CTE derived table ×3 + ration NUMERIC(18,4) ×2 + `::int`→CAST + UPDATE...FROM ×3 + LIMIT 1→TOP (1) + 視窗函式 1:1 + is_cr OR-NULL |
| src/modules/assignment/services/assignment-run-pipeline.service.ts | modified | 匯入 `runStage3to4RationSqlMssql`；`executeStage2to3PushdownMssql` 擴為三步鏈（計分 → `clearStage3Fields` → `runStage3to4RationSqlMssql`，載入 workingDays/deptRations/emplRations）；mssql dispatch 分支註解更新 |
| src/modules/assignment/stage1/__tests__/stage3to4-ration-pushdown.mssql.spec.ts | new | 45 test block（56 case ID）；3 表共用/自建 harness（複用 `_p3b-mssql-ddl.ts`）+ capture 靜態守門 + JS↔MSSQL 逐列四元組 EQ |
| src/modules/assignment/stage1/__tests__/stage2to4-sql-pushdown.mssql.spec.ts | modified | DISPATCH-003 補 `calendarRepo`/`deptPctRepo`/`emplSetRepo`/`rationWarnings` stub（本輪 `executeStage2to3PushdownMssql` 契約擴增之連帶更新，非行為變更；見偏差 6）|
| （PG 兩核心檔）| unchanged | stage3to4-ration-sql.ts / stage3to4-ration.ts 逐位元組不變（REG-003 git diff 空）|

## Architectural Decisions

### 1. 🔴🔴 DECIMAL-RATION 精度決策（GATE-002 RESOLVED＝NUMERIC(18,4)）
`stage3to4-ration-sql.ts:113`（dept ration）/`:251`（empl ration）之裸 `CAST(:param AS numeric)`：PG 對已有
精度值原樣保留；T-SQL 未指定精度之裸 `NUMERIC` 預設 `NUMERIC(18,0)`，會在 VALUES 建構階段（早於任何
FLOOR）就把 `33.67` 四捨五入為 `34` → 部門/員工配額系統性偏移（且不拋錯、屬靜默數值錯誤）。**兩處皆改
明確 `NUMERIC(18,4)`**（對齊 P3b LOAN_RATE 決策原則：寬精度保留 2 位小數 + 對 fallback 未知精度亦安全；
來源 `ob_dept_pct.ration numeric(9,2)` / `ob_empl_set.ration numeric(10,2)` 皆 ⊆ (18,4)，無精度損失）。
**兩處一致**（DECIMAL-RATION-002 靜態守門：`captureAllSql` 掃描確認 dept + empl 皆 `NUMERIC(18,4)`、
無裸 `numeric`/`NUMERIC)`）。DECIMAL-RATION-001 真庫實測 `{D1:102, D2:101, D3:97}`（FLOOR(300×33.67/100)=101
×2、FLOOR(300×32.66/100)=97，Σ=299、diff=1、obdeptid ASC 首課 D1 +1→102）——精確值斷言，非寬鬆總和比對。

### 2. 🔴🔴 DISPATCH 呼叫鏈擴充（P3b 缺口正式閉環）
`executeStage2to3PushdownMssql`（P3b 落地時僅至 Stage 2~3 計分，函式結尾直接 `return
readResultRowsForSnapshot`）擴為對稱 PG `executeStage2to4Pushdown` 之三步鏈：
`runStage2and3SqlMssql`（計分）→ `clearStage3Fields`（前清除）→ `runStage3to4RationSqlMssql`（比例分派）。
**刻意不呼叫 `runCrPrioritySql`**（PG-only，P3d 範圍，逐字對 MSSQL 執行會語法錯；DISPATCH-003 靜態負向
守門：method `.toString()` 掃描不含該識別碼——為此將方法內註解措辭去除該字面 token）。經 P3c 後 mssql
月名單分派之 dept_id/emplid/emplid_deptid/assignday 不再恆 NULL（DISPATCH-005 真庫 DoD）。

### 3. clearStage3Fields 方言中立性（DISPATCH-002 決策＝直接複用 PG 版，不建 mssql 版）
`clearStage3Fields`（`UPDATE ... SET col=NULL ... updated_at=CURRENT_TIMESTAMP WHERE run_id=:runId AND
list_no=:listNo`）為純 ANSI，無任何 PG-only 字面（無 `||`/`::`/`RETURNING`/`ON CONFLICT`/`LIMIT`/裸
VALUES）；`CURRENT_TIMESTAMP` 為 ANSI 保留字、`:param` 由 `escapeQueryWithParameters` 通用展開。**真庫
驗證通過**（IDEM-001 直接對 MSSQL 連線執行 `clearStage3Fields`，四欄重置為 NULL、`is_cr`/`tier_level`
保留）→ 決策：pipeline 服務 mssql 分支直接複用 PG 版 `clearStage3Fields`，**不建平行 `-mssql.ts` 版本**。

### 4. is_cr 三值邏輯真庫驗證（CRFILTER，不憑訓練知識假設）
`(r.is_cr IS NULL OR r.is_cr <> 'Y')`（配額基數排除 CR、ASSIGNDAY 不篩選）之 MSSQL 三值邏輯**真庫驗證與
PG 一致**：CRFILTER-001（is_cr='Y' 4 件不入 dept 配額基數，非 CR 10 件 50/50→5/5）、CRFILTER-002（is_cr='Y'
已有 emplid 之案件納入 ASSIGNDAY 散佈、assignday 非 NULL——F102 202606 live bug 之 mssql 對稱防線）、
CRFILTER-003（`is_cr=NULL` 與 `'N'` 於配額基數行為完全一致、僅 `'Y'` 排除）皆綠。

### 5. 視窗函式 1:1 + UPDATE...FROM + VALUES-CTE + TOP
- **VALUES-CTE ×3**（dept_pct/empl_set/cal）：PG `WITH x(cols) AS (VALUES ...)` → `WITH x(cols) AS
  (SELECT * FROM (VALUES ...) AS v(cols))`（STATIC-003 靜態計數=3）。
- **UPDATE...FROM ×3**（dept/empl/assignday）：`UPDATE r SET ... FROM ob_monthly_run_result r INNER JOIN
  assigned a ON r.orgno=a.orgno AND r.appl_no=a.appl_no WHERE r.run_id=:runId AND r.list_no=:listNo`
  （join key 入 INNER JOIN ON、WHERE 僅範圍限定鍵；承 P3b 手法；UPDATEFROM-004 真庫跨 run 不污染）。
- **視窗函式不變**：`ROW_NUMBER()`／`SUM(...) OVER (... ROWS BETWEEN UNBOUNDED PRECEDING AND 1
  PRECEDING)` SQL Server 2012+ 原生支援（WINDOWFN-001/002 單列 partition 空框架 COALESCE→0 正確）。
- **`::int`→`CAST(...AS INT)`**；`COUNT(*)::int`→`COUNT(*)`（MSSQL 已回 INT）。
- **`LIMIT 1`→`SELECT TOP (1) 1`**（TOPLIMIT-001）。
- **ASSIGNDAY 無日期型別轉換**（GATE-004 確認）：`assignday` 為 `varchar(100)`，`casedt` 全程字串處理，
  全檔零 `::date`/`DATEADD`/`DATEDIFF`/`CAST(...AS DATE)`（static 掃描驗證）；沿用字串比對/寫入語意。

### 6. Harness（§0.2，沿用 P3a「共用既有表」策略 + 複用 P3b 零 drift DDL）
`beforeAll` 對 3 表（`assignment_run`/`ob_pool_data`/`ob_monthly_run_result`）`OBJECT_ID` 探測 →
`existedBeforeSuite`；缺表以 **P3b `_p3b-mssql-ddl.ts`（自 baseline migration 解析之零 drift CREATE
TABLE）** 自建、`selfBuiltTables` 記錄。`afterAll` 自建表 `DROP`（reverse 序）、既有表僅前綴 `DELETE`
（**絕不** DROP/TRUNCATE 共用表，STATIC-001）。隔離：`run_id` 固定 UUID（P3C_RUN_ID_1/2）；`list_no`
前綴 `'P3C'`（≤11 chars 適配 varchar 欄寬）；`appl_no`/`custo_no` 前綴 `'P3C'` 連號（保證 (orgno,appl_no)
字串序＝注入序，與 JS oracle 逐列比對一致）。→ **自足可獨立完整重跑**（不依賴外部 bootstrap）。

## 未驗證假設之真庫驗證結果
1. **MSSQL 數值除法語意**：`int * NUMERIC(18,4) / 100` 走 decimal 除法（FLOOR 前不整數化）、
   `int / int`（`(grp_cnt - sum_floor) / emp_count`、`total * ratio / 1000`）走整數除法——與 PG 及 JS
   `Math.floor` 逐列一致（DECIMAL-RATION-001/002 精確值 + EQ-001~005 四元組 `toEqual` 誤差 0 驗證）。
2. **VALUES-CTE derived table**：T-SQL `WITH x(cols) AS (SELECT * FROM (VALUES ...) AS v(cols))` 於真庫
   多列輸入正確映射（dept_seq/emp_seq/day_seq 序不誤植）。
3. **視窗函式含 frame clause 1:1 可攜**：單列 partition 空框架 `COALESCE(SUM OVER ..., 0)` 正確產生 lo=0
   （WINDOWFN-001/002 真庫）。
4. **is_cr 三值邏輯 MSSQL == PG**：真庫確認（CRFILTER-001~003），非憑訓練知識假設。
5. **`WITH ... UPDATE r SET ... FROM ... INNER JOIN cte`** T-SQL 語法正確執行、不拋 `Invalid object name`
   （三道 UPDATE 全綠）。

## 業務級 EQ 結論
**JS golden oracle（`distributeStage3to4`）↔ MSSQL 下推（`runStage3to4RationSqlMssql`）逐列四元組
（dept_id / emplid / emplid_deptid / assignday）精確等價（誤差 0），無業務級不符。** 涵蓋基準多課多員工
多工作日（EQ-001）、多 Tier（EQ-002）、無 ration/無員工 fallback（EQ-003/004）、**含 CR 預指派混合情境
（EQ-005：CR 案件不入 dept/empl 配額扣量、但納入 ASSIGNDAY 散佈，與 JS `crPreassigned` 參數等價）**。

## 偏差（deviations）與發現

1. **🔴 WINDOWFN-003 單一工作日邊界：MSSQL 加 COALESCE 修正空框架 NULL（刻意與 PG 分歧、收斂至 JS
   golden oracle）**。ASSIGNDAY 最末日 `take = et.total - SUM(...) OVER (ROWS BETWEEN UNBOUNDED PRECEDING
   AND 1 PRECEDING)`：當工作日只有 1 天（`lastIdx=0`）時最末日框架為空 → `SUM` 回 NULL → `total - NULL =
   NULL` → assignday 保持 NULL。**此為 PG 版既有 latent bug**（PG 版此處亦無 COALESCE），但 production 月曆
   恆有多工作日（~20 天）故從不觸發。依 **AD §4.1「等價目標為 JS golden oracle 而非 PG」**，MSSQL 版於此處
   加 `COALESCE(..., 0)` 使單工作日邊界亦與 JS oracle 逐列等價（`distributeStage3to4` 之最末日吸收
   `take = ordered.length - idx`）；**多工作日情境 COALESCE 為 no-op**（EQ/ASGD 20 工作日案例不受影響、
   逐列等價已驗）。此為 P3c 唯一「MSSQL 與 PG 行為分歧」處，且分歧方向為「MSSQL 正確、PG latent bug」；
   已保留 PG 檔 byte-identical、**不回頭修 PG**（cutover 前 PG 零風險原則 + production 不觸發）。**非業務級
   封鎖項**（單工作日之月份不存在）。
2. **P3b DISPATCH-003 test 連帶更新（非行為變更）**：`executeStage2to3PushdownMssql` 契約由「僅計分」擴為
   「計分 + 比例分派三步」，新增相依 `calendarRepo`/`deptPctRepo`/`emplSetRepo`/`rationWarnings`。P3b spec
   之 DISPATCH-003（以 `Object.create` 手建 svc 直呼私有方法驗證計分寫入）補上述 4 個 stub（比例分派輸入
   皆空 → 不影響 score 斷言）。此為共用方法契約擴增之必要回歸修正，比照 P3b 當初擴 strategy enum 時連帶更新
   `assignment-run-pipeline-gate.bugfix.spec` 之既有模式。

## Blocking Issues
無。DECIMAL 精度 + DISPATCH 呼叫鏈 + VALUES-CTE + UPDATE...FROM + TOP + 視窗函式 + is_cr 三值全落實、
56 case 全綠（真 MSSQL）、tsc 乾淨、PG 兩核心檔 byte-identical、SQLite/pipeline 服務層/P3a/P3b 無回歸。

**範圍外後續（P3d/P3e，非本輪）**：`cr-priority-sql.ts`（3d CR 優先分派）之 mssql 化未移植 → mssql 月名單分派
之 CR 前置動態指派（cr_id 寫 emplid、失效清空）尚未接線（is_cr 由 Stage 1 帶入後保留、無 CR 重指派）；
`fn_calc_tier_level`（3e）收尾。真實月重跑跨引擎逐列比對（MONTHRUN-DIFF）比照 P3b 前例待 P3d 完成 mssql
全鏈後以 manual/script 執行。
