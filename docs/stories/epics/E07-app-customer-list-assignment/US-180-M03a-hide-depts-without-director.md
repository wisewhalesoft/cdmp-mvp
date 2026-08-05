---
last-updated: 2026-08-04
version: v1.1
change-summary: "v1.1 (2026-08-04 人工審閱閘)：狀態 DRAFT → Approved。OQ-180-02 裁決＝孤兒部門顯示鎖定＋後端保留、不做強制歸零（出場機制沿用 F081 退回草稿）；OQ-180-01＝API 層 flag；OQ-180-03＝要資訊列；OQ-180-04＝技術上 no-op。AC-1/AC-5 之字面已於 F117 §12.1 裁決偏離，可測契約以 F117 v1.1 為準。 | v1.0-draft 初版（DRAFT，待人工審閱）：部門比例設定頁（F079/US-109）僅顯示『目前有在職處長』的部門，隱藏無處長之在職部門，避免部長誤將比例配置給無人負責跟進的部門。核心高風險項（既存非零比例部門現查無處長時的儲存行為）與判定過濾層級（API vs 前端）列為待確認，不在本 Story 拍板。建議對應 spec 編號：F117。"
---

# US-180：部門比例設定頁僅顯示「有處長」之部門（F117）

> **Story ID**：US-180
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M03a 部門比例設定階段
> **優先級**：Should Have
> **階段**：Phase 2（Advanced，既有 Phase 1 功能 F079 之 UX 精煉）
> **預估點數**：5
> **狀態**：✅ Approved（2026-08-04 人工審閱閘）— 可進入 TDD
>
> **裁決摘要**：OQ-180-02（既存非零比例但無處長）＝**孤兒部門顯示但鎖定 ＋ 後端強制保留**，
> **不**提供「強制歸零」按鈕（出場機制沿用既有 F081「退回草稿」）。
> OQ-180-01（過濾層級）＝**API 層 query flag** `requireDirector`。
> OQ-180-03（已隱藏透明度資訊列）＝**要**。OQ-180-04（準備完成摘要）＝技術上為 no-op，不需套用。
> ⚠️ 本 Story 之 AC-1 / AC-5 字面已於 spec 階段被**裁決偏離**（三分類、加總範圍改為最終持久化集合）：
> 可測契約以 [F117 v1.1 §12.1](../../../specs/features/F117-dept-ratio-director-required-filter.md) 為準。

---

## User Story

**As a** 部長（Director）或 Admin
**I want** 在「部門比例設定」頁面只看到目前有在職處長的部門，不看到無處長部門
**So that** 我不會誤將分派比例配置給目前無人負責跟進的部門，也不會被畫面上一排「—」（無處長）搞混，誤以為是資料異常

---

## 背景說明

現行 F079（US-109）部門比例設定頁（`GET /api/v1/assignment/ratios/dept/{listNo}`，`DeptRatioService.getDeptRatios`）回傳「`ob_emphire` 在職部門」∪「`ob_dept_pct` 既有紀錄」的聯集；每一列已包含 `directorName`（依 `jfun_nm='處長'` 且在職判定、同部門取最早入職者），查無處長時 `directorName` 為 `null`，前端 `dept-ratio-form.tsx` 目前將其渲染為「—」。

業務需求：部門比例設定頁應**只提供有抓到處長的部門進行設定**，無處長的在職部門應被隱藏，不出現在可設定清單中。理由：一個沒有處長的部門，即使被分配了案件比例，也沒有人在流程上對應負責後續的個別業務比例設定（M03b 階段由「該部門處長」設定業務員比例），會造成流程卡住或案件事實上無人跟進。

**重要事實澄清（本次調查發現，供 spec-writer / system-architect 參考，避免依錯誤前提設計）**：

原始需求提出時假設「`getDeptRatios` 亦被名單快照 Detail Drawer 使用」。經檢視程式碼，此假設**不完全成立**：

