---
spec-id: F068
title: E07 相關代碼維護（PROD_KIND / SPEC_TP / CASE_STATUS）
feature-id: F068
source-story: US-092
epic: E07
module: M06 基礎代碼維護
priority: P0-MVP
version: "1.3-DEPRECATED"
date: 2026-05-20
status: Deprecated
deprecated: true
deprecated-date: 2026-05-20
deprecated-by: US-124, US-125
successor-specs: F075 v1.5, F076 v1.5
---

# F068: E07 相關代碼維護（PROD_KIND / SPEC_TP / CASE_STATUS）

Priority: P0-MVP | Status: **DEPRECATED v1.3** | Last Updated: 2026-05-20

> **⚠️ DEPRECATED v1.3（2026-05-20 / F050 v2.1 重構，J1 + J2 拍板）**
>
> **本 Feature 已於 2026-05-20（F050 v2.1 名單定義 whitelist-driven 重構）整份廢棄。**
>
> **廢棄原因**：
> - **J1 決議**：F075（POOLDATA 篩選欄位白名單）+ F076（類別型欄位可選值）為唯一篩選欄位來源；`ob_code_df` 中 PROD_KIND / SPEC_TP / CASE_STATUS 三個 `tbl_id` 重疊代碼搬完後刪除。
> - **J2 決議**：F068 整個 module 廢除（保留 `ob_code_df` entity 供未來其他 `tbl_id` 使用）。
> - **J4 決議**：sidebar「代碼維護」rename「篩選欄位」；原 37a / 37b 獨立頁合併為新 37 之 2-Tab 結構（US-124 落地）。
>
> **承接 spec**：
> - **F075 v1.5**：POOLDATA 篩選欄位白名單（補 `case_status` 條目，對齊 US-125 AC-5）
> - **F076 v1.5**：類別型欄位可選值（含 case_status 4 筆 + caseyear 8 筆 + spec_tp 32 筆 OBMCODEDF dump）
> - **US-124**：F068 入口廢除與「篩選欄位」2-Tab 合併管理頁
> - **US-125**：caseyear / case_status 可選值遷移至 `pooldata_field_option`
>
> **影響範圍**：
> - 整個 `apps/api/src/modules/assignment-code/` module 刪除（controller / service / DTO / tests）；`app.module.ts` 移除 `AssignmentCodeModule` import — 實際刪除作業由 **Phase 3a system-architect** 執行（GAP-LIST §I）。
> - 前端 `apps/web/src/pages/assignment/base-codes-page.tsx` 整頁刪除；`apps/web/src/api/assignment-codes.ts` 整檔刪除 — 由 **Phase 3b ui-ux-designer** 與後續實作階段執行（GAP-LIST §G7 / §G9）。
> - 35 個 prototype HTML 之 sidebar entry「代碼維護」rename「篩選欄位」，連結改指向新 37 頁 — 由 Phase 3b 執行（GAP-LIST §F9 / §H3）。
> - `ob_code_df` entity **保留**（供未來其他 `tbl_id` 使用）；DB 中 PROD_KIND / SPEC_TP / CASE_STATUS 三個 `tbl_id` 之資料由 Phase 3a migration 刪除（GAP-LIST §E7）。
> - error-handling.md `CODE_IN_USE` / `CODE_TYPE_INVALID` / `CODE_NOT_FOUND` 三個錯誤碼是否保留，由 Phase 3a 評估（GAP-LIST §I）。
>
> **請勿基於本 spec 進行任何實作或下游 spec 撰寫。**
> 以下章節原文保留作為歷史紀錄。

> **v1.2（2026-05-16）**：依 F002 v2.0 / AD-E07 v3.0 重構：GET 端點開放部長 + 處長（`DirectorOrSectionChiefGuard`），寫入端點（POST / PUT / DISABLE）限部長（`DirectorGuard`），新增 BR-6「處長禁用寫入」。

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `data-model.md#e07-data-model` + `error-handling.md#assignment-errors` |
| QA / Tester | 本文件 + `error-handling.md#assignment-errors` |
| UI/UX Designer | 本文件（第 7 節 UI/UX 需求） |
| Architect | 本文件 + `architecture-spec.md` §3.10（AssignmentCode Service） |

---

## 1. 功能摘要

