---
type: test-design-infrastructure
test-spec-id: AD-E07-42-P3d
feature_name: MSSQL 全面遷移 P3d — CR 優先分派 raw SQL 引擎移植（cr-priority-sql.ts MSSQL 化；JS↔MSSQL 逐列六元組等價；步驟 1 單表 UPDATE 日期轉型 + 步驟 2 UPDATE...FROM INNER JOIN + 步驟 3 CTE/ROW_NUMBER/UPDATE...FROM 三重疊加旗艦 + per-list cr_enabled 閘控 + dispatch 第四步接線由負轉正）
priority: P0-MVP
related_spec:
  - /docs/specs/implementation-log/AD-E07-42-mssql-p3-raw-sql-engine.md（§2.4 CR 優先分派逐站點方言轉換清單、§4 EQ 等價測試策略、§5 P3d 範圍/DoD、§7 不變式 I-MSSQL-ENGINE-EQ-01）
  - /docs/specs/implementation-log/AD-E07-42-P3c-impl.md（Stage 3/4 已完成落地事實：Blocking Issues「範圍外後續（P3d/P3e，非本輪）」段落明文記錄 `cr-priority-sql.ts`（3d CR 優先分派）之 mssql 化未移植、mssql 月名單分派之 CR 前置動態指派尚未接線；P3c DISPATCH-003 現行為刻意設計之負向守門，本文件為其正式閉環——翻轉為正向 MUST-FIX 要求）
  - apps/api/src/modules/assignment/stage1/cr-priority-sql.ts（`runCrPrioritySql`：crEnabled=false 分支 L61-72、步驟 1 逾2年清空 L80-93、步驟 2 離職清空 L95-110、步驟 3 CR 優先指派 L112-141，PG 現行實作，本文件全部站點逐行核對之基準）
  - apps/api/src/modules/assignment/stage1/cr-priority.ts（`applyCrPriority`/`computeCrSysDates`，JS golden oracle，純函式無 DB 依賴，EQ 群組比對基準）
  - apps/api/src/modules/assignment/stage1/stage3to4-ration-sql-mssql.ts（P3c 落地產物：UPDATE...FROM 重構手法「target 併入 FROM + join key 入 INNER JOIN ON、WHERE 僅保留 run_id/list_no 範圍限定」+ VALUES-CTE derived table 包裝手法，本文件 STEP2/STEP3 UPDATE...FROM 轉換直接沿用同一手法）
  - apps/api/src/modules/assignment/services/assignment-run-pipeline.service.ts（`executeStage2to4Pushdown:1015-1104`〔PG 完整四步範本：`runStage2and3Sql`→`clearStage3Fields`→`runCrPrioritySql`(L1061-1066)→`runStage3to4RationSql`〕、`executeStage2to3PushdownMssql:1123-1204`〔mssql 現行三步，L1169-1170 明文「刻意不呼叫 PG-only 之 runCrPrioritySql（DISPATCH-003 負向守門）」，本文件核心缺口所在〕、`resolveStage2to4Strategy`）
  - apps/api/src/modules/assignment/stage1/__tests__/cr-priority-pushdown.pg.spec.ts（GATE/STEP1/STEP2/STEP3/DEDUCT/EQ/IDEM/S2CLEAN/S1SRC/ORDER-002/ASGD-CR 群組之 MSSQL 對應版本模板）
  - apps/api/src/database/migrations/mssql/1751884800000-MssqlBaselineSchema.ts（test-designer 逐行查證：`ob_monthly_run_result.appl_date` = **datetime2**、`cr_id` = varchar(20)、`cr_nm` = varchar(50)、`is_cr` = varchar(1)；`ob_emphire.resign_date` = date、`emp_id` = varchar(10)；`ob_empl_set.deptid_m` = varchar(50)、`emplid` = varchar(6)、`ration` = numeric(10,2)）
  - apps/api/src/common/database/column-types.ts（`dateColumnType`：`appl_date` 之 PG `timestamp` / MSSQL `datetime2` 對照來源，本文件 §七 DATECAST 群組核心查證依據）
covers: []
spec_version: "1.0"
date: 2026-07-08
last_updated: 2026-07-08
---

# AD-E07-42 P3d：MSSQL 全面遷移 — CR 優先分派 raw SQL 引擎移植 — 測試設計

