---
last-updated: 2026-05-19
version: v2.1-refactor
change-summary: "v2.1 修改：模組名稱「代碼維護」→「篩選欄位」；AC-3 Seed 補 caseyear 8 筆（J5 拍板）+ case_status 4 筆，移除 ob_code_df 依賴描述；新增 AC-11（不回溯規則延伸至 caseyear / case_status）。GAP 覆蓋：A4、A5、E4、E5、E6、J5。"
---

# US-103：管理類別型欄位的可選值

> **Story ID**：US-103
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：~~M06 代碼維護（進階）~~ **M06 篩選欄位（v2.1 rename）**
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：5

---

## User Story

**As a** 部長（Director）或 Admin
**I want** 為白名單中「類別型（categorical）」欄位維護可選值清單，並能停用特定值
**So that** 名單定義表單的多選元件只呈現有效可選值，無效或作廢的選項不再出現，且管理者無需 IT 協助即可自行管理

---

## 背景說明

US-102 定義了 OBPOOLDATA 篩選欄位白名單，其中 `field_type = categorical` 的欄位（例如 PROD_KIND、SPEC_TP、CASEYEAR、SETTLE_SRC、LIST_TYPE、BEST_CASE 等）需要維護一份可選值列表，供新名單定義表單的多選元件使用。

**操作權限（OQ-103-01 已解決）**：
- **可寫入（新增 / 停用 / 啟用可選值）**：**部長 + Admin** 專屬
- **唯讀查看**：處長可進入頁面查看，但無任何編輯操作按鈕

**核心語意**：
- 每個 categorical 欄位（`column_name`）對應多個可選值（`option_value`），並附帶顯示標籤（`option_label`）
- **停用的可選值「不回溯」既有名單條件**：已在現有名單定義中選取某值的條件，即使該值後來被停用，仍維持原有設定不變，月名單分派讀取時也不因停用而失敗

---

## 初始 Seed 清單（源自現行 SP 與 OBMCODEDF）

依據 `reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st1_list.sql` 及 OBMCODEDF 既有代碼，以下為各 categorical 欄位的初始可選值 seed（供 Admin 在系統首次部署時一次性確認）：

| 欄位 | 初始可選值（`option_value` = `option_label`） | 備註 |
|------|---------------------------------------------|------|
| PROD_KIND | 01 = 汽車新車、02 = 機車、03 = 其他商品（依 OBMCODEDF 及 SP 中文備註） | SP 備註：01 汽車新車 / 02 機車 / 03 其他商品 |
| LIST_TYPE | 01 = 期中、02 = 中結、03 = 滿期 | SP 備註：01 期中 / 02 中結 / 03 滿期 |
| BEST_CASE | 依 OBMCODEDF 維護（現行值待 Admin 初始化時從 OBMCODEDF 查詢確認） | 對應 OBMLISTDF.PROD_BEST |
| SPEC_TP | 依 OBMCODEDF 維護（dump 中見 02/04/05/06/11/12 等值） | 初始 seed 依 OBMCODEDF TBL_ID 對應值 |
| CASEYEAR | 0=0年、1=1年、2=2年、3=3年、4=4年、5=5年、6=6年（以上）、99=不限年數（全選） | SP 特殊邏輯：99 對應 YEAR_CNT >= 0 AND < 15（需加說明標籤） |
| SETTLE_SRC | Y = 含他行代償、N = 不含他行代償 | 固定兩值，不增加 |

> **[Seed 備註]**：
> - PROD_KIND / LIST_TYPE / SPEC_TP 的完整可選值清單依賴 OBMCODEDF 現有記錄，Admin 初始化時以 OBMCODEDF 當時資料為準，無法提前完整列舉
> - CASEYEAR 的 `99`（不限年數）為特殊值，`option_label` 建議設為「99 = 不限年數（YEAR_CNT 無上限）」，以免業務主管誤解
> - SETTLE_SRC 為固定兩值，不需 Admin 額外維護

---

## 驗收標準

### AC-1：部長 / Admin 查看某 categorical 欄位的可選值列表

~~（v1.0 原文）進入 M06 代碼維護 > POOLDATA 篩選欄位分頁。~~

**（v2.1 修改）**

- **Given** 部長或 Admin 進入 sidebar **「篩選欄位」**，切換至 **Tab 2「可選值管理」**（由 US-124 統一 rename），點擊某個 `field_type = categorical` 欄位的「管理可選值」
- **When** 頁面載入
- **Then** 以表格顯示該欄位現有全部可選值，欄位包含：值（`option_value`）、顯示標籤（`option_label`）、狀態（啟用 / 停用）
- **And** 停用的可選值仍顯示於列表，以灰色或停用標記區分（不隱藏）

