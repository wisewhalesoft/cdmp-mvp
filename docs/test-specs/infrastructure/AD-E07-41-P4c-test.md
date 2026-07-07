---
type: test-design-infrastructure
test-spec-id: AD-E07-41-P4c
feature_name: MSSQL 全面遷移 P4c — ETL Handler 群組三（dedup / target-load，含 DISTINCT ON+ctid→ROW_NUMBER+IDENTITY tie-breaker + customer_core UPSERT ON CONFLICT→兩段式 + target-load 三種 loadMode 全覆蓋）
priority: P0-MVP
related_spec:
  - /docs/specs/implementation-log/AD-E07-41-mssql-p4-etl-engine.md（§3 temp helper、§4 dedup tie-breaker、§5.1 customer_core UPSERT 兩段式、§9 P4c 範圍/DoD、§10 不變式 I-MSSQL-DEDUP-TIEBREAK-01）
  - /docs/specs/implementation-log/AD-E07-41-P4a-impl.md（QUOTE-003 雙引號識別碼 PASS 結論逐字複用、CLEANUP-003 掛載於 NodeOutputStore.cleanupAll() 之決策、DISPATCH-001 選項甲「延後至 P4c 全部 9 handler 到齊才接線」——本輪即為該決議落地時機）
  - /docs/specs/implementation-log/AD-E07-41-P4-0-impl.md（customer_core 92 欄 MSSQL baseline 已建，PK=customer_id、UNIQUE=source_customer_no、7 個 NOT NULL 業務欄）
  - /docs/test-specs/infrastructure/AD-E07-41-P4b-test.md（P4b 已完成之測試設計，本文件沿用其 harness/EQ 分層慣例，不重議 QUOTE-003/CLEANUP-003/DISPATCH-001）
covers: []
spec_version: "1.0"
date: 2026-07-08
last_updated: 2026-07-08
---

# AD-E07-41 P4c：MSSQL 全面遷移 — ETL Handler 群組三（dedup / target-load）— 測試設計

> 本文件覆蓋 AD-E07-41「MSSQL 全面遷移 P4（ETL 引擎 MSSQL 化）」之 **P4c 切片**（AD §4 全部：`DISTINCT ON`+`ctid`→`ROW_NUMBER()`+`IDENTITY` tie-breaker；AD §5.1：customer_core UPSERT `ON CONFLICT`→兩段式 `UPDATE...FROM`+`INSERT...WHERE NOT EXISTS`）。P4 不經 spec-writer（AD-E07-41「是否需要 spec-writer」章節已裁定，比照 P4a/P4b 先例，本輪不重複論證）；本文件依 system-architect 產出之 AD-E07-41 + 前兩切片 P4a/P4b 之落地事實，直接產出測試設計，交 tdd-implementation。
>
> **★★ 範圍已擴大（test-designer 逐檔查證結論，見下方查證發現 2）**：`target-load-handler.ts` 並非只服務 customer_core——真實 `etl-pipelines.json` 顯示同一 handler 被 **6 條 pipeline** 共用（customer_core UPSERT ×1、`fullMode` 全量替換 ×4：`ob_arreturndf_min_cap`/`ob_calendar`/`ob_emphire`/`ob_pool_data`、`loadMode='partition_replace'` 分區替換 ×1：`ob_pool_data_list`），AD §5.1/§9 P4c DoD 僅文字描述 customer_core UPSERT 一種路徑。由於 `createDispatcher()` 之 `DB_TYPE` 分支將於本切片首次接上（見查證發現 6），cutover 後這 5 條既有生產 pipeline（E04/E03 raw data landing 之既有機制）會直接呼叫 mssql 版 `TargetLoadHandler`；若僅實作 customer_core 路徑，這些 pipeline 在 MSSQL 上會 100% 失敗，且無任何既定測試（P4d 端對端範圍僅限 customer_core 53 節點）能在上線前攔截。本文件已將 `fullMode`（§四 FULLMODE）與 `partition_replace`（§五 PARTITION）兩條路徑正式納入測試範圍，不視為防禦性覆蓋。
>
> **明確排除**：53 節點端對端（P4d）；bulk-load raw staging 寫入端（P4e）。
>
> **前置閘已過**：P4-spike-2 已於 2026-07-08 全數通過；P4a/P4b 已完成並落地 QUOTE-003（雙引號識別碼跨 driver 相容性 PASS，本文件直接沿用不重測）、`temp-table.util.ts` 全部 4 個共用 helper、`NodeOutputStore.cleanupAll()` 之 mssql 分支 + `createdTables` 累積集合機制。**DISPATCH-001（createDispatcher 之 DB_TYPE 分支）P4a/P4b 皆延後未接線，AD-E07-41 P4a impl log 明文「延後至 P4c（全部 9 handler 到齊）一次接上」——本輪即為該決議落地時機**，已於 §九 DISPATCH 設計對應 MUST-FIX 案例。
>
> **★ test-designer 逐檔查證 + 對照真實 `etl-pipelines.json`（customer_core 53 節點 + 其餘 5 條 pipeline）發現之關鍵事實**：
>
> 1. **🔴🔴（本文件最高風險之一，AD §4/§5.1/I-MSSQL-DEDUP-TIEBREAK-01 完全未提及）`target-load-handler.ts` 內部另有兩處 `DISTINCT ON` 去重站點，與 `dedup-handler.ts` 的 `ctid` 決勝角色相同但 AD 完全未涵蓋**：(a) `fullMode` 路徑之 `SELECT DISTINCT ON (${pkColList}) ... FROM "${tempTable}" ORDER BY ${pkColList}`（防禦性 PK 去重，因來源端 MSSQL schema 未必有 PK/unique constraint）；(b) customer_core UPSERT 路徑之 `SELECT DISTINCT ON ("source_customer_no") ... FROM "${tempTable}" ORDER BY "source_customer_no"`（PG 原始碼註解明確承認：「handles collisions caused by `NULLIF(TRIM())` normalization」——即上游 `dedup-handler.ts`（d3 節點）在 TRIM 正規化**之前**依原始字串去重，`'A12345 '` 與 `'A12345'` 當下被視為兩個不同 key 皆存活，只有到了 `target-load-handler.ts` 自身做 TRIM 正規化之後才會碰撞，這是 d3 從未見過的**新**碰撞，非重複去重）。兩處 `ORDER BY` 皆**僅含 key 本身**，無任何次要排序鍵，翻譯為 T-SQL `ROW_NUMBER() OVER(PARTITION BY key ORDER BY key)` 在語法上合法，但對 ties（同 key 值）「哪一列勝出」屬未定義/查詢計畫相依行為——與 §4.2 `_seq IDENTITY` 之設計動機完全相同，卻未被 AD 納入 I-MSSQL-DEDUP-TIEBREAK-01 條文字面（該不變式僅提及「Dedup 邏輯」，實務上讀者容易誤解為僅指 `dedup-handler.ts` 本身）。已獨立立 §二 TLDEDUP 群組處理，優先權緊接 §一 DEDUP 之後。
> 2. **🔴🔴（範圍擴大核心依據）真實 `etl-pipelines.json` 6 條 pipeline 之 `target_load` 節點設定**：`ob_arreturndf_min_cap`/`ob_calendar`/`ob_emphire`/`ob_pool_data` 四者 `fullMode:true`；`ob_pool_data_list` 為 `loadMode:'partition_replace'`（`partitionColumn:'data_source'`, `partitionValue:'etl_load'`）；仅 customer_core 為 `fullMode:false`（AD §5.1 唯一描述之路徑）。MSSQL baseline migration（`1751884800000-MssqlBaselineSchema.ts`）確認 `ob_emphire`（PK=`emp_id`，單欄）、`ob_calendar`（PK=`calendar_date`，單欄）、`ob_arreturndf_min_cap`（PK=`appl_no`，單欄，另有 NOT NULL 的 `_cdmp_extracted_at`）三者已是既有 `dbo` 實體表，`ob_pool_data`（PK=`orgno`+`appl_no`，**composite**）與 `ob_pool_data_list`（PK=`list_no`+`orgno`+`appl_no`，composite，但 partition_replace 路徑不呼叫 `getPrimaryKeyColumns`）亦已存在但欄位數逾百，過重不適合逐欄 fixture。
> 3. **`getPrimaryKeyColumns()`**（`fullMode` 專屬依賴）為 AD 完全未提及之 catalog 查詢站點（`information_schema.table_constraints`/`information_schema.key_column_usage` JOIN），且需正確處理 composite PK（`ordinal_position` 排序）。
> 4. **`getColumns()` 於 `target-load-handler.ts` 內同時對「`##` 輸入暫存表」與「真實 `dbo` target 表」兩種不同物件呼叫**——前者依 I-MSSQL-TEMP-METADATA-01 須走 `getMssqlTempTableColumns`；後者為真實持久表，`INFORMATION_SCHEMA.COLUMNS`（大寫）可直接可靠使用，無暫存表命名混淆問題。AD §3.2 target-load 列僅籠統標注「見 §5.1」，未展開此雙路徑細節。
> 5. **`inputColumnTypes`/`varcharColumns`（供 `NULLIF(TRIM())` 正規化判斷用）需要欄位型別資訊，但既有共用 helper `getMssqlTempTableColumns` 回傳型別 `MssqlTempTableColumn{name,columnId}` 不含 `data_type`**——P4a/P4b 皆未有此需求（僅需欄位名/順序），本輪為首次需要型別資訊之站點，屬決策關卡（擴充既有 helper vs 另寫查詢）。
> 6. **target-load 內部建立之 `tempTable`（enriched）與 `dedupTable` 從未透過 `DataSet` 向 `NodeOutputStore` 註冊**——handler 執行完畢回傳 `{ tempTable: '', rowCount }`（空字串），這兩張表完全在 handler 內部生命週期自理，**P4a `CLEANUP-003` 建立之 `NodeOutputStore.cleanupAll()` 機制天生不會、也不應被期待清理這兩張表**。PG 版現行僅於**成功路徑尾端**呼叫 `DROP TABLE IF EXISTS`，`UPSERT`/`fullMode`/`partition_replace` 三個分支之 `try/catch` 皆只包裹核心 DML 陳述式、catch 後直接 `throw`——若 DML 失敗，PG 版本身也**不會**執行到後續的 `DROP TABLE IF EXISTS`（PG 靠 session/交易結束自動回收暫存表，此為現行已知但無害的行為）。MSSQL `##global temp` 無此隱性保障（`##` 於連線池 `release()` 後仍殘留，P4-spike-2 POINT4 已實證），故 mssql 版**必須**新增獨立於 `NodeOutputStore` 機制之 `try/finally`，確保成功與失敗兩路徑皆呼叫 `dropMssqlTempTableIfExists`——此為本 handler 獨有、AD 完全未提及之清理責任。
> 7. **DISPATCH 沿革**：`createDispatcher()`（`etl-pipeline-execution.service.ts:47`）現行完全無 `DB_TYPE` 分支、無 `ConfigService` 注入，9 個 PG handler 逐一 `dispatcher.register(new XxxHandler())`。P4a `DISPATCH-001`/P4b `DISPATCH-002` 皆決議延後接線至「全部 9 handler 到齊」——本輪 dedup/target_load 完成後 9 個 mssql handler 全數到位，為 DB_TYPE 分支接線之預定時機，已於 §九 DISPATCH 設計 MUST-FIX。既有 `app.module.ts`/`data-source.ts` 已建立 `configService.get<string>('DB_TYPE', 'sqlite')` 慣例，接線應複用而非另創判斷邏輯。
> 8. PG 版 `'${etlLoadedAt}'::TIMESTAMP`/`'${etlPipelineId}'::UUID` 為 JS 端產生之系統字面值直接內嵌（非 Pattern B `$n` 參數化站點），AD §5.3 之 `TRY_CAST`（不可信輸入）/`CAST`（內部產生、型別已知必然合法）二分原則於此適用後者——已於 §八 LITERAL 納入。

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件全部 + `AD-E07-41-mssql-p4-etl-engine.md`（§4、§5.1、§9 P4c）+ `AD-E07-41-P4a-impl.md`（QUOTE-003/CLEANUP-003/DISPATCH-001 三項決策，本輪 DISPATCH-001 之落地）+ `apps/api/src/modules/etl/engine/handlers/mssql/temp-table.util.ts`（唯讀複用/依 CATALOG-GATE-001 決策可能 additive 擴充）+ `dedup-handler.ts`/`target-load-handler.ts`（PG 原始碼，逐一對照）+ `apps/api/src/modules/etl/etl-pipeline-execution.service.ts`（`createDispatcher()` 接線點）+ `apps/api/src/database/seeds/data/etl-pipelines.json`（真實 3 個 dedup 節點 + 6 條 pipeline 之 target_load 節點設定，本文件 EQ 群組之唯一真實資料來源）+ `apps/api/src/database/migrations/mssql/1751884800000-MssqlBaselineSchema.ts`（`ob_emphire`/`ob_calendar`/`ob_arreturndf_min_cap`/`customer_core` 已建之真實 target 表 schema） |
| QA / Tester | 本文件 + `risks-and-gaps.md`（MSSQL P4c 風險段落） |
| DevOps / CI/CD | 本文件「零、測試環境與 Harness 設計」§0.2（`dbo` 佔用範圍第四度擴大提醒） |

