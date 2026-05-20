---
last-updated: 2026-05-19
version: v2.1-refactor
change-summary: "v2.1 修改：AC-5 類別型欄位選項來源改為 pooldata_field_option（移除 ob_code_df 依賴）；新增 AC-12（condition_payload 必填驗證）；新增 AC-13（columnName 白名單驗證）；依賴關係補 US-121/US-125。GAP 覆蓋：A1、A2、A3、A4、A5、B1~B3、F4。"
---

# US-106：草稿階段建立名單與篩選條件

> **Story ID**：US-106
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M01 名單定義
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：8

---

## User Story

**As a** 部長（Director）或 Admin
**I want** 在草稿階段建立一份名單定義，並透過白名單驅動的動態篩選條件設定名單的 OBPOOLDATA 篩選邏輯
**So that** 名單的篩選欄位可由業務主管自行管理（不需 IT 維護 SP），條件之間以 AND 邏輯組合，動態反映 US-102 白名單的最新內容

---

## 背景說明

本 Story 取代已廢棄的 US-088 / US-089，是名單定義五階段流程（US-105）的起點。

**主要差異（相較於 US-088 舊設計）**：
1. **Actor 收斂**：建立名單限 **部長 + Admin**（US-088 為業務主管含處長）
2. **篩選條件動態化**：篩選欄位來源改為 US-102 白名單（非 SP 硬編碼）
3. **條件組合規則**：所有欄位條件之間為 AND 邏輯（每個欄位的值為 OR / IN 語意，多個欄位之間 AND）
4. **欄位元件**：數值型欄位用區間（min/max），類別型欄位用多選，日期型欄位用日期範圍
5. **草稿狀態**：建立後名單狀態為 `stage = 'draft'`，可繼續修改篩選條件，直到推進至下一階段

---

## 驗收標準

### AC-1：部長 / Admin 在目前作業月份建立草稿名單

- **Given** 部長或 Admin 在 M01 名單定義清單頁（US-105）點擊「建立名單」
- **When** 系統開啟建立表單
- **Then** 顯示建立表單，含以下基本欄位：
  - 名單名稱（LIST_NM，必填，max 45 字）
  - 作業月份（PROJECT_WORKYM，預填目前作業月份，唯讀）
- **And** 表單初始狀態下篩選條件區塊為空（等待使用者選取欄位並設定條件）
- **And** 處長帳號進入清單頁時，**不顯示「建立名單」按鈕**

### AC-2：LIST_NO 自動產生

- **Given** 部長或 Admin 填妥表單並點擊「儲存」，前端驗證通過
- **When** 後端處理新增請求
- **Then** 系統依格式 `OB{YYYYMM}{NNN}` 自動產生 LIST_NO，共 11 碼（OB + 年月 + 三位流水號）
- **And** 新產生的 LIST_NO 不與現有任何 LIST_NO 重複
- **And** 名單初始 `stage = 'draft'`

### AC-3：篩選條件欄位來源為 US-102 白名單

- **Given** 部長或 Admin 在建立表單的「篩選條件」區塊操作
- **When** 點擊「新增篩選欄位」
- **Then** 系統顯示可選欄位清單，來源為 US-102 白名單中 `is_active = true` 的欄位
- **And** 清單顯示每個欄位的 `display_name`（中文標籤），不顯示原始 `column_name`
- **And** 已停用的白名單欄位（`is_active = false`）不出現在可選清單中

### AC-4：數值型欄位顯示區間輸入元件

- **Given** 部長或 Admin 選取白名單中 `field_type = numeric` 的欄位（例如 MONTH_CNT）
- **When** 欄位被加入篩選條件區塊
- **Then** 顯示「最小值（min）」與「最大值（max）」兩個數字輸入框
- **And** max 需 ≥ min，違反時前端提示錯誤「最大值需大於等於最小值」

### AC-5：類別型欄位顯示多選元件

~~（v1.0 原文）選項來源為 US-103 中該欄位 is_active = true 的可選值。~~

**（v2.1 修改）**

