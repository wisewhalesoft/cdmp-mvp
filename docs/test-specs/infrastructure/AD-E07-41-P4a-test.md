---
type: test-design-infrastructure
test-spec-id: AD-E07-41-P4a
feature_name: MSSQL 全面遷移 P4a — ETL Handler 群組一（extract / field_mapping / derived_field / type_cast / conditional，CTAS → `SELECT INTO ##global temp`）
priority: P0-MVP
related_spec:
  - /docs/specs/implementation-log/AD-E07-41-mssql-p4-etl-engine.md（§1.1/§1.3 `##global temp` 裁示、§3 共用 temp helper、§5 handler 逐項方言、§9 P4a 範圍/DoD、§10 不變式）
  - /docs/specs/implementation-log/AD-E07-41-P4-spike-impl.md（P4-spike-1：`#local temp` 不跨 query 存活，封鎖級發現，已觸發架構裁示）
  - /docs/specs/implementation-log/AD-E07-41-P4-spike2-impl.md（P4-spike-2：`##global temp` 併發/崩潰清理驗證全數通過，P4a 前置閘已過，可啟動）
  - /docs/specs/implementation-log/AD-E07-41-P4-0-impl.md（customer_core schema 補齊，P4a 前置獨立完成項）
covers: []
spec_version: "1.0"
date: 2026-07-08
last_updated: 2026-07-08
---

# AD-E07-41 P4a：MSSQL 全面遷移 — ETL Handler 群組一（CTAS 直接替換型）— 測試設計

> 本文件覆蓋 AD-E07-41「MSSQL 全面遷移 P4（ETL 引擎 MSSQL 化）」之 **P4a 切片**（§3.1 共用 temp table helper 補齊 + §3.2 對應 5 個 handler：`extract-handler.ts`/`field-mapping-handler.ts`/`derived-field-handler.ts`/`type-cast-handler.ts`/`conditional-handler.ts` + §5.2/5.3/5.4/5.5 各自的 Pattern B/cast/正則/大小寫站點）。
> P4 不經 spec-writer（AD-E07-41「是否需要 spec-writer」章節已裁定：純底層 ETL 執行機制置換，業務轉換規則完全不變，比照 P1/P2/P3 先例）；本文件依 system-architect 產出之 AD-E07-41 直接產出測試設計，交 tdd-implementation。
>
> **範圍**：§3.1（3 個新共用 helper：`createMssqlTempTable`/`getMssqlTempTableColumns`/`countMssqlTempTableRows`；第 4 個 `dropMssqlTempTableIfExists` 已於 P4-spike-2 先行落地並通過驗證，本輪僅回歸）／§3.2 對應 5 個群組一 handler／§5.2（Pattern B）／§5.3（`::cast`→`TRY_CAST`）／§5.4（`~` 正則→`getValidationRegex` 覆核）／§5.5（`INFORMATION_SCHEMA` 大小寫）。
> **明確排除**（分別由 P4b/P4c/P4d/P4e 各自一棒設計）：`merge-handler.ts`/`lookup-handler.ts`（P4b）；`dedup-handler.ts`（`ROW_NUMBER()`/`IDENTITY` tie-breaker）+ `target-load-handler.ts`（customer_core UPSERT 兩段式，P4c）；53 節點端對端（P4d）；bulk-load raw staging 寫入端（P4e）。
>
> **前置閘已過**：P4-spike-2（併發＋崩潰清理）2026-07-08 全數通過（POINT1~4 皆 PASS），選項 A（`##global temp`）無殘留封鎖問題；P4-0（customer_core schema）已獨立完成。本文件所有真實 MSSQL 案例可直接執行，無需等待任何前置探索。
>
> **★ test-designer 逐檔查證發現之 AD 原文未列出但屬 P4a 必要範圍之站點**（比照既往 P1b3/P1c 慣例，逐檔 grep 覆核而非只依 AD §3.2 表格文字定範圍，詳見文末「風險與發現」）：
> 1. **雙引號識別碼跨 driver 相容性未經驗證**——5 個 handler 的私有 SQL 組裝方法（`buildSourceFilterClause`/`toSql`/`resolveCaseWhenSql`/`buildCaseSql`/`resolveWhen`/`resolveValue`）**全數**大量內嵌 `"${col}"` 雙引號識別碼字面值，AD §3.2 僅描述外層 `createMssqlTempTable` 包裝，未提及識別碼引號風格本身是否需要轉換（本文件 QUOTE 群組列為最優先決策關卡）。
> 2. `resolve-raw-table.ts`（`extract-handler.ts` 之直接依賴，兩者共用）之 `$1`/`$2`/`NULLS LAST`/`LIMIT 1` 站點，AD §3.2 之 extract-handler 列僅提及 `information_schema.tables` 一處 Pattern B 站點，完全未提及此檔案。
> 3. `derived-field-handler.ts` 之 `mergePhone()` DSL 函式內嵌 `~ '^0+$'` 正則（**customer_core 53 節點中實際出現 7 次，為該 handler 最高頻表達式**，比 AD 唯一提及的 `padStart`/LPAD（僅 1 次）更常用），AD §3.2 該列僅提及 LPAD 轉換，未提及此正則站點。
> 4. `derived-field-handler.ts` 之 `gen_random_uuid()` DSL 函式（customer_core 實際使用 1 次），AD §3.2 表格未列出（僅任務書文字提及，AD 正文缺漏）。
> 5. `field-mapping-handler.ts` 之 `toSqlLiteral()` 對 boolean `defaultValue` 產生裸 `TRUE`/`FALSE` 字面值——T-SQL 無此關鍵字（同型於 P1b3 已踩雷之「裸布林字面值」），AD §3.2 field_mapping 列完全未提及 `defaultValue` 轉譯邏輯。
> 6. §3.1 `createMssqlTempTable` 之 selectSql 「須以片段組裝插入 INTO、非字串搜尋替換」設計約束需要專屬測試驗證（防止未來 P4b/c 重用本 helper 時因巢狀 `FROM` 誤判而破功）。
> 7. AD §3.2 `LPAD → RIGHT(REPLICATE(char,n) + col, n)` 建議寫法在**輸入字串長度 ≥ n**時與 PG `LPAD` 語意不一致（PG 從左截斷保留前 n 碼；建議寫法從右截斷保留後 n 碼）——🔴 本文件查證出之具體翻譯公式錯誤，見 DERIVED-EQ-001。

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件全部 + `AD-E07-41-mssql-p4-etl-engine.md`（§1.3/§3/§5）+ `AD-E07-41-P4-spike2-impl.md`（交接注意事項 3 點）+ `apps/api/src/modules/etl/engine/handlers/mssql/temp-table.util.ts`（**additive Edit 補齊 3 個 helper，勿覆寫既有 `dropMssqlTempTableIfExists`**）+ `apps/api/src/database/__tests__/mssql-env-preload.ts`（gating helper 沿用）+ 5 個現行 PG handler 原始碼（`extract-handler.ts`/`field-mapping-handler.ts`/`derived-field-handler.ts`/`type-cast-handler.ts`/`conditional-handler.ts`，逐一對照私有方法）+ `resolve-raw-table.ts`（extract 之共用依賴）+ `apps/api/src/database/seeds/data/etl-pipelines.json`（真實 customer_core 53 節點表達式，group 1 handler 站點之唯一真實資料來源） |
| QA / Tester | 本文件 + `risks-and-gaps.md`（MSSQL P4a 風險段落） |
| DevOps / CI/CD | 本文件「零、測試環境與 Harness 設計」§0.3（`dbo` 共用序列化提醒） |

---

## 零、測試環境與 Harness 設計

### 0.1 沿用既有 gating helper，不新增基礎設施

沿用 `mssql-env-preload.ts`（`mssqlPortReachable()`/`restoreDbType()`/`SKIP_REASON`/`MSSQL` 連線常數）與 `CDMP_TEST` 資料庫，連不上 MSSQL 容器 → 整檔 `describe.skip`，不假造綠燈。`.mssql.spec.ts` 命名慣例延續（本輪新增檔案建議：`extract-handler.mssql.spec.ts`／`field-mapping-handler.mssql.spec.ts`／`derived-field-handler.mssql.spec.ts`／`type-cast-handler.mssql.spec.ts`／`conditional-handler.mssql.spec.ts`／`mssql-temp-table-helpers.mssql.spec.ts`，皆置於 `apps/api/src/modules/etl/engine/__tests__/`，與既有 spike 檔同目錄）。`vi.setConfig({ testTimeout: 60000 })`（沿用 spike-2 設定，本輪無 P2a 等級之多重 `beforeAll` 複雜度，不需拉高至 120000）。

### 0.2 兩種資料落點，決定是否需要 `dbo`（★ 本文件關鍵 harness 設計判斷）

| 測試對象 | 資料落點 | 是否需要 `dbo` |
|---|---|---|
| `field_mapping`/`derived_field`/`type_cast`/`conditional` 四個 handler 之**輸入** | `##` 全域暫存表（tempdb，由測試 fixture 直接 `SELECT ... INTO ##fixture_input FROM (VALUES ...) AS v(...)` 建立） | **否**——`##` 存在於 tempdb，與 default schema 無關，可完全繞開 `dbo` 隔離顧慮 |
| `extract-handler.ts` 之來源 | 真實持久表 `raw_*`（裸表名、無 schema 前綴，落於連線 session 的 default schema） | **是** |
| `resolve-raw-table.ts` 之 `extraction_tasks`/`datasources` JOIN | 兩張既有 baseline 表（P1b1/P1b2 已建於 `dbo`，非可重新導向的新表） | **是** |

