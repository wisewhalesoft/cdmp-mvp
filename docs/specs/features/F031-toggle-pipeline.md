---
spec-id: F031
title: 啟用／停用 Pipeline
feature-id: F031
source-story: US-044
epic: E05
priority: P0-MVP
version: "1.0"
date: 2026-03-19
status: Draft
---

# F031: 啟用／停用 Pipeline

## 1. 功能摘要

提供 Admin 啟用或停用 Pipeline 的功能。啟用後 Pipeline 狀態變為 `active`，排程恢復；停用後狀態變為 `disabled`，排程暫停。草稿狀態（無已發布版本）的 Pipeline 不可啟用。

## 2. 使用者故事

**As a** Admin（管理者）
**I want** 啟用或停用 Pipeline
**So that** 我能控制哪些 Pipeline 在排程時自動執行，暫停不需要的 Pipeline

## 3. 前置條件

- Admin 已登入且具備 Admin 權限
- 目標 Pipeline 存在且未被軟刪除

## 4. 驗收標準

### AC-1: 停用 Pipeline

- **Given** 一個狀態為 `active` 且 `enabled = true` 的 Pipeline
- **When** Admin 點擊「停用」按鈕
- **Then** Pipeline 的 `enabled` 變為 `false`，`status` 變為 `disabled`，排程自動暫停

### AC-2: 啟用 Pipeline（已發布版本）

- **Given** 一個已有 `published` 版本且 `enabled = false` 的 Pipeline
- **When** Admin 點擊「啟用」按鈕
- **Then** Pipeline 的 `enabled` 變為 `true`，`status` 變為 `active`，排程恢復

### AC-3: 草稿不可啟用

- **Given** 一個狀態為 `draft`（無 `published` 版本）的 Pipeline
- **When** Admin 嘗試啟用
- **Then** 系統回傳 400 Bad Request，顯示「需先發布 Pipeline 才能啟用」

### AC-4: 狀態切換後排程同步更新

- **Given** Admin 切換了 Pipeline 的啟用/停用狀態
- **When** 操作完成
- **Then** 排程系統同步更新：停用時移除排程任務，啟用時註冊排程任務

## 5. 主要流程

1. Admin 在 Pipeline 列表或詳情頁面點擊「啟用」或「停用」按鈕
2. 系統檢查前置條件（啟用時檢查是否有 published 版本）
3. 系統更新 `enabled` 與 `status` 欄位
4. 系統同步更新排程引擎（註冊或移除排程任務）
5. 系統回傳更新後的 Pipeline 物件

## 6. 替代流程

- 無

## 7. 邊界情況

- failed 狀態的 Pipeline 停用後：`status` 變為 `disabled`
- disabled 狀態的 Pipeline 啟用時：需有 published 版本，啟用後 `status` 為 `active`
- running 狀態的 Pipeline：不影響（不會出現在啟用/停用操作中，因為 running 時按鈕為 disabled）

## 8. API 規格

### PATCH /api/v1/etl/pipelines/:id/toggle

**Request Headers:**

| Header        | 值                       | 必填 |
|---------------|--------------------------|------|
| Authorization | Bearer {token}           | 是   |
| Content-Type  | application/json         | 是   |

**Request Body:**

```json
{
  "enabled": true
}
```

**Response -- 200 OK:**

```json
{
  "id": "uuid",
  "name": "string",
  "status": "active",
  "enabled": true,
  "schedule": "0 2 * * *",
  "updatedAt": "ISO 8601"
}
```

**錯誤回應：**

| HTTP Status | 錯誤碼                         | 說明                               |
|-------------|--------------------------------|------------------------------------|
| 404         | PIPELINE_NOT_FOUND             | Pipeline 不存在或已刪除            |
| 400         | PIPELINE_DRAFT_CANNOT_ENABLE   | 需先發布 Pipeline 才能啟用         |
| 403         | AUTH_FORBIDDEN                 | 非 Admin 角色無權限操作            |
| 401         | AUTH_TOKEN_MISSING             | 未登入或 Token 無效                |
| 500         | SYSTEM_INTERNAL_ERROR          | 伺服器內部錯誤                     |

## 9. 商業規則

| 規則編號 | 說明 |
|----------|------|
| BR-1 | 僅具備 Admin 角色的使用者可啟用/停用 Pipeline |
| BR-2 | 啟用前提：Pipeline 必須有至少一個 `published` 狀態的版本 |
| BR-3 | 停用：`active` / `failed` -> `disabled`（`enabled = false`） |
| BR-4 | 啟用：`disabled` -> `active`（`enabled = true`） |
| BR-5 | 草稿（draft，無 published 版本）無法啟用 |
| BR-6 | 停用時排程引擎移除對應排程任務 |
| BR-7 | 啟用時排程引擎註冊對應排程任務 |

## 10. UI/UX 需求

- Pipeline 列表每行操作區提供「啟用」/「停用」切換按鈕
- 草稿 Pipeline 的啟用按鈕為 disabled 狀態，hover 時顯示 tooltip「需先發布 Pipeline 才能啟用」
- running 狀態的 Pipeline 啟用/停用按鈕為 disabled 狀態
- 切換操作無需確認對話框（即時切換）

## 11. 錯誤場景

| 場景                         | 系統回應                                             | 參考                                    |
|------------------------------|------------------------------------------------------|-----------------------------------------|
| Pipeline 不存在              | HTTP 404，「找不到指定的 Pipeline」                  | error-handling.md#etl-pipeline-errors    |
| 草稿啟用                     | HTTP 400，「需先發布 Pipeline 才能啟用」             | error-handling.md#etl-pipeline-errors    |
| 非 Admin 操作                | HTTP 403，「您沒有權限執行此操作」                   | error-handling.md#auth-errors            |

## 12. 相依性

- **F028（建立 Pipeline）**：需有 Pipeline 存在
- **F033（版本管理）**：啟用需有 published 版本
- **認證系統**：需要有效的 Admin 登入 Session/Token

## 13. 資料需求

- EtlPipeline 實體：參見 [data-model.md#etl-pipeline-entity](../data-model.md#etl-pipeline-entity)
- EtlPipelineVersion 實體：參見 [data-model.md#etl-pipeline-version-entity](../data-model.md#etl-pipeline-version-entity)

## 14. 交叉參考

- 資料模型：[data-model.md#etl-pipeline-entity](../data-model.md#etl-pipeline-entity)
- 錯誤處理：[error-handling.md#etl-pipeline-errors](../error-handling.md#etl-pipeline-errors)
- 相關功能：[F028](F028-create-pipeline.md)、[F030](F030-execute-pipeline.md)、[F033](F033-pipeline-version.md)
- 圖表：[diagrams/pipeline-states.md](../diagrams/pipeline-states.md)
