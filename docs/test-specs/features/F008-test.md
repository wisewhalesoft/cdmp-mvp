---
type: test-design-feature
feature_id: F008
feature_name: 指派／變更角色
priority: P0-MVP
related_spec: /specs/features/F008-assign-change-role.md
last_updated: 2026-05-13
---

# F008: 指派／變更角色 — 測試設計

---

## Acceptance Test Design

### AC-1：變更角色（admin / user 兩種角色）

| 項目 | 內容 |
|------|------|
| Given | 目標帳號角色為 user |
| When | 呼叫 `PATCH /api/accounts/:id/role`，body: {role: "admin"} |
| Then | HTTP 200，role 變更為指定值 |
| 驗證步驟 | 1. 回應中 role 欄位為新值（支援 admin / user 兩種 role_code）<br>2. 確認 GET /api/accounts 清單中該帳號角色已更新，displayName 顯示正確中文名稱 |

### AC-2：最後一位 Admin 保護

| 項目 | 內容 |
|------|------|
| Given | 系統中僅有一個 Admin 帳號 |
| When | 嘗試將該 Admin 的角色變更為 user |
| Then | HTTP 422，ACCOUNT_LAST_ADMIN |
| 驗證步驟 | 1. 確認角色未被變更<br>2. 確認錯誤訊息：「無法移除最後一位 Admin，系統必須至少保留一個 Admin 帳號。」 |

### AC-3：角色變更確認對話框（E2E）

| 項目 | 內容 |
|------|------|
| Given | Admin 正在查看某帳號的角色設定 |
| When | Admin 選擇新角色 |
| Then | 前端彈出確認對話框，顯示目前角色中文名稱與新角色中文名稱（含括號別名），Admin 確認後才執行 PATCH API |
| 驗證步驟 | 1. 選擇新角色後確認對話框出現<br>2. 對話框中含目前角色與新角色的中文顯示名稱<br>3. 點擊「取消」後 PATCH API 未被呼叫<br>4. 點擊「確認」後 PATCH API 被呼叫且角色更新成功 |

### AC-4：角色變更選單顯示 2 種角色

| 項目 | 內容 |
|------|------|
| Given | Admin 正在查看某帳號的角色設定 |
| When | 展開角色選擇下拉選單 |
| Then | 選單顯示 2 種角色：管理者（Admin）、使用者（User） |
| 驗證步驟 | 1. 確認選項數量 = 2<br>2. 逐一核對顯示文字（與 F045 TS-F045-UI-002 一致） |

### AC-5：角色變更生效時機（Token 刷新）

| 項目 | 內容 |
|------|------|
| Given | Admin 已成功將某使用者的角色由 user 改為 admin |
| When | 該使用者重新登入取得新 Token |
| Then | 新 Token 的 payload 或對應的使用者資訊反映新角色 admin |
| 驗證步驟 | 1. 使用舊 Token 驗證角色仍為原值（未立即生效）<br>2. 登出後重新登入<br>3. 確認新 Token 或 GET /api/accounts/me 回傳 role = "admin" |
| 備註 | Token 立即失效策略由 E01 JWT 黑名單機制決定；此場景驗證角色變更不立即影響當前有效 Session |

---

## Test Scenarios

### Positive Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F008-001 | User 升級為 Admin | AC-1 / US-014 AC-3 | Integration | 目標帳號 role=user | 1. PATCH /api/accounts/:id/role {role: admin} | HTTP 200，role=admin |
| TS-F008-002 | Admin 降級為 User（系統有 >= 2 Admin） | AC-1 / US-014 | Integration | 系統有 2+ Admin | 1. PATCH /api/accounts/:id/role {role: user} | HTTP 200，role=user |

