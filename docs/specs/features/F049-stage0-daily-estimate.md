---
spec-id: F049
title: Stage 0 試算頁業務化重設計（部門維度每日分派可行性）
feature-id: F049
source-story: US-071, US-132, US-135, US-166, US-167, US-168, US-169, US-170
epic: E07
module: M01 名單定義
priority: P0-MVP
version: "2.0"
date: 2026-06-26
status: Draft
---

# F049: Stage 0 試算頁業務化重設計（部門維度每日分派可行性；含單一 LIST_NO 案件試算）

Priority: P0-MVP | Status: Draft | Last Updated: 2026-06-26

> **v2.0（2026-06-26 / Stage 0 試算頁業務化重設計：per-list 技術視角 → 部門維度每日分派可行性，對齊 US-166~US-170）**：本版於既有 per-list / 千分位 ratio 引擎（v1.3~v1.4，**完整保留、不分叉**）之上新增「聚合層 + 部門投影層 + 可行性層 + 唯讀範圍隔離 + 術語清理」，將試算頁從「選一筆名單看每日件數」改為「本月全名單彙總後，各部門每日預估分派量與人均可行性」。新增內容集中於 **Part B（§14~§22）**，並以新 AC 命名（AC-AGG / AC-DEPT / AC-GAP / AC-SCOPE / AC-FEAS / AC-TERM）對應 US-166~170 之 AC-ID，避免與 v1.x AC 編號衝突。核心變更：
> 1. **§15 聚合預設（US-166，supersedes US-071 AC-1/AC-2/AC-3/AC-4-Default）**：頁面預設進入「全名單彙總」模式（所有 active 名單件數合計後做部門投影），名單篩選器降級為可選的「單一名單鑽探」；不再預設自動選第一筆名單（v1.3 AC-4-Default 之「自動選第一筆」於 v2.0 由「全部名單彙總」取代）。
> 2. **§16 部門每日件數投影 + 缺口機制（US-167 v1.1「保住總量＋標示缺口」模型）**：`dept_daily_count[d][D] = Σ_L( list_total[L] × ration[L][D]/100 × dpm[d]/1000 )`；`org_total[d]` 永遠由 Σ 名單總量算出（不依賴部門比例，必正確）；`gap[d] = org_total[d] − Σ_D dept_daily_count`，gap 大於 0 以缺口列標示「尚有 X 件未分派到部門」，**不自動補差**、gap 等於 0 不顯示缺口列。
> 3. **§17 處長唯讀 scope 隔離（US-168）**：daily 部門矩陣端點授權由 `@RequireDirector` 放寬為 `DirectorOrSectionChiefGuard`（處長唯讀）；service 層強制 dept scope filter（複用 `listLists` 既有的 `getScopeDeptCode → EXISTS ob_dept_pct.obdeptid` 模式），處長 response **只含**其轄區 obdeptid 列（其他部門列完全不存在，非遮罩），不顯示全部門合計列；scope=null → 空結果 + 友善訊息，不回 403、不 500。
> 4. **§18 人均每日件數可行性指標（US-169）**：`per_person_daily = round( dept_daily_count ÷ active_headcount )`，`active_headcount[D] = COUNT(ob_emphire WHERE dept_code=D AND resign_date IS NULL)`；headcount=0 → 顯示「—」+ 橘色提示（不出 Infinity/NaN）；超過每人每日上限門檻紅色警示，門檻未設定則正常顯示（降級）。
> 5. **§19 術語清理移除清單（US-170）**：列出使用者可見文字的移除黑名單（rest_flg / base / remainder / base+1 / ratioPerMille / ob_assign_set / ob_pool_data / OBPOOLDATA / STAGE0_POOL_WARN_THRESHOLD / calendar_date / GET /api/v1 / AD-E07-8 等）與業務語言替代（日期 / 星期 / 預估件數 / 累積件數；跳過→休息日（不派案）；calendarSource→派案日曆）；此為顯示層契約，支撐 US-170 TC-170-01 之 DOM 全文掃描 regression test；最終逐字文案由 UI/UX（Phase 5）定。
> 6. **§22 估算 ≡ 月名單分派 不變量（I-RUN-EST-01）硬性約束**：部門投影層僅在既有 `computeWorkingDayRatios` 千分位 ratio **之上**做加法（Σ over lists × ration × dpm）+ 部門投影，**不得分叉或修改底層 calendar / ratio 邏輯**；ratio 與月名單分派 Stage 4 ASSIGNDAY 共用單一來源（架構師擁有確切共用機制）。
> 7. **OQ-167-03（部門代號空間 / 粒度，HIGH-RISK）已由 spec-writer 對 dev DB 實證查核**：`ob_emphire.dept_code`（在職）與 `ob_dept_pct.obdeptid` 為**同一代號空間且同粒度**（dev：各 8 個 distinct 代號、100% 重疊、無孤兒碼、每個 obdeptid 對應非零在職人數、4 位處長各對應一個 distinct dept_code）。詳見 §20。**殘留須由架構師對 production ETL 後資料複跑同一重疊查詢確認**（§23 OQ-F049-05）。
> 8. **刻意未動（邊界，交 system-architect / 其他 agent）**：`architecture-spec.md` / AD-E07-8 / AD-E07-29 / `data-model.md`（system-architect 範疇；部門投影 SQL 下推 vs in-memory、ratio 共用機制、門檻儲存、端點拓樸、guard class 實作均列為 §23 架構師 OQ）；`error-handling.md`（無新錯誤碼，沿用既有 `STAGE0_ESTIMATE_TIMEOUT` / `ASSIGNMENT_LIST_NOT_FOUND`；處長 scope=null 為 200 空結果非錯誤）；code / test / `prototypes/30-stage0-estimate.html`（tdd-implementation / test-designer / UI-UX 範疇）；v1.x 之千分位 ratio 演算法（§13）、per-list dry-run（§5.2 / AC-4）、calendarSource 對應（§5.1）均原樣保留。
> 9. **F002 同步**：[F002 §4.6.2](F002-user-login.md) Controller Guard 對應表新增 Stage 0 試算（部門矩陣）列（`DirectorOrSectionChiefGuard` + service 層 dept scope filter），釐清原「F048~F049 GET」籠統列。

