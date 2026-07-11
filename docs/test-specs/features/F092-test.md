---
type: test-design-feature
feature_id: F092
feature_name: Stage 1 完整鏈 Dry-run 精確估算
priority: P0-MVP
related_spec: /docs/specs/features/F092-stage1-dry-run-estimate.md
spec_version: "1.0"
covers:
  - F092
  - US-135
last_updated: 2026-05-26
---

# F092：Stage 1 完整鏈 Dry-run 精確估算 — 測試設計

> **測試設計範圍（v1.0 / 2026-05-26）**：覆蓋 Stage 1 精確化工程 Phase 3 的 dry-run 升級驗收。核心驗收方向：
> 1. `executeStage1Chain({ dryRun: true })` 唯讀性（不寫入任何表）
> 2. dry-run COUNT ≡ 正式月名單分派 Stage 1 案件數（同鏈一致性，關鍵場景）
> 3. `Stage0EstimateService.estimateListCount` 升級為完整鏈 dry-run（取代欄位篩選版）
> 4. F049 Stage 0 試算頁 total 與 F088 estimateCases 物化升級
> 5. 逾時保護沿用 F049 10 秒
> 6. Regression：與舊版欄位篩選版相比，案件數通常更少（regression guard）
>
> **注意**：本 Phase 對 production 月名單分派案件數無影響（[AD-E07-24 §24.2](../../../specs/architecture-spec.md)）；僅改變估算計算路徑。

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `F092-stage1-dry-run-estimate.md` + `architecture-spec.md` AD-E07-23 + `F091-stage1-complete-month-cnt-dedup-special-delete.md`（`Stage1FilterChain` / `executeStage1Chain` 契約）+ `apps/api/src/modules/assignment-list/stage0-estimate.service.ts`（升級路徑）|
| QA / Tester | 本文件 + F091-test.md（TS-F091-CH-004 前置驗證）+ `error-handling.md#assignment-errors` |

---

## 測試策略概覽

| 項目 | 說明 |
|---|---|
| 主要測試層 | Unit（mock `executeStage1Chain`）；Integration（PostgreSQL TestContainer，dry-run ≡ run 精確一致）|
| 關鍵依賴 | F091 `Stage1FilterChain` 已實作（TS-F091-CH-004 通過是本 feature 的前置條件）|
| 唯讀保護 | dry-run 不寫 `ob_pool_data_list` / `assignment_run` / `assignment_run_snapshot`；透過 spy / mock 驗證無寫入呼叫 |
| 一致性驗證 | 同一名單 / workdt / 資料快照下，dry-run count = 月名單分派 Stage 1 案件數（Integration 層精確比對）|
| 逾時測試 | 沿用 F049 10 秒逾時保護；注入 timeoutMs 參數 |
| Regression | 升級後 estimateListCount 回傳值 ≤ 舊版（含去重 + 特殊 DELETE，通常更少）|

### 案例群組自動化就緒度

| 群組 | 案例數 | 自動化適合度 | 測試層 | 說明 |
|---|---|---|---|---|
| TS-F092-DR-001~004 | 4 | 高（Unit + Integration） | Unit/Integration | dry-run 唯讀 + cases undefined + dryRun flag 傳遞 |
| TS-F092-EQ-001~003 | 3 | 高（需 PG TC） | Integration | dry-run ≡ run 精確一致（關鍵場景）|
| TS-F092-EST-001~004 | 4 | 高（Unit mock + Integration） | Unit/Integration | estimateListCount 升級：路徑 A / 路徑 B / EMPTY_CONDITIONS / timeout |
| TS-F092-UPG-001~004 | 4 | 高（Component + Integration） | Component/Integration | F049 trial page + F088 estimateCases 升級 |
| TS-F092-RG-001~003 | 3 | 高 | Unit / Regression | 舊版 estimate 偏高 regression guard + F049 BR-6 語意矛盾標注 |

---

## 一、Dry-run 唯讀性驗證

> **設計依據**：F092 AC-2；AD-E07-23 §23.3 pt.1（不寫入任何表）

---

### TS-F092-DR-001：dry-run 不寫入 ob_pool_data_list

- **關聯需求**：F092 AC-2（「不寫入 `ob_pool_data_list`」）；BR-2
- **測試類型**：Negative / Unit
- **測試層**：Unit（spy `poolDataListRepo.save` / `insert` / `createQueryBuilder(...).insert()`）
- **前置條件**：
  - mock `poolDataListRepo`（spy 所有寫入方法：`save`、`insert`、`upsert`、`delete`、`createQueryBuilder().delete()`）
  - `list.list_nm = '一般名單'`（不觸發特殊 DELETE）
