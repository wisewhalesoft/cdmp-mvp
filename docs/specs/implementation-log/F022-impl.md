---
type: implementation-log
feature_id: F022
feature_name: 查看擷取日誌
status: complete
last_updated: 2026-03-19
---

# F022: 查看擷取日誌 — Implementation Log

## Test Results Summary

### 後端 E2E 測試（Iteration 1-3）
| Scenario ID | Description | Status |
|-------------|------------|--------|
| TS-F022-001 | 日誌列表倒序排列（startedAt DESC） | PASS |
| TS-F022-002 | 失敗日誌含錯誤訊息（errorMessage 非 null） | PASS |
| TS-F022-003 | 執行中日誌欄位為 null（finishedAt=null, durationMs=null） | PASS |
| TS-F022-004 | 觸發方式欄位正確（manual/schedule/retry） | PASS |
| TS-F022-005 | 非 Admin 無權查看（HTTP 403） | PASS |
| TS-F022-006 | 任務不存在（HTTP 404） | PASS |
| TS-F022-007 | 空狀態（data=[], meta.total=0） | PASS |
| TS-F022-008 | 軟刪除任務的日誌仍可查詢 | PASS |
| (additional) | 回應欄位名稱為 camelCase | PASS |

### 前端 Drawer 測試（Iteration 4-6）
| Scenario ID | Description | Status |
|-------------|------------|--------|
| FE-F022-001 | Drawer Header 顯示任務名稱 | PASS |
| FE-F022-002 | open=false 時不渲染 Drawer | PASS |
| FE-F022-003 | 點擊 X 按鈕觸發 onClose | PASS |
| FE-F022-004 | 點擊 Backdrop 觸發 onClose | PASS |
| FE-F022-005 | 呼叫 getExtractionLogs API（正確 taskId） | PASS |
| FE-F022-006 | 狀態 Badge 顏色正確（completed=綠, failed=紅, running=藍） | PASS |
| FE-F022-007 | 觸發方式中文標籤（排程/手動/重新執行） | PASS |
| FE-F022-008 | 2x2 grid 顯示時間與筆數 | PASS |
| FE-F022-009 | Running 日誌的 finishedAt/durationMs 顯示 "-" | PASS |
| FE-F022-010 | BR-5 格式化 >= 60000ms → Xm Ys | PASS |
| FE-F022-011 | BR-5 格式化 >= 1000ms → Xs | PASS |
| FE-F022-012 | BR-5 格式化 < 1000ms → Xms | PASS |
| FE-F022-013 | BR-5 格式化 null → "-" | PASS |
| FE-F022-014 | completed + extractedCount > 0 → 顯示預覽資料連結 | PASS |
| FE-F022-015 | failed → 不顯示預覽資料連結 | PASS |
| FE-F022-016 | running → 不顯示預覽資料連結 | PASS |
| FE-F022-017 | failed 日誌顯示錯誤訊息區塊 | PASS |
| FE-F022-018 | failed 日誌卡片紅色邊框（border-red-200） | PASS |
| FE-F022-019 | 錯誤訊息紅色背景（bg-red-50） | PASS |
| FE-F022-020 | 空狀態顯示「此任務尚無執行紀錄」 | PASS |
| FE-F022-021 | 分頁資訊顯示（顯示 X-Y 筆，共 N 筆） | PASS |
| FE-F022-022 | 第一頁停用上一頁按鈕 | PASS |
| FE-F022-023 | 最後一頁停用下一頁按鈕 | PASS |
| FE-F022-024 | 點擊下一頁觸發 API（page=2） | PASS |
| FE-F022-025 | 頁碼指示器顯示（X / Y） | PASS |

## Files Changed

### 後端（Iteration 1-3）
| File Path | Change Type | Description |
|-----------|------------|-------------|
| `apps/api/src/modules/extraction-task/dto/list-extraction-logs.dto.ts` | new | 新增分頁查詢 DTO（page, limit） |
| `apps/api/src/modules/extraction-task/extraction-task.service.ts` | modified | 新增 `findLogs` 方法，查詢日誌時不排除軟刪除任務（BR-3） |
| `apps/api/src/modules/extraction-task/extraction-task.controller.ts` | modified | 新增 `GET :id/logs` 路由，置於 `GET :id` 之前避免路徑衝突 |
| `packages/shared/src/index.ts` | modified | 新增 `ExtractionLogListResponse` 型別 |
| `apps/api/test/extraction-logs.e2e-spec.ts` | new | 新增 9 個 E2E 測試場景 |

### 前端（Iteration 4-6）
| File Path | Change Type | Description |
|-----------|------------|-------------|
| `apps/web/src/api/extraction-tasks.ts` | modified | 新增 `getExtractionLogs(taskId, params)` API 函式 |
| `apps/web/src/pages/extraction-tasks/extraction-log-drawer.tsx` | new | 日誌 Drawer 組件（卡片列表、分頁、狀態 Badge、錯誤訊息） |
| `apps/web/src/pages/extraction-tasks/extraction-task-list-page.tsx` | modified | 整合 Drawer，「查看日誌」按鈕觸發開啟 |
| `apps/web/src/utils/date-utils.ts` | modified | 新增 `formatDuration()` 工具函式（BR-5 規則） |
| `apps/web/src/pages/extraction-tasks/__tests__/extraction-log-drawer.test.tsx` | new | 新增 25 個前端測試場景 |

## Architectural Decisions
- `findLogs` 查詢任務時使用 `task.id = :id` 而不加 `deleted_at IS NULL` 條件，確保軟刪除任務的日誌仍可查詢（BR-3：日誌永久保留）
- `@Get(':id/logs')` 路由註冊在 `@Get(':id/raw-data')` 之前、`@Get(':id')` 之前，避免被 `:id` 通配攔截
- 回應格式沿用既有分頁模式：`{ data: [...], meta: { total, page, limit, totalPages } }`
- Entity 欄位（snake_case）映射為回應欄位（camelCase）在 Service 層完成
- `formatDuration()` 提取至 `date-utils.ts` 共用工具層，遵循 BR-5 三段式格式化規則
- Drawer 使用手動實作（fixed positioning + backdrop），未引入 Headless UI 額外依賴
- 日誌 Drawer 狀態（logDrawerOpen, logDrawerTarget）由 ExtractionTaskListPage 管理，透過 props 傳遞

## Blocking Issues
（無）
