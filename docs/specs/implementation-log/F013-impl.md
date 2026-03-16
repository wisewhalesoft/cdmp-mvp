---
type: implementation-log
feature_id: F013
feature_name: 編輯資料來源
status: complete
last_updated: 2026-03-16
---

# F013: 編輯資料來源 — Implementation Log

## Test Results Summary

| Scenario ID | Description | Status |
|-------------|------------|--------|
| TS-F013-001 | 成功修改連線參數（host/port），status 重置為 unknown | PASS |
| TS-F013-002 | 密碼為空/null 保留現有密碼（DB 中 encrypted_password 不變） | PASS |
| TS-F013-003 | 更新密碼（DB 中 encrypted_password 為新加密值） | PASS |
| TS-F013-004 | 名稱保留原值不觸發重複（自身排除） | PASS |
| TS-F013-005 | 名稱與其他資料來源重複 → HTTP 409, DS_NAME_EXISTS | PASS |
| TS-F013-006 | 資料來源不存在或已軟刪除 → HTTP 404, DS_NOT_FOUND | PASS |
| TS-F013-007 | 非 Admin 編輯 → HTTP 403, AUTH_FORBIDDEN | PASS |
| TS-F013-008 | Port 邊界值（0→422, 1→200, 65535→200, 65536→422） | PASS |

### 測試數量統計

- Backend Unit Tests: 92 passed（含 7 個新增 F013 service 單元測試）
- Backend E2E Tests: 114 passed（含 17 個新增 F013 E2E 測試）
- Frontend Tests: 220 passed（含 14 個新增 edit-datasource-page 測試）
- 全套回歸測試：426 tests 全數通過

## Files Changed

### 後端（API）

| File Path | Change Type | Description |
|-----------|------------|-------------|
| `apps/api/src/modules/datasource/dto/update-datasource.dto.ts` | new | 更新資料來源 DTO — 密碼為 `@IsOptional()` |
| `apps/api/src/modules/datasource/datasource.service.ts` | modified | 新增 `findById()`、`updateDatasource()` 方法；抽取 `toDatasourceResponse()` 共用映射函式 |
| `apps/api/src/modules/datasource/datasource.controller.ts` | modified | 新增 `GET :id`、`PUT :id` 路由 |
| `apps/api/src/modules/datasource/datasource.service.spec.ts` | modified | 新增 7 個 F013 單元測試（findById 2 + updateDatasource 5） |
| `apps/api/test/datasource.e2e-spec.ts` | modified | 新增 F013 describe block，17 個 E2E 測試場景 |

### 前端（Web）

| File Path | Change Type | Description |
|-----------|------------|-------------|
| `packages/shared/src/index.ts` | modified | 新增 `UpdateDatasourceRequest`、`DatasourceDetailResponse` 型別 |
| `apps/web/src/api/datasources.ts` | modified | 新增 `getDatasource(id)`、`updateDatasource(id, data)` API 函式 |
| `apps/web/src/pages/datasources/edit-datasource-schema.ts` | new | Zod schema — 密碼為 optional |
| `apps/web/src/pages/datasources/edit-datasource-page.tsx` | new | 編輯頁面（預填表單、密碼空白 placeholder、測試連線 disabled、loading 狀態） |
| `apps/web/src/pages/datasources/__tests__/edit-datasource-page.test.tsx` | new | 14 個前端單元測試 |
| `apps/web/src/pages/datasources/datasource-list-page.tsx` | modified | 啟用「編輯」按鈕，導航至 `/datasources/:id/edit` |
| `apps/web/src/App.tsx` | modified | 新增 `/datasources/:id/edit` 路由 |

## Architectural Decisions

1. **`toDatasourceResponse()` 共用映射函式**：抽取自 `createDatasource` 和 `findAll` 中重複的 Entity → DTO 映射邏輯，`findById` 和 `updateDatasource` 也共用此函式，確保回應格式一致
2. **密碼保留邏輯**：以 `if (dto.password)` 判斷，空字串和 null 都視為「保留原密碼」，與 spec BR-2 定義一致
3. **名稱唯一性排除自身**：使用 `ds.id != :selfId` 條件，允許保留原名稱（BR-5）
4. **Status 重置**：編輯後一律設為 `'unknown'`（BR-4），不論修改哪些欄位
5. **Route ordering**：Controller 中 `@Get()` (findAll) 定義在 `@Get(':id')` (findById) 之前，避免路徑衝突
6. **測試連線按鈕**：前端 disabled placeholder，待 F015 實作後啟用
7. **Port 自動填入**：編輯頁面使用 `initialTypeRef` 追蹤初始類型，僅在類型變更時自動填入預設 port，避免覆寫 API 回傳的非預設 port 值
8. **DatasourceDetailResponse**：透過 `type` alias 復用 `CreateDatasourceResponse`，減少重複型別定義

## Deferred Items

- **Audit Log（BR-6）**：spec 要求變更記錄至 audit log，但目前架構中無 audit_log entity，test-design 也未列入相關測試場景。待後續迭代實作
- **Optimistic Locking**：spec error scenario 提到並行編輯衝突（HTTP 409），但 test-design 未列入測試場景。目前未實作 version column 或 updatedAt 比對機制
- **測試連線功能**：編輯頁面的「測試連線」按鈕目前為 disabled，待 F015 實作 `POST /api/v1/datasources/:id/test` 後啟用