- **步驟**：
  1. 呼叫 `executeStage1Chain(list, workdt, poolRepo, poolDataListRepo, { dryRun: true })`
  2. 確認 `poolDataListRepo` 的所有寫入方法呼叫次數
- **預期結果**：
  - `poolDataListRepo.save` 呼叫次數 = 0
  - `poolDataListRepo.insert` 呼叫次數 = 0
  - `poolDataListRepo.delete`（或含 `data_source = 'monthly_run'` 的 DELETE）呼叫次數 = 0
  - **允許** `poolDataListRepo.createQueryBuilder().select()...` 的**讀取**呼叫（去重查詢需要）
- **備註**：區分「讀」（去重 SELECT）與「寫」（月名單分派 DELETE + INSERT），只有「寫」需被 spy 確認為 0

---

### TS-F092-DR-002：dry-run 不建立 assignment_run 與 assignment_run_snapshot

- **關聯需求**：F092 AC-2（「不建立 `assignment_run`、不寫入 `assignment_run_snapshot`」）；BR-2
- **測試類型**：Negative / Unit
- **測試層**：Unit（spy `assignmentRunRepo.save` / `snapshotRepo.insert`）
- **前置條件**：
  - mock `assignmentRunRepo` 和 `assignmentRunSnapshotRepo`
  - 已設定 dry-run 模式
- **步驟**：
  1. 呼叫 `executeStage1Chain(..., { dryRun: true })`
  2. 確認 assignment_run 和 snapshot 的寫入 spy 均為 0 次
- **預期結果**：
  - `assignmentRunRepo.save` 呼叫次數 = 0
  - `assignmentRunSnapshotRepo.insert` 呼叫次數 = 0

---

### TS-F092-DR-003：dry-run 回傳 cases=undefined（不載入案件列到記憶體）

- **關聯需求**：F092 AC-2（「dry-run 模式之 `Stage1ChainResult.cases` 為 `undefined`」）；AD-E07-23 §23.3 pt.2；BR-6
- **測試類型**：Positive / Unit
- **測試層**：Unit（mock）
- **前置條件**：
  - mock `poolRepo.find()` 或 `poolRepo.createQueryBuilder()` 回傳 5 筆案件
  - 呼叫 dry-run 模式
- **步驟**：
  1. 呼叫 `executeStage1Chain(..., { dryRun: true })`
  2. 驗證 `result.cases === undefined`
  3. 驗證 `result.count >= 0`（count 仍有值）
  4. 驗證 dry-run 模式**不呼叫** `poolRepo.find()` 取全部案件（避免百萬列載入記憶體）
- **預期結果**：
  - `result.cases === undefined`
  - `result.count` 為非負整數（來自 COUNT 或應用層計算）
  - `result.skipped === false`（資料正常時）

---

### TS-F092-DR-004：dryRun flag 正確傳遞至 executeStage1Chain

- **關聯需求**：F092 AC-1（`Stage0EstimateService.estimateListCount` 內部呼叫 `executeStage1Chain(..., { dryRun: true })`）；AD-E07-23 §23.5
- **測試類型**：Positive / Unit
- **測試層**：Unit（spy `executeStage1Chain`）
- **前置條件**：
  - spy `Stage1FilterChainService.executeStage1Chain`（或等效注入服務）
  - 呼叫 `Stage0EstimateService.estimateListCount('OB202606001')`
- **步驟**：
  1. 呼叫 `estimateListCount('OB202606001')`
  2. 驗證 `executeStage1Chain` 被呼叫一次
  3. 驗證呼叫參數 `opts.dryRun === true`
- **預期結果**：
  - `executeStage1Chain` 收到 `dryRun: true`（不可傳 `false` 或不傳）
  - `workdt` 以當前作業月份 `WORKYM + '01'` 推算

---

## 二、Dry-run ≡ 正式月名單分派 Stage 1 精確一致性

> **設計依據**：F092 AC-3 / AC-4；AD-E07-23 §23.3~§23.4；BR-3（DP-AD23-1 完整鏈精確模式）

---

### TS-F092-EQ-001：同一名單 / workdt / 資料快照 — dry-run count ≡ 月名單分派 Stage 1 案件數（關鍵場景）

