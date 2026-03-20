---
type: test-design-feature
feature_id: F032
feature_name: 查看 Pipeline 日誌
priority: P0-MVP
related_spec: /docs/specs/features/F032-pipeline-logs.md
last_updated: 2026-03-20
---

# F032: 查看 Pipeline 日誌 — 測試設計

---

## Acceptance Test Design

### AC-1: 日誌列表欄位完整性與排序

| 項目 | 內容 |
|------|------|
| Given | 一個已有多筆執行紀錄的 Pipeline（含 manual、schedule、test、retry 各種觸發方式） |
| When | Admin 呼叫 `GET /api/v1/etl/pipelines/:id/logs` |
| Then | HTTP 200；`data` 陣列每筆物件含 id、version、status、startedAt、finishedAt、durationMs、processedCount、triggeredBy、isTestRun；依 startedAt 降序排列（最新在前） |
| 驗證步驟 | 1. 驗證 HTTP 狀態碼為 200<br>2. 驗證每筆物件含上述 9 個欄位（不含額外欄位 nodeLogs）<br>3. 驗證 data[0].startedAt >= data[1].startedAt >= …（降序）<br>4. 驗證 pagination 物件含 page、pageSize、total、totalPages |

### AC-2: 日誌詳情 nodeLogs 陣列

| 項目 | 內容 |
|------|------|
| Given | 一筆已完成的 EtlPipelineLog，包含 3 個節點的執行紀錄（extract → transform → load） |
| When | Admin 呼叫 `GET /api/v1/etl/logs/:logId` |
| Then | HTTP 200；回應含頂層摘要欄位（id、pipelineId、pipelineName、version、status、startedAt、finishedAt、durationMs、processedCount、errorMessage、triggeredBy、isTestRun）；nodeLogs 陣列長度為 3；每個節點含 nodeId、nodeName、nodeType、status、processedCount、durationMs、errorMessage |
| 驗證步驟 | 1. 驗證 HTTP 狀態碼為 200<br>2. 驗證頂層欄位完整性（12 個欄位全部存在）<br>3. 驗證 nodeLogs.length = 3<br>4. 驗證每個 nodeLog 含 7 個欄位<br>5. 驗證節點順序與 Pipeline definition 的節點執行順序一致 |

### AC-3: 測試執行標記（isTestRun=true）

| 項目 | 內容 |
|------|------|
| Given | 一筆由測試執行產生的 EtlPipelineLog（triggered_by="test"、is_test_run=true） |
| When | Admin 查看日誌列表及詳情 |
| Then | 列表回應中該筆 isTestRun=true、triggeredBy="test"；詳情回應的 isTestRun=true |
| 驗證步驟 | 1. 驗證列表中對應記錄 isTestRun=true<br>2. 驗證列表中對應記錄 triggeredBy="test"<br>3. 呼叫 GET /api/v1/etl/logs/:logId，驗證 isTestRun=true<br>4. 驗證 triggeredBy="test" |

### AC-4: 失敗日誌錯誤訊息

| 項目 | 內容 |
|------|------|
| Given | 一筆 status="failed" 的 EtlPipelineLog，error_message 非空，且某節點的 node_logs 含錯誤訊息 |
| When | Admin 呼叫 `GET /api/v1/etl/logs/:logId` |
| Then | 頂層 errorMessage 非空；nodeLogs 中失敗節點的 errorMessage 非空；其他成功節點的 errorMessage=null |
| 驗證步驟 | 1. 驗證 HTTP 200<br>2. 驗證 response.errorMessage 非空字串<br>3. 驗證 nodeLogs 中 status="failed" 的節點 errorMessage 非空<br>4. 驗證 nodeLogs 中 status="completed" 的節點 errorMessage=null |

### AC-5: 分頁

| 項目 | 內容 |
|------|------|
| Given | 一個 Pipeline 有 25 筆執行紀錄 |
| When | Admin 呼叫 `GET /api/v1/etl/pipelines/:id/logs?page=1&pageSize=10` |
| Then | HTTP 200；data.length=10；pagination.total=25；pagination.totalPages=3；pagination.page=1 |
| 驗證步驟 | 1. 驗證 data.length=10<br>2. 驗證 pagination.total=25<br>3. 驗證 pagination.totalPages=3（ceil(25/10)）<br>4. 第 3 頁呼叫（page=3）data.length=5 |

