---
story-id: US-121
title: whitelist-driven 篩選條件驗證規則（condition_payload 為 source of truth）
epic: E07 — 客戶名單分派
module: M01 名單定義
priority: Must Have
status: Draft
date: 2026-05-19
version: "1.0"
source-feature-spec: F050-create-list-definition, F051-edit-list-definition
---

# US-121：whitelist-driven 篩選條件驗證規則（condition_payload 為 source of truth）

> **Story ID**：US-121
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M01 名單定義
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：5

---

## User Story

**As a** 部長（Director）或 Admin
**I want** 在建立或編輯草稿名單時，系統依據 F075 白名單驗證篩選條件的欄位與格式，並以 condition_payload 作為名單篩選條件的唯一儲存來源
**So that** 名單篩選條件的維護責任由業務主管自主掌控，欄位選項不再由 IT 硬編碼，且條件合法性在儲存前即可被系統驗證

---

## 背景說明

本 Story 是 F050 v2.1 whitelist-driven 重構的核心驗證規則定義，為下列 Story 提供共用業務規則依據：

- **US-106**（草稿階段建立名單）：建立時套用本 Story 定義的驗證規則
- **US-122**（月名單分派 Stage 1 動態 WHERE）：月名單分派執行依本 Story 所定義的 condition_payload 語意組合查詢
- **US-123**（舊名單 backward-compat 讀取）：舊名單（condition_payload IS NULL）的例外處理

**主要語意變更（相較於 v1.0 設計）**：
1. `condition_payload` 從「optional 備用欄位」升格為**必填的篩選條件唯一來源**
2. 原本 5 個 entity column（`prod_kind` / `caseyear` / `spec_tp` / `settle_src` / `case_status`）降為**讀取用 backward-compat 欄位**，由後端衍生填入，不由前端直接送出
3. `list_period_start` / `list_period_end` / `list_period_interval` 維持為一級欄位（J8 決議），不納入 `condition_payload`
4. 五階段流程的 stage guard（K1）完整保留

**涵蓋 GAP-LIST 項目**：A1、A2、A3、B1、B2、B3、C1、C2、C3、G1、G2、G4、J1、J7、J8、K1、K3

---

## 驗收標準

### AC-1：condition_payload 必填（至少一個條件）

- **Given** 部長或 Admin 在建立或編輯草稿名單表單中點擊「儲存」
- **When** 前端送出的 `condition_payload.conditions` 陣列為空（長度為 0）
- **Then** 後端回傳 422，錯誤訊息為「篩選條件不得為空，請至少設定一個欄位」
- **And** 前端在按下儲存前即進行本地驗證，若 conditions 為空，阻擋儲存並顯示同等錯誤提示

> **業務意義（A1/A2）**：condition_payload 取代舊設計的 9 個固定一級欄位必填語意。名單必須有至少一個動態篩選條件方可進入流程。5 個舊 entity column 由後端依 condition_payload 衍生填入，前端不需送出。

---

### AC-2：columnName 白名單驗證（CONDITION_COLUMN_NOT_IN_WHITELIST）

- **Given** 部長或 Admin 儲存名單時，`condition_payload.conditions` 中有任一條件的 `columnName` 值不存在於 `pooldata_field_whitelist` 中，或對應欄位的 `is_active = false`
- **When** 後端驗證 condition_payload
- **Then** 後端回傳 422，`error_code: CONDITION_COLUMN_NOT_IN_WHITELIST`，回應體包含不合法的 `columnName` 欄位名稱
- **And** 前端已在條件篩選欄位選取 dropdown 中排除 `is_active = false` 的欄位，此 AC 作為後端防禦層（defense-in-depth），確保即使前端繞過，後端仍正確拒絕

> **業務意義（A3/B2/C2）**：確保名單篩選欄位一律來自有效白名單，管理員停用欄位後，新建名單不得再使用該欄位。

---

### AC-3：stage 保護（condition_payload 寫入限 draft）

