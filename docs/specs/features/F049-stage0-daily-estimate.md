---
spec-id: F049
title: Stage 0 每日分派數量估算
feature-id: F049
source-story: US-071, US-132, US-135
epic: E07
module: M01 名單定義
priority: P0-MVP
version: "1.4"
date: 2026-05-26
status: Draft
---

# F049: Stage 0 每日分派數量估算（含單一 LIST_NO 案件試算）

Priority: P0-MVP | Status: Draft | Last Updated: 2026-05-26

> **v1.4（2026-05-26 / estimate 語意升級為完整 Stage 1 dry-run，對齊 F092 / AD-E07-23）**：[F092](F092-stage1-dry-run-estimate.md)（Stage 1 精確化工程 Phase 3）已落地，將 per-list estimate 從「欄位篩選版 COUNT」升級為**完整 Stage 1 篩選鏈之唯讀 dry-run COUNT**（複用 `executeStage1Chain({ dryRun: true })`，[F091](F091-stage1-complete-month-cnt-dedup-special-delete.md) `Stage1FilterChain`）。本版同步更新 estimate 語意之文字漂移：
> 1. **§6 BR-6 改寫**：原「估算為條件符合上界（不含 month_cnt/去重/特殊 DELETE，實際更少）」→ 升級為「**完整 Stage 1 預估（≡ 月跑分派案件數）**」，已含 MONTH_CNT 期別過濾 + 近 3 個月去重（含 `data_source` 聯集）+ 特殊 DELETE（含詐騙白牌 `LIST_TYPE='01' AND SPEC_NAME LIKE '%白牌%'`）。保留 BR-1（試算唯讀預覽、最終以月跑為準）。歷史語意保留為紀錄。
> 2. **§4 AC-4 對齊**：篩選機制由「複用 `buildStage1WhereConditions()`（欄位篩選）」更新為「複用完整鏈 `executeStage1Chain(..., { dryRun: true })`」，並標明為唯讀 dry-run（不寫表）。
> 3. **§5.2 estimate API**：response shape 不變（`{ listNo, count }`），`count` 語意升級為完整鏈 dry-run COUNT（精確 ≡ 月跑），補逾時風險說明。
> 4. **交叉引用**：[F091](F091-stage1-complete-month-cnt-dedup-special-delete.md)（三步驟 SP 對照）、[F092](F092-stage1-dry-run-estimate.md)（dry-run 升級 + §11 對 F049 影響表）、[architecture-spec.md AD-E07-23](../architecture-spec.md)（Stage1FilterChain 單一來源）。
> 5. **不變更**：千分位 ratio 演算法（§13）、AC-1~AC-3 / AC-4-Default / AC-5 / AC-Banner-Entry、§5.1 daily-estimate API、§8 UI/UX、BR-1~BR-5、§11~§13 均原樣保留（本版僅同步 estimate「語意定義」之文字，不變更 ratio 演算法或入口規範）。
> 6. **刻意未動**：code / test（F092 已落地實作，本版僅同步 docs 文字漂移）、architecture-spec.md / data-model.md（system-architect 範疇）。
>
> **v1.3（2026-05-26 / Stage 0 試算頁對齊 prototype 30-stage0-estimate.html + 千分位 ratio 演算法 + calendarSource 互動）**：使用者回報 `/assignment/estimate` 試算頁 React 實作（`apps/web/src/pages/assignment/stage0-estimate-page.tsx` + `_components/stage0-input-panel.tsx` + `_components/stage0-bar-chart.tsx`）與 prototype `30-stage0-estimate.html` 脫節之 4 個問題，已拍板修法並寫入本版。核心變更：
> 1. **§5.1 GET daily-estimate API 改寫（千分位 ratio 模型 + 三參數互動）**：新增 query 參數 `calendarSource`（`weekday` 預設 / `weekday-only` / `all`）、`startDate` / `endDate`（選填，預設 = ym 整月）；`dailyEstimates[]` 由「僅工作日 + 直接件數」改為「**範圍內所有日期**，每筆含 `{ date, weekday, isWorkday, skipReason, ratioPerMille }`」，使非工作日（週末 / 國定假日）以「跳過」列呈現（對齊 prototype 灰 bar）。明述 `ratioPerMille` 加總 = 1000（跨工作日）。
> 2. **新增 AD-E07-8 演算法定義（修正 §11 A-2 與既有「平均件數」描述）**：採原系統 ground-truth SP `Stage0_估算每日分派案件數量.sql` 之**千分位 ratio 模型** —— `base_ratio = FLOOR(1000 / workingDays)`、`rem = 1000 mod workingDays`、工作日按 `calendar_date DESC` 排序前 `rem` 個 `ratio = base_ratio + 1`、非工作日 `ratio = 0`；**每日件數 = round(ratioPerMille / 1000 × total)**，total 為前端輸入（選取名單之 per-list COUNT，AC-4）。後端僅算 ratio 分配（calendar 相依），前端負責乘 total（total 相依），與 SP「存 `RATIO_RATE`、件數於後段套用」分工一致（詳見 §13）。
> 3. **`calendarSource` → `ob_calendar` 對應**：`weekday` = `rest_flg = '0'`（排除週末 + 國定假日，預設）；`weekday-only` = `EXTRACT(DOW) NOT IN (0,6)`（僅排除週末，含假日）；`all` = 不排除（含週末與假日）。資料來源 `ob_calendar`（由 ETL Job E07-OBCALENDAR-Load / E04+E05 載入；已確認 2026-05 有 31 日 / 20 工作日資料）。
> 4. **§4 / §8 UI 修正對齊 prototype**：(a) LIST_NO selector **預設自動選第一筆 active 名單、移除 React 自加的「— 請選擇 —」空選項**（prototype select 直接從第一個 option 開始）；無 active 名單→空狀態（selector disabled、KPI 顯示「—」）。(b) total 總筆數 = 選取名單 per-list COUNT（複用 §5.2 estimate），**移除寫死 9500 magic number**。(c) `poolCount` 僅供 AC-3 Pool 偏低警示，不再當 total。(d) bar chart：bar `w-full` 填滿欄、顯示跳過日（灰 bar）、標籤順序對齊 prototype（件數在上）。(e) KPI：`base = FLOOR(1000/工作日)`（千分位 ‰）、`remainder = 1000 mod 工作日`。(f) 表格 pill badge：`Y (rest_flg=0)` / `N (週末·國定假日)` / `base+1（餘數補）`。
> 5. **不變更**：AC-Banner-Entry（入口規範）、AC-3 Pool 警示門檻、AC-4 per-list 試算篩選機制（複用 `buildStage1WhereConditions()`）、AC-5 逾時保護、§5.2 estimate API、BR-1~BR-6、§12 OQ 均原樣保留。§11 A-2 演算法描述由「等分」更新為「千分位 ratio」。
> 6. **刻意未動（邊界）**：本版**僅編輯本 feature 檔**。`architecture-spec.md`（AD-E07-8 之權威定義位置、§E07-C ETL）、React / service code（`stage0-estimate.service.ts`、頁面元件）、test 檔均**不變更**，由 system-architect / tdd-implementation 後續落地；本檔以 [ASSUMPTION] 標注須由 architecture-spec.md 承載之項目。
>
> **v1.2.1（2026-05-26 / SP 溯源驗證 + 估算範圍澄清 + caseyear '99' follow-up）**：以原系統 ground-truth SP `SP_INFOT_ASSIGNEXPORTNAMELIST_st1_list`（Stage 1 實際撈案 SP）驗證 v1.2 之欄位映射與篩選範圍，**不變更任何篩選行為**。核心補述：
> 1. **§4 AC-4 篩選機制表下方新增「SP 溯源驗證」註記**：欄位映射 `case_status → ob_pool_data.list_type`、`caseyear → year_cnt` 已對照 SP 確認逐欄位吻合（SP 以 `o.LIST_TYPE IN (split(OBMLISTDF.LIST_TYPE))`、`o.YEAR_CNT IN (split(CASEYEAR))` 撈案；新系統 AD-E07-14 將原 `OBMLISTDF.LIST_TYPE` 期別語意拆為 `case_status`、`list_type` 改填常數 '01'）。
> 2. **§6 新增 BR-6「估算為條件符合上界」**：Stage 0 per-list 試算僅套用名單欄位篩選條件，不含月跑 Stage 1 額外施加的 `MONTH_CNT`（list_period × interval）區間過濾、近 3 個月已派案去重、詐騙/中結/滿期等特殊 DELETE 規則；故試算值為「符合名單欄位條件之案件數上界」，實際分派數更少（與 BR-1「實際件數以月跑結果為準」一致）。
> 3. **§12 新增 follow-up 段落（含 OQ-E07-STAGE0-99）**：composer 對 `caseyear='99'` 採「完全跳過 year_cnt 條件」（§18.5.1），與 SP 之 `year_cnt >= 0 AND year_cnt < 15`（0–14 封頂）語意不同；因 '99' 在原系統前端為停用選項（有效值僅 0–10）屬理論邊界，本次維持 §18.5.1 skip 決策不變，標記為未來與 SP 對齊之待決議項。
> 4. **不變更**：v1.2 既定之篩選演算法（複用 `buildStage1WhereConditions()`）、路徑 A/B、欄位映射、AC-1~AC-5、AC-Banner-Entry、§5 API 規格、§8 UI/UX 入口規範、BR-1~BR-5 行為均原樣保留。
>
> **v1.2（2026-05-26 / 對齊 F050 v2.1 / AD-E07-18 §18.4~§18.6 / 修正試算與月跑 Stage 1 脫節）**：本次**僅更新 AC-4 的「篩選機制描述」**以對齊 F050 v2.1，使單一 LIST_NO 試算與月跑 Stage 1 逐欄位一致；**不變更其他任何 AC、API 規格、估算公式、入口規範**。核心變更：
> 1. **§4 改寫 AC-4 機制描述**：篩選來源由 v1.1 列舉的 5 個 legacy 一級欄位（`prod_kind` / `caseyear` / `spec_tp` / `settle_src` 等）改為以 `condition_payload`（§18.4，source of truth）為依據，並**直接複用月跑 Stage 1 之 `buildStage1WhereConditions()` 演算法**（§18.5，定義於 [architecture-spec.md §18.5](../architecture-spec.md)），明確記述路徑 A / 路徑 B、欄位映射、`caseyear='99'` wildcard。原因：v1.1 的機制描述在 F050 v2.1 將 `condition_payload` 改為 source of truth 後從未更新，導致試算（舊實作以 `=` 比對 `$$` 分隔字串、欄位映射錯誤）與月跑結果脫節，4 個 ready 名單預估筆數全為 0。
> 2. **§6 新增 BR-5**：當篩選條件解析後無任何有效條件（composer 回 `skipReason='EMPTY_CONDITIONS'`）→ 試算 `count = 0`，與月跑 Stage 1「skip 該名單、不分派」行為一致。
> 3. **§7 錯誤場景表**新增「名單無有效篩選條件」一列。
> 4. **不變更**：AC-4「不寫入 `ob_pool_data_list` / `assignment_run`」「`ob_pool_data` 為共享池」「篩選邏輯與月跑 Stage 1 一致」之原則、AC-1/2/3、AC-5 逾時保護、AC-Banner-Entry、§5 API 規格、§8 UI/UX 入口規範均原樣保留。
>
> **v1.1（2026-05-21 / M01 v2.0~v2.3 Kanban 重構 / GAP-G3 對應 US-132）**：核心變更：
> 1. **§4 新增 AC-Banner-Entry**：Stage 0 試算頁之唯一入口從 [F048 v2.0](F048-view-list-definition.md) Toolbar 移至 Kanban Ready 欄頂 CTA Banner 之 secondary「試算」按鈕（白底藍邊，附 calculator icon）；對應 US-132 GAP-G3。
> 2. **§8 UI/UX 補充入口規範**：Ready CTA Banner secondary 按鈕之渲染條件（僅 ready 欄有 ≥1 名單 / 非歷史月份 / 月跑鎖中 disabled）；對應 prototype `27-list-definition.html` v2.3 段落。
> 3. **本 v1.1 不變更既有 Stage 0 估算邏輯**（GET API / 估算公式 / 試算逾時保護 / Pool 警示門檻）；僅入口位置變更。

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `data-model.md#e07-data-model` + `error-handling.md#assignment-errors` |
| QA / Tester | 本文件 + `error-handling.md#assignment-errors` |
| UI/UX Designer | 本文件（第 8 節 UI/UX 需求） + `diagrams/F049-stage0-estimate-flow.mmd` |
| Architect | 本文件 + `architecture-spec.md` §3.10 |

