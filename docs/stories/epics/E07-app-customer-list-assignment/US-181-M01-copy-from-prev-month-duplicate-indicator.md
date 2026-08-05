---
last-updated: 2026-08-04
version: v1.1
change-summary: "v1.1 (2026-08-04 人工審閱閘)：狀態 DRAFT → Approved。OQ-181-01 裁決＝(b) 語意等價；OQ-181-05＝接受「編輯條件後不再標記」；OQ-181-06＝以實作為準修正 F050/data-model/US-106；OQ-181-03＝不做導航，目標編號為純文字。可測契約以 F118 v1.1 為準（含新增 AC-11）。 | v1.0-draft 初版（DRAFT，待人工審閱）：從上月複製名單 Modal 增加『已複製過』視覺提示，避免使用者重複複製造成內容相同的名單。判定來源機制（血緣 / 語意等價 / audit log 反查）三案並陳，不在本 Story 拍板，列為核心待確認事項。同時記錄一項調查發現：US-106 AC-10 描述之複製行為（僅複製篩選條件）與現行 copy-from-prev-month-modal.tsx 實際行為（同時複製名稱/卡別/CR/期間）已產生落差，列為待處理項目。建議對應 spec 編號：F118。"
---

# US-181：從上月複製名單顯示「已複製過」提示（F118）

> **Story ID**：US-181
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M01 名單定義（草稿階段「從上月複製」子流程）
> **優先級**：Should Have
> **階段**：Phase 2（Advanced，既有 Phase 1 功能之 UX 精煉）
> **預估點數**：8
> **狀態**：✅ Approved（2026-08-04 人工審閱閘）— 可進入 TDD
>
> **裁決摘要**：OQ-181-01（判定機制）＝**(b) 語意等價**，重用 `findActiveConditionDuplicate`。
> OQ-181-05＝**接受**「複製後編輯條件即不再標記」之語意（標記＝「原樣儲存會被 422 擋下」）。
> OQ-181-06（複製範圍落差）＝**以現行實作為準修正 spec**，[F050 AC-5](../../../specs/features/F050-create-list-definition.md) /
> [data-model.md](../../../specs/data-model.md) / [US-106 AC-10](US-106-M01-draft-create-list-with-filter.md) 已同輪修正。
> OQ-181-03（導向目標名單）＝**不做導航**，目標編號為純文字（避免離開表單丟失已填內容）。
> 可測契約以 [F118 v1.1](../../../specs/features/F118-copy-from-prev-month-duplicate-indicator.md) 為準（含新增之 AC-11）。

---

## User Story

**As a** 部長（Director）或 Admin，在建立草稿名單時使用「從上月複製」功能
**I want** 在複製 Modal 中看到哪些上月名單已經被複製過（複製到本月的哪個名單編號）
**So that** 我不會因為忘記自己上次已經複製過而重複建立內容相同的名單，浪費 LIST_NO 額度、造成部門比例／人員比例重複設定的困擾；同時當我確實需要以同一份上月名單為基礎建立條件不同的衍生名單時，也能清楚知道自己正在做的是有意識的操作，而非誤觸

---

## 背景說明

現行「從上月複製名單」功能（`apps/web/src/pages/assignment/_components/copy-from-prev-month-modal.tsx`，路徑：客戶名單分派 > 名單定義 > 建立草稿名單 > 從上月複製）列出上月 `status = 'active'` 且 `conditionPayload != null` 的名單，每列一顆「使用此名單」按鈕；點選後將該名單欄位帶入新名單建立表單，使用者可再修改後儲存。

**關鍵限制**：`copyFromListNo` 目前只會被寫進 `assignment_audit_log.after_value`（見 `assignment-list.service.ts` `createList` step 7），`ob_list_definition` 資料表本身**並無**任何欄位記錄「這份名單是複製自哪一份上月名單」。也就是說，目前系統事實上**沒有**任何機制可以回答「這份上月名單，本月是不是已經有人複製過了」。

