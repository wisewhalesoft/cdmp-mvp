---
spec-id: F017
title: 建立擷取任務
feature-id: F017
source-story: US-030
epic: E04
priority: P0-MVP
version: "1.2"
date: 2026-03-18
status: Draft
---

# F017: 建立擷取任務

## 1. 功能摘要

提供 Admin 建立資料擷取任務的功能。Admin 選定資料來源後，系統動態載入可用的 schema 列表與資料表列表供下拉選單選擇（不支援手動輸入）。Admin 完成所有設定後，系統驗證輸入並儲存任務設定。系統將於首次執行時自動在 CDMP AppDB 建立對應的 raw data 表（`raw_{task_id_short}`），將外部資料來源的資料真正搬移至 AppDB。

## 2. 使用者故事

**As a** Admin（管理者）
**I want** 建立一個資料擷取任務，並從下拉選單選擇來源 schema 與資料表
**So that** 平台可以從已設定的資料來源中讀取指定的來源資料表，並將 raw data 真正搬移至 CDMP AppDB 的對應資料表中

## 3. 前置條件

- Admin 已登入且具備 Admin 權限
- 系統中至少存在一個未刪除的資料來源（Datasource）

## 4. 驗收標準

### AC-1: 成功建立擷取任務

- **Given** Admin 在擷取任務管理頁面
- **When** Admin 依序選定資料來源、schema、資料表，填寫其餘必填欄位後點擊「建立任務」
- **Then** 系統儲存擷取任務設定，`status` 設為 `scheduled`，`enabled` 設為 `true`，顯示成功訊息，新任務出現於任務清單中

### AC-2: 防止重複名稱

- **Given** 名為「每日客戶同步」的擷取任務已存在（未軟刪除）
- **When** Admin 嘗試建立另一個相同名稱的擷取任務
- **Then** 系統顯示「此名稱的擷取任務已存在」，不建立該筆記錄

### AC-3: 增量模式必填欄位驗證

- **Given** Admin 選擇擷取模式為「增量」（incremental）
- **When** Admin 未填寫增量欄位（incremental_column）即提交表單
- **Then** 系統顯示「增量模式必須指定增量欄位」的驗證錯誤訊息

### AC-4: 欄位驗證

- **Given** Admin 在建立擷取任務表單
- **When** Admin 提交表單時有必填欄位未填或格式不合規（例如：cron 表達式格式錯誤、名稱為空）
- **Then** 系統針對每個不合規欄位顯示具體的驗證錯誤訊息

### AC-5: 資料來源下拉選單

- **Given** Admin 在建立擷取任務表單
- **When** Admin 點擊資料來源下拉選單
- **Then** 系統顯示所有未刪除的資料來源清單（`deleted_at IS NULL`），包含名稱與類型

### AC-6: 選定資料來源後載入 Schema 列表

- **Given** Admin 在建立擷取任務表單，且尚未選定資料來源
- **When** Admin 從下拉選單選定一個資料來源
- **Then** 系統顯示 loading 狀態，透過 `GET /api/v1/datasources/:id/schemas` 查詢可用的 schema（或 database）列表，並填充 schema 下拉選單；資料表下拉選單保持停用狀態

### AC-7: 選定 Schema 後載入資料表列表

- **Given** Admin 已選定資料來源，且 schema 下拉選單已載入完成
- **When** Admin 從 schema 下拉選單選定一個 schema
- **Then** 系統顯示 loading 狀態，透過 `GET /api/v1/datasources/:id/schemas/:schema/tables` 查詢該 schema 下的資料表列表，並填充資料表下拉選單

### AC-8: 載入失敗時顯示錯誤訊息

- **Given** Admin 已選定資料來源，但系統無法連線至外部資料庫（逾時、認證失敗等）
- **When** schema 或資料表列表載入失敗
- **Then** 系統顯示錯誤訊息（例如：「無法連線至資料來源，請至資料來源設定頁面確認連線設定」），schema 與資料表下拉選單保持停用狀態；不提供手動輸入選項，使用者必須先修復連線設定後重新嘗試

