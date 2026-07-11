# NFR-004：快照原子性

> **NFR ID**：NFR-004
> **分類**：Data Integrity
> **優先級**：P0
> **適用 Epic**：E07 — 客戶名單分派

---

## 需求說明

每次月名單分派完成時，系統必須寫入三份快照（設定快照 / 輸入名單快照 / 結果快照）至 AssignmentRunSnapshot 表。三份快照必須在同一 database transaction 中完成寫入，確保資料一致性——不允許出現「結果快照存在但設定快照缺失」等部分寫入狀態，以保障歷史追溯與稽核的完整性。

---

## 量化標準

| 要求 | 標準 |
|------|------|
| 快照完整性 | 任一 run_id 要麼擁有三份快照（config + input_list + result），要麼一份都沒有（失敗回滾） |
| Transaction 隔離層級 | READ COMMITTED 以上，避免部分寫入可見 |
| 快照不可修改性 | AssignmentRunSnapshot 記錄一旦寫入，不允許 UPDATE 或 DELETE |
| 資料保留期限 | 快照資料保留至少 36 個月，超過後依保留政策歸檔 |

---

## 驗收標準

### AC-1：原子性寫入

- **Given** 月名單分派所有 Stage 執行完成
- **When** 系統開始寫入三份快照
- **Then** 三份快照在同一 transaction 中寫入；若任一快照寫入失敗，整個 transaction 回滾，AssignmentRun status 標記為 'failed'
- **And** 不允許出現 run_id 只有部分快照的記錄

### AC-2：快照不可修改

- **Given** 快照已成功寫入
- **When** 任何使用者或系統程序嘗試修改快照記錄
- **Then** 資料庫層拒絕修改操作（透過 trigger 或應用層防護）

### AC-3：快照完整性驗證

- **Given** 系統定期執行健康檢查
- **When** 健康檢查掃描 AssignmentRunSnapshot
- **Then** 任何 status = 'completed' 的 AssignmentRun 均擁有三份對應快照；若發現不一致，記錄告警日誌

---

## 影響的 Stories

| Story ID | Story 名稱 | 影響說明 |
|----------|-----------|---------|
| US-081 | 觸發分派月名單分派 | 快照寫入的核心實作 |
| US-086 | 查看執行快照詳情 | 依賴快照完整性才能顯示三份分頁 |
| US-087 | 比對兩次執行結果差異 | 依賴兩次月名單分派各自的快照完整性 |

---

## 驗證方法

1. **單元測試**：模擬第三份快照寫入失敗，驗證 transaction 回滾且前兩份快照未持久化
2. **整合測試**：執行完整月名單分派，驗證 completed 月名單分派恰好有三份對應快照
3. **資料庫層驗證**：確認 AssignmentRunSnapshot 無 UPDATE / DELETE 權限（或有 trigger 攔截）

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](../epics/E07-app-customer-list-assignment/epic-brief.md)
- **相關 NFR**：[NFR-003](NFR-003-assignment-execution-perf.md)（快照寫入時間受效能 NFR 約束）、[NFR-005](NFR-005-result-accuracy.md)（快照是準確性驗證的資料來源）
