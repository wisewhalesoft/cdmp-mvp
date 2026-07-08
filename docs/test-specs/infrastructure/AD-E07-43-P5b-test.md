---
type: test-design-infrastructure
test-spec-id: AD-E07-43-P5b
feature_name: MSSQL 全面遷移 P5b — 其餘 5 條生產 ETL Pipeline 端對端驗證（customer_core 以外，P5 全量 CI + 業務簽核之前置依賴）
priority: P0-MVP
related_spec:
  - /docs/specs/implementation-log/AD-E07-43-mssql-p5-ci-signoff.md（§2.2 P5b 範圍定義、§5 P5b DoD 三條、§1 排序：P5a→P5b→P5c）
  - /docs/specs/implementation-log/AD-E07-41-P4c-impl.md（target-load-handler-mssql.ts 三種 loadMode 落地事實；DEV-P4C-TABLES 偏差：CDMP_TEST 未必已套用完整 baseline，target 表需前置存在性守門）
  - /docs/specs/implementation-log/AD-E07-41-P4d-impl.md（56 節點端對端手法先例；ISTESTRUN 陷阱佐證；交叉查實表列數原則）
  - /docs/test-specs/infrastructure/AD-E07-41-P4d-test.md（Harness/EQ 分層慣例、DISPATCH-E2E 方案甲/乙分工沿用）
  - /docs/test-specs/infrastructure/AD-E07-41-P4c-test.md（FULLMODE 11 案例＋PARTITION 6 案例＋TLDEDUP 11 案例——composite PK dedup／partition_replace 語意已於單元層級驗證，本文件不重新推導機制本身，僅驗證真實 pipeline 接線）
  - apps/api/src/database/seeds/data/etl-pipelines.json（5 條 pipeline 定義，本文件全部真實資料事實之唯一來源；lines 1-1679，不含 "ETL for Customer Core"）
  - apps/api/src/modules/etl/engine/handlers/target-load-handler-mssql.ts（三種 loadMode 之真實 SQL 語意，逐行查證）
  - apps/api/src/modules/etl/engine/pipeline-runner.ts（逐行查證：全檔無 startTransaction/commitTransaction，§六 ATOMIC 群組唯一依據）
  - apps/api/src/database/entities/ob-pool-data.entity.ts、ob-pool-data-list.entity.ts、ob-emphire.entity.ts、ob-calendar.entity.ts、ob-arreturndf-min-cap.entity.ts（5 條 pipeline 之目標表 PK／NOT NULL／型別事實）
covers: []
spec_version: "1.0"
date: 2026-07-08
last_updated: 2026-07-08
---

# AD-E07-43 P5b：MSSQL 全面遷移 — 其餘 5 條生產 ETL Pipeline 端對端驗證 — 測試設計

