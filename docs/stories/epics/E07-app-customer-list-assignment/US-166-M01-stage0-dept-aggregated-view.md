---
last-updated: 2026-06-26
version: v1.0
change-summary: "Stage 0 試算頁預設改為全名單彙總（部門維度），淘汰原始「單一 LIST_NO 技術視角」預設；保留單一名單鑽探為可選篩選。取代 US-071 AC-1 / AC-2 / AC-3 / AC-4-Default。"
supersedes: US-071
---

# US-166：Stage 0 試算頁預設為全名單彙總（部門維度每日分派量）

> **Story ID**：US-166
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M01 名單定義
> **優先級**：Must Have
> **階段**：Phase 2（Advanced）
> **預估點數**：8
> **Feature**：Stage 0 試算頁業務化重設計
> **取代**：[US-071](US-071-M01-stage0-daily-estimate.md)（AC-1 / AC-2 / AC-3 / AC-4-Default 已 superseded）

---

## 背景說明

US-071 定義的 Stage 0 試算頁以「單一 LIST_NO 選取」為操作起點，預設僅顯示一筆名單的每日件數。業務部長 / 處長真正關心的問題是：「這個月每天整體工作量合不合理？哪個課的電訪量太重？」——無論背後有多少份名單，都應彙總為一個跨名單、以部門為單位的每日分派預估視圖。

本 Story 改寫試算頁的預設視角，同時保留單一名單鑽探能力（作為可選篩選，而非預設出發點）。

---

## User Story

**As a** 業務部長（director）或業務處長（section_chief）
**I want** 開啟試算頁時，直接看到「本月所有啟用名單彙總後，各部門每日預估分派件數」
**So that** 無需逐份名單手動加總，即可判斷整體工作量配置是否合理，並識別是否有特定課別人員過載

---

## 驗收標準

### AC-1：預設視角為跨名單彙總（全名單模式）

- **Given** 業務部長 / 處長進入 `/assignment/estimate`，且當月（`project_workym = currentWorkYm`）有至少一筆 `status = 'active'` 的 `ob_list_definition`
- **When** 頁面初次載入
- **Then** 頁面進入「全名單彙總」模式：將所有啟用名單的件數合計後，顯示**部門維度的每日預估分派量**（詳細計算規則見 US-167）
- **And** 頁面頂端標示「顯示模式：所有啟用名單彙總」（或等效文案），使用者清楚知道當前是彙總視角
- **And** 不再預設自動選取「第一筆名單」作為起始狀態（取代 US-071 AC-4-Default）

### AC-2：名單篩選器切換至單一名單鑽探

- **Given** 頁面正在「全名單彙總」模式顯示
- **When** 使用者透過「名單篩選」下拉選單（新增「全部名單」選項作為預設）選取某一特定 `list_no`
- **Then** 頁面切換至「單一名單模式」：僅顯示該名單在各部門的每日預估分派量
- **And** 頁面標示「顯示模式：單一名單 `{list_nm}（{list_no}）`」
- **And** 部門維度的計算邏輯與彙總模式相同（僅輸入名單集合不同），見 US-167

### AC-3：切換回全名單彙總

- **Given** 頁面目前在「單一名單模式」
- **When** 使用者於名單篩選器選取「全部名單」
- **Then** 頁面回到「全名單彙總」模式，所有啟用名單重新合計顯示

### AC-4：當月無啟用名單時的空狀態

- **Given** 當月無任何 `status = 'active'` 的 `ob_list_definition`
- **When** 頁面載入
- **Then** 顯示空狀態提示文案：「本月尚無啟用名單，請先於名單定義頁建立並啟用名單」
- **And** 所有估算表格 / 圖表區域顯示「—」，不渲染任何計算數值

### AC-5：更換作業月份後重新彙總

- **Given** 頁面顯示著某月的彙總估算
- **When** 使用者透過月份選取器切換到另一個月
- **Then** 頁面以新月份的所有啟用名單重新計算彙總，頁面資料完整更新

### AC-6：試算僅為預覽、不寫入任何分派資料

- **Given** 試算頁在任何模式（彙總或單一名單）下顯示估算結果
- **When** 估算計算完成
- **Then** 系統**不**寫入 `ob_pool_data_list`、`assignment_run`、或任何分派紀錄
- **And** 此行為與 F049 BR-1 / F092 AC-2 一致（estimate ≡ run invariant 保留於唯讀層）

> **架構約束（非功能需求）**：每日 ratioPerMille 計算與月名單分派 Stage 4 ASSIGNDAY 共用同一 `computeWorkingDayRatios` 邏輯（AD-E07-29 §3.4 / I-RUN-EST-01）。本 Story 的彙總改動不得破壞此 invariant；spec-writer / 系統架構師確認聚合層僅在 ratio 計算之上新增加法，不修改底層 calendar 邏輯。

---

## 測試案例

### TC-166-01：頁面預設進入全名單彙總模式

- **Given**：當月有 3 筆 active 名單（LIST-A、LIST-B、LIST-C），每筆有不同的 per-list COUNT
- **When**：業務部長開啟試算頁
- **Then**：頁面標示「所有啟用名單彙總」，部門每日件數反映三份名單的合計值（而非僅 LIST-A）
- **And**：名單篩選下拉顯示「全部名單（預設）」為選中狀態

### TC-166-02：切換至單一名單鑽探後再切回

- **Given**：頁面處於全名單彙總模式
- **When**：選取 LIST-B → 驗證切換 → 再選「全部名單」
- **Then**：切換 LIST-B 後顯示模式標示更新為「單一名單 LIST-B」；回選「全部名單」後恢復彙總標示且件數回到三份名單合計

### TC-166-03：當月無啟用名單

- **Given**：當月無任何 active ob_list_definition
- **When**：頁面載入
- **Then**：顯示空狀態文案，所有數值欄顯示「—」，不顯示任何計算結果

### TC-166-04：估算完成後不寫入任何資料庫紀錄

- **Given**：頁面顯示全名單彙總估算結果
- **When**：查詢 ob_pool_data_list、assignment_run 的 row count
- **Then**：row count 與估算前相同，無新資料寫入

---

## 依賴關係

- **Blocked By**：US-167（部門每日件數計算公式，為本 Story 的數值來源）
- **Blocks**：US-168（處長存取本頁面前，頁面本身必須先能以部門維度呈現）、US-169（可行性指標建立在本 Story 的每日件數之上）、US-170（術語清理依賴本 Story 提供的新頁面架構）

---

## Definition of Done

- [ ] AC-1 ~ AC-6 全部通過
- [ ] TC-166-01 ~ TC-166-04 全部通過
- [ ] 頁面預設進入全名單彙總模式（非單一名單），regression test 確認
- [ ] 無寫入 DB 的 side effect（TC-166-04）
- [ ] 月份切換後資料完整重算
- [ ] `tsc --noEmit -p tsconfig.build.json` 乾淨通過
- [ ] 單元測試覆蓋率 ≥ 80%
- [ ] Code review 通過
- [ ] 文件已更新（F049 spec 彙總模式章節）

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **取代**：[US-071](US-071-M01-stage0-daily-estimate.md)（AC-1/AC-2/AC-3/AC-4-Default 已 superseded）
- **相關 Stories**：US-167（部門公式）、US-168（處長存取）、US-169（可行性指標）、US-170（術語清理）
- **Spec**：`docs/specs/features/F049-stage0-daily-estimate.md`（需新增彙總模式章節）
- **UI Ground Truth**：`prototypes/30-stage0-estimate.html`（以更新後 prototype 為準）
