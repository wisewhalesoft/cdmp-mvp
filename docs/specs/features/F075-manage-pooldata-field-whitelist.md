---
spec-id: F075
title: POOLDATA 篩選欄位白名單管理（含 field_type metadata）
feature-id: F075
source-story: US-102
epic: E07
module: M06 代碼維護（進階）
priority: P0-MVP
version: "1.4.3"
date: 2026-05-19
status: Draft
---

# F075: POOLDATA 篩選欄位白名單管理（含 field_type metadata）

Priority: P0-MVP | Status: Draft | Last Updated: 2026-05-19

> **v1.4.3 補修（2026-05-19）**：case 對齊 — `pooldata_field_whitelist.column_name` 從原 SQL Server `OBPOOLDATA` 大寫慣例（`PROD_KIND` 等）改為小寫對齊 PostgreSQL `ob_pool_data` ETL 後表之 snake_case 實際欄位命名（`prod_kind` 等）；DTO regex `/^[A-Z][A-Z0-9_]{0,63}$/` 改為 `/^[a-z][a-z0-9_]{0,63}$/`；AC-1 / AC-8 seed 欄位字串 + API 範例 + 新增 BR-14（命名規範）；§13 補 v1.4.3 變更紀錄。**不動** F068 `ob_code_df.tbl_id` 之 `PROD_KIND` / `SPEC_TP` / `CASE_STATUS` 大寫業務常數（獨立語境）。
> **v1.4 修訂（2026-05-18）**：UI 層命名改為「篩選欄位管理」/「新增篩選欄位」（內部 DB 表名 / API path / 類別名稱 100% 保留 `pooldata_field_whitelist`、`/api/v1/pooldata-fields`）；新增 `GET /api/v1/pooldata-fields/available-columns` 端點，新增欄位流程改為下拉選擇 OBPOOLDATA 既有但尚未列入白名單之欄位（含停用欄位過濾，防繞過 AC-5），徹底消除 A-3 孤兒欄位新增風險；新增 `suggestedFieldType` 推斷規則（numeric / categorical / date，預選非強制，使用者可覆寫）；BR-11 / BR-12 / BR-13 落地；A-3 由 [ASSUMPTION] 升級為 [RESOLVED]；附帶清理：prototype L187 + FE footer L409 之 `WHITELIST_FIELD_DUPLICATE` 字串修正為 spec 權威定義 `POOLDATA_FIELD_DUPLICATE`。
> **v1.3 補修（2026-05-17）**：v1.2 救援過程遺失 PO 決議 F076-C 軟停用機制（task #16 system-architect Phase 1 6 PO 決議），補回 BR-7 「`field_type` 由 categorical 切離時，service 層批次 SET 對應 `pooldata_field_option.is_active = false` + `deactivation_reason = 'field_type_changed'`（軟停用，不 CASCADE 刪除）」+ AC-6 切換 confirm UI 文字補「將自動停用 N 個可選值」+ 跨參照 data-model `deactivation_reason` ENUM。
> **v1.2 救援重寫（2026-05-16）**：前一輪編碼事故損毀本檔內容，依 US-102 + AD-E07 v3.0 一致性決議完整重建；Guard：寫入 `DirectorGuard`、查看 `DirectorOrSectionChiefGuard`（取代 `SalesManagerGuard`）；業務角色欄位 `business_role`；JWT claim `businessRole`；保留 v1.0 / v1.1 所有設計決議與 seed 清單。
> **v1.1 修訂（2026-05-16 / Phase 1 決議落地）**：Feature Flag fallback 503 + `FEATURE_NOT_ENABLED`（決議 #2）。

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `data-model.md#pooldata-field-whitelist` + `error-handling.md#assignment-role-errors` |
| QA / Tester | 本文件 + `error-handling.md#assignment-role-errors` |
| UI/UX Designer | 本文件 §7 |
| Architect | 本文件 + `architecture-spec.md` §3.10 + ETL 對 OBPOOLDATA 之欄位同步策略 |

---

## 對應 User Story

- 來源 Story：[US-102-M06-manage-pooldata-field-whitelist.md](../../stories/epics/E07-app-customer-list-assignment/US-102-M06-manage-pooldata-field-whitelist.md)
- Epic：[E07 — 客戶名單分派](../../stories/epics/E07-app-customer-list-assignment/epic-brief.md)
- 模組：M06 代碼維護（進階）

---

## 1. 功能摘要

提供 M06 代碼維護頁面之 POOLDATA 篩選欄位白名單管理功能。部長 / Admin 可新增、編輯、停用白名單欄位，並為每個欄位標記 `field_type`（`numeric` / `categorical` / `date`），驅動 F050 新名單定義表單之動態欄位選擇。

**範圍**：
- 新建 `pooldata_field_whitelist` 表，欄位包含 `column_name`（唯一鍵）、`display_name`、`field_type`、`is_active`、`created_at`、`updated_at`
- 部長 / Admin 可寫入；處長唯讀（可進入頁面查看，無編輯按鈕）
- 系統首次部署時自動 seed 8 筆（7 啟用 + 1 停用 payt_term）
- 停用欄位「不回溯」既有名單條件，月跑讀取直接讀 `ob_list_definition.filter_conditions` JSONB，不 join 白名單做欄位有效性驗證

**v1.4 新增**：新增欄位流程改為下拉選擇（dropdown） — 後端提供 `GET /api/v1/pooldata-fields/available-columns` 回傳 OBPOOLDATA 既有但尚未列入白名單之欄位清單（含其 PostgreSQL `dataType` 與系統推斷之 `suggestedFieldType`），前端 Modal 以下拉取代自由輸入 `columnName`；available-columns 查詢過濾**所有**已在 `pooldata_field_whitelist` 的紀錄（含 `is_active = false`），確保不會繞過 AC-5 唯一性。系統推斷之 `suggestedFieldType` 作為預選值，使用者仍可覆寫；此舉徹底消除 A-3 孤兒欄位於新增階段產生的風險。

