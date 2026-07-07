---
type: test-design-infrastructure
test-spec-id: AD-E07-41-P4e
feature_name: MSSQL 全面遷移 P4e — raw Staging Bulk-Load 寫入端（pg-copy-streams → tedious bulk，P4 最後一片）
priority: P0-MVP
related_spec:
  - /docs/specs/implementation-log/AD-E07-41-mssql-p4-etl-engine.md（§6「Bulk-Load：5 個來源表 raw Staging 寫入端」、§9 P4e DoD、§11.2「Bulk-load 吞吐量未知，需 POC 量測」）
  - /docs/specs/implementation-log/AD-E07-41-P4a-impl.md（QUOTE-003 雙引號識別碼於 BIN collation+tedious 下可行之既有決定，供 raw-data.service.ts 現行 `"${col}"` 拼接手法沿用不重議）
  - /docs/specs/implementation-log/AD-E07-41-P4d-impl.md（FINDING-P4D-01 DECIMAL 固定精度溢位缺陷之根因記錄，本文件 §一 TYPEMAP-003 引用為同型缺陷家族之前車之鑑）
  - apps/api/src/modules/extraction-task/raw-data.service.ts（`openCopyWriter`/`formatCopyValue`/`supportsCopy`/`createRawTable`/`tableExists`/`getTableColumns`/`insertBatch`/`mapToPostgresType`/`mapToSqliteType`，本文件全部查證之唯一原始碼來源）
  - apps/api/src/modules/extraction-task/extraction-execution.service.ts（`executeExtraction`/`streamExtractWithCopy`/`canStream` 判定式，AD §6 未提及之消費端接線點）
  - apps/api/src/modules/extraction-task/executors/mssql-executor.ts（`streamBatches`/`supportsStreaming`，來源端讀取，已相容不需改，本文件不重測）
  - apps/api/src/modules/extraction-task/extraction-executor.provider.ts（`IExtractionExecutor` 之 `streamBatches?`/`supportsStreaming?` 可選介面定義）
  - apps/api/src/modules/extraction-task/__tests__/raw-data.service.spec.ts（既有 `formatCopyValue`/`supportsCopy`/`openCopyWriter` 三個 describe 區塊，本文件 §十 REG 之回歸基準）
  - /docs/test-specs/infrastructure/AD-E07-41-P4d-test.md（Harness 分層慣例、決策關卡/陷阱佐證/MUST-FIX 標記慣例沿用）
covers: []
spec_version: "1.0"
date: 2026-07-08
last_updated: 2026-07-08
---

# AD-E07-41 P4e：MSSQL 全面遷移 — raw Staging Bulk-Load 寫入端（P4 最後一片）— 測試設計

