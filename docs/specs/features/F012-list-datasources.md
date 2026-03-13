---
spec-id: F012
title: 查看資料來源清單
feature-id: F012
source-story: US-021
epic: E03
priority: P0-MVP
version: "1.0"
date: 2026-03-06
status: Draft
---

# F012: 查看資料來源清單

## 1. 功能摘要

提供系統管理員以清單或卡片檢視模式瀏覽所有已設定的資料來源。支援分頁、搜尋與篩選功能，讓管理員快速掌握各資料來源的連線狀態與基本資訊。

## 2. 使用者故事

**As a** 系統管理員（Admin）
**I want** 查看所有已設定的資料來源清單
**So that** 我可以瀏覽並管理平台連接的所有資料庫

## 3. 驗收標準

### AC-1: 載入資料來源清單

- **Given** 管理員已登入且系統中已設定至少一個資料來源
- **When** 進入資料來源管理頁面
- **Then** 顯示所有資料來源，每筆包含：名稱、類型（含圖示）、主機位址、資料庫名稱、狀態（connected/disconnected/unknown）、最後測試時間（last_tested_at）

### AC-2: 切換檢視模式

- **Given** 管理員正在瀏覽資料來源清單
- **When** 切換「清單檢視」與「卡片檢視」模式
- **Then** 以對應的版面配置顯示相同資料，檢視偏好儲存於 localStorage

### AC-3: 搜尋與篩選

- **Given** 管理員正在瀏覽資料來源清單
- **When** 輸入搜尋關鍵字、選擇類型篩選或狀態篩選
- **Then** 清單即時更新，僅顯示符合條件的資料來源

### AC-4: 空狀態顯示

- **Given** 管理員已登入且系統中尚未設定任何資料來源
- **When** 進入資料來源管理頁面
- **Then** 顯示「尚未設定任何資料來源」訊息，並附一個醒目的「新增資料來源」按鈕

## 4. API 規格

### GET /api/datasources

**說明：** 取得資料來源清單（支援分頁、搜尋、篩選）。

**Request Headers:**

| Header        | 值                       | 必填 |
|---------------|--------------------------|------|
| Authorization | Bearer {token}           | 是   |

**Query Parameters:**

| 參數   | 類型    | 預設值 | 說明                                          |
|--------|---------|--------|-----------------------------------------------|
| page   | integer | 1      | 頁碼                                          |
| limit  | integer | 20     | 每頁筆數（最大 100）                          |
| search | string  | —      | 依名稱模糊搜尋                                |
| type   | string  | —      | 篩選類型（mysql / postgresql / sqlserver）     |
| status | string  | —      | 篩選狀態（connected / disconnected / unknown） |

**Response — 200 OK:**

```json
{
  "data": [
    {
      "id": "uuid",
      "name": "string",
      "type": "mysql",
      "host": "string",
      "port": 3306,
      "databaseName": "string",
      "username": "string",
      "description": "string | null",
      "status": "connected",
      "lastTestedAt": "ISO 8601 | null",
      "createdAt": "ISO 8601",
      "updatedAt": "ISO 8601"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 50,
    "totalPages": 3
  }
}
```

> 注意：Response 中不得包含 password 欄位（即使是加密後的值）。

**錯誤回應：**

| HTTP Status | 錯誤碼           | 說明                    |
|-------------|------------------|-------------------------|
| 401         | UNAUTHORIZED     | 未登入或 token 無效     |
| 403         | FORBIDDEN        | 非 Admin 角色無權限操作 |
| 500         | INTERNAL_ERROR   | 伺服器內部錯誤          |

## 5. 商業規則

| 規則編號 | 說明                                                                 |
|----------|----------------------------------------------------------------------|
| BR-1     | 僅具備 Admin 角色的使用者可查看資料來源清單                          |
| BR-2     | 已軟刪除的資料來源（deleted_at IS NOT NULL）不顯示於清單中           |
| BR-3     | 密碼欄位在任何回應中均須被排除                                       |
| BR-4     | 預設排序：依建立時間降序（最新的在最前面）                           |
| BR-5     | 搜尋為不區分大小寫的模糊比對                                         |

## 6. UI/UX 需求

- **清單檢視：** 表格形式，欄位依序為名稱、類型（含圖示）、主機位址、資料庫名稱、狀態、最後測試時間、操作按鈕
- **卡片檢視：** 每張卡片顯示相同資訊，以網格排列
- **類型圖示對應：**
  - MySQL：海豚圖示（dolphin）
  - PostgreSQL：大象圖示（elephant）
  - SQL Server：鑽石圖示（diamond）
- **狀態顯示：**
  - `connected`：綠色標籤
  - `disconnected`：紅色標籤
  - `unknown`：灰色標籤
- **檢視模式切換：** 以圖示按鈕切換，偏好儲存於 localStorage（key: `datasource-view-mode`）
- **搜尋列：** 頁面頂部提供搜尋輸入框與類型、狀態的下拉篩選
- **分頁控制元件：** 頁面底部顯示分頁導覽
- **操作按鈕：** 每筆資料提供「編輯」、「測試連線」、「刪除」操作入口
- **空狀態：** 置中顯示提示文字與醒目的 CTA 按鈕

## 7. 錯誤場景

| 場景                   | 系統回應                                               | 參考                          |
|------------------------|--------------------------------------------------------|-------------------------------|
| API 載入失敗           | 顯示「無法載入資料來源清單，請重新整理頁面」           | error-handling.md#server      |
| 搜尋無結果             | 顯示「找不到符合條件的資料來源」並提供清除篩選的選項   | —                             |
| 非 Admin 操作          | HTTP 403，導向無權限頁面                               | error-handling.md#auth        |

## 8. 相依性

- **F011（新增資料來源）：** 空狀態下的「新增資料來源」按鈕導向新增頁面
- **F013（編輯資料來源）：** 清單中的「編輯」按鈕觸發
- **F014（刪除資料來源）：** 清單中的「刪除」按鈕觸發
- **F015（測試資料來源連線）：** 清單中的「測試連線」按鈕觸發
- **認證系統：** 需要有效的 Admin 登入 session/token

## 9. 資料需求

- 資料來源實體（Datasource Entity）：參見 `data-model.md#datasource-entity`
- 查詢須排除 `deleted_at IS NOT NULL` 的記錄
- 搜尋欄位 `name` 須建立索引以確保模糊搜尋效能

## 10. 安全性考量

- API 回應中永遠不得包含密碼欄位
- 操作僅限 Admin 角色
- 搜尋輸入須經伺服器端清理，防止 SQL Injection

## 11. 效能需求

- 分頁查詢回應時間：< 500ms（參見 NFR-002）
- 前端應在分頁切換時顯示 loading skeleton 以提升使用體驗
- 搜尋使用 debounce（建議 300ms）以避免過多 API 請求

## 12. 交叉參考

- 資料模型：[data-model.md#datasource-entity](../data-model.md#datasource-entity)
- 錯誤處理：[error-handling.md](../error-handling.md)
- 非功能需求：[nfr.md#NFR-002](../nfr.md#NFR-002)
- 流程圖：[diagrams/F012-list-datasources.mmd](../diagrams/F012-list-datasources.mmd)
- 相關功能：[F011](F011-add-datasource.md)、[F013](F013-edit-datasource.md)、[F014](F014-delete-datasource.md)、[F015](F015-test-datasource-connection.md)
