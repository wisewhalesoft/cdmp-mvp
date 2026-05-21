---
type: test-design-feature
feature_id: F081
feature_name: 部門比例設定階段 Rollback 至草稿（v1.3）
priority: P0-MVP
related_spec: /docs/specs/features/F081-rollback-to-draft.md
spec_version: "1.3"
covers:
  - F081
  - US-111
date: 2026-05-21
last_updated: 2026-05-21
---

# F081：部門比例設定階段 Rollback 至草稿（v1.3）— 測試設計

> **v1.3 測試設計範圍（2026-05-21）**：本文件為 F081 首次建立的 test spec，覆蓋 v1.3 核心變更：
> 1. **入口變更**：由 F048 v1.0 表格列改為 F048 v2.0 Kanban 主頁 `dept_ratio` 欄卡片「退回」按鈕
> 2. **Rollback 成功後行為**：toast 訊息（info 樣式）+ Kanban 卡片即時欄位遷移（`dept_ratio` → `draft`，無跳頁）
> 3. **既有業務邏輯保留**：API endpoint / `ob_dept_pct` DELETE / Transaction 原子性 / 月跑鎖 / 稽核 / Feature Flag

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `F081-rollback-to-draft.md` v1.3 + `data-model.md#ob-dept-pct` + `error-handling.md#assignment-stage-transition-errors` + `error-handling.md#assignment-role-errors` |
| QA / Tester | 本文件 + `error-handling.md#assignment-stage-transition-errors` |

---

## 測試策略概覽

| 項目 | 說明 |
|---|---|
| 主要測試層 | 後端 Integration（Supertest：API 行為 / ob_dept_pct DELETE / 稽核）+ 前端 Component（RTL：toast + 卡片遷移）|
| 測試檔案（後端） | `apps/api/test/f081-rollback-to-draft.e2e.spec.ts`（新建）|
| 測試檔案（前端） | `apps/web/src/pages/assignment/__tests__/list-kanban-page.test.tsx`（追加 F081 群組）|
| TypeORM 刪除注意 | `ob_dept_pct` 清空實作**必須**用 `repo.remove(entity)` 而非 `repo.delete({ listNo: null })`；若 `project_workym` / `list_no` 為複合 PK 且任一欄含 NULL，`repo.delete({...})` 的 SQL `= NULL` 永不 match（silent bug）。測試 cleanup 亦同此規則（依 [[feedback_typeorm_null_pk_delete]]）|
| Mock 注意 | `stage` 值 PG ENUM 小寫；`DirectorGuard` 為 class 級 decorator（處長無 Rollback 權限，`section_chief` Token 應回 403）|

---

## 一、後端 Integration 測試（Rollback API 行為）

> **Fixture 規範**：
> - `ob_list_definition` seed 1 筆：`list_no='OB202605010'`、`stage='dept_ratio'`、`status='active'`、`project_workym='202605'`
> - `ob_dept_pct` seed 2 筆（deptCode='XTA0' ration=60、deptCode='XTB0' ration=40），key = `(project_workym='202605', list_no='OB202605010', dept_code)`
> - `assignment_audit_log` 含 CREATE / ADVANCE_STAGE 兩筆

---

### TS-F081-001：Rollback 成功 → stage 退回 draft、ob_dept_pct 全部刪除、transaction 原子性

- **關聯需求**：F081 v1.3 AC-2 / US-111 AC-1（Rollback 語意）
- **測試類型**：Positive / Integration（Supertest）
- **前置條件**：DirectorToken；DB 狀態如 Fixture 規範
- **步驟**：
  1. `PATCH /api/v1/assignment/list-definitions/OB202605010/rollback-to-draft`（或對應端點）
  2. 驗證 HTTP 回應
  3. 查詢 DB 狀態
- **預期結果**：
  - HTTP 200
  - `ob_list_definition.stage === 'draft'`（PG ENUM 小寫）
  - `ob_dept_pct` 中 `list_no='OB202605010'` 筆數 = 0（全部刪除）
  - `assignment_audit_log` 新增一筆 `action='ROLLBACK_STAGE'`（或對應 action 名稱）
- **DB cleanup 注意**：測試後清除 `ob_dept_pct` 用 `repo.remove(entities)` 取得 entity 後刪除，不用 `repo.delete({ listNo: 'OB202605010' })`（複合 PK 安全刪除規則）

---

