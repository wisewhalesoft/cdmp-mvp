---
type: test-design-feature
feature_id: F004
feature_name: 建立帳號
priority: P0-MVP
related_spec: /specs/features/F004-create-account.md
last_updated: 2026-05-13
---

# F004: 建立帳號 — 測試設計

---

## Acceptance Test Design

### AC-1：成功建立帳號

| 項目 | 內容 |
|------|------|
| Given | Admin 已登入（ADMIN_ACTIVE） |
| When | 呼叫 `POST /api/accounts`，body: {name, email, password, role} |
| Then | HTTP 201、回應含新建帳號資訊（id, name, email, role=指定值, status=active） |
| 驗證步驟 | 1. 確認回應 HTTP 201<br>2. 回應不含 password_hash<br>3. email 已轉為小寫<br>4. status = active<br>5. 新帳號出現於 GET /api/accounts 清單中 |
| 測試資料 | ADMIN_ACTIVE Token + 新帳號資料 |

### AC-2：防止重複 Email（大小寫不敏感）

| 項目 | 內容 |
|------|------|
| Given | admin@cdmp.test 已存在 |
| When | 以 ADMIN@CDMP.TEST 建立帳號 |
| Then | HTTP 409、ACCOUNT_EMAIL_EXISTS |
| 驗證步驟 | 1. 確認 HTTP 409<br>2. 確認帳號未被建立 |
| 測試資料 | ADMIN_ACTIVE Token + 重複 Email |

### AC-3：欄位驗證

| 項目 | 內容 |
|------|------|
| Given | Admin 已登入 |
| When | 提交不合規資料（缺少必填欄位、格式錯誤） |
| Then | HTTP 422、VALIDATION_ERROR，details 列出各欄位錯誤 |
| 驗證步驟 | 1. 確認 HTTP 422<br>2. details 陣列包含對應欄位的錯誤訊息 |

### AC-4：角色選單顯示 2 種角色

| 項目 | 內容 |
|------|------|
| Given | Admin 在建立帳號表單 |
| When | Admin 展開角色下拉選單 |
| Then | 選單顯示 2 種角色：管理者（Admin）、使用者（User） |
| 驗證步驟 | 1. 確認選項數量 = 2<br>2. 逐一核對顯示文字（含括號別名）<br>3. 確認選項資料來自 GET /api/roles（動態載入） |
| 測試資料 | F045 Seed Data 已初始化 |

---

## Test Scenarios

### Positive Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F004-001 | 成功建立 Admin 帳號 | AC-1 | Integration | Admin 已登入 | 1. POST /api/accounts {name, email, password, role: admin} | HTTP 201，帳號建立成功 |
| TS-F004-002 | 成功建立 User 帳號 | AC-1 | Integration | Admin 已登入 | 1. POST /api/accounts {name, email, password, role: user} | HTTP 201，role=user |
| TS-F004-003 | Email 自動轉小寫 | AC-2, BR-2 | Integration | Admin 已登入 | 1. POST /api/accounts {email: "Test@CDMP.Test"} | HTTP 201，回應中 email = "test@cdmp.test" |

### Negative Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F004-004 | Email 重複（大小寫不敏感） | AC-2 | Integration | admin@cdmp.test 已存在 | 1. POST /api/accounts {email: "ADMIN@CDMP.TEST"} | HTTP 409，ACCOUNT_EMAIL_EXISTS |
| TS-F004-005 | 非 Admin 嘗試建立帳號 | BR-4 | Integration | USER_ACTIVE 已登入 | 1. 以 User Token 呼叫 POST /api/accounts | HTTP 403，AUTH_FORBIDDEN |
| TS-F004-006 | 無效角色值（manager） | AC-3 / US-010 測試案例 10 | Integration | Admin 已登入 | 1. POST /api/accounts {role: "manager"} | HTTP 422，VALIDATION_INVALID_ROLE |

