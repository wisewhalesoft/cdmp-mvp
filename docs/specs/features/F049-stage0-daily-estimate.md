---
spec-id: F049
title: Stage 0 每日分派數量估算
feature-id: F049
source-story: US-071, US-132
epic: E07
module: M01 名單定義
priority: P0-MVP
version: "1.2.1"
date: 2026-05-26
status: Draft
---

# F049: Stage 0 每日分派數量估算（含單一 LIST_NO 案件試算）

Priority: P0-MVP | Status: Draft | Last Updated: 2026-05-26

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

### AC-1：顯示 Stage 0 每日估算表

- **Given** 業務部長已進入名單定義頁面並選擇「Stage 0 估算」
- **When** 頁面載入估算資料
- **Then** 顯示本月每個工作日的預估分派件數，表格欄位含：日期、星期、預估件數
- **And** 表格底部顯示本月預估總件數與實際工作天數

### AC-2：估算基準說明

- **Given** Stage 0 估算表已顯示
- **When** 業務部長查看估算說明區
- **Then** 顯示估算所使用的基準參數：`ob_pool_data` 總筆數、每日分派比例係數、排除週末/國定假日邏輯

### AC-3：Pool 筆數偏低警示

- **Given** `ob_pool_data` 本月筆數低於警示門檻（預設 1,000 筆；閾值可於環境變數 `STAGE0_POOL_WARN_THRESHOLD` 配置）
- **When** 估算計算完成
- **Then** 在估算表上方顯示橘色警示：「Pool 資料筆數偏低（現有 N 筆），請確認資料擷取任務已正常執行」

### AC-4：單一 LIST_NO 即時案件試算

- **Given** 業務部長在名單定義清單（F048）中查看某 `status = 'active'` 的名單
- **When** 業務部長點擊該列的「計算案件數量」按鈕
- **Then** 系統以該 `list_no` 的 `condition_payload`（§18.4，名單篩選條件之 source of truth）為篩選依據，對共享案件池 `ob_pool_data` 即時 COUNT，回傳「符合條件案件數：N 筆」（`ob_pool_data` 為共享池，無 `list_no` 欄位）
- **And** 試算之 WHERE 子句**直接複用月跑 Stage 1 之 `buildStage1WhereConditions()` 演算法**（[architecture-spec.md §18.5](../architecture-spec.md)），確保 estimate 與實際月跑 Stage 1 逐欄位一致，不得另寫一套篩選邏輯
- **And** 此試算不執行實際月跑，不寫入 `ob_pool_data_list`，不建立 `assignment_run` 紀錄

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

### 5.1 GET /api/v1/assignment/stage0/daily-estimate

| Query Parameter | 型別 | 必填 | 說明 |
|---|---|---|---|
| ym | string（YYYYMM） | 否 | 預設為目前作業年月 |

**Response — 200 OK**

```json
{
  "ym": "202605",
  "workingDays": 22,
  "totalEstimate": 50000,
  "dailyEstimates": [
    { "date": "2026-05-02", "weekday": "一", "estimate": 2272 }
  ],
  "poolCount": 50000,
  "warning": null
}
```

若 `poolCount` 低於 `STAGE0_POOL_WARN_THRESHOLD`，`warning` 設為 `"POOL_COUNT_LOW"`。

### 5.2 GET /api/v1/assignment/list-definitions/:listNo/estimate

**Response — 200 OK**