---

## 零、測試環境與 Harness 設計

### 0.1 沿用 P4a/P4b 既有 Harness，additive 擴充

沿用 `mssql-env-preload.ts` + `_p4a-mssql-harness.ts`（`connectMssql`/`teardownMssql`/`uniqueLogId`/`tempName`/`makeRealCtx`）。`vi.setConfig({ testTimeout: 60000 })` 沿用。新增檔案建議命名：`dedup-handler.mssql.spec.ts`／`target-load-dedup.mssql.spec.ts`／`target-load-upsert.mssql.spec.ts`／`target-load-fullmode.mssql.spec.ts`／`target-load-partition.mssql.spec.ts`／`target-load-cleanup.mssql.spec.ts`，皆置於 `apps/api/src/modules/etl/engine/__tests__/`，加 `p4c-` 前綴；UNIT/STATIC/DISPATCH 另置 `p4c-mssql-unit.spec.ts`/`p4c-mssql-static.spec.ts`/`p4c-dispatch.spec.ts`（非 gated，CI 恆跑）。

### 0.2 `dbo` 佔用範圍第四度擴大（★ 本輪關鍵差異：真實既有 target 表首次被直接當作測試對象，而非僅來源端 fixture）

| 測試對象 | 資料落點 | 是否需要 `dbo` | 說明 |
|---|---|---|---|
| `dedup-handler.ts` 之輸入/輸出 | 全數 `##` 全域暫存表 | **否** | 與 P4a/P4b 之 `##` fixture 模式相同 |
| `target-load` customer_core UPSERT | `##` 輸入 + **真實 `dbo.customer_core`**（P4-0 已建，92 欄空表） | **是** | 每個測試案例須以 `source_customer_no` 唯一前綴避免互相污染，`afterEach` 清除本案例寫入之列（非清空整表——避免與其他並行套件互相干擾） |
| `target-load` fullMode 單一 PK 代表 | **真實 `dbo.ob_calendar`/`dbo.ob_emphire`/`dbo.ob_arreturndf_min_cap`**（皆為既有小型 baseline 表，2~13 欄） | **是** | 直接使用既有真實表（欄位少，可完整構造 fixture 列），`beforeEach`/`afterEach` 各自 TRUNCATE 清空（`fullMode` 本身語意即為全量替換，天然適合每案例獨立 TRUNCATE） |
| `target-load` fullMode composite PK 代表 | **合成 throwaway `dbo.tl_p4c_fixture_<hex>`**（僅 2~3 欄，PK=(`col_a`,`col_b`)，仿 `ob_pool_data` PK 形狀） | **是** | `ob_pool_data` 逾百欄不適合逐欄 fixture；以最小合成表驗證 composite PK dedup 邏輯本身，非驗證 `ob_pool_data` 完整欄位映射（該驗證留待 P4d） |
| `target-load` partition_replace 代表 | **合成 throwaway `dbo.tl_p4c_partition_<hex>`**（仿 `ob_pool_data_list` 之 `data_source` 分區欄 + PK 形狀） | **是** | 同上，逾百欄表不適合逐欄 fixture |
| `getPrimaryKeyColumns()`/`getColumns()`（真實 target 表） | `dbo` 既有/合成表之 catalog 內省 | **是** | 依附於上述表存在 |

