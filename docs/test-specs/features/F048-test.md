---
type: test-design-feature
feature_id: F048
feature_name: 查看本月名單定義清單（Kanban 主頁 v2.0）
priority: P0-MVP
related_spec: /docs/specs/features/F048-view-list-definition.md
spec_version: "2.0"
covers:
  - F048
  - US-070
  - US-130
  - US-131
  - US-132
  - US-133
date: 2026-05-21
last_updated: 2026-05-21
---

# F048：查看本月名單定義清單（Kanban 主頁 v2.0）— 測試設計

> **v2.0 測試設計範圍（2026-05-21）**：F048 v2.0 將 v1.0 表格列格式重構為 5 欄 Kanban 看板（GAP-G4）。
> 本文件覆蓋 Kanban 渲染（AC-K1~K8）、搜尋過濾、Detail Drawer 觸發、歷史月份 / 月名單分派鎖 Banner、
> sessionStorage signal consumer（§7 BR-13），以及 user 整頁封鎖（BR-10）。
> v1.0 既有表格列格式（AC-1）與頁籤切換（AC-5）test 標記為 deprecated。

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `F048-view-list-definition.md` v2.0 + `F050-create-list-definition.md`（§6.2 Detail Snapshot API + §7 BR-13）+ `F077-month-switch-and-stage-overview.md`（Role × Stage 矩陣）|
| QA / Tester | 本文件 + `error-handling.md#assignment-errors` |
| CI/CD Owner | `test-index.md`（自動化就緒度章節）|
| Product Analyst | `risks-and-gaps.md` |

---

## 測試策略概覽

| 項目 | 說明 |
|---|---|
| 主要測試層 | 前端 Component（React Testing Library + vitest）；後端 Integration 僅 user 整頁封鎖需驗 API 403 |
| 關鍵依賴 | MSW stub GET `/api/v1/assignment/lists`（含 `stageCounts`）；MSW stub GET `/api/v1/system/current-work-ym`；MSW stub GET `/api/v1/assignment/list-definitions/:listNo/full-snapshot` |
| Mock 資料注意 | `stage` 欄位值用 PG ENUM 小寫 snake_case（`'draft'`、`'dept_ratio'`、`'personnel_ratio'`、`'approval'`、`'ready'`）；`status` 用 `'active'`/`'inactive'` |
| Deprecated 標記 | v1.0 AC-1 表格列格式測試、AC-5 頁籤切換測試（若既有 E2E 有覆蓋）於此段標記 deprecated，指向 v2.0 替代場景 |

---

## 一、v1.0 Deprecated 場景宣告

> 以下場景因 F048 v2.0 Kanban 重構而廢止。若既有 E2E suite（`list-page.e2e.spec.ts` 或同等）有對應 test，應標記為 `@deprecated`（或移至 `__deprecated__` 目錄），並在 test file header 加入 cross-reference 指向下列替代場景。

| 廢止場景 | 廢止原因 | v2.0 替代場景 |
|---|---|---|
| AC-1：表格列格式渲染（list_no / list_nm / prod_kind 各欄） | Kanban 取代表格 | TS-F048-K-001、K-002 |
| AC-5：「使用中 / 已停用」頁籤切換 | Kanban 以 disabled filter 取代頁籤 | TS-F048-K-008（filter 行為未在 v2.0 規範；頁籤已廢止） |

---

## 二、Kanban 主頁渲染測試

> **測試類型**：Component（React Testing Library）
> **測試檔案**：`apps/web/src/pages/assignment/__tests__/list-kanban-page.test.tsx`（新建）
> **MSW Fixtures**：
> - `GET /api/v1/system/current-work-ym` → `{ currentWorkYm: '202605', isHistorical: false }`
> - `GET /api/v1/assignment/lists?ym=202605` → 含 5 個 stage 各 1~2 筆名單、`stageCounts`

---

### TS-F048-K-001：頁面載入渲染 5 欄 Kanban 看板，各欄欄頭存在

- **關聯需求**：F048 v2.0 AC-K1 / US-130 AC-1
- **測試類型**：Positive / Component（RTL）
- **前置條件**：MSW stub 回正常資料（含 `stageCounts: { draft: 2, dept_ratio: 1, personnel_ratio: 1, approval: 0, ready: 1 }`）
- **步驟**：
  1. render `<ListKanbanPage />`
  2. 等待載入完成
  3. 驗證 DOM
