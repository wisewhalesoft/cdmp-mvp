---
type: test-design-infrastructure
test-spec-id: AD-E07-41-P4b
feature_name: MSSQL 全面遷移 P4b — ETL Handler 群組二（merge / lookup，含 UPDATE...FROM 重構）
priority: P0-MVP
related_spec:
  - /docs/specs/implementation-log/AD-E07-41-mssql-p4-etl-engine.md（§1.3 ##global temp、§3 共用 temp helper、§3.2 merge/lookup 逐項方言、§5 Pattern B/cast、§9 P4b 範圍/DoD、§10 不變式）
  - /docs/specs/implementation-log/AD-E07-41-P4a-impl.md（前一切片交接：QUOTE-003 PASS 結論可逐字複用、CLEANUP-003 掛載於 NodeOutputStore.cleanupAll() 之決策、DISPATCH-001 選項甲（createDispatcher 延後至 P4c 才接線）、temp-table.util.ts additive 擴充慣例、resolve-raw-table-mssql.ts 已預留供 lookup 共用）
  - /docs/specs/implementation-log/AD-E07-41-P4-spike2-impl.md（##global 併發/崩潰清理驗證，P4a/b/c 共同前置閘，已通過）
covers: []
spec_version: "1.0"
date: 2026-07-08
last_updated: 2026-07-08
---

# AD-E07-41 P4b：MSSQL 全面遷移 — ETL Handler 群組二（merge / lookup，含 UPDATE...FROM 重構）— 測試設計

> 本文件覆蓋 AD-E07-41「MSSQL 全面遷移 P4（ETL 引擎 MSSQL 化）」之 **P4b 切片**（§3.2 對應 2 個 handler：`merge-handler.ts`/`lookup-handler.ts`；`lookup-handler.ts` 之 `UPDATE...FROM`/`DELETE...WHERE NOT EXISTS` 重構，比照 P3 已建立之轉換模式）。
> P4 不經 spec-writer（AD-E07-41「是否需要 spec-writer」章節已裁定，比照 P4a 先例，本輪不重複論證）；本文件依 system-architect 產出之 AD-E07-41 + 前一切片 P4a 之落地事實，直接產出測試設計，交 tdd-implementation。
>
> **範圍**：`merge-handler.ts` 之 CTAS→`SELECT INTO ##` 改寫（FULL OUTER JOIN 本身 ANSI 相容不需改）；`lookup-handler.ts` 全部三種 `noMatchStrategy`（`null`/`skip_row`/`default_value`）分支之 `UPDATE...FROM`/`DELETE...WHERE NOT EXISTS`/`ALTER TABLE ADD COLUMN` 改寫；兩檔共用之 `::text`→`CAST`、`information_schema`→`tempdb.sys.columns`/`INFORMATION_SCHEMA`（大寫）、`$n`→具名參數站點。
> **明確排除**（分別由 P4c/P4d/P4e 各自一棒設計）：`dedup-handler.ts`（`ROW_NUMBER()`/`IDENTITY` tie-breaker）+ `target-load-handler.ts`（customer_core UPSERT 兩段式，P4c）；53 節點端對端（P4d）；bulk-load raw staging 寫入端（P4e）。
>
> **前置閘已過**：P4-spike-2 已於 2026-07-08 全數通過；P4a 已完成並落地 QUOTE-003（雙引號識別碼跨 driver 相容性 PASS，5 個 handler 逐字複用結論，本文件直接沿用不重測）、`temp-table.util.ts` 全部 4 個共用 helper、`resolve-raw-table-mssql.ts`（P4a impl log 已明文標註「供未來 `lookup-handler-mssql.ts`（P4b）共用」）、`NodeOutputStore.cleanupAll()` 之 mssql 分支 + `createdTables` 累積集合機制。本文件所有真實 MSSQL 案例可直接執行，無需等待任何前置探索。
>
> **★ test-designer 逐檔查證 + 對照真實 `etl-pipelines.json`（customer_core 53 節點種子資料）發現之關鍵事實（比照 P4a「逐檔查證」慣例，任務書與 AD §3.2 表格文字皆未窮盡下列站點）**：
>
> 1. **🔴🔴（本文件最高風險，AD 與任務書皆完全未提及）`lookup-handler.ts` 之 `ALTER TABLE "${inputTable}" ADD COLUMN IF NOT EXISTS "${alias}" TEXT`**——此陳述式於 `null`/`default_value`/`skip_row` 三種 `noMatchStrategy` 分支**皆會執行**（每個 outputColumn 一次）。T-SQL `ALTER TABLE` 之新增欄位語法為 `ALTER TABLE t ADD col_name data_type`，**不接受 `COLUMN` 保留字**於此位置，**亦無 `IF NOT EXISTS` 子句**（PG 9.6+ 專屬語法糖）。且目標型別 `TEXT` 為 SQL Server 已棄用型別，與後續 `TRIM`/字串比較操作相容性差，應改用 `NVARCHAR(MAX)`。真實 customer_core pipeline **31 個 lookup 節點、每節點恰 1 個 outputColumn**，即完整月名單分派會執行 31 次此陳述式——若逐字複製 PG 語法，**100% 語法錯誤，且是本切片唯一「未經任何方言轉換即必定崩潰」的站點**，風險等級高於任務書已點名的 `UPDATE...FROM` 重構（該重構若逐字翻譯仍可能「恰好」因保留原表名而非法但語意不確定，`ADD COLUMN IF NOT EXISTS` 則是**保證**編譯期語法錯誤）。已獨立立一節（§一 ALTERCOL）處理，置於本文件最優先位置。
> 2. **真實 customer_core 31 個 lookup 節點：100% legacy mode（`lookupRef` 解析）、100% `noMatchStrategy='null'`**（LEFT JOIN 語意）。`dual-input` 模式（`lookup-input` handle）與 `skip_row`（`DELETE...WHERE NOT EXISTS`）/`default_value` 兩分支於真實 pipeline **0% 被觸發**——比照 P4a `FIELDMAP-UNIT-004`（boolean `defaultValue`）處理精神，這三者列為防禦性 UNIT（+ 輕量 MSSQL 語法確認），**非** P4d 端對端可自然覆蓋之路徑，測試密度應明顯低於 `null` 分支。
> 3. **25/31（81%）lookup 節點使用 `lookupFilter`**（如 `"TBL_ID" = 'A2'`，識別碼=字面值等式）——AD §3.2 lookup 列與任務書皆完全未提及此欄位。語法本身簡單（無 PG 專屬 cast/正則），但因是高頻真實站點（高於 AD 唯一提及的 `UPDATE...FROM`/`DELETE` 骨幹本身之外的細節），需獨立驗證正確併入 T-SQL 子查詢 `WHERE`，且需驗證「filter 排除的列即使 match 欄位相符也不可誤配」（見 UPDATEFROM-EQ-003）。
> 4. **🔴 UPDATE...FROM 重構之精確風險（任務書已點名，本文件查證出具體翻譯陷阱）**：PG `UPDATE "${inputTable}" _src SET ... FROM (${lookupSubQuery}) _lk WHERE ...` 中 `_src` 是**於 `UPDATE` 子句內就地宣告的別名**（PG 特有語法，target 不需另外列於 `FROM`）。若逐字翻譯僅替換 `::text`→`CAST`、保留 `UPDATE _src SET ... FROM (subquery) _lk WHERE ...` 結構（僅將 `"${inputTable}"` 替換為 `##${inputTable}` 但未把它併入 `FROM`），T-SQL 會因別名 `_src` 從未經 `FROM` 宣告而拋 `Invalid object name '_src'` 或 `Must declare the scalar variable "_src"`。正確改寫須為 `UPDATE _src SET ... FROM ##input AS _src JOIN (subquery) AS _lk ON <原 WHERE 條件>`（target 顯式併入 `FROM`/`JOIN`）。此為本文件第二高風險站點，已獨立立一節（§二 UPDATEFROM）處理。
> 5. **真實 4 個 merge 節點：100% `sameKeyName=true`（同名 JOIN key：`CUSTO_NO`/`CUSTID`×2/`source_customer_no`），且 `m2→m3` 為鏈式合併**（`m3` 之左輸入為 `m2` 輸出，已含 `m2` 自身產生的 `CUSTID_left`/`CUSTID_right` 衍生欄位，`m3` 須正確跳過而非重複處理或衝突命名）。`sameKeyName=false`（不同名 key）分支於真實 pipeline **0% 觸發**，比照發現 2 之精神列為防禦性 UNIT。
> 6. `merge-handler.ts` 之 `getColumns()` 現查詢 `information_schema.columns WHERE table_name=$1`——查詢對象為上游 `##` 暫存表，依 I-MSSQL-TEMP-METADATA-01 必須改用既有 `getMssqlTempTableColumns`（非全新站點，但 AD §3.2 merge 列僅籠統稱「`createMssqlTempTable` 包裝」，未明說此欄位內省細節，同型於 P4a 已踩雷之「表格文字未窮盡私有方法內嵌站點」模式）。
> 7. `lookup-handler.ts` legacy mode 另有一處 AD 完全未提及的 catalog 查詢站點：`SELECT table_name FROM information_schema.tables WHERE table_name = $1`（驗證 `lookupSource`/`lookupRef` 解析出之 raw 表確實存在）——比照 P4a `EXTRACT-UNIT-002` 之 `INFORMATION_SCHEMA.TABLES`（大寫）+ 具名參數改寫模式。

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件全部 + `AD-E07-41-mssql-p4-etl-engine.md`（§3.2 merge/lookup 列、§5.2/5.3）+ `AD-E07-41-P4a-impl.md`（QUOTE-003/CLEANUP-003/DISPATCH-001 三項決策，本輪沿用不重議）+ `apps/api/src/modules/etl/engine/handlers/mssql/temp-table.util.ts`（唯讀複用，本輪**不修改**此檔）+ `apps/api/src/modules/etl/engine/handlers/resolve-raw-table-mssql.ts`（唯讀複用，`lookup-handler-mssql.ts` 之 legacy mode 解析須呼叫此既有函式，不得重新實作）+ `merge-handler.ts`/`lookup-handler.ts`（PG 原始碼，逐一對照）+ `apps/api/src/database/seeds/data/etl-pipelines.json`（真實 customer_core 之 31 個 lookup + 4 個 merge 節點設定，本文件 EQ 群組之唯一真實資料來源）|
| QA / Tester | 本文件 + `risks-and-gaps.md`（MSSQL P4b 風險段落） |
| DevOps / CI/CD | 本文件「零、測試環境與 Harness 設計」§0.2（`dbo` 佔用範圍再次擴大提醒） |