### Negative Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F008-003 | 最後一位 Admin 降級為 User — 被阻止 | AC-2 / US-014 AC-4 | Integration | 系統僅 1 個 Admin | 1. PATCH /api/accounts/:id/role {role: user} | HTTP 422，ACCOUNT_LAST_ADMIN；錯誤訊息：「無法移除最後一位 Admin，系統必須至少保留一個 Admin 帳號。」 |
| TS-F008-004 | 帳號不存在 | 錯誤處理 | Integration | 無此 ID | 1. PATCH /api/accounts/nonexist-id/role {role: admin} | HTTP 404，ACCOUNT_NOT_FOUND |
| TS-F008-005 | 無效角色值（manager） | 驗證 / US-014 測試案例 8 | Integration | Admin 已登入 | 1. PATCH /api/accounts/:id/role {role: "manager"} | HTTP 422，VALIDATION_INVALID_ROLE |
| TS-F008-006 | 非 Admin 嘗試變更角色 | BR-5 / US-014 測試案例 10 | Integration | User 角色帳號已登入 | 1. 以 User Token 呼叫 PATCH /api/accounts/:id/role | HTTP 403，AUTH_FORBIDDEN |

### Boundary Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F008-007 | 冪等操作 — 設定相同角色（admin → admin） | BR-6 | Integration | 目標帳號 role=admin | 1. PATCH /api/accounts/:id/role {role: admin} | HTTP 200，角色不變（冪等） |
| TS-F008-008 | 冪等操作 — 設定相同角色（user → user） | BR-6 | Integration | 目標帳號 role=user | 1. PATCH /api/accounts/:id/role {role: user} | HTTP 200，角色不變（冪等） |

### 前端場景

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F008-FE-001 | 角色選單顯示 2 種角色 | AC-4 / US-014 AC-1 | E2E | Admin 已登入，F045 Seed Data 存在 | 1. 開啟帳號詳細頁<br>2. 展開角色下拉選單 | 共 2 個選項：管理者（Admin）、使用者（User） |
| TS-F008-FE-002 | 確認對話框 — 顯示中文角色名稱 | AC-3 / US-014 AC-5 | E2E | Admin 已登入，目標帳號 role=user | 1. 展開角色選單<br>2. 選擇「管理者（Admin）」 | 對話框顯示：目前角色「使用者（User）」→ 新角色「管理者（Admin）」，含確認與取消按鈕 |
| TS-F008-FE-003 | 取消確認 — PATCH API 未被呼叫 | AC-3 / US-014 AC-5 | E2E | Admin 已登入 | 1. 選擇新角色後對話框出現<br>2. 點擊「取消」 | 對話框關閉，角色未變更，PATCH API 未發出 |
| TS-F008-FE-004 | 角色變更後清單立即更新中文名稱 | AC-1 / US-014 AC-2 | E2E | Admin 已登入，目標帳號 role=user | 1. 變更角色為「管理者（Admin）」並確認 | 成功訊息顯示；帳號清單角色欄位立即更新為「管理者（Admin）」 |

---

## 補充章節：合併 UX — 業務主管旗標 + 變更角色 dialog（v3.2）

> **範圍說明**：本章節對應 F008 v3.2 新增的合併 UX 決策（AC-8 ~ AC-11、BR-12）與 prototype 07 Modal 5 / Modal 5b 設計。涵蓋：
> - `PATCH /api/accounts/:id/sales-manager-flag` 端點測試（後端）
> - `ChangeRoleDialog` UI 中 checkbox 連動邏輯（前端元件）
> - 前端合併呼叫流程（情境 A ~ F）
> - 列表頁 chip 徽章顯示邏輯（區塊 D）

---

### Acceptance Test Design（合併 UX）

#### AC-8：PATCH /sales-manager-flag 端點基本行為

| 項目 | 內容 |
|------|------|
| Given | 目標帳號 role=user，`is_sales_manager=false` |
| When | PATCH /api/accounts/:id/sales-manager-flag {isSalesManager: true} |
| Then | HTTP 200；回應含 `is_sales_manager: true`；DB 已更新 |
| 驗證步驟 | 1. 確認 HTTP 200<br>2. 確認回應 body `is_sales_manager: true`<br>3. GET /api/accounts/:id 確認 DB 值已更新 |