**結論**：`dbo` 獨佔保留慣例第四度延伸（P1b2/P1b3 → P4-0/P4a → P4b → 本輪 P4c），且本輪首次直接對**真實既有生產 baseline 表**（`ob_calendar`/`ob_emphire`/`ob_arreturndf_min_cap`/`customer_core`）寫入測試資料而非僅合成 fixture——務必以顯著前綴（如 `_TEST_P4C_` 或特定 `source_customer_no`/PK 值域）隔離，`afterEach` 精準刪除本案例寫入列，**不得** `TRUNATE` 這些真實表（`ob_calendar`/`ob_emphire`/`ob_arreturndf_min_cap` 之 `fullMode` 測試除外——因其語意本就是全量替換，且此三表非其他既有測試套件之驗證對象，經查證 `mssql-p1b2`/`mssql-p1b3`/`mssql-p4-0` 系列僅驗證其存在性與型別，未寫入業務資料，TRUNCATE 安全）。此為既有已記錄風險（`R-MSSQL-P4A-05`/`R-MSSQL-P4B-06`）之第四度疊加，記入本文件風險段落，非阻擋。

### 0.3 Fixture 建構風格

- `##` fixture：`SELECT * INTO ##name FROM (VALUES (...),(...)) AS v(col1,col2,...)`（比照 P4a/P4b 既定寫法）。
- `dbo.tl_p4c_fixture_<hex>`/`dbo.tl_p4c_partition_<hex>`：`CREATE TABLE` + `INSERT`，`afterAll` `DROP TABLE`；隨機化尾碼命名避免跨套件碰撞（比照 P4a `raw_p4b_fixture_<hex>` 慣例）。
- **禁止**：以真實 customer_core/ob_pool_data 巨量資料作為輸入（P4c 為 handler 隔離驗證層，非 P4d 端對端）。

### 0.4 EQ（等價性）驗證方法論分層（沿用 P4a/P4b §0.4 精神）

1. **UNIT（mock QueryRunner，免真實連線，CI 恆常執行）**：SQL 文字方言關鍵字比對（`ROW_NUMBER()`/`IDENTITY`、`tempdb.sys.columns`、`INFORMATION_SCHEMA` 大寫、`CAST`/`TRY_CAST`、具名參數、**不得殘留 `ON CONFLICT`/`EXCLUDED`/`DISTINCT ON`**）。
2. **MSSQL EQ（真實連線，手算 oracle）**：dedup 三組真實 key 配置逐列比對；target-load 三種模式（UPSERT/fullMode/partition_replace）之新列/既有列/去重/冪等驗證。
3. **TRAP（陷阱佐證，比照 P4a `CAST-EQ-002`/P4b `ALTERCOL-TRAP-001` 精神）**：對本文件查證出的翻譯陷阱（naive `ROW_NUMBER` 無 tie-breaker、殘留 `ON CONFLICT`），以手動組裝之 naive SQL 字串對真實 MSSQL 執行，佐證風險確實存在或確實拋錯。

---

## 一、DEDUP — `dedup-handler.ts` tie-breaker 改寫（AD §4，I-MSSQL-DEDUP-TIEBREAK-01）

> **對應**：AD §4.1/§4.2/§4.3。三種真實 key 配置（d1 `CUSTO_NO`/`UPDATE_DATE`、d2 `CUSTID`/`U_SYSDT`、d3 `source_customer_no`/`source_updated_at`）皆須驗證。

### DEDUP-UNIT

### TS-MSSQL-P4C-DEDUP-UNIT-001：SQL 結構含 `IDENTITY(INT,1,1) AS _seq` + `INTO ##raw_<x>` 中繼表（AD §4.2）
- **Related Requirement**：AD §4.2；I-MSSQL-DEDUP-TIEBREAK-01
- **Test Type**：Positive / Unit

---

### TS-MSSQL-P4C-DEDUP-UNIT-002：`ROW_NUMBER() OVER(PARTITION BY <key> ORDER BY <ts> DESC, ..., _seq ASC)` 存在，`WHERE rn=1` 篩選
- **Related Requirement**：AD §4.2
- **Test Type**：Positive / Unit

---

### TS-MSSQL-P4C-DEDUP-UNIT-003：次要排序鍵 `CASE WHEN <ts> IS NULL THEN 1 ELSE 0 END` 存在（`NULLS LAST` 忠實翻譯，不依賴引擎預設 NULL 排序，比照 P4a `RESOLVE-002` 既定慣例）
- **Related Requirement**：AD §4.2「不依賴引擎 NULL 預設順序」
- **Test Type**：Positive / Unit

---

### TS-MSSQL-P4C-DEDUP-UNIT-004（查證發現，AD §3.2 未展開）：`getColumns()` 改用 `getMssqlTempTableColumns`（非 `information_schema.columns`）
- **Related Requirement**：I-MSSQL-TEMP-METADATA-01；同型 P4b `MERGE-UNIT-002` 發現
- **Test Type**：Positive / Unit

---

### TS-MSSQL-P4C-DEDUP-UNIT-005：`COUNT(*)::int` → `countMssqlTempTableRows`
- **Related Requirement**：AD §3.1 helper 共用
- **Test Type**：Positive / Unit

---

### TS-MSSQL-P4C-DEDUP-UNIT-006：雙引號識別碼（`keyColsSql`/`timestampColumn`）沿用（QUOTE-003 PASS 結論複用，不重測）
- **Related Requirement**：P4a `QUOTE-003`
- **Test Type**：Regression / Unit

---

### TS-MSSQL-P4C-DEDUP-UNIT-007：`##raw_<nodeId>_<logId8>`/`##dedup_<nodeId>_<logId8>` 兩張中繼表命名沿用 `makeTempTableName` 衍生規則，互不衝突
- **Related Requirement**：I-MSSQL-TEMPTABLE-GLOBAL-01
- **Test Type**：Positive / Unit

---

### DEDUP-TIEBREAK（🔴 核心決定性群組）

### TS-MSSQL-P4C-DEDUP-TIEBREAK-001（🔴 MUST-FIX）：同 key、`timestamp` 完全相同兩列，`_seq` 較小者（較早寫入 `##raw_`）決定性勝出
- **Related Requirement**：AD §4.1/§4.2；I-MSSQL-DEDUP-TIEBREAK-01
- **Test Type**：Positive / Integration — **DoD 核心案例**
- **Preconditions**：`##` 輸入含同 key 兩列，`timestamp` 值完全相同，其餘欄位值不同（可辨識來源）
- **Expected Result**：輸出恰一列，且為寫入 `##raw_` 順序較早（`_seq` 較小）之列的其餘欄位值；非隨機、多次重跑結果一致

---

### TS-MSSQL-P4C-DEDUP-TIEBREAK-002：同 key、`timestamp` 不同時，較新 `timestamp` 之列勝出，`_seq` 不介入決勝
- **Related Requirement**：AD §4.1 主要排序邏輯（`ORDER BY key, timestamp DESC`）
- **Test Type**：Positive / Integration

---

### TS-MSSQL-P4C-DEDUP-TIEBREAK-003：同 key 多列，`timestamp` 為 `NULL` 之列排序最後（不會被優先選中，除非同 key 全部皆 `NULL`）
- **Related Requirement**：AD §4.2「NULLS LAST」
- **Test Type**：Boundary / Integration

---

### TS-MSSQL-P4C-DEDUP-TIEBREAK-004：同 key 全部列 `timestamp` 皆為 `NULL` → `_seq` 決勝（NULL 情境下的 tie-breaker 仍需決定性）
- **Related Requirement**：AD §4.2；I-MSSQL-DEDUP-TIEBREAK-01
- **Test Type**：Boundary / Integration

---

### TS-MSSQL-P4C-DEDUP-TIEBREAK-005（§4.3 語意釐清落地案例）：驗證「決定性選出恰一列」而非要求與 PG 版選出「同一實體列」
- **Related Requirement**：AD §4.3（`ctid`/`_seq` 語意上是同一角色的忠實翻譯，非保證選出同一實體列）
- **Test Type**：Positive / Integration
- **Steps**：對同一組合成資料，分別跑 PG 版 `dedup-handler.ts` 與 MSSQL 版，比對兩者「輸出恰一列」「非輸出零列或多列」此一決定性性質，**不**斷言兩者輸出列的其餘欄位值必然相同
- **Expected Result**：兩版本皆決定性輸出恰一列；若剛好選出不同來源列（兩引擎執行計畫差異），依 AD §4.3 判定為已知、可解釋之低機率邊界差異，非 bug——此案例本身即為記錄該差異之機制，供 P4d 端對端若真實觸發時參照本案例之判定原則

---

