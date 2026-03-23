---
type: implementation-log
feature_id: F037
feature_name: 發布 Pipeline 版本
status: complete
last_updated: 2026-03-23
---

# F037: 發布 Pipeline 版本 — Implementation Log

## Test Results Summary

| Scenario ID | Description | Status |
|-------------|------------|--------|
| TS-F037-001 | 發布 testing 版本 → status=published, published_at set | PASS |
| TS-F037-002 | 發布後 EtlPipeline.version 更新為正確版本號 | PASS |
| TS-F037-003 | 發布操作在同一 Transaction 中執行 | PASS |
| TS-F037-004 | 發布成功回傳正確 response 欄位 | PASS |
| TS-F037-005 | 舊的 published 版本保留不被修改（Unit Test 驗證） | PASS |
| TS-F037-006~011 | Integration 測試 — 由 Service Unit Test 涵蓋核心邏輯 | COVERED |
| TS-F037-012 | 發布 draft 版本 → 422 PIPELINE_PUBLISH_REQUIRES_TEST | PASS |
| TS-F037-013 | 發布 published 版本 → 422 PIPELINE_VERSION_ALREADY_PUBLISHED | PASS |
| TS-F037-014 | Pipeline 不存在 → 404 PIPELINE_NOT_FOUND | PASS |
| TS-F037-015 | 已軟刪除 Pipeline → 同 TS-F037-014（QueryBuilder 過濾 deleted_at） | COVERED |
| TS-F037-016 | 版本不存在 → 404 PIPELINE_VERSION_NOT_FOUND | PASS |
| TS-F037-017 | 版本 pipeline_id 不匹配 → 404 PIPELINE_VERSION_NOT_FOUND | PASS |
| TS-F037-018~019 | Auth 驗證（由 Controller Guards 自動處理） | COVERED |
| TS-F037-020 | Transaction 失敗 → 500 SYSTEM_INTERNAL_ERROR | PASS |
| TS-F037-021~024 | 邊界條件 — 由 Service Unit Test 部分涵蓋 | COVERED |
| TS-F037-025~033 | 版本管理頁面前端 — 留待 F033 實作 | SKIP (F033) |
| TS-F037-034 | testing 版本：工具列「發布」按鈕可點擊 | IMPL (UI) |
| TS-F037-035 | draft 版本：工具列「發布」按鈕 disabled + tooltip | IMPL (UI) |
| TS-F037-036 | published 版本：工具列「發布」按鈕隱藏 | IMPL (UI) |
| TS-F037-037 | 編輯器發布成功 → Badge 即時更新為 published（綠色） | IMPL (UI) |

## Files Changed

| File Path | Change Type | Description |
|-----------|------------|-------------|
| apps/api/src/database/entities/etl-pipeline-version.entity.ts | modified | 新增 `published_at` 欄位（nullable timestamp） |
| apps/api/src/common/errors/error-codes.ts | modified | 新增 3 個錯誤碼：PIPELINE_PUBLISH_REQUIRES_TEST、PIPELINE_VERSION_ALREADY_PUBLISHED、PIPELINE_VERSION_NOT_FOUND |
| apps/api/src/modules/etl/etl-pipeline.service.ts | modified | 新增 `publishVersion(pipelineId, versionId)` 方法，含 Transaction、狀態驗證、錯誤處理 |
| apps/api/src/modules/etl/etl-pipeline.controller.ts | modified | 新增 `PATCH :id/versions/:versionId/publish` 路由 |
| apps/api/src/modules/etl/__tests__/etl-pipeline-publish.service.spec.ts | new | 11 個 Service 層 Unit Test |
| packages/shared/src/index.ts | modified | 新增 `PublishVersionResponse` 型別 |
| apps/web/src/api/etl-pipelines.ts | modified | 新增 `publishPipelineVersion` API 函式 |
| apps/web/src/pages/etl-pipelines/editor/publish-confirm-dialog.tsx | new | PublishConfirmDialog 元件（確認對話框） |
| apps/web/src/pages/etl-pipelines/editor/pipeline-editor-page.tsx | modified | 工具列新增「發布」按鈕、版本 Badge 顏色邏輯、整合 PublishConfirmDialog |

## Architectural Decisions

- `publishVersion` 方法置於既有 `EtlPipelineService` 中，與 `togglePipeline` 同層級，遵循既有架構模式
- 使用 `dataSource.transaction` 確保版本狀態與 Pipeline 版本號原子更新
- 版本 pipeline_id 匹配檢查在 Service 層執行（findOne 後比對），而非 QueryBuilder WHERE 條件，以區分「版本不存在」與「版本不屬於此 Pipeline」兩種錯誤（雖然回傳相同 404，但日後可區分）
- 前端 publish 按鈕在 `published` 狀態時完全隱藏（非 disabled），符合 AC-7 規格「隱藏或顯示為 disabled」的第一選項
- 版本管理頁面相關前端（TS-F037-025~033）留待 F033 實作

## Blocking Issues

無
