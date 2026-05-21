# US-130：M01 名單定義主頁 Kanban 看板版視覺重構

> **Story ID**：US-130
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M01 名單定義
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：5

---

## User Story

**As a** 部長（Director）、Admin 或 處長（Section Chief）
**I want** 在名單定義主頁以 5 欄 Kanban 看板方式瀏覽各份名單，每欄代表一個流程階段
**So that** 能以橫向比較視角快速掌握全月名單的流程分佈，識別哪些階段有積壓、哪些名單尚未就緒

---

## 背景說明

v2.0 將名單定義主頁由平鋪表格（v1）改為 5 欄 Kanban 看板。5 欄分別對應五個流程階段：

| 欄位 | stage 值 | 欄頭顏色 |
|------|---------|---------|
| 草稿 | `draft` | 灰色 |
| 部門比例 | `dept_ratio` | 藍色 |
| 個別比例 | `personnel_ratio` | 青色 |
| 待簽核 | `approval` | 琥珀色 |
| 準備完成 | `ready` | 綠色 |

每欄頂部顯示該階段的名單數量（badge）與占全月名單的比例（mini progress bar）。頁面另設有 4 個 KPI 卡（名單總數 / 進行中 / 待簽核 / 準備完成）與月份準備度進度條，位於 KPI 卡與 Kanban 之間。

---

## 驗收標準

### AC-1：頁面主體呈現 5 欄 Kanban 看板

- **Given** 部長、Admin 或處長進入 M01 名單定義主頁
- **When** 頁面載入完成（依目前作業月份）
- **Then** 頁面主體顯示 5 欄看板，由左至右依序為：草稿 / 部門比例 / 個別比例 / 待簽核 / 準備完成
- **And** 每欄欄頭以顏色區分階段（草稿灰 / 部門比例藍 / 個別比例青 / 待簽核琥珀 / 準備完成綠）
- **And** 每欄欄頭右側顯示該欄名單數量（數字 badge，白字）
- **And** 欄頭下方顯示 mini progress bar，反映該欄名單數量占全月總數的百分比

### AC-2：名單以卡片形式展示於對應欄位

- **Given** 本月有若干份名單分散於各階段
- **When** 頁面渲染 Kanban
- **Then** 每份名單以卡片形式顯示於其 `stage` 對應的欄位中
- **And** 每張卡片顯示：LIST_NO（等寬字體）、LIST_NM（名單名稱）、篩選條件摘要 chips（最多 2 個，超出顯示 +N）、建立者、建立日期、CR 回分開關狀態（CR 啟用 / CR 停用 badge）
- **And** 若某欄無名單，顯示「無名單」灰色提示文字
- **And** 卡片欄位可垂直捲動（超過可見高度時）

### AC-3：4 個 KPI 卡顯示月份總覽數據

- **Given** 頁面載入完成
- **When** 系統依目前月份取得名單數據
- **Then** 頁面頂部顯示 4 個 KPI 卡：「名單總數」、「進行中」（dept_ratio + personnel_ratio + approval 的合計）、「待簽核」（approval 數量）、「準備完成」（ready 數量）
- **And** 各 KPI 卡數字隨月份切換即時更新

### AC-4：月份準備度進度條（KPI 卡與 Kanban 之間）

- **Given** 頁面載入完成
- **When** 系統計算本月各階段名單分佈
- **Then** KPI 卡與 Kanban 看板之間顯示一條水平進度條，以五色段（對應五個 stage）呈現各階段名單數量占比
- **And** 進度條左側標示「YYYY-MM 月份準備度」、已就緒份數（ready / 總數）與百分比
- **And** 進度條右側標示「尚有 N 份未完成準備」

### AC-5：搜尋框即時過濾 Kanban 卡片

- **Given** 頁面顯示 Kanban 看板
- **When** 使用者在工具列搜尋框輸入關鍵字
- **Then** 各欄僅顯示名單名稱或 LIST_NO 包含關鍵字的卡片，其餘卡片隱藏
- **And** 各欄欄頭的名單數量 badge 更新為過濾後的可見數量

### AC-6：歷史月份下看板全部進入唯讀模式

