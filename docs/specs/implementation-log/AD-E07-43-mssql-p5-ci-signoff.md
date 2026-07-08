---
ad-id: AD-E07-43
title: MSSQL 全面遷移 P5（全量 CI + F067 式業務簽核）計畫
feature-id: N/A（非 F-numbered feature；資料庫平台全面遷移之收官驗證階段，非新業務功能）
source-stories: N/A（延續 AD-E07-38~42 之使用者拍板三項硬約束；P5 為 cutover 前最終驗證與簽核關卡）
epic: cross-cutting（跨全模組之資料庫平台遷移，非單一 E07 業務 epic）
module: Infrastructure — Database Platform Migration（PostgreSQL → MSSQL，Phase 5 of 6：全量 CI + 業務簽核，非大量新 code）
version: "1.1"
date: 2026-07-08
status: approved
author: system-architect
covers: []
depends-on: [AD-E07-38, AD-E07-39, AD-E07-40, AD-E07-41, AD-E07-42]
related: [F067, F101, F102, F104]
invariants:
  - I-MSSQL-CASE-01（繼承自 AD-E07-38）
  - I-MSSQL-COLLATE-01（繼承自 AD-E07-38）
  - I-MSSQL-BASELINE-PARITY-01（繼承自 AD-E07-38）
  - I-MSSQL-ENGINE-EQ-01（繼承自 AD-E07-42）
  - I-MSSQL-CI-BOOTSTRAP-01（新增）
  - I-MSSQL-SIGNOFF-GATE-01（新增）
  - I-ETL-ATOMIC-LOAD-01（新增，v1.1，ATOMIC 資料完整性風險修法目標原則）
---

> **🔴 v1.1 修訂通知（2026-07-08）**：P5b 端對端驗證真庫實測發現 **ATOMIC 資料完整性風險**（潛在封鎖級，兩引擎共通、非本次遷移引入之既有架構缺口）——`target-load-handler`（PG／MSSQL 皆然）之 fullMode/partition_replace 路徑，TRUNCATE/DELETE 先提交、後續單句 INSERT 若因髒資料失敗則不回滾，導致目標表/分區既存生產資料被清空且未重建。新增 **§7** 完整記錄發現、修法評估、範圍歸屬裁定；新增不變式 I-ETL-ATOMIC-LOAD-01；§4 需使用者裁示事項新增第 3 項。

# AD-E07-43：MSSQL 全面遷移 P5（全量 CI + F067 式業務簽核）計畫

## Agent Loading Guide

| Agent 角色 | 需載入章節 |
|-----------|-----------|
| Test Designer | §2（P5a/b 技術驗證定義）、§3（MONTHRUN-DIFF/F067 執行方式）、§6（不變式） |
| TDD Developer | §2（P5a CI bootstrap 修法、P5b 其餘 5 條 pipeline 驗證、P5f 部署 bootstrap）、**§7（ATOMIC 修法，待使用者裁示後啟動）** |
| DevOps / CI/CD | §2（CI 修法細節）、§5（子切片 DoD） |
| Product Analyst | §4（需使用者/業務裁示事項，彙整版）、§3（F067 簽核）、**§7（ATOMIC 風險，生產影響評估）** |

---

## 0. 背景與前置狀態

P1（driver/entity/schema）、P2（自建 T-SQL 佇列）、P4（ETL 引擎，含 customer_core 真實資料）、P3（Stage 1-4 raw SQL 引擎，3a 篩選/3b 計分/3c 比例/3d CR/3e `fn_calc_tier_level` 收尾）全數完成並已 push。**MSSQL 月跑全鏈（Stage 1 篩選→Stage 2~3 計分→Stage 3/4 比例→CR）現已全部有值**——這是本專案 MSSQL 遷移計畫的技術主體完工里程碑。

P5 是 cutover（Phase 6）前的最後一道關卡：**不是新業務邏輯開發，而是「證明 MSSQL 版本忠實重現 PG 版本」的全量驗證 + 業務簽核**。定位比照本專案既有之 F067（`docs/specs/implementation-log/F067-202606-cdmp-vs-legacy-diff.md`）模式，但**基準改為「MSSQL 重現 PG 結果」而非「重驗 legacy SP」**——legacy 對齊已在 PG 版本完成（F067 既有工作），P5 只需證明 MSSQL 與已驗證正確的 PG 版本逐列一致。

