---
type: test-design-feature
feature_id: F025
feature_name: 刪除擷取任務
priority: P1
related_spec: /docs/specs/features/F025-delete-extraction-task.md
last_updated: 2026-03-18
---

# F025: 刪除擷取任務 — 測試設計

---

## Acceptance Test Design

### AC-1：成功刪除擷取任務（軟刪除）

| 項目 | 內容 |
|------|------|
| Given | Admin 已登入，ET_SCHEDULED（status != running）存在 |
| When | 呼叫 `DELETE /api/v1/extraction-tasks/:id` |
| Then | HTTP 200，{ "message": "擷取任務已刪除" } |
| 驗證步驟 | 1. 查詢 DB — deleted_at IS NOT NULL（軟刪除，非實際刪除記錄）<br>2. GET /api/v1/extraction-tasks 清單中不再出現此任務<br>3. ExtractionLog 仍保留於 DB（不受影響）<br>4. 重新使用相同名稱可建立新任務（BR-6）|

### AC-3：執行中任務不可刪除

| 項目 | 內容 |
|------|------|
| Given | ET_RUNNING（status=running）存在 |
| When | 呼叫 DELETE /api/v1/extraction-tasks/ET_RUNNING.id |
| Then | HTTP 409，EXTRACTION_RUNNING |

### AC-4：日誌保留驗證

| 項目 | 內容 |
|------|------|
| Given | ET_SCHEDULED 有歷史 ExtractionLog，且已被軟刪除 |
| When | 呼叫 GET /api/v1/extraction-tasks/ET_SCHEDULED.id/logs |
| Then | HTTP 200，data 含歷史日誌（不因任務刪除而清除） |

---

## Test Scenarios

### Positive Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F025-001 | 成功軟刪除任務 | AC-1, BR-3 | Integration | ET_SCHEDULED 存在 | 1. DELETE /api/v1/extraction-tasks/:id<br>2. 查詢 DB | HTTP 200；DB 中 deleted_at IS NOT NULL |
| TS-F025-002 | 刪除後從清單移除 | AC-1 | Integration | 任務已軟刪除 | 1. GET /api/v1/extraction-tasks | 已刪除任務不出現於 data 陣列 |
| TS-F025-003 | 日誌保留 | AC-4, BR-5 | Integration | 任務已軟刪除，有歷史 ExtractionLog | 1. GET /api/v1/extraction-tasks/:id/logs | HTTP 200，ExtractionLog 仍存在 |
| TS-F025-004 | 刪除後名稱可重用 | BR-6 | Integration | 任務已軟刪除 | 1. POST /api/v1/extraction-tasks {name: 已刪除任務的名稱} | HTTP 201（名稱唯一性不含已軟刪除記錄） |

### Negative Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F025-005 | 執行中任務不可刪除 | AC-3, BR-2 | Integration | ET_RUNNING(status=running) 存在 | 1. DELETE /api/v1/extraction-tasks/ET_RUNNING.id | HTTP 409，EXTRACTION_RUNNING |
| TS-F025-006 | 非 Admin 無權刪除 | BR-1 | Integration | USER_ACTIVE 已登入 | 1. 以 User Token 呼叫 DELETE /api/v1/extraction-tasks/:id | HTTP 403，AUTH_FORBIDDEN |

### Boundary Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F025-007 | 已刪除任務再次刪除回傳 404 | 邊界情況, BR-3 | Integration | 任務已軟刪除 | 1. DELETE /api/v1/extraction-tasks/:id（第二次） | HTTP 404，EXTRACTION_NOT_FOUND（軟刪除後視為不存在） |
