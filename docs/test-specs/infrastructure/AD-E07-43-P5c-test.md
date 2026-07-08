---
type: test-design-infrastructure
test-spec-id: AD-E07-43-P5c
feature_name: MSSQL 全面遷移 P5c — MONTHRUN-DIFF 真實完整月跑跨引擎逐列比對（P5 全量 CI + 業務簽核第三片，F067 式簽核之技術底稿）
priority: P0-MVP
related_spec:
  - /docs/specs/implementation-log/AD-E07-43-mssql-p5-ci-signoff.md（§1 排序 P5a→P5b→P5c；§2.2 P5b 前置依賴；§3.1 MONTHRUN-DIFF 執行方式定調「manual/script，非新 CI 測試套件」；§5 P5c DoD 三條；§6 I-MSSQL-ENGINE-EQ-01「本文件為此不變式在完整月跑層級之最終驗收」、I-MSSQL-SIGNOFF-GATE-01「cutover 前提 (a) PG/MSSQL 結果一致」）
  - /docs/test-specs/infrastructure/AD-E07-43-P5b-test.md（前置依賴：5 條生產 ETL pipeline 端對端驗證產出 `ob_pool_data`/`ob_pool_data_list`/`ob_emphire`/`ob_calendar`/`ob_arreturndf_min_cap` 真實資料；本文件沿用其 dbo 共用表 Harness 結論；§十二 REG-006「fullMode TRUNCATE 與共用表張力」先例，本文件比照其協調策略）
  - /docs/test-specs/infrastructure/AD-E07-42-P3a-test.md（Stage 1 篩選 EQ 已窮盡驗證；Harness 環境依賴段落「dbo 共用表＋前綴隔離＋精準 DELETE（禁 DROP/TRUNCATE）」原則沿用；`executeStage1Chain` 內部 customer_core 片段為 PG-only SQL 之已知限制，本文件 GATE-004 據此設計繞開策略）
  - /docs/test-specs/infrastructure/AD-E07-42-P3b-test.md（§二十一 MONTHRUN-DIFF-001/002：本文件之前身 stub，原僅涵蓋 score/card_level/tier_level 三欄、無執行方法論細節；本文件正式取代並擴大為 AD-E07-43 §5 P5c 完整範圍）
  - /docs/test-specs/infrastructure/AD-E07-42-P3c-test.md（Stage 3/4 比例分派 EQ 已窮盡驗證，含裸 `NUMERIC(18,0)` 精度缺陷已修復之前提）
  - /docs/test-specs/infrastructure/AD-E07-42-P3d-test.md（CR 優先分派 EQ 已窮盡驗證；§七 DATECAST-003「appl_date 非午夜時間分量未驗證假設」為本文件 §四 DATECAST-BOUNDARY 群組之直接前身，本文件於完整鏈路層級延伸此查證）
  - /docs/specs/implementation-log/F067-202606-cdmp-vs-legacy-diff.md（差異報告格式先例：§2/§3/§8 逐名單分佈表格式，本文件 §六 REPORT 群組沿用其表格結構，但比對性質不同，見零.1 方法論說明）
  - apps/api/src/modules/assignment/services/assignment-run-pipeline.service.ts（test-designer 逐行查證：`executeStage2to3PushdownMssql` lines 1128-1218 現行已完整四步下推〔①`runStage2and3SqlMssql`②`clearStage3Fields`③`runCrPrioritySqlMssql`④`runStage3to4RationSqlMssql`〕，AD §0「MSSQL 月跑全鏈現已全部有值」之陳述經本文件直接讀碼確認屬實；`executeV2` lines 730-950+ 為既有 code comment 自陳之「golden oracle」JS 全鏈路徑〔Stage2 計分 `this.computeScore`+F102 `applyCrPriority`+F101 `distributeStage3to4`〕；`runStage1JsChain` lines 1735-1765 呼叫 `executeStage1Chain`；`resolveStage1Strategy`/`resolveStage2to4Strategy` lines 188-230 為 DB_TYPE 分流純函式）
  - apps/api/src/modules/assignment/stage1/stage1-filter-chain.ts（`executeStage1Chain` JS oracle 主入口，line 362）
  - apps/api/src/modules/assignment/stage1/cr-priority.ts（`applyCrPriority` line 110，F102 JS oracle）
  - apps/api/src/modules/assignment/stage1/stage3to4-ration.ts（`distributeStage3to4`，F101 JS oracle）
  - apps/api/src/database/entities/ob-monthly-run-result.entity.ts（lines 67-110：10 欄位權威型別定義，本文件 §零.7 診斷欄位集合之唯一依據）
covers: []
spec_version: "1.0"
date: 2026-07-08
last_updated: 2026-07-08
---

# AD-E07-43 P5c：MSSQL 全面遷移 — MONTHRUN-DIFF 真實完整月跑跨引擎逐列比對 — 測試設計

