---
spec-id: data-model
title: 資料模型
version: "1.18"
date: 2026-07-02
status: Draft
---

> **v1.18（2026-07-02 / AD-E07-37 定案）**：System Architect 裁定 F109 §12.2 全部 5 個 Open Question，詳見 [`implementation-log/AD-E07-37-f109-customer-source-filter.md`](implementation-log/AD-E07-37-f109-customer-source-filter.md)。schema 定案（無變更，確認 spec-writer v1.17 草擬型別）：`data_source VARCHAR(20) NOT NULL DEFAULT 'ob_pool_data'` + PG CHECK（SQLite 無 CHECK，應用層保證，同 `field_type` 慣例）；既有 7 筆透過 `ALTER TABLE ADD COLUMN ... DEFAULT` 自動 backfill（免 UPDATE 陳述式）；migration 編號 **m305**（`AddDataSourceToPooldataFieldWhitelist`，schema-only）+ **m306**（`SeedCustomerCoreFilterFields`，8 筆白名單 + 106 筆可選值 seed，`ON CONFLICT DO NOTHING` 冪等）。**新增**：`ob_list_definition.condition_payload.conditions[]` JSONB schema 補 `dataSource?: 'ob_pool_data' | 'customer_core'`（optional，F109 上線前既有名單無此 key）——寫入時由 `AssignmentListService.stampConditionDataSource` 固化；讀取時缺值以靜態常數 `CUSTOMER_CORE_COLUMN_NAMES` fallback 判定，兩者皆不 runtime 查白名單（維持 BR-6「Stage 1 不 join 白名單」）。**不需要**對既有 `condition_payload` 做 backfill migration（F109 前不可能有 customer_core 欄名存在於舊 payload，白名單驗證已擋）。

> **v1.17（2026-07-02 / US-172 / F109）**：`field_whitelist`（`pooldata_field_whitelist` 實體）新增 `data_source VARCHAR(20) NOT NULL DEFAULT 'ob_pool_data'` 欄位（合法值 `'ob_pool_data'` / `'customer_core'`，CHECK 限兩值），標記篩選欄位資料來源；既有 7 筆 backfill `'ob_pool_data'`，F109 新增 8 個客戶屬性欄位為 `'customer_core'`（gender / date_of_birth / occupation_desc / education_desc / marital_status_desc / customer_type_desc / monthly_income_desc / cpost_city，來自 `customer_core`，`ob_pool_data.custo_no = customer_core.source_customer_no` 關聯）。補 `data_source` 業務規則（Stage 1 條件式 LEFT JOIN customer_core + NULL 排除，F109 §6）＋ F109 seed 延伸段（白名單 8 欄 + `categorical_field_value` 7 欄可選值）。型別 / CHECK / migration / backfill / condition data_source 判定機制由 system-architect owns（AD-E07-37 / OQ-F109-01）。

> **v1.16（2026-05-28 / US-144 / AD-E07-18 §18.12）**：`pooldata_field_whitelist`（`field_whitelist` 實體）新增 `is_system_fixed BOOLEAN NOT NULL DEFAULT false` 欄位，標記系統固定篩選條件（F075 v1.7 / migration m295 M-B1）；seed 更新：`best_case.is_system_fixed = true`，其餘 6 筆 `= false`；補充 is_system_fixed 業務規則（BR-15 不可停用 / BR-16 dropdown 排除）；seed 備注對齊 m293 list_type 停用狀態。

> **v1.15（2026-05-26 / Stage 1 精確化工程 AD-E07-21）**：`ob_pool_data_list` 欄位表新增 `data_source VARCHAR(20) NULL`（本系統新增欄位，值域 `'etl_legacy'` / `'monthly_run'`；migration `1711360000291-AddObPoolDataListDataSource`；AD-E07-21 DP-AD21-2 方案 A）。索引補入 `(data_source)` 與 `(assignday)`（去重視窗查詢用）。

> **v1.14（2026-05-26 / F088 準備完成摘要）**：`ob_list_definition` 新增 `stage0_estimate_count`（INT, NULL）與 `stage0_estimated_at`（TIMESTAMP, NULL）兩欄，支援 approve→ready 物化估算快取（AD-E07-20）。`ob_dept_pct.created_by` 補入「設定者姓名查詢」用途說明。

