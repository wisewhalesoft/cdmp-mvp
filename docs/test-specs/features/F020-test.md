---
type: test-design-feature
feature_id: F020
feature_name: 啟用／停用擷取任務
priority: P0-MVP
related_spec: /docs/specs/features/F020-toggle-extraction-task.md
last_updated: 2026-03-18
---

# F020: 啟用／停用擷取任務 — 測試設計

---

## Acceptance Test Design

### AC-1：停用擷取任務

| 項目 | 內容 |
|------|------|
| Given | Admin 已登入，ET_SCHEDULED（enabled=true）存在 |
| When | 呼叫 `PATCH /api/v1/extraction-tasks/:id/toggle`，body: { "enabled": false } |
| Then | HTTP 200，enabled=false，status=disabled |
| 驗證步驟 | 1. 回應 enabled=false，status=disabled<br>2. GET 清單中該任務狀態為 disabled<br>3. 排程引擎後續掃描跳過此任務（見 F023 測試） |

### AC-2：啟用擷取任務

| 項目 | 內容 |
|------|------|
| Given | Admin 已登入，ET_DISABLED（enabled=false）存在 |
| When | 呼叫 `PATCH /api/v1/extraction-tasks/:id/toggle`，body: { "enabled": true } |
| Then | HTTP 200，enabled=true，status=scheduled |
| 驗證步驟 | 1. 回應 enabled=true，status=scheduled<br>2. GET 清單中該任務狀態為 scheduled |

### AC-4：執行中任務不可停用

| 項目 | 內容 |
|------|------|
| Given | ET_RUNNING（status=running）存在 |
| When | 呼叫 PATCH toggle，body: { "enabled": false } |
| Then | HTTP 409，EXTRACTION_RUNNING |

---

## Test Scenarios

### Positive Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F020-001 | 成功停用任務 | AC-1, BR-3 | Integration | ET_SCHEDULED(enabled=true) 存在 | 1. PATCH /api/v1/extraction-tasks/:id/toggle {enabled:false} | HTTP 200，enabled=false，status=disabled |
| TS-F020-002 | 成功啟用任務 | AC-2, BR-4 | Integration | ET_DISABLED(enabled=false) 存在 | 1. PATCH /api/v1/extraction-tasks/:id/toggle {enabled:true} | HTTP 200，enabled=true，status=scheduled |
| TS-F020-003 | 冪等操作（停用已停用） | 邊界情況 | Integration | ET_DISABLED(enabled=false) 存在 | 1. PATCH toggle {enabled:false} | HTTP 200，狀態不變（enabled=false，status=disabled） |
| TS-F020-004 | 冪等操作（啟用已啟用） | 邊界情況 | Integration | ET_SCHEDULED(enabled=true) 存在 | 1. PATCH toggle {enabled:true} | HTTP 200，狀態不變（enabled=true，status=scheduled） |

### Negative Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F020-005 | 執行中任務不可停用 | AC-4, BR-2 | Integration | ET_RUNNING(status=running) 存在 | 1. PATCH toggle {enabled:false} | HTTP 409，EXTRACTION_RUNNING |
| TS-F020-006 | 非 Admin 無權操作 | BR-1 | Integration | USER_ACTIVE 已登入 | 1. 以 User Token 呼叫 PATCH toggle | HTTP 403，AUTH_FORBIDDEN |
| TS-F020-007 | 任務不存在 | F020 BR | Integration | 無此 ID | 1. PATCH /api/v1/extraction-tasks/nonexistent-uuid/toggle {enabled:false} | HTTP 404，EXTRACTION_NOT_FOUND |

### Boundary Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F020-008 | 停用任務後排程不觸發（與 F023 聯合驗證） | BR-5 | Integration | ET_DISABLED 設定了 cron 排程 | 1. 停用任務後呼叫 scanAndExecute(fakeNow)，其中 fakeNow 符合該任務 cron 觸發條件（使用 injectable time 參數直接呼叫，無需等待真實計時器） | 排程掃描日誌顯示跳過 ET_DISABLED；無新 ExtractionLog 建立 |
