---
spec-id: error-handling
title: 錯誤處理規範
version: "1.5"
date: 2026-04-24
status: Draft
---

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

E07 錯誤碼涵蓋名單定義、計分設定、分派比例、分派執行、快照歷史、代碼維護等六個模組。所有 `is_sales_manager` 權限不足時回傳 `AUTH_FORBIDDEN`（見 AUTH 領域）。

#### 名單定義 / 資料鎖 {#assignment-list-errors}

| 錯誤碼 | HTTP 狀態碼 | 訊息 | 說明 | 相關功能 |
|--------|------------|------|------|----------|
| LIST_NO_LIMIT_EXCEEDED | 422 | 本月（{ym}）名單定義已達 999 筆上限，無法新增 | 同月 `ob_list_definition` 紀錄超過 999 筆（OB{YYYYMM}{NNN} 格式限制，Phase 2 擴位） | F050 |
| LIST_NO_DUPLICATE | 422 | 相同產品類別（PROD_KIND）與卡別（CARD_TYPE）的有效名單已存在（LIST_NO: {conflictListNo}） | `prod_kind + card_type` 在當月 active 名單中已存在 | F050, F051 |
| CASE_STATUS_REQUIRED | 422 | 案件結清期別為必填，請至少選取一項 | 新增或編輯名單定義時 `case_status` 為 NULL / 空字串 / 未提供（前端阻擋後的後端保護） | F050, F051 |
| ASSIGNMENT_LIST_NOT_FOUND | 404 | 找不到指定的名單定義 | `list_no` 不存在於 `ob_list_definition` | F049, F051, F052, F060 |
| ASSIGNMENT_LIST_INACTIVE | 422 | 已停用名單不可編輯 | 嘗試編輯 `status = 'inactive'` 的名單 | F051 |
| ASSIGNMENT_LIST_ALREADY_INACTIVE | 422 | 名單已處於停用狀態，無需重複操作 | 嘗試停用已 inactive 的名單 | F052 |

#### 計分設定 {#assignment-scoring-errors}

| 錯誤碼 | HTTP 狀態碼 | 訊息 | 說明 | 相關功能 |
|--------|------------|------|------|----------|
| SCORING_VERSION_NOT_FOUND | 404 | 目前無生效的計分版本，請聯繫 IT 確認設定 | `ob_levelcard_version` 無 `status = 'active'` 紀錄 | F053 |
| SCORING_VERSION_LOCKED | 409 | 分派執行中，無法修改計分設定 | 月跑 `pending` / `running` 期間嘗試修改計分設定 | F054, F055, F056 |
| SCORING_RANGE_OVERLAP | 422 | 分數區間重疊，請調整條件值 | 分數區間或 CARD_LEVEL 門檻區間重疊 | F054, F055 |
| TIER_LEVEL_DUPLICATE | 422 | TIER_LEVEL 代碼 {code} 已存在 | 新增 TIER_LEVEL 對應時代碼重複 | F056 |
| CARD_LEVEL_NOT_FOUND | 422 | 指定的 CARD_LEVEL 不存在於當前版本 | TIER_LEVEL 對應至不存在的 CARD_LEVEL | F056 |

#### 分派比例 {#assignment-ratio-errors}

| 錯誤碼 | HTTP 狀態碼 | 訊息 | 說明 | 相關功能 |
|--------|------------|------|------|----------|
| RATIO_SUM_INVALID | 422 | LIST_NO {listNo} 部門比例加總為 {sum}%，需調整至 100% | `ob_dept_pct` 同 `list_no` 下 `ration` 加總 ≠ 100% | F060 |
| PERSONNEL_RATIO_SUM_INVALID | 422 | 部門 {deptId} 人員比例加總為 {sum}%，需調整至 100% | `ob_empl_set` 同 `list_no + deptid_m` 下 `ration` 加總 ≠ 100% | F058 |

#### 分派執行 {#assignment-run-errors}

| 錯誤碼 | HTTP 狀態碼 | 訊息 | 說明 | 相關功能 |
|--------|------------|------|------|----------|
| ASSIGNMENT_RUN_ALREADY_RUNNING | 409 | 分派執行中（run_id: {currentRunId}），請等待完成後再觸發 | 同月已有 `status IN ('pending', 'running')` 紀錄時嘗試觸發新月跑，或於月跑執行中嘗試修改任何 E07 設定 | F048-F052, F054-F060, F061, F068 |
| ASSIGNMENT_RUN_PRECHECK_FAILED | 422 | 前置條件未滿足：{details} | 月跑 Stage 0 前置條件檢查失敗（5 項任一未通過） | F061 |
| ASSIGNMENT_RUN_NOT_FOUND | 404 | 找不到該月跑紀錄或快照不完整 | `run_id` 不存在於 `assignment_run`，或 `assignment_run_snapshot` 三份快照不完整 | F062, F063, F064, F066, F067 |
| ASSIGNMENT_RUN_NOT_COMPLETED | 422 | 月跑尚未完成，該操作不可用 | 對 `status != 'completed'` 的月跑執行結果查詢、匯出等操作 | F063, F064 |
| ASSIGNMENT_RUN_NOT_COMPARABLE | 422 | 僅 completed 狀態的月跑可比對 | 比對操作的任一 `run_id` 非 `completed` 狀態 | F067 |

