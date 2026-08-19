---
last-updated: 2026-08-18
version: v1.3
change-summary: "v1.3（system-architect 追查後 descope）：AC-13 原標題「名單詳情 / 名單定義列表 / 快照條件顯示」隱含快照頁已有條件顯示、本輪僅需擴充格式，此前提經 system-architect 查證後推翻——快照 `buildConfigPayload()`（`assignment-run-pipeline.service.ts:1801-1807`）之 `listDefinitions[]` 從未攜帶 `condition_payload`，前端 6 個快照元件全文 grep `conditionPayload`/`columnName` 零命中，快照從來就沒記錄過名單篩選條件，此為既有缺口非本 Story 造成。使用者裁決 descope：AC-13 縮為「名單詳情 Drawer」與「名單定義列表」兩個真實存在的顯示端，移除快照；TC-183-13 同步縮減；「不含範圍」新增完整背景說明（含兩項查證證據、descope 理由、建議另開票處理快照稽核完整性議題）。AC/TC 總數不變（16/16，僅描述縮減，未刪減或新增項目）。v1.2（team lead 二次複核修正，撤回 v1.1 對 AC-11 之誤刪）：v1.1 誤以為『Stage 0 試算逾時現況已滿足、AC-11 可刪』，team lead 複核後指出係查錯頁面——v1.1 查的是命中預估面板（US-176），AC-11 原本講的是 Stage 0 每日分派數量估算（US-071）之部門估算頁，兩者是不同端點。重新查證後確認：`stage0-estimate.service.ts:557-570` 逾時時已產生 `STAGE0_LIST_ESTIMATE_PARTIAL` warning，但 `stage0-estimate-page.tsx` 完全未渲染此 warning（現況僅渲染 SCOPE_UNRESOLVED / CALENDAR_EMPTY / POOL_COUNT_LOW / HEADCOUNT_ZERO 四種），逾時名單實質上靜默以 0 貢獻部門合計、畫面零提示。AC-11 於 v1.2 補回並依新證據重新措辭（要求範圍從「新增逾時偵測」改為「渲染既有 warning」，成本更低、更精確）；OQ-183-03 重新開啟並依 team lead 指示之推理重新定義（同一 warning code 不分觸發原因，範圍認定交 system-architect）。原 v1.1 AC-11~15（三處一致性 / 詳情顯示 / 重複判定 / 向後相容 / 建立編輯一致）順移為 AC-12~16，TC 同步順移＋新增 TC-183-11。已拍板決策第 5 項、不含範圍、相關文件等段落一併修正措辭。v1.1（人工複核修正）：AC-3「不包含」對 NULL 值之裁定改為**依資料來源分流**——`ob_pool_data` 保留 NULL（v1.0 原裁定），`customer_core`／`customer_financial` 排除 NULL（沿用既有不變式 `I-CC-NULL-EXCLUDE-01` / `I-CF-NULL-EXCLUDE-01`，不得變更）；TC-183-03 同步拆為兩情境（此項 v1.1 判斷正確，v1.2 維持不變）。v1.0 初版：類別型篩選欄位新增文字比對運算子（包含 / 不包含 / 完全等於），與現況核取清單式 IN 並列供部長於建立草稿名單、編輯草稿名單時擇一使用。單一關鍵字、三個資料來源（ob_pool_data / customer_core / customer_financial）全部支援、重複名單判定須能區分運算子語意。建議對應 spec 編號：F119（spec-index 現有最高編號為 F118）。"
---

# US-183：類別型篩選欄位新增文字比對運算子（F119）

> **Story ID**：US-183
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M01 名單定義（草稿階段篩選條件建構子流程，涵蓋建立草稿與編輯草稿兩進入點）
> **優先級**：Should Have
> **階段**：Phase 2（Advanced，既有 Phase 1 篩選功能之能力擴充）
> **預估點數**：13

---

## User Story

**As a** 部長（Director）或 Admin，在建立或編輯客戶名單草稿時設定類別型篩選欄位
**I want** 除了現況「勾選可選值清單（IN）」之外，能再選擇「文字包含」「文字不包含」「文字完全等於」三種文字比對方式，並輸入一個關鍵字作為篩選條件
**So that** 我可以針對像「主約專案名稱」這類值域極廣、無法窮舉可選值的類別型欄位（例如需要找出所有主約專案名稱含「勁便利」字樣的案件），直接以關鍵字方式篩選，不必被迫先透過 distinct 值機制把成千上百種可能值全部登錄為可選值才能勾選

---

## 背景說明

現行「客戶名單分派 > 名單定義 > 建立名單草稿」（以及編輯草稿名單）頁面，類別型（categorical）篩選欄位的條件設定固定為「勾選可選值清單」，等同 SQL 語意的 `IN (...)`：

- 後端 `ConditionItemDto`（`apps/api/src/modules/assignment-list/dto/condition-item.dto.ts:97`）categorical 條件僅接受 `values: string[]`，沒有運算子概念，schema 上不存在「怎麼比對」這件事，只有「比對哪些值」。
- Stage 1 查詢組裝 `buildCategoricalFragment()`（`apps/api/src/modules/assignment/stage1/stage1-query-composer.ts:358`）固定產生 `"col" IN (:...catN)`，沒有其他比對方式的分支。
- 前端 `CategoricalValuesPicker`（`apps/web/src/pages/assignment/list-create-draft-page.tsx:1532`）是核取清單元件，比對方式標籤直接寫死文字 `IN`；可勾選的值只能來自 `pooldata_field_option` 已登錄的可選值。

