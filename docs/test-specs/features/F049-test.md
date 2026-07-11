---
type: test-design-feature
feature_id: F049
feature_name: Stage 0 試算頁業務化重設計（部門維度每日分派可行性）
priority: P0-MVP
related_spec: /docs/specs/features/F049-stage0-daily-estimate.md
spec_version: "2.0"
covers:
  - F049
  - US-071
  - US-132
  - US-135
  - US-166
  - US-167
  - US-168
  - US-169
  - US-170
date: 2026-05-21
last_updated: 2026-06-29
---

# F049：Stage 0 試算頁業務化重設計（v2.0）— 測試設計

> **v1.4 測試設計更新（2026-05-26 / estimate 升級為完整 Stage 1 dry-run，對齊 F092）**：F049 v1.4 / [F092](../../specs/features/F092-stage1-dry-run-estimate.md) 將 per-list estimate 由「欄位篩選版 COUNT」升級為「完整 Stage 1 鏈 dry-run COUNT（≡ 月名單分派案件數）」。本版**僅更新 TS-F049-EST-010**（整合層）：原預期固定值 `≈ 241,978`（欄位篩選版上界）已過時 → 改為「dry-run COUNT === 月名單分派 Stage 1（不再 assert 固定值）；完整鏈後 COUNT ≤ 241,978；dev `ob_pool_data_list` 空時去重不減、但 month_cnt / 特殊 DELETE 仍可能減」，並標記為 **Integration DEFERRED**（需真實 PG + ob_pool_data_list seed）。完整鏈三步驟（month_cnt / 去重 / 特殊 DELETE）之單元測試由 F091-test 覆蓋，本檔不重複。其餘案例群組（CAL / V13F / EST-001~009）不變。
>
> **v1.3 測試設計追加（2026-05-26）**：新增「後端 `calculateDailyEstimate` 千分位 ratio + calendarSource 三模式」案例群組（TS-F049-CAL-001 ~ TS-F049-CAL-009）及「前端元件對齊 prototype」案例群組（TS-F049-V13F-001 ~ TS-F049-V13F-009）。後端群組驗證 Design A contract（total-agnostic、全日期回傳、SUM(ratioPerMille)=1000）；前端群組驗證自動選第一筆、calendarSource 切換重呼 API、無寫死 9500、bar `w-full`、跳過日灰 bar 等 prototype 對齊項。詳見 F049 v1.3 AC-1/AC-2/AC-3/AC-4-Default/§5.1/§8.1/§13。
>
> **v1.2 測試設計追加（2026-05-26）**：新增「後端 Stage 0 per-list 試算篩選邏輯」案例群組（TS-F049-EST-001 ~ TS-F049-EST-009），驗證 `estimateListCount` / `buildPoolCountQuery` 修正後行為 —— 改為複用月名單分派 Stage 1 之 `buildStage1WhereConditions()` 演算法，確保 `IN` 多值、欄位映射（caseyear → year_cnt、case_status → list_type）、wildcard、EMPTY_CONDITIONS 均正確，並保留原有 404 / 逾時 regression 驗證。詳見 F049 v1.2 AC-4 篩選機制對照表 / BR-5 / §7。
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
| TS-F049-EST-010 | 1 | 低（需真實 DB）| Integration（**DEFERRED**）| 完整鏈 dry-run COUNT === 月名單分派 Stage 1（F092 AC-3）；COUNT ≤ 241,978（去重+month_cnt+特殊 DELETE 後更少，不再 assert 固定值）；CI 需 PostgreSQL TestContainer + ob_pool_data_list seed |

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
  - MSW stub assignment_run → `{ status: 'idle' }`（無執行中月名單分派）
- **步驟**：
  1. render `<ListKanbanPage />`（或對應 Kanban 元件）
  2. 等待渲染完成
  3. 驗證 Ready 欄頂 CTA Banner
- **預期結果**：
  - Ready 欄頂存在 CTA Banner 元素
  - Banner 含主按鈕（觸發月名單分派，文字如「執行月名單分派」）
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

### TS-F049-CTA-004：月名單分派執行中 → Banner 改琥珀色 disabled；主按鈕與 secondary 按鈕均 disabled

- **關聯需求**：F049 v1.1 §8（月名單分派鎖中 Banner disabled）/ F048 v2.0 AC-4 / F077 v1.3 BR-7 C-2
- **測試類型**：Positive / Component（RTL）
- **前置條件**：
  - MSW stub `stageCounts.ready = 2`（Banner 應渲染）
  - MSW stub assignment_run → `{ status: 'running' }`（月名單分派執行中）
- **步驟**：
  1. render `<ListKanbanPage />` 呈現月名單分派執行中狀態
  2. 驗證 Ready 欄頂 CTA Banner
- **預期結果**：
  - Banner 元素存在（DOM 存在，月名單分派鎖不移除 Banner，改 disabled 樣式）
  - 主按鈕 disabled（`toBeDisabled()`）
  - secondary「試算」按鈕 disabled（`toBeDisabled()`）
  - Banner 呈現琥珀色 disabled 樣式（有對應 CSS class 或 aria-disabled）

---

### TS-F049-CTA-005：secondary「試算」按鈕點擊 → 導向 Stage 0 試算頁

- **關聯需求**：F049 v1.1 AC-Banner-Entry / US-132 AC-3
- **測試類型**：Positive / Component（RTL）
- **前置條件**：`stageCounts.ready ≥ 1`；非歷史月份；無月名單分派鎖
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
| TS-F049-EST-010（整合層完整鏈 dry-run ≡ 月名單分派 COUNT 驗證；**DEFERRED**） | 低 | 需 PostgreSQL + 真實 ob_pool_data + ob_pool_data_list seed；僅 CI 環境可行 |

---

## 二、後端 Stage 0 per-list 試算篩選邏輯

> **設計依據**：F049 v1.2 AC-4 篩選機制對照表 / BR-5 / §7「名單無有效篩選條件」
> **修正背景**：v1.2 之前 `buildPoolCountQuery` 以 `=` 比對多值欄位（如 `prod_kind='01$$N'`）且欄位映射錯誤（`caseyear` 查的是 4 位數西元年欄位而非 `year_cnt`），導致 4 個 ready 名單估算全為 0。修法：`estimateListCount` 改為呼叫 `buildStage1WhereConditions(def)`，複用月名單分派 Stage 1 演算法。
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
  - `count === 0`（與月名單分派 Stage 1 skip 該名單行為一致）
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

### TS-F049-EST-010：Integration — 真實 ob_pool_data 完整鏈 dry-run COUNT 與 Stage 1 月名單分派結果一致（OB202605004 基準）

> **更新（對齊 F049 v1.4 / F092 完整鏈 dry-run）**：estimate 自 [F092](../../specs/features/F092-stage1-dry-run-estimate.md) 起改為**完整 Stage 1 鏈 dry-run**（`executeStage1Chain({ dryRun: true })`，含 MONTH_CNT 期別過濾 + 近 3 個月去重 + 特殊 DELETE），不再是「欄位篩選版」。故原預期值 `≈ 241,978`（欄位篩選版上界）**已過時**：完整鏈後 COUNT 會 **≤ 該值**（被 month_cnt / 去重 / 特殊 DELETE 進一步過濾）。本案例核心驗收改為「dry-run COUNT === 月名單分派 Stage 1 案件數（同一鏈，[F092 AC-3](../../specs/features/F092-stage1-dry-run-estimate.md)）」，不再 assert 固定數字。
>
> **標記：Integration DEFERRED**（需真實 PostgreSQL + ob_pool_data + ob_pool_data_list seed；單元層由 F091 三步驟純函式 / SQLite 覆蓋，見 F091-test）。

- **關聯需求**：F049 v1.4 AC-4 / BR-6「試算複用完整 Stage 1 鏈 `executeStage1Chain({dryRun:true})`，dry-run COUNT 精確 ≡ 月名單分派 Stage 1 案件數」；[F092 AC-3](../../specs/features/F092-stage1-dry-run-estimate.md)
- **測試類型**：Positive / Integration
- **測試層**：Integration（PostgreSQL TestContainer；需真實 ob_pool_data + ob_pool_data_list seed）— **DEFERRED（需真實 PG，CI 環境才可行）**
- **自動化就緒度**：低（需 CI PostgreSQL）；建議在 E2E 或特定 integration suite 中執行；單元層以 F091 三步驟純函式 / SQLite 替代
- **前置條件**：
  - PostgreSQL TestContainer 已啟動
  - ob_list_definition 含一筆名單 `list_no='OB202605004'`，`status='active'`，且 `list_period_start`/`list_period_end`/`list_interval`（MONTH_CNT 過濾用）、`list_nm`（特殊 DELETE 字串比對用）有對應值
  - `condition_payload.conditions` 含：
    - `{ fieldType: 'categorical', columnName: 'prod_kind', values: ['01'] }`
    - `{ fieldType: 'categorical', columnName: 'case_status', values: ['02'] }`（映射為 list_type）
    - `{ fieldType: 'categorical', columnName: 'caseyear', values: ['0','1','2','3','4','5'] }`（映射為 year_cnt IN (0~5)）
    - `{ fieldType: 'categorical', columnName: 'settle_src', values: ['N'] }`
    - `{ fieldType: 'categorical', columnName: 'spec_tp', values: ['A','B','C', ...] }`（多值）
  - ob_pool_data 已載入對應 202605 月份資料（E04 + E05 ETL seed）
  - ob_pool_data_list 去重歷史（[F090](../../specs/features/F090-obpooldata-list-etl.md) ETL）：dev / CI 可能為空 → 去重不減（見下方備註）
