---
type: test-design-feature
feature_id: F049
feature_name: Stage 0 每日分派數量估算（v1.3）
priority: P0-MVP
related_spec: /docs/specs/features/F049-stage0-daily-estimate.md
spec_version: "1.3"
covers:
  - F049
  - US-071
  - US-132
date: 2026-05-21
last_updated: 2026-05-26
---

# F049：Stage 0 每日分派數量估算（v1.3）— 測試設計

> **v1.3 測試設計追加（2026-05-26）**：新增「後端 `calculateDailyEstimate` 千分位 ratio + calendarSource 三模式」案例群組（TS-F049-CAL-001 ~ TS-F049-CAL-009）及「前端元件對齊 prototype」案例群組（TS-F049-V13F-001 ~ TS-F049-V13F-009）。後端群組驗證 Design A contract（total-agnostic、全日期回傳、SUM(ratioPerMille)=1000）；前端群組驗證自動選第一筆、calendarSource 切換重呼 API、無寫死 9500、bar `w-full`、跳過日灰 bar 等 prototype 對齊項。詳見 F049 v1.3 AC-1/AC-2/AC-3/AC-4-Default/§5.1/§8.1/§13。
>
> **v1.2 測試設計追加（2026-05-26）**：新增「後端 Stage 0 per-list 試算篩選邏輯」案例群組（TS-F049-EST-001 ~ TS-F049-EST-009），驗證 `estimateListCount` / `buildPoolCountQuery` 修正後行為 —— 改為複用月跑 Stage 1 之 `buildStage1WhereConditions()` 演算法，確保 `IN` 多值、欄位映射（caseyear → year_cnt、case_status → list_type）、wildcard、EMPTY_CONDITIONS 均正確，並保留原有 404 / 逾時 regression 驗證。詳見 F049 v1.2 AC-4 篩選機制對照表 / BR-5 / §7。
>
> **v1.1 測試設計範圍（2026-05-21）**：本文件覆蓋 F049 v1.1 核心變更 —— Ready 欄頂 CTA Banner 為 Stage 0 試算頁（secondary「試算」按鈕）之唯一入口（GAP-G3 / US-132）。
> v1.0 既有估算邏輯（GET API / 估算公式 / 試算逾時 / Pool 警示門檻）之業務邏輯不在 v1.1 變更範圍內；如需驗證業務邏輯，對應測試見既有 F049 後端 Unit / Integration test。
> 本文件新增 5 個 CTA Banner 入口場景，均為前端 Component 層測試。

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer（後端 v1.3） | 本文件 + `F049-stage0-daily-estimate.md` v1.3（§5.1 / §13）+ `reference/SP/Stage0_估算每日分派案件數量.sql`（ratio 演算法 ground truth）+ `error-handling.md#assignment-errors` |
| TDD Developer（前端 v1.3） | 本文件 + `F049-stage0-daily-estimate.md` v1.3（§4 AC-4-Default / §8.1）+ `prototypes/30-stage0-estimate.html`（UI ground truth）|
| TDD Developer（後端 v1.2） | 本文件 + `F049-stage0-daily-estimate.md` v1.2 + `stage1-query-composer.ts`（`buildStage1WhereConditions` 演算法）+ `error-handling.md#assignment-errors` |
| TDD Developer（前端 v1.1） | 本文件 + `F049-stage0-daily-estimate.md` v1.1 + `F061-trigger-assignment-run.md` v1.4（§9 CTA Banner spec）+ `F048-view-list-definition.md` v2.0 |
| QA / Tester | 本文件 + `error-handling.md#assignment-errors` |

---

## 測試策略概覽

| 項目 | 說明 |
|---|---|
| 主要測試層（前端 v1.3） | Component（RTL + MSW）；目標元件：`Stage0EstimatePage` / `Stage0InputPanel` / `Stage0BarChart` |
| 測試檔案（前端 v1.3） | `apps/web/src/pages/assignment/__tests__/stage0-estimate-page.test.tsx`（追加 v1.3 群組）+ `apps/web/src/pages/assignment/_components/__tests__/stage0-bar-chart.test.tsx` |
| 主要測試層（前端 v1.1） | 前端 Component（React Testing Library）；Stage 0 CTA Banner 渲染於 F048 Kanban 主頁的 Ready 欄頂 |
| 測試檔案（前端 v1.1） | `apps/web/src/pages/assignment/__tests__/list-kanban-page.test.tsx`（追加 CTA 群組）或獨立 `ready-cta-banner.test.tsx` |
| 主要測試層（後端） | 後端 Unit（SQLite in-memory + TypeORM + Vitest）；整合層（PostgreSQL TestContainer）|
| 測試檔案（後端） | `apps/api/src/modules/assignment-list/__tests__/stage0-estimate.service.spec.ts`（追加 CAL / EST 群組）|
| 關鍵依賴（前端 v1.3） | MSW stub `GET /api/v1/assignment/stage0/daily-estimate`（帶 `calendarSource` 參數）；MSW stub `GET /api/v1/assignment/list-definitions/:listNo/estimate` 回 per-list COUNT；MSW stub `GET /api/v1/assignment/lists` 回 active lists |
| 關鍵依賴（前端 v1.1） | MSW stub `GET /api/v1/assignment/lists` 回 `stageCounts.ready`；MSW stub assignment_run 狀態 |
| 關鍵依賴（後端） | `buildStage1WhereConditions()` 純函式（`stage1-query-composer.ts`）直接呼叫驗證輸出；`Stage0EstimateService.calculateDailyEstimate` 以 SQLite in-memory seed `ob_calendar` 驗證 |
| Mock 資料注意（前端 v1.3） | MSW stub 的 `dailyEstimates` 必須包含**所有日期**（含跳過日），`isWorkday` / `skipReason` / `ratioPerMille` 欄位均必填；`calendarSource` 驗證需檢查 MSW 攔截的 request URL query string |
| Mock 資料注意（後端） | `ob_calendar` seed 需含 `calendar_date`（date）+ `rest_flg`（'0'='工作日'，'1'='假日/週末'）；測試 `weekday-only` 模式需確認 SQLite EXTRACT(DOW) 行為（若與 PostgreSQL 語意不同，需用真實 PG TestContainer）|
| PostgreSQL 限制注意 | `weekday-only` 模式使用 `EXTRACT(DOW FROM calendar_date)` — SQLite 不支援此函式，**需 PostgreSQL TestContainer** 或純函式 mock；`all` 模式與 `weekday` 模式可 SQLite seed 覆蓋 |

### 後端案例群組自動化就緒度

| 群組 | 案例數 | 自動化適合度 | 測試層 | 說明 |
|---|---|---|---|---|
| TS-F049-CAL-001 | 1 | 高 | Unit | `weekday` 模式 SQLite seed；`rest_flg='0'` 計數；2026-05 = 20 工作日 |
| TS-F049-CAL-002 | 1 | 中（需 PG TestContainer）| Integration | `weekday-only` 模式需 `EXTRACT(DOW)` — SQLite 不支援 |
| TS-F049-CAL-003 | 1 | 高 | Unit | `all` 模式；SQLite seed 31 日，全部 isWorkday |
| TS-F049-CAL-004 | 1 | 高 | Unit | ratio 模型驗證：baseRatio / remainder / SUM=1000 / DESC 排序餘數補位置 |
| TS-F049-CAL-005 | 1 | 高 | Unit | 自訂 startDate/endDate + 預設整月 |
| TS-F049-CAL-006 | 1 | 高 | Unit | 全日期回傳（含跳過日）；skipReason 正確 |
| TS-F049-CAL-007 | 1 | 高 | Regression（Unit） | response 不含 total / dailyEstimates[].estimate — Design A 不倒退 |
| TS-F049-CAL-008 | 1 | 高 | Unit | poolCount + warning（poolCount < threshold）；與 ratio 計算獨立 |
| TS-F049-CAL-009 | 1 | 高 | Unit | workingDays=0 邊界：不除零；baseRatio=0/remainder=0 |
| TS-F049-EST-001~002 | 2 | 高 | Unit | `buildStage1WhereConditions` 純函式；無需 DB，直接驗證回傳 fragment |
| TS-F049-EST-003~006 | 4 | 高 | Unit | 同上；caseyear → year_cnt 映射、wildcard、EMPTY_CONDITIONS、case_status → list_type |
| TS-F049-EST-007 | 1 | 高 | Unit | numeric BETWEEN / date BETWEEN fragment 驗證 |
| TS-F049-EST-008 | 1 | 高 | Unit | 路徑 B legacy fallback；SQLite in-memory seed + COUNT 驗證 |
| TS-F049-EST-009 | 1 | 高 | Unit | 404 / timeout regression；現有測試架構延伸 |
| TS-F049-EST-010 | 1 | 低（需真實 DB）| Integration | 真實 ob_pool_data 比對 COUNT ≈ 241,978；CI 需 PostgreSQL TestContainer |

