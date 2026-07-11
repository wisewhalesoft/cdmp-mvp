# US-132：M01 Ready 欄頂 CTA Banner（月名單分派與試算唯一入口）

> **Story ID**：US-132
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M01 名單定義
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：3
> **Gap 覆蓋**：G3（Ready CTA 雙按鈕 UI 規範）

---

## User Story

**As a** 部長（Director）或 Admin
**I want** 在 Kanban 的「準備完成」欄頂部看到一個 CTA banner，包含「執行月名單分派」主按鈕與「試算」次要按鈕
**So that** 月名單分派的唯一觸發入口清晰可見，同時能在正式執行前先以試算確認預期結果，避免因入口分散造成操作混亂

---

## 背景說明

v2.2 + v2.3 的語意修正：

- **v2.2**：移除 ready 階段各名單卡片上的 per-card「觸發」按鈕。月名單分派是月份級操作（F078 原子性月名單分派語意），per-list 觸發違反此語意。改以 Ready 欄頂 CTA banner 作為月名單分派唯一入口。
- **v2.3**：在 CTA banner 新增 secondary「試算」按鈕（連至 Stage 0 試算頁），與主按鈕並排。同步移除 Toolbar 上的「執行月名單分派」與「Stage 0 試算」重複入口按鈕。

---

## 驗收標準

### AC-1：Ready 欄頂部顯示 CTA Banner（當月 + 有就緒名單）

- **Given** 部長或 Admin 在目前作業月份的 M01 名單定義主頁
- **When** `ready` 欄的名單數量 > 0，且目前月份為作業月份（非歷史月份）
- **Then** `ready` 欄的欄頭與卡片區之間顯示 CTA banner，綠色底色
- **And** banner 頂部文字：「✓ N 份名單已準備完成」（N 為 ready 欄名單數量）
- **And** banner 包含兩個並排按鈕：
  - 主按鈕（藍底白字）：「執行 YYYY-MM 月名單分派」，點擊導向 `31-trigger-run` 頁面
  - secondary 按鈕（白底藍邊）：「試算」（附計算機 icon），點擊導向 `30-stage0-estimate` 頁面

### AC-2：Ready 欄無就緒名單時不渲染 Banner

- **Given** 本月 `ready` 欄名單數量為 0
- **When** Kanban 渲染
- **Then** `ready` 欄頂部不顯示 CTA banner（欄頭直接銜接卡片區）

### AC-3：歷史月份不渲染 Banner

- **Given** 使用者切換至歷史月份
- **When** Kanban 渲染歷史月份 ready 欄
- **Then** 即使 ready 欄有名單，也不渲染 CTA banner
- **And** ready 欄卡片進入唯讀模式（同 US-130 AC-6）

### AC-4：月名單分派執行中 Banner 進入禁用狀態

- **Given** 目前有 AssignmentRun status = 'running' 的月名單分派
- **When** Kanban 渲染（目前作業月份，ready 欄有名單）
- **Then** CTA banner 底色改為琥珀色（警告色），頂部文字改為「分派執行中，無法重新觸發」
- **And** 主按鈕與 secondary「試算」按鈕均為禁用（disabled）狀態，無法點擊

### AC-5：Toolbar 不再提供月名單分派或試算入口（重複入口移除）

- **Given** 部長或 Admin 在 M01 名單定義主頁
- **When** 頁面載入完成
- **Then** Toolbar 區域不顯示「執行月名單分派」按鈕，也不顯示「Stage 0 試算」按鈕
- **And** Toolbar 僅包含：搜尋框、新增名單按鈕（director / admin 才顯示）

### AC-6：Ready 欄 per-card 觸發按鈕已移除

- **Given** 部長或 Admin 查看 `ready` 階段的名單卡片
- **When** 卡片渲染操作按鈕
- **Then** 卡片上無任何「觸發月名單分派」或「執行」相關按鈕
- **And** ready 卡片僅顯示：「退回」按鈕（director / admin）+ 「查看」按鈕（所有角色）