### AC-6: 空狀態

| 項目 | 內容 |
|------|------|
| Given | 一個尚未執行過的 Pipeline（etl_pipeline_logs 中無對應紀錄） |
| When | Admin 呼叫 `GET /api/v1/etl/pipelines/:id/logs` |
| Then | HTTP 200；data 為空陣列；pagination.total=0 |
| 驗證步驟 | 1. 驗證 HTTP 200<br>2. 驗證 data=[]<br>3. 驗證 pagination.total=0<br>4. 驗證 pagination.totalPages=0 |

---

## Test Scenarios

### Positive Scenarios — 日誌列表

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F032-001 | 日誌列表欄位完整性驗證 | AC-1, BR-2 | Integration | Admin 已登入；PIPELINE_WITH_LOGS（已有 3 筆執行紀錄，triggered_by 分別為 manual / schedule / retry） | 1. GET /api/v1/etl/pipelines/{PIPELINE_WITH_LOGS.id}/logs，帶 Admin JWT | HTTP 200；data.length=3；每筆含 id（UUID）、version（整數）、status、startedAt（ISO 8601）、finishedAt（ISO 8601）、durationMs（整數）、processedCount（整數）、triggeredBy（列舉值）、isTestRun（布林值）；不含 nodeLogs 欄位 |
| TS-F032-002 | 日誌列表依 startedAt 降序排列 | AC-1, BR-2 | Integration | Admin 已登入；PIPELINE_WITH_LOGS 有 3 筆紀錄，started_at 分別為 T1 < T2 < T3 | 1. GET /api/v1/etl/pipelines/{id}/logs | data[0].startedAt = T3；data[1].startedAt = T2；data[2].startedAt = T1（最新在前） |
| TS-F032-003 | 日誌列表含 pagination 物件 | AC-5 | Integration | Admin 已登入；PIPELINE_WITH_LOGS 有 3 筆紀錄 | 1. GET /api/v1/etl/pipelines/{id}/logs | 回應含 pagination.page=1；pagination.pageSize=10；pagination.total=3；pagination.totalPages=1 |

### Positive Scenarios — 日誌詳情

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F032-004 | 日誌詳情頂層欄位完整性 | AC-2 | Integration | Admin 已登入；LOG_COMPLETED（status="completed"，含 3 個節點的 node_logs，triggered_by="manual"） | 1. GET /api/v1/etl/logs/{LOG_COMPLETED.id}，帶 Admin JWT | HTTP 200；回應含 id、pipelineId、pipelineName（字串非空）、version、status="completed"、startedAt、finishedAt（非 null）、durationMs（正整數）、processedCount（非負整數）、errorMessage=null、triggeredBy="manual"、isTestRun=false |
| TS-F032-005 | 日誌詳情 nodeLogs 陣列欄位驗證 | AC-2 | Integration | LOG_COMPLETED 含 3 個節點（1 個 extract、1 個 transform-null-handler、1 個 load） | 1. GET /api/v1/etl/logs/{LOG_COMPLETED.id} | nodeLogs.length=3；每個節點含 nodeId（非空字串）、nodeName（非空字串）、nodeType（非空字串）、status="completed"、processedCount（非負整數）、durationMs（非負整數）、errorMessage=null |
| TS-F032-006 | 日誌詳情 nodeLogs 節點類型正確對應 | AC-2 | Integration | LOG_COMPLETED 節點依序為 extract → transform-null-handler → load | 1. GET /api/v1/etl/logs/{LOG_COMPLETED.id} | nodeLogs[0].nodeType="extract"；nodeLogs[1].nodeType="transform-null-handler"；nodeLogs[2].nodeType="load" |

### Positive Scenarios — 測試執行標記

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F032-007 | 日誌列表中測試執行標記為 isTestRun=true | AC-3, BR-4 | Integration | Admin 已登入；PIPELINE_WITH_TEST_LOG（含一筆 is_test_run=true、triggered_by="test" 的 EtlPipelineLog） | 1. GET /api/v1/etl/pipelines/{id}/logs | data 中對應記錄：isTestRun=true；triggeredBy="test" |
| TS-F032-008 | 日誌詳情中測試執行 isTestRun=true | AC-3, BR-4 | Integration | LOG_TEST（is_test_run=true、triggered_by="test"、status="completed"） | 1. GET /api/v1/etl/logs/{LOG_TEST.id} | HTTP 200；isTestRun=true；triggeredBy="test" |

