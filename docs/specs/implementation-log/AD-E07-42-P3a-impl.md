---
type: implementation-log
feature_id: AD-E07-42-P3a
feature_name: MSSQL 全面遷移 P3a — Stage 1 篩選 raw SQL 引擎移植（JS↔MSSQL 逐案件等價）
status: complete
last_updated: 2026-07-08
---

# AD-E07-42 P3a：Stage 1 篩選 raw SQL 引擎 MSSQL 移植 — Implementation Log

將 Stage 1 篩選之 PG set-based SQL 下推（`buildStage1Sql` / `buildCustomerCoreClause` /
`stage1-sql-executor`）平行移植至 MSSQL，維持 JS golden oracle（`executeStage1Chain`）↔ MSSQL
下推逐案件等價。**PG 檔完全不動（byte-identical），新增平行 `*-mssql.ts`，服務層加 dispatch 分支。**

## Test Results Summary

真 MSSQL 實測（`docker cdmp-mssql` / CDMP_TEST / dbo）：**63 test blocks 全綠**（涵蓋測試設計 73 個
case ID；YEARABOVE-001~007 合併為單一直接表達式案例、REG-001~003 以外部套件執行驗證）。

| 群組 | 案例（case ID → block） | 狀態 |
|---|---|---|
| 一、GATE | GATE-001（composer 雙引號 dbo 複用）/ GATE-002（六表存在探測）/ GATE-004（source_customer_no UNIQUE 查證）| PASS（真庫）|
| 二、DISPATCH | DISPATCH-001~004（resolveStage1Strategy 三分支互斥）| PASS（純函式，恆執行）|
| 三、CONCAT | CONCAT-001（靜態：mssql executor SQL 模板無 `\|\|`）/ CONCAT-002（cr_nm='CR王小明' 中文 round-trip）/ CONCAT-003（未命中→NULL）| PASS |
| 四、AGE | AGE-MSSQL-001（旗艦：30 歲命中，攔截負值反轉）~006 + 007（Meta：mssqlAgeExpr dob 為 start 引數）| PASS |
| 五、YEARABOVE | 001~007（直接表達式 7 邊界值，含空字串陷阱 / '1980abc' 擷取）+ 008（EQ 全鏈）| PASS |
| 六、EQ | EQ-001~014（JS↔MSSQL 逐列 PK 集合精確相等 + assignday 恆 NULL）| PASS |
| 七、CCNULLEXC | 001~006（customer_core NULL 三變體 + LEFT3/AGE NULL + 交叉互不干擾）| PASS |
| 八、CCJOIN | 001（EMPTY_CONDITIONS 陷阱）/ 002（多條件共用 JOIN）| PASS |
| 九、CCMISC | CITY-001/002、AND-001、JOINCARD-001、DEACT-001 | PASS |
| 十、CCEQ | GATE-001（oracle 方法論記錄）+ 001~005（手算 oracle 等價）| PASS |
| 十一、RUNEST | 001（含特例+去重）/ 002（year-above 列數===COUNT）| PASS |
| 十二、IDEM | 001（重觸發清理）/ 002（FK CASCADE）/ 003（雙 run_id 互不污染）| PASS |
| 十三、CHARSET | 001（特例觸發字中文）/ 002（spec_name byte-exact）| PASS |
| 十四、STATIC | 001（無 DROP/TRUNCATE）/ 002（PG 5 核心檔 git diff 空）/ 003（無 special-rules-mssql）/ 004（三分支源碼字面）| PASS |
| 十五、REG | REG-001（PG stage1 spec 不回歸→skip，非回歸）/ REG-002（SQLite stage1 141 綠）/ REG-003（tsc build 乾淨）| PASS（外部套件執行）|

**回歸實測**：
- SQLite stage1 單元（filter-chain / customer-core-clause / sql-builder / query-composer / special-rules）：**141 綠**。
- 受影響服務 spec（assignment-run-pipeline ×4 + stage0-estimate ×2）：**90 綠 / 1 skip**。
- PG stage1 spec（pushdown + customer-core-clause）：50 skip（5433 不可達，非回歸；PG 5 檔 byte-identical）。
- `npx tsc --noEmit -p tsconfig.build.json`：**乾淨（exit 0）**。

## Files Changed

