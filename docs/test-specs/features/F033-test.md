---
type: test-design-feature
feature_id: F033
feature_name: Pipeline 版本管理
priority: P1
related_spec: /docs/specs/features/F033-pipeline-version.md
last_updated: 2026-03-20
---

# F033: Pipeline 版本管理 — 測試設計

---

## Acceptance Test Design

### AC-1: 版本歷史清單

| 項目 | 內容 |
|------|------|
| Given | 一個已有多個版本（v1、v2）的 Pipeline，Admin 已登入 |
| When | 呼叫 `GET /api/v1/etl/pipelines/:id/versions` |
| Then | HTTP 200；回應 `data` 陣列依版本號降序排列；每筆含 id、version、status、changeSummary、createdBy、createdAt 欄位 |
| 驗證步驟 | 1. 驗證 HTTP 狀態碼為 200<br>2. 驗證 `data[0].version > data[1].version`（降序）<br>3. 驗證每筆記錄含 id（UUID）、version（整數）、status（draft/testing/published）、changeSummary、createdBy（字串）、createdAt（ISO 8601）<br>4. 驗證 `data` 不含 `definition` 欄位（清單不回傳完整定義） |

### AC-2: 版本詳情（含完整 definition）

| 項目 | 內容 |
|------|------|
| Given | Pipeline 已有版本 v1，Admin 已登入 |
| When | 呼叫 `GET /api/v1/etl/pipelines/:id/versions/:versionId` |
| Then | HTTP 200；回應含完整欄位，包括 `definition`（JSONB，含 nodes 與 edges） |
| 驗證步驟 | 1. 驗證 HTTP 狀態碼為 200<br>2. 驗證回應含 id、pipelineId、version、status、definition、changeSummary、createdBy、createdAt<br>3. 驗證 `definition.nodes` 為陣列；`definition.edges` 為陣列 |

### AC-3: Diff 比對（兩個不同版本）

| 項目 | 內容 |
|------|------|
| Given | Pipeline 已有版本 v1 與 v2，兩版本節點有差異，Admin 已登入 |
| When | 呼叫 `GET /api/v1/etl/pipelines/:id/versions/diff?from=1&to=2` |
| Then | HTTP 200；回應含 from=1、to=2、changes 物件；changes 含 nodesAdded、nodesRemoved、nodesModified、edgesAdded、edgesRemoved 五個陣列 |
| 驗證步驟 | 1. 驗證 HTTP 狀態碼為 200<br>2. 驗證 `response.from = 1`、`response.to = 2`<br>3. 驗證 `changes` 物件含全部五個差異鍵<br>4. 驗證 nodesAdded 中每筆含 nodeId、nodeType、nodeName<br>5. 驗證 nodesModified 中每筆含 nodeId、field、oldValue、newValue<br>6. 驗證 edgesAdded/edgesRemoved 中每筆含 source、target |

### AC-4: 回滾到指定版本

| 項目 | 內容 |
|------|------|
| Given | Pipeline 目前最新版本為 v2，Admin 選擇回滾至 v1 |
| When | 呼叫 `POST /api/v1/etl/pipelines/:id/versions/:versionId/rollback`（versionId 為 v1 的 UUID） |
| Then | HTTP 201；回應新版本號為 3（遞增）、status="draft"、changeSummary="回滾自版本 1"；DB 中建立新 EtlPipelineVersion，definition 內容複製自 v1；v1 與 v2 原始記錄不修改 |
| 驗證步驟 | 1. 驗證 HTTP 狀態碼為 201<br>2. 驗證回應 `version = 3`（遞增自 v2）<br>3. 驗證回應 `status = "draft"`<br>4. 驗證回應 `changeSummary` 含「回滾自版本 1」<br>5. 查詢 DB 確認新版本 definition 與 v1 完全相同<br>6. 查詢 DB 確認原始 v1、v2 記錄未被修改 |

### AC-5: 發布 testing 版本