**結論（★ 與 P1b2/P2a 既有慣例的刻意偏離）**：P1b2/P1b3 曾將 `dbo` 定義為「本文件獨佔保留 schema」，P2a/P2b/P2c 則刻意另建 `p2a_sync`/`p2a_baseline` 避開 `dbo`。**P4a 因 extract-handler/resolve-raw-table 之裸表名無法透過 TypeORM `schema` 選項重新導向（與 P1b3 raw SQL 腳本同理），必須落於 `dbo`**——這與 P4-0（customer_core 已建於 `dbo`）及未來 P4c（target-load 寫入 `dbo.customer_core`）、P4d（53 節點端對端讀寫 `dbo.raw_*`/`dbo.customer_core`）一致，代表「`dbo` 獨佔保留」慣例自 P4 起已事實上延伸為「MSSQL 遷移 P4 全系列共用」，而非 P1b2/P1b3 專屬。**建議**：extract-handler 之 raw 表 fixture 一律用**隨機化尾碼**命名（如 `raw_p4a_fixture_<8hex>`），並在 `afterAll` 主動 `DROP TABLE IF EXISTS`，將 dbo 上的实际佔用時間窗最小化；`field_mapping`/`derived_field`/`type_cast`/`conditional` 四組完全不落 `dbo`，可與其他 dbo 佔用套件（P1b2/P1b3/P4d 未來）平行執行不衝突。**若 CI 尚未有 `*.mssql.spec.ts` 序列化 lane（P1b3 R-MSSQL-P1B3-03 已提醒過），本輪 extract 群組與 resolve-raw-table 相關案例會再次疊加對同一風險的曝險，記入本文件「風險與發現」。**

### 0.3 Fixture 建構風格

- `##` 暫存表 fixture：直接 `queryRunner.query('SELECT * INTO ##name FROM (VALUES (...),(...)) AS v(col1,col2,...)')`（比照 spike-2 既有寫法），不透過任何 handler 產生，純粹作為「上游節點已完成」的既定輸入，聚焦測試當前這一個 handler。
- `raw_*` fixture（僅 EXTRACT 群組需要）：`CREATE TABLE dbo.raw_p4a_fixture_<hex> (...)` + `INSERT` 若干列，`afterAll` 清除。
- `extraction_tasks`/`datasources` fixture（僅 EXTRACT-RESOLVE 子群組需要）：`INSERT` 一筆 `datasources` + 兩筆 `extraction_tasks`（`last_execution_at` 分別為 `NULL` 與有值，驗證排序），`afterAll` 清除，`created_by`/`datasource_id` 等 FK 依既有 baseline schema 補齊必要欄位。
- **禁止**：任何 EQ 測試以真實 customer_core 巨量資料作為輸入（P4a 為 handler 隔離驗證層，非 P4d 端對端；比照全案「ETL 永遠依生產規模設計但單元/整合測試用最小代表性 fixture」慣例）。

### 0.4 EQ（等價性）驗證方法論分層（成本控制，比照 P2b 分層精神）

1. **UNIT（mock QueryRunner，免真實連線，CI 恆常執行）**：比照既有 `engine-node-executors.spec.ts` 之 `createMockQueryRunner` 手法，驗證 mssql 版 handler 產生之 SQL **文字**含正確方言關鍵字（`SELECT ... INTO ##`非`CREATE TEMP TABLE`、`TRY_CAST`非`CAST`、`tempdb.sys.columns`非`information_schema.columns`、`INFORMATION_SCHEMA.TABLES`大寫、`RIGHT(REPLICATE(...))`非`LPAD`、`NEWID()`非`gen_random_uuid()`）、具名參數非 `$n`。
2. **MSSQL EQ（真實連線，針對高風險語意站點）**：針對本文件查證出之高風險站點（LPAD 截斷公式、`mergePhone` 全零/NULL/空字串、`getValidationRegex` 空字串邊界、DATE 前綴寬鬆比對、中文 round-trip），以**手算 oracle**（非需要同時起 PG 容器比對，除 resolveRawTable 排序案例外）驗證 MSSQL 版 handler 實際執行結果與 PG 版既有已知行為一致——手算 oracle 值直接寫在測試案例本身（比照 F108/F101 慣例），因這 5 個 handler 的轉換邏輯單純（無視窗函式/聚合），手算成本遠低於另起 PG 容器雙邊跑。
3. **DUAL-DB（真實 PG + 真實 MSSQL 皆連線）**：僅 `resolveRawTable` 排序邏輯（`NULLS LAST`→`CASE WHEN`改寫，唯一涉及跨列排序正確性、手算易出錯的站點）採此法，兩邊各自對相同 fixture 執行並比對回傳列。

---

## 一、QUOTE — 雙引號識別碼跨 driver 相容性探測（🔴 最優先決策關卡）

> **對應**：本文件查證發現 1。5 個 handler 的**全部**私有 SQL 組裝方法皆內嵌 `"${col}"` 雙引號識別碼，若 MSSQL（BIN collation、tedious driver）之預設 `QUOTED_IDENTIFIER` 設定不支援雙引號分隔識別碼，則**全部 5 個 handler 產生的 SQL 100% 無法執行**——這是比任何個別方言轉換站點更基礎、更高優先權的探測。AD-E07-41 全文未提及此點，本專案既有 `*.mssql.spec.ts` 亦從未以原始 `queryRunner.query()` 測試過雙引號識別碼語法（已 grep 確認零命中）。

### TS-MSSQL-P4A-QUOTE-001：真實 MSSQL 連線下，`SELECT ... INTO ##name FROM (VALUES ...) AS v("MixedCase_Col")` 雙引號識別碼建表可行
- **Related Requirement**：本文件查證發現 1（決策關卡）
- **Test Type**：Positive / Integration（真實 MSSQL）
- **Steps**：以未特別調整 `QUOTED_IDENTIFIER` 設定的預設 `queryRunner`（比照 handler 實際運作環境），執行 `SELECT "id", "MixedCase_Col" INTO ##quote_probe FROM (VALUES (1,N'a')) AS v("id","MixedCase_Col")`
- **Expected Result**：不拋語法錯誤；`OBJECT_ID('tempdb..##quote_probe')` 非 NULL；`tempdb.sys.columns` 內省得到欄名 `MixedCase_Col`（大小寫原樣保留，非被摺疊為全小寫）

---

### TS-MSSQL-P4A-QUOTE-002：雙引號識別碼於 `WHERE` 子句比較可行（比照 extract-handler `buildSourceFilterClause` 實際用法）
- **Related Requirement**：本文件查證發現 1
- **Test Type**：Positive / Integration
- **Steps**：對 QUOTE-001 建立之 `##quote_probe`，執行 `SELECT * FROM ##quote_probe WHERE "MixedCase_Col" = N'a'`
- **Expected Result**：正確回傳 1 列，不拋錯

---

### TS-MSSQL-P4A-QUOTE-003（🔴 決策關卡總結，非阻擋但必讀）：雙引號識別碼相容性結論記錄
- **Related Requirement**：本文件查證發現 1
- **Test Type**：Decision Gate（文件化守門，不預設答案）
- **Steps**：彙整 QUOTE-001/002 結果
- **Expected Result（兩分支後續行動皆已定義）**：
  - **若 PASS（預期分支，tedious 預設 `QUOTED_IDENTIFIER ON`）**：5 個 handler 之 mssql 版可**逐字複用**現行 PG 版私有方法內的雙引號識別碼組裝邏輯（僅替換外層 CREATE/CAST/正則等關鍵字），本文件其餘 UNIT 群組之「SQL 文字比對」斷言可直接沿用雙引號風格，無需額外轉換層。
  - **若 FAIL**：屬封鎖級發現，需新增一個「雙引號→方括號」全域識別碼轉換層（可能是最簡單的字串後處理，或改寫全部私有方法為方括號字面值），影響範圍擴及 P4a/b/c 全部 handler，**應立即回報 system-architect 更新 AD**，不應由 tdd-implementation 自行決定範圍是否擴大。

---

## 二、HELPER — 3 個新共用 Temp Table Helper（`createMssqlTempTable`/`getMssqlTempTableColumns`/`countMssqlTempTableRows`）

> **對應**：AD §3.1。`dropMssqlTempTableIfExists` 已於 P4-spike-2 落地驗證，本節僅涵蓋新 3 個函式，**以 additive Edit 方式擴充同一檔案**（P4-spike-2 impl log 明文要求，勿覆寫）。

### HELPER-UNIT（免真實連線，CI 恆常執行）

### TS-MSSQL-P4A-HELPER-UNIT-001：`createMssqlTempTable` 產出 `SELECT ... INTO ##name FROM ...`（非 `CREATE TEMP TABLE`）
- **Related Requirement**：AD §3.1 `createMssqlTempTable` 簽章
- **Test Type**：Positive / Unit（mock QueryRunner）
- **Steps**：`createMssqlTempTable(mockQr, '##etl_tmp_e1_abcd1234', 'SELECT * FROM "raw_test"')`
- **Expected Result**：`mockQr.query` 恰呼叫 1 次，SQL 文字含 `INTO ##etl_tmp_e1_abcd1234` 且插入點位於 `FROM` 之前、`SELECT` 之後

---

