---
spec-id: F112
title: 類別型篩選欄位可選值自動建議（從實際資料批次帶入）
feature-id: F112
source-story: US-178
epic: E07
module: M06 篩選欄位
priority: P2
version: "1.0"
date: 2026-07-12
status: Draft
---

# F112: 類別型篩選欄位可選值自動建議（從實際資料批次帶入）

Priority: P2（Should Have / Phase 2 Advanced） | Status: Draft | Last Updated: 2026-07-12

> **v1.0（2026-07-12 / US-178 初版）**：為 M06 篩選欄位新增「類別型可選值自動建議」UX 強化功能。系統向欄位的來源資料表（`ob_pool_data` 或 `customer_core`）查詢實際 distinct 值，以核取清單讓管理者一次勾選、批次帶入為可選值。**兩個進入點**：(1) F075 新增篩選欄位 Modal（僅 `ob_pool_data`）——選定類別型欄位時偵測 distinct → checklist（全選）→ 儲存時建立欄位並批次帶入勾選值；(2) F076 可選值管理頁（`ob_pool_data` 與 `customer_core` 皆適用，含 F109 之 8 個客戶欄位）——「從實際資料帶入可選值」按鈕 → 依欄位 `data_source` 查 distinct（排除已存在值去重）→ 批次帶入。**新增 2 個 API**：`GET /pooldata-fields/:columnName/distinct-values`（查 distinct）、`POST /pooldata-fields/:columnName/options/bulk`（批次新增，兩進入點共用）。本功能為 F075（US-102）/ F076（US-103）既有流程之**輔助強化**，不取代逐筆手動新增可選值（F076 §5.2）。**邊界**：SQL 設計（distinct 查詢索引策略 / cap 精確落點 / 逾時秒數）、跨端點交易邊界之最終架構選型由 system-architect（AD-E07-46 或衍生決策）owns；本 spec 定義預設契約與 5 個 OQ 之預設裁示（§12）。

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| System Architect | 本文件 §5 / §6 / §12 + `F075` §5 / §6 + `F076` §5 / §6 + `apps/api/src/modules/pooldata-field/controllers/pooldata-field-whitelist.controller.ts` + `services/pooldata-field-whitelist.service.ts`（`getAvailableColumns` dialect-branch 範本）+ `apps/api/src/modules/etl/target-table-schemas.ts`（customer_core） |
| TDD Developer | 本文件 + `F075` + `F076` + `data-model.md#pooldata_field_whitelist` + `data-model.md#pooldata_field_option` + `error-handling.md#assignment-code-errors` |
| QA / Tester | 本文件 §4 / §10 + `error-handling.md#assignment-code-errors` |
| UI/UX Designer | 本文件 §7 + prototype `37a-pooldata-whitelist.html`（新增欄位 Modal）/ `37b-categorical-field-values.html`（可選值管理頁） |

---

## 對應 User Story

- 來源 Story：[US-178-M06-auto-suggest-categorical-options.md](../../stories/epics/E07-app-customer-list-assignment/US-178-M06-auto-suggest-categorical-options.md)（18 AC / 14 TC / 5 OQ；5 個 OQ 已於本 spec §12 裁示並落規格）
- Epic：[E07 — 客戶名單分派](../../stories/epics/E07-app-customer-list-assignment/epic-brief.md)
- 模組：M06 篩選欄位

---

## 1. 功能摘要

現行新增篩選欄位（F075）只建立欄位 metadata（不含可選值）；維護可選值（F076）僅支援逐筆輸入 `option_value` / `option_label`。當類別型欄位之實際相異值數量多（如 F109 之職業別 55 種、居住城市 22 種），逐筆手動輸入耗時且易遺漏。F112 讓系統直接向欄位來源資料表查詢實際存在之 distinct 值，以核取清單（全部預設勾選、可個別取消）讓管理者確認後一次批次帶入。

**範圍**：

1. **新增 API `GET /api/v1/pooldata-fields/:columnName/distinct-values`**（§5.1）：解析欄位來源表（`ob_pool_data` | `customer_core`）→ dialect-branch raw SQL 查該欄位 distinct 值（cap 上限 + truncation 偵測 + NULL 排除）→ 回傳每值是否已為可選值（`alreadyOption`，供進入點 2 去重）。
2. **新增 API `POST /api/v1/pooldata-fields/:columnName/options/bulk`**（§5.2）：單一 transaction 批次新增可選值，`display_order` 由 max+1 依輸入順序遞增，對已存在 `option_value` **冪等略過**（不報錯）；回傳 `createdCount` / `skippedCount`。兩進入點共用此端點。
3. **進入點 1（F075 新增欄位 Modal，僅 `ob_pool_data`）**：選定類別型欄位 → 偵測 distinct → checklist（全選）→ 儲存時**先** `POST /pooldata-fields`（建立欄位）**再** `POST .../options/bulk`（批次帶入）。兩呼叫為分步驟編排，非跨端點單一交易（§6 BR-9 / OQ-178-03 裁示）。
4. **進入點 2（F076 可選值管理頁，`ob_pool_data` 與 `customer_core` 皆適用）**：既有類別型欄位「從實際資料帶入可選值」按鈕 → 依 `data_source` 查 distinct → checklist 排除已存在值（去重）→ 批次帶入 → 列表即時刷新。

**欄位類別限定**：僅 `field_type = categorical` 欄位觸發；`numeric` / `date` 不觸發任何 distinct 查詢、不顯示按鈕（§6 BR-1）。

**不在範圍**（交其他 agent / 後續）：

- distinct 查詢之 SQL 索引策略、cap 精確落點是否 env 覆寫之最終決定、逾時秒數、跨端點交易邊界之最終架構選型：system-architect（AD-E07-46 或衍生決策，§12）。
- 核取清單 UI 元件之視覺設計與互動細節（搜尋框 / 分頁 / 全選捷徑）：ui-ux-designer（§7 僅約束語意與結構）。
- 既有「逐筆手動新增可選值」流程（F076 §5.2）不受本功能影響，維持原樣並存（§6 BR-8）。
- `optionLabel` 二次翻譯（透過代碼對照表提供比 distinct 值更易懂之顯示文字）：不在本 Story 範圍（維持 `optionLabel` 預設 = distinct 值本身，事後可手動編輯，AC-10 / OQ-178-05）。
- 新增篩選欄位 Modal 開放新增 `customer_core` 欄位（進入點 1 之來源擴充）：backlog（OQ-178-05）。

## 2. 使用者故事

**As a** 部長（Director）或 Admin
**I want** 在新增或管理類別型篩選欄位時，系統自動從來源資料表查出實際 distinct 值，以核取清單一次勾選批次帶入為可選值
**So that** 不需針對相異值數量多的欄位逐筆手動輸入，能更快、更準確完成可選值建置，降低手動輸入之遺漏與打字錯誤

## 3. 前置條件

