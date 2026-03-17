---
spec-id: data-model
title: 資料模型
version: "1.0"
date: 2026-03-06
status: Draft
---

# 資料模型

本文件定義 CDMP MVP 所需的概念層級資料實體、屬性、約束與關聯。此為邏輯模型，非資料庫 Schema — 實際欄位命名與型別由實作團隊依技術棧決定。

參見 [diagrams/er-diagram.md](diagrams/er-diagram.md) 取得實體關係圖。

---

## User 實體 {#user-entity}

使用者帳號，為系統的核心身份實體。

| 屬性 | 說明 | 約束 | 備註 |
|------|------|------|------|
| id | 唯一識別碼 | 主鍵，系統自動產生 | UUID 或自增整數 |
| name | 使用者姓名 | 必填，最大長度 100 字元 | |
| email | 電子郵件 | 必填，唯一，最大長度 255 字元 | 儲存前強制轉為小寫（`toLowerCase()`），確保大小寫不敏感的唯一性 |
| password_hash | 密碼雜湊值 | 必填 | bcrypt 雜湊，cost factor >= 10。明文密碼絕不儲存 |
| role | 角色 | 必填，列舉值：`admin` / `user` | 預設值由建立時指定 |
| status | 帳號狀態 | 必填，列舉值：`active` / `disabled` | 預設值：`active` |
| created_at | 建立時間 | 必填，系統自動設定 | UTC 時間戳記 |
| updated_at | 最後更新時間 | 必填，系統自動更新 | UTC 時間戳記 |

**業務規則**：

- Email 唯一性比對為大小寫不敏感（儲存時強制小寫）
- Email 格式須符合 RFC 5322 基礎規範
- 密碼最短 8 個字元（驗證發生在雜湊之前）
- 系統必須至少保留一個 `role = admin` 且 `status = active` 的帳號
- 停用帳號（`status = disabled`）無法登入，嘗試登入時顯示停用訊息

**相關功能**：[F004](features/F004-create-account.md), [F005](features/F005-view-account-list.md), [F006](features/F006-edit-account.md), [F007](features/F007-disable-enable-account.md), [F008](features/F008-assign-change-role.md)

---

## Session / Token 管理 {#session-token}

JWT Token 用於 Session 管理。系統需維護一個 Token blocklist（封鎖清單）以支援登出與強制失效。

### Token 結構（JWT Payload）

| 欄位 | 說明 | 備註 |
|------|------|------|
| user_id | 使用者 ID | 對應 User.id |
| role | 使用者角色 | `admin` / `user` |
| iat（issued_at） | 發行時間 | Unix timestamp |
| exp（expiration） | 到期時間 | 預設：iat + 8h（閒置逾時）；記住我：iat + 30d |

### Token Blocklist

| 屬性 | 說明 | 約束 | 備註 |
|------|------|------|------|
| token | Token 識別碼 | 必填 | 可為完整 Token 或 JTI（JWT ID） |
| user_id | 使用者 ID | 必填 | 外鍵關聯 User.id |
| revoked_at | 撤銷時間 | 必填，系統自動設定 | UTC 時間戳記 |
| expires_at | 原始到期時間 | 必填 | 用於定期清理已過期的 blocklist 記錄 |

**業務規則**：

- 登出時將當前 Token 加入 blocklist
- 停用帳號時，該使用者所有有效 Token 加入 blocklist
- 密碼重設成功後，該使用者所有有效 Token 加入 blocklist
- Blocklist 中已超過 `expires_at` 的記錄可定期清理

**相關功能**：[F001](features/F001-admin-login.md), [F002](features/F002-user-login.md), [F003](features/F003-logout.md)

---

## PasswordResetToken 實體 {#password-reset-token}

密碼重設 Token，用於自助式密碼重設流程。

| 屬性 | 說明 | 約束 | 備註 |
|------|------|------|------|
| id | 唯一識別碼 | 主鍵，系統自動產生 | |
| user_id | 使用者 ID | 必填，外鍵關聯 User.id | |
| token | 重設 Token 值 | 必填，唯一 | UUID 或 JWT，透過 Email 連結傳遞 |
| expires_at | 到期時間 | 必填 | 建立後 24 小時 |
| used_at | 使用時間 | 可為空 | 成功重設後設定，標記為已使用 |
| created_at | 建立時間 | 必填，系統自動設定 | UTC 時間戳記 |

**業務規則**：

- Token 有效期為 24 小時
- Token 為一次性使用：成功重設後 `used_at` 被設定，Token 即失效
- 已過期的 Token（`expires_at < 當前時間`）不可使用
- 已使用的 Token（`used_at IS NOT NULL`）不可再次使用
- 系統不揭露 Email 是否已註冊 — 無論 Email 是否存在，回應訊息一致

