---
type: test-design-infrastructure
test-spec-id: AD-E07-41-P4-followup
feature_name: MSSQL 全面遷移 P4 收尾 tech debt — raw-data.service 完整性（CREATETABLE-FINDING 字串 PK 修法 + extraction 家族 getColumnMetadata/getIndexedColumns/getRawData 分頁/insertBatch mssql 化）
priority: P2-TechDebt（非阻擋 cutover；來源：memory `project_mssql_full_migration`「剩餘 Phase4」清單 + P4e impl log §七「範圍外家族清單」+ risks-and-gaps.md R-MSSQL-P4E-01/02）
related_spec:
  - /docs/specs/implementation-log/AD-E07-41-mssql-p4-etl-engine.md（§6/§9 P4e DoD 之範圍外家族清單原始出處）
  - /docs/specs/implementation-log/AD-E07-41-P4e-impl.md（§七「範圍外家族清單」逐字出處：1. getColumnMetadata/getIndexedColumns/getRawData 仍用二元 isPostgres；2. insertBatch 非 full-mode mssql 相容性未處理；3. CREATETABLE-FINDING 原始發現段落 + §十 偏差/決策）
  - /docs/test-specs/infrastructure/AD-E07-41-P4e-test.md（ISPG-GATE/TYPEMAP 群組設計慣例與 MUST-FIX/決策關卡標記慣例沿用起點；本文件為其 §二 ISPG-GATE 範圍界定之刻意排除項目的正式收斂）
  - /docs/test-specs/risks-and-gaps.md（R-MSSQL-P4E-01「getColumnMetadata/getIndexedColumns/getRawData 同缺陷但範圍外」、R-MSSQL-P4E-02「insertBatch 非 full-mode `?`/2100 上限」，本文件為兩項風險之正式閉環）
  - apps/api/src/modules/extraction-task/raw-data.service.ts（getRawData/getColumnMetadata/getIndexedColumns/insertBatch/createRawTable，本文件全部查證之原始碼來源；建構子 `dbType`/`isPostgres`/`isMssql` 三態欄位已由 P4e 建立，本文件四個方法僅需消費既有欄位，非重新設計三態）
  - apps/api/src/modules/extraction-task/extraction-execution.service.ts（§175-244，insertBatch 唯二呼叫端：incremental 模式迴圈 + full-mode 但來源 executor 不支援 streaming 之 fallback 迴圈——後者為本文件查證修正 P4e `DISPATCH-005` 文字之精確度）
  - apps/api/src/modules/extraction-task/dto/get-raw-data.dto.ts（page/limit∈{50,100,200}/sortBy/sortOrder 邊界值來源）
  - apps/api/src/modules/assignment/services/assignment-run-pipeline.service.ts:1517-1554（Pattern B `driver.escapeQueryWithParameters` 既有已驗證跨 driver 具名參數慣例，本文件 §五 INSERTBATCH 決策關卡引用之具體先例，`AD-E07-38-P1c` 起沿用至今）
  - node_modules/typeorm/driver/sqlserver/SqlServerQueryRunner.js:162-193（`query(query, parameters)` 以 `request.input(index.toString(), value)` 具名綁定，SQL 文字內字面 `?` 不會被取代為 `@0`/`@1`——本文件 §五 TRAP 案例之程式碼層級證據，並已於設計階段對真實 MSSQL 逐一實測確認，見下方「真庫已驗證事實」）
  - apps/api/src/modules/extraction-task/__tests__/raw-data.service.mssql.spec.ts（既有 `CREATETABLE-FINDING` 陷阱測試已存在且對真實 CDMP_TEST 通過，本文件建立於此既有事實之上，非重新發現；§一 PKFINDING 之修法後驗證為本文件核心新增工作）
  - apps/api/src/modules/extraction-task/__tests__/raw-data.service.mssql-unit.spec.ts（`makeCap(type)` fake DataSource + `(svc as any).privateMethod()` 直接呼叫私有方法慣例沿用）
  - apps/api/src/modules/extraction-task/__tests__/raw-data.service.spec.ts（既有 baseline spec，查證後確認**僅涵蓋** `formatCopyValue`/`supportsCopy`/`openCopyWriter` 三者，本文件待測之 `getRawData`/`getColumnMetadata`/`getIndexedColumns`/`insertBatch`/`createRawTable`/`tableExists`/`getTableColumns` 於 postgres/sqlite **零既有覆蓋**，見查證發現 1）
  - 設計階段真庫驗證：本機 dev MSSQL 2022 容器 `cdmp-mssql`（`localhost:1433`/DB `CDMP_TEST`，`encrypt=true`/`trustServerCertificate=true`），以拋棄式 `probe_*` 表對真實伺服器逐一實測（詳見下方「★★ 真庫已驗證事實」），測後全數 `DROP TABLE` 清理、`INFORMATION_SCHEMA.TABLES` 複查零殘留，未污染共用 `dbo` baseline
covers: []
spec_version: "1.0"
date: 2026-07-09
last_updated: 2026-07-09
---

# AD-E07-41 P4 收尾：raw-data.service 完整性 — CREATETABLE-FINDING 修法 + extraction 家族 mssql 化 — 測試設計

> 本文件覆蓋 MSSQL 全面遷移 P4（`AD-E07-41`）刻意 scope-out、記錄為 follow-up 的收尾項目：`raw-data.service.ts` 之 (1) `createRawTable()` 字串來源 PK 映射 `NVARCHAR(MAX)` 於 MSSQL 建表拋錯（CREATETABLE-FINDING）之修法驗證；(2) `getColumnMetadata`/`getIndexedColumns`/`getRawData` 分頁（`LIMIT ? OFFSET ?`）/`insertBatch` 非 full-mode 路徑，四者仍以二元 `this.isPostgres` 判定、`DB_TYPE=mssql` 時誤入 SQLite 分支之修法驗證。P4/P5 期間已依「flag it, don't self-redesign」原則刻意排除，本輪為其正式收斂。精簡管線（純技術債，不需 spec-writer，比照 P1~P5 系列先例）：test-designer → tdd-implementation。
>
> **範圍界定（明確排除）**：不含顯示層 `cr_nm`/`datetime2` 匯出格式化（另有獨立切片）；不含 ETL customer_core pipeline handler 本身（P4a/b/c/d 已覆蓋，不重測）；不含 bulk-load 機制本身（P4e 已完成，不重測，本文件僅在 §六/§七 REG 交叉確認不受影響）。

---

## ★★ 真庫已驗證事實（設計階段直接對本機 dev MSSQL 2022 `cdmp-mssql`/`CDMP_TEST` 實測，取代理論推導）

> 使用者於本文件設計階段明確要求：能真庫證實的假設不留待 tdd-implementation，直接在設計階段用拋棄式 `probe_*` 表驗證。以下事實**全部**已對真實 SQL Server 2022（本機 dev 容器，非模擬）逐一實測確認，精確錯誤代碼/訊息/邊界值皆為實測結果，非查文件/訓練知識推論。測後已 `DROP TABLE` 全數清理並以 `INFORMATION_SCHEMA.TABLES` 複查零殘留。