提供業務部長維護 E07 客戶名單分派所需的**三類**代碼選項：**PROD_KIND**（產品類別）、**SPEC_TP**（專案類別）、**CASE_STATUS**（案件結清期別）。對應 `ob_code_df` 表的 `tbl_id` 篩選查詢。本 Feature 刻意**不做通用代碼管理平台**，scope 嚴格限定三類代碼，避免功能蔓延；其他 Epic 的代碼由對應模組各自負責。

> **CASEYEAR 不納入本 Feature 維護範圍**（OQ-E07-24 ✅ Resolved 2026-05-12）：舊系統前端 `reference/Areas/OBZ/Views/OBZ020/edit.cshtml:174-235` 證實 CASEYEAR 為 cshtml hard-coded 的 11 個 CheckBox（value `0`~`10`，對應合約年數整數；第 12 個 `99 = 10年以上` 被 Razor 註解掉未啟用），無 AJAX 從代碼維護 API 載入，與 PROD_KIND / SPEC_TP / CASE_STATUS 行為模式不同。OBMCODEDF dump 中 `TBL_ID='04'` 僅 1 筆紀錄屬其他模組殘留，與 E07 名單定義 CASEYEAR 無關。若未來業務確認需動態維護合約年數選項，再另行擴充本 Feature。

## 2. 使用者故事

**As a** 業務部長
**I want** 維護客戶名單分派所需的代碼選項（PROD_KIND / SPEC_TP / CASE_STATUS）
**So that** 可在不需 IT 介入的情況下，自行調整名單定義表單中的下拉與多選選項，確保代碼符合業務現況

## 3. 前置條件

- 使用者已登入並持有有效 JWT Token；GET 端點開放 `businessRole IN ('director','section_chief')`（`DirectorOrSectionChiefGuard`），寫入端點限 `businessRole='director'`（`DirectorGuard`）
- `ob_code_df` 已完成 E07 schema migration

## 4. 驗收標準

### AC-1：查看代碼清單

- **Given** 業務部長 / 業務處長進入 M06 基礎代碼維護頁面
- **When** 頁面載入完成
- **Then** 顯示**三個**代碼類別頁籤：「PROD_KIND（產品類別）」、「SPEC_TP（專案類別）」、「CASE_STATUS（案件結清期別）」
- **And** 每個類別列出目前所有代碼選項，含 `tbl_cd`（代碼值）、`tbl_desc1`（顯示名稱）、狀態（以 `stadt` / `enddt` 生效期間判斷）
- **And** CASE_STATUS 頁籤載入時，後端以 `tbl_id = 'CASE_STATUS'` 過濾 `ob_code_df`，初始 4 筆啟用選項（`01` 期中（不含當月滿期）、`02` 中結、`03` 滿期（含當月滿期）、`04` 滿期）

### AC-2：新增代碼選項

- **Given** 業務部長在某代碼類別頁籤點擊「新增」
- **When** 業務部長填入 `tbl_cd` 與 `tbl_desc1` 後點擊「儲存」
- **Then** 新紀錄寫入 `ob_code_df`（`system_id = 'OB'`（dump 全表驗證決議，OQ-E07-11 ✅ Resolved 2026-05-05）、`tbl_id = 'PROD_KIND'` / `'SPEC_TP'` / `'CASE_STATUS'`、`stadt` = 當日、`enddt` = `'99991231'`）
- **And** 新選項立即出現於 F050 / F051 表單對應欄位的可選清單中
- **And** 寫入 `assignment_audit_log`（`action = 'CREATE'`, `entity_type = 'ob_code_df'`, `entity_id = tbl_id + tbl_cd`）

### AC-3：修改代碼選項

- **Given** 業務部長點擊某代碼選項的「修改」
- **When** 業務部長更新 `tbl_desc1` 後點擊「儲存」
- **Then** `ob_code_df` 對應列 UPDATE `tbl_desc1`
- **And** 已使用該 `tbl_cd` 的既有名單定義不受影響（代碼值不變）
- **And** 寫入 `assignment_audit_log`（`action = 'UPDATE'`）

### AC-4：停用代碼選項

