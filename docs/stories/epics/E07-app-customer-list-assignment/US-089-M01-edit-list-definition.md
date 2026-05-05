# US-089：編輯名單定義

> **Story ID**：US-089
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M01 名單定義
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：5

---

## User Story

**As a** 業務主管
**I want** 編輯既有名單定義的篩選條件
**So that** 在月跑前調整本月各 Stage 的名單條件，確保分派結果符合業務策略

---

## 驗收標準

### AC-1：進入編輯表單

- **Given** 業務主管在名單定義清單（US-070）中，點擊某個 STATUS = 'active' 名單的「編輯」按鈕
- **When** 系統載入編輯頁面
- **Then** 顯示該 LIST_NO 的現有欄位值，填入各表單元件（詳見「表單欄位規範」）
- **And** LIST_NO 以唯讀方式顯示，不可修改
- **And** 系統管理欄位（LIST_TYPE、PROJECT_WORKYM、STATUS 等）完全不在表單中呈現

### AC-2：覆寫式儲存

- **Given** 業務主管修改欄位後點擊「儲存」
- **When** 前端驗證全部通過
- **Then** 系統以覆寫方式更新 OBMLISTDF 對應列（無草稿、無版本分岔）
- **And** A_* / U_* audit 欄位由後端自動填入，不需前端傳送
- **And** 儲存成功後顯示成功提示，並返回名單定義清單頁

### AC-3：LIST_PERIOD_END 需大於等於 LIST_PERIOD_START

- **Given** 業務主管在編輯表單輸入 LIST_PERIOD_START 與 LIST_PERIOD_END
- **When** 任一欄位值變更後
- **Then** 若 LIST_PERIOD_END < LIST_PERIOD_START，顯示錯誤「結束期數需大於等於開始期數」，儲存按鈕停用

### AC-4：已停用名單不提供編輯入口

- **Given** 業務主管在「已停用」頁籤查看名單
- **When** 頁面顯示已停用名單列表
- **Then** 每列不顯示「編輯」按鈕，僅供唯讀查閱
- **And** 直接訪問已停用名單的編輯 URL，系統返回 403 或跳轉回清單頁並提示「已停用名單不可編輯」

### AC-5：月跑執行中禁止編輯

- **Given** 目前有 AssignmentRun status = 'running' 的月跑
- **When** 業務主管嘗試點擊任何名單的「編輯」按鈕
- **Then** 編輯按鈕為停用狀態，滑鼠 hover 顯示提示「分派執行中，無法修改名單定義」

### AC-6：必填欄位驗證

- **Given** 業務主管清空任一必填欄位後點擊「儲存」
- **When** 前端進行表單驗證
- **Then** 對應欄位顯示紅色邊框與錯誤訊息「此欄位為必填」，儲存不執行

---

## 表單欄位規範

### 必填欄位

| 欄位 | schema 欄位名 | UI 元件 | 說明 |
|------|--------------|---------|------|
| 名單名稱 | LIST_NM | 文字框，max 45 | 必填 |
| 產品類別 | PROD_KIND | **多選** CHKBOX，來源 OBMCODEDF（US-092 管理），多值以 `$$` 分隔儲存 | 必填，至少選一 |
| 進件/滿期/中結年數 | CASEYEAR | **多選** CHKBOX + 全選按鈕，來源 OBMCODEDF（US-092 管理），多值以 `$$` 分隔儲存 | 必填，至少選一 |
| 專案類別 | SPEC_TP | **多選** CHKBOX，來源 OBMCODEDF（US-092 管理），多值以 `$$` 分隔儲存 | 必填，至少選一 |
| 開始撈取期數（月） | LIST_PERIOD_START | 數字框，max 3 碼 | 必填 |
| 結束撈取期數（月） | LIST_PERIOD_END | 數字框，max 3 碼，需 ≥ LIST_PERIOD_START | 必填 |
| 間隔期數（月） | LIST_INTERVAL | 數字框，max 3 碼 | 必填 |
| 被他行代償案件 | SETTLE_SRC | **多選** CHKBOX，固定選項：「含」(Y) / 「不含」(N)，多值以 `$$` 分隔儲存 | 必填，至少選一 |

### 選填欄位

| 欄位 | schema 欄位名 | UI 元件 | 說明 |
|------|--------------|---------|------|
| 卡別 | CARD_TYPE | 文字框，max 2 | Stage 2 計分用，選填；直接輸入，不從 LIST_NM 擷取 |
| 最佳產品 | PROD_BEST | 文字框，max 5 | 選填 |

### 系統管理欄位（表單完全不顯示）