**舊名單相容**：舊名單（既有 OBMLISTDF 遷移資料）繼續沿用固定欄位邏輯，不受本白名單影響

## 2. 使用者故事

**As a** 部長 / Admin
**I want** 在代碼維護頁面查看與編輯「可用於名單定義的 OBPOOLDATA 篩選欄位白名單」，並為每個欄位標記其類別
**So that** 新建名單定義時，條件篩選欄位選項清單能動態反映白名單，管理者無需 IT 協助即可自行增減

## 3. 前置條件

- 使用者持 JWT 且 `business_role IN ('director', 'section_chief')` 或 admin
- 寫入操作須 `business_role = 'director'` 或 admin
- 系統首次部署時 Admin 已執行 seed 腳本

## 4. 驗收標準

### AC-1：系統首次部署時自動 Seed 白名單

- **Given** 系統首次部署
- **When** Admin 執行初始化
- **Then** 系統自動 seed 8 筆（v1.4.3 起 column_name 為小寫 snake_case，對齊 `ob_pool_data` PostgreSQL 實際欄位）：
  - prod_kind（categorical，啟用）
  - list_type（categorical，啟用）
  - best_case（categorical，啟用）
  - spec_tp（categorical，啟用）
  - caseyear（categorical，啟用）
  - settle_src（categorical，啟用）
  - month_cnt（numeric，啟用）
  - payt_term（numeric，**停用**）
- **And** 每筆欄位含 `column_name`、`display_name`、`field_type`、`is_active`
- **And** seed 為冪等操作（重複執行不產生重複資料）

### AC-2：部長 / Admin 查看白名單列表

- **Given** 部長 / Admin 登入並進入 M06 代碼維護 > POOLDATA 篩選欄位分頁
- **When** 頁面載入
- **Then** 以表格顯示所有欄位：`column_name`、`display_name`、`field_type`、狀態（啟用 / 停用）
- **And** 停用欄位以灰色或標記區分，仍顯示於列表（不隱藏）

### AC-3：處長進入此頁面為唯讀

- **Given** 帳號僅持有「處長」角色
- **When** 進入 POOLDATA 篩選欄位分頁
- **Then** 可查看白名單列表（同 AC-2 資料呈現）
- **And** 頁面**不顯示**任何「新增欄位」「編輯」「停用」等操作按鈕
- **And** 若處長嘗試直接呼叫白名單寫入 API，後端回 403 `AUTH_FORBIDDEN`

### AC-4：部長 / Admin 新增白名單欄位

- **Given** 部長 / Admin 點擊「新增欄位」
- **When** 填入 `column_name`（必填）、`display_name`（必填）、`field_type`（必填，下拉：numeric / categorical / date），點擊儲存
- **Then** 新欄位以 `is_active = true` 新增至白名單
- **And** 若 `field_type = categorical`，系統提示「請至 POOLDATA 可選值維護頁設定可選值」（不阻擋儲存）
- **And** 操作寫入 `assignment_audit_log`（`action = 'CREATE'`、`entity_type = 'pooldata_field_whitelist'`、`entity_id = column_name`）

### AC-5：`column_name` 唯一性驗證

- **Given** 部長 / Admin 嘗試新增 `column_name` 與現有欄位重複（無論啟用或停用）
- **When** 點擊儲存
- **Then** 系統顯示錯誤「欄位名稱已存在，請確認是否要重新啟用停用欄位」，不新增重複紀錄
- **And** 後端回 409 `POOLDATA_FIELD_DUPLICATE`

### AC-6：部長 / Admin 編輯欄位 display_name / field_type

- **Given** 部長 / Admin 點擊欄位「編輯」
- **When** 修改 `display_name` 或 `field_type`，點擊儲存
- **Then** 變更立即生效，下次開啟名單定義表單時反映最新顯示名稱
- **And** 若 `field_type` 從 `categorical` 改為其他類別，系統先以 `GET /api/v1/pooldata-fields/{columnName}/options?active=true` 取得啟用可選值數量 N，顯示警告「此欄位 {N} 個啟用可選值將自動停用（軟停用，歷史保留不刪除），且不再套用於新名單篩選；確定繼續？」，確認後 service 層**同一 transaction 內**：(1) 更新 `pooldata_field_whitelist.field_type`、(2) 批次 `UPDATE pooldata_field_option SET is_active = false, deactivation_reason = 'field_type_changed' WHERE column_name = :columnName AND is_active = true`（沿用 F076 v1.3 BR-6）
- **And** 操作寫入 `assignment_audit_log`（`action = 'UPDATE'`、details 含 `deactivatedOptionCount = N`）

### AC-7：部長 / Admin 停用白名單欄位

- **Given** 部長 / Admin 點擊欄位「停用」
- **When** 確認 Modal 後執行
- **Then** 欄位 `is_active` 設為 false，**立即**從新名單定義條件篩選選單中消失
- **And** 已在**現有**名單定義條件中使用此欄位的設定**不受影響**（不回溯）
- **And** 操作寫入 `assignment_audit_log`（`action = 'DISABLE'`）

### AC-8：停用欄位不影響既有名單條件（舊名單相容）

- **Given** 名單定義 `OB202604010` 含篩選條件 `settle_src = Y`；部長停用白名單中 `settle_src`
- **When** 系統執行月跑讀取 `OB202604010` 之篩選條件
- **Then** 月跑仍正確讀取 `settle_src = Y` 並過濾 OBPOOLDATA；不因欄位停用而失敗

### AC-9：欄位類別影響名單定義表單元件選擇

- **Given** 白名單某欄位 `field_type = categorical`
- **When** 部長 / Admin 於新名單定義表單選此欄位為篩選條件
- **Then** 表單元件為多選列表（可選值由 F076 維護取得）
- **And** 若 `field_type = numeric`，表單元件為數值範圍輸入（min / max）
- **And** 若 `field_type = date`，表單元件為日期範圍選擇器

