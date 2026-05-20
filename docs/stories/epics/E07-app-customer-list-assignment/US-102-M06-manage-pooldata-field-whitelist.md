---
last-updated: 2026-05-19
version: v2.1-refactor
change-summary: "v2.1 修改：模組名稱「代碼維護」→「篩選欄位」；AC-1 Seed 補 case_status 條目（共 9 筆）；AC-2 頁面入口改為 2-Tab 合併頁（US-124）；新增 AC-10（case_status 白名單條目唯讀保護）。GAP 覆蓋：E3、H1、J4。"
---

# US-102：管理 POOLDATA 篩選欄位白名單（含欄位類別 metadata）

> **Story ID**：US-102
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：~~M06 代碼維護（進階）~~ **M06 篩選欄位（v2.1 rename）**
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：8

---

## User Story

**As a** 部長（Director）或 Admin
**I want** 在代碼維護頁面查看與編輯「可用於名單定義的 OBPOOLDATA 篩選欄位白名單」，並為每個欄位標記其類別（數值型 / 類別型 / 日期型）
**So that** 新建名單定義時，條件篩選的欄位選項清單能動態反映白名單內容，而非寫死在程式碼中，管理者無需 IT 協助即可自行增減可用篩選欄位

---

## 背景說明

現行系統月跑 Stage 1 從 OBPOOLDATA 篩選案件時，篩選條件欄位（PROD_KIND / CASEYEAR / SPEC_TP / SETTLE_SRC 等）由 IT 人員在 Stored Procedure 中硬編碼。本次重構後，新建名單定義（US-106，草稿階段）的篩選條件欄位將從「白名單」動態產生。

本 Story 管理這份白名單，包含：
- **欄位識別**：OBPOOLDATA 的實際欄位名稱（`column_name`）
- **顯示名稱**：業務主管可讀的中文標籤（`display_name`）
- **欄位類別**（`field_type`）：`numeric`（數值型）/ `categorical`（類別型）/ `date`（日期型）
  - `categorical` 類別型欄位有對應的可選值，由 US-103 維護
  - `numeric` 數值型欄位在名單定義表單中呈現為「數值區間（min / max）」輸入
- **啟用狀態**（`is_active`）：停用欄位不出現在名單定義表單

**操作權限（OQ-102-03 已解決）**：
- **可寫入（新增 / 編輯 / 停用）**：**部長 + Admin** 專屬
- **唯讀查看**：處長可進入頁面查看，但無任何編輯操作按鈕

**舊名單相容規則**：
- **舊名單**（既有 OBMLISTDF 遷移的資料）繼續沿用固定欄位邏輯（PROD_KIND / CASEYEAR / SPEC_TP / SETTLE_SRC），不受本白名單影響
- **新名單**（重構後透過新介面建立的名單）才使用白名單驅動的動態條件

---

## 初始 Seed 清單（源自現行 SP）

以下為依據 `reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st1_list.sql` 所提取的所有作用中篩選欄位，作為系統首次部署時的 seed 清單：

| 序號 | `column_name` | `display_name` | `field_type` | 備註 |
|------|--------------|----------------|-------------|------|
| 1 | PROD_KIND | 產品類別 | categorical | SP 中以 `fn_SplitString_cte` 多值比對；OBMCODEDF 有對應代碼 |
| 2 | LIST_TYPE | 名單類別（系統分類） | categorical | SP 中 LIST_TYPE IN (…)；現行有效值 01/02/03 |
| 3 | BEST_CASE | 最佳產品 | categorical | SP 中 BEST_CASE IN（對應 OBMLISTDF.PROD_BEST）；多值比對 |
| 4 | SPEC_TP | 專案類別 | categorical | SP 中 SPEC_TP IN (…)；多值 `$$` 分隔；OBMCODEDF 有代碼 |
| 5 | CASEYEAR | 進件/滿期/中結年數 | categorical | SP 中複合邏輯（YEAR_CNT 數值比對 + 特殊值 '99' = 全部）；OBMCODEDF 有代碼 |
| 6 | SETTLE_SRC | 他行代償 | categorical | SP 中 SETTLE_SRC IN (Y / N)；固定兩值 |
| 7 | MONTH_CNT | 撈取月份計數（還款期數範圍） | numeric | SP 中 `WHERE o.MONTH_CNT IN (select Data from @TmpTbl)`（由 LIST_PERIOD_START/END/INTERVAL 驅動）；為數值範圍邏輯 |
| 8 | PAYT_TERM | 還款期別 | numeric | SP 原始邏輯為數值區間，現已被 MONTH_CNT 取代（已 comment out）；seed 但預設 is_active = false |

