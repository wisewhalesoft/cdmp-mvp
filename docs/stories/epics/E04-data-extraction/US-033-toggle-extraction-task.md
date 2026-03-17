# US-033：啟用／停用擷取任務

> **Story ID**：US-033
> **Epic**：[E04 — 資料擷取管理](epic-brief.md)
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：2

---

## User Story

**As a** Admin（管理者）
**I want** 啟用或停用擷取任務
**So that** 我可以暫停不需要執行的任務，待需要時再重新啟用

---

## 驗收標準

### AC-1：停用擷取任務
- **Given** Admin 在擷取任務清單頁面，某任務目前為啟用狀態
- **When** Admin 點擊該任務的「停用」按鈕並確認
- **Then** 系統將該任務的 `enabled` 設為 `false`，`status` 設為 `disabled`，顯示成功訊息，排程不再觸發該任務

### AC-2：啟用擷取任務
- **Given** Admin 在擷取任務清單頁面，某任務目前為停用狀態
- **When** Admin 點擊該任務的「啟用」按鈕
- **Then** 系統將該任務的 `enabled` 設為 `true`，`status` 設為 `scheduled`，顯示成功訊息，排程恢復觸發該任務

### AC-3：確認對話框
- **Given** Admin 點擊「停用」按鈕
- **When** 確認對話框顯示
- **Then** 對話框顯示任務名稱與停用影響說明（「停用後排程將不再自動觸發此任務」），Admin 可選擇「確認停用」或「取消」

### AC-4：執行中任務不可停用
- **Given** 某擷取任務的 status 為 `running`
- **When** Admin 嘗試停用該任務
- **Then** 系統顯示「任務執行中，請等待完成後再停用」的提示訊息

---

## Technical Notes

- 端點：`PATCH /api/v1/extraction-tasks/:id/toggle`
- Request body：`{ "enabled": true | false }`
- Response：`200 OK`，回傳更新後的 ExtractionTask 物件
- 停用時：`enabled = false`, `status = 'disabled'`
- 啟用時：`enabled = true`, `status = 'scheduled'`
- 當 `status` 為 `running` 時，API 回傳 `409 Conflict`
- 排程引擎在觸發前需檢查 `enabled` 狀態

---

## 測試案例

| # | 測試案例 | 預期結果 |
|---|---------|---------|
| 1 | 停用已啟用的任務 | 狀態變更為 disabled，排程不觸發 |
| 2 | 啟用已停用的任務 | 狀態變更為 scheduled，排程恢復 |
| 3 | 停用時顯示確認對話框 | 顯示任務名稱與影響說明 |
| 4 | 確認對話框點擊「取消」 | 任務狀態不變 |
| 5 | 嘗試停用執行中任務 | 顯示錯誤提示 |
| 6 | 非 Admin 嘗試操作 | 回傳 403 Forbidden |

---

## 依賴關係

- **Blocked By**：US-030（需有擷取任務存在）
- **Blocks**：無

---

## Definition of Done

- [ ] 啟用／停用按鈕依目前狀態動態切換
- [ ] 停用確認對話框含任務名稱與影響說明
- [ ] 執行中任務的停用按鈕為停用狀態
- [ ] 後端 API 端點含狀態更新邏輯
- [ ] 執行中任務回傳 409 Conflict
- [ ] 成功／錯誤回饋訊息正確顯示
- [ ] 所有驗收標準的單元測試通過

---

## 相關文件

- **Epic Brief**：[E04 Epic Brief](epic-brief.md)
- **相關 Stories**：US-030、US-036
