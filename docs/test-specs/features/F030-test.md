---
type: test-design-feature
feature_id: F030
feature_name: 執行 Pipeline
priority: P0-MVP
related_spec: /docs/specs/features/F030-execute-pipeline.md
last_updated: 2026-03-20
---

# F030: 執行 Pipeline — 測試設計

---

## Acceptance Test Design

### AC-1: 手動執行已發布 Pipeline

| 項目 | 內容 |
|------|------|
| Given | 一個狀態為 `active` 的 Pipeline（含有至少一個節點的 definition），Admin 已登入 |
| When | 呼叫 `POST /api/v1/etl/pipelines/:id/execute` |
| Then | HTTP 202 Accepted；回應 body 含 logId（UUID）與 message；DB 中新增一筆 EtlPipelineLog，triggered_by="manual"、is_test_run=false、status="running"；EtlPipeline.status 更新為 "running" |
| 驗證步驟 | 1. 驗證 HTTP 狀態碼為 202<br>2. 驗證 response.logId 為合法 UUID 格式<br>3. 驗證 DB 中 EtlPipelineLog.triggered_by = "manual"<br>4. 驗證 DB 中 EtlPipelineLog.is_test_run = false<br>5. 驗證 DB 中 EtlPipelineLog.status = "running"<br>6. 驗證 DB 中 EtlPipeline.status = "running" |

### AC-2: 測試執行草稿 Pipeline

| 項目 | 內容 |
|------|------|
| Given | 一個狀態為 `draft` 的 Pipeline（含有 definition），Admin 已登入 |
| When | 呼叫 `POST /api/v1/etl/pipelines/:id/test` |
| Then | HTTP 202 Accepted；DB 中新增 EtlPipelineLog，triggered_by="test"、is_test_run=true；EtlPipeline.status 更新為 "running" |
| 驗證步驟 | 1. 驗證 HTTP 狀態碼為 202<br>2. 驗證 DB 中 EtlPipelineLog.triggered_by = "test"<br>3. 驗證 DB 中 EtlPipelineLog.is_test_run = true<br>4. 驗證 EtlPipeline.status = "running" |

### AC-3: 執行成功後版本狀態從 draft 更新為 testing

| 項目 | 內容 |
|------|------|
| Given | 一個版本狀態為 `draft` 的 EtlPipelineVersion，對應 Pipeline 完成測試執行 |
| When | 測試執行成功完成（EtlPipelineLog.status 更新為 "completed"） |
| Then | 對應 EtlPipelineVersion.status 從 "draft" 更新為 "testing" |
| 驗證步驟 | 1. 使用 waitForPipelineStatus(logId, "completed", 10000) 等待完成<br>2. 查詢 DB 中 EtlPipelineVersion.status = "testing" |

### AC-4: 執行中不可重複執行

| 項目 | 內容 |
|------|------|
| Given | 一個 Pipeline 狀態為 `running` |
| When | 呼叫 `POST /api/v1/etl/pipelines/:id/execute` |
| Then | HTTP 409；error.code = "PIPELINE_RUNNING"；DB 中不新增第二筆執行中的 EtlPipelineLog |

### AC-5: 重新執行失敗的 Pipeline

| 項目 | 內容 |
|------|------|
| Given | 一個 Pipeline 狀態為 `failed` |
| When | 呼叫 `POST /api/v1/etl/pipelines/:id/execute` |
| Then | HTTP 202；DB 中新增一筆新的 EtlPipelineLog，triggered_by="retry"；EtlPipeline.status 更新為 "running" |

### AC-6: 排程自動觸發

| 項目 | 內容 |
|------|------|
| Given | 一個 Pipeline status="active"、enabled=true、schedule="0 2 * * *"（UTC 02:00）；已有最新 published 版本 |
| When | 排程引擎的 scanAndExecute(fakeNow) 在 fakeNow = 排程觸發時間點被呼叫 |
| Then | 系統自動建立 EtlPipelineLog，triggered_by="schedule"；使用最新 published 版本 |

### AC-7: 執行進度查詢

| 項目 | 內容 |
|------|------|
| Given | 一個 Pipeline 正在執行中（status="running"），已有 EtlPipelineLog |
| When | 呼叫 `GET /api/v1/etl/pipelines/:id/progress` |
| Then | HTTP 200；回應含 logId、status="running"、processedCount（整數）、totalCount（整數）、progressPercent（0.0 ~ 100.0）、currentNode（節點 ID）、currentNodeName |

---

## Test Scenarios

