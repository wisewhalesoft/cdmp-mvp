# US-165：計分卡設定頁顯示衍生碼的業務語意（decode UI）

> **Story ID**：US-165
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M02 計分設定（Tab 3 — 分數設定；可選延伸 Tab 2 計分維度）
> **優先級**：Should Have（P1）
> **階段**：Phase 1（MVP）
> **預估點數**：5
> **版本**：v1（2026-06-25 — 起因：計分卡 config 內的衍生碼（如 PROJECT_TP `level1='A'`）對業務不透明，落實設計原則「計分卡 config 的每個衍生碼必須可回溯到來源欄 + 規則 + 業務語意」之 UI 層；於 US-164 OQ-1 拍板拆為獨立 Story）

---

## User Story

**As a** 業務主管 / 稽核人員（部長 / 處長）
**I want** 在計分卡設定頁看到每個衍生碼的「業務語意」以及「該欄的值怎麼來的（來源欄 + 衍生規則）」
**So that** 我看 config 那一列（如 `A|06|06|37`）時，能直接讀懂 `'A'` 代表「借新還舊」、`AGENT/UCD/HFC` 代表代理商/中古車商/和潤自家，不必去翻引擎程式碼或單獨的 markdown 文件，達成衍生碼可回溯、可被業務與稽核自行確認的目標

---

## 背景與問題

CDMP 計分的分界是：

- **config（業務在「計分卡設定」可見/可設）**：哪些欄計分、各 bracket 的分數（`ob_levelcard_score` 的 level1/level2 → score）、card_level 區間、tier 映射。
- **引擎（寫死、業務不可見）**：每個欄的「值怎麼從原始資料**衍生**出來」——例如 PROJECT_TP 的 `level1='A'` 其實代表「借新還舊」，但這個對應只寫在引擎 `resolveColumnSource` / `resolveColumnValue` 與一份 markdown 文件裡。

→ 後果：業務看 config 那一列 `A|06|06|37`，**無法從 `'A'` 反推「借新還舊」**；config 的衍生碼缺乏「碼 → 來源欄 + 規則 + 業務語意」的可回溯性。

**設計原則（使用者 2026-06-25 拍板，agent memory `feedback_scorecard_derived_code_traceability`）**：
> 計分卡 config 的每個衍生碼，都必須可回溯到「來源欄 + 衍生規則 + 業務語意」，且應在 UI 呈現（不可只活在引擎程式碼）。

此 decode 對照已寫成設計產物 **`docs/specs/scorecard-derived-code-dictionary.md`（AD-E07-10-S）**——但目前只是一份文件，**UI 上看不到**。本 Story 即補上「設計原則的 UI 層」：把 decode dictionary 的內容呈現在計分卡設定頁，讓業務在原處（分數設定）就能讀懂碼意義與值的來源。

本 Story 接續 [US-164](US-164-M02-show-inactive-dimension-and-enable.md)（其 OQ-1 已建議將 decode UI 拆為獨立 Story 並由使用者拍板）。

### decode 真值來源（內容範圍）

依 AD-E07-10-S，需要 decode 的衍生碼包含（節錄，完整見該文件）：

- **§2.1 PROJECT_TP（composite，最需解碼）**：`level1='A'` = 借新還舊案件；`level1=NULL`（空）= 非借新還舊；`level2_s = level2_e` = 專案代碼 `spec_tp`（兩碼）。來源欄 `spec_tp` + `spec_name`。
- **§2.4 SALES_STS（category）**：`AGENT` = 代理商案件；`UCD` = 中古車商案件（來源值 `sales_sts_na='中古車商'`）；`HFC` = 和潤自家案件（其他，含「和潤」）。來源欄 `ob_pool_data.sales_sts_na`。
- **§2.2 CUS_SEX（range）**：`1`=男（個人）、`2`=女（個人）、`3`=法人；空/髒值計分 default 3。來源欄 `customer_core.cus_sex`。
- **§2.3 三縣市欄（HPOST/CPOST/CO_NUM_NM，category）**：`level1` = 縣市名（3 字）；引擎取 `customer_core` 縣市欄前 3 字比對；缺值套 per-card default 縣市。
- **§3 個人/法人分流（gating）**：CAREA_NO1/CAREA_NO2/CELLULAR/AGE/EDUCAT_BACK 五欄取值前先判個人/法人（法人多數恆 0 / default）——屬「值怎麼來」的衍生規則摘要。

