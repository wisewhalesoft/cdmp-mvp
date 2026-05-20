---
last-updated: 2026-05-20
version: v1.0
change-summary: "新增 story：D1 + D4 + Q-A 決議落地 — 編輯草稿名單頁卡別改為 ob_card_type 下拉選單，含 inactive 卡別的特殊處理。"
---

# US-127：編輯草稿名單 — 卡別改為下拉選單（含停用卡別保留處理）

> **Story ID**：US-127
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M01 名單定義
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：5

---

## User Story

**As a** 部長（Director）
**I want** 在編輯草稿名單時，從系統維護的卡別清單中選取卡別，且若名單現存卡別已被停用，該值仍能顯示（但無法重新選取）
**So that** 確保既有名單不因卡別停用而遺失歷史設定值，同時防止使用者在操作時選到已停用的卡別

---

## 背景說明

本 Story 落地 2026-05-20 業務複核決議 D1、D4、Q-A（編輯頁分流規則）：

- **D1**：卡別改為 `ob_card_type` 下拉（與 US-126 相同來源）
- **D4**：`maxLength={2}` 修正為 5（下拉元件自然消除此限制）
- **Q-A 邊界決議（編輯歷史名單）**：下拉列出 `active` + 「該名單已存的 inactive 值」；inactive 選項標示 `disabled` 不可重選，視覺標示「（已停用 — 僅供保留舊值）」

本 Story 處理「編輯草稿名單」頁（`list-edit-draft-page.tsx`）。建立頁的對應修改由 US-126 處理。

---

## 驗收標準

### AC-1：編輯頁卡別欄位改為下拉選單，預填現有值

- **Given** 部長進入「編輯草稿名單」頁（`/assignment/list-definitions/{listNo}/edit`），名單 `stage = 'draft'`
- **When** 頁面載入完成，卡別下拉選項就緒
- **Then** 卡別欄位顯示為下拉選單，預設選中該名單現有的 `card_type` 值（若 `card_type` 為空則選「— 未選擇 —」）
- **And** 下拉選項第一個為「— 未選擇 —」（空值）
- **And** 其餘選項為 `ob_card_type` 中 `status='active'` 的卡別，格式 `{card_type} — {card_name}（{prod_kind}）`，依 `card_type` 升冪排列

### AC-2：名單現存卡別為 inactive 時，顯示停用選項但不可重選

- **Given** 名單現存的 `card_type` 值（例：`OL`）在 `ob_card_type` 中 `status='inactive'`
- **When** 編輯頁卡別下拉載入後
- **Then** 下拉中額外加入此 inactive 選項，文字格式為 `{card_type} — {card_name}（{prod_kind}）（已停用 — 僅供保留舊值）`，例：`OL — 舊車型（01 老客）（已停用 — 僅供保留舊值）`
- **And** 該 inactive 選項設為 `disabled`（HTML `disabled` 屬性），使用者無法主動選取它；預填時仍顯示此值（因為名單本身存的就是這個值）
- **And** active 的選項維持正常可選狀態

### AC-3：使用者可清除 inactive 卡別，改選 active 卡別或「未選擇」

- **Given** 名單現存卡別為 inactive 值，已顯示在下拉中
- **When** 部長主動切換下拉，選擇「— 未選擇 —」或某個 active 卡別
- **Then** 下拉值更新為使用者選擇的新值；inactive 的 disabled 選項仍留在清單中但未被選中
- **And** 部長點擊「儲存變更」後，`ob_list_definition.card_type` 更新為新選擇的值（或空值）

### AC-4：非 draft 階段名單，卡別下拉唯讀

- **Given** 名單 `stage != 'draft'`（例如已推進至部門比例設定階段）
- **When** 部長進入編輯頁
- **Then** 頁面顯示 `NotDraftBanner`（K1 約束，現有行為），主表單隱藏，卡別下拉不渲染
- **And** 本 Story 不改變此場景的現有行為

### AC-5：API 載入失敗時顯示 fallback 提示，不阻擋儲存

- **Given** `GET /api/v1/assignment/scoring/card-types` API 呼叫失敗
- **When** 編輯頁載入卡別資料時
- **Then** 卡別欄位顯示 fallback 提示「卡別資料載入失敗，請重新整理頁面」；名單原有的 `card_type` 值在 state 中保留，不清空
- **And** 使用者仍可修改其他欄位（名單名稱、篩選條件、CR 設定）並儲存；卡別欄位因無選項而維持送出原有值（由 state 保留）

---

## 技術備註

- **Inactive 卡別的合併邏輯**：前端在 API 回傳 active 卡別清單後，檢查目前名單的 `cardType` 值是否存在於清單中；若不存在（即為 inactive），則呼叫個別卡別查詢端點（或在同一 API response 中尋找，視後端實作）取得 inactive 卡別的 `card_name` 與 `prod_kind`，補入下拉並設 `disabled`。具體端點實作由 system-architect 設計
- **LEGACY 名單場景**：LEGACY 名單（`conditionPayload == null`）的編輯頁行為已由現有邏輯處理，本 Story 僅修改卡別欄位，不改動 LEGACY banner / 唯讀條件摘要等現有行為
- `ob_card_type` entity 欄位：`card_type VARCHAR(5) PK`、`card_name VARCHAR(20)`、`prod_kind VARCHAR(4)`、`status VARCHAR(10)`（詳見 `apps/api/src/database/entities/ob-card-type.entity.ts`）
- testid 建議：將 `input-cardType` 改為 `select-cardType`，inactive 選項建議加 `data-inactive="true"` 供測試識別
- 後端 `@MaxLength(5)` 已對齊（Q4 確認），本 Story 不需改動後端 DTO

---

## 依賴關係

- **Blocked By**：US-106（編輯草稿名單主流程）、US-126（建立頁卡別下拉，共用資料來源邏輯，建議同 sprint 實作）
- **Blocks**：無
- **相關**：F069（卡別計分卡主檔管理）

---

## Definition of Done

- [ ] 編輯草稿名單頁卡別欄位改為 `<select>` 下拉，預填現有值
- [ ] Active 卡別正常可選；inactive 的現存卡別值以 `disabled` 選項顯示，附「（已停用 — 僅供保留舊值）」標示
- [ ] 使用者可清除 inactive 值改選 active 卡別或「— 未選擇 —」
- [ ] 非 draft 階段名單不渲染卡別下拉（NotDraftBanner 現有行為維持）
- [ ] API 載入失敗時顯示 fallback 提示，state 保留原有值不清空
- [ ] 單元測試覆蓋率 ≥ 80%（含 inactive 卡別場景、fallback 場景）
- [ ] Code review 通過

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **對應頁面**：`apps/web/src/pages/assignment/list-edit-draft-page.tsx`（Section 1 基本資訊，cardType 欄位）
- **卡別主檔 Entity**：`apps/api/src/database/entities/ob-card-type.entity.ts`
- **建立頁對應 Story**：[US-126](US-126-M01-cardtype-dropdown-create.md)
- **建立/編輯名單主流程**：[US-106](US-106-M01-draft-create-list-with-filter.md)
- **複核決議來源**：D1（卡別下拉）、D4（maxLength 修正）、Q-A（編輯頁含 inactive 卡別處理）