> **v1.4（2026-05-26 / estimate 語意升級為完整 Stage 1 dry-run，對齊 F092 / AD-E07-23）**：[F092](F092-stage1-dry-run-estimate.md)（Stage 1 精確化工程 Phase 3）已落地，將 per-list estimate 從「欄位篩選版 COUNT」升級為**完整 Stage 1 篩選鏈之唯讀 dry-run COUNT**（複用 `executeStage1Chain({ dryRun: true })`，[F091](F091-stage1-complete-month-cnt-dedup-special-delete.md) `Stage1FilterChain`）。本版同步更新 estimate 語意之文字漂移：
> 1. **§6 BR-6 改寫**：原「估算為條件符合上界（不含 month_cnt/去重/特殊 DELETE，實際更少）」→ 升級為「**完整 Stage 1 預估（≡ 月名單分派案件數）**」，已含 MONTH_CNT 期別過濾 + 近 3 個月去重（含 `data_source` 聯集）+ 特殊 DELETE（含詐騙白牌 `LIST_TYPE='01' AND SPEC_NAME LIKE '%白牌%'`）。保留 BR-1（試算唯讀預覽、最終以月名單分派為準）。歷史語意保留為紀錄。
> 2. **§4 AC-4 對齊**：篩選機制由「複用 `buildStage1WhereConditions()`（欄位篩選）」更新為「複用完整鏈 `executeStage1Chain(..., { dryRun: true })`」，並標明為唯讀 dry-run（不寫表）。
> 3. **§5.2 estimate API**：response shape 不變（`{ listNo, count }`），`count` 語意升級為完整鏈 dry-run COUNT（精確 ≡ 月名單分派），補逾時風險說明。
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
> 2. **§6 新增 BR-6「估算為條件符合上界」**：Stage 0 per-list 試算僅套用名單欄位篩選條件，不含月名單分派 Stage 1 額外施加的 `MONTH_CNT`（list_period × interval）區間過濾、近 3 個月已派案去重、詐騙/中結/滿期等特殊 DELETE 規則；故試算值為「符合名單欄位條件之案件數上界」，實際分派數更少（與 BR-1「實際件數以月名單分派結果為準」一致）。
> 3. **§12 新增 follow-up 段落（含 OQ-E07-STAGE0-99）**：composer 對 `caseyear='99'` 採「完全跳過 year_cnt 條件」（§18.5.1），與 SP 之 `year_cnt >= 0 AND year_cnt < 15`（0–14 封頂）語意不同；因 '99' 在原系統前端為停用選項（有效值僅 0–10）屬理論邊界，本次維持 §18.5.1 skip 決策不變，標記為未來與 SP 對齊之待決議項。
> 4. **不變更**：v1.2 既定之篩選演算法（複用 `buildStage1WhereConditions()`）、路徑 A/B、欄位映射、AC-1~AC-5、AC-Banner-Entry、§5 API 規格、§8 UI/UX 入口規範、BR-1~BR-5 行為均原樣保留。
>
> **v1.2（2026-05-26 / 對齊 F050 v2.1 / AD-E07-18 §18.4~§18.6 / 修正試算與月名單分派 Stage 1 脫節）**：本次**僅更新 AC-4 的「篩選機制描述」**以對齊 F050 v2.1，使單一 LIST_NO 試算與月名單分派 Stage 1 逐欄位一致；**不變更其他任何 AC、API 規格、估算公式、入口規範**。核心變更：
> 1. **§4 改寫 AC-4 機制描述**：篩選來源由 v1.1 列舉的 5 個 legacy 一級欄位（`prod_kind` / `caseyear` / `spec_tp` / `settle_src` 等）改為以 `condition_payload`（§18.4，source of truth）為依據，並**直接複用月名單分派 Stage 1 之 `buildStage1WhereConditions()` 演算法**（§18.5，定義於 [architecture-spec.md §18.5](../architecture-spec.md)），明確記述路徑 A / 路徑 B、欄位映射、`caseyear='99'` wildcard。原因：v1.1 的機制描述在 F050 v2.1 將 `condition_payload` 改為 source of truth 後從未更新，導致試算（舊實作以 `=` 比對 `$$` 分隔字串、欄位映射錯誤）與月名單分派結果脫節，4 個 ready 名單預估筆數全為 0。
> 2. **§6 新增 BR-5**：當篩選條件解析後無任何有效條件（composer 回 `skipReason='EMPTY_CONDITIONS'`）→ 試算 `count = 0`，與月名單分派 Stage 1「skip 該名單、不分派」行為一致。
> 3. **§7 錯誤場景表**新增「名單無有效篩選條件」一列。
> 4. **不變更**：AC-4「不寫入 `ob_pool_data_list` / `assignment_run`」「`ob_pool_data` 為共享池」「篩選邏輯與月名單分派 Stage 1 一致」之原則、AC-1/2/3、AC-5 逾時保護、AC-Banner-Entry、§5 API 規格、§8 UI/UX 入口規範均原樣保留。
>
> **v1.1（2026-05-21 / M01 v2.0~v2.3 Kanban 重構 / GAP-G3 對應 US-132）**：核心變更：
> 1. **§4 新增 AC-Banner-Entry**：Stage 0 試算頁之唯一入口從 [F048 v2.0](F048-view-list-definition.md) Toolbar 移至 Kanban Ready 欄頂 CTA Banner 之 secondary「試算」按鈕（白底藍邊，附 calculator icon）；對應 US-132 GAP-G3。
> 2. **§8 UI/UX 補充入口規範**：Ready CTA Banner secondary 按鈕之渲染條件（僅 ready 欄有 ≥1 名單 / 非歷史月份 / 月名單分派鎖中 disabled）；對應 prototype `27-list-definition.html` v2.3 段落。
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

提供 Stage 0「每日電訪名單」預估分派數量與單一 `list_no` 即時案件試算能力，供業務部長 / 業務處長在觸發月名單分派前評估本月工作量配置是否合理、Pool 資料新鮮度是否足夠。本功能為唯讀計算，不寫入 `ob_pool_data_list`、`assignment_run` 或 `ob_monthly_run_result`。