### 前端元件案例群組自動化就緒度（v1.3 新增）

| 群組 | 案例數 | 自動化適合度 | 測試層 | 說明 |
|---|---|---|---|---|
| TS-F049-V13F-001 | 1 | 高 | Component（RTL+MSW） | 自動選第一筆 active 名單；selector 無空選項 |
| TS-F049-V13F-002 | 1 | 高 | Regression（Component） | 無寫死 9500；MSW 回特定 COUNT 驗證 KPI 顯示 |
| TS-F049-V13F-003 | 1 | 高 | Component（RTL+MSW） | 切換 calendarSource → 重新呼叫 daily-estimate；Q2 regression guard |
| TS-F049-V13F-004 | 1 | 高 | Component（RTL+MSW） | 切換起訖日 → 重新呼叫 daily-estimate |
| TS-F049-V13F-005 | 1 | 高 | Component（RTL+MSW） | 切換 selector → total 換成新名單 COUNT，每日件數重算 |
| TS-F049-V13F-006 | 1 | 高 | Unit（純函式） | `computeAdE07Distribution` 前端件數計算正確：`round(ratioPerMille/1000×total)` |
| TS-F049-V13F-007 | 1 | 高 | Component（RTL） | bar chart：`w-full` 填滿欄（非 `w-6`）；跳過日渲染灰 bar；標籤順序件數在上 |
| TS-F049-V13F-008 | 1 | 高 | Component（RTL） | 表格 pill badge：工作日 / 非工作日 / 餘數補 badge 正確對應 |
| TS-F049-V13F-009 | 1 | 高 | Component（RTL+MSW） | 空狀態：無 active 名單 → selector disabled；KPI 顯示「—」；不渲染寫死值 |

---

## 一、Ready CTA Banner 入口測試

> **設計依據**：F049 v1.1 AC-Banner-Entry / F061 v1.4 §9 CTA Banner spec
> **入口說明**：Stage 0 試算頁（30-stage0-estimate）由 M01 Kanban 主頁 Ready 欄頂 CTA Banner 之 secondary「試算」按鈕觸發；Toolbar 不再渲染「Stage 0 試算」入口（US-132 GAP-G3 移除重複入口）。

---

### TS-F049-CTA-001：ready 欄有 ≥1 名單且非歷史月份 → 渲染 CTA Banner（含主按鈕與 secondary「試算」按鈕）

- **關聯需求**：F049 v1.1 AC-Banner-Entry / US-132 AC-1
- **測試類型**：Positive / Component（RTL）
- **前置條件**：
  - MSW stub `GET /api/v1/system/current-work-ym` → `{ currentWorkYm: '202605', isHistorical: false }`
  - MSW stub `GET /api/v1/assignment/lists?ym=202605` → `stageCounts: { ..., ready: 2 }`，且 `lists` 含 2 筆 `stage='ready'` 名單
  - MSW stub assignment_run → `{ status: 'idle' }`（無執行中月跑）
- **步驟**：
  1. render `<ListKanbanPage />`（或對應 Kanban 元件）
  2. 等待渲染完成
  3. 驗證 Ready 欄頂 CTA Banner
- **預期結果**：
  - Ready 欄頂存在 CTA Banner 元素
  - Banner 含主按鈕（觸發月跑，文字如「執行月跑」）
  - Banner 含 secondary「試算」按鈕（白底藍邊，含 calculator icon 或對應 class）
  - 兩個按鈕均非 disabled 狀態

---

### TS-F049-CTA-002：ready=0 → CTA Banner 完全不渲染（DOM 不存在，非 display:none）

- **關聯需求**：F049 v1.1 §8（渲染條件：ready ≥1 才顯示）/ US-132 AC-2
- **測試類型**：Negative / Component（RTL）
- **前置條件**：MSW stub 回 `stageCounts: { ..., ready: 0 }`；`lists` 無 `stage='ready'` 項目
- **步驟**：
  1. render `<ListKanbanPage />`
  2. 驗證 Ready 欄頂
- **預期結果**：
  - CTA Banner DOM **完全不存在**（`document.querySelector('[data-testid="ready-cta-banner"]') === null`）
  - 不可僅是 `display: none` 或 `visibility: hidden`

---

### TS-F049-CTA-003：歷史月份 → CTA Banner 完全不渲染

- **關聯需求**：F049 v1.1 §8（渲染條件：非歷史月份）/ F077 v1.3 BR-7 C-1
- **測試類型**：Negative / Component（RTL）
- **前置條件**：
  - MSW stub 回歷史月份資料（`isHistorical: true`、`selectedYm: '202504'`）
  - `stageCounts.ready = 3`（有 ready 名單，但因歷史月份不渲染 Banner）
- **步驟**：
  1. render `<ListKanbanPage />` 並切換至歷史月份
  2. 驗證 Ready 欄頂
- **預期結果**：
  - CTA Banner DOM **完全不存在**（`=== null`）
  - 頁面頂部顯示「歷史月份資料為唯讀」紅色橫幅

---

### TS-F049-CTA-004：月跑執行中 → Banner 改琥珀色 disabled；主按鈕與 secondary 按鈕均 disabled

- **關聯需求**：F049 v1.1 §8（月跑鎖中 Banner disabled）/ F048 v2.0 AC-4 / F077 v1.3 BR-7 C-2
- **測試類型**：Positive / Component（RTL）
- **前置條件**：
  - MSW stub `stageCounts.ready = 2`（Banner 應渲染）
  - MSW stub assignment_run → `{ status: 'running' }`（月跑執行中）
- **步驟**：
  1. render `<ListKanbanPage />` 呈現月跑執行中狀態
  2. 驗證 Ready 欄頂 CTA Banner
- **預期結果**：
  - Banner 元素存在（DOM 存在，月跑鎖不移除 Banner，改 disabled 樣式）
  - 主按鈕 disabled（`toBeDisabled()`）
  - secondary「試算」按鈕 disabled（`toBeDisabled()`）
  - Banner 呈現琥珀色 disabled 樣式（有對應 CSS class 或 aria-disabled）

---

### TS-F049-CTA-005：secondary「試算」按鈕點擊 → 導向 Stage 0 試算頁

- **關聯需求**：F049 v1.1 AC-Banner-Entry / US-132 AC-3
- **測試類型**：Positive / Component（RTL）
- **前置條件**：`stageCounts.ready ≥ 1`；非歷史月份；無月跑鎖
- **步驟**：
  1. render `<ListKanbanPage />`
  2. 點擊 secondary「試算」按鈕
  3. 驗證路由跳轉
- **預期結果**：
  - 路由跳轉至 Stage 0 估算頁（路由路徑含 `stage0-estimate` 或對應路由名稱，對齊 prototype `30-stage0-estimate.html`）
  - 跳轉**不**觸發 sessionStorage `cdmp.pendingToast` 寫入（非子頁工作流完成跳回，屬不適用情境）

---

## 自動化就緒度

| 場景群組 | 自動化適合度 | 說明 |
|---|---|---|
| TS-F049-CTA-001~005（CTA Banner 入口） | 高 | RTL + MSW stub；純前端渲染邏輯，無需真實 DB |
| TS-F049-CAL-001（weekday 模式 SQLite）| 高 | SQLite in-memory seed ob_calendar；不依賴 PG 函式 |
| TS-F049-CAL-002（weekday-only 模式）| 中 | 需 PG TestContainer（`EXTRACT(DOW)` 語意）或純函式單元測試替代 |
| TS-F049-CAL-003~009（all 模式 + ratio + 邊界）| 高 | SQLite in-memory 或純函式；無外部依賴 |
| TS-F049-V13F-001~009（前端 v1.3 元件）| 高 | RTL + MSW stub；純前端邏輯；`computeAdE07Distribution` 可純函式測試 |
| TS-F049-EST-001~009（後端試算篩選邏輯 Unit） | 高 | `buildStage1WhereConditions` 純函式 + SQLite in-memory；無外部依賴 |
| TS-F049-EST-010（整合層 COUNT 驗證） | 低 | 需 PostgreSQL + 真實 ob_pool_data seed；僅 CI 環境可行 |

---

## 二、後端 Stage 0 per-list 試算篩選邏輯