- 使用者持 JWT 且 `business_role = 'director'` 或 admin（寫入 / 偵測端點限部長 / Admin，§6 BR-6）。
- Feature Flag `ENABLE_E07_REFACTOR_PHASE3 = true`（沿用 F075 / F076 寫入端點 gating；§6 BR-7）。
- F075（白名單，含 `field_type` + `data_source` 概念）、F076（categorical 可選值管理，含 `pooldata_field_option` 表與逐筆新增端點）、F109（customer_core 8 欄 + `data_source`）已部署。
- 欄位來源資料表（`ob_pool_data` / `customer_core`）已由 ETL 產出實值資料（未就緒為明確錯誤狀態，非靜默空白；AC-12 / §6 BR-11）。

## 4. 驗收標準

> 對應 US-178 AC-1 ~ AC-18 逐條。

### AC-1：新增欄位 Modal 選類別型欄位觸發 distinct 偵測（進入點 1）

- **Given** 部長 / Admin 在「新增篩選欄位」Modal 從 dropdown 選取某尚未列入白名單之 `ob_pool_data` 欄位
- **When** 該欄位 `field_type` 確定為 `categorical`（系統推斷預選或使用者手動選擇皆可）
- **Then** 前端呼叫 `GET /api/v1/pooldata-fields/{columnName}/distinct-values`，系統向 `ob_pool_data` 查該欄位實際 distinct 值
- **And** 查詢完成後以核取清單呈現偵測到的值，顯示提示「偵測到 N 個可選值，是否一併新增？」（N = `totalReturned`）
- **And** 清單中所有值預設為勾選（全選）狀態
- **And** 進入點 1（欄位尚未存在於白名單）之回應中每個值 `alreadyOption = false`

### AC-2：新增欄位 Modal 選數值型 / 日期型不觸發偵測

- **Given** 部長 / Admin 在 Modal 中欄位 `field_type` 確定為 `numeric` 或 `date`
- **When** 欄位類別非 categorical
- **Then** 前端**不呼叫** `distinct-values` 端點，不顯示可選值核取清單
- **And** 若先前因選 categorical 已顯示核取清單、之後改為 numeric / date，核取清單隱藏或清除，不影響後續儲存流程

### AC-3：新增欄位時可個別取消勾選候選值

- **Given** 核取清單已顯示 N 個候選值，全部預設勾選
- **When** 使用者取消勾選其中部分值
- **Then** 僅保留仍勾選的值作為儲存時要建立的可選值
- **And** 取消勾選不影響欄位本身的建立流程

### AC-4：新增欄位時全部取消勾選 → 僅建立欄位，不建立可選值

- **Given** 核取清單中使用者將全部候選值取消勾選
- **When** 使用者點擊「儲存」
- **Then** 系統僅呼叫 `POST /api/v1/pooldata-fields` 建立欄位（`field_type = categorical`、`is_active = true`），**不呼叫** bulk 端點，不建立任何可選值
- **And** 結果與「不使用本功能、直接透過既有新增欄位流程建立欄位」一致（可再透過 F076 逐筆新增可選值）

### AC-5：儲存後欄位與勾選值一併建立（進入點 1 主流程）

- **Given** 使用者已將欄位類別設為 categorical，核取清單勾選了 M 個候選值（M ≥ 1）
- **When** 使用者點擊「儲存」
- **Then** 系統**先** `POST /api/v1/pooldata-fields` 建立欄位，**再** `POST /api/v1/pooldata-fields/{columnName}/options/bulk` 將 M 個勾選值批次建立為可選值（`is_active = true`）
- **And** 建立完成後可於 F076 可選值管理頁直接看到這 M 個可選值，無需再逐筆新增
- **And** 若欄位建立成功但 bulk 批次帶入失敗，欄位**仍為已建立之有效狀態**（categorical 欄位允許零可選值），UI 顯示非阻斷警告「欄位已建立，但可選值帶入失敗，請至『可選值管理』重試」（§6 BR-9 / OQ-178-03 裁示）

### AC-6：可選值管理頁對既有類別型欄位提供「從實際資料帶入可選值」（進入點 2）

- **Given** 部長 / Admin 在可選值管理頁（F076）檢視某已存在之類別型欄位
- **When** 使用者點擊該欄位「從實際資料帶入可選值」按鈕
- **Then** 前端呼叫 `GET /api/v1/pooldata-fields/{columnName}/distinct-values`，系統依該欄位白名單之 `data_source`（`ob_pool_data` 或 `customer_core`）向對應來源表查 distinct 值
- **And** 同時支援 `ob_pool_data` 與 `customer_core` 來源欄位（含 F109 之 8 個客戶欄位，如職業別 `occupation_desc`、居住城市 `cpost_city`）

### AC-7：可選值管理頁候選清單排除已存在值（去重）

- **Given** 某類別型欄位目前已有 K 個可選值（不論啟用或停用）
- **When** 使用者點擊「從實際資料帶入可選值」，來源表共有 N 個 distinct 值
- **Then** 回應中每個 distinct 值標註 `alreadyOption`（已存在於 `pooldata_field_option` 者為 `true`，含已停用者）；前端核取清單僅呈現 `alreadyOption = false` 之候選值（N 減去已存在的 K 個）
- **And** 候選清單同樣預設全選，可個別取消勾選

### AC-8：可選值管理頁批次新增勾選值，清單即時刷新

- **Given** 使用者在候選清單勾選了部分或全部候選值
- **When** 使用者確認批次新增
- **Then** 系統呼叫 `POST /api/v1/pooldata-fields/{columnName}/options/bulk`，將勾選值以 `optionValue = distinct 值`、`optionLabel = distinct 值`、`is_active = true` 批次新增
- **And** 新增完成後可選值列表立即刷新（重新呼叫 F076 `GET .../options`），顯示新加入的可選值
- **And** 未被勾選的候選值不受影響、不會被新增

### AC-9：候選清單為空時顯示友善提示（無新可選值可帶入）

- **Given** 使用者點擊「從實際資料帶入可選值」，來源表全部 distinct 值皆已存在於該欄位可選值清單（不論啟用或停用，即全部 `alreadyOption = true`）
- **When** 系統完成比對
- **Then** 前端顯示「無新可選值可帶入」友善提示，不顯示空的核取清單，亦不阻擋使用者關閉流程

### AC-10：批次帶入之預設標籤，維持既有編輯機制

- **Given** 系統批次建立可選值（來自進入點 1 或進入點 2）
- **When** 可選值建立完成
- **Then** `optionValue` 直接採用 distinct 值本身；`optionLabel` 預設同樣採用該值本身（`optionValue = optionLabel`）
- **And** 業務主管可事後透過既有 F076 可選值編輯機制修改 `optionLabel`，此行為不在本 Story 新增或變更
- **And** 對本身已是中文顯示值之欄位（如 F109 之 `_desc` 欄位），`optionValue = optionLabel` 直接呈現中文，通常不需再編輯

### AC-11：distinct 值筆數超過上限時顯示警告，不全數列出

