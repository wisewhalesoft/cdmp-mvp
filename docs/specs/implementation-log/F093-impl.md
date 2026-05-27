---
type: implementation-log
feature_id: F093
feature_name: 編輯 Pipeline 中繼資料（名稱 / 排程 / 描述）
status: complete
last_updated: 2026-05-27
---

# F093: 編輯 Pipeline 中繼資料 — Implementation Log

## 摘要

於 Pipeline 管理列表頁每列操作欄加入「⚙️ 設定」按鈕（lucide `settings`，`title="設定"`），點擊開啟「編輯 Pipeline」Modal，可修改名稱（必填）、描述、排程（cron builder）。儲存呼叫 `PATCH /api/v1/etl/pipelines/:id`，不觸碰 Pipeline 定義（nodes/edges/versions）。

## Resolved Decisions 落地

| 決策 | 落地方式 |
|------|---------|
| **OD-F093-01 = BLOCK** | service `updatePipeline` 在 `status==='running'` 時拋 409 `PIPELINE_RUNNING`（複用既有錯誤碼，無需新增）。前端 running 列的 gear 按鈕為 `disabled`（DOM 層阻擋）。 |
| **OD-F093-02 = 不重算 next_execution_at** | 已確認 `pipeline-scheduler.service.ts` 以 on-the-fly `shouldTrigger()` 觸發，從不讀寫 `next_execution_at`。service 更新排程時刻意不碰此欄位。原 F093-test 之 SVC-019（選項 A：重算）已改寫為「斷言 `next_execution_at` 不變」。 |
| **OD-F093-03 = 允許改為自身當前名稱** | 名稱唯一性查詢加 `AND p.id != :selfId` 排除自身（`ensureNameUniqueOrThrow(name, excludeId)`）。SVC-010 明確驗證此 self-exclusion 條件。 |

> 註：原 prompt 將 service 方法命名為 `updatePipeline`（覆寫 F093-test 之 `updateMetadata`）。

## Test Results Summary

### Service 單元測試（`etl-pipeline-update.service.spec.ts`，18 passed）
| Scenario | 說明 | 結果 |
|----------|------|------|
| SVC-001~006 | 名稱 / 排程（5、6 欄位）/ 清除（null、空字串）/ 三欄位同時更新 | PASS |
| SVC-007 / 008 | 不存在 / 軟刪除 → 404 | PASS |
| SVC-009 | 與他人名稱衝突 → 409 | PASS |
| SVC-010 | 改為自身名稱 → 允許（驗證 self-exclusion SQL）| PASS |
| SVC-011~013 | cron 4 欄位 / 7 欄位 / 超範圍 → 422 | PASS |
| SVC-014 | 純空白名稱 → 422 | PASS |
| SVC-017 | 255 字元名稱 → 允許 | PASS |
| SVC-018 | running → 409 PIPELINE_RUNNING | PASS |
| SVC-019 / 020 | 更新 / 清除排程「不」觸碰 next_execution_at | PASS（OD-F093-02 改寫後）|

### E2E（`etl-pipeline.e2e-spec.ts`，F093 區塊 13 passed）
| Scenario | 說明 | 結果 |
|----------|------|------|
| E2E-001 / 001b | PATCH `:id` 端點存在；不 shadow `:id/toggle` | PASS |
| E2E-002 / 003 | 401 無 token / 403 非 admin | PASS |
| E2E-004 / 004b / 004c | DB 持久化 + 版本定義不變 / next_execution_at 不變 / 改為自身名稱 | PASS |
| E2E-005 / 006 / 007 | 名稱衝突 409 / 無效 cron 422 / 不存在 404 | PASS |
| E2E-008 | running → 409 PIPELINE_RUNNING | PASS |
| E2E-009 / 010 | 空名稱 422 / 256 字元 422（DTO 層）| PASS |

### 前端（Vitest / RTL）
- `edit-pipeline-modal.test.tsx`：21 passed（FE-003~020 + 補充：open=false、unknown cron→manual、PIPELINE_RUNNING 映射）
- `pipeline-list-page.test.tsx`：+4 新增（FE-001 gear 順序、FE-002 running disabled、FE-022 不開 Modal、FE-003 點擊開啟預填），共 19 passed

### 命令
- 後端單元：`cd apps/api && npx vitest run src/modules/etl/__tests__/etl-pipeline-update.service.spec.ts`
- 後端 E2E：`cd apps/api && npx vitest run --config vitest.e2e.config.ts test/etl-pipeline.e2e-spec.ts`（92 passed，含 F093 13 筆）
- 前端：`cd apps/web && npx vitest run src/pages/etl-pipelines/__tests__/edit-pipeline-modal.test.tsx src/pages/etl-pipelines/__tests__/pipeline-list-page.test.tsx`