### AC-10：available-columns 端點僅回傳尚未列入白名單之欄位

- **Given** `ob_pool_data` 含 120 個欄位，`pooldata_field_whitelist` 已有 8 筆紀錄（7 啟用 + 1 停用 payt_term）
- **When** 部長 / Admin 呼叫 `GET /api/v1/pooldata-fields/available-columns`
- **Then** Response 回傳 `ob_pool_data` 既有欄位中**未出現於** `pooldata_field_whitelist` 的所有欄位（不論 `is_active` 為何，已停用之 payt_term 亦不列入 available-columns）
- **And** 每筆含 `columnName`、`dataType`（PostgreSQL information_schema 原始型別字串）、`suggestedFieldType`
- **And** 結果按 `columnName` 字母順序排序

### AC-11：available-columns 端點權限

- **Given** 部長身份登入
- **When** 呼叫 `GET /api/v1/pooldata-fields/available-columns`
- **Then** 回 200 OK + availableColumns
- **And** Admin 呼叫 → 200 OK
- **And** 處長 / 課長 / 業務人員呼叫 → 403 `AUTH_FORBIDDEN`（端點受 `DirectorGuard` 保護，僅供寫入流程使用）

### AC-12：suggestedFieldType 推斷規則

- **Given** OBPOOLDATA 某欄位之 PostgreSQL `dataType` 為 `numeric` / `integer` / `decimal` / `double precision` / `real` / `bigint` 之一
- **When** 呼叫 `GET /api/v1/pooldata-fields/available-columns`
- **Then** 對應欄位之 `suggestedFieldType = "numeric"`
- **And** `dataType` 為 `date` / `timestamp` / `timestamp without time zone` / `timestamp with time zone`（含 `timestamptz`）→ `suggestedFieldType = "date"`
- **And** 其餘任何 `dataType`（含字串型別、`null`、無法識別）→ `suggestedFieldType = "categorical"`（保守原則）

### AC-13a：新增欄位 Modal 為下拉選擇且為唯一新增路徑

- **Given** 部長 / Admin 點擊「新增篩選欄位」開啟 Modal
- **When** Modal 載入
- **Then** Modal 內 `columnName` 欄位以**下拉清單（dropdown）**呈現，選項來源為 `GET /api/v1/pooldata-fields/available-columns`
- **And** 系統**不提供**自由文字輸入 `columnName` 的路徑（v1.4 起 dropdown 為唯一新增路徑，無 fallback toggle）
- **And** 若 available-columns 為空（OBPOOLDATA 所有欄位皆已列入白名單），Modal 顯示對應空態提示且儲存按鈕停用

### AC-13b：dropdown 空態錯誤碼分流（v1.4.2 D1 設計修補）

依 `GET /api/v1/pooldata-fields/available-columns` response 之 HTTP status + `error` 欄位分流顯示對應訊息與「重試」按鈕：

- **Given** 部長 / Admin 開啟新增 Modal 觸發 dropdown 載入
- **When** API 回 `200 OK` + `availableColumns: []`（真實「全部已列入」情境）
- **Then** dropdown 顯示「OBPOOLDATA 所有欄位皆已列入篩選欄位清單」白色淡 hint，**不顯示**重試按鈕
- **When** API 回 `503` + `error: "OBPOOLDATA_NOT_READY"`（表不存在 / ETL 尚未 Load / SQLite 環境）
- **Then** dropdown 顯示「OBPOOLDATA 資料尚未由 ETL 同步至本系統，請聯繫系統管理員確認 ETL 狀態」+ 「重試」按鈕
- **When** API 回 `503` + `error: "FEATURE_NOT_ENABLED"`（功能旗標 `ENABLE_E07_REFACTOR_PHASE3` 關閉）
- **Then** dropdown 顯示「F075 功能尚未啟用」+ 「重試」按鈕
- **When** API 回其他 5xx 錯誤（含網路錯誤）
- **Then** dropdown 顯示「載入欄位清單失敗，請稍後重試」+ 「重試」按鈕
- **And** 重試按鈕點擊後重新呼叫 `GET /api/v1/pooldata-fields/available-columns`，由後續 response 決定下一個狀態
- **And** 上述四種錯誤狀態下，submit 按鈕保持停用

### AC-14：選中欄位後顯示系統推斷 hint 與使用者覆寫 hint 切換

- **Given** 部長 / Admin 在新增 Modal 之 dropdown 選中某欄位
- **When** 選取完成
- **Then** `field_type` radio 群組之**上方**顯示 hint 文字：「系統推斷：{suggestedFieldType}（依 dataType={dataType}）；請確認是否正確」
- **And** `field_type` radio 預選為 `suggestedFieldType`
- **And** 若使用者點選不同 radio 覆寫預選值，hint 文字立即切換為「使用者選擇」（系統推斷文字隱藏或以「使用者選擇」取代）
- **And** 視覺呈現細節（hint 字級、顏色、位置間距）由 ui-ux-designer 決議；spec 僅約束語意與切換行為

### AC-15：新增成功 toast 顯示 displayName

- **Given** 部長 / Admin 透過 Modal 新增欄位成功（POST 201 Created）
- **When** Modal 關閉
- **Then** 系統顯示 toast「欄位『{displayName}』已新增」（toast 內容以 `displayName` 為主，不再以 `columnName` 為主）
- **And** 編輯 / 停用 / 啟用 toast 亦沿用 displayName 為主之文案（與 §7 toast 規範一致）

## 5. API 規格

### 5.1 GET /api/v1/pooldata-fields

| 用途 | 取得白名單列表 |
|---|---|
| 認證 | JWT 必填 |
| 權限 | `DirectorOrSectionChiefGuard`（admin / director / section_chief 皆可查看） |

**Query Params**：`?active=true|false`（可選；不帶則回傳全部）