---

## 零、測試環境與 Harness 設計

### 0.1 沿用 P4a 既有 Harness，additive 擴充而非另建

沿用 `mssql-env-preload.ts`（gating helper）與 `_p4a-mssql-harness.ts`（`connectMssql`/`teardownMssql`/`uniqueLogId`/`tempName`/`makeRealCtx`）——**建議直接複用該共用 harness 檔案**（若需要新增 fixture builder，如「raw lookup 來源表」或「`extraction_tasks`/`datasources` 種子」，以 additive 方式擴充，比照 `temp-table.util.ts` 於 P4-spike-2→P4a 之擴充慣例，不另建 `_p4b-mssql-harness.ts` 造成邏輯分裂）。`vi.setConfig({ testTimeout: 60000 })` 沿用。新增檔案建議命名：`merge-handler.mssql.spec.ts`／`lookup-handler.mssql.spec.ts`／`alter-column.mssql.spec.ts`／`update-from.mssql.spec.ts`，皆置於 `apps/api/src/modules/etl/engine/__tests__/`，加 `p4b-` 前綴（比照 P4a），UNIT/STATIC 另置 `p4b-mssql-unit.spec.ts`/`p4b-mssql-static.spec.ts`（非 gated，CI 恆跑）。

### 0.2 `dbo` 佔用範圍再次擴大（★ 與 P4a 之關鍵差異：本輪比 group-1 handler 更依賴 `dbo`）

| 測試對象 | 資料落點 | 是否需要 `dbo` |
|---|---|---|
| `merge-handler.ts` 之左右輸入與輸出 | 全數 `##` 全域暫存表（fixture 直接 `SELECT ... INTO ##left/##right FROM (VALUES ...)`） | **否**——與 P4a `field_mapping`/`derived_field`/`type_cast`/`conditional` 四組同理，完全不落 `dbo` |
| `lookup-handler.ts` **legacy mode**（100% 真實用法，見查證發現 2） | `lookupRef` 解析依賴 `extraction_tasks`/`datasources`（P1b1/P1b2 既有 baseline 表）+ 解析出之 raw 表本身（裸表名，無 schema 前綴） | **是** |
| `lookup-handler.ts` **dual-input mode**（防禦性覆蓋，0% 真實用法） | `lookup-input` 之上游 `##` 表，無需 `lookupRef` 解析 | **否** |

**結論**：P4b 因 lookup 之 legacy-mode 為 100% 真實使用路徑，**必須**落於 `dbo`，與 P4a `EXTRACT` 群組同理（沿用其隨機化尾碼命名 `raw_p4b_fixture_<8hex>` + `afterAll` 主動清除之範圍限縮設計）。`merge` 群組與 lookup 之 dual-input/skip_row/default_value 防禦性案例則完全繞開 `dbo`，可與其他套件平行執行不衝突。**`dbo` 獨佔保留慣例第三度延伸**（P1b2/P1b3 → P4-0/P4a → 本輪 P4b），若 CI 尚無序列化 lane，此為既有已記錄風險（`R-MSSQL-P1B3-03`/`R-MSSQL-P4A-05`）之再次疊加，記入本文件風險段落，非阻擋。