### TS-MSSQL-P4A-HELPER-UNIT-002（🔴 MUST-FIX，本文件查證發現 6）：`createMssqlTempTable` 對含巢狀 `FROM` 的 selectSql 正確插入於**頂層** `FROM` 之前
- **Related Requirement**：AD §3.1 註解「插入點以片段組裝，非字串搜尋替換，避免誤判巢狀查詢的 FROM」
- **Test Type**：Positive / Unit — 前瞻性正確性守門（P4a 5 個 handler 本身不觸發此路徑，但 helper 為 P4b/c 共用基礎設施，須現在鎖定正確性）
- **Steps**：`createMssqlTempTable(mockQr, '##x', 'SELECT a.id FROM (SELECT id FROM "raw_y") a')`（selectSql 含巢狀 `FROM`）
- **Expected Result**：`INTO ##x` 插入於**第一個**（頂層）`FROM` 之前（即 `SELECT a.id INTO ##x FROM (SELECT id FROM "raw_y") a`），**不得**誤插入巢狀子查詢內部的 `FROM` 之前

---

### TS-MSSQL-P4A-HELPER-UNIT-003：`getMssqlTempTableColumns` 產出 `tempdb.sys.columns` + `OBJECT_ID('tempdb..' + @0)` 具名參數查詢
- **Related Requirement**：AD §3.1／I-MSSQL-TEMP-METADATA-01
- **Test Type**：Positive / Unit
- **Steps**：`getMssqlTempTableColumns(mockQr, '##x')`
- **Expected Result**：SQL 含 `tempdb.sys.columns`、`OBJECT_ID('tempdb..' + @0)`、`ORDER BY c.column_id`；`params` 陣列恰含 `['##x']`；**不得**出現 `information_schema.columns`

---

### TS-MSSQL-P4A-HELPER-UNIT-004：`getMssqlTempTableColumns` 回傳陣列依 `column_id` 序映射為 `{name, columnId}`
- **Related Requirement**：AD §3.1 回傳型別 `MssqlTempTableColumn[]`
- **Test Type**：Positive / Unit
- **Steps**：mock 回傳 `[{column_name:'b',column_id:2},{column_name:'a',column_id:1}]`
- **Expected Result**：回傳 `[{name:'a',columnId:1},{name:'b',columnId:2}]`（依原始 SQL `ORDER BY` 結果原樣映射，不重新排序）

---

### TS-MSSQL-P4A-HELPER-UNIT-005：`countMssqlTempTableRows` 產出 `SELECT COUNT(*) FROM ##name`（不含 PG 版 `::int` cast）
- **Related Requirement**：AD §3.1
- **Test Type**：Positive / Unit
- **Steps**：`countMssqlTempTableRows(mockQr, '##x')`
- **Expected Result**：SQL 為 `SELECT COUNT(*) AS cnt FROM ##x`（**不含** `::int`，T-SQL 無此語法）；回傳值以 `Number(rows[0].cnt)` 轉型

---

### HELPER-MSSQL（真實連線，回歸/延伸 spike-2 已證機制至新 production 函式簽章）

### TS-MSSQL-P4A-HELPER-MSSQL-001：`createMssqlTempTable` 對真實 MSSQL 建表成功，資料正確
- **Related Requirement**：AD §3.1／I-MSSQL-TEMPTABLE-GLOBAL-01
- **Test Type**：Positive / Integration（真實 MSSQL）
- **Steps**：`createMssqlTempTable(qr, '##h1', "SELECT * FROM (VALUES (1,N'借新還舊'),(2,N'中古車商')) AS v(id,memo)")`；查詢回讀
- **Expected Result**：`##h1` 存在，2 列，中文值正確 round-trip

---

### TS-MSSQL-P4A-HELPER-MSSQL-002：`getMssqlTempTableColumns` 對 HELPER-MSSQL-001 建立之表回傳正確欄位序
- **Related Requirement**：I-MSSQL-TEMP-METADATA-01（承 spike-1/2，套用新 production 函式）
- **Test Type**：Positive / Integration
- **Expected Result**：`[{name:'id',columnId:1},{name:'memo',columnId:2}]`

---

### TS-MSSQL-P4A-HELPER-MSSQL-003：`countMssqlTempTableRows` 對真實表回傳正確列數
- **Related Requirement**：AD §3.1
- **Test Type**：Positive / Integration
- **Expected Result**：回傳 `2`（型別為 `number`）

---

### TS-MSSQL-P4A-HELPER-MSSQL-004：`createMssqlTempTable` 巢狀 `FROM` selectSql 於真實 MSSQL 執行正確（呼應 HELPER-UNIT-002 之真實環境驗證）
- **Related Requirement**：本文件查證發現 6
- **Test Type**：Positive / Integration
- **Expected Result**：建表成功，結果列數/值符合子查詢語意，非誤植於巢狀 `FROM` 前導致語法錯誤

---

### TS-MSSQL-P4A-HELPER-MSSQL-005：`createMssqlTempTable` selectSql 含空結果集（0 列）不報錯
- **Related Requirement**：AD §3.1／既有 PG 版 handler 對 0 列輸入之既定行為對齊
- **Test Type**：Boundary / Integration
- **Steps**：`selectSql` 之來源 `##` 表為空
- **Expected Result**：`##` 目標表成功建立（0 列，欄位結構仍存在），`countMssqlTempTableRows` 回傳 `0`

---

### TS-MSSQL-P4A-HELPER-MSSQL-006：三個新 helper 與既有 `dropMssqlTempTableIfExists` 全流程串接回歸（延伸 spike-2 POINT1/POINT3）
- **Related Requirement**：I-MSSQL-TEMPTABLE-CLEANUP-01 回歸
- **Test Type**：Regression / Integration
- **Steps**：`createMssqlTempTable` → `getMssqlTempTableColumns` → `countMssqlTempTableRows` → `dropMssqlTempTableIfExists`
- **Expected Result**：全流程無錯；drop 後 `OBJECT_ID` 為 NULL

---

## 三、CLEANUP — 顯式清理呼叫驗證（I-MSSQL-TEMPTABLE-CLEANUP-01 落地至 P4a 5 個 handler）

> **對應**：AD §1.3 強制性驗證 (iii)／P4-spike-2 交接注意事項第 2 點：「每個 handler 於成功與失敗兩路徑皆須呼叫 `dropMssqlTempTableIfExists`，**建議**統一收在 `pipeline-runner` 層級 try/finally，或各 handler 自理」——AD 本身**未定案**掛載位置。
> **★ test-designer 查證**：`pipeline-runner.ts`（§1.2 明文凍結、不可修改）已透過 `NodeOutputStore.cleanupAll(queryRunner)` 在**成功與失敗兩條路徑**統一呼叫清理（`pipeline-runner.ts:158`失敗路徑／`:164`成功路徑），該 store 目前之 `cleanupAll()` 實作為 PG 專屬 `DROP TABLE IF EXISTS "${table}"` 字面值、無 driver 分支。`node-output-store.ts` **不在** AD §1.2 明文凍結清單（僅 `NodeDispatcher`/`node-dispatcher.ts`/`types.ts`/`pipeline-runner.ts` 四者），故技術上可在此檔內新增 `DB_TYPE==='mssql'` 分支改呼叫 `dropMssqlTempTableIfExists`，此為天然且唯一已貫穿兩路徑之現成收斂點——**但 AD 未明講是否即為此designated 位置**。比照既有 P2c `MOUNT-001` 決策關卡處理手法：本文件不預設答案，僅設計黑盒依賴驗證 + 決策記錄要求。

### TS-MSSQL-P4A-CLEANUP-001：mssql pipeline 成功執行後，每個曾產生 `##` 暫存表的節點皆觸發 1 次 `dropMssqlTempTableIfExists`
- **Related Requirement**：I-MSSQL-TEMPTABLE-CLEANUP-01／AD §1.3 (iii)
- **Test Type**：Positive / Unit（黑盒 spy，不預設呼叫者位置）
- **Preconditions**：`vi.spyOn` 掛在 `temp-table.util.ts` 匯出的 `dropMssqlTempTableIfExists` 上
- **Steps**：以 mock QueryRunner 執行一條僅含 group-1 節點的迷你 mssql pipeline（extract→field_mapping→derived_field→type_cast→conditional）
- **Expected Result**：`dropMssqlTempTableIfExists` 呼叫次數 = 5（每節點各 1 次），呼叫參數涵蓋全部 5 個節點各自的 `##` 表名，不論實際掛載於 `NodeOutputStore.cleanupAll` 分支或各 handler 自理

---

### TS-MSSQL-P4A-CLEANUP-002：pipeline 中途某節點拋錯，已完成上游節點的 `##` 表仍被清理（失敗路徑）
- **Related Requirement**：AD §1.3 (iii)「成功與失敗兩條路徑」
- **Test Type**：Negative / Unit（黑盒 spy）
- **Steps**：第 3 個節點（derived_field）mock 拋錯，驗證前 2 個已成功節點（extract/field_mapping）之 `##` 表清理呼叫
- **Expected Result**：`dropMssqlTempTableIfExists` 對前 2 個節點之 `##` 表名各呼叫 1 次；第 3 個節點若尚未成功建表則不強制要求呼叫（視實際失敗時機而定，非本案例斷言重點）

---

### TS-MSSQL-P4A-CLEANUP-003（🔴 決策記錄，MUST-FIX，比照 P2c MOUNT-001 精神）：impl log 須明確記錄清理呼叫的實際掛載位置
- **Related Requirement**：AD §1.3 (iii)「未定案，交 tdd-implementation」
- **Test Type**：Decision Gate（文件化守門）
- **Steps**：檢視 `AD-E07-41-P4a-impl.md`
- **Expected Result**：Architectural Decisions 段落須明確記錄選擇（建議二擇一並說明理由：(a) 於 `NodeOutputStore.cleanupAll()` 內依 `DB_TYPE` 分支呼叫，**天然貫穿現有成功/失敗兩路徑，強烈建議**；或 (b) 每個 mssql handler 各自 try/finally 自理），否則此案例判定失敗（文件缺失即為不通過條件，非純建議）