- **預期結果**：
  - 存在 5 個欄頭標籤（「草稿」、「部門比例」、「個別比例」、「待簽核」、「準備完成」）
  - 各欄欄頭 badge 數字對應 `stageCounts`（草稿欄 badge 顯示 `2`）
  - 各欄欄頭下方有 mini progress bar DOM 元素

---

### TS-F048-K-002：名單以卡片形式正確渲染 6 個欄位

- **關聯需求**：F048 v2.0 AC-K2 / US-130 AC-2
- **測試類型**：Positive / Component（RTL）
- **前置條件**：MSW stub 回 `lists` 含一筆 stage=`'draft'` 名單：
  ```json
  {
    "listNo": "OB202605001",
    "listNm": "車貸催收名單",
    "stage": "draft",
    "status": "active",
    "crEnabled": true,
    "conditionPayload": {
      "conditions": [
        { "columnName": "case_status", "fieldType": "categorical", "values": ["01", "02"] },
        { "columnName": "caseyear", "fieldType": "categorical", "values": ["3"] }
      ],
      "logic": "AND"
    },
    "createdByEmpNm": "王部長",
    "createdAt": "2026-05-09T01:14:00Z"
  }
  ```
- **步驟**：
  1. render `<ListKanbanPage />`
  2. 驗證草稿欄中的卡片內容
- **預期結果**：
  - 卡片含 `OB202605001`（等寬字體）
  - 卡片含「車貸催收名單」
  - CR badge 顯示「CR」（綠底，`crEnabled=true`）
  - 最多 2 個 condition chips（`case_status: 01 / 02`；`caseyear: 3`，若超過 2 個顯示 `+N`）
  - 顯示建立者「王部長」
  - 顯示建立日期（對應 `createdAt` 格式化）

---

### TS-F048-K-003：conditionPayload IS NULL 名單顯示 LEGACY badge（非 chips）

- **關聯需求**：F048 v2.0 AC-K2（舊遷移名單）
- **測試類型**：Positive / Component（RTL）
- **前置條件**：MSW stub 回一筆 `conditionPayload: null` 名單
- **步驟**：
  1. render `<ListKanbanPage />`
  2. 驗證對應卡片
- **預期結果**：
  - 卡片顯示 `LEGACY` badge
  - 不顯示 condition chips

---

### TS-F048-K-004：chips 超過 2 個時顯示 `+N`

- **關聯需求**：F048 v2.0 AC-K2（chips ≤ 2 顯示規則）
- **測試類型**：Positive / Component（RTL）
- **前置條件**：MSW stub 回一筆名單，`conditionPayload.conditions` 含 4 個 condition
- **步驟**：
  1. render `<ListKanbanPage />`
  2. 驗證卡片 chips 區域
- **預期結果**：顯示 2 個 chips + `+2` 標籤

---

### TS-F048-K-005：某欄無名單時顯示「無名單」灰色提示文字

- **關聯需求**：F048 v2.0 AC-K2 / AC-3
- **測試類型**：Positive / Component（RTL）
- **前置條件**：MSW stub 回 `stageCounts: { ..., approval: 0 }` 且 `lists` 無 stage=`'approval'` 項目
- **步驟**：
  1. render `<ListKanbanPage />`
  2. 驗證「待簽核」欄
- **預期結果**：「待簽核」欄顯示「無名單」灰色提示文字

---

### TS-F048-K-006：KPI 4 卡數字正確（依 stageCounts 計算）

- **關聯需求**：F048 v2.0 AC-K3 / US-130 AC-3
- **測試類型**：Positive / Component（RTL）
- **前置條件**：MSW stub 回 `stageCounts: { draft: 2, dept_ratio: 1, personnel_ratio: 1, approval: 2, ready: 3 }`
- **步驟**：
  1. render `<ListKanbanPage />`
  2. 驗證 4 個 KPI 卡數字
- **預期結果**：
  - 「名單總數」= 9（2+1+1+2+3）
  - 「進行中」= 4（1+1+2）
  - 「待簽核」= 2
  - 「準備完成」= 3

---

### TS-F048-K-007：月份準備度進度條正確渲染

- **關聯需求**：F048 v2.0 AC-K4 / US-130 AC-4
- **測試類型**：Positive / Component（RTL）
- **前置條件**：同 TS-F048-K-006
- **步驟**：
  1. render `<ListKanbanPage />`
  2. 驗證進度條元素