```json
{
  "listNo": "OB202605001",
  "count": 8500
}
```

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
| BR-2 | 工作日計算排除週末與假日；資料來源為 AppDB `ob_calendar`（採 E04 + E05 雙層 ETL 從舊 OB DB 同步，詳見 [architecture-spec.md §E07-C](../architecture-spec.md#e07-c-etl-設計)），篩選條件 `WHERE rest_flg = '0' AND calendar_date BETWEEN :startDate AND :endDate` |
| BR-3 | 試算查詢逾時上限 10 秒，超過則回傳 `STAGE0_ESTIMATE_TIMEOUT` |
| BR-4 | Pool 筆數警示門檻可於環境變數 `STAGE0_POOL_WARN_THRESHOLD` 配置（預設 1000） |
| BR-5 | 當 `condition_payload` 解析結果無任何有效篩選條件（`buildStage1WhereConditions()` 回 `skipReason='EMPTY_CONDITIONS'`；含 `conditions=[]`、`_backfill_empty=true`、或所有條件均被 `caseyear='99'` wildcard / 無效值過濾後 fragment 數為 0 之情形）→ 試算 `count = 0`，與月跑 Stage 1「skip 該名單、不分派」行為一致（§18.5.2） |
| BR-6 | **估算為「條件符合上界」**：Stage 0 per-list 試算僅套用名單之「欄位篩選條件」（複用 `buildStage1WhereConditions()` 之欄位 `IN`/`BETWEEN` fragment），**不含**月跑 Stage 1 另外施加的後續過濾：(a) `list_period_start`~`list_period_end` × `list_interval` 推導之 `MONTH_CNT` 區間過濾；(b) 近 3 個月已派案去重（比對 `ob_pool_data_list` 之 `ASSIGNDAY`）；(c) 詐騙(白牌)/中結/滿期等特殊業務 `DELETE` 規則。因此試算值為「**符合名單欄位條件之案件數上界**」，實際分派數會更少 —— 與 BR-1「實際件數以月跑結果為準」一致。本規則經 SP `SP_INFOT_ASSIGNEXPORTNAMELIST_st1_list` 證實（SP 於 `#TargetCase` 撈案後另施加 `WHERE o.MONTH_CNT IN (@TmpTbl)`、近 3 月 `ASSIGNDAY` 去重 `DELETE`、及多段 `LIST_NM LIKE` 觸發之特殊 `DELETE`） |

## 7. 錯誤場景

| 場景 | 系統回應 | 參考 |
|---|---|---|
| `list_no` 不存在 | 404 `ASSIGNMENT_LIST_NOT_FOUND` | error-handling.md#assignment-errors |
| 試算查詢逾時 | 500 `STAGE0_ESTIMATE_TIMEOUT` | error-handling.md#assignment-errors |
| Pool 資料為空 | 200 `{ count: 0 }` | — |
| 名單無有效篩選條件（`skipReason='EMPTY_CONDITIONS'`） | 200 `{ count: 0 }`（與月跑 Stage 1 skip 該名單行為一致；見 BR-5） | — |

## 8. UI/UX 需求

### 8.1 試算頁本體

- 每日估算表：日期 / 星期 / 預估件數 + 底部總計
- 橘色警示列：Pool 筆數低於門檻時顯示
- 單一 LIST_NO 試算：清單列的「計算案件數量」按鈕觸發 Modal 或 inline 顯示結果
- 試算結果以粗體顯示：「符合條件案件數：N 筆」

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

- **Blocked By**：F048（名單定義清單）、E04 + E05 雙層 ETL（`ob_pool_data` / `ob_calendar` 資料來源，詳見 [architecture-spec.md §E07-C](../architecture-spec.md#e07-c-etl-設計)）
- **Blocks**：F061（觸發月跑前業務部長依此決定是否執行）

## 10. 交叉參考

- 資料模型：[data-model.md#e07-data-model](../data-model.md#e07-data-model)（`ob_pool_data`、`ob_list_definition`）；[data-model.md#ob-calendar-entity](../data-model.md#ob-calendar-entity)（工作日表，採 E04 + E05 雙層 ETL 同步）
- 錯誤處理：[error-handling.md#assignment-errors](../error-handling.md#assignment-errors)
- 流程圖：[diagrams/F049-stage0-estimate-flow.mmd](../diagrams/F049-stage0-estimate-flow.mmd)
- 架構決策：AD-E07-1（OB 資料遷移）、AD-E07-18（F050 v2.1 名單篩選 condition_payload / Stage 1 動態 SQL 演算法，§18.4~§18.6 為 AC-4 試算機制之權威來源）、E07 與 E04 依賴關係
- 篩選機制權威來源：[architecture-spec.md §18.5](../architecture-spec.md)（`buildStage1WhereConditions()` 演算法）、§18.4（`condition_payload` schema）、§18.6（路徑 B 欄位映射表）；試算須複用同一演算法，不另寫一套
- 相關功能：[F048](F048-view-list-definition.md)、[F061](F061-trigger-assignment-run.md)、[F050](F050-create-list-definition.md)（condition_payload source of truth）

## 11. 假設

| # | 假設 | 標記 |
|---|---|---|
| A-1 | ~~工作日/假日表由現有系統基礎資料或 `ob_calendar` 提供~~ **已解決（2026-05-04，2026-05-05 同步機制更新）**：採 `ob_calendar`（AppDB），透過 **E04 + E05 雙層 ETL** 從舊 OB DB `OBCALENDAR` 同步至 AppDB（E04 抓 raw → E05 Pipeline TargetLoad full replace）；詳見 [data-model.md#ob-calendar-entity](../data-model.md#ob-calendar-entity) 與 [architecture-spec.md §E07-C](../architecture-spec.md#e07-c-etl-設計)。對應 OQ-E07-10 / OQ-E07-15 已 Resolved。 | Resolved |
| A-2 | 每日分派比例係數為「`ob_pool_data` 總筆數 / 工作天數」等分 | [ASSUMPTION] |

## 12. Follow-up / Open Questions（v1.2.1 新增）

| OQ 編號 | 議題 | 現況決策 | 影響 / 建議 | 狀態 |
|---|---|---|---|---|
| OQ-E07-STAGE0-99 | `caseyear='99'`（不限年數）wildcard 之 `year_cnt` 語意與 ground-truth SP 不一致：composer 目前採「**完全跳過** `year_cnt` 條件」（架構決策 §18.5.1），而 SP `SP_INFOT_ASSIGNEXPORTNAMELIST_st1_list` 對 `'99'` 採 `o.YEAR_CNT >= 0 AND o.YEAR_CNT < 15`（即 0–14 封頂，排除 `year_cnt >= 15` 之案件） | **維持 §18.5.1 skip 決策不變更**。因 `'99'` 在原系統前端為**停用選項**（有效選項僅年數 0–10），名單實際不會帶入 `'99'`，屬理論邊界；兩種語意對 0–10 有效值之撈案結果相同，差異僅出現在 `year_cnt >= 15` 之案件是否納入 | 若未來開放 `'99'` 為有效選項，須由 system-architect 評估是否將 §18.5.1 改為對齊 SP 之 `0 <= year_cnt < 15` 封頂語意（同步影響月跑 Stage 1 與本試算）；本變更屬 architecture-spec.md §18.5.1 範疇，spec-writer 不於本文件逕自變更篩選行為 | Open（理論邊界，暫不處理） |
