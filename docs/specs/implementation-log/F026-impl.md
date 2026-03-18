---
type: implementation-log
feature_id: F026
feature_name: Preview Raw Data API
status: complete
last_updated: 2026-03-18
---

# F026: Raw Data 預覽 API — 實作日誌

## 測試結果摘要

| Scenario ID  | 描述                                           | 狀態 |
|-------------|------------------------------------------------|------|
| TS-F026-001 | 基本查詢（預設分頁參數）                         | PASS |
| TS-F026-002 | 分頁（limit=50, 10 筆資料, totalPages=1）        | PASS |
| TS-F026-003 | 排序（sortBy=name, sortOrder=asc）               | PASS |
| TS-F026-004 | 排序降序（sortBy=name, sortOrder=desc）          | PASS |
| TS-F026-005 | 系統欄位標記（_cdmp_extracted_at isSystem=true）  | PASS |
| TS-F026-006 | lastUpdatedAt 正確（最後 completed log）          | PASS |
| TS-F026-007 | 任務不存在 → 404 EXTRACTION_NOT_FOUND            | PASS |
| TS-F026-008 | Raw data 表不存在 → 404 EXTRACTION_RAW_TABLE_NOT_FOUND | PASS |
| TS-F026-009 | 非 Admin → 403 AUTH_FORBIDDEN                    | PASS |
| TS-F026-010 | limit 不在白名單 → 422 VALIDATION_ERROR          | PASS |
| TS-F026-011 | sortOrder 無效值 → 422 VALIDATION_ERROR          | PASS |
| TS-F026-012 | 空表（totalCount=0, totalPages=0）               | PASS |
| TS-F026-013 | 按系統欄位排序（_cdmp_extracted_at）              | PASS |

## 變更檔案

| 檔案路徑 | 變更類型 | 描述 |
|----------|---------|------|
| apps/api/src/modules/extraction-task/dto/get-raw-data.dto.ts | new | GetRawDataDto — 分頁、排序、limit 白名單驗證 |
| apps/api/src/modules/extraction-task/raw-data.service.ts | modified | 新增 getRawData() 方法、注入 TaskRepo + LogRepo |
| apps/api/src/modules/extraction-task/extraction-task.controller.ts | modified | 新增 GET :id/raw-data 路由（置於 GET :id 之前）、注入 RawDataService |
| apps/api/src/common/errors/error-codes.ts | modified | 新增 EXTRACTION_RAW_TABLE_NOT_FOUND 錯誤碼與訊息 |
| packages/shared/src/index.ts | modified | 新增 RawDataColumn, RawDataMeta, RawDataResponse 型別 |
| apps/api/test/extraction-task.e2e-spec.ts | modified | 新增 F026 describe block（13 個測試場景） |

## 架構決策

- **路由順序**：`GET :id/raw-data` 必須在 `GET :id` 之前註冊，否則 NestJS 會將 `raw-data` 視為 UUID 參數
- **SQL 注入防護**：`sortBy` 參數透過 PRAGMA table_info 結果驗證為合法欄位名稱，不直接拼接使用者輸入
- **limit 白名單**：使用 class-validator `@IsIn([50, 100, 200])` 在 DTO 層擋掉非法值，回傳 422
- **系統欄位判斷**：`_cdmp_id` 和 `_cdmp_extracted_at` 標記為 isSystem=true
- **lastUpdatedAt**：查詢最後一筆 status='completed' 的 ExtractionLog 的 finished_at
- **Warning 機制**：totalCount > 100,000 且 sortBy 為非索引欄位時，回傳 warning 提示效能影響
- **RawDataService 注入**：新增 ExtractionTask 和 ExtractionLog Repository 注入，Module 已在 TypeOrmModule.forFeature 中註冊

## 測試統計

- 既有測試：203 通過
- 新增測試：13 通過
- 總計：216 通過（1 skipped，為既有 F020 前端測試）
