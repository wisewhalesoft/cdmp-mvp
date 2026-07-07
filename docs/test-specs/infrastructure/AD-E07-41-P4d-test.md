---
type: test-design-infrastructure
test-spec-id: AD-E07-41-P4d
feature_name: MSSQL 全面遷移 P4d — customer_core 56 節點端對端（真實 DAG 執行 + PG EQ 比對 + tie-breaker 業務級偵測，P4 收官驗證）
priority: P0-MVP
related_spec:
  - /docs/specs/implementation-log/AD-E07-41-mssql-p4-etl-engine.md（§8 EQ/端對端測試策略、§9 P4d 範圍/DoD、§4.3 tie-breaker 語意裁定、§10 不變式 I-MSSQL-ETL-EQ-01/I-MSSQL-DEDUP-TIEBREAK-01）
  - /docs/specs/implementation-log/AD-E07-41-P4a-impl.md（QUOTE-003/CLEANUP-003/DISPATCH-001 三項決策沿用不重議；🔴 RESOLVE-002 偏差記錄：本專案 CDMP_TEST/postgres-test 於前一切片實測時 5433 不可達、5432 為 dev DB 不可寫測試資料——本文件 EQ-PG 群組據此設計為 degradable）
  - /docs/specs/implementation-log/AD-E07-41-P4b-impl.md（lookup 31 節點 100% legacy mode + noMatchStrategy='null'、81% 使用 lookupFilter 之真實資料事實，沿用不重查）
  - /docs/specs/implementation-log/AD-E07-41-P4c-impl.md（DISPATCH-001 落地事實：createDispatcher() 已依 DB_TYPE 分支接上全部 9 個 handler；CATALOG-GATE-001/CLEANUP-GATE-001 決策；DEV-P4C-TABLES 偏差：CDMP_TEST 未套用完整 baseline migration，target 表需 beforeAll 自建）
  - /docs/test-specs/infrastructure/AD-E07-41-P4c-test.md（0.x Harness/EQ 分層慣例沿用）
  - apps/api/src/database/seeds/data/etl-pipelines.json（"ETL for Customer Core" pipeline 定義，本文件全部真實資料事實之唯一來源）
covers: []
spec_version: "1.0"
date: 2026-07-08
last_updated: 2026-07-08
---

# AD-E07-41 P4d：MSSQL 全面遷移 — customer_core 端對端（P4 收官驗證）— 測試設計

> 本文件覆蓋 AD-E07-41「MSSQL 全面遷移 P4（ETL 引擎 MSSQL 化）」之 **P4d 切片**（AD §8「EQ/端對端測試策略」表格第三列 + §9 P4d DoD）。P4 不經 spec-writer（AD-E07-41「是否需要 spec-writer」章節已裁定，比照 P4a/b/c 先例，本輪不重複論證）。P4a/P4b/P4c 已分別完成全部 9 個 mssql handler 之單元/整合測試（QUOTE-003 雙引號識別碼、`temp-table.util.ts` 4 個共用 helper、`NodeOutputStore.cleanupAll()`、DISPATCH-001 已於 P4c 落地），**本文件不重測任一 handler 內部 SQL 正確性**，專注於「全部 9 個 handler 首次在真實 56 節點 DAG 中依序協同執行」這件事本身是否成立，以及與 PG 版本之端對端結果等價性（I-MSSQL-ETL-EQ-01）。
>
> **明確排除**：任一 handler 內部 SQL 方言轉換細節（P4a/b/c 已覆蓋，不重測）；bulk-load raw staging 寫入端（P4e，本文件以 fixture 直接建表取代，不依賴該機制）。
>
> **★ test-designer 逐檔查證 + 對照真實 `etl-pipelines.json` 發現之關鍵事實（本文件測試設計之唯一真實資料來源）**：
>
> 1. **🔴 節點數量與 AD/任務書所述「53 節點」不符，真實為 56 節點、55 條邊**：`node.data.nodeType` 分佈實測為 `raw_data_extract:5, derived_field:7, lookup:31, merge:4, dedup:3, type_cast:2, field_mapping:2, conditional:1, target_load:1`（合計 56）。AD §0/§8 與任務書皆沿用「53 節點」之舊估算數字，本文件一律以**真實 56** 為準，並於 §十三 STATIC 設計事實鎖定守門，非阻擋項，僅記錄提醒未來 AD 修訂同步。
> 2. **🔴🔴（本文件最高風險發現之一）真實 raw staging 表需求為 14 張，非任務書描述之「5 來源」**：5 個 `raw_data_extract` 節點對應 5 張 fallback raw 表（`raw_101f6b3e`〔和潤 ZZIP〕/`raw_35d85504`〔和勁 ZZIP〕/`raw_1138803c`〔和潤 MLMC〕/`raw_aec93e7c`〔和勁 MLMC〕/`raw_50172f04`〔興業 MLMC〕）；但 31 個 `lookup` 節點另外引用 **9 張獨立的 lookup 來源 raw 表**（`raw_e5a2345c`/`raw_6fce5258`〔ZZIP_BAMCODE_D ×2 法人〕/`raw_b4a48f10`〔ZZIP_BAMPOST_M〕/`raw_8b80671e`/`raw_9dd0eca5`/`raw_9dcaf414`〔MLMCODE ×3 法人〕/`raw_b9558d10`/`raw_3acd58e7`/`raw_afe6a874`〔MLSTDINDUMF ×3 法人〕），任務書「5 來源 2 ZZIP+3 MLMC」僅描述 extract 節點，完全未提及 lookup 節點依賴之額外 9 張表。**若 fixture 僅建 5 張表，31 個 lookup 節點會因來源表不存在而 100% 拋錯，pipeline 無法端對端跑通**——此為本文件 §零 Harness 設計之核心範圍修正，已全數納入。
> 3. **`resolveRawTable`（`ExtractHandler`/`LookupHandler` 共用）對「參照表本身不存在」與「參照查無資料」兩種情境行為不同**：後者優雅降級為 fallback 靜態表名 + `console.warn`；前者（`extraction_tasks`/`datasources` 表本身不存在）直接拋 `Invalid object name` 硬錯誤，與 DAG 邏輯正確性無關但會使整個 pipeline 失敗。P4a `RESOLVE-002` 偏差記錄已證實 CDMP_TEST 未必已有完整 baseline（`datasources`/`extraction_tasks` 存在性不可預設），本文件 §零 Harness 設計已納入前置存在性守門。
> 4. **🔴 target-load 之 `isTestRun=true` 會使 UPSERT 完全不寫入但 `nodeLogs.outputRowCount` 仍顯示「正常」數字（陷阱）**：`target-load-handler(-mssql).ts` 皆有 `if (context.isTestRun) return { tempTable: '', rowCount: input.rowCount }`——若 E2E harness 之 `PipelineRunnerConfig.isTestRun` 誤設為 `true`（例如複製既有 UI「測試執行」流程的預設值），pipeline 會回報全部節點 `completed` 且 `outputRowCount` 看似合理，但 `customer_core` 實際上**一列也沒寫入**，測試若僅斷言 nodeLogs 狀態會產生極具欺騙性的假陽性。已獨立立 §四 ISTESTRUN 群組處理，優先權列為 MUST-FIX。
> 5. **PG 對照側可達性有本專案內真實先例失敗記錄，不可預設可達**：P4a impl log 明確記錄「唯一可達 PG 為 dev DB（5432），5433（`postgres-test`）不可達，且不可注入測試列污染 dev」，最終**PG 對照側整段跳過**。本文件 §六 EQ-PG 群組依此真實先例設計為 **degradable（best-effort，5433 不可達時整組 skip + SKIP_REASON，不阻擋 P4d 核心 DoD）**，MSSQL-only 端對端（§三 E2E-RUN）為唯一不可退讓之硬性 DoD。
> 6. **DAG 實際拓樸**（讀 `definition.edges` 逐條追蹤確認）：`e1`（和潤ZZIP）/`e2`（和勁ZZIP）各自經 lookup/derived 後於 `m1`（FULL JOIN CUSTO_NO）合併 → `d1`（dedup `CUSTO_NO`/`UPDATE_DATE`）→ 一系列 derived/field_mapping → `fm1` → 送入 `m4` 左側；`e3`（和潤MLMC）/`e4`（和勁MLMC）先於 `m2` 合併，再與 `e5`（興業MLMC）於 `m3` 合併（鏈式）→ `d2`（dedup `CUSTID`/`U_SYSDT`）→ `tc1`（type_cast）→ ... → `df_mlmc_ctype_map` → 送入 `m4` 右側；`m4`（FULL OUTER JOIN `source_customer_no`）→ `cd1`（conditional，較新者為準）→ 一系列 derived → `df3`（`data_source` 標記 + `customer_id` 產生）→ `d3`（dedup `source_customer_no`/`source_updated_at`，最終去重）→ `tl1`（target_load customer_core UPSERT）。此拓樸決定 §五 TIEBREAK 群組之 fixture 觸發點設計（見該群組說明）。
> 7. **`customer_core` 業務欄 `date_of_birth` 存在但 pipeline 定義中無 `AGE` 衍生欄位**——AD §0 提及「Stage 2 計分依賴 customer_core 之 `AGE`」，但真實 `tl1.fieldMappings` 與全部 7 個 `derived_field` 節點皆無 `AGE` 運算式；`AGE` 為 F109 查詢期衍生（依 `date_of_birth` 於查詢時計算），非本 ETL pipeline 落地時衍生欄位。本文件不因此誤增不存在的 ETL 衍生欄位測試案例。

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件全部 + `AD-E07-41-mssql-p4-etl-engine.md`（§8、§9 P4d、§4.3）+ `AD-E07-41-P4a/b/c-impl.md`（三項既有決策 + RESOLVE-002/DEV-P4C-TABLES 兩項偏差記錄）+ `pipeline-runner.ts`/`node-dispatcher.ts`/`node-output-store.ts`/`types.ts`（真執行核心，本輪待測但不可修改，AD §1.2 已凍結）+ `etl-pipeline-execution.service.ts`（`createDispatcher()` 已於 P4c 接線之真實生產路徑，供 §二 DISPATCH-E2E 決策關卡參考）+ `apps/api/src/database/seeds/data/etl-pipelines.json`（"ETL for Customer Core" 56 節點/55 邊，本文件唯一真實資料來源）+ `_p4c-target-tables.ts`（customer_core baseline DDL 複用起點） |
| QA / Tester | 本文件 + `risks-and-gaps.md`（MSSQL P4d 風險段落） |
| DevOps / CI/CD | 本文件「零、測試環境與 Harness 設計」§0.5（PG 對照側 degradable 政策，不可注入 dev DB） |