> 本文件覆蓋 AD-E07-43「MSSQL 全面遷移 P5（全量 CI + F067 式業務簽核）」之 **P5c 切片**（AD §3.1 + §5 P5c DoD）。AD §3.1 明文定調：「不是新的自動化 CI 測試套件，而是比照本專案既有的 F101/F102/F104 驗收前例（觸發真實月跑、SQL 直接查表比對、輸出人工可讀的差異記錄）」。本文件之產出即 **P5e F067 式業務簽核報告之技術附件**（非報告本體），亦是 **I-MSSQL-SIGNOFF-GATE-01** 條件 (a) 之直接證據來源。
>
> **明確排除**：Stage 1-4/CR 各站點方言轉換之正確性本身（P3a/b/c/d 已窮盡逐案 EQ 驗證，本文件視為已驗證黑盒依賴，不重新推導）；F067 式簽核報告之業務簽核行為本身（P5e，架構師起草、業務簽核，非 test-designer/tdd-implementation 職責）；datetime2 時區 production 查證之最終業務裁示（P5d，本文件僅設計「揭露」邊界案例，不代業務裁定可接受度）；P5b 之 5 條 ETL pipeline 端對端驗證本身（已完成，本文件僅消費其產出資料）。
>
> **★ test-designer 逐碼查證之關鍵事實（本文件測試設計之唯一真實依據）**：
>
> 1. **🔴🔴 環境約束已於本文件設計時再次確認為現行事實**：`postgres-test`（5433）本機不可達；`dev PG`（5432）依專案既有慣例（P4a impl log `EXTRACT-RESOLVE DUAL-DB` 偏差段落明載）**視為唯讀，不可注入測試列污染 dev**；`MSSQL CDMP_TEST`（1433）可用。此為本專案 MSSQL 遷移系列 P4a 起即已發生之真實環境限制（非本文件新假設），直接決定 §零.1 之比對方法論分層設計。
> 2. **🔴🔴 MSSQL 完整四步下推鏈路已於程式碼層級確認就位**：`executeStage2to3PushdownMssql`（`assignment-run-pipeline.service.ts:1128-1218`）現行呼叫序為 ①`runStage2and3SqlMssql`（計分）②`clearStage3Fields`（清除，PG/MSSQL 共用 ANSI）③`runCrPrioritySqlMssql`（P3d CR 前置）④`runStage3to4RationSqlMssql`（P3c 比例分派），與 PG 版 `executeStage2to4Pushdown`（lines 1017-1106）四步順序完全對稱（I-CR-ORDER-01）。AD §0「MSSQL 月跑全鏈現已全部有值」之陳述經本文件直接讀碼確認屬實，**非僅信任 AD 文字**。
> 3. **🔴🔴 既有「JS golden oracle」全鏈路徑可直接複用，非需重新撰寫**：`executeV2`（同檔 lines 730 起）之 code comment 自陳「此 JS 路徑為 golden oracle，與 PG SQL 下推逐列確定性等價（AC-15 DoD）」，其函式體確已完整組合 Stage 2 計分（`this.computeScore`）+ F102 CR 前置（`applyCrPriority`）+ F101 Stage 3/4 比例分派（`distributeStage3to4`），與 Stage 1 JS oracle（`executeStage1Chain`，由 `runStage1JsChain` 呼叫）合併即為完整月跑之 JS 端全鏈實作。**本文件 Tier 1 方法論之核心即複用此既有、已被專案自身標註為 golden 之程式碼路徑**，而非另行於測試檔內手算重新實作一份全鏈邏輯（後者才是真正的重工與額外風險來源）。
> 4. **🔴🔴 已知限制（P3a 查證延續，非本文件新發現，但本文件是首次需要在「全鏈組合」層級處理其後果）**：`executeStage1Chain` 內部之 customer_core 篩選片段（`buildCustomerCoreClause`）為 PG-only SQL 字面（`AGE()`/`EXTRACT()`/`::date`），若以此函式對 MSSQL 連線之 repo 呼叫、且該名單之篩選條件包含 customer_core 維度，會拋 PG-only 語法錯誤。**本文件 Tier 1 之 JS oracle 全鏈驗證因此在設計上排除「Stage 1 篩選條件包含 customer_core 維度」之名單**（§一 GATE-004），customer_core 維度之 Stage 1 正確性已由 P3a CCEQ 群組（14 案例）窮盡驗證，不在本文件重複範圍；但**不排除**這類名單的案件流入 Stage 2-4/CR（即：這類名單改採「Stage 1 輸出直接預先寫入 `ob_monthly_run_result`」之方式參與比對，繞過重跑 Stage 1 兩次，見 §零.4）。
> 5. **AD 文件內部欄位計數落差（低嚴重度，記錄性）**：AD §3.1（方法敘述）列出 10 個比對欄位（`score`／`tier_level`／`card_level`／`dept_id`／`emplid`／`emplid_deptid`／`assignday`／`cr_id`／`cr_nm`／`is_cr`），但 AD §5 P5c DoD 條文字面稱「9 個關鍵欄位」且逐一列舉時漏列 `cr_nm`。本文件採**兩者聯集（10 欄，含 `cr_nm`）** 為設計範圍——`cr_nm` 屬 `cr_id` 之衍生展示欄（`'CR'+emp_nm`），納入比對成本極低且無納入風已（詳 §一 GATE-003），建議 system-architect 下次修訂 AD 時同步此落差，非阻擋事項。
> 6. **本文件之比對性質與 F067 根本不同，格式借用但方法論不可混淆（見 §零.1）**：F067（CDMP vs legacy）之兩側案件集完全不同（不同 ID 體系），故只能比「分佈形狀」；P5c（JS oracle vs MSSQL 下推）之兩側讀取**同一份來源資料**，案件集理論上應**完全相同**（同 `(orgno, appl_no)` 鍵集合），故本文件之核心比對是**逐列精確相等**（0 差異為預期基準值，任何差異即為真實缺陷，非「分佈噪音」），分佈層級比對（§五 DIST）僅作為輔助性、業務可讀摘要，非核心判定依據。

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer（若走腳本實作） | 本文件全部 + `AD-E07-43-mssql-p5-ci-signoff.md`（§3.1、§5 P5c）+ `assignment-run-pipeline.service.ts`（`executeV2`/`executeStage2to3PushdownMssql`/`runStage1JsChain`/`resolveStage1Strategy`，**本輪不可修改**——本文件為純消費既有程式碼之比對腳本，若發現真實缺陷交 impl log 回報，不在本輪修復凍結檔案）+ `ob-monthly-run-result.entity.ts`（10 欄位權威定義）+ P5b 產出之 5 表真實資料 |
| Product Analyst / Architect（P5e 前置） | 本文件 §零.1（方法論分層與 I-MSSQL-SIGNOFF-GATE-01 佐證力道決策）+ §六 REPORT（差異報告格式與範圍聲明）+ risks-and-gaps 對應段落 |
| QA / Tester | 本文件 + `risks-and-gaps.md`（P5c 風險段落，尤其 GATE-002 佐證力道議題） |

---

## 零、測試環境與方法論設計

### 0.1 比對方法論三選一之可行性評估（承任務指示 (a)/(b)/(c)）

任務指示要求評估 PG 端來源三選：

