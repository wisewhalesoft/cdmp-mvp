# US-047：刪除 Pipeline

> **Story ID**：US-047
> **Epic**：[E05 — ETL Pipeline 管理](epic-brief.md)
> **優先級**：Should Have
> **階段**：Phase 1（MVP）
> **預估點數**：2

---

## User Story

**As a** Admin（管理者）
**I want** 刪除不再需要的 Pipeline
**So that** 我能保持 Pipeline 清單的整潔，同時保留歷史日誌供日後查閱

---

## 驗收標準

### AC-1：成功刪除
- **Given** 一個狀態非執行中的 Pipeline
- **When** 我確認刪除該 Pipeline
- **Then** 系統執行軟刪除（設定 `deleted_at` 時間戳記），Pipeline 從列表中消失，排程引擎自動排除

### AC-2：確認對話框
- **Given** 我點擊刪除按鈕
- **When** 系統彈出確認對話框
- **Then** 對話框顯示 Pipeline 名稱與影響說明（如「刪除後排程將停止，歷史日誌將保留」），需使用者確認後才執行

### AC-3：執行中不可刪除
- **Given** 一個狀態為 running 的 Pipeline
- **When** 我嘗試刪除該 Pipeline
- **Then** 系統回傳 `409 Conflict` 錯誤，提示「Pipeline 正在執行中，無法刪除」

### AC-4：日誌保留
- **Given** 一個已被軟刪除的 Pipeline
- **When** 系統查詢該 Pipeline 的歷史日誌
- **Then** 歷史執行日誌仍可存取，不會因刪除而遺失

---

## Technical Notes

- 端點：`DELETE /api/v1/etl/pipelines/:id`
- Success Response：
  ```json
  {
    "message": "Pipeline 已刪除"
  }
  ```
  - HTTP Status：`200 OK`
- Error Response（執行中）：
  ```json
  {
    "statusCode": 409,
    "message": "Pipeline 正在執行中，無法刪除"
  }
  ```
  - HTTP Status：`409 Conflict`
- 軟刪除：設定 `deleted_at` 時間戳記，不實際刪除資料庫記錄
- 刪除後排程引擎自動排除該 Pipeline
- 歷史日誌保留，不受刪除影響

---

## 測試案例

| # | 測試案例 | 預期結果 |
|---|---------|---------|
| 1 | 刪除一個閒置的 Pipeline | 軟刪除成功，Pipeline 從列表消失 |
| 2 | 點擊刪除按鈕 | 顯示確認對話框，含 Pipeline 名稱與影響說明 |
| 3 | 在確認對話框點擊取消 | 不執行刪除，Pipeline 保持不變 |
| 4 | 嘗試刪除執行中的 Pipeline | 回傳 409 Conflict，提示無法刪除 |
| 5 | 刪除 Pipeline 後查詢其歷史日誌 | 歷史日誌仍可正常存取 |
| 6 | 刪除後檢查排程引擎 | 排程引擎不再觸發該 Pipeline |

---

## 依賴關係

- **Blocked By**：US-041（需有 Pipeline 存在）
- **Blocks**：無

---

## Definition of Done

- [ ] 刪除 API 實作完成並通過單元測試
- [ ] 軟刪除邏輯正確（設定 `deleted_at`）
- [ ] 執行中 Pipeline 回傳 409 Conflict
- [ ] 前端確認對話框實作完成
- [ ] 刪除後排程引擎自動排除
- [ ] 歷史日誌保留驗證
- [ ] E2E 測試通過

---

## 相關文件

- **Epic Brief**：[E05 Epic Brief](epic-brief.md)
