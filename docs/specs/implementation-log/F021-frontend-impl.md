---
type: implementation-log
feature_id: F021
feature_name: 立即執行／重新執行擷取任務（前端）
status: complete
last_updated: 2026-03-18
---

# F021: 立即執行／重新執行擷取任務 — 前端實作日誌

## 測試結果摘要

| Scenario ID | 描述 | 狀態 |
|-------------|------|------|
| TS-F021-FE-001 | 點擊「立即執行」呼叫 runExtractionTask(id, 'manual') | PASS |
| TS-F021-FE-002 | 點擊「重新執行」呼叫 runExtractionTask(id, 'retry') | PASS |
| TS-F021-FE-003 | running 狀態任務按鈕 disabled | PASS |
| TS-F021-FE-004 | failed 狀態任務按鈕 title 為「重新執行」 | PASS |
| TS-F021-FE-005 | 執行成功顯示 Toast + 觸發 refresh | PASS |
| TS-F021-FE-006 | 409 衝突顯示「任務正在執行中，請等待完成」 | PASS |
| TS-F021-FE-007 | running 任務顯示進度條 | PASS |
| TS-F021-FE-008 | 非 running 任務不顯示進度條 | PASS |
| TS-F021-FE-009 | 進度條使用藍色 #3B82F6 | PASS |
| TS-F021-FE-010 | 有 running 任務時 3 秒 Polling | PASS |
| TS-F021-FE-011 | 無 running 任務時停止 Polling | PASS |
| TS-F021-FE-012 | Unmount 時清除 Polling interval | PASS |
| TS-F021-FE-013 | API 層 runExtractionTask 函式匯出 | PASS |

## 變更檔案

| 檔案路徑 | 變更類型 | 描述 |
|----------|---------|------|
| apps/web/src/api/extraction-tasks.ts | modified | 新增 `runExtractionTask(id, triggeredBy)` API 函式 |
| apps/web/src/pages/extraction-tasks/extraction-task-list-page.tsx | modified | 新增 handleRun、進度條、Polling 機制 |
| apps/web/src/pages/extraction-tasks/__tests__/run-extraction-task.test.tsx | new | F021 前端測試 (13 tests) |

## 架構決策

- Polling 使用 `useRef` + `useEffect` 管理 `setInterval`，依賴 `tasks` 陣列判斷是否有 running 狀態任務
- 進度條使用 inline style `backgroundColor: '#3B82F6'` 確保精確色值
- `triggeredBy` 依據任務 status 自動判斷：failed → 'retry'，其他 → 'manual'
- 409 錯誤透過 `response.status` 判斷而非 `response.data.error`，更為穩健
- 共用型別 `RunExtractionTaskResponse` 從 `@cdmp/shared` 引入

## 阻擋事項

無