| # | 驗證項目 | 實測結論 |
|---|---|---|
| V1 | `NVARCHAR(MAX)` 作 PK | `CREATE TABLE` **立即**拋錯 `#1919`「Column '\<col\>' in table '\<table\>' is of a type that is invalid for use as a key column in an index.」（型別錯誤，非長度錯誤） |
| V2 | 🔴🔴 `NVARCHAR(n)`（任意 `n≤4000`，非 `MAX`）作 PK，包含 `n=451`/`500`/`900` | **`CREATE TABLE` 全數成功，不受 `n` 值大小影響**——推翻任務書「有界 `NVARCHAR(≤450)`」隱含之「450 是 DDL 成功的門檻」假設；DDL 層級唯一決定因素是「是否為 `MAX`」，與宣告長度無關 |
| V3 | 🔴🔴 900-byte（clustered，`PRIMARY KEY` 未指定 `NONCLUSTERED` 時之預設）限制之真正生效時機與依據 | **INSERT 時**（非 `CREATE TABLE` 時）依**實際寫入值**之 byte 長度判定，非宣告欄位長度。精確邊界：450 字元（900 bytes）`INSERT` 成功；451 字元（902 bytes）拋錯 `#1946`「Operation failed. The index entry of length 902 bytes for the index '\<name\>' exceeds the maximum length of 900 bytes for clustered indexes.」 |
| V4 | 🔴 `NONCLUSTERED PRIMARY KEY` 之限制 | 精確邊界放寬至 **1700 bytes**：850 字元（1700 bytes）`INSERT` 成功；851 字元（1702 bytes）拋錯同型 `#1946`（訊息改為 "...1700 bytes for nonclustered indexes."）——本文件因此發現任務書兩候選之外的**第三候選** C（見 §一 `GATE-001`） |
| V5 | 🔴 複合 PK（2 個字串鍵欄位）之限制計算方式 | **跨全部鍵欄位加總**，非逐欄獨立：225+225 字元（合計 900 bytes）`INSERT` 成功；400+400 字元（合計 1600 bytes）拋錯 `#1946`——證實任務書 `≤450` 公式僅對**單一**字串鍵欄位成立，複合鍵需依鍵欄位數量分攤 900-byte 預算（§一 `PKFINDING-005` 之推論由此實測坐實） |
| V6 | 字串值實際長度超過**宣告欄位長度**時之處理（非索引鍵超長） | **絕無靜默截斷**，兩種呼叫方式皆被拒絕：(a) tedious 參數若宣告有界型別（如 `NVarChar(50)`）而 JS 字串超長，driver 端 TDS 協定層即拋 `#8016`；(b) 參數若宣告 `NVarChar(MAX)`（不受限）而目標欄位為 `NVARCHAR(50)`，SQL Server 端拋 `#2628`「String or binary data would be truncated in table '...', column '...'. Truncated value: '...'」——兩者皆為明確拒絕，不會產生資料被悄悄裁切的隱患 |
| V7 | 🔴🔴 MSSQL 每 RPC 呼叫參數數量上限之確切邊界 | 精確邊界：**2098 個參數成功、2099 個參數起失敗**（拋 `#8003`「The incoming request has too many parameters. The server supports a maximum of 2100 parameters. Reduce the number of parameters and resend the request.」）——官方錯誤訊息文字寫「maximum of 2100」但透過本專案 `mssql`（tedious 底層）套件堆疊之**實際安全上限為 2098**，非文件字面 2100（driver 層 off-by-2，已實測非臆測） |
| V8 | 🔴 `OFFSET...FETCH` 無 `ORDER BY` 時之行為 | 立即拋錯 `#153`「Invalid usage of the option NEXT in the FETCH statement.」（確認 `ORDER BY` 為強制前提，且取得本環境實際錯誤文字，與坊間常引用之「An ORDER BY clause is required...」文字不同，測試斷言應以此實測文字為準） |
| V9 | `ORDER BY ... OFFSET ... ROWS FETCH NEXT ... ROWS ONLY` 分頁正確性（65 列 fixture） | 全數正確：`OFFSET 0 FETCH 50`→50 列（id 1-50）；`OFFSET 50 FETCH 50`→15 列（id 51-65）；`OFFSET 1000 FETCH 50`（超界）→0 列、不拋錯；`OFFSET 0 FETCH 65`（恰等於總數）→65 列 |
| V10 | `INFORMATION_SCHEMA.COLUMNS`（大寫）查詢形狀 | 正確回傳 `{column_name, data_type}`；`data_type` 為 MSSQL 系統目錄原生小寫字面值（`'int'`/`'nvarchar'`/`'datetime2'`/`'bit'`），非本服務自訂映射值 |
| V11 | `sys.indexes`+`sys.index_columns`+`sys.columns` join 查詢形狀 | 正確回傳 `{column_name, index_name, is_primary_key}`，PK 隱含 clustered index 與顯式 `CREATE INDEX` 皆正確識別、`is_primary_key` 正確區分 |
| V12 | 🔴 `information_schema.columns`（**小寫**系統檢視名稱本身**）** | 拋錯 `#208`「Invalid object name 'information_schema.columns'.」——確認本環境（`Chinese_Taiwan_Stroke_BIN`）BIN collation 之識別碼大小寫敏感**不僅限於資料值比對，亦及於系統檢視物件名稱本身**，強化 `I-MSSQL-CATALOG-CASE-01` 適用範圍（原僅記錄欄位/資料層級案例） |
| V13 | 現行未修改程式碼字面 SQL 對 mssql 之陷阱（`insertBatch`/`getRawData`/`getColumnMetadata`/`getIndexedColumns`） | 全數確認拋錯，逐一取得確切錯誤代碼/文字：`?` 位置參數（WHERE 子句與多列 `VALUES` 皆同）→ `#102`「Incorrect syntax near '?'.」；`LIMIT ? OFFSET ?`（`getRawData()` 現行 else 分支字面）→ `#102`「Incorrect syntax near '?'.」；`PRAGMA table_info(...)`/`PRAGMA index_list(...)`（`getColumnMetadata`/`getIndexedColumns` 現行 sqlite 分支字面）→ `#102`「Incorrect syntax near '\<tablename\>'.」（`PRAGMA` 本身未被辨識為保留字，解析器在下一個 token 才報錯） |

**尚未能真庫驗證、仍需 tdd-impl 於實作階段確認之項目**：`GETIDXCOLS-004`（>100,000 列觸發 `getRawData()` 警告訊息之完整路徑，屬重量級 fixture，設計階段未建置，Observability 非阻擋）；候選 A/B/C 之**業務選型**本身（見 §一 `GATE-001`，屬架構/業務決策而非可真庫驗證的技術事實，test-designer 依角色分工不可代為決定）。

---