#### AC-9：Admin 帳號呼叫旗標端點 → ACCOUNT_FLAG_NOT_APPLICABLE

| 項目 | 內容 |
|------|------|
| Given | 目標帳號 role=admin |
| When | PATCH /api/accounts/:id/sales-manager-flag {isSalesManager: true} |
| Then | HTTP 400；錯誤碼 ACCOUNT_FLAG_NOT_APPLICABLE |
| 驗證步驟 | 1. 確認 HTTP 400<br>2. 確認 error.code = "ACCOUNT_FLAG_NOT_APPLICABLE"<br>3. 確認 `is_sales_manager` 未被修改 |

#### AC-10：合併 UX — ChangeRoleDialog checkbox 連動行為

| 項目 | 內容 |
|------|------|
| Given | Admin 開啟 User 帳號（is_sales_manager=true）的變更角色 dialog |
| When | Modal 5 渲染，新角色 select 初始為使用者（User） |
| Then | checkbox 區塊顯示且預填 `checked=true`（目前值） |
| And | 切換新角色為 Admin → checkbox 隱藏且 checked 重置為 false |
| And | 再切回 User → checkbox 顯示，預設未勾選（ASSUMPTION 4） |

#### AC-11：合併呼叫確認對話框摘要顯示

| 項目 | 內容 |
|------|------|
| Given | 新角色 = User，checkbox 勾選中 |
| When | 點擊「下一步」進入 Modal 5b |
| Then | 確認 dialog 顯示「業務主管權限：✓ 啟用」（綠字）或「業務主管權限：未啟用」（灰字） |
| And | 新角色 = Admin 時，業務主管權限摘要列不顯示 |

---

### Test Scenarios（合併 UX）

#### 一、Backend Integration Tests（PATCH /sales-manager-flag）

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F008-SM-001 | User 帳號旗標從 false 切換為 true | AC-8 / BR-9 | Integration | 目標帳號 role=user，is_sales_manager=false | 1. PATCH /api/accounts/:id/sales-manager-flag {isSalesManager: true} | HTTP 200；`is_sales_manager: true` |
| TS-F008-SM-002 | User 帳號旗標從 true 切換為 false | AC-8 / BR-9 | Integration | 目標帳號 role=user，is_sales_manager=true | 1. PATCH /api/accounts/:id/sales-manager-flag {isSalesManager: false} | HTTP 200；`is_sales_manager: false` |
| TS-F008-SM-003 | 冪等操作：旗標設為與現值相同（true → true） | BR-10 | Integration | 目標帳號 is_sales_manager=true | 1. PATCH /api/accounts/:id/sales-manager-flag {isSalesManager: true} | HTTP 200；值不變（冪等，不報錯） |
| TS-F008-SM-004 | 冪等操作：旗標設為與現值相同（false → false） | BR-10 | Integration | 目標帳號 is_sales_manager=false | 1. PATCH /api/accounts/:id/sales-manager-flag {isSalesManager: false} | HTTP 200；值不變（冪等） |
| TS-F008-SM-005 | Admin 帳號呼叫旗標端點 → ACCOUNT_FLAG_NOT_APPLICABLE | AC-9 / BR-9 | Negative | 目標帳號 role=admin | 1. PATCH /api/accounts/:id/sales-manager-flag {isSalesManager: true} | HTTP 400；error.code = "ACCOUNT_FLAG_NOT_APPLICABLE"；DB 未修改 |
| TS-F008-SM-006 | 帳號不存在 → 404 | 錯誤處理 | Negative | 無此 ID | 1. PATCH /api/accounts/nonexist-id/sales-manager-flag {isSalesManager: true} | HTTP 404；ACCOUNT_NOT_FOUND |
| TS-F008-SM-007 | 非 Admin 呼叫旗標端點 → 403 | BR-5 | Negative | USER_ACTIVE Token | 1. 以 User Token 呼叫 PATCH 旗標端點 | HTTP 403；AUTH_FORBIDDEN |
| TS-F008-SM-008 | `isSalesManager` 非布林值（缺欄位） → 400 | 驗證 | Negative | ADMIN_ACTIVE Token | 1. PATCH {isSalesManager: "yes"}（字串） | HTTP 400；VALIDATION_ERROR；訊息「isSalesManager 必須為布林值」 |
| TS-F008-SM-009 | 旗標切換後 PATCH /role response 保留 is_sales_manager 原值 | BR-8 | Integration | 目標帳號 role=user，is_sales_manager=true | 1. PATCH /api/accounts/:id/role {role: "user"}（冪等）<br>2. 觀察回應 | 回應 `is_sales_manager: true`（角色變更不影響旗標） |