---

## 零、測試環境與 Harness 設計

### 0.1 沿用既有 Harness，additive 擴充至「全 DAG 真執行」層級

沿用 `mssql-env-preload.ts` + `_p4a-mssql-harness.ts`（`connectMssql`/`teardownMssql`/`uniqueLogId`/`objectExists`）；PG 側新增沿用既有 `.pg.spec.ts` 家族之 `pgPortReachable`/`PG_BOSS_TEST_HOST`/`PG_BOSS_TEST_PORT`（預設 `127.0.0.1:5433`，即 `docker-compose.test.yml` 之 `postgres-test`／`cdmp_test`）慣例，**不新建 PG 連線 helper**。`vi.setConfig({ testTimeout: 120000 })`（比 P4a/b/c 之 60000 更長——56 節點含 31 個 lookup 之真實執行時間顯著長於單一 handler 測試，且需序列跑兩次〔冪等驗證〕甚至三次〔tie-breaker 決定性重跑〕）。

**與 P4a/b/c 的關鍵差異**：P4a/b/c 皆以 `makeRealCtx` 繞過 `PipelineRunner`/`NodeDispatcher`，直接呼叫單一 handler；本輪待測物件正是「全部 9 個 handler 透過真實 `NodeDispatcher`＋`PipelineRunner.run()` 協同執行一個真實、未簡化的 56 節點 DAG」，故**不可繞過** `PipelineRunner`。

### 0.2 DISPATCH-E2E 決策關卡：service-level 全量 vs 直接建構 dispatcher（不預設，交 tdd-implementation 擇一，但須記錄）

任務指示「以 `createDispatcher` 驅動 `pipeline-runner`」可有兩種對等落地方式：