- **步驟**：
  1. 呼叫 `estimateListCount('OB202605004')`（內部走 `executeStage1Chain({ dryRun: true })`），記錄 `estimateCount`
  2. 獨立執行 Stage 1 月名單分派 pipeline（`executeStage1Chain({ dryRun: false })`）對同一名單，取得實際 `stage1Count`
  3. 比較兩個數值
- **預期結果**：
  - `estimateCount === stage1Count`（允許±0，確保 dry-run 與月名單分派完全一致 — 此為本案例核心驗收）
  - `estimateCount` **不為 0**（regression guard：舊版欄位篩選實作全為 0 的缺陷已修正）
  - `estimateCount` **≤ 241,978**（241,978 為升級前欄位篩選版上界；完整鏈套 month_cnt / 去重 / 特殊 DELETE 後只會更少或相等，**不再 assert 等於固定值**）
- **備註**：
  - 本案例核心為驗證 dry-run ≡ run **演算法一致性**，非固定 COUNT 數字。
  - **dev / CI `ob_pool_data_list` 為空時**：近 3 個月去重不減任何案件（去重集合為空），但 **MONTH_CNT 期別過濾與特殊 DELETE（中結/強案/滿期/年資/詐騙白牌）仍可能減少 COUNT**；故 `estimateCount` 仍可能 < 241,978。需以真實 `ob_pool_data_list` seed 才能完整驗證去重減量。
  - CI 環境需確保 PostgreSQL 版本與 prod 一致（避免 BETWEEN / `IN` 語意差異）。

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

---

# Part B — v2.0 業務化重設計測試設計（US-166~170）

> **v2.0 新增（2026-06-29）**：覆蓋 F049 Part B §14–§22 / AD-E07-v3.6 / US-166–170 之驗收標準。分為五個後端群組（DEPT / GAP / SCOPE / FEAS / INVAR）、一個邊緣案例群組（EDGE）、兩個前端群組（AGG / FE）與一個術語清理群組（TERM）。**總新增場景：43 個**。
>
> **安全性紅線（SCOPE 群組）**：TS-F049-SCOPE-002 為後端 scope leak regression guard，任何未來使非轄區部門資料出現在 response 中的修改都應使此測試 FAIL。
>
> **數值 oracle 已手算（DEPT/GAP 群組）**：所有 dpm/ration 計算採 `dept_real = Σ(list_total × ration/100 × dpm/1000)`，最終 `Math.round()` 一次。實數 gap 先算再捨入（`gap_real = org_real − Σ dept_real`）——不可 assert `Σ Math.round(dept_real) === Math.round(org_real)`（捨入容差最大 ±部門數 件）。
>
> **SQLite/PG 移植性標記（依 AD-E07-v3.6 §8）**：頭count 批次查詢以 `SELECT TRIM(dept_code), COUNT(*) FROM ob_emphire WHERE resign_date IS NULL GROUP BY TRIM(dept_code)` 為準，SQLite / PG 均支援；headcount 全取後 JS `trim()` 做 map 亦可避免 SQL 差異。`TRIM(p.obdeptid)` 比對在兩 DB 均相容。EXTRACT(DOW) 類查詢不需在部門投影中使用（已由 `computeWorkingDayRatios` 純函式承擔）。

---

## 五、後端部門投影公式（DEPT，BR-8 / §16.1）

> **設計依據**：F049 §16.1 / §16.3 / BR-8；AD-E07-v3.6 §5 in-memory 部門投影；US-167 AC-1
> **測試策略**：`computeDeptEstimate` service method，以 SQLite in-memory seed `ob_list_definition`、`ob_dept_pct`、`ob_emphire`、`ob_calendar`；部門投影為 in-memory 計算，無需 PG TestContainer（除非需 EXTRACT(DOW)）。

---

### TS-F049-DEPT-001：兩份名單 × 兩個部門 × 一個工作日的完整公式驗算（手算 oracle）

- **關聯需求**：F049 §16.1 BR-8；US-167 AC-1 / TC-167-01
- **測試類型**：Positive / Unit
- **測試層**：Unit（SQLite in-memory）

**Fixture 定義（手算 oracle）**：

| 欄位 | 值 |
|---|---|
| 名單 A `list_total` | 1,000 件 |
| 名單 B `list_total` | 500 件 |
| 名單 A D001 `ration` | 40% |
| 名單 A D002 `ration` | 60% |
| 名單 B D001 `ration` | 25% |
| 名單 B D002 `ration` | 75% |
| 工作日千分位 `dpm` | 50‰ |

**公式計算（實數）**：
```
dept_real[D001] = (1000 × 0.40 × 0.050) + (500 × 0.25 × 0.050) = 20.000 + 6.250 = 26.250
dept_real[D002] = (1000 × 0.60 × 0.050) + (500 × 0.75 × 0.050) = 30.000 + 18.750 = 48.750
org_real        = (1000 + 500) × 0.050 = 75.000
gap_real        = 75.000 − (26.250 + 48.750) = 0.000
```

**捨入後期望值**：
- `cases[D001] = Math.round(26.250) = 26`
- `cases[D002] = Math.round(48.750) = 49`
- `orgTotal = Math.round(75.000) = 75`
- `gap = Math.round(0.000) = 0`（缺口列不顯示）

- **前置條件**：
  - SQLite in-memory seed：
    - `ob_list_definition`：兩筆 active 名單（LIST-A / LIST-B），`stage0_estimate_count` 分別為 1000 / 500
    - `ob_dept_pct`：如 Fixture 表（LIST-A: D001=40%, D002=60%；LIST-B: D001=25%, D002=75%）
    - `ob_emphire`：D001 10 人、D002 10 人在職（`resign_date IS NULL`）
    - `ob_calendar`：2026-05-04（週一，`rest_flg='0'`），dpm 計算後 = 50‰（月內僅此 1 工作日以簡化測試）
  - 呼叫 `computeDeptEstimate('202605', { calendarSource: 'weekday', startDate: '2026-05-04', endDate: '2026-05-04' })`
- **步驟**：
  1. 取得 response，找到 `days[0]`（2026-05-04）
  2. 驗證 `days[0].isWorkday === true`
  3. 驗證 `days[0].deptCells.length === 2`
  4. 驗證 `deptCells` 依 `deptCode ASC` 排序（D001 在前，D002 在後）
  5. 驗證 `deptCells[0].deptCode === 'D001'`、`deptCells[0].cases === 26`
  6. 驗證 `deptCells[1].deptCode === 'D002'`、`deptCells[1].cases === 49`
  7. 驗證 `days[0].orgTotal === 75`
  8. 驗證 `days[0].gap === 0`（gap=0，不顯示缺口）
  9. **捨入容差確認**：assert `deptCells[0].cases + deptCells[1].cases` 在 `[74, 76]` 範圍內（±1 件容差），**不 assert 嚴格等於 orgTotal**
- **預期結果**：
  - D001.cases = 26；D002.cases = 49；orgTotal = 75；gap = 0
  - deptCells 依 deptCode ASC 排序（I-DEPT-ORDER-01）
- **DB 需求**：SQLite 可覆蓋（in-memory 計算無 SQL 聚合）

---

### TS-F049-DEPT-002：休息日全部門件數 = 0 / per_person = null / gap = 0（BR-8 / TC-167-03）

- **關聯需求**：F049 §16.1（`dpm=0` 休息日）；BR-8；US-167 AC-1；TC-167-03
- **測試類型**：Positive / Unit
- **測試層**：Unit（SQLite in-memory）
- **前置條件**：
  - 同 TS-F049-DEPT-001 seed；另新增一天 2026-05-03（週日，`rest_flg='1'`）
  - 呼叫 `computeDeptEstimate` 含 2026-05-03
- **步驟**：
  1. 找到 `days` 中 2026-05-03 日期項目
  2. 驗證 `isWorkday === false`
  3. 驗證 `deptCells` 為空陣列（`[]`）
  4. 驗證 `orgTotal === 0`、`deptAssignedTotal === 0`、`gap === 0`
  5. 驗證 2026-05-04（工作日）的 `deptCells` 非空（contrast）
- **預期結果**：
  - 休息日：deptCells 空、orgTotal=0、gap=0
  - 工作日：deptCells 含部門列（對比驗證）

---

