---
type: test-design-feature
feature_id: F023
feature_name: 排程自動執行
priority: P0-MVP
related_spec: /docs/specs/features/F023-scheduled-extraction.md
last_updated: 2026-03-18
---

# F023: 排程自動執行 — 測試設計

---

## Acceptance Test Design

### AC-1：依排程自動執行

| 項目 | 內容 |
|------|------|
| Given | 系統中有 ET_SCHEDULED（enabled=true，schedule="0 2 * * *"） |
| When | 排程引擎掃描，fakeNow 符合 cron 觸發時間（UTC 02:00） |
| Then | 系統觸發執行，建立 ExtractionLog（triggered_by=schedule） |
| 驗證步驟 | 1. 直接呼叫 scanAndExecute(fakeNow)，其中 fakeNow = 2026-03-18T02:00:00Z<br>2. 新 ExtractionLog.triggeredBy = schedule<br>3. ExtractionLog.createdBy = ET_SCHEDULED.createdBy（任務建立者的 User ID，非系統帳號）<br>4. ExtractionTask.status 更新為 running |

### AC-2：跳過停用任務

| 項目 | 內容 |
|------|------|
| Given | ET_DISABLED（enabled=false，schedule="0 2 * * *"）存在 |
| When | 呼叫 scanAndExecute(fakeNow)，fakeNow 符合該 cron |
| Then | 不建立 ExtractionLog，ExtractionTask 狀態不變 |

### AC-3：跳過執行中任務

| 項目 | 內容 |
|------|------|
| Given | ET_RUNNING（status=running）存在 |
| When | 呼叫 scanAndExecute(fakeNow)，fakeNow 符合該 cron |
| Then | 不建立新 ExtractionLog，避免重複執行 |

### AC-5：排除軟刪除任務

| 項目 | 內容 |
|------|------|
| Given | ET_DELETED（deleted_at IS NOT NULL）存在 |
| When | 呼叫 scanAndExecute(fakeNow)，fakeNow 符合該 cron |
| Then | 不建立 ExtractionLog，排程引擎排除已刪除任務 |

---

## Test Scenarios

### Positive Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F023-001 | 排程觸發執行 | AC-1, BR-1, BR-3, BR-4 | Integration | ET_SCHEDULED(enabled=true, schedule="0 2 * * *") 存在 | 1. 呼叫 scanAndExecute(new Date("2026-03-18T02:00:00Z"))（injectable time 參數，不依賴真實計時器） | 建立 ExtractionLog(triggeredBy=schedule)，ExtractionTask.status=running |
| TS-F023-002 | 排程觸發 ExtractionLog.createdBy 為任務建立者 | AC-1, BR-4（補充規則） | Integration | ET_SCHEDULED 由 ADMIN_ACTIVE 建立 | 1. 呼叫 scanAndExecute(fakeNow)<br>2. 查詢新建 ExtractionLog | ExtractionLog.createdBy = ADMIN_ACTIVE.id（即 task.createdBy，非系統帳號） |
| TS-F023-003 | 多任務同時到達排程時間 | 邊界情況 | Integration | ET_A 與 ET_B 均設定 schedule="0 2 * * *" | 1. 呼叫 scanAndExecute(fakeNow=2026-03-18T02:00:00Z) | ET_A 與 ET_B 各自建立一筆 ExtractionLog，互不干擾 |

### Negative Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F023-004 | 跳過停用任務 | AC-2, BR-2 | Integration | ET_DISABLED(enabled=false, schedule="0 2 * * *") | 1. 呼叫 scanAndExecute(fakeNow=2026-03-18T02:00:00Z) | 無新 ExtractionLog 建立；ET_DISABLED.status 不變 |
| TS-F023-005 | 跳過執行中任務 | AC-3, BR-2, BR-5 | Integration | ET_RUNNING(status=running, schedule="0 2 * * *") | 1. 呼叫 scanAndExecute(fakeNow=2026-03-18T02:00:00Z) | 無新 ExtractionLog 建立（防止重複執行） |
| TS-F023-006 | 排除軟刪除任務 | AC-5, BR-2 | Integration | ET_DELETED(deleted_at IS NOT NULL, schedule="0 2 * * *") | 1. 呼叫 scanAndExecute(fakeNow=2026-03-18T02:00:00Z) | 無新 ExtractionLog 建立 |

### Boundary Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F023-007 | 排程掃描期間 DB 不可用（錯誤記錄） | 錯誤場景, NFR-002.8 | Unit | DB 連線 stub 為 throw Error | 1. 呼叫 scanAndExecute(fakeNow)<br>2. 以 jest.spyOn(Logger, 'error') 監聽 | Logger.error 被呼叫（記錄錯誤至系統日誌），不拋出未攔截例外 |
| TS-F023-008 | cron 表達式不符合觸發時間則跳過 | BR-7 | Integration | ET_SCHEDULED(schedule="0 2 * * *") 存在 | 1. 呼叫 scanAndExecute(new Date("2026-03-18T03:00:00Z"))（不符合 cron） | 無新 ExtractionLog 建立 |
