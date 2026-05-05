---
spec-id: F061
title: 觸發分派月跑
feature-id: F061
source-story: US-081
epic: E07
module: M04 分派執行
priority: P0-MVP
version: "1.0"
date: 2026-04-24
status: Draft
---

# F061: 觸發分派月跑

Priority: P0-MVP | Status: Draft | Last Updated: 2026-04-24

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `data-model.md#e07-data-model` + `error-handling.md#assignment-errors` + `diagrams/F061-assignment-run-flow.mmd` + `diagrams/F061-assignment-run-states.mmd` |
| QA / Tester | 本文件 + `error-handling.md#assignment-errors` + `nfr.md`（NFR-003/004/005） |
| UI/UX Designer | 本文件（第 9 節 UI/UX 需求） + 狀態圖 |
| Architect | 本文件 + `architecture-spec.md` §3.10、§5.12（AD-E07-2）、`diagrams/F061-*.mmd` |

---

## 1. 功能摘要

提供業務主管一鍵觸發本月名單分派月跑（Stage 0 前置 → Stage 1 名單建立 → Stage 2 計分 → Stage 3 部門分配 + CR 回分 → Stage 4 人員分配 + st4_exchange → 快照原子性寫入）。採非同步執行模型（202 Accepted），同月僅允許一個 pending/running 月跑。月跑完成後三份快照（`config` / `input_list` / `result`）在同一 DB Transaction 中原子性寫入，任一失敗則全部 Rollback。

## 2. 使用者故事

**As a** 業務主管
**I want** 點擊一個按鈕觸發本月的名單分派月跑
**So that** 系統根據目前的名單定義、計分設定、部門比例與人員比例，自動完成全流程分派計算，無需 IT 手動執行 SQL

## 3. 前置條件

