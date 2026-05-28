---
last-updated: 2026-05-28
version: v1.0
change-summary: "新增 story：將「優質案件（best_case）」鎖定為系統固定篩選條件，使用者無法移除或修改其值；同步引入 is_system_fixed 旗標至 pooldata_field_whitelist，並補入草稿名單回填 migration。"
---

# US-144：「優質案件」鎖定為系統固定篩選條件（Design A）

> **Story ID**：US-144
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M01 名單定義（主）/ M06 篩選欄位（次）
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：5

---

## User Story

**As a** 系統（business rule enforcement layer）
**I want** `best_case` 篩選條件在每份名單定義中被強制鎖定為 `values: ['Y']`，且使用者無法移除或修改它
**So that** CDMP 與舊系統（OBPOOLDATA.BEST_CASE / OBMLISTDF.PROD_BEST 硬編碼 'Y'）維持相同業務語意：所有名單必定只篩選優質案件，消除人員誤操作的業務風險

---

## 背景說明

舊系統（legacy 客戶名單分派）中，`OBPOOLDATA.BEST_CASE` / `OBMLISTDF.PROD_BEST` 固定為 `'Y'`，無法由使用者設定。

US-128 / US-129 已將 `best_case` 加入 F075 白名單（categorical，display_name「優質案件」，Y / N 兩個 active option），並從基本資訊區的 `prod_best` 一級欄位移除。目前（US-129 完成後）`best_case` 仍為使用者可自由新增、移除、設值的普通篩選條件。

本 Story 落地 **Design A（condition_payload 注入鎖定）** 決議：

- **後端強制注入**：`createList` / `updateList` 時，服務層在驗證完 condition_payload 後，強制將 `{ columnName: 'best_case', fieldType: 'categorical', values: ['Y'] }` 注入 condition_payload（若已存在則正規化為 `['Y']`）。
- **前端鎖定行為**：`best_case` 條件列以 🔒 標記顯示為「系統固定」，無刪除按鈕，值欄位為唯讀。
- **新增條件下拉排除**：`best_case` 從「新增條件」dropdown 排除（已固定存在，不需手動新增）。
- **is_system_fixed 旗標**：`pooldata_field_whitelist` 新增 `is_system_fixed BOOLEAN NOT NULL DEFAULT false` 欄位；`best_case` 的 `is_system_fixed = true`；系統固定欄位無法在 M06 管理頁被停用（`is_active` 不得改為 false）。
- **Migration 回填範圍**：僅回填 `stage = 'draft'` 的名單；`stage IN ('dept_ratio', 'personnel_ratio', 'approval', 'ready')` 名單為凍結快照，不回填。

---

## 驗收標準

### AC-1：建立草稿名單時 best_case 自動注入 condition_payload

- **Given** 部長或 Admin 在「建立草稿名單」頁填妥基本資訊與其他篩選條件，點擊「儲存」
- **When** 後端 `createList` 服務方法執行
- **Then** condition_payload 中必定包含 `{ columnName: 'best_case', fieldType: 'categorical', values: ['Y'] }` 條目，無論使用者是否自行加入
- **And** 若使用者的 payload 中未包含 `best_case`，服務層靜默注入；若已包含，服務層將其 values 正規化為 `['Y']`（tamper-proof）
- **And** 儲存成功後，讀取 `ob_list_definition.condition_payload` 可確認 `best_case` 條目存在且 `values = ['Y']`

### AC-2：更新草稿名單時 best_case 自動正規化並持續注入

- **Given** 部長或 Admin 在「編輯草稿名單」頁修改其他篩選條件，點擊「儲存」
- **When** 後端 `updateList` 服務方法執行
- **Then** 更新後的 condition_payload 中 `best_case` 條目必定存在且 `values = ['Y']`
- **And** 前端若嘗試傳入 `values: ['N']` 或 `values: []`（值竄改），後端靜默正規化為 `['Y']`，回傳 200 OK（不拒絕請求，但靜默修正）
- **And** 前端若在 payload 中完全省略 `best_case` 條目，後端自動補入

