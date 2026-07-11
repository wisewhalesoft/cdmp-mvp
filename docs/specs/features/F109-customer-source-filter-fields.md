---
spec-id: F109
title: 新增「客戶資料」來源篩選欄位（customer_core 8 欄）
feature-id: F109
source-story: US-172
epic: E07
module: M06 篩選欄位
priority: P1
version: "1.0"
date: 2026-07-02
status: Draft
---

# F109: 新增「客戶資料」來源篩選欄位（customer_core 8 欄）

Priority: P1（Must Have / Phase 2 Advanced） | Status: Draft | Last Updated: 2026-07-02

> **v1.0（2026-07-02 / US-172 初版）**：於 F075 篩選欄位白名單引入第二個資料來源「客戶資料」（`customer_core`），新增 8 個篩選欄位（性別 / 年齡 / 職業別 / 教育程度 / 婚姻狀況 / 身分別 / 收入區間 / 居住城市），全部 `data_source = 'customer_core'`。核心設計：(1) 白名單新增 `data_source` 概念欄位（`'ob_pool_data'` | `'customer_core'`，既有 7 筆預設 `'ob_pool_data'`）+ API 回應暴露 `dataSource` + 白名單頁顯示「資料來源」欄 + 名單定義「新增條件」選單依來源分組；(2) 月名單分派 Stage 1 於名單引用任一 customer_core 欄位時，**條件式** LEFT JOIN `customer_core`（`ob_pool_data.custo_no = customer_core.source_customer_no`），未引用時不注入 JOIN；(3) LEFT JOIN 後客戶欄位 NULL（無對應客戶或客戶欄本身 NULL）→ 案件排除（等同 INNER JOIN 過濾效果）；(4) 2 個衍生欄（年齡以作業月份首日為基準即時計算實足年齡、居住城市取 `LEFT(cpost_city, 3)` 縣市級）；(5) 6 個 `_desc` 欄之 `option_value = customer_core 實際儲存中文值`（value = label），僅「性別」為 code→label。**邊界**：本 spec 為功能規格層；schema 型別 / migration / composer 簽名變更 / 衍生運算式 SQL 落點 / data_source 解析機制等架構決策交 system-architect（AD-E07-37），已於 §12 列為 Open Questions。

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| System Architect | 本文件 §5 / §6 / §12 + `F075` §5 / §6 + `data-model.md#field-whitelist-entity` + `apps/api/src/modules/assignment/stage1/stage1-query-composer.ts` + `stage1-sql-builder.ts` + `apps/api/src/modules/etl/target-table-schemas.ts`（customer_core） |
| TDD Developer | 本文件 + `F075` + `F076` + `data-model.md#field-whitelist-entity` + `data-model.md#categorical-field-value-entity` + AD-E07-37（架構師產出後） |
| QA / Tester | 本文件 §4 / §6 + `error-handling.md#assignment-list-errors` + `error-handling.md#assignment-run-warnings` |
| UI/UX Designer | 本文件 §7 + prototype `37-base-code.html` / `27a-list-create-draft.html` / `27b-list-edit-draft.html` |

---

## 對應 User Story

- 來源 Story：[US-172-M06-add-customer-source-filter-fields.md](../../stories/epics/E07-app-customer-list-assignment/US-172-M06-add-customer-source-filter-fields.md)（4 個 OQ 已於 §待解決問題裁示，本 spec 全數遵循）
- Epic：[E07 — 客戶名單分派](../../stories/epics/E07-app-customer-list-assignment/epic-brief.md)
- 模組：M06 篩選欄位

---

## 1. 功能摘要

F075 白名單現行全部欄位來自「案件資料」（`ob_pool_data`，ETL job E07-OBPOOLDATA-Load 產出）。F109 引入第二個資料來源「客戶資料」（`customer_core`，ETL job「ETL for Customer Core」產出），兩者透過 `ob_pool_data.custo_no = customer_core.source_customer_no` 關聯（此 JOIN key 已於 F100 / F103 計分流程使用並驗證，見 §11 交叉參照）。

**範圍**：

1. **白名單 `data_source` 概念**：`pooldata_field_whitelist` 新增 `data_source` 欄位，合法值 `'ob_pool_data'`（案件資料）/ `'customer_core'`（客戶資料）；既有 7 筆 seed 預設 `'ob_pool_data'`。API `GET /api/v1/pooldata-fields` 回應每筆暴露 `dataSource`。
2. **新增 8 個 `data_source = 'customer_core'` 篩選欄位**（全部 `is_active = true`、`is_system_fixed = false`）：性別、年齡、職業別、教育程度、婚姻狀況、身分別、收入區間、居住城市。
3. **F076 可選值 seed 延伸**：7 個 categorical 客戶欄位之可選值於首次部署自動 seed（性別 3 / 職業別 55 / 教育程度 8 / 婚姻狀況 5 / 身分別 4 / 收入區間 9 / 居住城市 22）。
4. **名單定義「新增條件」選單依來源分組**（案件資料 / 客戶資料兩群組，可跨群組選取並存）。
5. **月名單分派 Stage 1 條件式 LEFT JOIN customer_core + NULL 排除語意**（§6 核心 BR）；此語意於三個消費點一致：月名單分派 Stage 1、Stage 0 試算（F049）、名單試算 / 預覽。

**不在範圍**（交其他 agent / 後續）：
- 白名單 `data_source` 欄位型別、CHECK constraint、migration ordering、既有列 backfill：system-architect（AD-E07-37）。
- 月名單分派 Stage 1 條件式 JOIN 之 SQL 實作、composer 簽名變更、衍生運算式（AGE / LEFT3）落點與 PG↔JS 等價：system-architect + tdd-implementation。
- `customer_core` ETL job 本身之設計與觸發時序（本 spec 假設 `customer_core` 已具實值資料，見 §12 A-4）。
- 允許 Admin 自 UI 新增「任意」customer_core 欄位（本 spec 之 8 欄由 seed 建立；`available-columns` dropdown 維持 `ob_pool_data` 來源不變，見 §5.5 / OQ-F109-05）。