本 Story 要在複製 Modal 中，以 UI 提示哪些上月名單「已經複製過」，避免使用者重複複製。

**背景調查發現：既有 spec 與現行實作行為已有落差（供 spec-writer 參考，建議一併處理，非本 Story 阻塞項）**

`US-106`（草稿階段建立名單與篩選條件）AC-10 描述的「從上月名單複製」行為是：**只複製篩選條件（JSONB）**，比例資料不隨複製、預設為空，且未提及名稱／卡別／CR 開關／期間會一併複製。但現行 `copy-from-prev-month-modal.tsx` 頁尾文案明確寫著「複製後帶入**名稱、卡別、CR 開關、篩選條件與撈案期間**；名單編號於儲存時重新產生」，複製範圍明顯比 US-106 AC-10 所寫的更廣。這是一處 spec 與實作的落差，本專案過往慣例（見專案記憶 `feedback_spec_schema_gap_first.md`）為「先停下修 spec 再實作」；由於本 Story 聚焦於「已複製過提示」而非重新定義複製範圍，此落差**不在本 Story 範圍內解決**，但列為待解決問題（OQ-181-06）供 spec-writer 一併評估是否需另開 Story 修正 US-106 AC-10 之描述。

---

## 驗收標準

### AC-1：Modal 中每筆上月名單顯示是否「已複製過」之視覺提示

- **Given** 部長或 Admin 開啟「從上月複製」Modal
- **When** Modal 列出上月（`prevYm`）符合現行條件（`status = 'active'` 且 `conditionPayload != null`）的名單
- **Then** 每一筆名單旁須清楚顯示該筆名單「是否已被複製過」的視覺提示（例如徽章／標籤）
- **And** 此提示須與既有「CR 啟用／CR 停用」徽章明確可區分，不造成視覺混淆

### AC-2：已複製過判定之語意須與實際會擋下的重複規則一致

- **Given** 使用者在 Modal 中看到某筆上月名單被標示為「已複製過」或「未複製過」
- **When** 使用者依該提示決定是否要複製、並最終嘗試儲存
- **Then** 提示結果應與使用者屆時**實際會遇到的儲存端驗證行為**（`POST` 建立名單時、`AssignmentListService.findActiveConditionDuplicate` 之 `422 LIST_NO_DUPLICATE` 完整條件集相等規則）語意一致，避免「Modal 沒標示已複製、儲存卻跳重複錯誤」或「Modal 標示已複製、但儲存並不會撞重複」的不一致體驗
- **And** 此一致性要求之確切達成方式（判定機制選型）由待解決問題 OQ-181-01 決定，不在本 AC 拍板

### AC-3：已標示「已複製過」的名單仍可操作，不得完全鎖死

- **Given** 某筆上月名單被標示為「已複製過」
- **When** 使用者點擊該筆名單的「使用此名單」按鈕
- **Then** 系統仍須允許使用者繼續操作（不得直接 disable 按鈕、完全阻止使用），因為使用者可能是刻意要以此為基礎建立條件不同的衍生名單
- **And** 系統須提供讓使用者有意識確認的機制（例如二次確認或明確警示訊息），避免使用者在未察覺「這筆已複製過」的情況下無意間建立內容相同的名單；確切互動方式（Modal 二次確認彈窗 vs inline 警示文字等）由 ui-ux-designer 定案並反映於更新後的 prototype

### AC-4：已複製過提示須顯示對應之目標月名單編號

- **Given** 某筆上月名單被標示為「已複製過」
- **When** 使用者檢視該筆提示
- **Then** 提示須顯示對應之目標月（本月）名單編號（例如「已複製為 OB202608003」），而非僅顯示一個沒有資訊量的徽章
- **And** 使用者應有可行的操作路徑得以查看或前往該目標月名單（確切導覽機制、是否可點擊直接跳轉，由 ui-ux-designer / system-architect 依待解決問題 OQ-181-03 定案）

