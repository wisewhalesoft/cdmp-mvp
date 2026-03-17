# US-037：擷取監控儀表板

> **Story ID**：US-037
> **Epic**：[E04 — 資料擷取管理](epic-brief.md)
> **優先級**：Should Have
> **階段**：Phase 1（MVP）
> **預估點數**：8

---

## User Story

**As a** Admin（管理者）
**I want** 查看擷取任務的監控儀表板
**So that** 我可以即時掌握所有擷取任務的執行狀態、趨勢與效能，快速識別問題並採取行動

---

## 驗收標準

### AC-1：統計卡片
- **Given** Admin 導覽至擷取監控儀表板（預設頁籤）
- **When** 頁面載入完成
- **Then** 系統顯示摘要統計卡片：總任務數、執行中任務數、今日成功次數、今日失敗次數、今日成功率（百分比）

### AC-2：執行趨勢雙色長條圖
- **Given** 儀表板已載入完成
- **When** Admin 瀏覽執行趨勢區塊
- **Then** 系統顯示雙色長條圖，X 軸為日期、Y 軸為執行次數，綠色代表成功、紅色代表失敗，預設顯示最近 7 天

### AC-3：執行趨勢時間範圍切換
- **Given** 儀表板已載入完成
- **When** Admin 切換趨勢圖的時間範圍（7 天 / 14 天 / 30 天）
- **Then** 圖表更新為對應時間範圍的資料

### AC-4：執行中任務進度條
- **Given** 系統中有正在執行的擷取任務
- **When** Admin 瀏覽儀表板
- **Then** 系統顯示執行中任務列表，每個任務含：名稱、資料來源、進度條（extracted_count / total_count）、已擷取筆數，並即時更新

### AC-5：今日失敗清單
- **Given** 今日有擷取任務執行失敗
- **When** Admin 瀏覽儀表板
- **Then** 系統顯示今日失敗的任務清單，每筆含：任務名稱、失敗時間、錯誤摘要，並提供「查看日誌」與「重新執行」快捷按鈕

### AC-6：效能最差 Top 5
- **Given** 儀表板已載入完成
- **When** Admin 瀏覽效能區塊
- **Then** 系統顯示平均執行時間最長的 Top 5 任務，包含：任務名稱、平均執行時間（avg_duration_ms）、累計執行次數

### AC-7：無資料空狀態
- **Given** 系統中尚未建立任何擷取任務或無執行紀錄
- **When** Admin 導覽至儀表板
- **Then** 各區塊顯示對應的空狀態提示（例：「尚無執行紀錄」、「目前無執行中任務」）

---

## Technical Notes

- 儀表板端點：`GET /api/v1/extraction-tasks/dashboard`
- Response：
  ```json
  {
    "summary": {
      "totalTasks": 0,
      "running": 0,
      "todaySuccess": 0,
      "todayFailed": 0,
      "successRate": 0.0
    },
    "runningTasks": [
      {
        "id": "uuid",
        "name": "string",
        "datasourceName": "string",
        "extractedCount": 0,
        "totalCount": 0,
        "progressPercent": 0.0
      }
    ],
    "todayFailures": [
      {
        "taskId": "uuid",
        "taskName": "string",
        "failedAt": "ISO8601",
        "errorSummary": "string",
        "logId": "uuid"
      }
    ],
    "slowestTasks": [
      {
        "taskId": "uuid",
        "taskName": "string",
        "avgDurationMs": 0,
        "executionCount": 0
      }
    ]
  }
  ```
- 趨勢圖端點：`GET /api/v1/extraction-tasks/dashboard/trend?range=7d|14d|30d`
- Response：
  ```json
  {
    "datapoints": [
      { "date": "2026-03-17", "success": 5, "failed": 1 }
    ]
  }
  ```
- 今日統計以 UTC+8（Asia/Taipei）計算「今日」範圍
- 執行中任務進度：前端透過 Polling（建議 5 秒間隔）更新
- 儀表板必須在 2 秒內載入完成（依 NFR-002 規範）
- 顏色標記：成功（#22C55E）、失敗（#EF4444）、進度條（#3B82F6）
- 儀表板為資料擷取頁面的預設頁籤（第二個頁籤為任務管理）
- 時區處理：後端儲存 UTC 時間，前端顯示所有時間欄位時轉換為 UTC+8（Asia/Taipei）

---

## 測試案例

| # | 測試案例 | 預期結果 |
|---|---------|---------|
| 1 | 載入含混合狀態的儀表板 | 統計卡片數據正確 |
| 2 | 預設趨勢圖顯示 7 天 | 長條圖顯示最近 7 天資料 |
| 3 | 切換趨勢圖至 14 天 | 圖表更新為 14 天資料 |
| 4 | 切換趨勢圖至 30 天 | 圖表更新為 30 天資料 |
| 5 | 趨勢圖雙色顯示 | 綠色=成功、紅色=失敗 |
| 6 | 有執行中任務 | 進度條正確顯示且即時更新 |
| 7 | 無執行中任務 | 顯示「目前無執行中任務」 |
| 8 | 今日有失敗任務 | 失敗清單正確顯示 |
| 9 | 失敗清單的「重新執行」按鈕 | 觸發重新執行（連結 US-034） |
| 10 | 失敗清單的「查看日誌」按鈕 | 開啟日誌面板（連結 US-035） |
| 11 | 效能最差 Top 5 | 依平均執行時間排序正確 |
| 12 | 尚無任何擷取任務 | 各區塊顯示空狀態提示 |
| 13 | 儀表板載入時間 | 在 2 秒內完成渲染 |
| 14 | 非 Admin 存取 | 回傳 403 Forbidden |

---

## 依賴關係

- **Blocked By**：US-031（依賴任務清單資料）、US-034（依賴執行紀錄）、US-035（依賴日誌資料）
- **Blocks**：無
- NFR-002：儀表板效能需求（2 秒載入）

---

## Definition of Done

- [ ] 儀表板頁面含摘要統計卡片
- [ ] 執行趨勢雙色長條圖（支援 7d / 14d / 30d 切換）
- [ ] 執行中任務進度條區塊
- [ ] 今日失敗清單含「查看日誌」與「重新執行」按鈕
- [ ] 效能最差 Top 5 排名
- [ ] 各區塊空狀態正確處理
- [ ] 進度條即時更新（Polling 機制）
- [ ] 儀表板為預設頁籤
- [ ] 儀表板在 2 秒內載入完成
- [ ] 所有時間欄位以 UTC+8 顯示
- [ ] 所有驗收標準的單元測試通過

---

## 相關文件

- **Epic Brief**：[E04 Epic Brief](epic-brief.md)
- **NFR**：[NFR-002 效能需求](../../non-functional/NFR-002-performance.md)
- **相關 Stories**：US-031、US-034、US-035
