---
type: test-design-infrastructure
test-spec-id: AD-E07-43-P5g
feature_name: MSSQL 全面遷移 P5g — ETL target_load ATOMIC 資料完整性修法（交易包裝）測試設計
priority: P0-MVP（使用者裁定「切換前必做」——非阻擋 P5a~f/P5c/P5e 本身之既定推進，但為 MSSQL 正式 cutover 前之獨立必要關卡）
related_spec:
  - /docs/specs/implementation-log/AD-E07-43-mssql-p5-ci-signoff.md（§7 ATOMIC 資料完整性風險：§7.1 現象、§7.2 修法評估 a/b/c、§7.3 架構師推薦 (a) 交易包裝、§7.4 範圍歸屬裁定、§7.5 精簡摘要；§6 新增不變式 I-ETL-ATOMIC-LOAD-01）
  - /docs/specs/implementation-log/AD-E07-43-P5b-impl.md（§六 ATOMIC probe：真庫實測 4 種目標表形狀〔單欄 PK／composite PK／數值溢位／partition_replace〕結論一致＝分支 A 資料遺失，ATOMIC-001~004 逐字錯誤訊息與失敗後列數；本文件之壞值注入手法直接沿用）
  - apps/api/src/modules/etl/engine/pipeline-runner.ts（逐行查證：全檔零 startTransaction/commitTransaction/rollbackTransaction；`run()` 之單一 `queryRunner` 跨全部節點共用、外層 try/catch 於節點失敗時呼叫 `outputStore.cleanupAll(queryRunner)`）
  - apps/api/src/modules/etl/engine/handlers/target-load-handler.ts（PG 版，lines 118-163 partition_replace、165-214 fullMode、216-283 customer_core UPSERT 單句 `INSERT...ON CONFLICT`；lines 96-98/254-257 內部暫存表建立無對稱 finally 清理）
  - apps/api/src/modules/etl/engine/handlers/target-load-handler-mssql.ts（MSSQL 版，逐行結構對稱 PG 版；lines 130-169 partition_replace、171-206 fullMode、208-268 customer_core 兩段式 `UPDATE...FROM` + `INSERT...WHERE NOT EXISTS`；lines 269-275 既有 finally 區塊〔CLEANUP-GATE-001〕，僅清理自身 tempTable/dedupTable）
  - apps/api/src/modules/etl/etl-pipeline-execution.service.ts（唯一呼叫端：lines 321-323 `dataSource.createQueryRunner()`+`connect()`，無 startTransaction；同一 queryRunner 貫穿 `runner.run()` 全程並於 finally `release()`）
  - node_modules/typeorm/query-runner/QueryRunner.d.ts（已查證：`isTransactionActive: boolean`／`startTransaction(isolationLevel?)`／`commitTransaction()`／`rollbackTransaction()` 為 TypeORM 既有公開 API，非本文件臆測）
  - apps/api/src/modules/etl/engine/__tests__/_p5b-fixtures.ts（`connectMssqlP5b`/`P5B_TARGET_TABLES`/`insertTargetRows`/`countTarget`/`FIX_*` 系列 fixture，本文件直接複用其壞值注入手法）
  - apps/api/src/modules/etl/engine/__tests__/p5b-eqpg.mssql.spec.ts（PG degradable gating 慣例：`P5B_PG_DB` env var + `pgPortReachable()`，本文件沿用）
  - docker/mssql-init.sql（CDMP_P5B 獨立庫，本文件沿用不新建）
covers: []
spec_version: "1.0"
date: 2026-07-08
last_updated: 2026-07-08
---

# AD-E07-43 P5g：MSSQL 全面遷移 — ETL target_load ATOMIC 資料完整性修法（交易包裝）— 測試設計