> 本文件覆蓋 AD-E07-42「MSSQL 全面遷移 P3（Raw SQL 引擎移植）」之 **P3d 切片**（AD §2.4 CR 優先分派逐站點清單 + §5 P3d 範圍/DoD）。P3 不經 spec-writer（AD §5「是否需要 spec-writer（RESOLVED：不需要）」已裁定，本輪不重複論證）。
>
> **明確排除**：3e `fn_calc_tier_level` 收尾，不在本文件範圍。P3a（Stage 1 篩選）+ P3b（Stage 2~3 計分）+ P3c（Stage 3/4 比例分派）已完成，本文件視為已驗證黑盒依賴（案件已在 `ob_monthly_run_result` 內、已有 `tier_level`、Stage 3/4 raw SQL 下推已可正確執行）。
>
> **★ test-designer 逐檔查證發現之關鍵事實（本文件測試設計之核心依據）**：
>
> 1. **🔴🔴 DISPATCH 核心缺口，P3c impl log 已白紙黑字記錄之已知缺口，本文件為其正式閉環**：test-designer 直接查證 `assignment-run-pipeline.service.ts:1123-1204` 之 `executeStage2to3PushdownMssql`（P3c 落地產物），確認其現行僅三步（① `runStage2and3SqlMssql` ② `clearStage3Fields` ③ `runStage3to4RationSqlMssql`），L1169-1170 明文註解「⚠️ 刻意**不**呼叫 PG-only 之 CR 前置下推（P3d 範圍；DISPATCH-003 負向守門）」。對照 PG 完整鏈路 `executeStage2to4Pushdown:1015-1104`（`runStage2and3Sql`→`clearStage3Fields`→`runCrPrioritySql`（L1061-1066）→`runStage3to4RationSql`，四步），mssql 路徑缺第三步。P3c `AD-E07-42-P3c-impl.md` Blocking Issues 段落已自陳「mssql 月名單分派之 CR 前置動態指派（cr_id 寫 emplid、失效清空）尚未接線（is_cr 由 Stage 1 帶入後保留、無 CR 重指派）」。本文件已將 P3c 之 DISPATCH-003（負向守門，MUST-FIX 要求「不呼叫」）**翻轉為正向 MUST-FIX 要求（DISPATCH-001，要求「必須呼叫」）**，逼實作方擴充呼叫鏈為四步，順序須對稱 PG 之 I-CR-ORDER-01（清除 → CR 前置 → 比例分派）。
> 2. **🔴🔴 日期型別查證逆轉——appl_date 確實需要日期方言轉換（與 P3c ASSIGNDAY 查證結論相反，不可類推）**：P3c 曾查證 `ob_monthly_run_result.assignday` 為 `varchar(100)`、不需任何日期轉換，並記錄「該類轉換實際發生於 §2.1/§2.4 之他檔」。test-designer 本輪逐行查證 `1751884800000-MssqlBaselineSchema.ts`，確認 **`ob_monthly_run_result.appl_date` 型別為 `datetime2`（非 varchar）**，且來源 entity（`ob-monthly-run-result.entity.ts:91`）使用 `dateColumnType`（`column-types.ts`：PG=`timestamp`、MSSQL=`datetime2`），PG 側 `appl_date` 亦非 `date` 而是 `timestamp`。故 `cr-priority-sql.ts` 步驟 1 之 `appl_date < :twoYearsAgo::date` **確實是需要方言轉換的真實站點**（`CAST(:twoYearsAgo AS DATE)`），此點與 P3c 之查證方向相反，不可因「同專案前一切片查出日期欄位為 varchar 不需轉換」而類推假設本切片亦然——已獨立立 §七 DATECAST 群組記錄此逆轉發現，防止 tdd-implementation 誤植省略轉換。`ob_emphire.resign_date` 則確認為原生 `date` 型別（PG/MSSQL 皆是），與 `sysDate` 之 `:sysDate::date` 轉換屬低風險（DATE↔DATE 比對）。
> 3. **🔴🔴 步驟 3 為本文件單一陳述式風險最高站點（AD §2.4 明文標示「建議此站點安排最高覆蓋率測試」）**：`runCrPrioritySql` 步驟 3（`cr-priority-sql.ts:112-141`）同時疊加三種轉換手法——CTE（`empl_set_ranked`/`first_dept`）+ 視窗函式（`ROW_NUMBER() OVER (PARTITION BY emplid ORDER BY deptid_m ASC)`）+ UPDATE...FROM 重構（PG「目標就地宣告別名」→ MSSQL「target 併入 FROM + join key 入 INNER JOIN ON」）。三者任一環節轉換錯誤皆可能連帶影響 I-DET-CR-01（決定性 deptid_m ASC 取第一筆）之正確性，已獨立立 §五 STEP3 群組並設計旗艦案例 STEP3-005。
> 4. **🔴 查證推翻類推假設：`empl_set_ranked` CTE 不需要 P3c 式 VALUES-CTE derived table 包裝**：P3c `stage3to4-ration-sql.ts` 之三處 CTE（`dept_pct`/`empl_set`/`cal`）皆源自 PG `WITH x(cols) AS (VALUES ...)`（PG 專屬 CTE 直接接 VALUES 語法糖），需改寫為 `WITH x(cols) AS (SELECT * FROM (VALUES ...) AS v(cols))`。本文件之 `empl_set_ranked` CTE 主體為 `SELECT emplid, deptid_m, ROW_NUMBER() OVER (...) FROM ob_empl_set WHERE ...`——**直接對真實表 SELECT，非 PG VALUES 語法糖**，T-SQL CTE 本即要求主體為 SELECT，此站點**不需要**任何額外包裝改寫。已於 §一 GATE-006 記錄此查證結論，避免下游誤以為「凡是 CTE 皆需比照 P3c 手法包裝」而做多餘改寫。
> 5. **🔴 查證推翻類推假設：本檔全程無 ration 之 DECIMAL CAST 算術，不適用 P3b/P3c 之 DECIMAL 精度風險**：`cr-priority-sql.ts` 步驟 3 僅以 `ration > 0` 作 `WHERE` 過濾（`ob_empl_set` 內建表過濾，非透過 `VALUES` CTE 傳入之參數化字面值），全檔**無任何 `CAST(:param AS numeric)` 站點**，故不存在 P3b `DECIMAL-LOANRATE-001`/P3c `DECIMAL-RATION-001` 同型之裸 `NUMERIC(18,0)` 精度截斷風險。已於 §一 GATE-004 記錄此查證結論，避免 tdd-implementation 依循「P3 系列慣例」誤植不必要的 `NUMERIC(18,4)` 轉型。
> 6. **🔴 查證推翻任務假設：CR 優先分派本身不產生任何 warning/skipped_cases**：`runCrPrioritySql` 回傳型別為 `Promise<void>`、`applyCrPriority`（JS oracle）回傳 `CrAssignment[]`（無 warning 陣列欄位），兩者皆為**純粹確定性 UPDATE/映射**，不若 `stage3to4-ration.ts`/`stage3to4-ration-sql.ts` 之 `RationWarning[]`（`STAGE3_NO_DEPT_RATION`/`STAGE4_NO_EMPL_WARN`/`ASSIGNDAY_NO_CALENDAR_WARN`）机制。`skipped_cases.warnings[]`/`warning_summary` 屬 Stage 3/4（F101/F102 DEDUCT）語意，非 CR 前置步驟本身。已於 §十 CRWARN 群組記錄此查證結論並改設計「CR 前置步驟動態產生之 `is_cr='Y'` 案件如何正確影響 Stage 3/4 既有 warning 基數」之交互回歸測試（銜接 P3c CRFILTER 群組先前以手動 seed 模擬之驗證，本輪首次由真實機制產生）。
> 7. **Harness 首次直接以 raw SQL JOIN 觸及 `ob_emphire`/`ob_empl_set` 兩張表（P3 系列新前例）**：P3a~P3c 之 `ob_dept_pct`/`ob_empl_set`/`ob_calendar`/`ob_emphire` 皆由呼叫端 TypeORM `.find()` 查詢後轉陣列傳入 raw SQL 函式（dialect-agnostic 路徑），本檔則直接以 `JOIN ob_emphire e`（步驟 2）與 `FROM ob_empl_set`（步驟 3 CTE）對兩張表發出 raw SQL。兩表皆已於 P3c 查證之 dbo 共用表清單內存在（`1751884800000-MssqlBaselineSchema.ts` 已建表），**不需要**額外自建，但需獨立 regression 確認（§一 GATE-001）。
> 8. **識別碼引號風格無風險**：逐行掃描確認 `cr-priority-sql.ts` 全檔無任何雙引號識別碼字面，與 P3c 同型結論，不需重複 QUOTE 決策關卡。

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件全部 + `AD-E07-42-mssql-p3-raw-sql-engine.md`（§2.4、§5 P3d、§7）+ `AD-E07-42-P3c-impl.md`（Blocking Issues「範圍外後續」段落，DISPATCH 群組直接依賴）+ `cr-priority-sql.ts`/`cr-priority.ts`（PG 現行實作，逐字沿用不變）+ `cr-priority-pushdown.pg.spec.ts`（案例模板）+ `stage3to4-ration-sql-mssql.ts`（UPDATE...FROM 重構手法直接沿用範本）+ `assignment-run-pipeline.service.ts`（`executeStage2to4Pushdown` PG 完整鏈路範本 + `executeStage2to3PushdownMssql` 現行缺口所在） |
| QA / Tester | 本文件 + `risks-and-gaps.md`（MSSQL P3d 風險段落） |
| DevOps / CI/CD | 本文件「零、測試環境與 Harness 設計」（本輪首次直接 raw SQL 觸及 `ob_emphire`/`ob_empl_set`，仍屬既有共用表，免自建） |

---

## 零、測試環境與 Harness 設計

### 0.1 沿用既有 Harness 元件

`mssql-env-preload.ts`（`restoreDbType`/`MSSQL`/`mssqlPortReachable`/`SKIP_REASON`）不新增；連線設定沿用 `CDMP_TEST`。不可達 → 整檔 `describe.skip` + 明確 `SKIP_REASON`（不假造綠燈）。`vi.setConfig({ testTimeout: 60000 })`（沿用 P3a/P3b/P3c/P4 系列教訓）。

### 0.2 Harness 範圍（沿用「共用既有表」策略，不需自建；首次直接觸及 ob_emphire/ob_empl_set）