### Positive Scenarios — 手動執行

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F030-001 | 手動執行 active Pipeline → 202 + logId | AC-1, BR-5 | Integration | Admin 已登入；PIPELINE_ACTIVE（status="active"，definition 含 1 個節點） | 1. POST /api/v1/etl/pipelines/{PIPELINE_ACTIVE.id}/execute，帶 Admin JWT | HTTP 202；response.logId 為合法 UUID；response.message 非空 |
| TS-F030-002 | 手動執行建立 EtlPipelineLog（triggered_by=manual） | AC-1, BR-5 | Integration | Admin 已登入；PIPELINE_ACTIVE 存在 | 1. POST /api/v1/etl/pipelines/{id}/execute 2. 查詢 DB 中 etl_pipeline_logs WHERE id = response.logId | DB 記錄：triggered_by="manual"、is_test_run=false、status="running"、pipeline_id=PIPELINE_ACTIVE.id、created_by=ADMIN_UUID |
| TS-F030-003 | 手動執行後 Pipeline.status 更新為 running | AC-1 | Integration | PIPELINE_ACTIVE 存在，執行前 status="active" | 1. POST /api/v1/etl/pipelines/{id}/execute 2. 查詢 DB 中 etl_pipelines.status | DB 中 EtlPipeline.status = "running" |
| TS-F030-004 | 重新執行 failed Pipeline → triggered_by=retry | AC-5, BR-5 | Integration | Admin 已登入；PIPELINE_FAILED（status="failed"，含 definition） | 1. POST /api/v1/etl/pipelines/{PIPELINE_FAILED.id}/execute | HTTP 202；DB 中新 EtlPipelineLog.triggered_by="retry"；EtlPipeline.status="running" |

### Positive Scenarios — 測試執行

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F030-005 | 測試執行 draft Pipeline → 202 + logId | AC-2, BR-3 | Integration | Admin 已登入；PIPELINE_DRAFT（status="draft"，definition 含 1 個節點） | 1. POST /api/v1/etl/pipelines/{PIPELINE_DRAFT.id}/test，帶 Admin JWT | HTTP 202；response.logId 為合法 UUID；response.message 非空 |
| TS-F030-006 | 測試執行建立 EtlPipelineLog（is_test_run=true） | AC-2, BR-3, BR-7 | Integration | PIPELINE_DRAFT 存在 | 1. POST /api/v1/etl/pipelines/{id}/test 2. 查詢 DB | DB 記錄：triggered_by="test"、is_test_run=true、pipeline_id=PIPELINE_DRAFT.id |
| TS-F030-007 | 測試執行成功後版本狀態 draft → testing | AC-3, AC-7, BR-6 | Integration | PIPELINE_DRAFT 存在；對應 EtlPipelineVersion.status="draft" | 1. POST /api/v1/etl/pipelines/{id}/test 2. 呼叫 waitForPipelineStatus(logId, "completed", 10000) 3. 查詢 DB 中 etl_pipeline_versions.status | EtlPipelineVersion.status = "testing" |
| TS-F030-008 | 測試執行的 processed_count 不計入 Pipeline 累計統計 | BR-7 | Integration | PIPELINE_DRAFT 存在；執行前 EtlPipeline.processed_count=0 | 1. POST /api/v1/etl/pipelines/{id}/test 2. 等待測試執行完成 3. 查詢 DB 中 etl_pipelines.processed_count | EtlPipeline.processed_count 維持 0（不因測試執行增加） |

### Positive Scenarios — 排程觸發

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F030-009 | 排程時間到達自動觸發執行 | AC-6, BR-4, BR-8 | Integration | PIPELINE_SCHEDULED（status="active"、enabled=true、schedule="0 2 * * *"）；已有最新 published EtlPipelineVersion | 1. 直接呼叫 scanAndExecute(fakeNow) 其中 fakeNow = UTC 2026-01-01T02:00:00 | 系統建立新 EtlPipelineLog；triggered_by="schedule"；EtlPipelineLog.version = 最新 published EtlPipelineVersion.version |
| TS-F030-010 | 排程觸發使用最新 published 版本 | BR-4 | Integration | PIPELINE_SCHEDULED 存在；有兩個 EtlPipelineVersion（v1 published, v2 published，v2 為最新） | 1. 呼叫 scanAndExecute(fakeNow=觸發時間) | DB 中新建 EtlPipelineLog.version = 2（最新 published 版本號） |
| TS-F030-011 | 排程跳過執行中的 Pipeline | AC-6, 邊界條件 | Integration | PIPELINE_RUNNING（status="running"、enabled=true、schedule="0 2 * * *"）；DB 中已有 status="running" 的 EtlPipelineLog | 1. 呼叫 scanAndExecute(fakeNow=觸發時間) | DB 中不新增新的 EtlPipelineLog；PIPELINE_RUNNING.status 維持 "running" |
| TS-F030-012 | draft Pipeline 不被排程觸發 | BR-3 | Integration | PIPELINE_DRAFT_ENABLED（status="draft"、enabled=true、schedule="0 2 * * *"） | 1. 呼叫 scanAndExecute(fakeNow=觸發時間) | DB 中不新增 EtlPipelineLog for PIPELINE_DRAFT_ENABLED（草稿排程不觸發） |

