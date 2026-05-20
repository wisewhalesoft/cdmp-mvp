---
spec-id: F075
title: POOLDATA 篩選欄位白名單管理（含 field_type metadata）
feature-id: F075
source-story: US-102, US-125, US-128, US-129
epic: E07
module: M06 篩選欄位（v2.1 rename，原 M06 代碼維護（進階））
priority: P0-MVP
version: "1.6"
date: 2026-05-20
status: Draft
---

# F075: POOLDATA 篩選欄位白名單管理（含 field_type metadata）

Priority: P0-MVP | Status: Draft | Last Updated: 2026-05-20

> **v1.6（2026-05-20 / F050 v2.1.1 業務複核補強）**：seed 從 v1.5 之 6 筆擴充為 **7 筆全部啟用**，**新增 `best_case`**（categorical，display_name「優質案件」；US-128 / US-129）。理由：F050 v2.1.1 將 `prod_best` 一級欄位移除（US-128 / Q-B B3），業務語意改由 `condition_payload.conditions[columnName='best_case']` 承接，`best_case` 為新名單必要篩選欄位，runtime 必讀（**v1.4.6 之「`best_case` runtime 未讀取」拔除決議在 F050 v2.1.1 後不再適用** — `best_case` 從 runtime 未讀取（因 `prod_best` 一級欄位承載業務語意）變為 runtime 必讀（因 `prod_best` 移除後 `best_case` condition 為唯一語意載體）；v1.4.6 變更紀錄保留作為歷史脈絡，本 v1.6 補上語境說明）。**對應 F076 v1.6**：補 `best_case` `Y` / `N` 兩筆 active options seed（US-129 AC-1）。**不動範圍**：spec §5 API 路徑與 schema、§5.5 過濾規則 / 排序 / `suggestedFieldType` 推斷規則 / `columnDescription` 取得規則（v1.4.7）、§6 BR 編號（不新增 BR）、§7 UI/UX 規範（含 v1.4.5 工具列 / 操作 column / Edit Modal / reactivate / filter / [DEFERRED]）、backend DTO、Guard、error code、既有 AC-2 ~ AC-17 之語意、`pooldata_field_whitelist` schema、prototype 與 reference。

> **v1.5（2026-05-20 / F050 v2.1 重構 seed 對齊 US-125 AC-5）**：seed 從 v1.4.6 之 5 筆擴充為 **6 筆全部啟用**，新增 `case_status`（categorical）條目，對應 US-125 AC-5（caseyear / case_status 可選值遷移至 `pooldata_field_option`）；F050 v2.1 / F051 v2.1 之 case_status 動態選項來源即為此 + F076 v1.5 之 4 筆。**不動範圍**：spec §5 API 路徑與 schema、§5.5 過濾規則 / 排序 / `suggestedFieldType` 推斷規則 / `columnDescription` 取得規則（v1.4.7）、§6 BR 編號（不新增 BR）、§7 UI/UX 規範（含 v1.4.5 工具列 / 操作 column / Edit Modal / reactivate / filter / [DEFERRED]）、backend DTO、Guard、error code、既有 AC-1 ~ AC-17 之語意、`pooldata_field_whitelist` schema、prototype 與 reference。

