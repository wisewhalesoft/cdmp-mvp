---
type: test-design-feature
feature_id: F077
feature_name: 月份切換與名單五階段總覽（v1.3）
priority: P0-MVP
related_spec: /docs/specs/features/F077-month-switch-and-stage-overview.md
spec_version: "1.3"
covers:
  - F077
  - US-104
  - US-105
  - US-130
  - US-131
  - US-132
date: 2026-05-21
last_updated: 2026-05-21
---

# F077：月份切換與名單五階段總覽（v1.3）— 測試設計

> **v1.3 測試設計範圍（2026-05-21）**：本文件為 F077 首次建立的 test spec，覆蓋 v1.3 重點：
> 1. **5 stage × 4 role 操作矩陣（BR-7）**：21 個 Component 場景，驗證各 cell 按鈕渲染正確性
> 2. **5 個橫切條件（C-1~C-5）**：歷史月份 / 月名單分派鎖 / 已停用 / 處長轄區 / 查看通用性
> 3. **section_chief 轄區隔離（BR-4）**：後端 Integration 驗證 GET lists API 過濾行為
> 4. **BR-10 user 整頁封鎖**：Component 驗證封鎖說明卡渲染
>
> F077 BR-7 矩陣為 F050 / F078 / F079 / F080~F089 等所有 E07 名單操作 spec 的**共用操作矩陣權威**。
> 本文件測試場景設計以 F048 v2.0 Kanban 主頁（`<ListKanbanPage />`）作為渲染載體。

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `F077-month-switch-and-stage-overview.md` v1.3 + `F048-view-list-definition.md` v2.0 + `error-handling.md#assignment-role-errors` |
| QA / Tester | 本文件 + `error-handling.md#assignment-role-errors` |
| CI/CD Owner | `test-index.md`（自動化就緒度） |

---

## 測試策略概覽

| 項目 | 說明 |
|---|---|
| 主要測試層 | 前端 Component（RTL）：矩陣渲染；後端 Integration（Supertest）：section_chief 轄區過濾 |
| 測試檔案（前端） | `apps/web/src/pages/assignment/__tests__/role-stage-matrix.test.tsx`（新建，集中管理矩陣測試）|
| 測試檔案（後端） | `apps/api/test/f077-section-chief-isolation.e2e.spec.ts`（新建）|
| Mock 注意 | `stage` 值用 PG ENUM 小寫（`'draft'`、`'dept_ratio'`、`'personnel_ratio'`、`'approval'`、`'ready'`）；role guard decorator：class 級 `@UseGuards(DirectorOrSectionChiefGuard)` |
| 矩陣測試設計原則 | 每個 cell 驗證「應渲染的按鈕存在」+ 「不應渲染的按鈕 DOM 不存在」，避免 CSS 隱藏誤判 |

---

## 一、Role × Stage 操作矩陣測試（BR-7）

> **Fixture 規範**：MSW stub 一筆名單，透過 prop 傳入 `stage` 與 `userRole`/`businessRole` 來驗證不同 cell；避免大量 fixture 建立。
> **驗證原則**：
> - 按鈕存在：`getByRole('button', { name: '...' })` 成功
> - 按鈕不存在：`queryByRole('button', { name: '...' }) === null`（DOM 不存在，非 disabled）

---

### TS-F077-M-001：admin / draft → 渲染「編輯」/「推進」/「停用」/「查看」

- **關聯需求**：F077 v1.3 BR-7 矩陣（admin, draft）
- **測試類型**：Positive / Component（RTL）
- **前置條件**：AdminToken（`role='admin'`）；MSW stub 1 筆 `stage='draft'` 名單；非歷史月份；無月名單分派鎖
- **預期結果**：
  - 「編輯」按鈕存在
  - 「推進」按鈕存在（或對應 F078 action text）
  - 「停用」按鈕存在（**全寫「停用」**，非縮寫「停」）
  - 「查看」按鈕存在
  - 無其他寫入操作按鈕（如「設定」/「退回」不渲染）

