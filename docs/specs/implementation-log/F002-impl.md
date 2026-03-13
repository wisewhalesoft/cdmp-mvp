---
type: implementation-log
feature_id: F002
feature_name: User 登入
status: complete
last_updated: 2026-03-13
---

# F002: User 登入 — 實作紀錄

## 測試結果摘要

### 後端 Unit Tests (10 個新增)

| Scenario ID | 描述 | 狀態 |
|-------------|------|------|
| TS-F002-U-001 | User 正確憑證登入 → 回傳 { token, user } (role=user) | PASS |
| TS-F002-U-002 | User rememberMe=true → JWT exp = 30 天 | PASS |
| TS-F002-U-003 | User 帳號已停用 → ForbiddenException (AUTH_ACCOUNT_DISABLED) | PASS |
| TS-F002-U-004 | User 錯誤密碼 → UnauthorizedException (AUTH_INVALID_CREDENTIALS) | PASS |
| TS-F002-U-005 | AuthGuard — 有效 JWT → 注入 request.user | PASS |
| TS-F002-U-006 | AuthGuard — 無效 JWT → UnauthorizedException | PASS |
| TS-F002-U-007 | AuthGuard — 無 Authorization header → UnauthorizedException | PASS |
| TS-F002-U-008 | RolesGuard — 角色符合 → 放行 | PASS |
| TS-F002-U-009 | RolesGuard — 角色不符 → ForbiddenException | PASS |
| TS-F002-U-010 | RolesGuard — 無 @Roles 裝飾器 → 放行 | PASS |

### 後端 E2E Tests (6 個新增)

| Scenario ID | 描述 | 狀態 |
|-------------|------|------|
| TS-F002-001 | POST /api/v1/auth/login User 正確憑證 → 200 + token (role=user) | PASS |
| TS-F002-002 | POST /api/v1/auth/login User 記住我 → 200 + JWT exp 30d | PASS |
| TS-F002-005 | POST /api/v1/auth/login User 帳號已停用 → 403 + AUTH_ACCOUNT_DISABLED | PASS |
| TS-F002-006 | POST /api/v1/auth/login User 錯誤密碼 → 401 + AUTH_INVALID_CREDENTIALS | PASS |
| TS-F002-003 | GET /api/v1/accounts (User Token) → 403 + AUTH_FORBIDDEN | PASS |
| TS-F002-E2E-ADMIN | GET /api/v1/accounts (Admin Token) → 200 (驗證 Admin 可存取) | PASS |

### 前端 Tests (13 個新增)

| Scenario ID | 描述 | 狀態 |
|-------------|------|------|
| TS-F002-FE-001 | UserInfoPage 渲染說明訊息「目前尚無可用功能」 | PASS |
| TS-F002-FE-002 | UserInfoPage 渲染登出按鈕 | PASS |
| TS-F002-FE-003 | UserInfoPage 點擊登出 → 清除 token 並導向 /login | PASS |
| TS-F002-FE-004 | UserInfoPage 渲染品牌標識 | PASS |
| TS-F002-FE-005 | UserInfoPage 渲染 CDMP 標題 | PASS |
| TS-F002-FE-006 | AdminRoute — admin 角色 → 放行渲染子元件 | PASS |
| TS-F002-FE-007 | AdminRoute — user 角色 → 導向 /user-info | PASS |
| TS-F002-FE-008 | AdminRoute — 未登入 → 導向 /login | PASS |
| TS-F002-FE-009 | UserRoute — user 角色 → 放行渲染子元件 | PASS |
| TS-F002-FE-010 | UserRoute — admin 角色 → 導向 / | PASS |
| TS-F002-FE-011 | UserRoute — 未登入 → 導向 /login | PASS |
| TS-F002-FE-012 | LoginPage — User 登入成功 → 導向 /user-info | PASS |
| TS-F002-FE-013 | LoginPage — Admin 登入成功 → 導向 / | PASS |

**共 29 個測試全部通過（後端 16 + 前端 13）。**

## 檔案變更

### 後端

| 檔案路徑 | 變更類型 | 描述 |
|----------|---------|------|
| `apps/api/test/seeds/test-data.ts` | modified | 新增 USER_ACTIVE、USER_DISABLED 測試種子帳號 |
| `apps/api/src/common/errors/error-codes.ts` | modified | 新增 FORBIDDEN 錯誤碼與中文訊息 |
| `apps/api/src/common/guards/auth.guard.ts` | new | AuthGuard：JWT Bearer token 驗證，注入 request.user |
| `apps/api/src/common/guards/roles.guard.ts` | new | RolesGuard：RBAC 角色檢查，搭配 @Roles() 裝飾器 |
| `apps/api/src/common/decorators/roles.decorator.ts` | new | @Roles() 裝飾器，設定端點所需角色 |
| `apps/api/src/modules/accounts/accounts.controller.ts` | new | AccountsController stub：Admin 專屬端點（RBAC 驗證用） |
| `apps/api/src/modules/accounts/accounts.module.ts` | new | AccountsModule 模組定義 |
| `apps/api/src/app.module.ts` | modified | 匯入 AccountsModule |
| `apps/api/src/modules/auth/__tests__/auth.service.spec.ts` | modified | 新增 4 個 User 登入相關單元測試 |
| `apps/api/src/common/__tests__/auth.guard.spec.ts` | new | AuthGuard 單元測試（3 個） |
| `apps/api/src/common/__tests__/roles.guard.spec.ts` | new | RolesGuard 單元測試（3 個） |
| `apps/api/test/auth.e2e-spec.ts` | modified | 新增 6 個 User 登入與 RBAC E2E 測試 |