### DEDUP-MSSQL（真實 MSSQL，三組真實 key 配置）

### TS-MSSQL-P4C-DEDUP-MSSQL-001（🔴 DoD 核心，仿 d1）：真實 MSSQL — `keyColumns=['CUSTO_NO']`/`timestampColumn='UPDATE_DATE'` 完整去重正確
- **Related Requirement**：I-MSSQL-ETL-EQ-01；真實資料驗證（customer_core d1 節點原樣配置）
- **Test Type**：Positive / Integration

---

### TS-MSSQL-P4C-DEDUP-MSSQL-002（🔴 DoD 核心，仿 d2）：真實 MSSQL — `keyColumns=['CUSTID']`/`timestampColumn='U_SYSDT'` 完整去重正確
- **Related Requirement**：I-MSSQL-ETL-EQ-01；真實資料驗證（customer_core d2 節點原樣配置）
- **Test Type**：Positive / Integration

---

### TS-MSSQL-P4C-DEDUP-MSSQL-003（🔴 DoD 核心，仿 d3）：真實 MSSQL — `keyColumns=['source_customer_no']`/`timestampColumn='source_updated_at'` 完整去重正確（本節點輸出直接餵入 target-load，見 §二/§三）
- **Related Requirement**：I-MSSQL-ETL-EQ-01；真實資料驗證（customer_core d3「最終去重」節點原樣配置）
- **Test Type**：Positive / Integration

---

### DEDUP-EQ（既有防禦邏輯回歸）

### TS-MSSQL-P4C-DEDUP-EQ-001：`keyColumns` 任一不存在於資料集 → 拋錯
- **Related Requirement**：既有防禦性驗證回歸
- **Test Type**：Negative / Integration

---

### TS-MSSQL-P4C-DEDUP-EQ-002：`timestampColumn` 不存在於資料集 → 拋錯
- **Related Requirement**：既有防禦性驗證回歸
- **Test Type**：Negative / Integration

---

### TS-MSSQL-P4C-DEDUP-EQ-003：`input.rowCount===0` → `emptyDataSet()` 短路，不建立任何 `##` 表
- **Related Requirement**：既有邊界行為回歸
- **Test Type**：Boundary / Integration

---

### TS-MSSQL-P4C-DEDUP-EQ-004：中文欄位值（如 `CUST_NAME`）於去重後正確 round-trip
- **Related Requirement**：I-MSSQL-COLLATE-01 延伸
- **Test Type**：Positive / Integration

---

### DEDUP-CLEANUP（§4.2 新增之額外中繼表，PG 版無此中繼概念）

### TS-MSSQL-P4C-DEDUP-CLEANUP-001：成功路徑 — `##raw_<x>`（中繼）與 `##dedup_<x>`（最終輸出，經 `NodeOutputStore` 追蹤）皆須有對應清理路徑
- **Related Requirement**：I-MSSQL-TEMPTABLE-CLEANUP-01
- **Test Type**：Positive / Integration
- **Expected Result**：`##raw_<x>` 於 handler 執行完畢後立即被清理（非留待 pipeline 層級收尾，因其從未透過 `DataSet.tempTable` 對外暴露）；`##dedup_<x>` 透過既有 `NodeOutputStore.cleanupAll()` 機制清理（與 P4a/P4b 其餘 handler 同型）

---

### TS-MSSQL-P4C-DEDUP-CLEANUP-002：失敗路徑（如 `rn` 篩選前之 `ROW_NUMBER` 陳述式因型別問題拋錯）— `##raw_<x>` 不殘留
- **Related Requirement**：I-MSSQL-TEMPTABLE-CLEANUP-01「成功/失敗兩路徑」
- **Test Type**：Negative / Integration

---

## 二、TLDEDUP — `target-load-handler.ts` 內部未記載之 `DISTINCT ON` 站點（🔴🔴 本文件最高風險之一，AD 完全未提及）

> **對應**：查證發現 1。涵蓋 `fullMode` PK dedup（`SELECT DISTINCT ON(${pkColList})...`）與 customer_core UPSERT 之 `source_customer_no` dedup（`SELECT DISTINCT ON("source_customer_no")...`）兩處。**`partition_replace` 路徑不含任何 `DISTINCT ON`，本群組不適用該路徑**（見查證發現 2 之程式碼路徑確認）。

### TS-MSSQL-P4C-TLDEDUP-UNIT-001（🔴🔴 MUST-FIX）：`fullMode` PK dedup 之 `ROW_NUMBER` 翻譯須含顯式決定性 tie-breaker，不得僅 `PARTITION BY <pk> ORDER BY <pk>`
- **Related Requirement**：查證發現 1；比照 I-MSSQL-DEDUP-TIEBREAK-01 之設計精神（該不變式字面雖僅提及「Dedup 邏輯」，本站點屬同型風險）
- **Test Type**：Negative / Unit — 對「逐字複製、無額外排序鍵」之實作預期為紅燈
- **Expected Result**：SQL 結構含類似 §4.2 `_seq` 之顯式序列捕捉鍵（如另一 `IDENTITY(INT,1,1)` 或等價機制），`ORDER BY` 子句除 PK 欄位外另含此決定性鍵；**不得**是 `ROW_NUMBER() OVER(PARTITION BY pk_a, pk_b ORDER BY pk_a, pk_b)` 之樸素形式（該形式對同 PK 值之多列，勝出列依查詢計畫而定，非決定性）

---

### TS-MSSQL-P4C-TLDEDUP-UNIT-002（🔴🔴 MUST-FIX）：customer_core UPSERT 之 `source_customer_no` dedup 同理須含顯式 tie-breaker
- **Related Requirement**：查證發現 1（PG 原始碼註解明確承認 TRIM 正規化碰撞為真實情境，非理論風險）
- **Test Type**：Negative / Unit
- **Expected Result**：同 `TLDEDUP-UNIT-001`，`ORDER BY` 除 `source_customer_no` 外另含顯式決定性鍵

---

### TS-MSSQL-P4C-TLDEDUP-UNIT-003：兩處 tie-breaker 機制之設計精神須與 §一 DEDUP 之 `_seq IDENTITY` 手法一致（同一「捕捉寫入序」哲學，避免專案內並存兩套不同的 tie-break 手法）
- **Related Requirement**：一致性/可維護性，非功能性正確性要求
- **Test Type**：Positive / Unit — 交叉驗證

---

### TS-MSSQL-P4C-TLDEDUP-GATE-001（🔴 決策關卡，不預設實作位置，比照 P4b `ALTERCOL-GATE-001` 精神）：兩處 tie-breaker 之具體命名/實作細節不預設，但須於 impl log 明確記錄
- **Related Requirement**：查證發現 1（AD/任務書皆未提及此站點，機制本身無先例）
- **Test Type**：Decision Gate（文件化守門）
- **Expected Result**：impl log 之 Architectural Decisions 段落須記錄：(a) 兩處各自採用何種決定性鍵捕捉手法；(b) 是否與 §一 DEDUP 之 `_seq` 共用同一組 helper 或各自獨立實作；若未記錄，本案例判定失敗

---

### TS-MSSQL-P4C-TLDEDUP-MSSQL-001（🔴 DoD 核心）：真實 MSSQL — `fullMode` PK dedup 對合成重複 PK 資料之決定性驗證（composite PK，仿 `ob_pool_data`）
- **Related Requirement**：查證發現 1；I-MSSQL-ETL-EQ-01
- **Test Type**：Positive / Integration
- **Preconditions**：`##` 輸入含 3 列，其中 2 列 `(pk_a, pk_b)` 相同但其餘欄位值不同
- **Expected Result**：去重後恰餘 2 個相異 PK 各一列；同 PK 之列決定性選出固定一列，多次重跑結果一致

---

### TS-MSSQL-P4C-TLDEDUP-MSSQL-002（🔴 DoD 核心）：真實 MSSQL — customer_core `source_customer_no` dedup 對合成重複資料之決定性驗證
- **Related Requirement**：查證發現 1；I-MSSQL-ETL-EQ-01
- **Test Type**：Positive / Integration

---

### TS-MSSQL-P4C-TLDEDUP-MSSQL-003：連續對同一輸入重跑兩處 dedup 各 3 次，結果皆穩定一致（決定性回歸，非僅單次驗證）
- **Related Requirement**：查證發現 1 — 決定性非僅「某次執行恰好一致」
- **Test Type**：Positive / Integration

---