> 本文件覆蓋 AD-E07-41「MSSQL 全面遷移 P4（ETL 引擎 MSSQL 化）」之 **P4e 切片（P4 最後一片）**（AD §6「Bulk-Load：5 個來源表 raw Staging 寫入端」+ §9 P4e DoD）。P4 不經 spec-writer（AD-E07-41「是否需要 spec-writer」章節已裁定，比照 P4a/b/c/d 先例，本輪不重複論證——bulk-load 純屬底層執行機制置換，不涉及業務規則）。
>
> **範圍界定**：P4e 測的是「來源資料寫入 App DB `raw_*` staging 表」這件事本身能否在 MSSQL 上運作（取代 PG `COPY FROM STDIN`），**不是** ETL customer_core pipeline 本身（P4a/b/c/d 已覆蓋，本文件不重測任一 ETL handler 內部 SQL）。**明確排除**：ETL 引擎 9 個 handler 內部邏輯（P4a/b/c）；customer_core 56 節點端對端（P4d，該文件已註明「P4e bulk-load 明確排除另待」）；來源端讀取（`mssql-executor.ts` 已相容，本文件不重測）。
>
> **★ test-designer 逐檔查證 AD 未提及或需補充決策之關鍵事實（本文件測試設計之核心依據）**：
>
> 1. **🔴🔴（本文件最高風險發現）`RawDataService` 現行 `isPostgres: boolean` 為二元 gate，`DB_TYPE=mssql` 時會與 SQLite 分支混淆，且此缺口直接阻擋 P4e 自身 DoD**：建構子以 `driverType === 'postgres'` 判定 `isPostgres`，全部非 COPY 相關方法（`createRawTable`/`tableExists`/`getTableColumns`/`getColumnMetadata`/`getIndexedColumns`/`insertBatch` 非 full-mode 路徑/`getRawData` 之 LIMIT-OFFSET 查詢）皆以 `this.isPostgres ? PG分支 : SQLite分支` 二選一。`DB_TYPE=mssql` 時 `isPostgres` 恆為 `false`，會誤入 SQLite 分支——`createRawTable` 產生 `_cdmp_id INTEGER PRIMARY KEY AUTOINCREMENT`（T-SQL 無此語法）、`tableExists` 查詢 `sqlite_master`（MSSQL 無此系統表）、`getTableColumns` 呼叫 `PRAGMA table_info`（MSSQL 無此語法）。其中 `createRawTable`/`tableExists`/`getTableColumns` 三者是 `executeExtraction()` 步驟 2/3（建表/schema-drift 比對/清空）之**直接前置依賴**——bulk-load 寫入前，raw 表必須先被正確建立/偵測，此缺口不修，P4e 自身 DoD（bulk-load 完整匯入 raw 表）**連第一步都無法執行**。已納入 §二 ISPG-GATE 為本文件次高優先群組。`getColumnMetadata`/`getIndexedColumns`/`getRawData` 資料查詢（`LIMIT ? OFFSET ?`）非 bulk-load 寫入路徑之直接依賴（僅供 raw data 瀏覽 API 使用），本文件不納入範圍但記入 `risks-and-gaps.md` 提醒後續切片處理。
> 2. **AD §6 僅描述 `raw-data.service.ts` 新增 `openMssqlBulkWriter`/`supportsBulk`，完全未提及消費端 `extraction-execution.service.ts` 之 `canStream` 判定式需要同步擴充**：現行 `canStream = ... && this.rawDataService.supportsCopy() && ...`，若新增 `supportsBulk()` 但不修改此判定式，`supportsBulk()` 永遠不會被詢問，bulk-load 機制會成為「建置完成但從未被觸發」的死碼——同型於本專案既有多次記錄之「AD 檔案改動清單只列了『我碰了哪裡』，不會自動反向追蹤『新依賴的消費端還在哪裡』」模式（見 AD-E07-40 P2b 先例）。已納入 §三 DISPATCH 為 MUST-FIX 守門。
> 3. **`formatCopyValue()` 之文字跳脫邏輯（`\t`/`\n`/`\r`/`\\`→反斜線轉義字面字串）專屬 PG COPY TEXT 協定語意，bulk API 為型別化協定，兩者語意互斥且不可混用**：若 `openMssqlBulkWriter` 誤重用 `formatCopyValue`（例如複製貼上既有程式碼時未注意），含真實 tab/newline 字元的來源值會被寫入為「反斜線+字母 t/n」兩個字面字元而非還原成真實控制字元，是一個外觀上「看起來像跳脫」但實際上是資料損毀的陷阱。已納入 §五 NOESCAPE-CHARSET MUST-FIX + §十一 STATIC-003 雙重防線。
> 4. **來源型別→raw 表型別→tedious bulk Table 型別宣告，三方需完全一致，但 `ColumnMetadata` 介面完全不含 length/precision/scale 資訊**——`{ name, dataType, isPrimary }` 僅有型別名稱字串，無法得知來源欄實際寬度。MSSQL 的 `NVARCHAR`/`VARBINARY` 需要顯式長度或 `(MAX)`，且 `DECIMAL` 需要顯式 precision/scale（不像 PG `NUMERIC` 可無界宣告）——若 `mapToMssqlType` 對 `decimal`/`numeric`/`money` 沿用 P4a-fix 之 `DECIMAL(38,10)` 定值（`I-MSSQL-DECIMAL-NORMALIZE-01` 已修正 type_cast 節點之同型問題），會在 raw staging DDL 建表層級**重演 FINDING-P4D-01 相同的精度溢位缺陷家族**，只是發生位置從 ETL type_cast 節點換成 raw 表建表本身。已納入 §一 TYPEMAP-003 為 MUST-FIX 決策關卡。
> 5. **本專案既有全部 `.mssql.spec.ts`（P0~P4d）皆透過 `queryRunner.query()` 操作，從未有測試碰過 TypeORM mssql QueryRunner 底層 `databaseConnection` 物件本身**——`openCopyWriter` 既有 PG 實作透過 `(queryRunner as any).databaseConnection` 取得原生 node-postgres client 以呼叫 `pg-copy-streams`；`openMssqlBulkWriter` 若要比照此手法取得底層 tedious `ConnectionPool`/`Request` 以呼叫 `mssql` 套件之 `Table`/`request.bulk()` API，這是本專案 MSSQL 遷移系列**首次**需要驗證 TypeORM mssql driver 是否同樣透過 `databaseConnection` 曝露可用的底層物件——不可假設與 PG 版本對稱，已納入 §四 BULKWRITE-GATE-001 為探測型決策關卡。
> 6. **tedious `Request.bulk(table)` 是否可對同一物理表跨多次呼叫（分批注入），或要求整個資料集一次性塞進單一 `Table` 物件才能呼叫一次**——這直接決定 bulk-load 是否能做到「記憶體有界」（本專案 CLAUDE.md 明文 ETL 紅線：不可用 in-memory 策略處理可能超出 RAM 的資料集）。AD §6 原文未討論此點，不可假設，已納入 §六 BATCH-GATE-001 為探測型決策關卡，且本文件不預設答案。
> 7. **`ColumnMetadata` 缺乏真實來源（`ZZIP_BAMCUST_M`/`MLMCUSTOMER`）之確切欄位型別清單**：本專案 repo 內（`etl-pipelines.json`/`extraction-tasks.json`）僅記錄這 5 張表之 `sourceTable` 名稱與部分欄位對照，並無逐欄 `DATA_TYPE` 之靜態清單（該資訊需即時查詢真實外部 MSSQL 來源之 `INFORMATION_SCHEMA.COLUMNS` 才能取得，test-designer 無法在文件撰寫階段靜態取得）。本文件 §一 TYPEMAP 之型別矩陣採**代表性合成矩陣**（比照 `mapToPostgresType` 既有涵蓋之型別家族設計），非逐一核對這 5 張真實表之實際欄位。已記入 `risks-and-gaps.md`，建議 tdd-implementation 執行前若可連線真實來源，優先查詢實際 `DATA_TYPE` 分布以校準測試優先權（比照 P4d 對 `etl-pipelines.json` 之查證精神）。

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件全部 + `AD-E07-41-mssql-p4-etl-engine.md`（§6、§9 P4e）+ `raw-data.service.ts`/`extraction-execution.service.ts`/`extraction-executor.provider.ts`（本文件全部查證之原始碼）+ `mssql-env-preload.ts`/`_p4a-mssql-harness.ts`（既有 harness 沿用起點）+ `raw-data.service.spec.ts`（既有 PG round-trip 測試，§十 REG 回歸基準） |
| QA / Tester | 本文件 + `risks-and-gaps.md`（MSSQL P4e 風險段落） |
| DevOps / CI/CD | 本文件「零、測試環境與 Harness 設計」§0.1（CDMP_TEST 沿用慣例，無需新增基礎設施） |

---

## 零、測試環境與 Harness 設計

### 0.1 沿用既有 Harness，不新增基礎設施

沿用 `mssql-env-preload.ts`（`MSSQL` 連線常數、`mssqlPortReachable`、`restoreDbType`）+ `_p4a-mssql-harness.ts`（`connectMssql`/`teardownMssql`/`objectExists`/`uniqueLogId`）。**不需新增** test-only MSSQL 服務——CDMP_TEST 資料庫（同一 `mssql` 容器內以資料庫名隔離，非獨立 port）已於 P0~P4d 沿用至今，本輪比照辦理。

PG 側沿用 `raw-data.service.spec.ts` 既有慣例（**非** `postgres-test:5433`，而是 dev PostgreSQL `5432`/`cdmp_dev`，以專屬 throwaway 表名 `raw_deadbeef` 建/清，不污染既有資料）——此為既有檔案已建立之慣例，本文件 §十 REG 僅需確認此既有套件不受影響，不新增 PG 側測試。

`vi.setConfig({ testTimeout: 30000 })`（bulk-load 涉及較大量資料寫入，比照 P4a/b/c 之 60000 略保守，因 P4e 資料量級遠小於 P4d 56 節點端對端）。

### 0.2 單元層（免真實連線）vs 整合層（真實 MSSQL）分層

比照 P1c `ESCAPE` 分層精神：純函式（`mapToMssqlType`、DDL 字串產生、bulk row 值轉換不含跳脫邏輯）可用 `makeService('mssql')`（比照既有 `raw-data.service.spec.ts` 之 `makeService(type)` fake DataSource 手法）免真實連線驗證；實際 DDL 執行/bulk 寫入/讀回驗證則需真實 MSSQL（CDMP_TEST），比照既有 `mssqlPortReachable()` gating，不可達時 `describe.skip` + `SKIP_REASON`。

### 0.3 Fixture 設計原則