依 §頂部查證發現 7，本檔需 4 張表皆已存在於 MSSQL baseline（`1751884800000-MssqlBaselineSchema.ts`）：`assignment_run`（FK 前置）、`ob_monthly_run_result`（UPDATE 目標，三步驟共用）、`ob_emphire`（步驟 2 JOIN 來源）、`ob_empl_set`（步驟 3 CTE 來源）。四者皆屬 P3a `AD-E07-42-P3a-impl.md`/P3c 已確認之 dbo 共用表集合，**不需要**自建。

- **beforeAll**：確認四表存在（`OBJECT_ID` 探測，作為 §一 GATE-001 之 regression 守門，非自建前提）；連線初始化。
- **beforeEach**：`DELETE FROM ob_monthly_run_result WHERE list_no LIKE 'P3D%'`；`DELETE FROM ob_empl_set WHERE list_no LIKE 'P3D%'`；`DELETE FROM ob_emphire WHERE emp_id LIKE 'P3D%'`；`DELETE FROM assignment_run WHERE run_id IN (P3D_RUN_ID_1, P3D_RUN_ID_2)`；重新 INSERT 兩筆 `assignment_run` 種子列（`project_workym='202607'`, `status='running'`）。
- **afterAll**：僅執行上述前綴/固定鍵值 `DELETE`（**絕不** `DROP`/`TRUNCATE` 四張共用表，比照 P3a/P3c §0.2 政策）。
- **隔離鍵慣例**：`run_id` 固定測試專用 UUID 常數 `P3D_RUN_ID_1`/`P3D_RUN_ID_2`；`list_no` 前綴 `P3D%`；`emp_id`（`ob_emphire`）與 `deptid_m`/`emplid`（`ob_empl_set`）前綴或值域比照 PG spec 既有測試值（`E001`~`E999`/`XVE1`/`XVE2`），由 tdd-implementation 決定是否另加 `P3D` 前綴以強化隔離。

### 0.3 決定性驗證前提

本檔核心不變式為「決定性排序鍵無 `NEWID()`/random」（I-DET-CR-01 / I-DET-01，承 F102/AD-E07-30）；MSSQL 版須確認 `ROW_NUMBER() OVER (PARTITION BY emplid ORDER BY deptid_m ASC)` 於 mssql 上同樣產生穩定、可重複之結果（非僅語法可執行），且與 PG 版本之 collation/字串排序行為一致——**待 tdd-impl 真庫驗證**，非憑訓練知識假設兩資料庫此處排序行為必然相同（比照 P3c §0.3 同型記錄）。EQ 群組之逐列 `toEqual`（非集合比對）即隱含驗證此點。

---

## 一、GATE — 前置決策關卡與環境事實核對

### TS-MSSQL-P3D-GATE-001：四表存在性 regression 確認（沿用 P3a/P3c 共用表結論，非自建前提）
- **Related Requirement**：§頂部查證發現 7
- **Test Type**：Regression / Precondition
- **Expected Result**：`OBJECT_ID('dbo.assignment_run','U')`／`OBJECT_ID('dbo.ob_monthly_run_result','U')`／`OBJECT_ID('dbo.ob_emphire','U')`／`OBJECT_ID('dbo.ob_empl_set','U')` 四者皆非 NULL（P3a/P3c 已建，本輪僅 regression 確認）

---

### TS-MSSQL-P3D-GATE-002（🔴🔴 核心事實查證）：appl_date 型別確認為 datetime2（與 P3c ASSIGNDAY 結論相反）
- **Related Requirement**：§頂部查證發現 2；`1751884800000-MssqlBaselineSchema.ts`；`column-types.ts`
- **Test Type**：Static Fact Confirmation（MUST-FIX 前置，非阻擋但影響後續轉換是否可省略之判斷）
- **Expected Result**：確認 MSSQL baseline 之 `ob_monthly_run_result.appl_date` 為 `datetime2` 型別（PG 對應為 `timestamp`，經 `dateColumnType` helper 產生），**非** varchar；記錄此查證結論於 impl log，明確區分「本欄位確實需要日期方言轉換」與 P3c「assignday 為 varchar 不需轉換」之相反結論，防止類推誤判

---

### TS-MSSQL-P3D-GATE-003：resign_date / sysDate 型別確認皆為 date（低風險核對）
- **Related Requirement**：`ob_emphire.resign_date`；`cr-priority-sql.ts:106`
- **Test Type**：Static Fact Confirmation
- **Expected Result**：確認 `ob_emphire.resign_date` 於 PG/MSSQL 兩側皆為原生 `date` 型別（非 timestamp/datetime2），`resign_date < :sysDate::date` 之 mssql 轉換（`CAST(:sysDate AS DATE)`）為 DATE↔DATE 同型比對，低風險（區別於 GATE-002 之 DATE↔DATETIME2 隱式轉換情境）

---

### TS-MSSQL-P3D-GATE-004（🔴 查證推翻類推假設）：本檔無 ration DECIMAL CAST 站點，不適用 P3b/P3c 精度風險
- **Related Requirement**：§頂部查證發現 5
- **Test Type**：Static Fact Confirmation / Decision Gate
- **Expected Result**：逐行掃描確認 `cr-priority-sql.ts` 全檔（含步驟 3）**零命中**任何 `CAST(:param AS numeric)` 或裸 `numeric` 字面；`ration` 僅作為 `ob_empl_set` 內建表 `WHERE ration > 0` 過濾條件（非參數化算術輸入）。記錄此查證結論，MSSQL 版本**不需要**引入 `NUMERIC(18,4)` 或任何精度宣告，避免 tdd-implementation 依循 P3b/P3c 慣例誤植不必要的轉型

---

### TS-MSSQL-P3D-GATE-005：crEnabled=false 分支方言中立性決策關卡（是否需要 mssql 版本）
- **Related Requirement**：`cr-priority-sql.ts:61-72`（單表 `UPDATE ... SET is_cr='N', updated_at=CURRENT_TIMESTAMP WHERE ... AND (is_cr IS NULL OR is_cr <> 'N')`，無 JOIN、無日期比較）
- **Test Type**：Decision Gate（不預設答案，待 tdd-impl 真庫驗證，比照 P3c DISPATCH-002 之 `clearStage3Fields` 決策先例）
- **Expected Result**：此分支不含任何 PG-only 語法字面（無 `||`/`::`/`RETURNING`/`ON CONFLICT`/`LIMIT`/JOIN），`CURRENT_TIMESTAMP` 為 ANSI 保留字。**待 tdd-impl 真庫驗證**：此分支是否可直接對 MSSQL 連線執行而不需任何修改（若驗證通過，記錄「直接複用 PG 版此分支，不建 mssql 專版」之決策；若失敗，記錄實際錯誤訊息）於 impl log Architectural Decisions 段落

---

### TS-MSSQL-P3D-GATE-006（🔴 查證推翻類推假設）：empl_set_ranked CTE 不需要 VALUES-CTE derived table 包裝
- **Related Requirement**：§頂部查證發現 4；`cr-priority-sql.ts:116-124`
- **Test Type**：Static Fact Confirmation
- **Expected Result**：確認 `empl_set_ranked` CTE 主體為 `SELECT emplid, deptid_m, ROW_NUMBER() OVER (...) FROM ob_empl_set WHERE list_no=:listNo AND ration>0`——直接對真實表 `SELECT`，非 P3c `dept_pct`/`empl_set`/`cal` 三處之 PG `WITH x(cols) AS (VALUES ...)` 語法糖。T-SQL CTE 本即要求主體為合法 `SELECT`，此站點**不需要**任何 derived table 包裝改寫，記錄此查證結論避免下游誤植多餘轉換