- **關聯需求**：F092 AC-3；BR-3（DP-AD23-1）
- **測試類型**：Positive / Integration（關鍵）
- **測試層**：Integration（PostgreSQL TestContainer；需完整 ob_pool_data + ob_pool_data_list seed）
- **前置條件**：
  - PostgreSQL TestContainer 啟動（F090 + F091 migration 均已執行）
  - `ob_pool_data` seed：30 筆案件，混合不同 `month_cnt`（部分在期別集合內，部分不在）、不同 `custo_no`、不同 `spec_name` / `appl_no` / `payt_term` / `deal_num` / `year_produ`
  - `ob_pool_data_list` seed：5 筆，`assignday` 在去重視窗內，`custo_no` 各不同（模擬近 3 個月已派案）
  - `list_nm = '中結強案年資特催'`（全部特殊 DELETE 觸發）
  - `list_period_start=1`、`list_period_end=12`、`list_interval=1`（月份篩選）
  - `condition_payload` 含有效欄位篩選條件
  - `workdt = new Date('2026-06-01')`
- **步驟**：
  1. **資料快照固定**（不變更 DB 狀態）
  2. 呼叫 `executeStage1Chain(list, workdt, poolRepo, poolDataListRepo, { dryRun: true })`，記錄 `dryCount = result.count`
  3. （不寫入 ob_pool_data_list）
  4. 呼叫 `executeStage1Chain(list, workdt, poolRepo, poolDataListRepo, { dryRun: false })`，記錄 `runCount = result.cases.length`；並**回滾**或清理寫入結果（以保持快照）
  5. 比較兩值
- **預期結果**：
  - `dryCount === runCount`（允許 ±0，精確一致）
  - 此一致性涵蓋：MONTH_CNT 期別過濾 + 近 3 個月去重 + 詐騙白牌 + 中結強案 / 中結 / 年資 特殊 DELETE
- **DB 需求**：PostgreSQL TestContainer
- **備註**：此場景是整個 Phase 3 的核心驗收；TS-F091-CH-004 是此場景的前置版本（更簡化的名單）；本場景覆蓋更複雜的全規則觸發情境。

---

### TS-F092-EQ-002：EMPTY_CONDITIONS skip — dry-run count=0 與月名單分派 skip 一致

- **關聯需求**：F092 AC-3（「一致性對 EMPTY_CONDITIONS skip 成立」）；F092 §8（錯誤場景）
- **測試類型**：Positive / Unit
- **測試層**：Unit（mock）
- **前置條件**：
  - `condition_payload = { conditions: [] }`（空條件，觸發 EMPTY_CONDITIONS）
  - mock `poolRepo`、`poolDataListRepo`
- **步驟**：
  1. 呼叫 `executeStage1Chain(..., { dryRun: true })`
  2. 驗證 `result.count === 0`
  3. 驗證 `result.skipped === true`
  4. 驗證 `result.skipReason === 'EMPTY_CONDITIONS'`
- **預期結果**：
  - dry-run count = 0（與月名單分派 skip 行為一致）
  - 不 throw（skip 為正常業務行為）

---

### TS-F092-EQ-003：ob_pool_data_list 無歷史時 — dry-run 退化（與月名單分派同步退化，仍滿足 AC-3）

- **關聯需求**：F092 AC-3（「一致性的退化邊界」）；F092 §8（「去重退化為不過濾，dry-run count 偏高，與月名單分派同步退化，仍滿足 AC-3 一致性」）
- **測試類型**：Positive / Unit
- **測試層**：Unit（mock `poolDataListRepo` 回空集合）
- **前置條件**：
  - mock `poolDataListRepo` 去重查詢回 `Set {}（空）`
  - mock `poolRepo` 回 10 筆案件（欄位篩選後）
- **步驟**：
  1. 呼叫 `executeStage1Chain(..., { dryRun: true })`，記錄 `dryCount`
  2. 呼叫 `executeStage1Chain(..., { dryRun: false })`，記錄 `runCount`
- **預期結果**：
  - `dryCount === runCount`（兩者都不過濾去重，一致退化）
  - `dryCount` 可能偏高（相較 F090 有歷史時），但滿足 AC-3 一致性原則

---

## 三、estimateListCount 升級驗證

> **設計依據**：F092 AC-1；AD-E07-23 §23.5；F049 v1.2 AC-4 → F092 升級

---

### TS-F092-EST-001：estimateListCount 路徑 A — 完整鏈 dry-run COUNT（取代欄位篩選版）