> **v1.4.7 補修（2026-05-19 / available-columns 端點補 columnDescription + Modal 自動填入 displayName）**：補兩條未交付需求：(1) **AC-16**：`GET /api/v1/pooldata-fields/available-columns` 於每筆欄位回傳 `columnDescription`，來源為 SQL Server `sys.extended_properties` 之 `MS_Description`；datasource 解析查 `extraction_tasks` 表最新一筆 `source_table = 'OBPOOLDATA'`（不限 status）；遇連線失敗 / 查無 task / 該欄位無 `MS_Description` 三種情境靜默降級（該欄位物件**省略** `columnDescription`，不回 null/空字串），端點整體仍 200 OK，不記錄 error-level 日誌；(2) **AC-17**：新增 Modal dropdown 選欄位後，若 `displayName` 為空白（trim 後長度 0）且該欄位 response 含 `columnDescription`，自動將 `columnDescription` 值填入 `displayName` 輸入框；已有內容不覆寫；無 `columnDescription` 則維持空白且不顯示錯誤；自動填入後仍可清空 / 改寫；Edit Modal 不受影響（僅 create 流程）；(3) **不動範圍**：spec §5 端點路徑與權限、§5.5 過濾/排序/`suggestedFieldType` 規則、§6 BR 編號（不新增 BR）、既有 AC-1 ~ AC-15 語意、錯誤代碼表、`pooldata_field_whitelist` schema、prototype 與 reference。
> **v1.4.6 補修（2026-05-19 / seed 範圍對齊舊系統 OBZ020）**：對齊舊系統 `reference/Areas/OBZ/Views/OBZ020/edit.cshtml` 之名單篩選欄位範圍（9 欄中扣除 3 欄已由 `ob_list_definition` 一級欄位承擔之 `list_period_start` / `list_period_end` / `list_interval`、1 欄非篩選欄位 `list_nm`，剩 **5 個真正的篩選欄位**）。本版改動：(1) **seed 列從 8 筆收斂為 5 筆全部啟用**：保留 `prod_kind` / `list_type` / `spec_tp` / `caseyear` / `settle_src`（皆 categorical）；(2) **從 seed 移除**：`best_case`（runtime 未讀取，`fn_calc_tier_level.sql` 與 `assignment-run-pipeline.service.ts` 皆未引用）、`month_cnt`（scoring 之 LIST_MONTH 計分碼**直接讀 `ob_pool_data.month_cnt` column**，不經 whitelist；且名單期數範圍 filter 由 `ob_list_definition.list_period_start` / `list_period_end` / `list_interval` 三個一級欄位承擔，whitelist 重複維護無意義）、`payt_term`（runtime 未讀取）；(3) **`ob_pool_data.month_cnt` column 仍保留**（scoring 直讀），僅 whitelist 不列；(4) **BR-13 過濾 inactive 紀錄之語意保留**：seed 雖全為啟用，但部長日後可手動停用某欄位，available-columns 仍需排除含 inactive 紀錄以防繞過 AC-5；(5) **不動範圍**：spec §5 API 路徑與 schema、§6 BR 編號規則、§7 UI/UX 規範、backend DTO、Guard、error code、既有 AC 之語意、prototype 與 reference。
> **v1.4.5 補修（2026-05-19 / prototype 對齊翻新）**：對齊 prototype 37a-pooldata-whitelist.html main content：(1) **§7 工具列結構**補：「新增篩選欄位」按鈕移至工具列右側（與搜尋 / type filter / status filter / 統計同一橫排，對應 prototype L126-157）；(2) **§7 操作 column 3 icon 規範**：list-checks（categorical only）+ pencil（編輯）+ ban/rotate-ccw（停用/啟用 toggle）—對應 prototype L613-619；(3) **§7 Edit 流程恢復**：reverse v1.4 D-iii 決議，補回 Edit Modal（columnName 唯讀 + 不顯示推斷 hint，AC-14 限定僅新增流程）；categorical→其他 fieldType 切換時 reuse 既有 CategorySwitchConfirmModal；(4) **§7 reactivate 流程**：inactive 欄位點 rotate-ccw icon 直接 PATCH `{ isActive: true }`（沿用既有 PATCH 端點，無需確認 modal）；(5) **§7 filter 字串對齊**：status filter `「啟用中 / 已停用 / 全部」` → `「狀態：全部 / 僅顯示啟用 / 僅顯示停用」`；type filter 補 zh-tw 後綴；(6) **§7 [DEFERRED] 區段**：明示 F075-M8（scope 提示區塊）+ F075-M9（seed 來源 column）不實作的設計決策；(7) **不動範圍**：spec §5 API 路徑與 schema、backend DTO、sidebar、breadcrumb、reference / prototype / 00-design-system。
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
- 系統首次部署時自動 seed **7 筆全部啟用**（v1.6 對齊 F050 v2.1.1 補 `best_case`（US-128 / US-129）；v1.5：對齊舊系統 OBZ020 之 5 欄篩選欄位 + v2.1 重構新增 case_status 條目，US-125 AC-5）
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

### AC-1：系統首次部署時自動 Seed 白名單（v1.6 / 7 筆）

- **Given** 系統首次部署
- **When** Admin 執行初始化
- **Then** 系統自動 seed **7 筆全部啟用**（v1.6 對齊 F050 v2.1.1 補 `best_case`；v1.5 對齊 US-125 AC-5 補 `case_status`；v1.4.6 對齊舊系統 OBZ020 之 5 欄篩選欄位；v1.4.3 起 column_name 為小寫 snake_case，對齊 `ob_pool_data` PostgreSQL 實際欄位）：
  - prod_kind（categorical，啟用，display_name「產品類別」）
  - list_type（categorical，啟用，display_name「名單類型」）
  - spec_tp（categorical，啟用，display_name「特殊類別」）
  - caseyear（categorical，啟用，display_name「案件年度」）
  - settle_src（categorical，啟用，display_name「結清來源」）
  - **case_status（categorical，啟用，display_name「案件結清期別」）** — v1.5 新增（US-125 AC-5；對應 F050 v2.1 / F051 v2.1 之 case_status 動態選項來源，取代原 F068 `ob_code_df` `tbl_id='CASE_STATUS'`，A5 / E4）
  - **best_case（categorical，啟用，display_name「優質案件」）** — v1.6 新增（US-128 / US-129；對應 F050 v2.1.1 之 `best_case` 篩選條件，承接已移除之 `prod_best` 業務語意；對應 F076 v1.6 之 `Y` / `N` 兩筆 options seed）
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

