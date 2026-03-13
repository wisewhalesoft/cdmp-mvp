---
spec-id: F014
title: 刪除資料來源
feature-id: F014
source-story: US-023
epic: E03
priority: P1
version: "1.0"
date: 2026-03-06
status: Draft
---

# F014: 刪除資料來源

## 1. 功能摘要

提供系統管理員刪除不再需要的資料來源設定。系統採用軟刪除機制，設定 `deleted_at` 時間戳記，使記錄從所有清單與儀表板查詢中排除，但保留資料以供必要時由 DBA 復原。

## 2. 使用者故事

**As a** 系統管理員（Admin）
**I want** 刪除不再需要的資料來源設定
**So that** 清單中只保留有效且正在使用的資料來源

## 3. 驗收標準

### AC-1: 確認刪除成功

- **Given** 管理員在資料來源清單中點選某筆資料的「刪除」按鈕
- **When** 確認對話框出現後，點選「確認刪除」
- **Then** 系統執行軟刪除（設定 deleted_at 時間戳記），顯示成功訊息，該資料來源從清單中消失

### AC-2: 取消刪除

- **Given** 管理員在資料來源清單中點選某筆資料的「刪除」按鈕
- **When** 確認對話框出現後，點選「取消」
- **Then** 資料來源保持不變，對話框關閉

### AC-3: 確認對話框顯示內容

- **Given** 管理員點選「刪除」按鈕
- **When** 確認對話框顯示
- **Then** 對話框內容包含資料來源名稱與警告文字：「您確定要刪除 [名稱] 嗎？刪除後將不再顯示於清單中。」

### AC-4: 軟刪除機制

- **Given** 管理員已確認刪除某資料來源
- **When** 系統執行刪除操作
- **Then** 資料庫中該筆記錄的 `deleted_at` 欄位設定為當前時間戳記，記錄保留於資料庫中，但從所有清單、儀表板查詢結果中排除

## 4. API 規格

### DELETE /api/datasources/:id

**說明：** 軟刪除指定的資料來源。

**Request Headers:**

| Header        | 值                       | 必填 |
|---------------|--------------------------|------|
| Authorization | Bearer {token}           | 是   |

**Path Parameters:**

| 參數 | 類型   | 說明              |
|------|--------|--------------------|
| id   | uuid   | 資料來源的唯一識別碼 |

**Response — 200 OK:**

```json
{
  "message": "資料來源已成功刪除",
  "id": "uuid"
}
```

**錯誤回應：**

| HTTP Status | 錯誤碼           | 說明                         |
|-------------|------------------|------------------------------|
| 404         | NOT_FOUND        | 資料來源不存在或已被刪除     |
| 403         | FORBIDDEN        | 非 Admin 角色無權限操作      |
| 401         | UNAUTHORIZED     | 未登入或 token 無效          |
| 500         | INTERNAL_ERROR   | 伺服器內部錯誤               |

## 5. 商業規則

| 規則編號 | 說明                                                                       |
|----------|----------------------------------------------------------------------------|
| BR-1     | 僅具備 Admin 角色的使用者可刪除資料來源                                    |
| BR-2     | 採用軟刪除機制：`SET deleted_at = NOW()`，記錄不從資料庫中物理刪除         |
| BR-3     | 所有查詢（清單、儀表板、搜尋）必須加上 `WHERE deleted_at IS NULL` 條件     |
| BR-4     | 對已軟刪除的資料來源再次執行刪除，回傳 404                                 |
| BR-5     | 資料復原可由 DBA 手動將 `deleted_at` 設為 NULL 實現                        |
| BR-6     | 刪除操作須記錄至 audit log                                                 |

## 6. UI/UX 需求

- 「刪除」按鈕位於清單或卡片中每筆資料來源的操作區域
- 點選後顯示確認對話框（modal dialog）：
  - 標題：「刪除資料來源」
  - 內容：「您確定要刪除 **[資料來源名稱]** 嗎？刪除後將不再顯示於清單中。」
  - 按鈕：「取消」（次要按鈕）、「確認刪除」（危險按鈕，紅色）
- 確認刪除後顯示 toast 成功訊息
- 清單自動更新（移除已刪除項目），無需重新載入頁面
- 刪除期間「確認刪除」按鈕顯示 loading 狀態，防止重複提交

## 7. 錯誤場景

| 場景                         | 系統回應                                               | 參考                          |
|------------------------------|--------------------------------------------------------|-------------------------------|
| 資料來源不存在或已被刪除     | HTTP 404，顯示「找不到指定的資料來源」                 | error-handling.md#not-found   |
| 非 Admin 操作                | HTTP 403，「您沒有權限執行此操作」                     | error-handling.md#auth        |
| 伺服器錯誤                   | 「系統發生錯誤，請稍後再試」，對話框保持開啟           | error-handling.md#server      |

## 8. 相依性

- **F012（查看資料來源清單）：** 刪除入口來自清單頁面，刪除後清單自動更新
- **F016（資料來源狀態監控儀表板）：** 軟刪除的資料來源須從儀表板中排除
- **認證系統：** 需要有效的 Admin 登入 session/token

## 9. 資料需求

- 資料來源實體（Datasource Entity）：參見 `data-model.md#datasource-entity`
- 軟刪除欄位：`deleted_at`（TIMESTAMP，nullable，預設 NULL）
- 刪除時設定 `deleted_at = NOW()`
- 所有查詢加上 `WHERE deleted_at IS NULL` 條件
- Audit log 記錄：操作者、操作時間、被刪除的資料來源 ID 與名稱

## 10. 安全性考量

- 操作僅限 Admin 角色，非 Admin 回傳 HTTP 403
- 需要前端確認對話框作為明確的使用者意圖確認
- 軟刪除確保資料可追溯與復原
- 刪除操作須記錄 audit log

## 11. 交叉參考

- 資料模型：[data-model.md#datasource-entity](../data-model.md#datasource-entity)
- 錯誤處理：[error-handling.md](../error-handling.md)
- 流程圖：[diagrams/F014-delete-datasource.mmd](../diagrams/F014-delete-datasource.mmd)
- 相關功能：[F012](F012-list-datasources.md)、[F016](F016-datasource-status-dashboard.md)
