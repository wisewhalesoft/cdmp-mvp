---
type: test-design-feature
feature_id: F022
feature_name: 查看擷取日誌
priority: P0-MVP
related_spec: /docs/specs/features/F022-view-extraction-logs.md
last_updated: 2026-03-18
---

# F022: 查看擷取日誌 — 測試設計

---

## Acceptance Test Design

### AC-2：日誌列表顯示

| 項目 | 內容 |
|------|------|
| Given | Admin 已登入，ET_SCHEDULED 有多筆 ExtractionLog |
| When | 呼叫 `GET /api/v1/extraction-tasks/:id/logs` |
| Then | HTTP 200，data 陣列含各日誌欄位，按 startedAt DESC 排序 |
| 驗證步驟 | 1. 每筆含 id, taskId, status, startedAt, finishedAt, durationMs, extractedCount, triggeredBy, createdBy<br>2. 排序為 startedAt DESC（最新在最上方）<br>3. meta 含分頁資訊 |

### AC-3：失敗日誌含錯誤訊息

| 項目 | 內容 |
|------|------|
| Given | ET_FAILED 有 status=failed 的 ExtractionLog，errorMessage 有值 |
| When | 呼叫 GET /api/v1/extraction-tasks/:id/logs |
| Then | 失敗日誌的 errorMessage 欄位含完整錯誤訊息（非 null） |

### AC-4：日誌分頁

| 項目 | 內容 |
|------|------|
| Given | 任務有 25 筆 ExtractionLog |
| When | 呼叫 GET /logs?page=1&limit=10 |
| Then | HTTP 200，data.length=10，meta.total=25，meta.totalPages=3 |

---

## Test Scenarios

### Positive Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F022-001 | 查看日誌列表（倒序排列） | AC-2, BR-2 | Integration | ET_SCHEDULED 有 3 筆 ExtractionLog（不同 startedAt） | 1. GET /api/v1/extraction-tasks/:id/logs | data 依 startedAt DESC 排序，最新執行在第一筆 |
| TS-F022-002 | 失敗日誌含錯誤訊息 | AC-3 | Integration | ET_FAILED 有 failed ExtractionLog | 1. GET /logs | failed 日誌的 errorMessage 非 null，含錯誤原因 |
| TS-F022-003 | 執行中日誌欄位為 null | 邊界情況 | Integration | 任務執行中（status=running） | 1. GET /logs | running 日誌的 finishedAt=null，durationMs=null |
| TS-F022-004 | 觸發方式欄位正確 | AC-2, BR-2 | Integration | 有 manual、schedule、retry 觸發的日誌 | 1. GET /logs | 每筆 triggeredBy 欄位分別為 manual / schedule / retry |

### Negative Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F022-005 | 非 Admin 無權查看 | BR-1 | Integration | USER_ACTIVE 已登入 | 1. 以 User Token 呼叫 GET /logs | HTTP 403，AUTH_FORBIDDEN |
| TS-F022-006 | 任務不存在 | BR-1 | Integration | 無此 ID | 1. GET /api/v1/extraction-tasks/nonexistent-uuid/logs | HTTP 404，EXTRACTION_NOT_FOUND |

### Boundary Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F022-007 | 空狀態（尚無執行紀錄） | AC-5 | Integration | ET_SCHEDULED 從未執行過 | 1. GET /logs | HTTP 200，data=[]，meta.total=0 |
| TS-F022-008 | 軟刪除任務的日誌仍可查詢 | BR-3 | Integration | ET_DELETED 有歷史 ExtractionLog | 1. GET /api/v1/extraction-tasks/ET_DELETED.id/logs | HTTP 200，data 含歷史日誌（日誌不隨任務刪除） |
