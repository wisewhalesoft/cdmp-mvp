---
spec-id: F016
title: 資料來源狀態監控儀表板
feature-id: F016
source-story: US-025
epic: E03
priority: P1
version: "1.0"
date: 2026-03-06
status: Draft
---

# F016: 資料來源狀態監控儀表板

## 1. 功能摘要

提供系統管理員一個集中式儀表板，以視覺化方式監控所有資料來源的健康狀態。包含摘要統計、個別狀態卡片、效能趨勢圖、類型分佈圖、異常警示清單，以及手動觸發全部或單一資料來源連線測試的功能。後端排程每 30 分鐘自動執行健康檢查。

## 2. 使用者故事

**As a** 系統管理員（Admin）
**I want** 在儀表板上查看所有資料來源的健康狀態
**So that** 我可以即時掌握連線狀況，快速識別並處理異常

## 3. 驗收標準

### AC-1: 摘要統計卡片

- **Given** 管理員已登入並進入資料來源儀表板
- **When** 頁面載入完成
- **Then** 顯示摘要卡片：總數、已連線數（綠色 #22C55E）、已斷線數（紅色 #EF4444）、未知數（灰色 #9CA3AF）

### AC-2: 個別資料來源狀態卡片

- **Given** 管理員正在瀏覽儀表板
- **When** 頁面載入完成
- **Then** 每張資料來源卡片顯示：名稱、類型、狀態（色彩標示）、最後測試時間、「Test Now」按鈕

### AC-3: 自動健康檢查排程

- **Given** 系統正常運作中
- **When** 每 30 分鐘排程觸發
- **Then** 系統自動測試所有未刪除的資料來源，更新各資料來源的 `status` 與 `lastTestedAt`，儀表板反映最新結果

### AC-4: 效能趨勢圖

- **Given** 管理員選擇某個資料來源查看效能趨勢
- **When** 選擇時間範圍（預設 24 小時，可切換為 7 天或 30 天）
- **Then** 顯示折線圖（X 軸 = 時間，Y 軸 = responseTimeMs）

### AC-5: 類型分佈圓餅圖

- **Given** 管理員正在瀏覽儀表板
- **When** 頁面載入完成
- **Then** 顯示圓餅圖，依資料來源類型（MySQL / PostgreSQL / SQL Server）分佈，標示數量與百分比

### AC-6: 異常警示清單

- **Given** 某資料來源連續 2 次以上健康檢查失敗
- **When** 管理員查看儀表板的警示區域
- **Then** 該資料來源出現在警示清單中，顯示：名稱、類型、連續失敗次數（consecutive_failures）、首次失敗時間（first_failure_time）、最後錯誤訊息（last_error_message），依連續失敗次數降序排列。當該資料來源恢復連線後自動從警示清單移除。

### AC-7: 手動觸發測試

- **Given** 管理員正在瀏覽儀表板
- **When** 點選「Refresh All」按鈕
- **Then** 系統平行測試所有資料來源，結果即時更新於儀表板（無需重新載入頁面）
- **When** 點選某資料來源卡片的「Test Now」按鈕
- **Then** 系統測試該單一資料來源，結果即時更新

## 4. API 規格

### GET /api/datasources/dashboard

**說明：** 取得儀表板摘要資料。

**Request Headers:**

| Header        | 值                       | 必填 |
|---------------|--------------------------|------|
| Authorization | Bearer {token}           | 是   |

**Response — 200 OK:**

```json
{
  "summary": {
    "total": 10,
    "connected": 7,
    "disconnected": 2,
    "unknown": 1,
    "typeCounts": {
      "mysql": 4,
      "postgresql": 4,
      "sqlserver": 2
    }
  },
  "datasources": [
    {
      "id": "uuid",
      "name": "string",
      "type": "mysql",
      "status": "connected",
      "lastTestedAt": "ISO 8601 | null",
      "consecutiveFailures": 0,
      "lastErrorMessage": null
    }
  ]
}
```

