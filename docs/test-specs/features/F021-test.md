---
type: test-design-feature
feature_id: F021
feature_name: 立即執行／重新執行擷取任務
priority: P0-MVP
related_spec: /docs/specs/features/F021-run-extraction-task.md
last_updated: 2026-03-18
---

# F021: 立即執行／重新執行擷取任務 — 測試設計

---

## Acceptance Test Design

### AC-1：手動觸發執行

| 項目 | 內容 |
|------|------|
| Given | Admin 已登入，ET_SCHEDULED（status=scheduled）存在 |
| When | 呼叫 `POST /api/v1/extraction-tasks/:id/run`，body: { "triggeredBy": "manual" } |
| Then | HTTP 202 Accepted，回傳 ExtractionLog 初始資訊 |
| 驗證步驟 | 1. 回應含 id（ExtractionLog UUID）、status=running、triggeredBy=manual<br>2. ExtractionTask.status 更新為 running<br>3. 使用 `waitForTaskStatus(taskId, 'completed', 5000)` polling 確認非同步執行完成（interval=300ms，timeout=5000ms） |

### AC-2：重新執行失敗任務

| 項目 | 內容 |
|------|------|
| Given | Admin 已登入，ET_FAILED（status=failed）存在 |
| When | 呼叫 `POST /api/v1/extraction-tasks/:id/run`，body: { "triggeredBy": "retry" } |
| Then | HTTP 202，ExtractionLog.triggeredBy=retry |

### AC-4：執行中不可重複觸發

| 項目 | 內容 |
|------|------|
| Given | ET_RUNNING（status=running）存在 |
| When | 呼叫 POST /run |
| Then | HTTP 409，EXTRACTION_RUNNING |

### AC-5：執行完成後狀態更新

| 項目 | 內容 |
|------|------|
| Given | 任務剛觸發執行（status=running） |
| When | 執行完成（成功或失敗） |
| Then | ExtractionTask.status=completed 或 failed，lastExecutionAt 更新，ExtractionLog.finishedAt 設定 |
| 驗證步驟 | 使用 waitForTaskStatus(taskId, 'completed', 5000) 輪詢確認，再查詢 ExtractionTask 與 ExtractionLog 欄位 |

---

## Test Scenarios

### Positive Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F021-001 | 手動觸發執行（scheduled 狀態） | AC-1, BR-4, BR-5 | Integration | ET_SCHEDULED(status=scheduled) 存在 | 1. POST /api/v1/extraction-tasks/:id/run {triggeredBy:"manual"}<br>2. waitForTaskStatus(taskId, 'completed', 5000) | HTTP 202，ExtractionLog.triggeredBy=manual；完成後 ExtractionTask.status=completed |
| TS-F021-002 | 重新執行失敗任務 | AC-2, BR-5 | Integration | ET_FAILED(status=failed) 存在 | 1. POST /run {triggeredBy:"retry"}<br>2. waitForTaskStatus(taskId, 'completed', 5000) | HTTP 202，triggeredBy=retry；完成後 status=completed 或 failed |
| TS-F021-003 | 手動觸發已停用任務 | BR-3 | Integration | ET_DISABLED(enabled=false) 存在 | 1. POST /run {triggeredBy:"manual"} | HTTP 202（手動觸發不受 enabled 限制） |
| TS-F021-004 | 執行完成後統計欄位更新 | AC-5, BR-7 | Integration | 任務執行完成 | 1. 確認 completed 後查詢 ExtractionTask | executionCount 加 1，lastExecutionAt 更新，avgDurationMs = 第一次 durationMs |
| TS-F021-005 | ExtractionLog 記錄完整性 | AC-5 | Integration | 任務執行完成 | 1. GET /api/v1/extraction-tasks/:id/logs | ExtractionLog 含 startedAt, finishedAt, durationMs, extractedCount, triggeredBy, createdBy |

### Negative Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F021-006 | 執行中不可重複觸發 | AC-4, BR-2 | Integration | ET_RUNNING(status=running) 存在 | 1. POST /run {triggeredBy:"manual"} | HTTP 409，EXTRACTION_RUNNING |
| TS-F021-007 | 非 Admin 無權執行 | BR-1 | Integration | USER_ACTIVE 已登入 | 1. 以 User Token 呼叫 POST /run | HTTP 403，AUTH_FORBIDDEN |
| TS-F021-008 | 任務不存在 | F021 BR | Integration | 無此 ID | 1. POST /api/v1/extraction-tasks/nonexistent-uuid/run | HTTP 404，EXTRACTION_NOT_FOUND |

### Boundary Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F021-009 | 空表擷取（total_count=0） | 邊界情況 | Integration | 目標表為空表 | 1. POST /run<br>2. waitForTaskStatus(taskId, 'completed', 5000) | status=completed，progressPercent=100，extractedCount=0，totalCount=0 |
| TS-F021-010 | 增量模式成功後更新最後增量值 | BR-8 | Integration | ET_INCREMENTAL 存在，擷取成功 | 1. POST /run<br>2. waitForTaskStatus(taskId, 'completed', 5000)<br>3. 查詢 ExtractionTask | lastIncrementalValue 更新為本次擷取最後值 |
