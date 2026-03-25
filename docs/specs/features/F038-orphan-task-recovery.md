---
spec-id: F038
title: 孤兒任務回收（系統啟動時自動修復 running 狀態）
feature-id: F038
source-story: US-051
epic: E04, E05
priority: P0-MVP
version: "1.1"
date: 2026-03-25
status: Draft
---

# F038: 孤兒任務回收（系統啟動時自動修復 running 狀態）

## 1. 功能摘要

系統在應用程式啟動時，自動偵測並修復所有因站台重啟而卡在 `running` 狀態的擷取任務（E04）、ETL Pipeline（E05）及其對應日誌。此機制確保 Admin 在站台重啟後能立即正常操作所有任務與 Pipeline，無需手動介入或聯絡工程師。

本功能為純系統啟動鉤子（`OnApplicationBootstrap`），無公開 HTTP 端點。

### 1.1 問題背景

CDMP 系統使用 **fire-and-forget** 背景執行模式處理資料擷取與 ETL Pipeline 任務。當站台重啟（部署、崩潰、強制停止）發生在任務執行期間時，背景執行進程被強制中斷，但資料庫中的狀態仍停留在 `running`。此類「孤兒任務」會封鎖後續操作（編輯、刪除、停用、重新執行），Admin 無法自行解除。

### 1.2 受影響實體

**E04 -- 資料擷取管理**

| 實體 | 問題欄位 | 孤兒狀態 |
|------|---------|---------|
| `extraction_tasks` | `status` | 卡在 `'running'` |
| `extraction_logs` | `status`, `finished_at` | 卡在 `'running'`，`finished_at = null` |

**E05 -- ETL Pipeline 管理**

| 實體 | 問題欄位 | 孤兒狀態 |
|------|---------|---------|
| `etl_pipelines` | `status` | 卡在 `'running'` |
| `etl_pipeline_logs` | `status`, `finished_at` | 卡在 `'running'`，`finished_at = null` |

### 1.3 受影響功能

| Feature | 功能名稱 | 影響說明 |
|---------|---------|---------|
| F019 | 編輯擷取任務 | 孤兒任務無法編輯 |
| F020 | 啟用／停用擷取任務 | 孤兒任務無法停用 |
| F021 | 立即執行擷取任務 | 孤兒任務無法重新觸發 |
| F023 | 排程自動執行 | 排程引擎跳過 running 任務，孤兒任務永遠不會恢復 |
| F025 | 刪除擷取任務 | 孤兒任務無法刪除 |
| F030 | 執行 Pipeline | 孤兒 Pipeline 無法重新執行 |
| F031 | 啟用／停用 Pipeline | 無法操作孤兒 Pipeline |
| F034 | 刪除 Pipeline | 孤兒 Pipeline 無法刪除 |

## 2. 使用者故事

**As a** 系統（應用程式啟動模組）
**I want** 在應用程式啟動時自動偵測並修復所有卡在 `running` 狀態的擷取任務、ETL Pipeline 及其對應日誌
**So that** Admin 在站台重啟後能立即正常操作所有任務與 Pipeline，無需手動介入或聯絡工程師

## 3. 前置條件

- 應用程式正在啟動中（Bootstrap 階段）
- 資料庫連線已就緒（TypeORM DataSource 已初始化）
- 所有 NestJS 模組的 DI 已完成

## 4. 驗收標準

### AC-1: 系統啟動時自動回收孤兒擷取任務

- **Given** 資料庫中存在一或多筆 `extraction_tasks`，其 `status = 'running'` 且 `deleted_at IS NULL`
- **When** CDMP 應用程式完成啟動（`OnApplicationBootstrap` 執行）
- **Then** 所有符合條件的擷取任務 `status` 更新為 `'failed'`，且 `error_message` 填入 `'系統重啟，任務執行中斷，請重新觸發執行'`

### AC-2: 孤兒擷取日誌同步修復

- **Given** 孤兒擷取任務存在對應的 `extraction_logs` 記錄，其中 `status = 'running'` 且 `finished_at IS NULL`
- **When** 孤兒回收機制執行
- **Then** 對應的日誌記錄 `status` 更新為 `'failed'`，`finished_at` 填入回收執行時間（`NOW()`），`error_message` 填入 `'系統重啟，執行進程被中斷'`

### AC-3: 回收後孤兒擷取任務可正常操作

- **Given** 站台重啟前有一個 `status = 'running'` 的擷取任務（孤兒任務）
- **When** 系統啟動並完成孤兒回收後，Admin 嘗試對該任務執行重新執行、編輯、停用或刪除操作
- **Then** 系統不再拋出 `EXTRACTION_RUNNING` 錯誤，任務可正常操作