---

## 1. P5 範圍總覽與排序

```mermaid
graph LR
  P5a[P5a CI mssql-specs dbo bootstrap 修法] --> P5b[P5b 其餘 5 條 ETL pipeline MSSQL 驗證 ✅已完成/發現 ATOMIC]
  P5b --> P5c[P5c MONTHRUN-DIFF 真實跨引擎逐列比對]
  P5d[P5d datetime2 時區 production 查證] -.業務裁示.-> P5e
  P5c --> P5e[P5e F067 式業務簽核報告]
  P5f[P5f MSSQL 部署 bootstrap 對齊] -.可平行.-> P5e
  P5g[🆕 P5g ATOMIC 資料完整性修法 §7] -.不阻擋 P5a~f/P5c/P5e，待使用者裁示是否/何時排入.-> P5e
```

| 子切片 | 一句話定位 | 依賴 | 執行方式 |
|---|---|---|---|
| **P5a** | CI mssql-specs 缺 dbo baseline bootstrap，導致 P3a 等 52 個案例靜默 skip 而非真跑 | 無（可立即開始） | test-designer 定義驗收標準 → tdd-implementation 執行（CI 設定 + 一份測試檔調查） |
| **P5b** | customer_core 以外之其餘 5 條生產 pipeline，尚未證明能在 MSSQL 端到端跑通 | P5a（需 dbo 有完整 baseline 才能跑） | script/manual（比照 P4d `DISPATCHE2E-001` 手法重用） |
| **P5c** | 真實觸發一次完整月跑，PG vs MSSQL 逐列比對 score/tier/card/dept_id/emplid/assignday/cr | P5b（月跑需要 `ob_pool_data` 等來源表先有真實資料） | **manual/script**（比照 F101/F102/F104 前例，非新 CI 測試） |
| **P5d** | tedious datetime2 本機時區儲存，非午夜 `appl_date` 可能使「逾2年清空」邊界與 JS oracle 分歧 | 可與 P5b/P5c 平行進行資料查證 | **manual 查證 + 使用者/業務裁示**（見 §4） |
| **P5e** | F067 式業務簽核報告產出 + 簽核 | P5c 結果 + P5d 裁示 | architect 產出報告草稿 → **使用者/業務簽核**（見 §4） |
| **P5f**（可選、優先度較低） | MSSQL 版一鍵部署 bootstrap，比照 PG 版（`migration:run && seed && seed-datasource && data-seed`） | 無（可平行） | tdd-implementation（機械式腳本工作） |

**CI 4 job 全綠**（原待辦第 3 項）不列為獨立子切片，而是**貫穿全 P5 的持續性 DoD**：P5a 完成後應立即達成，其餘子切片進行中須保持不破。

---

## 2. 技術子切片細節

### 2.1 P5a — CI mssql-specs Dbo Bootstrap 修法（🔴 優先度最高，成本最低，槓桿最大）

**問題確認（已查證，非推測）**：
- `.github/workflows/ci.yml` 之 `mssql-specs` job 僅執行 `docker/mssql-init.sql`（建立 `CDMP_TEST` 資料庫 + `cdmp` 登入），**未執行 `migration:run`**，故 CI 環境的 `dbo` schema 是空的（僅有容器初始化腳本建立的資料庫本身，無任何業務表）。
- P3a impl log 已明確記錄此後果：本機測試環境「CDMP_TEST dbo 平時只有 9 張表（customer_core 在，Stage 1 六表缺）」，CI 實測「P3a mssql：11 綠 / 52 skip（dbo 缺 P3a 六表既有 bootstrap 基線，非本輪回歸）」——**CI 目前對 P3a 的 52 個案例回報「綠」，但實際上是被 GATE-002 靜默跳過，並未真正執行**。這是一個會讓 CI 綠燈產生假信心的缺口。
- P3b~P3d 已各自在 `beforeAll` 自建所需表（複用 `_p3b-mssql-ddl.ts` 零 drift DDL），故不受此問題影響；**僅 P3a 依賴外部預先存在的 baseline**。

**裁定：CI 層提供 dbo bootstrap step（非讓 P3a 回頭改自建）**。