- **Given** `ob_pool_data` 含 120 個欄位，`pooldata_field_whitelist` 已有 **7 筆紀錄**（全為啟用，v1.6 對齊 F050 v2.1.1 補 `best_case`；v1.5 對齊 US-125 AC-5 補 `case_status`；v1.4.6 對齊舊系統 OBZ020 之 5 欄篩選欄位）
- **When** 部長 / Admin 呼叫 `GET /api/v1/pooldata-fields/available-columns`
- **Then** Response 回傳 `ob_pool_data` 既有欄位中**未出現於** `pooldata_field_whitelist` 的所有欄位（過濾邏輯**不論 `is_active` 為何**均排除；v1.4.6 起初始 seed 已無 inactive 紀錄，但本規則仍保留以防部長日後手動停用某欄位後繞過 AC-5 唯一性）
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

### AC-16：available-columns 端點於每筆欄位回傳 columnDescription

- **Given** 部長 / Admin 呼叫 `GET /api/v1/pooldata-fields/available-columns`
- **When** 後端成功連線 SQL Server `OBPOOLDATA` 所在 datasource（查 `extraction_tasks` 表最新一筆 `source_table = 'OBPOOLDATA'`，不限 status），並查得某欄位在 SQL Server `sys.extended_properties` 中存有 `MS_Description`
- **Then** 對應欄位物件包含 `columnDescription` 欄位，值為 `MS_Description` 字串（例：`prod_kind` → `"產品類別"`）
- **And** 若因下列任一原因無法取得 `MS_Description`（靜默降級，不影響整體端點回傳）：
  - SQL Server datasource 連線失敗
  - `extraction_tasks` 查無符合 `source_table = 'OBPOOLDATA'` 之紀錄
  - 特定欄位在 `sys.extended_properties` 無 `MS_Description`
  則該欄位物件**省略** `columnDescription` 欄位（不回 `null`，亦不回空字串）
- **And** 降級情境下，端點整體仍回傳 200 OK，其餘有描述的欄位不受影響
- **And** 後端不記錄 error-level 日誌（建議 debug / warn level）

### AC-17：新增 Modal dropdown 選欄位後自動填入 displayName

- **Given** 部長 / Admin 開啟「新增篩選欄位」Modal，且 dropdown 已成功載入 `availableColumns`
- **When** 使用者從 dropdown 選取某一欄位（onChange 觸發）
- **Then** 若 `displayName` 輸入框當前為空白（trim 後長度為 0）且被選欄位 response 含 `columnDescription`，則自動將 `columnDescription` 值填入 `displayName` 輸入框
- **And** 若 `displayName` 已有內容（trim 後 > 0），**不覆寫**
- **And** 若被選欄位 response 不含 `columnDescription`，displayName 維持空白；**不顯示**錯誤訊息
- **And** 自動填入後使用者仍可清空 / 改寫
- **And** Edit Modal **不受影響**（僅 create 流程）

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
    { "columnName": "spec_tp", "displayName": "規格類別", "fieldType": "categorical", "isActive": true, "createdAt": "...", "updatedAt": "..." }
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

**columnDescription 取得規則**（對應 AC-16，v1.4.7 新增）

- **查詢來源**：SQL Server `sys.extended_properties` 之 `MS_Description`（保留 SQL Server 原始術語，**不可改名**為 `description` / `chineseName` / `label` / `comment` / `remarks`）
- **datasource 解析**：查 PostgreSQL `extraction_tasks` 表最新一筆 `source_table = 'OBPOOLDATA'`（**不限 status**），取其 `datasource_id` 連線 SQL Server
- **降級條件**（任一觸發即省略該欄位之 `columnDescription`）：
  1. SQL Server datasource 連線失敗
  2. `extraction_tasks` 查無符合 `source_table = 'OBPOOLDATA'` 之紀錄
  3. 特定欄位在 `sys.extended_properties` 無 `MS_Description`
- **降級行為**：該欄位物件 **omit** `columnDescription` key（不回 `null`、不回空字串）；端點整體仍 200 OK；其他有描述之欄位不受影響
- **日誌等級**：降級不記錄 error-level 日誌（建議 debug 或 warn）