> 本文件覆蓋 AD-E07-43 v1.1 §7（ATOMIC 資料完整性風險）之修法驗證切片（暫名 P5g），對應架構師推薦方案 **(a) 交易包裝**（TRUNCATE/DELETE 與其後 INSERT 同屬一個交易；INSERT 失敗則整個回滾、既存資料保留）與新增不變式 **I-ETL-ATOMIC-LOAD-01**。使用者已裁定「切換前必做」——本文件之定位為 MSSQL 正式 cutover 前的獨立必要關卡（非 P5a~f/P5c/P5e 既定推進之阻擋依賴，兩者互不阻擋，語意上是「兩份都要通過，但不互相排隊」）。
>
> **本文件性質＝「修法驗證」而非「探測」**：P5b §六 ATOMIC 群組（6 案例）已完成探測工作，證實分支 A（資料遺失）成立，`target-load-handler(-mssql).ts`/`pipeline-runner.ts` 於該輪列為凍結清單、report-not-fix。本文件是這些凍結檔案的**正式解凍**——tdd-implementation 將實際修改 `target-load-handler.ts`（PG）與 `target-load-handler-mssql.ts`（MSSQL）兩檔，本文件之測試案例即為修法後之驗收依據，多數案例直接沿用 P5b 已驗證有效的壞值注入 fixture，僅將預期結果由「分支 A（資料遺失）」翻轉為「分支 B（資料保留、失敗有回報）」。
>
> **★ test-designer 逐碼查證發現（本文件測試設計之關鍵事實基礎）**：
>
> 1. **🔴🔴 I-ETL-ATOMIC-LOAD-01 文字範圍缺口（本文件新查證，AD 未提及）**：不變式條文字面僅列「fullMode（TRUNCATE+INSERT）與 partition_replace（DELETE+INSERT）路徑」，但 `target-load-handler-mssql.ts` 之 customer_core UPSERT 路徑（lines 248-266）為**兩段式獨立陳述式**（`UPDATE...FROM` 既有列 → `INSERT...WHERE NOT EXISTS` 新列），兩者間同樣無交易保護——若 `updateSql` 成功但 `insertSql` 失敗，會產生「既有列已被更新為新值、但本應新增的客戶列缺失」之不一致中間態（非「先清空」型資料遺失，但同屬「本應原子的多陳述式操作缺乏交易保護」同一根因家族）。PG 版 UPSERT 為單句 `INSERT...SELECT...ON CONFLICT DO UPDATE`（lines 269-270），天生原子，不受影響。已獨立立 §四 UPSERT-ATOMIC 群組，因屬「同一輪修法之同一支檔案」自然延伸而納入範圍（非另開新任務），並設計決策關卡建議 architect 後續將不變式文字擴大涵蓋。
> 2. **🔴🔴 交易範圍必須窄於整個 pipeline（呼應任務指示，本文件操作化為可斷言的黑盒不變式）**：`pipeline-runner.ts` 之 `queryRunner` 為單一實例貫穿整條 DAG（所有節點共用同一連線），若交易包裝在 `target_load` 節點的 `execute()` 內部自行管理（`startTransaction`→...→`commitTransaction`/`rollbackTransaction`），此交易絕不可在節點執行完畢（無論成功/失敗）後仍保持開啟——已操作化為 TypeORM 既有公開屬性 `queryRunner.isTransactionActive` 之斷言（§五 SCOPE-001），不需臆測交易確切起訖語句位置即可黑盒驗證範圍正確性。
> 3. **🔴🔴 PG「中止交易污染連線」特性與清理機制之交互風險（本文件新查證，AD/P5b 皆未提及）**：PostgreSQL 於顯式交易內任一陳述式失敗後，連線進入 aborted 狀態，後續任何陳述式（含 `SELECT`/`DROP TABLE`）皆被拒絕、僅接受 `ROLLBACK`，直到明確執行 `ROLLBACK` 為止。若 handler 於 catch 區塊直接 `throw` 而未先呼叫 `rollbackTransaction()`，`pipeline-runner.ts` 外層 catch 呼叫的 `outputStore.cleanupAll(queryRunner)`（DROP 上游節點暫存表）會**連帶失敗**——這不是資料完整性問題本身，而是修法若實作不完整（漏補 rollback）會產生的**新副作用**，且此副作用在 PG 上會直接拋出可觀察錯誤（清理失敗），是絕佳的「實作是否確實呼叫 rollback」MUST-FIX 守門訊號，比直接斷言「呼叫了 rollbackTransaction()」（白盒 spy）更貼近黑盒精神。MSSQL 之對稱行為（無 `SET XACT_ABORT ON` 時是否同樣中止整個交易）**不可假設**，已列為 §九 CLEANUPTXN-002 決策關卡 Probe。
> 4. **🔴 架構師 §7.2「Read Committed 下讀者不會看到中間態」聲明對兩引擎的實際使用者體感不同（本文件新查證，需真實環境驗證非僅信任文字）**：PostgreSQL 之 Read Committed 為 MVCC 實作，並行讀者不受寫入方鎖阻擋、立即讀到交易開始前的已提交快照。SQL Server 之預設 Read Committed（除非資料庫已啟用 `READ_COMMITTED_SNAPSHOT`，本專案 `docker/mssql-init.sql` 逐行核對未見任何 RCSI/SNAPSHOT 設定）為**鎖based**實作，並行讀者於寫入方持有排他鎖期間會**被阻塞等待**，而非立即讀到舊資料。兩者最終皆不會導致「讀到空表」（符合架構師核心論證），但「等待」與「立即讀到舊資料」是使用者/其他月名單分派排程可感知的不同體感，已獨立立 §六 ISOLATION 群組真實探測，不預設答案。
> 5. **影響面盤點**：`target-load-handler.ts`/`target-load-handler-mssql.ts` 為 **6 條** pipeline 共用（P5b 已驗證之 5 條 fullMode/partition_replace + P4d customer_core UPSERT 1 條），本輪修法之異動半徑=此 6 條路徑全數；`pipeline-runner.ts`/`node-dispatcher.ts` 是否需要異動取決於交易管理位置之實作決策（§一 GATE-001），本文件不預設。
> 6. **🔴 P5b 既有 ATOMIC-001~006 案例將與本輪修法後行為直接矛盾**：`p5b-e2e.mssql.spec.ts` 現行斷言「分支 A（資料遺失、列數=0）」，修法後正確行為應翻轉為「分支 B（列數=既存值）」——此為本文件 §八 IMPACT-003 之 MUST-FIX 靜態守門，避免下游誤判 P5b 套件變紅燈為回歸失敗（實為預期之行為翻轉，需同步更新 P5b 測試檔或明確標記為 pre-fix baseline）。

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件全部 + `AD-E07-43-mssql-p5-ci-signoff.md` §7（現象/修法評估/推薦/範圍歸屬）+ `AD-E07-43-P5b-impl.md` §六 ATOMIC（壞值注入手法與逐字錯誤訊息，直接沿用）+ `target-load-handler.ts`/`target-load-handler-mssql.ts`（**本輪待修改物件，正式解凍**）+ `pipeline-runner.ts`（是否異動取決於 §一 GATE-001 決策）+ `_p5b-fixtures.ts`（harness 直接複用） |
| QA / Tester | 本文件 + P5b 既有 ATOMIC 測試檔（§八 IMPACT-003 同步更新需求） |
| DevOps / CI/CD | 本文件 §零 Harness（沿用 CDMP_P5B + P4d CDMP_TEST 兩個既有連線，不新建基礎設施） |
| Product Analyst / Architect | 本文件★發現 1（I-ETL-ATOMIC-LOAD-01 文字範圍缺口，UPSERT 路徑）、★發現 4（ISOLATION 群組之業務體感差異，MSSQL 可能阻塞查詢）、§五 SCOPE-005（7.8M 列規模分批策略決策關卡） |

---

## 零、測試環境與 Harness 設計

### 0.1 MSSQL：沿用 CDMP_P5B（不新建）

