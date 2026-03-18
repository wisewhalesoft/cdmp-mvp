---
type: implementation-log
feature_id: F017
feature_name: 建立擷取任務（前端）
status: complete
last_updated: 2026-03-18
---

# F017: 建立擷取任務 — 前端實作日誌

## 測試結果摘要

| Scenario ID | 說明 | 狀態 |
|-------------|------|------|
| TS-F017-FE-001 | 顯示所有表單欄位 | PASS |
| TS-F017-FE-002 | 顯示 Breadcrumb 導航 | PASS |
| TS-F017-FE-003 | 顯示取消與建立按鈕 | PASS |
| TS-F017-FE-004 | 載入資料來源選項 | PASS |
| TS-F017-FE-005 | 預設擷取模式為全量 | PASS |
| TS-F017-FE-006 | 預設排程為簡易模式 | PASS |
| TS-F017-FE-007 | 簡易模式 — 每小時頻率顯示間隔選項 | PASS |
| TS-F017-FE-008 | 簡易模式 — 每日頻率顯示時間選擇 | PASS |
| TS-F017-FE-009 | 簡易模式 — 每週頻率顯示星期選擇 | PASS |
| TS-F017-FE-010 | 簡易模式 — 每月頻率顯示日期選擇 | PASS |
| TS-F017-FE-011 | 簡易模式 — 每日後顯示 cron 預覽 | PASS |
| TS-F017-FE-012 | 簡易模式 — 每小時間隔產生正確 cron | PASS |
| TS-F017-FE-013 | 進階模式 — 切換顯示 cron 輸入框 | PASS |
| TS-F017-FE-014 | 進階模式 — 切換回簡易模式 | PASS |
| TS-F017-FE-015 | 進階模式 — 輸入 cron 顯示預覽 | PASS |
| TS-F017-FE-016 | 選擇增量模式顯示增量欄位 | PASS |
| TS-F017-FE-017 | 切回全量模式隱藏增量欄位 | PASS |
| TS-F017-FE-018 | 空白提交顯示必填錯誤 | PASS |
| TS-F017-FE-019 | 增量模式未填增量欄位顯示錯誤 | PASS |
| TS-F017-FE-020 | 成功後顯示 Toast 並導向 /extraction-tasks | PASS |
| TS-F017-FE-021 | 提交時呼叫 API 帶正確參數 | PASS |
| TS-F017-FE-022 | 提交時按鈕顯示 loading 狀態 | PASS |
| TS-F017-FE-023 | 409 名稱重複顯示 error Toast | PASS |
| TS-F017-FE-024 | 未知錯誤顯示通用 error Toast | PASS |
| TS-F017-FE-025 | 點擊取消導向 /extraction-tasks | PASS |

**全部 25 個前端測試通過，全專案 292 個測試通過，無回歸。**

## 異動檔案

| 檔案路徑 | 異動類型 | 說明 |
|----------|---------|------|
| apps/web/src/api/extraction-tasks.ts | 新增 | API 層：createExtractionTask、getDatasourceOptions |
| apps/web/src/pages/extraction-tasks/create-extraction-task-schema.ts | 新增 | Zod 驗證 Schema，含 cron 正規表達式與增量模式 refine |
| apps/web/src/pages/extraction-tasks/add-extraction-task-page.tsx | 新增 | 新增擷取任務頁面元件 |
| apps/web/src/pages/extraction-tasks/__tests__/add-extraction-task-page.test.tsx | 新增 | 25 個前端測試場景 |
| apps/web/src/App.tsx | 修改 | 新增 /extraction-tasks/new 路由 |

## 架構決策

- 排程設定 UI 採用簡易模式（頻率選擇 + 時間/星期/日期）與進階模式（直接輸入 Cron 表達式）雙模切換，對應原型 13-add-extraction-task.html
- cronToReadable 函式直接從原型移植，不依賴外部套件（cronstrue）
- 擷取模式使用 radio card 樣式（hidden radio + styled div），與原型一致
- Zod schema 使用 refine 進行增量模式的條件式必填驗證
- 資料來源選項透過 getDatasourceOptions 在元件掛載時載入
- Cron 預覽使用 data-testid="cron-preview" 供測試定位

## 無阻塞問題
