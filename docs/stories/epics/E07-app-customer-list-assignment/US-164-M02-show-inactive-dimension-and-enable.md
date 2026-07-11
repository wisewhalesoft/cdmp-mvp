# US-164：計分維度顯示停用維度並支援重新啟用

> **Story ID**：US-164
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M02 計分設定（Tab 2 — 計分維度）
> **優先級**：Must Have（P0）
> **階段**：Phase 1（MVP）
> **預估點數**：5
> **版本**：v1（2026-06-25 — 起因：H 卡 SALES_STS 曾被誤標 inactive，業務在設定頁完全看不到、查不出，導致計分長期少一維，最近才靠 migration m302 修回）

---

## User Story

**As a** 業務主管（部長 / 處長）
**I want** 在計分維度清單同時看到「停用（inactive）」的維度（含狀態標示），並能對停用維度執行「啟用」操作
**So that** 當某維度被誤停用或需重新納入評分時，我能在設定頁直接發現並自助修復，不必依賴 IT 進 DB 改 status，避免計分長期少一維而無人察覺

---

## 背景與問題

計分卡設定頁（Tab 2 計分維度）目前只顯示 `status='active'` 的維度。停用維度在 UI **完全隱形**：

- 後端 `assignment-scoring.service.ts` 的 `getScoring()` 維度查詢硬編 `where { ..., status: 'active' }`（apps/api 該檔約 L395-401），inactive 維度永不回傳。
- 後端有停用端點 `PUT /assignment/scoring/dimensions/:columnName/disable`（軟刪除 status→inactive），但**無對稱的「啟用」端點**。
- 一旦維度被停用（不論是業務主動停用，或如 SALES_STS 因 seed/legacy 漂移被誤標 inactive），業務在設定頁看不到該維度、無從察覺、更無法自助復原。

實害案例：H 卡 SALES_STS 維度（seed 與 legacy 皆應為 active）曾被誤標 inactive，導致月名單分派計分長期少一個維度，且因 UI 隱形而長期無人發現，最終靠 migration m302（`ActivateHSalesStsScoringColumn`）以資料庫遷移手動修回。本 Story 目標即消除此盲區：讓停用維度可見、可被啟用。

本 Story 與既有 US-073（編輯/新增/停用計分維度）為對稱補完——US-073 提供「停用」，本 Story 提供「顯示停用維度 + 重新啟用」。

---

## Phase 0 原型對照結論（CLAUDE.md 強制）

> 結論：**原型本身並未顯示停用維度，也沒有「啟用」action**。但現行 React **已部分超前原型**（已有「狀態」欄與 active/inactive chip 樣式）。本 Story 屬於「原型外的新增功能」，並要求 React 補上原型未實作、且為修復實害所需的「顯示 inactive 列 + 啟用按鈕」；同步要求把此設計意圖反映回原型（由後續 UI/UX 階段處理，本 Story 不改原型）。

逐點據實回報：

1. **原型 `prototypes/28-scoring-config.html`（Tab 2 計分維度）**
   - 表頭**確有「狀態」欄**（欄序：column_name / column_label / 類型 / 比對模式 / 分數區間摘要 / **狀態** / 操作；原型 L300-308）。
   - 但 render 函式 `renderDim()`（L1549-1596）對**每一列狀態欄都硬寫 `active`**（L1578-1582：固定綠底 `active` chip），沒有任何 inactive 分支。
   - 維度資料來源僅 `dimensionsByType[ct]`（純欄名陣列，**不帶 status 欄位**），demo 資料中**不存在任何 inactive 維度**。
   - 「操作」欄只有兩顆 icon 按鈕：**編輯（pencil）+ 停用（ban）**（L1583-1588），**沒有「啟用」action**。
   - → **原型沒有顯示停用維度、沒有啟用功能**。狀態欄目前只是預留為一律 `active` 的展示位。

2. **現行 React `apps/web/src/pages/assignment/scoring-config-page.tsx`（`DimensionsTab` L864-1110）**
   - **已有「狀態」欄**，且已實作 active（綠 chip）/ inactive（灰 chip）**兩種分支**（L980-1000，`d.status === 'active' ? ... : ...`）。比原型更進一步。
   - 「操作」欄有**編輯（pencil）+ 停用（Ban）**兩顆按鈕（L1004-1035），與原型一致；**同樣沒有「啟用」按鈕**。
   - 資料來源 `fetchAll` → `getScoring()`，但 `getScoring` 後端只回 active 維度，且**未回傳每維度的 `status` 欄位**；React 用防禦性 fallback `status: (d as any).status ?? 'active'`（L489）補欄位，故實務上**每列恆為 active**，inactive 分支從未被觸發。
   - → React 的 inactive chip 樣式是「有殼無料」：UI 能畫 inactive，但資料管線（後端過濾 active + 不回 status）讓它永遠收不到 inactive 列，也沒有啟用入口。

