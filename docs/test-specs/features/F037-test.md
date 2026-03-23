---
type: test-design-feature
feature_id: F037
feature_name: 發布 Pipeline 版本
priority: P0-MVP
related_spec: /docs/specs/features/F037-publish-pipeline-version.md
last_updated: 2026-03-23
---

# F037: 發布 Pipeline 版本 — 測試設計

---

## Acceptance Test Design

### AC-1: 成功發布 testing 版本

| 項目 | 內容 |
|------|------|
| Given | 一個版本狀態為 `testing` 的 EtlPipelineVersion（已有至少一次成功的測試執行），Admin 已登入 |
| When | 呼叫 `PATCH /api/v1/etl/pipelines/:id/versions/:versionId/publish` |
| Then | HTTP 200；response.status="published"；response.publishedAt 為合法 ISO 8601 時間戳；DB 中 etl_pipeline_versions.status="published"；DB 中 etl_pipelines.version 更新為此版本號（同一 Transaction） |
| 驗證步驟 | 1. 驗證 HTTP 狀態碼為 200<br>2. 驗證 response.status = "published"<br>3. 驗證 response.publishedAt 符合 ISO 8601 格式（非 null）<br>4. 驗證 response.version 與發布版本號相符<br>5. 查詢 DB 確認 etl_pipeline_versions.status = "published"<br>6. 查詢 DB 確認 etl_pipelines.version = 該版本號 |

### AC-2: 發布後 Pipeline 可被啟用（不再阻擋 PIPELINE_DRAFT_CANNOT_ENABLE）

| 項目 | 內容 |
|------|------|
| Given | 一個 Pipeline 僅有 draft 版本（status="draft"），Admin 發布該版本後 |
| When | Admin 對 Pipeline 呼叫 `PATCH /api/v1/etl/pipelines/:id/toggle`，body: `{"enabled": true}` |
| Then | HTTP 200；Pipeline 成功啟用，status="active"；不再回傳 PIPELINE_DRAFT_CANNOT_ENABLE 錯誤 |
| 驗證步驟 | 1. 執行完整端到端流程：測試執行 → 版本升為 testing → 發布 → 啟用<br>2. 確認 toggle 呼叫回傳 200<br>3. 確認 response.status = "active" |

### AC-3: 阻止發布 draft 版本

| 項目 | 內容 |
|------|------|
| Given | 一個版本狀態為 `draft` 的 EtlPipelineVersion（從未通過測試執行） |
| When | Admin 呼叫 `PATCH /api/v1/etl/pipelines/:id/versions/:versionId/publish` |
| Then | HTTP 422；error.code="PIPELINE_PUBLISH_REQUIRES_TEST"；error.message 含「請先完成測試執行」；DB 中版本狀態仍為 "draft"，etl_pipelines.version 不變 |

### AC-4: 確認對話框內容（UI）

| 項目 | 內容 |
|------|------|
| Given | 版本管理頁面中有一個 `testing` 狀態的版本（版本號 vN） |
| When | Admin 點擊該版本的 rocket icon 發布按鈕 |
| Then | 確認對話框出現；標題為「確認發布版本」；內容含版本號（「確定要發布版本 vN 嗎？」）；含影響說明文字；含「取消」與「確認發布」兩個按鈕；「確認發布」按鈕為綠色實心 |

### AC-5: draft 版本的發布按鈕為停用狀態（UI）

| 項目 | 內容 |
|------|------|
| Given | 版本管理清單中存在一個 `draft` 狀態的版本 |
| When | Admin 查看操作欄 |
| Then | rocket icon 按鈕的 disabled 屬性為 true；滑鼠移至其上顯示 tooltip「請先完成測試執行」；按鈕不可點擊（非僅 CSS 停用） |

### AC-6: published 版本無法重複發布

| 項目 | 內容 |
|------|------|
| Given | 一個已是 `published` 狀態的 EtlPipelineVersion |
| When | Admin 呼叫 `PATCH /api/v1/etl/pipelines/:id/versions/:versionId/publish` |
| Then | HTTP 422；error.code="PIPELINE_VERSION_ALREADY_PUBLISHED"；error.message 含「此版本已發布」 |