### Positive Scenarios — 失敗日誌

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F032-009 | 失敗日誌頂層 errorMessage 非空 | AC-4 | Integration | Admin 已登入；LOG_FAILED（status="failed"、error_message="Load 節點寫入失敗：目標表欄位不符"、node_logs 含 2 個 completed 節點 + 1 個 failed 節點） | 1. GET /api/v1/etl/logs/{LOG_FAILED.id} | HTTP 200；status="failed"；errorMessage="Load 節點寫入失敗：目標表欄位不符"（非空，非 null） |
| TS-F032-010 | 失敗節點 errorMessage 非空，成功節點為 null | AC-4 | Integration | LOG_FAILED 的 node_logs：node-1（completed）、node-2（completed）、node-3（failed，errorMessage 非空） | 1. GET /api/v1/etl/logs/{LOG_FAILED.id} | nodeLogs[0].status="completed"；nodeLogs[0].errorMessage=null；nodeLogs[1].status="completed"；nodeLogs[1].errorMessage=null；nodeLogs[2].status="failed"；nodeLogs[2].errorMessage 非空字串 |

### Positive Scenarios — 執行中日誌

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F032-011 | 執行中日誌 finishedAt=null、durationMs=null | 邊界條件 | Integration | Admin 已登入；LOG_RUNNING（status="running"、finished_at=NULL、duration_ms=NULL） | 1. GET /api/v1/etl/logs/{LOG_RUNNING.id} | HTTP 200；status="running"；finishedAt=null；durationMs=null |

### Positive Scenarios — 分頁

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F032-012 | 分頁：第 1 頁 10 筆 | AC-5 | Integration | Admin 已登入；PIPELINE_WITH_25_LOGS（有 25 筆執行紀錄） | 1. GET /api/v1/etl/pipelines/{id}/logs?page=1&pageSize=10 | data.length=10；pagination.total=25；pagination.totalPages=3；pagination.page=1；pagination.pageSize=10 |
| TS-F032-013 | 分頁：最後一頁 5 筆 | AC-5 | Integration | PIPELINE_WITH_25_LOGS 存在 | 1. GET /api/v1/etl/pipelines/{id}/logs?page=3&pageSize=10 | data.length=5；pagination.page=3；pagination.total=25 |

### Positive Scenarios — 空狀態

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F032-014 | 無執行紀錄時回傳空陣列 | AC-6 | Integration | Admin 已登入；PIPELINE_NO_LOGS（etl_pipeline_logs 中無該 pipeline_id 的紀錄） | 1. GET /api/v1/etl/pipelines/{PIPELINE_NO_LOGS.id}/logs | HTTP 200；data=[]；pagination.total=0；pagination.totalPages=0 |

### Positive Scenarios — 軟刪除後日誌仍可存取

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F032-015 | 軟刪除 Pipeline 後日誌列表仍可存取 | BR-5 | Integration | Admin 已登入；PIPELINE_SOFT_DELETED（deleted_at IS NOT NULL）；該 Pipeline 有 2 筆 EtlPipelineLog | 1. GET /api/v1/etl/pipelines/{PIPELINE_SOFT_DELETED.id}/logs | HTTP 200；data.length=2（日誌不隨 Pipeline 軟刪除而清除） |
| TS-F032-016 | 軟刪除 Pipeline 後個別日誌詳情仍可存取 | BR-5 | Integration | PIPELINE_SOFT_DELETED 存在；LOG_FROM_DELETED_PIPELINE（關聯至 PIPELINE_SOFT_DELETED） | 1. GET /api/v1/etl/logs/{LOG_FROM_DELETED_PIPELINE.id} | HTTP 200；回應含完整日誌詳情（pipelineId=PIPELINE_SOFT_DELETED.id）；nodeLogs 正常回傳 |