理由：
1. **一次修復、全面受益**：在 CI `mssql-specs` job 的 `mssql-init` 之後、跑測試之前，新增一個 `migration:run` 步驟（沿用 `apps/api/scripts/typeorm.cjs` launcher，比照本機開發流程），一次性建出完整 37 表 + customer_core + `queue_job` 的 MSSQL baseline，**同時**解除 P3a 的 skip 問題**並額外驗證了 migration 檔案本身可正確執行**（P3a 若改自建，只是複製既有 DDL 片段，不驗證 migration 檔案本身的正確性——這是 CI bootstrap 方案獨有的額外價值）。
2. **與 P3b~P3d 既有設計相容、不浪費工作**：P3b~P3d 的 harness 已經是「`OBJECT_ID` 探測→表存在則沿用、不存在才自建」的雙模式（`existedBeforeSuite` / `selfBuiltTables`），CI 提供 baseline 後，這些 spec 會自然直接沿用 CI 建好的表，不會重複自建、不會有任何相容性問題。
3. **成本遠低於「P3a 改自建」**：CI 修法只是在既有 job 裡加一個步驟；P3a 若改自建，需要新增/擴充一份 6 張表的零 drift DDL 定義（雖然 `_p3b-mssql-ddl.ts` 已有前例可依循，但仍是實質改動測試檔案本體，且需重新驗證 P3a 全部 73 個 case ID）。

**🔴 已識別之排序風險（需 P5a 一併解決，非事後才發現的新問題）**：P3a impl log 提及「本檔與 p1b2/p4 共用 dbo，須以單檔（或 `--no-file-parallelism`）執行，避免 p1b2 wipe dbo 造成干擾」——意即**存在某個 P1b2 測試會清空/重建 `dbo` schema**（用於驗證 dev synchronize vs prod baseline migration 的結構等價，即 AD-E07-39 I-MSSQL-BASELINE-PARITY-01 之驗收工具）。若 CI 在跑完 `migration:run` bootstrap 後，`--no-file-parallelism` 的執行序列中，這個 P1b2 「wipe dbo」測試恰好排在 P3a（或其他依賴 baseline 表持續存在的 spec）之前執行，會讓 P3a 重新落回「表不存在」的處境。

**P5a 具體工作項**：
1. CI `mssql-specs` job 新增 `migration:run` bootstrap 步驟（`mssql-init.sql` 之後、`vitest run` 之前）。
2. **調查該 P1b2 wipe-dbo 測試**（需 tdd-implementation 先讀該測試檔確認其具體行為），依情況擇一修法：
   - (a) 該測試若本來就會在自己的 `afterAll` 內重建/還原 baseline，則只需確認 CI 檔案執行序不會讓其他 spec 誤讀到「重建過程中途」的殘缺狀態；
   - (b) 若該測試會把 `dbo` wipe 後不還原（純粹為了驗證 synchronize 本身、驗證完即結束），則需讓它改在**獨立、隔離**的資料庫/schema 範圍操作（不動共用 `dbo`），或於自身 `afterAll` 補一道 `migration:run` 還原；
   - (c) 若上述皆不易，最後手段是透過檔名/glob 順序控制，確保 wipe-dbo 測試排在 vitest 執行序列最後——**此為最脆弱的方案，僅在 (a)(b) 皆不可行時採用**。
3. CI 修法後，重跑 `mssql-specs` job，確認 P3a 之 52 個原 skip 案例**轉為真正 PASS**（非 skip），且 P1b/P2/P4 既有 `.mssql.spec.ts` 全數不受影響。

**新不變式**（見 §6）：**I-MSSQL-CI-BOOTSTRAP-01**。

### 2.2 P5b — 其餘 5 條生產 ETL Pipeline 之 MSSQL 驗證

**背景確認**：P4 的完整端對端驗證（P4d）範圍**僅限「ETL for Customer Core」一條 pipeline**（P4d impl log 明載「不含...其他 5 條 pipeline」）。P4a~P4c 交付的是**通用的 9 個 handler MSSQL 化**（`extract`/`lookup`/`merge`/`dedup`/`derived_field`/`type_cast`/`field_mapping`/`conditional`/`target_load` 全部 handler 皆已 MSSQL 化，非 customer_core 專屬邏輯），故其餘 5 條生產 pipeline（`E07-OBPOOLDATA-Load`／`E07-OBPOOLDATA_LIST-Load`／`E07-OBEMPHIRE-Load`／`E07-OBCALENDAR-Load`／`E07-OBARRETURNDF_MIN_CAP-Load`）**理論上**可直接沿用同一批已 MSSQL 化的 handler 執行，但**尚未被端對端證明過**。

