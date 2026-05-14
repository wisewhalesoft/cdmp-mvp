---
spec-id: data-model
title: 資料模型
version: "1.11"
date: 2026-05-13
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
| role | 角色 | 必填，列舉值：`admin` / `user` | 系統角色：admin、user（詳見 US-017） |
| status | 帳號狀態 | 必填，列舉值：`active` / `disabled` | 預設值：`active` |
| created_at | 建立時間 | 必填，系統自動設定 | UTC 時間戳記 |
| updated_at | 最後更新時間 | 必填，系統自動更新 | UTC 時間戳記 |

**業務規則**：

- Email 唯一性比對為大小寫不敏感（儲存時強制小寫）
- Email 格式須符合 RFC 5322 基礎規範
- 密碼最短 8 個字元（驗證發生在雜湊之前）
- 系統必須至少保留一個 `role = admin` 且 `status = active` 的帳號
- 停用帳號（`status = disabled`）無法登入，嘗試登入時顯示停用訊息
- `role` 欄位僅可使用 2 種預設值（admin、user）；不支援自訂角色（US-017 AC-2）
- 2 種角色為系統預設，不提供 API 新增或刪除（Seed Data 策略）

**相關功能**：[F004](features/F004-create-account.md), [F005](features/F005-view-account-list.md), [F006](features/F006-edit-account.md), [F007](features/F007-disable-enable-account.md), [F008](features/F008-assign-change-role.md), [F045](features/F045-business-role-definitions.md)

---

## Role 實體 {#role-entity}

系統預設角色定義，為 Seed Data，不可由使用者動態新增或刪除。

| 屬性 | 說明 | 約束 | 備註 |
|------|------|------|------|
| role_code | 角色代碼 | 主鍵，最大長度 50 字元 | 如 `admin`、`user` |
| display_name | 中文顯示名稱 | 必填，最大長度 50 字元 | 如「管理者」、「使用者」 |
| alias | 別名 | 可為空，最大長度 50 字元 | 如「Admin」、「User」 |
| type | 角色類型 | 必填，列舉值：`system` | system=系統角色 |
| created_at | 建立時間 | 必填，系統自動設定 | Seed Data 建立時設定，UTC 時間戳記 |

### 預設 Seed Data（2 筆）

| role_code | display_name | alias | type |
|-----------|-------------|-------|------|
| admin | 管理者 | Admin | system |
| user | 使用者 | User | system |

**業務規則**：

- 角色為系統預設 Seed Data，透過 migration script 於系統初始化時建立
- migration 須為冪等（idempotent）：使用 `INSERT ... ON CONFLICT DO NOTHING` 或等效語法
- 不提供 `POST /api/roles`（新增）與 `DELETE /api/roles/:code`（刪除）API 端點
- User 實體的 `role` 欄位值必須為 Role 實體中存在的 `role_code`
- 角色顯示名稱格式：無 alias 時顯示 `display_name`；有 alias 時顯示 `display_name（alias）`
- 日期欄位使用 `timestamp` 類型（PostgreSQL 不支援 `datetime`）

**相關功能**：[F045](features/F045-business-role-definitions.md), [F004](features/F004-create-account.md), [F008](features/F008-assign-change-role.md)

---

## Session / Token 管理 {#session-token}

JWT Token 用於 Session 管理。系統需維護一個 Token blocklist（封鎖清單）以支援登出與強制失效。

### Token 結構（JWT Payload）

| 欄位 | 說明 | 備註 |
|------|------|------|
| user_id | 使用者 ID | 對應 User.id |
| role | 使用者角色 | `admin` / `user`（2 種） |
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
| name | 資料來源名稱 | 必填，與 `database_name` 組成複合唯一（排除已軟刪除，大小寫不敏感），最大長度 100 字元 | 用於顯示與識別；不同資料庫下允許相同名稱 |
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

- 「名稱（name）＋ 資料庫名稱（database_name）」複合唯一性僅在未刪除的記錄中檢查（`deleted_at IS NULL`），名稱比對不區分大小寫；不同資料庫下允許存在相同名稱
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
| source_schema | 來源 Schema 名稱 | 可為空，最大長度 255 字元 | 外部資料來源的 schema（或 database）名稱。各資料庫類型對應：PostgreSQL = schema（如 `public`）、MySQL = database name、SQL Server = schema（如 `dbo`）、Oracle = owner/user name。參見下方「各資料庫類型的 Schema 對應」說明 |
| source_table | 來源資料表名稱 | 必填，最大長度 255 字元 | 外部資料來源中要讀取的表名（從下拉選單選擇，非手動輸入） |
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
- `source_schema` 與 `source_table` 均透過下拉選單從外部資料來源動態載入選擇，不支援手動輸入
- 建立時預設 `status = 'scheduled'`、`enabled = true`
- 停用時 `enabled = false`、`status = 'disabled'`
- 啟用時 `enabled = true`、`status = 'scheduled'`
- `status` 為 `running` 時不允許編輯、停用、刪除
- 軟刪除後從所有清單、儀表板、排程中排除
- Cron 表達式以 UTC 時區解析
- 日期欄位使用 `timestamp` 類型（PostgreSQL 不支援 `datetime`）
- 執行 SQL 時，若 `source_schema` 有值，後端組合為 `"source_schema"."source_table"` 格式（各 DB 類型依實際語法處理）

