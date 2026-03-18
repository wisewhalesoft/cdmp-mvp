---
type: test-design-feature
feature_id: F019
feature_name: 編輯擷取任務
priority: P0-MVP
related_spec: /docs/specs/features/F019-edit-extraction-task.md
last_updated: 2026-03-18
---

# F019: 編輯擷取任務 — 測試設計

---

## Acceptance Test Design

### AC-1：成功編輯擷取任務

| 項目 | 內容 |
|------|------|
| Given | Admin 已登入，ET_SCHEDULED 存在且 status != running |
| When | 呼叫 `PATCH /api/v1/extraction-tasks/:id`，body 含修改欄位 |
| Then | HTTP 200，回應含更新後完整 ExtractionTask 物件 |
| 驗證步驟 | 1. 回應欄位與送出值一致<br>2. updated_at 已更新<br>3. GET /api/v1/extraction-tasks 清單反映最新資料 |

### AC-2：執行中任務不可編輯

| 項目 | 內容 |
|------|------|
| Given | ET_RUNNING 的 status = running |
| When | 呼叫 PATCH /api/v1/extraction-tasks/ET_RUNNING.id |
| Then | HTTP 409，EXTRACTION_RUNNING |

### AC-3：表單預填既有值

| 項目 | 內容 |
|------|------|
| Given | Admin 已登入，ET_SCHEDULED 存在 |
| When | 呼叫 `GET /api/v1/extraction-tasks/:id` |
| Then | HTTP 200，所有欄位含既有值，供前端表單預填使用 |

### AC-4：編輯時的欄位驗證

| 項目 | 內容 |
|------|------|
| Given | Admin 已登入 |
| When | PATCH 含 name=""（空字串）或 schedule="invalid-cron" |
| Then | HTTP 422，VALIDATION_ERROR，details 列出錯誤欄位 |

---

## Test Scenarios

### Positive Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F019-001 | 成功編輯任務名稱 | AC-1 | Integration | ET_SCHEDULED 存在 | 1. PATCH /api/v1/extraction-tasks/:id {name:"新名稱"} | HTTP 200，name="新名稱" |
| TS-F019-002 | 成功修改排程 cron | AC-1, BR-5 | Integration | ET_SCHEDULED 存在 | 1. PATCH {:id} {schedule:"0 3 * * *"} | HTTP 200，schedule="0 3 * * *" |
| TS-F019-003 | 全量切換至增量模式 | AC-1, BR-4 | Integration | ET_SCHEDULED(mode=full) 存在 | 1. PATCH {:id} {mode:"incremental", incrementalColumn:"id"} | HTTP 200，mode=incremental，incrementalColumn="id" |
| TS-F019-004 | 名稱唯一性排除自身 | BR-3 | Integration | ET_SCHEDULED 存在 | 1. PATCH {:id} {name: ET_SCHEDULED.name}（名稱不變） | HTTP 200（自身名稱不觸發重複驗證） |

### Negative Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F019-005 | 執行中任務無法編輯 | AC-2, BR-2 | Integration | ET_RUNNING 存在 | 1. PATCH /api/v1/extraction-tasks/ET_RUNNING.id {name:"x"} | HTTP 409，EXTRACTION_RUNNING |
| TS-F019-006 | 名稱重複（與其他任務） | AC-4 | Integration | ET_SCHEDULED, ET_COMPLETED 存在 | 1. PATCH ET_SCHEDULED.id {name: ET_COMPLETED.name} | HTTP 409，EXTRACTION_NAME_EXISTS |
| TS-F019-007 | 非 Admin 無權編輯 | BR-1 | Integration | USER_ACTIVE 已登入 | 1. 以 User Token 呼叫 PATCH /api/v1/extraction-tasks/:id | HTTP 403，AUTH_FORBIDDEN |
| TS-F019-008 | 任務不存在 | AC-2 | Integration | 無此 ID | 1. PATCH /api/v1/extraction-tasks/nonexistent-uuid | HTTP 404，EXTRACTION_NOT_FOUND |

### Boundary Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F019-009 | 增量切換至全量（增量欄位保留但不作執行依據） | AC-1 | Integration | ET_INCREMENTAL(mode=incremental, incrementalColumn="updated_at") | 1. PATCH {:id} {mode:"full"} | HTTP 200，mode=full；incrementalColumn 欄位保留原值（不清除） |
