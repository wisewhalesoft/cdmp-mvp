---
type: test-design-feature
feature_id: F028
feature_name: 建立 Pipeline
priority: P0-MVP
related_spec: /docs/specs/features/F028-create-pipeline.md
last_updated: 2026-03-20
---

# F028: 建立 Pipeline — 測試設計

---

## Acceptance Test Design

### AC-1: 成功建立 Pipeline

| 項目 | 內容 |
|------|------|
| Given | Admin 已登入，系統中尚無任何名為「客戶資料同步」的 Pipeline（deleted_at IS NULL） |
| When | 呼叫 `POST /api/v1/etl/pipelines`，body 含 name="客戶資料同步"、description="每日同步"、schedule="0 2 * * *" |
| Then | HTTP 201；回應 body 含 id（UUID）、name="客戶資料同步"、status="draft"、version=1、enabled=false、stepCount=0、schedule="0 2 * * *"、createdBy（操作者 UUID）、createdAt、updatedAt |
| 驗證步驟 | 1. 驗證 HTTP 狀態碼為 201<br>2. 驗證 response.status = "draft"<br>3. 驗證 response.version = 1<br>4. 驗證 response.enabled = false<br>5. 驗證 response.stepCount = 0<br>6. 驗證 response.id 為合法 UUID 格式<br>7. 驗證 DB 中 etl_pipelines 新增一筆紀錄，deleted_at IS NULL |

### AC-2: 名稱唯一驗證

| 項目 | 內容 |
|------|------|
| Given | 系統中已存在名為「客戶資料同步」的 Pipeline（deleted_at IS NULL） |
| When | Admin 再次以 name="客戶資料同步" 呼叫 `POST /api/v1/etl/pipelines` |
| Then | HTTP 409；error.code = "PIPELINE_NAME_EXISTS"；DB 中僅有一筆該名稱的 Pipeline |

### AC-3: Cron 表達式驗證（合法格式）

| 項目 | 內容 |
|------|------|
| Given | Admin 已登入 |
| When | 呼叫 POST /api/v1/etl/pipelines，schedule 使用合法 5 欄位 cron（"0 2 * * *"） |
| Then | HTTP 201；schedule 欄位值與輸入一致 |

### AC-4: 欄位驗證 — 名稱為空

| 項目 | 內容 |
|------|------|
| Given | Admin 在建立 Pipeline 表單 |
| When | 呼叫 POST /api/v1/etl/pipelines，body 中 name 為空字串或未提供 |
| Then | HTTP 422；error.code = "VALIDATION_ERROR"；error.details 中含 field="name" 的錯誤訊息 |

### AC-5: 建立後同時建立初始版本

| 項目 | 內容 |
|------|------|
| Given | Admin 成功建立新 Pipeline |
| When | 系統完成建立 |
| Then | DB 中 etl_pipeline_versions 新增一筆對應的版本紀錄：pipeline_id 對應新建 Pipeline.id、version=1、status="draft"、definition={"nodes":[],"edges":[]} |

---

## Test Scenarios