#### 二、Frontend Component Tests（ChangeRoleDialog — Modal 5）

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F008-SM-FE-001 | User 帳號 + is_sales_manager=true → checkbox 顯示且預勾選 | AC-10 / AC-8 | Unit（Component） | mock accountData: {role: "user", is_sales_manager: true} | 1. render `<ChangeRoleDialog account={...} />`<br>2. 新角色 select 初始值為「使用者（User）」 | `roleDialogSalesManagerWrap` 可見；`roleDialogSalesManagerFlag` `checked=true` |
| TS-F008-SM-FE-002 | User 帳號 + is_sales_manager=false → checkbox 顯示且未勾選 | AC-10 | Unit（Component） | mock accountData: {role: "user", is_sales_manager: false} | 1. render dialog，新角色為 User | checkbox 顯示；`checked=false` |
| TS-F008-SM-FE-003 | Admin 帳號開啟 dialog → checkbox 不顯示 | AC-9 / AC-10 | Unit（Component） | mock accountData: {role: "admin"} | 1. render dialog，新角色初始為 admin | `roleDialogSalesManagerWrap` 不顯示（hidden 或 DOM 不存在） |
| TS-F008-SM-FE-004 | newRole 切換 user→admin → checkbox 隱藏並重置為 false | AC-9 / BR-12 | Unit（Component） | mock accountData: {role: "user", is_sales_manager: true}；checkbox 顯示且 checked=true | 1. 切換新角色 select 為「管理者（Admin）」 | checkbox 區塊隱藏；`roleDialogSalesManagerFlag` `checked=false` |
| TS-F008-SM-FE-005 | newRole 切換 admin→user → checkbox 顯示，預設未勾選（ASSUMPTION 4） | AC-10 / BR-12 | Unit（Component） | mock accountData: {role: "admin"}；先選 admin，再切回 user | 1. 新角色先選 admin（checkbox 不顯示）<br>2. 切換為使用者（User） | checkbox 顯示；`checked=false`（無歷史值載入，預設未勾選） |
| TS-F008-SM-FE-006 | 切換至業務角色（業務/行銷/客服/分析師/主管/後端作業）→ checkbox 隱藏 | AC-9 | Unit（Component） | mock accountData: {role: "user", is_sales_manager: true}；各業務角色逐一測試 | 1. 切換新角色為各業務角色<br>2. 觀察 checkbox 區塊 | 每種業務角色均使 checkbox 隱藏並重置為 false |
| TS-F008-SM-FE-007 | checkbox 區塊 className 符合 prototype 07 line 631 | AC-8 | Unit（Component） | newRole=user | 1. render dialog<br>2. 取得 `roleDialogSalesManagerWrap` 元素 | className 包含：`rounded-lg border border-amber-200 bg-amber-50/50 p-3` |
| TS-F008-SM-FE-008 | checkbox label 含 shield-check icon + 說明文字 | AC-8 | Unit（Component） | newRole=user | 1. render dialog<br>2. 查詢 icon 與說明文字 | icon 為 `shield-check`（`w-3.5 h-3.5 text-warning`）；說明文字為「啟用後此帳號可存取 E07 客戶名單分派與 E06 Customer 360」 |

