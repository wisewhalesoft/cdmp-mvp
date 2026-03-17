---
spec-id: F018
title: 查看擷取任務清單
feature-id: F018
source-story: US-031
epic: E04
priority: P0-MVP
version: "1.0"
date: 2026-03-17
status: Draft
---

# F018: 查看擷取任務清單

## 1. 功能摘要

提供 Admin 查看所有擷取任務的清單頁面，含頂部統計卡片、任務表格、搜尋與篩選功能，讓 Admin 掌握各任務的狀態、排程與執行概況。

## 2. 使用者故事

**As a** Admin（管理者）
**I want** 查看所有擷取任務的清單
**So that** 我可以掌握各任務的狀態、排程與執行概況，進行有效的任務管理

## 3. 前置條件

- Admin 已登入且具備 Admin 權限

## 4. 驗收標準

### AC-1: 任務清單顯示

- **Given** Admin 導覽至擷取任務管理頁籤
- **When** 頁面載入完成
- **Then** 系統顯示擷取任務表格，包含欄位：名稱、資料來源、擷取模式、狀態、排程、最後執行時間、擷取筆數，並以分頁呈現（預設每頁 10 筆）

### AC-2: 頂部統計卡片

- **Given** Admin 在擷取任務管理頁籤
- **When** 頁面載入完成
- **Then** 系統在表格上方顯示統計卡片：總任務數、執行中、今日成功、今日失敗、成功率（百分比）

### AC-3: 搜尋功能

- **Given** Admin 在擷取任務清單頁面
- **When** Admin 在搜尋框輸入關鍵字
- **Then** 系統依任務名稱進行模糊搜尋，即時篩選並顯示符合條件的任務

### AC-4: 篩選功能

- **Given** Admin 在擷取任務清單頁面
- **When** Admin 使用篩選器選擇條件（狀態、擷取模式、資料來源）
- **Then** 系統依選擇的條件篩選任務清單，多個篩選條件為 AND 關係

### AC-5: 空狀態顯示

- **Given** 系統中尚未建立任何擷取任務
- **When** Admin 導覽至擷取任務管理頁籤
- **Then** 系統顯示空狀態提示訊息，並提供「建立第一個擷取任務」的快捷按鈕

## 5. 主要流程

1. Admin 導覽至擷取任務管理頁面（第二個頁籤）
2. 系統發送 `GET /api/v1/extraction-tasks` 請求
3. 系統渲染頂部統計卡片（總任務數、執行中、今日成功、今日失敗、成功率）
4. 系統渲染任務表格，預設排序為 `updated_at DESC`
5. Admin 可透過搜尋框、篩選器互動調整顯示結果
6. Admin 可透過分頁控制切換頁面

## 6. 替代流程

- **搜尋無結果**：顯示「沒有符合條件的擷取任務」提示訊息
- **篩選無結果**：顯示「沒有符合條件的擷取任務」提示訊息，並提供清除篩選條件的按鈕

## 7. 邊界情況

- 軟刪除的任務（`deleted_at IS NOT NULL`）不顯示於清單
- 今日統計以 UTC+8（Asia/Taipei）計算「今日」範圍
- 時間欄位（最後執行時間等）前端顯示時轉換為 UTC+8

## 8. API 規格

### GET /api/v1/extraction-tasks

**Request Headers:**

| Header        | 值                       | 必填 |
|---------------|--------------------------|------|
| Authorization | Bearer {token}           | 是   |

**Query 參數：**

| 參數         | 類型    | 必填 | 說明                                    |
|-------------|---------|------|-----------------------------------------|
| page        | integer | 否   | 頁碼，預設 1                            |
| limit       | integer | 否   | 每頁筆數，預設 10                       |
| search      | string  | 否   | 依任務名稱模糊搜尋                      |
| status      | string  | 否   | 篩選狀態（running/scheduled/completed/failed/disabled） |
| mode        | string  | 否   | 篩選擷取模式（full/incremental）        |
| datasourceId| uuid    | 否   | 篩選資料來源                            |

**Response — 200 OK:**

