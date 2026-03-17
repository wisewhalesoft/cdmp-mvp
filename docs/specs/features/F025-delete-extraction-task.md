---
spec-id: F025
title: 刪除擷取任務
feature-id: F025
source-story: US-038
epic: E04
priority: P1
version: "1.0"
date: 2026-03-17
status: Draft
---

# F025: 刪除擷取任務

## 1. 功能摘要

提供 Admin 刪除不再需要的擷取任務的功能。採用軟刪除機制（設定 `deleted_at` 時間戳記），刪除後任務從清單移除且排程不再觸發，但歷史執行日誌保留。

## 2. 使用者故事

**As a** Admin（管理者）
**I want** 刪除不再需要的擷取任務
**So that** 任務清單保持簡潔，僅顯示有效的任務

## 3. 前置條件

- Admin 已登入且具備 Admin 權限
- 目標擷取任務存在且未被軟刪除
- 目標擷取任務的 `status` 不為 `running`

## 4. 驗收標準

### AC-1: 成功刪除擷取任務

- **Given** Admin 在擷取任務清單頁面
- **When** Admin 點擊某任務的「刪除」按鈕並確認
- **Then** 系統執行軟刪除（設定 `deleted_at` 時間戳記），該任務從清單中移除，顯示成功訊息

### AC-2: 確認對話框

- **Given** Admin 點擊「刪除」按鈕
- **When** 確認對話框顯示
- **Then** 對話框顯示任務名稱與刪除影響說明（「刪除後此任務將停止排程執行，但歷史日誌將保留」），Admin 可選擇「確認刪除」或「取消」

### AC-3: 執行中不可刪除

- **Given** 某擷取任務的 `status` 為 `running`
- **When** Admin 嘗試刪除該任務
- **Then** 系統顯示「任務執行中，無法刪除」的提示訊息，刪除按鈕為停用狀態

### AC-4: 日誌保留

- **Given** 某擷取任務已被軟刪除
- **When** 查詢該任務的 ExtractionLog
- **Then** 歷史執行日誌仍保留於資料庫中（不隨任務刪除而清除）

## 5. 主要流程

1. Admin 在任務清單中點擊某任務的「刪除」按鈕
2. 系統顯示確認對話框，包含任務名稱與影響說明
3. Admin 點擊「確認刪除」
4. 系統發送 `DELETE /api/v1/extraction-tasks/:id`
5. 系統設定 `deleted_at = NOW()`（UTC 時間）
6. 系統顯示成功訊息，任務從清單中移除

## 6. 替代流程

- **取消刪除**：Admin 在確認對話框點擊「取消」，任務不被刪除

## 7. 邊界情況

- 任務在確認對話框顯示期間被觸發執行（status 變為 running）：提交時回傳 `409 Conflict`
- 已軟刪除的任務再次刪除：回傳 `404 Not Found`
- 刪除後排程引擎自動排除該任務（篩選條件已包含 `deleted_at IS NULL`）
- ExtractionLog 不受影響，透過 `task_id` 仍可查詢歷史紀錄

## 8. API 規格

### DELETE /api/v1/extraction-tasks/:id

**Request Headers:**

| Header        | 值                       | 必填 |
|---------------|--------------------------|------|
| Authorization | Bearer {token}           | 是   |

**Response — 200 OK:**

```json
{
  "message": "擷取任務已刪除"
}
```

**錯誤回應：**

| HTTP Status | 錯誤碼                 | 說明                               |
|-------------|------------------------|------------------------------------|
| 404         | EXTRACTION_NOT_FOUND   | 擷取任務不存在或已刪除             |
| 409         | EXTRACTION_RUNNING     | 任務執行中，無法刪除               |
| 403         | AUTH_FORBIDDEN         | 非 Admin 角色無權限操作            |
| 401         | AUTH_TOKEN_MISSING     | 未登入或 Token 無效                |
| 500         | SYSTEM_INTERNAL_ERROR  | 伺服器內部錯誤                     |

## 9. 商業規則

| 規則編號 | 說明 |
|----------|------|
| BR-1 | 僅具備 Admin 角色的使用者可刪除擷取任務 |
| BR-2 | `status` 為 `running` 的任務不允許刪除 |
| BR-3 | 採用軟刪除：設定 `deleted_at = NOW()`，不實際刪除資料列 |
| BR-4 | 刪除後排程引擎自動排除（篩選條件包含 `deleted_at IS NULL`） |
| BR-5 | ExtractionLog 不受軟刪除影響，歷史紀錄永久保留 |
| BR-6 | 名稱唯一性在軟刪除後釋放（其他任務可使用該名稱） |

## 10. UI/UX 需求

- 刪除按鈕位於任務清單每行末端的操作區域
- 執行中任務的刪除按鈕為停用狀態（灰色），hover 時顯示 tooltip「任務執行中，無法刪除」
- 刪除確認對話框：
  - 標題：「確認刪除擷取任務」
  - 內容：顯示任務名稱與影響說明
  - 按鈕：「確認刪除」（紅色）、「取消」

## 11. 錯誤場景

| 場景                         | 系統回應                                             | 參考                                    |
|------------------------------|------------------------------------------------------|-----------------------------------------|
| 任務執行中                   | HTTP 409，「任務執行中，無法刪除」                   | error-handling.md#extraction-errors      |
| 任務不存在                   | HTTP 404，「找不到指定的擷取任務」                   | error-handling.md#extraction-errors      |
| 非 Admin 操作                | HTTP 403，「您沒有權限執行此操作」                   | error-handling.md#auth-errors            |

## 12. 相依性

- **F017（建立擷取任務）**：需有擷取任務存在
- **F018（查看擷取任務清單）**：從清單進入刪除
- **認證系統**：需要有效的 Admin 登入 Session/Token

## 13. 資料需求

- ExtractionTask 實體：參見 [data-model.md#extraction-task-entity](../data-model.md#extraction-task-entity)

## 14. 交叉參考

- 資料模型：[data-model.md#extraction-task-entity](../data-model.md#extraction-task-entity)
- 錯誤處理：[error-handling.md#extraction-errors](../error-handling.md#extraction-errors)
- 相關功能：[F017](F017-create-extraction-task.md)、[F018](F018-view-extraction-task-list.md)
