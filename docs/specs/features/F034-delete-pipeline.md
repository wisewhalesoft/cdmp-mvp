---
spec-id: F034
title: 刪除 Pipeline
feature-id: F034
source-story: US-047
epic: E05
priority: P1
version: "1.0"
date: 2026-03-19
status: Draft
---

# F034: 刪除 Pipeline

## 1. 功能摘要

提供 Admin 刪除不再需要的 Pipeline 的功能。採用軟刪除機制（設定 `deleted_at` 時間戳記），刪除後 Pipeline 從列表移除且排程不再觸發，但歷史執行日誌保留。

## 2. 使用者故事

**As a** Admin（管理者）
**I want** 刪除不再需要的 Pipeline
**So that** Pipeline 清單保持簡潔，同時保留歷史日誌供日後查閱

## 3. 前置條件

- Admin 已登入且具備 Admin 權限
- 目標 Pipeline 存在且未被軟刪除
- 目標 Pipeline 的 `status` 不為 `running`

## 4. 驗收標準

### AC-1: 成功刪除

- **Given** 一個狀態非 `running` 的 Pipeline
- **When** Admin 確認刪除該 Pipeline
- **Then** 系統執行軟刪除（設定 `deleted_at` 時間戳記），Pipeline 從列表中消失，排程引擎自動排除

### AC-2: 確認對話框

- **Given** Admin 點擊刪除按鈕
- **When** 系統彈出確認對話框
- **Then** 對話框顯示 Pipeline 名稱與影響說明（「刪除後排程將停止，歷史日誌將保留」），需使用者確認後才執行

### AC-3: 執行中不可刪除

- **Given** 一個狀態為 `running` 的 Pipeline
- **When** Admin 嘗試刪除該 Pipeline
- **Then** 系統回傳 409 Conflict，提示「Pipeline 正在執行中，無法刪除」

### AC-4: 日誌保留

- **Given** 一個已被軟刪除的 Pipeline
- **When** 查詢該 Pipeline 的歷史日誌
- **Then** 歷史執行日誌仍可存取，不因刪除而遺失

## 5. 主要流程

1. Admin 在 Pipeline 列表中點擊某 Pipeline 的「刪除」按鈕
2. 系統顯示確認對話框，包含 Pipeline 名稱與影響說明
3. Admin 點擊「確認刪除」
4. 系統發送 `DELETE /api/v1/etl/pipelines/:id`
5. 系統設定 `deleted_at = NOW()`（UTC 時間）
6. 系統顯示成功訊息，Pipeline 從列表中移除

## 6. 替代流程

- **取消刪除**：Admin 在確認對話框點擊「取消」，Pipeline 不被刪除

## 7. 邊界情況

- Pipeline 在確認對話框顯示期間被觸發執行（status 變為 running）：提交時回傳 409 Conflict
- 已軟刪除的 Pipeline 再次刪除：回傳 404 Not Found
- 刪除後排程引擎自動排除（篩選條件已包含 `deleted_at IS NULL`）
- EtlPipelineLog 不受影響，透過 `pipeline_id` 仍可查詢歷史紀錄
- 名稱唯一性在軟刪除後釋放

## 8. API 規格

### DELETE /api/v1/etl/pipelines/:id

**Request Headers:**

| Header        | 值                       | 必填 |
|---------------|--------------------------|------|
| Authorization | Bearer {token}           | 是   |

**Response -- 200 OK:**

```json
{
  "message": "Pipeline 已刪除"
}
```

**錯誤回應：**

| HTTP Status | 錯誤碼                 | 說明                               |
|-------------|------------------------|------------------------------------|
| 404         | PIPELINE_NOT_FOUND     | Pipeline 不存在或已刪除            |
| 409         | PIPELINE_RUNNING       | Pipeline 正在執行中，無法刪除      |
| 403         | AUTH_FORBIDDEN         | 非 Admin 角色無權限操作            |
| 401         | AUTH_TOKEN_MISSING     | 未登入或 Token 無效                |
| 500         | SYSTEM_INTERNAL_ERROR  | 伺服器內部錯誤                     |

## 9. 商業規則

| 規則編號 | 說明 |
|----------|------|
| BR-1 | 僅具備 Admin 角色的使用者可刪除 Pipeline |
| BR-2 | `status` 為 `running` 的 Pipeline 不允許刪除 |
| BR-3 | 採用軟刪除：設定 `deleted_at = NOW()`，不實際刪除資料列 |
| BR-4 | 刪除後排程引擎自動排除（篩選條件包含 `deleted_at IS NULL`） |
| BR-5 | EtlPipelineLog 不受軟刪除影響，歷史紀錄永久保留 |
| BR-6 | 名稱唯一性在軟刪除後釋放（其他 Pipeline 可使用該名稱） |

## 10. UI/UX 需求

- 刪除按鈕位於 Pipeline 列表每行末端的操作區域
- 執行中 Pipeline 的刪除按鈕為停用狀態（灰色），hover 時顯示 tooltip「Pipeline 正在執行中，無法刪除」
- 刪除確認對話框：
  - 標題：「確認刪除 Pipeline」
  - 內容：顯示 Pipeline 名稱與影響說明
  - 按鈕：「確認刪除」（紅色）、「取消」

## 11. 錯誤場景

| 場景                         | 系統回應                                             | 參考                                    |
|------------------------------|------------------------------------------------------|-----------------------------------------|
| Pipeline 執行中              | HTTP 409，「Pipeline 正在執行中，無法刪除」          | error-handling.md#etl-pipeline-errors    |
| Pipeline 不存在              | HTTP 404，「找不到指定的 Pipeline」                  | error-handling.md#etl-pipeline-errors    |
| 非 Admin 操作                | HTTP 403，「您沒有權限執行此操作」                   | error-handling.md#auth-errors            |

## 12. 相依性

- **F028（建立 Pipeline）**：需有 Pipeline 存在
- **認證系統**：需要有效的 Admin 登入 Session/Token

## 13. 資料需求

- EtlPipeline 實體：參見 [data-model.md#etl-pipeline-entity](../data-model.md#etl-pipeline-entity)

## 14. 交叉參考

- 資料模型：[data-model.md#etl-pipeline-entity](../data-model.md#etl-pipeline-entity)
- 錯誤處理：[error-handling.md#etl-pipeline-errors](../error-handling.md#etl-pipeline-errors)
- 相關功能：[F028](F028-create-pipeline.md)、[F027](F027-pipeline-list.md)