### 0.3 Fixture 建構風格

- `##` fixture（merge 兩側輸入、lookup 之主輸入）：`SELECT * INTO ##name FROM (VALUES (...),(...)) AS v(col1,col2,...)`（比照 P4a 既定寫法）。
- `dbo.raw_p4b_fixture_<hex>`（lookup legacy-mode 之對照表本身）：`CREATE TABLE dbo.raw_p4b_fixture_<hex> (...)` + `INSERT`，`afterAll` 清除；內容比照真實 `ZZIP_BAMCODE_D`/`ZZIP_BAMPOST_M` 型態之代碼對照結構（`TBL_ID`/`TBL_CD`/`TBL_DESC1` 或 `POSTAL_NO`/`POSTAL_ADD`）。
- `extraction_tasks`/`datasources` fixture：沿用 P4a `EXTRACT-RESOLVE` 群組之既定 fixture 手法（一筆 `datasources` + 一筆 `extraction_tasks` 指向上方 raw fixture 表）。
- **禁止**：以真實 customer_core 巨量資料作為輸入（P4b 為 handler 隔離驗證層，非 P4d 端對端）。

### 0.4 EQ（等價性）驗證方法論分層（沿用 P4a §0.4 精神）

1. **UNIT（mock QueryRunner，免真實連線，CI 恆常執行）**：SQL 文字方言關鍵字比對（`SELECT ... INTO ##` 非 `CREATE TEMP TABLE`、`tempdb.sys.columns` 非 `information_schema.columns`、`INFORMATION_SCHEMA.TABLES` 大寫、`CAST(...AS NVARCHAR)` 非 `::text`、具名參數非 `$n`、**`ALTER TABLE ... ADD` 不含 `COLUMN`/`IF NOT EXISTS`/`TEXT` 型別**、**`UPDATE` 目標別名須於 `FROM` 宣告**）。
2. **MSSQL EQ（真實連線，手算 oracle）**：merge 之 COALESCE/`_left`/`_right`/鏈式合併；lookup 之 `null` 分支（真實 100% 用法）逐列比對、`lookupFilter` 正確排除、TRIM 空白處理、ALTER TABLE ADD COLUMN 冪等性。
3. **TRAP（陷阱佐證，比照 P4a `CAST-EQ-002` 精神）**：對本文件查證出的兩處「保證失敗」翻譯陷阱（ALTER TABLE ADD COLUMN IF NOT EXISTS 直接複製、UPDATE 別名未於 FROM 宣告），以手動組裝之 naive PG 逐字翻譯字串對真實 MSSQL 執行，佐證失敗確實發生（非假設性風險），強化 MUST-FIX 案例之說服力。

---

## 一、ALTERCOL — `ALTER TABLE ADD COLUMN IF NOT EXISTS` 轉換（🔴🔴 本文件最高風險，最優先處理）

> **對應**：查證發現 1。`lookup-handler.ts` 之 `ALTER TABLE "${inputTable}" ADD COLUMN IF NOT EXISTS "${alias}" TEXT`，三種 `noMatchStrategy` 分支皆執行，真實 customer_core 31 個節點各執行 1 次。此為本切片**唯一保證編譯期語法錯誤**（非執行期語意風險）的站點，優先權高於 UPDATE...FROM（見 §二）。

### TS-MSSQL-P4B-ALTERCOL-UNIT-001（🔴 MUST-FIX）：mssql 版 SQL 不得含字面 `ADD COLUMN`
- **Related Requirement**：查證發現 1（T-SQL `ALTER TABLE ADD` 語法無 `COLUMN` 保留字於此位置）
- **Test Type**：Negative / Unit — 對「逐字複製 PG `ADD COLUMN` 語法」之實作預期為紅燈
- **Steps**：檢視 `LookupHandlerMssql.execute()` 產出之全部 `ALTER TABLE` SQL 文字
- **Expected Result**：SQL 結構為 `ALTER TABLE ##xxx ADD "alias" NVARCHAR(...)`（或等價寫法），**不得**出現 `ADD COLUMN` 字面組合

---

### TS-MSSQL-P4B-ALTERCOL-UNIT-002（🔴 MUST-FIX）：mssql 版 SQL 不得於 `ALTER TABLE ADD` 直接使用 `IF NOT EXISTS` 子句
- **Related Requirement**：查證發現 1（T-SQL `ALTER TABLE ADD` 無此子句，PG 9.6+ 專屬語法糖）
- **Test Type**：Negative / Unit — 對「逐字複製」之實作預期為紅燈
- **Expected Result**：**不得**出現 `ADD COLUMN IF NOT EXISTS` 或 `ADD IF NOT EXISTS` 字面組合；欄位存在性冪等檢查須改以其他機制達成（見 ALTERCOL-GATE-001，機制本身不預設）

---

### TS-MSSQL-P4B-ALTERCOL-UNIT-003（🔴 MUST-FIX）：新增欄位型別須為 `NVARCHAR(MAX)`（或等價足夠長度 NVARCHAR），不得為裸 `TEXT`
- **Related Requirement**：查證發現 1（`TEXT` 為已棄用型別，與後續 `TRIM`/比較操作相容性風險）
- **Test Type**：Negative / Unit
- **Expected Result**：欄位型別宣告為 `NVARCHAR(MAX)` 或明確足夠長度之 `NVARCHAR(N)`；**不得**出現裸 `TEXT` 關鍵字

---

### TS-MSSQL-P4B-ALTERCOL-GATE-001（🔴 決策關卡，不預設實作位置，比照 P4a CLEANUP-003／P2c MOUNT-001 精神）：欄位存在性冪等檢查之實作位置須於 impl log 明確記錄
- **Related Requirement**：查證發現 1（AD/任務書皆未提及此站點，機制本身無先例）
- **Test Type**：Decision Gate（文件化守門）
- **Expected Result（兩分支皆可接受，但須記錄）**：
  - **選項甲**：JS 端先呼叫既有 `getMssqlTempTableColumns` 預查欄位是否已存在，僅在不存在時才發出純 `ALTER TABLE ... ADD ...`（無條件式 DDL，邏輯移至 JS 端，可重用既有 helper，**建議**）。
  - **選項乙**：SQL 端條件式 `IF NOT EXISTS (SELECT 1 FROM tempdb.sys.columns WHERE object_id=OBJECT_ID('tempdb..'+@0) AND name=@1) BEGIN ALTER TABLE ... ADD ... END`（單次往返，但 DDL 混入條件邏輯，可讀性較低）。
  - 若 impl log 之 Architectural Decisions 段落未記錄選擇，本案例判定失敗

---

