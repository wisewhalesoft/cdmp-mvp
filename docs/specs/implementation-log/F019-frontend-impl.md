---
type: implementation-log
feature_id: F019
feature_name: 編輯擷取任務（前端）
status: complete
last_updated: 2026-03-18
---

# F019: 編輯擷取任務 — 前端實作日誌

## 測試結果摘要

| 測試案例 | 說明 | 狀態 |
|----------|------|------|
| AC-3 預填 | 表單預填既有任務資料（name, datasourceId, targetTable） | PASS |
| AC-3 Breadcrumb | 顯示「編輯擷取任務」Breadcrumb | PASS |
| AC-3 Cron 反推 | 從 cron 表達式反推 simple mode（daily 02:00） | PASS |
| AC-3 Cron 預覽 | 顯示 cron preview「每日 02:00 執行」 | PASS |
| AC-1 成功編輯 | 呼叫 updateExtractionTask 後 navigate 回清單 | PASS |
| 錯誤處理 NAME_EXISTS | 409 EXTRACTION_NAME_EXISTS 顯示 toast | PASS |
| 錯誤處理 RUNNING | 409 EXTRACTION_RUNNING 顯示 toast | PASS |
| 取消操作 | 點擊取消 navigate 回清單 | PASS |

共 8 個前端測試通過。全部前端 extraction 測試共 47 個通過（25 add + 14 list + 8 edit）。

## 變更檔案

| 檔案路徑 | 變更類型 | 說明 |
|-----------|----------|------|
| apps/web/src/api/extraction-tasks.ts | modified | 新增 getExtractionTask、updateExtractionTask、UpdateExtractionTaskRequest |
| apps/web/src/pages/extraction-tasks/edit-extraction-task-page.tsx | new | 編輯頁面，結構與 add 頁面一致，含 cron 反推、prefill、PATCH 提交 |
| apps/web/src/pages/extraction-tasks/extraction-task-list-page.tsx | modified | 編輯按鈕綁定 navigate + running 時 disabled |
| apps/web/src/App.tsx | modified | 新增 /extraction-tasks/:id/edit 路由 |
| apps/web/src/pages/extraction-tasks/__tests__/edit-extraction-task-page.test.tsx | new | 8 個前端測試案例 |

## 架構決策

- 編輯頁面結構完全複製自 add-extraction-task-page.tsx，差異為：
  - 載入時從 `GET /api/v1/extraction-tasks/:id` 取得既有值
  - `parseCronToSimple()` 函式將 cron 反推回 simple mode 設定
  - 提交時呼叫 `PATCH` 而非 `POST`
  - 按鈕文字為「儲存變更」而非「建立任務」
  - 標題與 Breadcrumb 為「編輯擷取任務」
- 清單頁編輯按鈕：running 狀態時 disabled，hover tooltip 顯示「任務執行中，無法編輯」
- Cron 反推支援：hourly、daily、weekly（逗號分隔）、monthly；其他格式自動切換至 advanced mode
- 使用 MemoryRouter + Routes 配合 useParams 進行測試

## 阻擋議題

無。