---

## 二、DISPATCH — mssql 月名單分派鏈路第四步接線（🔴🔴 本文件核心缺口，P3c DISPATCH-003 之正式閉環，由負轉正）

### TS-MSSQL-P3D-DISPATCH-001（🔴🔴 MUST-FIX，對現行未修改程式碼刻意設計為紅燈，P3c 負向守門於此翻轉為正向要求）：`executeStage2to3PushdownMssql` 須擴充呼叫 CR 前置分派
- **Related Requirement**：§頂部查證發現 1；`assignment-run-pipeline.service.ts:1123-1204`（現行三步）；I-CR-ORDER-01
- **Test Type**：Regression / MUST-FIX Gate
- **Preconditions**：`env.DB_TYPE='mssql'`；Stage 1 已 INSERT 案件（含 `cr_id`/`cr_nm`/`is_cr`/`appl_date`）、Stage 2/3 已寫 `tier_level`（P3a/P3b/P3c 黑盒依賴）
- **Steps**：以 `vi.spyOn` 掛在 `runCrPrioritySqlMssql`（或等效 tdd-implementation 命名之 mssql 版本函式，預期新檔 `cr-priority-sql-mssql.ts`）上，執行完整 mssql 月名單分派管線
- **Expected Result**：`runCrPrioritySqlMssql` **應被呼叫**（現行未修改程式碼下必為紅燈——`executeStage2to3PushdownMssql` 現行僅三步，`clearStage3Fields` 後直接呼叫 `runStage3to4RationSqlMssql`，中間無 CR 前置呼叫），逼實作方將呼叫鏈擴充為對稱 PG `executeStage2to4Pushdown` 之四步（`runStage2and3SqlMssql`→`clearStage3Fields`→`runCrPrioritySqlMssql`→`runStage3to4RationSqlMssql`）

---

### TS-MSSQL-P3D-DISPATCH-002（🔴 I-CR-ORDER-01 mssql 對稱）：四步呼叫順序正確性（清除 → CR 前置 → 比例分派，非任意順序）
- **Related Requirement**：I-CR-ORDER-01；對稱 PG spec ORDER-002
- **Test Type**：MUST-FIX Gate
- **Steps**：以呼叫順序記錄（spy 呼叫序 array 或行號比較）驗證 `clearStage3Fields` 呼叫時序早於 `runCrPrioritySqlMssql`，`runCrPrioritySqlMssql` 早於 `runStage3to4RationSqlMssql`
- **Expected Result**：三者呼叫順序固定為「清除 → CR 前置 → 比例分派」，若順序錯置（如 CR 前置先於清除），CR 步驟 3 寫入的 `emplid`/`dept_id` 會被 `clearStage3Fields` 覆蓋清空——此案例確認正確順序，行為驗證見 §十一 EQ-004

---

### TS-MSSQL-P3D-DISPATCH-003（🔴 spy 驗證，MUST-FIX）：三分支互斥（postgres/mssql/其餘）CR 前置版本不誤觸對方
- **Related Requirement**：同 P3a/P3b/P3c 已反覆出現之 DISPATCH 陷阱同型延伸；`resolveStage2to4Strategy`
- **Test Type**：Regression / MUST-FIX Gate
- **Steps**：以 `{postgres, mssql, undefined}` 三種 `DB_TYPE` 組合執行含 CR 前置之完整月名單分派鏈路，spy `runCrPrioritySql`（PG 版）／`runCrPrioritySqlMssql`（mssql 版）
- **Expected Result**：`postgres` 呼叫 PG 版且僅呼叫 PG 版；`mssql` 呼叫 mssql 版且僅呼叫 mssql 版；兩者互斥，不重疊、不誤呼叫對方版本

---

### TS-MSSQL-P3D-DISPATCH-004（DoD 核心觀察）：完整 mssql 月名單分派後 CR 案件 emplid/dept_id/is_cr 不再恆維持 Stage 1 帶入原值
- **Related Requirement**：§頂部查證發現 1；P3c impl log「範圍外後續」段落之已知缺口解除驗證
- **Test Type**：Regression（DoD 核心）
- **Steps**：以 §五 STEP3 群組任一案例之 seed 資料（`cr_id` 有值 + `ob_empl_set` 有對應 ration），經完整 mssql 月名單分派管線（含本輪新接線之 CR 前置）執行
- **Expected Result**：`ob_monthly_run_result` 讀回列之 `emplid`/`dept_id`/`emplid_deptid`/`is_cr` 四欄反映 CR 前置動態指派結果（P3c 當下之已知狀態為「is_cr 由 Stage 1 帶入後保留、無 CR 重指派」），至少存在因 CR 前置而改變之列且與 §十一 EQ 群組之 JS oracle 逐列相符

---

### TS-MSSQL-P3D-DISPATCH-005：PG-only 呼叫路徑零殘留確認
- **Related Requirement**：AD §1.1「PG 檔完全不動、平行 -mssql.ts 新檔」原則
- **Test Type**：Static Guard
- **Expected Result**：`executeStage2to3PushdownMssql`（mssql 路徑）之呼叫鏈**不含**對 PG 版 `runCrPrioritySql`（`cr-priority-sql.ts`）之任何 import/呼叫；新增平行檔案 `cr-priority-sql-mssql.ts`，PG 原始碼零改動（呼應 §十三 REG-001）

---

## 三、STEP1 — 逾2年清空（單表 UPDATE，日期轉型為唯一方言差異）

### TS-MSSQL-P3D-STEP1-001：appl_date < twoYearsAgo 清空（嚴格小於，已知具體日期）
- **Related Requirement**：`cr-priority-sql.ts:80-93`；BR-F102-04
- **Test Type**：Positive / Boundary
- **Preconditions**：`sysDate='2026-07-01'`（`twoYearsAgo='2024-07-01'`）；案件 `cr_id='E010'`、`appl_date='2024-06-30'`（< twoYearsAgo）
- **Expected Result**：`cr_id`/`cr_nm` 清為 NULL、`is_cr='N'`

### TS-MSSQL-P3D-STEP1-002：appl_date = twoYearsAgo 不清（邊界相等）
- **Related Requirement**：同上；嚴格小於邊界
- **Test Type**：Boundary
- **Expected Result**：`appl_date='2024-07-01'`（= twoYearsAgo）案件 `cr_id` 維持原值、`is_cr` 不變

### TS-MSSQL-P3D-STEP1-003（🔴 GATE-002 對應功能驗證）：CAST(:twoYearsAgo AS DATE) 正確轉換，不拋語法錯誤
- **Related Requirement**：§頂部查證發現 2；`appl_date < :twoYearsAgo::date` → `CAST(:twoYearsAgo AS DATE)`
- **Test Type**：Regression / MUST-FIX Gate
- **Expected Result**：MSSQL 版 SQL 正確執行，不因 `appl_date`（datetime2）與轉換後 DATE 常值比較而拋型別錯誤或隱式轉換失敗

### TS-MSSQL-P3D-STEP1-004：cr_id IS NULL 案件不受影響
- **Related Requirement**：`cr-priority-sql.ts:87`（`cr_id IS NOT NULL` 前置條件）
- **Test Type**：Negative
- **Expected Result**：`cr_id=NULL` 之案件不觸發 UPDATE（無需比對 appl_date）