### AC-9: 變更資料來源時重置 Schema 與資料表

- **Given** Admin 已選定資料來源與 schema，且資料表下拉選單已有選擇值
- **When** Admin 變更資料來源選擇
- **Then** 系統清除 schema 與資料表的選擇值，並重新載入對應新資料來源的 schema 列表

## 5. 主要流程

1. Admin 導覽至擷取任務管理頁面，點擊「建立任務」按鈕
2. 系統顯示建立擷取任務表單
3. Admin 填寫必填欄位：
   - 任務名稱
   - 選擇資料來源（下拉選單）
   - 系統自動載入 schema 列表（loading 狀態 → schema 下拉選單）
   - 選擇 schema（下拉選單）
   - 系統自動載入資料表列表（loading 狀態 → 資料表下拉選單）
   - 選擇資料表（下拉選單）
   - 選擇擷取模式（全量 / 增量）
   - 設定排程（cron 表達式）
   - （增量模式）輸入增量欄位名稱
   - （選填）輸入增量起始值
4. Admin 點擊「建立任務」
5. 系統執行欄位驗證
6. 系統檢查名稱唯一性
7. 系統儲存擷取任務，設定 `status = 'scheduled'`、`enabled = true`
8. 系統顯示成功訊息，導回任務清單

## 6. 替代流程

- **切換擷取模式**：Admin 從全量切換至增量時，系統動態顯示增量欄位輸入框；從增量切換至全量時，系統隱藏增量欄位輸入框

## 7. 邊界情況

- 資料來源在表單填寫期間被刪除：提交時回傳 `422`，提示資料來源不存在
- 名稱唯一性僅在未軟刪除的記錄中檢查（`deleted_at IS NULL`）
- Cron 表達式以 UTC 時區解析

## 8. API 規格

### POST /api/v1/extraction-tasks

**Request Headers:**

| Header        | 值                       | 必填 |
|---------------|--------------------------|------|
| Authorization | Bearer {token}           | 是   |
| Content-Type  | application/json         | 是   |

**Request Body:**

```json
{
  "name": "string (必填, 唯一, 最大 255 字元)",
  "datasourceId": "uuid (必填)",
  "mode": "string (必填, enum: full | incremental)",
  "sourceSchema": "string (選填, 最大 255 字元, 來源 schema/database 名稱)",
  "sourceTable": "string (必填, 最大 255 字元, 外部資料來源中要讀取的表名)",
  "schedule": "string (必填, 合法 cron 表達式)",
  "incrementalColumn": "string (增量模式必填, 最大 255 字元)",
  "lastIncrementalValue": "string (選填, 最大 255 字元)"
}
```

**Response — 201 Created:**

```json
{
  "id": "uuid",
  "name": "string",
  "datasourceId": "uuid",
  "datasourceName": "string",
  "mode": "full",
  "status": "scheduled",
  "sourceSchema": "string | null",
  "sourceTable": "string",
  "rawTableName": "string (系統自動生成, raw_{task_id_short})",
  "incrementalColumn": "string | null",
  "lastIncrementalValue": "string | null",
  "schedule": "string",
  "enabled": true,
  "lastExecutionAt": null,
  "extractedCount": 0,
  "totalCount": 0,
  "progressPercent": 0,
  "avgDurationMs": 0,
  "executionCount": 0,
  "errorMessage": null,
  "createdBy": "uuid",
  "createdAt": "ISO 8601",
  "updatedAt": "ISO 8601"
}
```

**錯誤回應：**