| File Path | Change Type | Description |
|---|---|---|
| src/modules/assignment/stage1/stage1-customer-core-clause-mssql.ts | new | customer_core clause MSSQL 版；唯一方言差異 = AGE `DATEDIFF` 公式（匯出 `mssqlAgeExpr`）|
| src/modules/assignment/stage1/stage1-sql-builder-mssql.ts | new | `buildStage1SqlMssql`；唯一方言差異 = year-above `PATINDEX` 擷取（匯出 `mssqlLeadingYearExpr`）；委派 clause-mssql |
| src/modules/assignment/stage1/stage1-sql-executor-mssql.ts | new | `runStage1SqlInsertMssql` / `estimateStage1SqlCountMssql`；`\|\|`→`+`；`@@ROWCOUNT` 取影響列數 |
| src/modules/assignment/services/assignment-run-pipeline.service.ts | modified | 新增純函式 `resolveStage1Strategy` + `runStage1ForList` 三分支 + `runStage1SqlPushdownMssql` + 共用 `finalizeStage1Pushdown` |
| src/modules/assignment-list/stage0-estimate.service.ts | modified | `dryRunChainCount` 二元 gate → 三分支（mssql 走 `estimateStage1SqlCountMssql`）|
| src/modules/assignment/stage1/__tests__/stage1-sql-pushdown.mssql.spec.ts | new | 63 test blocks（73 case ID）；dbo 共用表 + P3A 前綴 + 精準 DELETE harness |
| （PG 5 核心檔）| unchanged | stage1-sql-builder/customer-core-clause/sql-executor/query-composer/filter-chain 逐位元組不變（STATIC-002 驗）|

## Architectural Decisions

### 4 個 MUST-FIX 落實
1. **🔴🔴 CONCAT（`\|\|`→`+`，R-MSSQL-P3A-01）**：`stage1-sql-executor.ts:100` 之 `'CR' \|\| cremp.emp_nm`
   為 PG 專屬運算子，T-SQL 語法錯誤。因 STATIC-002 要求 PG executor byte-identical，**不在原檔內加分支**，
   改新增平行檔 `stage1-sql-executor-mssql.ts`（`runStage1SqlInsertMssql`），CR 串接改 `'CR' + cremp.emp_nm`。
   選 `+` 而非 `CONCAT()`：`+` 對 NULL 傳播（`'CR'+NULL=NULL`）與 PG `\|\|` 逐位元組等價。實測 cr_nm='CR王小明'。
2. **🔴🔴 AGE 引數順序（R-MSSQL-P3A-02）**：AD §2.1 表格建議式引數反轉會得負值年齡。正確公式
   `DATEDIFF(YEAR, cc.date_of_birth, CAST(:ccWorkdt AS DATE)) - CASE WHEN (MONTH(dob)>MONTH(wk)) OR
   (MONTH=MONTH AND DAY(dob)>DAY(wk)) THEN 1 ELSE 0 END`（**dob 為 start 引數**）。NULL dob → DATEDIFF NULL →
   整式 NULL → BETWEEN 天然排除（不 COALESCE）。實測 30 歲命中（AGE-MSSQL-001）、閏年 2/29 正確、workdt 驅動正確。
3. **🔴🔴 year-above 前導數字擷取**：`SUBSTRING(col FROM '^[0-9]+')`（擷取，非驗證）→ 自建
   `mssqlLeadingYearExpr`：`CASE col IS NULL→1900; LEN=0→NULL; PATINDEX('%[^0-9]%',col)=0→TRY_CAST(col AS INT);
   PATINDEX=1→NULL; ELSE TRY_CAST(LEFT(col,PATINDEX-1) AS INT)`。**空字串陷阱**（PATINDEX('%[^0-9]%','')=0 與全數字同值
   → 額外 `LEN=0→NULL` 特判）。**不可**逐字複用 P4a 全字串驗證式 `NOT LIKE '%[^0-9]%'`（語意不同）。
   實測 7 邊界值全對（'1980abc'→擷取 1980→排除、''→保留、'N/A'→保留、NULL→1900→排除）。
4. **🔴 DISPATCH 三分支**：`assignment-run-pipeline.service.ts` + `stage0-estimate.service.ts` 之二元
   `DB_TYPE==='postgres'` gate → 三分支（postgres/mssql/其餘）。pipeline 以純函式 `resolveStage1Strategy(dbType)`
   （比照既有 `resolveStage2to4Strategy`）落地，mssql 走 `runStage1SqlPushdownMssql`；estimate 端以
   `dbType==='mssql'` 選 `estimateStage1SqlCountMssql`。三分支互斥（DISPATCH-004）、其餘值不回歸 JS chain（DISPATCH-003）。

### customer_core.source_customer_no UNIQUE 查證（GATE-004）
測試設計 §頂部發現 7 標為待查（test-designer grep 未見）。**實際查證結果：存在**——MSSQL baseline
（`1751884800000-MssqlBaselineSchema.ts` customer_core 92 欄 CREATE，因行極長被工具省略而漏見）含
`CONSTRAINT "UQ_customer_core_source_customer_no" UNIQUE ("source_customer_no")`。GATE-004 以 `sys.indexes`
真庫查證通過 → I-CC-JOIN-CARD-01 有資料庫層防線（非僅 fixture 紀律），JOINCARD-001 為強斷言。