對於像「主約專案名稱」（`ob_pool_data.spec_name`）這種值域極廣、無法窮舉的欄位，現行唯一近似做法是先用 F112（US-178）distinct 值自動建議機制把實際存在的值撈進可選值清單、再全選 —— 但這個做法有明確上限（`DISTINCT_VALUES_CAP` 約 200 筆、查詢逾時約 15 秒），加上「勁便利」這類新專案上線後才出現的值，若在建議清單建立當下尚未出現在資料中，就會被漏勾，且這個做法本質上也做不到「不包含某關鍵字」。

**業務先例（非本 Story 發明新語意，而是把既有能力條件化開放）**：legacy Stored Procedure 早已對 `spec_name` 做文字比對，只是寫死在程式碼裡、業務主管不可自行設定：
- `spec_name LIKE '%白牌%'`（詐騙白牌 DELETE，`apps/api/src/modules/assignment/stage1/special-rules.ts:15`）
- `SPEC_NAME LIKE '%小資%'`（期中小資最後七期排除，同檔案 L17/L94）
- `spec_name LIKE '%借新還舊%'`（計分卡衍生碼判定，`apps/api/src/modules/assignment/stage1/scoring-decode.constants.ts:64`）

本 Story 要把「文字比對」這件事，從寫死在程式碼裡的固定規則，變成部長可在名單定義畫面自行設定的篩選條件——設定值即為使用者輸入的關鍵字（如「勁便利」），比對方式為業務主管自選的「包含 / 不包含 / 完全等於」。

**三個資料來源皆須支援**：目前類別型篩選欄位分屬三個來源表：`ob_pool_data`（如主約專案名稱）、`customer_core`（如職業別、居住城市，US-172／F109）、`customer_financial`（如有無保人，US-172 系列）。業務主管在畫面上操作篩選條件時，不會意識到某個欄位背後是哪張表，若只有部分來源支援文字比對，會產生「為什麼這個類別型欄位可以打關鍵字、那個卻不行」的困惑，因此本 Story 要求三個來源的類別型欄位**全部**支援文字比對運算子。

**重要現況約束（人工複核時發現，直接影響 AC-3 之 NULL 值裁定）**：`customer_core` / `customer_financial` 兩個來源之 Stage 1 查詢組裝已有明文架構不變式：
- `I-CC-NULL-EXCLUDE-01`（`apps/api/src/modules/assignment/stage1/stage1-customer-core-clause.ts:13-16`）：「客戶欄一律**不得 COALESCE**；NULL（無對應客戶 / 客戶欄本身 NULL）恆通過 SQL 三值邏輯自然排除⋯兩種 NULL 情境共用同一段運算式，**不得另立 if/else 特判**」
- `I-CF-NULL-EXCLUDE-01`（`apps/api/src/modules/assignment/stage1/stage1-customer-financial-clause.ts:14-15`）：`customer_financial` 之對等不變式

這代表 `customer_core` / `customer_financial` 來源的 NULL 案件（含「查無對應客戶」與「客戶存在但欄位本身無值」兩種情境）在既有架構下**恆被排除**，不可為了本 Story 另外開特例。這條不變式限縮了 AC-3「不包含」對 NULL 值之處理方式，詳見 AC-3。

---

## 已拍板決策（不再列為待解決問題）

以下項目已由業務主管拍板，直接作為驗收基準：

1. **運算子集合**：`in`（現況，勾選可選值清單，維持預設）／`contains`（文字包含）／`not_contains`（文字不包含）／`equals`（文字完全等於）。
2. **來源範圍**：`ob_pool_data`、`customer_core`、`customer_financial` 三個來源之類別型欄位全部支援全部四種運算子。
3. **關鍵字數量**：MVP 一列條件僅接受**單一**關鍵字。需要多個關鍵字時，由使用者自行新增多列條件（列與列之間維持現有 AND 語意）。不支援多關鍵字 OR，不支援 legacy 那種同一 LIKE 內連續多個關鍵字（如 `%期中%機車%`）的寫法。
4. **運算子互斥**：同一條件列僅能擇一運算子；選 `in` 時顯示核取清單，選任一文字運算子時改顯示文字輸入框，兩者不並存、不同時儲存兩套值。
5. **效能因應方式**：`LIKE '%關鍵字%'` 無法使用索引，對 `ob_pool_data`（約 167 萬列）之類全表掃描查詢有逾時風險。本 Story 不引入新的效能機制，作法為：（a）UI 於選用文字運算子時顯示「模糊比對較耗時，預估可能逾時」提示；（b）建立草稿頁「預估命中筆數」面板（`list-create-draft-page.tsx`，US-176）現況已具備逾時 / 失敗之明確錯誤呈現與重試（`catch` 區塊 `setEstimateState('error')` + 顯示「預估暫時無法取得」+ 重試按鈕），本 Story 沿用即可，**不需要**額外開發；（c）Stage 0 部門估算頁（`stage0-estimate-page.tsx`，F049 v2.0）現況則**確實有落差**：後端逾時時已產生 `STAGE0_LIST_ESTIMATE_PARTIAL` warning（`apps/api/src/modules/assignment-list/stage0-estimate.service.ts:557-570`），但前端未渲染此 warning，導致使用者無從得知合計數字其實已排除估算逾時的名單——本 Story 要求把此既有 warning 渲染出來（見 AC-11），成本為前端渲染既有資料，非新增偵測邏輯。（本項曾於 v1.1 一度誤判為「現況全部已滿足、無需修正」，經 team lead 複核指出係查錯頁面所致，(c) 項缺口於 v1.2 更正並補回，詳見 change-summary）
6. **字串比對語意**：直接沿用資料庫既有 `Chinese_Taiwan_Stroke_BIN` collation 之原生 `LIKE` 行為（大小寫、全形／半形敏感），與 legacy SP 現行行為一致，不另做正規化或不分大小寫比對。

---

## 驗收標準

### AC-1：類別型欄位條件列新增運算子選擇