- **§一 TYPEMAP** 矩陣採代表性合成型別清單（見查證發現 7），非逐一核對 `ZZIP_BAMCUST_M`/`MLMCUSTOMER` 真實欄位；建議涵蓋家族：整數（int/bigint/smallint/tinyint/bit）、小數（decimal/numeric/money/float/real）、字串（varchar/nvarchar/char/nchar/text/ntext）、日期時間（date/datetime/datetime2/time/smalldatetime）、二進位（binary/varbinary/image）、識別碼（uniqueidentifier）。
- **§四/五/六/七 之寫入驗證** 使用合成客戶列資料（非依賴真實外部 MSSQL 來源連線），欄位設計涵蓋：一般字串、中文（含罕用字，對齊 I-MSSQL-COLLATE-01）、NULL、空字串、數值（含負數/小數）、日期時間、含 tab/newline/反斜線之字串（§五 NOESCAPE 陷阱佐證核心）。
- **§七 E2E-EXTRACT** 之「來源」以 CDMP_TEST 自身建立一張合成表模擬（透過真實 `MSSQLExecutor` 對 CDMP_TEST 自連線讀取），非連線至真實 ZZIP/MLMC 外部資料庫——比照 P4d §0.2 精神「source 端非本輪待測物件，可簡化」，本輪待測物件是 `RawDataService` 新增之 bulk 寫入端與 `ExtractionExecutionService` 之接線，不是 `MSSQLExecutor`（已於背景說明中確認相容不需改）。

### 0.4 與 P4a extract-handler-mssql 之銜接（§八 PIPELINE-READ）

複用 P4a `_p4a-mssql-harness.ts` 之 `makeRealCtx`/`ExtractHandlerMssql` 建構手法，僅新增「讀取對象是 §七 bulk-load 產出的真實 raw 表」這一變因，不重新設計 handler 測試本身。

---

## 一、TYPEMAP — 三層型別對應矩陣（🔴🔴 MUST-FIX，req #3 核心）

> 三層鏈：來源欄型別（`ColumnMetadata.dataType`）→ raw staging 表欄型別（`mapToMssqlType` 新方法，供 `createRawTable` DDL 使用）→ tedious bulk `Table` 欄型別宣告（`mssql` 套件 `sql.TYPES`）。三者必須逐一對應一致，否則 `request.bulk()` 於型別不符時可能拋 schema mismatch 或靜默截斷/轉型。

### TS-MSSQL-P4E-TYPEMAP-GATE-001（🔴🔴 決策關卡）：`mapToMssqlType` 新方法之型別矩陣衍生方式
- **Related Requirement**：查證發現 7；比照既有 `mapToPostgresType`/`mapToSqliteType` 之 `lower.includes(...)` 結構
- **Test Type**：Decision Gate（文件化守門）
- **Expected Result**：impl log 記錄完整型別矩陣（見 §0.3 家族清單），比照既有兩個 mapper 之結構風格（不引入第三種程式風格）；若可連線真實 ZZIP/MLMC 來源，優先核對其實際 `DATA_TYPE` 分布是否被矩陣涵蓋

---

### TS-MSSQL-P4E-TYPEMAP-001（Positive）：整數/布林家族恆等映射
- **Related Requirement**：矩陣設計
- **Test Type**：Positive / Unit（免真實連線）
- **Expected Result**：`int`→`INT`、`bigint`→`BIGINT`、`smallint`→`SMALLINT`、`tinyint`→`TINYINT`、`bit`/`bool`/`boolean`→`BIT`（來源本身多為 MSSQL 家族，此類別風險最低，恆等/近恆等映射）

---

### TS-MSSQL-P4E-TYPEMAP-002（Positive）：`serial`（PG 專屬，理論上不會出現於 MSSQL 來源但防禦性覆蓋）映射
- **Related Requirement**：比照 `mapToPostgresType`/`mapToSqliteType` 皆有此防禦分支，保持三個 mapper 對稱
- **Test Type**：Positive / Unit

---

### TS-MSSQL-P4E-TYPEMAP-003（🔴🔴 MUST-FIX 決策關卡，呼應查證發現 4/FINDING-P4D-01 同型缺陷家族）：`decimal`/`numeric`/`money` 家族不得映射為固定精度 `DECIMAL(p,s)`
- **Related Requirement**：查證發現 4；`I-MSSQL-DECIMAL-NORMALIZE-01`（P4a-fix，同型缺陷之既有修法先例，發生於 type_cast 節點而非本處）
- **Test Type**：Decision Gate（文件化守門，MUST-FIX）
- **Expected Result**：impl log 須明確記錄採用方案，**建議**映射為 `NVARCHAR(MAX)`（保留來源原始字面精度，不做任何精度假設——PG `mapToPostgresType` 對此家族使用無界 `NUMERIC`，MSSQL 無無界小數型別，文字型別是唯一不損失精度的等價替代）；若 tdd-implementation 選擇固定 `DECIMAL(p,s)`，須額外設計精度溢位邊界測試佐證不會重演 FINDING-P4D-01，並於 impl log 說明選擇理由

---

### TS-MSSQL-P4E-TYPEMAP-004（Positive）：字串家族統一映射為 `NVARCHAR(MAX)`
- **Related Requirement**：查證發現 4（無 length 資訊）；`I-MSSQL-COLLATE-01`（N-prefix 確保中文/Unicode 儲存正確）
- **Test Type**：Positive / Unit
- **Expected Result**：`varchar`/`nvarchar`/`char`/`nchar`/`text`/`ntext`/`xml`→`NVARCHAR(MAX)`（非固定長度，避免真實來源欄位長度超出被截斷；**必須** N-prefix，非裸 `VARCHAR`，否則於 BIN collation 下非 Unicode-aware collation 可能遺失中文字元，比照 `I-MSSQL-COLLATE-01` 既有裁定延伸）

---

### TS-MSSQL-P4E-TYPEMAP-005（Positive）：日期時間家族映射
- **Related Requirement**：矩陣設計
- **Test Type**：Positive / Unit
- **Expected Result**：`date`/`datetime`/`datetime2`/`smalldatetime`/`timestamp`→`DATETIME2`（比照既有 MSSQL entity 型別轉換慣例統一用 `datetime2`，不用已淘汰精度較低的 `datetime`）；`time`→`TIME`

---

### TS-MSSQL-P4E-TYPEMAP-006（Positive）：二進位家族映射
- **Related Requirement**：矩陣設計
- **Test Type**：Positive / Unit
- **Expected Result**：`binary`/`varbinary`/`image`/`bytea`/`blob`→`VARBINARY(MAX)`

---

### TS-MSSQL-P4E-TYPEMAP-007（Positive）：識別碼家族映射
- **Related Requirement**：矩陣設計
- **Test Type**：Positive / Unit
- **Expected Result**：`uniqueidentifier`/`uuid`→`UNIQUEIDENTIFIER`

---

### TS-MSSQL-P4E-TYPEMAP-008（Boundary）：未知/不辨識之 `dataType` 字面值 fallback
- **Related Requirement**：比照 `mapToPostgresType` 現行 fallback `TEXT`（非拋錯）之既有設計哲學
- **Test Type**：Boundary / Unit
- **Expected Result**：未匹配任何已知分支的 `dataType` 字串 fallback 至 `NVARCHAR(MAX)`（非拋錯，維持既有兩個 mapper 之寬容設計一致性）

---

