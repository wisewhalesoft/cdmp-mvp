# US-088：新增名單定義

> **Story ID**：US-088
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M01 名單定義
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：8

---

## User Story

**As a** 業務主管
**I want** 新增或從既有名單複製建立一筆新的名單定義
**So that** 彈性設定本月各 Stage 的客戶篩選條件，不需仰賴 IT 手動操作資料庫

---

## 驗收標準

### AC-1：從空白表單新增

- **Given** 業務主管在名單定義清單頁（US-070）點擊「新增名單定義」按鈕
- **When** 系統開啟新增表單
- **Then** 顯示空白表單，含全部可編輯欄位（詳見「表單欄位規範」，與 US-089 一致）
- **And** LIST_NO 欄位不顯示（儲存後系統自動產生）

### AC-2：LIST_NO 自動產生規則

- **Given** 業務主管填妥表單並點擊「儲存」，前端驗證通過
- **When** 後端處理新增請求
- **Then** 系統依格式 `OB{YYYYMM}{NNN}` 自動產生 LIST_NO，共 11 碼
  - OB：固定系統代號
  - YYYYMM：當前作業西元年月（例如 202605）
  - NNN：該年月流水號，從 001 開始遞增（例如 001、002、...、999）
- **And** 新產生的 LIST_NO 不與現有任何 LIST_NO 重複
- **And** LIST_TYPE 後端自動填入固定值 '01'，STATUS 初始為 'active'

### AC-3：PROD_KIND + CARD_TYPE 重複檢查

- **Given** 業務主管填入的 PROD_KIND 與 CARD_TYPE 組合，在當前作業年月下已存在 STATUS = 'active' 的名單
- **When** 業務主管點擊「儲存」
- **Then** 系統硬阻擋，顯示錯誤訊息：「相同產品類別（PROD_KIND）與卡別（CARD_TYPE）的有效名單已存在（LIST_NO: {衝突的 LIST_NO}），請停用既有名單或修改條件」
- **And** 不產生新記錄

### AC-4：複製名單功能

- **Given** 業務主管在新增表單點擊「複製名單」按鈕
- **When** 系統開啟複製來源選擇器（下拉或搜尋彈窗），顯示所有 STATUS = 'active' 的既有名單
- **Then** 業務主管選擇某一來源名單後，表單各欄位自動填入來源名單的對應值
- **And** LIST_NO 仍為空（儲存後重新產生），LIST_NM 可自由修改

### AC-5：月跑執行中禁止新增

- **Given** 目前有 AssignmentRun status = 'running' 的月跑
- **When** 業務主管嘗試點擊「新增名單定義」按鈕
- **Then** 按鈕為停用狀態，hover 顯示提示「分派執行中，無法新增名單定義」

### AC-6：案件結清期別（case_status）必填多選

- **Given** 業務主管在新增表單操作案件結清期別欄位
- **When** 業務主管未選取任何選項即點擊「儲存」
- **Then** 前端顯示錯誤「案件結清期別為必填，請至少選取一項」，儲存不執行
- **And** 可選選項由 OBMCODEDF（TBL_ID = '22'，SYSTEM_ID = 'OB'）動態載入，固定 4 個啟用選項：
  - `01` = 期中（不含當月滿期）
  - `02` = 中結
  - `03` = 滿期（含當月滿期）
  - `04` = 滿期
- **And** 業務主管可勾選一個或多個選項，多選值以 `$$` 分隔儲存（例如 `01$$02$$03`），與 CASEYEAR / SPEC_TP 同模式

> **[BUSINESS RULE]** case_status 為獨立欄位，用於限定此名單篩選時的案件結清期別範圍，與 list_type 欄位語意不重疊（見下方「list_type vs case_status 語意分離說明」）。

### AC-7：必填欄位驗證（原 AC-6）

- **Given** 業務主管未填寫任一必填欄位即點擊「儲存」
- **When** 前端進行表單驗證
- **Then** 對應欄位顯示紅色邊框與錯誤訊息「此欄位為必填」，儲存不執行

### AC-8：LIST_PERIOD_END 需大於等於 LIST_PERIOD_START

- **Given** 業務主管在新增表單輸入 LIST_PERIOD_START 與 LIST_PERIOD_END
- **When** 任一欄位值變更後
- **Then** 若 LIST_PERIOD_END < LIST_PERIOD_START，顯示錯誤「結束期數需大於等於開始期數」，儲存按鈕停用

### AC-9：儲存後操作

- **Given** 新增表單所有驗證均通過
- **When** 業務主管點擊「儲存」並後端成功寫入
- **Then** 頁面顯示成功提示，含新產生的 LIST_NO
- **And** 返回名單定義清單頁，新建名單出現在「使用中」頁籤清單中

---