#### 三、Frontend Component Tests（確認對話框 — Modal 5b）

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F008-SM-FE-009 | 新角色=User + checkbox 勾選 → 摘要顯示「已啟用」（綠字） | AC-11 / AC-5 | Unit（Component） | newRole=user，checkbox checked=true | 1. 點「下一步」進入 Modal 5b<br>2. 查詢 `confirmSalesManagerSummary` | `confirmSalesManagerSummary` 可見；`confirmSalesManagerSummaryValue` 文字含「啟用」；顏色呈現綠字（text-green 或 text-success） |
| TS-F008-SM-FE-010 | 新角色=User + checkbox 未勾選 → 摘要顯示「未啟用」（灰字） | AC-11 | Unit（Component） | newRole=user，checkbox checked=false | 1. 點「下一步」進入 Modal 5b | `confirmSalesManagerSummaryValue` 文字含「未啟用」；顏色呈現灰字（text-gray） |
| TS-F008-SM-FE-011 | 新角色=Admin → 確認 dialog 不顯示旗標摘要列 | AC-11 | Unit（Component） | newRole=admin | 1. 點「下一步」進入 Modal 5b | `confirmSalesManagerSummary` 隱藏（`hidden` class 或 DOM 不存在） |
| TS-F008-SM-FE-012 | 確認 dialog 顯示帳號名稱、目前角色、新角色 | AC-5 | Unit（Component） | mock accountData: {name: "吳佳蓉", role: "user"}；newRole=admin | 1. 進入 Modal 5b | `confirmCurrentRole` = 「使用者（User）」；`confirmNewRole` = 「管理者（Admin）」；`confirmUserName` 含「吳佳蓉」 |

#### 四、Frontend Integration Tests（合併呼叫流程）

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F008-SM-INT-001 | 情境 A：role 變更 + flag 同時變更（user role + flag 都改） → 依序呼叫兩支 API | AC-11 / BR-12 | Integration（Frontend） | 目標帳號 role=user，is_sales_manager=false；mock 兩支 API 成功 | 1. 開啟 dialog，新角色=User，checkbox 勾選（flag=true 有變動）<br>2. 點「下一步」→「確認變更」 | 先呼叫 PATCH /role，後呼叫 PATCH /sales-manager-flag；兩支皆成功 → 顯示合併成功訊息（例：「角色已變更為使用者（User），業務主管權限已啟用」） |
| TS-F008-SM-INT-002 | 情境 B：僅 role 變更（user→admin），flag 不呼叫 | AC-11 / BR-12 / AC-9 | Integration（Frontend） | 目標帳號 role=user；newRole=admin（checkbox 隱藏，無 flag 變動） | 1. 選 admin → checkbox 隱藏<br>2. 確認變更 | 僅呼叫 PATCH /role；PATCH /sales-manager-flag **不**被呼叫（避免 ACCOUNT_FLAG_NOT_APPLICABLE） |
| TS-F008-SM-INT-003 | 情境 C：僅 flag 變更（role 未改） → 跳過 PATCH /role，只呼叫 PATCH /sales-manager-flag | AC-11 / BR-12 | Integration（Frontend） | 目標帳號 role=user，is_sales_manager=false；newRole 仍為 user（未改）；checkbox 勾選（flag 有變動） | 1. 不改 role，僅改 flag<br>2. 確認變更 | PATCH /role **不**被呼叫；僅呼叫 PATCH /sales-manager-flag；成功訊息顯示旗標已更新 |
| TS-F008-SM-INT-004 | 情境 D：role + flag 同變，但 PATCH /role 失敗 → 中止，不呼叫 flag 端點 | AC-11 | Integration（Frontend） | mock PATCH /role 回傳 HTTP 422 ACCOUNT_LAST_ADMIN | 1. role=admin→user，flag 有變動<br>2. 確認變更 | 僅呼叫 PATCH /role（失敗）；PATCH /sales-manager-flag **不**被呼叫；UI 不更新；顯示 role 端點錯誤訊息（「無法移除最後一位 Admin…」） |
| TS-F008-SM-INT-005 | 情境 E：PATCH /role 成功，但 PATCH /sales-manager-flag 失敗 → 不 rollback role，顯示部分成功（ASSUMPTION 1） | AC-11 | Integration（Frontend） | mock PATCH /role 成功；mock PATCH /sales-manager-flag 回傳 HTTP 500 | 1. role + flag 同時有變動<br>2. 確認變更 | 列表頁角色欄位更新為新 role；is_sales_manager 顯示原值（未更新）；顯示部分成功訊息（「角色已變更為 X，但業務主管權限調整失敗，請稍後重試」）；**不**嘗試 rollback PATCH /role |
| TS-F008-SM-INT-006 | 情境 F：role 與 flag 皆無變動 → 前端阻擋送出（ASSUMPTION 2） | AC-11 | Integration（Frontend） | 目標帳號 role=user，is_sales_manager=true；newRole=user（未改）；checkbox checked=true（未改） | 1. 開啟 dialog，不改任何值<br>2. 點「下一步」 | 前端阻止進入 Modal 5b（或在 Modal 5b 停用「確認變更」按鈕）；任何 PATCH API **不**被呼叫；顯示「未有任何變更」提示 |
| TS-F008-SM-INT-007 | 情境 B 變形：User + is_sales_manager=true 升級為 Admin → 僅 PATCH /role，DB 保留 flag 原值 | AC-10 / BR-12 | Integration | 目標帳號 role=user，is_sales_manager=true | 1. 選新角色=admin（checkbox 隱藏）<br>2. 確認變更 | PATCH /role 成功；PATCH /flag 不呼叫；DB `is_sales_manager` 仍為 true（保留原值，不被清除） |