- **Given** 部長或 Admin 在建立或編輯草稿名單時新增（或編輯既有）一列類別型篩選欄位條件
- **When** 該條件列顯示比對方式選項
- **Then** 選項須包含四種：`IN`（現況核取清單，預設選中）、`包含`、`不包含`、`完全等於`
- **And** 未特別選擇時，維持現況行為（`IN` 核取清單），不影響任何既有操作路徑

### AC-2：「文字包含」篩選語意

- **Given** 使用者於某條件列選擇「包含」運算子，並輸入關鍵字（例如「勁便利」）
- **When** 系統套用此條件（Stage 0 試算 / 命中預估 / 月名單分派實際執行，三處皆同）
- **Then** 僅保留「該欄位值不為 NULL 且包含此關鍵字」之案件；欄位值為 NULL 之案件視為不滿足「包含」，不出現在結果中
- **And**（三來源機制不同、結果一致，無需分流）：`ob_pool_data` 欄位 NULL 被排除，是因為空值本就不含任何關鍵字這一直觀事實；`customer_core` / `customer_financial` 欄位 NULL（含查無對應客戶之情形）被排除，則是既有不變式 `I-CC-NULL-EXCLUDE-01` / `I-CF-NULL-EXCLUDE-01`（客戶欄不得 COALESCE，NULL 經 SQL 三值邏輯天然被 WHERE 排除）之既有行為。兩者在「包含」運算子下**結果剛好一致**（NULL 皆排除），因此本 AC 不需要如 AC-3 般依來源分流

### AC-3：「文字不包含」篩選語意（依資料來源分流，含 NULL 值業務裁定）

- **Given** 使用者於某條件列選擇「不包含」運算子，並輸入關鍵字（例如「勁便利」）
- **When** 系統套用此條件
- **Then** 保留「該欄位值不含此關鍵字」之案件；NULL 值案件之處理**依資料來源分流**（業務裁定 + 既有架構不變式共同決定，非本 Story 新增之特例）：
  - **來源為 `ob_pool_data` 之欄位**（如主約專案名稱）：欄位值為 NULL（案件確實存在、僅該欄位未填寫）視為「不包含」，**予以保留**。業務裁定理由：業務主管詢問「不包含勁便利」時，直覺認知是「排除主約專案名稱含勁便利的案件」，一個根本沒有填寫主約專案名稱的案件，理應落在「不含勁便利」的集合內，不應被技術上 `NOT LIKE` 對 NULL 的預設行為悄悄濾除。
  - **來源為 `customer_core` / `customer_financial` 之欄位**（如職業別、有無保人）：欄位值為 NULL（含「查無對應客戶」之 LEFT JOIN miss、與「客戶存在但該欄位本身無值」兩種情境）視為「資料不明」，**一律排除**，不視為「不包含」。此為既有架構不變式 `I-CC-NULL-EXCLUDE-01` / `I-CF-NULL-EXCLUDE-01` 之既有行為（客戶欄一律不得 COALESCE，兩種 NULL 情境共用同一段運算式、不得另立 if/else 特判）——本 Story **沿用**此既有不變式，**不要求變更**。業務理由（正面規則而非例外）：客戶資料不明的案件，不應依不明資料被納入分派。
- **And** `ob_pool_data` 來源下，此裁定與 AC-2「包含」對 NULL 之處理刻意不對稱（NULL 在「包含」下被排除、在「不包含」下被保留），此為業務主管確認之預期行為，非缺陷
- **And** `customer_core` / `customer_financial` 來源下，「不包含」對 NULL 排除的方向與「包含」「完全等於」對 NULL 排除的方向一致（三者皆排除），**僅 `ob_pool_data` 來源之「不包含」是唯一例外**（保留 NULL）——此為兩類來源 NULL 語意本質不同所致（`ob_pool_data` NULL＝案件存在、欄位空白；`customer_core`/`customer_financial` NULL＝客戶資料不明），非邏輯不一致
- **And** 本分流規則屬業務裁定與既有系統不變式共同決定之最終行為；system-architect 撰寫對應規格 / AD 時**不需要**、也**不應該**變更 `I-CC-NULL-EXCLUDE-01` / `I-CF-NULL-EXCLUDE-01` 本身——本 AC 描述的是「不包含」運算子在 `ob_pool_data` 來源額外新增的正面邏輯（保留 NULL），而非要求 `customer_core` / `customer_financial` 跟進

### AC-4：「文字完全等於」篩選語意

- **Given** 使用者於某條件列選擇「完全等於」運算子，並輸入關鍵字
- **When** 系統套用此條件
- **Then** 僅保留「該欄位值與關鍵字逐字元完全相同」之案件；欄位值為 NULL 之案件視為不滿足，不出現在結果中
- **And** 與 AC-2 相同，三來源之 NULL 皆排除（`ob_pool_data` 因空值本就不等於任何具體關鍵字；`customer_core` / `customer_financial` 因 `I-CC-NULL-EXCLUDE-01` / `I-CF-NULL-EXCLUDE-01` 既有三值邏輯排除），結果方向一致，不需分流

### AC-5：運算子與既有 IN 核取清單介面互斥切換

- **Given** 使用者將某條件列之運算子從 `IN` 切換為任一文字運算子（或反向切換）
- **When** 切換發生
- **Then** 介面須明確切換顯示型態（`IN` → 核取清單；文字運算子 → 單一文字輸入框），兩者不同時顯示
- **And** 切換後，前一種運算子已輸入 / 已勾選之內容須被清除，不得殘留並隨表單一併送出（避免使用者以為已清空、實際上還留著舊的勾選值或關鍵字一起儲存）

### AC-6：MVP 限制為單一關鍵字