### 前端

| 檔案路徑 | 變更類型 | 描述 |
|----------|---------|------|
| `apps/web/src/pages/user-info/user-info-page.tsx` | new | User 說明頁面：「目前尚無可用功能」訊息 + 登出按鈕 |
| `apps/web/src/router/protected-route.tsx` | modified | 新增 AdminRoute、UserRoute 角色路由守衛 |
| `apps/web/src/stores/auth-store.ts` | modified | 新增 getUserRole() helper 函式（解碼 JWT 取得角色） |
| `apps/web/src/App.tsx` | modified | 新增 /user-info 路由（UserRoute 守衛）、/ 路由改用 AdminRoute 守衛 |
| `apps/web/src/pages/login/login-page.tsx` | modified | 登入成功後依角色導向：user→/user-info、admin→/ |
| `apps/web/src/pages/user-info/__tests__/user-info-page.test.tsx` | new | UserInfoPage 測試（5 個） |
| `apps/web/src/router/__tests__/protected-route.test.tsx` | new | ProtectedRoute 角色路由測試（6 個） |
| `apps/web/src/pages/login/__tests__/login-page.test.tsx` | modified | 新增 2 個角色導向測試 |

### 共用套件

| 檔案路徑 | 變更類型 | 描述 |
|----------|---------|------|
| `packages/shared/src/index.ts` | modified | 匯出 FORBIDDEN 錯誤碼 |

## 架構決策

- **AuthGuard + RolesGuard 分離**：AuthGuard 負責 JWT 驗證與 request.user 注入，RolesGuard 負責角色檢查。兩者透過 NestJS Guard pipeline 串接，職責清晰分離
- **@Roles() 裝飾器模式**：使用 NestJS `SetMetadata` + `Reflector` 機制，在 Controller 方法上宣告所需角色，RolesGuard 讀取 metadata 進行比對
- **無 @Roles 裝飾器時放行**：未標記 @Roles() 的端點預設允許所有已認證使用者存取，避免過度限制
- **AccountsController stub**：建立最小化的 Admin 專屬端點作為 RBAC E2E 測試標的，後續 F006 帳號管理實作時再擴充
- **前端角色路由三層守衛**：ProtectedRoute（已登入檢查）→ AdminRoute（admin 角色檢查）→ UserRoute（user 角色檢查），各自獨立處理未登入與角色不符的導向邏輯
- **getUserRole() 從 JWT 解碼**：直接解碼 localStorage 中的 token 取得角色，避免額外 API 呼叫，與 F001 的 auth-store 架構一致

## 業務規則驗證

| 規則編號 | 規則說明 | 狀態 |
|---------|---------|------|
| BR-001 | 密碼驗證邏輯與 F001 一致（bcrypt compare） | PASS — 共用 AuthService.login() |
| BR-002 | 無效憑證統一訊息「Email 或密碼錯誤」 | PASS — 與 F001 回應一致 |
| BR-003 | JWT Token 中 role=user 決定前端導向 | PASS — LoginPage 依 role 導向 |
| BR-004 | User 不可存取 Admin 專屬功能 | PASS — RolesGuard 回傳 403 |
| BR-005 | RBAC 前端 + 後端雙層強制執行 | PASS — AdminRoute + RolesGuard |
| BR-006 | User 說明頁面顯示 MVP 限制說明 | PASS — 「目前尚無可用功能，請聯絡您的管理員。」 |

## 測試場景覆蓋對照

| Test Spec ID | 描述 | 實作狀態 | 備註 |
|-------------|------|---------|------|
| TS-F002-001 | User 正確憑證登入 | PASS | E2E + Unit |
| TS-F002-002 | 勾選「記住我」登入 | PASS | E2E + Unit |
| TS-F002-003 | User 存取 Admin 專屬 API | PASS | E2E (403 FORBIDDEN) |
| TS-F002-004 | User 存取多個 Admin 端點 | PARTIAL | MVP 僅一個 Admin 端點 (accounts)，後續功能新增端點時補驗 |
| TS-F002-005 | User 帳號已停用 | PASS | E2E + Unit |
| TS-F002-006 | 錯誤密碼 | PASS | E2E + Unit |
| TS-F002-007 | 未授權存取日誌驗證 | SKIP | MVP 未實作結構化存取日誌，僅有 console.warn 輸出 |

## Git Commits

| Commit | 描述 |
|--------|------|
| `b856ad4` | feat(shared): 新增 FORBIDDEN 錯誤碼與 User 測試種子資料 |
| `c113ab8` | feat(api): 新增 AuthGuard、RolesGuard 與 RBAC 守衛 (F002) |
| `d41ab8b` | feat(web): 新增 User 說明頁面與角色路由守衛 (F002) |
