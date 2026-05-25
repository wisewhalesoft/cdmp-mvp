---
spec-id: error-handling
title: 錯誤處理規範
version: "1.15"
date: 2026-05-20
status: Draft
---

> **v1.15 修訂（2026-05-20 / F050 v2.1 名單定義 whitelist-driven 重構）**：(1) `#assignment-list-errors` 新增 4 個錯誤碼支援 F050 v2.1 / F051 v2.1：`CONDITION_COLUMN_NOT_IN_WHITELIST`（422，columnName 不在 F075 v1.5 白名單；拍板 1）、`RESERVED_FIELD_IN_CONDITIONS`（400，list_period_* 入 conditions 防呆；拍板 3）、`LEGACY_LIST_CONDITION_READONLY`（422，舊名單 condition_payload 寫入防呆；拍板 Q3 / 拍板 2）、`LEGACY_LIST_NOT_COPYABLE`（422，舊名單作為複製來源防呆；拍板 Q4）。(2) `LIST_FILTER_FIELD_NOT_IN_WHITELIST`（v2.0 引入）標 **DEPRECATED v2.1 + 並存**：新實作一律改用 `CONDITION_COLUMN_NOT_IN_WHITELIST`（拍板 Q1）；既有 service code rename 由 Phase 3a system-architect 安排。(3) `CASE_STATUS_REQUIRED`（v2.0 引入）標 **DEPRECATED v2.1**：v2.1 之 case_status 必填語意由 `CONDITION_COLUMN_NOT_IN_WHITELIST`（白名單驗證） + condition_payload 必填統一覆蓋（A1 / A5）。(4) `#assignment-code-errors` 表中 `CODE_IN_USE` / `CODE_TYPE_INVALID` / `CODE_NOT_FOUND` 相關功能欄補註「F068 DEPRECATED v1.3，本錯誤碼是否保留待 Phase 3a 評估（GAP-LIST §I）」。(5) `#assignment-run-warnings` 表中 `WHITELIST_OPTION_INACTIVE` 相關功能欄版號更新 F050/F051 v2.0 → v2.1。(6) 行為矩陣表補對應 4 個新錯誤碼之列。

> **v1.14 修訂（2026-05-16 / E07 合併重構 AD-E07 v3.0）**：(1) ACCOUNT 領域新增 `ACCOUNT_BUSINESS_ROLE_INVALID`（422，PATCH `/business-role` 端點傳入非允許值）取代 v1.13 之 `ACCOUNT_E07_ROLE_INVALID`；(2) ASSIGNMENT 領域新增 `E07_ROLE_NOT_ASSIGNED`（403，明示需聯絡 admin 補設）取代 `SalesManagerGuard` 攔截一般使用者時拋出之模糊 `AUTH_FORBIDDEN`；(3) `ACCOUNT_E07_ROLE_INVALID` / `ACCOUNT_E07_ROLE_FORBIDDEN`（v1.13 新增）標 **DEPRECATED**；(4) `E07_FORBIDDEN_DIRECTOR_ONLY`（v1.0 新增）標 **DEPRECATED**（v2.0 後處長存取部長專屬功能改回模糊 `AUTH_FORBIDDEN`，避免揭露功能範圍）；(5) 對應 [F006a](features/F006a-update-business-role.md)、[F002 v2.0](features/F002-user-login.md) §4.6、[F073 v2.0](features/F073-define-director-role.md) / [F074 v2.0](features/F074-define-section-chief-role.md) spec 規格。

> **v1.13 修訂（2026-05-16 / E07 重構衍生補修第三輪—§E02 整合 PO 三項決議落地）**：ACCOUNT 領域新增 2 個錯誤碼支援 `e07_role` 變更端點：(1) `ACCOUNT_E07_ROLE_INVALID`（422，`e07_role` 值不在允許列表）；(2) `ACCOUNT_E07_ROLE_FORBIDDEN`（403，非 admin 嘗試變更 `e07_role`）。**v1.14 已標 DEPRECATED**。

> **v1.12 修訂（2026-05-16 / E07 重構衍生補修—system-architect Phase 1 風險決議落地）**：6 項決議錯誤碼定義落地：(1) 新增 `FEATURE_NOT_ENABLED`（503）於 `#general-errors`（決議 #2 統一 fallback）；(2) `PERSONNEL_RATIO_OUT_OF_SCOPE` 補備註「僅適用 PUT / POST；GET 對越權 deptCode 回 200 空陣列」（決議 #4）；(3) `ASSIGNMENT_RUN_ALREADY_RUNNING` 補備註「由 `AssignmentRunGuardService.assertNoRunningRun()` 集中拋出」（決議 #6）。

# 錯誤處理規範

## HTTP 狀態碼使用規範

| 狀態碼 | 意義 | 使用場景 |
|--------|------|----------|
| 200 OK | 請求成功 | GET、PUT、PATCH 操作成功 |
| 201 Created | 資源建立成功 | POST 建立新資源成功 |
| 400 Bad Request | 請求格式錯誤 | JSON 格式錯誤、缺少必要欄位 |
| 401 Unauthorized | 未驗證或 Token 失效 | 未提供 Token、Token 過期、Token 已在 blocklist |
| 403 Forbidden | 無存取權限 | User 角色嘗試存取 Admin 端點 |
| 404 Not Found | 資源不存在 | 帳號 ID 或資料來源 ID 不存在 |
| 409 Conflict | 資源衝突 | Email 重複、資料來源名稱＋資料庫名稱組合重複 |
| 422 Unprocessable Entity | 驗證失敗 | 欄位格式不正確、業務規則違反 |
| 500 Internal Server Error | 伺服器內部錯誤 | 非預期錯誤、系統故障 |

---

## 標準錯誤回應格式

所有 API 錯誤回應必須遵循以下 JSON 結構：

```json
{
  "error": {
    "code": "AUTH_INVALID_CREDENTIALS",
    "message": "Email 或密碼錯誤",
    "details": []
  }
}
```

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| error.code | string | 是 | 機器可讀的錯誤碼，格式：`{DOMAIN}_{ERROR_NAME}` |
| error.message | string | 是 | 人類可讀的錯誤訊息（繁體中文） |
| error.details | array | 否 | 欄位層級的驗證錯誤明細（僅用於 422） |

### 欄位驗證錯誤格式（422）

