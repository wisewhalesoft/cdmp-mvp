# US-032：編輯擷取任務

> **Story ID**：US-032
> **Epic**：[E04 — 資料擷取管理](epic-brief.md)
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：3

---

## User Story

**As a** Admin（管理者）
**I want** 編輯已建立的擷取任務設定
**So that** 我可以調整任務參數以符合變更的需求

---

## 驗收標準

### AC-1：成功編輯擷取任務
- **Given** Admin 在擷取任務清單頁面
- **When** Admin 點擊某任務的「編輯」按鈕，修改欄位後點擊「儲存」
- **Then** 系統更新擷取任務設定，顯示成功訊息，清單反映最新資料

### AC-2：執行中不可編輯
- **Given** 某擷取任務的 status 為 `running`
- **When** Admin 嘗試編輯該任務
- **Then** 系統顯示「任務執行中，無法編輯」的提示訊息，編輯按鈕為停用狀態

### AC-3：編輯時保留既有欄位值
- **Given** Admin 開啟某任務的編輯表單
- **When** 表單載入完成
- **Then** 所有欄位預先填入該任務的目前設定值

### AC-4：編輯時的欄位驗證
- **Given** Admin 在編輯擷取任務表單
- **When** Admin 修改欄位後提交，有必填欄位為空或格式不合規
- **Then** 系統針對每個不合規欄位顯示具體的驗證錯誤訊息

---

## Technical Notes

- 端點：`PATCH /api/extraction-tasks/:id`
- Request body：僅包含需更新的欄位
  ```json
  {
    "name": "string",
    "datasourceId": "uuid",
    "mode": "full | incremental",
    "targetTable": "string",
    "schedule": "string",
    "incrementalColumn": "string",
    "lastIncrementalValue": "string"
  }
  ```
- Response：`200 OK`，回傳更新後的 ExtractionTask 物件
- 當 `status` 為 `running` 時，API 回傳 `409 Conflict`
- 名稱唯一性驗證需排除自身（`WHERE name = :name AND id != :id`）
- 時區處理：後端儲存 UTC 時間，前端顯示時轉換為 UTC+8（Asia/Taipei）

---

## 測試案例

| # | 測試案例 | 預期結果 |
|---|---------|---------|
| 1 | 編輯任務名稱 | 更新成功 |
| 2 | 變更擷取模式從全量到增量 | 更新成功，增量欄位必填 |
| 3 | 修改 cron 排程 | 更新成功 |
| 4 | 編輯執行中的任務 | 顯示「任務執行中，無法編輯」 |
| 5 | 名稱改為已存在的名稱 | 顯示重複名稱錯誤 |
| 6 | 編輯表單預填既有值 | 所有欄位正確載入 |
| 7 | 非 Admin 嘗試編輯 | 回傳 403 Forbidden |

---

## 依賴關係

- **Blocked By**：US-030（需有擷取任務存在）、US-031（需從清單進入編輯）
- **Blocks**：無

---

## Definition of Done

- [ ] 編輯表單 UI 預填既有值
- [ ] 執行中任務的編輯按鈕停用
- [ ] 後端 API 端點含驗證邏輯
- [ ] 執行中任務回傳 409 Conflict
- [ ] 名稱唯一性驗證（排除自身）
- [ ] 成功／錯誤回饋訊息正確顯示
- [ ] 所有驗收標準的單元測試通過

---

## 相關文件

- **Epic Brief**：[E04 Epic Brief](epic-brief.md)
- **相關 Stories**：US-030、US-031