| 項目 | 內容 |
|------|------|
| Given | Pipeline 有一個狀態為 `testing` 的版本（已通過測試執行），Admin 已登入 |
| When | 呼叫 `PATCH /api/v1/etl/pipelines/:id/versions/:versionId/publish` |
| Then | HTTP 200；回應含 version、status="published"、publishedAt；DB 中 EtlPipelineVersion.status 更新為 "published"；EtlPipeline.version 更新為此版本號 |
| 驗證步驟 | 1. 驗證 HTTP 狀態碼為 200<br>2. 驗證回應 `status = "published"`<br>3. 驗證回應 `publishedAt` 為合法 ISO 8601 時間戳<br>4. 查詢 DB 確認 etl_pipeline_versions.status = "published"<br>5. 查詢 DB 確認 etl_pipelines.version = 此版本號 |

### AC-6: draft 版本無法發布（需先完成測試執行）

| 項目 | 內容 |
|------|------|
| Given | Pipeline 有一個狀態為 `draft` 的版本（從未通過測試執行） |
| When | 呼叫 `PATCH /api/v1/etl/pipelines/:id/versions/:versionId/publish` |
| Then | HTTP 422；error.code = "PIPELINE_PUBLISH_REQUIRES_TEST"；DB 中版本狀態不變 |

### AC-7: 排程引擎使用最新 published 版本

| 項目 | 內容 |
|------|------|
| Given | Pipeline 有 v1（published）和 v2（published），已有最新 v2 為 published；排程引擎觸發 |
| When | 呼叫 `scanAndExecute(fakeNow)` 在 Pipeline 排程觸發時間點 |
| Then | 新建 EtlPipelineLog 使用版本 v2（最新 published 版本） |

---

## Test Scenarios

### Positive Scenarios — 版本清單

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F033-001 | 版本清單依版本號降序排列 | AC-1, BR-7 | Integration | Admin 已登入；PIPELINE_WITH_VERSIONS（有 v1、v2、v3 三個版本） | 1. GET /api/v1/etl/pipelines/{PIPELINE_WITH_VERSIONS.id}/versions，帶 Admin JWT | HTTP 200；`data[0].version = 3`；`data[1].version = 2`；`data[2].version = 1`（降序） |
| TS-F033-002 | 版本清單欄位完整性驗證 | AC-1, BR-7 | Integration | Admin 已登入；PIPELINE_WITH_VERSIONS（至少一個版本） | 1. GET /api/v1/etl/pipelines/{id}/versions | HTTP 200；`data[0]` 含 id（UUID 格式）、version（整數）、status（枚舉值之一）、changeSummary（字串或 null）、createdBy（非空字串，使用者姓名）、createdAt（ISO 8601）；`data[0]` 不含 `definition` 欄位 |
| TS-F033-003 | 版本清單含所有狀態（draft/testing/published） | AC-1 | Integration | Admin 已登入；PIPELINE_ALL_STATUSES（含三種版本狀態） | 1. GET /api/v1/etl/pipelines/{id}/versions | `data` 陣列中存在 status="draft"、status="testing"、status="published" 的記錄 |

### Positive Scenarios — 版本詳情

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F033-004 | 版本詳情含完整 definition JSONB | AC-2 | Integration | Admin 已登入；PIPELINE_WITH_VERSIONS（v1 已知 definition） | 1. GET /api/v1/etl/pipelines/{id}/versions/{v1Id} | HTTP 200；response.id = v1Id；response.pipelineId = pipeline.id；response.version = 1；response.definition.nodes 為陣列；response.definition.edges 為陣列；response.changeSummary、response.createdBy、response.createdAt 均存在 |
| TS-F033-005 | 版本詳情 definition 內容與建立時完全一致（JSONB 完整性） | AC-2 | Integration | Admin 已登入；已知 SEED_DEFINITION_V1（含特定 node id 與 data） | 1. 建立版本時寫入 SEED_DEFINITION_V1 2. GET /api/v1/etl/pipelines/{id}/versions/{v1Id} | response.definition 與 SEED_DEFINITION_V1 深度比對完全一致（節點 id、type、position、data、edge id、source、target 均相符） |