- **Given** 某名單定義的 `stage` 不為 `draft`（例如 `dept_ratio` / `personnel_ratio` / `approval` / `ready`）
- **When** 任何使用者嘗試送出 condition_payload 修改請求（PUT / PATCH）
- **Then** 後端回傳 422，`error_code: LIST_STAGE_TRANSITION_FORBIDDEN`（沿用既有錯誤碼，K1 約束）
- **And** 此規則在任何 Rollback 操作完成後立即生效：名單 stage 回到 `draft` 後，condition_payload 重新開放寫入（K3 保留語意）
- **And** 月名單分派執行中（AssignmentRun status = 'running'）時，即使名單為 draft，condition_payload 寫入一律被拒（月名單分派鎖定優先於 stage guard）

> **業務意義（K1/K3/J7）**：五階段流程的完整性不因本次重構破壞。草稿之後的任何階段，篩選條件均為唯讀，防止條件在流程進行中被修改影響分派結果。

---

### AC-4：INACTIVE 選項警示（非阻擋）

- **Given** 部長或 Admin 儲存名單時，`condition_payload.conditions` 中任一類別型條件的 `values` 陣列包含 `pooldata_field_option.is_active = false` 的選項值
- **When** 後端完成驗證並準備寫入
- **Then** 後端以 HTTP 200 成功儲存，並在回應體附加警告：`warnings: [{ code: "WHITELIST_OPTION_INACTIVE", affectedFields: ["<欄位名稱>"] }]`
- **And** 前端顯示非阻擋式提示：「部分篩選條件的選項值已停用，請確認是否仍符合業務需求。受影響欄位：<欄位顯示名稱>」
- **And** 使用者可忽略警告，名單仍正常儲存

> **業務意義（C2）**：停用選項的月名單分派不回溯語意（見 US-103 AC-7）同樣延伸至儲存時。管理員停用某選項後，既有已選取該值的名單仍可正常月名單分派；本 AC 只是在儲存時提醒，不阻擋。

---

### AC-5：list_period_* 禁止納入 conditions（RESERVED_FIELD_IN_CONDITIONS）

- **Given** 任何使用者送出的 condition_payload 中，`conditions` 陣列包含 `columnName` 為 `list_period_start`、`list_period_end` 或 `list_period_interval` 的條件
- **When** 後端驗證 condition_payload
- **Then** 後端回傳 400，`error_code: RESERVED_FIELD_IN_CONDITIONS`，訊息說明這三個欄位為一級保留欄位，不得放入動態篩選條件
- **And** 前端條件選取 dropdown 不列出這三個欄位，此 AC 作為後端防禦層（defense-in-depth）

> **業務意義（J8）**：`list_period_start` / `list_period_end` / `list_period_interval` 是業務主管設定撈取期數的一級欄位，語意與動態篩選條件不同，需強制分離以避免邏輯混淆。

---

## 技術備註

- condition_payload 的具體 JSON schema（欄位結構、型別定義）由 **Phase 2 spec-writer** 在 F050 spec 中定義；**Phase 3a system-architect** 負責 DB migration（E1）
- 5 個 entity column 的衍生填入邏輯（C3）由 Phase 3a 決定；本 Story 僅定義 user-facing 語意
- `CONDITION_COLUMN_NOT_IN_WHITELIST` 錯誤碼由 Phase 2 spec-writer 寫入 error-handling.md
- `RESERVED_FIELD_IN_CONDITIONS` 錯誤碼亦由 Phase 2 spec-writer 定義
- columnName 大小寫 normalize 規則（F2 GAP：UPPER_SNAKE vs lower_snake）由 spec-writer 在 F050 spec 中定義；本 Story 僅聲明「大小寫不一致不應影響功能」

---

## 測試案例

### TC-121-01：conditions 陣列為空時阻擋儲存

- **Given**：部長帳號，草稿名單 `OB202507001`，送出 `condition_payload: { conditions: [], logic: "AND" }`
- **When**：PUT 建立/編輯 API
- **Then**：後端回 422，錯誤訊息包含「篩選條件不得為空」

