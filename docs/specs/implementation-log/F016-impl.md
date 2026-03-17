---
type: implementation-log
feature_id: F016
feature_name: 資料來源狀態監控儀表板
status: complete
last_updated: 2026-03-17
---

# F016: 資料來源狀態監控儀表板 — 實作紀錄

## 測試結果摘要

| Scenario ID | 說明 | 狀態 |
|-------------|------|------|
| TS-F016-001 | 摘要統計正確（total/connected/disconnected/unknown） | PASS |
| TS-F016-002 | 類型分佈正確（typeCounts） | PASS |
| TS-F016-003 | 效能趨勢圖 24h（datapoints 結構與筆數） | PASS |
| TS-F016-004 | 效能趨勢圖 7d（時間範圍切換） | PASS |
| TS-F016-005 | 警示觸發（連續 >= 2 次失敗出現於 alerts） | PASS |
| TS-F016-006 | 警示移除（恢復連線後自動從 alerts 移除） | PASS |
| TS-F016-007 | 非 Admin 存取儀表板回傳 HTTP 403 | PASS |
| TS-F016-008 | 排除軟刪除資料來源（summary 不含已刪除） | PASS |
| TS-F016-009 | 自動健康檢查排程（僅測試未刪除資料來源） | PASS |
| TS-F016-010 | 無資料時的趨勢圖（datapoints: []） | PASS |

## 檔案變更清單

| 檔案路徑 | 變更類型 | 說明 |
|----------|---------|------|
| `packages/shared/src/index.ts` | modified | 新增 F016 共用型別：DashboardResponse、MetricsResponse、AlertsResponse 等 |
| `apps/api/src/modules/datasource/dashboard.service.ts` | new | DashboardService：getDashboard()、getMetrics()、getAlerts() |
| `apps/api/src/modules/datasource/dto/metrics-query.dto.ts` | new | MetricsQueryDto：range 參數驗證（24h/7d/30d） |
| `apps/api/src/modules/datasource/datasource.controller.ts` | modified | 新增 3 個路由：GET dashboard、GET alerts、GET :id/metrics |
| `apps/api/src/modules/datasource/datasource.module.ts` | modified | 加入 DashboardService provider，export DatasourceService |
| `apps/api/src/modules/scheduler/scheduler.module.ts` | new | SchedulerModule：匯入 ScheduleModule.forRoot() |
| `apps/api/src/modules/scheduler/health-check.service.ts` | new | HealthCheckService：@Cron 每 30 分鐘健康檢查 |
| `apps/api/src/app.module.ts` | modified | 匯入 SchedulerModule |
| `apps/api/src/modules/datasource/__tests__/dashboard.service.spec.ts` | new | DashboardService 單元測試（10 個測試） |
| `apps/api/src/modules/scheduler/__tests__/health-check.service.spec.ts` | new | HealthCheckService 單元測試（4 個測試） |
| `apps/api/test/dashboard.e2e-spec.ts` | new | Dashboard E2E 測試（11 個測試） |
| `apps/web/src/api/datasources.ts` | modified | 新增 getDashboard()、getMetrics()、getAlerts() |
| `apps/web/src/pages/datasources/dashboard-tab.tsx` | new | DashboardTab 元件：摘要卡片、圓餅圖、折線圖、狀態卡片、警示表 |
| `apps/web/src/pages/datasources/datasource-list-page.tsx` | modified | 改為頁籤式佈局（狀態總覽 + 資料來源清單） |
| `apps/web/src/pages/datasources/__tests__/dashboard-tab.test.tsx` | new | DashboardTab 前端測試（13 個測試） |
| `apps/web/src/pages/datasources/__tests__/datasource-list-page.test.tsx` | modified | 修復因新增 DashboardTab polling 導致的 fake timer 相容性問題 |

## 架構決策

1. **consecutiveFailures 在 JS 層計算**：為確保 SQLite 測試相容性，不使用 SQL 視窗函式或子查詢，而是在 DashboardService 中以 JS 迴圈從最新 health log 向後計數連續失敗。
2. **路由優先順序**：`GET /dashboard` 和 `GET /alerts` 放在 `GET /:id` 之前，避免被 `:id` 參數捕獲。`GET /:id/metrics` 也放在 `GET /:id` 之前。
3. **E2E 測試不啟動 Cron**：Dashboard E2E 測試不匯入 SchedulerModule，避免自動排程影響測試。
4. **前端 polling**：使用原生 `setInterval`（30 秒），未引入 TanStack Query 以避免增加新依賴。
5. **Recharts 測試 mock**：前端測試中 mock recharts 所有元件為簡單 div，避免 SVG 渲染問題。
6. **既有測試修復**：因 DatasourceListPage 預設顯示 DashboardTab（含 30s polling），修改既有 datasource-list-page.test.tsx 中的 `vi.runAllTimersAsync()` 為 `vi.advanceTimersByTime(1000)`，並在 renderAndLoad 中先切換至 list tab。

## 測試統計

- 後端單元測試：121 通過（12 檔案）
- 後端 E2E 測試：140 通過（10 檔案）
- 前端測試：253 通過（18 檔案）
- 新增測試數量：38（DashboardService 10 + HealthCheckService 4 + E2E 11 + 前端 13）
