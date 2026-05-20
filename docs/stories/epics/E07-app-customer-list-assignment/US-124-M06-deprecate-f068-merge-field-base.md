---
story-id: US-124
title: F068（代碼維護 module）廢除與篩選欄位合併管理頁
epic: E07 — 客戶名單分派
module: M06 篩選欄位
priority: Must Have
status: Draft
date: 2026-05-19
version: "1.0"
source-feature-spec: F068-edit-base-code, F075-manage-pooldata-field-whitelist, F076-manage-categorical-field-values
---

# US-124：F068（代碼維護 module）廢除與篩選欄位合併管理頁

> **Story ID**：US-124
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M06 篩選欄位
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：5

---

## User Story

**As a** 部長（Director）、Admin 或處長（Section Chief）
**I want** 在側邊欄看到「篩選欄位」管理入口，進入後以 2-Tab 頁面統一管理 POOLDATA 白名單欄位與各欄位的可選值；原「代碼維護」頁面不再存在
**So that** 篩選欄位的管理有單一、直觀的入口，不再需要在多個獨立頁面之間切換，且消除已廢棄的 ob_code_df CRUD 介面，避免使用者誤用

---

## 背景說明

F050 v2.1 重構後，`ob_code_df` 中的 PROD_KIND / SPEC_TP / CASE_STATUS 代碼已改由 `pooldata_field_option` 管理（US-125）。F068（代碼維護）module 的所有業務功能已無必要存在，應予廢除（J2）。

同時，原本分散的 US-102（POOLDATA 篩選欄位白名單）與 US-103（類別型欄位可選值）兩個獨立頁面，合併為一個「篩選欄位」管理頁（J4），以 2-Tab 結構呈現。

**涵蓋 GAP-LIST 項目**：F7、F8、F9、G7、G8、G9、H1、H2、H3、I、J2、J4

---

## 驗收標準

### AC-1：sidebar「代碼維護」rename「篩選欄位」

- **Given** 任何已登入使用者（部長、Admin、處長）進入系統
- **When** 查看側邊欄導覽
- **Then** 側邊欄顯示「篩選欄位」導覽項目（原「代碼維護」項目不再存在）
- **And** 點擊「篩選欄位」進入合併後的管理頁面
- **And** 所有頁面（包含 35 個 prototype HTML）的 sidebar 均一致顯示「篩選欄位」；「代碼維護」文字不應出現在任何頁面的導覽欄中

> **業務意義（F9/H1）**：統一導覽語意，讓使用者清楚知道「篩選欄位」是管理名單篩選欄位與可選值的唯一入口。

---

### AC-2：合併後管理頁以 2-Tab 結構呈現

- **Given** 使用者（部長、Admin 或處長）點擊 sidebar「篩選欄位」
- **When** 頁面載入
- **Then** 頁面顯示 2 個 Tab：
  - **Tab 1「POOLDATA 篩選欄位」**：等同原 US-102 白名單管理頁，顯示欄位列表，部長 / Admin 可新增、編輯、停用；處長唯讀
  - **Tab 2「可選值管理」**：等同原 US-103 可選值管理頁，顯示類別型欄位的可選值列表，部長 / Admin 可新增、停用、啟用；處長唯讀
- **And** 不存在任何獨立的「代碼維護 / ob_code_df CRUD」Tab 或頁面
- **And** 原有「POOLDATA 篩選欄位白名單」獨立頁面（`/assignment/whitelist`）與「可選值管理」獨立頁面（`/assignment/whitelist/options`）均不再作為獨立路由存在

> **業務意義（F8/G8/H2/J4）**：統一管理介面，減少使用者在多頁切換的操作負擔。

---

### AC-3：F068 入口完全消失，舊書籤自動 redirect

- **Given** 系統上線後
- **When** 使用者嘗試透過任何路徑到達 F068「代碼維護（ob_code_df CRUD）」頁面（包含 sidebar 點擊、直接輸入 URL `/assignment/base-codes`、存有舊書籤的使用者）
- **Then** 系統不存在 `/assignment/base-codes` 路由；存取時 redirect 至「篩選欄位」管理頁（Tab 1）
- **And** 系統中不存在任何呼叫 F068 API 的前端功能

> **業務意義（G7/G9/H2/I/J2）**：F068 module 完整廢除，業務主管不再能透過 UI 操作 ob_code_df 的 PROD_KIND / SPEC_TP / CASE_STATUS 代碼（這些代碼已由 US-125 遷移至 pooldata_field_option）。

---

### AC-4：合併後角色管控與原 US-102 / US-103 一致

