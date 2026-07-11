---
type: test-design-infrastructure
test-spec-id: AD-E07-41-P4f-codedecode
feature_name: MSSQL 全面遷移 P4f（F110/US-173 code_decode 節點，接續 P4a~e）— SQL 生成正確性 + 真實 MSSQL/PG 逐格等價安全網 + 效能 + Migration 驗證
priority: P0-MVP
related_spec:
  - /docs/specs/features/F110-etl-code-decode-node.md（§5 config schema／§6 語意／§7 等價契約與收斂對應／§10 邊界／§13 錯誤處理／§14 customer_core 附錄）
  - /docs/specs/architecture-spec.md（AD-E05-7，§3 約 line 1050：架構層級 Why/What，四項決策 AD-E05-7a~d + 五項不變式 AD-E05-7e）
  - /docs/specs/implementation-log/AD-E07-41-mssql-p4-etl-engine.md（§13，本文件測試設計之權威依據：§13.1 OQ 裁示、§13.2 MSSQL SQL 形狀、§13.3 PG SQL 形狀、§13.4 Dispatcher 註冊、§13.5 不變式、§13.6 Migration 設計）
  - /docs/test-specs/features/F110-test.md（本文件姊妹文件，dialect-neutral 設定驗證/語意契約/等價契約定義/收斂對應表，本文件不重複其範圍）
  - /docs/test-specs/infrastructure/AD-E07-41-P4b-test.md（lookup-handler(-mssql).ts 之 `trimCast()`/`UPDATE...FROM`/`ALTER TABLE ADD` 既有慣例與陷阱先例，code_decode 之 TRIM/cast 正規化須與其完全相同）
  - /docs/test-specs/infrastructure/AD-E07-41-P4d-test.md（customer_core 56 節點端對端既有 Harness/EQ-PG degradable 政策/raw fixture 14 表清單，本文件沿用不重建；56→34 節點收斂後 P4d 既有 DAG 事實將於未來被本次變更影響，但本文件不修改 P4d，僅記錄此依賴關係）
  - apps/api/src/database/seeds/data/etl-pipelines.json（"ETL for Customer Core" pipeline 定義，收斂前/後兩版之唯一真實資料來源）
covers: [F110]
spec_version: "1.0"
date: 2026-07-09
last_updated: 2026-07-09
---

# AD-E07-41 P4f：`code_decode` 節點（F110/US-173）— SQL 生成正確性 + 真實等價安全網 + 效能 + Migration 驗證 — 測試設計

> 本文件是 [F110-test.md](../features/F110-test.md) 的姊妹文件，兩者分工見 F110-test.md「測試策略」章節之對照表。**本文件是 F110 的硬性安全網（US-173 AC-2 / I-CODEDECODE-EQ-01）與效能 DoD（US-173 AC-3 / AC-11）的唯一驗證來源**——F110-test.md 僅定義契約，不執行真實比對。
>
> **方法論分層（比照 P4d §0.6 精神，本文件依 code_decode 特性調整為兩層）**：
> 1. **SQL-GEN（免真實連線，Mock queryRunner 擷取 SQL 文字）**：驗證兩個 dialect 各自產生的 SQL 是否符合五項不變式之**結構**要求（filter 位置、去重、正規化、欄位枚舉、hint）。
> 2. **EQ-MSSQL（真實連線，MUST-FIX、不可退讓）**：`code_decode` 是本專案第一個「新舊機制以** 同一顆 MSSQL 引擎**互相比對」的 ETL 節點——不像 P4d 的 EQ-PG 群組需要 PG 才能比對，**US-173 AC-2 的安全網本質是「舊 lookup 鏈 vs 新 code_decode」，兩者都在 MSSQL 上跑**，故此群組不受 P4a `RESOLVE-002`（5433 不可達）先例影響，**不得設計為 degradable**。
> 3. **EQ-PG-BYTEIDENTICAL（真實連線，degradable，比照 P4d §0.5 政策）**：這是**另一個獨立需求**（AC-9/BR-11：code_decode 在 PG 上的輸出要跟 MSSQL 上的輸出一致），與第 2 層不同——第 2 層比對「新舊機制」，第 3 層比對「新機制跨兩種引擎」。5433 不可達時比照既有先例 skip，不阻擋核心 DoD。
>
> **★ test-designer 查證重點**：`code_decode` 之新增不影響 P4d 既有的「56 節點端對端」測試套件本身（本文件不修改 P4d），但 `etl-pipelines.json` 一旦套用 §13.6 migration 後，`customer_core` pipeline 的節點數會從 56 降至 34——**這是 P4d 套件在 code_decode 上線後會遇到的既有事實漂移，記入本文件 Harness 說明供未來維護參考，非本文件阻擋項**（P4d 本身不在本次變更範圍內，其 STATIC 群組之「56 節點/55 邊」鎖定會在未來需要一次性更新，但那是後續工作）。

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件全部 + `AD-E07-41-mssql-p4-etl-engine.md` §13（權威 SQL 形狀）+ `F110-test.md`（設定驗證/契約定義，勿重工）+ `lookup-handler.ts`/`lookup-handler-mssql.ts`（`trimCast()`/`resolveRawTable(Mssql)` 直接複用起點）+ `derived-field-handler.ts`（`SELECT INTO`/顯式欄位枚舉排除法既有先例）+ `_p4a-mssql-harness.ts`/`_p4b-*`/`_p4d-target-tables.ts`（Harness 複用）+ `apps/api/src/database/seeds/data/etl-pipelines.json`（收斂前/後兩版定義） |
| QA / Tester | 本文件 + `risks-and-gaps.md`（code_decode 風險段落） |
| DevOps / CI/CD | 本文件「零、Harness 設計」+ 六、EQ-PG-BYTEIDENTICAL 之 degradable 政策（不可注入 dev DB） |
| Product Analyst | 六、PERF-NFR 群組（US-173 AC-3 業務門檻定義與量測方式） |

---

## 零、測試環境與 Harness 設計（沿用既有基礎設施，不新建）

### 0.1 MSSQL 側

沿用 `mssql-env-preload.ts` + `_p4a-mssql-harness.ts`（`connectMssql`/`teardownMssql`/`uniqueLogId`/`objectExists`）；9 張 lookup 來源字典表 fixture（`raw_e5a2345c`/`raw_6fce5258`/`raw_b4a48f10`/`raw_8b80671e`/`raw_9dd0eca5`/`raw_9dcaf414`/`raw_b9558d10`/`raw_3acd58e7`/`raw_afe6a874`）**直接複用 P4b 既有 Harness 之 fixture 建構邏輯**（P4b LOOKUP/UPDATEFROM 群組已對這批表寫入過等價資料），不重新設計欄位清單衍生方式。`vi.setConfig({ testTimeout: 120000 })`（比照 P4d，EQ-MSSQL 群組需先跑 lookup 鏈再跑 code_decode，單一案例耗時高於一般 handler 單元測試）。

### 0.2 PG 側（僅六、EQ-PG-BYTEIDENTICAL 群組使用）

沿用 P4d §0.5 已確立之 degradable 政策：`pgPortReachable()` 對 `postgres-test`（5433）探測，不可達時整組 `describe.skip` + `SKIP_REASON`，**不得**回退嘗試連線 5432（dev DB）並寫入。此群組之 skip **不構成本文件 DoD 未達成**——四、EQ-MSSQL（MSSQL-only 安全網）為唯一不可退讓之硬性 DoD。