## 表單欄位規範

與 US-089 表單欄位規範完全一致，詳見 [US-089 表單欄位規範](US-089-M01-edit-list-definition.md)。

### 必填欄位摘要

| 欄位 | schema 欄位名 | UI 元件 |
|------|--------------|---------|
| 名單名稱 | LIST_NM | 文字框，max 45 |
| 產品類別 | PROD_KIND | **多選** CHKBOX，來源 OBMCODEDF，多值 `$$` 分隔 |
| 進件/滿期/中結年數 | CASEYEAR | **多選** CHKBOX + 全選，來源 OBMCODEDF，多值 `$$` 分隔 |
| 專案類別 | SPEC_TP | **多選** CHKBOX，來源 OBMCODEDF，多值 `$$` 分隔 |
| **案件結清期別** | **case_status** | **多選** CHKBOX，來源 OBMCODEDF（TBL_ID='22'），多值 `$$` 分隔；選項：期中/中結/滿期(含當月)/滿期 |
| 開始撈取期數（月） | LIST_PERIOD_START | 數字框，max 3 |
| 結束撈取期數（月） | LIST_PERIOD_END | 數字框，max 3，需 ≥ START |
| 間隔期數（月） | LIST_INTERVAL | 數字框，max 3 |
| 被他行代償案件 | SETTLE_SRC | **多選** CHKBOX：「含」(Y) / 「不含」(N)，多值 `$$` 分隔 |

### 選填欄位摘要

| 欄位 | schema 欄位名 | UI 元件 |
|------|--------------|---------|
| 卡別 | CARD_TYPE | 文字框，max 2 |
| 最佳產品 | PROD_BEST | 文字框，max 5 |

---

## 技術備註

- 資料來源：`reference/TableSchema/OB/OBMLISTDF.sql`（OBMLISTDF 表）
- 舊系統表單參照：`reference/Areas/OBZ/Views/OBZ020/edit.cshtml`（新增模式）、`reference/Areas/OBZ/Controllers/OBZ020/OBZ020Controller.cs`
- LIST_NO 產生機制：後端依當月 YYYYMM 查詢最大既有流水號後 +1；若無既有，從 001 開始。999 為上限（超過需 system-architect 評估擴位方案，為待解決問題）
- 代碼選項來源（PROD_KIND、CASEYEAR、SPEC_TP、case_status）：OBMCODEDF，由 US-092 進行維護
- **多值欄位與 `$$` 分隔格式（dump 驗證，2026-05-05）**：以下五個欄位均為多選，提交時以 `$$` 為分隔符儲存至 OBMLISTDF，與舊系統格式一致：
  - `PROD_KIND`：多選，例如 `02$$04$$05`（dump 實際觀察值）
  - `CASEYEAR`：多選，例如 `0$$1$$2$$3$$4$$5`
  - `SPEC_TP`：多選，例如 `02$$04$$05$$06$$11$$12`
  - `SETTLE_SRC`：多選，例如 `Y$$N`（含且不含）或 `Y`（僅含）
  - `case_status`：多選，例如 `01$$02$$03`，來源 OBMCODEDF TBL_ID='22'
- STATUS 初始值：後端寫入 'active'，不由前端傳送

### list_type vs case_status 語意分離說明

原系統 DB 欄位 `LIST_TYPE` 在業務上承擔了兩種不同的語意，新系統決議拆分為兩個欄位以消除混淆：

| 欄位 | 語意 | 值來源 | 表單顯示 |
|------|------|--------|---------|
| `list_type` | 名單的系統分類（分派名單 vs 外部名單） | 固定 `'01'`（分派名單），後端寫入 | **不顯示**，業務主管無需操作 |
| `case_status` | 名單篩選時的案件結清期別範圍 | OBMCODEDF TBL_ID='22'，業務主管選擇 | **必填多選**，對應原系統「名單類型」欄位 |

> **[BUSINESS RULE]** `list_type = '01'` 為固定系統常數，表示本系統建立的名單均屬「分派名單」類型，不需業務主管設定。`case_status` 才是業務主管在原系統「名單類型」欄位實際操作的篩選條件。

> **[ASSUMPTION]** OBMLISTDF 多值欄位（PROD_KIND / CASEYEAR / SPEC_TP / SETTLE_SRC / case_status）均以 `$$` 分隔字串儲存，與舊系統格式一致（2026-05-05 dump 驗證）。表單元件對應為多選 CHKBOX，非單選下拉。
- 操作寫入 AssignmentAuditLog（待 system-architect 設計表結構）
- 月跑中資料鎖判斷：查詢 AssignmentRun 是否有 status = 'running' 記錄

---

## Open Questions

