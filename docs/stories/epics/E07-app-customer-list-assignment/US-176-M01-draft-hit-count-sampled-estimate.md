# US-176：建立草稿名單時「預估命中筆數」改為真實抽樣估算

> **Story ID**：US-176
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M01 名單定義（擴充 US-106 建立草稿名單頁）
> **優先級**：Must Have（現行為前端假資料公式，可能誤導業務主管判斷名單規模，屬資料誠信問題）
> **階段**：Phase 1（MVP）
> **預估點數**：3
> **版本**：v1（2026-07-11 — 新增；將 `/assignment/list-definitions/new` 現行純前端 mock 估算改為真實抽樣估算）

---

## User Story

**As a** 部長或 Admin（US-106 建立草稿名單之角色範圍）
**I want** 在建立草稿名單頁面編輯篩選條件時，即時看到依目前條件計算出的「預估命中筆數」為**真實估算值**（而非任意數字）
**So that** 我能在儲存名單前，合理判斷這組篩選條件圈選的案件規模是否符合預期，避免存了一份範圍過大或過小的名單才發現問題

---

## 背景說明

`prototypes/27a-list-create-draft.html`（L307-326）已描繪「依此條件預估命中 N 筆案件」的預覽 banner，文案並附註「基於上月案件樣本估算」。目前 `apps/web/src/pages/assignment/list-create-draft-page.tsx`（L354-362）**已有對應的前端 UI**，但其 `previewCount` 為**純前端假公式**：

```
let n = 12500;
valid.forEach((_c, i) => { n = Math.floor(n * (0.85 - i * 0.08)); });
```

此數字**與 `ob_pool_data` 實際資料、與使用者實際設定的篩選條件內容完全無關**（僅依「條件數量」遞減乘以固定初始值 12500），只是外觀上看起來像是一個估算結果。這比 US-174 所修正的「面板空白」問題更嚴重：業務主管看到的是一個**看似合理但完全虛構**的數字，可能據此做出錯誤的名單規模判斷。

本 Story 將此 mock 公式**替換為真實的抽樣估算**，並依 D2 決策，重用 Stage 0 的欄位篩選邏輯（`buildStage1WhereConditions`，僅欄位篩選子步驟）套用於樣本，隨使用者編輯條件即時（live）更新。

**與 Stage 0 精確試算（US-071 / F049）的關係（重要，避免混淆）**：US-071（F049 v1.4）之 per-LIST_NO 試算，已升級為套用**完整 Stage 1 篩選鏈**（欄位篩選 + MONTH_CNT 期別過濾 + 近 3 個月去重 + 特殊業務 DELETE 規則）之唯讀 dry-run，結果精確等於正式月名單分派 Stage 1 分派筆數。本 Story（建立草稿當下的即時預覽）**依 D2 明確採用較簡化的估算範圍**——僅套用欄位篩選子步驟（`buildStage1WhereConditions`），**不含** MONTH_CNT / 去重 / 特殊 DELETE，且底層為抽樣而非全量精確計數。兩者是**互補而非取代**的兩層功能：本 Story 提供「編輯條件當下的即時粗估」，US-071 提供「儲存後的精確試算」。prototype 27a 既有的「開啟 Stage 0 試算」連結（導向精確試算頁）應予保留。

---

## 驗收標準

### AC-1：以真實抽樣估算取代前端假公式

- **Given** 部長或 Admin 在建立草稿名單頁面（`/assignment/list-definitions/new`）設定或修改篩選條件
- **When** 系統計算「預估命中筆數」
- **Then** 移除現行前端純數學假公式（`n = 12500 * 遞減係數`），改為呼叫真實估算能力：對 `ob_pool_data` 取固定筆數之隨機樣本，套用目前表單中**完整篩選條件集合**（含系統固定之「優質案件」條件，見 US-144）之欄位篩選邏輯（`buildStage1WhereConditions`，對齊 F050 §18.5 之欄位篩選子步驟），依樣本命中比例放大推算至母體總筆數

### AC-2：篩選範圍明確限定為欄位篩選子步驟（D2）

- **Given** 使用者於表單中設定之篩選條件（`condition_payload`）
- **When** 估算命中筆數
- **Then** 僅套用 `buildStage1WhereConditions()` 之欄位篩選邏輯，**不套用** MONTH_CNT 期別過濾、近 3 個月已派案去重、特殊業務 DELETE 規則（此三者為 US-071/F049 精確試算專屬，本 Story 不含）
- **And** 本 AC 之範圍限定為明確產品決策（D2），不因與 US-071 結果數字有落差而視為缺陷；兩者為不同精度層級的功能，UI 上須維持既有之「開啟 Stage 0 試算」連結供使用者查看精確數字