> 本文件覆蓋 AD-E07-43「MSSQL 全面遷移 P5（全量 CI + F067 式業務簽核）」之 **P5b 切片**（AD §2.2 + §5 P5b DoD）。AD §2.2 明文定位：「非新增完整測試套件（9 個 handler 本身已於 P4a~c 個別驗證過），此處僅是端對端接線驗證，工作量遠小於 P4 原本的量級」。**本文件不重新推導 target-load 三種 loadMode 之機制本身**（P4c 已以合成 fixture 完整驗證：🔴🔴FULLMODE 11 案例含 composite PK 旗艦案例、🔴PARTITION 6 案例、🔴🔴TLDEDUP 11 案例），聚焦於「這 5 條真實、未簡化的生產 pipeline 定義，透過真實 `NodeDispatcher`＋`PipelineRunner.run()`，在 MSSQL 上首次被端對端跑通」是否成立，以及 P4c 已驗證之機制被真實 field_mapping 節點餵入真實欄位名稱後是否依然成立（接線正確性，非機制正確性）。
>
> **明確排除**：target-load 三種 loadMode 之 SQL 方言轉換細節（P4a/b/c 已覆蓋）；bulk-load raw staging 寫入端（P4e，本文件以 fixture 直接建表取代，比照 P4d 手法）；月跑 Stage 1-4 邏輯本身（P3 系列已覆蓋，且與本文件 5 條 pipeline 無直接呼叫關係，僅資料上游依賴）；PG vs MSSQL 完整月跑逐列比對（P5c MONTHRUN-DIFF，需本文件 P5b 完成後才能進行，因月跑讀取的 `ob_pool_data`/`ob_pool_data_list`/`ob_emphire`/`ob_calendar`/`ob_arreturndf_min_cap` 五表需先有真實資料）；datetime2 時區精確性（P5d，業務/維運裁示範疇）。
>
> **★ test-designer 逐檔查證 + 對照真實 `etl-pipelines.json`／`target-load-handler-mssql.ts`／`pipeline-runner.ts`／5 張目標表 entity 發現之關鍵事實（本文件測試設計之唯一真實資料來源）**：
>
> 1. **5 條 pipeline 皆為極簡 DAG（3~4 節點），且僅使用 4 種 handler 類型中的一個子集，與 P4d customer_core 之 56 節點/9 handler 類型形成鮮明對比**：全部 5 條合計 16 節點、11 條邊，`nodeType` 分佈為 `raw_data_extract:5, field_mapping:5, conditional:1, target_load:5`——**完全不含** `lookup`/`merge`/`dedup`/`type_cast` 節點。逐條拓樸：`e1→fm1→tl1`（3 條：`ob_arreturndf_min_cap`/`ob_calendar`/`ob_pool_data`）、`e1→fm1→cd1→tl1`（1 條：`ob_emphire`，多一個 conditional 節點）、`e1→fm1→tl1`（`ob_pool_data_list`，`tl1` 為 `partition_replace` 而非 `fullMode`）。
> 2. **🔴🔴（本文件最高風險發現）P5b 5 條 pipeline 全數無 `type_cast` 節點，數值/日期欄位完全依賴 MSSQL 隱式轉換，且 fullMode/partition_replace 路徑無 NOT NULL 業務欄防呆（ghostGate 僅 UPSERT 路徑獨有）**：`raw_data_extract` 之 fixture／真實 bulk-load raw staging 表慣例皆為 `NVARCHAR(255) NULL`（比照 P4d `_p4d-fixtures.ts:170` 全欄位字面）；`field_mapping` 僅重新命名欄位，不做任何型別轉換；`target-load-handler-mssql.ts` 對 fullMode/partition_replace 兩路徑（lines 129-206）僅對 `matchedInputColumns` 中判定為 varchar 類型者套用 `NULLIF(TRIM())`（line 100-103），其餘欄位原樣傳遞，最終單一 `INSERT INTO target (...) SELECT (...) FROM tempTable` 語句由 MSSQL 對 numeric/date 目標欄位做**隱式轉換**（非 `TRY_CAST`）。相較之下，customer_core UPSERT 路徑受益於上游 `type_cast` 節點的 `TRY_CAST`（P4a 已驗證優雅降級為 NULL），P5b 這 5 條 pipeline **完全沒有這層防護**——任何一筆髒資料（非數字字串進 `numeric` 欄、非日期格式進 `date`/`datetime2` 欄）會使整條 `INSERT` 語句拋錯（單一陳述式、非逐列容錯）。
> 3. **🔴🔴（與上一發現直接關聯）`pipeline-runner.ts` 逐行查證全檔零 `startTransaction`/`commitTransaction`/`rollbackTransaction`，fullMode 之 `TRUNCATE TABLE` 與後續 `INSERT` 為兩個獨立、無交易保護的陳述式（`target-load-handler-mssql.ts:192-203`）**：若 `TRUNCATE` 成功後 `INSERT` 因發現 2 之隱式轉換失敗或 NOT NULL 違反而拋錯，目標表會被留在**已清空、未重新填入**的狀態——此為此 pipeline 引擎既有架構特性（PG 版 `target-load-handler.ts:192-206` 逐行核對亦為同一模式，**非 MSSQL 專屬缺陷**，屬引擎既有設計非本輪引入），但 P4a~c 僅以「乾淨 fixture」單元測試 `TargetLoadHandlerMssql`，`p4c-target-load.mssql.spec.ts` 逐案核對後**未發現任何「TRUNCATE 成功後 INSERT 刻意失敗」情境的斷言**（grep `INSERT 失敗`/`溢位`/`overflow` 僅命中程式碼本身錯誤訊息字面，無對應測試案例）；P4d 僅涵蓋 UPSERT 路徑（`UPDATE`+`INSERT...WHERE NOT EXISTS`，失敗時不影響既有列，天生安全）。**本文件是 P4~P5 全系列第一次以真實 fullMode/partition_replace pipeline 端對端方式，有機會實際觸發並觀察此風險路徑的後果**，已獨立立 §六 ATOMIC 群組，列為 MUST-FIX 優先探測。
> 4. **`ob_emphire` pipeline 之 `cd1` conditional 節點將哨兵值 `resign_date='9999-12-31'` 轉為 `NULL`（`etl-pipelines.json:290-305`）**：`rules: [{targetColumn:'resign_date', conditions:[{when:"left.resign_date = '9999-12-31'", then:'NULL'}], elseValue:'left.resign_date'}]`。**⚠️ 與既有專案記憶 `feedback_emphire_active_resign_sentinel.md`（「在職＝resign_date NULL 或 >= 系統日〔哨兵 9999-12-31〕；禁用 IS NULL，真實資料無 NULL」）存在字面張力**：若本 pipeline 確實在職員工之 `resign_date` 會被此節點轉為 `NULL`，則下游查詢邏輯（`emphire-active.util`）若仍假設「真實資料無 NULL」可能已經或即將出現與實際 ETL 產出不一致的情況。**本文件不裁定何者為準**（不屬 test-designer 職責範圍），僅將此節點行為如實納入 §八 FIELD 群組之 DoD 驗證對象（確認 ETL 本身依定義正確執行轉換），並於 risks-and-gaps 等價段落（見本文件末「待回報事項」）標記此開放性問題，交 system-architect／使用者裁定是否為需修正的資料契約落差。
> 5. **5 張目標表 PK／NOT NULL／型別事實**（逐一讀 entity 確認，非 AD 字面推測）：
>    | Pipeline | 目標表 | loadMode | PK | 型別風險欄位 |
>    |---|---|---|---|---|
>    | `E07-OBARRETURNDF_MIN_CAP-Load` | `ob_arreturndf_min_cap` | `fullMode:true` | `appl_no`（varchar(20)，單欄） | `add_un_capital numeric(15,0)`；`_cdmp_extracted_at datetime2 NOT NULL`（handler 自動填，非來自 field_mapping） |
>    | `E07-OBCALENDAR-Load` | `ob_calendar` | `fullMode:true` | `calendar_date`（**原生 `date` 型別，非 varchar**，單欄） | `rest_flg varchar(1) NOT NULL`（**無 nullable，且無 default**）；`calendar_date` 為日期隱式轉換首當其衝欄位（PK 本身） |
>    | `E07-OBEMPHIRE-Load` | `ob_emphire` | `fullMode:true` | `emp_id`（varchar(10)，單欄） | `hire_date`/`resign_date` 皆原生 `date` 型別（非 `dateColumnType`/`datetime2`，對稱 P3d 已驗證之「同表不同日期欄型別可不同」教訓） |
>    | `E07-OBPOOLDATA-Load` | `ob_pool_data` | `fullMode:true` | `(orgno, appl_no)` **composite**（各 varchar(2)/varchar(10)） | 114 欄映射中約 20 個 `numeric(p,s)` + 13 個 `dateColumnType`（datetime2）欄；NOT NULL 業務欄：`custo_no`/`sta_code`/`dept_id`/`list_type`/`settle_src`（longtext NOT NULL） |
>    | `E07-OBPOOLDATA_LIST-Load` | `ob_pool_data_list` | `loadMode:'partition_replace'`，`partitionColumn:'data_source'`，`partitionValue:'etl_load'` | `(list_no, orgno, appl_no)` **composite 3 欄** | 122 欄映射，型別分佈同 `ob_pool_data`；**全部業務欄皆 nullable**（與 `ob_pool_data` 不同，無 NOT NULL 業務欄防呆需求）；`score`/`tier_level`/`card_level`/`cr_id`/`cr_nm`/`is_cr`/`assignday` 等 7 欄**不在**本 pipeline 之 122 個 field_mapping 內（由月跑 Stage 2-4 另行寫入 `ob_monthly_run_result`，非本表——F094 之後本表僅為 ETL 單一來源，見 `etl-pipelines.json:989` description） |
> 6. **`target-load-handler-mssql.ts` 為 6 條 pipeline（含 customer_core）共用同一份程式碼**（`fullMode`/`loadMode` 兩個 `node.data` 欄位分流三條路徑），本文件之 5 條 pipeline 皆走同一支未曾在真實 DAG 中被此程式碼路徑端對端驅動過的程式碼（P4c 僅以合成單一節點 fixture 呼叫 `TargetLoadHandlerMssql.execute()`，未經過真實 `field_mapping` 節點產出的欄位/型別）。
> 7. **`partition_replace` 路徑明確無內部 PK 去重**（`target-load-handler-mssql.ts:129` 註解「無 DISTINCT ON / tie-breaker」）：若來源 raw 資料存在重複 `(list_no, orgno, appl_no)` 組合，`INSERT` 會直接撞 PK unique constraint 拋錯（不像 `fullMode` 路徑會先以 `_seq` tie-breaker 去重）。此為 P5b 唯一 partition_replace pipeline 之既有設計（P4c PARTITION 群組已驗證此語意本身），本文件僅需確認真實 `OBPOOLDATA_LIST` 欄位對映後此行為依然成立。
> 8. **PG 版 `target-load-handler.ts` 逐行核對（lines 103-216）與 MSSQL 版結構完全對稱**（同樣的 TRUNCATE+INSERT 兩段式、同樣的 partition_replace 無 dedup、同樣零交易保護）：故發現 3 之風險為**兩引擎共通的既有架構特性**，§十一 EQ-PG 群組據此僅做 best-effort 一致性確認，不預期發現 MSSQL 特有分歧。

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件全部 + `AD-E07-43-mssql-p5-ci-signoff.md`（§2.2、§5 P5b）+ `AD-E07-41-P4c-impl.md`（三種 loadMode 落地事實，不重新設計）+ `target-load-handler-mssql.ts`（待測物件，本輪**不可修改**——若 §六 ATOMIC 群組發現真實資料遺失風險，交 impl log 回報而非本輪修復，屬架構層決策）+ `pipeline-runner.ts`/`node-dispatcher.ts`（真執行核心，比照 P4d AD §1.2 精神視為凍結）+ `apps/api/src/database/seeds/data/etl-pipelines.json`（5 條 pipeline 定義，lines 1-1679）+ 5 張目標表 entity（`ob-pool-data.entity.ts`/`ob-pool-data-list.entity.ts`/`ob-emphire.entity.ts`/`ob-calendar.entity.ts`/`ob-arreturndf-min-cap.entity.ts`）+ `_p4d-fixtures.ts`（raw fixture 建表 helper 可直接複用模式） |
| QA / Tester | 本文件 + `risks-and-gaps.md`（MSSQL P5b 風險段落，尤其 ATOMIC 群組） |
| DevOps / CI/CD | 本文件「零、測試環境與 Harness 設計」§0.4（PG 對照 degradable 政策） |
| Product Analyst / Architect | 本文件★發現 4（`ob_emphire` resign_date 哨兵→NULL 與既有記憶之張力，開放性問題，交裁定） |