### Positive Scenarios — 後端 API

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F028-001 | 成功建立 Pipeline（含排程） | AC-1, BR-3 | Integration | Admin 已登入（JWT Token 有效）；無同名 Pipeline | 1. POST /api/v1/etl/pipelines，body: `{"name":"客戶資料同步","description":"每日同步","schedule":"0 2 * * *"}` | HTTP 201；response.status="draft"；response.version=1；response.enabled=false；response.stepCount=0；response.schedule="0 2 * * *"；response.id 為有效 UUID |
| TS-F028-002 | 成功建立 Pipeline（不含排程） | AC-1, BR-3 | Integration | Admin 已登入；無同名 Pipeline | 1. POST /api/v1/etl/pipelines，body: `{"name":"無排程Pipeline","description":null}` | HTTP 201；response.status="draft"；response.version=1；response.enabled=false；response.schedule=null |
| TS-F028-003 | 成功建立後同步建立 EtlPipelineVersion v1 | AC-5, BR-6 | Integration | Admin 已登入；無同名 Pipeline | 1. POST /api/v1/etl/pipelines，body: `{"name":"版本測試Pipeline"}` 2. 查詢 DB：`SELECT * FROM etl_pipeline_versions WHERE pipeline_id = <新建 id>` | DB 中存在一筆 EtlPipelineVersion：version=1、status="draft"、pipeline_id=新建 Pipeline.id、created_by=操作者 UUID |
| TS-F028-004 | EtlPipelineVersion 初始 definition 為空結構 | AC-5 | Integration | Admin 已登入；無同名 Pipeline | 1. POST /api/v1/etl/pipelines，body: `{"name":"Definition測試"}` 2. 查詢 DB 中對應 EtlPipelineVersion.definition | definition = `{"nodes":[],"edges":[]}`（不多不少） |
| TS-F028-005 | createdBy 記錄建立者 ID | AC-1 | Integration | Admin 帳號 id=ADMIN_UUID 已登入 | 1. POST /api/v1/etl/pipelines，body: `{"name":"建立者測試"}` | response.createdBy = ADMIN_UUID；DB 中 etl_pipelines.created_by = ADMIN_UUID |

### Negative Scenarios — 後端 API

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F028-006 | 名稱重複 → 409 | AC-2, BR-2 | Integration | 已存在名為「重複名稱」的 Pipeline（deleted_at IS NULL） | 1. POST /api/v1/etl/pipelines，body: `{"name":"重複名稱"}` | HTTP 409；error.code="PIPELINE_NAME_EXISTS"；DB 中僅有一筆該名稱的 Pipeline |
| TS-F028-007 | 軟刪除後名稱可重用 | AC-2, BR-2 | Integration | 已存在名為「舊Pipeline」的 Pipeline，且已軟刪除（deleted_at IS NOT NULL） | 1. POST /api/v1/etl/pipelines，body: `{"name":"舊Pipeline"}` | HTTP 201；名稱唯一性僅檢查 deleted_at IS NULL 的記錄；新 Pipeline 成功建立 |
| TS-F028-008 | 名稱空白 → 422 | AC-4 | Integration | Admin 已登入 | 1. POST /api/v1/etl/pipelines，body: `{"name":""}` | HTTP 422；error.code="VALIDATION_ERROR"；error.details 含 field="name" 的必填錯誤訊息 |
| TS-F028-009 | 名稱缺失（key 未提供）→ 422 | AC-4 | Integration | Admin 已登入 | 1. POST /api/v1/etl/pipelines，body: `{"description":"無名稱"}` | HTTP 422；error.code="VALIDATION_ERROR"；error.details 含 field="name" |
| TS-F028-010 | 非法 Cron 表達式 → 422 | AC-3, BR-4 | Integration | Admin 已登入 | 1. POST /api/v1/etl/pipelines，body: `{"name":"Cron錯誤","schedule":"99 99 99 99 99"}` | HTTP 422；error.code="VALIDATION_INVALID_CRON"；error.message 含「排程格式不正確」 |
| TS-F028-011 | User 角色無權建立 → 403 | BR-1 | Integration | USER_ACTIVE（角色為 user）已登入 | 1. 以 User JWT Token 呼叫 POST /api/v1/etl/pipelines | HTTP 403；error.code="AUTH_FORBIDDEN" |
| TS-F028-012 | 未登入（無 Token）→ 401 | BR-1 | Integration | 無 Authorization Header | 1. POST /api/v1/etl/pipelines（不帶 Token），body: `{"name":"未登入測試"}` | HTTP 401；error.code="AUTH_TOKEN_MISSING" |

