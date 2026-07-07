---
type: implementation-log
feature_id: AD-E07-41-P4c
feature_name: MSSQL 全面遷移 P4c — ETL Handler 群組三（dedup / target-load，含 DISTINCT ON+ctid→ROW_NUMBER+IDENTITY tie-breaker + customer_core UPSERT 兩段式 + fullMode/partition_replace 三模式 + createDispatcher DB_TYPE 分支接線）
status: complete
last_updated: 2026-07-08
---

# AD-E07-41 P4c — ETL Handler 群組三 MSSQL 化 實作紀錄

## 範圍

§4 全部（`DISTINCT ON`+`ctid` → `ROW_NUMBER()`+`IDENTITY` tie-breaker）＋ §5.1（customer_core UPSERT `ON CONFLICT`→兩段式）＋ 查證發現擴大之 `fullMode`（4 pipeline）與 `partition_replace`（1 pipeline）＋ `createDispatcher` 之 `DB_TYPE` 分支接線（P4a/P4b 兩度延後之 DISPATCH-001 落地時機）。新增 `dedup-handler-mssql.ts`、`target-load-handler-mssql.ts`（PG 原檔逐位元組不動）。共用 `temp-table.util.ts` 以 **additive** 擴充（CATALOG-GATE-001 選項甲）。**不碰** 53 節點端對端（P4d）、bulk-load（P4e）。

## 🔴🔴 實作前真實 MSSQL 探測結論（CDMP_TEST `cdmp-mssql` 容器，非假設；含測試設計標注之「待 tdd-impl 真庫驗證」項）

1. **datetime2 CAST 接受 ISO8601 'Z' 後綴**：`CAST('2026-07-08T12:34:56.789Z' AS datetime2)` 與去 Z 版皆成功、回值相同。實作仍保留 `.replace('Z','')`（防禦性、去除 UTC designator 語意歧義，無害）。
2. **`SELECT IDENTITY(INT,1,1) AS _seq, * INTO ##raw FROM <## 輸入表>` 於 tedious/QueryRunner 可行**：`##raw` 欄位為 `_seq,<原欄位>`，IDENTITY 捕捉寫入序成立。
3. **`getMssqlTempTableColumns` JOIN `tempdb.sys.types` 回傳 `dataType`**：`varchar`/`nvarchar` 等正確；供 target-load `NULLIF(TRIM())` 判斷（CATALOG-GATE-001）。
4. **CATALOG-MSSQL-001（真庫個別確認，非沿用 P4a QUOTE-003 附帶結論）**：小寫 `is_nullable='NO'` 對 `INFORMATION_SCHEMA.COLUMNS` 正確繫結 `IS_NULLABLE`，customer_core NOT NULL 業務欄回 `source_customer_no/customer_type_code/name`（大寫 schema/view + 小寫欄位名，與 I-MSSQL-CATALOG-CASE-01 一致）。
5. **UPSERT-TRAP-001**：naive `INSERT ... ON CONFLICT (...) DO UPDATE SET ...` 對真實 MSSQL 拋 `Incorrect syntax near the keyword 'ON'`（陷阱屬實 → 兩段式必要）。
6. **TLDEDUP-TRAP-001（論證型，非必然可重現）**：naive `ROW_NUMBER() OVER(PARTITION BY pk ORDER BY pk)`（無 tie-breaker）對含重複 pk 之資料連跑 20 次，本測試環境勝出列**恰好穩定**（winners size=1）。**依測試設計指示不反向斷言「其實安全」**——SQL Server 官方文件明載 `ORDER BY` 排序鍵存在相同值時排序未定義，本次僅代表此環境查詢計畫恰穩定；顯式 `_seq` tie-breaker（IDENTITY）仍為語意保證所必要（TLDEDUP-UNIT-001/002 之正當性依據）。
7. **DEV-P4C-TABLES（★ 推翻測試設計 §0.2 前提）**：測試設計 §0.2 假設 `customer_core`/`ob_calendar`/`ob_emphire`/`ob_arreturndf_min_cap`「P4-0 已建」於 CDMP_TEST。**真庫實測 CDMP_TEST 僅 4 張 base table，上述 baseline 表全數不存在**。比照 P4a/P4b RESOLVE-002 先例，整合 spec 於 `beforeAll` 以 baseline migration 逐字 DDL 自建（`_p4c-target-tables.ts`，idempotent）。詳見偏差段。

## Files Changed

