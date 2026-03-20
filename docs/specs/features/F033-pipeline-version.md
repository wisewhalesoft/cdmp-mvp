---
spec-id: F033
title: Pipeline 版本管理
feature-id: F033
source-story: US-046
epic: E05
priority: P1
version: "1.0"
date: 2026-03-19
status: Draft
---

# F033: Pipeline 版本管理

## 1. 功能摘要

提供 Admin 管理 Pipeline 的版本歷史，包括查看版本清單、Diff 比對（節點增刪改差異）、回滾到指定版本、以及版本發布流程（draft -> testing -> published）。發布前必須通過測試執行。排程引擎僅使用最新的 published 版本。

## 2. 使用者故事

**As a** Admin（管理者）
**I want** 管理 Pipeline 的版本歷史，包括查看差異、回滾與發布流程
**So that** 我能安全地迭代 Pipeline 設定，並確保只有經過測試驗證的版本才會被排程執行

## 3. 前置條件

- Admin 已登入且具備 Admin 權限
- 目標 Pipeline 存在且未被軟刪除

## 4. 驗收標準

### AC-1: 版本歷史清單

- **Given** 一個已有多個版本的 Pipeline
- **When** Admin 進入版本管理頁面
- **Then** 系統顯示版本歷史清單，包含版號、時間、變更摘要、狀態（draft / testing / published）、建立者

### AC-2: 版本 Diff 比對視圖

- **Given** 一個有兩個以上版本的 Pipeline
- **When** Admin 選擇兩個版本進行比對
- **Then** 系統以左右對照方式顯示節點的增刪改差異

### AC-3: 回滾到指定版本

- **Given** 一個有歷史版本的 Pipeline
- **When** Admin 選擇某個舊版本並點擊「回滾」
- **Then** 系統建立一個新版本，內容複製自該舊版本（非覆蓋），狀態為 `draft`

### AC-4: 發布版本

- **Given** 一個狀態為 `testing` 且已通過測試執行的版本
- **When** Admin 點擊「發布」
- **Then** 該版本狀態變為 `published`，EtlPipeline.version 更新為此版本號，成為排程執行的版本

### AC-5: 發布前需通過測試執行

- **Given** 一個狀態為 `draft` 或 `testing` 但尚未通過測試的版本
- **When** Admin 嘗試發布該版本
- **Then** 系統阻止發布並提示「請先完成測試執行」

### AC-6: 僅 published 版本被排程執行

- **Given** 一個 Pipeline 有多個版本
- **When** 排程引擎觸發執行
- **Then** 系統使用最新的 `published` 版本執行，`draft` 和 `testing` 版本不會被排程執行

## 5. 主要流程

1. Admin 在 Pipeline 詳情頁面進入「版本」頁籤
2. 系統顯示版本歷史清單
3. Admin 可選擇兩個版本進行 Diff 比對
4. Admin 可選擇舊版本進行回滾（建立新版本）
5. Admin 可對 testing 版本執行發布

## 6. 替代流程

- **回滾後編輯**：回滾建立的新版本為 draft 狀態，Admin 可進入編輯器修改後再測試發布

## 7. 邊界情況

- 只有一個版本時：Diff 功能不可用（需至少兩個版本）
- 回滾到最新版本的前一個版本：仍建立新版本，版本號遞增
- 發布新版本時，舊的 published 版本保留原狀態不變

## 8. API 規格

### GET /api/v1/etl/pipelines/:id/versions

**Response -- 200 OK:**

```json
{
  "data": [
    {
      "id": "uuid",
      "version": 2,
      "status": "published",
      "changeSummary": "新增 NULL 處理節點",
      "createdBy": "string (使用者姓名)",
      "createdAt": "ISO 8601"
    },
    {
      "id": "uuid",
      "version": 1,
      "status": "published",
      "changeSummary": "初始版本",
      "createdBy": "string",
      "createdAt": "ISO 8601"
    }
  ]
}
```

### GET /api/v1/etl/pipelines/:id/versions/:versionId

**Response -- 200 OK:**

```json
{
  "id": "uuid",
  "pipelineId": "uuid",
  "version": 1,
  "status": "published",
  "definition": { "nodes": [], "edges": [] },
  "changeSummary": "初始版本",
  "createdBy": "string",
  "createdAt": "ISO 8601"
}
```

### GET /api/v1/etl/pipelines/:id/versions/diff?from=1&to=2

**Query Parameters:**

| 參數 | 型別 | 必填 | 說明 |
|------|------|------|------|
| from | integer | 是 | 來源版本號 |
| to | integer | 是 | 目標版本號 |

**Response -- 200 OK:**

