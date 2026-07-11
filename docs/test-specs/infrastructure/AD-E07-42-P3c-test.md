---
type: test-design-infrastructure
test-spec-id: AD-E07-42-P3c
feature_name: MSSQL 全面遷移 P3c — Stage 3/4 比例分派 raw SQL 引擎移植（stage3to4-ration-sql.ts MSSQL 化；JS↔MSSQL 逐列四元組等價；VALUES-CTE derived table 包裝 3 處 + UPDATE...FROM 重構 3 道 + ration DECIMAL 精度旗艦 + is_cr 篩選子句 mssql 翻譯正確性）
priority: P0-MVP
related_spec:
  - /docs/specs/implementation-log/AD-E07-42-mssql-p3-raw-sql-engine.md（§2.3 Stage3/4 比例分派逐站點方言轉換清單、§4 EQ 等價測試策略、§5 P3c 範圍/DoD、§7 不變式 I-MSSQL-ENGINE-EQ-01）
  - /docs/specs/implementation-log/AD-E07-42-P3a-impl.md（Stage 1 已完成落地事實：dbo 共用表 harness 決策「共用既有表+前綴隔離+精準 DELETE」策略，本文件直接沿用）
  - /docs/specs/implementation-log/AD-E07-42-P3b-impl.md（Stage 2~3 計分已完成落地事實：§Blocking Issues「範圍外後續（P3c/P3d，非本輪）」明文記錄 `executeStage2to3PushdownMssql` 尚未呼叫 `clearStage3Fields`/`runCrPrioritySql`/`runStage3to4RationSql`，mssql 月名單分派 dept_id/emplid/assignday 暫留 NULL——本文件 §二 DISPATCH 群組即針對此缺口設計）
  - apps/api/src/modules/assignment/stage1/stage3to4-ration-sql.ts（`runStage3DeptSql`/`runStage4EmplSql`/`runAssignDaySql`/`clearStage3Fields`/`runStage3to4RationSql`，本文件全部站點逐行核對之 PG 現行實作）
  - apps/api/src/modules/assignment/stage1/stage3to4-ration.ts（`distributeStage3to4`，JS golden oracle，純函式無 DB 依賴，EQ 群組比對基準）
  - apps/api/src/modules/assignment/services/assignment-run-pipeline.service.ts（`executeStage2to4Pushdown:1012-1101`〔PG 完整呼叫鏈範本：`runStage2and3Sql`→`clearStage3Fields`→`runCrPrioritySql`→`runStage3to4RationSql`〕、`executeStage2to3PushdownMssql:1113-1158`〔mssql 現行僅至 Stage 2~3，DISPATCH 群組核心依賴〕、`resolveStage2to4Strategy:184-193`）
  - apps/api/src/modules/assignment/stage1/__tests__/stage3to4-ration-pushdown.pg.spec.ts（F101 DEPT/EMPL/ASGD/EQ/IDEM/FALL/REG 群組之 MSSQL 對應版本模板）
  - apps/api/src/database/migrations/mssql/1751884800000-MssqlBaselineSchema.ts（test-designer 逐行查證：`ob_monthly_run_result`/`ob_pool_data`/`assignment_run`/`ob_dept_pct`/`ob_empl_set` 五表皆已於 dbo 建表；`ob_monthly_run_result.assignday` 為 `varchar(100)`〔非 date/datetime 型別〕、`ob_dept_pct.ration numeric(9,2)`、`ob_empl_set.ration numeric(10,2)` 為本文件 GATE/DECIMAL 群組依據）
covers: []
spec_version: "1.0"
date: 2026-07-08
last_updated: 2026-07-08
---

# AD-E07-42 P3c：MSSQL 全面遷移 — Stage 3/4 比例分派 raw SQL 引擎移植 — 測試設計