---

## 技術備註

- CTA banner 渲染條件：`cnt.ready > 0 && !isHistoricalMonth(currentYm) && isCurrentMonth`
- 月名單分派執行中狀態判斷：查詢 AssignmentRun 是否有 status = 'running' 記錄（與 US-070 AC-4 邏輯一致）
- 主按鈕導向：`31-trigger-run.html`（對應 US-081 月名單分派觸發頁）
- secondary 按鈕導向：`30-stage0-estimate.html`（對應 US-071 Stage 0 試算頁）
- `data-write-action="trigger-month-run"` 屬性應掛在主按鈕上，歷史月份 / 月名單分派中時此 attribute 的元素自動隱藏或禁用

---

## 測試案例

### TC-132-01：正常顯示 CTA Banner

- **Given**：目前月份 2026-05；ready 欄有 3 份名單；無月名單分派執行中；部長帳號
- **When**：部長進入 M01 主頁
- **Then**：ready 欄頂部顯示綠色 banner「✓ 3 份名單已準備完成」；主按鈕「執行 2026-05 月名單分派」（藍底）；secondary「試算」（白底藍邊）

### TC-132-02：Ready 為 0 時不顯示 Banner

- **Given**：目前月份；ready 欄無名單
- **When**：Kanban 渲染
- **Then**：ready 欄無 banner，欄頭直接銜接「無名單」提示

### TC-132-03：歷史月份不顯示 Banner

- **Given**：使用者切換至 2026-04（歷史月份）；該月份 ready 欄有 2 份名單
- **When**：Kanban 渲染
- **Then**：ready 欄無 CTA banner，卡片進入唯讀模式

### TC-132-04：月名單分派執行中 Banner 禁用

- **Given**：AssignmentRun status = 'running'；ready 欄有 3 份名單
- **When**：Kanban 渲染
- **Then**：banner 呈禁用樣式（琥珀底色）；主按鈕與「試算」按鈕均 disabled

### TC-132-05：Toolbar 無月名單分派 / 試算按鈕

- **Given**：部長在 M01 主頁
- **When**：頁面載入
- **Then**：Toolbar 區域不存在「執行月名單分派」或「Stage 0 試算」任何按鈕

---

## 依賴關係

- **Blocked By**：US-130（Kanban 主頁，Banner 為 ready 欄的子元件）、US-081（月名單分派觸發頁，Banner 主按鈕導向目標）、US-071（Stage 0 試算頁，Banner secondary 按鈕導向目標）
- **Blocks**：（本 Story 為 UI 規則定義，不阻擋其他業務流程 Story）
- **取代**：v1 Toolbar 上的「執行月名單分派」與「Stage 0 試算」按鈕；ready 卡片上的 per-card 觸發按鈕

---

## Definition of Done

- [ ] 驗收標準全部通過
- [ ] 正常 Banner 顯示測試（TC-132-01）
- [ ] Ready 為 0 時不顯示測試（TC-132-02）
- [ ] 歷史月份不顯示測試（TC-132-03）
- [ ] 月名單分派執行中禁用測試（TC-132-04）
- [ ] Toolbar 無重複入口測試（TC-132-05）
- [ ] 單元測試覆蓋率 ≥ 80%
- [ ] Code review 通過
- [ ] 文件已更新

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **Prototype**：`prototypes/27-list-definition.html`（v2.2 readyCtaHtml 段落，行 713-751；v2.3 Toolbar 段落，行 273-284）
- **Gap 覆蓋**：G3（Ready CTA 雙按鈕 UI 規範）
- **相關 Stories**：US-130（Kanban 主頁）、US-081（月名單分派觸發，主按鈕目標）、US-071（Stage 0 試算，secondary 按鈕目標）、US-070（Toolbar 規則，AC-1 配合修改）