---

## 零、測試環境與 Harness 設計

### 0.1 沿用既有 Harness，不新建

沿用 `mssql-env-preload.ts` + `_p4a-mssql-harness.ts`（`connectMssql`/`teardownMssql`/`uniqueLogId`/`objectExists`）；`vi.setConfig({ testTimeout: 60000 })`（比照 P4c，非 P4d 的 120000——5 條 pipeline 皆為 3~4 節點極簡 DAG，單條執行時間遠低於 56 節點）。PG 側沿用既有 `.pg.spec.ts` 家族之 `pgPortReachable()` 慣例（`127.0.0.1:5433`），不新建連線 helper。

### 0.2 DISPATCH-E2E 決策關卡：沿用 P4d §0.2 方案甲/乙分工，不重新論證

**方案乙（直接建構 `NodeDispatcher`+`PipelineRunner`）為 DoD 核心**（§三 E2E-RUN 全數採用）；**方案甲（`EtlPipelineExecutionService.triggerExecute`）僅設計 1 個補充性 smoke 案例**（§二）。理由與 P4d 完全相同（`DISPATCHE2E-GATE-001` 決策已於 P4d 落地並記錄，本文件比照沿用，不重新開決策關卡）。

### 0.3 Fixture 建構：5 張 raw 表（各 pipeline 一張，NVARCHAR(255) 全欄位）+ 5 張目標表前置存在性

| Pipeline | raw fixture 表名 | 欄位來源 |
|---|---|---|
| `E07-OBARRETURNDF_MIN_CAP-Load` | `raw_970da79c` | `APPL_NO`, `ADD_UN_CAPITAL`（2 欄，field_mapping 逐一列舉） |
| `E07-OBCALENDAR-Load` | `raw_dfb3b313` | `CALENDAR_DATE`, `REST_FLG`（2 欄） |
| `E07-OBEMPHIRE-Load` | `raw_e1e951d7` | `EMP_ID`/`EMP_NM`/`ID`/`DEPT_CODE`/`DEPT_NAME`/`TITLE_CODE`/`TITLE_NAME`/`JFUN_ID`/`JFUN_NM`/`HIRE_DATE`/`RESIGN_DATE`/`EMAIL`/`IS_AUTH`（13 欄，`etl-pipelines.json:212-278` 逐一核對） |
| `E07-OBPOOLDATA-Load` | `raw_6d58393b` | 114 欄，**建議 tdd-implementation 程式化掃描** `fm1.mappings[].sourceColumn` 產生欄位清單（比照 P4d GATE-001 手法），不人工臆測（114 欄人工列舉極易遺漏） |
| `E07-OBPOOLDATA_LIST-Load` | `raw_33dc3771` | 122 欄，同上程式化衍生 |

**與 P4d 的關鍵差異（更簡單）**：本文件 5 條 pipeline 皆無 `lookup` 節點，**不需要**額外的 lookup 來源表（P4d 14 張中的 9 張 lookup 表在本文件完全不適用）；raw 表與 pipeline 為一對一，無 P4d 之「1 pipeline 對應 14 張表」複雜度。

**5 張目標表前置存在性**：沿用 `_p4c-target-tables.ts`/`_p4d-fixtures.ts` 之 idempotent 自建模式（`DEV-P4C-TABLES` 偏差記錄已證 CDMP_TEST 未必已有完整 baseline）。`datasources`/`extraction_tasks` 兩表之存在性同樣需確保（`resolveRawTable` 依賴，P4d 查證發現 3 之結論直接沿用）——若 P5a（CI dbo bootstrap）已先行落地，本文件的 5 張目標表與 `datasources`/`extraction_tasks` 理論上已由 `migration:run` 建妥，Harness 仍應保留 idempotent 自建作為本機開發環境（P5a 未必已跑）的防禦網，比照 P4c/P4d 既有慣例。

### 0.4 Fixture 資料設計原則（依 pipeline 分別設計，非統一矩陣）

| Pipeline | Happy Path | 邊界/風險列 |
|---|---|---|
| `ob_arreturndf_min_cap` | 2-3 筆合法 `appl_no`+數字 `add_un_capital` | 1 筆 `appl_no` 重複（觸發 fullMode PK dedup）；1 筆 `add_un_capital` 為超長數字字串（探測 `numeric(15,0)` 隱式轉換溢位，§六 ATOMIC 專用，**與 happy path 分開的獨立測試批次**，不可混入同一批次污染其他案例） |
| `ob_calendar` | 3-5 筆合法工作日/假日（`rest_flg`='0'/'1'） | 1 筆 `calendar_date` 重複（PK dedup）；§六 ATOMIC 專用批次：1 筆 `rest_flg` 為空字串（`NULLIF(TRIM())`→NULL→違反 NOT NULL） |
| `ob_emphire` | 2 筆在職（`resign_date`='9999-12-31'）+ 2 筆離職（`resign_date`=實際日期）+ 1 筆中文姓名 | `emp_id` 重複（PK dedup） |
| `ob_pool_data` | 3-5 筆合法案件（`orgno`+`appl_no` 不重複，涵蓋 NOT NULL 業務欄皆有值、中文 `cust_name`/`dept_name`） | `(orgno,appl_no)` 重複（composite PK dedup，對稱 P4c 旗艦案例但改用真實欄位）；§六 ATOMIC 專用批次：1 筆 NOT NULL 欄（如 `custo_no`）為空字串 |
| `ob_pool_data_list` | 3-5 筆合法案件（`(list_no,orgno,appl_no)` 不重複）+ 1 筆與 fixture 無關、`data_source≠'etl_load'` 之既存合成標記列（用於 §五 PARTITION 群組驗證分區隔離） | `(list_no,orgno,appl_no)` 重複（**預期 INSERT 拋錯**，非去重，對稱發現 7） |

### 0.5 PG 對照之 degradable 政策（沿用 P4d §0.5，不重新論證）

`pgPortReachable()` 對 5433 回傳 `false` 時，§十一 EQ-PG 群組全數 `describe.skip` + `SKIP_REASON`，不阻擋本文件核心 DoD（§三 E2E-RUN 為唯一不可退讓之硬性 DoD）。若 5433 可達，PG 側需在 `cdmp_test` 建立對稱的 5 張 raw fixture 表（PG 版 5 張目標表已存在於 baseline，不需自建），寫入列以顯著前綴隔離並於 `afterAll` 精準清除。

---

## 一、GATE — 前置存在性與資料形狀決策關卡

### TS-MSSQL-P5B-GATE-001（🔴 決策關卡）：`ob_pool_data`/`ob_pool_data_list` 兩張 114/122 欄 raw fixture 表之欄位清單衍生方式
- **Related Requirement**：★發現 5（114/122 欄規模）
- **Test Type**：Decision Gate（文件化守門）
- **Expected Result**：impl log 記錄欄位清單衍生方法（建議：程式化掃描 `fm1.mappings[].sourceColumn`），若人工列舉須附上與 JSON 逐一核對後無遺漏之佐證；欄位遺漏會使 field_mapping 之 `dropUnmapped:true` 靜默丟棄該欄，非拋錯，風險具隱蔽性

