---
type: test-design-infrastructure
test-spec-id: AD-E07-42-P3a
feature_name: MSSQL 全面遷移 P3a — Stage 1 篩選 raw SQL 引擎移植（stage1-sql-builder / stage1-customer-core-clause / stage1-sql-executor MSSQL 化；JS↔MSSQL 逐案件等價；AGE/正則字元類別高風險邊界）
priority: P0-MVP
related_spec:
  - /docs/specs/implementation-log/AD-E07-42-mssql-p3-raw-sql-engine.md（§0 customer_core 缺口已解、§1 driver 組織原則、§2.1 Stage1 逐站點方言轉換清單、§4 EQ 等價測試策略、§5 P3a 範圍/DoD、§7 不變式 I-MSSQL-ENGINE-EQ-01/I-MSSQL-REGEX-CHARCLASS-01）
  - /docs/specs/implementation-log/AD-E07-41-P4a-impl.md（QUOTE-003 雙引號識別碼決策關卡結論沿用不重議；CAST-EQ-002 空字串 LIKE 陷阱手法延伸）
  - /docs/test-specs/infrastructure/AD-E07-41-P4a-test.md（QUOTE/CAST-EQ 測試手法慣例沿用）
  - /docs/test-specs/infrastructure/AD-E07-41-P4d-test.md（0.x Harness 分層慣例、EQ-PG degradable 政策參考、PG 側共用既有表+前綴隔離+精準 DELETE 慣例移植依據）
  - apps/api/src/modules/assignment/stage1/__tests__/stage1-sql-pushdown.pg.spec.ts（P3a MSSQL 對應版本之逐案例模板，EQ/PORT/RUNEST/IDEM 四群組沿用）
  - apps/api/src/modules/assignment/stage1/__tests__/stage1-customer-core-clause.pg.spec.ts（P3a customer_core mssql 版對應模板，NULLEXC/JOIN/AGE/CITY/AND/EQ/JOINCARD/DEACT 群組沿用）
  - apps/api/src/database/migrations/mssql/1751884800000-MssqlBaselineSchema.ts（test-designer 逐行查證：ob_pool_data/ob_pool_data_list/ob_list_definition/assignment_run/ob_monthly_run_result/customer_core 皆已於 dbo 建表，本文件 Harness 設計核心依據）
covers: []
spec_version: "1.0"
date: 2026-07-08
last_updated: 2026-07-08
---

# AD-E07-42 P3a：MSSQL 全面遷移 — Stage 1 篩選 raw SQL 引擎移植 — 測試設計

