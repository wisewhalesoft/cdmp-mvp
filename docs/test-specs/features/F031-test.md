---
type: test-design-feature
feature_id: F031
feature_name: 啟用／停用 Pipeline
priority: P0-MVP
related_spec: /docs/specs/features/F031-toggle-pipeline.md
last_updated: 2026-03-20
---

# F031: 啟用／停用 Pipeline — 測試設計

---

## Acceptance Test Design

### AC-1: 停用 active Pipeline

| 項目 | 內容 |
|------|------|
| Given | 一個狀態為 `active`、`enabled = true` 的 Pipeline（具備 published 版本） |
| When | Admin 呼叫 `PATCH /api/v1/etl/pipelines/:id/toggle`，body: `{"enabled": false}` |
| Then | HTTP 200；response.status="disabled"；response.enabled=false；DB 中 etl_pipelines.enabled=false、status="disabled"；排程引擎移除該 Pipeline 對應的排程任務 |
| 驗證步驟 | 1. 驗證 HTTP 狀態碼為 200<br>2. 驗證 response.status = "disabled"<br>3. 驗證 response.enabled = false<br>4. 查詢 DB 確認 etl_pipelines.status = "disabled"、enabled = false<br>5. 驗證排程引擎中該 Pipeline 的排程任務已被移除（spy/mock 排程引擎的 removeJob 呼叫） |

### AC-2: 啟用 disabled Pipeline（已有 published 版本）

| 項目 | 內容 |
|------|------|
| Given | 一個狀態為 `disabled`、`enabled = false` 的 Pipeline，且 DB 中 etl_pipeline_versions 存在至少一筆 status="published" 的版本 |
| When | Admin 呼叫 `PATCH /api/v1/etl/pipelines/:id/toggle`，body: `{"enabled": true}` |
| Then | HTTP 200；response.status="active"；response.enabled=true；DB 中 etl_pipelines.status="active"、enabled=true；排程引擎重新註冊排程任務 |
| 驗證步驟 | 1. 驗證 HTTP 狀態碼為 200<br>2. 驗證 response.status = "active"<br>3. 驗證 response.enabled = true<br>4. 查詢 DB 確認 etl_pipelines.status = "active"、enabled = true<br>5. 驗證排程引擎的 addJob / registerJob 已被呼叫（spy/mock） |

### AC-3: 草稿 Pipeline 不可啟用

| 項目 | 內容 |
|------|------|
| Given | 一個狀態為 `draft`（DB 中無 status="published" 的 EtlPipelineVersion）的 Pipeline |
| When | Admin 呼叫 `PATCH /api/v1/etl/pipelines/:id/toggle`，body: `{"enabled": true}` |
| Then | HTTP 400；error.code="PIPELINE_DRAFT_CANNOT_ENABLE"；DB 中 etl_pipelines.status 仍為 "draft"，enabled 不變 |

### AC-4: 停用 failed Pipeline

| 項目 | 內容 |
|------|------|
| Given | 一個狀態為 `failed`、`enabled = true` 的 Pipeline |
| When | Admin 呼叫 `PATCH /api/v1/etl/pipelines/:id/toggle`，body: `{"enabled": false}` |
| Then | HTTP 200；response.status="disabled"；response.enabled=false；DB 中狀態轉換正確（failed → disabled） |

---

## Test Scenarios