### TS-MSSQL-P3D-STEP1-005：appl_date IS NULL 案件不清空
- **Related Requirement**：`cr-priority-sql.ts:88`（`appl_date IS NOT NULL` 前置條件）
- **Test Type**：Boundary / NULL 傳播
- **Expected Result**：`cr_id` 有值但 `appl_date=NULL` 之案件不被步驟 1 清空（無可比較日期，NULL < 任何值恆為 UNKNOWN）

### TS-MSSQL-P3D-STEP1-006：ob_pool_data_list 原始資料不受影響
- **Related Requirement**：對稱 PG spec STEP1-003；I-CR-COLSRC-01
- **Test Type**：Regression
- **Expected Result**：CR 步驟限定 `ob_monthly_run_result` 工作集 UPDATE，來源 `ob_pool_data_list` 之 `cr_id`/`is_cr` 維持原值不受影響

---

## 四、STEP2 — 離職清空（UPDATE...FROM 重構 + INNER JOIN 語意）

### TS-MSSQL-P3D-STEP2-001：resign_date < sysDate 清空
- **Related Requirement**：`cr-priority-sql.ts:95-110`；BR-F102-06
- **Test Type**：Positive / Boundary
- **Expected Result**：`resign_date='2026-06-15'`（< sysDate `2026-07-01`）之 `cr_id` 對應員工案件清空

### TS-MSSQL-P3D-STEP2-002：resign_date = sysDate 不清（邊界相等）
- **Related Requirement**：同上；嚴格小於邊界
- **Test Type**：Boundary
- **Expected Result**：`resign_date='2026-07-01'`（= sysDate）不清空

### TS-MSSQL-P3D-STEP2-003：在職（resign_date IS NULL）不清
- **Related Requirement**：同上
- **Test Type**：Boundary / NULL 傳播
- **Expected Result**：`resign_date=NULL`（在職）不清空

### TS-MSSQL-P3D-STEP2-004（🔴 BR-F102-08 MUST-FIX）：cr_id 查無 ob_emphire（INNER JOIN 不命中）不清空，案件仍可流入 STEP3
- **Related Requirement**：BR-F102-08；`cr-priority-sql.ts:101`（`FROM ob_emphire e` 隱式 INNER JOIN）
- **Test Type**：MUST-FIX Gate
- **Preconditions**：`ob_emphire` 無 `emp_id='E999'` 記錄；案件 `cr_id='E999'`
- **Expected Result**：INNER JOIN 不命中 → UPDATE 不影響此列，`cr_id` 維持 `'E999'`、`is_cr` 不變；此案件於 §五 STEP3 若 `ob_empl_set` 有 `E999` 之 ration 記錄，仍可被指派（獨立於本步驟之外的路徑，見 STEP3-004）

### TS-MSSQL-P3D-STEP2-005（🔴 MUST-FIX）：UPDATE...FROM 正確轉換（target 併入 FROM + INNER JOIN ON r.cr_id=e.emp_id）
- **Related Requirement**：`stage3to4-ration-sql-mssql.ts` UPDATE...FROM 手法直接沿用；PG「就地宣告別名不入 FROM」語法差異
- **Test Type**：Regression / MUST-FIX Gate
- **Expected Result**：T-SQL 形式 `UPDATE r SET cr_id=NULL, cr_nm=NULL, is_cr='N', updated_at=CURRENT_TIMESTAMP FROM ob_monthly_run_result r INNER JOIN ob_emphire e ON r.cr_id = e.emp_id WHERE r.run_id=:runId AND r.list_no=:listNo AND e.resign_date < CAST(:sysDate AS DATE)`（join key 移入 `INNER JOIN ON`、`WHERE` 保留範圍限定鍵 + 過濾條件），正確執行不拋 `Invalid object name`

### TS-MSSQL-P3D-STEP2-006：CAST(:sysDate AS DATE) 正確轉換（DATE↔DATE 同型比對，低風險核對）
- **Related Requirement**：GATE-003
- **Test Type**：Regression
- **Expected Result**：`resign_date`（原生 date）與 `CAST(:sysDate AS DATE)` 比對正確，無隱式轉換異常

---

## 五、STEP3 — CR 優先指派（🔴🔴 CTE + ROW_NUMBER + UPDATE...FROM 三重疊加，本文件單一陳述式最高風險站點）

### TS-MSSQL-P3D-STEP3-001：ration>0 才指派
- **Related Requirement**：`cr-priority-sql.ts:112-141`；BR-F102-07
- **Test Type**：Positive
- **Expected Result**：`ob_empl_set` 有 `ration=30`（>0）記錄之 `cr_id` 案件 → `emplid=cr_id`、`dept_id`/`emplid_deptid=deptid_m`、`is_cr='Y'`

### TS-MSSQL-P3D-STEP3-002：ration=0/無記錄不指派（維持原值）
- **Related Requirement**：同上
- **Test Type**：Negative
- **Expected Result**：`ration=0` 或 `ob_empl_set` 無對應 `emplid` 記錄之案件，`emplid` 維持 NULL、`is_cr` 維持原值（不改）

### TS-MSSQL-P3D-STEP3-003（🔴🔴 I-DET-CR-01 MUST-FIX，已知具體值斷言）：多筆 deptid_m 取 deptid_m ASC 第一筆
- **Related Requirement**：I-DET-CR-01；`ROW_NUMBER() OVER (PARTITION BY emplid ORDER BY deptid_m ASC)`
- **Test Type**：MUST-FIX Gate（已知具體值，非僅「有值」）
- **Preconditions**：`emplid='E005'` 於 `ob_empl_set` 有兩筆記錄：`deptid_m='XVE2'`（ration=20）與 `deptid_m='XVE1'`（ration=30）
- **Expected Result**：`dept_id='XVE1'`（`XVE1' < 'XVE2'` ASC 排序取第一筆，非依 ration 大小或插入順序），`emplid_deptid='XVE1'`——此為 MUST-FIX 紅燈守門，斷言必須為精確 `XVE1`，非僅「非 NULL」之寬鬆比對

### TS-MSSQL-P3D-STEP3-004：查無 ob_emphire（BR-F102-08）案件仍可 STEP3 指派（獨立於 STEP2 之外的路徑）
- **Related Requirement**：BR-F102-08；銜接 STEP2-004
- **Test Type**：Positive（路徑獨立性驗證）
- **Expected Result**：`cr_id='E999'`（`ob_emphire` 查無）+ `ob_empl_set` 有 `E999` 之 ration>0 記錄 → 步驟 3 正常指派（`emplid='E999'`），不受步驟 2 查無記錄影響

### TS-MSSQL-P3D-STEP3-005（🔴🔴 三重疊加旗艦，AD §2.4 明文「建議此站點安排最高覆蓋率測試」）：CTE + ROW_NUMBER + UPDATE...FROM 完整 worked example
- **Related Requirement**：§頂部查證發現 3；`empl_set_ranked`→`first_dept`→`UPDATE...FROM`
- **Test Type**：MUST-FIX Gate（DoD 核心旗艦）
- **Preconditions**：5 名員工（`E003`/`E005`/`E006`/`E007`/`E999`）於 `ob_empl_set` 之 ration/deptid_m 混合設定（含 `E005` 兩筆 deptid_m、`E007` ration=0）；8 件案件對應不同 `cr_id`（比照 PG spec EQ-006 worked example spec）
- **Expected Result**：8 件案件之 `emplid`/`dept_id`/`emplid_deptid`/`is_cr` 逐案正確（`E003`×3 件皆指派、`E005` 案件依 ASC 取 `XVE1`、`E007` ration=0 不指派、`E999` 查無 emphire 但仍指派），CTE 內部 `rn=1` 過濾 + `UPDATE...FROM` 併發正確、不因表達式疊加產生非預期笛卡兒積或漏派