> 本文件覆蓋 AD-E07-42「MSSQL 全面遷移 P3（Raw SQL 引擎移植）」之 **P3c 切片**（AD §2.3 Stage 3/4 比例分派逐站點清單 + §5 P3c 範圍/DoD）。P3 不經 spec-writer（AD §5「是否需要 spec-writer（RESOLVED：不需要）」已裁定，本輪不重複論證）。
>
> **明確排除**：3d CR 優先分派（`cr-priority-sql.ts`）之 mssql 化本身、3e `fn_calc_tier_level` 收尾，皆**不在本文件範圍**。P3a（Stage 1 篩選）+ P3b（Stage 2~3 計分）已完成，本文件視為已驗證黑盒依賴（案件已在 `ob_monthly_run_result` 內且已有 `tier_level`）。**唯一例外**：`stage3to4-ration-sql.ts` 現行程式碼本身（PG 版，F102 落地時已疊加）已內含 `is_cr` 篩選子句（`AND (r.is_cr IS NULL OR r.is_cr <> 'Y')` 排除 CR 案件於配額計算、ASSIGNDAY 不篩選），此為**本檔既有 SQL 邏輯之一部分**（非 CR 完整業務流程本身），其 mssql 翻譯正確性屬本文件範圍（§十一 CRFILTER 群組），但**不驗證** `runCrPrioritySql`（P3d 範圍）本身之 mssql 化或完整 CR 業務流程。
>
> **★ test-designer 逐檔查證發現之關鍵事實（本文件測試設計之核心依據）**：
>
> 1. **🔴🔴 `executeStage2to3PushdownMssql` 現行明確不呼叫 Stage 3/4 比例分派，此為 P3b impl log 已白紙黑字記錄之已知缺口（非本文件新發現，但本文件為其正式閉環）**：test-designer 直接查證 `assignment-run-pipeline.service.ts:1103-1158` 之 `executeStage2to3PushdownMssql`（P3b 落地產物）函式本體，確認其僅呼叫 `runStage2and3SqlMssql` 補 score/card_level/tier_level 三欄，函式結尾直接 `return this.readResultRowsForSnapshot(runId)`，**完全未呼叫** `clearStage3Fields`／`runCrPrioritySql`／`runStage3to4RationSql`（PG 版之三步）。對照 PG 完整鏈路 `executeStage2to4Pushdown:1012-1101`（`runStage2and3Sql`→`clearStage3Fields`→`runCrPrioritySql`→`runStage3to4RationSql`，四步），mssql 路徑目前僅完成第一步。這正是 P3b impl log「Blocking Issues」段落自陳之範圍外後續：「mssql 月名單分派之 dept_id/emplid/assignday 暫留 NULL」。已獨立立 §二 DISPATCH-001 為刻意對現行未修改程式碼設計之紅燈 MUST-FIX 守門。
> 2. **🔴🔴 DECIMAL 精度旗艦缺陷（AD §2.3 表格未點名此具體站點，同型於 P3b DECIMAL-LOANRATE-001 之 FINDING-P4D-01 家族）**：`stage3to4-ration-sql.ts` 內 `CAST(:or${i} AS numeric)`（`runStage3DeptSql:113`，dept ration）與 `CAST(:er${idx} AS numeric)`（`runStage4EmplSql:251`，empl ration）**皆為裸 `numeric`、無精度宣告**。test-designer 查證來源型別：`ob_dept_pct.ration` 為 `numeric(9,2)`、`ob_empl_set.ration` 為 `numeric(10,2)`（皆保留 2 位小數，如 `33.67`）。PG `CAST(x AS numeric)`（無精度）對已有精度之數值原樣保留；但 T-SQL 未指定精度之裸 `NUMERIC`/`DECIMAL` 型別預設為 `NUMERIC(18,0)`，若逐字翻譯，會在 `VALUES` CTE 建構階段（早於任何 `FLOOR` 計算）就將 `33.67` 四捨五入為 `34`，使部門/員工實際分得比例產生系統性偏移（且不拋錯，屬靜默數值錯誤）。已設計 §五 DECIMAL 群組 2 案例（`DECIMAL-RATION-001` 為 MUST-FIX 旗艦，已知具體數值斷言）。
> 3. **🔴 ASSIGNDAY 無日期型別轉換需求（修正任務指示之預設假設）**：任務指示原預期「`::date`/日期運算→mssql(DATEADD/DATEDIFF/CAST AS DATE)」為本切片轉換站點之一，但 test-designer 逐行掃描 `stage3to4-ration-sql.ts` 全檔（含 `runAssignDaySql`）**零命中**任何 `::date` cast 或日期運算函式；`casedt` 全程以字串參數傳遞、比對、寫入，且查證 `ob_monthly_run_result.assignday` 欄位型別為 `varchar(100)`（非 `date`/`datetime2`），與 `ob_dept_pct`/`ob_empl_set` 之 `ration` 精度風險同屬「查證後推翻預設假設」之發現，記入 §一 GATE-004 澄清、避免下游誤設計不存在的轉換案例（該類轉換實際發生於 §2.1/§2.4 之 `:ccWorkdt::date`/`:twoYearsAgo::date` 等其他檔案，非本檔範圍）。
> 4. **Harness 範圍顯著小於 P3b（僅 2 張新查詢表，皆為 P3a 已確認共用表，非新增依賴）**：`stage3to4-ration-sql.ts` 直接以 raw SQL 觸及的物理表僅 `ob_monthly_run_result`（UPDATE 目標）與 `ob_pool_data`（dept SQL 之 JOIN，取分處 `dept_id`）兩張；`dept_pct`/`empl_set`/`cal` 三個 CTE 名稱皆為 `VALUES` 建構之記憶體內臨時集合（非真實資料表），`ob_dept_pct`/`ob_empl_set`/`ob_calendar` 三張真實表由呼叫端（`assignment-run-pipeline.service.ts`）以 TypeORM `.find()`/`QueryBuilder` 查詢後轉為陣列參數傳入（**已是 dialect-agnostic 路徑，非本文件方言轉換範圍**）。此兩張表（+ FK 依賴之 `assignment_run`）皆已屬 P3a `AD-E07-42-P3a-impl.md`「dbo 共用表」策略確認之既有六表子集，§0 Harness 沿用 P3a「共用既有表 + 前綴隔離寫入列 + 精準 DELETE（禁 DROP/TRUNCATE）」策略，**不需要**如 P3b 般自建 6 張計分專屬表。
> 5. **識別碼引號風格無風險（與 P3a/P4a handler 系列不同型）**：逐行掃描確認 `stage3to4-ration-sql.ts` 全檔**無任何雙引號識別碼**（`"col"` 字面），表名/欄名皆為裸識別碼直接拼接，故不存在 P3a/P4a 系列曾查證之「MSSQL 是否接受雙引號識別碼」風險，§一 GATE 不需重複該決策關卡。
> 6. **`LIMIT 1` 僅 1 處**（`runAssignDaySql` 之 `hasEmplRows` 存在性檢查），風險低但仍為保證語法錯誤站點（T-SQL 無 `LIMIT` 子句），已獨立立 §七 TOPLIMIT 群組（非併入其他群組，維持可追溯性）。

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件全部 + `AD-E07-42-mssql-p3-raw-sql-engine.md`（§2.3、§5 P3c、§7）+ `AD-E07-42-P3b-impl.md`（§Blocking Issues「範圍外後續」段落，DISPATCH 群組直接依賴）+ `stage3to4-ration-sql.ts`/`stage3to4-ration.ts`（PG 現行實作，逐字沿用不變）+ `stage3to4-ration-pushdown.pg.spec.ts`（案例模板）+ `assignment-run-pipeline.service.ts`（`executeStage2to4Pushdown` PG 完整鏈路範本 + `executeStage2to3PushdownMssql` 現行缺口所在）+ P3a `stage1-sql-pushdown.mssql.spec.ts`（harness 共用表策略手法直接沿用） |
| QA / Tester | 本文件 + `risks-and-gaps.md`（MSSQL P3c 風險段落） |
| DevOps / CI/CD | 本文件「零、測試環境與 Harness 設計」（本輪 harness 範圍小於 P3b，2 表共用免自建） |

---

## 零、測試環境與 Harness 設計

### 0.1 沿用既有 Harness 元件

`mssql-env-preload.ts`（`restoreDbType`/`MSSQL`/`mssqlPortReachable`/`SKIP_REASON`）不新增；連線設定沿用 `CDMP_TEST`。不可達 → 整檔 `describe.skip` + 明確 `SKIP_REASON`（不假造綠燈）。`vi.setConfig({ testTimeout: 60000 })`（沿用 P3a/P3b/P4 系列教訓）。

### 0.2 Harness 範圍（沿用 P3a「共用既有表」策略，不需 P3b 式自建）

依 §頂部查證發現 4，本檔僅需 3 張表皆已存在於 MSSQL baseline（`1751884800000-MssqlBaselineSchema.ts`）：`assignment_run`（FK 前置，`ob_monthly_run_result.run_id` 之外鍵目標）、`ob_pool_data`（dept SQL JOIN 來源）、`ob_monthly_run_result`（UPDATE 目標）。三者皆屬 P3a `AD-E07-42-P3a-impl.md` 已確認之 dbo 六表共用子集，**不需要**比照 P3b 對 12 張表逐一 `OBJECT_ID` 探測+零 drift 自建。

