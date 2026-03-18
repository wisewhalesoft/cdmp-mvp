---
spec-id: F021
title: 立即執行／重新執行擷取任務
feature-id: F021
source-story: US-034
epic: E04
priority: P0-MVP
version: "1.2"
date: 2026-03-18
status: Draft
---

# F021: 立即執行／重新執行擷取任務

## 1. 功能摘要

提供 Admin 手動觸發擷取任務執行或重新執行失敗任務的功能。系統以非同步方式執行擷取作業：連線至外部資料來源，讀取來源資料表（由 `source_schema` + `source_table` 組合定位，執行時組合為 `"source_schema"."source_table"` 格式）的資料，真正寫入 CDMP AppDB 中對應的 raw data 表（`raw_{task_id_short}`）。首次執行時自動建立 raw data 表。支援全量（TRUNCATE + 重寫）與增量（追加寫入）兩種模式，以批次 INSERT（每批 1,000 筆）執行寫入。

## 2. 使用者故事

**As a** Admin（管理者）
**I want** 手動觸發擷取任務的執行，或重新執行失敗的任務
**So that** 我可以即時取得資料，或在任務失敗後快速重試

## 3. 前置條件

- Admin 已登入且具備 Admin 權限
- 目標擷取任務存在且未被軟刪除
- 目標擷取任務的 `status` 不為 `running`

## 4. 驗收標準

### AC-1: 手動觸發執行

- **Given** Admin 在擷取任務清單頁面，某任務 `status` 為 `scheduled`、`completed` 或 `failed`
- **When** Admin 點擊該任務的「立即執行」按鈕
- **Then** 系統將該任務 `status` 設為 `running`，建立一筆 ExtractionLog（`triggered_by = 'manual'`），開始執行擷取作業

### AC-2: 重新執行失敗任務

- **Given** Admin 在擷取任務清單或日誌中，某任務最近一次執行為 `failed`
- **When** Admin 點擊「重新執行」按鈕
- **Then** 系統將該任務 `status` 設為 `running`，建立一筆 ExtractionLog（`triggered_by = 'retry'`），重新開始擷取作業

### AC-3: 執行進度追蹤

- **Given** 擷取任務正在執行中
- **When** Admin 查看該任務
- **Then** 系統顯示進度條（基於 `extracted_count / total_count`），即時更新擷取筆數與進度百分比

### AC-4: 執行中不可重複觸發

- **Given** 某擷取任務的 `status` 為 `running`
- **When** Admin 嘗試再次觸發該任務
- **Then** 系統顯示「任務正在執行中，請等待完成」的提示訊息

### AC-5: 執行完成更新狀態

- **Given** 擷取任務執行中
- **When** 擷取作業完成（成功或失敗）
- **Then** 系統更新任務 `status`（`completed` 或 `failed`）、`last_execution_at`、`extracted_count`、`error_message`（若失敗），同時更新對應的 ExtractionLog 記錄

### AC-6: 擷取資料真正寫入 AppDB

- **Given** 擷取任務執行成功
- **When** 擷取作業完成
- **Then** 系統確認 CDMP AppDB 中的對應 raw data 表（`raw_{task_id_short}`）已包含從外部資料來源讀取的實際資料，筆數與 `extracted_count` 一致

### AC-7: AppDB raw data 表不存在時自動建立

- **Given** 某擷取任務的 AppDB raw data 表尚未建立（首次執行）
- **When** 擷取作業啟動
- **Then** 系統自動讀取外部來源表的欄位 metadata，於 AppDB 建立對應結構的 raw data 表（含 `_cdmp_extracted_at` 系統欄位；若來源表無主鍵則附加 `_cdmp_id` 欄位），再執行資料寫入

## 5. 主要流程