| 選項 | 內容 | 現行可行性 | 本文件裁定 |
|---|---|---|---|
| (a) PG 直接同資料跑一次 | 最強證據，逐列比對 PG 實際執行結果 | **現行不可行**：`postgres-test`（5433）本機不可達；`dev PG`（5432）視為唯讀不可注入測試（P4a 既有先例） | 列為 **§七 PG-ENHANCE**，`pgPortReachable()` 探測後 degradable，5433 恢復可達時自動啟用，不阻擋本文件 DoD |
| (b) JS oracle 作黃金基準 | P3a-d 已證各站點 SQL builder↔JS oracle 逐列 EQ=0；本文件在**整合層**（全鏈組合）以同一份 JS oracle 為 golden，確認全鏈組合無誤 | **現行唯一始終可行路徑**，不依賴任何外部 PG 連線，僅需 MSSQL CDMP_TEST | **裁定為 Tier 1（主要、MUST-FIX、§三 CHAIN-EQ）** |
| (c) 既有 PG 月跑 baseline 快照（如 F067 run `84486ddd`） | 唯讀查詢 dev PG 之既有已完成月跑結果，不涉及注入 | 技術上可行（唯讀 SELECT 不違反「不可注入」約束），但 MSSQL 端資料為 P5b fixture／合成資料，與 dev PG 之真實 202606 生產規模資料**非同一份輸入**，若要做逐列比對需額外一輪「匯出 PG 來源快照→匯入 MSSQL」之資料工程工作（比照既有 `scripts/import-legacy-ratios.cjs` 精神，但規模是全表非僅比例設定），**超出本文件 P5c 範圍之腳本工作量** | 列為 **§七 PGENH-003**，記錄為 **P5e 加強建議**（risks-and-gaps 追蹤），非 P5c DoD 阻擋項 |

**結論（呼應任務指示建議）**：以 (b) JS oracle 為主可行路徑（Tier 1，不依賴不可達 PG，MUST-FIX）+ (a)/(c) 為 PG 可達時或投入額外資料工程後之加強（Tier 2/3，degradable，不偽綠）。

### 0.2 🔴🔴 重要方法論澄清：Tier 1 是否足以滿足 I-MSSQL-SIGNOFF-GATE-01？（決策關卡，交 architect/業務裁定，非本文件自行裁定）

I-MSSQL-SIGNOFF-GATE-01 條文字面為「(a) MONTHRUN-DIFF（P5c）對至少一個完整生產規模月跑顯示 **PG/MSSQL** 結果一致」——字面明確指「PG」，而非「JS」。Tier 1（JS oracle vs MSSQL）雖然是目前技術上唯一可行、且有 P3a-d 逐站點 EQ 佐證支撐其可信度的路徑，但**嚴格依 AD 條文字面，並不等於「PG/MSSQL 結果一致」**——JS oracle 是「PG 版本應該產出什麼」的程式碼層級代理（proxy），不是「PG 版本實際執行產出什麼」的直接觀測。

本文件**不代 system-architect 或業務利害關係人裁定**此代理證據是否已足夠支撐簽核，僅將此列為 **§一 GATE-002 決策關卡**，要求：
1. 本文件之報告（§六 REPORT）須在最顯著位置明確聲明「本次比對之基準＝JS oracle（golden，P3a-d 已證與 SQL builder 逐列 EQ），非 PG 實際執行結果」；
2. 待 architect／業務於 P5e 前決定：(i) 接受 Tier 1 作為充分證據（理由：P3a-d 已窮盡驗證 JS oracle↔PG SQL builder 逐列等價，Tier 1 等於間接驗證 PG↔MSSQL），或 (ii) 要求 Tier 2（5433 恢復可達）或 Tier 3（PG 快照，額外資料工程）任一項至少執行一次真正的 PG 側實際執行比對，才能簽核。

### 0.3 Tier 1 執行機制：複用既有 golden JS 路徑 + MSSQL 下推，同一份 MSSQL 資料，兩個 run_id

不透過 `runPipeline()` 頂層入口切換 `DB_TYPE`（那會連到不同資料庫，喪失同一份來源資料的比對基礎）。改為：

1. **兩側皆連同一個 MSSQL DataSource**（P5b 已就緒之 CDMP_TEST dbo，含真實 `ob_pool_data`/`ob_pool_data_list`/`ob_emphire`/`ob_calendar`/`customer_core`/`ob_dept_pct`/`ob_empl_set` 七表資料）。
2. **MSSQL 下推側（`RUN_ID_MSSQL`）**：以真實 `DB_TYPE='mssql'` 呼叫 `runPipeline(RUN_ID_MSSQL, ym)`（頂層入口，未經任何繞道，即生產真實會執行的完整程式碼路徑：`runStage1SqlPushdownMssql`→`executeStage2to3PushdownMssql` 四步）。
3. **JS oracle 側（`RUN_ID_JS`）**：**不經頂層 `runPipeline()` 之 `DB_TYPE` 分流**，而是直接以 `Object.create(prototype)` + bracket-access 技術（沿用 F104 pg spec 既有手法，見 `stage2to4-score-source-f104.pg.spec.ts:98-105`）取得 service 實例後，直接呼叫其私有方法 `runStage1JsChain`（Stage 1 JS oracle，§一 GATE-004 排除 customer_core 名單）與 `executeV2`（Stage 2-4/CR JS oracle），該實例之 DataSource **仍指向同一個 MSSQL 連線**（`executeV2`/`executeStage1Chain` 內部皆為 TypeORM repo `.find()`/`QueryBuilder` 呼叫，dialect-agnostic，不含 raw PG-only SQL——**唯一例外是 customer_core 片段，已由 GATE-004 排除**），結果寫入同一張 `ob_monthly_run_result` 表但 `run_id=RUN_ID_JS`。
4. **診斷**：`SELECT ... FROM ob_monthly_run_result WHERE run_id IN (:RUN_ID_JS, :RUN_ID_MSSQL) ORDER BY orgno, appl_no`，依 `(list_no, orgno, appl_no)` 鍵 join 兩側，逐欄比對 §零.7 之 10 欄。

此機制之關鍵優勢：**兩側讀取的是完全相同、來自真實 P5b pipeline 產出之 MSSQL 資料**，避免了「PG fixture 與 MSSQL fixture 各自造、規模/內容不對稱」的比對基礎不公平問題，且兩條計算路徑（SQL 下推 vs JS 記憶體運算）皆為專案既有、未經修改之真實生產程式碼（非本文件另行撰寫之簡化重新實作）。

