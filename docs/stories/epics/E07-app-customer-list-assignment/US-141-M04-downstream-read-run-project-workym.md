# US-141：下游結果頁讀取 run 記錄的 project_workym，不加 top-bar MonthPicker

> **Story ID**：US-141
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M04 分派執行（F062 進度 / F063 摘要 / F066 快照 / F067 比對）
> **優先級**：Must Have
> **階段**：Phase 1
> **預估點數**：2
> **Feature**：F097 作業月語意統一

---

## User Story

**As a** 業務部長（Director）或 處長（Section Chief）
**I want** 月跑進度、結果摘要、快照詳情、比對差異等結果頁自動顯示該筆 run 所服務的分派作業月份，而不需要再另外選月份
**So that** 查看歷史 run 結果時，月份資訊來自 run 記錄本身，不會因共享狀態改變而混淆，單一真實來源清楚

---

## 背景說明

下游四個結果頁（`run-progress`、`run-summary`、`snapshots`、`compare`）以 `runId` 作為主鍵查詢，月份資訊已包含在 `GET /assignment/runs/:runId` 回傳的 `project_workym` 欄位中。這些頁面是「某一筆 run 的結果展示頁」，語意上不需要使用者再選月份。

F097 確認：這四頁**不加 top-bar MonthPicker**，不納入共享 `target_work_ym` Context。

---

## 驗收標準

### AC-1：結果頁月份資訊來自 `run.project_workym`

- **Given** 使用者進入月跑進度頁（`/assignment/run-progress?runId=xxx`）、結果摘要頁、快照詳情頁、或比對差異頁
- **When** 頁面載入並呼叫 `GET /api/v1/assignment/runs/:runId`
- **Then** 月份資訊從 response 的 `project_workym` 取得，而非從共享 `target_work_ym` Context 取得
- **And** 即使使用者在其他頁面切換了共享 `target_work_ym`，此四頁顯示的月份不受影響

### AC-2：結果頁不顯示 MonthPicker

- **Given** 月跑進度頁、結果摘要頁、快照詳情頁、比對差異頁
- **When** 頁面載入
- **Then** 頁面**不出現**月份切換器（MonthPicker）元件
- **And** 月份以靜態標籤顯示（例：「分派作業月份：2026年06月」）

### AC-3：靜態月份標籤使用正確格式

- **Given** `run.project_workym = '202606'`
- **When** 結果頁顯示月份資訊
- **Then** 格式化為「2026年06月」或「2026-06」（依各頁現有設計，保持一致即可）
- **And** 標籤前置文字使用「分派作業月份」（對齊 glossary 規定）

### AC-4：forward-only — 歷史 run 的 project_workym 不回填

- **Given** F097 部署前已存在的歷史 run 記錄，其 `project_workym` 使用「執行月」語意（而非「目標月」語意）
- **When** 使用者查看這些歷史 run 的結果頁
- **Then** 系統顯示 run 記錄中既有的 `project_workym` 值，**不進行任何資料回填或修正**
- **And** 頁面中或 tooltip 中以文字標注「F097 部署前（2026-05-xx 前）的 run 記錄，project_workym 語意為執行月；F097 部署後為目標分派月」（或等效的開發者可見注釋；不需呈現給一般使用者）

### AC-5：run-history 頁月份 local state 不受影響

- **Given** 月跑歷史頁（`/assignment/run-history`，F065）有獨立 local MonthPicker
- **When** 使用者在歷史頁選取查詢月份
- **Then** 此選取不影響共享 `target_work_ym` Context（已於 US-137 AC-4 規定）
- **And** 此 story 確認歷史頁從 run 清單進入各結果頁時，月份標籤來源為 `run.project_workym`（而非歷史頁當時選取的查詢月份）

---

## 技術備註

- 四頁均已以 `runId` 為主鍵，月份資訊已在 run detail response 中，此 story 主要是**確認行為並修正任何不一致**（例如某頁若有殘留的本地月份 state，應移除）。
- 「forward-only 標注」建議以程式碼注釋或 CHANGELOG 記錄，而非 UI 顯示給終端使用者。

---

## 依賴關係

- **Blocked By**：US-138、US-139（`project_workym` 須先正確寫入，此 story 才有語意保證）
- **Blocks**：無

---

## Definition of Done

- [ ] 驗收標準 AC-1 ~ AC-5 全部通過
- [ ] 四個結果頁無 MonthPicker 元件
- [ ] 各結果頁月份標籤來源確認為 `run.project_workym`
- [ ] forward-only 策略以程式碼注釋或 CHANGELOG 明確記載
- [ ] Code review 通過

---

## 相關文件

- **Glossary**：[docs/specs/glossary.md](../../../specs/glossary.md)（`project_workym` / forward-only）
- **Feature Proposal**：[docs/specs/proposals/work-ym-semantics-unification.md](../../../specs/proposals/work-ym-semantics-unification.md) §4（設計決策）、§0.2（R2 forward-only）
- **相關 Stories**：US-138（觸發時寫入正確月份）、US-137（共享 Context 不涵蓋結果頁）
