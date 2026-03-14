---
type: implementation-log
feature_id: F009
feature_name: 自助式密碼重設
status: complete
last_updated: 2026-03-14
---

# F009: 自助式密碼重設 — 實作紀錄

## 測試結果摘要

| Scenario ID | 說明 | 狀態 |
|-------------|------|------|
| TS-F009-001 | 已註冊 Email 發送重設連結 → 200，建立 Token + 寄 Email | PASS |
| TS-F009-002 | 有效 Token 成功重設密碼 → 200，密碼已更新，Token 標記 used_at | PASS |
| TS-F009-003 | 重設後可用新密碼登入 → 200，登入成功 | PASS |
| TS-F009-004 | 未註冊 Email 不揭露帳號存在 → 200（與已註冊回應一致），無 Email 發送 | PASS |
| TS-F009-005 | 過期 Token 重設失敗 → 422，AUTH_RESET_TOKEN_EXPIRED | PASS |
| TS-F009-006 | 已使用 Token 重設失敗 → 422，AUTH_RESET_TOKEN_USED | PASS |
| TS-F009-007 | 無效 Token 格式 → 422，AUTH_RESET_TOKEN_INVALID | PASS |
| TS-F009-008 | 重設後舊 Session Token 失效 → 401，AUTH_TOKEN_REVOKED | PASS |
| TS-F009-009 | 新密碼恰好 8 字元 → 200，重設成功 | PASS |
| TS-F009-010 | 新密碼僅 7 字元 → 422，VALIDATION_ERROR | PASS |

**測試總計**：
- 後端 Unit Tests：8 個（AuthService.forgotPassword + resetPassword）
- 後端 E2E Tests：10 個（全 10 場景覆蓋）
- 前端 Component Tests：19 個（ForgotPasswordPage 10 個 + ResetPasswordPage 9 個）
- **合計：37 個新增測試，全部通過**

## 回歸測試結果

| 測試套件 | 測試數 | 狀態 |
|---------|--------|------|
| 後端 Unit Tests | 65 | 全部通過 |
| 後端 E2E Tests | 70 | 全部通過 |
| 前端 Tests | 157 | 全部通過 |
| **總計** | **292** | **全部通過** |

## 異動檔案