3. **API 現況**
   - `assignment-scoring.controller.ts`：有 `@Put('dimensions/:columnName/disable')`（L92-105）；**無 enable 端點**。
   - `assignment-scoring.service.ts`：`getScoring()` 維度查詢過濾 `status='active'`（L399），且回傳的 `ScoringDimensionItem` **不含 status 欄位**（L412-426）。`disableDimension()` 寫入前有月名單分派鎖檢查 `assertNotLocked()`（L730），停用 → `status='inactive'` + 寫 `assignment_audit_log`（L759-766）。

4. **側欄導覽檢查（CLAUDE.md）**
   - 路由 `/assignment/scoring` 已存在於 `apps/web/src/App.tsx`（L197-200，render `ScoringConfigPage`）。
   - 側欄 `apps/web/src/components/layout/app-sidebar.tsx` 已有項目「計分卡設定」→ `/assignment/scoring`（L125-126）。
   - → **本 Story 沿用既有頁面與路由，無需新增任何 route 或側欄項目。**

**判定（依 CLAUDE.md）**：原型既未顯示停用維度也無啟用功能，故本 Story **不是「補實作原型」，而是原型外的新增功能**，必須明確標示為新增。React 雖已超前原型畫好狀態欄與 inactive chip，但缺啟用入口、且資料管線讓 inactive 永不出現——本 Story 要把這條管線打通（後端回 inactive + status 欄位、前端顯示停用列、新增啟用入口與 API）。因此**不視為「React 偏離原型的 bug」**（React 並未錯誤繼承一個錯誤的導覽層級，狀態欄是合理超前實作）；而是把功能補齊並要求設計意圖回寫原型。

---

## 驗收標準

### AC-1：計分維度清單同時顯示 active 與 inactive 維度

- **Given** 業務主管在 Tab 1 已選中某 CARD_TYPE（其 active 計分版本同時含 active 與 inactive 維度）
- **When** 切換至 Tab 2（計分維度）且頁面載入完成
- **Then** 維度清單**同時列出該版本的 active 與 inactive 維度**（不再只顯示 active）
- **And** 每列「狀態」欄正確標示該維度狀態：active 顯示綠色 `active` chip、inactive 顯示灰色 `inactive` chip
- **And** inactive 維度列以灰底 / 視覺弱化標記，與 active 列明顯區隔（具體視覺由 UI/UX 階段依設計系統定義）

### AC-2：後端維度查詢回傳含 inactive 且帶每維度 status

- **Given** 前端呼叫 `GET /api/v1/assignment/scoring?cardType={X}`
- **When** 該 CARD_TYPE 的 active 版本下存在 inactive 維度
- **Then** 回應 `dimensions[]` **同時包含 active 與 inactive 維度**
- **And** 每個 dimension 物件**必含 `status` 欄位**（值為 `'active'` 或 `'inactive'`），前端不再依賴 `?? 'active'` 防禦性 fallback
- **And** inactive 維度雖在清單顯示，但**不影響月名單分派計分**（計分引擎 / `fn_calc_tier_level` 仍只採 `status='active'` 維度，與既有行為一致——本 Story 只改「可見性與啟用」，不改「計分採計範圍」）

> Open Question OQ-2：是否以查詢參數（如 `?includeInactive=true`）控制回傳範圍，或一律回傳全部由前端過濾。建議「一律回傳全部 + status 欄位」（最簡、單一資料源、避免兩套查詢路徑），但若有其他 `getScoring` 消費端在意 payload 體積或語意，需 spec-writer 評估。交由下游與使用者拍板。

### AC-3：對停用維度執行「啟用」

- **Given** 業務主管（具寫入權限的部長）在 Tab 2 看到一個 inactive 維度列
- **When** 點擊該列的「啟用」操作並於確認後送出
- **Then** 系統呼叫**新增的啟用端點**，將該維度 `ob_levelcard_column.status` 由 `'inactive'` 改回 `'active'`
- **And** 清單即時刷新，該維度狀態 chip 變為 `active`、灰底標記移除
- **And** 顯示啟用成功的 toast 提示
- **And** 啟用動作記錄操作者、時間、before/after 狀態至 `assignment_audit_log`（與既有 disable 對稱）