---

## Phase 0 原型對照結論（CLAUDE.md 強制）

> 結論：**原型 Tab 3「分數設定」只顯示原始 `level1='A'` / `level2_s` / `level2_e` / `score`，無任何 decode**；現行 React `ScoresTab` 亦同。→ 本 Story 為**原型外的全新功能**（落實 2026-06-25 設計原則），**非「補實作原型」**，必須明確標示為新增；後續 UI/UX 階段需將此設計意圖回寫原型（本 Story 不改原型）。

逐點據實回報：

1. **原型 `prototypes/28-scoring-config.html`（Tab 3 分數設定）**
   - 表頭為 6 欄：column_name / 比對模式 / **level1** / level2_s / level2_e / score（L360-368）。
   - render 函式 `renderScoreTable()`（L1610-1640）對 level1 **直接輸出原始碼** `${l1 ?? '—'}`（L1631），**沒有任何碼意義 / 業務語意 / 來源欄 / 衍生規則的顯示**。
   - mock 分數資料為原始碼陣列，如 `['SALES_STS','AGENT',null,null,36]`、`['SALES_STS','UCD',null,null,36]`、`['SALES_STS','HFC',null,null,25]`（L1135）、PROJECT_TP composite 範例（L1126-1135 區段）——皆原始碼，無對照。
   - 全檔 grep「借新還舊」「decode」「業務語意」「代理商」「中古車商」**= 空**。
   - → **原型 Tab 3 沒有 decode 功能。**

2. **現行 React `apps/web/src/pages/assignment/scoring-config-page.tsx`（`ScoresTab` L1186-1361）**
   - Tab 3 為 v1.3 純唯讀總覽（6 欄：column_name / 比對模式 / level1 / level2_s / level2_e / score；L1273-1348）。
   - level1 同樣**直接輸出原始碼** `{r.level1 ?? '—'}`（L1328-1330），**無碼意義 decode**。
   - 已有 `MATCH_TYPE_DESC`（CATEGORY/RANGE/COMPOSITE 的「比對型」說明文字，L153-157）與 matchType chip（紫/藍/琥珀）——但那是「比對型」說明，**不是衍生碼的業務語意 decode**，兩者正交。
   - `getScoring()` 回傳之 `scores: ScoringScoreItem[]` 僅含 `level1/level2S/level2E/score`（`apps/web/src/api/assignment-scoring.ts` L43-48），**無 decode 欄位**；前端目前只有 bracket 原始資料、缺 decode map。Tab 2（計分維度）顯示 column 層（含 status，US-164 補完），亦無欄/碼層的衍生語意摘要。
   - → React Tab 3 與原型一致：有 bracket 原始資料，**缺 decode 呈現層**。

3. **後端契約現況（供 OQ-decode-1 參考）**
   - `getScoring()` 回傳每維度 `scores[]`（level1/level2/score），**不附帶任何 decode**。
   - **既有先例**：`status` 欄位由後端在 `ScoringDimensionItem` 提供（F106 / US-164，`assignment-scoring.ts` L55-58）——這正是「後端為單一來源、前端直接採用」的模式範本，可比照用於 decode（見 OQ-decode-1 建議）。
   - decode 真值已存在於引擎模組（`stage2to4-sql-builder.ts` 的 `resolveColumnSource` / pipeline 的 `resolveColumnValue`）與文件 AD-E07-10-S，但**尚未以結構化資料對 UI 暴露**。

4. **側欄導覽檢查（CLAUDE.md）**
   - 路由 `/assignment/scoring` 已存在於 `apps/web/src/App.tsx`（render `ScoringConfigPage`）。
   - 側欄已有「計分卡設定」→ `/assignment/scoring`。
   - → **本 Story 沿用既有頁面與路由，無需新增任何 route 或側欄項目。**

**判定（依 CLAUDE.md）**：原型與 React 皆只顯示原始衍生碼、無 decode，故本 Story **不是「補實作原型」，而是原型外的新增功能**（落實 2026-06-25 設計原則）。React 並未錯誤繼承任何錯誤導覽層級，無「偏離原型的 bug」；本 Story 要把 decode 呈現層補上，並要求把此設計意圖回寫原型（由後續 UI/UX 階段處理，本 Story 不改原型）。