### TS-F081-002：stage 非 dept_ratio → 422 STAGE_ROLLBACK_BLOCKED

- **關聯需求**：F081 v1.3 AC-1（僅 dept_ratio 可 Rollback）
- **測試類型**：Negative / Integration（Supertest）
- **前置條件**：`list_no='OB202605011'`、`stage='draft'`（非目標階段）
- **步驟**：
  1. DirectorToken → `PATCH /api/v1/assignment/list-definitions/OB202605011/rollback-to-draft`
- **預期結果**：
  - HTTP 422
  - `error_code === 'STAGE_ROLLBACK_BLOCKED'`
  - DB `stage` 不變（仍為 `'draft'`）

---

### TS-F081-003：月跑執行中 → 409 ASSIGNMENT_RUN_ALREADY_RUNNING

- **關聯需求**：F081 v1.3 AC-1（月跑鎖）/ BR-7 C-2
- **測試類型**：Negative / Integration（Supertest）
- **前置條件**：
  - `assignment_run` seed 1 筆 `status='running'`；**必填 4 欄位**：`run_id`（UUID）、`project_workym='202605'`、`triggered_by`（operator UUID）、`created_at`（ISO timestamp）
  - `ob_list_definition` 有 stage=`'dept_ratio'` 名單
- **步驟**：
  1. DirectorToken → Rollback API
- **預期結果**：
  - HTTP 409
  - `error_code === 'ASSIGNMENT_RUN_ALREADY_RUNNING'`

---

### TS-F081-004：section_chief Token → 403（DirectorGuard 攔截）

- **關聯需求**：F081 v1.3 spec（處長無 Rollback 權限，`DirectorGuard`）
- **測試類型**：Negative / Integration（Supertest）
- **前置條件**：SectionChiefToken（`businessRole='section_chief'`）
- **步驟**：
  1. SectionChiefToken → Rollback API
- **預期結果**：
  - HTTP 403
  - `error_code === 'AUTH_FORBIDDEN'` 或 `'E07_REQUIRES_DIRECTOR'`
- **Mock 對齊注意**：Controller 使用 class 級 `@UseGuards(DirectorGuard)`，非 `DirectorOrSectionChiefGuard`（Rollback 為部長專屬操作）

---

## 二、前端 Component 測試（Rollback 後 Kanban 行為）

### TS-F081-005：Rollback 成功後 → Kanban 卡片從 dept_ratio 欄移至 draft 欄（無跳頁）

- **關聯需求**：F081 v1.3 AC-3（Kanban 卡片即時遷移欄位）
- **測試類型**：Positive / Component（RTL）
- **前置條件**：
  - 頁面渲染「部門比例」欄含 `listNo='OB202605010'` 卡片
  - MSW stub Rollback API 回 200
  - MSW stub 刷新 GET lists 回 `stage='draft'`（卡片已遷移）
- **步驟**：
  1. render `<ListKanbanPage />`
  2. 點擊「部門比例」欄卡片上的「退回」按鈕
  3. 等待 API 完成及頁面更新
- **預期結果**：
  - `OB202605010` 卡片從「部門比例」欄消失（DOM 不在 dept_ratio 欄）
  - `OB202605010` 卡片出現於「草稿」欄（DOM 在 draft 欄）
  - 頁面**未整頁跳轉**（`window.location.href` 不變）

---

### TS-F081-006：Rollback 成功後顯示 info toast，文字含「已退回草稿，部門比例已清空」

- **關聯需求**：F081 v1.3 AC-3（success toast 文字）/ US-111 v2.0 AC-3
- **測試類型**：Positive / Component（RTL）
- **前置條件**：同 TS-F081-005
- **步驟**：
  1. 執行 Rollback
  2. 驗證 toast 元素
- **預期結果**：
  - 顯示 info 樣式 toast（藍色 / info 對應 class）
  - toast 文字含「已退回草稿」且含「部門比例已清空」（或對應語意）
  - toast 文字**不**含「成功」類 success 樣式詞（應為 info 非 success）

---

## 自動化就緒度

| 場景群組 | 自動化適合度 | 說明 |
|---|---|---|
| TS-F081-001~004（後端 Integration） | 高 | Supertest + SQLite in-memory；ob_dept_pct DELETE 行為確定性高 |
| TS-F081-005~006（前端 Component） | 高 | RTL + MSW；卡片遷移驗證需確認 test-id 設計 |