### Boundary Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F004-007 | 密碼恰好 8 字元 | BR-7 | Integration | Admin 已登入 | 1. POST /api/accounts {password: "12345678"} | HTTP 201，建立成功 |
| TS-F004-008 | 密碼僅 7 字元 | BR-7 | Integration | Admin 已登入 | 1. POST /api/accounts {password: "1234567"} | HTTP 422，VALIDATION_PASSWORD_LENGTH |

### 前端場景

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F004-FE-001 | 角色下拉選單顯示 2 種角色 | AC-4 / US-010 AC-4 | E2E | Admin 已登入，Seed Data 存在 | 1. 開啟建立帳號頁<br>2. 展開角色下拉選單 | 共 2 個選項，文字為：管理者（Admin）、使用者（User） |

---

## 補充章節：業務主管旗標（`is_sales_manager`）測試設計

> **範圍說明**：本章節涵蓋 F004 AC-6、AC-7、BR-9 中與 `is_sales_manager` 旗標相關的後端邏輯與前端 CreateAccountModal UI 行為測試。對應 prototype 07 Modal 1（line 479-491）的「業務主管權限」checkbox 區塊 A。

---

### Acceptance Test Design（業務主管旗標）

#### AC-6：建立 User 帳號時可選填業務主管旗標

| 項目 | 內容 |
|------|------|
| Given | Admin 已登入，建立帳號表單角色選擇為「使用者（User）」 |
| When | 表單渲染 |
| Then | 顯示「業務主管權限」checkbox 區塊（`id="createSalesManagerWrap"`，預設未勾選） |
| And | 若 Admin 勾選 checkbox 並提交，API request body 含 `isSalesManager: true`，建立後 DB `is_sales_manager = true` |
| 驗證步驟 | 1. 確認 `createSalesManagerWrap` 區塊存在且可見<br>2. 確認 `createSalesManagerFlag` checkbox 預設 `checked=false`<br>3. 勾選後提交 → 攔截 POST request，確認 body 含 `isSalesManager: true`<br>4. GET /api/accounts/:id 確認 `is_sales_manager: true` |
| 測試資料 | ADMIN_ACTIVE Token + role=user + isSalesManager=true |

#### AC-7：Admin 帳號忽略 isSalesManager 參數

| 項目 | 內容 |
|------|------|
| Given | Admin 透過 API 建立 role=admin 帳號，request body 同時帶 `isSalesManager: true` |
| When | POST /api/accounts {role: "admin", isSalesManager: true} |
| Then | HTTP 201，`is_sales_manager` 欄位在回應中為 `false` 或不存在；DB 儲存值為 `false` |
| 驗證步驟 | 1. 確認 HTTP 201<br>2. 回應 body `is_sales_manager` 不為 `true`<br>3. GET /api/accounts/:id 確認 `is_sales_manager: false` |
| 備註 | 後端應靜默忽略此參數，不回傳驗證錯誤（BR-9） |

---

### Test Scenarios（業務主管旗標）

#### 一、Backend Integration Tests

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F004-SM-001 | 建立 User 帳號帶 `isSalesManager=true` → DB 寫入 true | AC-6 / BR-9 | Integration | ADMIN_ACTIVE Token | 1. POST /api/accounts {role: "user", isSalesManager: true} | HTTP 201；回應 `is_sales_manager: true`；GET 確認 DB 值 = true |
| TS-F004-SM-002 | 建立 User 帳號帶 `isSalesManager=false` → DB 寫入 false | AC-6 / BR-9 | Integration | ADMIN_ACTIVE Token | 1. POST /api/accounts {role: "user", isSalesManager: false} | HTTP 201；`is_sales_manager: false` |
| TS-F004-SM-003 | 建立 User 帳號未帶 `isSalesManager` → 預設 false | AC-6 / BR-9 | Integration | ADMIN_ACTIVE Token | 1. POST /api/accounts {role: "user"}（無 isSalesManager 欄位） | HTTP 201；`is_sales_manager: false` |
| TS-F004-SM-004 | 建立 Admin 帳號帶 `isSalesManager=true` → 後端忽略，寫入 false | AC-7 / BR-9 | Integration | ADMIN_ACTIVE Token | 1. POST /api/accounts {role: "admin", isSalesManager: true} | HTTP 201；回應 `is_sales_manager` 為 `false` 或欄位不存在；不回傳 422 或任何驗證錯誤 |
| TS-F004-SM-005 | `is_sales_manager` 欄位型別為 boolean（非字串） | AC-6 | Integration | ADMIN_ACTIVE Token | 1. POST /api/accounts {role: "user", isSalesManager: true}<br>2. 解析回應 JSON | `typeof is_sales_manager === 'boolean'`；不可為 `"true"` 字串 |

