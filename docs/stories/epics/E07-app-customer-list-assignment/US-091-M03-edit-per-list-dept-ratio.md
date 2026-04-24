# US-091：設定 per-LIST_NO 部門比例

> **Story ID**：US-091
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M03 分派比例
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：5

---

## User Story

**As a** 業務主管
**I want** 為特定名單（LIST_NO）設定各部門的分配比例（RATION）
**So that** 不同名單可依業務策略分配不同的部門比例

---

## 驗收標準

### AC-1：進入 per-LIST_NO 部門比例設定頁

- **Given** 業務主管在名單定義清單（US-070）中，選擇某個 STATUS = 'active' 的名單
- **When** 點擊「設定部門比例」入口（或在分派比例模組選擇特定 LIST_NO）
- **Then** 顯示該 LIST_NO 目前各部門的 RATION 設定（若尚未設定則顯示空值或 0）
- **And** 頁首清楚標示當前設定的名單：「名單：{LIST_NM}（{LIST_NO}）」

### AC-2：修改各部門比例並即時加總

- **Given** 業務主管在 per-LIST_NO 比例設定頁進入編輯模式
- **When** 業務主管修改某部門的 RATION 值（數字輸入框）
- **Then** 頁面即時顯示所有部門 RATION 的動態加總
- **And** 若加總 = 100%，儲存按鈕啟用；若加總 ≠ 100%，儲存按鈕停用並提示「比例加總為 N%，需調整至 100% 才能儲存」

### AC-3：儲存 per-LIST_NO 比例

- **Given** 所有部門 RATION 加總 = 100%
- **When** 業務主管點擊「儲存」
- **Then** 系統寫入或更新 per-LIST_NO 部門比例表（OBPCTLIST 或同等表，待 system-architect 確認）
- **And** audit 欄位由後端自動更新
- **And** 操作寫入 AssignmentAuditLog（action = 'update_per_list_ratio'）
- **And** 頁面顯示儲存成功提示，切換回唯讀模式

### AC-4：RATION 輸入值驗證

- **Given** 業務主管在 RATION 輸入框輸入值
- **When** 輸入的值為負數或超過 100
- **Then** 輸入框顯示紅色邊框與錯誤訊息「比例需介於 0 到 100 之間」

### AC-5：清除比例設定

- **Given** 業務主管在 per-LIST_NO 比例設定頁點擊「清除比例設定」按鈕
- **When** 確認對話框確認後執行
- **Then** 系統清空該 LIST_NO 所有部門的 RATION 設定（刪除或設為 NULL/0）
- **And** 頁面顯示提示「已清除 {LIST_NM}（{LIST_NO}）的所有部門比例設定」
- **And** 清除後，該 LIST_NO 在月跑時不套用任何部門比例設定，需由業務主管重新設定後再執行月跑

### AC-6：月跑執行中禁止修改

- **Given** 目前有 AssignmentRun status = 'running' 的月跑
- **When** 業務主管嘗試進入 per-LIST_NO 比例設定的編輯模式
- **Then** 編輯按鈕為停用狀態，提示「分派執行中，無法修改比例設定」

---

## 技術備註

### 資料表說明

本 Story（US-091）管理的是各 LIST_NO 的部門比例設定，對應 OBMDEPTPCT（AppDB 遷移後為 `ob_dept_pct`，待 system-architect 確認映射）。每個 LIST_NO 各自擁有一組部門比例設定，各自須加總為 100%。

- 部門比例表對應舊系統 OBZ020 M 區（per-LIST_NO 設定），schema 由 system-architect 確認
- 月跑邏輯：Stage 2 部門分配時，讀取對應 LIST_NO 的部門比例設定；若該 LIST_NO 無設定，月跑前置條件驗證（US-081 AC-1）將阻擋執行
- 「清除比例設定」後的行為需在月跑邏輯（US-081）中處理
- AssignmentAuditLog 寫入（待 system-architect 設計表結構）
- 月跑中資料鎖判斷：查詢 AssignmentRun 是否有 status = 'running' 記錄

---

## 測試案例

### TC-091-01：正常儲存 per-LIST_NO 比例

- **Given**：LIST_NO = 'OB202605001'，有 5 個部門，業務主管設定各部門 RATION 加總 = 100%
- **When**：業務主管點擊「儲存」
- **Then**：per-LIST_NO 部門比例表寫入 5 筆記錄，AssignmentAuditLog 新增 action = 'update_per_list_ratio'

### TC-091-02：加總不等於 100% 阻擋儲存

- **Given**：業務主管設定 4 個部門 RATION 加總為 95%
- **When**：頁面即時加總計算
- **Then**：顯示「比例加總為 95%，需調整至 100% 才能儲存」，儲存按鈕停用

### TC-091-03：清除比例設定

- **Given**：LIST_NO = 'OB202605001' 已有 per-LIST_NO 比例設定
- **When**：業務主管點擊「清除比例設定」並確認
- **Then**：該 LIST_NO 所有部門 RATION 被清除，頁面顯示清除成功提示

---

## 依賴關係

- **Blocked By**：US-070（需先有名單定義才有 LIST_NO 可設定）、US-088（新增名單後才能為其設定比例）
- **Blocks**：US-081（月跑 Stage 2 需讀取各 LIST_NO 的部門比例；月跑前置條件驗證每個 active LIST_NO 均有部門比例設定）

---

## Definition of Done

- [ ] 驗收標準全部通過
- [ ] 動態加總驗證邏輯測試
- [ ] RATION 輸入範圍驗證測試（0~100）
- [ ] 清除比例設定測試（全部清空）
- [ ] 月跑中資料鎖測試
- [ ] AssignmentAuditLog 寫入測試
- [ ] 各 LIST_NO 比例設定互不干擾測試
- [ ] 單元測試覆蓋率 ≥ 80%
- [ ] Code review 通過
- [ ] 文件已更新

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **NFR**：[NFR-005](../../non-functional/NFR-005-result-accuracy.md)
- **相關 Stories**：US-070（名單定義清單，入口）、US-081（月跑 Stage 2 使用 per-LIST_NO 比例）
- **Reference**：`reference/TableSchema/OB/OBMLISTDF.sql`、`reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st2_dept.sql`（Stage 2 部門分配邏輯）