> **★ test-designer 逐檔查證之關鍵事實（本文件測試設計核心依據，含上表真庫實測之推論延伸）**：
>
> 1. **🔴🔴（本文件最高風險發現，範圍擴大於任務書字面）`getRawData`/`getColumnMetadata`/`getIndexedColumns`/`insertBatch`（含 `createRawTable`/`tableExists`/`getTableColumns`）於 postgres/sqlite 亦零既有覆蓋**：逐一 grep `apps/api/src` 全部 `.spec.ts`/`.e2e-spec.ts`，確認 `raw-data.service.spec.ts`（既有 baseline）**僅**涵蓋 `formatCopyValue`/`supportsCopy`/`openCopyWriter` 三者；`extraction-execution.service.spec.ts` 對 `RawDataService` 全為 mock，從未真實呼叫；**無任何 e2e spec** 涵蓋 `/extraction-tasks/:id/raw-data` 端點。意即本文件待修的 4 個方法，在任何 driver（含既有已運作多年的 postgres/sqlite）皆無回歸保護網——本文件 §七 REG 因此不能僅「確認既有測試不變」（無既有測試可確認），必須**同時為 postgres/sqlite 建立此前不存在的基準覆蓋**，否則本輪修法本身即是一次無安全網的變更。
> 2. **`getRawData()` 呼叫鏈存在嚴格依賴順序，只修分頁語法不足以讓瀏覽 API 動起來**：`getRawData()` 步驟 3 呼叫 `getColumnMetadata()`（現行 mssql 落 `PRAGMA table_info` 分支，V13 已實測對真實 MSSQL 直接拋 `#102`）**先於**步驟 7 之分頁查詢。即使只有分頁語法（`LIMIT ? OFFSET ?`）本身是唯一被任務書明確點名的症狀，`getColumnMetadata()` 才是真正擋在最前面的缺口——三個方法（`getColumnMetadata`/`getIndexedColumns`/分頁片段）**必須一起修**，否則 `getRawData()` 在 `DB_TYPE=mssql` 下 100% 於第 3 步就失敗，分頁修好與否無法被觀察到。
> 3. **CREATETABLE-FINDING 已有真實 MSSQL 實測證據，非本文件新發現**：`raw-data.service.mssql.spec.ts` 現行第 151-160 行已有一個對真實 CDMP_TEST 通過的陷阱測試（`svc.createRawTable(t, [{name:'CUST_NO', dataType:'varchar', isPrimary:true}])` → `rejects.toThrow()`）。本文件建立於此既有已驗證事實之上，核心新增工作是「修法後」的正確行為驗證。
> 4. **🔴🔴 任務書候選 (a)「PK/index 字串欄改有界 `NVARCHAR(≤450)`」之假設前提本身不準確，須依 V2/V3 重新表述**：任務書隱含「450 字元上限是讓 `CREATE TABLE` 成功的門檻」，但 V2 已證實**任意** `n≤4000`（非僅 450）皆能讓 `CREATE TABLE` 成功——真正決定 DDL 成敗的只有「是否為 `MAX`」型別。`450`（900 bytes）真正的意義是 V3 已證實之 **INSERT 時**索引鍵長度上限，且**與宣告欄位長度無關，只看實際寫入值的 byte 長度**。這代表：候選 (a) 若僅宣告 `NVARCHAR(450)`，並不能保證真實客戶編號一定 ≤450 字元——只要來源系統存在任何 >450 字元（900 bytes）的客戶編號字面值，INSERT 仍會在該筆資料上拋 `#1946`，即使宣告欄位長度遠大於 450（如宣告 `NVARCHAR(4000)`）也無法迴避此 INSERT 時限制。已納入 §一 `GATE-001` 重新表述 + `PKFINDING-003`/`004`/`005`。
> 5. **🔴 V4（`NONCLUSTERED PK` 放寬至 1700 bytes）揭露任務書未提及的第三候選 C**：將來源 PK 宣告為 `NONCLUSTERED PRIMARY KEY`（而非預設 `CLUSTERED`），輔以 `_cdmp_id IDENTITY` 作為實際的 `CLUSTERED` 實體排序鍵，可同時保留「來源 PK 由資料庫層真實強制唯一性」與「更寬裕的 1700-byte 安全邊界（850 字元，約為候選 (a) 的近兩倍）」。此為本文件於真庫實測過程中發現、任務書未列出之第三個合理方案，已納入 §一 `GATE-001` 與候選 (a)/(b) 並列供決策，test-designer 依角色分工不代為選擇。
> 6. **🔴 候選 (b)「mssql 一律忽略來源 PK 改用 `_cdmp_id`」之「一律」範圍存在模糊地帶，字面理解會回歸破壞現行已通過之 int/numeric 來源 PK 案例**：`raw-data.service.mssql.spec.ts` 既有 `CREATETABLE-003`（單一/複合 PK，皆為 `int`/`bigint`）現行對真實 MSSQL 通過，證明**非字串**型來源 PK 於 MSSQL 原生相容、無需任何修法（int/bigint 之 byte 長度天生遠低於 900-byte 門檻，不受 V3/V5 影響）。若 tdd-implementation 依字面「一律」實作，會使這個現行正確行為被不必要地改變——設計為決策關卡要求 tdd-implementation 明確界定範圍。
> 7. **🔴🔴 `insertBatch()` 現行非 postgres 分支 `maxRowsPerInsert = rows.length`（完全不做切片），V7 已實測確切上限為 2098 個參數**：現行僅 postgres 分支有 `PG_PARAM_LIMIT=65000` 切片邏輯；`else` 分支（`DB_TYPE=mssql` 時亦落入）對任何列數/欄數皆一次性塞進單一 INSERT。V7 已實測確切邊界（2098 OK / 2099 FAIL），已納入 §五 `INSERTBATCH-003` MUST-FIX，門檻建議值已可直接給出（見 §五）。
> 8. **本專案已有成熟、已驗證的「具名參數 + `driver.escapeQueryWithParameters`」慣例（Pattern B），可直接援用解決 `insertBatch` 之跨 driver 佔位符問題**：`assignment-run-pipeline.service.ts:1517-1554`（`AD-E07-38 P1c` 起沿用至今）示範將 PG 專屬位置參數改寫為 `:param` 具名參數後，委派 `manager.connection.driver.escapeQueryWithParameters(sql, paramsObject, {})` 展開為各 driver 對應語法（PG `$1`/MSSQL `@0`/SQLite `?`），回傳 `[sql, parameters]` 供 `manager.query()` 執行。`insertBatch()` 現行 postgres/else 二分支手刻 placeholder 正是這個已解決問題類別的同構重演。已納入 §五 `GATE-001` 建議設計。
> 9. **觀察性備註（非本文件範圍要求）：`getColumnMetadata()`（private，回傳 `RawDataColumn[]` 含 `dataType`/`isSystem`）與已於 P4e 修好的 `getTableColumns()`（public，回傳 `string[]` 僅名稱）於 mssql 情境下皆需查詢 `INFORMATION_SCHEMA.COLUMNS`，邏輯高度重疊**——是否合併為單一共用查詢屬實作細節，交 tdd-implementation 自行判斷，本文件不予置喙、不列入 DoD。
> 10. **`getIndexedColumns()` 之呼叫時機受 `totalCount > 100000` 硬編碼字面值把關（非 injectable）**：完整觸發此路徑之 E2E 情境需要 >100,000 列真實資料，屬重量級 fixture，設計階段未建置（見「尚未能真庫驗證」段）。本文件涵蓋 `getIndexedColumns()` 方法本身之正確性（V11 已實測其 SQL 查詢形狀正確），完整 100,000 列觸發路徑列為 Observability、非阻擋（§三 `GETIDXCOLS-004`）。

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件全部（**尤其「★★ 真庫已驗證事實」表，直接作為斷言依據，無需重新探索**） + `raw-data.service.ts`/`extraction-execution.service.ts`/`get-raw-data.dto.ts`（本文件全部查證之原始碼）+ `mssql-env-preload.ts`（既有 gating helper 沿用）+ `raw-data.service.mssql.spec.ts`/`raw-data.service.mssql-unit.spec.ts`（既有 Harness 手法起點，含既有 CREATETABLE-FINDING 陷阱測試，本輪需更新為目標行為驗證）+ `assignment-run-pipeline.service.ts:1517-1554`（Pattern B 具體先例） |
| QA / Tester | 本文件 + `risks-and-gaps.md`（本文件對應風險段落） |
| DevOps / CI/CD | 本文件「零、測試環境與 Harness 設計」（沿用既有 CDMP_TEST，無需新增基礎設施） |

---

## 零、測試環境與 Harness 設計

### 0.1 沿用既有 Harness，不新增基礎設施

沿用 `mssql-env-preload.ts`（`MSSQL` 連線常數、`mssqlPortReachable`、`restoreDbType`）+ `raw-data.service.mssql.spec.ts` 既有直接建構手法（`new DataSource({type:'mssql',...})` 自建、`new RawDataService(ds, null as any, null as any)`、`rawName()`/`count()`/`guard()` helper）。**不需**透過 `_p4a-mssql-harness.ts`（該 harness 服務 ETL handler 之 `##` 暫存表流程，與本文件待測物件無關）。CDMP_TEST 同一容器資料庫沿用（`cdmp-mssql`，`localhost:1433`，本文件設計階段已確認可連線並實測，見上表），不新增 test-only 基礎設施。

PG 側因查證發現 1（`raw-data.service.spec.ts` 對這 4 個方法零覆蓋），本文件 §七 REG 需**新建**最小 postgres 基準測試（沿用既有 `raw-data.service.spec.ts` 之 dev PostgreSQL `5432`/`cdmp_dev` 慣例，非 `postgres-test:5433`，專屬 throwaway 表名建/清）。

`vi.setConfig({ testTimeout: 30000 })`，比照 P4e。

### 0.2 單元層（免真實連線）vs 整合層（真實 MSSQL）分層

比照 `raw-data.service.mssql-unit.spec.ts` 之 `makeCap(type)` fake DataSource 手法：純函式/DDL 字串產生（若涉及）可免真實連線驗證；實際查詢執行/round-trip 則需真實 MSSQL（CDMP_TEST），比照既有 `mssqlPortReachable()` gating，不可達時 `describe.skip` + `SKIP_REASON`，絕不假造綠燈。本文件設計階段之真庫實測（見上表）已確認該環境可正常連線並執行全部待測 SQL 型態，tdd-implementation 執行時預期同樣可達；若執行當下不可達，仍依既有 gating 慣例誠實 skip，不得因本文件已於設計階段驗證過而假設「這次也一定連得上」。

私有方法（`getColumnMetadata`/`getIndexedColumns`）比照既有慣例以 `(svc as any).methodName(...)` 直接呼叫，不透過完整 `getRawData()` 鏈路（避免受限於查證發現 2 之呼叫順序依賴，可獨立進行故障隔離）。

### 0.3 Fixture 設計原則

- **§一 PKFINDING**：需 4 類合成表：單一字串 PK（`CUST_NO varchar`）、複合純字串 PK（2 個字串鍵欄位）、複合混合 PK（1 int + 1 字串鍵欄位）、（若候選 C 納入）`NONCLUSTERED PK` + `_cdmp_id` 雙鍵情境。實際建表案例依 §一 `GATE-001` 決策落地之候選（A/B/C）而定，各候選皆需設計對應驗證案例（比照 P4e `TYPEMAP-003` 之雙軌/多軌決策關卡格式）。
- **§二/§三 GETCOLMETA/GETIDXCOLS**：複用 P4e 既有 `MIXED_COLS`（6 欄涵蓋整數/布林/大整數/日期/decimal-as-text/字串型別家族）建表；另需對其中一個非 PK 欄位顯式 `CREATE INDEX` 供 `getIndexedColumns()` 產生「已索引 vs 未索引」對照（比照上表 V11 已驗證之查詢形狀）。
- **§四 GETRAWDATA-PAGE**：建一張 raw 表灌入已知筆數（建議 ≥ 60 列，比照上表 V9 實測 fixture 規模 65 列，確保 `limit=50` 情境可跨頁），欄位含至少一個可排序業務欄位（如整數序號）供 `sortBy` 測試；另需一張**有來源 PK**（故無 `_cdmp_id`）之表，驗證預設 `ORDER BY` 欄位選擇於此情境仍正確。
- **§五 INSERTBATCH**：合成寬表（建議 21 欄，比照上表 V7 實測 fixture）+ 受控列數，用以逼近/跨越 2098 參數上限（21 欄 × 99 列 = 2079 OK；21 欄 × 100 列 = 2100 已超過確認上限）；一般正確性 fixture 涵蓋中文/NULL/日期/decimal-as-text/特殊字元（單引號等）。此類合成表毋須依賴任何真實外部來源，`ColumnMetadata`/`insertBatch` 之欄位與列皆可任意合成。

