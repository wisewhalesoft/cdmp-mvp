# US-031：查看擷取任務清單

> **Story ID**：US-031
> **Epic**：[E04 — 資料擷取管理](epic-brief.md)
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：5

---

## User Story

**As a** Admin（管理者）
**I want** 查看所有擷取任務的清單
**So that** 我可以掌握各任務的狀態、排程與執行概況，進行有效的任務管理

---

## 驗收標準

### AC-1：任務清單顯示
- **Given** Admin 導覽至擷取任務管理頁籤
- **When** 頁面載入完成
- **Then** 系統顯示擷取任務表格，包含欄位：名稱、資料來源、擷取模式、狀態、排程、最後執行時間、擷取筆數，並以分頁呈現（預設每頁 10 筆）

### AC-2：頂部統計卡片
- **Given** Admin 在擷取任務管理頁籤
- **When** 頁面載入完成
- **Then** 系統在表格上方顯示統計卡片：總任務數、執行中、今日成功、今日失敗、成功率（百分比）

### AC-3：搜尋功能
- **Given** Admin 在擷取任務清單頁面
- **When** Admin 在搜尋框輸入關鍵字
- **Then** 系統依任務名稱進行模糊搜尋，即時篩選並顯示符合條件的任務

### AC-4：篩選功能
- **Given** Admin 在擷取任務清單頁面
- **When** Admin 使用篩選器選擇條件（狀態、擷取模式、資料來源）
- **Then** 系統依選擇的條件篩選任務清單，多個篩選條件為 AND 關係

### AC-5：空狀態顯示
- **Given** 系統中尚未建立任何擷取任務
- **When** Admin 導覽至擷取任務管理頁籤
- **Then** 系統顯示空狀態提示訊息，並提供「建立第一個擷取任務」的快捷按鈕

---

## Technical Notes

- 端點：`GET /api/extraction-tasks`
- Query 參數：`page`, `limit`, `search`, `status`, `mode`, `datasourceId`
- Response：
  ```json
  {
    "data": [ExtractionTask],
    "meta": { "total", "page", "limit", "totalPages" },
    "summary": {
      "totalTasks": 0,
      "running": 0,
      "todaySuccess": 0,
      "todayFailed": 0,
      "successRate": 0.0
    }
  }
  ```
- 預設排序：`updated_at DESC`
- 軟刪除的任務（`deleted_at IS NOT NULL`）不顯示於清單
- 今日統計以 UTC+8（Asia/Taipei）計算「今日」範圍
- 時區處理：後端儲存 UTC 時間，前端顯示「最後執行時間」等時間欄位時轉換為 UTC+8

---

## 測試案例

| # | 測試案例 | 預期結果 |
|---|---------|---------|
| 1 | 載入含多筆任務的清單 | 表格正確顯示所有欄位 |
| 2 | 頂部統計卡片數據 | 總數、執行中、今日成功/失敗、成功率正確 |
| 3 | 以任務名稱搜尋 | 篩選結果正確 |
| 4 | 依狀態篩選（running） | 僅顯示執行中的任務 |
| 5 | 依擷取模式篩選（incremental） | 僅顯示增量模式任務 |
| 6 | 依資料來源篩選 | 僅顯示指定來源的任務 |
| 7 | 多條件複合篩選 | AND 條件正確套用 |
| 8 | 分頁導覽 | 切換頁面資料正確 |
| 9 | 無任務時的空狀態 | 顯示空狀態提示與建立按鈕 |
| 10 | 軟刪除的任務 | 不出現於清單 |
| 11 | 非 Admin 存取 | 回傳 403 Forbidden |

---

## 依賴關係

- **Blocked By**：US-030（需有擷取任務存在）
- **Blocks**：US-032、US-038（需從清單進入編輯或刪除）

---

## Definition of Done

- [ ] 擷取任務表格 UI 含所有必要欄位
- [ ] 頂部統計卡片顯示正確數據
- [ ] 搜尋框支援任務名稱模糊搜尋
- [ ] 篩選器支援狀態、模式、資料來源篩選
- [ ] 分頁功能正常運作
- [ ] 空狀態正確處理
- [ ] 後端 API 含搜尋、篩選、分頁參數
- [ ] 所有驗收標準的單元測試通過

---

## 相關文件

- **Epic Brief**：[E04 Epic Brief](epic-brief.md)
- **相關 Stories**：US-030、US-032、US-037、US-038
