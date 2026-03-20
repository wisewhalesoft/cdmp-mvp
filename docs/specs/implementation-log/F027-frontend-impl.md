---
type: implementation-log
feature_id: F027
feature_name: 查看 Pipeline 列表（前端）
status: complete
last_updated: 2026-03-20
---

# F027: 查看 Pipeline 列表 — 前端實作日誌

## 測試結果摘要

| Scenario ID | 說明 | 狀態 |
|-------------|------|------|
| FE-001 | 統計卡片渲染正確數值 | PASS |
| FE-002 | Pipeline 表格渲染所有列 | PASS |
| FE-003 | 空狀態顯示 | PASS |
| FE-004 | 分頁資訊顯示 | PASS |
| FE-005 | 搜尋輸入框與狀態篩選器存在 | PASS |
| FE-006 | 狀態 Badge 顯示 | PASS |
| FE-007 | 版本號帶 "v" 前綴 | PASS |
| FE-008 | 側邊欄 ETL Pipeline 連結高亮 | PASS |

共 439 個前端測試通過（431 個既有 + 8 個新增 F027）。

## 變更檔案

| 檔案路徑 | 變更類型 | 說明 |
|-----------|----------|------|
| apps/web/src/api/etl-pipelines.ts | new | 前端 API 層，含 getPipelineStats() 與 getPipelines() |
| apps/web/src/pages/etl-pipelines/pipeline-list-page.tsx | new | Pipeline 列表頁面元件，含統計卡片、搜尋篩選、表格、分頁 |
| apps/web/src/pages/etl-pipelines/__tests__/pipeline-list-page.test.tsx | new | 8 個前端測試 |
| apps/web/src/App.tsx | modified | 新增 `/etl-pipelines` 路由 |
| packages/shared/src/index.ts | modified | 新增 Pipeline 相關共用型別 |

## 架構決策

- **頁面結構**：參考 prototypes/17-pipeline-management.html 原型設計，含 5 張統計卡片、搜尋篩選列、Pipeline 表格、分頁元件
- **狀態 Badge 顏色**：依 UI 規格 draft（灰）、active（綠）、running（藍，含 pulse 動畫）、failed（紅）、disabled（黃）
- **版本顯示**：`v{version}` 格式
- **時間格式**：使用既有 `formatDateTW()` 轉換為 UTC+8 `YYYY-MM-DD HH:mm` 格式
- **路由**：`/etl-pipelines`，使用 `AdminRoute` 包裝
- **側邊欄導航**：新增 ETL Pipeline 項目，使用 lucide-react 的 Workflow 圖示