- **Given** 某欄位來源表之 distinct 值數量超過 `DISTINCT_VALUES_CAP`（預設 200，§5.3 / OQ-178-01 裁示）
- **When** 系統執行 distinct 查詢（取 `CAP + 1` 筆偵測是否超量）
- **Then** 回應 `truncated = true`、`values` 僅含前 `CAP` 筆、`totalReturned = CAP`
- **And** 前端顯示警告「偵測到的相異值數量過多（超過 {CAP} 筆），此欄位可能不適合以類別型管理，或請確認欄位選型是否正確」
- **And** 使用者仍可選擇（a）取消本次偵測、僅建立 / 保留欄位不帶入任何可選值，或（b）改以既有逐筆新增流程手動處理

### AC-12：來源資料表尚未就緒時顯示明確錯誤，不可靜默留空

- **Given** 欄位來源表（`ob_pool_data` 或 `customer_core`）尚未完成 ETL 載入或暫時無法查詢
- **When** 使用者觸發 distinct 偵測（進入點 1 或 2）
- **Then** 端點回 503 `OBPOOLDATA_NOT_READY`（`ob_pool_data` 來源）或 503 `CUSTOMER_CORE_NOT_READY`（`customer_core` 來源）；前端顯示明確錯誤「來源資料尚未就緒，請稍後再試或聯繫系統管理員」
- **And** 系統**不得**以「無任何提示的空白核取清單」呈現此狀況（本專案已有逾時 / 資料未就緒被前端靜默吞掉呈現空白造成業務誤判之教訓，§6 BR-11）

### AC-13：distinct 查詢逾時時顯示明確錯誤，不可靜默留空

- **Given** distinct 查詢因來源表規模過大或系統忙碌而執行時間過長，觸發 tedious `requestTimeout`（§12 OQ-178-02 裁示：沿用既有 driver 逾時，不另訂門檻）
- **When** 查詢逾時
- **Then** 端點回 504 `DISTINCT_VALUES_QUERY_TIMEOUT`；前端顯示明確逾時錯誤訊息並提供「重試」操作，**不**留下靜默空白畫面
- **And** 逾時不影響欄位本身既有的建立 / 編輯功能，使用者仍可選擇不使用本功能、改為手動新增可選值

### AC-14：欄位全部為 NULL 或無有效值時顯示空狀態

- **Given** 某欄位在來源表中所有列皆為 NULL，或無任何非 NULL 值
- **When** 使用者觸發 distinct 偵測
- **Then** 端點回 200 OK、`values: []`、`totalReturned: 0`、`truncated: false`；前端顯示「未偵測到任何可選值」空狀態提示
- **And** 空狀態與 AC-12（503）/ AC-13（504）之錯誤狀態明確區隔，不可混淆為查詢失敗
- **And** 使用者仍可正常完成欄位建立（進入點 1）或關閉流程（進入點 2）

### AC-15：重複值批次新增為冪等操作，不報錯

- **Given** 使用者於進入點 2 勾選之候選值中，某值在送出前後已被其他管理者以其他方式新增為可選值
- **When** 系統執行 bulk 批次新增
- **Then** 對已存在之 `option_value` **略過處理**（不視為錯誤、不中斷其餘值之新增），回應 `createdCount` / `skippedCount` 告知實際新增與略過筆數
- **And** 使用者不會因此收到「新增失敗」錯誤訊息（bulk 端點對重複值不回 409）

### AC-16：部長 / Admin 可使用本功能之兩個進入點

- **Given** 使用者具備部長或 Admin 身份
- **When** 使用者進入「新增篩選欄位」Modal，或進入既有類別型欄位之可選值管理頁
- **Then** 使用者可看到並操作「偵測 distinct 值」核取清單，以及「從實際資料帶入可選值」批次新增按鈕
- **And** `distinct-values` 與 `options/bulk` 兩端點對部長 / Admin 回 2xx（受 `DirectorGuard` + `FeatureFlagGuard` 保護）

### AC-17：處長無法看到或操作本功能之寫入介面

- **Given** 使用者具備「處長」（section_chief，非部長 / 非 Admin）角色
- **When** 使用者進入既有類別型欄位之可選值管理頁（唯讀模式；處長本就無法開啟「新增篩選欄位」流程，進入點 1 對處長不適用）
- **Then** 頁面**不顯示**「從實際資料帶入可選值」按鈕與批次新增操作
- **And** 若處長直接呼叫 `GET .../distinct-values` 或 `POST .../options/bulk`，後端回 403 `AUTH_FORBIDDEN`（沿用 F075 / F076 處長唯讀規則，§6 BR-6）

### AC-18：一般業務人員（無部長 / 處長 / Admin）無法存取本功能

- **Given** 使用者不具備部長、處長、Admin 任一角色
- **When** 使用者嘗試進入 M06「篩選欄位」相關頁面
- **Then** 使用者無法進入頁面（沿用 F075 / F076 頁面存取權限），因此無法接觸本功能任何操作入口

## 5. API 規格

> 新增 2 個端點，均掛於既有模組 `apps/api/src/modules/pooldata-field/`。distinct 查詢實作以既有 `pooldata-field-whitelist.service.ts` 之 `getAvailableColumns()` 為範本（dialect-branch raw SQL via `dataSource.query`；MSSQL `INFORMATION_SCHEMA` / `dbo` / `TOP`；SQLite 單元測試以 catch / pragma 降級；來源表不存在回 503）。

### 5.0 共用常數與安全規範

| 項目 | 規格 |
|---|---|
| `DISTINCT_VALUES_CAP` | 具名常數，**預設 200**（OQ-178-01 裁示：以程式碼常數固定；**MAY** 由環境變數 `POOLDATA_DISTINCT_VALUES_CAP` 覆寫，但預設固定、不開放 Admin UI 調整）。查詢取 `CAP + 1` 筆以偵測 truncation。 |
| `SAFE_COLUMN_NAME_RE` | `/^[a-z][a-z0-9_]{0,63}$/`（與 F075 BR-14 DTO regex 一致）。`columnName` 為 SQL 識別字，**不可參數化**，故須先以此 regex 驗證，再以 INFORMATION_SCHEMA 存在性確認，最後才可安全內插進 raw SQL（§6 BR-10）。 |
| 逾時 | 沿用 tedious driver 之 `requestTimeout`（預設約 15s）；不另訂本功能專屬門檻（OQ-178-02 裁示）。逾時錯誤須轉為 504 `DISTINCT_VALUES_QUERY_TIMEOUT`，禁止吞為 200 空清單（§6 BR-11）。 |

### 5.1 GET /api/v1/pooldata-fields/{columnName}/distinct-values

| 用途 | 查詢某欄位來源表之實際 distinct 值（供兩進入點之核取清單） |
|---|---|
| 認證 | JWT 必填 |
| 權限 | `DirectorGuard` + `FeatureFlagGuard('ENABLE_E07_REFACTOR_PHASE3')`（比照 `GET /available-columns` 之 director + feature flag 層級；本端點為寫入流程之驅動查詢，故不開放至 section_chief） |

**Path Params**：`columnName`（string）

**服務層行為**：