- **beforeAll**：僅需確認三表存在（`OBJECT_ID` 探測，作為 §一 GATE-001 之 regression 守門，非自建前提）；連線初始化。
- **beforeEach**：`DELETE FROM ob_monthly_run_result WHERE list_no LIKE 'P3C%'`；`DELETE FROM ob_pool_data WHERE dept_id IN (...測試用分處代號...)  OR appl_no LIKE 'P3C%'`（依實際 seed 慣例調整篩選鍵）；`DELETE FROM assignment_run WHERE run_id IN (P3C_RUN_ID_1, P3C_RUN_ID_2)`；重新 INSERT 兩筆 `assignment_run` 種子列（`project_workym='202606'`, `status='running'`）。
- **afterAll**：僅執行上述前綴/固定鍵值 `DELETE`（**絕不** `DROP`/`TRUNCATE` 三張共用表，比照 P3a §0.2 政策）。
- **隔離鍵慣例**：`run_id` 固定測試專用 UUID 常數 `P3C_RUN_ID_1`/`P3C_RUN_ID_2`；`list_no` 前綴 `P3C%`；`appl_no` 連號（比照 PG spec `applSeq` 手法，每 run 內唯一）；分處代號沿用 PG spec 既有測試值域（`XVF1`/`XVG1`/`AI000`/`AM000`/`B0000` 等，避開真實業務代號可另行自訂測試專屬前綴，由 tdd-implementation 決定）。

### 0.3 決定性驗證前提

本檔核心不變式為「決定性排序鍵無 `NEWID()`/random」（I-DET-01，承 F101/AD-E07-29）；MSSQL 版須逐一確認 `ROW_NUMBER() OVER (... ORDER BY orgno, appl_no)`／`obdeptid ASC`／`emplid ASC` 三處排序鍵於 mssql 上同樣產生穩定、可重複之結果（非僅語法可執行），EQ 群組之逐列 `toEqual`（非集合比對）即隱含驗證此點。

---

## 一、GATE — 前置決策關卡與環境事實核對

### TS-MSSQL-P3C-GATE-001：三表存在性 regression 確認（沿用 P3a 共用表結論，非自建前提）
- **Related Requirement**：§頂部查證發現 4
- **Test Type**：Regression / Precondition
- **Expected Result**：`OBJECT_ID('dbo.assignment_run','U')`／`OBJECT_ID('dbo.ob_pool_data','U')`／`OBJECT_ID('dbo.ob_monthly_run_result','U')` 三者皆非 NULL（P3a 已建，本輪僅 regression 確認，不可假設 P3a 套件未跑過即缺表——若缺表應引導執行 P3a harness 而非本檔自建，避免破壞 P3a/P3b 共用假設）

---

### TS-MSSQL-P3C-GATE-002（🔴🔴 MUST-FIX 前置）：ration 精度轉換方案決策記錄（呼應 §頂部查證發現 2）
- **Related Requirement**：§頂部查證發現 2；I-MSSQL-DECIMAL-NORMALIZE-01
- **Test Type**：Decision Gate（MUST-FIX 前置）
- **Expected Result**：impl log 記錄 dept ration（來源 `numeric(9,2)`）與 empl ration（來源 `numeric(10,2)`）兩處 `CAST(...AS numeric)` 之 MSSQL 版本採用之精度宣告方式（建議對齊來源精度 `NUMERIC(9,2)`/`NUMERIC(10,2)`，或統一採用更寬精度如 `NUMERIC(18,4)`，比照 P3b LOAN_RATE 決策原則），並說明為何不可沿用裸 `CAST(...AS numeric)`（同 §五 DECIMAL-RATION-001 MUST-FIX 守門之理由）

---

### TS-MSSQL-P3C-GATE-003：三處 VALUES-CTE 站點清單靜態核對
- **Related Requirement**：AD §2.3；`stage3to4-ration-sql.ts:117`（dept_pct）/`:258`（empl_set）/`:387`（cal）
- **Test Type**：Static Fact Confirmation
- **Expected Result**：確認 mssql 版原始碼三處皆已由 `WITH x(cols) AS (VALUES ...)`（PG 原生 CTE 直接接 VALUES）改寫為 `WITH x(cols) AS (SELECT * FROM (VALUES ...) AS v(cols))`（T-SQL 要求 CTE 主體須為 SELECT，`VALUES` 僅能以 derived table 形式透過 `FROM (VALUES ...) AS alias(cols)` 出現），逐一比對三處改寫皆完整（非僅改其中一處而遺漏其餘二處）

---

### TS-MSSQL-P3C-GATE-004（🔴 決策澄清，修正任務假設）：ASSIGNDAY 無日期型別轉換需求
- **Related Requirement**：§頂部查證發現 3
- **Test Type**：Static Fact Confirmation / Documentation（非阻擋，記錄性）
- **Expected Result**：記錄查證結論——`stage3to4-ration-sql.ts` 全檔（含 `runAssignDaySql`）逐行掃描零命中 `::date`/`DATEADD`/`DATEDIFF`/`CAST(...AS DATE)` 等日期方言轉換站點；`ob_monthly_run_result.assignday` 為 `varchar(100)`，`casedt` 全程以字串參數處理，MSSQL 版本**不需要**新增任何日期型別轉換邏輯，直接沿用字串比對/寫入語意即可。此案例目的為避免 tdd-implementation 依循任務指示原始措辭（「ASSIGNDAY 散佈；`::date`/日期運算→mssql」）誤植不必要的日期轉換程式碼

---

## 二、DISPATCH — Stage 3/4 比例分派尚未接線至 mssql 月名單分派鏈路（🔴🔴 本文件核心缺口，P3b impl log 已預告）

