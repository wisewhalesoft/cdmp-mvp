---
type: test-design-feature
feature_id: F034
feature_name: 刪除 Pipeline
priority: P1
related_spec: /docs/specs/features/F034-delete-pipeline.md
last_updated: 2026-03-20
---

# F034: 刪除 Pipeline — 測試設計

---

## Acceptance Test Design

### AC-1: 成功刪除（非 running 狀態）

| 項目 | 內容 |
|------|------|
| Given | Admin 已登入，PIPELINE_ACTIVE（status="active"，deleted_at IS NULL）存在 |
| When | 呼叫 `DELETE /api/v1/etl/pipelines/:id` |
| Then | HTTP 200；`{ "message": "Pipeline 已刪除" }`；DB 中 deleted_at IS NOT NULL（UTC 時間戳記）；GET /api/v1/etl/pipelines 列表中不再出現此 Pipeline；排程引擎排除此 Pipeline |
| 驗證步驟 | 1. 驗證 HTTP 狀態碼為 200<br>2. 驗證 response.message = "Pipeline 已刪除"<br>3. 查詢 DB：`SELECT deleted_at FROM etl_pipelines WHERE id = :id` → deleted_at IS NOT NULL<br>4. 呼叫 GET /api/v1/etl/pipelines，確認已刪除 Pipeline 不出現於 data 陣列<br>5. 驗證排程引擎的查詢條件包含 `deleted_at IS NULL`（即軟刪除後自動排除） |

### AC-2: 確認對話框（前端行為）

| 項目 | 內容 |
|------|------|
| Given | Admin 在 Pipeline 列表頁面，點擊某 Pipeline 的「刪除」按鈕 |
| When | 系統彈出確認對話框 |
| Then | 對話框標題為「確認刪除 Pipeline」；內容顯示 Pipeline 名稱；顯示影響說明「刪除後排程將停止，歷史日誌將保留」；包含「確認刪除」（紅色）與「取消」兩個按鈕；點擊「取消」後 Pipeline 不被刪除，列表不變 |

### AC-3: 執行中不可刪除

| 項目 | 內容 |
|------|------|
| Given | PIPELINE_RUNNING（status="running"）存在 |
| When | 呼叫 `DELETE /api/v1/etl/pipelines/:id`（對 running Pipeline） |
| Then | HTTP 409；error.code = "PIPELINE_RUNNING"；DB 中 deleted_at 仍為 NULL |

### AC-4: 日誌保留

| 項目 | 內容 |
|------|------|
| Given | PIPELINE_ACTIVE 有歷史 EtlPipelineLog（若干筆），且 Pipeline 已被軟刪除 |
| When | 查詢該 Pipeline 的 EtlPipelineLog（透過 pipeline_id） |
| Then | EtlPipelineLog 資料仍存在於 DB，不因 Pipeline 軟刪除而清除；log 筆數與刪除前一致 |

---

## Test Scenarios

