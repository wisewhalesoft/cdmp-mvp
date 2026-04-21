# US-077：編輯部門比例設定

> **Story ID**：US-077
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M03 分派比例
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：5

---

## User Story

**As a** 業務主管
**I want** 調整各部門的名單分派比例
**So that** 在月跑前確保每個部門獲得符合其業務目標的客戶名單份額

---

## 驗收標準

### AC-1：修改部門比例

- **Given** 業務主管進入部門比例編輯模式
- **When** 業務主管修改某部門的比例值（數字輸入框）
- **Then** 頁面即時顯示所有部門比例的動態加總
- **And** 若加總 = 100%，儲存按鈕啟用；若加總 ≠ 100%，儲存按鈕停用並提示「比例加總為 N%，需調整至 100% 才能儲存」

### AC-2：儲存比例設定

- **Given** 所有部門比例加總 = 100%
- **When** 業務主管點擊儲存
- **Then** OBMDEPTPCT 中本月對應列更新，並記錄修改者與修改時間
- **And** 頁面顯示儲存成功提示，並切換回唯讀模式

### AC-3：比例輸入值驗證

- **Given** 業務主管在比例輸入框輸入值
- **When** 輸入的值為負數或超過 100
- **Then** 輸入框顯示紅色邊框與錯誤訊息「比例需介於 0 到 100 之間」

### AC-4：月跑執行中禁止修改

- **Given** 目前有月跑正在執行（status = 'running'）
- **When** 業務主管嘗試進入編輯模式
- **Then** 編輯按鈕為停用狀態，提示「分派執行中，無法修改比例設定」

---

## 技術備註

- 部門比例資料：`reference/TableSchema/OB/OBMDEPTPCT.sql`
- Stage 2 部門分配邏輯：`reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st2_dept.sql`（含 Motor 等特殊部門變體）
- 修改僅針對本月（當前 YM），不影響歷史資料
- 比例以百分比整數或小數點 1 位儲存（視 OBMDEPTPCT 欄位精度而定）

---

## 測試案例

### TC-077-01：動態加總顯示

- **Given**：5 個部門比例總和原為 100%
- **When**：業務主管將其中一個部門從 20% 改為 25%
- **Then**：頁面即時顯示加總 105%，儲存按鈕停用

### TC-077-02：儲存成功

- **Given**：業務主管調整後加總恰好為 100%
- **When**：點擊儲存
- **Then**：OBMDEPTPCT 更新，切換回唯讀模式，顯示成功提示

### TC-077-03：輸入負數驗證

- **Given**：業務主管在比例欄位輸入 -5
- **When**：失去焦點
- **Then**：紅色邊框，顯示「比例需介於 0 到 100 之間」

### TC-077-04：月跑執行中鎖定

- **Given**：AssignmentRun status = 'running'
- **When**：業務主管嘗試編輯
- **Then**：編輯按鈕停用，顯示鎖定提示

---

## 依賴關係

- **Blocked By**：US-076（查看現有設定）
- **Blocks**：US-081（月跑需要部門比例已設定正確）

---

## Definition of Done

- [ ] 驗收標準全部通過
- [ ] 動態加總驗證邏輯測試
- [ ] 月跑執行中鎖定測試
- [ ] 單元測試覆蓋率 ≥ 80%
- [ ] Code review 通過
- [ ] 文件已更新

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **NFR**：[NFR-005](../../non-functional/NFR-005-result-accuracy.md)
- **相關 Stories**：US-076（查看部門比例）、US-081（觸發月跑）
- **Reference**：`reference/TableSchema/OB/OBMDEPTPCT.sql`、`reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st2_dept.sql`