- **Given** 使用者選擇任一文字運算子（包含 / 不包含 / 完全等於）
- **When** 使用者於輸入框輸入內容
- **Then** 僅接受單一關鍵字（單一文字輸入框，非多值清單、非以分隔符號輸入多個關鍵字）
- **And** 若需要以多個關鍵字篩選，須由使用者自行新增多列條件（沿用既有列間 AND 語意），本欄位不提供「同時符合多個關鍵字任一」（OR）或「同時符合多個關鍵字全部」的單列多關鍵字功能

### AC-7：關鍵字不可為空白或純空白字元

- **Given** 使用者選擇任一文字運算子，但關鍵字輸入框為空、或僅輸入空白字元（含全形空白）
- **When** 使用者嘗試儲存
- **Then** 系統阻擋儲存，顯示明確驗證錯誤訊息，要求輸入至少一個非空白字元的關鍵字
- **And** 此驗證與現況 `IN` 運算子「`values` 至少需 1 個元素」之驗證強度對等，不因改用文字運算子而降低驗證嚴謹度

### AC-8：使用者輸入之特殊字元視為字面值

- **Given** 使用者於關鍵字中輸入 `%`、`_`、`[` 等資料庫萬用字元語法保留字元（例如關鍵字為「50%達成率」）
- **When** 系統套用此條件
- **Then** 系統須將這些字元視為字面值本身進行比對（即只比對「真的包含 `50%達成率` 這個字串」的案件），不得被資料庫解讀為萬用字元語法（例如 `%` 被誤解讀為任意字元序列、`_` 被誤解讀為任意單一字元）
- **And** 此行為在「包含」「不包含」「完全等於」三種運算子下皆須一致成立

### AC-9：三個資料來源之類別型欄位皆支援文字比對運算子

- **Given** 某類別型篩選欄位之資料來源為 `ob_pool_data`、`customer_core`、或 `customer_financial` 三者之一
- **When** 使用者於條件列設定該欄位之篩選條件
- **Then** 無論來源為何，四種運算子（`IN` / 包含 / 不包含 / 完全等於）皆同等可選、行為一致，使用者不會因欄位背後資料來源不同而看到功能缺漏
- **And** 三來源之運算子操作方式一致，但 NULL 值處理依 AC-2 ~ AC-4 定義之規則（僅「不包含」依來源分流，見 AC-3）

### AC-10：選用文字運算子時顯示效能提示

- **Given** 使用者將某條件列切換為任一文字運算子
- **When** 該運算子生效
- **Then** 介面須顯示提示文字，告知「模糊比對較耗時，預估可能逾時」（或等義文案，確切措辭由 ui-ux-designer 定案），使使用者對可能的等待時間或逾時風險有心理預期
- **And** 此提示不阻擋使用者繼續操作，僅為告知性質

### AC-11：Stage 0 部門估算頁之「名單估算逾時」既有 warning 須讓使用者看得到

- **Given** 使用者於篩選條件中使用文字運算子，且該名單於 Stage 0 部門維度估算（`stage0-estimate.service.ts`）中，個別名單的估算查詢（`estimateListCount`）因全表比對耗時而超過 `raceTimeout` 逾時門檻
- **When** 逾時發生
- **Then** 該名單依現況邏輯已從部門合計中排除（`catch` 區塊不將該名單寫入 `listTotals`），**且**畫面須讓使用者清楚看到「這張名單估算逾時、未被計入本次合計」的提示，不得讓使用者誤以為畫面上的合計數字已涵蓋全部名單
- **And** 後端**已經**具備對應機制：逾時時會產生 `STAGE0_LIST_ESTIMATE_PARTIAL` warning（`apps/api/src/modules/assignment-list/stage0-estimate.service.ts:557-570`，訊息「名單 {list_no} 估算逾時，已從本次合計排除。」），**但前端 `stage0-estimate-page.tsx` 目前完全未渲染此 warning**（現況僅渲染 `SCOPE_UNRESOLVED` / `CALENDAR_EMPTY` / `POOL_COUNT_LOW` / `HEADCOUNT_ZERO` 四種）。本 AC 要求把既有的 `STAGE0_LIST_ESTIMATE_PARTIAL` warning 渲染出來，成本本質是「把後端已有的資料呈現給使用者」，非新增逾時偵測邏輯
- **And** 此要求不限於本 Story 新增之文字運算子觸發的逾時；同一個 `STAGE0_LIST_ESTIMATE_PARTIAL` warning code 不分觸發原因（既有數值 / `IN` 條件搭配寬鬆篩選範圍時同樣可能觸發），本 Story 因新增文字運算子而**提高**此既有缺口的觸發機率，使其更值得優先處理，但「修正範圍究竟僅涵蓋本 Story 觸發情境、或一併涵蓋既有觸發情境」由 system-architect 依 OQ-183-03 確認並定案
- **And**（歸屬澄清，避免誤讀為本 Story 新增功能引入的 bug）此為 **F049 v2.0 部門估算既有缺口，非本 Story 造成**——後端契約（`STAGE0_LIST_ESTIMATE_PARTIAL` warning 之產生邏輯）在本 Story 之前即已存在且運作正常，缺的自始至終只是前端渲染；本 Story 之所以將其納入驗收範圍，是因為文字運算子（`LIKE '%關鍵字%'` 全表掃描）會顯著提高逐名單估算逾時的觸發機率，讓這個既有缺口從「偶發」變成「常見」，值得藉本 Story 一併收斂，而非本 Story 的實作引入了新問題

### AC-12：月名單分派實際執行、Stage 0 試算、名單命中預估三處行為須一致

