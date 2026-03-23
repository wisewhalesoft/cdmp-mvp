---
type: implementation-log
feature_id: F032
feature_name: 查看 Pipeline 日誌
status: complete
last_updated: 2026-03-23
---

# F032: 查看 Pipeline 日誌 -- 實作紀錄

## 測試結果摘要

### 後端 E2E 測試（21 個場景全部通過）

| Scenario ID | 說明 | 狀態 |
|-------------|------|------|
| TS-F032-001 | 日誌列表欄位完整性驗證 | PASS |
| TS-F032-002 | 日誌列表依 startedAt 降序排列 | PASS |
| TS-F032-003 | 日誌列表含 pagination 物件 | PASS |
| TS-F032-004 | 日誌詳情頂層欄位完整性 | PASS |
| TS-F032-005 | 日誌詳情 nodeLogs 陣列欄位驗證 | PASS |
| TS-F032-006 | 日誌詳情 nodeLogs 節點類型正確對應 | PASS |
| TS-F032-007 | 日誌列表中測試執行標記為 isTestRun=true | PASS |
| TS-F032-008 | 日誌詳情中測試執行 isTestRun=true | PASS |
| TS-F032-009 | 失敗日誌頂層 errorMessage 非空 | PASS |
| TS-F032-010 | 失敗節點 errorMessage 非空，成功節點為 null | PASS |
| TS-F032-011 | 執行中日誌 finishedAt=null、durationMs=null | PASS |
| TS-F032-012 | 分頁：第 1 頁 10 筆 | PASS |
| TS-F032-013 | 分頁：最後一頁 5 筆 | PASS |
| TS-F032-014 | 無執行紀錄時回傳空陣列 | PASS |
| TS-F032-015 | 軟刪除 Pipeline 後日誌列表仍可存取 | PASS |
| TS-F032-016 | 軟刪除 Pipeline 後個別日誌詳情仍可存取 | PASS |
| TS-F032-017 | Pipeline 不存在 -> 日誌列表 404 | PASS |
| TS-F032-018 | Log 不存在 -> 日誌詳情 404 | PASS |
| TS-F032-019 | User 角色無權查看日誌列表 -> 403 | PASS |
| TS-F032-020 | User 角色無權查看日誌詳情 -> 403 | PASS |
| TS-F032-021 | 未登入無 Token -> 401 | PASS |

### 前端測試（16 個場景全部通過）

| Scenario ID | 說明 | 狀態 |
|-------------|------|------|
| FE-001 | 日誌列表顯示所有必要欄位 | PASS |
| FE-002 | 狀態 Badge 正確顯示（completed / failed / running） | PASS |
| FE-003 | 觸發方式 Badge 正確顯示（schedule / manual / test） | PASS |
| FE-004 | 測試執行標記顯示「測試」標籤 | PASS |
| FE-005 | Running 日誌行淡藍背景（bg-blue-50/30） | PASS |
| FE-006 | Running 日誌處理筆數與耗時顯示 '-' | PASS |
| FE-007 | 空狀態顯示「尚無執行紀錄」 | PASS |
| FE-008 | 點擊日誌行開啟 Drawer | PASS |
| FE-009 | Drawer 顯示節點類型顏色標記（Extract=藍/Transform=橘/Load=綠） | PASS |
| FE-010 | 失敗日誌 Drawer 顯示錯誤訊息 | PASS |
| FE-011 | 失敗日誌 Drawer 顯示「重新執行」按鈕 | PASS |
| FE-012 | 點擊「重新執行」呼叫 executePipeline API | PASS |
| FE-013 | Running Drawer 顯示進度資訊 | PASS |
| FE-014 | 分頁資訊顯示正確 | PASS |
| FE-015 | 關閉 Drawer | PASS |
| FE-016 | Pipeline 名稱顯示於 Breadcrumb | PASS |

## 異動檔案

| 檔案路徑 | 異動類型 | 說明 |
|----------|---------|------|
| apps/api/src/common/errors/error-codes.ts | modified | 新增 PIPELINE_LOG_NOT_FOUND 錯誤碼與訊息 |
| apps/api/src/modules/etl/dto/list-pipeline-logs.dto.ts | new | Pipeline 日誌列表查詢 DTO（page, pageSize） |
| apps/api/src/modules/etl/etl-pipeline.service.ts | modified | 新增 getPipelineLogs() 和 getLogDetail() 方法 |
| apps/api/src/modules/etl/etl-log.controller.ts | new | 獨立 Controller 處理 GET /api/v1/etl/logs/:logId |
| apps/api/src/modules/etl/etl-pipeline.controller.ts | modified | 新增 GET :id/logs 端點 |
| apps/api/src/modules/etl/etl.module.ts | modified | 註冊 EtlLogController |
| apps/api/test/etl-pipeline-logs.e2e-spec.ts | new | F032 E2E 測試（21 個場景） |
| packages/shared/src/index.ts | modified | 新增 F032 共享型別與 PIPELINE_LOG_NOT_FOUND 錯誤碼 |
| apps/web/src/api/etl-pipelines.ts | modified | 新增 getPipelineLogs() 和 getLogDetail() API 函式 |
| apps/web/src/pages/etl-pipelines/pipeline-logs-page.tsx | new | Pipeline 日誌頁面（列表 + Drawer 詳情） |
| apps/web/src/pages/etl-pipelines/__tests__/pipeline-logs-page.test.tsx | new | 前端測試（16 個場景） |
| apps/web/src/pages/etl-pipelines/pipeline-list-page.tsx | modified | 日誌按鈕導航至日誌頁面（含 state 傳遞） |
| apps/web/src/App.tsx | modified | 新增 /etl-pipelines/:id/logs 路由 |

## 架構決策

1. **獨立 Controller（EtlLogController）**：`GET /api/v1/etl/logs/:logId` 使用獨立 Controller（前綴 `etl/logs`），與 `GET /api/v1/etl/pipelines/:id/logs` 分開，因為兩者路由前綴不同。

2. **軟刪除 Pipeline 日誌存取（BR-5）**：`getPipelineLogs()` 查詢 Pipeline 時不加 `deleted_at IS NULL` 條件，確保軟刪除後日誌仍可存取。`getLogDetail()` 透過 log 直接查詢，不受 Pipeline 軟刪除影響。

3. **node_logs 欄位處理**：Entity 中 `node_logs` 為 text 型別（JSON 字串），Service 層解析為陣列後回傳。列表 API 不包含 nodeLogs，詳情 API 才包含。

4. **Pipeline 摘要資訊傳遞**：前端從 Pipeline 列表頁透過 `navigate state` 傳遞 Pipeline 名稱等摘要資訊，避免額外 API 呼叫。

5. **原型設計補充項目**：
   - Running 日誌行淡藍背景（`bg-blue-50/30`）
   - Running Drawer 含進度條（UI 結構已建立，API 無即時狀態時顯示「執行中」）
   - 節點類型顏色標記（Extract=藍色、Transform=橘色、Load=綠色）
   - 失敗 Drawer 的「重新執行」按鈕（呼叫現有 F030 executePipeline API）

## 回歸測試

- 後端 E2E 全部通過：349 passed, 1 skipped
- 前端全部通過：484 passed
- 無 regression