- **方案甲（service-level）**：透過 NestJS `TestingModule` 實例化真實 `EtlPipelineExecutionService`，種入 `EtlPipeline`/`EtlPipelineVersion`（`definition` = 真實 56 節點 JSON）+ 呼叫 `triggerExecute`/`triggerTest`（**注意：`triggerTest` 會設 `is_test_run=true`，依查證發現 4 會導致 target-load 完全不寫入——DoD 驗證必須用 `triggerExecute`，不可用 `triggerTest`**），再以既有 `waitForTaskStatus`-style polling（沿用 test-index.md 已記錄之 `interval=300ms` 慣例）等待 `EtlPipelineLog.status` 轉為 `completed`/`failed`。優點：連 `createDispatcher()` 私有方法本身的 `DB_TYPE` 分支接線都一併驗證（DISPATCH-001 落地事實之生產路徑重現）。缺點：額外拖入 `EtlPipeline`/`EtlPipelineLog`/`EtlPipelineVersion` entity 與非同步輪詢，測試更重、更慢。
- **方案乙（直接建構）**：比照 P4a/b/c 既有精神，手動 `new NodeDispatcher()` + 逐一 `register(new XxxHandlerMssql())`（9 個，與 `createDispatcher()` mssql 分支完全一致的 handler 集合）+ `new NodeOutputStore()` + `new PipelineRunner(dispatcher, outputStore)` + 直接呼叫 `runner.run(definition, config, queryRunner, onLogUpdate)`（`definition` 直接從 `etl-pipelines.json` 讀出，不經 DB）。優點：與 P4a/b/c 一致的測試風格、無 DB entity 依賴、可精確控制 `config.isTestRun=false`（避免查證發現 4 之陷阱以更直接的方式規避——不透過 service 的 `triggerExecute`/`triggerTest` 二選一介面，直接組 `PipelineRunnerConfig`）、執行更快更穩定。缺點：`createDispatcher()` 私有方法本身未被直接呼叫到（DISPATCH-001 之接線邏輯留在 P4c 已完成的獨立守門）。

**建議**：以**方案乙為 DoD 核心**（§三 E2E-RUN 全數採用），**方案甲僅設計 1 個補充性 smoke 案例**（§二 DISPATCH-E2E-001）驗證 service 層真的能跑通同一 pipeline（非重複驗證 DAG 邏輯本身），兩者互補、不互斥。**若 tdd-implementation 選擇不同分工，須於 impl log 明確記錄理由**（決策關卡，見 §二 DISPATCH-E2E-GATE-001）。

### 0.3 Fixture 建構：14 張 raw 表（雙側 DB）+ customer_core/datasources/extraction_tasks 前置存在性

**14 張 raw fixture 表**（見查證發現 2）分兩類：

| 類別 | 表名 | 對應真實來源 | 備註 |
|---|---|---|---|
| Extract 來源（5） | `raw_101f6b3e`/`raw_35d85504`/`raw_1138803c`/`raw_aec93e7c`/`raw_50172f04` | `ZZIP_BAMCUST_M`×2、`MLMCUSTOMER`×3 | 欄位集合＝跨全部 `field_mapping`/`derived_field`/`dedup`/`lookup`（`matchColumn`）/`type_cast` 引用該來源之欄位聯集，**建議 tdd-implementation 以程式化方式從 `etl-pipelines.json` 逐節點掃描聯集產生所需欄位清單，而非人工臆測**（欄位遺漏會使該節點靜默取到 `NULL` 或拋「欄位不存在」錯誤，兩者都會腐蝕端對端結果的可信度） |
| Lookup 來源（9） | `raw_e5a2345c`/`raw_6fce5258`/`raw_b4a48f10`/`raw_8b80671e`/`raw_9dd0eca5`/`raw_9dcaf414`/`raw_b9558d10`/`raw_3acd58e7`/`raw_afe6a874` | `ZZIP_BAMCODE_D`×2、`ZZIP_BAMPOST_M`、`MLMCODE`×3、`MLSTDINDUMF`×3 | 需含至少一組 `TBL_ID`/`TBL_CD`/`TBL_DESC1`（或對應 MLMC 版欄名）之有效配對，涵蓋 31 個 lookup 節點各自的 `lookupFilter`（25/31 使用，見查證引用 P4b 事實）與 `matchColumn`/`lookupMatchColumn` 所需值域，**否則全部 31 個 lookup 皆回傳 `noMatchStrategy='null'` 之 `NULL`，§八 LOOKUPHIT 基準對照組會失敗且無法與 §九 LOOKUPMISS 形成有意義對比** |

**`customer_core`/`datasources`/`extraction_tasks` 前置存在性**：沿用 `_p4c-target-tables.ts` 之 idempotent 自建模式（DEV-P4C-TABLES 偏差記錄已證 CDMP_TEST 未必有完整 baseline）；新增 `_p4d-target-tables.ts`（或擴充 `_p4c-target-tables.ts`）**額外**確保 `datasources`/`extraction_tasks` 兩表存在（僅存在性，**不需**塞入任何列——依查證發現 3，`resolveRawTable` 對「查無資料」已優雅降級為 fallback 靜態表名，故本文件 fixture 設計**採空表 fallback 路徑**，不模擬 `extraction_tasks` 動態解析成功路徑，該路徑已由 P4a `TS-F043-059` 系列於 handler 單元層級驗證，不在本文件重複範圍）。

**PG 側對稱建構**：若 §六 EQ-PG 群組實際執行（5433 可達），需在 `cdmp_test` 建立**完全相同**的 14 張 raw 表 + 相同 fixture 資料列（否則 PG/MSSQL 兩側輸入不對等，EQ 比對失去意義）；`customer_core`/`datasources`/`extraction_tasks` 已存在於 `cdmp_test`（PG baseline `1711360000000-BaselineSchema.ts` 涵蓋，F098~F109 pg.spec 套件已共用此 DB），**不需**自建，僅需以顯著前綴隔離本次寫入列並於 `afterAll` 清除（比照既有 F109 pg.spec 序列執行慣例，避免與 F098~F109 既有套件互相污染）。

### 0.4 Fixture 客戶矩陣（設計原則，非規定確切字面值——留給 tdd-implementation 依此原則構造）

| 客戶代號 | 來源分佈 | 設計目的 |
|---|---|---|
| C-ZZIP-HAPPY | 僅 e1（和潤ZZIP），lookup 全命中 | 基準正面對照組（§八 LOOKUPHIT） |
| C-ZZIP-MISS | 僅 e2（和勁ZZIP），至少 1 個 lookup 之 `matchColumn` 值不在對應 lookup 來源表值域內 | lookup 未命中→`NULL`（§九 LOOKUPMISS） |
| C-MLMC-HAPPY-A/B/C | 分別僅 e3/e4/e5（MLMC 三法人） | 驗證 `m2`→`m3` 鏈式合併三方各自正確流入 `d2` |
| C-BOTH | 同時存在於某 ZZIP 分支與某 MLMC 分支（**刻意構造**跨系統相同 `source_customer_no`），兩側 `source_updated_at` 不同 | 驗證 `m4` FULL OUTER JOIN + `cd1`「較新者為準」+ `df3` `data_source='ZZIP_BAMCUST_M+MLMCUSTOMER'` 標記正確 |
| C-TIE | 同一張 extract 表（建議 e1）內 **2 筆列**，`CUSTO_NO` 與 `UPDATE_DATE` 完全相同、其餘欄位（如姓名對應之來源欄）不同 | §五 TIEBREAK 群組核心 fixture（觸發 `d1` 真實 `_seq` tie-breaker，見 §0.6 拓樸分析） |
| C-NULLBIZ | 對應 `name`（`customer_core` NOT NULL 業務欄）之來源欄位（ZZIP `CUSTNAME`/MLMC `CUSTNAME` 依 `fm1`/`fm2` mapping）刻意設為 `NULL` | 驗證 UPSERT 之 NOT NULL 業務欄整列排除、不影響其餘合法客戶（§七 NULLEXC） |
| C-CHI | 中文姓名/地址（含罕用字或至少一個非 BMP 常見中文字），可與 C-ZZIP-HAPPY 共用同一列 | 中文 round-trip（§六 CHARSET） |