- **Given** 同一份草稿名單使用相同的文字運算子條件（例如「主約專案名稱 包含 勁便利」）
- **When** 分別經由（a）Stage 0 每日分派數量估算、（b）建立草稿頁「預估命中筆數」、（c）月名單分派實際執行 Stage 1 三個路徑計算
- **Then** 三處對「哪些案件符合此條件」之判定邏輯須一致（沿用既有 BR-10 一致性要求），不得出現「估算顯示有 N 筆、但實際執行結果為 0 筆」或反之的落差
- **And** 若（b）名單命中預估因採抽樣估算機制（US-176）而本質上為估算值、非精確值，此為既有機制之已知特性，非本 AC 要求三處數字逐筆相等，但**篩選邏輯本身**（哪些案件算符合，含 AC-3 之 NULL 分流規則）須一致，不得三處各自解讀關鍵字比對規則或 NULL 處理方式

### AC-13：名單詳情 / 名單定義列表正確呈現文字條件

- **Given** 某名單之篩選條件中含有文字運算子條件
- **When** 使用者於名單詳情 Drawer、或名單定義列表中查看此條件
- **Then** 畫面須清楚呈現「欄位名稱 + 運算子（包含 / 不包含 / 完全等於）+ 關鍵字」，例如「主約專案名稱 包含「勁便利」」
- **And** **不得**顯示為空白、或誤植為 `IN []`（空清單樣式），此類顯示會讓業務主管誤以為條件遺失或設定失敗
- **And**（範圍澄清）本 AC 僅涵蓋「名單詳情 Drawer」與「名單定義列表」兩處**即時讀取** `condition_payload` 的顯示端；**不含**歷史執行快照條件顯示——月跑快照從未記錄過名單的篩選條件，此為既有缺口而非本 Story 應涵蓋之顯示端，詳見「不含範圍」段落

### AC-14：重複名單判定須能區分不同運算子語意

- **Given** 兩份名單條件僅運算子不同，例如「主約專案名稱 包含 勁便利」與「主約專案名稱 不包含 勁便利」
- **When** 系統執行既有 `LIST_NO_DUPLICATE`「完整條件集相等 + card_type」重複判定
- **Then** 這兩份名單**必須**被判定為不同名單（不觸發 422 重複錯誤），因為兩者篩選出的案件集合截然不同（甚至互斥）
- **And** 此要求適用於任意兩種運算子的組合（`IN` vs `包含`、`包含` vs `不包含`、`包含` vs `完全等於` 等皆須視為不同條件）；確切正規化簽章之技術做法由 system-architect / spec-writer 決定，但本 AC 之業務行為結果不可退讓

### AC-15：舊資料無 operator 一律視為 `in`，向後相容不受影響

- **Given** 系統中既有名單之篩選條件（本 Story 上線前建立）並未記錄任何運算子資訊
- **When** 系統讀取、顯示、或於重複判定 / Stage 1 執行中處理這些既有條件
- **Then** 一律視為 `in`（現況行為），不需資料遷移，不改變既有名單的篩選結果或顯示方式
- **And** 既有名單之編輯、複製（US-181 從上月複製）、快照回溯等既有流程皆不受本 Story 影響

### AC-16：建立名單草稿與編輯名單草稿兩進入點行為一致

- **Given** 部長或 Admin 分別於「建立草稿名單」與「編輯既有草稿名單」兩個頁面設定類別型篩選欄位條件
- **When** 使用者於任一頁面選擇運算子並輸入關鍵字
- **Then** 兩頁面之運算子選項、互斥切換行為（AC-5）、驗證規則（AC-6 / AC-7）、特殊字元處理（AC-8）須完全一致，不得一邊支援文字運算子、另一邊仍只有 `IN` 核取清單
- **And**（範圍澄清）本一致性要求限於「篩選條件建構子元件本身」；「編輯既有草稿」頁目前尚無「預估命中筆數」即時面板（此為 US-176 已記錄之既有缺口、非本 Story 造成），本 Story 不因新增文字運算子而額外要求為編輯頁補上該面板，是否比照補上由 team lead / spec-writer 於 US-176 開放問題範疇內另行裁示（見 OQ-183-04，已裁決不納入本輪）

---

## 本 Story 不含的範圍（留給 spec / architect / UI-UX / TDD）

