---
spec-id: F015
title: 測試資料來源連線
feature-id: F015
source-story: US-024
epic: E03
priority: P0-MVP
version: "1.0"
date: 2026-03-06
status: Draft
---

# F015: 測試資料來源連線

## 1. 功能摘要

提供系統管理員手動觸發資料來源的連線測試，驗證連線設定是否正確、目標資料庫是否可達。測試結果即時回饋，並更新資料來源的連線狀態與最後測試時間。

## 2. 使用者故事

**As a** 系統管理員（Admin）
**I want** 測試資料來源的連線是否正常
**So that** 我可以確認連線設定正確，資料庫可供平台存取

## 3. 驗收標準

### AC-1: 連線測試成功

- **Given** 管理員已登入且目標資料來源設定正確
- **When** 點選「測試連線」按鈕
- **Then** 系統顯示「連線成功，回應時間 120ms」（包含實際回應時間），狀態更新為 `connected`

### AC-2: 連線測試失敗

- **Given** 管理員已登入且目標資料來源的連線設定有誤（如主機不可達或憑證錯誤）
- **When** 點選「測試連線」按鈕
- **Then** 系統顯示描述性錯誤訊息（如「連線被拒：無法連至主機」或「驗證失敗：憑證不正確」），狀態更新為 `disconnected`

### AC-3: 連線逾時

- **Given** 管理員已登入且目標資料來源的主機回應緩慢或無回應
- **When** 點選「測試連線」按鈕，超過 10 秒未收到回應
- **Then** 系統顯示「連線逾時（10 秒）」，狀態更新為 `disconnected`

## 4. API 規格

### POST /api/datasources/:id/test

**說明：** 對指定資料來源執行連線測試。

**Request Headers:**

| Header        | 值                       | 必填 |
|---------------|--------------------------|------|
| Authorization | Bearer {token}           | 是   |

**Path Parameters:**

| 參數 | 類型   | 說明              |
|------|--------|--------------------|
| id   | uuid   | 資料來源的唯一識別碼 |

**Request Body:** 無

**Response — 200 OK（測試成功）：**

```json
{
  "success": true,
  "message": "連線成功",
  "responseTime": 120
}
```

**Response — 200 OK（測試失敗）：**

```json
{
  "success": false,
  "message": "連線被拒：無法連至主機 192.168.1.100:3306",
  "responseTime": null
}
```

**Response — 200 OK（連線逾時）：**

```json
{
  "success": false,
  "message": "連線逾時（10 秒）",
  "responseTime": null
}
```

> 注意：連線測試的成功或失敗均回傳 HTTP 200。`success` 欄位表示連線是否成功。

**錯誤回應：**

| HTTP Status | 錯誤碼           | 說明                         |
|-------------|------------------|------------------------------|
| 404         | NOT_FOUND        | 資料來源不存在或已被刪除     |
| 403         | FORBIDDEN        | 非 Admin 角色無權限操作      |
| 401         | UNAUTHORIZED     | 未登入或 token 無效          |
| 500         | INTERNAL_ERROR   | 伺服器內部錯誤               |

**Side Effects（副作用）：**

測試完成後，系統自動更新該資料來源的以下欄位：
- `status`：成功時設為 `connected`，失敗時設為 `disconnected`
- `lastTestedAt`：設為當前時間戳記

## 5. 商業規則

| 規則編號 | 說明                                                                       |
|----------|----------------------------------------------------------------------------|
| BR-1     | 僅具備 Admin 角色的使用者可執行連線測試                                    |
| BR-2     | 測試流程：建立連線 → 執行 `SELECT 1` → 關閉連線                           |
| BR-3     | 連線逾時上限：10 秒                                                        |
| BR-4     | 測試成功：`status` 更新為 `connected`，記錄回應時間                        |
| BR-5     | 測試失敗或逾時：`status` 更新為 `disconnected`                             |
| BR-6     | 每次測試均更新 `lastTestedAt` 為當前時間                                   |
| BR-7     | 憑證僅在伺服器端解密使用，不得透過任何 API 回傳至前端                      |
| BR-8     | 測試結果記錄至 `datasource_health_logs` 表（供 F016 趨勢圖使用）          |