### AC-4: 系統啟動時自動回收孤兒 ETL Pipeline

- **Given** 資料庫中存在一或多筆 `etl_pipelines`，其 `status = 'running'` 且 `deleted_at IS NULL`
- **When** CDMP 應用程式完成啟動（`OnApplicationBootstrap` 執行）
- **Then** 所有符合條件的 ETL Pipeline `status` 更新為 `'failed'`（`etl_pipelines` 無 `error_message` 欄位，不寫入錯誤訊息）

### AC-5: 孤兒 ETL Pipeline 日誌同步修復

- **Given** 孤兒 Pipeline 存在對應的 `etl_pipeline_logs` 記錄，其中 `status = 'running'` 且 `finished_at IS NULL`
- **When** 孤兒回收機制執行
- **Then** 對應的日誌記錄 `status` 更新為 `'failed'`，`finished_at` 填入回收執行時間（`NOW()`），`duration_ms` 以 `(finished_at - started_at)` 毫秒差計算填入，`error_message` 填入 `'系統重啟，Pipeline 執行進程被中斷'`

### AC-6: 回收後孤兒 Pipeline 可正常操作

- **Given** 站台重啟前有一個 `status = 'running'` 的 ETL Pipeline（孤兒 Pipeline）
- **When** 系統啟動並完成孤兒回收後，Admin 嘗試對該 Pipeline 執行重新執行或刪除操作
- **Then** 系統不再拋出 `PIPELINE_RUNNING` 錯誤，Pipeline 可正常操作

### AC-7: 無孤兒任務時靜默通過

- **Given** 資料庫中不存在任何 `status = 'running'` 的擷取任務或 ETL Pipeline
- **When** CDMP 應用程式啟動
- **Then** 回收機制正常執行完畢，無任何狀態更新，系統日誌記錄「孤兒任務回收完成，無需修復」

### AC-8: 回收結果寫入系統日誌

- **Given** 孤兒回收機制執行完畢
- **When** 工程師查看應用程式啟動日誌
- **Then** 日誌包含：掃描到的孤兒擷取任務數量、成功修復數量；掃描到的孤兒 Pipeline 數量、成功修復數量；回收總耗時

### AC-9: 回收在接受請求前完成

- **Given** 系統正在執行孤兒回收
- **When** 有 HTTP 請求在回收期間抵達
- **Then** 請求等待回收完成後才被處理（使用 NestJS `OnApplicationBootstrap` 確保在 HTTP Server 啟動前執行）

### AC-10: 回收失敗不中止啟動

- **Given** 孤兒回收機制在執行過程中發生例外（如個別 Transaction 失敗）
- **When** 例外被捕獲
- **Then** 系統記錄 `error` 層級日誌後繼續完成啟動流程，不因回收失敗而中止整個應用程式

## 5. 主要流程

1. 應用程式啟動，所有 NestJS 模組完成 DI 初始化
2. `OrphanRecoveryService.onApplicationBootstrap()` 被呼叫
3. 系統查詢 `extraction_tasks WHERE status='running' AND deleted_at IS NULL`
4. 若有孤兒擷取任務：
   a. 在單一 Transaction 中批次更新 `extraction_tasks.status = 'failed'`、`error_message = '系統重啟，任務執行中斷，請重新觸發執行'`
   b. 同一 Transaction 中批次更新對應 `extraction_logs`（`task_id IN (...) AND status='running' AND finished_at IS NULL`）：`status = 'failed'`、`finished_at = NOW()`、`error_message = '系統重啟，執行進程被中斷'`
   c. Transaction commit
5. 若無孤兒擷取任務：記錄日誌「擷取任務：無需修復」
6. 系統查詢 `etl_pipelines WHERE status='running' AND deleted_at IS NULL`
7. 若有孤兒 Pipeline：
   a. 在單一 Transaction 中批次更新 `etl_pipelines.status = 'failed'`（僅更新 `status`，`etl_pipelines` 無 `error_message` 欄位）
   b. 同一 Transaction 中批次更新對應 `etl_pipeline_logs`（`pipeline_id IN (...) AND status='running' AND finished_at IS NULL`）：`status = 'failed'`、`finished_at = NOW()`、`duration_ms = (finished_at - started_at) in ms`、`error_message = '系統重啟，Pipeline 執行進程被中斷'`
   c. Transaction commit
