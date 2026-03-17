---
spec-id: F020
title: 啟用／停用擷取任務
feature-id: F020
source-story: US-033
epic: E04
priority: P0-MVP
version: "1.0"
date: 2026-03-17
status: Draft
---

# F020: 啟用／停用擷取任務

## 1. 功能摘要

提供 Admin 啟用或停用擷取任務的功能。停用的任務不會被排程引擎觸發，但仍可手動執行。啟用後任務恢復排程觸發。

## 2. 使用者故事

**As a** Admin（管理者）
**I want** 啟用或停用擷取任務
**So that** 我可以暫停不需要執行的任務，待需要時再重新啟用

## 3. 前置條件

- Admin 已登入且具備 Admin 權限
- 目標擷取任務存在且未被軟刪除

## 4. 驗收標準

### AC-1: 停用擷取任務

- **Given** Admin 在擷取任務清單頁面，某任務目前為啟用狀態
- **When** Admin 點擊該任務的「停用」按鈕並確認
- **Then** 系統將該任務的 `enabled` 設為 `false`，`status` 設為 `disabled`，顯示成功訊息，排程不再觸發該任務

### AC-2: 啟用擷取任務

- **Given** Admin 在擷取任務清單頁面，某任務目前為停用狀態
- **When** Admin 點擊該任務的「啟用」按鈕
- **Then** 系統將該任務的 `enabled` 設為 `true`，`status` 設為 `scheduled`，顯示成功訊息，排程恢復觸發該任務

### AC-3: 確認對話框

- **Given** Admin 點擊「停用」按鈕
- **When** 確認對話框顯示
- **Then** 對話框顯示任務名稱與停用影響說明（「停用後排程將不再自動觸發此任務」），Admin 可選擇「確認停用」或「取消」

### AC-4: 執行中任務不可停用

- **Given** 某擷取任務的 `status` 為 `running`
- **When** Admin 嘗試停用該任務
- **Then** 系統顯示「任務執行中，請等待完成後再停用」的提示訊息

## 5. 主要流程（停用）

1. Admin 在任務清單中點擊某已啟用任務的「停用」按鈕
2. 系統顯示確認對話框，包含任務名稱與影響說明
3. Admin 點擊「確認停用」
4. 系統發送 `PATCH /api/extraction-tasks/:id/toggle`，body: `{ "enabled": false }`
5. 系統更新任務 `enabled = false`、`status = 'disabled'`
6. 系統顯示成功訊息，清單即時更新

## 6. 主要流程（啟用）

1. Admin 在任務清單中點擊某已停用任務的「啟用」按鈕
2. 系統發送 `PATCH /api/extraction-tasks/:id/toggle`，body: `{ "enabled": true }`
3. 系統更新任務 `enabled = true`、`status = 'scheduled'`
4. 系統顯示成功訊息，清單即時更新

## 7. 替代流程

- **取消停用**：Admin 在確認對話框點擊「取消」，任務狀態不變
- **啟用不需確認**：啟用操作不顯示確認對話框，直接執行

## 8. 邊界情況

- 任務在確認對話框顯示期間被其他人觸發執行（status 變為 running）：提交時回傳 `409 Conflict`
- 停用已停用的任務：系統視為無操作，回傳 200 OK
- 啟用已啟用的任務：系統視為無操作，回傳 200 OK

## 9. API 規格

### PATCH /api/extraction-tasks/:id/toggle

**Request Headers:**

| Header        | 值                       | 必填 |
|---------------|--------------------------|------|
| Authorization | Bearer {token}           | 是   |
| Content-Type  | application/json         | 是   |

**Request Body:**

```json
{
  "enabled": true | false
}
```

**Response — 200 OK:**

回傳更新後的完整 ExtractionTask 物件。

**錯誤回應：**

| HTTP Status | 錯誤碼                 | 說明                               |
|-------------|------------------------|------------------------------------|
| 404         | EXTRACTION_NOT_FOUND   | 擷取任務不存在或已刪除             |
| 409         | EXTRACTION_RUNNING     | 任務執行中，無法停用               |
| 403         | AUTH_FORBIDDEN         | 非 Admin 角色無權限操作            |
| 401         | AUTH_TOKEN_MISSING     | 未登入或 Token 無效                |
| 500         | SYSTEM_INTERNAL_ERROR  | 伺服器內部錯誤                     |

## 10. 商業規則

| 規則編號 | 說明 |
|----------|------|
| BR-1 | 僅具備 Admin 角色的使用者可啟用／停用擷取任務 |
| BR-2 | `status` 為 `running` 的任務不允許停用 |
| BR-3 | 停用時：`enabled = false`，`status = 'disabled'` |
| BR-4 | 啟用時：`enabled = true`，`status = 'scheduled'` |
| BR-5 | 停用的任務排程引擎不觸發，但仍允許手動執行（F021） |
| BR-6 | 停用操作需確認對話框，啟用操作不需要 |

## 11. UI/UX 需求

- 啟用／停用按鈕依目前狀態動態切換文字與圖示
- 執行中任務的停用按鈕為停用狀態（灰色）
- 停用確認對話框包含任務名稱與影響說明
- 啟用操作直接執行，無需確認

## 12. 錯誤場景

| 場景                         | 系統回應                                             | 參考                                    |
|------------------------------|------------------------------------------------------|-----------------------------------------|
| 任務執行中                   | HTTP 409，「任務執行中，請等待完成後再停用」         | error-handling.md#extraction-errors      |
| 任務不存在                   | HTTP 404，「找不到指定的擷取任務」                   | error-handling.md#extraction-errors      |
| 非 Admin 操作                | HTTP 403，「您沒有權限執行此操作」                   | error-handling.md#auth-errors            |

## 13. 相依性

- **F017（建立擷取任務）**：需有擷取任務存在
- **F023（排程自動執行）**：排程引擎需檢查 `enabled` 狀態
- **認證系統**：需要有效的 Admin 登入 Session/Token

## 14. 交叉參考

- 資料模型：[data-model.md#extraction-task-entity](../data-model.md#extraction-task-entity)
- 錯誤處理：[error-handling.md#extraction-errors](../error-handling.md#extraction-errors)
- 相關功能：[F017](F017-create-extraction-task.md)、[F023](F023-scheduled-extraction.md)