### TS-MSSQL-P4E-TYPEMAP-009（🔴 MUST-FIX，陷阱佐證）：無來源 PK 情境下 `_cdmp_id` 自動遞增欄位語法（現行對 mssql 誤入 SQLite 分支之陷阱佐證，見 §二 ISPG-GATE 交叉引用）
- **Related Requirement**：查證發現 1
- **Test Type**：Negative / Unit — 陷阱佐證（不需真實連線，純字串斷言現行程式碼行為）
- **Expected Result**：對現行未修改 `createRawTable`（以 mssql fake DataSource），斷言其產生的 DDL 字串含 `AUTOINCREMENT`（SQLite 語法字面），非 T-SQL 可執行語法——證明缺口存在

---

### TS-MSSQL-P4E-TYPEMAP-010（Positive，MUST-FIX 目標行為）：`_cdmp_id` 於 mssql 分支正確語法
- **Related Requirement**：查證發現 1
- **Test Type**：Positive / Integration（真實 MSSQL）
- **Expected Result**：mssql 分支產生 `_cdmp_id INT IDENTITY(1,1) PRIMARY KEY`（非 SQLite `AUTOINCREMENT`、非 PG `SERIAL`），對真實 CDMP_TEST 可執行不拋錯

---

### TS-MSSQL-P4E-TYPEMAP-011（Positive，MUST-FIX 目標行為）：`_cdmp_extracted_at` 於 mssql 分支正確語法
- **Related Requirement**：PG 專屬語法糖速查清單延伸（`NOW()` 已知不可用於 T-SQL）
- **Test Type**：Positive / Integration
- **Expected Result**：mssql 分支產生 `_cdmp_extracted_at DATETIME2 DEFAULT SYSUTCDATETIME()`（非 PG `NOW()`，非 SQLite `datetime('now')`）

---

### TS-MSSQL-P4E-TYPEMAP-GATE-012（🔴🔴 決策關卡）：tedious bulk `Table` 欄位型別宣告與 raw 表 DDL 型別逐一對應表
- **Related Requirement**：查證發現 4
- **Test Type**：Decision Gate（文件化守門）
- **Expected Result**：impl log 記錄 `sql.NVarChar(sql.MAX)`/`sql.Int`/`sql.BigInt`/`sql.SmallInt`/`sql.TinyInt`/`sql.Bit`/`sql.DateTime2`/`sql.Time`/`sql.VarBinary(sql.MAX)`/`sql.UniqueIdentifier` 與 §一上述 DDL 型別之一一對應表；兩者不一致時之實測結果（見下方 PROBE-013）須一併記錄

---

### TS-MSSQL-P4E-TYPEMAP-PROBE-013（🔴 Probe，不可假設，待 tdd-impl 真庫驗證）：bulk `Table` 欄位型別宣告與目標表實際型別輕微不一致時之寬容度
- **Related Requirement**：查證發現 4/5
- **Test Type**：Probe / Integration — **不預設答案**
- **Steps**：對已存在之 `NVARCHAR(MAX)` 目標欄，刻意以較窄的 `sql.NVarChar(100)`（非 `sql.MAX`）宣告 bulk Table 對應欄後呼叫 `request.bulk()`，寫入超過 100 字元之字串值
- **Expected Result（兩種皆為合法記錄，非預設答案）**：(a) `request.bulk()` 拋型別/長度不符錯誤，或 (b) 靜默截斷/接受——**兩者皆須明確記入 impl log**，並據此決定 `openMssqlBulkWriter` 是否需要對輸入值做額外防禦性檢查

---

## 二、ISPG-GATE — `isPostgres` 二元 Gate MUST-FIX 守門（🔴🔴 P4e DoD 直接前置依賴，查證發現 1）

> 本群組只涵蓋 `executeExtraction()` 寫入流程之**直接前置依賴**三方法（`createRawTable`/`tableExists`/`getTableColumns`）。其餘同檔案同缺陷之 `getColumnMetadata`/`getIndexedColumns`/`getRawData` 資料查詢不在本輪範圍，已記入 `risks-and-gaps.md`。

### TS-MSSQL-P4E-ISPG-GATE-001（🔴🔴 決策關卡）：`isPostgres: boolean` 改為三態 `dbType` 欄位之改法記錄
- **Related Requirement**：查證發現 1
- **Test Type**：Decision Gate（文件化守門）
- **Expected Result**：impl log 記錄改法（建議：內部改為 `dbType: 'postgres' | 'mssql' | 'sqlite'`，取代 boolean，本群組涉及之三方法逐一改為三分支 if/else if/else，而非在既有 `if (isPostgres)` 之 else 分支內再插入一層 `if (isMssql)` 巢狀判斷——後者會讓 mssql 分支埋藏在 SQLite 分支內部，可讀性差且容易遺漏）

---

### TS-MSSQL-P4E-ISPG-TABLEEXISTS-001（🔴🔴 MUST-FIX，陷阱佐證）：現行未修改 `tableExists()` 對 mssql 之陷阱
- **Related Requirement**：查證發現 1
- **Test Type**：Negative / Integration — 陷阱佐證（真實 MSSQL，對現行未修改程式碼刻意設計為紅燈）
- **Preconditions**：`RawDataService` 以真實 mssql `DataSource` 建構（現行未修改版本）
- **Expected Result**：呼叫 `tableExists()` 對真實 CDMP_TEST 拋錯（查詢 `sqlite_master` 對 MSSQL 為 `Invalid object name 'sqlite_master'`），證明缺口存在而非過度防禦

---

### TS-MSSQL-P4E-TABLEEXISTS-002（Positive，DoD 核心）：`tableExists()` mssql 分支正確判定
- **Related Requirement**：查證發現 1
- **Test Type**：Positive / Integration — **DoD 核心案例**
- **Expected Result**：mssql 分支使用 `sys.tables`/`INFORMATION_SCHEMA.TABLES`（比照既有 P1a `OBJECT_ID`/`sys.columns` 型別探測手法之既有慣例）正確回傳存在/不存在兩種情境之布林值

---

### TS-MSSQL-P4E-ISPG-CREATETABLE-001（🔴🔴 MUST-FIX，陷阱佐證）：現行未修改 `createRawTable()` 對 mssql 之陷阱
- **Related Requirement**：查證發現 1；交叉引用 §一 TYPEMAP-009
- **Test Type**：Negative / Integration — 陷阱佐證
- **Preconditions**：無 PK 來源欄位情境
- **Expected Result**：對真實 CDMP_TEST 執行現行未修改 `createRawTable()` 拋 T-SQL 語法錯誤（`AUTOINCREMENT` 非保留字語法）

---

### TS-MSSQL-P4E-CREATETABLE-002（🔴🔴 MUST-FIX，DoD 核心）：`createRawTable()` mssql 分支正確產生可執行 DDL
- **Related Requirement**：查證發現 1；§一 TYPEMAP 全部映射結論
- **Test Type**：Positive / Integration — **DoD 核心案例**
- **Expected Result**：`OBJECT_ID('dbo.<rawTableName>')` 非 `NULL`；欄位型別/`_cdmp_id`/`_cdmp_extracted_at` 皆依 §一 TYPEMAP 結論正確產生

