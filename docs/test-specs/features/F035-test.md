---
type: test-design-feature
feature_id: F035
feature_name: Pipeline 監控儀表板
priority: P1
related_spec: /docs/specs/features/F035-pipeline-dashboard.md
last_updated: 2026-03-20
---

# F035: Pipeline 監控儀表板 — 測試設計

---

## Acceptance Test Design

### AC-1：統計小卡正確性

| 項目 | 內容 |
|------|------|
| Given | Admin 已登入，系統中存在多筆 EtlPipelineLog 執行紀錄（含今日與昨日） |
| When | 呼叫 `GET /api/v1/etl/dashboard/stats` |
| Then | HTTP 200，回應含 totalPipelines、running、todaySuccess、todayFailed、successRate 五個欄位且數值正確 |
| 驗證步驟 | 1. totalPipelines = 系統中所有未軟刪除 EtlPipeline 的總數<br>2. running = status 為 `running` 的 Pipeline 數<br>3. todaySuccess / todayFailed 以 UTC+8（Asia/Taipei）計算今日範圍，且只計算非測試執行（`is_test_run = false`）<br>4. successRate = todaySuccess / (todaySuccess + todayFailed) * 100（無執行紀錄時為 0.0）<br>5. 種子資料使用 `todayInTaipei()` 工廠函式，CI 設定 `TZ=Asia/Taipei` |

### AC-2/AC-3：執行趨勢時間範圍

| 項目 | 內容 |
|------|------|
| Given | 系統中有過去 30 天的 EtlPipelineLog（`is_test_run = false`）執行紀錄 |
| When | 呼叫 `GET /api/v1/etl/dashboard/trend?range=7d`（或 14d / 30d） |
| Then | datapoints 陣列含對應天數的資料點，每點含 date、success、failed |
| 驗證步驟 | 1. range=7d → datapoints 涵蓋最近 7 天<br>2. range=14d → datapoints 涵蓋最近 14 天<br>3. range=30d → datapoints 涵蓋最近 30 天<br>4. 測試執行（`is_test_run = true`）不出現在任何資料點的計數中 |

### AC-4：執行中 Pipeline 進度條

| 項目 | 內容 |
|------|------|
| Given | 有 Pipeline 的 EtlPipelineLog 狀態為 `running` |
| When | 呼叫 `GET /api/v1/etl/dashboard/running` |
| Then | data 陣列中每筆含 id、name、processedCount、totalCount、progressPercent、startedAt |
| 驗證步驟 | 1. progressPercent = processedCount / totalCount * 100（totalCount > 0 時）<br>2. totalCount = 0 時 progressPercent = 0.0<br>3. 前端以 5 秒間隔 Polling 此端點（使用 fake timer 驗證） |

### AC-5：今日失敗清單

| 項目 | 內容 |
|------|------|
| Given | 今日（UTC+8）有 EtlPipelineLog status = `failed` 且 `is_test_run = false` 的執行紀錄 |
| When | 呼叫 `GET /api/v1/etl/dashboard/failures` |
| Then | data 陣列含今日失敗清單，每筆含 pipelineId、pipelineName、failedAt、errorSummary、logId |
| 驗證步驟 | 1. 每筆均為今日（UTC+8）失敗紀錄<br>2. 測試執行失敗不計入<br>3. logId 可用於導向 F032 日誌詳情 |

### AC-6：效能最差 Top 5

| 項目 | 內容 |
|------|------|
| Given | 有多個 EtlPipeline 各有多筆已完成的非測試執行紀錄 |
| When | 呼叫 `GET /api/v1/etl/dashboard/slowest` |
| Then | data 依 avgDurationMs DESC 排序，最多 5 筆，每筆含 pipelineId、pipelineName、avgDurationMs、executionCount |
| 驗證步驟 | 1. data.length <= 5<br>2. avgDurationMs 嚴格降序排列（data[0].avgDurationMs >= data[1].avgDurationMs ...）<br>3. 測試執行（`is_test_run = true`）不計入 avgDurationMs 與 executionCount 計算 |

---

## 測試資料定義

