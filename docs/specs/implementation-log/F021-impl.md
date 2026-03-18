---
type: implementation-log
feature_id: F021
feature_name: 立即執行／重新執行擷取任務
status: complete
last_updated: 2026-03-18
---

# F021: 立即執行／重新執行擷取任務 — Implementation Log

## Test Results Summary
| Scenario ID | Description | Status |
|-------------|------------|--------|
| TS-F021-001 | 手動觸發 scheduled 任務 → 202 | PASS |
| TS-F021-002 | 重新執行 failed 任務 (triggeredBy: retry) → 202 | PASS |
| TS-F021-003 | 手動觸發已停用任務 → 202 | PASS |
| TS-F021-004 | 執行完成後統計欄位更新（executionCount+1, avgDurationMs, lastExecutionAt） | PASS |
| TS-F021-005 | ExtractionLog 完整性（startedAt, finishedAt, durationMs, extractedCount, triggeredBy, createdBy） | PASS |
| TS-F021-006 | running 不可重複觸發 → 409 EXTRACTION_RUNNING | PASS |
| TS-F021-007 | 非 Admin → 403 AUTH_FORBIDDEN | PASS |
| TS-F021-008 | 任務不存在 → 404 EXTRACTION_NOT_FOUND | PASS |
| TS-F021-009 | 空表擷取 → completed, progressPercent=100, extractedCount=0 | PASS |
| TS-F021-010 | 增量模式更新 lastIncrementalValue | PASS |

## Files Changed
| File Path | Change Type | Description |
|-----------|------------|-------------|
| apps/api/src/modules/extraction-task/dto/run-extraction-task.dto.ts | new | RunExtractionTaskDto (triggeredBy: 'manual' \| 'retry') |
| apps/api/src/modules/extraction-task/extraction-executor.provider.ts | new | EXTRACTION_EXECUTOR 抽象介面與 token |
| apps/api/src/modules/extraction-task/extraction-execution.service.ts | new | ExtractionExecutionService（triggerRun + executeExtraction 非同步邏輯） |
| apps/api/src/modules/extraction-task/extraction-task.controller.ts | modified | 新增 POST :id/run 路由（202），注入 ExtractionExecutionService |
| apps/api/src/modules/extraction-task/extraction-task.module.ts | modified | 註冊 ExtractionExecutionService、EXTRACTION_EXECUTOR provider |
| apps/api/test/extraction-task.e2e-spec.ts | modified | 新增 F021 describe block（10 個測試場景）+ waitForTaskStatus helper |
| packages/shared/src/index.ts | modified | 新增 F021 shared types（RunExtractionTaskRequest, ExtractionLogResponse 等） |

## Architectural Decisions
- **非同步執行模型**：API 同步完成 INSERT Log + UPDATE status=running 後回 202，背景 fire-and-forget Promise 執行擷取邏輯
- **EXTRACTION_EXECUTOR 抽象介面**：透過 NestJS DI token 注入，測試中 mock 為回傳 `{ totalCount: 0, extractedCount: 0 }` 的假實作
- **路由順序**：`POST :id/run` 放在 `PATCH :id/toggle` 之前，避免路徑衝突
- **avg_duration_ms 公式**：`newAvg = ((oldAvg * (executionCount - 1)) + durationMs) / executionCount`
- **空表處理**：totalCount=0 時 progressPercent=100（非 NaN）
- **batch_size**：硬編碼 1000，MVP 階段不需設定
- **已停用任務可觸發**：disabled 任務仍可手動執行，符合需求

## Blocking Issues
（無）
