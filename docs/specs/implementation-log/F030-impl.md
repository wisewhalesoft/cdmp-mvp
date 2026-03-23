---
type: implementation-log
feature_id: F030
feature_name: 執行 Pipeline
status: complete
last_updated: 2026-03-23
---

# F030: 執行 Pipeline — 實作日誌

## 測試結果摘要

### 後端 — EtlPipelineExecutionService（12 tests）

| Scenario ID | 說明 | 狀態 |
|-------------|------|------|
| TS-F030-001 | 手動執行 active Pipeline → logId 回傳 | PASS |
| TS-F030-002 | 手動執行建立 EtlPipelineLog（triggered_by=manual） | PASS |
| TS-F030-003 | 手動執行後 Pipeline.status 更新為 running | PASS |
| TS-F030-004 | 重新執行 failed Pipeline → triggered_by=retry | PASS |
| TS-F030-005 | 測試執行 draft Pipeline → logId 回傳 | PASS |
| TS-F030-006 | 測試執行建立 log（is_test_run=true, triggered_by=test） | PASS |
| TS-F030-013 | 執行中查詢進度回傳完整欄位（status, processedCount, currentNode） | PASS |
| TS-F030-013b | 無 log 時回傳空進度 | PASS |
| TS-F030-016 | 執行中 Pipeline 重複觸發 → 409 ConflictException | PASS |
| TS-F030-017 | 無 definition（nodes 為空）→ 422 UnprocessableEntityException | PASS |
| TS-F030-017b | version 為 null → 422 | PASS |
| TS-F030-018 | Pipeline 不存在 → 404 NotFoundException | PASS |

### 後端 — PipelineSchedulerService（7 tests）

| Scenario ID | 說明 | 狀態 |
|-------------|------|------|
| TS-F030-009 | 排程時間到達自動觸發執行 | PASS |
| TS-F030-010 | 排程觸發使用 pipeline.created_by 作為 userId | PASS |
| TS-F030-011 | 排程跳過 running Pipeline（status=active DB filter） | PASS |
| TS-F030-012 | draft Pipeline 不被排程觸發 | PASS |
| — | cron 不符合觸發時間則跳過 | PASS |
| — | DB 不可用時不拋出例外 | PASS |
| — | 單一 pipeline 失敗不影響其他 pipeline | PASS |

## 新增/修改檔案清單

### 新增

| 檔案 | 說明 |
|------|------|
| `apps/api/src/modules/etl/etl-pipeline-execution.service.ts` | Pipeline 執行 service（triggerExecute, triggerTest, triggerSchedule, getProgress, 非同步執行引擎） |
| `apps/api/src/modules/etl/__tests__/etl-pipeline-execution.service.spec.ts` | 執行 service 單元測試（12 tests） |
| `apps/api/src/modules/scheduler/pipeline-scheduler.service.ts` | Pipeline 排程 service（scanAndExecute, shouldTrigger） |
| `apps/api/src/modules/scheduler/__tests__/pipeline-scheduler.service.spec.ts` | 排程 service 單元測試（7 tests） |

### 修改

| 檔案 | 修改內容 |
|------|---------|
| `apps/api/src/common/errors/error-codes.ts` | 新增 `PIPELINE_RUNNING`, `PIPELINE_NO_DEFINITION` 錯誤碼與訊息 |
| `apps/api/src/modules/etl/etl-pipeline.controller.ts` | 新增 `POST :id/execute`, `POST :id/test`, `GET :id/progress` 端點 |
| `apps/api/src/modules/etl/etl.module.ts` | 註冊 `EtlPipelineExecutionService` |
| `apps/api/src/modules/scheduler/scheduler.module.ts` | 匯入 EtlModule, 註冊 `PipelineSchedulerService` |
| `packages/shared/src/index.ts` | 新增 `ExecutePipelineResponse`, `TestPipelineResponse`, `PipelineProgressResponse` types |
| `apps/web/src/api/etl-pipelines.ts` | 新增 `executePipeline`, `testPipeline`, `getPipelineProgress` API 函式 |
| `apps/web/src/pages/etl-pipelines/pipeline-list-page.tsx` | 完整重構操作欄、新增執行/測試/重新執行按鈕、running 進度條列、5 秒 polling |

