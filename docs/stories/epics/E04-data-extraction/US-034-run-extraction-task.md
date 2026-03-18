# US-034：立即執行／重新執行擷取任務

> **Story ID**：US-034
> **Epic**：[E04 — 資料擷取管理](epic-brief.md)
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：5

---

## User Story

**As a** Admin（管理者）
**I want** 手動觸發擷取任務的執行，或重新執行失敗的任務
**So that** 我可以即時取得資料，或在任務失敗後快速重試

---

## 驗收標準

### AC-1：手動觸發執行
- **Given** Admin 在擷取任務清單頁面，某任務 status 為 `scheduled` 或 `completed` 或 `failed`
- **When** Admin 點擊該任務的「立即執行」按鈕
- **Then** 系統將該任務 status 設為 `running`，建立一筆 ExtractionLog（triggered_by = 'manual'），開始執行擷取作業

### AC-2：重新執行失敗任務
- **Given** Admin 在擷取任務清單或日誌中，某任務最近一次執行為 `failed`
- **When** Admin 點擊「重新執行」按鈕
- **Then** 系統將該任務 status 設為 `running`，建立一筆 ExtractionLog（triggered_by = 'retry'），重新開始擷取作業

### AC-3：執行進度追蹤
- **Given** 擷取任務正在執行中
- **When** Admin 查看該任務
- **Then** 系統顯示進度條（基於 extracted_count / total_count），即時更新擷取筆數與進度百分比

### AC-4：執行中不可重複觸發
- **Given** 某擷取任務的 status 為 `running`
- **When** Admin 嘗試再次觸發該任務
- **Then** 系統顯示「任務正在執行中，請等待完成」的提示訊息

### AC-5：執行完成更新狀態
- **Given** 擷取任務執行中
- **When** 擷取作業完成（成功或失敗）
- **Then** 系統更新任務 status（`completed` 或 `failed`）、`last_execution_at`、`extracted_count`、`error_message`（若失敗），同時更新對應的 ExtractionLog 記錄

### AC-6：擷取資料真正寫入 AppDB
- **Given** 擷取任務執行成功
- **When** 擷取作業完成
- **Then** 系統確認 CDMP AppDB 中的對應 raw data 表（`raw_{task_id_short}`）已包含從外部資料來源讀取的實際資料，筆數與 `extracted_count` 一致

### AC-7：AppDB raw data 表不存在時自動建立
- **Given** 某擷取任務的 AppDB raw data 表尚未建立（首次執行）
- **When** 擷取作業啟動
- **Then** 系統自動讀取外部來源表的欄位 metadata，於 AppDB 建立對應結構的 raw data 表，再執行資料寫入

---

## Technical Notes

- 立即執行端點：`POST /api/v1/extraction-tasks/:id/run`
- Request body：`{ "triggeredBy": "manual" | "retry" }`
- Response：`202 Accepted`，回傳 ExtractionLog 物件
- 當 `status` 為 `running` 時，API 回傳 `409 Conflict`
- 當 `enabled` 為 `false` 時，手動執行仍允許（僅排程不觸發停用任務）
- 執行流程：
  1. 建立 ExtractionLog（status = 'running'）
  2. 更新 ExtractionTask（status = 'running'）
  3. 檢查 AppDB 是否已有對應的 raw data 表（`raw_{task_id_short}`）
     - 若不存在：連線至外部資料來源，讀取來源表（`source_table`）的欄位 metadata，於 AppDB 建立同結構的 raw data 表
     - 若已存在：使用現有表（全量模式：先 TRUNCATE 再寫入；增量模式：追加寫入）
  4. 批次讀取外部來源資料，寫入 AppDB raw data 表（建議批次大小：1,000 筆/批）
  5. 每批次完成後更新 `extracted_count` 與 `progress_percent`
  6. 全部批次完成後更新 ExtractionLog（status = 'completed'）與 ExtractionTask（status = 'completed'）
  7. 如任一步驟失敗：更新 ExtractionLog（status = 'failed', error_message）與 ExtractionTask（status = 'failed'）
- **動態建表命名規則**：`raw_{task_id 前 8 碼}`（例如：task id 為 `a3f2c1d4-...`，則表名為 `raw_a3f2c1d4`）
- **全量模式 vs 增量模式**：
  - 全量（full）：每次執行前 TRUNCATE raw data 表，再重新寫入全部資料
  - 增量（incremental）：根據 `incremental_column` 與 `last_incremental_value` 篩選新增資料，追加寫入
- **批次寫入策略**：使用批次 INSERT（每批 1,000 筆），避免大量資料導致記憶體耗盡或資料庫逾時
- 進度更新：每批次擷取後更新 `extracted_count` 與 `progress_percent`
- 前端透過 Polling（建議 3 秒間隔）取得進度更新
- 時區處理：後端儲存 UTC 時間，前端顯示時轉換為 UTC+8（Asia/Taipei）

---

## 測試案例

| # | 測試案例 | 預期結果 |
|---|---------|---------|
| 1 | 手動觸發 scheduled 任務 | 狀態變更為 running，建立日誌 |
| 2 | 手動觸發 completed 任務 | 狀態變更為 running，建立日誌 |
| 3 | 重新執行 failed 任務 | triggered_by 為 retry，建立日誌 |
| 4 | 嘗試觸發 running 任務 | 顯示「任務正在執行中」 |
| 5 | 手動觸發已停用任務 | 允許執行（手動不受停用限制） |
| 6 | 執行中查看進度 | 進度條正確顯示百分比 |
| 7 | 執行成功後 | status 變為 completed，日誌更新 |
| 8 | 執行失敗後 | status 變為 failed，記錄錯誤訊息 |
| 9 | 非 Admin 嘗試執行 | 回傳 403 Forbidden |
| 10 | 首次執行（raw data 表不存在） | AppDB 自動建立 `raw_{task_id_short}` 表，資料正確寫入 |
| 11 | 全量任務第二次執行 | raw data 表先 TRUNCATE 再重新寫入，筆數正確 |
| 12 | 增量任務執行 | 僅寫入 `incremental_column` > `last_incremental_value` 的新資料 |
| 13 | 大量資料（>10,000 筆）執行 | 批次寫入正確完成，`extracted_count` 累計正確 |

---

## 依賴關係

- **Blocked By**：US-030（需有擷取任務存在）
- **Blocks**：US-035（執行後才有日誌可查看）、US-036（排程共用執行邏輯）、US-037（儀表板依賴執行資料）、US-039（需有 raw data 才能預覽）

---

## Definition of Done

- [ ] 「立即執行」與「重新執行」按鈕 UI
- [ ] 執行中狀態的進度條顯示
- [ ] 執行中任務禁止重複觸發
- [ ] 後端非同步執行擷取作業
- [ ] 動態建表邏輯：首次執行時讀取來源表 metadata 並於 AppDB 建立 `raw_{task_id_short}` 表
- [ ] 全量模式：執行前 TRUNCATE raw data 表
- [ ] 增量模式：根據 incremental_column 篩選並追加寫入
- [ ] 批次 INSERT 寫入（建議每批 1,000 筆）
- [ ] ExtractionLog 記錄完整的執行資訊
- [ ] 執行完成後正確更新任務狀態與日誌
- [ ] 前端 Polling 機制更新進度
- [ ] 成功／錯誤回饋訊息正確顯示
- [ ] 所有驗收標準的單元測試通過

---

## 相關文件

- **Epic Brief**：[E04 Epic Brief](epic-brief.md)
- **相關 Stories**：US-030、US-035、US-036、US-037