### TS-F049-DEPT-003：per-list `ration` 來自 `ob_dept_pct`（非 legacy MIN(LIST_NO) 共用比例 — BR-8 regression）

- **關聯需求**：F049 BR-8（「ration 為 per-list，取自 ob_dept_pct；刻意不採 legacy MIN(LIST_NO) 共用比例」）；AD-E07-29 一致性
- **測試類型**：Regression / Unit
- **測試層**：Unit（SQLite in-memory）
- **前置條件**：
  - 兩份名單 LIST-A（D001=40%）/ LIST-B（D001=60%）
  - `ob_dept_pct` 各自獨立設定（per-list，無 MIN(LIST_NO) 共用表）
  - `stage0_estimate_count` LIST-A=1000、LIST-B=1000
  - 工作日 dpm=50‰
- **步驟**：
  1. 呼叫 `computeDeptEstimate`
  2. 取得 D001 件數：`dept_real[D001] = (1000×0.40×0.05) + (1000×0.60×0.05) = 20 + 30 = 50`
  3. 驗證 `deptCells[0].cases === 50`
  4. **Regression guard**：確認計算使用各自名單的 ration（LIST-A=40% / LIST-B=60%），不使用 MIN(LIST_NO)=40% 共用（若使用共用比例，D001 will be `(1000+1000)×0.40×0.05 = 40`，測試應在 40 ≠ 50 時 FAIL）
- **預期結果**：
  - D001.cases = 50（per-list 各自比例的加總）
  - 若使用 MIN(LIST_NO) 共用比例，D001.cases = 40 → 測試 FAIL（regression guard 生效）

---

### TS-F049-DEPT-004：單一名單鑽探模式（listNo 指定）公式不變，僅名單集合縮減

- **關聯需求**：F049 AC-AGG-2；US-167 AC-4；§14.2 L2 聚合層
- **測試類型**：Positive / Unit
- **測試層**：Unit（SQLite in-memory）
- **前置條件**：
  - 三份名單 LIST-A/B/C，各有 ob_dept_pct
  - 呼叫 `computeDeptEstimate('202605', { listNo: 'LIST-B' })`（single-list 模式）
- **步驟**：
  1. 驗證 `response.mode === 'single-list'`
  2. 驗證 `response.listNo === 'LIST-B'`
  3. 驗證 `deptCells` 中的 cases 僅反映 LIST-B 的 list_total 與 ration（不含 LIST-A / LIST-C 貢獻）
  4. 對比：呼叫 aggregated 模式的 deptCells，cases 值較大（含三份名單）
- **預期結果**：
  - `mode === 'single-list'`；`listNo === 'LIST-B'`
  - cases 值 < aggregated 模式值（僅一份名單貢獻）

---

## 六、後端缺口機制（GAP，BR-9/10/11 / §16.2~16.3）

> **設計依據**：F049 §16.2 / §16.3（捨入規則）/ BR-9 / BR-10 / BR-11；US-167 AC-2 / AC-5

---

### TS-F049-GAP-001：比例 60%（未達 100%）→ gap = 20、缺口列顯示（TC-167-02）

- **關聯需求**：F049 §16.2 / AC-GAP-1 / BR-10；US-167 AC-2；TC-167-02
- **測試類型**：Positive / Unit
- **測試層**：Unit（SQLite in-memory）

**手算 oracle**：
```
list_total = 1000, D001 ration=60%, dpm=50‰
dept_real[D001] = 1000 × 0.60 × 0.050 = 30.000 → cases = 30
org_real  = 1000 × 0.050 = 50.000 → orgTotal = 50
gap_real  = 50.000 − 30.000 = 20.000 → gap = 20
```

- **前置條件**：
  - 名單 LIST-A：list_total=1000，`ob_dept_pct` 僅 D001=60%（D002 無設定）
  - ob_calendar 一個工作日，dpm=50‰
- **步驟**：
  1. 呼叫 `computeDeptEstimate`
  2. 找到工作日那天的 `days[0]`
  3. 驗證 `deptCells.length === 1`（只有 D001 有比例）
  4. 驗證 `deptCells[0].cases === 30`
  5. 驗證 `orgTotal === 50`
  6. 驗證 `gap === 20`（`gap_real` 先算再 `Math.round`）
  7. 驗證 D002 **不出現在** `deptCells` 中（`deptCells.find(c => c.deptCode === 'D002') === undefined`）
- **預期結果**：
  - cases[D001]=30；orgTotal=50；gap=20
  - D002 完全不在 response 中（AC-DEPT-2）
  - gap > 0 → 前端應顯示缺口列（後端已正確提供 gap 值）

---

### TS-F049-GAP-002：比例 70%（D001=30% + D002=40%）→ gap = 30、不另出名單層警示（TC-167-04）

- **關聯需求**：F049 §16.2 / AC-GAP-3 / BR-11；US-167 AC-5；TC-167-04
- **測試類型**：Positive / Unit
- **測試層**：Unit（SQLite in-memory）

**手算 oracle**：
```
list_total = 2000, D001=30%, D002=40%, dpm=50‰
dept_real[D001] = 2000 × 0.30 × 0.050 = 30.000 → cases = 30
dept_real[D002] = 2000 × 0.40 × 0.050 = 40.000 → cases = 40
org_real  = 2000 × 0.050 = 100.000 → orgTotal = 100
gap_real  = 100 − (30 + 40) = 30.000 → gap = 30
```

- **前置條件**：名單 LIST-B：list_total=2000，D001=30%，D002=40%，dpm=50‰
- **步驟**：
  1. 驗證 `deptCells[0].cases === 30`（D001）
  2. 驗證 `deptCells[1].cases === 40`（D002）
  3. 驗證 `orgTotal === 100`
  4. 驗證 `gap === 30`
  5. 驗證 response 中**無** `listWarning`、`ratioShortfall`、或任何名單層警示欄位（BR-11：統一表現為 gap）
  6. 驗證 `warnings[]` 中**無** `RATIO_BELOW_100` 或類似碼（缺口不以 warnings 呈現，以 gap 欄位承載）
- **預期結果**：
  - gap=30；無名單層警示；缺口統一以 `gap` 欄位表示

---

### TS-F049-GAP-003：完全無 ob_dept_pct 比例 → deptCells=[] / gap = org_total（全額缺口）

- **關聯需求**：F049 AC-DEPT-2 / AC-GAP-1；BR-10（缺口≥0 恆成立）；§22.2 邊緣案例
- **測試類型**：Positive / Unit
- **測試層**：Unit（SQLite in-memory）
- **前置條件**：名單 LIST-A：list_total=500，**ob_dept_pct 完全無任何列**；dpm=50‰
- **步驟**：
  1. 驗證 `deptCells` 為空陣列（`[]`）
  2. 驗證 `orgTotal = Math.round(500 × 0.050) = 25`
  3. 驗證 `deptAssignedTotal === 0`
  4. 驗證 `gap === 25`（= orgTotal，全額未分派）
- **預期結果**：
  - deptCells 空；gap = orgTotal = 25
  - org_total 仍正確顯示（不依賴任何比例，BR-9）

---

### TS-F049-GAP-004：比例 100% → gap = 0，缺口列不顯示

- **關聯需求**：F049 AC-GAP-2；BR-10（gap=0 不顯示）
- **測試類型**：Positive / Unit
- **測試層**：Unit（SQLite in-memory）

**手算 oracle**：
```
list_total = 1000, D001=40%, D002=60%, dpm=50‰
gap_real = 0 → gap = 0
```

- **前置條件**：D001=40% + D002=60%（總和 100%），list_total=1000，dpm=50‰
- **步驟**：
  1. 驗證 `gap === 0`
  2. 驗證後端 response 中 `gap === 0`（前端需依此判斷不渲染缺口列）
- **預期結果**：gap=0；前端不渲染缺口列

---

### TS-F049-GAP-005：捨入容差確認 — gap 由 gap_real 捨入，不 assert Σ 部門捨入值 === orgTotal

- **關聯需求**：F049 §16.3 裁定（Math.round / ±N 容差）；OQ-E07-STAGE0-ROUND
- **測試類型**：Boundary / Unit
- **測試層**：Unit（純函式驗證）

**設計一個有捨入殘差的 case**：
```
list_total = 1000, D001=33%, D002=33%, D003=33%, dpm=50‰
dept_real[D001] = 1000×0.33×0.05 = 16.500 → Math.round = 17
dept_real[D002] = 16.500 → 17
dept_real[D003] = 16.500 → 17
org_real        = 1000×0.05 = 50.000 → orgTotal = 50
gap_real        = 50 − (16.5+16.5+16.5) = 50 − 49.5 = 0.500 → gap = Math.round(0.5) = 1
```
注意：Σ rounded dept cells = 17+17+17 = 51 > orgTotal = 50（捨入殘差 +1）