---

## 範圍邊界

- **本 Story 只做 decode 的 UI 呈現（唯讀）**：讓業務在計分卡設定頁看得到衍生碼的業務語意 + 來源欄 + 衍生規則摘要。
- **decode 為唯讀說明**，**不是可編輯設定**——legacy 碼（如 `'A'`）的值不可在此更改；本 Story 不提供任何 decode 的新增/編輯/刪除。
- **不混入 US-164 的「啟用維度」功能**（兩者正交）。
- **不改計分引擎邏輯、不改原型 HTML、不寫 spec/test/code**（本 Story 僅界定行為與邊界，契約細節由 spec-writer 定稿）。

---

## 驗收標準

### AC-1：Tab 3 每列衍生碼旁顯示業務語意（decode）

- **Given** 業務主管在 Tab 1 已選中某 CARD_TYPE，切換至 Tab 3（分數設定）且資料載入完成
- **When** 該 CARD_TYPE 的分數列含有「不透明衍生碼」的維度（至少 PROJECT_TP 與 SALES_STS）
- **Then** 每列在原始碼（level1，或 PROJECT_TP 的 level1 + level2 複合碼）旁，顯示對應的**業務語意**：
  - PROJECT_TP：`level1='A'` → 顯示「借新還舊」；`level1=NULL`（空）→ 顯示「非借新還舊」；`level2_s=level2_e` 的兩碼 → 標示為「專案代碼 `spec_tp`」
  - SALES_STS：`AGENT` → 「代理商」；`UCD` → 「中古車商」；`HFC` → 「和潤自家」
- **And** decode 文字與原始碼並陳（原始碼不被取代，仍可見），以利稽核對照
- **And** 該維度若無對應 decode（一般 fallback 數值欄），不顯示 decode 文字、亦不報錯（優雅降級）

> 範圍另見 OQ-decode-2：本 AC「至少」涵蓋 PROJECT_TP、SALES_STS；CUS_SEX / 三縣市 / 分流 gating 是否一併納入由 OQ-decode-2 拍板。

### AC-2：顯示「該欄的來源欄 + 衍生規則」摘要

- **Given** 業務主管檢視 Tab 3 某個有 decode 的維度（或其維度層說明）
- **When** 該維度具備 AD-E07-10-S 定義的來源欄與衍生規則
- **Then** 顯示該欄的**來源欄**與**衍生規則摘要**（讓業務知道「值怎麼來的」），例如：
  - PROJECT_TP：來源 `spec_tp` + `spec_name`；規則「spec_tp 代碼 **且** 是否借新還舊」
  - SALES_STS：來源 `ob_pool_data.sales_sts_na`；規則「轉成 AGENT/UCD/HFC」
- **And** 呈現形式（inline 欄 / tooltip / 可展開區塊 / 維度層摘要 vs 碼層 inline）由 OQ-decode-3 拍板，本 AC 只要求「業務能在設定頁讀到來源欄 + 規則」這個結果可達成

### AC-3：decode 為唯讀，不可編輯

- **Given** 業務主管（即使具部長寫入權限）檢視 Tab 3 的 decode 內容
- **When** 嘗試與 decode 文字 / 來源欄 / 規則摘要互動
- **Then** decode 一律為**唯讀展示**，無任何新增 / 編輯 / 刪除入口
- **And** 既有 config 編輯入口（Tab 2 維度編輯、分數區間設定等）行為不受本 Story 影響（decode 只是疊加說明層）

### AC-4：decode 內容與 AD-E07-10-S 一致（可回溯性）

- **Given** decode UI 已顯示
- **When** 對照 `docs/specs/scorecard-derived-code-dictionary.md`（AD-E07-10-S）的碼意義
- **Then** UI 顯示之碼意義 / 來源欄 / 衍生規則**與該文件一致**（不得出現與文件矛盾或自創的語意）
- **And** decode 內容的**單一資料來源**與同步維護方式由 OQ-decode-1 / OQ-decode-4 拍板，確保未來引擎衍生邏輯變更時，UI、文件、引擎不會走鐘

### AC-5：未選中 CARD_TYPE / 無分數資料時優雅降級

