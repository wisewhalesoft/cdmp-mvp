---
spec-id: F027
title: 查看 Pipeline 列表
feature-id: F027
source-story: US-040
epic: E05
priority: P0-MVP
version: "1.0"
date: 2026-03-19
status: Draft
---

# F027: 查看 Pipeline 列表

## 1. 功能摘要

提供 Admin 查看所有 ETL Pipeline 的列表與統計資訊。頁面頂部顯示統計卡片（總數、啟用中、執行中、草稿、今日處理筆數），下方為可搜尋、篩選、分頁的 Pipeline 列表。

## 2. 使用者故事

**As a** Admin（管理者）
**I want** 查看所有 ETL Pipeline 的列表與統計資訊
**So that** 我能掌握 Pipeline 的整體狀態，快速找到需要關注的 Pipeline

## 3. 前置條件

- Admin 已登入且具備 Admin 權限

## 4. 驗收標準

### AC-1: 統計卡片

- **Given** Admin 進入 Pipeline 列表頁面
- **When** 頁面載入完成
- **Then** 頂部顯示 5 項統計卡片：總 Pipeline 數、啟用中（active）、執行中（running）、草稿（draft）、今日處理筆數

### AC-2: Pipeline 列表

- **Given** 系統中存在 Pipeline 資料
- **When** 頁面載入完成
- **Then** 列表顯示以下欄位：名稱、版本、步驟數、狀態（draft / active / running / failed / disabled）、排程、最後執行時間、下次執行時間、處理筆數、建立者

### AC-3: 狀態篩選

- **Given** Admin 在 Pipeline 列表頁面
- **When** 從狀態下拉選單選擇特定狀態（如 active）
- **Then** 列表僅顯示該狀態的 Pipeline

### AC-4: 關鍵字搜尋

- **Given** Admin 在 Pipeline 列表頁面
- **When** 在搜尋框輸入關鍵字
- **Then** 列表以模糊比對方式篩選名稱包含該關鍵字的 Pipeline

### AC-5: 分頁

- **Given** Pipeline 資料超過 10 筆
- **When** 頁面載入完成
- **Then** 列表每頁顯示 10 筆，底部顯示分頁控制元件，可切換頁碼

### AC-6: 空狀態

- **Given** 系統中無任何 Pipeline 資料（或篩選結果為空）
- **When** 頁面載入完成
- **Then** 顯示空狀態提示，引導使用者建立第一個 Pipeline

## 5. 主要流程

1. Admin 導覽至 ETL Pipeline 管理頁面
2. 系統同時載入統計資訊與 Pipeline 列表（預設第 1 頁，每頁 10 筆）
3. Admin 可透過狀態篩選、關鍵字搜尋縮小範圍
4. Admin 可切換分頁瀏覽更多資料
5. Admin 可點擊某筆 Pipeline 進入詳情或編輯

## 6. 替代流程

- **篩選無結果**：列表區域顯示「無符合條件的 Pipeline」提示

## 7. 邊界情況

- 已軟刪除的 Pipeline 不出現在列表中（`deleted_at IS NULL`）
- 統計數值與列表資料以同一時間點為準
- 「今日處理筆數」以 UTC+8（Asia/Taipei）計算「今日」範圍

## 8. API 規格

### GET /api/v1/etl/pipelines/stats

**Request Headers:**

| Header        | 值                       | 必填 |
|---------------|--------------------------|------|
| Authorization | Bearer {token}           | 是   |

**Response -- 200 OK:**

```json
{
  "total": 0,
  "active": 0,
  "running": 0,
  "draft": 0,
  "todayProcessed": 0
}
```

### GET /api/v1/etl/pipelines

**Request Headers:**

| Header        | 值                       | 必填 |
|---------------|--------------------------|------|
| Authorization | Bearer {token}           | 是   |

**Query Parameters:**

