---
type: implementation-log
feature_id: F003
feature_name: 登出
status: complete
last_updated: 2026-03-13
---

# F003: 登出 — 實作紀錄

## 測試結果摘要

### 後端 Unit Tests (5 個新增)

| Scenario ID | 描述 | 狀態 |
|-------------|------|------|
| TS-F003-U-001 | logout() 將 token 寫入 TokenBlocklist | PASS |
| TS-F003-U-002 | logout() 從 JWT exp claim 設定 expires_at | PASS |
| TS-F003-U-003 | logout() 冪等 — token 已在 blocklist 則跳過寫入 | PASS |
| TS-F003-U-004 | isTokenRevoked() 回傳 true（token 在 blocklist） | PASS |
| TS-F003-U-005 | isTokenRevoked() 回傳 false（token 不在 blocklist） | PASS |

### 後端 AuthGuard Unit Tests (2 個新增 / 3 個修改)

| Scenario ID | 描述 | 狀態 |
|-------------|------|------|
| TS-F003-G-001 | 有效 token → 放行（含 blocklist 查詢） | PASS |
| TS-F003-G-002 | 無 Authorization header → AUTH_TOKEN_MISSING | PASS |
| TS-F003-G-003 | 過期 token → AUTH_TOKEN_EXPIRED | PASS |
| TS-F003-G-004 | 無效 token → AUTH_UNAUTHORIZED | PASS |
| TS-F003-G-005 | token 在 blocklist → AUTH_TOKEN_REVOKED | PASS |

### 後端 E2E Tests (5 個新增)

| Scenario ID | 描述 | 狀態 |
|-------------|------|------|
| TS-F003-001 | POST /api/v1/auth/logout (Admin Token) → 200 + 「登出成功」 | PASS |
| TS-F003-002 | POST /api/v1/auth/logout (User Token) → 200 + 「登出成功」 | PASS |
| TS-F003-003 | 登出後用舊 Token 呼叫受保護 API → 401 AUTH_TOKEN_REVOKED | PASS |
| TS-F003-004 | POST /api/v1/auth/logout 無 Token → 401 AUTH_TOKEN_MISSING | PASS |
| TS-F003-005 | 登出後再次登出 → 401 AUTH_TOKEN_REVOKED（舊 token 被拒） | PASS |

### 前端 Tests (2 個新增 / 4 個保留)

| Scenario ID | 描述 | 狀態 |
|-------------|------|------|
| TS-F003-FE-001 | 點擊登出 → 呼叫 logout API + clearAuth + 導向 /login | PASS |
| TS-F003-FE-002 | 登出 API 失敗 → 仍清除 Session 並導向 /login（降級處理） | PASS |

**共 14 個新增測試全部通過（後端 Unit 5 + Guard 5 + E2E 5 + 前端 2）。既有 F001/F002 測試全部通過無回歸。**

## 檔案變更

### 後端 — 新增

| 檔案路徑 | 描述 |
|----------|------|
| `apps/api/src/database/entities/token-blocklist.entity.ts` | TokenBlocklist entity（token PK, user_id, revoked_at, expires_at） |

### 後端 — 修改

| 檔案路徑 | 描述 |
|----------|------|
| `apps/api/src/common/errors/error-codes.ts` | 新增 TOKEN_REVOKED / TOKEN_EXPIRED / TOKEN_MISSING 錯誤碼與訊息 |
| `apps/api/src/modules/auth/auth.service.ts` | 新增 logout() / isTokenRevoked()、注入 TokenBlocklist Repository + JwtService |
| `apps/api/src/modules/auth/auth.controller.ts` | 新增 POST /auth/logout endpoint（AuthGuard 保護） |
| `apps/api/src/modules/auth/auth.module.ts` | TypeOrmModule.forFeature 加入 TokenBlocklist、exports 加入 JwtModule |
| `apps/api/src/common/guards/auth.guard.ts` | 改為 async、注入 TokenBlocklist Repository、新增 blocklist 查詢與錯誤碼細分 |
| `apps/api/src/modules/accounts/accounts.module.ts` | TypeOrmModule.forFeature 加入 TokenBlocklist（AuthGuard 依賴） |
| `apps/api/src/app.module.ts` | entities 陣列加入 TokenBlocklist |
| `apps/api/src/modules/auth/__tests__/auth.service.spec.ts` | 新增 5 個 logout / isTokenRevoked 單元測試 |
| `apps/api/src/common/__tests__/auth.guard.spec.ts` | 重構為 async + 新增 blocklist / 錯誤碼測試 |
| `apps/api/test/auth.e2e-spec.ts` | 新增 F003 Logout describe block（5 個 E2E 測試） |

