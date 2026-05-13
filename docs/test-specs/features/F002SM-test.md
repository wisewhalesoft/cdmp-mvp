---
type: test-design-feature
feature_id: F002SM
feature_name: Sales Manager 旗標顯示於 Top Bar
priority: P0-MVP
related_spec: /docs/specs/features/F002-user-login.md, /docs/specs/features/F008-assign-change-role.md
prototype_ref: /prototypes/27-list-definition.html, line 122-126
last_updated: 2026-05-13
---

# F002SM: Sales Manager 旗標顯示於 Top Bar — 測試設計

> **範圍說明**：本文件專注於「登入 API 回應補充 `isSalesManager` 欄位」與「前端 Top Bar 依旗標顯示 Sales Manager Badge」兩個橫切面需求的測試設計。這是對 F002 現有測試的補充，不重複 F002 已有的基礎登入場景。

---

## Acceptance Test Design

### AC-1：登入 API 回應含 `isSalesManager` 欄位

| 項目 | 內容 |
|------|------|
| Given | is_sales_manager=true 的 User 帳號（manager@cdmp.test）存在且啟用 |
| When | 呼叫 `POST /api/auth/login` 並以正確憑證登入 |
| Then | HTTP 200，回應 body 的 `user` 物件包含 `isSalesManager: true`（boolean） |
| 驗證步驟 | 1. 確認回應 body 結構：`user.isSalesManager` 存在且為 boolean<br>2. 解碼 JWT Token — 確認 payload 含 `isSalesManager: true` |
| 測試資料 | SALES_MANAGER_ACTIVE 種子帳號（manager@cdmp.test） |

### AC-2：一般 User 登入 API 回應 `isSalesManager: false`

| 項目 | 內容 |
|------|------|
| Given | is_sales_manager=false 的 User 帳號存在且啟用 |
| When | 呼叫 `POST /api/auth/login` |
| Then | HTTP 200，`user.isSalesManager: false` |
| 驗證步驟 | 1. 確認 `user.isSalesManager` 存在且值為 `false` |

### AC-3：Admin 登入 API 回應 `isSalesManager` 語意

| 項目 | 內容 |
|------|------|
| Given | Admin 帳號存在且啟用 |
| When | 呼叫 `POST /api/auth/login` |
| Then | HTTP 200，`user.isSalesManager` 為 `false`（或欄位不存在），前端不顯示 Badge |
| 驗證步驟 | 1. 若欄位存在，確認值為 `false`<br>2. 前端處理：缺少欄位與值為 `false` 均視為不顯示 |
| 備註 | 根據 F008 AC-9，Admin 帳號對業務主管旗標無意義；後端設計上建議回傳 `false` 而非省略欄位，以避免前端 undefined 邊界問題 |

### AC-4：is_sales_manager=true 時 Top Bar 顯示 Badge

| 項目 | 內容 |
|------|------|
| Given | auth-store 中 `user.isSalesManager === true` |
| When | 前端渲染任意受保護頁面的 Header / TopBar 元件 |
| Then | Top Bar 顯示「Sales Manager」Badge，樣式完全符合 prototype 27 第 122-126 行 |
| 驗證步驟 | 1. Badge 元素存在於 DOM<br>2. 文字為「Sales Manager」<br>3. className 包含：`bg-amber-50 text-warning rounded-md border border-amber-200`<br>4. icon 使用 `shield-check`（Lucide） |

### AC-5：is_sales_manager 非 true 時不顯示 Badge

| 項目 | 內容 |
|------|------|
| Given | auth-store 中 `user.isSalesManager === false`、`undefined`、或 `null` |
| When | 前端渲染 Header / TopBar 元件 |
| Then | DOM 中完全不存在 Badge 元素（非 CSS 隱藏，而是不渲染） |
| 驗證步驟 | 1. `querySelector('[data-testid="sales-manager-badge"]')` 回傳 `null` |

---

## Test Scenarios