### 0.4 與 P4e 既有測試檔案之關係

`raw-data.service.mssql.spec.ts` 現行第 151-160 行之 `CREATETABLE-FINDING` 陷阱測試（`.rejects.toThrow()`）**必須**於本輪修法後更新為目標行為驗證（依決策落地之候選 A/B/C 產生新的斷言），**不得**放任其繼續斷言「拋錯」而讓修法後的 CI 陷入「舊陷阱測試持續綠燈但其實已與新行為矛盾」的假訊號狀態。已納入 §一 `PKFINDING-002` MUST-FIX housekeeping。

---

## 一、PKFINDING — CREATETABLE-FINDING 修法驗證（🔴🔴 本文件最高優先，查證發現 3/4/5/6，V1-V6 已真庫驗證）

### TS-MSSQL-P4FU-PKFINDING-GATE-001（🔴🔴 決策關卡，三候選皆已真庫驗證可行，純屬業務/架構選型）：候選修法選擇
- **Related Requirement**：任務書兩候選 + 本文件真庫實測發現之第三候選；查證發現 4/5/6；V1-V6
- **Test Type**：Decision Gate（文件化守門，MUST-FIX）
- **Expected Result**：impl log 須明確記錄：
  1. **選擇候選 (a)「PK/index 字串欄改有界 `NVARCHAR(n)`（`CLUSTERED`，預設）」、候選 (b)「mssql 一律用 `_cdmp_id` surrogate PK（`CLUSTERED`），字串欄留 `NVARCHAR(MAX)` 非 PK」、或本文件真庫實測新發現之候選 (c)「字串來源 PK 宣告為 `NONCLUSTERED PRIMARY KEY` + `_cdmp_id IDENTITY` 作 `CLUSTERED` 排序鍵」；理由**。三者皆已於設計階段對真實 MSSQL 驗證技術可行（V1-V6），純屬業務語意/資料完整性要求的選型問題，非技術可行性問題，tdd-implementation/architect 應依實際來源系統客戶編號長度分布與是否需要 DB 層唯一性約束來決定
  2. **🔴 重要澄清（V2/V3 已推翻任務書隱含假設）**：無論選哪個候選，宣告 `NVARCHAR(n)` 之 `n` 值大小**不影響** `CREATE TABLE` 是否成功（V2：任意 `n≤4000` 皆成功，只有 `MAX` 會在 DDL 階段失敗）；真正的風險是 **INSERT 時**依實際值 byte 長度判定（V3：clustered 900 bytes / V4：nonclustered 1700 bytes），且與宣告長度無關，只看實際寫入值。若選 (a)，須明確記錄是否額外加上應用層前置檢查（寫入前若偵測到來源值 >450 字元即提前拒絕/告警，而非讓其在 MSSQL INSERT 階段才失敗）——本文件不代為決定是否需要此類前置檢查，但須記錄此風險依然存在（宣告 `NVARCHAR(450)` 本身**不能**保證所有客戶編號值一定 ≤450 字元）
  3. 若選 (a) 且涉及複合 PK：須明確記錄複合 PK 含多個字串鍵欄位時之公式修正（V5：900 bytes 為全部鍵欄位加總，非固定 450 字元／欄；若複合鍵混合 int + 字串，字串鍵欄位仍需與其餘鍵欄位加總後 ≤900 bytes）
  4. 若選 (b)：須明確記錄「一律」之確切範圍（僅字串型來源 PK 觸發 vs 不分型別一律改用 surrogate），並記錄此選擇對既有 `CREATETABLE-003`（int/bigint 來源 PK 現行通過）斷言之影響（維持不變 vs 需要更新）；須記錄來源 PK 唯一性不再由資料庫層 `PRIMARY KEY` 約束強制之後果
  5. 若選 (c)：須記錄 1700-byte（850 字元）上限是否對真實來源客戶編號長度分布已足夠寬裕，以及維持兩個索引鍵（`NONCLUSTERED` 業務鍵 + `CLUSTERED` `_cdmp_id`）之額外儲存/寫入成本是否可接受

---

### TS-MSSQL-P4FU-PKFINDING-002（🔴 MUST-FIX housekeeping）：既有 `CREATETABLE-FINDING` 陷阱測試更新為目標行為驗證
- **Related Requirement**：查證發現 3；§0.4
- **Test Type**：Regression housekeeping（MUST-FIX）
- **Preconditions**：`GATE-001` 決策已落地
- **Expected Result**：`raw-data.service.mssql.spec.ts` 現行第 151-160 行之陷阱測試（單一字串 PK → `rejects.toThrow()`）依決策落地之候選，改為驗證目標行為（候選 (a)：`resolves`+round-trip；候選 (b)：`resolves`+`_cdmp_id` 產生+字串欄非 PK；候選 (c)：`resolves`+雙索引鍵皆存在）。**不得**保留舊斷言不動

---

### TS-MSSQL-P4FU-PKFINDING-003（🔴🔴 MUST-FIX，DoD 核心，V2/V3 已真庫驗證，若選候選 (a)）：單一字串 PK 建表成功 + INSERT 時 900-byte 邊界正確
- **Related Requirement**：候選 (a)；V2/V3
- **Test Type**：Positive + Boundary / Integration — 條件式 DoD 核心（依 `GATE-001` 決策是否適用）
- **Steps**：`createRawTable(t, [{name:'CUST_NO', dataType:'varchar', isPrimary:true}])`；插入 (i) 一般長度中文/字串值、(ii) 恰為宣告長度上限之值、(iii) byte 長度恰為 900 之值
- **Expected Result**：建表不拋錯（V2）；`CUST_NO` 欄實際型別為有界 `NVARCHAR(n)`（非 `MAX`）；PK 約束存在（`sys.indexes` 可查得 `is_primary_key=1`，比照 V11 已驗證查詢形狀）；一般值 round-trip 正確；恰 900 bytes 之值成功寫入（V3 邊界內）

---

### TS-MSSQL-P4FU-PKFINDING-004（🔴🔴 MUST-FIX，V3/V6 已真庫驗證，若選候選 (a)）：字串值 INSERT 時超過 900-byte 索引鍵上限之拒絕行為
- **Related Requirement**：V3；查證發現 4 之風險提示
- **Test Type**：Negative / Integration — **DoD 核心案例（已由 V3/V6 確認為明確拒絕，非不確定 Probe）**
- **Steps**：對已建立之字串 PK 欄，插入 byte 長度恰為 901（451 字元）之值
- **Expected Result**：MSSQL 明確拒絕（`#1946`「...exceeds the maximum length of 900 bytes for clustered indexes.」，V3 已實測確切訊息），**非**靜默截斷（V6 已排除截斷可能性）。tdd-implementation 若選擇不做應用層前置檢查（見 `GATE-001` 第 2 項），此測試案例即代表「該筆真實資料寫入時會失敗，須由呼叫端妥善處理此例外」之既定行為，須於 impl log 記錄此為已知且刻意接受之限制

---

### TS-MSSQL-P4FU-PKFINDING-005（🔴🔴 MUST-FIX，V5 已真庫驗證，若選候選 (a)）：複合 PK 含 2 個字串鍵欄位之 900-byte 加總限制
- **Related Requirement**：查證發現 4；V5
- **Test Type**：Positive + Negative / Integration — **DoD 核心案例（V5 已實測邊界，非不確定假設）**
- **Steps**：對複合 PK（2 個字串鍵欄位）分別插入 (i) 合計 900 bytes（如 225+225 字元）之值、(ii) 合計超過 900 bytes（如 400+400 字元）之值
- **Expected Result**：(i) 成功寫入；(ii) 拒絕（`#1946`，V5 已實測確切訊息）——此為 MUST-FIX 紅燈守門，逼 tdd-implementation 於 `GATE-001` 第 3 項依 V5 之公式修正認知（900 bytes 為全部鍵欄位加總預算，非固定 450 字元／欄）設計欄位宣告長度分配策略

