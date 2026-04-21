# Epic Brief：E07 — 客戶名單分派

> **Epic ID**：E07
> **優先級**：P0（Critical）
> **類型**：下游應用
> **階段**：Phase 1（MVP）
> **Stories 數量**：18

## Epic 目標

讓業務主管（Sales Manager）能夠**獨立完成客戶名單分派全流程**，從條件設定、計分維度調整、部門與人員比例配置，到觸發月跑、查看結果、匯出清單，以及回顧歷史快照比對差異，**全程無需 IT 介入**。

現行系統由 IT 人員手動執行 SQL Stored Procedure，業務主管無可視化介面、無法自助調整參數、亦無執行快照可追溯。本 Epic 將上述流程完整搬移至 CDMP 平台，提供五個配置面板（名單定義 / 計分設定 / 分派比例 / 分派執行 / 快照歷史），讓業務主管在每月作業週期內自助完成所有操作。

## User Stories

### M01 — 名單定義

| Story ID | 標題 | 優先級 | 檔案 |
|----------|------|--------|------|
| US-070 | 查看本月名單定義清單 | Must Have | [US-070-M01-view-list-definition.md](US-070-M01-view-list-definition.md) |
| US-071 | Stage 0 每日分派數量估算 | Must Have | [US-071-M01-stage0-daily-estimate.md](US-071-M01-stage0-daily-estimate.md) |

### M02 — 計分設定

| Story ID | 標題 | 優先級 | 檔案 |
|----------|------|--------|------|
| US-072 | 查看計分維度設定 | Must Have | [US-072-M02-view-scoring-dimensions.md](US-072-M02-view-scoring-dimensions.md) |
| US-073 | 編輯計分維度與分數 | Must Have | [US-073-M02-edit-scoring-dimension.md](US-073-M02-edit-scoring-dimension.md) |
| US-074 | 編輯 CARD_LEVEL 分級門檻 | Must Have | [US-074-M02-edit-card-level-thresholds.md](US-074-M02-edit-card-level-thresholds.md) |
| US-075 | 編輯 TIER_LEVEL 對應表 | Must Have | [US-075-M02-edit-tier-mapping.md](US-075-M02-edit-tier-mapping.md) |

### M03 — 分派比例

| Story ID | 標題 | 優先級 | 檔案 |
|----------|------|--------|------|
| US-076 | 查看部門比例設定 | Must Have | [US-076-M03-view-dept-ratio.md](US-076-M03-view-dept-ratio.md) |
| US-077 | 編輯部門比例設定 | Must Have | [US-077-M03-edit-dept-ratio.md](US-077-M03-edit-dept-ratio.md) |
| US-078 | 查看人員比例設定 | Must Have | [US-078-M03-view-personnel-ratio.md](US-078-M03-view-personnel-ratio.md) |
| US-079 | 編輯人員比例設定 | Must Have | [US-079-M03-edit-personnel-ratio.md](US-079-M03-edit-personnel-ratio.md) |
| US-080 | 開關 CR 回分規則 | Must Have | [US-080-M03-toggle-cr-reassignment.md](US-080-M03-toggle-cr-reassignment.md) |

### M04 — 分派執行

| Story ID | 標題 | 優先級 | 檔案 |
|----------|------|--------|------|
| US-081 | 觸發分派月跑 | Must Have | [US-081-M04-trigger-assignment-run.md](US-081-M04-trigger-assignment-run.md) |
| US-082 | 查看分派執行進度 | Must Have | [US-082-M04-view-run-progress.md](US-082-M04-view-run-progress.md) |
| US-083 | 查看分派結果摘要 | Must Have | [US-083-M04-view-run-result-summary.md](US-083-M04-view-run-result-summary.md) |
| US-084 | 匯出分派結果 | Must Have | [US-084-M04-export-assignment-result.md](US-084-M04-export-assignment-result.md) |

### M05 — 快照歷史

| Story ID | 標題 | 優先級 | 檔案 |
|----------|------|--------|------|
| US-085 | 查看歷史執行紀錄清單 | Must Have | [US-085-M05-view-run-history-list.md](US-085-M05-view-run-history-list.md) |
| US-086 | 查看執行快照詳情 | Must Have | [US-086-M05-view-run-snapshot-detail.md](US-086-M05-view-run-snapshot-detail.md) |
| US-087 | 比對兩次執行結果差異 | Should Have | [US-087-M05-compare-run-results.md](US-087-M05-compare-run-results.md) |

## 依賴關係

- **依賴**：E01（驗證登入，業務主管須通過身分驗證）、E02（帳號角色管理，需定義業務主管角色及其存取權限）
- **封鎖下游**：無
- **NFR 關聯**：NFR-003（分派執行效能）、NFR-004（快照原子性）、NFR-005（結果準確性）

## 關鍵資料實體

### AssignmentRun（分派月跑紀錄）

| 欄位 | 類型 | 說明 |
|------|------|------|
| run_id | UUID (PK) | 執行唯一識別碼 |
| ym | VARCHAR(6) | 作業年月（YYYYMM） |
| status | ENUM('pending','running','completed','failed') | 執行狀態 |
| triggered_by | UUID (FK) | 觸發者帳號 |
| triggered_at | TIMESTAMP | 觸發時間 |
| completed_at | TIMESTAMP | 完成時間 |
| total_count | INTEGER | 總分派筆數 |
| error_message | TEXT | 錯誤訊息（失敗時填入） |

### AssignmentRunSnapshot（執行快照）

| 欄位 | 類型 | 說明 |
|------|------|------|
| run_id | UUID (FK) | 關聯月跑 |
| snapshot_type | ENUM('config','input_list','result') | 快照類型 |
| payload | JSONB | 快照內容 |
| created_at | TIMESTAMP | 快照時間 |

### 既有 OB 相關表（唯讀參照）

| 表名 | 說明 | 參照 Story |
|------|------|-----------|
| OBMDEPTPCT | 部門比例設定 | US-076、US-077 |
| OBMLISTDF | 名單定義（Stage 條件） | US-070、US-071 |
| OBLEVELCARD_VERSION | 計分版本管理 | US-072、US-073 |
| OBLEVELCARD_COLUNM | 計分維度欄位定義 | US-073 |
| OBLEVELCARD_SCORE | 計分維度分數設定 | US-073 |
| OBLEVELCARD_LEVEL | CARD_LEVEL 分級設定 | US-074 |
| OBPOOLDATA | 案件池（OB 月跑輸入案件清單） | US-081（Stage 1 讀取） |
| OBPOOLDATA_LIST | per-LIST_NO 案件池 / 分派結果寫回表（OB_DEPT、OB_EMPLID） | US-081（Stage 3/4 寫入）、US-083、US-086 |
| OBEMPLSETMF | 人員比例設定（業務員 RATION） | US-078、US-079、US-081 |

## 成功標準

1. 業務主管能夠在不需要 IT 協助的情況下，完成每月名單分派全流程
2. 執行月跑後，系統產生唯一 `run_id`，三份快照（條件設定 / 輸入清單 / 結果明細）原子性寫入，可完整追溯
3. 新系統分派結果與舊系統 Stored Procedure 結果誤差 < 3%（以件數計算）
4. 五個配置面板（M01 ~ M05）全部可操作，無任何功能需跳出至資料庫工具
5. 歷史快照支援任意兩次執行的差異比對，業務主管可清楚看出人員配置或參數變動的影響

## 待解決問題

（需求訪談階段已全部釐清，無待解問題）