- **關聯需求**：F092 AC-1（`estimateListCount` 改呼叫 `executeStage1Chain({dryRun:true})`）；AD-E07-23 §23.5
- **測試類型**：Positive / Unit
- **測試層**：Unit（spy + mock）
- **前置條件**：
  - spy `Stage1FilterChainService.executeStage1Chain`，回傳 `{ count: 42, skipped: false, warnings: [], cases: undefined }`
  - SQLite in-memory seed：一筆 active 名單 `list_no = 'OB202606001'`，`condition_payload` 含有效條件
- **步驟**：
  1. 呼叫 `Stage0EstimateService.estimateListCount('OB202606001')`
  2. 驗證 `executeStage1Chain` spy 被呼叫一次，`opts.dryRun === true`
  3. 驗證回傳 `{ listNo: 'OB202606001', count: 42 }`
- **預期結果**：
  - 回傳 count 來自 `executeStage1Chain` 的 `result.count`（非直接 `buildStage1WhereConditions` COUNT）
  - `result.count = 42`（與 spy mock 一致）
  - API response shape 不變（`{ listNo, count }`）

---

### TS-F092-EST-002：estimateListCount 路徑 B（condition_payload = null）— 完整鏈 dry-run

- **關聯需求**：F092 AC-1（路徑 B legacy fallback 也使用完整鏈）；F049 v1.2 路徑 B
- **測試類型**：Positive / Unit
- **測試層**：Unit（spy + mock）
- **前置條件**：
  - 名單 `condition_payload = null`（路徑 B）
  - spy `executeStage1Chain` 回傳 `{ count: 15, skipped: false, warnings: [], cases: undefined }`
- **步驟**：
  1. 呼叫 `estimateListCount`
  2. 驗證 `executeStage1Chain` 被呼叫，`opts.dryRun === true`
  3. 驗證回傳 count = 15
- **預期結果**：
  - 路徑 B 亦升級為完整鏈 dry-run（非直接 COUNT）
  - 回傳值與 spy 一致

---

### TS-F092-EST-003：EMPTY_CONDITIONS → estimateListCount 回傳 count=0（Regression：保留既有行為）

- **關聯需求**：F092 §8（「名單無有效篩選條件（EMPTY_CONDITIONS），dry-run count = 0」）；F049 v1.2 BR-5
- **測試類型**：Regression / Unit
- **測試層**：Unit（mock `executeStage1Chain` 回 `{ count: 0, skipped: true, skipReason: 'EMPTY_CONDITIONS' }`）
- **前置條件**：名單 `condition_payload = { conditions: [] }`
- **步驟**：
  1. 呼叫 `estimateListCount`
  2. 驗證回傳 `{ listNo, count: 0 }`（HTTP 200，非錯誤）
- **預期結果**：
  - count = 0（與月名單分派 skip 一致）
  - HTTP 200（不拋 Exception）
  - 回傳格式不變（regression guard：F049 現有行為）

---

### TS-F092-EST-004：逾時保護 — timeoutMs=0 → 500 STAGE0_ESTIMATE_TIMEOUT（沿用 F049 10 秒）

- **關聯需求**：F092 AC-7；F049 AC-5（逾時保護 10 秒）；`error-handling.md#assignment-errors`
- **測試類型**：Negative / Unit
- **測試層**：Unit（注入 `timeoutMs` 參數）
- **前置條件**：
  - SQLite in-memory seed 一筆 active 名單
  - 注入 `timeoutMs = 0`（強制逾時）
  - `executeStage1Chain` mock 為永不 resolve（模擬超時）
- **步驟**：
  1. 呼叫 `estimateListCount(listNo, { timeoutMs: 0 })`
  2. 等待回傳（或 race with timeout promise）
- **預期結果**：
  - 拋出 `InternalServerErrorException`（或等效）
  - response body `error === 'STAGE0_ESTIMATE_TIMEOUT'`
  - **不 hang** 無限等待（逾時機制正常工作）
- **備註**：F049 EST-009 子場景 9c 為前置 regression；本場景驗證升級後的 `executeStage1Chain` 版本也有同等逾時保護

---

## 四、F049 / F088 升級驗證

> **設計依據**：F092 AC-5 / AC-6；F092 §7（UI 不變，僅數字語意升級）；F092 §11 對 F049 / F088 影響

---

### TS-F092-UPG-001：Stage 0 試算頁 total — 來自完整鏈 dry-run COUNT