### Boundary Scenarios — 後端 API

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F028-013 | 名稱長度 255 字元（邊界值，接受） | BR-2 | Boundary + Integration | Admin 已登入；無同名 Pipeline | 1. POST /api/v1/etl/pipelines，body: `{"name":"<255 字元字串>"}` | HTTP 201；Pipeline 成功建立；response.name.length = 255 |
| TS-F028-014 | 名稱長度 256 字元（超出上限，拒絕） | BR-2 | Boundary + Integration | Admin 已登入 | 1. POST /api/v1/etl/pipelines，body: `{"name":"<256 字元字串>"}` | HTTP 422；error.code="VALIDATION_ERROR"；error.details 含 field="name" 的長度限制錯誤訊息 |
| TS-F028-015 | Cron 5 欄位標準格式（合法） | BR-4 | Boundary + Integration | Admin 已登入；無同名 Pipeline | 1. POST /api/v1/etl/pipelines，body: `{"name":"Cron5欄位","schedule":"0 2 * * *"}` | HTTP 201；response.schedule = "0 2 * * *" |
| TS-F028-016 | Cron 6 欄位擴充格式（合法） | BR-4 | Boundary + Integration | Admin 已登入；無同名 Pipeline | 1. POST /api/v1/etl/pipelines，body: `{"name":"Cron6欄位","schedule":"0 0 2 * * *"}` | HTTP 201；response.schedule = "0 0 2 * * *" |
| TS-F028-017 | Cron 4 欄位（不合法格式，拒絕） | BR-4 | Boundary + Integration | Admin 已登入 | 1. POST /api/v1/etl/pipelines，body: `{"name":"Cron4欄位","schedule":"2 * * *"}` | HTTP 422；error.code="VALIDATION_INVALID_CRON" |

---

## Test Data Requirements

### 前置資料

| 資料集名稱 | 說明 | 欄位 |
|-----------|------|------|
| ADMIN_USER | 具備 Admin 角色的有效帳號 | id=ADMIN_UUID, role="admin", status="active" |
| USER_ACTIVE | 具備 User 角色的有效帳號 | id=USER_UUID, role="user", status="active" |
| PIPELINE_EXISTING | 已存在且未刪除的 Pipeline | name="重複名稱", deleted_at=NULL |
| PIPELINE_SOFT_DELETED | 已軟刪除的 Pipeline | name="舊Pipeline", deleted_at=<非空時間戳> |

### 邊界值測試資料

| 場景 | 測試值 | 說明 |
|------|--------|------|
| 名稱長度 255 | `"A".repeat(255)` | 最大合法長度 |
| 名稱長度 256 | `"A".repeat(256)` | 超出最大長度（拒絕） |
| Cron 5 欄位 | `"0 2 * * *"` | 標準 Unix cron（分鐘 小時 日 月 星期） |
| Cron 6 欄位 | `"0 0 2 * * *"` | 含秒欄位的擴充 cron |
| 非法 Cron | `"99 99 99 99 99"` | 所有欄位超出範圍 |
| 非法 Cron（欄位數不足） | `"2 * * *"` | 僅 4 欄位 |

### DB 驗證查詢

```sql
-- 驗證 EtlPipeline 新增
SELECT id, name, status, version, enabled, step_count, schedule, created_by, deleted_at
FROM etl_pipelines
WHERE name = '<pipeline_name>' AND deleted_at IS NULL;

-- 驗證 EtlPipelineVersion 初始版本
SELECT pipeline_id, version, status, definition, created_by
FROM etl_pipeline_versions
WHERE pipeline_id = '<pipeline_id>';
```

---

## Risks and Notes

| 風險 / 注意事項 | 說明 |
|----------------|------|
| Cron 驗證套件行為 | BR-4 要求使用 `cron-parser` 或同等套件驗證，需確認套件對 6 欄位格式的支援行為，建議向實作者確認實際採用套件 |
| EtlPipelineVersion 建立的原子性 | F028 要求同步建立初始 EtlPipelineVersion，若兩者非同一 DB 事務，Pipeline 建立成功但 Version 建立失敗時的行為未在規格中定義 — 已記錄於 risks-and-gaps.md |
| 名稱唯一性的大小寫敏感度 | 規格未明確說明名稱唯一性是否大小寫不敏感（參考 ACCOUNT_EMAIL_EXISTS 的大小寫不敏感做法）— 需向 Product 確認 |
| next_execution_at 計算時機 | 規格未說明建立時若設定了 schedule，next_execution_at 是否在建立當下計算填入 — 建立後的 DB 狀態需確認 |
