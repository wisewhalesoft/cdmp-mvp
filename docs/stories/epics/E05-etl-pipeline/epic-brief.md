# Epic Brief：E05 — ETL Pipeline 管理

> **Epic ID**：E05
> **優先級**：P0（Critical）
> **階段**：Phase 1（MVP）
> **Stories 數量**：17

## Epic 目標

讓 Admin 能夠在 CDMP 平台內建立、管理與監控 ETL Pipeline，透過視覺化拖拉編輯器組合 Extract / Transform（13 種轉換節點）/ Load 節點，將資料擷取任務產生的 raw data 經過轉換處理後，載入到 Domain-Oriented 的目標表（Customer Core / Interaction / Financial / Service）。

Pipeline 支援三階段發布流程（草稿 → 測試執行 → 發布）、版本管理（含 Diff 比對與回滾）、排程自動執行，並提供監控儀表板即時追蹤執行狀態、趨勢與效能。

## User Stories

| Story ID | 標題 | 優先級 | 檔案 |
|----------|------|--------|------|
| US-040 | 查看 Pipeline 列表 | Must Have | [US-040-pipeline-list.md](US-040-pipeline-list.md) |
| US-041 | 建立 Pipeline | Must Have | [US-041-create-pipeline.md](US-041-create-pipeline.md) |
| US-042 | 視覺化轉換編輯器 | Must Have | [US-042-pipeline-editor.md](US-042-pipeline-editor.md) |
| US-043 | 執行 Pipeline | Must Have | [US-043-execute-pipeline.md](US-043-execute-pipeline.md) |
| US-044 | 啟用／停用 Pipeline | Must Have | [US-044-toggle-pipeline.md](US-044-toggle-pipeline.md) |
| US-045 | 查看 Pipeline 日誌 | Must Have | [US-045-pipeline-logs.md](US-045-pipeline-logs.md) |
| US-046 | Pipeline 版本管理 | Should Have | [US-046-pipeline-version.md](US-046-pipeline-version.md) |
| US-047 | 刪除 Pipeline | Should Have | [US-047-delete-pipeline.md](US-047-delete-pipeline.md) |
| US-048 | Pipeline 監控儀表板 | Should Have | [US-048-monitor-dashboard.md](US-048-monitor-dashboard.md) |
| US-049 | 目標表 Domain-Oriented 規劃 | Could Have | [US-049-target-tables.md](US-049-target-tables.md) |
| US-050 | 發布 Pipeline 版本 | Must Have | [US-050-publish-pipeline-version.md](US-050-publish-pipeline-version.md) |
| US-052 | 節點欄位變化統計 Badge | Must Have | [US-052-node-column-change-badge.md](US-052-node-column-change-badge.md) |
| US-053 | 節點 Inspector Panel 欄位 Diff | Should Have | [US-053-node-inspector-panel-diff.md](US-053-node-inspector-panel-diff.md) |
| US-054 | 節點 Badge Hover Tooltip | Could Have | [US-054-node-badge-hover-tooltip.md](US-054-node-badge-hover-tooltip.md) |
| US-055 | ETL 執行引擎核心框架 | Must Have | [US-055-etl-execution-engine-core.md](US-055-etl-execution-engine-core.md) |
| US-056 | ETL 節點實作 — Extract、Merge、Dedup、TypeCast、DerivedField | Must Have | [US-056-etl-nodes-extract-merge-dedup.md](US-056-etl-nodes-extract-merge-dedup.md) |
| US-057 | ETL 節點實作 — FieldMapping、Conditional、TargetLoad | Must Have | [US-057-etl-nodes-mapping-conditional-load.md](US-057-etl-nodes-mapping-conditional-load.md) |

## 依賴關係

- **依賴**：E01（Admin 必須完成驗證）、E04（必須有資料擷取任務產生 raw data）
- **封鎖下游**：無（後續可作為 CDP 分析與行銷模組的資料基礎）
- **NFR 關聯**：NFR-002（儀表板效能需求、Pipeline 執行效能）

## 資料實體

### EtlPipeline

