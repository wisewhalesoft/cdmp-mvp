---
type: implementation-log
feature_id: F014
feature_name: 刪除資料來源
status: complete
last_updated: 2026-03-17
---

# F014: 刪除資料來源 — Implementation Log

## Test Results Summary

| Scenario ID | Description | Status |
|-------------|------------|--------|
| TS-F014-001 | 成功軟刪除 → HTTP 200，DB 中 deleted_at 已設定 | PASS |
| TS-F014-002 | 刪除後從清單消失（GET /api/datasources 不含已刪除記錄） | PASS |
| TS-F014-003 | 刪除不存在的資料來源 → HTTP 404, DS_NOT_FOUND | PASS |
| TS-F014-004 | 重複刪除已軟刪除記錄 → HTTP 404, DS_NOT_FOUND | PASS |
| TS-F014-005 | 刪除後同名資料來源可重新建立 → HTTP 201 | PASS |

### 測試數量統計

- Backend Unit Tests: 95 passed（含 3 個新增 F014 service 單元測試）
- Backend E2E Tests: 120 passed（含 6 個新增 F014 E2E 測試）
- Frontend Tests: 228 passed（含 8 個新增刪除功能測試）
- 全套回歸測試：443 tests 全數通過

## Files Changed

### 後端（API）

| File Path | Change Type | Description |
|-----------|------------|-------------|
| `apps/api/src/modules/datasource/datasource.service.ts` | modified | 新增 `deleteDatasource()` 方法（軟刪除：設定 `deleted_at = new Date()`） |
| `apps/api/src/modules/datasource/datasource.controller.ts` | modified | 新增 `DELETE :id` 路由 |
| `apps/api/src/database/entities/datasource.entity.ts` | modified | 移除 `name` 欄位的 `unique: true` 約束（改由應用層搭配 `deleted_at IS NULL` 檢查唯一性） |
| `apps/api/src/modules/datasource/datasource.service.spec.ts` | modified | 新增 3 個 F014 deleteDatasource 單元測試 |
| `apps/api/test/datasource.e2e-spec.ts` | modified | 新增 F014 describe block，6 個 E2E 測試場景 |

### 前端（Web）

| File Path | Change Type | Description |
|-----------|------------|-------------|
| `packages/shared/src/index.ts` | modified | 新增 `DeleteDatasourceResponse` 型別 |
| `apps/web/src/api/datasources.ts` | modified | 新增 `deleteDatasource(id)` API 函式 |
| `apps/web/src/pages/datasources/datasource-list-page.tsx` | modified | 啟用刪除按鈕（list + card view）、新增確認對話框、刪除成功後從 state 移除記錄 |
| `apps/web/src/pages/datasources/__tests__/datasource-list-page.test.tsx` | modified | 新增 8 個刪除功能前端測試 |

## Architectural Decisions

1. **移除 DB-level unique constraint**：`name` 欄位原有 `unique: true`，但軟刪除後記錄仍存在 DB，會阻擋同名資料來源重建（TS-F014-005）。改由應用層 `WHERE deleted_at IS NULL` 搭配 `LOWER(name)` 做唯一性檢查，與 `createDatasource`/`updateDatasource` 一致
2. **樂觀更新**：刪除成功後直接從前端 state 移除記錄，無需重新 fetch 清單（spec: 「清單自動更新，無需重新載入頁面」）
3. **Modal 設計對齊 Prototype**：保留 `08-datasource-list.html` 的紅色圓形 + `AlertTriangle` icon 設計，標題用 spec 的「刪除資料來源」，按鈕用 spec 的「確認刪除」
4. **錯誤處理**：API 失敗時 modal 保持開啟、顯示錯誤訊息，讓使用者可重試
5. **刪除中 loading 狀態**：確認按鈕顯示「刪除中...」+ disabled，防止重複提交

## Deferred Items

- **Audit Log（BR-6）**：spec 要求刪除操作記錄至 audit log，但目前架構中無 audit_log entity。與 F013 一致，待後續迭代實作
- **Toast 通知**：目前刪除成功後透過樂觀更新即時從清單移除，未顯示 success toast（DatasourceListPage 未包在 ToastProvider 中）。可在後續整合 Toast 時補上
