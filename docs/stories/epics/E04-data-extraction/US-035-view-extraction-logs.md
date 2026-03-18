# US-035：查看擷取日誌

> **Story ID**：US-035
> **Epic**：[E04 — 資料擷取管理](epic-brief.md)
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：3

---

## User Story

**As a** Admin（管理者）
**I want** 查看擷取任務的執行日誌歷史
**So that** 我可以追蹤每次執行的結果、排查失敗原因、並掌握任務的歷史表現

---

## 驗收標準

### AC-1：開啟日誌面板
- **Given** Admin 在擷取任務清單頁面
- **When** Admin 點擊某任務的「查看日誌」按鈕
- **Then** 系統以 Modal 或 Drawer 開啟該任務的執行歷史日誌面板

### AC-2：日誌列表顯示
- **Given** 日誌面板已開啟
- **When** Admin 瀏覽日誌列表
- **Then** 每筆日誌顯示：開始時間、結束時間、狀態（顏色標記：綠色=completed、紅色=failed、藍色=running）、執行時間（duration_ms）、擷取筆數、觸發方式（manual / schedule / retry），並以時間倒序排列

### AC-3：失敗日誌詳細資訊
- **Given** 日誌列表中有 failed 狀態的日誌
- **When** Admin 點擊該筆日誌或展開詳細
- **Then** 系統顯示完整的錯誤訊息（error_message）

### AC-6：從日誌連結至 raw data 預覽
- **Given** 日誌列表中有 completed 狀態的日誌，且 extracted_count > 0
- **When** Admin 點擊該筆日誌的「預覽資料」連結
- **Then** 系統導覽至該擷取任務的 raw data 預覽頁面（US-039）

### AC-4：日誌分頁
- **Given** 某任務有大量執行日誌
- **When** Admin 瀏覽日誌面板
- **Then** 系統以分頁方式顯示（預設每頁 10 筆），可切換頁面查看更多歷史紀錄

### AC-5：無日誌時的空狀態
- **Given** 某擷取任務尚未執行過
- **When** Admin 開啟該任務的日誌面板
- **Then** 系統顯示「此任務尚無執行紀錄」的提示訊息

---

## Technical Notes

- 端點：`GET /api/v1/extraction-tasks/:id/logs`
- Query 參數：`page`, `limit`
- Response：
  ```json
  {
    "data": [
      {
        "id": "uuid",
        "taskId": "uuid",
        "status": "running | completed | failed",
        "startedAt": "ISO8601",
        "finishedAt": "ISO8601",
        "durationMs": 12345,
        "extractedCount": 1000,
        "totalCount": 1000,
        "errorMessage": "string | null",
        "triggeredBy": "schedule | manual | retry",
        "createdBy": "uuid"
      }
    ],
    "meta": { "total", "page", "limit", "totalPages" }
  }
  ```
- 預設排序：`started_at DESC`
- 顏色標記：completed（#22C55E）、failed（#EF4444）、running（#3B82F6）
- 時區處理：後端儲存 UTC 時間，前端顯示開始時間、結束時間等時間欄位時轉換為 UTC+8（Asia/Taipei）
- duration_ms 前端格式化為可讀格式（例：1m 23s）

---

## 測試案例

| # | 測試案例 | 預期結果 |
|---|---------|---------|
| 1 | 開啟含多筆日誌的任務面板 | 日誌列表正確顯示所有欄位 |
| 2 | 日誌依時間倒序排列 | 最新執行在最上方 |
| 3 | 成功日誌顏色標記 | 綠色標記 |
| 4 | 失敗日誌顏色標記 | 紅色標記 |
| 5 | 執行中日誌顏色標記 | 藍色標記 |
| 6 | 查看失敗日誌的錯誤訊息 | 顯示完整 error_message |
| 7 | 日誌分頁導覽 | 切換頁面資料正確 |
| 8 | 無執行紀錄的任務 | 顯示空狀態提示 |
| 9 | 觸發方式顯示 | manual / schedule / retry 正確顯示 |
| 10 | 非 Admin 存取 | 回傳 403 Forbidden |

---

## 依賴關係

- **Blocked By**：US-034（需有執行紀錄才有日誌）
- **Blocks**：US-039（日誌提供進入 raw data 預覽的入口）
- 與 US-037 共用日誌資料（儀表板的失敗清單也讀取 ExtractionLog）

---

## Definition of Done

- [ ] 日誌 Modal / Drawer UI 含所有必要欄位
- [ ] 狀態顏色標記正確
- [ ] 失敗日誌可展開檢視錯誤訊息
- [ ] 日誌分頁功能正常運作
- [ ] 空狀態正確處理
- [ ] duration_ms 格式化為可讀格式
- [ ] 所有時間欄位以 UTC+8 顯示
- [ ] 所有驗收標準的單元測試通過

---

## 相關文件

- **Epic Brief**：[E04 Epic Brief](epic-brief.md)
- **相關 Stories**：US-034、US-037、US-039