**相關功能**：[F009](features/F009-self-service-password-reset.md)

---

## Datasource 實體 {#datasource-entity}

資料來源（資料庫連線設定），為 CDMP 平台管理的核心資源。

| 屬性 | 說明 | 約束 | 備註 |
|------|------|------|------|
| id | 唯一識別碼 | 主鍵，系統自動產生 | |
| name | 資料來源名稱 | 必填，唯一（排除已軟刪除），最大長度 100 字元 | 用於顯示與識別 |
| type | 資料庫類型 | 必填，列舉值：`mysql` / `postgresql` / `sqlserver` | |
| host | 主機位址 | 必填，最大長度 255 字元 | IP 或 hostname |
| port | 連接埠 | 必填，整數，範圍 1-65535 | 預設值依類型：MySQL=3306, PostgreSQL=5432, SQL Server=1433 |
| database_name | 資料庫名稱 | 必填，最大長度 100 字元 | |
| username | 連線帳號 | 必填，最大長度 100 字元 | |
| encrypted_password | 加密後的連線密碼 | 必填 | AES-256 加密儲存，API 回應中以遮罩呈現 |
| description | 描述 | 選填，最大長度 500 字元 | |
| status | 連線狀態 | 必填，列舉值：`connected` / `disconnected` / `unknown` | 預設值：`unknown` |
| last_tested_at | 最後測試時間 | 可為空 | 連線測試或自動健康檢查後更新 |
| created_by | 建立者 ID | 必填，外鍵關聯 User.id | 記錄建立此資料來源的 Admin |
| deleted_at | 軟刪除時間 | 可為空 | 非 NULL 表示已刪除 |
| created_at | 建立時間 | 必填，系統自動設定 | UTC 時間戳記 |
| updated_at | 最後更新時間 | 必填，系統自動更新 | UTC 時間戳記 |

**業務規則**：

- 名稱唯一性僅在未刪除的記錄中檢查（`deleted_at IS NULL`）
- 密碼以 AES-256 加密後儲存，API 回應中絕不回傳明文
- 編輯時若密碼欄位為空，保留現有密碼
- 編輯後 `status` 重設為 `unknown`
- 軟刪除：設定 `deleted_at` 時間戳記，記錄保留於資料庫但從所有查詢中排除
- 軟刪除的資料來源排除在自動健康檢查範圍外
- 預設連接埠：MySQL=3306, PostgreSQL=5432, SQL Server=1433

**相關功能**：[F011](features/F011-add-datasource.md), [F012](features/F012-view-datasource-list.md), [F013](features/F013-edit-datasource.md), [F014](features/F014-delete-datasource.md), [F015](features/F015-test-connection.md), [F016](features/F016-datasource-status-dashboard.md)

---

## DatasourceHealthLog 實體 {#datasource-health-log}

資料來源健康檢查歷史記錄，用於趨勢圖與告警判斷。

| 屬性 | 說明 | 約束 | 備註 |
|------|------|------|------|
| id | 唯一識別碼 | 主鍵，系統自動產生 | |
| datasource_id | 資料來源 ID | 必填，外鍵關聯 Datasource.id | |
| success | 檢查是否成功 | 必填，布林值 | |
| response_time_ms | 回應時間（毫秒） | 可為空 | 成功時記錄，失敗時可為空 |
| error_message | 錯誤訊息 | 可為空 | 失敗時記錄具體錯誤訊息 |
| checked_at | 檢查時間 | 必填，系統自動設定 | UTC 時間戳記 |

**業務規則**：

- 每次手動測試連線或自動健康檢查均產生一筆記錄
- 自動健康檢查每 30 分鐘執行一次
- 用於儀表板趨勢圖（24h / 7d / 30d）
- 用於告警判斷：連續 2 次以上檢查失敗觸發告警
- 資料來源恢復連線（成功）後，自動從告警列表移除
- 歷史記錄保留 90 天，超過自動清理（參見 OQ-10 決議）

**相關功能**：[F015](features/F015-test-connection.md), [F016](features/F016-datasource-status-dashboard.md)

---

## ExtractionTask 實體 {#extraction-task-entity}

擷取任務設定，定義從資料來源擷取資料的執行計畫。

