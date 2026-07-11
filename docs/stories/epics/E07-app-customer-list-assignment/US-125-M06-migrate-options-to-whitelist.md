---
story-id: US-125
title: caseyear / case_status 可選值遷移至 pooldata_field_option
epic: E07 — 客戶名單分派
module: M06 篩選欄位
priority: Must Have
status: Draft
date: 2026-05-19
version: "1.0"
source-feature-spec: F075-manage-pooldata-field-whitelist, F076-manage-categorical-field-values, F068-edit-base-code
---

# US-125：caseyear / case_status 可選值遷移至 pooldata_field_option

> **Story ID**：US-125
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M06 篩選欄位
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：5

---

## User Story

**As a** 部長（Director）或 Admin
**I want** 在名單定義表單中，caseyear 與 case_status 的可選值從 `pooldata_field_option` 動態載入，而非讀取 `ob_code_df`
**So that** 所有篩選欄位的可選值均由統一的 F075 / F076 機制管理，業務主管不需透過兩套不同介面維護不同代碼來源，管理責任清晰且可追溯

---

## 背景說明

v1.0 設計中，caseyear / case_status 的選項由 `ob_code_df` 提供，透過 F068（代碼維護）維護。v2.1 重構決議（J1）：F075 + F076 為**唯一篩選欄位來源**。本 Story 確保：

1. `pooldata_field_whitelist` 新增 `caseyear` 與 `case_status` 條目
2. `pooldata_field_option` 新增對應 Seed（caseyear 8 筆、case_status 4 筆）
3. 名單定義表單的 caseyear / case_status 選項改從 `pooldata_field_option` 載入
4. `ob_code_df` 中的 PROD_KIND / SPEC_TP / CASE_STATUS 重疊代碼不再被前端讀取

**caseyear 選項決議（J5）**：保留 m22 seed 8 筆（`0`~`6` + `99`），不採用 hardcoded 11 筆（`0`~`10`）。Phase 2 spec-writer 負責更新 F050 §8 文字。

**涵蓋 GAP-LIST 項目**：A4、A5、E3、E4、E5、E6、E7、J1、J5

---

## 驗收標準

### AC-1：caseyear 可選值來源改為 pooldata_field_option（J5 決議 8 筆）

- **Given** 部長或 Admin 在名單定義建立 / 編輯表單（US-106）選取 caseyear 作為篩選欄位
- **When** 系統載入 caseyear 的可選值清單
- **Then** 可選值來源為 `pooldata_field_option`，`column_name = 'caseyear'`，僅顯示 `is_active = true` 的選項
- **And** 初始 Seed 包含 8 筆：`0`（0年）、`1`（1年）、`2`（2年）、`3`（3年）、`4`（4年）、`5`（5年）、`6`（6年以上）、`99`（不限年數）
- **And** 系統不再 hardcode 11 筆（`0`~`10`）；亦不讀取 `ob_code_df`

> **業務意義（A4/J5）**：caseyear 選項數量與業務系統 m22 seed 對齊（8 筆），舊 spec 描述的 11 筆為誤差，由 Phase 2 spec-writer 修正。

---

### AC-2：case_status 可選值來源改為 pooldata_field_option（4 筆初始）

- **Given** 部長或 Admin 在名單定義建立 / 編輯表單選取 case_status 作為篩選欄位
- **When** 系統載入 case_status 的可選值清單
- **Then** 可選值來源為 `pooldata_field_option`，`column_name = 'case_status'`，僅顯示 `is_active = true` 的選項
- **And** 初始 Seed 包含 4 筆：`01`（期中，不含當月滿期）、`02`（中結）、`03`（滿期，含當月滿期）、`04`（滿期）
- **And** 系統不再讀取 `ob_code_df` 的 `tbl_id = '22'`

> **業務意義（A5/E4）**：case_status 選項維護責任從 F068 轉移至 F076（US-103），與其他 categorical 欄位管理方式一致。

---

### AC-3：ob_code_df 重疊代碼不再被任何前端頁面讀取

- **Given** v2.1 系統上線後
- **When** 使用者操作名單定義（建立 / 編輯 / 清單查看）或篩選欄位管理頁面
- **Then** 所有篩選欄位的可選值均來自 `pooldata_field_whitelist` + `pooldata_field_option`；沒有任何前端頁面呼叫 F068 API 或直接查詢 `ob_code_df` 的 PROD_KIND / SPEC_TP / CASE_STATUS 記錄
- **And** `ob_code_df` 中這三個 `tbl_id` 的資料雖保留（DB 層刪除由 Phase 3a system-architect 負責，對應 E7），但前端完全不依賴這些資料

> **業務意義（E7/J1）**：重疊代碼移除後，系統有唯一可信任的代碼來源，消除雙重維護造成的資料不一致風險。

---

### AC-4：caseyear 選項不再 hardcoded（動態載入）

- **Given** 前端 caseyear 選取元件
- **When** 載入可選值
- **Then** 選項由 API `GET /api/v1/pooldata-fields/caseyear/options?active=true` 動態取得，**不使用任何前端 hardcoded 陣列**
- **And** 若管理員透過 US-103 新增或停用 caseyear 的可選值，表單選項立即反映變更，不需重新部署前端

> **業務意義（A4/F3）**：動態載入讓業務主管可透過 US-103 自行調整 caseyear 選項，不需 IT 修改前端程式。