### AC-2：處長進入此頁面為唯讀

- **Given** 帳號持有「處長」角色（非部長、非 Admin）
- **When** 進入某 categorical 欄位的可選值管理頁面
- **Then** 可查看可選值列表（同 AC-1 的資料呈現）
- **And** 頁面**不顯示任何「新增可選值」「停用」「啟用」等可操作按鈕**
- **And** 若處長嘗試直接呼叫可選值寫入 API，後端回 403 Forbidden

### AC-3：系統首次部署時自動 Seed 各欄位初始可選值

~~（v1.0 原文）CASEYEAR：0~6（各年數）+ 99（不限年數），共 8 筆；SPEC_TP / BEST_CASE：依 OBMCODEDF 當時記錄 seed。~~

**（v2.1 修改）**

- **Given** 系統首次部署或執行初始化腳本
- **When** Admin 執行初始化
- **Then** 系統自動 seed 各 categorical 欄位的初始可選值（依「初始 Seed 清單」段落）：
  - PROD_KIND：至少含 01 / 02 / 03 三筆（依 OBMCODEDF 真實 dump 比對確認，GAP E6；具體值由 Phase 3a 補充）
  - LIST_TYPE：01 / 02 / 03 三筆
  - **CASEYEAR：`0`（0年）、`1`（1年）、`2`（2年）、`3`（3年）、`4`（4年）、`5`（5年）、`6`（6年以上）、`99`（不限年數），共 8 筆**（v2.1 修改，J5 拍板；不採 11 筆；不讀取 ob_code_df）
  - SETTLE_SRC：Y / N 兩筆
  - SPEC_TP：依 OBMCODEDF 真實 dump 確認（32 筆，GAP E5；具體值由 Phase 3a 補充；**不再依賴 m24 placeholder 3 筆**）
  - BEST_CASE：依 OBMCODEDF 當時記錄 seed
  - **CASE_STATUS：`01`（期中，不含當月滿期）、`02`（中結）、`03`（滿期，含當月滿期）、`04`（滿期），共 4 筆**（v2.1 新增，GAP A5/E4；來源為 ob_code_df tbl_id='22' 真實資料；遷入後不再讀取 ob_code_df）
- **And** seed 為冪等操作（重複執行不產生重複資料）

### AC-4：部長 / Admin 新增可選值

- **Given** 部長或 Admin 在可選值列表頁點擊「新增可選值」
- **When** 填入 `option_value`（必填）、`option_label`（必填），點擊儲存
- **Then** 新可選值以 `is_active = true` 新增成功，立即出現在列表中
- **And** 操作寫入 `assignment_audit_log`（`action = 'CREATE'`、`entity_type = 'pooldata_field_option'`、`entity_id` 含欄位名稱與值）

### AC-5：`option_value` 在同欄位內唯一性驗證

- **Given** 部長或 Admin 嘗試為欄位新增 `option_value`，與同欄位下現有某值（無論啟用或停用）重複
- **When** 點擊儲存
- **Then** 系統顯示錯誤「此可選值已存在（狀態：停用），如需重新使用請改為啟用操作」，不新增重複紀錄

### AC-6：部長 / Admin 停用可選值

- **Given** 部長或 Admin 點擊某可選值的「停用」按鈕
- **When** 確認 Modal（「確定停用？此值將不再出現於新名單定義的選項中，但既有名單條件不受影響」）後執行
- **Then** 該 `option_value` 的 `is_active` 設為 false，**立即**從新名單定義的多選元件選項中消失
- **And** 已在**現有**名單定義條件中選取此值的設定**不受影響**（不回溯修改、不自動移除）
- **And** 操作寫入 `assignment_audit_log`（`action = 'DISABLE'`）

### AC-7：停用可選值不中斷月名單分派（不回溯既有名單）

- **Given** 名單定義 LIST_NO `OB202604010` 的 PROD_KIND 條件包含值 `02`（機車）；部長停用白名單 PROD_KIND 欄位的可選值 `02`
- **When** 觸發月名單分派（US-081），月名單分派 Stage 1 讀取 `OB202604010` 的篩選條件
- **Then** 月名單分派仍正確以 `PROD_KIND INCLUDE ['02', ...]` 過濾 OBPOOLDATA，月名單分派完成不報錯
- **And** 結果準確性不受可選值停用影響

