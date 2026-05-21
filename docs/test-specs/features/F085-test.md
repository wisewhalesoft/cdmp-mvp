---
type: test-design-feature
feature_id: F085
feature_name: 個別業務比例設定階段 Rollback 至部門比例設定（v1.3）
priority: P0-MVP
related_spec: /docs/specs/features/F085-rollback-to-dept-ratio.md
spec_version: "1.3"
covers:
  - F085
  - US-115
date: 2026-05-21
last_updated: 2026-05-21
---

# F085：個別業務比例設定階段 Rollback 至部門比例設定（v1.3）— 測試設計

> **v1.3 測試設計範圍（2026-05-21）**：本文件為 F085 首次建立的 test spec，覆蓋 v1.3 核心變更：
> 1. **入口變更**：由 F048 v1.0 表格列改為 F048 v2.0 Kanban 主頁 `personnel_ratio` 欄卡片「退回」按鈕
> 2. **Rollback 語意**：`ob_empl_set` 刪除（個別比例清空）、`ob_dept_pct` **保留**（不清空）；`stage` 退回 `dept_ratio`
> 3. **成功後行為**：info toast + Kanban 卡片即時欄遷移（`personnel_ratio` → `dept_ratio`，無跳頁）

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `F085-rollback-to-dept-ratio.md` v1.3 + `data-model.md#ob-empl-set` + `data-model.md#ob-dept-pct` + `error-handling.md#assignment-stage-transition-errors` |
| QA / Tester | 本文件 + `error-handling.md#assignment-stage-transition-errors` |

---

## 測試策略概覽

| 項目 | 說明 |
|---|---|
| 主要測試層 | 後端 Integration（Supertest）+ 前端 Component（RTL：toast + 欄遷移）|
| 測試檔案（後端） | `apps/api/test/f085-rollback-to-dept-ratio.e2e.spec.ts`（新建）|
| 測試檔案（前端） | `apps/web/src/pages/assignment/__tests__/list-kanban-page.test.tsx`（追加 F085 群組）|
| TypeORM 刪除注意 | `ob_empl_set` 清空用 `repo.remove(entities)`；若 `ob_empl_set` 有複合 PK（含 `list_no` / `project_workym` / `emplid` 等欄位），不可用 `repo.delete({ listNo: null })`（依 [[feedback_typeorm_null_pk_delete]]）|
| 與 F081 差異 | F081 清空 `ob_dept_pct`；F085 清空 `ob_empl_set` 但**保留 `ob_dept_pct`**（這是本 Rollback 的關鍵差異，需測試驗證）|

---

## 一、後端 Integration 測試（Rollback API 行為）

> **Fixture 規範**：
> - `ob_list_definition` seed：`list_no='OB202605020'`、`stage='personnel_ratio'`、`status='active'`、`project_workym='202605'`
> - `ob_dept_pct` seed 2 筆（deptCode='XTA0' ration=60、deptCode='XTB0' ration=40）
> - `ob_empl_set` seed 4 筆（XTA0: emplid='E001' ration=30 / 'E002' ration=30；XTB0: emplid='E003' ration=20 / 'E004' ration=20）

---

### TS-F085-001：Rollback 成功 → stage 退回 dept_ratio、ob_empl_set 全部刪除、ob_dept_pct 保留

- **關聯需求**：F085 v1.3 AC-2 / US-115 AC-1（Rollback 語意）
- **測試類型**：Positive / Integration（Supertest）
- **前置條件**：DirectorToken；DB 狀態如 Fixture 規範
- **步驟**：
  1. `PATCH /api/v1/assignment/list-definitions/OB202605020/rollback-to-dept-ratio`（或對應端點）
  2. 驗證 HTTP 回應
  3. 查詢 DB 狀態（`ob_list_definition.stage`、`ob_empl_set` 筆數、`ob_dept_pct` 筆數）
- **預期結果**：
  - HTTP 200
  - `ob_list_definition.stage === 'dept_ratio'`（PG ENUM 小寫）
  - `ob_empl_set` 中 `list_no='OB202605020'` 筆數 = 0（全部刪除）
  - `ob_dept_pct` 中 `list_no='OB202605020'` 筆數 = 2（**保留，不清空**）
  - `assignment_audit_log` 新增一筆對應 Rollback action