### TS-MSSQL-P4B-ALTERCOL-MSSQL-001：真實 MSSQL — 首次呼叫成功新增欄位，欄位存在且型別為 NVARCHAR
- **Related Requirement**：查證發現 1；I-MSSQL-TEMPTABLE-GLOBAL-01
- **Test Type**：Positive / Integration
- **Expected Result**：`getMssqlTempTableColumns` 可查得新欄位，型別為 `nvarchar`（非 `text`）

---

### TS-MSSQL-P4B-ALTERCOL-MSSQL-002（🔴 冪等性核心）：真實 MSSQL — 對同一 `##` 表、同一 alias 重複呼叫兩次，不拋「column already exists」錯誤
- **Related Requirement**：ALTERCOL-GATE-001 落地驗收
- **Test Type**：Positive / Integration — 冪等性回歸（原 PG `IF NOT EXISTS` 語意須被忠實保留）
- **Expected Result**：第二次呼叫不拋錯，欄位仍只存在一份（非重複欄位或型別衝突）

---

### TS-MSSQL-P4B-ALTERCOL-MSSQL-003：真實 MSSQL — 連續對同一 `##` 表新增多個不同 alias 欄位，互不干擾（模擬 31 個 lookup 節點鏈式新增各自 1 欄）
- **Related Requirement**：真實 customer_core 規模驗證（31 節點每節點 1 欄）
- **Test Type**：Positive / Integration
- **Steps**：對同一 `##` 表依序呼叫 5 次（模擬 5 個 lookup 節點），各自新增不同 alias
- **Expected Result**：最終欄位集合 = 原有欄位 ∪ 5 個新增欄位，順序與內容正確，無任何一次呼叫失敗

---

### TS-MSSQL-P4B-ALTERCOL-TRAP-001（🔴 陷阱佐證，比照 P4a `CAST-EQ-002` 精神）：naive PG 逐字翻譯字串對真實 MSSQL 執行確實拋語法錯誤
- **Related Requirement**：查證發現 1 — 佐證 ALTERCOL-UNIT-001/002/003 之必要性，證明此為真實陷阱而非假設性風險
- **Test Type**：Negative / Integration — 陷阱佐證（測試本身手動組裝 SQL 字串，非呼叫 handler）
- **Steps**：對真實連線直接執行 `ALTER TABLE ##probe ADD COLUMN IF NOT EXISTS "x" TEXT`
- **Expected Result**：拋出 T-SQL 語法錯誤（`Incorrect syntax near 'COLUMN'` 或等價訊息），確認此為 100% 必然失敗之陷阱

---

## 二、UPDATEFROM — `UPDATE...FROM` 重構（🔴 本文件第二高風險，任務書明確點名）

> **對應**：查證發現 4。PG `UPDATE "input" _src SET ... FROM (subquery) _lk WHERE TRIM(_src.col::text)=TRIM(_lk.col::text)` → T-SQL 須將 target 顯式併入 `FROM`/`JOIN`。此節之測試同時適用於 `null`（LEFT JOIN 語意，100% 真實用法）與 `skip_row`（INNER JOIN 語意）兩分支之 `UPDATE` 陳述式（兩者 SQL 骨幹相同，僅 `skip_row` 額外多一條後續 `DELETE`，見 §七）。

### TS-MSSQL-P4B-UPDATEFROM-UNIT-001（🔴 MUST-FIX）：UPDATE 目標別名須於 `FROM` 子句明確宣告
- **Related Requirement**：查證發現 4
- **Test Type**：Negative / Unit — 對「僅替換 `::text`→`CAST`、未把 target 併入 FROM」之實作預期為紅燈
- **Steps**：檢視產出 SQL 結構
- **Expected Result**：SQL 須為 `UPDATE _src SET ... FROM ##input AS _src JOIN (subquery) AS _lk ON <條件> `（或等價：target 以其原始 `##` 表名／別名之一形式出現在 `FROM` 或 `JOIN` 子句內），**不得**是「`UPDATE _src SET ... FROM (subquery) _lk WHERE ...`」（`_src` 未經任何 `FROM` 宣告）之逐字翻譯結構

---

### TS-MSSQL-P4B-UPDATEFROM-UNIT-002：`::text` cast 站點全數改為 `CAST(...AS NVARCHAR(N))`（或 `TRY_CAST`，二擇一皆可接受）
- **Related Requirement**：AD §5.3；本站點恆為「轉字串」型 cast（PG `::text` 對任意型別皆不會失敗），與 `type-cast-handler.ts` 之數值/日期 `TRY_CAST` 場景性質不同，但沿用 `TRY_CAST` 亦不影響正確性（P4a 已有先例全面採 `TRY_CAST` 求一致性），本案例不強制二擇一
- **Test Type**：Positive / Unit
- **Expected Result**：**不得**殘留 `::text`；`CAST`/`TRY_CAST` 皆視為通過

---

### TS-MSSQL-P4B-UPDATEFROM-UNIT-003：原 `WHERE` 比對條件（TRIM 雙邊比對）正確遷移至 `JOIN...ON`（或等價位置），不遺漏任一操作元
- **Related Requirement**：查證發現 4 — 確保「避免笛卡兒積」之關鍵比對邏輯未於重構過程中遺失
- **Test Type**：Positive / Unit
- **Steps**：比對 mssql 版 SQL 之 `ON`（或 `WHERE`，若採 `JOIN...ON true WHERE cond` 形式）子句與 PG 版 `WHERE` 子句之比對邏輯（`TRIM(_src.match)` = `TRIM(_lk.lookupMatch)`）
- **Expected Result**：比對條件之兩個操作元（match 欄位、lookupMatch 欄位）與運算子（`=`）逐一對應存在，未被簡化或遺漏任一側

---

### TS-MSSQL-P4B-UPDATEFROM-TRAP-001（🔴 陷阱佐證）：naive 翻譯字串（未宣告 `_src`）對真實 MSSQL 執行確實拋錯
- **Related Requirement**：查證發現 4 — 佐證 UPDATEFROM-UNIT-001 之必要性
- **Test Type**：Negative / Integration — 陷阱佐證（手動組裝 SQL，非呼叫 handler）
- **Steps**：對真實連線執行 `UPDATE _src SET x = _lk.y FROM (SELECT 1 AS y) _lk WHERE 1=1`（`_src` 未於 FROM 宣告）
- **Expected Result**：拋出 `Invalid object name '_src'` 或 `Must declare the scalar variable "_src"`（依實際 MSSQL 版本訊息為準，兩者皆視為佐證成立）

---

