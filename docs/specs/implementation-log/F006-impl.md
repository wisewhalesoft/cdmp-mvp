---
type: implementation-log
feature_id: F006
feature_name: 編輯帳號
status: complete
last_updated: 2026-03-13
---

# F006: 編輯帳號 — 實作紀錄

## 測試結果摘要

| Scenario ID | 說明 | 狀態 |
|-------------|------|------|
| TS-F006-001 | 成功修改姓名 | PASS |
| TS-F006-002 | 成功修改 Email（轉小寫） | PASS |
| TS-F006-003 | Email 保留原值不觸發重複錯誤（自身排除 BR-3） | PASS |
| TS-F006-004 | Email 與其他帳號重複 → 409 ACCOUNT_EMAIL_IN_USE | PASS |
| TS-F006-005 | 帳號不存在 → 404 ACCOUNT_NOT_FOUND | PASS |
| TS-F006-006 | 非 Admin 編輯帳號 → 403 AUTH_FORBIDDEN | PASS |
| TS-F006-007 | 空姓名 → 422 VALIDATION_ERROR | PASS |
| TS-F006-008 | 姓名 100 字元（最大長度邊界） | PASS |

**測試總計**：
- 後端 Unit Tests：7 個（updateAccount service 測試）
- 後端 E2E Tests：8 個（完整 HTTP 端點測試）
- 前端 Component Tests：18 個（EditAccountModal 元件測試）
- 前端 Integration Tests：2 個（AccountListPage 編輯整合測試）
- **合計：35 個新增測試，全部通過**

## 變更檔案清單

| 檔案路徑 | 變更類型 | 說明 |
|----------|----------|------|
| `packages/shared/src/index.ts` | modified | 新增 `UpdateAccountRequest`、`UpdateAccountResponse` 型別，新增 `ACCOUNT_EMAIL_IN_USE`、`ACCOUNT_NOT_FOUND` 錯誤碼與訊息 |
| `apps/api/src/common/errors/error-codes.ts` | modified | 後端錯誤碼同步新增 `ACCOUNT_EMAIL_IN_USE`、`ACCOUNT_NOT_FOUND` |
| `apps/api/src/modules/accounts/dto/update-account.dto.ts` | new | 更新帳號 DTO，含 name（必填、最長 100 字元）和 email（必填、合法格式）驗證 |
| `apps/api/src/modules/accounts/accounts.service.ts` | modified | 新增 `updateAccount` 方法與 `UpdateAccountResult` 介面 |
| `apps/api/src/modules/accounts/accounts.controller.ts` | modified | 新增 `PUT :id` 端點 |
| `apps/api/src/modules/accounts/__tests__/accounts.service.spec.ts` | modified | 新增 7 個 updateAccount 單元測試 |
| `apps/api/test/accounts-edit.e2e-spec.ts` | new | F006 E2E 整合測試（8 個場景） |
| `apps/web/src/api/accounts.ts` | modified | 新增 `updateAccount` API 函式 |
| `apps/web/src/pages/accounts/edit-account-schema.ts` | new | 編輯帳號 Zod 驗證 schema |
| `apps/web/src/pages/accounts/edit-account-modal.tsx` | new | 編輯帳號 Modal Dialog 元件 |
| `apps/web/src/pages/accounts/account-list-page.tsx` | modified | 整合 EditAccountModal，「編輯」按鈕接入實際功能 |
| `apps/web/src/pages/accounts/__tests__/edit-account-modal.test.tsx` | new | EditAccountModal 元件測試（18 個） |
| `apps/web/src/pages/accounts/__tests__/account-list-page.test.tsx` | modified | 新增 2 個編輯整合測試 |

## 架構決策

1. **Optimistic Locking 暫不實作**：F006 spec BR-7 建議使用 Optimistic Locking 防止並發編輯衝突，但 F006 test-design 未包含並發衝突的測試場景。依照 test-design 優先原則，本次未實作。若後續有需求，可在 User entity 加入 `@VersionColumn()` 裝飾器。

2. **錯誤碼區分**：建立帳號的 Email 重複使用 `ACCOUNT_EMAIL_EXISTS`（409），編輯帳號的 Email 重複使用 `ACCOUNT_EMAIL_IN_USE`（409），兩者訊息不同（「此 Email 已有帳號存在」vs「此 Email 已被使用」），符合 error-handling.md 定義。

3. **Email 自身排除邏輯（BR-3）**：在 service 層實作，查詢 email 唯一性時比對 `existing.id !== id`，確保帳號保留原 Email 時不觸發重複錯誤。

4. **HTTP 狀態碼**：F006 spec 原始定義 400 作為驗證失敗碼，但 error-handling.md 和 test-design 統一使用 422。實際實作依循 HttpExceptionFilter 將 class-validator 的 BadRequestException 轉為 422。

## 回歸測試結果

- 後端全部 Unit Tests：44 passed（含原有 37 + 新增 7）
- 後端全部 E2E Tests：43 passed（含原有 35 + 新增 8）
- 前端全部帳號相關 Tests：60 passed（含原有 40 + 新增 20）
- **無任何回歸失敗**