1. **來源表解析（resolve source table）**：
   - 若 `pooldata_field_whitelist` 存在 `column_name = {columnName}` 之欄位 → 使用其 `data_source`（`ob_pool_data` | `customer_core`）。
     - 若該欄位 `field_type != 'categorical'` → 回 400 `POOLDATA_OPTION_FIELD_TYPE_INVALID`（僅類別型可帶入可選值）。
   - 否則（進入點 1：新增欄位 Modal 選取尚未列入白名單之 `ob_pool_data` 欄位）→ 來源表固定為 `ob_pool_data`。
2. **欄位名稱驗證**：`columnName` 不符 `SAFE_COLUMN_NAME_RE` → 400 `SOURCE_COLUMN_NAME_INVALID`。
3. **欄位存在性確認**：以參數化查詢確認 `columnName` 存在於解析出之來源表 `INFORMATION_SCHEMA.COLUMNS`（`columnName` 作為**值**參數，非識別字內插）；不存在 → 404 `SOURCE_COLUMN_NOT_FOUND`。
4. **來源表就緒確認**：來源表本身不存在 / ETL 尚未 Load → 503（`ob_pool_data` → `OBPOOLDATA_NOT_READY`；`customer_core` → `CUSTOMER_CORE_NOT_READY`）。
5. **distinct 查詢**（dialect-branch raw SQL；欄位名經步驟 2–3 驗證後安全內插）：
   - MSSQL：`SELECT DISTINCT TOP ({CAP} + 1) [{col}] FROM {table} WHERE [{col}] IS NOT NULL ORDER BY [{col}]`
   - SQLite（單元測試）：`SELECT DISTINCT "{col}" FROM {table} WHERE "{col}" IS NOT NULL ORDER BY "{col}" LIMIT ({CAP} + 1)`
6. **truncation 判定**：實際回傳列數 > `CAP` → `truncated = true`、`values` 取前 `CAP` 筆、`totalReturned = CAP`；否則 `truncated = false`、`totalReturned = 實際筆數`。
7. **`alreadyOption` 標註**：查 `pooldata_field_option`（`column_name = {columnName}`，**含 inactive**）之全部 `option_value` 集合；每個 distinct 值若已存在該集合則 `alreadyOption = true`，否則 `false`。進入點 1（欄位不存在於白名單）時無任何既有 option → 全部 `false`。
8. 逾時 → 504 `DISTINCT_VALUES_QUERY_TIMEOUT`（禁止吞為 200 空清單）。

**Response — 200 OK**（`DistinctValuesResponse`）

```json
{
  "columnName": "occupation_desc",
  "dataSource": "customer_core",
  "values": [
    { "value": "工程師", "alreadyOption": false },
    { "value": "醫師", "alreadyOption": true },
    { "value": "教師", "alreadyOption": false }
  ],
  "totalReturned": 3,
  "truncated": false,
  "cap": 200
}
```

- 空欄位（全 NULL / 無非 NULL 值）→ `values: []`、`totalReturned: 0`、`truncated: false`（AC-14 空狀態，與錯誤狀態區隔）。
- `value` 一律為字串（distinct 值轉字串）。

**錯誤代碼**

| HTTP | 錯誤碼 | 說明 |
|---|---|---|
| 401 | AUTH_TOKEN_MISSING / AUTH_TOKEN_EXPIRED | 未登入或 Token 過期 |
| 403 | AUTH_FORBIDDEN | 處長 / 課長 / 業務人員呼叫（端點受 `DirectorGuard`） |
| 400 | SOURCE_COLUMN_NAME_INVALID | `columnName` 不符 `SAFE_COLUMN_NAME_RE`（**新增**） |
| 400 | POOLDATA_OPTION_FIELD_TYPE_INVALID | 欄位存在於白名單但 `field_type != 'categorical'`（沿用 F076） |
| 404 | SOURCE_COLUMN_NOT_FOUND | `columnName` 不存在於解析出之來源表 INFORMATION_SCHEMA（**新增**） |
| 503 | OBPOOLDATA_NOT_READY | `ob_pool_data` 表不存在 / ETL 尚未 Load（沿用 F075 §5.5） |
| 503 | CUSTOMER_CORE_NOT_READY | `customer_core` 表不存在 / ETL 尚未 Load（**新增**，比照 OBPOOLDATA_NOT_READY） |
| 503 | FEATURE_NOT_ENABLED | Feature Flag 關閉（沿用 BR-7） |
| 504 | DISTINCT_VALUES_QUERY_TIMEOUT | distinct 查詢逾時（**新增**，禁止靜默空清單，AC-13） |

### 5.2 POST /api/v1/pooldata-fields/{columnName}/options/bulk

| 用途 | 單一 transaction 批次新增可選值（兩進入點共用；對已存在值冪等略過） |
|---|---|
| 認證 | JWT 必填 |
| 權限 | `DirectorGuard` + `FeatureFlagGuard('ENABLE_E07_REFACTOR_PHASE3')`（與 F076 逐筆新增端點一致之寫入層級） |

> **路由排序注意**：`bulk` 為靜態子段，POST `/{columnName}/options/bulk` 與 F076 之 POST `/{columnName}/options`（逐筆新增）為不同路徑；與 PATCH `/{columnName}/options/{optionValue}` 為不同 HTTP method，無 route param 衝突。

**Request Body**（`BulkCreateOptionsDto`）

```json
{
  "options": [
    { "optionValue": "工程師", "optionLabel": "工程師" },
    { "optionValue": "教師", "optionLabel": "教師" }
  ]
}
```

**DTO 驗證規則**：

- `options`：陣列，`minLength: 1`、`maxLength: DISTINCT_VALUES_CAP`（200）；違反 → 422 `VALIDATION_ERROR`。
- `options[].optionValue`：字串，`minLength: 1`、`maxLength: 64`（對齊 `pooldata_field_option.option_value` VARCHAR(64) PK）。
- `options[].optionLabel`：字串，`minLength: 1`、`maxLength: 100`（對齊 `option_label` VARCHAR(100)）。

**服務層行為**：

1. 欄位必須存在於白名單且 `field_type = 'categorical'`：
   - 不存在 → 404 `POOLDATA_FIELD_NOT_FOUND`。
   - 非 categorical → 400 `POOLDATA_OPTION_FIELD_TYPE_INVALID`。
2. 於**單一 transaction** 內：
   - 讀取該欄位現有 `option_value` 集合（含 inactive）與目前 `display_order` 最大值 `maxOrder`。
   - 對 request `options` 依**輸入順序**逐一處理：
     - 若 `option_value` 已存在（DB 既有）→ **略過**（`skippedCount++`），維持既有紀錄不變（既有 active 亦不重啟、既有 inactive 亦不改動；**skip existing regardless**，§6 BR-3）。
     - 若 `option_value` 在本 request 前面已出現（批次內重複）→ 略過（`skippedCount++`，首次出現者為準）。
     - 否則 INSERT（`is_active = true`、`option_label` = 傳入值、`display_order = ++maxOrder`）→ `createdCount++`。