### AC-3：前端篩選條件 UI — best_case 顯示為鎖定列（建立與編輯頁）

- **Given** 部長或 Admin 進入「建立草稿名單」頁（`/assignment/list-definitions/new`）或「編輯草稿名單」頁
- **When** 篩選條件區塊渲染
- **Then** `best_case` 條目顯示為一列固定項目，呈現 🔒 圖示與標籤「優質案件（系統固定）」，值顯示為「Y（優質案件）」（唯讀，無法修改）
- **And** 該列不存在刪除按鈕（Trash2 圖示）（`data-testid="remove-condition-best_case"` 元素不存在於 DOM）
- **And** 值的多選元件（checkbox / tag）處於停用（disabled）狀態，使用者無法變更選取

### AC-4：best_case 從「新增條件」dropdown 排除

- **Given** 部長或 Admin 在篩選條件區塊點擊「新增條件」（或「新增篩選欄位」）按鈕
- **When** 下拉選單展開，顯示可選的 active 白名單欄位
- **Then** `best_case`（「優質案件」）不出現在此下拉清單中
- **And** 其他 `is_system_fixed = false` 的 active 欄位仍正常顯示

### AC-5：is_system_fixed 旗標 seed — best_case 設為 true

- **Given** Migration 執行完成（新增 `is_system_fixed` 欄位並 seed）
- **When** 查詢 `pooldata_field_whitelist WHERE column_name = 'best_case'`
- **Then** 紀錄存在，`is_system_fixed = true`、`is_active = true`、`field_type = 'categorical'`、`display_name = '優質案件'`
- **And** 其餘所有 `pooldata_field_whitelist` 紀錄的 `is_system_fixed` 預設為 `false`

### AC-6：系統固定欄位無法在 M06 管理頁被停用

- **Given** 部長在「篩選欄位管理」頁（M06）查看欄位清單，`best_case` 欄位的 `is_system_fixed = true`
- **When** 頁面渲染 `best_case` 那一列的操作按鈕
- **Then** 停用按鈕（ban icon）處於停用狀態（disabled）或不顯示，使用者無法對 `best_case` 執行停用操作
- **And** 若繞過前端直接呼叫 `PATCH /api/v1/pooldata-fields/best_case`，傳入 `{ isActive: false }`，後端回傳 422，`error_code: SYSTEM_FIXED_FIELD_CANNOT_DEACTIVATE`

### AC-7：Stage1 月跑執行時 best_case = 'Y' 篩選條件必定存在

- **Given** 一份 `stage = 'ready'` 的名單定義，其 condition_payload 已在 createList / updateList 時注入 best_case: ['Y']
- **When** AssignmentRun 觸發 Stage 1 查詢，`stage1-query-composer.ts` 解析 condition_payload
- **Then** 產生的 SQL WHERE 子句包含 `"best_case" IN ('Y')`（由現有 categorical path A 邏輯產生，無需 Stage1 額外修改）
- **And** 無論 condition_payload 中是否額外存有其他條件，`best_case IN ('Y')` 必定出現在 SQL 中

### AC-8：Migration 回填——僅更新 draft 名單的 condition_payload

- **Given** Migration 執行前，資料庫中存有若干名單（涵蓋 stage = 'draft' 與其他 stage）
- **When** 回填 migration 執行
- **Then** 所有 `stage = 'draft'` 的名單定義，其 condition_payload 中若不含 `best_case` 條目，則補入 `{ columnName: 'best_case', fieldType: 'categorical', values: ['Y'] }`；若已含 `best_case` 但 values 不為 `['Y']`，則更新為 `['Y']`
- **And** `stage IN ('dept_ratio', 'personnel_ratio', 'approval', 'ready')` 的名單 **不被回填**（凍結快照保持不變）
- **And** Migration 為 idempotent（重複執行對已含正確 best_case 值的紀錄不產生 side effect）