### Positive Scenarios — Diff 比對

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F033-006 | Diff 比對：nodesAdded 正確識別新增節點 | AC-2, AC-3（Diff） | Integration | Admin 已登入；PIPELINE_DIFF（v1 含 node-1、node-2；v2 新增 node-3） | 1. GET /api/v1/etl/pipelines/{id}/versions/diff?from=1&to=2 | HTTP 200；changes.nodesAdded 含一筆記錄，nodeId="node-3"；changes.nodesRemoved 為空陣列 |
| TS-F033-007 | Diff 比對：nodesRemoved 正確識別刪除節點 | AC-2, AC-3（Diff） | Integration | Admin 已登入；PIPELINE_DIFF（v2 相較 v1 移除了 node-2） | 1. GET /api/v1/etl/pipelines/{id}/versions/diff?from=1&to=2 | HTTP 200；changes.nodesRemoved 含一筆記錄，nodeId="node-2"；changes.nodesAdded 為空陣列 |
| TS-F033-008 | Diff 比對：nodesModified 正確識別修改節點 | AC-2, AC-3（Diff） | Integration | Admin 已登入；PIPELINE_DIFF（v2 相較 v1 修改了 node-2 的 data.strategy） | 1. GET /api/v1/etl/pipelines/{id}/versions/diff?from=1&to=2 | HTTP 200；changes.nodesModified 含一筆記錄，nodeId="node-2"、field="data.strategy"、oldValue="default_value"、newValue="remove_row" |
| TS-F033-009 | Diff 比對：edgesAdded 與 edgesRemoved 正確識別連線變化 | AC-2, AC-3（Diff） | Integration | Admin 已登入；PIPELINE_DIFF（v2 相較 v1 新增 node-3→node-4 連線，移除 node-1→node-2 連線） | 1. GET /api/v1/etl/pipelines/{id}/versions/diff?from=1&to=2 | HTTP 200；changes.edgesAdded 含 {source:"node-3", target:"node-4"}；changes.edgesRemoved 含 {source:"node-1", target:"node-2"} |
| TS-F033-010 | Diff 比對：相同版本（from=to）回傳全空差異 | 邊界條件 | Integration | Admin 已登入；PIPELINE_WITH_VERSIONS（v1 存在） | 1. GET /api/v1/etl/pipelines/{id}/versions/diff?from=1&to=1 | HTTP 200；changes.nodesAdded = []；changes.nodesRemoved = []；changes.nodesModified = []；changes.edgesAdded = []；changes.edgesRemoved = [] |

### Positive Scenarios — 回滾

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F033-011 | 回滾建立新版本（status=draft，版本號遞增） | AC-3, BR-4 | Integration | Admin 已登入；PIPELINE_WITH_VERSIONS（最新版本 v2）；v1 的 definition 為 SEED_DEFINITION_V1 | 1. POST /api/v1/etl/pipelines/{id}/versions/{v1Id}/rollback，帶 Admin JWT | HTTP 201；response.version = 3；response.status = "draft"；response.changeSummary 含「回滾自版本 1」；response.createdAt 為合法 ISO 8601 |
| TS-F033-012 | 回滾後 definition 內容與來源版本完全一致 | AC-3, BR-4 | Integration | Admin 已登入；PIPELINE_WITH_VERSIONS；v1 的 definition = SEED_DEFINITION_V1 | 1. POST /api/v1/etl/pipelines/{id}/versions/{v1Id}/rollback 2. GET /api/v1/etl/pipelines/{id}/versions/{newVersionId} | response.definition 與 SEED_DEFINITION_V1 深度比對完全一致（複製而非參照） |
| TS-F033-013 | 回滾不修改原始版本（舊版本保持不變） | AC-3, BR-4 | Integration | Admin 已登入；PIPELINE_WITH_VERSIONS（v1、v2 均存在） | 1. POST /api/v1/etl/pipelines/{id}/versions/{v1Id}/rollback 2. GET /api/v1/etl/pipelines/{id}/versions/{v1Id} 3. GET /api/v1/etl/pipelines/{id}/versions/{v2Id} | v1 記錄的 status、definition、changeSummary、created_at 均與回滾前完全相同；v2 記錄同樣不被修改 |

