---
type: test-design-feature
feature_id: F049
feature_name: Stage 0 每日分派數量估算（v1.1）
priority: P0-MVP
related_spec: /docs/specs/features/F049-stage0-daily-estimate.md
spec_version: "1.1"
covers:
  - F049
  - US-071
  - US-132
date: 2026-05-21
last_updated: 2026-05-21
---

# F049：Stage 0 每日分派數量估算（v1.1）— 測試設計

> **v1.1 測試設計範圍（2026-05-21）**：本文件覆蓋 F049 v1.1 核心變更 —— Ready 欄頂 CTA Banner 為 Stage 0 試算頁（secondary「試算」按鈕）之唯一入口（GAP-G3 / US-132）。
> v1.0 既有估算邏輯（GET API / 估算公式 / 試算逾時 / Pool 警示門檻）之業務邏輯不在 v1.1 變更範圍內；如需驗證業務邏輯，對應測試見既有 F049 後端 Unit / Integration test。
> 本文件新增 5 個 CTA Banner 入口場景，均為前端 Component 層測試。

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `F049-stage0-daily-estimate.md` v1.1 + `F061-trigger-assignment-run.md` v1.4（§9 CTA Banner spec）+ `F048-view-list-definition.md` v2.0 |
| QA / Tester | 本文件 + `error-handling.md#assignment-errors` |

---

## 測試策略概覽

| 項目 | 說明 |
|---|---|
| 主要測試層 | 前端 Component（React Testing Library）；Stage 0 CTA Banner 渲染於 F048 Kanban 主頁的 Ready 欄頂 |
| 測試檔案 | `apps/web/src/pages/assignment/__tests__/list-kanban-page.test.tsx`（追加 CTA 群組）或獨立 `ready-cta-banner.test.tsx` |
| 關鍵依賴 | MSW stub `GET /api/v1/assignment/lists` 回 `stageCounts.ready`；MSW stub assignment_run 狀態 |
| Mock 資料注意 | `stage` 欄位值用 PG ENUM 小寫 snake_case；`status` 用 `'running'`/`'pending'`/`'idle'` |

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
| Stage 0 估算業務邏輯 | 中（既有測試覆蓋） | 估算公式 / 逾時保護見後端 Unit；本 v1.1 不新增 |
