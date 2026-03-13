---
type: implementation-log
feature_id: F008
feature_name: 指派／變更角色
status: complete
last_updated: 2026-03-13
---

# F008: 指派／變更角色 — 實作紀錄

## 測試結果摘要

| Scenario ID | 說明 | 狀態 |
|-------------|------|------|
| TS-F008-001 | User 升級為 Admin → 200, role=admin | PASS |
| TS-F008-002 | Admin 降級為 User（系統有 >= 2 Admin）→ 200, role=user | PASS |
| TS-F008-003 | 最後一位 Admin 保護 → 422, ACCOUNT_LAST_ADMIN | PASS |
| TS-F008-004 | 帳號不存在 → 404, ACCOUNT_NOT_FOUND | PASS |
| TS-F008-005 | 無效角色值 → 422, VALIDATION_ERROR | PASS |
| TS-F008-006 | 冪等操作 — 設定相同角色 → 200, 角色不變 | PASS |

**測試總計**：
- 後端 Unit Tests：6 個（AccountsService.changeRole）
- 後端 E2E Tests：8 個（含 RBAC 權限與 Token 驗證額外場景）
- 前端 Component Tests：14 個（ChangeRoleDialog 元件測試）
- 前端 Integration Tests：5 個（AccountListPage 角色變更整合測試）
- **合計：33 個新增測試，全部通過**

## 回歸測試結果

- 後端全部 Unit Tests：57 passed（6 suites）
- 後端全部 E2E Tests：60 passed（6 suites）
- 前端全部 Tests：138 passed（11 suites）
- TypeScript 編譯：後端與前端均無錯誤
- **無任何回歸失敗**

## 變更檔案清單

| 檔案路徑 | 變更類型 | 說明 |
|----------|----------|------|
| `packages/shared/src/index.ts` | modified | 新增 `UpdateRoleRequest`、`UpdateRoleResponse` 型別；新增 `ACCOUNT_LAST_ADMIN`、`VALIDATION_INVALID_ROLE` 錯誤碼與訊息 |
| `apps/api/src/common/errors/error-codes.ts` | modified | 後端錯誤碼同步新增 `ACCOUNT_LAST_ADMIN`、`VALIDATION_INVALID_ROLE` |
| `apps/api/src/modules/accounts/dto/update-role.dto.ts` | new | 角色變更 DTO，使用 `@IsIn(['admin', 'user'])` 驗證 |
| `apps/api/src/modules/accounts/accounts.service.ts` | modified | 新增 `changeRole` 方法與 `ChangeRoleResult` interface，含最後 Admin 保護邏輯與冪等處理 |
| `apps/api/src/modules/accounts/accounts.controller.ts` | modified | 新增 `PATCH :id/role` endpoint，呼叫 changeRole |
| `apps/api/src/modules/accounts/__tests__/accounts.service.spec.ts` | modified | 新增 6 個 changeRole 單元測試；mock repository 新增 `count` 方法 |
| `apps/api/test/accounts-role.e2e-spec.ts` | new | F008 完整 E2E 測試（8 個測試案例） |
| `apps/web/src/api/accounts.ts` | modified | 新增 `updateAccountRole` API 函式（PATCH /accounts/:id/role） |
| `apps/web/src/pages/accounts/change-role-dialog.tsx` | new | 角色變更確認對話框元件：顯示帳號名稱、目前角色、新角色下拉選單、amber 警告區塊 |
| `apps/web/src/pages/accounts/account-list-page.tsx` | modified | 整合角色變更功能：import ChangeRoleDialog、狀態管理、「變更角色」按鈕綁定事件、掛載對話框 |
| `apps/web/src/pages/accounts/__tests__/change-role-dialog.test.tsx` | new | ChangeRoleDialog 元件測試（14 個測試案例） |
| `apps/web/src/pages/accounts/__tests__/account-list-page.test.tsx` | modified | 新增角色變更整合測試（5 個測試案例）；新增 `mockedUpdateAccountRole` mock |

## 架構決策

1. **HTTP 狀態碼選擇（422 而非 400）**：F008 feature spec 定義 LAST_ADMIN 回傳 400，但 test design 定義 422。依 Source of Truth 優先順序（test design > feature spec），使用 422 `UnprocessableEntityException`，語義上表示「請求格式正確但業務邏輯不允許」。

2. **冪等操作的效能最佳化**：當目標角色與當前角色相同時，直接回傳成功，跳過 Admin 數量計算（`userRepository.count` 不被呼叫），避免不必要的資料庫查詢。

3. **最後 Admin 保護邏輯位置**：僅在「admin → user」降級路徑中執行 `count({where: {role: 'admin'}})` 檢查。「user → admin」升級路徑無需此檢查，減少不必要的資料庫操作。

4. **前端對話框設計**：參照 Prototype 07 的 `changeRoleModal` 結構，包含帳號名稱、目前角色（grid 佈局）、新角色下拉選單、amber 警告區塊。下拉選單預設選中與目前角色相反的選項。

5. **錯誤回應格式一致性**：保持與現有系統一致的 `{error, message}` 扁平結構，而非 error-handling.md 定義的巢狀 `{error: {code, message}}` 結構，因現有所有 Feature（F001-F007）均使用扁平結構。
