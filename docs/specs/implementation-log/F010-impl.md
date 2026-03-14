---
type: implementation-log
feature_id: F010
feature_name: Admin 重設使用者密碼
status: complete
last_updated: 2026-03-14
---

# F010: Admin 重設使用者密碼 — 實作紀錄

## 測試結果摘要

| Scenario ID | 說明 | 狀態 |
|-------------|------|------|
| TS-F010-001 | 成功重設密碼，可用新密碼登入 | PASS |
| TS-F010-002 | 重設後舊 Token 失效 | PASS |
| TS-F010-003 | 不可重設自己密碼 → 422 ACCOUNT_SELF_RESET | PASS |
| TS-F010-004 | 帳號不存在 → 404 ACCOUNT_NOT_FOUND | PASS |
| TS-F010-005 | 密碼不足 8 字元 → 422 VALIDATION_PASSWORD_LENGTH | PASS |
| TS-F010-006 | 密碼恰好 8 字元（邊界值）→ 200 成功 | PASS |

**測試總計**：
- 後端 Unit Tests：5 個（AccountsService.adminResetPassword）
- 後端 E2E Tests：8 個（6 場景 + 2 額外安全性測試）
- 前端 Component Tests：11 個（ResetPasswordDialog）
- 前端 Integration Tests：4 個（AccountListPage 重設密碼整合）
- **合計：28 個新增測試，全部通過**

## 回歸測試結果

| 測試套件 | 測試數 | 狀態 |
|---------|--------|------|
| 後端 Unit Tests | 70 | 全部通過 |
| 後端 E2E Tests | 78 | 全部通過 |
| 前端 Tests | 172 | 全部通過 |
| **總計** | **320** | **全部通過** |

## 異動檔案

| 檔案路徑 | 異動類型 | 說明 |
|----------|---------|------|
| `packages/shared/src/index.ts` | 修改 | 新增 AdminResetPasswordRequest/Response 型別 + ACCOUNT_SELF_RESET 錯誤碼 |
| `apps/api/src/common/errors/error-codes.ts` | 修改 | 新增 ACCOUNT_SELF_RESET 錯誤碼與訊息 |
| `apps/api/src/database/entities/user.entity.ts` | 修改 | password_changed_at 欄位型別從 timestamp 改為 datetime（SQLite 相容性） |
| `apps/api/src/database/entities/password-reset-token.entity.ts` | 修改 | used_at 欄位型別從 timestamp 改為 datetime（SQLite 相容性） |
| `apps/api/src/modules/accounts/dto/admin-reset-password.dto.ts` | 新增 | AdminResetPasswordDto（newPassword, @MinLength(8)） |
| `apps/api/src/modules/accounts/accounts.service.ts` | 修改 | 新增 adminResetPassword() 方法 |
| `apps/api/src/modules/accounts/accounts.controller.ts` | 修改 | 新增 POST :id/reset-password 路由 |
| `apps/api/src/modules/accounts/__tests__/admin-reset-password.service.spec.ts` | 新增 | Service 層 Unit Tests（5 個場景） |
| `apps/api/test/accounts-reset-password.e2e-spec.ts` | 新增 | E2E Tests（8 個場景） |
| `apps/web/src/api/accounts.ts` | 修改 | 新增 adminResetPassword() API Client 函式 |
| `apps/web/src/pages/accounts/reset-password-schema.ts` | 新增 | Zod Schema（密碼長度 + 確認一致性） |
| `apps/web/src/pages/accounts/reset-password-dialog.tsx` | 新增 | ResetPasswordDialog 元件（Modal） |
| `apps/web/src/pages/accounts/__tests__/reset-password-dialog.test.tsx` | 新增 | Dialog 元件測試（11 個） |
| `apps/web/src/pages/accounts/__tests__/account-list-page.test.tsx` | 修改 | 新增 F010 整合測試（4 個場景） |
| `apps/web/src/pages/accounts/account-list-page.tsx` | 修改 | 整合 ResetPasswordDialog，自我重設按鈕 disabled |

## 架構決策

### Session 失效機制
- 沿用 F009 的 `password_changed_at` 方案
- Admin 重設密碼時更新目標使用者的 `password_changed_at = Date.now() + 1000`
- AuthGuard 已有比對邏輯（JWT iat < password_changed_at 時拒絕存取），無需額外實作

### Service 歸屬
- `adminResetPassword` 方法放在 Account 模組（非 Auth 模組）
- 理由：此為帳號管理操作，由 Admin 透過帳號管理頁面執行
- Auth 模組的 `resetPassword` 為自助式密碼重設（F009），兩者為完全獨立流程

### SQLite 相容性修復
- 將 User.password_changed_at 和 PasswordResetToken.used_at 從 `timestamp` 改為 `datetime`
- 原因：better-sqlite3 不支援 `timestamp` 型別，改用 `datetime` 兼容 PostgreSQL 和 SQLite
- 此修復同時改善了所有既有 E2E 測試的相容性

### 前端自我重設防護
- 採用 disabled 按鈕方案（非 Dialog 內提示）
- 自己的帳號「重設密碼」按鈕設為 `disabled`，附帶 title 提示
- 後端仍有 defense in depth 檢查（422 ACCOUNT_SELF_RESET）

## 與既有規格的差異說明

- **HTTP 狀態碼**：F010 Feature Spec 原定自我重設使用 400，但 Test Design 和 error-handling.md 統一使用 422。本次實作依照 Test Design 使用 422。
- **錯誤碼**：Feature Spec 使用 `SELF_RESET_NOT_ALLOWED`，但 error-handling.md 使用 `ACCOUNT_SELF_RESET`。本次實作依照 error-handling.md（Source of Truth 優先級更高）。
- **確認按鈕樣式**：使用 `variant="danger"`（紅色），與原型 07-account-list.html 的 Modal 6 設計一致。
