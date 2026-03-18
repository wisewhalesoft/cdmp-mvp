---
type: implementation-log
feature_id: F022-F026
feature_name: Raw Data 落地前端（預覽資料連結 + 預覽頁面 + 清理）
status: complete
last_updated: 2026-03-18
---

# F022/F026: Raw Data 落地前端 — 實作日誌

## 測試結果摘要

### Phase 6: F022 日誌「預覽資料」連結（5 測試）

| Scenario ID | 描述 | 狀態 |
|-------------|------|------|
| P6-001 | completed 且 extractedCount > 0 → 顯示「預覽資料」連結 | PASS |
| P6-002 | failed 日誌 → 不顯示連結 | PASS |
| P6-003 | completed 但 extractedCount = 0 → 不顯示連結 | PASS |
| P6-004 | running 日誌 → 不顯示連結 | PASS |
| P6-005 | 連結 href 格式正確 `/extraction-tasks/${taskId}/raw-data` | PASS |

### Phase 7: F026 Raw Data 預覽頁面（29 測試）

| Scenario ID | 描述 | 狀態 |
|-------------|------|------|
| P7-API-001 | 頁面載入時呼叫 getRawData API | PASS |
| P7-STR-001 | 麵包屑顯示正確 | PASS |
| P7-STR-002 | 返回連結顯示 | PASS |
| P7-STR-003 | 頁面標題顯示 | PASS |
| P7-SUM-001 | Summary Card 顯示任務名稱 | PASS |
| P7-SUM-002 | Summary Card 顯示來源資料表 | PASS |
| P7-SUM-003 | Summary Card 顯示 raw 表名 | PASS |
| P7-SUM-004 | Summary Card 顯示千分位總筆數 | PASS |
| P7-SUM-005 | Summary Card 顯示最後更新時間 | PASS |
| P7-TBL-001 | 表格渲染正確行數 | PASS |
| P7-TBL-002 | 動態欄位標題渲染 | PASS |
| P7-TBL-003 | 資料值渲染 | PASS |
| P7-TBL-004 | 系統欄位 `_cdmp_*` 灰底樣式 | PASS |
| P7-SRT-001 | 點擊欄位標題呼叫 API（asc） | PASS |
| P7-SRT-002 | 二次點擊切換為 desc | PASS |
| P7-SRT-003 | 三次點擊清除排序 | PASS |
| P7-SRT-004 | 排序時重置到第 1 頁 | PASS |
| P7-PAG-001 | 分頁資訊顯示 | PASS |
| P7-PAG-002 | 下一頁按鈕呼叫 API | PASS |
| P7-PAG-003 | 最後一頁按鈕呼叫 API | PASS |
| P7-PAG-004 | 第一頁時停用 First/Prev 按鈕 | PASS |
| P7-PAG-005 | 每頁筆數選項 50/100/200 | PASS |
| P7-PAG-006 | 切換每頁筆數重置到第 1 頁 | PASS |
| P7-PAG-007 | 頁碼指示器顯示 | PASS |
| P7-EMP-001 | 空狀態顯示「尚未執行擷取任務」 | PASS |
| P7-EMP-002 | 空狀態顯示「立即執行」按鈕 | PASS |
| P7-LOD-001 | Loading 狀態顯示 skeleton | PASS |
| P7-WRN-001 | totalCount > 100,000 時顯示 warning banner | PASS |
| P7-WRN-002 | totalCount <= 100,000 時不顯示 warning banner | PASS |

### Phase 8: 前端清理

| 項目 | 描述 | 狀態 |
|------|------|------|
| P8-001 | `apps/web/` 無 `targetTable` 引用 | PASS（已在 Phase 1 完成） |

## 異動檔案

| 檔案路徑 | 異動類型 | 描述 |
|----------|---------|------|
| apps/web/src/pages/extraction-tasks/extraction-task-list-page.tsx | modified | 新增 ExternalLink icon import、Link import、「預覽資料」條件連結 |
| apps/web/src/api/extraction-tasks.ts | modified | 新增 getRawData API 函式、RawDataResponse import |
| apps/web/src/pages/extraction-tasks/raw-data-preview-page.tsx | new | F026 Raw Data 預覽頁面完整實作 |
| apps/web/src/App.tsx | modified | 新增 `/extraction-tasks/:taskId/raw-data` 路由 |
| apps/web/src/pages/extraction-tasks/__tests__/preview-data-link.test.tsx | new | F022 預覽資料連結測試（5 案例） |
| apps/web/src/pages/extraction-tasks/__tests__/raw-data-preview-page.test.tsx | new | F026 預覽頁面測試（29 案例） |

## 架構決策

- **預覽資料連結位置**：放在任務清單表格的「擷取筆數」欄位下方，以 `border-t border-gray-100` 分隔。條件為 `status === 'completed' && extractedCount > 0`。
- **排序三態循環**：null → asc → desc → null，與 prototype 16 一致。切換排序或每頁筆數時自動重置到第 1 頁。
- **系統欄位識別**：透過 API 回傳的 `isSystem: true` 標記，套用 `cdmp-sys-col` class（灰底）。
- **Warning Banner 閾值**：totalCount > 100,000 時顯示，與 prototype 16 設計一致。
- **排序測試**：使用 `vi.useRealTimers()` 搭配真實 setTimeout 等待，避免 fake timer 與 React 狀態更新批次處理衝突。

## 全部前端測試

- 26 個測試檔案
- 370 個測試案例
- 全部通過