---

### TS-MSSQL-P4A-CLEANUP-004：真實 MSSQL — 完整 group-1 mssql pipeline 成功執行後，`tempdb` 內無殘留 `##` 表
- **Related Requirement**：I-MSSQL-TEMPTABLE-CLEANUP-01
- **Test Type**：Positive / Integration（真實 MSSQL）
- **Steps**：對真實連線執行 5 節點 mssql pipeline；`afterAll` 前以 `OBJECT_ID` 逐一探測 5 個節點應產生的 `##` 表名
- **Expected Result**：全部 `OBJECT_ID` 回傳 NULL（皆已清理）

---

### TS-MSSQL-P4A-CLEANUP-005：真實 MSSQL — pipeline 失敗執行後，已建立的 `##` 表仍被清理，不殘留至下一輪同 `logId` 重跑
- **Related Requirement**：AD §1.3 (ii)(iii)／P4-spike-2 POINT3 於新 production 呼叫路徑之延伸驗證
- **Test Type**：Negative / Integration（真實 MSSQL）
- **Steps**：模擬第 3 節點失敗；探測前 2 節點 `##` 表已清理；以相同 `logId` 重跑整條 pipeline
- **Expected Result**：重跑不因表名衝突（`there is already an object named`）失敗

---

### TS-MSSQL-P4A-CLEANUP-006：`countMssqlTempTableRows`/`getMssqlTempTableColumns` 於已清理之 `##` 表上呼叫，明確拋錯而非靜默回傳空結果
- **Related Requirement**：防禦性 — 確保清理時機不早於 handler 內部仍需查詢欄位/列數之邏輯順序
- **Test Type**：Boundary / Integration
- **Expected Result**：`OBJECT_ID` 為 NULL 之表被查詢時，`tempdb.sys.columns` 回傳空陣列（非拋錯，符合現行 spike 已證行為）；此案例純粹確認 handler 內部呼叫順序（先查詢、後清理）未被破壞，非清理 helper 本身的職責

---

## 四、DISPATCH — `createDispatcher()` 驅動分支（輕量，含時序決策提醒）

> **對應**：AD §1.2「唯一組裝點改動」。**★ test-designer 查證**：`etl-pipeline-execution.service.ts` 之 `createDispatcher()` 現行**完全無**驅動分支（無 `isPostgres()`、無 `DB_TYPE` 判斷），單純無條件註冊全部 9 個 PG handler——與 P1c/P2b 之「既有二元 gate 被新分支誤吞」陷阱**不同型**（此處是「從零開始新增分支」而非「既有二元 gate 需擴為三分支」），故不構成同等級 MUST-FIX 紅燈守門，但仍有獨立風險需記錄：**customer_core 53 節點 pipeline 同時使用全部 9 種 nodeType（P4a 僅完成 5 種）**，若 `createDispatcher()` 在 P4a 階段就急著接上 `DB_TYPE==='mssql'` 分支，會在真實 customer_core pipeline 執行至 `merge`/`lookup`/`dedup`/`target_load` 節點時因對應 mssql handler 尚不存在而崩潰——此為**決策關卡**，非阻擋項。

### TS-MSSQL-P4A-DISPATCH-001（決策關卡）：`createDispatcher()` 是否於 P4a 階段接上 `DB_TYPE` 分支，由 impl log 記錄選擇
- **Related Requirement**：AD §1.2
- **Test Type**：Decision Gate
- **Expected Result（兩分支皆可接受，但須記錄）**：
  - **選項甲（建議）**：`createDispatcher()` 之 `DB_TYPE` 分支延後至 P4c（全部 9 個 handler 皆完成）才一次性接上，P4a 僅完成 5 個 `*-handler-mssql.ts` 類別本身但**不**改動 `createDispatcher()`——此選項下 P4a 全部測試案例皆以「直接 `new XxxHandlerMssql()` 呼叫 `.execute()`」方式驗證（不透過 `NodeDispatcher`/`createDispatcher()`），與現行 `engine-node-executors.spec.ts` 之既有測試手法完全一致。
  - **選項乙**：提前部分接上（僅 5 個 group-1 nodeType 分流至 mssql 版，其餘 4 個仍固定用 PG 版）——需額外验证「混合 driver 節點於同一 pipeline」是否為合理場景（customer_core 全節點需一致 driver，故此選項風險較高，**不建議**）。
- **本文件預設採選項甲**（見下方 EXTRACT~COND 群組之測試手法：全數直接實例化 handler class，不透過 dispatcher）

---

### TS-MSSQL-P4A-DISPATCH-002：`DB_TYPE=postgres`（或未設定）下，`createDispatcher()` 註冊之 9 個 PG handler 完全不受本輪影響（回歸）
- **Related Requirement**：AD §1.2「postgres 分支現行 9 個 `*.ts` 原始檔完全不動，cutover 前零風險」
- **Test Type**：Regression / Unit
- **Expected Result**：`createDispatcher()` 原始碼與本輪變更前逐位元組相同（或至少 9 個 `dispatcher.register(new XxxHandler())` 呼叫未變）

---

### TS-MSSQL-P4A-DISPATCH-003：若選項乙被採用，5 個新 mssql handler class 之 `nodeType` 屬性與對應 PG 版完全相同字面值
- **Related Requirement**：`NodeExecutor.nodeType` 介面契約（driver-agnostic 派工鍵）
- **Test Type**：Positive / Unit
- **Expected Result**：`ExtractHandlerMssql.nodeType==='raw_data_extract'`、`FieldMappingHandlerMssql.nodeType==='field_mapping'`、`DerivedFieldHandlerMssql.nodeType==='derived_field'`、`TypeCastHandlerMssql.nodeType==='type_cast'`、`ConditionalHandlerMssql.nodeType==='conditional'`（與 PG 版逐一比對相等）

---

## 五、EXTRACT — `extract-handler.ts` mssql 版

### EXTRACT-UNIT（mock QueryRunner）

### TS-MSSQL-P4A-EXTRACT-UNIT-001：`SELECT * INTO ##name FROM raw_xxx`（取代 `CREATE TEMP TABLE AS SELECT`）
- **Related Requirement**：AD §3.2 extract-handler 列
- **Test Type**：Positive / Unit
- **Expected Result**：SQL 含 `INTO ##etl_tmp_e1_abcd1234`，不含 `CREATE TEMP TABLE`

---

### TS-MSSQL-P4A-EXTRACT-UNIT-002（🔴）：raw 表存在性檢查改用 `INFORMATION_SCHEMA.TABLES`（大寫）+ 具名參數
- **Related Requirement**：AD §3.2／§5.5／I-MSSQL-CATALOG-CASE-01
- **Test Type**：Positive / Unit
- **Expected Result**：SQL 含 `INFORMATION_SCHEMA.TABLES`（全大寫），`WHERE table_name = @0`（或等價具名參數形式，非 `$1`）；**不得**出現小寫 `information_schema`

---

### TS-MSSQL-P4A-EXTRACT-UNIT-003：raw 表不存在 → 拋出與 PG 版相同錯誤訊息格式（`原始資料表 X 不存在`）
- **Related Requirement**：既有錯誤訊息 UX 一致性（非新增需求，回歸既有行為）
- **Test Type**：Negative / Unit
- **Expected Result**：`rejects.toThrow('原始資料表 raw_nonexistent 不存在')`

---

### TS-MSSQL-P4A-EXTRACT-UNIT-004：`sourceFilter`（`ASSIGNDAY < currentMonthFirstDay`）產生之 `WHERE` 子句結構與 PG 版一致
- **Related Requirement**：F090/AD-E07-21 DP-AD21-1（既有業務邏輯，driver 轉換不得變更語意）
- **Test Type**：Positive / Unit
- **Preconditions**：`sourceFilter={column:'ASSIGNDAY',operator:'<',valueExpr:'currentMonthFirstDay'}`（真實 customer_core pipeline 唯一使用的 sourceFilter 設定）
- **Expected Result**：`WHERE "ASSIGNDAY" < 'YYYYMM01'` 結構不變（引號識別碼風格待 QUOTE-003 結論定案）；`currentMonthFirstDay` 保留字解析邏輯不變（純 JS 端計算，非 SQL 方言問題）

---

### TS-MSSQL-P4A-EXTRACT-UNIT-005：不支援的 `sourceFilter.operator` 仍拋錯（白名單驗證邏輯不因方言轉換而鬆動）
- **Related Requirement**：既有防禦性驗證（`ALLOWED_FILTER_OPERATORS`）
- **Test Type**：Negative / Unit
- **Expected Result**：`sourceFilter 不支援的運算子：X` 錯誤原樣拋出

---

### TS-MSSQL-P4A-EXTRACT-UNIT-006：`countMssqlTempTableRows` 取代 PG 版 `SELECT COUNT(*)::int`
- **Related Requirement**：AD §3.1 helper 共用
- **Test Type**：Positive / Unit
- **Expected Result**：呼叫 `countMssqlTempTableRows` 而非自行組裝 `COUNT(*)::int` SQL 字面值

---