- **前置條件**：LIST-A：D001=33%，D002=33%，D003=33%（總 99%），list_total=1000，dpm=50‰
- **步驟**：
  1. 驗證 `deptCells[0].cases === 17`（D001）
  2. 驗證 `deptCells[1].cases === 17`（D002）
  3. 驗證 `deptCells[2].cases === 17`（D003）
  4. 驗證 `orgTotal === 50`
  5. 驗證 `gap === 1`（gap_real=0.5 → Math.round(0.5)=1）
  6. **不 assert** `17+17+17 === orgTotal`（容差正常）
  7. 驗證 `Σ deptCells.cases + gap = 17+17+17+1 = 52`（此為正常捨入結果，接受）
- **預期結果**：
  - 捨入後 Σ 部門件數（51）≠ orgTotal（50）為正常現象
  - gap=1（由 gap_real 獨立捨入）
  - **重要**：測試框架不應 assert `sum(deptCells.cases) + gap === orgTotal`

---

### TS-F049-GAP-006：org_total 不依賴任何部門比例（BR-9 regression guard）

- **關聯需求**：F049 BR-9（`org_total = Σ list_total × dpm / 1000`，不依賴比例）；AC-DEPT-1
- **測試類型**：Regression / Unit
- **測試層**：Unit（SQLite in-memory）
- **前置條件**：
  - 兩份名單：LIST-A（list_total=1000，D001=0%，無比例設定）；LIST-B（list_total=500，D001=40%）
  - dpm=50‰
- **步驟**：
  1. 驗證 `orgTotal = Math.round((1000 + 500) × 0.050) = 75`
  2. **Regression guard**：確認 orgTotal 不因 LIST-A 無比例設定而被排除（若誤用 `Σ dept_assigned` 算 orgTotal，則 orgTotal = Math.round(500×0.40×0.05) = 10，測試應在 10 ≠ 75 時 FAIL）
- **預期結果**：orgTotal = 75（含 LIST-A 全量）

---

## 七、後端 scope 隔離層（SCOPE，BR-12/13/14 / §17）【SECURITY-CRITICAL】

> **設計依據**：F049 §17 / BR-12 / BR-13 / BR-14；AD-E07-v3.6 §4（Guard 接線）/ §6（service scope filter 邏輯）；US-168 AC-2/AC-3/AC-6
>
> **安全性紅線**：TS-F049-SCOPE-002 是 **MUST-HAVE regression guard**——任何未來修改若導致非轄區部門資料出現在處長 response 中，此測試必須 FAIL。設計原則：assert response 物件中**完全不含** 非轄區 deptCode（非遮罩、非 null 值，而是完全不存在）。

---

### TS-F049-SCOPE-001：處長 scope=XVE1 → response 只含 XVE1 部門列（正向）

- **關聯需求**：F049 AC-SCOPE-2 / BR-13；US-168 AC-2；TC-168-02
- **測試類型**：Positive / Unit
- **測試層**：Unit（SQLite in-memory + mock getScopeDeptCode）
- **前置條件**：
  - SQLite seed：ob_dept_pct 含三部門 XVE1（40%）/ XVE2（35%）/ XVE3（25%）
  - ob_emphire：XVE1=27 人、XVE2=28 人、XVE3=22 人在職
  - actor mock：`{ userId: 'user-sc-01', businessRole: 'section_chief', role: 'user' }`
  - `getScopeDeptCode('user-sc-01')` mock → `'XVE1'`
  - 呼叫 `computeDeptEstimate('202605', { actor })`
- **步驟**：
  1. 驗證 `response.scope.scoped === true`
  2. 驗證 `response.scope.deptCode === 'XVE1'`
  3. 驗證 `response.departments.length === 1`
  4. 驗證 `response.departments[0].deptCode === 'XVE1'`
  5. 驗證工作日的 `deptCells.length === 1`
  6. 驗證 `deptCells[0].deptCode === 'XVE1'`
- **預期結果**：
  - departments 只有 XVE1；deptCells 只有 XVE1

---

### TS-F049-SCOPE-002：【SECURITY REGRESSION GUARD】處長 scope=XVE1 — XVE2/XVE3 完全不存在於 response

- **關聯需求**：F049 AC-SCOPE-2 / AC-SCOPE-3 / AC-SCOPE-6 / BR-13（「其他部門列完全不存在，非遮罩」）；I-DEPT-SCOPE-01；US-168 AC-6
- **測試類型**：Regression（Security）/ Unit
- **測試層**：Unit（SQLite in-memory）
- **前置條件**：同 TS-F049-SCOPE-001（三部門 seed）；actor scope = XVE1
- **步驟**：
  1. 取得完整 response JSON
  2. 將 response 序列化為字串：`const responseStr = JSON.stringify(response)`
  3. 驗證 `responseStr` **不含** `'XVE2'`（非轄區部門代號完全不出現）
  4. 驗證 `responseStr` **不含** `'XVE3'`
  5. 驗證 `responseStr` **不含** `'28'`（XVE2 的在職人數 28，不得洩漏）
  6. 驗證 `responseStr` **不含** `'22'`（XVE3 在職人數 22，不得洩漏）
  7. 驗證 `departments.every(d => d.deptCode === 'XVE1')` 為 true
  8. 對 `days` 每一天驗證 `deptCells.every(c => c.deptCode === 'XVE1')` 為 true
- **預期結果**：
  - JSON response 中完全不出現 XVE2 / XVE3 字串（含部門名稱、headcount、cases、perPerson）
  - **此 test 應在 scope filter 未正確套用時 FAIL**（不可偽造）

---

### TS-F049-SCOPE-003：處長 scope=null → HTTP 200 空結果 + SCOPE_UNRESOLVED warning（非 403/500）

- **關聯需求**：F049 AC-SCOPE-5 / BR-14；US-168 AC-5；TC-168-04；AD-E07-v3.6 §6
- **測試類型**：Negative / Unit
- **測試層**：Unit（mock getScopeDeptCode → null）
- **前置條件**：
  - actor mock：`businessRole='section_chief'`
  - `getScopeDeptCode(userId)` mock → `null`（email 對不上 ob_emphire）
- **步驟**：
  1. 呼叫 `computeDeptEstimate('202605', { actor })`
  2. 驗證**不拋出例外**（不 500）
  3. 驗證 response.departments === `[]`
  4. 驗證 `days[].deptCells` 每一天均為 `[]`（或整個 days 為空）
  5. 驗證 `warnings` 含 `{ code: 'SCOPE_UNRESOLVED' }`
  6. 驗證 response HTTP status 為 200（由 controller 測試確認）
- **預期結果**：
  - 正常回傳 200；departments 空；SCOPE_UNRESOLVED warning；不 crash

---

### TS-F049-SCOPE-004：部長 / admin → 所有部門可見，不套 scope filter

- **關聯需求**：F049 AC-SCOPE-4；BR-12；US-168 AC-4；TC-168-05
- **測試類型**：Positive / Unit
- **測試層**：Unit（SQLite in-memory）
- **前置條件**：
  - 三部門 seed（XVE1/XVE2/XVE3）
  - actor mock：`{ businessRole: 'director', role: 'user' }`
- **步驟**：
  1. 驗證 `response.scope.scoped === false`
  2. 驗證 `departments.length === 3`（全部門）
  3. 驗證 `deptCells.length === 3`（工作日）
  4. 驗證 departments 含 XVE1、XVE2、XVE3 三者
- **預期結果**：部長看全部門；scope.scoped=false

---

### TS-F049-SCOPE-005：後端 scope filter 為安全邊界 — 繞過前端仍只得轄區資料（AC-SCOPE-3）

- **關聯需求**：F049 AC-SCOPE-3 / BR-13；I-DEPT-SCOPE-01；US-168 AC-3；TC-168-03
- **測試類型**：Security / Unit（Controller 層）
- **測試層**：Unit（Controller + MockedService）
- **前置條件**：
  - Controller 以 `req.user = { businessRole: 'section_chief', userId: 'sc-01' }` 呼叫
  - service mock：`getScopeDeptCode('sc-01')` → `'XVE1'`
  - 嘗試在 query params 帶 `dept=XVE2`（即使 API 設計不接受此 param，驗證 scope 不被繞過）
- **步驟**：
  1. 直接呼叫 Controller 的 `deptEstimate` handler
  2. 驗證 service 的 `computeDeptEstimate` 被以含 `actor.businessRole='section_chief'` 的參數呼叫
  3. 驗證 service scope filter 結果：XVE2 不在 response
  4. **Logger 驗證**：確認 logger.log 含 `'section_chief scope applied dept_code=XVE1'`（AC-SCOPE-3 log 要求）
- **預期結果**：
  - XVE2 不在 response（不可透過 query params 繞過）
  - server log 有 scope 套用紀錄

---

### TS-F049-SCOPE-006：處長模式 orgTotal / deptAssignedTotal / gap 為 null（BR-13）