沿用 P5b 已建立之 `connectMssqlP5b()`/`teardownMssqlP5b()`/`P5B_TARGET_TABLES`/`insertTargetRows`/`countTarget`/`clearTarget`/`FIX_ARRETURNDF`/`FIX_CALENDAR`/`FIX_POOLDATA`/`FIX_POOLDATA_LIST`（`_p5b-fixtures.ts`）。§二 TXNCORE 群組之 4 種壞值形狀（`rest_flg` 空字串／`custo_no` 空字串／`add_un_capital` 16 位數／`ob_pool_data_list` 撞 PK）直接複用 P5b §0.4 已定義之「ATOMIC 專用批次」fixture 設計，不重新發明。`vi.setConfig({ testTimeout: 60000 })`（比照 P5b）。

### 0.2 customer_core UPSERT-ATOMIC：沿用 P4d CDMP_TEST（不新建）

CDMP_P5B 未建 `customer_core` 表（P5b 範圍明確排除 customer_core）。§四 UPSERT-ATOMIC 群組改連 `CDMP_TEST`（P4d 既有 harness），沿用「共用既有表＋前綴隔離寫入列＋精準 DELETE（禁 DROP/TRUNCATE）」原則（P3a Harness 環境依賴教訓，UPSERT 路徑本身無 TRUNCATE 語意，天然相容此原則）：寫入列 `source_customer_no` 一律加 `P5G_` 前綴，`afterAll` 精準 `DELETE WHERE source_customer_no LIKE 'P5G_%'`。

### 0.3 PG：沿用 `P5B_PG_DB` degradable 政策（不新建）

沿用 P5b `p5b-eqpg.mssql.spec.ts` 已確立之 `P5B_PG_DB`（env，非 `cdmp_test`）+ `pgPortReachable()`（5433）gating 慣例：不可達 → `describe.skip()` + `SKIP_REASON`（DEFERRED，非偽綠，不構成本文件 DoD 未達成）；可達 → §三 PGTXN、§四 UPSERTATOMIC-002 之 PG 側、§六 ISO-001 皆實際執行。

### 0.4 ISOLATION 群組專屬 Harness：雙連線手動編排

§六 ISOLATION 群組**不透過** `PipelineRunner`/handler 驅動（那會使 BEGIN 與 INSERT 之間無可控制的觀測窗口）。改為測試檔內直接以兩個獨立 `QueryRunner`（連同一實體庫）手動下達裸 SQL 序列：連線 A 執行 `startTransaction()` → `TRUNCATE`/`DELETE` → **顯式暫停點**（`await` 一個受控的 Promise，由測試協調而非 `setTimeout` 猜測時機）→ 連線 B 同時執行 `SELECT COUNT(*)` 並記錄回傳所需時間/結果 → 連線 A 繼續 `INSERT` → `commitTransaction()`。此手法驗證的是**資料庫引擎本身**的隔離語意（架構師 §7.2 論證前提），非 handler 程式碼正確性，故刻意繞開 handler。

### 0.5 GATE-001 決策關卡前置說明

本文件多數案例以「黑盒可觀察行為」設計（DB 最終狀態、`errorMessage`、`isTransactionActive`），刻意不預設交易由 `pipeline-runner.ts` 或 handler 內部管理——兩者皆能滿足黑盒斷言，實作選擇留給 tdd-implementation（§一 GATE-001），但要求 impl log 明確記錄選擇。

---

## 一、GATE — 決策關卡（交易範圍/isolation level/Harness 策略）

### TS-MSSQL-P5G-GATE-001（🔴🔴 決策關卡）：交易管理位置——`target-load-handler(.ts/-mssql.ts)::execute()` 內部自行管理，或由 `pipeline-runner.ts` 於呼叫 `executor.execute()` 外層包一層 per-node 交易
- **Related Requirement**：AD §7.2 修法描述僅指定「範圍＝TRUNCATE/DELETE 與其後 INSERT」，未指定實作位置
- **Test Type**：Decision Gate（文件化守門，不預設答案）
- **Expected Result**：impl log 記錄選擇 + 理由；本文件其餘案例（尤其 §五 SCOPE、§九 CLEANUPTXN）以黑盒方式驗證，兩種選擇皆須通過

---

### TS-MSSQL-P5G-GATE-002：交易 isolation level 是否顯式指定
- **Related Requirement**：架構師 §7.2「標準 Read Committed 隔離等級下」之論證前提
- **Test Type**：Decision Gate
- **Expected Result**：impl log 記錄「未顯式指定（沿用 driver 預設，PG/MSSQL 慣例皆為 READ COMMITTED）」或「顯式指定 READ COMMITTED」；**不可**指定為 `READ UNCOMMITTED`（會使中間態對其他 session 可見，直接違反 §7.2 論證前提與 I-ETL-ATOMIC-LOAD-01 之效益基礎）——若發現指定為 READ UNCOMMITTED，判定 MUST-FIX 紅燈

---

### TS-MSSQL-P5G-GATE-003：Harness 策略沿用確認（本文件不新建任何測試基礎設施）
- **Related Requirement**：§零 0.1~0.3
- **Test Type**：Meta / Regression
- **Expected Result**：`connectMssqlP5b`/`P5B_PG_DB`/P4d CDMP_TEST harness 三者皆可直接複用，不需新增 docker-compose 服務或新資料庫

---

### TS-MSSQL-P5G-GATE-004：暫存表（enrichment/dedup temp/`##`）建立時機——交易開始前或交易開始後
- **Related Requirement**：★發現 2；§五 SCOPE 群組之前提
- **Test Type**：Decision Gate
- **Expected Result**：impl log 記錄選擇；兩種選擇皆須使 §五 SCOPE-001/§九 CLEANUPTXN-003 成立（若選「交易內建立」，PG 側需額外確認 ROLLBACK 後這些暫存表不復存在時，既有 `DROP TABLE IF EXISTS` 清理陳述式〔`IF EXISTS` 語法〕不會因表已消失而拋錯——這是 `IF EXISTS` 語法本身的既有防禦，僅需回歸確認非新驗證機制）

---

## 二、TXN-CORE-MSSQL — 🔴🔴 交易包裝核心正確性（DoD 核心，直接對應 I-ETL-ATOMIC-LOAD-01，MSSQL 側）

