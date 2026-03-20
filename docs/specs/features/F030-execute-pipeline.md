---
spec-id: F030
title: 執行 Pipeline
feature-id: F030
source-story: US-043
epic: E05
priority: P0-MVP
version: "1.0"
date: 2026-03-19
status: Draft
---

# F030: 執行 Pipeline

## 1. 功能摘要

提供 Admin 手動執行或測試執行 Pipeline，以及排程自動觸發執行。每次執行建立 EtlPipelineLog 記錄，前端以 Polling（5 秒間隔）查詢執行進度。支援重新執行失敗的 Pipeline，執行中不可重複觸發。

## 2. 使用者故事

**As a** Admin（管理者）
**I want** 手動或自動觸發 Pipeline 執行，並即時追蹤執行進度
**So that** 我能確認資料轉換流程正確運行，並在失敗時快速重新執行

## 3. 前置條件

- Admin 已登入且具備 Admin 權限
- 目標 Pipeline 存在且未被軟刪除
- Pipeline 已有 definition（至少包含一個節點）

## 4. 驗收標準

### AC-1: 手動執行已發布 Pipeline

- **Given** 一個狀態為 `active` 的 Pipeline
- **When** Admin 點擊「執行」按鈕
- **Then** 系統建立 EtlPipelineLog 記錄（`triggered_by = 'manual'`），開始執行 Pipeline，回傳 202 Accepted

### AC-2: 測試執行草稿 Pipeline

- **Given** 一個狀態為 `draft` 的 Pipeline
- **When** Admin 點擊「測試執行」按鈕
- **Then** 系統以 `is_test_run = true`、`triggered_by = 'test'` 執行 Pipeline，不影響正式資料統計

### AC-3: 執行進度即時更新

- **Given** 一個 Pipeline 正在執行中
- **When** Admin 在頁面觀看
- **Then** 前端以 Polling（5 秒間隔）查詢進度，顯示 processedCount / totalCount、進度百分比、當前處理節點

### AC-4: 執行中不可重複執行

- **Given** 一個 Pipeline 正在執行中（`status = running`）
- **When** Admin 嘗試再次執行同一 Pipeline
- **Then** 系統回傳 409 Conflict，提示「Pipeline 正在執行中」

### AC-5: 重新執行失敗的 Pipeline

- **Given** 一個 Pipeline 執行失敗（`status = failed`）
- **When** Admin 點擊「重新執行」按鈕
- **Then** 系統以 `triggered_by = 'retry'` 建立新的 EtlPipelineLog，重新執行 Pipeline

### AC-6: 排程自動觸發

- **Given** 一個 Pipeline 狀態為 `active` 且 `enabled = true`，排程時間到達
- **When** 排程觸發器執行
- **Then** 系統自動以 `triggered_by = 'schedule'` 執行 Pipeline，使用最新的 `published` 版本

### AC-7: 測試執行更新版本狀態

- **Given** 一個版本狀態為 `draft` 的 Pipeline
- **When** 測試執行成功完成
- **Then** 該版本的狀態自動從 `draft` 更新為 `testing`

## 5. 主要流程

1. Admin 在 Pipeline 列表或詳情頁面點擊「執行」或「測試執行」按鈕
2. 系統檢查 Pipeline 是否為 running 狀態
3. 系統檢查 Pipeline 是否有 definition
4. 系統建立 EtlPipelineLog 記錄（status=running）
5. 系統更新 EtlPipeline.status 為 running
6. 系統回傳 202 Accepted
7. 系統非同步開始執行 Pipeline（依序執行各節點）
8. 前端以 5 秒間隔 Polling 查詢進度
9. 執行完成後更新 EtlPipelineLog 與 EtlPipeline 狀態

## 6. 替代流程

- **排程觸發**：排程引擎每分鐘掃描符合條件的 Pipeline（`enabled=true AND deleted_at IS NULL AND status != running`），比對 cron 表達式，符合時自動觸發
- **測試執行**：草稿 Pipeline 的測試執行以 `is_test_run = true` 記錄，不計入正式統計

## 7. 邊界情況

- Pipeline definition 為空（無節點）時嘗試執行：回傳 422
- 排程觸發時 Pipeline 已在執行中：跳過本次觸發
- 執行中途失敗：記錄失敗節點的錯誤訊息，Pipeline 狀態設為 failed
- 測試執行的 processed_count 不計入 EtlPipeline.processed_count 統計

## 8. API 規格

### POST /api/v1/etl/pipelines/:id/execute

手動執行已發布 Pipeline。

**Request Headers:**

| Header        | 值                       | 必填 |
|---------------|--------------------------|------|
| Authorization | Bearer {token}           | 是   |

**Response -- 202 Accepted:**

```json
{
  "logId": "uuid",
  "message": "Pipeline 已開始執行"
}
```

### POST /api/v1/etl/pipelines/:id/test

測試執行草稿 Pipeline。

**Request Headers:**