- **『設定頁』**（`dept-ratio-form.tsx`）與**『準備完成摘要』**（`ready-summary-detail-page.tsx`，呼叫時帶 `excludeZeroRatio: true`）— 兩者**確實**共用同一支 `DeptRatioService.getDeptRatios`（同一個 `GET /assignment/ratios/dept/{listNo}` 端點），因此**都帶有 `directorName` 欄位**，理論上都會受過濾邏輯影響（若過濾實作在這支 service／端點上）。
- **『名單快照 Detail Drawer』**（`ListDetailDrawer.tsx` → `getFullSnapshot` → `assignment-list.controller.ts` 的 `GET :listNo/full-snapshot` → `AssignmentListService.getFullSnapshot`）走的是**完全獨立的另一支查詢**（直接 `deptPctRepo.find()`），其回傳型別 `SnapshotDeptRatio` **本來就沒有 `directorName` 欄位**，與處長判定無關。故本 Story 的過濾**不會**、也**不需要**觸及 Detail Drawer；若過濾實作於 `DeptRatioService.getDeptRatios` 本身（API 層），天然只影響「設定頁」與「準備完成摘要」這兩個消費端，不影響 Detail Drawer。

因此「影響面界定」的實際待決問題，收斂為：**過濾是否也要套用到『準備完成摘要』**（見待解決問題 OQ-180-04），而非原先設想的三方（含 Detail Drawer）。

---

## 驗收標準

### AC-1：設定頁只顯示有在職處長的部門

- **Given** 部長或 Admin 進入某份名單的「部門比例設定」頁
- **When** 頁面載入部門清單
- **Then** 清單中只包含「目前有在職處長」的在職部門
- **And** 無在職處長的在職部門**不出現**於可設定清單中

### AC-2：處長之在職判定沿用既有全系統一致語意

- **Given** 系統判定某部門是否「有在職處長」
- **When** 執行判定邏輯
- **Then** 「在職」之定義須與既有 `emphire-active.util`（`resign_date` 為 `NULL` 或 `>=` 系統日，哨兵 `9999-12-31`）完全一致
- **And** 不得另外為本頁面新增一套不同的在職認定邏輯（避免同一時間點對「誰在職」在不同頁面出現不同答案）

### AC-3（★核心／高風險）：既存非零比例、但目前查無處長之部門，不得因本次過濾而被靜默清除

- **Given** 某部門先前已在 `ob_dept_pct` 存有非零 RATION（例如過去有處長、後來處長離職或調動）
- **And** 目前依 AC-2 判定該部門查無在職處長
- **When** 部長或 Admin 開啟設定頁（該部門依 AC-1 被隱藏）並執行「儲存」
- **Then** 系統**不得**在使用者未被明確告知、未明確確認的情況下，因為本次儲存而靜默刪除該部門既有的非零比例設定
- **And** 系統必須提供使用者可感知、可理解的方式，得知「有一個先前已設定比例的部門，現在因無處長而未顯示在清單中」，讓使用者能有意識地決定後續處理（例如：先處理該部門的比例歸零、或該部門的處長派任問題）
- **And** 精確的呈現與互動方式（例如：仍顯示但鎖定編輯並標示「無處長」／顯示警示 banner 要求使用者先處理／由後端保留未出現在儲存 payload 中的既有列）**不在本 Story 拍板**，列為待解決問題 OQ-180-02，需業務主管與 system-architect 共同裁示
- **補充說明（風險成因）**：現行 `PUT /assignment/ratios/dept/{listNo}` 為「先刪除全部既有列、再依畫面上的 rows 全部覆寫寫入」；若前端單純把無處長部門從 `rows` 中拿掉即送出，等同靜默刪除。本 AC 是「無論最終選哪個處理方案，都必須成立」的不變式，具體方案由 OQ-180-02 決定

### AC-4：全部在職部門皆無處長時的明確空狀態

- **Given** 目前所有在職部門經 AC-1 過濾後，可設定部門數為 0（即全部在職部門皆查無在職處長）
- **When** 部長或 Admin 進入設定頁
- **Then** 頁面顯示明確的空狀態文案，清楚說明「目前沒有任何部門有在職處長可供設定比例」（現有空狀態文案「目前無在職部門可設定」需配合本情境改寫，避免使用者誤以為是 `ob_emphire` 資料同步異常）
- **And** 此空狀態下，使用者無法推進至下一階段（個別業務比例設定），並有明確說明為何無法推進

### AC-5：過濾不影響既有加總 100% 之驗證邏輯範圍

- **Given** 設定頁已依 AC-1 過濾為只顯示有處長之部門
- **When** 部長或 Admin 設定各部門 RATION 並檢視加總
- **Then** 加總 100% 的檢核範圍僅涵蓋畫面上實際顯示（有處長）的部門
- **And** 此行為變化（加總語意隨受過濾部門而改變）須讓使用者可理解，不可造成「畫面看到的部門加總 100%，但實際儲存後系統認定的總比例不是 100%」之落差（呼應 AC-3 之既存比例保留策略）

