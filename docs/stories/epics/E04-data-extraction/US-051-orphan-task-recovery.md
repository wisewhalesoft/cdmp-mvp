# US-051：孤兒任務回收（系統啟動自動修復）

> **Story ID**：US-051
> **Epic**：[E04 — 資料擷取管理](epic-brief.md)
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：5

---

## User Story

**As a** 系統（應用程式啟動模組）
**I want** 在應用程式啟動時自動偵測並修復所有卡在 `running` 狀態的擷取任務、ETL Pipeline 及其對應日誌
**So that** Admin 在站台重啟後能立即正常操作所有任務與 Pipeline，無需手動介入或聯絡工程師

---

## 背景說明

CDMP 使用 fire-and-forget 背景執行模式處理擷取任務（E04）與 ETL Pipeline（E05）。任務觸發時，系統立即將 `status` 寫入 `running`，再以非同步方式執行實際作業。

當站台重啟（部署、崩潰、強制停止）發生在任務執行期間時，背景進程被強制中斷，但資料庫狀態仍停在 `running`。此類「孤兒任務」會封鎖所有後續操作（編輯、刪除、停用、重新執行），Admin 無法自行解除。

本 Story 實作系統啟動鉤子（`OnApplicationBootstrap`），在應用程式開始接受 HTTP 請求前，自動批次修復所有孤兒任務。

---

## 驗收標準

### AC-1：孤兒擷取任務自動回收
- **Given** 資料庫中存在一或多筆 `extraction_tasks`，其 `status = 'running'` 且 `deleted_at IS NULL`
- **When** CDMP 應用程式完成啟動（`OnApplicationBootstrap` 執行）
- **Then** 所有符合條件的擷取任務 `status` 更新為 `'failed'`，且 `error_message` 填入標準化說明（例如：`'系統重啟，任務執行中斷，請重新觸發執行'`）

### AC-2：孤兒擷取日誌同步修復
- **Given** 孤兒擷取任務存在對應的 `extraction_logs` 記錄，其中 `status = 'running'` 且 `finished_at IS NULL`
- **When** 孤兒回收機制執行
- **Then** 對應的日誌記錄 `status` 更新為 `'failed'`，`finished_at` 填入回收執行時間（`NOW()`），`error_message` 填入標準化說明

### AC-3：回收後孤兒擷取任務可正常操作
- **Given** 站台重啟前有一個 `status = 'running'` 的擷取任務（孤兒任務）
- **When** 系統啟動並完成孤兒回收後，Admin 嘗試對該任務執行重新執行、編輯、停用或刪除操作
- **Then** 系統不再拋出 `EXTRACTION_RUNNING` 錯誤，任務可正常操作

### AC-4：孤兒 ETL Pipeline 自動回收
- **Given** 資料庫中存在一或多筆 `etl_pipelines`，其 `status = 'running'` 且 `deleted_at IS NULL`
- **When** CDMP 應用程式完成啟動（`OnApplicationBootstrap` 執行）
- **Then** 所有符合條件的 ETL Pipeline `status` 更新為 `'failed'`

### AC-5：孤兒 ETL Pipeline 日誌同步修復
- **Given** 孤兒 Pipeline 存在對應的 `etl_pipeline_logs` 記錄，其中 `status = 'running'` 且 `finished_at IS NULL`
- **When** 孤兒回收機制執行
- **Then** 對應的日誌記錄 `status` 更新為 `'failed'`，`finished_at` 填入回收執行時間，`duration_ms` 以 `(finished_at - started_at)` 計算填入，`error_message` 填入標準化說明

### AC-6：回收後孤兒 Pipeline 可正常操作
- **Given** 站台重啟前有一個 `status = 'running'` 的 ETL Pipeline（孤兒 Pipeline）
- **When** 系統啟動並完成孤兒回收後，Admin 嘗試對該 Pipeline 執行重新執行或刪除操作
- **Then** 系統不再拋出 `PIPELINE_RUNNING` 錯誤，Pipeline 可正常操作

### AC-7：無孤兒任務時靜默通過
- **Given** 資料庫中不存在任何 `status = 'running'` 的擷取任務或 ETL Pipeline
- **When** CDMP 應用程式啟動
- **Then** 回收機制正常執行完畢，無任何狀態更新，系統日誌記錄「孤兒任務回收完成，無需修復」

### AC-8：回收結果寫入系統日誌
- **Given** 孤兒回收機制執行完畢
- **When** 工程師查看應用程式啟動日誌
- **Then** 日誌包含：掃描到的孤兒擷取任務數量、成功修復數量；掃描到的孤兒 Pipeline 數量、成功修復數量

### AC-9：回收在接受請求前完成
- **Given** 系統正在執行孤兒回收
- **When** 有 HTTP 請求在回收期間抵達
- **Then** 請求等待回收完成後才被處理（使用 NestJS `OnApplicationBootstrap` 確保執行順序）

### AC-10：回收失敗不中止啟動
- **Given** 孤兒回收機制在執行過程中發生例外（如個別記錄更新失敗）
- **When** 例外被捕獲
- **Then** 系統記錄錯誤日誌後繼續完成啟動，不因回收失敗而中止整個應用程式啟動流程

---

## Technical Notes