### 0.3 `customer_core` migration 驗證（七、MIGRATION 群組）

不需真實資料庫連線之案例（GATE/DEFPAYLOAD/STEPCOUNT/VERSION/BYTEIDENTICAL/GLOBSCOPE/DESCRIPTION）可直接以 `etl-pipelines.json`（收斂後版本）與 `migrations/shared/customer-core-code-decode-definition.ts` 之匯出物件比對，免 DB。需要 DB 之案例（UP/DOWN）沿用 P4d 既有 `CDMP_TEST`（`connectMssql`）+ 一支獨立 in-memory/schema-隔離之 `etl_pipelines`/`etl_pipeline_versions` fixture（比照既有 `_p4c-target-tables.ts` 之 idempotent 自建模式，不影響其餘套件之 pipeline 資料列）。

---

## 一、GATE — 前置決策關卡

### TS-MSSQL-P4F-GATE-001：9 張 lookup 來源字典表 fixture 沿用 P4b 既有建構邏輯，不重新設計
- **Related Requirement**：Harness 設計原則（不新建基礎設施）
- **Test Type**：Decision Gate（文件化守門）
- **Expected Result**：impl log 記錄 fixture 直接複用 P4b `_p4b-*` 建構程式碼路徑（或明確記錄偏離理由）；不得對同一批 9 張表產生第二套互相矛盾的 fixture 資料

---

### TS-MSSQL-P4F-GATE-002（🔴 決策關卡）：5 張字典表 `_cdmp_id` 存在性逐一核對
- **Related Requirement**：AD-E07-41 §13.2 Critical #2（決定性排序鍵優先 `_cdmp_id ASC`，若字典表存在該欄；否則 fallback `(SELECT NULL)`）
- **Test Type**：Decision Gate（真庫內省）
- **Steps**：對 `raw_e5a2345c`/`raw_6fce5258`/`raw_b4a48f10`/`raw_8b80671e`/`raw_9dd0eca5`/`raw_9dcaf414`/`raw_b9558d10`/`raw_3acd58e7`/`raw_afe6a874` 九張表逐一以 `INFORMATION_SCHEMA.COLUMNS`（大寫，I-MSSQL-CATALOG-CASE-01）查詢是否存在 `_cdmp_id` 欄
- **Expected Result**：impl log 記錄逐表結果（存在／不存在），供 SQLGEN-DEDUP 群組決定各表應斷言 `ORDER BY d."_cdmp_id" ASC` 或 fallback `ORDER BY (SELECT NULL)`；本文件之 SQLGEN-DEDUP 案例依此結果分流設計，不得憑空假設全部存在或全部不存在

---

### TS-MSSQL-P4F-GATE-003：EQ-MSSQL 代表性字典群組選擇（涵蓋三種 filter 型態）
- **Related Requirement**：US-173 AC-2 安全網之覆蓋策略；F110 §14.1
- **Test Type**：Decision Gate
- **Expected Result**：四、EQ-MSSQL 群組選定 3 個代表性群組——**#1 `raw_e5a2345c`**（單一等式 `TBL_ID='A2'` 等，9 mapping）、**#4 `raw_8b80671e`（MLMC）**（複合條件 `TRIM(SYSCD)='CF' AND TRIM(DATAID)='xx'`，3 mapping）、**#3 `raw_b4a48f10`（郵遞區號）**（無 filter，3 mapping）——三者聯集涵蓋 F110 §14.1 表格列出的全部 3 種 filter 型態與「單一 mapping／多 mapping」兩種組數，不需對全部 9 個 code_decode 節點逐一重複相同結構的 EQ 案例

---

### TS-MSSQL-P4F-GATE-004：`etl-pipelines.json` 收斂後版本為 MIGRATION 群組唯一事實來源
- **Related Requirement**：AD-E07-41 §13.6.2；I-CODEDECODE-MIGRATION-01
- **Test Type**：Decision Gate
- **Expected Result**：七、MIGRATION 群組全部案例對照 tdd-implementation 依 §13.6.1 編輯完成之 `etl-pipelines.json`（而非本文件自行臆測之 JSON 內容）；若 tdd-implementation 落地時任一節點/mapping 與本文件 GATE-004 核對結果不符，以 `etl-pipelines.json` 實際內容與 F110 §7.2/§14 對應規則為準，回頭修正測試斷言而非反向修改規則

---

### TS-MSSQL-P4F-GATE-005：Harness 沿用確認（不新建基礎設施）
- **Related Requirement**：零、測試環境設計
- **Test Type**：Decision Gate
- **Expected Result**：impl log 明確記錄「本切片 100% 沿用 P4a/P4b/P4d 既有 Harness，僅新增 `code_decode` 專屬 fixture 資料列，未新增任何 harness 檔案」；若確有新增檔案，須說明理由

---

## 二、SQLGEN — SQL 生成正確性（兩個 dialect，免真實連線，Mock `queryRunner` 擷取 SQL 文字）

> 本群組驗證的是**產生的 SQL 文字結構**，不執行真實查詢；真實資料下的行為驗證見四、EQ-MSSQL。

### 2.1 I-CODEDECODE-JOIN-FILTER-01（filter 必須套於字典衍生子查詢內部）

### TS-MSSQL-P4F-JOINFILTER-MSSQL-001（🔴🔴 MUST-FIX）：MSSQL 版 filter 套用於 `LEFT JOIN` 右側衍生子查詢內部 `WHERE`，非主查詢層級 `WHERE`
- **Related Requirement**：AD-E07-41 §13.2 Critical #1；I-CODEDECODE-JOIN-FILTER-01
- **Test Type**：Negative / Unit — 對「naive 逐字翻譯（WHERE 置於主查詢外層）」預期為紅燈
- **Expected Result**：產出 SQL 之 `WHERE "TBL_ID" = 'A2'` 字面**僅出現於** `FROM "raw_e5a2345c" d` 所在之衍生子查詢（`_ranked`/內層 `SELECT`）範圍內；主查詢（`SELECT ... INTO ... FROM ... LEFT JOIN (...) ON ...`）之最外層**不得**出現任何以 `_cd_m{n}` 別名欄位為條件的 `WHERE` 子句

---

### TS-MSSQL-P4F-JOINFILTER-MSSQL-002（🔴 陷阱佐證）：naive 寫法對真實資料會使 LEFT JOIN 退化為 INNER JOIN
- **Related Requirement**：AD-E07-41 §13.2 Critical #1 陷阱說明
- **Test Type**：Negative / Integration（陷阱佐證，手動組裝對照 SQL 字串，非呼叫 handler）
- **Steps**：對真實 MSSQL 連線直接執行 naive 寫法（`... LEFT JOIN dict d1 ON <key match> WHERE d1."TBL_ID" = 'A2'`）於含「無對應」列之 fixture
- **Expected Result**：無對應列被 `WHERE` 濾除、`rowCount` 減少——證實此為真實陷阱而非假設性風險；正確寫法（JOINFILTER-MSSQL-001 之產出）於同一 fixture 上 `rowCount` 不變、無對應列以 `NULL` 保留（交叉引用四、EQ-MSSQL-ZZIP1-002）

---