**Response — 200 OK**

```json
{
  "availableColumns": [
    { "columnName": "birth_date", "dataType": "date", "suggestedFieldType": "date", "columnDescription": "出生日期" },
    { "columnName": "cust_age", "dataType": "integer", "suggestedFieldType": "numeric" },
    { "columnName": "risk_level", "dataType": "varchar", "suggestedFieldType": "categorical", "columnDescription": "風險等級" }
  ]
}
```

> 註：`cust_age` 故意省略 `columnDescription` 欄位，示意該欄位在 `sys.extended_properties` 無 `MS_Description` 時之 omit 行為；不回 `null` 亦不回空字串。

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
| BR-9 | **Seed 冪等性**：seed 腳本以 `INSERT ... ON CONFLICT (column_name) DO NOTHING` 實現；重複執行不產生重複資料；v1.6 起 seed 數量為 **7 筆**（v1.4.6 起 5 筆對齊舊系統 OBZ020 + v1.5 新增 case_status 對齊 US-125 AC-5 + v1.6 新增 best_case 對齊 F050 v2.1.1 / US-128 / US-129） |
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
    - **自動填入行為（v1.4.7 / AC-17）**：dropdown 選欄位 onChange 時，若 `displayName` 當前為空白（trim 後長度為 0）且該欄位 response 含 `columnDescription`，自動帶入 `columnDescription` 值；已有內容不覆寫；無 `columnDescription` 維持空白且**不**顯示錯誤；自動填入後使用者仍可清空 / 改寫；**Edit Modal 不適用**（僅 create 流程）
  - 欄位 3：`fieldType` — radio 群組（`numeric` / `categorical` / `date`，必填）
  - **系統推斷 hint（AC-14）**：選中 dropdown 某欄位後，`fieldType` radio 群組**上方**顯示語意文字「系統推斷：{suggestedFieldType}（依 dataType={dataType}）；請確認是否正確」，且 radio 預選為 `suggestedFieldType`
  - **使用者覆寫 hint 切換（AC-14）**：使用者覆寫預選 radio 後，hint 文字改顯示「使用者選擇」（系統推斷文字隱藏或被取代）；視覺呈現細節由 ui-ux-designer 決議
  - **空態**：若 `availableColumns` 為空陣列，dropdown 顯示對應空態提示且儲存按鈕停用
  - 儲存後若 `fieldType = categorical`，仍顯示提示「請至 POOLDATA 可選值維護頁設定可選值」（沿用既有行為）
- **編輯 Modal**：與新增相同，但 `column_name` 為唯讀
- **`field_type` 變更警告 Modal**：自 categorical 改為 numeric / date 時彈出，內容「此欄位 {N} 個啟用可選值將自動停用（軟停用，歷史保留不刪除），且不再套用於新名單篩選；確定繼續？」+「確認」/「取消」按鈕；N 由 service 層 `GET options?active=true` 預查得到並回填至前端 Modal
- **停用確認 Modal**：「確認停用 {displayName}？此欄位將立即從新名單定義條件選單中消失，但既有名單條件不受影響。」
- **成功提示 toast（v1.4 一致化）**：以 `displayName` 為主，例如「欄位『風險等級』已新增」/「欄位『風險等級』已編輯」/「欄位『風險等級』已停用」/「欄位『風險等級』已啟用」；不再以 `columnName` 為主之文案

### v1.4.5 工具列結構規範（對齊 prototype 37a L126-157）

工具列為單一 flex container，由左至右排列：

| 元素 | testid | 描述 |
|---|---|---|
| 搜尋框 | （無，由 placeholder 識別） | 搜尋 `columnName` / `displayName`，oninput 即時過濾 |
| type filter dropdown | `filter-type` | 字串：「類別：全部 / categorical（類別型）/ numeric（數值型）/ date（日期型）」 |
| status filter dropdown | `filter-active` | 字串：「狀態：全部 / 僅顯示啟用 / 僅顯示停用」（不可使用 v1.4 字串「啟用中 / 已停用 / 全部」） |
| 「清除」按鈕 | `btn-clear-filters` | rotate-ccw icon + 「清除」文字，點擊重置 search + type filter + status filter |
| 統計列 | `field-stats` | `ml-auto` 推至右側，顯示「總計 N 筆（啟用 X / 停用 Y）」 |
| 「新增篩選欄位」按鈕 | `btn-create-field` | primary 樣式，plus icon + 「新增篩選欄位」文字 |

### v1.4.5 操作 column 規範（對齊 prototype 37a L613-619）