### 0.4 Stage 1 之特殊處理：customer_core 名單改採「預先寫入 Stage 1 輸出」而非重跑兩次

承★發現 4，含 customer_core 篩選條件之名單，`executeStage1Chain`（JS oracle）對 MSSQL 連線會拋錯，故不能直接對這類名單做「Stage 1 JS oracle vs Stage 1 MSSQL 下推」之獨立比對（此正確性已由 P3a CCEQ 群組窮盡覆蓋，非本文件重複範圍）。但這類名單的案件仍應納入本文件「Stage 2-4/CR 全鏈組合」之驗證範圍（否則會遺漏 customer_core 名單特有之計分維度是否正確流入下游）。

**設計方式**：對這類名單，Stage 1 僅執行**一次**（走 MSSQL SQL 下推 `runStage1SqlPushdownMssql`，其 customer_core 片段為 mssql 版本 `buildCustomerCoreClauseMssql`，P3a 已驗證），其輸出結果**同時複製寫入兩個 run_id**（`RUN_ID_JS` 與 `RUN_ID_MSSQL` 之 Stage 1 初始列一致，作為兩側 Stage 2-4/CR 之共同起點），Stage 2-4/CR 才各自依 Tier 1 機制分別執行。此設計明確聚焦本文件之驗證標的（Stage 2-4/CR 全鏈組合），不誤將「已由 P3a 驗證過」的 Stage 1 customer_core 正確性重新拉進本文件的判定範圍內（避免污染診斷：若這類名單出現差異，應可歸因於 Stage 2-4/CR，而非誤判為 Stage 1 customer_core 問題）。

### 0.5 Harness 資料庫策略：沿用 CDMP_TEST 既有 dbo，非新建獨立資料庫；獨立執行視窗

任務指示提及「獨立庫 CDMP_P5B 或 CDMP_TEST 自建」二選一，本文件裁定**沿用 CDMP_TEST 既有 dbo**（非新建資料庫），理由：
1. P3a 已確立「裸表名僅能解析至連線 login 之 DEFAULT_SCHEMA（dbo）」之硬限制，新建獨立資料庫仍需完整 `migration:run` 重新 bootstrap，且無助於解決此限制。
2. 本文件之比對必須讀取 P5b 已產出之真實 pipeline 資料（`ob_pool_data`/`ob_pool_data_list`/`ob_emphire`/`ob_calendar`），這些資料已存在於 CDMP_TEST 之 dbo，另建資料庫等於要求重跑一次 P5b（不必要之重工）。

但 P5b §十二 REG-006 已記錄「fullMode TRUNCATE 與 P3 系列共用表『禁 DROP/TRUNCATE』原則之直接張力」，本文件之 `runPipeline()` 全鏈執行雖不直接 TRUNCATE 來源表（僅 INSERT `ob_monthly_run_result` 新列），但仍會**大量寫入**共用表 `ob_monthly_run_result`，與 P3a/c/d 既有依賴同一張表之 fixture 列可能產生 `run_id` 空間污染疑慮（低機率但非零，因部分既有 spec 之靜態守門會全表掃描 `LIKE` 前綴）。**裁定**：比照 AD §3.1「manual/script」定調，本文件之執行天然即為**獨立、非 CI 常駐之人工/腳本觸發視窗**（非與 P3a-d/P5b 之 CI `.mssql.spec.ts` 並行執行），此本質特性已足以規避 P5b REG-006 所述之並行張力，**不需要**額外的資料庫層級隔離機制；仍要求 `run_id` 使用顯著前綴（如 `P5C_JS_*`/`P5C_MSSQL_*`）以利事後稽核與 `afterAll`/腳本收尾清理。

### 0.6 資料集設計原則（涵蓋各維度但規模可控）

不追求生產規模（55,863 筆等級），追求**維度涵蓋完整**：

| 維度 | 涵蓋要求 |
|---|---|
| `tier_level` | T1-T5 各至少 1 案（含查無對應 tier 之 NULL 案例） |
| `card_type` | 至少 H/S/E 三卡（對稱既有 F104 已驗證之啟用矩陣代表卡），不需全部 7 卡（已由 P3b CCDIM/HARNESS 群組窮盡） |
| `cr_enabled` | true/false 名單各至少 1 份 |
| 部門/員工比例 | 至少 2 部門、每部門至少 2 員工，比例含非整除小數（如 33.67/33.67/32.66，呼應 P3c DECIMAL 已修復缺陷之回歸確認） |
| CR 案件 | 至少 1 案觸發步驟 1（逾2年清空）、1 案觸發步驟 2（離職清空）、1 案觸發步驟 3（CR 優先指派，含 emplid/dept_id/emplid_deptid 之 CR 來源 vs 比例分派來源正確區分）、1 案查無對應 `ob_emphire`（BR-F102-08 INNER JOIN 不命中仍可指派） |
| Stage 1 邊界 | 至少 1 份 customer_core 條件名單（§0.4 特殊處理）、1 份純 `ob_pool_data` 條件名單、1 份空篩選/wildcard 名單、1 組觸發近 3 個月去重之重複案件 |
| datetime2 邊界 | 至少 3 案覆蓋 §四 DATECAST-BOUNDARY（見下） |

### 0.7 診斷欄位集合（§一 GATE-003 裁定之聯集 10 欄，本文件唯一權威清單）

依 `ob-monthly-run-result.entity.ts:67-110` 逐一核對型別：`score`（integer）／`card_level`（varchar(1)）／`tier_level`（varchar(5)）／`is_cr`（varchar(1)）／`cr_id`（varchar(20)）／`cr_nm`（varchar(50)）／`dept_id`（varchar(6)）／`emplid`（varchar(10)）／`emplid_deptid`（varchar(6)）／`assignday`（varchar(100)）。比對鍵為 `(list_no, orgno, appl_no)`（複合，非單欄）。`appl_date`（`datetime2`/`timestamp`，`dateColumnType`）**不在**診斷欄位集合內（它是 Stage 1 帶入之輸入快照，非計分/分派結果），但作為 §四 DATECAST-BOUNDARY 群組之觸發條件（驅動變數）使用。

