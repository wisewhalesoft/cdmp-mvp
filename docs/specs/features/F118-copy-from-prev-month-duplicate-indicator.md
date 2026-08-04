---
spec-id: F118
title: 從上月複製名單顯示「已複製過」提示
feature-id: F118
source-story: US-181
epic: E07
module: M01 名單定義（草稿階段「從上月複製」子流程）
priority: P1
version: "1.1"
date: 2026-08-04
status: Approved — 已通過人工審閱，可進入 TDD
---

# F118: 從上月複製名單顯示「已複製過」提示

Priority: P1 | Status: **Approved — 已通過人工審閱（可進入 TDD 實作）** | Last Updated: 2026-08-04

> **✅ 本文件已核可**（2026-08-04 人工審閱閘）。兩項阻塞事項均已由業務主管裁決：
> - **OQ-F118-B2（＝US-181 OQ-181-05）**：**採方案 (b) 語意等價**，並**明確接受**「複製後編輯條件即不再標記為已複製」之語意（標記語意＝「原樣儲存會被 422 擋下」）。
> - **OQ-F118-B3 / OQ-F118-04**：「從上月複製」範圍之四方不一致，**裁定以現行實作為準修正三處 spec**（[F050](F050-create-list-definition.md) AC-5 / §7、[data-model.md](../data-model.md)、US-106 AC-10 已於本輪同步修正）。
>
> **v1.1（2026-08-04 / 人工審閱閘）**：記錄上述兩項裁決（D-6 / D-7）；§5.1 端點拓樸定案為 **`GET /api/v1/assignment/lists/copy-duplicate-check`**（自 AD-E07-48 之 POST-帶候選 設計調整為 GET-帶月份，理由見 §5.1「定案說明」）；AC-4 明訂目標編號為純文字不可導航（D-8）；新增 AC-11（確認後之持續提醒列）；明訂 F051 編輯草稿不在本輪範圍（A-5）。
>
> **v1.0（2026-08-04 / US-181）**：初版。另記錄一項**經查證比 US-181 所述更大**之 spec-vs-impl 落差（[F050](F050-create-list-definition.md) AC-5 vs 實際複製範圍，4 點不符），見 §12.2 / OQ-F118-04。

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + [F050](F050-create-list-definition.md) §4 AC-5 / §5 / BR-14 + `data-model.md#ob_list_definitionobmlistdf--名單定義` |
| QA / Tester | 本文件 §4 / §10 + `error-handling.md#assignment-list-errors`（`LIST_NO_DUPLICATE`） |
| UI/UX Designer | 本文件 §7 + `prototypes/27a-list-create-draft.html` |
| Architect | 本文件 §5 / §12 + [F050](F050-create-list-definition.md) §5 |

---

## 對應 User Story

- 來源 Story：[US-181-M01-copy-from-prev-month-duplicate-indicator.md](../../stories/epics/E07-app-customer-list-assignment/US-181-M01-copy-from-prev-month-duplicate-indicator.md)（**DRAFT**）
- Epic：[E07 — 客戶名單分派](../../stories/epics/E07-app-customer-list-assignment/epic-brief.md)
- 宿主流程：[F050 v2.4 建立草稿名單](F050-create-list-definition.md) §4 AC-5「複製名單功能」

---

## 1. 功能摘要

於「從上月複製」Modal 中，對每一筆上月候選名單標示其「本作業月是否已存在等價名單」，並在使用者仍選擇複製時提供有意識確認機制，避免無意間建立內容重複的名單。

**核心設計裁定**：「已複製過」之判定採**語意等價**（方案 b）——即重用建立名單時真正會擋下重複的規則 `AssignmentListService.findActiveConditionDuplicate`（[F050](F050-create-list-definition.md) v2.2「完整條件集相等 + `card_type`」）。此裁定使提示語意與儲存端 422 `LIST_NO_DUPLICATE` **依建構即一致**（AC-2 免於靠測試維持），且**不需要任何 schema 變更**。完整論證見 §12.1 D-1。

**範圍**：唯讀提示 + 二次確認。**不改變**既有複製欄位帶入行為、不改變既有 Modal 候選清單過濾條件、不新增錯誤碼、不新增資料表欄位。