| File Path | Change | 說明 |
|-----------|--------|------|
| `src/modules/etl/engine/handlers/dedup-handler-mssql.ts` | new | `IDENTITY(INT,1,1) AS _seq` 中繼 `##raw` + `ROW_NUMBER() OVER(PARTITION BY key ORDER BY ts DESC, CASE WHEN ts IS NULL..., _seq ASC)`；最終 SELECT 僅列原始欄位（排除 `_seq`/`rn`）；`##raw` 自行 `try/finally` 清理 |
| `src/modules/etl/engine/handlers/target-load-handler-mssql.ts` | new | 兩段式 UPSERT（`EXCLUDED.col`→`src.col`）+ fullMode（TRUNCATE+INSERT，內部 PK dedup）+ partition_replace（DELETE+INSERT）；內部 2 處 DISTINCT ON 共用 `buildDeterministicDedupTable`；`LEN(TRIM())`/`CAST(... AS datetime2/uniqueidentifier)`；catalog 雙路徑（`##`→tempdb.sys.columns、真實表→`INFORMATION_SCHEMA`）；獨立 `try/finally` 清理 |
| `src/modules/etl/engine/handlers/mssql/temp-table.util.ts` | modified (additive) | CATALOG-GATE-001 選項甲：`MssqlTempTableColumn` 新增 `dataType` 欄；`getMssqlTempTableColumns` JOIN `tempdb.sys.types` 回傳型別。既有 4 函式簽章 + `name`/`columnId` 語意不變 |
| `src/modules/etl/engine/index.ts` | modified (additive) | barrel 新增 9 個 `*HandlerMssql` 匯出（供 createDispatcher 引用） |
| `src/modules/etl/etl-pipeline-execution.service.ts` | modified | DISPATCH-001 落地：注入 `ConfigService`；`createDispatcher` 依 `configService.get<string>('DB_TYPE','sqlite')==='mssql'` 二選一註冊 9 個 handler。PG 分支逐位元組不變 |
| `src/modules/etl/__tests__/etl-pipeline-execution.service.spec.ts` | modified | 補 `ConfigService` mock provider（新建構參數；預設回退 sqlite → PG 分支，既有 12 測試不回歸） |
| `src/modules/etl/engine/__tests__/_p4c-target-tables.ts` | new | DEV-P4C-TABLES：baseline target 表 idempotent 自建 helper（DDL 逐字取自 mssql baseline migration） |
| `src/modules/etl/engine/__tests__/p4c-mssql-unit.spec.ts` | new | UNIT（mock QueryRunner，CI 恆跑）：DEDUP/TLDEDUP/UPSERT/FULLMODE/PARTITION/CATALOG/LITERAL/DISPATCH |
| `src/modules/etl/engine/__tests__/p4c-mssql-static.spec.ts` | new | STATIC/REG-002/DISPATCH-003/LITERAL-003/決策關卡文件守門（fs regex，CI 恆跑） |
| `src/modules/etl/engine/__tests__/p4c-dedup-handler.mssql.spec.ts` | new | DEDUP TIEBREAK/MSSQL/EQ/CLEANUP（真實 MSSQL，`##` fixture） |
| `src/modules/etl/engine/__tests__/p4c-target-load.mssql.spec.ts` | new | UPSERT/TLDEDUP/FULLMODE/PARTITION/CLEANUP/CATALOG（真實 MSSQL，dbo 表） |

## Architectural Decisions

### TLDEDUP-GATE-001 — 內部兩處 tie-breaker 之機制（決策記錄）

**(a) 決定性鍵捕捉手法**：兩處 `DISTINCT ON`（fullMode PK 去重、UPSERT `source_customer_no` 去重）皆以 `SELECT IDENTITY(INT,1,1) AS _seq, <cols> INTO ##<dest>_seq FROM <source>` 捕捉寫入序，再 `ROW_NUMBER() OVER(PARTITION BY <keys> ORDER BY _seq ASC)` + `WHERE rn=1` 選出決定性一列——與 §一 DEDUP 之 `_seq` 手法完全一致（避免專案內並存兩套 tie-break 哲學，TLDEDUP-UNIT-003）。
**(b) 共用 helper**：兩處 **共用同一 private 方法 `buildDeterministicDedupTable(sourceTable, destTable, keyColsQuoted, selectColList)`**（非各自獨立實作），中繼 `##<dest>_seq` 於該 helper 內 `try/finally` 自行清理。§一 DEDUP handler 因需處理 timestamp 主排序（`ts DESC` + NULLS-LAST CASE）故未共用此 helper，但 `_seq` 捕捉哲學相同。

### CATALOG-GATE-001 — `data_type` 資訊來源（決策記錄）