3. 稽核：**一筆彙總紀錄**（OQ-178-04 裁示）——`assignment_audit_log`：`action = 'CREATE'`、`entity_type = 'pooldata_field_option'`、`entity_id = {columnName}`、`details = { createdValues: [...], createdCount, skippedCount, source: 'bulk_auto_suggest' }`；**不**逐筆各寫一筆。稽核失敗不 rollback（沿用 F076 BR-7）。

**Response — 200 OK**

```json
{
  "columnName": "occupation_desc",
  "createdCount": 1,
  "skippedCount": 1,
  "options": [
    { "optionValue": "工程師", "optionLabel": "工程師", "isActive": true }
  ]
}
```

- `options[]` 僅含本次**實際新增**之可選值（依 `display_order` 遞增順序）。
- 全部略過（`createdCount = 0`）仍回 200 OK（冪等，非錯誤；AC-15）。

**錯誤代碼**

| HTTP | 錯誤碼 | 說明 |
|---|---|---|
| 401 | AUTH_TOKEN_MISSING / AUTH_TOKEN_EXPIRED | 未登入或 Token 過期 |
| 403 | AUTH_FORBIDDEN | 處長 / 課長 / 業務人員呼叫 |
| 400 | POOLDATA_OPTION_FIELD_TYPE_INVALID | 欄位 `field_type != 'categorical'`（沿用 F076） |
| 404 | POOLDATA_FIELD_NOT_FOUND | `columnName` 不存在於白名單（沿用 F076） |
| 422 | VALIDATION_ERROR | `options` 空 / 超過 cap / `optionValue` 或 `optionLabel` 長度違反 |
| 503 | FEATURE_NOT_ENABLED | Feature Flag 關閉 |

> **注意**：bulk 端點對重複 `option_value` **冪等略過**，**不回** 409 `POOLDATA_OPTION_DUPLICATE`（與 F076 逐筆新增端點之 409 行為刻意不同；AC-15）。

### 5.3 進入點 1 儲存流程編排（OQ-178-03 裁示）

進入點 1（新增欄位 Modal）之「儲存」由前端編排兩個既有 / 新增端點，**不**新增跨端點單一交易端點：

1. `POST /api/v1/pooldata-fields`（既有 F075 端點，`CreatePooldataFieldDto { columnName, displayName, fieldType }`，**不含** `dataSource`，預設 `ob_pool_data`）→ 建立欄位。
2. 若步驟 1 成功且核取清單有 ≥ 1 個勾選值 → `POST /api/v1/pooldata-fields/{columnName}/options/bulk` → 批次帶入。

**失敗處理**：

- 步驟 1 失敗 → 欄位未建立，顯示對應錯誤（沿用 F075 錯誤碼，如 409 `POOLDATA_FIELD_DUPLICATE`）；不執行步驟 2。
- 步驟 1 成功、步驟 2 失敗 → 欄位**已建立且為有效狀態**（categorical 欄位允許零可選值），顯示非阻斷警告「欄位已建立，但可選值帶入失敗，請至『可選值管理』重試」（AC-5 / §6 BR-9）。

> **設計理由**：欄位與可選值為兩個獨立資源；採兩次呼叫之分步驟編排，避免變更既有 `CreatePooldataFieldDto`（不引入 options 欄位）。若 system-architect 傾向單一 transactional「建立欄位＋可選值」端點，屬架構選項（AD-E07-46）；本 spec 之預設契約為兩次呼叫編排。

## 6. 業務規則

| 規則編號 | 說明 |
|---|---|
| BR-1 | **僅 categorical 觸發**：`numeric` / `date` 欄位不觸發 distinct 查詢、前端不顯示核取清單 / 「從實際資料帶入可選值」按鈕；`distinct-values` 端點對白名單既存但非 categorical 欄位回 400 `POOLDATA_OPTION_FIELD_TYPE_INVALID`（AC-2）。 |
| BR-2 | **去重（`alreadyOption`）**：`distinct-values` 對每個值標註是否已存在於 `pooldata_field_option`（**含 inactive**）；進入點 2 前端僅呈現 `alreadyOption = false` 候選；全部 `true` → 「無新可選值可帶入」（AC-7 / AC-9）。 |
| BR-3 | **bulk 冪等略過**：bulk 端點於單一 transaction 內對已存在 `option_value`（含 inactive）**一律略過**（不重啟、不改動、不報錯），回 `createdCount` / `skippedCount`；批次內重複值亦略過（首次為準）（AC-15）。 |
| BR-4 | **`optionValue = optionLabel = distinct 值`**：批次帶入之 `optionValue` 與 `optionLabel` 預設皆為 distinct 值本身；事後可透過既有 F076 編輯機制改 `optionLabel`（AC-10）。 |
| BR-5 | **cap + truncation 警告**：distinct 查詢取 `CAP + 1` 筆；> `CAP` 時 `truncated = true` 且僅回前 `CAP` 筆，前端顯示「相異值數量過多」警告（AC-11 / §5.0）。 |
| BR-6 | **RBAC 部長 only（寫入驅動）**：`distinct-values`（GET，寫入流程驅動查詢）與 `options/bulk`（POST）均限 `admin` 或 `business_role = 'director'`（`DirectorGuard`）；處長 / 課長 / 業務人員 → 403 `AUTH_FORBIDDEN`；前端對處長不渲染任何本功能寫入控制項（AC-16 / AC-17 / AC-18）。 |
| BR-7 | **Feature Flag gating**：兩端點受 `FeatureFlagGuard('ENABLE_E07_REFACTOR_PHASE3')`；flag = false → 503 `FEATURE_NOT_ENABLED`（沿用 F075 BR-10 / F076 BR-10）。 |
| BR-8 | **不取代逐筆新增**：F076 §5.2 逐筆手動新增可選值流程不受本功能影響、與本功能並存；管理者可自由選擇使用哪一種方式（US-178 背景）。 |
| BR-9 | **進入點 1 分步驟編排（非跨端點交易）**：儲存 = `POST /pooldata-fields`（建立欄位）→ `POST .../options/bulk`（批次帶入）兩次呼叫；欄位建立成功但 bulk 失敗時，欄位保留為有效狀態（允許零可選值），顯示非阻斷警告請使用者至可選值管理頁重試（OQ-178-03）。 |
| BR-10 | **欄位名安全**：`columnName` 為 SQL 識別字不可參數化；須先 `SAFE_COLUMN_NAME_RE` 驗證（→ 400 `SOURCE_COLUMN_NAME_INVALID`）、再以參數化 INFORMATION_SCHEMA 查詢確認欄位存在於解析出之來源表（→ 404 `SOURCE_COLUMN_NOT_FOUND`），通過後方可安全內插進 dialect-branch raw SQL（防 SQL injection）。 |
| BR-11 | **未就緒 / 逾時不得靜默空白**：來源表未就緒 → 503（`OBPOOLDATA_NOT_READY` / `CUSTOMER_CORE_NOT_READY`）；查詢逾時 → 504 `DISTINCT_VALUES_QUERY_TIMEOUT`；三者均須為明確錯誤狀態，**禁止**吞為 200 空清單（與 AC-14 之真實空狀態明確區隔；沿用專案「逾時靜默空白造成業務誤判」教訓，比照 F075 v1.4.2 `OBPOOLDATA_NOT_READY` 設計）。 |
| BR-12 | **`data_source` 來源解析**：`distinct-values` 之來源表以白名單欄位之 `data_source` 決定（F109 引入）；欄位不存在於白名單時（進入點 1）固定 `ob_pool_data`。`customer_core` 為 PG / MSSQL-only、無 TypeORM entity，一律 raw SQL 查詢（沿用 F109 AD-E07-37 對 customer_core 之處置）。 |
| BR-13 | **稽核彙總一筆**：bulk 批次新增寫入 `assignment_audit_log` 為**單一彙總紀錄**（`entity_id = columnName`、`details` 含 `createdValues` / `createdCount` / `skippedCount`），非逐筆各一（OQ-178-04）。 |