```json
{
  "data": [
    {
      "id": "uuid",
      "name": "string",
      "datasourceId": "uuid",
      "datasourceName": "string",
      "mode": "full | incremental",
      "status": "running | scheduled | completed | failed | disabled",
      "schedule": "string",
      "lastExecutionAt": "ISO 8601 | null",
      "extractedCount": 0,
      "totalCount": 0,
      "progressPercent": 0.0,
      "enabled": true,
      "createdAt": "ISO 8601",
      "updatedAt": "ISO 8601"
    }
  ],
  "meta": {
    "total": 0,
    "page": 1,
    "limit": 10,
    "totalPages": 0
  },
  "summary": {
    "totalTasks": 0,
    "running": 0,
    "todaySuccess": 0,
    "todayFailed": 0,
    "successRate": 0.0
  }
}
```

**錯誤回應：**

| HTTP Status | 錯誤碼                | 說明                          |
|-------------|----------------------|-------------------------------|
| 403         | AUTH_FORBIDDEN       | 非 Admin 角色無權限操作        |
| 401         | AUTH_TOKEN_MISSING   | 未登入或 Token 無效            |
| 500         | SYSTEM_INTERNAL_ERROR| 伺服器內部錯誤                 |

## 9. 商業規則

| 規則編號 | 說明 |
|----------|------|
| BR-1 | 僅具備 Admin 角色的使用者可查看擷取任務清單 |
| BR-2 | 軟刪除的任務不顯示於清單（`deleted_at IS NULL`） |
| BR-3 | 預設排序：`updated_at DESC` |
| BR-4 | 今日統計以 UTC+8（Asia/Taipei）時區計算「今日」範圍 |
| BR-5 | `summary` 中的 `successRate` 計算公式：`todaySuccess / (todaySuccess + todayFailed) * 100`，無執行紀錄時為 `0.0` |

## 10. UI/UX 需求

- 頂部統計卡片：總任務數、執行中（含動畫指示器）、今日成功（綠色）、今日失敗（紅色）、成功率
- 任務表格欄位：名稱、資料來源名稱、擷取模式、狀態（含顏色標記）、排程、最後執行時間、擷取筆數
- 狀態顏色標記：running（藍色 #3B82F6）、scheduled（灰色）、completed（綠色 #22C55E）、failed（紅色 #EF4444）、disabled（灰色淡化）
- 搜尋框支援即時搜尋（debounce 300ms）
- 篩選器支援多條件 AND 組合
- 分頁控制：顯示總筆數、目前頁碼、每頁筆數選擇器
- 空狀態含「建立第一個擷取任務」按鈕
- 每行末端操作按鈕：編輯、立即執行、查看日誌、啟用/停用、刪除

## 11. 錯誤場景

| 場景                   | 系統回應                                               | 參考                                |
|------------------------|--------------------------------------------------------|-------------------------------------|
| 非 Admin 操作          | HTTP 403，「您沒有權限執行此操作」                     | error-handling.md#auth-errors        |
| 伺服器錯誤             | 「系統發生非預期錯誤，請稍後再試」                     | error-handling.md#system-errors      |

## 12. 相依性

- **F017（建立擷取任務）**：需有擷取任務存在才有清單資料
- **F019（編輯擷取任務）**：從清單進入編輯
- **F025（刪除擷取任務）**：從清單進入刪除
- **認證系統**：需要有效的 Admin 登入 Session/Token

## 13. 資料需求

- ExtractionTask 實體：參見 [data-model.md#extraction-task-entity](../data-model.md#extraction-task-entity)
- ExtractionLog 實體：用於計算今日統計，參見 [data-model.md#extraction-log-entity](../data-model.md#extraction-log-entity)

## 14. 效能需求

- 清單 API 在 1,000 筆任務以內必須在 500ms 內回傳分頁結果
- 參見 [nfr.md](../nfr.md)

## 15. 交叉參考

- 資料模型：[data-model.md#extraction-task-entity](../data-model.md#extraction-task-entity)
- 錯誤處理：[error-handling.md](../error-handling.md)
- 非功能需求：[nfr.md](../nfr.md)
- 相關功能：[F017](F017-create-extraction-task.md)、[F019](F019-edit-extraction-task.md)、[F024](F024-extraction-dashboard.md)