| 參數 | 型別 | 必填 | 說明 |
|------|------|------|------|
| status | string | 否 | 篩選狀態（draft / active / running / failed / disabled） |
| keyword | string | 否 | 名稱模糊搜尋 |
| page | integer | 否 | 頁碼，預設 1 |
| pageSize | integer | 否 | 每頁筆數，預設 10 |

**Response -- 200 OK:**

```json
{
  "data": [
    {
      "id": "uuid",
      "name": "string",
      "version": 1,
      "stepCount": 3,
      "status": "draft",
      "schedule": "0 2 * * *",
      "lastExecutionAt": "ISO 8601 | null",
      "nextExecutionAt": "ISO 8601 | null",
      "processedCount": 0,
      "createdBy": "string (使用者姓名)",
      "createdAt": "ISO 8601"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 10,
    "total": 0,
    "totalPages": 0
  }
}
```

**錯誤回應：**

| HTTP Status | 錯誤碼                 | 說明                               |
|-------------|------------------------|------------------------------------|
| 403         | AUTH_FORBIDDEN         | 非 Admin 角色無權限操作            |
| 401         | AUTH_TOKEN_MISSING     | 未登入或 Token 無效                |
| 500         | SYSTEM_INTERNAL_ERROR  | 伺服器內部錯誤                     |

## 9. 商業規則

| 規則編號 | 說明 |
|----------|------|
| BR-1 | 僅具備 Admin 角色的使用者可查看 Pipeline 列表 |
| BR-2 | 列表僅顯示未軟刪除的 Pipeline（`deleted_at IS NULL`） |
| BR-3 | 時區處理：後端儲存 UTC，前端顯示轉換為 UTC+8（Asia/Taipei） |
| BR-4 | 「今日處理筆數」統計以 UTC+8 計算今日範圍 |
| BR-5 | 預設排序：依 `created_at` 降序 |

## 10. UI/UX 需求

- 頁面頂部 5 張統計卡片橫向排列
- 統計卡片下方為搜尋與篩選區域：左側搜尋框、右側狀態下拉選單
- 列表每行顯示：名稱、版本號、步驟數、狀態 Badge、排程（人類可讀格式）、最後執行時間、下次執行時間、處理筆數、建立者
- 狀態 Badge 顏色：draft（灰色）、active（綠色）、running（藍色）、failed（紅色）、disabled（黃色）
- 時間顯示格式：`YYYY-MM-DD HH:mm`（UTC+8）
- 每行末端操作區：編輯、執行、停用/啟用、刪除
- 空狀態：顯示插圖與「建立第一個 Pipeline」引導按鈕
- 分頁元件：顯示「共 N 筆」與頁碼導航
- 頁面載入時間需在 2 秒內（NFR-002）

## 11. 錯誤場景

| 場景                         | 系統回應                                             | 參考                                    |
|------------------------------|------------------------------------------------------|-----------------------------------------|
| 非 Admin 操作                | HTTP 403，「您沒有權限執行此操作」                   | error-handling.md#auth-errors            |
| 伺服器錯誤                   | 「系統發生非預期錯誤，請稍後再試」                   | error-handling.md#system-errors          |

## 12. 相依性

- **認證系統**：需要有效的 Admin 登入 Session/Token
- 被封鎖：無（可獨立開發）
- 封鎖：F028

## 13. 資料需求

- EtlPipeline 實體：參見 [data-model.md#etl-pipeline-entity](../data-model.md#etl-pipeline-entity)

## 14. 交叉參考

- 資料模型：[data-model.md#etl-pipeline-entity](../data-model.md#etl-pipeline-entity)
- 錯誤處理：[error-handling.md#etl-pipeline-errors](../error-handling.md#etl-pipeline-errors)
- 非功能需求：[nfr.md](../nfr.md)
- 相關功能：[F028](F028-create-pipeline.md)、[F029](F029-pipeline-editor.md)、[F035](F035-pipeline-dashboard.md)
- 圖表：[diagrams/pipeline-crud-flow.md](../diagrams/pipeline-crud-flow.md)