## 6. UI/UX 需求

- 「測試連線」按鈕位於：
  - 資料來源清單中每筆資料的操作區域
  - 資料來源詳情/編輯頁面
  - 儀表板中每張資料來源卡片（F016 的「Test Now」按鈕）
- 點選後按鈕進入 loading 狀態（顯示 spinner），文字變為「測試中...」
- 測試完成後顯示結果：
  - 成功：綠色 toast 訊息，顯示回應時間
  - 失敗：紅色 toast 訊息，顯示錯誤原因
  - 逾時：橘色 toast 訊息，顯示逾時提示
- 清單中的狀態標籤即時更新（無需重新載入頁面）
- 最後測試時間即時更新

## 7. 錯誤場景

| 場景                         | 系統回應                                                     | 參考                          |
|------------------------------|--------------------------------------------------------------|-------------------------------|
| 主機不可達                   | 「連線被拒：無法連至主機 {host}:{port}」                     | error-handling.md#connection  |
| 憑證錯誤                     | 「驗證失敗：憑證不正確」                                     | error-handling.md#connection  |
| 連線逾時                     | 「連線逾時（10 秒）」                                        | error-handling.md#connection  |
| 資料庫名稱不存在             | 「資料庫 '{databaseName}' 不存在」                           | error-handling.md#connection  |
| 資料來源已被刪除             | HTTP 404，「找不到指定的資料來源」                           | error-handling.md#not-found   |
| 非 Admin 操作                | HTTP 403，「您沒有權限執行此操作」                           | error-handling.md#auth        |
| 伺服器端解密失敗             | HTTP 500，「系統發生錯誤，請稍後再試」（記錄詳細錯誤至 log）| error-handling.md#server      |

## 8. 相依性

- **F011（新增資料來源）：** 新增後可自動觸發連線測試
- **F013（編輯資料來源）：** 編輯後建議重新測試連線
- **F016（資料來源狀態監控儀表板）：** 儀表板中的「Test Now」按鈕呼叫此功能；健康檢查排程也使用相同的測試邏輯
- **認證系統：** 需要有效的 Admin 登入 session/token

## 9. 資料需求

- 資料來源實體（Datasource Entity）：參見 `data-model.md#datasource-entity`
- 健康檢查紀錄表（datasource_health_logs）：參見 `data-model.md#health-log-entity`
  - 每次測試寫入一筆紀錄：datasource_id、success、response_time_ms、error_message、tested_at
- 更新資料來源的 `status` 與 `lastTestedAt` 欄位

## 10. 安全性考量

- 憑證僅在伺服器端解密，用於建立測試連線，測試完成後立即釋放
- 解密後的憑證不得寫入任何 log
- 測試連線使用獨立的短期連線，不影響其他系統連線池
- API 回應中不得包含任何憑證資訊
- 操作僅限 Admin 角色

## 11. 效能需求

- 連線逾時上限：10 秒（硬性限制）
- 連線測試應使用獨立的連線（不占用應用程式連線池）
- 回應時間計量範圍：從建立連線到收到 `SELECT 1` 結果

## 12. 交叉參考

- 資料模型：[data-model.md#datasource-entity](../data-model.md#datasource-entity)、[data-model.md#health-log-entity](../data-model.md#health-log-entity)
- 錯誤處理：[error-handling.md#connection](../error-handling.md#connection)
- 非功能需求：[nfr.md#NFR-001](../nfr.md#NFR-001)、[nfr.md#NFR-002](../nfr.md#NFR-002)
- 流程圖：[diagrams/F015-test-datasource-connection.mmd](../diagrams/F015-test-datasource-connection.mmd)
- 相關功能：[F011](F011-add-datasource.md)、[F013](F013-edit-datasource.md)、[F016](F016-datasource-status-dashboard.md)
