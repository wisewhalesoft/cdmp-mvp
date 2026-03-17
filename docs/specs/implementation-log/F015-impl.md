---
type: implementation-log
feature_id: F015
feature_name: 測試資料來源連線
status: complete
last_updated: 2026-03-17
---

# F015: 測試資料來源連線 — 實作紀錄

## 測試結果摘要

### 後端單元測試（datasource.service.spec.ts）

| Scenario ID | 描述 | 狀態 |
|-------------|------|------|
| TS-F015-U01 | MySQL 連線成功回傳 success=true | PASS |
| TS-F015-U02 | PostgreSQL 連線成功回傳 success=true | PASS |
| TS-F015-U03 | 成功時寫入 Health Log（使用 transaction） | PASS |
| TS-F015-U04 | 成功時更新 status 為 connected | PASS |
| TS-F015-U05 | 主機不可達回傳失敗 | PASS |
| TS-F015-U06 | 帳號密碼錯誤回傳失敗 | PASS |
| TS-F015-U07 | 連線逾時回傳失敗 | PASS |
| TS-F015-U08 | 資料來源不存在拋出 NotFoundException | PASS |
| TS-F015-U09 | 資料庫不存在回傳失敗 | PASS |
| TS-F015-U10 | 失敗時更新 status 為 disconnected | PASS |
| TS-F015-U11 | 測試前解密密碼 | PASS |
| TS-F015-U12 | Health Log 不包含解密後的密碼 | PASS |

### 後端 E2E 測試（datasource.e2e-spec.ts）

| Scenario ID | 描述 | 狀態 |
|-------------|------|------|
| TS-F015-001 | POST :id/test 連線成功回 200 + success=true | PASS |
| TS-F015-002 | 成功後 status 更新為 connected | PASS |
| TS-F015-003 | 連線失敗回 200 + success=false | PASS |
| TS-F015-004 | 失敗後 status 更新為 disconnected | PASS |
| TS-F015-005 | 寫入 DatasourceHealthLog（成功） | PASS |
| TS-F015-006 | 寫入 DatasourceHealthLog（失敗含 error_message） | PASS |
| TS-F015-007 | 資料來源不存在回 404 | PASS |
| TS-F015-008 | 非 Admin 回 403 | PASS |
| TS-F015-009 | 未登入回 401 | PASS |

### 前端測試（datasource-list-page.test.tsx — F015 區塊）

| Scenario ID | 描述 | 狀態 |
|-------------|------|------|
| FE-F015-01 | 清單列表有可點擊的「測試連線」按鈕 | PASS |
| FE-F015-02 | 卡片視圖有可點擊的「測試連線」按鈕 | PASS |
| FE-F015-03 | 點擊呼叫 testDatasourceConnection API | PASS |
| FE-F015-04 | 測試中顯示「測試中...」loading 狀態 | PASS |
| FE-F015-05 | 成功顯示綠色 Toast | PASS |
| FE-F015-06 | 失敗顯示紅色 Toast | PASS |
| FE-F015-07 | 逾時顯示橘色 Toast | PASS |
| FE-F015-08 | API 錯誤顯示通用錯誤 Toast | PASS |

### 前端測試（edit-datasource-page.test.tsx — F015 區塊）

| Scenario ID | 描述 | 狀態 |
|-------------|------|------|
| FE-F015-E01 | 按鈕列顯示可用的「測試連線」按鈕（非 disabled） | PASS |
| FE-F015-E02 | 點擊測試連線成功後顯示成功 Toast | PASS |
| FE-F015-E03 | 點擊測試連線失敗後顯示錯誤 Toast | PASS |
| FE-F015-E04 | 測試中顯示「測試中...」且按鈕 disabled | PASS |
| FE-F015-E05 | API 錯誤時顯示通用錯誤 Toast | PASS |

## 變更檔案

| 檔案路徑 | 變更類型 | 描述 |
|----------|---------|------|
| apps/api/src/database/entities/datasource-health-log.entity.ts | new | DatasourceHealthLog Entity，記錄連線測試歷史 |
| apps/api/src/modules/datasource/connection-tester.provider.ts | new | ConnectionTesterProvider，可注入的 DB 連線測試服務 |
| apps/api/src/modules/datasource/datasource.module.ts | modified | 註冊 DatasourceHealthLog Entity 和 ConnectionTesterProvider |
| apps/api/src/modules/datasource/datasource.service.ts | modified | 新增 testConnection() 方法 |
| apps/api/src/modules/datasource/datasource.controller.ts | modified | 新增 POST :id/test 路由 |
| apps/api/src/common/errors/error-codes.ts | modified | 新增連線測試相關錯誤碼 |
| packages/shared/src/index.ts | modified | 新增 TestConnectionResponse interface 和連線錯誤碼 |
| apps/api/src/modules/datasource/datasource.service.spec.ts | modified | 新增 12 個 testConnection 單元測試 |
| apps/api/test/datasource.e2e-spec.ts | modified | 新增 9 個 F015 E2E 測試 |
| apps/web/src/api/datasources.ts | modified | 新增 testDatasourceConnection() API 函式 |
| apps/web/src/components/ui/toast.tsx | modified | 新增 warning 類型 Toast（橘色背景） |
| apps/web/src/pages/datasources/datasource-list-page.tsx | modified | 「測試連線」按鈕從 disabled span 改為可用 button，含 loading/Toast |
| apps/web/src/pages/datasources/edit-datasource-page.tsx | modified | 「測試連線」按鈕從 disabled 改為可用，含 loading/Toast |
| apps/web/src/pages/datasources/__tests__/datasource-list-page.test.tsx | modified | 新增 8 個測試連線前端測試，加入 ToastProvider wrapper |
| apps/web/src/pages/datasources/__tests__/edit-datasource-page.test.tsx | modified | 新增 5 個測試連線前端測試，更新按鈕列測試 |

## 架構決策

1. **ConnectionTesterProvider 依賴注入模式** — 將實際 DB 連線邏輯封裝在獨立的 Provider 中，使用 `CONNECTION_TESTER` injection token，E2E 測試可透過 `overrideProvider()` 注入 mock，避免實際連接外部資料庫。

2. **HTTP 200 統一回應** — 連線成功/失敗均回 HTTP 200，使用 `success` 欄位區分結果。僅在資料來源不存在（404）、未授權（401）、無權限（403）時回對應 HTTP 狀態碼。

3. **Transaction 保證一致性** — Datasource status/lastTestedAt 更新與 DatasourceHealthLog 寫入在同一個 transaction 內完成。

4. **Toast 色彩語義** — success=綠色（bg-green-600）、error=紅色（bg-red-600）、warning=橘色（bg-orange-500，用於逾時場景）。

5. **密碼安全性** — 解密後的密碼僅傳入 ConnectionTester，不寫入 Health Log 的 error_message 欄位。

## 測試總數

| 範圍 | 測試數 |
|------|--------|
| 後端單元測試 | 107（含 F015 新增 12） |
| 後端 E2E 測試 | 129（含 F015 新增 9） |
| 前端測試 | 240（含 F015 新增 13） |
| **總計** | **476** |