---

### TS-MSSQL-P4FU-PKFINDING-006（🔴 MUST-FIX，若選候選 (b)）：`_cdmp_id` surrogate PK + 字串來源欄非 PK
- **Related Requirement**：候選 (b)
- **Test Type**：Positive / Integration — 條件式 DoD 核心
- **Expected Result**：`createRawTable(t, [{name:'CUST_NO', dataType:'varchar', isPrimary:true}])` 建表成功；`_cdmp_id INT IDENTITY(1,1) PRIMARY KEY` 存在；`CUST_NO` 欄型別仍為 `NVARCHAR(MAX)` 但**非** PK/index key（`sys.indexes` 查無以 `CUST_NO` 為鍵之索引，比照 V11 查詢形狀）；資料完整寫入/讀回，含超過 900 bytes 之長字串值（此候選天生不受 V3/V5 限制，為其相對候選 (a)/(c) 的結構性優勢）

---

### TS-MSSQL-P4FU-PKFINDING-007（🔴 MUST-FIX，若選候選 (c)，V4 已真庫驗證）：`NONCLUSTERED` 業務鍵 + `_cdmp_id` `CLUSTERED` 雙鍵
- **Related Requirement**：查證發現 5；V4
- **Test Type**：Positive + Boundary / Integration — 條件式 DoD 核心
- **Steps**：建表使字串來源 PK 為 `NONCLUSTERED PRIMARY KEY`，另建 `_cdmp_id IDENTITY(1,1)` 作 `CLUSTERED` 索引；插入 (i) 一般值、(ii) 恰 1700 bytes（850 字元）之值、(iii) 1702 bytes（851 字元）之值
- **Expected Result**：建表成功；(i)(ii) 成功寫入（V4 邊界內）；(iii) 拒絕（`#1946`「...1700 bytes for nonclustered indexes.」）；兩索引皆可由 `sys.indexes` 查得（一 clustered 一 nonclustered，`is_primary_key` 標記於 nonclustered 該筆）

---

### TS-MSSQL-P4FU-PKFINDING-008（🔴 MUST-FIX，落地驗證，呼應 `GATE-001` 第 4 項）：候選 (b) 之「一律」範圍決策已正確落地
- **Related Requirement**：查證發現 6
- **Test Type**：Decision-landing verification / Integration
- **Steps**：對純 int 來源 PK（單一與複合）情境，依 `GATE-001` 決策記錄之範圍，執行 `createRawTable`
- **Expected Result**：若決策為「僅字串型觸發」→ int/bigint 來源 PK 行為與現行 `CREATETABLE-003` 完全一致（inline/table-level `PRIMARY KEY`，不受本輪修法影響）；若決策為「不分型別一律」→ int/bigint 來源 PK 情境同樣改用 `_cdmp_id`，且 `CREATETABLE-003` 既有斷言須同步更新（impl log 須明確記錄此為刻意變更，非意外回歸）

---

### TS-MSSQL-P4FU-PKFINDING-009（Regression）：既有 `CREATETABLE-002`/`GETTABLECOLUMNS-001`/`TABLEEXISTS-002`（P4e 已驗證）不受本輪修法影響
- **Related Requirement**：本輪僅異動字串 PK 分支邏輯，非字串/無 PK 情境不應變化
- **Test Type**：Regression / Integration

---

### TS-MSSQL-P4FU-PKFINDING-010（Boundary）：混合 PK（1 int + 1 字串鍵欄位）之複合情境
- **Related Requirement**：交叉驗證 `GATE-001`/`PKFINDING-005`/`PKFINDING-008` 決策已一致落實
- **Test Type**：Boundary / Integration
- **Expected Result**：依所選候選，驗證混合型複合 PK 之最終建表結果與純字串複合 PK（`PKFINDING-005`）、純 int 複合 PK（`PKFINDING-008`）決策邏輯一致（不出現「只處理純字串複合、漏掉混合複合」的部分修復）；混合情境之 byte 預算計算須含 int 欄位本身佔用之 bytes（如 `INT`=4 bytes），非僅計入字串欄位

---

## 二、GETCOLMETA — `getColumnMetadata()` mssql 分支（🔴 DoD 核心，查證發現 1/2/9，V10/V12/V13 已真庫驗證）

### TS-MSSQL-P4FU-GETCOLMETA-GATE-001（決策關卡，查詢形狀已真庫驗證）：mssql 分支設計
- **Related Requirement**：查證發現 1/2；比照已於 P4e 修好之 `getTableColumns()` `INFORMATION_SCHEMA.COLUMNS`（大寫，I-MSSQL-CATALOG-CASE-01）手法；V10/V12
- **Test Type**：Decision Gate（文件化守門）
- **Expected Result**：impl log 記錄改法（建議：`this.dbType` 三分支 `if (isPostgres) ... else if (isMssql) ... else (sqlite)`，**不要**在既有 `if (isPostgres)` 之 `else` 內巢狀插入 `isMssql` 判斷）；mssql 分支查詢 `INFORMATION_SCHEMA.COLUMNS`（**必須大寫**，V12 已實測小寫 `information_schema.columns` 拋 `#208`「Invalid object name」；`TABLE_SCHEMA='dbo'`，依 `ORDINAL_POSITION` 排序），`dataType` 取 `DATA_TYPE` 原始字面（V10 已實測為 `'int'`/`'nvarchar'`/`'datetime2'` 等小寫值，非本服務自訂映射值，與 postgres 分支語意對稱）；查證發現 9 之觀察性備註記入 impl log 供未來參考，不強制本輪處理

---

### TS-MSSQL-P4FU-GETCOLMETA-001（🔴 MUST-FIX，陷阱佐證，V13 已真庫驗證）：現行未修改 `getColumnMetadata()` 對 mssql 之陷阱
- **Related Requirement**：查證發現 1；V13
- **Test Type**：Negative / Integration — 陷阱佐證（**已由 V13 確認拋 `#102`「Incorrect syntax near '\<tablename\>'.」，非不確定假設**）
- **Steps**：直接呼叫 `(svc as any).getColumnMetadata(rawTableName)`（比照既有私有方法呼叫慣例，繞開 `getRawData()` 完整鏈路以做故障隔離）
- **Expected Result**：對真實 CDMP_TEST 拋錯，錯誤代碼/文字符合 V13 實測（`#102`）

---

### TS-MSSQL-P4FU-GETCOLMETA-002（🔴 MUST-FIX，DoD 核心）：mssql 分支正確回傳欄位 metadata
- **Related Requirement**：查證發現 1；V10/V11
- **Test Type**：Positive / Integration — **DoD 核心案例**
- **Preconditions**：raw 表已依既有 P4e `CREATETABLE-002` 建立（`MIXED_COLS` fixture）
- **Expected Result**：回傳 `RawDataColumn[]` 依 `ordinal_position` 排序；`_cdmp_id`/`_cdmp_extracted_at` 之 `isSystem=true`，其餘業務欄位 `isSystem=false`；欄位數與 `getTableColumns()` 結果一致（交叉驗證）

---

### TS-MSSQL-P4FU-GETCOLMETA-003（Positive，V10 已真庫驗證）：`dataType` 回傳值家族對照
- **Related Requirement**：GATE-001 語意對稱要求；V10
- **Test Type**：Positive / Integration
- **Expected Result**：整數/字串/decimal-as-text/日期時間/布林各家族 `dataType` 回傳 `INFORMATION_SCHEMA.COLUMNS.DATA_TYPE` 原生字面（V10 已實測 `'int'`/`'nvarchar'`/`'datetime2'`/`'bit'`），非 `mapToMssqlType` 之 DDL 產生值（例：DDL 產生 `NVARCHAR(MAX)`，但 `DATA_TYPE` 回報為 `'nvarchar'`，此為 MSSQL 系統目錄之既定行為，非缺陷）

---

### TS-MSSQL-P4FU-GETCOLMETA-004（🔴 Regression，新建基準，呼應查證發現 1）：postgres/sqlite 既有行為建立回歸基準
- **Related Requirement**：查證發現 1（postgres/sqlite 現行零覆蓋）
- **Test Type**：Regression / Integration — **新建基準，非既有回歸確認**
- **Expected Result**：postgres 與 sqlite 各自對 `getColumnMetadata()` 建立最小行為快照（欄位名稱/`dataType`/`isSystem` 正確性），供未來任何修改比對；本輪修法本身不應改變此二分支行為

---