8. 若無孤兒 Pipeline：記錄日誌「ETL Pipeline：無需修復」
9. 記錄回收摘要至 Logger（孤兒數量、修復數量、總耗時）
10. 應用程式開始接受 HTTP 請求

## 6. 替代流程

- **擷取任務 Transaction 失敗**：記錄 `error` 層級日誌，跳過擷取任務回收，繼續執行 ETL Pipeline 回收（步驟 6）
- **ETL Pipeline Transaction 失敗**：記錄 `error` 層級日誌，跳過 Pipeline 回收，繼續執行步驟 9 記錄摘要

## 7. 邊界情況

| 邊界情況 | 預期行為 |
|---------|---------|
| 同時有多個孤兒任務 | 批次更新所有符合條件的任務，使用 `UPDATE ... WHERE id IN (...)` 或 TypeORM 批次操作 |
| 孤兒任務對應多筆 running 日誌 | 所有符合條件的日誌全部更新為 `failed` |
| 孤兒任務對應零筆日誌（log 建立失敗的極端情況） | 任務狀態仍更新為 `failed`，無日誌可更新，不報錯 |
| 重複啟動（快速重啟） | 第二次啟動時查詢到 `status='running'` 數量為 0，靜默通過 |
| 孤兒日誌的 `started_at` 距今超過數天（長時間宕機） | 仍正常回收，`finished_at` 填入本次回收時間，`duration_ms` 反映完整間隔（可能極大，屬正常現象） |
| 擷取任務回收 Transaction 失敗 | 記錄錯誤日誌，不中止啟動，繼續執行 ETL Pipeline 回收 |
| ETL Pipeline 回收 Transaction 失敗 | 記錄錯誤日誌，不中止啟動，繼續完成啟動流程 |

## 8. 商業規則

| 規則編號 | 說明 |
|---------|------|
| BR-1 | 孤兒回收機制僅在應用程式**啟動時**執行一次，不在運行期間定期執行 |
| BR-2 | 孤兒任務定義：應用程式啟動時查詢到的所有 `status = 'running'` 且 `deleted_at IS NULL` 的記錄（啟動時不可能有真正執行中的背景任務，故 100% 為孤兒） |
| BR-3 | 孤兒擷取任務回收後 `status` 設為 `'failed'`（而非 `'scheduled'` 或其他），讓 Admin 明確知道上次執行未正常完成 |
| BR-4 | 孤兒 ETL Pipeline 回收後 `status` 設為 `'failed'`，理由同 BR-3 |
| BR-5 | 孤兒日誌的 `finished_at` 填入回收執行當下的系統時間（`NOW()`） |
| BR-6 | 孤兒 ETL Pipeline 日誌的 `duration_ms` 以 `(finished_at - started_at)` 計算，保留可稽核的執行時間資訊 |
| BR-7 | 擷取任務（含其日誌）的更新在同一 Transaction 中完成；ETL Pipeline（含其日誌）的更新在同一 Transaction 中完成。兩組回收各自獨立 Transaction |
| BR-8 | 回收機制不修復已軟刪除（`deleted_at IS NOT NULL`）的任務或 Pipeline |
| BR-9 | 回收完成後，系統日誌必須記錄：修復的擷取任務數量、修復的 ETL Pipeline 數量、回收總耗時 |
| BR-10 | `etl_pipelines` 無 `error_message` 欄位，回收時僅更新 `status`，錯誤原因記錄於 `etl_pipeline_logs.error_message` |
| BR-11 | 回收失敗（單組 Transaction 失敗）時，記錄 `error` 層級日誌但**不中止啟動**，繼續執行下一組回收或完成啟動流程 |

### 錯誤訊息標準化

| 目標欄位 | 填入值 |
|---------|-------|
| `extraction_tasks.error_message` | `'系統重啟，任務執行中斷，請重新觸發執行'` |
| `extraction_logs.error_message` | `'系統重啟，執行進程被中斷'` |
| `etl_pipelines.error_message` | 欄位不存在，不寫入 |
| `etl_pipeline_logs.error_message` | `'系統重啟，Pipeline 執行進程被中斷'` |

## 9. 錯誤場景

本 Feature 不新增公開 API 端點，不產生新的 API 錯誤碼。

| 場景 | 系統回應 | 參考 |
|------|---------|------|
| 擷取任務回收 Transaction 失敗 | 記錄 `error` 層級系統日誌，繼續 ETL Pipeline 回收 | BR-11 |
| ETL Pipeline 回收 Transaction 失敗 | 記錄 `error` 層級系統日誌，繼續啟動流程 | BR-11 |
| 回收期間資料庫連線不可用 | 記錄 `error` 層級系統日誌，啟動繼續（孤兒未修復，需下次重啟時再回收） | BR-11 |