- **關聯需求**：F049 BR-13；AD-E07-v3.6 §4.3（處長模式：orgTotal=null, deptAssignedTotal=null, gap=null）
- **測試類型**：Positive / Unit
- **測試層**：Unit（SQLite in-memory）
- **前置條件**：actor scope=XVE1（section_chief）
- **步驟**：
  1. 驗證 `days[0].orgTotal === null`（工作日）
  2. 驗證 `days[0].deptAssignedTotal === null`
  3. 驗證 `days[0].gap === null`
  4. 驗證 `deptCells[0].cases` 為數字（部門件數仍正常計算）
- **預期結果**：
  - 處長看不到全部門合計（null 代替數字）
  - 部門自身件數仍正常

---

## 八、後端可行性層（FEAS，BR-15/16 / §18）

> **設計依據**：F049 §18.1 / §18.2 / BR-15 / BR-16；AD-E07-v3.6 §6（OQ-F049-06 裁定：全部在職，不過濾 jfun_nm）

---

### TS-F049-FEAS-001：正常人均計算 — per_person = round(cases ÷ headcount)（TC-169-01）

- **關聯需求**：F049 §18.1 / AC-FEAS-1 / BR-15；US-169 AC-1；TC-169-01
- **測試類型**：Positive / Unit
- **測試層**：Unit（SQLite in-memory）

**手算 oracle**：
```
D001.cases = 120, D001.active_headcount = 10
per_person = Math.round(120 / 10) = 12
```

- **前置條件**：
  - seed ob_emphire：D001 有 10 名 `resign_date IS NULL` 在職員工（含各種 jfun_nm，不限電訪職）
  - `computeDeptEstimate` 結果：D001 工作日 cases = 120
- **步驟**：
  1. 取得 deptCells[D001].perPerson
  2. 驗證 `perPerson === 12`
  3. 驗證 headcount 計算包含所有在職員工（不論 jfun_nm）
  4. 驗證休息日 D001 `perPerson === null`（非 0，不做除法）
- **預期結果**：
  - perPerson=12；休息日 null

---

### TS-F049-FEAS-002：headcount=0 → perPerson=null + DEPT_HEADCOUNT_ZERO warning（TC-169-02）

- **關聯需求**：F049 AC-FEAS-2 / BR-16；US-169 AC-2；TC-169-02；AD-E07-v3.6 §3.7
- **測試類型**：Negative / Unit
- **測試層**：Unit（SQLite in-memory）
- **前置條件**：
  - ob_emphire：D005 部門**無任何** `resign_date IS NULL` 員工（可能 ETL 未同步）
  - D005 在 ob_dept_pct 有比例設定（D005=50%）；list_total=1000；dpm=50‰
- **步驟**：
  1. 呼叫 `computeDeptEstimate`
  2. 驗證 D005 的 `cases = Math.round(1000×0.50×0.05) = 25`（件數正常計算）
  3. 驗證 D005 的 `perPerson === null`（不除零，不出 Infinity/NaN）
  4. 驗證 `warnings` 含 `{ code: 'DEPT_HEADCOUNT_ZERO', deptCode: 'D005' }`
  5. 驗證**不拋例外**（頁面不 crash）
  6. 其他有 headcount 的部門 perPerson 正常（contrast）
- **預期結果**：
  - D005.perPerson=null；DEPT_HEADCOUNT_ZERO warning；其他部門不受影響

---

### TS-F049-FEAS-003：per_person 超門檻 → overThreshold=true（TC-169-03）

- **關聯需求**：F049 AC-FEAS-3；US-169 AC-3；TC-169-03；AD-E07-v3.6 §3（env var `STAGE0_MAX_CASES_PER_PERSON_PER_DAY`）
- **測試類型**：Positive / Unit
- **測試層**：Unit（mock env var）

**手算 oracle**：
```
D002.cases = 200, headcount = 10
per_person = Math.round(200/10) = 20
threshold = 15（env var）
20 > 15 → overThreshold = true
```

- **前置條件**：
  - env `STAGE0_MAX_CASES_PER_PERSON_PER_DAY=15`
  - D002：cases=200（透過 list_total/ration/dpm 計算出），headcount=10
- **步驟**：
  1. 驗證 `response.threshold === 15`
  2. 驗證 D002 `perPerson === 20`
  3. 驗證 D002 `overThreshold === true`
- **預期結果**：
  - threshold=15；perPerson=20>15 → overThreshold=true

---

### TS-F049-FEAS-004：threshold=null（env 未設定）→ overThreshold=false，不 crash（TC-169-05）

- **關聯需求**：F049 AC-FEAS-4；US-169 AC-4；TC-169-05；AD-E07-v3.6 §3 OQ-F049-03
- **測試類型**：Negative / Unit
- **測試層**：Unit（env var 未設定）
- **前置條件**：`STAGE0_MAX_CASES_PER_PERSON_PER_DAY` 未設定（預設 null）
- **步驟**：
  1. 呼叫 `computeDeptEstimate`
  2. 驗證 `response.threshold === null`
  3. 驗證所有 deptCells 的 `overThreshold === false`（無紅色警示）
  4. 驗證**不拋例外**
- **預期結果**：threshold=null；overThreshold 恆 false；不 crash

---

### TS-F049-FEAS-005：headcount 查詢使用 TRIM(dept_code)（SQLite/PG 移植性）

- **關聯需求**：F049 §18.1；AD-E07-v3.6 §8 TRIM 注意事項；OQ-167-03（代號空間）
- **測試類型**：Positive / Unit（SQLite 移植性）
- **測試層**：Unit（SQLite in-memory）
- **前置條件**：
  - ob_emphire seed：dept_code 含尾端空白 `'XVE1 '`（varchar 尾白）；5 名在職
  - ob_dept_pct：`obdeptid='XVE1'`（無空白）
- **步驟**：
  1. 驗證 headcount 查詢以 `TRIM(dept_code)` 分組
  2. 驗證 XVE1 的 `activeHeadcount === 5`（空白被 TRIM 後正確比對）
  3. 驗證 perPerson 計算正常（非 null）
- **預期結果**：
  - 尾白不影響 headcount 計數（TRIM 生效）
  - SQLite 與 PG 均應通過此測試

---

### TS-F049-FEAS-006：處長 scope 下 headcount 僅計其轄區（US-169 AC-5）

- **關聯需求**：F049 §18.1（處長 scope）/ AC-FEAS-1；US-169 AC-5；BR-12
- **測試類型**：Positive / Unit
- **測試層**：Unit（SQLite in-memory）
- **前置條件**：
  - ob_emphire：XVE1=10 人、XVE2=5 人在職
  - 處長 actor scope = XVE1
- **步驟**：
  1. 驗證 `departments[0].activeHeadcount === 10`（僅 XVE1）
  2. 驗證 XVE2 不在 departments（scope 隔離一致）
  3. 驗證 XVE1 perPerson 以 10 人為分母
- **預期結果**：scope filter 對 headcount 查詢一致（不洩漏 XVE2 的 5 人資訊）

---

## 九、後端不變量（INVAR，I-RUN-EST-01 / §22.1）

> **設計依據**：F049 §22.1 I-RUN-EST-01；AD-E07-v3.6 §7；AD-E07-29 §3.4

---

### TS-F049-INVAR-001：computeDeptEstimate 使用 computeWorkingDayRatios 輸出（不分叉）

- **關聯需求**：F049 §22.1 I-RUN-EST-01；AD-E07-v3.6 §7（三消費者共用單一函式）
- **測試類型**：Positive（不變量）/ Unit
- **測試層**：Unit（spy 驗證）
- **前置條件**：spy `Stage0EstimateService.computeWorkingDayRatios`
- **步驟**：
  1. 呼叫 `computeDeptEstimate('202605', { calendarSource: 'weekday' })`
  2. 驗證 `computeWorkingDayRatios` **被呼叫**（spy call count ≥ 1）
  3. 取得 spy 回傳的 `ratios[]`（每日千分位）
  4. 驗證 `days[].isWorkday` 與 `ratios` 的工作日清單一致（同一 calendar 結果）
  5. **Regression guard**（靜態）：grep `computeDeptEstimate` 的實作，確認不含 `FLOOR(1000 /`、`1000 %`、`ORDER BY calendar_date DESC` 等 ratio 計算邏輯（該邏輯應只在 `computeWorkingDayRatios` 中）
- **預期結果**：
  - computeWorkingDayRatios 被呼叫（非跳過）
  - computeDeptEstimate 不自己重算 ratio

---

### TS-F049-INVAR-002：list_total 來自 stage0_estimate_count（F088 物化）或 fallback estimateListCount（同源）

- **關聯需求**：F049 §22.1 I-RUN-EST-01（list_total 與月名單分派 Stage 1 同源）；AD-E07-v3.6 §5 階段 A
- **測試類型**：Positive（不變量）/ Unit（兩個子場景）
- **測試層**：Unit（SQLite in-memory）

**子場景 2a：stage0_estimate_count 已物化 → primary source**
- **前置條件**：ob_list_definition.stage0_estimate_count = 8500（非 NULL）
- **步驟**：
  1. spy `estimateListCount`（fallback 函式）
  2. 呼叫 `computeDeptEstimate`
  3. 驗證 `estimateListCount` **未被呼叫**（spy call count = 0）
  4. 驗證 dept 計算使用 8500 作為 list_total