- LIST_NO（自動產生，唯讀顯示於頁首）
- LIST_TYPE（固定 '01'，後端自動填入）
- PROJECT_WORKYM（當月，後端填入）
- STATUS（不在表單中，由停用流程管理）
- IS_ASSIGNED、ASSIGNED_DATE（月跑時回寫）
- TOTAL_AMOUNT、RESERVED_AMOUNT（月跑時計算回寫）
- CASENUMBER、NAME、CASEYEARNM（後端填入 NULL，已捨棄欄位）
- A_*、U_* audit 欄位（後端自動填入）

---

## 技術備註

- 資料來源：`reference/TableSchema/OB/OBMLISTDF.sql`（OBMLISTDF 表）
- 舊系統表單參照：`reference/Areas/OBZ/Views/OBZ020/edit.cshtml`、`reference/Areas/OBZ/Controllers/OBZ020/OBZ020Controller.cs`
- 代碼選項來源（PROD_KIND、CASEYEAR、SPEC_TP）：OBMCODEDF，由 US-092 進行維護
- **多值欄位與 `$$` 分隔格式（dump 驗證，2026-05-05）**：以下四個欄位均為多選，提交時以 `$$` 為分隔符儲存至 OBMLISTDF，與舊系統格式一致：
  - `PROD_KIND`：多選，例如 `02$$04$$05`（dump 實際觀察值）
  - `CASEYEAR`：多選，例如 `0$$1$$2$$3$$4$$5`
  - `SPEC_TP`：多選，例如 `02$$04$$05$$06$$11$$12`
  - `SETTLE_SRC`：多選，例如 `Y$$N`（含且不含）或 `Y`（僅含）
- 月跑中資料鎖判斷：查詢 AssignmentRun 是否有 status = 'running' 記錄
- 操作寫入 AssignmentAuditLog（待 system-architect 設計表結構）
- 覆寫式更新對齊 A12 決策：無草稿、無版本分岔；需追溯歷史請查詢 AssignmentAuditLog

> **[ASSUMPTION]** OBMLISTDF 多值欄位（PROD_KIND / CASEYEAR / SPEC_TP / SETTLE_SRC）均以 `$$` 分隔字串儲存，與舊系統格式一致（2026-05-05 dump 驗證）。表單元件對應為多選 CHKBOX，非單選下拉。

---

## 測試案例

### TC-089-01：正常儲存（必填欄位全填）

- **Given**：LIST_NO = 'OB202605011'，STATUS = 'active'，業務主管修改 LIST_NM 為「測試名單 A」、LIST_PERIOD_START = 1、LIST_PERIOD_END = 3
- **When**：業務主管點擊「儲存」
- **Then**：OBMLISTDF 對應列更新，LIST_NM = 「測試名單 A」，儲存成功後返回清單頁

### TC-089-02：已停用名單阻擋編輯

- **Given**：LIST_NO = 'OB202604001'，STATUS = 'inactive'
- **When**：業務主管嘗試直接訪問編輯 URL
- **Then**：系統返回 403 或跳轉清單頁，顯示提示「已停用名單不可編輯」

### TC-089-03：LIST_PERIOD_END 小於 START 驗證

- **Given**：業務主管填入 LIST_PERIOD_START = 6、LIST_PERIOD_END = 3
- **When**：欄位失去焦點
- **Then**：LIST_PERIOD_END 顯示紅色邊框，錯誤訊息「結束期數需大於等於開始期數」，儲存按鈕停用

---

## 依賴關係

- **Blocked By**：US-070（需先有名單定義清單入口）、US-092（PROD_KIND / CASEYEAR / SPEC_TP 代碼維護）
- **Blocks**：無（US-088 參照本 Story 的表單欄位規範）

---

## Definition of Done

- [ ] 驗收標準全部通過
- [ ] 必填欄位驗證測試
- [ ] LIST_PERIOD_END >= LIST_PERIOD_START 驗證測試
- [ ] 已停用名單阻擋編輯測試
- [ ] 月跑中資料鎖測試
- [ ] AssignmentAuditLog 寫入測試
- [ ] 單元測試覆蓋率 ≥ 80%
- [ ] Code review 通過
- [ ] 文件已更新

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **NFR**：[NFR-003](../../non-functional/NFR-003-assignment-execution-perf.md)
- **相關 Stories**：US-070（名單定義清單入口）、US-088（新增名單定義，共用表單欄位規範）、US-090（停用名單定義）、US-092（代碼維護）
- **Reference**：`reference/TableSchema/OB/OBMLISTDF.sql`、`reference/Areas/OBZ/Views/OBZ020/edit.cshtml`、`reference/Areas/OBZ/Controllers/OBZ020/OBZ020Controller.cs`