## 2. 使用者故事

**As a** 部長（Director）或 Admin
**I want** 在名單定義的篩選條件中，除現有「案件資料」欄位外，也能選用來自「客戶資料（customer_core）」的屬性欄位進行篩選
**So that** 能以客戶本身的基本屬性縮小或鎖定目標名單，而不限於案件特徵

## 3. 前置條件

- 使用者持 JWT 且 `business_role IN ('director', 'section_chief')` 或 admin；白名單 / 可選值寫入須 `business_role = 'director'` 或 admin（沿用 F075 / F076 §3）。
- F075（白名單，含 `data_source` 欄位支援）、F076（categorical 可選值管理）、F050 / F051（名單定義草稿篩選條件 UI）已部署。
- 系統首次部署已執行 F109 seed（8 個白名單欄位 + 7 個 categorical 欄位可選值），seed 為冪等操作。
- `customer_core` 已由 ETL 產出實值資料（空表為已知限制，見 §12 A-4 / OQ-172-04）。

## 4. 驗收標準

> 對應 US-172 AC-1 ~ AC-9 逐條；AC-11 為衍生之條件式 JOIN 觸發規則明確化。

### AC-1：白名單新增 8 個客戶資料欄位（F075 延伸）

- **Given** 系統完成 F109 部署 / seed
- **When** Admin 或部長進入 M06「篩選欄位」> Tab 1 查看白名單列表
- **Then** 列表含以下 8 個欄位（`is_active = true`、`is_system_fixed = false`、`data_source = 'customer_core'`）：
  - `gender`（性別，categorical）
  - `date_of_birth`（年齡，numeric）
  - `occupation_desc`（職業別，categorical）
  - `education_desc`（教育程度，categorical）
  - `marital_status_desc`（婚姻狀況，categorical）
  - `customer_type_desc`（身分別，categorical）
  - `monthly_income_desc`（收入區間，categorical）
  - `cpost_city`（居住城市，categorical）
- **And** 既有案件資料欄位（`prod_kind` / `case_status` / `best_case` 等）不受影響，`data_source = 'ob_pool_data'`

### AC-2：白名單列表顯示「資料來源」欄 + API 暴露 dataSource

- **Given** Admin 或部長進入 M06「篩選欄位」> Tab 1
- **When** 頁面載入白名單列表
- **Then** 表格含「資料來源」一欄；`ob_pool_data` 顯示「案件資料」、`customer_core` 顯示「客戶資料」
- **And** `GET /api/v1/pooldata-fields` 回應 `fields[]` 每筆含 `dataSource` 欄位（`'ob_pool_data'` | `'customer_core'`）；8 個新增欄位為 `'customer_core'`，既有 7 筆為 `'ob_pool_data'`

### AC-3：名單定義篩選條件選擇介面依來源分組

- **Given** 部長 / Admin 在建立（F050）或編輯（F051，草稿階段）名單定義之篩選條件區塊
- **When** 點擊「新增篩選欄位」開啟可選欄位清單
- **Then** 清單依 `dataSource` 分組呈現，至少含「案件資料」與「客戶資料」兩群組；8 個客戶欄位歸「客戶資料」群組
- **And** 使用者可跨群組選取，同一名單定義中「案件資料」與「客戶資料」篩選條件可並存（AND 邏輯，AC-10）
- **And** 分組排除規則沿用 F075 BR-16（`is_system_fixed = true` 之欄位不列入可選池，與資料來源分組正交）

### AC-4：客戶資料 categorical 欄位可維護可選值（F076 延伸）

- **Given** 7 個 `field_type = categorical` 客戶欄位（性別 / 職業別 / 教育程度 / 婚姻狀況 / 身分別 / 收入區間 / 居住城市）已建於白名單
- **When** Admin / 部長於 M06「篩選欄位」> Tab 2「可選值管理」進入該欄位之維護頁
- **Then** 可新增 / 停用 / 啟用可選值，行為與現有 F076 categorical 欄位完全一致（停用不回溯既有名單、月名單分派不阻擋）
- **And** 系統首次部署自動 seed 各欄位可選值（數量與內容見 §5.4），seed 為冪等

### AC-5：性別欄位 code→label 轉換

- **Given** 白名單「性別」欄位（`gender`，categorical）已 seed 可選值
- **When** Admin / 部長查看「性別」可選值列表
- **Then** 含 3 筆 `option_value`（code）→ `option_label`（label）：`1` → 男、`2` → 女、`3` → 法人
- **And** 名單定義多選元件顯示 `option_label`（男 / 女 / 法人），儲存時寫入 `option_value`（`1` / `2` / `3`）
- **And** label 可由 Admin 於可選值管理頁修改（走標準 F076 機制，OQ-172-03；無特殊限制）

### AC-6：年齡欄位為數值區間型，以作業月份首日為基準即時計算

- **Given** 白名單「年齡」欄位（`date_of_birth`，numeric）已啟用
- **When** 部長 / Admin 於名單定義表單選「年齡」為篩選欄位
- **Then** 表單元件顯示「最小年齡（min）」與「最大年齡（max）」兩個整數輸入框；max ≥ min，違反時前端顯示「最大年齡需大於等於最小年齡」且停用儲存
- **And** 月名單分派 Stage 1（與 Stage 0 試算）計算實足年齡時，**基準日 = 作業月份首日（`project_workym` 之月份第一日，即 `buildStage1Sql` 既有之 `workdt` 參數）**（OQ-172-01 已裁示）；實足年齡為基準日與 `date_of_birth` 之整年差（未達當年生日者不計入），再判斷是否落於 min–max（含界，`BETWEEN`）
- **And** 同一作業月重跑，年齡計算結果一致（決定性；不隨執行日漂移）

### AC-7：居住城市取縣市級（左 3 字），可選值為 22 個縣市