---

### TS-MSSQL-P5B-GATE-002：`datasources`/`extraction_tasks` 兩表僅需存在性（沿用 P4d 查證發現 3）
- **Related Requirement**：`resolveRawTable` 依賴（P4a/P4d 已驗證邏輯，本案例僅確認前置條件）
- **Test Type**：Positive / Unit
- **Expected Result**：`beforeAll` 後 `OBJECT_ID('dbo.datasources')`/`OBJECT_ID('dbo.extraction_tasks')` 皆非 `NULL`

---

### TS-MSSQL-P5B-GATE-003：5 條 pipeline 定義各自於本 fixture 下確實無環（`topologicalSort` 前置回歸）
- **Related Requirement**：`pipeline-runner.ts` 既有 cycle-detection 邏輯回歸（非新邏輯）
- **Test Type**：Regression / Unit

---

### TS-MSSQL-P5B-GATE-004：5 張目標表 PK 定義與 entity 宣告一致（`getPrimaryKeyColumns` 之前置事實核對）
- **Related Requirement**：★發現 5 表格；`target-load-handler-mssql.ts` fullMode 路徑之 `getPrimaryKeyColumns` 依賴
- **Test Type**：Positive / Unit
- **Expected Result**：`ob_arreturndf_min_cap`→`[appl_no]`；`ob_calendar`→`[calendar_date]`；`ob_emphire`→`[emp_id]`；`ob_pool_data`→`[orgno, appl_no]`（順序不拘，集合相等即可）；`ob_pool_data_list`→`[list_no, orgno, appl_no]`

---

### TS-MSSQL-P5B-GATE-005：5 條 pipeline 之 `targetTable`/`fullMode`/`loadMode`/`partitionColumn`/`partitionValue` 節點設定值鎖定（供 §四/§五 分流依據）
- **Related Requirement**：★發現 1、5、7
- **Test Type**：Regression / Unit — 靜態讀取 `etl-pipelines.json`，非真實連線
- **Expected Result**：4 條 `fullMode:true`（`ob_arreturndf_min_cap`/`ob_calendar`/`ob_emphire`/`ob_pool_data`）；1 條 `loadMode:'partition_replace'` + `partitionColumn:'data_source'` + `partitionValue:'etl_load'`（`ob_pool_data_list`）

---

## 二、DISPATCH-E2E — Service-Level 補充 Smoke（§0.2 方案甲）

### TS-MSSQL-P5B-DISPATCHE2E-001（🔴 補充 DoD）：以真實 `createDispatcher()`（`DB_TYPE=mssql`）驅動 1 條代表性 pipeline（建議 `ob_calendar`，最簡單）至 `completed`
- **Related Requirement**：AD §2.2「理論上可直接沿用同一批已 MSSQL 化的 handler 執行，但尚未被端對端證明過」
- **Test Type**：Positive / Integration
- **Expected Result**：`nodeLogs` 全數 `completed`；`ob_calendar` 表確有新列（間接證明 `isTestRun` 未被誤設為 `true`）

---

### TS-MSSQL-P5B-DISPATCHE2E-002：`createDispatcher()` 回傳之 9 個 handler 集合中，本文件實際用到的 3 種（`ExtractHandlerMssql`/`FieldMappingHandlerMssql`/`ConditionalHandlerMssql`）+ `TargetLoadHandlerMssql` 皆為 mssql 版本（非誤落 PG 分支）
- **Related Requirement**：P4c DISPATCH-001 落地事實延伸確認（非重新驗證接線邏輯本身）
- **Test Type**：Regression / Unit

---

## 三、E2E-RUN — 5 條 Pipeline 端對端跑通（🔴🔴 DoD 核心）

> 每條 pipeline 3 個案例：①全節點 completed；②目標表列數交叉查證（`SELECT COUNT(*)`，非僅信 `nodeLogs`，比照 P4d ISTESTRUN 陷阱教訓）；③代表性列內容正確性抽樣。

### TS-MSSQL-P5B-E2E-ARRETURNDF-001/002/003（🔴🔴 DoD 核心）：`E07-OBARRETURNDF_MIN_CAP-Load` 端對端
- **Related Requirement**：AD §5 P5b DoD #1/#2/#3
- **Test Type**：Positive / Integration
- **Expected Result**：3 節點皆 `completed`；`ob_arreturndf_min_cap` 之 `COUNT(*)` 等於 fixture 唯一 `appl_no` 數；抽樣列 `add_un_capital` 數值正確 round-trip

---

### TS-MSSQL-P5B-E2E-CALENDAR-001/002/003（🔴🔴 DoD 核心）：`E07-OBCALENDAR-Load` 端對端
- **Related Requirement**：同上
- **Expected Result**：3 節點皆 `completed`；`ob_calendar` `COUNT(*)` 正確；`calendar_date`（PK，`date` 型別）與 `rest_flg` 正確 round-trip（含至少一筆假日 `rest_flg='1'`、一筆工作日 `'0'`）

---

### TS-MSSQL-P5B-E2E-EMPHIRE-001/002/003（🔴🔴 DoD 核心）：`E07-OBEMPHIRE-Load` 端對端（含 conditional 節點）
- **Related Requirement**：同上；★發現 1（唯一含 `conditional` 節點之 pipeline）
- **Expected Result**：4 節點皆 `completed`（含 `cd1`）；`ob_emphire` `COUNT(*)` 正確；中文 `emp_nm`/`dept_name` round-trip；`hire_date`/`resign_date`（原生 `date`）正確

---

### TS-MSSQL-P5B-E2E-POOLDATA-001/002/003（🔴🔴 DoD 核心，旗艦：114 欄規模）：`E07-OBPOOLDATA-Load` 端對端
- **Related Requirement**：同上；★發現 2、5（114 欄、composite PK、NOT NULL 業務欄、numeric/date 隱式轉換）
- **Expected Result**：3 節點皆 `completed`；`ob_pool_data` `COUNT(*)` 等於 fixture 唯一 `(orgno,appl_no)` 組數；抽樣列橫跨全部 114 欄之型別代表（至少各 1 個 numeric/date/中文 varchar 欄）正確 round-trip；NOT NULL 業務欄（`custo_no`/`sta_code`/`dept_id`/`list_type`/`settle_src`）於 happy path fixture 皆有值、無違反

---

### TS-MSSQL-P5B-E2E-POOLDATALIST-001/002/003（🔴🔴 DoD 核心，旗艦：122 欄 + partition_replace）：`E07-OBPOOLDATA_LIST-Load` 端對端
- **Related Requirement**：同上；★發現 5、7（3 欄 composite PK、無 NOT NULL 業務欄、`data_source` 分區標記）
- **Expected Result**：3 節點皆 `completed`；`ob_pool_data_list WHERE data_source='etl_load'` 之 `COUNT(*)` 等於 fixture 唯一 `(list_no,orgno,appl_no)` 組數；抽樣列 `data_source='etl_load'` 正確填入；`score`/`tier_level`/`card_level`/`cr_id`/`cr_nm`/`is_cr`/`assignday` 7 欄皆為 `NULL`（未被此 pipeline 觸及，對稱★發現 5 之最後一列）

---

### TS-MSSQL-P5B-E2E-HANDLERTYPES-001：本文件 5 條 pipeline 合計實際使用之 4 種 `nodeType`（`raw_data_extract`/`field_mapping`/`conditional`/`target_load`）皆至少各被呼叫一次且成功，`lookup`/`merge`/`dedup`/`type_cast` 確認本輪不適用（非遺漏）
- **Related Requirement**：★發現 1（與 P4d 9 handler 類型對比之明確記錄）
- **Test Type**：Regression / Unit — 靜態讀取 `etl-pipelines.json` 交叉核對

