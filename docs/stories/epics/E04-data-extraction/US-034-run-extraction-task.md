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
  3. 執行擷取作業（非同步）
  4. 執行完成後更新 ExtractionLog 與 ExtractionTask
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

---

## 依賴關係

- **Blocked By**：US-030（需有擷取任務存在）
- **Blocks**：US-035（執行後才有日誌可查看）、US-036（排程共用執行邏輯）、US-037（儀表板依賴執行資料）

---

## Definition of Done

- [ ] 「立即執行」與「重新執行」按鈕 UI
- [ ] 執行中狀態的進度條顯示
- [ ] 執行中任務禁止重複觸發
- [ ] 後端非同步執行擷取作業
- [ ] ExtractionLog 記錄完整的執行資訊
- [ ] 執行完成後正確更新任務狀態與日誌
- [ ] 前端 Polling 機制更新進度
- [ ] 成功／錯誤回饋訊息正確顯示
- [ ] 所有驗收標準的單元測試通過

---

## 相關文件

- **Epic Brief**：[E04 Epic Brief](epic-brief.md)
- **相關 Stories**：US-030、US-035、US-036、US-037