- **Given** 白名單「居住城市」欄位（`cpost_city`，categorical）已啟用
- **When** 月名單分派 Stage 1 執行居住城市過濾
- **Then** 系統取 `customer_core.cpost_city` 之**前 3 個字元**（`LEFT(cpost_city, 3)`）作為縣市代表，與名單條件所選縣市清單比對（`IN`）
  - 說明：`cpost_city` 實際儲存「縣市 + 區」（例：`臺北市中正區`），左 3 字即縣市（`臺北市`）
- **And** 名單定義「居住城市」多選元件之可選值為縣市層級 22 個選項（臺字形），由 F076 可選值管理維護（§5.4）
- **And** 若 `customer_core.cpost_city` 為 NULL，該案件視為不符合（被排除，適用 AC-8）

### AC-8：客戶資料 NULL 排除語意（LEFT JOIN NULL = 排除）

- **Given** 名單定義篩選條件含 ≥ 1 個「客戶資料」來源欄位（如「性別 IN [1]」）
- **When** 月名單分派 Stage 1 以 `ob_pool_data.custo_no = customer_core.source_customer_no` LEFT JOIN 串接後過濾
- **Then** 若案件之 `custo_no` 在 `customer_core` 無對應紀錄（LEFT JOIN 後客戶欄位為 NULL），該案件**被排除**
- **And** 若案件之客戶存在（JOIN 有結果）但目標客戶欄位本身為 NULL（如 `gender IS NULL`），該案件同樣**被排除**（NULL 不符合任何條件值）
- **And** 若名單定義**未設任何客戶資料篩選條件**（僅案件資料條件），則不觸發 NULL 排除語意，亦不注入 JOIN（AC-11）

### AC-9：客戶資料篩選欄位可停用，不回溯既有名單月名單分派

- **Given** 名單 `OB202607001` 篩選條件含「性別 IN [1]」；部長事後停用白名單「性別」欄位
- **When** 觸發月名單分派，Stage 1 讀取 `OB202607001` 之 `condition_payload`
- **Then** 月名單分派仍正確讀取固化之「性別 IN [1]」並過濾，不因欄位停用而失敗（沿用 F075 BR-4 不回溯）
- **And** 停用後之「性別」欄位不再出現於**新建**名單定義之可選欄位清單

### AC-10：案件資料與客戶資料篩選條件並存（AND 邏輯）

- **Given** 名單篩選條件含「`prod_kind` IN ['01']（案件資料）」**AND**「`gender` IN ['2']（客戶資料，女）」
- **When** 月名單分派 Stage 1 執行過濾
- **Then** 僅 `prod_kind = '01'` **且** `customer_core.gender = '2'` 之案件入選；任一條件不符合（含 NULL）均排除

### AC-11：條件式 JOIN 觸發規則（衍生明確化）

- **Given** 名單之 `condition_payload.conditions` 內 ≥ 1 個 condition 之 `columnName` 對應白名單 `data_source = 'customer_core'` 之欄位
- **When** Stage 1（月名單分派 / Stage 0 試算 / 試算預覽）組裝 SQL
- **Then** 查詢**必須**注入 `LEFT JOIN customer_core ON ob_pool_data.custo_no = customer_core.source_customer_no`（單一 JOIN，多個客戶條件共用）
- **And** 當名單無任何 customer_core 條件時，**不得**注入該 JOIN（既有純案件資料名單之行為與效能不變）
- **And** 條件之 `data_source` 判定須具決定性、且在白名單欄位事後停用後仍可正確判定（與 F075 BR-4 相容；判定機制由 system-architect 依 OQ-F109-01 決定）

## 5. 資料與欄位規格

### 5.1 白名單 `data_source` 概念欄位

`pooldata_field_whitelist` 新增概念欄位 `data_source`：

| 屬性 | 規格 |
|---|---|
| 合法值 | `'ob_pool_data'`（案件資料）/ `'customer_core'`（客戶資料） |
| 既有 7 筆 seed | 一律 `'ob_pool_data'`（backfill；F075 v1.7 seed：prod_kind / spec_tp / caseyear / settle_src / case_status / list_type / best_case） |
| 8 個新增欄位 | 一律 `'customer_core'` |
| API 暴露 | `GET /api/v1/pooldata-fields` 之 `fields[]` 每筆新增 `dataSource`（AC-2） |
| 前端驅動 | M06 列表「資料來源」欄 + F050 / F051「新增條件」選單分組（不 hardcode 欄位字串，依 `dataSource` 旗標渲染，比照 F075 v1.7 `isSystemFixed` 慣例） |

> schema 型別、CHECK constraint、NOT NULL / DEFAULT、既有列 backfill、migration ordering 由 system-architect 決定（OQ-F109-01）。data-model.md `#field-whitelist-entity` 已同步登錄本欄位概念（見本輪支援文件更新）。

### 5.2 8 個新增欄位規格

| # | 顯示名稱 | `column_name` | `field_type` | `data_source` | 取值 / 映射語意 |
|---|---------|---------------|--------------|---------------|----------------|
| 1 | 性別 | `gender` | categorical | customer_core | **code→label**：`option_value` = 代碼（1/2/3），`option_label` = 中文（男/女/法人）。唯一使用代碼者。 |
| 2 | 年齡 | `date_of_birth` | numeric | customer_core | **衍生欄（AGE）**：以作業月份首日為基準即時計算實足年齡，`BETWEEN` min–max（整數歲，含界）。見 §5.3。 |
| 3 | 職業別 | `occupation_desc` | categorical | customer_core | `option_value = option_label = customer_core 儲存中文值`（免對照表）；seed 55 筆。 |
| 4 | 教育程度 | `education_desc` | categorical | customer_core | 同上；seed 8 筆。 |
| 5 | 婚姻狀況 | `marital_status_desc` | categorical | customer_core | 同上；seed 5 筆。 |
| 6 | 身分別 | `customer_type_desc` | categorical | customer_core | 同上；seed 4 筆。 |
| 7 | 收入區間 | `monthly_income_desc` | categorical | customer_core | 同上（已級距）；seed 9 筆。 |
| 8 | 居住城市 | `cpost_city` | categorical | customer_core | **衍生欄（縣市級）**：查詢層取 `LEFT(cpost_city, 3)` 與所選縣市比對；`option_value = 縣市中文`（臺字形）；seed 22 縣市。見 §5.3。 |