**Response — 200 OK**

```json
{
  "fields": [
    { "columnName": "prod_kind", "displayName": "產品類別", "fieldType": "categorical", "isActive": true, "createdAt": "...", "updatedAt": "..." },
    { "columnName": "month_cnt", "displayName": "撈取月份計數", "fieldType": "numeric", "isActive": true, "createdAt": "...", "updatedAt": "..." }
  ]
}
```

### 5.2 POST /api/v1/pooldata-fields

| 用途 | 新增白名單欄位 |
|---|---|
| 認證 | JWT 必填 |
| 權限 | `DirectorGuard` |

**Request Body**

```json
{
  "columnName": "risk_level",
  "displayName": "風險等級",
  "fieldType": "categorical"
}
```

**Response — 201 Created**

```json
{
  "columnName": "risk_level",
  "displayName": "風險等級",
  "fieldType": "categorical",
  "isActive": true
}
```

### 5.3 PATCH /api/v1/pooldata-fields/{columnName}

| 用途 | 編輯欄位 displayName / fieldType |
|---|---|
| 認證 | JWT 必填 |
| 權限 | `DirectorGuard` |

**Request Body**：部分更新

```json
{
  "displayName": "風險等級（新版）",
  "fieldType": "numeric"
}
```

### 5.4 DELETE /api/v1/pooldata-fields/{columnName}

| 用途 | 停用白名單欄位（軟刪除：is_active = false） |
|---|---|
| 認證 | JWT 必填 |
| 權限 | `DirectorGuard` |

**Response — 200 OK**

```json
{
  "columnName": "settle_src",
  "isActive": false,
  "disabledAt": "2026-05-15T13:00:00Z"
}
```

**錯誤代碼**

| HTTP | 錯誤碼 | 說明 |
|---|---|---|
| 401 | AUTH_TOKEN_MISSING / AUTH_TOKEN_EXPIRED | 未登入或 Token 過期 |
| 403 | AUTH_FORBIDDEN | 處長嘗試寫入 |
| 404 | POOLDATA_FIELD_NOT_FOUND | `columnName` 不存在 |
| 409 | POOLDATA_FIELD_DUPLICATE | `column_name` 已存在 |
| 422 | POOLDATA_FIELD_TYPE_INVALID | `fieldType` 不在合法值 |
| 503 | FEATURE_NOT_ENABLED | Feature Flag 關閉 |

### 5.5 GET /api/v1/pooldata-fields/available-columns

| 用途 | 取得 OBPOOLDATA 既有但尚未列入白名單之欄位清單（供新增 Modal dropdown 使用） |
|---|---|
| 認證 | JWT 必填 |
| 權限 | `DirectorGuard`（與寫入流程一致；僅供新增白名單欄位之 UI 流程使用） |

**Query Params**：無

**過濾規則**

- Source：OBPOOLDATA 之欄位中繼資料（資料庫 information_schema，實際查詢方式由 system-architect 決議）
- 過濾：扣除**所有**已存在於 `pooldata_field_whitelist` 之 `column_name`，**含 `is_active = false`**（防止繞過 AC-5 唯一性而二次新增同名欄位）

**排序規則**

- 結果按 `columnName` 字母升冪排序

**suggestedFieldType 推斷規則**（對應 AC-12）

| 來源 PostgreSQL dataType | suggestedFieldType |
|---|---|
| `numeric` / `integer` / `decimal` / `double precision` / `real` / `bigint` | `numeric` |
| `date` / `timestamp` / `timestamptz`（含 `timestamp without time zone` / `timestamp with time zone`） | `date` |
| 其他（字串、null、無法識別） | `categorical`（保守原則） |

**Response — 200 OK**

```json
{
  "availableColumns": [
    { "columnName": "birth_date", "dataType": "date", "suggestedFieldType": "date" },
    { "columnName": "cust_age", "dataType": "integer", "suggestedFieldType": "numeric" },
    { "columnName": "risk_level", "dataType": "varchar", "suggestedFieldType": "categorical" }
  ]
}
```

**錯誤代碼**

| HTTP | 錯誤碼 | 說明 |
|---|---|---|
| 401 | AUTH_TOKEN_MISSING / AUTH_TOKEN_EXPIRED | 未登入或 Token 過期 |
| 403 | AUTH_FORBIDDEN | 非 admin / 非 director 嘗試呼叫 |
| 503 | FEATURE_NOT_ENABLED | Feature Flag 關閉（沿用 BR-10，與其他寫入端點一致） |
| 503 | OBPOOLDATA_NOT_READY | `ob_pool_data` 表不存在或 ETL 尚未 Load（v1.4.2 D1：service 兩階段查詢 Step 1 失敗時拋出，避免吞錯回空陣列誤導 UI） |

## 6. 業務規則