## Files Changed

| File | Change | 說明 |
|------|--------|------|
| `apps/api/src/modules/etl/dto/update-pipeline.dto.ts` | new | `UpdatePipelineDto`：name/description/schedule 全 `@IsOptional`；name 有傳入時 `@IsNotEmpty` + `@MaxLength(255)` |
| `apps/api/src/modules/etl/etl-pipeline.service.ts` | modified | 新增 `updatePipeline()`；抽出 `validateCronOrThrow()` + `ensureNameUniqueOrThrow(name, excludeId?)` 共用 helper（`create()` 改用、行為不變）；`findAll` 回傳加 `description` |
| `apps/api/src/modules/etl/etl-pipeline.controller.ts` | modified | 新增 `@Patch(':id')` → `updatePipeline` |
| `apps/api/test/etl-pipeline.e2e-spec.ts` | modified | 追加 `F093: Edit Pipeline Metadata E2E` describe 區塊 |
| `apps/api/src/modules/etl/__tests__/etl-pipeline-update.service.spec.ts` | new | 18 service 單元測試 |
| `packages/shared/src/index.ts` | modified | `PipelineListItem` 加 `description`；新增 `UpdatePipelineRequest` / `UpdatePipelineResponse` |
| `apps/web/src/api/etl-pipelines.ts` | modified | 新增 `updatePipeline(id, payload)` → `PATCH /etl/pipelines/:id` |
| `apps/web/src/pages/etl-pipelines/edit-pipeline-modal.tsx` | new | EditPipelineModal（鏡像 create modal + cron 反向解析 + 錯誤映射）|
| `apps/web/src/pages/etl-pipelines/pipeline-list-page.tsx` | modified | gear 按鈕（pencil 之後、play 之前；running disabled）+ EditPipelineModal 接線 + 成功 toast/refetch |
| `apps/web/src/pages/etl-pipelines/__tests__/edit-pipeline-modal.test.tsx` | new | 21 modal 測試 |
| `apps/web/src/pages/etl-pipelines/__tests__/pipeline-list-page.test.tsx` | modified | gear 渲染/禁用測試 + mock 加 `description` |
| `apps/web/src/pages/etl-pipelines/__tests__/pipeline-editor-page.test.tsx` | modified | mock `PipelineListResponse` 加 `description`（型別相容） |

## Architectural Decisions

- **共用 helper 重構**：將 `create()` 內的 cron 驗證與名稱唯一性檢查抽成兩個 private helper，`create()` 行為完全不變（既有 92 e2e 全綠），`updatePipeline` 透過 `excludeId` 參數重用唯一性檢查並達成 self-exclusion。
- **空字串 / null 排程正規化**：service 層將 `schedule` trim 後為空者一律存 null，並跳過 cron 驗證（與 create 慣例一致）。
- **`description` 上鏈**：F093-test/prototype 要求 Modal 預填描述，但既有 list API（`PipelineListItem`）未含 `description`。最小變更：於 `PipelineListItem` 與 `findAll` 回應補上 `description`，Modal 由 `pipeline` prop 取得，無需額外 detail 端點。
- **cron 反向解析**：前端 `parseScheduleToBuilder` 僅對 builder 會產生的 5-field 簡單形（hourly/daily/weekly/monthly）做 best-effort 反向映射；其餘（含 6-field、step、range）落入「手動輸入 Cron」模式顯示原字串。

## F093-test.md 場景調整紀錄

- **SVC-019**：原（選項 A）要求更新排程後重算 `next_execution_at`；依 OD-F093-02=B 改寫為「斷言 `next_execution_at` 不變」。
- **SVC-020**：原「清除排程後 next 歸 null」改寫為「清除排程不觸碰 next_execution_at」（out of scope，由排程器 on-the-fly 處理）。
- **SVC-014 / 015 / 016**：空白名稱於 service 層拋 422 `VALIDATION_ERROR`；空字串（SVC-015）與 256 字元（SVC-016）為 DTO 層攔截，改由 E2E-009 / E2E-010 覆蓋（service 層收不到這兩種 DTO 已擋下的輸入）。

## 已知事項 / 無法完成

- **無回歸**：F093 相關全綠。專案既有 3 個失敗測試檔（`target-table-schemas.spec.ts`、`target-table.service.spec.ts`、`fn-calc-tier-level.spec.ts`；前端 `target-tables-page.test.tsx`、`load-properties.test.tsx`）為 `customer_core` schema 欄位數 drift，與 F093 無關，已 stash 比對確認為 pre-existing baseline 失敗。
- **驗證提醒**：Windows→Docker dev 容器 HMR 不可靠，若需在 app 實機驗證需 `docker restart cdmp-api cdmp-web`。本次以測試為 gate，未實機驗證。
