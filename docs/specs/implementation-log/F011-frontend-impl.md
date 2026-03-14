---
type: implementation-log
feature_id: F011
feature_name: 新增資料來源（前端）
status: complete
last_updated: 2026-03-14
---

# F011: 新增資料來源 — 前端 Implementation Log

## Test Results Summary

| Scenario ID | Description | Status |
|-------------|------------|--------|
| TS-F011-FE-001 | 表單渲染（所有 8 個欄位存在） | PASS |
| TS-F011-FE-002 | Breadcrumb 導航顯示 | PASS |
| TS-F011-FE-003 | 取消與新增按鈕顯示 | PASS |
| TS-F011-FE-004 | 密碼欄位顯示加密儲存提示 | PASS |
| TS-F011-FE-005 | 描述欄位 placeholder 顯示 | PASS |
| TS-F011-FE-006 | Sidebar 資料來源為 active 狀態 | PASS |
| TS-F011-FE-007 | 選擇 MySQL 自動帶入 port 3306 | PASS |
| TS-F011-FE-008 | 選擇 PostgreSQL 自動帶入 port 5432 | PASS |
| TS-F011-FE-009 | 選擇 SQL Server 自動帶入 port 1433 | PASS |
| TS-F011-FE-010 | 空白提交顯示必填欄位錯誤 | PASS |
| TS-F011-FE-011 | 成功提交顯示 Toast 並導向 /datasources | PASS |
| TS-F011-FE-012 | 提交時 API 呼叫帶正確參數 | PASS |
| TS-F011-FE-013 | 提交時按鈕顯示 loading 狀態 | PASS |
| TS-F011-FE-014 | 409 名稱重複顯示 error Toast | PASS |
| TS-F011-FE-015 | 未知錯誤顯示通用 error Toast | PASS |
| TS-F011-FE-016 | 點擊取消導向 /datasources | PASS |
| TS-F011-FE-017 | 密碼可見切換 | PASS |

前端單元測試：17 tests PASS
全套前端測試：189 tests 全數通過（含既有 172 tests）

## Files Changed

| File Path | Change Type | Description |
|-----------|------------|-------------|
| `apps/web/src/api/datasources.ts` | new | createDatasource API 函式 |
| `apps/web/src/pages/datasources/create-datasource-schema.ts` | new | Zod 驗證 Schema（對齊後端 DTO 規則） |
| `apps/web/src/pages/datasources/add-datasource-page.tsx` | new | 新增資料來源頁面（含 Sidebar、Breadcrumb、表單卡片） |
| `apps/web/src/pages/datasources/__tests__/add-datasource-page.test.tsx` | new | 前端單元測試（17 tests） |
| `apps/web/src/components/ui/toast.tsx` | new | Toast 元件（ToastProvider + useToast hook） |
| `apps/web/src/components/ui/password-input.tsx` | modified | 新增 `hint` prop，預設值為「密碼至少 8 個字元」 |
| `apps/web/src/App.tsx` | modified | 新增 `/datasources/new` 路由（AdminRoute） |
| `apps/web/src/main.tsx` | modified | 包裹 ToastProvider |

## Architectural Decisions

1. **Toast 元件自建**：專案無 react-hot-toast 或 sonner 等 toast 套件，建立輕量 ToastProvider + useToast Context Pattern，支援 success/error 兩種類型，3 秒自動消失
2. **PasswordInput hint prop**：將原本硬編碼的「密碼至少 8 個字元」提取為 `hint` prop，保持向後相容（預設值不變），同時讓 datasource 密碼欄位顯示「此密碼將以加密方式儲存」
3. **Port 欄位使用 Controller**：因 port 為 number 類型，需要 `Controller` 元件做型別轉換（string <-> number），避免 Zod 驗證失敗
4. **描述欄位**：使用原生 `<textarea>` 而非 Input 元件，搭配 `htmlFor` + `id` 確保 label 與表單控制項正確關聯
5. **成功後導向 `/datasources`**：使用 `navigate('/datasources', { replace: true })`，若該路由尚未建立則由 App.tsx 的 catch-all 處理