### TS-MSSQL-P3D-STEP3-006（🔴 MUST-FIX）：UPDATE...FROM 正確轉換（target 併入 FROM + INNER JOIN ON r.cr_id=fd.emplid）
- **Related Requirement**：`stage3to4-ration-sql-mssql.ts` 手法沿用；PG `FROM first_dept fd WHERE r.cr_id = fd.emplid` 語法差異
- **Test Type**：Regression / MUST-FIX Gate
- **Expected Result**：T-SQL 形式 `UPDATE r SET emplid=r.cr_id, dept_id=fd.deptid_m, emplid_deptid=fd.deptid_m, is_cr='Y', updated_at=CURRENT_TIMESTAMP FROM ob_monthly_run_result r INNER JOIN first_dept fd ON r.cr_id = fd.emplid WHERE r.run_id=:runId AND r.list_no=:listNo`（join key 移入 `INNER JOIN ON`、`r.cr_id IS NOT NULL` 於 INNER JOIN 後天然冗餘但可選擇保留於 WHERE 供防禦性可讀性，`emplid=r.cr_id` 之 `r` 別名須正確解析為 UPDATE 目標本身非 CTE），正確執行不拋 `Invalid object name`/`Ambiguous column name`

### TS-MSSQL-P3D-STEP3-007：emplid_deptid 恆等於 dept_id（同一 UPDATE 陳述式內兩欄一致寫入）
- **Related Requirement**：對稱 P3c EMPL-005；防護欄位不同步 bug
- **Test Type**：Regression
- **Expected Result**：任一被步驟 3 指派之案件，`emplid_deptid` 欄位值恆等於同列 `dept_id` 欄位值（皆來自 `fd.deptid_m`，同一來源不應產生不一致）

---

## 六、GATECR — cr_enabled=false 閘控（單表強制清 N，跳過步驟 1-3）

### TS-MSSQL-P3D-GATECR-001：cr_enabled=false 僅執行強制 is_cr='N'
- **Related Requirement**：`cr-priority-sql.ts:61-72`；BR-F102-02
- **Test Type**：Positive / Regression
- **Expected Result**：任一案件（不論 `is_cr` 原值）經 mssql 版本執行後 `is_cr='N'`

### TS-MSSQL-P3D-GATECR-002：cr_id 不被清空（步驟 1-3 不執行，cr_id 維持原值）
- **Related Requirement**：同上；對稱 PG spec GATE-002
- **Test Type**：Regression
- **Expected Result**：`cr_id`（若原有值）於 `cr_enabled=false` 執行後維持不動，`emplid` 維持 NULL（步驟 3 未執行）

### TS-MSSQL-P3D-GATECR-003：全案件入 Stage3/4 比例池（無 CR 扣量，跨切片整合 mssql 四步鏈路）
- **Related Requirement**：對稱 PG spec GATE-006；I-CR-DEDUCT-01 邊界情境
- **Test Type**：Integration / Regression
- **Steps**：`cr_enabled=false` 之名單全案件（皆 `is_cr` 最終為 `'N'`）經完整 mssql 四步鏈路（含 §二 DISPATCH 擴充後之 CR 前置 + P3c 已驗證之 Stage 3/4 比例分派）
- **Expected Result**：全案件正確入池分派（無任何案件因誤判 `is_cr` 被排除），與 P3c 已驗證之 dept/empl 分派邏輯正確銜接

---

## 七、DATECAST — 日期方言轉換查證（🔴🔴 本文件核心紅線之一，appl_date 逆轉 P3c 結論）

### TS-MSSQL-P3D-DATECAST-001（🔴🔴 核心查證結論，記錄式防呆）：appl_date 確為 datetime2，STEP1 之 ::date cast 為必要轉換站點（非可省略）
- **Related Requirement**：§頂部查證發現 2；GATE-002
- **Test Type**：Static Fact Confirmation / Documentation（非阻擋，記錄性，防止與 P3c ASSIGNDAY 結論混淆）
- **Expected Result**：記錄查證結論——與 P3c `GATE-004`（ASSIGNDAY 無需日期轉換）之查證方向**相反**，本檔 `appl_date` 確為 `datetime2` 型別，`:twoYearsAgo::date` 轉換為必要站點，tdd-implementation **不得**因「同專案前一切片查出日期欄位為 varchar」而類推假設本欄位亦不需轉換

### TS-MSSQL-P3D-DATECAST-002：DATE 與 DATETIME2 隱式轉換行為待真庫驗證
- **Related Requirement**：SQL Server 資料型別優先順序（DATE 轉換至 DATETIME2 比對）
- **Test Type**：Decision Gate（不預設答案）
- **Expected Result**：**待 tdd-impl 真庫直接驗證**——`appl_date`（datetime2 欄位）與 `CAST(:twoYearsAgo AS DATE)`（date 常值）比較時，SQL Server 依資料型別優先順序將 DATE 隱式轉換為 DATETIME2（補 00:00:00.0000000 時間分量）進行比對，此行為是否與 PG `timestamp < :twoYearsAgo::date`（PG 將 date 常值提升為 timestamp 於午夜比對）語意完全一致，記錄實測結果於 impl log

### TS-MSSQL-P3D-DATECAST-003（🔴 未驗證假設，記錄式）：appl_date 若含非午夜時間分量對嚴格小於邊界之潛在影響
- **Related Requirement**：GATE-002；測試 fixture 慣例 vs 真實資料寫入慣例
- **Test Type**：Decision Gate（不預設答案，記錄性，非阻擋 P3d DoD）
- **Expected Result**：現行測試 fixture（`cr-priority-pushdown.pg.spec.ts:144`）恆以 `new Date(`${opts.applDate}T00:00:00Z`)` 寫入（午夜時間分量），Stage 1 INSERT 實際來源（`ob_pool_data_list.appl_date`）於生產環境是否可能帶有非午夜時間分量（如原始 legacy 系統之實際下單時間戳記）**未經本輪查證**，若存在非午夜時間分量，`appl_date < twoYearsAgo`（datetime2 全精度比對）與 PG 版本（`timestamp` 全精度比對）語意應仍一致（兩者皆非強制截斷至日期），但與「業務預期以『日』為比較粒度」是否一致待產品面確認；記錄為待查證項，不阻擋本文件 DoD（測試以午夜時間分量之合成 fixture 為準，與 PG spec 現行慣例一致）

---

## 八、UPDATEFROM — 跨 run 污染防線（彙整 STEP2 + STEP3 兩道 UPDATE...FROM）

### TS-MSSQL-P3D-UPDATEFROM-001（🔴 旗艦防污染，對稱 P3b/P3c UPDATEFROM 旗艦案例）：兩個 run_id 共用同一批 cr_id/emplid 設定，互不污染
- **Related Requirement**：I-MSSQL-ENGINE-EQ-01；PG spec IDEM-001/002 精神延伸
- **Test Type**：MUST-FIX Gate（DoD 核心）
- **Preconditions**：`P3D_RUN_ID_1`/`P3D_RUN_ID_2` 各自一份 `ob_monthly_run_result`（PK 含 `run_id`），共用同一份 `ob_emphire`/`ob_empl_set`（`list_no` 相同）；`RUN_ID_1` 執行完整 `runCrPrioritySqlMssql`（步驟 1/2/3），`RUN_ID_2` 尚未執行
- **Expected Result**：`RUN_ID_2` 之列 `cr_id`/`cr_nm`/`is_cr`/`emplid`/`dept_id`/`emplid_deptid` **完全不受** `RUN_ID_1` 之三道 UPDATE 影響（若 STEP2/STEP3 之 `WHERE` 遺漏 `run_id` 範圍限定，會產生跨 run 污染——此案例為直接反證）