| HTTP Status | 錯誤碼                           | 說明                               |
|-------------|----------------------------------|------------------------------------|
| 422         | VALIDATION_ERROR                 | 欄位驗證失敗（附各欄位錯誤）       |
| 409         | EXTRACTION_NAME_EXISTS           | 擷取任務名稱已存在                 |
| 422         | EXTRACTION_DATASOURCE_NOT_FOUND  | 指定的資料來源不存在或已刪除       |
| 403         | AUTH_FORBIDDEN                   | 非 Admin 角色無權限操作            |
| 401         | AUTH_TOKEN_MISSING               | 未登入或 Token 無效                |
| 500         | SYSTEM_INTERNAL_ERROR            | 伺服器內部錯誤                     |

### GET /api/v1/datasources/:id/schemas

查詢指定資料來源的可用 schema（或 database）列表。由 Datasource Controller 提供。

**Request Headers:**

| Header        | 值                       | 必填 |
|---------------|--------------------------|------|
| Authorization | Bearer {token}           | 是   |

**Response — 200 OK:**

```json
{
  "schemas": ["public", "information_schema", "pg_catalog"]
}
```

**錯誤回應：**

| HTTP Status | 錯誤碼                           | 說明                               |
|-------------|----------------------------------|------------------------------------|
| 404         | DS_NOT_FOUND                     | 資料來源不存在或已刪除             |
| 503         | DATASOURCE_SCHEMA_LOAD_FAILED    | 無法連線至資料來源，schema 列表載入失敗 |
| 403         | AUTH_FORBIDDEN                   | 非 Admin 角色無權限操作            |
| 401         | AUTH_TOKEN_MISSING               | 未登入或 Token 無效                |

### GET /api/v1/datasources/:id/schemas/:schema/tables

查詢指定 schema 下的資料表列表。由 Datasource Controller 提供。

**Request Headers:**

| Header        | 值                       | 必填 |
|---------------|--------------------------|------|
| Authorization | Bearer {token}           | 是   |

**Response — 200 OK:**

```json
{
  "tables": ["customers", "orders", "products"]
}
```

**錯誤回應：**

| HTTP Status | 錯誤碼                           | 說明                               |
|-------------|----------------------------------|------------------------------------|
| 404         | DS_NOT_FOUND                     | 資料來源不存在或已刪除             |
| 503         | DATASOURCE_TABLE_LOAD_FAILED     | 無法連線至資料來源，table 列表載入失敗 |
| 403         | AUTH_FORBIDDEN                   | 非 Admin 角色無權限操作            |
| 401         | AUTH_TOKEN_MISSING               | 未登入或 Token 無效                |

## 9. 商業規則

| 規則編號 | 說明 |
|----------|------|
| BR-1 | 僅具備 Admin 角色的使用者可建立擷取任務 |
| BR-2 | 擷取任務名稱在未刪除記錄中必須唯一 |
| BR-3 | 擷取模式為 `incremental` 時，`incrementalColumn` 為必填 |
| BR-4 | 建立時 `status` 預設為 `scheduled`，`enabled` 預設為 `true` |
| BR-5 | Cron 表達式必須符合標準格式（5 或 6 欄位），使用 `cron-parser` 或同等套件驗證 |
| BR-6 | 指定的 `datasourceId` 必須對應一個存在且未軟刪除的 Datasource |
| BR-7 | 時區處理：後端儲存 UTC 時間，cron 表達式以 UTC 時區解析 |
| BR-8 | `sourceSchema` 與 `sourceTable` 均透過下拉選單從外部資料來源動態載入選擇，不支援手動輸入 |
| BR-9 | `sourceTable` 為必填；`sourceSchema` 視資料庫類型而定（可為空） |
| BR-10 | 選定資料來源後，系統透過 `GET /api/v1/datasources/:id/schemas` 載入 schema 列表；選定 schema 後，透過 `GET /api/v1/datasources/:id/schemas/:schema/tables` 載入 table 列表 |
| BR-11 | 連線失敗時不提供手動輸入 fallback，使用者必須修復連線設定後重新嘗試 |
| BR-12 | Schema / table 列表不使用快取，每次開啟表單均即時查詢外部資料庫 |

