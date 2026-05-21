# US-131：M01 名單 Detail Drawer（全快照側拉抽屜，4 tabs）

> **Story ID**：US-131
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M01 名單定義
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：5
> **Gap 覆蓋**：G1（`/full-snapshot` API 規範）

---

## User Story

**As a** 部長（Director）、Admin 或 處長（Section Chief）
**I want** 在名單定義主頁點擊任意名單卡片上的「查看」按鈕，從右側滑入一個包含 4 個頁籤的側拉抽屜，查看該名單的篩選條件、部門比例、個別比例與簽核歷史
**So that** 不必離開主頁或進入子頁即可全面掌握名單設定詳情，解決過去各階段「盲簽」（簽核時看不到完整設定）的問題

---

## 背景說明

v2.1 補強：所有角色在所有階段（包含非 draft 的名單）可透過「查看」按鈕開啟 Detail Drawer。

Drawer 規格：
- 觸發方式：Kanban 卡片上的「查看」按鈕（所有角色、所有階段均可觸發）
- 位置：頁面右側滑入（right slide-in），不遮蓋主要操作
- 關閉方式：點擊抽屜外 backdrop 或右上角 ✕ 按鈕
- 資料來源：`GET /api/v1/assignment/list-definitions/:listNo/full-snapshot`
- 4 個頁籤：篩選條件 / 部門比例 / 個別比例 / 簽核歷史

---

## 驗收標準

### AC-1：所有角色在所有階段均可開啟 Drawer

- **Given** 部長、Admin 或處長在 M01 名單定義主頁（US-130 Kanban）
- **When** 使用者點擊任意名單卡片上的「查看」按鈕
- **Then** 頁面右側滑入 Detail Drawer，backdrop 遮蓋主體
- **And** Drawer 頭部顯示：LIST_NO（等寬字體）、名單名稱、當前階段 badge、CR 狀態 badge、建立者、建立日期、月份
- **And** 歷史月份與目前月份均可開啟 Drawer

### AC-2：「篩選條件」頁籤顯示完整條件

- **Given** Detail Drawer 已開啟，預設停在「篩選條件」頁籤
- **When** 使用者查看「篩選條件」頁籤內容
- **Then** 顯示該名單 `condition_payload` 中的所有篩選條件，每個條件顯示：欄位顯示名稱（`display_name`）、欄位型別（類別型 / 數值型）、條件值（IN 值列表 / min~max 區間）
- **And** 底部顯示 logic 運算子（AND / OR）與資料來源標示（`condition_payload`）
- **And** 若 `condition_payload` 為 NULL（舊名單），顯示 `LEGACY` 標籤並改以舊格式展示 entity column 值

### AC-3：「部門比例」頁籤顯示各部門配比

- **Given** Detail Drawer 已開啟，使用者切換至「部門比例」頁籤
- **When** 頁籤內容渲染
- **Then** 顯示本名單各部門（DEPT_NAME）的分派比例（RATION %）列表
- **And** 若名單尚未進入 `dept_ratio` 階段（stage = 'draft'），顯示「尚未設定部門比例」提示
- **And** 資料唯讀，無編輯控件

### AC-4：「個別比例」頁籤顯示業務員配比

- **Given** Detail Drawer 已開啟，使用者切換至「個別比例」頁籤
- **When** 頁籤內容渲染
- **Then** 顯示本名單各業務員（EMP_NM）的個別分派比例（RATION %），依部門分組呈現
- **And** 處長帳號僅顯示本轄區部門的業務員資料，其他部門不顯示
- **And** 若名單尚未進入 `personnel_ratio` 階段，顯示「尚未設定個別比例」提示
- **And** 資料唯讀，無編輯控件

### AC-5：「簽核歷史」頁籤顯示流程 timeline

- **Given** Detail Drawer 已開啟，使用者切換至「簽核歷史」頁籤
- **When** 頁籤內容渲染
- **Then** 以時間線（timeline）形式顯示本名單從 `draft` 建立至目前階段的所有流程事件（推進、退回、核准、拒絕），每筆事件顯示：操作類型、操作者帳號、操作時間
- **And** 若尚無歷史記錄（剛建立的 draft），顯示「尚無流程歷史」提示

### AC-6：Drawer 關閉不影響主頁 Kanban 狀態

- **Given** Detail Drawer 已開啟
- **When** 使用者點擊 backdrop 或 ✕ 按鈕關閉 Drawer
- **Then** Drawer 向右滑出，backdrop 消失
- **And** 主頁 Kanban 狀態、搜尋內容、月份選取均不改變