> 本文件覆蓋 AD-E07-42「MSSQL 全面遷移 P3（Raw SQL 引擎移植）」之 **P3a 切片**（AD §2.1 Stage 1 逐站點清單 + §5 P3a 範圍/DoD）。P3 不經 spec-writer（AD §5「是否需要 spec-writer（RESOLVED：不需要）」已裁定，比照 P1/P2/P4 先例，本輪不重複論證）。
>
> **明確排除**：3b Stage 2~3 計分（`stage2to4-sql-builder.ts`，含 AGE 之另一獨立站點、`~` 正則轉換三站點、`to_jsonb` fallback 架構調整）、3c Stage 3/4 比例分派、3d CR 優先分派、3e `fn_calc_tier_level` 收尾，皆**不在本文件範圍**，勿提前實作或測試。
>
> **★ test-designer 逐檔查證發現之關鍵事實（本文件測試設計之核心依據，多項超出 AD §2.1 表格原始範圍）**：
>
> 1. **🔴🔴（本文件最高優先級發現，保證編譯期/執行期語法錯誤，AD 完全未提及）`stage1-sql-executor.ts:100` 之 `'CR' || cremp.emp_nm` 為 PG 專屬字串串接運算子**：AD §1.1 明文將 `stage1-sql-executor.ts` 定性為「組裝外殼...不需要重新設計 executor 層架構」，僅要求呼叫端新增 `DB_TYPE==='mssql'` 分支呼叫既有 executor。但 `runStage1SqlInsert` 之 `selectSql` 字面量本身內嵌 PG `||` 字串串接運算子（`CASE WHEN cremp.emp_id IS NOT NULL THEN 'CR' || cremp.emp_nm ELSE NULL END`，用於組裝 CR 業代顯示名稱 `cr_nm`），T-SQL **不支援** `||` 運算子（非合法語法，非僅語意不同），此陳述式在 MSSQL 上會 100% 拋語法錯誤。依本專案既有記憶模式（「PG DDL/DML 之隱式語法糖」類發現，其風險本質為保證失敗而非語意可能不一致），此站點之測試優先權應**高於** AD §2.1 表格內任何「風險：中」標註站點。**此發現直接推翻 AD §1.1「executor 層不需重新設計」之表述**——`runStage1SqlInsert` 之 `selectSql` 模板字面量本身即為 dialect-specific，MSSQL 版需要平行版本（可能為 `runStage1SqlInsertMssql` 或 executor 內部按 dialect 切換模板字串），非僅「呼叫端加分支」即可完成。已獨立立 §三 CONCAT 群組，優先權 MUST-FIX，見 risks-and-gaps.md R-MSSQL-P3A-01。
> 2. **🔴🔴 AD §2.1 表格建議之 AGE 轉換公式引數順序反轉，逐字套用會產生負值年齡（保證邏輯錯誤，非邊界語意落差）**：AD 表格建議 `DATEDIFF(YEAR,@ccWorkdt,cc.date_of_birth) - CASE WHEN ...`。T-SQL `DATEDIFF(datepart,startdate,enddate)` 語意為 `enddate 之 datepart 分量 − startdate 之 datepart 分量`。以 `startdate=@ccWorkdt`（如 2026-07-01）、`enddate=cc.date_of_birth`（如 1996-07-01）代入，結果為 `1996−2026=−30`（負值），而非預期之 `+30` 歲。正確引數順序應為 `DATEDIFF(YEAR, cc.date_of_birth, @ccWorkdt)`（`startdate=dob`、`enddate=workdt`，得 `2026−1996=+30`）；AD 建議之 `CASE` 子句（「未達當年生日不計」判斷）本身方向正確，僅 `DATEDIFF` 兩引數順序需對調。此為本專案既有記憶模式「套用 AD 建議之單行等價轉換公式前，必須自行推導邊界行為」之典型案例，且本例並非邊界語意落差而是**主值本身符號錯誤**，風險等級高於一般邊界案例。已獨立立 §四 AGE 群組 AGE-MSSQL-001 為 MUST-FIX 旗艦紅燈守門案例，見 risks-and-gaps.md R-MSSQL-P3A-02。
> 3. **中風險：year-above 前導數字擷取（`SUBSTRING(col FROM '^[0-9]+')`，無 `$` 錨點）與 P4a 已驗證之 `~ '^[0-9]+$'`（含 `$` 錨點，全字串驗證）為**不同的正則語意**，不可逐字複用 P4a 公式**：P4a `type-cast-handler-mssql.ts` 之 `NOT LIKE '%[^0-9]%'` + `LEN(x)>0` 手法解的是「驗證整個字串是否全為數字」（布林），而 Stage 1 year-above 要解的是「擷取字串**開頭**連續數字子字串」（如 `'1980abc'` → `'1980'`），語意層級不同（驗證 vs 擷取）。MSSQL 對應寫法需以 `PATINDEX('%[^0-9]%', col)` 定位第一個非數字字元位置，並處理「全數字」「首字元即非數字」「空字串」三種 `PATINDEX` 回傳 0 或誤判之邊界（`PATINDEX` 對空字串與「全字串皆為數字」在字面上皆回傳 0，需額外 `LEN(col)=0` 特判區分，此為 P4a 空字串陷阱之延伸新變體，非重複）。已獨立立 §五 YEARABOVE 群組，比照既有 PORT-001~007 全數逐一設計 MSSQL 對應邊界。
> 4. **中風險：Harness 環境依賴發現（AD §4.3 未涉及，本文件測試環境設計之核心前提）——Stage 1 raw SQL 產出之表名一律未加 schema 前綴，僅能解析至連線使用者之 DEFAULT_SCHEMA（`dbo`），且 `dbo` 已由 MSSQL baseline migration 建有 `ob_pool_data`/`ob_pool_data_list`/`ob_list_definition`/`assignment_run`/`ob_monthly_run_result`/`customer_core` 六張**與 P1b2/P4a~e 既有套件共用**之正式表**：test-designer 逐行查證 `1751884800000-MssqlBaselineSchema.ts`，確認上述六表皆已於 `dbo` 建立。這與既有 F099/F109 PG spec（`synchronize:true` 自建/自刪 `public` schema 之拋棄式副本、`AD-E07-39-P1b1-test.md` 之獨立 `p1b1` schema 隔離模式）**皆不適用**——前者若原樣移植至 MSSQL `dbo`，`DROP TABLE`/重 `synchronize` 會摧毀其餘 P1b2/P4 套件所依賴之共用 baseline 結構；後者之獨立 schema 隔離對 Stage 1 裸表名（無 schema 前綴）SQL 完全失效（無法定向至非 `dbo` schema）。**本文件 §零 Harness 設計已改採「共用既有 `dbo` 表 + 顯著前綴 / 專屬 run_id 隔離寫入列 + `afterEach`/`afterAll` 精準 `DELETE`（禁止 `DROP`/`TRUNCATE`）」策略**，移植自 P4d §0.3「PG 側對稱建構」原則。詳見 §零 0.2。
> 5. **低-中風險：query-composer（`buildStage1WhereConditions`）是否需要獨立 mssql 版之核實結論 = 傾向不需要，但仍設計一個精簡 regression 案例而非省略**：composer 全部輸出僅含雙引號識別碼（`"colname" IN (...)`/`BETWEEN`）與 ANSI `IN`/`BETWEEN`，符合 P4a `QUOTE-003` 已驗證「MSSQL（`QUOTED_IDENTIFIER ON` 預設）接受雙引號識別碼」之結論，且無其餘 PG 專屬語法。**傾向結論：不需要 `stage1-query-composer-mssql.ts`**，`buildStage1Sql` 之 mssql 版可直接 `import { buildStage1WhereConditions } from './stage1-query-composer'`（沿用 PG 檔）。因 QUOTE-003 原查證對象為 `##` 暫存表（`SELECT INTO`），本文件仍設計 `TS-MSSQL-P3A-GATE-001` 於**真實持久化基底表**（`dbo.ob_pool_data`）情境下複核一次（非重新開一個決策關卡，屬低成本高信心之 regression 確認）。
> 6. **「真實 customer_core 資料」語意澄清（避免 tdd-implementation 誤解 AD §0 措辭）**：AD §0 稱「customer_core 已於 P4 完整就緒...可直接對真實 customer_core 資料執行完整 JS↔MSSQL 逐列等價驗證」。test-designer 查證此語意為「`customer_core` 表結構已存在於 `dbo`（92 欄，P4-0）且 P4d 已證明可透過真實 56 節點 ETL pipeline 寫入合成 fixture 列」，**非**「CDMP_TEST 已有現成大量生產規模資料可供 P3a 任意查詢」。P3a 測試須比照 F109 PG spec 手法**自行以顯著前綴（如 `source_customer_no` 以 `P3A` 開頭）INSERT 合成測試列**至既有 `dbo.customer_core`，並於 `afterEach`/`afterAll` 精準刪除，**不得**假設查詢即得資料、亦**不得** `TRUNCATE`（該表為 P1b2/P4 系列共用）。
> 7. **customer_core 之 `source_customer_no` UNIQUE 約束於 MSSQL baseline 未查得對應索引/約束（與 PG baseline `customer_core_source_customer_no_key UNIQUE` 不對稱）**：test-designer grep `1751884800000-MssqlBaselineSchema.ts` 未發現 `source_customer_no` 相關 UNIQUE INDEX/CONSTRAINT 陳述式（僅確認 `CREATE TABLE`/`DROP TABLE` 存在）。此為**待查證項**（可能因該行極長被工具省略、或 MSSQL baseline 翻譯時確實遺漏），已設計 `TS-MSSQL-P3A-GATE-004` 決策關卡查證此約束是否存在，直接影響 I-CC-JOIN-CARD-01（JOIN 基數 ≤1:1）在 MSSQL 上是否有資料庫層防線或僅依賴 fixture 紀律，記入 risks-and-gaps.md。

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件全部 + `AD-E07-42-mssql-p3-raw-sql-engine.md`（§1、§2.1、§4、§5 P3a、§7）+ `stage1-sql-builder.ts`/`stage1-customer-core-clause.ts`/`stage1-sql-executor.ts`/`stage1-query-composer.ts`（PG 現行實作，逐字沿用不變）+ `stage1-sql-pushdown.pg.spec.ts`/`stage1-customer-core-clause.pg.spec.ts`（案例模板）+ `mssql-env-preload.ts`/`_p4a-mssql-harness.ts`（連線 harness）+ `1751884800000-MssqlBaselineSchema.ts`（dbo 既有表結構事實來源）+ `assignment-run-pipeline.service.ts`（`runStage1ForList`/`runStage1SqlPushdown`/`runStage1JsChain`，DISPATCH 群組直接依賴）+ `stage0-estimate.service.ts`（第二處 DB_TYPE gate） |
| QA / Tester | 本文件 + `risks-and-gaps.md`（MSSQL P3a 風險段落） |
| DevOps / CI/CD | 本文件「零、測試環境與 Harness 設計」（dbo 共用表策略，避免 CI 誤用 DROP/TRUNCATE 破壞其餘套件） |