## 10. UI/UX 需求

- 表單包含以下欄位：任務名稱、資料來源（下拉選單）、來源 Schema（下拉選單，依資料來源動態載入）、來源資料表（下拉選單，依 Schema 動態載入）、擷取模式（radio 或下拉選單）、排程（cron 表達式輸入）、增量欄位（條件式顯示）、增量起始值（選填）
- 資料來源選定前，Schema 與資料表下拉選單為停用狀態
- 選定資料來源後，Schema 下拉選單顯示 loading 狀態，載入完成後啟用；資料表下拉選單保持停用
- 選定 Schema 後，資料表下拉選單顯示 loading 狀態，載入完成後啟用
- 變更資料來源時，自動清除 Schema 與資料表選擇值並重新載入 Schema 列表
- 連線失敗時，顯示錯誤訊息（如「無法連線至資料來源，請至資料來源設定頁面確認連線設定」），Schema 與資料表下拉保持停用；不提供手動輸入選項
- 選擇「增量」模式時動態顯示增量欄位輸入框
- Cron 表達式旁顯示人類可讀的排程說明（例：「每日凌晨 2:00」）
- 即時欄位驗證：離開欄位時檢查格式
- 提交按鈕在必填欄位未填寫完成時保持 disabled 狀態
- 成功後導向擷取任務清單頁面
- 表單提交期間顯示 loading 狀態，防止重複提交

## 11. 錯誤場景

| 場景                         | 系統回應                                             | 參考                                    |
|------------------------------|------------------------------------------------------|-----------------------------------------|
| 必填欄位未填                 | 欄位下方顯示「此欄位為必填」                         | error-handling.md#validation-errors      |
| 任務名稱重複                 | 「此名稱的擷取任務已存在」                           | error-handling.md#extraction-errors      |
| 增量模式未填增量欄位         | 「增量模式必須指定增量欄位」                         | error-handling.md#validation-errors      |
| Cron 表達式格式錯誤          | 「排程格式不正確，請輸入合法的 cron 表達式」         | error-handling.md#validation-errors      |
| 資料來源不存在               | 「指定的資料來源不存在或已被刪除」                   | error-handling.md#extraction-errors      |
| Schema 列表載入失敗          | 「無法連線至資料來源，請至資料來源設定頁面確認連線設定」 | error-handling.md#datasource-schema-errors |
| 資料表列表載入失敗           | 「無法連線至資料來源，請至資料來源設定頁面確認連線設定」 | error-handling.md#datasource-schema-errors |
| 非 Admin 操作                | HTTP 403，「您沒有權限執行此操作」                   | error-handling.md#auth-errors            |
| 伺服器錯誤                   | 「系統發生非預期錯誤，請稍後再試」                   | error-handling.md#system-errors          |

## 12. 相依性

- **F011（新增資料來源）**：需有資料來源才能建立擷取任務
- **F018（查看擷取任務清單）**：建立成功後導向清單頁面
- **認證系統**：需要有效的 Admin 登入 Session/Token
- 封鎖：F018, F019, F020, F021, F022, F023, F024, F025

## 13. 資料需求

- ExtractionTask 實體：參見 [data-model.md#extraction-task-entity](../data-model.md#extraction-task-entity)
- 新增記錄時自動設定 `created_at`、`updated_at` 時間戳記
- `created_by` 記錄建立者的 User ID

## 14. 交叉參考

- 資料模型：[data-model.md#extraction-task-entity](../data-model.md#extraction-task-entity)
- 錯誤處理：[error-handling.md#extraction-errors](../error-handling.md#extraction-errors)
- 非功能需求：[nfr.md](../nfr.md)
- 相關功能：[F018](F018-view-extraction-task-list.md)、[F021](F021-run-extraction-task.md)、[F023](F023-scheduled-extraction.md)
