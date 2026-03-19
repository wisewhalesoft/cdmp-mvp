# US-045：查看 Pipeline 日誌

> **Story ID**：US-045
> **Epic**：[E05 — ETL Pipeline 管理](epic-brief.md)
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：5

---

## User Story

**As a** Admin（管理者）
**I want** 查看 Pipeline 的執行歷史與詳細日誌
**So that** 我能掌握每次執行的結果、追蹤錯誤原因並進行問題排查

---

## 驗收標準

### AC-1：日誌列表
- **Given** 一個已有執行紀錄的 Pipeline
- **When** 我進入該 Pipeline 的日誌頁面
- **Then** 系統顯示執行歷史列表，包含時間、版本、狀態、處理筆數、耗時、觸發方式（schedule/manual/test/retry）

### AC-2：日誌詳情
- **Given** 日誌列表中有一筆執行記錄
- **When** 我點擊該筆記錄
- **Then** 系統顯示詳細日誌，包含每個節點的執行記錄（節點名稱、狀態、處理筆數、耗時、錯誤訊息）

### AC-3：測試執行標記
- **Given** 一筆執行記錄是透過測試執行產生的
- **When** 日誌列表或詳情頁顯示該記錄
- **Then** 該記錄標示「測試」標籤，與正式執行記錄做視覺區分

### AC-4：錯誤訊息顯示
- **Given** 一筆執行記錄的狀態為 failed
- **When** 我查看該筆日誌詳情
- **Then** 系統顯示錯誤訊息與 stack trace，方便問題排查

### AC-5：分頁
- **Given** 執行歷史超過 10 筆
- **When** 我瀏覽日誌列表
- **Then** 系統以每頁 10 筆進行分頁，並提供分頁導航

### AC-6：空狀態
- **Given** 一個尚未執行過的 Pipeline
- **When** 我進入該 Pipeline 的日誌頁面
- **Then** 系統顯示空狀態提示，例如「尚無執行紀錄」

---

## Technical Notes

- 端點：
  - `GET /api/v1/etl/pipelines/:id/logs?page=1&pageSize=10` — 日誌列表
  - `GET /api/v1/etl/logs/:logId` — 日誌詳情
- List Response：
  ```json
  {
    "data": [
      {
        "id": "uuid",
        "version": 1,
        "status": "completed",
        "startedAt": "ISO8601",
        "finishedAt": "ISO8601",
        "durationMs": 5000,
        "processedCount": 1000,
        "triggeredBy": "manual",
        "isTestRun": false
      }
    ],
    "pagination": { "page": 1, "pageSize": 10, "total": 25, "totalPages": 3 }
  }
  ```
- Detail Response：
  ```json
  {
    "id": "uuid",
    "pipelineId": "uuid",
    "version": 1,
    "status": "completed",
    "startedAt": "ISO8601",
    "finishedAt": "ISO8601",
    "durationMs": 5000,
    "processedCount": 1000,
    "errorMessage": null,
    "triggeredBy": "manual",
    "isTestRun": false,
    "nodeLogs": [
      {
        "nodeId": "node-1",
        "nodeName": "Extract: raw_a3f2c1d4",
        "nodeType": "extract",
        "status": "completed",
        "processedCount": 1000,
        "durationMs": 2000,
        "errorMessage": null
      }
    ]
  }
  ```
- 時區：後端儲存 UTC，前端顯示 UTC+8（Asia/Taipei）
- 觸發方式 `triggeredBy` 可為：`schedule`、`manual`、`test`、`retry`
- 狀態 `status` 可為：`running`、`completed`、`failed`

---

## 測試案例

| # | 測試案例 | 預期結果 |
|---|---------|---------|
| 1 | 查看有執行紀錄的 Pipeline 日誌列表 | 顯示歷史記錄，含時間、版本、狀態、處理筆數、耗時、觸發方式 |
| 2 | 點擊日誌列表中的某筆記錄 | 顯示詳細日誌，含各節點執行記錄 |
| 3 | 查看測試執行的日誌 | 該筆記錄顯示「測試」標籤 |
| 4 | 查看失敗執行的日誌詳情 | 顯示錯誤訊息與 stack trace |
| 5 | 日誌超過 10 筆時瀏覽列表 | 正確分頁，每頁 10 筆 |
| 6 | 查看從未執行過的 Pipeline 日誌 | 顯示空狀態提示「尚無執行紀錄」 |
| 7 | 日誌列表的時間顯示 | 前端以 UTC+8 格式顯示時間 |

---

## 依賴關係

- **Blocked By**：US-043（需有執行紀錄）
- **Blocks**：無

---

## Definition of Done

- [ ] 日誌列表 API 實作完成並通過單元測試
- [ ] 日誌詳情 API 實作完成並通過單元測試
- [ ] 前端日誌列表頁面實作完成
- [ ] 前端日誌詳情頁面實作完成（含節點級記錄）
- [ ] 測試執行標記「測試」標籤正確顯示
- [ ] 錯誤訊息與 stack trace 正確顯示
- [ ] 分頁功能正常運作
- [ ] 空狀態正確顯示
- [ ] 時區處理正確（UTC 儲存、UTC+8 顯示）
- [ ] E2E 測試通過

---

## 相關文件

- **Epic Brief**：[E05 Epic Brief](epic-brief.md)