---

### TS-MSSQL-P4E-CREATETABLE-003（Positive）：有來源 PK（單一/複合）情境
- **Related Requirement**：既有 PRIMARY KEY 語法（單欄 inline / 複合 table-level constraint）於 T-SQL 原生相容，回歸確認
- **Test Type**：Positive / Integration

---

### TS-MSSQL-P4E-GETTABLECOLUMNS-001（🔴 MUST-FIX，schema-drift 前置依賴）：`getTableColumns()` mssql 分支
- **Related Requirement**：查證發現 1；`executeExtraction()` step 2 schema-drift 比對之直接依賴（`PRAGMA table_info` 對 MSSQL 拋錯，會使既有 raw 表任何一次重跑失敗）
- **Test Type**：Positive / Integration — **DoD 核心案例**
- **Expected Result**：mssql 分支改用 `INFORMATION_SCHEMA.COLUMNS`（依 `ordinal_position` 排序），回傳欄位名稱清單與 PG 分支語意對稱

---

### TS-MSSQL-P4E-DROPTABLE-001（Regression，非缺口）：`dropTable()`/`truncateTable()` 免修改回歸確認
- **Related Requirement**：`DROP TABLE IF EXISTS`（MSSQL 2016+ 原生支援）/`TRUNCATE TABLE` 皆為 T-SQL 相容語法，查證後確認免改動——與 §一 TYPEMAP-009/010 之陷阱形成對比，避免 tdd-implementation 誤判此二方法也需要改寫而重複勞動
- **Test Type**：Positive / Integration（真實 MSSQL）

---

### TS-MSSQL-P4E-ISPG-SANITIZE-001（Regression）：`sanitizeColumnName`/`validateTableName` 不受 dbType 影響
- **Related Requirement**：driver-agnostic 純函式，回歸確認不因 §二 改法而受影響
- **Test Type**：Positive / Unit（免真實連線）

---

## 三、DISPATCH — `supportsBulk`/`openBulkWriter` 介面 + Orchestrator 接線（🔴🔴 MUST-FIX，查證發現 2）

### TS-MSSQL-P4E-DISPATCH-GATE-001（🔴🔴 決策關卡）：接線設計記錄
- **Related Requirement**：查證發現 2；AD §6「`supportsCopy()`/`openCopyWriter()` capability-detection 模式沿用既有架構」
- **Test Type**：Decision Gate（文件化守門）
- **Expected Result**：impl log 記錄實際接線設計（**建議**：`supportsBulk(): boolean` + `openBulkWriter()` 直接複用既有 `CopyWriter` 介面（`writeRows`/`finish`/`abort` 簽章不變，最小化 orchestrator 改動）；`extraction-execution.service.ts` 之 `canStream` 判定式改為 `(this.rawDataService.supportsCopy() || this.rawDataService.supportsBulk())`，並依實際能力分派呼叫 `openCopyWriter` 或 `openBulkWriter`）

---

### TS-MSSQL-P4E-DISPATCH-001（🔴🔴 MUST-FIX，陷阱佐證）：現行未修改 `extraction-execution.service.ts` 對 mssql 目標之死碼陷阱
- **Related Requirement**：查證發現 2
- **Test Type**：Negative / Unit — 陷阱佐證（mock-based，比照既有 `extraction-execution.service.spec.ts` 風格）
- **Preconditions**：`rawDataService.supportsCopy()` 回傳 `false`（mssql，且尚未新增 `supportsBulk`）；`mode='full'`；executor 支援 streaming
- **Expected Result**：對現行未修改程式碼，`canStream` 恆為 `false`——斷言實際呼叫路徑落回 `insertBatch` 慢迴圈（非拋錯，是「新機制完全未被觸發」之靜默死碼陷阱），證明缺口存在

---

### TS-MSSQL-P4E-DISPATCH-002（Positive，DoD 核心）：`supportsBulk()` 三態正確回傳
- **Related Requirement**：查證發現 2
- **Test Type**：Positive / Unit — **DoD 核心案例**
- **Expected Result**：`supportsBulk()` 對 mssql 回傳 `true`，對 postgres/sqlite 回傳 `false`（與 `supportsCopy()` 恰好互斥對稱）

---

### TS-MSSQL-P4E-DISPATCH-003（🔴🔴 MUST-FIX，DoD 核心）：mssql + full mode + streaming 來源情境下正確分派至 `openBulkWriter`
- **Related Requirement**：查證發現 2
- **Test Type**：Positive / Unit — **DoD 核心案例**，spy 驗證呼叫參數（非僅驗證最終列數）
- **Expected Result**：`canStream` 判定為 `true`；以 `vi.spyOn` 監控，確認實際呼叫的是 `openBulkWriter`（非 `openCopyWriter`）——比照本專案既有「二元 gate 陷阱」測試慣例，斷言呼叫了哪個依賴而非只驗證回傳值

---

### TS-MSSQL-P4E-DISPATCH-004（Regression）：postgres 既有 `canStream`/`openCopyWriter` 路徑不受影響
- **Related Requirement**：driver 互斥回歸
- **Test Type**：Regression / Unit

---

### TS-MSSQL-P4E-DISPATCH-005（Boundary，範圍界定）：incremental mode 情境下 mssql 目標之 `canStream` 恆為 false
- **Related Requirement**：範圍界定——P4e 明確只擴充 full-mode 快速路徑；incremental 模式沿用既有 `insertBatch` 迴圈，其 mssql 相容性（`?` 佔位符/T-SQL 參數上限 2100）不在本輪範圍，已記入 `risks-and-gaps.md`
- **Test Type**：Boundary / Unit

---

## 四、BULK-WRITE — `openMssqlBulkWriter` 核心正確性（🔴🔴 DoD 核心，req #2）

### TS-MSSQL-P4E-BULKWRITE-GATE-001（🔴🔴 Probe 決策關卡，不可假設，待 tdd-impl 真庫驗證）：TypeORM mssql `databaseConnection` 底層物件取用手法
- **Related Requirement**：查證發現 5
- **Test Type**：Probe / Integration — **不預設答案**
- **Steps**：比照 `openCopyWriter` 既有手法 `(queryRunner as any).databaseConnection`，對真實 mssql `QueryRunner` 探測其回傳物件之實際型態與可用 API（是否可直接 `.request()` 取得 tedious `Request`，或需要透過其他路徑）
- **Expected Result**：記錄實際探測結果與可行取用手法至 impl log，供 `openMssqlBulkWriter` 實作依循；若探測發現 TypeORM mssql driver 未曝露可用物件，須記錄替代方案（如另建獨立 `mssql` 套件連線，不透過 TypeORM QueryRunner）

---