### 0.5 EQ-PG 群組之 degradable 政策（🔴 依本專案內真實先例設計，非臆測）

P4a impl log RESOLVE-002 已記錄：本專案於前一切片實測時，`postgres-test`（5433）不可達，唯一可達 PG 為 dev DB（5432），且**明確拒絕**寫入測試資料至 dev DB。本文件比照此政策：

1. §六 EQ-PG（跨引擎逐列比對）與 §五 TIEBREAK-CROSSDB（跨引擎 tie-breaker 勝出列比對）**僅在 `pgPortReachable()` 對 5433 回傳 `true` 時執行**；不可達時 `describe.skip` 全組 + 明確 `SKIP_REASON`，**不得**回退嘗試連線 5432（dev DB）並寫入。
2. §六/§五 之 skip **不構成 P4d DoD 未達成**——§三 E2E-RUN（MSSQL-only 端對端）為唯一不可退讓之硬性 DoD，此政策已於 AD §9 P4d DoD 字面「與 PG 版本逐欄逐列比對」之執行前提中隱含但未明說，本文件於此明確記錄，避免 tdd-implementation 誤判 PG 側不可達等同任務失敗。
3. 若 5433 可達，PG 側 fixture 建構與清理**必須**使用顯著前綴（建議 `_TEST_P4D_` 或特定 `source_customer_no` 值域）並於 `afterAll` 精準刪除本次寫入列，**不得** `TRUNCATE customer_core`（該表被 F098~F109 pg.spec 套件共用，比照既有 F109 pg.spec 序列執行慣例）。

### 0.6 EQ（等價性）驗證方法論分層

1. **HARNESS-GATE（免真實連線的靜態/決策關卡）**：raw 表命名清單、節點/邊數量事實鎖定、`isTestRun` 設置靜態掃描。
2. **MSSQL E2E（真實連線，硬性 DoD）**：56 節點真實執行、tie-breaker 決定性、中文/NULL/lookup-miss、冪等、`##` 全清。
3. **PG EQ（真實連線，degradable best-effort）**：同一 fixture 跑 PG 版 pipeline，`customer_core` 逐欄逐列比對；tie-breaker 案例改為「決定性存在」比對，非內容相等比對（見 AD §4.3）。

---

## 一、GATE — 前置存在性與資料形狀決策關卡

### TS-MSSQL-P4D-GATE-001（🔴 決策關卡）：14 張 raw fixture 表之欄位清單衍生方式
- **Related Requirement**：查證發現 2
- **Test Type**：Decision Gate（文件化守門）
- **Expected Result**：impl log 之 Architectural Decisions 段落須記錄欄位清單衍生方法（建議：程式化掃描 `etl-pipelines.json` 逐節點 `matchColumn`/`sourceColumn`/`lookupMatchColumn`/`expression` 內引用的來源欄位聯集），若人工列舉須附上與 JSON 逐一核對後無遺漏之佐證

---

### TS-MSSQL-P4D-GATE-002：`datasources`/`extraction_tasks` 兩表僅需存在性、不需塞入資料（查證發現 3 落地）
- **Related Requirement**：查證發現 3
- **Test Type**：Positive / Unit（前置守門）
- **Expected Result**：`beforeAll` 後 `OBJECT_ID('dbo.datasources')`/`OBJECT_ID('dbo.extraction_tasks')` 皆非 `NULL`；兩表列數為 0 不視為錯誤

---

### TS-MSSQL-P4D-GATE-003：lookup 來源 fixture 涵蓋全部 31 個節點實際使用之 `TBL_ID`/`lookupFilter` 值域
- **Related Requirement**：查證發現 2；P4b 已記錄之 25/31 `lookupFilter` 使用事實
- **Test Type**：Decision Gate（文件化守門）
- **Expected Result**：impl log 記錄比對表（31 個 lookup 節點 × 各自 `lookupFilter`/`matchColumn` 值 vs fixture 是否覆蓋），至少 §八 LOOKUPHIT 基準客戶（C-ZZIP-HAPPY 等）之全部 lookup 皆應命中

---

### TS-MSSQL-P4D-GATE-004：56 節點 DAG 於本文件 fixture 下確實無環（`topologicalSort` 前置）
- **Related Requirement**：`pipeline-runner.ts` 現有 cycle-detection 邏輯回歸（非本輪新邏輯，僅確認真實 pipeline 定義不觸發）
- **Test Type**：Regression / Unit

---

## 二、DISPATCH-E2E — Service-Level 補充 Smoke（§0.2 方案甲）

### TS-MSSQL-P4D-DISPATCHE2E-GATE-001（🔴 決策關卡）：方案甲/乙分工記錄
- **Related Requirement**：§0.2
- **Test Type**：Decision Gate（文件化守門）
- **Expected Result**：impl log 記錄實際採用之分工（建議：DoD 核心用方案乙，本群組用方案甲補充）；若僅採其中一種亦須記錄理由

---

### TS-MSSQL-P4D-DISPATCHE2E-001（🔴 補充 DoD）：透過 `EtlPipelineExecutionService.triggerExecute`（**非** `triggerTest`）真實驅動 56 節點 pipeline 至 `completed`
- **Related Requirement**：AD §9 P4d「以 createDispatcher 驅動 pipeline-runner」字面要求；DISPATCH-001（P4c 已落地）之生產路徑重現
- **Test Type**：Positive / Integration
- **Preconditions**：`DB_TYPE=mssql`；`EtlPipeline`/`EtlPipelineVersion`（definition=真實 56 節點 JSON）已種入
- **Expected Result**：`EtlPipelineLog.status` 最終為 `completed`；`customer_core` 確有新列（間接證明 `isTestRun` 未被誤設為 `true`，見查證發現 4）