> **設計依據**：F049 v1.2 AC-4 篩選機制對照表 / BR-5 / §7「名單無有效篩選條件」
> **修正背景**：v1.2 之前 `buildPoolCountQuery` 以 `=` 比對多值欄位（如 `prod_kind='01$$N'`）且欄位映射錯誤（`caseyear` 查的是 4 位數西元年欄位而非 `year_cnt`），導致 4 個 ready 名單估算全為 0。修法：`estimateListCount` 改為呼叫 `buildStage1WhereConditions(def)`，複用月跑 Stage 1 演算法。
> **測試策略**：
> - TS-F049-EST-001 ~ TS-F049-EST-007：直接呼叫 `buildStage1WhereConditions()` 純函式，驗證回傳的 `where` / `params` / `skipReason`（不需 DB）。
> - TS-F049-EST-008：以 SQLite in-memory 驗證路徑 B legacy fallback 的 `$$` split + COUNT 行為。
> - TS-F049-EST-009：驗證 404 / timeout regression（現有測試架構延伸）。
> - TS-F049-EST-010：Integration 層，需真實 PostgreSQL + ob_pool_data seed。

---

### TS-F049-EST-001：路徑 A — categorical 多值產生 IN（regression guard：舊行為 `=` 多值回 0）

- **關聯需求**：F049 v1.2 AC-4 篩選機制對照表（路徑 A categorical → `IN (...)`）
- **測試類型**：Regression / Unit
- **測試層**：Unit（`buildStage1WhereConditions` 純函式，無需 DB）
- **前置條件**：
  - 準備 `ObListDefinition` mock 物件，`condition_payload.conditions` 含兩個 categorical 條件：
    - `{ fieldType: 'categorical', columnName: 'prod_kind', values: ['01'] }`
    - `{ fieldType: 'categorical', columnName: 'settle_src', values: ['N'] }`
  - `condition_payload` 非 null（走路徑 A）
- **步驟**：
  1. 直接呼叫 `buildStage1WhereConditions(mockDef)` 取得 `fragment`
  2. 驗證 `fragment.skipReason` 為 `null`
  3. 驗證 `fragment.where` 包含 `"prod_kind" IN (:...cat0)` 子字串（或等效 `:...` 參數化形式）
  4. 驗證 `fragment.where` 包含 `"settle_src" IN (:...cat1)` 子字串
  5. 驗證 `fragment.params` 中對應參數值陣列含 `'01'` / `'N'`（非字串 `'01$$N'`）
  6. **Regression 驗證**：確認 `fragment.where` **不包含** `=` 單值比對符號（`prod_kind = :` 形式），即舊版 `=` 行為已消除
- **預期結果**：
  - `skipReason === null`
  - `where` 含 `IN (:...` 形式（非 `=`）
  - params 陣列各自獨立（`['01']` / `['N']`），確認多值正確傳入

---

### TS-F049-EST-002：路徑 A — caseyear values → year_cnt 整數映射（不查 ob_pool_data.caseyear 西元年欄位）

- **關聯需求**：F049 v1.2 AC-4 欄位映射表（`caseyear` → `ob_pool_data.year_cnt` 整數比對）
- **測試類型**：Regression / Unit
- **測試層**：Unit（純函式）
- **前置條件**：
  - `condition_payload.conditions` 含單一 categorical 條件：
    - `{ fieldType: 'categorical', columnName: 'caseyear', values: ['0','1','2','3','4','5'] }`
  - `condition_payload` 非 null（路徑 A）
- **步驟**：
  1. 呼叫 `buildStage1WhereConditions(mockDef)` 取得 `fragment`
  2. 驗證 `fragment.where` 包含 `"year_cnt" IN (` 子字串
  3. 驗證 `fragment.where` **不包含** `"caseyear" IN (` 或 `"ob_pool_data.caseyear"` 子字串（防止查到西元年欄位）
  4. 驗證 `fragment.params` 對應鍵的值為整數陣列 `[0, 1, 2, 3, 4, 5]`（非字串 `['0','1','2','3','4','5']`）
- **預期結果**：
  - `where` 中欄位名稱為 `year_cnt`，而非 `caseyear`
  - params 陣列為整數型別（`typeof v === 'number'`）

---

### TS-F049-EST-003：路徑 A — case_status values → list_type 映射

- **關聯需求**：F049 v1.2 AC-4 欄位映射表（`case_status` → `ob_pool_data.list_type`）
- **測試類型**：Positive / Unit
- **測試層**：Unit（純函式）
- **前置條件**：
  - `condition_payload.conditions` 含：
    - `{ fieldType: 'categorical', columnName: 'case_status', values: ['02'] }`
- **步驟**：
  1. 呼叫 `buildStage1WhereConditions(mockDef)`
  2. 驗證 `fragment.where` 包含 `"list_type" IN (` 子字串
  3. 驗證 `fragment.where` **不包含** `"case_status" IN (` 子字串（ob_pool_data 無 case_status 欄位）
  4. 驗證 params 對應陣列含 `'02'`
- **預期結果**：
  - WHERE 子句以 `list_type` 篩選，而非 `case_status`

---

### TS-F049-EST-004：路徑 A — caseyear='99' wildcard → 跳過 year_cnt fragment；其他條件仍生效

- **關聯需求**：F049 v1.2 AC-4 `caseyear='99'` wildcard 規則（§18.5.1）
- **測試類型**：Positive / Unit（含邊界子場景）
- **測試層**：Unit（純函式）

**子場景 4a：caseyear 唯一條件為 '99' → skipReason='EMPTY_CONDITIONS'（整個 list skip）**

- **前置條件**：
  - `condition_payload.conditions = [{ fieldType: 'categorical', columnName: 'caseyear', values: ['99'] }]`
- **步驟**：
  1. 呼叫 `buildStage1WhereConditions(mockDef)`
  2. 驗證 `fragment.skipReason === 'EMPTY_CONDITIONS'`（wildcard skip 後 fragment 數為 0）
  3. 驗證 `fragment.where === null`
- **預期結果**：
  - skipReason 為 `'EMPTY_CONDITIONS'`；無任何 WHERE 子句

**子場景 4b：caseyear='99' 與其他條件並存 → caseyear fragment 跳過，其他條件仍生效**

- **前置條件**：
  - `condition_payload.conditions = [`
    - `{ fieldType: 'categorical', columnName: 'caseyear', values: ['99'] },`
    - `{ fieldType: 'categorical', columnName: 'prod_kind', values: ['01'] }`
  - `]`
- **步驟**：
  1. 呼叫 `buildStage1WhereConditions(mockDef)`
  2. 驗證 `fragment.skipReason === null`（有其他有效 fragment）
  3. 驗證 `fragment.where` **不包含** `year_cnt`
  4. 驗證 `fragment.where` 包含 `"prod_kind" IN (`
- **預期結果**：
  - `year_cnt` 條件不存在；`prod_kind` 條件仍生效

---

### TS-F049-EST-005：路徑 A — EMPTY_CONDITIONS → skipReason='EMPTY_CONDITIONS'（BR-5）

- **關聯需求**：F049 v1.2 §6 BR-5；AC-4「無有效條件時 count=0」；§7 錯誤場景「名單無有效篩選條件」
- **測試類型**：Negative / Unit（三個子場景）
- **測試層**：Unit（純函式 + Service mock）

**子場景 5a：conditions=[]（空陣列）**

- **前置條件**：`condition_payload = { conditions: [] }`
- **步驟**：呼叫 `buildStage1WhereConditions(mockDef)`
- **預期結果**：`skipReason === 'EMPTY_CONDITIONS'`、`where === null`

**子場景 5b：`_backfill_empty: true`（回填空名單）**

- **前置條件**：`condition_payload = { conditions: [], _backfill_empty: true }`
- **步驟**：呼叫 `buildStage1WhereConditions(mockDef)`
- **預期結果**：`skipReason === 'EMPTY_CONDITIONS'`、`where === null`

**子場景 5c：Service 層 — skipReason='EMPTY_CONDITIONS' 時 estimateListCount 回傳 count=0**

- **前置條件**：
  - SQLite in-memory seed 一筆 active list，`condition_payload = { conditions: [] }`
  - ob_pool_data 有 5 筆資料
- **步驟**：
  1. 呼叫 `estimateListCount(listNo)`
  2. 驗證回傳 `{ listNo, count: 0 }`（不是 5）
- **預期結果**：
  - `count === 0`（與月跑 Stage 1 skip 該名單行為一致）
  - HTTP 200（非錯誤，spec §7）

---

### TS-F049-EST-006：路徑 A — numeric 條件產生 BETWEEN；date 條件產生 BETWEEN

- **關聯需求**：F049 v1.2 AC-4 `numeric` → `BETWEEN`；`date` → `BETWEEN`
- **測試類型**：Positive / Unit
- **測試層**：Unit（純函式）

**子場景 6a：numeric BETWEEN**

- **前置條件**：
  - `condition_payload.conditions = [{ fieldType: 'numeric', columnName: 'month_cnt', min: 12, max: 60 }]`
- **步驟**：呼叫 `buildStage1WhereConditions(mockDef)`
- **預期結果**：
  - `fragment.where` 包含 `"month_cnt" BETWEEN :numMin0 AND :numMax0`
  - `params.numMin0 === 12`；`params.numMax0 === 60`
  - `skipReason === null`