### Negative Scenarios — 後端 API

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F032-017 | Pipeline 不存在 → 日誌列表 404 | BR-1 | Integration | 不存在的 UUID（NONEXISTENT_PIPELINE_ID） | 1. GET /api/v1/etl/pipelines/{NONEXISTENT_PIPELINE_ID}/logs，帶 Admin JWT | HTTP 404；error.code="PIPELINE_NOT_FOUND" |
| TS-F032-018 | Log 不存在 → 日誌詳情 404 | 錯誤場景 | Integration | 不存在的 UUID（NONEXISTENT_LOG_ID） | 1. GET /api/v1/etl/logs/{NONEXISTENT_LOG_ID}，帶 Admin JWT | HTTP 404；error.code 為已定義的 LOG_NOT_FOUND 或 PIPELINE_NOT_FOUND（視實作決定，需向 Arch 確認） |
| TS-F032-019 | User 角色無權查看日誌列表 → 403 | BR-1 | Integration | USER_ACTIVE（角色 user）已登入；PIPELINE_WITH_LOGS 存在 | 1. 以 User JWT 呼叫 GET /api/v1/etl/pipelines/{id}/logs | HTTP 403；error.code="AUTH_FORBIDDEN" |
| TS-F032-020 | User 角色無權查看日誌詳情 → 403 | BR-1 | Integration | USER_ACTIVE 已登入；LOG_COMPLETED 存在 | 1. 以 User JWT 呼叫 GET /api/v1/etl/logs/{LOG_COMPLETED.id} | HTTP 403；error.code="AUTH_FORBIDDEN" |
| TS-F032-021 | 未登入無 Token → 401 | BR-1 | Integration | 無 Authorization Header | 1. GET /api/v1/etl/pipelines/{id}/logs（不帶 Token） | HTTP 401；error.code="AUTH_TOKEN_MISSING" |

---

## Test Data Requirements

### 前置資料

| 資料集名稱 | 說明 | 關鍵欄位 |
|-----------|------|---------|
| ADMIN_USER | 具備 Admin 角色的有效帳號 | id=ADMIN_UUID, role="admin", status="active" |
| USER_ACTIVE | 具備 User 角色的有效帳號 | id=USER_UUID, role="user", status="active" |
| PIPELINE_WITH_LOGS | 有 3 筆執行紀錄的 Pipeline | status="active", deleted_at=NULL；對應 3 筆 EtlPipelineLog（triggered_by 分別為 manual / schedule / retry，started_at 依序遞增） |
| PIPELINE_WITH_TEST_LOG | 有測試執行紀錄的 Pipeline | status="draft", deleted_at=NULL；含 1 筆 is_test_run=true、triggered_by="test" 的 EtlPipelineLog |
| PIPELINE_NO_LOGS | 無任何執行紀錄的 Pipeline | status="active", deleted_at=NULL；etl_pipeline_logs 中無對應紀錄 |
| PIPELINE_WITH_25_LOGS | 有 25 筆執行紀錄的 Pipeline | status="active", deleted_at=NULL；對應 25 筆 EtlPipelineLog（started_at 各不相同） |
| PIPELINE_SOFT_DELETED | 已軟刪除的 Pipeline | deleted_at IS NOT NULL；對應 2 筆 EtlPipelineLog |
| LOG_COMPLETED | 已完成的執行日誌（3 個節點） | status="completed"、triggered_by="manual"、is_test_run=false、finished_at IS NOT NULL、duration_ms 正整數；node_logs 含 3 個節點（extract / transform-null-handler / load，均 completed，errorMessage=null） |
| LOG_FAILED | 失敗的執行日誌（3 個節點，最後一個失敗） | status="failed"、error_message 非空；node_logs 含 3 個節點（node-1 completed、node-2 completed、node-3 failed，errorMessage 非空） |
| LOG_RUNNING | 執行中的執行日誌 | status="running"、finished_at=NULL、duration_ms=NULL |
| LOG_TEST | 測試執行的日誌 | is_test_run=true、triggered_by="test"、status="completed" |
| LOG_FROM_DELETED_PIPELINE | 關聯至 PIPELINE_SOFT_DELETED 的日誌 | pipeline_id=PIPELINE_SOFT_DELETED.id、status="completed" |

### EtlPipelineLog node_logs 測試資料（LOG_COMPLETED）