---

## 三、E2E-RUN — 端對端跑通（🔴🔴 DoD 核心，AD §9 P4d 硬性要求）

### TS-MSSQL-P4D-E2E-001（🔴🔴 MUST-FIX，DoD 核心）：56 節點於 MSSQL 完整執行零錯誤，全部 `nodeLogs[].status === 'completed'`
- **Related Requirement**：AD §9 P4d DoD「53〔實 56〕節點 pipeline 對真實 MSSQL 容器完整跑通」
- **Test Type**：Positive / Integration — **DoD 核心案例**
- **Preconditions**：§零 全部 fixture（14 raw 表 + customer_core/datasources/extraction_tasks）已就緒；`config.isTestRun=false`
- **Steps**：以 §0.2 方案乙建構真實 `NodeDispatcher`（9 個 `*HandlerMssql`）+ `PipelineRunner` + 真實 `QueryRunner`，呼叫 `runner.run(definition, config, queryRunner, onLogUpdate)`
- **Expected Result**：回傳之 `NodeLogEntry[]` 長度為 56，全部 `status==='completed'`，無 `failed`/`skipped`；無例外拋出

---

### TS-MSSQL-P4D-E2E-002（🔴 DoD 核心）：9 種 handler 類型於本次執行中全數至少各被呼叫一次且成功
- **Related Requirement**：AD §9 P4d「全 9 handler 類型在真實 DAG 中依序執行」（任務指示字面要求）
- **Test Type**：Positive / Integration
- **Expected Result**：以 `nodeLogs` 之 `nodeType` 欄位交叉比對，`{raw_data_extract, derived_field, lookup, merge, dedup, type_cast, field_mapping, conditional, target_load}` 九種皆出現且皆 `completed`

---

### TS-MSSQL-P4D-E2E-003：`##global temp` 於執行期間貫穿多個節點（中途取樣驗證，非僅事後檢查全清）
- **Related Requirement**：AD §9 P4d「##global temp 貫穿 53〔56〕節點」
- **Test Type**：Positive / Integration
- **Steps**：於 `onLogUpdate` callback 中攔截至少一個中游節點（如 `m4`）`status==='running'` 時序，對其上游輸出表執行 `objectExists` 查詢
- **Expected Result**：執行期間確認至少一張 `##` 表存在且可被 `OBJECT_ID` 定位，證明資料確實透過全域暫存表在節點間傳遞（非測試造假繞過）

---

### TS-MSSQL-P4D-E2E-004（🔴 DoD 核心）：pipeline 結束後 `customer_core` 實際新增列數與 fixture 唯一 `source_customer_no` 數一致
- **Related Requirement**：AD §9 P4d「最終寫入 customer_core 表」
- **Test Type**：Positive / Integration
- **Expected Result**：`SELECT COUNT(*) FROM customer_core WHERE source_customer_no IN (<本次 fixture 全部客戶代號>)` 等於 fixture 設計之唯一客戶數（C-BOTH 因 `m4`+`cd1`+`d3` 合併為一列，不重複計數）

---

### TS-MSSQL-P4D-E2E-005（🔴 DoD 核心，容錯路徑）：任一節點失敗時，下游正確標記 `skipped`，`customer_core` 不寫入任何列
- **Related Requirement**：既有 `pipeline-runner.ts` 失敗處理邏輯於真實大型 DAG 下之回歸確認（非新邏輯，`pipeline-runner.ts` 已凍結不可修改，AD §1.2）
- **Test Type**：Negative / Integration
- **Preconditions**：人為破壞其中一個中游 fixture（如某 lookup 來源表暫時 `DROP`，或某 `type_cast` 目標欄位餵入無法 `TRY_CAST` 的髒值使該路徑真的拋錯——若 `TRY_CAST` 優雅回 `NULL` 不拋錯則改用 GATE-002 之表不存在手法）
- **Expected Result**：故障節點 `status==='failed'`，其下游全部 `status==='skipped'`；`customer_core` 無本次執行新增列（因 `tl1` 未執行到）；`##` 表經 `cleanupAll` 清空（見 §十一 CLEANUP-E2E）

---

### TS-MSSQL-P4D-E2E-006：56 節點端對端執行耗時記錄（觀察性，非阻擋）
- **Related Requirement**：AD §12 時程/效能觀察慣例延伸
- **Test Type**：Observability（非阻擋）
- **Expected Result**：記錄本次執行 `durationMs`，供未來效能優化參考，不設通過門檻（P4e bulk-load 吞吐量已明文「不要求達到與 PG COPY 相同數字」，本案例比照精神）

---

### TS-MSSQL-P4D-E2E-007：`isTestRun=false` 情境下之 nodeLogs `outputRowCount` 與 `customer_core` 實際列數方向一致（防禦性交叉核對）
- **Related Requirement**：查證發現 4 之延伸防禦（非僅信任 nodeLogs 字面，另以真實表列數交叉驗證）
- **Test Type**：Positive / Integration

---

## 四、ISTESTRUN — 🔴🔴 Dry-Run 陷阱（MUST-FIX，查證發現 4）

### TS-MSSQL-P4D-ISTESTRUN-001（🔴🔴 MUST-FIX）：E2E harness 之 `PipelineRunnerConfig.isTestRun` 顯式為 `false`（靜態守門）
- **Related Requirement**：查證發現 4
- **Test Type**：Negative / Unit — 靜態 grep 守門（非真實連線）
- **Expected Result**：所有 E2E-RUN/TIEBREAK/CHARSET/NULLEXC/LOOKUPMISS/IDEMPOTENT 群組之測試檔中，凡建構 `PipelineRunnerConfig` 之處，`isTestRun` 皆為字面 `false`；**不得**出現 `isTestRun: true` 或省略該欄位卻依賴某處預設值為 `false` 的隱性假設（`PipelineRunnerConfig` 介面無預設值，必須顯式）

---

### TS-MSSQL-P4D-ISTESTRUN-002（🔴🔴 MUST-FIX，陷阱佐證）：對照組——刻意以 `isTestRun=true` 跑一次同一 pipeline，證明 `nodeLogs` 全綠但 `customer_core` 零寫入（佐證陷阱真實存在，非過度防禦）
- **Related Requirement**：查證發現 4
- **Test Type**：Negative / Integration — 陷阱佐證
- **Expected Result**：`nodeLogs` 全部 `completed`（含 `tl1`，`outputRowCount` 顯示與 `isTestRun=false` 情境相同的數字）；`customer_core` 中對應本次 fixture 的 `source_customer_no` **查無任何列**——此案例本身即為證明「僅信任 nodeLogs 不足以驗證 DoD」之直接證據，供未來讀者理解 §三 E2E-RUN-004 為何必須直接查 `customer_core` 而非僅信任 `outputRowCount`