### TS-MSSQL-P4F-JOINFILTER-PG-001：PG 版 filter 套用於衍生子查詢內部 `WHERE`（結構同構）
- **Related Requirement**：AD-E07-41 §13.3；I-CODEDECODE-JOIN-FILTER-01
- **Test Type**：Negative / Unit
- **Expected Result**：與 JOINFILTER-MSSQL-001 同一斷言邏輯，套用於 PG 版 `CREATE TEMP TABLE ... AS SELECT ... FROM ... LEFT JOIN (SELECT ... WHERE ...) ...` 產出之 SQL 文字

---

### 2.2 I-CODEDECODE-DEDUP-TIEBREAK-01（去重必須先於 JOIN、決定性排序）

### TS-MSSQL-P4F-DEDUP-MSSQL-001（🔴🔴 MUST-FIX）：字典衍生子查詢含 `ROW_NUMBER() OVER (PARTITION BY 正規化鍵 ORDER BY ...) = 1` 去重
- **Related Requirement**：AD-E07-41 §13.2 Critical #2；I-CODEDECODE-DEDUP-TIEBREAK-01
- **Test Type**：Negative / Unit — 對「未去重直接 JOIN」預期為紅燈
- **Expected Result**：每個 mapping 之字典衍生子查詢皆包含 `ROW_NUMBER() OVER (PARTITION BY <正規化 key>) AS "_cd_rn"` 且外層以 `WHERE "_cd_rn" = 1` 過濾，早於與主表 `LEFT JOIN`

---

### TS-MSSQL-P4F-DEDUP-MSSQL-002：決定性排序鍵依 GATE-002 逐表結果分流（`_cdmp_id ASC` 或 `(SELECT NULL)` fallback）
- **Related Requirement**：AD-E07-41 §13.2 Critical #2
- **Test Type**：Positive / Unit
- **Expected Result**：GATE-002 判定「存在 `_cdmp_id`」之字典表，其 `ROW_NUMBER()` 之 `ORDER BY` 為 `d."_cdmp_id" ASC`；判定「不存在」者為 `ORDER BY (SELECT NULL)`——兩者皆為合法 T-SQL `ROW_NUMBER()` 語法（要求非空 `ORDER BY`）

---

### TS-MSSQL-P4F-DEDUP-PG-001：PG 版去重語法與 MSSQL 完全相同（ANSI window function，無需改寫）
- **Related Requirement**：AD-E07-41 §13.3（「語法完全相同」）
- **Test Type**：Positive / Unit
- **Expected Result**：PG 版產出之 `ROW_NUMBER() OVER (PARTITION BY ... ORDER BY ...)` 字面與 MSSQL 版逐字相同（僅整體 SQL 之其餘方言差異，此段落無差異）

---

### 2.3 I-CODEDECODE-NORMALIZE-01（TRIM + 文字轉型須與 lookup 完全相同）

### TS-MSSQL-P4F-NORMALIZE-MSSQL-001：JOIN 鍵值等式與輸出值一律 `TRIM(TRY_CAST(expr AS NVARCHAR(4000)))`
- **Related Requirement**：AD-E07-41 §13.2 Critical #3；I-CODEDECODE-NORMALIZE-01
- **Test Type**：Positive / Unit — 直接對照既有 `lookup-handler-mssql.ts` 之 `trimCast()` 產出字面
- **Expected Result**：全部 JOIN 等式兩側（主表 `matchColumn` 與字典 `lookupMatchColumn`）與全部輸出欄位取值，皆套用與 `trimCast()` 完全相同之 `TRIM(TRY_CAST(... AS NVARCHAR(4000)))` 包裝，非重新實作之等價但字面不同的寫法

---

### TS-MSSQL-P4F-NORMALIZE-PG-001：PG 版正規化為 `TRIM(expr::text)`，與既有 `lookup-handler.ts` PG 版一致
- **Related Requirement**：AD-E07-41 §13.3；I-CODEDECODE-NORMALIZE-01
- **Test Type**：Positive / Unit
- **Expected Result**：全部 JOIN 鍵值等式與輸出值皆為 `TRIM(<expr>::text)`，與既有 `lookup-handler.ts` PG 版之既有寫法字面相同

---

### 2.4 SELECT INTO 新暫存表（非就地 ALTER+UPDATE）

### TS-MSSQL-P4F-SELECTINTO-MSSQL-001（🔴 MUST-FIX）：MSSQL 版以 `SELECT ... INTO ##新暫存表` 產生輸出，SQL **不得**含 `ALTER TABLE`/`UPDATE ... FROM` 字面
- **Related Requirement**：AD-E05-7b（核心效能決策）；OQ-F110-01 裁示
- **Test Type**：Negative / Unit — 防止誤沿用 lookup 之就地更新策略
- **Expected Result**：產出 SQL 以 `SELECT ... INTO "##cd_<nodeId>_<logId8>"` 為主體；全文**不得**出現 `ALTER TABLE`、`ADD COLUMN`、或以本節點輸入暫存表為目標之 `UPDATE ... FROM`

---

### TS-MSSQL-P4F-SELECTINTO-PG-001：PG 版以 `CREATE TEMP TABLE ... AS SELECT` 產生輸出（比照 `derived-field-handler.ts` 既有寫法）
- **Related Requirement**：AD-E07-41 §13.3
- **Test Type**：Negative / Unit
- **Expected Result**：產出 SQL 以 `CREATE TEMP TABLE "cd_<nodeId>_<logId8>" AS SELECT ...` 為主體；全文不得出現 `ALTER TABLE`/以輸入表為目標之 `UPDATE ... SET ... FROM`

---

### 2.5 I-CODEDECODE-COLLISION-01（顯式欄位枚舉，禁止 `SELECT *`）

### TS-MSSQL-P4F-COLLISION-MSSQL-001（🔴🔴 MUST-FIX）：輸出 SELECT 清單為顯式欄位枚舉，不含 `SELECT *`／`m.*` 萬用字元
- **Related Requirement**：AD-E07-41 §13.1 OQ-F110-04；I-CODEDECODE-COLLISION-01
- **Test Type**：Negative / Unit
- **Expected Result**：主查詢最外層 `SELECT` 清單為逐欄具名列舉（比照 `derived_field` 之 `derivedOutputCols` 排除法）；全文不得出現裸 `*` 萬用字元（含 `m.*`／任何別名加 `.*`）

---

### TS-MSSQL-P4F-COLLISION-MSSQL-002：`outputAlias` 與既有輸入欄同名時，該既有欄位被排除於 passthrough 清單（解碼值覆蓋，非重複欄名報錯）
- **Related Requirement**：AD-E07-41 §13.1 OQ-F110-04；F110 §10 邊界情況
- **Test Type**：Positive / Unit
- **Preconditions**：主表既有欄位含 `education_desc`；某 mapping 之 `outputAlias` 亦為 `education_desc`
- **Expected Result**：`SELECT` 清單中主表 passthrough 欄位不含原始 `education_desc`（僅保留 `"_cd_m1"."education_desc" AS "education_desc"` 一份），不產生實體表重複欄名錯誤

---

### TS-MSSQL-P4F-COLLISION-PG-001：PG 版顯式欄位枚舉排除法（同構）
- **Related Requirement**：AD-E07-41 §13.3；I-CODEDECODE-COLLISION-01
- **Test Type**：Negative / Unit
- **Expected Result**：與 COLLISION-MSSQL-001 同一斷言邏輯套用於 PG 版產出 SQL

---