### TS-MSSQL-P4A-EXTRACT-UNIT-007：空 raw table（0 列）不報錯，`tempTable` 仍回傳有效名稱
- **Related Requirement**：既有 0 列邊界行為回歸
- **Test Type**：Boundary / Unit
- **Expected Result**：`rowCount===0`，`tempTable` 為 truthy

---

### EXTRACT-RESOLVE（`resolve-raw-table.ts` 共用依賴，本文件查證發現 2）

### TS-MSSQL-P4A-EXTRACT-RESOLVE-001（🔴 MUST-FIX，新檔）：`resolveRawTable` 需要獨立 mssql 版（`resolve-raw-table-mssql.ts`），比照 P1c 已建立之 Pattern B 轉換模式
- **Related Requirement**：本文件查證發現 2（AD §3.2 完全未提及此檔案）
- **Test Type**：Positive / Unit
- **Steps**：驗證 mssql 版 SQL 文字結構
- **Expected Result**：`$1`/`$2` → 具名參數；`NULLS LAST` → `CASE WHEN et.last_execution_at IS NULL THEN 1 ELSE 0 END` 補充排序鍵（置於 `ORDER BY` 次要位置，`DESC` 邏輯保留於主鍵）；`LIMIT 1` → `TOP (1)`（或 `OFFSET 0 ROWS FETCH NEXT 1 ROWS ONLY`，兩者擇一皆可接受，記錄於 impl log）

---

### TS-MSSQL-P4A-EXTRACT-RESOLVE-002（DUAL-DB）：真實 PG + 真實 MSSQL 同一 fixture（2 筆 `extraction_tasks`，一筆 `last_execution_at IS NULL`、一筆有值）排序結果一致
- **Related Requirement**：I-MSSQL-ETL-EQ-01
- **Test Type**：Positive / Integration（PG + MSSQL 雙邊）
- **Steps**：兩邊各自 seed 相同 2 筆資料，呼叫各自版本的 `resolveRawTable`
- **Expected Result**：兩邊皆選出 `last_execution_at` 非 NULL 且值最大的那筆（`NULLS LAST` 語意：有值者優先於 NULL）

---

### TS-MSSQL-P4A-EXTRACT-RESOLVE-003：真實 MSSQL — ref 查詢無結果、有 fallback → 回傳 fallback 並 `console.warn`
- **Related Requirement**：既有 fallback 行為回歸
- **Test Type**：Negative / Integration
- **Expected Result**：行為與 PG 版一致（無 driver 差異，純邏輯回歸）

---

### TS-MSSQL-P4A-EXTRACT-RESOLVE-004：真實 MSSQL — ref 查詢無結果、無 fallback → 拋錯
- **Related Requirement**：既有 throw 行為回歸
- **Test Type**：Negative / Integration
- **Expected Result**：錯誤訊息格式與 PG 版一致

---

### EXTRACT-EQ（真實 MSSQL，手算 oracle）

### TS-MSSQL-P4A-EXTRACT-EQ-001：真實 raw 表 + `sourceFilter` 過濾後，`##` 表列數與內容符合手算預期
- **Related Requirement**：I-MSSQL-ETL-EQ-01
- **Test Type**：Positive / Integration
- **Preconditions**：`dbo.raw_p4a_fixture_<hex>` 含 5 列（`ASSIGNDAY` 分佈於過濾邊界前後）
- **Expected Result**：`##` 表僅含 `ASSIGNDAY < 本月第一天` 之列（手算應保留列數與實際列數相符）

---

### TS-MSSQL-P4A-EXTRACT-EQ-002：中文欄位值（如 `CUSTOM_MK`/客戶備註類欄位）於 extract 階段 round-trip 正確
- **Related Requirement**：I-MSSQL-COLLATE-01 延伸
- **Test Type**：Positive / Integration
- **Expected Result**：中文字元逐字元相符（`N'...'` 字面值 fixture 插入，回讀比對）

---

### TS-MSSQL-P4A-EXTRACT-EQ-003：`INFORMATION_SCHEMA.TABLES` 存在性檢查於 BIN collation 下對真實存在/不存在之 raw 表分別回傳預期結果
- **Related Requirement**：I-MSSQL-CATALOG-CASE-01
- **Test Type**：Positive + Negative / Integration
- **Expected Result**：存在 → 正常建表；不存在 → 拋 `原始資料表 X 不存在`（非因大小寫問題誤判為系統錯誤）

---

## 六、FIELDMAP — `field-mapping-handler.ts` mssql 版

### FIELDMAP-UNIT

### TS-MSSQL-P4A-FIELDMAP-UNIT-001：`dropUnmapped=true` 只輸出 mapping 清單內欄位，SQL 結構與 PG 版一致
- **Related Requirement**：AD §3.2 field_mapping 列
- **Test Type**：Positive / Unit

---

### TS-MSSQL-P4A-FIELDMAP-UNIT-002：`dropUnmapped=false` 保留全部原欄位並附加 mapping（真實 customer_core 未使用此分支，仍需單元覆蓋防禦）
- **Related Requirement**：既有邏輯完整覆蓋
- **Test Type**：Positive / Unit

---

### TS-MSSQL-P4A-FIELDMAP-UNIT-003：輸入欄位清單改由 `getMssqlTempTableColumns` 取得（非 `information_schema.columns`）
- **Related Requirement**：I-MSSQL-TEMP-METADATA-01
- **Test Type**：Positive / Unit
- **Expected Result**：**不得**出現對 `##` 輸入表的 `information_schema.columns` 查詢

---

### TS-MSSQL-P4A-FIELDMAP-UNIT-004（🔴 MUST-FIX，本文件查證發現 5）：`defaultValue` 為 boolean 時，`toSqlLiteral` 之 mssql 版**不得**產生裸 `TRUE`/`FALSE` 字面值
- **Related Requirement**：本文件查證發現 5（同型於 P1b3 已踩雷之「裸布林字面值」T-SQL 不支援）
- **Test Type**：Negative / Unit — 對現行「假設直接複用 PG 版 `toSqlLiteral`」之實作預期為紅燈
- **Steps**：`mappings=[{sourceColumn:'x',targetColumn:'y',defaultValue:true}]`，來源欄位不存在（觸發 default 分支）
- **Expected Result**：SQL 含 `1`（或 `CAST(1 AS BIT)`）取代裸 `TRUE`；**不得**出現裸 `TRUE`/`FALSE` 關鍵字（T-SQL 語法錯誤）
- **附註**：真實 customer_core pipeline 目前 7 個 field_mapping 節點皆無 boolean defaultValue（已 grep 確認），此案例為防禦性/前瞻性，非 P4d 端對端可自然覆蓋之路徑，**僅 UNIT 層驗證，不設計對應 EQ 真實案例**

---

### TS-MSSQL-P4A-FIELDMAP-UNIT-005：`defaultValue` 為 string/number/null 之字面值轉換與 PG 版一致（無方言差異）
- **Related Requirement**：既有邏輯回歸
- **Test Type**：Positive / Unit

---

### TS-MSSQL-P4A-FIELDMAP-UNIT-006（決策關卡，低優先）：`dropUnmapped=true` 且 `mappings=[]`（零欄位 SELECT）於 T-SQL 下是否為合法語法
- **Related Requirement**：既有 PG 版邊界程式碼路徑（`SELECT FROM table` 零欄位語法，PG 支援但 T-SQL `SELECT INTO` 極可能不支援空 select-list）
- **Test Type**：Decision Gate — 不預設答案
- **附註**：已 grep 確認真實 customer_core 全部 7 個 field_mapping 節點 `mappings.length>0`，此路徑於 P4d 端對端不會被觸發；本案例僅記錄結論供未來其他 pipeline 若觸發此設定時參考，不阻擋 P4a DoD

---

### FIELDMAP-EQ（真實 MSSQL）

### TS-MSSQL-P4A-FIELDMAP-EQ-001：114 欄規模（比照真實 customer_core 最大 field_mapping 節點）巨量欄位映射成功執行，欄位順序與命名正確
- **Related Requirement**：I-MSSQL-ETL-EQ-01；真實資料規模驗證（`etl-pipelines.json` 實測最大 field_mapping 節點含 122 個 mapping）
- **Test Type**：Positive / Integration
- **Expected Result**：輸出 `##` 表欄位集合與 mapping 目標欄位集合完全相等

---

### TS-MSSQL-P4A-FIELDMAP-EQ-002：中文來源欄位值（`customer_type_desc` 等）於欄位改名後正確 round-trip
- **Related Requirement**：I-MSSQL-COLLATE-01 延伸
- **Test Type**：Positive / Integration

---

### TS-MSSQL-P4A-FIELDMAP-EQ-003：來源欄位不存在但有 string defaultValue → 輸出欄位全數填入該預設字面值
- **Related Requirement**：既有邏輯回歸
- **Test Type**：Positive / Integration

---

### TS-MSSQL-P4A-FIELDMAP-EQ-004：boolean defaultValue 於真實 MSSQL 執行不拋語法錯誤（FIELDMAP-UNIT-004 之真實環境確認）
- **Related Requirement**：本文件查證發現 5
- **Test Type**：Positive / Integration
- **附註**：即使不可由 customer_core 端對端自然觸發，仍應有一個真實連線案例證明修正後的字面值轉換確實可執行（非僅 mock 層面斷言字串包含）

---

## 七、DERIVED — `derived-field-handler.ts` mssql 版（最高風險群組）

### DERIVED-UNIT