> 沿用 P5b §六 ATOMIC-001~004 完全相同之壞值注入 fixture 與觸發手法，本輪為修法後回歸，預期結果由「分支 A（資料遺失）」翻轉為「分支 B（資料保留、失敗正確回報）」。

### TS-MSSQL-P5G-TXNCORE-001（🔴🔴 MUST-FIX）：`ob_calendar`（單欄 PK，fullMode）預先塞入 3 筆既存合法列，觸發 `rest_flg` 空字串 NOT NULL 違反
- **Related Requirement**：I-ETL-ATOMIC-LOAD-01；P5b ATOMIC-001 之修法後對照
- **Test Type**：Negative / Integration — **DoD 核心**
- **Steps**：
  1. 預塞 3 筆既存列，確認 `COUNT(*)=3`
  2. 執行含 P5b §0.4 ATOMIC 專用批次（1 筆 `rest_flg` 空字串）之端對端 pipeline，等待 `tl1.status==='failed'`
  3. 立即查詢 `SELECT COUNT(*) FROM ob_calendar`
- **Expected Result**：`COUNT(*)=3`（既存列完整保留，非 P5b 修法前之 0）；`tl1.errorMessage` 含與 P5b ATOMIC-001 相同語意之錯誤訊息字樣（`Cannot insert the value NULL into column 'rest_flg'`）

---

### TS-MSSQL-P5G-TXNCORE-002（🔴🔴 MUST-FIX）：`ob_pool_data`（composite PK + 多 NOT NULL 業務欄，fullMode）對稱驗證
- **Related Requirement**：同上；P5b ATOMIC-002 修法後對照；確認結論不因表結構複雜度改變
- **Test Type**：Negative / Integration — **DoD 核心**
- **Preconditions**：P5b §0.4 ATOMIC 專用批次（1 筆 `custo_no` 空字串）
- **Expected Result**：既存列數不變（非 0）

---

### TS-MSSQL-P5G-TXNCORE-003（🔴🔴 MUST-FIX）：`ob_arreturndf_min_cap.add_un_capital numeric(15,0)` 餵入 16 位數字串（隱式轉換溢位路徑，非 NOT NULL 路徑）
- **Related Requirement**：同上；P5b ATOMIC-003 修法後對照
- **Test Type**：Negative / Integration — **DoD 核心**
- **Expected Result**：既存列數不變；`errorMessage` 含 `Arithmetic overflow` 字樣

---

### TS-MSSQL-P5G-TXNCORE-004（🔴🔴 MUST-FIX）：`ob_pool_data_list`（partition_replace）撞 PK 情境
- **Related Requirement**：同上；P5b ATOMIC-004 修法後對照
- **Test Type**：Negative / Integration — **DoD 核心**
- **Expected Result**：`data_source='etl_load'` 分區既存列數不變（非 0）；他分區（`_P5B_OTHER_`）依然不受影響（沿用 P5b 既有結論，本案例僅需確認未回歸，不重複推導他分區隔離機制本身）

---

### TS-MSSQL-P5G-TXNCORE-005（🔴 DoD 核心，回歸）：TXNCORE-001~004 四案例之 `tl1.status`/`errorMessage`/`nodeLogs` 整體結構與 P5b 修法前完全一致，僅目標表最終列數分支翻轉
- **Related Requirement**：呼叫端可觀察性不可因修法而劣化（呼叫端仍需正確得知「這次執行失敗了」，不可被交易包裝意外吞掉錯誤）
- **Test Type**：Regression / Integration — **DoD 核心**

---

### TS-MSSQL-P5G-TXNCORE-006：任一案例透過方案甲（`EtlPipelineExecutionService.triggerExecute`）驅動時，`EtlPipelineLog.status` 正確落地 `failed`（非誤判 `completed`，抽 1 案例代表即可）
- **Related Requirement**：銜接 P5b DISPATCHE2E 慣例；確認修法不影響 service 層狀態回寫邏輯

---

### TS-MSSQL-P5G-TXNCORE-007（🔴 決定性回歸，可恢復性）：TXNCORE-001~004 任一情境失敗後，改用乾淨 fixture 立即重跑，pipeline 可正常完成且資料正確落地
- **Related Requirement**：架構師 §7.3「(a) 單獨不足以解決可用性問題……但仍需可重試」隱含前提；驗證修法後系統「安全失敗、可恢復」而非「安全失敗、卡死」
- **Test Type**：Positive / Integration — **DoD 核心**

---

## 三、TXN-CORE-PG — 交易包裝核心正確性（PG 側，degradable，`P5B_PG_DB`）

> **前提**：`pgPortReachable()`（5433）為 true 且 `P5B_PG_DB` 已設。不可達 → 本群組全數 `describe.skip()` + `SKIP_REASON`，不構成本文件 DoD 未達成（沿用 P5b EQ-PG 政策）。**架構師明確裁定「PG 亦須修，兩引擎共通」**——本群組非錦上添花，是 I-ETL-ATOMIC-LOAD-01「兩引擎對稱落地」文字要求之直接驗收，僅因環境限制而降級為 degradable 執行層級（非降低驗收標準本身）。

### TS-MSSQL-P5G-PGTXN-001~004（🔴🔴 MUST-FIX，degradable）：TXNCORE-001~004 之 PG 對稱版本
- **Related Requirement**：I-ETL-ATOMIC-LOAD-01「此為 PG／MSSQL 兩引擎共通適用之原則，修法須兩引擎對稱落地，不得僅修其一」
- **Test Type**：Negative / Integration
- **Expected Result**：PG 慣用錯誤訊息字面（`null value in column "rest_flg" violates not-null constraint`／`numeric field overflow`／`duplicate key value violates unique constraint`），既存列數不變（非 0）——四案例分別對應 TXNCORE-001~004 之目標表/壞值形狀

---