### AC-7: 編輯器工具列發布成功後 Badge 即時更新（UI）

| 項目 | 內容 |
|------|------|
| Given | Admin 在 Pipeline 編輯器頁面，當前版本狀態為 `testing` |
| When | Admin 點擊工具列「發布」按鈕，於確認對話框中確認 |
| Then | API 呼叫成功後，工具列版本狀態 Badge 即時更新為 `published`（綠色），無需重新整理頁面 |

### AC-8: 發布中防止重複提交（UI）

| 項目 | 內容 |
|------|------|
| Given | Admin 點擊「確認發布」後 API 請求尚未完成 |
| When | 請求 pending 期間 |
| Then | 「確認發布」按鈕顯示 Loading spinner；按鈕 disabled 屬性為 true（不可再次點擊） |

---

## Test Scenarios

### Positive Scenarios — 後端 API（Service 層）

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F037-001 | 發布 testing 版本 → status=published | AC-1, BR-3, BR-5 | Unit (Service) | VERSION_TESTING（status="testing"、pipeline_id=PIPELINE_A.id、version=2）存在；PIPELINE_A（version=1）存在 | 1. mock pipelineRepository.findOne 回傳 PIPELINE_A<br>2. mock versionRepository.findOne 回傳 VERSION_TESTING<br>3. mock dataSource.transaction 執行 callback<br>4. 呼叫 service.publishVersion(PIPELINE_A.id, VERSION_TESTING.id) | 函式正常 resolve；versionRepository.save 被呼叫，status="published"、published_at 非 null；pipelineRepository.save 被呼叫，version=2 |
| TS-F037-002 | 發布後 EtlPipeline.version 更新為正確版本號 | AC-1, BR-5 | Unit (Service) | VERSION_TESTING（version=3）存在；PIPELINE_A（version=2）存在 | 1. mock 回傳 PIPELINE_A 與 VERSION_TESTING<br>2. mock dataSource.transaction<br>3. 呼叫 service.publishVersion | pipelineRepository.save 被呼叫，傳入物件的 version=3（從 2 更新為 3） |
| TS-F037-003 | 發布操作在同一 Transaction 中執行 | AC-1, BR-5 | Unit (Service) | 同 TS-F037-001 | 1. spy dataSource.transaction<br>2. 呼叫 service.publishVersion | dataSource.transaction 被呼叫一次；version save 與 pipeline save 均在 transaction callback 內執行（非獨立 save 呼叫） |
| TS-F037-004 | 發布成功回傳正確 response 欄位 | AC-1 | Unit (Service) | VERSION_TESTING（id="v-uuid"、version=2、change_summary="新功能"）存在 | 1. mock 相關 repository<br>2. 呼叫 service.publishVersion<br>3. 接收回傳值 | 回傳物件含 id="v-uuid"；pipelineId=PIPELINE_A.id；version=2；status="published"；changeSummary="新功能"；publishedAt 為合法 Date 物件 |
| TS-F037-005 | 舊的 published 版本保留不被修改（歷史保存） | BR-6 | Integration | PIPELINE_B（version=1）；VERSION_V1（status="published"、version=1）；VERSION_V2（status="testing"、version=2）存在 | 1. PATCH /api/v1/etl/pipelines/PIPELINE_B.id/versions/VERSION_V2.id/publish | HTTP 200；查詢 DB 確認 VERSION_V1.status 仍為 "published"（未被降級）；PIPELINE_B.version = 2 |