**欄位存在性對齊**（避免 spec-schema gap）：以上 8 個 `column_name` 均存在於 `customer_core`（權威來源 `apps/api/src/modules/etl/target-table-schemas.ts` + migration m301 `1711360000301`）：
- `gender` VARCHAR(1)、`date_of_birth` DATE、`occupation_desc` VARCHAR(50)、`education_desc` VARCHAR(50)、`marital_status_desc` VARCHAR(50)、`customer_type_desc` VARCHAR(50)、`monthly_income_desc` VARCHAR(50)：屬 target-table-schemas.ts 定義之基礎欄位。
- `cpost_city` VARCHAR(20)：由 m301 新增（「通訊縣市」，儲存值為「縣市 + 區」如 `臺北市中正區`）。

> **性別欄位注意（OQ-F109-03）**：計分引擎（F104 / `scoring-decode.constants.ts`）之性別維度使用 m301 新增之 `cus_sex`（VARCHAR(2)，raw `'1'/'2'/'3'` 含髒值 `'C'/'D'/'8'` 等，計分 default 3）。US-172 指定篩選欄位使用 `gender`（VARCHAR(1)），本 spec 遵循 story。請 system-architect 確認 `customer_core.gender` distinct 值確為 `1/2/3` 且可直接 `IN` 比對；若 `gender` 欄實際為空 / 異編碼，是否改綁 `cus_sex`（見 §12 OQ-F109-03）。

### 5.3 衍生欄語意（決定性定義）

兩個 customer_core 欄位並非「直接欄位比較」，查詢層須以衍生運算式表達；本節定義**業務語意與決定性規則**，SQL / JS 實作與 PG↔JS 等價落點交架構師（OQ-F109-02）。

**(1) 年齡（`date_of_birth`，numeric）**
- 基準日 `baseDate` = 作業月份首日 = `project_workym + '01'`（即 `buildStage1Sql(list, workdt, ...)` 既有之 `workdt` 參數；OQ-172-01 裁示）。
- 實足年齡 `age` = `baseDate` 與 `date_of_birth` 之整年差；未達當年生日者不計（例：baseDate 2026-07-01、生日 1996-08-10 → age = 29）。
- 過濾條件：`age BETWEEN min AND max`（含界；min / max 為名單條件之整數歲數）。
- NULL 語意：`date_of_birth IS NULL` → `age` 無法計算 → 該案件不符合（排除，適用 §6.2）。**不得** COALESCE 為預設歲數（避免誤納）。
- 決定性：同一 `project_workym` 重跑，`baseDate` 不變 → 結果一致（供 F067 apples-to-apples 比對）。

**(2) 居住城市（`cpost_city`，categorical）**
- 過濾條件：`LEFT(customer_core.cpost_city, 3) IN (:...values)`（`values` = 名單條件所選縣市中文清單，臺字形）。
- NULL 語意：`cpost_city IS NULL` → `LEFT(...)` 為 NULL → 不符合 `IN`（排除，適用 §6.2）。
- 邊界值：dev 觀察之非標準縣市（釣魚臺 / 南海諸 / 空白）**不 seed**（OQ-172-02）；此類客戶因不落於 22 縣市選項而自然被相應條件排除，spec 不特別處理。

其餘 6 個 `_desc` 欄位（含 gender）為直接欄位比較（`customer_core.<col> IN (:...values)`；gender 之 values 為代碼 `1/2/3`），無衍生運算式。

### 5.4 F076 可選值 seed（7 個 categorical 客戶欄位）

首次部署自動 seed（`INSERT ... ON CONFLICT DO NOTHING`，冪等；沿用 F076 BR-8）。值取自 dev 環境 `customer_core` distinct 真實資料（prototype `37-base-code.html` 已列示）。

| `column_name` | 筆數 | `option_value` / `option_label` 規格 |
|---|---|---|
| `gender` | 3 | code→label：`1`/男、`2`/女、`3`/法人（AC-5；label 可 Admin 改，OQ-172-03） |
| `occupation_desc` | 55 | value = label = 中文職業別（示範：軍公教 / 教師 / 醫師 / 護理人員 / 工程師 / 會計師 / 律師 / 服務業 / 製造業 / 自營商 …；完整 55 種取自 dev distinct） |
| `education_desc` | 8 | value = label（**dev 實測 distinct，非臆造**）：高中 / 大學 / 專科 / 未定 / 國中 / 碩士 / 小學 / 博士 |
| `marital_status_desc` | 5 | value = label（**dev 實測 distinct**）：已婚 / 未婚 / 離婚 / 未定 / 同居 |
| `customer_type_desc` | 4 | value = label：個人 / 法人 / 外籍人士 / 虛擬車商編號 |
| `monthly_income_desc` | 9 | value = label（已級距）：20,000以下 / 20,001~30,000 / 30,001~40,000 / 40,001~50,000 / 50,001~60,000 / 60,001~70,000 / 70,001~80,000 / 80,001以上 / 未確定 |
| `cpost_city` | 22 | value = label = 縣市中文（**臺**字形）：臺北市 / 新北市 / 桃園市 / 臺中市 / 臺南市 / 高雄市 / 基隆市 / 新竹市 / 嘉義市 / 新竹縣 / 苗栗縣 / 彰化縣 / 南投縣 / 雲林縣 / 嘉義縣 / 屏東縣 / 宜蘭縣 / 花蓮縣 / 臺東縣 / 澎湖縣 / 金門縣 / 連江縣（OQ-172-02） |

> `date_of_birth`（年齡，numeric）無可選值，不 seed options。
> seed 之「值取自 dev distinct 真實資料」以確保 `option_value` 與 `customer_core` 實際儲存中文值完全一致（6 個 `_desc` 欄免對照表之前提）；system-architect / tdd 落地 migration 時須以 dev `SELECT DISTINCT` 校驗實際值集合（職業別 55 種尤須完整枚舉）。

### 5.5 API 影響