#### 五、列表頁 Chip 徽章（區塊 D）

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F008-SM-FE-013 | User + is_sales_manager=true → 列表顯示「Sales Manager」chip | F008 UI/UX | Unit（Component） | mock accountList: [{role: "user", is_sales_manager: true}] | 1. render 帳號列表<br>2. 查詢 chip 元素 | chip 存在；文字「Sales Manager」；className 含 `bg-amber-50 text-warning rounded-md border border-amber-200`；icon `shield-check w-3.5 h-3.5` |
| TS-F008-SM-FE-014 | User + is_sales_manager=false → 不顯示 chip | F008 UI/UX | Unit（Component） | mock accountList: [{role: "user", is_sales_manager: false}] | 1. render 帳號列表 | Sales Manager chip 不存在於該 row |
| TS-F008-SM-FE-015 | Admin 帳號 → 不顯示 chip | F008 AC-9 / UI/UX | Unit（Component） | mock accountList: [{role: "admin", is_sales_manager: false}] | 1. render 帳號列表 | 該 Admin row 不顯示 Sales Manager chip |
| TS-F008-SM-FE-016 | 變更角色操作成功後列表 chip 即時更新 | AC-11 | Integration（Frontend） | 目標帳號 role=user，is_sales_manager=false；操作後旗標改為 true | 1. 透過 dialog 勾選 flag 並確認<br>2. 觀察列表 | 操作成功後列表中目標帳號 row 即時顯示 Sales Manager chip（不需重新整理頁面） |
| TS-F008-SM-FE-017 | chip className 嚴格對齊 prototype 07 line 299-302 | F008 UI/UX | Unit（Component） | mock: user + is_sales_manager=true | 1. render 列表<br>2. 取得 chip span 元素 | className 包含完整字串：`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-amber-50 text-warning rounded-md border border-amber-200` |

---