**這是 P5c（MONTHRUN-DIFF）的前置依賴**：P3 的 Stage 1-4 raw SQL 引擎讀取的 `ob_pool_data`／`ob_pool_data_list`／`ob_emphire`／`ob_calendar`／`ob_arreturndf_min_cap` 五張表，若無真實資料，月跑比對就無從進行。

**工作方式**：比照 P4d 之 `DISPATCHE2E-001`（直接呼叫真實生產碼 `createDispatcher()` 取得 dispatcher、以真實 `PipelineRunner.run()` 跑真實 DAG）手法，逐一觸發此 5 條 pipeline 於 `DB_TYPE=mssql`，驗收：① 全部節點 `status==='completed'`（無 `failed`）；② 目標表列數與來源列數合理對應（比照 P4d 之「交叉查實表列數，非僅信 `nodeLogs.outputRowCount`」原則，防 `isTestRun` 假路徑陷阱）；③ 抽樣核對代表性列之內容正確性。**非新增完整測試套件**（9 個 handler 本身已於 P4a~c 個別驗證過），此處僅是**端對端接線驗證**，工作量遠小於 P4 原本的量級。

### 2.3 P5f — MSSQL 部署 Bootstrap 對齊（可選、優先度較低）

比照現行 PG 版一鍵部署（`npm run bootstrap` = `migration:run && seed && seed-datasource && data-seed`，見專案既有部署文件），確認/建立 MSSQL 版對等流程：`migration:run`（MSSQL baseline，含 `queue_job`／`customer_core`）→ `seed`（帳號）→ `seed-datasource`（9 個 datasource 空殼）→ `data-seed`（計分卡/pipeline/擷取任務參考資料）。**此為機械式腳本工作**（沿用既有 PG 版腳本邏輯、替換底層 DB 呼叫），非阻擋性——可平行於 P5a~e 進行，但**必須在真正 cutover（Phase 6）前完成**，否則 MSSQL 環境無法從零建置。

---

## 3. MONTHRUN-DIFF 與 F067 式業務簽核執行方式

### 3.1 MONTHRUN-DIFF（P5c）：技術底稿，Manual/Script 執行

**不是新的自動化 CI 測試套件**，而是比照本專案既有的 F101/F102/F104 驗收前例（觸發真實月跑、SQL 直接查表比對、輸出人工可讀的差異記錄）：

1. 前置：P5a（CI/dbo baseline）+ P5b（其餘 5 條 pipeline 資料就緒）完成，MSSQL 端 `ob_pool_data`/`ob_pool_data_list`/`ob_emphire`/`ob_calendar`/`ob_arreturndf_min_cap`/`customer_core` 六張核心來源表皆有真實資料。
2. 於**同一批來源資料**（理想上是同一個 `project_workym`，如既有基準月 202606）分別觸發 PG 版與 MSSQL 版完整月跑 pipeline（Stage 1 篩選 → Stage 2~3 計分 → Stage 3/4 比例分派 → CR 優先分派）。
3. 逐列比對兩次 run 之 `ob_monthly_run_result`：`score`／`tier_level`／`card_level`／`dept_id`／`emplid`／`emplid_deptid`／`assignday`／`cr_id`／`cr_nm`／`is_cr`。
4. 輸出比對結果為一份 impl-log 風格文件（比照 P4d／F067 之表格化呈現：逐欄一致率、任何差異列之具體案件與差異值、已知邊界案例〔如 P3d 的 tie-breaker／datetime2 案例〕之個別核對結果）。

**此文件即是 F067 式簽核報告的技術附件（非報告本體）。**

### 3.2 F067 式業務簽核（P5e）

**基準修正（承 §0）**：F067 原本的基準是「CDMP vs legacy SP」；**P5e 的基準是「MSSQL vs PG」**——因為 legacy 對齊已在 PG 版本的既有 F067 完成且業務已簽核過，P3/P4 的全部設計目標就是「MSSQL 忠實重現 PG」，故此處不需要（也不應該）重新去比對 legacy，只需要證明「MSSQL 版本的月跑結果與已核可的 PG 版本結果一致」。