### TS-MSSQL-P4A-DERIVED-UNIT-001：`padStart(col,n,char)` 之 SQL 文字改用 `RIGHT`/`REPLICATE` 組合（非 `LPAD`）
- **Related Requirement**：AD §3.2「LPAD → RIGHT(REPLICATE(char,n) + col, n)」
- **Test Type**：Positive / Unit
- **Expected Result**：SQL 含 `REPLICATE`、`RIGHT`；**不含** `LPAD`

---

### TS-MSSQL-P4A-DERIVED-UNIT-002（🔴 MUST-FIX，本文件查證發現 7）：`padStart` 轉換公式須含「輸入長度 ≥ n 時改用 `LEFT` 截斷」分支，不可僅用 AD 建議之單純 `RIGHT(REPLICATE(...)+col, n)`
- **Related Requirement**：本文件查證發現 7（AD 建議公式本身有誤）
- **Test Type**：Negative / Unit — 對「逐字照抄 AD §3.2 建議公式、未補 `LEFT` 分支」之實作預期為紅燈
- **Steps**：檢視 SQL 文字結構
- **Expected Result**：SQL 結構須為 `CASE WHEN LEN(col) >= n THEN LEFT(col, n) ELSE RIGHT(REPLICATE(char,n) + col, n) END`（或等價雙分支邏輯），**不得**為單一 `RIGHT(REPLICATE(char,n)+col,n)` 表達式（該表達式在輸入過長時會錯誤地保留字串「後」n 碼而非 PG `LPAD` 語意之「前」n 碼）

---

### TS-MSSQL-P4A-DERIVED-UNIT-003（🔴）：`mergePhone()` 之 `~ '^0+$'` 正則改用 `LIKE` 字元類別（本文件查證發現 3）
- **Related Requirement**：本文件查證發現 3（AD §3.2 未提及此站點，但為真實 customer_core 最高頻表達式，7/12）
- **Test Type**：Positive / Unit
- **Expected Result**：SQL 含等價於 `LEN(col) > 0 AND col NOT LIKE '%[^0]%'` 之全零判斷邏輯；**不含** PG `~` 運算子

---

### TS-MSSQL-P4A-DERIVED-UNIT-004：`mergePhone()` 之 `CONCAT()`/NULL/空字串判斷結構原樣保留（CONCAT 兩引擎皆 NULL-safe，無需轉換）
- **Related Requirement**：既有邏輯回歸（confirm 無 driver 差異）
- **Test Type**：Positive / Unit

---

### TS-MSSQL-P4A-DERIVED-UNIT-005：`gen_random_uuid()` → `NEWID()`（本文件查證發現 4）
- **Related Requirement**：本文件查證發現 4
- **Test Type**：Positive / Unit
- **Expected Result**：SQL 含 `NEWID()`；不含 `gen_random_uuid()`

---

### TS-MSSQL-P4A-DERIVED-UNIT-006：`CASE WHEN` passthrough（`resolveCaseWhenSql`）之 `left.`/`right.` 前綴解析邏輯不變；輸入欄位清單改用 `getMssqlTempTableColumns`
- **Related Requirement**：AD §3.2；I-MSSQL-TEMP-METADATA-01
- **Test Type**：Positive / Unit

---

### DERIVED-EQ（真實 MSSQL，最高優先真實案例群組）

### TS-MSSQL-P4A-DERIVED-EQ-001（🔴 旗艦案例，決定性）：`padStart` 輸入長度超過目標長度 n 時，MSSQL 結果與 PG `LPAD` 截斷語意一致（保留「前」n 碼）
- **Related Requirement**：本文件查證發現 7；I-MSSQL-ETL-EQ-01
- **Test Type**：Positive / Integration — **DoD 核心案例**
- **Preconditions**：`padStart(CUSTOM_MK, 2, '0')`（真實 customer_core 唯一 padStart 用法，n=2），fixture 輸入 `CUSTOM_MK='ABC'`（長度 3 > n=2）
- **手算 oracle**：PG `LPAD('ABC', 2, '0')` = `'AB'`（截斷保留前 2 碼）
- **Expected Result**：MSSQL 版輸出亦為 `'AB'`；若實作沿用 AD 原始建議公式（未補 `LEFT` 分支），實際輸出會錯誤為 `'BC'`（保留後 2 碼）——此案例即為區分兩者的判定依據

---

### TS-MSSQL-P4A-DERIVED-EQ-002：`padStart` 輸入長度短於 n（正常補零路徑）與 PG 一致
- **Related Requirement**：I-MSSQL-ETL-EQ-01
- **Test Type**：Positive / Integration
- **手算 oracle**：`padStart('5', 2, '0')` = `'05'`
- **Expected Result**：兩引擎皆為 `'05'`

---

### TS-MSSQL-P4A-DERIVED-EQ-003：`padStart` 輸入長度恰等於 n（邊界，無需補零也無需截斷）
- **Related Requirement**：I-MSSQL-ETL-EQ-01
- **Test Type**：Boundary / Integration
- **手算 oracle**：`padStart('12', 2, '0')` = `'12'`

---

### TS-MSSQL-P4A-DERIVED-EQ-004：`mergePhone(area, tel)` 兩參數版 — 正常值產生 `area-tel` 格式
- **Related Requirement**：真實 customer_core `mergePhone(BUSINESSTTELCODE, BUSINESSTTEL)` 等 5 個 2-參數用法
- **Test Type**：Positive / Integration
- **手算 oracle**：`mergePhone('02','12345678')` = `'02-12345678'`

---

### TS-MSSQL-P4A-DERIVED-EQ-005：`mergePhone(area, tel, exten)` 三參數版 — 有效分機附加 `#exten`
- **Related Requirement**：真實 customer_core `mergePhone(CAREA_NO1, CTEL_NO1, CEXTEN_NO1)` 等 2 個 3-參數用法
- **Test Type**：Positive / Integration
- **手算 oracle**：`mergePhone('02','12345678','99')` = `'02-12345678#99'`

---

### TS-MSSQL-P4A-DERIVED-EQ-006：`mergePhone` — `area`/`tel` 任一為 NULL → 結果 NULL
- **Related Requirement**：既有 NULL-safety 邏輯
- **Test Type**：Boundary / Integration

---

### TS-MSSQL-P4A-DERIVED-EQ-007：`mergePhone` — `area`/`tel` 任一為空字串 `''` → 結果 NULL
- **Related Requirement**：既有邏輯（`= ''` 判斷，非正則）
- **Test Type**：Boundary / Integration

---

### TS-MSSQL-P4A-DERIVED-EQ-008（🔴 正則轉換核心）：`mergePhone` — `area`/`tel` 為全零字串（如 `'000'`）→ 結果 NULL（`LIKE '%[^0]%'` 轉換正確性驗證）
- **Related Requirement**：本文件查證發現 3
- **Test Type**：Boundary / Integration
- **Expected Result**：MSSQL 版與 PG 版同判為「視同無效」→ NULL；額外驗證非全零但含 0（如 `'102'`）**不**誤判為全零

---

### TS-MSSQL-P4A-DERIVED-EQ-009：`gen_random_uuid()` 於真實 MSSQL 執行 — 產出值為合法 GUID 格式、非 NULL、跨多列不重複
- **Related Requirement**：本文件查證發現 4（特徵化測試，非位元級 EQ，兩者皆為隨機值）
- **Test Type**：Positive / Integration
- **Expected Result**：`NEWID()` 輸出符合 GUID 格式（8-4-4-4-12 十六進位）；10 列批次插入無重複值

---

### TS-MSSQL-P4A-DERIVED-EQ-010：`CASE WHEN` passthrough — 真實 customer_core `customer_type_code` 三段映射表達式（`'1'→'01'`/`'2'→'02'`/`'3'→'04'`/`ELSE` 原樣）於 MSSQL 執行結果與 PG 版一致
- **Related Requirement**：I-MSSQL-ETL-EQ-01；真實資料驗證
- **Test Type**：Positive / Integration
- **Expected Result**：4 種輸入（`'1'`/`'2'`/`'3'`/其他任意值）皆映射正確

---

## 八、CAST — `type-cast-handler.ts` mssql 版

### CAST-UNIT

### TS-MSSQL-P4A-CAST-UNIT-001：`CAST` → `TRY_CAST`
- **Related Requirement**：AD §5.3「資料來源不可信之處用 TRY_CAST」（type_cast 輸入恆為外部來源資料，符合此原則）
- **Test Type**：Positive / Unit
- **Expected Result**：SQL 含 `TRY_CAST`；不含裸 `CAST`（validation-passed 值仍需轉型，但改用 `TRY_CAST` 統一防禦）

---

### TS-MSSQL-P4A-CAST-UNIT-002：`toPgType`→`toMssqlType` 對應（DECIMAL→NUMERIC 或 DECIMAL 皆可、INTEGER→INT 或 INTEGER 皆為合法 T-SQL 同義詞、DATE→DATE）
- **Related Requirement**：AD §5.3 型別對照
- **Test Type**：Positive / Unit
- **附註**：T-SQL 接受 `INTEGER` 作為 `INT` 之 ISO 同義詞——此點雖可由訓練知識推斷，仍建議於 CAST-EQ 群組以真實連線正面驗證（不僅信任訓練知識），見 CAST-EQ-001

---