---

## 技術備註

- API 端點（v2.1 新增）：`GET /api/v1/assignment/list-definitions/:listNo/full-snapshot`，應回傳 conditions、dept_ratio、personnel_ratio、audit_history 四個區塊的資料
- 處長的個別比例視角過濾：後端依處長帳號的轄區（DEPT_CODE）過濾 `ob_empl_set`，或前端依帳號 DEPT_CODE 過濾回傳資料
- Drawer 為唯讀展示，不提供任何編輯入口
- 簽核歷史資料來源：`assignment_audit_log`，過濾條件 `list_no = :listNo`

---

## 測試案例

### TC-131-01：部長開啟 draft 階段名單 Drawer

- **Given**：LIST_NO = 'OB202605001'，stage = 'draft'，有 2 個篩選條件；部長帳號
- **When**：部長點擊卡片「查看」
- **Then**：Drawer 滑入；「篩選條件」頁籤顯示 2 個條件；「部門比例」頁籤顯示「尚未設定部門比例」；「個別比例」頁籤顯示「尚未設定個別比例」；「簽核歷史」頁籤顯示「尚無流程歷史」（或僅有建立事件）

### TC-131-02：部長開啟 ready 階段名單 Drawer（完整 4 tabs）

- **Given**：LIST_NO = 'OB202605009'，stage = 'ready'，有完整設定（條件 2 個、部門 2 個、業務員 4 人、歷史 5 筆）；部長帳號
- **When**：部長點擊「查看」
- **Then**：4 個頁籤均有內容；部門比例顯示 2 個部門；個別比例顯示 4 人（2 部門各 2 人）；簽核歷史顯示 5 筆事件

### TC-131-03：處長個別比例頁籤僅顯示轄區資料

- **Given**：LIST_NO = 'OB202605009'，有部門 XTC0（2 人）和 XTD0（2 人）；處長 A 轄區為 XTC0
- **When**：處長 A 開啟 Drawer，切換至「個別比例」頁籤
- **Then**：僅顯示 XTC0 的 2 位業務員；XTD0 資料不顯示

### TC-131-04：舊名單（LEGACY）篩選條件頁籤

- **Given**：LIST_NO = 'OB202604098'，condition_payload = NULL，有 legacyEntityFallback
- **When**：使用者開啟 Drawer，查看「篩選條件」頁籤
- **Then**：顯示 `LEGACY` 標籤；以舊格式展示 entity column 值

### TC-131-05：Drawer 關閉後 Kanban 狀態不變

- **Given**：使用者在搜尋框已輸入「業務一部」，Drawer 為開啟狀態
- **When**：使用者點擊 ✕ 關閉 Drawer
- **Then**：Drawer 關閉；搜尋框仍顯示「業務一部」；Kanban 過濾狀態不改變

---

## 依賴關係

- **Blocked By**：US-130（Kanban 主頁，提供「查看」按鈕入口）、US-109（部門比例資料）、US-112（個別比例資料）、US-116（核准歷史）
- **Blocks**：（本 Story 本身為唯讀，不阻擋其他 Story）

---

## Definition of Done

- [ ] 驗收標準全部通過
- [ ] draft 名單 Drawer 測試（TC-131-01）
- [ ] ready 名單完整 4 tabs 測試（TC-131-02）
- [ ] 處長轄區過濾測試（TC-131-03）
- [ ] 舊名單 LEGACY 顯示測試（TC-131-04）
- [ ] Drawer 關閉狀態不變測試（TC-131-05）
- [ ] 單元測試覆蓋率 ≥ 80%
- [ ] Code review 通過
- [ ] 文件已更新

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **Prototype**：`prototypes/27-list-definition.html`（v2.1 Detail Drawer 段落，行 366-428）
- **Gap 覆蓋**：G1（`GET /assignment/list-definitions/:listNo/full-snapshot` 缺 spec）
- **相關 Stories**：US-130（Kanban 主頁）、US-118（準備完成查詢摘要，Drawer 為其補充入口）、US-123（舊名單 fallback 顯示邏輯）

---

## 命名修正紀錄

- **2026-05-21**：將 AC 內文及技術備註中的 `indiv_ratio`（2 處）統一修正為 `personnel_ratio`，以對齊 DB enum、既有 spec 及 backend 的 source of truth。中文 display label「個別比例」不受影響。