### Positive Scenarios — 後端 API

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F031-001 | 停用 active Pipeline → status=disabled | AC-1, BR-3, BR-6 | Integration | Admin 已登入（JWT Token 有效）；PIPELINE_ACTIVE（status="active"、enabled=true）存在，且有 published 版本 | 1. PATCH /api/v1/etl/pipelines/PIPELINE_ACTIVE.id/toggle，body: `{"enabled": false}` | HTTP 200；response.status="disabled"；response.enabled=false；response.updatedAt 更新為目前時間；DB etl_pipelines 中 status="disabled"、enabled=false |
| TS-F031-002 | 停用 active Pipeline → 排程引擎移除任務 | AC-4, BR-6 | Integration | Admin 已登入；PIPELINE_ACTIVE（status="active"、有排程 schedule="0 2 * * *"）存在 | 1. spy 排程引擎的 removeJob 方法<br>2. PATCH /api/v1/etl/pipelines/PIPELINE_ACTIVE.id/toggle，body: `{"enabled": false}` | removeJob 被呼叫一次，參數含 PIPELINE_ACTIVE.id；排程引擎中該任務不再存在 |
| TS-F031-003 | 啟用 disabled Pipeline（有 published 版本）→ status=active | AC-2, BR-4, BR-7 | Integration | Admin 已登入；PIPELINE_DISABLED（status="disabled"、enabled=false）存在；DB 中 etl_pipeline_versions 有一筆 pipeline_id=PIPELINE_DISABLED.id、status="published" 的版本 | 1. PATCH /api/v1/etl/pipelines/PIPELINE_DISABLED.id/toggle，body: `{"enabled": true}` | HTTP 200；response.status="active"；response.enabled=true；DB etl_pipelines 中 status="active"、enabled=true |
| TS-F031-004 | 啟用 disabled Pipeline → 排程引擎重新註冊任務 | AC-4, BR-7 | Integration | Admin 已登入；PIPELINE_DISABLED（status="disabled"、schedule="0 2 * * *"）存在；有 published 版本 | 1. spy 排程引擎的 addJob / registerJob 方法<br>2. PATCH /api/v1/etl/pipelines/PIPELINE_DISABLED.id/toggle，body: `{"enabled": true}` | addJob / registerJob 被呼叫一次，參數含 PIPELINE_DISABLED.id 與 schedule="0 2 * * *" |
| TS-F031-005 | 停用 failed Pipeline → status=disabled | BR-3 | Integration | Admin 已登入；PIPELINE_FAILED（status="failed"、enabled=true）存在 | 1. PATCH /api/v1/etl/pipelines/PIPELINE_FAILED.id/toggle，body: `{"enabled": false}` | HTTP 200；response.status="disabled"；response.enabled=false；DB etl_pipelines 中 status="disabled"、enabled=false（failed → disabled 狀態轉換正確） |
| TS-F031-006 | 停用無排程 Pipeline → 不呼叫排程引擎 | BR-6 | Integration | Admin 已登入；PIPELINE_ACTIVE_NO_SCHEDULE（status="active"、schedule=null）存在 | 1. spy 排程引擎的 removeJob 方法<br>2. PATCH /api/v1/etl/pipelines/PIPELINE_ACTIVE_NO_SCHEDULE.id/toggle，body: `{"enabled": false}` | HTTP 200；response.status="disabled"；removeJob 未被呼叫（無排程任務可移除） |