### AC-4：啟用端點對稱於既有停用端點（API 契約）

- **Given** 後端需提供啟用能力
- **When** 設計啟用端點
- **Then** 新增端點 `PUT /api/v1/assignment/scoring/dimensions/:columnName/enable`（路徑、query `cardType`、回應結構對稱於既有 `.../disable`）
- **And** 權限沿用既有寫入規則：class 級 `DirectorOrSectionChiefGuard` 基準閘 + method 級 `@RequireDirector()`（寫入限部長），且套用相同 `@RequireFeatureFlag('ENABLE_E07_REFACTOR_PHASE3')`
- **And** 目標維度若不存在於選中 CARD_TYPE 的 active 版本 → 回 404（沿用 `SCORING_COLUMN_NOT_FOUND` 語意）
- **And** 目標維度若已是 `active`（重複啟用）→ 回 404 / 或冪等成功，由 spec-writer 比照 disable「重複停用 → 404」既有慣例定義（見 OQ-3）

> Open Question OQ-3：「啟用一個本已 active 的維度」應回 404（對稱於 disable 對已 inactive 回 404 的慣例）、還是冪等回 200？建議比照 disable 既有 contract（findOne 限定相反狀態 → 找不到回 404），以維持兩端點對稱與測試可預期性。交由 spec-writer / 使用者確認。

### AC-5：月名單分派執行中禁止啟用 / 停用（資料鎖）

- **Given** 目前有月名單分派正在執行（`assignment_run.status IN ('pending', 'running')`）
- **When** 業務主管嘗試對某維度執行「啟用」（或「停用」）
- **Then** 寫入被阻擋，後端回 `409 SCORING_VERSION_LOCKED`（沿用既有 `assertNotLocked()` 機制，與 disable 完全一致）
- **And** 前端「啟用」/「停用」按鈕在鎖定期間 disabled，並顯示「分派執行中，無法修改計分設定」提示
- **And** 月名單分派完成後，啟用 / 停用功能自動恢復可用

### AC-6：權限——僅具寫入權限者可見並可操作「啟用」

- **Given** 使用者以「處長 / section_chief」（僅讀）身分進入 Tab 2
- **When** 檢視 inactive 維度列
- **Then** 可看到 inactive 維度與狀態（讀取開放至處長），但「啟用」操作按鈕為不可用 / 不顯示（寫入限部長，沿用 US-073 既有讀寫分流）
- **And** 後端 enable 端點對非部長身分一律拒絕（DirectorGuard）

---

## Technical Notes

- **後端查詢變更**：`assignment-scoring.service.ts` `getScoring()` 維度查詢移除 / 放寬 `status='active'` 過濾，改回傳 active + inactive，並於 `ScoringDimensionItem` 補 `status` 欄位輸出。需確認所有 `getScoring` 消費端（Shell `dimensionsQuery`、`fetchAll`、Tab count badge 等）對「清單含 inactive」的相容性（badge 計數是否應只計 active，見 OQ-4）。
- **新增端點**：`PUT /assignment/scoring/dimensions/:columnName/enable`，service `enableDimension(cardType, columnName, actor)` 對稱於 `disableDimension`——`assertNotLocked()` → `assertCardTypeActive()` → findOne 限定 `status='inactive'`（找不到回 404）→ `status='active'` → save → `writeAudit('ENABLE', 'ob_levelcard_column', ...)`。
- **前端**：`DimensionsTab` 操作欄對 inactive 列改顯示「啟用」按鈕（取代或並列於停用按鈕，由 UI/UX 定義），沿用 `runWriteOp` 鎖偵測與 toast；新增 `enableDimension` API client（對稱 `disableDimension`）。inactive 列灰底樣式 React 已有 chip 基礎，需補列級視覺弱化。
- **不在本 Story 範圍**：不改計分引擎採計邏輯（inactive 仍不參與計分）、不改原型 HTML（設計意圖回寫由 UI/UX 階段處理）、不處理「碼意義 decode 顯示」（見下方 OPEN QUESTION OQ-1）。
- 端點 / 欄位 / 錯誤碼之精確契約由 spec-writer 定稿，本 Story 僅界定行為與邊界。

---

## OPEN QUESTIONS（需使用者 / 下游拍板，勿擅自納入）

