---
type: implementation-log
feature_id: F020
feature_name: 啟用／停用擷取任務（前端）
status: complete
last_updated: 2026-03-18
---

# F020: 啟用／停用擷取任務 — 前端實作日誌

## 測試結果摘要

| 測試案例 | 狀態 |
|----------|------|
| 對話框渲染（含任務名稱） | PASS |
| 對話框 open=false 不渲染 | PASS |
| 確認按鈕觸發 onConfirm | PASS |
| 取消按鈕觸發 onCancel | PASS |
| 點擊 overlay 觸發 onCancel | PASS |
| 清單頁：停用按鈕開啟確認對話框 | PASS |
| 清單頁：啟用按鈕直接呼叫 API | PASS |
| 清單頁：確認停用呼叫 toggleExtractionTask | PASS |
| 清單頁：取消關閉對話框 | PASS |

共 323 個前端測試通過（314 個既有 + 9 個新增 F020）。

## 變更檔案

| 檔案路徑 | 變更類型 | 說明 |
|-----------|----------|------|
| apps/web/src/api/extraction-tasks.ts | modified | 新增 `toggleExtractionTask()` API 函式 |
| apps/web/src/pages/extraction-tasks/toggle-task-dialog.tsx | new | 停用確認對話框元件 |
| apps/web/src/pages/extraction-tasks/extraction-task-list-page.tsx | modified | 接入 toggle 按鈕事件 + 對話框 + Toast |
| apps/web/src/pages/extraction-tasks/__tests__/toggle-task-dialog.test.tsx | new | 對話框單元測試 + 清單頁整合測試 |

## 架構決策

- 停用操作需確認對話框，啟用操作直接呼叫 API（無需確認）
- Running 任務的 toggle 按鈕設為 disabled
- 409 EXTRACTION_RUNNING 錯誤顯示「任務執行中，請等待完成後再停用」toast
- 對話框參考原型 12-extraction-management.html：黃色警告圖示、紅色確認按鈕

## 阻擋議題

無。
