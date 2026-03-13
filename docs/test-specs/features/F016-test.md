---
type: test-design-feature
feature_id: F016
feature_name: 狀態監控儀表板
priority: P1
related_spec: /specs/features/F016-datasource-status-dashboard.md
last_updated: 2026-03-12
---

# F016: 狀態監控儀表板 — 測試設計

---

## Acceptance Test Design

### AC-1：摘要統計卡片

| 項目 | 內容 |
|------|------|
| Given | Admin 已登入，系統有多個資料來源 |
| When | 呼叫 `GET /api/datasources/dashboard` |
| Then | HTTP 200，summary 含 total / connected / disconnected / unknown / typeCounts |
| 驗證步驟 | 1. total = connected + disconnected + unknown<br>2. typeCounts 各類型數量正確<br>3. 不含已軟刪除的資料來源 |

### AC-3：自動健康檢查排程

| 項目 | 內容 |
|------|------|
| Given | 系統中有未刪除的資料來源 |
| When | 排程觸發（每 30 分鐘） |
| Then | 所有未刪除資料來源的 status 與 lastTestedAt 已更新 |
| 驗證步驟 | 1. 觸發排程<br>2. 查詢每個資料來源的 lastTestedAt — 已更新<br>3. datasource_health_logs 新增對應記錄<br>4. 已軟刪除資料來源不受影響 |

### AC-4：效能趨勢圖

| 項目 | 內容 |
|------|------|
| Given | 資料來源有健康檢查歷史 |
| When | 呼叫 `GET /api/datasources/:id/metrics?range=24h` |
| Then | HTTP 200，datapoints 陣列含 timestamp / responseTimeMs / success |
| 驗證步驟 | 1. datapoints 按 timestamp 排序<br>2. 時間範圍在 24h 內<br>3. 失敗記錄 responseTimeMs = null |

### AC-6：異常警示清單

| 項目 | 內容 |
|------|------|
| Given | 某資料來源連續 >= 2 次健康檢查失敗 |
| When | 呼叫 `GET /api/datasources/alerts` |
| Then | 該資料來源出現在 alerts 陣列中 |
| 驗證步驟 | 1. consecutiveFailures >= 2<br>2. 按 consecutiveFailures 降序排列<br>3. 恢復連線後自動從清單移除 |

### AC-7：手動觸發測試

| 項目 | 內容 |
|------|------|
| Given | Admin 在儀表板 |
| When | 點選「Test Now」觸發單一資料來源測試 |
| Then | 呼叫 F015 的 `POST /api/datasources/:id/test`，結果更新於儀表板 |

---

## Test Scenarios

### Positive Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F016-001 | 摘要統計正確 | AC-1 | Integration | 3 connected + 1 disconnected + 1 unknown | 1. GET /api/datasources/dashboard | summary.total=5, connected=3, disconnected=1, unknown=1 |
| TS-F016-002 | 類型分佈正確 | AC-5 | Integration | 2 mysql + 2 pg + 1 mssql | 1. GET /api/datasources/dashboard | typeCounts: {mysql:2, postgresql:2, sqlserver:1} |
| TS-F016-003 | 效能趨勢圖 24h | AC-4 | Integration | 48 筆 health log（24h） | 1. GET /api/datasources/:id/metrics?range=24h | 48 個 datapoints |
| TS-F016-004 | 效能趨勢圖 7d | AC-4 | Integration | 7 天 health log | 1. GET /api/datasources/:id/metrics?range=7d | 資料點在 7d 範圍內 |

### Negative Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F016-005 | 警示觸發（連續 2 次失敗） | AC-6 | Integration | 連續 2 筆失敗 health log | 1. GET /api/datasources/alerts | alerts 含該資料來源，consecutiveFailures >= 2 |
| TS-F016-006 | 警示移除（恢復連線） | AC-6 | Integration | 之前在警示清單 | 1. 模擬連線成功<br>2. GET /api/datasources/alerts | 該資料來源不再出現於 alerts |
| TS-F016-007 | 非 Admin 存取儀表板 | BR-1 | Integration | USER_ACTIVE 已登入 | 1. 以 User Token 呼叫 GET /api/datasources/dashboard | HTTP 403，AUTH_FORBIDDEN |

### Boundary Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F016-008 | 排除軟刪除資料來源 | BR-6 | Integration | DS_DELETED 存在 | 1. GET /api/datasources/dashboard | summary 不含已刪除的資料來源 |
| TS-F016-009 | 自動健康檢查排程 | AC-3 | Integration | 2 個未刪除 + 1 個已刪除 | 1. 觸發排程<br>2. 檢查 health log | 僅 2 個未刪除資料來源新增紀錄 |
| TS-F016-010 | 無資料時的趨勢圖 | AC-4 | Integration | 無 health log | 1. GET /api/datasources/:id/metrics?range=24h | HTTP 200，datapoints: [] |
