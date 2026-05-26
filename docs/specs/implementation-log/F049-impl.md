---
type: implementation-log
feature_id: F049
feature_name: Stage 0 每日分派數量估算（v1.3 — 千分位 ratio + calendarSource + prototype 對齊）
status: complete
last_updated: 2026-05-26
---

# F049 v1.3：Stage 0 試算頁千分位 ratio + calendarSource 互動 — Implementation Log

## 範圍

依 F049 v1.3 AC-1/AC-2/AC-3/AC-4-Default、§5.1 Design A contract、§13 千分位 ratio 演算法、§8.1 UI 對齊清單落地後端 + 前端。
測試清單：後端 TS-F049-CAL-001~009、前端 TS-F049-V13F-001~009。

## 測試結果摘要

### 後端 calculateDailyEstimate（千分位 ratio + calendarSource）
| Scenario ID | 說明 | Status |
|-------------|------|--------|
| resolveCalendarDay 純函式 | weekday / weekday-only / all 三模式 isWorkday/skipReason | PASS |
| TS-F049-CAL-001 | weekday → workingDays=20；全 31 日回傳 | PASS |
| TS-F049-CAL-002 | weekday-only → workingDays=21；5/1 勞動節為工作日 | PASS（純函式覆蓋，無需 PG，見下方處置） |
| TS-F049-CAL-003 | all → workingDays=31；全部 isWorkday | PASS |
| TS-F049-CAL-004a | 20 工作日 → baseRatio=50 remainder=0；SUM=1000 | PASS |
| TS-F049-CAL-004b | 21 工作日 → baseRatio=47 remainder=13；DESC 前 13 個=48；SUM=1000 | PASS |
| TS-F049-CAL-005a | 自訂 startDate/endDate（中旬 12 天，10 工作日） | PASS |
| TS-F049-CAL-005b | 預設整月（依 ym） | PASS |
| TS-F049-CAL-006 | dailyEstimates 含所有日期；skipReason/isWorkday/ratioPerMille 正確 | PASS |
| TS-F049-CAL-007 | Design A regression guard — response 不含 total/totalEstimate/listNo；每筆不含 estimate/count | PASS |
| TS-F049-CAL-008a~c | poolCount + warning（與 ratio 計算獨立）；env threshold 可配置 | PASS |
| TS-F049-CAL-009 | workingDays=0 邊界 — 不除零；baseRatio=0/remainder=0 | PASS |

### 後端 estimateListCount + buildStage1WhereConditions（v1.2 既有，regression）
| 群組 | Status |
|------|--------|
| TS-F049-EST-001~009（純函式 + SQLite COUNT + 404/timeout） | PASS（無迴歸） |

### 後端 Controller（RBAC + query 參數）
| Scenario | Status |
|----------|--------|
| director/section_chief/plain/401 RBAC | PASS |
| v1.3：帶 calendarSource/startDate/endDate query → 傳給 service | PASS |
| v1.3：非法 calendarSource → fallback weekday | PASS |

後端 service spec 共 **38 tests PASS**、controller spec **9 tests PASS**、assignment-list 模組整體 **225 tests PASS**。

### 前端元件 v1.3 對齊 prototype
| Scenario ID | 說明 | Status |
|-------------|------|--------|
| TS-F049-V13F-001 | 初載自動選第一筆 active 名單；selector 無空選項；KPI total=per-list COUNT | PASS |
| TS-F049-V13F-002 | 無寫死 9500 regression guard | PASS |
| TS-F049-V13F-003 | 切換 calendarSource → 重新呼叫 daily-estimate 帶新參數；KPI 更新（Q2 修正） | PASS |
| TS-F049-V13F-004 | 切換起訖日 → daily-estimate 帶新 startDate/endDate | PASS |
| TS-F049-V13F-005 | 切換名單 → total 換成新 COUNT；每日件數前端重算 | PASS |
| TS-F049-V13F-006a/b | computeAdE07Distribution 件數 = round(ratioPerMille/1000×total)；isBonus | PASS |
| TS-F049-V13F-007a~e | bar `w-full`、跳過日灰 bar、bonus 深藍、件數標籤在上 | PASS |
| TS-F049-V13F-008 | 表格 pill badge：Y(rest_flg=0)/N(skipReason)/base+1（餘數補） | PASS |
| TS-F049-V13F-009 | 空狀態：無 active 名單 → selector disabled；KPI 顯示「—」；無 9500 | PASS |

前端三檔共 **37 tests PASS**（page 15 + bar-chart 14 + input-panel 8）。

## 變更檔案

