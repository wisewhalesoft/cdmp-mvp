---
spec-id: F099
title: Stage 1 SQL 下推（set-based INSERT…SELECT + estimate≡run 共用 buildStage1Sql）
feature-id: F099
source-story: AD 驅動（AD-E07-28 P2）
epic: E07
module: M04 分派執行（月名單分派執行模型重構 P2）
priority: P0-MVP
version: "1.0"
date: 2026-06-02
status: Draft
---

# F099: Stage 1 SQL 下推（AD-E07-28 P2）

Priority: P0-MVP | Status: Draft | Last Updated: 2026-06-02

> ⚠️ **PRODUCTION 結果等價警告（必讀）**：本 feature 將 Stage 1 由「全載 `ob_pool_data` 進 heap + 應用層 filter」改寫為 set-based SQL `INSERT INTO ob_monthly_run_result SELECT … FROM ob_pool_data WHERE …`。此為「**改機制、結果須可證等價**」之變更：SQL 版上線前，必須對代表性名單（含觸發各特例規則者）通過 **PG 真庫 JS↔SQL 逐 list 結果等價測試**（§4 AC-7，P2 Definition of Done）。下推解決 [AD-E07-28 §1](../implementation-log/AD-E07-v3.1-monthly-run-execution-model.md) 之 **F2（OOM）於 Stage 1 範圍**；Stage 2~4 仍 JS（讀 Stage 1 已寫入 `ob_monthly_run_result` 的列回 heap 計分），全範圍下推見 [F100](F100-stage2-4-sql-pushdown-scoring.md)（P3）。
>
> **v1.0（2026-06-02 / AD-E07-28 P2）**：依 [AD-E07-28 §5 P2 / §6](../implementation-log/AD-E07-v3.1-monthly-run-execution-model.md) 與 [architecture-spec.md §5.13.4 / §5.13.5](../architecture-spec.md) 落地。核心：設計 `buildStage1Sql(list, workdt)` 純函式（回傳 WHERE 子句 + params + FROM/JOIN 片段），run（`INSERT…SELECT`）與 estimate（`SELECT COUNT(*)`）共用同一份輸出（**I-RUN-EST-01**，F049 老坑不可再 fork）。portability：**四特例規則（fraud / motorcycle / xiaozi / year-above）全 SQL 下推（選項 A，OQ-AD28-03 已由使用者 2026-06-02 裁定）**，無任何應用層 filter；等價測試一律走 **PG 真庫**（CI 必起 Postgres）。
>
> **刻意未動（邊界）**：不變更 `architecture-spec.md` / AD 文件；不撰寫 production / test 程式碼；不跑 migration；trigger 判斷（`matchesSpecialRule`）仍 JS 純函式，不 SQL 化（[AD-E07-28 §13](../implementation-log/AD-E07-v3.1-monthly-run-execution-model.md)，SQL 只接收「此 list 觸發哪些規則」的布林結果決定是否加對應 `WHERE NOT (...)`）。

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + [AD-E07-28 §5 P2 / §6.1 / §6.3](../implementation-log/AD-E07-v3.1-monthly-run-execution-model.md)（**權威**）+ `apps/api/src/modules/assignment/stage1/stage1-filter-chain.ts`（`executeStage1Chain` / 去重視窗 / 特例 DELETE）+ `stage1-query-composer.ts`（`buildStage1WhereConditions` / `buildMonthCntFragment`）+ `special-rules.ts`（`matchesSpecialRule`）+ [F091 v2.0](F091-stage1-complete-month-cnt-dedup-special-delete.md)（Stage 1 步驟 ground truth）+ [F094](F094-monthly-run-result-table.md)（寫入目標欄位） |
| Test Designer | 本文件 §4 AC（**特別 AC-1 I-RUN-EST-01 / AC-7 JS↔SQL 等價門檻 / AC-8 portability**）+ §10 測試覆蓋點名 + [AD-E07-28 §6.2 測試移轉表](../implementation-log/AD-E07-v3.1-monthly-run-execution-model.md) |
| Architect | 本文件 + [AD-E07-28 §6](../implementation-log/AD-E07-v3.1-monthly-run-execution-model.md) |
| 圖表 | [diagrams/F099-stage1-sql-pushdown-flow.mmd](../diagrams/F099-stage1-sql-pushdown-flow.mmd) |

