# US-110：部門比例設定階段推進至個別業務比例設定

> **Story ID**：US-110
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M03a 部門比例設定階段
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：3

---

## User Story

**As a** 部長（Director）或 Admin
**I want** 在確認各部門比例設定正確後，將名單推進至「個別業務比例設定」階段
**So that** 流程正式進入第三階段，各處長可為本部門業務員設定個別分配比例

---

## 背景說明

本 Story 是五階段流程（US-105）中，從「部門比例設定（Stage 2 / `dept_ratio`）」推進至「個別業務比例設定（Stage 3 / `personnel_ratio`）」的操作節點。

推進前提：
1. 名單目前為部門比例設定階段（`stage = 'dept_ratio'`）
2. 所有部門 RATION 加總 = 100%（US-109 已完成設定）
3. 部長或 Admin 主動確認推進

推進後：
- 名單 `stage` 更新為 `'personnel_ratio'`（個別業務比例設定階段）
- 部門比例鎖定，不可再修改（進入唯讀）
- 下一步操作由「個別業務比例設定」群組（F 組，US-112~115）接手

---

## 驗收標準

### AC-1：部門比例設定階段名單顯示「推進」按鈕

- **Given** 部長或 Admin 在 M01 名單五階段總覽（US-105）查看某個 `stage = 'dept_ratio'` 的名單
- **When** 頁面顯示操作欄
- **Then** 顯示「推進至個別業務比例設定」按鈕
- **And** 處長帳號在相同頁面**不顯示「推進」按鈕**

### AC-2：推進前置條件驗證（比例總和 = 100%）

- **Given** 部長或 Admin 點擊「推進至個別業務比例設定」按鈕
- **When** 系統進行前置條件驗證
- **Then** 若該名單的部門 RATION 加總 ≠ 100%（或尚未設定任何部門比例），系統顯示錯誤「請先確認各部門比例加總為 100%，再推進」，不執行推進
- **And** 前置條件通過後，彈出確認對話框

### AC-3：確認推進對話框

- **Given** 前置條件驗證通過
- **When** 系統彈出確認對話框
- **Then** 對話框顯示：「確認將名單『{LIST_NM}』（{LIST_NO}）推進至個別業務比例設定階段？推進後部門比例將鎖定，無法再修改（如需修改請先 Rollback）。」
- **And** 對話框提供「確認推進」與「取消」兩個按鈕

### AC-4：執行推進

- **Given** 部長或 Admin 在確認對話框點擊「確認推進」
- **When** 後端處理推進請求
- **Then** 系統將名單的 `stage` 從 'dept_ratio' 更新為 'personnel_ratio'
- **And** 部門比例欄位鎖定（後端依 stage 判斷，若 stage != 'dept_ratio' 則拒絕部門比例寫入 API）
- **And** 操作寫入 `assignment_audit_log`（action = 'ADVANCE_STAGE'，after_payload 含 stage = 'personnel_ratio'）
- **And** 頁面成功提示「名單『{LIST_NM}』已推進至個別業務比例設定階段」，清單刷新

### AC-5：推進後部門比例不可修改

- **Given** 名單 `stage = 'personnel_ratio'`
- **When** 部長或 Admin 進入名單的部門比例設定頁查看
- **Then** 頁面顯示部門比例（唯讀），無任何「編輯」「儲存」控件
- **And** 若透過 API 嘗試修改部門比例，後端回 422（「只有部門比例設定階段才能修改部門比例」）

### AC-6：月名單分派執行中禁止推進

- **Given** 目前有 AssignmentRun status = 'running' 的月名單分派
- **When** 部長或 Admin 嘗試點擊「推進」按鈕
- **Then** 推進按鈕為停用狀態，hover 顯示提示「分派執行中，無法推進」

---

## 技術備註

- `stage` 欄位更新：`ob_list_definition.stage = 'personnel_ratio'`（從 'dept_ratio'）
- 「部門比例鎖定」實作：後端依 stage 判斷；前端依 stage 決定是否顯示編輯控件
- 推進後下一步操作（個別業務比例設定）由 F 組 Story（US-112~115）定義

---

## 測試案例

### TC-110-01：部門比例加總 = 100% 正常推進

- **Given**：LIST_NO = 'OB202506001'，stage = 'dept_ratio'，部門比例已設定加總 100%；部長帳號
- **When**：部長點擊「推進」→ 確認 → 點擊「確認推進」
- **Then**：`stage` 更新為 'personnel_ratio'；稽核日誌新增 ADVANCE_STAGE 記錄；清單階段標籤更新

### TC-110-02：部門比例未設定或加總 ≠ 100% 時推進被阻擋

- **Given**：LIST_NO = 'OB202506002'，stage = 'dept_ratio'，部門比例加總 = 80%
- **When**：部長點擊「推進至個別業務比例設定」
- **Then**：顯示「請先確認各部門比例加總為 100%，再推進」；stage 不更新

### TC-110-03：處長無法推進

- **Given**：帳號持有「處長」角色；LIST_NO = 'OB202506001'，stage = 'dept_ratio'
- **When**：處長嘗試呼叫推進 API
- **Then**：後端回 403 Forbidden；清單頁無「推進」按鈕

### TC-110-04：推進後部門比例鎖定

- **Given**：LIST_NO = 'OB202506001'，stage = 'personnel_ratio'
- **When**：部長嘗試呼叫修改部門比例 API
- **Then**：後端回 422「只有部門比例設定階段才能修改部門比例」

---

## 依賴關係

- **Blocked By**：US-109（部門比例設定，加總 = 100% 才可推進）、US-100（部長角色定義）
- **Blocks**：US-112（個別業務比例設定，推進後才能設定）
- **Rollback 反向**：US-115（個別業務比例設定階段 Rollback 至部門比例，可退回本 Story 推進的操作）

---

## Definition of Done

- [ ] 驗收標準全部通過
- [ ] 加總 = 100% 正常推進測試（TC-110-01）
- [ ] 加總 ≠ 100% 阻擋推進測試（TC-110-02）
- [ ] 處長被拒測試（TC-110-03）
- [ ] 推進後部門比例鎖定測試（TC-110-04）
- [ ] AssignmentAuditLog 寫入測試
- [ ] 單元測試覆蓋率 ≥ 80%
- [ ] Code review 通過
- [ ] 文件已更新

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **相關 Stories**：US-105（五階段總覽）、US-109（部門比例設定）、US-111（Rollback 至草稿）、US-112（個別業務比例設定）、US-115（F 組 Rollback 至部門比例）
