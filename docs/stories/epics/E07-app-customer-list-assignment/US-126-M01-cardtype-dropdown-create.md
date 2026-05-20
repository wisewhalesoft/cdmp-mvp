---
last-updated: 2026-05-20
version: v1.0
change-summary: "新增 story：D1 + D4 決議落地 — 建立草稿名單頁卡別改為 ob_card_type 下拉選單、maxLength 修正為 5。"
---

# US-126：建立草稿名單 — 卡別改為下拉選單

> **Story ID**：US-126
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M01 名單定義
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：3

---

## User Story

**As a** 部長（Director）
**I want** 在建立草稿名單時，從系統維護的卡別清單中選取卡別，而非自行輸入文字
**So that** 避免輸入不存在的卡別代碼，同時能直接看到各卡別對應的名稱與產品種類，減少操作錯誤

---

## 背景說明

本 Story 落地 2026-05-20 業務複核決議 D1 與 D4：

- **D1**：卡別（cardType）從自由文字輸入框改為從 `ob_card_type` table 動態載入的下拉選單，顯示格式為 `{card_type} — {card_name}（{prod_kind}）`
- **D4**：建立頁現況 `maxLength={2}` 沿用舊 varchar(2) 限制，應修正為 5，對齊 `ob_card_type.card_type varchar(5)`（格式 `^[A-Z0-9]{1,5}$`）

本 Story 處理「建立草稿名單」頁（`list-create-draft-page.tsx`）。編輯頁的對應修改由 US-127 處理。

---

## 驗收標準

### AC-1：卡別欄位改為下拉選單，選項來自 ob_card_type

- **Given** 部長進入「建立草稿名單」頁（`/assignment/list-definitions/new`）
- **When** 頁面載入完成
- **Then** 基本資訊區的「卡別」欄位顯示為下拉選單（`<select>`），而非自由文字輸入框
- **And** 下拉選單的選項來源為 `GET /api/v1/assignment/scoring/card-types`，篩選條件為 `status='active'`（只顯示啟用中的卡別；active/inactive 範圍由 system-architect 決定是否透過 query param 或端點 variant 實現）
- **And** 每個選項文字格式為 `{card_type} — {card_name}（{prod_kind}）`，例：`S5 — 主力催收（02 中信）`
- **And** 下拉清單依 `card_type` 升冪排列

### AC-2：下拉可選「未選擇」，維持選填語意

- **Given** 部長在建立草稿名單頁
- **When** 卡別下拉載入後
- **Then** 下拉第一個選項為「— 未選擇 —」（空值），預設選中此選項
- **And** 部長可保持「— 未選擇 —」不變後儲存，名單的 `card_type` 欄位儲存為空值（卡別維持選填語意）
- **And** 儲存時前端傳送的 DTO 欄位：選擇具體卡別時傳 `cardType: "S5"`（僅 card_type 代碼，不含 card_name / prod_kind 文字）；選擇「— 未選擇 —」時不傳 `cardType` 欄位（或傳 `null`）

### AC-3：移除 maxLength={2} 限制

- **Given** 部長開啟建立草稿名單頁
- **When** 檢視卡別欄位
- **Then** 卡別欄位不再有 `maxLength={2}` 的硬限制（因已改為下拉，此限制自然消除；選項值由 `ob_card_type.card_type varchar(5)` 管控，格式 `^[A-Z0-9]{1,5}$`）

### AC-4：載入失敗時顯示 fallback 提示，不阻擋儲存

- **Given** `GET /api/v1/assignment/scoring/card-types` API 呼叫失敗（網路錯誤或 5xx）
- **When** 建立草稿名單頁載入卡別資料時
- **Then** 卡別欄位顯示 fallback 提示「卡別資料載入失敗，請重新整理頁面」
- **And** 失敗不阻擋名單的其他欄位填寫與儲存（卡別為選填欄位，即使無法載入選項，使用者仍可以不選卡別的方式完成建立）

### AC-5：選取卡別後 DTO 送出正確值

- **Given** 部長在建立草稿名單頁選取卡別（例：選擇 `S5 — 主力催收（02 中信）`）
- **When** 部長點擊「儲存草稿」或「儲存並推進至部門比例」
- **Then** 前端 API 呼叫的 request body 中 `cardType` 欄位值為 `"S5"`（即 `ob_card_type.card_type` 欄位值，不含顯示用文字）
- **And** 後端儲存後，`ob_list_definition.card_type` 欄位寫入 `"S5"`

---

## 技術備註

- 卡別下拉 API endpoint：`GET /api/v1/assignment/scoring/card-types`（F069 既有端點，對應 `apps/api/src/modules/assignment-scoring/controllers/card-type.controller.ts`）；是否支援 `?active=true` query param 或需新 endpoint variant 由 system-architect 決定
- 下拉選項資料在頁面 mount 時以 `useEffect` 一次性載入，不需使用者觸發；載入中顯示 disabled 狀態下拉，避免選項未就緒時送出
- `ob_card_type` entity 欄位：`card_type VARCHAR(5) PK`、`card_name VARCHAR(20)`、`prod_kind VARCHAR(4)`、`status VARCHAR(10)`（詳見 `apps/api/src/database/entities/ob-card-type.entity.ts`）
- 前端 state 名稱建議維持 `cardType`（現況），但 UI 元件從 `<input type="text">` 改為 `<select>`；testid `input-cardType` 可更名為 `select-cardType`
- 本 Story 不修改後端 DTO 的 `cardType` 欄位結構（後端 `@MaxLength(5)` 已對齊，Q4 確認無需改動）

---

## 依賴關係

- **Blocked By**：US-106（建立草稿名單主流程；本 Story 為其 UI 修正）
- **Blocks**：US-127（編輯頁卡別下拉，共用相同的卡別資料來源邏輯）
- **相關**：F069（卡別計分卡主檔管理，`ob_card_type` 資料維護入口）

---

## Definition of Done

- [ ] 建立草稿名單頁卡別欄位改為 `<select>` 下拉，選項來自 `ob_card_type`（active 範圍）
- [ ] 下拉首選項為「— 未選擇 —」，預設選中
- [ ] 選取具體卡別後，DTO 傳送正確 `card_type` 值
- [ ] API 載入失敗時顯示 fallback 提示，不阻擋儲存
- [ ] `maxLength={2}` 已移除（下拉元件自動消除）
- [ ] 單元測試覆蓋率 ≥ 80%（含 fallback 場景）
- [ ] Code review 通過

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **對應頁面**：`apps/web/src/pages/assignment/list-create-draft-page.tsx`（Section 1 基本資訊，cardType 欄位）
- **卡別主檔 Entity**：`apps/api/src/database/entities/ob-card-type.entity.ts`
- **編輯頁對應 Story**：[US-127](US-127-M01-cardtype-dropdown-edit.md)
- **建立名單主流程**：[US-106](US-106-M01-draft-create-list-with-filter.md)
- **複核決議來源**：D1（卡別下拉）、D4（maxLength 修正）、Q-A（建立頁只列 active 卡別）
