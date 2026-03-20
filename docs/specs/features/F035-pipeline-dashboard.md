---
spec-id: F035
title: Pipeline 監控儀表板
feature-id: F035
source-story: US-048
epic: E05
priority: P1
version: "1.0"
date: 2026-03-19
status: Draft
---

# F035: Pipeline 監控儀表板

## 1. 功能摘要

提供 Admin 一覽 Pipeline 的執行狀況與效能指標。包含統計小卡（總數、執行中、今日成功、今日失敗、成功率）、執行趨勢雙色長條圖（7/14/30 天）、執行中 Pipeline 進度條、今日失敗清單、效能最差 Top 5。

## 2. 使用者故事

**As a** Admin（管理者）
**I want** 在監控儀表板上一覽 Pipeline 的執行狀況與效能指標
**So that** 我能即時掌握系統健康度、快速發現問題並採取行動

## 3. 前置條件

- Admin 已登入且具備 Admin 權限

## 4. 驗收標準

### AC-1: 統計小卡

- **Given** 系統中有 Pipeline 執行紀錄
- **When** Admin 進入 ETL Pipeline 頁面的監控儀表板頁籤
- **Then** 顯示統計小卡：總 Pipeline 數、執行中、今日成功、今日失敗、成功率（百分比）

### AC-2: 執行趨勢雙色長條圖

- **Given** 系統中有近期執行紀錄
- **When** 儀表板載入完成
- **Then** 顯示雙色長條圖，X 軸為日期、Y 軸為次數，綠色（#22C55E）為成功、紅色（#EF4444）為失敗，預設顯示 7 天

### AC-3: 趨勢時間範圍切換

- **Given** 執行趨勢圖已顯示
- **When** Admin 切換時間範圍為 14 天或 30 天
- **Then** 長條圖更新為對應時間範圍的資料

### AC-4: 執行中 Pipeline 進度條

- **Given** 有 Pipeline 正在執行中
- **When** 儀表板顯示執行中清單
- **Then** 每個執行中的 Pipeline 顯示名稱、進度條（processedCount / totalCount）、完成率百分比，進度條顏色為 #3B82F6，每 5 秒 Polling 更新

### AC-5: 今日失敗清單

- **Given** 今日有 Pipeline 執行失敗
- **When** 儀表板顯示失敗清單
- **Then** 顯示失敗 Pipeline 的名稱、失敗時間、錯誤摘要，並提供「查看日誌」按鈕與「重新執行」按鈕

### AC-6: 效能最差 Top 5

- **Given** 系統中有多個 Pipeline 的執行紀錄
- **When** 儀表板載入完成
- **Then** 顯示平均執行時間最長的前 5 個 Pipeline，包含名稱、平均執行時間、累計執行次數

### AC-7: 空狀態

- **Given** 系統中尚無任何 Pipeline 或執行紀錄
- **When** Admin 進入監控儀表板
- **Then** 各區塊顯示對應的空狀態提示

## 5. 主要流程

1. Admin 進入 ETL Pipeline 管理頁面的「監控」頁籤
2. 系統並行載入 5 個 API（stats / trend / running / failures / slowest）
3. 前端渲染各區塊元件
4. 執行中清單以 5 秒間隔 Polling 更新
5. Admin 可切換趨勢圖時間範圍

## 6. 替代流程

- **從失敗清單操作**：Admin 點擊「查看日誌」導向 F032 日誌詳情；點擊「重新執行」觸發 F030 重新執行

## 7. 邊界情況

- 今日統計以 UTC+8（Asia/Taipei）計算「今日」範圍
- 無執行中 Pipeline 時：執行中區塊顯示「目前無執行中的 Pipeline」
- 無失敗紀錄時：失敗清單顯示「今日無失敗紀錄」
- 成功率計算：成功次數 / (成功次數 + 失敗次數) * 100，無執行紀錄時顯示 0%

## 8. API 規格

### GET /api/v1/etl/dashboard/stats

**Response -- 200 OK:**

```json
{
  "totalPipelines": 12,
  "running": 2,
  "todaySuccess": 8,
  "todayFailed": 1,
  "successRate": 88.9
}
```

### GET /api/v1/etl/dashboard/trend?range=7d

**Query Parameters:**

| 參數 | 型別 | 必填 | 說明 |
|------|------|------|------|
| range | string | 否 | 時間範圍：`7d`（預設）/ `14d` / `30d` |

**Response -- 200 OK:**