### 0.8 與既有 P3a-d 個別站點 EQ 之邊界劃分（避免重複驗證）

本文件**不**重新驗證任何 P3a-d 已窮盡覆蓋之單站點正確性（如 Stage 1 篩選規則本身、AGE 公式方向、DECIMAL 精度、tie-breaker 排序鍵）——這些已由各自文件之 EQ 群組以「已知具體數值」逐案證明。本文件的驗證標的收斂於**兩個 P3a-d 未曾、也無法覆蓋的風險層面**：(1) 多個已各自驗證正確的站點，經真實 `runPipeline()`/`executeV2` 頂層入口**連續組合呼叫**後，前一站點輸出是否確實以下一站點期待的形狀/值域正確傳遞（§三 CHAINEQ-007 為代表案例）；(2) 全鏈條件下才會出現的資料流交互（如 CR 前置動態指派的案件如何影響 Stage 3/4 之扣量與 ASSIGNDAY 散佈基數，P3d CRWARN-002 已於「橋接」層級初步驗證，本文件為其首次由 `runPipeline()` 真實驅動而非手動模擬之延伸確認）。

### 0.9 執行方式建議：Script（非常駐 vitest spec），理由與具體形式

**建議：TypeScript 獨立腳本**（例如 `apps/api/scripts/mssql-monthrun-diff.ts`，比照既有 `scripts/typeorm.cjs` launcher 慣例以 ts-node 或專案既有 script runner 執行），**非**併入常駐 `*.mssql.spec.ts` 自動化套件。理由：
1. AD §3.1 本身明文定調「非新的自動化 CI 測試套件」，比照 F101/F102/F104 既有真實月重跑慣例（manual/script）。
2. P3b §二十一 `MONTHRUN-DIFF-001/002` stub 已預先做出相同結論（「資料規模與執行時間不適合 CI 每次跑」），本文件延續而非推翻此既有決策。
3. §六 REPORT 要求產出人工可讀之 impl-log 風格差異報告（含案件級記錄、根因分類、Tier 範圍聲明），此類敘事性輸出不適合以純 `expect().toEqual()` 斷言表達，腳本可自由組織輸出格式（如產出 markdown 檔案）。
4. 選擇 **TypeScript**（而非純 `.sql` 查詢或 `.cjs`）之理由：核心比對邏輯需要呼叫既有 NestJS service 之私有方法（`executeV2`/`runStage1JsChain`，§0.3 步驟 3 之 bracket-access 技術）並操作 TypeORM DataSource，直接複用既有 DI/repo 基礎設施遠比另行以裸 SQL 重新實作一份 JS oracle 邏輯更省力、風險更低（後者等同於重工並引入「腳本自己的 JS oracle」與「`executeV2` 既有 golden oracle」兩者是否一致之新問題）。

此為**建議**（供 tdd-implementation 參考之決策記錄），非強制規格——若 tdd-implementation 評估後認為其他形式（如純 SQL 腳本 + 手動觸發兩次 `runPipeline()` API 呼叫）更符合實際操作情境，應於 impl log 之 Architectural Decisions 段落記錄選擇與理由，比照 AD-E07-40-P2c `MOUNT-001` 決策記錄慣例。

---

## 一、GATE — 前置決策關卡（🔴🔴 本文件方法論核心，須於展開 §三 CHAIN-EQ 前完成）

### TS-MSSQL-P5C-GATE-001（🔴🔴 決策關卡）：`pgPortReachable()` 對 5433 探測結果決定 §七 PG-ENHANCE 是否啟用
- **Related Requirement**：§零.1
- **Test Type**：Probe / Decision Gate
- **Expected Result**：記錄探測結果於 impl log；`false` → §七全數 `describe.skip` + `SKIP_REASON`，不阻擋本文件 DoD；`true` → §七 PGENH-002 應真實執行

### TS-MSSQL-P5C-GATE-002（🔴🔴 決策關卡，交 architect/業務裁定）：Tier 1（JS oracle）證據力道是否足以滿足 I-MSSQL-SIGNOFF-GATE-01 字面「PG/MSSQL」要求
- **Related Requirement**：§零.2
- **Test Type**：Decision Gate（不預設答案，本文件不自行裁定）
- **Expected Result**：本項不是「通過/失敗」判定，而是要求 §六 REPORT-004 於報告最顯著位置明確聲明範圍與佐證層級，並列出待 architect/業務裁示之選項（接受 Tier 1 proxy／要求 Tier 2/3 至少一項）

### TS-MSSQL-P5C-GATE-003：欄位計數落差裁定為聯集 10 欄（含 `cr_nm`）
- **Related Requirement**：★發現 5
- **Test Type**：Static Fact Confirmation / Documentation

### TS-MSSQL-P5C-GATE-004（🔴 已知限制之設計因應確認）：customer_core 篩選條件名單於 Tier 1 之處理方式（§0.4 預先寫入 Stage 1 輸出）於腳本骨架中確實區分兩類名單，未誤將 customer_core 名單導入 `runStage1JsChain` 直接呼叫路徑
- **Related Requirement**：★發現 4
- **Test Type**：Regression / Static Guard — 腳本原始碼掃描確認名單分流邏輯存在

### TS-MSSQL-P5C-GATE-005：Harness 資料庫策略沿用 CDMP_TEST dbo（非新建）+ `run_id` 前綴隔離命名鎖定
- **Related Requirement**：§0.5
- **Test Type**：Documentation / Decision Gate
- **Expected Result**：impl log 記錄 `run_id` 前綴慣例（`P5C_JS_*`/`P5C_MSSQL_*`）；本文件執行為獨立人工/腳本視窗，非 CI 常駐（呼應 P5b REG-006 協調結論）

---

## 二、HARNESS — Fixture 與資料集設計

### TS-MSSQL-P5C-HARNESS-001（🔴 決策關卡）：具體 fixture 矩陣（名單×tier×card×dept×CR 組合表）於 impl log 明確列出，供事後稽核覆蓋率
- **Related Requirement**：§0.6
- **Test Type**：Documentation