### TS-MSSQL-P4B-UPDATEFROM-EQ-001（🔴 旗艦案例，防笛卡兒積核心）：多列 lookup 來源 + 多列 input，逐列取得正確對應值（非全部誤填同一值）
- **Related Requirement**：查證發現 4；I-MSSQL-ETL-EQ-01；任務書「避免笛卡兒積/漏判」明確要求
- **Test Type**：Positive / Integration — **DoD 核心案例**
- **Preconditions**：lookup 子查詢回傳 3 列（代碼 `'1'`/`'2'`/`'3'` 各對應不同 desc 值）；input `##` 表 5 列，分別對應代碼 `'1'`/`'2'`/`'3'`/`'2'`（重複）/`'9'`（無匹配）
- **Expected Result**：每列輸出值精確對應其自身代碼之 desc（非全部列被填入同一任意值）；代碼 `'9'` 之列輸出為 `NULL`；輸入列數與輸出列數相同（`UPDATE` 不改變列數）

---

### TS-MSSQL-P4B-UPDATEFROM-EQ-002：未匹配列維持 `NULL`（`null` 策略之 LEFT JOIN 語意保留）
- **Related Requirement**：既有邏輯回歸（`noMatchStrategy='null'`，100% 真實用法）
- **Test Type**：Boundary / Integration

---

### TS-MSSQL-P4B-UPDATEFROM-EQ-003（真實高頻站點，查證發現 3）：`lookupFilter` 片段正確納入子查詢 `WHERE`，同 `lookupMatchColumn` 值但不同 filter 條件之列不可誤配
- **Related Requirement**：查證發現 3（25/31 真實節點使用）
- **Test Type**：Positive / Integration — **DoD 核心案例**
- **Preconditions**：仿真實 `lk_edu1` 型態，lookup 來源表含 `(TBL_ID='A2', TBL_CD='1', TBL_DESC1='國小')` 與 `(TBL_ID='A4', TBL_CD='1', TBL_DESC1='該列應被filter排除')`（**同一 `TBL_CD` 值，不同 `TBL_ID`**）；`lookupFilter="TBL_ID"='A2'`
- **Expected Result**：輸出值為 `'國小'`（`TBL_ID='A2'` 之列），**絕不可**誤配為 `TBL_ID='A4'` 之列，即使兩者 `TBL_CD` 相同

---

### TS-MSSQL-P4B-UPDATEFROM-EQ-004：TRIM 雙邊空白正確去除後比對成功
- **Related Requirement**：既有邏輯回歸（`TRIM` 存在之原始目的）
- **Test Type**：Boundary / Integration
- **Preconditions**：input `matchColumn` 值含前後空白（如 `' 1 '`），lookup 來源 `lookupMatchColumn` 值為乾淨 `'1'`
- **Expected Result**：比對成功（視為相符），輸出值正確填入

---

### TS-MSSQL-P4B-UPDATEFROM-EQ-005：全數不匹配（lookup 子查詢因 filter 而為空集合）→ 全部輸出為 NULL，不拋錯，列數不變
- **Related Requirement**：既有邊界行為回歸
- **Test Type**：Boundary / Integration

---

### TS-MSSQL-P4B-UPDATEFROM-EQ-006：中文 lookup 輸出值（`desc` 類欄位，如 `'借新還舊'`）正確 round-trip
- **Related Requirement**：I-MSSQL-COLLATE-01 延伸
- **Test Type**：Positive / Integration

---

## 三、CLEANUP — 顯式清理呼叫回歸（延伸至 merge/lookup，I-MSSQL-TEMPTABLE-CLEANUP-01）

> **對應**：P4a `CLEANUP-003` 已裁定掛載於 `NodeOutputStore.cleanupAll()`（依 `DB_TYPE==='mssql'` 分支 + `createdTables` 累積集合），本節**不重議**掛載位置決策，僅驗證此既有機制正確涵蓋 merge（新建 `##` 表）與 lookup（**不**新建 `##` 表，原地 `ALTER`）兩種不同的 `DataSet.tempTable` 回傳模式。

### TS-MSSQL-P4B-CLEANUP-001：merge 節點新建之 `##` 表被 `NodeOutputStore.set()` 正確納入 `createdTables`
- **Related Requirement**：I-MSSQL-TEMPTABLE-CLEANUP-01 回歸（新 handler 對既有機制之正確接線）
- **Test Type**：Positive / Unit（黑盒，比照 P4a CLEANUP-001 精神）
- **Expected Result**：`store.set(nodeId, mergeResult)` 後，`mergeResult.tempTable` 出現於後續 `cleanupAll()` 之清理呼叫對象集合

---

### TS-MSSQL-P4B-CLEANUP-002：lookup 節點回傳與輸入相同之 `tempTable`（原地修改），重複註冊不造成錯誤或重複 DROP
- **Related Requirement**：I-MSSQL-TEMPTABLE-CLEANUP-01；`createdTables` 為 `Set`，天然去重
- **Test Type**：Positive / Unit — 驗證「不新建表」之 handler 與既有 `Set` 累積機制相容
- **Steps**：模擬 `extract→lookup` 兩節點（`lookup` 之 `DataSet.tempTable` 與 `extract` 相同），檢查 `createdTables` 內容
- **Expected Result**：該 `##` 表名於 `createdTables` 內恰出現一次（`Set` 語意），`cleanupAll()` 對其僅呼叫一次 `dropMssqlTempTableIfExists`，不因兩個節點皆持有其引用而重複清理或報錯

---

### TS-MSSQL-P4B-CLEANUP-003：真實 MSSQL — 迷你 pipeline（extract→lookup×2→merge）成功執行後，`tempdb` 內無殘留 `##` 表
- **Related Requirement**：I-MSSQL-TEMPTABLE-CLEANUP-01
- **Test Type**：Positive / Integration（真實 MSSQL）
- **Expected Result**：全部應清理之 `##` 表 `OBJECT_ID` 皆為 `NULL`（含 lookup 原地修改之共用表僅需清理一次的驗證）

---

### TS-MSSQL-P4B-CLEANUP-004：真實 MSSQL — pipeline 於某 lookup 節點之 `ALTER TABLE` 成功但後續節點失敗，已建立/已修改之 `##` 表仍被清理
- **Related Requirement**：AD §1.3 (iii)「成功與失敗兩條路徑」延伸至 lookup 之原地修改情境
- **Test Type**：Negative / Integration（真實 MSSQL）

---

## 四、DISPATCH — 輕量回歸

### TS-MSSQL-P4B-DISPATCH-001：`MergeHandlerMssql.nodeType==='merge'`、`LookupHandlerMssql.nodeType==='lookup'`，與 PG 版逐一比對相等
- **Related Requirement**：`NodeExecutor.nodeType` 介面契約
- **Test Type**：Positive / Unit

---

### TS-MSSQL-P4B-DISPATCH-002：`createDispatcher()` 於 P4b 階段依然不接上 `DB_TYPE` 分支（延續 P4a DISPATCH-001 選項甲決策），本輪測試繼續採直接實例化 handler class 手法
- **Related Requirement**：AD §1.2；P4a `DISPATCH-001` 決策記錄之延續（不重新裁決，僅回歸確認未被中途變更）
- **Test Type**：Regression / Static
- **Expected Result**：`createDispatcher()` 原始碼與 P4a 完成時逐位元組相同（9 個 PG handler 註冊不變）