- 業務主管已登入並持有有效 JWT Token
- 本月名單定義已就緒（F048 ~ F050）
- 每個 active `list_no` 的部門比例加總 = 100%（F060）
- 所有啟用部門 × LIST_NO 的人員比例加總 = 100%（F058）
- 計分版本有 `status = 'active'` 紀錄（F054 / F055 / F056）
- `ob_pool_data` 已由 **E04 + E05 雙層 ETL** 流程載入當月資料（詳見 [architecture-spec.md §E07-C](../architecture-spec.md#e07-c-etl-設計)）

## 4. 驗收標準

### AC-1：Stage 0 前置條件檢查

- **Given** 業務主管在 M04 分派執行頁面點擊「執行月跑」按鈕
- **When** 系統進行前置條件驗證
- **Then** 依序檢查：
  1. `ob_list_definition` 有本作業年月（`project_workym = :currentYm`）且 `status = 'active'` 紀錄至少一筆
  2. 每個 active `list_no` 在 `ob_dept_pct` 均有部門比例設定，且加總 = 100%
  3. 所有啟用部門 × LIST_NO 組合的人員比例加總 = 100%（`ob_empl_set`）
  4. 計分版本有 `ob_levelcard_version.status = 'active'`
  5. 目前無 `status IN ('pending', 'running')` 的月跑
- **And** 任一條件未滿足，顯示具體失敗原因清單，不啟動月跑；回傳 422 `ASSIGNMENT_RUN_PRECHECK_FAILED`

### AC-2：月跑啟動並產生 run_id

- **Given** 所有前置條件均已通過
- **When** 業務主管於確認對話框點擊「確認執行」
- **Then** 系統 INSERT `assignment_run`（`status = 'pending'`, `project_workym = :currentYm`, `triggered_by = user_id`），產生唯一 `run_id`（UUID）
- **And** API 立即回傳 `202 Accepted` + `{ runId, status: 'pending' }`
- **And** 前端跳轉至 F062 執行進度頁

### AC-3：非同步執行 Stage 1~4

- **Given** 月跑已啟動
- **When** 後端背景 Promise chain 非同步執行
- **Then** 依序執行：
  - Stage 1：讀 `ob_pool_data` + 套用 `ob_list_definition` 篩選 → 產出候選名單
  - Stage 2：呼叫 `fn_calc_tier_level(...)` PostgreSQL function（AD-E07-3），套用 `ob_levelcard_*` 計分；TIER_LEVEL 對應採 `ob_tier` join，若 `ob_pool_data_list.card_level` 在 `ob_tier` 找不到對應紀錄，回退以 `card_type` 比對 fallback 規則（`card_level IS NULL` 那筆，如 `M5` → `T5M`）
  - Stage 3：讀 `ob_dept_pct` 部門比例 + CR 回分優先指定（依 F059 開關狀態）→ 寫 `ob_pool_data_list.dept_id`
  - Stage 4：讀 `ob_empl_set` 人員比例 + st4_exchange（T1/T2/T3 新件 10% 轉資深）→ 寫 `ob_pool_data_list.emplid`；員工基本資料（在職判定、部門對應、員工姓名）由 `ob_emphire` join 取得（採 E04 + E05 雙層 ETL 從舊 OB DB 同步，OBEMPHIRE 採 full 全量重抓策略，詳見 [architecture-spec.md §E07-C](../architecture-spec.md#e07-c-etl-設計)）
- **And** 每個 Stage 成功後更新 `assignment_run`（`status = 'running'` + stage log）

### AC-4：三份快照原子性寫入

- **Given** Stage 1~4 全部成功
- **When** 系統寫入執行快照
- **Then** 在同一 DB Transaction 中原子性寫入三份快照至 `assignment_run_snapshot`：
  - `snapshot_type = 'config'`：記錄本次執行設定（計分版本 + per-LIST_NO 部門比例 + 人員比例 + CR 開關）
  - `snapshot_type = 'input_list'`：記錄 Stage 1 輸出（候選名單）
  - `snapshot_type = 'result'`：記錄 Stage 4 輸出（最終分派）
- **And** Transaction commit 成功後 UPDATE `assignment_run`（`status = 'completed'`, `finished_at = NOW()`, `total_cases = N`）

### AC-5：月跑失敗處理

- **Given** 月跑執行過程中任一 Stage 發生錯誤或快照寫入 Transaction 失敗
- **When** 錯誤被捕獲
- **Then** Transaction Rollback（若已進入快照階段）
- **And** UPDATE `assignment_run`（`status = 'failed'`, `error_message = 'Stage_X failed: {detail}'`）
- **And** F062 進度頁顯示失敗提示；業務主管可修正後重新觸發

### AC-6：同月併發執行防護

- **Given** 目前有 `status IN ('pending', 'running')` 的月跑
- **When** 業務主管再次點擊「執行月跑」
- **Then** 系統回傳 409 `ASSIGNMENT_RUN_ALREADY_RUNNING`，訊息：「分派執行中（run_id: {current}），請等待完成後再觸發」

### AC-7：允許 completed 狀態重跑

- **Given** 本月已有 `status = 'completed'` 的月跑（`run_id = 'prev-001'`）
- **When** 業務主管再次點擊「執行月跑」並確認
- **Then** 前置條件通過（completed 不阻擋重跑），系統建立新月跑並產生新 `run_id`（`'new-002'`）
- **And** 前次月跑快照（`'prev-001'`）完整保留於 `assignment_run_snapshot`，不被覆蓋或刪除

## 5. API 規格

### 5.1 POST /api/v1/assignment/runs

**Request Body**：空（或 `{ "confirm": true }` 用於前置檢查與確認的二階段呼叫 `[ASSUMPTION]`）。

**Response — 202 Accepted**

```json
{
  "runId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "pending",
  "projectWorkym": "202605",
  "triggeredAt": "2026-04-24T12:00:00Z"
}
```

**錯誤回應**

| HTTP | 錯誤碼 | 說明 |
|---|---|---|
| 401 | AUTH_TOKEN_MISSING | 未登入 |
| 403 | AUTH_FORBIDDEN | `is_sales_manager` 未啟用 |
| 409 | ASSIGNMENT_RUN_ALREADY_RUNNING | 同月已有 pending/running 月跑 |
| 422 | ASSIGNMENT_RUN_PRECHECK_FAILED | 前置條件失敗（回應含 details 陣列列出失敗項目） |

## 6. 商業規則

| 規則編號 | 說明 |
|---|---|
| BR-1 | 月跑採非同步執行（AD-E07-2）；API 回傳 202 後於背景 Promise chain 執行 |
| BR-2 | 同月僅允許一個 `status IN ('pending', 'running')` 紀錄；透過 DB UNIQUE constraint 或應用層檢查 |
| BR-3 | 三份快照在同一 DB Transaction 中寫入；任一失敗整體 Rollback，`assignment_run.status` 改為 `failed`（AD-E07-2） |
| BR-4 | 允許 completed 狀態重跑；前次快照保留 |
| BR-5 | 執行觸發不受日期限制（舊系統「每月 21 日後才能執行」的限制已移除） |
| BR-6 | Stage 3 的 CR 回分邏輯依 F059 開關狀態決定是否執行 |
| BR-7 | 複雜計分邏輯（Stage 2）由 PostgreSQL function 實作（AD-E07-3） |
| BR-8 | Stage 1~4 執行過程中，所有 E07 CRUD 操作鎖定（參見 F048/F050/F051/F052/F054~F060/F068 的月跑鎖規則） |

## 7. 效能需求

| 項目 | 閾值 | 參考 |
|---|---|---|
| 10 萬筆案件完整月跑時間 | < 30 分鐘 | NFR-003 |
| 快照三份寫入 Transaction 時間 | < 60 秒 | NFR-004 |
| 結果準確性（與舊 SP 誤差） | 人員配對不一致率 < 3% | NFR-005（由 F067 驗證） |

## 8. 錯誤場景

| 場景 | 系統回應 | 參考 |
|---|---|---|
| 前置條件失敗 | 422 `ASSIGNMENT_RUN_PRECHECK_FAILED` + details | error-handling.md#assignment-errors |
| 同月已有 running | 409 `ASSIGNMENT_RUN_ALREADY_RUNNING` | error-handling.md#assignment-errors |
| Stage X 執行失敗 | `assignment_run.status = 'failed'`；`error_message` 記錄 | — |
| 快照寫入失敗 | Transaction Rollback；`status = 'failed'` | — |

## 9. UI/UX 需求

- 執行月跑按鈕：頁首顯要位置
- 前置條件失敗：Modal 顯示失敗項目清單，提供跳轉修正入口（F060 / F058 / F048 等）
- 確認對話框：顯示本次執行的關鍵參數（作業年月 / active 名單數 / 計分版本）
- 觸發後自動跳轉 F062 進度頁

## 10. 相依性

- **Blocked By**：F048, F050, F054, F055, F058, F060（前置條件來源）、E04 + E05 雙層 ETL（`ob_pool_data` / `ob_emphire` / `ob_calendar` 資料來源，詳見 [architecture-spec.md §E07-C](../architecture-spec.md#e07-c-etl-設計)）
- **Blocks**：F062（進度）、F063（結果摘要）、F064（匯出）、F065（歷史清單）、F066（快照詳情）、F067（差異比對）

## 11. 交叉參考

- 資料模型：[data-model.md#e07-data-model](../data-model.md#e07-data-model)（`assignment_run`、`assignment_run_snapshot`、`ob_pool_data_list`）；[data-model.md#ob-emphire-entity](../data-model.md#ob-emphire-entity)（Stage 4 員工資料 join 來源，採 E04 + E05 雙層 ETL 同步）；[data-model.md#ob-calendar-entity](../data-model.md#ob-calendar-entity)（工作日表，Stage 0/1 期間計算）
- 錯誤處理：[error-handling.md#assignment-errors](../error-handling.md#assignment-errors)
- 非功能需求：[nfr.md](../nfr.md)（NFR-003 / NFR-004 / NFR-005）
- 流程圖：[diagrams/F061-assignment-run-flow.mmd](../diagrams/F061-assignment-run-flow.mmd)
- 狀態圖：[diagrams/F061-assignment-run-states.mmd](../diagrams/F061-assignment-run-states.mmd)
- 架構決策：AD-E07-1（OB 遷移）、AD-E07-2（非同步 + 快照原子性）、AD-E07-3（PostgreSQL function）
- 相關功能：F048, F050, F054, F055, F056, F058, F059, F060, F062, F063, F064, F065, F066, F067
