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

### AC-6：必填欄位驗證

- **Given** 業務主管未填寫任一必填欄位即點擊「儲存」
- **When** 前端進行表單驗證
- **Then** 對應欄位顯示紅色邊框與錯誤訊息「此欄位為必填」，儲存不執行

### AC-7：LIST_PERIOD_END 需大於等於 LIST_PERIOD_START

- **Given** 業務主管在新增表單輸入 LIST_PERIOD_START 與 LIST_PERIOD_END
- **When** 任一欄位值變更後
- **Then** 若 LIST_PERIOD_END < LIST_PERIOD_START，顯示錯誤「結束期數需大於等於開始期數」，儲存按鈕停用

### AC-8：儲存後操作

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
| 產品類別 | PROD_KIND | 單選下拉，來源 OBMCODEDF |
| 進件/滿期/中結年數 | CASEYEAR | 多選 CHKBOX + 全選，來源 OBMCODEDF，多值 `$$` 分隔 |
| 專案類別 | SPEC_TP | 多選 CHKBOX，來源 OBMCODEDF，多值 `$$` 分隔 |
| 開始撈取期數（月） | LIST_PERIOD_START | 數字框，max 3 |
| 結束撈取期數（月） | LIST_PERIOD_END | 數字框，max 3，需 ≥ START |
| 間隔期數（月） | LIST_INTERVAL | 數字框，max 3 |
| 被他行代償案件 | SETTLE_SRC | 多選 CHKBOX：「含」(Y) / 「不含」(N) |

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
- 代碼選項來源（PROD_KIND、CASEYEAR、SPEC_TP）：OBMCODEDF，由 US-092 進行維護
- CASEYEAR / SPEC_TP / SETTLE_SRC 多值儲存格式：以 `$$` 為分隔符（例如 `0$$1$$2$$3`）
- STATUS 初始值：後端寫入 'active'，不由前端傳送
- 操作寫入 AssignmentAuditLog（待 system-architect 設計表結構）
- 月跑中資料鎖判斷：查詢 AssignmentRun 是否有 status = 'running' 記錄

---

## 測試案例

### TC-088-01：正常新增（空白表單）

- **Given**：業務主管填入 LIST_NM = 「新車月跑名單」、PROD_KIND = 'A'、CASEYEAR = '1$$2'、SPEC_TP = 'S1'、LIST_PERIOD_START = 1、LIST_PERIOD_END = 6、LIST_INTERVAL = 1、SETTLE_SRC = 'Y'
- **When**：點擊「儲存」
- **Then**：OBMLISTDF 新增一列，LIST_NO = 'OB202605001'（假設本月首筆），STATUS = 'active'，LIST_TYPE = '01'
- **And**：成功提示顯示 LIST_NO，返回清單頁

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

- **Blocked By**：US-070（新增按鈕在清單頁）、US-092（PROD_KIND / CASEYEAR / SPEC_TP 代碼維護）
- **Blocks**：US-081（月跑需有 active 名單定義）

---

## Definition of Done

- [ ] 驗收標準全部通過
- [ ] LIST_NO 自動產生邏輯測試（流水號遞增、不重複）
- [ ] PROD_KIND + CARD_TYPE 重複檢查測試
- [ ] 複製名單功能測試（欄位填入、LIST_NO 重新產生）
- [ ] 必填欄位驗證測試
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