- **`GET /api/v1/pooldata-fields`**：`fields[]` 每筆新增 `dataSource`（`'ob_pool_data'` | `'customer_core'`）。沿用既有權限（`DirectorOrSectionChiefGuard`）。
- **`GET /api/v1/pooldata-fields/{columnName}/options`**：客戶 categorical 欄位沿用既有端點與行為（F076 §5.1）；無新增端點。
- **`GET /api/v1/pooldata-fields/available-columns`**（新增白名單欄位 dropdown 來源）：**本 spec 不變更**，仍回傳 `ob_pool_data` 既有但未列入白名單之欄位。8 個客戶欄位由 seed 建立，不經此 dropdown 新增。允許 Admin 自 UI 新增任意 customer_core 欄位屬本 spec 範圍外（OQ-F109-05）。
- **`POST /api/v1/pooldata-fields`**（新增白名單欄位）：若 system-architect 決定開放 `dataSource` 為可寫入欄位，須另定義；F109 不要求（seed-only）。

## 6. 業務規則

| 規則編號 | 說明 |
|---|---|
| BR-1 | **`data_source` 概念欄位**：`pooldata_field_whitelist` 新增 `data_source`（`'ob_pool_data'` | `'customer_core'`）；既有 7 筆 backfill `'ob_pool_data'`；8 個新增欄位 `'customer_core'`。API GET 暴露 `dataSource`（AC-2）。 |
| BR-2 | **條件式 JOIN 觸發（AC-11）**：Stage 1 組裝 SQL 時，若名單 `condition_payload` 含 ≥ 1 個 `data_source = 'customer_core'` 之 condition，**必須**注入單一 `LEFT JOIN customer_core cc ON ob_pool_data.custo_no = cc.source_customer_no`；否則**不得**注入（純案件資料名單行為 / 效能不變）。多個客戶條件共用同一 JOIN。 |
| BR-3 | **NULL 排除語意（核心，AC-8）**：LEFT JOIN 後，客戶欄位為 NULL（無對應客戶 or 客戶欄本身 NULL）之案件一律**排除**（等同 INNER JOIN 過濾效果）。實作上以 SQL NULL 三值邏輯自然達成（`cc.gender IN (...)` / `AGE BETWEEN ...` / `LEFT(cc.cpost_city,3) IN (...)` 對 NULL 均求值為 NULL/false → 案件被 WHERE 過濾）。**客戶條件欄位一律不得 COALESCE 為可匹配之預設值**（與 `buildStage1Sql` 對 `ob_pool_data` 欄位之 COALESCE JS-parity 策略相反——客戶欄的目標語意是「NULL = 排除」而非「NULL = 保留」）。 |
| BR-4 | **無客戶條件不觸發 NULL 排除（AC-8 第 3 點）**：名單未含任何 customer_core 條件時不注入 JOIN，故 `customer_core` 之任何 NULL 不影響案件入選。 |
| BR-5 | **年齡衍生語意（AC-6 / §5.3）**：基準日 = `project_workym` 月首日（`workdt`）；`age BETWEEN min AND max`（整數歲、含界）；`date_of_birth IS NULL` → 排除；決定性、同月重跑一致（OQ-172-01）。 |
| BR-6 | **居住城市衍生語意（AC-7 / §5.3）**：過濾以 `LEFT(cpost_city, 3) IN (values)`；`cpost_city IS NULL` → 排除；可選值為 22 縣市臺字形（OQ-172-02）。 |
| BR-7 | **6 個 `_desc` 欄 value=label（AC-4 / §5.4）**：`occupation_desc` / `education_desc` / `marital_status_desc` / `customer_type_desc` / `monthly_income_desc`（+ 衍生之 `cpost_city`）之 `option_value` = `customer_core` 實際儲存中文值 = `option_label`，免對照表；僅 `gender` 為 code→label。 |
| BR-8 | **AND 跨來源組合（AC-10）**：案件資料條件與客戶資料條件於 `condition_payload` 內以 AND 連接（沿用 F050 v2.1 BR-7 / composer `fragments.join(' AND ')`）；任一不符合（含 NULL）即排除。 |
| BR-9 | **停用不回溯（AC-9）**：沿用 F075 BR-4 / F076 BR-4。月名單分派 Stage 1 直接讀 `condition_payload`，不 join 白名單 / 可選值做有效性驗證；客戶欄位 / 可選值停用不中斷既有名單月名單分派。停用可選值若被既有名單引用，沿用 `WHITELIST_OPTION_INACTIVE` 警告（非阻擋）。 |
| BR-10 | **三處消費一致（§6.3）**：月名單分派 Stage 1、Stage 0 試算（F049）、名單試算 / 預覽三個消費點對 customer_core 條件之 JOIN 注入、衍生運算式、NULL 排除語意必須完全一致（沿用 I-RUN-EST-01「estimate ≡ run」精神；PG 下推路徑與 JS oracle 路徑須等價）。 |
| BR-11 | **`is_system_fixed` 正交**：8 個客戶欄位 `is_system_fixed = false`；F075 BR-16「系統固定欄位排除可選池」與 F109 之來源分組正交，兩者同時作用於 F050 / F051 dropdown 可選池計算。 |
| BR-12 | **seed 冪等**：白名單 8 欄與可選值 seed 均為冪等（沿用 F075 BR-9 / F076 BR-8 `ON CONFLICT DO NOTHING`）。 |

### 6.1 條件式 JOIN 觸發規則（詳述）

現行 Stage 1 SQL 之 FROM 固定為 `ob_pool_data o`（`stage1-sql-builder.ts:buildStage1Sql`），欄位篩選 fragment 由 `buildStage1WhereConditions`（`stage1-query-composer.ts`）產出，以 `"col" IN (...)` / `BETWEEN` 形式引用 `ob_pool_data` 欄位（單表無歧義）。

F109 要求：
1. Stage 1 須能對每個 condition 判定其 `data_source`（判定機制交架構師，OQ-F109-01）。
2. 若存在 ≥ 1 個 customer_core condition → 注入 `LEFT JOIN customer_core cc ON o.custo_no = cc.source_customer_no`，且客戶條件之 fragment 以 `cc.<col>`（或衍生運算式）引用；案件條件維持引用 `o.<col>`。
3. 否則不注入 JOIN，行為與現況完全相同。