### Positive Scenarios — 後端 API（Integration 層）

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F037-006 | 完整 API 流程：發布 testing 版本 | AC-1, BR-3, BR-5 | Integration | Admin 已登入（JWT Token 有效）；PIPELINE_DRAFT（status="draft"）；VERSION_TESTING（status="testing"、version=1）存在 | 1. PATCH /api/v1/etl/pipelines/PIPELINE_DRAFT.id/versions/VERSION_TESTING.id/publish，帶 Admin JWT Header | HTTP 200；response.id = VERSION_TESTING.id；response.pipelineId = PIPELINE_DRAFT.id；response.version = 1；response.status = "published"；response.publishedAt 符合 ISO 8601 |
| TS-F037-007 | 發布後 DB 雙欄位同步更新 | AC-1, BR-5 | Integration | 同 TS-F037-006 | 1. PATCH publish API<br>2. 查詢 DB etl_pipeline_versions WHERE id=VERSION_TESTING.id<br>3. 查詢 DB etl_pipelines WHERE id=PIPELINE_DRAFT.id | etl_pipeline_versions.status="published"、published_at IS NOT NULL；etl_pipelines.version = 1 |
| TS-F037-008 | 端到端：發布後啟用 Pipeline 成功 | AC-2, BR-5, BR-7 | Integration (E2E) | Admin 已登入；PIPELINE_E2E（status="draft"）；VERSION_E2E（status="testing"）存在 | 1. PATCH publish VERSION_E2E<br>2. PATCH /api/v1/etl/pipelines/PIPELINE_E2E.id/toggle，body: `{"enabled": true}` | 步驟 1 回傳 HTTP 200；步驟 2 回傳 HTTP 200，response.status="active"（不回傳 PIPELINE_DRAFT_CANNOT_ENABLE） |
| TS-F037-009 | 多個 published 版本共存：排程以最大 version 號選取 | BR-6, BR-8 | Integration | PIPELINE_MULTI（schedule="0 2 * * *"、enabled=true）；VERSION_V1（status="published"、version=1）；VERSION_V2（status="published"、version=2）存在 | 1. 呼叫 scanAndExecute(fakeNow=UTC 2026-01-01T02:00:00Z) | 新建 EtlPipelineLog.version = 2（最新 published 版本號） |
| TS-F037-010 | 發布後 Pipeline status 不自動改變（仍為 draft） | BR-7 | Integration | PIPELINE_DRAFT（status="draft"）；VERSION_TESTING（status="testing"）存在 | 1. PATCH publish API<br>2. 查詢 DB etl_pipelines.status | etl_pipelines.status 仍為 "draft"（發布不自動啟用） |
| TS-F037-011 | Pipeline 執行中時仍可發布版本（無衝突） | 邊界條件（第 7 節） | Integration | Admin 已登入；PIPELINE_RUNNING（status="running"）；VERSION_TESTING（status="testing"）存在 | 1. PATCH publish API | HTTP 200；發布操作成功（running 狀態與發布無衝突） |