- **Given** 部長或 Admin 選取白名單中 `field_type = categorical` 的欄位（例如 PROD_KIND、caseyear、case_status）
- **When** 欄位被加入篩選條件區塊
- **Then** 顯示多選清單，選項來源為 **`pooldata_field_option`**（US-103 維護），該欄位 `is_active = true` 的可選值；**不讀取 `ob_code_df`**
- **And** 選項顯示 `option_label`，送出時儲存 `option_value`
- **And** 至少選取一個值方可儲存
- **And** caseyear 選項顯示 8 筆（`0`~`6` + `99`），case_status 選項顯示 4 筆（01~04），均動態載入，不 hardcode

> **業務意義（A4/A5/F3/F4）**：caseyear 與 case_status 選項來源改為 pooldata_field_option，與 PROD_KIND / SPEC_TP 等欄位統一管理方式。

### AC-6：條件之間 AND 邏輯

- **Given** 部長或 Admin 已新增多個篩選條件欄位（例如 PROD_KIND + SPEC_TP + SETTLE_SRC）
- **When** 儲存名單定義
- **Then** 系統將多個條件以 AND 方式組合（即案件必須同時符合所有欄位條件才入選）
- **And** 每個欄位的多選值之間為 OR（IN）語意（例如 PROD_KIND IN ('01', '02') = 汽車或機車均可入選）

### AC-7：草稿階段可修改篩選條件

- **Given** 名單定義 `stage = 'draft'` 已建立
- **When** 部長或 Admin 在清單頁點擊該名單的「編輯」
- **Then** 可修改名單名稱（LIST_NM）與所有篩選條件欄位（增加、刪除、修改值）
- **And** 修改後儲存，stage 維持 'draft'，不推進至下一階段

### AC-8：月跑執行中禁止建立

- **Given** 目前有 AssignmentRun status = 'running' 的月跑
- **When** 部長或 Admin 嘗試點擊「建立名單」按鈕
- **Then** 按鈕為停用狀態，hover 顯示提示「分派執行中，無法建立名單定義」

### AC-9：LIST_NO 999 上限處理

- **Given** 當前作業月份已有 999 筆名單定義（流水號耗盡）
- **When** 部長或 Admin 嘗試建立新名單
- **Then** 後端回 422（error_code: `LIST_NO_LIMIT_EXCEEDED`）；前端顯示友善錯誤訊息

### AC-10：從上月名單複製篩選條件（OQ-D-01 決議）

- **Given** 部長或 Admin 在草稿階段點擊「建立名單」，進入建立表單
- **When** 點擊「從上月名單複製」按鈕
- **Then** 系統顯示上個作業月份所有**非停用**的名單清單（LIST_NM + LIST_NO），供使用者選取
- **And** 使用者選取某份上月名單後，建立表單自動填入該名單的**篩選條件**（JSONB 複製）
- **And** **比例資料（部門比例 / 人員比例）不隨複製，預設為空**
- **And** **CR 回分開關恢復為「啟用」（預設開）**，不沿用上月設定
- **And** 使用者可在複製後對篩選條件進行修改，再行儲存
- **And** 若上個作業月份無任何非停用名單，「從上月名單複製」按鈕顯示為停用，hover 提示「上月無可複製的名單」

> **注意**：「從上月名單複製」為**可選輔助操作**，不強制；使用者亦可直接手動填寫篩選條件。

### AC-11：篩選條件儲存格式

- **Given** 部長或 Admin 設定篩選條件後儲存
- **When** 後端寫入資料
- **Then** 篩選條件以 JSONB 格式儲存於 `ob_list_definition` 對應欄位（格式由 system-architect 設計）
- **And** 每個條件包含 `column_name`、`field_type`、`values`（類別型）或 `min`/`max`（數值型）

### AC-12：condition_payload 必填驗證（v2.1 新增）

> **涵蓋 GAP**：A1、A2、B2、G2（condition_payload 為 source of truth；5 個固定欄不再必填）