| 識別碼 | 資料說明 | 備註 |
|--------|---------|------|
| PL_ACTIVE | 未軟刪除、status=active 的 Pipeline | 用於 totalPipelines 計數 |
| PL_RUNNING | status=running 的 Pipeline | 用於 running 計數與進度條測試 |
| PL_DRAFT | status=draft 的 Pipeline | 用於 totalPipelines 計數 |
| PL_DELETED | deleted_at IS NOT NULL 的軟刪除 Pipeline | 不應計入任何統計 |
| LOG_TODAY_SUCCESS | 今日（UTC+8）completed，is_test_run=false 的 EtlPipelineLog | 用於 todaySuccess |
| LOG_TODAY_FAILED | 今日（UTC+8）failed，is_test_run=false 的 EtlPipelineLog | 用於 todayFailed |
| LOG_YESTERDAY | 昨日（UTC+8）的 EtlPipelineLog | 不應計入今日統計 |
| LOG_TEST_RUN | is_test_run=true 的 EtlPipelineLog | 不應計入任何統計或趨勢圖 |
| LOG_RUNNING | status=running，processedCount=500，totalCount=1000 的 EtlPipelineLog | 用於進度條測試 |
| LOG_RUNNING_ZERO | status=running，processedCount=0，totalCount=0 的 EtlPipelineLog | 用於 totalCount=0 邊界測試 |
| SLOWEST_LOGS | 6 個 Pipeline，各有不同 avgDurationMs（非測試執行） | 用於 Top 5 排序測試 |
| USER_ACTIVE | 非 Admin 的普通使用者帳號 | role=user，用於 RBAC 測試 |

> **時區說明**：所有含「今日（UTC+8）」的種子資料，其 started_at / finished_at 均透過 `todayInTaipei()` 工廠函式動態產生。CI 環境需設定 `TZ=Asia/Taipei`。

---

## Test Scenarios

### Positive Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F035-001 | 統計小卡五欄位數值正確 | AC-1, BR-2, BR-3 | Integration | PL_ACTIVE × 3、PL_RUNNING × 2、PL_DRAFT × 1；LOG_TODAY_SUCCESS × 8、LOG_TODAY_FAILED × 1（種子資料使用 `todayInTaipei()` 工廠函式，CI 設定 TZ=Asia/Taipei） | 1. `GET /api/v1/etl/dashboard/stats` | HTTP 200；totalPipelines=6、running=2、todaySuccess=8、todayFailed=1、successRate=88.9 |
| TS-F035-002 | 成功率計算公式驗證 | AC-1, BR-3 | Integration | LOG_TODAY_SUCCESS × 3、LOG_TODAY_FAILED × 1（today，is_test_run=false） | 1. `GET /api/v1/etl/dashboard/stats` | successRate = 75.0（3/(3+1)*100） |
| TS-F035-003 | 趨勢圖 7 天資料點數量正確 | AC-2, AC-3, BR-4 | Integration | 過去 10 天均有 is_test_run=false 的執行紀錄 | 1. `GET /api/v1/etl/dashboard/trend?range=7d` | HTTP 200；datapoints 涵蓋最近 7 天；每個資料點含 date（YYYY-MM-DD 格式）、success（整數）、failed（整數） |
| TS-F035-004 | 趨勢圖 14 天資料點數量正確 | AC-3 | Integration | 過去 20 天均有 is_test_run=false 的執行紀錄 | 1. `GET /api/v1/etl/dashboard/trend?range=14d` | HTTP 200；datapoints 涵蓋最近 14 天 |
| TS-F035-005 | 趨勢圖 30 天資料點數量正確 | AC-3 | Integration | 過去 35 天均有 is_test_run=false 的執行紀錄 | 1. `GET /api/v1/etl/dashboard/trend?range=30d` | HTTP 200；datapoints 涵蓋最近 30 天 |
| TS-F035-006 | 執行中 Pipeline 進度條資料正確 | AC-4, BR-6 | Integration | PL_RUNNING × 1（對應 LOG_RUNNING：processedCount=500，totalCount=1000） | 1. `GET /api/v1/etl/dashboard/running` | HTTP 200；data[0].progressPercent=50.0；data[0].processedCount=500；data[0].totalCount=1000；data[0].id、name、startedAt 均存在 |
| TS-F035-007 | 今日失敗清單欄位完整性 | AC-5 | Integration | LOG_TODAY_FAILED × 2（today，is_test_run=false，各有不同 pipelineName 與 errorSummary） | 1. `GET /api/v1/etl/dashboard/failures` | HTTP 200；data.length=2；每筆含 pipelineId、pipelineName、failedAt（ISO 8601）、errorSummary、logId |
| TS-F035-008 | 效能最差 Top 5（排序正確，超過 5 筆時取前 5） | AC-6, BR-5 | Integration | SLOWEST_LOGS（6 個 Pipeline，avgDurationMs 分別為 50000、40000、30000、20000、10000、5000 ms，各有 is_test_run=false 的執行紀錄） | 1. `GET /api/v1/etl/dashboard/slowest` | HTTP 200；data.length=5；data[0].avgDurationMs=50000，data[4].avgDurationMs=10000（嚴格降序，avgDurationMs=5000 的 Pipeline 不出現） |

