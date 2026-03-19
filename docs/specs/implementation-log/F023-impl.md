---
type: implementation-log
feature_id: F023
feature_name: 排程自動執行
status: complete
last_updated: 2026-03-19
---

# F023: 排程自動執行 — 實作日誌

## 測試結果摘要

| Scenario ID | 說明 | 狀態 |
|-------------|------|------|
| TS-F023-001 | 排程觸發執行，triggeredBy='schedule' | PASS |
| TS-F023-002 | createdBy 為任務建立者 | PASS |
| TS-F023-003 | 多任務同時到達排程時間 | PASS |
| TS-F023-004 | 跳過停用任務 (enabled=false) | PASS |
| TS-F023-005 | 跳過執行中任務 (status='running') | PASS |
| TS-F023-006 | 查詢條件驗證（enabled, not deleted, not running） | PASS |
| TS-F023-007 | DB 不可用時記錄錯誤不拋例外 | PASS |
| TS-F023-008 | cron 不符合觸發時間則跳過 | PASS |
| TS-F023-009 | 單一任務觸發失敗不影響其他任務 | PASS |

共 9 個 unit test 全部通過，全套件 170 個測試無迴歸。

## 變更檔案

| 檔案路徑 | 變更類型 | 說明 |
|-----------|----------|------|
| apps/api/src/modules/scheduler/extraction-scheduler.service.ts | new | 排程掃描服務，每分鐘掃描符合條件的任務並觸發執行 |
| apps/api/src/modules/scheduler/scheduler.module.ts | modified | 匯入 ExtractionTaskModule、註冊 ExtractionSchedulerService |
| apps/api/src/modules/extraction-task/extraction-execution.service.ts | modified | `triggeredBy` 型別新增 `'schedule'` |
| apps/api/src/modules/scheduler/__tests__/extraction-scheduler.service.spec.ts | new | 9 個測試場景 |

## 技術決策

1. **cron-parser v5 API**: 使用 `CronExpressionParser.parse()` 取代 v4 的 `parseExpression()`，搭配 `tz: 'UTC'` 選項
2. **時間偏移**: `prev()` 在 `currentDate` 剛好等於 cron 觸發時間時會回傳前一次觸發，因此加 1 秒偏移確保正確比對
3. **Injectable time**: `scanAndExecute(now: Date)` 接受外部注入時間，測試不依賴真實時鐘
4. **錯誤隔離**: DB 查詢失敗與單一任務觸發失敗皆用 try-catch 包裹，記錄 Logger.error，不影響其他任務