---

### TS-MSSQL-P4D-ISTESTRUN-003：PG 版 `target-load-handler.ts` 之 `isTestRun` 行為與 mssql 版一致（跨 dialect 契約對稱性回歸）
- **Related Requirement**：既有邏輯回歸（PG/MSSQL 兩份原始碼皆有此分支，query 確認過）
- **Test Type**：Regression / Unit

---

## 五、TIEBREAK — Dedup Tie-Breaker 業務級偵測（🔴🔴 本文件最高風險群組）

> **拓樸依據**（查證發現 6）：`d1` 直接消費 `m1`（`e1`⊕`e2` FULL JOIN CUSTO_NO）之輸出。C-TIE fixture 設計為**同一張 extract 表（e1）內 2 筆列，`CUSTO_NO` 與 `UPDATE_DATE` 完全相同**，使 `m1` 輸出中該 `CUSTO_NO` 出現 2 次、時間戳記完全相同，真實觸發 `d1` 之 `_seq IDENTITY` tie-breaker——此為 P4c 僅以 `dedup-handler.ts` 孤立 harness 驗證過的邏輯，首次在真實 56 節點 DAG（含其上游 lookup/derived 與下游 merge/conditional/target-load）中被實際驅動。

### TS-MSSQL-P4D-TIEBREAK-001（🔴🔴 MUST-FIX，DoD 核心）：C-TIE 客戶於 MSSQL 端對端執行後，`customer_core` 恰一列
- **Related Requirement**：AD §9 P4d「tie-breaker 邊界情境若觸發則記錄」之前提（先確認決定性存在）；I-MSSQL-DEDUP-TIEBREAK-01
- **Test Type**：Positive / Integration — **DoD 核心案例**
- **Preconditions**：C-TIE fixture（e1 內 2 筆重複 `CUSTO_NO`+`UPDATE_DATE`）已就緒
- **Expected Result**：`customer_core WHERE source_customer_no = <C-TIE 客戶代號>` 恰回傳 1 列（非 0 列、非 2 列）

---

### TS-MSSQL-P4D-TIEBREAK-002（🔴 決定性回歸）：C-TIE 情境連續重跑 3 次（各自獨立 `logId`），每次皆恰一列且勝出列內容完全一致
- **Related Requirement**：I-MSSQL-DEDUP-TIEBREAK-01「決定性」要求，延伸 P4c `TLDEDUP-MSSQL-003` 精神至全 DAG 層級
- **Test Type**：Positive / Integration
- **Expected Result**：3 次執行之勝出列（依可辨識欄位，如來源姓名對應欄）完全一致，證明 `_seq` tie-breaker 於全 DAG 情境下依然決定性（非查詢計畫隨每次執行變動）

---

### TS-MSSQL-P4D-TIEBREAK-003（🔴🔴 業務級偵測機制，探測型，degradable）：跨引擎（PG vs MSSQL）C-TIE 勝出列內容比對
- **Related Requirement**：AD §4.3「決定性選出恰一列，非保證選出同一實體列」；查證發現 5（degradable 政策）
- **Test Type**：Probe / Integration — **不預設答案，兩種結果皆為合法通過**
- **Preconditions**：5433 可達（否則整條 skip，見 §0.5）；PG 側以完全相同 fixture（含 C-TIE）跑 PG 版 pipeline
- **Steps**：
  1. 分別取得 PG 與 MSSQL 兩側 `customer_core WHERE source_customer_no = <C-TIE 客戶代號>` 之勝出列
  2. 各自先斷言「恰一列」（硬性，決定性存在性，若任一側非恰一列則為真正 bug，非邊界案例，判定失敗）
  3. 比對兩側該列之全部可辨識欄位是否逐一相同
- **Expected Result（兩分支皆為通過）**：
  - **分支 A（一致）**：兩側勝出列內容完全相同 → 記錄「本次 fixture 未觸發已知邊界差異」
  - **分支 B（不一致）**：兩側勝出列內容不同 → **不判定測試失敗**，改為結構化記錄（差異欄位清單 + 兩側完整列內容）並輸出至 impl log 供比照本專案既有 F067 差異報告揭露慣例回報使用者；**本案例要求 tdd-implementation 於 impl log 明確記錄實際觀察到分支 A 或 B**（決策關卡性質，不可略過不記錄）

---

### TS-MSSQL-P4D-TIEBREAK-004：C-TIE 之外的正常客戶（無 tie 情境）不受 tie-breaker 邏輯波及（對照組，防止過度修正）
- **Related Requirement**：既有邊界行為回歸
- **Test Type**：Boundary / Integration
- **Expected Result**：fixture 中其餘無重複 `CUSTO_NO`/`CUSTID` 之客戶，`customer_core` 列數與內容不受 C-TIE 存在與否影響

---

### TS-MSSQL-P4D-TIEBREAK-005：C-TIE 之 2 筆來源列若時間戳記其中一筆為 `NULL`，非 `NULL` 者優先（NULLS LAST，全 DAG 層級落地驗證）
- **Related Requirement**：AD §4.2「NULLS LAST」，延伸 P4c `DEDUP-TIEBREAK-003` 精神至全 DAG 層級
- **Test Type**：Boundary / Integration

---

## 六、EQ-PG — 跨引擎逐列比對（🔴 DoD 核心，但 degradable，見 §0.5）

> **前提**：`pgPortReachable()` 對 5433 回傳 `true`。不可達時本群組全數 `describe.skip` + `SKIP_REASON='postgres-test(5433) 不可達，依 §0.5 政策不回退至 dev DB(5432)'`，**不構成 P4d DoD 未達成**。

### TS-MSSQL-P4D-EQPG-001（🔴 DoD 核心）：同一 56 節點 pipeline + 同一 fixture，PG 版與 MSSQL 版皆完整跑通零錯誤
- **Related Requirement**：AD §9 P4d DoD「與 PG 版本逐欄逐列比對」之前提
- **Test Type**：Positive / Integration

---