| 屬性 | 說明 | 約束 | 備註 |
|------|------|------|------|
| id | 唯一識別碼 | 主鍵，系統自動產生 | UUID |
| name | 任務名稱 | 必填，唯一（排除已軟刪除），最大長度 255 字元 | 用於顯示與識別 |
| datasource_id | 資料來源 ID | 必填，外鍵關聯 Datasource.id | 不可為已軟刪除的 Datasource |
| mode | 擷取模式 | 必填，列舉值：`full` / `incremental` | full=全量，incremental=增量 |
| status | 任務狀態 | 必填，列舉值：`running` / `scheduled` / `completed` / `failed` / `disabled` | 預設值：`scheduled` |
| target_table | 目標資料表名稱 | 必填，最大長度 255 字元 | 來源資料庫中的表名 |
| incremental_column | 增量欄位名稱 | 增量模式必填，最大長度 255 字元 | 用於增量擷取的比對欄位 |
| last_incremental_value | 最後增量值 | 可為空，最大長度 255 字元 | 上次增量擷取的最後值 |
| schedule | Cron 表達式 | 必填，最大長度 100 字元 | 標準 cron 格式，以 UTC 解析 |
| last_execution_at | 最後執行時間 | 可為空 | UTC timestamp |
| extracted_count | 已擷取筆數 | 預設 0 | 最近一次執行的擷取筆數 |
| total_count | 總筆數 | 預設 0 | 最近一次執行的來源總筆數 |
| progress_percent | 進度百分比 | 預設 0，範圍 0-100 | DECIMAL(5,2) |
| avg_duration_ms | 平均執行時間 | 預設 0 | 所有成功執行的平均時間（毫秒） |
| execution_count | 累計執行次數 | 預設 0 | 所有已完成執行的次數 |
| error_message | 最後錯誤訊息 | 可為空 | TEXT 類型 |
| enabled | 是否啟用 | 必填，布林值，預設 `true` | 停用後排程不觸發 |
| created_by | 建立者 ID | 必填，外鍵關聯 User.id | 記錄建立此任務的 Admin |
| deleted_at | 軟刪除時間 | 可為空 | 非 NULL 表示已刪除 |
| created_at | 建立時間 | 必填，系統自動設定 | UTC timestamp |
| updated_at | 最後更新時間 | 必填，系統自動更新 | UTC timestamp |

**業務規則**：

- 名稱唯一性僅在未刪除的記錄中檢查（`deleted_at IS NULL`）
- 增量模式下 `incremental_column` 為必填
- 建立時預設 `status = 'scheduled'`、`enabled = true`
- 停用時 `enabled = false`、`status = 'disabled'`
- 啟用時 `enabled = true`、`status = 'scheduled'`
- `status` 為 `running` 時不允許編輯、停用、刪除
- 軟刪除後從所有清單、儀表板、排程中排除
- Cron 表達式以 UTC 時區解析
- 日期欄位使用 `timestamp` 類型（PostgreSQL 不支援 `datetime`）

**相關功能**：[F017](features/F017-create-extraction-task.md), [F018](features/F018-view-extraction-task-list.md), [F019](features/F019-edit-extraction-task.md), [F020](features/F020-toggle-extraction-task.md), [F021](features/F021-run-extraction-task.md), [F023](features/F023-scheduled-extraction.md), [F024](features/F024-extraction-dashboard.md), [F025](features/F025-delete-extraction-task.md)

---

## ExtractionLog 實體 {#extraction-log-entity}

擷取任務執行日誌，記錄每次執行的詳細資訊。

| 屬性 | 說明 | 約束 | 備註 |
|------|------|------|------|
| id | 唯一識別碼 | 主鍵，系統自動產生 | UUID |
| task_id | 擷取任務 ID | 必填，外鍵關聯 ExtractionTask.id | |
| status | 執行狀態 | 必填，列舉值：`running` / `completed` / `failed` | |
| started_at | 開始時間 | 必填，系統自動設定 | UTC timestamp |
| finished_at | 結束時間 | 可為空 | 執行完成後設定，UTC timestamp |
| duration_ms | 執行時間（毫秒） | 可為空 | 執行完成後計算 |
| extracted_count | 擷取筆數 | 預設 0 | 本次執行的擷取筆數 |
| total_count | 總筆數 | 預設 0 | 本次執行的來源總筆數 |
| error_message | 錯誤訊息 | 可為空 | TEXT 類型，失敗時記錄 |
| triggered_by | 觸發方式 | 必填，列舉值：`schedule` / `manual` / `retry` | |
| created_by | 執行者 ID | 必填，外鍵關聯 User.id | 排程觸發時為系統帳號或建立者 |

**業務規則**：