### 2.6 `OPTION (HASH JOIN)`（MSSQL 專屬，涵蓋全部 N 個 JOIN）

### TS-MSSQL-P4F-HASHJOIN-MSSQL-001：產出 SQL 結尾含 `OPTION (HASH JOIN)`，陳述式層級 hint 涵蓋單一陳述式內全部 N 個 JOIN
- **Related Requirement**：AD-E07-41 §13.2「`OPTION (HASH JOIN)` 涵蓋全部 N 個 JOIN」
- **Test Type**：Positive / Unit
- **Preconditions**：9 組 mapping（比照 customer_core #1）
- **Expected Result**：`OPTION (HASH JOIN)` 字面**僅出現一次**於整段 SQL 陳述式尾端（非逐一 JOIN 各自加註），依 T-SQL 陳述式層級 query hint 語意涵蓋全部 9 個 `LEFT JOIN`

---

### TS-MSSQL-P4F-HASHJOIN-PG-001（負向確認）：PG 版**不**含任何 JOIN 演算法 hint
- **Related Requirement**：AD-E07-41 §13.3 表格（PG optimizer 對此情境原生穩健，不需額外 hint）
- **Test Type**：Negative / Unit（確認省略，非遺漏）
- **Expected Result**：PG 版產出 SQL 全文不含 `OPTION`/任何 JOIN 演算法提示語法

---

### 2.7 多 mapping／filter 型態組合驗證

### TS-MSSQL-P4F-MULTIMAP-MSSQL-001：9 組 mapping 情境下單一 SQL 陳述式含 9 個 `LEFT JOIN` 子句
- **Related Requirement**：AD-E05-7a（一次資料流掃描）
- **Test Type**：Positive / Unit
- **Expected Result**：產出 SQL 恰含 9 個 `LEFT JOIN (` 開頭之衍生子查詢區塊，各自對應一組 mapping；主查詢僅一個 `SELECT ... INTO` 陳述式（非拆成多個循序陳述式）

---

### TS-MSSQL-P4F-FILTER-MSSQL-001：複合條件 filter（`TRIM(SYSCD)='CF' AND TRIM(DATAID)='CU'`）原樣沿用於字典衍生子查詢 `WHERE`
- **Related Requirement**：F110 AC-7；AD-E07-41 §13.2
- **Test Type**：Positive / Unit
- **Expected Result**：mapping 之 `filter` 字串完整、未經修改地出現於對應衍生子查詢的 `WHERE` 子句

---

### TS-MSSQL-P4F-FILTER-MSSQL-002：無 `filter` 之 mapping，字典衍生子查詢無 `WHERE` 子句
- **Related Requirement**：F110 AC-7 / §5.3（未設定 filter ⇒ 對整張字典 JOIN）
- **Test Type**：Positive / Unit
- **Expected Result**：對應衍生子查詢僅含 `SELECT ... FROM raw_b4a48f10 d`（去重子查詢除外），不含任何 `WHERE` 子句

---

## 三、DISPATCH — Handler 註冊

### TS-MSSQL-P4F-DISPATCH-001：`CodeDecodeHandler.nodeType==='code_decode'`、`CodeDecodeHandlerMssql.nodeType==='code_decode'`
- **Related Requirement**：AD-E07-41 §13.1 OQ-F110-05
- **Test Type**：Positive / Unit
- **Expected Result**：兩個 handler 之 `nodeType` 屬性皆為字面 `'code_decode'`，與既有 9 對 handler（含 `'lookup'`）之 `nodeType` 集合互不重複

---

### TS-MSSQL-P4F-DISPATCH-002：`createDispatcher()` 依 `DB_TYPE` 分支新增第 10 對 register，既有 9 對呼叫不變
- **Related Requirement**：AD-E07-41 §13.4
- **Test Type**：Positive / Unit（spy 驗證）
- **Expected Result**：`DB_TYPE=mssql` 分支呼叫 `dispatcher.register(new CodeDecodeHandlerMssql())`；`DB_TYPE=postgres` 分支呼叫 `dispatcher.register(new CodeDecodeHandler())`；既有 9 個 `register(...)` 呼叫參數與順序不變（regression）

---

### TS-MSSQL-P4F-DISPATCH-003：`lookup` 與 `code_decode` 兩種 nodeType 同時存在於同一 dispatcher，互不覆蓋
- **Related Requirement**：F110 AC-8；真實 `NodeDispatcher` 實例（非 mock）
- **Test Type**：Positive / Integration
- **Expected Result**：對含 1 個 `lookup` 節點 + 1 個 `code_decode` 節點之最小 DAG 呼叫 `PipelineRunner.run()`，兩節點各自被正確路由至對應 handler，互不干擾

---

### TS-MSSQL-P4F-DISPATCH-004：`NodeDispatcher`/`node-dispatcher.ts`/`pipeline-runner.ts` 未因新增 handler 而改動
- **Related Requirement**：AD-E07-41 §1.2（driver 差異完全封裝於個別 handler）
- **Test Type**：Regression（檔案層級）
- **Expected Result**：三檔案原始碼與 P4e 收官時版本相比無異動（比照既有 P4a-e DISPATCH 群組慣例）

---

## 四、EQ-MSSQL — 逐格等價安全網（🔴🔴 DoD 核心，US-173 AC-2／I-CODEDECODE-EQ-01，MUST-FIX 不可退讓）

> **方法**：於同一真實 MSSQL 連線、同一份 fixture 資料上，(a) 依序執行對應之舊 `lookup` 節點鏈、(b) 執行收斂後的單一 `code_decode` 節點，分別將結果寫入不同暫存表，逐列逐欄（`outputAlias`）比對。三個代表性群組（GATE-003）聯集涵蓋全部 filter 型態。

### 4.1 群組 #1：`raw_e5a2345c`（單一等式，9 mapping）

### TS-MSSQL-P4F-EQZZIP1-001：happy-path 命中，逐格相同（單一 mapping `education_desc`）
- **Related Requirement**：US-173 AC-2；I-CODEDECODE-EQ-01
- **Test Type**：Positive / Integration（真實 MSSQL）
- **Preconditions**：主表列 `EDUCAT_BACK` 值在字典 `TBL_ID='A2'` 子集內有對應
- **Expected Result**：lookup 鏈與 code_decode 兩側 `education_desc` 值逐格完全相同（含大小寫、全形/半形字元）

---

### TS-MSSQL-P4F-EQZZIP1-002：查無對應（LEFT JOIN 語意）兩側皆 NULL
- **Related Requirement**：US-173 AC-2；F110 AC-3
- **Test Type**：Positive / Integration（真實 MSSQL）— 交叉引用 JOINFILTER-MSSQL-002 陷阱佐證
- **Expected Result**：主表列 `EDUCAT_BACK` 值不在字典子集內時，兩側 `education_desc` 皆為 `NULL`，且該列**皆保留**（`rowCount` 相同，非被濾除）

---

### TS-MSSQL-P4F-EQZZIP1-003：TRIM 前後空白邊界，兩側正確去除後比對成功
- **Related Requirement**：US-173 AC-2；I-CODEDECODE-NORMALIZE-01
- **Test Type**：邊界 / Integration（真實 MSSQL）
- **Preconditions**：字典 `TBL_CD` 值或主表 `EDUCAT_BACK` 值任一端帶尾隨/前導空白（模擬 MSSQL CHAR 欄位既有 padding 特性）
- **Expected Result**：兩側皆正確比對成功（TRIM 後相等），`education_desc` 值逐格相同——此案例直接驗證 code_decode 之 `TRIM(TRY_CAST(...))` 與 lookup 之 `trimCast()` 行為一致，非僅結構相同