### TS-MSSQL-P3D-UPDATEFROM-002：WHERE 範圍限定鍵（run_id+list_no）正確保留於 STEP2/STEP3 兩道 UPDATE 陳述式
- **Related Requirement**：同上；靜態查證輔助
- **Test Type**：Regression / Static Guard
- **Expected Result**：原始碼掃描確認 STEP2/STEP3 兩道 `UPDATE...FROM` 陳述式之 `WHERE` 子句皆包含 `r.run_id = :runId AND r.list_no = :listNo`（範圍限定鍵未被誤移入 `INNER JOIN ON`，僅 join key 本身移入 ON）

---

## 九、WINDOWFN — ROW_NUMBER 決定性與邊界（承 §五 STEP3，獨立分組維持可追溯性）

### TS-MSSQL-P3D-WINDOWFN-001：單一 deptid_m 情境（ROW_NUMBER 唯一列，rn=1 恆成立）
- **Related Requirement**：`empl_set_ranked` CTE；邊界（單列 partition）
- **Test Type**：Boundary
- **Preconditions**：`emplid='E100'` 於 `ob_empl_set` 僅 1 筆記錄（`deptid_m='XVF1'`）
- **Expected Result**：`rn=1` 對唯一列恆成立，`first_dept` 正確取得該筆，無空框架相關語意風險（不同於 P3c `SUM() OVER (... ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING)` 之空框架陷阱——`ROW_NUMBER()` 本身無此問題，記錄以區分兩種視窗函式風險類型）

### TS-MSSQL-P3D-WINDOWFN-002：同 emplid 對應相異 deptid_m 決定性排序（交叉引用 STEP3-003）
- **Related Requirement**：I-DET-CR-01；同 STEP3-003
- **Test Type**：MUST-FIX Gate（與 STEP3-003 同一斷言，於本群組以「決定性視角」重申，非重複業務邏輯驗證）
- **Expected Result**：多次重跑（同一 seed）`ROW_NUMBER()` 排序結果穩定一致（非隨機），確定性保證

### TS-MSSQL-P3D-WINDOWFN-003（🔴 未驗證假設）：跨引擎（PG vs MSSQL）ROW_NUMBER 排序穩定性與 collation 一致性
- **Related Requirement**：I-DET-01 / I-DET-CR-01；collation 差異風險
- **Test Type**：Decision Gate（待 tdd-impl 真庫驗證，不預設答案）
- **Expected Result**：以同一批 `deptid_m` 混合大小寫/特殊字元（若業務值域涵蓋此類值）於 PG 與 MSSQL 兩側分別執行 `ORDER BY deptid_m ASC`，比對排序結果是否一致（MSSQL BIN collation 已於 AD-E07-38 確立，理論上應與 PG 預設 collation 之 byte-exact 排序一致，但**待真庫直接驗證**而非假設）

---

## 十、CRWARN — CR 前置步驟本身無 warning 機制查證 + 與 Stage 3/4 既有 warning 交互回歸

### TS-MSSQL-P3D-CRWARN-001（🔴 查證推翻任務假設，記錄式）：runCrPrioritySql/Mssql 不產生任何 warning/skipped_cases
- **Related Requirement**：§頂部查證發現 6；`runCrPrioritySql` 回傳 `Promise<void>`；`applyCrPriority` 回傳 `CrAssignment[]`（無 warning 欄位）
- **Test Type**：Static Fact Confirmation / Documentation
- **Expected Result**：記錄查證結論——CR 前置步驟（JS oracle 與 SQL 下推兩側）皆為純粹確定性映射/UPDATE，不若 `stage3to4-ration.ts` 之 `RationWarning[]` 機制產生 `STAGE3_NO_DEPT_RATION`/`STAGE4_NO_EMPL_WARN`/`ASSIGNDAY_NO_CALENDAR_WARN`；`skipped_cases.warnings[]`/`warning_summary` 屬 Stage 3/4（F101/F102 DEDUCT）語意，非 CR 前置步驟本身之回傳契約，MSSQL 版本函式簽章**不應**新增 warning 回傳值（若新增即為對 PG 版契約之非必要偏離）

### TS-MSSQL-P3D-CRWARN-002（🔴 交互回歸，銜接 P3c CRFILTER）：CR 前置動態產生之 is_cr='Y' 案件正確影響 Stage 3/4 既有 warning 基數
- **Related Requirement**：P3c `CRFILTER-001`（先前以手動 seed 模擬「P3d 已完成」之資料狀態）；I-CR-DEDUCT-01
- **Test Type**：Integration Regression（DoD 核心，橋接 P3c 與 P3d）
- **Steps**：以完整四步 mssql 鏈路（含本輪新接線之 CR 前置）執行，使部分案件由 `runCrPrioritySqlMssql` 動態指派為 `is_cr='Y'`（而非手動 seed），接續執行 P3c 已驗證之 `runStage3to4RationSqlMssql`
- **Expected Result**：`STAGE3_NO_DEPT_RATION`/`STAGE4_NO_EMPL_WARN` 警告基數（`COUNT(*)`）正確排除本輪由 CR 前置動態產生之 `is_cr='Y'` 案件（與 P3c CRFILTER-001 之手動模擬結果一致），驗證「真實機制產生」與「手動模擬」兩種資料來源在下游 warning 計算上行為等價

---

## 十一、EQ — JS↔MSSQL 逐列六元組等價（🔴 DoD 核心，對稱 PG EQ-005/006）

### TS-MSSQL-P3D-EQ-001：基準情境（STEP1+STEP2+STEP3 皆觸發之混合案件）六元組逐列等價
- **Related Requirement**：I-MSSQL-ENGINE-EQ-01
- **Test Type**：EQ（DoD 核心）
- **Steps**：以同一 seed 分別跑 JS `applyCrPriority` 與 MSSQL `runCrPrioritySqlMssql`，取六元組（`cr_id`/`cr_nm`/`is_cr`/`emplid`/`dept_id`/`emplid_deptid`）依 `(orgno,appl_no)` 排序
- **Expected Result**：`toEqual` 精確逐列相等（非集合比對，確定性排序鍵保證可逐列比對）

### TS-MSSQL-P3D-EQ-002（🔴 旗艦，對稱 PG EQ-006 完整 worked example 8 案件）：涵蓋 STEP1 邊界/STEP2 BR-F102-08/STEP3 ration=0/deptid_m ASC 全部規則
- **Related Requirement**：同上；STEP3-005 之 EQ 對照版本
- **Test Type**：EQ（DoD 核心旗艦）
- **Expected Result**：8 案件（含逾2年清空、逾2年邊界不清、離職清空、ration=0 不指派、查無 emphire 但指派、appl_date 恰等於 twoYearsAgo 不清）JS oracle 與 MSSQL pushdown 逐列六元組精確相等

