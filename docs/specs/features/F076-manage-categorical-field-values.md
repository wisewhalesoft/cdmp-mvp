---
spec-id: F076
title: 類別型欄位可選值管理
feature-id: F076
source-story: US-103, US-125
epic: E07
module: M06 篩選欄位（v2.1 rename，原 M06 代碼維護（進階））
priority: P0-MVP
version: "1.5"
date: 2026-05-20
status: Draft
---

# F076: 類別型欄位可選值管理

Priority: P0-MVP | Status: Draft | Last Updated: 2026-05-20

> **v1.5（2026-05-20 / F050 v2.1 重構 seed 對齊 US-125）**：AC-3 seed 清單依 US-125 全面對齊：(1) **新增 case_status 4 筆**（`01` 期中（不含當月滿期）/ `02` 中結 / `03` 滿期（含當月滿期）/ `04` 滿期；US-125 AC-2 / E4），業務語意對照引用 F050 v2.1 §5.1.1；對應 F075 v1.5 新增之 `case_status` 白名單條目；取代原 F068 `ob_code_df` `tbl_id='CASE_STATUS'` 之 4 筆代碼（A5）；(2) **caseyear seed 確認為 8 筆**（`0`~`6` + `99`；J5 拍板對應 m22 現行 8 筆 seed；取代 v2.0 F050 之前端 hardcoded 11 筆 0~10；A4），保留既有 v1.4.6 之 8 筆 seed 清單描述；(3) **spec_tp seed 從 placeholder 升級為真實 OBMCODEDF dump 32 筆**：m24 placeholder 3 筆改為依 `reference/DumpData/OBMCODEDF_20260505.csv` `TBL_ID='09'`（對應 SPEC_TP）之真實 dump 32 筆 OBMVALUE 列出（典型值：02 / 04 / 05 / 06 / 11 / 12 / 13 / 14 / 15 / 16 / 20 / 21 / 22 / 23 等；E5），`[ASSUMPTION]` 標記升 ✅ Resolved；(4) **不動範圍**：spec §5 API 路徑與 schema、§5.0 概念 schema（含 `deactivation_reason` ENUM `'manual'` / `'field_type_changed'`）、§6 BR 編號規則（BR-1 ~ BR-13 全保留）、§7 UI/UX 規範（含 v1.4.5 多欄位 accordion master 架構）、backend DTO、Guard、error code、既有 AC-1 / AC-2 / AC-4 ~ AC-10 語意、prototype 與 reference；F075 PATCH 觸發本表批次軟停用（BR-11）之語意保留。

> **v1.4.6 補修（2026-05-19 / seed 範圍對齊 F075 v1.4.6）**：對齊 F075 v1.4.6 之 5 欄 seed 範圍（`prod_kind` / `list_type` / `spec_tp` / `caseyear` / `settle_src`，對應舊系統 `reference/Areas/OBZ/Views/OBZ020/edit.cshtml` 之 5 個篩選欄位）。本版改動：(1) **AC-3 seed 清單移除 `best_case`**：F075 v1.4.6 已將 `best_case` 整個欄位從 whitelist 移除（runtime 未讀取），其 options 不再屬於 F076 維護範圍；(2) **`spec_tp` 仍保留並維持 [ASSUMPTION]**：`spec_tp` 仍為 F075 seed 之 5 欄之一，其 OBMVALUE 仍待 OBMCODEDF dump 確認；(3) **不動範圍**：spec §5 API 路徑與 schema、§5.0 概念 schema（含 `deactivation_reason` ENUM `'manual'` / `'field_type_changed'`）、§6 BR 編號規則、§7 UI/UX 規範、backend DTO、Guard、error code、prototype 與 reference；F075 PATCH 觸發批次軟停用（BR-11）之語意保留。
> **v1.4.5 補修（2026-05-19 / prototype 對齊翻新）**：對齊 prototype 37b-categorical-field-values.html main content（架構翻新）：(1) **§7 頁面架構翻新**：從單欄位 detail page 改為**多欄位 accordion master page**（對應 prototype L143）；(2) **§7 資料載入**：頁面載入時呼叫 `listFields({active:'true'})` 過濾 `fieldType==='categorical'` → 對每個欄位 `Promise.all` 呼叫 `listOptions`（不需 backend 變更）；(3) **§7 per-column 新增按鈕**：每個 accordion 內部底部「新增可選值」按鈕（context 由 accordion 提供，不再為頁面頂部單一按鈕），對應 prototype L436-437；testid `btn-add-option-{columnName}`；(4) **§7 全頁統計**：欄位數 / 啟用值總和 / 停用值總和（對應 prototype L131-134）；testid `option-stats` / `stats-fields-count` / `stats-active-count` / `stats-inactive-count`；(5) **§7「全部展開」按鈕**：工具列右側 `btn-expand-all` 點擊將所有 accordion 展開並寫入 localStorage（對應 prototype L136-138, L478-485）；(6) **§7 `?col=XX` query 改為可選 hint**：自動展開指定 accordion；缺值不再報錯（對應 prototype L680-687）；(7) **§7 三種狀態徽章**：啟用 / 自動停用（類別變更）/ 手動停用（依 `deactivationReason` 分流，對應 prototype L363-371）；(8) **§7 自動停用（field_type_changed）啟用攔阻**：點 rotate-ccw icon 顯示 warning toast「請先於 F075 將欄位類別改回 categorical」而非呼叫 API（對應 prototype L417, L536-539）；(9) **§7 新增 [DEFERRED] 區段**：明示 F076-M5（archived 欄位 UI 區塊）暫不實作的設計決策（方案 C）；(10) **不動範圍**：spec §5 API 路徑與 schema、backend service / DTO、sidebar、breadcrumb（v1.4.4 三層保留）、reference / prototype；既有 deactivate modal 結構保留。
> **v1.3.1 補修（2026-05-19）**：依 F075 v1.4.3 case 對齊：(1) AC-1 / AC-3 / AC-5 seed 欄位字串 + API 範例 columnName 由大寫（`PROD_KIND` 等）改小寫（`prod_kind` 等），對齊 PostgreSQL `ob_pool_data` snake_case；(2) §10 測試覆蓋目標欄位字串同步；(3) `pooldata_field_option.column_name` FK → `pooldata_field_whitelist.column_name` 之 case 由 m22 / m24 seed migration 保證（已於 F075 v1.4.3 變更）；(4) `spec_tp` / `best_case` 之 [ASSUMPTION] 留項不變（仍待 OBMCODEDF dump 確認 OBMVALUE），僅 column_name 對應改小寫。
> **v1.3 補修（2026-05-17）**：v1.2 救援過程遺失 PO 決議 F076-C 軟停用機制（task #16 system-architect Phase 1 6 PO 決議），補回：(1) §5.0 概念 schema 區塊補 `deactivation_reason VARCHAR(30) NULL` ENUM `'manual'` / `'field_type_changed'`；(2) AC-7 停用流程 reason 改為必填 textarea 200 字（OQ-E07-21 已 Resolved）；(3) BR-6 改寫為「F075 將欄位 `field_type` 從 categorical 改為其他類別時批次軟停用」+ 新增 BR-7「歷史保留 + `includeInactive=true` 查詢」；(4) 新增專屬 deactivate 端點 `PATCH /:columnName/options/:optionValue/deactivate` body `{ isActive: false, reason: string }` + 200 字驗證；(5) error-handling `WHITELIST_OPTION_INACTIVE` 警告碼 cross-ref。
> **v1.2 救援重寫（2026-05-16）**：前一輪編碼事故損毀本檔內容，依 US-103 + AD-E07 v3.0 一致性決議完整重建；Guard：寫入 `DirectorGuard`、查看 `DirectorOrSectionChiefGuard`（取代 `SalesManagerGuard`）；業務角色欄位 `business_role`；JWT claim `businessRole`；保留 v1.0 / v1.1 所有設計決議與 seed 清單。
> **v1.1 修訂（2026-05-16 / Phase 1 決議落地）**：Feature Flag fallback 503 + `FEATURE_NOT_ENABLED`（決議 #2）。

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `data-model.md#pooldata-field-option` + `data-model.md#pooldata-field-whitelist` + `error-handling.md#assignment-role-errors` |
| QA / Tester | 本文件 + `error-handling.md#assignment-role-errors` |
| UI/UX Designer | 本文件 §7 |
| Architect | 本文件 + `architecture-spec.md` §3.10 |