### TS-MSSQL-P5C-HARNESS-002：customer_core 名單 Stage 1 輸出「單次執行、雙寫兩個 run_id」機制正確落地（§0.4）
- **Related Requirement**：★發現 4；§0.4
- **Test Type**：Positive / Integration — DoD 核心前置
- **Expected Result**：`RUN_ID_JS`／`RUN_ID_MSSQL` 於此類名單之 Stage 1 初始列（`list_no`/`orgno`/`appl_no`/`custo_no`/`settle_src`）完全相同（作為下游比對之公平基準）

### TS-MSSQL-P5C-HARNESS-003：`run_id` 前綴隔離不與既有 P3a-d/P5b fixture 之 `run_id`/`list_no` 值域衝突
- **Related Requirement**：§0.5
- **Test Type**：Regression / Static Guard

### TS-MSSQL-P5C-HARNESS-004（🔴 資料公平性前提）：`ob_dept_pct`/`ob_empl_set`/`ob_calendar`/`customer_core` 等來源表資料，兩側（`RUN_ID_JS`/`RUN_ID_MSSQL`）於執行期間讀取的是同一份未被中途修改之靜態快照（非各自另行 seed 兩份不同資料）
- **Related Requirement**：§0.3 步驟 1
- **Test Type**：Precondition Guard — 若此前提不成立，任何後續差異皆不可信（污染診斷基礎）

### TS-MSSQL-P5C-HARNESS-005：邊界案例清單逐項鎖定（tier T1-T5/查無 tier、card H/S/E、CR 四類步驟、ration 非整除小數、去重觸發、空篩選/wildcard 名單、近 3 個月去重）
- **Related Requirement**：§0.6
- **Test Type**：Documentation

---

## 三、CHAIN-EQ — JS Oracle vs MSSQL 全鏈逐案等價（🔴🔴 DoD 核心，Tier 1 主體）

> 前提：§一 GATE 全數已決議；§二 HARNESS fixture 已就緒。**核心判定基準：0 差異**（非「分佈相近」，因兩側讀取同一份來源資料，理論上案件集與逐欄值應完全相同——此為本文件與 F067 方法論之根本差異，見★發現 6）。若 P3a-d 之個別站點 EQ 皆已驗證通過（決定性排序鍵、DECIMAL 精度修復、AGE 公式方向、tie-breaker 皆已確認正確），則本群組理論上應全數 0 差異；任何差異即代表**個別站點已驗證正確性、在「全鏈組合」層級失效**（例如某站點的輸出格式與下一站點的輸入假設不匹配），是本文件存在之核心價值。

### TS-MSSQL-P5C-CHAINEQ-001（🔴🔴 DoD 核心旗艦）：全量 fixture 案件集，兩側 10 欄逐列（依 `list_no`/`orgno`/`appl_no` 排序）精確相等
- **Related Requirement**：I-MSSQL-ENGINE-EQ-01（本文件為此不變式在完整月跑層級之最終驗收）；AD §5 P5c DoD #2
- **Test Type**：EQ（DoD 核心旗艦）
- **Expected Result**：`toEqual`/`toStrictEqual` 逐列比對 `score`/`card_level`/`tier_level`/`is_cr`/`cr_id`/`cr_nm`/`dept_id`/`emplid`/`emplid_deptid`/`assignday`，兩側案件集（`(orgno,appl_no)` 集合）本身亦須先確認完全相同（若案件集不同，任何欄位比對皆無意義，須優先反映為 GATE 層級問題而非欄位差異）

### TS-MSSQL-P5C-CHAINEQ-002：分名單逐一驗證（避免單一旗艦案例遮蔽 per-list 差異）
- **Related Requirement**：同上；不同 `card_type` 走不同 default/啟用欄位組合（F104 已驗證矩陣），全域彙總可能掩蓋單一名單之局部差異
- **Test Type**：EQ

### TS-MSSQL-P5C-CHAINEQ-003（🔴 CR 專項）：`cr_enabled=true` 名單，`cr_id`/`cr_nm`/`is_cr` 三欄 + CR 案件之 `emplid`/`dept_id`/`emplid_deptid`（來自 CR 前置指派，非 Stage 3/4 比例分派）兩側一致
- **Related Requirement**：F102 I-CR-ORDER-01；P3d EQ-004 精神於本文件之完整鏈路延伸（P3d 已於單站點層級驗證，本案例為首次由 `runPipeline()` 真實頂層入口驅動）
- **Test Type**：EQ（DoD 核心）

### TS-MSSQL-P5C-CHAINEQ-004：`cr_enabled=false` 名單，`is_cr` 恆 `'N'`，`emplid`/`dept_id`/`emplid_deptid` 純比例分派來源，兩側一致
- **Related Requirement**：F102 BR-F102-02
- **Test Type**：EQ

### TS-MSSQL-P5C-CHAINEQ-005：`ration=0` 部門/員工不指派案件，兩側對「有無指派」（`dept_id`/`emplid` 是否為 NULL）判定一致
- **Related Requirement**：F101 `RationWarning`（`STAGE3_NO_DEPT_RATION`/`STAGE4_NO_EMPL_WARN`）語意；本案例僅比對結果欄位是否一致，非比對 warning 陣列本身（warning 非 `ob_monthly_run_result` 欄位，不在 §零.7 診斷範圍）
- **Test Type**：EQ / Boundary

### TS-MSSQL-P5C-CHAINEQ-006：查無對應 `ob_emphire` 之 CR 業代（INNER JOIN 不命中，BR-F102-08），案件仍可流入步驟 3 被指派，兩側一致
- **Related Requirement**：F102 BR-F102-08
- **Test Type**：EQ / Negative

### TS-MSSQL-P5C-CHAINEQ-007（🔴 首次驗證組合缺口，非 P3a-d 個別站點測試範圍）：Stage 2 輸出邊界值（如查無對應 `card_level`→`score=NULL`，或 `card_level` 有值但查無對應 `ob_tier` 列→`tier_level=NULL`）餵入 Stage 3/4 比例分派後之處理（是否正常參與分派、被獨立分組、或被排除），兩側一致
- **Related Requirement**：Stage 2→Stage 3/4 之真實資料流串接；P3a-d 各自僅驗證「本站點輸入已知合法值」情境，未驗證「上一站點輸出邊界值」是否被下一站點正確處理，本案例為此組合缺口之首次覆蓋
- **Test Type**：EQ / Boundary（🔴 本文件方法論存在價值之代表案例）