| Header        | 值                       | 必填 |
|---------------|--------------------------|------|
| Authorization | Bearer {token}           | 是   |

**Response -- 202 Accepted:**

```json
{
  "logId": "uuid",
  "message": "Pipeline 測試執行已開始"
}
```

### GET /api/v1/etl/pipelines/:id/progress

查詢執行進度。

**Response -- 200 OK:**

```json
{
  "logId": "uuid",
  "status": "running",
  "processedCount": 500,
  "totalCount": 1000,
  "progressPercent": 50.0,
  "currentNode": "node-2",
  "currentNodeName": "NULL 處理"
}
```

**錯誤回應（所有執行端點）：**

| HTTP Status | 錯誤碼                     | 說明                               |
|-------------|----------------------------|------------------------------------|
| 404         | PIPELINE_NOT_FOUND         | Pipeline 不存在或已刪除            |
| 409         | PIPELINE_RUNNING           | Pipeline 正在執行中                |
| 422         | PIPELINE_NO_DEFINITION     | Pipeline 尚未定義節點              |
| 403         | AUTH_FORBIDDEN             | 非 Admin 角色無權限操作            |
| 401         | AUTH_TOKEN_MISSING         | 未登入或 Token 無效                |
| 500         | SYSTEM_INTERNAL_ERROR      | 伺服器內部錯誤                     |

## 9. 商業規則

| 規則編號 | 說明 |
|----------|------|
| BR-1 | 僅具備 Admin 角色的使用者可執行 Pipeline |
| BR-2 | `status` 為 `running` 的 Pipeline 不允許重複執行 |
| BR-3 | 草稿 Pipeline 允許測試執行（`is_test_run = true`），不被排程觸發 |
| BR-4 | 排程執行使用最新的 `published` 版本 |
| BR-5 | `triggered_by` 區分觸發來源：`manual`、`test`、`schedule`、`retry` |
| BR-6 | 測試執行成功後，版本狀態從 `draft` 更新為 `testing` |
| BR-7 | 測試執行的 processed_count 不計入 Pipeline 累計統計 |
| BR-8 | 排程沿用 `@nestjs/schedule` 模組 |
| BR-9 | 執行中途失敗時，已成功處理的節點資料保留，Pipeline 狀態設為 `failed` |

## 10. UI/UX 需求

- Pipeline 列表每行提供「執行」按鈕（active 狀態）或「測試執行」按鈕（draft 狀態）
- 執行中的 Pipeline 顯示進度條與百分比
- 執行中按鈕顯示為 disabled 狀態
- 失敗的 Pipeline 顯示「重新執行」按鈕
- 進度資訊：已處理筆數 / 總筆數、百分比、當前節點名稱
- Polling 間隔：5 秒，偵測到 completed/failed 狀態後停止 Polling

## 11. 錯誤場景

| 場景                         | 系統回應                                             | 參考                                    |
|------------------------------|------------------------------------------------------|-----------------------------------------|
| Pipeline 不存在              | HTTP 404，「找不到指定的 Pipeline」                  | error-handling.md#etl-pipeline-errors    |
| Pipeline 執行中重複執行      | HTTP 409，「Pipeline 正在執行中」                    | error-handling.md#etl-pipeline-errors    |
| Pipeline 未定義節點          | HTTP 422，「Pipeline 尚未定義節點，無法執行」        | error-handling.md#etl-pipeline-errors    |
| 節點執行失敗                 | Pipeline 標記 failed，EtlPipelineLog 記錄錯誤       | error-handling.md#etl-pipeline-errors    |
| 非 Admin 操作                | HTTP 403，「您沒有權限執行此操作」                   | error-handling.md#auth-errors            |

## 12. 相依性

- **F029（Pipeline 編輯器）**：需有 Pipeline definition
- **F036（目標表）**：Load 節點寫入目標表
- **認證系統**：需要有效的 Admin 登入 Session/Token
- 封鎖：F032, F035

## 13. 資料需求

- EtlPipeline 實體：參見 [data-model.md#etl-pipeline-entity](../data-model.md#etl-pipeline-entity)
- EtlPipelineLog 實體：參見 [data-model.md#etl-pipeline-log-entity](../data-model.md#etl-pipeline-log-entity)

## 14. 交叉參考

- 資料模型：[data-model.md#etl-pipeline-entity](../data-model.md#etl-pipeline-entity)、[data-model.md#etl-pipeline-log-entity](../data-model.md#etl-pipeline-log-entity)
- 錯誤處理：[error-handling.md#etl-pipeline-errors](../error-handling.md#etl-pipeline-errors)
- 非功能需求：[nfr.md](../nfr.md)
- 相關功能：[F029](F029-pipeline-editor.md)、[F031](F031-toggle-pipeline.md)、[F032](F032-pipeline-logs.md)
- 圖表：[diagrams/pipeline-execution-flow.md](../diagrams/pipeline-execution-flow.md)