---

## 四、FULLMODE-WIRING — 真實 Pipeline 驅動下 TRUNCATE+INSERT 語意接線確認（機制本身已由 P4c 驗證，不重新推導）

### TS-MSSQL-P5B-FULLMODE-001（🔴 DoD 核心）：4 條 fullMode pipeline 重跑前預先塞入「舊」列（非本次 fixture 之陳舊資料），端對端執行後舊列全數消失、僅存本次 fixture 列
- **Related Requirement**：AD §5 P5b「fullMode(4 條)＝TRUNCATE+INSERT(全量替換：預置舊列→跑後只剩新列、舊列清空)」
- **Test Type**：Positive / Integration — **DoD 核心案例**
- **Preconditions**：4 張目標表各自預先以獨立 `INSERT`（非經 pipeline）塞入 1-2 筆「陳舊」列（PK 值與本次 fixture 不重疊）
- **Expected Result**：4 條 pipeline 各自執行後，`SELECT COUNT(*) FROM <target>` 僅含本次 fixture 列，陳舊列查無

---

### TS-MSSQL-P5B-FULLMODE-002（🔴 composite PK 旗艦，真實接線）：`ob_pool_data` 之 `(orgno,appl_no)` 重複列，經真實 `e1→fm1→tl1` 端對端後恰保留 1 列（`_seq` tie-breaker，對稱 P4c 合成 fixture 案例，本案例改用真實欄位名稱驗證接線）
- **Related Requirement**：★發現 5；P4c FULLMODE 群組機制已驗證，本案例僅驗證真實 field_mapping 輸出欄位名稱（`orgno`/`appl_no`，非合成測試欄名）餵入後 `getPrimaryKeyColumns` 仍正確辨識
- **Test Type**：Positive / Integration
- **Expected Result**：`ob_pool_data WHERE orgno=<x> AND appl_no=<y>` 恰 1 列

---

### TS-MSSQL-P5B-FULLMODE-003：單欄 PK（`ob_arreturndf_min_cap`/`ob_calendar`/`ob_emphire`）之重複列同樣正確去重（非 composite 才需要 dedup 之對照組）
- **Related Requirement**：P4c FULLMODE 機制回歸確認
- **Test Type**：Positive / Integration

---

### TS-MSSQL-P5B-FULLMODE-004：4 條 fullMode pipeline 各自重跑 3 次（各自獨立 `logId`），去重勝出列內容一致（決定性回歸，對稱 P4d TIEBREAK-002 精神）
- **Related Requirement**：I-MSSQL-DEDUP-TIEBREAK-01
- **Test Type**：Positive / Integration

---

### TS-MSSQL-P5B-FULLMODE-005：`ob_calendar` PK 為原生 `date` 型別（非 varchar）之隱式轉換 round-trip 正確（含月初/月底/閏年 2/29 邊界日期字面值）
- **Related Requirement**：★發現 5（`calendar_date` PK 本身即為日期隱式轉換首當其衝欄位）
- **Test Type**：Boundary / Integration

---

## 五、PARTITION-WIRING — `ob_pool_data_list` DELETE+INSERT 分區語意接線確認（機制本身已由 P4c 驗證）

### TS-MSSQL-P5B-PARTITION-001（🔴🔴 DoD 核心）：真實 pipeline 執行前預先塞入一筆 `data_source≠'etl_load'`（如合成標記 `'_P5B_OTHER_'`）之既存列，端對端執行後該列不受影響（未被 DELETE）
- **Related Requirement**：AD §5 P5b「partition_replace(ob_pool_data_list)＝DELETE(依 partition 鍵)+INSERT(只 replace 該 partition、他 partition 保留)」
- **Test Type**：Positive / Integration — **DoD 核心案例**
- **Expected Result**：`SELECT COUNT(*) FROM ob_pool_data_list WHERE data_source='_P5B_OTHER_'` 執行前後不變（恰 1）

---

### TS-MSSQL-P5B-PARTITION-002（🔴 DoD 核心）：`data_source='etl_load'` 之既存「舊」列（模擬上次 ETL 殘留），端對端執行後全數被本次 fixture 取代（非疊加）
- **Related Requirement**：同上「只 replace 該 partition」語意之另一半（本分區內全量替換）
- **Test Type**：Positive / Integration — **DoD 核心案例**

---

### TS-MSSQL-P5B-PARTITION-003（🔴 負向對照，非 bug）：來源 raw 含重複 `(list_no,orgno,appl_no)` 組合時，`INSERT` 因撞 PK 拋錯，節點標記 `failed`（partition_replace 路徑無內部去重，對稱★發現 7；本案例確認真實接線下此既有語意依然成立，非本輪引入的新缺陷）
- **Related Requirement**：`target-load-handler-mssql.ts:129` 註解「無 DISTINCT ON / tie-breaker」
- **Test Type**：Negative / Integration
- **Expected Result**：`tl1.status==='failed'`；`ob_pool_data_list WHERE data_source='etl_load'` 之列數應與 §六 ATOMIC 群組共同確認（見 TS-MSSQL-P5B-ATOMIC-004，此為 DELETE 已執行、INSERT 未完成之交集情境）

---

### TS-MSSQL-P5B-PARTITION-004：`score`/`tier_level`/`card_level`/`cr_id`/`cr_nm`/`is_cr`/`assignday` 7 欄不在 field_mapping 對映範圍內，`INSERT` 語句之 `insertColumns` 正確排除此 7 欄（非誤帶入 NULL 覆寫，因這些欄位本輪根本未被選取，防止未來 field_mapping 誤改動時才發現遺漏）
- **Related Requirement**：★發現 5 最後一列；月跑 Stage 2-4／`ob_monthly_run_result`（F094）契約邊界
- **Test Type**：Regression / Unit — 靜態讀取 `etl-pipelines.json` `fm1.mappings` 確認 7 欄不存在其中

---

## 六、🔴🔴 ATOMIC — TRUNCATE/DELETE 後 INSERT 失敗之資料完整性風險（本文件最高風險群組，MUST-FIX 優先探測）

> **前提**：★發現 2、3——`pipeline-runner.ts` 全檔無交易保護；P5b 5 條 pipeline 皆無 `type_cast` 節點防線；fullMode/partition_replace 路徑無 NOT NULL 業務欄防呆。本群組**目的是探測既有引擎行為的實際後果**，不預設答案，亦不在本輪修復（`target-load-handler-mssql.ts`/`pipeline-runner.ts` 皆列為本輪凍結檔案）——若探測結果證實資料遺失風險，屬架構層級決策，經 impl log 回報 system-architect，不由 tdd-implementation 自行修改凍結檔案。

### TS-MSSQL-P5B-ATOMIC-001（🔴🔴 MUST-FIX，決定性探測）：`ob_calendar`（單欄 PK，最簡單案例）預先塞入 3 筆既存合法列，接著以「§0.4 ATOMIC 專用批次」（含 1 筆 `rest_flg` 空字串觸發 NOT NULL 違反）觸發端對端執行，確認 `tl1` 失敗後 `ob_calendar` 之實際列數
- **Related Requirement**：★發現 3
- **Test Type**：Probe / Integration — **不預設答案，兩種結果皆記錄，但需明確判定何者發生**
- **Steps**：
  1. 預先塞入 3 筆既存合法列，記錄 `COUNT(*)=3`
  2. 執行含髒資料批次的 pipeline，等待 `tl1.status==='failed'`
  3. 立即查詢 `SELECT COUNT(*) FROM ob_calendar`