### AC-5：目標月定義須沿用既有作業月語意

- **Given** 系統判定某筆上月名單「本月是否已被複製」
- **When** 執行判定
- **Then** 「本月」之定義須採 F097 既有「作業月」語意（頁面當前 `currentYm`，即使用者於名單定義頁所選之作業月，非後端系統當月），並與既有 `computePrevYm(currentYm)` 決定 Modal 顯示之 `prevYm` 邏輯維持同一基準，不得另外引入不同的月份判斷依據

### AC-6：判定結果為即時查詢結果，不因快取而明顯過期

- **Given** 兩位管理者（或同一管理者的兩次操作）可能在相近時間內對同一份上月名單進行複製
- **When** 使用者開啟 Modal 查看「已複製過」提示
- **Then** 提示狀態應反映使用者當下開啟 Modal 時的實際查詢結果，不應出現「另一位管理者剛完成複製，但畫面仍顯示未複製」的明顯過期情形（可接受之查詢時效精確門檻由 system-architect 定義，非本 AC 逐秒要求）

### AC-7：Modal 開啟效能不因本功能顯著劣化

- **Given** Modal 開啟時列出上月可複製名單，並需額外判定每筆是否「已複製過」
- **When** 系統執行此判定
- **Then** 判定機制**不得**針對 Modal 中每一筆上月名單各自逐筆呼叫一次查詢（禁止 N+1 查詢模式），應以能一次取得全部判定結果的方式設計（例如單一彙總 API），確切端點拓樸由 system-architect 定案（OQ-181-04）

### AC-8：既有複製主流程行為不受本功能影響（回歸保護）

- **Given** 本 Story 之「已複製過」提示功能已實作
- **When** 使用者對任一筆名單（無論已複製過或未複製過）點擊「使用此名單」並完成後續建立流程
- **Then** 既有欄位帶入行為（名稱、卡別、CR 開關、篩選條件、撈案期間；LIST_NO 於儲存時重新產生）維持不變，不受本 Story 影響

### AC-9：不可複製之舊遷移名單維持現況（範圍不擴大）

- **Given** 上月存在 `conditionPayload IS NULL` 的舊遷移名單（backward-compat，US-123）
- **When** Modal 列出上月可複製名單
- **Then** 此類名單依現況本就**不會**出現在 Modal 清單中（現有前端過濾條件 `conditionPayload != null`），本 Story 不改變此既有過濾範圍，也不需要為這類本就不可複製的名單額外設計「已複製過」判定

---

## 本 Story 不含的範圍（留給 spec / architect / UI-UX / TDD）

- 「已複製過」判定的確切機制選型（血緣欄位 migration / 語意等價比對 / audit log 反查，三案取捨見 OQ-181-01）由 spec-writer / system-architect 決定
- 提示的視覺設計、二次確認互動細節、警示文案由 ui-ux-designer 定案，並反映於更新後的 `/prototypes/27a-list-create-draft.html`
- 「導向目標月名單」之確切導覽方式（頁內跳轉／另開分頁／僅顯示不可點）由 ui-ux-designer / system-architect 決定
- 判定用 API 之確切端點設計（新增獨立端點 vs 於既有 `listLists` 回應附註）由 system-architect 決定
- US-106 AC-10 與現行複製範圍實作落差之修正（是否需要、如何修正、是否另立 Story）由 spec-writer / 業務主管評估（OQ-181-06），本 Story 僅記錄發現
- 效能之精確查詢時間門檻數字由 system-architect 定義

---

## 測試案例

### TC-181-01：Modal 顯示已複製過與未複製過兩種狀態

- **Given**：上月有 3 筆可複製名單，其中 1 筆本月已被複製過（存在對應目標月名單）
- **When**：部長開啟「從上月複製」Modal
- **Then**：該 1 筆顯示「已複製過」提示，其餘 2 筆不顯示此提示

### TC-181-02：已複製過名單仍可點擊使用，並出現確認/警示機制

