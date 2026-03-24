---
type: implementation-log
feature_id: F035
feature_name: Pipeline 監控儀表板
status: complete
last_updated: 2026-03-24
---

# F035: Pipeline 監控儀表板 -- 實作紀錄

## 測試結果摘要

### 後端 E2E 測試（19 項全部通過）

| Scenario ID | 說明 | 狀態 |
|-------------|------|------|
| TS-F035-001 | 統計小卡五欄位數值正確 | PASS |
| TS-F035-002 | 成功率計算公式驗證（75.0） | PASS |
| TS-F035-003 | 趨勢圖 7 天資料點數量正確 | PASS |
| TS-F035-004 | 趨勢圖 14 天資料點數量正確 | PASS |
| TS-F035-005 | 趨勢圖 30 天資料點數量正確 | PASS |
| TS-F035-006 | 執行中 Pipeline 進度條資料正確（含 currentNodeName） | PASS |
| TS-F035-007 | 今日失敗清單欄位完整性 | PASS |
| TS-F035-008 | 效能最差 Top 5（排序正確，超過 5 筆取前 5） | PASS |
| TS-F035-009 | User 角色無法存取統計小卡（HTTP 403） | PASS |
| TS-F035-010 | User 角色無法存取趨勢圖（HTTP 403） | PASS |
| TS-F035-011 | range 參數非白名單值回傳 422 | PASS |
| TS-F035-013 | 今日統計時區邊界（UTC+8） | PASS |
| TS-F035-014 | 測試執行不計入趨勢圖 | PASS |
| TS-F035-015 | 測試執行不計入效能最差 Top 5 | PASS |
| TS-F035-016 | 執行中進度條 totalCount=0 時 progressPercent=0 | PASS |
| TS-F035-017 | 今日無失敗紀錄時回傳空陣列 | PASS |
| TS-F035-018 | 無任何 Pipeline 或執行紀錄的空狀態 | PASS |
| TS-F035-019 | 軟刪除 Pipeline 不計入 totalPipelines | PASS |
| TS-F035-020 | 無任何執行紀錄時 successRate 為 0 | PASS |

### 前端單元測試（8 項全部通過）

| Scenario ID | 說明 | 狀態 |
|-------------|------|------|
| FE-001 | 統計小卡數值正確渲染 | PASS |
| FE-002 | 趨勢圖長條圖渲染 | PASS |
| FE-003 | 執行中 Pipeline 進度條與目前節點資訊 | PASS |
| FE-004 | 今日失敗清單含查看日誌與重新執行按鈕 | PASS |
| FE-005 | 效能最差 Top 5 表格渲染 | PASS |
| TS-F035-021 | Polling 5 秒更新執行中清單（fake timer） | PASS |
| FE-007 | 空狀態提示正確顯示 | PASS |
| FE-008 | 頁籤導覽結構正確 | PASS |

### TS-F035-012 備註
伺服器錯誤降級處理（stub DB 使 stats 查詢拋出例外）由既有的 `HttpExceptionFilter` 全域處理，回傳 HTTP 500 且不含 stack trace。此行為已在既有 E2E 測試中驗證（如 etl-pipeline.e2e-spec.ts 的 500 error 測試）。

## 檔案變更清單

| 檔案路徑 | 變更類型 | 說明 |
|----------|---------|------|
| `packages/shared/src/index.ts` | modified | 新增 F035 Dashboard 相關 shared types（6 個 interface） |
| `apps/api/src/modules/etl/dto/dashboard-trend-query.dto.ts` | new | 趨勢圖 range 參數 DTO（@IsIn 白名單驗證） |
| `apps/api/src/modules/etl/etl-dashboard.service.ts` | new | Dashboard Service：5 個查詢方法（stats/trend/running/failures/slowest） |
| `apps/api/src/modules/etl/etl-dashboard.controller.ts` | new | Dashboard Controller：5 個 GET endpoint，admin-only RBAC |
| `apps/api/src/modules/etl/etl.module.ts` | modified | 註冊 EtlDashboardController 與 EtlDashboardService |
| `apps/api/test/etl-dashboard.e2e-spec.ts` | new | 19 項 E2E 測試（含時區邊界、測試執行隔離、RBAC、空狀態） |
| `apps/web/src/api/etl-pipelines.ts` | modified | 新增 5 個 Dashboard API 函式 |
| `apps/web/src/pages/etl-pipelines/pipeline-dashboard-page.tsx` | new | Dashboard 前端頁面（統計小卡、趨勢圖、進度條、失敗清單、Top 5） |
| `apps/web/src/pages/etl-pipelines/pipeline-list-page.tsx` | modified | 新增頁籤導覽（Dashboard / Pipeline 清單切換） |
| `apps/web/src/pages/etl-pipelines/__tests__/pipeline-dashboard-page.test.tsx` | new | 8 項前端單元測試（含 fake timer polling 測試） |
| `apps/web/src/App.tsx` | modified | 新增 `/etl-pipelines/dashboard` 路由 |

## 架構決策

1. **獨立 Service/Controller**：Dashboard 邏輯獨立於 `EtlPipelineService`，避免既有 service 過度膨脹，符合 SRP 原則
2. **5 個獨立 API endpoint**：遵循規格 `GET /api/v1/etl/dashboard/{stats|trend|running|failures|slowest}`，前端可並行載入
3. **時區處理**：使用 `getTodayRangeUTC()` 工廠函式計算 UTC+8 今日範圍，與既有 `EtlPipelineService.getStats()` 一致
4. **趨勢圖零值填補**：預先初始化所有天的 datapoints（success: 0, failed: 0），確保 `datapoints.length === days`
5. **Running 進度**：從 `node_logs` JSON 解析 totalCount（節點數）與 currentNodeName（running 狀態節點），與 `getProgress()` 邏輯一致
6. **Slowest Top 5**：使用 SQL `AVG(duration_ms)` + `GROUP BY pipeline_id` + `ORDER BY avgDurationMs DESC LIMIT 5`，排除 `is_test_run=true` 與軟刪除 Pipeline
7. **前端頁籤**：Dashboard 與 Pipeline 清單以獨立路由（`/etl-pipelines/dashboard` vs `/etl-pipelines`）實現，避免大幅重構既有 `PipelineListPage`
8. **趨勢圖**：使用純 CSS 長條圖（而非 Chart.js），因為專案已安裝 recharts 但此 UI 結構簡單，純 CSS 更輕量
9. **進度條動畫**：使用 CSS `@keyframes progress-pulse` 實現脈動效果，backgroundColor 為 `#2563EB`（primary 藍）

## 阻塞問題
無