每 row 操作 column 含 **icon 按鈕**（不再使用文字 link/button）：

| icon | testid | 顯示條件 | 點擊行為 |
|---|---|---|---|
| `list-checks` | `btn-options-{columnName}` | `fieldType === 'categorical'` 才顯示 | 跳轉至 `/assignment/whitelist/options?col={columnName}` |
| `pencil` | `btn-edit-{columnName}` | 所有 row | 開啟 Edit Modal |
| `ban` | `btn-disable-{columnName}` | `isActive === true` 才顯示 | 觸發停用流程（categorical 含 active options → CategorySwitchConfirmModal；其他 → 一般 ConfirmModal） |
| `rotate-ccw` | `btn-reactivate-{columnName}` | `isActive === false` 才顯示 | 直接 PATCH `{ isActive: true }`，無確認 Modal |

### v1.4.5 Edit Modal 規範（reverse v1.4 D-iii）

- testid：`edit-field-modal`
- 結構與新增 Modal 相同：fieldType radio + displayName input
- 差異：
  - `columnName` 為唯讀 chip（testid `readonly-column-name`，PK 不可變更，對應 prototype L287-295）
  - **不渲染**系統推斷 hint（AC-14 限定僅新增流程，prototype L704-705 註解）
  - **不渲染** `dropdown-column-name-trigger`（dropdown 為 create-only）
- 提交：呼叫 `PATCH /api/v1/pooldata-fields/{columnName}` 帶 `{ displayName, fieldType }`
- 級聯：`categorical → numeric/date` 切換時，由父層偵測 → 觸發既有 CategorySwitchConfirmModal（重用 v1.4 邏輯）
- 成功 toast：「欄位『{displayName}』已編輯」

### [DEFERRED] Prototype 對齊未實作項目（v1.4.5 範圍外）