> **[Seed 備註]**：
> - CASEYEAR 的特殊值 `'99'`（全部年數）在 SP 中以 `LIKE '%99%'` 處理（特殊邏輯：YEAR_CNT >= 0 AND YEAR_CNT < 15），需在 US-103 可選值中加入說明標籤「99 = 不限年數（全選）」
> - MONTH_CNT 不是直接輸入，而是由名單定義的 LIST_PERIOD_START / LIST_PERIOD_END / LIST_INTERVAL 三欄位計算產生；seed 時 field_type 標記為 numeric，但名單定義表單的 UI 為「起始期數 / 結束期數 / 間隔」三欄位組合，非單一 min/max 輸入框
> - PAYT_TERM 在現行 SP 已被 comment out（由 MONTH_CNT 取代），seed 時以 `is_active = false` 標記，作為歷史紀錄保留
> - 初始 seed 欄位數：共 8 筆（7 筆 is_active = true；1 筆 PAYT_TERM is_active = false）

---

## 驗收標準

### AC-1：系統首次部署時自動 Seed 白名單

~~（v1.0 原文）seed 以下 7 筆啟用欄位（+ 1 筆停用）：PROD_KIND / LIST_TYPE / BEST_CASE / SPEC_TP / CASEYEAR / SETTLE_SRC / MONTH_CNT / PAYT_TERM（停用）。~~

**（v2.1 修改）**

- **Given** 系統首次部署或執行初始化腳本
- **When** Admin 執行初始化
- **Then** 系統自動 seed 以下 **8 筆啟用欄位（+ 1 筆停用）**，共 9 筆：
  - PROD_KIND（類別型，啟用）
  - LIST_TYPE（類別型，啟用）
  - BEST_CASE（類別型，啟用）
  - SPEC_TP（類別型，啟用）
  - CASEYEAR（類別型，啟用）
  - SETTLE_SRC（類別型，啟用）
  - MONTH_CNT（數值型，啟用）
  - **CASE_STATUS（類別型，啟用）**（v2.1 新增，GAP E3）
  - PAYT_TERM（數值型，**停用**）
- **And** 每筆欄位含 `column_name`、`display_name`、`field_type`、`is_active`
- **And** seed 為冪等操作（重複執行不產生重複資料）

### AC-2：部長 / Admin 查看白名單列表

~~（v1.0 原文）進入 M06 代碼維護 > POOLDATA 篩選欄位分頁。~~

**（v2.1 修改）**

- **Given** 部長或 Admin 登入並點擊 sidebar **「篩選欄位」**（由 US-124 統一 rename）
- **When** 頁面載入，切換至 **Tab 1「POOLDATA 篩選欄位」**
- **Then** 以表格顯示白名單所有欄位，欄位包含：欄位名稱（`column_name`）、顯示名稱（`display_name`）、欄位類別（`field_type`）、狀態（啟用 / 停用）
- **And** 停用欄位以灰色或標記區分，仍顯示於列表（不隱藏）

### AC-3：處長進入此頁面為唯讀

- **Given** 帳號持有「處長」角色（非部長、非 Admin）
- **When** 進入 M06 代碼維護 > POOLDATA 篩選欄位分頁
- **Then** 可查看白名單列表（同 AC-2 的資料呈現）
- **And** 頁面**不顯示任何「新增欄位」「編輯」「停用」等可操作按鈕**
- **And** 若處長嘗試直接呼叫白名單寫入 API，後端回 403 Forbidden

### AC-4：部長 / Admin 新增白名單欄位

- **Given** 部長或 Admin 在 POOLDATA 篩選欄位列表頁點擊「新增欄位」
- **When** 填入 `column_name`（必填）、`display_name`（必填）、`field_type`（必填，下拉選擇：數值型 / 類別型 / 日期型），點擊儲存
- **Then** 新欄位以 `is_active = true` 狀態新增至白名單
- **And** 若 `field_type = categorical`，系統提示「請至 US-103 維護可選值」（不阻擋儲存）
- **And** 操作寫入 `assignment_audit_log`（`action = 'CREATE'`，`entity_type = 'pooldata_field_whitelist'`）

### AC-5：`column_name` 唯一性驗證

- **Given** 部長或 Admin 嘗試新增 `column_name` 與現有白名單中某欄位重複（無論啟用或停用）
- **When** 點擊儲存
- **Then** 系統顯示錯誤「欄位名稱已存在，請確認是否要重新啟用停用欄位」，不新增重複紀錄

### AC-6：部長 / Admin 編輯欄位的顯示名稱與欄位類別