| 規則編號 | 說明 |
|---|---|
| BR-1 | **`column_name` 唯一性**：DB 加 UNIQUE index；新增時若衝突回 409 `POOLDATA_FIELD_DUPLICATE` |
| BR-2 | **`field_type` ENUM**：限 `'numeric'` / `'categorical'` / `'date'`；違反回 422 `POOLDATA_FIELD_TYPE_INVALID` |
| BR-3 | **不支援硬刪除**：MVP 僅支援軟刪除（`is_active = false`）；硬刪除留待 OQ-102-02 決議 |
| BR-4 | **停用後不回溯**：月跑 Stage 1 讀取 `ob_list_definition.filter_conditions` 時，**不 join** `pooldata_field_whitelist` 做欄位有效性驗證；既有條件即使欄位停用仍可正確過濾 |
| BR-5 | **角色矩陣**：寫入端點（POST / PATCH / DELETE）限 `admin` 或 `business_role = 'director'`；GET 開放至 `business_role = 'section_chief'`；對應 `DirectorGuard` 與 `DirectorOrSectionChiefGuard` |
| BR-6 | **字串映射不維護外鍵**：白名單之 `column_name` 為 OBPOOLDATA 欄位名稱字串，不維護 FK 約束（因 OBPOOLDATA 為 ETL 同步資料，欄位可能動態變化） |
| BR-7 | **categorical → 非 categorical 之 field_type 變更（v1.3 / 2026-05-17 / PO 決議 F076-C 落地）**：F075 PATCH 將某欄位 `field_type` 從 `'categorical'` 改為其他類別時，service 層於同一 transaction 內對 `pooldata_field_option` 執行批次 `SET is_active = false, deactivation_reason = 'field_type_changed' WHERE column_name = :columnName AND is_active = true`（軟停用）；**不 CASCADE 刪除**，歷史保留供追溯（沿用 F076 v1.3 BR-6 + BR-7）；UI 顯示 confirm Modal 提示「將自動停用 N 個可選值」（N 由 GET options API 動態取得）；批次 UPDATE 失敗則整個 PATCH transaction rollback |
| BR-8 | **稽核失敗不 rollback**：沿用 F050 v2.0 BR-11 |
| BR-9 | **Seed 冪等性**：seed 腳本以 `INSERT ... ON CONFLICT (column_name) DO NOTHING` 實現；重複執行不產生重複資料 |
| BR-10 | **Feature Flag fallback（v1.1 / 決議 #2）**：F075 寫入端點受 `FeatureFlagGuard` 保護；flag = false 時回 503 `FEATURE_NOT_ENABLED`；GET 端點不受限以保證 F050 / F076 仍能讀取 |
| BR-11 | **新增欄位限下拉選擇（v1.4）**：自由文字輸入 `columnName` 之路徑已移除；新增 Modal 之 `columnName` 來源限定為 `GET /api/v1/pooldata-fields/available-columns` 回傳之 `availableColumns`。此規則徹底消除 A-3 孤兒欄位於新增階段產生之風險。不保留 fallback toggle |
| BR-12 | **`suggestedFieldType` 推斷規則 + 預選非強制（v1.4）**：available-columns 端點針對每筆欄位回傳 `suggestedFieldType`（推斷規則見 §5.5）；前端 Modal 以該值預選 `field_type` radio 並顯示「系統推斷」hint；使用者覆寫後 hint 改為「使用者選擇」。最終寫入之 `field_type` 以使用者送出值為準，**不強制等同系統推斷** |
| BR-13 | **available-columns 過濾含停用欄位（v1.4）**：available-columns 查詢過濾邏輯需排除**所有**已在 `pooldata_field_whitelist` 的紀錄，**含 `is_active = false`**；此規則確保已停用欄位無法被再次以 dropdown 選中新增，防繞過 AC-5 唯一性 |
| BR-14 | **`column_name` 命名規範（v1.4.3 case 對齊）**：`pooldata_field_whitelist.column_name` 與 `pooldata_field_option.column_name` 之儲存格式對齊 PostgreSQL `ob_pool_data` 之 snake_case 實際欄位命名（小寫起頭、小寫英數與底線）；DTO regex 為 `/^[a-z][a-z0-9_]{0,63}$/`。理由：(1) PostgreSQL unquoted identifier 大小寫不敏感但儲存為小寫；(2) `getAvailableColumns` SQL `NOT IN` 子查詢為 case-sensitive 字串比對，大寫 whitelist 與小寫 ob_pool_data 不匹配將導致過濾失效；(3) SQL Server `OBPOOLDATA` 之大寫慣例已隨 ETL 至 `ob_pool_data` 而消失，原大寫慣例不再適用。**不影響** F068 之 `ob_code_df.tbl_id`（PROD_KIND / SPEC_TP / CASE_STATUS 等大寫業務常數仍維持大寫，屬獨立語境） |

## 7. UI/UX 需求

- **頁面入口**：M06 代碼維護頁面內「進階維護」區塊之「**篩選欄位管理**」卡片（不在 sidebar 獨立項；UI 層命名，內部 API path `/api/v1/pooldata-fields` 與 DB 表名 `pooldata_field_whitelist` 保留不變）
- **UI 層命名規範（v1.4）**：sidebar / breadcrumb / 頁面 H1 / AppLayout title 一律使用「**篩選欄位管理**」；不可使用「白名單管理」「POOLDATA 篩選欄位白名單」「條件欄位管理」「可用欄位管理」等其他變體
- **列表表格**：
  - 欄位：`column_name` / `display_name` / `field_type` / 狀態 / 建立時間 / 更新時間 / 操作
  - 停用欄位以灰色背景顯示，「停用」徽章標示
  - 操作欄：「編輯」「停用 / 啟用」「管理可選值」（僅 categorical 顯示）
  - 處長身份**完全不渲染**任何操作欄按鈕（含「新增欄位」上方按鈕）
- **新增篩選欄位 Modal（v1.4 改造）**：
  - Modal 標題：「**新增篩選欄位**」（不可使用「新增白名單欄位」/「新增 POOLDATA 欄位」）
  - 欄位 1：`columnName` — **下拉選擇（dropdown）**，選項來源為 `GET /api/v1/pooldata-fields/available-columns` 之 `availableColumns`，選項顯示 `columnName`（可附 `dataType` 作為輔助說明，視覺細節由 ui-ux-designer 決議）；**不提供自由文字輸入路徑**（BR-11）
  - 欄位 2：`displayName`（text，必填）
  - 欄位 3：`fieldType` — radio 群組（`numeric` / `categorical` / `date`，必填）
  - **系統推斷 hint（AC-14）**：選中 dropdown 某欄位後，`fieldType` radio 群組**上方**顯示語意文字「系統推斷：{suggestedFieldType}（依 dataType={dataType}）；請確認是否正確」，且 radio 預選為 `suggestedFieldType`
  - **使用者覆寫 hint 切換（AC-14）**：使用者覆寫預選 radio 後，hint 文字改顯示「使用者選擇」（系統推斷文字隱藏或被取代）；視覺呈現細節由 ui-ux-designer 決議
  - **空態**：若 `availableColumns` 為空陣列，dropdown 顯示對應空態提示且儲存按鈕停用
  - 儲存後若 `fieldType = categorical`，仍顯示提示「請至 POOLDATA 可選值維護頁設定可選值」（沿用既有行為）