---

### TS-MSSQL-P4F-EQZZIP1-004：大小寫邊界（依真實 collation 契約），兩側行為一致
- **Related Requirement**：US-173 AC-2；本專案 collation 決策（Chinese_Taiwan_Stroke_BIN，區分大小寫）
- **Test Type**：邊界 / Integration（真實 MSSQL）
- **Preconditions**：主表值與字典值僅大小寫不同（如 `'a2'` vs `'A2'`）
- **Expected Result**：**兩側皆不匹配**（BIN collation 區分大小寫）、`education_desc` 皆為 `NULL`——驗證 code_decode 未「意外變得更寬鬆」而產生與 lookup 不一致的匹配結果

---

### TS-MSSQL-P4F-EQZZIP1-005（🔴 等價核心）：字典重複 key 取首筆之「首筆」定義兩側一致
- **Related Requirement**：US-173 AC-2；I-CODEDECODE-DEDUP-TIEBREAK-01；F110 §6.3
- **Test Type**：邊界 / Integration（真實 MSSQL）
- **Preconditions**：字典子集內同一 `TBL_CD` 值出現兩筆不同 `TBL_DESC1`
- **Expected Result**：lookup 側（Map 先入為主，依查詢回傳順序）與 code_decode 側（`ORDER BY d."_cdmp_id" ASC`）取得**同一筆**描述值——因兩側查詢之底層資料皆源自同一次 E04 擷取序列，`_cdmp_id` 即擷取寫入順序，故排序結果與 Map 插入順序一致；若不一致，判定為 EQ 失敗

---

### TS-MSSQL-P4F-EQZZIP1-006（🔴🔴 旗艦綜合案例）：全 9 組 mapping 同時解碼，逐欄逐格與對應 9 個 lookup 節點結果相同
- **Related Requirement**：US-173 AC-2；F110 §14.2
- **Test Type**：Positive / Integration（真實 MSSQL）
- **Steps**：對同一份 fixture 分別執行 9 個 lookup 節點鏈（education/occupation/job_title/marital_status/customer_type/income_source/industry/job_level/monthly_income）與 1 個 code_decode 節點（9 組 mapping）
- **Expected Result**：全部 9 個 `outputAlias` 欄位、每一列，逐格完全相同

---

### TS-MSSQL-P4F-EQZZIP1-007（🔴 防笛卡兒積核心）：輸出列數兩側相同，不因字典重複 key 造成 fan-out
- **Related Requirement**：I-CODEDECODE-DEDUP-TIEBREAK-01
- **Test Type**：Positive / Integration（真實 MSSQL）
- **Expected Result**：code_decode 輸出 `rowCount` 與 lookup 鏈輸出 `rowCount` 相同，且**皆等於原始輸入列數**（字典重複 key 不導致任一側列數增生）

---

### TS-MSSQL-P4F-EQZZIP1-008：中文描述值 round-trip 兩側完全相同字元
- **Related Requirement**：US-173 AC-2；既有專案教訓 `feedback_sp_utf16le_decode`（憑編碼猜中文之風險，本案例改以真實比對排除臆測）
- **Test Type**：邊界 / Integration（真實 MSSQL，中文字元）
- **Preconditions**：`TBL_DESC1` 含中文描述（如「大學」「博士」「已婚」）
- **Expected Result**：兩側取得之中文字串逐字元相同（非僅長度或編碼型別相同）

---

### 4.2 群組 #4：`raw_8b80671e`（MLMC，複合條件，3 mapping）

### TS-MSSQL-P4F-EQMLMC1-001：happy-path 命中（複合條件 `TRIM(SYSCD)='CF' AND TRIM(DATAID)='CU'`），逐格相同
- **Related Requirement**：US-173 AC-2；F110 AC-7（複合條件型態）
- **Test Type**：Positive / Integration（真實 MSSQL）
- **Expected Result**：`customer_type_desc` 兩側逐格相同

---

### TS-MSSQL-P4F-EQMLMC1-002：查無對應，兩側皆 NULL
- **Related Requirement**：US-173 AC-2
- **Test Type**：Positive / Integration（真實 MSSQL）
- **Expected Result**：兩側皆 `NULL`，列保留

---

### TS-MSSQL-P4F-EQMLMC1-003：複合條件其中一子句不匹配（`SYSCD` 對但 `DATAID` 不對）視為不匹配，兩側一致
- **Related Requirement**：US-173 AC-2；AC-7 複合條件語意
- **Test Type**：邊界 / Integration（真實 MSSQL）
- **Preconditions**：字典存在 `SYSCD='CF'` 但 `DATAID≠'CU'` 之列
- **Expected Result**：兩側皆判定不匹配（`NULL`），不因部分子句符合而誤配

---

### TS-MSSQL-P4F-EQMLMC1-004：TRIM 邊界（`SYSCD`/`DATAID` 任一端帶空白），兩側正確去除後比對成功
- **Related Requirement**：US-173 AC-2；I-CODEDECODE-NORMALIZE-01
- **Test Type**：邊界 / Integration（真實 MSSQL）
- **Expected Result**：兩側逐格相同

---

### TS-MSSQL-P4F-EQMLMC1-005：3 組 mapping（`customer_type_desc`/`employee_count_desc`/`is_listed_desc`）同時解碼逐格相同
- **Related Requirement**：US-173 AC-2；F110 §14.5
- **Test Type**：Positive / Integration（真實 MSSQL）
- **Expected Result**：3 個 `outputAlias` 欄位逐格與對應 3 個 lookup 節點結果相同

---

### TS-MSSQL-P4F-EQMLMC1-006：相同 `matchColumn` 值但不同 filter 條件之列不可誤配
- **Related Requirement**：AD-E07-41 §13.2 Critical #1（filter 隔離）
- **Test Type**：邊界 / Integration（真實 MSSQL）
- **Preconditions**：`CUTYPE` 欄位值同時滿足 `employee_count_desc` mapping 之 `matchColumn`（`EMPLOYEE`）誤植情境（同值但欄位不同）
- **Expected Result**：各 mapping 僅使用自己套用 filter 後的字典子集比對，不因欄位值巧合相同而跨 mapping 誤配

---

### 4.3 群組 #3：`raw_b4a48f10`（郵遞區號，無 filter，3 mapping）

### TS-MSSQL-P4F-EQPOSTAL-001：happy-path 命中（無 filter，全表 JOIN），逐格相同
- **Related Requirement**：US-173 AC-2；F110 AC-7（無 filter 型態）
- **Test Type**：Positive / Integration（真實 MSSQL）
- **Expected Result**：`hpost_city` 兩側逐格相同

---

### TS-MSSQL-P4F-EQPOSTAL-002：查無對應（郵遞區號不在字典），兩側皆 NULL
- **Related Requirement**：US-173 AC-2
- **Test Type**：Positive / Integration（真實 MSSQL）
- **Expected Result**：兩側皆 `NULL`，列保留

---