| 欄位 | 類型 | 說明 |
|------|------|------|
| id | UUID (PK) | 主鍵 |
| name | VARCHAR(255) | Pipeline 名稱（唯一） |
| description | TEXT | Pipeline 描述 |
| version | INTEGER | 當前版本號（從 1 起算） |
| step_count | INTEGER | 節點步驟數 |
| status | ENUM('draft', 'active', 'running', 'failed', 'disabled') | Pipeline 狀態 |
| schedule | VARCHAR(100) | Cron 表達式 |
| last_execution_at | TIMESTAMP | 最後執行時間 |
| next_execution_at | TIMESTAMP | 下次排程時間 |
| processed_count | INTEGER | 累計處理筆數 |
| avg_duration_ms | INTEGER | 平均執行時間（毫秒） |
| execution_count | INTEGER | 累計執行次數 |
| enabled | BOOLEAN | 是否啟用（預設 false） |
| created_by | UUID (FK) | 建立者 |
| created_at | TIMESTAMP | 建立時間 |
| updated_at | TIMESTAMP | 更新時間 |
| deleted_at | TIMESTAMP | 軟刪除時間 |

### EtlPipelineVersion

| 欄位 | 類型 | 說明 |
|------|------|------|
| id | UUID (PK) | 主鍵 |
| pipeline_id | UUID (FK) | 關聯 Pipeline |
| version | INTEGER | 版本號 |
| definition | JSONB | Pipeline 定義（節點與連線的完整結構） |
| status | ENUM('draft', 'testing', 'published') | 版本狀態 |
| change_summary | VARCHAR(500) | 變更摘要 |
| created_by | UUID (FK) | 建立者 |
| created_at | TIMESTAMP | 建立時間 |

### EtlPipelineLog

| 欄位 | 類型 | 說明 |
|------|------|------|
| id | UUID (PK) | 主鍵 |
| pipeline_id | UUID (FK) | 關聯 Pipeline |
| version | INTEGER | 執行時的版本號 |
| status | ENUM('running', 'completed', 'failed') | 執行狀態 |
| started_at | TIMESTAMP | 開始時間 |
| finished_at | TIMESTAMP | 結束時間 |
| duration_ms | INTEGER | 執行時間（毫秒） |
| processed_count | INTEGER | 處理筆數 |
| error_message | TEXT | 錯誤訊息 |
| node_logs | JSONB | 各節點的詳細執行記錄 |
| triggered_by | ENUM('schedule', 'manual', 'test', 'retry') | 觸發方式 |
| is_test_run | BOOLEAN | 是否為測試執行 |
| created_by | UUID (FK) | 執行者 |

### 目標表（Domain-Oriented）

| 目標表 | 說明 | 表名 |
|--------|------|------|
| Customer Core | 身分 / 主檔 | customer_core |
| Customer Interaction | 行為 / 接觸 | customer_interaction |
| Customer Financial | 交易 / 風控 | customer_financial |
| Customer Service | 客服 / 申訴 | customer_service |

## 成功標準

- Admin 能夠建立、查看、編輯、刪除 Pipeline
- Admin 能夠透過視覺化拖拉編輯器組合 ETL 節點，並透過節點底部 Badge 一眼掌握欄位轉換變化
- Pipeline 支援草稿 → 測試執行 → 發布的三階段流程
- Admin 能夠手動或排程執行已發布的 Pipeline
- Admin 能夠查看版本歷史、比較差異、回滾版本
- 監控儀表板提供即時執行狀態、趨勢與效能資訊
- Pipeline 日誌完整記錄每次執行的詳細資訊（含各節點）
- 目標表採用 Domain-Oriented 設計，系統預先定義 schema

## 待解決問題

- [x] 版本管理範疇？ → **完整：查看 + Diff + 回滾**
- [x] 發布流程？ → **草稿 → 測試執行 → 發布（三階段）**
- [x] 目標表管理方式？ → **系統預先定義 schema，Load 節點直接選擇**
- [x] 草稿可否執行？ → **允許手動測試執行，標記為 test_run，不被排程觸發**
- [x] 目標表規劃方法？ → **Domain-Oriented 設計（非完整 Data Mesh）**
- [x] 如何將版本狀態推進到 published？ → **新增 US-050（發布 Pipeline 版本）實作 F037，補全 draft → testing → published 最後一步**