當回傳 HTTP 422 時，`details` 陣列包含各欄位的驗證錯誤：

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "輸入資料驗證失敗",
    "details": [
      {
        "field": "email",
        "message": "Email 格式不正確"
      },
      {
        "field": "password",
        "message": "密碼長度不得少於 8 個字元"
      }
    ]
  }
}
```

| 欄位 | 型別 | 說明 |
|------|------|------|
| details[].field | string | 發生錯誤的欄位名稱 |
| details[].message | string | 該欄位的具體錯誤訊息 |

---

## 錯誤碼目錄

### AUTH 領域 — 驗證與登入 {#auth-errors}

| 錯誤碼 | HTTP 狀態碼 | 訊息 | 說明 | 相關功能 |
|--------|------------|------|------|----------|
| AUTH_INVALID_CREDENTIALS | 401 | Email 或密碼錯誤 | 登入時 Email 不存在或密碼錯誤。安全原則：不揭露具體錯誤原因 | F001, F002 |
| AUTH_ACCOUNT_DISABLED | 403 | 您的帳號已被停用，請聯絡管理員。 | 帳號 status = disabled 時嘗試登入 | F001, F002 |
| AUTH_TOKEN_EXPIRED | 401 | Session 已過期，請重新登入 | JWT Token 已超過有效期限 | 所有需驗證端點 |
| AUTH_TOKEN_REVOKED | 401 | Session 已失效，請重新登入 | Token 已被加入 blocklist（登出、帳號停用、密碼重設） | 所有需驗證端點 |
| AUTH_TOKEN_MISSING | 401 | 請先登入 | 請求未攜帶 Authorization header | 所有需驗證端點 |
| AUTH_TOKEN_INVALID | 401 | 驗證資訊無效，請重新登入 | Token 格式錯誤或簽章驗證失敗 | 所有需驗證端點 |
| AUTH_FORBIDDEN | 403 | 您沒有權限執行此操作 | User 角色嘗試存取 Admin 端點 | F004-F008, F010-F016 |
| AUTH_RESET_TOKEN_EXPIRED | 422 | 此連結已過期，請重新申請密碼重設 | 密碼重設 Token 已超過 24 小時有效期 | F009 |
| AUTH_RESET_TOKEN_USED | 422 | 此連結已失效 | 密碼重設 Token 已被使用過 | F009 |
| AUTH_RESET_TOKEN_INVALID | 422 | 重設連結無效 | 密碼重設 Token 不存在或格式錯誤 | F009 |

**安全原則**：

- 登入失敗時，無論是 Email 不存在或密碼錯誤，一律回傳相同的 `AUTH_INVALID_CREDENTIALS` 錯誤，不揭露 Email 是否已註冊
- 密碼重設請求時，無論 Email 是否存在，一律回傳成功訊息「若此 Email 存在，重設連結已寄出」

---

### ACCOUNT 領域 — 帳號管理 {#account-errors}

| 錯誤碼 | HTTP 狀態碼 | 訊息 | 說明 | 相關功能 |
|--------|------------|------|------|----------|
| ACCOUNT_EMAIL_EXISTS | 409 | 此 Email 已有帳號存在 | 建立帳號時 Email 重複（大小寫不敏感） | F004 |
| ACCOUNT_EMAIL_IN_USE | 409 | 此 Email 已被使用 | 編輯帳號時 Email 與其他帳號重複 | F006 |
| ACCOUNT_NOT_FOUND | 404 | 找不到指定的帳號 | 帳號 ID 不存在 | F006, F007, F008, F010 |
| ACCOUNT_SELF_DISABLE | 422 | 您無法停用自己的帳號 | Admin 嘗試停用自己 | F007 |
| ACCOUNT_LAST_ADMIN | 422 | 無法移除最後一位 Admin，系統必須至少保留一個 Admin 帳號。 | 嘗試降級唯一的 Admin | F008 |
| ACCOUNT_SELF_RESET | 422 | 請透過個人設定變更您自己的密碼 | Admin 嘗試透過管理功能重設自己密碼 | F010 |
| ACCOUNT_BUSINESS_ROLE_INVALID | 422 | 業務角色值不在允許列表 | **v1.14 / 2026-05-16 新增（E07 合併重構 AD-E07 v3.0）**：PATCH `/api/v1/accounts/:id/business-role` 端點傳入非允許值（允許值：`'director'` / `'section_chief'` / `null`，其餘一律拒絕）；`details` 含 `allowedValues` 陣列 | [F006a](features/F006a-update-business-role.md) |
| ~~ACCOUNT_E07_ROLE_INVALID~~ | ~~422~~ | ~~E07 角色值不在允許列表~~ | **v1.13 新增 / v1.14 DEPRECATED**：由 `ACCOUNT_BUSINESS_ROLE_INVALID` 取代；舊 PATCH `/api/v1/accounts/:id/e07-role` 端點已廢除 | ~~F073 §5.4, F074 §5.4~~ |
| ~~ACCOUNT_E07_ROLE_FORBIDDEN~~ | ~~403~~ | ~~您沒有權限變更此帳號的 E07 角色~~ | **v1.13 新增 / v1.14 DEPRECATED**：由既有 `AUTH_FORBIDDEN`（RolesGuard 攔截）取代；舊 PATCH `/api/v1/accounts/:id/e07-role` 端點已廢除 | ~~F073 §5.4, F074 §5.4~~ |

---

### ROLE 領域 — 角色管理 {#role-errors}

| 錯誤碼 | HTTP 狀態碼 | 訊息 | 說明 | 相關功能 |
|--------|------------|------|------|----------|
| ROLE_MODIFICATION_FORBIDDEN | 403 | 角色為系統預設，不支援自訂新增或刪除 | 嘗試透過 API 新增或刪除系統預設角色 | F045 |
| ROLE_NOT_FOUND | 404 | 找不到指定的角色 | 查詢角色時 role_code 不存在 | F045 |

---

### DATASOURCE 領域 — 資料來源管理 {#datasource-errors}

| 錯誤碼 | HTTP 狀態碼 | 訊息 | 說明 | 相關功能 |
|--------|------------|------|------|----------|
| DS_NAME_EXISTS | 409 | 相同資料庫下已存在此名稱的資料來源 | 資料來源「名稱＋資料庫名稱（databaseName）」複合重複 | F011, F013 |
| DS_NOT_FOUND | 404 | 找不到指定的資料來源 | 資料來源 ID 不存在或已軟刪除 | F013, F014, F015 |
| DS_CONNECTION_SUCCESS | — | 連線成功，回應時間 {responseTime}ms | 連線測試成功（非錯誤，為資訊性訊息） | F015 |
| DS_CONNECTION_REFUSED | — | 連線被拒：無法連至主機 {host}:{port} | 目標主機拒絕連線 | F015 |
| DS_AUTH_FAILED | — | 驗證失敗：憑證不正確 | 資料庫帳號密碼錯誤 | F015 |
| DS_CONNECTION_TIMEOUT | — | 連線逾時（10 秒） | 10 秒內無回應 | F015 |
| DS_DATABASE_NOT_FOUND | — | 找不到指定的資料庫：{databaseName} | 資料庫名稱不存在 | F015 |
| DS_UNKNOWN_ERROR | — | 連線失敗：{errorDetail} | 其他未分類的連線錯誤 | F015 |
| DATASOURCE_SCHEMA_LOAD_FAILED | 503 | 無法連線至資料來源，schema 列表載入失敗 | 查詢外部資料來源的 schema/database 列表時連線失敗（逾時、認證失敗等） | F017, F019 |
| DATASOURCE_TABLE_LOAD_FAILED | 503 | 無法連線至資料來源，table 列表載入失敗 | 查詢外部資料來源指定 schema 下的資料表列表時連線失敗（逾時、認證失敗等） | F017, F019 |

{#datasource-schema-errors}

**Schema / Table 查詢錯誤處理**：

- `GET /api/v1/datasources/:id/schemas` 與 `GET /api/v1/datasources/:id/schemas/:schema/tables` 兩個端點在連線失敗時回傳 HTTP 503
- 前端收到 503 時，顯示錯誤訊息，schema 與資料表下拉選單保持停用狀態
- 不提供手動輸入 fallback，使用者必須修復連線設定後重新嘗試
- 逾時設定：10 秒

**連線測試回應格式**：

連線測試端點 `POST /api/datasources/:id/test` 的回應格式獨立於標準錯誤格式：

```json
{
  "success": true,
  "message": "連線成功，回應時間 120ms",
  "responseTime": 120
}
```

```json
{
  "success": false,
  "message": "連線被拒：無法連至主機 192.168.1.100:3306",
  "responseTime": null
}
```

---

### EXTRACTION 領域 — 擷取任務管理 {#extraction-errors}

| 錯誤碼 | HTTP 狀態碼 | 訊息 | 說明 | 相關功能 |
|--------|------------|------|------|----------|
| EXTRACTION_NAME_EXISTS | 409 | 此名稱的擷取任務已存在 | 擷取任務名稱重複 | F017, F019 |
| EXTRACTION_NOT_FOUND | 404 | 找不到指定的擷取任務 | 擷取任務 ID 不存在或已軟刪除 | F019, F020, F021, F022, F025, F026 |
| EXTRACTION_RUNNING | 409 | 任務執行中，無法執行此操作 | 任務 status 為 running 時嘗試編輯、停用、刪除或重複觸發 | F019, F020, F021, F025 |
| EXTRACTION_DATASOURCE_NOT_FOUND | 422 | 指定的資料來源不存在或已被刪除 | 建立或編輯時指定的 datasourceId 無效 | F017, F019 |
| EXTRACTION_EXECUTION_FAILED | — | 擷取執行失敗：{errorDetail} | 擷取過程中發生錯誤（非 API 錯誤，記錄於 ExtractionLog） | F021, F023 |
| EXTRACTION_TABLE_CREATE_FAILED | — | 動態建表失敗：{errorDetail} | 首次執行時無法建立 raw data 表（metadata 讀取失敗或 DDL 執行失敗） | F021, F023 |
| EXTRACTION_BATCH_WRITE_FAILED | — | 批次寫入失敗：{errorDetail} | 批次 INSERT 過程中發生錯誤（連線中斷、約束衝突等） | F021, F023 |
| EXTRACTION_SOURCE_TABLE_NOT_FOUND | — | 來源資料表不存在：{sourceSchema}.{sourceTable} | 外部資料來源中找不到指定的來源 schema / 資料表 | F021, F023 |
| EXTRACTION_RAW_TABLE_NOT_FOUND | 404 | 此任務尚無已擷取的資料 | raw data 表不存在（任務從未成功執行），預覽 API 時回傳 | F026 |

---

### ETL_PIPELINE 領域 — ETL Pipeline 管理 {#etl-pipeline-errors}

| 錯誤碼 | HTTP 狀態碼 | 訊息 | 說明 | 相關功能 |
|--------|------------|------|------|----------|
| PIPELINE_NAME_EXISTS | 409 | 此名稱的 Pipeline 已存在 | Pipeline 名稱重複 | F028 |
| PIPELINE_NOT_FOUND | 404 | 找不到指定的 Pipeline | Pipeline ID 不存在或已軟刪除 | F027, F029, F030, F031, F032, F033, F034, F037 |
| PIPELINE_RUNNING | 409 | Pipeline 正在執行中，無法執行此操作 | Pipeline status 為 running 時嘗試重複執行或刪除 | F030, F034 |
| PIPELINE_NO_DEFINITION | 422 | Pipeline 尚未定義節點，無法執行 | 嘗試執行未設定 definition 的 Pipeline | F030 |
| PIPELINE_DRAFT_CANNOT_ENABLE | 400 | 需先發布 Pipeline 才能啟用 | 嘗試啟用無 published 版本的 Pipeline | F031 |
| PIPELINE_VERSION_NOT_FOUND | 404 | 找不到指定的版本 | 版本 ID 不存在 | F033, F037 |
| PIPELINE_PUBLISH_REQUIRES_TEST | 422 | 請先完成測試執行 | 嘗試發布尚未通過測試執行的版本 | F033, F037 |
| PIPELINE_VERSION_ALREADY_PUBLISHED | 422 | 此版本已發布 | 嘗試重複發布已是 published 狀態的版本 | F037 |
| PIPELINE_EXECUTION_FAILED | — | Pipeline 執行失敗：{errorDetail} | 執行過程中發生錯誤（非 API 錯誤，記錄於 EtlPipelineLog） | F030 |
| PIPELINE_NODE_EXECUTION_FAILED | — | 節點 {nodeName} 執行失敗：{errorDetail} | 特定節點執行失敗 | F030 |
| PIPELINE_TARGET_TABLE_NOT_FOUND | 404 | 找不到指定的目標表 | 目標表名稱不存在 | F036 |
| PIPELINE_INVALID_CONNECTION | 422 | 連線規則違反：{detail} | 不合法的節點連線（如 Load 連到 Extract） | F029 |

---

### C360 領域 — Customer 360 {#c360-errors}

| 錯誤碼 | HTTP 狀態碼 | 訊息 | 說明 | 相關功能 |
|--------|------------|------|------|----------|
| C360_CUSTOMER_NOT_FOUND | 404 | 找不到此客戶資料 | customer_id 不存在於 customer_core 表 | F046, F047 |
| C360_SEARCH_MIN_LENGTH | 422 | 搜尋關鍵字至少需要 2 個字元 | keyword 參數長度不足 2 個字元 | F046 |

---

### ASSIGNMENT 領域 — E07 客戶名單分派 {#assignment-errors}

E07 錯誤碼涵蓋名單定義、計分設定、分派比例、分派執行、快照歷史、代碼維護等七個模組。v2.0 起 RBAC 採三 Guard 體系（`DirectorOrSectionChiefGuard` / `DirectorGuard` / `SectionChiefGuard`）取代舊 `SalesManagerGuard`；錯誤碼依攔截 Guard 區分如下。

#### E07 角色權限（v2.0 / 2026-05-16 / E07 合併重構 AD-E07 v3.0） {#assignment-role-errors}

| 錯誤碼 | HTTP 狀態碼 | 訊息 | 說明 | 相關功能 |
|--------|------------|------|------|----------|
| E07_ROLE_NOT_ASSIGNED | 403 | 您尚未被指派 E07 業務角色，請聯絡系統管理員補設。 | **v1.14 / 2026-05-16 新增（E07 合併重構）**：一般使用者（`role = 'user'` AND `business_role IS NULL`）呼叫 E07 任一端點被 `DirectorOrSectionChiefGuard` 攔截；訊息明示需聯絡 admin 補設（取代舊 `AUTH_FORBIDDEN` 之模糊語意，避免使用者誤判為登入問題） | E07 全部 controller 入口 |
| ~~E07_FORBIDDEN_DIRECTOR_ONLY~~ | ~~403~~ | ~~此功能僅部長或 Admin 可操作~~ | **v1.0 新增 / v1.14 DEPRECATED**：v2.0 後處長存取部長專屬功能改回模糊 `AUTH_FORBIDDEN`（由 `DirectorGuard` 攔截），避免揭露「該功能為部長專屬」之資訊。本錯誤碼保留以供 spec 歷史追溯 | ~~F068, F069~F072, F053~F056, F061, F050, F051, F052, F075, F076, F079, F080, F081, F085, F086, F087, F089~~ |
| E07_FORBIDDEN_SECTION_CHIEF_SCOPE | 403 | 此資料不屬於您的轄區，無法存取 | 處長嘗試讀取或寫入他人轄區（`created_by != currentUserId`）之資料。Service 層 `scopeByCreator()` helper 於業務層攔截。**通用轄區錯誤碼**；F082 之個別業務比例使用更具體之 `PERSONNEL_RATIO_OUT_OF_SCOPE` | M03b 個別業務比例設定（F082 採 `PERSONNEL_RATIO_OUT_OF_SCOPE`）、M03d 準備完成階段（後續 spec） |
| PERSONNEL_RATIO_OUT_OF_SCOPE | 403 | 此業務員資料不屬於您的轄區，無法操作 | **v1.0 / 2026-05-15 / 批次 5 新增；v1.12 / 2026-05-16 / 決議 #4 補備註**：F082 處長嘗試讀取或寫入他人轄區（`ob_empl_set.created_by != currentUserId`）之業務員 RATION 設定；新 `SectionChiefScopeGuard` 攔截 request body 之 `deptCode` / `empIds` 並比對 `created_by`。**僅適用 PUT / POST**：Guard 依 HTTP method 分支執行，PUT / POST 觸發此錯誤碼回 403；**GET 不攔截**，由 service 層 `scopeByCreator(currentUserId)` 統一過濾，處長帶他人轄區 `deptCode` 時回 **200 OK + `departments = []`**（不揭露存在性），不觸發此錯誤碼 | F082 |

#### 名單定義 / 資料鎖 {#assignment-list-errors}

| 錯誤碼 | HTTP 狀態碼 | 訊息 | 說明 | 相關功能 |
|--------|------------|------|------|----------|
| LIST_NO_LIMIT_EXCEEDED | 422 | 本月（{ym}）名單定義已達 999 筆上限，無法新增 | 同月 `ob_list_definition` 紀錄超過 999 筆（OB{YYYYMM}{NNN} 格式限制，Phase 2 擴位） | F050 |
| LIST_NO_DUPLICATE | 422 | 相同產品類別（PROD_KIND）與卡別（CARD_TYPE）的有效名單已存在（LIST_NO: {conflictListNo}） | `prod_kind + card_type` 在當月 active 名單中已存在 | F050, F051 |
| ~~CASE_STATUS_REQUIRED~~ | ~~422~~ | ~~案件結清期別為必填，請至少選取一項~~ | **DEPRECATED v2.1（2026-05-20 / F050 v2.1 重構）**：v2.1 之 case_status 必填語意由 `CONDITION_COLUMN_NOT_IN_WHITELIST`（白名單驗證）+ condition_payload 必填統一覆蓋（A1 / A5）；v2.0 service code 引用本錯誤碼之 rename 由 Phase 3a system-architect 安排，新實作禁止引用 | ~~F050, F051~~（DEPRECATED） |
| CONDITION_COLUMN_NOT_IN_WHITELIST | 422 | 篩選條件欄位 `{columnName}` 不在 POOLDATA 篩選欄位白名單或已停用 | **v2.1（2026-05-20 / F050 v2.1 重構，拍板 1）**：F050 v2.1 / F051 v2.1 寫入名單時，`condition_payload.conditions[].columnName` 未存在於 F075 v1.5 `pooldata_field_whitelist` 或對應欄位 `is_active = false`；service 層校驗（即使前端 dropdown 已過濾，後端仍驗，defense-in-depth）；details 含不合法之 `columnName`。**對應 GAP-LIST §A3 解除**。**取代** v2.0 之 `LIST_FILTER_FIELD_NOT_IN_WHITELIST`（已標 DEPRECATED） | F050 v2.1, F051 v2.1 |
| RESERVED_FIELD_IN_CONDITIONS | 400 | 以下欄位為一級保留欄位，不可納入篩選條件：`{reservedFields}` | **v2.1（2026-05-20 / F050 v2.1 重構，拍板 3 / J8）**：F050 v2.1 / F051 v2.1 寫入名單時，`condition_payload.conditions[].columnName` 含 `list_period_start` / `list_period_end` / `list_interval`（保留為一級欄位）；後端 defense-in-depth 校驗（前端 dropdown 不列出此三個欄位）；details 含 `reservedFields: string[]` | F050 v2.1, F051 v2.1 |
| LEGACY_LIST_CONDITION_READONLY | 422 | 此名單使用舊格式儲存（condition_payload IS NULL），篩選條件須由系統 backfill migration 後方可編輯 | **v2.1（2026-05-20 / F050 v2.1 重構，拍板 Q3 / 拍板 2 / US-123 AC-2）**：F051 v2.1 對 `condition_payload IS NULL` 之舊遷移名單寫入 `conditionPayload` 時觸發；defense-in-depth（前端編輯頁該區塊已 read-only 呈現）；E2 backfill 由 Phase 3a system-architect 一次性執行，**無 per-user confirm 轉換流程** | F051 v2.1 |
| LEGACY_LIST_NOT_COPYABLE | 422 | 來源名單使用舊格式儲存，不可作為複製來源；請先等待系統完成資料轉換 | **v2.1（2026-05-20 / F050 v2.1 重構，拍板 Q4 / US-123 衍生）**：F050 v2.1 「從上月複製」流程，來源名單 `condition_payload IS NULL` 時觸發；defense-in-depth（前端來源 dropdown 已過濾 condition_payload 非 NULL 之名單）；details 含 `copyFromListNo` | F050 v2.1 |
| ASSIGNMENT_LIST_NOT_FOUND | 404 | 找不到指定的名單定義 | `list_no` 不存在於 `ob_list_definition` | F049, F051, F052, F060 |
| ASSIGNMENT_LIST_INACTIVE | 422 | 已停用名單不可編輯 | 嘗試編輯 `status = 'inactive'` 的名單 | F051 |
| ASSIGNMENT_LIST_ALREADY_INACTIVE | 422 | 名單已處於停用狀態，無需重複操作 | 嘗試停用已 inactive 的名單 | F052 |
| WORK_YM_OUT_OF_RANGE | 422 | 作業月份 {ym} 超出可選範圍（{rangeMin} ~ {rangeMax}） | request `ym` query 或 body `project_workym` 超出 `current_work_ym ± 12 個月`；同樣適用於 GET 列表 / current-work-ym 與所有 M01 寫入端點。範圍規則見 [data-model.md#current-work-ym-rule](data-model.md#current-work-ym-rule)（v1.0 / 2026-05-15 / F077 v1.0 引入） | F048, F050, F051, F052, F060, F061, F077, 後續 M03a~d 寫入 spec |
| WORK_YM_INVALID_FORMAT | 422 | 作業月份格式錯誤，需為 6 位 YYYYMM | request 之 `ym` 非 6 位數字格式；前端阻擋後的後端保護（v1.0 / 2026-05-15 / F077 v1.0 引入） | F048, F077, 所有引用 `ym` 之 M01 / M03 / M04 端點 |
| LIST_HISTORICAL_READONLY | 403 | 歷史月份資料為唯讀，不可修改 | 任一 M01 / M03 / M04 寫入端點之 `request.project_workym < current_work_ym`；GET 端點不受影響。Guard 於各下游 controller 寫入路徑統一攔截。規則來源見 [F077 §6 BR-3](features/F077-month-switch-and-stage-overview.md) 與 [data-model.md#current-work-ym-rule](data-model.md#current-work-ym-rule)（v1.0 / 2026-05-15 / F077 v1.0 引入） | F050, F051, F052, F060, F061, F077, 後續 M03a~d 寫入 spec |
| LIST_FILTER_FIELD_NOT_IN_WHITELIST | 422 | 篩選條件欄位 `{columnName}` 不在 POOLDATA 白名單或已停用 | **DEPRECATED v2.1（2026-05-20 / F050 v2.1 重構，拍板 Q1）**：請改用 `CONDITION_COLUMN_NOT_IN_WHITELIST`（語意完全相同；拍板 1 命名）；本錯誤碼 v2.1 起新實作不再拋出，僅保留供既有 service code 過渡，由 Phase 3a system-architect 安排 rename。原語意：F050 v2.0 / F051 v2.0 寫入名單時，`condition_payload.conditions[].columnName` 未存在於 F075 白名單或 `is_active = false`；service 層校驗（v2.0 / 2026-05-15 / E07 重構批次 3 引入）| ~~F050 v2.0, F051 v2.0~~（DEPRECATED；新版見 `CONDITION_COLUMN_NOT_IN_WHITELIST`）|

#### 名單階段流轉 / 推進與 Rollback（v2.0 / 2026-05-15 / E07 重構批次 3；v2.1 / 2026-05-15 / 批次 4 新增推進前置條件與 Rollback 錯誤碼） {#assignment-stage-transition-errors}

| 錯誤碼 | HTTP 狀態碼 | 訊息 | 說明 | 相關功能 |
|--------|------------|------|------|----------|
| LIST_STAGE_NOT_DRAFT | 422 | 目前階段（{currentStage}）禁止此操作，請先 Rollback 至草稿階段 | 對非 `stage = 'draft'` 名單執行「停用」（F052 v2.0）或「推進至部門比例設定」（F078）等限草稿階段操作；service 層於業務動作前檢查 `stage` 欄位 | F052 v2.0, F078 |
| LIST_STAGE_TRANSITION_FORBIDDEN | 422 | 目前階段（{currentStage}）禁止編輯本欄位 / 比例，請先 Rollback 至對應階段 | 通用「stage 不匹配」拒絕回應；用於描述「推進後欄位 / 資料鎖定」之拒絕。對應 F051 v2.0 BR-3（草稿名單篩選條件 / CR 鎖定）、F079 BR-3（非 `dept_ratio` 階段拒絕寫入部門比例）、F077 BR-9 角色 × 階段操作矩陣；後續 M03b/c/d spec 沿用 | F051 v2.0, F079, 後續 M03b/c/d 寫入 spec |
| LIST_DRAFT_NO_CONDITIONS | 422 | 草稿名單未設定任何篩選條件，無法推進至部門比例設定階段 | F078 推進前置條件檢查 `condition_payload.conditions` 為空；理論上不會觸發（F050 v2.0 / F051 v2.0 已強制至少 1 個），作為防呆 | F078 |
| LIST_DRAFT_ADVANCE_BLOCKED_LEGACY_F059 | 500 | 系統偵測到 F059 舊路徑程式碼仍存在，無法執行 E07 重構批次 3 新流程；請聯繫 IT 確認部署完整性 | **原子性上線 gating（Invariant I-1）**：feature flag `ENABLE_E07_REFACTOR_PHASE3 = true` 但啟動時 / runtime 偵測到 F059 OBASSIGNSET 全域 CR 開關之程式碼路徑仍存在；F050 v2.0 / F078 端點一律拒絕；非典型業務錯誤，僅作為部署防呆。詳見 [F050 v2.0 §13](features/F050-create-list-definition.md#13-原子性上線約束invariant-i-1最高優先級) | F050 v2.0, F078 |
| STAGE_ADVANCE_PRECONDITION_FAILED | 422 | 前置條件未達成：{description} | **通用「推進前置條件失敗」錯誤碼（v2.1 / 2026-05-15 / 批次 4 新增）**：用於描述「stage 推進操作」之前置條件驗證失敗，含 `details.reason` 與 stage-specific 細節欄位。F080（M03a → M03b）採此錯誤碼描述「部門比例為空（`dept_ratio_empty`）」與「部門比例加總不等於 100%（`dept_ratio_sum_not_100`，含 `details.actualSum`）」；後續 M03b/c/d 推進 spec 沿用此錯誤碼描述各階段前置條件失敗 | F080, 後續 M03b/c/d 推進 spec |
| STAGE_ROLLBACK_BLOCKED | 422 | 當前階段不可 Rollback：{description} | **通用「Rollback 阻擋」錯誤碼（v2.1 / 2026-05-15 / 批次 4 新增；v2.2 / 2026-05-15 / 批次 5 沿用至 F085；v2.3 / 2026-05-15 / 批次 6 沿用至 F089）**：用於描述「stage Rollback 操作」之拒絕回應，含 `details.reason`：(1) `already_at_first_stage` — 草稿階段為流程第一階段，不可 Rollback（F081 BR-2）；(2) `wrong_source_stage` — 端點專屬 source stage 不匹配（如 F081 端點僅接受 `stage = 'dept_ratio'`、F085 端點僅接受 `stage = 'personnel_ratio'`、F089 端點僅接受 `stage = 'ready'`），含 `details.currentStage` / `details.expectedStage` | F081, F085, F089 |
| MONTHLY_RUN_BLOCKED_LIST_NOT_READY | 422 | 以下 {N} 份 active 名單尚未就緒（stage != 'ready'），請先完成簽核：{listSummary} | **v1.0 / 2026-05-15 / 批次 6 新增（F061 v1.1 引入；OQ Q6.1=A 用戶決議落地）**：F061 月跑觸發前置條件 AC-1 第 2 項驗證失敗（任一 active 名單之 `stage != 'ready'`）；details 含 `notReadyLists` 陣列：`[{ listNo, listNm, currentStage, stageLabel }]`；草稿名單（`stage = 'draft'`）不計入此檢查（沿用 F088 BR-5 / F061 BR-5 「active 名單」定義）| F061 v1.1, F088 |

#### 簽核階段（M03c）{#assignment-approval-errors}

> **v1.0 / 2026-05-15 / 批次 6 新增**：對應 F086（核准）、F087（拒絕）。簽核階段二分法（核准 / 拒絕）之專屬錯誤碼。

| 錯誤碼 | HTTP 狀態碼 | 訊息 | 說明 | 相關功能 |
|--------|------------|------|------|----------|
| APPROVAL_INVALID_STAGE | 422 | 目前階段（{currentStage}）無法執行核准 / 拒絕，僅 `stage = 'approval'` 之名單可操作 | **v1.0 / 2026-05-15 / 批次 6 新增**：F086 / F087 端點之 stage 不匹配拒絕（`assertStageEquals(listNo, 'approval')` 失敗）；details 含 `currentStage` / `expectedStage = 'approval'`。理論上前端按鈕已隱藏非 approval 階段之核准 / 拒絕按鈕，本錯誤碼作為 API 防呆 | F086, F087 |
| APPROVAL_REJECT_REASON_REQUIRED | 422 | 拒絕原因為必填，請填寫拒絕原因 | **v1.0 / 2026-05-15 / 批次 6 新增**：F087 拒絕端點之 request body `rejectReason` 為空 / 全空白 / NULL / 缺欄位；後端 service 層校驗 | F087 |
| APPROVAL_REJECT_REASON_TOO_LONG | 422 | 拒絕原因超過 500 字上限（目前 {actualLength} 字），請精簡內容 | **v1.0 / 2026-05-15 / 批次 6 新增**：F087 拒絕端點之 `rejectReason` 長度 > 500 字；details 含 `actualLength` 與 `maxLength = 500`；前端 textarea 應於 > 500 字時即時阻擋 | F087 |

#### 計分設定 {#assignment-scoring-errors}

| 錯誤碼 | HTTP 狀態碼 | 訊息 | 說明 | 相關功能 |
|--------|------------|------|------|----------|
| SCORING_VERSION_NOT_FOUND | 404 | 目前無生效的計分版本，請聯繫 IT 確認設定 | `ob_levelcard_version` 無 `status = 'active'` 紀錄 | F053 |
| SCORING_COLUMN_NOT_FOUND | 404 | 指定的計分維度不存在或已停用 | `(card_type, card_version, column_name)` 組合不存在於 `ob_levelcard_column`，或 `status = 'inactive'` | F054 |
| SCORING_VERSION_LOCKED | 409 | 分派執行中，無法修改計分設定 | 月跑 `pending` / `running` 期間嘗試修改計分設定 | F054, F055, F056, F070, F071, F072 |
| SCORING_COLUMN_DUPLICATE | 422 | 計分維度 column_name `{columnName}` 已存在於 active 版本 | 新增維度時 `column_name` 已存在於同 `card_type + card_version` 的 `status = 'active'` 紀錄 | F054 |
| SCORING_RANGE_OVERLAP | 422 | 分數區間重疊，請調整條件值 | 分數區間或 CARD_LEVEL 門檻區間重疊 | F054, F055 |
| SCORING_INVALID_MATCH_TYPE | 422 | 比對模式（match_type）值不合法，允許值：CATEGORY / RANGE / COMPOSITE | **v1.3 / 2026-05-18 新增（F054 v1.3）**：PUT `/scoring/dimensions` 請求傳入的 `matchType` 不在允許列表；`details` 含 `allowedValues: ['CATEGORY','RANGE','COMPOSITE']` | F054 v1.3 |
| SCORING_MATCH_TYPE_FIELD_MISMATCH | 422 | 比對模式與欄位值不一致，CATEGORY 模式不可填入 level2_s/level2_e，RANGE 模式不可填入 level1 | **v1.3 / 2026-05-18 新增（F054 v1.3）**：PUT `/scoring/dimensions` 請求中 `matchType` 與同請求所附 score rows 之 level1 / level2_s / level2_e 填值規則衝突（如 `matchType=CATEGORY` 但 score 帶 `level2_s`）；詳細規則見 data-model.md ob_levelcard_score match_type 對應規則；`details` 含 `matchType` / `conflictField` / `conflictValue` | F054 v1.3 |
| SCORING_CATEGORY_DUPLICATE | 422 | CATEGORY 模式下 level1 值 `{level1}` 重複，同一維度之類別值不可重複 | **v1.3 / 2026-05-18 新增（F054 v1.3）**：PUT `/scoring/dimensions` 請求中 `matchType=CATEGORY` 時，同一 `(card_type, card_version, column_name)` 下出現相同 `level1` 值超過一筆；`details` 含 `columnName` / `duplicateLevel1` | F054 v1.3 |
| TIER_LEVEL_DUPLICATE | 422 | TIER_LEVEL 代碼 {code} 已存在 | 新增 TIER_LEVEL 對應時 `(card_type, card_level)` 複合 PK 重複；含 fallback 重複情境（同 CARD_TYPE 已存在 `card_level IS NULL` 的 fallback 列再新增另一筆 fallback） | F056 |
| CARD_LEVEL_NOT_FOUND_IN_VERSION | 422 | 指定的 CARD_LEVEL 不存在於 active 計分版本 | TIER_LEVEL 對應（新增 / 編輯）指向之 `(card_type, card_level)` 組合不存在於 active 版本的 `ob_levelcard_level`，或 `card_level` 輸入超過 1 字元（VARCHAR(1) vs VARCHAR(5) 不對稱保護，見 F056 BR-9）。Fallback 場景 `card_level IS NULL` 不觸發此驗證（F056 AC-4a）。v1.5 新關聯：適用於選定 CARD_TYPE 之 active `ob_levelcard_level` 範圍內查找；CARD_TYPE 範圍鎖由 `CARD_TYPE_NOT_FOUND` 另行檢查 | F056 §5.2 / §5.3 |
| CARD_LEVEL_RECORD_NOT_FOUND | 404 | 指定的 CARD_LEVEL 紀錄不存在 | DELETE CARD_LEVEL 時 `ob_levelcard_level` 中無對應 `(cardType, cardVersion, cardLevel)` 複合 PK 紀錄 | F055 §5.3 |
| CARD_LEVEL_DUPLICATE | 422 | 等級代碼 {cardLevel} 已存在於選中計分版本 | 新增 CARD_LEVEL 時 `(card_type, card_version, card_level)` 複合 PK 已存在於 `ob_levelcard_level` 當前存活紀錄；hard delete 後同 cardLevel 可重新新增不觸發（F055 BR-9） | F055 §5.4 |
| CARD_LEVEL_REFERENCED | 409 | 等級 {cardLevel} 仍被 TIER_LEVEL 對應引用，請先於 F056 移除對應後再刪除 | DELETE CARD_LEVEL 前的 cascade reference check：`ob_tier WHERE card_type = :cardType AND card_level = :cardLevel` 仍有紀錄存在（F055 BR-6 / AC-7） | F055 |
| TIER_MAPPING_NOT_FOUND | 404 | 指定的 (cardType, cardLevel) TIER 對應不存在 | DELETE TIER 對應時 `ob_tier` 無對應 `(card_type, card_level)` 紀錄（含 fallback NULL 紀錄）；F056 §5.4 | F056 |
| CARD_TYPE_DUPLICATE | 422 | 計分卡代碼 {cardType} 已存在，請使用其他代碼 | F070 新增 CARD_TYPE 時 `card_type` 與 `ob_card_type.status = 'active'` 既有紀錄重複；唯一性檢查範圍僅 active scope | F070 |
| CARD_TYPE_NOT_FOUND | 404 | 找不到指定的計分卡類型 | F069 / F071 / F072 操作目標 cardType 不存在於 `ob_card_type` active 紀錄；F053 / F054 / F055 / F056 之 cardType query / body 不存在於 `ob_card_type.status = 'active'`（v1.5 新增的 CARD_TYPE 範圍鎖檢查） | F069, F071, F072, F053, F054, F055, F056 |
| CARD_TYPE_CASCADE_NOT_CONFIRMED | 422 | 級聯刪除需要二次確認，請於請求帶上 `confirmCascade=true` | F072 DELETE 請求缺少 `confirmCascade=true` query；用於阻擋誤觸刪除 | F072 |
| TIER_LEVEL_INVALID_ENUM | 422 | TIER_LEVEL 必須為 T1~T10 之一，目前值：{value} | F056 v1.5+ TIER_LEVEL 寫入端點（POST / PUT）之 `tierLevel` 不在固定列舉 T1~T10 範圍內；讀取端點不阻擋舊資料顯示 | F056 |
| CARD_TYPE_FALLBACK_STANDARD_MUTEX | 422 | 同一 CARD_TYPE 不可同時存在 Fallback（CARD_LEVEL 為空）與 Standard 對應，請先移除既有列再新增 | F056 v1.5+ 違反 Fallback / Standard 互斥規則：同 CARD_TYPE 已有 `card_level IS NULL` fallback 列時禁止新增 standard 列；反之亦然。檢查時機：5.2 PUT 批次（含 body 內互斥 + body 與 DB 互斥）、5.3 POST 單筆（新增前 query DB） | F056 |

#### 分派比例 {#assignment-ratio-errors}

| 錯誤碼 | HTTP 狀態碼 | 訊息 | 說明 | 相關功能 |
|--------|------------|------|------|----------|
| RATIO_SUM_NOT_100 | 422 | LIST_NO {listNo} 部門比例加總為 {sum}%，需調整至 100%（容忍 ±0.01%） | **v1.0 / 2026-05-15 / 批次 4 新增（取代 F060 之 `RATIO_SUM_INVALID`）**：`ob_dept_pct` 同 `(project_workym, list_no)` 下 `ration` 加總超出 [99.99, 100.01] 容忍範圍（沿用 Invariant I-8）；F079 PUT 寫入時觸發；後續 M03b 個別業務比例 spec 可沿用此錯誤碼或衍生 `PERSONNEL_RATIO_SUM_NOT_100` | F079, 後續 M03b spec |
| RATIO_OUT_OF_RANGE | 422 | 比例需介於 0 到 100 之間，目前值：{value} | **v1.0 / 2026-05-15 / 批次 4 新增**：單一 RATION 欄位超出 [0, 100] 區間（含負數）；F079 PUT 寫入時觸發 service 層校驗；後續 M03b 個別業務比例 spec 沿用 | F079, 後續 M03b spec |
| RATIO_SUM_INVALID | 422 | LIST_NO {listNo} 部門比例加總為 {sum}%，需調整至 100% | `[DEPRECATED v2.0 / 2026-05-15]` 原 F060 v1.x 之錯誤碼；由 `RATIO_SUM_NOT_100` 取代（新版含容忍 ±0.01% 浮點誤差說明）；保留以供 F060 廢棄前殘留實作參照，新實作禁止引用 | ~~F060 v1.x DEPRECATED~~ |
| PERSONNEL_RATIO_SUM_NOT_100 | 422 | 部門 {deptCode} 個別業務比例加總為 {sum}%，需調整至 100%（容忍 ±0.01%） | **v1.0 / 2026-05-15 / 批次 5 新增（取代 `PERSONNEL_RATIO_SUM_INVALID`）**：`ob_empl_set` 同 `(list_no, deptid_m)` 下 `ration` 加總超出 [99.99, 100.01] 容忍範圍（per-DEPT 驗證；沿用 Invariant I-8）；F082 PUT 寫入時觸發。**注意**：與 `RATIO_SUM_NOT_100`（per-LIST_NO）語意不同；本錯誤碼為 per-DEPT 加總 | F082 |
| PERSONNEL_RATIO_DEPT_NOT_FOUND | 422 | 部門 {deptCode} 尚未於部門比例設定階段配置，無法設定個別業務比例 | **v1.0 / 2026-05-15 / 批次 5 新增**：F082 PUT 寫入前，service 層查詢 `ob_dept_pct WHERE (project_workym, list_no, obdeptid = :deptCode)` 不存在；理論上不會觸發（F080 推進已驗證部門比例加總 = 100% 即所有 `ob_dept_pct` 紀錄齊備），作為防呆 + Rollback 後資料一致性保護 | F082 |
| BONUS_PENALTY_TEMPLATE_INVALID | 422 | 模板套用結果違反加總或單欄位邊界 | **v1.0 / 2026-05-15 / 批次 5 新增**：F082 PUT 收到 `appliedTemplate` 欄位時，service 層額外驗證套用結果之 per-DEPT 加總 100% 與單欄位 [0, 100]；不合法回此錯誤碼（前端 bug 防呆，正常流程不應觸發）；details 含 `template` / `targetEmpId` / `actualSum` | F083（透過 F082 PUT 觸發）|
| PERSONNEL_RATIO_SUM_INVALID | 422 | 部門 {deptId} 人員比例加總為 {sum}%，需調整至 100% | `[DEPRECATED v2.0 / 2026-05-15]` 原 F058 v1.x 之錯誤碼；由 `PERSONNEL_RATIO_SUM_NOT_100` 取代（新版含容忍 ±0.01% 浮點誤差說明 + per-DEPT 語意明確）；保留以供 F058 廢棄前殘留實作參照，新實作禁止引用 | ~~F058 v1.x DEPRECATED~~ |

#### 分派執行 {#assignment-run-errors}

| 錯誤碼 | HTTP 狀態碼 | 訊息 | 說明 | 相關功能 |
|--------|------------|------|------|----------|
| ASSIGNMENT_RUN_ALREADY_RUNNING | 409 | 分派執行中（run_id: {currentRunId}），請等待完成後再觸發 | 同月已有 `status IN ('pending', 'running')` 紀錄時嘗試觸發新月跑，或於月跑執行中嘗試修改任何 E07 設定。**v1.12 / 2026-05-16 / 決議 #6 補備註**：由 `AssignmentRunGuardService.assertNoRunningRun(workYm?)` 集中拋出（assignment 模組底下，與 `StageTransitionService` 同層）；所有 E07 寫入 service method 最頂層呼叫此 guard；月跑結束（`status = 'completed'` / `'failed'`）後自動解除阻擋。套用範圍：F050 v2.0 / F051 / F052 / F078 / F079 / F080 / F081 / F082 v1.3 / F083（透過 F082 PUT）/ F084 / F085 / F086 / F087 / F089。**v1.16 / 2026-05-25 / F084 v2.0 auto-advance 補備註**：F084 v2.0 auto-advance 路徑（附著於 F082 PUT 同一 tx）偵測到月跑進行中時，**不回 409**、不 rollback 該次 PUT，而由 F082 PUT response 之 `autoAdvanceFailReason: "ASSIGNMENT_RUN_ALREADY_RUNNING"` 字串攜帶此碼語意，PUT 本身仍回 200（詳 [F084 §5.2 / BR-15](features/F084-advance-to-approval.md#52-auto-advance-觸發流程主路徑無獨立-endpoint)）；F084 手動 fallback 端點與其他 E07 寫入端點仍正常拋 409 | F048-F052, F054-F060, F061, F068, F078-F089 |
| ASSIGNMENT_RUN_PRECHECK_FAILED | 422 | 前置條件未滿足：{details} | 月跑 Stage 0 前置條件檢查失敗（5 項任一未通過） | F061 |
| ASSIGNMENT_RUN_NOT_FOUND | 404 | 找不到該月跑紀錄或快照不完整 | `run_id` 不存在於 `assignment_run`，或 `assignment_run_snapshot` 三份快照不完整 | F062, F063, F064, F066, F067 |
| ASSIGNMENT_RUN_NOT_COMPLETED | 422 | 月跑尚未完成，該操作不可用 | 對 `status != 'completed'` 的月跑執行結果查詢、匯出等操作 | F063, F064 |
| ASSIGNMENT_RUN_NOT_COMPARABLE | 422 | 僅 completed 狀態的月跑可比對 | 比對操作的任一 `run_id` 非 `completed` 狀態 | F067 |

#### 月跑警告紀錄（非 HTTP 錯誤碼）{#assignment-run-warnings}

> **v1.11 / 2026-05-16 / 衍生補修新增**：以下「警告紀錄」為月跑流程內偵測到之非錯誤狀況，**不回傳 HTTP 錯誤碼**；月跑仍可正常 `status = 'completed'`，警告內容寫入 `assignment_run.report_payload` JSONB 欄位供前端展示。前端 F062 / F063 / F050 / F051 應依下列警告碼決定 UI 提示樣式（黃色 banner / toast / 輕量 inline 警示）。

| 警告碼 | 觸發階段 | 訊息 | 說明 | 相關功能 |
|--------|---------|------|------|----------|
| RUN_REPORT_SKIPPED_CASES | F061 月跑 Stage 2 計分 | 月跑完成，但有 {skippedCaseCount} 筆案件因無對應計分卡（邊緣 CARD_TYPE）被跳過 | **v1.0 / 2026-05-16 / OQ-E07-29-A 落地（F061 v1.2 引入）**：Stage 2 遭遇無計分規則之邊緣 CARD_TYPE（如 HB / SEB / SEC），跳過該案件不拋錯；月跑仍 `status = 'completed'`；跳過案件清單儲存於 `assignment_run.report_payload.skippedCases[]` JSONB（結構詳見 [F061 BR-13](features/F061-trigger-assignment-run.md#6-商業規則)）；前端可於 F062 / F063 顯示黃色警示 banner，提供「查看跳過案件清單」展開連結 | F061 v1.2, F062, F063 |
| WHITELIST_OPTION_INACTIVE | 月跑 Stage 1 預檢 / F050 / F051 名單儲存 | 名單條件引用之可選值「{optionValue}」（{columnName}）已被停用 | **v1.0 / 2026-05-16 / 衍生補修新增；v1.15 / 2026-05-20 引用版號更新**：F076 v1.5 將某 categorical 欄位之可選值軟停用（`is_active = false`）後，既有名單若引用 inactive 值，**月跑 Stage 1 不阻擋**（沿用 F076 v1.5 BR-4 不回溯規則）；可於月跑報告 `report_payload.warnings[]` 補 warning 條目，或於 F050 v2.1 / F051 v2.1 名單儲存時於 response body 附加 `warnings: [{ code: "WHITELIST_OPTION_INACTIVE", affectedFields: [...] }]`（F050 v2.1 BR-9 / F051 v2.1 BR-12；非阻擋儲存）。**非 HTTP 錯誤碼**；前端應於名單編輯頁列出受影響條件值；後端不主動清理 `condition_payload` 之 inactive 值（由業務手動處理）| F076 v1.5, F050 v2.1, F051 v2.1, F061 |
| SCORING_INTEGRITY_WARN | F061 月跑 Stage 2 前（`ScoringIntegrityCheckService`）| 計分設定完整性警告：{affectedCount} 個維度之 match_type 與 score 記錄不一致，月跑繼續但結果可能有誤 | **v1.3 / 2026-05-18 / F061 v1.3 新增（非 HTTP 錯誤碼）**：Stage 2 執行前，`ScoringIntegrityCheckService.checkAndWarn()` 稽核所有 active 版本之 `ob_levelcard_column` 與對應 `ob_levelcard_score`；若發現 `MATCH_TYPE_FIELD_MISMATCH`（match_type 與 level1 / level2_s 填值規則衝突）或 `CATEGORY_DUPLICATE`（同 column_name 下 level1 重複），**不拋錯、月跑繼續**；警告寫入：(a) `assignment_audit_log`（`action = 'SCORING_INTEGRITY_WARN'`，JSONB 含 issues 陣列）；(b) `assignment_run.report_payload.warningSummary.SCORING_INTEGRITY_WARN`（含 `affectedCount` + `details[]`）；前端 F062 / F063 結果頁於 `warningSummary.SCORING_INTEGRITY_WARN.affectedCount > 0` 時顯示黃色 integrity 警示 banner，提示業務人員至 M02 計分設定頁修正 | F061 v1.3, F062, F063, F054 |

**前端展示建議**：
- `RUN_REPORT_SKIPPED_CASES`：F062 進度頁完成後 / F063 結果摘要頁頂部，黃色 banner「⚠ 月跑完成，但有 N 筆案件被跳過」+「查看詳情」按鈕展開 `report_payload.skippedCases[]` 清單
- `WHITELIST_OPTION_INACTIVE`：F050 / F051 名單編輯頁之篩選條件區塊，受影響條件值旁顯示「⚠ 已停用」標籤；F062 月跑完成後若有此警告，於結果摘要頁顯示「{N} 份名單之條件含已停用可選值（不影響月跑結果）」

---

#### Stage 0 試算 / 匯出 {#assignment-misc-errors}

| 錯誤碼 | HTTP 狀態碼 | 訊息 | 說明 | 相關功能 |
|--------|------------|------|------|----------|
| STAGE0_ESTIMATE_TIMEOUT | 500 | 試算查詢超過 10 秒 timeout，請稍後再試或聯繫 IT 檢查索引 | Stage 0 單一 LIST_NO 試算超時 | F049 |
| EXPORT_FILE_EXPIRED | 500 | 檔案產生逾時（超過 5 分鐘），請稍後再試或聯繫 IT | 分派結果匯出超時 | F064 |

#### 代碼維護 {#assignment-code-errors}

| 錯誤碼 | HTTP 狀態碼 | 訊息 | 說明 | 相關功能 |
|--------|------------|------|------|----------|
| CODE_IN_USE | 422 | 代碼值 {tblCd} 在類別 {tblId} 中已存在 | 新增代碼時 `(tbl_id, tbl_cd)` 組合重複（啟用期間內）。**v1.15 補述（2026-05-20）**：F068 已 DEPRECATED v1.3（F050 v2.1 重構 / J2），本錯誤碼是否保留待 Phase 3a system-architect 評估（GAP-LIST §I） | F068（**DEPRECATED v1.3**）|
| CODE_TYPE_INVALID | 422 | 本功能僅支援 PROD_KIND / SPEC_TP / CASE_STATUS 三類代碼維護 | API 傳送的 `tbl_id` 不在允許清單（PROD_KIND / SPEC_TP / CASE_STATUS）中；含 `CASEYEAR` 亦回此錯誤（CASEYEAR 為 F050/F051 前端 hard-coded 11 個固定選項，不入 ob_code_df，OQ-E07-24 Resolved 2026-05-12）。**v1.15 補述（2026-05-20）**：F068 已 DEPRECATED v1.3，本錯誤碼是否保留待 Phase 3a 評估（GAP-LIST §I） | F068（**DEPRECATED v1.3**）|
| CODE_NOT_FOUND | 404 | 找不到指定的代碼 | `(tbl_id, tbl_cd)` 組合不存在於 `ob_code_df`。**v1.15 補述（2026-05-20）**：F068 已 DEPRECATED v1.3，本錯誤碼是否保留待 Phase 3a 評估（GAP-LIST §I） | F068（**DEPRECATED v1.3**）|
| WHITELIST_FIELD_DUPLICATE | 422 | 欄位名稱 {columnName} 已存在於白名單，請確認是否需重新啟用停用欄位 | F075 新增白名單欄位時 `column_name` 已存在於 `field_whitelist`（無論啟用或停用） | F075 §5.2 |
| WHITELIST_FIELD_NOT_FOUND | 404 | 找不到指定的白名單欄位 | F075 / F076 操作目標 `columnName` 不存在於 `field_whitelist` | F075 §5.3~5.5、F076 §5.1~5.4 |
| OPTION_VALUE_DUPLICATE | 422 | 此可選值已存在（狀態：{startus}），如需重新使用請改為啟用操作 | F076 新增可選值時 `(column_name, option_value)` 已存在於 `categorical_field_value`（無論啟用或停用） | F076 §5.2 |
| OPTION_VALUE_NOT_FOUND | 404 | 找不到指定的可選值 | F076 操作 `(column_name, option_value)` 不存在於 `categorical_field_value` | F076 §5.3~5.4 |
| OPTION_FIELD_TYPE_MISMATCH | 422 | 此欄位非類別型（categorical），無可選值維護 | F076 對 `field_whitelist.field_type != 'categorical'` 之欄位呼叫可選值端點 | F076 §5.1~5.4 |

---

### VALIDATION 領域 — 通用驗證 {#validation-errors}

| 錯誤碼 | HTTP 狀態碼 | 訊息 | 說明 | 相關功能 |
|--------|------------|------|------|----------|
| VALIDATION_ERROR | 422 | 輸入資料驗證失敗 | 一個或多個欄位驗證未通過，詳見 details | 所有含表單的功能 |
| VALIDATION_REQUIRED | 422 | {field} 為必填欄位 | 必填欄位為空 | 所有含表單的功能 |
| VALIDATION_EMAIL_FORMAT | 422 | Email 格式不正確 | Email 不符合 RFC 5322 基礎規範 | F004, F006 |
| VALIDATION_PASSWORD_LENGTH | 422 | 密碼長度不得少於 8 個字元 | 密碼短於 8 字元 | F004, F009, F010 |
| VALIDATION_PORT_RANGE | 422 | 連接埠必須介於 1 到 65535 之間 | 連接埠超出有效範圍 | F011, F013 |
| VALIDATION_PORT_NUMBER | 422 | 連接埠必須為數字 | 連接埠為非數值 | F011, F013 |
| VALIDATION_INVALID_ROLE | 422 | 角色值無效，必須為系統定義的 2 種角色之一 | 角色值不在允許的 2 種 role_code 中（admin、user） | F004, F008, F045 |
| VALIDATION_INVALID_TYPE | 422 | 資料來源類型必須為 mysql、postgresql 或 sqlserver | 類型值不在允許的列舉範圍內 | F011, F013 |
| VALIDATION_INVALID_STATUS | 422 | 狀態必須為 active 或 disabled | 帳號狀態值不在允許的列舉範圍內 | F007 |
| VALIDATION_INVALID_MODE | 422 | 擷取模式必須為 full 或 incremental | 模式值不在允許的列舉範圍內 | F017, F019 |
| VALIDATION_INCREMENTAL_COLUMN_REQUIRED | 422 | 增量模式必須指定增量欄位 | 增量模式下 incrementalColumn 為空 | F017, F019 |
| VALIDATION_INVALID_CRON | 422 | 排程格式不正確，請輸入合法的 cron 表達式 | cron 表達式格式不合規 | F017, F019 |

---

### SYSTEM 領域 — 系統錯誤 {#system-errors}

| 錯誤碼 | HTTP 狀態碼 | 訊息 | 說明 | 相關功能 |
|--------|------------|------|------|----------|
| SYSTEM_INTERNAL_ERROR | 500 | 系統發生非預期錯誤，請稍後再試 | 伺服器內部錯誤 | 所有功能 |
| SYSTEM_EMAIL_SEND_FAILED | 500 | 郵件發送失敗，請稍後再試 | Email 服務不可用 | F009 |

#### Feature Flag 控制 {#feature-flag-errors}

| 錯誤碼 | HTTP 狀態碼 | 訊息 | 說明 | 相關功能 |
|--------|------------|------|------|----------|
| FEATURE_NOT_ENABLED | 503 | 此功能尚未啟用，請聯繫 IT | **v1.12 / 2026-05-16 / system-architect 決議 #2 新增**：所有受 `FeatureFlagGuard` 保護之端點於 feature flag 關閉時統一回應；E07 重構批次 3~6（F050 v2.0 / F051 v2.0 / F052 v2.0 / F078 / F079~F089）受 `ENABLE_E07_REFACTOR_PHASE3` 控制，flag = false 時一律回此錯誤碼；訊息與行為一致以利前端統一錯誤處理。詳見 [F050 v2.0 §13.2](features/F050-create-list-definition.md#132-feature-flag-gating) | F050 v2.0, F051 v2.0, F052 v2.0, F078, F079, F080, F081, F082, F083（透過 F082 PUT）, F084, F085, F086, F087, F089 |

---

## 安全性錯誤處理原則

### 1. 不揭露帳號存在與否

以下場景必須使用通用回應，不透露 Email 是否已註冊：

| 場景 | 回應行為 |
|------|----------|
| 登入 — Email 不存在 | 回傳 `AUTH_INVALID_CREDENTIALS`（與密碼錯誤相同） |
| 登入 — 密碼錯誤 | 回傳 `AUTH_INVALID_CREDENTIALS`（與 Email 不存在相同） |
| 密碼重設 — Email 不存在 | 回傳成功訊息「若此 Email 存在，重設連結已寄出」（不寄出 Email） |
| 密碼重設 — Email 存在 | 回傳成功訊息「若此 Email 存在，重設連結已寄出」（寄出 Email） |

### 2. 不洩漏技術細節

- 500 錯誤回傳通用訊息，具體錯誤資訊僅記錄於伺服器日誌
- 資料庫錯誤訊息不直接回傳至用戶端
- Stack trace 絕不出現在 API 回應中

### 3. 憑證保護

- 密碼（使用者密碼、資料庫連線密碼）絕不出現在 API 回應或日誌中
- 資料來源密碼在 API 回應中以遮罩方式呈現（例如 `****`）
- 連線測試錯誤訊息不包含資料庫連線密碼

---

## 錯誤處理行為矩陣

| 場景 | HTTP | 錯誤碼 | 使用者看到的訊息 | 系統行為 |
|------|------|--------|-----------------|----------|
| 登入成功 | 200 | — | 導向對應首頁 | 發行 JWT Token |
| 登入失敗（憑證錯誤） | 401 | AUTH_INVALID_CREDENTIALS | Email 或密碼錯誤 | 不發行 Token |
| 登入失敗（帳號停用） | 403 | AUTH_ACCOUNT_DISABLED | 您的帳號已被停用，請聯絡管理員。 | 不發行 Token |
| 未驗證存取 | 401 | AUTH_TOKEN_MISSING | 請先登入 | 拒絕請求 |
| Token 過期 | 401 | AUTH_TOKEN_EXPIRED | Session 已過期，請重新登入 | 拒絕請求 |
| 權限不足 | 403 | AUTH_FORBIDDEN | 您沒有權限執行此操作 | 拒絕請求，記錄日誌 |
| 建立帳號 Email 重複 | 409 | ACCOUNT_EMAIL_EXISTS | 此 Email 已有帳號存在 | 不建立帳號 |
| 編輯帳號 Email 重複 | 409 | ACCOUNT_EMAIL_IN_USE | 此 Email 已被使用 | 不儲存變更 |
| 停用自己的帳號 | 422 | ACCOUNT_SELF_DISABLE | 您無法停用自己的帳號 | 不執行停用 |
| 降級最後一位 Admin | 422 | ACCOUNT_LAST_ADMIN | 無法移除最後一位 Admin... | 不執行降級 |
| 資料來源名稱＋資料庫名稱組合重複 | 409 | DS_NAME_EXISTS | 相同資料庫下已存在此名稱的資料來源 | 不建立/更新 |
| 連線測試逾時 | 200 | — | 連線逾時（10 秒） | success: false，狀態設為 disconnected |
| 密碼重設 Token 過期 | 422 | AUTH_RESET_TOKEN_EXPIRED | 此連結已過期，請重新申請密碼重設 | 不重設密碼 |
| 擷取任務名稱重複 | 409 | EXTRACTION_NAME_EXISTS | 此名稱的擷取任務已存在 | 不建立/更新 |
| 擷取任務執行中 | 409 | EXTRACTION_RUNNING | 任務執行中，無法執行此操作 | 拒絕編輯/停用/刪除/重複觸發 |
| 擷取任務不存在 | 404 | EXTRACTION_NOT_FOUND | 找不到指定的擷取任務 | 拒絕請求 |
| 增量模式缺少增量欄位 | 422 | VALIDATION_INCREMENTAL_COLUMN_REQUIRED | 增量模式必須指定增量欄位 | 不提交表單 |
| Cron 表達式格式錯誤 | 422 | VALIDATION_INVALID_CRON | 排程格式不正確 | 不提交表單 |
| 動態建表失敗 | — | EXTRACTION_TABLE_CREATE_FAILED | 動態建表失敗 | 任務標記 failed，ExtractionLog 記錄錯誤 |
| 批次寫入失敗 | — | EXTRACTION_BATCH_WRITE_FAILED | 批次寫入失敗 | 任務標記 failed，已寫入資料保留 |
| 來源資料表不存在 | — | EXTRACTION_SOURCE_TABLE_NOT_FOUND | 來源資料表不存在 | 任務標記 failed，ExtractionLog 記錄錯誤 |
| Schema 列表載入失敗 | 503 | DATASOURCE_SCHEMA_LOAD_FAILED | 無法連線至資料來源 | 前端顯示錯誤，schema 下拉停用 |
| Table 列表載入失敗 | 503 | DATASOURCE_TABLE_LOAD_FAILED | 無法連線至資料來源 | 前端顯示錯誤，table 下拉停用 |
| raw data 表不存在（預覽） | 404 | EXTRACTION_RAW_TABLE_NOT_FOUND | 此任務尚無已擷取的資料 | 顯示空狀態提示 |
| Pipeline 名稱重複 | 409 | PIPELINE_NAME_EXISTS | 此名稱的 Pipeline 已存在 | 不建立/更新 |
| Pipeline 執行中重複執行 | 409 | PIPELINE_RUNNING | Pipeline 正在執行中 | 拒絕重複執行 |
| Pipeline 執行中刪除 | 409 | PIPELINE_RUNNING | Pipeline 正在執行中，無法刪除 | 拒絕刪除 |
| Pipeline 未定義節點即執行 | 422 | PIPELINE_NO_DEFINITION | Pipeline 尚未定義節點 | 拒絕執行 |
| 草稿 Pipeline 嘗試啟用 | 400 | PIPELINE_DRAFT_CANNOT_ENABLE | 需先發布 Pipeline | 拒絕啟用 |
| 版本未通過測試即發布 | 422 | PIPELINE_PUBLISH_REQUIRES_TEST | 請先完成測試執行 | 拒絕發布 |
| 版本重複發布 | 422 | PIPELINE_VERSION_ALREADY_PUBLISHED | 此版本已發布 | 拒絕發布 |
| Pipeline 不存在 | 404 | PIPELINE_NOT_FOUND | 找不到指定的 Pipeline | 拒絕請求 |
| Pipeline 節點連線違規 | 422 | PIPELINE_INVALID_CONNECTION | 連線規則違反 | 拒絕儲存 |
| Pipeline 節點執行失敗 | — | PIPELINE_NODE_EXECUTION_FAILED | 節點執行失敗 | Pipeline 標記 failed，EtlPipelineLog 記錄錯誤 |
| 目標表不存在 | 404 | PIPELINE_TARGET_TABLE_NOT_FOUND | 找不到指定的目標表 | 拒絕請求 |
| 嘗試新增/刪除系統預設角色 | 403 | ROLE_MODIFICATION_FORBIDDEN | 角色為系統預設，不支援自訂新增或刪除 | 拒絕請求 |
| 角色不存在 | 404 | ROLE_NOT_FOUND | 找不到指定的角色 | 拒絕請求 |
| 客戶 ID 不存在 | 404 | C360_CUSTOMER_NOT_FOUND | 找不到此客戶資料 | 顯示 404 錯誤提示與返回按鈕 |
| 搜尋關鍵字不足 2 字元 | 422 | C360_SEARCH_MIN_LENGTH | 搜尋關鍵字至少需要 2 個字元 | 拒絕搜尋請求 |
| 同月名單定義達 999 筆 | 422 | LIST_NO_LIMIT_EXCEEDED | 本月名單定義已達 999 筆上限 | 不新增紀錄 |
| PROD_KIND + CARD_TYPE 組合重複 | 422 | LIST_NO_DUPLICATE | 相同產品類別與卡別的有效名單已存在 | 不新增/更新 |
| 月跑執行中觸發新月跑或修改 E07 設定 | 409 | ASSIGNMENT_RUN_ALREADY_RUNNING | 分派執行中 | 拒絕請求 |
| 月跑前置條件失敗 | 422 | ASSIGNMENT_RUN_PRECHECK_FAILED | 前置條件未滿足 | 顯示失敗項目清單 |
| 部門比例加總 ≠ 100%（F079，per-LIST_NO） | 422 | RATIO_SUM_NOT_100 | 部門比例加總需調整至 100%（容忍 ±0.01%） | 儲存按鈕停用 |
| 個別業務比例加總 ≠ 100%（F082，per-DEPT） | 422 | PERSONNEL_RATIO_SUM_NOT_100 | 部門個別業務比例加總需調整至 100% | 該部門儲存按鈕停用 |
| F082 寫入前部門尚未於 ob_dept_pct 配置 | 422 | PERSONNEL_RATIO_DEPT_NOT_FOUND | 部門尚未於部門比例設定階段配置 | 拒絕請求（防呆）|
| 處長嘗試操作他人轄區業務員 RATION（F082） | 403 | PERSONNEL_RATIO_OUT_OF_SCOPE | 此業務員資料不屬於您的轄區 | 拒絕請求，前端按鈕不渲染 |
| F082 PUT 帶 appliedTemplate 但加總超界 | 422 | BONUS_PENALTY_TEMPLATE_INVALID | 模板套用結果違反邊界 | 拒絕請求（前端 bug 防呆）|
| 月跑 run_id 不存在 | 404 | ASSIGNMENT_RUN_NOT_FOUND | 找不到該月跑紀錄 | 拒絕請求 |
| 月跑非 completed 狀態匯出/比對 | 422 | ASSIGNMENT_RUN_NOT_COMPLETED / ASSIGNMENT_RUN_NOT_COMPARABLE | 僅 completed 狀態可操作 | 按鈕停用 |
| 計分設定月跑鎖定 | 409 | SCORING_VERSION_LOCKED | 分派執行中，無法修改計分設定 | 拒絕請求 |
| 分數區間重疊 | 422 | SCORING_RANGE_OVERLAP | 分數區間重疊 | 不儲存 |
| TIER 對應指向不存在的 CARD_LEVEL | 422 | CARD_LEVEL_NOT_FOUND_IN_VERSION | 指定的 CARD_LEVEL 不存在於 active 計分版本 | 不儲存（fallback `card_level IS NULL` 場景例外） |
| 新增 CARD_LEVEL 代碼重複 | 422 | CARD_LEVEL_DUPLICATE | 等級代碼已存在於選中計分版本 | 不新增 |
| 刪除 CARD_LEVEL 但紀錄不存在 | 404 | CARD_LEVEL_RECORD_NOT_FOUND | 指定的 CARD_LEVEL 紀錄不存在 | 拒絕請求 |
| 刪除 CARD_LEVEL 仍被 TIER 對應引用 | 409 | CARD_LEVEL_REFERENCED | 等級仍被 TIER_LEVEL 對應引用，請先於 F056 移除對應後再刪除 | 拒絕刪除（cascade reference check 失敗） |
| 刪除 TIER 對應但對應不存在 | 404 | TIER_MAPPING_NOT_FOUND | 指定的 (cardType, cardLevel) TIER 對應不存在 | 拒絕請求 |
| 新增 CARD_TYPE 代碼重複 | 422 | CARD_TYPE_DUPLICATE | 計分卡代碼已存在 | 不新增 |
| 操作不存在的 CARD_TYPE | 404 | CARD_TYPE_NOT_FOUND | 找不到指定的計分卡類型 | 拒絕請求 |
| 停用 CARD_TYPE 未確認級聯 | 422 | CARD_TYPE_CASCADE_NOT_CONFIRMED | 級聯刪除需要二次確認 | 不刪除 |
| TIER_LEVEL 不在 T1~T10 列舉 | 422 | TIER_LEVEL_INVALID_ENUM | TIER_LEVEL 必須為 T1~T10 之一 | 不寫入 |
| 同 CARD_TYPE 違反 Fallback / Standard 互斥 | 422 | CARD_TYPE_FALLBACK_STANDARD_MUTEX | 不可同時存在 Fallback 與 Standard | 不寫入 |
| Stage 0 試算超時 | 500 | STAGE0_ESTIMATE_TIMEOUT | 試算查詢超過 10 秒 | 中斷查詢 |
| 匯出逾時 | 500 | EXPORT_FILE_EXPIRED | 檔案產生逾時 | 中斷匯出 |
| 代碼值重複 | 422 | CODE_IN_USE | 代碼值在該類別中已存在 | 不寫入 |
| 代碼類別非 PROD_KIND/SPEC_TP/CASE_STATUS | 422 | CODE_TYPE_INVALID | 僅支援三類代碼維護（CASEYEAR 為前端 hard-coded，亦回此錯誤） | 拒絕請求 |
| ~~名單新增/編輯時案件結清期別未填~~ | ~~422~~ | ~~CASE_STATUS_REQUIRED~~ | ~~案件結清期別為必填，請至少選取一項~~ | **DEPRECATED v2.1（2026-05-20 / F050 v2.1 重構，A1 / A5）**：由 `CONDITION_COLUMN_NOT_IN_WHITELIST` + condition_payload 必填統一覆蓋 |
| 名單篩選條件 columnName 不在白名單或已停用（v2.1） | 422 | CONDITION_COLUMN_NOT_IN_WHITELIST | 篩選條件欄位 `{columnName}` 不在 POOLDATA 篩選欄位白名單或已停用 | 拒絕請求 |
| 名單篩選條件含一級保留欄位 list_period_*（v2.1） | 400 | RESERVED_FIELD_IN_CONDITIONS | 以下欄位為一級保留欄位，不可納入篩選條件：`{reservedFields}` | 拒絕請求（defense-in-depth）|
| 對舊遷移名單（condition_payload IS NULL）寫入 conditionPayload（v2.1） | 422 | LEGACY_LIST_CONDITION_READONLY | 此名單使用舊格式儲存，篩選條件須由系統 backfill migration 後方可編輯 | 拒絕請求（defense-in-depth）|
| 從上月複製來源名單為舊遷移名單（v2.1） | 422 | LEGACY_LIST_NOT_COPYABLE | 來源名單使用舊格式儲存，不可作為複製來源 | 拒絕請求（defense-in-depth）|
| 資源不存在 | 404 | *_NOT_FOUND | 找不到指定的 {資源} | 拒絕請求 |
| 伺服器錯誤 | 500 | SYSTEM_INTERNAL_ERROR | 系統發生非預期錯誤，請稍後再試 | 記錄完整錯誤至日誌 |