### GET /api/datasources/:id/metrics

**說明：** 取得指定資料來源的效能指標資料。

**Query Parameters:**

| 參數  | 類型   | 預設值 | 說明                       |
|-------|--------|--------|----------------------------|
| range | string | 24h    | 時間範圍：24h / 7d / 30d   |

**Response — 200 OK:**

```json
{
  "datasourceId": "uuid",
  "range": "24h",
  "datapoints": [
    {
      "timestamp": "ISO 8601",
      "responseTimeMs": 120,
      "success": true
    },
    {
      "timestamp": "ISO 8601",
      "responseTimeMs": null,
      "success": false
    }
  ]
}
```

### GET /api/datasources/alerts

**說明：** 取得異常警示清單。

**Response — 200 OK:**

```json
{
  "alerts": [
    {
      "datasourceId": "uuid",
      "name": "string",
      "type": "mysql",
      "consecutiveFailures": 5,
      "firstFailureTime": "ISO 8601",
      "lastErrorMessage": "連線被拒：無法連至主機 192.168.1.100:3306"
    }
  ]
}
```

> 警示清單依 `consecutiveFailures` 降序排列。

**錯誤回應（共用於上述三個 endpoint）：**

| HTTP Status | 錯誤碼           | 說明                    |
|-------------|------------------|-------------------------|
| 401         | UNAUTHORIZED     | 未登入或 token 無效     |
| 403         | FORBIDDEN        | 非 Admin 角色無權限操作 |
| 404         | NOT_FOUND        | 資料來源不存在（metrics endpoint） |
| 500         | INTERNAL_ERROR   | 伺服器內部錯誤          |

## 5. 商業規則

| 規則編號 | 說明                                                                                     |
|----------|------------------------------------------------------------------------------------------|
| BR-1     | 僅具備 Admin 角色的使用者可查看儀表板                                                    |
| BR-2     | 後端排程每 30 分鐘（cron）自動執行所有未刪除資料來源的健康檢查                           |
| BR-3     | 每次健康檢查結果寫入 `datasource_health_logs` 表                                        |
| BR-4     | 異常警示觸發條件：連續 >= 2 次健康檢查失敗                                               |
| BR-5     | 異常警示移除條件：資料來源恢復連線（下一次健康檢查成功）                                 |
| BR-6     | 已軟刪除的資料來源排除於儀表板所有查詢之外                                               |
| BR-7     | 「Refresh All」觸發的測試為平行執行（非逐一序列）                                        |
| BR-8     | 效能趨勢圖的資料點來源為 `datasource_health_logs` 表                                    |
| BR-9     | 單一資料來源的「Test Now」按鈕呼叫 F015 的 POST /api/datasources/:id/test                |

## 6. UI/UX 需求

### 頁面佈局

- **頂部區域：** 摘要統計卡片（四張卡片並排：總數、已連線、已斷線、未知）
- **右上方：**「Refresh All」按鈕
- **中間左側：** 類型分佈圓餅圖
- **中間右側：** 效能趨勢折線圖（含資料來源選擇器與時間範圍切換：24h / 7d / 30d）
- **下方區域：** 個別資料來源狀態卡片（網格排列）
- **底部區域：** 異常警示清單（表格形式）

### 色彩規範

| 狀態         | 色碼      | 用途                       |
|--------------|-----------|----------------------------|
| connected    | #22C55E   | 摘要卡片背景、狀態標籤     |
| disconnected | #EF4444   | 摘要卡片背景、狀態標籤     |
| unknown      | #9CA3AF   | 摘要卡片背景、狀態標籤     |

### 即時更新

- 前端以 polling 方式（30 秒間隔）或 WebSocket 取得最新狀態
- 「Refresh All」與「Test Now」操作後立即更新相關 UI 元件，無需重新載入頁面
- 測試進行中顯示 loading spinner

