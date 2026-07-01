---
last-updated: 2026-07-01
version: v1.0
change-summary: "v1.0 初版：F109 新增客戶資料來源篩選欄位（8 欄，customer_core），白名單顯示資料來源，名單定義來源分組 UI，NULL 排除語意。"
---

# US-172：新增「客戶資料」來源篩選欄位（F109）

> **Story ID**：US-172
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M06 篩選欄位
> **優先級**：Must Have
> **階段**：Phase 2（Advanced）
> **預估點數**：8

---

## User Story

**As a** 部長（Director）或 Admin
**I want** 在名單定義的篩選條件中，除了現有的「案件資料」欄位外，也能選用來自「客戶資料（customer_core）」的屬性欄位進行篩選
**So that** 能以客戶本身的基本屬性（性別、年齡、職業別、教育程度、婚姻狀況、身分別、收入區間、居住城市）縮小或鎖定目標名單，而不限於案件特徵

---

## 背景說明

現行系統的名單篩選欄位白名單（US-102，F075）全部來自「案件資料」（`ob_pool_data`，ETL job E07-OBPOOLDATA-Load 產出）。F109 引入第二個資料來源——「客戶資料」（`customer_core`，ETL job「ETL for Customer Core」產出），兩者透過 `ob_pool_data.custo_no = customer_core.source_customer_no` 關聯。

新增的 8 個客戶屬性篩選欄位均來自 `customer_core`，由月跑 Stage 1 以 LEFT JOIN 方式串接後過濾案件。當 LEFT JOIN 後客戶欄位為 NULL（即 `ob_pool_data` 中的案件在 `customer_core` 找不到對應客戶），該案件視為**不符合條件**，被排除出名單（與 INNER JOIN 過濾效果相同）。

**新增欄位清單（共 8 欄，全部 `data_source = 'customer_core'`）**：

| # | 顯示名稱 | 實際欄位 | 欄位類別（field_type） | 備註 |
|---|---------|----------|----------------------|------|
| 1 | 性別 | gender | categorical | code→label：1→男、2→女、3→法人 |
| 2 | 年齡 | date_of_birth | numeric | 由生日即時計算年齡，以 BETWEEN 最小值–最大值過濾 |
| 3 | 職業別 | occupation_desc | categorical | 已中文，55 種職業 |
| 4 | 教育程度 | education_desc | categorical | 已中文，8 種 |
| 5 | 婚姻狀況 | marital_status_desc | categorical | 已中文，5 種 |
| 6 | 身分別 | customer_type_desc | categorical | 已中文，4 種（個人/法人/外籍人士/虛擬車商編號） |
| 7 | 收入區間 | monthly_income_desc | categorical | 已級距，9 種 |
| 8 | 居住城市 | cpost_city（取左 3 字） | categorical | 縣市級 22 選項 |

以上 8 欄均為**一般使用者可選篩選欄位**（`is_system_fixed = false`），不同於 `best_case` 等系統固定欄位。

---

## 驗收標準

### AC-1：白名單新增 8 個客戶資料欄位（F075 延伸）

- **Given** 系統完成 F109 部署或 Admin 執行初始化腳本
- **When** Admin 或部長進入 M06「篩選欄位」> Tab 1「POOLDATA 篩選欄位」查看白名單列表
- **Then** 列表中包含以下 8 個客戶資料欄位（`is_active = true`），共可見於白名單：
  - 性別（`gender`，categorical）
  - 年齡（`date_of_birth`，numeric）
  - 職業別（`occupation_desc`，categorical）
  - 教育程度（`education_desc`，categorical）
  - 婚姻狀況（`marital_status_desc`，categorical）
  - 身分別（`customer_type_desc`，categorical）
  - 收入區間（`monthly_income_desc`，categorical）
  - 居住城市（`cpost_city`，categorical）
- **And** 上述 8 欄的 `is_system_fixed = false`（業務主管可停用，與 `best_case` 等系統固定欄位不同）
- **And** 既有的案件資料欄位（PROD_KIND、LIST_TYPE 等）不受影響，仍顯示於列表