### AC-8：部長 / Admin 重新啟用已停用的可選值

- **Given** 某可選值已被停用（`is_active = false`）
- **When** 部長或 Admin 點擊該值的「啟用」按鈕並確認
- **Then** `is_active` 重設為 true，該值立即重新出現在新名單定義的多選元件選項中
- **And** 操作寫入 `assignment_audit_log`（`action = 'ENABLE'`）

### AC-9：僅 categorical 欄位可進入可選值管理頁

- **Given** 部長或 Admin 在 US-102 列表查看某欄位
- **When** 欄位 `field_type = numeric` 或 `date`（非 categorical）
- **Then** 不顯示「管理可選值」連結或按鈕；若直接訪問對應 URL，後端回 400 Bad Request（欄位類別不符）

### AC-10：新名單定義表單的多選選項只顯示啟用值

- **Given** 白名單欄位 `PROD_KIND`（categorical）有 5 個可選值，其中 2 個已停用
- **When** 部長或 Admin 開啟新名單定義表單，選擇 PROD_KIND 作為篩選欄位
- **Then** 多選元件只呈現 3 個啟用值，不顯示已停用的 2 個值

### AC-11：caseyear / case_status 選項變更的不回溯語意（v2.1 新增）

> **涵蓋 GAP**：A4、A5（caseyear / case_status 選項管理行為與其他 categorical 欄位一致）

- **Given** 某名單定義的篩選條件已包含 caseyear IN ['1', '2'] 或 case_status IN ['01']；管理員事後透過本頁（Tab 2）停用 caseyear 的某個可選值（如 `2`）或 case_status 的某個值（如 `01`）
- **When** 觸發月名單分派（US-081）
- **Then** 月名單分派 Stage 1 仍以既有 condition_payload 中固化的值過濾 OBPOOLDATA，不因 caseyear / case_status 可選值被停用而報錯或移除條件
- **And** 停用的可選值不再出現在**新建**名單定義的 caseyear / case_status 多選元件選項中
- **And** caseyear / case_status 的不回溯語意與 PROD_KIND / SPEC_TP 等其他 categorical 欄位**完全一致**（沿用 AC-6 / AC-7 既有規則）

---

## 技術備註

- 建議新建 `pooldata_field_option` 表（AppDB），含 `column_name`（FK → `pooldata_field_whitelist`）、`option_value`、`option_label`、`is_active`、`created_at`、`updated_at`；複合唯一鍵 `(column_name, option_value)`；schema 由 system-architect 決策
- 「不回溯」實作語意：月名單分派 Stage 1 讀取名單條件時，直接讀取 `ob_list_definition` 儲存的條件 JSONB（值已固化），不 join `pooldata_field_option` 做有效性驗證
- 前端多選元件選項來源：`GET /api/v1/pooldata-fields/{columnName}/options?active=true`，只返回 `is_active = true` 的值
- **權限實作**：本頁所有寫入操作使用 `DirectorGuard`（部長 + Admin 可通過）；查看操作使用 `SalesManagerGuard`（部長 + 處長 + Admin 均可進入）

---

## 測試案例

### TC-103-01：查看 categorical 欄位可選值列表（部長）

- **Given**：PROD_KIND 欄位已有 5 個可選值（3 啟用 / 2 停用）；部長帳號登入
- **When**：部長點擊 PROD_KIND 的「管理可選值」
- **Then**：列表顯示全部 5 筆，停用的 2 筆以灰色標記；頁面顯示「新增可選值」「停用」等操作按鈕

### TC-103-02：處長進入可選值管理頁為唯讀

- **Given**：帳號僅持有「處長」角色
- **When**：進入 PROD_KIND 可選值管理頁
- **Then**：可看到 5 筆可選值列表，但**無任何操作按鈕**

### TC-103-03：初始 Seed 冪等性

- **Given**：系統已完成首次初始化 seed
- **When**：再次執行 seed 腳本
- **Then**：可選值資料不變，不產生重複記錄，操作成功回傳

### TC-103-04：新增可選值成功

- **Given**：PROD_KIND 欄位無 `option_value = '09'`（農業機具）
- **When**：部長新增 `option_value = '09'`、`option_label = '農業機具'`
- **Then**：新值以啟用狀態出現於列表；稽核日誌新增 CREATE 紀錄

### TC-103-05：重複可選值被阻擋