- **Given** 部長或 Admin 在建立或編輯草稿名單表單中點擊「儲存」
- **When** 篩選條件區塊未新增任何條件（conditions 陣列為空）
- **Then** 前端顯示錯誤提示「請至少設定一個篩選條件」，儲存不執行
- **And** 後端額外驗證：若 condition_payload.conditions 為空，回傳 422，錯誤訊息「篩選條件不得為空，請至少設定一個欄位」（詳見 US-121 AC-1）
- **And** 本 AC 取代舊設計的「9 個固定欄位必填」語意；名單的 PROD_KIND / CASEYEAR / SPEC_TP / SETTLE_SRC / CASE_STATUS 欄位由後端依 condition_payload 衍生，前端不需個別驗證這 5 個欄位

### AC-13：篩選條件 columnName 白名單驗證（v2.1 新增）

> **涵蓋 GAP**：A3、B2、B3（columnName 必須在 whitelist active 集合）

- **Given** 部長或 Admin 設定篩選條件後儲存
- **When** 前端送出 condition_payload
- **Then** 前端在送出前，以本地白名單快取確認所有 `columnName` 均來自 `is_active = true` 的欄位（前端 dropdown 來源即為白名單，正常操作下不會發生違規）
- **And** 後端額外驗證（defense-in-depth）：若任一 `columnName` 不在白名單啟用集合，回傳 422，`error_code: CONDITION_COLUMN_NOT_IN_WHITELIST`（詳見 US-121 AC-2）

---

## 技術備註

- 本 Story 取代 US-088 / US-089（已廢棄），篩選條件欄位改為動態白名單來源，而非 OBMCODEDF 硬編碼
- 篩選條件 JSONB 格式範例（由 system-architect 決定最終 schema）：
  ```json
  {
    "conditions": [
      { "column_name": "PROD_KIND", "field_type": "categorical", "values": ["01", "02"] },
      { "column_name": "MONTH_CNT", "field_type": "numeric", "min": 1, "max": 6 }
    ],
    "logic": "AND"
  }
  ```
- 月跑 Stage 1 讀取名單條件時，直接讀取 JSONB，不 join 白名單（停用欄位不影響既有名單月跑，與 US-102 AC-8 一致）
- LIST_NO 產生機制：後端依當月 YYYYMM 查詢最大既有流水號後 +1；若無既有，從 001 開始（999 為上限，超過回 422）
- 操作寫入 AssignmentAuditLog（action = 'CREATE'，entity_type = 'list_definition'）
- **「從上月名單複製」實作（OQ-D-01）**：後端提供「取上月非停用名單清單」API（依 `project_workym = current_work_ym - 1 month`，`status != 'disabled'` 過濾）；前端選取後呼叫「讀取指定 LIST_NO 之篩選條件 JSONB」API，填入建立表單；**比例相關欄位不複製**；CR 回分開關預設為啟用（`cr_enabled = true`）

---

## 測試案例

### TC-106-01：正常建立草稿名單（多篩選條件）

- **Given**：部長帳號；白名單有 PROD_KIND（categorical）、MONTH_CNT（numeric）兩個啟用欄位
- **When**：部長建立名單，LIST_NM = 「機車月跑名單」，條件：PROD_KIND IN ['02']、MONTH_CNT min=1 max=6，點擊「儲存」
- **Then**：名單以 LIST_NO = 'OB202506001'、stage = 'draft' 寫入；篩選條件以 JSONB 儲存；成功提示顯示 LIST_NO

### TC-106-02：處長無法建立名單

- **Given**：帳號持有「處長」角色
- **When**：進入 M01 清單頁
- **Then**：無「建立名單」按鈕；若直接呼叫建立 API，後端回 403

### TC-106-03：選取停用的白名單欄位不出現

- **Given**：白名單中 SETTLE_SRC 欄位 is_active = false
- **When**：部長在建立表單點擊「新增篩選欄位」
- **Then**：SETTLE_SRC 不出現在可選清單中

### TC-106-04：數值型欄位 max < min 被阻擋