---

### TS-F077-M-002：director / draft → 渲染「編輯」/「推進」/「停用」/「查看」

- **關聯需求**：F077 v1.3 BR-7 矩陣（director, draft）
- **測試類型**：Positive / Component（RTL）
- **前置條件**：DirectorToken（`businessRole='director'`）；同 TS-F077-M-001 setup
- **預期結果**：同 TS-F077-M-001（director 與 admin draft 欄按鈕相同）

---

### TS-F077-M-003：section_chief / draft → 僅「查看」，其他寫入按鈕 DOM 不存在

- **關聯需求**：F077 v1.3 BR-7 矩陣（section_chief, draft）
- **測試類型**：Positive / Component（RTL）
- **前置條件**：SectionChiefToken（`businessRole='section_chief'`）；MSW stub 1 筆本轄區 `stage='draft'` 名單
- **預期結果**：
  - 「查看」按鈕存在
  - 「編輯」按鈕 DOM **不存在**（`=== null`）
  - 「停用」按鈕 DOM **不存在**
  - 「推進」按鈕 DOM **不存在**

---

### TS-F077-M-004：admin / dept_ratio → 渲染「設定」/「退回」/「查看」

- **關聯需求**：F077 v1.3 BR-7 矩陣（admin, dept_ratio）
- **測試類型**：Positive / Component（RTL）
- **前置條件**：AdminToken；MSW stub 1 筆 `stage='dept_ratio'` 名單；非歷史月份；無月名單分派鎖
- **預期結果**：
  - 「設定」按鈕存在（對應 F079 部門比例設定）
  - 「退回」按鈕存在（對應 F081 Rollback）
  - 「查看」按鈕存在
  - 「編輯」/「推進」/「停用」按鈕 DOM 不存在

---

### TS-F077-M-005：director / dept_ratio → 渲染「設定」/「退回」/「查看」

- **關聯需求**：F077 v1.3 BR-7 矩陣（director, dept_ratio）
- **測試類型**：Positive / Component（RTL）
- **前置條件**：DirectorToken；MSW stub 1 筆 `stage='dept_ratio'` 名單
- **預期結果**：同 TS-F077-M-004

---

### TS-F077-M-006：section_chief / dept_ratio → 僅「查看」

- **關聯需求**：F077 v1.3 BR-7 矩陣（section_chief, dept_ratio）
- **測試類型**：Positive / Component（RTL）
- **前置條件**：SectionChiefToken；MSW stub 1 筆本轄區 `stage='dept_ratio'` 名單
- **預期結果**：
  - 「查看」按鈕存在
  - 「設定」/ 「退回」按鈕 DOM **不存在**

---

### TS-F077-M-007：admin / personnel_ratio → 渲染「檢視」/「退回」/「查看」/「快速模板」

- **關聯需求**：F077 v1.3 BR-7 矩陣（admin, personnel_ratio）
- **測試類型**：Positive / Component（RTL）
- **前置條件**：AdminToken；MSW stub 1 筆 `stage='personnel_ratio'` 名單
- **預期結果**：
  - 「檢視」按鈕存在（F082 唯讀進入）
  - 「退回」按鈕存在（F085 Rollback）
  - 「查看」按鈕存在
  - 「快速模板」按鈕存在（F083）
  - 「設定本部門」按鈕 DOM **不存在**（section_chief 專屬）

---

### TS-F077-M-008：director / personnel_ratio → 渲染「檢視」/「退回」/「查看」/「快速模板」

- **關聯需求**：F077 v1.3 BR-7 矩陣（director, personnel_ratio）
- **測試類型**：Positive / Component（RTL）
- **前置條件**：DirectorToken；MSW stub 1 筆 `stage='personnel_ratio'` 名單
- **預期結果**：同 TS-F077-M-007

