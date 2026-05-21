---
type: test-design-feature
feature_id: F089
feature_name: 準備完成階段 Rollback 至簽核（v1.3）
priority: P0-MVP
related_spec: /docs/specs/features/F089-rollback-to-approval.md
spec_version: "1.3"
covers:
  - F089
  - US-119
date: 2026-05-21
last_updated: 2026-05-21
---

# F089：準備完成階段 Rollback 至簽核（v1.3）— 測試設計

> **v1.3 測試設計範圍（2026-05-21）**：本文件為 F089 首次建立的 test spec，覆蓋 v1.3 核心變更：
> 1. **入口變更**：由 F048 v1.0 表格列改為 F048 v2.0 Kanban 主頁 `ready` 欄卡片「退回」按鈕
> 2. **Rollback 語意**：`stage` 退回 `approval`；設定資料（`ob_dept_pct` / `ob_empl_set`）**全部保留，不清空**
> 3. **成功後行為**：info toast + Kanban 卡片即時欄遷移（`ready` → `approval`，無跳頁）+ Ready 欄 CTA Banner `stageCounts.ready` 遞減

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `F089-rollback-to-approval.md` v1.3 + `F061-trigger-assignment-run.md` v1.4（§9 CTA Banner spec，`ready=0` 時 Banner 消失）+ `error-handling.md#assignment-stage-transition-errors` |
| QA / Tester | 本文件 + `error-handling.md#assignment-stage-transition-errors` |

---

## 測試策略概覽

| 項目 | 說明 |
|---|---|
| 主要測試層 | 後端 Integration（Supertest）+ 前端 Component（RTL：toast + 欄遷移 + CTA Banner 遞減）|
| 測試檔案（後端） | `apps/api/test/f089-rollback-to-approval.e2e.spec.ts`（新建）|
| 測試檔案（前端） | `apps/web/src/pages/assignment/__tests__/list-kanban-page.test.tsx`（追加 F089 群組）|
| 與 F081/F085 差異 | F089 不清空任何設定資料（僅改 stage），且需驗證 CTA Banner stageCounts 遞減 |

---

## 一、後端 Integration 測試（Rollback API 行為）

> **Fixture 規範**：
> - `ob_list_definition` seed：`list_no='OB202605030'`、`stage='ready'`、`status='active'`、`project_workym='202605'`
> - `ob_dept_pct` seed 2 筆（XTA0 / XTB0）；`ob_empl_set` seed 4 筆
> - 另有 1 筆 `list_no='OB202605031'`、`stage='ready'`（用於測試 CTA Banner ready=1 → 0）

---

### TS-F089-001：Rollback 成功 → stage 退回 approval、設定資料全部保留（不清空）

- **關聯需求**：F089 v1.3 AC-2 / US-119 AC-1（Rollback 語意：設定資料全部保留）
- **測試類型**：Positive / Integration（Supertest）
- **前置條件**：DirectorToken；`list_no='OB202605030'`、`stage='ready'`
- **步驟**：
  1. `PATCH /api/v1/assignment/list-definitions/OB202605030/rollback-to-approval`（或對應端點）
  2. 驗證 HTTP 回應
  3. 查詢 DB 狀態
- **預期結果**：
  - HTTP 200
  - `ob_list_definition.stage === 'approval'`（PG ENUM 小寫）
  - `ob_dept_pct` 中 `list_no='OB202605030'` 筆數 = 2（**保留**）
  - `ob_empl_set` 中 `list_no='OB202605030'` 筆數 = 4（**保留**）
  - `assignment_audit_log` 新增一筆對應 Rollback action

---

### TS-F089-002：stage 非 ready → 422 STAGE_ROLLBACK_BLOCKED

- **關聯需求**：F089 v1.3（僅 ready 可 Rollback）
- **測試類型**：Negative / Integration（Supertest）
- **前置條件**：`list_no='OB202605032'`、`stage='approval'`（非目標階段）
- **步驟**：
  1. DirectorToken → Rollback to approval API
- **預期結果**：
  - HTTP 422
  - `error_code === 'STAGE_ROLLBACK_BLOCKED'`

---

### TS-F089-003：月跑執行中 → 409 ASSIGNMENT_RUN_ALREADY_RUNNING