### TS-MSSQL-P5G-PGTXN-005（旗艦，degradable）：兩引擎對稱結論鎖定——同一壞值形狀，PG 與 MSSQL 皆呈現「分支 B（資料保留）」，佐證修法確實兩引擎對稱落地而非僅修其一
- **Related Requirement**：I-ETL-ATOMIC-LOAD-01 核心要求
- **Test Type**：Positive / Integration — **DoD 核心（若可達）**

---

### TS-MSSQL-P5G-PGTXN-006：`P5B_PG_DB` 不可達時之 `SKIP_REASON` 自我驗證（harness 政策回歸）
- **Related Requirement**：§零 0.3 政策落地確認

---

## 四、UPSERT-ATOMIC — customer_core 兩段式 UPDATE+INSERT 部分套用風險（🔴🔴 本文件新查證發現，I-ETL-ATOMIC-LOAD-01 文字未明確涵蓋）

> **前言**：I-ETL-ATOMIC-LOAD-01 文字字面僅列 fullMode／partition_replace。`target-load-handler-mssql.ts` 之 customer_core UPSERT 為**同一支檔案**內第三條路徑，本輪修法既然要改動這支檔案，理應一併檢視是否引入或維持同型風險——依「同一輪修法之同一支檔案自然延伸」原則納入範圍，非另開新任務，但明確標記此範圍擴張供 architect 確認（TS-...-003）。

### TS-MSSQL-P5G-UPSERTATOMIC-001（🔴🔴 MUST-FIX，MSSQL 專屬）：構造情境使 `updateSql`（既有列更新）成功、`insertSql`（新列插入）失敗，驗證修法後 `updateSql` 之變更被回滾（既有列恢復至更新前之值），而非停留在「已更新但新列缺失」之不一致中間態
- **Related Requirement**：★發現 1
- **Test Type**：Negative / Integration — **DoD 核心（本文件範圍擴張項）**
- **Preconditions**：
  1. `customer_core` 內預先存在 1 筆 `P5G_` 前綴既有客戶（供 `updateSql` 命中）
  2. 來源批次含：(a) 該既有客戶之更新值、(b) 至少 1 筆新客戶但刻意違反 target 端 NOT NULL 業務欄（ghostGate 未過濾之邊界情況，或其他可靠觸發 `insertSql` 失敗但不影響 `updateSql` 本身執行之手法）
- **Expected Result**：既有客戶列之業務欄位維持**更新前**原值；新客戶列不存在；`tl1.status==='failed'`
- **決策關卡（若窮舉後找不到「updateSql 成功、insertSql 必然失敗」之真實可觸發路徑）**：退化為以測試替身（mock/stub `queryRunner.query`，令第二次呼叫拋錯）驗證 handler 邏輯本身之回滾正確性，並於 impl log 記錄改用測試替身之理由，不可因找不到真實路徑而略過此案例整體

---

### TS-MSSQL-P5G-UPSERTATOMIC-002（回歸）：PG UPSERT 路徑（單句 `INSERT...ON CONFLICT DO UPDATE`）加上交易包裝後行為/正確性無退化
- **Related Requirement**：PG UPSERT 天生單句原子，交易包裝屬「錦上添花」非必要修復，但不可因新增交易包裝而破壞既有行為
- **Test Type**：Regression / Integration（degradable，`P5B_PG_DB`）

---

### TS-MSSQL-P5G-UPSERTATOMIC-003（決策關卡）：impl log 需獨立段落記錄「I-ETL-ATOMIC-LOAD-01 文字僅列 fullMode/partition_replace，customer_core UPSERT 兩段式路徑屬同一 handler 之類似風險但未被不變式文字明確涵蓋，本輪基於『同檔案同修法機制』原則主動納入」，建議 architect 後續修訂正式擴大不變式文字範圍
- **Related Requirement**：test-designer Auto-Challenge Logic（不變式範圍缺口）
- **Test Type**：Decision Gate（文件化守門）

---

## 五、SCOPE — 交易範圍正確性（🔴🔴 決策關卡 + MUST-FIX，操作化「非整個 pipeline」設計要求）

### TS-MSSQL-P5G-SCOPE-001（🔴🔴 MUST-FIX，核心不變式）：任一 `target_load` 節點（成功或失敗路徑皆同樣驗證）執行完畢（`executor.execute()` resolve 或 reject）後，`context.queryRunner.isTransactionActive === false`
- **Related Requirement**：★發現 2；架構師/任務指示「交易應包 target-load 的 clear+insert，非整個 pipeline」之黑盒操作化版本
- **Test Type**：Negative + Positive / Integration — **DoD 核心，兩引擎皆驗**
- **Expected Result**：無論成功/失敗、無論 GATE-001 選擇哪種實作位置，交易絕不可殘留跨越節點邊界

---

### TS-MSSQL-P5G-SCOPE-002：`target_load` 之前的節點（`extract`/`field_mapping`/`conditional`）之暫存表建立與內容，於 `target_load` 交易 rollback 後不受影響（既有行為之回歸確認，非新驗證機制）
- **Related Requirement**：★發現 2 之交易邊界不可外溢

---

### TS-MSSQL-P5G-SCOPE-003：交易範圍不涵蓋純唯讀前置查詢（`validate target table exists`／`getColumns`／`getPrimaryKeyColumns`）——這些查詢發生於交易開始前，目標表不存在等既有錯誤路徑行為與 P5b 既有 GATE 案例一致
- **Related Requirement**：回歸，確認修法未意外擴大交易範圍吞掉前置驗證邏輯

---

### TS-MSSQL-P5G-SCOPE-004（決策關卡）：dedup/enrichment 暫存表建立時機（交易內／交易外）之驗證收斂——兩種選擇皆須使 SCOPE-001 與 §九 CLEANUPTXN-003 成立
- **Related Requirement**：GATE-004 之延伸驗證

---

