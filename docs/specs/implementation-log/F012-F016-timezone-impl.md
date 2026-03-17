---
type: implementation-log
feature_id: F012, F016
feature_name: 前端時間欄位 UTC+8 時區轉換
status: complete
last_updated: 2026-03-17
---

# F012/F016: 前端時間欄位 UTC+8 時區轉換 — 實作紀錄

## 背景

依據 F012 BR-6 與 F016 BR-10/BR-11 規格要求，後端儲存 UTC 時間並以 ISO 8601 UTC 格式輸出，前端顯示時須轉換為 UTC+8（Asia/Taipei）。

## 測試結果摘要

| Scenario ID | 說明 | 狀態 |
|-------------|------|------|
| TS-F012-008 | 清單檢視 lastTestedAt 以 UTC+8 顯示 | PASS |
| TS-F012-008b | 卡片檢視 lastTestedAt 以 UTC+8 顯示 | PASS |
| TS-F016-011a | 儀表板狀態卡片 lastTestedAt 以 UTC+8 顯示 | PASS |
| TS-F016-011b | 告警列表 firstFailureTime 以 UTC+8 顯示 | PASS |
| TS-F016-011c | 趨勢圖 X 軸時間以 UTC+8 顯示 | PASS |
| unit-formatDateTW | formatDateTW 6 個測試案例 | PASS |
| unit-formatTimeTW | formatTimeTW 3 個測試案例 | PASS |

全量測試：19 test files, 267 tests, 全部 PASS，無回歸。

## 變更檔案

| 檔案路徑 | 變更類型 | 說明 |
|----------|---------|------|
| `apps/web/src/utils/date-utils.ts` | 新增 | 共用時間格式化工具函式 `formatDateTW`、`formatTimeTW` |
| `apps/web/src/utils/__tests__/date-utils.test.ts` | 新增 | 工具函式單元測試（9 個測試案例） |
| `apps/web/src/pages/datasources/datasource-list-page.tsx` | 修改 | 移除本地 `formatDate`，改用 `formatDateTW` |
| `apps/web/src/pages/datasources/dashboard-tab.tsx` | 修改 | 移除本地 `formatDate`，改用 `formatDateTW`/`formatTimeTW` |
| `apps/web/src/pages/datasources/__tests__/datasource-list-page.test.tsx` | 修改 | 新增 TS-F012-008 UTC+8 驗證測試（2 案例） |
| `apps/web/src/pages/datasources/__tests__/dashboard-tab.test.tsx` | 修改 | 新增 TS-F016-011 UTC+8 驗證測試（3 案例） |

## 架構決策

1. **使用瀏覽器原生 `Intl.DateTimeFormat` API**：搭配 `timeZone: 'Asia/Taipei'` 參數，不引入第三方日期庫（dayjs/date-fns），因為此專案僅需固定轉為 UTC+8
2. **`sv-SE` locale 產生 `YYYY-MM-DD HH:mm` 格式**：瑞典語 locale 原生輸出 ISO-like 格式，避免手動拼接
3. **共用工具函式集中於 `utils/date-utils.ts`**：消除原本分散在兩個元件的重複 `formatDate` 函式
4. **測試使用正規表達式匹配**：`/2026-01-15\s+22:30/`，因為 `Intl.DateTimeFormat` 在不同環境（Node.js vs jsdom）可能產生不同的空白字元（普通空格 vs 窄空格）

## 未涵蓋範圍

- `apps/web/src/pages/accounts/account-list-page.tsx` 中仍有獨立的 `formatDate` 函式，不在 F012/F016 範疇內，未進行修改