### Manual / E2E Acceptance Tests（合併 UX 完整流程）

| ID | Scenario | Test Type | 操作步驟 | 驗收標準 |
|----|----------|-----------|---------|---------|
| TS-F008-SM-E2E-001 | 非 Admin（manager@cdmp.test）登入後無法存取帳號管理頁 | Manual E2E | 1. 以 manager@cdmp.test / P@ssw0rd123 登入<br>2. 嘗試存取帳號管理頁（/admin/accounts） | 頁面回傳 403 或被導向無權限頁；無法看到帳號列表與「變更角色」按鈕 |
| TS-F008-SM-E2E-002 | 完整情境 A：user role + flag 同時變更，顯示合併成功訊息 | Manual E2E | 1. 以 admin@cdmp.test 登入<br>2. 找到 is_sales_manager=false 的 User 帳號<br>3. 點「變更角色」，新角色選「使用者（User）」，勾選「業務主管權限」<br>4. 點「下一步」確認摘要，再點「確認變更」 | 成功訊息：「角色已變更為使用者（User），業務主管權限已啟用」；列表頁 chip 徽章出現；該帳號重新登入後 Top Bar 顯示 Sales Manager Badge |
| TS-F008-SM-E2E-003 | 完整情境 C：僅 flag 變更（取消勾選） | Manual E2E | 1. 找到 is_sales_manager=true 的 User<br>2. 開啟「變更角色」dialog，角色不動，取消勾選 checkbox<br>3. 確認變更 | 成功訊息顯示旗標已停用；列表頁 chip 消失；不呼叫 PATCH /role（可透過 DevTools Network 確認） |
| TS-F008-SM-E2E-004 | 情境 E：PATCH /role 成功但 flag 失敗 → 部分成功訊息（模擬測試） | Manual E2E | 1. 在 DevTools 中 Block PATCH /sales-manager-flag URL<br>2. 執行 role + flag 同時變更<br>3. 觀察 UI 回應 | 角色欄位已更新；顯示部分成功訊息提示重試 flag；role 未被 rollback |
| TS-F008-SM-E2E-005 | User 升 Admin → chip 消失、降回 User → chip 依上次旗標值顯示 | Manual E2E | 1. 找到 is_sales_manager=true 的 User<br>2. 升級為 Admin → 觀察列表（chip 應消失）<br>3. 再次開啟 dialog，降回 User，不改 flag<br>4. 觀察列表 | 升 Admin 後 chip 消失；降回 User 後 chip 重新顯示（DB `is_sales_manager` 保留原值 true） |
| TS-F008-SM-E2E-006 | 情境 F：role 與 flag 皆未改 → 前端阻擋，不送出 API | Manual E2E | 1. 開啟任一 User 帳號的「變更角色」dialog<br>2. 不改任何選項，直接點「下一步」 | 出現「未有任何變更」提示（或「下一步」按鈕停用）；DevTools Network 不出現任何 PATCH 請求 |

---

### 測試資料需求

| 種子帳號 ID | Email | Role | is_sales_manager | 用途 |
|------------|-------|------|-----------------|------|
| SALES_MANAGER_ACTIVE | manager@cdmp.test | user | true | 情境 A/C/E2E-002/005 |
| USER_ACTIVE | user@cdmp.test（或現有 seed） | user | false | 情境 A/F 旗標預設 false |
| ADMIN_ACTIVE | admin@cdmp.test | admin | false | 操作者 + 情境 B Admin 目標帳號 |
| LAST_ADMIN_ACTIVE | （系統中唯一 Admin 時） | admin | false | 情境 D：ACCOUNT_LAST_ADMIN 觸發 |

---

### 風險與注意事項

