# US-109：部門比例設定（各部門分配比例）

> **Story ID**：US-109
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M03a 部門比例設定階段
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：5
> **取代**：US-091（已廢棄）

---

## User Story

**As a** 部長（Director）或 Admin
**I want** 在名單進入「部門比例設定」階段後，為每份名單設定各部門的分配比例（RATION），使各部門比例加總 = 100%
**So that** 系統在月名單分派時能正確依部門比例分配案件，每份名單可有獨立的部門策略

---

## 背景說明

本 Story 為五階段流程（US-105）第二階段「部門比例設定（dept_ratio）」的核心操作。

名單從草稿推進至此階段後（US-108），由部長或 Admin 設定每個部門的 RATION。

**設計要點**：
- 每份名單（LIST_NO）各自有獨立的部門比例設定（per-LIST_NO）
- 部門清單來源：AppDB `ob_emphire`（DEPT_CODE / DEPT_NAME，取在職員工的不重複部門）
- 各部門比例（RATION）加總必須 = 100%，方可儲存
- 輸入值需介於 0 ~ 100（整數或最多兩位小數），且 RATION = 0 視為有效值（表示該部門本月不分派）
- 本 Story 取代 US-091（舊版 M03 全域入口，已廢棄）

**處長可見性**：處長對部門比例設定頁面**完全無操作權限**（不顯示操作按鈕，無法存取），詳見 US-101 AC-5。

---

## 驗收標準

### AC-1：部門比例設定頁面入口（在五階段清單中）

- **Given** 部長或 Admin 在 M01 名單五階段總覽（US-105）查看某份 `stage = 'dept_ratio'` 的名單
- **When** 頁面顯示該名單的操作欄
- **Then** 顯示「設定部門比例」按鈕，進入 per-LIST_NO 部門比例設定頁
- **And** 頁首清楚標示：「名單：{LIST_NM}（{LIST_NO}）— 部門比例設定」
- **And** 處長帳號在相同頁面**不顯示「設定部門比例」入口**

### AC-2：顯示部門清單與現有比例

- **Given** 部長或 Admin 進入某份名單的部門比例設定頁
- **When** 頁面載入
- **Then** 顯示所有在職員工所屬的不重複部門清單（DEPT_CODE + DEPT_NAME，來源 `ob_emphire` WHERE `resign_date IS NULL`）
- **And** 若該名單已有既有部門比例設定，顯示現有 RATION 值；若尚未設定，顯示空值或 0

### AC-3：修改各部門比例並即時加總

- **Given** 部長或 Admin 在部門比例設定頁進入編輯模式
- **When** 修改某部門的 RATION 值（數字輸入框）
- **Then** 頁面即時顯示所有部門 RATION 的動態加總
- **And** 若加總 = 100%，「儲存」按鈕啟用
- **And** 若加總 ≠ 100%，「儲存」按鈕停用，並顯示提示「目前加總為 N%，需調整至 100% 才能儲存」

### AC-4：RATION 輸入值驗證

- **Given** 部長或 Admin 在 RATION 輸入框輸入值
- **When** 輸入的值為負數（< 0）或超過 100（> 100）
- **Then** 輸入框顯示錯誤提示「比例需介於 0 到 100 之間」，儲存按鈕停用

### AC-5：儲存成功

- **Given** 所有部門 RATION 加總 = 100%
- **When** 部長或 Admin 點擊「儲存」
- **Then** 系統寫入 `ob_dept_pct`（per-LIST_NO 部門比例表，對應 OBMDEPTPCT）
- **And** 操作寫入 `assignment_audit_log`（action = 'SET_DEPT_RATIO'，entity_type = 'list_definition'，LIST_NO 記錄於 entity_id）
- **And** 頁面顯示成功提示「名單『{LIST_NM}』部門比例設定已儲存」，切換回唯讀模式

### AC-6：RATION = 0 視為有效值

- **Given** 部長或 Admin 將某部門 RATION 設為 0%，其他部門加總 = 100%
- **When** 點擊儲存
- **Then** 系統允許儲存（0% 表示該部門本月不分派名單）
- **And** 0% 部門仍顯示於清單中，以便日後調整

### AC-7：部長不可見處長的比例操作（處長無此頁面權限）

- **Given** 帳號持有「處長」角色
- **When** 嘗試存取部門比例設定頁或呼叫寫入 API
- **Then** 後端回傳 403 Forbidden；前端在 US-105 清單中不顯示「設定部門比例」按鈕