- 文字比對之後端實作方式（SQL `LIKE` escape 特殊字元之確切技術手段、MSSQL collation 細節確認）由 system-architect 決定
- 重複名單判定正規化簽章如何納入運算子（例如簽章字串格式、是否需要調整 `normalizeConditionPayload` 既有邏輯）由 system-architect / spec-writer 決定，AC-14 僅定義必須達成之業務結果
- 效能提示文案、輸入框 UI 樣式、運算子選擇元件之視覺與互動細節由 ui-ux-designer 定案，並反映於更新後的 prototype（建立草稿名單 `27a-list-create-draft.html`、編輯草稿名單 `27b-list-edit-draft.html` 或等義檔案，確切檔名以現行 prototype 目錄為準）
- 建立草稿頁「預估命中筆數」面板（US-176）之逾時 / 查詢失敗錯誤呈現：**現況已滿足**，不在本 Story 重複驗收——`list-create-draft-page.tsx` 之 `catch` 區塊已 `setEstimateState('error')` 並顯示「預估暫時無法取得」+ 重試按鈕，本 Story 沿用即可，不需額外開發（Stage 0 部門估算頁之對應缺口則**不屬於**已滿足範圍，見 AC-11，須實際修正）
- `STAGE0_LIST_ESTIMATE_PARTIAL` warning 於前端之確切呈現方式（inline 於名單列 / 頁首彙總提示 / 其他樣式）由 ui-ux-designer 定案
- **歷史執行快照顯示名單篩選條件（含本 Story 之文字運算子條件）：明確 descope，建議另開票處理，不在本 Story 範圍**。背景與理由完整記錄如下，供日後回溯：
  - **既有缺口，非本 Story 造成**：月跑快照從未記錄過名單的篩選條件。已查證兩項技術現況：(1) 快照 `buildConfigPayload()`（`apps/api/src/modules/assignment/services/assignment-run-pipeline.service.ts:1801-1807`）之 `listDefinitions[]` 只寫入 `listNo` / `listNm` / `cardType` / `crEnabled` / `caseStatus`，**從未攜帶 `condition_payload`**；(2) 前端 6 個快照相關元件（`snapshot-detail-page.tsx`、`snapshot-config-view.tsx`、`snapshot-array-view.tsx`、`snapshot-input-summary.tsx`、`snapshot-pivot-view.tsx`、`snapshot-result-table.tsx`）全文 grep `conditionPayload` / `columnName` **零命中**，完全沒有任何條件渲染邏輯。這不是「顯示格式要擴充成支援文字運算子」的問題，而是「篩選條件本身從未被快照記錄過」——本 Story 上線前後，快照頁對「這份名單當初是用什麼條件跑的」這個問題本來就答不出來，不限於文字運算子。
  - **本輪 descope 理由**：(a) 名單推進到 `dept_ratio` 階段後 `condition_payload` 即唯讀鎖定，月跑執行時名單必已處於 `ready` 階段，此時「名單詳情 Drawer」即時讀取到的條件與理論上該被凍結的快照內容並無實質差異，短期內以 AC-13 涵蓋的「名單詳情 Drawer」讀取現行條件作為替代查閱路徑，業務影響有限；(b) 若要在本 Story 內一併補上快照記錄篩選條件的能力，需連帶修改 F066（快照詳情重構）spec 與 prototype 35，且涉及快照 payload schema 擴充，與本 Story 定性為「純加性、無 migration、無新端點」的範圍不符。
  - **建議另開票處理**：快照稽核完整性（快照應完整記錄名單當初的篩選條件，供事後追溯）是一個獨立、範圍更大的議題，建議另立 Story 由 spec-writer / system-architect 評估是否納入 F066 後續版本，不應在 US-183 這種功能加性 Story 中順帶擴大範圍。
- 是否將既有抽樣估算機制（US-176／AD-E07-45）之基礎架構延伸套用於文字運算子之「命中預估」路徑，由 system-architect 評估是否值得後續投入（見 OQ-183-02，屬效能優化層次，非必要修正）
- 數值型（numeric）、日期型（date）篩選欄位是否也需要類似的運算子擴充，不在本輪範圍
- 「編輯既有草稿」頁補齊「預估命中筆數」即時面板（US-176 既有開放問題），不在本 Story 範圍內一併處理（見 OQ-183-04，已裁決不納入本輪）

---

## 測試案例

### TC-183-01：條件列顯示四種運算子選項，預設為 IN

- **Given**：部長新增一列類別型篩選欄位條件
- **When**：檢視該條件列之比對方式選項
- **Then**：顯示 `IN` / 包含 / 不包含 / 完全等於 四種選項，`IN` 為預設選中狀態，行為與現況相同

### TC-183-02：選擇「包含」並輸入關鍵字 → 僅回傳包含該關鍵字之案件，NULL 值排除

- **Given**：主約專案名稱欄位中，部分案件值含「勁便利」、部分不含、部分為 NULL
- **When**：條件設為「主約專案名稱 包含 勁便利」並套用
- **Then**：僅值含「勁便利」之案件符合，NULL 值案件不符合

### TC-183-03：選擇「不包含」並輸入關鍵字 → NULL 值處理依來源分流

- **情境 (a) `ob_pool_data` 來源（如主約專案名稱）**
  - **Given**：主約專案名稱欄位中，部分案件值含「勁便利」、部分不含、部分為 NULL
  - **When**：條件設為「主約專案名稱 不包含 勁便利」並套用
  - **Then**：值不含「勁便利」之案件與值為 NULL 之案件皆符合；值含「勁便利」之案件不符合
- **情境 (b) `customer_core` 來源（如職業別）**
  - **Given**：案件關聯之客戶職業別欄位中，部分值含「勁便利」、部分不含、部分為 NULL（含查無對應客戶）
  - **When**：條件設為「職業別 不包含 勁便利」並套用
  - **Then**：僅值不含「勁便利」且**非 NULL** 之案件符合；值為 NULL（含查無對應客戶）之案件**不符合**（與情境 (a) 刻意不同，用以驗證 `I-CC-NULL-EXCLUDE-01` 未被本 Story 破壞）

### TC-183-04：選擇「完全等於」→ 僅逐字元完全相同之案件符合

- **Given**：主約專案名稱欄位中有值為「勁便利」、「勁便利專案」、「勁便利A」等相近但不完全相同的值
- **When**：條件設為「主約專案名稱 完全等於 勁便利」並套用
- **Then**：僅值恰為「勁便利」（無其他字元）之案件符合，其餘不符合

### TC-183-05：切換運算子時舊輸入被清除，介面互斥顯示

- **Given**：某條件列已選 `IN` 並勾選 3 個值
- **When**：使用者將運算子切換為「包含」
- **Then**：核取清單隱藏，改顯示空白文字輸入框，原勾選之 3 個值不隨表單送出

### TC-183-06：關鍵字為空白或純空白字元 → 阻擋儲存並顯示驗證錯誤

- **Given**：某條件列選擇「包含」，關鍵字輸入框留空或僅輸入空白字元
- **When**：使用者嘗試儲存
- **Then**：儲存被阻擋，顯示驗證錯誤訊息，提示需輸入非空白關鍵字

### TC-183-07：關鍵字含 `%` `_` `[` 等特殊字元 → 視為字面值比對，不當萬用字元

- **Given**：某案件主約專案名稱值恰為「50%達成率」，其餘案件值不含此字串
- **When**：條件設為「主約專案名稱 包含 50%達成率」並套用
- **Then**：僅該筆值恰為「50%達成率」的案件符合，不會有其他不相關案件因 `%` 被誤判為萬用字元而意外命中