---

## 1. 功能摘要

提供 Stage 0「每日電訪名單」預估分派數量與單一 `list_no` 即時案件試算能力，供業務部長在觸發月跑前評估本月工作量配置是否合理、Pool 資料新鮮度是否足夠。本功能為唯讀計算，不寫入 `ob_pool_data_list` 或 `assignment_run`。授權層採 `DirectorGuard`（部長為月跑前置評估角色，處長不執行月跑前置試算；依 F002 §4.6.2）。

## 2. 使用者故事

**As a** 業務部長
**I want** 查看 Stage 0（每日電訪名單）的每日預估分派數量，並能針對單一 `list_no` 即時試算符合條件的案件數
**So that** 可在觸發月跑前評估每日工作量配置、調整比例設定，並確認名單條件涵蓋正確的案件範圍

## 3. 前置條件

- 業務部長已登入並持有有效 JWT Token
- 至少一筆 `ob_list_definition` 的 `status = 'active'` 且 `project_workym = :currentYm`
- `ob_pool_data` 已由 **E04 + E05 雙層 ETL** 流程載入當月資料（詳見 [architecture-spec.md §E07-C](../architecture-spec.md#e07-c-etl-設計)；若無資料，估算結果為 0）

## 4. 驗收標準

### AC-1：顯示 Stage 0 每日估算表（v1.3 修正：含跳過日 + 千分位 ratio）

- **Given** 業務部長已進入 Stage 0 試算頁（`30-stage0-estimate`）並已自動選取第一筆 active 名單（AC-4-Default）
- **When** 頁面載入估算資料（或調整 `calendarSource` / 起訖日 / 選取名單後重算）
- **Then** 顯示**估算範圍內所有日期**之列（非僅工作日），表格欄位含：`calendar_date` 日期、星期、工作日標記（`isWorkday`）、預估件數、累積、餘數補標記
- **And** **非工作日（週末 / 國定假日）以「跳過」列呈現**：預估件數顯示「—」、列底色灰（`bg-gray-50/50`）、bar chart 對應灰 bar（對齊 prototype `recompute()` 對 `!isWorkday` 之處理）
- **And** 工作日之每日件數 = `round(ratioPerMille / 1000 × total)`，**由前端計算**（後端 daily-estimate 僅回 `ratioPerMille`，不回件數；Design A，§5.1）；`total` 為選取名單之 per-list COUNT（見 AC-4 / §5.2）；演算法定義見 §13
- **And** 表格底部 / KPI 顯示本月工作天數（`workingDays`）、總筆數（`total`）、`base ratio`（`FLOOR(1000/工作日)` ‰）、`remainder`（`1000 mod 工作日`）

### AC-2：估算基準說明（v1.3 修正：千分位 ratio 模型）

- **Given** Stage 0 估算表已顯示
- **When** 業務部長查看估算說明區（KPI 卡片 + 演算法說明區）
- **Then** 顯示估算所使用的基準參數：
  - `total`（選取名單 per-list COUNT，AC-4）
  - `workingDays`（依 `calendarSource` 解析之工作日數）
  - `base ratio = FLOOR(1000 / workingDays)`（千分位 ‰）
  - `remainder = 1000 mod workingDays`（補至最近 N 個工作日）
  - 排除規則：依 `calendarSource` 決定（`weekday` 排除週末+國定假日 / `weekday-only` 僅排除週末 / `all` 不排除）
- **And** 顯示演算法溯源說明：來源為 AD-E07-8（原系統 SP `Stage0_估算每日分派案件數量.sql` 之 `RATIO_RATE` 千分位模型），且明示本頁為唯讀試算、不寫入 `ob_assign_set`（BR-1）

### AC-3：Pool 筆數偏低警示

- **Given** `ob_pool_data` 本月筆數（`poolCount`）低於警示門檻（預設 1,000 筆；閾值可於環境變數 `STAGE0_POOL_WARN_THRESHOLD` 配置）
- **When** 估算計算完成
- **Then** 在估算表上方顯示橘色警示：「Pool 資料筆數偏低（現有 N 筆），請確認資料擷取任務已正常執行」
- **And**（v1.3 釐清）`poolCount` **僅用於本 Pool 偏低警示**，不再作為每日估算之 `total`；每日估算之 `total` 一律為選取名單之 per-list COUNT（AC-4）。`poolCount` 與 `total` 為兩個獨立數值（前者為共享池總量、後者為單一名單條件符合數）

### AC-4：單一 LIST_NO 即時案件試算

- **Given** 業務部長在名單定義清單（F048）中查看某 `status = 'active'` 的名單
- **When** 業務部長點擊該列的「計算案件數量」按鈕
- **Then** 系統以該 `list_no` 的 `condition_payload`（§18.4，名單篩選條件之 source of truth）為篩選依據，對共享案件池 `ob_pool_data` 即時 COUNT，回傳「符合條件案件數：N 筆」（`ob_pool_data` 為共享池，無 `list_no` 欄位）
- **And**（v1.4 升級）試算**直接複用月跑 Stage 1 之完整篩選鏈 `executeStage1Chain(..., { dryRun: true })`**（[F091](F091-stage1-complete-month-cnt-dedup-special-delete.md) 之 `Stage1FilterChain`；演算法見 [architecture-spec.md AD-E07-23](../architecture-spec.md)），涵蓋欄位篩選（`buildStage1WhereConditions()`，[§18.5](../architecture-spec.md)）+ MONTH_CNT 期別過濾 + 近 3 個月去重 + 特殊 DELETE，確保 estimate 與實際月跑 Stage 1 **逐步驟一致**（dry-run ≡ run，[F092 AC-3](F092-stage1-dry-run-estimate.md)），不得另寫一套篩選邏輯。<br>（**歷史**：v1.2~v1.3 此處僅複用欄位篩選版 `buildStage1WhereConditions()` COUNT；F092 升級為完整鏈 dry-run 後已對齊月跑，見 BR-6 + [F092 §11](F092-stage1-dry-run-estimate.md)）
- **And** 此試算為唯讀 dry-run，不執行實際月跑，不寫入 `ob_pool_data_list`，不建立 `assignment_run` 紀錄（[F092 AC-2](F092-stage1-dry-run-estimate.md)）

**篩選機制（對齊 F050 v2.1 / §18.5；複用 `buildStage1WhereConditions()`）**

| 項目 | 規則 |
|---|---|
| 路徑 A（`condition_payload IS NOT NULL`） | 解析 `condition_payload.conditions[]`，依 `fieldType` 生成 fragment：`categorical` → `"<col>" IN (...)`；`numeric` → `"<col>" BETWEEN :min AND :max`；`date` → `"<col>" BETWEEN :start AND :end`。各 fragment 以 `AND` 連接 |
| 路徑 B（`condition_payload IS NULL`，legacy 名單 fallback） | 讀 5 個 backward-compat 一級欄位（`prod_kind` / `caseyear` / `spec_tp` / `case_status` / `settle_src`），各欄位值以 `$$` split、trim、去空後轉為 `IN (...)` fragment；空字串 / NULL 之欄位跳過（不加 fragment） |
| 欄位映射（路徑 A 與路徑 B 共用） | `caseyear`（單值年數 0–10）→ `ob_pool_data.year_cnt`（**整數**比對，非 4 位數西元年 `ob_pool_data.caseyear`）；`case_status` → `ob_pool_data.list_type`；其餘欄位同名映射至 `ob_pool_data` 對應欄位 |
| `caseyear = '99'`（不限年數）wildcard | 跳過該 `year_cnt` fragment（不對 `year_cnt` 加任何條件），路徑 A 與路徑 B 皆適用（§18.5.1） |
| 防注入 | `columnName` 須符合 `SAFE_COLUMN_NAME_RE`（`/^[a-z][a-z0-9_]{0,63}$/`）；不符者 skip 該 fragment 並記錄 warning，不 throw（§18.5） |
| 無有效條件 | composer 回 `skipReason='EMPTY_CONDITIONS'` 時，試算依 BR-5 回 `count = 0`（詳見 §6 BR-5） |

> **SP 溯源驗證（v1.2.1 新增）**：上述欄位映射已對照原系統 ground-truth SP `SP_INFOT_ASSIGNEXPORTNAMELIST_st1_list`（Stage 1 實際撈案 SP，路徑 `reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st1_list.sql`）逐欄位確認：
> - **`case_status → ob_pool_data.list_type` 吻合**：SP 以 `o.LIST_TYPE IN (SELECT field FROM fn_SplitString_cte(OBMLISTDF.LIST_TYPE, '$$'))` 撈案，原系統 `OBMLISTDF.LIST_TYPE` 欄位即「期別」值（SP 註解：`01:其中 / 02:中結 / 03:滿期`）。新系統（AD-E07-14）將該期別語意拆出獨立的 `case_status` 一級欄位、原 `list_type` 欄位改填常數 `'01'`；故名單之 `case_status` 須映射至 `ob_pool_data.list_type` 比對，與 SP 邏輯逐欄位吻合。
> - **`caseyear → ob_pool_data.year_cnt` 吻合**：SP 以 `o.YEAR_CNT IN (SELECT field FROM fn_SplitString_cte(OBMLISTDF.CASEYEAR, '$$'))` 對整數年數欄位 `YEAR_CNT` 比對（非 4 位數西元年），與本 spec 之 `caseyear`（單值年數）→ `year_cnt`（整數）一致。
> - **`prod_kind` / `spec_tp` / `settle_src` 同名映射**：SP 各以 `o.<COL> IN (split(OBMLISTDF.<COL>, '$$'))` 撈案，與路徑 B `$$` split → IN 行為一致。
> - **`caseyear='99'` wildcard 之 SP 語意差異**：見 §12 follow-up（OQ-E07-STAGE0-99）。

### AC-4-Default：名單 selector 預設選取與 total 來源（v1.3 新增 / 對齊 prototype）

- **Given** 業務部長進入 Stage 0 試算頁，且當月（`project_workym = :currentYm`）有 ≥ 1 筆 `status = 'active'` 的 `ob_list_definition`
- **When** 頁面初次載入
- **Then** LIST_NO selector **自動選取第一筆 active 名單**（依後端回傳順序），selector 之 options **不含「— 請選擇 —」空選項**（對齊 prototype `30-stage0-estimate.html` select — 直接從第一個 `<option>` 開始，由瀏覽器預設選第一筆）
- **And** 試算頁之 `total`（總筆數）= 該選取名單之 per-list COUNT（呼叫 §5.2 `GET /list-definitions/:listNo/estimate`），**不得使用任何寫死預設值**（移除 React 現行寫死 `9500` 之 magic number）
- **And** 切換 selector 至另一名單時，`total` 重新取得該名單之 per-list COUNT，每日估算隨之重算
- **And**（空狀態）當當月無任何 active 名單時：selector 為 disabled，KPI（`total` / `base` / `remainder`）顯示「—」，估算表與圖表顯示空狀態文案，不渲染任何寫死數值

> **對齊項說明（v1.3）**：現行 React `stage0-estimate-page.tsx` 於初始 state 寫死 `total = 9500`（為 prototype demo 值搬入之 magic number），且 selector 自行加入了 prototype 沒有的「— 請選擇 —」空選項（divergence）。本 AC 將兩者對齊至 prototype ground truth：total 永遠來自選取名單之 per-list COUNT；selector 無空選項、預設選第一筆。

### AC-Banner-Entry：Stage 0 試算頁之唯一入口為 Ready CTA Banner secondary 按鈕（v1.1 新增 / US-132 / GAP-G3）

- **Given** 業務部長 / Admin 在 M01 名單定義主頁（[F048 v2.0](F048-view-list-definition.md) Kanban 主頁）
- **When** Kanban `ready` 欄之名單數量 ≥ 1 且月份為目前作業月份（非歷史月份）
- **Then** Ready 欄頂 CTA Banner 渲染 secondary 按鈕「試算」（白底藍邊，附 calculator icon），點擊跳轉至 Stage 0 試算頁
- **And** Toolbar **不**渲染「Stage 0 試算」按鈕（移除重複入口；對應 [F048 v2.0 AC-K7](F048-view-list-definition.md)）
- **And** 歷史月份 / `ready` 欄無名單時：整個 CTA Banner 不渲染（依 [F061 v1.4 §9](F061-trigger-assignment-run.md)），「試算」按鈕亦不可達；使用者改以 sidebar 直接導航 `30-stage0-estimate` 為替代方案（屬主動 IA 入口，未來 enhancement）
- **And** 月跑執行中（`AssignmentRun.status IN ('pending','running')`）：CTA Banner 改琥珀色 disabled 樣式，「試算」按鈕 disabled，點擊無動作
- **And** 入口按鈕之 UI 配置（按鈕並排於主按鈕右側、gap-2、calculator icon）對齊 prototype `27-list-definition.html` v2.3 readyCtaHtml 段落

### AC-5：試算逾時保護

- **Given** 單一 LIST_NO 試算查詢超過 10 秒仍未返回
- **When** 後端偵測逾時
- **Then** 中斷查詢並回傳 `STAGE0_ESTIMATE_TIMEOUT` 錯誤，提示業務部長稍後再試或聯繫 IT 檢查 `ob_pool_data` 索引

## 5. API 規格

### 5.1 GET /api/v1/assignment/stage0/daily-estimate（v1.3 改寫）

> **v1.3 變更摘要**：新增 `calendarSource` / `startDate` / `endDate` 三個 query 參數使「工作日來源 / 起訖日」輸入產生實際作用（修正現行 React `distribution` useMemo 僅依賴 `[dailyData, totalCount]`、後端 `calculateDailyEstimate(ym)` 僅收 `ym` + 固定 `rest_flg='0'` + 整月之缺陷）；`dailyEstimates[]` 回傳改為**範圍內所有日期**（含跳過日），每筆改帶 `ratioPerMille`。演算法由「平均件數」改為千分位 ratio（§13 / AD-E07-8）。
>
> **[ASSUMPTION] A-3（v1.3）**：本 API 之新 query 參數、新 response 欄位與千分位 ratio 計算屬後端 service（`stage0-estimate.service.ts` `calculateDailyEstimate`）與 controller 之實作變更，須由 system-architect 於 `architecture-spec.md`（AD-E07-8 / §E07-C）承載權威定義、由 tdd-implementation 落地；本 feature 檔僅定義對外 contract 與行為，**不變更 code / test / architecture-spec.md**。

| Query Parameter | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `ym` | string（YYYYMM） | 否 | 目前作業年月 | 估算月份；`startDate`/`endDate` 未指定時用以推導整月範圍 |
| `calendarSource` | enum（`weekday` / `weekday-only` / `all`） | 否 | `weekday` | 工作日來源；決定哪些日期視為可分派工作日（對應表見下方） |
| `startDate` | string（YYYY-MM-DD） | 否 | `ym` 整月第一天 | 估算範圍起日 |
| `endDate` | string（YYYY-MM-DD） | 否 | `ym` 整月最後一天 | 估算範圍訖日 |

**`calendarSource` → `ob_calendar` 篩選對應表（v1.3 新增）**

| `calendarSource` | 視為工作日之條件（`ob_calendar`） | 排除項 | 備註 |
|---|---|---|---|
| `weekday`（預設） | `rest_flg = '0'` | 週末 + 國定假日 | 對齊原系統 SP（`OBCALENDAR WHERE REST_FLG=0`）與 BR-2 |
| `weekday-only` | `EXTRACT(DOW FROM calendar_date) NOT IN (0, 6)`（0=日, 6=六） | 僅週末（**含**國定假日為工作日） | 不讀 `rest_flg`，僅依星期判定 |
| `all` | 全部日期（不排除） | 無 | 週末與國定假日均視為工作日 |

> 資料來源：`ob_calendar`（由 ETL Job E07-OBCALENDAR-Load / E04+E05 雙層 ETL 自舊 OB DB `OBCALENDAR` 同步；欄位 `calendar_date` + `rest_flg`）。已確認 2026-05 有 31 日、其中 20 個 `rest_flg='0'` 工作日之資料。`weekday-only` / `all` 模式因僅依星期（或不排除）計算，不依賴 `rest_flg`，故對缺少國定假日標記之區間亦可運作。

**Response — 200 OK（v1.3 改寫 shape）**

```json
{
  "ym": "202605",
  "calendarSource": "weekday",
  "startDate": "2026-05-01",
  "endDate": "2026-05-31",
  "workingDays": 20,
  "baseRatio": 50,
  "remainder": 0,
  "dailyEstimates": [
    { "date": "2026-05-01", "weekday": "五", "isWorkday": false, "skipReason": "國定假日", "ratioPerMille": 0  },
    { "date": "2026-05-02", "weekday": "六", "isWorkday": false, "skipReason": "週末",     "ratioPerMille": 0  },
    { "date": "2026-05-04", "weekday": "一", "isWorkday": true,  "skipReason": null,       "ratioPerMille": 50 }
  ],
  "poolCount": 50000,
  "warning": null
}
```

> **Contract 拍板 = Design A（後端 total-agnostic、前端乘 total）**：本 API 為**純 calendar + ratio 計算**，**不接受** `total` / `listNo` query 參數、**不回傳**每日件數（`total` 與 `dailyEstimates[].estimate` 欄位已於 v1.3 firming 移除）。每日件數 `estimate = round(ratioPerMille / 1000 × total)` 由**前端**計算，`total` 來自前端透過 §5.2 estimate API 取得之選取名單 per-list COUNT；KPI 之 `total` 顯示亦由前端負責。理由：`total` 為單一名單之 per-list COUNT，daily-estimate 不應耦合單一名單；且對齊 prototype `recompute()`（`count = ratio/1000 × total` 於前端計算）。

| Response 欄位 | 型別 | 說明 |
|---|---|---|
| `calendarSource` / `startDate` / `endDate` | — | 回顯本次計算採用之參數（便於前端對齊顯示） |
| `workingDays` | int | 範圍內視為工作日之天數（依 `calendarSource`） |
| `baseRatio` | int | `FLOOR(1000 / workingDays)`（千分位 ‰）；`workingDays = 0` 時為 0 |
| `remainder` | int | `1000 mod workingDays`；`workingDays = 0` 時為 0 |
| `dailyEstimates[]` | array | **範圍內所有日期**（含跳過日），每筆 `{ date, weekday, isWorkday, skipReason, ratioPerMille }`（**不含每日件數**；件數由前端以 `ratioPerMille × total` 計算） |
| `dailyEstimates[].skipReason` | enum / null | 非工作日之跳過原因：`'週末'` / `'國定假日'`；工作日為 `null` |
| `dailyEstimates[].ratioPerMille` | int | 該日千分位 ratio（工作日 = `baseRatio` 或 `baseRatio + 1`；非工作日 = 0）。**所有工作日之 `ratioPerMille` 加總 = 1000** |
| `poolCount` | int | `ob_pool_data` 共享池總筆數，**僅供 AC-3 Pool 偏低警示**（與前端之 `total` 無關） |
| `warning` | enum / null | `poolCount < STAGE0_POOL_WARN_THRESHOLD` 時為 `"POOL_COUNT_LOW"`，否則 `null` |

> **不變量**：`SUM(dailyEstimates[].ratioPerMille) = 1000`（僅工作日有非零 ratio）。前端計算之每日件數 `estimate = round(ratioPerMille / 1000 × total)`，其加總因 `round()` 可能與 `total` 有 ±N 件之捨入誤差（N ≤ 工作日數），與原系統 SP 行為一致（SP 僅存 ratio，件數於套用端逐日 round）。
>
> **[ASSUMPTION] A-4 — Resolved（Design A：後端 ratio、前端 total）**：本 API total-agnostic，不接受 `total` / `listNo`、不回傳每日件數；`total` 由前端透過 §5.2 estimate API 取得選取名單之 per-list COUNT，每日件數 `estimate = round(ratioPerMille / 1000 × total)` 與 KPI total 顯示均由前端負責。詳見 §13.3 分工原則。

### 5.2 GET /api/v1/assignment/list-definitions/:listNo/estimate

**Response — 200 OK**

```json
{
  "listNo": "OB202605001",
  "count": 8500
}
```

> **`count` 語意（v1.4 升級）**：response shape **不變**（`{ listNo, count }`），但 `count` 來源升級為**完整 Stage 1 鏈 dry-run COUNT**（`executeStage1Chain({ dryRun: true })`，[F092 AC-1](F092-stage1-dry-run-estimate.md)），已含 MONTH_CNT 期別過濾 + 近 3 個月去重 + 特殊 DELETE，**精確等於月跑 Stage 1 案件數**（見 BR-6）。升級前（v1.2~v1.3）`count` 為欄位篩選版 COUNT（上界，偏高）。`STAGE0_ESTIMATE_TIMEOUT` 逾時上限沿用 10 秒；完整鏈含去重查詢，逾時風險較高（[F092 AC-7](F092-stage1-dry-run-estimate.md)）。

**錯誤回應**

| HTTP | 錯誤碼 | 說明 |
|---|---|---|
| 401 | AUTH_TOKEN_MISSING | 未登入 |
| 403 | E07_REQUIRES_DIRECTOR | `businessRole` 非 `'director'`（`DirectorGuard` 攔截，依 F002 §4.6.2；月跑前置試算為部長專屬） |
| 404 | ASSIGNMENT_LIST_NOT_FOUND | `list_no` 不存在或 `status = 'inactive'` |
| 500 | STAGE0_ESTIMATE_TIMEOUT | 試算查詢超過 10 秒 |

## 6. 商業規則

| 規則編號 | 說明 |
|---|---|
| BR-1 | 試算僅為預覽，不寫入任何分派結果；實際件數以月跑結果為準 |
| BR-2 | 工作日計算依 `calendarSource` 參數（v1.3）決定排除規則：`weekday`（預設）= `WHERE rest_flg = '0'`（排除週末+國定假日）/ `weekday-only` = `EXTRACT(DOW) NOT IN (0,6)`（僅排除週末）/ `all` = 不排除。範圍以 `calendar_date BETWEEN :startDate AND :endDate` 限定（預設整月）。資料來源為 AppDB `ob_calendar`（採 E04 + E05 / E07-OBCALENDAR-Load 雙層 ETL 從舊 OB DB 同步，詳見 [architecture-spec.md §E07-C](../architecture-spec.md#e07-c-etl-設計)）。預設 `weekday` 模式與原系統 SP（`OBCALENDAR WHERE REST_FLG=0`）一致 |
| BR-3 | 試算查詢逾時上限 10 秒，超過則回傳 `STAGE0_ESTIMATE_TIMEOUT` |
| BR-4 | Pool 筆數警示門檻可於環境變數 `STAGE0_POOL_WARN_THRESHOLD` 配置（預設 1000） |
| BR-5 | 當 `condition_payload` 解析結果無任何有效篩選條件（`buildStage1WhereConditions()` 回 `skipReason='EMPTY_CONDITIONS'`；含 `conditions=[]`、`_backfill_empty=true`、或所有條件均被 `caseyear='99'` wildcard / 無效值過濾後 fragment 數為 0 之情形）→ 試算 `count = 0`，與月跑 Stage 1「skip 該名單、不分派」行為一致（§18.5.2） |
| BR-6 | **估算為「完整 Stage 1 預估」（≡ 月跑分派案件數；v1.4 升級，取代原「條件符合上界」語意）**：自 [F092](F092-stage1-dry-run-estimate.md)（Stage 1 精確化 Phase 3）落地起，Stage 0 per-list 試算已升級為**完整 Stage 1 篩選鏈之唯讀 dry-run COUNT**（複用 `executeStage1Chain(list, workdt, ..., { dryRun: true })`，定義於 [architecture-spec.md AD-E07-23](../architecture-spec.md)；封裝於 [F091](F091-stage1-complete-month-cnt-dedup-special-delete.md) 之 `Stage1FilterChain`），**已含**月跑 Stage 1 之全部後續過濾：(a) `list_period_start`~`list_period_end` × `list_interval` 推導之 `MONTH_CNT` 期別過濾；(b) 近 3 個月已派案去重（比對 `ob_pool_data_list` 之 `ASSIGNDAY`，含 `data_source` = `etl_legacy`/`monthly_run` 聯集）；(c) 詐騙(白牌)/中結/滿期/年資等特殊業務 `DELETE` 規則。因此試算值**精確等於正式月跑 Stage 1 之分派案件數**（同一鏈，dry-run ≡ run，[F092 AC-3](F092-stage1-dry-run-estimate.md)），不再是「上界」。三步驟之逐條 SP 對照定義見 F091（SP `SP_INFOT_ASSIGNEXPORTNAMELIST_st1_list`：`#TargetCase` 撈案後施加 `WHERE o.MONTH_CNT IN (@TmpTbl)`、近 3 月 `ASSIGNDAY` 去重 `DELETE`、`LIST_TYPE='01' AND SPEC_NAME LIKE '%白牌%'` 與多段 `LIST_NM LIKE` 觸發之特殊 `DELETE`）。**註（與 BR-1 一致）**：試算仍為唯讀預覽、不寫入任何分派結果；最終分派以月跑實際執行結果為準。<br><br>**歷史語意（v1.2.1~v1.3，已被 v1.4 取代）**：升級前此規則述「估算為條件符合上界」（僅套欄位篩選 `buildStage1WhereConditions()`、不含 month_cnt/去重/特殊 DELETE、實際分派更少）；該描述於 F092 完整鏈 dry-run 落地後已不成立，保留為歷史紀錄。 |

## 7. 錯誤場景

| 場景 | 系統回應 | 參考 |
|---|---|---|
| `list_no` 不存在 | 404 `ASSIGNMENT_LIST_NOT_FOUND` | error-handling.md#assignment-errors |
| 試算查詢逾時 | 500 `STAGE0_ESTIMATE_TIMEOUT` | error-handling.md#assignment-errors |
| Pool 資料為空 | 200 `{ count: 0 }` | — |
| 名單無有效篩選條件（`skipReason='EMPTY_CONDITIONS'`） | 200 `{ count: 0 }`（與月跑 Stage 1 skip 該名單行為一致；見 BR-5） | — |

## 8. UI/UX 需求

### 8.1 試算頁本體（v1.3 改寫 / Prototype ground truth：`prototypes/30-stage0-estimate.html`）

> **Prototype canonical reference**：`prototypes/30-stage0-estimate.html`（`recompute()` / `buildCalendar()` 為演算法與渲染之 ground truth）。以下為對齊清單，下游 tdd-implementation 須以 prototype 為準，矛盾時停下確認。

**輸入區（左欄 `col-span-4`，sticky）**

| 元素 | 規範 |
|---|---|
| 名單 LIST_NO selector | 預設自動選第一筆 active 名單、**無「— 請選擇 —」空選項**（AC-4-Default）；僅顯示 `status='active'` 名單；`onchange` 觸發重算 |
| 預估總筆數 | 顯示選取名單之 per-list COUNT（`total`，AC-4）；**移除寫死 9500 預設值**；說明文字「來自 ob_pool_data 篩選結果（LIST_NO 篩選條件 COUNT）」 |
| 起始日 / 結束日 | `<input type="date">`，預設 = `ym` 整月第一天 / 最後一天；`onchange` 觸發重算（對應 §5.1 `startDate` / `endDate`） |
| 工作日來源 selector | 三選項對齊 §5.1 `calendarSource`：`weekday`（工作日 rest_flg='0' — 排除週末與國定假日）/ `weekday-only`（僅排除週末）/ `all`（不排除）；`onchange` 觸發重算；說明文字標註資料表 `ob_calendar`（E04+E05 ETL 同步） |
| 演算法說明區 | 顯示 AD-E07-8 公式：`base = FLOOR(1000 / working_days)`、`rem = 1000 mod working_days`、`per_date = base`、最後 `rem` 個工作日 `per_date = base + 1`（§13） |

**KPI 卡片（右欄上方，4 格）**

| KPI | 值 | 副標 |
|---|---|---|
| `working_days` 工作日 | `workingDays` | 本月可分派天數 |
| `total_estimate` 總筆數 | `total`（per-list COUNT） | 符合 LIST_NO 篩選條件 |
| `base ratio` | `FLOOR(1000 / 工作日)` | 千分位 ‰ |
| `remainder` 餘數 | `1000 mod 工作日` | 補至最近 N 個工作日 |

**圖表（每日預估筆數 bar chart）**

- bar **`w-full` 填滿欄**（對齊 prototype，**非**現行 React 之 `w-6` 窄 bar）
- 每欄由上而下：**件數標籤（在上）→ bar → 日期 → 星期**（對齊 prototype 標籤順序）
- **顯示跳過日（灰 bar `bg-gray-300`）**：非工作日仍渲染一欄，件數標籤顯示「—」，bar 為固定低高度之灰 bar
- 工作日 bar 顏色：base 為 `bg-blue-500`、`base+1`（餘數補）為 `bg-blue-700`；圖例同 prototype（工作日 base / 工作日 base+1 / 跳過）

**每日試算明細表格**

- 欄位：`calendar_date` / 星期 / 工作日 / 預估件數 / 累積 / 餘數補
- 工作日標記 pill badge：
  - 工作日 → 綠色 `Y (rest_flg=0)`
  - 非工作日 → 灰色 `N (<skipReason>)`，`skipReason` 為「週末」或「國定假日」
  - 餘數補（`base+1`）→ 藍色 `base+1（餘數補）`；非餘數補列顯示「—」
- 非工作日列：底色灰（`bg-gray-50/50`），預估件數 / 累積顯示「—」

**警示 / 其他**

- 橘色警示列：`poolCount` 低於門檻時顯示（AC-3）
- 單一 LIST_NO 試算結果以粗體顯示：「符合條件案件數：N 筆」（§5.2 estimate）

### 8.2 入口規範（v1.1 新增 / US-132 / GAP-G3）

**唯一入口**：[F048 v2.0](F048-view-list-definition.md) Kanban Ready 欄頂 CTA Banner 之 secondary「試算」按鈕。

| 條件 | secondary「試算」按鈕渲染狀態 |
|---|---|
| ready 欄有 ≥1 名單 + 目前作業月份 + 月跑未鎖 | 渲染（白底藍邊 + calculator icon + 文字「試算」），點擊跳轉至 `30-stage0-estimate` |
| ready 欄無名單 / 歷史月份 | 整個 CTA Banner 不渲染（依 [F061 v1.4 §9](F061-trigger-assignment-run.md)），「試算」按鈕亦不可達 |
| 月跑執行中（`AssignmentRun.status IN ('pending','running')`） | CTA Banner 改琥珀色 disabled 樣式，「試算」按鈕 disabled，點擊無動作 |

**v1.0 已移除入口**（依 US-070 v2.3 / US-132 GAP-G3）：
- ~~F048 v1.0 主頁 Toolbar 之「Stage 0 試算」按鈕~~ — v2.0 已移除，避免重複入口
- ~~每列「計算案件數量」按鈕作為單一 LIST_NO 試算之入口~~ — 該功能於 v2.0 改由 Detail Drawer 內提示或試算頁內查詢實作；本 v1.1 暫不變更（屬未來 enhancement）

**Prototype canonical reference**：`prototypes/27-list-definition.html` v2.3 readyCtaHtml 段落（secondary 按鈕 hover 樣式：`bg-white hover:bg-blue-50`）

## 9. 相依性

- **Blocked By**：F048（名單定義清單）、E04 + E05 雙層 ETL（`ob_pool_data` 資料來源）、ETL Job **E07-OBCALENDAR-Load**（`ob_calendar` 工作日 / `rest_flg` 來源；已確認 2026-05 有 31 日 / 20 工作日資料）（詳見 [architecture-spec.md §E07-C](../architecture-spec.md#e07-c-etl-設計)）
- **Blocks**：F061（觸發月跑前業務部長依此決定是否執行）

## 10. 交叉參考

- 資料模型：[data-model.md#e07-data-model](../data-model.md#e07-data-model)（`ob_pool_data`、`ob_list_definition`）；[data-model.md#ob-calendar-entity](../data-model.md#ob-calendar-entity)（工作日表，採 E04 + E05 雙層 ETL 同步）
- 錯誤處理：[error-handling.md#assignment-errors](../error-handling.md#assignment-errors)
- 流程圖：[diagrams/F049-stage0-estimate-flow.mmd](../diagrams/F049-stage0-estimate-flow.mmd)
- **UI ground truth（v1.3）**：`prototypes/30-stage0-estimate.html`（`recompute()` / `buildCalendar(start, end, mode)` 為每日 ratio 計算與渲染之 ground truth；selector 無空選項、bar `w-full`、跳過日灰 bar、KPI 千分位、pill badge）
- **演算法 ground truth（v1.3）**：`reference/SP/Stage0_估算每日分派案件數量.sql`（原系統 `RATIO_RATE` 千分位模型，§13.2 逐行對應）
- 架構決策：AD-E07-1（OB 資料遷移）、**AD-E07-8（Stage 0 每日 ratio 千分位演算法，§13 為 feature 層行為規格、權威定義於 architecture-spec.md）**、AD-E07-18（F050 v2.1 名單篩選 condition_payload / Stage 1 動態 SQL 演算法，§18.4~§18.6 為 AC-4 試算機制之權威來源）、**AD-E07-23（v1.4：estimate / dry-run 完整鏈唯讀複用，AC-4 / BR-6 試算機制之權威來源）**、E07 與 E04 依賴關係
- 篩選機制權威來源（v1.4）：[F091](F091-stage1-complete-month-cnt-dedup-special-delete.md) `Stage1FilterChain`（完整鏈 = 欄位篩選 + MONTH_CNT + 去重 + 特殊 DELETE）、[architecture-spec.md AD-E07-23](../architecture-spec.md)（`executeStage1Chain` dry-run）、[§18.5](../architecture-spec.md)（`buildStage1WhereConditions()` 欄位篩選子步驟）；試算須複用同一完整鏈，不另寫一套
- 相關功能：[F048](F048-view-list-definition.md)、[F061](F061-trigger-assignment-run.md)、[F050](F050-create-list-definition.md)（condition_payload source of truth）、**[F091](F091-stage1-complete-month-cnt-dedup-special-delete.md)（Stage 1 補完整三步驟）、[F092](F092-stage1-dry-run-estimate.md)（dry-run 升級，§11 對 F049 影響表）**

## 11. 假設

| # | 假設 | 標記 |
|---|---|---|
| A-1 | ~~工作日/假日表由現有系統基礎資料或 `ob_calendar` 提供~~ **已解決（2026-05-04，2026-05-05 同步機制更新）**：採 `ob_calendar`（AppDB），透過 **E04 + E05 雙層 ETL** 從舊 OB DB `OBCALENDAR` 同步至 AppDB（E04 抓 raw → E05 Pipeline TargetLoad full replace）；詳見 [data-model.md#ob-calendar-entity](../data-model.md#ob-calendar-entity) 與 [architecture-spec.md §E07-C](../architecture-spec.md#e07-c-etl-設計)。對應 OQ-E07-10 / OQ-E07-15 已 Resolved。 | Resolved |
| A-2 | ~~每日分派比例係數為「`ob_pool_data` 總筆數 / 工作天數」等分~~ **已更新（v1.3）**：每日分派採**千分位 ratio 模型**（非等分件數），溯源自原系統 SP `Stage0_估算每日分派案件數量.sql` 之 `RATIO_RATE`：`base_ratio = FLOOR(1000 / workingDays)`、`rem = 1000 mod workingDays`、工作日按 `calendar_date DESC` 排序前 `rem` 個 `ratio = base_ratio + 1`；每日件數 = `round(ratioPerMille / 1000 × total)`。完整定義見 §13。 | Resolved |
| A-3 | §5.1 API 新 query 參數 / 新 response 欄位 / 千分位計算須由 system-architect 寫入 `architecture-spec.md`（AD-E07-8、§E07-C）並由 tdd 落地於 `stage0-estimate.service.ts`；本 feature 檔僅定義 contract | [ASSUMPTION] |
| A-4 | ~~`total`（per-list COUNT）之帶入方式（前端先查 §5.2 再帶入 vs 後端 daily-estimate 額外收 `listNo`/`total` 一次回傳）屬實作細節，由 architecture-spec.md 拍板~~ **已拍板（v1.3 firming）= Design A（後端 ratio、前端 total）**：daily-estimate total-agnostic，不接受 `total`/`listNo`、不回傳每日件數；`total` 由前端透過 §5.2 取得 per-list COUNT，件數 = `round(ratioPerMille / 1000 × total)` 與 KPI total 由前端計算。詳見 §5.1 與 §13.3。 | Resolved |

## 12. Follow-up / Open Questions（v1.2.1 新增）

| OQ 編號 | 議題 | 現況決策 | 影響 / 建議 | 狀態 |
|---|---|---|---|---|
| OQ-E07-STAGE0-99 | `caseyear='99'`（不限年數）wildcard 之 `year_cnt` 語意與 ground-truth SP 不一致：composer 目前採「**完全跳過** `year_cnt` 條件」（架構決策 §18.5.1），而 SP `SP_INFOT_ASSIGNEXPORTNAMELIST_st1_list` 對 `'99'` 採 `o.YEAR_CNT >= 0 AND o.YEAR_CNT < 15`（即 0–14 封頂，排除 `year_cnt >= 15` 之案件） | **維持 §18.5.1 skip 決策不變更**。因 `'99'` 在原系統前端為**停用選項**（有效選項僅年數 0–10），名單實際不會帶入 `'99'`，屬理論邊界；兩種語意對 0–10 有效值之撈案結果相同，差異僅出現在 `year_cnt >= 15` 之案件是否納入 | 若未來開放 `'99'` 為有效選項，須由 system-architect 評估是否將 §18.5.1 改為對齊 SP 之 `0 <= year_cnt < 15` 封頂語意（同步影響月跑 Stage 1 與本試算）；本變更屬 architecture-spec.md §18.5.1 範疇，spec-writer 不於本文件逕自變更篩選行為 | Open（理論邊界，暫不處理） |
| OQ-E07-STAGE0-ROUND | 每日件數採 `round(ratioPerMille / 1000 × total)` 逐日獨立 round，加總可能與 `total` 有 ±N 件捨入誤差（N ≤ 工作日數）；原系統 SP 僅存 `RATIO_RATE`、件數於套用端計算，同樣未保證件數加總精確等於 total | **維持逐日 round、不做尾差調整**（與 SP 一致；試算為唯讀預覽 BR-1，誤差數件不影響月跑前評估用途） | 若未來要求「件數加總精確 = total」，可於最後一個工作日補尾差；屬 enhancement，非本版範疇 | Open（捨入誤差可接受，暫不處理） |

## 13. 演算法定義：AD-E07-8 千分位 ratio 模型（v1.3 新增）

> **權威來源 [ASSUMPTION] A-3**：AD-E07-8 之**正式架構定義位置為 `architecture-spec.md`**（由 system-architect 維護）。本節為 feature 層之行為規格，供 TDD / QA 直接驗收；若與 architecture-spec.md 有出入，以 architecture-spec.md 為準。本節內容溯源自原系統 ground-truth SP `reference/SP/Stage0_估算每日分派案件數量.sql`（寫入 `OBASSIGNSET.RATIO_RATE` 之千分位模型）。

### 13.1 計算步驟

設 `workingDays` = 依 `calendarSource` 解析之範圍內工作日數（見 §5.1 對應表），`total` = 選取名單之 per-list COUNT（AC-4）：

1. `base_ratio = FLOOR(1000 / workingDays)`（`workingDays = 0` → 全部為 0，無估算）
2. `rem = 1000 mod workingDays`
3. 將工作日依 `calendar_date DESC`（最近日期優先）排序，取前 `rem` 個工作日，其 `ratioPerMille = base_ratio + 1`；其餘工作日 `ratioPerMille = base_ratio`
4. 非工作日（週末 / 國定假日，依 `calendarSource`）`ratioPerMille = 0`
5. 每日件數 `estimate = round(ratioPerMille / 1000 × total)`；非工作日 `estimate = 0`

### 13.2 與 SP 之對應

| 本 spec | 原系統 SP `Stage0_估算每日分派案件數量.sql` |
|---|---|
| `base_ratio = FLOOR(1000 / workingDays)` | `A.RATION = FLOOR(1000/@WORKDAYS)` |
| 前 `rem` 個工作日 `+1`（`calendar_date DESC`） | `A.RATION = A.RATION + 1 WHERE A.SEQ <= (1000 % @WORKDAYS)`，其中 `SEQ = ROW_NUMBER() OVER(ORDER BY CALENDAR_DATE DESC)` |
| 工作日來源（`weekday` 預設） | `FROM OBCALENDAR WHERE REST_FLG=0 AND CALENDAR_DATE BETWEEN @DATE_FIRST AND @DATE_LAST` |
| `ratioPerMille` 寫入欄位語意 | `OBASSIGNSET.RATIO_RATE`（SP 僅存 ratio，不存件數） |
| 件數 = `round(ratio/1000 × total)` | SP 不算件數；件數於套用端（月跑 Stage 0 寫入時）按 ratio × 該名單案件數計算 — 本試算前端負責此乘法（calendar 相依的 ratio 由後端算、total 相依的件數由前端算） |

### 13.3 分工原則（後端 ratio / 前端件數 — 拍板 Design A，A-4 Resolved）

- **後端**（`daily-estimate` API）：負責 calendar 相依之部分 —— 解析 `calendarSource` / 起訖日 → 取 `ob_calendar` 工作日 → 計算每日 `ratioPerMille`（total-agnostic，與 `total` 無關、不接受 `total`/`listNo`、不回傳每日件數，可快取）。
- **前端**：負責 total 相依之部分 —— 取得選取名單 per-list COUNT 作為 `total`，逐日 `estimate = round(ratioPerMille / 1000 × total)`。
- 此分工對應原系統 SP「存 `RATIO_RATE`、件數於後段套用」之語意；亦使切換名單（改 `total`）時無需重算 ratio、切換 `calendarSource` / 日期（改 calendar）時才重算 ratio。
- **不變量**：`SUM(工作日 ratioPerMille) = 1000`。