> **v1.13（2026-05-20 / F050 v2.1 名單定義 whitelist-driven 重構）**：依 GAP-LIST §A1~A6 對齊文字描述。核心變更（**不動 entity 結構，不增不減 column**）：
> 1. **L850 condition_payload 描述**：BR 引用版號 v2.0 → v2.1；新增 list_period_* 保留欄位（F050 v2.1 BR-8）+ INACTIVE 選項警示（F050 v2.1 BR-9）；明列 5 個 entity column 為 backward-compat 衍生欄位（J6 / F050 v2.1 BR-10）
> 2. **L854 多值欄位儲存規範**：移除舊 SP `LIKE '%val$$%' OR LIKE '%$$val' OR = 'val'` 三段比對；改為 v2.1 之 SQL `IN (...)` / `BETWEEN`（F050 v2.1 BR-7、US-122 AC-2/AC-3）+ condition_payload IS NULL 之舊名單 fallback 路徑（D4 / US-122 AC-4 / US-123 AC-3）
> 3. **L860 caseyear dump 範例**：「前端 11 個固定選項 0~10」→「v2.1 動態載入 8 個選項 0~6 + 99」（J5 / US-125 AC-1）
> 4. **L842 caseyear 描述欄**：移除「前端固定 11 個 CheckBox」；改為「F050 v2.1 / F051 v2.1 動態載入自 `pooldata_field_option` column_name='caseyear'，初始 seed 8 筆 0~6 + 99（F076 v1.5 / US-125 AC-1）」
> 5. **L844 case_status 描述欄**：移除「可選代碼來源 `ob_code_df` `tbl_id = 'CASE_STATUS'`」；改為「v2.1：可選代碼來源 `pooldata_field_option` column_name='case_status'（4 筆，由 F076 v1.5 維護；US-125 AC-2）；原 `ob_code_df.tbl_id='CASE_STATUS'` 已由 US-124 廢除（F068 DEPRECATED v1.3）」
> 6. **case_status Migration 策略段落**：補 v2.1 第三階段說明（E4 backfill 至 `pooldata_field_option`，由 Phase 3a 執行）
> 7. **舊名單遷移規則段落（I-5）**：補 v2.1 condition_payload IS NULL fallback（D4 / US-122 AC-4 / US-123 AC-3）+ E2 backfill 由 Phase 3a 一次性執行（拍板 2 / 無 confirm 流程）
> 8. **草稿階段欄位編輯規則表**：F050/F051 v2.0 → v2.1；補 list_period_* 不可入 conditions（F050 v2.1 BR-8）
> 9. **「從上月名單複製」段落**：補「複製來源亦需 condition_payload 非 NULL，舊名單不可作為複製來源」+ 跨檔錯誤碼 `LEGACY_LIST_NOT_COPYABLE`（拍板 Q4）

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
| employee_no | 員工編號 | **選填、可為 NULL**，`VARCHAR(32)`，**有值時唯一** | **F113 / US-179 新增**：替代登入識別碼；格式 `^[A-Za-z0-9_-]{1,32}$`、不含 `@`、trim、原樣儲存（不轉大小寫，與 Email 相反）。唯一性採**雙軌**：service 層重複檢查（dev/sqlite/測試之主要守衛）+ MSSQL **filtered unique index** `ux_users_employee_no ON users(employee_no) WHERE employee_no IS NOT NULL`。**Entity 維持 plain `@Column({ nullable: true })`（不宣告 unique）**，filtered index 僅存在於手寫 MSSQL migration，不由 `synchronize` 產生（比照 `queue_job` 兩軌策略）。詳見 [F113 §3](features/F113-employee-no-login-identifier.md#3-欄位契約employee_no) |
| status | 帳號狀態 | 必填，列舉值：`active` / `disabled` | 預設值：`active` |
| created_at | 建立時間 | 必填，系統自動設定 | UTC 時間戳記 |
| updated_at | 最後更新時間 | 必填，系統自動更新 | UTC 時間戳記 |

**業務規則**：

- Email 唯一性比對為大小寫不敏感（儲存時強制小寫）
- Email 格式須符合 RFC 5322 基礎規範
- `employee_no`（F113）選填、可為 NULL；**有值時唯一**（雙軌：service 檢查排除自身 + MSSQL filtered unique index）；**大小寫敏感、原樣儲存**（不轉小寫）；登入時以 `@` 判斷識別碼——含 `@` 走 Email（小寫化比對），否則走 `employee_no`（精確、大小寫敏感比對）。帳號清單搜尋則以大小寫不敏感、部分匹配比對 `employee_no`（與登入刻意不同，OQ-179-02）。`employee_no` 為獨立自由格式登入識別碼，**與 `ob_emphire` / EMPHIRE `emplid` 無關聯**（OQ-179-04）
- 密碼最短 8 個字元（驗證發生在雜湊之前）
- 系統必須至少保留一個 `role = admin` 且 `status = active` 的帳號
- 停用帳號（`status = disabled`）無法登入，嘗試登入時顯示停用訊息
- `role` 欄位僅可使用 2 種預設值（admin、user）；不支援自訂角色（US-017 AC-2）
- 2 種角色為系統預設，不提供 API 新增或刪除（Seed Data 策略）

**相關功能**：[F004](features/F004-create-account.md), [F005](features/F005-view-account-list.md), [F006](features/F006-edit-account.md), [F007](features/F007-disable-enable-account.md), [F008](features/F008-assign-change-role.md), [F045](features/F045-business-role-definitions.md), [F001](features/F001-admin-login.md), [F002](features/F002-user-login.md), [F113](features/F113-employee-no-login-identifier.md)（`employee_no` 欄位契約 + 登入分支權威來源）

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

> **F104 新增 7 欄（migration m301 / 1711360000301，2026-06-24）**：計分引擎 Stage 2 對齊 legacy SP 所需之新欄——`cus_sex varchar(2)` / `carea_no1 varchar(10)` / `carea_no2 varchar(10)` / `cellular varchar(20)` / `hpost_city varchar(20)` / `cpost_city varchar(20)` / `co_city varchar(20)`——已由使用者 ETL 載入 dev DB。binding contract（確切欄名 / 型別 / 填充率 / NULL-safe cast 要求）見 **[AD-E07-10-L v4.0](architecture-spec.md#ad-e07-10-l客戶屬性與-loan-屬性-lookup-約定v40f104-全欄對齊-legacy-sp)**。

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
2. **E07 新建表**（3 張）：月名單分派執行紀錄、快照、稽核，不用 `ob_` 前綴。

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
| prod_best | VARCHAR(5) | NULL | PROD_BEST | **DEPRECATED**（v2.1.1 / 2026-05-20 / US-128 / Q-B B3）：v2.1.1 前為「優良案件旗標」一級欄位；業務語意已遷移至 `condition_payload.conditions[columnName='best_case']`（F075 v1.6 + F076 v1.6，Y = 優質案件 / N = 非優質案件，US-129 AC-1）。schema 欄位保留以兼容遷移期；既有資料於 US-128 一次性 migration 清空為 NULL（Q-B B3「直接清空」決議）；新名單寫入不填值（後端 DTO 處置由 system-architect 決定）。`NOT NULL → NULL` 已放寬以容許清空操作。完全 DROP COLUMN 屬 v2.2+ 後續決策。 |
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
| caseyear | VARCHAR(255) | NULL | CASEYEAR | 進件/滿期/中結年數（多值欄位，`$$` 分隔；**v2.1（2026-05-20）**：F050 v2.1 / F051 v2.1 動態載入自 `pooldata_field_option` `column_name='caseyear'`，初始 seed **8 筆 `0`~`6` + `99`**（由 F076 v1.5 維護；US-125 AC-1 / J5 拍板）；~~F050/F051 前端固定 11 個選項 value `0`~`10`~~（**v2.1 廢除**：A4 / J5 拍板對應 m22 現行 seed 8 筆）；舊系統 hardcoded 證據 `reference/Areas/OBZ/Views/OBZ020/edit.cshtml:174-235`（OQ-E07-24 ✅ Resolved 2026-05-12）僅供歷史對照；本欄位為 v2.1 condition_payload 之 **backward-compat 衍生欄位**（J6 / F050 v2.1 BR-10），由後端依 `condition_payload.conditions[columnName='caseyear'].values` 衍生填入；Stage 1 與 `ob_pool_data.year_cnt` 整數比對） |
| caseyearnm | VARCHAR(10) | NULL | CASEYEARNM | 案件年份名稱 |
| case_status | VARCHAR(14) | NOT NULL | （新增，原 OBMLISTDF.LIST_TYPE 業務語意拆出） | 案件結清期別（多值欄位，`$$` 分隔；**v2.1（2026-05-20）**：可選代碼來源改為 `pooldata_field_option` `column_name='case_status'`（4 筆，由 F076 v1.5 維護；US-125 AC-2 / A5 / E4 解除），原 `ob_code_df.tbl_id='CASE_STATUS'`（對應 OBMCODEDF TBL_ID='22'）已由 US-124 廢除（F068 DEPRECATED v1.3）；本欄位為 v2.1 condition_payload 之 **backward-compat 衍生欄位**（J6 / F050 v2.1 BR-10），由後端依 `condition_payload.conditions[columnName='case_status'].values` 衍生填入。最大長度依 4 個代碼全選計算 `01$$02$$03$$04` = 14 字元。**4 個值業務語意對照詳見 [F050 v2.1 §5.1.1](features/F050-create-list-definition.md#511-case_status-4-個值業務語意對照表)**（OQ-E07-23 ✅ Resolved 2026-05-12，依 `reference/SP/USP_OB_OBPOOLDATA.sql:189-216` + DB 實證 1,487,695 筆）。月名單分派 Stage 1 以本欄位（業務主管選擇）與 `ob_pool_data.list_type`（SP 計算寫入）作 OR / IN 比對（F050 v2.1 BR-7） |
| settle_src | VARCHAR(6) | NULL | SETTLE_SRC | 結案來源（多值欄位，`$$` 分隔） |
| card_type | VARCHAR(5) | NULL | CARD_TYPE | 計分卡類型（沿用舊值，A43 決議；dump 含 3 字元值如 SEC/SEB，與 ob_levelcard_* 系列一致改為 VARCHAR(5)）。**v2.1.1（2026-05-20 / US-126 / US-127 / D1 / D4 / Q-A）**：前端表單元件從文字輸入改為 `ob_card_type` 動態下拉（資料來源 `GET /api/v1/assignment/scoring/card-types`）；建立模式只列 `status='active'` 卡別，編輯模式（F051）含「該名單已存的 inactive 值」disabled 保留；首選項「— 未選擇 —」（空值，預設選中）；本欄位儲存值範圍對齊 [`ob_card_type.card_type`](#ob-card-type-entity)（PK，VARCHAR(5)，`^[A-Z0-9]{1,5}$`）；前端 v2.0 之 `maxLength={2}` 硬限制已移除，由下拉選項與後端 `@MaxLength(5)` 雙重把關。完整 UI/API 契約見 [F050 v2.1.1 AC-16](features/F050-create-list-definition.md#ac-16cardtype-下拉契約v211-新增--us-126--us-127--d1--d4--q-a)。 |
| status | VARCHAR(10) | NOT NULL DEFAULT 'active' | （AppDB 新建欄位） | 啟用狀態：`'active'` / `'inactive'`（草稿階段停用後設 `'inactive'`，沿用 epic-brief「已解決問題」第 2 點與 F052） |
| stage | VARCHAR(20) | NOT NULL DEFAULT 'draft' | （AppDB 新建欄位，2026-05-15 F077 v1.0 / E07 重構批次 2 引入；**migration 歸屬：`1711360000100-CreateE07ObSettingsTables`（m100）中 `ob_list_definition` CREATE TABLE 時同步加入此欄位；m12 data backfill UPDATE 僅寫資料不建欄，見 AD-E07-17 議題 3**） | 五階段流程列舉值：`'draft'` / `'dept_ratio'` / `'personnel_ratio'` / `'approval'` / `'ready'`；CHECK constraint 限制此 5 值；F050 新建寫入 `'draft'`；舊 OBMLISTDF 遷移腳本全數初始 `'ready'`（見下方「遷移規則」）；月名單分派 Stage 0/1 只讀取 `stage = 'ready'` 之名單（F061 BR） |
| cr_enabled | BOOLEAN | NOT NULL DEFAULT TRUE | （AppDB 新建欄位，2026-05-15 F050 v2.0 / E07 重構批次 3 引入，**取代 F059 OBASSIGNSET 全域路徑**） | per-LIST_NO CR 回分開關；草稿階段（`stage = 'draft'`）由 F050 v2.0 / F051 v2.0 透過 `crEnabled` 欄位設定；推進至非草稿階段後鎖定（透過 F051 v2.0 BR-3 統一拒絕，無需獨立鎖定欄位）；月名單分派 Stage 3 讀取本欄位決定是否執行 CR 回分（false = 跳過）；既有 OBMLISTDF 遷移之名單初始 `true`（保持現行行為）；US-120 spec 落差修正之唯一儲存位置；F059 v2.0 標記 DEPRECATED 不再讀寫 |
| condition_payload | JSONB | NULL | （AppDB 新建欄位，2026-05-15 F050 v2.0 / E07 重構批次 3 引入；**v2.1（2026-05-20）取代 v2.0 固定欄位 prod_kind / caseyear / spec_tp / case_status / settle_src 等之必填語意，成為 source of truth**） | 動態篩選條件 JSONB；schema：`{ "conditions": [{ "columnName": "...", "fieldType": "numeric/categorical/date", ...type-specific }], "logic": "AND" }`；完整 schema 規範詳見 [F050 v2.1 §5.4](features/F050-create-list-definition.md#54-condition_payload-json-schemav21-新增--a2-解除)；F050 v2.1 新建必填（至少 1 個 conditions）；F051 v2.1 草稿階段可整段覆寫（限 `stage='draft'`，K1 / F051 v2.1 BR-9）；**F050 v2.1 BR-6** 強制 `conditions[].columnName` 必須存在於 F075 v1.5 白名單且 `is_active = true`，違反回 422 `CONDITION_COLUMN_NOT_IN_WHITELIST`（拍板 1 / A3 解除）；**F050 v2.1 BR-8** 強制 `columnName` 不得為 `list_period_start` / `list_period_end` / `list_interval`（一級保留欄位，J8 / 拍板 3），違反回 400 `RESERVED_FIELD_IN_CONDITIONS`；**F050 v2.1 BR-9**：若 conditions 含 `pooldata_field_option.is_active=false` 之 categorical option，寫入仍成功但 response 附加 `warnings: [{ code: "WHITELIST_OPTION_INACTIVE", affectedFields: [...] }]`（非阻擋；對應 [error-handling.md#assignment-run-warnings](error-handling.md#assignment-run-warnings)）；月名單分派 Stage 1 讀取本欄位動態組 SQL WHERE 對 `ob_pool_data` 過濾（**F050 v2.1 BR-7**：categorical `IN (...)`、numeric `BETWEEN`、date `BETWEEN`；US-122 AC-1~AC-3 / A6 / D3 解除）；**5 個 entity column（prod_kind / caseyear / spec_tp / case_status / settle_src）由後端依本欄位衍生填入並寫入 entity column，為 backward-compat 讀取欄位**（J6 / F050 v2.1 BR-10；衍生規則由 Phase 3a system-architect 設計）；既有 OBMLISTDF 遷移之名單初始 `NULL`，月名單分派 Stage 1 fallback 至 5 個 entity column 讀取（D4 / US-122 AC-4 / US-123 AC-3）；E2 backfill（entity column → condition_payload 一次性轉換）由 Phase 3a system-architect 執行（拍板 2 / 無 confirm 流程）。**v2.1.1（2026-05-20 / US-128 / US-129）**：`best_case` 為合法 `conditions[].columnName` 之一（F075 v1.6 seed），值為 categorical `Y` / `N`（F076 v1.6 seed）；承接已移除之 `prod_best` 一級欄位業務語意（見上方 `prod_best` 欄位 DEPRECATED 說明 + [F050 v2.1.1 BR-12](features/F050-create-list-definition.md#7-商業規則)）；月名單分派 Stage 1 對 `ob_pool_data.best_case` 以 `IN (...)` 過濾。**v1.18（2026-07-02 / F109 / AD-E07-37）**：`conditions[]` 每筆新增 **optional** `dataSource?: 'ob_pool_data' \| 'customer_core'`；`AssignmentListService.createList`/`updateList` 於 `injectSystemFixedConditions` 之後、`deriveBackwardCompatColumns` 之前，以新增步驟 `stampConditionDataSource` 依當下白名單逐 `columnName` 固化寫入（決定性，事後欄位停用不影響既有名單，F075 BR-4 相容）；F109 上線前既有 `condition_payload`（無此 key）由 Stage 1 讀取端以靜態常數 `CUSTOMER_CORE_COLUMN_NAMES` fallback 判定，**不需要 backfill migration**（F109 前白名單驗證已保證舊 payload 不可能含 customer_core 欄名）。`dataSource` 值決定 Stage 1 是否將該 condition 之 fragment 路由至 `buildCustomerCoreClause`（`cc.` 前綴 + LEFT JOIN customer_core）或既有 composer（`ob_pool_data` 裸欄名）。詳見 [AD-E07-37](implementation-log/AD-E07-37-f109-customer-source-filter.md) §3 OQ-F109-01 / §6。|
| stage0_estimate_count | INTEGER | NULL | （AppDB 新建欄位，2026-05-26 / F088 準備完成摘要 / AD-E07-20 引入） | **物化 Stage 0 預估案件數快取**。於名單 `approve→ready`（F086）成功後，`StageActionService.approveToReady()` 在 transaction 之外呼叫 `Stage0EstimateService.estimateListCount(listNo)` 計算並以 best-effort UPDATE 寫入本欄。計算失敗（timeout / 找不到名單）僅 logger.warn，不影響 approve 結果（graceful degradation，見 AD-E07-20）。值語意：ob_pool_data 套用該名單 condition_payload 篩選後之 COUNT（INTEGER）。**nullable 理由**：（1）既有歷史名單（遷移時 stage='ready'）從未經過 approve→ready hook，保留 NULL 表示「未計算」；（2）計算失敗或 timeout 亦保留 NULL。前端 F088 卡片顯示 NULL 時呈現「—」。**不提供 backfill**：既有 ready 名單下次 re-approve 才填（F089 rollback 至 approval 再 re-approve 觸發）。 |
| stage0_estimated_at | TIMESTAMP | NULL | （AppDB 新建欄位，2026-05-26 / F088 準備完成摘要 / AD-E07-20 引入；**實作必須使用 `dateColumnType` helper，禁用 `type: 'timestamp'` 字串**，見 AD-E07-17 / memory feedback_typeorm_timestamp） | **物化估算時間戳**。與 `stage0_estimate_count` 同步寫入，記錄計算執行當下之 UTC 時間。nullable 理由同上欄（未計算 / 計算失敗為 NULL）。前端 F088 可選擇性顯示此欄位（如 tooltip「預估時間：YYYY-MM-DD HH:mm」），由 F088 spec 決定。 |

**多值欄位儲存規範（v2.1 重寫）**：

`prod_kind` / `spec_tp` / `settle_src` / `caseyear` / `case_status` 為 `$$` 分隔字串（與舊系統格式相容；dump 觀察範例見下表）。

**v2.1 寫入規範（J6 / F050 v2.1 BR-10）**：v2.0 之「UI 提交時序列化為 `$$` 分隔字串」**已廢除**；v2.1 起 5 個欄位均為 **backward-compat 衍生欄位**，由後端依 `condition_payload` 衍生填入並寫入 entity column（衍生規則由 Phase 3a system-architect 設計）；前端不直接送出此 `$$` 分隔格式。

**v2.1 查詢規範（A6 / D3 解除）**：
- **新名單（`condition_payload IS NOT NULL`）**：月名單分派 Stage 1 從 JSONB 解析 conditions 後組合 SQL `columnName IN (v1, v2, ...)`（categorical）/ `BETWEEN min AND max`（numeric）/ `BETWEEN dateStart AND dateEnd`（date）；多欄位之間 `AND`（F050 v2.1 BR-7 / US-122 AC-1~AC-3）
- **舊名單（`condition_payload IS NULL`）**：月名單分派 Stage 1 fallback 讀 5 個 entity column 並以 `IN (...)` 對應比對（D4 / US-122 AC-4 / US-123 AC-3）

> **v2.0 棄用語意**：舊 SP 之 `LIKE '%val$$%' OR LIKE '%$$val' OR = 'val'` 三段比對**已棄用**；新實作一律改用 SQL `IN (...)` / `BETWEEN`；遷移時保留原始字串不拆分為陣列或正規化表。

| 欄位 | dump 範例 | 含義 |
|------|----------|------|
| `spec_tp` | `02$$04$$05$$06$$11$$12$$13$$14$$15$$16$$20$$21$$22$$23` | 多個專案類別代碼 |
| `settle_src` | `Y$$N` 或 `Y` 或 `N` | 含 / 不含被他行代償案件 |
| `caseyear` | `0$$1$$2$$3$$4$$5$$6$$99` 或 `0$$99` 或 `99` | 多個進件 / 中結年數（**v2.1 動態載入 8 個選項 `0`~`6` + `99`**；F076 v1.5 / US-125 AC-1 / J5 拍板對應 m22 現行 8 筆 seed）；舊系統 dump 可能含 `7`~`10` 之歷史值（舊名單 `condition_payload IS NULL` fallback 場景容錯讀取），新名單寫入不應出現此範圍外值 |
| `prod_kind` | `02$$03$$04` 或 `01` 或 `02` | 多個產品種類代碼（dump 觀察單值居多，但結構允許多值） |
| `case_status` | `01$$02$$03` 或 `01` 或 `04` | 多個案件結清期別（最多 4 選；**v2.1 對應 `pooldata_field_option` `column_name='case_status'`，由 F076 v1.5 維護 4 筆**；原 `ob_code_df.tbl_id='CASE_STATUS'` 已由 US-124 廢除 / F068 DEPRECATED v1.3） |

**list_type vs case_status 語意分離**：原系統 `LIST_TYPE` 欄位混用兩種語意，新系統拆分如下：

| 欄位 | 角色 | 表單顯示 | 寫入方式 |
|---|---|---|---|
| `list_type` | 系統內部分類常數，固定 `'01'`（分派名單） | 否 | 後端固定寫入 |
| `case_status`（新欄位） | 業務主管選擇的案件結清期別篩選範圍 | 是（必填多選） | F050/F051 表單提交，多值以 `$$` 分隔 |

**`case_status` Migration 策略（AD-E07-14 兩階段 + v2.1 第三階段 E4）**：

原 OBMLISTDF 無 `case_status` 欄位；但 `LIST_TYPE` 欄位的實際儲存值即為案件結清期別代碼（dump 驗證：`'01'`、`'02'`、`'02$$03$$04'` 等）。採兩階段 migration 以安全補值：

- **Phase 1**：`ALTER TABLE ADD COLUMN case_status VARCHAR(14) NULL`；執行 `UPDATE SET case_status = list_type`（將 LIST_TYPE 原值複製至 case_status）
- **Phase 2**：執行驗證查詢確認無 NULL 餘留後，`ALTER COLUMN case_status SET NOT NULL`；同步將 `list_type` 全數更新為常數 `'01'`
- **Phase 3（v2.1 / 2026-05-20，US-125 AC-2 / E4 解除）**：CASE_STATUS 4 筆代碼（`01` / `02` / `03` / `04`）從 `ob_code_df.tbl_id='CASE_STATUS'` backfill 至 `pooldata_field_option.column_name='case_status'`；同時 F075 v1.5 `pooldata_field_whitelist` 新增 `case_status` 條目（US-125 AC-5）；DELETE FROM `ob_code_df` WHERE `tbl_id = 'CASE_STATUS'`（GAP-LIST §E7）。本階段由 Phase 3a system-architect 執行 migration 腳本，本段不展開細節。

完整 migration SQL 見 architecture-spec.md AD-E07-14；v2.1 Phase 3 migration 詳見 **architecture-spec.md AD-E07-18 §18.3**（Phase 3a 落地，2026-05-20；M3 於 2026-05-21 二次更正為 TBL_ID='12' 52 筆）：M1（m281）ADD COLUMN condition_payload + GIN index、M2（m282）backfill、M3（m283）**spec_tp 52 筆 UPSERT（OBMCODEDF TBL_ID='12'）**、M4（m284）case_status whitelist + options seed、M5（m285）刪除 ob_code_df 重疊 tbl_id（deployment gate：與 F069 service 改讀 pooldata_field_option 同 PR）。

**索引**：`list_no`（PK）、`(project_workym, card_type)`（複合索引，月名單分派查詢）、`(project_workym, stage, status)`（M01 入口 F048 列表 + 階段篩選）、`(created_by)`（處長轄區過濾，F074 / F077 BR-10）

**舊名單遷移規則（I-5，2026-05-15 / F077 BR-5）**：

既有 OBMLISTDF 資料遷移至 `ob_list_definition` 時：

| 欄位 | 遷移處置 |
|------|---------|
| `stage` | **全數初始為 `'ready'`**（視為已完成五階段流程）；確保歷史月份名單可正常被 F061 月名單分派引用、F048 列表正確顯示「準備完成」階段標籤 |
| `status` | 沿用既有資料中的有效值；缺值預設 `'active'` |
| 其他業務欄位 | 沿用既有 OBMLISTDF 欄位邏輯（PROD_KIND / CASEYEAR / SPEC_TP / SETTLE_SRC 等），不受 F075 白名單影響（沿用 F075 BR-3 / US-102 §舊名單相容規則） |

> **說明**：舊系統無「五階段流程」概念，所有舊名單已歷經 IT 手動執行 SP 完成分派，等同於新流程的「準備完成」階段。新建名單（F050）始於 `stage = 'draft'`，依 F077 §10 圖表 [F077-stage-overview.mmd](diagrams/F077-stage-overview.mmd) 流轉。

> **v2.1 補述（2026-05-20 / F050 v2.1 重構，D4 / E2 / J6 / US-122 AC-4 / US-123 AC-3）**：舊 OBMLISTDF 遷移名單之 `condition_payload` 初始為 NULL；月名單分派 Stage 1 對此類名單採 **backward-compat fallback** 讀取 5 個 entity column（`prod_kind` / `caseyear` / `spec_tp` / `case_status` / `settle_src`）並以 `IN (...)` 對應比對（D4），fallback 路徑不報錯，月名單分派不中斷；F051 v2.1 編輯頁載入此類名單時篩選條件區塊呈現為唯讀「（舊格式）」摘要（F051 v2.1 AC-11 / US-123 AC-2），非篩選欄位仍可改。E2 backfill（entity column → condition_payload 一次性轉換）由 **Phase 3a system-architect** 執行；**拍板 2 / 拍板 Q3**：不提供「per-user confirm 轉換」流程，避免部分名單轉換、部分未轉換的混亂狀態；繞過直接寫入 condition_payload 之請求由後端回 422 `LEGACY_LIST_CONDITION_READONLY`（defense-in-depth；F051 v2.1 BR-11）。

**m12 migration `stage` active 名單範圍規則（2026-05-16 / system-architect 決議 #3）**：

m12 migration 腳本對「歷史遷移紀錄」之 `stage` 欄位執行下列 UPDATE，**不限月份範圍**：

```sql
UPDATE ob_list_definition
   SET stage = 'ready'
 WHERE status != 'inactive'
   AND stage = 'draft';
```

| 規則 | 說明 |
|---|---|
| **active 名單範圍** | 條件 `status != 'inactive'`（即 `status = 'active'`；亦涵蓋未來可能新增之其他 active 子狀態），不限月份 |
| **防呆條件** | `AND stage = 'draft'` 確保不覆蓋手動推進至 `dept_ratio` / `personnel_ratio` / `approval` 之新流程紀錄；亦不重複處理已 `ready` 之歷史遷移紀錄 |
| **inactive 名單** | 一律保持原 `stage` 值；停用後不重新進入流程 |
| **覆蓋邊界** | 本腳本僅執行一次性 backfill；後續新建名單由 F050 v2.0 寫入 `stage = 'draft'`，由 F078 / F080 / F084 / F086 推進 |

**草稿階段欄位編輯規則（2026-05-15 / F050 v2.0 / F051 v2.0 / F052 v2.0 / F078 / E07 重構批次 3；v2.1 更新引用版號 + 補 list_period_*）**：

| 欄位 | 草稿（`stage = 'draft'`）可改？ | 推進後（`stage IN ('dept_ratio', 'personnel_ratio', 'approval', 'ready')`）可改？ | 由哪個 spec 維護 |
|------|---|---|---|
| `list_nm` | ✅ | ❌（回 422 `LIST_STAGE_TRANSITION_FORBIDDEN`） | F050 v2.1 / F051 v2.1 |
| `condition_payload` | ✅（覆寫式；新名單必填至少 1 個 conditions；舊名單 NULL 為 read-only，拒絕寫入回 `LEGACY_LIST_CONDITION_READONLY`，F051 v2.1 BR-11） | ❌（回 422 `LIST_STAGE_TRANSITION_FORBIDDEN`） | F050 v2.1 / F051 v2.1 |
| `list_period_start` / `list_period_end` / `list_interval` | ✅（一級欄位，**不可入 `condition_payload.conditions`**，違反回 400 `RESERVED_FIELD_IN_CONDITIONS`；F050 v2.1 BR-8 / J8 / 拍板 3） | ❌（回 422 `LIST_STAGE_TRANSITION_FORBIDDEN`） | F050 v2.1 / F051 v2.1 |
| `cr_enabled` | ✅ | ❌（回 422 `LIST_STAGE_TRANSITION_FORBIDDEN`） | F050 v2.1 / F051 v2.1 |
| `status`（停用） | ✅（軟刪除為 `'inactive'`） | ❌（回 422 `LIST_STAGE_NOT_DRAFT`，需先 Rollback 至草稿） | F052 v2.0 |
| `stage` | ❌（不可手動覆寫） | ❌（不可手動覆寫） | F078 / 後續 M03a~d 推進 / Rollback spec |
| `list_no` / `project_workym` / `created_by` / `created_at` | ❌（建立後永久不可改） | ❌（永久不可改） | F050 v2.1 寫入後鎖定 |
| backward-compat 衍生欄位（`prod_kind` / `caseyear` / `spec_tp` / `case_status` / `settle_src`） | ❌（前端不直接編輯；由後端依 `condition_payload` 衍生填入；J6 / F050 v2.1 BR-10） | ❌ | F050 v2.1 / F051 v2.1 + Phase 3a system-architect 設計衍生規則 |
| `stage0_estimate_count` / `stage0_estimated_at` | ❌（系統自動寫入；F086 approve→ready 時 best-effort 更新） | ❌（F086 approve→ready 才觸發更新，其他推進不觸及） | F088 / AD-E07-20 |

> **規則來源**：F050 v2.1 BR-2 / F051 v2.1 BR-4 / BR-9 / BR-10 / F052 v2.0 BR-3 / F077 BR-9 角色 × 階段操作矩陣。
> **退出鎖定途徑**：透過後續批次 spec 之 Rollback 機制（M03a/b/c/d Rollback；如 US-111 / US-115 / US-117）退回 `'draft'` 階段後，本表「草稿可改」欄位重新可編輯。

**「從上月名單複製」API 行為規則（2026-05-15 / F050 v2.0 / OQ-D-01 決議；v2.1 補 `condition_payload IS NOT NULL` 來源條件）**：

F050 v2.1 提供「從上月名單複製」起點，行為規則如下：

| 規則 | 說明 |
|---|---|
| **複製 `condition_payload`** | 整段 JSONB 複製至新名單 |
| **`list_nm` 帶入並前捲月份** | 沿用來源名稱，經 `rollForwardListName` 將名稱中之月份 token 前捲至本作業月；可自由修改（v1.20 / OQ-F118-B3 裁決，原稱「需重新填寫」與實作不符） |
| **`card_type` 帶入** | 沿用來源卡別（v1.20 補述；三處 spec 原均未描述。[F118](features/F118-copy-from-prev-month-duplicate-indicator.md) BR-7 之 `card_type` 等價判定以此為前提） |
| **不複製比例資料** | 部門比例（`ob_dept_pct`）/ 人員比例（`ob_empl_set`）為各自階段資料表，建立新草稿時恢復為空，需於後續 M03a / M03b 階段重新設定 |
| **`cr_enabled` 沿用來源值** | **v1.20（2026-08-04 / OQ-F118-B3 裁決，以實作為準）**：複製時 `cr_enabled` **沿用來源名單設定**（`src.crEnabled ?? true`），非「恢復預設」。本檔原稱恢復預設 `false`、[F050 AC-5](features/F050-create-list-definition.md) 原稱恢復預設 `true`，兩者互相矛盾且皆與實作不符，本輪一併修正。**未變動之事實**：資料庫欄位預設仍為 `DEFAULT false`（migration `1711360000182`），F102 US-154 / OQ-F102-3 對「欄位預設值」之裁示不受本次修正影響——本列僅描述**複製流程**之帶入行為。<br>**⚠️ 另一項尚未收斂之落差（本輪未處理，非複製流程）**：建立草稿表單對**非複製**之新名單，前端 state 初值為 `crEnabled = true`（`list-create-draft-page.tsx`），與本檔「欄位預設 `false` / 需 admin 顯式開啟」之 F102 裁示不一致。此為獨立議題，已記錄於 [open-questions.md](open-questions.md) OQ-F118-05。 |
| **來源名單條件（v1.20 修正）** | `project_workym = targetWorkym - 1 month` AND `status = 'active'` AND `condition_payload IS NOT NULL`。**v1.20（2026-08-04 / OQ-F118-B3 裁決）移除 `stage = 'ready'`**——現行 Modal 實際無此過濾，且以實作為準；此亦為 [F118](features/F118-copy-from-prev-month-duplicate-indicator.md) BR-9 之權威定義。**舊名單不可作為複製來源**（拍板 Q4 / 拍板 2 一致性：舊名單條件需先由 Phase 3a E2 backfill 一次性轉換）；前端 dropdown 已過濾此情境，後端 defense-in-depth 違反回 422 `LEGACY_LIST_NOT_COPYABLE`（F050 v2.1 §6.1 錯誤回應表） |
| **跨年計算** | 「上月」按 calendar month 計算（例：202501 - 1 = 202412） |
| **稽核追溯** | 來源 `list_no` 寫入 `assignment_audit_log.before_value.copyFromListNo` 欄位 |

> **✅ v1.20（2026-08-04 / F118 人工審閱閘 OQ-F118-B3 已裁決）**：上表原與**現行實作**（`list-create-draft-page.tsx::handleCopyApply` + `copy-from-prev-month-modal.tsx`）存在 4 點落差，且本檔與 [F050 §4 AC-5](features/F050-create-list-definition.md) 就 `cr_enabled` 彼此矛盾（本檔稱 `false`、F050 稱 `true`、實作為沿用來源值）。**業務主管裁定以現行實作為準修正三處 spec**，本表已於本輪同步更新（`list_nm` 帶入並前捲、`cr_enabled` 沿用來源、補述 `card_type` 帶入、來源條件移除 `stage='ready'`）。裁決紀錄見 [F118 §12.1 D-7](features/F118-copy-from-prev-month-duplicate-indicator.md)。

> **API 端點（v1.20 更正）**：現行實作以 `GET /api/v1/assignment/lists?ym={prevYm}`（既有清單端點）載入候選並於前端過濾；建立時 `POST` 帶 `copyFromListNo` 欄位（僅寫入 `assignment_audit_log.after_value`，**`ob_list_definition` 無此欄位**）。**⚠️ 殭屍規格**：本檔原描述之 `copy-source-options` 與 `{listNo}/condition-payload` 兩支端點**從未實作**（2026-08-04 `grep -rn "copy-source-options" apps/` 命中 0 筆），保留於此僅為歷史紀錄，**不得**作為實作依據；清理列為獨立技術債（[open-questions.md](open-questions.md) OQ-F118-01）。[F118](features/F118-copy-from-prev-month-duplicate-indicator.md) §5.1.1 之 `GET /api/v1/assignment/lists/copy-duplicate-check` 為新增之判定端點，與上述兩支殭屍端點無關。

---

#### `current_work_ym` 規則 {#current-work-ym-rule}

> **2026-05-15 / F077 BR-1, BR-2, BR-12 引入**

E07 月名單分派與 M01 名單定義之「目前作業月份（current_work_ym）」由後端統一計算，前端不自行計算。本規則為唯一權威來源。

| 項目 | 規則 |
|------|------|
| 計算公式 | `current_work_ym = format(NOW(), 'YYYYMM')`（取系統時鐘之年月） |
| 切換時刻 | 每月 **1 號 0:00:00**（含）切換為該月；至下月 1 號 0:00:00 為止維持當月（例：`2026-06-01 00:00:00 +08:00` → `current_work_ym = '202606'`） |
| 時區 | **UTC+8（台北時區）**；後端實作須明確固定，不取系統 default 時區（避免跨時區月底切換不一致） |
| 可選月份範圍 | `[current_work_ym - 12, current_work_ym + 12]`（共 25 個月） |
| 提供端點 | `GET /api/v1/assignment/current-work-ym`（回傳 `currentWorkYm` / `rangeMin` / `rangeMax`），詳見 [F077 §5.1](features/F077-month-switch-and-stage-overview.md) |
| 配置覆蓋 | [ASSUMPTION] 是否提供 `WORK_YM_SWITCH_DAY` 配置項（覆蓋預設「每月 1 號切換」）由 system-architect 決策；spec 預設行為為硬編碼 1 號 |

**寫入端 Guard 規則**：

所有 M01 / M03 / M04 寫入端點（F050 / F051 / F052 / F060 / F061 / 後續推進與 Rollback / 簽核）需檢查 `request.project_workym >= current_work_ym`：

- 若 `request.project_workym < current_work_ym` → HTTP 403 `LIST_HISTORICAL_READONLY`（歷史月份禁止寫入）
- 若 `request.project_workym > current_work_ym + 12` → HTTP 422 `WORK_YM_OUT_OF_RANGE`（超出可選範圍）
- GET 端點不受此規則約束（保留歷史可查）

**範例**：

| 系統時鐘 | current_work_ym | rangeMin | rangeMax |
|---------|-----------------|----------|----------|
| 2026-05-15 14:30 +08:00 | `'202605'` | `'202505'` | `'202705'` |
| 2026-06-01 00:00:00 +08:00 | `'202606'`（**切換**） | `'202506'` | `'202706'` |
| 2026-12-31 23:59:59 +08:00 | `'202612'` | `'202512'` | `'202712'` |

---

#### ob_pool_data（OBPOOLDATA — 案件池）

> **資料同步機制**：本表採 **E04 + E05 雙層 ETL** 同步：E04 通用擷取任務從舊 OB DB（SQL Server `OBPOOLDATA`）抓取至 raw_{task_id_short} 中介表（既有機制，每月名單分派前執行），再由 E05 Pipeline TargetLoad 將資料載入本表（full replace 模式）。詳見 [architecture-spec.md §E07-C](architecture-spec.md#e07-c-etl-設計) ETL 設計。**E07 不提供 CRUD 維護介面**。
>
> ⚠️ **本表為共享案件池**（對應 OBPOOLDATA 原表結構，120 欄位中**無 LIST_NO 欄位**），不直接綁定特定名單。per-LIST_NO 候選由月名單分派 Stage 1 透過 join `ob_list_definition` 的篩選條件（`prod_kind` / `caseyear` / `spec_tp` / `list_period_start ~ list_period_end` / `settle_src` 等）動態取得；分派結果（含 LIST_NO）寫入 `ob_pool_data_list`。
>
> ob_pool_data 欄位達 120 個（Q-B 決策）。以下列出 E07 月名單分派邏輯使用的關鍵欄位，其餘欄位完整映射 OBPOOLDATA，命名規範同上。

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
| score | INTEGER | NULL | SCORE | 月名單分派 Stage 2 計分結果（由 `fn_calc_tier_level` 計算後寫入；初始為 NULL）。對應舊系統 OBPOOLDATA_LIST.SCORE。F055 preview API 讀取此欄位套用新門檻計算 CARD_LEVEL 分佈（AD-E07-10） |
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
| data_source | VARCHAR(20) | NULL | —（本系統新增）| **資料來源標記**（AD-E07-21 DP-AD21-2 方案 A；AD-E07-25 DP-AD25-1 更新）。**AD-E07-25 Phase A 後值域**：`'etl_load'`（由 `E07-OBPOOLDATA_LIST-Load` ETL 載入的 legacy 派案歷史，單一值）。**舊值域（廢止）**：`'etl_legacy'` / `'monthly_run'`（Phase A deploy 前存在）/ NULL（migration 前既有資料）。月名單分派提案結果自 Phase A 起改寫入 `ob_monthly_run_result`，不再寫入本表。非 legacy 欄位，OBPOOLDATA_LIST 來源無此欄位；migration `1711360000291-AddObPoolDataListDataSource` 新增。 |

> 其餘業務欄位（貸款明細、車輛資訊、業務員資訊等）完整映射 OBPOOLDATA_LIST，命名規範同上（snake_case，nvarchar → VARCHAR/TEXT，datetime → TIMESTAMP，numeric → NUMERIC，money → NUMERIC(19,4)）。

**索引**：`(list_no, orgno, appl_no)`（PK）、`(list_no, emplid)`、`(list_no, dept_id)`、`(data_source)`（ETL DELETE 與路由用）、`(assignday)`（近 3 個月去重視窗查詢用，建議加 WHERE assignday IS NOT NULL，AD-E07-22 §22.3）

> **AD-E07-25（2026-05-27）**：`data_source` 值域自 AD-E07-25 Phase A 起改為 `'etl_load'`（單一值）。`'etl_legacy'` / `'monthly_run'` 為舊值域，Phase A deploy 後廢止。月名單分派提案改寫入 `ob_monthly_run_result`（見下節）。

---

#### ob_monthly_run_result（月名單分派結果 — 本系統新增）

**新建表（migration `1711360000292-CreateObMonthlyRunResult`）**。承載每次月名單分派對各名單的分派提案結果，為 AD-E07-25 單源化設計的核心產出。

PK：`(run_id, list_no, orgno, appl_no)`

| 欄位名 | 型別 | NULL | 說明 |
|--------|------|------|------|
| run_id | UUID | NOT NULL | **PK**；FK → `assignment_run.run_id`（ON DELETE CASCADE） |
| list_no | VARCHAR(100) | NOT NULL | **PK**；名單編號 |
| orgno | VARCHAR(2) | NOT NULL | **PK**；機構代碼 |
| appl_no | VARCHAR(10) | NOT NULL | **PK**；案件申請號 |
| custo_no | VARCHAR(11) | NULL | 客戶號 |
| settle_src | TEXT | NOT NULL DEFAULT 'N' | 結案來源標記（Stage 1 計算結果） |
| score | INTEGER | NULL | Stage 2 計分結果 |
| card_level | VARCHAR(1) | NULL | Stage 2 卡片等級 |
| tier_level | VARCHAR(5) | NULL | Stage 2 分層等級 |
| is_cr | VARCHAR(1) | NULL | Stage 3：是否為前業務員管理案件 |
| cr_id | VARCHAR(20) | NULL | Stage 3：前業務員工號 |
| cr_nm | VARCHAR(50) | NULL | Stage 3：前業務員姓名 |
| dept_id | VARCHAR(6) | NULL | Stage 4：分派部門代碼 |
| emplid | VARCHAR(10) | NULL | Stage 4：分派業務員工號 |
| emplid_deptid | VARCHAR(6) | NULL | Stage 4：業務員所屬部門代碼 |
| result_status | VARCHAR(20) | NULL DEFAULT 'PENDING' | 業務系統回填狀態（`'PENDING'` / `'SUCCESS'` / `'FAILED'`） |
| assignday | VARCHAR(100) | NULL | Forward-compat 欄位：業務派案日期（供業務查詢派案紀錄用，DP-AD25-6） |
| created_at | TIMESTAMP | NOT NULL DEFAULT CURRENT_TIMESTAMP | 建立時間 |
| updated_at | TIMESTAMP | NOT NULL DEFAULT CURRENT_TIMESTAMP | 更新時間 |

**外鍵**：`fk_omrr_run` → `assignment_run(run_id)` ON DELETE CASCADE

**索引**：
- `idx_omrr_run_id`：`(run_id)`（月名單分派結果整批查詢）
- `idx_omrr_list_run`：`(list_no, run_id)`（按名單查詢某次月名單分派結果）
- `idx_omrr_custo_no`：`(custo_no) WHERE custo_no IS NOT NULL`（客戶號查詢）
- `idx_omrr_assignday`：`(assignday) WHERE assignday IS NOT NULL`（派案日期查詢）

**設計原則**：
- 僅保留 Stage 2~4 計算結果欄位，不複製 `ob_pool_data_list` 的全部業務欄位（DP-AD25-2 方案 A）
- Stage 2 計算所需業務欄位（spec_name、year_produ、payt_term 等）在計算時由 `ob_pool_data` JOIN 取得
- `run_id` FK + CASCADE DELETE：月名單分派 run 刪除時自動清除對應所有結果列
- `assignment_run_snapshot` type=result 短期雙軌保留（DP-AD25-3），`collectCrCandidates()` 短期維持讀 snapshot

**F064 v2.0 匯出 join 路徑**（AD-E07-31 / US-155，2026-06-17）：

F064 匯出端點（`GET /api/v1/assignment/runs/:runId/export`）採單一 SQL 多表 join 取 23 欄，不讀 `assignment_run_snapshot.payload`（GAP-2 修正）：

> **⚠️ BUG-F064-POOL-JOIN-01（2026-06-17 修正）**：Pool 屬性 join 表為 **`ob_pool_data`**（Stage 1 血緣源，PK=orgno+appl_no），**不是 `ob_pool_data_list`**（legacy ETL per-list 去重表，PK=list_no+orgno+appl_no）。初版 AD 誤用後者，實測遺漏 11.5%（6,438/55,863 筆）。改用 `ob_pool_data` 後 55,863/55,863 全對（I-EXP-LINEAGE-01）。

```
ob_monthly_run_result r  (WHERE run_id = :runId)
  → INNER JOIN ob_pool_data o
              ON o.orgno = r.orgno AND o.appl_no = r.appl_no
              [Stage 1 血緣源，PK=orgno+appl_no；血緣保證 100% 匹配，INNER JOIN 安全；
               提供分處/進件日/專案類別/專案名稱/逾期天數/客戶利率/STA_CODE/案件狀態/廠牌名稱/名單週期月數]
  → LEFT JOIN ob_emphire e
              ON e.emp_id = r.emplid
              [join-miss → 部門名稱/姓名/職級三欄空值；員編仍輸出 r.emplid；WARNING log 彙總（BR-F064-06）]
  → LEFT JOIN ob_list_definition d
              ON d.list_no = r.list_no
              [join key = list_no 單鍵；join-miss → 名單名稱空值]
ORDER BY r.list_no, r.orgno, r.appl_no  -- 確定性排序（I-EXP-DET-01）
```

關鍵設計決策（AD-E07-31）：
- **pool 屬性來源表 = `ob_pool_data`**（Stage 1 血緣源，PK=orgno+appl_no；BUG-F064-POOL-JOIN-01 修正）；不使用 `ob_pool_data_list`（I-EXP-LINEAGE-01）。
- **進件日（欄 6）取 `ob_pool_data.appl_date`**（`o.appl_date`，型別為 timestamp，格式化須取日期部分：`toISOString().slice(0,10)` → replace `-` 為 `/` → `YYYY/MM/DD`；I-EXP-APLDATE-01）；不取 `ob_monthly_run_result.appl_date`。
- **INNER JOIN ob_pool_data**（血緣保證，非 LEFT JOIN 保護）。
- **LEFT JOIN emphire / list_def**：ETL 延遲或員工不存在時不中斷匯出（BR-F064-06 / BR-F064-01）。
- 23 欄欄序以 `reference/202606 分派名單.xlsx` 工作表 1 為 authority（BR-F064-03）；不含 `custo_no`/`cust_name`/`card_level`/`score`（BR-F064-04，GAP-1 修正）。
- xlsx / CSV 雙格式共用 server-side cursor row-producer，不全量載入記憶體（I-EXP-STREAM-01）。
- 處長 scope filter 以 SQL WHERE 注入（I-EXP-SCOPE-01），不在 fetch 後 in-memory 過濾。

---

#### ob_dept_pct（OBMDEPTPCT — per-LIST_NO 部門比例）

PK：`(project_workym, list_no, obdeptid, ration)`

| 欄位名 | 型別 | NULL | 原欄位 | 說明 |
|--------|------|------|--------|------|
| created_by_prog | VARCHAR(10) | NOT NULL | A_PRGID | 建立程式代碼 |
| created_by | VARCHAR(50) | NOT NULL | A_USERID | 建立者 UUID（**v2 修訂，2026-05-25 / commit 736e9c4**：原 VARCHAR(10) → VARCHAR(50) 對齊 `users.id` UUID 36 字元）。**F088 用途（2026-05-26 / AD-E07-20）**：F088「準備完成摘要」卡片顯示「設定者/部長代設定者」姓名時，以本欄位（`ob_dept_pct.created_by`）JOIN `users.id` 解析姓名（`users.name`）與業務角色（`users.business_role`）；**無需 schema 變更**，僅需在 F088 查詢端 JOIN users 表。 |
| created_at | TIMESTAMP | NOT NULL | A_SYSDT | 建立時間 |
| updated_by_prog | VARCHAR(10) | NOT NULL | U_PRGID | 更新程式代碼 |
| updated_by | VARCHAR(50) | NOT NULL | U_USERID | 更新者 UUID（**v2 修訂**：同 `created_by`，VARCHAR(10) → VARCHAR(50)） |
| updated_at | TIMESTAMP | NOT NULL | U_SYSDT | 更新時間 |
| project_workym | VARCHAR(6) | NOT NULL | PROJECT_WORKYM | **PK**，作業年月 |
| list_no | VARCHAR(11) | NOT NULL | LIST_NO | **PK**，名單編號 |
| obdeptid | VARCHAR(6) | NOT NULL | OBDEPTID | **PK**，催收部門代碼 |
| obdeptnm | VARCHAR(10) | NOT NULL | OBDEPTNM | 催收部門名稱 |
| ration | NUMERIC(9,2) | NOT NULL | RATION | **PK**，分配比例（**v2 修訂，2026-05-25 / commit 98a2f56**：scale 1→2；原 NUMERIC(9,1) 會將 FE 之 2-decimal 值 round 至 1-decimal，22 員工均等分配 4.55 round 成 4.6 導致 sum=101.1。Follow-up：prod migration 需手動 ALTER；dev synchronize 已生效，prod `migration:run` **不會自動 ALTER**） |

**索引**：複合 PK 即為主索引。`(project_workym, list_no)` 為月名單分派查詢索引。

**比例驗證規則（I-8，2026-05-15 / F079 v1.0 / E07 重構批次 4 文件化）**：

| 規則 | 說明 |
|------|------|
| **加總約束** | 同 `(project_workym, list_no)` 下所有 `ration` 加總須落於 `[99.99, 100.01]`（容忍 ±0.01% 浮點誤差，沿用 Invariant I-8）；違反回 422 `RATIO_SUM_NOT_100` |
| **單欄位區間** | 任一 `ration` 須落於 `[0, 100]`（整數或最多兩位小數）；`ration = 0` 視為有效值（表示該部門本月不分派）；違反回 422 `RATIO_OUT_OF_RANGE` |
| **驗證執行時機** | service 層於 PUT 寫入前執行；DB 端是否額外加 CHECK constraint 由 system-architect 決議（[ASSUMPTION]） |
| **驗證 helper** | 建議封裝為 `RatioValidationService.assertSumEquals100(ratios)` + `assertEachInRange(ratios, 0, 100)`，由 F079 PUT 與 F080 推進前置條件共用，後續 M03b 個別業務比例 spec 沿用 |
| **驗證對象範圍（v1.19 / F117 / DRAFT）** | 加總驗證之對象為**最終持久化集合**，而非 PUT payload 本身——即「payload 列」∪「[F117 BR-4](features/F117-dept-ratio-director-required-filter.md) 伺服器端保留之孤兒列」。詳 [F117 BR-7](features/F117-dept-ratio-director-required-filter.md) |

**「有無在職處長」為衍生狀態，不落表（v1.19 / 2026-08-04 / F117 / DRAFT）**：

| 項目 | 說明 |
|------|------|
| **不新增欄位** | F117「部門是否有在職處長」之判定為**查詢時即時計算**，`ob_dept_pct` 與 `ob_emphire` **均不新增欄位**、不需 migration |
| **判定來源** | `ob_emphire` 中 `TRIM(jfun_nm) = '處長'` AND 在職（`emphire-active.util`：`resign_date IS NULL OR resign_date >= 系統日`，哨兵 `9999-12-31`）AND `TRIM(dept_code)` 相符；同部門多位取最早 `hire_date`（沿用 F079 BR-14，**禁止另立第二套判定**） |
| **孤兒列語意** | 「無在職處長」**且** 既有 `ration > 0` 之列稱為孤兒列；其列**必須**於覆寫式 PUT 中被保留（[F117 BR-4](features/F117-dept-ratio-director-required-filter.md)），不得因未出現於 payload 而遭 DELETE。此為資料保全不變式，非 UI 行為 |
| **與 `isActive` 正交** | 「部門已下線」（該部門無任何在職員工）與「無在職處長」為**兩個獨立維度**，可同時成立；不可互相推導（F117 BR-10） |

**stage 鎖定規則（2026-05-15 / F079 / F080 / F081 / E07 重構批次 4）**：

| 操作 | 允許 stage | 拒絕 stage 之回應 | 維護 spec |
|------|----------|------------------|----------|
| GET（讀） | 任意 stage（推進後 `isReadOnly = true`）| 不拒絕 | F079 §5.1 |
| PUT（寫） | `'dept_ratio'` | 422 `LIST_STAGE_TRANSITION_FORBIDDEN` | F079 §5.2 / F079 BR-3 |
| 推進至 `personnel_ratio` | `'dept_ratio'` + 加總 = 100% | 422 `LIST_STAGE_TRANSITION_FORBIDDEN` 或 422 `STAGE_ADVANCE_PRECONDITION_FAILED` | F080 §5.1 |
| Rollback 至 `draft` | `'dept_ratio'` | 422 `STAGE_ROLLBACK_BLOCKED`（reason: `wrong_source_stage` / `already_at_first_stage`） | F081 §5.1 |
| Rollback 之資料清空 | `'dept_ratio'` → `'draft'` | DELETE FROM `ob_dept_pct` WHERE `(project_workym, list_no)` 對應之所有紀錄；於同 transaction 內執行 | F081 BR-4 / Invariant I-9 |

**FK 級聯規則（[ASSUMPTION]，2026-05-15）**：

| 關聯 | 建議級聯規則 | [ASSUMPTION] 說明 |
|------|------------|------------------|
| `ob_dept_pct.list_no → ob_list_definition.list_no` | `ON DELETE RESTRICT`（避免名單意外刪除帶走比例資料）；`ON UPDATE` 不適用（PK 不可改） | F050 v2.0 BR：`list_no` 建立後永久不可改；名單僅軟刪除（`status = 'inactive'`），不執行 hard delete；FK 級聯規則由 system-architect 於 migration 設計確認 |
| `ob_dept_pct.project_workym` | 無 FK（`project_workym` 為從 `ob_list_definition.project_workym` 複製寫入之冗餘欄位） | system-architect 評估是否補 trigger 或 service 層 invariant 確保兩表 `project_workym` 一致 |
| `ob_dept_pct.obdeptid → ob_emphire.dept_code` | **不建議**設 FK（`ob_emphire` 為 ETL 同步表，部門可下線；F079 BR-12 + AC-2 已定義「部門已下線」UX 處理） | service 層由 F079 GET 邏輯處理；FK 不設可避免 ETL 異動阻塞名單寫入 |

---

#### ob_empl_set（OBEMPLSETMF — 人員比例設定）

PK：`(list_no, deptid_m, emplid, ration)`

| 欄位名 | 型別 | NULL | 原欄位 | 說明 |
|--------|------|------|--------|------|
| created_by_prog | VARCHAR(10) | NULL | A_PRGID | 建立程式代碼 |
| created_by | VARCHAR(50) | NULL | A_USERID | 建立者 UUID（**v2 修訂，2026-05-25 / commit 736e9c4**：原 VARCHAR(10) → VARCHAR(50) 對齊 `users.id` UUID 36 字元） |
| created_at | TIMESTAMP | NULL | A_SYSDT | 建立時間（**entity 必須使用 `dateColumnType()` helper，禁用 `type: 'timestamp'` 固定字串**，見 AD-E07-17 議題 2） |
| updated_by_prog | VARCHAR(10) | NULL | U_PRGID | 更新程式代碼 |
| updated_by | VARCHAR(50) | NULL | U_USERID | 更新者 UUID（**v2 修訂**：同 `created_by`，VARCHAR(10) → VARCHAR(50)） |
| updated_at | TIMESTAMP | NULL | U_SYSDT | 更新時間（**同 created_at，使用 `dateColumnType()` helper**） |
| list_no | VARCHAR(11) | NOT NULL | LIST_NO | **PK**，名單編號 |
| deptid_m | VARCHAR(50) | NOT NULL | DEPTID_M | **PK**，催收人員所屬部門（組合鍵；遷移時 `RTRIM(deptid_m)`，見下方註腳） |
| emplid | VARCHAR(6) | NOT NULL | EMPLID | **PK**，催收人員工號 |
| ration | NUMERIC(10,2) | NOT NULL | RATION | **PK**，分配比例（**v2 修訂，2026-05-25 / commit 98a2f56**：scale 1→2；原 NUMERIC(10,1) 會將 FE 之 2-decimal 值 round 至 1-decimal，22 員工均等分配 4.55 round 成 4.6 導致 sum=101.1。Follow-up：prod migration 需手動 ALTER；dev synchronize 已生效，prod `migration:run` **不會自動 ALTER**） |
| prod_type | VARCHAR(255) | NULL | PROD_TYPE | 商品類型（多值） |

> ⚠️ **`deptid_m` 尾隨空白填充處理**：舊 `OBEMPLSETMF.DEPTID_M` 雖宣告 `VARCHAR(50)`，dump 觀察實際業務值為 4 字元部門代碼（如 `XTC0`）但被 padded 至 50 字元（範例：`"XTC0                                              "`）。遷移時統一執行 `RTRIM(deptid_m)`，AppDB 存入 trim 後的值（即實際 4 字元代碼），避免 join `ob_emphire.dept_code`（不含 padding）失敗。AppDB 寫入路徑（F082 / 月名單分派 Stage 4）亦不可保留尾隨空白。

**索引**：複合 PK 即為主索引。`(list_no, deptid_m)` 為查詢索引（per-DEPT 加總 / Rollback 清空 / F082 GET 之 SQL filter 共用）。

**比例驗證規則（I-8，2026-05-15 / F082 v1.0 / E07 重構批次 5 文件化）**：

| 規則 | 說明 |
|------|------|
| **per-DEPT 加總約束** | 同 `(list_no, deptid_m)` 下所有 `ration` 加總須落於 `[99.99, 100.01]`（容忍 ±0.01% 浮點誤差，沿用 Invariant I-8）；違反回 422 `PERSONNEL_RATIO_SUM_NOT_100`。**注意**：與 `ob_dept_pct` 之 per-LIST_NO 加總語意不同 |
| **單欄位區間** | 任一 `ration` 須落於 `[0, 100]`（整數或最多兩位小數）；`ration = 0` 視為有效值（表示該業務員本月不分派）；違反回 422 `RATIO_OUT_OF_RANGE` |
| **驗證執行時機** | service 層於 PUT 寫入前執行；DB 端是否額外加 CHECK constraint 由 system-architect 決議（[ASSUMPTION]） |
| **驗證 helper** | 建議封裝為 `PersonnelRatioValidationService.assertDeptSumEquals100(deptCode, ratios)`（per-DEPT 寫入時使用，F082）+ `PersonnelRatioValidationService.assertAllDeptsSumEquals100(listNo)`（推進前置條件使用，F084），與 F079 之 `RatioValidationService.assertSumEquals100` 並列 |

**轄區規則（I-3，2026-05-15 / F082 v1.0 / E07 重構批次 5 文件化）**：

| 規則 | 說明 |
|------|------|
| **轄區判定** | 處長僅能讀寫 `ob_empl_set.created_by = currentUserId` 之紀錄；部長 / Admin 不受此限 |
| **新建紀錄 `created_by` 自動填入** | F082 PUT 寫入時 `created_by` 由後端自動填入 `currentUserId`（覆寫式寫入：DELETE + INSERT 後新紀錄之 `created_by` 為當前使用者，故部長代操作後紀錄歸屬於部長 userId）|
| **GET 過濾邏輯** | 處長 GET 端點：service 層 `scopeByCreator()` helper 於 SQL WHERE 加 `AND (currentUserRole IN ('director','admin') OR created_by = :currentUserId)` |
| **PUT 攔截邏輯** | 處長 PUT 端點：新 `SectionChiefScopeGuard` 攔截 request body 之 `deptCode` + `empIds`，比對 DB 中 `created_by`，不符回 403 `PERSONNEL_RATIO_OUT_OF_SCOPE` |
| **跨轄區 Rollback** | F085 Rollback 為部長 / Admin 操作，DELETE `ob_empl_set WHERE list_no = :listNo` **跨轄區全部清空**（不過濾 `created_by`）|

**stage 鎖定規則（2026-05-15 / F082 / F084 / F085 / E07 重構批次 5）**：

| 操作 | 允許 stage | 拒絕 stage 之回應 | 維護 spec |
|------|----------|------------------|----------|
| GET（讀） | 任意 stage（推進後 `isReadOnly = true`）| 不拒絕 | F082 §5.1 |
| PUT（寫） | `'personnel_ratio'` | 422 `LIST_STAGE_TRANSITION_FORBIDDEN` | F082 §5.2 / F082 BR-5 |
| 推進至 `approval` | `'personnel_ratio'` + 所有部門加總 = 100% | 422 `LIST_STAGE_TRANSITION_FORBIDDEN` 或 422 `STAGE_ADVANCE_PRECONDITION_FAILED` | F084 §5.1 |
| Rollback 至 `dept_ratio` | `'personnel_ratio'`（限部長 + Admin）| 422 `STAGE_ROLLBACK_BLOCKED`（reason: `wrong_source_stage`）/ 403 `E07_FORBIDDEN_DIRECTOR_ONLY` | F085 §5.1 |
| Rollback 之資料清空 | `'personnel_ratio'` → `'dept_ratio'` | DELETE FROM `ob_empl_set` WHERE `list_no = :listNo` 之**所有部門所有業務員**紀錄（跨轄區）；於同 transaction 內執行 | F085 BR-3 / Invariant I-9 |

**FK 級聯規則（[ASSUMPTION]，2026-05-15）**：

| 關聯 | 建議級聯規則 | [ASSUMPTION] 說明 |
|------|------------|------------------|
| `ob_empl_set.list_no → ob_list_definition.list_no` | `ON DELETE RESTRICT`（避免名單意外刪除帶走比例資料）| F050 v2.0 BR：名單僅軟刪除（`status = 'inactive'`），不執行 hard delete；FK 級聯規則由 system-architect 於 migration 設計確認 |
| `ob_empl_set.deptid_m → ob_emphire.dept_code` | **不建議**設 FK（`ob_emphire` 為 ETL 同步表，部門可下線；參考 F079 / `ob_dept_pct.obdeptid` 同等決策）| service 層由 F082 GET 邏輯處理；FK 不設可避免 ETL 異動阻塞名單寫入 |
| `ob_empl_set.emplid → ob_emphire.emp_id` | **不建議**設 FK（同上理由）| service 層 F082 BR-13 校驗 `empId` 存在於在職員工；FK 不設保留歷史紀錄 |

**`project_workym` 欄位補建決策（[ASSUMPTION]，2026-05-15）**：

> 既有 OBEMPLSETMF schema **無 `project_workym` 欄位**（PK 僅 `(list_no, deptid_m, emplid, ration)`）；F085 Rollback 以 `list_no` 為條件 DELETE 已可達月份隔離（`list_no` 含 `OB{YYYYMM}{NNN}` 格式內含月份）。
>
> **本 spec 不要求補建 `project_workym`**，但 system-architect 應評估是否補建以對齊 `ob_dept_pct` 之設計一致性（如補建可簡化跨月份查詢與索引設計）。詳見 [F082 §12 A-3](features/F082-set-personnel-ratio.md#12-假設)。

**Follow-up：prod migration（2026-05-25 / commits 98a2f56 + 736e9c4）**：

> 本批 entity 改動共兩項：
> 1. `ob_empl_set.ration` / `ob_dept_pct.ration` 之 `scale` 由 1 → 2（避免 22 員工均等分配 4.55 round 成 4.6 → sum=101.1）
> 2. `ob_empl_set.created_by` / `updated_by` / `ob_dept_pct.created_by` / `updated_by` 由 VARCHAR(10) → VARCHAR(50)（對齊 `users.id` UUID 36 字元）
>
> Dev 環境採 TypeORM `synchronize: true`，entity 改動於下次啟動即生效；**prod 環境 `migration:run` 不會自動 ALTER 既有欄位**，需手動撰寫 migration script（`ALTER TABLE ob_empl_set ALTER COLUMN ration TYPE NUMERIC(10,2)` 等四個 ALTER）並驗證既有資料不溢位（既有值皆 ≤ 100，scale 擴大不會 truncate；既有 user UUID 長度 36 < 50，欄位擴大不會截斷）。撰寫細節由 system-architect / DevOps 決議，本 spec 不展開 migration script。

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

> **v2.1.1（2026-05-20 / US-126 / US-127 / D1 / D4 / Q-A）**：本表為 [F050 v2.1.1](features/F050-create-list-definition.md) / [F051 v2.1.1](features/F051-edit-list-definition.md) 之「卡別下拉」資料來源；前端透過 `GET /api/v1/assignment/scoring/card-types`（F069 既有端點，具體 query 形式由 system-architect 決定）載入。建立名單時僅列 `status='active'` 紀錄；編輯名單時前端額外保留「該名單已存的 inactive 值」供顯示（HTML `disabled`，可保留不可重選），確保歷史名單之 `card_type` 不因卡別停用而遺失。下拉首選項固定為「— 未選擇 —」（空值），對應 `ob_list_definition.card_type` 可為 NULL 之選填語意。

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
| match_type | VARCHAR(20) | NOT NULL | —（新增欄位）| **v1.3 / 2026-05-18 新增（F054 v1.3 / F061 v1.3）**：計分維度比對模式；允許值：`'CATEGORY'`（精確比對，使用 `level1`）/ `'RANGE'`（數值區間比對，使用 `level2_s` / `level2_e`）/ `'COMPOSITE'`（複合比對，`level1` + `level2_s` / `level2_e` 均可有值）；CHECK constraint：`match_type IN ('CATEGORY', 'RANGE', 'COMPOSITE')`；**遷移時 backfill 策略**：依 `ob_levelcard_score` 現有資料推導（`level1 NOT NULL AND level2_s IS NULL → 'CATEGORY'`；`level1 IS NULL AND level2_s NOT NULL → 'RANGE'`；其餘 → `'COMPOSITE'`），詳見下方「Migration 設計」段落 |

> 注意：原表欄位名 `COLUNM` 為舊系統拼字錯誤（應為 COLUMN），遷移時修正為 `column_name`。

**索引**：`(card_type, card_version, column_name)`（複合索引）

**`match_type` Migration 設計（v1.3 / F054 v1.3 新增）**

> 此欄位為 AppDB 新增欄位（原 OBLEVELCARD_COLUNM 無對應欄），需於 TypeORM Migration 中完成新增 + backfill + CHECK constraint。

```sql
-- up() 執行順序：
-- Step 1：新增欄位（允許 NULL，等待 backfill）
ALTER TABLE ob_levelcard_column
  ADD COLUMN match_type VARCHAR(20) NULL;

-- Step 2：backfill — 依對應 ob_levelcard_score 資料推導
UPDATE ob_levelcard_column c
SET match_type = (
  SELECT
    CASE
      WHEN EXISTS (
        SELECT 1 FROM ob_levelcard_score s
        WHERE s.card_type = c.card_type
          AND s.card_version = c.card_version
          AND s.column_name = c.column_name
          AND s.level1 IS NOT NULL
          AND s.level2_s IS NULL
          AND s.level2_e IS NULL
      ) THEN 'CATEGORY'
      WHEN EXISTS (
        SELECT 1 FROM ob_levelcard_score s
        WHERE s.card_type = c.card_type
          AND s.card_version = c.card_version
          AND s.column_name = c.column_name
          AND s.level1 IS NULL
          AND s.level2_s IS NOT NULL
      ) THEN 'RANGE'
      ELSE 'RANGE'  -- 無 score 列者預設 RANGE（AC-1b ALL_SCORES_EMPTY 提示機制覆蓋此情境，最保守選擇）
    END
);

-- Step 3：補 NOT NULL constraint（backfill 完成後）
ALTER TABLE ob_levelcard_column
  ALTER COLUMN match_type SET NOT NULL;

-- Step 4：補 CHECK constraint
ALTER TABLE ob_levelcard_column
  ADD CONSTRAINT chk_ob_levelcard_column_match_type
  CHECK (match_type IN ('CATEGORY', 'RANGE', 'COMPOSITE'));

-- Step 5：驗證 assertion query（預期 0 列）
SELECT COUNT(*) FROM ob_levelcard_column WHERE match_type IS NULL;
-- 預期：0
SELECT COUNT(*) FROM ob_levelcard_column
  WHERE match_type NOT IN ('CATEGORY', 'RANGE', 'COMPOSITE');
-- 預期：0
```

> **建議 TypeORM 檔名**：`{timestamp}-add-match-type-to-ob-levelcard-column.ts`

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
| level1 | VARCHAR(10) | NULL | LEVEL1 | 類別型條件（精確值）；**依 match_type 之 NULL 規則**：`match_type = 'CATEGORY'` 時 NOT NULL（業務層強制）；`match_type = 'RANGE'` 時應為 NULL；`match_type = 'COMPOSITE'` 時可有值亦可 NULL（DB 層維持 NULL 允許，應用層依 match_type 驗證）|
| level2_s | VARCHAR(10) | NULL | LEVEL2_S | 數值型條件起始值；**依 match_type 之 NULL 規則**：`match_type = 'RANGE'` 或 `'COMPOSITE'` 時需有值；`match_type = 'CATEGORY'` 時應為 NULL |
| level2_e | VARCHAR(10) | NULL | LEVEL2_E | 數值型條件結束值；NULL 語意同 `level2_s`（可為開放區間上限） |
| score | INTEGER | NOT NULL | SCORE | 分數 |

> **match_type 與 level1 / level2_s / level2_e 對應規則**（應用層驗證，非 DB CHECK constraint）：
> - `CATEGORY`：`level1` 必填、`level2_s` / `level2_e` 必須為 NULL
> - `RANGE`：`level1` 必須為 NULL、`level2_s` 必填（`level2_e` 可為 NULL 表示無上限）
> - `COMPOSITE`：`level1` 與 `level2_s` / `level2_e` 均允許有值，至少一組不為 NULL
> - CATEGORY 模式下同一 `(card_type, card_version, column_name, level1)` 不可重複（`SCORING_CATEGORY_DUPLICATE` 422）

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

用途：將「計分卡類型 CARD_TYPE × 計分卡等級 CARD_LEVEL」對應到外部系統使用的分群代碼 TIER_LEVEL。月名單分派 Stage 2 計算出 `ob_pool_data_list.card_level` 後，依本表 join 取得 `tier_level` 寫回。

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
> **計分設定缺漏**：M3 / HC / C3 同樣缺少 `ob_levelcard_version` 計分設定（與 HM 相同）；遷移後月名單分派這些 CARD_TYPE 名單時 score=0，tier_level 由 fallback 取得（T5M / THC / T3C）。業務語意上這與舊 SP 的硬編碼行為等效（舊 SP 對這三種 CARD_TYPE 完全略過計分步驟，直接覆寫 TIER_LEVEL）——因此**月名單分派結果語意一致**，但計分數值不可信。詳見 [architecture-spec.md AD-E07-15](architecture-spec.md#ad-e07-15hm-計分卡獨立化決策)。

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

> **資料同步機制**：本表採 **E04 + E05 雙層 ETL** 同步：E04 通用擷取任務從舊 OB DB（SQL Server `OB_ARRETURNDF_MIN_CAP`）抓取至 `raw_{task_id_short}` 中介表，再由 E05 Pipeline TargetLoad 將資料載入本表（`fullMode: true` 全量替換）。OB 端 `OB_ARRETURNDF_MIN_CAP` 為 `ARRETURNDF` 還款明細表的預先彙總結果（`MIN(ADD_UN_CAPITAL) GROUP BY APPL_NO`）；每月月名單分派前由業務主管手動依序觸發 E04→E05（同 OBPOOLDATA 同步策略）。詳見 [architecture-spec.md §E07-C](architecture-spec.md#e07-c-etl-設計) ETL 設計。**E07 不提供 CRUD 維護介面**，所有資料維護於舊 OB 端進行。

PK：`appl_no` [ASSUMPTION] 原表（`OB_ARRETURNDF_MIN_CAP`）無 PK constraint 亦無索引；遷移時補建 `PRIMARY KEY (appl_no)` 以利 `fn_calc_tier_level` 內部 LEFT JOIN 查詢。DBA 需確認 OB 端 SP 重建後 `APPL_NO` 唯一性（若存在重複 key，需在 ETL 層以 `MIN(ADD_UN_CAPITAL) GROUP BY APPL_NO` 或 `DISTINCT ON (appl_no)` 去重後再寫入）。

用途：E07 月名單分派 Stage 2 計分時，`fn_calc_tier_level` 以 LEFT JOIN 取得個別案件的累積未償本金（`ADD_UN_CAPITAL` 維度），適用 H / HM 等需要此計分維度的計分卡類型。缺值時 default 為 0。

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

**相關功能**：[F061](features/F061-trigger-assignment-run.md)（月名單分派 Stage 2 計分）

---

#### ob_emphire（OBEMPHIRE — 員工主檔） {#ob-emphire-entity}

> **資料同步機制**：本表採 **E04 + E05 雙層 ETL** 同步，pipeline 識別碼 **E07-OBEMPHIRE-Load**：E04 通用擷取任務從舊 OB DB（SQL Server `OBEMPHIRE`）抓取至 raw_{task_id_short} 中介表（既有機制），再由 E05 Pipeline TargetLoad 將資料載入本表 `appdb.ob_emphire`（full replace 模式）。OBEMPHIRE 採 **full 全量重抓**策略，每日重抓 raw → Pipeline 整批 replace `ob_emphire`（員工數 < 1 萬筆無效能壓力）。詳見 [architecture-spec.md §E07-C](architecture-spec.md#e07-c-etl-設計) ETL 設計。**E07 不提供 CRUD 維護介面**，所有員工資料維護於舊 OB 端進行。
>
> **F082 v1.2 使用模式（PO 決議 F082-A 落地，2026-05-16）**：F082 業務員清單來源為 `appdb.ob_emphire` **全取**（不過濾 `resign_date`）；每筆員工 service 層即時計算 `isResigned = (resign_date IS NOT NULL)`；F082 GET response `employees[].isResigned` 由此衍生；UI 顯示「離職」badge；per-DEPT 比例驗算排除 `isResigned = true` 員工；既有 `ob_empl_set` ration 紀錄保留供歷史追溯，不自動清除。

PK：`emp_id` [ASSUMPTION] 原 OBEMPHIRE 表無 PK constraint，遷移時補建 `PRIMARY KEY (emp_id)` 以利 join。

用途：提供 E07 月名單分派（Stage 4 人員指派）、F058 編輯人員比例設定、F064 匯出分派結果（員工姓名 join 來源）等 Feature 取得員工基本資料。

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

**CI / test fixture 策略（2026-05-16 / system-architect 決議 #5）**：

Integration test 共用 fixture factory 模組 `apps/api/test/fixtures/ob-emphire.fixture.ts`：

| Helper | 用途 |
|---|---|
| `buildObEmphire(overrides)` | 建立單筆 `ob_emphire` 紀錄，預設在職、可覆寫欄位 |
| `allResignedDeptSeed(deptCode)` | 建立指定部門「全員離職」場景 seed |
| `mixedActiveResignedDeptSeed(deptCode, activeCnt, resignedCnt)` | 建立「部分在職 + 部分離職」場景 seed |

**測試使用最低必要欄位**：`emp_id` / `emp_nm` / `dept_code` / `resign_date`（其他欄位可 NULL；fixture factory 預設帶入合理值）。詳見 [F082 v1.3 §11 測試 Fixture 策略](features/F082-set-personnel-ratio.md#11-實作-checklist)。

**相關功能**：[F058](features/F058-edit-personnel-ratio.md)、[F061](features/F061-trigger-assignment-run.md)、[F063](features/F063-view-run-result-summary.md)、[F064](features/F064-export-assignment-result.md)、[F082 v1.3](features/F082-set-personnel-ratio.md)（per-DEPT 比例驗算 + 離職員工 isResigned flag + 全員離職邊界）

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
- 月名單分派期間之工作日數計算：`SELECT COUNT(*) FROM ob_calendar WHERE rest_flg = '0' AND calendar_date BETWEEN :startDate AND :endDate`
- 假日定義由舊 OB 端 Admin 維護，包含週末與國定假日

**相關功能**：[F049](features/F049-stage0-daily-estimate.md)

---

### E07 新建表（非 ob_ 前綴）

#### assignment_run（月名單分派執行紀錄）

| 欄位名 | 型別 | NULL | 說明 |
|--------|------|------|------|
| run_id | UUID | NOT NULL | **PK**，月名單分派唯一識別碼（系統自動產生） |
| project_workym | VARCHAR(6) | NOT NULL | 作業年月（YYYYMM） |
| status | VARCHAR(20) | NOT NULL | 執行狀態：`pending` / `running` / `completed` / `failed` |
| triggered_by | UUID | NOT NULL | 觸發者 user_id（FK → users.id） |
| started_at | TIMESTAMP | NULL | 執行開始時間（UTC） |
| finished_at | TIMESTAMP | NULL | 執行結束時間（UTC） |
| duration_ms | INTEGER | NULL | 執行耗時（毫秒） |
| total_cases | INTEGER | NULL | 本次分派總案件數 |
| total_lists | INTEGER | NULL | 本次處理名單數 |
| error_message | TEXT | NULL | 失敗錯誤訊息 |
| report_payload | JSONB | NULL | **v1.2 / 2026-05-18 更新（F061 v1.3）**：月名單分派警告紀錄與輔助資訊容器；目前已定義子鍵：`skippedCases[]`（邊緣 CARD_TYPE 跳過案件清單）+ `skippedCaseCount`（跳過總數）+ `warningSummary`（計分完整性警告摘要，含 `SCORING_INTEGRITY_WARN` 子鍵）+ `warnings[]`（其他警告，如 `WHITELIST_OPTION_INACTIVE`）；非錯誤訊息，月名單分派仍可 `status = 'completed'`；schema 詳見下方「report_payload 結構」段落 |
| created_at | TIMESTAMP | NOT NULL | 紀錄建立時間（UTC） |

**索引**：`run_id`（PK）、`(project_workym, status)`（查詢索引）

**`report_payload` 結構（v1.2 / 2026-05-18 更新）**：

```json
{
  "skippedCases": [
    {
      "caseId": "CASE_ID_001",
      "reason": "UNSUPPORTED_CARD_TYPE",
      "cardType": "HB",
      "listNo": "OB202605001",
      "stage": 2
    }
  ],
  "skippedCaseCount": 1,
  "warningSummary": {
    "SCORING_INTEGRITY_WARN": {
      "affectedCount": 3,
      "details": [
        {
          "cardType": "H",
          "cardVersion": 1,
          "columnName": "PROD_KIND",
          "issue": "MATCH_TYPE_FIELD_MISMATCH",
          "description": "match_type=CATEGORY 但 level2_s 不為 NULL"
        }
      ]
    }
  },
  "warnings": [
    {
      "code": "WHITELIST_OPTION_INACTIVE",
      "listNo": "OB202605002",
      "columnName": "PROD_KIND",
      "optionValue": "02",
      "message": "名單條件引用之可選值已被停用"
    }
  ]
}
```

**欄位說明**：
- `skippedCases[].reason`：ENUM；目前定義 `UNSUPPORTED_CARD_TYPE`（邊緣 CARD_TYPE，如 HB / SEB / SEC，無對應計分卡且無 `ob_tier` fallback）；未來可擴充
- `skippedCases[].caseId`：跳過案件之 `appl_no`（或 `(orgno, appl_no)` 字串化）
- `skippedCases[].stage`：跳過時所處 Stage（目前固定為 2，計分階段）
- `warningSummary.SCORING_INTEGRITY_WARN`：**v1.3 / 2026-05-18 新增**；Stage 2 前 `ScoringIntegrityCheckService` 執行計分設定完整性稽核時若發現 `match_type` 與 score 記錄不一致，寫入此子鍵；`affectedCount` 為問題 column 數量；`details[]` 每筆含 `cardType` / `cardVersion` / `columnName` / `issue`（`MATCH_TYPE_FIELD_MISMATCH` 或 `CATEGORY_DUPLICATE`）/ `description`；月名單分派不中斷，以警告繼續執行
- `warnings[].code`：對應 [error-handling.md#assignment-run-warnings](error-handling.md#assignment-run-warnings) 警告碼
- 前端 F062 / F063 依此欄位顯示黃色警示 banner（沿用 `RUN_REPORT_SKIPPED_CASES` / `WHITELIST_OPTION_INACTIVE` 警告紀錄；`warningSummary.SCORING_INTEGRITY_WARN.affectedCount > 0` 時另行顯示黃色 integrity 警示）

---

#### assignment_run_snapshot（月名單分派快照）

| 欄位名 | 型別 | NULL | 說明 |
|--------|------|------|------|
| snapshot_id | UUID | NOT NULL | **PK**，快照識別碼 |
| run_id | UUID | NOT NULL | FK → assignment_run.run_id |
| snapshot_type | VARCHAR(20) | NOT NULL | 快照類型：`config` / `input_list` / `result` |
| payload | JSONB | NOT NULL | 快照內容（JSON） |
| created_at | TIMESTAMP | NOT NULL | 快照建立時間（UTC） |

**業務規則**：
- 每次月名單分派產生 3 筆快照（config、input_list、result）
- 快照保留期限與 `assignment_run` 相同（3 年）

**索引**：`snapshot_id`（PK）、`(run_id, snapshot_type)`（查詢索引）

---

#### assignment_audit_log（E07 CRUD 稽核日誌）

| 欄位名 | 型別 | NULL | 說明 |
|--------|------|------|------|
| log_id | UUID | NOT NULL | **PK**，日誌識別碼 |
| entity_type | VARCHAR(50) | NOT NULL | 被操作實體（如 `ob_list_definition`、`ob_dept_pct`） |
| entity_id | VARCHAR(100) | NOT NULL | 被操作實體的識別碼（字串化） |
| action | VARCHAR(30) | NOT NULL | 操作類型：`CREATE` / `UPDATE` / `DELETE` / `RUN` / `STAGE_ADVANCE` / `STAGE_ROLLBACK` / `STAGE_REJECT` / `SCORING_INTEGRITY_WARN`（**v1.12 / 2026-05-16 擴充 VARCHAR(10)→VARCHAR(30)**，見 AD-E07-17；**v1.3 / 2026-05-18 新增 `SCORING_INTEGRITY_WARN`**）|
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

**`SCORING_INTEGRITY_WARN` action 子欄位規範（v1.3 / 2026-05-18 新增）**：

`action = 'SCORING_INTEGRITY_WARN'` 時，`after_value` JSONB 結構如下（`before_value` 為 NULL）：

```json
{
  "runId": "uuid-of-run",
  "projectWorkym": "202605",
  "checkTimestamp": "2026-05-18T10:00:00Z",
  "affectedCount": 3,
  "issues": [
    {
      "cardType": "H",
      "cardVersion": 1,
      "columnName": "PROD_KIND",
      "issue": "MATCH_TYPE_FIELD_MISMATCH",
      "matchType": "CATEGORY",
      "invalidScoreRows": 2,
      "description": "match_type=CATEGORY 但有 2 筆 score 記錄之 level2_s 不為 NULL"
    },
    {
      "cardType": "S",
      "cardVersion": 1,
      "columnName": "SPEC_TP",
      "issue": "CATEGORY_DUPLICATE",
      "duplicateLevel1": "01",
      "duplicateCount": 3,
      "description": "CATEGORY 模式下 level1='01' 重複出現 3 筆"
    }
  ]
}
```

- `entity_type`：`'assignment_run'`；`entity_id`：`run_id`
- `actor_id`：系統自動寫入，填入觸發月名單分派之 `triggered_by`（無互動式操作者，沿用月名單分派觸發者 ID）
- 此 action 為警告記錄，不影響月名單分派繼續執行；對應 `report_payload.warningSummary.SCORING_INTEGRITY_WARN` 子鍵

**索引**：`log_id`（PK）、`(entity_type, entity_id)`、`(actor_id, created_at)`、`created_at`（保留期排程清理）

---

#### assignment_approval（簽核紀錄） {#assignment_approval--簽核紀錄}

> **新建表（2026-05-15 / E07 重構批次 6）**：對應 [F086](features/F086-approve-to-ready.md)（核准）、[F087](features/F087-reject-to-personnel-ratio.md)（拒絕）、[F089](features/F089-rollback-to-approval.md)（Rollback 時清空）。記錄 `ob_list_definition` 簽核階段（M03c）之核准 / 拒絕操作歷史，獨立於 `assignment_audit_log` 以提供 F082 banner 顯示與 F088 摘要顯示之查詢來源。

| 欄位名 | 型別 | NULL | 說明 |
|--------|------|------|------|
| approval_id | UUID | NOT NULL | **PK [ASSUMPTION]** 由 system-architect 確認 PK 設計（單 PK UUID vs 複合 PK `(list_no, approved_at)`）|
| list_no | VARCHAR(11) | NOT NULL | FK → `ob_list_definition.list_no`；對應簽核之名單 |
| action | VARCHAR(10) | NOT NULL | 簽核動作：`'approve'`（核准 → ready，由 F086 寫入）/ `'reject'`（拒絕 → personnel_ratio，由 F087 寫入）；CHECK constraint 限二值 |
| reject_reason | TEXT | NULL | 拒絕原因（1~500 字）；`action = 'reject'` 時 NOT NULL；`action = 'approve'` 時 NULL；DB CHECK constraint 表達互斥規則（`(action = 'reject' AND reject_reason IS NOT NULL) OR (action = 'approve' AND reject_reason IS NULL)`）|
| approver_id | VARCHAR(50) | NOT NULL | 操作者 user_id（與 `assignment_audit_log.actor_id` 模式一致）|
| approver_name | VARCHAR(100) | NOT NULL | 操作者姓名快照（不受後續改名影響）|
| approver_role | VARCHAR(20) | NOT NULL | 操作者角色：`'director'` / `'admin'` |
| approved_at | TIMESTAMP | NOT NULL | 簽核操作時間（UTC）|
| ip_address | VARCHAR(45) | NULL | 操作者 IP（IPv4/IPv6）|
| created_at | TIMESTAMP | NOT NULL | 紀錄建立時間（UTC，通常 = `approved_at`）|

**業務規則**：

| 規則 | 說明 | 來源 |
|------|------|------|
| **每次簽核產生獨立紀錄**（不 UPSERT）| F086 / F087 每次操作皆 INSERT 一筆紀錄；多次拒絕 / Rollback 後再核准之歷史紀錄完整保留 | F086 BR-5 / F087 BR-12 |
| **F082 banner 來源**：最近一筆 `action = 'reject'` 紀錄 | F082 GET 端點 LEFT JOIN 取最近一筆紀錄；若最近一筆為 `action = 'approve'` 或無紀錄，回傳 `latestRejection = null` | F087 BR-11 / F082 v1.1 §7.x |
| **F088 `approvalHistory` 來源**：所有紀錄按 `approved_at` 倒序 | F088 GET `summary/{listNo}` 端點回傳完整 `approvalHistory` 陣列 | F088 BR-6 |
| **F089 Rollback 時 hard delete**：DELETE WHERE `list_no = :listNo` 清空全部紀錄 | F089 Rollback 至 simulation 時需清空 `assignment_approval`（避免 F082 banner / F088 `approvalHistory` 顯示已過時資料）；歷史完整資訊由 `assignment_audit_log.before_value.approvalHistory` 保留 | F089 BR-4 / BR-9 |
| **拒絕原因長度上限 500 字** | F087 後端校驗；超出回 422 `APPROVAL_REJECT_REASON_TOO_LONG` | F087 BR-5 / AC-9 |
| **不可修改**（INSERT-only / DELETE-only）| 簽核紀錄不可 UPDATE；唯一可改變狀態之操作為 F089 Rollback 之 hard delete | 設計原則 |

**多次拒絕 / 重複核准場景處理**：

| 場景 | `assignment_approval` 紀錄 | F082 banner | F088 approvalHistory |
|------|---------------------------|-------------|---------------------|
| 名單第一次推進至 approval → 部長拒絕 | 1 筆 reject | 顯示拒絕原因 | 1 筆 reject |
| 處長修正後重新推進 → 部長再次拒絕（不同原因）| 2 筆 reject | 顯示**最近一筆**拒絕原因 | 2 筆 reject（倒序）|
| 處長修正後 → 部長核准 → 名單進入 ready | 2 筆 reject + 1 筆 approve | `latestRejection = null`（最近為 approve）| 3 筆紀錄（倒序）|
| 部長 F089 Rollback → 名單重回 approval | **0 筆**（已 hard delete）| `latestRejection = null` | 0 筆（`assignment_audit_log.before_value.approvalHistory` 含 3 筆完整快照供追溯） |

**索引（建議）**：

| 索引 | 說明 |
|------|------|
| `approval_id`（PK，UUID）| 主鍵 |
| `(list_no, approved_at DESC)` | F082 / F088 查詢「該名單最近一筆紀錄」優化（covering index 候選）|
| `(approver_id, approved_at)` | 稽核 / 報表查詢「某使用者所有簽核操作」|

**FK 級聯規則（建議由 system-architect 確認）**：

| FK | 級聯規則 |
|----|---------|
| `assignment_approval.list_no → ob_list_definition.list_no` | `ON DELETE RESTRICT`（避免名單意外刪除帶走簽核紀錄）；F050 v2.0 BR：名單僅軟刪除（`status = 'inactive'`），不執行 hard delete |

**[ASSUMPTION] 待 system-architect 決議事項**：

| # | 事項 | 來源 spec |
|---|------|----------|
| 1 | PK 設計：單 PK `approval_id` UUID（建議）vs 複合 PK `(list_no, approved_at)` | F086 §12 A-2、F087 §12 A-2 |
| 2 | `action` / `reject_reason` 互斥之 DB CHECK constraint 是否強制 | F087 BR-5 |
| 3 | F089 Rollback 採 hard delete vs soft delete | F089 §12 A-2 |
| 4 | `approver_role` 是否需要 ENUM type 限制（建議採 CHECK constraint，與 F056 TIER_LEVEL 一致策略）| F086 / F087 |

**相關功能**：[F086](features/F086-approve-to-ready.md)、[F087](features/F087-reject-to-personnel-ratio.md)、[F088](features/F088-ready-stage-summary.md)、[F089](features/F089-rollback-to-approval.md)、[F082 v1.1](features/F082-set-personnel-ratio.md)（GET response `latestRejection` 欄位來源）

---

### User 實體補充（E07 業務角色欄位） {#user-entity}

> **v2.0 / 2026-05-16 破壞性變更（E07 合併重構 AD-E07 v3.0）**：本節廢除 v1.x 「`is_sales_manager` BOOLEAN + `e07_role` VARCHAR」正交雙欄位設計，改採**單一欄位** `business_role VARCHAR(20) NULL`。舊兩欄位於 m14 migration 統一 DROP；不進行資料遷移（per PO 決議「不向下相容、不保留歷史值」）。

`users` 表新增以下欄位，支援業務角色識別與 E07 應用層角色：

| 欄位名 | 型別 | NULL | 約束 | 說明 |
|--------|------|------|------|------|
| business_role | VARCHAR(20) | NULL（預設） | DB CHECK：`business_role IS NULL OR business_role IN ('director', 'section_chief')` | **v2.0 / E07 合併重構新增**：E07 業務角色 ENUM；NULL 表示未指派 E07 角色（user 帳號於 E07 全模組無權回 `E07_ROLE_NOT_ASSIGNED`；admin 帳號自動繼承 director 全範圍，本欄位無實質效用） |

**業務規則**：
- `business_role = 'director'` → 業務部長身份（E07 全模組 RW）
- `business_role = 'section_chief'` → 業務處長身份（限轄區 RW；M02 完全不可見）
- `business_role = NULL` → user 帳號 = 無 E07 角色；admin 帳號 = 自動繼承部長全範圍
- 部長與處長**互斥**（單一欄位設計，不可同時持有）
- `business_role` 由 Admin 設定（PATCH `/api/v1/accounts/:id/business-role`，[F006a](features/F006a-update-business-role.md) 新增），不可自行設定
- 與 `role` 欄位無衝突（`role = 'user'` 且 `business_role = 'director'` 為合法組合）
- `business_role` **不**在 PUT `/api/accounts/:id`（F006 編輯帳號）變更範圍；若 PUT body 含 `business_role` 欄位應**忽略**（沿用敏感欄位獨立端點設計慣例）
- **`business_role` 變更觸發 password_changed_at 寫入**：`AccountsService.updateBusinessRole()` 寫入 `business_role` 變更時，必須在同一 DB transaction 內同步寫入 `users.password_changed_at = new Date(Date.now() + 1000)`，使該帳號所有舊 JWT 因 AuthGuard 比對 `JWT.iat * 1000 < password_changed_at` 立即失效（沿用 F009 / F010 既有 `password_changed_at` 機制）。+1 秒之偏移避免同秒 JWT iat 比較邊界 bug

**索引建議**：`(business_role)` WHERE `business_role IS NOT NULL`（部分索引；用於 E02 帳號管理頁「依 business_role 篩選」與 E07 統計查詢）

**相關功能**：[F006](features/F006-edit-account.md)、[F006a](features/F006a-update-business-role.md)（**唯一寫入入口**）、~~F008（DEPRECATED v3.x）~~、[F009](features/F009-self-service-password-reset.md)、[F010](features/F010-admin-reset-password.md)、[F073 v2.0](features/F073-define-director-role.md)、[F074 v2.0](features/F074-define-section-chief-role.md)、[F002 v2.0 §4.6](features/F002-user-login.md#e07-角色矩陣)（E07 角色矩陣權威來源）

#### m14 Migration 規範（v2.0 / E07 合併重構）

| 步驟 | SQL | 備註 |
|---|---|---|
| 1 | `ALTER TABLE users ADD COLUMN business_role VARCHAR(20) NULL;` | 新欄位預設 NULL，向下相容 |
| 2 | `ALTER TABLE users ADD CONSTRAINT chk_users_business_role CHECK (business_role IS NULL OR business_role IN ('director', 'section_chief'));` | DB 層強制 enum 值 |
| 3 | `CREATE INDEX idx_users_business_role ON users (business_role) WHERE business_role IS NOT NULL;` | 部分索引 |
| 4 | `ALTER TABLE users DROP COLUMN IF EXISTS is_sales_manager;` | v1.x 欄位 DROP |
| 5 | `ALTER TABLE users DROP COLUMN IF EXISTS e07_role;` | v1.x 短期過渡欄位 DROP（若曾建立） |

> **不執行 UPDATE / 不進行 backfill**：所有既有帳號之 `business_role` 預設為 NULL；Admin 需透過 [F006a](features/F006a-update-business-role.md) 重新逐筆指派。此為 PO 決議「不向下相容、不保留 v1.x 業務主管旗標值」之落地（2026-05-16）。

> **Migration 順序**：m14 須在所有依賴 `is_sales_manager` 之既有功能（F005 / F008 / 既有 SalesManagerGuard 等）下線後執行；建議與後端 Guard / Controller 變更同一個 release window 上線。

~~**`is_sales_manager` 與 `e07_role` 為正交維度**~~（**v2.0 廢除**：兩欄位均 DROP；不存在「正交維度」概念）

---

### M06 進階代碼維護新建表（E07 重構批次 1）

#### field_whitelist（POOLDATA 篩選欄位白名單） {#field-whitelist-entity}

> **新建表（2026-05-15 / E07 重構批次 1）**：對應 [F075](features/F075-manage-pooldata-field-whitelist.md)。提供新名單定義（後續 US-106 spec）動態載入可用篩選欄位之 metadata，取代原 SP 中硬編碼的固定欄位（原 SQL Server SP 內以大寫 PROD_KIND / CASEYEAR / SPEC_TP / SETTLE_SRC 等欄位名硬編碼，新系統對應 PostgreSQL `ob_pool_data` 表之小寫 snake_case 欄位 prod_kind / caseyear / spec_tp / settle_src，由本表 metadata 動態驅動）。本表為 AppDB 新建表，無對應舊系統 OB 表。

| 欄位名 | 型別 | NULL | 說明 |
|--------|------|------|------|
| column_name | VARCHAR(50) | NOT NULL | **PK**，對應 PostgreSQL `ob_pool_data` 之欄位名稱（字串映射，不維護 FK）；v1.4.3 起 case 對齊小寫 snake_case（與原 SQL Server `OBPOOLDATA` 大寫慣例脫鉤） |
| display_name | VARCHAR(100) | NOT NULL | 業務可讀之中文標籤（如「產品類別」） |
| field_type | VARCHAR(20) | NOT NULL | 欄位類別列舉：`numeric` / `categorical` / `date`（CHECK constraint 限三值） |
| is_active | BOOLEAN | NOT NULL DEFAULT TRUE | 啟用狀態；停用後新名單表單不再顯示，但既有名單條件不受影響（F075 BR-3） |
| is_system_fixed | BOOLEAN | NOT NULL DEFAULT FALSE | **v1.7 新增（2026-05-28 / US-144 / AD-E07-18 §18.12 / migration m295）**：標記此欄位為「系統固定篩選條件」；`true` 時：(1) F050 v2.3 / F051 v2.2 `injectSystemFixedConditions` 於 createList / updateList 強制注入且不可移除；(2) F075 BR-15 不可停用（422 `SYSTEM_FIXED_FIELD_CANNOT_DEACTIVATE`）；(3) F050 / F051「新增條件」dropdown 排除（BR-16）。目前唯一 `true` 值：`best_case`（優質案件，對齊舊系統 `OBMLISTDF.PROD_BEST` 恆 `'Y'` 業務語意）。PG 型別 `BOOLEAN`；SQLite 映射為 `INTEGER 0/1`（TypeORM boolean column） |
| data_source | VARCHAR(20) | NOT NULL DEFAULT 'ob_pool_data'（PG 另附 CHECK；SQLite 無 CHECK，同 `field_type` 慣例） | **v1.17 新增 / v1.18 定案（2026-07-02 / US-172 / F109 / AD-E07-37）**：標記此篩選欄位之資料來源，合法值 `'ob_pool_data'`（案件資料）/ `'customer_core'`（客戶資料，CHECK constraint 限兩值）。既有 7 筆透過 `ALTER TABLE ADD COLUMN ... DEFAULT` 自動 backfill 為 `'ob_pool_data'`（免 UPDATE）；F109 新增 8 個客戶屬性欄位為 `'customer_core'`。`GET /api/v1/pooldata-fields` 回應暴露 `dataSource`；M06 列表以「資料來源」欄呈現、F050 / F051「新增條件」選單依此分組（案件資料 / 客戶資料）。**月名單分派 Stage 1 語意**：名單 `condition_payload.conditions[].dataSource`（見下方 `condition_payload` 欄位說明）決定是否注入 `LEFT JOIN customer_core cc ON ob_pool_data.custo_no = cc.source_customer_no`，LEFT JOIN 後客戶欄位 NULL → 案件排除（F109 §6 BR-2 / BR-3）。**Migration：m305**（`1711360000305-AddDataSourceToPooldataFieldWhitelist`，schema-only）**+ m306**（`1711360000306-SeedCustomerCoreFilterFields`，8 筆白名單 + 106 筆可選值 seed）。完整契約見 [AD-E07-37](implementation-log/AD-E07-37-f109-customer-source-filter.md) |
| created_at | TIMESTAMP | NOT NULL | 紀錄建立時間（UTC） |
| updated_at | TIMESTAMP | NOT NULL | 最後更新時間（UTC） |
| created_by | UUID | NULL | 建立者 user_id（[ASSUMPTION] 由 system-architect 確認是否必填） |
| updated_by | UUID | NULL | 最後更新者 user_id |

**業務規則**：
- `column_name` 為唯一鍵；新增時不分啟用 / 停用一律檢查重複（F075 BR-1）
- `field_type` 僅允許三種列舉值；其他值由業務層 + DB CHECK 雙層驗證
- 停用為軟刪除（`is_active = false`），MVP 不支援硬刪除（F075 BR-9，OQ-102-02 暫定）
- 與 PostgreSQL `ob_pool_data` 之欄位名稱為字串映射關係，不維護外鍵約束（F075 BR-8）
- 月名單分派 Stage 1 不 join 本表做欄位有效性驗證，直接讀取 `ob_list_definition.condition_payload`（避免停用後月名單分派失敗）
- **`is_system_fixed = true` 欄位不可停用**（F075 BR-15）；service 層回 422 `SYSTEM_FIXED_FIELD_CANNOT_DEACTIVATE`；前端 M06 管理頁停用按鈕 disabled（F075 AC-20）
- **`data_source` 決定 Stage 1 JOIN 策略（v1.17 / F109）**：`'customer_core'` 之欄位被名單引用時，Stage 1 條件式 LEFT JOIN `customer_core`（NULL = 排除）；`'ob_pool_data'` 欄位維持單表 `FROM ob_pool_data o`。condition 之 `data_source` 判定機制（固化於 condition_payload vs runtime 查詢 vs 靜態常數）由 system-architect 決定（AD-E07-37 / OQ-F109-01），須與「Stage 1 不 join 白名單做有效性驗證」相容

**索引**：`column_name`（PK）、`(field_type, is_active)`（多選元件查詢）

**初始 Seed**（v1.7 / US-144 更新，7 筆全部啟用，migration m295 同批 UPSERT `is_system_fixed`；v1.6 對齊 F050 v2.1.1 補 best_case；v1.5 對齊 US-125 AC-5 補 case_status；v1.4.6 對齊舊系統 OBZ020 收斂 5 筆核心篩選欄位）：
- 6 筆 `is_active = true, is_system_fixed = false`：prod_kind（categorical）/ spec_tp（categorical）/ caseyear（categorical）/ settle_src（categorical）/ case_status（categorical）/ list_type（categorical，is_active=false per AD-E07-26 §26.7 m293）
- 1 筆 `is_active = true, is_system_fixed = true`：best_case（categorical，display_name「優質案件」；系統固定篩選條件，F050 v2.3 / F051 v2.2 強制注入）
- （list_type 已於 m293 停用，is_active=false，is_system_fixed=false；best_case 由 m295 M-B1 設 is_system_fixed=true）
- 以上既有 seed 一律 `data_source = 'ob_pool_data'`（v1.17 / F109 backfill）

**F109 Seed 延伸（v1.18 定案 / 2026-07-02 / US-172 / AD-E07-37）**：新增 8 筆 `is_active = true, is_system_fixed = false, data_source = 'customer_core'`（欄位來自 `customer_core`，透過 `ob_pool_data.custo_no = customer_core.source_customer_no` 關聯）：
- gender（categorical，性別，code→label 1/2/3）、date_of_birth（numeric，年齡，衍生 AGE 以 `project_workym` 月首日為基準）、occupation_desc（categorical，職業別）、education_desc（categorical，教育程度）、marital_status_desc（categorical，婚姻狀況）、customer_type_desc（categorical，身分別）、monthly_income_desc（categorical，收入區間）、cpost_city（categorical，居住城市，衍生 `LEFT(cpost_city,3)` 縣市級）
- 對應 `pooldata_field_option` 補 7 個 categorical 欄位可選值（性別 3 / 職業別 55 / 教育程度 8 / 婚姻狀況 5 / 身分別 4 / 收入區間 9 / 居住城市 22；6 個 `_desc` 欄 value=label，僅 gender code→label）
- **Migration 定案**：**m305**（`1711360000305-AddDataSourceToPooldataFieldWhitelist`，schema-only：ADD COLUMN + PG CHECK）+ **m306**（`1711360000306-SeedCustomerCoreFilterFields`，8 筆白名單 + 106 筆可選值，`ON CONFLICT DO NOTHING` / SQLite `INSERT OR IGNORE` 冪等）；不對既有 `condition_payload` JSONB 做 backfill（見上方 v1.18 changelog 說明）

**相關功能**：[F075](features/F075-manage-pooldata-field-whitelist.md)、[F076](features/F076-manage-categorical-field-values.md)（FK 父表）、[F109](features/F109-customer-source-filter-fields.md)（`data_source` 概念 + customer_core 8 欄）
**相關架構決策**：AD-E07-18 §18.12（migration M-B1 / M-B2 規格）、[AD-E07-37](implementation-log/AD-E07-37-f109-customer-source-filter.md)（F109 `data_source` 判定機制 + Stage 1 條件式 JOIN + `buildCustomerCoreClause` 契約，已定案）

---

#### categorical_field_value（類別型欄位可選值） {#categorical-field-value-entity}

> **新建表（2026-05-15 / E07 重構批次 1）**：對應 [F076](features/F076-manage-categorical-field-values.md)。為 `field_whitelist` 中 `field_type = 'categorical'` 的欄位維護可選值清單，供新名單定義表單之多選元件動態載入。

| 欄位名 | 型別 | NULL | 說明 |
|--------|------|------|------|
| column_name | VARCHAR(50) | NOT NULL | **複合 PK**，FK → `field_whitelist.column_name` |
| option_value | VARCHAR(20) | NOT NULL | **複合 PK**，對應 `ob_pool_data` 中該欄位之實際儲存值 |
| option_label | VARCHAR(100) | NOT NULL | 顯示標籤（中文） |
| is_active | BOOLEAN | NOT NULL DEFAULT TRUE | 啟用狀態；停用後新名單表單多選元件不再顯示，但既有名單條件不受影響（F076 BR-3） |
| deactivation_reason | VARCHAR(30) | NULL | **v1.1 / 2026-05-16 新增（F076 v1.1 / PO 決議 F076-C 落地）**：軟停用原因 ENUM：`'manual'`（手動於 F076 停用，預設）/ `'field_type_changed'`（因 F075 將 `field_type` 從 `categorical` 切換為其他類別自動軟停用）；`is_active = true` 時為 NULL；建議於 m10 migration 一次到位避免後續變更 |
| created_at | TIMESTAMP | NOT NULL | 紀錄建立時間（UTC） |
| updated_at | TIMESTAMP | NOT NULL | 最後更新時間（UTC） |
| created_by | UUID | NULL | 建立者 user_id |
| updated_by | UUID | NULL | 最後更新者 user_id |

**業務規則**：
- 複合 PK：`(column_name, option_value)`；新增時不分啟用 / 停用一律檢查重複（F076 BR-1）
- FK 約束：`column_name` 必須存在於 `field_whitelist` 且 `field_type = 'categorical'`（業務層強制檢查；DB 層 FK 級聯行為由 system-architect 決定，[ASSUMPTION]）
- 停用為軟刪除，MVP 不支援硬刪除（F076 BR-8）；不支援排序（F076 BR-9）
- 月名單分派 Stage 1 不 join 本表做有效性驗證（與 `field_whitelist` 同語意）
- **父表 `field_whitelist.field_type` 由 `categorical` 改為其他值時（v1.1 / 2026-05-16 修訂 / PO 決議 F076-C）**：本表既有資料**批次 SET `is_active = false` + `deactivation_reason = 'field_type_changed'`**（軟停用，不 CASCADE 刪除；F076 v1.1 BR-7 + BR-10）；F075 編輯欄位 service 層觸發批次 UPDATE，建議同 transaction 完成；既有名單若引用 inactive 值月名單分派不阻擋（沿用 F076 BR-3 不回溯規則）

**索引**：`(column_name, option_value)`（PK）、`(column_name, is_active)`（多選元件查詢）

**初始 Seed**（依 F076 §4.4，冪等以 `(column_name, option_value)` 為鍵；v1.4.3 起 column_name 小寫對齊 `ob_pool_data` PostgreSQL snake_case）：
- prod_kind：01 / 02 / 03（共 3 筆，固定）
- list_type：01 / 02 / 03（共 3 筆，固定）
- caseyear：0~6 + 99（共 8 筆，固定）
- settle_src：Y / N（共 2 筆，固定）
- spec_tp / best_case：依執行期 OBMCODEDF 動態 seed（數量不固定）
- **case_status**：01 / 02 / 03 / 04（共 4 筆，固定；v2.1 / US-125 AC-2 / F076 v1.5；業務語意對照 [F050 v2.1 §5.1.1](features/F050-create-list-definition.md#511-case_status-4-個值業務語意對照表)，取代原 F068 `ob_code_df.tbl_id='CASE_STATUS'`）
- **best_case**：Y / N（共 2 筆，固定；v2.1.1 / US-129 AC-1 / F076 v1.6；`Y` = 優質案件 / `N` = 非優質案件；承接 F050 v2.1.1 已移除之 `prod_best` 一級欄位業務語意，對應 F075 v1.6 之 `best_case` 白名單條目）

**相關功能**：[F076](features/F076-manage-categorical-field-values.md)、[F075](features/F075-manage-pooldata-field-whitelist.md)（父表）