## 三、GETIDXCOLS — `getIndexedColumns()` mssql 分支（🔴 DoD 核心，查證發現 1/10，V11/V13 已真庫驗證）

### TS-MSSQL-P4FU-GETIDXCOLS-GATE-001（決策關卡，查詢形狀已真庫驗證）：mssql 分支設計
- **Related Requirement**：查證發現 1；比照 postgres 分支之 `pg_index`/`pg_class`/`pg_attribute` 系統目錄 join 精神；V11
- **Test Type**：Decision Gate（文件化守門）
- **Expected Result**：impl log 記錄改法（建議：MSSQL 無 `pg_index` 對等物，改用 `sys.indexes` + `sys.index_columns` + `sys.columns` 三表 join，V11 已實測此 join 正確回傳 `{column_name, index_name, is_primary_key}`，取得指定表全部索引（含 `PRIMARY KEY` 隱含之 clustered/nonclustered index）所覆蓋之欄位名稱集合）；三分支改法同 §二 `GATE-001`，非巢狀插入

---

### TS-MSSQL-P4FU-GETIDXCOLS-001（🔴 MUST-FIX，陷阱佐證，V13 已真庫驗證）：現行未修改 `getIndexedColumns()` 對 mssql 之陷阱
- **Related Requirement**：查證發現 1；V13
- **Test Type**：Negative / Integration — 陷阱佐證（**已由 V13 確認拋 `#102`，非不確定假設**）
- **Steps**：直接呼叫 `(svc as any).getIndexedColumns(rawTableName)`
- **Expected Result**：對真實 CDMP_TEST 拋錯（`PRAGMA index_list` 對 MSSQL 為非法語彙，`#102`）

---

### TS-MSSQL-P4FU-GETIDXCOLS-002（🔴 MUST-FIX，DoD 核心，V11 已真庫驗證查詢形狀）：已索引 vs 未索引欄位正確辨識
- **Related Requirement**：查證發現 1；V11
- **Test Type**：Positive / Integration — **DoD 核心案例**
- **Preconditions**：建表後對一個非 PK 業務欄位顯式 `CREATE INDEX`
- **Expected Result**：回傳集合正確包含 PK 欄位（隱含 clustered/nonclustered index，依 §一 決策而定）與顯式建索引之欄位；其餘一般業務欄位不在集合內（V11 已實測此 join 邏輯可正確區分）

---

### TS-MSSQL-P4FU-GETIDXCOLS-003（Boundary）：僅有 PK、無額外索引之表
- **Related Requirement**：邊界情境
- **Test Type**：Boundary / Integration
- **Expected Result**：回傳集合僅含 PK 欄位（單欄或複合 PK 全部欄位）

---

### TS-MSSQL-P4FU-GETIDXCOLS-004（Observability，非阻擋，設計階段未真庫驗證）：`totalCount > 100000` 完整 E2E 警告路徑觸發
- **Related Requirement**：查證發現 10
- **Test Type**：Observability（非阻擋，重量級 fixture，本文件設計階段未建置 >100,000 列表）
- **Expected Result**：若測試環境資源允許，建 >100,000 列表 + 非索引欄位 `sortBy`，驗證 `getRawData()` 回傳 `meta.warning` 正確產生；若環境資源不允許，`GETIDXCOLS-002`/`003` 已足以構成 DoD 核心佐證（其正確性已由 V11 之查詢形狀驗證支撐），本案例可選配不阻擋

---

## 四、GETRAWDATA-PAGE — 分頁查詢（`LIMIT ? OFFSET ?` → `OFFSET...FETCH`）（🔴🔴 DoD 核心，查證發現 2，V8/V9/V13 已真庫驗證）

> 本群組之 DoD 核心案例（`002` 起）依賴 §二/§三 已修復（`getRawData()` 呼叫鏈依序經過 `getColumnMetadata`/`getIndexedColumns`，見查證發現 2），故透過公開 `getRawData()` 整合驗證，而非孤立測試分頁片段本身（該片段內嵌於 `getRawData()` 方法本體，非獨立函式）。

### TS-MSSQL-P4FU-GETRAWPAGE-GATE-001（🔴🔴 決策關卡，`OFFSET...FETCH` 語法本身已真庫驗證，剩餘僅預設 `ORDER BY` 欄位為業務選型）：`OFFSET...FETCH` 語法 + 無 `sortBy` 時之預設 `ORDER BY` 欄位選擇
- **Related Requirement**：查證發現 2；V8/V9
- **Test Type**：Decision Gate（文件化守門）
- **Expected Result**：`OFFSET...FETCH` 需要前置 `ORDER BY` 已由 V8 實測確認（無 `ORDER BY` 拋 `#153`「Invalid usage of the option NEXT in the FETCH statement.」），分頁機制本身之正確性已由 V9 完整驗證（page1/page2/超界/恰等於總數四種情境皆正確），**不再是不確定假設**。impl log 僅需記錄預設 `ORDER BY` 欄位選擇方案。**🔴 重要澄清（推翻直覺假設）**：`_cdmp_id` **並非**保證存在——`createRawTable()` 現行僅於來源**無** PK 時才新增 `_cdmp_id`（`if (!hasPrimary)`），來源已有 PK 之表不含 `_cdmp_id`；反之 `_cdmp_extracted_at` **無條件**新增於全部三個 driver 分支（程式碼註解明載「Always add」），為唯一保證存在之欄位。建議二擇一或分層：(i) 簡單方案：無 `sortBy`（或 `sortBy` 未命中任何實際欄位）時一律 `ORDER BY "_cdmp_extracted_at"`；(ii) 更精確方案：偵測該表是否存在 `_cdmp_id`，存在則用之（單調遞增、保證唯一），不存在則退回來源 PK 欄位或 `_cdmp_extracted_at`。兩者皆為合理設計，決策交 tdd-implementation，但**不得**假設 `_cdmp_id` 恆存在

---

### TS-MSSQL-P4FU-GETRAWPAGE-001（🔴 MUST-FIX，陷阱佐證，孤立驗證，V13 已真庫驗證）：現行未修改分頁 SQL 字面對 mssql 之陷阱
- **Related Requirement**：查證發現 2；V13
- **Test Type**：Negative / Integration — 陷阱佐證，**孤立驗證**（不透過 `getRawData()`，因該完整鏈路會先卡在 `getColumnMetadata()`，見查證發現 2；本案例直接以 `ds.query()` 重現現行程式碼會產生的字面 SQL 文字，V13 已實測）
- **Steps**：對真實 MSSQL 執行字面等價於現行程式碼之 SQL：`` `SELECT * FROM "t" LIMIT ? OFFSET ?` ``，帶入位置參數
- **Expected Result**：拒絕執行（V13 實測 `#102`「Incorrect syntax near '?'.」），證明分頁片段本身之缺口獨立於 `getColumnMetadata()` 缺口存在

---

### TS-MSSQL-P4FU-GETRAWPAGE-002（🔴🔴 MUST-FIX，DoD 核心，V9 已真庫驗證機制正確性）：有 `sortBy` 情境下正確分頁
- **Related Requirement**：查證發現 2；依賴 §二/§三 已修復；V9
- **Test Type**：Positive / Integration — **DoD 核心案例**
- **Preconditions**：≥60 列 fixture（比照 V9 實測之 65 列規模），含可排序業務欄位
- **Steps**：呼叫公開 `getRawData(taskId, {page:1, limit:50, sortBy:'<業務欄位>', sortOrder:'asc'})`，再呼叫 `page:2`
- **Expected Result**：page1 回傳前 50 列（依 `sortBy` 遞增排序）；page2 回傳剩餘列；兩頁聯集等於全部列、無重複無遺漏（V9 已於原始 SQL 層級驗證此語法本身正確，本案例驗證 `getRawData()` 整合層是否正確組出等價 SQL）

---

### TS-MSSQL-P4FU-GETRAWPAGE-003（🔴🔴 MUST-FIX，決策落地驗證，V8 已真庫驗證錯誤形態）：無 `sortBy` 情境下仍正確執行不拋 `#153` 錯誤
- **Related Requirement**：`GATE-001` 落地驗證；V8
- **Test Type**：Positive / Integration — 決策落地驗證
- **Preconditions**：分別對「有來源 PK（無 `_cdmp_id`）」與「無來源 PK（有 `_cdmp_id`）」兩張表
- **Steps**：呼叫 `getRawData(taskId, {page:1, limit:50})`（不帶 `sortBy`）
- **Expected Result**：兩種表皆不拋 `#153` 錯誤，回傳確定性分頁結果（驗證 `GATE-001` 之預設 `ORDER BY` 方案於兩種欄位組合情境皆成立，尤其 `_cdmp_id` 不存在之情境不應假設其存在而崩潰）

