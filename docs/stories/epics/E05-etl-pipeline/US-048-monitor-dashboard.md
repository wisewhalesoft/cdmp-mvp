# US-048：Pipeline 監控儀表板

> **Story ID**：US-048
> **Epic**：[E05 — ETL Pipeline 管理](epic-brief.md)
> **優先級**：Should Have
> **階段**：Phase 1（MVP）
> **預估點數**：8

---

## User Story

**As a** Admin（管理者）
**I want** 在監控儀表板上一覽 Pipeline 的執行狀況與效能指標
**So that** 我能即時掌握系統健康度、快速發現問題並採取行動

---

## 驗收標準

### AC-1：統計小卡
- **Given** 系統中有 Pipeline 執行紀錄
- **When** 我進入 ETL Pipeline 頁面的監控儀表板頁籤
- **Then** 顯示統計小卡：總 Pipeline 數、執行中、今日成功、今日失敗、成功率（百分比）

### AC-2：執行趨勢雙色長條圖
- **Given** 系統中有近期執行紀錄
- **When** 儀表板載入完成
- **Then** 顯示雙色長條圖，X 軸為日期、Y 軸為次數，綠色（#22C55E）為成功、紅色（#EF4444）為失敗，預設顯示 7 天

### AC-3：趨勢時間範圍切換
- **Given** 執行趨勢圖已顯示
- **When** 我切換時間範圍為 14 天或 30 天
- **Then** 長條圖更新為對應時間範圍的資料

### AC-4：執行中 Pipeline 進度條
- **Given** 有 Pipeline 正在執行中
- **When** 儀表板顯示執行中清單
- **Then** 每個執行中的 Pipeline 顯示名稱、進度條（processedCount/totalCount）、完成率百分比，進度條顏色為 #3B82F6，每 5 秒 Polling 更新

### AC-5：今日失敗清單
- **Given** 今日有 Pipeline 執行失敗
- **When** 儀表板顯示失敗清單
- **Then** 顯示失敗 Pipeline 的名稱、失敗時間、錯誤摘要，並提供「查看日誌」按鈕與「重新執行」按鈕

### AC-6：效能最差 Top 5
- **Given** 系統中有多個 Pipeline 的執行紀錄
- **When** 儀表板載入完成
- **Then** 顯示平均執行時間最長的前 5 個 Pipeline，包含名稱、平均執行時間、累計執行次數

### AC-7：空狀態
- **Given** 系統中尚無任何 Pipeline 或執行紀錄
- **When** 我進入監控儀表板
- **Then** 各區塊顯示對應的空狀態提示

---

## Technical Notes

- 監控儀表板為 ETL Pipeline 頁面的預設頁籤
- 端點：
  - `GET /api/v1/etl/dashboard/stats` — 統計
  - `GET /api/v1/etl/dashboard/trend?range=7d|14d|30d` — 趨勢
  - `GET /api/v1/etl/dashboard/running` — 執行中清單
  - `GET /api/v1/etl/dashboard/failures` — 今日失敗
  - `GET /api/v1/etl/dashboard/slowest` — 效能最差 Top 5
- Stats Response：
  ```json
  {
    "totalPipelines": 0,
    "running": 0,
    "todaySuccess": 0,
    "todayFailed": 0,
    "successRate": 0.0
  }
  ```
- Trend Response：
  ```json
  {
    "datapoints": [
      {
        "date": "2026-03-17",
        "success": 5,
        "failed": 1
      }
    ]
  }
  ```
- Running Response：
  ```json
  {
    "data": [
      {
        "id": "uuid",
        "name": "string",
        "processedCount": 500,
        "totalCount": 1000,
        "progressPercent": 50.0,
        "startedAt": "ISO8601"
      }
    ]
  }
  ```
- Failures Response：
  ```json
  {
    "data": [
      {
        "pipelineId": "uuid",
        "pipelineName": "string",
        "failedAt": "ISO8601",
        "errorSummary": "string",
        "logId": "uuid"
      }
    ]
  }
  ```
- Slowest Response：
  ```json
  {
    "data": [
      {
        "pipelineId": "uuid",
        "pipelineName": "string",
        "avgDurationMs": 30000,
        "executionCount": 15
      }
    ]
  }
  ```
- 今日統計以 UTC+8（Asia/Taipei）計算
- 執行中進度 Polling 間隔：5 秒
- 儀表板需在 2 秒內完成載入（NFR-002）
- 顏色規範：
  - 成功：#22C55E
  - 失敗：#EF4444
  - 進度條：#3B82F6

---

## 測試案例

| # | 測試案例 | 預期結果 |
|---|---------|---------|
| 1 | 載入儀表板（有執行紀錄） | 統計小卡正確顯示各項數值 |
| 2 | 載入執行趨勢圖（預設 7 天） | 顯示近 7 天的雙色長條圖 |
| 3 | 切換趨勢範圍至 14 天 | 長條圖更新為 14 天資料 |
| 4 | 切換趨勢範圍至 30 天 | 長條圖更新為 30 天資料 |
| 5 | 有 Pipeline 正在執行 | 顯示執行中清單，進度條每 5 秒更新 |
| 6 | 今日有失敗任務 | 顯示失敗清單，含「查看日誌」和「重新執行」按鈕 |
| 7 | 點擊失敗任務的「查看日誌」 | 導航至對應的日誌詳情頁面 |
| 8 | 有多個 Pipeline 執行紀錄 | 顯示效能最差 Top 5 排名 |
| 9 | 系統無任何 Pipeline | 各區塊顯示空狀態提示 |
| 10 | 儀表板載入速度 | 2 秒內完成載入 |

---

## 依賴關係

- **Blocked By**：US-043（需有執行紀錄）
- **Blocks**：無

---

## Definition of Done

- [ ] Stats API 實作完成並通過單元測試
- [ ] Trend API 實作完成並通過單元測試（支援 7d/14d/30d）
- [ ] Running API 實作完成並通過單元測試
- [ ] Failures API 實作完成並通過單元測試
- [ ] Slowest API 實作完成並通過單元測試
- [ ] 前端統計小卡實作完成
- [ ] 前端雙色長條圖實作完成（含時間範圍切換）
- [ ] 前端執行中進度條實作完成（含 5 秒 Polling）
- [ ] 前端今日失敗清單實作完成（含日誌連結與重新執行）
- [ ] 前端效能最差 Top 5 實作完成
- [ ] 空狀態正確顯示
- [ ] 今日統計以 UTC+8 計算
- [ ] 載入效能符合 NFR-002（2 秒內）
- [ ] E2E 測試通過

---

## 相關文件

- **Epic Brief**：[E05 Epic Brief](epic-brief.md)
