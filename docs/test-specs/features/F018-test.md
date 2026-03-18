---
type: test-design-feature
feature_id: F018
feature_name: 查看擷取任務清單
priority: P0-MVP
related_spec: /docs/specs/features/F018-view-extraction-task-list.md
last_updated: 2026-03-18
---

# F018: 查看擷取任務清單 — 測試設計

---

## Acceptance Test Design

### AC-1：任務清單顯示

| 項目 | 內容 |
|------|------|
| Given | Admin 已登入，系統有多個擷取任務 |
| When | 呼叫 `GET /api/v1/extraction-tasks` |
| Then | HTTP 200，data 陣列含各任務欄位，meta 含分頁資訊，summary 含統計 |
| 驗證步驟 | 1. 每筆含 id, name, datasourceName, mode, status, schedule, lastExecutionAt, extractedCount<br>2. 軟刪除任務不出現<br>3. 預設排序 updated_at DESC<br>4. 預設 limit=10 |

### AC-2：頂部統計摘要

| 項目 | 內容 |
|------|------|
| Given | Admin 已登入 |
| When | 呼叫 `GET /api/v1/extraction-tasks` |
| Then | summary 含 totalTasks、running、todaySuccess、todayFailed、successRate |
| 驗證步驟 | 1. successRate = todaySuccess / (todaySuccess + todayFailed) * 100<br>2. 無今日執行時 successRate = 0.0<br>3. today 以 UTC+8 Asia/Taipei 時區計算 |

### AC-3：搜尋功能

| 項目 | 內容 |
|------|------|
| Given | Admin 已登入，有多個擷取任務 |
| When | 呼叫 `GET /api/v1/extraction-tasks?search=客戶` |
| Then | 僅回傳名稱含「客戶」的任務，meta.total 反映篩選後數量 |

### AC-4：篩選功能

| 項目 | 內容 |
|------|------|
| Given | Admin 已登入 |
| When | 呼叫 `GET /api/v1/extraction-tasks?status=failed&mode=full` |
| Then | 僅回傳 status=failed 且 mode=full 的任務（AND 邏輯） |

---

## Test Scenarios

### Positive Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F018-001 | 清單基本查詢 | AC-1, BR-3 | Integration | ET_SCHEDULED, ET_COMPLETED, ET_FAILED 存在 | 1. GET /api/v1/extraction-tasks | HTTP 200，data 陣列含 3 筆，排序 updated_at DESC |
| TS-F018-002 | 統計摘要正確性 | AC-2, BR-4, BR-5 | Integration | 今日有 3 次成功、1 次失敗 | 1. GET /api/v1/extraction-tasks | summary.todaySuccess=3，todayFailed=1，successRate=75.0 |
| TS-F018-003 | 依名稱搜尋 | AC-3 | Integration | 有「每日客戶同步」和「每週庫存同步」兩個任務 | 1. GET /api/v1/extraction-tasks?search=客戶 | 僅回傳「每日客戶同步」 |
| TS-F018-004 | 依狀態篩選 | AC-4 | Integration | 有 scheduled, failed, completed 狀態的任務 | 1. GET /api/v1/extraction-tasks?status=failed | 僅回傳 status=failed 的任務 |
| TS-F018-005 | 多條件 AND 篩選 | AC-4 | Integration | 有多種 mode 與 status 組合的任務 | 1. GET /api/v1/extraction-tasks?status=failed&mode=incremental | 僅回傳 failed+incremental 組合的任務 |

### Negative Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F018-006 | 非 Admin 無權查看 | BR-1 | Integration | USER_ACTIVE 已登入 | 1. 以 User Token 呼叫 GET /api/v1/extraction-tasks | HTTP 403，AUTH_FORBIDDEN |
| TS-F018-007 | 軟刪除任務不出現 | BR-2 | Integration | ET_DELETED（deleted_at IS NOT NULL）存在 | 1. GET /api/v1/extraction-tasks | data 陣列不含 ET_DELETED |

### Boundary Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F018-008 | 空狀態（無任務） | AC-5 | Integration | 系統無任何擷取任務 | 1. GET /api/v1/extraction-tasks | HTTP 200，data=[]，meta.total=0，summary.totalTasks=0 |
| TS-F018-009 | 今日統計時區正確（NFR-002.6） | BR-4 | Integration | 在 UTC+8 00:00 前後各有一筆執行紀錄（種子資料使用 `todayInTaipei()` 工廠函式產生，CI 環境設定 `TZ=Asia/Taipei`） | 1. GET /api/v1/extraction-tasks | todaySuccess / todayFailed 僅計入 UTC+8 今日範圍內的紀錄 |