### TS-MSSQL-P4E-BULKWRITE-001（🔴🔴 MUST-FIX，DoD 核心）：代表性資料列完整寫入，列數一致
- **Related Requirement**：AD §9 P4e DoD「列數與 PG COPY 版本一致」
- **Test Type**：Positive / Integration — **DoD 核心案例**
- **Preconditions**：raw 表已依 §二 CREATETABLE-002 正確建立
- **Steps**：`openMssqlBulkWriter` 開啟 writer，`writeRows` 寫入代表性合成資料列（見 §0.3），`finish()`
- **Expected Result**：目標表 `SELECT COUNT(*)` 與寫入列數一致

---

### TS-MSSQL-P4E-BULKWRITE-002（🔴🔴 MUST-FIX，DoD 核心）：逐欄值正確性（字串/整數/小數/日期時間/布林）
- **Related Requirement**：AD §9 P4e DoD「逐欄逐列」精神延伸（本 DoD 原文僅提列數，本文件比照既有 PG COPY round-trip 測試慣例延伸至逐欄值）
- **Test Type**：Positive / Integration — **DoD 核心案例**
- **Expected Result**：讀回值與寫入值精確相等（非近似），涵蓋 §0.3 全部型別家族代表值

---

### TS-MSSQL-P4E-BULKWRITE-003（🔴 MUST-FIX）：NULL 值正確語意（非 PG COPY `\N` 字面轉義）
- **Related Requirement**：req #2；bulk 為型別化協定，NULL 語意應為原生 SQL NULL
- **Test Type**：Positive / Integration
- **Expected Result**：輸入 `null`/`undefined` 值寫入後讀回為 SQL `NULL`（`IS NULL` 為真），**不得**是字面字串 `'\N'`（PG COPY TEXT 協定之跳脫語意，bulk 路徑不適用）

---

### TS-MSSQL-P4E-BULKWRITE-004（Boundary）：空字串與 NULL 可區分
- **Related Requirement**：既有 `formatCopyValue`/COPY round-trip 測試已驗證此語意（PG 側），bulk 路徑對稱延伸
- **Test Type**：Boundary / Integration
- **Expected Result**：空字串 `''` 讀回為空字串（非 NULL），與 NULL 值明確可區分

---

### TS-MSSQL-P4E-BULKWRITE-005（Regression，對稱設計）：`supportsBulk` 為 false 時 `openBulkWriter` 拒絕
- **Related Requirement**：比照既有 `openCopyWriter` 對非 postgres 目標拒絕語意（`/PostgreSQL/`）
- **Test Type**：Negative / Unit（免真實連線）
- **Expected Result**：對 postgres/sqlite 目標呼叫 `openBulkWriter` 拋錯，錯誤訊息含 `MSSQL`/`SQL Server` 字樣

---

### TS-MSSQL-P4E-BULKWRITE-006（Probe，不可假設）：`abort()` 中途呼叫之已寫入列處理行為
- **Related Requirement**：比照既有 `CopyWriter.abort` 契約「Never throws」
- **Test Type**：Probe / Integration — **不預設答案**
- **Expected Result**：`abort()` 本身不拋出例外（此為硬性契約）；已寫入之部分列（若 bulk 分批送出，見 §六 BATCH）是否殘留於目標表，依實作而定，須記入 impl log（不預設全有或全無）

---

## 五、NOESCAPE-CHARSET — 中文/特殊字元/NULL Round-Trip 與 `formatCopyValue` 誤用防線（查證發現 3）

### TS-MSSQL-P4E-NOESCAPE-GATE-001（🔴🔴 決策關卡）：`openMssqlBulkWriter` 不得呼叫 `formatCopyValue`
- **Related Requirement**：查證發現 3
- **Test Type**：Decision Gate（文件化守門，MUST-FIX）
- **Expected Result**：impl log 明確記錄 `openMssqlBulkWriter` 內部值轉換邏輯**不得**呼叫 `formatCopyValue`（PG COPY TEXT 協定專屬跳脫函式）；若需要值前處理（如 `undefined`→`null`、`Date`→驅動可接受格式），須另建獨立函式（不與 `formatCopyValue` 共用）

---

