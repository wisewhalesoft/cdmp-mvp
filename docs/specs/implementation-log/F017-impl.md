---
type: implementation-log
feature_id: F017
feature_name: 建立擷取任務
status: complete
last_updated: 2026-03-18
---

# F017: 建立擷取任務 — Implementation Log

## Test Results Summary

| Scenario ID | Description | Status |
|-------------|------------|--------|
| TS-F017-001 | 建立全量擷取任務 (full mode) → 201 | PASS |
| TS-F017-002 | 建立增量擷取任務 (incremental mode) → 201 | PASS |
| TS-F017-004 | 軟刪除後同名任務可重新建立 → 201 | PASS |
| TS-F017-005 | 名稱重複 → 409 EXTRACTION_NAME_EXISTS | PASS |
| TS-F017-006 | 非 Admin 無權建立 → 403 AUTH_FORBIDDEN | PASS |
| TS-F017-007 | 指定已刪除的資料來源 → 422 EXTRACTION_DATASOURCE_NOT_FOUND | PASS |
| TS-F017-007b | 資料來源不存在 → 422 EXTRACTION_DATASOURCE_NOT_FOUND | PASS |
| TS-F017-008 | 增量模式未填增量欄位 → 422 VALIDATION_ERROR | PASS |
| TS-F017-009a | 合法 cron 表達式 → 201 | PASS |
| TS-F017-009b | 非法 cron 表達式 → 422 EXTRACTION_INVALID_CRON | PASS |
| TS-F017-009c | 空排程 → 422 VALIDATION_ERROR | PASS |
| - | 必填欄位缺失 → 422 VALIDATION_ERROR | PASS |
| - | 未登入 → 401 | PASS |

**後端總計：13 E2E 測試全部通過**

### Frontend Tests

| Test Case | Description | Status |
|-----------|------------|--------|
| 1 | 頁面標題與 breadcrumb 渲染 | PASS |
| 2 | 所有必填欄位渲染 | PASS |
| 3 | 排程簡易模式 — 頻率選擇與子欄位顯示 | PASS |
| 4 | 排程簡易模式 — 自動產生 cron 表達式 | PASS |
| 5 | 排程進階模式切換 — Cron 直接輸入 | PASS |
| 6 | Cron 人類可讀預覽顯示 | PASS |
| 7 | 擷取模式 radio card 切換 | PASS |
| 8 | 增量模式 — 條件欄位顯示/隱藏 | PASS |
| 9 | 增量模式 — incrementalColumn 必填驗證 | PASS |
| 10 | 必填欄位空白提交驗證 | PASS |
| 11 | 提交成功 — API 呼叫 + Toast + 導航 | PASS |
| 12 | 提交失敗 — 錯誤訊息顯示 | PASS |
| 13 | 名稱重複 — 409 錯誤處理 | PASS |
| 14 | 提交中 loading spinner 狀態 | PASS |
| 15-25 | 其餘互動行為與邊界案例 | PASS |

**前端總計：25 個測試全部通過**

**全專案總計：292 個測試全部通過，無回歸**

## Files Changed

| File Path | Change Type | Description |
|-----------|------------|-------------|
| `apps/api/src/common/errors/error-codes.ts` | modified | 新增 F017 錯誤碼：EXTRACTION_NAME_EXISTS, EXTRACTION_DATASOURCE_NOT_FOUND, EXTRACTION_INVALID_CRON, EXTRACTION_INCREMENTAL_COLUMN_REQUIRED |
| `packages/shared/src/index.ts` | modified | 新增 ExtractionMode, ExtractionStatus 型別、CreateExtractionTaskRequest, ExtractionTaskResponse 介面、共用錯誤碼 |
| `apps/api/src/database/entities/extraction-task.entity.ts` | new | ExtractionTask Entity — 含所有 data-model 定義欄位，使用 dateColumnType 相容 SQLite/PostgreSQL |
| `apps/api/src/modules/extraction-task/dto/create-extraction-task.dto.ts` | new | CreateExtractionTaskDto — class-validator 驗證，含 @ValidateIf 處理增量模式條件必填 |
| `apps/api/src/modules/extraction-task/extraction-task.service.ts` | new | ExtractionTaskService.createTask() — cron 驗證、增量欄位檢查、datasource 存在性檢查、名稱唯一性檢查 |
| `apps/api/src/modules/extraction-task/extraction-task.controller.ts` | new | ExtractionTaskController — POST /extraction-tasks，含 AuthGuard + RolesGuard + @Roles('admin') |
| `apps/api/src/modules/extraction-task/extraction-task.module.ts` | new | ExtractionTaskModule — 註冊 Entity、Controller、Service |
| `apps/api/src/app.module.ts` | modified | 註冊 ExtractionTaskModule 與 ExtractionTask Entity |
| `apps/api/test/extraction-task.e2e-spec.ts` | new | F017 E2E 測試（13 個場景） |
| `apps/web/src/api/extraction-tasks.ts` | new | API 層 — createExtractionTask + getDatasourceOptions |
| `apps/web/src/pages/extraction-tasks/create-extraction-task-schema.ts` | new | Zod 驗證 schema — 含 cron 正規驗證 + 增量模式條件必填 refine |
| `apps/web/src/pages/extraction-tasks/add-extraction-task-page.tsx` | new | 新增擷取任務表單頁面 — 排程雙模切換、radio card、cron 預覽、增量欄位動畫 |
| `apps/web/src/pages/extraction-tasks/__tests__/add-extraction-task-page.test.tsx` | new | 前端測試（25 個案例） |
| `apps/web/src/App.tsx` | modified | 新增 /extraction-tasks/new 路由（AdminRoute 包裹） |

## Architectural Decisions

- **cron-parser v5**: 使用 `CronExpressionParser.parse()` API（非 v4 的 `parseExpression()`），搭配 `{ tz: 'UTC' }` 選項
- **驗證順序**: cron 格式 → 增量欄位檢查 → datasource 存在性 → 名稱唯一性。先做格式驗證避免不必要的 DB 查詢
- **progress_percent**: 使用 `float` 而非 `decimal`，SQLite 不支援 `DECIMAL(5,2)` 型別
- **Response 格式**: 使用 `toExtractionTaskResponse()` 函式將 snake_case Entity 欄位轉換為 camelCase 回應，包含 `datasourceName` 以便前端顯示
- **DTO 增量欄位驗證**: 使用 `@ValidateIf((o) => o.mode === 'incremental')` 讓 class-validator 在增量模式時自動要求 `incrementalColumn`
- **排程 UI 雙模切換**: 簡易模式（頻率/時間/星期/日期下拉選擇，自動產生 cron）↔ 進階模式（直接輸入 cron 表達式），沿用原型 `13-add-extraction-task.html` 邏輯
- **cronToReadable**: 自行實作人類可讀轉換函式（從原型移植），不依賴外部套件 `cronstrue`
- **前端表單**: react-hook-form + zodResolver，mode: 'onBlur'，與 AddDatasourcePage 慣例一致

## Blocking Issues

無