- **編輯 Modal**：與新增相同，但 `column_name` 為唯讀
- **`field_type` 變更警告 Modal**：自 categorical 改為 numeric / date 時彈出，內容「此欄位 {N} 個啟用可選值將自動停用（軟停用，歷史保留不刪除），且不再套用於新名單篩選；確定繼續？」+「確認」/「取消」按鈕；N 由 service 層 `GET options?active=true` 預查得到並回填至前端 Modal
- **停用確認 Modal**：「確認停用 {displayName}？此欄位將立即從新名單定義條件選單中消失，但既有名單條件不受影響。」
- **成功提示 toast（v1.4 一致化）**：以 `displayName` 為主，例如「欄位『風險等級』已新增」/「欄位『風險等級』已編輯」/「欄位『風險等級』已停用」/「欄位『風險等級』已啟用」；不再以 `columnName` 為主之文案

## 8. 依賴關係

- **Blocked By**：
  - US-092 對應 spec（M06 代碼維護基礎頁面，本 Feature 為新分頁擴充）
  - F002（角色定義 + JWT claim `businessRole`）
- **Blocks**：
  - F076（類別型可選值維護，依賴本 Feature 的 `field_type = categorical` 標記）
  - F050 v2.0（新名單定義草稿階段，條件篩選欄位選單來源）

## 9. 交叉參照

