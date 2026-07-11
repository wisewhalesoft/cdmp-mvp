# US-138：月名單分派觸發頁加入分派作業月份選擇器，並傳選定月給後端

> **Story ID**：US-138
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M04 分派執行
> **優先級**：Must Have
> **階段**：Phase 1（止血）
> **預估點數**：3
> **Feature**：F097 作業月語意統一
> **修正對象（live 不一致）**：`trigger-run-page.tsx:52-55,79`（前端寫死 `new Date()`）+ `POST /assignment/runs`（後端忽略 body 自算 `new Date()`）

---

## User Story

**As a** 業務部長（Director）
**I want** 在觸發月名單分派前可確認並選定「分派作業月份」，且觸發後系統確實以我選定的月份執行
**So that** 當我在 5 月下旬為 6 月準備好名單後，按下「啟動月名單分派」時跑的是 6 月名單，而不是系統自行決定的 5 月

---

## 背景說明：現存 live 不一致（必讀）

目前（F097 前）存在**雙重寫死**問題：
1. **前端**：`trigger-run-page.tsx:52-55` 定義 `function currentWorkYm() { const now = new Date(); ... }`，L79 `const ym = currentWorkYm();`。此值同時用於 readiness check 查詢、頁面顯示，且**從不讀取任何共享狀態**。
2. **後端**：`assignment-run.controller.ts:86` 完全忽略 request body，直接呼叫 `AssignmentRunController.computeCurrentWorkYm()`（= `new Date()`）。

結果：使用者在 estimate 頁選 6 月預覽名單，按下 run 卻跑 5 月。US-138 修正前端部分；US-139 修正後端部分。

---

## 驗收標準

### AC-1：觸發頁顯示月份選擇器，預設值來自共享 Context

- **Given** 業務部長進入月名單分派觸發頁（`/assignment/trigger-run`）
- **When** 頁面載入
- **Then** 頁面標題區塊顯示 MonthPicker，label 為「分派作業月份」
- **And** MonthPicker 預設值 = 共享 `target_work_ym`（由 US-137 `AssignmentWorkYmContext` 提供）
- **And** 移除原 `function currentWorkYm() { const now = new Date(); ... }` helper

### AC-2：部長可變更月份，同步更新共享 Context

- **Given** 觸發頁 MonthPicker 顯示 `target_work_ym`
- **When** 部長選擇不同月份（在 `current_work_ym ± 12` 合法範圍內）
- **Then** 共享 `target_work_ym` 更新（其他三頁同步，見 US-137 AC-2）
- **And** 頁面的 readiness check 重新以新月份發起（見 AC-3）

### AC-3：readiness check 使用選定月份，而非 `new Date()`

- **Given** 部長已選定 `target_work_ym = '202606'`
- **When** 頁面自動查詢 `GET /api/v1/assignment/runs/readiness`
- **Then** query 帶 `?ym=202606`（選定月），而非 `new Date()` 算出的當月

### AC-4：觸發 API 攜帶選定月份（breaking change — 配合 US-139 AC-1）

- **Given** 部長點擊「啟動月名單分派」並在確認 modal 確認
- **When** 前端呼叫 `POST /api/v1/assignment/runs`
- **Then** request body 包含 `{ workYm: '202606' }`（選定月，YYYYMM 格式）
- **And** `api/assignment-run.ts` 中 `triggerRun()` 函式簽名改為 `triggerRun(workYm: string): Promise<TriggerRunResponse>`

### AC-5：confirm modal 顯示正確目標月

- **Given** 部長點擊「啟動月名單分派」
- **When** 確認 modal 開啟
- **Then** modal 標題顯示「確認觸發 {target_work_ym 格式化} 月名單分派？」（例：「確認觸發 2026-06 月名單分派？」）
- **And** modal 不顯示 `new Date()` 算出的月份

### AC-6：處長唯讀，MonthPicker 顯示但不可互動

- **Given** 使用者 `businessRole = 'section_chief'` 進入觸發頁
- **When** 頁面顯示
- **Then** MonthPicker 呈現唯讀狀態（disabled）
- **And** 顯示共享 `target_work_ym` 作為參考資訊（處長唯讀 banner 維持現有行為）

### AC-7：`project_workym` 寫入選定月份（end-to-end 驗收）

- **Given** 部長在觸發頁選定 `target_work_ym = '202606'` 並確認觸發
- **When** `POST /api/v1/assignment/runs` 成功
- **Then** 資料庫 `assignment_run.project_workym = '202606'`（目標月，而非執行當下的月份）
- **And** 回傳的 `TriggerRunResponse.ym = '202606'`

---

## 技術備註

- `triggerRun()` API client 函式需新增 `workYm` 參數，對應後端 `TriggerRunDto.workYm`（US-139 新增）。
- 現有 `data-testid="btn-start-run"` 與 `data-testid="confirm-trigger-modal"` 保留；新增 MonthPicker 的 `data-testid="trigger-run-month-picker"` 供 E2E 驗證。
- 頁面標題「觸發 {ym} 月名單分派」中的 `{ym}` 改用 `target_work_ym`（來自 Context），移除舊的 `const ym = currentWorkYm()`。

---

## 依賴關係

- **Blocked By**：US-137（共享 Context 必須先建立）、US-139（後端接受 `workYm`，否則 AC-4 無意義）
- **Blocks**：US-141（下游結果頁讀 run.project_workym，前提是 run 已寫入正確月份）

---

## Definition of Done

- [ ] 驗收標準 AC-1 ~ AC-7 全部通過
- [ ] 單元測試覆蓋率 ≥ 80%（MonthPicker 預設值 / readiness check ym / triggerRun 帶 workYm）
- [ ] `trigger-run-page.tsx` 中 `function currentWorkYm()` helper 已移除
- [ ] `triggerRun()` API client 函式簽名已更新
- [ ] Code review 通過

---

## 相關文件

- **Glossary**：[docs/specs/glossary.md](../../../specs/glossary.md)（`target_work_ym` / `current_work_ym` / 共享月份狀態）
- **Feature Proposal**：[docs/specs/proposals/work-ym-semantics-unification.md](../../../specs/proposals/work-ym-semantics-unification.md) §3.1（live 不一致）、§5 D3
- **相關 Stories**：US-137（共享 Context）、US-139（後端 guard）、US-141（下游結果頁）