### TC-121-02：columnName 不在白名單時阻擋儲存

- **Given**：白名單中無 `INVALID_FIELD`；部長送出 `conditions: [{ columnName: "INVALID_FIELD", ... }]`
- **When**：PUT API
- **Then**：後端回 422，`error_code: CONDITION_COLUMN_NOT_IN_WHITELIST`，回應含 `columnName: "INVALID_FIELD"`

### TC-121-03：columnName 對應停用白名單欄位時阻擋

- **Given**：白名單 `SETTLE_SRC` 為 `is_active = false`；部長送出含 `SETTLE_SRC` 條件的 payload
- **When**：PUT API
- **Then**：後端回 422，`error_code: CONDITION_COLUMN_NOT_IN_WHITELIST`

### TC-121-04：非 draft 階段名單禁止修改 condition_payload

- **Given**：名單 `OB202507001` stage = `dept_ratio`
- **When**：部長嘗試 PUT condition_payload
- **Then**：後端回 422，`error_code: LIST_STAGE_TRANSITION_FORBIDDEN`

### TC-121-05：含停用選項值時警示但不阻擋

- **Given**：`PROD_KIND` 的可選值 `02` 已停用；部長送出含 `PROD_KIND values: ["01", "02"]` 的 payload
- **When**：PUT API（草稿名單）
- **Then**：後端回 200，response body 含 `warnings: [{ code: "WHITELIST_OPTION_INACTIVE", affectedFields: ["prod_kind"] }]`

### TC-121-06：list_period_* 納入 conditions 時阻擋

- **Given**：部長送出 `conditions: [{ columnName: "list_period_start", ... }]`
- **When**：PUT API
- **Then**：後端回 400，`error_code: RESERVED_FIELD_IN_CONDITIONS`

### TC-121-07：Rollback 後 condition_payload 重新可編輯

- **Given**：名單 stage 從 `dept_ratio` Rollback 至 `draft`（US-111）
- **When**：部長送出合法的 condition_payload 修改請求
- **Then**：後端回 200，condition_payload 更新成功

---

## 依賴關係

- **Blocked By**：US-102（白名單欄位就緒，驗證需查詢白名單）、US-103（可選值就緒，INACTIVE 警示需查詢可選值）、US-125（case_status / caseyear 移入 pooldata_field_option，選項驗證才能覆蓋完整）、US-100（部長角色定義）
- **Blocks**：US-106（修改版，建立/編輯名單的新 AC 依賴本 Story 定義的驗證規則）、US-122（月名單分派 Stage 1 的 condition_payload 讀取語意）

---

## Definition of Done

- [ ] 驗收標準全部通過
- [ ] conditions 為空時阻擋測試（TC-121-01）
- [ ] columnName 不在白名單時阻擋測試（TC-121-02、TC-121-03）
- [ ] 非 draft stage 寫入被拒測試（TC-121-04）
- [ ] INACTIVE 選項警示（非阻擋）測試（TC-121-05）
- [ ] list_period_* 納入 conditions 被拒測試（TC-121-06）
- [ ] Rollback 後恢復可編輯測試（TC-121-07）
- [ ] 單元測試覆蓋率 ≥ 80%
- [ ] Code review 通過
- [ ] 文件已更新

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **GAP-LIST**：`docs/specs/implementation-log/F050-v2.1-refactor-gap-list.md`（A1、A2、A3、B1~B3、C1~C3、G1~G4、J1、J7、J8、K1、K3）
- **相關 Stories**：US-102（白名單欄位）、US-103（類別型可選值）、US-106（草稿建立名單，套用本 Story 規則）、US-122（月名單分派 Stage 1）、US-123（舊名單 fallback）、US-125（caseyear / case_status 選項遷移）
- **Feature Spec**：`docs/specs/features/F050-create-list-definition.md`（Phase 2 spec-writer 負責更新）、`docs/specs/features/F051-edit-list-definition.md`
