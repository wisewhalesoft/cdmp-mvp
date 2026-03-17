# US-038：刪除擷取任務

> **Story ID**：US-038
> **Epic**：[E04 — 資料擷取管理](epic-brief.md)
> **優先級**：Should Have
> **階段**：Phase 1（MVP）
> **預估點數**：2

---

## User Story

**As a** Admin（管理者）
**I want** 刪除不再需要的擷取任務
**So that** 任務清單保持簡潔，僅顯示有效的任務

---

## 驗收標準

### AC-1：成功刪除擷取任務
- **Given** Admin 在擷取任務清單頁面
- **When** Admin 點擊某任務的「刪除」按鈕並確認
- **Then** 系統執行軟刪除（設定 `deleted_at` 時間戳記），該任務從清單中移除，顯示成功訊息

### AC-2：確認對話框
- **Given** Admin 點擊「刪除」按鈕
- **When** 確認對話框顯示
- **Then** 對話框顯示任務名稱與刪除影響說明（「刪除後此任務將停止排程執行，但歷史日誌將保留」），Admin 可選擇「確認刪除」或「取消」

### AC-3：執行中不可刪除
- **Given** 某擷取任務的 status 為 `running`
- **When** Admin 嘗試刪除該任務
- **Then** 系統顯示「任務執行中，無法刪除」的提示訊息，刪除按鈕為停用狀態

### AC-4：日誌保留
- **Given** 某擷取任務已被軟刪除
- **When** 查詢該任務的 ExtractionLog
- **Then** 歷史執行日誌仍保留於資料庫中（不隨任務刪除而清除）

---

## Technical Notes

- 端點：`DELETE /api/extraction-tasks/:id`
- Response：`200 OK`，回傳 `{ "message": "擷取任務已刪除" }`
- 軟刪除實作：設定 `deleted_at = NOW()`，不實際刪除資料列
- 當 `status` 為 `running` 時，API 回傳 `409 Conflict`
- 刪除後排程引擎自動排除該任務（篩選條件已包含 `deleted_at IS NULL`）
- ExtractionLog 不受影響，透過 `task_id` 仍可查詢歷史紀錄
- 時區處理：`deleted_at` 後端儲存 UTC 時間

---

## 測試案例

| # | 測試案例 | 預期結果 |
|---|---------|---------|
| 1 | 刪除已停用的任務 | 軟刪除成功，從清單移除 |
| 2 | 刪除 scheduled 狀態的任務 | 軟刪除成功 |
| 3 | 刪除確認對話框 | 顯示任務名稱與影響說明 |
| 4 | 確認對話框點擊「取消」 | 任務不被刪除 |
| 5 | 嘗試刪除執行中任務 | 顯示「任務執行中，無法刪除」 |
| 6 | 刪除後歷史日誌 | ExtractionLog 仍可查詢 |
| 7 | 刪除後排程不觸發 | 排程引擎排除已刪除任務 |
| 8 | 非 Admin 嘗試刪除 | 回傳 403 Forbidden |

---

## 依賴關係

- **Blocked By**：US-030（需有擷取任務存在）、US-031（需從清單進入刪除）
- **Blocks**：無

---

## Definition of Done

- [ ] 刪除按鈕 UI 與確認對話框
- [ ] 執行中任務的刪除按鈕停用
- [ ] 後端軟刪除實作（設定 deleted_at）
- [ ] 執行中任務回傳 409 Conflict
- [ ] 刪除後排程引擎正確排除
- [ ] ExtractionLog 歷史紀錄保留
- [ ] 成功／錯誤回饋訊息正確顯示
- [ ] 所有驗收標準的單元測試通過

---

## 相關文件

- **Epic Brief**：[E04 Epic Brief](epic-brief.md)
- **相關 Stories**：US-030、US-031