### TS-MSSQL-P3C-DISPATCH-001（🔴🔴 MUST-FIX，對現行未修改程式碼刻意設計為紅燈）：`executeStage2to3PushdownMssql` 現行不呼叫 Stage 3/4 比例分派
- **Related Requirement**：§頂部查證發現 1；`assignment-run-pipeline.service.ts:1113-1158`；I-NOLOAD-01
- **Test Type**：Regression / MUST-FIX Gate
- **Preconditions**：`env.DB_TYPE='mssql'`；Stage 1 已 INSERT 案件、Stage 2 已寫 `tier_level`（P3a/P3b 黑盒依賴）
- **Steps**：以 `vi.spyOn` 掛在 `runStage3to4RationSqlMssql`（或等效 tdd-implementation 命名之 mssql 版本函式）上，執行完整 mssql 月名單分派管線（`triggerExecute`/`runPipeline` 或等效入口）
- **Expected Result**：`runStage3to4RationSqlMssql` **應被呼叫**（現行未修改程式碼下必為紅燈——`executeStage2to3PushdownMssql` 函式本體結尾直接 `return this.readResultRowsForSnapshot(runId)`，無任何 Stage 3/4 呼叫），逼實作方將呼叫鏈擴充為對稱 PG `executeStage2to4Pushdown`（`runStage2and3SqlMssql`→`clearStage3Fields`〔或 mssql 版〕→`runStage3to4RationSqlMssql`）之三步（**不含** `runCrPrioritySql`，見 DISPATCH-003）

---

### TS-MSSQL-P3C-DISPATCH-002：`clearStage3Fields` 方言中立性決策關卡（是否需要 mssql 版本）
- **Related Requirement**：`stage3to4-ration-sql.ts:452-465`（`clearStage3Fields`：純 `UPDATE ... SET col=NULL ... WHERE run_id=:runId AND list_no=:listNo`，含 `CURRENT_TIMESTAMP`）
- **Test Type**：Decision Gate（不預設答案，待 tdd-impl 真庫驗證）
- **Expected Result**：`clearStage3Fields` 本身不含任何 PG-only 語法字面（無 `||`/`::`/`RETURNING`/`ON CONFLICT`/`LIMIT`/裸 `VALUES` 接 CTE），`CURRENT_TIMESTAMP` 為 ANSI 保留字、`:param` 具名參數已由 P1~P4 反覆驗證之 `escapeQueryWithParameters` 機制通用展開。**待 tdd-impl 真庫驗證**：此函式是否可直接對 MSSQL 連線執行而不需任何修改（若驗證通過，記錄「直接複用 PG 版，不建 `-mssql.ts` 版本」之決策；若驗證失敗，記錄實際錯誤訊息與所需修改）於 impl log Architectural Decisions 段落

---

### TS-MSSQL-P3C-DISPATCH-003：mssql P3c 路徑刻意不呼叫 `runCrPrioritySql`（P3d 範圍外，非遺漏）
- **Related Requirement**：AD §2.4（P3d 範圍）；I-CR-ORDER-01（PG 版排序：清除→CR前置→比例分派）
- **Test Type**：Static Guard / Documentation
- **Expected Result**：靜態掃描確認 mssql 呼叫鏈（DISPATCH-001 擴充後）**不含** `runCrPrioritySql`（PG-only raw SQL，尚未移植至 mssql，逐字對 MSSQL 執行會語法錯）之呼叫；此為 P3c 刻意排除項（is_cr 完整業務流程待 P3d），非實作疏漏——若 tdd-implementation 誤植呼叫會導致 mssql 月名單分派直接崩潰（保證語法錯誤），本案例作為負向守門

---

### TS-MSSQL-P3C-DISPATCH-004（🔴 spy 驗證，MUST-FIX）：三分支互斥（postgres/mssql/其餘）不誤觸 in-memory fallback
- **Related Requirement**：同 P3a/P3b 已反覆出現之 DISPATCH 陷阱同型延伸
- **Test Type**：Regression / MUST-FIX Gate
- **Steps**：以 `{postgres, mssql, undefined}` 三種 `DB_TYPE` 組合執行含 Stage 3/4 之完整月名單分派鏈路，spy `runStage3to4RationSql`（PG 版）／`runStage3to4RationSqlMssql`（mssql 版）
- **Expected Result**：`postgres` 呼叫 PG 版且僅呼叫 PG 版；`mssql` 呼叫 mssql 版且僅呼叫 mssql 版；兩者互斥，不重疊、不誤呼叫對方版本

---

### TS-MSSQL-P3C-DISPATCH-005（DoD 核心觀察）：完整 mssql 月名單分派後 dept_id/emplid/assignday 不再恆 NULL
- **Related Requirement**：§頂部查證發現 1；P3b impl log「範圍外後續」段落之已知缺口解除驗證
- **Test Type**：Regression（DoD 核心）
- **Steps**：以 §八/九/十 DEPT/EMPL/ASGD 群組任一案例之 seed 資料，經完整 mssql 月名單分派管線（含本輪新接線之 Stage 3/4）執行
- **Expected Result**：`ob_monthly_run_result` 讀回列之 `dept_id`/`emplid`/`emplid_deptid`/`assignday` 四欄**不再全數為 NULL**（P3b 當下之已知狀態），至少存在非 NULL 值且與 §十二 EQ 群組之 JS oracle 逐列相符

---

## 三、VALUESCTE — VALUES-CTE 三處 derived table 包裝正確性

### TS-MSSQL-P3C-VALUESCTE-001：dept_pct VALUES-CTE 多列輸入正確映射
- **Related Requirement**：§頂部查證發現/GATE-003；`runStage3DeptSql`
- **Test Type**：Positive / Regression
- **Steps**：注入 3 筆 `DeptRation`（`obdeptid`/`ration` 相異值）
- **Expected Result**：`WITH dept_pct(obdeptid,ration,dept_seq) AS (SELECT * FROM (VALUES (...),(...),(...)) AS v(obdeptid,ration,dept_seq))` 正確展開為 3 列、`dept_seq` 依 `obdeptid ASC` 序（1/2/3）不誤植

### TS-MSSQL-P3C-VALUESCTE-002：empl_set VALUES-CTE 多列輸入正確映射（含跨 deptid_m 分群 emp_seq 各自歸零）
- **Related Requirement**：同上；`runStage4EmplSql`
- **Test Type**：Positive / Regression
- **Expected Result**：2 個 `deptid_m` 各自 3 名員工情境下，`emp_seq` 為「per deptid_m 之 emplid ASC 序」（各組各自 1/2/3，非跨組連續編號）正確展開

### TS-MSSQL-P3C-VALUESCTE-003：cal（工作日）VALUES-CTE 多列輸入正確映射
- **Related Requirement**：同上；`runAssignDaySql`
- **Test Type**：Positive / Regression
- **Expected Result**：20 個工作日 `WorkingDay` 注入後，`day_seq` 依陣列順序（0-based）正確展開，`ratioPerMille` 字面值（非參數化，直接字串插入）正確落入 CTE