- **Given**：PROD_KIND 已有停用的 `option_value = '02'`
- **When**：部長嘗試新增 `option_value = '02'`
- **Then**：顯示錯誤「此可選值已存在（狀態：停用），請改為啟用操作」，不新增

### TC-103-06：停用值不影響既有名單月名單分派

- **Given**：名單 `OB202604010` 的 PROD_KIND 條件含值 `02`；部長停用 PROD_KIND 的可選值 `02`
- **When**：觸發月名單分派
- **Then**：月名單分派 Stage 1 仍以 `PROD_KIND INCLUDE '02'` 過濾 OBPOOLDATA，不報錯，分派結果正常

### TC-103-07：停用值從新名單表單消失

- **Given**：部長停用 PROD_KIND 可選值 `02`
- **When**：開啟新名單定義表單，選擇 PROD_KIND 欄位
- **Then**：多選元件不顯示值 `02`；其他啟用值正常顯示

### TC-103-08：重新啟用停用值

- **Given**：PROD_KIND 可選值 `02` 已停用
- **When**：部長點擊「啟用」
- **Then**：`is_active` 改為 true；值重新出現於新名單定義表單的選項中；稽核日誌新增 ENABLE 紀錄

### TC-103-09：numeric 欄位無「管理可選值」入口

- **Given**：白名單欄位 `MONTH_CNT`（field_type = numeric）
- **When**：部長在 US-102 欄位列表查看
- **Then**：該欄位無「管理可選值」按鈕；直接訪問 `/pooldata-fields/MONTH_CNT/options` 後端回 400

---

## 依賴關係

- **Blocked By**：US-102（白名單建立，本 Story 的可選值必須掛載於已存在的 categorical 欄位）、US-100（部長角色定義，確立操作權限）、US-125（caseyear / case_status Seed 遷移，需先確認白名單條目存在）
- **Blocks**：US-106（新建名單定義草稿階段，動態多選選項來源）、US-121（INACTIVE 可選值警示，依賴 pooldata_field_option 資料完整）

---

## 待解決問題

| ID | 問題 | 負責方 | 狀態 |
|----|------|--------|------|
| OQ-103-02 | 可選值是否支援**排序**（`sort_order`）？若支援，部長是否需要能手動拖拉調整順序？MVP 暫不設計，留此 OQ 供後續評估。 | 業務主管 | 待確認（暫定 MVP 不支援） |
| OQ-103-03 | 可選值是否支援硬刪除？MVP 建議僅支援停用（軟刪除），避免歷史月名單分派資料參照失效問題。 | 業務主管 + system-architect | 待確認（建議停用） |

---

## Definition of Done

- [ ] 驗收標準全部通過
- [ ] 查看列表（含停用值顯示）測試通過（TC-103-01）
- [ ] 處長唯讀（無操作按鈕）測試通過（TC-103-02）
- [ ] 初始 Seed 冪等性測試通過（TC-103-03）
- [ ] 新增可選值測試通過（TC-103-04）
- [ ] 重複值阻擋測試通過（TC-103-05）
- [ ] 停用值不影響月名單分派（不回溯）測試通過（TC-103-06）
- [ ] 停用值從新名單表單消失測試通過（TC-103-07）
- [ ] 重新啟用測試通過（TC-103-08）
- [ ] numeric 欄位無可選值入口測試通過（TC-103-09）
- [ ] 稽核日誌寫入驗證（新增 / 停用 / 啟用）
- [ ] 單元測試覆蓋率 ≥ 80%
- [ ] Code review 通過
- [ ] 文件已更新

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **相關 Stories**：US-102（POOLDATA 篩選欄位白名單，本 Story 的父資料）、~~US-092（現有 M06 代碼維護基礎）~~（v2.1 DEPRECATED）、US-081（月名單分派 Stage 1 篩選條件讀取）、US-100（部長角色定義）、US-101（處長唯讀規則）、US-106（新名單定義草稿階段，動態多選選項來源）、US-124（篩選欄位合併頁 Tab 2 入口，v2.1）、US-125（caseyear / case_status Seed 遷移，v2.1）
- **GAP-LIST**：`docs/specs/implementation-log/F050-v2.1-refactor-gap-list.md`（A4、A5、E4、E5、E6、J5）
- **Reference SP**：`reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st1_list.sql`（篩選欄位與可選值初始 seed 來源）
- **Reference Table**：`reference/TableSchema/OB/OBPOOLDATA.sql`、`reference/TableSchema/OB/OBMCODEDF.sql`（現有代碼維護，categorical 欄位初始值的參照來源）
