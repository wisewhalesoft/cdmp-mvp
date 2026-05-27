---
spec-id: F094
title: 月跑分派結果表 ob_monthly_run_result（單源化 Phase A：pipeline 落點切換）
feature-id: F094
source-story: AD 驅動（AD-E07-25）
epic: E07
module: M04 分派執行（ob_pool_data_list 單源化工程 Phase A）
priority: P0-MVP
version: "1.0"
date: 2026-05-27
status: Draft
---

# F094: 月跑分派結果表 ob_monthly_run_result（單源化 Phase A）

Priority: P0-MVP | Status: Draft | Last Updated: 2026-05-27

> ⚠️ **PRODUCTION 結構變更警告（必讀）**：本 feature 將月跑 Stage 1~4 之寫入 / 讀取目標由 `ob_pool_data_list`（`data_source='monthly_run'`）切換至新表 `ob_monthly_run_result`。依 [AD-E07-25 §25.7 Phase A](../architecture-spec.md)，**月跑寫入目標改變需於同一 PR 完整切換（Stage 1 寫入 + Stage 3/4 讀取），不可分批**，與 [F091 v2.0](F091-stage1-complete-month-cnt-dedup-special-delete.md)（特例規則 SP 修正）+ [F095](F095-applied-special-rules-readonly.md)（前端唯讀 API）同批 deploy（Phase A）。切換本身不改變月跑「案件數」（案件數由 F091 改變），但改變資料落點與下游讀取路徑，**deploy 前須完成回歸驗證**（見 §13）。
>
> **v1.0（2026-05-27 / AD-E07-25 單源化 Phase A）**：依 [architecture-spec.md AD-E07-25 v1.1](../architecture-spec.md)（全 DP Resolved）落地。新建 `ob_monthly_run_result` 表（migration `1711360000292`），承載「本次月跑對各名單的分派提案」（Stage 1 寫入 → Stage 2 計分 → Stage 3 CR → Stage 4 分派）；月跑 pipeline 寫入目標與 Stage 3/4 讀取目標由 `ob_pool_data_list` 切換至此表，使 `ob_pool_data_list` 回歸 ETL 單一來源（見 [F090 v2.0](F090-obpooldata-list-etl.md)）。
>
> **Phase 邊界**：本 feature 為單源化工程之 **Phase A**（結構切換）。`assignment_run_snapshot` type=result 短期雙軌保留（DP-AD25-3），`collectCrCandidates()` 短期維持讀 snapshot；中長期改查本表屬 **Phase C**（[F096](F096-pooldata-whitelist-list-type-cleanup.md) 之外的後續 follow-up，本輪不交付）。
>
> **刻意未動（邊界）**：不變更 `architecture-spec.md`（AD-E07-25 為權威，由 system-architect 維護）、不變更 `data-model.md`（`ob_monthly_run_result` 實體已由 system-architect 寫入 data-model.md，本 feature 引用其欄位定義不重複定義）；不撰寫 code / test（由 tdd-implementation 落地）；Stage 1 篩選邏輯（特例規則 / 去重）見 [F091 v2.0](F091-stage1-complete-month-cnt-dedup-special-delete.md)。

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + [architecture-spec.md AD-E07-25 §25.4 / §25.6 / §25.7](../architecture-spec.md)（**權威**）+ [data-model.md `ob_monthly_run_result`](../data-model.md)（**欄位權威**）+ `apps/api/src/modules/assignment/services/assignment-run-pipeline.service.ts`（`runPipeline` / `executeV1` / `executeV2` 寫入目標）+ [F091 v2.0](F091-stage1-complete-month-cnt-dedup-special-delete.md)（Stage 1 鏈回傳型別） |
| QA / Tester | 本文件（§4 AC + §13 回歸範圍）+ [error-handling.md#assignment-errors](../error-handling.md#assignment-errors) |
| Architect | 本文件 + [architecture-spec.md AD-E07-25](../architecture-spec.md) |
| DBA | 本文件 §5 + [data-model.md `ob_monthly_run_result`](../data-model.md)（migration `1711360000292`） |

---

## 1. 功能摘要

新建 `ob_monthly_run_result` 表作為月跑分派提案的結構化落點，承載 Stage 1~4 之計算結果（案件識別、計分、CR、分派部門/業務員），以 `run_id` FK 關聯 `assignment_run`（ON DELETE CASCADE）。月跑 pipeline 之寫入目標（Stage 1）與讀取目標（Stage 3/4）由 `ob_pool_data_list`（`data_source='monthly_run'`）切換至本表。此切換使 `ob_pool_data_list` 回歸「ETL 單一來源」語意，消除 [AD-E07-25 §25.1](../architecture-spec.md) 所列雙重角色設計之結構性問題（語意污染、ETL 刪除邊界隱性依賴）。

## 2. 使用者故事

**As a** 系統架構維運人員 / 分派維運人員
**I want** 月跑分派提案（本系統產出的候選清單）與業務系統歷史真相（ETL 載入的 `ob_pool_data_list`）分離儲存於獨立結果表
**So that** 去重查詢的來源語意清晰（只查 ETL 歷史）、月跑結果可依 `run_id` 整批追蹤與級聯清除，且未來業務回填狀態可結構化記錄

## 3. 前置條件

- `assignment_run` 表已存在（`run_id` UUID PK，FK 目標）
- migration m111（`ob_pool_data_list`）已存在
- 既有月跑 pipeline（`AssignmentRunPipelineService.runPipeline()` / `executeV1()` / `executeV2()`）可用，其 Stage 1 寫入與 Stage 3/4 讀取目前指向 `ob_pool_data_list`
- [F090 v2.0](F090-obpooldata-list-etl.md) 之 `ob_pool_data_list` 單源化語意（`data_source='etl_load'`）作為本 feature 切換後之配套

## 4. 驗收標準

### AC-1：新建 `ob_monthly_run_result` 表（migration `1711360000292`）

- **Given** `assignment_run` 表存在
- **When** migration `1711360000292-CreateObMonthlyRunResult` 執行
- **Then** 建立 `ob_monthly_run_result` 表，PK = `(run_id, list_no, orgno, appl_no)`，欄位與索引依 [data-model.md `ob_monthly_run_result`](../data-model.md) 之權威定義（§5 為摘要引用）
- **And** FK `fk_omrr_run` → `assignment_run(run_id)` `ON DELETE CASCADE`（月跑 run 刪除時自動清除對應結果列）
- **And** entity `ob-monthly-run-result.entity.ts` 對齊欄位定義（TIMESTAMP 欄位使用專案 `dateColumnType` helper，[記憶 feedback_typeorm_timestamp]）
- **And** migration `down()` DROP TABLE（可逆）

> **[ASSUMPTION] A-1**：`ob_monthly_run_result` 欄位 / 型別 / 索引 / FK 由 [AD-E07-25 §25.4](../architecture-spec.md) 拍板（DP-AD25-2 精簡欄位 / DP-AD25-6 assignday）並已寫入 data-model.md（系統架構師維護）；本 feature 引用其定義，不重複定義 schema。

### AC-2：月跑 Stage 1 寫入目標切換至 `ob_monthly_run_result`

- **Given** 月跑 Stage 1 為某 `list_no` 完成案件挑選（[F091 v2.0 `executeStage1Chain({ dryRun: false })`](F091-stage1-complete-month-cnt-dedup-special-delete.md)）
- **When** 寫入本月分派提案
- **Then** 寫入目標為 `ob_monthly_run_result`（**不再寫入 `ob_pool_data_list`**），每列帶當前 `run_id`（[AD-E07-25 §25.6](../architecture-spec.md)）
- **And** `executeV1()` / `executeV2()` 回傳型別由 `Partial<ObPoolDataList>[]` 改為 `Partial<ObMonthlyRunResult>[]`（§25.6 影響盤點）
- **And** 寫入欄位為精簡集合（PK 四欄 + custo_no + settle_src + Stage 2~4 結果欄位 + assignday）；Stage 2 計分所需業務欄位（spec_name / year_produ / payt_term 等）於計算時由 `ob_pool_data` 既有 in-memory `ObPoolData[]` 取得，**不複製**進本表（DP-AD25-2 方案 A）
- **And** `result_status` 初始為 `'PENDING'`（業務回填後改 `'SUCCESS'` / `'FAILED'`）

### AC-3：月跑 Stage 3/4 讀取目標切換至 `ob_monthly_run_result`

- **Given** 月跑 Stage 3（CR 回分）/ Stage 4（部門 / 業務員分配）需更新分派結果
- **When** Stage 3/4 讀取與更新 Stage 1 寫入之提案列
- **Then** 讀取與更新目標為 `ob_monthly_run_result`（依 `(run_id, list_no, ...)` 定位），**不再讀寫 `ob_pool_data_list`**
- **And** Stage 3 結果寫入 `is_cr` / `cr_id` / `cr_nm`；Stage 4 結果寫入 `dept_id` / `emplid` / `emplid_deptid`

### AC-4：同一 PR 完整切換（原子性）

- **Given** Stage 1 寫入目標與 Stage 3/4 讀取目標必須一致（同一表）
- **When** 落地本 feature
- **Then** Stage 1 寫入切換（AC-2）與 Stage 3/4 讀取切換（AC-3）**必須於同一 PR 完成**，不可分批 deploy（[AD-E07-25 §25.7 Phase A](../architecture-spec.md)）
- **And** 若僅切換 Stage 1 寫入而 Stage 3/4 仍讀 `ob_pool_data_list`，將導致 Stage 3/4 讀不到本次提案（資料斷鏈），故禁止部分切換

### AC-5：snapshot type=result 短期雙軌保留

- **Given** 既有 `collectCrCandidates()` 讀 `assignment_run_snapshot`（type=result）取得 CR 候選
- **When** 本 feature 切換結果落點
- **Then** `assignment_run_snapshot`（type=result）**短期保留雙軌**（DP-AD25-3 方案 A）；`collectCrCandidates()` 維持讀 snapshot，**本 feature 不改動**
- **And** 月跑 Stage 4 完成後仍寫 `assignment_run_snapshot`（type=result）作為稽核快照（與 `ob_monthly_run_result` 並存）
- **And**（follow-up）中長期待 `ob_monthly_run_result.result_status` 穩定後，`collectCrCandidates()` 改查本表屬 Phase C（OQ-OMRR-01，本輪不交付）

### AC-6：run 刪除級聯清除

- **Given** 某 `assignment_run`（`run_id`）被刪除
- **When** 刪除執行
- **Then** `ob_monthly_run_result` 中對應 `run_id` 之所有列由 FK `ON DELETE CASCADE` 自動清除（AC-1）
- **And** 不需應用層額外清除邏輯

### AC-7：去重來源不受影響

- **Given** Stage 1 近 3 個月去重查詢（[F091 v2.0 AC-2](F091-stage1-complete-month-cnt-dedup-special-delete.md)）讀 `ob_pool_data_list`
- **When** 本 feature 切換月跑落點至 `ob_monthly_run_result`
- **Then** 去重查詢**仍只讀 `ob_pool_data_list`**（ETL 單一來源），**不查 `ob_monthly_run_result`**（[AD-E07-25 §25.6](../architecture-spec.md)：`queryRecentAssignedCustoNos()` 無需修改邏輯）
- **And** 此設計確認：去重以「業務系統歷史真相（ETL）」為準，不以「本系統提案」為準（提案尚未成為真相）

## 5. 資料契約（引用 data-model.md 權威定義）

> 完整欄位 / 型別 / NULL / 索引以 [data-model.md `ob_monthly_run_result`](../data-model.md) 為**唯一權威**；以下為供 feature 閱讀之摘要，若與 data-model.md 衝突以 data-model.md 為準。

### 5.1 表結構摘要

- **表名**：`ob_monthly_run_result`（migration `1711360000292-CreateObMonthlyRunResult`）
- **PK**：`(run_id, list_no, orgno, appl_no)`
- **FK**：`fk_omrr_run` → `assignment_run(run_id)` `ON DELETE CASCADE`

| 欄位群組 | 欄位 | 說明 |
|---|---|---|
| PK / 識別 | `run_id`(UUID) / `list_no`(VARCHAR100) / `orgno`(VARCHAR2) / `appl_no`(VARCHAR10) | 月跑 ID + 名單 + 機構 + 案件申請號 |
| 案件基礎 | `custo_no`(VARCHAR11 NULL) / `settle_src`(TEXT DEFAULT 'N') | 客戶號 / 結案來源 |
| Stage 2 計分 | `score`(INT NULL) / `card_level`(VARCHAR1 NULL) / `tier_level`(VARCHAR5 NULL) | 計分結果 |
| Stage 3 CR | `is_cr`(VARCHAR1 NULL) / `cr_id`(VARCHAR20 NULL) / `cr_nm`(VARCHAR50 NULL) | CR 回分 |
| Stage 4 分派 | `dept_id`(VARCHAR6 NULL) / `emplid`(VARCHAR10 NULL) / `emplid_deptid`(VARCHAR6 NULL) | 分派部門 / 業務員 |
| 業務回填 | `result_status`(VARCHAR20 DEFAULT 'PENDING') | `'PENDING'` / `'SUCCESS'` / `'FAILED'` |
| Forward-compat | `assignday`(VARCHAR100 NULL) | 業務派案日期（DP-AD25-6）|
| 稽核 | `created_at` / `updated_at`(TIMESTAMP) | 建立 / 更新時間 |

### 5.2 索引摘要

| 索引 | 欄位 | 用途 |
|---|---|---|
| PK | `(run_id, list_no, orgno, appl_no)` | 主鍵 |
| `idx_omrr_run_id` | `(run_id)` | 月跑結果整批查詢 |
| `idx_omrr_list_run` | `(list_no, run_id)` | 按名單查某次月跑結果 |
| `idx_omrr_custo_no` | `(custo_no) WHERE custo_no IS NOT NULL` | 客戶號查詢 |
| `idx_omrr_assignday` | `(assignday) WHERE assignday IS NOT NULL` | 派案日期查詢 |

## 6. 商業規則

| 規則編號 | 說明 |
|---|---|
| BR-1 | **月跑寫入單一落點**（AD-E07-25 §25.2）：月跑 Stage 1~4 提案結果寫入 `ob_monthly_run_result`，不再寫入 `ob_pool_data_list` |
| BR-2 | **精簡欄位 + JOIN 取業務欄位**（DP-AD25-2）：本表僅存 Stage 2~4 計算結果，不複製 `ob_pool_data` 全部業務欄位；計算時直接用 in-memory `ObPoolData[]`，無需額外 JOIN |
| BR-3 | **run 級聯清除**：`run_id` FK + `ON DELETE CASCADE`，月跑刪除時自動清除對應結果列（AC-6） |
| BR-4 | **去重不查本表**（AD-E07-25 §25.6）：Stage 1 去重只讀 `ob_pool_data_list`（ETL 真相），不讀 `ob_monthly_run_result`（本系統提案）|
| BR-5 | **同一 PR 完整切換**（AD-E07-25 §25.7）：Stage 1 寫入 + Stage 3/4 讀取必須同批切換，禁止部分切換（AC-4） |
| BR-6 | **snapshot 雙軌短期保留**（DP-AD25-3）：`assignment_run_snapshot` type=result 保留，`collectCrCandidates()` 短期維持讀 snapshot；改查本表為 Phase C follow-up |
| BR-7 | **result_status 初始 PENDING**：月跑寫入時 `result_status='PENDING'`；業務系統回填後改 `'SUCCESS'`/`'FAILED'`（回填流程屬 Phase C，本輪不交付）|

## 7. 錯誤場景

| 場景 | 系統回應 | 參考 |
|---|---|---|
| 僅切換 Stage 1 寫入、Stage 3/4 仍讀 `ob_pool_data_list` | **禁止**（AC-4 / BR-5）：將導致資料斷鏈；須 PR review 攔截，TDD 補 regression 確認 Stage 3/4 讀本表 | [AD-E07-25 §25.7](../architecture-spec.md) |
| 月跑 run 重跑（同 list_no 重複寫入）| 由 pipeline 寫入策略處理（per-run_id 隔離 / 寫入前清除同 run_id 之列）；不同 `run_id` 天然隔離，PK 含 `run_id` 不衝突 | [F061](F061-trigger-assignment-run.md) |
| `assignment_run` 刪除 | FK CASCADE 自動清除本表對應列（AC-6），無孤兒列 | — |

## 8. 相依性

- **Blocked By**：`assignment_run` 表、既有月跑 pipeline（`AssignmentRunPipelineService`）
- **Blocks**：[F091 v2.0](F091-stage1-complete-month-cnt-dedup-special-delete.md)（Stage 1 鏈回傳型別 `Partial<ObMonthlyRunResult>[]` 依賴本表）
- **配套**：[F090 v2.0](F090-obpooldata-list-etl.md)（`ob_pool_data_list` 單源化，月跑不再寫該表）
- **同批 deploy（Phase A）**：[F091 v2.0](F091-stage1-complete-month-cnt-dedup-special-delete.md)、[F095](F095-applied-special-rules-readonly.md)

## 9. 交叉參考

- 架構決策：[architecture-spec.md AD-E07-25 v1.1](../architecture-spec.md)（單源化 + `ob_monthly_run_result` schema + 影響盤點 + 分階段交付，**權威來源**）
- 資料模型：[data-model.md `ob_monthly_run_result`](../data-model.md)（**欄位權威**，migration `1711360000292`）、[`ob_pool_data_list`](../data-model.md)（`data_source` v2.0 值域 `'etl_load'`）
- 既有實作：`apps/api/src/modules/assignment/services/assignment-run-pipeline.service.ts`（`runPipeline` / `executeV1` / `executeV2` 寫入 + Stage 3/4 讀取目標切換）
- 錯誤處理：[error-handling.md#assignment-errors](../error-handling.md#assignment-errors)
- 相關功能：[F090 v2.0](F090-obpooldata-list-etl.md)、[F091 v2.0](F091-stage1-complete-month-cnt-dedup-special-delete.md)、[F061](F061-trigger-assignment-run.md)（月跑觸發）、[F062](F062-view-run-progress.md)（執行進度）

## 10. 測試覆蓋率要求

- 單元測試覆蓋率 ≥ 80%
- 關鍵測試案例：
  - migration up/down：建表 + 4 索引 + FK CASCADE；down DROP TABLE
  - 複合 PK：`(run_id, list_no, orgno, appl_no)` 唯一性；不同 `run_id` 同 `(list_no, orgno, appl_no)` 不衝突
  - FK CASCADE：刪除 `assignment_run` 列 → 本表對應列自動清除
  - Stage 1 寫入：月跑寫入本表（非 `ob_pool_data_list`），`result_status='PENDING'`，回傳型別 `Partial<ObMonthlyRunResult>[]`
  - Stage 3/4：讀取與更新本表（`is_cr`/`cr_id`/`cr_nm`、`dept_id`/`emplid`/`emplid_deptid`）
  - **回歸（斷鏈防護）**：Stage 1 寫入 + Stage 3/4 讀取均指向本表（同一表）；月跑完整鏈 e2e 通過
  - **去重來源**：Stage 1 去重查詢只讀 `ob_pool_data_list`，不讀本表（與 F091 AC-2 對齊）
  - snapshot 雙軌：月跑仍寫 `assignment_run_snapshot` type=result；`collectCrCandidates()` 仍讀 snapshot
  - E2E seed 注意：`assignment_run` 必填四欄位（run_id / project_workym / triggered_by / created_at，[記憶 feedback_assignment_run_e2e_seed]）

## 11. 假設

| # | 假設 | 標記 |
|---|---|---|
| A-1 | `ob_monthly_run_result` 欄位 / 索引 / FK 由 AD-E07-25 §25.4 + data-model.md 權威定義；本 feature 引用 | Resolved（引用 AD-E07-25） |
| A-2 | 月跑重跑時同 `run_id` 之寫入冪等策略（寫入前清除同 run_id 列 vs 依賴新 run_id 天然隔離）由 tdd-implementation 依既有 pipeline 冪等慣例決定 | [ASSUMPTION] |
| A-3 | `result_status` 業務回填流程（PENDING → SUCCESS/FAILED）屬 Phase C，本輪僅建欄位 + 預設 'PENDING'，不實作回填端點 | [ASSUMPTION] |

## 12. Follow-up / Open Questions

| OQ 編號 | 議題 | 現況決策 | 狀態 |
|---|---|---|---|
| OQ-OMRR-01 | `collectCrCandidates()` 由讀 snapshot type=result 改查 `ob_monthly_run_result` | 短期雙軌（DP-AD25-3）；待 `result_status` 穩定後切換（Phase C） | Open（Phase C follow-up） |
| OQ-OMRR-02 | `assignment_run_snapshot` type=result 廢止時機 | 短期保留；Phase C 待業務回填流程確認後評估 | Open（Phase C follow-up） |
| OQ-OMRR-03 | `result_status` 業務回填端點 / 流程 | 本輪僅建欄位（預設 'PENDING'）；回填流程 Phase C | Open（Phase C follow-up） |

## 13. Production 影響標注（⚠️ 重點）

- **本 feature 改變月跑分派提案之資料落點與下游讀取路徑**（`ob_pool_data_list` → `ob_monthly_run_result`），屬 **Phase A** 結構切換，與 [F091 v2.0](F091-stage1-complete-month-cnt-dedup-special-delete.md) + [F095](F095-applied-special-rules-readonly.md) 同批 deploy。
- **本切換不改變月跑「案件數」**（案件數由 [F091 v2.0](F091-stage1-complete-month-cnt-dedup-special-delete.md) 之 Stage 1 篩選邏輯改變）；本 feature 改變的是「資料存放位置」與「Stage 3/4 讀取來源」。
- **原子性風險（AC-4 / BR-5）**：Stage 1 寫入與 Stage 3/4 讀取**必須同批切換**；部分切換將導致下游讀不到提案（資料斷鏈）。**deploy 前須完成月跑完整鏈 e2e 回歸驗證**（Stage 1→2→3→4 全程讀寫本表）。
- **回歸驗證範圍（建議）**：
  1. 月跑完整鏈 e2e：確認 Stage 1 寫入本表 → Stage 2 計分 → Stage 3 CR → Stage 4 分派，全程讀寫 `ob_monthly_run_result`。
  2. 去重來源：確認 Stage 1 去重仍只讀 `ob_pool_data_list`（不誤查本表）。
  3. snapshot 雙軌：確認 `collectCrCandidates()` 仍讀 snapshot、月跑仍寫 type=result 快照。
  4. FK CASCADE：刪除測試 run 確認本表對應列清除。
- **不影響範圍**：API endpoint 簽名不變（改動在 pipeline service / entity 層）；`ob_pool_data_list` 之 ETL 載入（[F090 v2.0](F090-obpooldata-list-etl.md)）與去重查詢路徑不受影響。
</content>