### AC-3：隨條件編輯即時（live）更新

- **Given** 使用者於篩選條件區塊新增、修改或刪除任一條件
- **When** 條件變更完成（允許合理的 debounce 延遲，避免逐字元觸發過多請求）
- **Then** 「預估命中筆數」面板自動重新計算並更新顯示，不需使用者手動點擊「試算」按鈕

### AC-4：估算結果標示為約值

- **Given** 面板顯示「依此條件預估命中 N 筆案件」
- **When** 使用者檢視面板
- **Then** 沿用並保留 prototype 27a 既有之估算語意標示（如「基於樣本估算」字樣），具體文案由 ui-ux-designer / spec-writer 確認是否需調整措辭（如樣本對象由「上月案件」改為「當前 Pool 資料」須據實修訂），本 AC 僅要求「必須明確標示為估算值，不得呈現為精確計數」

### AC-5：無有效篩選條件時的行為

- **Given** 表單中尚無任何使用者篩選條件（僅系統固定的「優質案件」條件）
- **When** 使用者尚未新增任何條件
- **Then** 沿用現行既有行為（面板不顯示 / 或顯示提示待新增條件），本 Story 不變更此既有 UX（僅置換有條件時的數字來源與計算方式）

### AC-6：效能符合即時互動需求

- **Given** 使用者編輯條件觸發估算
- **When** 估算 API 執行
- **Then** 回應時間目標為次秒級（D1 之效能要求同樣適用於本功能），確保「即時更新」的使用體驗不因估算延遲而卡頓

### AC-7：估算失敗時不得靜默顯示錯誤數字

- **Given** 估算 API 呼叫失敗
- **When** 前端接收失敗結果
- **Then** 面板不得顯示 0 或任何誤導性數字，須明確呈現「預估暫時無法取得」之提示，且不阻擋使用者繼續填寫表單或儲存名單（估算為輔助資訊，非儲存的必要條件）

---

## 技術備註

- **現行 mock 程式碼位置**：`apps/web/src/pages/assignment/list-create-draft-page.tsx` L354-362（`previewCount` useMemo，公式 `n = 12500 * (0.85 - i*0.08)` 遞減，與真實資料無關）；面板渲染位置約 L1134-1160
- **篩選邏輯權威來源**：`buildStage1WhereConditions()`，定義於 `architecture-spec.md §18.5`，與 F050 v2.1 之 `condition_payload` source of truth 對齊；本 Story 僅重用其欄位篩選子步驟，不重用 F091/F092 之完整 Stage 1 鏈（`executeStage1Chain`，該為 US-071/F049 精確試算專用）
- 抽樣演算法與 D1（US-174 / US-175 共用）在「固定樣本 + 可重現種子 + 放大推算 + 估算標示 + 次秒級」等核心行為契約上一致；估算 API 之路徑、request/response schema、是否與 US-174/175 共用同一段抽樣程式碼，由 spec-writer / system-architect 決定
- **既有精確試算端點差異**：F049 §5.2 `GET /api/v1/assignment/list-definitions/:listNo/estimate` 僅適用於**已儲存**（有 `listNo`）之名單；建立草稿階段**尚未儲存、無 `listNo`**，需要一個可接受「尚未儲存的 `condition_payload`」作為輸入的估算能力 —— 此為新增能力，端點設計由 spec-writer / system-architect 決定，本 Story 僅定義行為契約
- `list-edit-draft-page.tsx`（既有草稿編輯頁）目前**未實作**此預覽面板（與 create 頁不同），是否比照補上見「開放問題」

> **[產品決策 D2，team lead 已拍板，不可再議]**：本功能之估算改為**抽樣估算**（非精確全量 COUNT），重用 Stage 0 欄位篩選邏輯（`buildStage1WhereConditions`）套用於樣本；隨條件編輯即時更新。

---

## 測試案例

### TC-176-01：估算數字反映真實篩選條件（非假公式）

- **Given**：使用者設定篩選條件「產品類別 = 信貸」
- **When**：系統計算預估命中筆數
- **Then**：回傳數字為對 `ob_pool_data` 樣本套用該條件欄位篩選後放大推算之結果，**非** `12500 * 0.85` 之固定公式輸出

