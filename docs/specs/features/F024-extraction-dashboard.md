---
spec-id: F024
title: 擷取監控儀表板
feature-id: F024
source-story: US-037
epic: E04
priority: P1
version: "1.0"
date: 2026-03-17
status: Draft
---

# F024: 擷取監控儀表板

## 1. 功能摘要

提供 Admin 即時掌握所有擷取任務執行狀態的監控儀表板，包含摘要統計卡片、執行趨勢圖、執行中任務進度、今日失敗清單與效能最差排名。儀表板為資料擷取頁面的預設頁籤。

## 2. 使用者故事

**As a** Admin（管理者）
**I want** 查看擷取任務的監控儀表板
**So that** 我可以即時掌握所有擷取任務的執行狀態、趨勢與效能，快速識別問題並採取行動

## 3. 前置條件

- Admin 已登入且具備 Admin 權限

## 4. 驗收標準

### AC-1: 統計卡片

- **Given** Admin 導覽至擷取監控儀表板（預設頁籤）
- **When** 頁面載入完成
- **Then** 系統顯示摘要統計卡片：總任務數、執行中任務數、今日成功次數、今日失敗次數、今日成功率（百分比）

### AC-2: 執行趨勢雙色長條圖

- **Given** 儀表板已載入完成
- **When** Admin 瀏覽執行趨勢區塊
- **Then** 系統顯示雙色長條圖，X 軸為日期、Y 軸為執行次數，綠色代表成功、紅色代表失敗，預設顯示最近 7 天

### AC-3: 執行趨勢時間範圍切換

- **Given** 儀表板已載入完成
- **When** Admin 切換趨勢圖的時間範圍（7 天 / 14 天 / 30 天）
- **Then** 圖表更新為對應時間範圍的資料

### AC-4: 執行中任務進度條

- **Given** 系統中有正在執行的擷取任務
- **When** Admin 瀏覽儀表板
- **Then** 系統顯示執行中任務列表，每個任務含：名稱、資料來源、進度條（`extracted_count / total_count`）、已擷取筆數，並即時更新

### AC-5: 今日失敗清單

- **Given** 今日有擷取任務執行失敗
- **When** Admin 瀏覽儀表板
- **Then** 系統顯示今日失敗的任務清單，每筆含：任務名稱、失敗時間、錯誤摘要，並提供「查看日誌」與「重新執行」快捷按鈕

### AC-6: 效能最差 Top 5

- **Given** 儀表板已載入完成
- **When** Admin 瀏覽效能區塊
- **Then** 系統顯示平均執行時間最長的 Top 5 任務，包含：任務名稱、平均執行時間（`avg_duration_ms`）、累計執行次數

### AC-7: 無資料空狀態

- **Given** 系統中尚未建立任何擷取任務或無執行紀錄
- **When** Admin 導覽至儀表板
- **Then** 各區塊顯示對應的空狀態提示（例：「尚無執行紀錄」、「目前無執行中任務」）

## 5. 主要流程

1. Admin 導覽至資料擷取頁面（儀表板為預設頁籤）
2. 系統並行發送以下 API 請求：
   - `GET /api/extraction-tasks/dashboard`（摘要、執行中任務、今日失敗、效能排名）
   - `GET /api/extraction-tasks/dashboard/trend?range=7d`（趨勢圖資料）
3. 系統渲染摘要統計卡片
4. 系統渲染執行趨勢雙色長條圖（預設 7 天）
5. 系統渲染執行中任務進度條
6. 系統渲染今日失敗清單
7. 系統渲染效能最差 Top 5
8. 前端透過 Polling（5 秒間隔）更新執行中任務進度

## 6. 替代流程

- **切換趨勢圖時間範圍**：Admin 點擊 7d / 14d / 30d 按鈕，前端發送 `GET /api/extraction-tasks/dashboard/trend?range=14d`，圖表即時更新
- **從失敗清單操作**：Admin 點擊「查看日誌」開啟日誌面板（F022）；點擊「重新執行」觸發重新執行（F021）

## 7. 邊界情況

- 今日無執行紀錄：成功率顯示 `0.0%`
- 無執行中任務：進度條區塊顯示「目前無執行中任務」
- 今日無失敗：失敗清單區塊顯示「今日無失敗紀錄」
- 所有任務 `execution_count = 0`：效能排名區塊顯示「尚無足夠執行紀錄」

## 8. API 規格