---

## 四、WINDOWFN — 視窗函式累積框架邊界（🔴 單一列 partition 之空框架語意，AD 標「低風險」但仍需驗證非僅「語法可執行」）

### TS-MSSQL-P3C-WINDOWFN-001（🔴 邊界）：單一部門（ration=100%）情境，dept 累積邊界 [lo,hi) 正確
- **Related Requirement**：`bounded` CTE（`runStage3DeptSql:150-161`）；`ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING`
- **Test Type**：Boundary（首列空框架）
- **Preconditions**：僅 1 個 `DeptRation`（`ration=100`）
- **Steps**：`dept_seq=1`（唯一課）之累積框架（`1 PRECEDING` 指向不存在之列）求值
- **Expected Result**：`SUM(final_cnt) OVER (...)` 對首列（也是唯一列）之框架為空 → `COALESCE(..., 0)` 正確產生 `lo=0`；`hi=0+final_cnt=cnt`；全部案件正確落入該唯一課（100% 分派，不因空框架語意產生 NULL 導致 JOIN 失配而漏派）

### TS-MSSQL-P3C-WINDOWFN-002：單一員工情境，empl 累積邊界同上
- **Related Requirement**：同上；`runStage4EmplSql`
- **Test Type**：Boundary
- **Expected Result**：對稱 WINDOWFN-001，單一員工（`ration=100`）情境下全部案件正確落入該員工

### TS-MSSQL-P3C-WINDOWFN-003：單一工作日情境（`days.length=1`，`lastIdx=0`）
- **Related Requirement**：`per_day` CTE（`runAssignDaySql:396-404`）之 `CASE WHEN c.day_seq = ${lastIdx} THEN ... ELSE ...` 分支
- **Test Type**：Boundary
- **Expected Result**：唯一工作日即為「最末日」，`day_seq=0=lastIdx` 恆成立 → `take = et.total - SUM(...)` 分支（吸收全部）正確執行，非誤入 `ELSE FLOOR(...)` 分支導致部分案件無 assignday

---

## 五、DECIMAL — ration 精度旗艦（🔴🔴 MUST-FIX，對稱 P3b DECIMAL-LOANRATE-001）

### TS-MSSQL-P3C-DECIMAL-RATION-001（🔴🔴 DoD 核心旗艦，已知具體數值斷言）：dept ration 非整除小數精度不得於 CAST 階段被四捨五入
- **Related Requirement**：§頂部查證發現 2；`runStage3DeptSql:113`；I-MSSQL-DECIMAL-NORMALIZE-01
- **Test Type**：MUST-FIX Gate（已知具體數值，非僅邊界關係，呼應 ad-based-infra 記憶「方向敏感/精度敏感站點需已知具體期望值」原則）
- **Preconditions**：3 課 `obdeptid`（`D1`/`D2`/`D3`，ASC 序如字面）ration 分別為 `33.67`/`33.67`/`32.66`（Σ=100.00 exactly，皆帶 2 位小數）；`cnt=300`（單一分處單一 tier）
- **Steps**：執行 `runStage3DeptSql`
- **Expected Result**：正確結果為 `{D1:102, D2:101, D3:97}`（`FLOOR(300×33.67/100)=101`、`FLOOR(300×33.67/100)=101`、`FLOOR(300×32.66/100)=97`，Σ=299，diff=1→`obdeptid ASC` 首課 D1 +1→102）。**若誤用裸 `CAST(:or AS numeric)`**（MSSQL 預設 `NUMERIC(18,0)`），三值於 CTE 建構階段即被四捨五入為 `34`/`34`/`33`（Σ=101>100），導致配額計算階段性超額分配（`FLOOR(300×34/100)=102` ×2 + `FLOOR(300×33/100)=99`，Σ=303>cnt），使 D2/D3 實得件數偏離正確值（依循序指派邏輯，D2 仍可能取滿 102 但 D3 因案件耗盡僅得 96，非正確之 97）——此為 MUST-FIX 紅燈守門，斷言必須為精確 `{D1:102, D2:101, D3:97}`，非僅「總和=300」之寬鬆比對（寬鬆比對無法揪出比例偏移）

### TS-MSSQL-P3C-DECIMAL-RATION-002：empl ration 精度同型驗證（對稱案例）
- **Related Requirement**：§頂部查證發現 2；`runStage4EmplSql:251`
- **Test Type**：Regression（同型風險，非重新推導）
- **Preconditions**：3 名員工 ration 分別為 `40.25`/`35.25`/`24.50`（Σ=100.00）；`grp_cnt` 選一非整除值
- **Expected Result**：JS oracle 與 MSSQL pushdown 逐一員工分配件數精確相等（非僅總和相等），確認 empl 站點精度宣告與 DECIMAL-RATION-001 採用同一方案（決策一致性，不可一處修正另一處遺漏）

---

## 六、UPDATEFROM — 3 道 UPDATE...FROM 重構

### TS-MSSQL-P3C-UPDATEFROM-001：dept UPDATE...FROM（target 併入 FROM + join key 入 INNER JOIN ON）
- **Related Requirement**：`runStage3DeptSql:177-181`；同型 P3b UPDATEFROM 群組手法
- **Test Type**：Regression / MUST-FIX Gate
- **Expected Result**：T-SQL 形式 `UPDATE r SET dept_id=a.obdeptid, updated_at=... FROM ob_monthly_run_result r INNER JOIN assigned a ON r.orgno=a.orgno AND r.appl_no=a.appl_no WHERE r.run_id=:runId AND r.list_no=:listNo`（join key 移入 `INNER JOIN ON`、`WHERE` 僅保留 `run_id`/`list_no` 範圍限定鍵），正確執行不拋 `Invalid object name`

### TS-MSSQL-P3C-UPDATEFROM-002：empl UPDATE...FROM 同上
- **Related Requirement**：`runStage4EmplSql:331-335`
- **Test Type**：Regression / MUST-FIX Gate
- **Expected Result**：同上手法，`emplid`/`emplid_deptid` 兩欄同一 UPDATE 陳述式內正確賦值

### TS-MSSQL-P3C-UPDATEFROM-003：assignday UPDATE...FROM 同上
- **Related Requirement**：`runAssignDaySql:432-436`
- **Test Type**：Regression / MUST-FIX Gate
- **Expected Result**：同上手法，`assignday` 欄正確賦值