### TS-MSSQL-P4F-EQPOSTAL-003：3 組 mapping（`hpost_city`/`cpost_city`/`co_city`）同時解碼，各自對照不同 `matchColumn` 但同一張字典表
- **Related Requirement**：US-173 AC-2；F110 §14.4
- **Test Type**：Positive / Integration（真實 MSSQL）
- **Expected Result**：3 個欄位逐格與對應 3 個 lookup 節點結果相同

---

### TS-MSSQL-P4F-EQPOSTAL-004：全表無 filter JOIN 情境下字典表全量參與比對，不因缺 filter 而漏配任何合法值域
- **Related Requirement**：F110 §5.3（未設定 filter ⇒ 整張字典 JOIN）
- **Test Type**：Positive / Integration（真實 MSSQL）
- **Expected Result**：字典表內任一合法郵遞區號值皆可被三個 mapping 中對應者匹配到，兩側結果一致

---

### 4.4 跨群組綜合／冪等

### TS-MSSQL-P4F-EQCROSSGROUP-001：3 個代表性群組於同一次真實 pipeline 執行中同時跑，彼此互不干擾
- **Related Requirement**：US-173 AC-2；DISPATCH-003
- **Test Type**：Positive / Integration（真實 MSSQL）
- **Expected Result**：3 個 code_decode 節點（分別對應 #1/#3/#4）於同一 DAG 中執行，各自逐格等價結論皆成立，互不因共用同一 `PipelineRunner`/`NodeOutputStore` 而污染彼此結果

---

### TS-MSSQL-P4F-EQIDEM-001：重跑一次（新 `logId`）不改變等價結論，兩次結果彼此一致
- **Related Requirement**：I-CODEDECODE-EQ-01；決定性
- **Test Type**：Positive / Integration（真實 MSSQL）
- **Expected Result**：對同一 fixture 以不同 `logId8` 重跑 code_decode 兩次，兩次輸出彼此逐格相同；且皆與 lookup 鏈結果逐格相同

---

## 五、EQ-PG-BYTEIDENTICAL — PG／MSSQL 逐格一致（degradable，AC-9／BR-11）

### TS-MSSQL-P4F-EQPG-GATE-001：`pgPortReachable()` 探測，不可達時全組 skip
- **Related Requirement**：比照 P4d §0.5 政策
- **Test Type**：Decision Gate
- **Expected Result**：5433 不可達時本群組全數 `describe.skip` + 明確 `SKIP_REASON`；**不得**回退連線 5432（dev DB）寫入測試資料；skip 不構成本文件核心 DoD 未達成（四、EQ-MSSQL 為唯一硬性 DoD）

---

### TS-MSSQL-P4F-EQPG-BYTEIDENTICAL-001：群組 #1（單一等式）PG 版 code_decode 輸出與 MSSQL 版逐格 byte-identical
- **Related Requirement**：F110 AC-9 / BR-11
- **Test Type**：Positive / Integration（真實 PG，degradable）
- **Expected Result**：同一 fixture 分別於 PG（`code-decode-handler.ts`）與 MSSQL（`code-decode-handler-mssql.ts`）執行，9 個 `outputAlias` 欄位逐格相同

---

### TS-MSSQL-P4F-EQPG-BYTEIDENTICAL-002：群組 #4（複合條件）PG 版與 MSSQL 版逐格 byte-identical
- **Related Requirement**：F110 AC-9 / BR-11
- **Test Type**：Positive / Integration（真實 PG，degradable）
- **Expected Result**：逐格相同

---

### TS-MSSQL-P4F-EQPG-BYTEIDENTICAL-003：群組 #3（無 filter）PG 版與 MSSQL 版逐格 byte-identical
- **Related Requirement**：F110 AC-9 / BR-11
- **Test Type**：Positive / Integration（真實 PG，degradable）
- **Expected Result**：逐格相同

---

### TS-MSSQL-P4F-EQPG-BYTEIDENTICAL-004：中文描述值兩引擎 round-trip 一致
- **Related Requirement**：F110 AC-9；呼應 I-MSSQL-COLLATE-01 精神延伸
- **Test Type**：邊界 / Integration（真實 PG，degradable）
- **Expected Result**：中文字元逐字元相同

---

### TS-MSSQL-P4F-EQPG-REG-001：既有 PG builder（`lookup-handler.ts`/`derived-field-handler.ts` 等）未因新增 `code-decode-handler.ts` 而被修改
- **Related Requirement**：AC-9 範圍界定（僅新增，不變更既有 PG 行為）
- **Test Type**：Regression（檔案層級）
- **Expected Result**：既有 PG handler 檔案原始碼與新增 code_decode 前版本相比無異動

---

### TS-MSSQL-P4F-EQPG-SKIPSELFTEST-001：skip 機制自我驗證
- **Related Requirement**：EQPG-GATE-001 落地驗收
- **Test Type**：Positive / Unit（模擬 `pgPortReachable()` 回傳 `false`）
- **Expected Result**：`describe.skip` 正確觸發，測試 runner 回報為 `skipped` 而非 `failed`

---

## 六、PERF-NFR — 效能達標（US-173 AC-3／F110 AC-11，live-verified，非 CI 斷言）

> 本群組為**文件化情境**：定義量測方法與門檻，實際數字由 tdd-implementation 於 dev MSSQL 2022（dev CDMP）真實環境 live 重跑取得並記入 impl log，不在測試設計階段預寫具體秒數（比照 AD-E07-41 一貫「不預先承諾未實測效能數字」原則）。

### TS-MSSQL-P4F-PERFNFR-001（🔴 DoD 核心，非 CI 阻擋，須執行並記錄）：群組 #1（9 mapping，≈360 萬列分支）耗時由 45 分鐘以上大幅降至約 3 分鐘以內
- **Related Requirement**：US-173 AC-3；F110 AC-11
- **Test Type**：NFR / Live 量測（非常駐 vitest 斷言）
- **量測方式**：以收斂後的 `code_decode` 節點（群組 #1，對應原 9 個 lookup 節點）取代原 9 個 lookup 節點，於 dev MSSQL 2022（dev CDMP）真實 `customer_core` 全量資料（約 360 萬列）端對端 live 重跑，記錄耗時
- **Expected Result**：耗時 ≈ 3 分鐘以內（門檻本身即為 US-173 AC-3 之業務驗收基準，非估算或抽樣）；若超出門檻，須記入 impl log 並升級為決策問題（是否調整 `OPTION (HASH JOIN)` 策略或其他優化），不得默默放行

---

### TS-MSSQL-P4F-PERFNFR-002：小資料量群組（MLMC ×3／MLSTDINDUMF ×3）全面套用後效能不劣化
- **Related Requirement**：US-173 AC-3「小資料量分支雖非效能瓶頸，仍須維持解碼結果正確，全面套用不得使其效能劣化」
- **Test Type**：NFR / Live 量測
- **Expected Result**：小分支耗時維持在原 lookup 節點鏈同等或更快量級（0–1 秒級），不因收斂為 code_decode 而顯著變慢

---

### TS-MSSQL-P4F-PERFNFR-003（Observability，非阻擋）：`OPTION (HASH JOIN)` 對最多 9 個 JOIN 是否確實全數採用 hash join 演算法
- **Related Requirement**：AD-E07-41 §13.2「殘留風險（需 P4d 端對端驗證確認，非架構阻擋）」
- **Test Type**：Observability / Live（真實執行計畫檢視，`SET STATISTICS ... ON` 或 `sys.dm_exec_query_plan`）
- **Expected Result**：記錄實際執行計畫觀察結果（是否全部 JOIN 皆為 hash join）；若部分 JOIN 未採用 hash join 但整體效能仍達 PERFNFR-001 門檻，不視為失敗，僅記錄觀察