- **Given** Tab 1 尚未選中 CARD_TYPE，或選中 CARD_TYPE 無生效版本 / 無分數列
- **When** 業務主管切換至 Tab 3
- **Then** 沿用既有空狀態 / 提示行為（如「請先在 Tab 1 選擇計分卡類型」、「目前無分數區間設定」），decode 層不產生額外錯誤或空白區塊

### AC-6：權限——讀取開放至處長

- **Given** 使用者以「處長 / section_chief」（僅讀）身分進入 Tab 3
- **When** 檢視 decode 內容
- **Then** 可正常看到 decode（碼意義 + 來源欄 + 規則）——decode 為唯讀說明，讀取權限沿用 Tab 3 既有讀取規則（開放至處長），不因 decode 而收緊

---

## Technical Notes

- decode 真值來源見 `docs/specs/scorecard-derived-code-dictionary.md`（AD-E07-10-S）§2.1（PROJECT_TP）/ §2.2（CUS_SEX）/ §2.3（三縣市）/ §2.4（SALES_STS）/ §3（個人法人分流）/ §1（每欄來源欄 + 衍生規則總表）。
- 引擎側 decode 衍生邏輯位於 `stage2to4-sql-builder.ts`（`resolveColumnSource`）/ `assignment-run-pipeline.service.ts`（`resolveColumnValue`）——若採「後端為單一來源」方案（OQ-decode-1 建議 (a)），decode map 應與此同源導出，避免雙寫。
- 前端目前 `getScoring()` 之 `scores[]` 僅含 level1/level2/score（`apps/web/src/api/assignment-scoring.ts`）；`ScoresTab` 顯示原始碼（scoring-config-page.tsx L1296-1346）。decode 呈現需在此疊加，不取代原始碼欄。
- **先例可比照**：`status` 欄位由後端在 `ScoringDimensionItem` 提供、前端直接採用（F106 / US-164）——decode 可循同模式由後端在 `getScoring()` 回傳結構化 decode，前端純呈現。
- 精確契約（decode 資料結構、放在 `scores` 列層或維度層、欄位命名、來源/同步機制）由 spec-writer 依 OQ 裁定結果定稿；本 Story 僅界定行為與邊界。
- **不在本 Story 範圍**：不改計分引擎採計邏輯、不改原型 HTML（設計意圖回寫由 UI/UX 階段處理）、不做 decode 的編輯能力、不處理 US-164 的「啟用維度」。

---

## OPEN QUESTIONS（需使用者 / architect 拍板，勿擅自納入）

- [ ] **OQ-decode-1（最關鍵，架構）：decode 資料來源放哪？**
  UI 的 decode map 從哪取得？
  - **(a) 後端在 `getScoring()` 回傳每欄 / 每碼的 decode**（碼意義 + 來源欄 + 衍生規則），與引擎衍生模組同源導出。
  - (b) 前端常數表（鏡像 AD-E07-10-S）——實作最快，但與引擎 / 文件**雙寫易走鐘**，違背可回溯性原則的初衷。
  - (c) 新建 config 資料表存 decode——可由 UI 維護，但需 ETL / migration 與引擎硬寫邏輯對齊，成本高且仍有同步議題。
  **建議：(a)**。理由：本 Story 的整個動機就是「衍生碼可回溯到引擎真實衍生規則」，decode 必須與引擎 `resolveColumnSource` / `resolveColumnValue` **單一來源**才不會出現「UI 說 A，引擎做 B」的可回溯性破口；且已有 `status` 由後端供給的先例，工程模式成熟。請使用者 / architect 拍板。

- [ ] **OQ-decode-2：decode 範圍**——先只做「有不透明碼」的欄（PROJECT_TP、SALES_STS），還是一次納入全部衍生欄（含 CUS_SEX 性別碼、三縣市前 3 字、個人/法人分流 gating 說明）？
  **建議：第一期至少 PROJECT_TP + SALES_STS（最不透明、業務最常困惑），其餘（CUS_SEX / 三縣市 / 分流）若 OQ-decode-1 採方案 (a) 則邊際成本低、可一併納入**；若採前端常數表則建議分期以控制走鐘面。請使用者拍板涵蓋面。

