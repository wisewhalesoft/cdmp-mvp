# US-111：部門比例設定階段 Rollback 至草稿

> **Story ID**：US-111
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M03a 部門比例設定階段
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：3

---

## User Story

**As a** 部長（Director）或 Admin
**I want** 將一份處於「部門比例設定」階段的名單退回至「草稿」階段
**So that** 當部門比例或篩選條件需要重新調整時，能以「退回（Rollback）」而非「取消」的方式重啟編輯，避免資料混亂

---

## 背景說明

本 Story 實作五階段流程（US-105）中，「部門比例設定（Stage 2 / `dept_ratio`）」退回至「草稿（Stage 1 / `draft`）」的 Rollback 機制。

**Rollback 語意（OQ-C-02 確認）**：
- Rollback 是「退回（回到上一階段）」，**非「取消（刪除）」**
- 退回後，名單重回草稿階段，篩選條件與 CR 開關恢復可編輯
- **清空本階段資料**：所有已設定的部門比例（RATION）清空
- 草稿（Stage 1）為「第一階段，不可 Rollback」，本 Story 退回至草稿是終點，草稿本身不提供 Rollback
- 部長或 Admin 需再次確認才能執行 Rollback，防止誤操作

---

## 驗收標準

### AC-1：部門比例設定階段顯示「退回草稿」按鈕

- **Given** 部長或 Admin 在 M01 名單五階段總覽（US-105）查看某個 `stage = 'dept_ratio'` 的名單
- **When** 頁面顯示操作欄
- **Then** 顯示「退回草稿」按鈕（或「Rollback」等等效文字）
- **And** 處長帳號**不顯示「退回草稿」按鈕**

### AC-2：Rollback 確認對話框

- **Given** 部長或 Admin 點擊「退回草稿」按鈕
- **When** 系統彈出確認對話框
- **Then** 對話框顯示：「確認將名單『{LIST_NM}』（{LIST_NO}）退回草稿階段？退回後，已設定的**部門比例資料將全部清空**，篩選條件將重新開放編輯。」
- **And** 對話框提供「確認退回」與「取消」兩個按鈕

### AC-3：執行 Rollback

- **Given** 部長或 Admin 在確認對話框點擊「確認退回」
- **When** 後端處理 Rollback 請求
- **Then** 系統將名單的 `stage` 從 'dept_ratio' 更新為 'draft'
- **And** 清空該 LIST_NO 的所有部門比例資料（`ob_dept_pct` 中對應 LIST_NO 的所有記錄刪除或設為 NULL）
- **And** 篩選條件欄位解鎖（可再度編輯，CR 回分開關亦解鎖）
- **And** 操作寫入 `assignment_audit_log`（action = 'ROLLBACK_STAGE'，before_payload 含 stage = 'dept_ratio'，after_payload 含 stage = 'draft'）
- **And** 頁面成功提示「名單『{LIST_NM}』已退回草稿階段，部門比例已清空」，清單刷新

### AC-4：Rollback 後名單重回草稿狀態可編輯

- **Given** 名單已執行 Rollback 至 'draft'
- **When** 部長或 Admin 在清單頁（US-105）查看該名單
- **Then** 名單階段標籤顯示「草稿」
- **And** 可再次編輯篩選條件（US-106 的操作再度開放）
- **And** CR 回分開關可再度修改（US-107 的操作再度開放）
- **And** 「部門比例設定」頁面顯示空值（比例已清空）

### AC-5：月跑執行中禁止 Rollback

- **Given** 目前有 AssignmentRun status = 'running' 的月跑
- **When** 部長或 Admin 嘗試點擊「退回草稿」按鈕
- **Then** 按鈕為停用狀態，hover 顯示提示「分派執行中，無法退回階段」

### AC-6：Rollback 不影響其他名單

- **Given** 本月有多份名單（LIST_NO_A 在 dept_ratio、LIST_NO_B 在 personnel_ratio）
- **When** 部長對 LIST_NO_A 執行 Rollback
- **Then** 僅 LIST_NO_A 退回至草稿，LIST_NO_B 狀態不受影響

---

## 技術備註

- `stage` 欄位更新：`ob_list_definition.stage = 'draft'`（從 'dept_ratio'）
- 清空部門比例：`DELETE FROM ob_dept_pct WHERE list_no = {LIST_NO}`
- 解鎖篩選條件：後端依 stage = 'draft' 判斷允許篩選條件寫入 API
- Rollback 操作的 `assignment_audit_log` 需記錄 before/after stage 以供追溯
- 月跑中資料鎖判斷：查詢 `assignment_run` 是否有 status = 'running' 記錄

---

## 測試案例

### TC-111-01：正常 Rollback 至草稿

- **Given**：LIST_NO = 'OB202506001'，stage = 'dept_ratio'，已有部門比例設定（3 筆）；部長帳號
- **When**：部長點擊「退回草稿」→ 確認對話框 → 點擊「確認退回」
- **Then**：`stage` 更新為 'draft'；`ob_dept_pct` 中 LIST_NO = 'OB202506001' 的 3 筆比例記錄被清空；稽核日誌新增 ROLLBACK_STAGE；清單階段標籤更新為「草稿」

### TC-111-02：Rollback 後篩選條件可再度編輯

- **Given**：LIST_NO = 'OB202506001' 已執行 Rollback 至 'draft'
- **When**：部長進入名單詳情頁，嘗試修改篩選條件
- **Then**：篩選條件編輯控件顯示，修改後可儲存

### TC-111-03：處長無法執行 Rollback

- **Given**：帳號持有「處長」角色
- **When**：嘗試呼叫 Rollback API
- **Then**：後端回 403 Forbidden；清單頁無「退回草稿」按鈕

### TC-111-04：月跑中禁止 Rollback

- **Given**：AssignmentRun status = 'running'；LIST_NO = 'OB202506001'，stage = 'dept_ratio'
- **When**：部長嘗試點擊「退回草稿」
- **Then**：按鈕停用，顯示「分派執行中，無法退回階段」

### TC-111-05：Rollback 僅影響指定名單

- **Given**：LIST_NO_A（dept_ratio）、LIST_NO_B（personnel_ratio）同月份存在
- **When**：部長對 LIST_NO_A 執行 Rollback
- **Then**：LIST_NO_A → draft，LIST_NO_B 仍為 personnel_ratio，無異動

---

## 依賴關係

- **Blocked By**：US-109（部門比例設定，退回時清空此 Story 產生的資料）、US-108（推進至部門比例，Rollback 此操作）、US-100（部長角色定義）
- **Blocks**：（退回草稿後，US-106 草稿編輯操作重新開放）
- **與 US-090 關聯**：退回至草稿後，草稿名單可由 US-090 執行停用

---

## Definition of Done

- [ ] 驗收標準全部通過
- [ ] 正常 Rollback 測試（TC-111-01）
- [ ] Rollback 後篩選條件可編輯測試（TC-111-02）
- [ ] 處長被拒測試（TC-111-03）
- [ ] 月跑中禁止 Rollback 測試（TC-111-04）
- [ ] Rollback 僅影響指定名單測試（TC-111-05）
- [ ] AssignmentAuditLog 寫入（before/after stage）測試
- [ ] 部門比例清空驗證測試
- [ ] 單元測試覆蓋率 ≥ 80%
- [ ] Code review 通過
- [ ] 文件已更新

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **相關 Stories**：US-105（五階段總覽，退回入口）、US-108（草稿推進至部門比例，Rollback 的逆操作）、US-109（部門比例設定，清空其資料）、US-090（停用草稿名單，退回後可執行）
