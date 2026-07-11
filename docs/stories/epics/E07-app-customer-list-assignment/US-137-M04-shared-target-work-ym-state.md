# US-137：前端建立分派作業月份共享狀態（React Context），預設下月

> **Story ID**：US-137
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M04 分派執行（跨模組共享狀態）
> **優先級**：Must Have
> **階段**：Phase 1（F097 P1+P2+P3 合併一次到位）
> **預估點數**：3
> **Feature**：F097 作業月語意統一

---

## User Story

**As a** 業務部長（Director）或 處長（Section Chief）
**I want** 在 E07 工作流的四個功能頁（名單定義、準備完成摘要、Stage 0 試算、月名單分派觸發）共享同一個「分派作業月份」選擇，且預設選到下個月
**So that** 我切換分派作業月份後，四頁保持一致，不需在每頁重複選取，確保名單定義、估算與月名單分派觸發全程針對同一目標月份

---

## 背景說明

F097 核心問題：目前五個頁面各有獨立的 `new Date()` local state，彼此互不同步，且全部預設本月（`current_work_ym`）。5 月下旬準備 6 月名單時，使用者必須在每頁手動切換月份，仍無法保證月名單分派觸發頁使用正確月份（見 US-138）。

**設計決策（已拍板）**：
- 共享狀態實作 = **React Context**，Provider 掛載於 assignment 區段的 layout 元件（`AssignmentWorkYmProvider`），涵蓋四頁路由。
- 預設值 = `current_work_ym + 1`（下月），`current_work_ym` 由後端 `GET /api/v1/system/current-work-ym` 取得，前端**不得自行 `new Date()`**。
- `run-history-page`（F065 月名單分派歷史）的 MonthPicker 維持獨立 local state（查詢任意月歷史 run，與作業月語意不同），**不納入共享 Context**。

---

## 驗收標準

### AC-1：共享狀態初始值為下月

- **Given** 使用者首次進入 E07 assignment 區段任一四頁（名單定義 / 準備完成摘要 / Stage 0 試算 / 月名單分派觸發）
- **When** `AssignmentWorkYmProvider` 初始化，呼叫後端 `GET /api/v1/system/current-work-ym`
- **Then** 取得 `currentWorkYm`（YYYYMM）後，`target_work_ym` 預設 = `currentWorkYm + 1`（若當月為 12 月，+1 為次年 1 月）
- **And** 四頁均以此 `target_work_ym` 作為月份篩選預設值

### AC-2：一處切換，四頁同步

- **Given** 使用者在四頁任一頁的 MonthPicker 選擇新月份
- **When** 選擇完成
- **Then** 共享 Context 的 `target_work_ym` 更新
- **And** 其他三頁下次渲染 / 下次 fetch 時使用更新後的 `target_work_ym`

### AC-3：合法範圍對齊 F077 BR-2（± 12 個月）

- **Given** `current_work_ym` 已取得
- **When** 使用者操作 MonthPicker
- **Then** 可選範圍為 `current_work_ym ± 12`（共 25 月），超出範圍的月份不可選
- **And** 預設的 `current_work_ym + 1` 落在合法範圍內（無需特殊處理）

### AC-4：`run-history-page` 不共享此 Context

- **Given** 使用者在月名單分派歷史頁（F065）操作 MonthPicker
- **When** 選擇任意月份
- **Then** 歷史頁的月份選取**不影響**共享 `target_work_ym`
- **And** 反之，共享 `target_work_ym` 變更**不影響**歷史頁已選的查詢月份

### AC-5：UI 標籤統一為「分派作業月份」

- **Given** 四頁中任一頁的 MonthPicker 元件
- **When** 頁面渲染
- **Then** MonthPicker 的 label / placeholder 一律顯示「分派作業月份」（對齊 glossary 規定）
- **And** 不出現「作業年月」、「當月」、「本月」等舊標籤字串

### AC-6：不新增任何 E07 sidebar 路由

- **Given** F097 所有前端變更完成後
- **When** 使用者瀏覽 E07 側邊欄
- **Then** 不出現任何新的路由入口，所有變更為既有頁面行為調整

### AC-7：跨越年份邊界正確計算預設下月

- **Given** `current_work_ym = '202512'`（12 月）
- **When** `AssignmentWorkYmProvider` 初始化
- **Then** `target_work_ym` 預設 = `'202601'`（次年 1 月，而非 `'202513'`）

---

## 技術備註

- **Context 名稱建議**：`AssignmentWorkYmContext`，Provider 為 `AssignmentWorkYmProvider`，掛載於 assignment 區段 layout（如 `AssignmentLayout` 或 Router children wrapper）。
- **`current_work_ym` 取得**：Provider 初始化時呼叫一次 `GET /api/v1/system/current-work-ym`，結果存於 Context 供各頁讀取（`current_work_ym` + `target_work_ym`）。
- **前端禁用 `new Date()`**：各頁現有的 `function currentWorkYm() { const now = new Date(); ... }` helper 須移除，改由 Context 提供值。
- 下月計算：`const addOneMonth = (ym: string) => { const y = +ym.slice(0,4), m = +ym.slice(4,6); return m === 12 ? \`${y+1}01\` : \`${y}${String(m+1).padStart(2,'0')}\`; }`（spec-writer / tdd-implementation 可調整實作）。

---

## 依賴關係

- **Blocked By**：`GET /api/v1/system/current-work-ym`（已存在於 SystemController）
- **Blocks**：US-138（月名單分派觸發頁讀 Context）、US-139（前端傳 `workYm` 給後端）

---

## Definition of Done

- [ ] 驗收標準 AC-1 ~ AC-7 全部通過
- [ ] 單元測試覆蓋率 ≥ 80%（Context Provider 初始值 + 跨年邊界 + UI 標籤）
- [ ] 四頁 local `new Date()` helper 已移除
- [ ] Code review 通過
- [ ] 無新增 sidebar 路由（sidebar config 未變動）

---

## 相關文件

- **Glossary**：[docs/specs/glossary.md](../../../specs/glossary.md)（`target_work_ym` / `current_work_ym` / 共享月份狀態定義）
- **Feature Proposal**：[docs/specs/proposals/work-ym-semantics-unification.md](../../../specs/proposals/work-ym-semantics-unification.md) §5 D1、D2
- **F077 spec**：[docs/specs/features/F077-month-switch-and-stage-overview.md](../../../specs/features/F077-month-switch-and-stage-overview.md)（月份範圍 BR-2）
- **相關 Stories**：US-138、US-139、US-140、US-141、US-142、US-143