### AC-2：白名單列表顯示「資料來源」欄

- **Given** Admin 或部長進入 M06「篩選欄位」> Tab 1
- **When** 頁面載入白名單列表
- **Then** 表格欄位包含「資料來源」一欄，顯示每個篩選欄位的來源標籤：
  - 來自 `ob_pool_data` 的欄位顯示「案件資料」
  - 來自 `customer_core` 的欄位顯示「客戶資料」
- **And** 8 個新增欄位均顯示「客戶資料」；既有 PROD_KIND / CASEYEAR 等欄位均顯示「案件資料」

### AC-3：名單定義篩選條件選擇介面顯示來源分組

- **Given** 部長或 Admin 在建立或編輯名單定義（US-106，草稿階段）的篩選條件區塊
- **When** 點擊「新增篩選欄位」，系統顯示可選欄位清單
- **Then** 可選欄位清單依資料來源分組呈現，至少分為「案件資料」與「客戶資料」兩個群組
- **And** 8 個客戶欄位歸屬「客戶資料」群組，現有案件欄位歸屬「案件資料」群組
- **And** 使用者可跨群組選取欄位，同一名單定義中「案件資料」與「客戶資料」的篩選條件可並存

### AC-4：客戶資料類別型欄位可維護可選值（F076 延伸）

- **Given** 7 個 `field_type = categorical` 的客戶欄位（性別、職業別、教育程度、婚姻狀況、身分別、收入區間、居住城市）已建立於白名單
- **When** Admin 或部長在 M06「篩選欄位」> Tab 2「可選值管理」進入該欄位的可選值維護頁
- **Then** 可新增、停用、啟用該欄位的可選值，行為與現有 US-103 categorical 欄位完全一致（停用值不回溯既有名單、月跑不受影響）
- **And** 系統初始化時自動 seed 各欄位的可選值（詳見備註），seed 為冪等操作

### AC-5：性別欄位 code→label 轉換

- **Given** 白名單中「性別」欄位（`gender`，categorical）已有可選值 seed
- **When** Admin 或部長查看「性別」的可選值列表
- **Then** 可選值清單包含以下 3 筆，`option_value`（code）對應 `option_label`（label）：
  - `1` → 男
  - `2` → 女
  - `3` → 法人
- **And** 名單定義篩選條件表單的多選元件顯示 `option_label`（男 / 女 / 法人），儲存時寫入 `option_value`（1 / 2 / 3）

### AC-6：年齡欄位為數值區間型，由生日即時計算

- **Given** 白名單中「年齡」欄位（`date_of_birth`，numeric）已啟用
- **When** 部長或 Admin 在名單定義表單選擇「年齡」作為篩選欄位
- **Then** 表單元件顯示「最小年齡（min）」與「最大年齡（max）」兩個整數輸入框
- **And** max 需 ≥ min，違反時前端顯示「最大年齡需大於等於最小年齡」，儲存停用
- **And** 月跑 Stage 1 執行過濾時，以執行當下日期計算每位客戶的實足年齡（年齡 = 執行日期 − date_of_birth，以年為單位取整），再判斷是否落在 min–max 之間
  > **注意**：年齡計算基準日的精確語意（執行當天 vs 月跑作業月份首日）列為 OQ-172-01，見本文末尾

### AC-7：居住城市取縣市級（左 3 字），可選值為 22 個縣市

- **Given** 白名單中「居住城市」欄位（`cpost_city`，categorical）已啟用
- **When** 月跑 Stage 1 執行居住城市過濾
- **Then** 系統取 `customer_core.cpost_city` 欄位的**前 3 個字元**（LEFT 3）作為縣市代表，並與名單條件中選定的縣市清單比對
- **And** 名單定義表單的「居住城市」多選元件，可選值為縣市層級的 22 個選項（如台北市、新北市、桃園市…），由 US-103 可選值管理維護
- **And** 若 `customer_core.cpost_city` 為 NULL，該案件視為不符合條件（被排除），適用 AC-8 的 NULL 排除語意