## 7. UI/UX 需求

> UI ground truth：prototype `37a-pooldata-whitelist.html`（新增欄位 Modal）、`37b-categorical-field-values.html`（可選值管理頁）。視覺細節（核取清單是否需搜尋框 / 分頁 / 全選捷徑、警告 / 空態 / 錯誤之呈現樣式）由 ui-ux-designer 決議；本節僅約束語意與結構。

### 7.1 前端 API client（`apps/web/src/api/pooldata-fields.ts`）

- 新增 `getDistinctValues(columnName): Promise<DistinctValuesResponse>` → `GET /api/v1/pooldata-fields/{columnName}/distinct-values`。
- 新增 `createOptionsBulk(columnName, options: Array<{ optionValue; optionLabel }>): Promise<BulkCreateOptionsResponse>` → `POST /api/v1/pooldata-fields/{columnName}/options/bulk`。
- **型別 LOCAL 定義**於 `api/pooldata-fields.ts`（`DistinctValuesResponse` / `DistinctValueItem` / `BulkCreateOptionsResponse`）；此 feature family **無** `@cdmp/shared` 型別，**不**新增共享型別。

### 7.2 進入點 1：新增欄位 Modal（`fields-tab.tsx` / 對應 F075 §7 新增 Modal）

- 於 `field_type` 確定為 `categorical` 時（dropdown 選欄位後、或使用者將 radio 切為 categorical），呼叫 `getDistinctValues(columnName)` 並顯示核取清單。
- 核取清單：列出 `values`，全部預設勾選；顯示「偵測到 N 個可選值，是否一併新增？」。
- 切為 `numeric` / `date` → 隱藏 / 清除核取清單，不呼叫 API（AC-2）。
- 狀態呈現須明確區隔：載入中 / 一般清單 / truncated 警告（AC-11）/ 503 未就緒錯誤（AC-12）/ 504 逾時錯誤＋重試（AC-13）/ 空狀態「未偵測到任何可選值」（AC-14）。**禁止**任何狀態以「無提示空白清單」呈現（BR-11）。
- 儲存：依 §5.3 編排（建立欄位 → bulk 帶入勾選值）；bulk 失敗顯示非阻斷警告（AC-5）。

### 7.3 進入點 2：可選值管理頁批次帶入 Modal（`options-tab.tsx` / 對應 F076 §7 accordion master）

- 每個 categorical 欄位之 accordion 內新增「**從實際資料帶入可選值**」按鈕（testid 建議 `btn-import-options-{columnName}`；`numeric` / `date` 欄位不顯示；處長不渲染）。
- 點擊 → 呼叫 `getDistinctValues(columnName)` → 開啟批次帶入 Modal：僅列出 `alreadyOption = false` 之候選值（去重，AC-7），全部預設勾選，可個別取消。
- 全部候選值 `alreadyOption = true` → 顯示「無新可選值可帶入」，不顯示空核取清單（AC-9）。
- 確認新增 → 呼叫 `createOptionsBulk(columnName, 勾選值)` → 成功後重新載入該欄位可選值列表（AC-8）；顯示結果 toast（含 `createdCount` / `skippedCount`）。
- 錯誤 / 警告 / 空態呈現同 §7.2（truncated / 503 / 504 / 空狀態明確區隔）。

### 7.4 不變更範圍

- F076 既有「逐筆新增可選值」Modal 流程不變（BR-8）。
- `numeric` / `date` 欄位之表單元件與行為不變。
- 既有可選值編輯 / 停用 / 啟用機制不變（AC-10）。

## 8. 依賴關係

- **Blocked By**：
  - F075（US-102）：新增篩選欄位 Modal（進入點 1 宿主流程）、白名單 `field_type` / `data_source` metadata、`POST /pooldata-fields` 建立欄位端點、`DirectorGuard` / `FeatureFlagGuard`。
  - F076（US-103）：可選值管理頁（進入點 2 宿主流程）、`pooldata_field_option` 表（複合 PK `(column_name, option_value)`、`display_order` / `is_active` / `deactivation_reason`）、逐筆新增端點。
  - F109（US-172）：`customer_core` 8 欄 + 白名單 `data_source` 概念（進入點 2 之 customer_core 來源適用對象）。
  - F002：角色定義 + JWT claim `businessRole`（RBAC）。
- **Blocks**：無已知下游 Story（純強化功能，不封鎖其他 Story）。
- **架構前置**：AD-E07-46（system-architect，落地 §12 OQ；distinct 查詢 SQL / 索引 / cap env 覆寫最終決定 / 跨端點交易邊界最終選型）。

## 9. 交叉參照