---

## 1. 功能摘要

將 `executeStage1Chain` 的「全載 `ob_pool_data`（`getMany()`）+ 應用層 filter + 全載近 3 月 DISTINCT custo_no Set」改寫為單一 set-based SQL。設計 `buildStage1Sql(list, workdt)` 純函式為唯一 WHERE/JOIN core 來源，run 與 estimate 共用：

| 路徑 | 外層包裝 | 共用核心 |
|------|---------|---------|
| **run**（dryRun:false） | `INSERT INTO ob_monthly_run_result (run_id, list_no, orgno, appl_no, custo_no, settle_src, created_at, updated_at) SELECT :runId, :listNo, o.orgno, o.appl_no, o.custo_no, o.settle_src, NOW(), NOW() FROM ob_pool_data o WHERE <core>` | `buildStage1Sql` 回傳之 `<core>` |
| **estimate**（dryRun:true） | `SELECT COUNT(*) FROM ob_pool_data o WHERE <core>` | 同一份 `<core>` |

> **[ASSUMPTION] A-0**：上述 `INSERT` 欄位清單為 P2 範圍（Stage 1 寫入案件識別 + custo_no/settle_src）；Stage 2~4 之計分 / CR / 分派欄位（score / card_level / tier_level / is_cr / dept_id / emplid 等）於 P2 維持 JS 寫入（讀回 heap 計分後 `UPDATE`）或 NULL，P3 才下推。實際 `INSERT` 欄位由 tdd-implementation 對齊 [F094 entity](F094-monthly-run-result-table.md) 與既有 pipeline 寫入。
>
> **[RESOLVED] OQ-F099-03（assignday 不下推，保持 NULL）**：下推 SELECT **不取 `assignday`**——`ob_pool_data` **無 `assignday` 欄**（該欄在 `ob_pool_data_list`），且現行 JS pipeline（`assignment-run-pipeline.service.ts`）**從不寫 assignday**（月名單分派結果該欄一直為 NULL）。`ob_monthly_run_result.assignday` entity 註解標明為「Forward-compat 業務派案日期（DP-AD25-6）」，**由業務系統日後回填**。故 P2 下推 INSERT 欄位清單**不含 assignday**（該欄寫 NULL），與現行 JS 等價。**不可**寫 `o.assignday`（會因 `ob_pool_data` 無此欄而 SQL error）。

## 2. 使用者故事

**As a** 分派維運人員 / 系統架構維運人員
**I want** Stage 1 案件挑選在 Postgres 內以單一 SQL 完成、不把整個 `ob_pool_data` 載入 worker heap，且試算（estimate）與月名單分派（run）保證跑同一份篩選邏輯
**So that** prod 量級不再因全載而 OOM，且試算數字與月名單分派實際分派數一致（消除 F049 estimate≡run drift）

## 3. 前置條件

- [F098](F098-monthly-run-worker-extraction.md)（P1）已交付：月名單分派於 cdmp-worker 容器執行（下推 SQL 期間若有 bug 不影響 API）。
- [F094](F094-monthly-run-result-table.md)：`ob_monthly_run_result` 表存在（下推目標）。
- [F091 v2.0](F091-stage1-complete-month-cnt-dedup-special-delete.md)：Stage 1 完整步驟（欄位篩選 / month_cnt / 詐騙白牌 / 近 3 月去重 / 特例 DELETE）之 SP-ground-truth 語意為等價基準。
- 既有 SQL fragment：`buildStage1WhereConditions`（欄位篩選，已是 SQL）、`buildMonthCntFragment`（month_cnt，已是 SQL）。
- m297 索引 `ob_pool_data_list(assignday, custo_no)`、m298 partial index 等既有去重 / preview 加速索引。