### 一、Backend Integration Tests

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F002SM-001 | Sales Manager User 登入 — 回應含 `isSalesManager: true` | AC-1, F002 BR-003, F008 AC-8 | Integration | SALES_MANAGER_ACTIVE 種子帳號存在（is_sales_manager=true） | 1. POST /api/auth/login {email: "manager@cdmp.test", password: "P@ssw0rd123"} | HTTP 200；`user.isSalesManager === true`（boolean，非字串） |
| TS-F002SM-002 | 一般 User 登入 — 回應含 `isSalesManager: false` | AC-2, F008 BR-9 | Integration | USER_ACTIVE 種子帳號（is_sales_manager=false） | 1. POST /api/auth/login {email: user@cdmp.test, password: correct} | HTTP 200；`user.isSalesManager === false` |
| TS-F002SM-003 | Admin 登入 — `isSalesManager` 為 false 或不存在 | AC-3, F008 AC-9 | Integration | ADMIN_ACTIVE 種子帳號 | 1. POST /api/auth/login {email: admin@cdmp.test, password: correct} | HTTP 200；`user.isSalesManager` 為 `false` 或鍵不存在（前端以 falsy 處理） |
| TS-F002SM-004 | Sales Manager 登入 — JWT payload 含 `isSalesManager: true` | AC-1, F008 AD-E02-1 | Integration | SALES_MANAGER_ACTIVE 種子帳號 | 1. POST /api/auth/login → 取得 token<br>2. 解碼 JWT payload | JWT payload 含 `isSalesManager: true`（boolean） |
| TS-F002SM-005 | 一般 User JWT payload — `isSalesManager: false` | AC-2 | Integration | USER_ACTIVE 種子帳號 | 1. POST /api/auth/login → 取得 token<br>2. 解碼 JWT payload | JWT payload 含 `isSalesManager: false` |
| TS-F002SM-006 | `isSalesManager` 欄位型別為 boolean（非字串） | AC-1, AC-2 | Integration | SALES_MANAGER_ACTIVE 種子帳號 | 1. POST /api/auth/login<br>2. 解析回應 JSON | `typeof user.isSalesManager === 'boolean'`；不可為字串 `"true"` 或 `"false"` |

### 二、Frontend Component Tests

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F002SM-007 | TopBar — isSalesManager=true 時顯示 Badge | AC-4 | Unit（Component） | auth-store mock：`{ isSalesManager: true }` | 1. render `<TopBar />` 或 `<SalesManagerBadge isSalesManager={true} />` | Badge 元素存在於 DOM；文字為「Sales Manager」 |
| TS-F002SM-008 | Badge className 完全符合 prototype 27 line 123 | AC-4 | Unit（Component） | auth-store mock：`{ isSalesManager: true }` | 1. render Badge<br>2. 取得 badge span 元素 | className 包含完整 class 字串：`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-amber-50 text-warning rounded-md border border-amber-200` |
| TS-F002SM-009 | Badge icon 使用 shield-check（Lucide） | AC-4 | Unit（Component） | auth-store mock：`{ isSalesManager: true }` | 1. render Badge<br>2. 查詢 icon | icon 元素使用 `shield-check`；尺寸為 `w-3.5 h-3.5` |
| TS-F002SM-010 | TopBar — isSalesManager=false 時不渲染 Badge | AC-5 | Unit（Component） | auth-store mock：`{ isSalesManager: false }` | 1. render `<TopBar />`<br>2. querySelector `[data-testid="sales-manager-badge"]` | 回傳 `null`（DOM 中不存在，非 display:none） |
| TS-F002SM-011 | TopBar — isSalesManager=undefined 時不渲染 Badge | AC-5 | Unit（Component） | auth-store mock：`{ isSalesManager: undefined }` | 1. render `<TopBar />`<br>2. querySelector badge | 回傳 `null` |
| TS-F002SM-012 | TopBar — isSalesManager=null 時不渲染 Badge | AC-5 | Unit（Component） | auth-store mock：`{ isSalesManager: null }` | 1. render `<TopBar />`<br>2. querySelector badge | 回傳 `null` |
| TS-F002SM-013 | Admin 使用者 TopBar — 不渲染 Badge | AC-5, F008 AC-9 | Unit（Component） | auth-store mock：`{ role: 'admin', isSalesManager: false }` | 1. render `<TopBar />`<br>2. querySelector badge | 回傳 `null` |