- **資料模型**：
  - [data-model.md#pooldata_field_whitelist](../data-model.md#pooldata_field_whitelist--pooldata-篩選欄位白名單)（`data_source` / `field_type` 驅動來源表解析與 categorical 限定）
  - [data-model.md#pooldata_field_option](../data-model.md#pooldata_field_option--可選值)（bulk 寫入目標；複合 PK / `display_order` append）
- **錯誤代碼**：[error-handling.md#assignment-code-errors](../error-handling.md#assignment-code-errors)
  - **沿用**：`AUTH_FORBIDDEN`（403）、`POOLDATA_OPTION_FIELD_TYPE_INVALID`（400）、`POOLDATA_FIELD_NOT_FOUND`（404）、`OBPOOLDATA_NOT_READY`（503，F075 §5.5）、`FEATURE_NOT_ENABLED`（503）、`VALIDATION_ERROR`（422）
  - **新增（需登錄 error-handling.md#assignment-code-errors）**：`SOURCE_COLUMN_NAME_INVALID`（400）、`SOURCE_COLUMN_NOT_FOUND`（404）、`CUSTOMER_CORE_NOT_READY`（503）、`DISTINCT_VALUES_QUERY_TIMEOUT`（504）
- **相關功能**：
  - [F075](F075-manage-pooldata-field-whitelist.md)（新增篩選欄位 Modal / 白名單 metadata / `available-columns` dialect-branch 範本）
  - [F076](F076-manage-categorical-field-values.md)（可選值管理頁 / `pooldata_field_option` / 逐筆新增端點）
  - [F109](F109-customer-source-filter-fields.md)（`customer_core` 8 欄 / `data_source` 概念）
- **後端程式定位**：
  - Controller：`apps/api/src/modules/pooldata-field/controllers/pooldata-field-whitelist.controller.ts`、`controllers/pooldata-field-option.controller.ts`
  - Service：`services/pooldata-field-whitelist.service.ts`（`getAvailableColumns` dialect-branch 範本）、option service
  - Entity：`pooldata_field_whitelist`、`pooldata_field_option`
  - customer_core schema：`apps/api/src/modules/etl/target-table-schemas.ts` + migration m301
- **前端程式定位**：`apps/web/src/api/pooldata-fields.ts`（新增 2 api fn）、`fields-tab.tsx`（進入點 1 核取清單）、`options-tab.tsx`（進入點 2 批次帶入 Modal）
- **架構決議**：AD-E07-46（待 system-architect 產出，§12）

## 10. 測試覆蓋目標

- 單元測試覆蓋率 ≥ 80%。
- 對應 US-178 TC-178-01 ~ TC-178-14：

| TC | 對應 AC | 驗證重點 |
|---|---|---|
| TC-178-01 | AC-1 | 新增欄位選 categorical → 核取清單全選 + 「偵測到 N 個可選值」 |
| TC-178-02 | AC-2 | 選 numeric → 不呼叫 distinct、無核取清單 |
| TC-178-03 | AC-3 / AC-5 | 取消勾選 2 個後儲存 → 僅建立 3 個勾選值（bulk `createdCount = 3`） |
| TC-178-04 | AC-4 | 全部取消勾選儲存 → 僅建立欄位、不呼叫 bulk、無可選值 |
| TC-178-05 | AC-7 | 既有 3 值、來源 8 distinct → 候選清單 5（`alreadyOption` 排除 3） |
| TC-178-06 | AC-8 | 勾選 4 個批次新增 → 列表即時刷新顯示 4 個啟用值 |
| TC-178-07 | AC-6 | customer_core 欄位（職業別）→ 從 `customer_core` 查 distinct（非 `ob_pool_data`） |
| TC-178-08 | AC-9 | 全部 distinct 已存在（全 `alreadyOption = true`）→「無新可選值可帶入」 |
| TC-178-09 | AC-11 | distinct > cap → `truncated = true`、`values` 僅 cap 筆、前端警告 |
| TC-178-10 | AC-12 | 來源表未就緒 → 503（`OBPOOLDATA_NOT_READY` / `CUSTOMER_CORE_NOT_READY`），非空白清單 |
| TC-178-11 | AC-13 | 查詢逾時 → 504 `DISTINCT_VALUES_QUERY_TIMEOUT` + 重試，非靜默空白 |
| TC-178-12 | AC-14 | 欄位全 NULL → 200 `values: []` 空狀態，與 503/504 區隔 |
| TC-178-13 | AC-15 | bulk 含已存在值 → 略過不報錯，回 `createdCount` / `skippedCount` |
| TC-178-14 | AC-17 | 處長無「從實際資料帶入可選值」按鈕；直接呼叫 `distinct-values` / `options/bulk` → 403 |

- **後端關鍵測試案例**：
  - `distinct-values` 來源表解析：白名單欄位（categorical，`data_source = ob_pool_data`）→ 查 ob_pool_data；白名單欄位（categorical，`data_source = customer_core`）→ 查 customer_core；欄位不存在於白名單 → 查 ob_pool_data + 全部 `alreadyOption = false`。
  - `distinct-values` 白名單存在但非 categorical → 400 `POOLDATA_OPTION_FIELD_TYPE_INVALID`。
  - `distinct-values` `columnName` 不符 regex → 400 `SOURCE_COLUMN_NAME_INVALID`；INFORMATION_SCHEMA 無此欄 → 404 `SOURCE_COLUMN_NOT_FOUND`。
  - `distinct-values` truncation：來源 distinct = CAP + 5 → `truncated = true`、`totalReturned = CAP`、`values.length = CAP`。
  - `distinct-values` 部長 → 200；Admin → 200；處長 / 課長 / 業務 → 403 `AUTH_FORBIDDEN`；flag off → 503 `FEATURE_NOT_ENABLED`。
  - `options/bulk` 全新值 → 全數建立、`display_order` 由 max+1 依輸入順序遞增、`createdCount = N` / `skippedCount = 0` + 單一彙總稽核。
  - `options/bulk` 含既有值（active / inactive 各一）→ 略過該值、其餘建立、不回 409、`skippedCount` 正確。
  - `options/bulk` 批次內重複值 → 首次建立、其餘略過。
  - `options/bulk` 欄位不存在 → 404 `POOLDATA_FIELD_NOT_FOUND`；非 categorical → 400；`options` 空 / 超 cap / 長度違反 → 422 `VALIDATION_ERROR`；處長 → 403。
  - `options/bulk` transaction：中途 DB 失敗 → 整批 rollback（無部分寫入）。
  - 稽核為單一彙總紀錄（含 `createdValues` / `createdCount` / `skippedCount`），非逐筆。
- **前端關鍵測試案例**：
  - 進入點 1：選 categorical 顯示核取清單全選；選 numeric / date 隱藏清單；儲存編排（建立欄位 → bulk）；bulk 失敗顯示非阻斷警告。
  - 進入點 2：categorical 欄位顯示「從實際資料帶入可選值」按鈕；numeric / date 無按鈕；處長無按鈕。
  - 四種非正常狀態（truncated 警告 / 503 未就緒 / 504 逾時＋重試 / 空狀態）各自明確呈現，皆非空白清單。
- **回歸**：F076 逐筆新增可選值流程（`POST .../options`）不受影響；`numeric` / `date` 欄位行為不變。

## 11. 實作 Checklist

- [ ] 後端 `distinct-values` 端點：來源表解析（data_source）+ `SAFE_COLUMN_NAME_RE` + INFORMATION_SCHEMA 存在性 + 就緒 503 + dialect-branch DISTINCT TOP CAP+1 + truncation + `alreadyOption` + 逾時 504
- [ ] 後端 `DISTINCT_VALUES_CAP` 具名常數（預設 200，env `POOLDATA_DISTINCT_VALUES_CAP` 可覆寫）
- [ ] 後端 `options/bulk` 端點：`BulkCreateOptionsDto` + 單一 transaction + `display_order` max+1 依序 + 冪等略過 + 單一彙總稽核
- [ ] 後端兩端點套 `DirectorGuard` + `FeatureFlagGuard('ENABLE_E07_REFACTOR_PHASE3')`
- [ ] error-handling.md#assignment-code-errors 新增 `SOURCE_COLUMN_NAME_INVALID`（400）/ `SOURCE_COLUMN_NOT_FOUND`（404）/ `CUSTOMER_CORE_NOT_READY`（503）/ `DISTINCT_VALUES_QUERY_TIMEOUT`（504）
- [ ] 前端 `api/pooldata-fields.ts` 新增 `getDistinctValues` / `createOptionsBulk`（型別 LOCAL，不進 `@cdmp/shared`）
- [ ] 前端 `fields-tab.tsx` 進入點 1 核取清單 + 儲存編排（建立欄位 → bulk）+ bulk 失敗非阻斷警告
- [ ] 前端 `options-tab.tsx` 進入點 2「從實際資料帶入可選值」按鈕 + 批次帶入 Modal（去重 / 全選 / 結果 toast）
- [ ] 前端四種非正常狀態呈現（truncated / 503 / 504＋重試 / 空狀態）皆非空白清單
- [ ] 圖表：`diagrams/F112-auto-suggest-flow.mmd`（兩進入點 sequence + distinct 查詢決策；本輪未建立，交後續 / ui-ux 或 architect 補）
- [ ] architect：AD-E07-46 落地 §12 OQ

## 12. 假設與待解決問題（Open Questions）

### 12.1 US-178 之 5 個 OQ 裁示（本 spec 已落規格）

| ID | 問題 | 本 spec 裁示 |
|----|------|-------------|
| OQ-178-01 | distinct 值上限精確門檻是否開放 Admin 調整，或程式碼常數固定？ | **以程式碼常數 `DISTINCT_VALUES_CAP` 固定，預設 200**；MAY 由環境變數 `POOLDATA_DISTINCT_VALUES_CAP` 覆寫（部署層），但**不開放 Admin UI 調整**（§5.0 / BR-5）。 |
| OQ-178-02 | 逾時精確秒數，另訂或沿用？ | **沿用既有 tedious `requestTimeout`**（約 15s），v1 **不**新增本功能專屬可調門檻；逾時須轉 504 `DISTINCT_VALUES_QUERY_TIMEOUT`（§5.0 / AC-13 / BR-11）。 |
| OQ-178-03 | 進入點 1「欄位建立成功但可選值批次建立失敗」之 UX 與復原？ | **兩次呼叫分步驟編排**（建立欄位 → bulk），**不**跨端點單一交易；欄位建立成功、bulk 失敗時欄位保留為有效狀態（允許零可選值），顯示非阻斷警告「欄位已建立，但可選值帶入失敗，請至『可選值管理』重試」（§5.3 / BR-9）。single transactional create-with-options 為架構選項（AD-E07-46），非預設契約。 |
| OQ-178-04 | 批次稽核逐筆 vs 彙總一筆？ | **一筆彙總紀錄**（`entity_id = columnName`、`details` 含 `createdValues` / `createdCount` / `skippedCount`），非逐筆（§5.2 / BR-13）。 |
| OQ-178-05 | 未來開放 Modal 新增 customer_core 欄位時是否同步支援進入點 1 偵測？ | **明確排除於本 Story（backlog）**；本 spec 進入點 1 僅 `ob_pool_data`，進入點 2 已支援 customer_core。 |

### 12.2 假設

| # | 假設 | 標記 |
|---|---|---|
| A-1 | **`customer_core` 無 TypeORM entity、PG / MSSQL-only**：`distinct-values` 對 customer_core 一律 raw SQL；SQLite 單元測試不建 customer_core，含 customer_core 之測試以 mock / `.mssql` / 真庫路徑驗證（沿用 F109 AD-E07-37 處置） | [ASSUMPTION] tdd 落地 |
| A-2 | **`display_order` append = max+1**：bulk 依 F076 既有 append 語意；若 F076 entity 無 `display_order` 之預設排序保證，system-architect 需確認（sort 順序不影響正確性，僅影響顯示） | [ASSUMPTION] 待 architect 確認 |
| A-3 | **INFORMATION_SCHEMA 可用性**：MSSQL 以 `INFORMATION_SCHEMA.COLUMNS` 確認欄位存在（`getAvailableColumns` 已用同機制）；SQLite 測試環境以 pragma / catch 降級為未就緒或測試種子 | [ASSUMPTION] 沿用 F075 範本 |
| A-4 | **cap 之查詢成本以 TOP cap + requestTimeout 界定**：不新增專屬索引；巨表（ob_pool_data 168 萬–780 萬列、customer_core 約 360 萬列）之 distinct 效能由 architect 於 AD-E07-46 評估是否需索引（呼應 CLAUDE.md ETL 生產規模原則 + Stage 0 逾時教訓） | [ASSUMPTION] 待 architect（OQ 見 §12.3） |

### 12.3 待架構師裁示（交 system-architect / AD-E07-46）

| ID | 問題 | spec-writer 建議預設 |
|----|------|---------------------|
| OQ-F112-01 | distinct 查詢對巨表（含 customer_core 約 360 萬列）之效能：是否需 `(column)` 索引或改抽樣估算？TOP cap + requestTimeout 是否足夠？ | 建議先以 TOP cap + requestTimeout 上線（cap 200 限制掃描回傳量）；若實測逾時頻繁再評估索引 / 抽樣（比照 F055/F056 抽樣估算路徑）。效能目標歸 NFR。 |
| OQ-F112-02 | HTTP status：逾時採 504、`ob_pool_data` / `customer_core` 未就緒採 503——是否與既有慣例（`STAGE0_ESTIMATE_TIMEOUT` = 500）統一？ | 建議本功能採語意化 504（逾時）/ 503（未就緒），與 `OBPOOLDATA_NOT_READY`（503）一致；最終 HTTP code 對齊由 architect 統一裁定。 |
| OQ-F112-03 | 是否提供單一 transactional「建立欄位＋可選值」端點取代進入點 1 之兩次呼叫編排（OQ-178-03 之架構替代方案）？ | 建議維持兩次呼叫編排（不改 `CreatePooldataFieldDto`）；若 architect 認為原子性必要再開單一端點，屬 AD-E07-46 範疇。 |

## 13. 變更紀錄

| 版本 | 日期 | 變更內容 |
|---|---|---|
| v1.0 | 2026-07-12 | 初版（US-178）：類別型篩選欄位可選值自動建議。新增 `GET /api/v1/pooldata-fields/:columnName/distinct-values`（來源表解析 by `data_source` + `SAFE_COLUMN_NAME_RE` + INFORMATION_SCHEMA 存在性 + 就緒 503 + dialect-branch DISTINCT TOP CAP+1 + truncation + `alreadyOption` 去重 + 逾時 504）與 `POST /api/v1/pooldata-fields/:columnName/options/bulk`（單一 transaction + `display_order` max+1 依序 + 冪等略過 + 單一彙總稽核）。兩進入點：F075 新增欄位 Modal（僅 ob_pool_data，儲存編排建立欄位→bulk）+ F076 可選值管理頁（ob_pool_data / customer_core，去重批次帶入）。18 AC / 14 TC 逐條落規格；US-178 5 個 OQ 全數裁示（cap 200 常數固定 / 沿用 tedious 逾時 / 兩次呼叫編排 + 非阻斷警告 / 稽核彙總一筆 / OQ-178-05 backlog）。新增 4 個 error code（`SOURCE_COLUMN_NAME_INVALID` 400 / `SOURCE_COLUMN_NOT_FOUND` 404 / `CUSTOMER_CORE_NOT_READY` 503 / `DISTINCT_VALUES_QUERY_TIMEOUT` 504）。3 個架構 OQ（OQ-F112-01~03）交 system-architect（AD-E07-46）。 |