### TS-MSSQL-P3C-UPDATEFROM-004（🔴 旗艦防污染，對稱 P3b UPDATEFROM-002）：兩個 run_id 共用同 list_no+appl_no 情境下互不污染
- **Related Requirement**：I-MSSQL-ENGINE-EQ-01；PG spec IDEM-002 精神延伸
- **Test Type**：MUST-FIX Gate（DoD 核心）
- **Preconditions**：`P3C_RUN_ID_1`/`P3C_RUN_ID_2` 共用同一份 `ob_pool_data`（PK `orgno+appl_no`），各自一份 `ob_monthly_run_result`（PK 含 `run_id`）；`RUN_ID_1` 執行 `runStage3to4RationSql`，`RUN_ID_2` 尚未執行（或以不同 ration 執行）
- **Expected Result**：`RUN_ID_2` 之列 `dept_id`/`emplid`/`emplid_deptid`/`assignday` **完全不受** `RUN_ID_1` 之 UPDATE 影響（若三道 UPDATE 之 WHERE 遺漏 `run_id` 範圍限定，會產生跨 run 污染——此案例為直接反證）

---

## 七、TOPLIMIT — `LIMIT 1` → `TOP(1)` 轉換

### TS-MSSQL-P3C-TOPLIMIT-001：`hasEmplRows` 查詢改 `SELECT TOP(1) 1 FROM ...`，emplid 全 NULL 時正確提前 return
- **Related Requirement**：`runAssignDaySql:358-366`
- **Test Type**：Regression / MUST-FIX Gate
- **Preconditions**：本 list 所有列 `emplid IS NULL`（Stage 3/4 尚未指派或無 ration）
- **Expected Result**：T-SQL `SELECT TOP (1) 1 FROM ob_monthly_run_result WHERE run_id=:runId AND list_no=:listNo AND emplid IS NOT NULL`（移除 PG `LIMIT 1` 子句，改用 `TOP(1)`）正確回傳 0 列 → 函式提前 `return []`，不執行後續 `cal`/ASSIGNDAY UPDATE（避免無意義查詢）

### TS-MSSQL-P3C-TOPLIMIT-002：有 emplid 情境下 `TOP(1)` 正確偵測存在
- **Related Requirement**：同上
- **Test Type**：Regression
- **Expected Result**：至少 1 列 `emplid IS NOT NULL` 時，`TOP(1)` 查詢正確回傳 1 列（非拋錯、非誤判為 0），流程正確繼續執行 ASSIGNDAY 分配

---

## 八、DEPT — Stage 3 dept ration 手算 oracle（對稱 PG DEPT-001~008 精選）

| Case ID | 情境 | 預期結果 |
|---|---|---|
| DEPT-001 | 101 件 / 3 課（50/30/20），diff=1 | `{AI000:51, AM000:30, B0000:20}`（FLOOR 差額 obdeptid ASC 首課 +1） |
| DEPT-002 | 30 件 / 3 課（50/30/20），整除 | `{AI000:15, AM000:9, B0000:6}`（無需差額補足） |
| DEPT-003 | 2 分處 × 2 Tier 全矩陣 | 4 個 (分處,Tier) 分組各自獨立正確分派（GROUP BY 分處+Tier 正確性） |
| DEPT-004 | 10 件，配額 6/3/1，依 (orgno,appl_no) ASC 循序指派 | 前 6 件→AI000、次 3 件→AM000、末 1 件→B0000（落點與 PG spec 完全一致） |
| DEPT-005 | 無 ration 課 | `dept_id` 全 NULL + `STAGE3_NO_DEPT_RATION` 警告（`{list_no, tier_level, case_count}`） |
| DEPT-006 | `tier_level` 全 NULL（Stage 2 未跑） | `dept_id` 全 NULL，無警告（不參與分配非錯誤情境） |

**共通 Steps**：seed `ob_pool_data`+`ob_monthly_run_result`（`tier_level` 已定）→ 執行 `runStage3to4RationSql`（mssql 版）→ 讀回 `dept_id` 分佈與 PG spec 手算 oracle 逐值比對（非僅總數）。

---

## 九、EMPL — Stage 4 empl ration 手算 oracle（對稱 PG EMPL-001~008 精選）

| Case ID | 情境 | 預期結果 |
|---|---|---|
| EMPL-001 | 51 件 / 3 員工（40/35/25），diff 情境 | `{E1:21, E2:18, E3:12}` |
| EMPL-002 | 30 件 / 3 員工（50/30/20），整除 | `{F1:15, F2:9, F3:6}` |
| EMPL-003 | 103 件 / 3 員工（34/33/33），diff=2，前 2（emplid ASC）+1 | `{G1:36, G2:34, G3:33}` |
| EMPL-004 | 課有案件但無員工設定 | `emplid` 全 NULL + `STAGE4_NO_EMPL_WARN`（`{dept_id, list_no, tier_level, case_count}`） |
| EMPL-005 | 分派成功案件之 `emplid_deptid` 正確寫入（對稱 Bug C 防護） | 每一有 `dept_id` 之列若有對應員工 ration，`emplid` 不為 NULL、`emplid_deptid` 恆等於分配到之 `deptid_m` |

**共通 Steps**：同 DEPT 群組手法，額外注入 `EmplRation[]`。

---

## 十、ASGD — ASSIGNDAY 千分比

| Case ID | 情境 | 預期結果 |
|---|---|---|
| ASGD-001 | 21 件 / 20 工作日（各 ratioPerMille=50） | 19 日各 1 件 + 末日 2 件（`FLOOR(21×50/1000)=1` ×19，末日吸收餘 2） |
| ASGD-002 | 18 件 / 20 工作日，`FLOOR(18×50/1000)=0` | 全 18 件落末日（前 19 日皆 FLOOR=0，末日吸收全部） |
| ASGD-003 | 無工作日（`workingDays=[]`） | `assignday` 全 NULL + `ASSIGNDAY_NO_CALENDAR_WARN`（`{list_no, work_ym}`），月名單分派不中斷 |

**共通 Steps**：先完成 dept/empl 分派（`emplid` 已定）→ 執行 ASSIGNDAY 分配 → 讀回 `assignday` 分佈與 PG spec 手算 oracle 逐值比對。

---

## 十一、CRFILTER — `is_cr` 篩選子句 mssql 翻譯正確性（🔴 P3c 範圍內獨立驗證，不驗證 CR 完整業務流程）