### TC-183-08：customer_core 來源類別型欄位（如職業別）支援文字運算子

- **Given**：白名單中「職業別」欄位（`data_source = customer_core`）
- **When**：使用者對此欄位設定「包含」運算子與關鍵字
- **Then**：系統正確套用文字比對條件於 `customer_core` 來源，行為與 `ob_pool_data` 來源欄位一致

### TC-183-09：customer_financial 來源類別型欄位（如有無保人）支援文字運算子

- **Given**：白名單中「有無保人」欄位（`data_source = customer_financial`）
- **When**：使用者對此欄位設定文字運算子與關鍵字
- **Then**：系統正確套用文字比對條件於 `customer_financial` 來源，行為與其他兩來源一致

### TC-183-10：選用文字運算子顯示效能提示

- **Given**：某條件列運算子切換為「不包含」
- **When**：檢視該條件列
- **Then**：顯示「模糊比對較耗時，預估可能逾時」（或等義）提示文字，且不阻擋後續操作

### TC-183-11：Stage 0 部門估算頁渲染 `STAGE0_LIST_ESTIMATE_PARTIAL` warning

- **Given**：某張名單（篩選條件含文字運算子）於 Stage 0 部門維度估算之個別名單估算查詢逾時，後端已產生 `STAGE0_LIST_ESTIMATE_PARTIAL` warning
- **When**：使用者檢視 Stage 0 部門估算頁
- **Then**：畫面顯示該 warning 對應之提示（例如「名單 OB202608003 估算逾時，已從本次合計排除」），使用者不會誤以為合計數字已含全部名單

### TC-183-12：三處篩選路徑（Stage 0 試算 / 命中預估 / 月名單分派執行）邏輯一致

- **Given**：同一份草稿名單使用「主約專案名稱 包含 勁便利」條件
- **When**：分別經由三個路徑計算是否符合某已知案件
- **Then**：三處對該案件「是否符合」之判定結果一致

### TC-183-13：名單詳情頁 / 名單定義列表正確顯示文字條件，非空白或 IN []

- **Given**：某名單條件為「主約專案名稱 不包含 勁便利」
- **When**：於名單詳情 Drawer / 名單定義列表查看此名單
- **Then**：畫面顯示可辨識之「主約專案名稱 不包含「勁便利」」等文字，不顯示空白或 `IN []`

### TC-183-14：運算子不同之名單不觸發重複判定 422

- **Given**：名單 A 條件為「主約專案名稱 包含 勁便利」，名單 B 條件為「主約專案名稱 不包含 勁便利」，其餘條件與 card_type 完全相同
- **When**：使用者建立名單 B（名單 A 已存在）
- **Then**：儲存成功，不觸發 `422 LIST_NO_DUPLICATE`

### TC-183-15：舊名單（無 operator）讀取與顯示不受影響

- **Given**：本 Story 上線前已建立、條件中無運算子欄位之既有名單
- **When**：讀取、顯示、或用於重複判定
- **Then**：一律視為 `in`，顯示與判定結果與上線前完全相同

### TC-183-16：建立草稿與編輯草稿兩頁面運算子功能一致

- **Given**：同一個類別型欄位分別於「建立草稿名單」頁與「編輯草稿名單」頁設定條件
- **When**：於兩頁面各自選擇文字運算子並輸入相同關鍵字
- **Then**：兩頁面之運算子選項、驗證規則、切換行為完全一致

---

## 依賴關係

- **Blocked By**：
  - US-102（F075，POOLDATA 篩選欄位白名單，`field_type = categorical` 之欄位分類基礎）
  - US-121（F050 v2.1，whitelist-driven `condition_payload` 驗證規則，本 Story 之運算子概念須擴充其 schema）
  - US-106（草稿階段建立名單與篩選條件，本 Story 之建立草稿進入點宿主流程）
  - US-172（F109，`customer_core` / `customer_financial` 來源類別型欄位之基礎，AC-9 涵蓋對象，其 `I-CC-NULL-EXCLUDE-01` / `I-CF-NULL-EXCLUDE-01` 不變式為 AC-3 分流規則之依據）
- **Blocks**：無已知下游 Story
- **相關 Stories**：
  - US-181（F118，`LIST_NO_DUPLICATE` 正規化比對機制 `normalizeConditionPayload`，AC-14 之技術落點）
  - US-178（F112，distinct 值自動建議，與本 Story 之 `IN` 運算子並存，非取代關係）
  - US-176（F050 v2.4，草稿頁「預估命中筆數」抽樣估算面板，AC-12 一致性要求之對照路徑；亦記錄「編輯草稿頁尚無此面板」之既有缺口，見 AC-16 範圍澄清）
  - US-071（F049，Stage 0 每日分派數量估算／部門估算頁，AC-11「`STAGE0_LIST_ESTIMATE_PARTIAL` warning 須可見」之直接修正對象，亦為 AC-12 三處一致性要求之路徑之一）

---

## 待解決問題