| ID | 問題 | 負責方 | 狀態 |
|----|------|--------|------|
| OQ-088-01 | case_status 4 個選項（期中/中結/滿期含當月/滿期）的業務含義為何？例如「期中」指的是案件還在還款中未到期，或有其他業務定義？需業務主管確認後補入說明。 | 業務主管 | 待確認 |
| OQ-088-02 | case_status 多選的業務意義：選「期中 + 中結」是否表示此名單只篩選「案件結清期別為期中或中結」的案件？是 OR 邏輯（符合任一即納入）？ | 業務主管 | 待確認 |
| OQ-088-03 | 現有名單若無 case_status 值（資料遷移議題）：既有 OBMLISTDF 中的舊資料是否需要補填 case_status？如何決定預設值？ | system-architect + 業務主管 | 待評估 |
| OQ-088-04 | case_status 欄位在 OBMLISTDF schema 中的型態與長度：建議 VARCHAR 儲存 `$$` 分隔值，最大長度待 system-architect 確認（4 個選項最大字串為 `01$$02$$03$$04` = 14 碼）。 | system-architect | 待確認 |

---

## 測試案例

### TC-088-01：正常新增（空白表單，含 case_status）

- **Given**：業務主管填入 LIST_NM = 「新車月跑名單」、PROD_KIND = 'A'、CASEYEAR = '1$$2'、SPEC_TP = 'S1'、case_status = '01$$02'（期中 + 中結）、LIST_PERIOD_START = 1、LIST_PERIOD_END = 6、LIST_INTERVAL = 1、SETTLE_SRC = 'Y'
- **When**：點擊「儲存」
- **Then**：OBMLISTDF 新增一列，LIST_NO = 'OB202605001'（假設本月首筆），STATUS = 'active'，LIST_TYPE = '01'（後端寫入），case_status = '01$$02'
- **And**：成功提示顯示 LIST_NO，返回清單頁

### TC-088-01b：case_status 未選取時阻擋儲存

- **Given**：業務主管填妥其他所有必填欄位，但未勾選任何 case_status 選項
- **When**：點擊「儲存」
- **Then**：前端顯示「案件結清期別為必填，請至少選取一項」，儲存不執行

### TC-088-02：PROD_KIND + CARD_TYPE 重複硬阻擋

- **Given**：OBMLISTDF 已有 PROD_KIND = 'A'、CARD_TYPE = '01'、STATUS = 'active' 的名單（LIST_NO = 'OB202605001'）
- **When**：業務主管嘗試以相同 PROD_KIND = 'A'、CARD_TYPE = '01' 新增
- **Then**：後端返回錯誤，前端顯示「相同產品類別與卡別的有效名單已存在（LIST_NO: OB202605001）」

### TC-088-03：複製名單後修改儲存

- **Given**：既有 active 名單 'OB202604010' 的各欄位值
- **When**：業務主管選擇複製，修改 LIST_NM 為「新月複製名單」後儲存
- **Then**：新名單以 'OB202605002' 寫入，欄位值對應來源名單（LIST_NM 除外），STATUS = 'active'

### TC-088-04：月跑中禁止新增

- **Given**：AssignmentRun status = 'running'
- **When**：業務主管嘗試點擊「新增名單定義」
- **Then**：按鈕停用，顯示鎖定提示

---

## 依賴關係

- **Blocked By**：US-070（新增按鈕在清單頁）、US-092（PROD_KIND / CASEYEAR / SPEC_TP / case_status 代碼維護）
- **Blocks**：US-081（月跑需有 active 名單定義）

---

## Definition of Done

- [ ] 驗收標準全部通過
- [ ] LIST_NO 自動產生邏輯測試（流水號遞增、不重複）
- [ ] PROD_KIND + CARD_TYPE 重複檢查測試
- [ ] 複製名單功能測試（欄位填入、LIST_NO 重新產生，含 case_status 值複製）
- [ ] 必填欄位驗證測試（含 case_status 未選阻擋）
- [ ] case_status 多選值以 `$$` 分隔正確儲存測試
- [ ] LIST_PERIOD_END >= START 驗證測試
- [ ] 月跑中資料鎖測試
- [ ] AssignmentAuditLog 寫入測試
- [ ] 單元測試覆蓋率 ≥ 80%
- [ ] Code review 通過
- [ ] 文件已更新

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **NFR**：[NFR-003](../../non-functional/NFR-003-assignment-execution-perf.md)
- **相關 Stories**：US-070（清單頁入口）、US-089（編輯名單，共用表單欄位規範）、US-090（停用名單）、US-092（代碼維護）
- **Reference**：`reference/TableSchema/OB/OBMLISTDF.sql`、`reference/Areas/OBZ/Views/OBZ020/edit.cshtml`、`reference/Areas/OBZ/Controllers/OBZ020/OBZ020Controller.cs`