### Positive Scenarios — 後端 API

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F034-001 | 成功軟刪除 active Pipeline | AC-1, BR-2, BR-3 | Integration | Admin 已登入（JWT Token 有效）；PIPELINE_ACTIVE（status="active"，deleted_at IS NULL）存在 | 1. DELETE /api/v1/etl/pipelines/:id<br>2. 查詢 DB：SELECT deleted_at FROM etl_pipelines WHERE id = :id | HTTP 200；`{ "message": "Pipeline 已刪除" }`；DB 中 deleted_at IS NOT NULL（非空 UTC 時間戳記）；deleted_at 值為當下 UTC 時間（±5 秒容差） |
| TS-F034-002 | 成功軟刪除 failed Pipeline | AC-1, BR-2, BR-3 | Integration | Admin 已登入；PIPELINE_FAILED（status="failed"，deleted_at IS NULL）存在 | 1. DELETE /api/v1/etl/pipelines/:id（對 failed Pipeline） | HTTP 200；DB 中 deleted_at IS NOT NULL |
| TS-F034-003 | 成功軟刪除 disabled Pipeline | AC-1, BR-2, BR-3 | Integration | Admin 已登入；PIPELINE_DISABLED（status="disabled"，deleted_at IS NULL）存在 | 1. DELETE /api/v1/etl/pipelines/:id（對 disabled Pipeline） | HTTP 200；DB 中 deleted_at IS NOT NULL |
| TS-F034-004 | 成功軟刪除 draft Pipeline | AC-1, BR-2, BR-3 | Integration | Admin 已登入；PIPELINE_DRAFT（status="draft"，deleted_at IS NULL）存在 | 1. DELETE /api/v1/etl/pipelines/:id（對 draft Pipeline） | HTTP 200；DB 中 deleted_at IS NOT NULL |
| TS-F034-005 | 刪除後從列表消失 | AC-1, BR-4 | Integration | PIPELINE_ACTIVE 已軟刪除（TS-F034-001 後狀態） | 1. GET /api/v1/etl/pipelines | 回應 data 陣列中不含已刪除 Pipeline（id 不出現）；total 計數不包含已軟刪除 Pipeline |
| TS-F034-006 | 日誌保留（軟刪除後仍可查詢） | AC-4, BR-5 | Integration | PIPELINE_WITH_LOGS（有 3 筆 EtlPipelineLog）已軟刪除 | 1. 直接查詢 DB：SELECT COUNT(*) FROM etl_pipeline_logs WHERE pipeline_id = :id | DB 中 EtlPipelineLog 筆數仍為 3；log 記錄不因 Pipeline 軟刪除而清除 |
| TS-F034-007 | 名稱唯一性在軟刪除後釋放 | BR-6 | Integration | PIPELINE_DELETED（name="舊Pipeline"，deleted_at IS NOT NULL）存在 | 1. POST /api/v1/etl/pipelines，body: `{"name":"舊Pipeline"}` | HTTP 201；新 Pipeline 成功建立；名稱唯一性僅檢查 deleted_at IS NULL 的記錄 |

### Negative Scenarios — 後端 API

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F034-008 | 執行中 Pipeline 不可刪除 → 409 | AC-3, BR-2 | Integration | Admin 已登入；PIPELINE_RUNNING（status="running"，deleted_at IS NULL）存在 | 1. DELETE /api/v1/etl/pipelines/PIPELINE_RUNNING.id | HTTP 409；error.code="PIPELINE_RUNNING"；error.message 含「Pipeline 正在執行中，無法刪除」；DB 中 deleted_at 仍為 NULL |
| TS-F034-009 | 已軟刪除的 Pipeline 再次刪除 → 404 | 邊界情況, BR-3 | Integration | PIPELINE_DELETED（deleted_at IS NOT NULL）存在 | 1. DELETE /api/v1/etl/pipelines/PIPELINE_DELETED.id（第二次刪除） | HTTP 404；error.code="PIPELINE_NOT_FOUND" |
| TS-F034-010 | 不存在的 Pipeline → 404 | AC-1 前置條件 | Integration | 使用一個不存在的隨機 UUID | 1. DELETE /api/v1/etl/pipelines/00000000-0000-0000-0000-000000000000 | HTTP 404；error.code="PIPELINE_NOT_FOUND" |
| TS-F034-011 | User 角色無權刪除 → 403 | BR-1 | Integration | USER_ACTIVE（角色為 user）已登入；PIPELINE_ACTIVE 存在 | 1. 以 User JWT Token 呼叫 DELETE /api/v1/etl/pipelines/:id | HTTP 403；error.code="AUTH_FORBIDDEN"；DB 中 deleted_at 仍為 NULL |
| TS-F034-012 | 未登入（無 Token）→ 401 | BR-1 | Integration | 無 Authorization Header | 1. DELETE /api/v1/etl/pipelines/:id（不帶 Token） | HTTP 401；error.code="AUTH_TOKEN_MISSING" |

### Frontend Scenarios — 前端行為

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F034-013 | 確認對話框顯示內容正確 | AC-2, UI | E2E | Admin 登入；Pipeline 列表含 PIPELINE_ACTIVE（name="客戶資料同步"） | 1. 點擊「客戶資料同步」列的「刪除」按鈕 | 對話框顯示標題「確認刪除 Pipeline」；內容含 Pipeline 名稱「客戶資料同步」；顯示影響說明「刪除後排程將停止，歷史日誌將保留」；有「確認刪除」（紅色）與「取消」兩個按鈕 |
| TS-F034-014 | 點擊取消不刪除 Pipeline | AC-2, 替代流程 | E2E | Admin 登入；確認對話框已顯示 | 1. 點擊確認對話框的「取消」按鈕 | 對話框關閉；Pipeline 仍出現於列表；未發送 DELETE API 呼叫 |
| TS-F034-015 | 執行中 Pipeline 刪除按鈕停用 | AC-3, UI/UX | E2E | Admin 登入；PIPELINE_RUNNING（status="running"）出現在列表中 | 1. 觀察 running Pipeline 列的「刪除」按鈕狀態 | 按鈕為停用狀態（灰色，disabled attribute 存在）；hover 時顯示 tooltip「Pipeline 正在執行中，無法刪除」 |

