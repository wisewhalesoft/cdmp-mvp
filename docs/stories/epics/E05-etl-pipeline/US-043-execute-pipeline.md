# US-043：執行 Pipeline

> **Story ID**：US-043
> **Epic**：[E05 — ETL Pipeline 管理](epic-brief.md)
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：5

---

## User Story

**As a** Admin（管理者）
**I want** 手動或自動觸發 Pipeline 執行，並即時追蹤執行進度
**So that** 我能確認資料轉換流程正確運行，並在失敗時快速重新執行

---

## 驗收標準

### AC-1：手動執行已發布 Pipeline
- **Given** 一個狀態為 active 的 Pipeline
- **When** Admin 點擊「執行」按鈕
- **Then** 系統建立 EtlPipelineLog 記錄，開始執行 Pipeline，回傳 202 Accepted

### AC-2：測試執行草稿 Pipeline
- **Given** 一個狀態為 draft 的 Pipeline
- **When** Admin 點擊「測試執行」按鈕
- **Then** 系統以 `is_test_run = true`、`triggered_by = 'test'` 執行 Pipeline，不影響正式資料

### AC-3：執行進度即時更新
- **Given** 一個 Pipeline 正在執行中
- **When** Admin 在執行頁面觀看
- **Then** 前端以 Polling（5 秒間隔）查詢進度，顯示 processedCount / totalCount、進度百分比、當前處理節點

### AC-4：執行中不可重複執行
- **Given** 一個 Pipeline 正在執行中（status = running）
- **When** Admin 嘗試再次執行同一 Pipeline
- **Then** 系統回傳 409 Conflict，提示「Pipeline 正在執行中」

### AC-5：重新執行失敗的 Pipeline
- **Given** 一個 Pipeline 執行失敗（status = failed）
- **When** Admin 點擊「重新執行」按鈕
- **Then** 系統以 `triggered_by = 'retry'` 建立新的 EtlPipelineLog，重新執行 Pipeline

### AC-6：排程自動觸發
- **Given** 一個 Pipeline 狀態為 active 且 enabled = true，排程時間到達
- **When** 排程觸發器執行
- **Then** 系統自動以 `triggered_by = 'schedule'` 執行 Pipeline

---

## Technical Notes

### API 端點

**手動執行**

- 端點：`POST /api/v1/etl/pipelines/:id/execute`
- Request：`{}` （空 body）
- Response（202 Accepted）：
```json
{
  "logId": "uuid",
  "message": "Pipeline 已開始執行"
}
```
- 執行中重複執行：回傳 `409 Conflict`，`{ "message": "Pipeline 正在執行中" }`

**測試執行（草稿）**

- 端點：`POST /api/v1/etl/pipelines/:id/test`
- Request：`{}` （空 body）
- Response（202 Accepted）：
```json
{
  "logId": "uuid",
  "message": "Pipeline 測試執行已開始"
}
```

**查詢執行進度**

- 端點：`GET /api/v1/etl/pipelines/:id/progress`
- Response：
```json
{
  "logId": "uuid",
  "status": "running",
  "processedCount": 500,
  "totalCount": 1000,
  "progressPercent": 50.0,
  "currentNode": "node-2"
}
```

### 執行記錄

- 每次執行建立 EtlPipelineLog 記錄
- `triggered_by` 欄位：`manual`（手動）、`test`（測試）、`schedule`（排程）、`retry`（重新執行）
- `is_test_run` 欄位：測試執行為 true，其餘為 false

### 進度追蹤

- 前端以 Polling 方式查詢（間隔 5 秒）
- 執行完成或失敗後停止 Polling

---

## 測試案例

| # | 測試案例 | 預期結果 |
|---|---------|---------|
| 1 | 手動執行 active Pipeline | 回傳 202，建立執行記錄，triggered_by = manual |
| 2 | 測試執行 draft Pipeline | 回傳 202，is_test_run = true，triggered_by = test |
| 3 | 查詢執行中 Pipeline 進度 | 回傳 processedCount、totalCount、progressPercent、currentNode |
| 4 | 對執行中 Pipeline 再次執行 | 回傳 409 Conflict |
| 5 | 重新執行 failed Pipeline | 成功建立新執行記錄，triggered_by = retry |
| 6 | 排程觸發 active + enabled Pipeline | 自動執行，triggered_by = schedule |
| 7 | 排程觸發 disabled Pipeline | 不執行 |
| 8 | 執行完成後停止 Polling | 前端偵測到 completed/failed 狀態後停止輪詢 |

---

## 依賴關係

- **Blocked By**：US-042（需有 Pipeline 定義）
- **Blocks**：US-045、US-048

---

## Definition of Done

- [ ] 手動執行 API 開發完成
- [ ] 測試執行 API 開發完成
- [ ] 執行進度查詢 API 開發完成
- [ ] EtlPipelineLog 記錄建立邏輯
- [ ] 前端執行按鈕與進度條 UI
- [ ] Polling 機制實作（5 秒間隔）
- [ ] 重複執行防護（409 Conflict）
- [ ] 排程觸發邏輯
- [ ] 單元測試覆蓋率達標
- [ ] E2E 測試撰寫完成

---

## 相關文件

- **Epic Brief**：[E05 Epic Brief](epic-brief.md)