- **關聯需求**：F092 AC-5（「total 來自升級後之完整鏈 dry-run COUNT」）；F049 AC-4-Default
- **測試類型**：Positive / Component（RTL + MSW）
- **測試層**：Component（前端 RTL + MSW stub）
- **前置條件**：
  - MSW stub `GET /api/v1/assignment/list-definitions/:listNo/estimate` 回 `{ listNo: 'OB202606001', count: 8500 }`（模擬升級後的精確 COUNT，通常較舊版 9500 更少）
  - MSW stub `GET /api/v1/assignment/stage0/daily-estimate` 回含 `workingDays=20`、`ratioPerMille` 陣列
- **步驟**：
  1. render `Stage0EstimatePage`，選取名單 `OB202606001`
  2. 等待 per-list estimate API 回傳
  3. 驗證頁面顯示的 KPI `total = 8500`
  4. 驗證每日件數計算基於 `total=8500`（不是寫死 9500）
- **預期結果**：
  - `total = 8500`（來自 MSW stub，代表升級後的精確 COUNT）
  - 每日件數 bar chart 隨 total 正確計算（`round(ratioPerMille/1000 × 8500)`）
  - UI prototype `30-stage0-estimate.html` 版面不變（僅數字變化）
- **備註**：此場景延伸 TS-F049-V13F-002（原 regression：無寫死 9500）；升級後 count 可能與 9500 不同但不應寫死任何值

---

### TS-F092-UPG-002：Stage 0 試算頁 total 升級後通常 ≤ 升級前（regression guard：不可更大）

- **關聯需求**：F092 BR-4（「升級後 estimate 已含 MONTH_CNT / 去重 / 特殊排除，不再是上界，而是精確預估」）；F049 BR-6 語意更新
- **測試類型**：Regression / Unit
- **測試層**：Unit（mock 兩個版本 estimateListCount 的回傳值）
- **前置條件**：
  - mock「欄位篩選版」count = 10000（舊版）
  - mock「完整鏈 dry-run」count = 8500（新版，因去重 + 特殊 DELETE 減少）
- **步驟**：
  1. 比較兩個版本回傳值
  2. 驗證新版 count ≤ 舊版 count（在 seed 資料含有去重 / 特殊 DELETE 案件時）
- **預期結果**：
  - 完整鏈 dry-run count ≤ 欄位篩選版 count（精確且不偏高）
  - `count_new = 8500 ≤ count_old = 10000` ✓
- **備註**：此場景為語意驗證，非強制 assert（因去重量依資料而異）；文件化「新版數字通常更小」的預期行為。

---

### TS-F092-UPG-003：F088 準備完成摘要 estimateCases 物化來源升級

- **關聯需求**：F092 AC-6（「物化計算改用完整鏈 dry-run COUNT」）；F088 BR-10（best-effort，計算失敗不阻擋 approve）
- **測試類型**：Positive / Unit
- **測試層**：Unit（spy approve→ready hook）
- **前置條件**：
  - spy `Stage1FilterChainService.executeStage1Chain`（或 `estimateListCount`）
  - 觸發 approve→ready 工作流（F086 hook）
- **步驟**：
  1. 觸發 approve→ready 流程（mock service）
  2. 驗證物化估算計算呼叫 `estimateListCount`（完整鏈版本）
  3. 驗證 `ob_list_definition.stage0_estimate_count` 被更新為新 count
- **預期結果**：
  - `estimateListCount` spy 被呼叫（`dryRun: true`）
  - `stage0_estimate_count` 寫入新的完整鏈 count
  - 物化 best-effort 機制不變（若 `estimateListCount` 拋錯，approve 仍成功，僅 `stage0_estimate_count` 不更新）

---

### TS-F092-UPG-004：F088 estimateCases 計算失敗不阻擋 approve（best-effort 保留）

- **關聯需求**：F092 AC-6（「物化讀寫機制不變（best-effort，計算失敗不阻擋 approve）」）；F088 BR-10
- **測試類型**：Negative / Unit
- **測試層**：Unit（mock `estimateListCount` throw）
- **前置條件**：
  - mock `estimateListCount` 拋出 `InternalServerErrorException`（模擬逾時或 DB 錯誤）
  - 觸發 approve→ready 流程
- **步驟**：
  1. 觸發 approve→ready 流程
  2. 驗證 approve 操作本身**成功**（名單狀態變為 ready）
  3. 驗證 `stage0_estimate_count` **未更新**（保留舊值或為 null）
- **預期結果**：
  - approve 流程回傳成功（HTTP 200 / 201）
  - `stage0_estimate_count` 不阻擋 approve（best-effort 機制保留）
  - 錯誤有 log（不靜默吞掉）