## 2. 使用者故事

**As a** 部長（Director）/ Admin
**I want** 在「從上月複製」Modal 看到哪些上月名單已經被複製到本月、複製成了哪一個名單編號
**So that** 我不會重複建立內容相同的名單、浪費 LIST_NO 額度並造成比例重複設定；若我確實要建立衍生名單，也知道自己是有意識地這麼做

## 3. 前置條件

- 沿用 [F050](F050-create-list-definition.md) 建立草稿名單之全部前置條件（JWT / 角色 / 作業月 / 無執行中月名單分派）
- 使用者位於「名單定義 > 建立草稿名單」頁並開啟「從上月複製」Modal
- 上月（`prevYm = computePrevYm(currentYm)`）存在至少一筆 `status = 'active'` AND `condition_payload IS NOT NULL` 之名單

## 4. 驗收標準

> **判定用語定義（全 AC 共用）**
> **「已複製過」**：對某筆上月候選名單 S，存在至少一筆本作業月（`currentYm`）之名單 T，滿足 `T.status = 'active'` AND `normalize(T.condition_payload) === normalize(S.condition_payload)` AND `T.card_type` 與 `S.card_type` 相等（含同為 `NULL`）。`normalize` 即 `findActiveConditionDuplicate` 所用之正規化（排除 system-fixed 欄位，如 `best_case`）。

### AC-1：Modal 每筆候選名單顯示「已複製過」提示

- **Given** 部長 / Admin 開啟「從上月複製」Modal
- **When** Modal 列出上月符合既有條件（`status = 'active'` AND `conditionPayload != null`）之名單
- **Then** 每一筆「已複製過」之名單顯示明確視覺提示
- **And** 未複製過之名單**不顯示**該提示（不以「未複製」徽章佔用視覺）
- **And** 該提示與既有「CR 啟用／CR 停用」徽章明確可區分

### AC-2：判定語意與儲存端 422 規則一致

- **Given** 某筆上月名單於 Modal 中被標示為「未複製過」
- **When** 使用者直接複製、**不修改任何欄位**並儲存
- **Then** 儲存**不得**回 422 `LIST_NO_DUPLICATE`
- **Given** 某筆上月名單被標示為「已複製過」
- **When** 使用者直接複製、不修改任何條件並儲存
- **Then** 儲存**必定**回 422 `LIST_NO_DUPLICATE`，且其 `details.conflictListNo` 與 AC-4 所顯示之目標名單編號**相同**
- **And** 此雙向一致性由「判定與儲存端共用同一正規化與比對函式」保證（BR-1），非由前端各自實作

### AC-3：已複製過之名單仍可操作，不得鎖死

- **Given** 某筆上月名單被標示為「已複製過」
- **When** 使用者點擊該筆「使用此名單」
- **Then** 系統**不得** disable 按鈕或直接阻擋
- **And** 先呈現明確確認 / 警示（說明本月已有等價名單及其編號、直接儲存將被拒），使用者確認後才繼續既有帶入流程
- **And** 使用者仍可於帶入後修改條件，使其不再等價而得以儲存

### AC-4：提示須顯示對應之目標月名單編號

- **Given** 某筆上月名單被標示為「已複製過」
- **When** 使用者檢視該提示
- **Then** 提示內容包含對應之本月名單編號（例如「已複製為 OB202608003」），而非僅一個無資訊量之徽章
- **And** 若存在多筆等價目標名單，顯示其一（取與儲存端 `findActiveConditionDuplicate` 相同之選取結果，BR-4），不需列舉全部
- **And** 該編號以**純文字**呈現，**不**做成導向該名單之連結（D-8：Modal 位於「建立草稿名單」表單內，導航離開將丟失使用者已填寫之表單狀態；使用者知道編號後可自行於名單定義頁查閱）

### AC-5：目標月定義沿用 F097 作業月語意

- **Given** 系統判定「本月是否已存在等價名單」
- **When** 執行判定
- **Then** 「本月」採頁面當前 `currentYm`（[F097](F097-work-ym-semantics-unification.md) 作業月語意），**非**後端系統當月
- **And** 與決定 Modal 候選清單之 `prevYm = computePrevYm(currentYm)` 為同一基準，成對一致