## 4. 驗收標準

### AC-1：`buildStage1Sql` 單一 core，run 與 estimate 共用（I-RUN-EST-01）

- **Given** 一份名單 `list` 與 `workdt = parseWorkdt(project_workym)`
- **When** 月名單分派（run）與 Stage 0 試算（estimate）分別執行
- **Then** 兩者之 `WHERE / JOIN / FROM` 子句**必須來自同一函式 `buildStage1Sql(list, workdt)` 之輸出**，分叉點僅限最外層 `INSERT…SELECT`（run）vs `SELECT COUNT(*)`（estimate）
- **And** 不得為 run / estimate 各寫一份 WHERE（這正是 [F049](F049-stage0-daily-estimate.md) 原 bug 根因）

> **不變式 I-RUN-EST-01**：run 與 estimate 的 SQL core 來自同一函式輸出。**驗收門檻**：test-designer 須有一條測試直接斷言兩路徑產出的 SQL core 字串相等（或以同一 list 跑 run 後的 `ob_monthly_run_result` 列數 === 同一 list 之 estimate COUNT）。

### AC-2：欄位篩選 + month_cnt 沿用既有 SQL fragment

- **Given** `buildStage1Sql`
- **When** 組合 `<core>`
- **Then** ① 欄位篩選沿用 `buildStage1WhereConditions`（whitelist-driven，path A/B 不變）；② month_cnt 期別過濾沿用 `buildMonthCntFragment`
- **And** 不重新實作這兩段（避免與 F050/F075/F091 既有語意 drift）

### AC-3：撈 pool 改 CTE / 子查詢，不再 `getMany()` 全載

- **Given** Stage 1 執行
- **When** 取得符合條件之案件集
- **Then** 以 SQL（`INSERT…SELECT` 之 `FROM ob_pool_data o WHERE <core>`）在 DB 內完成，**不**呼叫 `qb.getMany()` 全載進 heap

> **不變式 I-NOLOAD-01**：Stage 1 SQL 下推路徑不得對 `ob_pool_data` 全表 / 全結果集執行 `find()` / `getMany()` 載入 heap（[記憶 feedback：bare `find()` 此類大表必爆]）。**無任何例外**——四特例規則全 SQL 下推（含 year-above，選項 A），Stage 1 全程不載 heap。

### AC-4：詐騙白牌 DELETE 改 SQL `WHERE NOT (...)`

- **Given** 詐騙白牌規則（SP L66~L68，無條件套用）
- **When** 組 `<core>`
- **Then** 以 `WHERE NOT (list_type='01' AND spec_name LIKE '%白牌%')`（可移植）下推
- **And** 結果與 JS 版等價（AC-7 驗證）

### AC-5：近 3 月去重改 anti-join（不載 Set 進 heap）

- **Given** 近 3 月去重（去重視窗 `[workdt − 3 月, workdt − 1 日]`，上界 `MIN(MAX(ob_pool_data_list.assignday), workdt−1日)`，[F091 v2.0](F091-stage1-complete-month-cnt-dedup-special-delete.md) / [AD-E07-27](../architecture-spec.md)）
- **When** 組 `<core>`
- **Then** 以 `WHERE custo_no NOT IN (SELECT DISTINCT custo_no FROM ob_pool_data_list WHERE assignday BETWEEN …)` 或 `NOT EXISTS` / anti-join 下推（DB 內完成，不全載 DISTINCT custo_no Set 進 heap）
- **And** 去重視窗 / 上界語意**不變**（[AD-E07-27](../implementation-log/AD-E07-v3.1-monthly-run-execution-model.md)：僅計算位置由 JS 移入 SQL，`computeDedupWindow` 語意不改）
- **And** NULL custo_no 邊界處理須與 JS 版等價（`NOT IN` 含 NULL 子查詢之陷阱須驗證，見 AC-7）