### TS-MSSQL-P4C-TLDEDUP-EQ-001（🔴 旗艦案例，PG 原始碼註解明確承認之真實碰撞情境）：TRIM 正規化碰撞——`'A12345 '` 與 `'A12345'` 兩列（其餘欄位值不同）去重後僅存一列，且值可決定性預測
- **Related Requirement**：查證發現 1；PG 版註解「handles collisions caused by `NULLIF(TRIM())` normalization」
- **Test Type**：Positive / Integration — **DoD 核心案例**
- **Preconditions**：上游 dedup（d3）已放行兩列（因原始字串不同，d3 視為不同 key），`source_customer_no` 分別為 `'A12345 '`（含尾端空白）與 `'A12345'`
- **Expected Result**：target-load 內部 TRIM 正規化後兩列 key 值相同（`'A12345'`），dedup 後僅寫入 customer_core 一列；勝出列之其餘欄位值依 `TLDEDUP-GATE-001` 裁定之決定性鍵可預測，非隨機

---

### TS-MSSQL-P4C-TLDEDUP-EQ-002：composite PK（`orgno`+`appl_no`）之 `fullMode` dedup，`PARTITION BY` 須同時涵蓋兩欄位
- **Related Requirement**：查證發現 2（`ob_pool_data` 為 composite PK 真實案例）
- **Test Type**：Positive / Integration
- **Preconditions**：4 列資料，`(orgno='01', appl_no='X')` 重複 2 次，`(orgno='01', appl_no='Y')`/`(orgno='02', appl_no='X')` 各 1 次（後兩者 `appl_no` 相同但 `orgno` 不同，驗證非誤判為同一 PK）
- **Expected Result**：去重後 3 列（非 2 列——`orgno` 不同不可誤併）

---

### TS-MSSQL-P4C-TLDEDUP-EQ-003：無碰撞情境（全部列 key 唯一）— dedup 不誤刪任何列（防呆對照組）
- **Related Requirement**：既有邊界行為回歸
- **Test Type**：Boundary / Integration

---

### TS-MSSQL-P4C-TLDEDUP-TRAP-001（🔴 陷阱佐證，論證型，非必然可重現）：naive `ROW_NUMBER() OVER(PARTITION BY pk ORDER BY pk)`（無額外 tie-breaker）之非決定性風險
- **Related Requirement**：查證發現 1 — 佐證 `TLDEDUP-UNIT-001/002` 之必要性
- **Test Type**：Negative / Integration — 陷阱佐證（**待 tdd-impl 真庫驗證**：本案例之「非決定性」本質上難以在單一測試執行中穩定重現，需以文件形式記錄 SQL Server 官方文件對 `ORDER BY` 排序鍵存在相同值時之行為未定義原則作為佐證依據，若真實環境測試多次執行皆得到一致結果，**不可**因此反向斷言該 SQL 形式「其實是安全的」——只能證明本次測試環境查詢計畫恰好穩定，非語意保證）
- **Steps**：對含重複 key 之合成資料，手動組裝樸素 `ROW_NUMBER() OVER(PARTITION BY pk ORDER BY pk)` SQL 執行多次（如 20 次），記錄「勝出列」是否每次相同
- **Expected Result**：記錄實測結果（無論一致或不一致皆記錄），作為佐證 `TLDEDUP-UNIT-001/002` MUST-FIX 案例正當性之依據，而非作為獨立通過/失敗判定

---

## 三、UPSERT — customer_core 兩段式 `UPDATE...FROM`+`INSERT...WHERE NOT EXISTS`（AD §5.1）

> **對應**：AD §5.1。上游已含 §一 DEDUP（d3）+ §二 TLDEDUP（source_customer_no dedup）+ NULLIF(TRIM()) 正規化（§八 LITERAL）；本節專注兩段式 UPSERT 陳述式本身。

### UPSERT-UNIT

### TS-MSSQL-P4C-UPSERT-UNIT-001（🔴 MUST-FIX）：不得殘留 `ON CONFLICT`/`DO UPDATE SET`/`EXCLUDED` 字面
- **Related Requirement**：AD §5.1
- **Test Type**：Negative / Unit

---

### TS-MSSQL-P4C-UPSERT-UNIT-002：兩段式結構存在——`UPDATE ... FROM customer_core tgt JOIN #dedup src ON ...` + 獨立 `INSERT ... WHERE NOT EXISTS`
- **Related Requirement**：AD §5.1
- **Test Type**：Positive / Unit

---

### TS-MSSQL-P4C-UPSERT-UNIT-003：`UPDATE` 段之 `SET` 子句正確對應原 `EXCLUDED.col` 語意（改為直接引用來源別名，如 `src.col`），逐欄位無遺漏
- **Related Requirement**：AD §5.1（MSSQL 無 `EXCLUDED` 虛擬表，需直接引用 JOIN 來源別名）
- **Test Type**：Positive / Unit

---

### TS-MSSQL-P4C-UPSERT-UNIT-004：ghost gate `LENGTH(TRIM(...))` → `LEN(TRIM(...))`
- **Related Requirement**：AD §5.3 延伸（字串函式方言）
- **Test Type**：Positive / Unit

---

### TS-MSSQL-P4C-UPSERT-UNIT-005：`notNullTargetCols` 之 catalog 查詢改用 `INFORMATION_SCHEMA.COLUMNS`（大寫）+ `IS_NULLABLE` + 具名參數
- **Related Requirement**：I-MSSQL-CATALOG-CASE-01；AD §5.2 Pattern B
- **Test Type**：Positive / Unit

---

### UPSERT-TRAP

### TS-MSSQL-P4C-UPSERT-TRAP-001（🔴 陷阱佐證）：對真實 MSSQL 執行含字面 `ON CONFLICT("source_customer_no") DO UPDATE SET ...` 之 naive SQL，確實拋語法錯誤
- **Related Requirement**：佐證 `UPSERT-UNIT-001` 之必要性
- **Test Type**：Negative / Integration — 陷阱佐證（手動組裝 SQL，非呼叫 handler）

---

### UPSERT-EQ（真實 MSSQL）

### TS-MSSQL-P4C-UPSERT-EQ-001（🔴 DoD 核心）：新列（`source_customer_no` 不存在於 target）→ `INSERT` 成功，全部欄位值正確
- **Related Requirement**：AD §9 P4c DoD「新增列」；I-MSSQL-ETL-EQ-01
- **Test Type**：Positive / Integration

---

### TS-MSSQL-P4C-UPSERT-EQ-002（🔴 DoD 核心）：既有列（`source_customer_no` 已存在）→ `UPDATE` 正確，`customer_id`（PK）與 `source_customer_no`（唯一鍵，`excludeFromUpdate`）不被覆寫
- **Related Requirement**：AD §9 P4c DoD「既有列更新」；I-MSSQL-ETL-EQ-01
- **Test Type**：Positive / Integration

---

### TS-MSSQL-P4C-UPSERT-EQ-003（🔴 DoD 核心）：ghost gate 排除過短 `source_customer_no`（`LEN(TRIM(...))<5`）
- **Related Requirement**：AD §9 P4c DoD「ghost gate 條件」
- **Test Type**：Boundary / Integration

---

### TS-MSSQL-P4C-UPSERT-EQ-004：NOT NULL 目標欄位（如 `customer_type_code`/`name`）為 `null` → 整列排除，不影響其餘合法列（防止整批 `INSERT` 因單列違反 `NOT NULL` 而 rollback）
- **Related Requirement**：既有邏輯回歸（2026-05-29 復原之必填欄守門，PG 版註解明確記錄之教訓）
- **Test Type**：Negative / Integration

---

### TS-MSSQL-P4C-UPSERT-EQ-005（🔴 DoD 核心，冪等）：同一輸入跑兩次 → 第二次執行不新增列，欄位值不重複疊加（純覆寫語意）
- **Related Requirement**：AD §9 P4c DoD「冪等」
- **Test Type**：Positive / Integration

---

### TS-MSSQL-P4C-UPSERT-EQ-006：`_etl_loaded_at`/`_etl_pipeline_id` 系統字面值 cast 正確寫入（`CAST(...AS datetime2)`/`CAST(...AS uniqueidentifier)`）
- **Related Requirement**：查證發現 8；§八 LITERAL
- **Test Type**：Positive / Integration

---

### TS-MSSQL-P4C-UPSERT-EQ-007：中文欄位值（`name`/`company_name`/`education_desc` 等）UPSERT 後正確 round-trip
- **Related Requirement**：I-MSSQL-COLLATE-01 延伸
- **Test Type**：Positive / Integration