- **Given** 不同角色的使用者進入「篩選欄位」管理頁
- **When** 查看 Tab 1 或 Tab 2
- **Then**：
  - **部長 + Admin**：Tab 1 與 Tab 2 均顯示新增、編輯、停用等操作按鈕；可執行所有管理操作
  - **處長**：Tab 1 與 Tab 2 均只顯示資料列表，不顯示任何可操作按鈕；若直接呼叫寫入 API，後端回 403 Forbidden
  - **一般 User（未具備 M06 權限）**：無法進入篩選欄位管理頁，嘗試進入時被 redirect 至無權限頁面
- **And** 角色管控使用 `DirectorGuard`（寫入）/ `SalesManagerGuard`（讀取），與原 US-102 AC-3 / US-103 AC-2 完全一致

> **業務意義（J4）**：合併頁面不改變既有的角色分工，不新增也不縮減任何人的存取權限。

---

## 技術備註

- F068 module（`assignment-code/` 目錄、controller、service、dto、tests）的實際刪除作業由 **Phase 3a system-architect** 執行（GAP-LIST I）
- `app.module.ts` 移除 `AssignmentCodeModule` import 亦由 Phase 3a 負責
- `error-codes.ts` 中 `CODE_TYPE_INVALID` / `CODE_IN_USE` 是否需保留，由 Phase 3a 評估（GAP-LIST I）
- sidebar 的 route 路徑（`/assignment/field-base` 或其他命名）由 **Phase 3b ui-ux-designer** 在 prototype 重寫時定案（H1~H3）
- 2-Tab 頁面的 URL 設計（例如 `/assignment/field-base?tab=1` 或 `/assignment/field-base/whitelist`）由 Phase 3b 決定

---

## 測試案例

### TC-124-01：sidebar 顯示「篩選欄位」不顯示「代碼維護」

- **Given**：部長帳號登入
- **When**：查看側邊欄
- **Then**：側邊欄有「篩選欄位」項目；「代碼維護」項目不存在

### TC-124-02：點擊「篩選欄位」進入 2-Tab 頁面

- **Given**：部長點擊「篩選欄位」
- **When**：頁面載入
- **Then**：顯示 2 個 Tab（POOLDATA 篩選欄位 / 可選值管理）；無「代碼維護」Tab

### TC-124-03：舊路由 /assignment/base-codes 被 redirect

- **Given**：使用者直接訪問 `/assignment/base-codes`
- **When**：系統處理路由
- **Then**：redirect 至「篩選欄位」管理頁（Tab 1）

### TC-124-04：處長進入篩選欄位頁為唯讀

- **Given**：帳號持有「處長」角色
- **When**：點擊「篩選欄位」，進入 Tab 1 和 Tab 2
- **Then**：兩個 Tab 均顯示資料，但無任何操作按鈕

### TC-124-05：處長呼叫 F075/F076 寫入 API 被拒

- **Given**：帳號持有「處長」角色
- **When**：直接 POST 至白名單新增 API 或可選值新增 API
- **Then**：後端回 403 Forbidden

---

## 依賴關係

- **Blocked By**：US-125（ob_code_df 重疊代碼搬完才能廢除 F068 入口）、US-102（Tab 1 內容）、US-103（Tab 2 內容）、US-100（部長角色定義）
- **Blocks**：US-102（修改版，Tab 入口由本 Story 定義）、US-103（修改版，Tab 入口由本 Story 定義）

---

## Definition of Done

- [ ] 驗收標準全部通過
- [ ] sidebar rename 測試（TC-124-01）
- [ ] 2-Tab 頁面結構測試（TC-124-02）
- [ ] 舊路由 redirect 測試（TC-124-03）
- [ ] 處長唯讀測試（TC-124-04）
- [ ] 處長寫入被拒測試（TC-124-05）
- [ ] 單元測試覆蓋率 ≥ 80%
- [ ] Code review 通過
- [ ] 文件已更新

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **GAP-LIST**：`docs/specs/implementation-log/F050-v2.1-refactor-gap-list.md`（F7~F9、G7~G9、H1~H3、I、J2、J4）
- **DEPRECATED**：US-092（代碼維護，由本 Story 廢除其 F068 入口部分）
- **相關 Stories**：US-092（DEPRECATED）、US-102（Tab 1）、US-103（Tab 2）、US-125（ob_code_df 代碼遷移）、US-100（部長角色）、US-101（處長唯讀規則）
- **Feature Spec**：`docs/specs/features/F068-edit-base-code.md`（待廢除）、`docs/specs/features/F075-manage-pooldata-field-whitelist.md`、`docs/specs/features/F076-manage-categorical-field-values.md`