#### 二、Frontend Component Tests（CreateAccountModal）

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F004-SM-FE-001 | role=user → checkbox 區塊顯示且預設未勾選 | AC-6 | Unit（Component） | role select 初始值 = "user" | 1. render `<CreateAccountModal />`<br>2. 角色選為「使用者（User）」 | `createSalesManagerWrap` 可見；`createSalesManagerFlag` `checked=false` |
| TS-F004-SM-FE-002 | role=admin → checkbox 區塊不顯示 | AC-6 / AC-7 | Unit（Component） | role select 選為 admin | 1. render modal<br>2. 角色切換為「管理者（Admin）」 | `createSalesManagerWrap` 不顯示（`hidden` class 或 DOM 不存在） |
| TS-F004-SM-FE-003 | 切換 user→admin → checkbox 隱藏並重置 | AC-6 / BR-9 | Unit（Component） | 初始 role=user，`createSalesManagerFlag` 已勾選 | 1. 勾選 checkbox<br>2. 切換角色為 admin | checkbox 區塊隱藏；checkbox 勾選狀態重置為未勾選 |
| TS-F004-SM-FE-004 | 切換 user→admin→user → checkbox 再次顯示但預設未勾選（重置確認） | AC-6 / BR-9 | Unit（Component） | 初始 role=user，已勾選 → 切換 admin → 再切回 user | 1. 勾選 checkbox<br>2. 切換角色 admin<br>3. 再切回 user | checkbox 顯示且 `checked=false`（先前勾選狀態不保留） |
| TS-F004-SM-FE-005 | checkbox 區塊 className 符合 prototype 07 line 480 | AC-6 | Unit（Component） | role=user | 1. render modal<br>2. 取得 `createSalesManagerWrap` 元素 | className 包含：`rounded-lg border border-amber-200 bg-amber-50/50 p-3` |
| TS-F004-SM-FE-006 | checkbox label 含 shield-check icon + 提示文字 | AC-6 | Unit（Component） | role=user，modal 已開啟 | 1. render modal<br>2. 查詢 icon 與說明文字 | icon 使用 `shield-check`（尺寸 `w-3.5 h-3.5 text-warning`）；說明文字為「啟用後此帳號可存取 E07 客戶名單分派與 E06 Customer 360」 |
| TS-F004-SM-FE-007 | 勾選 checkbox 後提交 → API request body 含 `isSalesManager: true` | AC-6 | Unit（Component Integration） | role=user，checkbox 已勾選 | 1. 填寫所有必填欄位<br>2. 勾選 `createSalesManagerFlag`<br>3. 點擊「建立」 | 攔截 POST /api/accounts；request body 含 `isSalesManager: true`（boolean） |
| TS-F004-SM-FE-008 | 未勾選 checkbox 提交 → API request body 含 `isSalesManager: false` | AC-6 | Unit（Component Integration） | role=user，checkbox 未勾選 | 1. 填寫必填欄位，不勾選 checkbox<br>2. 點擊「建立」 | request body 含 `isSalesManager: false` 或欄位不存在（後端預設 false） |
| TS-F004-SM-FE-009 | 切換業務角色 → checkbox 區塊不顯示 | AC-6 / BR-9 | Unit（Component） | role select 切換為任意業務角色（業務、行銷、客服、分析師、主管、後端作業） | 1. 選擇任一業務角色<br>2. 觀察 checkbox 區塊 | `createSalesManagerWrap` 不顯示（業務角色同 admin，不適用旗標） |