- **Expected Result（兩分支皆為合法觀察，但必須明確記錄）**：
  - **分支 A（資料遺失）**：`COUNT(*)=0`（`TRUNCATE` 已執行、`INSERT` 未完成，3 筆既存列亦被清空）——**此為 🔴🔴 需回報 system-architect 之生產風險**，impl log 須以顯著標題記錄（比照 FINDING-P4D-01 格式）
  - **分支 B（有某種未知防護）**：`COUNT(*)=3`（既存列被保留）——記錄防護機制來源（如 `queryRunner` 本身外層已有交易包裝，非本文件已查證範圍），供未來 AD 修訂參考
- **本案例為本文件唯一容許「不確定結果」但要求務必執行並記錄結論的案例**，不可因「探測性質」而略過不做

---

### TS-MSSQL-P5B-ATOMIC-002（🔴🔴 MUST-FIX）：`ob_pool_data`（composite PK + 多個 NOT NULL 業務欄）之對稱探測，確認 ATOMIC-001 結論在複雜目標表上是否一致
- **Related Requirement**：同上，驗證結論不因表結構複雜度而改變
- **Test Type**：Probe / Integration
- **Preconditions**：§0.4 ATOMIC 專用批次（1 筆 `custo_no` 為空字串）

---

### TS-MSSQL-P5B-ATOMIC-003（🔴 數值隱式轉換溢位路徑，非 NOT NULL 路徑）：`ob_arreturndf_min_cap.add_un_capital numeric(15,0)` 餵入超長數字字串（如 16 位數），確認拋出 MSSQL arithmetic overflow 或類似錯誤訊息（比照 FINDING-P4D-01 家族，本次為隱式轉換而非顯式 `CAST`）
- **Related Requirement**：★發現 2
- **Test Type**：Negative / Integration
- **Expected Result**：`tl1.status==='failed'`，`errorMessage` 含 MSSQL 隱式轉換錯誤字樣；表最終列數同 ATOMIC-001 分支判定

---

### TS-MSSQL-P5B-ATOMIC-004（partition_replace 對稱探測）：`ob_pool_data_list` 之 §五 PARTITION-003 情境（撞 PK 拋錯）下，`DELETE` 已執行但 `INSERT` 未完成，確認該分區（`data_source='etl_load'`）最終列數
- **Related Requirement**：★發現 3、7 之交集；partition_replace 路徑同樣是「先破壞後重建」兩段式，同等風險
- **Test Type**：Probe / Integration
- **Expected Result**：`SELECT COUNT(*) FROM ob_pool_data_list WHERE data_source='etl_load'` 大概率為 0（`DELETE` 已提交，`INSERT` 整句失敗）；此為 PARTITION-003 之直接延伸，兩案例應合併判讀，非獨立變數

---

### TS-MSSQL-P5B-ATOMIC-005：PG 版本相同探測（degradable，5433 可達才執行）——確認★發現 3「兩引擎共通」之結論屬實，非本文件臆測
- **Related Requirement**：★發現 3 末句；EQ-PG degradable 政策
- **Test Type**：Probe / Integration — best-effort
- **Expected Result**：若 5433 可達，PG 版本應與 MSSQL 版 ATOMIC-001 呈現相同分支（A 或 B），佐證此為引擎共通架構特性而非方言差異；不可達則 skip，不影響 MSSQL 側結論

---

### TS-MSSQL-P5B-ATOMIC-006（決策關卡）：impl log 須以獨立顯著段落記錄 ATOMIC-001~005 之最終結論（比照 FINDING-P4D-01 格式），若證實分支 A（資料遺失）成立，需標註「潛在封鎖級」並列入待回報使用者/system-architect 事項，不可僅在測試檔內斷言了事而未浮現至文件層級
- **Related Requirement**：test-designer Auto-Challenge Logic「失敗或復原行為未定義時需標記」
- **Test Type**：Decision Gate（文件化守門）

---

## 七、ISTESTRUN — Dry-Run 陷阱（沿用 P4d 已驗證陷阱，本文件僅需靜態+單一動態確認，不需重新佐證機制本身）

### TS-MSSQL-P5B-ISTESTRUN-001（🔴 MUST-FIX）：本文件全部 E2E-RUN/FULLMODE/PARTITION/ATOMIC 測試檔中，`PipelineRunnerConfig.isTestRun` 皆為字面 `false`（靜態掃描）
- **Related Requirement**：P4d 查證發現 4 之延伸
- **Test Type**：Negative / Unit — 靜態 grep 守門

---

### TS-MSSQL-P5B-ISTESTRUN-002（陷阱佐證，1 案例代表即可，不需 5 條各自佐證——機制為同一份 `target-load-handler-mssql.ts` 程式碼）：以 `isTestRun=true` 跑 `ob_calendar` pipeline，證明 `nodeLogs` 全綠但目標表零寫入
- **Related Requirement**：P4d ISTESTRUN-002 精神延伸，確認同一段程式碼路徑在 fullMode 模式下（P4d 僅驗證過 UPSERT 模式）陷阱依然成立
- **Test Type**：Negative / Integration — 陷阱佐證

---

### TS-MSSQL-P5B-ISTESTRUN-003：`isTestRun=true` 對 `ob_pool_data_list`（partition_replace 模式）同理驗證（三種 loadMode 中僅 fullMode 與 partition_replace 未經 P4d 驗證過此陷阱，UPSERT 已由 P4d 驗證）
- **Related Requirement**：同上，補齊 partition_replace 路徑
- **Test Type**：Negative / Integration

---

## 八、FIELD — 欄位級正確性（sentinel／中文／NOT NULL／型別 round-trip）

### TS-MSSQL-P5B-FIELD-001（🔴 DoD 核心，★發現 4）：`ob_emphire` 在職員工（來源 `RESIGN_DATE='9999-12-31'`）端對端執行後 `resign_date` 確為 `NULL`（`cd1` 節點按定義正確執行）
- **Related Requirement**：`etl-pipelines.json:290-305` `cd1` 規則字面
- **Test Type**：Positive / Integration — **DoD 核心案例（驗證 ETL 本身正確性，不裁定與既有查詢邏輯記憶之張力何者為準）**

---

### TS-MSSQL-P5B-FIELD-002：`ob_emphire` 離職員工（來源 `RESIGN_DATE`≠`'9999-12-31'`）端對端執行後 `resign_date` 保留原始日期值（`cd1` 之 `elseValue` 分支）
- **Related Requirement**：同上

---

### TS-MSSQL-P5B-FIELD-003（決策關卡，回報用）：impl log 須記錄★發現 4 之開放性問題（`resign_date` NULL 化與既有記憶 `feedback_emphire_active_resign_sentinel.md` 之張力），交 system-architect／使用者裁定，非 test-designer 或 tdd-implementation 自行決定
- **Related Requirement**：test-designer Auto-Challenge Logic
- **Test Type**：Decision Gate（文件化守門）

---

### TS-MSSQL-P5B-FIELD-004：中文欄位 round-trip（`ob_emphire.emp_nm`/`dept_name`/`title_name`；`ob_pool_data.cust_name`/`dept_name`/`car_name`；`ob_pool_data_list` 同名欄位），涵蓋常見中文姓名/部門/罕用字
- **Related Requirement**：I-MSSQL-COLLATE-01 延伸
- **Test Type**：Positive / Integration

---