---

## 四、FULLMODE — TRUNCATE + 批次 INSERT（🔴🔴 AD/任務書皆完全未提及，本文件擴大範圍，4 個真實 pipeline 依賴）

> **對應**：查證發現 2/3。真實 `ob_arreturndf_min_cap`/`ob_calendar`/`ob_emphire`（單欄 PK）/`ob_pool_data`（composite PK）四條 pipeline 之 `target_load` 節點 `fullMode:true`。

### FULLMODE-UNIT

### TS-MSSQL-P4C-FULLMODE-UNIT-001（🔴，查證發現 3，AD 完全未提及）：`getPrimaryKeyColumns()` 改用 `INFORMATION_SCHEMA.TABLE_CONSTRAINTS`/`INFORMATION_SCHEMA.KEY_COLUMN_USAGE`（大寫）JOIN + 具名參數
- **Related Requirement**：查證發現 3；I-MSSQL-CATALOG-CASE-01；AD §5.2 Pattern B
- **Test Type**：Positive / Unit
- **Expected Result**：SQL 含大寫 `INFORMATION_SCHEMA.TABLE_CONSTRAINTS`/`INFORMATION_SCHEMA.KEY_COLUMN_USAGE`；**不得**出現小寫 `information_schema`

---

### TS-MSSQL-P4C-FULLMODE-UNIT-002：PK 查詢依 `ordinal_position`（或等價 MSSQL 欄位）排序，確保 composite PK 順序正確
- **Related Requirement**：查證發現 2（`ob_pool_data` PK=`orgno`+`appl_no`，順序有意義）
- **Test Type**：Positive / Unit

---

### TS-MSSQL-P4C-FULLMODE-UNIT-003：`TRUNCATE TABLE` 語法沿用（ANSI 相容確認，無需改寫）
- **Related Requirement**：既有邏輯回歸
- **Test Type**：Regression / Unit

---

### TS-MSSQL-P4C-FULLMODE-UNIT-004：單條 `INSERT...SELECT`（`columnList`）語法沿用（無 dialect 轉換需求，確認雙引號識別碼複用 QUOTE-003）
- **Related Requirement**：既有邏輯回歸；P4a `QUOTE-003`
- **Test Type**：Regression / Unit

---

### FULLMODE-MSSQL（真實 target 表）

### TS-MSSQL-P4C-FULLMODE-MSSQL-001（🔴 DoD 核心，單一 PK 代表，真實 `ob_calendar` 或 `ob_emphire`）：無重複列時 `TRUNCATE`+`INSERT` 正確，列數/欄位值相符
- **Related Requirement**：查證發現 2；I-MSSQL-ETL-EQ-01
- **Test Type**：Positive / Integration

---

### TS-MSSQL-P4C-FULLMODE-MSSQL-002（🔴 旗艦，composite PK，合成 `dbo.tl_p4c_fixture_<hex>` 仿 `ob_pool_data` PK 形狀）：PK dedup（§二 TLDEDUP）+ `TRUNCATE`+`INSERT` 正確處理 composite key 重複列
- **Related Requirement**：查證發現 2；§二 TLDEDUP-EQ-002 之落地整合驗證
- **Test Type**：Positive / Integration — **DoD 核心案例**

---

### FULLMODE-EQ

### TS-MSSQL-P4C-FULLMODE-EQ-001：PK 無重複 → 全部列原樣寫入，順序/值皆正確
- **Related Requirement**：I-MSSQL-ETL-EQ-01
- **Test Type**：Positive / Integration

---

### TS-MSSQL-P4C-FULLMODE-EQ-002：PK 重複（模擬來源端無 PK constraint 之髒資料）→ 去重後僅寫入 dedup 後列數，總數符合預期（不因 `INSERT` 內部撞 PK 而整批失敗）
- **Related Requirement**：既有邏輯回歸（PG 版註解「防禦性 PK 去重」之設計動機）
- **Test Type**：Positive / Integration

---

### TS-MSSQL-P4C-FULLMODE-EQ-003（真實 `ob_arreturndf_min_cap` NOT NULL 欄位案例）：`_cdmp_extracted_at` 等 ETL tracking 欄位於 target 有此欄但 input 未帶時，正確自動補值（非違反 `NOT NULL` 拋錯）
- **Related Requirement**：既有邏輯回歸（`fillCdmpExtractedAt` 分支）；`ob_arreturndf_min_cap._cdmp_extracted_at` 為真實 NOT NULL 欄位
- **Test Type**：Positive / Integration

---

### TS-MSSQL-P4C-FULLMODE-EQ-004：重跑（`TRUNCATE` 語意）→ 第二次執行後表內容為新輸入完全覆蓋，非疊加於前次結果
- **Related Requirement**：既有邏輯回歸（`fullMode` 全量替換語意）
- **Test Type**：Positive / Integration

---

### FULLMODE-REG

### TS-MSSQL-P4C-FULLMODE-REG-001：`input.rowCount===0` → `emptyDataSet()` 短路，不執行 `TRUNCATE`（既有邊界行為回歸，避免空輸入意外清空既有生產資料）
- **Related Requirement**：既有邊界行為回歸（🔴 高重要性——此為防止「上游異常回傳 0 列」意外清空 target 表之安全網）
- **Test Type**：Boundary / Integration

---

## 五、PARTITION — `loadMode='partition_replace'`（🔴 AD/任務書皆完全未提及，1 個真實 pipeline：`ob_pool_data_list`）

> **對應**：查證發現 2。本群組**不含**任何 `DISTINCT ON`/tie-breaker 站點（程式碼路徑確認：`partition_replace` 分支不呼叫 `getPrimaryKeyColumns`，不建立 dedup 中繼表）。

### PARTITION-UNIT

### TS-MSSQL-P4C-PARTITION-UNIT-001：`DELETE FROM target WHERE "<partitionColumn>" = '<value>'` 語法沿用（ANSI 相容確認）
- **Related Requirement**：既有邏輯回歸
- **Test Type**：Regression / Unit

---

### TS-MSSQL-P4C-PARTITION-UNIT-002：`INSERT...SELECT` 含字面 `partitionValue` 附加欄位（`SELECT ..., '<value>' AS "<partitionColumn>"`）語法沿用
- **Related Requirement**：既有邏輯回歸
- **Test Type**：Regression / Unit

---

### TS-MSSQL-P4C-PARTITION-UNIT-003：`partitionColumn`/`partitionValue` 未設定 → 拋錯（既有防禦回歸）
- **Related Requirement**：既有防禦性驗證回歸
- **Test Type**：Negative / Unit

---

### PARTITION-MSSQL

### TS-MSSQL-P4C-PARTITION-MSSQL-001（🔴 DoD 核心，合成 `dbo.tl_p4c_partition_<hex>` 仿 `ob_pool_data_list` `data_source` 分區欄）：僅刪除/覆寫指定分區值之列，其餘分區列不受影響
- **Related Requirement**：查證發現 2；I-MSSQL-ETL-EQ-01
- **Test Type**：Positive / Integration — **DoD 核心案例**
- **Preconditions**：既有表含 `data_source='monthly_run'` 與 `data_source='etl_load'` 兩種分區列各數列
- **Expected Result**：執行後 `data_source='monthly_run'` 之列完全不變；`data_source='etl_load'` 之列被新輸入完全取代

---

### PARTITION-EQ

### TS-MSSQL-P4C-PARTITION-EQ-001：重跑同分區 → 該分區列數為新輸入列數（非疊加），其他分區列數不變
- **Related Requirement**：既有邏輯回歸（partition-replace 語意）
- **Test Type**：Positive / Integration

---

### TS-MSSQL-P4C-PARTITION-EQ-002：`escapedPartitionValue` 單引號逸出正確（分區值含單引號情境防注入回歸，兩 dialect 皆用標準 `''` 逸出，非新增風險但需確認一致）
- **Related Requirement**：既有邏輯回歸
- **Test Type**：Boundary / Integration

---

## 六、CATALOG — 欄位/型別/NOT NULL/PK 內省方言轉換（跨三種模式共用之 catalog 站點）

### TS-MSSQL-P4C-CATALOG-UNIT-001：`getColumns()` 對「`##` 輸入暫存表」呼叫改用 `getMssqlTempTableColumns`（I-MSSQL-TEMP-METADATA-01）
- **Related Requirement**：查證發現 4；I-MSSQL-TEMP-METADATA-01
- **Test Type**：Positive / Unit