| ID | Prototype 來源 | 延後原因 | 解決方案 |
|---|---|---|---|
| F075-M8 | 37a L106-120 scope 提示區塊（藍底 box，含「F075 — 篩選欄位管理（M06 代碼維護擴充）」+ scope 描述 + 權限說明） | React 既有「管理 OBPOOLDATA 表可用的篩選欄位清單（F075）」描述行已替代核心 scope 資訊，且 spec §1 / §7 已有對應規範；增加 box 屬視覺重複 | 不修補；如未來需 emphasis，可新增 `scope-banner` testid 區塊 |
| F075-M9 | 37a L168 表格欄位「seed 來源 / 備註」（顯示 `SP_INFOT_ASSIGNEXPORTNAMELIST_st1_list` 等 seed 來源字串） | 後端 `pooldata_field_whitelist` entity 無 `seed_note` 欄位；spec §5.1 list 回應 schema 也未定義；屬 backend schema change，超出 v1.4.5 範圍 | 待後續若需展示來源則新增 entity field + spec §5.1 schema 補欄位 |

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
  - 初始 seed（**7 筆全部啟用**，v1.6 對齊 F050 v2.1.1 補 `best_case`；v1.5 對齊 US-125 AC-5 補 `case_status`；v1.4.6 對齊舊系統 OBZ020 之 5 欄篩選欄位）→ 全部寫入；重複執行 seed → 不增加
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
  - GET available-columns 某欄位 SQL Server `sys.extended_properties` 含 `MS_Description` → response 該欄位含 `columnDescription` 字串（AC-16）
  - GET available-columns 某欄位 SQL Server `sys.extended_properties` 無 `MS_Description` → response 該欄位 **omit** `columnDescription` key（非 null / 非空字串，AC-16）
  - GET available-columns SQL Server datasource 連線失敗 → response 全部欄位 omit `columnDescription`，整體仍 200 OK，無 error-level 日誌（AC-16）
  - GET available-columns `extraction_tasks` 查無 `source_table = 'OBPOOLDATA'` 紀錄 → response 全部欄位 omit `columnDescription`，整體仍 200 OK（AC-16）
  - `extraction_tasks` datasource 解析查詢取最新一筆（不限 status）— 含 success / failed / running 各狀態下仍能取得最新 `datasource_id`（AC-16）
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
  - 新增 Modal dropdown 選含 `columnDescription` 欄位 + `displayName` 為空 → `displayName` 自動填入 `columnDescription` 值（AC-17）
  - 新增 Modal dropdown 選不含 `columnDescription` 欄位 + `displayName` 為空 → `displayName` 維持空白且無錯誤訊息（AC-17）
  - 新增 Modal `displayName` 已有內容（含 trim 後 > 0）→ dropdown 換選不覆寫（AC-17）
  - 新增 Modal 自動填入後使用者可清空 / 改寫 displayName（AC-17）
  - Edit Modal 切換 fieldType / 任何欄位變更**不**觸發 `displayName` 自動填入（AC-17 negative case）
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
- [ ] 後端 available-columns service 補 `columnDescription` 取得邏輯：查 `extraction_tasks` 最新一筆 `source_table = 'OBPOOLDATA'`（不限 status）→ 連線對應 SQL Server datasource → 查 `sys.extended_properties` 之 `MS_Description`（v1.4.7 / AC-16）
- [ ] 後端 available-columns response DTO 將 `columnDescription` 設為 optional 欄位（omit 而非 null）（v1.4.7 / AC-16）
- [ ] 後端三種降級情境靜默處理 + 日誌等級降為 debug / warn（v1.4.7 / AC-16）
- [ ] 前端新增 Modal dropdown onChange handler 補自動填入 `displayName` 邏輯（trim 為 0 + 含 `columnDescription` 才填）（v1.4.7 / AC-17）
- [ ] 前端 Edit Modal 確認**不**綁定自動填入邏輯（v1.4.7 / AC-17 negative case）

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
| v1.4.5 | 2026-05-19 | **prototype 對齊翻新（main content）**：對齊 prototype 37a-pooldata-whitelist.html L106-720 之 main content 設計：(1) **§7 工具列結構**補：「新增篩選欄位」按鈕移至工具列（與搜尋 / type filter / status filter / 統計同一橫排，prototype L126-157）；補「清除」按鈕（rotate-ccw icon，重置 3 個 filter 狀態）；(2) **§7 操作 column 3 icon**：list-checks（categorical only）+ pencil（編輯）+ ban/rotate-ccw（停用/啟用 toggle），對應 prototype L613-619；testid 規範：`btn-options-{col}` / `btn-edit-{col}` / `btn-disable-{col}` / `btn-reactivate-{col}`；(3) **§7 Edit 流程**：reverse v1.4 D-iii 決議，補回 Edit Modal — `columnName` 唯讀 chip + 不渲染推斷 hint（AC-14 限定僅新增流程，prototype L704-705）+ 不渲染 dropdown trigger；categorical→其他 fieldType 切換時 reuse 既有 CategorySwitchConfirmModal；testid `edit-field-modal` / `readonly-column-name` / `edit-input-display-name` / `edit-field-type-radio-{type}` / `btn-submit-edit-field`；提交 PATCH `/api/v1/pooldata-fields/{columnName}` 帶 `{ displayName, fieldType }`；成功 toast「欄位『{displayName}』已編輯」；(4) **§7 reactivate 流程**：inactive 欄位 rotate-ccw icon 直接 PATCH `{ isActive: true }`（沿用既有 PATCH 端點）；無確認 Modal；成功 toast「欄位『{displayName}』已啟用」；(5) **§7 filter 字串對齊**：`filter-active` 字串 `「啟用中 / 已停用 / 全部」` → `「狀態：全部 / 僅顯示啟用 / 僅顯示停用」`（對齊 prototype L142-146）；`filter-type` 補 zh-tw 後綴「（類別型）」「（數值型）」「（日期型）」（對齊 prototype L133-138）；status filter 預設值由 `'active'` 改為 `'all'`；(6) **§7 新增 [DEFERRED] 區段**：明示 F075-M8（scope 提示區塊，已被 React 描述行替代）與 F075-M9（seed 來源 column，需 backend entity 加欄位）不實作的設計決策，避免未來 review 又被抓出；(7) **backend 不動**：既有 `UpdatePooldataFieldDto.isActive` 已支援 reactivate；PATCH 端點足夠；(8) **不動範圍**：spec §5 API 路徑與 schema、backend DTO、sidebar（v1.4.1 已對齊）、breadcrumb（v1.4.4 已對齊）、reference / prototype / 00-design-system；CategorySwitchConfirmModal 既有 component reuse；(9) **測試覆蓋**：F075 補 14 個 test cases（TS-F075-FE-V145-001 ~ 014），既有 28 PASS 全保留 |
| v1.4.6 | 2026-05-19 | **seed 範圍對齊舊系統 OBZ020**：(1) **Root cause**：原 v1.4.3 起 seed 8 筆（prod_kind / list_type / best_case / spec_tp / caseyear / settle_src / month_cnt / payt_term）與舊系統 `reference/Areas/OBZ/Views/OBZ020/edit.cshtml` 之 9 欄篩選欄位範圍不對齊；OBZ020 9 欄中 3 欄（`list_period_start` / `list_period_end` / `list_interval`）已由 `ob_list_definition` 一級欄位承擔、1 欄（`list_nm`）為名單名稱非篩選欄位，剩 5 欄才是真正的篩選欄位；(2) **決策依據**：`best_case` runtime 未讀取（`fn_calc_tier_level.sql` 與 `assignment-run-pipeline.service.ts` 均未引用）→ 拔除；`month_cnt` scoring 之 LIST_MONTH 計分碼**直接讀 `ob_pool_data.month_cnt` column**（不經 whitelist），且名單期數範圍 filter 由 `ob_list_definition.list_period_start` / `list_period_end` / `list_interval` 三個一級欄位承擔，whitelist 重複維護無意義 → 拔除（**column 在 `ob_pool_data` 仍保留供 scoring 直讀，僅 whitelist 不列**）；`payt_term` runtime 未讀取 → 拔除；(3) **AC / 範例更新**：§1 功能摘要「seed 8 筆」→「seed 5 筆全部啟用」；AC-1 seed 清單由 8 筆收斂為 5 筆（prod_kind / list_type / spec_tp / caseyear / settle_src）並移除「7 啟用 + 1 停用 payt_term」字樣；AC-10 範例「`pooldata_field_whitelist` 已有 8 筆紀錄（7 啟用 + 1 停用 payt_term）」→「5 筆全為啟用」並移除「已停用之 payt_term 亦不列入 available-columns」字樣，但保留 BR-13 過濾邏輯之語意說明（防部長日後手動停用某欄位繞過 AC-5）；§5.1 GET response 範例之 `month_cnt` 範例改為 `spec_tp`（保留 prod_kind 與另一 categorical 為代表）；§6 BR-9 seed 冪等性說明補充 v1.4.6 5 筆；§10 測試覆蓋目標「初始 seed（8 筆）」→「初始 seed（5 筆全部啟用）」；(4) **不動範圍**：spec §5 API 路徑與 schema、§6 BR 編號規則（BR-1 ~ BR-14 全保留）、§7 UI/UX 規範、§12 假設清單、backend DTO、Guard、error code、既有 AC（AC-2 ~ AC-15）語意、prototype 與 reference；`ob_pool_data` 表結構（含 `month_cnt` column）；F076 v1.4.6 同步收斂 seed（best_case 整個欄位從 whitelist 移除後，其 options 不再屬於 F076 維護範圍） |
| v1.5 | 2026-05-20 | **F050 v2.1 重構 seed 對齊 US-125 AC-5**：(1) **Root cause**：F050 v2.1 重構決議（J1）F075 + F076 為唯一篩選欄位來源；F068 整個 module 廢除（J2）；原 `ob_code_df` `tbl_id='CASE_STATUS'` 之 4 筆代碼需遷移至 `pooldata_field_option` `column_name='case_status'`（US-125 AC-2），父表 `pooldata_field_whitelist` 必須先有 `case_status` 條目；(2) **變更項目**：AC-1 seed 由 5 筆擴充為 **6 筆**，新增 `case_status`（categorical，啟用）；§1 功能摘要「seed 5 筆」→「seed 6 筆」；AC-10 範例「已有 5 筆紀錄」→「已有 6 筆紀錄」；§6 BR-9 seed 冪等性「v1.4.6 起 5 筆」→「v1.5 起 6 筆」；§10 測試覆蓋目標「初始 seed（5 筆全部啟用）」→「6 筆全部啟用」；(3) **F050 v2.1 / F051 v2.1 cross-ref**：F050 v2.1 §3 前置條件、F050 v2.1 §8 case_status 選項來源、F051 v2.1 §8 case_status 選項來源均引用本 v1.5 seed；(4) **F076 v1.5 同步**：F076 v1.5 AC-3 seed 補 case_status 4 筆 + caseyear 改 8 筆 + spec_tp 補 OBMCODEDF dump 32 筆；(5) **F068 DEPRECATED**：F068 已標 DEPRECATED v1.3，原 `ob_code_df` `tbl_id='CASE_STATUS'` 4 筆代碼之 DB 層遷移由 Phase 3a system-architect 執行（GAP-LIST §E4）；(6) **不動範圍**：spec §5 API 路徑與 schema、§5.5 過濾規則 / 排序 / `suggestedFieldType` 推斷規則 / `columnDescription` 取得規則（v1.4.7）、§6 BR 編號（**不新增 BR**）、§7 UI/UX 規範（含 v1.4.5 工具列 / 操作 column / Edit Modal / reactivate / filter / [DEFERRED] 區段）、backend DTO、Guard、error code、既有 AC-2 ~ AC-17 之語意、`pooldata_field_whitelist` schema、prototype 與 reference / 00-design-system |
| v1.6 | 2026-05-20 | **F050 v2.1.1 業務複核補強 seed 對齊 US-128 / US-129**：(1) **Root cause**：F050 v2.1.1 業務複核 D2 決議將 `prod_best` 一級欄位移除（US-128 / Q-B B3），其業務語意改由 `condition_payload.conditions[columnName='best_case']` 承接；`best_case` 從「runtime 未讀取」（v1.4.6 拔除理由）轉為「runtime 必讀」（因 `prod_best` 移除後 `best_case` condition 為唯一語意載體），v1.4.6 之拔除決議在 F050 v2.1.1 後不再適用；(2) **變更項目**：AC-1 seed 由 6 筆擴充為 **7 筆**，新增 `best_case`（categorical，啟用，display_name「優質案件」）；§1 功能摘要「seed 6 筆」→「seed 7 筆」；AC-10 範例「已有 6 筆紀錄」→「已有 7 筆紀錄」；§6 BR-9 seed 冪等性「v1.5 起 6 筆」→「v1.6 起 7 筆」；§10 測試覆蓋目標「初始 seed（6 筆全部啟用）」→「7 筆全部啟用」；(3) **F050 v2.1.1 / F076 v1.6 cross-ref**：F050 v2.1.1 §3 前置條件 + §5.4 規則表 + §5.2 移除欄位段 + BR-12 + §9 相依性引用本 v1.6 之 `best_case` 條目；F076 v1.6 同步補 `best_case` `Y` / `N` 兩筆 active options seed（US-129 AC-1）；(4) **v1.4.6 拔除決議語境補述**：v1.4.6 變更紀錄保留作為歷史脈絡，本 v1.6 補上語境說明「v1.4.6 之拔除決議在 F050 v2.1.1（`prod_best` 移除）後不再適用 — `best_case` 從 runtime 未讀取（因 `prod_best` 一級欄位承載業務語意）變為 runtime 必讀（因 `prod_best` 移除後 `best_case` condition 為唯一語意載體）」；不刪 v1.4.6 紀錄；(5) **不動範圍**：spec §5 API 路徑與 schema、§5.5 過濾規則 / 排序 / `suggestedFieldType` 推斷規則 / `columnDescription` 取得規則（v1.4.7）、§6 BR 編號（**不新增 BR**）、§7 UI/UX 規範、backend DTO、Guard、error code、既有 AC-2 ~ AC-17 之語意、`pooldata_field_whitelist` schema、prototype 與 reference / 00-design-system；F076 v1.6 之 options seed 由 system-architect 於 migration 落地（Phase 3a） |
| v1.4.7 | 2026-05-19 | **available-columns 端點補 columnDescription + Modal 自動填入 displayName**：(1) **Root cause**：舊系統 OBZ020 之 dropdown 顯示中文欄位描述（來源為 SQL Server `sys.extended_properties` 之 `MS_Description`），新系統 available-columns 端點未回傳該描述，使用者新增篩選欄位時須自行輸入中文 `displayName`，UX 較差；(2) **決策依據**：description 為錦上添花 metadata，採靜默降級設計（連線失敗 / 無 task / 無描述均省略欄位而非報錯），避免污染主流程；Modal 自動填入僅限 create 流程且只在 `displayName` 為空時觸發，避免覆寫使用者已輸入內容；(3) **變更項目**：新增 AC-16（端點 `columnDescription` 欄位 + 三種降級情境）+ AC-17（Modal create 流程自動填入 + 不覆寫 / 不影響 Edit）；§5.5 Response 範例補 `columnDescription` 欄位（同時示意有 / 無 description 兩種）+ 新增「`columnDescription` 取得規則」子段落（查詢來源 / datasource 解析 / 降級條件 / 降級行為 / 日誌等級）；§7 「新增篩選欄位 Modal」`displayName` 描述補自動填入行為說明；§10 補後端 5 條 + 前端 5 條 test cases；§11 補 5 項實作 checklist；§13 順手修正 v1.4.5 / v1.4.6 順序錯亂；(4) **不動範圍**：spec §5 端點路徑 / 權限 / Guard、§5.5 過濾規則 / 排序規則 / `suggestedFieldType` 推斷規則、§6 BR 編號（**不新增 BR**，兩個 AC 已自足）、§5.5 錯誤代碼表（降級不丟錯，**不新增** errCode）、既有 AC-1 ~ AC-15 語意、§7 工具列 / 操作 column / Edit Modal / reactivate / filter / [DEFERRED] 規範、prototype 與 reference、`pooldata_field_whitelist` schema、`extraction_tasks` / `ExtractionTask` entity 名稱（**不可改名**）、F076 |
