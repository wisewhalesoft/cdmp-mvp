---
type: test-design-feature
feature_id: F006
feature_name: 編輯帳號
priority: P0-MVP
related_spec: /specs/features/F006-edit-account.md
last_updated: 2026-05-13
---

# F006: 編輯帳號 — 測試設計

---

## Acceptance Test Design

### AC-1：成功編輯帳號

| 項目 | 內容 |
|------|------|
| Given | Admin 已登入，目標帳號存在 |
| When | 呼叫 `PUT /api/accounts/:id`，body: {name: "New Name", email: "new@cdmp.test"} |
| Then | HTTP 200，回應含更新後的帳號資訊，updated_at 已更新 |
| 驗證步驟 | 1. name 已更新<br>2. email 已更新（轉小寫）<br>3. 不含 password_hash<br>4. role 與 status 不變 |

### AC-2：Email 唯一性驗證

| 項目 | 內容 |
|------|------|
| Given | user@cdmp.test 屬於另一帳號 |
| When | 將目標帳號 Email 修改為 USER@CDMP.TEST |
| Then | HTTP 409，ACCOUNT_EMAIL_IN_USE |

### AC-3：欄位驗證

| 項目 | 內容 |
|------|------|
| Given | Admin 已登入 |
| When | 提交空 name 或無效 Email 格式 |
| Then | HTTP 422，VALIDATION_ERROR |

---

## Test Scenarios

### Positive Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F006-001 | 成功修改姓名 | AC-1 | Integration | 目標帳號存在 | 1. PUT /api/accounts/:id {name: "Updated"} | HTTP 200，name 已更新 |
| TS-F006-002 | 成功修改 Email | AC-1 | Integration | 目標帳號存在 | 1. PUT /api/accounts/:id {email: "new@test.com"} | HTTP 200，email 已轉小寫 |
| TS-F006-003 | Email 保留原值不觸發重複錯誤 | AC-2, BR-3 | Integration | 目標帳號 email=user@cdmp.test | 1. PUT /api/accounts/:id {email: "user@cdmp.test"} | HTTP 200，更新成功（自身排除） |

### Negative Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F006-004 | Email 與其他帳號重複 | AC-2 | Integration | 另一帳號 email=admin@cdmp.test | 1. PUT /api/accounts/:id {email: "admin@cdmp.test"} | HTTP 409，ACCOUNT_EMAIL_IN_USE |
| TS-F006-005 | 帳號不存在 | 錯誤處理 | Integration | 無此 ID | 1. PUT /api/accounts/nonexist-id {name, email} | HTTP 404，ACCOUNT_NOT_FOUND |
| TS-F006-006 | 非 Admin 編輯帳號 | BR-6 | Integration | USER_ACTIVE 已登入 | 1. 以 User Token 呼叫 PUT /api/accounts/:id | HTTP 403，AUTH_FORBIDDEN |
| TS-F006-007 | 空姓名 | AC-3 | Integration | Admin 已登入 | 1. PUT /api/accounts/:id {name: ""} | HTTP 422，VALIDATION_ERROR |

### Boundary Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F006-008 | 姓名 100 字元（最大長度） | BR-8 | Integration | Admin 已登入 | 1. PUT /api/accounts/:id {name: "A"×100} | HTTP 200，更新成功 |

---

## 補充章節：業務主管旗標 Read-Only Chip 測試設計

> **範圍說明**：本章節涵蓋 F006 BR-6 中「`is_sales_manager` 切換不在此功能範圍」的後端防線測試，以及對應 prototype 07 Modal 2（line 531-540）的編輯 modal read-only chip（方案 B）的前端元件測試。

---

### Acceptance Test Design（Read-Only Chip）

#### AC-4（F006 新增）：編輯 Modal 唯讀顯示業務主管旗標狀態

| 項目 | 內容 |
|------|------|
| Given | Admin 開啟 User 帳號（role=user）的編輯 Modal |
| When | Modal 載入目標帳號資料 |
| Then | 若 `is_sales_manager=true`：顯示 amber-50 chip + shield-check icon + 文字「業務主管權限：已啟用」 |
| And | 若 `is_sales_manager=false`：顯示 gray-100 chip + shield-off icon + 文字「業務主管權限：未啟用」 |
| And | Chip 不可點擊、不可互動；提交表單時 PUT request body 不含 `isSalesManager` 欄位 |
| 驗證步驟 | 1. 確認 chip 元素存在且 className 正確<br>2. 確認 icon 與文字對應旗標狀態<br>3. 確認 chip 無 onClick / cursor-pointer 等可互動屬性<br>4. 提交 → 攔截 PUT request 確認 body 無 `isSalesManager` |