### TS-MSSQL-P4D-EQPG-002（🔴🔴 DoD 核心，旗艦案例）：`customer_core` 逐欄逐列比對（`source_customer_no` 為鍵），非 tie-breaker 相關欄位須完全相等
- **Related Requirement**：I-MSSQL-ETL-EQ-01；AD §9 P4d DoD 字面核心
- **Test Type**：Positive / Integration — **DoD 核心案例**
- **Steps**：以 `source_customer_no` JOIN 兩側結果，逐欄比對除 `customer_id`（UUID，兩側各自產生，天生不同，設計上排除比對）外之全部業務欄位
- **Expected Result**：C-ZZIP-HAPPY/C-ZZIP-MISS/C-MLMC-HAPPY-A/B/C/C-BOTH/C-NULLBIZ/C-CHI（**不含** C-TIE，該案例改由 §五 TIEBREAK-003 專責處理）之全部業務欄位兩側完全相等

---

### TS-MSSQL-P4D-EQPG-003：C-BOTH 客戶之 `data_source` 標記與 `cd1` 衝突解決結果兩側一致
- **Related Requirement**：查證發現 6（`m4`/`cd1`/`df3` 拓樸）
- **Test Type**：Positive / Integration

---

### TS-MSSQL-P4D-EQPG-004：C-NULLBIZ 客戶於兩側皆被正確排除（不寫入 `customer_core`），不影響其餘客戶列數
- **Related Requirement**：既有邏輯回歸（P4c `UPSERT-EQ-004` 精神之全 DAG 落地驗證）
- **Test Type**：Negative / Integration

---

### TS-MSSQL-P4D-EQPG-005：C-ZZIP-MISS 客戶之 lookup 未命中欄位兩側皆為 `NULL`（一致性）
- **Related Requirement**：查證發現 2；I-MSSQL-ETL-EQ-01

---

### TS-MSSQL-P4D-EQPG-006：EQ-PG 群組 skip 時之明確 `SKIP_REASON` 輸出（harness 自我驗證，非阻擋）
- **Related Requirement**：§0.5 degradable 政策落地確認
- **Test Type**：Meta / Unit — 確認 gating 機制本身正確運作，非「假裝通過」

---

## 七、CHARSET — 中文 Round-Trip（全 DAG 層級）

### TS-MSSQL-P4D-CHARSET-001（🔴 DoD 核心）：C-CHI 客戶之中文姓名於 MSSQL 端對況執行後正確 round-trip
- **Related Requirement**：AD §9 P4d「§4.3 邊界案例外，中文欄位正確」；I-MSSQL-COLLATE-01 延伸
- **Test Type**：Positive / Integration — **DoD 核心案例**
- **Expected Result**：`customer_core.name`（及其餘中文欄位如地址）與輸入 fixture 逐字元相等，經過 31 個 lookup 節點、7 個 derived_field 節點傳遞後無亂碼/截斷

---

### TS-MSSQL-P4D-CHARSET-002：lookup 之中文 `outputAlias`（如 `education_desc`/`occupation_desc`）欄位值正確 round-trip
- **Related Requirement**：I-MSSQL-COLLATE-01 延伸；lookup 節點特有（來源表本身即含中文碼表描述）

---

### TS-MSSQL-P4D-CHARSET-003：中文欄位於 `##` 暫存表跨 56 節點傳遞中途（非僅最終落地）正確（中途取樣，比照 §三 E2E-003 手法）
- **Related Requirement**：既有邏輯回歸延伸

---

## 八、LOOKUPHIT/LOOKUPMISS — Lookup 命中與未命中

### TS-MSSQL-P4D-LOOKUPHIT-001（基準對照組，DoD 前提）：C-ZZIP-HAPPY 客戶全部相關 lookup 皆命中，對應欄位非 `NULL`
- **Related Requirement**：查證發現 2；§0.4 fixture 矩陣設計目的
- **Test Type**：Positive / Integration
- **Expected Result**：若本案例失敗，代表 §零 lookup fixture 值域設計本身有缺陷，§九 LOOKUPMISS 群組之「未命中」對比會失去意義（必須先確認「命中」路徑正常，才能有意義地驗證「未命中」路徑）

---

### TS-MSSQL-P4D-LOOKUPMISS-001（🔴 DoD 核心）：C-ZZIP-MISS 客戶之未命中欄位為 `NULL`，其餘欄位正常填入（`noMatchStrategy='null'` 全 DAG 落地）
- **Related Requirement**：AD §9 P4d「lookup 未命中（31 節點皆 legacy noMatchStrategy='null'）產生 NULL 欄」
- **Test Type**：Positive / Integration — **DoD 核心案例**
- **Expected Result**：該客戶對應之 lookup 輸出欄位為 `NULL`；同一客戶其餘（未受影響的）欄位正常填入，**整列不因單一 lookup 未命中而被排除**（與 §七 NULLEXC 之 NOT NULL 業務欄排除邏輯明確區分——lookup miss 只影響單欄，NOT NULL 業務欄缺失才整列排除）

---

### TS-MSSQL-P4D-LOOKUPMISS-002：多個客戶各自不同 lookup 節點未命中，彼此互不干擾（隔離性）
- **Related Requirement**：既有邏輯回歸

---

## 九、NULLEXC — NOT NULL 業務欄防呆（全 DAG 層級）

### TS-MSSQL-P4D-NULLEXC-001（🔴 DoD 核心）：C-NULLBIZ 客戶（`name` 來源欄為 `NULL`）整列不寫入 `customer_core`，不影響其餘合法客戶
- **Related Requirement**：既有邏輯回歸（P4c `UPSERT-EQ-004`）之全 DAG 落地驗證
- **Test Type**：Negative / Integration — **DoD 核心案例**

---

### TS-MSSQL-P4D-NULLEXC-002：`source_customer_no`/`customer_type_code`（另兩個真實 NOT NULL 業務欄，P4c 已確認）於全 DAG 情境下同理排除
- **Related Requirement**：P4c CATALOG-MSSQL-001 事實延伸

---

### TS-MSSQL-P4D-NULLEXC-003：NOT NULL 業務欄排除不因 `##` 暫存表中間節點順序而失效（回歸，防止未來重構打亂節點順序後此防線失守）
- **Related Requirement**：既有邏輯回歸

---

## 十、IDEMPOTENT — 冪等重跑

### TS-MSSQL-P4D-IDEMPOTENT-001（🔴 DoD 核心）：同一 fixture 完整重跑第二次（新 `logId`），`customer_core` 列數不變，非疊加
- **Related Requirement**：AD §9 P4d「冪等」
- **Test Type**：Positive / Integration — **DoD 核心案例**
- **Expected Result**：第二次執行後 `customer_core WHERE source_customer_no IN (<fixture 全部客戶>)` 列數與第一次執行後相同；既有列被 UPSERT 覆寫（非新增重複列）

---