---

### TS-MSSQL-P4FU-GETRAWPAGE-004（Boundary，V9 已真庫驗證）：`page` 超出總筆數
- **Related Requirement**：既有分頁計算邏輯延伸至 mssql；V9
- **Test Type**：Boundary / Integration
- **Expected Result**：`data=[]`（V9 實測 `OFFSET 1000 FETCH 50` 於 65 列表回傳 0 列、不拋錯），`meta.totalPages` 計算正確

---

### TS-MSSQL-P4FU-GETRAWPAGE-005（Positive）：`limit` 三種 DTO 允許值（50/100/200）
- **Related Requirement**：`get-raw-data.dto.ts` `@IsIn([50,100,200])`
- **Test Type**：Positive / Integration

---

### TS-MSSQL-P4FU-GETRAWPAGE-006（Positive）：`sortOrder='desc'` 正確反向排序
- **Related Requirement**：回歸確認（`OFFSET...FETCH` 對 `DESC` 排序無特殊語法限制）
- **Test Type**：Positive / Integration

---

### TS-MSSQL-P4FU-GETRAWPAGE-007（Boundary）：空表（`totalCount=0`）
- **Related Requirement**：邊界情境
- **Test Type**：Boundary / Integration
- **Expected Result**：`totalPages=0`，`data=[]`，不拋錯（呼應既有 `getRawData()` 現行 `totalCount>0 ? ... : 0` 邏輯，mssql 分支不應破壞此既有計算）

---

### TS-MSSQL-P4FU-GETRAWPAGE-008（🔴 Regression，新建基準）：postgres/sqlite 既有分頁行為建立回歸基準
- **Related Requirement**：查證發現 1
- **Test Type**：Regression / Integration — 新建基準

---

## 五、INSERTBATCH — `insertBatch()` mssql 化（🔴🔴 DoD 核心，查證發現 6/7/8，V6/V7/V13 已真庫驗證）

> 本群組覆蓋 `insertBatch()` 之兩個真實呼叫端場景：`extraction-execution.service.ts` incremental 模式迴圈（§175-244）+ full-mode 但來源 executor 不支援 streaming 之 fallback 迴圈（同一段程式碼，非本文件查證前 P4e 文字暗示之「僅 incremental」，見前言查證發現）。

### TS-MSSQL-P4FU-INSERTBATCH-GATE-001（🔴🔴 決策關卡）：跨 driver 佔位符設計
- **Related Requirement**：查證發現 6/8
- **Test Type**：Decision Gate（文件化守門）
- **Expected Result**：impl log 記錄改法。**建議**：援用本專案既有已驗證 Pattern B 慣例（`assignment-run-pipeline.service.ts:1517-1554` 具體先例）——將 VALUES 子句改為具名參數（如 `:r0c0,:r0c1,...`），委派 `this.dataSource.driver.escapeQueryWithParameters(sql, paramsObject, {})` 展開為各 driver 正確語法後執行，一次性讓 postgres/mssql/sqlite 三路徑統一經過同一段展開邏輯（取代現行 postgres/else 手刻兩分支）。若 tdd-implementation 選擇其他手法（如維持位置陣列但新增 mssql 專屬 `@0,@1,...` 生成器，不透過 `escapeQueryWithParameters`），須於 impl log 記錄理由，且仍須滿足 `GATE-002` 之 2098 參數切片需求

---

### TS-MSSQL-P4FU-INSERTBATCH-GATE-002（🔴🔴 決策關卡，V7 已真庫驗證確切邊界）：MSSQL 參數上限切片門檻具體數值
- **Related Requirement**：查證發現 7；V7
- **Test Type**：Decision Gate（**已由 V7 消除不確定性，非 Probe**）
- **Expected Result**：V7 已實測確切邊界：**2098 個參數成功、2099 個參數起拋 `#8003`**（官方訊息文字雖寫「maximum of 2100」，但本專案 `mssql` 套件堆疊之實際安全上限為 2098，非 2100，已排除臆測）。impl log 須記錄選定之切片門檻具體數值——**建議**比照既有 `PG_PARAM_LIMIT=65000` 之保守 buffer 慣例，取明顯低於 2098 之整數常數（如 2000），為未來套件版本/邊界差異保留安全餘裕，而非直接貼著 2098 使用

---

### TS-MSSQL-P4FU-INSERTBATCH-001（🔴 MUST-FIX，陷阱佐證，V13 已真庫驗證）：現行未修改 `insertBatch()` 對 mssql 之陷阱
- **Related Requirement**：查證發現 6；V13
- **Test Type**：Negative / Integration — 陷阱佐證（**已由 V13 確認拋 `#102`「Incorrect syntax near '?'.」，含單列與多列 `VALUES` 兩種情境皆已驗證**）
- **Steps**：對現行未修改 `insertBatch()`（mssql 落 `?` 分支）呼叫，插入至少一列
- **Expected Result**：拒絕執行，錯誤代碼/文字符合 V13 實測（`#102`），證明缺口存在

---

### TS-MSSQL-P4FU-INSERTBATCH-002（🔴🔴 MUST-FIX，DoD 核心，V6 已真庫驗證無靜默截斷）：mssql 分支正確插入，列數/逐欄值一致
- **Related Requirement**：查證發現 6；V6
- **Test Type**：Positive / Integration — **DoD 核心案例**
- **Expected Result**：目標表列數與插入列數一致；逐欄值（字串/整數/中文/NULL/日期/decimal-as-text）讀回精確相等；若欄位有長度上限而值超長，須明確拋錯而非靜默截斷（V6 已排除截斷可能，見 `#8016`/`#2628` 兩種拒絕路徑）

---

### TS-MSSQL-P4FU-INSERTBATCH-003（🔴🔴 MUST-FIX，DoD 核心，呼應 `GATE-002`/V7）：寬表大批次自動切片，跨越參數上限
- **Related Requirement**：查證發現 7；V7
- **Test Type**：Positive / Integration — **DoD 核心案例**
- **Preconditions**：21 欄合成表，101 列（21×101=2121，已超過 V7 實測之 2098 安全上限）
- **Steps**：單次 `insertBatch()` 呼叫（非呼叫端預先切片）
- **Expected Result**：內部自動切分為多個 INSERT 陳述式（每批參數數 ≤ `GATE-002` 選定門檻）；最終目標表列數 = 101（無遺漏無重複）；`insertBatch()` 回傳值 = 101

---

### TS-MSSQL-P4FU-INSERTBATCH-004（Boundary，V7 已真庫驗證確切邊界）：恰好等於切片門檻之邊界批次
- **Related Requirement**：`GATE-002` 落地驗證；V7（2098 OK / 2099 FAIL 之確切邊界）
- **Test Type**：Boundary / Integration
- **Expected Result**：恰好等於門檻（單一批次）與略超過門檻（跨批次）兩種情境皆正確處理；若門檻選定值低於 2098（如建議之 2000），邊界測試對象為選定門檻本身，而非 MSSQL 硬體上限 2098（切片邏輯之切點是實作選擇，非資料庫限制值）

---

### TS-MSSQL-P4FU-INSERTBATCH-005（Positive）：空 `rows` 陣列
- **Related Requirement**：既有 sqlite/postgres 行為延伸（`rows.length===0` 提早 `return 0`）
- **Test Type**：Positive / Integration
- **Expected Result**：回傳 `0`，不執行任何 SQL

---

### TS-MSSQL-P4FU-INSERTBATCH-006（🔴 Regression，新建基準）：postgres/sqlite 既有行為建立回歸基準
- **Related Requirement**：查證發現 1
- **Test Type**：Regression / Integration — 新建基準（含既有 `PG_PARAM_LIMIT` 切片邏輯之最小快照，確認本輪改法未動到 postgres 分支）

---

### TS-MSSQL-P4FU-INSERTBATCH-007（Positive，佐證性）：中文/單引號等特殊字元透過具名參數化天然防注入
- **Related Requirement**：`GATE-001` 具名參數化設計之附帶效益
- **Test Type**：Positive / Integration — 佐證性，非阻擋
- **Expected Result**：含 `'`/`"`/中文之字串值正確寫入不被誤判為 SQL 語法一部分（型別化參數協定天生防注入）

---

## 六、E2E-API — `getRawData()`/`insertBatch()` 公開入口全鏈路整合（🔴🔴 DoD 核心）