### TS-MSSQL-P5C-CHAINEQ-008：customer_core 名單（§0.4 特殊處理）之 Stage 2-4/CR 全鏈結果兩側一致（Stage 1 輸出已由單次 MSSQL 下推共同起點保證相同，僅驗證下游）
- **Related Requirement**：★發現 4；§0.4
- **Test Type**：EQ

### TS-MSSQL-P5C-CHAINEQ-009：重跑冪等（同一 fixture 之 Tier 1 比對執行兩次，兩次皆為 0 差異，非首次偶然通過）
- **Related Requirement**：I-MSSQL-ENGINE-EQ-01 延伸；決定性保證
- **Test Type**：Regression / Idempotent

### TS-MSSQL-P5C-CHAINEQ-010（🔴🔴 決策關卡收尾，MUST-FIX）：任一案例出現差異時之根因分析框架——須明確歸類為「P3a-d 已知限制範圍內可解釋差異」「本文件新發現之組合缺口」「fixture 資料設計問題」三者之一，記錄於 §六 REPORT，不可籠統標註「可接受誤差」略過
- **Related Requirement**：test-designer Auto-Challenge Logic「失敗或復原行為未定義時需標記」
- **Test Type**：Decision Gate（文件化守門）

---

## 四、DATECAST-BOUNDARY — `appl_date` 非午夜時間分量邊界（銜接 P3d DATECAST-003 / 交 P5d 業務裁示）

> 前提：P3d `DATECAST-003` 已記錄「production `appl_date` 是否含非午夜時間分量未經查證」為待業務裁示之未驗證假設。本群組在**完整鏈路組合**層級（而非 P3d 之單站點層級）重新揭露此邊界，目的是**忠實記錄** JS oracle 與 MSSQL 是否分歧，**不代 P5d 業務裁示**其可接受度。

### TS-MSSQL-P5C-DATECAST-001（🔴 承 P3d DATECAST-003，完整鏈路延伸）：`appl_date` 帶非午夜時間分量（如 `14:30:00`）之案件，經完整 CR 步驟 1（逾 2 年清空）判定後，JS oracle 與 MSSQL 兩側是否一致
- **Related Requirement**：P3d DATECAST-002/003
- **Test Type**：Probe / Boundary（不預設答案，如實記錄）
- **Expected Result**：記錄兩側 `is_cr`/`cr_id` 判定結果；若分歧，列入 §六 REPORT 並標記「待 P5d 業務裁示」，不視為本文件之 FAIL

### TS-MSSQL-P5C-DATECAST-002：`appl_date` 恰為 `twoYearsAgo` 午夜（P3d 已驗證單站點不清空），完整鏈路組合下仍維持不清空
- **Related Requirement**：P3d STEP1-002 之完整鏈路回歸確認
- **Test Type**：Boundary / Regression

### TS-MSSQL-P5C-DATECAST-003：`appl_date` 為 `twoYearsAgo` 前後 1 天、不同時間分量之極近邊界組合，確認「日」粒度而非「秒」粒度判定兩側是否一致
- **Related Requirement**：DATECAST-001 之邊界延伸
- **Test Type**：Probe / Boundary（不預設答案）

---

## 五、DIST — 分佈層級檢核（輔助性、業務可讀摘要，非核心判定依據）

> 承★發現 6：本群組非本文件之核心判定基準（§三 CHAIN-EQ 之逐列 0 差異才是），僅作為**業務可讀的彙總視角**，比照 F067 §2/§8③ 格式呈現，供 P5e 報告快速目視確認整體健康度。

### TS-MSSQL-P5C-DIST-001：逐名單 `tier_level` 分佈 % 兩側一致（若 §三 已 0 差異，本項理論上必然一致，屬衍生驗證非獨立風險）
- **Related Requirement**：F067 §3/§7 格式先例
- **Test Type**：Positive / Reporting

### TS-MSSQL-P5C-DIST-002：逐名單部門分佈 %（比照 F067 §2/§8④ XVE1-4 格式）兩側一致
- **Related Requirement**：同上

### TS-MSSQL-P5C-DIST-003：CR % 兩側一致（比照 F067 §4）
- **Related Requirement**：同上

### TS-MSSQL-P5C-DIST-004：`card_level` 分佈兩側一致
- **Related Requirement**：同上

---

## 六、REPORT — 差異報告格式（F067 式簽核之技術附件）

### TS-MSSQL-P5C-REPORT-001（🔴 交付物核心）：報告結構定義 — 比照 F067 md 格式（範圍與方法／逐欄一致率／差異案件表／分佈摘要／結論），但方法論聲明段須明確區隔於 F067
- **Related Requirement**：AD §3.1 步驟 4；F067 格式先例
- **Test Type**：Documentation
- **Expected Result**：報告開頭明確聲明「**基準＝MSSQL 重現 JS oracle（P3a-d 已證與 SQL builder 逐列 EQ 之整合層驗收）**，非重驗 PG 實際執行或 legacy；兩側讀取同一份來源資料，案件集應完全相同，核心判定為逐列 0 差異」，與 F067「案件集不同、僅能比分佈」之方法論明確區分（避免讀者誤用 F067 之「差異可接受」既定印象套用於本報告）

### TS-MSSQL-P5C-REPORT-002：0 差異情境下之精簡格式（僅需摘要，不需列出差異表；不同於 F067 因案件集不同而必須用分佈比對）
- **Related Requirement**：★發現 6
- **Test Type**：Documentation

### TS-MSSQL-P5C-REPORT-003（🔴 DoD 核心）：有差異情境下之案件級記錄格式（案號 `(orgno,appl_no)` + 欄位名 + 兩側值 + §三 CHAINEQ-010 根因分類），比照 P4d/P5b「不可僅斷言了事」之文件化紀律
- **Related Requirement**：AD §5 P5c DoD #3「任何差異皆有具體案件級記錄與可解釋性判斷」
- **Test Type**：Documentation — DoD 核心