- **預期結果**：物化值優先，不觸發 fallback

**子場景 2b：stage0_estimate_count IS NULL → fallback estimateListCount**
- **前置條件**：ob_list_definition.stage0_estimate_count = NULL
- **步驟**：
  1. spy `estimateListCount` mock → return 7000
  2. 呼叫 `computeDeptEstimate`
  3. 驗證 `estimateListCount` **被呼叫**（spy call count ≥ 1）
  4. 驗證 dept 計算使用 7000 作為 list_total
- **預期結果**：fallback 觸發；使用 estimateListCount 回傳值

---

## 十、後端邊緣案例（EDGE，§22.2）

---

### TS-F049-EDGE-001：某份名單 fallback 逾時 → STAGE0_LIST_ESTIMATE_PARTIAL warning，其他名單正常

- **關聯需求**：F049 §22.2；AD-E07-v3.6 §5 OQ-F049-02（fallback timeout per-list 不阻擋整體）
- **測試類型**：Negative / Unit
- **測試層**：Unit（mock estimateListCount）
- **前置條件**：
  - 三份名單：LIST-A（stage0_estimate_count=1000 物化）、LIST-B（NULL → fallback）、LIST-C（stage0_estimate_count=500 物化）
  - `estimateListCount('LIST-B')` mock → timeout（超過 30s timeout）
  - `STAGE0_DEPT_ESTIMATE_TIMEOUT_MS=30000`
- **步驟**：
  1. 呼叫 `computeDeptEstimate`（並行 fallback，LIST-B 超時）
  2. 驗證 response 正常回傳（不 throw）
  3. 驗證 `warnings` 含 `{ code: 'STAGE0_LIST_ESTIMATE_PARTIAL', listNo: 'LIST-B' }`
  4. 驗證 dept 計算正常使用 LIST-A（1000）+ LIST-C（500）= 1500 合計（LIST-B 排除）
  5. 驗證 `orgTotal = Math.round(1500 × dpm/1000)`（LIST-B 不納入）
- **預期結果**：
  - LIST-B 逾時被排除；其他名單正常計算；warnings 記錄 PARTIAL

---

### TS-F049-EDGE-002：0 筆 active 名單 → departments=[] / days[].deptCells=[] / 無 warnings

- **關聯需求**：F049 AC-AGG-3；§22.2 邊緣案例（當月 0 筆 active 名單）
- **測試類型**：Negative / Unit
- **測試層**：Unit（SQLite in-memory：ob_list_definition 空或全 inactive）
- **前置條件**：ob_list_definition 無任何 `status='active'` 列
- **步驟**：
  1. 呼叫 `computeDeptEstimate('202605')`
  2. 驗證 `departments === []`
  3. 驗證 `days` 中每一天 `deptCells === []`
  4. 驗證 `mode === 'aggregated'`
  5. 驗證 `warnings` 不含 DEPT_HEADCOUNT_ZERO 或 SCOPE_UNRESOLVED（空名單時無此警告）
- **預期結果**：空結果；無警告；不 crash

---

### TS-F049-EDGE-003：處長轄區 obdeptid 在該名單 ob_dept_pct 無比例設定 → 部門列為空、gap=org_total

- **關聯需求**：F049 §22.2（「處長轄區某 obdeptid 在 ob_dept_pct 無該名單比例」）；BR-13
- **測試類型**：Negative / Unit
- **測試層**：Unit（SQLite in-memory）
- **前置條件**：
  - actor scope=XVE1
  - 當月名單：LIST-A 的 ob_dept_pct 僅有 XVE2=50%，XVE1 無設定
  - list_total=1000；dpm=50‰
- **步驟**：
  1. 驗證 `deptCells === []`（XVE1 無比例 → 不顯示）
  2. 由於處長模式 orgTotal=null，驗證 response.days[0].orgTotal === null
  3. 驗證 `warnings` 無 SCOPE_UNRESOLVED（scope 已解析成功）
- **預期結果**：
  - 處長看到空 deptCells（自己轄區在該名單無比例）
  - 不 crash；不出現 XVE2 資料

---

## 十一、前端聚合層元件（AGG，US-166）

> **測試策略**：RTL + MSW；stub `GET /api/v1/assignment/stage0/dept-estimate` 回傳部門矩陣；目標元件 `Stage0EstimatePage`（v2.0 重設計版）。

---

### TS-F049-AGG-001：頁面預設進入全名單彙總模式（TC-166-01）

- **關聯需求**：F049 AC-AGG-1；US-166 AC-1；TC-166-01
- **測試類型**：Positive / Component（RTL + MSW）
- **測試層**：Component
- **前置條件**：
  - MSW stub `GET /api/v1/assignment/stage0/dept-estimate?ym=202605` → aggregated 模式 response（含 3 部門）
  - MSW stub lists → 3 筆 active 名單
- **步驟**：
  1. render `<Stage0EstimatePage />`
  2. 等待 dept-estimate 請求完成（`waitFor`）
  3. 驗證頁面標示「所有啟用名單彙總」或等效業務文案（`data-testid="mode-indicator"`）
  4. 驗證名單篩選下拉包含「全部名單」選項且為選中狀態
  5. 驗證部門矩陣顯示 3 個部門列
- **預期結果**：
  - 預設全名單彙總；mode indicator 顯示；部門矩陣正確

---

### TS-F049-AGG-002：切換至單一名單鑽探 → mode 更新、deptCells 更新（TC-166-02）

- **關聯需求**：F049 AC-AGG-2；US-166 AC-2 / AC-3；TC-166-02
- **測試類型**：Positive / Component（RTL + MSW）
- **測試層**：Component
- **前置條件**：
  - MSW stub dept-estimate：aggregated 模式 D001=100 件；single-list LIST-B 模式 D001=40 件
- **步驟**：
  1. 初載 aggregated，驗證 D001 件數 = 100
  2. 選取 LIST-B → 驗證 API 被以 `listNo=LIST-B` 重呼叫
  3. 驗證 mode indicator 更新為「單一名單 LIST-B」
  4. 驗證 D001 件數更新為 40
  5. 切回「全部名單」→ 驗證回 aggregated（D001=100）
- **預期結果**：
  - 切換後 mode indicator 更新；deptCells 數值更新；切回正確回 aggregated

---

### TS-F049-AGG-003：0 active 名單 → 空狀態文案 / 所有欄「—」（TC-166-03）

- **關聯需求**：F049 AC-AGG-3；US-166 AC-4；TC-166-03
- **測試類型**：Negative / Component（RTL + MSW）
- **測試層**：Component
- **前置條件**：
  - MSW stub dept-estimate → `departments: [], days: []`（空結果）
  - MSW stub lists → 空陣列
- **步驟**：
  1. render `<Stage0EstimatePage />`
  2. 驗證空狀態文案出現（「本月尚無啟用名單」或等效）
  3. 驗證所有估算欄顯示「—」
  4. 驗證無任何數字渲染
- **預期結果**：空狀態文案；所有欄「—」

---

### TS-F049-AGG-004：估算完成不寫入 DB（TC-166-04 / AC-AGG-5）

- **關聯需求**：F049 AC-AGG-5 / BR-1；US-166 AC-6；TC-166-04
- **測試類型**：Positive / Unit（Service 層）
- **測試層**：Unit（SQLite in-memory，spy DB write methods）
- **前置條件**：spy `ObPoolDataList` repository `save`/`insert`；spy `AssignmentRun` repository write；`computeDeptEstimate` 正常執行
- **步驟**：
  1. 呼叫 `computeDeptEstimate`
  2. 驗證 `ObPoolDataList.save/insert` **未被呼叫**（spy call count = 0）
  3. 驗證 `AssignmentRun` 相關 write **未被呼叫**
  4. 驗證 ob_list_definition `stage0_estimate_count` 欄位未被更新（唯讀）
- **預期結果**：整個 computeDeptEstimate 為純讀操作，不寫任何表

---

### TS-F049-AGG-005：月份切換 → 以新月份重新 fetch dept-estimate

- **關聯需求**：F049 AC-AGG-4；US-166 AC-5
- **測試類型**：Positive / Component（RTL + MSW）
- **測試層**：Component
- **前置條件**：
  - MSW stub dept-estimate `ym=202605` → 30 件；`ym=202606` → 45 件
- **步驟**：
  1. 初載 202605，驗證某部門件數 = 30
  2. 觸發月份切換至 202606
  3. 等待新 fetch 完成
  4. 驗證 dept-estimate API 以 `ym=202606` 重呼叫
  5. 驗證部門件數更新為 45
- **預期結果**：月份切換觸發重算；數據完整更新

---

## 十二、前端部門矩陣元件（FE，US-167/168/169）

---

### TS-F049-FE-001：部門矩陣渲染 — 部門列 / 人均欄 / org_total 合計列 / gap 橘色徽章