| 風險 ID | 描述 | 嚴重程度 | 建議處置 |
|--------|------|---------|---------|
| RISK-F008-SM-001 | ChangeRoleDialog 初始化時若 accountData 未傳入 is_sales_manager，checkbox 預設值可能為 undefined → 勾選狀態不確定 | High | TS-F008-SM-FE-001/002 明確 mock is_sales_manager 值；Component 應有 `?? false` 的防護初始化 |
| RISK-F008-SM-002 | 情境 E（PATCH /role 成功但 flag 失敗）在測試環境中難以穩定重現；需 mock flag endpoint 回 500 | Medium | TS-F008-SM-INT-005 使用 API mock（MSW 或 interceptor），不依賴真實 server 失敗 |
| RISK-F008-SM-003 | 情境 F（都未變動的偵測邏輯）需比對 `currentRole === newRole && currentFlag === newFlag`；若 role select 初始值未正確同步 currentRole，可能偵測有誤 | Medium | TS-F008-SM-INT-006 驗證「下一步」按鈕的停用條件嚴格對應兩個欄位的實際變動狀態 |
| RISK-F008-SM-004 | 情境 B（User + flag=true 升 Admin）若前端未正確判斷「新 role = admin 時跳過 flag 呼叫」，可能觸發 ACCOUNT_FLAG_NOT_APPLICABLE；後端防線有效但前端會誤顯示錯誤訊息 | High | TS-F008-SM-INT-002 及 TS-F008-SM-INT-007 明確驗證 flag 端點不被呼叫 |
| RISK-F008-SM-005 | 「業務角色」（業務/行銷等）在 checkbox 連動邏輯中容易被遺漏（只處理 admin/user 兩種系統角色） | Medium | TS-F008-SM-FE-006 逐一測試所有業務角色均可觸發 checkbox 隱藏 |
| RISK-F008-SM-006 | 確認 dialog（Modal 5b）摘要列的綠字/灰字樣式需確認 `text-green-*`/`text-gray-*` Tailwind class 已在 tailwind.config 中定義（若使用非標準色） | Low | TS-F008-SM-FE-009/010 在實作前先確認 tailwind.config 顏色定義 |

---

### 實作提示（供 tdd-implementation Agent）

1. **呼叫順序嚴格性**：合併呼叫務必先 PATCH /role 後 PATCH /sales-manager-flag，且需等待 /role 的 Promise resolve 後才決定是否呼叫 /flag（不可 parallel / Promise.all）。
2. **情境判斷矩陣**：在 `handleChangeRole()` 中，應依下列三個 boolean 決定呼叫策略：
   - `roleChanged = (newRole !== currentRole)`
   - `flagChanged = (newIsSalesManager !== currentIsSalesManager)`
   - `newRoleIsUser = (newRole === 'user')`
   - 只有 `newRoleIsUser && flagChanged` 才呼叫 PATCH /sales-manager-flag
3. **部分成功 Toast 設計**：情境 E 的錯誤訊息需與情境 D 的錯誤訊息在視覺上有所區隔（情境 D 為完全失敗，情境 E 為部分成功）。建議用不同顏色的 Toast 或分兩行顯示。
4. **checkbox 重置時機**：切換 newRole select 時，應立即重置 `roleDialogSalesManagerFlag.checked = false`（不等到 confirm 時處理），確保使用者視覺正確。
5. **ASSUMPTION 4（Admin→User checkbox 預設未勾選）**：此為設計決策，非讀取 DB 值。原因：Admin 帳號的 `is_sales_manager` DB 值無業務意義（BR-9），故 dialog 不用舊值預填，避免混淆。
6. **`data-testid` 建議**：
   - `roleDialogSalesManagerWrap` → `data-testid="role-dialog-sales-manager-wrap"`
   - `roleDialogSalesManagerFlag` → `data-testid="role-dialog-sales-manager-flag"`
   - `confirmSalesManagerSummary` → `data-testid="confirm-sales-manager-summary"`
   - `confirmSalesManagerSummaryValue` → `data-testid="confirm-sales-manager-summary-value"`
   - 列表頁 Sales Manager chip → `data-testid="sales-manager-chip-{accountId}"`