### TS-MSSQL-P4E-NOESCAPE-001（🔴 MUST-FIX，陷阱佐證）：含真實 tab/newline/反斜線字元之字串正確 round-trip（非跳脫後字面形式）
- **Related Requirement**：查證發現 3
- **Test Type**：Negative / Integration — 陷阱佐證
- **Steps**：寫入含真實 `\t`（單一 tab 字元）/`\n`（單一 newline 字元）/`\`（單一反斜線字元）之字串值
- **Expected Result**：讀回值與寫入值逐字元相等（真實控制字元本身）；**若**讀回值含字面兩字元 `\` + `t`（而非單一 tab 字元），即證明 `formatCopyValue` 被誤用之陷阱發生，判定失敗

---

### TS-MSSQL-P4E-CHARSET-001（🔴 DoD 核心）：中文姓名/地址（含罕用字）round-trip
- **Related Requirement**：`I-MSSQL-COLLATE-01`（`Chinese_Taiwan_Stroke_BIN`）
- **Test Type**：Positive / Integration — **DoD 核心案例**
- **Expected Result**：中文字元經 bulk 寫入/讀回逐字元相等，無亂碼/截斷（延續 P4a/b/c/d 既有中文 round-trip 驗證精神至寫入端）

---

### TS-MSSQL-P4E-CHARSET-002（Boundary）：非 BMP 字元（如需要 surrogate pair 之罕用字/emoji）邊界
- **Related Requirement**：`NVARCHAR(MAX)` 型別選擇之佐證（原生 UTF-16，理論上支援非 BMP）
- **Test Type**：Boundary / Integration — 佐證性，非阻擋

---

### TS-MSSQL-P4E-CHARSET-003（Positive）：SQL 特殊字元（單引號/雙引號/百分比）正確寫入不被誤判為語法
- **Related Requirement**：型別化 bulk 協定天生防注入（非文字拼接），佐證性
- **Test Type**：Positive / Integration — 佐證性，非阻擋

---

## 六、BATCH — 大批次分批寫入/記憶體有界（🔴🔴 req #4 核心）

### TS-MSSQL-P4E-BATCH-GATE-001（🔴🔴 Probe 決策關卡，不可假設，待 tdd-impl 真庫驗證）：`request.bulk(table)` 跨多次呼叫之可行性
- **Related Requirement**：查證發現 6；CLAUDE.md ETL 紅線「不可用 in-memory 策略處理可能超出 RAM 的資料集」
- **Test Type**：Probe / Integration — **不預設答案**
- **Steps**：對同一目標表，以兩個獨立小型 `Table` 物件各自呼叫一次 `request.bulk()`（模擬分批），觀察是否皆成功、資料是否皆正確落地
- **Expected Result**：記錄實際可行性至 impl log；**若不可行**（例如第二次呼叫報衝突或僅第一次生效），須記錄替代設計（如改用單一累積 `Table` 物件但限制累積列數上限，犧牲部分記憶體有界性換取正確性，並明確告知使用者此取捨）

---

### TS-MSSQL-P4E-BATCH-001（🔴🔴 MUST-FIX，DoD 核心）：`writeRows()` 逐批觸發獨立 bulk 操作（記憶體有界佐證）
- **Related Requirement**：查證發現 6；req #4
- **Test Type**：Positive / Integration — **DoD 核心案例**
- **Steps**：分 3 次呼叫 `writeRows`（各批次列數對齊現行 `BATCH_SIZE=1000` 精神，測試中可用較小批次如 50/批），於每次呼叫之間查詢目標表當下列數
- **Expected Result**：目標表列數隨每次 `writeRows` 呼叫**逐步增加**（非全部呼叫完後才一次性跳增至總數），佐證未將全部資料累積於單一 in-memory 結構直到 `finish()` 才送出

---

### TS-MSSQL-P4E-BATCH-002（Positive）：跨批次累計列數正確，無遺漏/重複
- **Related Requirement**：既有邏輯回歸
- **Test Type**：Positive / Integration

---

### TS-MSSQL-P4E-BATCH-003（Boundary）：批次邊界四種情境
- **Related Requirement**：既有批次處理邊界慣例延伸
- **Test Type**：Boundary / Integration
- **Expected Result**：恰好整除批次大小、餘數批次（非整除）、單一批次小於批次大小、`totalCount=0`（空表，`writeRows([])`）四種情境皆正確處理不拋錯

---

### TS-MSSQL-P4E-BATCH-004（Positive，佐證性）：寬表（多欄位）情境下 bulk 路徑不受 SQL 文字參數數量上限影響
- **Related Requirement**：既有 `insertBatch` 之 `PG_PARAM_LIMIT=65000` 教訓（OBPOOLDATA 122 欄）延伸對照；MSSQL SQL 文字參數上限為 2100（遠低於 PG），但 bulk API 屬原生資料流協定，理論上不受此限制
- **Test Type**：Positive / Integration — 佐證 bulk 路徑相對 `insertBatch` 路徑之優勢，非阻擋案例

---

## 七、E2E-EXTRACT — 端對端真實擷取走 Bulk 路徑（🔴🔴 DoD 核心，req #5 + Orchestrator 整合）

### TS-MSSQL-P4E-E2EEXTRACT-GATE-001（🔴 決策關卡）：Harness 建構方式
- **Related Requirement**：§0.3
- **Test Type**：Decision Gate（文件化守門）
- **Expected Result**：impl log 記錄採用之建構方式（**建議**：直接 `new ExtractionExecutionService(...)` 注入真實 `RawDataService`（真實 mssql `DataSource`）+ 真實 `MSSQLExecutor`（自連線至 CDMP_TEST 讀取合成來源表）+ mock repository（`ExtractionTask`/`ExtractionLog`，比照既有 `extraction-execution.service.spec.ts` 風格），非全量 Nest `TestingModule`，最小化依賴）

---

### TS-MSSQL-P4E-E2EEXTRACT-001（🔴🔴 MUST-FIX，DoD 核心）：全量模式擷取完整跑通，列數一致
- **Related Requirement**：AD §9 P4e DoD「5 個來源表透過 tedious bulk API 完整匯入對應 raw_* 表，列數與 PG COPY 版本一致」（本文件以合成來源表驗證機制本身，見 §0.3 範圍說明）
- **Test Type**：Positive / Integration — **DoD 核心案例**
- **Preconditions**：合成來源表（CDMP_TEST 自建，≥500 列，觸發至少 2 個批次）；目標 raw 表已存在或首次建立
- **Expected Result**：`raw_*` 目標表最終列數與來源列數一致；`canStream` 確認走 `openBulkWriter` 路徑（非 `insertBatch`，交叉比對 §三 DISPATCH-003）

---

### TS-MSSQL-P4E-E2EEXTRACT-002（Positive）：`ExtractionLog`/`ExtractionTask` 狀態正確
- **Related Requirement**：既有欄位更新邏輯回歸
- **Test Type**：Positive / Integration
- **Expected Result**：`status='completed'`；`extracted_count` 與實際落地列數一致

---

### TS-MSSQL-P4E-E2EEXTRACT-003（Negative）：bulk 寫入失敗時之錯誤處理
- **Related Requirement**：既有 `catch` 區塊錯誤處理邏輯回歸（非新邏輯）
- **Test Type**：Negative / Integration
- **Preconditions**：模擬故障（如目標表於寫入中途被刪除）
- **Expected Result**：`ExtractionLog`/`ExtractionTask` 正確標記 `status='failed'`，`error_message` 非空

---

### TS-MSSQL-P4E-E2EEXTRACT-004（Positive）：schema-drift 情境正確觸發重建
- **Related Requirement**：依賴 §二 ISPG-GATE 已修復之 `createRawTable`/`getTableColumns` 前提
- **Test Type**：Positive / Integration
- **Preconditions**：第二次執行前來源欄位集合改變（新增/移除欄位）
- **Expected Result**：正確觸發 `dropTable`+`createRawTable` 重建，新結構之表可正常接續 bulk-load

---

### TS-MSSQL-P4E-E2EEXTRACT-005（Positive）：full mode 重跑冪等（TRUNCATE 後不疊加）
- **Related Requirement**：既有 full-mode TRUNCATE 語意回歸
- **Test Type**：Positive / Integration
- **Expected Result**：同一來源資料重跑第二次，目標表列數與第一次相同（非疊加）

---

## 八、PIPELINE-READ — Bulk-Load 產出之 raw 表可被 P4a `ExtractHandlerMssql` 正確讀取（🔴 DoD 核心，req #5）

> 不重測 `ExtractHandlerMssql` 內部轉換邏輯本身（P4a 已覆蓋），僅驗證「bulk-load 產出的物理表結構/collation 對既有已驗證 handler 相容」——此為 P4e 特有的新整合點（P4d 使用 fixture 直接建表，非真 bulk-load 灌數，見 AD §9 P4d 明確排除段落）。

### TS-MSSQL-P4E-PIPELINEREAD-001（🔴 DoD 核心）：`ExtractHandlerMssql` 成功讀取 bulk-load 產出之 raw 表
- **Related Requirement**：req #5；P4a 既有 `ExtractHandlerMssql` 測試（`_p4a-mssql-harness.ts` 建構手法沿用）
- **Test Type**：Positive / Integration — **DoD 核心案例**
- **Preconditions**：§七 E2EEXTRACT-001 完成之真實 bulk-load 產出 raw 表
- **Steps**：以 `makeRealCtx` 建構 `ExtractHandlerMssql` 執行context，對該 raw 表執行
- **Expected Result**：成功產出 `DataSet`（`##` 暫存表 + `rowCount`），`rowCount` 與 bulk-load 落地列數一致，無例外拋出

---