### Positive Scenarios — 執行進度查詢

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F030-013 | 執行中查詢進度回傳完整欄位 | AC-3 | Integration | PIPELINE_ACTIVE 已執行；手動 stub EtlPipelineLog.status="running"、processedCount=500、totalCount=1000、currentNode="node-2"、currentNodeName="NULL 處理" | 1. GET /api/v1/etl/pipelines/{id}/progress | HTTP 200；response.logId 為 UUID；response.status="running"；response.processedCount=500；response.totalCount=1000；response.progressPercent=50.0；response.currentNode="node-2"；response.currentNodeName="NULL 處理" |
| TS-F030-014 | 執行成功後狀態回歸 active | 狀態機 active→running→active | Integration | PIPELINE_ACTIVE 成功執行完成 | 1. POST /api/v1/etl/pipelines/{id}/execute 2. 呼叫 waitForPipelineStatus(logId, "completed", 10000) 3. 查詢 DB 中 etl_pipelines.status | EtlPipeline.status = "active"（回歸原狀態）；EtlPipelineLog.status = "completed"；EtlPipelineLog.finished_at IS NOT NULL |
| TS-F030-015 | 執行失敗後狀態設為 failed | 狀態機 running→failed, BR-9 | Integration | PIPELINE_ACTIVE 存在；stub 執行中節點拋出錯誤 | 1. POST /api/v1/etl/pipelines/{id}/execute（stub 節點執行失敗）2. 呼叫 waitForPipelineStatus(logId, "failed", 10000) 3. 查詢 DB | EtlPipeline.status = "failed"；EtlPipelineLog.status = "failed"；EtlPipelineLog.error_message 非空；EtlPipelineLog.node_logs 含失敗節點的錯誤記錄 |

### Negative Scenarios — 後端 API

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F030-016 | 執行中 Pipeline 重複觸發 → 409 | AC-4, BR-2 | Integration | PIPELINE_RUNNING（status="running"）已存在 | 1. POST /api/v1/etl/pipelines/{PIPELINE_RUNNING.id}/execute | HTTP 409；error.code="PIPELINE_RUNNING"；DB 中不新增 EtlPipelineLog |
| TS-F030-017 | 無 definition 的 Pipeline 執行 → 422 | 邊界條件 | Integration | PIPELINE_NO_DEF（status="active"，definition=`{"nodes":[],"edges":[]}` 或未設定） | 1. POST /api/v1/etl/pipelines/{PIPELINE_NO_DEF.id}/execute | HTTP 422；error.code="PIPELINE_NO_DEFINITION"；error.message 含「Pipeline 尚未定義節點，無法執行」 |
| TS-F030-018 | Pipeline 不存在 → 404 | F030 錯誤場景 | Integration | 不存在的 UUID（NONEXISTENT_ID） | 1. POST /api/v1/etl/pipelines/{NONEXISTENT_ID}/execute | HTTP 404；error.code="PIPELINE_NOT_FOUND" |
| TS-F030-019 | User 角色無權執行 → 403 | BR-1 | Integration | USER_ACTIVE（角色 user）已登入；PIPELINE_ACTIVE 存在 | 1. 以 User JWT 呼叫 POST /api/v1/etl/pipelines/{id}/execute | HTTP 403；error.code="AUTH_FORBIDDEN" |
| TS-F030-020 | 未登入無 Token → 401 | BR-1 | Integration | 無 Authorization Header | 1. POST /api/v1/etl/pipelines/{id}/execute（不帶 Token） | HTTP 401；error.code="AUTH_TOKEN_MISSING" |

---

## Test Data Requirements

### 前置資料

| 資料集名稱 | 說明 | 關鍵欄位 |
|-----------|------|---------|
| ADMIN_USER | 具備 Admin 角色的有效帳號 | id=ADMIN_UUID, role="admin", status="active" |
| USER_ACTIVE | 具備 User 角色的有效帳號 | id=USER_UUID, role="user", status="active" |
| PIPELINE_ACTIVE | 狀態為 active 的 Pipeline | status="active", enabled=true, definition 含 1 個節點, deleted_at=NULL |
| PIPELINE_DRAFT | 狀態為 draft 的 Pipeline | status="draft", definition 含 1 個節點, deleted_at=NULL；對應 EtlPipelineVersion.status="draft" |
| PIPELINE_FAILED | 狀態為 failed 的 Pipeline | status="failed", definition 含 1 個節點, deleted_at=NULL |
| PIPELINE_RUNNING | 狀態為 running 的 Pipeline | status="running", deleted_at=NULL；DB 中已有 status="running" 的 EtlPipelineLog |
| PIPELINE_NO_DEF | 無節點定義的 Pipeline（status="active"） | status="active", definition=`{"nodes":[],"edges":[]}`, deleted_at=NULL |
| PIPELINE_SCHEDULED | 已設定排程的 active Pipeline | status="active", enabled=true, schedule="0 2 * * *"；已有 EtlPipelineVersion（status="published"） |
| PIPELINE_DRAFT_ENABLED | draft 但已設定排程的 Pipeline（驗證排程不觸發草稿） | status="draft", enabled=true, schedule="0 2 * * *" |