| 檔案路徑 | 異動類型 | 說明 |
|----------|---------|------|
| `apps/api/src/database/entities/password-reset-token.entity.ts` | 新增 | PasswordResetToken Entity（id, user_id, token, expires_at, used_at, created_at） |
| `apps/api/src/database/entities/user.entity.ts` | 修改 | 新增 `password_changed_at` 欄位，供 AuthGuard 判斷密碼變更後 Session 失效 |
| `apps/api/src/common/errors/error-codes.ts` | 修改 | 新增 F009 Error Codes：AUTH_RESET_TOKEN_EXPIRED/USED/INVALID、VALIDATION_PASSWORD_LENGTH、SYSTEM_EMAIL_SEND_FAILED |
| `apps/api/src/common/email/email.util.ts` | 新增 | Email 工具類（Injectable），封裝 SMTP 寄送邏輯，支援 Mock |
| `apps/api/src/common/guards/auth.guard.ts` | 修改 | 新增 password_changed_at 檢查，JWT iat < password_changed_at 時拒絕存取（BR-7） |
| `apps/api/src/modules/auth/dto/forgot-password.dto.ts` | 新增 | ForgotPassword DTO（email 驗證） |
| `apps/api/src/modules/auth/dto/reset-password.dto.ts` | 新增 | ResetPassword DTO（token + newPassword 最少 8 字元） |
| `apps/api/src/modules/auth/auth.service.ts` | 修改 | 新增 forgotPassword()、resetPassword()、revokeAllUserTokens() 方法 |
| `apps/api/src/modules/auth/auth.controller.ts` | 修改 | 新增 POST forgot-password、POST reset-password 路由 |
| `apps/api/src/modules/auth/auth.module.ts` | 修改 | 註冊 PasswordResetToken Entity、EmailUtil Provider |
| `apps/api/src/app.module.ts` | 修改 | 新增 PasswordResetToken 至 Entity 列表 |
| `apps/api/src/modules/auth/__tests__/password-reset.service.spec.ts` | 新增 | 密碼重設 Service 層 Unit Tests（8 個場景） |
| `apps/api/src/modules/auth/__tests__/auth.service.spec.ts` | 修改 | 新增 PasswordResetToken、EmailUtil Mock Provider |
| `apps/api/test/password-reset.e2e-spec.ts` | 新增 | 密碼重設 E2E Tests（10 個場景） |
| `apps/api/test/auth.e2e-spec.ts` | 修改 | 新增 PasswordResetToken Entity 至測試 App |
| `apps/api/test/accounts*.e2e-spec.ts` | 修改 | 新增 PasswordResetToken Entity 至測試 App（5 個檔案） |
| `packages/shared/src/index.ts` | 修改 | 新增 ForgotPasswordRequest/Response、ResetPasswordRequest/Response 型別及錯誤碼 |
| `apps/web/src/api/auth.ts` | 修改 | 新增 forgotPassword()、resetPassword() API Client 函式 |
| `apps/web/src/pages/forgot-password/forgot-password-page.tsx` | 新增 | 忘記密碼頁面（Email 表單 + 成功確認畫面） |
| `apps/web/src/pages/forgot-password/forgot-password-schema.ts` | 新增 | Zod Schema（Email 驗證） |
| `apps/web/src/pages/reset-password/reset-password-page.tsx` | 新增 | 重設密碼頁面（密碼表單 + 成功/過期/無效狀態） |
| `apps/web/src/pages/reset-password/reset-password-schema.ts` | 新增 | Zod Schema（密碼長度 + 確認一致性驗證） |
| `apps/web/src/pages/forgot-password/__tests__/forgot-password-page.test.tsx` | 新增 | ForgotPasswordPage 元件測試（10 個） |
| `apps/web/src/pages/reset-password/__tests__/reset-password-page.test.tsx` | 新增 | ResetPasswordPage 元件測試（9 個） |
| `apps/web/src/App.tsx` | 修改 | 新增 /forgot-password、/reset-password 路由 |

## 架構決策

### BR-7 Session 失效機制
- 採用 `password_changed_at` 欄位方案，而非逐一追蹤 active sessions
- 在 User Entity 新增 `password_changed_at` nullable 欄位
- 密碼重設時設定 `password_changed_at = Date.now() + 1000`（加 1 秒避免同秒 JWT iat 比較問題）
- AuthGuard 比對 JWT `iat * 1000 < password_changed_at`，若成立則視為 Token 已失效
- 此方案無需維護 active session 清單，且每次密碼變更自動失效所有舊 Session

### Email 非同步寄送
- `forgotPassword()` 中 Email 寄送為 fire-and-forget（`.catch()` 靜默處理）
- API 在 Email 寄出前即回應成功訊息（符合架構規格 5.3）
- EmailUtil 為 Injectable，測試中可 Mock

### 防列舉攻擊
- 無論 Email 是否註冊，API 回應完全一致（HTTP 200 + 相同訊息）
- 未註冊 Email 不建立 Token、不寄送 Email

### 密碼驗證 Defense in Depth
- DTO 層：class-validator `@MinLength(8)` 由 ValidationPipe 處理
- Service 層：額外檢查 `newPassword.length < 8`，避免繞過 DTO 的直接呼叫

## 與既有規格的差異說明

- **HTTP 狀態碼**：F009 Feature Spec 原定 Token 錯誤使用 400，但 Test Design 明確指定 422（符合 error-handling.md 的 422 Unprocessable Entity 定義），本次實作依照 Test Design 使用 422
- **錯誤碼**：Feature Spec 使用 `INVALID_OR_EXPIRED_TOKEN` 單一錯誤碼，但 error-handling.md 與 Test Design 區分 `AUTH_RESET_TOKEN_EXPIRED`、`AUTH_RESET_TOKEN_USED`、`AUTH_RESET_TOKEN_INVALID` 三種錯誤碼，本次實作依照 Test Design 區分處理