**子場景 6b：date BETWEEN**

- **前置條件**：
  - `condition_payload.conditions = [{ fieldType: 'date', columnName: 'appl_date', dateStart: '2025-01-01', dateEnd: '2025-12-31' }]`
- **步驟**：呼叫 `buildStage1WhereConditions(mockDef)`
- **預期結果**：
  - `fragment.where` 包含 `"appl_date" BETWEEN :dateStart0 AND :dateEnd0`
  - `params.dateStart0 === '2025-01-01'`；`params.dateEnd0 === '2025-12-31'`
  - `skipReason === null`

**子場景 6c：numeric 缺 max → skip fragment + warning（非 throw）**

- **前置條件**：`{ fieldType: 'numeric', columnName: 'month_cnt', min: 12 }`（無 max）
- **步驟**：呼叫 `buildStage1WhereConditions(mockDef)`
- **預期結果**：
  - `skipReason === 'EMPTY_CONDITIONS'`（唯一 fragment 被 skip）
  - `warnings` 含 `{ code: 'INCOMPLETE_NUMERIC_RANGE', columnName: 'month_cnt' }`
  - **不 throw**（防禦性處理，skip 而非拋錯）

---

### TS-F049-EST-007：路徑 B（legacy fallback，condition_payload IS NULL）— `$$` split → IN；空欄位跳過

- **關聯需求**：F049 v1.2 AC-4 路徑 B（`condition_payload IS NULL`）；§18.5 路徑 B backward-compat 5 欄位
- **測試類型**：Positive / Unit
- **測試層**：Unit（純函式，直接組裝 `ObListDefinition` mock 物件）

**子場景 7a：多值 `$$` 分隔 → IN（regression guard：舊 `=` 行為消除）**

- **前置條件**：
  - `condition_payload = null`（路徑 B）
  - entity 欄位：`prod_kind = '01$$N'`；`settle_src = 'Y'`；其餘欄位 null 或空字串
- **步驟**：
  1. 呼叫 `buildStage1WhereConditions(mockDef)`
  2. 驗證 `where` 包含 `"prod_kind" IN (`
  3. 驗證 params 中 prod_kind 陣列含 `'01'` 與 `'N'`（split 後各自獨立）
  4. 驗證 `where` 包含 `"settle_src" IN (`
  5. 驗證 `where` **不含** `=` 單值比對（regression guard）
- **預期結果**：
  - `prod_kind IN ('01', 'N')`；`settle_src IN ('Y')`

**子場景 7b：路徑 B caseyear 整數映射 + wildcard**

- **前置條件**：`condition_payload = null`；`caseyear = '0$$1$$2'`；其餘 null
- **步驟**：呼叫 `buildStage1WhereConditions(mockDef)`
- **預期結果**：
  - `where` 含 `"year_cnt" IN (`；params 陣列為整數 `[0, 1, 2]`
  - **不含** `"caseyear" IN (` 或 `"ob_pool_data.caseyear"`

**子場景 7c：路徑 B caseyear 含 '99' wildcard → 跳過 year_cnt fragment**

- **前置條件**：`condition_payload = null`；`caseyear = '99'`；`prod_kind = '01'`
- **步驟**：呼叫 `buildStage1WhereConditions(mockDef)`
- **預期結果**：
  - `where` **不含** `year_cnt`；`where` 含 `"prod_kind" IN (`

**子場景 7d：路徑 B 空欄位跳過（全欄位空 → EMPTY_CONDITIONS）**

- **前置條件**：`condition_payload = null`；所有 5 個 entity column 均為 null 或空字串
- **步驟**：呼叫 `buildStage1WhereConditions(mockDef)`
- **預期結果**：
  - `skipReason === 'EMPTY_CONDITIONS'`；`where === null`

---

### TS-F049-EST-008：SAFE_COLUMN_NAME_RE 防注入 — 不符合 regex 的欄位名稱 skip 並記錄 warning（不 throw）

- **關聯需求**：F049 v1.2 AC-4 防注入規則（§18.5 `SAFE_COLUMN_NAME_RE`）
- **測試類型**：Negative / Unit
- **測試層**：Unit（純函式）
- **前置條件**：
  - `condition_payload.conditions = [`
    - `{ fieldType: 'categorical', columnName: '"; DROP TABLE ob_pool_data; --', values: ['01'] },`（注入嘗試）
    - `{ fieldType: 'categorical', columnName: 'prod_kind', values: ['01'] }`（合法欄位）
  - `]`
- **步驟**：
  1. 呼叫 `buildStage1WhereConditions(mockDef)`
  2. 驗證 `fragment.where` 不包含 `DROP TABLE` 或任何 SQL 特殊字元片段
  3. 驗證 `fragment.where` 仍包含 `"prod_kind" IN (`（合法欄位正常處理）
  4. 驗證 `fragment.warnings` 含 `{ code: 'INVALID_COLUMN_NAME' }` 一筆
  5. 驗證整個呼叫**不 throw**
- **預期結果**：
  - 不合法欄位被 skip，僅留 prod_kind fragment
  - `warnings.length === 1`；`code === 'INVALID_COLUMN_NAME'`

---

### TS-F049-EST-009：既有行為 Regression — list_no 不存在 / inactive → 404；逾時 → 500（不可因 v1.2 修改而破壞）

- **關聯需求**：F049 v1.2 §5.2 API 錯誤回應；§7 錯誤場景；AC-5 逾時保護
- **測試類型**：Regression / Unit
- **測試層**：Unit（SQLite in-memory + `Stage0EstimateService`）

**子場景 9a：list_no 不存在 → 404 ASSIGNMENT_LIST_NOT_FOUND**

- **前置條件**：ob_list_definition 表無對應資料
- **步驟**：呼叫 `estimateListCount('OB000000NIL')`
- **預期結果**：拋 `NotFoundException`；`response.error === 'ASSIGNMENT_LIST_NOT_FOUND'`

**子場景 9b：list_no 為 inactive → 404 ASSIGNMENT_LIST_NOT_FOUND**

- **前置條件**：seed 一筆 list_no='OB202605999'，`status='inactive'`
- **步驟**：呼叫 `estimateListCount('OB202605999')`
- **預期結果**：拋 `NotFoundException`；`response.error === 'ASSIGNMENT_LIST_NOT_FOUND'`

**子場景 9c：timeoutMs=0 → 500 STAGE0_ESTIMATE_TIMEOUT**

- **前置條件**：seed 一筆 active list
- **步驟**：呼叫 `estimateListCount(listNo, { timeoutMs: 0 })`
- **預期結果**：拋 `InternalServerErrorException`；`response.error === 'STAGE0_ESTIMATE_TIMEOUT'`

---

### TS-F049-EST-010：Integration — 真實 ob_pool_data COUNT 與 Stage 1 月跑結果一致（OB202605004 基準）

- **關聯需求**：F049 v1.2 AC-4「試算之 WHERE 子句直接複用 Stage 1 演算法，確保 estimate 與實際月跑 Stage 1 逐欄位一致」
- **測試類型**：Positive / Integration
- **測試層**：Integration（PostgreSQL TestContainer；需真實 ob_pool_data seed）
- **自動化就緒度**：低（需 CI PostgreSQL）；建議在 E2E 或特定 integration suite 中執行
- **前置條件**：
  - PostgreSQL TestContainer 已啟動
  - ob_list_definition 含一筆名單 `list_no='OB202605004'`，`status='active'`
  - `condition_payload.conditions` 含：
    - `{ fieldType: 'categorical', columnName: 'prod_kind', values: ['01'] }`
    - `{ fieldType: 'categorical', columnName: 'case_status', values: ['02'] }`（映射為 list_type）
    - `{ fieldType: 'categorical', columnName: 'caseyear', values: ['0','1','2','3','4','5'] }`（映射為 year_cnt IN (0~5)）
    - `{ fieldType: 'categorical', columnName: 'settle_src', values: ['N'] }`
    - `{ fieldType: 'categorical', columnName: 'spec_tp', values: ['A','B','C', ...] }`（多值）
  - ob_pool_data 已載入對應 202605 月份資料（E04 + E05 ETL seed）
- **步驟**：
  1. 呼叫 `estimateListCount('OB202605004')`，記錄 `estimateCount`
  2. 獨立執行 Stage 1 月跑 pipeline 對同一名單，取得實際 `stage1Count`
  3. 比較兩個數值
- **預期結果**：
  - `estimateCount === stage1Count`（允許±0，確保試算與月跑完全一致）
  - 預期 `estimateCount ≈ 241,978`（以真實 ob_pool_data 資料為基準）
  - `estimateCount` **不為 0**（regression guard：舊版實作全為 0 的缺陷已修正）
