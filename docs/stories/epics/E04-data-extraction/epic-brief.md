# Epic Brief：E04 — 資料擷取管理

> **Epic ID**：E04
> **優先級**：P0（Critical）
> **階段**：Phase 1（MVP）
> **Stories 數量**：9

## Epic 目標

讓 Admin 能夠在 CDMP 平台內建立、管理與監控資料擷取任務，支援全量與增量兩種擷取模式，透過排程自動執行或手動觸發，並提供監控儀表板即時追蹤擷取任務的執行狀態與效能。

資料擷取是 CDMP 平台將外部資料來源的資料匯入平台的核心機制，銜接 E03 資料來源管理，為後續資料治理功能提供資料基礎。

## User Stories

| Story ID | 標題 | 優先級 | 檔案 |
|----------|------|--------|------|
| US-030 | 建立擷取任務 | Must Have | [US-030-create-extraction-task.md](US-030-create-extraction-task.md) |
| US-031 | 查看擷取任務清單 | Must Have | [US-031-view-extraction-task-list.md](US-031-view-extraction-task-list.md) |
| US-032 | 編輯擷取任務 | Must Have | [US-032-edit-extraction-task.md](US-032-edit-extraction-task.md) |
| US-033 | 啟用／停用擷取任務 | Must Have | [US-033-toggle-extraction-task.md](US-033-toggle-extraction-task.md) |
| US-034 | 立即執行／重新執行擷取任務 | Must Have | [US-034-run-extraction-task.md](US-034-run-extraction-task.md) |
| US-035 | 查看擷取日誌 | Must Have | [US-035-view-extraction-logs.md](US-035-view-extraction-logs.md) |
| US-036 | 排程自動執行 | Must Have | [US-036-scheduled-extraction.md](US-036-scheduled-extraction.md) |
| US-037 | 擷取監控儀表板 | Should Have | [US-037-extraction-dashboard.md](US-037-extraction-dashboard.md) |
| US-038 | 刪除擷取任務 | Should Have | [US-038-delete-extraction-task.md](US-038-delete-extraction-task.md) |

## 依賴關係

- **依賴**：E01（Admin 必須完成驗證）、E03（必須有資料來源才能建立擷取任務）
- **封鎖下游**：無（此為 MVP 最終 Epic）
- **NFR 關聯**：NFR-002（儀表板效能需求、排程執行效能）

## 資料實體

### ExtractionTask

| 欄位 | 類型 | 說明 |
|------|------|------|
| id | UUID (PK) | 主鍵 |
| name | VARCHAR(255) | 任務名稱（唯一） |
| datasource_id | UUID (FK) | 關聯資料來源 |
| mode | ENUM('full', 'incremental') | 擷取模式 |
| status | ENUM('running', 'scheduled', 'completed', 'failed', 'disabled') | 任務狀態 |
| target_table | VARCHAR(255) | 目標資料表名稱 |
| incremental_column | VARCHAR(255) | 增量欄位名稱（增量模式必填） |
| last_incremental_value | VARCHAR(255) | 最後增量值 |
| schedule | VARCHAR(100) | Cron 表達式 |
| last_execution_at | TIMESTAMP | 最後執行時間 |
| extracted_count | INTEGER | 已擷取筆數 |
| total_count | INTEGER | 總筆數 |
| progress_percent | DECIMAL(5,2) | 進度百分比 |
| avg_duration_ms | INTEGER | 平均執行時間（毫秒） |
| execution_count | INTEGER | 累計執行次數 |
| error_message | TEXT | 最後錯誤訊息 |
| enabled | BOOLEAN | 是否啟用（預設 true） |
| created_by | UUID (FK) | 建立者 |
| created_at | TIMESTAMP | 建立時間 |
| updated_at | TIMESTAMP | 更新時間 |
| deleted_at | TIMESTAMP | 軟刪除時間 |

### ExtractionLog

| 欄位 | 類型 | 說明 |
|------|------|------|
| id | UUID (PK) | 主鍵 |
| task_id | UUID (FK) | 關聯擷取任務 |
| status | ENUM('running', 'completed', 'failed') | 執行狀態 |
| started_at | TIMESTAMP | 開始時間 |
| finished_at | TIMESTAMP | 結束時間 |
| duration_ms | INTEGER | 執行時間（毫秒） |
| extracted_count | INTEGER | 擷取筆數 |
| total_count | INTEGER | 總筆數 |
| error_message | TEXT | 錯誤訊息 |
| triggered_by | ENUM('schedule', 'manual', 'retry') | 觸發方式 |
| created_by | UUID (FK) | 執行者 |

## 成功標準

- Admin 能夠建立包含所有必要參數的擷取任務
- Admin 能夠查看、編輯、刪除擷取任務
- Admin 能夠啟用／停用擷取任務
- Admin 能夠手動觸發執行或重新執行失敗任務
- 排程引擎能自動依 cron 表達式執行已啟用任務
- 監控儀表板提供執行狀態與效能的即時總覽
- 擷取日誌完整記錄每次執行的詳細資訊

## 待解決問題

- [x] 擷取任務刪除應為軟刪除還是硬刪除？ → **軟刪除，設定 `deleted_at` 時間戳記，日誌保留**
- [x] 執行趨勢圖預設顯示範圍？ → **預設 7 天，可切換 14 天 / 30 天**
- [x] 排程引擎實作方式？ → **擴展現有 @nestjs/schedule 模組**