- **權限矩陣**：[F002 §4.6 E07 角色矩陣](F002-user-login.md#e07-角色矩陣)
- **資料模型**：
  - [data-model.md#pooldata-field-whitelist](../data-model.md#pooldata_field_whitelist--pooldata-篩選欄位白名單)
- **錯誤代碼**：
  - [error-handling.md#assignment-role-errors](../error-handling.md#assignment-role-errors)
  - error-handling.md（新增 `POOLDATA_FIELD_DUPLICATE` / `POOLDATA_FIELD_NOT_FOUND` / `POOLDATA_FIELD_TYPE_INVALID`）
- **架構決議**：AD-E07-1
- **相關功能**：
  - [F076](F076-manage-categorical-field-values.md)（類別型欄位可選值維護）
  - [F050 v2.0](F050-create-list-definition.md)（新名單定義，動態欄位來源）
- **圖表**：
  - [diagrams/F075-whitelist-flow.mmd](../diagrams/F075-whitelist-flow.mmd)
- **Reference SP**：`reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st1_list.sql`（初始 seed 來源）
- **Reference Table**：`reference/TableSchema/OB/OBPOOLDATA.sql`（合法 `column_name` 參照來源）

## 10. 測試覆蓋目標

- 單元測試覆蓋率 ≥ 80%
- 後端關鍵測試案例：
  - 初始 seed（8 筆）→ 全部寫入；重複執行 seed → 不增加
  - 部長 POST 新增 categorical 欄位 → 201 Created + 稽核
  - Admin POST → 201
  - 處長 POST → 403 `AUTH_FORBIDDEN`
  - POST 重複 `column_name`（含已停用）→ 409 `POOLDATA_FIELD_DUPLICATE`
  - POST `fieldType = 'invalid'` → 422 `POOLDATA_FIELD_TYPE_INVALID`
  - 部長 PATCH 更新 displayName → 200 OK + 稽核
  - PATCH categorical → numeric → 200 OK + 稽核（前端負責警告）
  - 部長 DELETE 停用 → 200 OK，`is_active = false`，稽核 `action = 'DISABLE'`
  - 已停用名單 / 月跑進行中不影響 GET（白名單獨立於月跑流程）
  - 停用欄位後月跑仍可讀取既有條件（AC-8 場景）
  - 部長 GET available-columns → 200 OK，僅含 OBPOOLDATA 既有但不在白名單之欄位（含 is_active=false 過濾，對應 AC-10 / BR-13）
  - Admin GET available-columns → 200 OK
  - 處長 / 課長 / 業務人員 GET available-columns → 403 `AUTH_FORBIDDEN`（對應 AC-11）
  - GET available-columns suggestedFieldType 推斷正確性：numeric / integer / decimal / double precision / real / bigint → `numeric`；date / timestamp / timestamptz → `date`；其餘含 null → `categorical`（對應 AC-12 / BR-12）
  - GET available-columns 結果按 columnName 字母升冪排序（對應 AC-10）
  - GET available-columns 當 OBPOOLDATA 所有欄位皆已列入白名單 → 回傳空陣列
- 前端關鍵測試案例：
  - 處長頁面**無**任何操作按鈕
  - 部長頁面顯示新增 / 編輯 / 停用按鈕
  - `field_type = categorical` 顯示「管理可選值」按鈕
  - `field_type = numeric` / `date` 無「管理可選值」按鈕
  - 新增 categorical 後顯示提示 toast
  - 新增 Modal 之 columnName 為 dropdown，非自由輸入（AC-13 / BR-11）
  - dropdown 為空時 Modal 顯示空態且儲存按鈕停用（AC-13）
  - 選中 dropdown 欄位後 fieldType radio 預選為 suggestedFieldType，且顯示「系統推斷」hint（AC-14）
  - 使用者覆寫 fieldType 後 hint 文字切換為「使用者選擇」（AC-14）
  - 新增成功 toast 文案以 displayName 為主，不以 columnName 為主（AC-15）
  - sidebar / breadcrumb / 頁面 H1 顯示「篩選欄位管理」字串（UI 命名規範）
  - 新增 Modal 標題顯示「新增篩選欄位」字串（UI 命名規範）
- E2E：新增 RISK_LEVEL（categorical）→ F076 維護可選值 → F050 新名單表單可選擇 → 停用 → F050 表單消失 → 既有名單月跑不受影響

## 11. 實作 Checklist

- [ ] 後端建表 `pooldata_field_whitelist` + UNIQUE index on `column_name`
- [ ] 後端新增 GET / POST / PATCH / DELETE 4 個端點 + Service
- [ ] 後端套 `DirectorGuard`（寫入）/ `DirectorOrSectionChiefGuard`（GET）+ `FeatureFlagGuard`（寫入）
- [ ] Seed 腳本 + 冪等性測試
- [ ] error-handling.md 新增 `POOLDATA_FIELD_DUPLICATE` / `POOLDATA_FIELD_NOT_FOUND` / `POOLDATA_FIELD_TYPE_INVALID`
- [ ] 前端 M06 新增「POOLDATA 篩選欄位」分頁
- [ ] 前端列表 / 新增 / 編輯 / 停用 Modal
- [ ] 前端處長唯讀渲染邏輯
- [ ] 圖表：[diagrams/F075-whitelist-flow.mmd](../diagrams/F075-whitelist-flow.mmd)
- [ ] 整合測試：F075 → F076 → F050 路徑驗證
- [ ] 後端新增 `GET /api/v1/pooldata-fields/available-columns` 端點 + `DirectorGuard` + `FeatureFlagGuard`（v1.4）
- [ ] 後端 available-columns 過濾邏輯：扣除所有 `pooldata_field_whitelist` 紀錄（含 `is_active = false`，對應 BR-13）
- [ ] 後端 suggestedFieldType 推斷邏輯（對應 BR-12 規則表）
- [ ] 前端新增 Modal 改為 dropdown，移除自由文字輸入路徑（v1.4 / BR-11）
- [ ] 前端 fieldType radio 預選 + 「系統推斷」/「使用者選擇」hint 切換（AC-14）
- [ ] 前端 sidebar / breadcrumb / 頁面 H1 / AppLayout title 改名為「篩選欄位管理」
- [ ] 前端新增 Modal 標題改為「新增篩選欄位」
- [ ] 前端成功 toast 文案統一為 displayName 為主
- [ ] **附帶清理**：修正既有 prototype 第 187 行 `WHITELIST_FIELD_DUPLICATE` → `POOLDATA_FIELD_DUPLICATE`
- [ ] **附帶清理**：修正既有 FE footer 第 409 行 `WHITELIST_FIELD_DUPLICATE` → `POOLDATA_FIELD_DUPLICATE`
- [ ] A-3 升級為 [RESOLVED] 之新增階段防護驗證（既有歷史孤兒偵測仍待後續 spec 處理）

## 12. 假設

| # | 假設 | 標記 |
|---|---|---|
| A-1 | **`pooldata_field_whitelist` schema 細節**：本 spec 列出概念欄位，DB schema 由 system-architect 決議（含 PK 設計：是否以 `column_name` 直接為 PK、或加 surrogate id） | [ASSUMPTION] 待 system-architect |
| A-2 | **硬刪除支援**：MVP 僅支援軟刪除（is_active = false）；硬刪除待 OQ-102-02 決議 | [ASSUMPTION] 待 PO |
| A-3 | **OBPOOLDATA 欄位變化追蹤**：v1.4 已透過 `GET /api/v1/pooldata-fields/available-columns` 過濾邏輯（BR-11 + BR-13）確保新增階段不會產生孤兒欄位（dropdown 來源即為 OBPOOLDATA 既有欄位扣除已存在白名單者）。**既有歷史孤兒欄位偵測**（既有白名單紀錄之 `column_name` 因 ETL 端 OBPOOLDATA 廢除而成為孤兒之偵測 / 告警 / 清理機制）仍待後續 spec 處理，非 v1.4 範圍 | [RESOLVED] v1.4（新增階段）/ 歷史偵測待後續 spec |
| A-4 | **Feature Flag gating 範圍**：F075 寫入端點屬 `ENABLE_E07_REFACTOR_PHASE3` flag gating；GET 不受限以保證下游 spec 可讀 | 沿用 F050 v2.0 §13.2 |

## 13. 變更紀錄

| 版本 | 日期 | 變更內容 |
|---|---|---|
| v1.0 | 2026-05-15 | 初版（取代 US-102，E07 補修批次 4）：新建 `pooldata_field_whitelist` 表；寫入限部長 + Admin（`DirectorGuard`）；查看開放至處長（`DirectorOrSectionChiefGuard`）；初始 8 筆 seed；停用不回溯既有條件；新增 3 個 errCode |
| v1.1 | 2026-05-16 | **Phase 1 風險決議落地**：(1) 決議 #2：新增 BR-10 Feature Flag fallback（503 + `FEATURE_NOT_ENABLED`），僅作用於寫入端點 |
| v1.2 | 2026-05-16 | **救援重寫**：前一輪編碼事故損毀本檔內容，依 US-102 + AD-E07 v3.0 一致性決議完整重建；Guard 名稱統一為 `DirectorGuard` / `DirectorOrSectionChiefGuard`（廢除 `SalesManagerGuard`）；保留 v1.0 / v1.1 所有設計決議 |
| v1.3 | 2026-05-17 | **PO 決議 F076-C 軟停用機制補修**（v1.2 救援過程遺失）：(1) BR-7 從「保留紀錄不刪除」強化為「service 層批次 SET `is_active = false` + `deactivation_reason = 'field_type_changed'`（同 transaction）」；(2) AC-6 confirm 文字補「將自動停用 N 個可選值」+ 稽核 details 補 `deactivatedOptionCount`；(3) UI Modal 文字升級；(4) 與 F076 v1.3 BR-6/BR-7 + data-model.md `pooldata_field_option.deactivation_reason` ENUM 對齊 |
| v1.4 | 2026-05-18 | **UI 命名標準化 + 新增流程改 dropdown + suggestedFieldType 推斷 + A-3 風險清除**：(1) UI 層命名「白名單管理」/「POOLDATA 篩選欄位白名單」→「**篩選欄位管理**」、「新增白名單欄位」/「新增 POOLDATA 欄位」→「**新增篩選欄位**」（內部 DB 表名 / API path / 類別名稱 100% 保留）；(2) 新增 §5.5 `GET /api/v1/pooldata-fields/available-columns` 端點（`DirectorGuard`，過濾含停用欄位，按 columnName 字母排序）；(3) 新增 AC-10 ~ AC-15（AC-16 不納入 — PO 決議不保留 fallback toggle）；(4) 新增 BR-11 / BR-12 / BR-13；(5) 新增 Modal 改為 dropdown 唯一路徑 + 「系統推斷 → 使用者選擇」hint 切換；(6) 成功 toast 文案以 `displayName` 為主；(7) A-3 升級為 [RESOLVED]（新增階段）；(8) **附帶清理**：修正既有 prototype L187 + FE footer L409 之 `WHITELIST_FIELD_DUPLICATE` 字串為 spec 權威之 `POOLDATA_FIELD_DUPLICATE`（spec §5.4 已是正確版本，本次同步前端字串） |
| v1.4.1 | 2026-05-19 | **prototype 對齊補修**：(1) 從 sidebar 移除「篩選欄位管理」獨立項（v1.3 起就不該有，對齊 prototype 37-base-code.html L186-243 設計）；(2) `base-codes-page.tsx` 加入「進階維護」區塊兩張卡片入口（F075「篩選欄位管理」+ F076「類別型欄位可選值」），對應 prototype 37-base-code.html L186-243；(3) prototype 37-base-code.html L192/L204/L209 命名同步至 v1.4（`v1.1 → v1.4`、`POOLDATA 篩選欄位白名單 → 篩選欄位管理`、`field_whitelist → pooldata_field_whitelist`）；(4) regression guard `m06-naming-regression.spec.ts` 補 sidebar 不應出現「篩選欄位管理」/「白名單管理」斷言；(5) §7 頁面入口描述修正：由 sidebar 獨立分頁改為「代碼維護頁進階維護區塊卡片」 |
| v1.4.2 | 2026-05-19 | **D1 設計修補：available-columns 錯誤碼分流**：(1) `getAvailableColumns` 改為兩階段查詢（Step 1 確認 `ob_pool_data` 表存在、Step 2 NOT IN 子查詢取欄位清單），移除原本 try/catch 吞錯回空陣列導致 UI 誤導「全部已列入」訊息的問題；(2) §5.5 錯誤代碼表新增 `503 OBPOOLDATA_NOT_READY`（表不存在 / ETL 尚未 Load / SQLite 環境 information_schema 不可用）；(3) AC-13 拆為 AC-13a（既有：dropdown 為唯一新增路徑）+ AC-13b（新：dropdown 空態依錯誤碼分流顯示對應訊息與「重試」按鈕，四種狀態為 200 空陣列 / 503 OBPOOLDATA_NOT_READY / 503 FEATURE_NOT_ENABLED / 其他 5xx）；(4) 前端 `field-whitelist-page.tsx` `loadAvailableColumns` 可重用函式 + dropdown render 四級優先序（loading → error → empty「全部已列入」→ 選項列表）；(5) E2E TS-F075-E2E-001/002/008 SQLite 環境斷言由 `200 + availableColumns: []` 改為 `503 OBPOOLDATA_NOT_READY`，路由排序回歸仍可區分 503 vs 404；(6) Dev 環境驗證：補 ETL `ob_pool_data` 表存在 → director 開啟 Modal 可見 121 個未列入欄位，符合 OBPOOLDATA 實際資料量 |
| v1.4.3 | 2026-05-19 | **case 對齊補修（補修 mini-tdd，非常態化 spec 改動）**：(1) **Root cause**：原 SQL Server `OBPOOLDATA` 大寫欄位慣例（PROD_KIND / LIST_TYPE / ...）與 PostgreSQL ETL 後表 `ob_pool_data` 之 snake_case 實際欄位（prod_kind / list_type / ...）不一致；`getAvailableColumns` SQL 子查詢 `WHERE c.column_name NOT IN (SELECT w.column_name)` 為 case-sensitive 字串比對，導致過濾失效（dropdown 多顯示 8 筆已列入欄位）；使用者從 dropdown 選擇小寫欄位後，DTO `@Matches(/^[A-Z][A-Z0-9_]{0,63}$/)` 大寫 regex 422 拒絕；(2) **生產碼變更**：m22 / m24 seed migration 8 筆 fields + 16 筆 options column_name 全部改小寫；DTO regex 改為 `/^[a-z][a-z0-9_]{0,63}$/`；錯誤訊息「OBPOOLDATA 欄位命名慣例（大寫）」改為「`ob_pool_data` PostgreSQL snake_case 命名」；(3) **AC / 範例更新**：AC-1 seed 欄位列表小寫；AC-8 / AC-10 範例字串小寫；§5 API request/response 範例之 columnName 字串小寫；(4) **新增 BR-14**：`column_name` 命名規範（對齊 PostgreSQL `ob_pool_data` snake_case；不影響 F068 `ob_code_df.tbl_id` 大寫業務常數）；(5) **資料庫**：Dev DB 已由使用者 SQL UPDATE 修正 8 筆 whitelist + 16 筆 options column_name 至小寫；(6) **不動範圍**：F068 `ob_code_df.tbl_id`（PROD_KIND / SPEC_TP / CASE_STATUS 大寫業務常數）、F068 / F069 / F070 / F071 之 assignment-code / assignment-scoring 模組、reference SP / 原 SQL Server 表描述、計分卡 `ob_levelcard_column.column_name`（與本欄為不同表，仍為大寫常數） |