---

## 五、MERGE — `merge-handler.ts` mssql 版

### MERGE-UNIT

### TS-MSSQL-P4B-MERGE-UNIT-001：`CREATE TEMP TABLE AS SELECT` → `createMssqlTempTable` 包裝（`SELECT INTO ##`）
- **Related Requirement**：AD §3.2 merge-handler 列
- **Test Type**：Positive / Unit

---

### TS-MSSQL-P4B-MERGE-UNIT-002（🔴，查證發現 6）：`getColumns()` 改用 `getMssqlTempTableColumns`（非 `information_schema.columns`）
- **Related Requirement**：I-MSSQL-TEMP-METADATA-01；查證發現 6（AD §3.2 未明說此細節）
- **Test Type**：Positive / Unit
- **Expected Result**：**不得**出現對 `##` 輸入表的 `information_schema.columns` 查詢

---

### TS-MSSQL-P4B-MERGE-UNIT-003：`FULL OUTER JOIN` 結構原樣保留（ANSI 相容，AD 判定「不需改」）
- **Related Requirement**：AD §3.2 merge-handler 列
- **Test Type**：Positive / Unit

---

### TS-MSSQL-P4B-MERGE-UNIT-004：`COUNT(*)::int` → `countMssqlTempTableRows`
- **Related Requirement**：AD §3.1 helper 共用
- **Test Type**：Positive / Unit

---

### TS-MSSQL-P4B-MERGE-UNIT-005：缺 `left-input`/`right-input` 任一 → 拋錯（既有防禦邏輯回歸）
- **Related Requirement**：既有邏輯回歸
- **Test Type**：Negative / Unit

---

### TS-MSSQL-P4B-MERGE-UNIT-006：JOIN key 不存在於非空欄位清單 → 拋錯（mssql 版欄位清單改由 `getMssqlTempTableColumns` 取得後，此驗證邏輯仍正確觸發）
- **Related Requirement**：既有邏輯回歸
- **Test Type**：Negative / Unit

---

### TS-MSSQL-P4B-MERGE-UNIT-007：雙側 `rowCount=0` → `emptyDataSet()` 短路，不呼叫 `createMssqlTempTable`
- **Related Requirement**：既有邊界行為回歸
- **Test Type**：Boundary / Unit

---

### MERGE-EQ（真實 MSSQL，含真實 customer_core 4 個 merge 節點代表情境）

### TS-MSSQL-P4B-MERGE-EQ-001：`sameKeyName=true`（真實 100% 用法）COALESCE 正確（左右皆有值/僅左/僅右 三種列）
- **Related Requirement**：I-MSSQL-ETL-EQ-01；真實資料驗證（4 個 merge 節點皆此路徑）
- **Test Type**：Positive / Integration — **DoD 核心案例**
- **手算 oracle**：id 僅左（`id=1`）→ 輸出 `id=1`；id 僅右（`id=2`）→ 輸出 `id=2`；id 兩側皆有（`id=3`）→ 輸出 `id=3`

---

### TS-MSSQL-P4B-MERGE-EQ-002：`_left`/`_right` 衍生欄位正確附加且值正確
- **Related Requirement**：既有 BUG-1 修正邏輯回歸（`sameKeyName` 路徑之 `_left`/`_right` 附加）
- **Test Type**：Positive / Integration

---

### TS-MSSQL-P4B-MERGE-EQ-003：`FULL OUTER JOIN` 未匹配列，對側欄位為 `NULL`
- **Related Requirement**：I-MSSQL-ETL-EQ-01
- **Test Type**：Positive / Integration

---

### TS-MSSQL-P4B-MERGE-EQ-004：欄位名稱衝突（非 key 之同名欄位）→ `_right`/`_right_2` alias 正確遞增
- **Related Requirement**：既有 `findUniqueAlias` 邏輯回歸
- **Test Type**：Positive / Integration

---

### TS-MSSQL-P4B-MERGE-EQ-005（🔴 旗艦案例，真實 `m2→m3` 鏈式場景，查證發現 5）：鏈式 merge 正確跳過上游 `_left`/`_right` 衍生欄位，不產生重複/衝突欄位
- **Related Requirement**：查證發現 5；既有「Skip upstream _left/_right key columns」防禦邏輯回歸
- **Test Type**：Positive / Integration — **DoD 核心案例**
- **Preconditions**：模擬 `m2`（`CUSTID` 同名 key merge，輸出含 `CUSTID`/`CUSTID_left`/`CUSTID_right`）之輸出作為 `m3` 之左輸入，`m3` 再與另一右表以 `CUSTID` 為 key merge
- **Expected Result**：`m3` 輸出**不含**來自 `m2` 之殘留 `CUSTID_left`/`CUSTID_right`（已被正確跳過），但**含** `m3` 自身這一層新產生的 `CUSTID_left`/`CUSTID_right`（值對應 `m3` 這一層的左右輸入，非 `m2` 的）；欄位集合無重複、無非預期的 `_2` 尾碼衝突別名

---

### TS-MSSQL-P4B-MERGE-EQ-006（防禦性，真實 pipeline 0% 觸發，查證發現 5）：`sameKeyName=false`（不同名 key）路徑正確執行
- **Related Requirement**：既有邏輯完整覆蓋（防禦性，非端對端可自然覆蓋路徑）
- **Test Type**：Positive / Integration

---

### TS-MSSQL-P4B-MERGE-EQ-007：中文欄位值於 `FULL OUTER JOIN` 後正確 round-trip
- **Related Requirement**：I-MSSQL-COLLATE-01 延伸
- **Test Type**：Positive / Integration

---

### TS-MSSQL-P4B-MERGE-EQ-008：一側為空（0 列但欄位結構存在）、另一側有資料 → 正確產出僅該側資料列，對側全 `NULL`（非雙側皆 0 之短路情境）
- **Related Requirement**：既有邊界行為（`emptyDataSet()` 短路僅發生於雙側皆 0）
- **Test Type**：Boundary / Integration

---

## 六、LOOKUP-RESOLVE — legacy mode 之 `resolveRawTableMssql` 共用 + raw 表存在性檢查

> **對應**：P4a `resolve-raw-table-mssql.ts` 已預留供本切片共用（impl log 明文標註）；查證發現 2 確認 legacy mode 為 100% 真實用法；查證發現 7 為本文件新查證出之 AD 未提及站點。

### TS-MSSQL-P4B-RESOLVE-001（靜態/回歸）：`lookup-handler-mssql.ts` 呼叫既有 `resolveRawTableMssql`，未重新實作解析邏輯
- **Related Requirement**：P4a impl log 交接事項；DRY 原則
- **Test Type**：Static / Regression
- **Steps**：檢視 `lookup-handler-mssql.ts` import 語句
- **Expected Result**：`import { resolveRawTableMssql } from './resolve-raw-table-mssql'`（或等價路徑）存在；`resolve-raw-table-mssql.ts` 本身逐位元組未被修改

