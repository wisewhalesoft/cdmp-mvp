---
type: test-design-feature
feature_id: F029
feature_name: 視覺化轉換編輯器
priority: P0-MVP
related_spec: /docs/specs/features/F029-pipeline-editor.md
last_updated: 2026-03-20
---

# F029: 視覺化轉換編輯器 — 測試設計

---

## Acceptance Test Design

### AC-1 / AC-10: 載入已儲存的 Pipeline 定義

| 項目 | 內容 |
|------|------|
| Given | Admin 已登入；Pipeline（id=PIPELINE_UUID）已存在且有儲存的定義（含 3 個節點、2 條連線） |
| When | 呼叫 `GET /api/v1/etl/pipelines/PIPELINE_UUID/definition` |
| Then | HTTP 200；回應含 versionId、version、status="draft"；definition.nodes 陣列有 3 個元素；definition.edges 陣列有 2 個元素；各節點含 id、type、position、data 欄位 |
| 驗證步驟 | 1. 驗證 HTTP 狀態碼為 200<br>2. 驗證 response.definition.nodes.length = 3<br>3. 驗證 response.definition.edges.length = 2<br>4. 驗證各節點 data 欄位符合對應 node type 的 JSONB 結構 |

### AC-1: 空定義（初始狀態）

| 項目 | 內容 |
|------|------|
| Given | Admin 已登入；Pipeline 剛建立（F028 建立後），definition = `{"nodes":[],"edges":[]}` |
| When | 呼叫 `GET /api/v1/etl/pipelines/PIPELINE_UUID/definition` |
| Then | HTTP 200；definition.nodes = []；definition.edges = [] |

### AC-9: 儲存 Pipeline 定義並更新 step_count

| 項目 | 內容 |
|------|------|
| Given | Admin 已登入；Pipeline 存在（version=1, status=draft） |
| When | 呼叫 `PUT /api/v1/etl/pipelines/PIPELINE_UUID/definition`，body 含 definition（3 個節點、2 條合法連線）、changeSummary="初次設定" |
| Then | HTTP 200；response.stepCount = 3；response.message = "Pipeline 定義已儲存"；DB 中 etl_pipelines.step_count = 3；DB 中 etl_pipeline_versions.definition 已更新 |
| 驗證步驟 | 1. 驗證 HTTP 狀態碼為 200<br>2. 驗證 response.stepCount = 3<br>3. 查詢 DB：etl_pipelines.step_count = 3<br>4. 查詢 DB：etl_pipeline_versions.definition.nodes.length = 3 |

### AC-4: 連線驗證 — 非法連線（Load → Extract）

| 項目 | 內容 |
|------|------|
| Given | Admin 已登入；Pipeline 存在 |
| When | 呼叫 `PUT /api/v1/etl/pipelines/PIPELINE_UUID/definition`，edges 中包含 source=Load 節點、target=Extract 節點的連線 |
| Then | HTTP 422；error.code = "PIPELINE_INVALID_CONNECTION"；error.message 含「連線規則違反」；DB 中 definition 未更新 |

### AC-6: Extract 節點資料來源清單

| 項目 | 內容 |
|------|------|
| Given | Admin 已登入；系統中有 2 個 ExtractionTask（已至少執行一次，有 raw data 表） |
| When | 呼叫 `GET /api/v1/extraction-tasks/raw-tables` |
| Then | HTTP 200；response.data 陣列包含 2 筆；每筆含 taskId、taskName、rawTableName、datasourceName、sourceTable、lastExecutionAt、status |

---

## Test Scenarios

### Positive Scenarios — GET /api/v1/etl/pipelines/:id/definition

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F029-001 | 取得空定義（初始狀態） | AC-1, AC-10, BR-7 | Integration | Admin 已登入；Pipeline（id=PIPELINE_UUID）版本 v1，definition=`{"nodes":[],"edges":[]}` | 1. GET /api/v1/etl/pipelines/PIPELINE_UUID/definition | HTTP 200；versionId 為有效 UUID；version=1；status="draft"；definition.nodes=[]；definition.edges=[] |
| TS-F029-002 | 取得含節點與連線的定義 | AC-10, BR-7, BR-8 | Integration | Admin 已登入；Pipeline 已儲存含 1 個 Extract 節點（rawTableId=RAW_UUID）、1 個 Filter Transform 節點、1 個 Load 節點及 2 條連線 | 1. GET /api/v1/etl/pipelines/PIPELINE_UUID/definition | HTTP 200；definition.nodes.length=3；definition.edges.length=2；Extract 節點 data 含 rawTableId=RAW_UUID；Filter 節點 data 含 logic、conditions 欄位 |