- **Given**：部長新增 MONTH_CNT 篩選條件
- **When**：輸入 min = 6、max = 3
- **Then**：前端顯示「最大值需大於等於最小值」，儲存按鈕停用

### TC-106-05：類別型欄位不選值被阻擋

- **Given**：部長新增 PROD_KIND 篩選條件，但未勾選任何可選值
- **When**：點擊「儲存」
- **Then**：前端顯示「PROD_KIND 至少需選取一個可選值」，儲存不執行

### TC-106-06：草稿階段可修改篩選條件

- **Given**：LIST_NO = 'OB202506001'，stage = 'draft'
- **When**：部長點擊「編輯」，修改 PROD_KIND 加入 '01'，儲存
- **Then**：JSONB 更新為 PROD_KIND IN ['01', '02']；stage 仍為 'draft'

### TC-106-07：月跑中禁止建立

- **Given**：AssignmentRun status = 'running'
- **When**：部長嘗試點擊「建立名單」
- **Then**：按鈕停用，顯示「分派執行中，無法建立名單定義」

### TC-106-08：從上月名單複製篩選條件（OQ-D-01）

- **Given**：目前作業月份 202507；上月（202506）有 2 份非停用名單（LIST_NO = 'OB202506001' / 'OB202506002'，各有不同篩選條件 JSONB）
- **When**：部長在建立表單點擊「從上月名單複製」，選取 'OB202506001'
- **Then**：建立表單的篩選條件欄位自動填入 'OB202506001' 的篩選條件 JSONB；CR 回分開關為「啟用」（不管 'OB202506001' 上月的設定）；比例資料欄位為空

### TC-106-09：上月無可複製名單時按鈕停用

- **Given**：目前作業月份 202507；上月（202506）無任何非停用名單（全部已停用或無名單）
- **When**：部長在建立表單查看「從上月名單複製」按鈕
- **Then**：按鈕為停用狀態，hover 顯示「上月無可複製的名單」

---

## 依賴關係

- **Blocked By**：US-105（五階段總覽，建立入口在清單頁）、US-102（白名單欄位，篩選條件選項來源）、US-103（可選值，類別型欄位多選選項）、US-100（部長角色定義，確立建立操作權限）、**US-121（condition_payload 驗證規則，AC-12/AC-13 依賴）**、**US-125（caseyear / case_status 選項來源就緒，AC-5 依賴）**
- **Blocks**：US-107（per-LIST_NO CR 回分開關，需先有草稿名單）、US-108（推進至部門比例設定，需先有草稿名單）、US-090（停用，草稿名單才可停用）

---

## Definition of Done

- [ ] 驗收標準全部通過
- [ ] LIST_NO 自動產生測試
- [ ] 白名單欄位動態載入測試
- [ ] 數值型欄位區間驗證測試（TC-106-04）
- [ ] 類別型欄位至少選一驗證測試（TC-106-05）
- [ ] 草稿可修改測試（TC-106-06）
- [ ] 處長被拒測試（TC-106-02）
- [ ] 月跑中鎖定測試（TC-106-07）
- [ ] JSONB 儲存格式驗證
- [ ] AssignmentAuditLog 寫入測試
- [ ] 從上月名單複製篩選條件測試（TC-106-08）
- [ ] 上月無名單時複製按鈕停用測試（TC-106-09）
- [ ] 單元測試覆蓋率 ≥ 80%
- [ ] Code review 通過
- [ ] 文件已更新

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **取代**：US-088（已廢棄）、US-089（已廢棄）
- **相關 Stories**：US-105（五階段總覽與清單入口）、US-102（白名單欄位）、US-103（類別型可選值）、US-107（CR 回分開關）、US-108（推進至部門比例）、US-090（停用草稿名單）、US-100（部長角色定義）、US-121（condition_payload 驗證規則，v2.1）、US-125（caseyear / case_status 選項遷移，v2.1）
- **GAP-LIST**：`docs/specs/implementation-log/F050-v2.1-refactor-gap-list.md`（A1、A2、A3、A4、A5、B1~B3、F4）