#### Stage 0 試算 / 匯出 {#assignment-misc-errors}

| 錯誤碼 | HTTP 狀態碼 | 訊息 | 說明 | 相關功能 |
|--------|------------|------|------|----------|
| STAGE0_ESTIMATE_TIMEOUT | 500 | 試算查詢超過 10 秒 timeout，請稍後再試或聯繫 IT 檢查索引 | Stage 0 單一 LIST_NO 試算超時 | F049 |
| EXPORT_FILE_EXPIRED | 500 | 檔案產生逾時（超過 5 分鐘），請稍後再試或聯繫 IT | 分派結果匯出超時 | F064 |

#### 代碼維護 {#assignment-code-errors}

| 錯誤碼 | HTTP 狀態碼 | 訊息 | 說明 | 相關功能 |
|--------|------------|------|------|----------|
| CODE_IN_USE | 422 | 代碼值 {tblCd} 在類別 {tblId} 中已存在 | 新增代碼時 `(tbl_id, tbl_cd)` 組合重複（啟用期間內） | F068 |
| CODE_TYPE_INVALID | 422 | 本功能僅支援 PROD_KIND / SPEC_TP / CASE_STATUS 三類代碼維護 | API 傳送的 `tbl_id` 不在允許清單（PROD_KIND / SPEC_TP / CASE_STATUS）中；含 `CASEYEAR` 亦回此錯誤（CASEYEAR 為 F050/F051 前端 hard-coded 11 個固定選項，不入 ob_code_df，OQ-E07-24 Resolved 2026-05-12） | F068 |
| CODE_NOT_FOUND | 404 | 找不到指定的代碼 | `(tbl_id, tbl_cd)` 組合不存在於 `ob_code_df` | F068 |

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
| 部門比例加總 ≠ 100% | 422 | RATIO_SUM_INVALID | 部門比例加總需調整至 100% | 儲存按鈕停用 |
| 人員比例加總 ≠ 100% | 422 | PERSONNEL_RATIO_SUM_INVALID | 人員比例加總需調整至 100% | 儲存按鈕停用 |
| 月跑 run_id 不存在 | 404 | ASSIGNMENT_RUN_NOT_FOUND | 找不到該月跑紀錄 | 拒絕請求 |
| 月跑非 completed 狀態匯出/比對 | 422 | ASSIGNMENT_RUN_NOT_COMPLETED / ASSIGNMENT_RUN_NOT_COMPARABLE | 僅 completed 狀態可操作 | 按鈕停用 |
| 計分設定月跑鎖定 | 409 | SCORING_VERSION_LOCKED | 分派執行中，無法修改計分設定 | 拒絕請求 |
| 分數區間重疊 | 422 | SCORING_RANGE_OVERLAP | 分數區間重疊 | 不儲存 |
| Stage 0 試算超時 | 500 | STAGE0_ESTIMATE_TIMEOUT | 試算查詢超過 10 秒 | 中斷查詢 |
| 匯出逾時 | 500 | EXPORT_FILE_EXPIRED | 檔案產生逾時 | 中斷匯出 |
| 代碼值重複 | 422 | CODE_IN_USE | 代碼值在該類別中已存在 | 不寫入 |
| 代碼類別非 PROD_KIND/SPEC_TP/CASE_STATUS | 422 | CODE_TYPE_INVALID | 僅支援三類代碼維護（CASEYEAR 為前端 hard-coded，亦回此錯誤） | 拒絕請求 |
| 名單新增/編輯時案件結清期別未填 | 422 | CASE_STATUS_REQUIRED | 案件結清期別為必填，請至少選取一項 | 拒絕請求 |
| 資源不存在 | 404 | *_NOT_FOUND | 找不到指定的 {資源} | 拒絕請求 |
| 伺服器錯誤 | 500 | SYSTEM_INTERNAL_ERROR | 系統發生非預期錯誤，請稍後再試 | 記錄完整錯誤至日誌 |