- **備註**：本案例主要驗證篩選演算法一致性；若 ob_pool_data 資料量不同，COUNT 數字可能略有差異，但必須非 0 且與 Stage 1 一致。CI 環境需確保 PostgreSQL 版本與 prod 一致（避免 BETWEEN 語意差異）。

---

## 三、後端 `calculateDailyEstimate` 千分位 ratio + calendarSource（v1.3 新增）

> **設計依據**：F049 v1.3 AC-1 / AC-2 / AC-3 / §5.1 Design A contract / §13 千分位 ratio 演算法 / §8.1 UI 對齊清單
> **修正背景**：現行 `calculateDailyEstimate(ym)` 僅收 `ym`、固定 `rest_flg='0'`、不回傳 `ratioPerMille`、以舊版「平均件數」計算、且 `dailyEstimates[]` 僅含工作日（無跳過日）。v1.3 將 API 改為 total-agnostic（Design A）：新增 `calendarSource` / `startDate` / `endDate` 三個 query 參數；回傳含所有日期之 `ratioPerMille`；千分位 ratio 演算法溯源自原系統 SP。
> **測試策略**：
> - TS-F049-CAL-001 / 003 / 004~009：`ob_calendar` SQLite in-memory seed，直接呼叫 `Stage0EstimateService.calculateDailyEstimate`（或其重構後函式），驗證回傳 shape。
> - TS-F049-CAL-002：`weekday-only` 模式使用 `EXTRACT(DOW)`，**需 PostgreSQL TestContainer** 或將工作日判斷邏輯抽為純函式後 Unit 測試。
> - TS-F049-CAL-007（Design A regression guard）：可純函式層驗證 response 不含 `total` / `estimate` 欄位。

---

### TS-F049-CAL-001：calendarSource='weekday' → 僅計 rest_flg='0' 工作日；2026-05 = 20 工作日

- **關聯需求**：F049 v1.3 §5.1 `calendarSource` 對應表（`weekday` = `rest_flg = '0'`）；AC-1 workingDays
- **測試類型**：Positive / Unit
- **測試層**：Unit（SQLite in-memory seed `ob_calendar`；`Stage0EstimateService.calculateDailyEstimate` 或重構後等效函式）
- **前置條件**：
  - SQLite in-memory seed `ob_calendar` 含 2026-05-01 ~ 2026-05-31（31 筆）
  - 其中 20 筆 `rest_flg='0'`（5/4 一 ~ 5/29 五 等工作日；5/1 勞動節 `rest_flg='1'`、週六日 `rest_flg='1'`）
  - 呼叫 `calculateDailyEstimate('202605', { calendarSource: 'weekday' })`
- **步驟**：
  1. 呼叫目標函式，取得 response
  2. 驗證 `response.workingDays === 20`
  3. 驗證 `response.calendarSource === 'weekday'`
  4. 驗證 `response.dailyEstimates` 長度 = 31（含所有日期）
  5. 驗證所有 `rest_flg='1'` 日期對應的 `isWorkday === false`
  6. 驗證所有 `rest_flg='0'` 日期對應的 `isWorkday === true`
- **預期結果**：
  - `workingDays === 20`
  - `dailyEstimates.filter(d => d.isWorkday).length === 20`
  - `dailyEstimates.filter(d => !d.isWorkday).length === 11`（5/1 假日 + 週六日 10 天）
- **DB 需求**：SQLite in-memory 可覆蓋（`rest_flg` 比對不依賴 PG 特有函式）

---

### TS-F049-CAL-002：calendarSource='weekday-only' → 排除週末但含假日；2026-05 = 21 工作日

- **關聯需求**：F049 v1.3 §5.1（`weekday-only` = `EXTRACT(DOW) NOT IN (0,6)`）；BR-2
- **測試類型**：Positive / Integration（需確認 `EXTRACT(DOW)` 語意）
- **測試層**：Integration（PostgreSQL TestContainer 驗證 `EXTRACT(DOW)` 語意正確；若工作日判斷抽為純函式則可降至 Unit）
- **前置條件**：
  - PostgreSQL TestContainer 已啟動（或純函式 mock 含 DOW 計算邏輯）
  - `ob_calendar` 含 2026-05-01 ~ 2026-05-31（31 筆）
  - 2026-05-01（星期五）`rest_flg='1'`（勞動節假日）
  - 呼叫 `calculateDailyEstimate('202605', { calendarSource: 'weekday-only' })`
- **步驟**：
  1. 呼叫目標函式，取得 response
  2. 驗證 `response.workingDays === 21`（5/1 勞動節雖 rest_flg='1' 但週五 → weekday-only 視為工作日）
  3. 驗證 2026-05-01 對應 `dailyEstimates` 項目之 `isWorkday === true`（週五不排除）
  4. 驗證 2026-05-02（週六）對應項目 `isWorkday === false`、`skipReason === '週末'`
  5. 驗證 2026-05-03（週日）對應項目 `isWorkday === false`、`skipReason === '週末'`
- **預期結果**：
  - `workingDays === 21`（31 日 - 10 個週六日 = 21，假日不減）
  - 週末 skipReason='週末'；假日 workday=true（skipReason=null）
- **DB 需求**：需 PostgreSQL TestContainer（`EXTRACT(DOW)` 行為需與 prod 一致）；建議同時標記為 CI 環境限定

---

### TS-F049-CAL-003：calendarSource='all' → 全部 31 日皆 isWorkday；workingDays=31

- **關聯需求**：F049 v1.3 §5.1（`all` = 不排除，週末與假日均視為工作日）
- **測試類型**：Positive / Unit
- **測試層**：Unit（SQLite in-memory 或純函式）
- **前置條件**：
  - SQLite in-memory seed `ob_calendar` 2026-05-01 ~ 2026-05-31（31 筆）
  - 各筆 `rest_flg` 值不同（部分 '0' / 部分 '1'）
  - 呼叫 `calculateDailyEstimate('202605', { calendarSource: 'all' })`
- **步驟**：
  1. 呼叫目標函式，取得 response
  2. 驗證 `response.workingDays === 31`
  3. 驗證 `response.dailyEstimates` 長度 = 31
  4. 驗證 `dailyEstimates.every(d => d.isWorkday === true)`
  5. 驗證 `dailyEstimates.every(d => d.skipReason === null)`
  6. 驗證 `dailyEstimates.every(d => d.ratioPerMille > 0)`
- **預期結果**：
  - 全部 31 筆 `isWorkday=true`；無任何 skipReason
  - `SUM(ratioPerMille) === 1000`
- **DB 需求**：SQLite 可覆蓋（不依賴 `rest_flg` / DOW 函式）

---

### TS-F049-CAL-004：千分位 ratio 模型驗證 — baseRatio / remainder / SUM=1000 / 餘數補落在 DESC 前 remainder 個工作日

- **關聯需求**：F049 v1.3 §13（AD-E07-8 千分位 ratio 演算法）；§5.1 response 欄位 `baseRatio` / `remainder` / `ratioPerMille`；SP ground truth `Stage0_估算每日分派案件數量.sql`（`SEQ <= 1000 % @WORKDAYS`、`ORDER BY CALENDAR_DATE DESC`）
- **測試類型**：Positive / Unit
- **測試層**：Unit（SQLite in-memory seed；純函式計算驗證）
- **前置條件**：
  - SQLite seed `ob_calendar` 2026-05（20 工作日，`calendarSource='weekday'`）
  - 呼叫 `calculateDailyEstimate('202605', { calendarSource: 'weekday' })`
- **步驟**：
  1. 驗證 `response.baseRatio === FLOOR(1000 / 20) === 50`
  2. 驗證 `response.remainder === 1000 mod 20 === 0`
  3. 由於 remainder=0，驗證**所有工作日** `ratioPerMille === 50`（無 base+1）
  4. 驗證 `SUM(dailyEstimates[].ratioPerMille) === 1000`（所有日期含非工作日）
  5. 驗證非工作日 `ratioPerMille === 0`

  **子場景 4b（有餘數補）：21 工作日（weekday-only 模式）**
  - SQLite seed 21 個工作日（或 PG TestContainer）
  - `baseRatio = FLOOR(1000/21) = 47`；`remainder = 1000 mod 21 = 13`
  - 驗證 `response.baseRatio === 47`；`response.remainder === 13`
  - 驗證按 `calendar_date DESC` 排序，**前 13 個工作日** `ratioPerMille === 48`
  - 驗證其餘 8 個工作日 `ratioPerMille === 47`
  - 驗證 `SUM(工作日 ratioPerMille) === 13×48 + 8×47 = 624 + 376 = 1000` ✓
  - **SP 對應驗證**：前 remainder 個 = `SEQ <= (1000 % @WORKDAYS)` 其中 `SEQ = ROW_NUMBER() OVER(ORDER BY CALENDAR_DATE DESC)`，即最近日期 SEQ 最小 = 最先補到 +1，與 SP 行為一致
