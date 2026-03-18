---
type: implementation-log
feature_id: F020
feature_name: 啟用／停用擷取任務（後端）
status: complete
last_updated: 2026-03-18
---

# F020: 啟用／停用擷取任務 — 後端實作日誌

## 測試結果摘要

| Scenario ID | 說明 | 狀態 |
|-------------|------|------|
| TS-F020-001 | 停用啟用中任務 → 200, enabled=false, status=disabled | PASS |
| TS-F020-002 | 啟用停用中任務 → 200, enabled=true, status=scheduled | PASS |
| TS-F020-003 | 冪等停用（已停用再停用） | PASS |
| TS-F020-004 | 冪等啟用（已啟用再啟用） | PASS |
| TS-F020-005 | Running 任務不可停用 → 409 | PASS |
| TS-F020-006 | 非 Admin → 403 | PASS |
| TS-F020-007 | 不存在任務 → 404 | PASS |
| TS-F020-008 | 排程整合（skip，依賴 F023） | SKIP |

共 42 個 E2E 測試通過（33 個既有 F017/F018/F019 + 8 個新增 F020 + 1 skip）。

## 變更檔案

| 檔案路徑 | 變更類型 | 說明 |
|-----------|----------|------|
| apps/api/src/modules/extraction-task/dto/toggle-extraction-task.dto.ts | new | Toggle DTO，含 `@IsBoolean() enabled` |
| apps/api/src/modules/extraction-task/extraction-task.service.ts | modified | 新增 `toggleTask()` 方法 |
| apps/api/src/modules/extraction-task/extraction-task.controller.ts | modified | 新增 `PATCH :id/toggle` 路由（置於 `PATCH :id` 之前） |
| apps/api/test/extraction-task.e2e-spec.ts | modified | 新增 F020 describe block 含 8 個測試案例 |

## 架構決策

- Controller 路由順序：`@Patch(':id/toggle')` 置於 `@Patch(':id')` 之前，確保路由匹配正確
- 冪等設計：若 enabled 值已與目標一致，直接回傳不寫 DB
- 停用時 status 設為 `disabled`，啟用時 status 恢復為 `scheduled`
- Running 任務不可停用（409 EXTRACTION_RUNNING）
- Error format 保持 flat `{ error, message }` 格式

## 阻擋議題

無。