```json
{
  "datapoints": [
    { "date": "2026-03-13", "success": 5, "failed": 1 },
    { "date": "2026-03-14", "success": 6, "failed": 0 },
    { "date": "2026-03-15", "success": 4, "failed": 2 },
    { "date": "2026-03-16", "success": 7, "failed": 0 },
    { "date": "2026-03-17", "success": 5, "failed": 1 },
    { "date": "2026-03-18", "success": 8, "failed": 0 },
    { "date": "2026-03-19", "success": 3, "failed": 1 }
  ]
}
```

### GET /api/v1/etl/dashboard/running

**Response -- 200 OK:**

```json
{
  "data": [
    {
      "id": "uuid",
      "name": "客戶資料同步",
      "processedCount": 500,
      "totalCount": 1000,
      "progressPercent": 50.0,
      "startedAt": "ISO 8601"
    }
  ]
}
```

### GET /api/v1/etl/dashboard/failures

**Response -- 200 OK:**

```json
{
  "data": [
    {
      "pipelineId": "uuid",
      "pipelineName": "交易資料匯入",
      "failedAt": "ISO 8601",
      "errorSummary": "Load 節點寫入目標表失敗：customer_financial",
      "logId": "uuid"
    }
  ]
}
```

### GET /api/v1/etl/dashboard/slowest

**Response -- 200 OK:**

```json
{
  "data": [
    {
      "pipelineId": "uuid",
      "pipelineName": "客戶資料同步",
      "avgDurationMs": 30000,
      "executionCount": 15
    }
  ]
}
```

**錯誤回應（所有儀表板端點）：**

| HTTP Status | 錯誤碼                 | 說明                               |
|-------------|------------------------|------------------------------------|
| 403         | AUTH_FORBIDDEN         | 非 Admin 角色無權限操作            |
| 401         | AUTH_TOKEN_MISSING     | 未登入或 Token 無效                |
| 500         | SYSTEM_INTERNAL_ERROR  | 伺服器內部錯誤                     |

## 9. 商業規則

| 規則編號 | 說明 |
|----------|------|
| BR-1 | 僅具備 Admin 角色的使用者可查看儀表板 |
| BR-2 | 今日統計以 UTC+8（Asia/Taipei）計算今日範圍 |
| BR-3 | 成功率 = todaySuccess / (todaySuccess + todayFailed) * 100 |
| BR-4 | 趨勢圖不含測試執行（`is_test_run = false`） |
| BR-5 | 效能最差 Top 5 僅統計非測試執行 |
| BR-6 | 執行中清單 Polling 間隔：5 秒 |
| BR-7 | 儀表板需在 2 秒內完成載入（NFR-002） |

## 10. UI/UX 需求

- 儀表板為 ETL Pipeline 頁面的預設頁籤（與列表頁籤切換）
- 頂部：5 張統計小卡橫向排列
- 中間左側：執行趨勢雙色長條圖（含時間範圍切換按鈕）
- 中間右側：執行中 Pipeline 進度條列表
- 底部左側：今日失敗清單（含操作按鈕）
- 底部右側：效能最差 Top 5 排名
- 顏色規範：成功 #22C55E、失敗 #EF4444、進度條 #3B82F6
- 時間顯示格式：`YYYY-MM-DD HH:mm`（UTC+8）
- 各區塊顯示對應的空狀態提示

## 11. 錯誤場景

| 場景                         | 系統回應                                             | 參考                                    |
|------------------------------|------------------------------------------------------|-----------------------------------------|
| 非 Admin 操作                | HTTP 403，「您沒有權限執行此操作」                   | error-handling.md#auth-errors            |
| 伺服器錯誤                   | 「系統發生非預期錯誤，請稍後再試」                   | error-handling.md#system-errors          |

## 12. 相依性

- **F030（執行 Pipeline）**：需有執行紀錄
- **F032（Pipeline 日誌）**：失敗清單連結至日誌詳情
- **認證系統**：需要有效的 Admin 登入 Session/Token

## 13. 資料需求

- EtlPipeline 實體：參見 [data-model.md#etl-pipeline-entity](../data-model.md#etl-pipeline-entity)
- EtlPipelineLog 實體：參見 [data-model.md#etl-pipeline-log-entity](../data-model.md#etl-pipeline-log-entity)

## 14. 交叉參考

- 資料模型：[data-model.md#etl-pipeline-entity](../data-model.md#etl-pipeline-entity)、[data-model.md#etl-pipeline-log-entity](../data-model.md#etl-pipeline-log-entity)
- 錯誤處理：[error-handling.md#etl-pipeline-errors](../error-handling.md#etl-pipeline-errors)
- 相關功能：[F027](F027-pipeline-list.md)、[F030](F030-execute-pipeline.md)、[F032](F032-pipeline-logs.md)