| File Path | 類型 | 說明 |
|-----------|------|------|
| apps/api/src/modules/assignment-list/stage0-estimate.service.ts | modified | 新增 `CalendarSource` / `SkipReason` 型別、`resolveCalendarDay()` 純函式、`CalculateDailyEstimateOptions`；改寫 `calculateDailyEstimate(ym, opts)` 為 Design A（total-agnostic、千分位 ratio、全日期回傳）；新增 `parseYmd`/`toUtcDate` helper |
| apps/api/src/modules/assignment-list/stage0-estimate.controller.ts | modified | `dailyEstimate` 接 `calendarSource`/`startDate`/`endDate` query；非法 calendarSource fallback `weekday` |
| apps/api/src/modules/assignment-list/__tests__/stage0-estimate.service.spec.ts | modified | 移除舊「平均件數」測試；新增 `seedMay2026Calendar` helper + CAL-001~009 群組 + resolveCalendarDay 純函式測試 |
| apps/api/src/modules/assignment-list/__tests__/stage0-estimate.controller.spec.ts | modified | 對齊新簽名（`toHaveBeenCalledWith(ym, opts)`）；新增 v1.3 query 參數案例 |
| apps/web/src/api/assignment-run.ts | modified | `DailyEstimateResponse` 改為 Design A shape（calendarSource/baseRatio/remainder/dailyEstimates[].{isWorkday,skipReason,ratioPerMille}）；`getDailyEstimate(ym, opts)` 帶 query 參數 |
| apps/web/src/pages/assignment/stage0-estimate-page.tsx | modified | 移除寫死 9500（→0）；lists 載入後自動選第一筆 active；calendarSource/startDate/endDate 納入 fetch 依賴；KPI base/remainder 採後端值；表格 pill badge + 跳過日渲染；空狀態 disabled/「—」 |
| apps/web/src/pages/assignment/_components/stage0-input-panel.tsx | modified | 移除「— 請選擇 —」空選項；新增 `disabled` prop；演算法說明改 FLOOR(1000/工作日) |
| apps/web/src/pages/assignment/_components/stage0-bar-chart.tsx | modified | `computeAdE07Distribution` 改消費後端 ratioPerMille（estimate=round(ratio/1000×total)、isBonus=ratio>baseRatio）；bar `w-full`、跳過日灰 bar、件數標籤在上 |
| apps/web/src/pages/assignment/__tests__/stage0-estimate-page.test.tsx | modified | 重寫為 Design A mock shape + V13F-001~005/008/009 |
| apps/web/src/pages/assignment/_components/__tests__/stage0-bar-chart.test.tsx | modified | 重寫 ratio 模型 + V13F-006/007 |
| apps/web/src/pages/assignment/_components/__tests__/stage0-input-panel.test.tsx | modified | 新增 V13F-001（無空選項）/ V13F-009（disabled） |

## 架構決策（spec 範圍內）

- **SQLite 日期界限**：`calculateDailyEstimate` 的 `Between` 改以 `'YYYY-MM-DD'` 字串為界（非 Date 物件）。原因：TypeORM 將 Date 物件序列化為 local-time 字串（UTC+8 下 `2026-05-01T00:00Z` → `2026-05-01 08:00:00`），落在 date-only `2026-05-01` 之外 → 5/1 漏查。字串比較對 SQLite/PG 之 `date` 欄位皆正確。
- **isWorkday 於 TS 端計算**：依拍板 contract，抽純函式 `resolveCalendarDay(date, restFlg, mode)`，不使用 SQL `EXTRACT(DOW)`，使 `weekday-only` 模式可於 SQLite in-memory 完整覆蓋。
- **`toUtcDate` 容錯**：`ob_calendar.calendar_date` 在 SQLite 回字串、PG 回 Date 物件，統一轉 UTC midnight 後再算 `getUTCDay()`。
- **前端 total 來源**：移除寫死 9500，total 一律來自選取名單 per-list COUNT（§5.2 estimate API）；空狀態顯示「—」。
- **預估總筆數 input 保留可編輯**：對齊 prototype（editable input），惟頁面之 totalCount 由 listNo 之 per-list COUNT 驅動（切換名單即覆寫），與 spec「total=per-list COUNT」一致。

## CAL-002 處置（weekday-only / EXTRACT(DOW)）

測試設計原標 CAL-002 為「中（需 PG TestContainer）」因 `weekday-only` 模式語意對應 `EXTRACT(DOW)`。
**本實作將 isWorkday/weekday 計算改於 TS 端（`resolveCalendarDay`，以 `Date.getUTCDay()` 判週末），不下放至 SQL**，故 CAL-002 已可用 SQLite in-memory + 純函式完整覆蓋，**無需 PG TestContainer，未標 skip，全綠**。此為 spec §5.1「isWorkday 與 weekday 在 TS 端計算」之拍板方向。

## 全套測試結果

- **後端 api（`npx vitest run`）**：1622 passed / 18 failed（pre-existing，與 F049 無關）/ 67 skipped。
  - 失敗檔（已以 `git stash` 驗證為 baseline 既有失敗）：`etl/engine-target-load`（任務指明的未提交變更）、`etl/target-table-schemas`、`etl/target-table.service`、`etl/fn-calc-tier-level`、`extraction-task/{postgresql,mssql,mysql}-executor`、`assignment/services/assignment-run-report*`、`assignment/services/assignment-run-snapshot`、`assignment-stage/legacy-grep-regression`。均非 assignment-list / stage0。
- **前端 web（`npx vitest run`）**：1285 passed / 6 failed（pre-existing，與 F049 無關）/ 29 skipped。
  - 失敗檔：`__tests__/no-ob-code-df-references.regression`（F068 殘留掃描，與 stage0 無關）、`c360/customer-detail-page`、`c360/customer-list-page`、`etl-pipelines/target-tables-page`、`etl-pipelines/editor/load-properties`。均非 stage0。
- **F049 新增/相關案例**：後端 47（service 38 + controller 9）+ 前端 37 = **84 tests 全綠**。

## 偏離 spec / prototype 需主流程確認之處

無。已嚴格對齊 prototype `30-stage0-estimate.html` 之 `recompute()` / `buildCalendar()`（三模式、跳過日灰 bar、KPI 千分位、pill badge、bar `w-full`、件數標籤在上、selector 無空選項）。

Prototype Structure Diff Gate：`30-stage0-estimate.html` 於 sidebar「客戶名單分派」collapsible 下為獨立 item，header 為靜態 `h1`（非 breadcrumb），既有 React `AppLayout title="Stage 0 試算"` 與之一致；本任務僅改頁面本體 + API，未涉導航/shell 結構，無 divergence。