### TS-MSSQL-P5B-FIELD-005：`ob_pool_data`/`ob_pool_data_list` 之 numeric 欄位（如 `loan_totamt numeric(18,0)`/`pro_rate numeric(5,2)`/`term_amt numeric(19,4)`）於**合法**數值（非 ATOMIC 群組之髒資料）下正確 round-trip，含小數欄位精度不失真（如 `pro_rate='12.50'`→保留兩位小數）
- **Related Requirement**：★發現 2（隱式轉換之 happy path 對照組，先確認正常路徑無誤，再談 ATOMIC 群組的異常路徑）
- **Test Type**：Positive / Integration
- **Expected Result**：若本案例失敗，代表隱式轉換連合法數值都有精度問題（比 ATOMIC 群組更基礎的缺陷，應優先修復），與 §六 ATOMIC 之「異常值導致整批失敗」為不同層級的風險

---

### TS-MSSQL-P5B-FIELD-006：`ob_pool_data`/`ob_pool_data_list` 之 date/datetime2 欄位（如 `appl_date`/`first_pay_dt`/`maturity_dt`，皆 `dateColumnType`=`datetime2`）於合法日期字面值下正確 round-trip
- **Related Requirement**：★發現 5（`dateColumnType` 於 MSSQL 為 `datetime2`，`column-types.ts:10-15` 確認）
- **Test Type**：Positive / Integration
- **明確排除**：非午夜時間分量之時區精確性驗證（P5d 業務裁示範疇，本案例僅驗證「乾淨」日期字面值如 `'2026-06-15'` 之基本 round-trip）

---

### TS-MSSQL-P5B-FIELD-007：`ob_pool_data` NOT NULL 業務欄（`custo_no`/`sta_code`/`dept_id`/`list_type`/`settle_src`）於 happy path fixture 全數正確填入、不觸發 NOT NULL 違反（先確認正常路徑，異常路徑歸 §六 ATOMIC）
- **Related Requirement**：★發現 5
- **Test Type**：Positive / Integration

---

### TS-MSSQL-P5B-FIELD-008：`ob_calendar.rest_flg` NOT NULL 於 happy path fixture（'0'/'1' 兩值皆有）正確填入
- **Related Requirement**：同上

---

### TS-MSSQL-P5B-FIELD-009：空字串來源欄位（非 NOT NULL 業務欄）經 `NULLIF(TRIM())` 正確轉為 `NULL`（沿用既有邏輯回歸，5 條 pipeline 之 varchar 欄位皆適用）
- **Related Requirement**：`target-load-handler-mssql.ts:100-103` 既有邏輯回歸

---

### TS-MSSQL-P5B-FIELD-010：`ob_pool_data`/`ob_pool_data_list` 之 `_cdmp_extracted_at`（僅 `ob_pool_data` 有此欄，`ob_pool_data_list` 無）於端對端執行後正確由 handler 自動填入（非 field_mapping 提供），`ob_pool_data_list`/`ob_calendar`/`ob_emphire`/`ob_arreturndf_min_cap` 中僅 `ob_arreturndf_min_cap`/`ob_pool_data` 兩表有此欄位，其餘 3 表無需驗證（回歸 entity 事實）
- **Related Requirement**：★發現 5 逐表事實核對

---

## 九、IDEMPOTENT — 冪等重跑

### TS-MSSQL-P5B-IDEMPOTENT-001（🔴 DoD 核心）：4 條 fullMode pipeline 各自完整重跑第二次，目標表列數不變（非疊加，`TRUNCATE` 全量覆蓋語意）
- **Related Requirement**：AD §5「冪等」延伸（P5b DoD 未明文列出，但比照 P4d/P4c 既有慣例為隱含要求）
- **Test Type**：Positive / Integration — **DoD 核心案例**

---

### TS-MSSQL-P5B-IDEMPOTENT-002（🔴 DoD 核心）：`ob_pool_data_list` 重跑第二次，`data_source='etl_load'` 分區列數不變（非疊加），其餘 `data_source` 值列數同樣不受影響（雙重冪等：分區內覆蓋 + 分區外隔離）
- **Related Requirement**：同上，partition_replace 專屬語意

---

### TS-MSSQL-P5B-IDEMPOTENT-003：composite PK 去重勝出列（`ob_pool_data`）於重跑後內容穩定不變（冪等 × 決定性交叉驗證，對稱 P4d TIEBREAK×IDEMPOTENT 交集精神）
- **Related Requirement**：I-MSSQL-DEDUP-TIEBREAK-01 + 冪等要求之交集

---

### TS-MSSQL-P5B-IDEMPOTENT-004：`ob_emphire` 重跑後 `resign_date` NULL 化結果穩定（`cd1` conditional 節點冪等性）
- **Related Requirement**：★發現 4

---

### TS-MSSQL-P5B-IDEMPOTENT-005：重跑不因前次殘留 `##` 表命名衝突而失敗（`logId` 隔離性回歸，5 條 pipeline 各自的極簡 DAG 皆適用）
- **Related Requirement**：I-MSSQL-TEMPTABLE-GLOBAL-01 既有邏輯回歸

---

## 十、CLEANUP — `##` 全域暫存表清理

### TS-MSSQL-P5B-CLEANUP-001（🔴 DoD 核心）：成功路徑 — 5 條 pipeline 各自對應之 `##` 表（`extract`/`field_mapping`/`conditional` 之 `NodeOutputStore` 追蹤 + `target_load` 內部自理之 enriched tempTable/dedupTable）於執行完畢後 `OBJECT_ID` 皆為 `NULL`
- **Related Requirement**：I-MSSQL-TEMPTABLE-CLEANUP-01
- **Test Type**：Positive / Integration — **DoD 核心案例**

---

### TS-MSSQL-P5B-CLEANUP-002（🔴 DoD 核心）：失敗路徑（呼應 §六 ATOMIC）— `tl1` 失敗時，其之前已建立的 `##` 表（`e1`/`fm1`/`cd1` 之輸出）同樣全清，不因中途失敗而殘留
- **Related Requirement**：I-MSSQL-TEMPTABLE-CLEANUP-01「成功/失敗兩路徑」
- **Test Type**：Negative / Integration — **DoD 核心案例**

---

### TS-MSSQL-P5B-CLEANUP-003：`target-load-handler-mssql.ts` 內部 `dedupTable`（`_dq` 後綴）於 fullMode 路徑之 `finally` 區塊確實清理（回歸 P4c CLEANUP-GATE-001 機制，本文件僅確認真實 pipeline 驅動下依然成立）
- **Related Requirement**：`target-load-handler-mssql.ts:269-275`

---

### TS-MSSQL-P5B-CLEANUP-004：`tempdb.sys.objects` 依本次 `logId` 前 8 碼之 LIKE 掃描，零殘留（防禦性全域掃描，比照 P4d CLEANUPE2E-003）
- **Related Requirement**：I-MSSQL-TEMPTABLE-CLEANUP-01 延伸防線

---

## 十一、EQ-PG — 跨引擎 Best-Effort 比對（degradable，見 §0.5）

> **前提**：`pgPortReachable()` 對 5433 回傳 `true`。不可達時本群組全數 `describe.skip` + `SKIP_REASON`，**不構成 P5b DoD 未達成**。

### TS-MSSQL-P5B-EQPG-001：5 條 pipeline + 同一 fixture，PG 版與 MSSQL 版皆完整跑通零錯誤
- **Related Requirement**：AD §2.2 隱含之跨引擎一致性前提
- **Test Type**：Positive / Integration

---

### TS-MSSQL-P5B-EQPG-002（旗艦）：5 張目標表逐欄逐列比對（以各自 PK 為鍵），業務欄位完全相等（不含 `_cdmp_extracted_at`/`_etl_loaded_at` 等系統時間戳，兩側各自產生天生不同）
- **Related Requirement**：I-MSSQL-ENGINE-EQ-01（本文件為此不變式在 ETL 落地層級之延伸應用，非 Stage 1-4 raw SQL 層級）
- **Test Type**：Positive / Integration