```json
{
  "from": 1,
  "to": 2,
  "changes": {
    "nodesAdded": [
      {
        "nodeId": "node-4",
        "nodeType": "transform-null-handler",
        "nodeName": "NULL 處理"
      }
    ],
    "nodesRemoved": [],
    "nodesModified": [
      {
        "nodeId": "node-2",
        "field": "data.strategy",
        "oldValue": "default_value",
        "newValue": "remove_row"
      }
    ],
    "edgesAdded": [
      { "source": "node-3", "target": "node-4" }
    ],
    "edgesRemoved": []
  }
}
```

### POST /api/v1/etl/pipelines/:id/versions/:versionId/rollback

**Response -- 201 Created:**

```json
{
  "id": "uuid",
  "version": 3,
  "status": "draft",
  "changeSummary": "回滾自版本 1",
  "createdAt": "ISO 8601"
}
```

### PATCH /api/v1/etl/pipelines/:id/versions/:versionId/publish

**Response -- 200 OK:**

```json
{
  "id": "uuid",
  "version": 2,
  "status": "published",
  "publishedAt": "ISO 8601"
}
```

**錯誤回應：**

| HTTP Status | 錯誤碼                           | 說明                               |
|-------------|----------------------------------|------------------------------------|
| 404         | PIPELINE_NOT_FOUND               | Pipeline 不存在或已刪除            |
| 404         | PIPELINE_VERSION_NOT_FOUND       | 版本不存在                         |
| 422         | PIPELINE_PUBLISH_REQUIRES_TEST   | 需先完成測試執行                   |
| 403         | AUTH_FORBIDDEN                   | 非 Admin 角色無權限操作            |
| 401         | AUTH_TOKEN_MISSING               | 未登入或 Token 無效                |
| 500         | SYSTEM_INTERNAL_ERROR            | 伺服器內部錯誤                     |

## 9. 商業規則

| 規則編號 | 說明 |
|----------|------|
| BR-1 | 僅具備 Admin 角色的使用者可管理版本 |
| BR-2 | 版本狀態流程：`draft` -> `testing` -> `published` |
| BR-3 | 發布前必須至少完成一次成功的測試執行 |
| BR-4 | 回滾建立新版本（內容複製），不修改舊版本 |
| BR-5 | 排程引擎僅使用最新的 `published` 版本 |
| BR-6 | 發布新版本時更新 EtlPipeline.version 為新版本號 |
| BR-7 | 版本清單依版本號降序排列 |

## 10. UI/UX 需求

- 版本清單表格：版號、時間、摘要、狀態 Badge、建立者、操作按鈕
- 狀態 Badge：draft（灰色）、testing（橘色）、published（綠色）
- Diff 視圖：左右對照，新增節點以綠色標示、刪除以紅色標示、修改以黃色標示
- 回滾按鈕：顯示確認對話框「將回滾至版本 N，系統將建立一個新的草稿版本」
- 發布按鈕：僅在 `testing` 狀態的版本上顯示
- 時間顯示格式：`YYYY-MM-DD HH:mm`（UTC+8）

## 11. 錯誤場景

| 場景                         | 系統回應                                             | 參考                                    |
|------------------------------|------------------------------------------------------|-----------------------------------------|
| Pipeline 不存在              | HTTP 404，「找不到指定的 Pipeline」                  | error-handling.md#etl-pipeline-errors    |
| 版本不存在                   | HTTP 404，「找不到指定的版本」                       | error-handling.md#etl-pipeline-errors    |
| 未通過測試即發布             | HTTP 422，「請先完成測試執行」                       | error-handling.md#etl-pipeline-errors    |
| 非 Admin 操作                | HTTP 403，「您沒有權限執行此操作」                   | error-handling.md#auth-errors            |

## 12. 相依性

- **F029（Pipeline 編輯器）**：版本定義來自編輯器儲存
- **F030（執行 Pipeline）**：發布前需通過測試執行
- **認證系統**：需要有效的 Admin 登入 Session/Token

## 13. 資料需求

- EtlPipelineVersion 實體：參見 [data-model.md#etl-pipeline-version-entity](../data-model.md#etl-pipeline-version-entity)

## 14. 交叉參考

- 資料模型：[data-model.md#etl-pipeline-version-entity](../data-model.md#etl-pipeline-version-entity)
- 錯誤處理：[error-handling.md#etl-pipeline-errors](../error-handling.md#etl-pipeline-errors)
- 相關功能：[F029](F029-pipeline-editor.md)、[F030](F030-execute-pipeline.md)、[F031](F031-toggle-pipeline.md)
- 圖表：[diagrams/pipeline-version-states.md](../diagrams/pipeline-version-states.md)