### TC-176-02：新增/修改條件即時更新

- **Given**：使用者已設定 1 個條件，面板顯示估算值 N1
- **When**：使用者再新增 1 個條件
- **Then**：面板於合理延遲後更新為新估算值 N2（N2 反映兩個條件的組合篩選結果，非單純遞減公式）

### TC-176-03：條件變窄，估算值不遞增

- **Given**：使用者已設定條件 A，估算值為 N
- **When**：使用者再疊加條件 B（AND 邏輯，理論上結果集應為子集）
- **Then**：新估算值不高於 N（允許抽樣誤差範圍內的合理波動，但不應出現條件變多、估算值大幅增加的反直覺結果）

### TC-176-04：估算標示為約值

- **Given**：面板顯示預估命中筆數
- **When**：使用者檢視面板文案
- **Then**：面板含明確估算標示文字，不得呈現為精確計數用語

### TC-176-05：估算失敗時不顯示誤導數字

- **Given**：估算 API 呼叫失敗
- **When**：前端接收失敗結果
- **Then**：面板顯示「預估暫時無法取得」提示，不顯示 0 或任何數字；使用者仍可繼續填表與儲存

### TC-176-06：精確試算連結保留

- **Given**：面板顯示估算結果
- **When**：使用者點擊「開啟 Stage 0 試算」
- **Then**：導向既有 Stage 0 試算頁（US-071），可查看精確數字

### TC-176-07：效能符合次秒級

- **Given**：使用者編輯條件觸發估算
- **When**：測量 API 回應時間
- **Then**：回應時間於 1 秒內完成

---

## 開放問題

- [ ] **`list-edit-draft-page.tsx` 是否納入同等功能**：現行僅 `list-create-draft-page.tsx`（建立頁）有此預覽面板 mock，既有草稿編輯頁（`list-edit-draft-page.tsx`）完全沒有對應 UI。本 Story 範圍依 team lead 指示明確限定於 `/assignment/list-definitions/new`（建立頁）；編輯既有草稿時是否應有同等即時估算能力，待業務主管裁示，若確認需要建議另立 Story
- [ ] **面板文案是否需修訂**：prototype 27a 現行文案「基於上月案件樣本估算」之「上月」措辭是否符合實際樣本來源（現行 Pool 資料 vs 上月資料），待 spec-writer 確認後統一

---

## 依賴關係

- **Blocked By**：US-106（草稿階段建立名單與白名單篩選條件機制，`condition_payload` 來源）、US-121（`condition_payload` 為 source of truth 之驗證規則）
- **Blocks**：無
- **Related**：US-071（Stage 0 精確試算，功能互補、非取代關係，UI 保留互相連結）、US-174 / US-175（共用抽樣估算核心行為契約 D1，但篩選範圍依 D2 較簡化）、US-144（「優質案件」系統固定條件，估算須納入）

---

## Definition of Done

- [ ] 驗收標準全部通過
- [ ] 移除前端假公式，改接真實估算 API（AC-1）
- [ ] 篩選範圍限定測試：僅欄位篩選，不含 MONTH_CNT/去重/特殊 DELETE（AC-2）
- [ ] 即時更新測試（AC-3）
- [ ] 估算標示測試（AC-4）
- [ ] 估算失敗不誤導測試（AC-7 / TC-176-05）
- [ ] 效能測試（AC-6 / TC-176-07）
- [ ] 「開啟 Stage 0 試算」連結保留迴歸測試（TC-176-06）
- [ ] 單元測試覆蓋率 ≥ 80%
- [ ] Code review 通過
- [ ] 文件已更新（F050 spec 補入草稿階段估算能力規格）

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **對應 Spec**：F050（建立名單定義，本 Story 為其草稿階段新增能力）；亦涉及 F049（Stage 0 每日估算，功能互補對照）
- **相關 Stories**：US-106（草稿建立頁與篩選條件機制）、US-071（Stage 0 精確試算）、US-144（優質案件系統固定條件）、US-174 / US-175（共用抽樣估算產品邏輯）
- **Reference**：`prototypes/27a-list-create-draft.html`（L307-326 預覽 banner）、`apps/web/src/pages/assignment/list-create-draft-page.tsx`（現行 mock 程式碼 L354-362、面板渲染 L1134-1160）
