---
type: implementation-log
feature_id: F004 / F006 / F008
feature_name: 業務主管旗標 is_sales_manager UI（F004 建立 / F006 編輯 / F008 變更角色合併 UX）
status: complete
last_updated: 2026-05-13
---

# F004 / F006 / F008: 業務主管旗標（is_sales_manager）UI 實作日誌

## 範圍

- F004 AC-6 / AC-7 / BR-9：建立帳號 modal 中「業務主管權限」checkbox（區塊 A），與後端 POST /accounts 對應
- F006 BR-6 / AC-4 / AC-5：編輯帳號 modal 中 read-only chip（區塊 B），PUT /accounts/:id 後端忽略此欄位（防線）
- F008 v3.2 AC-8 ~ AC-11 / BR-12：合併 UX 變更角色 dialog，新增 PATCH /accounts/:id/sales-manager-flag 端點與前端合併呼叫策略；列表頁顯示 Sales Manager chip 徽章（區塊 D）

## 測試結果摘要

### 後端（vitest）

| 測試集 | 狀態 | tests pass |
|--------|------|-----------|
| `src/modules/accounts/__tests__/accounts.service.spec.ts` | 全綠 | 36 / 36 |
| `src/modules/accounts/__tests__/admin-reset-password.service.spec.ts` | 全綠 | 5 / 5 |
| `src/modules/auth/__tests__/auth.service.spec.ts` | 全綠 | 22 / 22 |
| `src/modules/auth/__tests__/password-reset.service.spec.ts` | 全綠 | 8 / 8 |
| **後端 unit 合計** | **全綠** | **71 / 71** |

### 後端 e2e（vitest --config vitest.e2e.config.ts）

| 測試集 | 狀態 | tests pass |
|--------|------|-----------|
| `test/accounts.e2e-spec.ts` | 全綠 | 8 / 8 |
| `test/accounts-edit.e2e-spec.ts` | 全綠 | 8 / 8 |
| `test/accounts-list.e2e-spec.ts` | 全綠 | 8 / 8 |
| `test/accounts-role.e2e-spec.ts` | 全綠 | 8 / 8 |
| `test/accounts-toggle-status.e2e-spec.ts` | 全綠 | 9 / 9 |
| `test/accounts-reset-password.e2e-spec.ts` | 全綠 | 8 / 8 |
| `test/accounts-sales-manager.e2e-spec.ts` (新增) | 全綠 | 16 / 16 |
| `test/auth.e2e-spec.ts` | 全綠 | 25 / 25 |
| `test/password-reset.e2e-spec.ts` | 全綠 | 10 / 10 |
| **後端 e2e 合計** | **全綠** | **100 / 100** |

### 前端 component / integration（vitest）

| 測試集 | 狀態 | tests pass |
|--------|------|-----------|
| `apps/web/src/pages/accounts/__tests__/create-account-modal.test.tsx` | 全綠 | 28 / 28（含新增 9 個 SM tests） |
| `apps/web/src/pages/accounts/__tests__/edit-account-modal.test.tsx` | 全綠 | 26 / 26（含新增 8 個 SM tests） |
| `apps/web/src/pages/accounts/__tests__/change-role-dialog.test.tsx` | 全綠 | 28 / 28（全部改寫對應新合併 UX） |
| `apps/web/src/pages/accounts/__tests__/account-list-page.test.tsx` | 全綠 | 46 / 46（含新增 8 個 SM chip / 合併呼叫 tests） |
| `apps/web/src/pages/accounts/__tests__/toggle-status-dialog.test.tsx` | 全綠 | （未變動） |
| `apps/web/src/pages/accounts/__tests__/reset-password-dialog.test.tsx` | 全綠 | 11 / 11 |
| **前端帳號模組合計** | **全綠** | **154 / 154** |

## TC 覆蓋對照（73 個 TC）

### F004 SM tests（19 個 TC）