### Negative Scenarios — 後端 API

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F037-012 | 發布 draft 版本 → 422 PIPELINE_PUBLISH_REQUIRES_TEST | AC-3, BR-3 | Unit (Service) | VERSION_DRAFT（status="draft"）存在 | 1. mock versionRepository.findOne 回傳 VERSION_DRAFT<br>2. 呼叫 service.publishVersion | 拋出 UnprocessableEntityException；error.error = "PIPELINE_PUBLISH_REQUIRES_TEST"；error.message 含「請先完成測試執行」；DB 版本狀態不變 |
| TS-F037-013 | 發布 published 版本 → 422 PIPELINE_VERSION_ALREADY_PUBLISHED | AC-6 | Unit (Service) | VERSION_PUBLISHED（status="published"）存在 | 1. mock versionRepository.findOne 回傳 VERSION_PUBLISHED<br>2. 呼叫 service.publishVersion | 拋出 UnprocessableEntityException；error.error = "PIPELINE_VERSION_ALREADY_PUBLISHED"；error.message 含「此版本已發布」 |
| TS-F037-014 | Pipeline 不存在 → 404 PIPELINE_NOT_FOUND | BR-1 | Integration | Admin 已登入；NON_EXISTENT_PIPELINE_UUID 不存在 | 1. PATCH /api/v1/etl/pipelines/NON_EXISTENT_PIPELINE_UUID/versions/SOME_VERSION_UUID/publish | HTTP 404；error.code="PIPELINE_NOT_FOUND"；error.message 含「找不到指定的 Pipeline」 |
| TS-F037-015 | 已軟刪除的 Pipeline → 404 PIPELINE_NOT_FOUND | BR-1 | Integration | Admin 已登入；PIPELINE_SOFT_DELETED（deleted_at IS NOT NULL）存在於 DB | 1. PATCH /api/v1/etl/pipelines/PIPELINE_SOFT_DELETED.id/versions/SOME_VERSION_UUID/publish | HTTP 404；error.code="PIPELINE_NOT_FOUND"（軟刪除 Pipeline 視同不存在） |
| TS-F037-016 | 版本不存在 → 404 PIPELINE_VERSION_NOT_FOUND | BR-2 | Integration | Admin 已登入；PIPELINE_ACTIVE 存在；NON_EXISTENT_VERSION_UUID 不存在 | 1. PATCH /api/v1/etl/pipelines/PIPELINE_ACTIVE.id/versions/NON_EXISTENT_VERSION_UUID/publish | HTTP 404；error.code="PIPELINE_VERSION_NOT_FOUND"；error.message 含「找不到指定的版本」 |
| TS-F037-017 | 版本 ID 不屬於該 Pipeline → 404 PIPELINE_VERSION_NOT_FOUND | BR-2 | Integration | Admin 已登入；PIPELINE_A、PIPELINE_B 均存在；VERSION_B（pipeline_id=PIPELINE_B.id）存在 | 1. PATCH /api/v1/etl/pipelines/PIPELINE_A.id/versions/VERSION_B.id/publish | HTTP 404；error.code="PIPELINE_VERSION_NOT_FOUND"（pipeline_id 不匹配） |
| TS-F037-018 | User 角色無權發布 → 403 AUTH_FORBIDDEN | BR-1 | Integration | USER_ACTIVE（角色為 user）已登入；VERSION_TESTING 存在 | 1. 以 User JWT Token 呼叫 PATCH publish API | HTTP 403；error.code="AUTH_FORBIDDEN" |
| TS-F037-019 | 未登入（無 Token）→ 401 AUTH_TOKEN_MISSING | BR-1 | Integration | 無 Authorization Header | 1. PATCH publish API（不帶 Token） | HTTP 401；error.code="AUTH_TOKEN_MISSING" |
| TS-F037-020 | DB Transaction 失敗 → 500 SYSTEM_INTERNAL_ERROR | 錯誤處理 | Unit (Service) | mock dataSource.transaction 拋出 Error | 1. mock dataSource.transaction 拋出例外<br>2. 呼叫 service.publishVersion | 拋出 InternalServerErrorException；error.code="SYSTEM_INTERNAL_ERROR"；DB 兩個資料表均未被修改（Transaction 回滾） |

### Boundary Scenarios — 邊界條件

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F037-021 | version=1（首個版本）發布後 EtlPipeline.version 從 null/0 更新為 1 | BR-5 | Integration | PIPELINE_FRESH（version=null 或 version=0，尚未發布過任何版本）；VERSION_V1（status="testing"、version=1）存在 | 1. PATCH publish VERSION_V1 | HTTP 200；DB etl_pipelines.version = 1 |
| TS-F037-022 | 同一 Pipeline 發布第二個版本後 EtlPipeline.version 更新為最新 | BR-5, BR-8 | Integration | PIPELINE_WITH_V1_PUBLISHED（version=1）；VERSION_V2（status="testing"、version=2）存在 | 1. PATCH publish VERSION_V2 | HTTP 200；DB etl_pipelines.version = 2（從 1 更新為 2） |
| TS-F037-023 | change_summary 為 null 時 response.changeSummary 為 null（非空字串） | AC-1 | Integration | VERSION_TESTING（change_summary=null）存在 | 1. PATCH publish API | HTTP 200；response.changeSummary = null（欄位存在但值為 null） |
| TS-F037-024 | change_summary 為 500 字元的版本可正常發布 | BR-3（changeSummary 邊界） | Integration | VERSION_TESTING（change_summary 為恰好 500 字元字串）存在 | 1. PATCH publish API | HTTP 200；response.changeSummary.length = 500 |