**報告內容建議結構**（比照既有 F067 格式延伸）：
1. 執行摘要：MSSQL 全鏈技術驗收已完成（P1-P4）、本報告為 cutover 前最終業務對齊確認。
2. MONTHRUN-DIFF 結果摘要（§3.1 產出）：逐欄一致率、已知可解釋的低機率邊界差異（tie-breaker、datetime2 非午夜時間分量，若有實際觸發）。
3. P5d 之 datetime2 時區查證結果與裁示（見 §4）。
4. 待簽核事項清單 + 簽核欄位。

**產出方**：architect 起草報告（整合 P5c 技術結果 + P5d 業務裁示），**簽核方**：使用者/業務利害關係人（比照本專案歷次 F067/F101/F102/F104 之既有簽核慣例）。

---

## 4. 需使用者/業務裁示事項（彙整，供你帶回使用者）

| # | 事項 | 為何非 architect 可獨立裁定 | 建議行動 |
|---|---|---|---|
| 1 | **datetime2 時區查證（P5d）**：production `ob_pool_data_list.appl_date`（及其他餵入日期邊界判斷之來源欄位）是否帶有非午夜時間分量？MSSQL cutover 後之伺服器/連線時區組態如何設定？ | 需要實際查詢 production 資料庫內容（architect 唯讀評估權限下無法直接存取生產環境資料，且時區組態屬維運/基礎設施決策範疇），且若查證結果為「確有非午夜時間分量」，「逾 2 年清空」邊界的 JS oracle vs MSSQL 分歧影響範圍需業務判斷是否可接受 | 請業務/維運協助查詢一筆或多筆真實 `appl_date` 樣本；若確認皆為午夜（如整批匯入時統一補值），此項可直接結案；若否，需評估分歧筆數規模，決定是否需要調整判定邏輯或接受此已知落差 |
| 2 | **F067 式業務簽核（P5e）**：MSSQL vs PG 月跑結果比對報告之最終簽核 | 比照本專案一貫做法（F067/F101/F102/F104 皆由業務簽核，非 architect 自行認定「夠好了」） | P5c 完成後由 architect 產出報告草稿，交付簽核 |
| 3 | **🔴🔴 ATOMIC 資料完整性風險修法（見 §7）**：ETL fullMode/partition_replace 之「TRUNCATE/DELETE 先提交、INSERT 失敗不回滾」導致生產資料清空風險，是否核准修法（推薦：交易包裝）、排入時程（新增 P5g，或提升為獨立 hardening 任務）、修法期間之風險承受度 | 這是**現行 PostgreSQL 生產系統今天就存在的行為改變提案**（失敗語意由「靜默清空」改為「安全失敗、舊資料保留」），影響範圍不限於 MSSQL 遷移本身；是否/何時修、修法期間能否接受現狀風險，屬業務層級之風險接受度判斷，非純技術決策 | 見 §7.4 精簡摘要（可直接帶回使用者） |

**架構師判斷：其餘 P5 子切片（P5a/P5b/P5f）皆為純技術執行，不需要使用者裁示，可直接推進。**

---

## 5. 子切片 DoD

### P5a DoD
1. CI `mssql-specs` job 新增 `migration:run` 步驟，成功建出完整 MSSQL baseline（37 表 + `queue_job` + `customer_core`）。
2. 已識別之 P1b2 wipe-dbo 測試風險經調查後採取對應修法（§2.1 三選項之一），並附驗證：CI 全套 `*.mssql.spec.ts` 依序執行不因此測試而使後續 spec 的 baseline 表消失。
3. 重跑 CI，`stage1-sql-pushdown.mssql.spec.ts` 之 52 個原 skip 案例轉為 PASS（非 skip）。
4. P1/P2/P4 既有 `.mssql.spec.ts` 套件全數不受影響（零回歸）。

### P5b DoD
1. 5 條 pipeline 於 `DB_TYPE=mssql` 觸發，全部節點 `status==='completed'`。
2. 目標表（`ob_pool_data`/`ob_pool_data_list`/`ob_emphire`/`ob_calendar`/`ob_arreturndf_min_cap`）以直接 `SELECT COUNT(*)` 交叉驗證列數合理（非僅信 `nodeLogs`）。
3. 抽樣列內容正確性核對（比照 P4d LOOKUPHIT/CHARSET 精神，非窮舉）。

