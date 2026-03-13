---
type: implementation-log
feature_id: F001
feature_name: Admin 登入（前端）
status: complete
last_updated: 2026-03-13
---

# F001: Admin 登入（前端）— 實作日誌

## 測試結果摘要

| Scenario ID | 描述 | 狀態 |
|-------------|------|------|
| TS-F001-FE-001 | Button 渲染文字 | PASS |
| TS-F001-FE-002 | Button 點擊觸發 onClick | PASS |
| TS-F001-FE-003 | Button disabled 狀態不可點擊 | PASS |
| TS-F001-FE-004 | Button loading 狀態顯示 loading 文字且 disabled | PASS |
| TS-F001-FE-005 | Input 渲染帶 label 的輸入欄 | PASS |
| TS-F001-FE-006 | Input 可以輸入文字 | PASS |
| TS-F001-FE-007 | Input error 狀態顯示紅色邊框和錯誤訊息 | PASS |
| TS-F001-FE-008 | PasswordInput 預設為密碼遮罩模式 | PASS |
| TS-F001-FE-009 | PasswordInput 點擊眼睛圖示切換為可見 | PASS |
| TS-F001-FE-010 | PasswordInput 再次點擊眼睛圖示切換回遮罩 | PASS |
| TS-F001-FE-011 | LoginPage 渲染 Email 輸入欄 | PASS |
| TS-F001-FE-012 | LoginPage 渲染密碼輸入欄 | PASS |
| TS-F001-FE-013 | LoginPage 渲染「記住我」checkbox | PASS |
| TS-F001-FE-014 | LoginPage 渲染「登入」按鈕 | PASS |
| TS-F001-FE-015 | LoginPage 渲染「忘記密碼？」連結 | PASS |
| TS-F001-FE-016 | Email 空白提交顯示錯誤訊息 | PASS |
| TS-F001-FE-017 | Email 格式錯誤顯示錯誤訊息 | PASS |
| TS-F001-FE-018 | 密碼空白提交顯示錯誤訊息 | PASS |
| TS-F001-FE-019 | 送出後按鈕顯示 loading 狀態 | PASS |
| TS-F001-FE-020 | 後端 401 清空密碼欄並顯示錯誤 | PASS |
| TS-F001-FE-021 | 後端 403 顯示帳號停用訊息 | PASS |
| TS-F001-FE-022 | 後端 429 顯示 rate limit 訊息 | PASS |
| TS-F001-FE-023 | 密碼欄位眼睛圖示切換可見/隱藏 | PASS |

**共 23 個測試全部通過。**

## 變更檔案

| 檔案路徑 | 變更類型 | 描述 |
|----------|---------|------|
| apps/web/src/index.css | new | Tailwind CSS directives |
| apps/web/src/main.tsx | new | React 入口，BrowserRouter |
| apps/web/src/App.tsx | new | Routes 定義（/login） |
| apps/web/src/api/client.ts | new | Axios instance，Bearer token interceptor |
| apps/web/src/api/auth.ts | new | login API 函式 |
| apps/web/src/stores/auth-store.ts | new | Auth state 管理（localStorage） |
| apps/web/src/router/protected-route.tsx | new | JWT 守護路由元件 |
| apps/web/src/components/ui/button.tsx | new | Button 元件（primary/secondary/danger variants, loading 狀態） |
| apps/web/src/components/ui/input.tsx | new | Input 元件（label, error 紅框） |
| apps/web/src/components/ui/password-input.tsx | new | PasswordInput 元件（眼睛圖示切換, 8 字元提示） |
| apps/web/src/components/ui/checkbox.tsx | new | Checkbox 元件 |
| apps/web/src/components/ui/alert.tsx | new | Alert 元件（error variant） |
| apps/web/src/pages/login/login-schema.ts | new | Zod 驗證 schema（email + password） |
| apps/web/src/pages/login/login-page.tsx | new | 登入頁面（表單 + 錯誤處理 + 導航） |
| apps/web/src/components/ui/__tests__/button.test.tsx | new | Button 元件測試（4 tests） |
| apps/web/src/components/ui/__tests__/input.test.tsx | new | Input 元件測試（3 tests） |
| apps/web/src/components/ui/__tests__/password-input.test.tsx | new | PasswordInput 元件測試（3 tests） |
| apps/web/src/pages/login/__tests__/login-page.test.tsx | new | LoginPage 測試（13 tests） |

## 架構決策

- 使用 `react-hook-form` + `@hookform/resolvers` + `zod` 作為表單驗證方案
- Auth state 採用簡單的 localStorage 存取函式（未使用 Context/zustand），因目前僅需 token 持久化
- UI 元件使用 `forwardRef` 以支援 react-hook-form 的 `register()` 綁定
- PasswordInput 內部管理 visible state，獨立於父層表單
- API 錯誤透過 HTTP status code 判斷（401/403/429），不依賴 response body 中的 error code
- 密碼欄位 8 字元提示為靜態文字，不做 real-time 驗證（依規格要求）