> **[ASSUMPTION] A-1**：`NOT IN` 對含 NULL 之子查詢在 SQL 有「全部不 match」陷阱；tdd-implementation 應優先採 `NOT EXISTS` / anti-join 避免之，並由 AC-7 等價測試守住 NULL 邊界。

### AC-6：機車期中 / 期中小資特例 DELETE 改 SQL `WHERE NOT (...)`

- **Given** 特例規則中可移植者：機車期中（AC-4 of F091）、期中小資（AC-5 of F091）
- **When** 該 list 經 `matchesSpecialRule`（仍 JS）判定觸發
- **Then** 對應加 `WHERE NOT (...)` 子句下推；數值比較用 PG `CAST(... AS numeric)`，僅 PG integration test 驗證（I-PORT-01）
- **And** trigger 判斷（`matchesSpecialRule`）仍 JS，SQL 只接收布林結果決定是否加子句（不 SQL 化 trigger）

### AC-7：JS↔SQL 逐 list 結果等價測試（P2 Definition of Done）

- **Given** 一組代表性名單（含觸發各特例規則者 + 去重邊界 + NULL custo_no 樣本）
- **When** 對同一輸入名單分別跑舊 JS pipeline 與新 SQL 下推
- **Then** 兩者產出的 `ob_monthly_run_result` 列集合（PK `(run_id, list_no, orgno, appl_no)` 集合）**必須一致**
- **And** 此等價比對於 **PG 真庫**執行（不靠 SQLite），為 SQL 版上線之**驗收門檻**
- **And** 舊 `RGv2-005`（grep-原始碼 pin JS `includes('小資')`/`includes('白牌')`）與整套 `SDv2-*` JS-pin guard **作廢移除**；其保護目標改由本等價測試 + `special-rules.ts` 既有單元測試（trigger 仍 JS）守住

> **驗收門檻（P2 DoD）**：JS↔SQL 等價測試為 P2 上線的硬性 Definition of Done。**測試案例細節（代表性名單清單、各特例觸發樣本、邊界資料）由 test-designer 設計**；本 spec 只定義門檻與覆蓋要求：(a) 每條特例規則至少一個觸發樣本；(b) 去重視窗上下界邊界各一樣本；(c) NULL custo_no 樣本；(d) 列集合精確相等（非僅 count 相等）。

### AC-8：四特例規則全 SQL 下推（portability 選項 A）

- **Given** 四條特例規則（fraud / motorcycle / xiaozi / year-above），其中 year-above（車齡超 15 年）之 golden oracle = **現行 JS**：`parseInt(c.year_produ ?? '1900', 10) < (workdt.getFullYear() − 15)` 才 DELETE。P2 為「對現行 JS 結果等價」（**非**復刻 SP），year-above 之 `year_produ` 數值化為唯一 portability 風險點
- **When** Stage 1 執行
- **Then** **四條規則全部 set-based 下推為 SQL，無任何應用層 filter**；year-above 與 fraud / motorcycle / xiaozi 一致皆於 `buildStage1Sql` 之 `<core>` 內以 SQL 表達
- **And** year-above 之 SQL 規格定義為「**行為等價於 JS `parseInt(year_produ ?? '1900', 10) < cutoff`**」，須完整對齊以下三類 JS `parseInt` 語意（cutoff = `workdt 年份 − 15`）：
  - **NULL / undefined** → JS `?? '1900'` → `1900` →（`1900 < cutoff` 通常成立）→ **被刪**
  - **空字串 `''` / 純非數字（如 `'N/A'`）** → JS `parseInt` → `NaN` → `NaN < cutoff` = `false` → **保留（不刪）**
  - **前導數字（如 `'1980abc'`）** → JS `parseInt` 取前導數字 = `1980`（**leading-digit 解析，非 strict all-digit**）→ **被刪**