1. Admin 在任務清單中點擊「立即執行」或「重新執行」按鈕
2. 系統發送 `POST /api/v1/extraction-tasks/:id/run`
3. 系統建立 ExtractionLog（`status = 'running'`）
4. 系統更新 ExtractionTask（`status = 'running'`）
5. 系統回傳 `202 Accepted`，前端開始 Polling 進度
6. 系統非同步執行擷取作業：
   a. 讀取 Datasource 連線資訊，AES-256 解密 `encrypted_password`
   b. 連線至外部資料來源
   c. 檢查 AppDB 是否已有對應的 raw data 表（`raw_{task_id_short}`）
      - 若不存在：讀取來源表（`"source_schema"."source_table"`）的欄位 metadata，於 AppDB 建立同結構的 raw data 表
      - 若已存在：使用現有表
   d. 全量模式：先 TRUNCATE raw data 表
   e. 查詢 `total_count`（`SELECT COUNT(*) FROM "source_schema"."source_table"`；增量模式加 `WHERE` 條件）
   f. 批次讀取外部來源資料（每批 1,000 筆），寫入 AppDB raw data 表
   g. 增量模式：每批次使用 `WHERE incremental_column > last_incremental_value`
7. 每批次完成後更新 `extracted_count` 與 `progress_percent`
8. 執行完成後更新 ExtractionLog（`status`、`finished_at`、`duration_ms`、`extracted_count`）
9. 系統更新 ExtractionTask（`status`、`last_execution_at`、`extracted_count`、`avg_duration_ms`、`execution_count`）
10. 增量模式成功完成後更新 `last_incremental_value`
11. 若任一步驟失敗，記錄 `error_message`，更新狀態為 `failed`

## 6. 替代流程

- **手動執行已停用任務**：允許執行（手動觸發不受 `enabled` 限制，僅排程受限）

## 7. 邊界情況

- 擷取過程中資料來源連線斷開：任務 `status` 設為 `failed`，ExtractionLog 記錄錯誤訊息；全量模式下已 TRUNCATE 的資料不回復（需 Admin 手動重新執行）
- `total_count` 為 0（空表）：任務正常完成，`progress_percent = 100`，`extracted_count = 0`
- 增量模式下 `last_incremental_value` 更新：成功完成後更新為本次擷取的最後增量值
- 動態建表失敗（如 metadata 讀取失敗，或 `source_schema` / `source_table` 在外部資料庫中不存在）：任務 `status` 設為 `failed`，ExtractionLog 記錄錯誤訊息（參見 error-handling.md#extraction-errors）
- 批次寫入中某批次失敗：已寫入的批次資料保留，任務 `status` 設為 `failed`，`extracted_count` 反映實際已寫入筆數
- 來源表結構與現有 raw data 表不匹配（來源表欄位變更）：系統嘗試 DROP + 重建 raw data 表；若重建失敗則標記 `failed`

## 8. API 規格

### POST /api/v1/extraction-tasks/:id/run

**Request Headers:**

| Header        | 值                       | 必填 |
|---------------|--------------------------|------|
| Authorization | Bearer {token}           | 是   |
| Content-Type  | application/json         | 是   |

**Request Body:**

```json
{
  "triggeredBy": "manual | retry"
}
```

**Response — 202 Accepted:**

```json
{
  "id": "uuid (ExtractionLog ID)",
  "taskId": "uuid",
  "status": "running",
  "startedAt": "ISO 8601",
  "triggeredBy": "manual | retry",
  "createdBy": "uuid"
}
```

**錯誤回應：**

| HTTP Status | 錯誤碼                 | 說明                               |
|-------------|------------------------|------------------------------------|
| 404         | EXTRACTION_NOT_FOUND   | 擷取任務不存在或已刪除             |
| 409         | EXTRACTION_RUNNING     | 任務正在執行中，無法重複觸發       |
| 403         | AUTH_FORBIDDEN         | 非 Admin 角色無權限操作            |
| 401         | AUTH_TOKEN_MISSING     | 未登入或 Token 無效                |
| 500         | SYSTEM_INTERNAL_ERROR  | 伺服器內部錯誤                     |

## 9. 商業規則