### TS-MSSQL-P4D-IDEMPOTENT-002：C-TIE 客戶重跑後勝出列內容穩定不變（冪等 × 決定性交叉驗證）
- **Related Requirement**：I-MSSQL-DEDUP-TIEBREAK-01 + 冪等要求之交集

---

### TS-MSSQL-P4D-IDEMPOTENT-003：重跑不因前次殘留 `##` 表命名衝突而失敗（`logId` 隔離性回歸，全 DAG 層級）
- **Related Requirement**：I-MSSQL-TEMPTABLE-GLOBAL-01 既有邏輯回歸

---

## 十一、CLEANUP-E2E — 全域 `##` 清理（56 節點規模）

### TS-MSSQL-P4D-CLEANUPE2E-001（🔴 DoD 核心）：成功路徑 — 針對本次 `logId`，56 個節點對應之全部 `##` 表（含 `NodeOutputStore` 追蹤與 dedup/target-load 自理兩類）於執行完畢後 `OBJECT_ID` 皆為 `NULL`
- **Related Requirement**：I-MSSQL-TEMPTABLE-CLEANUP-01；AD §9 P4d「## 全清」
- **Test Type**：Positive / Integration — **DoD 核心案例**
- **Steps**：以本次 `logId` 重建 56 個 `makeTempTableName(nodeId, logId)` 期望名稱清單 + `target-load`/`dedup` 內部已知命名模式（`##raw_`/`##_seq`/enriched/`dedupTable`），逐一 `objectExists` 查詢
- **Expected Result**：全數為 `false`（`OBJECT_ID` 為 `NULL`）

---

### TS-MSSQL-P4D-CLEANUPE2E-002（🔴 DoD 核心）：失敗路徑（呼應 §三 E2E-005）— 故障節點之前已建立的 `##` 表同樣全清，不因中途失敗而殘留
- **Related Requirement**：I-MSSQL-TEMPTABLE-CLEANUP-01「成功/失敗兩路徑」；AD §9 P4d
- **Test Type**：Negative / Integration — **DoD 核心案例**

---

### TS-MSSQL-P4D-CLEANUPE2E-003：`tempdb.sys.objects` 依本次 `logId` 前 8 碼之 LIKE 掃描，零殘留（防禦性全域掃描，非僅逐一點名查詢）
- **Related Requirement**：I-MSSQL-TEMPTABLE-CLEANUP-01 延伸防線（P4c 已知 dedup/target-load 內部表命名可能未被逐一枚舉到，用萬用字元掃描作最後防線）

---

## 十二、REG — 回歸

### TS-MSSQL-P4D-REG-001（DoD 紅線）：`npx tsc --noEmit -p tsconfig.build.json` 乾淨
- **Related Requirement**：專案既有 DoD 紅線慣例

---

### TS-MSSQL-P4D-REG-002：`DB_TYPE!=='mssql'`（PG/sqlite）路徑之 `createDispatcher()` 不受本文件新增測試檔影響，依然回傳 9 個 PG handler
- **Related Requirement**：P4c DISPATCH-004 既有回歸之最終再確認情境

---

### TS-MSSQL-P4D-REG-003：P4a/P4b/P4c 既有全部測試套件不回歸
- **Related Requirement**：既有套件回歸

---

### TS-MSSQL-P4D-REG-004：本文件於 `cdmp_test`（5433）寫入之測試資料不干擾同 DB 既有 F098~F109 pg.spec 套件（序列執行 + 前綴隔離 + `afterAll` 精準清除）
- **Related Requirement**：§0.5 政策；既有共用 DB 隔離慣例

---

### TS-MSSQL-P4D-REG-005：PG 版 56 節點 pipeline（未經本次 MSSQL 化異動）於 PG dispatcher 下行為與 P4 系列改動前一致（黑箱契約不變）
- **Related Requirement**：AD §1.2「PG 分支完全不動」不變式

---

## 十三、STATIC — 事實鎖定

### TS-MSSQL-P4D-STATIC-001（查證發現 1 落地）：真實 pipeline 節點數＝56、邊數＝55，nodeType 分佈鎖定（`{raw_data_extract:5, derived_field:7, lookup:31, merge:4, dedup:3, type_cast:2, field_mapping:2, conditional:1, target_load:1}`）
- **Related Requirement**：查證發現 1；供未來 AD 修訂與本文件維持同步
- **Test Type**：Regression / Unit — 靜態讀取 `etl-pipelines.json`，非真實連線

---

### TS-MSSQL-P4D-STATIC-002：14 張 raw fixture 表命名清單鎖定（5 extract + 9 lookup fallback 名稱字面值）
- **Related Requirement**：查證發現 2

---

### TS-MSSQL-P4D-STATIC-003（🔴 MUST-FIX，呼應 §四）：全部本文件測試檔案原始碼中 `isTestRun` 相關字面值靜態掃描，確認 DoD 核心測試檔（E2E-RUN/TIEBREAK/EQ-PG/CHARSET/NULLEXC/LOOKUPMISS/IDEMPOTENT）皆為 `isTestRun: false`
- **Related Requirement**：查證發現 4；與 §四 ISTESTRUN-001 形成雙重防線（該案例為執行期斷言，本案例為原始碼靜態掃描，兩層防禦避免任何一層被繞過）

---

### TS-MSSQL-P4D-STATIC-004：`pipeline-runner.ts`/`node-dispatcher.ts`/`node-output-store.ts`/`types.ts` 於本輪未被修改（AD §1.2 凍結清單延伸至 P4d 之最終確認）
- **Related Requirement**：AD §1.2「driver-agnostic 抽象完全不動」不變式最終驗收

---

## 附：與 AD-E07-41 §9 P4d DoD 逐條對應

| AD §9 P4d DoD 原文 | 對應測試群組 |
|---|---|
| 「53〔實 56〕節點 pipeline 對真實 MSSQL 容器完整跑通」 | §三 E2E-RUN-001/002 |
| 「customer_core 落地資料與 PG 版本逐欄逐列比對」 | §六 EQ-PG（degradable） |
| 「§4.3 邊界案例若觸發則記錄（非阻擋）」 | §五 TIEBREAK（全群組，尤其 TIEBREAK-003） |
| （任務書擴充）「零錯誤完成、9 handler 依序執行、## 貫穿+全清」 | §三 E2E-RUN-003、§十一 CLEANUP-E2E |
| （任務書擴充）「中文/NULL/lookup 未命中」 | §七 CHARSET、§八 LOOKUPHIT/LOOKUPMISS、§九 NULLEXC |
| （任務書擴充）「冪等」 | §十 IDEMPOTENT |
| （任務書擴充）「回歸：PG 路徑不變；tsc」 | §十二 REG |
