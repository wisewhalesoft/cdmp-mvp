---
type: test-design-feature
feature_id: F024
feature_name: 擷取監控儀表板
priority: P1
related_spec: /docs/specs/features/F024-extraction-dashboard.md
last_updated: 2026-03-18
---

# F024: 擷取監控儀表板 — 測試設計

---

## Acceptance Test Design

### AC-1：統計卡片

| 項目 | 內容 |
|------|------|
| Given | Admin 已登入，系統有多個擷取任務與今日執行紀錄 |
| When | 呼叫 `GET /api/v1/extraction-tasks/dashboard` |
| Then | HTTP 200，summary 含 totalTasks、running、todaySuccess、todayFailed、successRate |
| 驗證步驟 | 1. totalTasks 不含軟刪除任務<br>2. successRate = todaySuccess / (todaySuccess + todayFailed) * 100<br>3. 無今日執行紀錄時 successRate = 0.0<br>4. today 以 UTC+8 Asia/Taipei 時區計算 |

### AC-3：執行趨勢時間範圍切換

| 項目 | 內容 |
|------|------|
| Given | 系統有過去 30 天的 ExtractionLog |
| When | 呼叫 `GET /api/v1/extraction-tasks/dashboard/trend?range=7d`（或 14d / 30d） |
| Then | datapoints 陣列含對應天數的資料點，每點含 date、success、failed |
| 驗證步驟 | 1. range=7d → 最多 7 個 datapoints<br>2. range=14d → 最多 14 個 datapoints<br>3. range=30d → 最多 30 個 datapoints<br>4. 無資料的日期不出現（或出現 success=0, failed=0） |

### AC-5：今日失敗清單

| 項目 | 內容 |
|------|------|
| Given | 今日有失敗的執行紀錄 |
| When | 呼叫 GET /api/v1/extraction-tasks/dashboard |
| Then | todayFailures 含今日失敗清單，每筆含 taskId、taskName、failedAt、errorSummary、logId |

### AC-6：效能最差 Top 5

| 項目 | 內容 |
|------|------|
| Given | 有多個任務有執行紀錄（executionCount > 0） |
| When | 呼叫 GET /api/v1/extraction-tasks/dashboard |
| Then | slowestTasks 依 avgDurationMs DESC 排序，最多 5 筆 |

---

## Test Scenarios

### Positive Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F024-001 | 統計卡片數值正確 | AC-1, BR-2, BR-3 | Integration | 3 個任務（1 running），今日 4 成功 1 失敗（種子資料使用 `todayInTaipei()` 工廠函式產生，CI 設定 TZ=Asia/Taipei） | 1. GET /api/v1/extraction-tasks/dashboard | summary.running=1，todaySuccess=4，todayFailed=1，successRate=80.0 |
| TS-F024-002 | 趨勢圖預設 7 天 | AC-2, AC-3, BR-6 | Integration | 過去 10 天均有執行紀錄 | 1. GET /dashboard/trend?range=7d | datapoints 涵蓋最近 7 天 |
| TS-F024-003 | 趨勢圖切換 14 天 | AC-3 | Integration | 過去 20 天均有執行紀錄 | 1. GET /dashboard/trend?range=14d | datapoints 涵蓋最近 14 天 |
| TS-F024-004 | 趨勢圖切換 30 天 | AC-3 | Integration | 過去 35 天均有執行紀錄 | 1. GET /dashboard/trend?range=30d | datapoints 涵蓋最近 30 天 |
| TS-F024-005 | 今日失敗清單正確 | AC-5 | Integration | 今日有 2 筆 failed ExtractionLog | 1. GET /dashboard | todayFailures.length=2，每筆含 taskName、failedAt、errorSummary、logId |
| TS-F024-006 | 效能最差 Top 5 | AC-6, BR-4 | Integration | 6 個任務均有 executionCount > 0 | 1. GET /dashboard | slowestTasks.length=5，依 avgDurationMs DESC 排序 |
| TS-F024-007 | 執行中任務進度條 | AC-4 | Integration | 1 個任務 status=running，extractedCount=500，totalCount=1000 | 1. GET /dashboard | runningTasks[0].progressPercent=50.0，extractedCount=500 |

### Negative Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F024-008 | 非 Admin 無權存取 | BR-1 | Integration | USER_ACTIVE 已登入 | 1. 以 User Token 呼叫 GET /dashboard | HTTP 403，AUTH_FORBIDDEN |
| TS-F024-009 | range 參數無效（422 驗證） | 規格補充 | Integration | Admin 已登入 | 1. GET /dashboard/trend?range=60d | HTTP 422，VALIDATION_ERROR（range 僅接受 7d / 14d / 30d，使用 @IsIn(['7d','14d','30d']) 白名單驗證） |

### Boundary Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F024-010 | 無任何任務的空狀態 | AC-7 | Integration | 系統無擷取任務 | 1. GET /dashboard | summary.totalTasks=0，runningTasks=[]，todayFailures=[]，slowestTasks=[]，successRate=0.0 |
| TS-F024-011 | 軟刪除任務不納入統計 | BR-7 | Integration | 1 個未刪除任務 + 1 個已軟刪除任務（各有執行紀錄） | 1. GET /dashboard | summary.totalTasks=1（不含軟刪除） |