### AC-6：處長角色於設定頁之既有唯讀限制不受影響

- **Given** 帳號角色為「處長」（section_chief）
- **When** 嘗試存取部門比例設定頁
- **Then** 沿用既有限制（無操作權限、不顯示設定入口，見 US-101 AC-5），不因本 Story 產生變化

### AC-7：本 Story 變更範圍界定於「設定頁」情境

- **Given** 本 Story 之過濾邏輯已實作
- **When** 使用者存取「準備完成摘要」頁或「名單快照 Detail Drawer」
- **Then** 兩者於本 Story 實作前後的部門比例呈現結果須一致（回歸基準），**除非**待解決問題 OQ-180-04 明確裁示「準備完成摘要」也要套用同一過濾（Detail Drawer 因技術上為獨立查詢、無 `directorName`欄位，本來就不受影響，見背景說明）

---

## 本 Story 不含的範圍（留給 spec / architect / UI-UX / TDD）

- 過濾邏輯之確切分層（API 層新增 query flag，比照既有 `excludeZeroRatio` 模式；或前端層過濾）由 spec-writer / system-architect 決定（OQ-180-01）
- AC-3 高風險情境之確切 UX／後端處理方案由業務主管與 system-architect 共同裁示（OQ-180-02）
- 是否顯示「已隱藏 N 個無處長部門」資訊列、其文案與觸發條件（OQ-180-03）
- 「準備完成摘要」是否亦套用本過濾（OQ-180-04）
- 空狀態文案的確切措辭、UI 排版、圖示由 ui-ux-designer 定案
- prototype `/prototypes/29a-dept-ratio-config.html` 之更新（現況示範資料已有「未設代理」紅點指示但**未隱藏該列**，與本 Story 需求不同，需 ui-ux-designer 產出更新版本）
- 後端 API query flag 命名、entity/欄位層級的實作細節
- 測試層級的具體斷言（SQLite unit／MSSQL spec 兩軌之測試資料設計）

---

## 測試案例

### TC-180-01：有處長之在職部門正常顯示

- **Given**：4 個在職部門皆有在職處長
- **When**：部長開啟設定頁
- **Then**：4 個部門全數顯示，可個別設定 RATION

### TC-180-02：無處長之在職部門被隱藏

- **Given**：5 個在職部門中有 1 個目前查無在職處長
- **When**：部長開啟設定頁
- **Then**：清單僅顯示 4 個有處長之部門，該 1 個無處長部門不出現

### TC-180-03：離職視同不列入處長判定（沿用既有在職語意）

- **Given**：某部門原處長已離職（`resign_date` 早於系統日，非哨兵值），部門無其他 `jfun_nm='處長'` 的在職員工
- **When**：系統判定該部門是否有在職處長
- **Then**：判定為「無在職處長」，該部門不顯示於設定頁清單

### TC-180-04（★高風險情境）：既存非零比例部門查無處長時，儲存不得靜默清空

- **Given**：某部門 `ob_dept_pct` 已有既存非零 RATION（例如 20%），且該部門目前查無在職處長（因此依 AC-1 不顯示於畫面）
- **When**：部長在設定頁（看不到該部門）調整其他部門比例並執行「儲存」
- **Then**：系統行為須符合 AC-3 定義之不變式（不得未經明確告知/確認即刪除該部門既有比例）；具體驗證方式待 OQ-180-02 裁定後由 spec-writer / test-designer 補完精確斷言

### TC-180-05：全部在職部門皆無處長 → 空狀態且無法推進

- **Given**：所有在職部門經處長判定後皆為「無在職處長」
- **When**：部長開啟設定頁
- **Then**：顯示明確空狀態文案，且無法推進至個別業務比例設定階段

### TC-180-06：處長角色存取限制不變

- **Given**：帳號角色為處長
- **When**：嘗試存取或呼叫部門比例設定頁／API
- **Then**：沿用既有唯讀／403 限制，行為與本 Story 實作前一致

### TC-180-07：準備完成摘要／Detail Drawer 回歸不受非預期影響

- **Given**：本 Story 已實作
- **When**：檢視「準備完成摘要」與「名單快照 Detail Drawer」之部門比例呈現
- **Then**：兩者結果與實作前一致（除非 OQ-180-04 裁定準備完成摘要納入過濾範圍）

---

## 依賴關係