### Positive Scenarios — PUT /api/v1/etl/pipelines/:id/definition

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F029-003 | 儲存空定義（草稿允許） | AC-9, BR-10 | Integration | Admin 已登入；Pipeline 存在（version=1, status=draft） | 1. PUT /api/v1/etl/pipelines/PIPELINE_UUID/definition，body: `{"definition":{"nodes":[],"edges":[]}}` | HTTP 200；response.stepCount=0；response.message="Pipeline 定義已儲存"；DB etl_pipelines.step_count=0 |
| TS-F029-004 | 儲存含節點與連線的定義並更新 step_count | AC-9, BR-6 | Integration | Admin 已登入；Pipeline 存在（step_count=0） | 1. PUT body 含 3 個節點（Extract、Transform、Load）、2 條合法連線 | HTTP 200；response.stepCount=3；DB etl_pipelines.step_count=3；DB etl_pipeline_versions.definition.nodes.length=3 |
| TS-F029-005 | 儲存含 changeSummary 的定義 | AC-9, BR-7 | Integration | Admin 已登入；Pipeline 存在 | 1. PUT body: `{"definition":{"nodes":[],"edges":[]},"changeSummary":"清空畫布"}` | HTTP 200；DB etl_pipeline_versions 中最新版本的 change_summary="清空畫布" |
| TS-F029-006 | 儲存含不完整設定的節點（草稿允許） | AC-9, BR-10 | Integration | Admin 已登入；Pipeline 存在 | 1. PUT body 含 1 個 Merge Transform 節點，data 中 conditions=[]（未設定合併條件） | HTTP 200；回應 stepCount=1；不因節點設定不完整而拒絕儲存 |
| TS-F029-007 | 覆寫既有定義 | AC-9, BR-7 | Integration | Admin 已登入；Pipeline 已有定義（3 個節點）；現在要改為 1 個節點 | 1. PUT body 含 1 個節點、0 條連線 | HTTP 200；response.stepCount=1；DB definition 覆寫為 1 個節點；DB step_count=1 |

### Positive Scenarios — GET /api/v1/extraction-tasks/raw-tables

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F029-008 | 取得可用 raw data 表清單 | AC-6, BR-8 | Integration | Admin 已登入；系統中有 2 個 ExtractionTask（各有對應 raw data 表，status=completed） | 1. GET /api/v1/extraction-tasks/raw-tables | HTTP 200；response.data.length=2；每筆含 taskId、taskName、rawTableName（格式 `raw_[a-f0-9]{8}`）、datasourceName、sourceTable、lastExecutionAt、status |
| TS-F029-009 | 空 raw data 清單（無已執行任務） | AC-6 | Integration | Admin 已登入；系統中無任何 ExtractionTask 有 raw data 表 | 1. GET /api/v1/extraction-tasks/raw-tables | HTTP 200；response.data=[] |