```json
[
  {
    "nodeId": "node-1",
    "nodeName": "Extract: raw_a3f2c1d4",
    "nodeType": "extract",
    "status": "completed",
    "processedCount": 1000,
    "durationMs": 2000,
    "errorMessage": null
  },
  {
    "nodeId": "node-2",
    "nodeName": "NULL 處理",
    "nodeType": "transform-null-handler",
    "status": "completed",
    "processedCount": 950,
    "durationMs": 1500,
    "errorMessage": null
  },
  {
    "nodeId": "node-3",
    "nodeName": "Load: customer_core",
    "nodeType": "load",
    "status": "completed",
    "processedCount": 950,
    "durationMs": 1500,
    "errorMessage": null
  }
]
```

### EtlPipelineLog node_logs 測試資料（LOG_FAILED）

```json
[
  {
    "nodeId": "node-1",
    "nodeName": "Extract: raw_a3f2c1d4",
    "nodeType": "extract",
    "status": "completed",
    "processedCount": 1000,
    "durationMs": 2000,
    "errorMessage": null
  },
  {
    "nodeId": "node-2",
    "nodeName": "NULL 處理",
    "nodeType": "transform-null-handler",
    "status": "completed",
    "processedCount": 950,
    "durationMs": 1500,
    "errorMessage": null
  },
  {
    "nodeId": "node-3",
    "nodeName": "Load: customer_core",
    "nodeType": "load",
    "status": "failed",
    "processedCount": 0,
    "durationMs": 300,
    "errorMessage": "Load 節點寫入失敗：目標表欄位不符"
  }
]
```

### DB 驗證查詢

```sql
-- 驗證日誌列表降序排列
SELECT id, started_at
FROM etl_pipeline_logs
WHERE pipeline_id = '<pipeline_id>'
ORDER BY started_at DESC;

-- 驗證日誌不隨 Pipeline 軟刪除清除
SELECT COUNT(*) FROM etl_pipeline_logs
WHERE pipeline_id = '<soft_deleted_pipeline_id>';

-- 驗證 running 狀態日誌欄位
SELECT id, status, finished_at, duration_ms
FROM etl_pipeline_logs
WHERE id = '<log_id>';

-- 驗證測試執行標記
SELECT id, is_test_run, triggered_by
FROM etl_pipeline_logs
WHERE pipeline_id = '<pipeline_id>'
AND is_test_run = true;
```

---

## Risks and Notes

| 風險 / 注意事項 | 說明 |
|----------------|------|
| LOG_NOT_FOUND 錯誤碼未定義（TS-F032-018） | F032 規格的錯誤碼表中，`GET /api/v1/etl/logs/:logId` 僅列出 PIPELINE_NOT_FOUND（404），未說明 logId 本身不存在時的錯誤碼。需向 Architecture 確認是否應新增 PIPELINE_LOG_NOT_FOUND（404）錯誤碼，或複用 PIPELINE_NOT_FOUND。測試場景 TS-F032-018 的預期錯誤碼留待確認後補充 |
| 軟刪除 Pipeline 的日誌列表端點行為（BR-5 vs PIPELINE_NOT_FOUND） | F032 規格 BR-5 說明「日誌不隨 Pipeline 軟刪除而清除」，但 API 規格錯誤表將 PIPELINE_NOT_FOUND 定義為「不存在或已刪除」。需向 Architecture 確認：`GET /api/v1/etl/pipelines/:id/logs` 在 Pipeline 已軟刪除時，應回傳 200（含日誌）還是 404。TS-F032-015 以規格 BR-5 精神（200）為預期，若確認行為不同則需修正 |
| nodeLogs 節點順序的定義 | 規格未明確說明 nodeLogs 陣列的排列順序（依 Pipeline definition 節點順序 vs 依實際執行開始時間排序）。測試 TS-F032-006 假設按執行順序排列；若排列方式不同，驗證邏輯需調整 |
| 分頁預設值的邊界行為 | 規格定義 pageSize 預設為 10，但未說明 pageSize=0 或 pageSize 為負數時的行為。應向實作者確認並補充邊界負測試 |
| 時區顯示（BR-3）為前端責任 | BR-3 說明後端儲存 UTC，前端顯示轉換為 UTC+8。API 回應的 startedAt / finishedAt 均為 UTC ISO 8601 格式。前端顯示格式（`YYYY-MM-DD HH:mm:ss` UTC+8）屬於前端 E2E 測試範疇，本 spec 不涵蓋 |