**各資料庫類型的 Schema 對應** {#schema-mapping}：

| 資料庫類型 | `source_schema` 對應概念 | 範例值 | 說明 |
|-----------|------------------------|--------|------|
| PostgreSQL | Schema | `public`, `information_schema` | PostgreSQL 原生 schema 概念；一個 database 下可有多個 schema |
| MySQL | Database | `mydb`, `sakila` | MySQL 的 schema 等同於 database；Datasource 連線設定的 `database_name` 決定預設 database，但可查詢其他 database |
| SQL Server | Schema | `dbo`, `HumanResources` | SQL Server 原生 schema 概念；database 由 Datasource 連線設定決定 |
| Oracle | Schema (Owner) | `HR`, `SCOTT` | Oracle 的 schema 等同於 user/owner name |

**相關功能**：[F017](features/F017-create-extraction-task.md), [F018](features/F018-view-extraction-task-list.md), [F019](features/F019-edit-extraction-task.md), [F020](features/F020-toggle-extraction-task.md), [F021](features/F021-run-extraction-task.md), [F023](features/F023-scheduled-extraction.md), [F024](features/F024-extraction-dashboard.md), [F025](features/F025-delete-extraction-task.md), [F026](features/F026-preview-raw-data.md)

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

## Raw Data 動態表 {#raw-data-table}

擷取任務執行時，系統於 CDMP AppDB 中動態建立的 raw data 落地表。每個擷取任務對應一張獨立的 raw data 表，表結構從外部來源表的 metadata 自動推斷。

### 命名規則

表名格式為 `raw_{task_id 前 8 碼}`，例如：task id 為 `a3f2c1d4-xxxx-xxxx-xxxx-xxxxxxxxxxxx`，則表名為 `raw_a3f2c1d4`。

### 表結構

| 欄位 | 來源 | 說明 |
|------|------|------|
| （來源表欄位） | 從外部來源表 metadata 自動推斷 | 欄位名稱與資料型別對應來源表的欄位定義 |
| _cdmp_id | 系統附加，SERIAL 類型 | 若來源表無主鍵，系統自動附加此欄位作為 raw data 表的唯一識別欄位並建立主鍵索引 |
| _cdmp_extracted_at | 系統附加，TIMESTAMP 類型 | 記錄該筆資料的擷取時間（UTC） |

### 動態建表機制

- **建立時機**：擷取任務首次執行時由系統自動建立，無需 Admin 手動操作
- **結構推斷**：系統連線至外部資料來源，透過 `INFORMATION_SCHEMA`（或同等機制）讀取來源表（由 `source_schema` + `source_table` 組合定位）的欄位 metadata（欄位名稱、資料型別），於 AppDB 建立同結構的 raw data 表
- **表名安全性**：表名由系統根據 task_id 自動生成，僅包含 `raw_` 前綴加上 hex 字元，不接受使用者輸入，避免 SQL Injection 風險
- **欄位名稱安全性**：從來源表讀取的欄位名稱需經過 sanitize 處理（僅允許字母、數字、底線），防止惡意欄位名稱造成 SQL Injection

### 資料寫入模式

| 模式 | 寫入行為 | 說明 |
|------|---------|------|
| 全量（full） | 先 TRUNCATE 再寫入 | 每次執行前清空 raw data 表，重新寫入全部資料 |
| 增量（incremental） | 追加寫入 | 根據 `incremental_column` 與 `last_incremental_value` 篩選新增資料（`WHERE col > last_value`），追加至 raw data 表 |

### 批次寫入策略

- 每批 1,000 筆 INSERT（可透過環境變數 `EXTRACTION_BATCH_SIZE` 配置，範圍 100-10,000）
- 批次寫入避免大量資料導致記憶體耗盡或資料庫逾時
- 每批次完成後更新 `ExtractionTask.extracted_count` 與 `progress_percent`

### 索引策略

- `_cdmp_id`（若存在）建立主鍵索引
- 來源表的主鍵欄位（若有）建立索引，以加速排序與分頁查詢
- 不自動為所有欄位建立索引（避免寫入效能下降）

### 業務規則

- Raw data 表的生命週期與 ExtractionTask 綁定
- ExtractionTask 軟刪除後，raw data 表保留（不自動刪除），待 DBA 手動清理
- 變更 `source_schema` 或 `source_table` 欄位後，下次執行時系統重新推斷欄位結構並可能重建 raw data 表
- Raw data 表不納入 ORM Entity 管理，透過動態 SQL 操作

**相關功能**：[F021](features/F021-run-extraction-task.md), [F026](features/F026-preview-raw-data.md)

---

## 實體關係

```
User (1) ──── creates ────> (*) Datasource
User (1) ──── has ────> (*) Token Blocklist
User (1) ──── has ────> (*) PasswordResetToken
User (1) ──── creates ────> (*) ExtractionTask
User (1) ──── creates ────> (*) EtlPipeline
Datasource (1) ──── has ────> (*) DatasourceHealthLog
Datasource (1) ──── referenced by ──> (*) ExtractionTask
ExtractionTask (1) ──── has ────> (*) ExtractionLog
ExtractionTask (1) ──── owns ───> (1) Raw Data Table (動態建立)
EtlPipeline (1) ──── has ────> (*) EtlPipelineVersion
EtlPipeline (1) ──── has ────> (*) EtlPipelineLog
EtlPipeline (*) ──── reads ───> (*) Raw Data Table (Extract 節點)
EtlPipeline (*) ──── writes ──> (*) Target Table (Load 節點)
```

| 關係 | 描述 | 基數 |
|------|------|------|
| User → Datasource | User（Admin）建立資料來源 | 一對多（`created_by`） |
| User → Token Blocklist | 使用者的已撤銷 Token | 一對多（`user_id`） |
| User → PasswordResetToken | 使用者的密碼重設 Token | 一對多（`user_id`） |
| User → ExtractionTask | User（Admin）建立擷取任務 | 一對多（`created_by`） |
| User → EtlPipeline | User（Admin）建立 Pipeline | 一對多（`created_by`） |
| Datasource → DatasourceHealthLog | 資料來源的健康檢查記錄 | 一對多（`datasource_id`） |
| Datasource → ExtractionTask | 資料來源被擷取任務參照 | 一對多（`datasource_id`） |
| ExtractionTask → ExtractionLog | 擷取任務的執行日誌 | 一對多（`task_id`） |
| ExtractionTask → Raw Data Table | 擷取任務擁有對應的 raw data 動態表 | 一對一（`raw_{task_id_short}`） |
| EtlPipeline → EtlPipelineVersion | Pipeline 的版本紀錄 | 一對多（`pipeline_id`） |
| EtlPipeline → EtlPipelineLog | Pipeline 的執行日誌 | 一對多（`pipeline_id`） |
| EtlPipeline → Raw Data Table | Pipeline 的 Extract 節點讀取 raw data | 多對多（透過 definition JSONB） |
| EtlPipeline → Target Table | Pipeline 的 Load 節點寫入目標表 | 多對多（透過 definition JSONB） |

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

### EtlPipeline 狀態 {#etl-pipeline-status-transitions}

```
[建立 Pipeline] → draft                          （F028）
draft → active                                    （啟用 F031，前提為有 published 版本）
draft → running                                   （測試執行 F030，is_test_run=true）
active → running                                  （手動執行 F030 / 排程觸發）
active → disabled                                 （停用 F031）
running → active                                  （執行成功，若先前為 active）
running → draft                                   （測試執行成功/失敗，若先前為 draft）
running → failed                                  （執行失敗）
failed → running                                  （重新執行 F030）
failed → disabled                                 （停用 F031）
disabled → active                                 （啟用 F031）
```

- 建立時預設為 `draft`
- `running` 狀態下不可刪除
- 停用時 `status` 設為 `disabled`，啟用時 `status` 設為 `active`
- 草稿狀態允許測試執行（`is_test_run = true`），不影響正式排程
- 手動執行不受 `enabled` 限制（即使停用也可手動觸發 active Pipeline）

參見 [diagrams/pipeline-states.md](diagrams/pipeline-states.md) 取得狀態轉換圖。

### EtlPipeline 生命週期 {#etl-pipeline-lifecycle}

```
[建立] → 草稿（編輯 / 測試執行）→ 發布（排程執行 / 手動執行）→ [軟刪除]（設定 deleted_at）
```

- 軟刪除後從所有清單、儀表板、排程中排除
- EtlPipelineLog 不隨 Pipeline 刪除而清除

### EtlPipelineVersion 版本狀態 {#etl-pipeline-version-status-transitions}

```
[建立版本 / 儲存編輯] → draft
draft → testing                                   （發起測試執行 F030）
testing → published                               （發布 F033，前提為通過測試執行）
```

- 版本狀態為單向流轉：`draft` -> `testing` -> `published`
- 發布前必須至少完成一次成功的測試執行
- 回滾操作建立新版本（內容複製），不修改舊版本狀態

參見 [diagrams/pipeline-version-states.md](diagrams/pipeline-version-states.md) 取得版本狀態轉換圖。

---

## EtlPipeline 實體 {#etl-pipeline-entity}

ETL Pipeline 定義，描述從 raw data 經過轉換後載入目標表的完整資料處理流程。

| 屬性 | 說明 | 約束 | 備註 |
|------|------|------|------|
| id | 唯一識別碼 | 主鍵，系統自動產生 | UUID |
| name | Pipeline 名稱 | 必填，唯一（排除已軟刪除），最大長度 255 字元 | 用於顯示與識別 |
| description | Pipeline 描述 | 選填，TEXT 類型 | |
| version | 當前版本號 | 必填，整數，預設 1 | 每次儲存新版本時遞增 |
| step_count | 節點步驟數 | 預設 0 | 根據 definition 中 nodes 數量計算 |
| status | Pipeline 狀態 | 必填，列舉值：`draft` / `active` / `running` / `failed` / `disabled` | 預設值：`draft` |
| schedule | Cron 表達式 | 選填，最大長度 100 字元 | 標準 cron 格式，以 UTC 解析 |
| last_execution_at | 最後執行時間 | 可為空 | UTC timestamp |
| next_execution_at | 下次排程時間 | 可為空 | 由排程引擎計算填入，UTC timestamp |
| processed_count | 累計處理筆數 | 預設 0 | 所有成功執行的總處理筆數 |
| avg_duration_ms | 平均執行時間 | 預設 0 | 所有成功執行的平均時間（毫秒） |
| execution_count | 累計執行次數 | 預設 0 | 所有已完成執行的次數 |
| enabled | 是否啟用 | 必填，布林值，預設 `false` | 停用後排程不觸發 |
| created_by | 建立者 ID | 必填，外鍵關聯 User.id | 記錄建立此 Pipeline 的 Admin |
| deleted_at | 軟刪除時間 | 可為空 | 非 NULL 表示已刪除 |
| created_at | 建立時間 | 必填，系統自動設定 | UTC timestamp |
| updated_at | 最後更新時間 | 必填，系統自動更新 | UTC timestamp |

**業務規則**：

- 名稱唯一性僅在未刪除的記錄中檢查（`deleted_at IS NULL`）
- 建立時預設 `status = 'draft'`、`enabled = false`、`version = 1`
- 停用時 `enabled = false`、`status = 'disabled'`
- 啟用時需有至少一個 `published` 狀態的 EtlPipelineVersion，啟用後 `enabled = true`、`status = 'active'`
- `status` 為 `running` 時不允許刪除
- 軟刪除後從所有清單、儀表板、排程中排除
- EtlPipelineLog 不隨 Pipeline 軟刪除而清除
- Cron 表達式以 UTC 時區解析
- 日期欄位使用 `timestamp` 類型（PostgreSQL 不支援 `datetime`）
- 排程執行時使用最新的 `published` 狀態版本

**相關功能**：[F027](features/F027-pipeline-list.md), [F028](features/F028-create-pipeline.md), [F029](features/F029-pipeline-editor.md), [F030](features/F030-execute-pipeline.md), [F031](features/F031-toggle-pipeline.md), [F032](features/F032-pipeline-logs.md), [F033](features/F033-pipeline-version.md), [F034](features/F034-delete-pipeline.md), [F035](features/F035-pipeline-dashboard.md)

---

## EtlPipelineVersion 實體 {#etl-pipeline-version-entity}

Pipeline 版本紀錄，儲存每個版本的完整 Pipeline 定義（節點與連線結構）。

| 屬性 | 說明 | 約束 | 備註 |
|------|------|------|------|
| id | 唯一識別碼 | 主鍵，系統自動產生 | UUID |
| pipeline_id | 關聯 Pipeline | 必填，外鍵關聯 EtlPipeline.id | |
| version | 版本號 | 必填，整數 | 同一 Pipeline 下遞增 |
| definition | Pipeline 定義 | 必填，JSONB 類型 | 節點與連線的完整結構（nodes + edges） |
| status | 版本狀態 | 必填，列舉值：`draft` / `testing` / `published` | 預設值：`draft` |
| change_summary | 變更摘要 | 選填，最大長度 500 字元 | |
| created_by | 建立者 ID | 必填，外鍵關聯 User.id | |
| created_at | 建立時間 | 必填，系統自動設定 | UTC timestamp |

**JSONB definition 結構**：

```json
{
  "nodes": [
    {
      "id": "string (節點唯一 ID)",
      "type": "string (節點類型，如 extract / transform-merge / load)",
      "position": { "x": 0, "y": 0 },
      "data": { "...節點類型對應的設定資料" }
    }
  ],
  "edges": [
    {
      "id": "string (連線唯一 ID)",
      "source": "string (來源節點 ID)",
      "target": "string (目標節點 ID)"
    }
  ]
}
```

**業務規則**：

- 版本狀態流程：`draft` -> `testing` -> `published`
- 發布前必須至少完成一次成功的測試執行（`is_test_run = true`）
- 同一 Pipeline 同時間只能有一個 `published` 版本（發布新版本時，舊的 published 版本保留原狀態不變）
- 回滾操作不修改舊版本，而是建立一個新版本（內容複製自舊版本），狀態為 `draft`
- 排程引擎僅使用最新的 `published` 版本執行
- 日期欄位使用 `timestamp` 類型（PostgreSQL 不支援 `datetime`）

**相關功能**：[F029](features/F029-pipeline-editor.md), [F033](features/F033-pipeline-version.md)

---

## EtlPipelineLog 實體 {#etl-pipeline-log-entity}

Pipeline 執行日誌，記錄每次執行的詳細資訊，包含各節點的執行記錄。

| 屬性 | 說明 | 約束 | 備註 |
|------|------|------|------|
| id | 唯一識別碼 | 主鍵，系統自動產生 | UUID |
| pipeline_id | 關聯 Pipeline | 必填，外鍵關聯 EtlPipeline.id | |
| version | 執行時的版本號 | 必填，整數 | 記錄執行時使用的版本 |
| status | 執行狀態 | 必填，列舉值：`running` / `completed` / `failed` | |
| started_at | 開始時間 | 必填，系統自動設定 | UTC timestamp |
| finished_at | 結束時間 | 可為空 | 執行完成後設定，UTC timestamp |
| duration_ms | 執行時間（毫秒） | 可為空 | 執行完成後計算 |
| processed_count | 處理筆數 | 預設 0 | 本次執行的處理筆數 |
| error_message | 錯誤訊息 | 可為空 | TEXT 類型，失敗時記錄 |
| node_logs | 各節點執行記錄 | 可為空，JSONB 類型 | 每個節點的詳細執行紀錄 |
| triggered_by | 觸發方式 | 必填，列舉值：`schedule` / `manual` / `test` / `retry` | |
| is_test_run | 是否為測試執行 | 必填，布林值，預設 `false` | 測試執行為 `true` |
| created_by | 執行者 ID | 必填，外鍵關聯 User.id | 排程觸發時為建立者 |

**JSONB node_logs 結構**：

```json
[
  {
    "nodeId": "string",
    "nodeName": "string (顯示名稱)",
    "nodeType": "string (節點類型)",
    "status": "completed | failed | skipped",
    "processedCount": 0,
    "durationMs": 0,
    "errorMessage": "string | null"
  }
]
```

**業務規則**：

- 每次執行（手動、排程、測試、重新執行）均產生一筆記錄
- 日誌不隨 EtlPipeline 軟刪除而清除，永久保留
- `duration_ms = finished_at - started_at`（毫秒）
- `triggered_by` 區分觸發來源：`manual`（手動）、`schedule`（排程）、`test`（測試）、`retry`（重新執行）
- `is_test_run = true` 的執行記錄不影響正式資料統計
- 日期欄位使用 `timestamp` 類型（PostgreSQL 不支援 `datetime`）

**相關功能**：[F030](features/F030-execute-pipeline.md), [F032](features/F032-pipeline-logs.md), [F035](features/F035-pipeline-dashboard.md)

---

## 目標表（Domain-Oriented Data Products） {#target-tables}

ETL Pipeline 的 Load 節點載入目標。Phase 1 MVP 預先定義 1 個 Domain Data Product 目標表 `customer_core`（85 欄位），採用來源驅動（Source-Driven）的 Domain-Oriented 設計。目標表不納入 ORM Entity 管理，由系統預先建立並透過 Pipeline 執行時以動態 SQL 寫入。

Phase 2/3 的 `customer_interaction`、`customer_financial`、`customer_service` 待對應來源系統接入後再建立，不預建無法填充的空表。

### 命名規則

| 目標表 | 表名 | Domain | 說明 | 階段 |
|--------|------|--------|------|------|
| Customer Core | `customer_core` | core | 客戶身分、聯絡、職業、財務概況與風控旗標 | Phase 1 MVP |
| Customer Interaction | `customer_interaction` | interaction | 客戶行為與接觸紀錄 | Phase 2（待 CRM 接入） |
| Customer Financial | `customer_financial` | financial | 交易與風控資料 | Phase 2（待合約明細系統接入） |
| Customer Service | `customer_service` | service | 客服與申訴案件 | Phase 3（待客服工單系統接入） |

### 來源資料表 {#target-source-tables}

| 來源表 | 系統 | 說明 | 客戶類型欄位 |
|--------|------|------|-------------|
| ZZIP_BAMCUST_M | 核心系統 | 客戶主檔（個人/企業/外籍） | CUSTOM_MK: 01=個人, 02=企業, 04=外籍 |
| MLMCUSTOMER | 行銷/租賃系統 | 客戶主檔（個人/企業） | CUTYPE: 1=個人, 2=企業 |

兩系統以身分證字號/統一編號作為共同鍵（ZZIP.CUSTO_NO = MLMC.CUSTID）。

### customer_core 目標表 {#target-customer-core}

85 欄位，分 8 個分類。完整欄位定義（含來源對應與轉換邏輯）請參見 [F036-target-tables.md 第 11 節](features/F036-target-tables.md#11-目標表欄位定義--customer_core)。

#### A. 識別與分類（5 欄位）

| 欄位名稱 | 型別 | Nullable | PK | 說明 |
|----------|------|----------|-----|------|
| customer_id | UUID | 否 | 是 | 客戶唯一識別碼（代理鍵） |
| source_customer_no | VARCHAR(20) | 否 | | 來源客戶編號（身分證/統編） |
| customer_type | VARCHAR(2) | 否 | | 客戶類型（01=個人/02=企業/04=外籍） |
| name | VARCHAR(100) | 否 | | 姓名/企業名稱 |
| english_name | VARCHAR(60) | 是 | | 英文姓名 |

#### B. 個人屬性（5 欄位）

| 欄位名稱 | 型別 | Nullable | PK | 說明 |
|----------|------|----------|-----|------|
| gender | VARCHAR(1) | 是 | | 性別 |
| date_of_birth | DATE | 是 | | 生日 |
| marital_status | VARCHAR(1) | 是 | | 婚姻狀態 |
| education_code | VARCHAR(2) | 是 | | 學歷代碼 |
| education_desc | VARCHAR(50) | 是 | | 學歷描述（US-030 代碼轉換） |

#### C. 聯絡資訊（6 欄位）

| 欄位名稱 | 型別 | Nullable | PK | 說明 |
|----------|------|----------|-----|------|
| mobile_phone | VARCHAR(20) | 是 | | 行動電話 |
| home_phone | VARCHAR(20) | 是 | | 戶籍電話 |
| contact_phone | VARCHAR(20) | 是 | | 通訊電話 |
| office_phone | VARCHAR(20) | 是 | | 公司電話 |
| email | VARCHAR(40) | 是 | | Email |
| line_account | VARCHAR(50) | 是 | | Line 帳號 |

#### D. 地址（6 欄位）

| 欄位名稱 | 型別 | Nullable | PK | 說明 |
|----------|------|----------|-----|------|
| residential_zip | VARCHAR(6) | 是 | | 戶籍郵遞區號 |
| residential_address | VARCHAR(100) | 是 | | 戶籍地址 |
| mailing_zip | VARCHAR(6) | 是 | | 通訊郵遞區號 |
| mailing_address | VARCHAR(100) | 是 | | 通訊地址 |
| company_zip | VARCHAR(6) | 是 | | 公司郵遞區號 |
| company_address | VARCHAR(100) | 是 | | 公司/營業地址 |

#### E. 職業與就業（10 欄位）

| 欄位名稱 | 型別 | Nullable | PK | 說明 |
|----------|------|----------|-----|------|
| company_name | VARCHAR(100) | 是 | | 服務公司/企業名稱 |
| occupation_code | VARCHAR(4) | 是 | | 職業代碼 |
| occupation_desc | VARCHAR(50) | 是 | | 職業描述（US-030 代碼轉換） |
| job_title_code | VARCHAR(4) | 是 | | 職稱代碼 |
| job_title_desc | VARCHAR(50) | 是 | | 職稱描述（US-030 代碼轉換） |
| job_level | VARCHAR(2) | 是 | | 職級 |
| industry_code | VARCHAR(6) | 是 | | 行業代碼 |
| industry_desc | VARCHAR(100) | 是 | | 行業描述（US-030 代碼轉換） |
| work_years | DECIMAL(8,2) | 是 | | 年資 |
| company_scale | VARCHAR(1) | 是 | | 公司規模 |

#### F. 財務與風控（10 欄位）

| 欄位名稱 | 型別 | Nullable | PK | 說明 |
|----------|------|----------|-----|------|
| monthly_income | DECIMAL(8,0) | 是 | | 月所得 |
| approved_income | INTEGER | 是 | | 認定月收入 |
| income_source | VARCHAR(5) | 是 | | 收入來源代碼 |
| capital | DECIMAL(12,0) | 是 | | 資本額 |
| credit_limit | DECIMAL(12,0) | 是 | | 核准額度 |
| has_real_estate | VARCHAR(1) | 是 | | 自有不動產 |
| debt_flag | CHAR(1) | 是 | | 消債旗標 |
| fine_flag | CHAR(1) | 是 | | 違規欠稅旗標 |
| address_anomaly_flag | SMALLINT | 是 | | 地址異常註記 |
| mainland_flag | SMALLINT | 是 | | 大陸籍旗標 |

#### G. 企業客戶專屬（7 欄位）

| 欄位名稱 | 型別 | Nullable | PK | 說明 |
|----------|------|----------|-----|------|
| owner_name | VARCHAR(50) | 是 | | 負責人姓名 |
| owner_id | VARCHAR(10) | 是 | | 負責人 ID |
| owner_birth | DATE | 是 | | 負責人生日 |
| established_capital | DECIMAL(12,0) | 是 | | 創設資本 |
| employee_count | VARCHAR(6) | 是 | | 員工數 |
| is_listed | VARCHAR(6) | 是 | | 是否上市 |
| parent_customer_id | VARCHAR(10) | 是 | | 母公司客戶 ID |

#### H. 稽核與 ETL 追蹤（5 欄位）

| 欄位名稱 | 型別 | Nullable | PK | 說明 |
|----------|------|----------|-----|------|
| source_created_at | TIMESTAMP | 是 | | 來源建檔日期 |
| source_updated_at | TIMESTAMP | 是 | | 來源最後更新 |
| data_source | VARCHAR(50) | 否 | | 資料來源識別（ETL 自動填充） |
| _etl_loaded_at | TIMESTAMP | 否 | | ETL 載入時間（ETL 自動填充） |
| _etl_pipeline_id | UUID | 否 | | 載入的 Pipeline ID（ETL 自動填充） |

### ETL 轉換規則 {#target-etl-transform-rules}

| 規則 | 說明 |
|------|------|
| 電話合併 | `{區碼}-{號碼}` 格式，佔位值（如 `00-0000000000`）過濾為 NULL |
| 衝突解決 | 同一客戶在兩來源有衝突時，以 `source_updated_at` 較新者為準（於 US-042 處理） |
| 代碼描述 | `_code` 欄位保留原始代碼，`_desc` 欄位由 US-030 取得對照表、US-042 轉換填入 |
| 資本額型別 | MLMC.CUSTNOWCAPTIAL / CUSTCREATECAPTIAL：varchar → DECIMAL |
| 客戶類型對應 | ZZIP.CUSTOM_MK 直接映射；MLMC.CUTYPE 需轉換（1→01, 2→02） |

### 共通 ETL 追蹤欄位

每個目標表都包含以下 3 個追蹤欄位，由 Pipeline 執行時系統自動填充：

| 欄位 | 說明 |
|------|------|
| `data_source` | 資料來源識別（來自 Datasource 名稱） |
| `_etl_loaded_at` | ETL 載入時間（系統自動記錄，UTC timestamp） |
| `_etl_pipeline_id` | 執行載入的 Pipeline ID（系統自動記錄） |

**業務規則**：

- 目標表由系統 migration 預先建立，不由 Admin 手動建立
- 目標表不納入 ORM Entity 管理，透過動態 SQL 操作
- Load 節點執行時自動填充 ETL 追蹤欄位
- 目標表採用 UPSERT 策略（以主鍵判斷 INSERT 或 UPDATE）
- 為未來 Data Mesh 擴展預留架構空間（每個 Domain 可獨立演進 schema）
- Phase 1 MVP 僅建立 `customer_core`，Phase 2/3 目標表待來源系統接入後再建立

**相關功能**：[F029](features/F029-pipeline-editor.md), [F036](features/F036-target-tables.md)

---

## E07 資料模型 {#e07-data-model}

本段落定義 E07「客戶名單分派」所需的 AppDB（PostgreSQL）資料表。分為兩類：

1. **OB 系統遷移表**（10 張）：從 SQL Server OB 資料庫遷移至 AppDB，採 `ob_` 前綴命名。
2. **E07 新建表**（3 張）：月跑執行紀錄、快照、稽核，不用 `ob_` 前綴。

### 命名規範

| 規範 | 說明 |
|------|------|
| 欄位命名 | 全部 snake_case 小寫 |
| 稽核欄位 | `A_PRGID` → `created_by_prog`、`A_USERID` → `created_by`、`A_SYSDT` → `created_at`、`U_PRGID` → `updated_by_prog`、`U_USERID` → `updated_by`、`U_SYSDT` → `updated_at` |
| 型別映射 | `datetime` → `TIMESTAMP`、`nvarchar(n)` → `VARCHAR(n)`（n > 255 改 `TEXT`）、`numeric(p,s)` → `NUMERIC(p,s)`、`int` → `INTEGER`、`money` → `NUMERIC(19,4)` |
| OB 表前綴 | `ob_` + snake_case（如 `ob_list_definition`） |

---

### OB 遷移表

#### ob_list_definition（OBMLISTDF — 名單定義）

PK：`list_no`

| 欄位名 | 型別 | NULL | 原欄位 | 說明 |
|--------|------|------|--------|------|
| created_by_prog | VARCHAR(20) | NOT NULL | A_PRGID | 建立程式代碼 |
| created_by | VARCHAR(20) | NOT NULL | A_USERID | 建立者 |
| created_at | TIMESTAMP | NOT NULL | A_SYSDT | 建立時間 |
| updated_by_prog | VARCHAR(20) | NOT NULL | U_PRGID | 更新程式代碼 |
| updated_by | VARCHAR(20) | NOT NULL | U_USERID | 更新者 |
| updated_at | TIMESTAMP | NOT NULL | U_SYSDT | 更新時間 |
| list_no | VARCHAR(11) | NOT NULL | LIST_NO | **PK**，名單編號（1–999） |
| list_nm | VARCHAR(45) | NOT NULL | LIST_NM | 名單名稱 |
| prod_kind | VARCHAR(255) | NOT NULL | PROD_KIND | 商品種類（多值 01=汽車/02=機車） |
| prod_best | VARCHAR(5) | NOT NULL | PROD_BEST | 優良案件旗標 |
| spec_tp | VARCHAR(255) | NULL | SPEC_TP | 專案特性 |
| list_type | VARCHAR(255) | NOT NULL | LIST_TYPE | 名單類型 |
| list_period_start | VARCHAR(3) | NOT NULL | LIST_PERIOD_START | 名單開始期間 |
| list_period_end | VARCHAR(3) | NOT NULL | LIST_PERIOD_END | 名單結束期間 |
| list_interval | VARCHAR(3) | NOT NULL | LIST_INTERVAL | 名單間隔 |
| assigned_date | TIMESTAMP | NULL | ASSIGNED_DATE | 名單分派日期 |
| total_amount | INTEGER | NULL | TOTAL_AMOUNT | 總案件數 |
| reserved_amount | INTEGER | NULL | RESERVED_AMOUNT | 保留案件數 |
| is_assigned | VARCHAR(1) | NULL | IS_ASSIGNED | 分派狀態（Y=已分派） |
| project_workym | VARCHAR(6) | NULL | PROJECT_WORKYM | 名單作業年月（YYYYMM） |
| casenumber | VARCHAR(50) | NULL | CASENUMBER | 案件編號 |
| name | VARCHAR(50) | NULL | NAME | 名稱 |
| caseyear | VARCHAR(255) | NULL | CASEYEAR | 進件/滿期/中結年數（多值欄位，`$$` 分隔；F050/F051 前端固定 11 個選項 value `0`~`10`，不從 `ob_code_df` 載入；OQ-E07-24 ✅ Resolved 2026-05-12，證據 `reference/Areas/OBZ/Views/OBZ020/edit.cshtml:174-235`；Stage 1 與 `ob_pool_data.year_cnt` 整數比對） |
| caseyearnm | VARCHAR(10) | NULL | CASEYEARNM | 案件年份名稱 |
| case_status | VARCHAR(14) | NOT NULL | （新增，原 OBMLISTDF.LIST_TYPE 業務語意拆出） | 案件結清期別（多值欄位，`$$` 分隔；F050/F051 必填多選），可選代碼來源 `ob_code_df` `tbl_id = 'CASE_STATUS'`（對應原 OBMCODEDF TBL_ID='22'）；最大長度依 4 個代碼全選計算 `01$$02$$03$$04` = 14 字元。**4 個值業務語意對照詳見 [F050 §5.1.1](features/F050-create-list-definition.md#511-case_status-4-個值業務語意對照表)**（OQ-E07-23 ✅ Resolved 2026-05-12，依 `reference/SP/USP_OB_OBPOOLDATA.sql:189-216` + DB 實證 1,487,695 筆）。月跑 Stage 1 以本欄位（業務主管選擇）與 `ob_pool_data.list_type`（SP 計算寫入）作 OR 比對（BR-7） |
| settle_src | VARCHAR(6) | NULL | SETTLE_SRC | 結案來源（多值欄位，`$$` 分隔） |
| card_type | VARCHAR(5) | NULL | CARD_TYPE | 計分卡類型（沿用舊值，A43 決議；dump 含 3 字元值如 SEC/SEB，與 ob_levelcard_* 系列一致改為 VARCHAR(5)） |

**多值欄位儲存規範**：

`prod_kind` / `spec_tp` / `settle_src` / `caseyear` / `case_status` 為 `$$` 分隔字串（與舊系統格式相容；dump 觀察範例見下表）。UI 提交時以多選清單序列化為 `$$` 分隔字串、查詢時以 `LIKE '%val$$%' OR LIKE '%$$val' OR = 'val'` 三段比對；遷移時保留原始字串不拆分為陣列或正規化表。

| 欄位 | dump 範例 | 含義 |
|------|----------|------|
| `spec_tp` | `02$$04$$05$$06$$11$$12$$13$$14$$15$$16$$20$$21$$22$$23` | 多個專案類別代碼 |
| `settle_src` | `Y$$N` 或 `Y` 或 `N` | 含 / 不含被他行代償案件 |
| `caseyear` | `0$$1$$2$$3$$4$$5$$6$$7$$8$$9$$10` | 多個進件 / 中結年數（前端 11 個固定選項 0~10；舊系統 dump 偶見 `99` 值為舊資料殘留，未啟用） |
| `prod_kind` | `02$$03$$04` 或 `01` 或 `02` | 多個產品種類代碼（dump 觀察單值居多，但結構允許多值） |
| `case_status` | `01$$02$$03` 或 `01` 或 `04` | 多個案件結清期別（最多 4 選；對應 `ob_code_df` `tbl_id = 'CASE_STATUS'`） |

**list_type vs case_status 語意分離**：原系統 `LIST_TYPE` 欄位混用兩種語意，新系統拆分如下：

| 欄位 | 角色 | 表單顯示 | 寫入方式 |
|---|---|---|---|
| `list_type` | 系統內部分類常數，固定 `'01'`（分派名單） | 否 | 後端固定寫入 |
| `case_status`（新欄位） | 業務主管選擇的案件結清期別篩選範圍 | 是（必填多選） | F050/F051 表單提交，多值以 `$$` 分隔 |

**`case_status` Migration 策略（AD-E07-14 兩階段）**：

原 OBMLISTDF 無 `case_status` 欄位；但 `LIST_TYPE` 欄位的實際儲存值即為案件結清期別代碼（dump 驗證：`'01'`、`'02'`、`'02$$03$$04'` 等）。採兩階段 migration 以安全補值：

- **Phase 1**：`ALTER TABLE ADD COLUMN case_status VARCHAR(14) NULL`；執行 `UPDATE SET case_status = list_type`（將 LIST_TYPE 原值複製至 case_status）
- **Phase 2**：執行驗證查詢確認無 NULL 餘留後，`ALTER COLUMN case_status SET NOT NULL`；同步將 `list_type` 全數更新為常數 `'01'`

完整 migration SQL 見 architecture-spec.md AD-E07-14。

**索引**：`list_no`（PK）、`(project_workym, card_type)`（複合索引，月跑查詢）

---

#### ob_pool_data（OBPOOLDATA — 案件池）

> **資料同步機制**：本表採 **E04 + E05 雙層 ETL** 同步：E04 通用擷取任務從舊 OB DB（SQL Server `OBPOOLDATA`）抓取至 raw_{task_id_short} 中介表（既有機制，每月跑前執行），再由 E05 Pipeline TargetLoad 將資料載入本表（full replace 模式）。詳見 [architecture-spec.md §E07-C](architecture-spec.md#e07-c-etl-設計) ETL 設計。**E07 不提供 CRUD 維護介面**。
>
> ⚠️ **本表為共享案件池**（對應 OBPOOLDATA 原表結構，120 欄位中**無 LIST_NO 欄位**），不直接綁定特定名單。per-LIST_NO 候選由月跑 Stage 1 透過 join `ob_list_definition` 的篩選條件（`prod_kind` / `caseyear` / `spec_tp` / `list_period_start ~ list_period_end` / `settle_src` 等）動態取得；分派結果（含 LIST_NO）寫入 `ob_pool_data_list`。
>
> ob_pool_data 欄位達 120 個（Q-B 決策）。以下列出 E07 月跑邏輯使用的關鍵欄位，其餘欄位完整映射 OBPOOLDATA，命名規範同上。

PK：`(orgno, appl_no)`

| 欄位名 | 型別 | NULL | 說明 |
|--------|------|------|------|
| orgno | VARCHAR(2) | NOT NULL | 機構別（PK 組成） |
| appl_no | VARCHAR(10) | NOT NULL | 申請案號（PK 組成） |
| custo_no | VARCHAR(11) | NULL | 客戶編號（C360 join 鍵） |
| cust_name | VARCHAR(90) | NULL | 客戶姓名 |
| dept_id | VARCHAR(6) | NULL | 部門代碼 |
| emplid | VARCHAR(10) | NULL | 業務員工號（前次分派填入，CR 回分用） |
| emplid_deptid | VARCHAR(6) | NULL | 業務員所屬部門 |
| prod_kind | VARCHAR(2) | NULL | 商品種類（Stage 1 篩選用） |
| caseyear | VARCHAR(255) | NULL | 案件年份（Stage 1 篩選用） |
| spec_tp | VARCHAR(255) | NULL | 專案特性（Stage 1 篩選用） |
| settle_src | TEXT | NOT NULL | 結案來源（DEFAULT 'N'，Stage 1 篩選用） |
| list_type | VARCHAR(2) | NULL | 案件結清期別代碼（**單值**，由舊系統 SP `USP_OB_OBPOOLDATA.sql:189-216` CASE WHEN 計算後寫入；ETL 直接同步舊欄位 `OBPOOLDATA.LIST_TYPE`）。值域 `'01'` / `'02'` / `'03'` / `'04'`，業務語意詳見 [F050 §5.1.1](features/F050-create-list-definition.md#511-case_status-4-個值業務語意對照表)。Stage 1 篩選用：與 `ob_list_definition.case_status`（業務主管選擇之多值 `$$` 分隔字串）作 OR 比對（OQ-E07-20 / OQ-E07-23 ✅ Resolved 2026-05-12） |
| _cdmp_extracted_at | TIMESTAMP | NOT NULL | ETL 擷取時間（E04 系統附加） |

> **同名異義警示**：`ob_list_definition.list_type`（系統內部分類常數，固定 `'01'` 代表分派名單）與 `ob_pool_data.list_type`（案件結清期別代碼 `'01'`~`'04'`）**同名但語意不同**，源自舊系統設計（OBMLISTDF.LIST_TYPE 與 OBPOOLDATA.LIST_TYPE 在原系統即同名異義）。AD-E07-14 已將 `ob_list_definition` 的業務語意拆出為 `case_status` 欄位；`ob_pool_data.list_type` 保留原 SP 計算結果不改名（避免影響 ETL 對齊）。Stage 1 SQL 引用時須使用全限定名 `pd.list_type` / `ld.list_type` / `ld.case_status` 區分。
>
> **`ob_pool_data.list_type` SP 計算邏輯**（USP_OB_OBPOOLDATA.sql:189-216）：
> - `'01'` 期中(不含當月滿期)：`STA_CODE BETWEEN '05' AND '89'` **AND** (`DATEDIFF(M, WORKDT, MATURITY_DT) > 1` **OR** `DEAL_NUM - PAYT_NUM > 2`)
> - `'02'` 中結：`STA_CODE = '98'`
> - `'03'` 滿期(含當月滿期)：`STA_CODE BETWEEN '05' AND '89'` **AND** `DATEDIFF(M, WORKDT, MATURITY_DT) <= 1` **AND** `DEAL_NUM - PAYT_NUM <= 2`（**仍 active**）
> - `'04'` 滿期：`STA_CODE = '90'`（**已結清完成**）

**索引**：`(orgno, appl_no)`（PK）、`(custo_no)`（C360 join 用）、`(prod_kind)`、`(settle_src)`、`(list_type)`（Stage 1 篩選用）

---

#### ob_pool_data_list（OBPOOLDATA_LIST — per-LIST_NO 案件分派結果）

PK：`(list_no, orgno, appl_no)`

| 欄位名 | 型別 | NULL | 原欄位 | 說明 |
|--------|------|------|--------|------|
| created_by_prog | VARCHAR(20) | NULL | A_PRGID | 建立程式代碼 |
| created_by | VARCHAR(20) | NULL | A_USERID | 建立者 |
| created_at | TIMESTAMP | NULL | A_SYSDT | 建立時間 |
| updated_by_prog | VARCHAR(20) | NULL | U_PRGID | 更新程式代碼 |
| updated_by | VARCHAR(20) | NULL | U_USERID | 更新者 |
| updated_at | TIMESTAMP | NULL | U_SYSDT | 更新時間 |
| list_no | VARCHAR(100) | NOT NULL | LIST_NO | **PK**，名單編號 |
| orgno | VARCHAR(2) | NOT NULL | ORGNO | **PK**，機構別 |
| appl_no | VARCHAR(10) | NOT NULL | APPL_NO | **PK**，申請案號 |
| custo_no | VARCHAR(11) | NULL | CUSTO_NO | 客戶編號 |
| cust_name | VARCHAR(90) | NULL | CUST_NAME | 客戶姓名 |
| dept_id | VARCHAR(6) | NULL | DEPT_ID | 部門代碼 |
| dept_name | VARCHAR(30) | NULL | DEPT_NAME | 部門名稱 |
| emplid | VARCHAR(10) | NULL | EMPLID | 業務員工號（分派結果） |
| emplid_deptid | VARCHAR(6) | NULL | EMPLID_DEPTID | 業務員所屬部門 |
| score | INTEGER | NULL | SCORE | 月跑 Stage 2 計分結果（由 `fn_calc_tier_level` 計算後寫入；初始為 NULL）。對應舊系統 OBPOOLDATA_LIST.SCORE。F055 preview API 讀取此欄位套用新門檻計算 CARD_LEVEL 分佈（AD-E07-10） |
| card_level | VARCHAR(1) | NULL | CARD_LEVEL | 計分卡等級 |
| tier_level | VARCHAR(5) | NULL | TIER_LEVEL | 名單層級 |
| settle_src | TEXT | NOT NULL | SETTLE_SRC | 結案來源（DEFAULT 'N'） |
| case_type | VARCHAR(2) | NULL | CASE_TYPE | 案件類型 |
| prod_kind | VARCHAR(2) | NULL | PROD_KIND | 商品種類 |
| prod_kind_name | VARCHAR(8) | NULL | PROD_KIND_NAME | 商品種類名稱 |
| loan_totamt | NUMERIC(18,0) | NULL | LOAN_TOTAMT | 總貸款金額 |
| loan_capital | NUMERIC(18,0) | NULL | LOAN_CAPITAL | 貸款本金 |
| overdue_amt | NUMERIC(19,4) | NULL | OVERDUE_AMT | 逾期金額（money） |
| overdue_day | INTEGER | NULL | OVERDUE_DAY | 逾期天數 |
| assignday | VARCHAR(100) | NULL | ASSIGNDAY | 分派日期字串 |
| order1 | INTEGER | NULL | ORDER1 | 排序順序1 |
| order2 | INTEGER | NULL | ORDER2 | 排序順序2 |
| is_cr | VARCHAR(1) | NULL | IS_CR | 是否為前業務員管理案件 |
| cr_id | VARCHAR(20) | NULL | CR_ID | 前業務員工號 |
| cr_nm | VARCHAR(50) | NULL | CR_NM | 前業務員姓名 |

> 其餘業務欄位（貸款明細、車輛資訊、業務員資訊等）完整映射 OBPOOLDATA_LIST，命名規範同上（snake_case，nvarchar → VARCHAR/TEXT，datetime → TIMESTAMP，numeric → NUMERIC，money → NUMERIC(19,4)）。

**索引**：`(list_no, orgno, appl_no)`（PK）、`(list_no, emplid)`、`(list_no, dept_id)`

---

#### ob_dept_pct（OBMDEPTPCT — per-LIST_NO 部門比例）

PK：`(project_workym, list_no, obdeptid, ration)`

| 欄位名 | 型別 | NULL | 原欄位 | 說明 |
|--------|------|------|--------|------|
| created_by_prog | VARCHAR(10) | NOT NULL | A_PRGID | 建立程式代碼 |
| created_by | VARCHAR(10) | NOT NULL | A_USERID | 建立者 |
| created_at | TIMESTAMP | NOT NULL | A_SYSDT | 建立時間 |
| updated_by_prog | VARCHAR(10) | NOT NULL | U_PRGID | 更新程式代碼 |
| updated_by | VARCHAR(10) | NOT NULL | U_USERID | 更新者 |
| updated_at | TIMESTAMP | NOT NULL | U_SYSDT | 更新時間 |
| project_workym | VARCHAR(6) | NOT NULL | PROJECT_WORKYM | **PK**，作業年月 |
| list_no | VARCHAR(11) | NOT NULL | LIST_NO | **PK**，名單編號 |
| obdeptid | VARCHAR(6) | NOT NULL | OBDEPTID | **PK**，催收部門代碼 |
| obdeptnm | VARCHAR(10) | NOT NULL | OBDEPTNM | 催收部門名稱 |
| ration | NUMERIC(9,1) | NOT NULL | RATION | **PK**，分配比例 |

**索引**：複合 PK 即為主索引。`(project_workym, list_no)` 為月跑查詢索引。

---

#### ob_empl_set（OBEMPLSETMF — 人員比例設定）

PK：`(list_no, deptid_m, emplid, ration)`

| 欄位名 | 型別 | NULL | 原欄位 | 說明 |
|--------|------|------|--------|------|
| created_by_prog | VARCHAR(10) | NULL | A_PRGID | 建立程式代碼 |
| created_by | VARCHAR(10) | NULL | A_USERID | 建立者 |
| created_at | TIMESTAMP | NULL | A_SYSDT | 建立時間 |
| updated_by_prog | VARCHAR(10) | NULL | U_PRGID | 更新程式代碼 |
| updated_by | VARCHAR(10) | NULL | U_USERID | 更新者 |
| updated_at | TIMESTAMP | NULL | U_SYSDT | 更新時間 |
| list_no | VARCHAR(11) | NOT NULL | LIST_NO | **PK**，名單編號 |
| deptid_m | VARCHAR(50) | NOT NULL | DEPTID_M | **PK**，催收人員所屬部門（組合鍵；遷移時 `RTRIM(deptid_m)`，見下方註腳） |
| emplid | VARCHAR(6) | NOT NULL | EMPLID | **PK**，催收人員工號 |
| ration | NUMERIC(10,1) | NOT NULL | RATION | **PK**，分配比例 |
| prod_type | VARCHAR(255) | NULL | PROD_TYPE | 商品類型（多值） |

> ⚠️ **`deptid_m` 尾隨空白填充處理**：舊 `OBEMPLSETMF.DEPTID_M` 雖宣告 `VARCHAR(50)`，dump 觀察實際業務值為 4 字元部門代碼（如 `XTC0`）但被 padded 至 50 字元（範例：`"XTC0                                              "`）。遷移時統一執行 `RTRIM(deptid_m)`，AppDB 存入 trim 後的值（即實際 4 字元代碼），避免 join `ob_emphire.dept_code`（不含 padding）失敗。AppDB 寫入路徑（F058 / 月跑 Stage 4）亦不可保留尾隨空白。

**索引**：複合 PK 即為主索引。`(list_no, deptid_m)` 為查詢索引。

---

#### ob_code_df（OBMCODEDF — 系統代碼表）

無 PK 約束（來源無 PK）；查詢鍵：`(system_id, tbl_id, tbl_cd)`

**E07 使用的 `tbl_id` 範圍**（F068 維護，**3 類**）：
- `PROD_KIND` — 產品類別
- `SPEC_TP` — 專案類別
- `CASE_STATUS` — 案件結清期別（對應原 OBMCODEDF TBL_ID='22'，dump 2026-05-05 驗證已生效 4 筆：`01` 期中（不含當月滿期）/ `02` 中結 / `03` 滿期（含當月滿期）/ `04` 滿期）

> **CASEYEAR 不在 ob_code_df 範圍**（OQ-E07-24 ✅ Resolved 2026-05-12）：F050/F051 之「進件/滿期/中結年數」欄位為前端固定 11 個 CheckBox（value `0`~`10`，每個直接代表合約年數整數），不從 `ob_code_df` 動態載入。證據：`reference/Areas/OBZ/Views/OBZ020/edit.cshtml:174-235` — 舊系統 cshtml hard-coded，無 AJAX 載入動作。OBMCODEDF dump 中 `TBL_ID='04'` 該 1 筆紀錄屬其他模組殘留，與 E07 名單定義 CASEYEAR 無關。

> **[AD-E07-14 已決議]** 新系統 `tbl_id` 採英文常數命名（原 OQ-092-02 已決）。遷移白名單（**3 類**）：`TBL_ID='01'→'PROD_KIND'`、`'02'→'SPEC_TP'`、`'22'→'CASE_STATUS'`。白名單外 TBL_ID 值（含 `'04'`，前端 hard-coded 不入庫）不匯入 ob_code_df（E07 不使用）。`tbl_id` 欄位型別由 VARCHAR(2) 擴充為 VARCHAR(11)。



| 欄位名 | 型別 | NULL | 原欄位 | 說明 |
|--------|------|------|--------|------|
| system_id | VARCHAR(4) | NOT NULL | SYSTEM_ID | 系統別 |
| tbl_id | VARCHAR(11) | NOT NULL | TBL_ID | 代碼類別；新系統採英文常數命名（AD-E07-14，**3 類**）：`'PROD_KIND'`/`'SPEC_TP'`/`'CASE_STATUS'`；欄位長度由原 VARCHAR(2) 擴充為 VARCHAR(11) 以容納最長值 `'CASE_STATUS'`（11 字元）；遷移時依白名單映射，原 TBL_ID='01'→'PROD_KIND', '02'→'SPEC_TP', '22'→'CASE_STATUS'（**`'04'` CASEYEAR 不入庫**，OQ-E07-24 Resolved 2026-05-12，前端 hard-coded） |
| tbl_cd | VARCHAR(4) | NOT NULL | TBL_CD | 代碼編號 |
| tbl_desc1 | VARCHAR(40) | NULL | TBL_DESC1 | 代碼描述1 |
| tbl_desc2 | VARCHAR(40) | NULL | TBL_DESC2 | 代碼描述2 |
| tbl_val1 | NUMERIC(12,0) | NULL | TBL_VAL1 | 擴充值1（數值） |
| tbl_val2 | TIMESTAMP | NULL | TBL_VAL2 | 擴充值2（日期） |
| tbl_val3 | VARCHAR(40) | NULL | TBL_VAL3 | 擴充值3 |
| tbl_val4 | VARCHAR(40) | NULL | TBL_VAL4 | 擴充值4 |
| tbl_val5 | VARCHAR(40) | NULL | TBL_VAL5 | 擴充值5 |
| tbl_val6 | VARCHAR(80) | NULL | TBL_VAL6 | 擴充值6 |
| tbl_val7 | VARCHAR(80) | NULL | TBL_VAL7 | 擴充值7 |
| tbl_val8 | VARCHAR(80) | NULL | TBL_VAL8 | 擴充值8 |
| stadt | VARCHAR(8) | NULL | STADT | 代碼生效日 |
| enddt | VARCHAR(8) | NULL | ENDDT | 代碼失效日 |

**索引**：`(system_id, tbl_id, tbl_cd)`（複合唯一索引）

---

#### ob_card_type（CARD_TYPE 計分卡類型主表） {#ob-card-type-entity}

> 本表為 **AppDB 新建表，無對應舊系統 OB 表**（2026-05-14 由 M02 計分設定擴充新增）。作為 `ob_levelcard_version` / `ob_levelcard_column` / `ob_levelcard_score` / `ob_levelcard_level` / `ob_tier` 共同的「計分卡類型」上層字典表，並與 `ob_code_df` 中 PROD_KIND 建立 1:1 業務綁定。M02 計分設定頁面之 5 Tab 結構以本表為 Tab 1 入口，Tab 2~5 之資料範圍由本表選中之 `card_type` 驅動。

業務邏輯主鍵：`card_type`（Natural PK，建立後不可修改）

**欄位語意定義**（業務層欄位清單）

| 欄位名 | 業務語意 | NULL | 說明 |
|--------|----------|------|------|
| card_type | CARD_TYPE 代碼 | NOT NULL | VARCHAR(5)，計分卡類型代碼（如 `H` / `S` / `E` / `S5` / `E5` / `M`）；與 `ob_levelcard_*` / `ob_tier.card_type` 對應；建立後不可修改（F071 BR-1） |
| card_name | 計分卡顯示名稱 | NOT NULL | VARCHAR(20)，業務顯示名稱（如「期中」「中結」「滿期」） |
| prod_kind | 綁定之 PROD_KIND 代碼 | NOT NULL | VARCHAR(4)，對應 `ob_code_df.tbl_cd WHERE tbl_id = 'PROD_KIND'`；1:1 業務綁定（每張 CARD_TYPE 綁定一個 PROD_KIND）；**無 DB-level FK constraint**（見「FK 設計決策」段） |
| status | 啟用狀態 | NOT NULL | VARCHAR(10)，`'active'` / `'inactive'`；F069 GET 預設僅顯示 `'active'`；F072 採級聯 hard delete（無 inactive 紀錄殘留） |
| created_at | 建立時間 | NOT NULL | `dateColumnType` helper（PostgreSQL = `timestamp`，SQLite E2E = `datetime`）；**不可用 `datetime` 固定字串** |
| created_by | 建立者 user_id | NOT NULL | VARCHAR(50)，儲存 users.id 字串（與 assignment_audit_log 模式一致，無 FK constraint） |
| updated_at | 更新時間 | NOT NULL | `dateColumnType` helper；F070 新增時同 created_at 填入，F071 編輯時更新 |
| updated_by | 更新者 user_id | NOT NULL | VARCHAR(50)，儲存 users.id 字串 |

**DB-level 約束設計（✅ system-architect 決議，2026-05-14）**

```
PRIMARY KEY (card_type)
CHECK (card_type ~ '^[A-Z0-9]{1,5}$')   -- 僅大寫英數字，長度 1~5
CHECK (status IN ('active','inactive'))
```

> **SQLite E2E 注意**：`card_type ~ '^[A-Z0-9]{1,5}$'` 使用 PostgreSQL regex 語法，SQLite 不支援 `~` 運算子。TypeORM migration 需以 `process.env.DB_TYPE` 判斷：PostgreSQL 版本加 regex CHECK，SQLite 版本省略（由應用層保證格式）。

**FK 設計決策（✅ system-architect 決議，OQ-E07-32 Resolved）**

`prod_kind` **不建立 DB-level FK constraint**，原因：

1. `ob_code_df` 為三欄複合 PK（`system_id`, `tbl_id`, `tbl_cd`）；若補 FK，`ob_card_type` 須冗餘儲存 `system_id='OB'` 與 `tbl_id='PROD_KIND'` 兩欄
2. 業務語意：`prod_kind` 為代碼代入值，允許 `ob_code_df` 對應紀錄過期後仍顯示歷史 PROD_KIND 代碼
3. 應用層保證：F070 / F071 POST / PUT 寫入時後端驗證 `prodKind` 存在於 `ob_code_df WHERE tbl_id = 'PROD_KIND'` 之啟用期間內紀錄（`stadt <= TODAY <= enddt` 或為 NULL）

**下游表 FK 補建決策（✅ system-architect 決議，OQ-E07-32 Resolved）**

下游 5 張表（`ob_levelcard_version` / `ob_levelcard_column` / `ob_levelcard_score` / `ob_levelcard_level` / `ob_tier`）之 `card_type` 欄位**不補建 DB-level FK constraint（含 `ON DELETE CASCADE`）**，改以**應用層 Transaction 控制級聯刪除**。

理由：

| 考量 | 說明 |
|------|------|
| SQLite E2E 相容性 | 補 FK 後需同步調整所有 E2E 測試的 `PRAGMA foreign_keys = ON`，影響面廣 |
| 遷移時序風險 | D3 migration 期間可能存在不在 ob_card_type 範圍內的過渡型 CARD_TYPE 值（HM/M5 等），補 FK 後 INSERT 會違反 constraint |
| audit log 同 transaction | DB-level `ON DELETE CASCADE` 無法在 cascade 過程中插入 `assignment_audit_log`，違反 F072 BR-8 |
| MVP 效能 | 刪除量 < 300 筆，應用層 transaction 效能完全足夠 |

**索引設計**

```
-- 主鍵索引（PostgreSQL 自動建立）
PRIMARY KEY (card_type)

-- status 查詢索引（F069 GET 預設 WHERE status = 'active'）
CREATE INDEX idx_ob_card_type_status ON ob_card_type (status);
```

**業務語意關係**：

| 關係 | 對端表 | 連結欄位 | 業務語意 |
|------|--------|----------|----------|
| 1 對多 | `ob_levelcard_version` | `card_type` | 一個 CARD_TYPE 可有多個計分卡版本（依 `card_version`，本次 MVP 規範僅 v1） |
| 1 對多 | `ob_levelcard_column` | `card_type` | 一個 CARD_TYPE 可有多個計分維度紀錄 |
| 1 對多 | `ob_levelcard_score` | `card_type` | 一個 CARD_TYPE 可有多個維度分數設定 |
| 1 對多 | `ob_levelcard_level` | `card_type` | 一個 CARD_TYPE 可有多個 CARD_LEVEL 分級門檻 |
| 1 對多 | `ob_tier` | `card_type` | 一個 CARD_TYPE 可有多個 TIER_LEVEL 對應（含 fallback NULL 紀錄） |
| 1 對 1 | `ob_code_df`（`tbl_id='PROD_KIND'`） | `prod_kind` ↔ `tbl_cd` | 每張 CARD_TYPE 綁定一個 PROD_KIND（業務層 1:1 綁定；同一 PROD_KIND 可被多個 CARD_TYPE 引用，反向多對一） |

**Seed 範圍**（遷移時執行）：

遷移腳本從既有 `ob_levelcard_version` 之 dump（`reference/DumpData/OBLEVELCARD_VERSION_20260505.csv`）萃取唯一 `card_type` 值，seed **6 筆正規 CARD_TYPE** 至 `ob_card_type`：

| card_type | card_name | prod_kind | 資料驗證來源 | status |
|-----------|-----------|-----------|------------|--------|
| H | 期中 | `01`（汽車） | OBMLISTDF dump 第 2、7、8 行 `PROD_KIND=01, CARD_TYPE=H` | active |
| S | 中結 | `01`（汽車） | OBMLISTDF dump 第 4、5 行 `PROD_KIND=01, CARD_TYPE=S` | active |
| E | 滿期 | `01`（汽車） | OBMLISTDF dump 第 6 行 `PROD_KIND=01, CARD_TYPE=E` | active |
| S5 | 中結5年 | `01`（汽車） | OBMLISTDF dump 第 53 行 `PROD_KIND=01, CARD_TYPE=S5` | active |
| E5 | 滿期5年 | `01`（汽車） | OBMLISTDF dump 第 54 行 `PROD_KIND=01, CARD_TYPE=E5` | active |
| M | 機車 | `02`（機車） | OBMLISTDF dump 第 3 行 `PROD_KIND=02, CARD_TYPE=M` | active |

> **PROD_KIND 對照已確認（✅ OQ-E07-33 Resolved，system-architect，2026-05-14）**：PROD_KIND 對照已依 `reference/DumpData/OBMLISTDF_20260505.csv` 第 9 欄（PROD_KIND）與最後欄（CARD_TYPE）實證確認，H/S/E/S5/E5 → `01` 汽車，M → `02` 機車。Migration 執行前 TDD Developer 需先執行 `SELECT tbl_cd, tbl_desc1 FROM ob_code_df WHERE tbl_id='PROD_KIND'` 確認 `01`/`02` 存在，seed 採冪等設計（`INSERT ... ON CONFLICT (card_type) DO NOTHING`）。

**不 seed 範圍**：

- HM / M5 / M3 / HC / C3 等過渡 / fallback CARD_TYPE **不入 `ob_card_type`**；對應之 `ob_tier` 紀錄於 F056 v1.5 BR-6 中亦排除遷移（避免違反業務層 1:1 綁定）。
- HB / SEB / SEC 邊緣 CARD_TYPE 同樣不 seed（OQ-E07-29 仍 Open）。
- 上述 CARD_TYPE 若業務後續需保留，由業務主管透過 F070 新增。

**F072 級聯刪除執行順序（✅ system-architect 決議，AD-E07-16）**

採應用層 Transaction（`READ COMMITTED` 隔離等級），6 步驟由子表至父表執行：

```
step 1: DELETE FROM ob_tier                WHERE card_type = :cardType
step 2: DELETE FROM ob_levelcard_score     WHERE card_type = :cardType
step 3: DELETE FROM ob_levelcard_level     WHERE card_type = :cardType
step 4: DELETE FROM ob_levelcard_column    WHERE card_type = :cardType
step 5: DELETE FROM ob_levelcard_version   WHERE card_type = :cardType
step 6: DELETE FROM ob_card_type           WHERE card_type = :cardType
step 7: INSERT INTO assignment_audit_log   (action='DELETE', ...)  -- 同 transaction
```

詳見 `architecture-spec.md` AD-E07-16。

---

#### ob_levelcard_version（OBLEVELCARD_VERSION — 計分卡版本）

> **STATUS 為 AppDB 遷移補建欄位**（原表無），與 `ob_list_definition` 設計對齊。原 OBLEVELCARD_VERSION 透過 `SDATE` / `EDATE`（VARCHAR(8) YYYYMMDD）表達生效期間（dump 中 6 筆全部 `EDATE = '20991231'`）；遷移時依 `(SDATE <= 今日 < EDATE)` 計算 `status` 初值。
> **稽核欄位允許 NULL**：dump 觀察 6 筆中至少 4 筆稽核欄位（`A_PRGID` / `A_USERID` / `A_SYSDT` / `U_*`）全為 NULL，遷移後維持 NULL 設定。

無嚴格 PK（來源無 PK constraint），邏輯主鍵：`(card_type, card_version)`

| 欄位名 | 型別 | NULL | 原欄位 | 說明 |
|--------|------|------|--------|------|
| created_by_prog | VARCHAR(20) | NULL | A_PRGID | 建立程式代碼（dump 觀察多筆為 NULL） |
| created_by | VARCHAR(20) | NULL | A_USERID | 建立者（dump 觀察多筆為 NULL） |
| created_at | TIMESTAMP | NULL | A_SYSDT | 建立時間（dump 觀察多筆為 NULL） |
| updated_by_prog | VARCHAR(20) | NULL | U_PRGID | 更新程式代碼（dump 觀察多筆為 NULL） |
| updated_by | VARCHAR(20) | NULL | U_USERID | 更新者（dump 觀察多筆為 NULL） |
| updated_at | TIMESTAMP | NULL | U_SYSDT | 更新時間（dump 觀察多筆為 NULL） |
| card_type | TEXT | NULL | CARD_TYPE | 計分卡類型（原 varchar(max)） |
| card_name | VARCHAR(20) | NULL | CARD_NAME | 計分卡名稱 |
| card_version | INTEGER | NULL | CARD_VERSION | 版本號 |
| sdate | VARCHAR(8) | NOT NULL | SDATE | 生效日（YYYYMMDD 字串；dump 觀察 6 筆均有值） |
| edate | VARCHAR(8) | NOT NULL | EDATE | 失效日（YYYYMMDD 字串；dump 觀察 6 筆均為 `'20991231'`） |
| status | VARCHAR(10) | NOT NULL DEFAULT 'active' | — | **[遷移補建]** 啟用旗標（`active` / `inactive`）；遷移時依 `(SDATE <= 今日 < EDATE)` 計算初值；原表無此欄位 |

**索引**：`(card_type, card_version)`（複合索引）

**dump 觀察**（`reference/DumpData/OBLEVELCARD_VERSION_20260505.csv`）：
- 6 筆 CARD_TYPE：`H` / `S` / `E` / `S5` / `E5` / `M`（**未含** `HM` / `M5`，OBTIER 中存在的兩種 fallback CARD_TYPE 在本表無對應計分版本，詳見 `ob_tier` 章節）
- 全部 `EDATE = '20991231'`（無時限）
- 多筆稽核欄位為 NULL

---

#### ob_levelcard_column（OBLEVELCARD_COLUNM — 計分維度欄位定義）

無嚴格 PK；邏輯主鍵：`(card_type, card_version, column_name)`

| 欄位名 | 型別 | NULL | 原欄位 | 說明 |
|--------|------|------|--------|------|
| created_by_prog | VARCHAR(20) | NULL | A_PRGID | 建立程式代碼 |
| created_by | VARCHAR(20) | NULL | A_USERID | 建立者 |
| created_at | TIMESTAMP | NULL | A_SYSDT | 建立時間 |
| updated_by_prog | VARCHAR(20) | NULL | U_PRGID | 更新程式代碼 |
| updated_by | VARCHAR(20) | NULL | U_USERID | 更新者 |
| updated_at | TIMESTAMP | NULL | U_SYSDT | 更新時間 |
| card_type | VARCHAR(10) | NULL | CARD_TYPE | 計分卡類型 |
| card_version | INTEGER | NULL | CARD_VERSION | 版本號 |
| column_name | VARCHAR(30) | NULL | COLUNM | 維度欄位名稱（原拼字 COLUNM） |
| column_label | VARCHAR(30) | NULL | COLUNM_NAME | 維度欄位顯示名稱 |

> 注意：原表欄位名 `COLUNM` 為舊系統拼字錯誤（應為 COLUMN），遷移時修正為 `column_name`。

**索引**：`(card_type, card_version, column_name)`（複合索引）

---

#### ob_levelcard_score（OBLEVELCARD_SCORE — 計分維度分數設定）

無嚴格 PK；邏輯主鍵：`(card_type, card_version, column_name, level1, level2_s, level2_e)`

| 欄位名 | 型別 | NULL | 原欄位 | 說明 |
|--------|------|------|--------|------|
| created_by_prog | VARCHAR(20) | NULL | A_PRGID | 建立程式代碼 |
| created_by | VARCHAR(20) | NULL | A_USERID | 建立者 |
| created_at | TIMESTAMP | NULL | A_SYSDT | 建立時間 |
| updated_by_prog | VARCHAR(20) | NULL | U_PRGID | 更新程式代碼 |
| updated_by | VARCHAR(20) | NULL | U_USERID | 更新者 |
| updated_at | TIMESTAMP | NULL | U_SYSDT | 更新時間 |
| card_type | VARCHAR(10) | NOT NULL | CARD_TYPE | 計分卡類型 |
| card_version | INTEGER | NOT NULL | CARD_VERSION | 版本號 |
| column_name | VARCHAR(30) | NOT NULL | COLUNM | 維度欄位名稱 |
| level1 | VARCHAR(10) | NULL | LEVEL1 | 類別型條件（精確值） |
| level2_s | VARCHAR(10) | NULL | LEVEL2_S | 數值型條件起始值 |
| level2_e | VARCHAR(10) | NULL | LEVEL2_E | 數值型條件結束值 |
| score | INTEGER | NOT NULL | SCORE | 分數 |

**索引**：`(card_type, card_version, column_name)`（複合索引）

---

#### ob_levelcard_level（OBLEVELCARD_LEVEL — CARD_LEVEL 分級設定）

無嚴格 PK；邏輯主鍵：`(card_type, card_version, score_s, score_e)`

| 欄位名 | 型別 | NULL | 原欄位 | 說明 |
|--------|------|------|--------|------|
| created_by_prog | VARCHAR(20) | NULL | A_PRGID | 建立程式代碼 |
| created_by | VARCHAR(20) | NULL | A_USERID | 建立者 |
| created_at | TIMESTAMP | NULL | A_SYSDT | 建立時間 |
| updated_by_prog | VARCHAR(20) | NULL | U_PRGID | 更新程式代碼 |
| updated_by | VARCHAR(20) | NULL | U_USERID | 更新者 |
| updated_at | TIMESTAMP | NULL | U_SYSDT | 更新時間 |
| card_type | VARCHAR(10) | NOT NULL | CARD_TYPE | 計分卡類型 |
| card_version | INTEGER | NOT NULL | CARD_VERSION | 版本號 |
| score_s | INTEGER | NOT NULL | SCORE_S | 分級分數起始值 |
| score_e | INTEGER | NOT NULL | SCORE_E | 分級分數結束值 |
| card_level | VARCHAR(1) | NOT NULL | CARD_LEVEL | 等級代號（A/B/C/D/E）。**型別設計備註**：刻意設定為 VARCHAR(1)，反映 dump 觀察所有等級代號均為單字元（A/B/C/D）之業務約束；與 `ob_tier.card_level VARCHAR(5)` 長度不對稱，係因 `ob_tier.card_level` 對應原表 `varchar(5) NULL`（保留原始型別），兩欄在 PostgreSQL 類型相容（VARCHAR(1) 指派給 VARCHAR(5) 變數不截斷），執行期無問題 |

**索引**：`(card_type, card_version)`（複合索引）

---

#### ob_tier（OBTIER — TIER_LEVEL 對應表） {#ob-tier-entity}

> schema 已於 2026-05-05 取得（路徑：`reference/TableSchema/OB/OBTIER.sql`）。原表共 4 欄全部 NULLABLE、無 PK 約束、無稽核欄位。**遷移時建議補建 PK `(card_type, card_level)`**（依 SP join 邏輯 `LEFT JOIN OBTIER C ON A.CARD_LEVEL=C.CARD_LEVEL AND B.CARD_TYPE=C.CARD_TYPE`），並將 `card_type` / `tier_level` 補上 NOT NULL 約束以保證 join 與輸出語意。`card_level` 因 dump 觀察存在 NULL 值（M5 fallback），維持 NULL。詳見 [open-questions.md OQ-E07-14](open-questions.md#e07-已解決-spec-層級問題2026-04-24-本版規格撰寫) 與假設 A53 / A54。

PK：`(card_type, COALESCE(card_level, ''))`（[ASSUMPTION] — 原 OBTIER 無 PK constraint，本表於遷移至 AppDB 時依 SP join 邏輯補建；當 `card_level IS NULL`（fallback CARD_TYPE 如 M5）時以空字串納入 PK 唯一性比對，亦可採 PostgreSQL 15+ 的 `NULLS NOT DISTINCT` 索引語法等價表達）

用途：將「計分卡類型 CARD_TYPE × 計分卡等級 CARD_LEVEL」對應到外部系統使用的分群代碼 TIER_LEVEL。月跑 Stage 2 計算出 `ob_pool_data_list.card_level` 後，依本表 join 取得 `tier_level` 寫回。

| 欄位名 | 型別 | NULL | 原欄位 | 說明 |
|--------|------|------|--------|------|
| list_nm | VARCHAR(30) | NULL | LIST_NM | 名單名稱（描述性欄位，不參與 join；對應原表 `nvarchar(30)`） |
| card_type | VARCHAR(5) | NOT NULL | CARD_TYPE | **PK** 組成，計分卡類型（如 H/S/E/S5/E5/M/HM/M5 等；對應原表 `varchar(5) NULL`，遷移時補上 NOT NULL） |
| card_level | VARCHAR(5) | NULL | CARD_LEVEL | **PK** 組成，計分卡等級（A/B/C/D；對應原表 `varchar(5) NULL`）。**dump 觀察存在 NULL 值**（如 `M5` → `T5M`，CARD_LEVEL 為空字串），用於 fallback CARD_TYPE 直接對應 TIER_LEVEL 不分等級的情境，遷移時維持 NULL 允許並以 `COALESCE(card_level, '')` 納入 PK |
| tier_level | VARCHAR(5) | NOT NULL | TIER_LEVEL | 名單分群結果代碼（如 T1/T2/T3/T5M/THC/T3C 等；對應原表 `varchar(5) NULL`，遷移時補上 NOT NULL） |

**Fallback CARD_TYPE 觀察**（dump 範圍：`reference/DumpData/OBTIER_20260505.csv`）：

| 維度 | 觀察值 | 備註 |
|------|--------|------|
| 全部 CARD_TYPE | `H` / `S` / `E` / `S5` / `E5` / `M` / **`HM`** / **`M5`**（共 8 種） | OBLEVELCARD_VERSION 僅含 6 種計分版本（無 HM / M5），HM / M5 為「計分卡體系外的 fallback」 |
| 全部 TIER_LEVEL | `T1` / `T2` / `T3` / `T32` / `T4` / `T51` / `T52` / `T1M` / `T3M` / `T5M` / `T1HM` / `T2HM` / `T3HM` / `T3` 等（共 13 種變體） | 由業務定義，不限制列舉 |
| CARD_LEVEL NULL 紀錄 | `機車中結滿期名單,M5,,T5M`（dump 第 28 列）| `M5` 為 fallback CARD_TYPE，CARD_LEVEL 為空字串，直接對應 `T5M`，不分等級 |
| CARD_LEVEL 非 NULL 紀錄 | 其餘 24 筆，CARD_LEVEL 取值 `A` / `B` / `C` / `D` | 標準計分流程：CARD_TYPE × CARD_LEVEL → TIER_LEVEL |

**CARD_TYPE 完整覆蓋率分析**（依據 OBMLISTDF / OBTIER / OBLEVELCARD_VERSION 三表對照，2026-05-13）：

> 資料來源：`reference/DumpData/OBMLISTDF_*.csv`（OBMLISTDF 名單統計）+ `reference/DumpData/OBTIER_20260505.csv` + `reference/DumpData/OBLEVELCARD_VERSION_20260505.csv`

| CARD_TYPE | OBMLISTDF 名單筆數 | ob_levelcard_version | ob_tier | 遷移狀態 |
|-----------|-----------------|---------------------|---------|---------|
| H | 124 | ✅ 有計分版本 | ✅ A/B/C/D 四筆 | 完整支援 |
| S | 124 | ✅ 有計分版本 | ✅ A/B/C/D 四筆 | 完整支援 |
| E | 62 | ✅ 有計分版本 | ✅ A/B/C/D 四筆 | 完整支援 |
| M | 58 | ✅ 有計分版本 | ✅ A/B/C/D 四筆 | 完整支援 |
| E5 | 53 | ✅ 有計分版本 | ✅ A/B/C/D 四筆 | 完整支援 |
| S5 | 53 | ✅ 有計分版本 | ✅ A/B 兩筆（S5 業務僅分兩級） | 完整支援 |
| HM | 63 | ❌ **缺計分版本**（舊 SP 借用 M 設定） | ✅ A/B/C/D 四筆 | **需補建計分設定（AD-E07-15）** |
| M5 | — （無名單，為 TIER fallback） | ❌ 不適用（非計分卡）| ✅ 1 筆（card_level=NULL → T5M）| fallback 規則，不需計分版本 |
| M3 | 31 | ❌ **缺計分版本** | ❌ **缺 ob_tier 對應** | **需補 ob_tier seed（見下方）** |
| HC | 25 | ❌ **缺計分版本** | ❌ **缺 ob_tier 對應** | **需補 ob_tier seed（見下方）** |
| C3 | 23 | ❌ **缺計分版本** | ❌ **缺 ob_tier 對應** | **需補 ob_tier seed（見下方）** |
| HB | 1 | ❌ 缺 | ❌ 缺 | 邊緣 CARD_TYPE，待業務確認（OQ-E07-29） |
| SEB | 1 | ❌ 缺 | ❌ 缺 | 邊緣 CARD_TYPE，待業務確認（OQ-E07-29） |
| SEC | 1 | ❌ 缺 | ❌ 缺 | 邊緣 CARD_TYPE，待業務確認（OQ-E07-29） |

**M3 / HC / C3 ob_tier Seed 規範**（OQ-E07-28 決議，2026-05-13）：

OBMLISTDF dump 確認 M3（31 筆）/ HC（25 筆）/ C3（23 筆）仍為業務現役 CARD_TYPE，但 OBTIER dump 中三者均無對應紀錄——舊系統以 `Stage2_依照CardType分類TierLevel.sql` L93–123 硬編碼覆寫 TIER_LEVEL，未入 OBTIER 表。

遷移腳本（D3：OBTIER → ob_tier）執行後，需**額外執行以下 seed INSERT**，移植舊 SP 硬編碼邏輯：

```sql
-- M3：機車中途結清 3 年以上，一律對應 T5M（Stage2 SP L93-100）
INSERT INTO ob_tier (card_type, card_level, tier_level, list_nm)
VALUES ('M3', NULL, 'T5M', '機車中結滿期名單（3年以上）');

-- HC：汽車（HC 類），一律對應 THC（Stage2 SP L103-111）
INSERT INTO ob_tier (card_type, card_level, tier_level, list_nm)
VALUES ('HC', NULL, 'THC', '汽車HC名單');

-- C3：汽車 3 年以下，一律對應 T3C（Stage2 SP L114-122）
INSERT INTO ob_tier (card_type, card_level, tier_level, list_nm)
VALUES ('C3', NULL, 'T3C', '汽車C3名單');
```

> **說明**：M3 / HC / C3 三者在舊系統皆為「不分等級直接對應 TIER_LEVEL」模式（等同 M5 的 fallback 語意），故 `card_level = NULL`（fallback 規則）。`fn_calc_tier_level` 計分後若無 CARD_LEVEL 對應，自動走 `card_level IS NULL` 分支，能正確取得 TIER_LEVEL。
>
> **遷移腳本責任**：以上 seed 由 TDD 開發者在 D3 migration 腳本末段執行，本 agent 不直接寫 migration 程式碼。D11 驗證 SQL 需補入確認 M3 / HC / C3 各有 1 筆 `card_level IS NULL` 的對應紀錄。
>
> **計分設定缺漏**：M3 / HC / C3 同樣缺少 `ob_levelcard_version` 計分設定（與 HM 相同）；遷移後月跑這些 CARD_TYPE 名單時 score=0，tier_level 由 fallback 取得（T5M / THC / T3C）。業務語意上這與舊 SP 的硬編碼行為等效（舊 SP 對這三種 CARD_TYPE 完全略過計分步驟，直接覆寫 TIER_LEVEL）——因此**月跑結果語意一致**，但計分數值不可信。詳見 [architecture-spec.md AD-E07-15](architecture-spec.md#ad-e07-15hm-計分卡獨立化決策)。

**Stage 2 fallback join 語意**：當 `ob_pool_data_list.card_level` 在 `ob_tier` 找不到對應紀錄時，回退以 `CARD_TYPE` 比對 `card_level IS NULL` 的 fallback 紀錄（如 M5 → T5M）。F056 編輯時允許新增 `card_level IS NULL` 紀錄但需 UI 提示為 fallback 規則。

---

**TIER_LEVEL 列舉約束與遷移規則（F056 v1.5+，2026-05-14 新增）**

> 對應 F056 v1.5 BR-2 / BR-12 / AC-8 / `TIER_LEVEL_INVALID_ENUM` 錯誤碼。

**列舉約束**：自 F056 v1.5 起，`ob_tier.tier_level` 之**寫入端點**（POST / PUT）僅接受固定列舉值：

```
T1, T2, T3, T4, T5, T6, T7, T8, T9, T10
```

讀取端點（GET）不阻擋舊資料顯示（過渡期），但遷移完成後資料層應無例外。違反列舉之寫入回 422 `TIER_LEVEL_INVALID_ENUM`。

**遷移規則（OQ-E07-31 ✅ Resolved 2026-05-14）**：

遷移腳本（D3：OBTIER → ob_tier）執行後，對 `ob_tier.tier_level` 既有後綴值依「取前綴數字」規則統一轉換。規則：正則 `^T(\d+)` 取得 T 後第一個連續數字，取**首位數字**組合為 `T{N}`。

完整映射表（涵蓋 OBTIER dump 觀察之 13 種變體）：

| 舊值 | 新值 | 規則來源 |
|------|------|----------|
| T1 / T2 / T3 / T4 / T5 | 不變 | 已在列舉內 |
| T1M | T1 | 取前綴數字 1 |
| T1HM | T1 | 取前綴數字 1 |
| T2HM | T2 | 取前綴數字 2 |
| T3M | T3 | 取前綴數字 3 |
| T3HM | T3 | 取前綴數字 3 |
| T3C | T3 | 取前綴數字 3 |
| T32 | T3 | 取首位數字 3 |
| T4M | T4 | 取前綴數字 4 |
| T51 | T5 | 取首位數字 5 |
| T52 | T5 | 取首位數字 5 |
| T5M | T5 | 取前綴數字 5 |
| **THC** | **T1** | OQ新-2 ✅ Resolved 2026-05-14：HC 為汽車 high-credit 最高層級，遷移至 T1 |

> **遷移範圍限定 6 個正規 CARD_TYPE**（F056 v1.5 BR-6）：本遷移規則僅適用於遷移範圍內之 6 個正規 CARD_TYPE（H / S / E / S5 / E5 / M）所對應的 OBTIER 紀錄。HM / M3 / HC / C3 / M5 等過渡 / fallback CARD_TYPE 之 OBTIER 紀錄**整列不匯入** `ob_tier`（避免違反 `ob_card_type` 1:1 綁定約束）。因此 dump 中之 `T1HM` / `T2HM` / `T3HM` / `T5M`（屬 HM / M5 紀錄）與 `THC`（屬 HC 紀錄）等實際上多數於遷移時隨對應 CARD_TYPE 紀錄一起略過；本映射表仍保留以涵蓋邊界情境（如業務未來補建 HM 計分卡並沿用舊 TIER 值時）。

**遷移腳本責任**：由 TDD 開發者於 D3 migration 後執行 UPDATE 腳本。D11 驗證 SQL 需確認：

```sql
-- 驗證 ob_tier.tier_level 全部值符合 T1~T10 列舉
SELECT tier_level, COUNT(*)
  FROM ob_tier
 WHERE tier_level NOT IN ('T1','T2','T3','T4','T5','T6','T7','T8','T9','T10')
 GROUP BY tier_level;
-- 預期：0 列
```

**DB 層列舉約束實作（✅ OQ-E07-36 Resolved，system-architect，2026-05-14）**

採 `CHECK constraint`（非 PostgreSQL `ENUM type`，非純應用層驗證）：

```sql
ALTER TABLE ob_tier
  ADD CONSTRAINT chk_ob_tier_tier_level
    CHECK (tier_level IN ('T1','T2','T3','T4','T5','T6','T7','T8','T9','T10'));
```

執行時序（**D-CT-03 migration，必須依序**）：D3 migration（OBTIER → ob_tier）→ TIER_LEVEL 轉換 UPDATE → M3/HC/C3 seed INSERT → D11 驗證確認 0 筆違規 → **加 CHECK constraint**。

選用 CHECK constraint 而非 ENUM type 的理由：若未來業務需擴展至 T11+，只需 `ALTER TABLE DROP CONSTRAINT + ADD CONSTRAINT`，不需 `ALTER TYPE`（PostgreSQL ENUM DDL 在部分版本無法 rollback）。SQLite 支援 CHECK constraint，E2E 測試相容（PostgreSQL 版本加入；SQLite 版本可省略，由應用層保證）。

**ob_tier Fallback 紀錄刪除操作規範（⚠️ TypeORM NULL PK silent bug 防範）**

`ob_tier.card_level` 為 nullable 欄位，Fallback 紀錄之 `card_level IS NULL`。**刪除 Fallback 單筆紀錄**（F056 AC-7）**必須**：

```typescript
// ✅ 正確：先取得 entity，再 remove
const entity = await repo.findOne({
  where: { card_type: ct, card_level: IsNull() }
});
await repo.remove(entity);

// ❌ 禁止：TypeORM 產生 WHERE card_level = NULL（永不 match，silent bug）
await repo.delete({ card_type: ct, card_level: null });
```

> F072 步驟 1 刪除 `ob_tier WHERE card_type = :cardType`（整批，WHERE 條件為非 NULL 的 `card_type`）**不受此問題影響**，可正常使用 `repo.delete({ card_type: cardType })`。

---

**M02 計分設定擴充（2026-05-14）相關規則彙整**

| 來源 | 規則 | 適用範圍 |
|------|------|----------|
| F056 BR-6 | 遷移範圍限 6 個正規 CARD_TYPE | OBTIER → ob_tier 遷移腳本 |
| F056 BR-13 | Fallback / Standard 互斥 | ob_tier 寫入 |
| F056 BR-12 | TIER 遷移規則（^T(\d+) 取前綴）| 本章節「TIER_LEVEL 列舉約束與遷移規則」段落 |
| F072 BR-1~9 | CARD_TYPE 級聯 hard delete | ob_card_type + 下游 5 表 |
| F072 BR-3 | 排除 ob_pool_data_list / assignment_run_snapshot / ob_list_definition | F072 級聯範圍 |

**SP join 證據對照**（已實證 vs 仍假設）：

| 欄位 | SP 證據 | 狀態 |
|------|---------|------|
| `card_type` | `B.CARD_TYPE = C.CARD_TYPE` | ✅ 已實證（OBTIER.sql 確認 CARD_TYPE varchar(5) NULL） |
| `card_level` | `A.CARD_LEVEL = C.CARD_LEVEL` | ✅ 已實證（OBTIER.sql 確認 CARD_LEVEL varchar(5) NULL） |
| `tier_level` | `SET TIER_LEVEL = ISNULL(C.TIER_LEVEL, '')` | ✅ 已實證（OBTIER.sql 確認 TIER_LEVEL varchar(5) NULL） |
| `list_nm` | 未參與 SP join，原表為描述性欄位 | ✅ 已實證（OBTIER.sql 確認 LIST_NM nvarchar(30) NULL） |
| PK `(card_type, card_level)` | SP join 鍵組合 | [ASSUMPTION] — 原表無 PK constraint，遷移時補建 |
| 稽核欄位 | 原表無稽核欄位 | ✅ 已實證（OBTIER.sql 4 欄均無稽核欄位）；E07 內容變更稽核透過 `assignment_audit_log` 統一處理 |

**索引**：`UNIQUE INDEX ON ob_tier (card_type, COALESCE(card_level, ''))` 即為主索引（entity 檔案 line 9 說明：PostgreSQL 不支援 `COALESCE` in Primary Key，以 raw SQL UNIQUE INDEX 等效表達）；無額外索引需求。

**Fallback / Standard 互斥約束實作（✅ OQ-E07-35 Resolved，system-architect，2026-05-14）**

採**應用層 Mutex 檢查**，不建立 DB-level partial unique index 或 trigger。

理由：Fallback/Standard 互斥語意（「同一 card_type 下不可同時存在 card_level IS NULL 與 card_level IS NOT NULL」）無法用單一 DB constraint 精確表達；應用層已是唯一寫入路徑；SQLite E2E trigger 語法差異問題；MVP 並發量極低。

**Service 層實作規範（TDD Developer）**：F056 `createTierMapping()` / `updateTierMapping()` 在同一 transaction 中：

```typescript
// 1. 計算 Standard 筆數（card_level IS NOT NULL）
const standardCount = await repo.count({
  where: { card_type: ct, card_level: Not(IsNull()) }
});
// 2. 確認 Fallback 是否存在（card_level IS NULL）
const fallbackExists = await repo.exists({
  where: { card_type: ct, card_level: IsNull() }
});
// 3. 新增 Fallback 時，若已有 Standard 紀錄 → 422 CARD_TYPE_FALLBACK_STANDARD_MUTEX
// 4. 新增 Standard 時，若已有 Fallback 紀錄 → 422 CARD_TYPE_FALLBACK_STANDARD_MUTEX
```

**注意**：與 `ob_levelcard_level`（CARD_LEVEL 分級門檻：總分區間 → CARD_LEVEL，由 F055 維護）為**不同表**，不可混用。`ob_tier` 為 TIER_LEVEL 對應，由 F056 維護。

---

#### ob_arreturndf_min_cap（OB_ARRETURNDF_MIN_CAP — ARRETURNDF 累積未償本金彙總） {#ob-arreturndf-min-cap-entity}

> **資料同步機制**：本表採 **E04 + E05 雙層 ETL** 同步：E04 通用擷取任務從舊 OB DB（SQL Server `OB_ARRETURNDF_MIN_CAP`）抓取至 `raw_{task_id_short}` 中介表，再由 E05 Pipeline TargetLoad 將資料載入本表（`fullMode: true` 全量替換）。OB 端 `OB_ARRETURNDF_MIN_CAP` 為 `ARRETURNDF` 還款明細表的預先彙總結果（`MIN(ADD_UN_CAPITAL) GROUP BY APPL_NO`）；每月月跑前由業務主管手動依序觸發 E04→E05（同 OBPOOLDATA 同步策略）。詳見 [architecture-spec.md §E07-C](architecture-spec.md#e07-c-etl-設計) ETL 設計。**E07 不提供 CRUD 維護介面**，所有資料維護於舊 OB 端進行。

PK：`appl_no` [ASSUMPTION] 原表（`OB_ARRETURNDF_MIN_CAP`）無 PK constraint 亦無索引；遷移時補建 `PRIMARY KEY (appl_no)` 以利 `fn_calc_tier_level` 內部 LEFT JOIN 查詢。DBA 需確認 OB 端 SP 重建後 `APPL_NO` 唯一性（若存在重複 key，需在 ETL 層以 `MIN(ADD_UN_CAPITAL) GROUP BY APPL_NO` 或 `DISTINCT ON (appl_no)` 去重後再寫入）。

用途：E07 月跑 Stage 2 計分時，`fn_calc_tier_level` 以 LEFT JOIN 取得個別案件的累積未償本金（`ADD_UN_CAPITAL` 維度），適用 H / HM 等需要此計分維度的計分卡類型。缺值時 default 為 0。

| 欄位名 | 型別 | NULL | 原欄位 | 說明 |
|--------|------|------|--------|------|
| appl_no | VARCHAR(20) | NOT NULL | APPL_NO | **PK**，案件編號（與 `ob_pool_data.appl_no` join key） |
| add_un_capital | NUMERIC(15,0) | NULL | ADD_UN_CAPITAL | 累積未償本金（OB 端預先彙總，OB SP：`MIN(ADD_UN_CAPITAL) GROUP BY APPL_NO`） |
| _cdmp_extracted_at | TIMESTAMP | NOT NULL | （系統欄位）| ETL 擷取時間戳記（由 E04/E05 寫入，UTC） |

**索引**：
- `appl_no`（PK，補建於遷移時）

**業務規則**：
- 不納入 ORM Entity CRUD（僅讀取）；所有資料修改皆於舊 OB 端進行後 ETL 同步
- `fn_calc_tier_level` 以 `LEFT JOIN ob_arreturndf_min_cap ON appl_no = (p_pool_data).appl_no` 取值；查無資料時以 `COALESCE(add_un_capital, 0)` 處理，行為等價 SP `ISNULL(ADD_UN_CAPITAL, 0)`

**相關功能**：[F061](features/F061-trigger-assignment-run.md)（月跑 Stage 2 計分）

---

#### ob_emphire（OBEMPHIRE — 員工主檔） {#ob-emphire-entity}

> **資料同步機制**：本表採 **E04 + E05 雙層 ETL** 同步：E04 通用擷取任務從舊 OB DB（SQL Server `OBEMPHIRE`）抓取至 raw_{task_id_short} 中介表（既有機制），再由 E05 Pipeline TargetLoad 將資料載入本表（full replace 模式）。OBEMPHIRE 採 **full 全量重抓**策略，每日重抓 raw → Pipeline 整批 replace `ob_emphire`（員工數 < 1 萬筆無效能壓力）。詳見 [architecture-spec.md §E07-C](architecture-spec.md#e07-c-etl-設計) ETL 設計。**E07 不提供 CRUD 維護介面**，所有員工資料維護於舊 OB 端進行。

PK：`emp_id` [ASSUMPTION] 原 OBEMPHIRE 表無 PK constraint，遷移時補建 `PRIMARY KEY (emp_id)` 以利 join。

用途：提供 E07 月跑（Stage 4 人員指派）、F058 編輯人員比例設定、F064 匯出分派結果（員工姓名 join 來源）等 Feature 取得員工基本資料。

| 欄位名 | 型別 | NULL | 原欄位 | 說明 |
|--------|------|------|--------|------|
| emp_id | VARCHAR(10) | NOT NULL | EMP_ID | **PK**，人員編號（員工工號） |
| emp_nm | VARCHAR(50) | NULL | EMP_NM | 人員姓名 |
| id_no | VARCHAR(10) | NULL | ID | 身份證字號（避免 SQL keyword `id`，重命名為 `id_no`） |
| dept_code | VARCHAR(10) | NULL | DEPT_CODE | 部門代碼 |
| dept_name | VARCHAR(30) | NULL | DEPT_NAME | 部門名稱 |
| title_code | VARCHAR(5) | NULL | TITLE_CODE | 職稱代碼 |
| title_name | VARCHAR(30) | NULL | TITLE_NAME | 職稱名稱 |
| jfun_id | VARCHAR(10) | NULL | JFUN_ID | 職務代碼 |
| jfun_nm | VARCHAR(15) | NULL | JFUN_NM | 職務名稱 |
| hire_date | DATE | NULL | HIRE_DATE | 在職日期（到職日） |
| resign_date | DATE | NULL | RESIGN_DATE | 離職日期（NULL 表示在職中） |
| email | VARCHAR(100) | NULL | EMAIL | 信箱 |
| is_auth | VARCHAR(1) | NULL | IS_AUTH | 是否最高權限（沿用舊系統旗標） |

**索引**：
- `emp_id`（PK）
- `(dept_code)` — 依部門查詢員工（F058 編輯部門人員比例下拉清單）
- `(resign_date)` — 在職員工查詢（`WHERE resign_date IS NULL`）

**業務規則**：
- 在職員工判定條件：`resign_date IS NULL`
- 不納入 ORM Entity CRUD（僅讀取）；E07 內所有員工資料修改皆於舊 OB 端進行後 ETL 同步

**相關功能**：[F058](features/F058-edit-personnel-ratio.md)、[F061](features/F061-trigger-assignment-run.md)、[F063](features/F063-view-run-result-summary.md)、[F064](features/F064-export-assignment-result.md)

---

#### ob_calendar（OBCALENDAR — 工作日/假日表） {#ob-calendar-entity}

> **資料同步機制**：本表採 **E04 + E05 雙層 ETL** 同步：E04 通用擷取任務從舊 OB DB（SQL Server `OBCALENDAR`）抓取至 raw_{task_id_short} 中介表（既有機制，年初執行），再由 E05 Pipeline TargetLoad 將資料載入本表（full replace 模式）。每年底由 Admin 於舊 OB 端維護下年度資料後，透過此雙層 ETL 流程帶入 AppDB。詳見 [architecture-spec.md §E07-C](architecture-spec.md#e07-c-etl-設計) ETL 設計。**E07 不提供 CRUD 維護介面**。

PK：`calendar_date`

用途：提供 F049 Stage 0 每日分派數量估算所需之工作日篩選（排除週末與假日）。

| 欄位名 | 型別 | NULL | 原欄位 | 說明 |
|--------|------|------|--------|------|
| calendar_date | DATE | NOT NULL | CALENDAR_DATE | **PK**，日期 |
| rest_flg | VARCHAR(1) | NOT NULL | REST_FLG | 工作日旗標（`'0'` = 工作日 / `'1'` = 假日；原表型別為 `int`，遷移統一字串以避免 boolean 隱式轉換） |

**索引**：`calendar_date`（PK 即查詢索引）

**業務規則**：
- 工作日判定：`rest_flg = '0'`
- 月跑期間之工作日數計算：`SELECT COUNT(*) FROM ob_calendar WHERE rest_flg = '0' AND calendar_date BETWEEN :startDate AND :endDate`
- 假日定義由舊 OB 端 Admin 維護，包含週末與國定假日

**相關功能**：[F049](features/F049-stage0-daily-estimate.md)

---

### E07 新建表（非 ob_ 前綴）

#### assignment_run（月跑執行紀錄）

| 欄位名 | 型別 | NULL | 說明 |
|--------|------|------|------|
| run_id | UUID | NOT NULL | **PK**，月跑唯一識別碼（系統自動產生） |
| project_workym | VARCHAR(6) | NOT NULL | 作業年月（YYYYMM） |
| status | VARCHAR(20) | NOT NULL | 執行狀態：`pending` / `running` / `completed` / `failed` |
| triggered_by | UUID | NOT NULL | 觸發者 user_id（FK → users.id） |
| started_at | TIMESTAMP | NULL | 執行開始時間（UTC） |
| finished_at | TIMESTAMP | NULL | 執行結束時間（UTC） |
| duration_ms | INTEGER | NULL | 執行耗時（毫秒） |
| total_cases | INTEGER | NULL | 本次分派總案件數 |
| total_lists | INTEGER | NULL | 本次處理名單數 |
| error_message | TEXT | NULL | 失敗錯誤訊息 |
| created_at | TIMESTAMP | NOT NULL | 紀錄建立時間（UTC） |

**索引**：`run_id`（PK）、`(project_workym, status)`（查詢索引）

---

#### assignment_run_snapshot（月跑快照）

| 欄位名 | 型別 | NULL | 說明 |
|--------|------|------|------|
| snapshot_id | UUID | NOT NULL | **PK**，快照識別碼 |
| run_id | UUID | NOT NULL | FK → assignment_run.run_id |
| snapshot_type | VARCHAR(20) | NOT NULL | 快照類型：`config` / `input_list` / `result` |
| payload | JSONB | NOT NULL | 快照內容（JSON） |
| created_at | TIMESTAMP | NOT NULL | 快照建立時間（UTC） |

**業務規則**：
- 每次月跑產生 3 筆快照（config、input_list、result）
- 快照保留期限與 `assignment_run` 相同（3 年）

**索引**：`snapshot_id`（PK）、`(run_id, snapshot_type)`（查詢索引）

---

#### assignment_audit_log（E07 CRUD 稽核日誌）

| 欄位名 | 型別 | NULL | 說明 |
|--------|------|------|------|
| log_id | UUID | NOT NULL | **PK**，日誌識別碼 |
| entity_type | VARCHAR(50) | NOT NULL | 被操作實體（如 `ob_list_definition`、`ob_dept_pct`） |
| entity_id | VARCHAR(100) | NOT NULL | 被操作實體的識別碼（字串化） |
| action | VARCHAR(10) | NOT NULL | 操作類型：`CREATE` / `UPDATE` / `DELETE` / `RUN` |
| actor_id | UUID | NOT NULL | 操作者 user_id（FK → users.id） |
| actor_name | VARCHAR(100) | NOT NULL | 操作者姓名（快照，不受後續改名影響） |
| before_value | JSONB | NULL | 操作前資料快照（UPDATE/DELETE 填入） |
| after_value | JSONB | NULL | 操作後資料快照（CREATE/UPDATE 填入） |
| ip_address | VARCHAR(45) | NULL | 操作者 IP（IPv4/IPv6） |
| created_at | TIMESTAMP | NOT NULL | 稽核紀錄建立時間（UTC） |

**業務規則**：
- 保留 3 年（架構決策 AD-E07-3）
- 不可修改或刪除（INSERT-only）
- 超過 3 年的紀錄由排程任務定期清除

**索引**：`log_id`（PK）、`(entity_type, entity_id)`、`(actor_id, created_at)`、`created_at`（保留期排程清理）

---

### User 實體補充（E07 新增欄位）

`users` 表新增以下欄位，支援業務主管角色識別：

| 欄位名 | 型別 | NULL | 說明 |
|--------|------|------|------|
| is_sales_manager | BOOLEAN | NOT NULL DEFAULT FALSE | 業務主管旗標（true = 可管理所屬業務員名單分派） |

**業務規則**：
- `is_sales_manager = true` 的使用者可於 E07 UI 查看並管理其所屬部門的分派結果
- 該旗標由 Admin 設定，不可自行設定
- 與 `role` 欄位無衝突（`role = user` 且 `is_sales_manager = true` 為合法組合）

**相關功能**：[E07 epic-brief](stories/E07-epic-brief.md)