### Frontend Scenarios — 版本管理頁面（入口一）

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F037-025 | testing 版本顯示可點擊的 rocket icon 按鈕 | AC-4, UI/UX 第 10 節 | Frontend (Unit) | 版本管理頁面渲染一筆 status="testing" 的版本列 | 1. 渲染版本列表，含一筆 VERSION_TESTING<br>2. 查詢操作欄的 rocket icon 按鈕 | 按鈕存在且 disabled 屬性為 false；cursor 為 pointer（可互動狀態） |
| TS-F037-026 | draft 版本的 rocket icon 按鈕為 disabled + tooltip | AC-5, UI/UX 第 10 節 | Frontend (Unit) | 版本管理頁面渲染一筆 status="draft" 的版本列 | 1. 渲染版本列表，含一筆 VERSION_DRAFT<br>2. 查詢 rocket icon 按鈕<br>3. 模擬 hover 事件 | 按鈕 disabled 屬性為 true；按鈕非僅 CSS 停用（DOM 中含 `[disabled]` 屬性）；hover 後顯示 tooltip，文字為「請先完成測試執行」 |
| TS-F037-027 | published 版本不顯示 rocket icon（改顯示 history icon）| UI/UX 第 10 節 | Frontend (Unit) | 版本管理頁面渲染一筆 status="published" 的版本列 | 1. 渲染版本列表，含一筆 VERSION_PUBLISHED<br>2. 查詢操作欄 | 操作欄中不存在 rocket icon 按鈕；存在 history icon（回滾按鈕） |
| TS-F037-028 | 點擊 testing 版本 rocket icon → 確認對話框出現 | AC-4, UI/UX 第 10 節 | Frontend (Unit) | 版本管理頁面已載入；VERSION_TESTING（version=3）存在 | 1. 渲染版本列表<br>2. 點擊 VERSION_TESTING 的 rocket icon 按鈕 | 確認對話框出現（DOM 中存在）；對話框標題含「確認發布版本」；對話框內容含「確定要發布版本 v3 嗎？」；對話框含「取消」與「確認發布」兩個按鈕 |
| TS-F037-029 | 點擊確認對話框「取消」→ 對話框關閉，無 API 呼叫 | AC（替代流程） | Frontend (Unit) | 確認對話框已開啟 | 1. 點擊「取消」按鈕 | 對話框從 DOM 中消失；PATCH publish API 未被呼叫（spy API 函式確認呼叫次數為 0） |
| TS-F037-030 | 點擊「確認發布」→ API 呼叫中按鈕顯示 Loading spinner 且 disabled | AC-8, UI/UX 第 10 節 | Frontend (Unit) | 確認對話框已開啟；stub PATCH publish API 保持 pending（不 resolve） | 1. 點擊「確認發布」按鈕 | 「確認發布」按鈕顯示 Loading spinner；按鈕 disabled 屬性為 true；「取消」按鈕亦為 disabled（防止取消中途操作） |
| TS-F037-031 | 發布成功 → 對話框關閉 + 版本列表 Badge 更新 + Toast 顯示 | AC-1, UI/UX 第 10 節 | Frontend (Unit) | 確認對話框已開啟；stub PATCH publish API 回傳 `{status:"published", version:3}` | 1. 點擊「確認發布」按鈕<br>2. 等待 API stub resolve | 確認對話框從 DOM 消失；版本列表中 VERSION_TESTING 對應列的狀態 Badge 更新為「published」（綠色）；Toast 出現，主標含「版本已發布」；副標含「v3 已發布，Pipeline 現在可以啟用排程」 |
| TS-F037-032 | Toast 3 秒後自動消失 | UI/UX 第 10 節 | Frontend (Unit) | 發布成功後 Toast 已出現 | 1. 使用 fake timer<br>2. 推進時間至 3000ms | Toast 元素從 DOM 中消失（3 秒後自動關閉） |
| TS-F037-033 | 發布失敗（API 回傳 422）→ 顯示錯誤提示，對話框保持開啟 | AC-3 | Frontend (Unit) | 確認對話框已開啟；stub PATCH publish API 回傳 422 PIPELINE_PUBLISH_REQUIRES_TEST | 1. 點擊「確認發布」按鈕<br>2. 等待 API stub reject | 確認對話框仍然存在（未關閉）；「確認發布」按鈕恢復可點擊狀態（無 spinner）；頁面顯示錯誤提示，文字含「請先完成測試執行」 |