---

### TS-F077-M-009：section_chief / personnel_ratio → 渲染「設定本部門」/「查看」；無「退回」/「快速模板」

- **關聯需求**：F077 v1.3 BR-7 矩陣（section_chief, personnel_ratio）
- **測試類型**：Positive / Component（RTL）
- **前置條件**：SectionChiefToken；MSW stub 1 筆本轄區 `stage='personnel_ratio'` 名單
- **預期結果**：
  - 「設定本部門」按鈕存在（F082 限轄區）
  - 「查看」按鈕存在
  - 「退回」按鈕 DOM **不存在**（處長無 Rollback 權限）
  - 「快速模板」按鈕 DOM **不存在**

---

### TS-F077-M-010：admin / approval → 渲染「核准」/「拒絕」/「查看」

- **關聯需求**：F077 v1.3 BR-7 矩陣（admin, approval）
- **測試類型**：Positive / Component（RTL）
- **前置條件**：AdminToken；MSW stub 1 筆 `stage='approval'` 名單
- **預期結果**：
  - 「核准」按鈕存在（F086）
  - 「拒絕」按鈕存在（F087）
  - 「查看」按鈕存在
  - 「設定」/「退回」/「推進」等其他按鈕 DOM 不存在

---

### TS-F077-M-011：director / approval → 渲染「核准」/「拒絕」/「查看」

- **關聯需求**：F077 v1.3 BR-7 矩陣（director, approval）
- **測試類型**：Positive / Component（RTL）
- **前置條件**：DirectorToken；MSW stub 1 筆 `stage='approval'` 名單
- **預期結果**：同 TS-F077-M-010

---

### TS-F077-M-012：section_chief / approval → 僅「查看」

- **關聯需求**：F077 v1.3 BR-7 矩陣（section_chief, approval）
- **測試類型**：Positive / Component（RTL）
- **前置條件**：SectionChiefToken；MSW stub 1 筆本轄區 `stage='approval'` 名單
- **預期結果**：
  - 「查看」按鈕存在
  - 「核准」/「拒絕」按鈕 DOM **不存在**

---

### TS-F077-M-013：admin / ready → 渲染「退回」/「查看」；無 per-card 月名單分派觸發按鈕

- **關聯需求**：F077 v1.3 BR-7 矩陣（admin, ready）/ US-132（月名單分派唯一入口為 CTA Banner）
- **測試類型**：Positive / Component（RTL）
- **前置條件**：AdminToken；MSW stub 1 筆 `stage='ready'` 名單
- **預期結果**：
  - 「退回」按鈕存在（F089 Rollback）
  - 「查看」按鈕存在
  - **無**「執行月名單分派」/「觸發月名單分派」per-card 按鈕（DOM 不存在）

---

### TS-F077-M-014：director / ready → 渲染「退回」/「查看」；無 per-card 月名單分派觸發按鈕

- **關聯需求**：F077 v1.3 BR-7 矩陣（director, ready）
- **測試類型**：Positive / Component（RTL）
- **前置條件**：DirectorToken；MSW stub 1 筆 `stage='ready'` 名單
- **預期結果**：同 TS-F077-M-013

---

### TS-F077-M-015：section_chief / ready → 僅「查看」

- **關聯需求**：F077 v1.3 BR-7 矩陣（section_chief, ready）
- **測試類型**：Positive / Component（RTL）
- **前置條件**：SectionChiefToken；MSW stub 1 筆本轄區 `stage='ready'` 名單
- **預期結果**：
  - 「查看」按鈕存在
  - 「退回」按鈕 DOM **不存在**

---

## 二、5 個橫切條件測試（BR-7 C-1~C-5）

### TS-F077-C1-001：歷史月份 → 所有 role 所有 stage 寫入按鈕完全不渲染，「查看」保留