### Negative Scenarios — 連線驗證（後端 PUT）

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F029-010 | 非法連線：Load → Extract | AC-4, BR-4, BR-2 | Negative + Integration | Admin 已登入；Pipeline 存在 | 1. PUT body 含 Load 節點（id=node-load）、Extract 節點（id=node-extract），edge: `{"source":"node-load","target":"node-extract"}` | HTTP 422；error.code="PIPELINE_INVALID_CONNECTION"；error.message 含「連線規則違反」；DB definition 未更新 |
| TS-F029-011 | 非法連線：Load → Transform | AC-4, BR-4 | Negative + Integration | Admin 已登入；Pipeline 存在 | 1. PUT body 含 Load 節點（id=node-load）、Transform 節點（id=node-tf），edge: `{"source":"node-load","target":"node-tf"}` | HTTP 422；error.code="PIPELINE_INVALID_CONNECTION" |
| TS-F029-012 | 非法連線：Extract → Load（跳過 Transform） | AC-4, BR-2 | Negative + Integration | Admin 已登入；Pipeline 存在 | 1. PUT body 含 Extract 節點（id=node-ext）、Load 節點（id=node-load），edge: `{"source":"node-ext","target":"node-load"}` | HTTP 422；error.code="PIPELINE_INVALID_CONNECTION" |
| TS-F029-013 | 非法連線：逆向（循環）連線 | AC-4, BR-5 | Negative + Integration | Admin 已登入；Pipeline 存在 | 1. PUT body 含 Transform A（node-a）、Transform B（node-b），edges: `[{"source":"node-a","target":"node-b"},{"source":"node-b","target":"node-a"}]` | HTTP 422；error.code="PIPELINE_INVALID_CONNECTION"；error.message 含「循環」或「逆向連線」 |
| TS-F029-014 | 非法連線：Load → Load | AC-4, BR-4 | Negative + Integration | Admin 已登入；Pipeline 存在 | 1. PUT body 含 Load A（node-load-a）、Load B（node-load-b），edge: `{"source":"node-load-a","target":"node-load-b"}` | HTTP 422；error.code="PIPELINE_INVALID_CONNECTION" |

### Positive Scenarios — 連線驗證（合法連線）

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F029-015 | 合法連線：Extract → Transform | AC-3, BR-2 | Positive + Integration | Admin 已登入；Pipeline 存在 | 1. PUT body 含 Extract（node-ext）、Filter Transform（node-tf），edge: `{"source":"node-ext","target":"node-tf"}` | HTTP 200；response.stepCount=2；DB definition 已儲存 |
| TS-F029-016 | 合法連線：Transform → Transform | AC-3, BR-3 | Positive + Integration | Admin 已登入；Pipeline 存在 | 1. PUT body 含 Filter Transform（node-tf1）、FieldMapping Transform（node-tf2），edge: `{"source":"node-tf1","target":"node-tf2"}` | HTTP 200；response.stepCount=2 |
| TS-F029-017 | 合法連線：Transform → Load | AC-3, BR-3 | Positive + Integration | Admin 已登入；Pipeline 存在 | 1. PUT body 含 Masking Transform（node-tf）、Load（node-load），edge: `{"source":"node-tf","target":"node-load"}` | HTTP 200；response.stepCount=2 |

### Negative Scenarios — 重複 Extract 來源

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F029-018 | 重複 Extract 來源（同一 rawTableId 出現兩次） | BR-8（邊界條件） | Negative + Integration | Admin 已登入；Pipeline 存在；raw data 表 RAW_UUID 存在 | 1. PUT body 含兩個 Extract 節點，均設定 rawTableId=RAW_UUID | HTTP 422；error.code="PIPELINE_INVALID_CONNECTION"；error.message 含「重複來源」 |

### Transform 節點 JSONB 結構採樣驗證

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F029-019 | transform-merge JSONB 結構儲存與還原 | AC-7, BR-7 | Integration | Admin 已登入；Pipeline 存在 | 1. PUT body 含 Merge 節點，data: `{"joinType":"INNER","leftInput":"node-a","rightInput":"node-b","conditions":[{"leftColumn":"id","rightColumn":"customer_id","operator":"="}]}` 2. GET 同一 definition | PUT 回傳 HTTP 200；GET 後 nodes[0].data.joinType="INNER"；conditions[0].operator="="；資料結構完整還原，無欄位遺失 |
| TS-F029-020 | transform-filter JSONB 結構儲存與還原 | AC-7, BR-7 | Integration | Admin 已登入；Pipeline 存在 | 1. PUT body 含 Filter 節點，data: `{"logic":"AND","conditions":[{"column":"age","operator":">","value":"18"}]}` 2. GET | PUT 回傳 HTTP 200；GET 後 nodes[0].data.logic="AND"；conditions[0].column="age" |
| TS-F029-021 | transform-masking JSONB 結構儲存與還原 | AC-7, BR-7 | Integration | Admin 已登入；Pipeline 存在 | 1. PUT body 含 Masking 節點，data: `{"rules":[{"column":"national_id","method":"partial_mask","maskPattern":"***-****-{last4}","visibleStart":0,"visibleEnd":4}]}` 2. GET | PUT 回傳 HTTP 200；GET 後 rules[0].method="partial_mask"；maskPattern="***-****-{last4}" |

