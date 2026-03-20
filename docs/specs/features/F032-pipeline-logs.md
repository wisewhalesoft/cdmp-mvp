---
spec-id: F032
title: 查看 Pipeline 日誌
feature-id: F032
source-story: US-045
epic: E05
priority: P0-MVP
version: "1.0"
date: 2026-03-19
status: Draft
---

# F032: 查看 Pipeline 日誌

## 1. 功能摘要

提供 Admin 查看 Pipeline 的執行歷史與詳細日誌。包含日誌列表（時間、版本、狀態、處理筆數、耗時、觸發方式）與日誌詳情（各節點的執行記錄）。測試執行記錄標示「測試」標籤，失敗記錄顯示錯誤訊息。

## 2. 使用者故事

**As a** Admin（管理者）
**I want** 查看 Pipeline 的執行歷史與詳細日誌
**So that** 我能掌握每次執行的結果、追蹤錯誤原因並進行問題排查

## 3. 前置條件

- Admin 已登入且具備 Admin 權限
- 目標 Pipeline 存在

## 4. 驗收標準

### AC-1: 日誌列表

- **Given** 一個已有執行紀錄的 Pipeline
- **When** Admin 進入該 Pipeline 的日誌頁面
- **Then** 系統顯示執行歷史列表，包含時間、版本、狀態、處理筆數、耗時、觸發方式（schedule / manual / test / retry）

### AC-2: 日誌詳情

- **Given** 日誌列表中有一筆執行記錄
- **When** Admin 點擊該筆記錄
- **Then** 系統顯示詳細日誌，包含每個節點的執行記錄（節點名稱、類型、狀態、處理筆數、耗時、錯誤訊息）

### AC-3: 測試執行標記

- **Given** 一筆執行記錄是透過測試執行產生的（`is_test_run = true`）
- **When** 日誌列表或詳情頁顯示該記錄
- **Then** 該記錄標示「測試」標籤，與正式執行記錄做視覺區分

### AC-4: 錯誤訊息顯示

- **Given** 一筆執行記錄的狀態為 `failed`
- **When** Admin 查看該筆日誌詳情
- **Then** 系統顯示錯誤訊息，方便問題排查

### AC-5: 分頁

- **Given** 執行歷史超過 10 筆
- **When** Admin 瀏覽日誌列表
- **Then** 系統以每頁 10 筆進行分頁，並提供分頁導航

### AC-6: 空狀態

- **Given** 一個尚未執行過的 Pipeline
- **When** Admin 進入該 Pipeline 的日誌頁面
- **Then** 系統顯示空狀態提示「尚無執行紀錄」

## 5. 主要流程

1. Admin 在 Pipeline 列表點擊某 Pipeline 的「日誌」按鈕或進入詳情頁的日誌頁籤
2. 系統載入該 Pipeline 的日誌列表（預設第 1 頁，每頁 10 筆，依時間降序）
3. Admin 點擊某筆日誌記錄
4. 系統顯示日誌詳情，包含各節點的執行記錄

## 6. 替代流程

- 無

## 7. 邊界情況

- 已軟刪除的 Pipeline 日誌仍可存取（透過直接 URL 或日誌 ID）
- 執行中的日誌記錄（status=running）：耗時與結束時間顯示為「-」

## 8. API 規格

### GET /api/v1/etl/pipelines/:id/logs

**Request Headers:**

| Header        | 值                       | 必填 |
|---------------|--------------------------|------|
| Authorization | Bearer {token}           | 是   |

**Query Parameters:**

| 參數 | 型別 | 必填 | 說明 |
|------|------|------|------|
| page | integer | 否 | 頁碼，預設 1 |
| pageSize | integer | 否 | 每頁筆數，預設 10 |

**Response -- 200 OK:**

```json
{
  "data": [
    {
      "id": "uuid",
      "version": 1,
      "status": "completed",
      "startedAt": "ISO 8601",
      "finishedAt": "ISO 8601",
      "durationMs": 5000,
      "processedCount": 1000,
      "triggeredBy": "manual",
      "isTestRun": false
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 10,
    "total": 25,
    "totalPages": 3
  }
}
```