- **And** **不硬 pin 死某一句 SQL**——精確寫法由 tdd-implementation 在 PG 真庫 EQ 等價測試（AC-7）下滿足上述三類即可。**⚠️ 禁用 `year_produ ~ '^[0-9]+$'` strict all-digit 過濾**（會把 `'1980abc'` 誤判為非數字而保留，與 JS leading-digit 解析**不等價**）；亦不可用 `NULLIF(REGEXP_REPLACE(...))` 之類把前導數字 case 一併排除的寫法。PG 可用 `substring(year_produ FROM '^\s*-?\d+')`（擷取前導整數）→ `CAST` → 缺值 / 擷取失敗時 `COALESCE` 退化為 `1900`，再與 cutoff 比較（僅供方向參考，非強制寫法）
- **And** 此規則之數值化行為 **PG 真庫驗收，不靠 SQLite**（SQLite e2e 對此規則不具代表性；I-PORT-01）
- **And** estimate≡run 仍共用同一份 `buildStage1Sql` 輸出——year-above 既已 SQL 化、納入 `<core>`，run / estimate 兩路徑自動共用，無「只在 run 套、estimate 漏」之 fork 風險（I-RUN-EST-01 由共用 core 自然保證）

> **不變式 I-PORT-01**：凡「SQLite 與 PG `CAST` / 數值轉換行為不同」之規則（如 year-above 之 `year_produ` 數值化），一律以 **PG integration test 驗收，不得只靠 SQLite 單元測試**；**CI 必須起 Postgres** 跑此類等價測試。**[ASSUMPTION] A-2**：OQ-AD28-03 已由使用者於 **2026-06-02 裁定 = 選項 A（全 SQL + 等價測試走 PG 真庫）**，非 AD 文件原始預設之選項 C。據此，year-above 一律 SQL 下推、無應用層 filter；CI 強制起 Postgres 為 OQ-03=A 之必然結果（見 §9 OQ-F099-01 之 RESOLVED 標記）。

### AC-9：冪等清理（I-IDEM-01）

- **Given** 同一 `run_id` 重觸發（P1 retry=0，但人工重觸發仍可能對同 run_id 重跑）
- **When** Stage 1 SQL 下推開始實質寫入前
- **Then** 先 `DELETE FROM ob_monthly_run_result WHERE run_id=:runId`（或整 run 由 FK ON DELETE CASCADE 清），確保重觸發產出一致
- **And** snapshot 同理清除

> **不變式 I-IDEM-01**：pipeline 開始實質寫入前，必須清除該 run_id 既有 result / snapshot。`ob_monthly_run_result` PK `(run_id, list_no, orgno, appl_no)` + FK ON DELETE CASCADE 支援此清理。

## 5. 假設與約束

- **[CONSTRAINT] C-1**：trigger 判斷（`matchesSpecialRule`）不 SQL 化；SQL 只接收布林結果（[AD-E07-28 §13](../implementation-log/AD-E07-v3.1-monthly-run-execution-model.md)）。
- **[CONSTRAINT] C-2**：去重視窗 / 上界語意不變（[AD-E07-27](../implementation-log/AD-E07-v3.1-monthly-run-execution-model.md)），僅計算位置移入 SQL。
- **[CONSTRAINT] C-3**：Stage 2~4 於 P2 仍 JS（讀 `ob_monthly_run_result` 回 heap 計分）；P2 完成後 F2 僅在 Stage 1 範圍解除。
- **[ASSUMPTION] A-3**：`buildStage1Sql` 設計為純函式 / 接受 repo 參數之 async 函式（沿用 `executeStage1Chain` 之模組歸屬原則，避免 `AssignmentListModule → AssignmentRunModule` 循環依賴，見 `stage1-filter-chain.ts` 註解）。

## 6. 相依關係