---

### TS-MSSQL-P5B-EQPG-003：`ob_emphire.resign_date` NULL 化行為兩側一致
- **Related Requirement**：★發現 4

---

### TS-MSSQL-P5B-EQPG-004：composite PK 去重（`ob_pool_data`）勝出列「恰一列」存在性兩側皆成立（**不要求同一實體列**，對稱 AD §4.3 精神，PG `ctid` 與 MSSQL `_seq` 皆為無業務含義排序）
- **Related Requirement**：AD §4.3；P4d TIEBREAK-003 精神延伸

---

### TS-MSSQL-P5B-EQPG-005：§六 ATOMIC-005 已涵蓋 PG 對稱探測，本案例僅做交叉引用確認不重複
- **Related Requirement**：★發現 3
- **Test Type**：Meta / Unit

---

### TS-MSSQL-P5B-EQPG-006：EQ-PG 群組 skip 時之明確 `SKIP_REASON` 輸出（harness 自我驗證）
- **Related Requirement**：§0.5 degradable 政策落地確認

---

## 十二、REG — 回歸

### TS-MSSQL-P5B-REG-001（DoD 紅線）：`npx tsc --noEmit -p tsconfig.build.json` 乾淨
- **Related Requirement**：專案既有 DoD 紅線慣例（`feedback_vitest_no_typecheck`）

---

### TS-MSSQL-P5B-REG-002：PG 版 5 條 pipeline（未經本次 MSSQL 化異動）於 PG dispatcher 下行為與本輪改動前一致（黑箱契約不變，本文件僅新增測試+fixture，不改動任何 production 檔案）
- **Related Requirement**：AD-E07-41 §1.2「PG 分支完全不動」精神延伸

---

### TS-MSSQL-P5B-REG-003：P4a/P4b/P4c/P4d 既有全部測試套件不回歸
- **Related Requirement**：既有套件回歸

---

### TS-MSSQL-P5B-REG-004：本文件於 `cdmp_test`（5433，若可達）寫入之測試資料不干擾同 DB 既有 F098~F109/P4d pg.spec 套件（序列執行 + 前綴隔離 + `afterAll` 精準清除）
- **Related Requirement**：§0.5 政策；既有共用 DB 隔離慣例

---

### TS-MSSQL-P5B-REG-005：`DB_TYPE!=='mssql'`（PG/sqlite）路徑之 `createDispatcher()` 不受本文件新增測試檔影響
- **Related Requirement**：P4c DISPATCH-004 既有回歸之再確認

---

### TS-MSSQL-P5B-REG-006：本文件新增測試檔（若沿用 P5a CI dbo bootstrap）與既有 P3 系列共用 `dbo` 六表（`ob_pool_data`/`ob_pool_data_list`/`ob_emphire`/`ob_calendar` 為其中 4 張）之寫入/清理不互相干擾——**本文件之目標表恰與 P3a/P3c/P3d 依賴之 dbo 共用表高度重疊**，須確認寫入列前綴/PK 值域與 P3 系列既有 fixture 不衝突
- **Related Requirement**：P3a Harness 環境依賴教訓「共用既有表＋前綴隔離寫入列＋精準 DELETE（禁 DROP/TRUNCATE）」——**但本文件 fullMode 路徑本質即為 TRUNCATE 整張表**，與 P3 系列「共用表不可 DROP/TRUNCATE」原則存在直接張力，**須明確記錄協調策略**（建議：本文件於獨立測試視窗執行、或於 `afterAll` 還原至 P3 系列所需的最小 baseline 狀態，避免序列執行時 P5b 的 `TRUNCATE ob_pool_data` 打斷 P3a/P3c/P3d 對同一張表的既有依賴）
- **Test Type**：Decision Gate（文件化守門，🔴 MUST-FIX：執行順序協調）

---

## 十三、STATIC — 事實鎖定

### TS-MSSQL-P5B-STATIC-001：5 條 pipeline 之節點數/邊數/`nodeType` 分佈鎖定（`{raw_data_extract:5, field_mapping:5, conditional:1, target_load:5}`，合計 16 節點 11 邊）
- **Related Requirement**：★發現 1；供未來 AD 修訂與本文件維持同步
- **Test Type**：Regression / Unit — 靜態讀取 `etl-pipelines.json`

---

### TS-MSSQL-P5B-STATIC-002：5 張 raw fixture 表命名清單鎖定（`raw_970da79c`/`raw_dfb3b313`/`raw_e1e951d7`/`raw_6d58393b`/`raw_33dc3771`）
- **Related Requirement**：★發現 5 表格

---

### TS-MSSQL-P5B-STATIC-003（🔴 MUST-FIX）：全部本文件測試檔中 `isTestRun` 字面值靜態掃描（呼應 §七）
- **Related Requirement**：與 §七 ISTESTRUN-001 形成雙重防線

---

### TS-MSSQL-P5B-STATIC-004：`target-load-handler-mssql.ts`/`pipeline-runner.ts`/`node-dispatcher.ts` 於本輪未被修改（本文件為凍結清單延伸確認，本輪僅加測試+fixture）
- **Related Requirement**：AD-E07-41 §1.2 精神延伸至 P5b

---

### TS-MSSQL-P5B-STATIC-005：5 張目標表 PK 欄位集合鎖定（呼應 §一 GATE-004，此處為交付物文件化）
- **Related Requirement**：★發現 5 表格

---

### TS-MSSQL-P5B-STATIC-006：`ob_pool_data_list` 之 7 個月跑專屬欄位（`score`/`tier_level`/`card_level`/`cr_id`/`cr_nm`/`is_cr`/`assignday`）不在本 pipeline field_mapping 對映範圍內之事實鎖定（呼應 §五 PARTITION-004）
- **Related Requirement**：★發現 5 最後一列

---

## 附：與 AD-E07-43 §5 P5b DoD 逐條對應

| AD §5 P5b DoD 原文 | 對應測試群組 |
|---|---|
| 「5 條 pipeline 於 `DB_TYPE=mssql` 觸發，全部節點 `status==='completed'`」 | §三 E2E-RUN（全部 15 案例 + HANDLERTYPES-001） |
| 「目標表以直接 `SELECT COUNT(*)` 交叉驗證列數合理（非僅信 `nodeLogs`）」 | §三 E2E-RUN 各 `-002` 案例；§四 FULLMODE-001；§五 PARTITION-001/002 |
| 「抽樣列內容正確性核對（比照 P4d LOOKUPHIT/CHARSET 精神，非窮舉）」 | §三 E2E-RUN 各 `-003` 案例；§八 FIELD 全群組 |
| （任務指示擴充）「fullMode 全量替換／partition_replace 分區替換語意驗證」 | §四 FULLMODE、§五 PARTITION |
| （test-designer 新發現）「TRUNCATE/DELETE 後 INSERT 失敗之資料完整性風險」 | §六 ATOMIC（🔴🔴 MUST-FIX） |
| （任務指示擴充）「isTestRun 交叉驗」 | §七 ISTESTRUN |
| （任務指示擴充）「冪等」 | §九 IDEMPOTENT |
| （任務指示擴充）「PG 對照 best-effort」 | §十一 EQ-PG（degradable） |
| （任務指示擴充）「回歸：postgres 路徑不變；tsc；不干擾 P3 系列共用 dbo 表」 | §十二 REG（尤其 REG-006 執行順序協調） |