---

## 零、測試環境與 Harness 設計

### 0.1 沿用既有 Harness 元件

`mssql-env-preload.ts`（`restoreDbType`/`MSSQL`/`mssqlPortReachable`/`SKIP_REASON`）不新增；連線設定沿用 `CDMP_TEST`（`docker compose --profile mssql up -d mssql mssql-init`）。不可達 → 整檔 `describe.skip` + 明確 `SKIP_REASON`（不假造綠燈，比照全部既有 `.mssql.spec.ts` 慣例）。`vi.setConfig({ testTimeout: 60000 })`（比照 `stage1-customer-core-clause.pg.spec.ts` 之 `feedback_pg_spec_parallel_timeout` 教訓，MSSQL 真連線同理需拉高預設 5s）。

### 0.2 🔴 Harness 核心策略：共用既有 `dbo` 表 + 前綴隔離 + 精準 DELETE（不可比照 P1b1 獨立 schema、不可比照 F099/F109 PG spec 之 DROP+re-synchronize）

依 §頂部查證發現 4，`buildStage1Sql`/`buildCustomerCoreClause`/`stage1-sql-executor.ts` 產出之 SQL 全數使用裸表名（`FROM ob_pool_data o`、`ob_pool_data_list`、`ob_monthly_run_result`、`customer_core` 等），僅能解析至連線 login 之 DEFAULT_SCHEMA（`dbo`），且 `dbo` 已由 MSSQL baseline migration（P1b2 產物）建有這些表，供 P1b2 parity 測試與 P4a~e ETL 測試共用。故：

- **beforeAll**：以 `OBJECT_ID('dbo.ob_pool_data','U')` 等探測**六張表是否已存在**（`ob_pool_data`/`ob_pool_data_list`/`ob_list_definition`/`assignment_run`/`ob_monthly_run_result`/`customer_core`）。存在 → 直接沿用，**不 synchronize、不 DROP**。不存在（CDMP_TEST 尚未完成 bootstrap）→ 依既有 `TS-MSSQL-P1B2-*` 慣例引導執行 baseline migration，本檔**不自建**這些表（自建版本可能與其餘套件對同一批表的既有假設衝突，見 GATE-002）。
- **測試列隔離**：比照 P4d §0.3「PG 側對稱建構」原則——`ob_list_definition.list_no` 一律以顯著前綴（如 `P3AL%`）、`ob_pool_data.appl_no` 前綴（如 `P3AA%`）、`customer_core.source_customer_no` 前綴（如 `P3AC%`）、`assignment_run.run_id` 使用固定測試專用 UUID 常數（比照 PG spec `RUN_ID` 常數）。
- **清理**：`afterEach`／`afterAll` 一律以 `DELETE ... WHERE <前綴欄位> LIKE 'P3A%'`（或等效 run_id/list_no 條件）精準刪除本檔寫入列，**禁止** `TRUNCATE`/`DROP TABLE` 對上述六張共用表執行（`STATIC` 群組設計靜態掃描守門此禁令，見 §十四）。
- **customer_core 欄位子集**：既有 `dbo.customer_core`（92 欄）之 P3a 相關 8 欄（`source_customer_no`/`gender`/`date_of_birth`/`occupation_desc`/`education_desc`/`marital_status_desc`/`customer_type_desc`/`monthly_income_desc`/`cpost_city`）皆應存在（P4-0 已建），INSERT 時其餘欄位可留 NULL/預設值（皆宣告為 nullable，比照 P4d fixture 手法）。

### 0.3 CC-EQ oracle 方法論之開放式決策點（不預設答案，交 tdd-implementation 記錄選擇）

`buildCustomerCoreClause` 現行由 `buildStage1Sql`（PG 下推）與 `executeStage1Chain`（JS golden oracle路徑）**共用同一函式**（`stage1-customer-core-clause.ts` 檔頭註解明載）。此設計在 PG 上使兩路徑天然等價（同一份 SQL、同一個 PG 連線）。P3a 為 `buildStage1Sql` 建構 mssql 版時，`executeStage1Chain`（`stage1-filter-chain.ts`）**是否也需要 dialect-aware 切換**（於 MSSQL 環境改呼叫 `buildCustomerCoreClauseMssql`）是 AD 未涉及、本文件不預設答案之開放問題：

- **若 tdd-implementation 選擇讓 `executeStage1Chain` dialect-aware**（優點：延續「chain 與 pushdown 共用同一 clause 保證等價」之既有架構優點，§十 CCEQ 群組可完整比照 F109 PG spec 之 `chainPks()`/`estimateCount()` 雙路徑 EQ 模式）：需自行評估是否逾越 P3a 檔案改動範圍（AD §1.1 檔案清單未列 `stage1-filter-chain.ts`），若採此案須於 impl log 明確記錄理由（比照既有決策關卡文件化守門慣例）。
- **若不改動 `stage1-filter-chain.ts`**（預設/建議路徑，因不逾越 AD 檔案清單、且正式落地後 MSSQL 環境經 §二 DISPATCH 三分支接線後 `executeStage1Chain` 本就不會在生產路徑上對 MSSQL 執行 customer_core 的 SQL 片段）：§十 CCEQ 群組**不得**使用 `executeStage1Chain`/`chainPks()` 作為 customer_core 條件案例之比對基準（會對 MSSQL 拋 `AGE()`/`EXTRACT()`/`::date` 語法錯誤），改採**測試檔內自建、獨立於任何 SQL 執行之手算 JS oracle函式**（依 fixture 資料直接以 JS `Date` 運算年齡、`slice(0,3)` 模擬 `LEFT`、陣列 `includes` 模擬 `IN`），與 `estimateStage1SqlCountMssql`（或等效 mssql 版 estimate 函式）逐案比對。
- 本文件 §十 CCEQ 群組**依預設路徑（不改動 stage1-filter-chain.ts）設計**，並於 `TS-MSSQL-P3A-CCEQ-GATE-001` 明確要求 tdd-implementation 記錄實際選擇。