### TS-MSSQL-P5G-SCOPE-005（🔴 高風險，決策關卡，不預設答案）：7.8M 列規模下，`INSERT...SELECT` 是否維持「單條陳述式、整批進同一交易」，或需引入分批（若分批，各批各自交易 vs 全批同一交易）
- **Related Requirement**：任務指示明確要求「不可臆測 7.8M 列交易可行性」；CLAUDE.md ETL 紅線（生產規模資料須設計串流/批次，避免記憶體策略）
- **Test Type**：Decision Gate（不預設答案）
- **Expected Result**：impl log 記錄選擇之一：
  - (a) **維持現行單條 INSERT 語意**（現行架構本就是單條 `INSERT...SELECT`，In-DB 搬移無 bind 參數不受 65535 上限約束，交易包裝僅延長「TRUNCATE 到 INSERT 之間」的極短間隙，不改變 INSERT 本身耗時）——若選此項，需附上「單條 INSERT 語句本身在 7.8M 列規模下之交易鎖持有時間」之觀察性數據或既有量測依據（若無法在本輪取得真實規模數據，允許以文件化風險記錄替代，不阻擋 DoD）
  - (b) **改為分批**——若選此項，**必須**額外分析與 I-ETL-ATOMIC-LOAD-01 字面「INSERT 失敗時必須完整回滾」之潛在衝突（分批意味著部分批次可能已提交），並交 architect 確認是否需修訂不變式文字或改採「全批同一交易」之分批寫法（每批各自 INSERT 但共用同一未提交交易，僅最終才 commit）
- **本案例為本文件唯一容許「留待 tdd-implementation 依真實量測結果決定」但要求務必記錄決策與理由之案例**

---

### TS-MSSQL-P5G-SCOPE-006：MSSQL `##` 全域暫存表於交易開始前已建立時，交易內對其 `SELECT` 存取正確可見（回歸，確認交易包裝不破壞既有 `##` 表跨陳述式可見性）
- **Related Requirement**：★發現 2；`target-load-handler-mssql.ts` 既有 `##` 全域暫存表架構相容性

---

## 六、ISOLATION — 並行讀者可見性驗證（🔴🔴 架構師 §7.2 聲明之真實環境驗證，不可假設）

> **前提**：§零 0.4 雙連線手動編排 Harness。本群組驗證的是**資料庫引擎**本身的隔離語意，非 handler 程式碼正確性。

### TS-MSSQL-P5G-ISO-001（🔴🔴 決策關卡/Probe，PG，degradable）：連線 A `BEGIN`→`TRUNCATE`→[暫停]→連線 B 同時 `SELECT COUNT(*)`→連線 A `INSERT`→`COMMIT`；驗證連線 B 之查詢立即回傳「交易開始前」列數（非阻塞、非空表、非等待）
- **Related Requirement**：架構師 §7.2 對 PG 之聲明；★發現 4
- **Test Type**：Probe / Integration — 驗證既定 PG MVCC 特性，預期通過（非探測性不確定案例，但仍需真實環境佐證而非僅信任文件）
- **Expected Result**：連線 B 查詢立即返回、結果等於交易開始前列數；查詢耗時無明顯延遲（非等待鎖釋放）

---

### TS-MSSQL-P5G-ISO-002（🔴🔴 決策關卡/Probe，MSSQL，不預設答案，本文件最重要探測案例之一）：同一序列於 MSSQL（CDMP_P5B）執行，記錄連線 B 之查詢行為屬於分支 (a) 或 (b)
- **Related Requirement**：★發現 4
- **Test Type**：Probe / Integration — **不預設答案，兩分支皆為合法觀察，但需明確記錄**
- **Expected Result（兩分支皆合法，需明確判定）**：
  - **分支 (a)**（若 CDMP_P5B 已啟用 `READ_COMMITTED_SNAPSHOT`）：連線 B 立即回傳交易開始前列數，行為與 PG 對稱
  - **分支 (b)**（預設 Read Committed 無 RCSI 之標準鎖行為，依 `docker/mssql-init.sql` 逐行核對結果推測為較可能發生的分支，但**不可僅憑此推測略過實測**）：連線 B 查詢被阻塞，直到連線 A `COMMIT`/`ROLLBACK` 後才返回（返回值視最終提交/回滾結果而定，且不會是「空表」）

---

### TS-MSSQL-P5G-ISO-003（決策關卡，記錄性）：若 ISO-002 確認為分支 (b)，需將此記錄為架構師 §7.2 聲明之 MSSQL 版本精確化說明（「不會讀到空表，但可能短暫阻塞等待」而非「無感知」），供業務評估月名單分派期間查詢阻塞是否可接受
- **Related Requirement**：★發現 4；呼應既有 project memory「月名單分派改 worker 抽離後 API 8–34ms」效能基準——若阻塞時間達秒級，需確認是否影響該基準之既有結論（非本文件裁定，僅記錄供評估）
- **Test Type**：Decision Gate（文件化守門，交 architect/業務參考）

---

### TS-MSSQL-P5G-ISO-004：本群組以少量 fixture（5-20 列）即可驗證機制本身之有無（鎖 vs MVCC 為引擎屬性，與資料量無關），大規模效能影響另計於 §五 SCOPE-005，不在本群組重複驗證
- **Related Requirement**：測試設計效率原則，避免與 SCOPE-005 重工

---

## 七、REGRESSION-SUCCESS — 成功路徑不破壞（承 P5b FULLMODE/PARTITION-WIRING 既有結論，本輪僅回歸確認交易包裝不改變乾淨路徑行為）

### TS-MSSQL-P5G-SUCC-001（🔴 DoD 核心）：4 條 fullMode pipeline（`ob_arreturndf_min_cap`/`ob_calendar`/`ob_emphire`/`ob_pool_data`）乾淨 fixture 端對端執行，資料正確落地，與 P5b FULLMODE-WIRING 既有斷言逐一比對一致
- **Related Requirement**：回歸，非新機制

---

### TS-MSSQL-P5G-SUCC-002（🔴 DoD 核心）：`ob_pool_data_list`（partition_replace）乾淨 fixture 端對端執行，分區語意（僅替換 `data_source='etl_load'`、他分區不受影響）不變
- **Related Requirement**：回歸 P5b PARTITION-WIRING

