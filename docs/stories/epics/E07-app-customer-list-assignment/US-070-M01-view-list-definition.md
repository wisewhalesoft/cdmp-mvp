---
last-updated: 2026-05-19
version: v2.1-refactor
change-summary: "v2.1 修改：AC-1 篩選條件摘要欄位改讀 condition_payload（補 fallback 語意）；AC-2 詳情頁條件來源改為 condition_payload；新增 AC-6（舊名單 fallback 摘要顯示）。GAP 覆蓋：F6、G6。"
---

# US-070：查看本月名單定義清單

> **Story ID**：US-070
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M01 名單定義
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：3

---

## User Story

**As a** 業務主管
**I want** 查看本月各 Stage 的名單定義條件清單
**So that** 在觸發月名單分派之前，確認每個 Stage 的篩選條件與預期涵蓋範圍符合本月業務策略

---

## 驗收標準

### AC-1：顯示本月名單定義清單（含操作欄與新增按鈕）

~~（v1.0 原文）顯示本作業年月下所有 STATUS = 'active' 名單定義列表，每列包含：LIST_NO、LIST_NM、PROD_KIND（產品類別）、篩選條件摘要、預估客戶數量。~~

**（v2.1 修改）**

- **Given** 業務主管已登入系統並進入名單定義頁面
- **When** 頁面載入完成
- **Then** 顯示本作業年月（YYYYMM）下所有 STATUS = 'active' 名單定義列表，每列包含：LIST_NO、LIST_NM（名單名稱）、**篩選條件摘要**（見下方說明）、預估客戶數量，以及「編輯」、「停用」操作欄
- **And** 清單依 LIST_NO 升序排列
- **And** 頁面標頭顯示「新增名單定義」按鈕，點擊進入 US-106 建立名單流程

**篩選條件摘要欄位規則（v2.1 新增）**：
- 若名單 `condition_payload` 有值：摘要以 condition_payload 產生人類可讀描述（例如「PROD_KIND: 汽車新車 OR 機車；SPEC_TP: 02, 04」）
- 若名單 `condition_payload` 為 NULL（舊遷移名單）：依 AC-6 的 fallback 規則顯示

### AC-2：查看單一名單條件詳情

~~（v1.0 原文）展開或跳至詳情頁，顯示該 Stage 的完整篩選條件（包含每個條件欄位名稱、運算子、條件值）~~

**（v2.1 修改）**

- **Given** 名單定義清單已顯示
- **When** 業務主管點擊某一名單列（或詳情展開按鈕）
- **Then** 展開或跳至詳情頁，顯示該名單的完整篩選條件
- **And** 若 `condition_payload` 有值：顯示各條件的欄位顯示名稱（`display_name`）、欄位類別（數值型 / 類別型）、條件值（IN 值列表 / min~max 區間）
- **And** 若 `condition_payload` 為 NULL（舊名單）：顯示 entity column 值，並顯示「舊格式」標籤（見 AC-6）

### AC-3：無資料時的引導提示

- **Given** 本月名單定義尚未建立（OBMLISTDF 無本月 STATUS = 'active' 記錄）
- **When** 頁面載入完成
- **Then** 顯示空白狀態提示：「本月（YYYYMM）尚無名單定義，請點擊『新增名單定義』建立本月分派條件」

### AC-4：月名單分派執行中所有操作按鈕停用

- **Given** 目前有 AssignmentRun status = 'running' 的月名單分派
- **When** 業務主管在名單定義清單頁面
- **Then** 「新增名單定義」按鈕、每列的「編輯」按鈕、「停用」按鈕均為停用（disabled）狀態
- **And** 頁面頂部顯示橘色通知列：「分派執行中，名單定義暫時鎖定，無法進行新增、編輯或停用操作」

### AC-5：「使用中」／「已停用」獨立頁籤切換

- **Given** 業務主管已進入名單定義頁面
- **When** 頁面載入完成
- **Then** 頁面顯示兩個獨立頁籤：「使用中」（STATUS = 'active'）與「已停用」（STATUS = 'inactive'）
- **And** 預設顯示「使用中」頁籤，「已停用」頁籤中的名單列表僅供唯讀查閱，不顯示「編輯」或「停用」按鈕

### AC-6：舊名單（condition_payload IS NULL）篩選條件摘要 fallback 顯示（v2.1 新增）

> **涵蓋 GAP**：F6、G6（對應 US-123 AC-1）

- **Given** 清單中某名單的 `condition_payload` 為 NULL（舊遷移名單）
- **When** 頁面載入，顯示清單或詳情
- **Then** 該名單的「篩選條件摘要」欄位以 fallback 格式呈現 entity column 的值，例如「（舊格式）PROD_KIND=01$$02；SPEC_TP=02$$04；CASE_STATUS=01」
- **And** 清單列顯示「舊格式」視覺標籤（例如灰色 badge），讓使用者知道此名單尚未轉換為新格式
- **And** 使用者點擊此名單進入詳情頁時，亦以同樣的 fallback 格式顯示，並附提示說明（詳見 US-123 AC-2）

---

## 技術備註