### 三、Frontend Integration Tests（Protected Route / Layout 行為）

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F002SM-014 | 完整登入流程 — Sales Manager 登入後各頁面顯示 Badge | AC-1, AC-4 | E2E / Integration | manager@cdmp.test / P@ssw0rd123 可用 | 1. 瀏覽器開啟 /login<br>2. 輸入 manager@cdmp.test / P@ssw0rd123<br>3. 登入成功後導向受保護頁面<br>4. 觀察 Top Bar | Header 中可見「Sales Manager」Badge；文字、icon、顏色與 prototype 27 一致 |
| TS-F002SM-015 | 完整登入流程 — 一般 User 登入後不顯示 Badge | AC-5 | E2E / Integration | USER_ACTIVE 帳號（is_sales_manager=false） | 1. 登入為一般 user<br>2. 導向受保護頁面<br>3. 觀察 Top Bar | Header 中不可見「Sales Manager」Badge |
| TS-F002SM-016 | 完整登入流程 — Admin 登入後不顯示 Badge | AC-5 | E2E / Integration | ADMIN_ACTIVE 帳號 | 1. 登入為 admin<br>2. 導向受保護頁面（任意 admin 功能頁）<br>3. 觀察 Top Bar | Header 中不可見「Sales Manager」Badge |
| TS-F002SM-017 | Badge 在不同受保護頁面均存在（跨頁一致性） | AC-4 | E2E | manager@cdmp.test 已登入 | 1. 以 Sales Manager 身份登入<br>2. 分別導向至少 3 個不同受保護頁面（如首頁、名單定義頁、客戶列表頁） | 每個頁面的 Top Bar 均顯示 Badge；跨頁導航後 Badge 不消失 |

### 四、Edge Case Tests

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F002SM-018 | localStorage 無 `isSalesManager` 欄位（舊 Token 情境） | AC-5 | Unit（Component / Store） | auth-store 從不含 `isSalesManager` 的舊 JWT 初始化 | 1. Mock localStorage 中的 token 為舊格式（payload 無 isSalesManager 欄位）<br>2. 頁面重新整理，auth-store 從 token 還原<br>3. render TopBar | Badge 不顯示；`isSalesManager` 被視為 `false`（undefined → falsy → 不渲染） |
| TS-F002SM-019 | 旗標升級情境 — Admin 設定 isSalesManager=true 後，User 重新登入顯示 Badge | F008 AC-8, F008 BR-11 | Integration | User 初始 is_sales_manager=false；Admin 已透過 PATCH /api/accounts/:id/sales-manager-flag 更新為 true | 1. User 以舊 token 存取（預期 Badge 不顯示）<br>2. User 登出<br>3. User 重新登入<br>4. 觀察 Top Bar | 重新登入後 Top Bar 顯示 Badge；舊 token 期間不顯示（舊 payload 仍為 false） |
| TS-F002SM-020 | 旗標降級情境 — Admin 撤銷 is_sales_manager 後，User 重新登入不顯示 Badge | F008 AC-8, F008 BR-11 | Integration | User 初始 is_sales_manager=true | 1. User 以舊 token 存取（Badge 顯示）<br>2. Admin 將旗標更新為 false<br>3. User 登出後重新登入<br>4. 觀察 Top Bar | 重新登入後 Badge 消失；Token 刷新前仍顯示（舊 payload 仍為 true，符合 F008 BR-11） |
| TS-F002SM-021 | 登出後重新登入 Badge 狀態正確切換（false → true） | F003, AC-4 | Integration | 先以一般 User 登入，確認無 Badge；Admin 升級後該 User 重新登入 | 1. 登入一般 user → 確認無 Badge<br>2. 登出<br>3. Admin 設定 is_sales_manager=true<br>4. 再次登入同一帳號 | 第二次登入後 Badge 出現；Badge 狀態切換正確反映最新旗標值 |

### 五、Manual / E2E Acceptance Tests（供 tdd-implementation 與 Reviewer 參考）