---

### TS-MSSQL-P5G-SUCC-003（🔴 DoD 核心）：customer_core UPSERT 乾淨 fixture 端對端執行，PG/MSSQL 皆行為不變（既有列更新/新列插入正確）
- **Related Requirement**：回歸 P4d 既有結論；degradable（PG 側）

---

### TS-MSSQL-P5G-SUCC-004：composite PK dedup 決定性（MSSQL `_seq` tie-breaker）於交易包裝後依然成立，連跑 3 次勝出列一致
- **Related Requirement**：回歸 P4c/P5b 既有 tie-breaker 結論，確認交易邊界不影響 dedup 執行順序

---

### TS-MSSQL-P5G-SUCC-005（🔴 DoD 核心）：冪等重跑——4 條 fullMode + 1 條 partition_replace 各自重跑第二次，目標表列數不疊加
- **Related Requirement**：回歸 P5b IDEMPOTENT 群組

---

### TS-MSSQL-P5G-SUCC-006（觀察性，非阻擋）：小量 fixture（5-100 列）下，交易包裝前後之執行耗時差異可忽略（BEGIN/COMMIT 微秒級開銷）
- **Related Requirement**：架構師 §7.2「低額外成本」聲明之基本佐證；大規模（7.8M 列）效能影響留待 §五 SCOPE-005 決策關卡另行處理，本案例不臆測大規模數據，不設嚴格效能門檻

---

## 八、IMPACT — 影響面盤點（所有 pipeline，凍結清單解除確認）

### TS-MSSQL-P5G-IMPACT-001（🔴 MUST-FIX，靜態）：grep `etl-pipelines.json` 全部 `target_load` 節點，鎖定本輪修法影響之 pipeline 全集
- **Related Requirement**：★發現 5；比照既有查證方法「AD 以單一命名路徑描述某 handler 時務必 grep 全部真實 pipeline 確認共用」
- **Test Type**：Regression / Unit — 靜態讀取
- **Expected Result**：恰 6 條（P5b 已驗證 5 條 fullMode/partition_replace + P4d customer_core UPSERT 1 條），無第 7 條被遺漏之 `target_load` 使用路徑

---

### TS-MSSQL-P5G-IMPACT-002：`target-load-handler.ts`（PG）/`target-load-handler-mssql.ts`（MSSQL）為本輪修法之核心異動點；`pipeline-runner.ts` 是否異動由 GATE-001 決策結果決定
- **Related Requirement**：GATE-001

---

### TS-MSSQL-P5G-IMPACT-003（🔴🔴 MUST-FIX，靜態，防誤判回歸）：確認 P5b 既有 `p5b-e2e.mssql.spec.ts` 之 ATOMIC-001~006 六案例已同步更新或明確標記為「pre-fix baseline、本輪後不代表現行行為」，避免其斷言（分支 A／資料遺失）與本輪修法後之實際行為（分支 B／資料保留）產生直接矛盾而被誤判為套件回歸失敗
- **Related Requirement**：★發現 6；`AD-E07-43-P5b-impl.md` §六「ATOMIC probe 最終結論」段
- **Test Type**：Decision Gate（文件化守門，🔴 MUST-FIX：需 impl log 明確記錄更新方式，如「原地更新斷言」或「保留為 `.skip` 並新增 P5g 版本」二擇一並說明理由）

---

### TS-MSSQL-P5G-IMPACT-004：`node-dispatcher.ts` 本輪不受影響（僅負責 handler 註冊/查找，不涉及交易生命週期）
- **Related Requirement**：回歸確認，範圍界定

---

## 九、CLEANUPTXN — 交易失敗後暫存表清理正確性（🔴🔴 本文件新查證發現，PG「交易中止污染連線」風險）

### TS-MSSQL-P5G-CLEANUPTXN-001（🔴🔴 MUST-FIX，PG 專屬風險，本文件核心新發現，degradable）：PG 交易內 INSERT 失敗後，確認上游節點（`extract`/`field_mapping`/`conditional`）之暫存表清理（`pipeline-runner.ts` 外層 catch 呼叫之 `outputStore.cleanupAll(queryRunner)`）依然成功執行，不因連線處於「aborted transaction」狀態而額外失敗
- **Related Requirement**：★發現 3；PostgreSQL 交易中止語意（任一陳述式失敗後連線僅接受 `ROLLBACK` 直到明確執行）
- **Test Type**：Negative / Integration — **DoD 核心（PG 側，degradable）**
- **Expected Result**：`outputStore.cleanupAll()` 完整成功（無額外拋錯）；隱含要求 handler 於 catch 區塊必須先呼叫 `rollbackTransaction()` 才能 re-throw，否則本案例會直接暴露為清理階段的可觀察錯誤（黑盒訊號，非白盒 spy 斷言）

---

### TS-MSSQL-P5G-CLEANUPTXN-002（🔴 MSSQL 對照，不預設答案，Probe）：MSSQL（無 `SET XACT_ABORT ON`）同一情境下，若 handler 未顯式呼叫 `rollbackTransaction()`，後續 `##` 表清理是否仍能執行
- **Related Requirement**：★發現 3；MSSQL 預設交易語意與 PG 不同，單一陳述式錯誤未必自動中止整個交易
- **Test Type**：Probe / Integration — 探測記錄用，**即使 MSSQL 因語意寬鬆而「意外不出錯」，仍要求兩引擎一致地顯式呼叫 rollback（正確性不應依賴引擎寬容度），不因本案例意外通過而放寬 CLEANUPTXN-001 之 MUST-FIX 要求**

---

### TS-MSSQL-P5G-CLEANUPTXN-003：`target-load-handler-mssql.ts` 既有 `finally` 區塊（CLEANUP-GATE-001，清理自身 tempTable/dedupTable）於交易失敗路徑下依然正確執行
- **Related Requirement**：回歸 P5b CLEANUP-002/003；呼應 GATE-004 兩種暫存表建立時機選擇皆須成立