- **前置**：[F098](F098-monthly-run-worker-extraction.md)（P1 worker 容器）、[F094](F094-monthly-run-result-table.md)（目標表）、[F091 v2.0](F091-stage1-complete-month-cnt-dedup-special-delete.md)（Stage 1 步驟 ground truth）、[F049](F049-stage0-daily-estimate.md) / [F092](F092-stage1-dry-run-estimate.md)（estimate 路徑，需共用 `buildStage1Sql`）。
- **被依賴**：[F100](F100-stage2-4-sql-pushdown-scoring.md)（P3 在 Stage 1 已寫入之 `ob_monthly_run_result` 上 `UPDATE … FROM` 補計分 / 分派，或重構為單一大 `INSERT…SELECT` 含 join）。
- **修訂既有**：[AD-E07-22 / AD-E07-23](../architecture-spec.md)（Stage 1 由「欄位 SQL + 應用層」→「全步驟 set-based SQL，**四特例規則含 year-above 全下推、無例外**（OQ-AD28-03=選項 A，使用者 2026-06-02 拍板，覆蓋 AD 原文之 year-above 選項 C 例外）」，estimate≡run 共用原則保留並強化）；[AD-E07-25](../architecture-spec.md)（寫入 `ob_monthly_run_result` 方式由 JS `save()` → `INSERT…SELECT`）。
- **不影響**：[AD-E07-26](../architecture-spec.md)（trigger 判斷仍 JS）、[AD-E07-27](../architecture-spec.md)（workdt / 去重視窗語意不變）。

## 7. 錯誤情境

| 情境 | 系統回應 |
|------|---------|
| JS↔SQL 等價測試未通過 | **阻擋上線**（P2 DoD 未達成）；不得 deploy SQL 版 |
| `NOT IN` NULL 子查詢導致全部不 match | 由 AC-7 NULL 樣本攔截；tdd 改 `NOT EXISTS` |
| year-above 之 `year_produ` 數值化 PG 行為（CAST / 非數字 / 缺值退化 '1900'）與 JS 不等價 | year-above 已全 SQL 下推（選項 A），由 AC-8 之 **PG 真庫** portability 測試攔截（不靠 SQLite，I-PORT-01）；缺值須對齊 JS `?? '1900'` 語意 |

> 註：year-above 已全 SQL 化並納入共用 `buildStage1Sql` core，**不再有「只在 run 套應用層 filter、estimate 漏」之 fork 風險**；run / estimate 共用同一 core，I-RUN-EST-01 由共用 core 自然保證（無需額外 estimate 漏套防護）。

> 本 feature **不新增 HTTP 錯誤碼**（estimate / run 既有錯誤碼沿用）。

## 8. 測試覆蓋點名（test-designer / tdd 承接）

| 項目 | 承接 agent | 覆蓋要求 |
|------|-----------|---------|
| **I-RUN-EST-01**：run / estimate SQL core 同源（AC-1） | test-designer | SQL core 字串相等 OR run 列數 === estimate COUNT（同一 list） |
| **JS↔SQL 逐 list 等價矩陣**（AC-7，P2 DoD） | test-designer | PG 真庫；每特例規則 ≥1 觸發樣本 + 去重上下界 + NULL custo_no；列集合精確相等 |
| **I-PORT-01**：year-above 數值化 PG integration test（AC-8 / OQ-F099-02） | test-designer | PG 真庫（不靠 SQLite）；oracle = 現行 JS `parseInt`；三類邊界各 ≥1 樣本：**NULL→1900 被刪 / 非數字（''、'N/A'）→NaN 保留 / 前導數字 '1980abc'→1980 被刪**；驗證 `^[0-9]+$` strict 寫法會 fail（對 '1980abc' 不等價）|
| **assignday 不下推、保持 NULL（AC §4 / OQ-F099-03）** | test-designer | 斷言月名單分派結果 `assignday IS NULL`（與現行 JS 等價）；下推 SQL 無 `o.assignday` 引用 |
| **I-IDEM-01**：重觸發前清理（AC-9） | test-designer | 同 run_id 重跑產出一致 |
| **I-NOLOAD-01**：不全載 heap（AC-3） | test-designer | 斷言下推路徑無 `getMany()` / `find()` 全載（含 year-above，無例外）|
| 四特例規則（詐騙白牌 / 機車期中 / 期中小資 / year-above）全 SQL `WHERE NOT` 等價（AC-4/AC-6/AC-8） | test-designer | 各規則觸發 / 不觸發兩態；全 set-based |
| 廢除 `RGv2-005` / `SDv2-*` JS-pin guard（AC-7） | test-designer | 移除 grep-原始碼 guard，改等價測試 + special-rules 單元測試 |
| `buildStage1Sql` 純函式 / 模組歸屬（A-3） | tdd-implementation | 無循環依賴 |
| PG integration test 環境（CI 強制起 Postgres，OQ-03=A 必然結果） | test-designer + DevOps | 落實「CI 必起 Postgres」（已決，見 §9） |