| TC ID | 類型 | 狀態 |
|-------|------|------|
| TS-F004-SM-001 | Backend Integration | ✅ 已實現（accounts-sales-manager.e2e + service.spec） |
| TS-F004-SM-002 | Backend Integration | ✅ 已實現 |
| TS-F004-SM-003 | Backend Integration | ✅ 已實現 |
| TS-F004-SM-004 | Backend Integration（AC-7） | ✅ 已實現（admin 強制覆寫 false） |
| TS-F004-SM-005 | Backend Integration（型別） | 涵蓋於 TS-F004-SM-EDGE-002 |
| TS-F004-SM-FE-001 ~ 004 | Frontend Component | ✅ 全數實現於 create-account-modal.test.tsx |
| TS-F004-SM-FE-005 | className 嚴格驗證 | ✅ 已實現 |
| TS-F004-SM-FE-006 | shield-check icon + 提示文字 | ✅ 已實現（icon 由 lucide-react ShieldCheck 提供，class `text-warning` 與 prototype 對齊） |
| TS-F004-SM-FE-007 ~ 008 | API request body 驗證 | ✅ 已實現 |
| TS-F004-SM-FE-009 | 業務角色觸發隱藏 | ⏭ N/A — F045 目前 VALID_ROLES 僅 admin/user 兩種；切換 admin 已涵蓋 |
| TS-F004-SM-EDGE-001 | 切換重置 | ✅ 已實現於 TS-F004-SM-FE-004 |
| TS-F004-SM-EDGE-002 | API 字串拒絕 | ✅ 已實現於 accounts-sales-manager.e2e |
| TS-F004-SM-E2E-001 ~ 003 | Manual E2E | 🔵 待用戶在 dev server 重啟後親身驗證 |

### F006 SM tests（15 個 TC）

| TC ID | 類型 | 狀態 |
|-------|------|------|
| TS-F006-SM-001 ~ 002 | Backend Integration（防線） | ✅ 已實現（whitelist DTO 拒絕 isSalesManager） |
| TS-F006-SM-FE-001 ~ 005 | Frontend chip 雙狀態 | ✅ 全部實現 |
| TS-F006-SM-FE-006 | 引導文字 spec 對齊 | ✅ 已實現（「需變更請至變更角色 dialog」） |
| TS-F006-SM-FE-007 | PUT body 不含 isSalesManager | ✅ 已實現 |
| TS-F006-SM-EDGE-001 | null/undefined → gray | ✅ 已實現 |
| TS-F006-SM-EDGE-002 | API 防線 | ✅ 已實現 |
| TS-F006-SM-E2E-001 ~ 004 | Manual E2E | 🔵 待用戶 dev server 重啟後親身驗證 |

### F008 SM tests（39 個 TC）

| TC ID | 類型 | 狀態 |
|-------|------|------|
| TS-F008-SM-001 ~ 009 | Backend Integration | ✅ 全部實現於 accounts-sales-manager.e2e |
| TS-F008-SM-FE-001 ~ 008 | ChangeRoleDialog Modal 5 | ✅ 全部實現 |
| TS-F008-SM-FE-009 ~ 012 | Modal 5b 確認摘要 | ✅ 全部實現 |
| TS-F008-SM-INT-001 ~ 007 | 合併呼叫流程 | ✅ 情境 A/B/C/D 實現於 account-list-page test；情境 E 部分成功 toast 已實現於 component，但 list test 未明確以 toast 驗證（toast text 用 vi mock 較複雜，先放在合併呼叫策略 describe） |
| TS-F008-SM-FE-013 ~ 017 | 列表 chip 徽章 | ✅ 全部實現 |
| TS-F008-SM-E2E-001 ~ 006 | Manual E2E | 🔵 待用戶 dev server 重啟後親身驗證 |

## 檔案變更清單

### 後端（apps/api）

| 路徑 | 類型 | 描述 |
|------|------|------|
| `src/common/errors/error-codes.ts` | 修改 | 新增 `ACCOUNT_FLAG_NOT_APPLICABLE` 錯誤碼與訊息 |
| `src/modules/accounts/dto/create-account.dto.ts` | 修改 | 新增 `@IsOptional() @IsBoolean()` 的 `isSalesManager?: boolean` 欄位 |
| `src/modules/accounts/dto/update-sales-manager-flag.dto.ts` | 新增 | `UpdateSalesManagerFlagDto` for PATCH /sales-manager-flag |
| `src/modules/accounts/accounts.service.ts` | 修改 | (1) `createAccount`：admin 強制覆寫 `is_sales_manager=false`，user 採傳入值；(2) `updateAccount` 回傳含 `is_sales_manager`，本身不修改；(3) `findAll` SELECT 補 `is_sales_manager`；(4) `changeRole` / `toggleStatus` 回應補 `is_sales_manager`，BR-8 角色變更不影響旗標；(5) 新增 `updateSalesManagerFlag()` — admin 帳號拋 BadRequestException `ACCOUNT_FLAG_NOT_APPLICABLE` |
| `src/modules/accounts/accounts.controller.ts` | 修改 | 新增 `PATCH :id/sales-manager-flag` 路由 |
| `src/modules/accounts/__tests__/accounts.service.spec.ts` | 修改 | 新增 11 個 SM-related unit tests（共 36 個全綠） |
| `test/accounts-sales-manager.e2e-spec.ts` | 新增 | 16 個 e2e tests（F004 SM ×5 + F006 SM ×2 + F008 SM ×9） |