### Negative Scenarios — 後端 API

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F031-007 | 草稿 Pipeline 嘗試啟用 → 400 | AC-3, BR-5 | Integration | Admin 已登入；PIPELINE_DRAFT（status="draft"）存在；DB 中無 status="published" 的對應版本 | 1. PATCH /api/v1/etl/pipelines/PIPELINE_DRAFT.id/toggle，body: `{"enabled": true}` | HTTP 400；error.code="PIPELINE_DRAFT_CANNOT_ENABLE"；error.message 含「需先發布 Pipeline 才能啟用」；DB 中 Pipeline status 仍為 "draft"，enabled 不變 |
| TS-F031-008 | Pipeline 不存在 → 404 | BR-1 | Integration | Admin 已登入；ID 為 NON_EXISTENT_UUID 的 Pipeline 不存在（或已軟刪除） | 1. PATCH /api/v1/etl/pipelines/NON_EXISTENT_UUID/toggle，body: `{"enabled": false}` | HTTP 404；error.code="PIPELINE_NOT_FOUND"；error.message 含「找不到指定的 Pipeline」 |
| TS-F031-009 | 已軟刪除的 Pipeline → 404 | BR-1 | Integration | Admin 已登入；PIPELINE_SOFT_DELETED（deleted_at IS NOT NULL）存在於 DB | 1. PATCH /api/v1/etl/pipelines/PIPELINE_SOFT_DELETED.id/toggle，body: `{"enabled": false}` | HTTP 404；error.code="PIPELINE_NOT_FOUND"（軟刪除的 Pipeline 視同不存在） |
| TS-F031-010 | User 角色無權操作 → 403 | BR-1 | Integration | USER_ACTIVE（角色為 user）已登入；任一有效 Pipeline 存在 | 1. 以 User JWT Token 呼叫 PATCH /api/v1/etl/pipelines/:id/toggle，body: `{"enabled": false}` | HTTP 403；error.code="AUTH_FORBIDDEN" |
| TS-F031-011 | 未登入（無 Token）→ 401 | BR-1 | Integration | 無 Authorization Header | 1. PATCH /api/v1/etl/pipelines/:id/toggle（不帶 Token），body: `{"enabled": false}` | HTTP 401；error.code="AUTH_TOKEN_MISSING" |

### Frontend Scenarios — 前端行為

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F031-012 | running 狀態 Pipeline 按鈕為 disabled | UI/UX | Frontend | Pipeline 列表頁面已載入；存在一筆 status="running" 的 Pipeline | 1. 渲染包含 status="running" Pipeline 的列表列<br>2. 查詢操作欄中「啟用」/「停用」按鈕 | 按鈕的 disabled 屬性為 true；DOM 中按鈕含 `[disabled]` 屬性或等效的 aria-disabled="true"；按鈕不可點擊（非僅 CSS 禁用） |
| TS-F031-013 | draft Pipeline 啟用按鈕為 disabled 且顯示 tooltip | UI/UX | Frontend | Pipeline 列表頁面已載入；存在一筆 status="draft" 的 Pipeline | 1. 渲染包含 status="draft" Pipeline 的列表列<br>2. 查詢「啟用」按鈕<br>3. 模擬 hover 事件 | 「啟用」按鈕的 disabled 屬性為 true；hover 後顯示 tooltip，文字為「需先發布 Pipeline 才能啟用」 |
| TS-F031-014 | 停用成功後列表即時更新 | AC-1 | Frontend (E2E) | Admin 已登入；Pipeline 列表頁面已載入；存在 status="active" 的 Pipeline | 1. stub PATCH /toggle 回傳 `{"status":"disabled","enabled":false,...}`<br>2. 點擊對應列的「停用」按鈕<br>3. 觀察列表變化 | 對應列的狀態 Badge 立即更新為「停用」（不需整頁重新載入）；「停用」按鈕變為「啟用」按鈕 |

---

## Test Data Requirements

### 前置資料

| 資料集名稱 | 說明 | 關鍵欄位 |
|-----------|------|---------|
| ADMIN_USER | 具備 Admin 角色的有效帳號 | id=ADMIN_UUID, role="admin", status="active" |
| USER_ACTIVE | 具備 User 角色的有效帳號 | id=USER_UUID, role="user", status="active" |
| PIPELINE_ACTIVE | 狀態為 active 且有排程的 Pipeline | status="active", enabled=true, schedule="0 2 * * *", deleted_at=NULL；對應 etl_pipeline_versions 中有 status="published" 的版本 |
| PIPELINE_ACTIVE_NO_SCHEDULE | 狀態為 active 但無排程的 Pipeline | status="active", enabled=true, schedule=NULL, deleted_at=NULL |
| PIPELINE_DISABLED | 狀態為 disabled 且有 published 版本的 Pipeline | status="disabled", enabled=false, schedule="0 2 * * *", deleted_at=NULL；對應 etl_pipeline_versions 中有 status="published" 的版本 |
| PIPELINE_FAILED | 狀態為 failed 的 Pipeline | status="failed", enabled=true, deleted_at=NULL |
| PIPELINE_DRAFT | 狀態為 draft 且無 published 版本的 Pipeline | status="draft", enabled=false, deleted_at=NULL；對應 etl_pipeline_versions 中無 status="published" 的版本（僅有 status="draft" 的版本） |
| PIPELINE_RUNNING | 狀態為 running 的 Pipeline | status="running", enabled=true, deleted_at=NULL |
| PIPELINE_SOFT_DELETED | 已軟刪除的 Pipeline | deleted_at IS NOT NULL |