- **Given** 業務部長點擊某代碼選項的「停用」
- **When** 確認對話框確認後
- **Then** `ob_code_df` 對應列 UPDATE `enddt` 為當日 + 1 天（或直接設為當日）
- **And** 已停用代碼不再出現於 F050 / F051 表單的可選清單
- **And** 既有名單定義中已選用該代碼值的欄位值保持不變（不做回溯修改）
- **And** 寫入 `assignment_audit_log`（`action = 'DISABLE'`）

### AC-5：代碼值唯一性驗證

- **Given** 業務部長在同一代碼類別新增代碼值
- **When** 輸入的 `tbl_cd` 與該類別既有（`stadt <= TODAY <= enddt`）代碼值重複
- **Then** 系統回傳 422 `CODE_IN_USE`，訊息：「代碼值 {tbl_cd} 在類別 {tbl_id} 中已存在」，不寫入

### AC-6：代碼類別限制

- **Given** 業務部長嘗試透過 API 傳送 `tbl_id` 為非 PROD_KIND / SPEC_TP / CASE_STATUS 的值（含 `CASEYEAR`，因屬前端 hard-coded 不入庫）
- **When** 後端驗證
- **Then** 回傳 422 `CODE_TYPE_INVALID`，訊息：「本功能僅支援 PROD_KIND / SPEC_TP / CASE_STATUS 三類代碼維護」

## 5. API 規格

### 5.1 GET /api/v1/assignment/codes

**Query Parameters**

| 參數 | 型別 | 必填 | 說明 |
|---|---|---|---|
| tblId | string | 是 | `PROD_KIND` / `SPEC_TP` / `CASE_STATUS`（CASEYEAR 不接受，回 `CODE_TYPE_INVALID`） |
| includeInactive | boolean | 否 | 是否含已停用代碼，預設 false |

**Response — 200 OK**

```json
{
  "tblId": "PROD_KIND",
  "data": [
    { "tblCd": "01", "tblDesc1": "汽車貸款", "stadt": "20260101", "enddt": "99991231", "active": true },
    { "tblCd": "02", "tblDesc1": "機車貸款", "stadt": "20260101", "enddt": "99991231", "active": true }
  ]
}
```

### 5.2 POST /api/v1/assignment/codes

**Request Body**

```json
{
  "tblId": "PROD_KIND",
  "tblCd": "03",
  "tblDesc1": "商用車貸款"
}
```

### 5.3 PUT /api/v1/assignment/codes/:tblId/:tblCd

**Request Body**

```json
{
  "tblDesc1": "汽車貸款（修訂）"
}
```

### 5.4 PUT /api/v1/assignment/codes/:tblId/:tblCd/disable

**Response — 200 OK**：停用後的資訊。

**錯誤回應**

| HTTP | 錯誤碼 | 說明 |
|---|---|---|
| 401 | AUTH_TOKEN_MISSING | 未登入 |
| 403 | E07_ROLE_NOT_ASSIGNED | GET 端點：`businessRole` 非 `'director'` / `'section_chief'`（`DirectorOrSectionChiefGuard`） |
| 403 | E07_REQUIRES_DIRECTOR | 寫入端點（POST / PUT / DISABLE）：`businessRole='section_chief'`（`DirectorGuard` 攔截，依 F002 §4.6.2 + BR-6） |
| 422 | CODE_IN_USE | 代碼值已存在 |
| 422 | CODE_TYPE_INVALID | 代碼類別非 PROD_KIND / SPEC_TP / CASE_STATUS（CASEYEAR 屬前端 hard-coded，亦回此錯誤） |
| 404 | CODE_NOT_FOUND | 指定的 `tbl_id + tbl_cd` 不存在 |

## 6. 商業規則

| 規則編號 | 說明 |
|---|---|
| BR-1 | 本 Feature 僅管理三類代碼：PROD_KIND / SPEC_TP / CASE_STATUS；其他 `tbl_id` 值（含 `CASEYEAR`，屬前端 hard-coded）一律回傳 `CODE_TYPE_INVALID`（OQ-E07-24 ✅ Resolved 2026-05-12，證據 `reference/Areas/OBZ/Views/OBZ020/edit.cshtml:174-235`） |
| BR-2 | 代碼啟用狀態以 `stadt <= TODAY <= enddt` 判斷 |
| BR-3 | 代碼值唯一性檢查範圍：同一 `tbl_id` 下處於啟用期間的紀錄 |
| BR-4 | 停用代碼不回溯修改既有 `ob_list_definition` 中已選用的代碼值 |
| BR-5 | GET 端點：`role='admin'` 或 `businessRole IN ('director','section_chief')` 均可存取（`DirectorOrSectionChiefGuard`） |
| BR-6 | **處長禁用寫入（v1.2 新增）**：寫入端點（POST / PUT / DISABLE）僅 `role='admin'` 或 `businessRole='director'` 可呼叫，`businessRole='section_chief'` 一律 HTTP 403 `E07_REQUIRES_DIRECTOR`；前端 sidebar / 代碼維護頁的「新增 / 修改 / 停用」按鈕在 `businessRole='section_chief'` 時隱藏或 disabled（依 F002 §4.6.1 處長對 M06 寫入為 No 的決議） |

