# US-143：F077 spec 更新預設月份為下月，UI 標籤正名「分派作業月份」

> **Story ID**：US-143
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M01 名單定義（spec 文件更新）
> **優先級**：Must Have
> **階段**：Phase 3（語意正名，功能面 US-137~142 完成後）
> **預估點數**：1
> **Feature**：F097 作業月語意統一
> **執行者**：spec-writer（此 story 為 spec 文件維護任務，不涉及 code 變更）

---

## User Story

**As a** spec-writer / 下游開發者
**I want** F077 spec 中關於月份預設值的描述更新為「預設 = `current_work_ym + 1`（下月）」，並在所有相關頁面的 spec 描述中正名「分派作業月份」
**So that** 後續查看 F077 的開發者不會誤解「預設顯示當月」這個已廢棄的行為描述，避免 naming drift 導致下游 spec / test / UI 恢復舊行為

---

## 背景說明

F077 v1.3（2026-05-21）現行描述：

- §7 UI/UX 月份切換器「預設顯示 `current_work_ym`」
- AC-1：「預設顯示目前作業月份」
- AC-3：「前端透過 GET `/api/v1/system/current-work-ym` 取得，不自行計算」

F097 後四頁預設月改為 `target_work_ym`（= `current_work_ym + 1`），F077 的預設值描述需同步更新，否則對 F077 的引用將產生語意矛盾。

另外 F077 BR-7 C-4 中殘留舊文字「處長 `created_by = currentUserId` 過濾」（BR-4 v1.4 已更新為 `SectionChiefScopeService`，C-4 cell 未同步），此為既有文件小瑕疵，由 spec-writer 一併修正。

---

## 驗收標準

### AC-1：F077 §7 UI/UX 月份切換器預設值描述更新

- **Given** F077 v1.3 §7 描述「預設顯示 `current_work_ym`」
- **When** spec-writer 更新 F077 spec（升版 v1.4）
- **Then** 改為「預設顯示 `target_work_ym`（= `current_work_ym + 1`，即下月）；`current_work_ym` 由後端計算，`target_work_ym` 由前端 `AssignmentWorkYmContext` 提供」

### AC-2：F077 AC-1 驗收標準同步更新

- **Given** F077 AC-1：「預設顯示目前作業月份」
- **When** 更新
- **Then** 改為「預設顯示分派作業月份（`target_work_ym`，預設為 `current_work_ym + 1`，即下月）」

### AC-3：F077 AC-3 補充 `target_work_ym` 說明

- **Given** F077 AC-3 描述 `current_work_ym` 的取得方式
- **When** 更新
- **Then** 補充：「`target_work_ym` = `current_work_ym + 1`（預設）；由前端 `AssignmentWorkYmContext` 管理，涵蓋四頁（名單定義 / 準備完成摘要 / Stage 0 試算 / 月跑觸發）；月跑歷史頁維持獨立 local state」

### AC-4：F077 BR-7 C-4 舊文字修正（既有瑕疵）

- **Given** F077 BR-7 矩陣下方 C-4 條件：「後端依 `created_by = currentUserId` 過濾」
- **When** 更新（配合 BR-4 v1.4 已採 `SectionChiefScopeService` 的既有修正）
- **Then** C-4 改為「後端依 `SectionChiefScopeService.getScopeDeptCode(userId)` 過濾（對齊 BR-4 v1.4）」

### AC-5：F077 版本號升至 v1.4，變更紀錄補充

- **Given** F077 目前為 v1.3
- **When** 更新完成
- **Then** version 改為 `"1.4"`，date 更新，§變更紀錄新增一條：「v1.4（F097）：預設月份改為 `target_work_ym`（= `current_work_ym + 1`）；補充 `AssignmentWorkYmContext` 說明；修正 BR-7 C-4 殘留舊文字（對齊 BR-4 v1.4 `SectionChiefScopeService`）」

### AC-6：各頁 spec / prototype 中「當月」UI 標籤字串不屬本 story 範疇

- **Given** 前端程式碼中出現的「作業年月 {ym}」、「本月（{ym}）」等字串
- **When** 本 story 執行
- **Then** 這些字串的修改屬前端實作任務（US-137 ~ US-138 AC-5 已規範），**本 story 僅修改 F077 spec 文件**，不觸碰前端程式碼

---

## 技術備註

- 此 story 為**純文件更新**，無程式碼、無 DB migration、無測試變更。
- spec-writer 更新 F077 時，需同時確認 spec-index.md 中 F077 的版本號與 date 欄位同步更新。
- 若 F077 的 §10 測試覆蓋目標中有「前端月份切換器預設值 = `current_work_ym`」相關測試描述，一併改為 `target_work_ym`。

---

## 依賴關係

- **Blocked By**：US-137 ~ US-142（功能面先完成，確認行為後才更新 spec 描述避免反覆）
- **Blocks**：無

---

## Definition of Done

- [ ] F077 spec 升版 v1.4，AC-1 ~ AC-5 全部完成
- [ ] spec-index.md 中 F077 版本號 / date 同步更新
- [ ] Code review（doc review）通過

---

## 相關文件

- **Glossary**：[docs/specs/glossary.md](../../../specs/glossary.md)（所有命名的單一權威來源）
- **F077 v1.3**：[docs/specs/features/F077-month-switch-and-stage-overview.md](../../../specs/features/F077-month-switch-and-stage-overview.md)（待更新目標）
- **Feature Proposal**：[docs/specs/proposals/work-ym-semantics-unification.md](../../../specs/proposals/work-ym-semantics-unification.md) §5 D7、§7 R1
- **相關 Stories**：US-137（共享 Context 實作，為本 story 的 spec 更新依據）