### AC-6：判定為開啟當下之即時結果

- **Given** 另一位管理者剛完成一筆複製
- **When** 使用者開啟 Modal
- **Then** 提示反映開啟當下之查詢結果，不得因快取而顯示明顯過期狀態
- **And** 本 feature **不引入**跨請求快取；Modal 每次開啟重新查詢（BR-6）

### AC-7：不得產生 N+1 查詢

- **Given** 上月有 N 筆候選名單（N 可達 20+）
- **When** Modal 載入全部名單與其判定
- **Then** 判定所需之資料庫查詢次數為**常數**，不隨 N 線性增加
- **And** 具體達成方式為「一次載入本月 active 名單集合 → 於記憶體建立正規化簽章索引 → 逐筆比對」（BR-3），比對本身不觸發查詢
- **And** 端點回應時間沿用 [nfr.md NFR-002.1](../nfr.md) 之一般 API 回應時間目標

### AC-8：既有複製主流程行為不受影響（回歸）

- **Given** 本 feature 已實作
- **When** 使用者對任一筆名單（無論是否已複製過）完成複製與建立
- **Then** 既有欄位帶入行為完全不變——名稱（經 `rollForwardListName` 前捲月份 token）、卡別、CR 開關、篩選條件（排除 system-fixed 欄位）、撈案期間；LIST_NO 於儲存時重新產生
- **And** 此範圍以**現行實作**為權威基準（見 §12.2 之 spec 落差說明）

### AC-9：舊遷移名單維持現況（範圍不擴大）

- **Given** 上月存在 `condition_payload IS NULL` 之舊遷移名單（US-123 backward-compat）
- **When** Modal 載入候選清單
- **Then** 此類名單依現況**不出現**於清單（既有前端過濾 `conditionPayload != null`），本 feature 不改變此過濾
- **And** 不為此類名單設計「已複製過」判定

### AC-10：無法判定時採「不標示」之安全降級

- **Given** 某筆候選名單之正規化簽章為空字串（`normalize` 回傳 `''`，即無可比對之有效條件）
- **When** 執行判定
- **Then** 該筆**不標示**為已複製過（對齊 `findActiveConditionDuplicate` 於 `inputSig === ''` 時回 `null` 之既有行為）
- **And** 判定查詢失敗時，Modal 仍正常列出候選名單、僅不顯示提示，**不得**因判定失敗而阻擋複製流程

### AC-11：確認採用已複製過之來源後，表單持續提示

- **Given** 使用者於 AC-3 之確認機制中選擇「仍要使用」某筆已複製過之名單
- **When** 欄位帶入完成、使用者回到建立草稿表單
- **Then** 表單上持續顯示一則提醒（與既有「已從 {listNo} 複製」成功 banner 併存或整合），說明「本月已有等價名單 {copiedToListNo}；若不修改篩選條件，儲存將被拒絕」
- **And** 該提醒**不**阻擋任何操作，使用者修改條件後仍可正常儲存
- **And** 使用者可關閉該提醒

## 5. API 規格

### 5.1 判定資料之取得

本 feature 需要「上月候選名單」與「本月 active 名單」兩組資料之等價比對結果。端點拓樸已於人工審閱閘定案（§5.1.1）；下表為**行為契約**，實作須逐條滿足：

| 契約項 | 要求 |
|---|---|
| 查詢次數 | 常數次（AC-7 / BR-3），不得 per-row 呼叫 |
| 判定邏輯落點 | **後端**（BR-1）。不得由前端自行實作正規化 / 比對，否則 AC-2 之一致性無法保證 |
| 回傳內容 | 每筆上月候選名單對應 `alreadyCopied: boolean` + `copiedToListNo: string \| null` |
| 作業月參數 | 由呼叫端帶入 `currentYm`（AC-5），後端不自行推導系統當月 |
| 失敗語意 | 判定失敗不阻擋 Modal（AC-10），以「全部未標示」降級 |

### 5.1.1 定案端點（人工審閱閘 2026-08-04）

```
GET /api/v1/assignment/lists/copy-duplicate-check?prevYm=YYYYMM&currentYm=YYYYMM
```

**Response**