**選 選項甲**：additive 擴充既有共用 helper `getMssqlTempTableColumns`/`MssqlTempTableColumn`，新增 `dataType` 欄（`tempdb.sys.columns` JOIN `tempdb.sys.types`）。理由：(a) 供全部既有呼叫端（P4a/P4b 之 handler）與本輪 target-load 共用單一內省站點；(b) 既有 `name`/`columnId` 語意與 4 函式簽章不破壞（STATIC-003 驗收）；(c) 既有呼叫端僅取 `name`/`columnId`，新增欄位不影響其行為。`varcharColumns` 判斷之 MSSQL 型別集合＝`{varchar,nvarchar,char,nchar,text,ntext}`（對照 PG `character varying`/`text`/`character`）。

### CLEANUP-GATE-001 — target-load 內部暫存表清理責任模型（決策記錄）

`target-load-handler-mssql.ts` 回傳 `{ tempTable: '', rowCount }`，其內部 enriched `tempTable`、`dedupTable`（及 `buildDeterministicDedupTable` 之 `##<dest>_seq` 中繼）**從未透過 `DataSet` 向 `NodeOutputStore` 註冊**，P4a `CLEANUP-003` 建立之 `NodeOutputStore.cleanupAll()` 機制天生不清理它們。故本 handler **不依賴 pipeline 層級清理**，改以**獨立 `try/finally`** 於成功與失敗兩路徑皆顯式 `dropMssqlTempTableIfExists`（enriched `tempTable` + `dedupTable`；`##_seq` 中繼由 helper 內層 `try/finally` 清理）。此為 P4a/P4b 其餘 8 個 handler（皆交 `NodeOutputStore` 統一收斂）之**唯一例外**（I-MSSQL-TEMPTABLE-CLEANUP-01 之 handler 自理實作）。dedup-handler-mssql 之 `##raw` 中繼同理自行 `try/finally` 清理；`##dedup`（回傳表）則仍交 `NodeOutputStore`。

### DISPATCH-001 — createDispatcher 於 P4c 接上 DB_TYPE 分支（落地 P4a/P4b 延後決議）

注入 `ConfigService`，`createDispatcher` 依 `configService.get<string>('DB_TYPE','sqlite')==='mssql'` 二選一註冊 9 個 handler（沿用 `app.module.ts:99` 既有慣例，DISPATCH-003）。`DB_TYPE!=='mssql'`（含 `postgres`/`sqlite`/未設定）維持原 9 個 PG handler 逐位元組不變（DISPATCH-004）。既有 exec-service spec 補 `ConfigService` mock provider。

### 其他實作選擇

- **dedup/TLDEDUP 最終 SELECT 顯式列原始欄位**：`SELECT <origCols> INTO ##dedup FROM (ranked) WHERE rn=1` 排除 `_seq`/`rn`，使輸出欄位集合與 PG `SELECT DISTINCT ON (...) *`／`SELECT DISTINCT ON (...) ${columnList}` 完全一致（否則下游會多見 `_seq`/`rn` 欄）。
- **NULLS LAST 顯式 CASE**：`ts DESC` MSSQL 本即 NULL 最後，仍以 `CASE WHEN <ts> IS NULL THEN 1 ELSE 0 END` 補齊「不依賴引擎 NULL 預設順序」（§4.2；比照 P4a RESOLVE-002）。
- **系統字面值用 `CAST` 非 `TRY_CAST`**：`_etl_loaded_at`/`_etl_pipeline_id`/`_cdmp_extracted_at` 為 JS 端產生、型別已知必然合法（§5.3）。
- **ghost gate 以 `src.` 別名限定**：兩段式 UPDATE 之 `customer_core tgt JOIN ##dedup src` 兩表同名欄位會歧義，故 ghost gate（`LEN(TRIM(src."source_customer_no"))>=5` + notNull checks）全數 `src.` 限定；UPSERT SELECT/COUNT 亦以 `##dedup src` 別名一致引用。
- **partition_replace 無 DISTINCT ON**：程式路徑確認該分支不呼叫 `getPrimaryKeyColumns`、不建 dedup 中繼（與查證發現 2 一致）。

## 偏差（deviation）

### 🔴 DEV-P4C-TABLES：baseline target 表不存在於 CDMP_TEST（推翻測試設計 §0.2「P4-0 已建」前提）

測試設計 §0.2 假設 `customer_core`/`ob_calendar`/`ob_emphire`/`ob_arreturndf_min_cap` 已存在於 CDMP_TEST。**真庫探測證 CDMP_TEST 僅 4 張 base table，上述 baseline 表全數不存在**（P4-0 之 baseline 未套用於此測試 DB，或已被回收）。**處置**：比照 P4a EXTRACT-RESOLVE-002 / P4b DEV-P4B-02「自建最小 dbo 版本」先例，新增 `_p4c-target-tables.ts`，於整合 spec `beforeAll` 以 mssql baseline migration **逐字 DDL** idempotent 自建（型別/NOT NULL/PK/UNIQUE 完全一致）。baseline 表建立後保留（不 drop，符合「baseline 表存在」語意）；列資料以唯一 `source_customer_no` 前綴隔離 + `afterEach` 精準刪除，`ob_calendar`/`ob_arreturndf_min_cap` 之 fullMode 測試以 `DELETE` 前後清空（TRUNCATE 語意等價、且此三表非其他套件驗證對象）。整合測試集中於單一 `p4c-target-load.mssql.spec.ts`（避免跨檔對 customer_core 之競態）。