## 7. UI/UX 需求

- 三個分頁（Tabs）：PROD_KIND / SPEC_TP / CASE_STATUS（**不含 CASEYEAR**：F050/F051 該欄位為前端固定 11 個選項 0~10，不在此維護）
- 每個分頁：代碼清單表格 + 「新增」按鈕（**處長視角隱藏或 disabled**，依 BR-6）
- 清單欄位：`tbl_cd` / `tbl_desc1` / 狀態（啟用/停用）/ 操作（修改/停用，**處長視角隱藏整欄**，依 BR-6）
- 停用按鈕 Modal 確認：「確定停用代碼 {tbl_cd}？停用後 F050/F051 表單將不再顯示此選項。既有名單不受影響。」
- 處長進入頁面時，頂部提示：「本頁為唯讀模式，代碼新增 / 修改 / 停用需業務部長權限。」

## 8. 相依性

- **Blocked By**：F001（登入驗證）
- **Blocks**：F050（新增名單需 PROD_KIND / SPEC_TP / CASE_STATUS 代碼就緒；CASEYEAR 為前端 hard-coded 不阻擋）、F051（編輯名單同上）

## 9. 交叉參考

- 資料模型：[data-model.md#e07-data-model](../data-model.md#e07-data-model)（`ob_code_df`）
- 錯誤處理：[error-handling.md#assignment-errors](../error-handling.md#assignment-errors)
- 架構決策：AD-E07-1（OB 遷移，`ob_code_df` 對應舊 OBMCODEDF）
- 相關功能：[F050](F050-create-list-definition.md)、[F051](F051-edit-list-definition.md)

## 10. 假設

| # | 假設 | 標記 |
|---|---|---|
| A-1 | ~~`ob_code_df.system_id` 值為 `'E07'` 或其他固定值~~ **已解決（2026-05-05）**：dump 全表驗證 OBMCODEDF.SYSTEM_ID 全為 `'OB'`（`reference/DumpData/OBMCODEDF_20260505.csv`），E07 寫入時固定使用 `system_id = 'OB'`（沿用舊值，**不採** `'E07'`） | ✅ Resolved（OQ-E07-11） |
| A-2 | 停用操作以 `enddt` = 當日或當日 + 1 標示（非刪除紀錄） | [ASSUMPTION] |
| A-3 | CASE_STATUS 在 `ob_code_df` 中以 `tbl_id = 'CASE_STATUS'` 識別，對應原系統 OBMCODEDF `TBL_ID = '22'`（dump 2026-05-05 驗證已生效 4 筆：`01` 期中（不含當月滿期）/ `02` 中結 / `03` 滿期（含當月滿期）/ `04` 滿期）。新系統 `tbl_id` 採英文名常數（CASE_STATUS），與其他兩類（PROD_KIND / SPEC_TP）一致；遷移依 AD-E07-14 白名單 `'22' → 'CASE_STATUS'`。**CASEYEAR 不在本 Feature 範圍**（OQ-E07-24 ✅ Resolved 2026-05-12，前端 hard-coded）。**v1.3 補述（2026-05-20 / F050 v2.1 重構）**：CASE_STATUS 來源在 v2.1 已遷移至 `pooldata_field_option`（US-125 AC-2），本段 `ob_code_df` 之 CASE_STATUS 描述僅供歷史對照；新實作請參照 [F075 v1.5](F075-manage-pooldata-field-whitelist.md) + [F076 v1.5](F076-manage-categorical-field-values.md)。 | ✅ Resolved（AD-E07-14） / DEPRECATED v1.3 |