### Frontend Scenarios — 編輯器工具列（入口二）

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F037-034 | testing 版本：工具列「發布」按鈕可點擊 | AC-7, UI/UX 第 10 節 | Frontend (Unit) | Pipeline 編輯器頁面已載入；當前版本狀態為 "testing" | 1. 渲染 Pipeline 編輯器工具列，currentVersion.status="testing"<br>2. 查詢「發布」按鈕 | 「發布」按鈕（rocket icon + 文字）存在；disabled 屬性為 false；按鈕位於「儲存」按鈕右側 |
| TS-F037-035 | draft 版本：工具列「發布」按鈕為 disabled + tooltip | AC-7, UI/UX 第 10 節 | Frontend (Unit) | Pipeline 編輯器頁面已載入；當前版本狀態為 "draft" | 1. 渲染工具列，currentVersion.status="draft"<br>2. 查詢「發布」按鈕<br>3. 模擬 hover | 「發布」按鈕 disabled 屬性為 true；hover 後 tooltip 顯示「請先完成測試執行」 |
| TS-F037-036 | published 版本：工具列「發布」按鈕隱藏或為 disabled | AC-7, UI/UX 第 10 節 | Frontend (Unit) | Pipeline 編輯器頁面已載入；當前版本狀態為 "published" | 1. 渲染工具列，currentVersion.status="published" | 「發布」按鈕不存在於 DOM 中（hidden）或 disabled 屬性為 true |
| TS-F037-037 | 編輯器發布成功 → 工具列版本 Badge 即時更新為 published（綠色） | AC-7, UI/UX 第 10 節 | Frontend (Unit) | Pipeline 編輯器已載入；currentVersion.status="testing"；工具列頂部顯示版本 Badge（橘色 "v2 testing"）；stub PATCH publish API 回傳 200 | 1. 點擊工具列「發布」按鈕<br>2. 於確認對話框中點擊「確認發布」<br>3. 等待 stub resolve | 工具列版本 Badge 即時更新為綠色，文字為「v2 published」（無需重新載入頁面） |

---

## Test Data Requirements

### 前置資料

| 資料集名稱 | 說明 | 關鍵欄位 |
|-----------|------|---------|
| ADMIN_USER | 具備 Admin 角色的有效帳號 | id=ADMIN_UUID, role="admin", status="active" |
| USER_ACTIVE | 具備 User 角色的有效帳號 | id=USER_UUID, role="user", status="active" |
| PIPELINE_DRAFT | 狀態為 draft（無 published 版本）的 Pipeline | status="draft", enabled=false, version=0 or null, deleted_at=NULL |
| PIPELINE_ACTIVE | 狀態為 active 的 Pipeline | status="active", enabled=true, deleted_at=NULL；對應至少一個 published 版本 |
| PIPELINE_RUNNING | 狀態為 running 的 Pipeline | status="running", deleted_at=NULL |
| PIPELINE_SOFT_DELETED | 已軟刪除的 Pipeline | deleted_at IS NOT NULL |
| PIPELINE_MULTI | 有多個 published 版本的 Pipeline（驗證排程選版本邏輯） | status="active", enabled=true, schedule="0 2 * * *"；有 VERSION_V1（published）與 VERSION_V2（published）兩個版本 |
| VERSION_DRAFT | 狀態為 draft 的版本 | status="draft", pipeline_id=PIPELINE_DRAFT.id, version=1 |
| VERSION_TESTING | 狀態為 testing 的版本（已通過測試執行）| status="testing", pipeline_id=PIPELINE_DRAFT.id, version=1 |
| VERSION_PUBLISHED | 狀態為 published 的版本 | status="published", pipeline_id=PIPELINE_ACTIVE.id, version=1 |
| VERSION_V1 | PIPELINE_MULTI 的第一個 published 版本 | status="published", version=1, pipeline_id=PIPELINE_MULTI.id |
| VERSION_V2 | PIPELINE_MULTI 的第二個 published 版本（最新）| status="published", version=2, pipeline_id=PIPELINE_MULTI.id |

### 版本狀態轉換矩陣

| 來源狀態 | 操作 | 預期結果 | 合法？ |
|---------|------|---------|--------|
| draft | PATCH publish | — | 非法 → 422 PIPELINE_PUBLISH_REQUIRES_TEST |
| testing | PATCH publish | published | 合法 |
| published | PATCH publish | — | 非法 → 422 PIPELINE_VERSION_ALREADY_PUBLISHED |