### Negative Scenarios — Pipeline 不存在與 RBAC

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F029-022 | GET Pipeline 不存在 → 404 | 錯誤碼表, BR-1 | Negative + Integration | Admin 已登入；不存在的 Pipeline ID | 1. GET /api/v1/etl/pipelines/NON_EXIST_UUID/definition | HTTP 404；error.code="PIPELINE_NOT_FOUND"；error.message="找不到指定的 Pipeline" |
| TS-F029-023 | PUT Pipeline 不存在 → 404 | 錯誤碼表 | Negative + Integration | Admin 已登入；不存在的 Pipeline ID | 1. PUT /api/v1/etl/pipelines/NON_EXIST_UUID/definition，body: `{"definition":{"nodes":[],"edges":[]}}` | HTTP 404；error.code="PIPELINE_NOT_FOUND" |
| TS-F029-024 | User 角色無權呼叫 GET definition → 403 | BR-1 | Security + Integration | USER_ACTIVE（role=user）已登入；Pipeline 存在 | 1. 以 User JWT Token 呼叫 GET /api/v1/etl/pipelines/PIPELINE_UUID/definition | HTTP 403；error.code="AUTH_FORBIDDEN" |
| TS-F029-025 | User 角色無權呼叫 PUT definition → 403 | BR-1 | Security + Integration | USER_ACTIVE（role=user）已登入；Pipeline 存在 | 1. 以 User JWT Token 呼叫 PUT /api/v1/etl/pipelines/PIPELINE_UUID/definition | HTTP 403；error.code="AUTH_FORBIDDEN" |
| TS-F029-026 | 未登入（無 Token）→ 401 | BR-1 | Security + Integration | 無 Authorization Header | 1. PUT /api/v1/etl/pipelines/PIPELINE_UUID/definition（不帶 Token） | HTTP 401；error.code="AUTH_TOKEN_MISSING" |

### Boundary Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F029-027 | changeSummary 500 字元（邊界值，接受） | API 規格 8.2 | Boundary + Integration | Admin 已登入；Pipeline 存在 | 1. PUT body: `{"definition":{"nodes":[],"edges":[]},"changeSummary":"<500 字元字串>"}` | HTTP 200；DB change_summary 長度 = 500 |
| TS-F029-028 | changeSummary 501 字元（超出上限，拒絕） | API 規格 8.2 | Boundary + Integration | Admin 已登入；Pipeline 存在 | 1. PUT body: `{"definition":{"nodes":[],"edges":[]},"changeSummary":"<501 字元字串>"}` | HTTP 422；error.code="VALIDATION_ERROR"；error.details 含 field="changeSummary" 的長度限制錯誤 |

### Frontend Scenarios（前端行為）

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F029-029 | 未儲存變更離開頁面 — 顯示確認對話框 | AC-9（替代流程：取消編輯） | E2E（前端） | Admin 已開啟編輯器並拖拉了一個節點至畫布（未儲存） | 1. 點擊「返回」按鈕或切換到其他頁面 | 顯示確認對話框，訊息含「您有未儲存的變更」；點擊「取消」留在頁面；點擊「確認離開」才導向目標頁 |
| TS-F029-030 | 已儲存狀態離開頁面 — 不顯示確認對話框 | AC-9（替代流程） | E2E（前端） | Admin 已儲存最新定義（無待儲存變更） | 1. 點擊「返回」按鈕 | 直接導向上一頁，不顯示確認對話框 |
| TS-F029-031 | 非法連線嘗試的視覺提示 | AC-4, BR-4 | E2E（前端） | Admin 已在畫布上放置 Load 節點與 Extract 節點 | 1. 從 Load 節點輸出端拖拉至 Extract 節點輸入端 | 連線未建立；畫布顯示紅色提示訊息（或 toast）說明連線規則；節點之間無箭頭出現 |

---

## Test Data Requirements

