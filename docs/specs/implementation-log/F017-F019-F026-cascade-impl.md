---
type: implementation-log
feature_id: F017, F019, F026
feature_name: 連鎖下拉選單、變更警告 Modal、sourceSchema 顯示
status: complete
last_updated: 2026-03-18
---

# F017/F019/F026: 連鎖下拉選單 + 變更警告 Modal + sourceSchema 顯示 -- 前端實作日誌

## 實作範圍

### Phase 6: 前端連鎖下拉選單（Add + Edit 頁面）
- Add 頁面：sourceTable 文字 Input 改為 Schema/Table 連鎖下拉 select
- Edit 頁面：同上，並支援既有值預選（並行載入 schemas + tables API）
- API 層新增 `getDatasourceSchemas` 和 `getDatasourceTables`

### Phase 7: F019 變更警告 Modal
- 當 `executionCount > 0` 且使用者變更 sourceSchema 或 sourceTable 時顯示警告 Modal
- Modal 提供「確認變更」與「取消」按鈕
- 取消時回復原值

### Phase 8: F026 sourceSchema 顯示
- Raw Data 預覽頁面的來源資料表顯示改為 `schema.table` 格式（sourceSchema 有值時）

## 測試結果摘要

| Scenario ID | 描述 | 狀態 |
|-------------|------|------|
| TS-F017-FE-001 | 初始狀態 -- Schema 與 Table 下拉 disabled | PASS |
| TS-F017-FE-002 | 選定 Datasource 後自動載入 Schema 列表 | PASS |
| TS-F017-FE-003 | 選定 Schema 後自動載入 Table 列表 | PASS |
| TS-F017-FE-004 | 變更 Datasource 時重置 Schema 與 Table | PASS |
| TS-F017-FE-005 | Schema 載入失敗顯示錯誤訊息，下拉停用 | PASS |
| TS-F017-FE-006 | Table 載入失敗顯示錯誤訊息 | PASS |
| TS-F019-FE-001 | 表單開啟時自動載入並預選既有 schema/table | PASS |
| TS-F019-FE-002 | 表單開啟時並行呼叫 schemas + tables API | PASS |
| TS-F019-FE-003 | 變更 Datasource 時重置並重新載入 | PASS |
| TS-F019-FE-004 | 變更 Schema 時重置 Table 並重新載入 | PASS |
| TS-F019-FE-005 | 連線失敗時下拉停用 | PASS |
| TS-F019-FE-006 | 變更 sourceTable 時顯示警告 Modal（executionCount > 0） | PASS |
| TS-F019-FE-007 | 變更 sourceSchema 時也觸發警告 Modal | PASS |
| TS-F019-FE-008 | 點擊「確認變更」-- 值保留 | PASS |
| TS-F019-FE-009 | 點擊「取消」-- 回復原值 | PASS |
| TS-F019-FE-010 | executionCount = 0 時不顯示警告 | PASS |
| F026-sourceSchema-有值 | 來源表顯示為 public.customers | PASS |
| F026-sourceSchema-null | sourceSchema=null 時顯示為 customers | PASS |

## 變更檔案

| 檔案路徑 | 變更類型 | 描述 |
|----------|---------|------|
| apps/web/src/api/datasources.ts | modified | 新增 `getDatasourceSchemas` 和 `getDatasourceTables` API 函數 |
| apps/web/src/api/extraction-tasks.ts | modified | 介面新增 `sourceSchema` 欄位 |
| apps/web/src/pages/extraction-tasks/create-extraction-task-schema.ts | modified | Zod schema 新增 `sourceSchema` optional 欄位 |
| apps/web/src/pages/extraction-tasks/add-extraction-task-page.tsx | modified | sourceTable Input 改為 Schema/Table 連鎖下拉 select |
| apps/web/src/pages/extraction-tasks/edit-extraction-task-page.tsx | modified | 連鎖下拉 + 預選 + 警告 Modal |
| apps/web/src/pages/extraction-tasks/raw-data-preview-page.tsx | modified | 來源資料表顯示改為 sourceSchema.sourceTable 格式 |
| apps/web/src/pages/extraction-tasks/__tests__/add-extraction-task-page.test.tsx | modified | 新增 6 個連鎖下拉測試，更新既有測試適配新 UI |
| apps/web/src/pages/extraction-tasks/__tests__/edit-extraction-task-page.test.tsx | modified | 新增 10 個測試（5 連鎖下拉 + 5 警告 Modal） |
| apps/web/src/pages/extraction-tasks/__tests__/raw-data-preview-page.test.tsx | modified | 新增 2 個 sourceSchema 顯示測試 |

## 架構決策

- **連鎖下拉使用 `useEffect` 監聽 form 值**：Add 頁面透過 `watch('datasourceId')` 和 `watch('sourceSchema')` 驅動 cascade effect
- **Edit 頁面初始載入使用 `Promise.all`**：並行載入 schemas + tables 以減少載入時間，避免多次 cascade effect 觸發
- **Edit 頁面 cascade 使用 `useRef` 標記**：`cascadeInitialized` ref 防止初始載入時 cascade effect 重複執行
- **警告 Modal 使用 pending value pattern**：`pendingSchemaValue` / `pendingTableValue` ref 暫存待確認的值，取消時回復原值
- **Zod schema `sourceTable` 錯誤訊息**：從「請輸入來源資料表」改為「請選擇來源資料表」以配合 select UI

## 測試總數

- 修改前：370 tests passing
- 修改後：388 tests passing（+18 新增測試）