---

### TS-MSSQL-P5G-CLEANUPTXN-004（記錄性，不阻擋）：`target-load-handler.ts`（PG）目前無對稱 `finally` 清理自身 `tempTable`/`dedupTable`/`insertSourceTable`（既有缺口，非本輪引入）——確認交易回滾後這些 PG 暫存表殘留與否，若殘留記入風險段落供未來獨立任務處理，不擴大本輪修復範圍
- **Related Requirement**：PG handler 既有架構缺口之誠實記錄，非本輪 DoD 要求

---

## 十、STATIC — 事實鎖定

### TS-MSSQL-P5G-STATIC-001（🔴 MUST-FIX）：`target-load-handler.ts`/`target-load-handler-mssql.ts` 兩檔皆含 `startTransaction`/`commitTransaction`/`rollbackTransaction` 呼叫（靜態掃描）
- **Related Requirement**：I-ETL-ATOMIC-LOAD-01 修法落地之最基本靜態守門；取代 P5b STATIC-004「未修改」守門——本輪起兩檔正式解凍

---

### TS-MSSQL-P5G-STATIC-002：`pipeline-runner.ts`/`node-dispatcher.ts` 依 GATE-001 決策結果，若選擇 handler-only 方案，兩檔應保持未修改
- **Related Requirement**：GATE-001 決策之落地確認

---

### TS-MSSQL-P5G-STATIC-003：兩 handler 檔案交易呼叫站點數量對稱（PG/MSSQL 各自 fullMode + partition_replace + [依 §四 決策] UPSERT 路徑）
- **Related Requirement**：I-ETL-ATOMIC-LOAD-01「兩引擎對稱落地」

---

### TS-MSSQL-P5G-STATIC-004：本輪未修改 9 個 handler 中除 `target_load` 以外的其餘 8 個（PG+MSSQL 共 16 個檔案）
- **Related Requirement**：範圍界定，回歸確認未意外擴大修改範圍

---

## 十一、REG — 回歸

### TS-MSSQL-P5G-REG-001（DoD 紅線）：`npx tsc --noEmit -p tsconfig.build.json` 乾淨
- **Related Requirement**：專案既有 DoD 紅線慣例（`feedback_vitest_no_typecheck`）

---

### TS-MSSQL-P5G-REG-002：P3/P4/P5b/P5c 既有測試套件不回歸（P5b 既有 ATOMIC 案例依 §八 IMPACT-003 同步更新，非單純「保持原樣通過」）

---

### TS-MSSQL-P5G-REG-003：PG/sqlite dispatcher 路徑（`DB_TYPE!=='mssql'`）不受影響，`createDispatcher()` 分流邏輯不變

---

### TS-MSSQL-P5G-REG-004：本文件測試資料與既有 P3 系列共用 dbo 表隔離慣例一致（沿用 CDMP_P5B/CDMP_TEST 既有前綴/DELETE 慣例，不新增 TRUNCATE 使用場景於任何共用表）

---

### TS-MSSQL-P5G-REG-005：F098/F101/F102/F104 等既有真實月名單分派相關套件不受影響（本輪修法僅影響 ETL 載入層，不改變月名單分派 Stage 1-4 邏輯本身）

---

## 附：與 AD-E07-43 §7 / I-ETL-ATOMIC-LOAD-01 逐條對應

| AD §7 原文 / 不變式條文 | 對應測試群組 |
|---|---|
| §7.1「TRUNCATE/DELETE 為獨立陳述式、先提交；INSERT 若失敗不會回滾」（修法前現象，P5b 已探測） | §二 TXNCORE / §三 PGTXN（修法後回歸翻轉） |
| I-ETL-ATOMIC-LOAD-01「破壞性陳述式與其後之 INSERT 必須同屬一個交易；INSERT 失敗時必須完整回滾至破壞性陳述式執行前之狀態」 | §二 TXNCORE、§三 PGTXN（核心 DoD） |
| I-ETL-ATOMIC-LOAD-01「此為 PG／MSSQL 兩引擎共通適用之原則，修法須兩引擎對稱落地，不得僅修其一」 | §三 PGTXN-005；§十 STATIC-003 |
| §7.2「(a) 讀者中間態可見性補充說明——標準 Read Committed 隔離等級下，其他 session 讀到的仍是交易開始前的舊資料」 | §六 ISOLATION（🔴🔴 真實環境驗證，非僅信任文字） |
| §7.3「(a) 直接消除資料遺失……成本最低、雙引擎可對稱落地、與既有單句大陳述式架構完全相容」 | §七 REGRESSION-SUCCESS（相容性/成本回歸） |
| （任務指示）「交易應包 target-load 的 clear+insert，非整個 pipeline，避免長交易鎖表」 | §五 SCOPE（🔴🔴 `isTransactionActive` 黑盒操作化） |
| （任務指示）「與 ##global temp 架構相容、與串流/批次 INSERT 相容，勿臆測 7.8M 列交易可行性」 | §五 SCOPE-005/SCOPE-006（決策關卡，不預設答案） |
| （任務指示）「影響面：所有 pipeline，含 customer_core UPSERT」 | §四 UPSERT-ATOMIC；§八 IMPACT-001 |
| （test-designer 新查證）「I-ETL-ATOMIC-LOAD-01 文字未涵蓋 UPSERT 兩段式路徑」 | §四 UPSERTATOMIC-003（決策關卡） |
| （test-designer 新查證）「PG 交易中止污染連線與清理機制之交互風險」 | §九 CLEANUPTXN |
| （test-designer 新查證）「P5b 既有 ATOMIC 案例將與修法後行為矛盾」 | §八 IMPACT-003（🔴🔴 MUST-FIX 防誤判） |
| §7.4「歸屬：獨立於 P5 核心範圍之新增子切片，不阻擋 P5a~f/P5c/P5e 之既定推進」+ 使用者裁定「切換前必做」 | 本文件整體定位（front matter priority 註記） |