---

### TS-MSSQL-P4F-PERFNFR-004：效能量測結果須記入 impl log，測試設計階段不預寫具體秒數
- **Related Requirement**：AD-E07-41 一貫原則
- **Test Type**：Decision Gate（文件化要求）
- **Expected Result**：impl log 之 Architectural Decisions 或驗收段落記錄 PERFNFR-001/002 之實測秒數與環境描述（資料列數、MSSQL 版本、硬體/容器規格）

---

## 七、MIGRATION — `customer_core` Pipeline Definition 收斂驗證（§13.6）

### TS-MSSQL-P4F-MIGRATION-DEFPAYLOAD-001：9 個 code_decode 節點設定逐一符合 §7.2 正向對應
- **Related Requirement**：F110 §7.2；AD-E07-41 §13.6.1
- **Test Type**：Positive / Regression（對照 F110-test.md「lookup ⇒ code_decode 收斂對應」表）
- **Steps**：讀取收斂後 `etl-pipelines.json` 之 9 個 `code_decode` 節點，逐一比對 `lookupSource`/`lookupRef`/`lookupSourceId`（節點級）與每組 `mappings[i]` 之 `matchColumn`/`lookupMatchColumn`/`filter`/`outputColumns`（mapping 級）
- **Expected Result**：全部 9 個節點、31 組 mapping 皆與對應舊 `lookup` 節點之欄位值零重塑一致（`filter` = 舊 `lookupFilter`，無則不設定；`outputColumns` 原樣搬移）

---

### TS-MSSQL-P4F-MIGRATION-DEFPAYLOAD-002：節點數 = 9、mapping/舊節點數總和 = 31
- **Related Requirement**：F110 §14.1；AD-E07-41 §13.6.1
- **Test Type**：Positive / Regression
- **Expected Result**：`definition.nodes` 中 `nodeType==='code_decode'` 之節點數恰為 9；9 個節點之 `mappings[].length` 總和恰為 31；`definition.nodes` 中 `nodeType==='lookup'` 之節點數為 0（收斂範圍內的 31 個 lookup 節點已全數移除，非保留並存）

---

### TS-MSSQL-P4F-MIGRATION-DEFPAYLOAD-003（🔴 最容易誤判處）：`cd_mlmc{n}` 與 `cd_mlind{n}` 因中途切換字典表實例正確拆為兩個獨立節點
- **Related Requirement**：AD-E07-41 §13.6.1 明文標註
- **Test Type**：Negative / Regression — 防止「同一條原始序列鏈因中途切換字典表被誤合併為一個節點」
- **Expected Result**：`cd_mlmc1`（`raw_8b80671e`，3 mapping）與 `cd_mlind1`（`raw_b9558d10`，1 mapping）為**兩個獨立**節點且以 edge 相連（`cd_mlmc1 → cd_mlind1`），非合併為單一節點；`cd_mlmc2`/`cd_mlind2`、`cd_mlmc3`/`cd_mlind3` 同理

---

### TS-MSSQL-P4F-MIGRATION-STEPCOUNT-001：`step_count` = 34（56 − 31 + 9）
- **Related Requirement**：AD-E07-41 §13.6.1
- **Test Type**：Positive / Regression
- **Expected Result**：收斂後 `step_count` 欄位值為 34；**不得**沿用過時值 53、亦不得誤用收斂前實際節點數 56

---

### TS-MSSQL-P4F-MIGRATION-VERSION-001：`version` 由 13 → 14
- **Related Requirement**：AD-E07-41 §13.6.1
- **Test Type**：Positive / Regression
- **Expected Result**：`etl-pipelines.json` 中 `"ETL for Customer Core"` 之 `version` 欄位為 14

---

### TS-MSSQL-P4F-MIGRATION-UP-001：`up()` 於既有已部署環境（`version=13`）新增 `version=14` 列，`version=13` 列不被覆寫
- **Related Requirement**：AD-E07-41 §13.6.3
- **Test Type**：Positive / Integration（真實 MSSQL，`etl_pipelines`/`etl_pipeline_versions` fixture）
- **Preconditions**：`etl_pipelines` 已有一列 `name='ETL for Customer Core'`、`version=13`
- **Expected Result**：`up()` 執行後，`etl_pipeline_versions` 新增一列 `version=14, status='published', definition=<新 JSON>`；原 `version=13` 列（`etl_pipeline_versions`）內容不變；`etl_pipelines.version`/`step_count` 更新為 14/34

---

### TS-MSSQL-P4F-MIGRATION-UP-002：`up()` 於 fresh-deploy（pipeline 尚未 seed）no-op
- **Related Requirement**：AD-E07-41 §13.6.3
- **Test Type**：Positive / Integration（真實 MSSQL，空 `etl_pipelines`）
- **Preconditions**：`etl_pipelines` 無 `name='ETL for Customer Core'` 之列
- **Expected Result**：`up()` 執行後不新增任何列（`rows.length===0` guard 觸發 no-op）；後續 `data-seed` 步驟負責以新 JSON 完整落地

---

### TS-MSSQL-P4F-MIGRATION-UP-003：`up()` 冪等 guard（`currentVersion >= 14` 時 no-op）
- **Related Requirement**：AD-E07-41 §13.6.3「冪等性」
- **Test Type**：Positive / Integration（真實 MSSQL）
- **Preconditions**：`etl_pipelines.version` 已為 14
- **Expected Result**：重複執行 `up()` 不再新增第二列 `version=14`，不拋錯

---

### TS-MSSQL-P4F-MIGRATION-DOWN-001：`down()` 刪除新增之 `version=14` 列並還原指標欄位為 13/53
- **Related Requirement**：AD-E07-41 §13.6.3；US-173 待解決問題（回滾以 migration `down()` 還原）
- **Test Type**：Positive / Integration（真實 MSSQL）
- **Preconditions**：`etl_pipelines.version=14`（已套用 `up()`）
- **Expected Result**：`down()` 執行後，`etl_pipeline_versions` 之 `version=14` 列被刪除；`etl_pipelines.version`/`step_count` 還原為 `CUSTOMER_CORE_PRE_MIGRATION_VERSION`(13) / `CUSTOMER_CORE_PRE_MIGRATION_STEP_COUNT`(53)——**還原為修改前的既有狀態（53），非本次修正後的正確值（56）**

---

### TS-MSSQL-P4F-MIGRATION-DOWN-002：`down()` guard（`currentVersion !== 14` 時 no-op）
- **Related Requirement**：AD-E07-41 §13.6.3
- **Test Type**：Positive / Integration（真實 MSSQL）
- **Preconditions**：`etl_pipelines.version` 為非 14 之其他值（如已被後續 migration 再次變更）
- **Expected Result**：`down()` 不執行任何 DELETE/UPDATE

---