> **單向性**：版本狀態流程為單向 `draft → testing → published`，任何逆向操作均不被支援（BR-2）。

### 端到端狀態流（發布後啟用）

```
Pipeline.status 轉換：
  draft → (發布版本) → draft → (F031 toggle enabled=true) → active

EtlPipelineVersion.status 轉換：
  draft → (F030 測試執行成功) → testing → (F037 publish) → published
```

### DB 驗證查詢

```sql
-- 驗證版本發布後狀態與 published_at
SELECT id, pipeline_id, version, status, published_at, change_summary
FROM etl_pipeline_versions
WHERE id = '<version_id>';

-- 驗證 EtlPipeline.version 同步更新
SELECT id, status, version, updated_at
FROM etl_pipelines
WHERE id = '<pipeline_id>';

-- 驗證舊 published 版本未被修改（BR-6）
SELECT id, version, status
FROM etl_pipeline_versions
WHERE pipeline_id = '<pipeline_id>'
ORDER BY version ASC;

-- 驗證同一 Pipeline 多個 published 版本共存
SELECT COUNT(*) AS published_count
FROM etl_pipeline_versions
WHERE pipeline_id = '<pipeline_id>' AND status = 'published';
```

### API Request / Response 格式

**Request：**

```
PATCH /api/v1/etl/pipelines/:id/versions/:versionId/publish
Authorization: Bearer <admin_jwt>
（無 Request Body）
```

**Response 200 OK：**

```json
{
  "id": "uuid",
  "pipelineId": "uuid",
  "version": 3,
  "status": "published",
  "changeSummary": "string or null",
  "publishedAt": "2026-03-23T10:00:00.000Z"
}
```

---

## Risks and Notes

| 風險 / 注意事項 | 說明 |
|----------------|------|
| published_at 欄位存在性 | 規格 response 含 `publishedAt` 欄位，但現有 EtlPipelineVersion entity（`etl-pipeline-version.entity.ts`）僅有 `created_at`，無 `published_at` 欄位。實作需確認是否新增 `published_at` 欄位、或以 `created_at` 表示發布時間。若選擇新增欄位，需更新 entity、migration 與 DTO，測試場景 TS-F037-006 / TS-F037-007 需同步驗證此欄位。 |
| PIPELINE_VERSION_ALREADY_PUBLISHED 錯誤碼 | F033-test.md 及現有 error-codes 中未包含此錯誤碼。F037 新增此錯誤碼，需確認已加入 `error-codes.ts`（ERROR_CODES.PIPELINE_VERSION_ALREADY_PUBLISHED），測試場景 TS-F037-013 依賴此常數。 |
| Transaction 失敗的回滾驗證（TS-F037-020）| 測試 DB Transaction 失敗時兩個資料表均未被修改，需使用支援 Transaction 的 Test Container（真實 DB），不可以純 mock 驗證——mock 無法驗證 Transaction rollback 語意。 |
| 排程選版本邏輯（TS-F037-009）| 以 version 欄位最大值選取（非 created_at）已在 F030 TS-F030-010 與 F033 TS-F033-017 中有先例；F037 TS-F037-009 重新驗證此邏輯確保發布新版本後排程行為正確，測試需使用 `scanAndExecute(fakeNow)` injectable time 參數。 |
| 前端 Toast 3 秒計時器（TS-F037-032）| 需使用 fake timer（jest fake timers 或 vitest fake timers）控制時間推進，避免測試等待真實 3 秒，確保 CI 穩定性。 |
| 編輯器工具列整合測試 | TS-F037-034 ~ TS-F037-037 依賴 Pipeline 編輯器頁面的具體工具列實作。若編輯器工具列為獨立 Component，建議單獨渲染測試而非整頁渲染，以降低測試複雜度。 |
| Pipeline.version 的初始值 | 規格未明確說明 Pipeline 從未發布任何版本時 EtlPipeline.version 的初始值（null 或 0）。TS-F037-021 需向 Architecture 確認初始值，以撰寫正確的前置條件與驗證查詢。 |