### Negative Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F035-009 | User 角色無法存取統計小卡 | BR-1 | Integration | USER_ACTIVE 已登入 | 1. 以 User Token 呼叫 `GET /api/v1/etl/dashboard/stats` | HTTP 403；error.code = "AUTH_FORBIDDEN" |
| TS-F035-010 | User 角色無法存取趨勢圖 | BR-1 | Integration | USER_ACTIVE 已登入 | 1. 以 User Token 呼叫 `GET /api/v1/etl/dashboard/trend?range=7d` | HTTP 403；error.code = "AUTH_FORBIDDEN" |
| TS-F035-011 | range 參數非白名單值回傳 422 | BR-4（規格補充） | Integration | Admin 已登入 | 1. `GET /api/v1/etl/dashboard/trend?range=60d` | HTTP 422；error.code = "VALIDATION_ERROR"；range 僅接受 7d / 14d / 30d（@IsIn 白名單驗證） |
| TS-F035-012 | 儀表板 API 失敗時降級處理 | BR-7（錯誤場景） | Integration | stub DB 使 stats 查詢拋出例外 | 1. stub DB 讓 stats API 的查詢拋出例外<br>2. 以 Admin Token 呼叫 `GET /api/v1/etl/dashboard/stats` | HTTP 500；error.code = "SYSTEM_INTERNAL_ERROR"；回應 body 不含 stack trace 或內部實作細節 |

### Boundary Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F035-013 | 今日統計時區邊界（UTC+8） | AC-1, BR-2 | Integration | LOG_YESTERDAY：finished_at 為 UTC+8 前一日 23:59:59（即 UTC 前一日 15:59:59）；LOG_TODAY_SUCCESS × 1：finished_at 為 UTC+8 今日 00:00:01（即 UTC 前一日 16:00:01）。種子資料使用 `todayInTaipei()` 工廠函式，CI 設定 TZ=Asia/Taipei | 1. `GET /api/v1/etl/dashboard/stats` | todaySuccess=1（僅計入 UTC+8 今日範圍內的記錄）；昨日記錄 LOG_YESTERDAY 不計入 todaySuccess |
| TS-F035-014 | 測試執行不計入趨勢圖 | BR-4 | Integration | 今日有 LOG_TEST_RUN（is_test_run=true，status=completed）× 3；同日有 LOG_TODAY_SUCCESS（is_test_run=false）× 2 | 1. `GET /api/v1/etl/dashboard/trend?range=7d` | 今日對應資料點的 success=2（不含 3 筆測試執行） |
| TS-F035-015 | 測試執行不計入效能最差 Top 5 | BR-5 | Integration | PL_ACTIVE × 1，僅有 LOG_TEST_RUN（is_test_run=true）執行記錄，avgDurationMs 理論值極高；另有 5 個 Pipeline 各有 is_test_run=false 的執行紀錄 | 1. `GET /api/v1/etl/dashboard/slowest` | data 中不含僅有測試執行的 PL_ACTIVE；data.length=5（皆為正式執行 Pipeline） |
| TS-F035-016 | 執行中進度條 totalCount=0 時 progressPercent=0 | AC-4 | Integration | LOG_RUNNING_ZERO（processedCount=0，totalCount=0，status=running） | 1. `GET /api/v1/etl/dashboard/running` | data[0].progressPercent=0.0；不發生除以零錯誤 |
| TS-F035-017 | 今日無失敗紀錄時回傳空陣列 | AC-7 | Integration | 今日無 is_test_run=false 且 status=failed 的 EtlPipelineLog | 1. `GET /api/v1/etl/dashboard/failures` | HTTP 200；data=[] |
| TS-F035-018 | 無任何 Pipeline 或執行紀錄的空狀態 | AC-7 | Integration | DB 中無任何 EtlPipeline（或均已軟刪除），無任何 EtlPipelineLog | 1. `GET /api/v1/etl/dashboard/stats`<br>2. `GET /api/v1/etl/dashboard/running`<br>3. `GET /api/v1/etl/dashboard/failures`<br>4. `GET /api/v1/etl/dashboard/slowest` | 1. HTTP 200；totalPipelines=0、running=0、todaySuccess=0、todayFailed=0、successRate=0.0<br>2. HTTP 200；data=[]<br>3. HTTP 200；data=[]<br>4. HTTP 200；data=[] |
| TS-F035-019 | 軟刪除 Pipeline 不計入 totalPipelines | BR-1（資料完整性） | Integration | PL_ACTIVE × 2、PL_DELETED × 3（deleted_at IS NOT NULL） | 1. `GET /api/v1/etl/dashboard/stats` | totalPipelines=2（不含 3 筆軟刪除 Pipeline） |
| TS-F035-020 | 無任何執行紀錄時 successRate 為 0 | AC-1, BR-3 | Integration | 系統有 PL_ACTIVE，但無任何 EtlPipelineLog | 1. `GET /api/v1/etl/dashboard/stats` | successRate=0.0（分母為零時不發生除以零錯誤） |

