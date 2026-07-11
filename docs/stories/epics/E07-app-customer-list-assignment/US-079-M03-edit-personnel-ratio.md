# US-079：編輯人員比例設定

> **[DEPRECATED — 已由 US-112 取代]**
> 本 Story 原設計以全域 M03 入口編輯人員比例，Actor 為「業務主管」（未區分處長/部長），且未整合五階段流程。
> **現行設計**：個別業務比例設定已整合至五階段流程第三階段（Stage 3 個別業務比例設定），由 **US-112**（處長設定本部門業務員比例）取代，角色收斂為處長（部長/Admin 可代操作）。
> **原文保留**：歷史參考用，請勿依本 Story 進行實作。spec-writer 需確保 F058（對應本 Story 的 spec）也標記為 DEPRECATED 並指向 US-112 對應 spec。
> 廢棄時間：2026-05-15（E07 重構 E~H 組）

---

> **Story ID**：US-079
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M03 分派比例
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：5

---

## User Story

**As a** 業務主管
**I want** 調整部門內各業務人員的名單分配比例
**So that** 根據人員異動（新進、離職、休假）或業務需求，靈活分配每月客戶名單

---

## 驗收標準

### AC-1：修改人員分配比例

- **Given** 業務主管進入人員比例編輯模式
- **When** 業務主管修改某員工的比例值
- **Then** 頁面即時顯示該部門內所有人員比例的動態加總
- **And** 若加總 = 100%，儲存按鈕啟用；若加總 ≠ 100%，儲存按鈕停用並提示

### AC-2：新增人員至分配清單

- **Given** 新員工已加入 OBEMPLSETMF 但尚未設定比例
- **When** 業務主管點擊「新增人員」，選擇員工並填入比例
- **Then** 新員工加入該部門的人員比例清單，頁面動態更新加總
- **And** 可選員工清單來源為 AppDB `ob_emphire`，僅顯示 RESIGN_DATE IS NULL 的在職員工（`ob_emphire` 透過 E04 通用擷取任務每日從 OB DB 同步，E07 直接查詢，不另行維護）

### AC-3：移除人員（設為 0%）

- **Given** 某員工本月不分配名單（如長期請假）
- **When** 業務主管將該員工比例設為 0%
- **Then** 系統允許儲存（0% 視為有效值），該員工本月不分到任何名單
- **And** 0% 人員仍顯示於清單，以便日後恢復

### AC-4：月名單分派執行中禁止修改

- **Given** 目前有月名單分派正在執行
- **When** 業務主管嘗試進入編輯模式
- **Then** 編輯按鈕停用，提示「分派執行中，無法修改比例設定」

---

## 技術備註

- 人員比例資料（業務員 RATION）：`reference/TableSchema/OB/OBEMPLSETMF.sql`
- Stage 4 人員分配邏輯：`reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st3_emplid.sql`（含 T5/T5M/Motor 等變體）
- 修改僅針對本月（當前 YM），不影響歷史資料
- **員工主檔資料來源**：AppDB `ob_emphire`（對應 OB DB OBEMPHIRE），透過 E04 通用擷取任務每日同步。在職員工過濾條件：`RESIGN_DATE IS NULL`。EMP_NM / DEPT_CODE / DEPT_NAME 等欄位直接從 `ob_emphire` join 取得，E07 不另建員工維護功能。
- **`OBEMPLSETMF.DEPTID_M` 尾隨空白**：原表 DEPTID_M 宣告為 VARCHAR(50)，但業務值為 4 字元部門代碼（dump 範例：`"XTC0                                              "`，46 個空白填充）。遷移腳本需對此欄位執行 `RTRIM` 處理；新系統寫入 `ob_empl_set.deptid_m` 應已為 trim 後的值（4 字元），查詢比對時不應有空白差異。

---

## 測試案例

### TC-079-01：動態加總更新

- **Given**：部門 A 3 名人員比例分別為 40%、35%、25%，加總 100%
- **When**：業務主管將第一名人員改為 50%
- **Then**：加總即時顯示 110%，儲存按鈕停用

### TC-079-02：儲存成功

- **Given**：業務主管調整後加總恰好 100%
- **When**：點擊儲存
- **Then**：OBEMPLSETMF 人員比例欄位更新，顯示成功提示

### TC-079-03：0% 人員儲存

- **Given**：員工 EMP002 設為 0%，其餘人員加總 100%
- **When**：儲存
- **Then**：儲存成功，EMP002 仍顯示於清單且比例為 0%

### TC-079-04：月名單分派執行中鎖定

- **Given**：AssignmentRun status = 'running'
- **When**：業務主管嘗試編輯
- **Then**：編輯按鈕停用，顯示鎖定提示

---

## 依賴關係

- **Blocked By**：US-078（查看人員比例設定）
- **Blocks**：US-081（月名單分派需要人員比例已設定正確）

---

## Definition of Done

- [ ] 驗收標準全部通過
- [ ] 動態加總驗證邏輯測試
- [ ] 0% 人員儲存測試
- [ ] 月名單分派執行中鎖定測試
- [ ] 單元測試覆蓋率 ≥ 80%
- [ ] Code review 通過
- [ ] 文件已更新

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **NFR**：[NFR-005](../../non-functional/NFR-005-result-accuracy.md)
- **相關 Stories**：US-078（查看人員比例）、US-081（觸發月名單分派）
- **Reference**：`reference/TableSchema/OB/OBEMPLSETMF.sql`、`reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st3_emplid.sql`