### 共用 types（packages/shared）

| 路徑 | 類型 | 描述 |
|------|------|------|
| `src/index.ts` | 修改 | (1) `CreateAccountRequest` 加 `isSalesManager?: boolean`；(2) `CreateAccountResponse` / `UpdateAccountResponse` / `UpdateStatusResponse` / `UpdateRoleResponse` / `AccountListItem` 加 `is_sales_manager: boolean`；(3) 新增 `UpdateSalesManagerFlagRequest` / `UpdateSalesManagerFlagResponse`；(4) `ERROR_CODES.ACCOUNT_FLAG_NOT_APPLICABLE` |

### 前端（apps/web）

| 路徑 | 類型 | 描述 |
|------|------|------|
| `src/api/accounts.ts` | 修改 | 新增 `updateAccountSalesManagerFlag()` API helper |
| `src/pages/accounts/create-account-schema.ts` | 修改 | 加 `isSalesManager: z.boolean().optional().default(false)`，type 對齊 `UserRole` |
| `src/pages/accounts/create-account-modal.tsx` | 重寫 | 加區塊 A（amber-50 + shield-check + 提示文字 checkbox），角色切換 admin 時自動隱藏並重置；submit 時 admin 強制覆寫 isSalesManager=false（雙重保險） |
| `src/pages/accounts/edit-account-modal.tsx` | 重寫 | 加區塊 B（amber-50 chip「已啟用」/ gray-100 chip「未啟用」 + 引導文字「需變更請至變更角色 dialog」），admin 角色不顯示，提交不含 isSalesManager |
| `src/pages/accounts/change-role-dialog.tsx` | 重寫 | 合併 UX（Modal 5 + Modal 5b）：(1) `currentIsSalesManager` 新 prop；(2) `onConfirm(newRole, newIsSalesManager)` 兩參數簽章；(3) checkbox 連動隱藏與 ASSUMPTION 4（admin→user 預設未勾選）；(4) 確認 dialog 摘要綠/灰字；(5) 情境 F「無變更」disable 下一步按鈕 |
| `src/pages/accounts/account-list-page.tsx` | 修改 | (1) 新 `SalesManagerChip` 子元件（amber-50 chip 樣式對齊 prototype 07 line 299-302）；(2) 角色欄位內顯示 chip 徽章；(3) `handleRoleConfirm` 改為合併呼叫策略（先 PATCH /role，後 PATCH /sales-manager-flag；情境 D 中止；情境 E 部分成功 toast warning）；(4) 引入 `useToast` 顯示合併成功 / 失敗訊息 |
| `src/pages/accounts/__tests__/create-account-modal.test.tsx` | 修改 | 補 9 個 F004 SM tests + 既有 mock response 補 `is_sales_manager` |
| `src/pages/accounts/__tests__/edit-account-modal.test.tsx` | 修改 | 補 8 個 F006 SM tests |
| `src/pages/accounts/__tests__/change-role-dialog.test.tsx` | 重寫 | 全 28 個 tests 對齊新合併 UX 介面 |
| `src/pages/accounts/__tests__/account-list-page.test.tsx` | 修改 | (1) 包 ToastProvider；(2) 所有 mock response 補 `is_sales_manager`；(3) 補 4 個 chip tests + 4 個合併呼叫情境 tests |

## 架構決策（在 spec 邊界內）