- **關聯需求**：F049 AC-DEPT-1 / AC-GAP-1 / AC-FEAS-1；US-167 AC-1 / AC-3；US-169 AC-1
- **測試類型**：Positive / Component（RTL + MSW）
- **測試層**：Component
- **前置條件**：
  - MSW stub dept-estimate → 工作日含：
    - deptCells: `[{ deptCode: 'D001', cases: 120, perPerson: 12, overThreshold: false }]`
    - orgTotal: 200, deptAssignedTotal: 120, gap: 80
- **步驟**：
  1. 驗證 D001 部門列存在（`data-testid="dept-row-D001"`）
  2. 驗證 D001 件數 = 120（`data-testid="cases-D001"`）
  3. 驗證 D001 人均件數 = 12（`data-testid="per-person-D001"`）
  4. 驗證 org_total 合計列顯示 200
  5. 驗證 gap 橘色徽章顯示「尚有 80 件未分派到部門」（gap > 0）
- **預期結果**：矩陣正確渲染；gap 橘色標示

---

### TS-F049-FE-002：gap=0 → 缺口列不渲染（AC-GAP-2）

- **關聯需求**：F049 AC-GAP-2；US-167 AC-2
- **測試類型**：Positive / Component（RTL + MSW）
- **測試層**：Component
- **前置條件**：MSW stub dept-estimate → gap: 0
- **步驟**：
  1. 驗證 `data-testid="gap-row"` **不存在**（`=== null`）
- **預期結果**：gap=0 時缺口列完全不渲染（DOM 不存在）

---

### TS-F049-FE-003：處長唯讀 banner — scope=XVE1，不含 orgTotal 合計列

- **關聯需求**：F049 AC-SCOPE-1 / BR-13；US-168 AC-1 / AC-2；TC-168-01
- **測試類型**：Positive / Component（RTL + MSW）
- **測試層**：Component
- **前置條件**：
  - MSW stub dept-estimate → `scope: { role: 'section_chief', deptCode: 'XVE1', scoped: true }`；`departments: [{deptCode:'XVE1'}]`；`days[0].orgTotal: null`
- **步驟**：
  1. 驗證唯讀 banner 出現（`data-testid="section-chief-readonly-banner"`）
  2. 驗證 banner 含「唯讀模式」或「您轄區部門」文案
  3. 驗證「全部門合計」列**不存在**（`data-testid="org-total-row"` === null）
  4. 驗證 XVE1 部門列正常顯示
  5. 驗證**無**可修改設定的操作按鈕
- **預期結果**：
  - 唯讀 banner 顯示；全部門合計列不渲染；XVE1 資料正常

---

### TS-F049-FE-004：處長 scope=null → 友善提示訊息，數值顯示「—」（TC-168-04）

- **關聯需求**：F049 AC-SCOPE-5；US-168 AC-5；TC-168-04
- **測試類型**：Negative / Component（RTL + MSW）
- **測試層**：Component
- **前置條件**：
  - MSW stub dept-estimate → `departments: [], warnings: [{ code: 'SCOPE_UNRESOLVED', message: '...' }]`
- **步驟**：
  1. 驗證友善提示訊息出現（「無法識別您的轄區部門」或等效文案）
  2. 驗證所有估算欄顯示「—」
  3. 驗證頁面不 crash（no error boundary）
- **預期結果**：友善提示；「—」顯示；不 crash

---

### TS-F049-FE-005：overThreshold=true → 人均欄紅色顯示 + 提示文字

- **關聯需求**：F049 AC-FEAS-3；US-169 AC-3；TC-169-03
- **測試類型**：Positive / Component（RTL + MSW）
- **測試層**：Component
- **前置條件**：
  - MSW stub dept-estimate → `threshold: 15`；D002 deptCells: `{ perPerson: 20, overThreshold: true }`
- **步驟**：
  1. 找到 D002 人均欄（`data-testid="per-person-D002"`）
  2. 驗證欄位含紅色 class（`bg-red-*` 或 `text-red-*`）
  3. 驗證提示文字含「超過每人每日上限 15 件」
- **預期結果**：紅色標示 + 提示文字

---

### TS-F049-FE-006：派案日曆下拉切換功能正常（TERM-3 functional，AC-TERM-3）

- **關聯需求**：F049 AC-TERM-3；US-170 AC-7；TC-170-04（功能不變）
- **測試類型**：Positive / Component（RTL + MSW）
- **測試層**：Component
- **前置條件**：
  - MSW stub dept-estimate 根據 `calendarSource` 回傳不同 `deptCells.cases`（weekday=100；all=130）
- **步驟**：
  1. 找到「派案日曆」下拉（非「工作日來源」，TERM 已清理標籤）
  2. 驗證選項含業務語言標籤（「只排上班日」/ 「也排連假日」/ 「連週末都排」）
  3. 切換至「連週末都排」（all）
  4. 驗證 dept-estimate API 被以 `calendarSource=all` 重呼叫
  5. 驗證 deptCells.cases 更新為 130（功能行為不變）
- **預期結果**：業務標籤顯示；切換後 API 重呼叫；結果更新

---

## 十三、前端術語清理（TERM，US-170 / §19）

> **設計依據**：F049 §19.1 黑名單 / §19.2 移除元件 / §19.3 業務語言替代；US-170 AC-1~8；TC-170-01~05
>
> **測試重點**：TC-170-01（DOM 全文掃描）為自動化 regression test，**必須持續運行**以防術語反向污染。

---

### TS-F049-TERM-001：DOM 全文掃描 — §19.1 黑名單字串均不出現（TC-170-01 / AC-TERM-1）

- **關聯需求**：F049 §19.1 / AC-TERM-1；US-170 AC-1/2/3；TC-170-01
- **測試類型**：Regression / Component（RTL + MSW）
- **測試層**：Component（全頁掃描）
- **前置條件**：
  - render `<Stage0EstimatePage />` 於彙總模式
  - MSW stub dept-estimate → 完整 response（含 warnings / gap / threshold 等）
  - MSW stub pool-warn → poolCount < threshold（觸發 pool 警示）

**黑名單掃描項目（§19.1）**：
```
const BLACKLIST = [
  'rest_flg', 'rest_flg=0',
  'base ratio', 'base+1', 'base+1（餘數補）', 'ratioPerMille',
  'remainder', '餘數',
  'ob_assign_set', 'ob_pool_data', 'ob_pool_data_list', 'OBPOOLDATA',
  'STAGE0_POOL_WARN_THRESHOLD', 'calendar_date',
  'AD-E07-8', 'AD-E07-29',
  'GET /api/v1/',
];
```

- **步驟**：
  1. render 完整頁面，等待所有 MSW 回應完成
  2. 取得 `document.body.textContent`（可見文字）
  3. 對每個 `BLACKLIST` 項目驗證：`bodyTextContent.includes(term) === false`
  4. 附加：掃描所有 `aria-label`、`title`、`placeholder` 屬性（tooltip / hint 區域）
  5. 驗證所有 data-testid 屬性中無技術術語洩漏（data attributes 不算可見文字，但防止 debug 字串滲入）
- **預期結果**：
  - BLACKLIST 所有項目均不出現於可見文字
  - **此為持續性 regression guard**：任何後續修改若重新引入技術術語，此測試 FAIL

---

### TS-F049-TERM-002：KPI 區無 base ratio / remainder 卡片（TC-170-02 / AC-TERM-2）

- **關聯需求**：F049 §19.2 / AC-TERM-2；US-170 AC-4；TC-170-02
- **測試類型**：Regression / Component（RTL）
- **測試層**：Component
- **步驟**：
  1. render `<Stage0EstimatePage />`
  2. 驗證 KPI 區域**不含**標題為 `base ratio`、`base (‰)`、`remainder 餘數`、`餘數` 的卡片元素
  3. 驗證 `document.body.textContent` 不含 `'base ratio'`、`'remainder'`
- **預期結果**：base ratio / remainder KPI 卡片已移除

---

### TS-F049-TERM-003：每日列無 base+1 徽章 / 工作日顯示「工作日」/ 休息日顯示「休息日（不派案）」（TC-170-03 / AC-TERM-2 / AC-TERM-1）

- **關聯需求**：F049 §19.3 / AC-TERM-2；US-170 AC-4/5；TC-170-03
- **測試類型**：Regression / Component（RTL + MSW）
- **測試層**：Component
- **前置條件**：MSW stub dept-estimate → 含工作日與休息日
- **步驟**：
  1. 驗證工作日列的日別欄含「工作日」（不含 `rest_flg=0`）
  2. 驗證休息日列的日別欄含「休息日（不派案）」（不含「跳過」或 `N (週末·國定假日)`）
  3. 驗證**不存在**含 `base+1` 或 `餘數補` 的徽章元素
  4. bar chart 圖例：驗證圖例**不含**「工作日 base」/ 「工作日 base+1（餘數補）」（改為單一「工作日」圖例）
- **預期結果**：
  - 日別標籤業務化；base+1 徽章不存在

---