> **v2.0 業務化重設計**：頁面主視角由 v1.x 之「選一筆名單看每日件數（技術視角）」改為「本月全名單彙總後，**各部門每日預估分派量與人均可行性**（業務視角）」。新行為定義集中於 **[Part B（§14~§22）](#part-b-業務化重設計v20)**；v1.x 之千分位 ratio 引擎、per-list dry-run、calendarSource 對應**完整保留**為 Part B 的數值底座。
>
> **授權（v2.0 調整，US-168 / F002 §4.6.2）**：部門維度每日分派量端點之授權由 v1.x 之 `DirectorGuard`（部長專屬）放寬為 `DirectorOrSectionChiefGuard`——部長 / admin 看全部門；業務處長**唯讀**且 service 層強制限縮為其轄區部門（§17）。單一 `list_no` per-list COUNT 端點之授權同步開放至處長（其回傳為名單層總量、非部門分解，§17 BR-12）。

## 2. 使用者故事

**As a** 業務部長
**I want** 查看 Stage 0（每日電訪名單）的每日預估分派數量，並能針對單一 `list_no` 即時試算符合條件的案件數
**So that** 可在觸發月名單分派前評估每日工作量配置、調整比例設定，並確認名單條件涵蓋正確的案件範圍

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
- **And**（v1.4 升級）試算**直接複用月名單分派 Stage 1 之完整篩選鏈 `executeStage1Chain(..., { dryRun: true })`**（[F091](F091-stage1-complete-month-cnt-dedup-special-delete.md) 之 `Stage1FilterChain`；演算法見 [architecture-spec.md AD-E07-23](../architecture-spec.md)），涵蓋欄位篩選（`buildStage1WhereConditions()`，[§18.5](../architecture-spec.md)）+ MONTH_CNT 期別過濾 + 近 3 個月去重 + 特殊 DELETE，確保 estimate 與實際月名單分派 Stage 1 **逐步驟一致**（dry-run ≡ run，[F092 AC-3](F092-stage1-dry-run-estimate.md)），不得另寫一套篩選邏輯。<br>（**歷史**：v1.2~v1.3 此處僅複用欄位篩選版 `buildStage1WhereConditions()` COUNT；F092 升級為完整鏈 dry-run 後已對齊月名單分派，見 BR-6 + [F092 §11](F092-stage1-dry-run-estimate.md)）
- **And** 此試算為唯讀 dry-run，不執行實際月名單分派，不寫入 `ob_pool_data_list`，不建立 `assignment_run` 紀錄（[F092 AC-2](F092-stage1-dry-run-estimate.md)）

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
- **And** 月名單分派執行中（`AssignmentRun.status IN ('pending','running')`）：CTA Banner 改琥珀色 disabled 樣式，「試算」按鈕 disabled，點擊無動作
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

> **`count` 語意（v1.4 升級）**：response shape **不變**（`{ listNo, count }`），但 `count` 來源升級為**完整 Stage 1 鏈 dry-run COUNT**（`executeStage1Chain({ dryRun: true })`，[F092 AC-1](F092-stage1-dry-run-estimate.md)），已含 MONTH_CNT 期別過濾 + 近 3 個月去重 + 特殊 DELETE，**精確等於月名單分派 Stage 1 案件數**（見 BR-6）。升級前（v1.2~v1.3）`count` 為欄位篩選版 COUNT（上界，偏高）。`STAGE0_ESTIMATE_TIMEOUT` 逾時上限沿用 10 秒；完整鏈含去重查詢，逾時風險較高（[F092 AC-7](F092-stage1-dry-run-estimate.md)）。

**錯誤回應**

| HTTP | 錯誤碼 | 說明 |
|---|---|---|
| 401 | AUTH_TOKEN_MISSING | 未登入 |
| 403 | E07_REQUIRES_DIRECTOR | `businessRole` 非 `'director'`（`DirectorGuard` 攔截，依 F002 §4.6.2；月名單分派前置試算為部長專屬） |
| 404 | ASSIGNMENT_LIST_NOT_FOUND | `list_no` 不存在或 `status = 'inactive'` |
| 500 | STAGE0_ESTIMATE_TIMEOUT | 試算查詢超過 10 秒 |

## 6. 商業規則

| 規則編號 | 說明 |
|---|---|
| BR-1 | 試算僅為預覽，不寫入任何分派結果；實際件數以月名單分派結果為準 |
| BR-2 | 工作日計算依 `calendarSource` 參數（v1.3）決定排除規則：`weekday`（預設）= `WHERE rest_flg = '0'`（排除週末+國定假日）/ `weekday-only` = `EXTRACT(DOW) NOT IN (0,6)`（僅排除週末）/ `all` = 不排除。範圍以 `calendar_date BETWEEN :startDate AND :endDate` 限定（預設整月）。資料來源為 AppDB `ob_calendar`（採 E04 + E05 / E07-OBCALENDAR-Load 雙層 ETL 從舊 OB DB 同步，詳見 [architecture-spec.md §E07-C](../architecture-spec.md#e07-c-etl-設計)）。預設 `weekday` 模式與原系統 SP（`OBCALENDAR WHERE REST_FLG=0`）一致 |
| BR-3 | 試算查詢逾時上限 10 秒，超過則回傳 `STAGE0_ESTIMATE_TIMEOUT` |
| BR-4 | Pool 筆數警示門檻可於環境變數 `STAGE0_POOL_WARN_THRESHOLD` 配置（預設 1000） |
| BR-5 | 當 `condition_payload` 解析結果無任何有效篩選條件（`buildStage1WhereConditions()` 回 `skipReason='EMPTY_CONDITIONS'`；含 `conditions=[]`、`_backfill_empty=true`、或所有條件均被 `caseyear='99'` wildcard / 無效值過濾後 fragment 數為 0 之情形）→ 試算 `count = 0`，與月名單分派 Stage 1「skip 該名單、不分派」行為一致（§18.5.2） |
| BR-6 | **估算為「完整 Stage 1 預估」（≡ 月名單分派案件數；v1.4 升級，取代原「條件符合上界」語意）**：自 [F092](F092-stage1-dry-run-estimate.md)（Stage 1 精確化 Phase 3）落地起，Stage 0 per-list 試算已升級為**完整 Stage 1 篩選鏈之唯讀 dry-run COUNT**（複用 `executeStage1Chain(list, workdt, ..., { dryRun: true })`，定義於 [architecture-spec.md AD-E07-23](../architecture-spec.md)；封裝於 [F091](F091-stage1-complete-month-cnt-dedup-special-delete.md) 之 `Stage1FilterChain`），**已含**月名單分派 Stage 1 之全部後續過濾：(a) `list_period_start`~`list_period_end` × `list_interval` 推導之 `MONTH_CNT` 期別過濾；(b) 近 3 個月已派案去重（比對 `ob_pool_data_list` 之 `ASSIGNDAY`，含 `data_source` = `etl_legacy`/`monthly_run` 聯集）；(c) 詐騙(白牌)/中結/滿期/年資等特殊業務 `DELETE` 規則。因此試算值**精確等於正式月名單分派 Stage 1 之分派案件數**（同一鏈，dry-run ≡ run，[F092 AC-3](F092-stage1-dry-run-estimate.md)），不再是「上界」。三步驟之逐條 SP 對照定義見 F091（SP `SP_INFOT_ASSIGNEXPORTNAMELIST_st1_list`：`#TargetCase` 撈案後施加 `WHERE o.MONTH_CNT IN (@TmpTbl)`、近 3 月 `ASSIGNDAY` 去重 `DELETE`、`LIST_TYPE='01' AND SPEC_NAME LIKE '%白牌%'` 與多段 `LIST_NM LIKE` 觸發之特殊 `DELETE`）。**註（與 BR-1 一致）**：試算仍為唯讀預覽、不寫入任何分派結果；最終分派以月名單分派實際執行結果為準。<br><br>**歷史語意（v1.2.1~v1.3，已被 v1.4 取代）**：升級前此規則述「估算為條件符合上界」（僅套欄位篩選 `buildStage1WhereConditions()`、不含 month_cnt/去重/特殊 DELETE、實際分派更少）；該描述於 F092 完整鏈 dry-run 落地後已不成立，保留為歷史紀錄。 |

## 7. 錯誤場景

| 場景 | 系統回應 | 參考 |
|---|---|---|
| `list_no` 不存在 | 404 `ASSIGNMENT_LIST_NOT_FOUND` | error-handling.md#assignment-errors |
| 試算查詢逾時 | 500 `STAGE0_ESTIMATE_TIMEOUT` | error-handling.md#assignment-errors |
| Pool 資料為空 | 200 `{ count: 0 }` | — |
| 名單無有效篩選條件（`skipReason='EMPTY_CONDITIONS'`） | 200 `{ count: 0 }`（與月名單分派 Stage 1 skip 該名單行為一致；見 BR-5） | — |

## 8. UI/UX 需求

> **v2.0 顯示層已重設計（US-170）**：本 §8 為 v1.3 之「單一名單 + 技術視角」UI 對齊清單。**v2.0 顯示契約以 [§19 術語清理](#19-顯示層術語清理us-170) 為準**——§8 中之 `base ratio` / `remainder` KPI 卡片、`base+1（餘數補）` 徽章、`Y (rest_flg=0)` / `N (skipReason)` pill、`calendar_date` / `ratioPerMille` 欄名、「工作日來源」selector 等技術標籤，於 v2.0 **依 §19.1 黑名單移除 / §19.3 改業務語言**。頁面主結構亦由「單一名單每日表」改為「部門 × 日期件數矩陣 + 缺口列 + 人均欄」（Part B §15~§18）。下游以更新後 `prototypes/30-stage0-estimate.html` 為 ground truth、矛盾時停下確認。

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
| ready 欄有 ≥1 名單 + 目前作業月份 + 月名單分派未鎖 | 渲染（白底藍邊 + calculator icon + 文字「試算」），點擊跳轉至 `30-stage0-estimate` |
| ready 欄無名單 / 歷史月份 | 整個 CTA Banner 不渲染（依 [F061 v1.4 §9](F061-trigger-assignment-run.md)），「試算」按鈕亦不可達 |
| 月名單分派執行中（`AssignmentRun.status IN ('pending','running')`） | CTA Banner 改琥珀色 disabled 樣式，「試算」按鈕 disabled，點擊無動作 |

**v1.0 已移除入口**（依 US-070 v2.3 / US-132 GAP-G3）：
- ~~F048 v1.0 主頁 Toolbar 之「Stage 0 試算」按鈕~~ — v2.0 已移除，避免重複入口
- ~~每列「計算案件數量」按鈕作為單一 LIST_NO 試算之入口~~ — 該功能於 v2.0 改由 Detail Drawer 內提示或試算頁內查詢實作；本 v1.1 暫不變更（屬未來 enhancement）

**Prototype canonical reference**：`prototypes/27-list-definition.html` v2.3 readyCtaHtml 段落（secondary 按鈕 hover 樣式：`bg-white hover:bg-blue-50`）

## 9. 相依性

- **Blocked By**：F048（名單定義清單）、E04 + E05 雙層 ETL（`ob_pool_data` 資料來源）、ETL Job **E07-OBCALENDAR-Load**（`ob_calendar` 工作日 / `rest_flg` 來源；已確認 2026-05 有 31 日 / 20 工作日資料）（詳見 [architecture-spec.md §E07-C](../architecture-spec.md#e07-c-etl-設計)）
- **Blocked By（Part B v2.0 新增）**：[F079](F079-set-dept-ratio.md)（`ob_dept_pct` per-list 部門比例＝§16 投影輸入）、[F082](F082-set-personnel-ratio.md) 之上游 `ob_emphire` 在職員工資料（§18 人均分母）、[F088](F088-ready-stage-summary.md) 物化 `estimateCases`（建議作為 §16 `list_total[L]` 來源，OQ-F049-02）、`SectionChiefScopeService.getScopeDeptCode`（§17 處長 scope；已存在）
- **Blocks**：F061（觸發月名單分派前業務部長依此決定是否執行）

## 10. 交叉參考

- 資料模型：[data-model.md#e07-data-model](../data-model.md#e07-data-model)（`ob_pool_data`、`ob_list_definition`）；[data-model.md#ob-calendar-entity](../data-model.md#ob-calendar-entity)（工作日表，採 E04 + E05 雙層 ETL 同步）
- 錯誤處理：[error-handling.md#assignment-errors](../error-handling.md#assignment-errors)
- 流程圖：[diagrams/F049-stage0-estimate-flow.mmd](../diagrams/F049-stage0-estimate-flow.mmd)（v1.x per-list 試算流程）
- 流程圖（Part B v2.0）：[diagrams/F049-stage0-dept-projection-flow.mmd](../diagrams/F049-stage0-dept-projection-flow.mmd)（名單 → per-list COUNT → ×ration → ×千分位 → 部門/日矩陣 → ÷在職人數；含 scope filter + 缺口分支）
- 角色存取矩陣：[F002 §4.6.2](F002-user-login.md)（Stage 0 試算部門矩陣端點 = `DirectorOrSectionChiefGuard` + service dept scope filter，US-168）
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
| OQ-E07-STAGE0-99 | `caseyear='99'`（不限年數）wildcard 之 `year_cnt` 語意與 ground-truth SP 不一致：composer 目前採「**完全跳過** `year_cnt` 條件」（架構決策 §18.5.1），而 SP `SP_INFOT_ASSIGNEXPORTNAMELIST_st1_list` 對 `'99'` 採 `o.YEAR_CNT >= 0 AND o.YEAR_CNT < 15`（即 0–14 封頂，排除 `year_cnt >= 15` 之案件） | **維持 §18.5.1 skip 決策不變更**。因 `'99'` 在原系統前端為**停用選項**（有效選項僅年數 0–10），名單實際不會帶入 `'99'`，屬理論邊界；兩種語意對 0–10 有效值之撈案結果相同，差異僅出現在 `year_cnt >= 15` 之案件是否納入 | 若未來開放 `'99'` 為有效選項，須由 system-architect 評估是否將 §18.5.1 改為對齊 SP 之 `0 <= year_cnt < 15` 封頂語意（同步影響月名單分派 Stage 1 與本試算）；本變更屬 architecture-spec.md §18.5.1 範疇，spec-writer 不於本文件逕自變更篩選行為 | Open（理論邊界，暫不處理） |
| OQ-E07-STAGE0-ROUND | 每日件數採 `round(ratioPerMille / 1000 × total)` 逐日獨立 round，加總可能與 `total` 有 ±N 件捨入誤差（N ≤ 工作日數）；原系統 SP 僅存 `RATIO_RATE`、件數於套用端計算，同樣未保證件數加總精確等於 total | **維持逐日 round、不做尾差調整**（與 SP 一致；試算為唯讀預覽 BR-1，誤差數件不影響月名單分派前評估用途） | 若未來要求「件數加總精確 = total」，可於最後一個工作日補尾差；屬 enhancement，非本版範疇 | Open（捨入誤差可接受，暫不處理） |

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
| 件數 = `round(ratio/1000 × total)` | SP 不算件數；件數於套用端（月名單分派 Stage 0 寫入時）按 ratio × 該名單案件數計算 — 本試算前端負責此乘法（calendar 相依的 ratio 由後端算、total 相依的件數由前端算） |

### 13.3 分工原則（後端 ratio / 前端件數 — 拍板 Design A，A-4 Resolved）

- **後端**（`daily-estimate` API）：負責 calendar 相依之部分 —— 解析 `calendarSource` / 起訖日 → 取 `ob_calendar` 工作日 → 計算每日 `ratioPerMille`（total-agnostic，與 `total` 無關、不接受 `total`/`listNo`、不回傳每日件數，可快取）。
- **前端**：負責 total 相依之部分 —— 取得選取名單 per-list COUNT 作為 `total`，逐日 `estimate = round(ratioPerMille / 1000 × total)`。
- 此分工對應原系統 SP「存 `RATIO_RATE`、件數於後段套用」之語意；亦使切換名單（改 `total`）時無需重算 ratio、切換 `calendarSource` / 日期（改 calendar）時才重算 ratio。
- **不變量**：`SUM(工作日 ratioPerMille) = 1000`。

---

# Part B — 業務化重設計（v2.0）

## 14. Part B 總覽 {#part-b-業務化重設計v20}

> 對應 User Story：[US-166](../../stories/epics/E07-app-customer-list-assignment/US-166-M01-stage0-dept-aggregated-view.md)、[US-167](../../stories/epics/E07-app-customer-list-assignment/US-167-M01-stage0-dept-daily-count-formula.md)、[US-168](../../stories/epics/E07-app-customer-list-assignment/US-168-M07-section-chief-stage0-readonly.md)、[US-169](../../stories/epics/E07-app-customer-list-assignment/US-169-M01-stage0-feasibility-metric.md)、[US-170](../../stories/epics/E07-app-customer-list-assignment/US-170-M01-stage0-terminology-cleanup.md)。

### 14.1 問題與目標

v1.x 試算頁以「單一 `list_no` 技術視角」為操作起點，業務部長 / 處長真正關心的問題是：「這個月每天整體工作量合不合理？哪個課的電訪量太重？平均一位電訪員一天打幾通打得完嗎？」。Part B 把試算頁重設計為**部門維度、每日、可行性導向**的業務視圖，並把技術術語退出使用者可見層。

### 14.2 分層模型（每一層只在前一層之上加法，不分叉底層）

| 層 | 輸入 | 產出 | 對應 US | 對應節 |
|---|---|---|---|---|
| L0 千分位 ratio（v1.x 既有，**不改**） | calendar + calendarSource | `dpm[d]`（每日千分位，Σ 工作日 = 1000） | — | §13 |
| L1 per-list 估算（v1.x 既有，**不改**） | 名單 condition_payload | `list_total[L]`（per-list dry-run COUNT，≡ 月名單分派 Stage 1） | F092 | §5.2 |
| L2 聚合 | 名單集合（全部 active / 單一） | 名單集合決定 | US-166 | §15 |
| L3 部門投影 | `list_total[L]` × `ration[L][D]` × `dpm[d]` | `dept_daily_count[d][D]`、`org_total[d]`、`gap[d]` | US-167 | §16 |
| L4 範圍隔離 | actor 角色 + `getScopeDeptCode` | scope-filtered 部門列 | US-168 | §17 |
| L5 可行性 | `dept_daily_count` ÷ `active_headcount` | `per_person_daily[d][D]` + 門檻警示 | US-169 | §18 |
| L6 顯示層術語清理 | L2~L5 之輸出 | 業務語言標籤 | US-170 | §19 |

> **架構師擁有「HOW」**：L2~L5 究竟以 SQL 下推或 in-memory 聚合計算、是否新增端點或擴充現有 `daily-estimate`、`list_total[L]` 取自 F088 物化 `estimateCases` 或即時 `estimateListCount`、門檻儲存位置、guard class 接線——均為 §23 架構師 OQ，本 spec 僅定義行為契約與不變量。

### 14.3 部門矩陣回傳契約（概念性，端點拓樸由架構師定）

Part B 需要一個能回傳「部門 × 日期件數矩陣（含 org_total / gap / per_person）」之唯讀能力。其**概念性** response 形狀如下（欄位語意為契約，實際端點數量 / 路徑 / 是否合併進 `daily-estimate` 由 §23 OQ-F049-01 裁定）：

```jsonc
{
  "ym": "202606",
  "mode": "aggregated",              // "aggregated"（全名單彙總，預設）| "single-list"
  "listNo": null,                    // single-list 模式時為選定 list_no
  "calendarSource": "weekday",
  "scope": { "role": "section_chief", "deptCode": "XVE1", "scoped": true },
  "departments": [                   // 本回應涵蓋之部門（處長僅含轄區，部長 / admin 含全部）
    { "deptCode": "XVE1", "deptName": "北區電銷1", "activeHeadcount": 27 }
  ],
  "days": [
    {
      "date": "2026-06-03", "weekday": "三", "isWorkday": true,
      "orgTotal": 1234,              // L3：全名單總量（不依賴部門比例）
      "deptAssignedTotal": 1100,     // Σ 已設定比例部門件數
      "gap": 134,                    // org_total − deptAssignedTotal（≥ 0）
      "deptCells": [
        { "deptCode": "XVE1", "cases": 480, "perPerson": 18, "overThreshold": true }
      ]
    },
    { "date": "2026-06-07", "weekday": "日", "isWorkday": false,
      "orgTotal": 0, "deptAssignedTotal": 0, "gap": 0, "deptCells": [] }  // 休息日不派案
  ],
  "threshold": 15,                   // 每人每日上限；未設定為 null（§18 AC-FEAS-4）
  "warnings": [],                    // 見 §21 BR-16 警告通道
  "poolCount": 50000,
  "poolWarning": null                // "POOL_COUNT_LOW" | null（沿用 v1.x AC-3）
}
```

> **處長模式不含 `deptAssignedTotal` 全部門合計語意**：US-168 AC-2 規定處長不顯示「全部門合計」列；故處長回應中 `deptAssignedTotal` / `gap` 之語意限縮為「其轄區單一部門」，前端不渲染跨部門合計列（§17 BR-13）。

---

## 15. 聚合層：全名單彙總預設與單一名單鑽探（US-166）

### 15.1 驗收契約

**AC-AGG-1（預設全名單彙總；對應 US-166 AC-1，supersedes US-071 AC-4-Default）**
- **Given** 業務部長 / 處長進入 `/assignment/estimate`，且當月（`project_workym = currentWorkYm`）有 ≥ 1 筆 `status='active'` 之 `ob_list_definition`
- **When** 頁面初次載入
- **Then** 進入「全名單彙總」模式：名單集合 = 當月**所有** active 名單；以部門維度顯示每日預估分派量（§16）
- **And** 頁面標示「顯示模式：所有啟用名單彙總」（或等效業務語言）
- **And** **不**自動選取「第一筆名單」（v1.3 AC-4-Default 之自動選第一筆行為由本 AC 取代）

**AC-AGG-2（單一名單鑽探；對應 US-166 AC-2 / AC-3）**
- **Given** 頁面在全名單彙總模式
- **When** 使用者於名單篩選器選取某一 `list_no`
- **Then** 切換至「單一名單模式」：名單集合縮減為該筆，部門投影公式不變（§16 僅輸入名單集合不同）
- **And** 標示「顯示模式：單一名單 `{list_nm}（{list_no}）`」
- **When** 使用者再選「全部名單」**Then** 回到全名單彙總模式並重新合計

**AC-AGG-3（空狀態；對應 US-166 AC-4）**
- **Given** 當月無任何 `status='active'` 之 `ob_list_definition`
- **When** 頁面載入
- **Then** 顯示空狀態文案「本月尚無啟用名單，請先於名單定義頁建立並啟用名單」，所有估算欄顯示「—」，不渲染任何計算數值

**AC-AGG-4（換月重算；對應 US-166 AC-5）**
- **Given** 頁面顯示某月彙總估算
- **When** 切換作業月份
- **Then** 以新月份所有 active 名單重新計算彙總，頁面資料完整更新

**AC-AGG-5（唯讀、不寫入；對應 US-166 AC-6）**
- **Given** 任何模式下估算完成
- **Then** 不寫入 `ob_pool_data_list`、`assignment_run`、`assignment_run_snapshot`、`ob_monthly_run_result` 或任何分派紀錄（沿用 BR-1；estimate ≡ run invariant 保留於唯讀層）

---

## 16. 部門投影層：部門每日件數公式 + 缺口機制（US-167）

### 16.1 計算公式（對應 US-167 AC-1）

設名單集合為 `S`（全名單彙總 = 全部 active；單一名單 = {選定}）：

- 每份名單 per-list 估算件數 `list_total[L]`：來自 L1（§5.2 per-list dry-run COUNT，≡ 月名單分派 Stage 1）
- 每份名單對各部門比例 `ration[L][D]`：來自 `ob_dept_pct`（WHERE `list_no=L AND obdeptid=D`；單位百分比 0–100；資料由 F079 部門比例設定產生）
- 每日千分位 `dpm[d]`：來自 L0（§13 `ratioPerMille`；Σ 工作日 = 1000）

**部門每日件數（實數，未捨入）**：

```
dept_real[d][D] = Σ_{L ∈ S} ( list_total[L] × ration[L][D] / 100 × dpm[d] / 1000 )
```

- 休息日（`dpm[d] = 0`）：所有部門 `dept_real[d][D] = 0`
- 未設定比例之 `(L, D)` 對該組合貢獻 0（不參與加總，亦不顯示為部門列）

### 16.2 全名單總量與缺口（對應 US-167 AC-2 / AC-3 / AC-5「保住總量＋標示缺口」模型）

```
org_real[d] = Σ_{L ∈ S} ( list_total[L] × dpm[d] / 1000 )         // 不依賴任何部門比例，必為正確值
gap_real[d] = org_real[d] − Σ_D dept_real[d][D]                   // 因 Σ_D ration[L][D] ≤ 100，恆 ≥ 0
```

**AC-DEPT-1（部門件數顯示；US-167 AC-1 / AC-3）**：每個工作日對每個「已設定比例之部門」顯示 `dept_daily_count[d][D]`（捨入規則見 §16.3）。全名單彙總模式底部同時顯示兩個合計列：(1)「已分派部門合計」= Σ_D 已設定比例部門件數；(2)「全名單總量」= `org_total[d]`。

**AC-DEPT-2（0 件部門不顯示；US-167 AC-2）**：在顯示期間「整期工作日件數合計 = 0」之部門**一律不列出任何部門行 / 不出現於部門切換器**（不顯示為 0）。涵蓋兩種情形：(a) 完全未設定比例；(b) `ob_dept_pct` 有列但對有量名單之有效比例為 0（例如 ration=0、或其名單 list_total=0）。被排除部門之件數（恆為 0）一律歸入缺口；因被排除者件數為 0，故排除動作**不改變** `org_total` 與 `gap`（見 §16.3 不變量）。退化：若所有部門整期皆 0（全量未分派）→ `departments=[]`、`gap=org_total`。處長 scope 命中但其轄區部門整期 0 件時 → `departments=[]`，前端比照 scope=null 之空狀態友善降級（顯示「本月您的轄區尚無分派預估」類訊息、不 crash）。

**AC-GAP-1（缺口標示；US-167 AC-2 / AC-5）**：`gap[d] > 0` 時，以橘色缺口列 / 徽章標示「尚有 {gap} 件未分派到部門（比例未設定或未達 100%）」；計算**不被中斷**、**不自動補差**（缺口僅標示、不填入任何部門）。

**AC-GAP-2（缺口為 0 不顯示；US-167 AC-2 最後一條）**：`gap[d] = 0` 時不顯示缺口列。

**AC-GAP-3（未達 100% 統一納入缺口；US-167 AC-5）**：名單部門比例總和 `Σ ration < 100`（含「完全未設＝0%」與「部分設定未達 100%」）之差額，**統一表現為 `gap`**，以單一缺口列一次標示，**不另出獨立的名單層級警示文字**。

### 16.3 捨入規則（裁定 OQ-167-01）

> **spec-writer 裁定**：採 JavaScript `Math.round`，於**最終每格實數**套用一次（不做中間 per-list 捨入）：
> - `org_total[d] = Math.round(org_real[d])`
> - `dept_daily_count[d][D] = Math.round(dept_real[d][D])`
> - `gap[d] = Math.round(gap_real[d])`（先由實數算 gap 再捨入，確保 gap ≥ 0、不因兩端各自捨入產生負值）
> - 與 §13 之 `round(ratioPerMille/1000 × total)` 語意一致。
>
> **±N 捨入容差（沿用 §12 OQ-E07-STAGE0-ROUND 之容差語意）**：「已分派部門合計」（Σ 各格捨入值）與 `org_total`、`gap` 之間可能有 ≤（部門數 × 工作日數）件之捨入殘差；因試算為唯讀預覽（BR-1），**不做尾差調整**。downstream 測試斷言應以實數公式為金標準、容許顯示值 ±1/格之捨入差，**不可** assert「Σ 部門捨入值 === org_total 捨入值」嚴格相等。

### 16.4 部門名稱來源

部門顯示名稱優先取 `ob_dept_pct.obdeptnm`（per-list 部門名稱），缺值時 fallback `ob_emphire.dept_name`（by `dept_code = obdeptid`）。`deptCode` 一律為 `ob_dept_pct.obdeptid`（trimmed）。

---

## 17. 範圍隔離層：處長唯讀 dept scope（US-168）

### 17.1 隔離契約（複用 `listLists` 既有模式）

處長轄區判定**複用既有** `SectionChiefScopeService.getScopeDeptCode(userId)`（`users.email → ob_emphire.email`，trimmed + case-insensitive，`resign_date IS NULL` 且 `jfun_nm='處長'` → 回 `dept_code`，對不上回 `null`）。scope 過濾語意鏡像 `assignment-list.service.ts` `listLists` 之 `EXISTS (SELECT 1 FROM ob_dept_pct p WHERE p.list_no=l.list_no AND TRIM(p.obdeptid)=:scope)`——即「**只保留 `obdeptid = scope` 之部門列**」。

### 17.2 驗收契約

**AC-SCOPE-1（處長可進入、唯讀；US-168 AC-1）**
- **Given** `businessRole='section_chief'`
- **When** 導航至 `/assignment/estimate`
- **Then** 頁面成功載入（HTTP 200，不被導向無權限頁；取消 v1.x `DirectorGuard` 完全封鎖）
- **And** 顯示「唯讀模式：僅顯示您轄區部門（{dept_name}）的預估資料」banner，且不顯示任何可修改設定之操作按鈕

**AC-SCOPE-2（只見轄區部門列；US-168 AC-2 / AC-6）**
- **Given** 處長 scope = `'XVE1'`
- **When** 載入部門每日件數矩陣
- **Then** 矩陣只含 `obdeptid='XVE1'` 之部門列；其他部門列（含列本身、名稱、件數、人均等任何衍生指標）**完全不存在於 response**（非數字遮罩）
- **And** 不顯示「全部門合計」列（處長看不到全部門，合計無意義）

**AC-SCOPE-3（後端為安全邊界；US-168 AC-3 / AC-6）**
- **Given** 處長持有效 JWT，scope = `'XVE1'`
- **When** 以任何手段（含直接呼叫 API、夾帶他部門查詢參數）請求部門矩陣或 list-estimate
- **Then** service 層強制套用 dept scope filter，response **只含** `XVE1` 結果；**不回 403**（允許存取、資料被限縮）
- **And** 隔離不依賴前端遮罩（前端遮罩僅 UX，後端 filter 為安全邊界）
- **And** filter 行為記入 server log（例：`[Stage0Estimate] section_chief scope applied dept_code=XVE1`）

**AC-SCOPE-4（部長 / admin 不受限；US-168 AC-4）**
- **Given** `businessRole='director'` 或 `role='admin'`
- **Then** 顯示所有部門 + 全部門合計，不套用任何 dept scope filter

**AC-SCOPE-5（scope=null 友善降級；US-168 AC-5）**
- **Given** 處長登入但 `getScopeDeptCode` 回 `null`（email 對不上 ob_emphire、或非處長、或已離職）
- **When** 頁面載入
- **Then** 顯示「無法識別您的轄區部門，請聯繫系統管理員確認帳號 ob_emphire 設定」，所有估算數值顯示「—」，後端回**空結果**（空 `departments` / 空 `days[].deptCells`）；**不 crash、不回 500、不回 403**

---

## 18. 可行性層：人均每日件數（US-169）

### 18.1 公式與資料來源（對應 US-169 AC-1 / AC-5）

```
per_person_daily[d][D] = Math.round( dept_daily_count[d][D] / active_headcount[D] )
active_headcount[D]    = COUNT( ob_emphire WHERE TRIM(dept_code) = D AND resign_date IS NULL )
```

- `D` 為 `ob_dept_pct.obdeptid`；headcount 以 `ob_emphire.dept_code = D` 之**在職**（`resign_date IS NULL`）員工數為除數（代號空間 / 粒度查證見 §20）
- 處長 scope 下，`active_headcount` 僅計其轄區 `dept_code = scope` 之在職員工，與 §17 scope 邊界一致（US-169 AC-5）

### 18.2 驗收契約

**AC-FEAS-1（顯示人均欄；US-169 AC-1）**：部門 × 工作日另顯示「人均每日件數」欄，值 = §18.1 公式；休息日顯示「—」（不做除法）。

**AC-FEAS-2（headcount=0 不 crash；US-169 AC-2）**：某部門在職人數為 0 時，人均欄顯示「—」（不出 `Infinity` / `NaN`），頁面不 crash，其他部門正常；該部門顯示橘色提示「{dept_name} 在職人數為 0，請確認 ob_emphire 資料是否已同步」（警告碼見 §21 BR-16 `DEPT_HEADCOUNT_ZERO`）。

**AC-FEAS-3（超門檻紅色警示；US-169 AC-3）**：`per_person_daily` 超過「每人每日上限」門檻 `threshold` 時，該欄紅色顯示並附「超過每人每日上限 {threshold} 件」；未超過為正常顯示。

**AC-FEAS-4（門檻未設定降級；US-169 AC-4）**：`threshold` 為 `null` / 未配置時，所有人均欄正常顯示計算值（無紅色警示），不因缺門檻而 crash 或報錯。

> **門檻來源（裁定方向 + 架構師 OQ）**：spec-writer 建議 MVP 採**系統層級設定**（環境變數，建議名 `STAGE0_MAX_CASES_PER_PERSON_PER_DAY`），預設**未設定（null）→ 不標紅**（對齊 AC-FEAS-4 降級）。是否改為 DB config 或頁面可調 slider（業務自助試算）屬未定架構決策，見 §23 OQ-F049-03，**spec-writer 不自決儲存機制**。

### 18.3 人均分子的口徑假設

> **[ASSUMPTION] A-5（headcount 口徑）**：US-169 AC-1 之 `active_headcount` 字面定義為「`dept_code=D` 且 `resign_date IS NULL` 之**全部**在職員工數」，故分母包含該部門所有在職人員（含處長 / 課長 / 襄理等非純電訪職），**非**僅 `jfun_nm` 為電訪員者。本 spec 依 US-169 字面契約實作（全部在職）；若業務要求改以「純電訪職」為分母，屬口徑調整，須 PO + 架構師另議（§23 OQ-F049-06），非本版範疇。

---

## 19. 顯示層術語清理（US-170）

### 19.1 使用者可見文字移除黑名單（對應 US-170 AC-1 / AC-2 / AC-3；支撐 TC-170-01 DOM 全文掃描 regression）

下列字串**一律不得**出現於使用者可見文字（標籤 / 標題 / 說明 / 表格欄位 / KPI / tooltip / 警示）：

| 類別 | 移除字串 |
|---|---|
| 工作日旗標 | `rest_flg`、`rest_flg=0` |
| ratio 內部概念 | `base ratio`、`base`（千分位底數語境）、`remainder`、`餘數`、`base+1`、`base+1（餘數補）`、`ratioPerMille` |
| DB / 資料表名 | `ob_assign_set`、`ob_pool_data`、`OBPOOLDATA`、`ob_pool_data_list`、`calendar_date`（作為欄位名） |
| 設定 / 架構代號 | `STAGE0_POOL_WARN_THRESHOLD`、`AD-E07-8` |
| API 路徑 | 任何 `GET /api/v1/...` 格式字串 |

### 19.2 移除之 UI 元件（對應 US-170 AC-4）

- 移除 KPI 卡片 `base ratio (‰)`、`remainder 餘數`
- 移除每日列 / bar 之「工作日 base」vs「工作日 base+1（餘數補）」狀態區分與 `base+1` 徽章 / 特殊顏色；bar chart 圖例改為單一「工作日」
- 移除 AD-E07-8 公式框（不顯示 `base = FLOOR(1000 / working_days)`、`rem = 1000 mod working_days`、`每日件數 = round(ratioPerMille / 1000 × total)`）

### 19.3 業務語言替代（對應 US-170 AC-5 / AC-6 / AC-7 / AC-8）

| 項目 | v1.x 技術標籤 | v2.0 業務語言（意圖；最終逐字文案由 UI/UX 定） |
|---|---|---|
| 工作日標記 | `Y (rest_flg=0)` | 「工作日」 |
| 休息日標記 | 「跳過」、`N (週末·國定假日)` | 「休息日（不派案）」 |
| 顏色編碼 | — | 保留視覺區別（綠＝工作日、灰＝休息日） |
| 表格欄位 | `calendar_date` / `ratioPerMille` / `isWorkday` / `skipReason` | 「日期」、「星期」、「預估件數」、「累積件數」；工作日 / 休息日欄標題用「日別」或等效 |
| 派案日曆下拉 | 「工作日來源」+ `weekday` / `weekday-only` / `all` | 標籤改「派案日曆」；選項：「只排上班日」(`weekday`) / 「也排連假日（週末除外）」(`weekday-only`) / 「連週末都排（全月每天）」(`all`)；功能行為不變，附簡短說明 |
| 唯讀試算說明 | 「Daily estimate 不寫入 ob_assign_set」 | 「此試算不觸發正式分派，僅供工作量評估參考」 |
| Pool 偏低警示 | 含 `OBPOOLDATA` / `STAGE0_POOL_WARN_THRESHOLD` | 「系統資料池筆數偏低（目前 N 筆），可能影響估算準確度，請聯繫 IT 確認資料是否已完成更新」 |

**AC-TERM-1**：v2.0 頁面任意可見位置全文掃描，§19.1 黑名單字串均不出現（US-170 AC-1，自動化 regression）。
**AC-TERM-2**：KPI 區不含 base ratio / remainder 卡片；每日列無 base+1 徽章（US-170 AC-4 / TC-170-02 / TC-170-03）。
**AC-TERM-3**：派案日曆下拉顯示業務標籤且切換後估算結果隨之變動（功能行為不變；US-170 AC-7 / TC-170-04）。
**AC-TERM-4**：Pool 偏低警示為業務語言、不含技術詞彙（US-170 AC-8 / TC-170-05）。

> **邊界**：本節為**顯示層契約**，明確界定「移除什麼、用什麼業務語言取代」以支撐 regression test；像素級 / 逐字最終文案屬 UI/UX（Phase 5），矛盾時下游以 `prototypes/30-stage0-estimate.html`（更新後版本）為 ground truth 並停下確認。**底層技術行為（千分位 ratio、calendar 來源）完全保留，只是不再暴露給使用者**。

---

## 20. OQ-167-03 schema 查證結果（部門代號空間 / 粒度）{#oq-167-03-resolution}

> **風險**：US-167 部門投影用 `ob_dept_pct.obdeptid`；US-169 人均用 `ob_emphire.dept_code` 計在職人數；US-168 處長 scope 用 `getScopeDeptCode`（回 `ob_emphire.dept_code`）。若三者代號空間或粒度（課 vs 處）不一致，人均指標將對應到不同粒度而失去意義。

### 20.1 spec-writer 已查證（dev DB `cdmp_dev`，2026-06-26）

| 查核項 | 結果 | 判讀 |
|---|---|---|
| 既有耦合 | `listLists` 已以 `getScopeDeptCode → EXISTS ob_dept_pct.obdeptid = scope` 過濾名單（生產既有、F077/F082 運作中） | `ob_emphire.dept_code` 與 `ob_dept_pct.obdeptid` 已是同一代號空間之 load-bearing 假設 |
| distinct 數 | `ob_emphire`（在職）8 個 distinct `dept_code`；`ob_dept_pct` 8 個 distinct `obdeptid` | 數量一致 |
| 重疊 | 8 個 `obdeptid` **全部** 出現於在職 `ob_emphire.dept_code`（matched 8/8）；無任何在職 `dept_code` 落在 `obdeptid` 集合之外 | **100% 重疊、無孤兒碼** |
| 長度 | 兩側皆為 4–5 字（`obdeptid` varchar(6)、`dept_code` varchar(10)，實際值未補滿） | 長度一致、可直接 TRIM 比對 |
| 每部門在職人數 | 每個 `obdeptid` 以 `dept_code=obdeptid` exact match 取得**非零**在職人數（電銷課 XVE1=27 / XVE2=28 / XVE3=22 / XVE4=14；另含 AI000/AM000/B0000/BD000 等非電銷部門小額人數） | 人均分母可由 exact match 取得、粒度一致 |
| 處長粒度 | 在職 `jfun_nm='處長'` 共 4 人，各對應一個 distinct `dept_code`（4 distinct） | 處長 → 單一 dept_code，scope 過濾粒度與部門投影一致 |

**結論**：在 dev 資料集，三者為**同一代號空間且同粒度**——`ob_emphire.dept_code`（在職）以 exact match 對應 `ob_dept_pct.obdeptid`，人均指標有意義。US-167 / US-169 公式以 `D = obdeptid`、headcount `= COUNT(ob_emphire WHERE dept_code=D AND resign_date IS NULL)` 為正確契約。

### 20.2 殘留須由架構師驗證（production）

dev 資料乾淨不代表 production ETL 後一致。架構師須於 production / staging（ETL 後）對同一查核複跑（見 §23 OQ-F049-05）：(1) 在職 `ob_emphire.dept_code` 與 `ob_dept_pct.obdeptid`（同月）之重疊率應 = 100%（無孤兒碼）；(2) 每個被指派比例之 `obdeptid` 之在職人數應 > 0（否則人均退化為「—」，AC-FEAS-2）。若 production 出現孤兒碼或某 `obdeptid` 在職人數恆 0，須評估是否需要 dept_code↔obdeptid mapping 層（對應 US-169 OQ-169-02）。

---

## 21. Part B 商業規則（BR-7 ~ BR-16）

| 規則編號 | 說明 |
|---|---|
| BR-7 | 預設顯示模式為「全名單彙總」（名單集合 = 當月全部 `status='active'`）；單一名單鑽探為可選篩選，非預設出發點（US-166） |
| BR-8 | 部門每日件數 = `Σ_L( list_total[L] × ration[L][D]/100 × dpm[d]/1000 )`；`ration` 為 **per-list**（取自 `ob_dept_pct`，刻意不採 legacy MIN(LIST_NO) 共享比例，與 F101 一致；此為已決事項、非新 OQ） |
| BR-9 | `org_total[d]` 一律由 `Σ_L( list_total[L] × dpm[d]/1000 )` 算出，**不依賴任何部門比例設定**，必為正確上界（US-167 AC-2） |
| BR-10 | 缺口 `gap[d] = org_total[d] − Σ_D dept_daily_count`，恆 ≥ 0；gap > 0 標示缺口列、**不自動補差**；gap = 0 不顯示（US-167 AC-2/AC-5） |
| BR-11 | 比例未達 100%（含完全未設）之差額統一表現為 `gap`，**不另出名單層警示文字**（US-167 AC-5） |
| BR-12 | 處長存取為唯讀；部門矩陣端點授權放寬至 `DirectorOrSectionChiefGuard`，service 層強制 dept scope filter（複用 `getScopeDeptCode → ob_dept_pct.obdeptid` 模式）；per-list COUNT 端點同步開放至處長，但其回傳為名單層總量（無部門分解），scope filter 對它為 no-op（US-168） |
| BR-13 | 處長 response 只含其 `obdeptid` 列、不含全部門合計列；其他部門列完全不存在於 response（非遮罩），後端 filter 為安全邊界（US-168 AC-2/AC-3/AC-6） |
| BR-14 | `getScopeDeptCode` 回 `null` → 200 空結果 + 友善訊息，不 403、不 500（US-168 AC-5） |
| BR-15 | 人均每日件數 = `round(dept_daily_count ÷ active_headcount)`；`active_headcount = COUNT(ob_emphire WHERE TRIM(dept_code)=D AND resign_date IS NULL)`；headcount=0 → 「—」+ 警告（不除零）；休息日 → 「—」（US-169） |
| BR-16 | 警告通道：headcount=0 → `DEPT_HEADCOUNT_ZERO`（per dept）；處長 scope=null → `SCOPE_UNRESOLVED`；超門檻為前端顯示態（非後端警告）。警告以 response `warnings[]`（結構性，非錯誤碼）承載，沿用月名單分派 `warning_summary` 既有慣例，**不**擴 `assignment_audit_log.action` enum（落點細節見 §23 OQ-F049-07） |

---

## 22. 估算 ≡ 月名單分派 不變量與邊緣案例（Part B）

### 22.1 I-RUN-EST-01 硬性約束

部門投影層（L3）僅在既有 `computeWorkingDayRatios`（§13 / `stage0-estimate.service.ts`）產出之 `dpm[d]` **之上**做「Σ over lists × ration × dpm」加法與部門投影；**不得分叉、不得修改**底層 calendar / ratio 邏輯。該 ratio 與月名單分派 Stage 4 ASSIGNDAY（`distributeStage3to4`）共用單一來源（[AD-E07-29 §3.4](../architecture-spec.md) / I-RUN-EST-01）。`list_total[L]` 須來自與月名單分派 Stage 1 同源之 dry-run COUNT（§5.2 / F092），不得另寫一套 per-list 篩選。**架構師擁有確切共用 / 下推機制**（§23 OQ-F049-01/02）。

### 22.2 邊緣案例

| 案例 | 預期行為 | 對應 |
|---|---|---|
| 當月 0 筆 active 名單 | 空狀態文案，所有欄「—」，不計算 | AC-AGG-3 |
| 名單有 `list_total` 但完全無 `ob_dept_pct` 比例 | `org_total` 正常顯示；無任何部門列；缺口 = org_total（全額未分派） | AC-DEPT-2 / AC-GAP-1 |
| 名單比例總和 70% | 已設定部門正常顯示；缺口 = 30% 對應件數；不另出名單層警示 | AC-GAP-3 / BR-11 |
| 休息日（`dpm=0`） | 所有部門件數 0、人均「—」、gap = 0、缺口列不顯示 | AC-FEAS-1 / TC-167-03 |
| 某部門在職人數 0 | 件數正常顯示，人均「—」+ 橘色提示，頁面不 crash | AC-FEAS-2 |
| 門檻未設定 | 人均正常顯示、無紅色警示 | AC-FEAS-4 |
| 處長 scope=null | 200 空結果 + 友善訊息，非 403 / 500 | AC-SCOPE-5 / BR-14 |
| 處長轄區某 obdeptid 在 `ob_dept_pct` 無該名單比例 | 該名單對該部門貢獻 0；若處長轄區當月全無比例，部門列為空、顯示缺口/空狀態 | §17 / BR-13 |
| per-list COUNT 逾時（10s） | `STAGE0_ESTIMATE_TIMEOUT`（沿用 BR-3 / AC-5）；全名單彙總之逐名單 COUNT 效能風險見 §23 OQ-F049-02 | BR-3 |

### 22.3 US AC-ID ↔ F049 AC 對照（可追溯性）

| User Story | US AC-ID | F049 v2.0 AC / 規則 |
|---|---|---|
| US-166 | AC-1 / AC-4-Default(取代) | AC-AGG-1 |
| US-166 | AC-2 / AC-3 | AC-AGG-2 |
| US-166 | AC-4 | AC-AGG-3 |
| US-166 | AC-5 | AC-AGG-4 |
| US-166 | AC-6 | AC-AGG-5 / BR-1 |
| US-167 | AC-1 | AC-DEPT-1 / §16.1 公式 / BR-8 |
| US-167 | AC-2 | AC-DEPT-2 / AC-GAP-1 / AC-GAP-2 / BR-9 / BR-10 |
| US-167 | AC-3 | AC-DEPT-1（雙合計列）/ §16.2 |
| US-167 | AC-4 | AC-AGG-2（單一名單模式公式不變）|
| US-167 | AC-5 | AC-GAP-3 / BR-11 |
| US-167 | OQ-167-01 | §16.3 裁定（Math.round）|
| US-167 | OQ-167-03 | §20 查證結果 + §23 OQ-F049-05 |
| US-168 | AC-1 | AC-SCOPE-1 |
| US-168 | AC-2 | AC-SCOPE-2 / BR-13 |
| US-168 | AC-3 | AC-SCOPE-3 / BR-12 |
| US-168 | AC-4 | AC-SCOPE-4 |
| US-168 | AC-5 | AC-SCOPE-5 / BR-14 |
| US-168 | AC-6 | AC-SCOPE-2 / AC-SCOPE-3 / BR-13 |
| US-169 | AC-1 | AC-FEAS-1 / §18.1 / BR-15 |
| US-169 | AC-2 | AC-FEAS-2 / BR-16 |
| US-169 | AC-3 | AC-FEAS-3 |
| US-169 | AC-4 | AC-FEAS-4 |
| US-169 | AC-5 | §18.1（scope 一致）/ BR-12 |
| US-169 | OQ-169-01 | §18.2 裁定方向 + §23 OQ-F049-03 |
| US-169 | OQ-169-02 | §20 / §23 OQ-F049-05 |
| US-170 | AC-1/AC-2/AC-3 | §19.1 / AC-TERM-1 |
| US-170 | AC-4 | §19.2 / AC-TERM-2 |
| US-170 | AC-5/AC-6 | §19.3 / AC-TERM-1 |
| US-170 | AC-7 | §19.3 / AC-TERM-3 |
| US-170 | AC-8 | §19.3 / AC-TERM-4 |

---

## 23. 架構師 Open Questions（Part B；spec-writer 不自決）

| OQ 編號 | 議題 | spec-writer 建議預設 | 狀態 |
|---|---|---|---|
| OQ-F049-01 | 部門矩陣（org_total / dept cells / gap / per_person）以**何端點**承載？新增 `GET /assignment/stage0/dept-estimate` 還是擴充既有 `daily-estimate`？回傳一次整月矩陣還是 per-day？ | 新增獨立唯讀端點（如 `dept-estimate`），一次回整月矩陣（§14.3 形狀）；`daily-estimate`（純 ratio）保持 total-agnostic 不動，維持 I-RUN-EST-01 分工 | 待 architect |
| OQ-F049-02 | 部門投影以 **SQL 下推**（join `ob_dept_pct` × `ob_pool_data` dry-run COUNT × calendar）或 **in-memory** 聚合？全名單彙總需 N 份名單 × per-list dry-run COUNT，逐筆即時 COUNT 在頁面載入恐超 10s（沿用 BR-3 逾時）。`list_total[L]` 來源 = F088 已物化 `estimateCases`（避免 N× dry-run）或即時 `estimateListCount`？ | `list_total[L]` 優先取 **F088 物化 `estimateCases`**（F092 dry-run 結果，已存），部門投影 / 缺口 / 人均於 service 層 in-memory 合成（資料量為「部門數 × 日數」小矩陣）；底層 ratio / list COUNT 不重算。若 F088 物化不可用則 fallback 即時 `estimateListCount` 並評估背景化 | 待 architect |
| OQ-F049-03 | 「每人每日上限」門檻之**儲存機制**：環境變數 / DB config / 頁面可調 slider？ | MVP 採環境變數 `STAGE0_MAX_CASES_PER_PERSON_PER_DAY`，預設未設定（null）→ 不標紅（對齊 AC-FEAS-4）；DB config / on-page slider 列為未來 enhancement | 待 architect |
| OQ-F049-04 | 部門矩陣端點之 **guard 接線**：`Stage0EstimateController` 目前 class 級已是 `DirectorOrSectionChiefGuard` + `@RequireDirectorOrSectionChief()`，但 method 以 `@RequireDirector()` 覆寫。是否在新 / 既有端點移除 method 級 `@RequireDirector()` 並由 service 收 actor 套 scope？ | 部門矩陣端點移除 method 級 `@RequireDirector()`（落回 class 級 DirectorOrSectionChief），service method 收 `actor` 並套 dept scope filter（鏡像 `listLists`）；per-list COUNT 端點同步移除 `@RequireDirector()` | 待 architect |
| OQ-F049-05 | **OQ-167-03 production 驗證**（接 §20.2）：對 production / staging ETL 後資料複跑「在職 `ob_emphire.dept_code` 與同月 `ob_dept_pct.obdeptid` 重疊率 = 100%、每個被指派比例 obdeptid 在職人數 > 0」；若出現孤兒碼 / 恆 0 部門，評估是否需 dept_code↔obdeptid mapping 層 | dev 已 100% 對齊（§20.1）；production 比照確認即可，預期無需 mapping 層 | 待 architect 驗證（高風險殘留） |
| OQ-F049-06 | 人均分母口徑（接 A-5）：`active_headcount` 是否應排除非電訪職（處長 / 課長 / 襄理），只計 `jfun_nm` 為電訪員者？ | 依 US-169 字面＝全部在職；是否限電訪職屬 PO 口徑決策，非本版範疇 | 待 PO / architect |
| OQ-F049-07 | Part B 警告（`DEPT_HEADCOUNT_ZERO` / `SCOPE_UNRESOLVED`）落點：response `warnings[]` 結構欄位 vs 既有 `warning_summary` vs 擴 audit enum？ | 走 response `warnings[]` 結構欄位（不擴 `assignment_audit_log.action` enum、不新增錯誤碼），與月名單分派 `warning_summary` 慣例一致 | 待 architect |

> **架構師範疇明示**：上述 OQ 之最終裁定與 `architecture-spec.md` / AD-E07-8 / AD-E07-29 / `data-model.md` 之對應更新由 system-architect 承載；本 feature 檔僅定義行為契約、不變量與資料來源映射，**不**寫 SQL / guard 實作 / 端點程式碼 / migration / test。