---

## Test Data Requirements

### 前置資料

| 資料集名稱 | 說明 | 關鍵欄位 |
|-----------|------|---------|
| ADMIN_USER | 具備 Admin 角色的有效帳號 | id=ADMIN_UUID, role="admin", status="active" |
| USER_ACTIVE | 具備 User 角色的有效帳號 | id=USER_UUID, role="user", status="active" |
| PIPELINE_ACTIVE | 狀態為 active 的有效 Pipeline | id=PIPELINE_ACTIVE_ID, name="測試Pipeline_Active", status="active", deleted_at=NULL |
| PIPELINE_FAILED | 狀態為 failed 的 Pipeline | id=PIPELINE_FAILED_ID, name="測試Pipeline_Failed", status="failed", deleted_at=NULL |
| PIPELINE_DISABLED | 狀態為 disabled 的 Pipeline | id=PIPELINE_DISABLED_ID, name="測試Pipeline_Disabled", status="disabled", deleted_at=NULL |
| PIPELINE_DRAFT | 狀態為 draft 的 Pipeline | id=PIPELINE_DRAFT_ID, name="測試Pipeline_Draft", status="draft", deleted_at=NULL |
| PIPELINE_RUNNING | 狀態為 running 的 Pipeline | id=PIPELINE_RUNNING_ID, name="測試Pipeline_Running", status="running", deleted_at=NULL |
| PIPELINE_WITH_LOGS | 有歷史 EtlPipelineLog 的 Pipeline | id=PIPELINE_WITH_LOGS_ID, name="有日誌的Pipeline"；關聯 3 筆 EtlPipelineLog（completed 狀態） |
| PIPELINE_DELETED | 已軟刪除的 Pipeline | id=PIPELINE_DELETED_ID, name="舊Pipeline", deleted_at=<過去時間戳記> |

### DB 驗證查詢

```sql
-- 驗證軟刪除生效
SELECT id, name, status, deleted_at
FROM etl_pipelines
WHERE id = '<pipeline_id>';
-- 期望：deleted_at IS NOT NULL

-- 驗證列表排除已軟刪除記錄
SELECT COUNT(*) FROM etl_pipelines
WHERE deleted_at IS NULL;

-- 驗證 EtlPipelineLog 不受影響
SELECT COUNT(*) FROM etl_pipeline_logs
WHERE pipeline_id = '<pipeline_id>';
-- 期望：刪除前後數量不變

-- 驗證名稱唯一性僅檢查未刪除記錄
SELECT COUNT(*) FROM etl_pipelines
WHERE name = '<pipeline_name>' AND deleted_at IS NULL;
-- 期望：軟刪除後此數值為 0，可建立同名新 Pipeline
```

---

## Risks and Notes

| 風險 / 注意事項 | 說明 |
|----------------|------|
| 排程引擎排除的驗證方式 | BR-4 要求軟刪除後排程引擎自動排除，驗證方式依賴排程引擎的查詢邏輯（`deleted_at IS NULL` 篩選條件）。建議透過 spy/mock 確認排程引擎在刪除後不再讀取此 Pipeline；或使用 `scanAndExecute(fakeNow)` 驗證已刪除 Pipeline 不被觸發 |
| running 狀態在對話框顯示期間發生變化 | 規格提及「確認對話框顯示期間 status 變為 running」時提交回傳 409（邊界情況）。前端只能靠 API 回應得知此狀態，無法在對話框顯示前預知 — 需確認前端接收到 409 後的 UX 行為（是否顯示錯誤訊息並刷新列表） |
| EtlPipelineLog 查詢端點 | AC-4 日誌保留驗證使用 DB 直接查詢。若有對應的 API 端點（如 GET /api/v1/etl/pipelines/:id/logs），應補充 API 層驗證；目前 F034 規格未定義此端點，透過 pipeline_id 直接查詢 DB 作為整合測試替代方案 |
| 軟刪除不回傳 deleted_at | API 回應（200）僅含 `{ "message": "Pipeline 已刪除" }`，deleted_at 的設定需透過 DB 查詢驗證，無法從 API 回應直接確認 |
