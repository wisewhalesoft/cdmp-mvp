# F038: 孤兒任務回收（系統啟動時自動修復 running 狀態）- Implementation Log

## Feature Summary

當站台重啟中斷 fire-and-forget 背景執行的資料擷取任務（E04）或 ETL Pipeline（E05），資料庫中 `status = 'running'` 殘留導致任務無法刪除、編輯、停用或重新執行。F038 在應用程式啟動時自動偵測並修復這些孤兒任務，將其 status 更新為 `failed` 並同步修復對應日誌。

## Implementation Date

2026-03-25

## Architecture Decisions

### 1. 獨立 OrphanRecoveryModule

建立獨立 Module 而非放入 ExtractionTaskModule 或 EtlModule，理由：
- 回收邏輯跨 E04/E05 兩個業務邊界，放入任一方都產生不必要耦合
- 獨立 Module 可單獨測試，不需載入完整業務模組
- 未來其他啟動修復邏輯可集中於此

### 2. OnApplicationBootstrap lifecycle hook

選擇 `OnApplicationBootstrap` 而非 `OnModuleInit`：
- 確保所有模組 DI 完成後才執行
- 在 HTTP Server 開始接受請求前完成，無競爭條件
- Module import 順序：`EtlModule → OrphanRecoveryModule → SchedulerModule`，確保回收在排程首次掃描前完成

### 3. 雙獨立 Transaction

E04 和 E05 各自獨立 Transaction：
- E04 回收失敗不影響 E05 回收
- 單組回收失敗 Logger.error() 但不中止啟動

### 4. 批次 QueryBuilder 更新

使用 TypeORM `createQueryBuilder().update().set()` 批次更新，而非逐筆 `repository.save()`：
- 單次 SQL 完成所有更新
- 需明確指定 `updated_at: () => nowExpr` 因 QueryBuilder 不自動觸發 `@UpdateDateColumn()`

### 5. SQLite/PostgreSQL 雙相容

`NOW()` 在 SQLite 不可用，根據 `dataSource.options.type` 動態選擇：
- PostgreSQL: `NOW()`、`EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000`
- SQLite: `datetime('now')`、`CAST((julianday('now') - julianday(started_at)) * 86400000 AS INTEGER)`

### 6. etl_pipelines 無 error_message 欄位

`etl_pipelines` Entity 沒有 `error_message` 欄位，回收時僅更新 `status = 'failed'`。錯誤原因記錄在 `etl_pipeline_logs.error_message`。

## Files Changed

### Backend — New Files

| File | Description |
|------|-------------|
| `apps/api/src/modules/orphan-recovery/orphan-recovery.module.ts` | NestJS Module，import 4 個 Entity Repository |
| `apps/api/src/modules/orphan-recovery/orphan-recovery.service.ts` | 回收邏輯 Service，實作 OnApplicationBootstrap |
| `apps/api/src/modules/orphan-recovery/__tests__/orphan-recovery.service.spec.ts` | 17 個 unit tests |
| `apps/api/test/orphan-recovery.e2e-spec.ts` | 10 個 integration tests (SQLite in-memory) |

### Backend — Modified Files

| File | Change |
|------|--------|
| `apps/api/src/app.module.ts` | import OrphanRecoveryModule，位於 EtlModule 後、SchedulerModule 前 |

## Test Coverage

### Unit Tests (17 tests) — `orphan-recovery.service.spec.ts`

| ID | Scenario | Status |
|----|----------|--------|
| TS-F038-001 | 有孤兒擷取任務時，批次更新 status 為 failed | PASS |
| TS-F038-002 | error_message 填入標準化訊息 | PASS |
| TS-F038-003 | 對應 extraction_logs 同步更新為 failed | PASS |
| TS-F038-004 | 多筆孤兒任務批次回收 | PASS |
| TS-F038-005 | 已軟刪除的 running 任務不被回收 | PASS |
| TS-F038-009 | 有孤兒 Pipeline 時，status 更新為 failed | PASS |
| TS-F038-010 | etl_pipelines 不寫入 error_message | PASS |
| TS-F038-011 | duration_ms 使用 PostgreSQL 語法計算 | PASS |
| TS-F038-012 | 多筆孤兒 Pipeline 批次回收 | PASS |
| TS-F038-013 | 已軟刪除的 running Pipeline 不被回收 | PASS |
| TS-F038-016 | 無任何 running 任務/Pipeline 時靜默通過 | PASS |
| TS-F038-017 | Logger 記錄「無需修復」 | PASS |
| TS-F038-019 | E04 回收失敗時不拋出例外，繼續執行 E05 | PASS |
| TS-F038-020 | E05 回收失敗時不拋出例外 | PASS |
| TS-F038-021 | E04 回收失敗時 Logger.error 被呼叫 | PASS |
| TS-F038-024 | 回收摘要包含數量與耗時 | PASS |
| TS-F038-027 | 連續執行兩次，第二次無副作用 | PASS |

### Integration Tests (10 tests) — `orphan-recovery.e2e-spec.ts`

| ID | Scenario | Status |
|----|----------|--------|
| TS-F038-028 | 回收後 extraction_tasks.status = failed, error_message 正確 | PASS |
| TS-F038-029 | 對應 extraction_logs 同步修復（status, finished_at, error_message） | PASS |
| TS-F038-030 | 多筆孤兒任務批次回收 | PASS |
| TS-F038-031 | 已軟刪除的 running 任務不被回收 | PASS |
| TS-F038-032 | completed/failed 任務不被影響 | PASS |
| TS-F038-033 | 回收後 etl_pipelines.status = failed | PASS |
| TS-F038-034 | etl_pipeline_logs 修復含 finished_at 和 duration_ms | PASS |
| TS-F038-035 | 已軟刪除的 running Pipeline 不被回收 | PASS |
| TS-F038-037 | 無孤兒時正常完成不報錯 | PASS |
| TS-F038-044 | 連續執行兩次，第二次無副作用（冪等性） | PASS |

## Regression Check

全專案 unit tests：25 files, 261 tests, all passed.

## Logger Output Format

```
[OrphanRecoveryService] 孤兒任務回收開始...
[OrphanRecoveryService] 擷取任務回收完成：修復 N 筆孤兒任務及其日誌
[OrphanRecoveryService] ETL Pipeline：無需修復（0 筆孤兒）
[OrphanRecoveryService] 孤兒任務回收完成。擷取任務：修復 N/N；ETL Pipeline：修復 M/M；總耗時：Xms
```

## Error Messages (Standardized)

| Entity | Field | Message |
|--------|-------|---------|
| `extraction_tasks` | `error_message` | `系統重啟，任務執行中斷，請重新觸發執行` |
| `extraction_logs` | `error_message` | `系統重啟，執行進程被中斷` |
| `etl_pipelines` | (no field) | N/A |
| `etl_pipeline_logs` | `error_message` | `系統重啟，Pipeline 執行進程被中斷` |

## Known Limitations

- 依賴單一進程架構假設。多副本部署時需改為分散式鎖或 `started_at` 超時判斷。
- `duration_ms` 使用資料庫端計算，SQLite/PostgreSQL 有不同語法，已透過 `dataSource.options.type` 判斷處理。

## Related Specs

- Product Analysis & Spec: `docs/specs/features/F038-orphan-task-recovery.md`
- Architecture Design: `docs/specs/implementation-log/F038-architecture.md`
- Test Design: `docs/test-specs/features/F038-test.md`
- User Story: `docs/stories/epics/E04-data-extraction/US-051-orphan-task-recovery.md`