## 10. 非功能需求

| 需求 | 標準 |
|------|------|
| 執行時間 | 孤兒回收完整執行時間不超過 5 秒（基於正常孤兒數量為個位數的假設）。參見 [nfr.md#NFR-002.12](../nfr.md#nfr-00212孤兒回收效能) |
| 系統啟動延遲 | 回收機制不應使應用程式啟動時間增加超過 5 秒 |
| 可觀察性 | 回收結果須寫入 Logger，包含：孤兒數量、修復數量、執行耗時 |
| 冪等性 | 多次啟動（快速重啟）情況下，回收機制必須可安全重複執行，不產生副作用 |

## 11. 假設前提

本功能的正確性依賴以下假設：

1. **單一進程架構**：CDMP MVP 以單一 Node.js 進程運行（無水平擴展/多副本）。若未來採用多副本部署，本機制需改為分散式鎖或依賴 `started_at` 超時判斷。
2. **Fire-and-forget 背景執行**：E04 和 E05 的執行邏輯均為 fire-and-forget，進程終止即代表執行中止，無外部進程（如 Worker）可能在回收後繼續寫入。
3. **啟動即可連線資料庫**：回收服務執行時，TypeORM DataSource 已初始化，資料庫連線已就緒。

## 12. 相依性

| 相依對象 | 說明 |
|---------|------|
| F021（立即執行擷取任務） | 回收後，Admin 應能正常觸發 `triggerRun()` |
| F023（排程自動執行） | 回收後，排程引擎下次掃描可正常觸發（孤兒從 `running` 變為 `failed`，符合 `status != 'running'` 篩選條件） |
| F025（刪除擷取任務） | 回收後，Admin 應能正常執行 `deleteTask()` |
| F030（執行 Pipeline） | 回收後，Admin 應能正常觸發 `triggerExecute()` |
| F034（刪除 Pipeline） | 回收後，Admin 應能正常執行 `deletePipeline()` |

## 13. 資料需求

- ExtractionTask 實體：參見 [data-model.md#extraction-task-entity](../data-model.md#extraction-task-entity)
- ExtractionLog 實體：參見 [data-model.md#extraction-log-entity](../data-model.md#extraction-log-entity)
- EtlPipeline 實體：參見 [data-model.md#etl-pipeline-entity](../data-model.md#etl-pipeline-entity)
- EtlPipelineLog 實體：參見 [data-model.md#etl-pipeline-log-entity](../data-model.md#etl-pipeline-log-entity)

注意：F038 不新增任何資料庫欄位，僅修改既有欄位的值。

## 14. 交叉參考

- 資料模型：[data-model.md](../data-model.md)
- 錯誤處理：[error-handling.md#extraction-errors](../error-handling.md#extraction-errors)、[error-handling.md#etl-pipeline-errors](../error-handling.md#etl-pipeline-errors)
- 非功能需求：[nfr.md#NFR-002.12](../nfr.md#nfr-00212孤兒回收效能)
- 來源 Story：[US-051](../../../stories/epics/E04-data-extraction/US-051-orphan-task-recovery.md)
- 相關功能：[F019](F019-edit-extraction-task.md)、[F020](F020-toggle-extraction-task.md)、[F021](F021-run-extraction-task.md)、[F023](F023-scheduled-extraction.md)、[F025](F025-delete-extraction-task.md)、[F030](F030-execute-pipeline.md)、[F031](F031-toggle-pipeline.md)、[F034](F034-delete-pipeline.md)

## 15. 開放問題（已解決）

| 編號 | 問題 | 狀態 | 決策 | 反映至 |
|------|------|------|------|--------|
| OQ-39 | `etl_pipelines` 實體是否有 `error_message` 欄位？ | 已決策 | **不新增欄位**。回收時僅更新 `status = 'failed'`，錯誤原因記錄在 `etl_pipeline_logs.error_message` | BR-10, AC-4, 主要流程步驟 7a |
| OQ-40 | ETL Pipeline 回收後 `status` 應設為 `'failed'` 還是回復為啟動前的狀態？ | 已決策 | **統一設為 `'failed'`**，與 extraction tasks 保持一致，讓 Admin 明確知道上次執行未完成 | BR-4, AC-4 |
| OQ-41 | 應用程式啟動回收失敗時，是否應中止啟動？ | 已決策 | **記錄錯誤日誌但不中止啟動**。回收失敗不應阻止系統提供其他正常服務 | BR-11, AC-10, 替代流程 |