### TS-MSSQL-P4F-MIGRATION-BYTEIDENTICAL-001（🔴🔴 I-CODEDECODE-MIGRATION-01）：PG／MSSQL 兩支 migration 之 `definition` 皆源自同一共用模組，`JSON.stringify()` byte-identical
- **Related Requirement**：AD-E07-41 §13.6.2；I-CODEDECODE-MIGRATION-01
- **Test Type**：Positive / Unit
- **Steps**：分別匯入 PG 版與 MSSQL 版 migration 檔案內使用之 `CUSTOMER_CORE_CODE_DECODE_DEFINITION`
- **Expected Result**：兩者為**同一物件參照**（皆來自 `migrations/shared/customer-core-code-decode-definition.ts`），`JSON.stringify()` 結果逐位元組相同；非各自複製維護的兩份字面 JSON

---

### TS-MSSQL-P4F-MIGRATION-GLOBSCOPE-001：共用 payload 模組不落入任一 migration glob 範圍
- **Related Requirement**：AD-E07-41 §13.6.2（`data-source.ts` 兩軌各自獨立 glob）
- **Test Type**：Negative / Static
- **Expected Result**：`migrations/shared/customer-core-code-decode-definition.ts` 不匹配 `migrations/*.{ts,js}` 亦不匹配 `migrations/mssql/*.{ts,js}` 任一 glob pattern；`migration:run` 執行時不將此檔案誤判為缺少 `MigrationInterface` 實作的 migration

---

### TS-MSSQL-P4F-MIGRATION-DESCRIPTION-001：新 `description` 為全新撰寫之乾淨 UTF-8 繁體中文文字，不逆向解碼原亂碼
- **Related Requirement**：AD-E07-41 §13.6.1；既有專案教訓 `feedback_sp_utf16le_decode`（F091 事故）
- **Test Type**：Positive / Static
- **Expected Result**：`description` 欄位為合法 UTF-8 繁體中文（非亂碼位元組序列），語意涵蓋「整合 5 個來源（2 ZZIP + 3 MLMC）至 customer_core 目標表」原意，並補述本次收斂（如提及 F110/US-173）

---

## 八、REG-LOOKUP — `lookup` 節點類型不受影響（AC-8）

### TS-MSSQL-P4F-REGLOOKUP-001：既有 F043 lookup 套件（TS-F043-045~058）全數維持通過
- **Related Requirement**：F110 AC-8；F110-test.md TS-F110-027
- **Test Type**：Regression
- **Expected Result**：全數通過，無需修改任何既有斷言

---

### TS-MSSQL-P4F-REGLOOKUP-002：既有 P4b lookup MSSQL 套件（ALTERCOL/UPDATEFROM/CLEANUP/DISPATCH/MERGE/LOOKUP 群組）全數維持通過
- **Related Requirement**：F110 AC-8
- **Test Type**：Regression
- **Expected Result**：全數通過

---

### TS-MSSQL-P4F-REGLOOKUP-003：`lookup-handler.ts`/`lookup-handler-mssql.ts` 兩檔案未被本次變更修改
- **Related Requirement**：F110 AC-8 / BR-10（additive）
- **Test Type**：Regression（檔案層級）
- **Expected Result**：兩檔案原始碼與 code_decode 新增前版本相比無異動

---

### TS-MSSQL-P4F-REGLOOKUP-004：`customer_core` 以外仍使用 `lookup` 節點之其他 pipeline 不受影響
- **Related Requirement**：F110 AC-8
- **Test Type**：Regression
- **Expected Result**：P4b/P5b 涵蓋之其餘 5 條生產 pipeline（若含 `lookup` 節點）行為不變

---

### TS-MSSQL-P4F-REGLOOKUP-005：dispatcher 由 9 對擴充為 10 對後，既有 9 對之 register 呼叫參數與順序不變
- **Related Requirement**：DISPATCH-002 延伸
- **Test Type**：Regression
- **Expected Result**：既有 9 個 `register(...)` 呼叫（含 `LookupHandler(Mssql)`）不變

---

## 九、STATIC — 靜態鎖定

### TS-MSSQL-P4F-STATIC-001：五項不變式名稱於程式碼註解中原字鎖定
- **Related Requirement**：I-CODEDECODE-JOIN-FILTER-01/DEDUP-TIEBREAK-01/NORMALIZE-01/COLLISION-01/EQ-01/MIGRATION-01
- **Test Type**：Static
- **Expected Result**：`code-decode-handler.ts`/`code-decode-handler-mssql.ts` 之關鍵 SQL 組裝段落註解中，六項不變式 ID 原字出現（供未來維護追溯，比照既有 `I-MSSQL-LOOKUP-HASHJOIN-01` 等既有先例）

---

### TS-MSSQL-P4F-STATIC-002：`customer_core` 節點數量事實鎖定（收斂前 56、收斂後 34）
- **Related Requirement**：AD-E07-41 §13.6.1
- **Test Type**：Static
- **Expected Result**：impl log 明確記錄兩個數字，不沿用任何舊估算（如「53」）

---

### TS-MSSQL-P4F-STATIC-003：全部 code_decode 相關 SQL 生成程式碼零殘留 `ALTER TABLE ... ADD` / `UPDATE ... FROM`（PG：`UPDATE ... SET ... FROM`）字面
- **Related Requirement**：AD-E05-7b；防止誤沿用 lookup 就地更新策略
- **Test Type**：Static（fs + regex 全文掃描）
- **Expected Result**：`code-decode-handler.ts`/`code-decode-handler-mssql.ts` 全文零命中上述字面

---

### TS-MSSQL-P4F-STATIC-004：`CodeDecodeHandler`/`CodeDecodeHandlerMssql` 各自僅含單一 handler class，不以 if/else 切兩種 SQL 產生邏輯
- **Related Requirement**：AD-E05-7c；AD-E07-41 §1.2
- **Test Type**：Static
- **Expected Result**：兩檔案各自僅定義一個 handler class，檔案內不存在依 `DB_TYPE`/`isPostgres` 切換 SQL 產生邏輯的分支

---

## 十、REG — 全域回歸

### TS-MSSQL-P4F-REG-001：`tsc --noEmit -p tsconfig.build.json` 乾淨
- **Related Requirement**：既有專案教訓 `feedback_vitest_no_typecheck`
- **Test Type**：Regression
- **Expected Result**：零型別錯誤

---

### TS-MSSQL-P4F-REG-002：PG/SQLite 路徑（非 code_decode 相關功能）不受影響
- **Related Requirement**：AC-8 範圍界定延伸
- **Test Type**：Regression
- **Expected Result**：其餘既有套件（非本文件範圍）行為不變

---

### TS-MSSQL-P4F-REG-003：既有 P4a/b/c/d/e 套件全套件重跑不回歸
- **Related Requirement**：全域一致性
- **Test Type**：Regression
- **Expected Result**：全數維持通過（或維持既有已知排除集合，不新增未預期失敗）

---

### TS-MSSQL-P4F-REG-004：`CDMP_TEST` 共用 DB 隔離慣例延續
- **Related Requirement**：既有 Harness 原則（前綴隔離寫入列 + 精準 DELETE，不 DROP/TRUNCATE 既有共用表）
- **Test Type**：Regression
- **Expected Result**：本文件所有真實連線案例遵循此慣例，`afterAll` 精準清理

---

### TS-MSSQL-P4F-REG-005：既有月名單分派相關套件（F098~F109）不受影響
- **Related Requirement**：範圍界定（code_decode 僅影響 customer_core ETL pipeline，非月名單分派 pipeline）
- **Test Type**：Regression
- **Expected Result**：F098~F109 pg.spec/mssql.spec 套件行為不變

---