### 前置資料

| 資料集名稱 | 說明 | 欄位 |
|-----------|------|------|
| ADMIN_USER | 具備 Admin 角色的有效帳號 | id=ADMIN_UUID, role="admin", status="active" |
| USER_ACTIVE | 具備 User 角色的有效帳號 | id=USER_UUID, role="user", status="active" |
| PIPELINE_DRAFT | 已存在、status=draft、version=1 的 Pipeline | id=PIPELINE_UUID, step_count=0, deleted_at=NULL |
| PIPELINE_WITH_DEFINITION | 已有儲存定義的 Pipeline（含 3 節點 2 連線） | id=PIPELINE_DEF_UUID；etl_pipeline_versions 中含完整 definition |
| RAW_TABLE_TASK | 已完成擷取任務，有對應 raw data 表 | id=RAW_TASK_UUID, rawTableName="raw_a3f2c1d4", status="completed" |

### 節點物件範本

```json
// Extract 節點
{
  "id": "node-ext-1",
  "type": "extract",
  "position": { "x": 100, "y": 200 },
  "data": {
    "rawTableId": "RAW_TASK_UUID",
    "rawTableName": "raw_a3f2c1d4",
    "taskName": "每日客戶同步"
  }
}

// transform-filter 節點
{
  "id": "node-filter-1",
  "type": "transform-filter",
  "position": { "x": 350, "y": 200 },
  "data": {
    "logic": "AND",
    "conditions": [
      { "column": "age", "operator": ">", "value": "18" }
    ]
  }
}

// transform-merge 節點
{
  "id": "node-merge-1",
  "type": "transform-merge",
  "position": { "x": 350, "y": 200 },
  "data": {
    "joinType": "INNER",
    "leftInput": "node-ext-1",
    "rightInput": "node-ext-2",
    "conditions": [
      { "leftColumn": "id", "rightColumn": "customer_id", "operator": "=" }
    ]
  }
}

// transform-masking 節點
{
  "id": "node-mask-1",
  "type": "transform-masking",
  "position": { "x": 600, "y": 200 },
  "data": {
    "rules": [
      {
        "column": "national_id",
        "method": "partial_mask",
        "maskPattern": "***-****-{last4}",
        "visibleStart": 0,
        "visibleEnd": 4
      }
    ]
  }
}

// Load 節點
{
  "id": "node-load-1",
  "type": "load",
  "position": { "x": 850, "y": 200 },
  "data": {
    "targetTable": "customer_core",
    "fieldMappings": []
  }
}
```

### 邊界值測試資料

| 場景 | 測試值 | 說明 |
|------|--------|------|
| changeSummary 500 字元 | `"A".repeat(500)` | 最大合法長度 |
| changeSummary 501 字元 | `"A".repeat(501)` | 超出最大長度（拒絕） |
| 空 definition | `{"nodes":[],"edges":[]}` | BR-10 草稿允許空定義 |
| 未完成設定的節點 | Merge 節點 conditions=[] | BR-10 草稿允許不完整節點 |

### DB 驗證查詢

```sql
-- 驗證 step_count 更新
SELECT id, step_count, updated_at
FROM etl_pipelines
WHERE id = '<pipeline_id>';

-- 驗證 definition 已儲存於 EtlPipelineVersion
SELECT pipeline_id, version, status, definition, change_summary
FROM etl_pipeline_versions
WHERE pipeline_id = '<pipeline_id>'
ORDER BY version DESC
LIMIT 1;

-- 驗證非法連線儲存未發生（definition 未變更）
SELECT definition
FROM etl_pipeline_versions
WHERE pipeline_id = '<pipeline_id>'
ORDER BY version DESC
LIMIT 1;
```

---

## 連線驗證規則覆蓋矩陣