### TS-MSSQL-P4A-CAST-UNIT-003（🔴 §5.4 覆核核心）：`getValidationRegex` 三目標型別（DECIMAL/INTEGER/DATE）之 MSSQL 轉換皆可用 `LIKE`/`SUBSTRING`/`LEN` 字元類別達成，無需 lookahead/alternation
- **Related Requirement**：AD §5.4「若全部 pattern 皆為簡單字元類別型，可用 LIKE/PATINDEX 達成」
- **Test Type**：Positive / Unit — **本文件覆核結論**
- **Steps**：逐一檢視 3 個目標型別之現行 PG 正則：`DECIMAL: '^-?[0-9]+(\.[0-9]+)?$'`／`INTEGER: '^-?[0-9]+$'`／`DATE: '^[0-9]{4}-[0-9]{2}-[0-9]{2}'`（**注意：DATE 無 `$` 結尾錨點，僅前綴比對**）
- **Expected Result（結論）**：三者**皆屬簡單字元類別型**，無 lookahead、無分支 alternation（`|`）、無量詞組合超出 `+`/`?` 基本語意。轉換方案：
  - `INTEGER`：`(LEFT(col,1)='-' AND LEN(col)>1 AND SUBSTRING(col,2,LEN(col)-1) NOT LIKE '%[^0-9]%') OR (LEFT(col,1)<>'-' AND LEN(col)>0 AND col NOT LIKE '%[^0-9]%')`
  - `DECIMAL`：同 INTEGER 邏輯，另以 `CHARINDEX('.',col)` 拆分整數/小數部分分別驗證字元類別，兩部分皆需非空
  - `DATE`：`LEN(col)>=10 AND LEFT(col,4) NOT LIKE '%[^0-9]%' AND SUBSTRING(col,5,1)='-' AND SUBSTRING(col,6,2) NOT LIKE '%[^0-9]%' AND SUBSTRING(col,8,1)='-' AND SUBSTRING(col,9,2) NOT LIKE '%[^0-9]%'`（**刻意不驗證月份 1-12/日期 1-31 之曆法合法性，忠實保留 PG 版之「格式前綴比對、非真實日期驗證」寬鬆語意**）
  - `default`（不可達分支，見 CAST-UNIT-004）：不需轉換

---

### TS-MSSQL-P4A-CAST-UNIT-004：`getValidationRegex` 之 `default: '.*'` 分支為不可達死碼（`targetType` 已於外層白名單驗證僅允許 DECIMAL/INTEGER/DATE）
- **Related Requirement**：程式碼死碼觀察（非阻擋，記錄用）
- **Test Type**：Static / Unit
- **Expected Result**：確認外層 `if (!['DECIMAL','INTEGER','DATE'].includes(rule.targetType)) throw` 先行擋下非法值，`getValidationRegex` 之 default 分支於現行呼叫路徑下永不觸發；mssql 版轉換**不需要**為此死碼分支特別設計對應邏輯

---

### TS-MSSQL-P4A-CAST-UNIT-005：輸入欄位清單改用 `getMssqlTempTableColumns`（非 `information_schema.columns`）
- **Related Requirement**：I-MSSQL-TEMP-METADATA-01
- **Test Type**：Positive / Unit

---

### TS-MSSQL-P4A-CAST-UNIT-006：不支援的 `targetType` 仍拋錯（白名單驗證邏輯不因方言轉換而鬆動）
- **Related Requirement**：既有防禦性驗證回歸
- **Test Type**：Negative / Unit

---

### CAST-EQ（真實 MSSQL，含 🔴 空字串邊界旗艦案例）

### TS-MSSQL-P4A-CAST-EQ-001：`INTEGER` 有效值（`'123'`/`'-456'`）正確轉型，結果值與 PG 版一致
- **Related Requirement**：I-MSSQL-ETL-EQ-01
- **Test Type**：Positive / Integration

---

### TS-MSSQL-P4A-CAST-EQ-002（🔴 旗艦案例，本文件查證發現，MUST-FIX）：`INTEGER` 空字串 `''` 輸入 → MSSQL 轉換須明確拒絕（回傳 NULL），不可因 `LIKE` 空字串「空匹配真值」陷阱而誤判為合法整數
- **Related Requirement**：任務書明確點名「空字串邊界 PG `''~'^[0-9]+$'`=false vs MSSQL 差異」
- **Test Type**：Negative / Integration — **DoD 核心案例**
- **手算 oracle**：PG `'' ~ '^-?[0-9]+$'` = `false`（`+` 量詞要求至少 1 位數字，空字串不滿足）→ cast 結果為 `NULL`
- **★ 陷阱說明**：naive T-SQL 翻譯 `'' NOT LIKE '%[^0-9]%'` 本身求值為 **`TRUE`**（空字串內不存在「非數字字元」，`LIKE` 為空真式），若轉換時遺漏 `LEN(col) > 0` 額外守門，會導致空字串被誤判為合法整數（結果為 `0` 或轉型錯誤），與 PG 語意相反
- **Expected Result**：MSSQL 版對空字串輸入之驗證結果為 `false`（cast 為 NULL），須明確驗證 SQL 中含 `LEN(col) > 0`（或等價非空守門）

---

### TS-MSSQL-P4A-CAST-EQ-003：`DECIMAL` 空字串邊界（同 CAST-EQ-002 邏輯，套用於 DECIMAL）
- **Related Requirement**：同上
- **Test Type**：Negative / Integration

---

### TS-MSSQL-P4A-CAST-EQ-004：`DATE` 空字串/過短字串（`'2024'`，長度 4 < 10）邊界 → 兩引擎皆拒絕
- **Related Requirement**：同上
- **Test Type**：Negative / Integration

---

### TS-MSSQL-P4A-CAST-EQ-005：`INTEGER`/`DECIMAL` 輸入為單一 `'-'`（僅負號、無數字）→ 兩引擎皆拒絕
- **Related Requirement**：PG `+` 量詞要求負號後至少 1 位數字
- **Test Type**：Boundary / Integration
- **手算 oracle**：PG `'-' ~ '^-?[0-9]+$'` = `false`

---

### TS-MSSQL-P4A-CAST-EQ-006（🔴）：`DATE` 格式正確但曆法無效（`'9999-99-99'`）→ 兩引擎皆**接受**（格式前綴比對通過，非真實日期驗證）
- **Related Requirement**：DATE 正則無 `$` 錨點之既有寬鬆語意，MSSQL 轉換**不得**意外「改善」為真實日期驗證
- **Test Type**：Positive / Integration — 防止過度修正（over-correction）之決策關卡
- **手算 oracle**：PG `'9999-99-99' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'` = `true`（純格式比對）
- **Expected Result**：MSSQL 版驗證結果亦為 `true`（通過格式檢查，實際 `TRY_CAST` 到 DATE 型別時才會因真實曆法無效而回傳 NULL——此為兩階段行為，格式驗證與型別轉換分屬不同步驟，MSSQL 版須保持相同兩階段結構）

---

### TS-MSSQL-P4A-CAST-EQ-007（🔴）：`DATE` 格式正確但含合法前綴後之任意尾碼（`'2024-01-01garbage'`）→ 兩引擎皆**接受**（無 `$` 錨點的既有寬鬆語意）
- **Related Requirement**：同上，防止過度修正
- **Test Type**：Positive / Integration

---

### TS-MSSQL-P4A-CAST-EQ-008：`DATE` 有效值（`'2024-06-15'`）正確轉型為 DATE 型別，結果值與 PG 版一致
- **Related Requirement**：I-MSSQL-ETL-EQ-01
- **Test Type**：Positive / Integration

---

### TS-MSSQL-P4A-CAST-EQ-009：`toPgType`→`toMssqlType` 之 `INTEGER`/`INT` T-SQL 同義詞正面驗證（CAST-UNIT-002 附註之真實環境確認，不僅信任訓練知識）
- **Related Requirement**：CAST-UNIT-002
- **Test Type**：Positive / Integration
- **Expected Result**：不論 mssql 版選用 `INT` 或 `INTEGER` 字面值，`TRY_CAST` 皆成功執行不拋語法錯誤

---

### TS-MSSQL-P4A-CAST-EQ-010：真實 customer_core 唯一實際使用之 cast rule（`VARCHAR→DECIMAL`）於代表性 fixture 執行，結果與 PG 版逐列相符
- **Related Requirement**：I-MSSQL-ETL-EQ-01；真實資料驗證（`etl-pipelines.json` 查證確認 customer_core 2 個 type_cast 節點皆僅用 DECIMAL，INTEGER/DATE 為程式碼支援但此 pipeline 未觸及之路徑）
- **Test Type**：Positive / Integration
- **附註**：INTEGER/DATE 之 EQ 覆蓋（CAST-EQ-001/004/005/008）為防禦性代表性 fixture，非 customer_core 端對端可自然覆蓋，P4d 端對端測試時不應預期看到這兩型別被實際觸發

---

### TS-MSSQL-P4A-CAST-EQ-011：NULL 輸入 → 直接回傳 NULL，不進入正則驗證（兩引擎皆同，短路邏輯不變）
- **Related Requirement**：既有 `CASE WHEN col IS NOT NULL THEN ... ELSE NULL END` 外層短路
- **Test Type**：Boundary / Integration

---

## 九、COND — `conditional-handler.ts` mssql 版（最低風險群組）

### COND-UNIT

### TS-MSSQL-P4A-COND-UNIT-001：`CASE WHEN ... END` 結構原樣保留（ANSI 相容，AD §3.2 判定「不需改」）
- **Related Requirement**：AD §3.2 conditional-handler 列
- **Test Type**：Positive / Unit
- **Expected Result**：SQL `CASE WHEN` 結構與 PG 版邏輯等價（僅識別碼引號風格待 QUOTE-003 定案）

---

### TS-MSSQL-P4A-COND-UNIT-002：NULL-safety guard clause（`buildCaseSql` 之 left/right 全 NULL 防護分支）邏輯不變
- **Related Requirement**：既有邏輯（純 `IS NULL`/`AND`，ANSI 相容，無方言風險）
- **Test Type**：Positive / Unit

