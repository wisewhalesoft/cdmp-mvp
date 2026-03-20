---
type: implementation-log
feature_id: F028
feature_name: 建立 Pipeline（前後端）
status: complete
last_updated: 2026-03-20
---

# F028: 建立 Pipeline — 實作日誌

## 測試結果摘要

| Scenario ID | 說明 | 狀態 |
|-------------|------|------|
| TS-F028-001 | 成功建立 Pipeline（含排程） | PASS |
| TS-F028-002 | 成功建立 Pipeline（不含排程） | PASS |
| TS-F028-003 | 成功建立後同步建立 EtlPipelineVersion v1 | PASS |
| TS-F028-004 | EtlPipelineVersion 初始 definition 為空結構 | PASS |
| TS-F028-005 | createdBy 記錄建立者 ID | PASS |
| TS-F028-006 | 名稱重複 → 409 | PASS |
| TS-F028-007 | 軟刪除後名稱可重用 | PASS |
| TS-F028-008 | 名稱空白 → 422 | PASS |
| TS-F028-009 | 名稱缺失（key 未提供）→ 422 | PASS |
| TS-F028-010 | 非法 Cron 表達式 → 422 | PASS |
| TS-F028-011 | User 角色無權建立 → 403 | PASS |
| TS-F028-012 | 未登入（無 Token）→ 401 | PASS |
| TS-F028-013 | 名稱長度 255 字元（邊界值，接受） | PASS |
| TS-F028-014 | 名稱長度 256 字元（超出上限，拒絕） | PASS |
| TS-F028-015 | Cron 5 欄位標準格式（合法） | PASS |
| TS-F028-016 | Cron 6 欄位擴充格式（合法） | PASS |
| TS-F028-017 | Cron 4 欄位（不合法格式，拒絕） | PASS |

共 39 個 E2E 測試通過（22 個 F027 + 17 個 F028）。

## 變更檔案

### 新增

| 檔案 | 說明 |
|------|------|
| `apps/api/src/database/entities/etl-pipeline-version.entity.ts` | EtlPipelineVersion Entity（pipeline_id, version, definition, status, change_summary, created_by） |
| `apps/api/src/modules/etl/dto/create-pipeline.dto.ts` | CreatePipelineDto（name 必填 MaxLength(255), description/schedule 選填） |
| `apps/web/src/pages/etl-pipelines/create-pipeline-modal.tsx` | 建立 Pipeline Modal（含 Cron UI 選擇器、排程預覽） |

### 修改

| 檔案 | 說明 |
|------|------|
| `apps/api/src/modules/etl/etl.module.ts` | 註冊 EtlPipelineVersion entity |
| `apps/api/src/app.module.ts` | 註冊 EtlPipelineVersion entity |
| `apps/api/src/common/errors/error-codes.ts` | 新增 VALIDATION_INVALID_CRON 錯誤碼與訊息 |
| `apps/api/src/modules/etl/etl-pipeline.service.ts` | 新增 create() 方法：cron 驗證、名稱唯一性、事務建立 Pipeline+Version |
| `apps/api/src/modules/etl/etl-pipeline.controller.ts` | 新增 POST endpoint（201 Created） |
| `apps/api/test/etl-pipeline.e2e-spec.ts` | 新增 F028 describe block（17 個測試場景） |
| `packages/shared/src/index.ts` | 新增 CreatePipelineRequest/Response 型別、VALIDATION_INVALID_CRON 錯誤碼 |
| `apps/web/src/api/etl-pipelines.ts` | 新增 createPipeline() API 函式 |
| `apps/web/src/pages/etl-pipelines/pipeline-list-page.tsx` | 新增「建立 Pipeline」按鈕與 Modal 整合 |

## 實作決策與注意事項

1. **Cron 欄位數驗證**：`cron-parser` 的 `CronExpressionParser.parse()` 會接受 4 欄位 cron 表達式，但 BR-4 規格要求 5 或 6 欄位。因此在呼叫 parser 前先手動檢查欄位數量。
2. **事務原子性**：使用 TypeORM `DataSource.transaction()` 確保 Pipeline 和 PipelineVersion 在同一事務中建立。
3. **名稱唯一性**：使用 QueryBuilder `WHERE name = :name AND deleted_at IS NULL` 檢查，大小寫敏感（exact match）。
4. **前端導向**：F029 編輯器頁面尚未實作，建立成功後暫時關閉 Modal 並 refresh 列表，待 F029 完成後再導向。
5. **Cron UI**：前端提供頻率選擇器（每小時/每日/每週/每月）+ 手動輸入模式，自動產生 cron 表達式並即時預覽。
6. **EtlPipelineVersion definition 使用 `simple-json`**：確保 SQLite（E2E 測試）和 PostgreSQL（生產）皆相容。
