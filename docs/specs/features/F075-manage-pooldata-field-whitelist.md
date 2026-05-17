---
spec-id: F075
title: POOLDATA 篩選欄位白名單管理（含 field_type metadata）
feature-id: F075
source-story: US-102
epic: E07
module: M06 代碼維護（進階）
priority: P0-MVP
version: "1.3"
date: 2026-05-17
status: Draft
---

# F075: POOLDATA 篩選欄位白名單管理（含 field_type metadata）

Priority: P0-MVP | Status: Draft | Last Updated: 2026-05-17

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
- 系統首次部署時自動 seed 8 筆（7 啟用 + 1 停用 PAYT_TERM）
- 停用欄位「不回溯」既有名單條件，月跑讀取直接讀 `ob_list_definition.filter_conditions` JSONB，不 join 白名單做欄位有效性驗證

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
- **Then** 系統自動 seed 8 筆：
  - PROD_KIND（categorical，啟用）
  - LIST_TYPE（categorical，啟用）
  - BEST_CASE（categorical，啟用）
  - SPEC_TP（categorical，啟用）
  - CASEYEAR（categorical，啟用）
  - SETTLE_SRC（categorical，啟用）
  - MONTH_CNT（numeric，啟用）
  - PAYT_TERM（numeric，**停用**）
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

- **Given** 名單定義 `OB202604010` 含篩選條件 `SETTLE_SRC = Y`；部長停用白名單中 `SETTLE_SRC`
- **When** 系統執行月跑讀取 `OB202604010` 之篩選條件
- **Then** 月跑仍正確讀取 `SETTLE_SRC = Y` 並過濾 OBPOOLDATA；不因欄位停用而失敗

### AC-9：欄位類別影響名單定義表單元件選擇

- **Given** 白名單某欄位 `field_type = categorical`
- **When** 部長 / Admin 於新名單定義表單選此欄位為篩選條件
- **Then** 表單元件為多選列表（可選值由 F076 維護取得）
- **And** 若 `field_type = numeric`，表單元件為數值範圍輸入（min / max）
- **And** 若 `field_type = date`，表單元件為日期範圍選擇器

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
    { "columnName": "PROD_KIND", "displayName": "產品類別", "fieldType": "categorical", "isActive": true, "createdAt": "...", "updatedAt": "..." },
    { "columnName": "MONTH_CNT", "displayName": "撈取月份計數", "fieldType": "numeric", "isActive": true, "createdAt": "...", "updatedAt": "..." }
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
  "columnName": "RISK_LEVEL",
  "displayName": "風險等級",
  "fieldType": "categorical"
}
```

**Response — 201 Created**

```json
{
  "columnName": "RISK_LEVEL",
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
  "columnName": "SETTLE_SRC",
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

## 7. UI/UX 需求

- **頁面入口**：M06 代碼維護 > POOLDATA 篩選欄位（新增分頁）
- **列表表格**：
  - 欄位：`column_name` / `display_name` / `field_type` / 狀態 / 建立時間 / 更新時間 / 操作
  - 停用欄位以灰色背景顯示，「停用」徽章標示
  - 操作欄：「編輯」「停用 / 啟用」「管理可選值」（僅 categorical 顯示）
  - 處長身份**完全不渲染**任何操作欄按鈕（含「新增欄位」上方按鈕）
- **新增欄位 Modal**：
  - 欄位：`column_name`（text，必填，提示「請輸入 OBPOOLDATA 之欄位名稱」）/ `display_name`（text，必填）/ `field_type`（select：數值型 / 類別型 / 日期型，必填）
  - 儲存後 categorical 欄位顯示提示「請至 POOLDATA 可選值維護頁設定可選值」
- **編輯 Modal**：與新增相同，但 `column_name` 為唯讀
- **`field_type` 變更警告 Modal**：自 categorical 改為 numeric / date 時彈出，內容「此欄位 {N} 個啟用可選值將自動停用（軟停用，歷史保留不刪除），且不再套用於新名單篩選；確定繼續？」+「確認」/「取消」按鈕；N 由 service 層 `GET options?active=true` 預查得到並回填至前端 Modal
- **停用確認 Modal**：「確認停用 {displayName}？此欄位將立即從新名單定義條件選單中消失，但既有名單條件不受影響。」
- **成功提示 toast**：「欄位『{displayName}』已新增 / 編輯 / 停用 / 啟用」

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
- 前端關鍵測試案例：
  - 處長頁面**無**任何操作按鈕
  - 部長頁面顯示新增 / 編輯 / 停用按鈕
  - `field_type = categorical` 顯示「管理可選值」按鈕
  - `field_type = numeric` / `date` 無「管理可選值」按鈕
  - 新增 categorical 後顯示提示 toast
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

## 12. 假設

| # | 假設 | 標記 |
|---|---|---|
| A-1 | **`pooldata_field_whitelist` schema 細節**：本 spec 列出概念欄位，DB schema 由 system-architect 決議（含 PK 設計：是否以 `column_name` 直接為 PK、或加 surrogate id） | [ASSUMPTION] 待 system-architect |
| A-2 | **硬刪除支援**：MVP 僅支援軟刪除（is_active = false）；硬刪除待 OQ-102-02 決議 | [ASSUMPTION] 待 PO |
| A-3 | **OBPOOLDATA 欄位變化追蹤**：若 ETL 端 OBPOOLDATA 欄位被廢除，本白名單對應 `column_name` 仍保留（不自動清理）；建議由 system-architect 設計「孤兒欄位」偵測機制（MVP 暫不實作） | [ASSUMPTION] 待 system-architect |
| A-4 | **Feature Flag gating 範圍**：F075 寫入端點屬 `ENABLE_E07_REFACTOR_PHASE3` flag gating；GET 不受限以保證下游 spec 可讀 | 沿用 F050 v2.0 §13.2 |

## 13. 變更紀錄

| 版本 | 日期 | 變更內容 |
|---|---|---|
| v1.0 | 2026-05-15 | 初版（取代 US-102，E07 補修批次 4）：新建 `pooldata_field_whitelist` 表；寫入限部長 + Admin（`DirectorGuard`）；查看開放至處長（`DirectorOrSectionChiefGuard`）；初始 8 筆 seed；停用不回溯既有條件；新增 3 個 errCode |
| v1.1 | 2026-05-16 | **Phase 1 風險決議落地**：(1) 決議 #2：新增 BR-10 Feature Flag fallback（503 + `FEATURE_NOT_ENABLED`），僅作用於寫入端點 |
| v1.2 | 2026-05-16 | **救援重寫**：前一輪編碼事故損毀本檔內容，依 US-102 + AD-E07 v3.0 一致性決議完整重建；Guard 名稱統一為 `DirectorGuard` / `DirectorOrSectionChiefGuard`（廢除 `SalesManagerGuard`）；保留 v1.0 / v1.1 所有設計決議 |
| v1.3 | 2026-05-17 | **PO 決議 F076-C 軟停用機制補修**（v1.2 救援過程遺失）：(1) BR-7 從「保留紀錄不刪除」強化為「service 層批次 SET `is_active = false` + `deactivation_reason = 'field_type_changed'`（同 transaction）」；(2) AC-6 confirm 文字補「將自動停用 N 個可選值」+ 稽核 details 補 `deactivatedOptionCount`；(3) UI Modal 文字升級；(4) 與 F076 v1.3 BR-6/BR-7 + data-model.md `pooldata_field_option.deactivation_reason` ENUM 對齊 |