### TS-MSSQL-P4FU-E2EAPI-GATE-001（決策關卡）：Harness 建構方式
- **Related Requirement**：§0.1
- **Test Type**：Decision Gate（文件化守門）
- **Expected Result**：impl log 記錄採用之建構方式（**建議**：直接 `new RawDataService(真實 mssql DataSource, mock ExtractionTask repo, mock ExtractionLog repo)`，比照既有 `raw-data.service.mssql.spec.ts` 手法，非全量 Nest `TestingModule`）

---

### TS-MSSQL-P4FU-E2EAPI-001（🔴🔴 MUST-FIX，DoD 核心）：`getRawData()` 公開方法對真實 mssql 完整跑通
- **Related Requirement**：查證發現 2；§二/§三/§四 全部子修法之整合驗證
- **Test Type**：Positive / Integration — **DoD 核心案例**
- **Steps**：task lookup（mock repo）→ `tableExists`（P4e 已驗證）→ `getColumnMetadata`（§二）→ `COUNT(*)` → sortBy 驗證 →（視情況）`getIndexedColumns`（§三）→ 分頁查詢（§四）→ `lastLog` 查詢，全鏈串接
- **Expected Result**：不拋錯；`RawDataResponse` 結構完整（`meta`/`columns`/`data` 三欄皆正確填充）

---

### TS-MSSQL-P4FU-E2EAPI-002（Positive）：`columns` 回傳值與 `getColumnMetadata()` 直接呼叫結果一致
- **Related Requirement**：交叉驗證 §二
- **Test Type**：Positive / Integration

---

### TS-MSSQL-P4FU-E2EAPI-003（🔴 MUST-FIX，DoD 核心）：`insertBatch` 於 incremental 模式真實 wiring
- **Related Requirement**：查證發現 6/7；`extraction-execution.service.ts` §175-244 incremental 迴圈
- **Test Type**：Positive / Integration — **DoD 核心案例**
- **Preconditions**：mssql 目標，`task.mode='incremental'`（`canStream` 恆為 `false`，比照既有 P4e `DISPATCH-005` 範圍界定）
- **Expected Result**：incremental extraction 迴圈成功呼叫 `insertBatch()` 完成寫入，不落回舊有語法錯誤路徑

---

### TS-MSSQL-P4FU-E2EAPI-004（🔴 MUST-FIX，DoD 核心，查證修正 P4e `DISPATCH-005` 文字精確度）：`insertBatch` 於 full-mode 但來源不支援 streaming 之 fallback 路徑
- **Related Requirement**：前言查證——`canStream` 除 `task.mode!=='full'` 外，`executor.supportsStreaming`/`streamBatches` 缺失或回傳 `false` 亦會導致 `canStream=false`，使 full-mode 同樣落入 `insertBatch()` 迴圈，非僅 incremental 模式
- **Test Type**：Positive / Integration — **DoD 核心案例，本文件新增查證範圍**
- **Preconditions**：mssql 目標，`task.mode='full'`，executor mock 之 `supportsStreaming` 回傳 `false`（或未實作）
- **Expected Result**：`canStream=false`，落入 `insertBatch()` 慢迴圈路徑（非 P4e bulk 路徑），成功完成寫入不拋錯——證明本文件範圍正確涵蓋 P4e 原始 `DISPATCH-005` 文字未精確描述之第二個真實觸發場景

---

### TS-MSSQL-P4FU-E2EAPI-005（Regression）：P4e 既有 bulk 路徑（full-mode + streaming 來源）不受本輪異動影響
- **Related Requirement**：driver 分支互斥回歸
- **Test Type**：Regression / Integration
- **Expected Result**：`canStream=true` 情境仍正確 dispatch 至 `openBulkWriter()`（P4e 既有機制），非本輪新增/修改之 `insertBatch()` 路徑

---

## 七、REG — 回歸（🔴🔴 重新定調：postgres/sqlite 需新建基準，非既有回歸確認，查證發現 1）

### TS-MSSQL-P4FU-REG-001（DoD 紅線）：`npx tsc --noEmit -p tsconfig.build.json` 乾淨

---

### TS-MSSQL-P4FU-REG-002（🔴🔴 DoD 核心）：P4e 既有全部 mssql 測試套件（`mssql-unit.spec.ts`/`mssql.spec.ts`）不回歸
- **Related Requirement**：§0.4；§一 `PKFINDING-002`
- **Test Type**：Regression — **DoD 核心案例**
- **Expected Result**：P4e 既有測試全數通過，含依 §一 `GATE-001` 決策更新後之 `CREATETABLE-FINDING` 案例（更新後仍全綠，非刪除/停用）

---

### TS-MSSQL-P4FU-REG-003（🔴 DoD 核心，新建基準）：postgres 之 `getRawData`/`getColumnMetadata`/`getIndexedColumns`/`insertBatch` 建立最小基準覆蓋
- **Related Requirement**：查證發現 1
- **Test Type**：Regression — **DoD 核心案例，新建非確認既有**
- **Expected Result**：本輪修法完成後，postgres 分支之這 4 個方法首次擁有回歸保護網；斷言涵蓋正常分頁/正常 insert/正常 metadata 查詢，確認本輪 mssql 分支新增未動到既有 postgres 邏輯

---

### TS-MSSQL-P4FU-REG-004（🔴 DoD 核心，新建基準）：sqlite 之對應 4 方法建立最小基準覆蓋
- **Related Requirement**：查證發現 1；測試環境預設 driver
- **Test Type**：Regression — **DoD 核心案例，新建非確認既有**

---

### TS-MSSQL-P4FU-REG-005（Regression）：P4a/b/c/d/e 其餘 mssql 套件不回歸（driver-agnostic 模組邊界確認）
- **Related Requirement**：`raw-data.service.ts` 與 ETL engine handlers 屬完全不同模組
- **Test Type**：Regression

---

## 八、STATIC — 事實鎖定 / 決策記錄

### TS-MSSQL-P4FU-STATIC-001：既有方法簽章不變
- **Related Requirement**：本輪僅新增/修改 mssql 內部分支邏輯，`getColumnMetadata`/`getIndexedColumns`/`insertBatch`/`createRawTable` 對外簽章不變
- **Test Type**：Regression / Unit

---

### TS-MSSQL-P4FU-STATIC-002（🔴 決策記錄 MUST-FIX）：§一 PKFINDING 最終選擇之候選（a/b/c）+ 理由 + 900/1700-byte 邊界處理方式，須記入 impl log
- **Related Requirement**：`GATE-001`
- **Test Type**：Regression / Unit — 靜態確認 impl log 文件存在對應段落（非程式碼斷言）

---

### TS-MSSQL-P4FU-STATIC-003（🔴 決策記錄 MUST-FIX，V7 邊界已知，僅門檻選值待記錄）：§五 INSERTBATCH 最終參數上限切片門檻具體數值，須記入 impl log
- **Related Requirement**：`INSERTBATCH-GATE-002`；V7
- **Test Type**：Regression / Unit — 靜態確認

---

## 附：與 memory「剩餘 Phase4」清單逐項對照

| memory `project_mssql_full_migration` 原文 | 本文件對應測試群組 |
|---|---|
| 「CREATETABLE-FINDING(字串來源 PK→NVARCHAR(MAX) 不可作 PK→有界或 `_cdmp_id`)」 | §一 PKFINDING（10 案例，含三候選決策關卡——任務書兩候選 + 本文件真庫實測發現之 `NONCLUSTERED` 候選 C + 900/1700-byte 邊界已真庫驗證 V1-V6） |
| 「extraction 家族(getColumnMetadata/getIndexedColumns/getRawData LIMIT?OFFSET?/insertBatch 2100)」 | §二 GETCOLMETA + §三 GETIDXCOLS + §四 GETRAWDATA-PAGE + §五 INSERTBATCH（合計 28 案例，參數上限已真庫確認為 2098 而非 2100，V7） |
| （P4e impl log §七 已預告，本文件查證擴大）「postgres/sqlite 於這 4 個方法亦零既有覆蓋」 | §七 REG-003/004（新建基準，非既有回歸確認） |
| （本文件新增查證）「`insertBatch` 亦於 full-mode 非 streaming 來源時觸發，非僅 incremental」 | §六 E2EAPI-004 |
| （使用者本輪明確要求）「能真庫證實的假設不留待 tdd-impl 驗證」 | 「★★ 真庫已驗證事實」表 V1-V13，涵蓋 PK 長度邊界/參數上限/分頁語法/catalog 查詢形狀/現行程式碼陷阱錯誤代碼，本機 dev MSSQL 2022 `cdmp-mssql` 實測，設計階段完成 |
| （task 需求）「三分支不破壞 postgres/sqlite」 | §七 REG 全群組 |
| （task 需求）「harness 沿用 P4/P5 自建策略，自足可獨立重跑」 | §零 全節 |