| ID | Scenario | Test Type | 操作步驟 | 驗收標準 |
|----|----------|-----------|---------|---------|
| TS-F002SM-E2E-001 | Sales Manager 登入視覺驗收 | Manual E2E | 1. 開啟瀏覽器至 /login<br>2. 輸入 manager@cdmp.test / P@ssw0rd123<br>3. 觀察登入後 Top Bar | Top Bar 右側（使用者名稱左方）可見「Sales Manager」chip；icon 為 shield-check；chip 背景為 amber-50（淺黃）；文字顏色為 text-warning（amber 深色系）；邊框為 border-amber-200；圓角為 rounded-md |
| TS-F002SM-E2E-002 | 視覺比對 — prototype 27 完全一致 | Manual E2E | 1. 登入 manager@cdmp.test<br>2. 截圖 Top Bar<br>3. 比對 prototypes/27-list-definition.html 第 122-126 行樣式 | 文字「Sales Manager」、icon、間距（gap-1.5 / px-2.5 py-1）、字型大小（text-xs）、font-medium 均與 prototype 一致 |
| TS-F002SM-E2E-003 | 一般 User 無 Badge 視覺驗收 | Manual E2E | 1. 登入一般 user<br>2. 觀察 Top Bar | Top Bar 不含任何「Sales Manager」文字或 chip |
| TS-F002SM-E2E-004 | Admin 無 Badge 視覺驗收 | Manual E2E | 1. 登入 admin 帳號<br>2. 觀察 Top Bar | Top Bar 不含任何「Sales Manager」文字或 chip |

---

## 測試資料需求

| 種子帳號 ID | Email | Role | is_sales_manager | 用途 |
|------------|-------|------|-----------------|------|
| SALES_MANAGER_ACTIVE | manager@cdmp.test | user | true | 主要測試對象：Badge 顯示 |
| USER_ACTIVE | （現有 seed） | user | false | Badge 不顯示對照組 |
| ADMIN_ACTIVE | （現有 seed） | admin | false | Admin 無 Badge 驗證 |

> manager@cdmp.test / P@ssw0rd123 已存在於 dev 環境 seed data。

---

## 實作提示（供 tdd-implementation Agent）

### 後端必要異動

1. **`LoginResult.user` DTO 補充欄位**：`AuthService.login()` 已將 `isSalesManager` 寫入 JWT payload，但 `LoginResult.user` 回應物件目前未包含此欄位。需在回應 DTO 中新增 `isSalesManager: boolean`，並從 DB 查詢結果或 JWT payload 填入。
2. **型別驗證**：`isSalesManager` 必須序列化為 JSON boolean（`true` / `false`），不可為字串。
3. **Admin 帳號處理**：建議統一回傳 `isSalesManager: false`（而非省略欄位），降低前端 undefined 判斷風險。

### 前端必要異動

1. **auth-store `User` type**：在 `User` interface 中補充 `isSalesManager?: boolean`（optional，以相容舊 token）。
2. **元件架構選擇建議**：
   - **推薦方案**：抽出獨立 `<SalesManagerBadge />` 元件，在 TopBar / Header 元件中條件渲染；此方案便於 unit test 獨立測試 Badge 行為。
   - **替代方案**：直接在 TopBar 元件內嵌入條件渲染邏輯，不抽元件；可行但 test surface 較大。
   - 無論選擇哪種方案，確保測試 ID `data-testid="sales-manager-badge"` 掛在 badge 的最外層 `<span>` 上，以利自動化測試定位。
3. **條件渲染規則**：`auth.user?.isSalesManager === true`（嚴格比對），undefined / null / false 均不顯示。
4. **className 必須完整**：不可縮減或拆分 class，必須與 prototype 27 line 123 完全一致（見 TS-F002SM-008）。

---

## 風險與注意事項

| 風險 ID | 描述 | 嚴重程度 | 建議處置 |
|--------|------|---------|---------|
| RISK-F002SM-001 | 後端 `LoginResult.user` DTO 若以 class-transformer 序列化，需確保 `isSalesManager` 欄位有正確的 `@Expose()` / `@Transform()` 裝飾器，否則欄位可能被過濾掉 | High | 在 TS-F002SM-001 明確驗證欄位存在性與型別 |
| RISK-F002SM-002 | auth-store 若在 token 刷新後未同步更新 `isSalesManager`，可能導致旗標降級後舊值殘留（超出 Token TTL） | Medium | TS-F002SM-020 驗證登出後重新登入的狀態正確性 |
| RISK-F002SM-003 | TopBar 元件若為 Layout 層的全域元件，需確認它能存取 auth-store；若使用 Context / Provider 模式，component test 需正確 wrap Provider | Medium | TS-F002SM-007 ~ 013 確保 mock auth-store 的 Provider 設置正確 |
| RISK-F002SM-004 | `text-warning` Tailwind class 需確認已在 tailwind.config 中定義（非標準 Tailwind class）；若未定義，顏色不正確且 E2E 視覺驗收會失敗 | High | tdd-implementation 前先確認 tailwind.config 已有 `warning` 色彩定義 |
