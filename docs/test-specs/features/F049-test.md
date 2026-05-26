---
type: test-design-feature
feature_id: F049
feature_name: Stage 0 每日分派數量估算（v1.2）
priority: P0-MVP
related_spec: /docs/specs/features/F049-stage0-daily-estimate.md
spec_version: "1.2"
covers:
  - F049
  - US-071
  - US-132
date: 2026-05-21
last_updated: 2026-05-26
---

# F049：Stage 0 每日分派數量估算（v1.2）— 測試設計

> **v1.2 測試設計追加（2026-05-26）**：新增「後端 Stage 0 per-list 試算篩選邏輯」案例群組（TS-F049-EST-001 ~ TS-F049-EST-009），驗證 `estimateListCount` / `buildPoolCountQuery` 修正後行為 —— 改為複用月跑 Stage 1 之 `buildStage1WhereConditions()` 演算法，確保 `IN` 多值、欄位映射（caseyear → year_cnt、case_status → list_type）、wildcard、EMPTY_CONDITIONS 均正確，並保留原有 404 / 逾時 regression 驗證。詳見 F049 v1.2 AC-4 篩選機制對照表 / BR-5 / §7。
>
> **v1.1 測試設計範圍（2026-05-21）**：本文件覆蓋 F049 v1.1 核心變更 —— Ready 欄頂 CTA Banner 為 Stage 0 試算頁（secondary「試算」按鈕）之唯一入口（GAP-G3 / US-132）。
> v1.0 既有估算邏輯（GET API / 估算公式 / 試算逾時 / Pool 警示門檻）之業務邏輯不在 v1.1 變更範圍內；如需驗證業務邏輯，對應測試見既有 F049 後端 Unit / Integration test。
> 本文件新增 5 個 CTA Banner 入口場景，均為前端 Component 層測試。

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer（後端） | 本文件 + `F049-stage0-daily-estimate.md` v1.2 + `stage1-query-composer.ts`（`buildStage1WhereConditions` 演算法）+ `error-handling.md#assignment-errors` |
| TDD Developer（前端） | 本文件 + `F049-stage0-daily-estimate.md` v1.1 + `F061-trigger-assignment-run.md` v1.4（§9 CTA Banner spec）+ `F048-view-list-definition.md` v2.0 |
| QA / Tester | 本文件 + `error-handling.md#assignment-errors` |

---

## 測試策略概覽

| 項目 | 說明 |
|---|---|
| 主要測試層（前端） | 前端 Component（React Testing Library）；Stage 0 CTA Banner 渲染於 F048 Kanban 主頁的 Ready 欄頂 |
| 測試檔案（前端） | `apps/web/src/pages/assignment/__tests__/list-kanban-page.test.tsx`（追加 CTA 群組）或獨立 `ready-cta-banner.test.tsx` |
| 主要測試層（後端） | 後端 Unit（SQLite in-memory + TypeORM + Vitest）；整合層（PostgreSQL TestContainer）|
| 測試檔案（後端） | `apps/api/src/modules/assignment-list/__tests__/stage0-estimate.service.spec.ts`（追加 EST 群組）|
| 關鍵依賴（前端） | MSW stub `GET /api/v1/assignment/lists` 回 `stageCounts.ready`；MSW stub assignment_run 狀態 |
| 關鍵依賴（後端） | `buildStage1WhereConditions()` 純函式（`stage1-query-composer.ts`）直接呼叫驗證輸出；`Stage0EstimateService` 以 SQLite in-memory 驗證 COUNT 結果 |
| Mock 資料注意（前端） | `stage` 欄位值用 PG ENUM 小寫 snake_case；`status` 用 `'running'`/`'pending'`/`'idle'` |
| Mock 資料注意（後端） | `caseyear` legacy 欄位為字串型別；`condition_payload` 為 JSONB；`year_cnt` 為整數欄位（必須與 caseyear 4 位數西元年欄位區分）|

### 後端案例群組自動化就緒度

| 群組 | 案例數 | 自動化適合度 | 測試層 | 說明 |
|---|---|---|---|---|
| TS-F049-EST-001~002 | 2 | 高 | Unit | `buildStage1WhereConditions` 純函式；無需 DB，直接驗證回傳 fragment |
| TS-F049-EST-003~006 | 4 | 高 | Unit | 同上；caseyear → year_cnt 映射、wildcard、EMPTY_CONDITIONS、case_status → list_type |
| TS-F049-EST-007 | 1 | 高 | Unit | numeric BETWEEN / date BETWEEN fragment 驗證 |
| TS-F049-EST-008 | 1 | 高 | Unit | 路徑 B legacy fallback；SQLite in-memory seed + COUNT 驗證 |
| TS-F049-EST-009 | 1 | 高 | Unit | 404 / timeout regression；現有測試架構延伸 |
| TS-F049-EST-010 | 1 | 低（需真實 DB）| Integration | 真實 ob_pool_data 比對 COUNT ≈ 241,978；CI 需 PostgreSQL TestContainer |

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
