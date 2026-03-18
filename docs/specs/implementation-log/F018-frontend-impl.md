---
type: implementation-log
feature_id: F018
feature_name: 查看擷取任務清單（前端）
status: complete
last_updated: 2026-03-18
---

# F018: 查看擷取任務清單 — 前端實作記錄

## 測試結果摘要

| Scenario ID | 描述 | 狀態 |
|-------------|------|------|
| TS-F018-FE-001 | 渲染頁面標題「資料擷取管理」 | PASS |
| TS-F018-FE-002 | 渲染任務清單（三筆測試資料） | PASS |
| TS-F018-FE-003 | 摘要卡片顯示正確數值 | PASS |
| TS-F018-FE-004 | 表格欄位標題完整 | PASS |
| TS-F018-FE-005 | 模式 Badge 顯示（全量/增量） | PASS |
| TS-F018-FE-006 | 狀態 Badge 顯示（running/completed/failed） | PASS |
| TS-F018-FE-007 | 分頁資訊顯示 | PASS |
| TS-F018-FE-008 | 搜尋輸入框存在 | PASS |
| TS-F018-FE-009 | 搜尋 debounce 300ms 後呼叫 API | PASS |
| TS-F018-FE-010 | 狀態篩選器存在 | PASS |
| TS-F018-FE-011 | 模式篩選器存在 | PASS |
| TS-F018-FE-012 | 空狀態顯示提示訊息 | PASS |
| TS-F018-FE-013 | 空狀態顯示建立按鈕 | PASS |
| TS-F018-FE-014 | Sidebar 資料擷取連結為 active 狀態 | PASS |

## 變更檔案

| 檔案路徑 | 變更類型 | 描述 |
|----------|---------|------|
| packages/shared/src/index.ts | modified | 新增 F018 共用型別：ExtractionTaskListQuery, ExtractionTaskListItem, ExtractionTaskListSummary, ExtractionTaskListResponse |
| apps/web/src/api/extraction-tasks.ts | modified | 新增 getExtractionTasks API 函式，匯入共用型別 |
| apps/web/src/pages/extraction-tasks/extraction-task-list-page.tsx | new | 擷取任務清單頁面，含摘要卡片、篩選工具列、任務表格、分頁、空狀態 |
| apps/web/src/App.tsx | modified | 新增 /extraction-tasks 路由 |
| apps/web/src/pages/extraction-tasks/__tests__/extraction-task-list-page.test.tsx | new | 14 個前端測試案例 |

## 架構決策

- 頁面結構與 datasource-list-page.tsx 保持一致的 Sidebar + Header + Tab + Content 模式
- Tab 預設為「任務清單」（list），「監控儀表板」（dashboard）顯示「即將推出」佔位（F024 範圍）
- 搜尋 debounce 使用 useRef + setTimeout 模式（與 datasource-list-page 一致）
- 摘要卡片使用 data-testid 屬性便於測試定位
- 「資料來源」文字同時出現在 Sidebar 和表格標題中，測試使用 getAllByText 避免衝突