### DB 驗證查詢

```sql
-- 驗證停用後狀態
SELECT id, status, enabled, updated_at
FROM etl_pipelines
WHERE id = '<pipeline_id>';

-- 驗證 draft Pipeline 無 published 版本
SELECT COUNT(*) AS published_count
FROM etl_pipeline_versions
WHERE pipeline_id = '<pipeline_id>' AND status = 'published';

-- 驗證軟刪除 Pipeline 不可操作
SELECT id, deleted_at
FROM etl_pipelines
WHERE id = '<pipeline_id>';
```

### 狀態轉換矩陣

| 操作（enabled 值） | 起始狀態 | 預期結果狀態 | 合法？ |
|------------------|----------|------------|--------|
| 停用（enabled=false） | active | disabled | 合法 |
| 停用（enabled=false） | failed | disabled | 合法 |
| 停用（enabled=false） | disabled | disabled | 合法（冪等） |
| 啟用（enabled=true） | disabled | active | 合法（需有 published 版本） |
| 啟用（enabled=true） | draft | — | 非法 → 400 PIPELINE_DRAFT_CANNOT_ENABLE |
| 任意 | running | — | 按鈕 disabled（前端不送出請求） |

> **注意**：規格未定義對已是 `disabled` 的 Pipeline 再次送出 `enabled=false` 的行為。本測試設計假設冪等處理（回傳 200 且狀態不變）。若實作不同，應補充至 risks-and-gaps.md。

---

## Risks and Notes

| 風險 / 注意事項 | 說明 |
|----------------|------|
| 排程引擎整合測試 seam | BR-6 / BR-7 要求停用時移除排程任務、啟用時重新註冊。排程引擎（例如 Bull、node-cron）需在測試中可被 spy / mock，否則僅能驗證 DB 狀態而無法驗證排程引擎行為。若排程引擎無法注入，TS-F031-002 / TS-F031-004 / TS-F031-006 應退為手動整合測試。 |
| 冪等性行為未定義 | 規格未說明對已停用的 Pipeline 再次送出 `enabled=false` 的預期行為（應回 200 或 4xx）。本設計假設冪等（200），但需向 Architecture 確認，已記錄於上方狀態轉換矩陣注意事項。 |
| running 狀態的後端防護 | 規格第 7 節說明 running 時按鈕為 disabled（前端行為），但未說明後端是否也拒絕對 running Pipeline 的 toggle 操作（例如回傳 409 PIPELINE_RUNNING）。若後端無防護，僅依賴前端 disabled 屬性，需確認並補充後端測試場景。 |
| draft Pipeline 停用行為 | 規格 BR-3 定義 `active / failed → disabled`，但未明確說明 `draft → disabled` 是否允許。本測試設計不涵蓋對 draft Pipeline 送出 `enabled=false` 的場景，待 Product 確認。 |
| 無排程 Pipeline 啟用後的排程引擎行為 | PIPELINE_ACTIVE_NO_SCHEDULE 場景測試停用時不呼叫 removeJob（TS-F031-006），但未測試啟用無排程 Pipeline 時排程引擎的行為（理應不呼叫 addJob）。若規格有此需求，應補充場景。 |
