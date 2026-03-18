---
spec-id: F026
title: 查看擷取資料預覽
feature-id: F026
source-story: US-039
epic: E04
priority: P0-MVP
version: "1.1"
date: 2026-03-18
status: Draft
---

# F026: 查看擷取資料預覽

## 1. 功能摘要

提供 Admin 在擷取任務執行完成後，預覽 CDMP AppDB 中已擷取的 raw data。Admin 可分頁瀏覽資料、點擊欄位標題排序，快速確認資料已成功落地、欄位結構正確，並抽查資料品質。

## 2. 使用者故事

**As a** Admin（管理者）
**I want** 在擷取任務執行完成後，預覽 CDMP AppDB 中已擷取的 raw data
**So that** 我可以確認資料已成功落地、欄位結構正確，並快速抽查資料品質

## 3. 前置條件

- Admin 已登入且具備 Admin 權限
- 目標擷取任務存在且未被軟刪除
- 目標擷取任務至少有一次 `completed` 的執行記錄（`extracted_count > 0`）

## 4. 驗收標準

### AC-1: 進入 raw data 預覽頁面

- **Given** Admin 在擷取任務清單或執行日誌中，某任務至少有一次 `completed` 的執行記錄（`extracted_count > 0`）
- **When** Admin 點擊「預覽資料」按鈕或連結
- **Then** 系統開啟該任務的 raw data 預覽頁面，顯示已擷取至 AppDB 的資料內容

### AC-2: 分頁瀏覽資料

- **Given** Admin 在 raw data 預覽頁面
- **When** Admin 瀏覽資料列表
- **Then** 系統以分頁方式顯示資料（預設每頁 50 筆），並顯示總筆數與當前頁面資訊；Admin 可切換每頁筆數（50 / 100 / 200 筆）

### AC-3: 欄位顯示

- **Given** Admin 在 raw data 預覽頁面
- **When** 頁面載入完成
- **Then** 系統以表格形式顯示 raw data 的所有欄位，欄位標題對應來源表的欄位名稱，每筆資料顯示所有欄位值

### AC-4: 欄位排序

- **Given** Admin 在 raw data 預覽頁面
- **When** Admin 點擊某欄位標題
- **Then** 系統依該欄位排序資料（第一次點擊升冪、第二次點擊降冪），並在欄位標題顯示排序方向指示

### AC-5: 尚無資料時的空狀態

- **Given** 某擷取任務尚未成功執行（或 `extracted_count = 0`）
- **When** Admin 嘗試進入 raw data 預覽頁面
- **Then** 系統顯示「此任務尚無已擷取的資料，請先執行擷取任務」的提示訊息，並提供「立即執行」的快捷按鈕

### AC-6: 顯示資料摘要資訊

- **Given** Admin 在 raw data 預覽頁面
- **When** 頁面載入完成
- **Then** 頁面頂部顯示資料摘要：AppDB raw data 表名稱（`raw_{task_id_short}`）、來源表（`sourceSchema.sourceTable` 格式）、總筆數、最後更新時間（對應最後一次 `completed` 執行的 `finished_at`）

## 5. 主要流程

1. Admin 在任務清單中點擊某任務的「預覽資料」按鈕，或從日誌面板中點擊「預覽資料」連結
2. 系統發送 `GET /api/v1/extraction-tasks/:id/raw-data`
3. 系統查詢 AppDB 中的 raw data 表（`raw_{task_id_short}`），以分頁方式回傳資料
4. 前端渲染資料摘要（表名、總筆數、最後更新時間）與資料表格
5. Admin 可透過分頁控制切換頁面、調整每頁筆數
6. Admin 可點擊欄位標題進行排序

## 6. 替代流程

- **從任務清單進入**：Admin 在清單中點擊「預覽資料」按鈕
- **從日誌面板進入**：Admin 在 completed 日誌中點擊「預覽資料」連結（F022 AC-6）

## 7. 邊界情況

- raw data 表不存在（任務從未執行成功）：回傳 404，前端顯示空狀態
- raw data 表存在但資料為空（全量模式 TRUNCATE 後尚未重新寫入）：顯示空表格與總筆數 0
- 欄位數量過多（超過 20 個欄位）：表格支援水平捲動
- 非索引欄位排序且資料量超過 100,000 筆：回應附帶 `warning` 提示效能影響，但仍允許查詢
- 百萬筆資料的後段分頁（如 page=10000）：`LIMIT` + `OFFSET` 可能較慢，系統仍允許查詢但回應時間可能超過預期

## 8. API 規格

### GET /api/v1/extraction-tasks/:id/raw-data

**Request Headers:**

| Header        | 值                       | 必填 |
|---------------|--------------------------|------|
| Authorization | Bearer {token}           | 是   |

**Query 參數：**

| 參數       | 類型    | 必填 | 說明                                         |
|-----------|---------|------|----------------------------------------------|
| page      | integer | 否   | 頁碼，預設 1                                 |
| limit     | integer | 否   | 每頁筆數，預設 50，允許值：50 / 100 / 200    |
| sortBy    | string  | 否   | 排序欄位名稱                                 |
| sortOrder | string  | 否   | 排序方向：`asc` / `desc`，預設 `asc`         |

**Response -- 200 OK:**