---

## 一、GATE — 前置決策關卡與環境事實核對

### TS-MSSQL-P3A-GATE-001（regression 確認，非全新決策關卡）：query-composer 雙引號識別碼於真實持久化基底表（非 `##` 暫存表）情境下複用 QUOTE-003 結論
- **Related Requirement**：§頂部查證發現 5；P4a `QUOTE-003`
- **Test Type**：Regression / Decision Confirmation
- **Preconditions**：`dbo.ob_pool_data` 已存在且含至少 2 列（1 命中 1 不命中）
- **Steps**：直接以 `buildStage1WhereConditions`（PG 檔，未修改）產出之 `"prod_kind" IN (:...cat0)` 片段，經 `escapeQueryWithParameters` 轉換後對 `dbo.ob_pool_data` 執行
- **Expected Result**：查詢成功執行且結果集正確（非拋語法錯誤）；若失敗（與 QUOTE-003 結論不符），記為 MUST-FIX 決策關卡升級，需另立 `stage1-query-composer-mssql.ts`

---

### TS-MSSQL-P3A-GATE-002（🔴 決策關卡）：`dbo` 六張共用表存在性探測 + 「不自建」政策落地
- **Related Requirement**：§頂部查證發現 4；§0.2
- **Test Type**：Decision Gate / Precondition
- **Expected Result**：`OBJECT_ID('dbo.<table>','U')` 對六張表（`ob_pool_data`/`ob_pool_data_list`/`ob_list_definition`/`assignment_run`/`ob_monthly_run_result`/`customer_core`）皆非 NULL；若任一為 NULL，測試套件應輸出明確提示訊息引導執行 baseline migration/bootstrap，而非自動嘗試建表

---

### TS-MSSQL-P3A-GATE-003：CC-EQ oracle 方法論選擇記錄（呼應 §0.3）
- **Related Requirement**：§0.3
- **Test Type**：Decision Gate（文件化守門）
- **Expected Result**：impl log 之 Architectural Decisions 段落記錄是否修改 `stage1-filter-chain.ts`；若修改，需額外說明未逾越 AD §1.1 檔案清單之理由或已取得確認

---

### TS-MSSQL-P3A-GATE-004：`customer_core.source_customer_no` UNIQUE 約束於 MSSQL baseline 是否存在
- **Related Requirement**：§頂部查證發現 7；I-CC-JOIN-CARD-01
- **Test Type**：Decision Gate（文件化守門，非阻擋 P3a DoD）
- **Steps**：查詢 `sys.indexes`/`sys.key_constraints`（`OBJECT_ID('dbo.customer_core')` 過濾）是否存在 unique 屬性之索引/約束涵蓋 `source_customer_no`
- **Expected Result**：記錄查證結果（存在或不存在）於 impl log；若不存在，§九 CCMISC JOINCARD 案例改為「僅依賴 fixture 紀律保證 1:1，非資料庫層防線」之弱化斷言並記入 risks-and-gaps.md（建議 system-architect 評估是否需要補一支收尾 migration）

---

## 二、DISPATCH — 二元 gate MUST-FIX 守門（同型於 AD-E07-38 P1c DISPATCH-001 / AD-E07-40 P2b DISPATCH-001~003）

### TS-MSSQL-P3A-DISPATCH-001（🔴 MUST-FIX，對現行未修改程式碼刻意設計為紅燈）：`assignment-run-pipeline.service.ts:1437-1440` 現行為二元 gate（`postgres` vs 其餘一律 JS chain）
- **Related Requirement**：§頂部查證發現（DISPATCH，非 AD 原文列出）；`runStage1ForList`
- **Test Type**：Regression / MUST-FIX Gate
- **Preconditions**：`process.env.DB_TYPE='mssql'`
- **Steps**：`vi.spyOn` 掛在 `runStage1SqlPushdown`（或其 mssql 對應版本，依 tdd-implementation 實作切分）與 `runStage1JsChain` 兩者，呼叫 `runStage1ForList`
- **Expected Result**：MSSQL 環境下呼叫的是 mssql 下推路徑，**不是** `runStage1JsChain`（現行未修改程式碼下此案例必為紅燈，逼實作方將二元 gate 改為三分支 `postgres`/`mssql`/其餘）

---

### TS-MSSQL-P3A-DISPATCH-002（🔴 MUST-FIX）：`stage0-estimate.service.ts:809` 之對應二元 gate 同型守門
- **Related Requirement**：同上，第二處呼叫點（AD §2.1 表格原文提及「AssignmentRunPipelineService／Stage0EstimateService 等現有 DB_TYPE gate」，本文件逐一落地兩處）
- **Test Type**：Regression / MUST-FIX Gate
- **Expected Result**：MSSQL 環境下 `estimateStage1SqlCount` 之 mssql 版本被呼叫，非回退至既有 JS chain estimate 路徑

---

### TS-MSSQL-P3A-DISPATCH-003：非 postgres 非 mssql（sqlite 測試環境）行為不回歸
- **Related Requirement**：I-PORT-01 精神延伸（三分支之第三分支）
- **Test Type**：Regression
- **Expected Result**：`DB_TYPE` 未設定或為其餘值時，`runStage1ForList`/estimate 路徑行為與 P3a 改動前完全一致（仍走 `executeStage1Chain`），不受新增 mssql 分支影響

---

### TS-MSSQL-P3A-DISPATCH-004：三分支互斥（同一次呼叫僅觸發恰一條路徑）
- **Related Requirement**：DISPATCH-001/002 之互斥性補充
- **Test Type**：Unit
- **Expected Result**：三個 spy（postgres/mssql/其餘路徑對應函式）中恰有一個於單次呼叫中被呼叫 1 次，其餘 0 次

---

## 三、CONCAT — CR 業代姓名字串串接 `||`→`+` MUST-FIX（本文件新發現，AD 未列，優先權高於一般站點）

### TS-MSSQL-P3A-CONCAT-001（🔴🔴 MUST-FIX 靜態守門）：mssql 版 executor 原始碼不得含 PG `||` 字串串接運算子
- **Related Requirement**：§頂部查證發現 1；risks-and-gaps.md R-MSSQL-P3A-01
- **Test Type**：Static Scan / MUST-FIX Gate
- **Steps**：讀取 mssql 版 executor 原始碼（`fs.readFileSync`），grep `||`（排除 JS 邏輯 OR 語境，鎖定 SQL 字串模板內）
- **Expected Result**：不得出現 PG `||` 字串串接語法；`cr_nm` 欄位串接改用 `'CR' + cremp.emp_nm`（或等效 `CONCAT()`）