### AC-8：客戶資料 NULL 排除語意（LEFT JOIN NULL = 排除）

- **Given** 名單定義的篩選條件中含有至少一個「客戶資料」來源的欄位（如「性別 = 男」）
- **When** 月跑 Stage 1 執行該名單的案件過濾，以 `ob_pool_data.custo_no = customer_core.source_customer_no` LEFT JOIN 串接
- **Then** 若某筆 `ob_pool_data` 案件的 `custo_no` 在 `customer_core` 找不到對應紀錄（LEFT JOIN 後客戶欄位為 NULL），該案件**被排除**，不進入分派名單
- **And** 若某筆案件的客戶存在（JOIN 有結果），但目標客戶欄位本身為 NULL（例如 `gender IS NULL`），該案件同樣**被排除**（NULL 不視為符合任何條件值）
- **And** 若名單定義**未設定任何客戶資料篩選條件**（僅有案件資料條件），則不觸發此 NULL 排除語意，LEFT JOIN 結果中的 NULL 值不影響案件入選

### AC-9：客戶資料篩選欄位可停用，不回溯既有名單月跑

- **Given** 名單定義 LIST_NO `OB202607001` 的篩選條件包含「性別 IN [1]（男）」；部長事後將白名單中「性別」欄位停用
- **When** 觸發月跑（US-081），月跑 Stage 1 讀取 `OB202607001` 的篩選條件
- **Then** 月跑仍正確讀取 JSONB 中固化的「性別 IN [1]」條件並依此過濾，不因欄位停用而失敗
- **And** 停用後的「性別」欄位不再出現在**新建**名單定義的可選欄位清單中

---

## 本 Story 不含的範圍（留給 spec / architect / TDD）

- 白名單資料表的 schema 設計（`data_source` 欄位型別、FK 約束等）由 system-architect 決定
- 月跑 Stage 1 的 LEFT JOIN SQL 實作語意（JOIN key、NULL COALESCE 策略等）由 spec-writer 及 tdd-implementation 負責
- 居住城市 22 個縣市可選值的完整 seed 清單由 spec-writer 確認後維護於 US-103 seed
- 年齡計算的精確 SQL 實作（DATEDIFF / AGE 函式選用）由 tdd-implementation 依 OQ-172-01 裁示後決定
- `customer_core` ETL job（「ETL for Customer Core」）本身的設計與觸發時序，不屬本 story

---

## 技術備註

- 關聯鍵：`ob_pool_data.custo_no = customer_core.source_customer_no`；月跑以 LEFT JOIN 串接，NULL 語意見 AC-8
- `customer_core` 現有筆數：3,627,103 筆（dev 環境已查證，8 欄均有大量實值）
- 性別 distinct 值：`1`（男）/ `2`（女）/ `3`（法人）；身分別 4 種；婚姻 5 種；教育 8 種；收入 9 級距；職業 55 種；縣市 22 種
- 8 個客戶欄位在 US-102 白名單中新增 `data_source = 'customer_core'`（對比現有欄位 `data_source = 'ob_pool_data'`）；schema 變更由 system-architect 設計
- JSONB condition_payload 中，客戶欄位條件與案件欄位條件格式一致，差異僅在後端解析時依 `data_source` 決定 JOIN 策略

---

## 測試案例

### TC-172-01：白名單列表顯示 8 個客戶資料欄位及來源標籤

- **Given**：系統完成 F109 初始化 seed；部長帳號登入
- **When**：部長進入 M06「篩選欄位」> Tab 1
- **Then**：列表中出現 `gender`（性別）、`date_of_birth`（年齡）等 8 欄，「資料來源」欄均顯示「客戶資料」；PROD_KIND 等舊欄位顯示「案件資料」

### TC-172-02：名單定義篩選條件來源分組呈現