> 此為架構層變更（composer / SQL builder 需支援 alias 與 data_source 分流、衍生運算式、composer 簽名可能需 `workdt` 以支援 AGE）。本 spec 僅定義觸發規則與語意；HOW 交 AD-E07-37（OQ-F109-01 / OQ-F109-02）。

### 6.2 NULL 排除語意（詳述）

- 「無對應客戶」：`o.custo_no` 在 `customer_core.source_customer_no` 無匹配 → LEFT JOIN 後 `cc.*` 全為 NULL → 客戶條件 fragment 求值為 NULL/false → WHERE 過濾 → 案件排除。
- 「客戶欄本身 NULL」：JOIN 有結果但 `cc.gender IS NULL`（或 `date_of_birth` / `cpost_city` NULL）→ 條件不符合 → 排除。
- 效果等同對客戶條件做 INNER JOIN 過濾。實作以自然 SQL NULL 語意達成，**不得對客戶條件欄位 COALESCE 為可匹配預設值**（BR-3）。
- JS oracle 路徑（非 PG / SQLite 測試，`stage1-filter-chain.ts`）須等價：對 LEFT JOIN 後之 plain object，客戶欄位為 `null`/`undefined` 時視為不符合（排除）。

### 6.3 三處消費一致

Stage 1 篩選核心之三個消費點（皆最終呼叫 `buildStage1WhereConditions` / `buildStage1Sql`）須一致套用 §6 語意：

| 消費點 | 進入點（現況） | 一致性要求 |
|---|---|---|
| 月名單分派 Stage 1 | `assignment-run-pipeline.service.ts` → `buildStage1Sql`（`INSERT … SELECT FROM ob_pool_data o`） | 注入 JOIN + 衍生運算式 + NULL 排除 |
| Stage 0 試算（F049） | `assignment-list/stage0-estimate.service.ts` → `buildStage1Sql`（`SELECT COUNT(*)`） | 同上；estimate ≡ run（I-RUN-EST-01） |
| 名單試算 / 預覽 | 名單建立 / 編輯之案件數預覽（若走 Stage 0 estimate / count 路徑） | 同上 |

> ⚠️ **AD-E07-37 取代本段 JS-oracle 等價要求**：架構師裁定 `customer_core` 為 **PG-only**（該表無 TypeORM entity、SQLite 測試庫不建立），customer_core 篩選以單一 `buildCustomerCoreClause` 產生 PG SQL fragment（AGE / LEFT3 / NULL 排除），**無獨立 JS-object oracle 實作**。三處消費點（月名單分派 / Stage0 試算 / preview）皆走 PG 下推，等價由「單一程式碼源」而非「兩份實作對拍」保證。含 customer_core 條件之測試一律 `.pg.spec.ts`；純案件資料名單之 SQLite chain 行為不變（regression guard）。

## 7. UI/UX 需求

> UI ground truth：prototype `37-base-code.html`（白名單頁）、`27a-list-create-draft.html`（名單建立）、`27b-list-edit-draft.html`（名單編輯）。視覺細節由 ui-ux-designer 決議；本節約束語意與結構。

### 7.1 M06 篩選欄位管理頁（Tab 1，F075 延伸）

- 列表新增「**資料來源**」欄（介於現有欄位間，位置對齊 prototype `37-base-code.html` L214），以 badge 呈現：`ob_pool_data` → 「案件資料」（灰）、`customer_core` → 「客戶資料」（綠）。依 `dataSource` 旗標渲染，不 hardcode 欄位字串。
- 工具列新增「資料來源」篩選 dropdown（全部 / 案件資料 / 客戶資料，對齊 prototype L191-193）。
- 8 個客戶欄位比照既有 categorical 欄位顯示「管理可選值」入口（`date_of_birth` 為 numeric 無此入口）。

### 7.2 Tab 2 可選值管理（F076 延伸）

- 7 個 categorical 客戶欄位以既有多欄位 accordion master 呈現（沿用 F076 v1.4.5）；性別顯示 code→label（`option_value` chip + `option_label`），其餘 `_desc` 欄 value = label。

### 7.3 名單定義「新增條件」選單（F050 / F051 草稿階段）

- 「新增篩選欄位」可選清單依 `dataSource` 分組（「案件資料」/「客戶資料」兩群組，對齊 prototype `27a` L638-667 / `27b`）；使用者可跨群組選取。
- 客戶欄位選中後之表單元件依 `field_type` 呈現（沿用 F075 AC-9 / F050）：
  - categorical（gender / 6 個 `_desc`）→ 多選（gender 顯示 label、存 code；其餘 value=label）。
  - numeric（年齡 `date_of_birth`）→ min / max 整數輸入，前端驗證 max ≥ min（AC-6）。
- `is_system_fixed = true` 欄位（best_case）沿用 F075 BR-16 排除，與來源分組正交。

## 8. 依賴關係

- **Blocked By**：
  - F075（白名單，需新增 `data_source` 欄位支援 + API 暴露 `dataSource`）
  - F076（categorical 可選值管理，8 個客戶欄位之可選值維護入口與 seed）
  - F050 / F051（名單定義草稿篩選條件 UI，需來源分組顯示）
- **Blocks / 影響**：
  - 月名單分派 Stage 1（US-081 相關）：需實作條件式 LEFT JOIN customer_core 與 NULL 排除語意（§6）
  - F049 Stage 0 試算：需同步套用 §6 語意（三處消費一致）
- **架構前置**：AD-E07-37（system-architect，落地 §12 Open Questions）

## 9. 交叉參照

