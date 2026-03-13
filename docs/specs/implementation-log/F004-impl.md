---
feature_id: F004
feature_name: 建立帳號
status: completed
last_updated: 2026-03-13
---

# F004: 建立帳號 — 實作日誌

## 實作範圍

Admin 透過 `POST /api/v1/accounts` 建立新使用者帳號，前端以 Modal Dialog 形式整合於帳號清單頁面。

## 變更檔案

### Shared（packages/shared）
| 檔案 | 變更 |
|------|------|
| `src/index.ts` | 新增 `CreateAccountRequest`、`CreateAccountResponse` 型別；新增 `ACCOUNT_EMAIL_EXISTS` 錯誤碼與訊息 |

### Backend（apps/api）
| 檔案 | 變更 |
|------|------|
| `src/common/errors/error-codes.ts` | 新增 `ACCOUNT_EMAIL_EXISTS` 錯誤碼與訊息 |
| `src/common/filters/http-exception.filter.ts` | class-validator 驗證錯誤改回傳 HTTP 422（原為 400），符合 error-handling.md 規範 |
| `src/modules/accounts/dto/create-account.dto.ts` | **新建** — 請求驗證 DTO（name、email、password、role） |
| `src/modules/accounts/accounts.service.ts` | **新建** — 建立帳號業務邏輯（email 小寫、重複檢查、bcrypt 雜湊、回應排除 password_hash） |
| `src/modules/accounts/accounts.controller.ts` | 新增 `POST /` 端點，注入 AccountsService |
| `src/modules/accounts/accounts.module.ts` | 註冊 User entity、AccountsService |
| `src/modules/accounts/__tests__/accounts.service.spec.ts` | **新建** — 6 個單元測試 |
| `test/accounts.e2e-spec.ts` | **新建** — 8 個 E2E 整合測試（TS-F004-001 ~ TS-F004-008） |
| `test/auth.e2e-spec.ts` | 更新驗證錯誤預期狀態碼 400 → 422 |

### Frontend（apps/web）
| 檔案 | 變更 |
|------|------|
| `src/components/ui/select.tsx` | **新建** — Select 下拉元件 |
| `src/api/accounts.ts` | **新建** — `createAccount()` API 函式 |
| `src/pages/accounts/create-account-schema.ts` | **新建** — Zod 驗證 schema |
| `src/pages/accounts/create-account-modal.tsx` | **新建** — 建立帳號 Modal（React Hook Form + Zod） |
| `src/pages/accounts/account-list-page.tsx` | **新建** — 帳號清單頁面（含 Sidebar、Header、建立按鈕，表格為 stub） |
| `src/App.tsx` | Admin 預設路由 `/` 改為 AccountListPage |
| `src/pages/accounts/__tests__/create-account-modal.test.tsx` | **新建** — 20 個 Modal 元件測試 |

## 測試結果

| 層級 | 通過 | 總計 |
|------|------|------|
| API 單元測試 | 37 | 37 |
| API E2E 測試 | 27 | 27 |
| Web 前端測試 | 57 | 57 |

## 設計決策

1. **驗證錯誤 HTTP 422**：將 HttpExceptionFilter 中 class-validator 的 BadRequestException 從 400 改為 422，統一符合 error-handling.md 規範
2. **Modal Dialog**：依 UI 原型（07-account-list.html）使用 Modal 而非獨立頁面
3. **帳號清單頁面為 stub**：F004 僅實作建立帳號功能，完整清單表格為 F005 範疇
4. **錯誤回應 flat 格式**：維持 `{error, message}` flat 結構，與現有 codebase 一致