---

### TS-MSSQL-P4C-CATALOG-UNIT-002：`getColumns()` 對「真實 target 表」（`customer_core`/`ob_*` 等 `dbo` 表）呼叫改用 `INFORMATION_SCHEMA.COLUMNS`（大寫）+ 具名參數
- **Related Requirement**：查證發現 4；I-MSSQL-CATALOG-CASE-01
- **Test Type**：Positive / Unit
- **Expected Result**：**不得**對真實 target 表誤用 `getMssqlTempTableColumns`（該 helper 僅對 `tempdb` 物件正確，對 `dbo` 實體表查詢 `tempdb.sys.columns` 會恆回傳空集合，此為靜默錯誤而非拋錯，風險等級高於直覺）

---

### TS-MSSQL-P4C-CATALOG-GATE-001（🔴 決策關卡，查證發現 5）：`inputColumnTypes`/`varcharColumns` 判斷所需之 `data_type` 資訊，既有共用 helper `MssqlTempTableColumn{name,columnId}` 不含此欄位
- **Related Requirement**：查證發現 5
- **Test Type**：Decision Gate（文件化守門）
- **Expected Result（兩分支皆可接受，但須記錄）**：
  - **選項甲**：additive 擴充既有 `getMssqlTempTableColumns`/`MssqlTempTableColumn` 型別，新增 `dataType` 欄位（`tempdb.sys.columns` JOIN `sys.types`），供全部既有呼叫端（P4a/P4b 已完成之 5+2 個 handler）與本輪 target-load 共用，**不得**破壞既有欄位語意（`STATIC-003` 落地驗收）。
  - **選項乙**：target-load-handler-mssql.ts 內另寫專屬查詢（不修改共用 helper）。
  - 若 impl log 之 Architectural Decisions 段落未記錄選擇，本案例判定失敗

---

### TS-MSSQL-P4C-CATALOG-UNIT-003：`varcharColumns` 判斷之 MSSQL `data_type` 字面值集合（`'varchar'`/`'nvarchar'`/`'char'`/`'nchar'`/`'text'`/`'ntext'`），對照 PG 版 `'character varying'`/`'text'`/`'character'`
- **Related Requirement**：查證發現 5；AD §5.3 型別對照原則延伸
- **Test Type**：Positive / Unit

---

### TS-MSSQL-P4C-CATALOG-UNIT-004：target 表存在性檢查改用 `INFORMATION_SCHEMA.TABLES`（大寫）+ 具名參數（沿用 P4a `EXTRACT-UNIT-002`/P4b `RESOLVE-003` 既定模式）
- **Related Requirement**：I-MSSQL-CATALOG-CASE-01；既定模式複用
- **Test Type**：Positive / Unit

---

### TS-MSSQL-P4C-CATALOG-MSSQL-001：真實 MSSQL — `notNullTargetCols` 查詢之 `is_nullable`（小寫 SQL 字面）可正確繫結至 `IS_NULLABLE`（沿用 QUOTE-003 附帶查證「欄位名大小寫不敏感」結論，本站點個別重新確認，非假設沿用）
- **Related Requirement**：查證發現 4；P4a `QUOTE-003` 附帶查證
- **Test Type**：Positive / Integration — 個別重新確認（**待 tdd-impl 真庫驗證**，不可僅憑 P4a 對他站點之結論直接斷言本站點必然相同）

---

## 七、CLEANUP — target-load 內部暫存表清理獨立責任（🔴 AD/P4a `CLEANUP-003` 機制未覆蓋，本文件新查證）

> **對應**：查證發現 6。`NodeOutputStore.cleanupAll()`（P4a `CLEANUP-003` 之掛載機制）僅清理透過 `DataSet.tempTable` 對外暴露、被 `NodeOutputStore.set()` 註冊過的表；target-load 回傳 `{ tempTable: '', rowCount }`，其內部 `tempTable`（enriched）與 `dedupTable` 從未註冊，**該機制天生不覆蓋這兩張表**。

### TS-MSSQL-P4C-CLEANUP-UNIT-001（🔴 MUST-FIX）：內部 `tempTable`（enriched）建立後，成功路徑必有對應 `dropMssqlTempTableIfExists` 呼叫
- **Related Requirement**：查證發現 6；I-MSSQL-TEMPTABLE-CLEANUP-01
- **Test Type**：Positive / Unit（黑盒 spy）

---

### TS-MSSQL-P4C-CLEANUP-UNIT-002（🔴 MUST-FIX）：`dedupTable`（`fullMode`/UPSERT 兩處建立時）同樣必有對應清理呼叫
- **Related Requirement**：查證發現 6；I-MSSQL-TEMPTABLE-CLEANUP-01
- **Test Type**：Positive / Unit（黑盒 spy）

---

### TS-MSSQL-P4C-CLEANUP-GATE-001（🔴 決策關卡）：`target-load-handler-mssql.ts` 不得依賴 `NodeOutputStore.cleanupAll()` 清理其內部暫存表，須自行 `try/finally` 管理，impl log 須明確記錄「本 handler 不依賴 pipeline 層級清理」此一事實
- **Related Requirement**：查證發現 6
- **Test Type**：Decision Gate（文件化守門）
- **Expected Result**：impl log 之 Architectural Decisions 段落須明確記錄此一與 P4a/P4b 其餘 8 個 handler 不同的清理責任模型（其餘 8 個 handler 皆透過 `DataSet.tempTable` 交由 `NodeOutputStore` 統一收斂；target-load 為唯一例外）；若未記錄，本案例判定失敗

---

### TS-MSSQL-P4C-CLEANUP-MSSQL-001：真實 MSSQL — UPSERT 路徑正常完成後，`tempdb` 內 enriched `tempTable`/`dedupTable` 皆不殘留
- **Related Requirement**：I-MSSQL-TEMPTABLE-CLEANUP-01
- **Test Type**：Positive / Integration

---

### TS-MSSQL-P4C-CLEANUP-MSSQL-002（🔴）：真實 MSSQL — UPSERT 階段人為觸發失敗（如刻意令 `INSERT` 違反 NOT NULL 或型別轉換錯誤），確認失敗路徑下 enriched `tempTable`/`dedupTable` 仍被清理，不洩漏至 `tempdb`
- **Related Requirement**：查證發現 6；I-MSSQL-TEMPTABLE-CLEANUP-01「成功/失敗兩路徑」
- **Test Type**：Negative / Integration

---

## 八、LITERAL — 系統產生字面值 cast + ghost gate 轉換（AD §5.3 延伸，非 Pattern B `$n` 站點）

### TS-MSSQL-P4C-LITERAL-UNIT-001：`'${etlLoadedAt}'::TIMESTAMP` → `CAST('...' AS datetime2)`
- **Related Requirement**：查證發現 8；AD §5.3（內部產生、型別已知必然合法 → `CAST` 而非 `TRY_CAST`）
- **Test Type**：Positive / Unit

---

### TS-MSSQL-P4C-LITERAL-UNIT-002：`'${etlPipelineId}'::UUID` → `CAST('...' AS uniqueidentifier)`
- **Related Requirement**：查證發現 8
- **Test Type**：Positive / Unit

---

### TS-MSSQL-P4C-LITERAL-UNIT-003：ghost gate `LENGTH(TRIM(...))`→`LEN(TRIM(...))` 全站點無遺漏殘留（交叉確認 `UPSERT-UNIT-004` 已涵蓋之單站點外，全檔案 regex 掃描）
- **Related Requirement**：AD §5.3 延伸
- **Test Type**：Static

---

### TS-MSSQL-P4C-LITERAL-UNIT-004：`NULLIF(TRIM(col), '')` 結構原樣保留（ANSI 相容確認，不需改寫）
- **Related Requirement**：既有邏輯回歸
- **Test Type**：Regression / Unit

---

### TS-MSSQL-P4C-LITERAL-UNIT-005：字面值單引號逸出（`.replace(/'/g,"''")`）邏輯兩 dialect 通用，不需改寫
- **Related Requirement**：既有邏輯回歸
- **Test Type**：Regression / Unit

---

## 九、DISPATCH — `createDispatcher()` 終於接上 `DB_TYPE` 分支（🔴 P4c 落地 P4a/P4b 延後之決議）

