---
spec-id: F062
title: 查看分派執行進度
feature-id: F062
source-story: US-082
epic: E07
module: M04 分派執行
priority: P0-MVP
version: "1.0"
date: 2026-04-24
status: Draft
---

# F062: 查看分派執行進度

Priority: P0-MVP | Status: Draft | Last Updated: 2026-04-24

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `data-model.md#e07-data-model` + `error-handling.md#assignment-errors` |
| QA / Tester | 本文件 + `error-handling.md#assignment-errors` |
| UI/UX Designer | 本文件（第 7 節 UI/UX 需求） + `diagrams/F061-assignment-run-states.mmd` |
| Architect | 本文件 + `architecture-spec.md` §3.10 |

---

## 1. 功能摘要

提供業務主管在月跑執行期間即時查看各 Stage 的執行進度。採前端 Polling（預設每 3 秒輪詢一次，與 AD-E07-2 一致）。月跑完成顯示結果入口（連至 F063 / F064）；月跑失敗顯示錯誤訊息與重新觸發按鈕。

## 2. 使用者故事

**As a** 業務主管
**I want** 在月跑執行期間即時查看各 Stage 的執行進度
**So that** 了解月跑目前跑到哪個步驟、預估完成時間，不需要不斷詢問 IT

## 3. 前置條件

- 業務主管已登入並持有有效 JWT Token
- 目標 `run_id` 存在於 `assignment_run`

## 4. 驗收標準

### AC-1：顯示目前月跑執行狀態

- **Given** 月跑已觸發（F061），進度頁 URL 含 `run_id`
- **When** 業務主管進入執行進度頁
- **Then** 顯示月跑資訊：`run_id`、`project_workym`、`triggered_by`（觸發者名稱）、`triggered_at`（觸發時間）、目前 `status`、已執行時間
- **And** 顯示各 Stage 的執行進度列表（Stage 1 ~ Stage 4），每個 Stage 顯示：名稱、狀態（pending / running / completed / failed / skipped）、開始時間、結束時間、處理筆數

### AC-2：進度即時刷新

- **Given** 進度頁已開啟，月跑正在執行
- **When** 後端 Stage 狀態更新
- **Then** 前端透過 Polling（預設 3 秒間隔，可於環境變數 `ASSIGNMENT_PROGRESS_POLL_INTERVAL_MS` 配置）自動重新查詢進度
- **And** 月跑進入 `completed` / `failed` 狀態後，前端停止輪詢

### AC-3：月跑完成後顯示結果入口

- **Given** 月跑所有 Stage 完成（`status = 'completed'`）
- **When** 進度頁偵測到完成狀態
- **Then** 顯示「執行完成」提示，並提供快速連結：「查看結果摘要」（連至 F063）、「匯出結果」（連至 F064）、「查看快照詳情」（連至 F066）

### AC-4：月跑失敗顯示錯誤

- **Given** 月跑失敗（`status = 'failed'`）
- **When** 進度頁偵測到失敗狀態
- **Then** 顯示失敗提示，標示失敗的 Stage，並顯示 `error_message` 內容
- **And** 提供「重新觸發」按鈕（連回 F061，業務主管修正問題後可重試）

### AC-5：月跑 run_id 不存在

- **Given** URL 中的 `run_id` 不存在於 `assignment_run`
- **When** 業務主管進入進度頁
- **Then** 回傳 404 `ASSIGNMENT_RUN_NOT_FOUND`，前端顯示「找不到該月跑紀錄」

## 5. API 規格

### 5.1 GET /api/v1/assignment/runs/:runId

**Response — 200 OK**

```json
{
  "runId": "550e8400-e29b-41d4-a716-446655440000",
  "projectWorkym": "202605",
  "status": "running",
  "triggeredBy": "sales_manager_01",
  "triggeredAt": "2026-04-24T12:00:00Z",
  "startedAt": "2026-04-24T12:00:05Z",
  "finishedAt": null,
  "durationMs": null,
  "totalCases": null,
  "errorMessage": null,
  "stages": [
    { "stage": "Stage 1", "status": "completed", "startedAt": "...", "finishedAt": "...", "processedCount": 50000 },
    { "stage": "Stage 2", "status": "running",   "startedAt": "...", "finishedAt": null, "processedCount": null },
    { "stage": "Stage 3", "status": "pending",   "startedAt": null,  "finishedAt": null, "processedCount": null },
    { "stage": "Stage 4", "status": "pending",   "startedAt": null,  "finishedAt": null, "processedCount": null }
  ]
}
```

**錯誤回應**

| HTTP | 錯誤碼 | 說明 |
|---|---|---|
| 401 | AUTH_TOKEN_MISSING | 未登入 |
| 403 | AUTH_FORBIDDEN | `is_sales_manager` 未啟用 |
| 404 | ASSIGNMENT_RUN_NOT_FOUND | `run_id` 不存在 |

## 6. 商業規則

| 規則編號 | 說明 |
|---|---|
| BR-1 | Polling 間隔預設 3 秒（與 AD-E07-2 一致）；前端於完成/失敗後停止輪詢 |
| BR-2 | Stage 進度儲存於 `assignment_run` 的 `[ASSUMPTION]` stage_log JSONB 欄位或獨立 `assignment_run_stage_log` 表（由 system-architect 最終確認） |
| BR-3 | 進度查詢為唯讀，無任何寫入動作 |

## 7. UI/UX 需求

- 頁面頂部：月跑基本資訊卡片
- Stage 進度列表：使用狀態圖示（✓ completed / ⟳ running / ○ pending / ✕ failed）
- 已執行時間：即時計算（`NOW() - triggered_at`）
- 月跑完成後：顯示 CTA 連結至 F063 / F064 / F066
- 月跑失敗：紅色警示 + `error_message` + 「重新觸發」按鈕

## 8. 相依性

- **Blocked By**：F061（月跑已觸發才有 `run_id`）
- **Blocks**：無（進度頁為獨立查看功能）

## 9. 交叉參考

- 資料模型：[data-model.md#e07-data-model](../data-model.md#e07-data-model)（`assignment_run`）
- 錯誤處理：[error-handling.md#assignment-errors](../error-handling.md#assignment-errors)
- 狀態圖：[diagrams/F061-assignment-run-states.mmd](../diagrams/F061-assignment-run-states.mmd)
- 架構決策：AD-E07-2（非同步 Polling）
- 相關功能：[F061](F061-trigger-assignment-run.md)、[F063](F063-view-run-result-summary.md)、[F064](F064-export-assignment-result.md)、[F066](F066-view-run-snapshot-detail.md)