- **預期結果**：
  - 子場景 4a：`baseRatio=50`，`remainder=0`，全工作日 ratio=50，SUM=1000
  - 子場景 4b：`baseRatio=47`，`remainder=13`，最後 13 個（月末）工作日 ratio=48，SUM=1000
- **DB 需求**：子場景 4a 可 SQLite；子場景 4b 若需 `EXTRACT(DOW)` 則需 PG TestContainer

---

### TS-F049-CAL-005：自訂 startDate/endDate（非整月）正確；預設整月（依 ym）

- **關聯需求**：F049 v1.3 §5.1 query 參數 `startDate` / `endDate`（選填，預設整月）；AC-1
- **測試類型**：Positive / Unit（兩個子場景）
- **測試層**：Unit（SQLite in-memory）

**子場景 5a：自訂 startDate='2026-05-11' / endDate='2026-05-22'（中旬 12 天）**

- **前置條件**：
  - SQLite seed `ob_calendar` 2026-05-01 ~ 2026-05-31（全月）
  - 呼叫 `calculateDailyEstimate('202605', { calendarSource: 'weekday', startDate: '2026-05-11', endDate: '2026-05-22' })`
- **步驟**：
  1. 驗證 `response.startDate === '2026-05-11'`
  2. 驗證 `response.endDate === '2026-05-22'`
  3. 驗證 `response.dailyEstimates.length === 12`（5/11 ~ 5/22 共 12 日）
  4. 驗證 `dailyEstimates` 中**不含** 5/10 或 5/23 以外日期
  5. 驗證 `workingDays` = 5/11~5/22 範圍內 rest_flg='0' 天數（預期 = 8 天：5/11 一 ~ 5/15 五 + 5/18 一 ~ 5/22 五）
- **預期結果**：dailyEstimates 僅含指定區間 12 筆；workingDays 正確

**子場景 5b：不帶 startDate/endDate → 預設整月（ym='202605'）**

- **前置條件**：呼叫 `calculateDailyEstimate('202605', { calendarSource: 'weekday' })`（無 startDate/endDate）
- **步驟**：
  1. 驗證 `response.startDate === '2026-05-01'`
  2. 驗證 `response.endDate === '2026-05-31'`
  3. 驗證 `response.dailyEstimates.length === 31`
- **預期結果**：自動推導整月範圍

---

### TS-F049-CAL-006：dailyEstimates 含所有日期（含跳過日）— skipReason / isWorkday / ratioPerMille=0 正確

- **關聯需求**：F049 v1.3 AC-1（「顯示估算範圍內所有日期之列，非僅工作日」）；§5.1 response `dailyEstimates[].skipReason` / `isWorkday` / `ratioPerMille`
- **測試類型**：Positive / Unit
- **測試層**：Unit（SQLite in-memory seed；`calendarSource='weekday'`）
- **前置條件**：
  - SQLite seed 含以下三筆具代表性的日期：
    - 2026-05-01（星期五，`rest_flg='1'`，勞動節假日）
    - 2026-05-02（星期六，`rest_flg='1'`，週末）
    - 2026-05-04（星期一，`rest_flg='0'`，工作日）
  - 呼叫 `calculateDailyEstimate('202605', { calendarSource: 'weekday' })`
- **步驟**：
  1. 驗證 response.dailyEstimates 包含 2026-05-01
  2. 驗證 2026-05-01 項目：`isWorkday === false`、`skipReason === '國定假日'`、`ratioPerMille === 0`
  3. 驗證 2026-05-02 項目：`isWorkday === false`、`skipReason === '週末'`、`ratioPerMille === 0`
  4. 驗證 2026-05-04 項目：`isWorkday === true`、`skipReason === null`、`ratioPerMille > 0`
  5. 驗證每一筆項目均含 `date` / `weekday` / `isWorkday` / `skipReason` / `ratioPerMille` 五個欄位
- **預期結果**：
  - 所有日期均在 dailyEstimates 中（非僅工作日）
  - skipReason 值域：`'週末'`（週六日）/ `'國定假日'`（假日）/ `null`（工作日）
  - 非工作日 `ratioPerMille === 0`；工作日 `ratioPerMille >= 1`

---

### TS-F049-CAL-007：Design A Regression Guard — response 不含 total / dailyEstimates[].estimate 欄位

- **關聯需求**：F049 v1.3 §5.1 Contract（「不接受 total/listNo、不回傳每日件數」）；AC-1 Design A；§13.3 分工原則
- **測試類型**：Regression / Unit
- **測試層**：Unit（純函式型別驗證或 response shape 斷言）
- **前置條件**：
  - SQLite seed ob_calendar；呼叫 `calculateDailyEstimate('202605', { calendarSource: 'weekday' })`
- **步驟**：
  1. 取得完整 response 物件
  2. 驗證 `'total' in response === false`（或 `response.total === undefined`）
  3. 驗證 `'totalEstimate' in response === false`（舊版欄位名亦不出現）
  4. 對 `response.dailyEstimates` 中每一筆驗證：
     - `'estimate' in item === false`（不含每日件數）
     - `'count' in item === false`
  5. 驗證 `'listNo' in response === false`（不接受 / 不回傳）
- **預期結果**：
  - response 完全不含 `total` / `totalEstimate` / `listNo` 欄位
  - dailyEstimates 每筆不含 `estimate` / `count` 欄位
  - **每日件數計算責任在前端**，後端 contract 維持 total-agnostic

---

### TS-F049-CAL-008：poolCount + warning（poolCount < threshold）；與 ratio 計算獨立

- **關聯需求**：F049 v1.3 AC-3（Pool 偏低警示）；§5.1 `poolCount` / `warning` 欄位；§4 AC-3 釐清（poolCount 與 total 獨立）
- **測試類型**：Positive / Unit（兩個子場景）
- **測試層**：Unit（SQLite in-memory seed ob_pool_data + ob_calendar）

**子場景 8a：poolCount=800 < threshold=1000 → warning='POOL_COUNT_LOW'**

- **前置條件**：
  - SQLite seed ob_pool_data 800 筆；ob_calendar 20 工作日
  - `STAGE0_POOL_WARN_THRESHOLD` env = 未設（預設 1000）
- **步驟**：
  1. 呼叫 `calculateDailyEstimate('202605')`
  2. 驗證 `response.poolCount === 800`
  3. 驗證 `response.warning === 'POOL_COUNT_LOW'`
  4. 驗證 `response.baseRatio` / `response.remainder` 均正常計算（poolCount 不影響 ratio）
  5. 驗證 `SUM(工作日 ratioPerMille) === 1000`（warning 不破壞 ratio 加總）
- **預期結果**：`warning='POOL_COUNT_LOW'`；ratio 計算正常

**子場景 8b：poolCount=5000 >= threshold=1000 → warning=null**

- **前置條件**：SQLite seed ob_pool_data 5000 筆
- **步驟**：呼叫 `calculateDailyEstimate('202605')`
- **預期結果**：`response.warning === null`；`response.poolCount === 5000`

**子場景 8c：環境變數 STAGE0_POOL_WARN_THRESHOLD=500 → threshold 可配置**

- **前置條件**：ob_pool_data 800 筆；env `STAGE0_POOL_WARN_THRESHOLD=500`
- **步驟**：呼叫 `calculateDailyEstimate`
- **預期結果**：`warning === null`（800 >= 500，不觸發警示；threshold 由 env 控制）

---

### TS-F049-CAL-009：workingDays=0 邊界 — 不除零；baseRatio=0、remainder=0

- **關聯需求**：F049 v1.3 §5.1（`workingDays = 0` 時 baseRatio=0）；§13.1 計算步驟第 1 點（`workingDays = 0 → 全部為 0，無估算`）
- **測試類型**：Negative / Unit（邊界值）
- **測試層**：Unit（SQLite in-memory 或純函式）
- **前置條件**：
  - 設定 startDate / endDate 為一個無工作日的範圍（例如：自訂 startDate='2026-05-02' endDate='2026-05-03' 週六日；calendarSource='weekday'）
  - 或 SQLite seed ob_calendar 僅含週末/假日（全為 rest_flg='1'）
  - 呼叫 `calculateDailyEstimate('202605', { calendarSource: 'weekday', startDate: '2026-05-02', endDate: '2026-05-03' })`
- **步驟**：
  1. 呼叫目標函式（**不得拋出例外**）
  2. 驗證 `response.workingDays === 0`
  3. 驗證 `response.baseRatio === 0`（不發生除以零）
  4. 驗證 `response.remainder === 0`
  5. 驗證 `dailyEstimates.every(d => d.ratioPerMille === 0)`
  6. 驗證 `SUM(ratioPerMille) === 0`（無工作日，加總為 0，非 1000）
  7. 驗證整體函式正常返回（非 throw）
