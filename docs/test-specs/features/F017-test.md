---
type: test-design-feature
feature_id: F017
feature_name: 建立擷取任務
priority: P0-MVP
related_spec: /docs/specs/features/F017-create-extraction-task.md
last_updated: 2026-03-18
---

# F017: 建立擷取任務 — 測試設計

---

## Acceptance Test Design

### AC-1：成功建立擷取任務

| 項目 | 內容 |
|------|------|
| Given | Admin 已登入，系統中至少存在一個未刪除的 Datasource |
| When | 呼叫 `POST /api/v1/extraction-tasks`，body 含 name、datasourceId、mode、targetTable、schedule |
| Then | HTTP 201，回應含新建任務資訊（status=scheduled, enabled=true, lastExecutionAt=null） |
| 驗證步驟 | 1. status = scheduled<br>2. enabled = true<br>3. lastExecutionAt = null<br>4. extractedCount = 0<br>5. createdBy = 操作者 User ID<br>6. 新任務出現於 GET /api/v1/extraction-tasks 清單 |

### AC-2：防止重複名稱

| 項目 | 內容 |
|------|------|
| Given | 名為「每日客戶同步」的擷取任務已存在（未軟刪除） |
| When | 嘗試以相同名稱建立 |
| Then | HTTP 409，EXTRACTION_NAME_EXISTS |

### AC-3：增量模式必填欄位驗證

| 項目 | 內容 |
|------|------|
| Given | Admin 已登入 |
| When | POST /api/v1/extraction-tasks，mode=incremental，未提供 incrementalColumn |
| Then | HTTP 422，VALIDATION_ERROR，details 指出 incrementalColumn 為必填 |

### AC-4：欄位驗證

| 項目 | 內容 |
|------|------|
| Given | Admin 已登入 |
| When | 提交不合規資料（例：name 為空、cron 格式錯誤） |
| Then | HTTP 422，VALIDATION_ERROR，details 列出各欄位錯誤 |

### AC-5：資料來源僅顯示未刪除的

| 項目 | 內容 |
|------|------|
| Given | 系統中有 DS_MYSQL_CONNECTED（未刪除）與 DS_DELETED（已軟刪除） |
| When | 提交 datasourceId = DS_DELETED 的 ID |
| Then | HTTP 422，EXTRACTION_DATASOURCE_NOT_FOUND |

---

## Test Scenarios

### Positive Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F017-001 | 建立全量擷取任務 | AC-1, BR-4 | Integration | Admin 已登入，DS_MYSQL_CONNECTED 存在 | 1. POST /api/v1/extraction-tasks {name:"每日全量同步", datasourceId, mode:"full", targetTable:"customers", schedule:"0 2 * * *"} | HTTP 201，status=scheduled，enabled=true，lastExecutionAt=null |
| TS-F017-002 | 建立增量擷取任務 | AC-1, AC-3, BR-3 | Integration | Admin 已登入 | 1. POST /api/v1/extraction-tasks {mode:"incremental", incrementalColumn:"updated_at", lastIncrementalValue:"2026-01-01"} | HTTP 201，incrementalColumn="updated_at" |
| TS-F017-003 | 建立任務後出現於清單 | AC-1 | Integration | 建立任務後 | 1. GET /api/v1/extraction-tasks | 新任務出現於 data 陣列，meta.total 加 1 |
| TS-F017-004 | 軟刪除後同名任務可重新建立 | BR-2 | Integration | 有名為「舊任務」的已軟刪除任務 | 1. POST /api/v1/extraction-tasks {name:"舊任務"} | HTTP 201（名稱唯一性不含已刪除記錄） |

### Negative Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F017-005 | 名稱重複 | AC-2, BR-2 | Integration | ET_SCHEDULED 已存在（同名） | 1. POST /api/v1/extraction-tasks {name: ET_SCHEDULED.name} | HTTP 409，EXTRACTION_NAME_EXISTS |
| TS-F017-006 | 非 Admin 無權建立 | BR-1 | Integration | USER_ACTIVE 已登入 | 1. 以 User Token 呼叫 POST /api/v1/extraction-tasks | HTTP 403，AUTH_FORBIDDEN |
| TS-F017-007 | 指定已刪除的資料來源 | BR-6, AC-5 | Integration | DS_DELETED 存在 | 1. POST 含 datasourceId=DS_DELETED.id | HTTP 422，EXTRACTION_DATASOURCE_NOT_FOUND |
| TS-F017-008 | 增量模式未填增量欄位 | AC-3, BR-3 | Integration | Admin 已登入 | 1. POST {mode:"incremental"}，不含 incrementalColumn | HTTP 422，VALIDATION_ERROR，details 指出 incrementalColumn 為必填 |

### Boundary Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F017-009 | Cron 表達式邊界驗證 | AC-4, BR-5, BR-7 | Integration | Admin 已登入 | 1. schedule="0 2 * * *"（合法）→ 201<br>2. schedule="invalid-cron"（非法）→ 422<br>3. schedule=""（空）→ 422 | 合法 cron 表達式建立成功，非法格式回傳 VALIDATION_ERROR |