## 9. Open Questions / 已解決事項

**本 feature 無待裁 open question。** 相關決策均已由使用者於 2026-06-02 拍板：

| ID | 狀態 | 決議 | 影響 |
|----|------|------|------|
| **OQ-AD28-03** | ✅ **RESOLVED（使用者 2026-06-02 拍板）= 選項 A** | 四特例規則（含 year-above）**全 SQL 下推、無應用層 filter**；等價測試一律走 **PG 真庫**（CI 強制起 Postgres）。AD 文件雖以選項 C 為預設，使用者已改採 A，以使用者拍板為準（AC-8 / I-PORT-01 已對齊） | Stage 1 100% 純 SQL；CI 必起 Postgres |
| **OQ-F099-01** | ✅ **已決：CI 必須起 Postgres** | OQ-03=A 之必然結果——year-above 等 PG≠SQLite 規則只能在 PG 真庫驗收，故 JS↔SQL 等價測試（AC-7）+ portability 測試（AC-8）之 CI 環境**必須提供 Postgres service**（非僅 local / nightly） | JS↔SQL 等價測試（AC-7 / AC-8）於 CI 可跑 |
| **OQ-F099-02**（P2 測試設計揪出） | ✅ **RESOLVED：golden oracle = 現行 JS** | year-above 等價基準 = 現行 JS `parseInt(year_produ ?? '1900', 10) < cutoff`（**非** SP）。SQL 須等價對齊三類 `parseInt` 語意（NULL→1900 被刪、非數字→NaN 保留、前導數字 `'1980abc'`→1980 被刪）；**禁用 `^[0-9]+$` strict** 過濾（對 `'1980abc'` 不等價）。不硬 pin SQL，tdd 於 PG 真庫 EQ 測試滿足即可（AC-8 已對齊） | year-above 等價測試以 JS 為 oracle；三類邊界樣本須各一 |
| **OQ-F099-03**（P2 測試設計揪出） | ✅ **RESOLVED：assignday 不下推、保持 NULL** | `ob_pool_data` 無 `assignday` 欄（在 `ob_pool_data_list`），且現行 JS pipeline 從不寫 assignday（該欄一直 NULL）；`ob_monthly_run_result.assignday` 為 Forward-compat 業務回填欄（DP-AD25-6）。下推 INSERT 欄位清單**不含 assignday**（寫 NULL），與現行 JS 等價，**不可** `SELECT o.assignday`（§4 / A-0 已修正） | INSERT 欄位清單移除 assignday；該欄保持 NULL |

## 10. 相關

- AD：[AD-E07-28 §5 P2 / §6](../implementation-log/AD-E07-v3.1-monthly-run-execution-model.md)
- 架構：[architecture-spec.md §5.13](../architecture-spec.md)
- 圖表：[diagrams/F099-stage1-sql-pushdown-flow.mmd](../diagrams/F099-stage1-sql-pushdown-flow.mmd)
- 前置：[F098](F098-monthly-run-worker-extraction.md)、[F094](F094-monthly-run-result-table.md)、[F091](F091-stage1-complete-month-cnt-dedup-special-delete.md)
- 下一階段：[F100](F100-stage2-4-sql-pushdown-scoring.md)（P3）
- estimate 路徑：[F049](F049-stage0-daily-estimate.md)、[F092](F092-stage1-dry-run-estimate.md)
