---
type: implementation-log
feature_id: F027
feature_name: 查看 Pipeline 列表（後端）
status: complete
last_updated: 2026-03-20
---

# F027: 查看 Pipeline 列表 — 後端實作日誌

## 測試結果摘要

| Scenario ID | 說明 | 狀態 |
|-------------|------|------|
| TS-F027-001 | 統計卡片基本正確性 | PASS |
| TS-F027-002 | 列表基本查詢與欄位完整性 | PASS |
| TS-F027-003 | 狀態篩選（active） | PASS |
| TS-F027-004 | 狀態篩選（running） | PASS |
| TS-F027-005 | 狀態篩選（draft） | PASS |
| TS-F027-006 | 狀態篩選（failed） | PASS |
| TS-F027-007 | 狀態篩選（disabled） | PASS |
| TS-F027-008 | 關鍵字搜尋（中文，模糊比對） | PASS |
| TS-F027-009 | 關鍵字搜尋（英文，大小寫不敏感） | PASS |
| TS-F027-010 | 分頁第一頁（超過 10 筆） | PASS |
| TS-F027-011 | 分頁第二頁（最後一頁不足 10 筆） | PASS |
| TS-F027-012 | User 角色無法查看 Pipeline 列表（403） | PASS |
| TS-F027-013 | User 角色無法查看統計卡片（403） | PASS |
| TS-F027-014 | 未攜帶 Token 被拒絕（401） | PASS |
| TS-F027-015 | 伺服器錯誤降級（500，不洩漏 stack trace） | PASS |
| TS-F027-016 | 軟刪除 Pipeline 不出現在列表 | PASS |
| TS-F027-017 | 軟刪除 Pipeline 不計入統計 | PASS |
| TS-F027-018 | todayProcessed 時區邊界（UTC+8） | PASS |
| TS-F027-019 | 空狀態（無任何 Pipeline） | PASS |
| TS-F027-020 | 篩選無結果時空狀態 | PASS |
| TS-F027-021 | 搜尋無結果時空狀態 | PASS |
| TS-F027-022 | 統計卡片全為零（空系統） | PASS |

共 283 個後端 E2E 測試通過（261 個既有 + 22 個新增 F027），170 個 unit test 全數通過。

## 變更檔案

| 檔案路徑 | 變更類型 | 說明 |
|-----------|----------|------|
| apps/api/src/database/entities/etl-pipeline.entity.ts | new | EtlPipeline Entity，含 name/version/step_count/status/schedule 等欄位 |
| apps/api/src/database/entities/etl-pipeline-log.entity.ts | new | EtlPipelineLog Entity，含 pipeline_id/version/status/processed_count 等欄位 |
| apps/api/src/modules/etl/etl.module.ts | new | ETL 模組定義，匯入 EtlPipeline/EtlPipelineLog/User/TokenBlocklist |
| apps/api/src/modules/etl/etl-pipeline.controller.ts | new | Controller 含 GET /stats 與 GET / 兩個端點，使用 AuthGuard + RolesGuard |
| apps/api/src/modules/etl/etl-pipeline.service.ts | new | Service 含 getStats() 與 findAll() 方法 |
| apps/api/src/modules/etl/dto/list-pipeline.dto.ts | new | 列表查詢 DTO，含 page/pageSize/status/keyword 參數 |
| apps/api/src/common/errors/error-codes.ts | modified | 新增 PIPELINE_NOT_FOUND/PIPELINE_NAME_EXISTS/SYSTEM_INTERNAL_ERROR |
| apps/api/src/app.module.ts | modified | 匯入 EtlModule 與 EtlPipeline/EtlPipelineLog 實體 |
| apps/api/test/etl-pipeline.e2e-spec.ts | new | 22 個 E2E 測試場景 |
| packages/shared/src/index.ts | modified | 新增 Pipeline 相關共用型別與 ERROR_CODES |

## 架構決策

- **ETL 模組路徑**：`apps/api/src/modules/etl/`，Controller 路由前綴為 `etl/pipelines`（對應 API 規格 `/api/v1/etl/pipelines`）
- **Entity 日期欄位**：使用 `dateColumnType` helper（PostgreSQL 用 `timestamp`，SQLite 用 `datetime`），與既有 extraction-task 模式一致
- **todayProcessed 計算**：使用 UTC+8 時區邊界計算今日範圍，從 EtlPipelineLog 表 SUM(processed_count)，排除 test run
- **createdBy 顯示**：列表 API 透過 leftJoin User 取得使用者姓名，而非回傳 ID
- **軟刪除排除**：所有查詢（列表、統計）均加 `deleted_at IS NULL` 條件
- **TS-F027-015 伺服器錯誤**：依賴 NestJS 預設 ExceptionHandler 處理非 HttpException 錯誤，自動回傳 500 且不洩漏 stack trace
- **分頁回應格式**：使用 `pagination` 物件（含 page/pageSize/total/totalPages），與 F027 API 規格一致