| 來源類型 | 目標類型 | 合法？ | 測試場景 |
|----------|----------|--------|---------|
| Extract | Transform | 合法 | TS-F029-015 |
| Extract | Load | 非法（跳過 Transform） | TS-F029-012 |
| Extract | Extract | 非法 | — （可透過 TS-F029-018 涵蓋）|
| Transform | Transform | 合法 | TS-F029-016 |
| Transform | Load | 合法 | TS-F029-017 |
| Transform | Extract | 非法 | — （BR-5 逆向連線 TS-F029-013 涵蓋） |
| Load | Extract | 非法（BR-4 終端節點） | TS-F029-010 |
| Load | Transform | 非法（BR-4 終端節點） | TS-F029-011 |
| Load | Load | 非法（BR-4 終端節點） | TS-F029-014 |
| A→B + B→A（任意類型） | 逆向循環 | 非法（BR-5） | TS-F029-013 |

---

## Transform 節點類型採樣覆蓋策略

13 種 Transform 節點全數逐一測試將造成大量重複的 JSONB 儲存/還原場景。採用以下採樣策略，選取 3 個結構複雜度代表不同型態的節點進行測試：

| 採樣節點 | 選擇理由 | 覆蓋場景 |
|----------|---------|---------|
| `transform-merge` | 最複雜結構：含多輸入（leftInput/rightInput）、多條件陣列、enum 欄位（joinType） | TS-F029-019 |
| `transform-filter` | 中等複雜度：含邏輯運算子（AND/OR）與條件陣列（column/operator/value） | TS-F029-020 |
| `transform-masking` | 含業務敏感欄位：method enum（aes_encrypt/partial_mask）、maskPattern 字串格式 | TS-F029-021 |

其餘 10 種 Transform 節點（FieldMapping、Format、Conditional、NullHandler、TypeCast、Deduplicate、Lookup、String、Aggregate、DerivedColumn）的 JSONB 結構已在規格 8.4 節明確定義，列為「已涵蓋於 JSONB 規格文件，測試時僅驗證 PUT/GET 完整性即可，無需獨立場景」。

---

## Risks and Notes

| 風險 / 注意事項 | 說明 |
|----------------|------|
| 連線驗證執行位置 | 規格第 7 節描述「畫布上顯示紅色提示」（前端阻止），同時第 8.5 節錯誤回應定義 HTTP 422 PIPELINE_INVALID_CONNECTION（後端驗證）。目前測試設計以後端 PUT 驗證為主（TS-F029-010 ~ 014），前端視覺阻止為 E2E 補充（TS-F029-031）。若後端不驗證連線規則（僅由前端阻擋），需重新評估後端測試策略。 |
| 重複 Extract 來源規則 | 規格第 7 節邊界情況提及「同一 Pipeline 不可有兩個相同的 Extract 來源（同一 raw data 表）」，但第 8.5 節連線驗證規則表未列出對應錯誤碼。TS-F029-018 假設後端以 PIPELINE_INVALID_CONNECTION 回傳 422，需向 Arch 確認是否有獨立錯誤碼。 |
| changeSummary 上限 | 規格明確說明 changeSummary 最大 500 字元，但未明確說明超出時回傳的錯誤碼（是 VALIDATION_ERROR 還是 PIPELINE_INVALID_CONNECTION）。TS-F029-028 以 VALIDATION_ERROR 為假設，需向 Arch 確認。 |
| GET /extraction-tasks/raw-tables 的資料來源範圍 | 規格說明「所有可用的 raw data 表（來自 E04 ExtractionTask）」，但未說明是否包含 status=running 或 status=failed 的任務所對應的 raw data 表。TS-F029-008 / 009 僅測試 status=completed 的情況，需向 Product 確認篩選條件。 |
| JSONB 還原完整性 | PUT 後 GET 的「還原」測試（TS-F029-019 ~ 021）假設 JSONB 欄位完整保留所有 key，包含值為 null 的欄位。若 DB 層對 null 值進行 JSONB 壓縮（移除 null key），需調整驗證方式。 |
| 前端連線驗證時機 | TS-F029-029 ~ 031 為前端 E2E 場景，依賴畫布函式庫（建議 React Flow）的行為。若更換畫布實作，場景驗證步驟需重新審視。 |
| 未儲存離開確認對話框的觸發條件 | TS-F029-029 以「拖拉節點後未儲存」為前提。若前端以 dirty flag 追蹤變更，需確認哪些操作（拖動節點位置、修改屬性、刪除連線）會觸發 dirty 狀態。規格未明確定義，建議向前端實作者確認。 |
