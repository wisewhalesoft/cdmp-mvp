---
spec-id: F022
title: 查看擷取日誌
feature-id: F022
source-story: US-035
epic: E04
priority: P0-MVP
version: "1.0"
date: 2026-03-17
status: Draft
---

# F022: 查看擷取日誌

## 1. 功能摘要

提供 Admin 查看特定擷取任務的執行歷史日誌的功能。日誌以 Modal 或 Drawer 方式呈現，顯示每次執行的結果、時間、擷取筆數與錯誤資訊，支援分頁瀏覽。

## 2. 使用者故事

**As a** Admin（管理者）
**I want** 查看擷取任務的執行日誌歷史
**So that** 我可以追蹤每次執行的結果、排查失敗原因、並掌握任務的歷史表現

## 3. 前置條件

- Admin 已登入且具備 Admin 權限
- 目標擷取任務存在（含已軟刪除的任務，日誌仍可查看）

## 4. 驗收標準

### AC-1: 開啟日誌面板

- **Given** Admin 在擷取任務清單頁面
- **When** Admin 點擊某任務的「查看日誌」按鈕
- **Then** 系統以 Modal 或 Drawer 開啟該任務的執行歷史日誌面板

### AC-2: 日誌列表顯示

- **Given** 日誌面板已開啟
- **When** Admin 瀏覽日誌列表
- **Then** 每筆日誌顯示：開始時間、結束時間、狀態（顏色標記）、執行時間（duration_ms）、擷取筆數、觸發方式（manual / schedule / retry），並以時間倒序排列

### AC-3: 失敗日誌詳細資訊

- **Given** 日誌列表中有 `failed` 狀態的日誌
- **When** Admin 點擊該筆日誌或展開詳細
- **Then** 系統顯示完整的錯誤訊息（error_message）

### AC-4: 日誌分頁

- **Given** 某任務有大量執行日誌
- **When** Admin 瀏覽日誌面板
- **Then** 系統以分頁方式顯示（預設每頁 10 筆），可切換頁面查看更多歷史紀錄

### AC-5: 無日誌時的空狀態

- **Given** 某擷取任務尚未執行過
- **When** Admin 開啟該任務的日誌面板
- **Then** 系統顯示「此任務尚無執行紀錄」的提示訊息

## 5. 主要流程

1. Admin 在任務清單中點擊某任務的「查看日誌」按鈕
2. 系統發送 `GET /api/extraction-tasks/:id/logs`
3. 系統以 Modal 或 Drawer 顯示日誌面板
4. 日誌按 `started_at DESC` 排序顯示
5. Admin 可透過分頁控制瀏覽更多紀錄
6. Admin 可點擊失敗日誌查看完整錯誤訊息

## 6. 替代流程

- **從儀表板開啟**：Admin 在儀表板的失敗清單中點擊「查看日誌」，直接開啟對應任務的日誌面板

## 7. 邊界情況

- 已軟刪除任務的日誌：仍可透過直接 API 呼叫查詢，但在 UI 上因任務已從清單移除而無法操作
- 執行中的日誌（`status = 'running'`）：`finished_at` 與 `duration_ms` 為 null，顯示「執行中」標記

## 8. API 規格

### GET /api/extraction-tasks/:id/logs

**Request Headers:**

| Header        | 值                       | 必填 |
|---------------|--------------------------|------|
| Authorization | Bearer {token}           | 是   |

**Query 參數：**

| 參數  | 類型    | 必填 | 說明                  |
|------|---------|------|-----------------------|
| page | integer | 否   | 頁碼，預設 1          |
| limit| integer | 否   | 每頁筆數，預設 10     |

**Response — 200 OK:**

```json
{
  "data": [
    {
      "id": "uuid",
      "taskId": "uuid",
      "status": "running | completed | failed",
      "startedAt": "ISO 8601",
      "finishedAt": "ISO 8601 | null",
      "durationMs": 12345,
      "extractedCount": 1000,
      "totalCount": 1000,
      "errorMessage": "string | null",
      "triggeredBy": "schedule | manual | retry",
      "createdBy": "uuid"
    }
  ],
  "meta": {
    "total": 0,
    "page": 1,
    "limit": 10,
    "totalPages": 0
  }
}
```

**錯誤回應：**

| HTTP Status | 錯誤碼                 | 說明                          |
|-------------|------------------------|-------------------------------|
| 404         | EXTRACTION_NOT_FOUND   | 擷取任務不存在                |
| 403         | AUTH_FORBIDDEN         | 非 Admin 角色無權限操作        |
| 401         | AUTH_TOKEN_MISSING     | 未登入或 Token 無效            |
| 500         | SYSTEM_INTERNAL_ERROR  | 伺服器內部錯誤                 |

## 9. 商業規則

| 規則編號 | 說明 |
|----------|------|
| BR-1 | 僅具備 Admin 角色的使用者可查看擷取日誌 |
| BR-2 | 日誌按 `started_at DESC` 排序（最新在最上方） |
| BR-3 | 日誌不隨任務軟刪除而清除，歷史紀錄永久保留 |
| BR-4 | 時區處理：後端儲存 UTC 時間，前端顯示時轉換為 UTC+8（Asia/Taipei） |
| BR-5 | `duration_ms` 前端格式化為可讀格式（例：1m 23s、45s、120ms） |

## 10. UI/UX 需求

- 日誌面板以 Modal 或 Drawer 方式呈現
- 狀態顏色標記：completed（綠色 #22C55E）、failed（紅色 #EF4444）、running（藍色 #3B82F6）
- 失敗日誌可展開查看完整錯誤訊息
- 觸發方式顯示中文標籤：manual → 手動、schedule → 排程、retry → 重新執行
- `duration_ms` 格式化為人類可讀格式
- 所有時間欄位以 UTC+8 顯示
- 分頁控制：顯示總筆數、目前頁碼
- 空狀態：顯示「此任務尚無執行紀錄」

## 11. 錯誤場景

| 場景                   | 系統回應                                               | 參考                                |
|------------------------|--------------------------------------------------------|-------------------------------------|
| 任務不存在             | HTTP 404，「找不到指定的擷取任務」                     | error-handling.md#extraction-errors  |
| 非 Admin 操作          | HTTP 403，「您沒有權限執行此操作」                     | error-handling.md#auth-errors        |
| 伺服器錯誤             | 「系統發生非預期錯誤，請稍後再試」                     | error-handling.md#system-errors      |

## 12. 相依性

- **F021（立即執行／重新執行）**：執行後產生日誌
- **F023（排程自動執行）**：排程執行後產生日誌
- **F024（擷取監控儀表板）**：儀表板的失敗清單連結至日誌
- **認證系統**：需要有效的 Admin 登入 Session/Token

## 13. 資料需求

- ExtractionLog 實體：參見 [data-model.md#extraction-log-entity](../data-model.md#extraction-log-entity)

## 14. 交叉參考

- 資料模型：[data-model.md#extraction-log-entity](../data-model.md#extraction-log-entity)
- 錯誤處理：[error-handling.md#extraction-errors](../error-handling.md#extraction-errors)
- 相關功能：[F021](F021-run-extraction-task.md)、[F023](F023-scheduled-extraction.md)、[F024](F024-extraction-dashboard.md)