- [ ] **OQ-decode-3：呈現位置 / 形式**——Tab 3 列 inline 加 decode 欄 / 碼旁灰字 / hover tooltip / 可展開說明區塊？是否同時於 Tab 2（計分維度）顯示「欄層衍生摘要」（來源欄 + 規則，不到碼層）？
  **建議：Tab 3 碼層採「原始碼 + 並陳 decode 文字」（碼旁灰字或新增一 decode 欄，原始碼保留以利稽核對照）；Tab 2 維度層加一行「來源欄 + 衍生規則」摘要作為欄層說明**。tooltip 可作為次選（資訊密度高時）。最終視覺由 UI/UX 階段依設計系統定稿。

- [ ] **OQ-decode-4：同步維護機制**——decode 來源（不論放哪）與引擎 `resolveColumnSource` / `resolveColumnValue` 及 AD-E07-10-S **如何保持同步、避免走鐘**（呼應 traceability 原則）？
  **建議：若採 OQ-decode-1 (a)，decode 由引擎模組導出 / 共用同一份對照常數（single source in code），並加一條測試斷言「UI decode 輸出 ≡ 引擎衍生規則對照」；AD-E07-10-S 文件維護規則（該文件 §4）已要求隨引擎變更同步更新，於本 Story DoD 納入「decode 來源與 AD-E07-10-S 一致性檢核」**。請 architect 於 spec / architecture decision 定稿同步策略。

---

## 依賴關係

- **Blocked By**：[US-164 — 計分維度顯示停用維度並支援重新啟用](US-164-M02-show-inactive-dimension-and-enable.md)（其 OQ-1 拍板將 decode UI 拆為本獨立 Story；非硬技術阻擋，為決策前置）
- **Blocks**：無
- **相關**：[US-072 — 查看計分維度設定](US-072-M02-view-scoring-dimensions.md)（Tab 2 維度查看基礎）、[US-073 — 編輯計分維度與分數](US-073-M02-edit-scoring-dimension.md)（Tab 2/3 config 編輯入口）

---

## Definition of Done

- [ ] AC-1 ~ AC-6 全部滿足
- [ ] Tab 3 在 PROJECT_TP / SALES_STS（及 OQ-decode-2 拍板之範圍）顯示衍生碼業務語意 + 來源欄 + 衍生規則摘要，且 decode 唯讀
- [ ] decode 內容與 `docs/specs/scorecard-derived-code-dictionary.md`（AD-E07-10-S）一致；decode 來源與 AD-E07-10-S / 引擎衍生邏輯之一致性檢核已納入（依 OQ-decode-1 / OQ-decode-4 裁定）
- [ ] 無對應 decode 的維度優雅降級（不顯示、不報錯）；未選 CARD_TYPE / 無分數列之空狀態正確
- [ ] 計分引擎採計邏輯未變更（本 Story 純 UI 呈現）之回歸確認
- [ ] OQ-decode-1 ~ OQ-decode-4 已由使用者 / architect 裁示並記錄於 spec / architecture decision
- [ ] 設計意圖回寫原型之需求已交付 UI/UX 階段（本 Story 不改原型）
- [ ] `tsc --noEmit -p tsconfig.build.json` 乾淨（依下游實作；若採後端供給方案含後端）
- [ ] Code review 通過

---

## 相關文件

- **Epic Brief**：[E07 客戶名單分派](epic-brief.md)
- **設計原則**：agent memory `feedback_scorecard_derived_code_traceability`（2026-06-25 使用者拍板）
- **decode 真值來源**：`docs/specs/scorecard-derived-code-dictionary.md`（AD-E07-10-S）
- **拆分來源**：[US-164](US-164-M02-show-inactive-dimension-and-enable.md) OQ-1（拍板將 decode UI 另開獨立 Story）
- **引擎衍生邏輯**：`stage2to4-sql-builder.ts`（`resolveColumnSource`）、`assignment-run-pipeline.service.ts`（`resolveColumnValue`）；對齊 spec AD-E07-10-L
- **原型**：`prototypes/28-scoring-config.html`（Tab 3 分數設定；目前無 decode）
- **前端**：`apps/web/src/pages/assignment/scoring-config-page.tsx`（`ScoresTab`）、`apps/web/src/api/assignment-scoring.ts`（`getScoring` / `ScoringScoreItem`）