- **實作位置**：獨立的 `OrphanRecoveryService`，實作 NestJS `OnApplicationBootstrap` 介面
- **執行時機**：`OnApplicationBootstrap`（所有模組 DI 完成後、HTTP Server 啟動前），優於 `OnModuleInit`
- **回收邏輯（擷取任務）**：
  1. 查詢 `extraction_tasks WHERE status='running' AND deleted_at IS NULL`
  2. 批次更新 `status = 'failed'`, `error_message = '系統重啟，任務執行中斷，請重新觸發執行'`
  3. 批次更新對應 `extraction_logs`（`task_id IN (...) AND status='running' AND finished_at IS NULL`）→ `status='failed'`, `finished_at=NOW()`, `error_message='系統重啟，執行進程被中斷'`
- **回收邏輯（ETL Pipeline）**：
  1. 查詢 `etl_pipelines WHERE status='running' AND deleted_at IS NULL`
  2. 批次更新 `status = 'failed'`（`etl_pipelines` 無 `error_message` 欄位，錯誤原因僅記錄於日誌）
  3. 批次更新對應 `etl_pipeline_logs`（`pipeline_id IN (...) AND status='running' AND finished_at IS NULL`）→ `status='failed'`, `finished_at=NOW()`, `duration_ms=(finished_at-started_at)`, `error_message='系統重啟，Pipeline 執行進程被中斷'`
- **交易處理**：擷取任務與其日誌的更新在同一 Transaction 中完成；ETL Pipeline 與其日誌的更新在同一 Transaction 中完成。若 Transaction 失敗，記錄錯誤日誌但不中止啟動
- **冪等性**：回收機制可安全重複執行，第二次啟動時若無 `status='running'` 記錄則靜默通過
- **不新增 API 端點**：本功能為純系統啟動鉤子，無公開 HTTP 端點
- **錯誤訊息標準化**：
  - `extraction_tasks.error_message`：`'系統重啟，任務執行中斷，請重新觸發執行'`
  - `extraction_logs.error_message`：`'系統重啟，執行進程被中斷'`
  - `etl_pipeline_logs.error_message`：`'系統重啟，Pipeline 執行進程被中斷'`

---

## 測試建議

| # | 測試情境 | 預期結果 |
|---|---------|---------|
| 1 | 有 N 筆孤兒擷取任務時啟動 | 所有任務 status 變為 failed，error_message 填入標準化說明 |
| 2 | 孤兒任務有對應 extraction_log | 對應日誌 status=failed，finished_at 填入，error_message 填入 |
| 3 | 孤兒任務無對應日誌（極端情況） | 任務狀態仍更新，無日誌可更新 → 不報錯，正常通過 |
| 4 | 有 N 筆孤兒 ETL Pipeline 時啟動 | 所有 Pipeline status 變為 failed |
| 5 | 孤兒 Pipeline 有對應 etl_pipeline_log | 對應日誌 status=failed，finished_at 填入，duration_ms 計算填入 |
| 6 | 無孤兒任務時啟動 | 靜默通過，日誌記錄「無需修復」 |
| 7 | 回收後對孤兒擷取任務執行 triggerRun | 不拋出 EXTRACTION_RUNNING，任務正常觸發 |
| 8 | 回收後對孤兒 Pipeline 執行 triggerExecute | 不拋出 PIPELINE_RUNNING，Pipeline 正常觸發 |
| 9 | 快速重啟（回收完後立即重啟） | 第二次啟動回收結果為 0，靜默通過 |
| 10 | 擷取任務回收 Transaction 失敗 | 記錄錯誤日誌，不中止啟動，繼續執行 ETL Pipeline 回收 |
| 11 | 回收完成後查看啟動日誌 | 日誌包含孤兒數量與修復數量的摘要 |
| 12 | 同時存在孤兒擷取任務和孤兒 Pipeline | 兩者皆被正確回收，各自的日誌皆更新 |

---

## 依賴關係

- **Blocked By**：US-034（擷取任務執行邏輯，回收對象）、US-043（ETL Pipeline 執行邏輯，回收對象）
- **Blocks**：無

---

## Definition of Done

- [ ] `OrphanRecoveryService` 實作 `OnApplicationBootstrap`
- [ ] 孤兒擷取任務批次更新為 `failed`（含 `error_message`）
- [ ] 孤兒擷取日誌批次更新為 `failed`（含 `finished_at`、`error_message`）
- [ ] 孤兒 ETL Pipeline 批次更新為 `failed`
- [ ] 孤兒 ETL Pipeline 日誌批次更新為 `failed`（含 `finished_at`、`duration_ms`、`error_message`）
- [ ] 擷取任務更新與日誌更新在同一 Transaction 中完成
- [ ] ETL Pipeline 更新與日誌更新在同一 Transaction 中完成
- [ ] 回收失敗時記錄錯誤日誌但不中止啟動
- [ ] 回收完成後系統日誌包含回收摘要（孤兒數量、修復數量）
- [ ] 無孤兒任務時靜默通過
- [ ] 所有驗收標準的單元測試通過

---

## 相關文件

- **Epic Brief**：[E04 Epic Brief](epic-brief.md)
- **Feature Spec**：[F038 孤兒任務回收](../../../specs/features/F038-orphan-task-recovery.md)
- **相關 Stories**：US-034（擷取任務執行）、US-043（Pipeline 執行）、US-036（排程自動執行）