---

## 對應 User Story

- 來源 Story：[US-103-M06-manage-categorical-field-values.md](../../stories/epics/E07-app-customer-list-assignment/US-103-M06-manage-categorical-field-values.md)
- Epic：[E07 — 客戶名單分派](../../stories/epics/E07-app-customer-list-assignment/epic-brief.md)
- 模組：M06 代碼維護（進階）

---

## 1. 功能摘要

為 F075 白名單中 `field_type = categorical` 之欄位維護可選值列表（`option_value` + `option_label`），並支援停用 / 啟用。新名單定義表單之多選元件只呈現啟用值；停用值「不回溯」既有名單條件，月跑讀取直接讀 `ob_list_definition.filter_conditions` JSONB。

**範圍**：
- 新建 `pooldata_field_option` 表，欄位包含 `column_name`（FK → `pooldata_field_whitelist`）、`option_value`、`option_label`、`is_active`、`deactivation_reason`（軟停用原因 ENUM，詳見 §5.0），複合唯一鍵 `(column_name, option_value)`
- 部長 / Admin 可寫入；處長唯讀（可進入頁面查看，無編輯按鈕）
- 系統首次部署時自動 seed 各 categorical 欄位之初始可選值
- 停用值「不回溯」既有名單條件

## 2. 使用者故事

**As a** 部長 / Admin
**I want** 為白名單中「類別型」欄位維護可選值清單，並能停用特定值
**So that** 名單定義表單之多選元件只呈現有效可選值，無效或作廢的選項不再出現

## 3. 前置條件

- 使用者持 JWT 且 `business_role IN ('director', 'section_chief')` 或 admin
- 寫入操作須 `business_role = 'director'` 或 admin
- 對應之白名單欄位（`pooldata_field_whitelist`，由 **F075 v1.5** 維護，含 v1.5 新增之 `case_status` 條目；US-125 AC-5）已存在且 `field_type = 'categorical'`
- 系統首次部署時 Admin 已執行 seed 腳本

## 4. 驗收標準

### AC-1：部長 / Admin 查看某 categorical 欄位的可選值列表

- **Given** 部長 / Admin 進入 M06 > POOLDATA 篩選欄位分頁，點擊某 `field_type = categorical` 欄位之「管理可選值」
- **When** 頁面載入
- **Then** 以表格顯示該欄位之全部可選值：`option_value` / `option_label` / 狀態（啟用 / 停用）
- **And** 停用可選值仍顯示於列表（灰色或停用標記）

### AC-2：處長進入此頁面為唯讀

- **Given** 帳號僅持有「處長」角色
- **When** 進入某 categorical 欄位之可選值管理頁
- **Then** 可查看可選值列表（同 AC-1 資料呈現）
- **And** 頁面**不顯示**任何「新增可選值」「停用」「啟用」操作按鈕
- **And** 若處長嘗試直接呼叫可選值寫入 API，後端回 403 `AUTH_FORBIDDEN`

### AC-3：系統首次部署時自動 Seed 各欄位初始可選值（v1.5 全面對齊 US-125）

