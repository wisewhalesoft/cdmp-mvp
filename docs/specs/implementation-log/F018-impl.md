---
type: implementation-log
feature_id: F018
feature_name: 查看擷取任務清單
status: complete
last_updated: 2026-03-18
---

# F018: 查看擷取任務清單 — Implementation Log

## Test Results Summary
| Scenario ID | Description | Status |
|-------------|------------|--------|
| TS-F018-001 | 基本清單回傳，依 updated_at DESC 排序 | PASS |
| TS-F018-002 | Summary 統計：todaySuccess=3, todayFailed=1, successRate=75 | PASS |
| TS-F018-003 | 依名稱搜尋（search 關鍵字） | PASS |
| TS-F018-004 | 依狀態篩選（status filter） | PASS |
| TS-F018-005 | 多條件 AND 篩選（status + mode） | PASS |
| TS-F018-006 | 非 Admin 使用者回傳 403 | PASS |
| TS-F018-007 | 軟刪除任務不顯示於清單 | PASS |
| TS-F018-008 | 空清單回傳零值 Summary | PASS |
| TS-F018-009 | UTC+8 時區邊界驗證（昨日 log 不計入） | PASS |

## Files Changed
| File Path | Change Type | Description |
|-----------|------------|-------------|
| apps/api/src/database/entities/extraction-log.entity.ts | new | ExtractionLog Entity 定義 |
| apps/api/src/modules/extraction-task/dto/list-extraction-task.dto.ts | new | 清單查詢參數 DTO（分頁、搜尋、篩選） |
| apps/api/src/modules/extraction-task/extraction-task.service.ts | modified | 新增 findAll() 方法（含 Summary 統計） |
| apps/api/src/modules/extraction-task/extraction-task.controller.ts | modified | 新增 GET / 路由 |
| apps/api/src/modules/extraction-task/extraction-task.module.ts | modified | 註冊 ExtractionLog Entity |
| apps/api/src/app.module.ts | modified | 將 ExtractionLog 加入 sqlite 與 postgres entities 陣列 |
| apps/api/test/extraction-task.e2e-spec.ts | modified | 新增 F018 E2E 測試（9 個場景） |

## Architectural Decisions
- Summary 統計為全域統計（不受篩選條件與分頁影響），包含 totalTasks、running、todaySuccess、todayFailed、successRate
- 今日統計使用 UTC+8（Asia/Taipei）時區計算，將當天 00:00 轉換回 UTC 進行資料庫查詢
- 日期參數傳入 Date 物件（非 ISO string），以相容 SQLite 的 datetime 儲存格式
- successRate 計算：`round(todaySuccess / (todaySuccess + todayFailed) * 1000) / 10`，無資料時回傳 0
- 空清單刪除使用 QueryBuilder `delete().from().execute()` 而非 `repo.delete({})`，以避免 TypeORM 空條件錯誤