```json
{
  "meta": {
    "taskId": "uuid",
    "rawTableName": "raw_a3f2c1d4",
    "sourceSchema": "public",
    "sourceTable": "customers",
    "totalCount": 1000000,
    "page": 1,
    "limit": 50,
    "totalPages": 20000,
    "lastUpdatedAt": "ISO 8601",
    "warning": "string | null (非索引欄位排序效能警告)"
  },
  "columns": ["id", "name", "created_at", "_cdmp_extracted_at"],
  "data": [
    { "id": 1, "name": "Alice", "created_at": "2026-01-01", "_cdmp_extracted_at": "2026-03-18T10:00:00Z" }
  ]
}
```

**錯誤回應：**

| HTTP Status | 錯誤碼                         | 說明                                |
|-------------|--------------------------------|-------------------------------------|
| 404         | EXTRACTION_NOT_FOUND           | 擷取任務不存在或已刪除              |
| 404         | EXTRACTION_RAW_TABLE_NOT_FOUND | raw data 表不存在（任務從未成功執行）|
| 422         | VALIDATION_ERROR               | 無效的分頁或排序參數                |
| 403         | AUTH_FORBIDDEN                 | 非 Admin 角色無權限操作             |
| 401         | AUTH_TOKEN_MISSING             | 未登入或 Token 無效                 |
| 500         | SYSTEM_INTERNAL_ERROR          | 伺服器內部錯誤                      |

## 9. 商業規則

| 規則編號 | 說明 |
|----------|------|
| BR-1 | 僅具備 Admin 角色的使用者可預覽 raw data |
| BR-2 | 預設每頁 50 筆，允許切換為 100 或 200 筆 |
| BR-3 | 不提供全量下載功能（避免前端記憶體耗盡），資料匯出為 Phase 2 功能 |
| BR-4 | `columns` 回傳所有欄位名稱（含系統附加欄位 `_cdmp_extracted_at`、`_cdmp_id`） |
| BR-5 | `lastUpdatedAt` 取自最後一次 `completed` 執行的 ExtractionLog.`finished_at` |
| BR-6 | 排序欄位為非索引欄位且資料量超過 100,000 筆時，回應附帶 `warning` 欄位 |
| BR-7 | raw data 表的主鍵欄位（或 `_cdmp_id`）應建立 Index，以加速預設排序與分頁查詢 |
| BR-8 | 時區處理：`_cdmp_extracted_at` 等時間欄位，前端顯示時轉換為 UTC+8（Asia/Taipei） |

## 10. UI/UX 需求

- 頁面頂部顯示資料摘要區塊：raw data 表名稱、來源表（`sourceSchema.sourceTable` 格式）、總筆數、最後更新時間
- 資料表格以全寬顯示，支援水平捲動（處理欄位數量多的情境）
- 欄位標題可點擊排序，顯示排序方向箭頭（升冪 / 降冪）
- 分頁元件：顯示總筆數、目前頁碼、每頁筆數選擇器（50 / 100 / 200）
- 空狀態：顯示「此任務尚無已擷取的資料，請先執行擷取任務」，含「立即執行」快捷按鈕
- 非索引欄位排序警告：以 toast 或 inline warning 顯示效能提醒
- 從任務清單進入：「預覽資料」按鈕僅在任務至少有一次 completed 執行時啟用
- 所有時間欄位以 UTC+8 顯示

## 11. 錯誤場景

| 場景                           | 系統回應                                               | 參考                                    |
|--------------------------------|--------------------------------------------------------|-----------------------------------------|
| 任務不存在                     | HTTP 404，「找不到指定的擷取任務」                     | error-handling.md#extraction-errors      |
| raw data 表不存在              | HTTP 404，「此任務尚無已擷取的資料」                   | error-handling.md#extraction-errors      |
| 無效的分頁參數                 | HTTP 422，附各參數錯誤訊息                             | error-handling.md#validation-errors      |
| 非 Admin 操作                  | HTTP 403，「您沒有權限執行此操作」                     | error-handling.md#auth-errors            |
| 伺服器錯誤                     | 「系統發生非預期錯誤，請稍後再試」                     | error-handling.md#system-errors          |

## 12. 相依性

- **F021（立即執行／重新執行）**：需有成功的執行記錄，raw data 表才有資料
- **F022（查看擷取日誌）**：日誌面板提供進入 raw data 預覽的連結
- **F017（建立擷取任務）**：需有擷取任務存在
- **認證系統**：需要有效的 Admin 登入 Session/Token

## 13. 資料需求

- ExtractionTask 實體：參見 [data-model.md#extraction-task-entity](../data-model.md#extraction-task-entity)
- ExtractionLog 實體（`lastUpdatedAt` 查詢）：參見 [data-model.md#extraction-log-entity](../data-model.md#extraction-log-entity)
- Raw Data 動態表：參見 [data-model.md#raw-data-table](../data-model.md#raw-data-table)

## 14. 效能需求

- 百萬筆資料的分頁查詢（前段頁面，page <= 100）回應時間 < 2 秒
- 百萬筆資料的後段分頁查詢（page > 1000）回應時間 < 5 秒
- 已索引欄位排序回應時間 < 2 秒
- 非索引欄位排序且資料量 > 100,000 筆時附帶效能警告
- 參見 [nfr.md](../nfr.md)

## 15. 交叉參考

- 資料模型：[data-model.md#extraction-task-entity](../data-model.md#extraction-task-entity)、[data-model.md#raw-data-table](../data-model.md#raw-data-table)
- 錯誤處理：[error-handling.md#extraction-errors](../error-handling.md#extraction-errors)
- 非功能需求：[nfr.md](../nfr.md)
- 相關功能：[F021](F021-run-extraction-task.md)、[F022](F022-view-extraction-logs.md)