### GET /api/extraction-tasks/dashboard

**Request Headers:**

| Header        | 值                       | 必填 |
|---------------|--------------------------|------|
| Authorization | Bearer {token}           | 是   |

**Response — 200 OK:**

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
      "failedAt": "ISO 8601",
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

### GET /api/extraction-tasks/dashboard/trend

**Query 參數：**

| 參數  | 類型   | 必填 | 說明                              |
|------|--------|------|-----------------------------------|
| range| string | 否   | 時間範圍，預設 `7d`，可選 `7d`、`14d`、`30d` |

**Response — 200 OK:**

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

**錯誤回應：**

| HTTP Status | 錯誤碼                | 說明                          |
|-------------|----------------------|-------------------------------|
| 403         | AUTH_FORBIDDEN       | 非 Admin 角色無權限操作        |
| 401         | AUTH_TOKEN_MISSING   | 未登入或 Token 無效            |
| 500         | SYSTEM_INTERNAL_ERROR| 伺服器內部錯誤                 |

## 9. 商業規則

| 規則編號 | 說明 |
|----------|------|
| BR-1 | 僅具備 Admin 角色的使用者可查看擷取監控儀表板 |
| BR-2 | 今日統計以 UTC+8（Asia/Taipei）時區計算「今日」範圍 |
| BR-3 | 成功率計算：`todaySuccess / (todaySuccess + todayFailed) * 100`，無紀錄時為 `0.0` |
| BR-4 | 效能最差 Top 5 依 `avg_duration_ms DESC` 排序，僅包含 `execution_count > 0` 的任務 |
| BR-5 | 儀表板為資料擷取頁面的預設頁籤（第一個頁籤），第二個頁籤為任務管理（F018） |
| BR-6 | 趨勢圖預設顯示 7 天，可切換 14 天 / 30 天 |
| BR-7 | 軟刪除的任務不納入統計 |

## 10. UI/UX 需求

- 頁面佈局：
  - 頂部：統計卡片（5 個卡片水平排列）
  - 中間左：執行趨勢雙色長條圖（含時間範圍切換按鈕）
  - 中間右：執行中任務進度條
  - 底部左：今日失敗清單
  - 底部右：效能最差 Top 5
- 顏色標記：成功（綠色 #22C55E）、失敗（紅色 #EF4444）、進度條（藍色 #3B82F6）
- 執行中任務進度條即時更新（Polling 5 秒間隔）
- 今日失敗清單含「查看日誌」與「重新執行」快捷按鈕
- 各區塊在無資料時顯示對應的空狀態提示
- 所有時間欄位以 UTC+8 顯示

## 11. 效能需求

- 儀表板必須在 2 秒內完成初始渲染（含最多 50 個擷取任務的資料）
- 參見 [nfr.md](../nfr.md)

## 12. 錯誤場景

| 場景                   | 系統回應                                               | 參考                                |
|------------------------|--------------------------------------------------------|-------------------------------------|
| 非 Admin 操作          | HTTP 403，「您沒有權限執行此操作」                     | error-handling.md#auth-errors        |
| 伺服器錯誤             | 「系統發生非預期錯誤，請稍後再試」                     | error-handling.md#system-errors      |
| API 回應超時           | 顯示「載入失敗，請重新整理頁面」提示                   |                                      |

## 13. 相依性

- **F018（查看擷取任務清單）**：依賴任務清單資料
- **F021（立即執行／重新執行）**：失敗清單的「重新執行」按鈕觸發 F021
- **F022（查看擷取日誌）**：失敗清單的「查看日誌」按鈕開啟日誌面板
- **認證系統**：需要有效的 Admin 登入 Session/Token

## 14. 資料需求

- ExtractionTask 實體：參見 [data-model.md#extraction-task-entity](../data-model.md#extraction-task-entity)
- ExtractionLog 實體：參見 [data-model.md#extraction-log-entity](../data-model.md#extraction-log-entity)

## 15. 交叉參考

- 資料模型：[data-model.md#extraction-task-entity](../data-model.md#extraction-task-entity)、[data-model.md#extraction-log-entity](../data-model.md#extraction-log-entity)
- 錯誤處理：[error-handling.md](../error-handling.md)
- 非功能需求：[nfr.md](../nfr.md)
- 相關功能：[F018](F018-view-extraction-task-list.md)、[F021](F021-run-extraction-task.md)、[F022](F022-view-extraction-logs.md)