### Positive Scenarios — 發布

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F033-014 | 發布 testing 版本 → status 更新為 published | AC-4, BR-2, BR-3, BR-6 | Integration | Admin 已登入；PIPELINE_TESTING（含一個 status="testing" 的版本 v1，已有成功測試執行記錄） | 1. PATCH /api/v1/etl/pipelines/{id}/versions/{v1Id}/publish，帶 Admin JWT | HTTP 200；response.status = "published"；response.publishedAt 為合法 ISO 8601；DB etl_pipeline_versions.status = "published"；DB etl_pipelines.version = 1 |
| TS-F033-015 | 發布後 EtlPipeline.version 更新為新版本號 | AC-4, BR-6 | Integration | Admin 已登入；PIPELINE_TESTING（v2 status="testing"，目前 EtlPipeline.version=1） | 1. PATCH /api/v1/etl/pipelines/{id}/versions/{v2Id}/publish 2. 查詢 DB etl_pipelines.version | DB etl_pipelines.version = 2（更新為發布版本號） |
| TS-F033-016 | 發布新版本不影響舊 published 版本狀態 | AC-4, 邊界條件 | Integration | Admin 已登入；PIPELINE（v1 status="published"，v2 status="testing"） | 1. PATCH /api/v1/etl/pipelines/{id}/versions/{v2Id}/publish 2. 查詢 DB etl_pipeline_versions WHERE id = v1Id | v1 的 status 維持 "published"（舊版本保留，不被修改） |
| TS-F033-017 | 排程引擎使用最新 published 版本（非舊版） | AC-6, BR-5 | Integration | PIPELINE_SCHEDULED（status="active"、enabled=true、schedule="0 2 * * *"）；v1 published, v2 published（v2 較新） | 1. 呼叫 scanAndExecute(fakeNow = UTC 2026-01-01T02:00:00) | 新建 EtlPipelineLog.version = 2（最新 published 版本號） |

### Negative Scenarios — 發布前置條件驗證

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F033-018 | draft 版本發布 → 422 PIPELINE_PUBLISH_REQUIRES_TEST | AC-5, AC-6, BR-3 | Integration | Admin 已登入；PIPELINE_DRAFT_VERSION（含 status="draft" 的版本，無成功測試執行記錄） | 1. PATCH /api/v1/etl/pipelines/{id}/versions/{draftVersionId}/publish | HTTP 422；error.code = "PIPELINE_PUBLISH_REQUIRES_TEST"；error.message = "請先完成測試執行"；DB 版本 status 維持 "draft" |
| TS-F033-019 | testing 但無成功測試執行記錄 → 422 PIPELINE_PUBLISH_REQUIRES_TEST | AC-5, AC-6, BR-3 | Integration | Admin 已登入；版本 status="testing"（手動強制設定，但無任何 EtlPipelineLog 記錄 is_test_run=true AND status="completed"） | 1. PATCH /api/v1/etl/pipelines/{id}/versions/{testingVersionId}/publish | HTTP 422；error.code = "PIPELINE_PUBLISH_REQUIRES_TEST" |

### Negative Scenarios — 版本/Pipeline 不存在

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F033-020 | Pipeline 不存在 → GET 版本清單 404 | BR-1 | Integration | 不存在的 UUID（NONEXISTENT_PIPELINE_ID） | 1. GET /api/v1/etl/pipelines/{NONEXISTENT_PIPELINE_ID}/versions | HTTP 404；error.code = "PIPELINE_NOT_FOUND" |
| TS-F033-021 | 版本不存在 → GET 版本詳情 404 | 錯誤場景 | Integration | PIPELINE_WITH_VERSIONS 存在；不存在的版本 UUID（NONEXISTENT_VERSION_ID） | 1. GET /api/v1/etl/pipelines/{id}/versions/{NONEXISTENT_VERSION_ID} | HTTP 404；error.code = "PIPELINE_VERSION_NOT_FOUND" |
| TS-F033-022 | 版本不存在 → Diff 比對 404 | 邊界條件 | Integration | PIPELINE_WITH_VERSIONS（僅一個版本 v1）；查詢 from=1&to=999（v999 不存在） | 1. GET /api/v1/etl/pipelines/{id}/versions/diff?from=1&to=999 | HTTP 404；error.code = "PIPELINE_VERSION_NOT_FOUND" |
| TS-F033-023 | 僅一個版本時呼叫 Diff → 404（目標版本不存在） | 邊界條件（僅一個版本） | Integration | PIPELINE_SINGLE_VERSION（僅有 v1，無 v2）；Admin 已登入 | 1. GET /api/v1/etl/pipelines/{id}/versions/diff?from=1&to=2 | HTTP 404；error.code = "PIPELINE_VERSION_NOT_FOUND"（v2 不存在） |
| TS-F033-024 | 版本不存在 → 回滾 404 | 錯誤場景 | Integration | PIPELINE_WITH_VERSIONS 存在 | 1. POST /api/v1/etl/pipelines/{id}/versions/{NONEXISTENT_VERSION_ID}/rollback | HTTP 404；error.code = "PIPELINE_VERSION_NOT_FOUND" |
| TS-F033-025 | 版本不存在 → 發布 404 | 錯誤場景 | Integration | PIPELINE_WITH_VERSIONS 存在 | 1. PATCH /api/v1/etl/pipelines/{id}/versions/{NONEXISTENT_VERSION_ID}/publish | HTTP 404；error.code = "PIPELINE_VERSION_NOT_FOUND" |