```json
{
  "prevYm": "202607",
  "currentYm": "202608",
  "items": [
    { "listNo": "OB202607001", "alreadyCopied": true,  "copiedToListNo": "OB202608003" },
    { "listNo": "OB202607002", "alreadyCopied": false, "copiedToListNo": null }
  ]
}
```

- 回傳涵蓋 `prevYm` 全部符合 BR-9 候選過濾（`status='active'` AND `condition_payload IS NOT NULL`）之名單；前端以 `listNo` 對既有 Modal 清單做 join。
- 路由前綴沿用 `AssignmentListController` 實際之 `assignment/lists`（**非**既有兩份文件誤植之 `assignment/list-definitions`，見 [AD-E07-48 §2](../implementation-log/AD-E07-48-f117-f118-ux-refinements.md)）。
- 查詢次數：`loadSystemFixedFields` + 上月候選 + 本月 active 名單 ＝ **常數 3 次**，不隨 N 成長（AC-7 / BR-3）。

**定案說明——為何自 [AD-E07-48 §5.1](../implementation-log/AD-E07-48-f117-f118-ux-refinements.md) 之 `POST` 設計調整為 `GET`**

AD-E07-48 原設計為 `POST`，由**前端把已持有之候選資料（含 `conditionPayload`）送回後端**判定。該設計唯一的理由是「與候選過濾規則解耦」，以免 F118 被 OQ-F118-B3（複製範圍四方不一致）阻塞。**OQ-F118-B3 已於本次人工審閱閘裁決**（以實作為準），候選過濾規則自此明確且唯一（BR-9），該解耦理由消失，故改採較簡之 GET：

1. **強化 AC-2 之核心不變式**：判定所用之 `condition_payload` 直接由後端自 DB 讀取，與儲存端 `findActiveConditionDuplicate` **同源**。POST 設計則使一致性額外依賴「前端忠實往返 payload」——一旦 `listLists` 日後對 payload 做任何裁剪或正規化，判定即與 422 靜默分歧，而 AC-2 正是本 feature 要保證的東西。
2. **免除大 body**：POST 需送 N 筆完整 `conditionPayload`；GET 僅兩個月份參數。
3. **唯讀查詢用 GET 較合語意**，且前端不需為此組裝 DTO。

代價為多一次上月候選查詢（2 次 → 3 次），仍為常數，不影響 AC-7。

> **殭屍端點註記**：`GET /api/v1/assignment/list-definitions/copy-source-options` 於 [data-model.md](../data-model.md) 與 [F050 §6.1](F050-create-list-definition.md) 已規格化但**從未實作**（`grep -rn "copy-source-options" apps/` 命中 0 筆）；現行前端以 `listLists({ ym: prevYm })` 載入候選並於前端過濾。本 feature **不**補完該端點（其候選過濾語意已由 OQ-F118-B3 裁決另行對齊），該殭屍規格之清理列為獨立技術債（見 [open-questions.md](../open-questions.md) OQ-F118-01 結論）。

### 5.2 錯誤碼