### GET /api/v1/etl/logs/:logId

**Response -- 200 OK:**

```json
{
  "id": "uuid",
  "pipelineId": "uuid",
  "pipelineName": "string",
  "version": 1,
  "status": "completed",
  "startedAt": "ISO 8601",
  "finishedAt": "ISO 8601",
  "durationMs": 5000,
  "processedCount": 1000,
  "errorMessage": null,
  "triggeredBy": "manual",
  "isTestRun": false,
  "nodeLogs": [
    {
      "nodeId": "node-1",
      "nodeName": "Extract: raw_a3f2c1d4",
      "nodeType": "extract",
      "status": "completed",
      "processedCount": 1000,
      "durationMs": 2000,
      "errorMessage": null
    },
    {
      "nodeId": "node-2",
      "nodeName": "NULL 處理",
      "nodeType": "transform-null-handler",
      "status": "completed",
      "processedCount": 950,
      "durationMs": 1500,
      "errorMessage": null
    },
    {
      "nodeId": "node-3",
      "nodeName": "Load: customer_core",
      "nodeType": "load",
      "status": "completed",
      "processedCount": 950,
      "durationMs": 1500,
      "errorMessage": null
    }
  ]
}
```

**錯誤回應：**

| HTTP Status | 錯誤碼                 | 說明                               |
|-------------|------------------------|------------------------------------|
| 404         | PIPELINE_NOT_FOUND     | Pipeline 不存在或已刪除            |
| 403         | AUTH_FORBIDDEN         | 非 Admin 角色無權限操作            |
| 401         | AUTH_TOKEN_MISSING     | 未登入或 Token 無效                |
| 500         | SYSTEM_INTERNAL_ERROR  | 伺服器內部錯誤                     |

## 9. 商業規則

| 規則編號 | 說明 |
|----------|------|
| BR-1 | 僅具備 Admin 角色的使用者可查看 Pipeline 日誌 |
| BR-2 | 日誌列表依 `started_at` 降序排列 |
| BR-3 | 時區處理：後端儲存 UTC，前端顯示轉換為 UTC+8（Asia/Taipei） |
| BR-4 | 測試執行記錄標示「測試」標籤 |
| BR-5 | 日誌不隨 Pipeline 軟刪除而清除 |

## 10. UI/UX 需求

- 日誌列表每行顯示：執行時間、版本號、狀態 Badge、處理筆數、耗時、觸發方式 Badge
- 狀態 Badge：running（藍色）、completed（綠色）、failed（紅色）
- 觸發方式 Badge：manual（灰色）、schedule（藍色）、test（橘色）、retry（紫色）
- 測試執行記錄顯示「測試」標籤（橘色）
- 日誌詳情頁：頂部顯示摘要資訊，下方顯示各節點的執行記錄表格
- 失敗的節點以紅色高亮，顯示錯誤訊息
- 時間顯示格式：`YYYY-MM-DD HH:mm:ss`（UTC+8）
- 空狀態：顯示「尚無執行紀錄」提示

## 11. 錯誤場景

| 場景                         | 系統回應                                             | 參考                                    |
|------------------------------|------------------------------------------------------|-----------------------------------------|
| Pipeline 不存在              | HTTP 404，「找不到指定的 Pipeline」                  | error-handling.md#etl-pipeline-errors    |
| 非 Admin 操作                | HTTP 403，「您沒有權限執行此操作」                   | error-handling.md#auth-errors            |

## 12. 相依性

- **F030（執行 Pipeline）**：需有執行紀錄
- **認證系統**：需要有效的 Admin 登入 Session/Token

## 13. 資料需求

- EtlPipelineLog 實體：參見 [data-model.md#etl-pipeline-log-entity](../data-model.md#etl-pipeline-log-entity)

## 14. 交叉參考

- 資料模型：[data-model.md#etl-pipeline-log-entity](../data-model.md#etl-pipeline-log-entity)
- 錯誤處理：[error-handling.md#etl-pipeline-errors](../error-handling.md#etl-pipeline-errors)
- 相關功能：[F030](F030-execute-pipeline.md)、[F035](F035-pipeline-dashboard.md)