- **Given** 部長或 Admin 在白名單列表點擊特定欄位的「編輯」
- **When** 修改 `display_name` 或 `field_type`，點擊儲存
- **Then** 變更立即生效，下次開啟名單定義表單時反映最新顯示名稱
- **And** 若 `field_type` 從 `categorical` 改為其他類別，系統顯示警告「此欄位現有可選值設定將不再套用（不自動刪除），確定繼續？」，業務主管確認後才儲存
- **And** 操作寫入 `assignment_audit_log`（`action = 'UPDATE'`）

### AC-7：部長 / Admin 停用白名單欄位

- **Given** 部長或 Admin 點擊白名單欄位的「停用」操作
- **When** 確認 Modal 後執行停用
- **Then** 欄位 `is_active` 設為 false，**立即**從新名單定義的條件篩選選單中消失
- **And** 已在**現有**名單定義條件中使用此欄位的設定**不受影響**（不回溯修改既有名單條件）
- **And** 操作寫入 `assignment_audit_log`（`action = 'DISABLE'`）

### AC-8：停用欄位不影響既有名單條件（舊名單相容）

- **Given** 名單定義 LIST_NO `OB202604010` 的篩選條件包含欄位 `SETTLE_SRC = Y`；部長或 Admin 停用白名單中的 `SETTLE_SRC` 欄位
- **When** 系統執行月跑讀取 `OB202604010` 的篩選條件
- **Then** 月跑仍正確讀取 `SETTLE_SRC = Y` 並依此過濾 OBPOOLDATA；不因欄位停用而失敗

### AC-9：欄位類別影響名單定義表單元件選擇

- **Given** 白名單中某欄位 `field_type = categorical`
- **When** 部長或 Admin 於新名單定義表單選取此欄位為篩選條件
- **Then** 表單元件為多選列表（可選值由 US-103 維護的列表取得）
- **And** 若 `field_type = numeric`，表單元件為數值範圍輸入（min / max）
- **And** 若 `field_type = date`，表單元件為日期範圍選擇器

### AC-10：caseyear 與 case_status 白名單條目存在且處長唯讀（v2.1 新增）

> **涵蓋 GAP**：E3（whitelist 新增 case_status 條目）

- **Given** 系統完成初始化（含 v2.1 Seed）
- **When** 部長、Admin 或處長進入 Tab 1「POOLDATA 篩選欄位」查看白名單列表
- **Then** 列表中包含 `caseyear`（進件/滿期/中結年數，類別型，啟用）與 `case_status`（案件結清期別，類別型，啟用）兩個條目
- **And** 處長查看此頁面時，`caseyear` 與 `case_status` 條目旁均無「編輯」或「停用」按鈕（處長唯讀規則沿用 AC-3）

---

## 技術備註

- 建議新建 `pooldata_field_whitelist` 表（AppDB），至少含 `column_name`（PK/唯一鍵）、`display_name`、`field_type ENUM`、`is_active`、`created_at`、`updated_at`；schema 設計由 system-architect 負責
- 白名單表與 OBPOOLDATA 的欄位名稱是**字串映射關係**，不維護外鍵約束（OBPOOLDATA 為 ETL 同步資料，欄位可能動態變化）
- 停用欄位的「不回溯」語意：後端在月跑讀取名單條件時，直接讀取 `ob_list_definition` 中儲存的條件 JSONB，不再 join 白名單做欄位有效性驗證（避免停用後月跑失敗）
- **權限實作**：本頁所有寫入操作使用 `DirectorGuard`（部長 + Admin 可通過）；查看操作使用 `SalesManagerGuard`（部長 + 處長 + Admin 均可進入，前端依角色決定顯示哪些操作按鈕）

---

## 測試案例

### TC-102-01：初始 Seed 冪等性

- **Given**：系統已完成首次初始化 seed（8 筆欄位）
- **When**：再次執行 seed 腳本
- **Then**：白名單資料不變，不產生重複欄位，操作成功回傳（不報錯）

### TC-102-02：新增 categorical 欄位並提示維護可選值

- **Given**：部長在白名單頁點擊「新增欄位」
- **When**：填入 `column_name = 'RISK_LEVEL'`、`display_name = '風險等級'`、`field_type = 類別型`，點擊儲存
- **Then**：欄位新增成功；系統顯示提示「風險等級 為類別型欄位，請至 POOLDATA 可選值維護頁設定可選值」

### TC-102-03：column_name 重複被阻擋