### P5c DoD
1. PG 與 MSSQL 於同一來源資料完整月跑各執行一次。
2. `ob_monthly_run_result` 全部案件之 9 個關鍵欄位（score/tier/card/dept_id/emplid/emplid_deptid/assignday/cr_id/is_cr）逐列比對完成。
3. 產出比對結果文件（impl-log 風格），任何差異皆有具體案件級記錄與可解釋性判斷。

### P5d DoD
1. 至少一筆 production（或 production-like）`appl_date` 樣本之時間分量查證結果記錄。
2. 使用者/業務對「是否接受此差異／時區組態如何設定」給出裁示。

### P5e DoD
1. F067 式簽核報告產出（含 §3.2 結構）。
2. 業務簽核完成（或明確記錄尚待簽核，作為 cutover 前置阻擋項）。

### P5f DoD（可選）
1. MSSQL 版 `npm run bootstrap` 等價流程可對全新 MSSQL 資料庫成功建置（含業務資料表空、參考資料齊全）。

### 是否需要 spec-writer（RESOLVED：不需要）

理由與 P1~P4 一致——P5 全範圍皆為「證明既有已核可行為在 MSSQL 上忠實重現」的驗證工作，沒有任何新業務規則、新使用者可見行為。P5c/P5e 雖然涉及業務簽核，但簽核的對象是「既有行為的跨引擎一致性」，不是「新功能的驗收標準」，性質上仍是驗證而非規格定義。P5 比照既有模式，直接 system-architect → test-designer/manual script → tdd-implementation（P5a/P5b/P5f）；P5c/P5d/P5e 為 manual/業務流程，不需要 test-designer/tdd-implementation 參與。

---

## 6. 不變式（沿用與新增）

| ID | 來源 | 說明 |
|---|---|---|
| **I-MSSQL-CASE-01** | AD-E07-38 | 使用者物件一律小寫 |
| **I-MSSQL-COLLATE-01** | AD-E07-38 | Collation 於資料庫層級設定 |
| **I-MSSQL-BASELINE-PARITY-01** | AD-E07-38 | Dev/prod 建表路徑結構等價；P5a 修法後之 CI bootstrap 亦須維持與此不變式一致（CI 用之 `migration:run` 即該不變式驗收工具鏈的 CI 化落地） |
| **I-MSSQL-ENGINE-EQ-01** | AD-E07-42 | 每個 raw SQL 下推函式須有對應等價測試；P5c MONTHRUN-DIFF 是此不變式在**完整月跑層級**（而非單一函式層級）的最終驗收 |
| **I-MSSQL-CI-BOOTSTRAP-01**（新增） | 本 AD | CI `mssql-specs` lane 執行任何 `*.mssql.spec.ts` 前，必須先完成完整 MSSQL baseline（`migration:run`）；任何會清空/重建共用 `dbo` schema 之測試，必須確保不使同一 CI 執行序中其他 spec 所依賴之 baseline 表消失（自身還原、隔離範圍、或明確排序控制三擇一），不得以「反正 CI 會重跑」為由放任此類副作用 |
| **I-MSSQL-SIGNOFF-GATE-01**（新增） | 本 AD | Phase 6（cutover）不得在以下兩條件皆滿足前啟動：(a) MONTHRUN-DIFF（P5c）對至少一個完整生產規模月跑顯示 PG/MSSQL 結果一致（差異皆為已記錄、可解釋之邊界案例，非未解釋之不一致）；(b) F067 式業務簽核（P5e）已由使用者/業務利害關係人明確完成，非僅由 architect 或工程團隊自行認定「已足夠好」 |
| **I-ETL-ATOMIC-LOAD-01**（新增，v1.1） | 本 AD §7 | `target_load` 節點之 fullMode（TRUNCATE+INSERT）與 partition_replace（DELETE+INSERT）路徑，破壞性陳述式（TRUNCATE/DELETE）與其後之 INSERT 必須同屬一個交易；INSERT 失敗時必須完整回滾至破壞性陳述式執行前之狀態（既存資料不得遺失）。此為 PG／MSSQL 兩引擎共通適用之原則，修法須兩引擎對稱落地，不得僅修其一 |

---

## 7. 🔴🔴 ATOMIC 資料完整性風險（P5b 發現，需使用者裁示）

### 7.1 現象（真庫實測佐證，4 種目標表形狀一致）