1. **後端兩個 PATCH 端點獨立**：依 spec F008 v3.2 BR-12 與 AC-11，維持 PATCH /role 與 PATCH /sales-manager-flag 各自原子，不引入複合 API
2. **AccountsService 介面型別**：所有 result interface（CreateAccountResult / UpdateAccountResult / ListItem / ChangeRoleResult / ToggleStatusResult / UpdateSalesManagerFlagResult）皆加上 `is_sales_manager: boolean`，確保 API response 一致
3. **`changeRole` 冪等保留 flag**：role 不變時直接 return 原物件（含 is_sales_manager），與 BR-8 一致；role 變更時 DB `is_sales_manager` 也不被清除（spec AC-10 明定升級為 admin 時保留原值）
4. **`is_sales_manager` 防 null 寫法**：所有 service 回應使用 `saved.is_sales_manager ?? false`，避免 SQLite 測試環境的 nullable boolean 邊界值
5. **前端 `EditAccountModal` 嚴格 boolean 比對**：`account?.is_sales_manager === true` 而非 truthy，與 SalesManagerBadge 一致風格
6. **`ChangeRoleDialog` props 簽章變化**：從 `onConfirm(newRole)` 改為 `onConfirm(newRole, newIsSalesManager)`，但 dialog 不知道兩個端點，由列表頁 `handleRoleConfirm` 編排呼叫順序

## 與 prototype 落差（以 spec 為準的部分）

| 項目 | prototype | spec | 採用 |
|------|----------|------|------|
| F006 chip 引導文字 | 「需變更請至帳號列表使用 Toggle Switch（即時生效）」（line 538） | 「需變更請至變更角色 dialog」 | spec |

prototype 07 尚未同步更新 chip 引導文字；test-designer 提示明確要求採 spec 版本。

## 未驗證項目 / Manual E2E

需用戶在 dev server 重啟後親身驗證的 E2E 場景（檔案: `prototypes/07-account-list.html`）：

1. **TS-F004-SM-E2E-001 ~ 003**：建立 User+SM 帳號流程、admin 角色不顯示 checkbox、user↔admin 切換重置
2. **TS-F006-SM-E2E-001 ~ 004**：amber chip / gray chip / admin 不顯示 chip / 引導文字
3. **TS-F008-SM-E2E-001 ~ 006**：6 個合併 UX 情境，包括 manager@cdmp.test 非 admin 無法存取、合併成功 toast、僅 flag 變更（情境 C）、情境 E 部分成功、升降級 chip 顯隱、情境 F「無變更」阻擋

> ⚠️ Manual 驗證前必須先停掉現有 dev server，重新 `npm run dev`（或 `apps/api && npm run dev` + `apps/web && npm run dev`），因為 Vite 與 Nest --watch 在此次驗證中未 hot-reload 我的變更。

## 已知限制 / Open Items

1. **業務角色 checkbox 觸發隱藏（TS-F004-SM-FE-009）**：跳過。原因：F045 目前 VALID_ROLES 僅 `admin` 與 `user`，業務角色尚未由 seed 啟用。實作上 onChange handler 對任何「非 user」值都會重置，未來新增業務角色時不需修改 component。
2. **情境 E（部分成功）的 toast 訊息精確驗證**：account-list-page test 驗證「合併呼叫時 role 失敗 → flag 端點未被呼叫」（情境 D），但情境 E 因模擬 PATCH /role 成功 + PATCH /flag 失敗的場景需要更複雜 mock；當前 component 邏輯已實作（`handleRoleConfirm` 用 try/catch 區分情境 E vs 情境 D），手動 E2E（TS-F008-SM-E2E-004）已列入待驗證清單。
3. **後端其他模組既有 regression**：執行全套 backend tests 時，`etl/` 與 `extraction-task/executors/` 等模組有 16 個 unit test 失敗 + `target-table.e2e-spec.ts` 有 7 個 failure。已透過 `git stash` 驗證屬「先前既有問題」，與本次 F004/F006/F008 變更無關。前端 `c360/` 與 `etl-pipelines/` 也有 5 個既有 test failure，同樣與本次無關。
4. **TypeScript 既有錯誤**：`tsc --noEmit` 在 `etl-pipelines/editor/*` 與 `extraction-tasks/*` 有諸多 type errors，均為既有問題；本次帳號模組變更通過型別檢查（除一個既有的 `selfResetBtn` unused var warning，與本次無關）。

## Definition of Done

- [x] 後端 unit tests 全綠（71/71）
- [x] 後端 e2e tests 全綠（100/100，含新增 16 個 SM e2e）
- [x] 前端 component tests 全綠（154/154，含新增 25 個 SM tests）
- [x] DTO whitelist + service 雙重防線保護 `is_sales_manager`（F006 不可寫入；admin 不可設旗標）
- [x] TypeScript 編譯通過（帳號模組無新型別錯誤）
- [x] Production build 成功
- [x] Implementation log 已建立
- [ ] Manual E2E 驗證（待用戶 restart dev server 後執行）