- **資料模型**：[data-model.md#field-whitelist-entity](../data-model.md#field-whitelist-entity)（本輪新增 `data_source` 欄位概念）、[data-model.md#categorical-field-value-entity](../data-model.md#categorical-field-value-entity)
- **錯誤代碼**：[error-handling.md#assignment-list-errors](../error-handling.md#assignment-list-errors)、[error-handling.md#assignment-run-warnings](../error-handling.md#assignment-run-warnings)（審查結論見 §9.1）

### 9.1 錯誤處理審查（結論：無新錯誤碼）

檢視 `error-handling.md#assignment-errors` 既有錯誤碼，F109 無需新增：

| 情境 | 沿用錯誤碼 / 機制 | 說明 |
|---|---|---|
| 名單條件 `columnName` 不在白名單或已停用 | `CONDITION_COLUMN_NOT_IN_WHITELIST`（422） | 8 個客戶欄位加入白名單後即通過驗證；與案件欄位共用同一 service 層 defense-in-depth 校驗（F050 v2.1 BR-6），不因 `data_source` 不同而分流 |
| 名單條件引用之可選值已停用 | `WHITELIST_OPTION_INACTIVE`（警告，非阻擋） | 客戶 categorical 欄位之可選值停用沿用同一警告；月名單分派不阻擋（BR-9） |
| 年齡 min/max 驗證（max ≥ min） | 前端阻擋 + 既有 `VALIDATION_ERROR`（後端 DTO） | 沿用 F050 numeric 欄位表單驗證，無新碼；composer 對不完整 numeric range 以既有 `INCOMPLETE_NUMERIC_RANGE` warning 跳過 |
| `customer_core` 空表 | 不建前置檢查（OQ-172-04 已裁示） | 含客戶條件之名單結果為 0 筆（全數 NULL 排除），列為已知限制，不新增錯誤碼 |
| condition `columnName` 為一級保留欄位 | `RESERVED_FIELD_IN_CONDITIONS`（400） | 沿用；customer_core 欄位名不與保留欄位（`list_period_*` / `list_interval`）衝突 |
- **相關功能**：
  - [F075](F075-manage-pooldata-field-whitelist.md)（白名單 + `data_source` 延伸）
  - [F076](F076-manage-categorical-field-values.md)（可選值 seed 延伸）
  - [F050](F050-create-list-definition.md) / [F051](F051-edit-list-definition.md)（名單定義 condition_payload 消費 + 來源分組 UI）
- **customer_core 現行 schema**：`apps/api/src/modules/etl/target-table-schemas.ts` + migration `1711360000301`（m301，`cpost_city` 等 7 欄）
- **Stage 1 消費點程式碼**：`stage1-query-composer.ts`（`buildStage1WhereConditions`）、`stage1-sql-builder.ts`（`buildStage1Sql`，FROM 固定 `ob_pool_data o`）、`stage1-filter-chain.ts`（JS oracle）、`assignment-run-pipeline.service.ts`、`assignment-list/stage0-estimate.service.ts`
- **JOIN key 既有驗證**：F100 / F103 計分流程（`ob_pool_data.custo_no = customer_core.source_customer_no`）
- **圖表**：[diagrams/F109-customer-source-filter-flow.mmd](../diagrams/F109-customer-source-filter-flow.mmd)

## 10. 測試覆蓋目標

- 單元測試覆蓋率 ≥ 80%（沿用 DoD）。
- 對應 US-172 TC-172-01 ~ TC-172-10（逐條映射本 spec AC-1 ~ AC-11）：
  - 白名單列表顯示 8 欄 + 來源標籤（TC-172-01 / AC-1 / AC-2）
  - 名單定義來源分組（TC-172-02 / AC-3）
  - 性別 code→label（TC-172-03 / AC-5）
  - 年齡 numeric 區間驗證 max ≥ min（TC-172-04 / AC-6）
  - 居住城市 LEFT 3 縣市過濾（TC-172-05 / AC-7）
  - LEFT JOIN NULL 排除（無對應客戶，TC-172-06 / AC-8）
  - 客戶欄本身 NULL 排除（TC-172-07 / AC-8）
  - 無客戶條件時 NULL 不影響入選（TC-172-08 / AC-8 第 3 點 / AC-11 反向）
  - 客戶欄停用不中斷月名單分派（TC-172-09 / AC-9）
  - 案件 + 客戶 AND 邏輯（TC-172-10 / AC-10）
- **決定性 / 等價守門**（呼應三處消費一致 BR-10）：
  - 年齡以 `workdt`（作業月首日）為基準，同月重跑年齡結果一致
  - PG 下推路徑（`buildStage1Sql`）與 JS oracle 路徑（`stage1-filter-chain`）對含 customer_core 條件之名單，入選案件集合等價
  - 純案件資料名單（無 customer_core 條件）不注入 JOIN → 產出與 F109 前完全相同（regression guard）
- seed 冪等（白名單 8 欄 + 可選值 gender 3 / occupation 55 / education 8 / marital 5 / customer_type 4 / income 9 / city 22；重複 seed 不增列）

## 11. 實作 Checklist

- [ ] data-model.md `#field-whitelist-entity` 補 `data_source` 欄位（本輪已更新）
- [ ] F075 延伸：schema 新增 `data_source` + seed backfill 既有 7 筆 `'ob_pool_data'` + 8 個客戶欄位 `'customer_core'`（migration 由 architect owns）
- [ ] F075 API：`GET /api/v1/pooldata-fields` 回應暴露 `dataSource`
- [ ] F076 seed：7 個 categorical 客戶欄位可選值（值取自 dev distinct；職業別 55 種完整枚舉）
- [ ] Stage 1 composer / SQL builder：條件式 LEFT JOIN customer_core（AC-11 / BR-2）
- [ ] Stage 1：AGE 衍生運算式（基準 `workdt`）+ `cpost_city` LEFT 3 衍生運算式（§5.3 / BR-5 / BR-6）
- [ ] Stage 1：NULL 排除語意（客戶條件欄不 COALESCE，BR-3）；PG 下推與 JS oracle 等價
- [ ] 三處消費點一致（月名單分派 / Stage 0 試算 / 名單試算，BR-10）
- [ ] 前端 M06 列表「資料來源」欄 + 來源篩選 dropdown（依 `dataSource` 旗標）
- [ ] 前端 F050 / F051「新增條件」選單依來源分組
- [ ] 圖表：[diagrams/F109-customer-source-filter-flow.mmd](../diagrams/F109-customer-source-filter-flow.mmd)（本輪已建立）
- [ ] architect：AD-E07-37 落地 §12 Open Questions

## 12. 假設與待架構師裁示（Open Questions）

### 12.1 假設

| # | 假設 | 標記 |
|---|---|---|
| A-1 | **`data_source` schema 細節**：型別（VARCHAR）、CHECK constraint（限兩值）、NOT NULL / DEFAULT `'ob_pool_data'`、既有列 backfill、migration ordering 由 system-architect 決定 | [ASSUMPTION] 待 architect |
| A-2 | **8 欄由 seed / migration 建立**（非經 available-columns dropdown 新增）；`available-columns` 端點維持 `ob_pool_data` 來源不變 | [DECISION] F109 範圍 |
| A-3 | **6 個 `_desc` 欄 value=label 前提**：`customer_core` 儲存值即為中文描述（dev 已觀察）；seed 值須以 dev `SELECT DISTINCT` 校驗與實際儲存值完全一致，否則名單條件與月名單分派比對失配 | [ASSUMPTION] tdd 落地校驗 |
| A-4 | **`customer_core` 空表為已知限制**（OQ-172-04 裁示）：不建前置檢查；空表時含客戶條件之名單月名單分派結果為 0 筆（全數 NULL 排除）。dev/prod customer_core 皆有約 360 萬筆，空表實務不會發生 | [DECISION] OQ-172-04 |
| A-5 | **JOIN key 已驗證**：`ob_pool_data.custo_no = customer_core.source_customer_no` 於 F100 / F103 計分流程已使用；F109 沿用同一 key | [RESOLVED] |

### 12.2 Open Questions（交 system-architect / AD-E07-37）

| ID | 問題 | spec-writer 建議預設 |
|----|------|---------------------|
| OQ-F109-01 | **condition 之 `data_source` 判定機制**：Stage 1 需對每個 condition 判定是否 customer_core，且須與 F075 BR-4「Stage 1 不 join whitelist」相容、在白名單欄位事後停用後仍決定性。選項：(a) 寫入時將 `dataSource` 固化進 `condition_payload`（每個 condition 附 `dataSource`）；(b) runtime 查白名單；(c) 靜態 customer_core 欄位集常數。 | 建議 (a) 固化進 condition_payload（決定性最佳、免 runtime join、天然相容 BR-4）；(c) 可作為過渡。需 F050 / F051 寫入時填入 + 舊名單（condition_payload IS NULL / 無 dataSource）之 fallback 規則。 |
| OQ-F109-02 | **衍生運算式落點與 composer 簽名**：AGE 需 `workdt`（作業月首日）為基準；現行 `buildStage1WhereConditions(list)` 不接受 `workdt`（僅 `buildStage1Sql` 有）。AGE / LEFT3 衍生運算式應落在何處？PG 下推（`buildStage1Sql`）與 JS oracle（`stage1-filter-chain`）兩路徑如何保持等價？ | 建議 AGE / LEFT3 於 `buildStage1Sql` 針對 customer_core condition 特例組裝（PG：日期運算 / `LEFT(...)`），JS oracle 在 filter-chain 以等價 JS 計算；composer 簽名可能需擴充傳入 `workdt` 或改由 SQL builder 承接客戶條件。等價基準 = PG 下推。 |
| OQ-F109-03 | **「性別」實體欄位確認**：US-172 指定 `customer_core.gender`（VARCHAR(1)）；計分引擎（F104）使用 m301 之 `cus_sex`（VARCHAR(2)，raw `1/2/3` 含髒值）。請確認 `gender` distinct 值確為 `1/2/3` 且可直接 `IN` 比對；若 `gender` 欄空 / 異編碼，是否改綁 `cus_sex`。 | 建議先以 dev `SELECT DISTINCT gender` 驗證；若 `gender` 為 `1/2/3` 乾淨值則遵循 story 用 `gender`；否則升級為改綁 `cus_sex` 並回饋 spec-writer 更新 §5.2。 |
| OQ-F109-04 | **LEFT JOIN 效能 / 索引**：`customer_core` 約 360 萬筆，月名單分派 Stage 1 對含客戶條件之名單逐一 LEFT JOIN on `source_customer_no`。是否已有 `customer_core(source_customer_no)` 與 `ob_pool_data(custo_no)` 索引？是否需新增以避免月名單分派效能退化（呼應 CLAUDE.md ETL 生產規模原則 + 過往 Stage 0 逾時教訓）。 | 建議 architect 確認 / 補 `customer_core(source_customer_no)` 索引；效能目標歸 NFR，不在本 spec 硬性約束。 |
| OQ-F109-05 | **是否開放 UI 新增任意 customer_core 欄位**（`available-columns` 延伸至 customer_core + `POST` 帶 `dataSource`）？ | 建議 F109 維持 seed-only，dropdown 不變；未來若需求再開 spec 擴充。 |

## 13. 變更紀錄

| 版本 | 日期 | 變更內容 |
|---|---|---|
| v1.0 | 2026-07-02 | 初版（US-172）：白名單 `data_source` 概念（`ob_pool_data` / `customer_core`）+ API 暴露 `dataSource` + M06 列表來源欄 + 名單定義來源分組；新增 8 個 `data_source='customer_core'` 篩選欄位（性別 code→label / 年齡衍生 AGE 以 `project_workym` 月首日為基準 / 居住城市 `LEFT(cpost_city,3)` 縣市級 / 5 個 `_desc` value=label）；F076 seed 7 個 categorical 欄位可選值（3/55/8/5/4/9/22）；月名單分派 Stage 1 條件式 LEFT JOIN customer_core + NULL 排除語意（BR-2 / BR-3）+ 三處消費一致（BR-10）。4 個 US-172 OQ（年齡基準 / 城市 seed / 性別機制 / 空表限制）已裁示並落規格。5 個架構 Open Question（OQ-F109-01~05）交 system-architect（AD-E07-37）。 |