#### 三、Edge Cases

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F004-SM-EDGE-001 | 勾選 + 切 admin + 切回 user → 預設未勾選（重置） | AC-6 / BR-9 | Boundary | 同 TS-F004-SM-FE-004 | 見 TS-F004-SM-FE-004 | checkbox 重置為未勾選（不保留歷史值） |
| TS-F004-SM-EDGE-002 | API 接受 `isSalesManager` 為 JSON boolean，不接受字串 `"true"` | AC-7 / BR-9 | Negative | ADMIN_ACTIVE Token | 1. POST /api/accounts {role: "user", isSalesManager: "true"}（字串） | HTTP 422，VALIDATION_ERROR（型別錯誤）或後端將字串轉 boolean 的實際行為須基線記錄 |

---

### Manual / E2E Acceptance Tests

| ID | Scenario | Test Type | 操作步驟 | 驗收標準 |
|----|----------|-----------|---------|---------|
| TS-F004-SM-E2E-001 | 建立 User 帳號勾選業務主管 → 登入後 Top Bar 顯示 Badge | Manual E2E | 1. 以 admin@cdmp.test 登入<br>2. 開啟帳號管理頁，點「建立帳號」<br>3. 填寫資料，角色選「使用者（User）」，勾選「業務主管權限」<br>4. 點「建立」<br>5. 登出後以新帳號登入 | 新帳號登入後 Top Bar 出現「Sales Manager」chip（amber-50 + shield-check + border-amber-200） |
| TS-F004-SM-E2E-002 | 建立 Admin 帳號 → 勾選業務主管 checkbox 不顯示 | Manual E2E | 1. 開啟建立帳號 Modal<br>2. 角色選「管理者（Admin）」<br>3. 觀察 Modal | 「業務主管權限」checkbox 區塊（amber 背景框）不存在於 Modal |
| TS-F004-SM-E2E-003 | 切換角色 user→admin 時 checkbox 隱藏並重置 | Manual E2E | 1. 開啟建立帳號 Modal，角色預設為 User<br>2. 勾選「業務主管權限」<br>3. 切換角色為「管理者（Admin）」<br>4. 再切回「使用者（User）」 | 切到 Admin 時 checkbox 區塊消失；切回 User 時重新出現且未勾選 |

---

### 測試資料需求

| 種子帳號 / 情境 | Role | isSalesManager | 用途 |
|--------------|------|---------------|------|
| ADMIN_ACTIVE | admin | false | 操作者（建立帳號 API 呼叫方） |
| 新建 user（TS-F004-SM-001） | user | true | 驗證旗標寫入 DB |
| 新建 admin（TS-F004-SM-004） | admin | — | 驗證後端忽略參數 |

---

### 實作提示（供 tdd-implementation Agent）

1. **後端 DTO 處理**：`CreateAccountDto` 中 `isSalesManager` 應標記為 `@IsOptional() @IsBoolean()`；Service 層在 `role === 'admin'` 時強制覆寫為 `false`，不論傳入值。
2. **前端 onRoleChange 事件**：角色 select 的 `onChange` handler 需同時處理「顯示/隱藏 checkbox」與「重置 checkbox 勾選狀態」兩個動作，且業務角色亦須觸發隱藏邏輯（不只 admin）。
3. **className 嚴格驗證**：TS-F004-SM-FE-005 驗證 `createSalesManagerWrap` 的 className，必須與 prototype 07 line 480 完全一致：`rounded-lg border border-amber-200 bg-amber-50/50 p-3`。
4. **`data-testid` 建議**：在 `createSalesManagerWrap` 掛 `data-testid="create-sales-manager-wrap"`；在 `createSalesManagerFlag` checkbox 掛 `data-testid="create-sales-manager-flag"` 以利自動化定位。