- **預期結果**：
  - 進度條存在（data-testid 或 aria-label 可定位）
  - 左側標示「2026-05 月份準備度」
  - 左側標示 ready 百分比（3/9 ≈ 33%）
  - 右側標示「尚有 6 份未完成準備」

---

### TS-F048-K-008：role=user → 整頁封鎖說明卡渲染，Kanban 不渲染

- **關聯需求**：F048 v2.0（F077 v1.3 BR-10）/ US-130 AC-7
- **測試類型**：Negative / Component（RTL）
- **前置條件**：
  - 使用者 JWT `role='user'`（非 director/section_chief）
  - MSW stub GET lists API 回 403 `AUTH_FORBIDDEN`
- **步驟**：
  1. render `<ListKanbanPage />` with UserContext role=user
  2. 驗證頁面內容
- **預期結果**：
  - 顯示封鎖說明卡（含「您無此頁面權限」或「名單定義為部長 / 處長 / Admin 專屬功能」文字）
  - Kanban 5 欄結構**完全不渲染**（`document.querySelector('[data-testid="kanban-board"]') === null`）
  - Toolbar 不渲染

---

## 三、搜尋 / 過濾測試

### TS-F048-K-009：輸入關鍵字即時過濾 Kanban 卡片（case-insensitive）

- **關聯需求**：F048 v2.0 AC-K5 / US-130 AC-5
- **測試類型**：Positive / Component（RTL）
- **前置條件**：MSW stub 回 3 筆名單（LIST_NM 分別為「車貸催收名單」/ 「信貸月名單分派」/ 「車貸逾期」）
- **步驟**：
  1. render `<ListKanbanPage />`，等待渲染
  2. 在搜尋框輸入「車貸」（或「Veh」若有英文模式）
  3. 驗證 Kanban 內容
- **預期結果**：
  - 僅顯示 LIST_NM 含「車貸」的卡片（2 張）；「信貸月名單分派」卡片隱藏
  - 各欄 badge 數字更新為過濾後可見數量

---

### TS-F048-K-010：清空搜尋框恢復顯示全部卡片

- **關聯需求**：F048 v2.0 AC-K5
- **測試類型**：Positive / Component（RTL）
- **前置條件**：接續 TS-F048-K-009 過濾狀態
- **步驟**：
  1. 清空搜尋框（輸入空字串）
  2. 驗證 Kanban 內容
- **預期結果**：
  - 3 張卡片全部顯示
  - 欄頭 badge 數字恢復為原始 `stageCounts`

---

## 四、Detail Drawer 測試

> **測試檔案**：同 `list-kanban-page.test.tsx`（追加群組）
> **MSW Fixture**：`GET /api/v1/assignment/list-definitions/OB202605001/full-snapshot` → 4 個 section 完整 response

---

### TS-F048-D-001：點擊「查看」按鈕 → 觸發 full-snapshot → Drawer 滑入含 4 個頁籤

- **關聯需求**：F048 v2.0 AC-2 / US-131 AC-2
- **測試類型**：Positive / Component（RTL）
- **前置條件**：
  - 頁面渲染 1 張卡片（`listNo='OB202605001'`、`stage='draft'`）
  - MSW stub full-snapshot 回完整 4-section response
- **步驟**：
  1. render `<ListKanbanPage />`
  2. 點擊卡片上的「查看」按鈕
  3. 等待 Drawer 渲染
- **預期結果**：
  - Drawer 元素存在（右側滑入）
  - Drawer 內含 4 個頁籤：「篩選條件」/「部門比例」/「個別比例」/「簽核歷史」
  - MSW 確認收到 `GET /api/v1/assignment/list-definitions/OB202605001/full-snapshot` 請求

---

### TS-F048-D-002：draft 階段 Drawer — 部門比例頁籤顯示「尚未設定」

- **關聯需求**：F048 v2.0 AC-2（stage-aware null state：draft）/ US-131 AC-3
- **測試類型**：Positive / Component（RTL）
- **前置條件**：MSW stub full-snapshot 回 `deptRatios: []`（draft 階段）
- **步驟**：
  1. 開啟 Drawer 後切換至「部門比例」頁籤
- **預期結果**：顯示「尚未設定部門比例」之提示文字（或對應空狀態 placeholder）

---