- **Given**：白名單中案件資料欄位 PROD_KIND 與客戶資料欄位 `gender` 均啟用；部長在建立名單定義
- **When**：點擊「新增篩選欄位」
- **Then**：彈出選擇清單分組顯示，「案件資料」群組含 PROD_KIND，「客戶資料」群組含性別；部長可跨群組選取

### TC-172-03：性別篩選欄位 code→label 正確對應

- **Given**：白名單中「性別」（categorical）已 seed 3 個可選值（1/男、2/女、3/法人）
- **When**：部長在名單定義表單選取「性別」欄位
- **Then**：多選元件顯示「男」「女」「法人」三個選項（顯示 label，不顯示 code）；勾選「男」儲存後，JSONB 中 `option_value = '1'`

### TC-172-04：年齡 numeric 區間驗證

- **Given**：部長在名單定義表單新增「年齡」篩選欄位
- **When**：輸入 min = 50、max = 30
- **Then**：前端顯示「最大年齡需大於等於最小年齡」，儲存按鈕停用

### TC-172-05：居住城市取縣市級（左 3 字）過濾

- **Given**：名單定義篩選條件含「居住城市 IN [台北市]」；`customer_core` 中某客戶 `cpost_city = '台北市大安區'`
- **When**：月跑 Stage 1 執行過濾
- **Then**：取 `cpost_city` 左 3 字 = '台北市'，符合「台北市」條件，該案件**不被排除**

### TC-172-06：LEFT JOIN NULL 排除語意（無對應客戶）

- **Given**：名單定義篩選條件含「性別 IN [1]（男）」；案件 A 的 `custo_no = 'C001'`，但 `customer_core` 中無 `source_customer_no = 'C001'` 的紀錄（LEFT JOIN 後 `gender = NULL`）
- **When**：月跑 Stage 1 執行過濾
- **Then**：案件 A **被排除**，不進入分派名單

### TC-172-07：客戶欄位本身 NULL 排除語意

- **Given**：名單定義篩選條件含「性別 IN [1]（男）」；案件 B 的客戶在 `customer_core` 有紀錄，但 `gender IS NULL`
- **When**：月跑 Stage 1 執行過濾
- **Then**：案件 B **被排除**（`gender IS NULL` 不符合 IN [1] 任何值）

### TC-172-08：無客戶條件時 NULL 不影響案件入選

- **Given**：名單定義篩選條件**僅含案件資料欄位**（如 PROD_KIND = '01'），未設任何客戶資料欄位
- **When**：月跑 Stage 1 執行過濾
- **Then**：案件入選不受 `customer_core` LEFT JOIN NULL 影響（客戶欄位 NULL 不觸發排除）

### TC-172-09：客戶欄位停用不中斷既有名單月跑

- **Given**：名單 `OB202607001` 篩選條件含「性別 IN [1]」；部長事後停用白名單「性別」欄位
- **When**：觸發月跑，月跑 Stage 1 讀取 `OB202607001` 的篩選條件
- **Then**：月跑仍以 JSONB 中固化的「性別 IN [1]」過濾 customer_core，月跑完成不報錯

### TC-172-10：案件資料與客戶資料篩選條件並存（AND 邏輯）

- **Given**：名單定義篩選條件含「PROD_KIND IN ['01']（案件資料）」**AND**「性別 IN [2]（客戶資料，女）」
- **When**：月跑 Stage 1 執行過濾
- **Then**：僅 PROD_KIND = '01' **且** `customer_core.gender = '2'` 的案件入選；任一條件不符合（含 NULL）均排除

---

## 依賴關係

- **Blocked By**：US-102（篩選欄位白名單基礎，需新增 `data_source` 欄位支援）、US-103（類別型欄位可選值管理，8 個客戶 categorical 欄位的可選值維護入口）、US-106（名單定義草稿篩選條件設定 UI，需支援來源分組顯示）
- **Blocks**：月跑 Stage 1 實作需對應處理 LEFT JOIN 與 NULL 排除語意（US-081 相關）

---