- **Given** 系統首次部署
- **When** Admin 執行初始化
- **Then** 系統自動 seed 各 categorical 欄位之初始可選值（v1.5 對齊 F075 v1.5 之 **6 欄 seed 範圍** + US-125 AC-1/AC-2/E4/E5）：
  - **prod_kind**：01（汽車新車）/ 02（機車）/ 03（其他商品），至少 3 筆
  - **list_type**：01（期中）/ 02（中結）/ 03（滿期），3 筆
  - **caseyear**：0 / 1 / 2 / 3 / 4 / 5 / 6 + 99（不限年數），共 **8 筆**（J5 拍板：對應 m22 現行 8 筆 seed；取代 v2.0 F050 之前端 hardcoded 11 筆 0~10；US-125 AC-1 / A4）。`99` UI 顯示輔助說明文字「不限年數（全選）」（§7）
  - **settle_src**：Y（含他行代償）/ N（不含他行代償），2 筆
  - **spec_tp**：依 `reference/DumpData/OBMCODEDF_20260505.csv` `TBL_ID='09'`（對應 SPEC_TP）之真實 OBMCODEDF dump，共 **32 筆** OBMVALUE（典型代碼包含 02 / 04 / 05 / 06 / 11 / 12 / 13 / 14 / 15 / 16 / 20 / 21 / 22 / 23 等；E5 / 取代 v1.4.6 之 m24 placeholder 3 筆 [ASSUMPTION]；本 v1.5 升 ✅ Resolved，具體 32 筆完整對應由 Phase 3a system-architect 依 dump 寫入 m25+ migration）
  - **case_status**：**4 筆**（v1.5 新增，US-125 AC-2 / A5 / E4，取代原 F068 `ob_code_df` `tbl_id='CASE_STATUS'`）：
    - `01` 期中（不含當月滿期）
    - `02` 中結
    - `03` 滿期（含當月滿期）
    - `04` 滿期
    - 4 個值之業務語意對照詳見 [F050 v2.1 §5.1.1 case_status 4 個值業務語意對照表](F050-create-list-definition.md#511-case_status-4-個值業務語意對照表)（依 `reference/SP/USP_OB_OBPOOLDATA.sql:189-216` + DB 實證 1,487,695 筆，OQ-E07-23 ✅ Resolved 2026-05-12）
- **And** seed 為冪等操作（重複執行不產生重複資料）

### AC-4：部長 / Admin 新增可選值

- **Given** 部長 / Admin 在可選值列表頁點擊「新增可選值」
- **When** 填入 `option_value`（必填）、`option_label`（必填），點擊儲存
- **Then** 新可選值以 `is_active = true` 新增，立即出現在列表
- **And** 操作寫入 `assignment_audit_log`（`action = 'CREATE'`、`entity_type = 'pooldata_field_option'`、`entity_id` 含 `columnName.optionValue`）

### AC-5：`option_value` 在同欄位內唯一性驗證

- **Given** 部長 / Admin 嘗試為欄位新增 `option_value`，與同欄位下現有某值（無論啟用或停用）重複
- **When** 點擊儲存
- **Then** 系統顯示錯誤「此可選值已存在（狀態：停用），如需重新使用請改為啟用操作」，不新增重複紀錄
- **And** 後端回 409 `POOLDATA_OPTION_DUPLICATE`

### AC-6：部長 / Admin 停用可選值（v1.3 / 2026-05-17 / OQ-E07-21 落地 — reason 必填）

- **Given** 部長 / Admin 點擊某可選值之「停用」按鈕
- **When** 確認 Modal（含「停用原因」textarea，**必填**、最大 200 字）後執行
- **Then** 系統呼叫 `PATCH /api/v1/pooldata-fields/{columnName}/options/{optionValue}/deactivate`，body `{ "isActive": false, "reason": "<200 字內說明>" }`
- **And** 該 `option_value` 之 `is_active` 設為 false、`deactivation_reason = 'manual'`，**立即**從新名單定義多選元件選項中消失
- **And** 已在**現有**名單定義條件中選取此值的設定**不受影響**（不回溯）；月跑遇到引用 inactive 值僅產生警告 `WHITELIST_OPTION_INACTIVE`（詳 [error-handling.md#assignment-run-warnings](../error-handling.md#assignment-run-warnings)）
- **And** reason 為空字串、>200 字、或欄位缺失 → 後端回 422 `VALIDATION_ERROR`（field: `reason`）
- **And** 操作寫入 `assignment_audit_log`（`action = 'DISABLE'`、details 含 `reason`、`deactivationReason = 'manual'`）

### AC-7：停用可選值不中斷月跑

- **Given** 名單 `OB202604010` 之 prod_kind 條件含 `02`；部長停用 prod_kind 之 `02`
- **When** 觸發月跑（F061 / F081），月跑 Stage 1 讀取 `OB202604010` 之篩選條件
- **Then** 月跑仍正確以 `prod_kind INCLUDE ['02', ...]` 過濾 OBPOOLDATA，月跑完成不報錯

### AC-8：部長 / Admin 重新啟用已停用的可選值

- **Given** 某可選值已被停用（`is_active = false`）
- **When** 部長 / Admin 點擊「啟用」並確認
- **Then** `is_active` 重設為 true，該值立即重新出現於新名單定義多選元件
- **And** 操作寫入 `assignment_audit_log`（`action = 'ENABLE'`）

### AC-9：僅 categorical 欄位可進入可選值管理頁

- **Given** 部長 / Admin 在 F075 列表查看某欄位
- **When** 欄位 `field_type = numeric` 或 `date`
- **Then** 不顯示「管理可選值」連結或按鈕；若直接訪問對應 URL，後端回 400 `POOLDATA_OPTION_FIELD_TYPE_INVALID`

### AC-10：新名單定義表單多選選項只顯示啟用值

- **Given** 白名單欄位 `prod_kind`（categorical）有 5 個可選值，2 個已停用
- **When** 部長 / Admin 開啟新名單定義表單，選擇 prod_kind 為篩選欄位
- **Then** 多選元件只呈現 3 個啟用值，不顯示已停用的 2 個

## 5. API 規格

### 5.0 概念 Schema（v1.3 / 2026-05-17 補 — DB 細節以 data-model.md 為權威）

| 欄位 | 型別 | NULL | 說明 |
|---|---|---|---|
| column_name | VARCHAR(64) | NOT NULL | FK → `pooldata_field_whitelist.column_name`（複合 PK 第 1 欄） |
| option_value | VARCHAR(64) | NOT NULL | 可選值（複合 PK 第 2 欄） |
| option_label | VARCHAR(100) | NOT NULL | 顯示文字 |
| is_active | BOOLEAN | NOT NULL DEFAULT true | 啟用旗標 |
| **deactivation_reason** | **VARCHAR(30)** | **NULL** | **v1.3 / 2026-05-17 新增 / PO 決議 F076-C 落地**：軟停用原因 ENUM（CHECK constraint 強制），合法值：`'manual'`（手動於 F076 停用，預設）/ `'field_type_changed'`（因 F075 將 `field_type` 從 `categorical` 切換為其他類別自動軟停用，沿用 F075 v1.3 BR-7）；`is_active = true` 時為 NULL；`is_active = false` 時非 NULL |
| created_at | TIMESTAMP | NOT NULL | 建立時間 |
| updated_at | TIMESTAMP | NOT NULL | 最後更新時間 |

**ENUM 規範**：
- `'manual'`：透過 `PATCH /:columnName/options/:optionValue/deactivate` 由部長 / Admin 主動停用；DTO `reason` 額外寫入 `assignment_audit_log.details`
- `'field_type_changed'`：由 F075 PATCH 觸發批次更新（同 transaction），無 user-supplied reason；details 寫入 `triggeredBy: 'F075_field_type_change'`

詳細 schema 及 migration 規範見 [data-model.md#pooldata_field_option](../data-model.md#pooldata_field_option--可選值)。

### 5.1 GET /api/v1/pooldata-fields/{columnName}/options

| 用途 | 取得某 categorical 欄位之可選值列表 |
|---|---|
| 認證 | JWT 必填 |
| 權限 | `DirectorOrSectionChiefGuard` |

**Query Params**：
- `?active=true|false`（可選；不帶則回啟用值，**等同於 v1.2 既有行為**）
- `?includeInactive=true`（v1.3 / 2026-05-17 新增）：回傳全部含 inactive 紀錄供歷史追溯（F076 維護頁、稽核查詢、F051 名單編輯頁顯示已停用條件值之 label 用）；與 `active` query 互斥（同時帶以 `includeInactive` 優先）

**Response — 200 OK**

```json
{
  "columnName": "prod_kind",
  "options": [
    { "optionValue": "01", "optionLabel": "汽車新車", "isActive": true },
    { "optionValue": "02", "optionLabel": "機車", "isActive": true },
    { "optionValue": "03", "optionLabel": "其他商品", "isActive": false }
  ]
}
```

### 5.2 POST /api/v1/pooldata-fields/{columnName}/options

| 用途 | 新增可選值 |
|---|---|
| 認證 | JWT 必填 |
| 權限 | `DirectorGuard` |

**Request Body**

```json
{
  "optionValue": "09",
  "optionLabel": "農業機具"
}
```

**Response — 201 Created**

```json
{
  "columnName": "prod_kind",
  "optionValue": "09",
  "optionLabel": "農業機具",
  "isActive": true
}
```

### 5.3 PATCH /api/v1/pooldata-fields/{columnName}/options/{optionValue}（啟用用途）

| 用途 | 重新啟用已停用之可選值（is_active false → true） |
|---|---|
| 認證 | JWT 必填 |
| 權限 | `DirectorGuard` |

**Request Body**

```json
{ "isActive": true }
```

啟用時 service 層自動清空 `deactivation_reason` 為 NULL；不接受 `isActive: false`（停用須改用 §5.4 端點）。若 body 傳 `isActive: false` → 422 `VALIDATION_ERROR` 並提示「停用請改用 deactivate 端點」。

### 5.4 PATCH /api/v1/pooldata-fields/{columnName}/options/{optionValue}/deactivate（v1.3 / 2026-05-17 新增 — 停用專屬）

| 用途 | 停用可選值（is_active true → false）並要求填寫停用原因 |
|---|---|
| 認證 | JWT 必填 |
| 權限 | `DirectorGuard` |

**Request Body**

```json
{
  "isActive": false,
  "reason": "本產品 2026 起停售，可選值不再使用"
}
```

**DTO 驗證規則**：
- `isActive` 必填且必須為 `false`（防呆，避免端點誤用）
- `reason` 必填、字串、`minLength: 1`、`maxLength: 200`（中文以 1 字計）
- 違反 → 422 `VALIDATION_ERROR`，details `field: 'reason' | 'isActive'`

**Service 層行為**：
- SET `is_active = false`、`deactivation_reason = 'manual'`、`updated_at = NOW()`
- 寫入 `assignment_audit_log`：`action = 'DISABLE'`、`entity_type = 'pooldata_field_option'`、`entity_id = {columnName}.{optionValue}`、details `{ reason, deactivationReason: 'manual' }`
- 已停用紀錄重新呼叫此端點 → 200 OK（idempotent，僅更新 `reason` 與 `updated_at`）

**Response — 200 OK**

```json
{
  "columnName": "prod_kind",
  "optionValue": "03",
  "optionLabel": "其他商品",
  "isActive": false,
  "deactivationReason": "manual",
  "reason": "本產品 2026 起停售，可選值不再使用"
}
```

**錯誤代碼**

| HTTP | 錯誤碼 | 說明 |
|---|---|---|
| 401 | AUTH_TOKEN_MISSING / AUTH_TOKEN_EXPIRED | 未登入或 Token 過期 |
| 403 | AUTH_FORBIDDEN | 處長嘗試寫入 |
| 400 | POOLDATA_OPTION_FIELD_TYPE_INVALID | 欄位 `field_type != 'categorical'` |
| 404 | POOLDATA_FIELD_NOT_FOUND | `columnName` 不存在於白名單 |
| 404 | POOLDATA_OPTION_NOT_FOUND | `optionValue` 不存在 |
| 409 | POOLDATA_OPTION_DUPLICATE | `optionValue` 已存在（同欄位） |
| 503 | FEATURE_NOT_ENABLED | Feature Flag 關閉 |

## 6. 業務規則

| 規則編號 | 說明 |
|---|---|
| BR-1 | **複合唯一鍵 `(column_name, option_value)`**：DB 加 UNIQUE index；衝突回 409 `POOLDATA_OPTION_DUPLICATE` |
| BR-2 | **僅 categorical 欄位**：寫入 / GET 前須先檢查 `pooldata_field_whitelist.field_type = 'categorical'`，否則回 400 `POOLDATA_OPTION_FIELD_TYPE_INVALID` |
| BR-3 | **不支援硬刪除**：MVP 僅支援軟刪除（`is_active = false`）；硬刪除待 OQ-103-03 決議 |
| BR-4 | **停用後不回溯**：月跑 Stage 1 讀取 `ob_list_definition.filter_conditions` 時，**不 join** `pooldata_field_option` 做有效性驗證；既有條件即使可選值停用仍可正確過濾 |
| BR-5 | **角色矩陣**：寫入端點（POST / PATCH）限 `admin` 或 `business_role = 'director'`；GET 開放至 `business_role = 'section_chief'`；對應 `DirectorGuard` 與 `DirectorOrSectionChiefGuard` |
| BR-6 | **F075 白名單前置**：本 Feature 之可選值掛載於 F075 已存在之 categorical 欄位；若白名單欄位被停用（`is_active = false`），本 Feature 操作不受影響（可選值仍可維護） |
| BR-7 | **稽核失敗不 rollback**：沿用 F050 v2.0 BR-11 |
| BR-8 | **Seed 冪等性**：seed 腳本以 `INSERT ... ON CONFLICT (column_name, option_value) DO NOTHING` 實現 |
| BR-9 | **F050 動態多選來源**：F050 新名單定義表單多選元件呼叫 GET `/api/v1/pooldata-fields/{columnName}/options?active=true`，僅取啟用值 |
| BR-10 | **Feature Flag fallback（v1.1 / 決議 #2）**：F076 寫入端點受 `FeatureFlagGuard` 保護；flag = false 時回 503 `FEATURE_NOT_ENABLED`；GET 端點不受限 |
| BR-11 | **F076-C 批次軟停用（v1.3 / 2026-05-17 / PO 決議 task #16 落地，補回 v1.2 救援遺失內容）**：F075 PATCH 將某欄位 `field_type` 從 `'categorical'` 改為其他類別時，本 Feature 既有可選值由 F075 service 層**批次 SET `is_active = false` + `deactivation_reason = 'field_type_changed'`**（軟停用），執行於 F075 PATCH 同一 transaction；**不 CASCADE 刪除**、亦不阻擋父表 `field_type` 切換；對應之 F076 端點不接受外部 client 寫入 `deactivation_reason = 'field_type_changed'`（僅 F075 service 內部使用） |
| BR-12 | **歷史保留 + `includeInactive` 查詢（v1.3 / 2026-05-17 / PO 決議 task #16 落地）**：類別切換後 inactive 可選值**永久保留**供歷史追溯；GET `/options?includeInactive=true` 可查詢含 inactive 紀錄（含 `deactivationReason`）；F051 名單編輯頁載入既有條件值 label 時 SHOULD 帶此 query，避免 inactive 值顯示為 raw `option_value`；F050 新名單表單不帶此 query（沿用 BR-9 僅取啟用值） |
| BR-13 | **Manual 停用 reason 必填（v1.3 / 2026-05-17 / OQ-E07-21 Resolved）**：透過 §5.4 `PATCH /:columnName/options/:optionValue/deactivate` 端點停用時，DTO `reason` 必填、`maxLength: 200`；service 層寫入 `assignment_audit_log.details.reason`；空字串 / 超長 / 欄位缺失 → 422 `VALIDATION_ERROR`；reason 內容不額外驗證格式（業務自由填寫） |

## 7. UI/UX 需求

- **頁面入口**：F075 列表頁 categorical 欄位「管理可選值」連結
- **列表表格**：
  - 欄位：`option_value` / `option_label` / 狀態 / 操作
  - 停用值以灰色背景 + 「停用」徽章顯示
  - 操作欄：「停用 / 啟用」
  - 處長身份**完全不渲染**任何操作欄按鈕（含「新增可選值」上方按鈕）
- **新增可選值 Modal**：
  - 欄位：`option_value`（text，必填）/ `option_label`（text，必填）
  - 顯示提示文字：「此值將立即出現於新名單定義之多選選項；既有名單條件不受影響」
- **停用 / 啟用確認 Modal**：
  - 停用：「確定停用 {optionLabel}？此值將不再出現於新名單定義選項中，但既有名單條件不受影響。」
  - 啟用：「確認啟用 {optionLabel}？此值將立即重新出現於新名單定義選項中。」
- **成功提示 toast**：「可選值『{optionLabel}』已新增 / 停用 / 啟用」
- **caseyear 特殊值說明**：UI 對 `optionValue = '99'` 顯示輔助說明文字「99 = 不限年數（全選）」

### v1.4.5 多欄位 accordion master 規範（對齊 prototype 37b）

**頁面架構翻新**：v1.0 ~ v1.3.1 為「單欄位 detail page」（`?col=XX` 必填，缺值報錯），v1.4.5 改為「**多欄位 accordion master page**」。

**資料載入流程**：

1. 頁面載入 → 呼叫 `listFields({active:'true'})`
2. 前端過濾 `fieldType === 'categorical'` 的欄位
3. 對每個 categorical 欄位 `Promise.all` 呼叫 `listOptions(columnName, { includeInactive })`
4. 渲染對應的 accordion 列表

**testid 規範**：

| 元素 | testid | 描述 |
|---|---|---|
| 工具列 | `field-options-toolbar` | flex container |
| 顯示已停用 toggle | `toggle-include-inactive` | checkbox |
| 全頁統計 | `option-stats` | container |
| 統計子項 | `stats-fields-count` / `stats-active-count` / `stats-inactive-count` | 3 個數字 |
| 「全部展開」按鈕 | `btn-expand-all` | chevrons-down icon |
| 單一 accordion | `accordion-{columnName}` | `data-state="open"|"closed"` |
| Accordion summary 點擊區 | `accordion-summary-{columnName}` | button |
| Accordion 內每筆 status badge | `status-badge-{optionValue}` | 3 種文字依 `deactivationReason` 分流 |
| Accordion 內停用按鈕 | `btn-deactivate-{optionValue}` | ban icon |
| Accordion 內啟用按鈕 | `btn-reactivate-{optionValue}` | rotate-ccw icon；`data-blocked="true"` 表示 `field_type_changed` |
| Accordion 內新增可選值按鈕 | `btn-add-option-{columnName}` | per-column context |

**狀態徽章三種變體**（對應 prototype L363-371）：

| 條件 | 字串 | 樣式 |
|---|---|---|
| `isActive === true` | 「啟用」 | 綠色 |
| `isActive === false && deactivationReason === 'field_type_changed'` | 「自動停用（類別變更）」 | 琥珀色 |
| `isActive === false && deactivationReason !== 'field_type_changed'` | 「手動停用」 | 灰色 |

**禁用辭彙**（v1.0 / v1.3.1 字串）：「啟用中」「已停用」不可使用於徽章；舊有「自動停用」「類別變更停用」變體禁用。

**`field_type_changed` 啟用攔阻**：

- 點 `btn-reactivate-{optionValue}` 之 option：若 `deactivatedReason === 'field_type_changed'`，**不**呼叫 `reactivateOption` API
- 改顯示 warning toast：「無法直接啟用 {optionValue}：因類別變更而停用。請先於 F075 將欄位類別改回 categorical」

**localStorage persist 規範**：

- Key 格式：`cdmp.f076.acc.{columnName}.expanded`
- 值：`'1'`（展開）/ 不存在（collapsed）
- 觸發寫入：(a) 使用者點擊 accordion summary 展開、(b)「全部展開」按鈕、(c) `?col=XX` URL hint 命中
- 觸發刪除：使用者點擊 accordion summary 收闔

**`?col=XX` query 規範**：

- v1.0 ~ v1.3.1：必填，缺值報錯
- v1.4.5：**可選 hint**，僅作為「自動展開對應 accordion」之提示；缺值不報錯，僅顯示空態（無 categorical 欄位）或正常 collapsed 列表

### [DEFERRED] Prototype 對齊未實作項目（v1.4.5 範圍外）

| ID | Prototype 來源 | 延後原因 | 解決方案 |
|---|---|---|---|
| F076-M5 | 37b L345-354 archived 欄位 UI 區塊（含「歷史保留（已非 categorical）」徽章、不可新增 options 提示） | (1) 需新 backend endpoint 或 N+1 query 全部 listFields + listOptions 才能識別 archived 欄位；(2) MVP 範圍內 F051 既有 `?includeInactive=true` 查詢已能滿足名單編輯端 inactive option label 顯示需求；(3) archived 區塊純為「讀取展示」，非月跑必須 | 待 OQ 開啟後評估；具體方案為「新增 backend endpoint `GET /api/v1/pooldata-fields/archived`」或「Frontend N+1 query loop」二擇一 |

## 8. 依賴關係

- **Blocked By**：
  - F075（白名單，本 Feature 必須掛載於 categorical 欄位）
  - F002（角色定義 + JWT claim `businessRole`）
- **Blocks**：
  - F050 v2.0（新名單定義草稿階段，動態多選選項來源）

## 9. 交叉參照

- **權限矩陣**：[F002 §4.6 E07 角色矩陣](F002-user-login.md#e07-角色矩陣)
- **資料模型**：
  - [data-model.md#pooldata-field-option](../data-model.md#pooldata_field_option--可選值)
  - [data-model.md#pooldata-field-whitelist](../data-model.md#pooldata_field_whitelist--pooldata-篩選欄位白名單)
- **錯誤代碼**：
  - [error-handling.md#assignment-role-errors](../error-handling.md#assignment-role-errors)
  - error-handling.md（新增 `POOLDATA_OPTION_DUPLICATE` / `POOLDATA_OPTION_NOT_FOUND` / `POOLDATA_OPTION_FIELD_TYPE_INVALID`）
- **架構決議**：AD-E07-1
- **相關功能**：
  - [F075](F075-manage-pooldata-field-whitelist.md)（白名單，本 Feature 前置）
  - [F050 v2.0](F050-create-list-definition.md)（新名單定義，動態多選來源）
- **圖表**：
  - [diagrams/F076-option-flow.mmd](../diagrams/F076-option-flow.mmd)
- **Reference SP / Table**：`reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st1_list.sql`、`reference/TableSchema/OB/OBMCODEDF.sql`

## 10. 測試覆蓋目標

- 單元測試覆蓋率 ≥ 80%
- 後端關鍵測試案例：
  - 初始 seed（v1.5 / 6 欄）→ prod_kind 3 筆 / list_type 3 筆 / caseyear 8 筆（0~6 + 99）/ settle_src 2 筆 / spec_tp 32 筆（依 OBMCODEDF dump）/ **case_status 4 筆**（01/02/03/04）寫入；重複 seed → 不增加
  - 部長 GET `?active=true` → 只回啟用值
  - 部長 GET `?active=false` → 只回停用值
  - 部長 GET 不帶 query → 全部回傳
  - 部長 POST 新增 → 201 Created + 稽核
  - Admin POST → 201
  - 處長 POST → 403 `AUTH_FORBIDDEN`
  - POST 重複 `optionValue`（含已停用）→ 409 `POOLDATA_OPTION_DUPLICATE`
  - POST 非 categorical 欄位 → 400 `POOLDATA_OPTION_FIELD_TYPE_INVALID`
  - POST 不存在欄位 → 404 `POOLDATA_FIELD_NOT_FOUND`
  - 部長 PATCH `isActive = false` → 200 OK + 稽核 `DISABLE`
  - 部長 PATCH `isActive = true`（重新啟用）→ 200 OK + 稽核 `ENABLE`
  - 停用後新名單表單不顯示該值；既有名單月跑不受影響（AC-7 場景）
- 前端關鍵測試案例：
  - 處長頁面**無**任何操作按鈕
  - 部長頁面顯示新增 / 停用 / 啟用按鈕
  - numeric / date 欄位無「管理可選值」連結
  - caseyear `99` 顯示輔助說明文字
- E2E：F075 新增 RISK_LEVEL categorical → F076 維護 4 個可選值（3 啟用 + 1 停用）→ F050 新名單表單顯示 3 個值 → 月跑既有名單條件含已停用值仍正常執行

## 11. 實作 Checklist

- [ ] 後端建表 `pooldata_field_option` + 複合 UNIQUE index `(column_name, option_value)` + FK to `pooldata_field_whitelist`
- [ ] 後端新增 GET / POST / PATCH 3 個端點 + Service
- [ ] 後端套 `DirectorGuard`（寫入）/ `DirectorOrSectionChiefGuard`（GET）+ `FeatureFlagGuard`（寫入）
- [ ] 後端 categorical 欄位類別檢查
- [ ] Seed 腳本（v1.5 / 6 欄：prod_kind 3 / list_type 3 / caseyear 8 含 99 / settle_src 2 / spec_tp 32 依 OBMCODEDF dump / case_status 4）+ 冪等性測試
- [ ] error-handling.md 新增 `POOLDATA_OPTION_DUPLICATE` / `POOLDATA_OPTION_NOT_FOUND` / `POOLDATA_OPTION_FIELD_TYPE_INVALID`
- [ ] 前端「管理可選值」子頁面（自 F075 列表進入）
- [ ] 前端列表 / 新增 / 停用 / 啟用 Modal
- [ ] 前端處長唯讀渲染邏輯
- [ ] 前端 caseyear 99 輔助說明
- [ ] 圖表：[diagrams/F076-option-flow.mmd](../diagrams/F076-option-flow.mmd)
- [ ] 整合測試：F075 → F076 → F050 路徑驗證

## 12. 假設

| # | 假設 | 標記 |
|---|---|---|
| A-1 | **`pooldata_field_option` schema 細節**：本 spec 列出概念欄位；DB schema 由 system-architect 決議（PK 設計、FK 約束、`option_value` 字串長度上限） | [ASSUMPTION] 待 system-architect |
| A-2 | **`option_value` 排序（sort_order）**：MVP 不支援排序；前端依 `option_value` 字母順序顯示；硬性排序待 OQ-103-02 決議 | [ASSUMPTION] 待 PO（暫定不支援） |
| A-3 | **硬刪除支援**：MVP 僅支援軟刪除；硬刪除待 OQ-103-03 決議 | [ASSUMPTION] 待 PO |
| A-4 | **categorical → 非 categorical 時可選值處理**：F075 BR-7 規定保留既有可選值不刪除；本 spec 不主動清理「孤兒」可選值；若需清理機制待 system-architect 設計 | [ASSUMPTION] 待 system-architect |
| A-5 | **Feature Flag gating 範圍**：F076 寫入端點屬 `ENABLE_E07_REFACTOR_PHASE3` flag gating；GET 不受限以保證 F050 可讀 | 沿用 F050 v2.0 §13.2 |

## 13. 變更紀錄

| 版本 | 日期 | 變更內容 |
|---|---|---|
| v1.0 | 2026-05-15 | 初版（取代 US-103，E07 補修批次 4）：新建 `pooldata_field_option` 表；寫入限部長 + Admin（`DirectorGuard`）；查看開放至處長（`DirectorOrSectionChiefGuard`）；各 categorical 欄位 seed；停用不回溯既有條件；新增 3 個 errCode |
| v1.1 | 2026-05-16 | **Phase 1 風險決議落地**：(1) 決議 #2：新增 BR-10 Feature Flag fallback（503 + `FEATURE_NOT_ENABLED`），僅作用於寫入端點 |
| v1.2 | 2026-05-16 | **救援重寫**：前一輪編碼事故損毀本檔內容，依 US-103 + AD-E07 v3.0 一致性決議完整重建；Guard 名稱統一為 `DirectorGuard` / `DirectorOrSectionChiefGuard`（廢除 `SalesManagerGuard`）；保留 v1.0 / v1.1 所有設計決議 |
| v1.3 | 2026-05-17 | **PO 決議 F076-C 軟停用機制補修**（v1.2 救援過程遺失，task #16 system-architect Phase 1 PO 決議）：(1) §5.0 新增概念 schema 區塊明列 `deactivation_reason VARCHAR(30) NULL` ENUM `'manual'` / `'field_type_changed'`；(2) AC-6 停用流程 reason 改為必填 textarea 200 字（OQ-E07-21 Resolved）+ 對應錯誤碼；(3) §5.1 GET 補 `includeInactive=true` query；(4) §5.3 PATCH 改為「啟用專用」、§5.4 新增 deactivate 專屬端點 `PATCH /:columnName/options/:optionValue/deactivate` + DTO `{ isActive: false, reason: string }` 200 字驗證；(5) 新增 BR-11 / BR-12 / BR-13；(6) 跨參照 data-model `pooldata_field_option.deactivation_reason` + error-handling `WHITELIST_OPTION_INACTIVE`；(7) 與 F075 v1.3 BR-7 對齊（F075 service 層觸發本表批次軟停用） |
| v1.3.1 | 2026-05-19 | **case 對齊（依 F075 v1.4.3）**：AC-1 / AC-3 / AC-5 seed 欄位字串（`PROD_KIND` / `LIST_TYPE` / `BEST_CASE` / `SPEC_TP` / `CASEYEAR` / `SETTLE_SRC`）+ API 範例 columnName 由大寫改小寫，對齊 PostgreSQL `ob_pool_data` snake_case；§10 測試覆蓋目標欄位字串同步；`pooldata_field_option.column_name` 由 m22 / m24 seed migration 小寫；`spec_tp` / `best_case` 之 [ASSUMPTION] 留項不變（仍待 OBMCODEDF dump 確認 OBMVALUE），僅 column_name 對應改小寫 |
| v1.5 | 2026-05-20 | **F050 v2.1 重構 seed 全面對齊 US-125（補 case_status / caseyear 確認 8 筆 / spec_tp 升真實 dump 32 筆）**：(1) **Root cause**：F050 v2.1 重構決議 F068 整個 module 廢除（J2），原 `ob_code_df` `tbl_id='CASE_STATUS'` 之 4 筆代碼需遷移至 `pooldata_field_option` `column_name='case_status'`（US-125 AC-2 / E4 / A5）；caseyear 之 m22 現行 seed 8 筆（0~6 + 99）為拍板基準（J5），v2.0 F050 之前端 hardcoded 11 筆 0~10 為錯誤描述須以本 v1.5 為準（A4）；spec_tp 之 v1.4.6 m24 placeholder 3 筆 `[ASSUMPTION]` 已可由真實 OBMCODEDF dump 32 筆升 ✅ Resolved（E5）；(2) **AC-3 變更**：seed 清單由 5 欄擴充為 **6 欄**，新增 `case_status` 4 筆（01/02/03/04，業務語意對照引用 F050 v2.1 §5.1.1）；spec_tp 描述由「依 OBMCODEDF 當時記錄 seed（待真實 dump 確認 OBMVALUE，[ASSUMPTION]）」升級為「依 `reference/DumpData/OBMCODEDF_20260505.csv` `TBL_ID='09'` 之真實 OBMCODEDF dump 32 筆」；caseyear 保留 v1.4.6 之 8 筆描述；(3) **§3 前置條件**：補「對應之白名單欄位（含 v1.5 新增之 case_status）已存在」；(4) **§10 / §11**：seed 寫入測試案例 + 實作 checklist 同步補 case_status 4 筆 + spec_tp 32 筆 + caseyear 8 筆；(5) **§12 假設**：`spec_tp` 之 `[ASSUMPTION] 待 OBMCODEDF dump 確認 OBMVALUE` 升 ✅ Resolved；(6) **F075 v1.5 cross-ref**：F075 v1.5 AC-1 同步補 `case_status` 白名單條目（US-125 AC-5），為本 v1.5 之父表前置；(7) **F050 v2.1 / F051 v2.1 cross-ref**：F050 v2.1 §8 / F051 v2.1 §8 之 case_status 選項來源即為本 v1.5 之 case_status 4 筆 + caseyear 8 筆；(8) **F068 DEPRECATED**：F068 已標 DEPRECATED v1.3，原 `ob_code_df.tbl_id='CASE_STATUS'` 4 筆代碼之 DB 層遷移（E4）由 Phase 3a system-architect 執行；OBMCODEDF dump 32 筆完整對應寫入 migration（m25+，E5）亦由 Phase 3a 執行；本 spec 僅聲明 seed 內容範圍；(9) **不動範圍**：spec §5 API 路徑與 schema、§5.0 概念 schema、§6 BR 編號規則、§7 UI/UX 規範（含 v1.4.5 多欄位 accordion master 架構）、backend DTO / Guard / error code、既有 AC-1 / AC-2 / AC-4 ~ AC-10 語意、prototype 與 reference |
| v1.4.6 | 2026-05-19 | **seed 範圍對齊 F075 v1.4.6（同步收斂 5 欄）**：(1) **Root cause**：F075 v1.4.6 將 seed 由 8 筆收斂為 5 筆（對齊舊系統 `reference/Areas/OBZ/Views/OBZ020/edit.cshtml` 之 5 個篩選欄位 `prod_kind` / `list_type` / `spec_tp` / `caseyear` / `settle_src`），原 F075 v1.4.3 seed 中之 `best_case`（runtime 未讀取）、`month_cnt`（scoring 直讀 `ob_pool_data.month_cnt` column；名單期數範圍 filter 由 `ob_list_definition` 一級欄位承擔）、`payt_term`（runtime 未讀取）已從 F075 whitelist 移除；F076 之 seed 為「掛載於 F075 whitelist categorical 欄位之 options」，必須同步收斂；(2) **決策依據**：`best_case` 整個欄位從 F075 whitelist 移除後，其 options 不再屬於 F076 維護範圍，AC-3 seed 清單之 `best_case` 行移除；`month_cnt` 與 `payt_term` 為 numeric 型別欄位，本即不在 F076 範圍（F076 僅維護 categorical 欄位之 options），無需在 AC-3 調整；`spec_tp` 仍為 F075 v1.4.6 seed 之 5 欄之一，AC-3 保留並維持 [ASSUMPTION] 待 OBMCODEDF dump 確認 OBMVALUE；(3) **AC / 範例更新**：AC-3 seed 清單移除「spec_tp / best_case：依 OBMCODEDF 當時記錄 seed」並改寫為「spec_tp：依 OBMCODEDF 當時記錄 seed（待真實 dump 確認 OBMVALUE，[ASSUMPTION]）」，prod_kind / list_type / caseyear / settle_src 維持原樣；§10 測試覆蓋目標既有描述「初始 seed → prod_kind / list_type / caseyear / settle_src 等寫入」不變（原本就未以 best_case 為例）；(4) **不動範圍**：spec §5 API 路徑與 schema、§5.0 概念 schema（含 `deactivation_reason` ENUM `'manual'` / `'field_type_changed'`）、§6 BR 編號規則（BR-1 ~ BR-13 全保留）、§7 UI/UX 規範（含 v1.4.5 多欄位 accordion master 架構）、backend DTO、Guard、error code、既有 AC（AC-1 / AC-2 / AC-4 ~ AC-10）語意、prototype 與 reference；F075 PATCH 觸發本表批次軟停用（BR-11）之語意保留；既有 `best_case` 之 options seed migration（若已寫入 Dev DB）由 migration 同步收斂處理，非 spec 改動範圍 |
| v1.4.5 | 2026-05-19 | **prototype 對齊翻新（main content 架構翻新）**：對齊 prototype 37b-categorical-field-values.html L100-465 之 main content 架構：(1) **§7 頁面架構翻新**：從單欄位 detail page 改為多欄位 accordion master page（對應 prototype L143）；頁面載入呼叫 `listFields({active:'true'})` 過濾 `fieldType==='categorical'` → 對每個欄位 `Promise.all` 呼叫 `listOptions`；(2) **§7 per-column 新增按鈕**：每個 accordion 內部底部「新增可選值」按鈕（context 由 accordion 提供）；testid `btn-add-option-{columnName}`；(3) **§7 全頁統計**：欄位數 / 啟用值總和 / 停用值總和；testid `option-stats` / `stats-fields-count` / `stats-active-count` / `stats-inactive-count`；(4) **§7「全部展開」按鈕**：testid `btn-expand-all`，點擊將所有 accordion 展開並寫入 localStorage；(5) **§7 `?col=XX` query 改為可選 hint**：自動展開指定 accordion；缺值不報錯（v1.0 ~ v1.3.1 為必填）；(6) **§7 三種狀態徽章**：啟用 / 自動停用（類別變更）/ 手動停用（依 `deactivationReason` 分流）；禁用辭彙「啟用中」「已停用」於徽章；(7) **§7 `field_type_changed` 啟用攔阻**：點 rotate-ccw icon 顯示 warning toast 而非呼叫 API；(8) **§7 localStorage persist 規範**：key `cdmp.f076.acc.{columnName}.expanded`；(9) **§7 新增 [DEFERRED] 區段**：明示 F076-M5（archived 欄位 UI 區塊，需 backend endpoint 或 N+1 query）暫不實作的設計決策（方案 C），避免未來 review 又被抓出；(10) **backend 不動**：既有 endpoints 足夠（listFields / listOptions / createOption / deactivateOption / reactivateOption）；(11) **不動範圍**：spec §5 API 路徑與 schema、backend service / DTO、sidebar、breadcrumb（v1.4.4 三層保留）、reference / prototype；既有 deactivate modal 結構保留；(12) **測試覆蓋**：F076 補 15 個 test cases（TS-F076-FE-V145-001 ~ 015），既有 single-detail 結構之 test cases 重寫為 multi-field accordion |