- **Blocked By**：US-109（F079，部門比例設定頁主流程，本 Story 為其精煉）、US-100 / US-101（部長／處長角色權限定義）
- **Blocks**：無已知下游 Story
- **相關 Stories**：US-118（準備完成摘要，`excludeZeroRatio` 既有消費端，回歸關注對象）、US-131（快照 Detail Drawer，經查證**不受本 Story 影響**，列為回歸基準而非變更對象）

---

## 待解決問題

| ID | 問題 | 負責方 | 狀態 |
|----|------|--------|------|
| OQ-180-01 | 過濾邏輯應在 API 層新增 query flag（比照既有 `excludeZeroRatio` 模式）或前端層過濾？建議對齊既有 API 層 flag 模式以保持一致性，但由 system-architect 定案 | system-architect | 待確認 |
| OQ-180-02 | **★高風險**：`ob_dept_pct` 已存在非零 RATION、但該部門現在查無在職處長時，儲存流程應如何處理以避免靜默刪除既有比例設定？需在（a）畫面仍顯示但鎖定並標示「無處長」、（b）顯示警示 banner 要求使用者先行歸零或處理、（c）後端 PUT 保留未出現在 payload 中的既存列 等方案間（或其他方案）擇一或組合，並確認是否改變「加總須為 100%」之語意 | 業務主管 + system-architect | 待確認（阻塞性，須先裁示才可進入實作） |
| OQ-180-03 | 是否需在頁面顯示「已隱藏 N 個無處長部門」資訊列，讓部長知道有部門被排除（避免誤以為部門消失是資料錯誤）？ | 業務主管 | 待確認 |
| OQ-180-04 | 過濾是否也要套用到「準備完成摘要」（`ready-summary-detail-page.tsx`，現況呼叫 `excludeZeroRatio: true`）？兩者目前共用同一支 `DeptRatioService.getDeptRatios`。（澄清：「名單快照 Detail Drawer」經查證為獨立查詢、無 `directorName` 欄位，不受本題影響，不需一併決議） | system-architect + 業務主管 | 待確認 |
| OQ-180-05 | prototype `29a-dept-ratio-config.html` 現況示範資料已含「未設代理」紅點指示概念（但目前為**顯示且標示**、非**隱藏**），與本 Story 「隱藏無處長部門」之需求方向不同，需 ui-ux-designer 確認是否延用既有視覺語彙或重新設計 | ui-ux-designer | 待確認（非阻塞，執行面待辦） |

---

## Definition of Done

- [ ] 驗收標準全部通過（AC-1 ~ AC-7）
- [ ] OQ-180-01（過濾分層）、OQ-180-02（高風險既存比例處理）已由對應負責方裁示並落入正式 spec
- [ ] 高風險情境（TC-180-04）之精確斷言已依裁示結果補完並通過
- [ ] 空狀態測試通過（TC-180-05）
- [ ] 處長唯讀限制回歸測試通過（TC-180-06）
- [ ] 準備完成摘要／Detail Drawer 回歸測試通過（TC-180-07）
- [ ] prototype `29a-dept-ratio-config.html` 已由 ui-ux-designer 更新並與最終行為一致
- [ ] 後端測試同時涵蓋 SQLite unit 與 MSSQL spec 兩軌
- [ ] 單元測試覆蓋率 ≥ 80%
- [ ] Code review 通過
- [ ] 文件已更新（含對應 spec，建議編號 F117）

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **相關 Stories**：US-109（F079 部門比例設定主流程）、US-100 / US-101（角色權限定義）、US-118（準備完成摘要）、US-131（快照 Detail Drawer，回歸基準）
- **相關程式碼（現況調查依據，供 spec-writer 參考，非規格本身）**：
  - `apps/api/src/modules/assignment-stage/dept-ratio.service.ts`（`getDeptRatios` / `setDeptRatios`）
  - `apps/api/src/modules/assignment-stage/dept-ratio.controller.ts`
  - `apps/web/src/pages/assignment/_components/dept-ratio-form.tsx`
  - `apps/web/src/pages/assignment/ready-summary-detail-page.tsx`
  - `apps/web/src/pages/assignment/_components/ListDetailDrawer.tsx`（確認**不**共用 `getDeptRatios`）
  - `apps/api/src/common/emphire/emphire-active.util.ts`（在職語意 single source of truth）
- **對應 Spec**：尚未建立，建議編號 **F117**（依請求方指定；spec-index 現有最高編號為 F116），由 spec-writer 建立