#### AC-5（F006 新增）：Admin 帳號編輯 Modal 不顯示旗標 Chip

| 項目 | 內容 |
|------|------|
| Given | Admin 開啟 Admin 帳號（role=admin）的編輯 Modal |
| When | Modal 載入資料 |
| Then | `editSalesManagerWrap` 區塊不顯示（Admin 無此 chip） |
| 驗證步驟 | 1. `querySelector('[data-testid="edit-sales-manager-wrap"]')` 回傳 null，或元素具有 `hidden` class |

#### AC-6（F006 新增）：PUT 端點後端忽略 isSalesManager 欄位

| 項目 | 內容 |
|------|------|
| Given | Admin 已登入，目標帳號 `is_sales_manager=false` |
| When | 直接呼叫 PUT /api/accounts/:id，body 包含 `isSalesManager: true` |
| Then | HTTP 200，帳號姓名/Email 更新成功；但 `is_sales_manager` 仍為 `false`（後端忽略此欄位） |
| 驗證步驟 | 1. 確認回應 HTTP 200<br>2. GET /api/accounts/:id 確認 `is_sales_manager` 未被改為 true |

---

### Test Scenarios（業務主管旗標 Read-Only Chip）

#### 一、Backend Integration Tests

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F006-SM-001 | PUT /api/accounts/:id payload 含 `isSalesManager` → 後端忽略 | F006 BR-6 | Integration | 目標帳號 is_sales_manager=false，ADMIN_ACTIVE Token | 1. PUT /api/accounts/:id {name: "X", email: "x@test.com", isSalesManager: true} | HTTP 200；GET /api/accounts/:id 確認 `is_sales_manager` 仍為 false（未被修改） |
| TS-F006-SM-002 | PUT endpoint 回應不含 `isSalesManager` 欄位（或值不變） | F006 BR-6 | Integration | 目標帳號 is_sales_manager=true | 1. PUT /api/accounts/:id {name: "Y", email: "y@test.com", isSalesManager: false} | HTTP 200；`is_sales_manager` 仍為 true（後端以旗標端點為唯一修改入口） |

#### 二、Frontend Component Tests（EditAccountModal）

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F006-SM-FE-001 | User 帳號 is_sales_manager=true → 顯示 amber chip + 「已啟用」 | AC-4 | Unit（Component） | mock accountData: {role: "user", is_sales_manager: true} | 1. render `<EditAccountModal account={...} />`<br>2. 查詢 `editSalesManagerChip` | chip 顯示；文字含「業務主管權限：已啟用」；className 含 `bg-amber-50`；icon 為 `shield-check` |
| TS-F006-SM-FE-002 | User 帳號 is_sales_manager=false → 顯示 gray chip + 「未啟用」 | AC-4 | Unit（Component） | mock accountData: {role: "user", is_sales_manager: false} | 1. render EditAccountModal<br>2. 查詢 chip | chip 顯示；文字含「業務主管權限：未啟用」；className 含 `bg-gray-100`；icon 為 `shield-off` |
| TS-F006-SM-FE-003 | Admin 帳號 → chip 區塊不顯示 | AC-5 | Unit（Component） | mock accountData: {role: "admin"} | 1. render EditAccountModal<br>2. querySelector `editSalesManagerWrap` | `editSalesManagerWrap` 不可見（hidden 或 DOM 不存在） |
| TS-F006-SM-FE-004 | chip 不可點擊（無 onClick / cursor-pointer） | AC-4 | Unit（Component） | mock accountData: {role: "user", is_sales_manager: true} | 1. render modal<br>2. 取得 chip 元素<br>3. 確認無互動屬性 | chip 元素不含 `onClick` handler；不含 `cursor-pointer` class；`pointer-events-none` 或相等防護 |
| TS-F006-SM-FE-005 | chip icon 尺寸符合 prototype（`w-3.5 h-3.5`） | AC-4 | Unit（Component） | mock accountData: {role: "user", is_sales_manager: true} | 1. render modal<br>2. 取得 icon 元素 | icon 含 class `w-3.5 h-3.5`（與 prototype 07 line 534-536 一致） |
| TS-F006-SM-FE-006 | 引導小字文字符合 spec 最新版 | AC-4 | Unit（Component） | mock accountData: {role: "user"} | 1. render modal<br>2. 取得引導小字元素 | 引導文字為「需變更請至變更角色 dialog」（非舊版「需變更請至帳號列表使用 Toggle Switch」） |
| TS-F006-SM-FE-007 | 提交時 PUT request body 不含 `isSalesManager` 欄位 | AC-6 / F006 BR-6 | Unit（Component Integration） | mock accountData: {role: "user", is_sales_manager: true}，mock PUT handler | 1. render modal，修改姓名<br>2. 點擊「儲存」<br>3. 攔截 PUT request | PUT /api/accounts/:id request body **不**含 `isSalesManager` 欄位（key 完全不存在） |

