---
type: implementation-log
feature_id: F025
feature_name: 刪除擷取任務（前端）
status: complete
last_updated: 2026-03-19
---

# F025: 刪除擷取任務 — 前端實作日誌

## 測試結果摘要

| 測試案例 | 狀態 |
|----------|------|
| 對話框渲染（含任務名稱與警告訊息） | PASS |
| 對話框 open=false 不渲染 | PASS |
| 確認刪除按鈕觸發 onConfirm | PASS |
| 取消按鈕觸發 onCancel | PASS |
| 點擊 overlay 觸發 onCancel | PASS |
| loading 狀態按鈕 disabled | PASS |
| 清單頁：刪除按鈕開啟確認對話框 | PASS |
| 清單頁：確認刪除呼叫 deleteExtractionTask API | PASS |
| 清單頁：取消關閉對話框 | PASS |
| 清單頁：409 錯誤顯示執行中 toast | PASS |

共 431 個前端測試通過（421 個既有 + 10 個新增 F025）。

## 變更檔案

| 檔案路徑 | 變更類型 | 說明 |
|-----------|----------|------|
| apps/web/src/api/extraction-tasks.ts | modified | 新增 `deleteExtractionTask(id)` API 函式 |
| apps/web/src/pages/extraction-tasks/delete-task-dialog.tsx | new | 刪除確認對話框元件（紅色警告風格） |
| apps/web/src/pages/extraction-tasks/extraction-task-list-page.tsx | modified | 接入刪除按鈕事件 + 對話框 + Toast 回饋 |
| apps/web/src/pages/extraction-tasks/__tests__/delete-task-dialog.test.tsx | new | 對話框單元測試 + 清單頁整合測試，共 10 個案例 |

## 架構決策

- 刪除操作一律需確認對話框（與停用不同，刪除為不可逆操作需更強警示）
- 對話框採用紅色警告風格（紅色確認按鈕、警告圖示），參考原型設計
- Running 狀態任務的刪除按鈕設為 disabled，前後端雙重防護
- 409 EXTRACTION_RUNNING 錯誤顯示「任務執行中，無法刪除」toast 提示
- 刪除成功後自動重新載入任務清單

## 阻擋議題

無。