### TS-MSSQL-P5C-REPORT-004（🔴🔴 決策關卡，銜接 §一 GATE-002）：報告須於最顯著位置標註本次執行實際涵蓋之 Tier（僅 Tier 1，或含 Tier 2/3），供 P5e 業務簽核判斷佐證力道是否足夠，並列出待裁示選項（接受 Tier 1 proxy／要求額外 Tier）
- **Related Requirement**：§零.2；I-MSSQL-SIGNOFF-GATE-01
- **Test Type**：Decision Gate（文件化守門，🔴 MUST-FIX：不可省略此聲明）

### TS-MSSQL-P5C-REPORT-005：DATECAST-BOUNDARY 群組結果獨立段落記錄，明確標註「待 P5d 業務裁示」而非併入一般差異表
- **Related Requirement**：§四 DATECAST-BOUNDARY
- **Test Type**：Documentation

---

## 七、PG-ENHANCE — PG 可達時或額外資料工程後之加強比對（degradable，見 §零.1 Tier 2/3）

> 前提：`pgPortReachable()` 對 5433 回傳 `true`（Tier 2）；不可達時本群組 PGENH-001/002 全數 `describe.skip` + `SKIP_REASON`，**不構成 P5c DoD 未達成**（呼應 GATE-001）。

### TS-MSSQL-P5C-PGENH-001：`pgPortReachable()` 探測與 skip 機制自我驗證
- **Related Requirement**：§零.1 Tier 2；degradable 政策落地確認
- **Test Type**：Meta / Unit

### TS-MSSQL-P5C-PGENH-002（best-effort，Tier 2）：5433 可達時，同一份 fixture 於 PG 端執行完整月跑（走 PG 既有 SQL 下推 `executeStage2to4Pushdown`，**非** JS oracle），10 欄與 MSSQL 端（`RUN_ID_MSSQL`）逐列比對
- **Related Requirement**：§零.1 選項 (a)；I-MSSQL-SIGNOFF-GATE-01 條件 (a) 之直接證據（若此案例執行且通過，可完整滿足字面「PG/MSSQL」要求，優於 Tier 1 之 proxy 性質）
- **Test Type**：Positive / Integration — best-effort

### TS-MSSQL-P5C-PGENH-003（記錄性，Tier 3，非本文件 DoD 案例）：既有 PG 生產月跑唯讀快照比對（如 F067 run `84486ddd`）之可行性評估與所需額外工作量說明
- **Related Requirement**：§零.1 選項 (c)
- **Test Type**：Documentation
- **Expected Result**：記錄於 risks-and-gaps，列為 P5e 加強建議（需額外資料工程：匯出 dev PG 202606 來源快照→匯入 MSSQL CDMP_TEST→重跑→與既有 PG run 結果比對），非 P5c 阻擋項

---

## 八、STATIC — 事實鎖定

### TS-MSSQL-P5C-STATIC-001：本文件使用之私有方法（`executeV2`/`executeStage2to3PushdownMssql`/`runStage1JsChain`/`executeStage1Chain`）於本輪皆未被修改（凍結確認，本文件僅新增比對腳本，不動生產程式碼）
- **Related Requirement**：★發現 2、3

### TS-MSSQL-P5C-STATIC-002：10 欄位清單（`score`/`card_level`/`tier_level`/`is_cr`/`cr_id`/`cr_nm`/`dept_id`/`emplid`/`emplid_deptid`/`assignday`）與 `ob-monthly-run-result.entity.ts` 實際欄位定義一致（防未來欄位增刪未同步更新本文件）
- **Related Requirement**：★發現 5

---

## 九、REG — 回歸

### TS-MSSQL-P5C-REG-001：本文件執行（`run_id` 前綴隔離）不干擾既有 P3a-d/P5b 套件（呼應 §一 GATE-005、§0.5）
- **Related Requirement**：§0.5

### TS-MSSQL-P5C-REG-002：若比對機制以 TypeScript 腳本撰寫（見 §零.9 建議），`npx tsc --noEmit -p tsconfig.build.json` 乾淨
- **Related Requirement**：專案既有 DoD 紅線慣例（`feedback_vitest_no_typecheck`）；條件式適用（若最終改採純 SQL/手動查詢方式則不適用，由 tdd-implementation 依 §零.9 決策記錄後判定）

---

## 附：與 AD-E07-43 §5 P5c DoD 逐條對應

| AD §5 P5c DoD 原文 | 對應測試群組 |
|---|---|
| 「PG 與 MSSQL 於同一來源資料完整月跑各執行一次」 | §零.1（Tier 1/2/3 分層裁定）+ §七 PG-ENHANCE（Tier 2 執行 PG 實際月跑）+ §一 GATE-002（Tier 1 proxy 性質決策關卡） |
| 「`ob_monthly_run_result` 全部案件之 9 個關鍵欄位逐列比對完成」（本文件裁定聯集 10 欄，見 GATE-003） | §三 CHAIN-EQ（全 10 案例，核心 CHAINEQ-001/002） |
| 「產出比對結果文件（impl-log 風格），任何差異皆有具體案件級記錄與可解釋性判斷」 | §六 REPORT（全 5 案例，核心 REPORT-001/003/004） |
| （AD §0 背景）「MSSQL 月跑全鏈現已全部有值」之前提查證 | ★發現 2（本文件逐碼確認屬實） |
| （AD §3.1）「degradable，不偽綠」之 PG 端來源方法論 | §零.1（三選項可行性評估）+ §七 PGENH-001（skip 機制） |
| （AD §4 datetime2 邊界，銜接 P5d） | §四 DATECAST-BOUNDARY（3 案例，皆為 Probe，不預設答案） |
| （AD §6 I-MSSQL-ENGINE-EQ-01「本文件為此不變式在完整月跑層級之最終驗收」） | §三 CHAIN-EQ 全群組，尤其 CHAINEQ-001 旗艦 + CHAINEQ-007（組合缺口專項） |
| （AD §6 I-MSSQL-SIGNOFF-GATE-01 條件 (a)） | §一 GATE-002（決策關卡，本文件不自行裁定是否已滿足）+ §六 REPORT-004 |