---

### TS-MSSQL-P3A-CONCAT-002（🔴 旗艦 EQ）：CR 業代命中案例 `cr_nm` 實際值正確組裝（`'CR' + emp_nm`，非拋語法錯誤、非空字串）
- **Related Requirement**：同上；`runStage1SqlInsert` DoD
- **Test Type**：Positive / EQ
- **Preconditions**：`dbo.ob_emphire` 有一筆在職員工（`id_no`='P3A00001'，`emp_nm`='王小明'）；`dbo.ob_pool_data` 一筆案件 `agent_id`='P3A00001'
- **Expected Result**：寫入 `ob_monthly_run_result.cr_nm` = `'CR王小明'`（與 PG 版本結果字面相等，中文字元正確 round-trip）

---

### TS-MSSQL-P3A-CONCAT-003：CR 未命中（`agent_id` 無對應在職員工）→ `cr_nm` 為 NULL，不觸發串接運算
- **Related Requirement**：CASE 分支防禦
- **Test Type**：Negative
- **Expected Result**：`cr_id`/`cr_nm` 皆為 NULL，執行不拋錯

---

## 四、AGE — customer_core AGE 衍生欄位公式正確性（含 AD 建議公式符號反轉旗艦守門）

### TS-MSSQL-P3A-AGE-MSSQL-001（🔴🔴 MUST-FIX 旗艦紅燈守門）：已知年齡具體數值斷言（非僅「有值」），攔截 AD 建議公式引數順序反轉
- **Related Requirement**：§頂部查證發現 2；risks-and-gaps.md R-MSSQL-P3A-02
- **Test Type**：MUST-FIX Gate / Positive
- **Preconditions**：`workdt=2026-07-01`；`customer_core.date_of_birth='1996-07-01'`（恰滿 30 歲，與 PG `AGE-001` 完全對稱之基準情境）
- **Steps**：條件 `date_of_birth` numeric `min=30 max=35`，執行 mssql 版 `estimateStage1SqlCount`（或等效）
- **Expected Result**：命中列數 = 1（若 AD 建議公式引數順序未修正，計算結果為 −30，`BETWEEN 30 AND 35` 恆為 false → 命中列數 = 0，本案例即為紅燈直接攔截）

---

### TS-MSSQL-P3A-AGE-MSSQL-002：生日未到（min=max=29）→ 29 歲入選，30 歲排除（BETWEEN 邊界，對稱 PG AGE-002/003）
- **Related Requirement**：BR-5
- **Test Type**：Boundary
- **Preconditions**：`workdt=2026-07-01`；G客戶 `dob=1996-07-02`（生日未到→29）；H客戶 `dob=1996-06-30`（生日已過→30）；條件 `min=25 max=29`
- **Expected Result**：僅 G 入選

---

### TS-MSSQL-P3A-AGE-MSSQL-003（🔴 高風險邊界）：閏年 2/29 出生者於非閏年 workdt 之年齡計算不拋錯、語意正確
- **Related Requirement**：§頂部查證發現 2 之延伸（`MONTH`/`DAY` 函式對 2/29 出生日期之邊界，T-SQL `DAY()`/`MONTH()` 對合法日期無特殊限制，但需驗證與 PG `AGE()` 內建閏年處理邏輯結果一致）
- **Test Type**：Boundary
- **Preconditions**：`dob='2000-02-29'`；`workdt` 分別為 `2026-03-01`（非閏年，已過 2/29→年滿）與 `2026-02-01`（未到 2/28→未滿）
- **Expected Result**：與 PG `AGE(workdt, '2000-02-29')` 對同一組 workdt 之整數年齡計算逐一比對相等（不因非閏年 2/29 不存在而拋錯或產生非預期偏移）

---

### TS-MSSQL-P3A-AGE-MSSQL-004：`date_of_birth IS NULL` → 排除（NULL 傳播天然排除，不得 COALESCE，I-CC-NULL-EXCLUDE-01 延伸至 MSSQL）
- **Related Requirement**：I-CC-NULL-EXCLUDE-01
- **Test Type**：Negative / NULL 傳播
- **Preconditions**：極寬區間 `min=0 max=150`；`date_of_birth=NULL`
- **Expected Result**：排除（即使極寬區間亦不入選，與 PG `NULLEXC-005` 對稱）

---

### TS-MSSQL-P3A-AGE-MSSQL-005：決定性 — 同一 workdt 重跑兩次結果一致
- **Related Requirement**：BR-5 決定性
- **Test Type**：Regression
- **Expected Result**：`estimateStage1SqlCount` 呼叫兩次結果相同

---

### TS-MSSQL-P3A-AGE-MSSQL-006：workdt 驅動 — 同一 dob 於不同 workdt 算出不同年齡（證明真的用了指定基準，非系統當下時間）
- **Related Requirement**：BR-5
- **Test Type**：Positive
- **Preconditions**：`dob='1996-07-15'`；`min=max=30`
- **Expected Result**：`workdt=2026-07-01`（age=29，生日未到）→ 0 列；`workdt=2026-08-01`（age=30）→ 1 列

---

### TS-MSSQL-P3A-AGE-MSSQL-007：EQ — 與 PG 版本對同一 fixture 之年齡計算逐案比對（cross-engine，degradable，5433 可達才跑）
- **Related Requirement**：I-MSSQL-ENGINE-EQ-01；比照 P4d EQ-PG degradable 政策
- **Test Type**：EQ / Degradable
- **Preconditions**：`postgres-test`（5433）可達
- **Expected Result**：對 8+ 組 `(dob, workdt)` 組合，PG `AGE()` 與 MSSQL 轉換公式算出之整數年齡逐一相等；不可達時 `describe.skip` + `SKIP_REASON`，不阻擋 P3a 核心 DoD（AGE-MSSQL-001~006 為硬性 DoD，本案例為補充信心）

---

## 五、YEARABOVE — year-above 前導數字擷取（對應 PG PORT-001~007，MSSQL 需自行推導 PATINDEX 公式，不可逐字複用 P4a）

### TS-MSSQL-P3A-YEARABOVE-001：`'2010'` → 排除（2010<2011，全數字基準情境）
- **Related Requirement**：I-PORT-01 / I-MSSQL-REGEX-CHARCLASS-01
- **Test Type**：Positive
- **Expected Result**：與 PG `PORT-001` 結果相等（排除）

---

### TS-MSSQL-P3A-YEARABOVE-002：`'2011'` → 保留（cutoff 邊界，非 <）
- **Test Type**：Boundary
- **Expected Result**：與 PG `PORT-002` 相等（保留）