## 待解決問題

| ID | 問題 | 負責方 | 狀態 |
|----|------|--------|------|
| OQ-172-01 | 年齡計算基準日語意：月跑 Stage 1 計算客戶年齡時，應以「月跑執行當天」還是「作業月份的第一天（project_workym 的月份第一日）」為基準？兩者在跨月邊界的客戶可能導致不同結果。 | 業務主管 | ✅ 已裁示 2026-07-01：**以作業月份首日（project_workym 月份第一日）為基準**。理由＝同一作業月重跑結果一致（年齡不隨執行日漂移），具決定性，供 F067 apples-to-apples 比對。 |
| OQ-172-02 | 居住城市 22 個縣市可選值的 seed 清單：是否需要在系統首次部署時自動 seed 全部 22 個縣市名稱？若需要，請確認縣市名稱標準格式（例：「台北市」vs「臺北市」）。 | 業務主管 + Admin | ✅ 已裁示 2026-07-01：**首次部署自動 seed 22 縣市**；格式沿用 dev 真實資料的「**臺**」字形（臺北市/臺中市/臺南市/臺東縣…，非「台」）。邊界值（釣魚臺 10 筆／南海諸 5 筆／空白 767 筆）不 seed。 |
| OQ-172-03 | 性別 code→label 是否固定（1→男、2→女、3→法人）？還是允許 Admin 透過 US-103 可選值維護頁自訂 label？若允許，label 修改是否有業務限制？ | 業務主管 | ✅ 已裁示 2026-07-01：**走標準 F076 機制**，seed 預設 1→男／2→女／3→法人，Admin 可透過可選值管理頁修改 label（與其他 categorical 欄一致，無特殊限制）。 |
| OQ-172-04 | 若 `customer_core` ETL 尚未執行（`customer_core` 表為空），而名單定義含客戶篩選條件，月跑結果將為 0 筆（因所有案件 LEFT JOIN 後均為 NULL 排除）。是否需要在月跑執行前加入前置檢查，偵測 `customer_core` 無資料時給予業務警告？ | 業務主管 + system-architect | ✅ 已裁示 2026-07-01：**列為已知限制，不建前置檢查**（F109 範圍外）。理由＝dev/prod customer_core 皆有 360 萬筆，空表實務不會發生；保持範圍精簡，僅於 spec 註記此限制。 |

---

## Definition of Done

- [ ] 驗收標準全部通過
- [ ] 白名單列表顯示 8 個客戶欄位及「資料來源」欄（TC-172-01）
- [ ] 來源分組 UI 測試通過（TC-172-02）
- [ ] 性別 code→label 對應測試通過（TC-172-03）
- [ ] 年齡區間驗證測試通過（TC-172-04）
- [ ] 居住城市左 3 字縣市過濾測試通過（TC-172-05）
- [ ] LEFT JOIN NULL 排除（無對應客戶）測試通過（TC-172-06）
- [ ] 客戶欄位本身 NULL 排除測試通過（TC-172-07）
- [ ] 無客戶條件時 NULL 不影響入選測試通過（TC-172-08）
- [ ] 客戶欄位停用不中斷月跑測試通過（TC-172-09）
- [ ] 案件 + 客戶條件並存 AND 邏輯測試通過（TC-172-10）
- [ ] 單元測試覆蓋率 ≥ 80%
- [ ] Code review 通過
- [ ] 文件已更新

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **延伸 Stories**：US-102（篩選欄位白名單，需新增 `data_source` 支援）、US-103（類別型欄位可選值管理，客戶欄位可選值維護入口）、US-106（名單定義草稿篩選條件 UI，需來源分組）、US-081（月跑 Stage 1，需實作 LEFT JOIN customer_core 與 NULL 排除語意）
- **資料來源 ETL**：E07-OBPOOLDATA-Load（案件資料）、ETL for Customer Core（客戶資料，`customer_core` 表）
- **關聯鍵**：`ob_pool_data.custo_no = customer_core.source_customer_no`