---

## 五、Regression 驗證

---

### TS-F092-RG-001：舊版 estimateListCount（欄位篩選版）行為已移除 — regression guard

- **關聯需求**：F092 AC-1（「內部改呼叫 `executeStage1Chain`」，舊版 `buildStage1WhereConditions` COUNT 路徑應被取代）
- **測試類型**：Regression / Unit（靜態）
- **測試層**：Unit（原始碼 grep）
- **前置條件**：`Stage0EstimateService.estimateListCount` 已升級
- **步驟**：
  1. grep `stage0-estimate.service.ts`，確認不再有直接呼叫 `buildPoolCountQuery`（舊版）或 `buildStage1WhereConditions(...).count()` 的路徑
  2. 確認改為呼叫 `executeStage1Chain({ dryRun: true })`
- **預期結果**：
  - 舊版 COUNT 路徑已移除（`buildPoolCountQuery` 或等效舊函式呼叫不存在於升級後的 service）
  - 僅保留 `executeStage1Chain` 呼叫

---

### TS-F092-RG-002：F049 BR-6 語意矛盾標注（「估算為上界」描述已過時）

- **關聯需求**：F092 §11（「F049 BR-6 升級前：per-list 試算僅套欄位篩選，為案件數上界；升級後：≡ 月名單分派，不再是上界」）；F092 A-3
- **測試類型**：Regression（文件標注）
- **測試層**：文件（F049-test.md 追加 note）
- **步驟**：
  1. 確認 `docs/test-specs/features/F049-test.md` 的 TS-F049-EST 群組中，有關「試算為上界」的描述已加標注：「F092 升級後此語意改變，estimate ≡ 月名單分派（精確），不再偏高」
  2. 確認 F049 spec v1.2 BR-6 的描述在下一輪 spec-writer 處理前有交叉引用 F092
- **預期結果**：
  - F049-test.md TS-F049-EST-010（Integration 層 COUNT 一致性）新增備註：「F092 後此場景的 estimateCount 應更精確（含去重 / 期別 / 特殊排除），預期值需更新」
  - 文件標注清楚，不靜默繼承舊語意

---

### TS-F092-RG-003：Stage 0 試算頁「試算為上界」UI 文案（選填升級通知）

- **關聯需求**：F092 §7（「建議（非強制）：可於估算說明區補一行語意說明」）
- **測試類型**：Positive / Component（RTL）
- **測試層**：Component（RTL，optional）
- **前置條件**：若 UI 有新增說明文字「預估值已含期別過濾 / 近 3 個月去重 / 特殊排除，與實際月名單分派一致」
- **步驟**：
  1. render `Stage0EstimatePage`
  2. 查詢說明文字元素
- **預期結果**：
  - **若** UI 有說明文字，驗證其存在且文案正確
  - **若** UI 未新增說明文字（業務選擇不顯示），此案例 skip（非強制）
  - 無論是否顯示說明文字，頁面 layout 不破壞（`30-stage0-estimate.html` prototype 版面不變）
- **備註**：此為選填場景（spec §7「建議（非強制）」），TDD Developer 依 UI 實作決定是否執行。

---

## 自動化就緒度

| 場景群組 | 自動化適合度 | 說明 |
|---|---|---|
| TS-F092-DR-001~004（dry-run 唯讀） | 高 | spy / mock；無 DB 依賴；純 unit 測試 |
| TS-F092-EQ-001（精確一致 PG TC） | 高（需 PG TC） | 核心場景；需 PostgreSQL TestContainer + ob_pool_data + ob_pool_data_list seed |
| TS-F092-EQ-002~003（EMPTY_CONDITIONS + 退化） | 高 | mock；無 DB |
| TS-F092-EST-001~004（estimateListCount 升級） | 高（混合） | EST-001~003 純 unit；EST-004 需 timeoutMs 注入 |
| TS-F092-UPG-001（Stage 0 頁 total） | 高 | RTL + MSW stub；MSW 控制 count 值 |
| TS-F092-UPG-002（regression guard 數字更小） | 中 | mock 比對；語意驗證，非強制精確值 |
| TS-F092-UPG-003~004（F088 物化 + best-effort） | 高 | spy approve→ready hook；mock estimateListCount |
| TS-F092-RG-001~002（regression 靜態） | 高（靜態 grep） | 原始碼分析；無 DB |
| TS-F092-RG-003（UI 文案 optional） | 低（選填） | 依 UI 實作決定是否執行；prototype 版面不變為必測 |