- **Given**：白名單中已有 `column_name = 'PROD_KIND'`（無論啟用或停用）
- **When**：部長嘗試新增 `column_name = 'PROD_KIND'`
- **Then**：顯示錯誤「欄位名稱已存在」，不新增紀錄

### TC-102-04：處長進入白名單頁面為唯讀，無操作按鈕

- **Given**：帳號僅持有「處長」角色
- **When**：進入 POOLDATA 篩選欄位分頁
- **Then**：可看到白名單列表資料，但頁面無「新增欄位」「編輯」「停用」按鈕

### TC-102-05：處長嘗試呼叫白名單寫入 API 被拒

- **Given**：帳號僅持有「處長」角色
- **When**：直接 POST 至白名單新增 API
- **Then**：後端回 403 Forbidden

### TC-102-06：停用欄位後新名單表單不再顯示該欄位

- **Given**：白名單中 `SETTLE_SRC` 欄位為啟用狀態
- **When**：部長停用 `SETTLE_SRC`；再次開啟新名單定義表單的條件篩選欄位選單
- **Then**：選單中不出現 `SETTLE_SRC`；但現有含此條件的名單月跑不受影響

### TC-102-07：停用欄位不中斷現有名單月跑

- **Given**：名單 `OB202604010` 含篩選條件 `SETTLE_SRC = Y`；`SETTLE_SRC` 被停用
- **When**：觸發月跑（US-081）
- **Then**：月跑 Stage 1 仍正確以 `SETTLE_SRC = Y` 過濾 OBPOOLDATA，月跑完成不報錯

### TC-102-08：field_type 從 categorical 改為 numeric 顯示警告

- **Given**：欄位 `PROD_KIND` 的 `field_type = categorical`，且 US-103 已維護可選值
- **When**：部長將 `field_type` 改為 `numeric`
- **Then**：系統顯示警告 Modal「此欄位現有可選值設定將不再套用，確定繼續？」；部長確認後儲存成功

---

## 依賴關係

- **Blocked By**：~~US-092（M06 代碼維護基礎頁面架構）~~ **US-124（v2.1：篩選欄位合併頁入口）**、US-100（部長角色定義，確立操作權限）
- **Blocks**：US-103（類別型欄位可選值維護，依賴本 Story 的 `field_type = categorical` 標記）、US-106（新建名單定義的動態篩選條件欄位選單，依賴本白名單）、US-121（condition_payload columnName 白名單驗證，依賴本白名單條目完整性）

---

## 待解決問題

| ID | 問題 | 負責方 | 狀態 |
|----|------|--------|------|
| OQ-102-02 | 部長 / Admin 是否可以**刪除**（非停用）白名單欄位？若刪除後有既有名單條件使用此欄位，月跑行為如何？建議 MVP 僅支援停用，不支援硬刪除。 | 業務主管 + system-architect | 待確認 |

---

## Definition of Done

- [ ] 驗收標準全部通過
- [ ] 初始 Seed 冪等性測試通過（TC-102-01）
- [ ] categorical 欄位新增提示測試通過（TC-102-02）
- [ ] column_name 唯一性驗證測試通過（TC-102-03）
- [ ] 處長唯讀（無操作按鈕）測試通過（TC-102-04）
- [ ] 處長呼叫寫入 API 被拒測試通過（TC-102-05）
- [ ] 停用欄位從新名單表單消失測試通過（TC-102-06）
- [ ] 停用欄位不中斷月跑測試通過（TC-102-07）
- [ ] field_type 變更警告測試通過（TC-102-08）
- [ ] 稽核日誌寫入驗證（新增 / 編輯 / 停用）
- [ ] 單元測試覆蓋率 ≥ 80%
- [ ] Code review 通過
- [ ] 文件已更新

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **相關 Stories**：~~US-092（M06 代碼維護現有頁面）~~（v2.1 DEPRECATED）、US-103（POOLDATA 類別型欄位可選值）、US-106（新名單定義草稿階段，條件篩選欄位來源）、US-081（月跑 Stage 1 讀取篩選條件）、US-100（部長角色定義）、US-101（處長唯讀規則）、US-124（篩選欄位合併頁入口，v2.1）、US-125（caseyear / case_status 選項遷移，v2.1）
- **GAP-LIST**：`docs/specs/implementation-log/F050-v2.1-refactor-gap-list.md`（E3、H1、J4）
- **Reference SP**：`reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st1_list.sql`（Stage 1 篩選邏輯，初始 seed 欄位來源）
- **Reference Table**：`reference/TableSchema/OB/OBPOOLDATA.sql`（OBPOOLDATA 欄位清單，作為白名單欄位 `column_name` 的合法參照）