- **關聯需求**：F089 v1.3（月跑鎖）
- **測試類型**：Negative / Integration（Supertest）
- **前置條件**：
  - `assignment_run` seed 1 筆 `status='running'`；**必填 4 欄位**：`run_id`（UUID）、`project_workym='202605'`、`triggered_by`（operator UUID）、`created_at`（ISO timestamp）
  - `ob_list_definition` 有 `stage='ready'` 名單
- **步驟**：
  1. DirectorToken → Rollback API
- **預期結果**：HTTP 409；`error_code === 'ASSIGNMENT_RUN_ALREADY_RUNNING'`

---

### TS-F089-004：section_chief Token → 403（DirectorGuard 攔截，處長無 Rollback 權限）

- **關聯需求**：F089 v1.3（Guard 為 `DirectorGuard`）
- **測試類型**：Negative / Integration（Supertest）
- **前置條件**：SectionChiefToken（`businessRole='section_chief'`）
- **步驟**：
  1. SectionChiefToken → Rollback API
- **預期結果**：HTTP 403；`error_code === 'AUTH_FORBIDDEN'` 或 `'E07_REQUIRES_DIRECTOR'`

---

## 二、前端 Component 測試（Rollback 後 Kanban 行為）

### TS-F089-005：Rollback 成功後顯示 info toast，文字含「已退回簽核 — 需重新簽核」

- **關聯需求**：F089 v1.3 AC-3（toast 文字）/ US-119 v2.0 AC-3
- **測試類型**：Positive / Component（RTL）
- **前置條件**：
  - 頁面渲染「準備完成」欄含 `listNo='OB202605030'` 卡片
  - MSW stub Rollback API 回 200
  - MSW stub 刷新 GET lists → `stage='approval'`、`stageCounts.ready = 0`
- **步驟**：
  1. render `<ListKanbanPage />`
  2. 點擊「準備完成」欄卡片上的「退回」按鈕
  3. 等待 API 完成
  4. 驗證 toast
- **預期結果**：
  - 顯示 info 樣式 toast（藍色）
  - toast 文字含「已退回簽核」且含「需重新簽核」

---

### TS-F089-006：Rollback 成功後卡片從「準備完成」欄遷移至「待簽核」欄（無跳頁）

- **關聯需求**：F089 v1.3 AC-3（Kanban 即時遷移）/ US-119 v2.0 AC-3
- **測試類型**：Positive / Component（RTL）
- **前置條件**：同 TS-F089-005
- **步驟**：
  1. 執行 Rollback
  2. 等待頁面更新
  3. 驗證卡片位置
- **預期結果**：
  - `OB202605030` 卡片從「準備完成」欄消失（DOM 不在 ready 欄）
  - `OB202605030` 卡片出現於「待簽核」欄（DOM 在 approval 欄）
  - 頁面**未整頁跳轉**

---

### TS-F089-007：Rollback 後 stageCounts.ready 降至 0 → Ready 欄頂 CTA Banner 不渲染

- **關聯需求**：F089 v1.3 AC-3（CTA Banner 遞減）/ F061 v1.4 §9 AC-Banner-2（ready=0 時 Banner 消失）
- **測試類型**：Positive / Component（RTL）
- **前置條件**：
  - 初始狀態：`stageCounts.ready = 1`（CTA Banner 存在）
  - MSW stub Rollback 成功後刷新 GET lists → `stageCounts.ready = 0`
- **步驟**：
  1. render `<ListKanbanPage />`（初始有 CTA Banner）
  2. 執行 Rollback（將唯一的 ready 名單退回 approval）
  3. 等待頁面更新
  4. 驗證 CTA Banner
- **預期結果**：
  - Rollback 前：CTA Banner DOM 存在
  - Rollback 後：CTA Banner DOM **完全不存在**（`document.querySelector('[data-testid="ready-cta-banner"]') === null`）

---

## 自動化就緒度

| 場景群組 | 自動化適合度 | 說明 |
|---|---|---|
| TS-F089-001~004（後端 Integration） | 高 | Supertest + SQLite；設定資料保留驗證（ob_dept_pct / ob_empl_set 筆數）確定性高 |
| TS-F089-005~006（前端 toast + 遷移） | 高 | RTL + MSW |
| TS-F089-007（CTA Banner 遞減） | 高 | RTL；依賴 MSW stub 正確回傳 stageCounts |
