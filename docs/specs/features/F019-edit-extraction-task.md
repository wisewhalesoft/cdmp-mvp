---
spec-id: F019
title: 編輯擷取任務
feature-id: F019
source-story: US-032
epic: E04
priority: P0-MVP
version: "1.0"
date: 2026-03-17
status: Draft
---

# F019: 編輯擷取任務

## 1. 功能摘要

提供 Admin 編輯已建立的擷取任務設定的功能。Admin 可修改任務名稱、資料來源、擷取模式、目標資料表、排程等參數，但執行中的任務不允許編輯。

## 2. 使用者故事

**As a** Admin（管理者）
**I want** 編輯已建立的擷取任務設定
**So that** 我可以調整任務參數以符合變更的需求

## 3. 前置條件

- Admin 已登入且具備 Admin 權限
- 目標擷取任務存在且未被軟刪除
- 目標擷取任務的 `status` 不為 `running`

## 4. 驗收標準

### AC-1: 成功編輯擷取任務

- **Given** Admin 在擷取任務清單頁面
- **When** Admin 點擊某任務的「編輯」按鈕，修改欄位後點擊「儲存」
- **Then** 系統更新擷取任務設定，顯示成功訊息，清單反映最新資料

### AC-2: 執行中不可編輯

- **Given** 某擷取任務的 `status` 為 `running`
- **When** Admin 嘗試編輯該任務
- **Then** 系統顯示「任務執行中，無法編輯」的提示訊息，編輯按鈕為停用狀態

### AC-3: 編輯時保留既有欄位值

- **Given** Admin 開啟某任務的編輯表單
- **When** 表單載入完成
- **Then** 所有欄位預先填入該任務的目前設定值

### AC-4: 編輯時的欄位驗證

- **Given** Admin 在編輯擷取任務表單
- **When** Admin 修改欄位後提交，有必填欄位為空或格式不合規
- **Then** 系統針對每個不合規欄位顯示具體的驗證錯誤訊息

## 5. 主要流程

1. Admin 在擷取任務清單中點擊某任務的「編輯」按鈕
2. 系統發送 `GET /api/extraction-tasks/:id` 取得任務詳細資料
3. 系統顯示編輯表單，所有欄位預先填入既有值
4. Admin 修改所需欄位
5. Admin 點擊「儲存」
6. 系統執行欄位驗證
7. 系統檢查名稱唯一性（排除自身）
8. 系統更新擷取任務
9. 系統顯示成功訊息，導回任務清單

## 6. 替代流程

- **切換擷取模式**：從全量切換至增量時，動態顯示增量欄位輸入框；從增量切換至全量時，清除增量欄位值

## 7. 邊界情況

- 編輯表單開啟後，任務在其他地方被觸發執行（status 變為 running）：提交時回傳 `409 Conflict`
- 名稱唯一性檢查需排除自身（`WHERE name = :name AND id != :id AND deleted_at IS NULL`）
- 變更擷取模式從 incremental 到 full 時，`incrementalColumn` 與 `lastIncrementalValue` 保留但不作為執行依據

## 8. API 規格

### PATCH /api/extraction-tasks/:id

**Request Headers:**

| Header        | 值                       | 必填 |
|---------------|--------------------------|------|
| Authorization | Bearer {token}           | 是   |
| Content-Type  | application/json         | 是   |

**Request Body（僅包含需更新的欄位）：**

```json
{
  "name": "string",
  "datasourceId": "uuid",
  "mode": "full | incremental",
  "targetTable": "string",
  "schedule": "string",
  "incrementalColumn": "string",
  "lastIncrementalValue": "string"
}
```

**Response — 200 OK:**

回傳更新後的完整 ExtractionTask 物件（格式同 F017 Response）。

**錯誤回應：**

| HTTP Status | 錯誤碼                           | 說明                               |
|-------------|----------------------------------|------------------------------------|
| 404         | EXTRACTION_NOT_FOUND             | 擷取任務不存在或已刪除             |
| 409         | EXTRACTION_NAME_EXISTS           | 擷取任務名稱已存在                 |
| 409         | EXTRACTION_RUNNING               | 任務執行中，無法編輯               |
| 422         | VALIDATION_ERROR                 | 欄位驗證失敗                       |
| 422         | EXTRACTION_DATASOURCE_NOT_FOUND  | 指定的資料來源不存在或已刪除       |
| 403         | AUTH_FORBIDDEN                   | 非 Admin 角色無權限操作            |
| 401         | AUTH_TOKEN_MISSING               | 未登入或 Token 無效                |
| 500         | SYSTEM_INTERNAL_ERROR            | 伺服器內部錯誤                     |

## 9. 商業規則

| 規則編號 | 說明 |
|----------|------|
| BR-1 | 僅具備 Admin 角色的使用者可編輯擷取任務 |
| BR-2 | `status` 為 `running` 的任務不允許編輯 |
| BR-3 | 名稱唯一性驗證須排除自身 |
| BR-4 | 增量模式下 `incrementalColumn` 為必填 |
| BR-5 | 時區處理：後端儲存 UTC 時間，前端顯示時轉換為 UTC+8 |

## 10. UI/UX 需求

- 編輯表單與建立表單結構一致，所有欄位預先填入既有值
- 執行中任務的編輯按鈕為停用狀態（灰色），hover 時顯示 tooltip「任務執行中，無法編輯」
- 表單提交期間顯示 loading 狀態，防止重複提交

## 11. 錯誤場景

| 場景                         | 系統回應                                             | 參考                                    |
|------------------------------|------------------------------------------------------|-----------------------------------------|
| 任務執行中                   | HTTP 409，「任務執行中，無法編輯」                   | error-handling.md#extraction-errors      |
| 任務不存在                   | HTTP 404，「找不到指定的擷取任務」                   | error-handling.md#extraction-errors      |
| 名稱重複                     | HTTP 409，「此名稱的擷取任務已存在」                 | error-handling.md#extraction-errors      |
| 欄位驗證失敗                 | HTTP 422，附各欄位錯誤訊息                           | error-handling.md#validation-errors      |
| 非 Admin 操作                | HTTP 403，「您沒有權限執行此操作」                   | error-handling.md#auth-errors            |

## 12. 相依性

- **F017（建立擷取任務）**：需有擷取任務存在
- **F018（查看擷取任務清單）**：從清單進入編輯
- **認證系統**：需要有效的 Admin 登入 Session/Token

## 13. 資料需求

- ExtractionTask 實體：參見 [data-model.md#extraction-task-entity](../data-model.md#extraction-task-entity)

## 14. 交叉參考

- 資料模型：[data-model.md#extraction-task-entity](../data-model.md#extraction-task-entity)
- 錯誤處理：[error-handling.md#extraction-errors](../error-handling.md#extraction-errors)
- 相關功能：[F017](F017-create-extraction-task.md)、[F018](F018-view-extraction-task-list.md)