- **預期結果**：
  - 函式正常返回，不拋 `DivisionByZeroError` 或未捕獲例外
  - `baseRatio === 0`；`remainder === 0`；所有 ratioPerMille === 0

---

## 四、前端元件 v1.3 對齊 prototype（RTL + MSW）

> **設計依據**：F049 v1.3 AC-4-Default / §8.1 / prototype `30-stage0-estimate.html`（`recompute()` + `buildCalendar()` 為 ground truth）
> **修正背景**：現行 React 實作與 prototype 存在以下差異（待 v1.3 修正）：
> 1. selector 多一個 prototype 不存在的「— 請選擇 —」空選項（`stage0-input-panel.tsx` line 76）
> 2. `totalCount` 初始 state 寫死 `9500`（`stage0-estimate-page.tsx` line 79）
> 3. bar chart 使用 `w-6`（固定寬度），prototype 用 `w-full`（`stage0-bar-chart.tsx` line 125）
> 4. `distribution` useMemo 僅依賴 `[dailyData, input.totalCount]`，切換 `calendarSource` 不重新呼叫 daily-estimate API
> 5. 表格工作日欄以 `✓`/`—` 符號顯示，prototype 用 pill badge（`Y (rest_flg=0)` / `N (週末/國定假日)`）
> **MSW 注意**：stub `daily-estimate` 時，response 須符合 Design A shape（含 `calendarSource` / `ratioPerMille` / 所有日期）；**不得**含 `total` / `estimate` 欄位。

---

### TS-F049-V13F-001：初載自動選第一筆 active 名單；selector 無「— 請選擇 —」空選項

- **關聯需求**：F049 v1.3 AC-4-Default（「自動選第一筆 active 名單；無空選項」）；§8.1 輸入區規範
- **測試類型**：Positive / Component（RTL + MSW）
- **測試層**：Component
- **前置條件**：
  - MSW stub `GET /api/v1/assignment/lists?ym=202605` → 回傳 3 筆 active 名單（`OB202605001` / `OB202605002` / `OB202605004`）
  - MSW stub `GET /api/v1/assignment/list-definitions/OB202605001/estimate` → `{ listNo: 'OB202605001', count: 8500 }`（第一筆名單之 per-list COUNT）
  - MSW stub `GET /api/v1/assignment/stage0/daily-estimate` → 標準 Design A response（20 工作日）
- **步驟**：
  1. render `<Stage0EstimatePage />`
  2. 等待非同步請求完成（`waitFor`）
  3. 取得 `data-testid="input-list-no"` 的 select 元素
  4. 驗證 select 的 `value === 'OB202605001'`（第一筆自動選取）
  5. 驗證 select 的 options 中**不存在** value='' 的空選項（「— 請選擇 —」不出現）
  6. 驗證 `data-testid="kpi-total-estimate"` 顯示 `8,500`（來自第一筆名單 per-list COUNT）
- **預期結果**：
  - selector 預設選取 `OB202605001`（第一筆）
  - options 列表無空選項（`querySelector('option[value=""]') === null`）
  - KPI 總筆數 = 8,500（非寫死 9,500）

---

### TS-F049-V13F-002：無寫死 9500 Regression Guard — KPI 總筆數來自 per-list COUNT

- **關聯需求**：F049 v1.3 AC-4-Default（「移除 React 現行寫死 9500 magic number」）；§8.1
- **測試類型**：Regression / Component（RTL + MSW）
- **測試層**：Component
- **前置條件**：
  - MSW stub `GET /api/v1/assignment/lists` → 回傳 1 筆 active 名單 `OB202605004`
  - MSW stub `GET /api/v1/assignment/list-definitions/OB202605004/estimate` → `{ listNo: 'OB202605004', count: 12345 }`（刻意非 9500）
  - MSW stub daily-estimate → 標準 response
- **步驟**：
  1. render `<Stage0EstimatePage />`
  2. 等待 MSW 請求完成
  3. 驗證 `data-testid="kpi-total-estimate"` 文字內容
  4. 驗證頁面**不出現** `9,500` 或 `9500` 字串（掃描整個 document body）
- **預期結果**：
  - KPI 總筆數顯示 `12,345`（逗號千分位）
  - 頁面任意位置均**不渲染** `9500` 數值（magic number 已完全移除）
  - `document.body.textContent` 中不含 `'9500'` 或 `'9,500'`

---

### TS-F049-V13F-003：切換 calendarSource → 重新呼叫 daily-estimate（帶新參數）並重算 — Q2 Regression Guard

- **關聯需求**：F049 v1.3 §5.1 `calendarSource` query 參數；AC-1（切換後重算）；§8.1 工作日來源 selector `onchange` 觸發重算
- **測試類型**：Regression / Component（RTL + MSW）
- **測試層**：Component
- **前置條件**：
  - MSW stub `GET /api/v1/assignment/stage0/daily-estimate?*` → 根據 `calendarSource` 回傳不同 response：
    - `calendarSource=weekday`：`workingDays=20`、所有工作日 `ratioPerMille=50`
    - `calendarSource=all`：`workingDays=31`、所有日 `ratioPerMille=32`（或 33）
  - 記錄 MSW 攔截到的 request URL（使用 `msw.server.events.on('request:start', ...)` 或 spy）
- **步驟**：
  1. render `<Stage0EstimatePage />`，等待初載完成（calendarSource='weekday'，workingDays=20）
  2. 驗證 KPI `data-testid="kpi-working-days"` 顯示 `20`
  3. 找到 `data-testid="input-calendar-source"` select，觸發 `fireEvent.change(el, { target: { value: 'all' } })`
  4. 等待重新請求完成（`waitFor`）
  5. 驗證 MSW 攔截到的第二次 `daily-estimate` request URL 含 `calendarSource=all`
  6. 驗證 KPI `kpi-working-days` 更新為 `31`
- **預期結果**：
  - 切換 calendarSource 觸發新的 API 呼叫，URL 帶新的 calendarSource 值
  - KPI workingDays 隨之更新（非 dead control）
  - **Regression 驗證**：`calendarSource` 不再是死控制項（Q2 修正後此測試應通過）

---

### TS-F049-V13F-004：切換起訖日 → 重新呼叫 daily-estimate（帶新 startDate/endDate）

- **關聯需求**：F049 v1.3 §5.1 `startDate` / `endDate` query 參數；§8.1 起始日/結束日 `onchange` 觸發重算
- **測試類型**：Positive / Component（RTL + MSW）
- **測試層**：Component
- **前置條件**：
  - MSW stub daily-estimate 預設回傳 `startDate='2026-05-01'` / `endDate='2026-05-31'`（整月）
  - MSW stub 也回應含 `startDate='2026-05-11'` / `endDate='2026-05-22'` 參數的請求
- **步驟**：
  1. render `<Stage0EstimatePage />`，等待初載（整月）
  2. 找到 `data-testid="input-start-date"`，觸發 `fireEvent.change` 值為 `'2026-05-11'`
  3. 找到 `data-testid="input-end-date"`，觸發 `fireEvent.change` 值為 `'2026-05-22'`
  4. 等待新請求完成（`waitFor`）
  5. 驗證 MSW 最新攔截的 request URL 含 `startDate=2026-05-11` 與 `endDate=2026-05-22`
- **預期結果**：
  - 更改起訖日後觸發新的 API 呼叫，攜帶新的 startDate / endDate
  - 圖表與表格資料對應更新

---

### TS-F049-V13F-005：切換 selector 至另一名單 → total 換成新名單 per-list COUNT；每日件數重算

- **關聯需求**：F049 v1.3 AC-4-Default（「切換 selector 至另一名單時，total 重新取得該名單之 per-list COUNT，每日估算隨之重算」）；§8.1 名單 LIST_NO selector `onchange` 觸發重算
- **測試類型**：Positive / Component（RTL + MSW）
- **測試層**：Component
- **前置條件**：
  - MSW stub lists → `[{ listNo: 'OB202605001', count: 8500 }, { listNo: 'OB202605004', count: 12345 }]`（兩筆 active）
  - MSW stub `estimate/OB202605001` → count=8500
  - MSW stub `estimate/OB202605004` → count=12345
  - MSW stub daily-estimate → workingDays=20，所有工作日 ratioPerMille=50
- **步驟**：
  1. render `<Stage0EstimatePage />`，等待初載（自動選 OB202605001）
  2. 驗證 KPI total = `8,500`；每日件數 = `round(50/1000×8500) = 425`
  3. 找到 `data-testid="input-list-no"`，觸發切換至 `OB202605004`
  4. 等待 `/estimate/OB202605004` 請求完成（`waitFor`）
  5. 驗證 KPI total 更新為 `12,345`
  6. 驗證第一個工作日的預估件數更新為 `round(50/1000×12345) = 617`（前端重算）