---

### AC-5：pooldata_field_whitelist 新增 caseyear 與 case_status 條目

- **Given** 系統首次部署或執行初始化腳本
- **When** Admin 執行初始化
- **Then** `pooldata_field_whitelist` 包含以下兩筆（如尚未存在）：
  - `column_name = 'caseyear'`、`display_name = '進件/滿期/中結年數'`、`field_type = 'categorical'`、`is_active = true`
  - `column_name = 'case_status'`、`display_name = '案件結清期別'`、`field_type = 'categorical'`、`is_active = true`
- **And** Seed 為冪等操作（重複執行不產生重複資料）

> **業務意義（E3）**：白名單需包含這兩個欄位，名單定義才能選取 caseyear / case_status 作為篩選條件（US-121 AC-2 的白名單驗證才能通過）。

---

## 技術備註

- `ob_code_df` 中 PROD_KIND / SPEC_TP / CASE_STATUS 的 DB 層清除（E4、E5、E6、E7）由 **Phase 3a system-architect** 執行 migration 腳本；本 Story 不涉及 DB 直接操作
- PROD_KIND 3 筆與 SPEC_TP 32 筆的對應 `pooldata_field_option` Seed 值（E5、E6），依 OBMCODEDF 真實 dump 確認，由 Phase 3a 補充；本 Story 專注在 caseyear（J5 已拍板 8 筆）與 case_status（已知 4 筆）
- `option_label` 的完整中文顯示名稱在 US-103 初始 Seed 中定義；本 Story 僅確認欄位存在且來源正確
- caseyear 的特殊值 `99` 在月名單分派 Stage 1 的查詢邏輯（YEAR_CNT 無上限語意）由 **Phase 3a** 處理；US-103 seed 已有「99 = 不限年數」說明標籤

---

## 測試案例

### TC-125-01：caseyear 表單選項來自 pooldata_field_option（8 筆）

- **Given**：pooldata_field_option 已 seed caseyear 8 筆（0~6 + 99），均 is_active = true
- **When**：部長在名單定義表單選取 caseyear 欄位
- **Then**：多選元件顯示 8 個選項；不顯示 7（第 7 年）或 10（第 10 年）等額外選項

### TC-125-02：case_status 表單選項來自 pooldata_field_option（4 筆）

- **Given**：pooldata_field_option 已 seed case_status 4 筆（01/02/03/04），均 is_active = true
- **When**：部長在名單定義表單選取 case_status 欄位
- **Then**：多選元件顯示 4 個選項；不讀取 ob_code_df

### TC-125-03：ob_code_df 不再被前端讀取

- **Given**：v2.1 系統上線；ob_code_df 中仍有 PROD_KIND / SPEC_TP / CASE_STATUS 資料
- **When**：部長操作名單定義建立表單，查看 PROD_KIND、SPEC_TP、caseyear、case_status 欄位的可選值
- **Then**：所有選項來源為 pooldata_field_option；Network 請求中無任何呼叫 F068 API（`/api/v1/assignment-codes` 或類似路徑）

### TC-125-04：caseyear 動態載入（停用一個選項後立即反映）

- **Given**：部長透過 US-103 停用 caseyear 可選值 `99`
- **When**：另一部長開啟名單定義建立表單，選取 caseyear 欄位
- **Then**：多選元件只顯示 7 個選項（0~6），`99` 不顯示

### TC-125-05：白名單包含 caseyear 與 case_status（冪等 Seed）

- **Given**：執行初始化腳本
- **When**：再次執行
- **Then**：pooldata_field_whitelist 中 caseyear 與 case_status 各有 1 筆，不重複；is_active = true

---

## 依賴關係

- **Blocked By**：US-103（pooldata_field_option 表需存在才能新增 Seed）、US-102（pooldata_field_whitelist 表需存在才能新增 caseyear / case_status 條目）
- **Blocks**：US-121（condition_payload 驗證時 caseyear / case_status 的 columnName 需在白名單中）、US-124（ob_code_df 代碼搬完後才能廢除 F068 入口）、US-106（修改版，caseyear / case_status 選項正確來源）

---

## Definition of Done

- [ ] 驗收標準全部通過
- [ ] caseyear 8 筆選項測試（TC-125-01）
- [ ] case_status 4 筆選項測試（TC-125-02）
- [ ] ob_code_df 不被前端讀取測試（TC-125-03）
- [ ] caseyear 動態載入測試（TC-125-04）
- [ ] 白名單冪等 Seed 測試（TC-125-05）
- [ ] 單元測試覆蓋率 ≥ 80%
- [ ] Code review 通過
- [ ] 文件已更新

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **GAP-LIST**：`docs/specs/implementation-log/F050-v2.1-refactor-gap-list.md`（A4、A5、E3~E7、J1、J5）
- **相關 Stories**：US-102（白名單欄位，新增 caseyear / case_status 條目）、US-103（可選值管理，補充 caseyear / case_status Seed）、US-106（名單定義表單，選項來源改為 pooldata_field_option）、US-121（condition_payload 驗證，需白名單有效）、US-124（F068 廢除，依賴本 Story 完成）
- **Feature Spec**：`docs/specs/features/F075-manage-pooldata-field-whitelist.md`、`docs/specs/features/F076-manage-categorical-field-values.md`、`docs/specs/features/F068-edit-base-code.md`（待廢除）