### TS-F048-D-003：月名單分派執行中「查看」按鈕仍正常觸發 Drawer（不受 lock 影響）

- **關聯需求**：F048 v2.0 AC-4（「查看」不受月名單分派鎖影響）/ F077 v1.3 BR-7 C-5
- **測試類型**：Positive / Component（RTL）
- **前置條件**：
  - MSW stub GET lists 回 `isLocked: true`（月名單分派執行中）
  - 所有寫入按鈕 disabled
  - MSW stub full-snapshot 回 200
- **步驟**：
  1. render `<ListKanbanPage />`（月名單分派鎖狀態）
  2. 點擊「查看」按鈕
- **預期結果**：
  - 「查看」按鈕**非** disabled（`not.toBeDisabled()`）
  - Drawer 正常開啟
  - `GET /api/v1/.../full-snapshot` 請求發出

---

## 五、歷史月份 / 月名單分派鎖 Banner 測試

### TS-F048-B-001：歷史月份 → 紅色「歷史月份資料為唯讀」橫幅；寫入按鈕 DOM 不存在

- **關聯需求**：F048 v2.0 AC-K6 / US-130 AC-6 / F077 v1.3 BR-7 C-1
- **測試類型**：Positive / Component（RTL）
- **前置條件**：
  - MSW stub `GET /api/v1/system/current-work-ym` 回 `{ currentWorkYm: '202605' }`
  - 模擬使用者切換至歷史月份（`selectedYm='202504'`），MSW stub GET lists 回 `{ isHistorical: true, ... }`
- **步驟**：
  1. render `<ListKanbanPage />` 並觸發月份切換至 202504
  2. 驗證 DOM
- **預期結果**：
  - 頁面頂部紅色橫幅含「歷史月份資料為唯讀」文字
  - 卡片上的寫入按鈕（編輯 / 推進 / 停用 / 設定 / 退回 等）**DOM 完全不存在**（`document.querySelector('[data-testid="btn-edit"]') === null`，非 CSS hidden）
  - 「查看」按鈕仍存在且可點擊

---

### TS-F048-B-002：月名單分派執行中 → 橘色通知列；寫入按鈕 disabled；「查看」按鈕 enabled

- **關聯需求**：F048 v2.0 AC-4 / F077 v1.3 BR-7 C-2
- **測試類型**：Positive / Component（RTL）
- **前置條件**：
  - MSW stub GET lists 回正常資料，但同時 GET assignment_run 狀態含 `status: 'running'`
  - 或前端頁面有月名單分派狀態 polling；stub 回 `{ isLocked: true }`
- **步驟**：
  1. render `<ListKanbanPage />` 呈現月名單分派執行中狀態
  2. 驗證
- **預期結果**：
  - 頁面頂部橘色通知列含「分派執行中，名單定義暫時鎖定」文字
  - Toolbar「新增名單」按鈕 disabled
  - 卡片所有寫入按鈕 disabled（`toBeDisabled()`）
  - 「查看」按鈕 enabled（`not.toBeDisabled()`）
  - Ready 欄頂 CTA Banner 改 disabled 樣式

---

## 六、sessionStorage Signal Consumer 測試

> **說明**：M01 主頁作為 sessionStorage cdmp.pendingToast 的 Consumer，測試場景定義於 F050-test.md TS-F050-SIG-004~007。
> 本節僅作 cross-reference，不重複列出場景內容。

- **Consumer 場景**：TS-F050-SIG-004（顯示 toast + removeItem）、SIG-005（頁面重整不重複）、SIG-006（無效 JSON 靜默）、SIG-007（無 key 靜默）
- **測試檔案**：`apps/web/src/pages/assignment/__tests__/list-kanban-page.test.tsx`（SIG 群組）

---

## 自動化就緒度

| 場景群組 | 自動化適合度 | 說明 |
|---|---|---|
| TS-F048-K-001~008（Kanban 渲染） | 高 | RTL + MSW；純前端，無需真實 DB |
| TS-F048-K-009~010（搜尋過濾） | 高 | 純前端 state 操作 |
| TS-F048-D-001~003（Drawer） | 高 | RTL + MSW stub full-snapshot |
| TS-F048-B-001~002（Banner） | 高 | RTL；注意 DOM-not-exist vs display:none 區分 |
| SIG Consumer（cross-ref F050） | 高 | sessionStorage jsdom 可用 |