| ID | 問題 | 負責方 | 狀態 |
|----|------|--------|------|
| OQ-183-01 | AC-10 效能提示之確切文案與顯示位置（緊鄰運算子選單 / 輸入框下方 tooltip / 其他）由 ui-ux-designer 定案，並反映於更新後的 prototype | ui-ux-designer | 待確認 |
| OQ-183-02 | 是否將既有抽樣估算基礎架構（US-176／AD-E07-45）延伸套用於文字運算子之「命中預估」路徑，以補強業務主管已拍板之「UI 提示 + 沿用既有逾時機制」簡化方案，屬效能優化層次之後續評估，非本 Story 阻塞項 | system-architect | 待確認（非阻塞） |
| OQ-183-03 | AC-11 要求把既有 `STAGE0_LIST_ESTIMATE_PARTIAL` warning 於 Stage 0 部門估算頁渲染出來，此 warning 不分觸發原因（文字運算子 / 既有數值 / `IN` 條件皆可能觸發逾時）。修正範圍究竟限於「本 Story 新增文字運算子觸發之情境」、或藉此機會一併涵蓋「既有數值 / IN 條件觸發之相同情境」（因同一 warning code、同一渲染邏輯，技術上難以只挑文字運算子觸發的個案渲染），由 system-architect 評估修正範圍與工作量並定案 | system-architect | 待確認（v1.1 曾誤判關閉，team lead 複核後撤回並重新定義，見 change-summary） |
| OQ-183-04 | 「編輯既有草稿」頁是否比照 US-176 補上「預估命中筆數」即時面板 | team lead | **已裁決：不納入本輪範圍**。維持 US-176 既有 deferred 決定，AC-15 已明確排除；此為延續既有缺口，非本 Story 造成 |

---

## Definition of Done

- [ ] 驗收標準全部通過（AC-1 ~ AC-16）
- [ ] 三種文字運算子（包含 / 不包含 / 完全等於）之篩選語意驗證通過，含 NULL 值依來源分流之業務裁定（TC-183-02 ~ 04，TC-183-03 涵蓋 ob_pool_data / customer_core 兩情境）
- [ ] 特殊字元字面值比對驗證通過（TC-183-07）
- [ ] 三個資料來源（ob_pool_data / customer_core / customer_financial）皆支援驗證通過（TC-183-08、09）
- [ ] `I-CC-NULL-EXCLUDE-01` / `I-CF-NULL-EXCLUDE-01` 不變式未被本 Story 破壞，驗證通過（TC-183-03 情境 (b)）
- [ ] Stage 0 部門估算頁正確渲染 `STAGE0_LIST_ESTIMATE_PARTIAL` warning，驗證通過（TC-183-11）
- [ ] 三處篩選路徑（Stage 0 試算 / 命中預估 / 月名單分派執行）邏輯一致性驗證通過（TC-183-12）
- [ ] 名單詳情 / 列表條件顯示正確驗證通過（TC-183-13）
- [ ] 重複名單判定可區分運算子語意驗證通過（TC-183-14）
- [ ] 舊名單（無 operator）向後相容驗證通過（TC-183-15）
- [ ] 建立草稿與編輯草稿兩進入點一致性驗證通過（TC-183-16）
- [ ] prototype（建立草稿名單 / 編輯草稿名單頁）已由 ui-ux-designer 更新並與最終行為一致
- [ ] 後端測試同時涵蓋 SQLite unit 與 MSSQL spec 兩軌
- [ ] 單元測試覆蓋率 ≥ 80%
- [ ] Code review 通過
- [ ] 文件已更新（含對應 spec，建議編號 F119）

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **相關 Stories**：US-102（F075 篩選欄位白名單）、US-106（草稿建立名單，建立進入點宿主）、US-121（whitelist-driven condition_payload）、US-172（F109 customer_core / customer_financial 來源欄位）、US-176（F050 v2.4 命中預估抽樣估算）、US-178（F112 distinct 值自動建議）、US-181（F118 重複名單語意等價判定）
- **相關程式碼（現況調查依據，供 spec-writer 參考，非規格本身）**：
  - `apps/api/src/modules/assignment-list/dto/condition-item.dto.ts`（`ConditionItemDto` categorical 現況僅 `values: string[]`）
  - `apps/api/src/modules/assignment/stage1/stage1-query-composer.ts`（`buildCategoricalFragment()` 現況固定產生 `IN` fragment）
  - `apps/api/src/modules/assignment/stage1/stage1-customer-core-clause.ts:13-16`（`I-CC-NULL-EXCLUDE-01` 不變式，AC-3 分流規則依據）
  - `apps/api/src/modules/assignment/stage1/stage1-customer-financial-clause.ts:14-15`（`I-CF-NULL-EXCLUDE-01` 不變式，AC-3 分流規則依據）
  - `apps/api/src/modules/assignment/stage1/special-rules.ts`、`apps/api/src/modules/assignment/stage1/scoring-decode.constants.ts`（legacy `spec_name LIKE` 業務先例：白牌 / 小資 / 借新還舊）
  - `apps/web/src/pages/assignment/list-create-draft-page.tsx`（`CategoricalValuesPicker` 現況核取清單元件；命中預估面板現況已具備逾時/失敗錯誤呈現，見已拍板決策第 5 項 (b)）
  - `apps/web/src/pages/assignment/list-edit-draft-page.tsx`（編輯草稿進入點）
  - `apps/web/src/pages/assignment/stage0-estimate-page.tsx`（F049 v2.0 Stage 0 部門估算頁；scope/calendar/pool/headcount 四類 warning 已渲染，但 `STAGE0_LIST_ESTIMATE_PARTIAL` 未渲染，AC-11 待補之缺口）
  - `apps/api/src/modules/assignment-list/stage0-estimate.service.ts:557-570`（`STAGE0_LIST_ESTIMATE_PARTIAL` warning 產生邏輯，AC-11 依據）
  - `apps/api/src/common/errors/error-codes.ts:113,273`（`STAGE0_ESTIMATE_TIMEOUT` 專屬錯誤碼與訊息，已拍板決策第 5 項 (b) 依據）
  - `apps/api/src/modules/assignment-list/assignment-list.service.ts`（`normalizeConditionPayload`，AC-14 對照現況邏輯）
  - `apps/api/src/database/seeds/data/pooldata-field-whitelist.json`（三來源類別型欄位現況清單，AC-9 對照依據）
- **對應 Spec**：尚未建立，建議編號 **F119**（spec-index 現有最高編號為 F118），由 spec-writer 建立