### AC-9：從上月名單複製（copy-from-prev-month）保持 best_case 鎖定

- **Given** 部長在建立表單點擊「從上月名單複製」，選取上月某份名單
- **When** 系統複製其 condition_payload 至新建立表單，並最終呼叫 createList 服務
- **Then** 即使來源名單的 condition_payload 中不含 `best_case` 條目（例如複製舊系統遷移過來的名單），服務層仍強制注入 best_case: ['Y']
- **And** 前端渲染複製後的條件列表時，`best_case` 以鎖定列方式顯示（對齊 AC-3）

---

## 技術備註

- **後端注入點**：`apps/api/src/modules/assignment-list/assignment-list.service.ts` 的 `createList`（~L435）與 `updateList`（~L573）；建議在 `validateConditionPayload`（~L107）之後、寫入 DB 之前，插入一個 `injectSystemFixedConditions(payload)` private method，集中管理所有系統固定條件的注入邏輯（為未來擴充預留）。
- **is_system_fixed 欄位**：新增 migration，於 `pooldata_field_whitelist` 加入 `is_system_fixed BOOLEAN NOT NULL DEFAULT false`；同一 migration 或獨立 migration 將 `best_case` 的 `is_system_fixed` 更新為 `true`。
- **新錯誤碼**：`SYSTEM_FIXED_FIELD_CANNOT_DEACTIVATE`（422）— 嘗試停用系統固定欄位時回傳；需補入 `error-handling.md#assignment-errors`。
- **前端 locked row**：建議透過 `pooldata_field_whitelist` API 回傳的 `isSystemFixed` boolean 驅動 UI 邏輯（欄位 metadata 已隨 API 回傳），不在前端 hardcode `best_case` 字串（可擴充）。
- **condition_payload 欄位名稱注意**：現有程式使用 `columnName`（camelCase）而非 `column_name`（snake_case）；spec-writer 撰寫 F050 AC 時請以 production code 實際命名為準。
- **Stage1 無需修改**：`stage1-query-composer.ts` 已可正確處理 `best_case: ['Y']` 的 categorical condition（path A），本 story 不觸及 Stage1。

---

## 測試案例

### TC-144-01：createList 注入 best_case（使用者未傳入）

- **Given**：部長送出 createList payload，`conditions` 中不含 `best_case`
- **When**：後端 `createList` 執行
- **Then**：寫入 DB 的 condition_payload 含 `{ columnName: 'best_case', fieldType: 'categorical', values: ['Y'] }`

### TC-144-02：updateList 值竄改正規化（值為 N）

- **Given**：某 draft 名單；前端（或惡意呼叫）傳入 `{ columnName: 'best_case', values: ['N'] }` 於 updateList
- **When**：後端 `updateList` 執行
- **Then**：回 200 OK；DB 中 `best_case.values = ['Y']`（靜默正規化，不拒絕）

### TC-144-03：前端鎖定列 DOM 驗證（建立頁）

- **Given**：部長進入 `/assignment/list-definitions/new`
- **When**：頁面渲染
- **Then**：DOM 中存在 `data-testid="condition-row-best_case"`（或同等 selector）且不存在 `data-testid="remove-condition-best_case"`；值元件 disabled

### TC-144-04：「新增條件」dropdown 排除 best_case

- **Given**：部長在建立頁點擊「新增條件」
- **When**：dropdown 展開
- **Then**：選項清單中不包含 `best_case`（「優質案件」）

### TC-144-05：M06 停用系統固定欄位被阻擋（API 層）

- **Given**：直接呼叫 `PATCH /api/v1/pooldata-fields/best_case`，body `{ isActive: false }`
- **When**：後端處理
- **Then**：回 422，body 含 `error_code: SYSTEM_FIXED_FIELD_CANNOT_DEACTIVATE`