### TS-MSSQL-P3D-EQ-003：cr_enabled=false 強制清 N 等價
- **Related Requirement**：GATECR 群組之 EQ 對照
- **Test Type**：EQ
- **Expected Result**：全案件 `is_cr='N'`、`emplid`/`dept_id`/`emplid_deptid=NULL`（步驟 1-3 未執行），JS 端與 MSSQL 端等價

### TS-MSSQL-P3D-EQ-004（🔴🔴 DoD 核心跨切片旗艦，對稱 PG spec ASGD-CR-EQ）：含 CR 案件之完整四步 mssql 月名單分派鏈路端對端六元組+四元組聯合等價
- **Related Requirement**：I-CR-DEDUCT-01/I-CR-ASSIGNDAY-01；`distributeStage3to4` 之 `crPreassigned` 參數；橋接 P3c EQ-005（先前手動模擬）與本輪真實機制
- **Test Type**：EQ（DoD 核心旗艦，端對端）
- **Steps**：混合 seed 非 CR 案件 + CR 案件（`cr_id` 有值，`ob_empl_set` 有對應 ration），經 §二 DISPATCH 擴充後之完整四步 mssql 鏈路（CR 前置 → Stage 3/4 比例分派）；JS 端以 `applyCrPriority` 產出 `crPreassigned` 後傳入 `distributeStage3to4`
- **Expected Result**：JS oracle 端對端結果與 MSSQL 完整鏈路逐列六元組（CR 欄位）+ 四元組（`dept_id`/`emplid`/`emplid_deptid`/`assignday`）精確相等，CR 案件之 `assignday` 正確納入散佈（I-CR-ASSIGNDAY-01，對稱 F102 202606 live bug 教訓，P3c 已於手動模擬層級驗證，本輪首次由真實機制端對端驗證）

### TS-MSSQL-P3D-EQ-005：STEP3 deptid_m ASC tie-break 之 JS↔MSSQL 逐案等價（多筆 deptid_m 情境）
- **Related Requirement**：I-DET-CR-01；STEP3-003 之 EQ 對照
- **Test Type**：EQ
- **Expected Result**：多名員工各自對應 2-3 筆相異 `deptid_m` 之混合情境下，JS 與 MSSQL 逐案 `dept_id`/`emplid_deptid` 取值一致（皆為 ASC 排序第一筆）

---

## 十二、IDEM — 重跑冪等

### TS-MSSQL-P3D-IDEM-001：不同 run_id 兩次六元組相同
- **Related Requirement**：對稱 PG spec IDEM-001
- **Test Type**：Positive / Regression
- **Expected Result**：相同輸入（`ob_emphire`/`ob_empl_set` 設定相同）於兩個獨立 `run_id` 分別執行 `runCrPrioritySqlMssql`，六元組結果集合完全相同

### TS-MSSQL-P3D-IDEM-002：同 run 重複執行冪等
- **Related Requirement**：對稱 PG spec IDEM-002
- **Test Type**：Positive / Regression
- **Expected Result**：同一 `run_id` 連續執行兩次 `runCrPrioritySqlMssql`，第二次結果與第一次完全相同（`is_cr`/`emplid`/`dept_id` 皆不因重複執行產生漂移）

---

## 十三、REG — 回歸保護

### TS-MSSQL-P3D-REG-001：PG 核心檔 cr-priority-sql.ts / cr-priority.ts 逐位元組不變
- **Related Requirement**：AD §1.1「PG 檔完全不動」；比照 P3a/P3b/P3c STATIC-002/REG-003
- **Test Type**：Static Guard
- **Expected Result**：`git diff` 對兩檔案為空（本輪僅新增平行 `cr-priority-sql-mssql.ts` 檔案，不修改 PG 原始碼）

### TS-MSSQL-P3D-REG-002：P3a/P3b/P3c 既有 mssql 套件不回歸
- **Related Requirement**：跨切片回歸
- **Test Type**：Regression
- **Expected Result**：`stage1-sql-pushdown.mssql.spec.ts`（P3a）+ `stage2to4-sql-pushdown.mssql.spec.ts`（P3b）+ `stage3to4-ration-pushdown.mssql.spec.ts`（P3c）三套件重跑全綠，不因本輪 harness/dispatch 變更受影響

### TS-MSSQL-P3D-REG-003：PG cr-priority-pushdown.pg.spec.ts 套件不回歸（F102 既有測試不受影響）
- **Related Requirement**：既有 F102 測試套件
- **Test Type**：Regression
- **Expected Result**：既有 PG 測試套件（GATE/STEP1/STEP2/STEP3/DEDUCT/EQ/IDEM/S2CLEAN/S1SRC/ORDER-002/ASGD-CR）全綠不受本輪 mssql 新增檔案影響

### TS-MSSQL-P3D-REG-004：SQLite JS oracle 路徑（applyCrPriority）不受影響
- **Related Requirement**：SQLite 走 in-memory `executeV2`，純函式不依賴 DB_TYPE
- **Test Type**：Regression
- **Expected Result**：既有 `cr-priority.spec.ts`（純函式單元測試）重跑全綠

### TS-MSSQL-P3D-REG-005：tsc --noEmit -p tsconfig.build.json 乾淨
- **Related Requirement**：CLAUDE.md 專案紀律（`feedback_vitest_no_typecheck.md`：vitest 不做型別檢查）
- **Test Type**：Static / Build Gate
- **Expected Result**：exit 0，無型別錯誤

---

## 十四、STATIC — 靜態守門

### TS-MSSQL-P3D-STATIC-001：Harness 無 DROP/TRUNCATE 共用表
- **Related Requirement**：§0.2；P3a/P3c §0.2 政策沿用
- **Test Type**：Static Guard
- **Expected Result**：測試檔原始碼掃描確認 `afterAll`/`afterEach` 對 `assignment_run`/`ob_monthly_run_result`/`ob_emphire`/`ob_empl_set` 四張共用表僅執行 `DELETE`（前綴/固定鍵值），無任何 `DROP TABLE`/`TRUNCATE TABLE` 字面

### TS-MSSQL-P3D-STATIC-002：生成 SQL 不含 PG-only token
- **Related Requirement**：I-MSSQL-ENGINE-EQ-01；跨切片速查清單（`ad-based-infra-test-design-pattern.md`「PG 特有語法糖速查清單」）
- **Test Type**：Static Guard
- **Expected Result**：`cr-priority-sql-mssql.ts`（或等效檔名）產生之 SQL 字面掃描確認**不含** `::`（cast 運算子）、`LIMIT` 子句、`\|\|` 字串串接、`RETURNING`、`ON CONFLICT`

### TS-MSSQL-P3D-STATIC-003：新增平行檔案存在，PG 檔 import 路徑未變
- **Related Requirement**：AD §1.1；DISPATCH-005
- **Test Type**：Static Guard
- **Expected Result**：`cr-priority-sql-mssql.ts` 新檔存在且被 `assignment-run-pipeline.service.ts` 之 mssql 分支 import；PG 版 `cr-priority-sql.ts` 之既有 import 路徑（`executeStage2to4Pushdown` 使用者）未變動

---

## 場景數統計

| 分組 | 案例數 |
|---|---|
| GATE | 6 |
| DISPATCH | 5 |
| STEP1 | 6 |
| STEP2 | 6 |
| STEP3 | 7 |
| GATECR | 3 |
| DATECAST | 3 |
| UPDATEFROM | 2 |
| WINDOWFN | 3 |
| CRWARN | 2 |
| EQ | 5 |
| IDEM | 2 |
| REG | 5 |
| STATIC | 3 |
| **合計** | **58** |