**背景**：`stage3to4-ration-sql.ts` 現行程式碼（PG 版，F102 落地時疊加，非本輪新增）於三處 `WHERE`（dept `cases` CTE、empl `grp`/`ranked` CTE）已含 `AND (r.is_cr IS NULL OR r.is_cr <> 'Y')`（I-CR-DEDUCT-01，排除 CR 案件於配額計算基數），但 ASSIGNDAY 之 `ranked`/`empl_total` CTE **不**篩選 is_cr（I-CR-ASSIGNDAY-01，CR 預指派案件與非 CR 案件合併散佈）。此不對稱篩選邏輯本身之 mssql 翻譯正確性（`OR-NULL` 語法、子句位置）屬本文件範圍；**CR 前置步驟（`runCrPrioritySql`）本身如何產生這些 is_cr='Y' 列，屬 P3d 範圍**，本群組以手動 seed 模擬「P3d 已完成」之資料狀態進行獨立驗證。

### TS-MSSQL-P3C-CRFILTER-001（🔴）：is_cr='Y' 案件不計入 dept/empl 配額分組基數
- **Related Requirement**：I-CR-DEDUCT-01；`runStage3DeptSql:122-129`/`runStage4EmplSql:206-212,265-269`
- **Test Type**：Positive / Regression
- **Preconditions**：手動 seed 10 件 `is_cr='N'` + 4 件 `is_cr='Y'`（模擬已由 P3d 前置指派 `dept_id`/`emplid`，但本群組聚焦 dept/empl **配額基數**是否正確排除這 4 件）
- **Expected Result**：`grp`/`cases` CTE 之 `COUNT(*)` 僅計入 10 件（`is_cr='N'`），配額計算與分派循序完全不受 4 件 CR 案件影響（案件池排除，非僅最終不分配）

### TS-MSSQL-P3C-CRFILTER-002（🔴 對稱 F102 live bug 教訓）：is_cr='Y' 案件（已有 emplid）納入 ASSIGNDAY 散佈
- **Related Requirement**：I-CR-ASSIGNDAY-01；`runAssignDaySql` 全 CTE 皆不篩選 is_cr
- **Test Type**：MUST-FIX Gate（對稱 F102 202606 live 抓到之真實 bug：CR 案 assignday 全空）
- **Preconditions**：`emplid='E1'` 之案件含 6 件 `is_cr='N'` + 2 件 `is_cr='Y'`（皆已由模擬 CR 前置步驟寫入 `emplid='E1'`）
- **Expected Result**：`empl_total` CTE 之 `total` 計數應為 **8**（6+2，`is_cr` 不篩選），ASSIGNDAY 分配以 8 件為基礎計算；2 件 CR 案件與 6 件非 CR 案件**合併**依 `(orgno,appl_no) ASC` 排序取得 `assignday`，**不得**因 CR 篩選導致此 2 件 `assignday` 恆為 NULL（此即 F102 live bug 之 mssql 翻譯對稱防線——若誤將 ASSIGNDAY CTE 也加上 `is_cr<>'Y'` 篩選，會重演此已知業務級 bug）

### TS-MSSQL-P3C-CRFILTER-003：`is_cr IS NULL` 與 `is_cr='N'` 皆視為非 CR（OR-NULL 語意一致性）
- **Related Requirement**：`(r.is_cr IS NULL OR r.is_cr <> 'Y')` 語法本身
- **Test Type**：Boundary / Regression
- **Preconditions**：混合 seed `is_cr=NULL`、`is_cr='N'`、`is_cr='Y'` 三態
- **Expected Result**：`NULL` 與 `'N'` 兩者於 dept/empl 配額基數計算中行為完全一致（皆計入），僅 `'Y'` 被排除；MSSQL 對 `IS NULL`/`<>` 之三值邏輯（NULL 比較恆 UNKNOWN）與 PG 行為一致（**待 tdd-impl 真庫直接驗證**，非憑訓練知識假設兩資料庫此處行為必然相同）

---

## 十二、EQ — JS↔MSSQL 逐列四元組等價（🔴 DoD 核心，對稱 PG EQ-001/003/006/007）

### TS-MSSQL-P3C-EQ-001：基準情境（多課多員工多工作日）逐列四元組等價
- **Related Requirement**：I-MSSQL-ENGINE-EQ-01；AC-15（F101 DoD 沿用）
- **Test Type**：EQ（DoD 核心）
- **Steps**：以同一 seed（101 件、3 課、5 員工、20 工作日）分別跑 JS `distributeStage3to4` 與 MSSQL `runStage3to4RationSqlMssql`，取四元組（`dept_id`/`emplid`/`emplid_deptid`/`assignday`）依 `(orgno,appl_no)` 排序
- **Expected Result**：`toEqual` 精確逐列相等（非集合比對，確定性排序鍵保證可逐列比對）

### TS-MSSQL-P3C-EQ-002：多 Tier（T1+T2+T3）逐列等價
- **Related Requirement**：同上
- **Test Type**：EQ
- **Expected Result**：三個 Tier 分組各自獨立正確分派，逐列等價

### TS-MSSQL-P3C-EQ-003：無 ration 課 fallback 逐列等價
- **Related Requirement**：同上；DEPT-005 情境之 EQ 對照
- **Test Type**：EQ（Negative fallback）
- **Expected Result**：`dept_id` 全 NULL（fallback 分支）之逐列等價，含警告內容一致（`STAGE3_NO_DEPT_RATION` 事件）

### TS-MSSQL-P3C-EQ-004：無員工課 fallback 逐列等價
- **Related Requirement**：同上；EMPL-004 情境之 EQ 對照
- **Test Type**：EQ（Negative fallback）
- **Expected Result**：`emplid` 全 NULL（fallback 分支）之逐列等價，含警告內容一致（`STAGE4_NO_EMPL_WARN` 事件）

### TS-MSSQL-P3C-EQ-005（🔴 旗艦，串連 CRFILTER 群組）：含 CR 預指派案件混合情境逐列等價
- **Related Requirement**：I-CR-DEDUCT-01/I-CR-ASSIGNDAY-01；`distributeStage3to4` 之 `crPreassigned` 參數
- **Test Type**：EQ（DoD 核心旗艦）
- **Steps**：混合 seed 非 CR 案件 + CR 預指派案件（`is_cr='Y'` 且已有 `emplid`/`dept_id`），JS 端以 `crPreassigned` 參數傳入對應案件，MSSQL 端以 §十一 CRFILTER 手法直接 seed 至 `ob_monthly_run_result`
- **Expected Result**：JS oracle 與 MSSQL pushdown 逐列四元組精確相等，含 CR 案件之 `assignday` 正確納入散佈（非 NULL）、CR 案件不計入 dept/empl 配額基數兩者皆與 JS 端 `crPreassigned` 邏輯等價