### 圓餅圖

- 區塊：MySQL、PostgreSQL、SQL Server
- 每個區塊標示數量與百分比
- 無資料時顯示空狀態提示

### 折線圖

- X 軸：時間（依選擇的範圍自動調整刻度）
- Y 軸：回應時間（毫秒）
- 失敗的資料點以不同樣式標示（如紅點或虛線）
- 預設顯示 24 小時範圍
- 支援切換：24h / 7d / 30d

### 異常警示清單

- 表格欄位：名稱、類型、連續失敗次數、首次失敗時間、最後錯誤訊息
- 依連續失敗次數降序排列
- 無警示時顯示「所有資料來源運作正常」

## 7. 錯誤場景

| 場景                         | 系統回應                                                | 參考                          |
|------------------------------|---------------------------------------------------------|-------------------------------|
| 儀表板載入失敗               | 顯示「無法載入儀表板資料，請重新整理頁面」              | error-handling.md#server      |
| 效能指標查詢失敗             | 圖表區域顯示「無法載入效能資料」                        | error-handling.md#server      |
| 排程執行失敗                 | 記錄錯誤至系統 log，不影響前端顯示                      | error-handling.md#scheduler   |
| Refresh All 部分失敗         | 成功的資料來源更新狀態，失敗的顯示個別錯誤              | error-handling.md#connection  |
| 非 Admin 操作                | HTTP 403，導向無權限頁面                                | error-handling.md#auth        |

## 8. 相依性

- **F015（測試資料來源連線）：** 「Test Now」按鈕與「Refresh All」按鈕共用 F015 的測試邏輯與 API
- **F012（查看資料來源清單）：** 儀表板與清單共用資料來源基本資料
- **後端排程服務：** 需要 cron job 或排程框架支援每 30 分鐘執行任務
- **認證系統：** 需要有效的 Admin 登入 session/token

## 9. 資料需求

- 資料來源實體（Datasource Entity）：參見 `data-model.md#datasource-entity`
- 健康檢查紀錄表（datasource_health_logs）：參見 `data-model.md#health-log-entity`
  - 欄位：id、datasource_id、success、response_time_ms、error_message、tested_at
  - 此表為效能趨勢圖與警示計算的資料來源
- 警示計算邏輯：依 `datasource_health_logs` 中連續失敗記錄計算 `consecutiveFailures`
- 資料保留策略：健康檢查紀錄建議保留 90 天（超過 90 天的記錄可由排程清理）

## 10. 安全性考量

- 操作僅限 Admin 角色
- 儀表板不顯示任何憑證資訊
- 排程任務須以系統服務帳號執行，具備讀取加密憑證的權限
- API 回應中不得包含密碼欄位

## 11. 效能需求

- 儀表板首次載入時間：< 2 秒（含 50 個資料來源，參見 NFR-002）
- GET /api/datasources/dashboard 回應時間：< 1 秒
- GET /api/datasources/:id/metrics 回應時間：< 1 秒
- GET /api/datasources/alerts 回應時間：< 500ms
- 「Refresh All」平行測試，不逐一序列執行（總時間受最慢連線限制，上限 10 秒）
- 前端 polling 間隔：30 秒（避免過多 API 請求）
- `datasource_health_logs` 表須在 `datasource_id` 與 `tested_at` 上建立複合索引

## 12. 交叉參考

- 資料模型：[data-model.md#datasource-entity](../data-model.md#datasource-entity)、[data-model.md#health-log-entity](../data-model.md#health-log-entity)
- 錯誤處理：[error-handling.md](../error-handling.md)
- 非功能需求：[nfr.md#NFR-002](../nfr.md#NFR-002)
- 流程圖：[diagrams/F016-datasource-status-dashboard.mmd](../diagrams/F016-datasource-status-dashboard.mmd)
- 相關功能：[F012](F012-list-datasources.md)、[F015](F015-test-datasource-connection.md)