## API 端點

| Method | Path | 用途 | 回應 |
|--------|------|------|------|
| POST | `/api/v1/etl/pipelines/:id/execute` | 手動執行/重新執行 | 202 `{ logId, message }` |
| POST | `/api/v1/etl/pipelines/:id/test` | 測試執行草稿 | 202 `{ logId, message }` |
| GET | `/api/v1/etl/pipelines/:id/progress` | 查詢執行進度 | 200 `{ logId, status, processedCount, totalCount, progressPercent, currentNode, currentNodeName }` |

## 商業規則實作對照

| 規則 | 實作方式 |
|------|---------|
| BR-1 | Controller 使用 `@Roles('admin')` + AuthGuard |
| BR-2 | `triggerExecute/triggerTest` 檢查 `pipeline.status === 'running'` → 409 |
| BR-3 | `triggerTest` 設定 `is_test_run=true`；排程只查 `status='active'` |
| BR-4 | 排程觸發時讀取最新版本 definition |
| BR-5 | `triggered_by` 依據 pipeline.status 判定：failed→retry, draft(test)→test, active→manual, schedule→schedule |
| BR-6 | 測試執行成功後，若版本 status='draft' 則更新為 'testing' |
| BR-7 | 測試執行完成不更新 `pipeline.processed_count` 和 `execution_count` |
| BR-8 | `PipelineSchedulerService` 使用 `@Cron('0 * * * * *')` + `@nestjs/schedule` |
| BR-9 | `executePipeline` catch 塊保留已成功節點 log，設 pipeline.status='failed' |

## 前端 UI 設計對照（原型 17-pipeline-management.html）

| 原型設計規範 | 實作對照 |
|-------------|---------|
| active: play icon + `text-gray-500 hover:text-primary` | `<Play>` + `hover:text-blue-600` |
| draft: play icon + `text-gray-500 hover:text-warning` | `<Play>` + `hover:text-amber-500` |
| failed: rotate-ccw icon + `text-warning hover:text-orange-600` | `<RotateCcw>` + `text-amber-500 hover:text-orange-600` |
| running: 所有按鈕 disabled（除日誌外） | disabled + `text-gray-300 cursor-not-allowed` |
| running row: `bg-blue-50/30` | `bg-blue-50/30` |
| running progress: 額外 `<tr>` colspan=10 | 獨立 `<tr>` with `colSpan={10}` |
| 進度條: `h-1.5`, `bg-gray-200`, `bg-primary`, `animate-progress` | `h-1.5`, `bg-gray-200`, `bg-blue-600`, `animate-pulse` |
| 進度文字: `目前節點：{name}（{n}/{total} 筆）` | 完整實作 |
| draft toggle disabled + tooltip | `<ToggleLeft>` disabled + absolute tooltip |
| Polling 5 秒 | `setInterval(poll, 5000)` |
| completed/failed 停止 polling | `hasFinished → fetchData()` 重新載入 |

## 設計決策

1. **拆分 ExecutionService**：執行邏輯獨立為 `EtlPipelineExecutionService`，保持 `EtlPipelineService` 專注 CRUD
2. **模擬執行引擎**：F030 以節點遍歷為單位模擬執行（node_logs 逐步更新），實際 ETL 邏輯（Extract/Transform/Load 資料處理）留待 F036
3. **前狀態記錄**：執行前將 `previousStatus` 暫存於 log.node_logs JSON，完成後據此回歸正確狀態
4. **排程篩選條件**：`status = 'active'`（而非 `status != 'running'`），確保 draft/failed/disabled 不被排程觸發