#### 三、Edge Cases

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F006-SM-EDGE-001 | accountData.is_sales_manager 為 null/undefined → 顯示 gray chip（false 邏輯） | AC-4 | Boundary | mock accountData: {role: "user", is_sales_manager: null} | 1. render modal<br>2. 觀察 chip | gray-100 chip 顯示「未啟用」（null 視同 false） |
| TS-F006-SM-EDGE-002 | 直接打 PUT API 帶 isSalesManager=true — 後端防線不允許修改 | F006 BR-6 | Negative（Security） | 攻擊者直接呼叫 API | 1. PUT /api/accounts/:id {name: "Y", email: "y@test.com", isSalesManager: true} | `is_sales_manager` 未被修改（後端忽略，非 403；返回 200 但值不變） |

---

### Manual / E2E Acceptance Tests

| ID | Scenario | Test Type | 操作步驟 | 驗收標準 |
|----|----------|-----------|---------|---------|
| TS-F006-SM-E2E-001 | Sales Manager User 編輯 Modal 顯示 amber chip「已啟用」 | Manual E2E | 1. 以 admin@cdmp.test 登入<br>2. 找到 is_sales_manager=true 的 User 帳號<br>3. 點「編輯」 | Modal 中出現 amber 背景 chip，icon 為 shield-check，文字「業務主管權限：已啟用」；chip 不可點擊 |
| TS-F006-SM-E2E-002 | 一般 User 編輯 Modal 顯示 gray chip「未啟用」 | Manual E2E | 1. 找到 is_sales_manager=false 的 User 帳號<br>2. 點「編輯」 | Modal 中出現 gray-100 chip，icon 為 shield-off，文字「業務主管權限：未啟用」 |
| TS-F006-SM-E2E-003 | Admin 帳號編輯 Modal 不出現 chip | Manual E2E | 1. 找到任一 Admin 帳號<br>2. 點「編輯」 | Modal 中不存在業務主管 chip 區塊 |
| TS-F006-SM-E2E-004 | 引導文字指向「變更角色 dialog」（非舊 Toggle Switch） | Manual E2E | 1. 開啟任一 User 帳號編輯 Modal<br>2. 觀察 chip 下方引導文字 | 引導文字：「需變更請至變更角色 dialog」 |

---

### 測試資料需求

| 種子帳號情境 | Role | is_sales_manager | 用途 |
|------------|------|-----------------|------|
| USER_SM_ACTIVE | user | true | 驗證 amber chip「已啟用」 |
| USER_ACTIVE | user | false | 驗證 gray chip「未啟用」 |
| ADMIN_ACTIVE | admin | false | 驗證 chip 不顯示 |

---

### 實作提示（供 tdd-implementation Agent）

1. **後端 PUT endpoint 防線**：`UpdateAccountDto` 不應包含 `isSalesManager` 欄位；若使用 `@IsOptional()` 接收後忽略，需確保不寫入 DB。建議直接在 DTO 中排除此欄位（不 `@Expose()` / 不 `@Transform()`），以 DTO 本身作為防護機制。
2. **Chip 雙狀態邏輯**：`is_sales_manager=true` 用 amber-50 + `shield-check`；`false/null/undefined` 統一用 gray-100 + `shield-off`；切換條件建議為 `account.is_sales_manager === true`（嚴格比對）。
3. **引導文字版本**：prototype 07 line 538 仍顯示舊版「需變更請至帳號列表使用 Toggle Switch（即時生效）」，但 spec v2.1 已改為「需變更請至變更角色 dialog」。**以 spec 為準**（prototype 尚未同步更新）。
4. **`data-testid` 建議**：`editSalesManagerWrap` 掛 `data-testid="edit-sales-manager-wrap"`；chip span 掛 `data-testid="edit-sales-manager-chip"`。