### TS-MSSQL-P4E-PIPELINEREAD-002（Positive）：中文欄位值跨兩機制一致
- **Related Requirement**：§五 CHARSET-001 交叉驗證
- **Test Type**：Positive / Integration
- **Expected Result**：`ExtractHandlerMssql` 讀取結果之中文欄位值與 bulk-load 寫入值一致（跨「bulk 寫入」+「handler 讀取」兩個獨立機制的端到端一致性）

---

### TS-MSSQL-P4E-PIPELINEREAD-003（Positive）：NULL 值跨兩機制正確辨識
- **Related Requirement**：§四 BULKWRITE-003 交叉驗證
- **Test Type**：Positive / Integration
- **Expected Result**：bulk-load 寫入之 NULL 值經 `ExtractHandlerMssql` 讀取後仍正確辨識為 NULL（非誤判為字面字串 `'NULL'` 或空字串）

---

## 九、PERF — 效能 POC 觀察性（非阻擋，req #7）

### TS-MSSQL-P4E-PERF-001（Observability，非阻擋）：Bulk-Load 吞吐量量測記錄
- **Related Requirement**：AD §9 P4e DoD「吞吐量做 POC 量測記錄（不要求達到與 PG COPY 相同數字，僅記錄供未來優化參考）」
- **Test Type**：Observability（非阻擋）
- **Expected Result**：記錄 bulk-load N 列（建議 ≥10,000，若測試環境資源允許）之耗時，不設通過門檻

---

### TS-MSSQL-P4E-PERF-002（Observability，非阻擋）：Bulk 路徑 vs 逐列 `insertBatch` 路徑耗時對照
- **Related Requirement**：req #7
- **Test Type**：Observability（非阻擋）
- **Expected Result**：相同資料量下兩路徑耗時對照記錄；僅確認 bulk 路徑非「顯著劣於」逐列 INSERT 之退化級表現（若量測結果反常變慢，記錄但不視為失敗，交 tdd-implementation 判斷是否需進一步調查）

---

## 十、REG — 回歸（req #6）

### TS-MSSQL-P4E-REG-001（DoD 紅線）：`npx tsc --noEmit -p tsconfig.build.json` 乾淨
- **Related Requirement**：專案既有 DoD 紅線慣例

---

### TS-MSSQL-P4E-REG-002（🔴 DoD 核心）：PG `openCopyWriter`/`formatCopyValue`/`supportsCopy` 既有全部測試逐字不變且全綠
- **Related Requirement**：req #6「postgres COPY 路徑不變」；AD §6「postgres 分支完全不動」精神延伸至 raw-data.service.ts
- **Test Type**：Regression — **DoD 核心案例**
- **Expected Result**：`raw-data.service.spec.ts` 現行三個 describe 區塊（`formatCopyValue` COPY TEXT escaping / `supportsCopy`+`openCopyWriter` guards / `openCopyWriter` 整合 round-trip）逐字不變且全綠，證明 PG 路徑零改動

---

### TS-MSSQL-P4E-REG-003（Positive）：`extraction-execution.service.spec.ts` 既有全部套件不回歸
- **Related Requirement**：§三 DISPATCH 改動之回歸確認
- **Test Type**：Regression
- **Expected Result**：既有 mock-based 單元測試全數通過；若既有測試對 `canStream` 相關 mock 因新增 `supportsBulk()` 呼叫而需要同步補上 mock（非邏輯破壞，屬必要測試維護），須於 impl log 記錄

---

### TS-MSSQL-P4E-REG-004（Regression）：P4a/b/c/d 既有全部 mssql 測試套件不回歸
- **Related Requirement**：ETL engine handlers 完全不受 `raw-data.service.ts` 改動影響（driver-agnostic 邊界確認，`raw-data.service.ts` 與 ETL engine handlers 屬完全不同模組）
- **Test Type**：Regression

---

### TS-MSSQL-P4E-REG-005（Regression）：SQLite 路徑既有行為不變
- **Related Requirement**：§二 ISPG-GATE 三態改法之回歸確認（測試環境預設 sqlite）
- **Test Type**：Regression
- **Expected Result**：既有全部 sqlite 相關 raw-data 測試維持通過，確認二態→三態改法未破壞既有 sqlite 分支語意

---

## 十一、STATIC — 事實鎖定

### TS-MSSQL-P4E-STATIC-001：`mssql` npm package 版本鎖定
- **Related Requirement**：`package.json` `"mssql": "^11.0.1"`，供未來升級時回歸比對基準
- **Test Type**：Regression / Unit — 靜態讀取，非真實連線

---

### TS-MSSQL-P4E-STATIC-002：新增方法簽章快照鎖定
- **Related Requirement**：`openMssqlBulkWriter`/`supportsBulk`/`mapToMssqlType` 三個新方法之簽章鎖定，供下游一致性參照

---

### TS-MSSQL-P4E-STATIC-003（🔴🔴 MUST-FIX，呼應 §五）：原始碼靜態掃描確認 `openMssqlBulkWriter` 不含 `formatCopyValue` 呼叫字面
- **Related Requirement**：查證發現 3；與 §五 NOESCAPE-001（執行期陷阱佐證）形成雙重防線
- **Test Type**：Regression / Unit — 靜態 grep 掃描（非真實連線）
- **Expected Result**：`raw-data.service.ts` 原始碼中，`openMssqlBulkWriter` 方法本體逐行掃描，不含 `formatCopyValue` 呼叫字面

---

## 附：與 AD-E07-41 §9 P4e DoD 逐條對應

| AD §9 P4e DoD 原文 | 對應測試群組 |
|---|---|
| 「5 個來源表透過 tedious bulk API 完整匯入對應 raw_* 表」 | §七 E2E-EXTRACT（機制驗證，合成來源，見 §0.3 範圍說明）+ §四 BULK-WRITE（核心正確性） |
| 「列數與 PG COPY 版本一致」 | §四 BULKWRITE-001 + §七 E2EEXTRACT-001 |
| 「吞吐量做 POC 量測記錄（不要求達到相同數字）」 | §九 PERF（非阻擋） |
| （AD §6 擴充）「新增 openMssqlBulkWriter/supportsBulk/openBulkWriter capability-detection」 | §三 DISPATCH、§四 BULK-WRITE |
| （test-designer 查證擴大）「isPostgres 二元 gate 直接阻擋 P4e DoD 之前置依賴」 | §二 ISPG-GATE |
| （test-designer 查證擴大）「三層型別對應一致性，含 FINDING-P4D-01 同型缺陷防線」 | §一 TYPEMAP |
| （task 需求擴充）「正確性：中文/NULL/特殊字元 round-trip，區分 COPY escape vs bulk 型別化語意」 | §五 NOESCAPE-CHARSET |
| （task 需求擴充）「大批次分批，記憶體有界」 | §六 BATCH |
| （task 需求擴充）「與 P4a extract-handler-mssql 整合」 | §八 PIPELINE-READ |
| （task 需求擴充）「回歸：PG 路徑不變；既有測試；tsc」 | §十 REG |