| 規則編號 | 說明 |
|----------|------|
| BR-1 | 僅具備 Admin 角色的使用者可手動觸發執行 |
| BR-2 | `status` 為 `running` 的任務不允許重複觸發 |
| BR-3 | 手動觸發不受 `enabled` 限制（即使停用的任務也可手動執行） |
| BR-4 | 執行流程為非同步：API 立即回傳 `202 Accepted`，擷取作業在背景執行 |
| BR-5 | `triggered_by` 區分觸發方式：`manual`（手動）、`retry`（重新執行） |
| BR-6 | 進度更新：每批次擷取後更新 `extracted_count` 與 `progress_percent` |
| BR-7 | 執行完成後更新 `avg_duration_ms`：`(avg_duration_ms * (execution_count - 1) + duration_ms) / execution_count` |
| BR-8 | 增量模式成功完成後更新 `last_incremental_value` |
| BR-9 | 首次執行時自動建立 raw data 表（`raw_{task_id_short}`），結構從來源表 metadata 推斷 |
| BR-10 | 全量模式每次執行前 TRUNCATE raw data 表，再重新寫入全部資料 |
| BR-11 | 增量模式根據 `incremental_column` 與 `last_incremental_value` 篩選新增資料，追加寫入 |
| BR-12 | 批次寫入使用每批 1,000 筆 INSERT（可透過 `EXTRACTION_BATCH_SIZE` 環境變數配置） |
| BR-13 | raw data 表名由系統自動生成（`raw_{task_id 前 8 碼}`），不接受使用者輸入，確保 SQL Injection 安全 |

## 10. UI/UX 需求

- 「立即執行」按鈕：適用於 `scheduled`、`completed` 狀態
- 「重新執行」按鈕：適用於 `failed` 狀態，出現在任務清單與日誌面板
- 執行中顯示進度條（藍色 #3B82F6）與已擷取筆數
- 執行中任務的「立即執行」按鈕為停用狀態
- 前端透過 Polling（建議 3 秒間隔）取得進度更新
- 執行完成後進度條消失，顯示最終狀態

## 11. 錯誤場景

| 場景                         | 系統回應                                             | 參考                                    |
|------------------------------|------------------------------------------------------|-----------------------------------------|
| 任務正在執行中               | HTTP 409，「任務正在執行中，請等待完成」             | error-handling.md#extraction-errors      |
| 任務不存在                   | HTTP 404，「找不到指定的擷取任務」                   | error-handling.md#extraction-errors      |
| 擷取過程中連線失敗           | 任務 status 設為 failed，ExtractionLog 記錄錯誤      | error-handling.md#extraction-errors      |
| 動態建表失敗                 | 任務 status 設為 failed，記錄 EXTRACTION_TABLE_CREATE_FAILED | error-handling.md#extraction-errors |
| 批次寫入失敗                 | 任務 status 設為 failed，已寫入資料保留，記錄 EXTRACTION_BATCH_WRITE_FAILED | error-handling.md#extraction-errors |
| 非 Admin 操作                | HTTP 403，「您沒有權限執行此操作」                   | error-handling.md#auth-errors            |

## 12. 相依性

- **F017（建立擷取任務）**：需有擷取任務存在
- **F022（查看擷取日誌）**：執行後產生日誌
- **F023（排程自動執行）**：共用執行邏輯
- **F026（查看擷取資料預覽）**：需有 raw data 存在才能預覽
- **認證系統**：需要有效的 Admin 登入 Session/Token

## 13. 資料需求

- ExtractionTask 實體：參見 [data-model.md#extraction-task-entity](../data-model.md#extraction-task-entity)
- ExtractionLog 實體：參見 [data-model.md#extraction-log-entity](../data-model.md#extraction-log-entity)
- Raw Data 動態表：參見 [data-model.md#raw-data-table](../data-model.md#raw-data-table)

## 14. 交叉參考

- 資料模型：[data-model.md#extraction-task-entity](../data-model.md#extraction-task-entity)、[data-model.md#extraction-log-entity](../data-model.md#extraction-log-entity)、[data-model.md#raw-data-table](../data-model.md#raw-data-table)
- 錯誤處理：[error-handling.md#extraction-errors](../error-handling.md#extraction-errors)
- 相關功能：[F017](F017-create-extraction-task.md)、[F022](F022-view-extraction-logs.md)、[F023](F023-scheduled-extraction.md)、[F024](F024-extraction-dashboard.md)、[F026](F026-preview-raw-data.md)
