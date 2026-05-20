---
last-updated: 2026-05-20
version: v1.0
change-summary: "新增 story：D2 + Q-B 決議落地 — 移除「最佳產品（prodBest）」一級欄位，改由篩選條件區 best_case categorical condition 取代；ob_list_definition.prod_best 資料清空。"
---

# US-128：移除「最佳產品」一級欄位，改由篩選條件 best_case 取代

> **Story ID**：US-128
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M01 名單定義
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：3

---

## User Story

**As a** 部長（Director）
**I want** 「最佳產品」欄位從建立/編輯名單的基本資訊區移除，改透過篩選條件區的 `best_case` 欄位設定
**So that** 篩選欄位統一由 F075 白名單管理，業務部長不需在兩個地方分別維護語意相同的設定

---

## 背景說明

本 Story 落地 2026-05-20 業務複核決議 D2 與 Q-B：

- **D2**：`prodBest`（對應 `ob_list_definition.prod_best`、`ob_pool_data.best_case` Y/N 二元值）從建立/編輯名單的「基本資訊」區移除，改進 F075 white list 作為 `best_case` categorical 欄位（選項 Y / N）；業務部長改由「篩選條件」區新增 `best_case` categorical condition 操作
- **Q-B 決議（prod_best 歷史資料處理）**：B3 — 直接清空（v2.1 之前根本沒被使用，確認無業務語意保留價值）

`best_case` 欄位已存在於 F075 白名單 seed（migration 1711360000220），display_name 為「優質案件」，field_type 為 categorical；其可選值 Y / N 由 US-129 的 seed migration 補入。

---

## 驗收標準

### AC-1：建立草稿名單頁移除「最佳產品」輸入框

- **Given** 部長進入「建立草稿名單」頁（`/assignment/list-definitions/new`）
- **When** 頁面載入完成
- **Then** 基本資訊區不再顯示「最佳產品」輸入框（`data-testid="input-prodBest"` 元件不存在於 DOM）
- **And** 基本資訊區版面調整後正常顯示剩餘欄位（名單名稱、卡別下拉）
- **And** 前端送出的 API request body 不包含 `prodBest` 欄位（或傳 `null`/不傳）

### AC-2：編輯草稿名單頁移除「最佳產品」輸入框

- **Given** 部長進入「編輯草稿名單」頁
- **When** 頁面載入完成
- **Then** 基本資訊區不再顯示「最佳產品」輸入框
- **And** 前端送出的 API request body 不包含 `prodBest` 欄位

### AC-3：ob_list_definition.prod_best 資料清空

- **Given** 資料庫 `ob_list_definition` 表中存有部分紀錄的 `prod_best` 欄位為非 NULL 值（v2.1 以前遺留資料）
- **When** DB migration 執行（Q-B 決議：直接清空）
- **Then** 所有 `ob_list_definition` 紀錄的 `prod_best` 欄位更新為 `NULL`
- **And** migration 為 idempotent（重複執行不產生 side effect）

### AC-4：best_case 篩選條件可正常新增（依賴 US-129 seed 就緒）

- **Given** US-129 seed migration 已執行，`pooldata_field_option` 中 `best_case` 有 Y（優質案件）與 N（非優質案件）兩筆 active options
- **When** 部長在「建立草稿名單」或「編輯草稿名單」頁的「篩選條件」區點擊「新增條件」
- **Then** dropdown 中可見 `best_case` 欄位（顯示名稱「優質案件」，field_type 為 categorical）
- **And** 選取 `best_case` 加入條件後，多選值清單顯示 `Y（優質案件）` 與 `N（非優質案件）` 兩個可選項

### AC-5：前端 state / 送出邏輯清理

- **Given** 移除 `input-prodBest` 元件
- **When** 開發完成後
- **Then** `list-create-draft-page.tsx` 與 `list-edit-draft-page.tsx` 中 `prodBest` 相關 state（`const [prodBest, setProdBest] = useState('')`）、送出 DTO 邏輯（`if (prodBest) dto.prodBest = prodBest`）均已移除，無殘留 dead code
- **And** TypeScript 編譯無 unused variable 警告

---

## 技術備註

- **清空 migration**：建議新增獨立 migration（例如 `20260520000001-ClearProdBestColumn.ts`），執行 `UPDATE ob_list_definition SET prod_best = NULL WHERE prod_best IS NOT NULL`；down 方向無法還原資料，可保留空 down()
- **後端 DTO 清理**：`create-list.dto.ts` 與 `update-list.dto.ts` 中 `prodBest` 欄位可標記為 `@IsOptional()` 並視為廢棄接受（backward-compat，避免舊客戶端送 prodBest 造成 422），或直接移除視業務風險而定；由 system-architect / spec-writer 決定；本 Story AC 不規範後端 DTO 的刪除方式
- **AssignmentListItem 介面清理**：前端 `src/api/assignment-list.ts` 的 `AssignmentListItem` 介面中 `prodBest?: string` 欄位可一併移除（若 F048 清單頁或其他讀取端不再需要此欄位）；影響範圍由 TDD 實作時評估
- `best_case` categorical 欄位的 options（Y/N）由 US-129 提供；本 Story 不負責 seed migration，但 AC-4 的完成驗證以 US-129 已完成為前提

---

## 依賴關係

- **Blocked By**：US-106（建立/編輯名單主流程）、US-129（best_case Y/N options seed，AC-4 驗證前提）
- **Blocks**：無
- **相關**：US-125（caseyear / case_status options 遷移，同屬 whitelist-driven 重構系列）

---

## Definition of Done

- [ ] 建立草稿名單頁基本資訊區「最佳產品」輸入框已移除
- [ ] 編輯草稿名單頁基本資訊區「最佳產品」輸入框已移除
- [ ] 前端 `prodBest` state、DTO 送出邏輯已清除（無 dead code）
- [ ] DB migration 執行後 `ob_list_definition.prod_best` 全欄清空
- [ ] `best_case` 欄位在篩選條件 dropdown 中可見並可加入條件（依賴 US-129）
- [ ] 單元測試更新（移除 prodBest 相關測試；新增驗證 DOM 不含 `input-prodBest` 元件）
- [ ] Code review 通過

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **對應頁面（建立）**：`apps/web/src/pages/assignment/list-create-draft-page.tsx`（Section 1 基本資訊，`prodBest` 欄位區塊）
- **對應頁面（編輯）**：`apps/web/src/pages/assignment/list-edit-draft-page.tsx`（Section 1 基本資訊，`prodBest` 欄位區塊）
- **白名單 seed**：`apps/api/src/database/migrations/1711360000220-SeedPooldataFieldWhitelist.ts`（`best_case` 欄位已 seed）
- **best_case options seed**：[US-129](US-129-M06-seed-bestcase-options.md)
- **建立/編輯名單主流程**：[US-106](US-106-M01-draft-create-list-with-filter.md)
- **複核決議來源**：D2（prodBest 移除 + best_case 進白名單）、Q-B 決議 B3（prod_best 資料直接清空）
