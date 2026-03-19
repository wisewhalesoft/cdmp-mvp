---
type: implementation-log
feature_id: F025
feature_name: 刪除擷取任務（後端）
status: complete
last_updated: 2026-03-19
---

# F025: 刪除擷取任務 — 後端實作日誌

## 測試結果摘要

| Scenario ID | 說明 | 狀態 |
|-------------|------|------|
| TS-F025-001 | 成功軟刪除任務 → 200, deleted_at IS NOT NULL | PASS |
| TS-F025-002 | 刪除後從清單移除 | PASS |
| TS-F025-003 | 日誌保留（ExtractionLog 不受影響） | PASS |
| TS-F025-004 | 刪除後名稱可重用（BR-6） | PASS |
| TS-F025-005 | 執行中任務不可刪除 → 409 EXTRACTION_RUNNING | PASS |
| TS-F025-006 | 非 Admin 無權刪除 → 403 AUTH_FORBIDDEN | PASS |
| TS-F025-007 | 已刪除任務再次刪除 → 404 EXTRACTION_NOT_FOUND | PASS |

共 261 個 E2E 測試通過（254 個既有 + 7 個新增 F025）。

## 變更檔案

| 檔案路徑 | 變更類型 | 說明 |
|-----------|----------|------|
| packages/shared/src/index.ts | modified | 新增 `DeleteExtractionTaskResponse` interface |
| apps/api/src/modules/extraction-task/extraction-task.service.ts | modified | 新增 `deleteTask(id)` 方法，執行軟刪除（設定 deleted_at） |
| apps/api/src/modules/extraction-task/extraction-task.controller.ts | modified | 新增 `@Delete(':id')` 路由，回傳 `{ message: "擷取任務已刪除" }` |
| apps/api/test/extraction-task.e2e-spec.ts | modified | 新增 F025 describe block 含 7 個測試案例 |

## 架構決策

- **軟刪除實作**：設定 `deleted_at = new Date()`，與既有的 F017 建立任務的軟刪除篩選（`deleted_at IS NULL`）一致
- **Error Message 差異處理**：EXTRACTION_RUNNING error code 共用於編輯（F019）和刪除（F025），但 message 不同（編輯: 「無法編輯」、刪除: 「無法刪除」）。在 service 方法中直接傳入自訂 message，不修改全域 ERROR_MESSAGES
- **日誌保留**：`findLogs` 方法原本就不篩選 `deleted_at`（BR-3 日誌永久保留），F025 軟刪除後日誌查詢自然仍可運作
- **名稱重用**：既有的名稱唯一性檢查已包含 `deleted_at IS NULL` 條件，軟刪除後名稱自動釋放（BR-6）

## 阻擋議題

無。