### Frontend Polling Scenario（前端場景）

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F035-021 | Polling 5 秒更新執行中清單（fake timer） | AC-4, BR-6 | Frontend Unit | 使用 fake timer（sinon / jest fake timers）；stub `GET /api/v1/etl/dashboard/running` 第一次回傳 processedCount=200，第二次回傳 processedCount=600 | 1. 掛載儀表板元件<br>2. 觀察第一次 API 呼叫後，progressPercent 顯示 20.0%<br>3. 使用 fake timer 快轉 5 秒<br>4. 觀察第二次 API 呼叫後，progressPercent 更新為 60.0% | 進度條在 5 秒後（而非 4.9 秒或 5.1 秒後）自動觸發第二次 API 呼叫並更新數值；不依賴真實計時器 |

---

## 特殊驗證規則

### API 回應欄位型態驗證

#### `GET /api/v1/etl/dashboard/stats` 回應型態

| 欄位 | 型態 | 格式 | 可為空 |
|------|------|------|--------|
| totalPipelines | integer | >= 0 | 否 |
| running | integer | >= 0 | 否 |
| todaySuccess | integer | >= 0 | 否 |
| todayFailed | integer | >= 0 | 否 |
| successRate | number | 浮點數，0.0–100.0，小數點後一位 | 否 |

> successRate 精度：75.0（非 75）、88.9（非 88.888…），保留一位小數且四捨五入。

#### `GET /api/v1/etl/dashboard/running` 回應型態

| 欄位 | 型態 | 格式 | 可為空 |
|------|------|------|--------|
| id | string | UUID v4 | 否 |
| name | string | — | 否 |
| processedCount | integer | >= 0 | 否 |
| totalCount | integer | >= 0 | 否 |
| progressPercent | number | 浮點數，0.0–100.0 | 否 |
| startedAt | string | ISO 8601 | 否 |

#### `GET /api/v1/etl/dashboard/failures` 回應型態

| 欄位 | 型態 | 格式 | 可為空 |
|------|------|------|--------|
| pipelineId | string | UUID v4 | 否 |
| pipelineName | string | — | 否 |
| failedAt | string | ISO 8601 | 否 |
| errorSummary | string | — | 否 |
| logId | string | UUID v4 | 否 |

#### `GET /api/v1/etl/dashboard/slowest` 回應型態

| 欄位 | 型態 | 格式 | 可為空 |
|------|------|------|--------|
| pipelineId | string | UUID v4 | 否 |
| pipelineName | string | — | 否 |
| avgDurationMs | integer | >= 0 | 否 |
| executionCount | integer | >= 1 | 否 |

### 測試執行隔離規則（BR-4 / BR-5）

以下統計計算均必須排除 `is_test_run = true` 的 EtlPipelineLog：

| 統計項目 | 排除測試執行（is_test_run=true） |
|---------|--------------------------------|
| todaySuccess / todayFailed（stats API） | 是 |
| successRate 分子、分母 | 是 |
| 趨勢圖 success / failed 計數（trend API） | 是 |
| slowest Top 5 的 avgDurationMs / executionCount 計算 | 是 |
| running 進度條清單（running API） | 不適用（執行中狀態本身即實際執行） |
| 今日失敗清單（failures API） | 是 |

---

## 測試環境注意事項

| 事項 | 說明 |
|------|------|
| 時區設定 | CI 環境需設定 `TZ=Asia/Taipei`；今日統計邊界測試才能穩定 |
| 種子資料時間 | today / yesterday 邊界種子資料使用 `todayInTaipei()` 工廠函式，不可硬編碼時間戳記 |
| 伺服器錯誤模擬 | 使用 stub / mock 讓 DB 查詢拋出例外，驗證 API 不洩漏 stack trace（TS-F035-012） |
| Polling 測試 | 使用 fake timer（sinon / jest fake timers）控制 5 秒間隔，不依賴真實計時器（TS-F035-021） |
| 測試執行隔離 | 所有趨勢圖、統計小卡、Top 5 的測試資料集必須同時含 is_test_run=true 與 is_test_run=false 的記錄，確保隔離邏輯被實際驗證 |
| 效能測試 | 依規格 BR-7，儀表板需在 2 秒內完成載入（50 個 Pipeline 基準）；此為 NFR 測試，建議在 QA 環境使用 k6 / JMeter 執行，不納入 CI Pipeline |