---

### TS-MSSQL-P4B-RESOLVE-002：真實 MSSQL — legacy mode 透過 `lookupRef` 正確解析出對應 raw 表名（`extraction_tasks`/`datasources` fixture）
- **Related Requirement**：查證發現 2；I-MSSQL-ETL-EQ-01
- **Test Type**：Positive / Integration — **DoD 核心案例**（100% 真實用法路徑）

---

### TS-MSSQL-P4B-RESOLVE-003（🔴，查證發現 7）：raw 對照表存在性檢查改用 `INFORMATION_SCHEMA.TABLES`（大寫）+ 具名參數
- **Related Requirement**：查證發現 7（AD 未提及）；I-MSSQL-CATALOG-CASE-01
- **Test Type**：Positive / Unit
- **Expected Result**：SQL 含 `INFORMATION_SCHEMA.TABLES`（全大寫）、`WHERE table_name = @0`（具名參數）；**不得**出現小寫 `information_schema`；對照表不存在時拋出與 PG 版相同錯誤訊息格式（`對照表 X 不存在`）

---

## 七、LOOKUP-STRATEGY — `skip_row`（INNER JOIN + DELETE）與 `default_value`（防禦性，真實 pipeline 0% 觸發）

> **對應**：查證發現 2。以下案例比照 P4a `FIELDMAP-UNIT-004` 之處理精神——防禦性覆蓋，測試密度明顯低於 `null` 分支（§八），但仍各保留至少一個真實 MSSQL 執行案例證明語法正確可執行（比照 P4a `FIELDMAP-EQ-004`）。

### TS-MSSQL-P4B-SKIP-UNIT-001：`DELETE FROM ##input AS _src WHERE NOT EXISTS (...)` 結構正確（別名可直接於 `DELETE FROM` 宣告，T-SQL 原生支援，AD 判定「不需改」屬實）
- **Related Requirement**：AD §3.2 lookup-handler 列「DELETE...WHERE NOT EXISTS ANSI 相容不需改」
- **Test Type**：Positive / Unit
- **Expected Result**：`::text`→`CAST`/`TRY_CAST` 已轉換；`DELETE FROM`/`WHERE NOT EXISTS` 結構與 PG 版邏輯等價，**不需**如 `UPDATE` 般額外把 target 併入外層 `FROM`（`DELETE FROM table AS alias` 為 T-SQL 原生合法語法，與 `UPDATE` 之限制不同，此為本文件唯一「AD 判定不需改」且經查證屬實之站點）

---

### TS-MSSQL-P4B-SKIP-UNIT-002：`skip_row` 分支之 `UPDATE`（先更新後刪除順序）與 `UPDATEFROM` 群組（§二）之 SQL 結構要求一致（不得因分支不同而有獨立、未受 MUST-FIX 守門之翻譯）
- **Related Requirement**：查證發現 4 適用範圍確認（`skip_row` 與 `null` 共用同一 UPDATE 骨幹）
- **Test Type**：Positive / Unit — 交叉驗證，避免遺漏

---

### TS-MSSQL-P4B-SKIP-MSSQL-001：真實 MSSQL — 部分列匹配，未匹配列被正確刪除，匹配列保留且值正確
- **Related Requirement**：既有 INNER JOIN 語意回歸（防禦性，非 P4d 可自然覆蓋路徑）
- **Test Type**：Positive / Integration

---

### TS-MSSQL-P4B-SKIP-MSSQL-002：真實 MSSQL — 全數列匹配 → 無刪除，列數不變
- **Related Requirement**：既有邊界行為回歸
- **Test Type**：Boundary / Integration

---

### TS-MSSQL-P4B-SKIP-MSSQL-003：真實 MSSQL — 全數列不匹配 → 全數刪除，結果表 0 列，不拋錯
- **Related Requirement**：既有邊界行為回歸
- **Test Type**：Boundary / Integration

---

### TS-MSSQL-P4B-DEFAULT-UNIT-001：`default_value` 分支之 `UPDATE ... SET alias=$1 WHERE alias IS NULL` → 具名參數 `@0`（單純 UPDATE，無需 FROM 重構，因無 JOIN 對象）
- **Related Requirement**：AD §5.2 Pattern B
- **Test Type**：Positive / Unit

---

### TS-MSSQL-P4B-DEFAULT-MSSQL-001：真實 MSSQL — `default_value` 策略對未匹配列正確填入預設值，不拋語法錯誤
- **Related Requirement**：既有邏輯回歸（防禦性，非 P4d 可自然覆蓋路徑，比照 P4a FIELDMAP-EQ-004 精神保留至少一真實案例）
- **Test Type**：Positive / Integration

---

## 八、LOOKUP-BASE — 通用防禦邏輯 + 真實 customer_core 代表情境 EQ

### LOOKUP-UNIT（通用防禦，不分策略）

### TS-MSSQL-P4B-LOOKUP-UNIT-001：缺 `matchColumn`/`lookupMatchColumn`/`outputColumns` 任一 → 拋錯（既有邏輯回歸）
- **Related Requirement**：既有防禦性驗證回歸
- **Test Type**：Negative / Unit

---

### TS-MSSQL-P4B-LOOKUP-UNIT-002：`mainInput.rowCount===0` → `emptyDataSet()` 短路，不執行任何 `ALTER`/`UPDATE`
- **Related Requirement**：既有邊界行為回歸
- **Test Type**：Boundary / Unit

---

### TS-MSSQL-P4B-LOOKUP-UNIT-003（防禦性，查證發現 2，真實 pipeline 0% 觸發）：dual-input mode 正確優先採用 `lookup-input` 之 `tempTable`，不觸發 `resolveRawTableMssql`/raw 表存在性檢查
- **Related Requirement**：既有分流邏輯回歸
- **Test Type**：Positive / Unit

---

### LOOKUP-EQ（真實 MSSQL，`null` 策略，真實 100% 用法路徑，測試密度最高）

### TS-MSSQL-P4B-LOOKUP-EQ-001（真實代表情境，仿 `lk_edu1`）：代碼對照表 lookup + `lookupFilter` + 中文 desc 輸出，完整正確
- **Related Requirement**：I-MSSQL-ETL-EQ-01；真實資料驗證
- **Test Type**：Positive / Integration — **DoD 核心案例**
- **Preconditions**：`matchColumn=EDUCAT_BACK`、`lookupMatchColumn=TBL_CD`、`lookupFilter="TBL_ID"='A2'`、`outputColumns=[{lookupColumn:'TBL_DESC1',outputAlias:'education_desc'}]`（真實 `lk_edu1` 節點設定原樣複製）
- **Expected Result**：匹配列 `education_desc` 正確填入中文對照值；不匹配列為 `NULL`

