---
type: implementation-log
feature_id: F007
feature_name: 停用／啟用帳號
status: complete
last_updated: 2026-03-13
---

# F007: 停用／啟用帳號 — 實作紀錄

## 測試結果摘要

| Scenario ID | 說明 | 狀態 |
|-------------|------|------|
| TS-F007-001 | 成功停用帳號 → 200, status=disabled | PASS |
| TS-F007-002 | 停用後 Token 失效 → 401 AUTH_TOKEN_REVOKED | PASS |
| TS-F007-003 | 停用後無法登入 → 403 AUTH_ACCOUNT_DISABLED | PASS |
| TS-F007-004 | 成功啟用帳號 → 200, status=active | PASS |
| TS-F007-005 | 防止自我停用 → 422 ACCOUNT_SELF_DISABLE | PASS |
| TS-F007-006 | 帳號不存在 → 404 ACCOUNT_NOT_FOUND | PASS |
| TS-F007-007 | 冪等操作 — 停用已停用帳號 → 200 | PASS |

**測試總計**：
- 後端 Unit Tests：7 個（accounts.service toggleStatus 5 個 + auth.guard 停用檢查 2 個）
- 後端 E2E Tests：9 個（完整 HTTP 端點測試，含額外的權限與驗證場景）
- 前端 Component Tests：15 個（ToggleStatusDialog 元件測試）
- 前端 Integration Tests：7 個（AccountListPage 停用/啟用整合測試）
- **合計：38 個新增測試，全部通過**

## 變更檔案清單

| 檔案路徑 | 變更類型 | 說明 |
|----------|----------|------|
| `packages/shared/src/index.ts` | modified | 新增 `UpdateAccountStatusRequest`、`UpdateAccountStatusResponse` 型別，新增 `ACCOUNT_SELF_DISABLE`、`AUTH_ACCOUNT_DISABLED`、`AUTH_TOKEN_REVOKED` 錯誤碼與訊息 |
| `apps/api/src/common/errors/error-codes.ts` | modified | 後端錯誤碼同步新增 `ACCOUNT_SELF_DISABLE`、`AUTH_ACCOUNT_DISABLED`、`AUTH_TOKEN_REVOKED` |
| `apps/api/src/modules/accounts/accounts.service.ts` | modified | 新增 `toggleStatus` 方法，含自我停用檢查、帳號存在檢查、冪等處理 |
| `apps/api/src/modules/accounts/accounts.controller.ts` | modified | 新增 `PATCH :id/status` endpoint，呼叫 toggleStatus 並傳入 currentUserId |
| `apps/api/src/common/guards/auth.guard.ts` | modified | 新增 User repository 注入，在 blocklist 檢查後加入帳號停用狀態檢查 |
| `apps/api/src/modules/accounts/__tests__/accounts.service.spec.ts` | modified | 新增 5 個 toggleStatus 單元測試 |
| `apps/api/src/common/__tests__/auth.guard.spec.ts` | modified | 新增 mockUserRepository，補充停用帳號及使用者不存在的單元測試（2 個） |
| `apps/api/test/accounts-toggle-status.e2e-spec.ts` | new | F007 完整 E2E 測試（9 個測試案例） |
| `apps/web/src/api/accounts.ts` | modified | 新增 `updateAccountStatus` API 函式（PATCH /accounts/:id/status） |
| `apps/web/src/pages/accounts/toggle-status-dialog.tsx` | new | 停用/啟用確認對話框元件，支援 disable/enable 兩種模式 |
| `apps/web/src/pages/accounts/account-list-page.tsx` | modified | 整合停用/啟用功能：動態按鈕渲染、自我停用防護、確認對話框 |
| `apps/web/src/pages/accounts/__tests__/toggle-status-dialog.test.tsx` | new | ToggleStatusDialog 元件測試（15 個測試案例） |
| `apps/web/src/pages/accounts/__tests__/account-list-page.test.tsx` | modified | 新增停用/啟用整合測試（7 個測試案例） |

## 架構決策

1. **AuthGuard 停用帳號檢查（方案 B — Session Invalidation）**：在 AuthGuard 中注入 User repository，於 blocklist 檢查之後、設定 `request.user` 之前，查詢帳號狀態。已停用帳號的所有 Token 立即失效，回傳 401 `AUTH_TOKEN_REVOKED`，避免向被停用使用者洩漏帳號狀態資訊。

2. **啟用確認對話框（依循 Prototype 設計）**：啟用操作同樣彈出確認對話框，與 Prototype 07 設計一致。雖然 BR-4 僅提及停用需確認，但依據 Source of Truth 優先順序，UI/UX 設計覆蓋了此細節。

3. **自我停用回傳 422 UnprocessableEntityException**：使用 HTTP 422 而非 400 或 403，語義上表示「請求格式正確但業務邏輯不允許」，錯誤碼為 `ACCOUNT_SELF_DISABLE`。

4. **冪等操作**：對已停用帳號再次停用、對已啟用帳號再次啟用，均回傳 200 且不拋錯，符合 BR-7 冪等性要求。

5. **前端色彩設計**：停用按鈕使用 `text-warning`（amber）、啟用按鈕使用 `text-success`（green），對應 Prototype 07 設計。自我停用防護以 `disabled` 狀態呈現並附帶 `title` 提示。

## 回歸測試結果

- 後端全部 Unit Tests：51 passed（6 suites）
- 後端全部 E2E Tests：52 passed（5 suites）
- 前端全部 Tests：119 passed（10 suites）
- TypeScript 編譯：後端與前端均無錯誤
- **無任何回歸失敗**