### Negative Scenarios — RBAC

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F033-026 | User 角色無法取得版本清單 → 403 | BR-1 | Integration | USER_ACTIVE（role="user"）已登入；PIPELINE_WITH_VERSIONS 存在 | 1. 以 User JWT 呼叫 GET /api/v1/etl/pipelines/{id}/versions | HTTP 403；error.code = "AUTH_FORBIDDEN" |
| TS-F033-027 | User 角色無法執行回滾 → 403 | BR-1 | Integration | USER_ACTIVE 已登入；PIPELINE_WITH_VERSIONS 存在 | 1. 以 User JWT 呼叫 POST /api/v1/etl/pipelines/{id}/versions/{versionId}/rollback | HTTP 403；error.code = "AUTH_FORBIDDEN" |
| TS-F033-028 | User 角色無法發布版本 → 403 | BR-1 | Integration | USER_ACTIVE 已登入；PIPELINE_TESTING 存在 | 1. 以 User JWT 呼叫 PATCH /api/v1/etl/pipelines/{id}/versions/{versionId}/publish | HTTP 403；error.code = "AUTH_FORBIDDEN" |
| TS-F033-029 | 未登入無 Token → 401 | 安全性 | Integration | 無 Authorization Header | 1. GET /api/v1/etl/pipelines/{id}/versions（不帶 Token） | HTTP 401；error.code = "AUTH_TOKEN_MISSING" |

---

## Test Data Requirements

### 前置資料

| 資料集名稱 | 說明 | 關鍵欄位 |
|-----------|------|---------|
| ADMIN_USER | 具備 Admin 角色的有效帳號 | id=ADMIN_UUID, role="admin", status="active" |
| USER_ACTIVE | 具備 User 角色的有效帳號 | id=USER_UUID, role="user", status="active" |
| PIPELINE_WITH_VERSIONS | 含多個版本的 Pipeline | status="active"；含 v1（published）、v2（published）、v3（draft）；deleted_at=NULL |
| PIPELINE_ALL_STATUSES | 含三種版本狀態的 Pipeline | 含 v1（published）、v2（testing）、v3（draft） |
| PIPELINE_DIFF | 用於 Diff 測試的 Pipeline | v1 definition = SEED_DEFINITION_V1；v2 definition = SEED_DEFINITION_V2（有明確差異） |
| PIPELINE_TESTING | 含 testing 狀態版本的 Pipeline | 含一個 status="testing" 的 EtlPipelineVersion，對應至少一筆 EtlPipelineLog（is_test_run=true, status="completed"） |
| PIPELINE_DRAFT_VERSION | 含 draft 狀態版本的 Pipeline | 含一個 status="draft" 的 EtlPipelineVersion，無成功測試執行記錄 |
| PIPELINE_SINGLE_VERSION | 僅含一個版本的 Pipeline | 僅有 v1（status="published"），無 v2 |
| PIPELINE_SCHEDULED | 已設定排程的 active Pipeline | status="active"、enabled=true、schedule="0 2 * * *"；含 v1（published）、v2（published，較新） |

### Diff 測試用 definition 資料

**SEED_DEFINITION_V1（基準版本）：**

```json
{
  "nodes": [
    { "id": "node-1", "type": "extract", "position": {"x": 0, "y": 0}, "data": {"rawTableId": "raw-uuid-001"} },
    { "id": "node-2", "type": "transform-null-handler", "position": {"x": 200, "y": 0}, "data": {"strategy": "default_value"} }
  ],
  "edges": [
    { "id": "edge-1", "source": "node-1", "target": "node-2" }
  ]
}
```

**SEED_DEFINITION_V2（含差異版本）：**