### 排程測試時間點

| 場景 | fakeNow 值（UTC） | 說明 |
|------|------------------|------|
| 排程觸發（TS-F030-009） | `2026-01-01T02:00:00Z` | 符合 cron `0 2 * * *` 的觸發時間 |
| 排程不觸發（TS-F030-011, TS-F030-012） | `2026-01-01T02:00:00Z` | 同觸發時間，驗證篩選邏輯 |
| 排程未到（對比組） | `2026-01-01T01:59:00Z` | 未到排程時間，不應觸發 |

### Polling Helper

```
// 等待 EtlPipelineLog 狀態達到預期值
waitForPipelineStatus(logId: string, expectedStatus: string, timeoutMs: number = 10000): Promise<void>
// 輪詢間隔：300ms
// 超時後拋出 Error("waitForPipelineStatus timeout")
```

### EtlPipelineLog 最小 definition（含 1 個節點）

```json
{
  "nodes": [
    {
      "id": "node-1",
      "type": "extract",
      "position": { "x": 0, "y": 0 },
      "data": { "taskId": "<EXTRACTION_TASK_UUID>" }
    }
  ],
  "edges": []
}
```

### DB 驗證查詢

```sql
-- 驗證 EtlPipelineLog 新增
SELECT id, pipeline_id, version, status, triggered_by, is_test_run, created_by, started_at
FROM etl_pipeline_logs
WHERE id = '<log_id>';

-- 驗證 EtlPipeline 狀態
SELECT id, status, processed_count, execution_count
FROM etl_pipelines
WHERE id = '<pipeline_id>';

-- 驗證 EtlPipelineVersion 狀態（測試執行後）
SELECT id, pipeline_id, version, status
FROM etl_pipeline_versions
WHERE pipeline_id = '<pipeline_id>'
ORDER BY version DESC
LIMIT 1;

-- 驗證排程未觸發（不存在新日誌）
SELECT COUNT(*) FROM etl_pipeline_logs
WHERE pipeline_id = '<pipeline_id>'
AND started_at > '<before_scan_time>';
```

---

## Risks and Notes

| 風險 / 注意事項 | 說明 |
|----------------|------|
| 執行成功狀態回歸邏輯（running → active vs running → draft） | data-model.md 狀態機定義：執行成功若先前為 active 則回歸 active；若先前為 draft（測試執行）則回歸 draft。實作必須記錄「執行前狀態」；測試場景 TS-F030-014 需分別驗證兩種情境 |
| scanAndExecute injectable time 的實作要求 | 排程邏輯需支援接受外部注入的 fakeNow: Date 參數（與 F023 相同模式），若實作不支援則排程測試無法在 CI 中穩定執行 — 已記錄於 risks-and-gaps.md |
| waitForPipelineStatus polling 的執行環境 | 測試執行需要實際觸發非同步執行邏輯（非 mock），否則狀態永不更新。建議搭配真實 DB（Test Container）驗證 |
| 測試執行 processed_count 隔離（TS-F030-008） | 驗證 is_test_run=true 的日誌確實不觸發 EtlPipeline.processed_count 遞增；需注意 execution_count 是否也應排除（規格未明確說明 execution_count 是否排除測試執行）— 需向 Product 確認 |
| PIPELINE_NO_DEFINITION 的判定條件 | 規格定義「至少包含一個節點」才可執行，但未說明 definition 欄位為 NULL 與 `{"nodes":[],"edges":[]}` 是否均觸發同一錯誤碼 — 需向實作者確認判定邏輯，兩種情況均應納入測試 |
| 排程觸發的 created_by 欄位 | EtlPipelineLog.created_by 排程觸發時記錄「建立者（Pipeline.created_by）」（與 F023 ExtractionLog 相同模式），非系統帳號 — TS-F030-009 需驗證此欄位值 |
| 進度查詢 API 的 totalCount 來源 | GET /progress 的 totalCount 計算方式（來自哪個節點的輸出行數、或執行前估算值）規格未詳細說明，測試 TS-F030-013 目前採用 stub 方式繞過此不確定性 |
