---
spec-id: F076
title: 類別型欄位可選值管理
feature-id: F076
source-story: US-103
epic: E07
module: M06 代碼維護（進階）
priority: P0-MVP
version: "1.2"
date: 2026-05-16
status: Draft
---

# F076: 類別型欄位可選值管理

Priority: P0-MVP | Status: Draft | Last Updated: 2026-05-16

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
- 新建 `pooldata_field_option` 表，欄位包含 `column_name`（FK → `pooldata_field_whitelist`）、`option_value`、`option_label`、`is_active`，複合唯一鍵 `(column_name, option_value)`
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
- 對應之白名單欄位（`pooldata_field_whitelist`）已存在且 `field_type = 'categorical'`
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

### AC-3：系統首次部署時自動 Seed 各欄位初始可選值

- **Given** 系統首次部署
- **When** Admin 執行初始化
- **Then** 系統自動 seed 各 categorical 欄位之初始可選值：
  - PROD_KIND：01（汽車新車）/ 02（機車）/ 03（其他商品），至少 3 筆
  - LIST_TYPE：01（期中）/ 02（中結）/ 03（滿期），3 筆
  - CASEYEAR：0 / 1 / 2 / 3 / 4 / 5 / 6 + 99（不限年數），共 8 筆
  - SETTLE_SRC：Y（含他行代償）/ N（不含他行代償），2 筆
  - SPEC_TP / BEST_CASE：依 OBMCODEDF 當時記錄 seed
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

### AC-6：部長 / Admin 停用可選值

- **Given** 部長 / Admin 點擊某可選值之「停用」按鈕
- **When** 確認 Modal 後執行
- **Then** 該 `option_value` 之 `is_active` 設為 false，**立即**從新名單定義多選元件選項中消失
- **And** 已在**現有**名單定義條件中選取此值的設定**不受影響**（不回溯）
- **And** 操作寫入 `assignment_audit_log`（`action = 'DISABLE'`）

### AC-7：停用可選值不中斷月跑

- **Given** 名單 `OB202604010` 之 PROD_KIND 條件含 `02`；部長停用 PROD_KIND 之 `02`
- **When** 觸發月跑（F061 / F081），月跑 Stage 1 讀取 `OB202604010` 之篩選條件
- **Then** 月跑仍正確以 `PROD_KIND INCLUDE ['02', ...]` 過濾 OBPOOLDATA，月跑完成不報錯

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

- **Given** 白名單欄位 `PROD_KIND`（categorical）有 5 個可選值，2 個已停用
- **When** 部長 / Admin 開啟新名單定義表單，選擇 PROD_KIND 為篩選欄位
- **Then** 多選元件只呈現 3 個啟用值，不顯示已停用的 2 個

## 5. API 規格

### 5.1 GET /api/v1/pooldata-fields/{columnName}/options

| 用途 | 取得某 categorical 欄位之可選值列表 |
|---|---|
| 認證 | JWT 必填 |
| 權限 | `DirectorOrSectionChiefGuard` |

**Query Params**：`?active=true|false`（可選）

**Response — 200 OK**

```json
{
  "columnName": "PROD_KIND",
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
  "columnName": "PROD_KIND",
  "optionValue": "09",
  "optionLabel": "農業機具",
  "isActive": true
}
```

### 5.3 PATCH /api/v1/pooldata-fields/{columnName}/options/{optionValue}

| 用途 | 停用 / 啟用可選值（is_active toggle） |
|---|---|
| 認證 | JWT 必填 |
| 權限 | `DirectorGuard` |

**Request Body**

```json
{ "isActive": false }
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
- **CASEYEAR 特殊值說明**：UI 對 `optionValue = '99'` 顯示輔助說明文字「99 = 不限年數（全選）」

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
  - 初始 seed → PROD_KIND / LIST_TYPE / CASEYEAR / SETTLE_SRC 等寫入；重複 seed → 不增加
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
  - CASEYEAR `99` 顯示輔助說明文字
- E2E：F075 新增 RISK_LEVEL categorical → F076 維護 4 個可選值（3 啟用 + 1 停用）→ F050 新名單表單顯示 3 個值 → 月跑既有名單條件含已停用值仍正常執行

## 11. 實作 Checklist

- [ ] 後端建表 `pooldata_field_option` + 複合 UNIQUE index `(column_name, option_value)` + FK to `pooldata_field_whitelist`
- [ ] 後端新增 GET / POST / PATCH 3 個端點 + Service
- [ ] 後端套 `DirectorGuard`（寫入）/ `DirectorOrSectionChiefGuard`（GET）+ `FeatureFlagGuard`（寫入）
- [ ] 後端 categorical 欄位類別檢查
- [ ] Seed 腳本（含 CASEYEAR 99 特殊值）+ 冪等性測試
- [ ] error-handling.md 新增 `POOLDATA_OPTION_DUPLICATE` / `POOLDATA_OPTION_NOT_FOUND` / `POOLDATA_OPTION_FIELD_TYPE_INVALID`
- [ ] 前端「管理可選值」子頁面（自 F075 列表進入）
- [ ] 前端列表 / 新增 / 停用 / 啟用 Modal
- [ ] 前端處長唯讀渲染邏輯
- [ ] 前端 CASEYEAR 99 輔助說明
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