---

### TS-MSSQL-P4A-COND-UNIT-003：輸入欄位清單改用 `getMssqlTempTableColumns`（非 `information_schema.columns`）
- **Related Requirement**：I-MSSQL-TEMP-METADATA-01
- **Test Type**：Positive / Unit

---

### TS-MSSQL-P4A-COND-UNIT-004：`left.`/`right.` 前綴解析（`resolveWhen`/`resolveValue`）純字串處理，逐一比對 PG/MSSQL 版輸出 SQL 文字結構相同
- **Related Requirement**：既有邏輯回歸（純 JS 端字串處理，非 SQL 方言差異點）
- **Test Type**：Positive / Unit

---

### COND-EQ（真實 MSSQL，真實 customer_core 表達式）

### TS-MSSQL-P4A-COND-EQ-001：真實 customer_core conditional 表達式 `resign_date = '9999-12-31' → NULL, ELSE → resign_date`（哨兵值轉換）於 MSSQL 執行結果與 PG 版一致
- **Related Requirement**：I-MSSQL-ETL-EQ-01；真實資料驗證（`etl-pipelines.json` 唯二 conditional 節點之一）
- **Test Type**：Positive / Integration
- **附註**：呼應既有 `feedback_emphire_active_resign_sentinel` 記憶（哨兵值 `9999-12-31` 語意跨模組一致，但此處為獨立 customer_core pipeline 內部轉換，非 emphire 在職判斷邏輯，僅字面哨兵值巧合相同，不可混用邏輯）

---

### TS-MSSQL-P4A-COND-EQ-002：真實 customer_core conditional 表達式 `source_updated_at >= right.source_updated_at → left.X, ELSE → right.X`（merge 後衝突解決規則，15 個欄位共用同一比較邏輯）於 MSSQL 執行結果與 PG 版一致
- **Related Requirement**：I-MSSQL-ETL-EQ-01；真實資料驗證
- **Test Type**：Positive / Integration
- **Steps**：構造 `left`/`right` 時間戳記分別為「left 較新」「right 較新」「兩者相等」三種情境
- **Expected Result**：三種情境下兩引擎選出的來源欄一致；「相等」情境下依現行程式碼邏輯（`>=`）應選 left（無 tie-breaker 爭議，非 dedup 那種 P4c 才處理的 ctid 情境）

---

### TS-MSSQL-P4A-COND-EQ-003：中文欄位值（`customer_type_desc` 等）於 conditional 分流後正確 round-trip
- **Related Requirement**：I-MSSQL-COLLATE-01 延伸
- **Test Type**：Positive / Integration

---

## 十、REG — 回歸

### TS-MSSQL-P4A-REG-001：`tsc --noEmit -p tsconfig.build.json` 乾淨（DoD 紅線）
- **Related Requirement**：AD §9 P4a DoD「`tsc --noEmit` 乾淨」
- **Test Type**：Static Gate

---

### TS-MSSQL-P4A-REG-002：5 個現行 PG handler 原始檔逐位元組未變（`extract-handler.ts`/`field-mapping-handler.ts`/`derived-field-handler.ts`/`type-cast-handler.ts`/`conditional-handler.ts`）
- **Related Requirement**：AD §1.2「postgres 分支完全不動，cutover 前零風險」
- **Test Type**：Static / Regression
- **Steps**：`git diff` 或內容 hash 比對本輪變更前後
- **Expected Result**：五檔零差異

---

### TS-MSSQL-P4A-REG-003：既有 `engine-node-executors.spec.ts`/`engine-core.spec.ts`/`engine-target-load.spec.ts`（PG 版）套件全數不回歸
- **Related Requirement**：既有測試套件回歸
- **Test Type**：Regression

---

### TS-MSSQL-P4A-REG-004：`mssql-temp-foundation.mssql.spec.ts`/`mssql-temp-foundation-spike2.mssql.spec.ts`（P4-spike-1/2）全數不回歸
- **Related Requirement**：既有 spike 套件回歸（`dropMssqlTempTableIfExists` 為 additive 擴充對象，須確認未被意外破壞既有簽章）
- **Test Type**：Regression

---

### TS-MSSQL-P4A-REG-005：sqlite 測試路徑不受影響（既有 mock-based 單元測試對 sqlite driver 之既有假設不變）
- **Related Requirement**：三 driver 並存回歸
- **Test Type**：Regression

---

## 十一、STATIC — 靜態守門

### TS-MSSQL-P4A-STATIC-001（I-MSSQL-CATALOG-CASE-01）：5 個新 mssql handler 檔（+ `resolve-raw-table-mssql.ts`）內，凡查詢**真實持久表**（`raw_*`/`extraction_tasks`/`datasources`）之 catalog 語句，`INFORMATION_SCHEMA` 一律大寫；凡查詢**`##` 暫存表**欄位者，一律改用 `tempdb.sys.columns`（零 `information_schema.columns` 命中）
- **Related Requirement**：I-MSSQL-CATALOG-CASE-01／I-MSSQL-TEMP-METADATA-01
- **Test Type**：Static
- **Steps**：`fs.readFileSync` + regex 掃描 6 個新檔
- **Expected Result**：零小寫 `information_schema` 命中；`information_schema.columns`／`INFORMATION_SCHEMA.COLUMNS` 僅允許出現於查詢真實表（非 `##` 前綴表名參數）之語境（人工核對，非純 regex 可完全自動化，記錄為半自動守門）

---

### TS-MSSQL-P4A-STATIC-002：5 個新 mssql handler 檔命名鎖定 — `extract-handler-mssql.ts`/`field-mapping-handler-mssql.ts`/`derived-field-handler-mssql.ts`/`type-cast-handler-mssql.ts`/`conditional-handler-mssql.ts` 皆存在於 `apps/api/src/modules/etl/engine/handlers/` 目錄
- **Related Requirement**：AD §1.2「每個 handler 對應一個平行的 `*-mssql.ts` 新檔」命名慣例
- **Test Type**：Static

---

### TS-MSSQL-P4A-STATIC-003：`temp-table.util.ts` 恰含 4 個匯出函式（`dropMssqlTempTableIfExists`／`createMssqlTempTable`／`getMssqlTempTableColumns`／`countMssqlTempTableRows`），無重複定義、無被覆寫的證據（比對本輪 Edit 前後 `dropMssqlTempTableIfExists` 簽章逐字元相同）
- **Related Requirement**：P4-spike-2 交接注意事項第 1 點「additive，勿覆寫」
- **Test Type**：Static

---

### TS-MSSQL-P4A-STATIC-004（本文件查證結論存證）：`getValidationRegex` 三目標型別轉換公式與 CAST-UNIT-003 結論逐一對應存在於 mssql 版原始碼（非僅測試案例斷言行為、原始碼本身亦可讀出對應字元類別邏輯）
- **Related Requirement**：CAST-UNIT-003 覆核結論落地驗收
- **Test Type**：Static

---

## 風險與發現彙整（詳細已同步至 `risks-and-gaps.md`）

1. **🔴 QUOTE 群組（雙引號識別碼跨 driver 相容性）為 P4a 最基礎、最高風險之未驗證前提**，若失敗將影響全部 5 個 handler、擴及 P4b/c，需立即回報架構師。
2. **`resolve-raw-table.ts` 需要獨立 `resolve-raw-table-mssql.ts` 新檔**，AD §3.2 完全未提及，屬 extract-handler 必要依賴，已納入 EXTRACT-RESOLVE 群組。
3. **`mergePhone()` 之 `~ '^0+$'` 正則、`gen_random_uuid()`、`field-mapping-handler.ts` 之 boolean `defaultValue` 裸字面值** 三處為 AD §3.2 表格文字未列出但實際存在（部分屬真實高頻使用）之轉換站點，已逐一納入對應群組。
4. **🔴 AD §3.2 建議之 `LPAD → RIGHT(REPLICATE(char,n)+col,n)` 轉換公式在輸入長度 ≥ n 時與 PG 語意不一致**（截斷方向相反），已設計 DERIVED-EQ-001 旗艦案例並於 DERIVED-UNIT-002 設計 MUST-FIX 紅燈守門，正確公式須含 `LEN(col)>=n THEN LEFT(col,n)` 分支。
5. **`getValidationRegex` 空字串邊界之 `LIKE` 「空匹配真值」陷阱**（naive `'' NOT LIKE '%[^0-9]%'` 求值為 `TRUE`，與 PG `+` 量詞要求「至少一位數字」語意相反），已設計 CAST-EQ-002 旗艦案例。
6. **`NodeOutputStore.cleanupAll()` 為現行天然貫穿成功/失敗兩路徑之清理收斂點**，不在 AD §1.2 明文凍結清單內，建議 tdd-implementation 優先評估此處接線（CLEANUP-003 決策記錄要求）。
7. **`dbo` schema 佔用範圍已隨 P4 系列擴大**（P1b2/P1b3「獨佔保留」慣例事實上已延伸至 P4-0/P4a/P4c/P4d），若 CI 尚無 `.mssql.spec.ts` 序列化 lane，本輪 EXTRACT 群組將再疊加曝險，非本輪可解決但應記錄。
8. **`createDispatcher()` 是否於 P4a 提前接上 `DB_TYPE` 分支為決策關卡**（本文件建議延後至 P4c 全部 9 handler 到齊才一次接上，P4a 測試手法全數繞過 dispatcher、直接實例化 handler class）。