- **關聯需求**：F077 v1.3 BR-7 C-1（歷史月份唯讀）/ F048 v2.0 AC-K6
- **測試類型**：Positive / Component（RTL）
- **前置條件**：
  - DirectorToken（以 director 代表寫入 role 最廣的情況）
  - MSW stub GET lists 回歷史月份（`isHistorical: true`），含 5 個 stage 各 1 筆名單
- **步驟**：
  1. render `<ListKanbanPage />` 呈現歷史月份
  2. 逐一驗證各 stage 欄
- **預期結果**：
  - 所有欄位的卡片：「編輯」/「推進」/「停用」/「設定」/「退回」/「核准」/「拒絕」/「快速模板」按鈕 DOM **完全不存在**
  - 所有欄位的卡片：「查看」按鈕存在且可點擊

---

### TS-F077-C2-001：月名單分派鎖中 → 所有寫入按鈕 disabled；「查看」按鈕 enabled

- **關聯需求**：F077 v1.3 BR-7 C-2（月名單分派鎖中）/ F048 v2.0 AC-4
- **測試類型**：Positive / Component（RTL）
- **前置條件**：
  - DirectorToken；MSW stub 月名單分派執行中（`assignment_run.status='running'`）
  - MSW stub GET lists 回正常月份資料，含各 stage 名單
- **預期結果**：
  - 所有卡片上的寫入按鈕（編輯 / 推進 / 停用 / 設定 / 退回 / 核准 / 拒絕 / 快速模板）均 disabled
  - 「查看」按鈕 enabled（`not.toBeDisabled()`）
  - Ready 欄頂 CTA Banner 的月名單分派主按鈕 disabled

---

### TS-F077-C3-001：已停用名單（status=inactive）→ Kanban 主視圖不渲染該卡片

- **關聯需求**：F077 v1.3 BR-7 C-3（已停用名單）/ F048 v2.0 AC-5 deprecated
- **測試類型**：Positive / Component（RTL）
- **前置條件**：
  - MSW stub GET lists 預設（`includeDisabled=false`）回 `lists` 僅含 `status='active'` 名單（後端已過濾）
  - 確認 fetch URL 不帶 `includeDisabled=true`
- **預期結果**：
  - Kanban 不顯示 `status='inactive'` 的卡片
  - 各欄 badge 數字對應 active 名單數量（不含 inactive）
- **補充**：前端不需要在客戶端過濾 inactive；驗證前端不傳 `includeDisabled=true` 給後端即可

---

### TS-F077-C4-001：section_chief → 僅見本轄區名單（created_by=自身），他轄區卡片不渲染

- **關聯需求**：F077 v1.3 BR-7 C-4（處長轄區隔離）/ BR-4
- **測試類型**：Positive / Component（RTL）+ Integration（後端）
- **前置條件（Component）**：
  - SectionChiefToken（`userId='SC-001'`）
  - MSW stub GET lists 只回傳 `createdBy='SC-001'` 的名單（模擬後端已過濾）
- **步驟（Component）**：
  1. render `<ListKanbanPage />` with section_chief context
  2. 驗證 Kanban 卡片
- **預期結果（Component）**：
  - 卡片均屬本轄區（`createdByEmpNm` 對應自身）
  - 不含其他處長的名單卡片
- **後端驗證（見 TS-F077-SC-001）**：Supertest Integration test 驗證 API 層過濾

---

### TS-F077-C5-001：「查看」按鈕在月名單分派鎖 + 歷史月份雙重條件下仍可觸發 Drawer

- **關聯需求**：F077 v1.3 BR-7 C-5（查看按鈕通用性）
- **測試類型**：Positive / Component（RTL）
- **前置條件**：
  - DirectorToken；歷史月份（`isHistorical: true`）+ 月名單分派執行中（`assignment_run.status='running'`）同時成立
  - MSW stub GET full-snapshot 回 200
- **步驟**：
  1. render `<ListKanbanPage />` 呈現歷史月份 + 月名單分派鎖狀態
  2. 點擊卡片「查看」按鈕
  3. 驗證 Drawer