---

### TS-MSSQL-P3A-YEARABOVE-003：`NULL` → 排除（退化 1900）
- **Test Type**：Negative / NULL
- **Expected Result**：與 PG `PORT-003` 相等（排除）

---

### TS-MSSQL-P3A-YEARABOVE-004（🔴🔴 空字串陷阱旗艦案例，`I-MSSQL-REGEX-CHARCLASS-01` 核心）：`''` → 保留，非誤判為「全數字」
- **Related Requirement**：I-MSSQL-REGEX-CHARCLASS-01；§頂部查證發現 3
- **Test Type**：MUST-FIX Gate / Boundary
- **Steps**：`PATINDEX('%[^0-9]%', '')` 於 MSSQL 字面回傳 0（與「全字串皆數字」同值），若轉換公式未額外以 `LEN(col)=0` 特判，會誤判空字串為「無前導非數字字元→全部視為數字」進而嘗試 `CAST('' AS INT)` 拋錯或誤算為 0（皆與 JS `parseInt('')=NaN→保留` 不等價）
- **Expected Result**：與 PG `PORT-004` 相等（保留），且不拋型別轉換錯誤

---

### TS-MSSQL-P3A-YEARABOVE-005：`'N/A'`（純非數字，首字元即非數字）→ 保留
- **Related Requirement**：`PATINDEX` 回傳 1（首字元非數字）分支
- **Test Type**：Boundary
- **Expected Result**：與 PG `PORT-005` 相等（保留）

---

### TS-MSSQL-P3A-YEARABOVE-006：`'200'`（全數字短整數）→ 排除
- **Test Type**：Positive
- **Expected Result**：與 PG `PORT-006` 相等（排除）

---

### TS-MSSQL-P3A-YEARABOVE-007（🔴 旗艦，區辨「驗證」vs「擷取」語意差異）：`'1980abc'`（前導數字+尾隨字母）→ 排除（擷取前導 `'1980'`，非全字串驗證失敗後整體視為非數字）
- **Related Requirement**：§頂部查證發現 3
- **Test Type**：MUST-FIX Gate
- **Expected Result**：與 PG `PORT-007` 相等（排除，`1980<2011`）；若 tdd-implementation 誤用 P4a 之「全字串驗證」公式（`NOT LIKE '%[^0-9]%'` 判斷整串是否全數字），`'1980abc'` 會被誤判為「非全數字→視為 NaN→保留」，與本案例期望值（排除）矛盾，即為紅燈

---

### TS-MSSQL-P3A-YEARABOVE-008：EQ — JS↔MSSQL 逐案件等價（完整名單情境，含機車期中疊加，對稱 PG EQ-011 部分情境）
- **Related Requirement**：I-MSSQL-ENGINE-EQ-01
- **Test Type**：EQ
- **Expected Result**：`executeStage1Chain`（JS oracle，於 MSSQL 連線執行，因 year-above 判定邏輯本身為純 JS `matchesSpecialRule`+JS `parseInt` 全載比對，不涉及 customer_core SQL 片段委派，可安全對 MSSQL 執行）與 mssql 下推結果 PK 集合逐列相等

---

## 六、EQ — Stage 1 核心規則 JS↔MSSQL 逐案件精確等價（對應 PG EQ-001~014，核心 DoD）

> 本群組全數比照 `stage1-sql-pushdown.pg.spec.ts` EQ-001~014 之 Given/seed 設計逐一移植，僅比較基準由 PG 改為 MSSQL；`executeStage1Chain` 可安全對 MSSQL 連線執行（本群組情境皆不觸及 customer_core 條件）。

### TS-MSSQL-P3A-EQ-001：基準純欄位篩選（`prod_kind IN`）無特例無去重
- **Expected Result**：mssql 下推 PK 集合與 JS oracle 逐列相等（對稱 PG EQ-001）

### TS-MSSQL-P3A-EQ-002：month_cnt 期別過濾（IN 1..6，含 NULL 排除）
- **Expected Result**：對稱 PG EQ-002

### TS-MSSQL-P3A-EQ-003：month_cnt 步進邊界（interval=2 → IN 1,3,5）
- **Expected Result**：對稱 PG EQ-003

### TS-MSSQL-P3A-EQ-004：list_period 缺值 → month_cnt skip（全留）
- **Expected Result**：對稱 PG EQ-004

### TS-MSSQL-P3A-EQ-005：interval=0 → month_cnt skip（全留，防 infinite loop）
- **Expected Result**：對稱 PG EQ-005

### TS-MSSQL-P3A-EQ-006（🔴 中文 round-trip）：詐騙白牌（`list_type='01' AND spec_name LIKE '%白牌%'`），含 NULL `spec_name` 保留
- **Related Requirement**：I-MSSQL-COLLATE-01；BIN collation byte-exact 語意
- **Expected Result**：對稱 PG EQ-006（含中文字面 `'白牌'`/`'一般'` 正確 round-trip）

### TS-MSSQL-P3A-EQ-007：機車期中（`payt_term>=deal_num-3 OR appl_no T/Y 開頭`）+ 邊界
- **Expected Result**：對稱 PG EQ-007（`CAST(...AS numeric)` 於整數來源欄位低風險，僅 regression 覆核）

### TS-MSSQL-P3A-EQ-008（🔴 中文）：期中小資（`payt_num>deal_num-8 AND spec_name LIKE '%小資%'`）+ 邊界
- **Expected Result**：對稱 PG EQ-008

### TS-MSSQL-P3A-EQ-009：year-above 正常值（<cutoff 排除）
- **Expected Result**：對稱 PG EQ-009（與 §五 YEARABOVE 群組互補，本案例驗證於完整規則鏈情境）

### TS-MSSQL-P3A-EQ-010：year-above 退化/非數字/前導數字邊界（完整規則鏈情境覆核，非重複 §五）
- **Expected Result**：對稱 PG EQ-010

### TS-MSSQL-P3A-EQ-011：規則疊加（fraud + motorcycle + xiaozi + year-above，BR-1 不合併，逐一各觸發一條）
- **Expected Result**：對稱 PG EQ-011

### TS-MSSQL-P3A-EQ-012：近 3 月去重 — 上界 + NULL `custo_no` 安全（`NOT EXISTS`，非 `NOT IN`）
- **Related Requirement**：去重 anti-join，PG/MSSQL 皆 ANSI `NOT EXISTS`，低風險 regression
- **Expected Result**：對稱 PG EQ-012