- **預期結果**：
  - 切換名單觸發 per-list COUNT 重取
  - KPI total 隨之更新
  - 每日件數由前端以新 total 重新計算（不重抓 daily-estimate，只換 total）

---

### TS-F049-V13F-006：前端每日件數計算正確 — computeAdE07Distribution 純函式驗證

- **關聯需求**：F049 v1.3 §13.1 計算步驟 5（`estimate = round(ratioPerMille / 1000 × total)`）；§13.3 分工原則（前端負責件數計算）
- **測試類型**：Positive / Unit（純函式）
- **測試層**：Unit（`computeAdE07Distribution`，無 RTL / MSW 依賴）

**子場景 6a：基本驗證（total=9500，workingDays=20，remainder=0）**

- **前置條件**：
  - `days` = 包含 20 個工作日（`isWorkday=true`）+ 11 個跳過日（`isWorkday=false`）的陣列
  - 後端回傳 ratioPerMille：工作日各 = 50；跳過日 = 0
  - 呼叫 `computeAdE07Distribution(9500, days.map(d => ({ ...d, ratioPerMille: d.isWorkday ? 50 : 0 })))`
    > 注意：若 `computeAdE07Distribution` 不接受 `ratioPerMille` 參數（現行實作自行計算），本案例驗證其等效 ratio 模型
- **步驟**：
  1. 呼叫 `computeAdE07Distribution(9500, days)`
  2. 驗證每個工作日 `estimate === round(50/1000 × 9500) === round(475) === 475`
  3. 驗證每個跳過日 `estimate === 0`
  4. 驗證 `isBonus` 欄位：`remainder=0` 時無任何日子是 bonus

**子場景 6b：有餘數補（total=9500，workingDays=21，remainder=13）**

- **前置條件**：21 個工作日；`baseRatio=47`；前 13 個工作日（月末 DESC）`ratioPerMille=48`；其餘 8 個 `ratioPerMille=47`
- **步驟**：
  1. 驗證 `baseRatio+1`（bonus）工作日的 `estimate = round(48/1000 × 9500) = round(456) = 456`
  2. 驗證 base 工作日的 `estimate = round(47/1000 × 9500) = round(446.5) = 447`
  3. 驗證 bonus 日 `isBonus === true`；其他工作日 `isBonus === false`
  4. 驗證 `cumulative` 值遞增正確（每個工作日累加，跳過日不累加）
- **預期結果**：件數計算符合 `round(ratioPerMille/1000 × total)` 公式；`isBonus` 標記正確

---

### TS-F049-V13F-007：bar chart 渲染對齊 prototype — bar `w-full`、跳過日灰 bar、標籤順序件數在上

- **關聯需求**：F049 v1.3 §8.1 圖表規範（`w-full`、跳過日灰 bar `bg-gray-300`、標籤順序「件數在上」）；prototype `30-stage0-estimate.html` `recompute()` chart innerHTML 結構
- **測試類型**：Positive / Component（RTL）
- **測試層**：Component（`Stage0BarChart`，純渲染測試）
- **前置條件**：
  - 準備 `rows: Stage0Row[]`，含 3 筆：
    - `{ date: '2026-05-01', weekday: '五', isWorkday: false, estimate: 0, isBonus: false, cumulative: 0 }`（跳過日）
    - `{ date: '2026-05-04', weekday: '一', isWorkday: true, estimate: 475, isBonus: false, cumulative: 475 }`（base 工作日）
    - `{ date: '2026-05-29', weekday: '五', isWorkday: true, estimate: 476, isBonus: true, cumulative: 9500 }`（bonus 工作日）
  - render `<Stage0BarChart rows={rows} />`
- **步驟**：
  1. **bar width 驗證**：找到 `data-testid="bar-2026-05-04"` 內的 bar div，驗證其 className **含** `w-full` 且**不含** `w-6`
  2. **跳過日 bar 存在**：找到 `data-testid="bar-2026-05-01"`，驗證 bar div 存在（非完全不渲染）
  3. **跳過日 bar 顏色**：驗證 bar div className **含** `bg-gray-300`
  4. **工作日 base bar 顏色**：找到 `bar-2026-05-04`，驗證 bar div className 含 `bg-blue-500`
  5. **bonus bar 顏色**：找到 `bar-2026-05-29`，驗證 bar div className 含 `bg-blue-700`
  6. **標籤順序（件數在上）**：找到 `bar-2026-05-04` 的 cell，驗證件數標籤（`475`）之 DOM 位置**先於** bar div（件數標籤 y < bar div y）；確認符合 prototype 中「件數 → bar → 日期 → 星期」順序
- **預期結果**：
  - 所有 bar 為 `w-full`（非 `w-6`）
  - 跳過日有灰色 bar（`bg-gray-300`）
  - base 工作日 bar = `bg-blue-500`；bonus 工作日 bar = `bg-blue-700`
  - 件數標籤在 DOM 中先於 bar div（標籤在上）

---

### TS-F049-V13F-008：表格 pill badge — 工作日 Y / 非工作日 N + skipReason / 餘數補 base+1 正確對應

- **關聯需求**：F049 v1.3 §8.1 表格 pill badge 規範（工作日綠色 `Y (rest_flg=0)` / 非工作日灰色 `N (skipReason)` / 餘數補藍色 `base+1（餘數補）`）；prototype 表格 `tbody` 渲染邏輯
- **測試類型**：Positive / Component（RTL）
- **測試層**：Component（`Stage0EstimatePage` 或 daily-table 子元件；RTL 渲染）
- **前置條件**：
  - MSW stub daily-estimate → 回傳含以下代表性日期的 response：
    - 2026-05-01（skipReason='國定假日'，isWorkday=false）
    - 2026-05-02（skipReason='週末'，isWorkday=false）
    - 2026-05-04（isWorkday=true，ratioPerMille=50，非 bonus）
    - 2026-05-29（isWorkday=true，ratioPerMille=51，isBonus=true）
  - MSW stub list-estimate → count=9500
  - render `<Stage0EstimatePage />`
- **步驟**：
  1. 等待 `data-testid="stage0-daily-table"` 渲染完成
  2. 找到 2026-05-01 列的工作日欄，驗證文字含 `N` 且含 `國定假日`（灰色 badge）
  3. 找到 2026-05-02 列的工作日欄，驗證文字含 `N` 且含 `週末`（灰色 badge）
  4. 找到 2026-05-04 列的工作日欄，驗證含 `Y`（綠色 badge，含 `rest_flg=0`）
  5. 找到 2026-05-04 列的餘數補欄，驗證文字為「—」（非 bonus）
  6. 找到 2026-05-29 列的餘數補欄，驗證含 `base+1` 或 `餘數補` 關鍵字（藍色 badge）
  7. 2026-05-01 / 5-02 列：驗證預估件數欄顯示「—」（非 0）
  8. 2026-05-04 列：驗證預估件數欄顯示數字（非「—」）
- **預期結果**：
  - 工作日 badge：綠色（emerald）含 `Y (rest_flg=0)`
  - 非工作日 badge：灰色含 `N (國定假日)` / `N (週末)`
  - 餘數補：bonus 列顯示藍色 badge；非 bonus 列顯示「—」
  - 非工作日預估件數顯示「—」（非 0）

---

### TS-F049-V13F-009：空狀態 — 無 active 名單 → selector disabled；KPI 顯示「—」；不渲染寫死值

- **關聯需求**：F049 v1.3 AC-4-Default 空狀態（「當當月無任何 active 名單時：selector disabled，KPI 顯示『—』，不渲染任何寫死數值」）；§8.1
- **測試類型**：Negative / Component（RTL + MSW）
- **測試層**：Component
- **前置條件**：
  - MSW stub `GET /api/v1/assignment/lists?ym=202605` → 回傳空陣列（`lists: []`，或含名單但全為 inactive）
  - MSW stub daily-estimate → 標準 response（daily-estimate 本身正常，僅無 active 名單）
- **步驟**：
  1. render `<Stage0EstimatePage />`
  2. 等待渲染完成
  3. 找到 `data-testid="input-list-no"` select，驗證 `disabled === true`
  4. 驗證 KPI `data-testid="kpi-total-estimate"` 文字內容為「—」（非任何數字）
  5. 驗證頁面**不出現** `9,500` 或 `9500` 字串
  6. 驗證圖表或表格顯示空狀態文案（「無試算資料」或對應 empty state）
- **預期結果**：
  - selector disabled
  - KPI total 顯示「—」
  - 無寫死 9500 / 9,500 出現
  - 圖表空狀態（不渲染假資料）
