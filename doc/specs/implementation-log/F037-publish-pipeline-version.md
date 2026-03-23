# F037: 發布 Pipeline 版本 - Implementation Log

## Feature Summary

提供 Admin 將狀態為 `testing` 的 Pipeline 版本正式發布為 `published`，補全版本生命週期 `draft -> testing -> published` 的最後一步。發布後 Pipeline 可被啟用（F031）投入排程自動執行。

## Implementation Date

2026-03-23

## Architecture Decisions

### 1. publishVersion 放在 EtlPipelineService

發布是版本管理操作（非執行操作），與 `togglePipeline` 同層級，放在 `EtlPipelineService` 而非 `EtlPipelineExecutionService`。

### 2. Transaction 原子性

使用 `dataSource.transaction()` 確保 `version.status = 'published'` 和 `pipeline.version = N` 在同一 transaction 中更新，與 `create` 方法的 pattern 一致。

### 3. 新增 published_at 欄位

在 `EtlPipelineVersion` entity 新增 `published_at: Date | null` 欄位（type: `timestamp`, nullable），記錄發布時間。

### 4. 前端策略

- `PublishConfirmDialog` 元件放在 editor 目錄下（`editor/publish-confirm-dialog.tsx`），未來 F033 版本管理頁面可 import 共用
- 編輯器工具列根據 version status 顯示/隱藏發布按鈕
- 版本 Badge 顏色：draft=灰、testing=橘、published=綠
- git-branch 按鈕（列表頁連結版本管理頁面）留到 F033 實作

### 5. 狀態驗證邏輯

- `testing` → 允許發布
- `draft` → 422 `PIPELINE_PUBLISH_REQUIRES_TEST`
- `published` → 422 `PIPELINE_VERSION_ALREADY_PUBLISHED`
- 版本不存在或不屬於該 Pipeline → 404 `PIPELINE_VERSION_NOT_FOUND`

## API Endpoint

```
PATCH /etl/pipelines/:id/versions/:versionId/publish
Body: (empty)
Response: { id, pipelineId, version, status, changeSummary, publishedAt }
```

## Files Changed

### Backend

| File | Change |
|------|--------|
| `apps/api/src/database/entities/etl-pipeline-version.entity.ts` | 新增 `published_at` 欄位 |
| `apps/api/src/common/errors/error-codes.ts` | 新增 `PIPELINE_PUBLISH_REQUIRES_TEST`、`PIPELINE_VERSION_ALREADY_PUBLISHED`、`PIPELINE_VERSION_NOT_FOUND` |
| `apps/api/src/modules/etl/etl-pipeline.service.ts` | 新增 `publishVersion()` 方法 |
| `apps/api/src/modules/etl/etl-pipeline.controller.ts` | 新增 `PATCH :id/versions/:versionId/publish` |
| `apps/api/src/modules/etl/__tests__/etl-pipeline-publish.service.spec.ts` | 11 個 unit tests |

### Frontend

| File | Change |
|------|--------|
| `apps/web/src/api/etl-pipelines.ts` | 新增 `publishPipelineVersion()` API 函式 |
| `apps/web/src/pages/etl-pipelines/editor/publish-confirm-dialog.tsx` | 新增確認對話框元件 |
| `apps/web/src/pages/etl-pipelines/editor/pipeline-editor-page.tsx` | 工具列新增發布按鈕、版本 Badge 顏色 |
| `apps/web/src/pages/etl-pipelines/__tests__/pipeline-editor-page.test.tsx` | 前端測試（含發布流程） |

### Shared

| File | Change |
|------|--------|
| `packages/shared/src/index.ts` | 新增 `PublishVersionResponse` 型別 |

## Test Coverage

### Backend (11 tests) - `etl-pipeline-publish.service.spec.ts`

| ID | Scenario | Status |
|----|----------|--------|
| TS-F037-001 | 發布 testing 版本 → status=published | PASS |
| TS-F037-002 | Pipeline.version 更新為正確版本號 | PASS |
| TS-F037-003 | 同一 Transaction 中執行 | PASS |
| TS-F037-004 | 回傳正確 response 欄位 | PASS |
| TS-F037-005 | 舊 published 版本保留不被修改 | PASS |
| TS-F037-012 | draft 版本 → 422 PIPELINE_PUBLISH_REQUIRES_TEST | PASS |
| TS-F037-013 | published 版本 → 422 PIPELINE_VERSION_ALREADY_PUBLISHED | PASS |
| TS-F037-014 | Pipeline 不存在 → 404 | PASS |
| TS-F037-016 | 版本不存在 → 404 | PASS |
| TS-F037-017 | 版本不屬於該 Pipeline → 404 | PASS |
| TS-F037-020 | Transaction 失敗 → 500 | PASS |

### Frontend - `pipeline-editor-page.test.tsx`

- 工具列發布按鈕狀態（testing=可點擊、draft=disabled、published=隱藏）
- 確認對話框流程（開啟、確認、Loading）
- 發布成功後 Badge 即時更新

## Dependency Chain

```
F030（測試執行 → version.status = testing）
  → F037（發布 → version.status = published）  ← 本次實作
    → F031（啟用 → 檢查有 published version）
```

## Notes

- 版本管理頁面（F033）的 UI 相關測試場景（TS-F037-025~033）將在 F033 實作時一併覆蓋
- TS-F037-009（排程選版本邏輯）依賴排程引擎完整實作，已以 DB 狀態驗證替代
- TS-F037-018/019（403/401 權限測試）由既有 AuthGuard + RolesGuard 覆蓋