### AC-8：月名單分派執行中禁止設定

- **Given** 目前有 AssignmentRun status = 'running' 的月名單分派
- **When** 部長或 Admin 嘗試進入部門比例設定的編輯模式
- **Then** 編輯按鈕為停用狀態，hover 顯示提示「分派執行中，無法修改比例設定」

---

## 技術備註

- 部門比例資料表：`ob_dept_pct`（對應 OBMDEPTPCT，按 LIST_NO + DEPT_CODE 作為複合鍵）；schema 由 system-architect 確認
- 部門清單來源：查詢 `ob_emphire` WHERE `resign_date IS NULL`，取不重複的 `(dept_code, dept_name)` 組合，依 dept_code 排序
- 本 Story 設定的資料由 US-110（部門比例設定階段推進至個別業務比例）驗證後才能推進
- 月名單分派中資料鎖判斷：查詢 `assignment_run` 是否有 status = 'running' 記錄
- **[通知 spec-writer]**：本 Story 取代 F060（US-091 對應），請將 F060 標記 DEPRECATED 並新增對應本 Story 的 Feature spec

---

## 測試案例

### TC-109-01：正常儲存部門比例（5 部門）

- **Given**：LIST_NO = 'OB202506001'，stage = 'dept_ratio'；系統有 5 個在職部門（XTC0/XTD0/XTE0/XTF0/XTG0）；部長帳號
- **When**：部長設定各部門 RATION 分別為 30%/25%/20%/15%/10%（加總 100%），點擊「儲存」
- **Then**：`ob_dept_pct` 寫入 5 筆記錄；稽核日誌新增 action = 'SET_DEPT_RATIO'；頁面顯示成功提示

### TC-109-02：加總不等於 100% 阻擋儲存

- **Given**：部長設定 4 個部門 RATION 加總為 95%，第 5 部門尚未設定
- **When**：頁面即時加總計算
- **Then**：顯示「目前加總為 95%，需調整至 100% 才能儲存」，儲存按鈕停用

### TC-109-03：RATION = 0 部門可儲存

- **Given**：部長將部門 XTG0 設為 0%，其餘 4 部門加總 100%
- **When**：點擊「儲存」
- **Then**：儲存成功；XTG0 仍顯示於清單，RATION 為 0%

### TC-109-04：負值輸入被阻擋

- **Given**：部長在 RATION 輸入框輸入 -5
- **When**：輸入框驗證
- **Then**：顯示「比例需介於 0 到 100 之間」；儲存按鈕停用

### TC-109-05：處長帳號無此頁面操作權限

- **Given**：帳號持有「處長」角色
- **When**：在 US-105 清單查看 stage = 'dept_ratio' 的名單
- **Then**：不顯示「設定部門比例」按鈕；直接呼叫 API 回 403

### TC-109-06：月名單分派中禁止編輯

- **Given**：AssignmentRun status = 'running'
- **When**：部長嘗試進入部門比例設定編輯模式
- **Then**：編輯按鈕停用，顯示「分派執行中，無法修改比例設定」

---

## 依賴關係

- **Blocked By**：US-108（草稿推進至部門比例設定，才有 stage = 'dept_ratio' 名單）、US-100（部長角色定義）、US-101（處長角色定義，確立無操作權限）
- **Blocks**：US-110（部門比例設定階段推進至個別業務比例，需先完成本 Story）
- **Rollback 反向**：US-111（部門比例設定階段 Rollback 至草稿，可清空本 Story 設定的比例資料）

---

## Definition of Done

- [ ] 驗收標準全部通過
- [ ] 正常儲存測試（TC-109-01）
- [ ] 加總不等於 100% 阻擋測試（TC-109-02）
- [ ] RATION = 0 儲存測試（TC-109-03）
- [ ] 負值輸入阻擋測試（TC-109-04）
- [ ] 處長無操作權限測試（TC-109-05）
- [ ] 月名單分派中鎖定測試（TC-109-06）
- [ ] AssignmentAuditLog 寫入測試
- [ ] 單元測試覆蓋率 ≥ 80%
- [ ] Code review 通過
- [ ] 文件已更新

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **取代**：US-091（已廢棄）
- **相關 Stories**：US-105（五階段總覽，操作入口）、US-108（草稿推進至此階段）、US-110（此階段推進至個別業務比例）、US-111（Rollback 至草稿）、US-100（部長角色定義）、US-101（處長角色定義）
