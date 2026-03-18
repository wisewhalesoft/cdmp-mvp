---
type: implementation-log
feature_id: F019
feature_name: 編輯擷取任務（後端）
status: complete
last_updated: 2026-03-18
---

# F019: 編輯擷取任務 — 後端實作日誌

## 測試結果摘要

| Scenario ID | 說明 | 狀態 |
|-------------|------|------|
| TS-F019-001 | 成功編輯任務名稱 | PASS |
| TS-F019-002 | 成功修改排程 cron | PASS |
| TS-F019-003 | 全量切換至增量模式 | PASS |
| TS-F019-004 | 名稱唯一性排除自身 | PASS |
| TS-F019-005 | 執行中任務無法編輯 | PASS |
| TS-F019-006 | 名稱重複（與其他任務） | PASS |
| TS-F019-007 | 非 Admin 無權編輯 | PASS |
| TS-F019-008 | 任務不存在 | PASS |
| TS-F019-009 | 增量切換至全量（incrementalColumn 保留） | PASS |
| AC-3 | GET /:id 回傳完整任務詳情 | PASS |
| AC-3-404 | GET /:id 任務不存在回傳 404 | PASS |

共 33 個 E2E 測試通過（22 個既有 F017/F018 + 11 個新增 F019）。

## 變更檔案

| 檔案路徑 | 變更類型 | 說明 |
|-----------|----------|------|
| apps/api/src/common/errors/error-codes.ts | modified | 新增 EXTRACTION_NOT_FOUND、EXTRACTION_RUNNING 錯誤碼與訊息 |
| apps/api/src/modules/extraction-task/dto/update-extraction-task.dto.ts | new | PATCH DTO，所有欄位 @IsOptional() |
| apps/api/src/modules/extraction-task/extraction-task.service.ts | modified | 新增 findById() 與 updateTask() 方法 |
| apps/api/src/modules/extraction-task/extraction-task.controller.ts | modified | 新增 GET :id 與 PATCH :id 路由 |
| apps/api/test/extraction-task.e2e-spec.ts | modified | 新增 F019 describe block 含 11 個測試案例 |

## 架構決策

- Controller 路由順序：`@Get()` (findAll) 在 `@Get(':id')` (findById) 之前，避免路徑衝突
- PATCH 語義：DTO 所有欄位皆為 `@IsOptional()`，Service 層僅更新 `!== undefined` 的欄位
- 增量→全量切換時 `incrementalColumn` 保留不清除（符合 TS-F019-009 邊界條件）
- 名稱唯一性排除自身：`WHERE LOWER(name) = LOWER(:name) AND id != :id AND deleted_at IS NULL`
- Error format 保持 flat `{ error, message }` 格式

## 阻擋議題

無。