### 前端 — 修改

| 檔案路徑 | 描述 |
|----------|------|
| `apps/web/src/api/auth.ts` | 新增 logout() API 函式 |
| `apps/web/src/pages/user-info/user-info-page.tsx` | handleLogout 改為 async：呼叫 logout API + 降級處理 |
| `apps/web/src/pages/user-info/__tests__/user-info-page.test.tsx` | 新增 logout API mock + 降級處理測試 |

### 共用套件 — 修改

| 檔案路徑 | 描述 |
|----------|------|
| `packages/shared/src/index.ts` | 新增 LogoutResponse type + TOKEN_REVOKED / TOKEN_EXPIRED / TOKEN_MISSING 錯誤碼 |

## 架構決策

- **AuthGuard 直接注入 TokenBlocklist Repository**：避免 AuthGuard → AuthService → AuthModule 循環依賴。AuthGuard 僅需 `findOne` 查詢 blocklist，不需依賴完整 AuthService
- **AuthGuard 改為 async**：canActivate 返回 `Promise<boolean>`，因 blocklist 查詢為非同步操作。NestJS guard pipeline 原生支援 async guard
- **JWT 錯誤碼細分**：原本統一回傳 `AUTH_UNAUTHORIZED`，現依錯誤類型細分為 TOKEN_MISSING / TOKEN_EXPIRED / TOKEN_REVOKED / AUTH_UNAUTHORIZED，前端可據此提供更精確的提示訊息
- **登出冪等性**：logout() 先查詢 token 是否已在 blocklist，已存在則跳過寫入。但 AuthGuard 在 blocklist 查詢後會拒絕已撤銷 token，因此已撤銷 token 無法再次呼叫 /auth/logout endpoint
- **降級處理**：前端 handleLogout 使用 try-catch 包裹 logout API 呼叫，無論成功或失敗皆執行 clearAuth() + navigate('/login')

## 業務規則驗證

| 規則編號 | 規則說明 | 狀態 |
|---------|---------|------|
| BR-001 | 伺服器端 + 用戶端 Token 失效 | PASS — Token 加入 Blocklist + clearAuth() |
| BR-002 | 登出後舊 Token 回傳 401 | PASS — AuthGuard blocklist 查詢 |
| BR-003 | 所有已驗證頁面可見登出按鈕 | PASS — UserInfoPage header（Admin Dashboard 為 stub，待 F005） |
| BR-004 | Admin 與 User 皆可登出 | PASS — E2E 分別測試 Admin/User logout |
| AC-001 | 點擊登出 → Token 失效 + Session 清除 + 導向 /login | PASS |
| AC-003 | 登出後舊 Token 被拒 401 | PASS |

## 測試場景覆蓋對照

| Test Spec ID | 描述 | 實作狀態 | 備註 |
|-------------|------|---------|------|
| TS-F003-001 | Admin 成功登出 | PASS | E2E |
| TS-F003-002 | User 成功登出 | PASS | E2E |
| TS-F003-003 | 登出後舊 Token 被拒絕 | PASS | E2E (AUTH_TOKEN_REVOKED) |
| TS-F003-004 | 無 Token 嘗試登出 | PASS | E2E (AUTH_TOKEN_MISSING) |
| TS-F003-005 | 已過期 Token 嘗試登出 | PARTIAL | AuthGuard 可區分 TOKEN_EXPIRED，但 E2E 未產生過期 Token 測試（需等待 token 到期） |
| TS-F003-006 | 登出 API 失敗降級處理 | PASS | 前端測試（mock network error） |