- 名單定義資料來源：`reference/TableSchema/OB/OBMLISTDF.sql`（OBMLISTDF 表，含 STATUS 欄位）
- 各 Stage 條件欄位定義可參照：`reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st1_list.sql`（Stage 1 名單篩選邏輯）
- 本頁為 M01 功能的入口頁，各操作功能對應入口（v2.1 更新）：
  - 「新增名單定義」按鈕 → **US-106**（v2.1，取代舊 US-088）
  - 每列「編輯」按鈕 → **US-106**（v2.1，取代舊 US-089）
  - 每列「停用」按鈕 → US-090
- 「使用中」頁籤顯示 STATUS = 'active' 記錄；「已停用」頁籤顯示 STATUS = 'inactive' 記錄
- 月名單分派中資料鎖判斷：查詢 AssignmentRun 是否有 status = 'running' 記錄
- 預估客戶數量可由 US-071 的每日估算邏輯衍生（Stage 0 計算案件數量按鈕整合）
- **（v2.1 新增）** 篩選條件摘要欄位：後端 API 需依 condition_payload 是否為 NULL 回傳不同格式；condition_payload 的摘要產生邏輯（如何將 JSON 條件轉為人類可讀文字）由 Phase 2 spec-writer 定義；舊名單 fallback 邏輯見 US-123

---

## 測試案例

### TC-070-01：正常顯示本月 Stage 清單

- **Given**：OBMLISTDF 中本月有 3 個 Stage 定義
- **When**：業務主管進入名單定義頁面
- **Then**：顯示 3 列，Stage 編號分別為 0、1、2，依序排列

### TC-070-02：展開 Stage 詳情

- **Given**：清單中 Stage 1 有 5 個篩選條件
- **When**：業務主管點擊 Stage 1
- **Then**：詳情區顯示 5 個條件，含欄位名稱、運算子（如 =、>=、IN）、條件值

### TC-070-03：無資料空白狀態（引導新增）

- **Given**：當月 OBMLISTDF 查無 STATUS = 'active' 資料
- **When**：頁面載入
- **Then**：顯示空白引導提示文字，含「新增名單定義」按鈕引導，不顯示錯誤訊息

### TC-070-04：月名單分派執行中按鈕全部停用

- **Given**：AssignmentRun status = 'running'
- **When**：業務主管進入名單定義清單頁
- **Then**：「新增名單定義」、各列「編輯」、各列「停用」按鈕均為 disabled，頁面頂部顯示橘色通知列

### TC-070-05：「已停用」頁籤查閱

- **Given**：OBMLISTDF 有 2 筆 STATUS = 'inactive' 的名單
- **When**：業務主管點擊「已停用」頁籤
- **Then**：顯示 2 筆停用名單，每列無「編輯」或「停用」按鈕

---

## 依賴關係

- **Blocked By**：US-001（登入驗證）
- **Blocks**：US-071（Stage 0 估算需要名單定義已就緒）、US-106（建立/編輯名單定義，v2.1 取代 US-088/089）、US-090（停用名單定義）、US-081（觸發月名單分派前需確認名單定義）、US-123（舊名單 fallback 顯示依賴本頁面架構）

---

## Definition of Done

- [ ] 驗收標準全部通過
- [ ] 單元測試覆蓋率 ≥ 80%
- [ ] Code review 通過
- [ ] 文件已更新

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **NFR**：[NFR-003](../../non-functional/NFR-003-assignment-execution-perf.md)
- **相關 Stories**：US-071（Stage 0 估算）、US-106（建立/編輯名單，v2.1）、US-090（停用名單）、US-081（觸發月名單分派）、US-123（舊名單 fallback 顯示）
- **Reference**：`reference/TableSchema/OB/OBMLISTDF.sql`、`reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st1_list.sql`
- **GAP-LIST**：`docs/specs/implementation-log/F050-v2.1-refactor-gap-list.md`（F6、G6）

---

## v2.3 更新（2026-05-21）

> **變更來源**：v2.3 Toolbar 清理 + Kanban 重構後主頁架構變更

### AC-1 修訂（v2.3）：Toolbar 規則更新

> 補充 v2.3 Toolbar 清理規則，取代原 AC-1 中「新增名單定義按鈕」的描述範圍。

- **Given** 部長、Admin 或處長進入 M01 名單定義主頁
- **When** 頁面載入完成
- **Then** Toolbar 區域（工具列）**僅**包含以下元素：
  1. 搜尋框（全角色可見）：搜尋名單名稱或 LIST_NO
  2. 「新增名單」按鈕（僅 `director` / `admin` 可見）：點擊進入 US-106 建立名單流程
- **And** Toolbar 上**不存在**「執行月名單分派」按鈕（移除重複入口，月名單分派唯一入口為 Ready 欄頂 CTA banner，見 US-132）
- **And** Toolbar 上**不存在**「Stage 0 試算」按鈕（移除重複入口，試算入口改至 Ready CTA banner 的 secondary 按鈕）

### AC-4 補充（v2.3）：月名單分派執行中 Toolbar 鎖定行為

> 補充 AC-4 月名單分派鎖定時 Toolbar 的行為，與 US-132 AC-4 對齊。

- **Given** 目前有 AssignmentRun status = 'running' 的月名單分派
- **When** 部長或 Admin 在 M01 名單定義主頁
- **Then** 「新增名單」按鈕為停用（disabled）狀態
- **And** Ready 欄頂 CTA banner 進入禁用樣式（琥珀色，見 US-132 AC-4）
- **And** 頁面顯示橘色通知列：「分派執行中，名單定義暫時鎖定，無法進行新增、編輯、推進或退回操作」