- **預期結果**：
  - 「查看」按鈕存在且 enabled（`not.toBeDisabled()`）
  - 點擊後 Drawer 正常開啟
  - MSW 收到 `GET /api/v1/assignment/list-definitions/:listNo/full-snapshot` 請求

---

### TS-F077-BR10-001：role=user → 整頁封鎖說明卡；Kanban / Toolbar 不渲染；後端 API 403

- **關聯需求**：F077 v1.3 BR-10（user 整頁封鎖）/ US-130 AC-7
- **測試類型**：Negative / Component（RTL）+ Integration（後端 403 驗證）
- **前置條件（Component）**：
  - UserToken（`role='user'`，`businessRole` 任意值）
  - MSW stub GET lists 回 403 `AUTH_FORBIDDEN`（`DirectorOrSectionChiefGuard` 攔截）
- **步驟（Component）**：
  1. render `<ListKanbanPage />` with user context
  2. 驗證頁面
- **預期結果（Component）**：
  - 封鎖說明卡顯示（含「名單定義為部長 / 處長 / Admin 專屬功能」文字）
  - Kanban Board DOM **完全不存在**（`=== null`）
  - Toolbar DOM **完全不存在**（非 disabled，是 DOM 不存在）
- **後端驗證（Integration）**：
  - `GET /api/v1/assignment/lists` with UserToken → HTTP 403、`error_code: 'AUTH_FORBIDDEN'`

---

## 三、section_chief 轄區隔離 Integration 測試（BR-4）

> **測試類型**：Integration（Supertest + SQLite in-memory）
> **測試檔案**：`apps/api/test/f077-section-chief-isolation.e2e.spec.ts`（新建）

---

### TS-F077-SC-001：GET /api/v1/assignment/lists → SectionChiefToken → 僅回本轄區名單

- **關聯需求**：F077 v1.3 BR-4（處長轄區隔離）/ AC-7
- **測試類型**：Positive / Integration（Supertest）
- **前置條件**：
  - DB seed：2 個處長帳號（`userId='SC-001'`、`userId='SC-002'`）
  - `ob_list_definition` 各 seed 2 筆（created_by 分別屬 SC-001 / SC-002；`project_workym='202605'`；`status='active'`；`stage='draft'`，PG ENUM 小寫）
- **步驟**：
  1. 以 SC-001 Token 請求 `GET /api/v1/assignment/lists?ym=202605`
  2. 驗證回應
- **預期結果**：
  - `lists` 長度 = 2（僅 `created_by='SC-001'` 的名單）
  - 所有回傳名單的 `createdBy === 'SC-001'`
  - `created_by='SC-002'` 的名單**完全不出現**

---

### TS-F077-SC-002：GET /api/v1/assignment/lists → DirectorToken → 回傳全部名單（不過濾）

- **關聯需求**：F077 v1.3 BR-4（director 全可見）
- **測試類型**：Positive / Integration（Supertest）
- **前置條件**：同 TS-F077-SC-001
- **步驟**：
  1. 以 DirectorToken 請求 `GET /api/v1/assignment/lists?ym=202605`
- **預期結果**：
  - `lists` 長度 = 4（SC-001 + SC-002 共 4 筆，director 全可見）

---

## 自動化就緒度

| 場景群組 | 自動化適合度 | 說明 |
|---|---|---|
| TS-F077-M-001~015（矩陣 Cell） | 高 | RTL；建議用 parametrize 或 describe.each 減少重複 |
| TS-F077-C1~C5（橫切條件） | 高 | RTL + MSW stub；場景邊界明確 |
| TS-F077-BR10-001（整頁封鎖） | 高 | RTL（前端）+ Supertest（後端 403）|
| TS-F077-SC-001~002（轄區隔離） | 高 | Supertest + SQLite；seed 獨立清晰 |