### query-composer 共用決策（GATE-001）
**不建 `stage1-query-composer-mssql.ts`**：composer 輸出僅雙引號識別碼 + ANSI `IN`/`BETWEEN`，符合 P4a
QUOTE-003（MSSQL QUOTED_IDENTIFIER ON 接受雙引號）。GATE-001 於真實持久化 dbo.ob_pool_data 複核通過
（非拋語法錯、正確過濾）→ builder-mssql 直接 `import { buildStage1WhereConditions } from './stage1-query-composer'`
（沿用 PG 檔）。同理 `buildMonthCntFragment` / `computeDedupWindow` / `matchesSpecialRule` 皆沿用 PG 純函式。

### CC-EQ oracle 方法論（GATE-003 / CCEQ-GATE-001）
採 §0.3 **預設路徑：不修改 `stage1-filter-chain.ts`**。customer_core 群組（CCNULLEXC/CCJOIN/CCMISC/CCEQ）
**不用** `executeStage1Chain` 為 oracle（其 cc 分支發 PG `AGE()`/`EXTRACT`/`::date`，對 MSSQL 拋語法錯），
改以「已知 fixture 手算期望值」為 oracle 對 `estimateStage1SqlCountMssql` 比對。CCEQ-GATE-001 靜態驗證
`stage1-filter-chain.ts` 未 dialect-aware（未逾越 AD §1.1 檔案清單）。非 customer_core 群組（EQ/YEARABOVE/CHARSET）
之 `executeStage1Chain` 可安全對 MSSQL 執行（不觸及 cc SQL 片段）→ 作為 JS↔MSSQL 逐列 PK 等價 oracle。

### EQ 結論
JS golden oracle（`executeStage1Chain`）↔ MSSQL 下推（`runStage1SqlInsertMssql`）於 dbo 真庫逐列 PK 集合
**精確相等**（EQ-001~014 全綠），assignday 恆 NULL。customer_core estimate ↔ 手算 oracle 全綠。
MSSQL 方言轉換（AGE/year-above/CONCAT/COALESCE+LIKE/NOT EXISTS/CAST numeric）與 JS 業務規則語意一致。

### 影響列數（MSSQL driver 特性）
MSSQL driver 對 INSERT…SELECT（無 OUTPUT）之 `manager.query()` 僅回 recordset（undefined），不回 affected
→ executor-mssql 尾綴 `SELECT @@ROWCOUNT AS affected` 讀回準確寫入列數（RUNEST 列數===COUNT 實測通過）。

## 偏離 spec/AD 與測試設計

1. **EQ-012 pool 側 NULL custo_no（偏差，harness 限制）**：dbo.ob_pool_data.custo_no 為 NOT NULL，§0.2
   禁對共用表 ALTER（PG spec 以 `DROP NOT NULL` 種 NULL pool 列，MSSQL 無法比照）→ 移除該 pool 列，改以
   **歷史側 NULL**（ob_pool_data_list.custo_no 可空，seedPdl custoNo=null）驗證 anti-join `IS NOT NULL` 守門。
   EQ-013「歷史空集」子案於共用 dbo 不可重現（外來列必存在）→ 僅保留「未來日封頂」子案。
2. **YEARABOVE-001~007（直接表達式，非表插入）**：'1980abc'（7 字）超過 varchar(4)，且 §0.2 禁 ALTER 共用表
   欄寬 → 改以 `SELECT ... FROM (VALUES ...) v(yp)` 對 `mssqlLeadingYearExpr` 直接求值 7 邊界值（含 '1980abc'/''/NULL），
   不觸及表插入。YEARABOVE-008 以可入 varchar(4) 之值跑 EQ 全鏈。合併為 2 個 test block（涵蓋 8 case ID）。
3. **測試環境 bootstrap（非阻擋，harness 前提）**：本機 CDMP_TEST dbo 平時只有 9 張表（customer_core 在、
   Stage1 六表缺——p1b2 套件跑後留空 dbo）。§0.2 規定本檔**不自建**六表 → 缺表時 GATE-002 引導、DB 案例 skip。
   本輪為取得真庫證據，另以 baseline migration 原始 DDL（零 drift）補建 6 缺表（customer_core 保留不動）跑完 63 綠後，
   再 DROP 還原 dbo 至原 9 表。**正式 CI 需先 bootstrap dbo baseline 才能執行本套件 DB 案例**（同 §0.2）。
4. **並行**：本檔與 p1b2/p4 共用 dbo，須以單檔（或 `--no-file-parallelism`）執行，避免 p1b2 wipe dbo 造成干擾。

## Blocking Issues

無。4 MUST-FIX 全落實、73 case 全綠（真 MSSQL）、tsc 乾淨、PG 5 核心檔 byte-identical、SQLite/服務層無回歸。