### TC-144-06：Migration 回填僅影響 draft 名單

- **Given**：DB 中有 `LIST_A`（draft，無 best_case 條目）、`LIST_B`（ready，無 best_case 條目）
- **When**：回填 migration 執行
- **Then**：`LIST_A.condition_payload` 補入 best_case: ['Y']；`LIST_B.condition_payload` 不變

### TC-144-07：copy-from-prev-month 強制保留鎖定

- **Given**：上月名單 condition_payload 中不含 `best_case`（舊遷移資料）；部長複製該名單並儲存
- **When**：`createList` 執行
- **Then**：新名單 condition_payload 含 best_case: ['Y']

---

## 依賴關係

- **Blocked By**：
  - US-128（移除 prodBest 一級欄位，前提完成）
  - US-129（best_case Y/N options seed，前提完成）
  - US-106（建立/編輯名單主流程，本 story 在其基礎上加鎖定行為）
  - US-102（M06 白名單管理 UI，AC-6 在此頁加停用防護）
- **Blocks**：無直接下游 story 被本 story 阻擋（Stage1 無需修改）
- **相關**：
  - US-121（condition_payload 驗證規則，本 story 在驗證後注入）
  - US-122（Stage1 動態篩選，best_case 條件由此路徑執行）

---

## Definition of Done

- [ ] `pooldata_field_whitelist` 新增 `is_system_fixed` 欄位 migration 已執行，`best_case` is_system_fixed = true
- [ ] 草稿名單回填 migration 已執行（draft only），idempotent 驗證通過
- [ ] 後端 `injectSystemFixedConditions`（或等效邏輯）於 createList / updateList 注入 best_case: ['Y']
- [ ] 後端值竄改正規化：values ≠ ['Y'] 時靜默修正為 ['Y']（TC-144-02 通過）
- [ ] 後端 `PATCH /api/v1/pooldata-fields/:columnName` 新增 is_system_fixed 守衛，回傳 422 + SYSTEM_FIXED_FIELD_CANNOT_DEACTIVATE
- [ ] 前端「建立草稿名單」頁：best_case 鎖定列渲染（🔒，無刪除按鈕，值 disabled）
- [ ] 前端「編輯草稿名單」頁：同上
- [ ] 前端「新增條件」dropdown：best_case 排除
- [ ] 前端 M06 篩選欄位管理頁：is_system_fixed = true 欄位停用按鈕 disabled
- [ ] 所有 TC-144-01 ～ TC-144-07 通過（含 happy path + 竄改 + edge case）
- [ ] 單元測試覆蓋率 ≥ 80%
- [ ] `error-handling.md#assignment-errors` 補入 SYSTEM_FIXED_FIELD_CANNOT_DEACTIVATE
- [ ] Code review 通過

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **前置 Story（prodBest 移除）**：[US-128](US-128-M01-remove-prodbest-field.md)
- **前置 Story（best_case options seed）**：[US-129](US-129-M06-seed-bestcase-options.md)
- **建立名單主流程**：[US-106](US-106-M01-draft-create-list-with-filter.md)
- **condition_payload 驗證規則**：[US-121](US-121-M01-whitelist-condition-payload.md)
- **Stage1 動態篩選**：[US-122](US-122-M04-stage1-dynamic-filter.md)
- **M06 白名單管理**：[US-102](US-102-M06-manage-pooldata-field-whitelist.md)
- **spec 主文件（需升版）**：`docs/specs/features/F050-create-list-definition.md`（v2.2.1 → v2.3）
- **spec 主文件（需升版）**：`docs/specs/features/F075-manage-pooldata-field-whitelist.md`（v1.6 → v1.7）
- **錯誤碼文件**：`docs/specs/error-handling.md#assignment-errors`（補 SYSTEM_FIXED_FIELD_CANNOT_DEACTIVATE）