```json
{
  "nodes": [
    { "id": "node-1", "type": "extract", "position": {"x": 0, "y": 0}, "data": {"rawTableId": "raw-uuid-001"} },
    { "id": "node-2", "type": "transform-null-handler", "position": {"x": 200, "y": 0}, "data": {"strategy": "remove_row"} },
    { "id": "node-3", "type": "load", "position": {"x": 400, "y": 0}, "data": {"targetTable": "target_customers"} }
  ],
  "edges": [
    { "id": "edge-1", "source": "node-1", "target": "node-2" },
    { "id": "edge-2", "source": "node-2", "target": "node-3" }
  ]
}
```

預期 diff（from=1, to=2）：
- nodesAdded：[{nodeId: "node-3", nodeType: "load", nodeName: "..."}]
- nodesModified：[{nodeId: "node-2", field: "data.strategy", oldValue: "default_value", newValue: "remove_row"}]
- edgesAdded：[{source: "node-2", target: "node-3"}]
- nodesRemoved / edgesRemoved：均為空陣列

### DB 驗證查詢

```sql
-- 驗證版本清單降序
SELECT id, pipeline_id, version, status, change_summary, created_at
FROM etl_pipeline_versions
WHERE pipeline_id = '<pipeline_id>'
ORDER BY version DESC;

-- 驗證回滾後新版本
SELECT id, pipeline_id, version, status, definition, change_summary, created_by, created_at
FROM etl_pipeline_versions
WHERE pipeline_id = '<pipeline_id>'
ORDER BY version DESC
LIMIT 1;

-- 驗證發布後 EtlPipeline.version 更新
SELECT id, version, status
FROM etl_pipelines
WHERE id = '<pipeline_id>';

-- 驗證舊 published 版本未被修改
SELECT id, version, status
FROM etl_pipeline_versions
WHERE pipeline_id = '<pipeline_id>'
AND id = '<old_version_id>';

-- 確認「testing 版本有成功測試執行」（發布前置條件）
SELECT COUNT(*) FROM etl_pipeline_logs
WHERE pipeline_id = '<pipeline_id>'
AND version = <version_number>
AND is_test_run = true
AND status = 'completed';
```

### 排程測試時間點

| 場景 | fakeNow 值（UTC） | 說明 |
|------|------------------|------|
| 排程觸發（TS-F033-017） | `2026-01-01T02:00:00Z` | 符合 cron `0 2 * * *` 的觸發時間 |

---

## Risks and Notes

| 風險 / 注意事項 | 說明 |
|----------------|------|
| AC-5（發布前置條件）的判定邏輯未完全明確 | 規格 BR-3 說明「發布前必須至少完成一次成功的測試執行」，但未指定：(a) 測試執行成功後若再編輯 definition，原成功記錄是否仍有效；(b) 判定依據為 EtlPipelineLog.version = 此版本號 且 is_test_run=true 且 status="completed"，還是僅看 EtlPipelineVersion.status = "testing"（代表已通過測試）。TS-F033-019 採保守假設（status="testing" 仍需有對應成功日誌）；需向 Architecture 確認後補充場景 |
| Diff API 路徑衝突 | `GET /api/v1/etl/pipelines/:id/versions/diff` 與 `GET /api/v1/etl/pipelines/:id/versions/:versionId` 路由定義中，路由器需確保 "diff" 不被誤解為 versionId；需在實作層驗證路由優先順序 |
| 回滾 changeSummary 格式 | 規格範例為「回滾自版本 1」，但未定義該字串為固定格式或可自訂。目前測試以「含此文字」（部分比對）驗證，若規格明確為固定字串可改為完全比對 |
| 發布新版本後舊 published 版本是否保留 published 狀態 | 規格 data-model.md 明確說明「發布新版本時，舊的 published 版本保留原狀態不變」（TS-F033-016）；同一 Pipeline 同時間可存在多個 published 版本，排程引擎以最新版本號（version 最大值）為準 |
| Diff 欄位路徑格式（nodesModified.field） | 規格範例為 "data.strategy"，表示 dot notation 路徑；若 definition.data 結構層級更深（如 "data.config.threshold"），路徑格式需一致。目前測試僅驗證範例案例，深層路徑留待實作確認 |
| 排程引擎選版本邏輯（TS-F033-017） | 「最新 published 版本」以 version 欄位最大值判定，非 created_at 時間戳。若同一 Pipeline 有 v1 published 與 v2 published，應使用 v2；需驗證此邏輯不依賴時間戳，避免時區問題 |