- [ ] **OQ-1（重要，需使用者拍板）：「碼意義 decode 顯示」是否納入本輪？**
  起因背景提到的「在 bracket / 分數設定旁顯示碼意義（如 `level1='A'` = 借新還舊）」**源自設計原則「計分卡衍生碼必須可回溯」**（見 agent memory `feedback_scorecard_derived_code_traceability`，2026-06-25；decode 對照已寫成文件 `docs/specs/scorecard-derived-code-dictionary.md` / AD-E07-10-S）。
  Phase 0 查證：原型 Tab 3「分數設定」**只顯示原始 `level1='A'`，無任何 decode**（`renderScoreTable()` 直接輸出 `l1`，prototypes/28 L1624-1636）；React `ScoresTab` 亦同（純顯示 `r.level1`，scoring-config-page.tsx L1265-1267）。→ 此為**原型外的全新設計**。
  **本 Story 建議：A1 只做「停用維度可見 + 啟用 + API」，decode UI 另開獨立 Story。** 理由：(a) decode 涉及跨 Tab（分數設定/維度）顯示策略、decode dictionary 資料來源與綁定方式、稽核可回溯的呈現規格，範圍與「啟用」功能正交；(b) 混入本 Story 會放大點數與測試面、拖慢修復實害（SALES_STS 盲區）的交付；(c) decode 已有專屬設計產物（AD-E07-10-S）可獨立承載。請使用者裁示：本輪納入 / 另開 Story / 暫緩。

- [ ] **OQ-2：`getScoring` 回傳 inactive 的控制方式**——一律回傳全部 + `status` 欄位（建議），或加 `?includeInactive=true` 參數？見 AC-2 註。
- [ ] **OQ-3：重複啟用（對已 active 維度按啟用）的回應**——404（對稱 disable 慣例，建議）或冪等 200？見 AC-4 註。
- [ ] **OQ-4：Tab count badge 計數語意**——「計分維度」Tab 的數字 badge 與「共 N 個維度」應計 active+inactive 全部，還是只計 active？建議「只計 active」以反映實際參與計分的維度數，inactive 在清單中以狀態區隔；需與使用者確認顯示期待。
- [ ] **OQ-5：是否需要「僅顯示 active / 顯示全部」的前端篩選切換**——清單變長時是否提供 toggle 隱藏 inactive？預設不納入（避免又一層隱形風險，與本 Story「消除盲區」初衷相左），列為可選增強。

---

## 依賴關係

- **Blocked By**：無（在既有 F053/F054 計分維度設定基礎上增量）
- **Blocks**：無
- **相關（對稱補完）**：[US-073 — 編輯計分維度與分數](US-073-M02-edit-scoring-dimension.md)（提供「停用」AC-4；本 Story 提供對稱的「顯示停用 + 啟用」）

---

## Definition of Done

- [ ] AC-1 ~ AC-6 全部滿足
- [ ] 後端 `getScoring` 回傳 active + inactive 維度且每維度含 `status`；新增 `enable` 端點對稱於 `disable`（含權限、feature flag、月名單分派鎖、audit log、404 語意）
- [ ] 前端 Tab 2 顯示 inactive 維度（狀態 chip + 列級弱化標記）並提供「啟用」入口；鎖定 / 權限行為正確
- [ ] 計分引擎採計範圍未變更（inactive 仍不參與計分）之回歸驗證
- [ ] Unit / 整合測試涵蓋：含 inactive 的查詢、啟用成功、重複啟用、404、月名單分派鎖 409、權限拒絕（>80% 覆蓋）
- [ ] `tsc --noEmit -p tsconfig.build.json` 乾淨（前後端）
- [ ] OQ-1 ~ OQ-5 已由使用者 / 下游裁示並記錄於 spec
- [ ] 設計意圖回寫原型之需求已交付 UI/UX 階段（本 Story 不改原型）
- [ ] Code review 通過

---

## 相關文件

- **Epic Brief**：[E07 客戶名單分派](epic-brief.md)
- **對稱 Story**：[US-073 編輯計分維度與分數](US-073-M02-edit-scoring-dimension.md)
- **設計原則（OQ-1 依據）**：agent memory `feedback_scorecard_derived_code_traceability`；decode dictionary `docs/specs/scorecard-derived-code-dictionary.md`（AD-E07-10-S）
- **實害修復遷移**：`apps/api/src/database/migrations/1711360000302-ActivateHSalesStsScoringColumn.ts`（SALES_STS 誤停用之手動修回）
- **原型**：`prototypes/28-scoring-config.html`（Tab 2 計分維度）