**本 feature 不新增錯誤碼。** 判定為唯讀提示；真正的重複攔截仍由既有 [F050](F050-create-list-definition.md) 建立流程之 422 `LIST_NO_DUPLICATE` 負責（見 [error-handling.md#assignment-list-errors](../error-handling.md#assignment-list-errors)）。

## 6. 業務規則

| 規則編號 | 說明 |
|---|---|
| BR-1 | **單一判定來源（★核心不變式）**：「已複製過」之判定**必須**重用 `AssignmentListService` 中與 `findActiveConditionDuplicate` **相同之正規化函式與比對規則**（[F050](F050-create-list-definition.md) v2.2「完整條件集相等 + `card_type`」）。禁止複製一份平行實作。此為 AC-2 一致性之結構性保證 |
| BR-2 | **判定為衍生狀態，不落表**：「已複製過」為查詢時即時計算之結果，**不新增** `ob_list_definition` 欄位、不新增資料表、不需 migration（見 §12.1 D-1） |
| BR-3 | **常數查詢次數**：一次載入 `currentYm` 之 active 名單（含 `condition_payload` / `card_type`）→ 於記憶體建立 `(signature, cardType) → listNo` 索引 → 逐筆比對上月候選。比對階段不得觸發查詢（AC-7） |
| BR-4 | **多筆等價之選取決定性**：若同一簽章對應多筆本月名單，選取結果須與 `findActiveConditionDuplicate` 之選取一致（該函式回傳候選集合中之第一筆符合者）。**選取順序之決定性**（是否明訂 `ORDER BY list_no`）交 architect（OQ-F118-02） |
| BR-5 | **system-fixed 欄位排除**：正規化須沿用既有對 `pooldata_field_whitelist.is_system_fixed = true` 欄位（如 `best_case`）之排除規則（[F050 BR-14](F050-create-list-definition.md)）。此為必要條件——複製時前端亦排除 system-fixed 條件、由後端 `injectSystemFixedConditions` 重新注入，兩端須採同一排除規則方能等價 |
| BR-6 | **不引入快取**：每次開啟 Modal 重新查詢（AC-6）。若日後為效能引入快取，須同時定義失效策略，屬另案 |
| BR-7 | **`card_type` 為判定之一部分**：`NULL` 與 `NULL` 視為相等（沿用 `findActiveConditionDuplicate` 之 `l.card_type IS NULL` 分支）。此規則之成立以「複製會帶入 `card_type`」為前提（已於現行實作查證） |
| BR-8 | **僅比對 `status = 'active'`**：已停用之本月名單不構成「已複製過」（沿用 `findActiveConditionDuplicate` 之 `l.status = 'active'` 條件），與儲存端一致 |
| BR-9 | **不改變候選清單過濾**：Modal 候選仍為上月 `status = 'active'` AND `condition_payload IS NOT NULL`（AC-9） |

## 7. UI/UX 需求

> Prototype = UI ground truth（CLAUDE.md）。本 feature 需 ui-ux-designer 更新 `prototypes/27a-list-create-draft.html`。

- **「已複製過」提示**：含目標名單編號（AC-4，**純文字不可點**）；與既有 CR 徽章明確可區分（AC-1）
- **仍可點擊**：不得 disable「使用此名單」（AC-3）
- **確認 / 警示機制**：點擊已複製過之名單時，先說明「本月已有等價名單 {listNo}，若不修改條件將無法儲存」，確認後繼續（採**二次確認彈窗**，OQ-F118-03 已裁決）
- **確認後之持續提醒**：AC-11 之表單提醒列
- **未複製過**：不顯示任何徽章，維持現有版面密度
- **降級**：判定不可得時，Modal 正常運作、不顯示提示、不顯示錯誤（AC-10）；判定進行中**不**顯示 skeleton 佔位（人工審閱裁決：判定為單次輕量查詢，佔位反而製造閃爍）

## 8. 依賴關係

- **Blocked By**：[F050 v2.4](F050-create-list-definition.md)（建立草稿名單 + 複製功能宿主 + `findActiveConditionDuplicate` 規則）、[F097](F097-work-ym-semantics-unification.md)（作業月語意）
- **Blocks**：無
- **相關**：[F051](F051-edit-list-definition.md)（編輯草稿亦呼叫同一重複檢查，語意共用）、[F075](F075-manage-pooldata-field-whitelist.md)（`is_system_fixed` 排除規則來源）

## 9. 交叉參照

- **宿主流程**：[F050 v2.4](F050-create-list-definition.md) §4 AC-5 / §6 BR-14
- **資料模型**：[data-model.md#ob_list_definitionobmlistdf--名單定義](../data-model.md#ob_list_definitionobmlistdf--名單定義)
- **錯誤代碼**：[error-handling.md#assignment-list-errors](../error-handling.md#assignment-list-errors)（`LIST_NO_DUPLICATE`；本 feature 不新增）
- **待決事項**：[open-questions.md](../open-questions.md)（OQ-F118-01 ~ OQ-F118-04）
- **圖表**：[diagrams/F118-copied-indicator-flow.mmd](../diagrams/F118-copied-indicator-flow.mmd)
- **Prototype**：`prototypes/27a-list-create-draft.html`

## 10. 測試覆蓋目標

- 單元測試覆蓋率 ≥ 80%；後端測試須同時涵蓋 SQLite unit 與 MSSQL spec 兩軌
- **後端關鍵案例**：
  - 上月 3 筆候選，本月存在 1 筆等價 → 該筆 `alreadyCopied = true` 且 `copiedToListNo` 正確，其餘 2 筆 `false`
  - **一致性（★核心）**：對判定為 `false` 之名單，執行實際 `createList`（原樣條件）→ **不得** 422（AC-2）
  - **一致性反向（★核心）**：對判定為 `true` 之名單，執行實際 `createList`（原樣條件）→ **必定** 422 `LIST_NO_DUPLICATE`，且 `details.conflictListNo` 等於 `copiedToListNo`（AC-2）
  - `card_type` 不同但條件相同 → `alreadyCopied = false`（BR-7）
  - `card_type` 兩邊皆 `NULL` 且條件相同 → `alreadyCopied = true`（BR-7）
  - 本月等價名單 `status != 'active'` → `alreadyCopied = false`（BR-8）
  - 條件僅差 system-fixed 欄位（`best_case`）→ 仍判為等價（BR-5）
  - 簽章為空（無有效條件）→ `alreadyCopied = false`（AC-10）
  - **N+1 防範**：N = 20 筆候選，斷言查詢次數為常數且不隨 N 成長（AC-7 / BR-3）
  - `currentYm` 為使用者所選作業月（≠ 後端系統當月）→ 判定基準正確（AC-5）
- **前端關鍵案例**：
  - 已複製過徽章顯示目標編號、與 CR 徽章可區分
  - 目標編號為純文字，**非**連結 / 無點擊行為（AC-4 / D-8）
  - 已複製過之「使用此名單」仍可點擊，且觸發二次確認彈窗（AC-3）
  - 於確認彈窗選擇「仍要使用」→ 表單顯示 AC-11 持續提醒列且可關閉
  - 未複製過之名單不顯示任何徽章、不觸發確認（AC-1 / AC-3）
  - 判定查詢失敗 → Modal 正常列出、無提示、無錯誤（AC-10）
- **回歸**：複製帶入欄位行為與實作前逐欄位一致（AC-8）；舊遷移名單不出現（AC-9）

## 11. 實作 Checklist

- [ ] 後端判定服務：重用 `findActiveConditionDuplicate` 之正規化（BR-1），批次化為常數查詢（BR-3）
- [ ] `GET /api/v1/assignment/lists/copy-duplicate-check`（§5.1.1）
- [ ] `findActiveConditionDuplicate` 補 `ORDER BY list_no ASC`（BR-4 決定性；[AD-E07-48 §3.2 OQ-F118-02](../implementation-log/AD-E07-48-f117-f118-ux-refinements.md)）
- [ ] 前端 Modal 徽章 + 目標編號（純文字）+ 二次確認彈窗（AC-1 / AC-3 / AC-4）
- [ ] 前端 AC-11 表單持續提醒列
- [ ] 前端降級處理（AC-10）；**不**加 skeleton 佔位
- [x] `prototypes/27a-list-create-draft.html` 已由 ui-ux-designer 更新並經人工審閱合併
- [ ] 一致性測試（AC-2 雙向）+ N+1 測試（AC-7）
- [ ] **無**新錯誤碼、**無** migration（BR-2）

## 12. 假設與裁決偏離

### 12.1 對 US-181 之裁決偏離（★ 本 spec 之核心產出）

| # | US-181 原文 | 本 spec 裁決 | 理由（技術事實） |
|---|---|---|---|
| **D-1** | OQ-181-01：判定機制三案 (a) 血緣欄位 / (b) 語意等價 / (c) audit log 反查，列為阻塞待裁 | **裁定採 (b) 語意等價** | 三案逐條檢核：**(a) 血緣**與 AC-2 **直接矛盾**——複製後修改條件仍被標為「已複製」，但儲存不會撞 422，正是 AC-2 明令避免之不一致；且需 migration（dev MSSQL 為 migration-managed，見專案記憶）。**(c) audit log 反查**依賴 `after_value` JSON 字串，無索引、可靠度低，且 audit 為稽核用途不應成為業務查詢來源。**(b)** 則：①與儲存端 422 規則**依建構即一致**（AC-2 免於靠測試維持）②`findActiveConditionDuplicate` 已回傳 `conflictListNo`，**直接滿足 AC-4** 之目標編號需求③無需 schema 變更④已查證該函式為 public、可直接重用。**唯一代價**＝編輯條件後不再標記（OQ-181-05 之業務語意，須人工確認） |
| **D-2** | AC-1：「每一筆名單旁須清楚顯示該筆名單**是否**已被複製過的視覺提示」 | **僅對「已複製過」顯示徽章**；未複製過不顯示 | 「是否」之字面可解為兩種徽章皆顯示。對多數為「未複製」之清單而言，滿版徽章降低訊號雜訊比。取其意圖（讓已複製者可辨識） |
| **D-3** | AC-6：「不應出現明顯過期情形（可接受之查詢時效精確門檻由 system-architect 定義）」 | **不引入快取，每次開啟即時查詢**（BR-6） | 既然不引入快取，即不存在「時效門檻」需要定義，OQ 自然收斂。判定為單次輕量查詢（BR-3），無快取之效能理由 |
| **D-4** | AC-4：「提示須顯示對應之目標月名單編號」；未定義多筆等價之情形 | 多筆等價時顯示其一，與儲存端選取一致（BR-4） | 儲存端 422 亦只回一筆 `conflictListNo`；若提示列舉多筆而錯誤只報一筆，反造成不一致 |
| **D-6** | OQ-F118-B2（＝US-181 OQ-181-05）：語意等價之業務後果 | **業務主管已裁決（2026-08-04）：接受**「複製後編輯條件即不再標記為已複製」 | 標記語意經確認即為「原樣儲存會被 422 `LIST_NO_DUPLICATE` 擋下」，而非「這份上月名單被拿去用過」之血緣語意。此裁決**確立方案 (b) 為最終選型**，`ob_list_definition` 不新增欄位、不需 migration（BR-2） |
| **D-7** | OQ-F118-B3 / OQ-F118-04：複製範圍四方不一致 | **業務主管已裁決（2026-08-04）：以現行實作為準修正三處 spec** | [F050](F050-create-list-definition.md) AC-5 / §7、[data-model.md](../data-model.md)、US-106 AC-10 已於本輪同步修正為：帶入名稱（經 `rollForwardListName` 前捲月份）、`cr_enabled` 沿用來源值、帶入 `card_type`、候選過濾為 `status='active'` AND `condition_payload IS NOT NULL`（**無** `stage='ready'`）。**BR-7 之 `card_type` 判定前提自此有 spec 依據** |
| **D-8** | US-181 AC-4 原含「可導向該目標名單」之條款 | **不做導航，目標編號為純文字** | Modal 位於「建立草稿名單」表單內，導航離開會丟失使用者已填寫之表單狀態；「開新分頁」則使流程分岔。編號本身已足以讓使用者事後查閱 |
| **D-5** | 未提及 | **新增 AC-10 安全降級**（判定失敗不阻擋複製） | 本 feature 為輔助提示，不應成為主流程之新失敗點。呼應專案既有教訓：前端 `catch { setPreview(null) }` 式靜默吞噬曾造成面板空白（見 F055 v1.7），故明定「降級但不隱藏主功能」 |

### 12.2 查證發現：[F050](F050-create-list-definition.md) AC-5 與現行複製實作之落差（比 US-181 OQ-181-06 所述更大）

US-181 OQ-181-06 指出 US-106 AC-10 與實作有落差並指派 spec-writer 評估。**經逐行查證 `list-create-draft-page.tsx::handleCopyApply` 與 [F050](F050-create-list-definition.md) §4 AC-5，落差共 4 點，且對應之 spec 為 F050**：

| # | [F050](F050-create-list-definition.md) AC-5 / §7 現行文字 | 實際實作 | 影響 |
|---|---|---|---|
| 1 | 「`list_nm` 仍為空待填」 | `setListNm(rollForwardListName(src.listNm, prevYm, currentYm))` — 帶入名稱並前捲月份 token | spec 與實作相反 |
| 2 | 「`cr_enabled` 恢復預設 `true`（不沿用上月設定）」 | `setCrEnabled(src.crEnabled ?? true)` — 沿用來源設定 | spec 與實作相反 |
| 3 | 未提及 `card_type` 複製 | `setCardType(src.cardType ?? '')` — 帶入卡別 | **對 F118 具實質影響**：BR-7 之 `card_type` 判定以「複製會帶入卡別」為前提 |
| 4 | 來源過濾為 `status='active'` AND **`stage='ready'`** AND `condition_payload IS NOT NULL` | Modal 實際僅過濾 `status='active'` AND `conditionPayload != null`（無 `stage='ready'`） | 候選集合範圍不同；影響 AC-9 所述「既有過濾」之權威定義 |

**spec-writer 處置（依專案 `feedback_spec_schema_gap_first` 慣例「先停下修 spec 再實作」）**：

- **不**於本輪逕自改寫 [F050](F050-create-list-definition.md)——「spec 對、實作錯」或「實作對、spec 過時」屬**產品決策**（例如「複製是否應帶入名稱」有正當的兩種答案），非 spec-writer 可單方裁定
- 本 feature 之 AC-8 明訂以**現行實作**為回歸基準，使 F118 不被此落差阻塞
- 落差完整記錄於 **OQ-F118-04**（交業務主管 + product-analyst），建議預設＝**以實作為準修正 F050 AC-5**（實作行為對使用者更友善且已上線運行，Modal 頁尾文案亦已對外描述該行為）

### 12.3 假設清單

| # | 假設 | 標記 |
|---|---|---|
| A-1 | **端點拓樸**：已定案為 `GET /api/v1/assignment/lists/copy-duplicate-check?prevYm&currentYm`（§5.1.1，人工審閱閘調整自 AD-E07-48 之 POST 設計） | ✅ 已定案 |
| A-2 | **`findActiveConditionDuplicate` 之可重用性**：已查證其為 public method 且正規化邏輯獨立可抽取；若 architect 認為需重構為共用 util，行為須完全等價（BR-1） | 已查證，重構方式待 architect |
| A-3 | **候選清單過濾之權威來源**：**已定案**——`status='active'` AND `condition_payload IS NOT NULL`（**無** `stage='ready'`）。OQ-F118-04 裁定以實作為準，三處 spec 已同步修正（D-7） | ✅ 已定案 |
| A-5 | **F051 編輯草稿（27b）不在本輪範圍**：F051 亦呼叫同一 `findActiveConditionDuplicate`，理論上可有等價提示，但其使用情境（編輯既有草稿而非挑選複製來源）與本 feature 不同，**不**於本輪擴充。若日後需要，另開 story | 人工審閱裁決：範圍邊界確認 |
| A-4 | **「已複製過」不區分複製來源**：若使用者本月自行建立（非經複製）一筆與上月等價之名單，該上月名單亦會被標示為「已複製過」。此為方案 (b) 之固有語意，與 AC-2 一致（該情境下儲存確實會撞 422），本 spec 視為正確行為 | spec-writer 裁定，建議人工確認 |

## 13. 變更紀錄

| 版本 | 日期 | 變更內容 |
|---|---|---|
| v1.1 | 2026-08-04 | **人工審閱閘通過，狀態 Draft → Approved**。OQ-F118-B2 業務裁決＝接受語意等價之後果（D-6）；OQ-F118-B3 業務裁決＝以實作為準修正 F050 / data-model / US-106（D-7，本輪已同步修正）；§5.1.1 端點定案為 `GET .../copy-duplicate-check`（自 AD-E07-48 之 POST 調整，以使判定與儲存端同源，強化 AC-2）；AC-4 補「純文字不可導航」（D-8）；新增 AC-11 表單持續提醒；§7 裁定二次確認彈窗、不加 skeleton；A-1 / A-3 解除，新增 A-5 明訂 F051 不在範圍 |
| v1.0 | 2026-08-04 | 初版（DRAFT，依 DRAFT 狀態之 US-181 撰寫）。核心為 §12.1 D-1 裁定判定機制採方案 (b) 語意等價（附三案逐條論證）、D-3 取消快取時效門檻、D-5 新增安全降級 AC。§12.2 記錄 [F050](F050-create-list-definition.md) AC-5 之 4 點 spec-vs-impl 落差（比 US-181 OQ-181-06 所述更大），未逕自改寫，轉為 OQ-F118-04。**OQ-181-05（編輯條件後不再標記之業務可接受性）仍為進入實作之硬性前置** |