### TS-F049-TERM-004：Pool 偏低警示為業務語言（TC-170-05 / AC-TERM-4）

- **關聯需求**：F049 §19.3 / AC-TERM-4；US-170 AC-8；TC-170-05
- **測試類型**：Positive / Component（RTL + MSW）
- **測試層**：Component
- **前置條件**：
  - MSW stub dept-estimate → `poolCount: 500`（< 預設 threshold 1000）；`poolWarning: 'POOL_COUNT_LOW'`
- **步驟**：
  1. 等待橘色警示橫幅出現
  2. 驗證警示文字含「筆」或「筆數偏低」業務文案
  3. 驗證警示文字**不含** `OBPOOLDATA`、`STAGE0_POOL_WARN_THRESHOLD`、`ob_pool_data`
  4. 驗證警示文字含數字（poolCount 的實際數值）
- **預期結果**：業務語言警示；無技術術語

---

### TS-F049-TERM-005：AD-E07-8 公式框不顯示（AC-TERM-2 / US-170 AC-2）

- **關聯需求**：F049 §19.2 / AC-TERM-2；US-170 AC-2
- **測試類型**：Regression / Component（RTL）
- **測試層**：Component
- **步驟**：
  1. render `<Stage0EstimatePage />`
  2. 驗證頁面**不含** `FLOOR(1000 / working_days)` 文字
  3. 驗證頁面**不含** `1000 mod working_days` 文字
  4. 驗證頁面**不含** `round(ratioPerMille / 1000` 文字
  5. 驗證頁面**不含** `AD-E07-8` 字串
- **預期結果**：演算法公式框完全不顯示

---

## 自動化就緒度總覽（v2.0 新增）

| 群組 | 案例數 | 自動化適合度 | 測試層 | DB 需求 |
|---|---|---|---|---|
| TS-F049-DEPT-001~004 | 4 | 高 | Unit（SQLite）| SQLite in-memory |
| TS-F049-GAP-001~006 | 6 | 高 | Unit（SQLite）| SQLite in-memory |
| TS-F049-SCOPE-001 | 1 | 高 | Unit（SQLite + mock）| SQLite in-memory |
| TS-F049-SCOPE-002（Security Regression）| 1 | 高 | Unit（SQLite + mock）| SQLite in-memory |
| TS-F049-SCOPE-003~006 | 4 | 高 | Unit | SQLite / mock |
| TS-F049-FEAS-001~006 | 6 | 高 | Unit（SQLite）| SQLite in-memory |
| TS-F049-INVAR-001~002 | 2 | 高 | Unit（spy）| SQLite in-memory |
| TS-F049-EDGE-001~003 | 3 | 高 | Unit（mock / SQLite）| SQLite in-memory |
| TS-F049-AGG-001~005 | 5 | 高 | Component（RTL + MSW）| 無（MSW stub）|
| TS-F049-FE-001~006 | 6 | 高 | Component（RTL + MSW）| 無（MSW stub）|
| TS-F049-TERM-001~005 | 5 | 高 | Component（RTL）| 無（MSW stub）|
| **v2.0 合計** | **43** | — | — | — |

> **PostgreSQL TestContainer 不需求**：AD-E07-v3.6 §5 裁定部門投影為 in-memory 計算（JS Math.round），`TRIM(dept_code)` 在 SQLite/PG 均支援。唯一需 PG 的操作（EXTRACT DOW for `weekday-only` calendarSource）已由既有 TS-F049-CAL-002 覆蓋，不在 v2.0 新增範圍。
>
> **SCOPE-002 為 MUST-RUN**：此測試不得設為 skip 或 pending；任何修改應確保此測試維持綠燈。

---

## AC ↔ 測試場景追溯矩陣（v2.0）

| AC / BR | 說明 | 測試場景 |
|---|---|---|
| AC-AGG-1 | 預設全名單彙總模式 | TS-F049-AGG-001 |
| AC-AGG-2 | 切換至單一名單 / 切回 | TS-F049-AGG-002、TS-F049-DEPT-004 |
| AC-AGG-3 | 0 active 名單空狀態 | TS-F049-AGG-003、TS-F049-EDGE-002 |
| AC-AGG-4 | 月份切換重算 | TS-F049-AGG-005 |
| AC-AGG-5 / BR-1 | 唯讀不寫入 | TS-F049-AGG-004 |
| AC-DEPT-1 | 部門件數顯示 | TS-F049-DEPT-001、TS-F049-FE-001 |
| AC-DEPT-2 | 未設比例部門不顯示 | TS-F049-GAP-001、TS-F049-GAP-003 |
| AC-GAP-1 | gap>0 缺口標示 | TS-F049-GAP-001、TS-F049-GAP-002、TS-F049-FE-001 |
| AC-GAP-2 | gap=0 不顯示缺口列 | TS-F049-GAP-004、TS-F049-FE-002 |
| AC-GAP-3 / BR-11 | 未達 100% 統一為 gap | TS-F049-GAP-002 |
| AC-SCOPE-1 | 處長可進入（200）| TS-F049-SCOPE-001、TS-F049-FE-003 |
| AC-SCOPE-2 / BR-13 | 處長只見轄區 | TS-F049-SCOPE-001、TS-F049-SCOPE-002、TS-F049-FE-003 |
| AC-SCOPE-3 / I-DEPT-SCOPE-01 | 後端為安全邊界 | TS-F049-SCOPE-002、TS-F049-SCOPE-005 |
| AC-SCOPE-4 | 部長/admin 不受限 | TS-F049-SCOPE-004 |
| AC-SCOPE-5 / BR-14 | scope=null 友善降級 | TS-F049-SCOPE-003、TS-F049-FE-004 |
| AC-FEAS-1 / BR-15 | 人均件數顯示 | TS-F049-FEAS-001、TS-F049-FE-001 |
| AC-FEAS-2 / BR-16 | headcount=0 不 crash | TS-F049-FEAS-002 |
| AC-FEAS-3 | 超門檻紅色警示 | TS-F049-FEAS-003、TS-F049-FE-005 |
| AC-FEAS-4 | 門檻未設定降級 | TS-F049-FEAS-004 |
| AC-TERM-1 / §19.1 | DOM 黑名單掃描 | TS-F049-TERM-001 |
| AC-TERM-2 / §19.2 | 移除 base/remainder KPI / base+1 徽章 | TS-F049-TERM-002、TS-F049-TERM-003、TS-F049-TERM-005 |
| AC-TERM-3 | 派案日曆功能不變 | TS-F049-FE-006 |
| AC-TERM-4 | Pool 警示業務語言 | TS-F049-TERM-004 |
| BR-7 | 預設全名單彙總 | TS-F049-AGG-001 |
| BR-8 | per-list ration 來自 ob_dept_pct | TS-F049-DEPT-001、TS-F049-DEPT-003 |
| BR-9 | org_total 不依賴比例 | TS-F049-GAP-006 |
| BR-10 | gap = org_total − Σ dept；gap≥0 | TS-F049-GAP-001~005 |
| BR-11 | 未達 100% 統一為 gap | TS-F049-GAP-002 |
| BR-12 | 處長唯讀 + service scope filter | TS-F049-SCOPE-001~005 |
| BR-13 | 處長 response 只含轄區（非遮罩）| TS-F049-SCOPE-002、TS-F049-SCOPE-006 |
| BR-14 | scope=null → 200 空結果 | TS-F049-SCOPE-003、TS-F049-FE-004 |
| BR-15 | 人均 = round(cases÷headcount) | TS-F049-FEAS-001~003 |
| BR-16 | DEPT_HEADCOUNT_ZERO / SCOPE_UNRESOLVED warnings | TS-F049-FEAS-002、TS-F049-SCOPE-003 |
| I-RUN-EST-01 | 不分叉 computeWorkingDayRatios | TS-F049-INVAR-001 |
| I-DEPT-SCOPE-01 | scope filter 在 service 層強制 | TS-F049-SCOPE-002、TS-F049-SCOPE-005 |
| I-DEPT-ORDER-01 | deptCells 依 deptCode ASC | TS-F049-DEPT-001 |
| §22.2 邊緣：0 active 名單 | 空結果 | TS-F049-EDGE-002 |
| §22.2 邊緣：無 ob_dept_pct | gap = org_total | TS-F049-GAP-003 |
| §22.2 邊緣：partial fallback timeout | STAGE0_LIST_ESTIMATE_PARTIAL | TS-F049-EDGE-001 |
| §22.2 邊緣：rest day | deptCells=[], orgTotal=0 | TS-F049-DEPT-002 |
| §22.2 邊緣：headcount=0 | perPerson=null | TS-F049-FEAS-002 |
| §22.2 邊緣：threshold=null | overThreshold=false | TS-F049-FEAS-004 |
| §22.2 邊緣：scope=null | 200 空 + SCOPE_UNRESOLVED | TS-F049-SCOPE-003 |
| §22.2 邊緣：處長轄區無比例 | deptCells=[] | TS-F049-EDGE-003 |