- **Given** 使用者切換至歷史月份（早於目前作業月份）
- **When** Kanban 渲染歷史月份名單
- **Then** 頁面頂部顯示「歷史月份資料為唯讀」紅色橫幅
- **And** 所有卡片上的寫入操作按鈕（停用 / 推進 / 退回 / 設定）隱藏，僅保留「查看」按鈕
- **And** 工具列「新增名單」按鈕隱藏

### AC-7：`user` 角色整頁封鎖

- **Given** 帳號持有「user」角色
- **When** 進入 M01 名單定義主頁
- **Then** Kanban 主體隱藏，取而代之顯示封鎖說明卡（「名單定義為部長 / 處長 / Admin 專屬功能」）

---

## 技術備註

- v1 的平鋪表格視圖由本 Story 的 Kanban 看板取代；v1 相關 AC（表格列格式）視為 deprecated
- KPI 卡與進度條的數據來源與 Kanban 本體相同，無需額外 API
- 篩選條件摘要 chips 的產生規則：`condition_payload` 有值時取前 2 個條件顯示；為 NULL（舊名單）時顯示 `LEGACY` badge
- Kanban 欄的可見高度建議 720px，超出後 scroll；卡片 hover 有輕微浮起效果

---

## 測試案例

### TC-130-01：正常顯示 5 欄看板

- **Given**：本月共 11 份名單（draft×2、dept_ratio×2、personnel_ratio×3、approval×1、ready×3）；部長帳號
- **When**：部長進入 M01 主頁
- **Then**：5 欄看板各欄顯示正確卡片數量（badge 數字與卡片數一致）；KPI 卡「進行中」顯示 6、「準備完成」顯示 3

### TC-130-02：處長只看到轄區名單

- **Given**：本月 11 份名單中，3 份屬處長 A 轄區（createdBy = 處長 A）
- **When**：處長 A 進入主頁
- **Then**：看板僅顯示 3 張卡片，分散於對應欄位；KPI 卡總數顯示 3

### TC-130-03：搜尋過濾

- **Given**：Kanban 正常顯示
- **When**：使用者在搜尋框輸入「業務一部」
- **Then**：各欄僅保留 LIST_NM 含「業務一部」的卡片，其他卡片隱藏

### TC-130-04：歷史月份唯讀

- **Given**：部長切換至上一個月份
- **When**：Kanban 渲染歷史月份名單
- **Then**：紅色唯讀橫幅顯示；所有卡片上的寫入按鈕消失；僅「查看」按鈕存在

### TC-130-05：user 角色封鎖

- **Given**：帳號角色為 `user`
- **When**：進入 M01 主頁
- **Then**：Kanban 不顯示，顯示封鎖說明卡

---

## 依賴關係

- **Blocked By**：US-070（M01 清單頁基礎架構）、US-104（月份切換）
- **Blocks**：US-131（Detail Drawer，依賴 Kanban 卡片上的「查看」按鈕入口）、US-132（Ready CTA Banner，顯示於 Kanban ready 欄頂部）
- **取代**：US-105 的表格式清單呈現（US-105 的 stage 狀態與 role 邏輯 AC 仍有效，僅呈現形式由表格改為 Kanban）

---

## Definition of Done

- [ ] 驗收標準全部通過
- [ ] 5 欄看板正常顯示測試（TC-130-01）
- [ ] 處長轄區過濾測試（TC-130-02）
- [ ] 搜尋過濾測試（TC-130-03）
- [ ] 歷史月份唯讀測試（TC-130-04）
- [ ] user 角色封鎖測試（TC-130-05）
- [ ] 單元測試覆蓋率 ≥ 80%
- [ ] Code review 通過
- [ ] 文件已更新

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **Prototype**：`prototypes/27-list-definition.html`（v2.0 ~ v2.3 canonical）
- **相關 Stories**：US-070（M01 主頁基礎）、US-104（月份切換）、US-105（五階段狀態邏輯）、US-131（Detail Drawer）、US-132（Ready CTA Banner）

---

## 命名修正紀錄

- **2026-05-21**：將 AC 內文中的 `indiv_ratio`（3 處）統一修正為 `personnel_ratio`，以對齊 DB enum、既有 spec 及 backend 的 source of truth。中文 display label「個別比例」不受影響。
