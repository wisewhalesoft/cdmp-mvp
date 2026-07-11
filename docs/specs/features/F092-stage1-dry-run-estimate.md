---
spec-id: F092
title: Stage 1 完整鏈 Dry-run 精確估算
feature-id: F092
source-story: US-135
epic: E07
module: M01 名單定義 / M03d 準備完成（Stage 1 精確化工程 Phase 3）
priority: P0-MVP
version: "1.1"
date: 2026-05-27
status: Draft
---

# F092: Stage 1 完整鏈 Dry-run 精確估算（Stage 1 精確化 Phase 3）

Priority: P0-MVP | Status: Draft | Last Updated: 2026-05-27

> **v1.1（2026-05-27 / 同步 F091 v2.0 + F094 落點變更）**：本輪為 note-only 同步（不改 dry-run 行為契約）。因 [F091 v2.0](F091-stage1-complete-month-cnt-dedup-special-delete.md) 之 Stage 1 篩選鏈已升級（特例 DELETE trigger SP 修正：期中機車 / 期中 / 年以上；去重上界改 `MIN(MAX(assignday), workdt−1日)`），且月名單分派寫入目標改為 `ob_monthly_run_result`（[F094](F094-monthly-run-result-table.md)），本 feature 之 dry-run 行為自動跟隨升級：dry-run COUNT ≡ 月名單分派案件數之「精確一致」基準（AC-3）已涵蓋修正後之 trigger 與去重上界。AC-2「dry-run 不寫入任何表」之表清單同步更新（月名單分派寫入目標已改 `ob_monthly_run_result`，dry-run 仍不寫入）。dry-run 本身仍唯讀、不寫入、不改 API 簽名。
>
> **v1.0（2026-05-26 / Stage 1 精確化工程 Phase 3）**：依 [architecture-spec.md AD-E07-23 v1.1](../architecture-spec.md)（全部 DP 已 Resolved）落地。將 per-list 估算（estimate / dry-run）從現行「欄位篩選版 COUNT」升級為**完整 Stage 1 篩選鏈之唯讀 dry-run COUNT**，使估算數字與正式月名單分派 Stage 1 嚴格一致（消除 estimate / run 雙軌 drift）。dry-run 複用 [F091](F091-stage1-complete-month-cnt-dedup-special-delete.md) 之 `Stage1FilterChain`（`dryRun: true`），不寫入任何表。
>
> **估算語意升級（重要 — 影響 F049 / F088）**：本 feature 改變 per-list estimate 的**定義**：
> - **升級前**：「條件符合上界」= 僅欄位篩選 COUNT（[F049 v1.2.1 BR-6](F049-stage0-daily-estimate.md) 明述試算為上界、實際分派數更少）。
> - **升級後**：「完整 Stage 1 預估」= 欄位篩選 + MONTH_CNT 期別過濾 + 近 3 個月去重 + 特殊 DELETE 全鏈 dry-run COUNT，**與正式月名單分派 Stage 1 案件數一致**。
> - 受影響的 estimate 使用端：[F049 §5.2 per-list estimate / Stage 0 試算頁 total](F049-stage0-daily-estimate.md)、[F088 estimateCases 物化快取](F088-ready-stage-summary.md)。本 feature 之 §11 對 F049 / F088 影響說明 + 交叉引用，供下游 agent 同步更新既有 spec 描述。
>
> **Phase 邊界**：本 feature 依賴 [F091](F091-stage1-complete-month-cnt-dedup-special-delete.md)（Phase 2）之 `Stage1FilterChain`。依 [AD-E07-24 §24.2](../architecture-spec.md)，Phase 3 交付**不影響 production 月名單分派**（僅改變估算計算路徑，月名單分派行為已於 F091 變更）。
>
> **刻意未動（邊界）**：不變更 `architecture-spec.md`（AD-E07-23 為權威，由 system-architect 維護）、不撰寫 code / test（由 tdd-implementation 落地）；不新建 prototype 頁（沿用 F049 prototype `prototypes/30-stage0-estimate.html` + F088 prototype `prototypes/29d-ready-summary.html`）。**F049 / F088 既有 spec 之 BR-6 / estimateCases 描述同步更新由本 feature §11 指引下游 agent 處理，本 feature 檔不逕自改寫該兩檔正文**（避免越界；交叉引用方式見 §11）。

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + [architecture-spec.md AD-E07-23](../architecture-spec.md) + [F091](F091-stage1-complete-month-cnt-dedup-special-delete.md)（`Stage1FilterChain` 契約）+ `apps/api/src/modules/assignment`（`Stage0EstimateService.estimateListCount` 升級路徑）|
| QA / Tester | 本文件 + [F091 §4](F091-stage1-complete-month-cnt-dedup-special-delete.md)（月名單分派行為對照）+ [error-handling.md#assignment-errors](../error-handling.md#assignment-errors) |
| Architect | 本文件 + [architecture-spec.md AD-E07-23 / AD-E07-24](../architecture-spec.md) |
| UI/UX Designer | 本文件 §7 + [F049 §8](F049-stage0-daily-estimate.md) + [F088 §7](F088-ready-stage-summary.md)（沿用既有 prototype，僅數字語意更新） |

---

## 1. 功能摘要

將 per-list 估算（dry-run COUNT）從「欄位篩選版」升級為「完整 Stage 1 篩選鏈唯讀 dry-run」，使估算數字精確等於正式月名單分派 Stage 1 之分派案件數。dry-run 複用 [F091](F091-stage1-complete-month-cnt-dedup-special-delete.md) 之 `executeStage1Chain(..., { dryRun: true })`，以 `SELECT COUNT(*)`（不拉資料列）+ 應用層去重 / 特殊 DELETE 計算 count，且**不寫入** `ob_pool_data_list` / `assignment_run` / `assignment_run_snapshot`。

## 2. 使用者故事

**As a** 業務部長
**I want** Stage 0 試算頁與準備完成摘要卡片顯示的預估案件數，精確等於月名單分派實際分派的案件數
**So that** 我在觸發月名單分派前看到的估算不再是「上界」（偏高），而是與實際月名單分派一致的數字，可據以正確評估工作量配置

## 3. 前置條件

- [F091](F091-stage1-complete-month-cnt-dedup-special-delete.md)（Phase 2）已完成：`Stage1FilterChain`（含 `executeStage1Chain`）可用，月名單分派已套用三步驟
- [F090](F090-obpooldata-list-etl.md)（Phase 1）已完成：`ob_pool_data_list` 含 legacy 歷史（dry-run 去重需查此表）
- 既有 `Stage0EstimateService.estimateListCount(listNo)`（F049 §5.2 estimate 端點背後 service）可被升級

## 4. 驗收標準

### AC-1：per-list estimate 升級為完整鏈 dry-run COUNT

- **Given** 某 `status='active'` 名單之 `condition_payload`（或 legacy 路徑 B 欄位）
- **When** 呼叫 per-list estimate（`Stage0EstimateService.estimateListCount(listNo)`，即 [F049 §5.2 `GET /api/v1/assignment/list-definitions/:listNo/estimate`](F049-stage0-daily-estimate.md) 背後 service）
- **Then** 內部改呼叫 `executeStage1Chain(list, workdt, poolRepo, poolDataListRepo, { dryRun: true })` 取得 `result.count`
- **And** `workdt` 以當前作業月份 `WORKYM + '01'` 推算
- **And** 回傳 count 涵蓋完整 Stage 1 篩選鏈：欄位篩選 + MONTH_CNT 期別過濾 + 近 3 個月去重 + 特殊 DELETE（與 [F091 AC-8](F091-stage1-complete-month-cnt-dedup-special-delete.md) 之月名單分派鏈同一套實作）

### AC-2：dry-run 唯讀（不寫入任何表）

- **Given** dry-run 模式（`{ dryRun: true }`）
- **When** 執行 `executeStage1Chain`
- **Then** **不寫入** `ob_monthly_run_result`（v1.1：月名單分派寫入目標，見 [F094](F094-monthly-run-result-table.md)）、**不寫入** `ob_pool_data_list`、**不建立** `assignment_run`、**不寫入** `assignment_run_snapshot`
- **And** dry-run 模式之 `Stage1ChainResult.cases` 為 `undefined`（不載入百萬列至記憶體），`count` 來自 `SELECT COUNT(*)` SQL + 應用層去重 / 特例 DELETE 修正

### AC-3：dry-run COUNT ≡ 正式月名單分派 Stage 1 案件數（同一鏈）

- **Given** 同一名單、同一 `workdt`、同一 `ob_pool_data` / `ob_pool_data_list` 資料快照
- **When** 分別執行 dry-run（`{ dryRun: true }`）與月名單分派（`{ dryRun: false }`）
- **Then** dry-run `result.count` **等於**月名單分派寫入 `ob_monthly_run_result`（v1.1，見 [F094](F094-monthly-run-result-table.md)）之該名單案件數（精確一致，[DP-AD23-1 完整鏈精確模式](../architecture-spec.md)）
- **And** 此一致性對所有篩選步驟成立：期別過濾、去重（含 v2.0 上界 `MIN(MAX(assignday), workdt−1日)`）、特例 DELETE（含 v2.0 修正後 trigger：期中機車 / 期中 / 年以上）、`EMPTY_CONDITIONS` skip（skip 名單 dry-run count = 0）

### AC-4：dry-run 去重與特殊 DELETE 之精確模式（DP-AD23-1）

- **Given** dry-run 需計算去重與特殊 DELETE 後的 count
- **When** dry-run 執行
- **Then** 去重：執行與月名單分派相同的 `ob_pool_data_list` 去重查詢取得 custo_no 集合，於 COUNT 結果上減去相交案件數（[AD-E07-23 §23.3 選項 B 近似 / 或精確]，最終須滿足 AC-3 精確一致）
- **And** 特殊 DELETE：若規則適用（`list_nm` includes 比對成立 / 詐騙白牌無條件），dry-run 載入**必要欄位**（`appl_no` / `payt_term` / `deal_num` / `payt_num` / `spec_name` / `year_produ` / `list_type` / `custo_no`，非全欄位 `SELECT *`），於應用層套用 filter 後計算 count

### AC-5：Stage 0 試算頁 total 升級

- **Given** [F049 Stage 0 試算頁](F049-stage0-daily-estimate.md)（`30-stage0-estimate`）選取某名單
- **When** 取得該名單 per-list COUNT 作為每日估算之 `total`（[F049 AC-4-Default](F049-stage0-daily-estimate.md)）
- **Then** `total` 來自升級後之完整鏈 dry-run COUNT（取代現行欄位篩選版）
- **And** 每日件數計算（`round(ratioPerMille / 1000 × total)`，F049 §13）不變，僅 `total` 數值來源語意升級為「完整 Stage 1 預估」
- **And** UI（prototype `30-stage0-estimate.html`）不變更，僅 `total` 數字更接近實際月名單分派

### AC-6：F088 準備完成摘要 `estimateCases` 物化升級

- **Given** [F088 準備完成摘要卡片之 `estimateCases` 物化快取](F088-ready-stage-summary.md)（由 [F086 approve→ready 時計算並存於 `ob_list_definition.stage0_estimate_count`](F086-approve-to-ready.md)，[AD-E07-20 hook]）
- **When** approve→ready 觸發物化估算計算
- **Then** 物化計算改用完整鏈 dry-run COUNT（取代現行欄位篩選版），`estimateCases` 數字升級為「完整 Stage 1 預估」
- **And** 物化讀寫機制不變（best-effort，計算失敗不阻擋 approve；清單頁讀存值，不逐筆即時 COUNT — [F088 BR-10 效能原則](F088-ready-stage-summary.md)）；僅計算所用之 COUNT 來源升級
- **And**（效能提示）完整鏈 dry-run 因含去重查詢（查 `ob_pool_data_list`），計算耗時可能較欄位篩選版增加；物化（非即時）設計吸收此成本

### AC-7：估算逾時保護保留

- **Given** dry-run 完整鏈查詢超過逾時上限（沿用 [F049 AC-5](F049-stage0-daily-estimate.md) 之 10 秒）
- **When** 後端偵測逾時
- **Then** 中斷查詢並回傳 `STAGE0_ESTIMATE_TIMEOUT`（[error-handling.md#assignment-errors](../error-handling.md#assignment-errors)）
- **And**（注意）完整鏈含去重查詢，逾時風險較欄位篩選版高；TDD 須評估 `ob_pool_data_list.assignday` 索引（[F091 AC-2](F091-stage1-complete-month-cnt-dedup-special-delete.md)）對 dry-run 效能之影響

## 5. API 規格

> 本 feature **不新增 API endpoint、不改變既有 endpoint 簽名**（[AD-E07-24 §24.5](../architecture-spec.md)）。升級在 service / `Stage1FilterChain` 層。受影響 endpoint：

| Endpoint | 變更 | 來源 spec |
|---|---|---|
| `GET /api/v1/assignment/list-definitions/:listNo/estimate` | response shape 不變（`{ listNo, count }`）；`count` 語意升級為完整鏈 dry-run | [F049 §5.2](F049-stage0-daily-estimate.md) |
| `GET /api/v1/assignment/lists`（每筆 `estimateCases`）| shape 不變；`estimateCases` 物化值來源升級 | [F088 §5.0](F088-ready-stage-summary.md) |

> **[ASSUMPTION] A-1**：`Stage0EstimateService.estimateListCount()` 升級為呼叫 `executeStage1Chain({ dryRun: true })` 之內部實作（含 `Stage1FilterChain` 注入、模組依賴）由 tdd-implementation 依 [AD-E07-23 §23.5](../architecture-spec.md) 循環依賴分析落地；本 feature 定義行為契約（AC-3 精確一致為唯一驗收標準）。

## 6. 商業規則

| 規則編號 | 說明 |
|---|---|
| BR-1 | **單一篩選鏈**（AD-E07-23 §23.1）：estimate / dry-run 與月名單分派共用 `Stage1FilterChain`，禁止另寫一套估算邏輯 |
| BR-2 | **dry-run 唯讀**：不寫 `ob_pool_data_list` / `assignment_run` / `assignment_run_snapshot`（AC-2） |
| BR-3 | **dry-run ≡ run 精確一致**（DP-AD23-1）：同一名單 / workdt / 資料快照下，dry-run count = 月名單分派案件數（AC-3） |
| BR-4 | **estimate 語意升級為「完整 Stage 1 預估」**：取代 [F049 v1.2.1 BR-6](F049-stage0-daily-estimate.md) 之「條件符合上界」語意（升級後 estimate 已含 MONTH_CNT 過濾 + 去重 + 特殊 DELETE，不再是上界，而是與月名單分派一致的精確預估）|
| BR-5 | **F088 物化機制不變**：僅 COUNT 來源升級；物化讀寫（best-effort、清單頁讀存值、不即時逐筆 COUNT）保留（F088 BR-10）|
| BR-6 | **dry-run COUNT 模式**：最終 SQL `SELECT COUNT(*)`（不拉資料列）；去重 / 特殊 DELETE 載入必要欄位於應用層修正 count（AC-4）|

## 7. UI/UX 需求

> 本 feature **不變更任何 UI 版面 / prototype**；沿用 F049 prototype `prototypes/30-stage0-estimate.html` 與 F088 prototype `prototypes/29d-ready-summary.html`。唯一可見變化為**顯示的估算數字更接近實際月名單分派**（通常較升級前小）。

- Stage 0 試算頁（F049）：`total` 數字升級，每日 bar / KPI 隨之變化（演算法 / 版面不變）
- 準備完成摘要卡片（F088）：`estimateCases`（`~{N}`）數字升級（卡片版面不變）
- 建議（非強制）：可於估算說明區補一行「預估值已含期別過濾 / 近 3 個月去重 / 特殊排除，與實際月名單分派一致」之語意說明（屬 F049 / F088 UI 文案，由下游 agent 評估）

## 8. 錯誤場景

| 場景 | 系統回應 | 參考 |
|---|---|---|
| dry-run 完整鏈查詢逾時 | 500 `STAGE0_ESTIMATE_TIMEOUT`（沿用 F049 AC-5）| [error-handling.md#assignment-errors](../error-handling.md#assignment-errors) |
| 名單無有效篩選條件（`EMPTY_CONDITIONS`）| dry-run count = 0（與月名單分派 skip 該名單一致；沿用 [F049 BR-5](F049-stage0-daily-estimate.md)）| [F091 BR-6](F091-stage1-complete-month-cnt-dedup-special-delete.md) |
| `ob_pool_data_list` 無 legacy 歷史（F090 未執行）| 去重退化為不過濾，dry-run count 偏高（與月名單分派同步退化，仍滿足 AC-3 一致性）| [F090](F090-obpooldata-list-etl.md) |

## 9. 相依性

- **Blocked By**：[F091](F091-stage1-complete-month-cnt-dedup-special-delete.md)（`Stage1FilterChain` + `executeStage1Chain`）、[F090](F090-obpooldata-list-etl.md)（去重歷史）
- **Blocks**：無（為三階段最後一階段）
- **影響（非 block，需同步更新描述）**：[F049](F049-stage0-daily-estimate.md)（BR-6 估算語意）、[F088](F088-ready-stage-summary.md)（estimateCases 物化）

## 10. 交叉參考

- 架構決策：[architecture-spec.md AD-E07-23 v1.1](../architecture-spec.md)（dry-run 完整鏈唯讀複用，**權威來源**）、[AD-E07-24 §24.2 / §24.5](../architecture-spec.md)（Phase 3 不影響 production 月名單分派 / 不改 API 簽名）
- 篩選鏈契約：[F091 §5.1](F091-stage1-complete-month-cnt-dedup-special-delete.md)（`Stage1FilterChain` / `executeStage1Chain` / `Stage1ChainResult`）
- 既有 estimate 使用端：[F049 §5.2 / §11 A-2 / BR-6](F049-stage0-daily-estimate.md)、[F088 §5.0 / BR-10](F088-ready-stage-summary.md)、[F086 approve→ready 物化 hook](F086-approve-to-ready.md)
- 資料模型：[data-model.md](../data-model.md)（`ob_list_definition.stage0_estimate_count` 物化欄，v1.14）
- 錯誤處理：[error-handling.md#assignment-errors](../error-handling.md#assignment-errors)
- prototype：`prototypes/30-stage0-estimate.html`（F049）、`prototypes/29d-ready-summary.html`（F088）

## 11. 對 F049 / F088 既有 spec 之影響（交叉引用，下游 agent 同步）

> 本 feature 改變 estimate 之語意定義；下列為對既有 spec 之影響說明，供後續 spec 更新時參照。**本 feature 檔不逕自改寫 F049 / F088 正文**（spec-writer 邊界：避免在本輪交付中跨檔大改既有 spec；以交叉引用標示即可，正式改寫由後續輪次或本輪用戶確認後處理）。

| 既有 spec | 受影響項 | 升級前 | 升級後 | 建議更新方式 |
|---|---|---|---|---|
| [F049](F049-stage0-daily-estimate.md) | BR-6「估算為條件符合上界」 | per-list 試算僅套欄位篩選，為案件數上界，實際分派更少 | per-list 試算 = 完整 Stage 1 dry-run，與月名單分派一致（不再是上界）| 於 F049 BR-6 補註「Phase 3（F092）後升級為完整鏈 dry-run，估算 ≡ 月名單分派」或加版本 banner 交叉引用 F092 |
| [F049](F049-stage0-daily-estimate.md) | AC-4 / §5.2 estimate 機制 | 複用 `buildStage1WhereConditions()` COUNT | 複用 `executeStage1Chain({dryRun:true})` 完整鏈 COUNT | F049 AC-4 之「複用 `buildStage1WhereConditions()`」升級為「複用 `Stage1FilterChain` 完整鏈」 |
| [F088](F088-ready-stage-summary.md) | BR-10 estimateCases 物化 | 欄位篩選版 COUNT 物化 | 完整鏈 dry-run COUNT 物化 | F088 BR-10 補註 COUNT 來源升級為 F092 完整鏈；物化 best-effort 機制不變 |

> **語意一致性**：升級後 F049 BR-6 之「估算為上界、實際更少」描述與新行為矛盾，須由後續更新解除（屬 [記憶 feedback_spec_schema_gap_first] 之 spec drift，建議下一輪 spec-writer 或本輪用戶確認後一併修 F049 BR-6 + F088 BR-10）。本 feature 已在 §11 明確標示矛盾點，避免靜默落差。

## 12. 假設

| # | 假設 | 標記 |
|---|---|---|
| A-1 | `Stage0EstimateService.estimateListCount()` 升級之內部實作（`Stage1FilterChain` 注入 / 模組依賴 / dry-run 去重精確 vs 近似最終實作）由 tdd-implementation 依 AD-E07-23 §23.3 / §23.5 落地；行為驗收以 AC-3 精確一致為準 | [ASSUMPTION] |
| A-2 | dry-run 完整鏈含去重查詢，效能較欄位篩選版差；逾時上限沿用 F049 10 秒，必要時依 `ob_pool_data_list.assignday` 索引優化 | [ASSUMPTION] |
| A-3 | F049 BR-6 / F088 BR-10 之既有描述與升級後語意矛盾，正式改寫由後續輪次處理（本 feature 僅交叉引用標示，見 §11） | [ASSUMPTION] |

## 13. Production 影響標注

- **本 Phase（F092）對 production 月名單分派案件數無影響**（[AD-E07-24 §24.2](../architecture-spec.md)）：僅改變估算計算路徑（estimate / dry-run），月名單分派行為已於 [F091](F091-stage1-complete-month-cnt-dedup-special-delete.md)（Phase 2）變更。
- 可見變化：使用者於 Stage 0 試算頁（F049）與準備完成摘要（F088）看到的預估案件數**升級為與實際月名單分派一致**（通常較升級前小，因含去重 / 期別 / 特殊排除）。
- F092 完成後，可於 staging/dev 執行完整月名單分派 dry-run，作為 [F091 §13](F091-stage1-complete-month-cnt-dedup-special-delete.md) 之「部署前 dry-run 驗證」工具。