---

## 十三、IDEM — 重跑冪等

### TS-MSSQL-P3C-IDEM-001：`clearStage3Fields` 重觸發清理正確（NULL 重置，`is_cr` 保留）
- **Related Requirement**：`clearStage3Fields:452-465`；BR-F101-06
- **Test Type**：Positive / Regression
- **Preconditions**：已執行過一次 `runStage3to4RationSql`（`dept_id`/`emplid`/`assignday` 皆有值）
- **Steps**：執行 `clearStage3Fields`
- **Expected Result**：`dept_id`/`emplid`/`emplid_deptid`/`assignday` 四欄重置為 NULL，`is_cr`/`tier_level`/`score`/`card_level` 不受影響（維持原值）

### TS-MSSQL-P3C-IDEM-002：兩個 run_id 四元組互不污染（多輪整體冪等）
- **Related Requirement**：對稱 PG spec IDEM-002；同 UPDATEFROM-004 但著眼「完整流程重複執行」整體視角
- **Test Type**：Positive / Regression
- **Steps**：`RUN_ID_1`/`RUN_ID_2` 共用同一份 `ob_pool_data`，各自完整跑一次 `runStage3to4RationSql`（相同 ration/workingDays 輸入）
- **Expected Result**：兩個 run 之四元組集合完全相同（確定性保證：相同輸入→相同輸出，且互不污染）

---

## 十四、REG — 回歸保護

### TS-MSSQL-P3C-REG-001：emplid 不為 NULL 防護（Bug C 對稱防護）
- **Related Requirement**：對稱 PG spec REG-001
- **Test Type**：Regression
- **Expected Result**：有 `dept_id`（Stage 3 已分派）+ 有對應員工 ration 設定者，`emplid` 不應為 NULL

### TS-MSSQL-P3C-REG-002：`is_cr` 值不被 Stage 3/4 修改
- **Related Requirement**：對稱 PG spec REG-004；BR-F101-06
- **Test Type**：Regression
- **Expected Result**：混合 `is_cr='Y'`/`'N'` 案件執行完整 Stage 3/4 分派後，`is_cr` 欄位值與執行前完全一致

### TS-MSSQL-P3C-REG-003：PG 核心檔 `stage3to4-ration-sql.ts`/`stage3to4-ration.ts` 逐位元組不變
- **Related Requirement**：AD §1.1「PG 檔完全不動」；比照 P3a/P3b STATIC-002
- **Test Type**：Static Guard
- **Expected Result**：`git diff` 對兩檔案為空（本輪僅新增平行 `-mssql.ts` 檔案，不修改 PG 原始碼）

### TS-MSSQL-P3C-REG-004：P3a/P3b 既有 mssql 套件不回歸
- **Related Requirement**：跨切片回歸
- **Test Type**：Regression
- **Expected Result**：`stage1-sql-pushdown.mssql.spec.ts`（P3a）+ `stage2to4-sql-pushdown.mssql.spec.ts`（P3b）兩套件重跑全綠，不因本輪 harness/dispatch 變更受影響

### TS-MSSQL-P3C-REG-005：SQLite JS oracle 路徑（`distributeStage3to4`）不受影響
- **Related Requirement**：SQLite 走 in-memory `executeV2`，純函式不依賴 DB_TYPE
- **Test Type**：Regression
- **Expected Result**：既有 `stage3to4-ration.spec.ts`/`stage3to4-ration-det.spec.ts`（純函式單元測試）重跑全綠

### TS-MSSQL-P3C-REG-006：`tsc --noEmit -p tsconfig.build.json` 乾淨
- **Related Requirement**：CLAUDE.md 專案紀律（`feedback_vitest_no_typecheck.md`：vitest 不做型別檢查）
- **Test Type**：Static / Build Gate
- **Expected Result**：exit 0，無型別錯誤

---

## 十五、STATIC — 靜態守門

### TS-MSSQL-P3C-STATIC-001：Harness 無 DROP/TRUNCATE 共用表（延續 P3a/P3b 政策）
- **Related Requirement**：§0.2；P3a §0.2 政策沿用
- **Test Type**：Static Guard
- **Expected Result**：測試檔原始碼掃描確認 `afterAll`/`afterEach` 對 `assignment_run`/`ob_pool_data`/`ob_monthly_run_result` 三張共用表僅執行 `DELETE`（前綴/固定鍵值），無任何 `DROP TABLE`/`TRUNCATE TABLE` 字面

### TS-MSSQL-P3C-STATIC-002：生成 SQL 不含 PG-only token
- **Related Requirement**：I-MSSQL-ENGINE-EQ-01；跨切片速查清單（`ad-based-infra-test-design-pattern.md`「PG 特有語法糖速查清單」）
- **Test Type**：Static Guard
- **Expected Result**：`stage3to4-ration-sql-mssql.ts`（或等效檔名）產生之 SQL 字面掃描確認**不含** `::`（cast 運算子）、裸 `VALUES` 直接接於 CTE 名稱後（未經 `SELECT * FROM (...) AS v(...)` 包裝）、`LIMIT` 子句、`\|\|` 字串串接、`RETURNING`、`ON CONFLICT`

### TS-MSSQL-P3C-STATIC-003：三處 VALUES-CTE 皆已改寫為 derived table 形式
- **Related Requirement**：GATE-003；VALUESCTE 群組
- **Test Type**：Static Guard
- **Expected Result**：原始碼掃描確認 dept_pct/empl_set/cal 三處 CTE 定義皆為 `WITH x(cols) AS (SELECT * FROM (VALUES ...) AS v(cols))` 形式（非逐字保留 PG `WITH x(cols) AS (VALUES ...)` 語法），三處缺一即為未完成

---

## 場景數統計

| 分組 | 案例數 |
|---|---|
| GATE | 4 |
| DISPATCH | 5 |
| VALUESCTE | 3 |
| WINDOWFN | 3 |
| DECIMAL | 2 |
| UPDATEFROM | 4 |
| TOPLIMIT | 2 |
| DEPT | 6 |
| EMPL | 5 |
| ASGD | 3 |
| CRFILTER | 3 |
| EQ | 5 |
| IDEM | 2 |
| REG | 6 |
| STATIC | 3 |
| **合計** | **56** |
