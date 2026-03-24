---
spec-id: data-model
title: 資料模型
version: "1.2"
date: 2026-03-19
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

ETL Pipeline 的 Load 節點載入目標。系統預先定義 4 個 Domain Data Product 目標表，採用 Domain-Oriented 設計。目標表不納入 ORM Entity 管理，由系統預先建立並透過 Pipeline 執行時以動態 SQL 寫入。

### 命名規則

| 目標表 | 表名 | Domain | 說明 |
|--------|------|--------|------|
| Customer Core | `customer_core` | core | 客戶基本身分與主檔資料 |
| Customer Interaction | `customer_interaction` | interaction | 客戶行為與接觸紀錄 |
| Customer Financial | `customer_financial` | financial | 交易與風控資料 |
| Customer Service | `customer_service` | service | 客服與申訴案件 |

### customer_core 目標表 {#target-customer-core}

| 欄位名稱 | 型別 | Nullable | PK | 說明 |
|----------|------|----------|-----|------|
| customer_id | UUID | 否 | 是 | 客戶唯一識別碼 |
| id_number | VARCHAR | 是 | | 身分證號（加密） |
| name | VARCHAR | 是 | | 姓名 |
| gender | VARCHAR | 是 | | 性別 |
| date_of_birth | DATE | 是 | | 生日 |
| phone | VARCHAR | 是 | | 電話 |
| email | VARCHAR | 是 | | Email |
| address | TEXT | 是 | | 地址 |
| occupation | VARCHAR | 是 | | 職業 |
| company_name | VARCHAR | 是 | | 公司名稱 |
| customer_type | VARCHAR | 是 | | 客戶類型（individual / corporate） |
| registration_date | TIMESTAMP | 是 | | 建檔日期 |
| data_source | VARCHAR | 是 | | 資料來源識別 |
| last_updated_at | TIMESTAMP | 是 | | 最後更新時間 |
| _etl_loaded_at | TIMESTAMP | 否 | | ETL 載入時間（系統自動填充） |
| _etl_pipeline_id | UUID | 否 | | 載入的 Pipeline ID（系統自動填充） |

### customer_interaction 目標表 {#target-customer-interaction}

| 欄位名稱 | 型別 | Nullable | PK | 說明 |
|----------|------|----------|-----|------|
| interaction_id | UUID | 否 | 是 | 互動唯一識別碼 |
| customer_id | UUID | 是 | | 關聯客戶 |
| interaction_type | VARCHAR | 是 | | 接觸類型（call / email / sms / visit / app / web / dm） |
| channel | VARCHAR | 是 | | 通路 |
| direction | VARCHAR | 是 | | 方向（inbound / outbound） |
| interaction_date | TIMESTAMP | 是 | | 接觸時間 |
| campaign_id | VARCHAR | 是 | | 行銷活動 ID |
| campaign_name | VARCHAR | 是 | | 行銷活動名稱 |
| response_status | VARCHAR | 是 | | 回應狀態 |
| content_summary | TEXT | 是 | | 內容摘要 |
| agent_id | VARCHAR | 是 | | 處理人員 |
| data_source | VARCHAR | 是 | | 資料來源識別 |
| _etl_loaded_at | TIMESTAMP | 否 | | ETL 載入時間（系統自動填充） |
| _etl_pipeline_id | UUID | 否 | | 載入的 Pipeline ID（系統自動填充） |

### customer_financial 目標表 {#target-customer-financial}

| 欄位名稱 | 型別 | Nullable | PK | 說明 |
|----------|------|----------|-----|------|
| financial_id | UUID | 否 | 是 | 財務記錄唯一識別碼 |
| customer_id | UUID | 是 | | 關聯客戶 |
| contract_id | VARCHAR | 是 | | 合約編號 |
| contract_type | VARCHAR | 是 | | 合約類型（loan / lease） |
| vehicle_model | VARCHAR | 是 | | 車型 |
| vehicle_year | INTEGER | 是 | | 車輛年份 |
| principal_amount | DECIMAL | 是 | | 本金金額 |
| monthly_payment | DECIMAL | 是 | | 月付金 |
| interest_rate | DECIMAL | 是 | | 利率 |
| term_months | INTEGER | 是 | | 期數 |
| payment_status | VARCHAR | 是 | | 還款狀態（current / overdue / default / closed） |
| overdue_days | INTEGER | 是 | | 逾期天數 |
| overdue_amount | DECIMAL | 是 | | 逾期金額 |
| credit_score | INTEGER | 是 | | 信用評分 |
| risk_level | VARCHAR | 是 | | 風險等級（low / medium / high / critical） |
| contract_start_date | DATE | 是 | | 合約起始日 |
| contract_end_date | DATE | 是 | | 合約結束日 |
| data_source | VARCHAR | 是 | | 資料來源識別 |
| _etl_loaded_at | TIMESTAMP | 否 | | ETL 載入時間（系統自動填充） |
| _etl_pipeline_id | UUID | 否 | | 載入的 Pipeline ID（系統自動填充） |

### customer_service 目標表 {#target-customer-service}

| 欄位名稱 | 型別 | Nullable | PK | 說明 |
|----------|------|----------|-----|------|
| service_id | UUID | 否 | 是 | 服務案件唯一識別碼 |
| customer_id | UUID | 是 | | 關聯客戶 |
| case_number | VARCHAR | 是 | | 案件編號 |
| case_type | VARCHAR | 是 | | 案件類型（inquiry / complaint / request / dispute） |
| category | VARCHAR | 是 | | 分類 |
| priority | VARCHAR | 是 | | 優先級（low / medium / high / urgent） |
| status | VARCHAR | 是 | | 狀態（open / in_progress / resolved / closed） |
| channel | VARCHAR | 是 | | 進件通路 |
| description | TEXT | 是 | | 案件描述 |
| resolution | TEXT | 是 | | 處理結果 |
| assigned_to | VARCHAR | 是 | | 指派人員 |
| opened_at | TIMESTAMP | 是 | | 建立時間 |
| resolved_at | TIMESTAMP | 是 | | 解決時間 |
| satisfaction_score | INTEGER | 是 | | 滿意度（1-5） |
| data_source | VARCHAR | 是 | | 資料來源識別 |
| _etl_loaded_at | TIMESTAMP | 否 | | ETL 載入時間（系統自動填充） |
| _etl_pipeline_id | UUID | 否 | | 載入的 Pipeline ID（系統自動填充） |

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

**相關功能**：[F029](features/F029-pipeline-editor.md), [F036](features/F036-target-tables.md)