---

### TS-MSSQL-P4B-LOOKUP-EQ-002（真實代表情境，仿 `lk_hcity`，無 `lookupFilter`）：郵遞區號 lookup（無 filter）正確
- **Related Requirement**：I-MSSQL-ETL-EQ-01；真實資料驗證（6/31 節點無 filter 之代表案例）
- **Test Type**：Positive / Integration

---

### TS-MSSQL-P4B-LOOKUP-EQ-003（🔴 規模驗證）：模擬 5 個 lookup 節點依序對同一 lineage `##` 表各自新增 1 欄（微縮版 31 節點鏈式場景）
- **Related Requirement**：真實資料規模驗證（31 節點鏈式 ALTER + UPDATE）
- **Test Type**：Positive / Integration
- **Expected Result**：最終表含全部 5 個新增欄位，各自值皆正確對應各自的 lookup 設定，互不覆蓋/污染；`##` 表全程僅一份（lookup 原地修改語意，非每節點各建一張新表）

---

### TS-MSSQL-P4B-LOOKUP-EQ-004：`NodeOutputStore` 對 lookup 節點正確記錄「與上游相同 `tempTable`」（in-place 語意，非新建），下游節點可正確消費
- **Related Requirement**：既有 in-place 修改設計回歸
- **Test Type**：Positive / Integration

---

### TS-MSSQL-P4B-LOOKUP-EQ-005：中文 `matchColumn` 值（如地址片段）於比對與輸出階段皆正確 round-trip
- **Related Requirement**：I-MSSQL-COLLATE-01 延伸
- **Test Type**：Positive / Integration

---

## 九、REG — 回歸

### TS-MSSQL-P4B-REG-001：`tsc --noEmit -p tsconfig.build.json` 乾淨（DoD 紅線）
- **Related Requirement**：AD §9 P4b DoD
- **Test Type**：Static Gate

---

### TS-MSSQL-P4B-REG-002：`merge-handler.ts`/`lookup-handler.ts`（PG 原始檔）逐位元組未變
- **Related Requirement**：AD §1.2「postgres 分支完全不動，cutover 前零風險」
- **Test Type**：Static / Regression

---

### TS-MSSQL-P4B-REG-003：既有 PG 版 `engine-node-executors.spec.ts`/`engine-core.spec.ts`（含 merge/lookup 案例）全數不回歸
- **Related Requirement**：既有測試套件回歸
- **Test Type**：Regression

---

### TS-MSSQL-P4B-REG-004：P4a 全部套件（含 `temp-table.util.ts`/`resolve-raw-table-mssql.ts` 之既有簽章）不回歸
- **Related Requirement**：additive 擴充未破壞既有簽章
- **Test Type**：Regression

---

### TS-MSSQL-P4B-REG-005：sqlite 測試路徑不受影響
- **Related Requirement**：三 driver 並存回歸
- **Test Type**：Regression

---

## 十、STATIC — 靜態守門

### TS-MSSQL-P4B-STATIC-001（🔴 呼應 ALTERCOL 群組）：`lookup-handler-mssql.ts` 原始碼零 `ADD COLUMN` 字面命中、零裸 `TEXT` 型別宣告、零 `information_schema.columns`（小寫）命中
- **Related Requirement**：ALTERCOL-UNIT-001/002/003 落地驗收（原始碼層級，非僅測試斷言行為）
- **Test Type**：Static
- **Steps**：`fs.readFileSync` + regex 掃描

---

### TS-MSSQL-P4B-STATIC-002：`merge-handler-mssql.ts`/`lookup-handler-mssql.ts` 皆存在於 `apps/api/src/modules/etl/engine/handlers/` 目錄（命名鎖定）
- **Related Requirement**：AD §1.2 命名慣例
- **Test Type**：Static

---

### TS-MSSQL-P4B-STATIC-003：`resolve-raw-table-mssql.ts`/`temp-table.util.ts`（P4a 產出）未被本輪覆寫（逐位元組相同）
- **Related Requirement**：additive-only 紀律（P4a impl log 明文要求）
- **Test Type**：Static

---

### TS-MSSQL-P4B-STATIC-004：`lookup-handler-mssql.ts` 原始碼零 `UPDATE _src SET ... FROM (` 未接 `##` target 之字面模式（UPDATEFROM-UNIT-001 落地驗收）
- **Related Requirement**：UPDATEFROM-UNIT-001 落地驗收
- **Test Type**：Static — 半自動守門（regex 可初篩，仍建議人工核對 FROM 子句是否確實含 target）

---

## 風險與發現彙整（詳細已同步至 `risks-and-gaps.md`）

1. **🔴🔴 `ALTER TABLE ADD COLUMN IF NOT EXISTS`（查證發現 1）為本切片最高風險站點**——AD 與任務書皆完全未提及，真實 pipeline 31 個 lookup 節點每次月名單分派皆觸發，若未修正為 T-SQL 合法語法（無 `COLUMN`、無 `IF NOT EXISTS`、型別改 `NVARCHAR(MAX)`）則 100% 語法錯誤，優先權高於任務書已點名之 UPDATE...FROM 重構。已獨立立 §一 ALTERCOL 群組（9 案例）處理。
2. **🔴 UPDATE...FROM 之精確翻譯陷阱（查證發現 4）**：PG `UPDATE tbl alias SET ...` 之「就地宣告別名」語法為 PG 特有，逐字翻譯（僅替換 `::text`）會因別名未經 `FROM` 宣告而拋錯。已設計 UPDATEFROM-UNIT-001（MUST-FIX）+ TRAP-001（陷阱佐證）+ 6 個 EQ 案例（含防笛卡兒積旗艦案例 EQ-001）。
3. 真實 customer_core 之 31 個 lookup 節點 100% 為 legacy mode + `noMatchStrategy='null'`；dual-input/`skip_row`/`default_value` 三者 0% 真實觸發，測試密度已相應調整為防禦性 UNIT + 輕量 MSSQL 確認。
4. 25/31（81%）lookup 節點使用 `lookupFilter`，AD 未提及，已納入 UPDATEFROM-EQ-003。
5. 真實 4 個 merge 節點 100% 為 `sameKeyName=true`，且 `m2→m3` 為鏈式合併，已設計 MERGE-EQ-005 旗艦案例驗證上游 `_left`/`_right` 衍生欄位正確跳過。
6. `merge-handler.ts` 之 `getColumns()`／`lookup-handler.ts` 之 raw 表存在性檢查，兩處皆為 AD §3.2 表格文字未明說但確實存在之 catalog 查詢站點，已分別於 MERGE-UNIT-002／RESOLVE-003 納入。
7. `dbo` schema 佔用範圍第三度擴大（P1b2/P1b3 → P4-0/P4a → 本輪 P4b lookup legacy-mode），若 CI 尚無序列化 lane，風險持續疊加，非本輪可解決但記錄提醒。