- **Given**：某筆上月名單已標示「已複製過」
- **When**：部長點擊該筆「使用此名單」
- **Then**：系統未直接阻擋操作，而是先呈現確認或明確警示，待使用者確認後才繼續既有複製帶入流程

### TC-181-03：已複製過提示顯示目標月名單編號

- **Given**：某筆上月名單已於本月被複製為 `OB202608003`
- **When**：部長檢視該筆之「已複製過」提示
- **Then**：提示內容包含 `OB202608003`（或等義之可辨識目標名單編號），非僅顯示一個無資訊量的徽章

### TC-181-04：判定語意與儲存時 422 重複規則一致

- **Given**：某筆上月名單依判定機制被標示為「未複製過」
- **When**：使用者依提示直接複製並儲存為新名單（未修改任何條件）
- **Then**：儲存**不應**意外撞上 `422 LIST_NO_DUPLICATE`（若撞上，代表 Modal 提示與後端重複規則不一致，屬缺陷）

### TC-181-05：Modal 開啟不產生 N+1 查詢

- **Given**：上月有 N 筆可複製名單（N 較大，例如 20+ 筆）
- **When**：Modal 開啟並載入全部名單與其「已複製過」判定
- **Then**：判定所需之額外查詢為固定次數（不隨 N 線性增加逐筆查詢）

### TC-181-06：既有複製欄位帶入行為不受影響（回歸）

- **Given**：本功能已上線
- **When**：使用者複製任一筆上月名單（無論是否已複製過）並完成建立
- **Then**：名稱、卡別、CR 開關、篩選條件、撈案期間之帶入行為與本 Story 實作前一致

### TC-181-07：舊遷移名單（condition_payload IS NULL）不受影響

- **Given**：上月存在 `condition_payload IS NULL` 的舊遷移名單
- **When**：Modal 載入上月可複製清單
- **Then**：此類名單依現況不出現於清單中，不因本 Story 產生變化

### TC-181-08：目標月語意採頁面 currentYm，非後端當月

- **Given**：使用者於名單定義頁選擇的作業月（`currentYm`）與系統實際當月不同（例如切換月份檢視情境）
- **When**：Modal 判定「已複製過」之目標月
- **Then**：判定基準為頁面 `currentYm`，與 `computePrevYm(currentYm)` 決定的 `prevYm` 一致對應，不使用後端系統當月作為判斷基準

---

## 依賴關係

- **Blocked By**：US-106（草稿階段建立名單與篩選條件，本 Story 之宿主 Modal 流程）
- **Blocks**：無已知下游 Story
- **相關 Stories**：
  - US-121（whitelist-driven `condition_payload` 驗證規則）—— 若判定機制選項 (b)「語意等價比對」被採用，其正規化比對基礎與本 Story 判定機制相關
  - US-050 / F050 v2.2「完整條件集相等 + card_type」唯一性規則（`findActiveConditionDuplicate`）—— AC-2 一致性要求之對照基準
  - US-137 / US-138（F097 作業月 `currentYm` 語意）—— AC-5 之依據

---

## 待解決問題