### DEV-P4C-CLEANUP-DEDUP-INTERMEDIATE：`##raw`/`##_seq` 中繼表由 handler 自理，非 NodeOutputStore

見 CLEANUP-GATE-001。dedup-handler-mssql 之 `##raw`、target-load 之 enriched `tempTable`/`dedupTable`/`##_seq` 皆為 handler 內部生命週期，`try/finally` 自清；僅 dedup 之 `##dedup`（回傳表）交 `NodeOutputStore`。

## Test Results Summary（實跑，2026-07-08，CDMP_TEST `cdmp-mssql` 容器）

| 群組 | 檔案 | 結果 |
|------|------|------|
| DEDUP/TLDEDUP/UPSERT/FULLMODE/PARTITION/CATALOG/LITERAL/DISPATCH UNIT | `p4c-mssql-unit.spec.ts` | PASS（37） |
| STATIC-001..005 / REG-002 / DISPATCH-003 / LITERAL-003 / 3 決策關卡文件守門 | `p4c-mssql-static.spec.ts` | PASS |
| DEDUP TIEBREAK-001..005 / MSSQL-001..003 / EQ-004 / CLEANUP-001..002 | `p4c-dedup-handler.mssql.spec.ts` | PASS（11，真實 MSSQL） |
| UPSERT TRAP+EQ / TLDEDUP MSSQL+EQ+TRAP / FULLMODE MSSQL+EQ+REG / PARTITION MSSQL+EQ / CLEANUP MSSQL / CATALOG MSSQL | `p4c-target-load.mssql.spec.ts` | PASS（28，真實 MSSQL） |

真實 MSSQL 全數實跑（非 skip）。

### tie-breaker / 三模式 / 內部 DISTINCT ON 關鍵佐證（節錄實跑）

- **DEDUP tie-breaker**：同 key 同 timestamp 兩列，`_seq` 較小（首列）決定性勝出、3 次一致（TIEBREAK-001）；全 NULL timestamp → `_seq` 決勝、3 次一致（TIEBREAK-004）；timestamp 不同 → 較新勝出、`_seq` 不介入（TIEBREAK-002）。
- **UPSERT 兩段式**：新列 INSERT、既有列 UPDATE 且 PK/source_customer_no 不覆寫、ghost gate 排除 `LEN(TRIM)<5`、NOT NULL 業務欄 null 整列排除、冪等（重跑無疊加）、`_etl_pipeline_id` CAST 正確、中文 round-trip。
- **內部 DISTINCT ON**：TRIM 正規化碰撞（`'K1 '` vs `'K1'`）去重後僅一列且決定性（TLDEDUP-EQ-001 旗艦）；composite PK（col_a+col_b）不誤併 appl_no 相同/orgno 不同（TLDEDUP-EQ-002）。
- **fullMode**：composite PK dedup + TRUNCATE 全量替換（stale 列消失）；`_cdmp_extracted_at` NOT NULL 自動補值；rowCount=0 → 短路不 TRUNCATE（安全網 REG-001）。
- **partition_replace**：僅覆寫 `etl_load` 分區、`monthly_run` 不變；重跑非疊加；partitionValue 含單引號逸出正確。
- **清理 OBJECT_ID NULL**：UPSERT 成功後 `##base`/`##base_dq`/`##base_dq_seq` 皆 NULL；人為失敗後 enriched `tempTable`/`dedupTable` 仍被清理。

### DoD / 回歸

- **REG-001（DoD 紅線）** `npx tsc --noEmit -p tsconfig.build.json` **乾淨**。
- **REG-002** PG 原檔 `dedup-handler.ts`/`target-load-handler.ts` 未被 mssql 化（STATIC/REG-002 綠）。
- **REG-003** PG `engine-node-executors.spec.ts`/`engine-core.spec.ts`（含 dedup/target_load PG 案例）不回歸。
- **REG-004** P4a/P4b 全套件（`temp-table.util.ts` additive 擴充後既有簽章不變）不回歸。
- **REG-005** sqlite 路徑不受影響（DB_TYPE 非 mssql → PG handler 分支）。
- 既有 10 項技術債（target-table-schemas / fn_calc customer_core drift）與本切片無關、未擴大。
