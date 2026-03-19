# F024: 擷取監控儀表板 — 實作日誌

## 實作日期
2026-03-19

## 變更摘要

### 新增檔案
| 檔案 | 說明 |
|------|------|
| `apps/api/src/modules/extraction-task/extraction-dashboard.service.ts` | Dashboard 服務：統計卡片、執行中任務、今日失敗、效能最差 Top 5、趨勢圖 |
| `apps/api/src/modules/extraction-task/dto/dashboard-trend.dto.ts` | 趨勢圖 range 參數 DTO（白名單驗證 7d/14d/30d） |
| `apps/api/test/extraction-dashboard.e2e-spec.ts` | 11 個 E2E 測試場景（TS-F024-001 ~ 011） |
| `apps/web/src/pages/extraction-tasks/extraction-dashboard-tab.tsx` | 儀表板頁籤前端組件 |
| `apps/web/src/pages/extraction-tasks/__tests__/extraction-dashboard-tab.test.tsx` | 8 個前端組件測試 |

### 修改檔案
| 檔案 | 變更 |
|------|------|
| `packages/shared/src/index.ts` | 新增 F024 Dashboard 相關型別 |
| `apps/api/src/modules/extraction-task/extraction-task.controller.ts` | 新增 `GET dashboard` 和 `GET dashboard/trend` 路由（置於 `:id` 之前） |
| `apps/api/src/modules/extraction-task/extraction-task.module.ts` | 註冊 ExtractionDashboardService |
| `apps/web/src/api/extraction-tasks.ts` | 新增 `getExtractionDashboard()` 和 `getExtractionDashboardTrend()` |
| `apps/web/src/pages/extraction-tasks/extraction-task-list-page.tsx` | 預設頁籤改為 dashboard（BR-5）、引入 ExtractionDashboardTab |
| `apps/web/src/pages/extraction-tasks/__tests__/extraction-task-list-page.test.tsx` | 新增 dashboard mock、測試先切換至 list 頁籤 |
| `apps/web/src/pages/extraction-tasks/__tests__/preview-data-link.test.tsx` | 同上 |
| `apps/web/src/pages/extraction-tasks/__tests__/run-extraction-task.test.tsx` | 同上 |
| `apps/web/src/pages/extraction-tasks/__tests__/toggle-task-dialog.test.tsx` | 同上 |

## API 端點

### GET /api/v1/extraction-tasks/dashboard
- 回傳 summary（totalTasks, running, todaySuccess, todayFailed, successRate）
- 回傳 runningTasks（含 datasourceName、progressPercent）
- 回傳 todayFailures（含 taskName、failedAt、errorSummary、logId）
- 回傳 slowestTasks（Top 5，依 avgDurationMs DESC）

### GET /api/v1/extraction-tasks/dashboard/trend?range=7d|14d|30d
- 回傳 datapoints（按日期分組的成功/失敗次數）
- range 參數白名單驗證，無效值回傳 422

## 技術決策

1. **路由順序**：`GET dashboard` 和 `GET dashboard/trend` 必須在 `GET :id` 之前註冊，否則 NestJS 會將 `dashboard` 匹配為 UUID 參數
2. **今日判定**：沿用 F018 findAll 的 UTC+8 計算邏輯（`getTodayRangeUTC()`）
3. **成功率**：`todaySuccess / (todaySuccess + todayFailed) * 100`，無紀錄時為 0（BR-3）
4. **軟刪除排除**：所有統計查詢加 `deleted_at IS NULL`（BR-7）
5. **趨勢圖**：在應用層按日期分組（因 SQLite 與 PostgreSQL 的 date trunc 語法不同），使用 UTC+8 轉換後取日期字串
6. **趨勢圖呈現**：使用純 CSS bar 而非 Chart.js，避免引入額外 canvas 依賴並簡化測試
7. **Polling**：前端 5 秒間隔（spec 規定），不同於任務清單的 3 秒
8. **預設頁籤**：改為 dashboard（BR-5），既有測試更新為先切換至 list 頁籤

## 測試結果

- 後端 E2E：11/11 passed
- 前端組件：8/8 passed
- 既有測試迴歸：154/154 passed（全部通過）