P5b 端對端驗證（真實 MSSQL、`p5b-e2e.mssql.spec.ts` ATOMIC 群組，5 個 probe 全 PASS）確認：`pipeline-runner.ts` 全程無 `startTransaction`/`commitTransaction`/`rollbackTransaction`（TypeORM `QueryRunner` autocommit 模式）。`target-load-handler`（**PG／MSSQL 兩版逐行結構對稱**，非本次遷移引入）之兩條寫入路徑：

- **fullMode**：`TRUNCATE TABLE target` → 單句 `INSERT INTO target SELECT ...`（非逐列容錯，整句成敗）。
- **partition_replace**：`DELETE FROM target WHERE data_source=X` → 單句 `INSERT`（同上）。

TRUNCATE/DELETE 為獨立陳述式、**先提交**；後續 INSERT 若因 NOT NULL 違反、隱式轉換數值溢位、或撞 PK 而整句失敗，**不會回滾已提交之 TRUNCATE/DELETE**。目標表（或目標分區）因而被留在「已清空、未重新填入」狀態。真庫實測 4 種目標表形狀（單欄 PK／composite PK／數值型別溢位／partition_replace）**結論一致：資料遺失**（詳見 `AD-E07-43-P5b-impl.md` ATOMIC-001~004）。這 5 條生產 pipeline 目前皆無 `type_cast` 節點作為壞值防線。

**生產影響**：月度 ETL 若遇單筆髒來源資料（本專案已多次記錄之髒值前例：`cus_sex` 含 `'C'/'D'/'8'/'9'`、`MONTH_INCOME` 型別問題等），可能使**整張 `ob_pool_data`（7.8M 列）或整個分區被清空**，下游 Stage 1-4 月跑讀到空表。

### 7.2 修法評估（三候選 a/b/c）

| 選項 | 做法 | 正確性 | 效能（7.8M 列 fullMode） | 雙引擎落地成本 | 與既有串流/COPY/bulk 架構相容性 |
|---|---|---|---|---|---|
| **(a) 交易包裝** | `startTransaction` → TRUNCATE/DELETE+INSERT → `commit`；失敗 `rollback` | 直接解決（INSERT 失敗即完整回滾，舊資料保留） | 低額外成本——INSERT 本身已是單句大陳述式，包一層外層交易不改變其寫入量體，只是不讓 TRUNCATE 單獨先提交 | **低**：兩版 `target-load-handler` 結構對稱，改法幾乎逐行對應可同步套用 | **相容**：不改變「單句大陳述式」的既有設計哲學，橘正交於現行串流/bulk 機制 |
| **(b) Swap 全量** | 建新表/暫存表，驗證後原子 rename/切換 | 解決本問題，額外好處：讀者於載入期間完全看不到中間態 | 額外儲存/步驟成本（載入期間雙份資料），對 7.8M 列表是實質額外成本 | **高**：需新設計命名慣例、rename/切換機制、失敗清理孤兒暫存表之邏輯（比照 P4 曾評估但未採用之「具名 staging 表」方案同等級複雜度） | 部分相容，但增加架構複雜度 |
| **(c) 前置驗證** | INSERT 前逐欄 `TRY_CAST`/NOT-NULL 檢查，壞列導向 skip 而非整批失敗 | 解決「單筆髒資料拖垮全表」的**可用性**問題（(a) 單獨無法解決：若來源恆有髒列，(a) 會讓該表載入從此恆定失敗、停留在舊資料，非資料遺失但仍是可用性問題） | 需為每個目標表/每個欄位設計型別驗證邏輯，範圍與複雜度隨目標表數量增加 | **中高**：需逐表逐欄盤點型別與約束，非機械式改法 | 相容，且與既有 `type_cast` handler 的設計哲學一致（本專案已有前例） |

**架構師分析（(a) 讀者中間態可見性補充說明）**：選項 (b) 常被認為的「載入期間不可見空狀態」優勢，其實 (a) 在標準 Read Committed 隔離等級下**同樣具備**——只要 TRUNCATE/DELETE 與 INSERT 同屬一個未提交的交易，其他 session 在交易提交前讀到的仍是**交易開始前的舊資料**（PG／MSSQL 預設隔離等級皆如此），並非「看到空表」。此點大幅拉近 (a) 與 (b) 的效益差距，而 (a) 的實作成本遠低於 (b)。