### TS-MSSQL-P4C-DISPATCH-001（🔴 MUST-FIX，DoD 核心）：`createDispatcher()` 依 `DB_TYPE==='mssql'` 分支，9 個 handler（含本輪 `DedupHandlerMssql`/`TargetLoadHandlerMssql`）全數二選一註冊
- **Related Requirement**：AD §1.2；P4a `DISPATCH-001`/P4b `DISPATCH-002` 決議之落地時機
- **Test Type**：Positive / Unit（黑盒，驗證 `dispatcher.register` 呼叫參數之 `nodeType` 集合與各自對應之 mssql/pg class）
- **Expected Result**：`DB_TYPE='mssql'` 時 9 次 `register` 呼叫皆為對應之 `*HandlerMssql` 實例；`DB_TYPE` 非 `'mssql'`（含 `'postgres'`/`'sqlite'`/未設定）時維持原 9 個 PG handler 不變

---

### TS-MSSQL-P4C-DISPATCH-002：`DedupHandlerMssql.nodeType==='dedup'`、`TargetLoadHandlerMssql.nodeType==='target_load'`，與 PG 版逐一比對相等
- **Related Requirement**：`NodeExecutor.nodeType` 介面契約
- **Test Type**：Positive / Unit

---

### TS-MSSQL-P4C-DISPATCH-003（🔴）：`ConfigService` 注入 + `DB_TYPE` 判斷須沿用既有 `app.module.ts`/`data-source.ts` 已建立之 `configService.get<string>('DB_TYPE', 'sqlite')` 慣例，非另創獨立判斷邏輯
- **Related Requirement**：查證發現 7；一致性
- **Test Type**：Static — regex/AST 掃描 `etl-pipeline-execution.service.ts` 內 `DB_TYPE` 讀取方式

---

### TS-MSSQL-P4C-DISPATCH-004：`sqlite`/未設定 `DB_TYPE` → 沿用 PG handler（預設分支不變，既有行為不回歸）
- **Related Requirement**：既有邏輯回歸
- **Test Type**：Regression / Unit

---

## 十、REG — 回歸

### TS-MSSQL-P4C-REG-001：`tsc --noEmit -p tsconfig.build.json` 乾淨（DoD 紅線）
- **Related Requirement**：AD §9 P4c DoD
- **Test Type**：Static Gate

---

### TS-MSSQL-P4C-REG-002：`dedup-handler.ts`/`target-load-handler.ts`（PG 原始檔）逐位元組未變
- **Related Requirement**：AD §1.2「postgres 分支完全不動，cutover 前零風險」
- **Test Type**：Static / Regression

---

### TS-MSSQL-P4C-REG-003：既有 PG 版 `engine-node-executors.spec.ts`/`engine-core.spec.ts`（含 dedup/target_load 案例）全數不回歸
- **Related Requirement**：既有測試套件回歸
- **Test Type**：Regression

---

### TS-MSSQL-P4C-REG-004：P4a/P4b 全部套件（含 `temp-table.util.ts` 既有簽章、`resolve-raw-table-mssql.ts`）不回歸
- **Related Requirement**：additive 擴充未破壞既有簽章（含 `CATALOG-GATE-001` 若選擇擴充 helper 之情境）
- **Test Type**：Regression

---

### TS-MSSQL-P4C-REG-005：sqlite 測試路徑不受影響
- **Related Requirement**：三 driver 並存回歸
- **Test Type**：Regression

---

## 十一、STATIC — 靜態守門

### TS-MSSQL-P4C-STATIC-001：`dedup-handler-mssql.ts`/`target-load-handler-mssql.ts` 存在於 `apps/api/src/modules/etl/engine/handlers/` 目錄（命名鎖定）
- **Related Requirement**：AD §1.2 命名慣例
- **Test Type**：Static

---

### TS-MSSQL-P4C-STATIC-002（🔴 呼應 UPSERT/TLDEDUP 群組）：`target-load-handler-mssql.ts` 原始碼零 `ON CONFLICT`/`EXCLUDED`/`DISTINCT ON`（大寫或小寫）字面命中
- **Related Requirement**：`UPSERT-UNIT-001`/`TLDEDUP-UNIT-001/002` 落地驗收
- **Test Type**：Static

---

### TS-MSSQL-P4C-STATIC-003：`temp-table.util.ts` 既有函式簽章未被破壞性覆寫（additive-only 紀律；若 `CATALOG-GATE-001` 選擇擴充 `MssqlTempTableColumn`，僅允許新增欄位，不得移除/改變既有 `name`/`columnId` 語意）
- **Related Requirement**：additive-only 紀律（P4a impl log 明文要求）
- **Test Type**：Static

---

### TS-MSSQL-P4C-STATIC-004（🔴 DoD 核心）：`createDispatcher()` 原始碼含 `DB_TYPE` 分支且 9 個 handler 皆有對應 mssql 分支（`DISPATCH-001` 落地驗收）
- **Related Requirement**：`DISPATCH-001` 落地驗收
- **Test Type**：Static

---

### TS-MSSQL-P4C-STATIC-005：`dedup-handler-mssql.ts`/`target-load-handler-mssql.ts` 原始碼零 `information_schema`（小寫）命中
- **Related Requirement**：I-MSSQL-CATALOG-CASE-01
- **Test Type**：Static

---

## 風險與發現彙整（詳細已同步至 `risks-and-gaps.md`）

1. **🔴🔴 `target-load-handler.ts` 服務範圍遠超 customer_core（查證發現 2）**——真實 `etl-pipelines.json` 顯示同一 handler 被 6 條 pipeline 共用，AD §5.1/§9 P4c DoD 僅描述 customer_core UPSERT 一種路徑，`fullMode`（4 條 pipeline）與 `partition_replace`（1 條 pipeline）完全未被提及。本文件已擴大範圍新增 §四 FULLMODE（11 案例）+ §五 PARTITION（6 案例），否則 cutover 後這 5 條既有生產 pipeline 在 MSSQL 上會 100% 失敗且無任何既定測試攔截。
2. **🔴🔴 `target-load-handler.ts` 內部另有兩處未記載的 `DISTINCT ON` 去重站點（查證發現 1）**——與 AD §4/I-MSSQL-DEDUP-TIEBREAK-01 所述 `dedup-handler.ts` 之 `ctid` 決勝角色相同，但 AD 文字完全未涵蓋。已獨立立 §二 TLDEDUP（11 案例），含 PG 原始碼註解親自承認的 TRIM 正規化真實碰撞情境（`TLDEDUP-EQ-001` 旗艦案例）。建議 system-architect 於下次修訂時將 I-MSSQL-DEDUP-TIEBREAK-01 條文字面明確擴大涵蓋此二站點。
3. **🔴 target-load 內部暫存表清理為獨立於 `NodeOutputStore.cleanupAll()`（P4a `CLEANUP-003`）之全新責任（查證發現 6）**——因回傳 `tempTable=''`，enriched `tempTable`/`dedupTable` 從未向 `NodeOutputStore` 註冊，既有機制天生不覆蓋。已設計 §七 CLEANUP（5 案例）MUST-FIX + 決策關卡。
4. **`getPrimaryKeyColumns()`/`inputColumnTypes` 之 catalog 查詢站點 AD 完全未提及（查證發現 3/5）**，且 `inputColumnTypes` 所需之 `data_type` 資訊超出既有共用 helper `MssqlTempTableColumn` 型別範圍，已設計 `CATALOG-GATE-001` 決策關卡（擴充 helper vs 另寫查詢）。
5. **DISPATCH 沿革**：`createDispatcher()` 之 `DB_TYPE` 分支為 P4a/P4b 兩度延後之決議，本輪為落地時機，已設計 §九 DISPATCH（4 案例）MUST-FIX，含既有 `configService.get('DB_TYPE','sqlite')` 慣例複用要求（查證發現 7）。
6. `dbo` schema 佔用範圍第四度擴大（P1b2/P1b3 → P4-0/P4a → P4b → 本輪 P4c），且本輪首次直接對真實既有生產 baseline 表（`ob_calendar`/`ob_emphire`/`ob_arreturndf_min_cap`/`customer_core`）寫入測試資料，§0.2 已設計隔離/清理策略降低曝險。
7. `TLDEDUP-TRAP-001`/`CATALOG-MSSQL-001` 兩案例明確標注「待 tdd-impl 真庫驗證」，前者因非決定性行為本質上難以穩定重現於單次測試，後者因 P4a `QUOTE-003` 之附帶查證結論不應未經驗證直接沿用至本輪新站點。