- 每次執行（手動、排程、重新執行）均產生一筆記錄
- 日誌不隨 ExtractionTask 軟刪除而清除，永久保留
- `duration_ms = finished_at - started_at`（毫秒）
- `triggered_by` 區分觸發來源：`manual`（手動）、`schedule`（排程）、`retry`（重新執行）
- 日期欄位使用 `timestamp` 類型（PostgreSQL 不支援 `datetime`）

**相關功能**：[F021](features/F021-run-extraction-task.md), [F022](features/F022-view-extraction-logs.md), [F023](features/F023-scheduled-extraction.md), [F024](features/F024-extraction-dashboard.md)

---

## 實體關係

```
User (1) ──── creates ────> (*) Datasource
User (1) ──── has ────> (*) Token Blocklist
User (1) ──── has ────> (*) PasswordResetToken
User (1) ──── creates ────> (*) ExtractionTask
Datasource (1) ──── has ────> (*) DatasourceHealthLog
Datasource (1) ──── referenced by ──> (*) ExtractionTask
ExtractionTask (1) ──── has ────> (*) ExtractionLog
```

| 關係 | 描述 | 基數 |
|------|------|------|
| User → Datasource | User（Admin）建立資料來源 | 一對多（`created_by`） |
| User → Token Blocklist | 使用者的已撤銷 Token | 一對多（`user_id`） |
| User → PasswordResetToken | 使用者的密碼重設 Token | 一對多（`user_id`） |
| User → ExtractionTask | User（Admin）建立擷取任務 | 一對多（`created_by`） |
| Datasource → DatasourceHealthLog | 資料來源的健康檢查記錄 | 一對多（`datasource_id`） |
| Datasource → ExtractionTask | 資料來源被擷取任務參照 | 一對多（`datasource_id`） |
| ExtractionTask → ExtractionLog | 擷取任務的執行日誌 | 一對多（`task_id`） |

參見 [diagrams/er-diagram.md](diagrams/er-diagram.md) 取得完整 ER 圖。

---

## 狀態轉換

### User 帳號狀態 {#user-status-transitions}

```
[建立帳號] → active
active → disabled  （Admin 停用，F007）
disabled → active  （Admin 啟用，F007）
```

- 帳號建立時預設為 `active`
- 僅 Admin 可變更狀態
- Admin 不可停用自己的帳號
- 停用時強制失效該使用者所有 Session

### Datasource 連線狀態 {#datasource-status-transitions}

```
[新增資料來源] → unknown
unknown → connected     （測試成功，F015）
unknown → disconnected  （測試失敗，F015）
connected → disconnected（測試失敗，F015/F016）
connected → unknown     （編輯後重設，F013）
disconnected → connected（測試成功，F015/F016）
disconnected → unknown  （編輯後重設，F013）
```

- 新增時預設為 `unknown`
- 編輯連線參數後重設為 `unknown`
- 手動測試或自動健康檢查根據結果更新為 `connected` 或 `disconnected`
- 軟刪除後不再參與狀態更新

### Datasource 生命週期 {#datasource-lifecycle}

```
[新增] → 正常使用 → [軟刪除]（設定 deleted_at）
軟刪除 → [DBA 手動復原]（將 deleted_at 設為 NULL）→ 正常使用
```

- 軟刪除後從所有清單、儀表板、健康檢查中排除
- 復原僅能透過資料庫層級操作（非 API 功能）

### ExtractionTask 任務狀態 {#extraction-task-status-transitions}

```
[建立任務] → scheduled                      （F017）
scheduled → running                          （手動執行 F021 / 排程觸發 F023）
scheduled → disabled                         （停用 F020）
running → completed                          （執行成功）
running → failed                             （執行失敗）
completed → running                          （手動執行 F021 / 排程觸發 F023）
completed → disabled                         （停用 F020）
failed → running                             （重新執行 F021 / 排程觸發 F023）
failed → disabled                            （停用 F020）
disabled → scheduled                         （啟用 F020）
disabled → running                           （手動執行 F021，手動不受停用限制）
```

- 建立時預設為 `scheduled`
- `running` 狀態下不可編輯、停用、刪除
- 停用時 `status` 設為 `disabled`，啟用時 `status` 設為 `scheduled`
- 手動執行不受 `enabled` 限制（即使停用也可手動觸發）
- 軟刪除後不再參與狀態更新

參見 [diagrams/extraction-task-states.md](diagrams/extraction-task-states.md) 取得狀態轉換圖。

### ExtractionTask 生命週期 {#extraction-task-lifecycle}

```
[建立] → 正常使用（排程執行 / 手動執行）→ [軟刪除]（設定 deleted_at）
```

- 軟刪除後從所有清單、儀表板、排程中排除
- ExtractionLog 不隨任務刪除而清除