### 7.3 架構師推薦

**推薦：(a) 交易包裝為必要之立即修法；(c) 前置驗證為緊接之後的獨立 hardening 任務（非阻擋、但基於本專案自身髒值歷史強烈建議儘快排入）；(b) Swap 全量記錄為已評估但不建議之選項，備查不實作。**

**理由**：
1. **(a) 直接消除「資料遺失」這個最嚴重的失敗模式**，成本最低、雙引擎可對稱落地、與既有單句大陳述式架構完全相容，應優先且立即處理。
2. **(a) 單獨不足以解決可用性問題**：若某來源表長期含至少一筆髒資料（本專案歷史顯示這是常態而非例外），(a) 會讓該表的月度載入從「偶爾清空」變成「每次都失敗、資料停留在上一次成功狀態」——這是更安全但仍不理想的結果，故建議**緊接著**推動 (c)，讓髒列被單獨排除、乾淨列正常入庫，而非整批卡住。
3. **(b) 不推薦**：(a) 已透過交易隔離取得 (b) 的主要效益（中間態不可見），(b) 的額外儲存/切換成本對 7.8M 列規模是實質負擔，且複雜度顯著提高（比照 P4 evaluating `##global temp` vs 具名 staging 表時，同等複雜度的方案在成本效益分析下皆未被優先採用）。

### 7.4 範圍歸屬裁定

**歸屬：獨立於 P5 核心範圍之新增子切片（暫名 P5g），不算入原 P5a~f 之既有工作量估算，且明確不阻擋 P5a~f／P5c MONTHRUN-DIFF／P5e F067 簽核之既定推進。**

理由：
- 此問題**兩引擎共通**（PG 現行生產系統今天就存在同樣風險），不是「MSSQL 是否忠實重現 PG」這個 P5 核心命題的一部分——即使不修，MSSQL 目前也已**忠實對稱地重現了 PG 的既有行為**（含其缺陷），P5c 之 MONTHRUN-DIFF／P5e 之 F067 簽核，技術上不需要等這個修法完成才能進行。
- 但此問題**是否應該儘快修、要不要在 cutover 前一併處理**，屬於業務風險接受度判斷（見 §7.5），故列為 P5 的一個新增子切片以確保追蹤，但不視為既有 P5a~f 排序鏈的阻擋依賴。
- **不建議升級為與 MSSQL 遷移脫鉤的完全獨立專案**：雖然 PG 現行也受影響，但此問題是**藉由本次遷移的嚴謹端對端測試方法論才被真正驗證出來**（P5b 是全系列第一次以真實 fullMode/partition_replace pipeline 端對端主動觸發並觀察此風險路徑），且修法（尤其選項 a）在本次遷移已建立的「PG 檔/MSSQL 檔平行維護」框架下可以低成本地同步在兩版落地，脫鉤處理反而喪失這個框架優勢。

### 7.5 精簡摘要（可直接帶回使用者）

> **風險**：ETL 全量/分區替換載入（`ob_pool_data`、`ob_calendar` 等 5 張核心來源表皆適用）目前若遇到**單筆**髒來源資料，會先清空目標表/分區、寫入才失敗，且**不會復原**——已清空的生產資料就此遺失，直到下次成功載入為止。這是 PostgreSQL 現行生產系統與 MSSQL 版本**共通**存在的既有架構缺口（非本次遷移新增），本次因採用嚴謹端對端測試才被真實驗證揭露。
>
> **推薦修法**：為載入陳述式加上交易保護（清空與寫入同屬一個交易，寫入失敗則整個復原、舊資料保留），PG／MSSQL 兩版可用同一套改法對稱落地，成本低、不影響現有效能設計。緊接著建議追加「載入前先過濾壞值」的強化（避免單筆壞資料讓整表載入從此卡住不動），但此為次要、可稍晚排程之工作。**不建議**採用「建新表後切換」的更複雜方案，因主要效益已可由交易保護取得。
>
> **成本**：核心修法（交易保護）預估 3–5 人天（兩引擎對稱、範圍明確）；後續強化（前置驗證）另估，非本次必要。
>
> **是否阻擋目前進度**：不阻擋。P5 既定的 CI/驗證/簽核工作可依原計畫推進；此修法建議另立子切片（P5g）追蹤，但何時排入、是否要在正式切換 MSSQL 前完成，請裁示。