| ID | 問題 | 負責方 | 狀態 |
|----|------|--------|------|
| OQ-181-01 | **★核心／高風險**：「已複製過」判定來源機制，至少評估三案並給出建議：<br>(a) **血緣**：`ob_list_definition` 新增 `copy_from_list_no` 欄位（需 migration；dev MSSQL 為 migration-managed）→ 精準血緣，但複製後又改條件仍會被標記為「已複製」；<br>(b) **語意等價**：重用既有 `findActiveConditionDuplicate`（F050 v2.2「完整條件集相等 + card_type」規則）判定目標月是否已有等價名單 → 與儲存時真正會擋的 422 規則完全一致（見 AC-2），不需 migration，但複製後編輯條件即不再標記為已複製；<br>(c) **查 `assignment_audit_log` 的 `after_value` JSON 反查** → 不需 schema 變更，但為 log 反查、效能與可靠度較差。<br>何者作為基準（或組合方案）需業務主管與 system-architect 共同裁示 | 業務主管 + system-architect | 待確認（阻塞性，須先裁示才可進入實作） |
| OQ-181-02 | 提示的視覺與行為確切設計（灰底徽章仍可點 vs disable vs 二次確認彈窗 vs inline 警示）由 ui-ux-designer 定案，並更新 `/prototypes/27a-list-create-draft.html` | ui-ux-designer | 待確認 |
| OQ-181-03 | 「導向目標月名單」之確切導覽方式（是否可頁內跳轉查看該名單詳情、另開分頁、或僅顯示編號不可點）由 ui-ux-designer / system-architect 決定 | ui-ux-designer + system-architect | 待確認 |
| OQ-181-04 | 判定用 API 設計（新增獨立端點如 `GET copy-source-options`，一次彙總回傳全部判定結果；或於既有 `listLists` 回應直接加註）由 system-architect 決定，須符合 AC-7 禁止 N+1 之要求 | system-architect | 待確認 |
| OQ-181-05 | 若選定 OQ-181-01 方案 (a)（血緣），「複製後又編輯條件」是否仍視為「已複製」？若選方案 (b)（語意等價），編輯條件後即不再標記——此語意差異是否為業務可接受，需明確拍板 | 業務主管 | 待確認（依 OQ-181-01 結果而定） |
| OQ-181-06 | （調查發現，非本 Story 阻塞項）US-106 AC-10 描述之複製行為（僅複製篩選條件、比例不複製）與現行 `copy-from-prev-month-modal.tsx` 實際行為（另同時複製名稱／卡別／CR 開關／期間）已有落差，是否需修正 US-106 spec 描述或另立 Story 處理，請 spec-writer 評估 | spec-writer | 待確認（非阻塞，建議儘快處理以避免 spec 持續與實作脫節） |

---

## Definition of Done

- [ ] 驗收標準全部通過（AC-1 ~ AC-9）
- [ ] OQ-181-01（判定機制選型）已由業務主管 + system-architect 裁示並落入正式 spec
- [ ] 判定語意與儲存端 422 規則一致性驗證通過（TC-181-04）
- [ ] N+1 查詢防範驗證通過（TC-181-05）
- [ ] 既有複製欄位帶入行為回歸測試通過（TC-181-06）
- [ ] 舊遷移名單不受影響回歸測試通過（TC-181-07）
- [ ] 目標月語意（`currentYm` 而非後端當月）驗證通過（TC-181-08）
- [ ] prototype `27a-list-create-draft.html` 已由 ui-ux-designer 更新並與最終行為一致
- [ ] 後端測試同時涵蓋 SQLite unit 與 MSSQL spec 兩軌
- [ ] 單元測試覆蓋率 ≥ 80%
- [ ] Code review 通過
- [ ] 文件已更新（含對應 spec，建議編號 F118；OQ-181-06 之 US-106 落差是否一併處理，由 spec-writer 決定）

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **相關 Stories**：US-106（草稿階段建立名單，複製主流程宿主）、US-121（whitelist condition_payload）、US-137 / US-138（F097 作業月語意）
- **相關程式碼（現況調查依據，供 spec-writer 參考，非規格本身）**：
  - `apps/web/src/pages/assignment/_components/copy-from-prev-month-modal.tsx`
  - `apps/web/src/pages/assignment/list-create-draft-page.tsx`（`listLists({ ym: prevYm })` 現行載入方式）
  - `apps/api/src/modules/assignment-list/assignment-list.service.ts`（`createList` step 3/7 `copyFromListNo` 現行僅寫入 audit log；`findActiveConditionDuplicate` F050 v2.2 唯一性規則）
- **對應 Spec**：尚未建立，建議編號 **F118**（依請求方指定；spec-index 現有最高編號為 F116），由 spec-writer 建立