- **DB cleanup 注意**：`ob_empl_set` entity 刪除用 `repo.remove(entities)`（複合 PK 安全刪除；依 [[feedback_typeorm_null_pk_delete]]）

---

### TS-F085-002：stage 非 personnel_ratio → 422 STAGE_ROLLBACK_BLOCKED

- **關聯需求**：F085 v1.3（僅 personnel_ratio 可 Rollback）
- **測試類型**：Negative / Integration（Supertest）
- **前置條件**：`list_no='OB202605021'`、`stage='dept_ratio'`（非目標階段）
- **步驟**：
  1. DirectorToken → Rollback to dept_ratio API
- **預期結果**：
  - HTTP 422
  - `error_code === 'STAGE_ROLLBACK_BLOCKED'`
  - DB `stage` 不變

---

### TS-F085-003：月跑執行中 → 409 ASSIGNMENT_RUN_ALREADY_RUNNING

- **關聯需求**：F085 v1.3（月跑鎖）
- **測試類型**：Negative / Integration（Supertest）
- **前置條件**：
  - `assignment_run` seed 1 筆 `status='running'`；**必填 4 欄位**：`run_id`（UUID）、`project_workym='202605'`、`triggered_by`（operator UUID）、`created_at`（ISO timestamp）
  - `ob_list_definition` 有 `stage='personnel_ratio'` 名單
- **步驟**：
  1. DirectorToken → Rollback API
- **預期結果**：HTTP 409；`error_code === 'ASSIGNMENT_RUN_ALREADY_RUNNING'`

---

### TS-F085-004：section_chief Token → 403（DirectorGuard 攔截，處長無 Rollback 權限）

- **關聯需求**：F085 v1.3（Guard 為 `DirectorGuard`）
- **測試類型**：Negative / Integration（Supertest）
- **前置條件**：SectionChiefToken（`businessRole='section_chief'`）
- **步驟**：
  1. SectionChiefToken → Rollback API
- **預期結果**：
  - HTTP 403
  - `error_code === 'AUTH_FORBIDDEN'` 或 `'E07_REQUIRES_DIRECTOR'`

---

## 二、前端 Component 測試（Rollback 後 Kanban 行為）

### TS-F085-005：Rollback 成功後顯示 info toast，文字含「已退回部門比例 — 處長設定將清空」

- **關聯需求**：F085 v1.3 AC-3（toast 文字）/ US-115 v2.0 AC-3
- **測試類型**：Positive / Component（RTL）
- **前置條件**：
  - 頁面渲染「個別比例」欄含 `listNo='OB202605020'` 卡片
  - MSW stub Rollback API 回 200
  - MSW stub 刷新 GET lists 回 `stage='dept_ratio'`
- **步驟**：
  1. render `<ListKanbanPage />`
  2. 點擊「個別比例」欄卡片上的「退回」按鈕
  3. 等待 API 完成
  4. 驗證 toast
- **預期結果**：
  - 顯示 info 樣式 toast（藍色 / info 對應 class）
  - toast 文字含「已退回部門比例」且含「處長設定將清空」（或對應語意）

---

### TS-F085-006：Rollback 成功後卡片從「個別比例」欄遷移至「部門比例」欄（無跳頁）

- **關聯需求**：F085 v1.3 AC-3（Kanban 即時遷移）/ US-115 v2.0 AC-3
- **測試類型**：Positive / Component（RTL）
- **前置條件**：同 TS-F085-005
- **步驟**：
  1. 執行 Rollback
  2. 等待頁面更新
  3. 驗證卡片位置
- **預期結果**：
  - `OB202605020` 卡片從「個別比例」欄消失（DOM 不在 personnel_ratio 欄）
  - `OB202605020` 卡片出現於「部門比例」欄（DOM 在 dept_ratio 欄）
  - 頁面**未整頁跳轉**

---

## 自動化就緒度

| 場景群組 | 自動化適合度 | 說明 |
|---|---|---|
| TS-F085-001~004（後端 Integration） | 高 | 關鍵驗證：ob_empl_set DELETE + ob_dept_pct 保留，確定性高 |
| TS-F085-005~006（前端 Component） | 高 | RTL + MSW；toast 樣式驗證需對齊元件設計 |