### TS-MSSQL-P3A-EQ-013：去重上界邊界（`MAX` 未來日封頂 / 歷史空集）
- **Expected Result**：對稱 PG EQ-013

### TS-MSSQL-P3A-EQ-014：`EMPTY_CONDITIONS` → 整 list skip（0 列，不 INSERT）
- **Expected Result**：對稱 PG EQ-014

---

## 七、CCNULLEXC — customer_core NULL 排除三變體（對應 PG NULLEXC-001~005/007）

> 依 §0.3 預設路徑，本群組**不使用** `executeStage1Chain`/`chainPks()`（會對 MSSQL 拋 customer_core PG-only SQL 語法錯誤），改以 mssql 版 `estimateStage1SqlCount` 搭配測試檔內手算 JS oracle 雙重比對。

### TS-MSSQL-P3A-CCNULLEXC-001【變體 a】：無對應客戶（`ob_pool_data.custo_no` 於 `customer_core` 查無列）→ 排除
- **Expected Result**：對稱 PG NULLEXC-001

### TS-MSSQL-P3A-CCNULLEXC-002【變體 b】：客戶存在但 `gender=NULL` → 排除
- **Expected Result**：對稱 PG NULLEXC-002

### TS-MSSQL-P3A-CCNULLEXC-003【變體 c】：無客戶條件 → 不注入 JOIN，`customer_core` 資料狀態不影響入選
- **Related Requirement**：AC-11（customer_core JOIN 為條件式，無條件時純案件資料名單行為/效能不變）
- **Expected Result**：對稱 PG NULLEXC-003；額外驗證產出 SQL 不含 `LEFT JOIN customer_core`（靜態文字檢查 `core.customerCoreJoin === null`）

### TS-MSSQL-P3A-CCNULLEXC-004：`cpost_city=NULL` → `LEFT(NULL,3)=NULL` → 排除
- **Expected Result**：對稱 PG NULLEXC-004；MSSQL `LEFT()` 原生支援（AD §2.1 表格已確認「不變」），僅 regression 覆核

### TS-MSSQL-P3A-CCNULLEXC-005：`date_of_birth=NULL` → 排除（含極寬區間 0~150，即 AGE-MSSQL-004 之情境於本群組重複交叉引用）
- **Expected Result**：對稱 PG NULLEXC-005（與 §四 AGE-MSSQL-004 同一斷言，故本案例可實作為共用 fixture 之交叉引用測試，非重複造輪）

### TS-MSSQL-P3A-CCNULLEXC-006：Case A/B/C 同查詢互不干擾（`prod_kind AND gender`），僅 A 入選
- **Expected Result**：對稱 PG NULLEXC-007

---

## 八、CCJOIN — 條件式 JOIN 觸發 + EMPTY_CONDITIONS 陷阱（對應 PG JOIN-003/005/007）

### TS-MSSQL-P3A-CCJOIN-001（🔴 EMPTY_CONDITIONS 陷阱，與 §六 EQ-014 不同語意，不可混用）：僅含 `gender`（customer_core）→ 不整批 skip，依 gender 過濾
- **Related Requirement**：F109 EMPTY_CONDITIONS 陷阱模式（見 test-designer 記憶 `f109-customer-core-pg-only-patterns.md`）
- **Test Type**：MUST-FIX Gate
- **Expected Result**：對稱 PG JOIN-003（非全放行、非全排除，正確依 gender 過濾）

### TS-MSSQL-P3A-CCJOIN-002：多客戶條件共用同一 JOIN，estimate 正確過濾
- **Expected Result**：對稱 PG JOIN-005/007

---

## 九、CCMISC — CITY / AND / JOINCARD / DEACT 精簡合併

### TS-MSSQL-P3A-CCMISC-CITY-001：`cpost_city` LEFT3 命中/不命中（臺北市大安區→命中[臺北市]；新北市板橋區→排除）
- **Expected Result**：對稱 PG CITY-001/002

### TS-MSSQL-P3A-CCMISC-CITY-002：空字串排除；恰 3 字命中（`LEFT('',3)=''`；`LEFT('臺北市',3)='臺北市'`）
- **Expected Result**：對稱 PG CITY-003/004

### TS-MSSQL-P3A-CCMISC-AND-001：跨來源 AND（`prod_kind[01] AND gender[2]`）僅同時符合入選
- **Expected Result**：對稱 PG AND-001

### TS-MSSQL-P3A-CCMISC-JOINCARD-001：3 案件各對應不同客戶（寬鬆條件全符合）→ COUNT 不因 JOIN 膨脹
- **Related Requirement**：I-CC-JOIN-CARD-01；依 GATE-004 查證結果決定斷言強度（資料庫層約束 vs fixture 紀律）
- **Expected Result**：`estimateStage1SqlCount` 回傳 3（非膨脹）

### TS-MSSQL-P3A-CCMISC-DEACT-001：既有名單 `gender` 條件已固化 `dataSource='customer_core'`，欄位停用後仍正確過濾
- **Expected Result**：對稱 PG DEACT-002

---

## 十、CCEQ — customer_core 條件下 JS↔MSSQL 等價（依 §0.3 預設路徑：手算 oracle，非 `executeStage1Chain`）

### TS-MSSQL-P3A-CCEQ-GATE-001（決策關卡，呼應 GATE-003）：oracle 方法論選擇之落地確認
- **Test Type**：Decision Gate
- **Expected Result**：本群組下列案例之 oracle 來源（手算 JS 或 dialect-aware `executeStage1Chain`）與 impl log 記錄一致

### TS-MSSQL-P3A-CCEQ-001：純 customer_core 條件（`gender[1]`）estimate 與手算 oracle 相等
- **Expected Result**：對稱 PG EQ-001（customer_core 家族）

### TS-MSSQL-P3A-CCEQ-002：`ob_pool_data + customer_core` AND 條件 estimate 與手算 oracle 相等
- **Expected Result**：對稱 PG EQ-002（customer_core 家族）

### TS-MSSQL-P3A-CCEQ-003：AGE 條件 estimate 與手算 oracle 相等（複用 AGE-MSSQL 群組已驗證公式）
- **Expected Result**：對稱 PG EQ-003（customer_core 家族）

### TS-MSSQL-P3A-CCEQ-004：`cpost_city` LEFT3 條件 estimate 與手算 oracle 相等
- **Expected Result**：對稱 PG EQ-004（customer_core 家族）

### TS-MSSQL-P3A-CCEQ-005：純 `ob_pool_data`（無 customer_core，regression）estimate 與 `executeStage1Chain` 相等
- **Related Requirement**：本案例不含 customer_core 條件，可安全使用 `executeStage1Chain`（不觸及 PG-only 片段）
- **Expected Result**：對稱 PG EQ-005（customer_core 家族）

---

## 十一、RUNEST — run 列數 === estimate COUNT（I-RUN-EST-01，MSSQL 版）

### TS-MSSQL-P3A-RUNEST-001：含特例 + 去重名單，run 列數 === estimate COUNT
- **Expected Result**：對稱 PG RUNEST-002

### TS-MSSQL-P3A-RUNEST-002：year-above 名單 estimate 不漏套（列數===COUNT，含 §五 YEARABOVE 已驗證公式）
- **Expected Result**：對稱 PG RUNEST-003

---

## 十二、IDEM — 冪等清理（I-IDEM-01，MSSQL 版）

### TS-MSSQL-P3A-IDEM-001：同 `run_id` 重觸發前清理 → 列集合一致（不重複殘留）
- **Expected Result**：對稱 PG IDEM-001

### TS-MSSQL-P3A-IDEM-002：刪除 `assignment_run` → FK CASCADE 自動清 result 列
- **Related Requirement**：MSSQL FK `ON DELETE CASCADE` 語法與 PG 相同（ANSI），低風險 regression
- **Expected Result**：對稱 PG IDEM-002

### TS-MSSQL-P3A-IDEM-003：重觸發兩 `run_id` 互不污染
- **Expected Result**：對稱 PG IDEM-003

---

## 十三、CHARSET — 中文 LIKE Pattern Round-Trip（I-MSSQL-COLLATE-01 延伸至 Stage 1）

### TS-MSSQL-P3A-CHARSET-001：`list_nm` 特例觸發字（「機車期中」「期中」「年以上」「小資」）中文比對正確觸發對應規則分支
- **Related Requirement**：`matchesSpecialRule` 為純 JS 字串比對（AD §1.1「special-rules.ts 不動，兩路徑共用」），本案例驗證的是「觸發後產出的 MSSQL SQL 片段」中文 LIKE 常數本身，非 `matchesSpecialRule` 本身
- **Expected Result**：四類特例名單皆正確觸發對應 WHERE 片段（`NOT (...)` 語意，非拼字/編碼錯誤）

### TS-MSSQL-P3A-CHARSET-002：`spec_name` 中文值（`'白牌'`/`'小資'`/`'一般'`/`'借新還舊'`）於 `dbo.ob_pool_data` round-trip 精確 byte-exact 比對
- **Related Requirement**：I-MSSQL-COLLATE-01
- **Expected Result**：與 PG 版本結果字面相等（非模糊比對）

---

## 十四、STATIC — 靜態守門

### TS-MSSQL-P3A-STATIC-001（🔴 MUST-FIX）：mssql 版 executor 原始碼不得對 `dbo.ob_pool_data`/`ob_pool_data_list`/`ob_list_definition`/`assignment_run`/`ob_monthly_run_result`/`customer_core` 六表執行 `DROP TABLE`/`TRUNCATE`
- **Related Requirement**：§0.2 Harness 核心政策
- **Test Type**：Static Scan / MUST-FIX Gate
- **Expected Result**：grep 全部 `*.mssql.spec.ts`（P3a 新增）原始碼，不含 `DROP TABLE`/`TRUNCATE` 對上述六表之陳述式

### TS-MSSQL-P3A-STATIC-002：PG 現行五個核心檔案（`stage1-sql-builder.ts`/`stage1-customer-core-clause.ts`/`stage1-sql-executor.ts`/`stage1-query-composer.ts`/`stage1-filter-chain.ts`）逐位元組不變（cutover 前零風險）
- **Related Requirement**：AD §1.1「PG 檔（現行 5 個核心檔案）完全不動」
- **Test Type**：Static Scan（git diff / checksum）
- **Expected Result**：`git diff` 對這五檔案為空（除非 §0.3 決策關卡選擇修改 `stage1-filter-chain.ts`，此時本案例改為記錄式而非阻擋式）

### TS-MSSQL-P3A-STATIC-003：`special-rules.ts` 未新增 mssql 版本（AD §1.1 明文兩路徑共用）
- **Test Type**：Static Scan
- **Expected Result**：不存在 `special-rules-mssql.ts`

### TS-MSSQL-P3A-STATIC-004：DISPATCH 三分支於原始碼層級確實存在（非僅測試層面 spy 通過）
- **Related Requirement**：§二 DISPATCH 群組落地確認
- **Test Type**：Static Scan
- **Expected Result**：`assignment-run-pipeline.service.ts`/`stage0-estimate.service.ts` 原始碼含 `DB_TYPE==='mssql'` 分支字面（非僅 `==='postgres'`）

---

## 十五、REG — 回歸

### TS-MSSQL-P3A-REG-001：PostgreSQL Stage 1 路徑（`stage1-sql-pushdown.pg.spec.ts`/`stage1-customer-core-clause.pg.spec.ts`）全數不回歸
- **Test Type**：Regression
- **Expected Result**：既有 PG 套件全綠（與 P3a 改動前基準一致）

### TS-MSSQL-P3A-REG-002：SQLite 測試環境（非 postgres 非 mssql）Stage 1 單元測試不受影響
- **Test Type**：Regression
- **Expected Result**：既有 `stage1-*.spec.ts`（非 `.pg.`/`.mssql.` 中綴）全綠

### TS-MSSQL-P3A-REG-003：`tsc --noEmit -p tsconfig.build.json` 乾淨
- **Test Type**：Regression（`feedback_vitest_no_typecheck` 教訓）
- **Expected Result**：無型別錯誤

---

## 測試場景統計

| 群組 | 案例數 |
|---|---|
| 一、GATE | 4 |
| 二、DISPATCH | 4 |
| 三、CONCAT | 3 |
| 四、AGE | 7 |
| 五、YEARABOVE | 8 |
| 六、EQ | 14 |
| 七、CCNULLEXC | 6 |
| 八、CCJOIN | 2 |
| 九、CCMISC | 5 |
| 十、CCEQ | 6 |
| 十一、RUNEST | 2 |
| 十二、IDEM | 3 |
| 十三、CHARSET | 2 |
| 十四、STATIC | 4 |
| 十五、REG | 3 |
| **合計** | **73** |

真實 MSSQL 連線需求：除 STATIC/GATE-003 部分項目（純文件/靜態掃描，免連線）外，其餘全數需 `mssqlPortReachable()`；AGE-MSSQL-007（CC-EQ cross-engine）另需 `pgPortReachable()`（degradable，5433 不可達僅 skip 不阻擋核心 DoD）。
